// V42-2a（docs/revamp-v4.2/06_BATCHES.md V42-2a 第 7 項；01_PRD.md §4.1 兩層通路選單、§4.2 「只看這個通路」與群組層限制句、§3.4 備份；D-V42-2、D-V42-10、D-V42-12、D-V42-13）：期間列的群組範圍 E2E，四尺寸都跑。
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { CHANNEL_SETTINGS_VERSION, groupOptionValue, SUBSET_OPTION_VALUE, type ChannelSettings } from "../../src/application/channel-settings";
import { decisionSignature } from "../../src/application/decision";
import { formatMetric, formatPeriodL1 } from "../../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../../src/application/workspace";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { validateDataset } from "../../src/domain/validation";
import { fill, labels } from "../../src/i18n";
import { synthetic4ChannelInput } from "../helpers/synthetic-4-channel";
import { importSynthetic } from "./chart-helpers-v4";
import { hideDevOverlay } from "./launch-helpers-v310";
import { closePeriodSheet, closeStorage, dismissSavePrompt, isMobile, navigateTo, openDetails, openMeeting, openPeriodSheet, openStorage, periodSummary, startChannelContext } from "./replacement-helpers";

/*
 * 共同前置：四步精靈匯入 4 通路合成資料（tests/fixtures/synthetic-4-channel）→ 資料來源頁「通路設定」填四個顯示名稱（官網、社群、蝦皮、直播）、建兩個群組
 * （自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE）→ 套用（「已套用通路設定。」）→ 總覽的期間列選「自有」（390 先開底部面板）→ 等重算完成（選單選中值＝g1 的群組選項值、
 * .view-content 不再 aria-busy、期間摘要的 title 是「通路：自有（官網、社群）；…」）。
 * A. 群組範圍：KPI 帶五格的本期文字＝Node 端 createSnapshot(dataset, { channels: ["DTC","SOCIAL"] }, hash, 設定) 以 KPI 帶同一個 formatMetric(…, "L1") 格式化的值；選中的選項在 optgroup「自有」內
 *    （scope-option-group-g1）；健檢（channel-compare 的 sec-scope＝群組名）、商品毛利（product-scope 的範圍副標寫群組名）、試算（scenario-channel 只列成員、預設第一個成員）、
 *    會議（會議資料固定為成員，固定範圍一行寫群組名；議程 3 的通路寬表有「只看這個通路」）、資料來源（「目前看的通路」列成員）都在群組範圍；沒有目標時沒有目標限制句。
 *    G4 精簡表用鍵盤按 channel-drill-DTC（Enter）→ 焦點移到期間列的通路選單（390 移到期間按鈕；審查 R2-1）→ 選單選中 DTC（在 optgroup「自有」內）、期間摘要 title 寫「自有 · 官網」、單一通路範圍下沒有「只看這個通路」→ 再選「自有」。
 * B. 備份與還原：備份的 payload.channel_settings 帶四個顯示名稱與兩個群組、active.filters.channels 是成員代碼；重新開頁（記憶體清空）讀入備份後選單仍選中「自有」、仍有兩個 optgroup；
 *    把備份文字的 channel_settings.groups 清空（通路的 group 欄位一併去掉、信封 checksum 重新簽，見 withoutGroups）再還原：選單是只讀的「2 個通路」（value＝SUBSET_OPTION_VALUE、disabled、被選中）、沒有 optgroup、
 *    期間摘要 title 列出「官網、社群」、整頁沒有 channel-drill-*；再還原完整備份後在群組範圍對總覽、健檢、會議跑 axe（serious／critical 0）。不新增下載種類。
 * 字串一律取 labels；通路代碼、使用者輸入的名稱與 testid 是字面值。helper 比照 tests/e2e/channel-settings.spec.ts（編輯器、備份、還原、axe）。
 */
