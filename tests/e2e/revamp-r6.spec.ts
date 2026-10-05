import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { expect, test as base, type Download, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { channelsLabel } from "../../src/application/copy";
import { formatSavedDateTime } from "../../src/application/auto-save";
import { acceptSavePrompt, clickReplacing, closeDownloads, dismissSavePrompt, openDownloads, openMeeting, openValidation, startChannelContext, switchActionsView } from "./replacement-helpers";

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

const dash = labels.ui.dashboard;
const meetingPage = labels.meetingPage;
const record = labels.meetingRecord;
const review = labels.ui.reviewWorkbench;
const store = labels.ui.workspaceStorage;
const auto = labels.autoSave;
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
const nav = (page: Page, id: typeof navIds[number]) => page.getByRole("button", { name: labels.nav[id].label, exact: true });
const status = (page: Page) => page.getByTestId("workspace-status");
const outputDir = (...parts: string[]) => resolve("verification/revamp-R6", ...parts);
const defaultMeetingName = labels.ui.reviewSession.defaultName;
const firstPlanName = fill(labels.ui.decisionWorkbench.defaultPlanName, { n: 1 });
const summaryCopy = labels.ui.managerSummary;
/** golden 的資料日（fixtures/golden/manifest.json 的 data_as_of）。 */
const GOLDEN_AS_OF = "2026-08-03";
/** V3-2a：status.ready 帶 {date}＝資料集 manifest 的 data_as_of（demo 為 2026-08-24）。 */
const DATA_AS_OF = { golden: GOLDEN_AS_OF, demo: "2026-08-24" } as const;
const ready = (id: keyof typeof DATA_AS_OF) => fill(labels.status.ready, { date: DATA_AS_OF[id] });
/** 「採用（第 n 版確認）」：版號是會議稿的修訂次數，只要求是數字。 */
const confirmedRe = (decision: keyof typeof labels.meeting.decisions) => escapeRe(fill(record.decisionConfirmed, { decision: labels.meeting.decisions[decision], revision: "§" })).replace("§", "\\d+");
const historyTitle = (name: string, date: string, decision: keyof typeof labels.meeting.decisions) => templateRe(meetingPage.historyItem, { name, date }, { decision: confirmedRe(decision) });
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
  await page.getByLabel(dash.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: dash.validation.loadButton, exact: true }));
  await expect(status(page)).toContainText(ready(id));
}
/** 首次載入（或清空、從備份恢復）後一定會出現保存提示：等它出現再按「先不要」，避免手機版底部提示蓋住按鈕。 */
async function declineSavePrompt(page: Page) {
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: auto.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
}
async function openStorage(page: Page) {
  const menu = page.getByTestId("workspace-storage");
  if (await menu.getAttribute("open") === null) await menu.locator(":scope > summary").click();
  await expect(menu).toHaveAttribute("open", "");
  return menu;
}
async function closeStorage(page: Page) {
  const menu = page.getByTestId("workspace-storage");
  if (await menu.getAttribute("open") !== null) await menu.locator(":scope > summary").click();
  await expect(menu).not.toHaveAttribute("open", "");
}
async function downloadFrom(page: Page, button: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const event = page.waitForEvent("download");
  await button.click();
  const download = await event;
  return { download, bytes: await readFile((await download.path())!) };
}
/** 試算頁：DTC 方案 1 套用「維持現況」範本 → 計算，得到基準 270.00。 */
async function calculateKeepPlan(page: Page) {
  await nav(page, "scenarios").click();
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText("270.00");
  await expect(card.getByTestId("scenario-delta")).toHaveText("0.00");
}
/** 行動頁（看板）：新增一張待辦、填問題、按星號置頂。 */
async function addPinnedAction(page: Page, problem: string) {
  await nav(page, "actions").click();
  await switchActionsView(page, "board");
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  const card = page.getByTestId("board-card-1");
  await card.getByLabel(labels.actions.problem, { exact: true }).fill(problem);
  await card.getByRole("button", { name: labels.buttons.pin, exact: true }).click();
  await expect(card.getByRole("button", { name: labels.ui.actionsWorkbench.unpin, exact: true })).toHaveAttribute("aria-pressed", "true");
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
const basics = (meeting: Locator) => meeting.getByTestId("review-workbench");
async function expectSameScopeCompare(meeting: Locator) {
  const compare = meeting.getByTestId("meeting-compare");
  const same = compare.getByTestId("meeting-compare-same_scope");
  await expect(same).toBeVisible();
  await expect(compare.getByTestId("meeting-compare-different_dataset")).toHaveCount(0);
  await expect(same.getByTestId("meeting-compare-note")).toHaveText(record.sameScope);
  await expect(same).toContainText(fill(meetingPage.compareKind, { kind: record.kinds.same_scope }));
  const rows = same.getByTestId("meeting-compare-kpis").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.locator("th")).toHaveText([labels.metrics.net_revenue.label, labels.metrics.contribution_after_marketing.label]);
  await expect(rows.nth(0).locator("td")).toHaveText(["2,470.00", "2,470.00", "0.00"]);
  await expect(rows.nth(1).locator("td")).toHaveText(["255.00", "255.00", "0.00"]);
  // 上次／本次三件事：同資料同範圍，兩邊都是同樣三項（−315.00、−250.00、−150.00）。
  for (const title of [record.lastPriorities, record.currentPriorities]) {
    const list = same.locator("div").filter({ has: meeting.page().getByRole("heading", { name: title, exact: true }) }).last().locator("ul > li");
    await expect(list).toHaveCount(3);
    for (const [index, amount] of ["-315.00", "-250.00", "-150.00"].entries()) await expect(list.nth(index)).toHaveText(new RegExp(`^${index + 1}\\. .+${escapeRe(amount)}$`));
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
  await expect(nav(page, "meeting")).toHaveAttribute("aria-current", "page");
  // 載入資料時已自動建立會議稿；沒有的話按「建立這次的會議紀錄」。
  if (await meeting.getByRole("button", { name: review.createButton, exact: true }).count()) await meeting.getByRole("button", { name: review.createButton, exact: true }).click();
  await expect(basics(meeting).getByLabel(labels.meeting.name, { exact: true })).toHaveValue(defaultMeetingName);
  // 會議日期預設臺北今天，input[type=date]。
  const dateInput = basics(meeting).getByLabel(labels.meeting.date, { exact: true });
  await expect(dateInput).toHaveAttribute("type", "date");
  await expect(dateInput).toHaveValue(today);
  await basics(meeting).getByLabel(labels.meeting.name, { exact: true }).fill(name);
  await expect(basics(meeting).getByLabel(labels.meeting.name, { exact: true })).toHaveValue(name);
  // 議程 ①–⑥：①–③ 是會議模式的主管摘要（② 標題「② 本期三件事」），④ 還沒有上次會議。
  await expect(meeting.getByTestId("meeting-agenda").getByTestId("manager-summary")).toBeVisible();
  await expect(meeting.getByTestId("meeting-agenda").getByRole("heading", { name: record.agenda.priorities, exact: true })).toBeVisible();
  await expect(meeting.getByTestId("manager-summary").getByRole("button", { name: labels.buttons.print, exact: true })).toHaveCount(0);
  await expect(meeting.getByTestId("meeting-agenda-4")).toContainText(record.noLastMeeting);
  await expect(meeting.getByTestId("meeting-compare")).toContainText(record.noLastMeeting);
  await expect(meeting.getByTestId("meeting-history")).toContainText(meetingPage.historyEmpty);
  // ⑤ 每個通路一個下拉：DTC 選入「方案 1」（270.00）。
  const dtcSelect = meeting.getByTestId("meeting-agenda-5").getByLabel(fill(review.scenarioSelect, { channel: "DTC" }), { exact: true });
  await expect(meeting.getByTestId("meeting-agenda-5").locator("select")).toHaveCount(2);
  await dtcSelect.selectOption({ label: fill(review.planOption, { name: firstPlanName }) });
  await expect(dtcSelect.locator("option:checked")).toHaveText(fill(review.planOption, { name: firstPlanName }));
  // 決議「採用」。
  const decision = meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.decision, { exact: true });
  await decision.selectOption("adopted");
  await expect(decision.locator("option:checked")).toHaveText(labels.meeting.decisions.adopted);

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
  await expect(items.first().getByRole("button", { name: `${labels.buttons.exportMarkdown} · ${await items.first().locator("summary").innerText()}`, exact: true })).toBeVisible();
  await expect(basics(meeting).getByLabel(labels.meeting.name, { exact: true })).toHaveValue(defaultMeetingName);
  await expect(decision).toHaveValue("draft");
  await expect(dateInput).toHaveValue(today);
  // 結束成功後焦點移到新會議的「會議基本」標題。
  await expect(basics(meeting).getByRole("heading", { name: meetingPage.basics, exact: true })).toBeFocused();
  // 同一份資料、同範圍：比較區是 same_scope，KPI 差額 0.00；④ 列出上次決議與置頂待辦。
  await expectSameScopeCompare(meeting);
  const followUp = meeting.getByTestId("meeting-agenda-4").getByTestId("meeting-followup");
  await expect(followUp).toContainText(fill(record.mdLastMeeting, { name, date: today }));
  await expect(followUp.locator("thead th")).toHaveText(Object.values(meetingPage.followUpColumns));
  await expect(followUp.locator("tbody tr")).toHaveCount(1);
  await expect(followUp.locator("tbody tr th")).toHaveText(problem);
  await expect(followUp.locator("tbody tr td")).toHaveText([labels.actions.statuses.not_started, labels.actions.statuses.not_started, record.statusNotUpdated]);

  // 總覽只留一行入口：剛結束會議、新會議稿還沒動過 → 「本期會議：已結束（日期）· 新會議稿：草稿」（不再另列「上次會議 日期」）。
  await nav(page, "overview").click();
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(meetingPage.entryFinalized, { date: today }));
  await expect(entry).not.toContainText(fill(meetingPage.entry, { state: labels.meeting.decisions.draft }));
  await expect(entry).not.toContainText(fill(meetingPage.entryLast, { date: today }));

  // 備份 v4：meeting_history 一筆（凍結的議程：選入方案 270.00、置頂待辦一項）。
  const storage = await openStorage(page);
  const backup = await downloadFrom(page, storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true }));
  expect(backup.download.suggestedFilename()).toBe("profitlens-workspace.json");
  const text = backup.bytes.toString("utf8");
  const wire = JSON.parse(text);
  expect(wire.schema_version).toBe("profitlens-workspace-v4");
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

  // 清空 → 讀回備份：會議歷史仍一筆，比較仍是 same_scope（差額 0.00）。
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.clear, exact: true }));
  await expect(status(page)).toContainText(labels.status.empty);
  const fresh = await openStorage(page);
  await fresh.getByLabel(store.selectBackupFile, { exact: true }).setInputFiles({ name: "r6-meeting.json", mimeType: "application/json", buffer: backup.bytes });
  await expect(page.getByRole("region", { name: store.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, fresh.getByRole("button", { name: store.applyRestore, exact: true }));
  await expect(status(page)).toContainText(ready("golden"));
  await expect(fresh.getByTestId("storage-notice")).toHaveText(store.restoredNotice);
  await closeStorage(page);
  // 恢復後本機保存同意重設，提示再出現一次。
  await declineSavePrompt(page);
  const restored = await openMeeting(page);
  await expect(restored.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(restored.getByTestId("meeting-history-item").first().locator("summary")).toHaveText(historyTitle(name, today, "adopted"));
  await expectSameScopeCompare(restored);
  // 還原備份後新會議稿仍是未動過的第 1 版草稿：總覽入口同樣顯示「已結束（日期）」。
  await nav(page, "overview").click();
  await expect(page.getByTestId("overview-meeting-entry")).toContainText(fill(meetingPage.entryFinalized, { date: today }));
});

test("b. 不同資料的降級：golden 結束會議後換成示範資料，會議改用目前資料 → 比較區只留一句，上次決議與置頂待辦狀態只列在議程 ④", async ({ page }) => {
  test.setTimeout(120_000);
  const today = taipeiToday();
  const problem = "R6 跨資料追蹤的待辦";
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  await addPinnedAction(page, problem);
  let meeting = await openMeeting(page);
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.decision, { exact: true }).selectOption("needs_data");
  await finalizeMeeting(meeting);
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(meeting.getByTestId("meeting-history-item").first().locator("summary")).toHaveText(historyTitle(defaultMeetingName, today, "need_data"));
  // 結束會議之後才推進待辦：上次「未開始」→ 目前「進行中」（狀態更新日＝今天）。
  await nav(page, "actions").click();
  await page.getByTestId("board-card-1-move-in_progress").click();
  await expect(page.getByTestId("board-column-in_progress").getByTestId("board-card-1")).toBeVisible();

  // 開發者驗證頁換成示範資料（放棄未保存的修改）。
  await loadDataset(page, "demo");
  await dismissSavePrompt(page);
  meeting = await openMeeting(page);
  // 會議稿仍固定在 golden（較早的資料）：提示目前檢視不同、不能結束會議；按「用目前資料更新會議」後才換成示範資料。
  await expect(basics(meeting).getByTestId("review-view-difference")).toBeVisible();
  await expect(meeting.getByTestId("meeting-finalize")).toBeDisabled();
  await basics(meeting).getByRole("button", { name: labels.buttons.updateMeetingSource, exact: true }).click();
  await expect(basics(meeting).getByTestId("review-view-difference")).toHaveCount(0);
  await expect(meeting.getByTestId("meeting-finalize")).toBeEnabled();

  const compare = meeting.getByTestId("meeting-compare");
  const different = compare.getByTestId("meeting-compare-different_dataset");
  await expect(different).toBeVisible();
  await expect(compare.getByTestId("meeting-compare-same_scope")).toHaveCount(0);
  await expect(compare.getByTestId("meeting-compare-different_periods")).toHaveCount(0);
  await expect(different.getByTestId("meeting-compare-note")).toHaveText(labels.meeting.noComparable);
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
  await expect(followUp.locator("tbody tr td")).toHaveText([labels.actions.statuses.not_started, labels.actions.statuses.in_progress, today]);
  // 會議歷史換資料後仍保留；總覽入口不顯示別份資料的上次會議日期。
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await nav(page, "overview").click();
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(meetingPage.entry, { state: labels.meeting.decisions.draft }));
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
  await expect(basics(meeting).getByTestId("review-view-difference")).toHaveText(fill(review.viewDifference, {
    meetingChannels: channelsLabel(channels, false), meetingStart: "2026-08-02", meetingEnd: "2026-08-02",
    viewChannels: channelsLabel(channels, true), viewStart: "2026-07-13", viewEnd: "2026-08-23", datasetNote: review.viewDifferenceDataset,
  }));
  await expect(basics(meeting)).toContainText(fill(review.sourceLine, { sourceStatus: review.sourceHistorical, channels: channelsLabel(channels, false) }));
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
  await expect(section).toHaveText(labels.sections.meetingSummary);
  // 「摘要匯出（目前檢視）」小標下（到下一個小標或說明為止）依序四項。
  const sectionItems = await section.evaluate(element => {
    const names: string[] = [];
    for (let node = element.nextElementSibling; node && !node.matches(".menu-section, .menu-note"); node = node.nextElementSibling) {
      const button = node.matches("button") ? node : node.querySelector("button");
      if (button) names.push((button.textContent ?? "").trim());
    }
    return names;
  });
  expect(sectionItems).toEqual([labels.buttons.exportPdf, labels.buttons.exportExcel, labels.buttons.exportPptx, labels.meetingPage.menuMarkdown]);
  await expect(menu).toContainText(labels.meetingPage.menuViewNote);

  // Excel：profitlens.xlsx、zip（PK）、> 5 KB、六張工作表；選單版只依目前檢視：摘要沒有會議名稱／日期列，也不帶會議稿的名稱。
  const downloadSummary = page.getByTestId("download-menu").locator(":scope > summary");
  const excel = await downloadFrom(page, menu.getByRole("button", { name: labels.buttons.exportExcel, exact: true }));
  expect(excel.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(excel.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(excel.bytes.length).toBeGreaterThan(5 * 1024);
  const workbook = XLSX.read(excel.bytes, { type: "buffer" });
  expect(workbook.SheetNames).toEqual(Object.values(labels.excelExport.sheets));
  const summaryCells = (book: XLSX.WorkBook) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[labels.excelExport.sheets.summary], { header: 1, raw: false }).flat().map(String);
  const viewCells = summaryCells(workbook);
  expect(viewCells).toEqual(expect.arrayContaining([labels.excelExport.summary.items.dataset, "golden-v1"]));
  expect(viewCells).not.toContain(labels.excelExport.summary.items.meetingName);
  expect(viewCells).not.toContain(labels.excelExport.summary.items.meetingDate);
  expect(viewCells).not.toContain(labels.excelExport.summary.sections.meeting);
  expect(viewCells).not.toContain(defaultMeetingName);
  await excel.download.saveAs(outputDir("artifacts", `${project}-profitlens.xlsx`));
  await expect(menu).toHaveAttribute("open", "");
  // 完成後焦點回到「下載」選單的 summary（不掉到 body）。
  await expect(downloadSummary).toBeFocused();

  // PPT 一頁式：profitlens-onepager.pptx、zip（PK）、只有一張投影片；選單版標題是「ProfitLens 一頁摘要」，並註明目前檢視、不含會議決議。
  const pptx = await downloadFrom(page, menu.getByRole("button", { name: labels.buttons.exportPptx, exact: true }));
  expect(pptx.download.suggestedFilename()).toBe("profitlens-onepager.pptx");
  expect(pptx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const slides = slideXml(pptx.bytes);
  expect(slides).toHaveLength(1);
  expect(slides[0]).toContain(fill(labels.pptxExport.title, { brand: labels.brand.name }));
  expect(slides[0]).toContain(labels.pptxExport.noMeeting);
  expect(slides[0]).not.toContain(fill(labels.pptxExport.titleMeeting, { name: defaultMeetingName, date: today }));
  expect(slides[0]).not.toContain(defaultMeetingName);
  await pptx.download.saveAs(outputDir("artifacts", `${project}-profitlens-onepager.pptx`));
  await expect(downloadSummary).toBeFocused();

  // 會議頁輸出列五鈕；改會議名稱（含公式開頭與 XML 特殊字元）後匯出 Excel／PPT：Excel 是文字不是公式、PPT 的 XML 有逸出。
  const meeting = await openMeeting(page);
  const outputs = meeting.getByTestId("meeting-outputs");
  await expect(outputs.getByRole("button")).toHaveText([labels.buttons.exportPdf, labels.buttons.exportMarkdown, labels.downloads.channelTableCsv, labels.buttons.exportExcel, labels.buttons.exportPptx]);
  const hostile = '=HYPERLINK("x") <會議>&';
  await basics(meeting).getByLabel(labels.meeting.name, { exact: true }).fill(hostile);
  await expect(basics(meeting).getByLabel(labels.meeting.name, { exact: true })).toHaveValue(hostile);
  await expect(outputs.getByRole("button", { name: labels.buttons.exportExcel, exact: true })).toBeEnabled();
  const meetingExcel = await downloadFrom(page, outputs.getByRole("button", { name: labels.buttons.exportExcel, exact: true }));
  expect(meetingExcel.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(meetingExcel.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const meetingBook = XLSX.read(meetingExcel.bytes, { type: "buffer", cellFormula: true });
  expect(meetingBook.SheetNames).toEqual(Object.values(labels.excelExport.sheets));
  const sheet = meetingBook.Sheets[labels.excelExport.sheets.summary];
  const nameCell = Object.entries(sheet).find(([address, cell]) => !address.startsWith("!") && (cell as XLSX.CellObject).v === `'${hostile}`);
  expect(nameCell, "會議名稱以文字（前置 '）寫入摘要工作表").toBeTruthy();
  expect((nameCell![1] as XLSX.CellObject).t).toBe("s");
  expect((nameCell![1] as XLSX.CellObject).f).toBeUndefined();
  expect(Object.values(sheet).some(cell => typeof cell === "object" && cell !== null && "f" in cell && (cell as XLSX.CellObject).f !== undefined)).toBe(false);
  const meetingPptx = await downloadFrom(page, outputs.getByRole("button", { name: labels.buttons.exportPptx, exact: true }));
  expect(meetingPptx.download.suggestedFilename()).toBe("profitlens-onepager.pptx");
  const [meetingSlide] = slideXml(meetingPptx.bytes);
  expect(meetingSlide).toContain("&lt;會議&gt;&amp;");
  expect(meetingSlide).not.toContain("<會議>");
  await expect(outputs.getByRole("alert")).toHaveCount(0);
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
  await expect(menu.getByText(labels.meetingPage.pdfHint, { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: labels.buttons.exportPdf, exact: true }).click();
  // 選單關閉、列印版面掛到 body、window.print() 呼叫一次。
  await expect(menu).not.toHaveAttribute("open", "");
  await expect.poll(printCalls).toBe(1);
  const print = page.getByTestId("manager-summary-print");
  await expect(print).toHaveCount(1);
  await expect(print).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  await expect(status(page)).toBeHidden();
  await expect(print.getByRole("heading", { level: 1 })).toHaveText(labels.ui.managerSummary.printTitle);
  // 第一頁只有三件事（ol > li），依 |對貢獻影響|：−315.00、−250.00、−150.00。
  const priorities = print.locator(":scope > ol > li");
  await expect(priorities).toHaveCount(3);
  for (const [index, amount] of ["-315.00", "-250.00", "-150.00"].entries()) await expect(priorities.nth(index)).toContainText(amount);
  // 附錄（技術資訊）是獨立的 section，從新的一頁開始。
  const appendix = print.locator(":scope > section").filter({ has: page.getByRole("heading", { name: labels.sections.technicalDetails, exact: true }) });
  await expect(appendix).toHaveCount(1);
  await expect(appendix).toContainText("contribution-v1");
  expect(await appendix.evaluate(element => getComputedStyle(element).breakBefore)).toBe("page");
  // 三件事的 ol 有 1. 2. 3. 編號。
  expect(await print.locator(":scope > ol").evaluate(element => getComputedStyle(element).listStyleType)).toBe("decimal");
  // 選單版只依目前檢視：頁首第一段是 printContext（狀態＝「目前檢視（不含會議決議）」），沒有會議名稱頁首、決議行與選入方案。
  await expect(print.locator(":scope > header > p").first()).toHaveText(fill(summaryCopy.printContext, { state: meetingPage.printViewState, asOf: GOLDEN_AS_OF, channels: channelsLabel(["DTC", "MARKETPLACE"], false) }));
  await expect(print.locator(":scope > header")).not.toContainText(defaultMeetingName);
  await expect(print.getByTestId("print-decision-line")).toHaveCount(0);
  await expect(print.getByTestId("print-scenario-line")).toHaveCount(0);
  await expect(print.getByTestId("print-appendix-assumptions")).toHaveCount(0);
  await mkdir(outputDir(), { recursive: true });
  const pdfPath = outputDir(`manager-summary-A4-${project}.pdf`);
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
  const pdf = await readFile(pdfPath);
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  await page.emulateMedia({ media: "screen" });
  // page.pdf() 本身會觸發 beforeprint／afterprint（當下仍模擬 print media，頂欄不顯示、無法聚焦），列印版面在那時就已移除；這裡的 afterprint 只是保險。
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(status(page)).toBeVisible();
  // 再從選單列印一次（不產 PDF）：畫面模式下的 afterprint 後列印版面移除、焦點回到「下載」選單的 summary。
  const again = await openDownloads(page);
  await again.getByRole("button", { name: labels.buttons.exportPdf, exact: true }).click();
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
  await expect(agenda5.getByTestId("meeting-scenario-results-empty")).toHaveText(summaryCopy.noScenario);
  await agenda5.getByLabel(fill(review.scenarioSelect, { channel: "DTC" }), { exact: true }).selectOption({ label: fill(review.planOption, { name: firstPlanName }) });
  const results = agenda5.getByTestId("meeting-scenario-results").getByTestId("meeting-scenario-result");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveAttribute("data-status", "current");
  await expect(results.first()).toContainText(firstPlanName);
  await expect(results.first()).toContainText("270.00");
  await expect(agenda5.getByTestId("meeting-scenario-results-empty")).toHaveCount(0);
  const outputs = meeting.getByTestId("meeting-outputs");
  await expect(outputs.getByText(labels.meetingPage.pdfHint, { exact: true })).toBeVisible();
  await outputs.getByRole("button", { name: labels.buttons.exportPdf, exact: true }).click();
  await expect.poll(printCalls).toBe(3);
  await expect(print).toHaveCount(1);
  // 有會議稿：頁首帶會議名稱、日期與資料日。
  const printMeta = templateRe(labels.meetingPage.printHeader, { name: defaultMeetingName, date: today, asOf: GOLDEN_AS_OF });
  await expect(print.locator(":scope > header > p").first()).toHaveText(printMeta);
  await expect(print.locator(":scope > ol > li")).toHaveCount(3);
  // 第一頁的決議行在關鍵差額之後、三件事（h2）之前。
  const decisionLine = print.getByTestId("print-decision-line");
  await expect(decisionLine).toHaveText(fill(summaryCopy.printMeetingLine, { name: defaultMeetingName, state: labels.meeting.decisions.draft, notes: "" }));
  const neighbours = await decisionLine.evaluate(element => ({ previous: element.previousElementSibling?.textContent ?? "", nextTag: element.nextElementSibling?.tagName ?? "", next: element.nextElementSibling?.textContent ?? "" }));
  expect(neighbours.previous).toContain(labels.metrics.contribution_after_marketing.label);
  expect(neighbours).toMatchObject({ nextTag: "H2", next: labels.sections.topThree });
  // 選入方案在第一頁只有一行；五項假設（數量、折扣、履約、廣告、一次性成本）在附錄。
  await expect(print.getByTestId("print-scenario-line")).toHaveCount(1);
  await expect(print.getByTestId("print-scenario-line")).toContainText("270.00");
  const assumptions = print.getByTestId("print-appendix-assumptions");
  await expect(assumptions).toHaveCount(1);
  await expect(assumptions).toContainText(firstPlanName);
  expect(await assumptions.locator("li").count()).toBeGreaterThanOrEqual(5);
  const exit = outputs.getByRole("button", { name: labels.ui.managerSummary.exitPrint, exact: true });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(print).toHaveCount(0);
  await expect(exit).toHaveCount(0);
});

test("e. 總覽一行入口切到會議紀錄；側欄八個分頁（手機 4×2）、沒有水平捲動", async ({ page }, testInfo) => {
  await loadDataset(page, "golden");
  await declineSavePrompt(page);
  await expect(nav(page, "overview")).toHaveAttribute("aria-current", "page");
  // 舊的總覽會議 <details> 已移除，只剩一行入口 <p>。
  await expect(page.getByTestId("overview-meeting")).toHaveCount(0);
  await expect(page.getByTestId("meeting-page")).toHaveCount(0);
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toBeVisible();
  expect(await entry.evaluate(element => element.tagName)).toBe("P");
  await expect(entry).toContainText(fill(meetingPage.entry, { state: labels.meeting.decisions.draft }));
  await expect(entry).not.toContainText(meetingPage.entryLast.split("{date}")[0].trim());
  const go = entry.getByRole("button", { name: meetingPage.goToMeeting, exact: true });
  await expect(go).toBeVisible();
  // 一行：入口內的文字與按鈕垂直置中在同一列（手機寬度允許換行，只檢查高度不超過兩行）。
  const rows = await entry.evaluate(element => new Set(Array.from(element.children).map(child => { const box = child.getBoundingClientRect(); return Math.round((box.top + box.height / 2) / 8); })).size);
  if (testInfo.project.name === "mobile") expect(rows).toBeLessThanOrEqual(2);
  else expect(rows).toBe(1);
  await go.click();
  await expect(page.getByTestId("meeting-page")).toBeVisible();
  await expect(nav(page, "meeting")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(labels.nav.meeting.label);

  // 側欄八個分頁，順序固定；沒有水平捲動。（R7-4：本案例經 #validation 載入，「開發者驗證」顯示到重新整理為止，故仍為八個。）
  const buttons = page.getByRole("navigation", { name: dash.mainNavAria }).getByRole("button");
  await expect(buttons).toHaveCount(8);
  await expect(buttons).toHaveText(navIds.map(id => labels.nav[id].label));
  for (const id of navIds) {
    await nav(page, id).click();
    await expect(nav(page, id)).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  if (testInfo.project.name === "mobile") {
    // 手機：底部分頁列 4×2，每個按鈕都在視窗寬度內。
    const boxes = await buttons.evaluateAll(list => list.map(button => { const box = button.getBoundingClientRect(); return { top: Math.round(box.top), left: box.left, right: box.right }; }));
    const tops = [...new Set(boxes.map(box => box.top))];
    expect(tops).toHaveLength(2);
    for (const top of tops) expect(boxes.filter(box => box.top === top)).toHaveLength(4);
    const width = await page.evaluate(() => window.innerWidth);
    for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  }
});

test("f. 首次保存提示與自動保存：同意後立即保存、頂欄「已保存 hh:mm」、變更 2 秒內自動保存；刪除本機資料後停止；拒絕則維持手動", async ({ page }) => {
  test.setTimeout(90_000);
  const savedAtRe = templateIn(labels.status.savedAt, {}, { time: "\\d{2}:\\d{2}" });
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
  await expect(tag).toContainText(labels.status.unsaved);

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
  await basics(meeting).getByLabel(labels.meeting.name, { exact: true }).fill(renamed);
  await expect(tag).toContainText(labels.status.unsaved);
  // 沒有任何手動操作就自動保存：等待上限＝2 秒排程＋匯出、重新驗證與寫入 IndexedDB（機器負載高時較慢）。
  await expect(tag).toContainText(savedAtRe, { timeout: 8_000 });
  await expect.poll(readSaved, { timeout: 8_000 }).toMatchObject({ meetingName: renamed });
  expect(Date.parse((await readSaved())!.at!)).toBeGreaterThan(Date.parse(first.at!));
  await expect(page.getByTestId("autosave-error")).toHaveCount(0);

  // 刪除本機資料：資料庫移除、同意取消、改回手動；之後的變更不再寫入。
  const storage = await openStorage(page);
  await storage.getByRole("button", { name: labels.buttons.deleteLocal, exact: true }).click();
  await expect(storage.getByTestId("storage-notice")).toHaveText(store.deletedNotice);
  await expect(storage.getByTestId("autosave-status")).toContainText(auto.statusOff);
  await expect(storage.getByRole("checkbox", { name: store.consent, exact: true })).not.toBeChecked();
  expect(await hasDatabase()).toBe(false);
  await closeStorage(page);
  await basics(meeting).getByLabel(labels.meeting.name, { exact: true }).fill("R6 刪除後的修改");
  await expect(tag).toContainText(labels.status.unsaved);
  // 超過 2 秒排程後仍沒有寫入（等 4 秒，涵蓋排程＋寫入時間）。
  await page.waitForTimeout(4_000);
  expect(await hasDatabase()).toBe(false);
  await expect(tag).toContainText(labels.status.unsaved);
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
  await expect(menu.getByRole("button", { name: labels.buttons.saveLocal, exact: true })).toBeDisabled();
  await closeStorage(page);
  const meeting = await openMeeting(page);
  await basics(meeting).getByLabel(labels.meeting.name, { exact: true }).fill("R6 手動保存");
  await page.waitForTimeout(4_000);
  expect(await hasDatabase()).toBe(false);
  await expect(page.getByTestId("workspace-storage").locator(":scope > summary")).toContainText(labels.status.unsaved);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
  // Escape 等於「先不要」：清空後再載入，提示再出現；在提示內按 Escape 關閉。
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.clear, exact: true }));
  await expect(status(page)).toContainText(labels.status.empty);
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
  // 先填備註再選決議（改備註會讓已選的決議回到草稿，要重新確認）。
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.notes, { exact: true }).fill(notes);
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.decision, { exact: true }).selectOption("needs_data");
  const before = Date.now();
  await finalizeMeeting(meeting);
  const after = Date.now();
  const items = meeting.getByTestId("meeting-history-item");
  await expect(items).toHaveCount(1);
  const summary = items.first().locator("summary");
  await expect(summary).toHaveText(historyTitle(defaultMeetingName, today, "need_data"));
  const title = await summary.innerText();

  // 歷史項目的 Markdown：檔名帶會議日期；主文的結束時間是臺北時間 YYYY-MM-DD hh:mm（ISO 原值只在技術細節）；有「## 口徑」段；④ 從紀錄本身讀（第一次會議沒有上次）。
  const history = await downloadFrom(page, items.first().getByRole("button", { name: `${labels.buttons.exportMarkdown} · ${title}`, exact: true }));
  expect(history.download.suggestedFilename()).toBe(`profitlens-meeting-${today}.md`);
  const markdown = history.bytes.toString("utf8");
  const [body, technical] = markdown.split(`## ${labels.sections.technicalDetails}`);
  expect(body.split("\n")[0]).toBe(fill(record.mdTitle, { brand: labels.brand.name, name: defaultMeetingName }));
  const finalizedTimes = [...new Set([formatSavedDateTime(new Date(before)), formatSavedDateTime(new Date(after))])];
  expect(body).toMatch(templateIn(record.mdMeta, { date: labels.meeting.date, value: today, decision: labels.meeting.decision }, { state: confirmedRe("need_data"), finalizedAt: `(?:${finalizedTimes.map(escapeRe).join("|")})` }));
  expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  expect(technical).toMatch(/- finalized_at：\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  const lines = body.split("\n");
  const basisAt = lines.indexOf(record.mdBasis);
  expect(basisAt, "主文有「## 口徑」段").toBeGreaterThan(lines.indexOf(record.mdScope));
  expect(lines[basisAt + 2]).toMatch(/^- \S/);
  expect(body).toContain(`### ${record.agenda.followUp}\n\n${record.noLastMeeting}\n`);
  expect(body).toContain(fill(record.mdField, { field: labels.meeting.notes, value: notes }));

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
  await region.getByRole("button", { name: labels.buttons.cancel, exact: true }).click();
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
  await expect(meeting.getByTestId("meeting-history")).toContainText(meetingPage.historyEmpty);
  await expect(meeting.getByTestId("meeting-history-status")).toHaveText(fill(meetingPage.removed, { name: defaultMeetingName, date: today }));
  await expect(meeting.getByTestId("meeting-history").getByRole("heading", { name: meetingPage.history, exact: true })).toBeFocused();
  await expect(meeting.getByTestId("meeting-agenda-4")).toContainText(record.noLastMeeting);
  await expect(meeting.getByTestId("meeting-compare")).toContainText(record.noLastMeeting);
  // 總覽入口回到「本期會議：草稿」，不再顯示已結束或上次會議日期。
  await nav(page, "overview").click();
  const entry = page.getByTestId("overview-meeting-entry");
  await expect(entry).toContainText(fill(meetingPage.entry, { state: labels.meeting.decisions.draft }));
  await expect(entry).not.toContainText(fill(meetingPage.entryFinalized, { date: today }));
  await expect(entry).not.toContainText(fill(meetingPage.entryLast, { date: today }));
});
