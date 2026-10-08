import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { expect, test as base, type Download, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { BREAKEVEN_MER_VERSION } from "../../src/application/breakeven-mer";
import { channelsLabel } from "../../src/application/copy";
import { formatSavedDateTime } from "../../src/application/auto-save";
import { formatAmountL1, formatAmountL2, formatDateL1, formatMultiple, formatPeriodExport, formatSignedDelta } from "../../src/application/presentation";
import { decisionSignature } from "../../src/application/decision";
import { acceptSavePrompt, clearButton, clickReplacing, closeDownloads, closeStorage as closeStorageMenu, closeTopbarMore, dismissSavePrompt, isMobile, navControl, navigateTo, openDownloads, openMeeting, openMobileMore, openStorage as openStorageMenu, openValidation, sidebarNav, startChannelContext, switchActionsView } from "./replacement-helpers";
import { acceptAssumptions, actionDrawer } from "./actions-helpers-v3";
import { exportPeriodLine, exportReportTitle, exportVersionLineRe, expectExportHeader, MEETING_EXPORTS, meetingExportItem, openCompare, openMeetingExport, type ExportHeaderExpectation } from "./meeting-helpers-v3";
import { expectMeetingHistoryEmpty, expectMeetingNoScenario, goToScenariosFromMeeting } from "./misc-helpers-v38";
import { GOLDEN_BREAKEVEN, markdownAssistSection, markdownBreakevenRow, markdownBreakevenVersion, markdownTechnicalLines } from "./breakeven-helpers-v39";
import { EXPORT_VARIANTS, STANDARD_SHEETS, summaryExportItems, variantPicker } from "./variant-helpers-v39";

// R6（05 §10–§12、02 §8）：會議紀錄分頁（結束會議、會議歷史、上次會議比較）、備份 v4 的 meeting_history、Excel／PPT／PDF 匯出、首次保存提示與自動保存、總覽一行入口與八個分頁。
// 金額一律用 golden 手算（fixtures/golden，上期 2026-08-01、本期 2026-08-02）：
//   合計淨營收：上期 2,250.00 → 本期 2,470.00；合計扣廣告後貢獻：上期 570.00 → 本期 255.00。
//   本期 DTC：淨營收 1120+360＝1480；商品毛利 540+200＝740；通路費 0+44+140+16＝200；廣告 270 → 扣廣告後貢獻 270.00（「維持現況」範本＝五格 0，試算結果 270.00、與現況相比 0.00）。
//   三件事（門檻 0）依 |對貢獻影響|：扣廣告後貢獻 570→255（−315.00）、折扣 200→450（−250.00）、廣告 300→450（−150.00）。
//   同一份資料、同一個範圍結束會議後，新會議稿與上次會議的本期數字相同：上次會議比較的差額都是 0.00（2,470.00 − 2,470.00；255.00 − 255.00）。

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use) => {
    const events: string[] = [];
    page.on("pageerror", error => events.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") events.push(`console:${message.text()}`); });
    page.on("dialog", dialog => { events.push(`dialog:${dialog.type()}`); void dialog.dismiss(); });
    await use(events);
    expect(events).toEqual([]);
  }, { auto: true }],
});

const meetingPage = labels.meeting.page;
/** V3-4a：總覽會議入口的字串搬到本期一句話區塊（labels.overview.snapshotUi）。 */
const entryUi = labels.overview.snapshotUi;
const record = labels.meeting.record;
const review = labels.meeting.review;
const store = labels.storage.workspace;
const auto = labels.storage.autoSave;
const DATABASE = "profitlens-opt-in-workspace-v1";
const navIds = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "validation"] as const;

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 模板 → RegExp 原始碼：values 內的占位符照填（逸出），其他占位符用 pattern（預設任意文字）。 */
const templateSource = (template: string, values: Record<string, string> = {}, patterns: Record<string, string> = {}) => escapeRe(template).replace(/\\\{(\w+)\\\}/g, (_, key: string) => key in values ? escapeRe(values[key]) : patterns[key] ?? ".+?");
/** 整段文字符合模板。 */
const templateRe = (...args: Parameters<typeof templateSource>) => new RegExp(`^${templateSource(...args)}$`);
/** 文字中含有符合模板的片段（給 toContainText）。 */
const templateIn = (...args: Parameters<typeof templateSource>) => new RegExp(templateSource(...args));
/** 臺北日曆日 YYYY-MM-DD（會議日期預設值；與 app 的 taipeiToday() 同一個時區）。 */
const taipeiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
/** V3-3 側欄分組（D-V3-14＝A：頁面順序維持 v2，只加組標題；開發者組只在 #validation 出現）。依序串起來就是 navIds。 */
const navGroups = [["results", ["overview"]], ["causes", ["diagnosis", "products"]], ["decisions", ["scenarios", "actions", "meeting"]], ["data", ["data"]], ["developer", ["validation"]]] as const;
/** V3-3 手機：底部分頁列前四格（第五格是「更多」），其餘四頁在「更多」面板。 */
const tabIds = ["overview", "diagnosis", "actions", "meeting"] as const;
const moreIds = ["products", "scenarios", "data", "validation"] as const;
const status = (page: Page) => page.getByTestId("workspace-status");
const outputDir = (...parts: string[]) => resolve("verification/revamp-R6", ...parts);
const defaultMeetingName = labels.meeting.session.defaultName;
const firstPlanName = fill(labels.scenarios.decision.defaultPlanName, { n: 1 });
const summaryCopy = labels.meeting.managerSummary;
/** V3-7：會議頁文件式版面（labels.meeting.pageV3）、匯出版頭四行（labels.exports.headerV3）、頂欄「匯出」選單的說明行（labels.exports.menuV3）。 */
const pageV3 = labels.meeting.pageV3;
const headerV3 = labels.exports.headerV3;
const menuV3 = labels.exports.menuV3;
/** golden 的資料日（fixtures/golden/manifest.json 的 data_as_of）。 */
const GOLDEN_AS_OF = "2026-08-03";
/** V3-2a：status.ready 帶 {date}＝資料集 manifest 的 data_as_of（demo 為 2026-08-24）。 */
const DATA_AS_OF = { golden: GOLDEN_AS_OF, demo: "2026-08-24" } as const;
const ready = (id: keyof typeof DATA_AS_OF) => fill(labels.shell.status.ready, { date: DATA_AS_OF[id] });
/** V3-7 §7.9 匯出版頭（golden）：第 1 行是畫面上的資料集名稱（不是 dataset_id golden-v1）；上期 2026-08-01、本期 2026-08-02（各 1 天），未稅。 */
const GOLDEN_HEADER: ExportHeaderExpectation = { datasetName: labels.shell.devValidation.datasets.golden, previous: { start: "2026-08-01", end: "2026-08-01" }, current: { start: "2026-08-02", end: "2026-08-02" } };
/** Markdown 開頭：第 1 行「# 標題」、第 2 行空白，第 3–6 行是版頭四行，第 7 行空白。 */
const markdownHeader = (markdown: string) => markdown.split("\n").slice(2, 6);
/** Excel 工作表表頭列裡某欄的位置：金額欄的表頭是「{label}（元）」（labels.exports.common.moneyColumn），其他欄就是 label。 */
const excelColumn = (header: unknown[], label: string) => header.findIndex(cell => cell === label || cell === fill(labels.exports.common.moneyColumn, { label }));
/** V3-9a F12：Markdown「其他常用指標」表最後一列是損益兩平 MER（golden L1），技術細節緊接在輔助指標版本之後是 breakeven_mer_version。 */
function expectMarkdownBreakeven(markdown: string) {
  expect(markdownAssistSection(markdown).filter(line => line.startsWith("| ")).at(-1)).toBe(markdownBreakevenRow(GOLDEN_BREAKEVEN.previous, GOLDEN_BREAKEVEN.current));
  const technical = markdownTechnicalLines(markdown);
  expect(technical[technical.findIndex(line => line.startsWith(`- ${labels.assist.technicalVersion}：`)) + 1]).toBe(markdownBreakevenVersion);
}
/** A4 PDF 的頁數（/Type /Page，不含 /Pages）。 */
const pdfPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
/** 「採用（第 n 版確認）」：版號是會議稿的修訂次數，只要求是數字。 */
const confirmedRe = (decision: keyof typeof labels.meeting.form.decisions) => escapeRe(fill(record.decisionConfirmed, { decision: labels.meeting.form.decisions[decision], revision: "§" })).replace("§", "\\d+");
const historyTitle = (name: string, date: string, decision: keyof typeof labels.meeting.form.decisions) => templateRe(meetingPage.historyItem, { name, date }, { decision: confirmedRe(decision) });
/** pptx 是 zip；SheetJS 內建的 CFB 也能讀 zip（只用來解析下載的產物）。回傳每張投影片的 XML。 */
type Zip = { FullPaths: string[] };
const zip = XLSX.CFB as { read(data: Buffer, options: { type: "buffer" }): Zip; find(container: Zip, path: string): { content: Uint8Array | number[] } | null };
function slideXml(bytes: Buffer): string[] {
  const deck = zip.read(bytes, { type: "buffer" });
  return deck.FullPaths.filter(path => /ppt\/slides\/slide\d+\.xml$/.test(path)).map(path => Buffer.from(zip.find(deck, path)!.content).toString("utf8"));
}