test.describe.configure({ timeout: 180_000 });
const ui = labels.data.channelSettingsV42;
const v42 = labels.diagnosis.channelsV42;
const storageCopy = labels.storage.workspace;
/** manifest 順序（tests/fixtures/synthetic-4-channel/manifest.json）；編輯器的列與期間列的成員都依這個順序。 */
const MANIFEST_CHANNELS = ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] as const;
const NAMES: Record<string, string> = { DTC: "官網", SOCIAL: "社群", MARKETPLACE: "蝦皮", LIVE: "直播" };
const G1 = "自有", G2 = "平台";
const G1_MEMBERS = ["DTC", "SOCIAL"] as const;
/** channelsLabel 的成員清單（「、」相連，manifest 順序）。 */
const G1_TEXT = `${NAMES.DTC}、${NAMES.SOCIAL}`;
/**
 * 使用者在編輯器輸入的設定，與 tests/helpers/page-states.tsx 的 SYNTHETIC_CHANNEL_SETTINGS 相同（那個檔 import 頁面元件與 CSS module，Playwright 的 Node 端不載入它，這裡照抄一份給 createSnapshot；
 * 名稱與群組不進任何金額，只給快照的 channel_names／channel_groups）。
 */
const SETTINGS: ChannelSettings = {
  version: CHANNEL_SETTINGS_VERSION,
  channels: [{ code: "DTC", label: NAMES.DTC, group: "g1" }, { code: "SOCIAL", label: NAMES.SOCIAL, group: "g1" }, { code: "MARKETPLACE", label: NAMES.MARKETPLACE, group: "g2" }, { code: "LIVE", label: NAMES.LIVE, group: "g2" }],
  groups: [{ id: "g1", label: G1, order: 0 }, { id: "g2", label: G2, order: 1 }],
};
/** KPI 帶的五格（src/components/overview/kpi-band.tsx KPI_BAND_METRICS 的順序；該檔是頁面元件，這裡不 import）。 */
const KPI_METRICS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const;

const editor = (page: Page) => page.getByTestId("channel-settings");
const labelInput = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.label, { code }), { exact: true });
const groupSelect = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.group, { code }), { exact: true });
const groupNameInput = (page: Page, n: number) => editor(page).getByLabel(fill(ui.groups.nameLabel, { n }), { exact: true });
const applyButton = (page: Page) => editor(page).getByRole("button", { name: ui.buttons.apply, exact: true });
const statusLine = (page: Page) => editor(page).locator(".channel-settings-status");
const storage = (page: Page) => page.getByTestId("workspace-storage");
const status = (page: Page) => page.getByTestId("workspace-status");
const restorePreview = (page: Page) => page.getByRole("region", { name: storageCopy.restorePreviewAria });
/** 期間列的通路 <select>（兩層 optgroup；390 底部面板關著時不可見，選之前先 openPeriodSheet）。 */
const scopeSelect = (page: Page) => page.getByTestId("scope-select");
/** 「範圍與金額基準」定義列表裡某一列（dt＝labels.data.panel.meta.*）的 dd。 */
const metaValue = (page: Page, term: string) => page.getByTestId("data-scope").locator("dl > div").filter({ has: page.locator("dt", { hasText: term }) }).locator("dd");
/** 重算中的內容區（dashboard：applyFilters 期間 .view-content 標 aria-busy，舊內容保持掛載）。 */
const viewContent = (page: Page) => page.locator(".view-content");
/** 某個區塊內的「只看這個通路」按鈕（channel-drill-{code}）。 */
const drillButtons = (root: Locator) => root.locator("[data-testid^='channel-drill-']");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
interface AxeRow { id: string; impact: string | null; targets: string[] }
/** 目前狀態的 serious／critical 違規（axe-core 來自 node_modules，與 axe-sweep 同一個來源與標籤）；找不到 axe-core 時回 null。 */
async function axeSeriousViolations(page: Page): Promise<AxeRow[] | null> {
  let path: string;
  try { path = require.resolve("axe-core/axe.min.js"); } catch { return null; }
  if (!await page.evaluate(() => "axe" in window)) await page.addScriptTag({ path });
  const rows = await page.evaluate(async tags => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.slice(0, 5).map(node => JSON.stringify(node.target)) }));
  }, AXE_TAGS);
  return rows.filter(row => row.impact === "serious" || row.impact === "critical");
}
async function expectAxeClean(page: Page, state: string) {
  const violations = await axeSeriousViolations(page);
  if (violations === null) test.info().annotations.push({ type: "axe", description: `node_modules 沒有 axe-core，${state} 這一步略過` });
  else expect(violations, `${state}：${JSON.stringify(violations)}`).toEqual([]);
}

/** 期待值用的群組快照（Node 端以 domain 與 application 的同一組函式算，不寫死數字；與瀏覽器匯入的是同一份檔案）。每個 worker 只算一次。 */
let groupedCache: Promise<WorkspaceSnapshot> | null = null;
function groupedSnapshot(): Promise<WorkspaceSnapshot> {
  if (!groupedCache) groupedCache = (async () => { const input = synthetic4ChannelInput(); return createSnapshot(validateDataset(input).dataset!, { channels: [...G1_MEMBERS] }, await hashInput(input), SETTINGS); })();
  return groupedCache;
}
/** 期間摘要的 title 與 sr-only（labels.shell.periodBarV3.summaryDetail；{channels} 由呼叫端給：群組寫「自有（官網、社群）」、群組內單一通路寫「自有 · 官網」、其餘列成員）。 */
function summaryDetail(snapshot: WorkspaceSnapshot, channels: string) {
  const mode = snapshot.report.comparison.mode === "calendar_months" ? labels.shell.periods.calendarMonths : labels.shell.periods.sameDays;
  return fill(labels.shell.periodBarV3.summaryDetail, { channels, mode, dataAsOf: snapshot.data_as_of });
}
const GROUP_DETAIL = (snapshot: WorkspaceSnapshot) => summaryDetail(snapshot, fill(labels.shell.scopeV42.groupWithMembers, { group: G1, members: G1_TEXT }));

interface SelectedOption { value: string; text: string; group: string | null; testid: string | null; disabled: boolean }
/** 期間列選單目前選中的選項：值、文字、所在 optgroup 的 label（沒有就 null）、testid、是否只讀。 */
const selectedOption = (page: Page) => scopeSelect(page).evaluate((node): SelectedOption => {
  const option = (node as HTMLSelectElement).selectedOptions[0];
  const parent = option?.parentElement;
  return { value: option?.value ?? "", text: option?.textContent ?? "", group: parent instanceof HTMLOptGroupElement ? parent.label : null, testid: option?.dataset.testid ?? null, disabled: option?.disabled ?? false };
});
const G1_OPTION: SelectedOption = { value: groupOptionValue("g1"), text: G1, group: G1, testid: "scope-option-group-g1", disabled: false };

/** 切到資料來源頁、點開預設收合的「通路設定」。 */
async function openEditor(page: Page) {
  await navigateTo(page, "data");
  await expect(page.getByTestId("targets-entry")).toBeVisible();
  await openDetails(editor(page));
  await expect(editor(page)).toHaveAttribute("open", "");
}
/** 編輯器：四個顯示名稱、兩個群組（自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE）、套用；等重算完成（「檔案裡的通路」列換成顯示名稱）。 */
async function configureGroups(page: Page) {
  await openEditor(page);
  for (const code of MANIFEST_CHANNELS) await labelInput(page, code).fill(NAMES[code]);
  const addGroup = editor(page).getByRole("button", { name: ui.buttons.addGroup, exact: true });
  await addGroup.click();
  await expect(editor(page).getByTestId("channel-settings-group-g1")).toBeVisible();
  await groupNameInput(page, 1).fill(G1);
  await addGroup.click();
  await expect(editor(page).getByTestId("channel-settings-group-g2")).toBeVisible();
  await groupNameInput(page, 2).fill(G2);
  for (const entry of SETTINGS.channels) await groupSelect(page, entry.code).selectOption(entry.group!);
  await applyButton(page).click();
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await expect(metaValue(page, labels.data.panel.meta.channels)).toHaveText(MANIFEST_CHANNELS.map(code => NAMES[code]).join("、"));
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
}
/**
 * 期間列選一個選項（依可見文字；390 先開底部面板）。<select> 是受控元件，值取自快照：選中值換成 value 就表示 applyFilters 重算完成，再等內容區不 aria-busy；390 最後關掉面板。
 */