async function loadDataset(page: Page, id: "golden" | "demo") {
  if (page.url() === "about:blank") await page.goto("/");
  await openValidation(page);
  await page.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }));
  await expect(status(page)).toContainText(ready(id));
}
/** 首次載入（或清空、從備份恢復）後一定會出現保存提示：等它出現再按「先不要」。V3-3 手機：展開中的「更多」（頂欄工具列＋底部頁面面板）疊在非 modal 的提示之上，先收起再回應。 */
async function declineSavePrompt(page: Page) {
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await closeTopbarMore(page);
  await prompt.getByRole("button", { name: auto.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
}
/** V3-3：儲存選單在頂欄（手機收在 topbar-more，共用 helper 會先展開）。 */
async function openStorage(page: Page) {
  const menu = await openStorageMenu(page);
  await expect(menu).toHaveAttribute("open", "");
  return menu;
}
async function closeStorage(page: Page) {
  await closeStorageMenu(page);
  await expect(page.getByTestId("workspace-storage")).not.toHaveAttribute("open", "");
}
async function downloadFrom(page: Page, button: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const event = page.waitForEvent("download");
  await button.click();
  const download = await event;
  return { download, bytes: await readFile((await download.path())!) };
}
/** 試算頁：DTC 方案 1 套用「維持現況」範本 → 計算，得到基準 270.00。 */
async function calculateKeepPlan(page: Page) {
  await navigateTo(page, "scenarios");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  // V3-6（D-V3-12＝B）：每個測試只試算一次，這裡是工作區第一次勾聲明；勾下去就記住、checkbox 換成「已了解」。
  await acceptAssumptions(card, "first");
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  // V3-2b：試算結果是 L1（< 1 萬顯示整數元＋「元」；差額為零不帶符號）。
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1("270.00"));
  await expect(card.getByTestId("scenario-delta")).toHaveText(formatSignedDelta("0.00", "L1"));
}
/** 行動頁（看板）：新增一張待辦、填問題、按星號置頂。V3-6：看板新增後立刻開待辦編輯抽屜（modal），問題在抽屜裡填；Esc 關閉後焦點回到新卡片，再按卡片上的星號。 */
async function addPinnedAction(page: Page, problem: string) {
  await navigateTo(page, "actions");
  await switchActionsView(page, "board");
  await page.getByRole("button", { name: labels.actions.buttons.addAction, exact: true }).click();
  const card = page.getByTestId("board-card-1");
  const drawer = actionDrawer(page);
  await expect(drawer).toBeVisible();
  await drawer.getByLabel(labels.actions.form.problem, { exact: true }).fill(problem);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(card).toBeFocused();
  await card.getByRole("button", { name: labels.actions.buttons.pin, exact: true }).click();
  await expect(card.getByRole("button", { name: labels.actions.workbench.unpin, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("heading", { level: 4 })).toHaveText(problem);
}
/** 決議區按「結束會議」→ 確認區（非 modal）→ 確認；成功後狀態列顯示「已結束」。 */
async function finalizeMeeting(meeting: Locator) {
  await meeting.getByTestId("meeting-finalize").click();
  const confirm = meeting.getByTestId("meeting-finalize-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByTestId("meeting-finalize-confirm-button").click();
  await expect(meeting.getByTestId("meeting-status")).toHaveText(meetingPage.finalized);
  await expect(confirm).toHaveCount(0);
}
/** V3-7：review-workbench 只剩頁首動作列（.meeting-head：標題、名稱、日期、決議＋結束會議、複製週會摘要、匯出會議、結束列印）；範圍一行與差異橫幅在它下方。 */
const basics = (meeting: Locator) => meeting.getByTestId("review-workbench");
async function expectSameScopeCompare(meeting: Locator) {
  // V3-7（§7.6 第 6 點）：「與上次會議比較」預設收合；先展開再看內容。
  const compare = await openCompare(meeting);
  const same = compare.getByTestId("meeting-compare-same_scope");
  await expect(same).toBeVisible();
  await expect(compare.getByTestId("meeting-compare-different_dataset")).toHaveCount(0);
  await expect(same.getByTestId("meeting-compare-note")).toHaveText(record.sameScope);
  await expect(same).toContainText(fill(meetingPage.compareKind, { kind: record.kinds.same_scope }));
  const rows = same.getByTestId("meeting-compare-kpis").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.locator("th")).toHaveText([labels.metrics.net_revenue.headline, labels.metrics.contribution_after_marketing.headline]);
  // 議程表格是 L2（整數元，表頭標「（元）」）；差額取位後為零不帶符號。
  await expect(rows.nth(0).locator("td")).toHaveText([formatAmountL2("2470.00"), formatAmountL2("2470.00"), formatSignedDelta("0.00", "L2")]);
  await expect(rows.nth(1).locator("td")).toHaveText([formatAmountL2("255.00"), formatAmountL2("255.00"), formatSignedDelta("0.00", "L2")]);
  // 上次／本次三件事：同資料同範圍，兩邊都是同樣三項（−315.00、−250.00、−150.00）。
  for (const title of [record.lastPriorities, record.currentPriorities]) {
    const list = same.locator("div").filter({ has: meeting.page().getByRole("heading", { name: title, exact: true }) }).last().locator("ul > li");
    await expect(list).toHaveCount(3);
    // 三件事的影響金額是 L1（U+2212 負號）。
    for (const [index, amount] of ["-315.00", "-250.00", "-150.00"].entries()) await expect(list.nth(index)).toHaveText(new RegExp(`^${index + 1}\\. .+${escapeRe(formatSignedDelta(amount, "L1"))}$`));
  }
}

test("a. 會議流程：選入方案與置頂待辦 → 決議採用 → 結束會議 → 歷史一筆、新會議稿、同範圍比較差額 0.00；總覽入口；備份 v4 帶 meeting_history，清空後讀回仍可比較", async ({ page }) => {
  // 長流程（試算、行動、會議、備份下載、清空、恢復）；只放寬時間，不放寬斷言。
  test.setTimeout(120_000);
  const today = taipeiToday();
  const name = "R6 週會（golden）";
  const problem = "R6 置頂待辦：核對 DTC 物流報價";
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  await calculateKeepPlan(page);
  await addPinnedAction(page, problem);

  const meeting = await openMeeting(page);
  await expect(sidebarNav(page, "meeting")).toHaveAttribute("aria-current", "page");
  // 載入資料時已自動建立會議稿；沒有的話按「建立這次的會議紀錄」。
  if (await meeting.getByRole("button", { name: review.createButton, exact: true }).count()) await meeting.getByRole("button", { name: review.createButton, exact: true }).click();
  await expect(basics(meeting).getByLabel(labels.meeting.form.name, { exact: true })).toHaveValue(defaultMeetingName);
  // 會議日期預設臺北今天，input[type=date]。
  const dateInput = basics(meeting).getByLabel(labels.meeting.form.date, { exact: true });
  await expect(dateInput).toHaveAttribute("type", "date");
  await expect(dateInput).toHaveValue(today);
  await basics(meeting).getByLabel(labels.meeting.form.name, { exact: true }).fill(name);
  await expect(basics(meeting).getByLabel(labels.meeting.form.name, { exact: true })).toHaveValue(name);
  // 議程 ①–⑥：①–③ 是會議模式的主管摘要（② 標題「② 本期三件事」），④ 還沒有上次會議。
  await expect(meeting.getByTestId("meeting-agenda").getByTestId("manager-summary")).toBeVisible();
  await expect(meeting.getByTestId("meeting-agenda").getByRole("heading", { name: record.agenda.priorities, exact: true })).toBeVisible();
  await expect(meeting.getByTestId("manager-summary").getByRole("button", { name: labels.shell.buttons.print, exact: true })).toHaveCount(0);
  await expect(meeting.getByTestId("meeting-agenda-4")).toContainText(record.noLastMeeting);
  await expect(meeting.getByTestId("meeting-compare")).toContainText(record.noLastMeeting);
  // V3-8 C：會議歷史為空是兩句（標題＋說明），取代 v2 一整句 historyEmpty。
  await expectMeetingHistoryEmpty(meeting.getByTestId("meeting-history"));
  // ⑤ 每個通路一個下拉：DTC 選入「方案 1」（270.00）。
  const dtcSelect = meeting.getByTestId("meeting-agenda-5").getByLabel(fill(review.scenarioSelect, { channel: "DTC" }), { exact: true });
  await expect(meeting.getByTestId("meeting-agenda-5").locator("select")).toHaveCount(2);
  await dtcSelect.selectOption({ label: fill(review.planOption, { name: firstPlanName }) });
  await expect(dtcSelect.locator("option:checked")).toHaveText(fill(review.planOption, { name: firstPlanName }));
  // 決議「採用」。
  const decision = meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true });
  await decision.selectOption("adopted");
  await expect(decision.locator("option:checked")).toHaveText(labels.meeting.form.decisions.adopted);

  // 結束會議的確認區：Esc 取消、焦點回到「結束會議」；再按一次才確認。
  await meeting.getByTestId("meeting-finalize").click();
  const confirm = meeting.getByTestId("meeting-finalize-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAttribute("role", "dialog");
  await expect(confirm).toHaveAttribute("aria-modal", "false");
  await expect(confirm.getByRole("heading", { name: meetingPage.confirmTitle, exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(meeting.getByTestId("meeting-finalize")).toBeFocused();
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(0);
  await finalizeMeeting(meeting);

  // 會議歷史一筆：名稱 · 日期 · 採用（第 n 版確認）；新會議稿名稱回預設、決議回草稿、日期仍是今天。
  const items = meeting.getByTestId("meeting-history-item");
  await expect(items).toHaveCount(1);
  await expect(items.first().locator("summary")).toHaveText(historyTitle(name, today, "adopted"));
  await expect(items.first().getByRole("button", { name: `${labels.exports.buttons.exportMarkdown} · ${await items.first().locator("summary").innerText()}`, exact: true })).toBeVisible();
  await expect(basics(meeting).getByLabel(labels.meeting.form.name, { exact: true })).toHaveValue(defaultMeetingName);
  await expect(decision).toHaveValue("draft");
  await expect(dateInput).toHaveValue(today);
  // 結束成功後焦點移到新會議的標題（V3-7：頁首動作列的「本次會議（草稿）」，取代 v2 的「會議基本」）。
  await expect(basics(meeting).getByTestId("meeting-title")).toHaveText(pageV3.title);
  await expect(basics(meeting).getByTestId("meeting-title")).toBeFocused();
  // V3-7（§7.6 第 2 點）：歷史項目展開後頂部一行結束標示（緊接在 summary 之後）；v3 結束的紀錄沒有「本紀錄建立於 v2」加註。
  await items.first().locator("summary").click();
  await expect(items.first().getByTestId("meeting-snapshot-note")).toHaveText(fill(pageV3.snapshotNote, { date: formatDateL1(today, { today }) }));
  await expect(items.first().getByTestId("meeting-snapshot-note")).toBeVisible();
  await expect(items.first().locator("details > summary + p")).toHaveAttribute("data-testid", "meeting-snapshot-note");
  await expect(items.first().getByTestId("meeting-v2-note")).toHaveCount(0);
  // 同一份資料、同範圍：比較區是 same_scope，KPI 差額 0.00；④ 列出上次決議與置頂待辦。
  await expectSameScopeCompare(meeting);
  const followUp = meeting.getByTestId("meeting-agenda-4").getByTestId("meeting-followup");
  await expect(followUp).toContainText(fill(record.mdLastMeeting, { name, date: today }));
  await expect(followUp.locator("thead th")).toHaveText(Object.values(meetingPage.followUpColumns));
  await expect(followUp.locator("tbody tr")).toHaveCount(1);
  await expect(followUp.locator("tbody tr th")).toHaveText(problem);
  await expect(followUp.locator("tbody tr td")).toHaveText([labels.actions.form.statuses.not_started, labels.actions.form.statuses.not_started, record.statusNotUpdated]);

  // 總覽只留一行入口：剛結束會議、新會議稿還沒動過 → 「本期會議：已結束（日期）· 新會議稿：草稿」（不再另列「上次會議 日期」）。
  await navigateTo(page, "overview");
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(entryUi.meetingEntryFinalized, { date: today }));
  await expect(entry).not.toContainText(fill(entryUi.meetingEntry, { state: labels.meeting.form.decisions.draft }));
  await expect(entry).not.toContainText(fill(meetingPage.entryLast, { date: today }));

  // 備份（V3-9a 起寫 v5，WORKSPACE_VERSION）：meeting_history 一筆（凍結的議程：選入方案 270.00、置頂待辦一項）。
  const storage = await openStorage(page);
  const backup = await downloadFrom(page, storage.getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }));
  expect(backup.download.suggestedFilename()).toBe("profitlens-workspace.json");
  const text = backup.bytes.toString("utf8");
  const wire = JSON.parse(text);
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.meeting_history).toHaveLength(1);
  const saved = wire.payload.meeting_history[0];
  expect(saved).toMatchObject({ schema_version: "meeting-v1", name, date: today, decisions: [{ state: "adopted" }] });
  expect(saved.decisions[0].confirmed_revision).toEqual(expect.any(Number));
  expect(saved.agenda.kpis).toEqual([
    { metric: "net_revenue", previous: "2250.00", current: "2470.00", change: "220.00" },
    { metric: "contribution_after_marketing", previous: "570.00", current: "255.00", change: "-315.00" },
  ]);
  expect(saved.agenda.scenarios).toHaveLength(1);
  expect(saved.agenda.scenarios[0]).toMatchObject({ channel: "DTC", name: firstPlanName, baseline: "270.00", contribution: "270.00", delta: "0.00" });
  expect(saved.agenda.pinned_actions.map((row: { problem: string }) => row.problem)).toEqual([problem]);
  expect(wire.payload.review_session).toMatchObject({ name: defaultMeetingName, decision_state: "draft" });
  await storage.getByRole("button", { name: store.confirmDownloaded, exact: true }).click();
  await closeStorage(page);

  // 清空 → 讀回備份：會議歷史仍一筆，比較仍是 same_scope（差額 0.00）。V3-3：「清空」在儲存選單的危險區。
  await clickReplacing(page, await clearButton(page));
  await expect(status(page)).toContainText(labels.shell.status.empty);
  const fresh = await openStorage(page);
  await fresh.getByLabel(store.selectBackupFile, { exact: true }).setInputFiles({ name: "r6-meeting.json", mimeType: "application/json", buffer: backup.bytes });
  await expect(page.getByRole("region", { name: store.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, fresh.getByRole("button", { name: store.applyRestore, exact: true }));
  await expect(status(page)).toContainText(ready("golden"));
  await expect(fresh.getByTestId("storage-notice")).toHaveText(store.restoredNotice);
  // 恢復後本機保存同意重設，提示再出現一次。V3-3：先收儲存選單（手機上一併收起「更多」）再回應提示——展開中的選單與底部面板疊在提示之上（見 e 的檢查）。
  await closeStorage(page);
  await declineSavePrompt(page);
  const restored = await openMeeting(page);
  await expect(restored.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(restored.getByTestId("meeting-history-item").first().locator("summary")).toHaveText(historyTitle(name, today, "adopted"));
  // 還原的仍是 v3 結束的紀錄：結束標示照常、沒有 v2 加註。
  await expect(restored.getByTestId("meeting-history-item").first().getByTestId("meeting-snapshot-note")).toHaveText(fill(pageV3.snapshotNote, { date: formatDateL1(today, { today }) }));
  await expect(restored.getByTestId("meeting-v2-note")).toHaveCount(0);
  await expectSameScopeCompare(restored);
  // 還原備份後新會議稿仍是未動過的第 1 版草稿：總覽入口同樣顯示「已結束（日期）」。
  await navigateTo(page, "overview");
  await expect(page.getByTestId("overview-meeting-entry")).toContainText(fill(entryUi.meetingEntryFinalized, { date: today }));
});

test("b. 不同資料的降級：golden 結束會議後換成示範資料，會議改用目前資料 → 比較區只留一句，上次決議與置頂待辦狀態只列在議程 ④", async ({ page }) => {
  test.setTimeout(120_000);
  const today = taipeiToday();
  const problem = "R6 跨資料追蹤的待辦";
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  await addPinnedAction(page, problem);
  let meeting = await openMeeting(page);
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true }).selectOption("needs_data");
  await finalizeMeeting(meeting);
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(meeting.getByTestId("meeting-history-item").first().locator("summary")).toHaveText(historyTitle(defaultMeetingName, today, "need_data"));
  // 結束會議之後才推進待辦：上次「未開始」→ 目前「進行中」（狀態更新日＝今天）。
  await navigateTo(page, "actions");
  await page.getByTestId("board-card-1-move-in_progress").click();
  await expect(page.getByTestId("board-column-in_progress").getByTestId("board-card-1")).toBeVisible();

  // 開發者驗證頁換成示範資料（放棄未保存的修改）。
  await loadDataset(page, "demo");
  await dismissSavePrompt(page);
  meeting = await openMeeting(page);
  // 會議稿仍固定在 golden（較早的資料）：提示目前檢視不同、不能結束會議；按「用目前資料更新會議」後才換成示範資料。
  // V3-7（§7.6 第 3 點）：差異橫幅在頁首動作列下方（不在 review-workbench 內），「用目前資料更新會議」在橫幅裡。
  const banner = meeting.getByTestId("review-view-difference");
  await expect(banner).toBeVisible();
  await expect(meeting.getByTestId("meeting-finalize")).toBeDisabled();
  await banner.getByRole("button", { name: labels.meeting.buttons.updateMeetingSource, exact: true }).click();
  await expect(banner).toHaveCount(0);
  await expect(meeting.getByTestId("meeting-finalize")).toBeEnabled();

  const compare = await openCompare(meeting);
  const different = compare.getByTestId("meeting-compare-different_dataset");
  await expect(different).toBeVisible();
  await expect(compare.getByTestId("meeting-compare-same_scope")).toHaveCount(0);
  await expect(compare.getByTestId("meeting-compare-different_periods")).toHaveCount(0);
  await expect(different.getByTestId("meeting-compare-note")).toHaveText(labels.meeting.form.noComparable);
  await expect(different.getByTestId("meeting-compare-kpis")).toHaveCount(0);
  await expect(different).toContainText(fill(meetingPage.compareKind, { kind: record.kinds.different_dataset }));
  // 比較區只留一句「上次決議與置頂待辦的狀態列在議程 ④」；決議與待辦表只在 ④（meeting-agenda-4）出現一次。
  await expect(different.getByTestId("meeting-compare-see-followup")).toHaveText(meetingPage.compareSeeFollowUp);
  await expect(different.getByTestId("meeting-compare-followup")).toHaveCount(0);
  await expect(different.locator("table")).toHaveCount(0);
  await expect(different.locator("ul > li")).toHaveCount(0);
  const followUp = meeting.getByTestId("meeting-agenda-4").getByTestId("meeting-followup");
  await expect(meeting.getByTestId("meeting-followup")).toHaveCount(1);
  await expect(followUp).toContainText(fill(record.mdLastMeeting, { name: defaultMeetingName, date: today }));
  await expect(followUp.locator("ul > li")).toHaveText([new RegExp(`^${escapeRe(`${meetingPage.lastDecision}：`)}${confirmedRe("need_data")}$`)]);
  await expect(followUp.locator("tbody tr")).toHaveCount(1);
  await expect(followUp.locator("tbody tr th")).toHaveText(problem);
  await expect(followUp.locator("tbody tr td")).toHaveText([labels.actions.form.statuses.not_started, labels.actions.form.statuses.in_progress, today]);
  // 會議歷史換資料後仍保留；總覽入口不顯示別份資料的上次會議日期。
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await navigateTo(page, "overview");
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(entryUi.meetingEntry, { state: labels.meeting.form.decisions.draft }));
  await expect(entry).not.toContainText(fill(meetingPage.entryLast, { date: today }));
});

// 會議的通路別名依會議固定來源的 dataset_id（reviewDatasetId），不看目前檢視；docs/DECISIONS.md（R2）：示範通路別名只對示範資料集生效，golden 維持原通路代碼。
test("b2. 換成示範資料後，固定在 golden 的會議稿仍顯示 golden 的通路代碼（不套示範別名）；目前檢視（示範）才用別名", async ({ page }) => {
  test.setTimeout(90_000);
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  await loadDataset(page, "demo");
  await dismissSavePrompt(page);
  const meeting = await openMeeting(page);
  const channels = ["DTC", "MARKETPLACE"];
  // golden：上期 2026-08-01、本期 2026-08-02；demo：本期 2026-07-13～2026-08-23（fixtures/demo）。
  // V3-7（C22 橫幅）：橫幅一句＋「檢視差異」（收合）＋更新按鈕；完整的差異句在「檢視差異」展開後的 popover。
  const banner = meeting.getByTestId("review-view-difference");
  await expect(banner).toContainText(pageV3.viewDifferenceBanner);
  const toggle = banner.locator("details > summary");
  await expect(toggle).toHaveText(pageV3.viewDifferenceToggle);
  await toggle.click();
  await expect(banner.locator(".meeting-banner-popover")).toBeVisible();
  await expect(banner.locator(".meeting-banner-popover")).toHaveText(fill(review.viewDifference, {
    meetingChannels: channelsLabel(channels, false), meetingStart: "2026-08-02", meetingEnd: "2026-08-02",
    viewChannels: channelsLabel(channels, true), viewStart: "2026-07-13", viewEnd: "2026-08-23", datasetNote: review.viewDifferenceDataset,
  }));
  await expect(meeting.locator(".meeting-scope-line")).toContainText(fill(review.sourceLine, { sourceStatus: review.sourceHistorical, channels: channelsLabel(channels, false) }));
  for (const channel of channels) await expect(meeting.getByTestId("meeting-agenda-5").getByLabel(fill(review.scenarioSelect, { channel }), { exact: true })).toHaveCount(1);
});

test("c. 匯出產物：下載選單「摘要匯出（目前檢視）」四項；選單的 Excel／PPT 只依目前檢視（不含會議）、完成後焦點回到「下載」；會議頁輸出列的 Excel／PPT 帶會議名稱並逸出", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  await mkdir(outputDir("artifacts"), { recursive: true });
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const today = taipeiToday();

  const menu = await openDownloads(page);
  const section = menu.getByTestId("download-meeting-section");
  await expect(section).toHaveText(labels.meeting.sections.meetingSummary);
  // V3-7（§6.5、§7.9）：「摘要匯出（目前檢視）」是 role=group 的分組（以小標為名），依序四項；每項 14px 名稱＋一行 12px 說明。
  const group = menu.getByTestId("download-group-summary");
  await expect(group).toHaveAttribute("role", "group");
  await expect(menu.getByRole("group", { name: labels.meeting.sections.meetingSummary, exact: true })).toBeVisible();
  const summaryItems = [
    [labels.exports.buttons.exportPdf, fill(menuV3.descriptions.exportPdf, { hint: labels.meeting.page.pdfHint })],
    [labels.exports.buttons.exportExcel, menuV3.descriptions.exportExcel],
    [labels.exports.buttons.exportPptx, menuV3.descriptions.exportPptx],
    [labels.meeting.page.menuMarkdown, menuV3.descriptions.menuMarkdown],
  ] as const;
  await expect(group.locator(".export-item-name")).toHaveText(summaryItems.map(([name]) => name));
  // V3-9b F14：分組標題下先是版本切換（三顆 aria-pressed 按鈕，class export-variant），之後才是四個匯出項目（button.export-item）。
  await expect(variantPicker(menu).getByRole("button")).toHaveCount(EXPORT_VARIANTS.length);
  await expect(summaryExportItems(menu)).toHaveCount(summaryItems.length);
  await expect(group.getByRole("button")).toHaveCount(EXPORT_VARIANTS.length + summaryItems.length);
  // 可及名稱只取名稱（aria-labelledby）；範圍差異寫在說明行（aria-describedby），取代 v2 選單底部的 menuViewNote／menuNote。
  for (const [index, [name, description]] of summaryItems.entries()) {
    const item = summaryExportItems(menu).nth(index);
    await expect(item).toHaveAccessibleName(name);
    await expect(item).toHaveAccessibleDescription(description);
    await expect(item.locator("small")).toHaveText(description);
  }
  await expect(menu).not.toContainText(labels.meeting.page.menuViewNote);
  await expect(menu).not.toContainText(labels.exports.downloads.menuNote);

  // Excel：profitlens.xlsx、zip（PK）、> 5 KB、六張工作表＋V3-9b 最後一張管理損益表（預設標準版）；選單版只依目前檢視：摘要沒有會議名稱／日期列，也不帶會議稿的名稱。
  const downloadSummary = page.getByTestId("download-menu").locator(":scope > summary");
  const excel = await downloadFrom(page, menu.getByRole("button", { name: labels.exports.buttons.exportExcel, exact: true }));
  expect(excel.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(excel.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(excel.bytes.length).toBeGreaterThan(5 * 1024);
  const workbook = XLSX.read(excel.bytes, { type: "buffer" });
  expect(workbook.SheetNames).toEqual(STANDARD_SHEETS);
  const summaryCells = (book: XLSX.WorkBook) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[labels.exports.excel.sheets.summary], { header: 1, raw: false }).flat().map(String);
  const viewCells = summaryCells(workbook);
  expect(viewCells).toEqual(expect.arrayContaining([labels.exports.excel.summary.items.dataset, "golden-v1"]));
  expect(viewCells).not.toContain(labels.exports.excel.summary.items.meetingName);
  expect(viewCells).not.toContain(labels.exports.excel.summary.items.meetingDate);
  expect(viewCells).not.toContain(labels.exports.excel.summary.sections.meeting);
  expect(viewCells).not.toContain(defaultMeetingName);
  // V3-7 §7.9：摘要工作表在表頭列之後先放版頭四列（A 欄＝「版頭」、「內容」欄＝四行），資料集是畫面上的名稱。
  const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[labels.exports.excel.sheets.summary], { header: 1, raw: false });
  const detailColumn = summaryRows[0].indexOf(labels.exports.excel.columns.summary.detail);
  expect(detailColumn).toBeGreaterThan(0);
  const headerRows = summaryRows.slice(1, 5);
  expect(headerRows.map(row => row[0])).toEqual(Array(4).fill(headerV3.excelSection));
  expectExportHeader(headerRows.map(row => String(row[detailColumn])), GOLDEN_HEADER);
  expect(summaryRows.slice(5).map(row => row[0])).not.toContain(headerV3.excelSection);
  // V3-9a F12：摘要工作表在兩列關鍵差額之後、三件事之前多一列損益兩平 MER（區塊＝其他常用指標；上期／本期是 L3 文字格；內容欄寫版本 breakeven-mer-v1）。
  const summaryItem = excelColumn(summaryRows[0], labels.exports.excel.columns.summary.item);
  const breakevenAt = summaryRows.findIndex(row => row[summaryItem] === labels.assist.breakevenV3.label);
  expect(breakevenAt).toBeGreaterThan(0);
  expect(summaryRows.filter(row => row[summaryItem] === labels.assist.breakevenV3.label)).toHaveLength(1);
  const breakevenRow = summaryRows[breakevenAt];
  expect(breakevenRow[0]).toBe(labels.overview.sections.assistKpis);
  expect(breakevenRow[excelColumn(summaryRows[0], labels.exports.excel.columns.summary.previous)]).toBe(formatMultiple(GOLDEN_BREAKEVEN.previous, "L3"));
  expect(breakevenRow[excelColumn(summaryRows[0], labels.exports.excel.columns.summary.current)]).toBe(formatMultiple(GOLDEN_BREAKEVEN.current, "L3"));
  expect(breakevenRow[detailColumn]).toBe(fill(labels.assist.breakevenV3.excelDetail, { version: BREAKEVEN_MER_VERSION }));
  expect(summaryRows.filter(row => row[0] === labels.exports.excel.summary.sections.keyDeltas)).toHaveLength(2);
  expect(summaryRows[breakevenAt - 1][0]).toBe(labels.exports.excel.summary.sections.keyDeltas);
  expect(summaryRows[breakevenAt + 1][0]).toBe(labels.exports.excel.summary.sections.topThree);
  // 指標定義工作表：技術區在輔助指標版本（assist-kpi-v1）之後多一列損益兩平 MER 版本。
  const basisRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[labels.exports.excel.sheets.basis], { header: 1, raw: false });
  const basisItem = excelColumn(basisRows[0], labels.exports.excel.columns.basis.item);
  const assistVersionAt = basisRows.findIndex(row => row[basisItem] === labels.exports.excel.basis.assistVersion);
  expect(assistVersionAt).toBeGreaterThan(0);
  const basisVersionRow = basisRows[assistVersionAt + 1];
  expect(basisVersionRow[excelColumn(basisRows[0], labels.exports.excel.columns.basis.section)]).toBe(labels.exports.excel.basis.sections.technical);
  expect(basisVersionRow[basisItem]).toBe(labels.assist.breakevenV3.excelVersion);
  expect(basisVersionRow[excelColumn(basisRows[0], labels.exports.excel.columns.basis.detail)]).toBe(BREAKEVEN_MER_VERSION);
  await excel.download.saveAs(outputDir("artifacts", `${project}-profitlens.xlsx`));
  await expect(menu).toHaveAttribute("open", "");
  // 完成後焦點回到「下載」選單的 summary（不掉到 body）。
  await expect(downloadSummary).toBeFocused();

  // PPT 一頁式：profitlens-onepager.pptx、zip（PK）、只有一張投影片；選單版並註明目前檢視、不含會議決議。
  // V3-7 §7.9：選單版標題是版頭第 2 行（報表名），副標是版頭其他三行；不再畫 v2 的「EC ProfitLens 一頁摘要」與「資料到／通路」副標（副標只寫進檔案屬性）。
  const pptx = await downloadFrom(page, menu.getByRole("button", { name: labels.exports.buttons.exportPptx, exact: true }));
  expect(pptx.download.suggestedFilename()).toBe("profitlens-onepager.pptx");
  expect(pptx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const slides = slideXml(pptx.bytes);
  expect(slides).toHaveLength(1);
  expect(slides[0]).toContain(exportReportTitle());
  expect(slides[0]).toContain(`>${GOLDEN_HEADER.datasetName}<`);
  expect(slides[0]).toMatch(new RegExp(`>${exportVersionLineRe().source.slice(1, -1)}<`));
  expect(slides[0]).toContain(fill(headerV3.pptxDataVersion, { datasetHash: "" }));
  expect(slides[0]).not.toContain(fill(labels.exports.pptx.title, { brand: labels.brand.name }));
  expect(slides[0]).not.toContain(fill(labels.exports.pptx.subtitle, { asOf: GOLDEN_AS_OF, previous: formatPeriodExport("2026-08-01", "2026-08-01"), current: formatPeriodExport("2026-08-02", "2026-08-02"), channels: channelsLabel(["DTC", "MARKETPLACE"], false) }));
  expect(slides[0]).toContain(labels.exports.pptx.noMeeting);
  expect(slides[0]).not.toContain(fill(labels.exports.pptx.titleMeeting, { name: defaultMeetingName, date: today }));
  expect(slides[0]).not.toContain(defaultMeetingName);
  await pptx.download.saveAs(outputDir("artifacts", `${project}-profitlens-onepager.pptx`));
  await expect(downloadSummary).toBeFocused();

  // V3-7 §7.9：「會議紀錄 Markdown」（還沒有已結束的會議 → 本次會議稿的一頁摘要）：「# 標題」與空行之後是版頭四行（前三行行尾兩個空白＝硬換行），再一行空白。
  const menuMarkdown = await downloadFrom(page, (await openDownloads(page)).getByRole("button", { name: meetingPage.menuMarkdown, exact: true }));
  expect(menuMarkdown.download.suggestedFilename()).toBe("profitlens-manager-summary.md");
  const menuMarkdownText = menuMarkdown.bytes.toString("utf8");
  expectExportHeader(markdownHeader(menuMarkdownText), GOLDEN_HEADER, { hardBreaks: true });
  expect(menuMarkdownText.split("\n")[6]).toBe("");
  expectMarkdownBreakeven(menuMarkdownText);
  await expect(downloadSummary).toBeFocused();
  await closeDownloads(page);

  // 會議頁「匯出會議」五項（V3-7：頁首下拉，取代 v2 輸出列五鈕）；改會議名稱（含公式開頭與 XML 特殊字元）後匯出 Excel／PPT：Excel 是文字不是公式、PPT 的 XML 有逸出。
  const meeting = await openMeeting(page);
  const outputs = await openMeetingExport(page);
  const kinds = Object.keys(MEETING_EXPORTS) as (keyof typeof MEETING_EXPORTS)[];
  await expect(outputs.getByRole("button")).toHaveCount(kinds.length);
  for (const [index, kind] of kinds.entries()) {
    await expect(outputs.getByRole("button").nth(index)).toHaveAttribute("data-testid", `meeting-export-${kind}`);
    await expect(outputs.getByRole("button").nth(index)).toHaveAccessibleName(MEETING_EXPORTS[kind]);
  }
  // 會議頁的 Markdown：同一份會議資料與目前資料相同 → 版頭第 1 行同樣是畫面上的資料集名稱。
  const meetingMarkdown = await downloadFrom(page, await meetingExportItem(page, "markdown"));
  expect(meetingMarkdown.download.suggestedFilename()).toBe("profitlens-manager-summary.md");
  expectExportHeader(markdownHeader(meetingMarkdown.bytes.toString("utf8")), GOLDEN_HEADER, { hardBreaks: true });
  expectMarkdownBreakeven(meetingMarkdown.bytes.toString("utf8"));
  await expect(outputs).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("export-page-meeting")).toBeFocused();
  const hostile = '=HYPERLINK("x") <會議>&';
  await basics(meeting).getByLabel(labels.meeting.form.name, { exact: true }).fill(hostile);
  await expect(basics(meeting).getByLabel(labels.meeting.form.name, { exact: true })).toHaveValue(hostile);
  await expect(await meetingExportItem(page, "excel")).toBeEnabled();
  const meetingExcel = await downloadFrom(page, await meetingExportItem(page, "excel"));
  expect(meetingExcel.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(meetingExcel.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const meetingBook = XLSX.read(meetingExcel.bytes, { type: "buffer", cellFormula: true });
  // V3-9b：會議頁的匯出會議是標準版（六張＋管理損益表）。
  expect(meetingBook.SheetNames).toEqual(STANDARD_SHEETS);
  const sheet = meetingBook.Sheets[labels.exports.excel.sheets.summary];
  const nameCell = Object.entries(sheet).find(([address, cell]) => !address.startsWith("!") && (cell as XLSX.CellObject).v === `'${hostile}`);
  expect(nameCell, "會議名稱以文字（前置 '）寫入摘要工作表").toBeTruthy();
  expect((nameCell![1] as XLSX.CellObject).t).toBe("s");
  expect((nameCell![1] as XLSX.CellObject).f).toBeUndefined();
  expect(Object.values(sheet).some(cell => typeof cell === "object" && cell !== null && "f" in cell && (cell as XLSX.CellObject).f !== undefined)).toBe(false);
  const meetingPptx = await downloadFrom(page, await meetingExportItem(page, "pptx"));
  expect(meetingPptx.download.suggestedFilename()).toBe("profitlens-onepager.pptx");
  const [meetingSlide] = slideXml(meetingPptx.bytes);
  expect(meetingSlide).toContain("&lt;會議&gt;&amp;");
  expect(meetingSlide).not.toContain("<會議>");
  // 匯出失敗訊息（meetingPage.exportError，role=alert）在頁首動作列下方；兩次匯出都成功，頁面沒有任何 alert。
  await expect(meeting.getByText(meetingPage.exportError, { exact: true })).toHaveCount(0);
  await expect(meeting.getByRole("alert")).toHaveCount(0);
});

test("c2. 頂欄「匯出」選單：五個分組（role=group）與每項一行說明；Excel 失敗時錯誤行在該項下方（role=alert）、焦點回到該項、說明連到錯誤；重試成功後錯誤移除", async ({ page }) => {
  test.setTimeout(90_000);
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const menu = await openDownloads(page);
  const describe = menuV3.descriptions;
  // V3-7（§6.5、§7.9）：分組依序是目前檢視／一頁摘要（目前檢視）／決策工作稿／會議／匯入範本；每組 role=group，以分組標題為可及名稱。
  const groups = [
    ["download-group-current", labels.shell.sections.downloadCurrentView, [[labels.exports.downloads.analysisCsv, describe.analysisCsv], [labels.exports.downloads.channelTableCsv, describe.channelTableCsv], [labels.exports.downloads.manifestJson, describe.manifestJson]]],
    ["download-group-summary", labels.meeting.sections.meetingSummary, [[labels.exports.buttons.exportPdf, fill(describe.exportPdf, { hint: labels.meeting.page.pdfHint })], [labels.exports.buttons.exportExcel, describe.exportExcel], [labels.exports.buttons.exportPptx, describe.exportPptx], [labels.meeting.page.menuMarkdown, describe.menuMarkdown]]],
    ["download-group-decision", labels.shell.sections.downloadDecision, [[labels.exports.downloads.decisionMd, describe.decisionMd], [labels.exports.downloads.decisionCsv, describe.decisionCsv], [labels.exports.downloads.decisionJson, describe.decisionJson]]],
    ["download-group-meeting", menuV3.groupMeeting, [[entryUi.copy, describe.copySummary]]],
  ] as const;
  // V3-9b F14：「一頁摘要」分組內另有版本切換（div.ui-segmented[role=group]，以 pickerAria 為名）；分組本身仍是五個。
  await expect(menu.locator("[role=group]:not([data-testid=download-variant-picker])")).toHaveCount(groups.length + 1);
  await expect(variantPicker(menu)).toHaveCount(1);
  await expect(variantPicker(menu)).toHaveAttribute("role", "group");
  await expect(variantPicker(menu)).toHaveAccessibleName(labels.exports.variantsV3.pickerAria);
  for (const [testId, title, items] of groups) {
    const group = menu.getByTestId(testId);
    await expect(group).toHaveAttribute("role", "group");
    await expect(group).toHaveAccessibleName(title);
    // 每項：名稱（span.export-item-name，可及名稱只取名稱）＋一行說明（small，也是可及描述）。
    await expect(group.locator(".export-item-name")).toHaveText(items.map(([name]) => name));
    for (const [index, [name, description]] of items.entries()) {
      const item = group.locator("button.export-item").nth(index);
      await expect(item).toHaveAttribute("data-lines", "2");
      await expect(item).toHaveAccessibleName(name);
      await expect(item).toHaveAccessibleDescription(description);
    }
  }
  await expect(menu.getByTestId("download-group-templates")).toHaveAttribute("role", "group");
  await expect(menu.getByTestId("download-group-templates")).toHaveAccessibleName(labels.exports.downloads.templatesHeading);
  // 範圍差異寫在各項說明裡：v2 選單底部的兩句說明不再出現。
  await expect(menu).not.toContainText(labels.meeting.page.menuViewNote);
  await expect(menu).not.toContainText(labels.exports.downloads.menuNote);
  await expect(menu.getByRole("alert")).toHaveCount(0);

  // 失敗路徑：讓瀏覽器建立下載網址時丟錯（Excel 產生後存檔失敗）→ 錯誤一行（role=alert）在 Excel 項目下方、焦點回到 Excel、aria-describedby 連到錯誤。
  const excel = menu.getByRole("button", { name: labels.exports.buttons.exportExcel, exact: true });
  await expect(excel).toHaveAttribute("aria-describedby", "download-excel-hint");
  await page.evaluate(() => {
    const w = window as unknown as { __e1CreateObjectURL?: typeof URL.createObjectURL };
    w.__e1CreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => { throw new Error("E2E_DOWNLOAD_BLOCKED"); };
  });
  await excel.click();
  const error = menu.locator("p.export-item-error");
  await expect(error).toHaveCount(1);
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toHaveAttribute("id", "download-excel-error");
  await expect(error).toHaveText(labels.meeting.page.exportError);
  await expect(menu.getByRole("alert")).toHaveCount(1);
  // 錯誤行與 Excel 按鈕在同一個項目（div.menu-item）內，緊接在按鈕之後。
  expect(await error.evaluate(element => ({ parent: element.parentElement?.className ?? "", previous: element.previousElementSibling?.getAttribute("aria-labelledby") ?? "" }))).toEqual({ parent: "menu-item", previous: "download-excel-name" });
  await expect(excel).toBeFocused();
  await expect(excel).toHaveAttribute("aria-describedby", "download-excel-hint download-excel-error");
  await expect(excel).toHaveAccessibleDescription(`${describe.exportExcel} ${labels.meeting.page.exportError}`);
  await expect(excel).not.toHaveAttribute("data-busy", "true");
  await expect(excel).not.toHaveAttribute("aria-disabled", "true");
  await expect(menu).toHaveAttribute("open", "");

  // 還原下載網址後重試：下載成功、錯誤行移除、說明只剩一行；焦點回到「匯出」的 summary。
  await page.evaluate(() => {
    const w = window as unknown as { __e1CreateObjectURL?: typeof URL.createObjectURL };
    if (w.__e1CreateObjectURL) URL.createObjectURL = w.__e1CreateObjectURL;
  });
  const retry = await downloadFrom(page, excel);
  expect(retry.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(retry.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  await expect(error).toHaveCount(0);
  await expect(menu.getByRole("alert")).toHaveCount(0);
  await expect(excel).toHaveAttribute("aria-describedby", "download-excel-hint");
  await expect(page.getByTestId("download-menu").locator(":scope > summary")).toBeFocused();
  await closeDownloads(page);
});

test("d. PDF／列印：下載選單「匯出 PDF」只依目前檢視（頁首 printContext、無會議）、afterprint 後焦點回到「下載」；A4 PDF 存檔；會議頁輸出列帶會議頁首、決議行與選入方案一行、假設在附錄", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  // 只替換會擋住流程的系統列印對話框，記錄呼叫次數；列印版面與 print media 樣式照常運作。
  await page.addInitScript(() => {
    const w = window as unknown as { __r6PrintCalls: number };
    w.__r6PrintCalls = 0;
    window.print = () => { w.__r6PrintCalls++; };
  });
  const printCalls = () => page.evaluate(() => (window as unknown as { __r6PrintCalls: number }).__r6PrintCalls);
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const today = taipeiToday();

  const menu = await openDownloads(page);
  // V3-7（§7.9）：PDF 項目的說明行＝「A4 一頁 · {pdfHint}」（small#download-pdf-hint，也是按鈕的可及描述）。
  const pdfItem = menu.getByRole("button", { name: labels.exports.buttons.exportPdf, exact: true });
  const pdfDescription = fill(menuV3.descriptions.exportPdf, { hint: labels.meeting.page.pdfHint });
  await expect(menu.getByText(pdfDescription, { exact: true })).toBeVisible();
  await expect(pdfItem).toHaveAccessibleDescription(pdfDescription);
  await pdfItem.click();
  // 選單關閉、列印版面掛到 body、window.print() 呼叫一次。
  await expect(menu).not.toHaveAttribute("open", "");
  await expect.poll(printCalls).toBe(1);
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toHaveCount(1);
  await expect(print).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  await expect(status(page)).toBeHidden();
  // V3-7 §7.9：列印版頭四行——資料集名稱、h1 報表名、兩期與單位、指標版本與產出時間（台北時間）。
  await expect(print.getByRole("heading", { level: 1 })).toHaveText(exportReportTitle());
  await expect(print.getByTestId("print-report-header")).toHaveCount(1);
  await expect(print.getByTestId("print-header-dataset")).toHaveText(GOLDEN_HEADER.datasetName);
  await expect(print.getByTestId("print-header-period").locator("span")).toHaveText([exportPeriodLine(GOLDEN_HEADER), headerV3.unitExclusive]);
  await expect(print.getByTestId("print-header-version")).toHaveText(exportVersionLineRe());
  // 第一頁只有三件事（ol > li），依 |對貢獻影響|：−315.00、−250.00、−150.00。
  const priorities = print.locator(":scope > ol > li");
  await expect(priorities).toHaveCount(3);
  // 一頁摘要的三件事影響金額是 L1（U+2212 負號）。
  for (const [index, amount] of ["-315.00", "-250.00", "-150.00"].entries()) await expect(priorities.nth(index)).toContainText(`${labels.overview.sections.impact} ${formatSignedDelta(amount, "L1")}`);
  // 附錄（技術資訊）是獨立的 section。V3-9b F14：標準版的附錄依序是（方案假設 → 備註 → 其他待辦 →）每週管理損益表 → 技術細節；
  // 附錄從新的一頁開始＝第一個附錄（選單版沒有假設、備註與其他待辦，所以是管理損益表）break-before: page，之後的附錄接著排（.printAppendix + .printAppendix 是 auto）。
  const appendix = print.locator(":scope > section").filter({ has: page.getByRole("heading", { name: labels.evidence.sections.technicalDetails, exact: true }) });
  await expect(appendix).toHaveCount(1);
  await expect(appendix).toContainText("contribution-v1");
  const pnlAppendix = print.getByTestId("print-appendix-pnl");
  await expect(pnlAppendix).toHaveCount(1);
  expect(await print.locator(":scope > section").evaluateAll(sections => sections.map(section => section.getAttribute("data-testid")))).toEqual(["print-appendix-pnl", null]);
  expect(await pnlAppendix.evaluate(element => getComputedStyle(element).breakBefore)).toBe("page");
  expect(await appendix.evaluate(element => element.previousElementSibling?.getAttribute("data-testid") ?? "")).toBe("print-appendix-pnl");
  // 三件事的 ol 有 1. 2. 3. 編號。
  expect(await print.locator(":scope > ol").evaluate(element => getComputedStyle(element).listStyleType)).toBe("decimal");
  // 選單版只依目前檢視：版頭之後的範圍一行（狀態＝「目前檢視（不含會議決議）」· 資料到 · 通路 · 比較方式），沒有會議名稱頁首、決議行與選入方案。
  await expect(print.getByTestId("print-header-scope")).toHaveText(fill(headerV3.printScope, { state: meetingPage.printViewState, asOf: GOLDEN_AS_OF, channels: channelsLabel(["DTC", "MARKETPLACE"], false), mode: labels.shell.periods.sameDays }));
  await expect(print.getByTestId("print-header-meeting")).toHaveCount(0);
  await expect(print.locator(":scope > header")).not.toContainText(defaultMeetingName);
  await expect(print.getByTestId("print-decision-line")).toHaveCount(0);
  await expect(print.getByTestId("print-scenario-line")).toHaveCount(0);
  await expect(print.getByTestId("print-appendix-assumptions")).toHaveCount(0);
  await mkdir(outputDir(), { recursive: true });
  const pdfPath = outputDir(`manager-summary-A4-${project}.pdf`);
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
  const pdf = await readFile(pdfPath);
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  // 第一頁＋從新的一頁開始的附錄：A4 剛好 2 頁（V3-7 的版頭四行沒有把第一頁擠成兩頁）。
  expect(pdfPages(pdf)).toBeGreaterThanOrEqual(2);
  expect(pdfPages(pdf)).toBeLessThanOrEqual(2);
  await page.emulateMedia({ media: "screen" });
  // page.pdf() 本身會觸發 beforeprint／afterprint（當下仍模擬 print media，頂欄不顯示、無法聚焦），列印版面在那時就已移除；這裡的 afterprint 只是保險。
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(status(page)).toBeVisible();
  // 再從選單列印一次（不產 PDF）：畫面模式下的 afterprint 後列印版面移除、焦點回到「下載」選單的 summary。
  const again = await openDownloads(page);
  await again.getByRole("button", { name: labels.exports.buttons.exportPdf, exact: true }).click();
  await expect(again).not.toHaveAttribute("open", "");
  await expect.poll(printCalls).toBe(2);
  await expect(print).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(page.getByTestId("download-menu").locator(":scope > summary")).toBeFocused();

  // 會議頁輸出列「匯出 PDF」：同一流程；列印中多「回到畫面」按鈕，按下後列印版面移除。
  // 先把 DTC「維持現況」方案（270.00）選入會議：⑤ 下方列出選入結果，列印第一頁每個方案一行、完整假設在附錄。
  await calculateKeepPlan(page);
  const meeting = await openMeeting(page);
  const agenda5 = meeting.getByTestId("meeting-agenda-5");
  // V3-8 C（§7.10 區段空狀態）：⑤ 沒有選入方案是兩句＋「前往假設試算」；點了切到假設試算頁，再回會議頁繼續。
  await expectMeetingNoScenario(agenda5);
  await goToScenariosFromMeeting(page, agenda5);
  await openMeeting(page);
  await agenda5.getByLabel(fill(review.scenarioSelect, { channel: "DTC" }), { exact: true }).selectOption({ label: fill(review.planOption, { name: firstPlanName }) });
  const results = agenda5.getByTestId("meeting-scenario-results").getByTestId("meeting-scenario-result");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveAttribute("data-status", "current");
  await expect(results.first()).toContainText(firstPlanName);
  await expect(results.first()).toContainText(formatAmountL1("270.00"));
  await expect(agenda5.getByTestId("meeting-scenario-results-empty")).toHaveCount(0);
  // V3-7（§7.6 第 1 點）：會議頁的「匯出 PDF」在頁首「匯出會議」下拉裡，說明行是 pdfHint；點了選單關閉。
  const outputs = meeting.getByTestId("meeting-outputs");
  const meetingPdf = await meetingExportItem(page, "pdf");
  await expect(outputs.getByText(labels.meeting.page.pdfHint, { exact: true })).toBeVisible();
  await expect(meetingPdf).toHaveAccessibleDescription(labels.meeting.page.pdfHint);
  await meetingPdf.click();
  await expect(outputs).not.toHaveAttribute("open", "");
  await expect.poll(printCalls).toBe(3);
  await expect(print).toHaveCount(1);
  // 有會議稿：版頭四行（資料集名稱是畫面上的名稱）之後是會議名稱、日期與資料日一行（print-header-meeting），範圍一行不再重複資料日。
  const printMeta = templateRe(labels.meeting.page.printHeader, { name: defaultMeetingName, date: today, asOf: GOLDEN_AS_OF });
  // 畫面模式下列印版面是隱藏的（getByRole 不含隱藏元素），版頭以 testid／標籤定位。
  await expect(print.getByTestId("print-header-dataset")).toHaveText(GOLDEN_HEADER.datasetName);
  await expect(print.getByTestId("print-report-header").locator(":scope > h1")).toHaveText(exportReportTitle());
  await expect(print.getByTestId("print-header-period").locator("span")).toHaveText([exportPeriodLine(GOLDEN_HEADER), headerV3.unitExclusive]);
  await expect(print.getByTestId("print-header-version")).toHaveText(exportVersionLineRe());
  await expect(print.getByTestId("print-header-meeting")).toHaveText(printMeta);
  await expect(print.getByTestId("print-header-scope")).toHaveText(fill(headerV3.printScopeMeeting, { state: labels.meeting.form.decisions.draft, channels: channelsLabel(["DTC", "MARKETPLACE"], false), mode: labels.shell.periods.sameDays }));
  await expect(print.locator(":scope > ol > li")).toHaveCount(3);
  // 第一頁的決議行在關鍵差額之後、三件事（h2）之前。
  const decisionLine = print.getByTestId("print-decision-line");
  await expect(decisionLine).toHaveText(fill(summaryCopy.printMeetingLine, { name: defaultMeetingName, state: labels.meeting.form.decisions.draft, notes: "" }));
  const neighbours = await decisionLine.evaluate(element => ({ previous: element.previousElementSibling?.textContent ?? "", nextTag: element.nextElementSibling?.tagName ?? "", next: element.nextElementSibling?.textContent ?? "" }));
  expect(neighbours.previous).toContain(labels.metrics.contribution_after_marketing.headline);
  expect(neighbours).toMatchObject({ nextTag: "H2", next: labels.overview.sections.topThree });
  // 選入方案在第一頁只有一行；五項假設（數量、折扣、履約、廣告、一次性成本）在附錄。
  await expect(print.getByTestId("print-scenario-line")).toHaveCount(1);
  await expect(print.getByTestId("print-scenario-line")).toContainText(formatAmountL1("270.00"));
  const assumptions = print.getByTestId("print-appendix-assumptions");
  await expect(assumptions).toHaveCount(1);
  await expect(assumptions).toContainText(firstPlanName);
  expect(await assumptions.locator("li").count()).toBeGreaterThanOrEqual(5);
  // V3-7：「結束列印」不在下拉內，是頁首動作列（review-workbench）裡、下拉旁的按鈕。
  const exit = basics(meeting).getByRole("button", { name: labels.meeting.managerSummary.exitPrint, exact: true });
  await expect(exit).toBeVisible();
  // 會議版的 A4 PDF 同樣剛好 2 頁（第一頁＋附錄）；page.pdf() 觸發 afterprint，列印版面與「結束列印」一起移除（afterprint 再送一次只是保險）。
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  const meetingPdfBytes = await page.pdf({ format: "A4", printBackground: true });
  expect(meetingPdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdfPages(meetingPdfBytes)).toBeGreaterThanOrEqual(2);
  expect(pdfPages(meetingPdfBytes)).toBeLessThanOrEqual(2);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(exit).toHaveCount(0);
  // 再從「匯出會議」列印一次，按「結束列印」回到畫面：列印版面移除，焦點回到「匯出會議」。
  await (await meetingExportItem(page, "pdf")).click();
  await expect.poll(printCalls).toBe(4);
  await expect(print).toHaveCount(1);
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(print).toHaveCount(0);
  await expect(exit).toHaveCount(0);
  await expect(page.getByTestId("export-page-meeting")).toBeFocused();
});

test("e. 總覽一行入口切到會議紀錄；導覽：桌機側欄四組＋開發者組（七頁＋開發者驗證）、手機底部分頁列 5 格＋「更多」4 項；每頁都沒有水平捲動", async ({ page }) => {
  await loadDataset(page, "golden");
  if (isMobile(page)) {
    // V3-3 手機：首次保存提示出現時，使用者打開的「更多」面板（頁面）與頂欄「更多」工具列（儲存／匯出）在提示之上、點得到
    //（產品決定：展開中的 .topbar／.mobile-tabbar 以 --z-overlay 疊在非 modal 的 .local-save-prompt 之上；收起「更多」後提示仍可回應）。
    await expect(page.getByTestId("local-save-prompt")).toBeVisible();
    await openMobileMore(page);
    const onTop = (locator: Locator) => locator.evaluate(element => { const box = element.getBoundingClientRect(); const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return !!hit && element.contains(hit); });
    expect(await onTop(navControl(page, "products")), "「更多」面板的項目不應被首次保存提示蓋住").toBe(true);
    expect(await onTop(page.getByTestId("workspace-storage").locator(":scope > summary")), "頂欄「更多」的儲存選單不應被首次保存提示蓋住").toBe(true);
    await page.getByTestId("mobile-tabbar-more").click();
    await expect(page.getByTestId("mobile-more")).toBeHidden();
  }
  await declineSavePrompt(page);
  await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
  // 舊的總覽會議 <details> 已移除，只剩一行入口 <p>。
  await expect(page.getByTestId("overview-meeting")).toHaveCount(0);
  await expect(page.getByTestId("meeting-page")).toHaveCount(0);
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toBeVisible();
  expect(await entry.evaluate(element => element.tagName)).toBe("P");
  await expect(entry).toContainText(fill(entryUi.meetingEntry, { state: labels.meeting.form.decisions.draft }));
  await expect(entry).not.toContainText(meetingPage.entryLast.split("{date}")[0].trim());
  const go = entry.getByRole("button", { name: fill(entryUi.meetingGoAria, { text: fill(entryUi.meetingEntry, { state: labels.meeting.form.decisions.draft }), go: meetingPage.goToMeeting }), exact: true });
  await expect(go).toBeVisible();
  // 一行：入口內的文字與按鈕垂直置中在同一列（手機寬度允許換行，只檢查高度不超過兩行）。
  const rows = await entry.evaluate(element => new Set(Array.from(element.children).map(child => { const box = child.getBoundingClientRect(); return Math.round((box.top + box.height / 2) / 8); })).size);
  if (isMobile(page)) expect(rows).toBeLessThanOrEqual(2);
  else expect(rows).toBe(1);
  await go.click();
  await expect(page.getByTestId("meeting-page")).toBeVisible();
  await expect(sidebarNav(page, "meeting")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(labels.shell.nav.meeting.headline);

  // 側欄（主要導覽）：八個頁面按鈕、順序固定（D-V3-14＝A 維持 v2 順序），分在「看結果／找原因／做決定／管資料」四組＋「開發者」組。
  // R7-4：本案例經 #validation 載入，「開發者驗證」顯示到重新整理為止，故開發者組在。手機上側欄隱藏但仍掛載（同一份 DOM）。
  const sidebarButtons = page.locator("aside.sidebar nav button.nav-item");
  await expect(sidebarButtons).toHaveCount(navIds.length);
  await expect(sidebarButtons).toHaveText(navIds.map(id => labels.shell.nav[id].headline));
  expect(navGroups.flatMap(([, ids]) => ids)).toEqual([...navIds]);
  for (const [group, ids] of navGroups) {
    const root = page.getByTestId(`nav-group-${group}`);
    await expect(root).toHaveAttribute("role", "group");
    await expect(root.locator(".nav-group-title")).toHaveText(labels.shell.sidebarV3.groups[group]);
    await expect(root.locator("button.nav-item")).toHaveText(ids.map(id => labels.shell.nav[id].headline));
  }
  const width = await page.evaluate(() => window.innerWidth);
  const inViewport = async (buttons: Locator) => {
    for (const box of await buttons.evaluateAll(list => list.map(button => { const rect = button.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; }))) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
  };
  const tabbar = page.getByTestId("mobile-tabbar");
  if (!isMobile(page)) {
    // 桌機（含平板 768）：側欄看得到，組名是 role=group 的可及名稱；手機底部分頁列不顯示。
    await expect(page.getByRole("navigation", { name: labels.shell.sidebar.mainNavAria, exact: true })).toBeVisible();
    for (const [group] of navGroups) await expect(page.getByRole("group", { name: labels.shell.sidebarV3.groups[group], exact: true })).toBeVisible();
    await expect(tabbar).toBeHidden();
  } else {
    // 手機：側欄隱藏；底部分頁列（第二個 nav「手機導覽」）一列 5 格：總覽／健檢／待辦／會議／更多，每格都在視窗寬度內。
    await expect(page.locator("aside.sidebar")).toBeHidden();
    await expect(page.getByRole("navigation", { name: labels.shell.mobileNav.aria, exact: true })).toBeVisible();
    const tabs = tabbar.locator(":scope > button");
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText([...tabIds.map(id => labels.shell.mobileNav.tabs[id]), labels.shell.mobileNav.more]);
    for (const [index, id] of tabIds.entries()) await expect(tabs.nth(index)).toHaveAccessibleName(labels.shell.nav[id].headline);
    const tops = await tabs.evaluateAll(list => list.map(button => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    await inViewport(tabs);
    // 「更多」面板：商品毛利／假設試算／資料來源／開發者驗證，每項都在視窗寬度內。
    await openMobileMore(page);
    const moreItems = page.getByTestId("mobile-more").getByRole("button");
    await expect(moreItems).toHaveText(moreIds.map(id => labels.shell.nav[id].headline));
    await inViewport(moreItems);
  }

  // 每一頁都切得到（桌機點側欄；手機點分頁或「更多」→ 項目），切過去後是 aria-current="page"，而且沒有水平捲動。
  for (const id of navIds) {
    await navigateTo(page, id);
    await expect(sidebarNav(page, id)).toHaveAttribute("aria-current", "page");
    if (isMobile(page)) {
      // 手機：底部分頁的四頁本身是 aria-current；「更多」裡的頁面由「更多」那格標示（data-active），面板選完即關閉。
      if ((tabIds as readonly string[]).includes(id)) await expect(navControl(page, id)).toHaveAttribute("aria-current", "page");
      else {
        await expect(page.getByTestId("mobile-more")).toBeHidden();
        await expect(page.getByTestId("mobile-tabbar-more")).toHaveAttribute("data-active", "true");
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("f. 首次保存提示與自動保存：同意後立即保存、頂欄「已保存 hh:mm」、變更 2 秒內自動保存；刪除本機資料後停止；拒絕則維持手動", async ({ page }) => {
  test.setTimeout(90_000);
  const savedAtRe = templateIn(labels.shell.status.savedAt, {}, { time: "\\d{2}:\\d{2}" });
  const hasDatabase = () => page.evaluate(async name => (await indexedDB.databases()).some(row => row.name === name), DATABASE);
  /** 只在資料庫已存在時開啟（不帶版本開啟不存在的資料庫會建立空資料庫，干擾 app 的升版）。 */
  const readSaved = () => page.evaluate(async name => {
    if (!(await indexedDB.databases()).some(row => row.name === name)) return null;
    const database = await new Promise<IDBDatabase>((done, fail) => { const request = indexedDB.open(name); request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error); });
    try {
      if (!database.objectStoreNames.contains("workspace")) return null;
      const get = (key: string) => new Promise<unknown>((done, fail) => { const request = database.transaction("workspace", "readonly").objectStore("workspace").get(key); request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error); });
      const text = await get("explicitly-saved"), at = await get("explicitly-saved-at");
      if (typeof text !== "string") return null;
      const wire = JSON.parse(text) as { schema_version: string; payload: { review_session: { name: string } | null } };
      return { schema: wire.schema_version, meetingName: wire.payload.review_session?.name ?? null, at: typeof at === "string" ? at : null };
    } finally { database.close(); }
  }, DATABASE);

  await page.goto("/");
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
  await loadDataset(page, "golden");
  // 提示：非 modal 的 role=dialog，標題與說明都從 labels 取字；同意前不建立本機資料庫。
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveAttribute("role", "dialog");
  await expect(prompt).not.toHaveAttribute("aria-modal", "true");
  await expect(prompt.getByRole("heading", { name: auto.promptTitle, exact: true })).toBeVisible();
  await expect(prompt).toContainText(auto.promptBody);
  expect(await hasDatabase()).toBe(false);
  const tag = page.getByTestId("workspace-storage").locator(":scope > summary");
  await expect(tag).toContainText(labels.shell.status.unsaved);

  await acceptSavePrompt(page);
  await expect(prompt).toHaveCount(0);
  // 同意後立即保存一次：頂欄「已保存 hh:mm」、本機資料庫有 v4 備份與保存時間。
  await expect(tag).toContainText(savedAtRe);
  await expect.poll(readSaved).toMatchObject({ schema: WORKSPACE_VERSION, meetingName: defaultMeetingName });
  const first = (await readSaved())!;
  expect(first.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const menu = await openStorage(page);
  await expect(menu.getByTestId("autosave-status")).toContainText(auto.statusOn);
  await expect(menu.getByRole("checkbox", { name: store.consent, exact: true })).toBeChecked();
  await closeStorage(page);

  // 變更（改會議名稱）→ 頂欄先顯示未保存，2 秒內自動保存，資料庫內容跟著更新。
  const meeting = await openMeeting(page);
  const renamed = "R6 自動保存測試會議";
  await basics(meeting).getByLabel(labels.meeting.form.name, { exact: true }).fill(renamed);
  await expect(tag).toContainText(labels.shell.status.unsaved);
  // 沒有任何手動操作就自動保存：等待上限＝2 秒排程＋匯出、重新驗證與寫入 IndexedDB（機器負載高時較慢）。
  await expect(tag).toContainText(savedAtRe, { timeout: 8_000 });
  await expect.poll(readSaved, { timeout: 8_000 }).toMatchObject({ meetingName: renamed });
  expect(Date.parse((await readSaved())!.at!)).toBeGreaterThan(Date.parse(first.at!));
  await expect(page.getByTestId("autosave-error")).toHaveCount(0);

  // 刪除本機資料：資料庫移除、同意取消、改回手動；之後的變更不再寫入。
  const storage = await openStorage(page);
  await storage.getByRole("button", { name: labels.storage.buttons.deleteLocal, exact: true }).click();
  await expect(storage.getByTestId("storage-notice")).toHaveText(store.deletedNotice);
  await expect(storage.getByTestId("autosave-status")).toContainText(auto.statusOff);
  await expect(storage.getByRole("checkbox", { name: store.consent, exact: true })).not.toBeChecked();
  expect(await hasDatabase()).toBe(false);
  await closeStorage(page);
  await basics(meeting).getByLabel(labels.meeting.form.name, { exact: true }).fill("R6 刪除後的修改");
  await expect(tag).toContainText(labels.shell.status.unsaved);
  // 超過 2 秒排程後仍沒有寫入（等 4 秒，涵蓋排程＋寫入時間）。
  await page.waitForTimeout(4_000);
  expect(await hasDatabase()).toBe(false);
  await expect(tag).toContainText(labels.shell.status.unsaved);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
});

test("f2. 首次保存提示選「先不要」：維持手動、不建立本機資料庫；清空後再載入會再問一次", async ({ page }) => {
  test.setTimeout(90_000);
  const hasDatabase = () => page.evaluate(async name => (await indexedDB.databases()).some(row => row.name === name), DATABASE);
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const menu = await openStorage(page);
  await expect(menu.getByTestId("autosave-status")).toHaveText(auto.statusOff);
  await expect(menu.getByRole("checkbox", { name: store.consent, exact: true })).not.toBeChecked();
  await expect(menu.getByRole("button", { name: labels.storage.buttons.saveLocal, exact: true })).toBeDisabled();
  await closeStorage(page);
  const meeting = await openMeeting(page);
  await basics(meeting).getByLabel(labels.meeting.form.name, { exact: true }).fill("R6 手動保存");
  await page.waitForTimeout(4_000);
  expect(await hasDatabase()).toBe(false);
  await expect(page.getByTestId("workspace-storage").locator(":scope > summary")).toContainText(labels.shell.status.unsaved);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
  // Escape 等於「先不要」：清空後再載入，提示再出現；在提示內按 Escape 關閉。V3-3：「清空」在儲存選單的危險區。
  await clickReplacing(page, await clearButton(page));
  await expect(status(page)).toContainText(labels.shell.status.empty);
  await closeStorage(page);
  await loadDataset(page, "golden");
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: auto.decline, exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  expect(await hasDatabase()).toBe(false);
});

test("g. 會議歷史：Markdown 檔名 profitlens-meeting-<日期>.md、主文有「## 口徑」與臺北結束時間、選單下載同一份；移除先確認（取消／確定）→ 歷史 0 筆、狀態宣告、焦點回到標題", async ({ page }) => {
  test.setTimeout(90_000);
  const today = taipeiToday();
  const notes = "R6 g 的會議備註";
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const meeting = await openMeeting(page);
  // 先填備註再選決議（改備註會讓已選的決議回到草稿，要重新確認）。V3-7（§7.6 第 5 點）：備註在議程之後（#meeting-notes-input），不在頁首的決議區。
  const notesInput = meeting.getByLabel(labels.meeting.form.notes, { exact: true });
  await expect(notesInput).toHaveAttribute("id", "meeting-notes-input");
  await expect(meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.notes, { exact: true })).toHaveCount(0);
  await notesInput.fill(notes);
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true }).selectOption("needs_data");
  const before = Date.now();
  await finalizeMeeting(meeting);
  const after = Date.now();
  const items = meeting.getByTestId("meeting-history-item");
  await expect(items).toHaveCount(1);
  const summary = items.first().locator("summary");
  await expect(summary).toHaveText(historyTitle(defaultMeetingName, today, "need_data"));
  const title = await summary.innerText();

  // 歷史項目的 Markdown：檔名帶會議日期；主文的結束時間是臺北時間 YYYY-MM-DD hh:mm（ISO 原值只在技術細節）；有「## 口徑」段；④ 從紀錄本身讀（第一次會議沒有上次）。
  const history = await downloadFrom(page, items.first().getByRole("button", { name: `${labels.exports.buttons.exportMarkdown} · ${title}`, exact: true }));
  expect(history.download.suggestedFilename()).toBe(`profitlens-meeting-${today}.md`);
  const markdown = history.bytes.toString("utf8");
  const [body, technical] = markdown.split(`## ${labels.evidence.sections.technicalDetails}`);
  expect(body.split("\n")[0]).toBe(fill(record.mdTitle, { brand: labels.brand.name, name: defaultMeetingName }));
  const finalizedTimes = [...new Set([formatSavedDateTime(new Date(before)), formatSavedDateTime(new Date(after))])];
  // V3-7 §7.9：標題與空行之後是版頭四行（資料集＝畫面上的名稱；會議紀錄的產出時間＝結束時間），再一行空白；v3 結束的紀錄沒有「本紀錄建立於 v2」加註。
  expectExportHeader(markdownHeader(markdown), { ...GOLDEN_HEADER, time: `(?:${finalizedTimes.map(escapeRe).join("|")})` }, { hardBreaks: true });
  expect(body.split("\n")[6]).toBe("");
  expect(markdown).not.toContain(pageV3.v2Note);
  expect(body).toMatch(templateIn(record.mdMeta, { date: labels.meeting.form.date, value: today, decision: labels.meeting.form.decision }, { state: confirmedRe("need_data"), finalizedAt: `(?:${finalizedTimes.map(escapeRe).join("|")})` }));
  expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  expect(technical).toMatch(/- finalized_at：\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  const lines = body.split("\n");
  const basisAt = lines.indexOf(record.mdBasis);
  expect(basisAt, "主文有「## 口徑」段").toBeGreaterThan(lines.indexOf(record.mdScope));
  expect(lines[basisAt + 2]).toMatch(/^- \S/);
  expect(body).toContain(`### ${record.agenda.followUp}\n\n${record.noLastMeeting}\n`);
  expect(body).toContain(fill(record.mdField, { field: labels.meeting.form.notes, value: notes }));

  // 「下載 ▾」的「下載會議紀錄 Markdown」：有已結束的會議就下載最近一筆，內容與歷史項目相同；完成後焦點回到「下載」。
  const menu = await openDownloads(page);
  const fromMenu = await downloadFrom(page, menu.getByRole("button", { name: meetingPage.menuMarkdown, exact: true }));
  expect(fromMenu.download.suggestedFilename()).toBe(`profitlens-meeting-${today}.md`);
  expect(fromMenu.bytes.toString("utf8")).toBe(markdown);
  await expect(page.getByTestId("download-menu").locator(":scope > summary")).toBeFocused();
  await closeDownloads(page);

  // 移除：按鈕（aria-expanded）→ 確認區（role=group，提醒先下載 Markdown，焦點在提醒句）；取消回到按鈕、歷史不變。
  const remove = meeting.getByRole("button", { name: `${meetingPage.removeMeeting} · ${title}`, exact: true });
  await expect(remove).toHaveText(meetingPage.removeMeeting);
  await expect(remove).toHaveAttribute("data-testid", /^meeting-history-remove-.+$/);
  await expect(remove).toHaveAttribute("aria-expanded", "false");
  const region = meeting.getByTestId("meeting-history-remove-confirm-region");
  await expect(region).toHaveCount(0);
  await remove.click();
  await expect(remove).toHaveAttribute("aria-expanded", "true");
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute("role", "group");
  await expect(region.getByText(meetingPage.removeWarning, { exact: true })).toBeFocused();
  await expect(page.getByRole("group", { name: meetingPage.removeWarning, exact: true })).toBeVisible();
  await region.getByRole("button", { name: labels.shell.buttons.cancel, exact: true }).click();
  await expect(region).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(remove).toHaveAttribute("aria-expanded", "false");
  await expect(items).toHaveCount(1);
  // Esc 也是取消。
  await remove.click();
  await expect(region).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(items).toHaveCount(1);

  // 確定移除：歷史 0 筆、顯示「還沒有已結束的會議」、狀態宣告移除了哪一筆、焦點回到「會議歷史」標題；④ 與比較區回到沒有上次會議。
  await remove.click();
  await region.getByTestId("meeting-history-remove-confirm").click();
  await expect(items).toHaveCount(0);
  await expect(region).toHaveCount(0);
  await expectMeetingHistoryEmpty(meeting.getByTestId("meeting-history"));
  await expect(meeting.getByTestId("meeting-history-status")).toHaveText(fill(meetingPage.removed, { name: defaultMeetingName, date: today }));
  await expect(meeting.getByTestId("meeting-history").getByRole("heading", { name: meetingPage.history, exact: true })).toBeFocused();
  await expect(meeting.getByTestId("meeting-agenda-4")).toContainText(record.noLastMeeting);
  await expect(meeting.getByTestId("meeting-compare")).toContainText(record.noLastMeeting);
  // 總覽入口回到「本期會議：草稿」，不再顯示已結束或上次會議日期。
  await navigateTo(page, "overview");
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(entryUi.meetingEntry, { state: labels.meeting.form.decisions.draft }));
  await expect(entry).not.toContainText(fill(entryUi.meetingEntryFinalized, { date: today }));
  await expect(entry).not.toContainText(fill(meetingPage.entryLast, { date: today }));
});

test("h. 會議頁頁首與議程目錄：複製週會摘要（沒有剪貼簿權限 → 備案對話框；有權限 → 狀態一句、剪貼簿是週會摘要、與匯出選單「會議」組同一份）；議程目錄 6 個連結與 aria-current；比較預設收合", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  const meeting = await openMeeting(page);
  const head = basics(meeting);
  // V3-7（§7.6 第 1 點）：頁首動作列＝標題、會議名稱、日期、決議＋結束會議、複製週會摘要、匯出會議。
  await expect(head.getByTestId("meeting-title")).toHaveText(pageV3.title);
  await expect(head.getByTestId("meeting-title")).toHaveJSProperty("tagName", "H2");
  await expect(head.getByLabel(labels.meeting.form.name, { exact: true })).toHaveValue(defaultMeetingName);
  await expect(head.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true })).toHaveValue("draft");
  await expect(head.getByTestId("export-page-meeting")).toHaveText(pageV3.exportMenu);
  const copyButton = head.getByTestId("meeting-copy-summary");
  await expect(copyButton).toHaveText(entryUi.copy);
  const copyStatus = head.getByTestId("meeting-copy-summary-status");
  await expect(copyStatus).toHaveAttribute("role", "status");
  await expect(copyStatus).toHaveText("");
  // 週會摘要純文字：第 1 行「週會摘要」、第 2 行畫面上的資料集名稱。
  const weeklyStart = new RegExp(`^${escapeRe(`${labels.summary.weekly.title}\n${labels.shell.devValidation.datasets.golden}\n`)}`);

  // 沒有剪貼簿權限：開備案對話框（modal，唯讀文字框已聚焦、內容是週會摘要）；「關閉」後焦點回到按鈕，狀態列不顯示成功。
  await copyButton.click();
  const fallback = page.getByTestId("copy-summary-fallback");
  await expect(fallback).toBeVisible();
  await expect(page.getByRole("dialog", { name: entryUi.fallbackTitle, exact: true })).toBeVisible();
  await expect(fallback).toContainText(entryUi.fallbackBody);
  const area = fallback.getByRole("textbox", { name: entryUi.fallbackTextAria, exact: true });
  await expect(area).toBeFocused();
  await expect(area).toHaveValue(weeklyStart);
  await fallback.getByRole("button", { name: labels.shell.buttons.close, exact: true }).click();
  await expect(fallback).toHaveCount(0);
  await expect(copyButton).toBeFocused();
  await expect(copyStatus).toHaveText("");

  // 有剪貼簿權限：成功一句（role=status，2 秒後清空），剪貼簿是週會摘要；不再開備案。
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await copyButton.click();
  await expect(copyStatus).toHaveText(entryUi.copied);
  await expect(page.getByTestId("copy-summary-fallback")).toHaveCount(0);
  const fromMeeting = await page.evaluate(() => navigator.clipboard.readText());
  expect(fromMeeting).toMatch(weeklyStart);
  await expect(copyStatus).toHaveText("", { timeout: 6_000 });
  // 頂欄「匯出」選單的「會議」組：同一份週會摘要（會議範圍＝目前檢視）；成功一句在選單內的 role=status。
  await page.evaluate(() => navigator.clipboard.writeText(""));
  const menu = await openDownloads(page);
  await menu.getByTestId("download-copy-summary").click();
  await expect(menu.getByTestId("download-copy-summary-status")).toHaveText(menuV3.copied);
  await expect(menu.getByTestId("download-copy-summary-fallback")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(fromMeeting);
  await closeDownloads(page);

  // 議程目錄（nav，名稱＝議程目錄）：6 個連結＝議程 1–6 的標題，錨點 #meeting-agenda-1…6。
  const toc = meeting.getByRole("navigation", { name: pageV3.tocAria, exact: true });
  const titles = [record.agenda.kpis, record.agenda.priorities, record.agenda.channels, record.agenda.followUp, record.agenda.scenarios, record.agenda.actions];
  const links = toc.getByRole("link");
  await expect(links).toHaveText(titles);
  for (const [index, title] of titles.entries()) {
    await expect(links.nth(index)).toHaveAttribute("href", `#meeting-agenda-${index + 1}`);
    await expect(meeting.locator(`#meeting-agenda-${index + 1}-title`)).toHaveText(title);
  }
  // 點連結：捲到該議程（網址錨點跟著換），同時只有一個連結是 aria-current="location"。
  // 議程 1–5 點完後 aria-current 就是被點的那一項。議程 6 在頁尾：1280×900 時頁面捲不到讓它進入 IntersectionObserver 的判定帶，
  // aria-current 會停在議程 5（已列入 product_issues）；這裡對議程 6 只驗證捲到、錨點與唯一的 aria-current。
  for (const [index] of titles.entries()) {
    await links.nth(index).click();
    await expect(meeting.getByTestId(`meeting-agenda-${index + 1}`)).toBeInViewport();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#meeting-agenda-${index + 1}`);
    if (index < titles.length - 1) await expect(links.nth(index)).toHaveAttribute("aria-current", "location");
    await expect(toc.locator("a[aria-current]")).toHaveCount(1);
  }

  // §7.6 第 6 點：「與上次會議比較」預設收合（內容保持掛載）；展開後看得到內容（第一次會議：沒有上次會議）。
  const compare = meeting.getByTestId("meeting-compare");
  await expect(compare).not.toHaveAttribute("open", "");
  const none = compare.getByText(record.noLastMeeting, { exact: true });
  await expect(none).toHaveCount(1);
  await expect(none).toBeHidden();
  await openCompare(meeting);
  await expect(compare).toHaveAttribute("open", "");
  await expect(none).toBeVisible();
});

test("i. v2 結束的會議紀錄（D-V3-22）：還原含 v2 紀錄（沒有 copy_version）的備份 → 歷史項目多一行「本紀錄建立於 v2」，會議紀錄 Markdown 在版頭之後加註；數字與決議照紀錄", async ({ page }) => {
  // 長流程（結束會議、備份下載、清空、恢復）；只放寬時間，不放寬斷言。
  test.setTimeout(120_000);
  const today = taipeiToday();
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  let meeting = await openMeeting(page);
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true }).selectOption("adopted");
  await finalizeMeeting(meeting);
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(meeting.getByTestId("meeting-v2-note")).toHaveCount(0);

  // 備份 v4：v3 結束的紀錄帶 copy_version "v3"。把它拿掉（＝v2 結束的紀錄），重算備份的 SHA-256 checksum（同 app：decisionSignature 正規化後雜湊）。
  const storage = await openStorage(page);
  const backup = await downloadFrom(page, storage.getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }));
  await storage.getByRole("button", { name: store.confirmDownloaded, exact: true }).click();
  await closeStorage(page);
  const wire = JSON.parse(backup.bytes.toString("utf8"));
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.meeting_history).toHaveLength(1);
  const saved = wire.payload.meeting_history[0];
  expect(saved.copy_version).toBe("v3");
  delete saved.copy_version;
  delete wire.checksum;
  const v2Backup = Buffer.from(JSON.stringify({ ...wire, checksum: createHash("sha256").update(decisionSignature(wire), "utf8").digest("hex") }), "utf8");

  // 清空 → 讀回改過的備份（V3-3：「清空」在儲存選單的危險區）。
  await clickReplacing(page, await clearButton(page));
  await expect(status(page)).toContainText(labels.shell.status.empty);
  const fresh = await openStorage(page);
  await fresh.getByLabel(store.selectBackupFile, { exact: true }).setInputFiles({ name: "v3-7-v2-meeting.json", mimeType: "application/json", buffer: v2Backup });
  await expect(page.getByRole("region", { name: store.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, fresh.getByRole("button", { name: store.applyRestore, exact: true }));
  await expect(status(page)).toContainText(ready("golden"));
  await expect(fresh.getByTestId("storage-notice")).toHaveText(store.restoredNotice);
  await closeStorage(page);
  await declineSavePrompt(page);

  // 歷史項目：摘要不變；展開後頂部是結束標示，接著「本紀錄建立於 v2，部分名稱已更新。」；KPI 照紀錄（L1）。
  meeting = await openMeeting(page);
  const items = meeting.getByTestId("meeting-history-item");
  await expect(items).toHaveCount(1);
  const summary = items.first().locator("summary");
  await expect(summary).toHaveText(historyTitle(defaultMeetingName, today, "adopted"));
  await summary.click();
  await expect(items.first().locator("details > p.meeting-snapshot-note")).toHaveText([fill(pageV3.snapshotNote, { date: formatDateL1(today, { today }) }), pageV3.v2Note]);
  await expect(items.first().locator("details > summary + p")).toHaveAttribute("data-testid", "meeting-snapshot-note");
  await expect(items.first().locator("details > summary + p + p")).toHaveAttribute("data-testid", "meeting-v2-note");
  await expect(items.first().getByTestId("meeting-v2-note")).toBeVisible();
  await expect(items.first().getByTestId("meeting-v2-note")).toHaveText(pageV3.v2Note);
  await expect(items.first().locator("details > ul").first().locator("li")).toHaveText([
    fill(meetingPage.historyKpiRow, { metric: labels.metrics.net_revenue.headline, previous: formatAmountL1("2250.00"), current: formatAmountL1("2470.00"), change: formatSignedDelta("220.00", "L1") }),
    fill(meetingPage.historyKpiRow, { metric: labels.metrics.contribution_after_marketing.headline, previous: formatAmountL1("570.00"), current: formatAmountL1("255.00"), change: formatSignedDelta("-315.00", "L1") }),
  ]);

  // 會議紀錄 Markdown：「# 標題」、空行、版頭四行（產出時間＝結束時間）、空行，接著 v2 加註與空行，再來才是會議資訊。
  const title = await summary.innerText();
  const history = await downloadFrom(page, items.first().getByRole("button", { name: `${labels.exports.buttons.exportMarkdown} · ${title}`, exact: true }));
  expect(history.download.suggestedFilename()).toBe(`profitlens-meeting-${today}.md`);
  const markdown = history.bytes.toString("utf8");
  const lines = markdown.split("\n");
  const finalizedAt = escapeRe(formatSavedDateTime(new Date(saved.finalized_at)));
  expect(lines[0]).toBe(fill(record.mdTitle, { brand: labels.brand.name, name: defaultMeetingName }));
  expectExportHeader(markdownHeader(markdown), { ...GOLDEN_HEADER, time: finalizedAt }, { hardBreaks: true });
  expect(lines.slice(6, 9)).toEqual(["", pageV3.v2Note, ""]);
  expect(lines[9]).toMatch(templateRe(record.mdMeta, { date: labels.meeting.form.date, value: today, decision: labels.meeting.form.decision }, { state: confirmedRe("adopted"), finalizedAt }));
  expect(markdown.split(pageV3.v2Note)).toHaveLength(2);
  // 頂欄「會議紀錄 Markdown」下載最近一筆（同一份紀錄）：內容相同。
  const fromMenu = await downloadFrom(page, (await openDownloads(page)).getByRole("button", { name: meetingPage.menuMarkdown, exact: true }));
  expect(fromMenu.bytes.toString("utf8")).toBe(markdown);
  await closeDownloads(page);
});