async function chooseScope(page: Page, label: string, value: string) {
  await openPeriodSheet(page);
  await scopeSelect(page).selectOption({ label });
  await expect(scopeSelect(page)).toHaveValue(value);
  await expect(page.getByTestId("period-bar")).not.toHaveAttribute("aria-busy", "true");
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
  await closePeriodSheet(page);
}
/** 共同前置：匯入 → 設定 → 總覽選「自有」。回傳 Node 端的群組快照（期待值）。 */
async function setupGroupScope(page: Page): Promise<WorkspaceSnapshot> {
  await importSynthetic(page);
  await configureGroups(page);
  await navigateTo(page, "overview");
  await chooseScope(page, G1, groupOptionValue("g1"));
  const snapshot = await groupedSnapshot();
  await expect(periodSummary(page)).toHaveAttribute("title", GROUP_DETAIL(snapshot));
  return snapshot;
}
async function backup(page: Page) {
  await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage(page).getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("profitlens-workspace.json");
  return readFile((await file.path())!, "utf8");
}
/** 重新開頁（記憶體裡的工作區清空）再讀入備份：預覽 → 「讀入這份備份」→ 狀態句 → 關掉儲存選單與保存提示 → 回到總覽。 */
async function reloadAndRestore(page: Page, text: string) {
  await page.goto("/");
  await expect(status(page)).toContainText(labels.shell.status.empty);
  await openStorage(page);
  await storage(page).getByLabel(storageCopy.selectBackupFile, { exact: true }).setInputFiles({ name: "workspace.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(restorePreview(page)).toBeVisible();
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toHaveText(storageCopy.restoredNotice);
  await closeStorage(page);
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-band")).toBeVisible();
}
/**
 * 同一份備份把群組清空（通路的 group 欄位一併去掉；顯示名稱保留）。信封的 checksum 是 body 的 canonical JSON（decisionSignature）SHA-256，改過 payload 就要重新簽，
 * 否則產品照設計拒收（WORKSPACE_CHECKSUM_MISMATCH，「被改過的檔案不會取代目前資料」）；與 src/application/workspace-backup.ts 的 checksum 同一個算法。
 */
function withoutGroups(text: string): string {
  const { checksum: _stale, ...body } = JSON.parse(text);
  void _stale;
  body.payload.channel_settings.groups = [];
  for (const entry of body.payload.channel_settings.channels) delete entry.group;
  return JSON.stringify({ ...body, checksum: createHash("sha256").update(decisionSignature(body), "utf8").digest("hex") });
}
/** 區塊內恰好這些通路各一個「只看這個通路」：可見文字 drill、aria-label 填顯示名稱、在 th[scope=row] 內（收合的 details 內也算，只比對掛載）。 */
async function expectDrill(root: Locator, codes: readonly string[]) {
  await expect(drillButtons(root)).toHaveCount(codes.length);
  for (const code of codes) {
    const button = root.getByTestId(`channel-drill-${code}`);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText(v42.drill);
    await expect(button).toHaveAttribute("aria-label", fill(v42.drillChannelAria, { channel: NAMES[code] }));
    // filter({ has }) 的內層 locator 以外層元素為起點，所以用 page 層級的 getByTestId（不能用 root 鏈出來的）。
    await expect(root.locator("th[scope='row']").filter({ has: root.page().getByTestId(`channel-drill-${code}`) })).toHaveCount(1);
  }
}
/** 會議頁：沒有會議稿就建；檢視範圍與會議範圍不同時按差異橫幅的「用目前資料更新會議」，等橫幅消失。回傳 meeting-page。 */
async function meetingOnCurrentScope(page: Page) {
  const meeting = await openMeeting(page);
  if (await meeting.getByTestId("meeting-create").count()) await meeting.getByTestId("meeting-create").click();
  const banner = meeting.getByTestId("review-view-difference");
  if (await banner.count()) { await banner.getByRole("button", { name: labels.meeting.buttons.updateMeetingSource, exact: true }).click(); await expect(banner).toHaveCount(0); }
  await expect(meeting.locator(".meeting-scope-line")).toContainText(fill(labels.meeting.review.sourceLine, { sourceStatus: labels.meeting.review.sourceFixed, channels: G1 }));
  return meeting;
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await hideDevOverlay(page);
  await page.goto("/");
});

test("V42-2a 群組範圍：期間列選「自有」後 KPI 帶五格＝Node 端群組快照、選中的是 optgroup「自有」內的群組選項；健檢、商品毛利、試算、會議、資料來源都在群組範圍；G4 點「只看這個通路」切到群組內單一通路（自有 · 官網）再選回群組；沒有目標時沒有目標限制句", async ({ page }) => {
  const snapshot = await setupGroupScope(page);
  expect(snapshot.report.scope.channels).toEqual([...G1_MEMBERS]);
  // KPI 帶：五格的本期文字＝同一個 formatMetric(…, "L1")（kpi-band.tsx 的 valueText）。
  for (const name of KPI_METRICS) await expect(page.getByTestId(`kpi-${name}`).locator(".kpi-value"), name).toHaveText(formatMetric(name, snapshot.report.current.metrics[name], "L1"));
  expect(await selectedOption(page)).toEqual(G1_OPTION);
  // 沒有目標：總覽沒有目標限制句（labels.diagnosis.channelsV42.limits.targets 只在範圍＝群組且有目標時出現）。
  await expect(page.locator(".kpi-targets-note")).toHaveCount(0);
  await expect(page.getByText(v42.limits.targets, { exact: true })).toHaveCount(0);
  // G4 精簡表：兩列各一個「只看這個通路」（資料集有群組、範圍 2 個通路）。
  await expectDrill(page.getByTestId("channel-mix"), G1_MEMBERS);

  // 通路健檢：通路寬表的範圍文字＝群組名；每列一個「只看這個通路」。
  await navigateTo(page, "diagnosis");
  await expect(page.getByTestId("channel-compare").locator(".sec-scope")).toHaveText(G1);
  await expectDrill(page.getByTestId("channel-compare"), G1_MEMBERS);
  // 商品毛利：範圍副標的 {channels} 寫群組名（子集稽核第 19 條）。
  await navigateTo(page, "products");
  const scope = snapshot.report.scope;
  const period = (range: { start: string; end: string }) => formatPeriodL1(range.start, range.end, { days: false, anchor: snapshot.data_as_of });
  await expect(page.getByTestId("product-scope")).toHaveText(fill(labels.products.pageV3.scope, { current: period(scope.current_period), previous: period(scope.previous_period), channels: G1 }));
  // 假設試算：群組範圍下通路選單只列成員（manifest 順序、顯示名稱），預設第一個成員（D-V42-12「試算一次只算一個通路。」）。
  await navigateTo(page, "scenarios");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel").locator("option")).toHaveText([NAMES.DTC, NAMES.SOCIAL]);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  // 會議紀錄：會議資料固定為成員，固定範圍一行寫群組名（審查 R1-4）；議程 3 的通路寬表（收合）每列一個「只看這個通路」。
  const meeting = await meetingOnCurrentScope(page);
  await expectDrill(meeting.getByTestId("meeting-agenda-3"), G1_MEMBERS);
  // 資料來源：「目前看的通路」列成員。
  await navigateTo(page, "data");
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(G1_TEXT);

  // 回總覽按 G4 的「只看這個通路」（DTC）：既有的單一通路篩選——選單選中 DTC（在 optgroup「自有」內的成員選項）、期間摘要寫「自有 · 官網」、單一通路範圍下沒有按鈕。
  await navigateTo(page, "overview");
  // 鍵盤觸發（審查 R2-1）：Tab 到按鈕後按 Enter；重算後按鈕卸載，焦點要移到期間列的通路選單（≥ 768）或期間按鈕（390，選單在底部面板裡不可見）。
  const drill = page.getByTestId("channel-mix").getByTestId("channel-drill-DTC");
  await drill.focus();
  await expect(drill).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(scopeSelect(page)).toHaveValue("DTC");
  await expect(page.getByTestId(isMobile(page) ? "period-toggle" : "scope-select")).toBeFocused();
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
  expect(await selectedOption(page)).toEqual({ value: "DTC", text: NAMES.DTC, group: G1, testid: null, disabled: false });
  await expect(periodSummary(page)).toHaveAttribute("title", summaryDetail(snapshot, fill(labels.shell.scopeV42.memberOfGroup, { group: G1, channel: NAMES.DTC })));
  await expect(drillButtons(page.getByTestId("channel-mix"))).toHaveCount(0);
  // 再選回「自有」。
  await chooseScope(page, G1, groupOptionValue("g1"));
  await expect(periodSummary(page)).toHaveAttribute("title", GROUP_DETAIL(snapshot));
  expect(await selectedOption(page)).toEqual(G1_OPTION);
  await expectDrill(page.getByTestId("channel-mix"), G1_MEMBERS);
});

test("V42-2a 備份與還原：群組範圍的備份帶 channel_settings 與成員代碼；重新開頁還原後選單仍選中「自有」；群組清空的備份還原後選單是只讀的「2 個通路」、期間摘要列成員、沒有「只看這個通路」；再還原完整備份後總覽、健檢、會議在群組範圍 axe 0 個 serious／critical", async ({ page }) => {
  const snapshot = await setupGroupScope(page);
  // 備份：payload.channel_settings 帶四個顯示名稱與兩個群組（manifest 順序）；active.filters.channels 是成員代碼（排序後）。
  const text = await backup(page);
  const wire = JSON.parse(text);
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.channel_settings).toEqual({ version: CHANNEL_SETTINGS_VERSION, channels: MANIFEST_CHANNELS.map(code => ({ code, label: NAMES[code], group: SETTINGS.channels.find(entry => entry.code === code)!.group })), groups: SETTINGS.groups });
  expect(wire.payload.active.filters.channels).toEqual([...G1_MEMBERS]);

  // 重新開頁（記憶體清空）讀入備份：選單仍選中「自有」、仍是兩層選單、期間摘要寫群組名與成員、G4 有「只看這個通路」。
  await reloadAndRestore(page, text);
  await expect(scopeSelect(page)).toHaveValue(groupOptionValue("g1"));
  expect(await selectedOption(page)).toEqual(G1_OPTION);
  await expect(scopeSelect(page).locator("optgroup")).toHaveCount(2);
  await expect(periodSummary(page)).toHaveAttribute("title", GROUP_DETAIL(snapshot));
  await expectDrill(page.getByTestId("channel-mix"), G1_MEMBERS);

  // 同一份備份把群組清空（通路的 group 欄位一併去掉；顯示名稱保留）再還原：範圍仍是 {DTC, SOCIAL} 但沒有對應群組 → 只讀的「2 個通路」被選中、沒有 optgroup、期間摘要列成員、整頁沒有 channel-drill-*。
  await reloadAndRestore(page, withoutGroups(text));
  await expect(scopeSelect(page)).toHaveValue(SUBSET_OPTION_VALUE);
  expect(await selectedOption(page)).toEqual({ value: SUBSET_OPTION_VALUE, text: fill(labels.shell.periodBarV42.subsetCount, { n: 2 }), group: null, testid: null, disabled: true });
  await expect(scopeSelect(page).locator("optgroup")).toHaveCount(0);
  await expect(scopeSelect(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, ...MANIFEST_CHANNELS.map(code => NAMES[code]), fill(labels.shell.periodBarV42.subsetCount, { n: 2 })]);
  await expect(periodSummary(page)).toHaveAttribute("title", summaryDetail(snapshot, G1_TEXT));
  await expect(page.locator("[data-testid^='channel-drill-']")).toHaveCount(0);
  for (const name of KPI_METRICS) await expect(page.getByTestId(`kpi-${name}`).locator(".kpi-value"), name).toHaveText(formatMetric(name, snapshot.report.current.metrics[name], "L1"));

  // 再還原完整備份：群組範圍下總覽、健檢、會議各跑 axe（serious／critical 0）。
  await reloadAndRestore(page, text);
  await expect(scopeSelect(page)).toHaveValue(groupOptionValue("g1"));
  await expect(periodSummary(page)).toHaveAttribute("title", GROUP_DETAIL(snapshot));
  await expectAxeClean(page, "overview");
  await navigateTo(page, "diagnosis");
  await expect(page.getByTestId("channel-compare").locator(".sec-scope")).toHaveText(G1);
  await expectAxeClean(page, "diagnosis");
  await meetingOnCurrentScope(page);
  await expectAxeClean(page, "meeting");
});
