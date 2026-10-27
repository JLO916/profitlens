// V42-1b（docs/revamp-v4.2/06_BATCHES.md V42-1b 第 3 項；01_PRD.md §3.2 編輯器、§3.4 備份、§9 驗證；D-V42-8＝A、D-V42-9＝A、D-V42-13＝A）：資料來源頁「通路設定」區的 E2E，四尺寸都跑。
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { CHANNEL_SETTINGS_VERSION } from "../../src/application/channel-settings";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { fill, labels } from "../../src/i18n";
import { hideDevOverlay, loadDemo } from "./launch-helpers-v310";
import { closeStorage, dismissSavePrompt, navigateTo, openDetails, openStorage } from "./replacement-helpers";

/*
 * A. 示範資料 → 資料來源頁 → 點開「通路設定」（預設收合；起始值是示範資料的隱含預設別名、沒有群組）→ DTC、MARKETPLACE 改名、「新增群組」建「自有」並把 DTC 指派進去 → 「套用設定」：
 *    狀態句「已套用通路設定。」、沒有 role=alert、草稿重建後值不變；「範圍與金額基準」的兩列通路文字與期間列的通路選項換成顯示名稱；
 *    總覽 G4 緊湊表（manifest 順序）與通路健檢的通路寬表（表自己的排序）列名換成顯示名稱；下載備份：payload.channel_settings 帶顯示名稱與群組（active.filters.channels 仍是通路代碼）；
 *    重新開頁（記憶體裡的工作區清空）後讀入備份：還原預覽、期間列、編輯器的每列與群組列都再出現顯示名稱與群組。展開編輯器後頁面不橫向捲動（390 每列直向堆疊）。
 * B. 不合規則的名稱（前面有空格）：role=alert 列出規則句、狀態句空白、草稿保留使用者打的字（不修剪）、不套用（範圍文字與期間列仍是示範別名）；問題清單出現時跑 axe（serious／critical 0；
 *    live role 在外層 div、<ul> 仍是 list）；201 字沒有空白的名稱：規則句折行、頁面不橫向捲動；改成合規的名稱後再套用就通過。
 * C. 套用之後、重算完成之前繼續打字（頁面時鐘暫停讓 applyFilters 等的 requestAnimationFrame 不來）：父層傳回剛套用的那份設定時草稿不重建，打到一半的字還在；
 *    套用成功時沒有成員的群組當場從草稿去掉（提示句「沒有成員的群組在套用時會被去掉」）。
 * 字串一律取 labels；通路代碼、使用者輸入的名稱與 testid 是字面值。備份與還原的 helper 比照 tests/e2e/workspace-storage.spec.ts；axe 比照 tests/e2e/axe-sweep.spec.ts（node_modules 既有的 axe-core）。
 */
test.describe.configure({ timeout: 90_000 });
const ui = labels.data.channelSettingsV42;
const storageCopy = labels.storage.workspace;
const DTC_NAME = "官網直營", MARKETPLACE_NAME = "蝦皮商城", GROUP_NAME = "自有";
const DEMO_NAMES = `${labels.data.demoChannelAlias.DTC}、${labels.data.demoChannelAlias.MARKETPLACE}`;
const NEW_NAMES = `${DTC_NAME}、${MARKETPLACE_NAME}`;
const editor = (page: Page) => page.getByTestId("channel-settings");
const labelInput = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.label, { code }), { exact: true });
const groupSelect = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.group, { code }), { exact: true });
const groupNameInput = (page: Page, n: number) => editor(page).getByLabel(fill(ui.groups.nameLabel, { n }), { exact: true });
const groupRows = (page: Page) => editor(page).locator("[data-testid^='channel-settings-group-']");
const applyButton = (page: Page) => editor(page).getByRole("button", { name: ui.buttons.apply, exact: true });
const statusLine = (page: Page) => editor(page).locator(".channel-settings-status");
const problems = (page: Page) => editor(page).getByRole("alert").locator("li");
const storage = (page: Page) => page.getByTestId("workspace-storage");
const status = (page: Page) => page.getByTestId("workspace-status");
const restorePreview = (page: Page) => page.getByRole("region", { name: storageCopy.restorePreviewAria });
const channelFilter = (page: Page) => page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true });
/** 「範圍與金額基準」定義列表裡某一列（dt＝labels.data.panel.meta.*）的 dd。 */
const metaValue = (page: Page, term: string) => page.getByTestId("data-scope").locator("dl > div").filter({ has: page.locator("dt", { hasText: term }) }).locator("dd");
const overviewRows = (page: Page) => page.getByTestId("channel-mix").locator("table.channel-kv th[scope='row']");
/** 通路健檢的通路寬表每列的通路格（列的順序是表自己的排序，不是 manifest 順序，所以比對時先排序）。 */
const diagnosisRows = (page: Page) => page.getByTestId("channel-compare").locator("th.channel-cell");
async function expectDiagnosisNames(page: Page, names: string[]) {
  await expect(diagnosisRows(page)).toHaveCount(names.length);
  // V42-2a：有群組時通路格內多了「只看這個通路」按鈕，通路名是格內的第一個文字節點。
  expect((await diagnosisRows(page).evaluateAll(cells => cells.map(cell => (cell.firstChild?.textContent ?? "").trim()))).sort()).toEqual([...names].sort());
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => { const root = document.scrollingElement ?? document.documentElement; return root.scrollWidth <= root.clientWidth; });
/** 重算中的內容區（dashboard：applyFilters 期間 .view-content 標 aria-busy，舊內容保持掛載）。 */
const viewContent = (page: Page) => page.locator(".view-content");
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

/** 切到資料來源頁、點開預設收合的「通路設定」。 */
async function openEditor(page: Page) {
  await navigateTo(page, "data");
  await expect(page.getByTestId("targets-entry")).toBeVisible();
  await expect(editor(page)).not.toHaveAttribute("open", "");
  await openDetails(editor(page));
  await expect(editor(page)).toHaveAttribute("open", "");
}
async function backup(page: Page) {
  await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage(page).getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("profitlens-workspace.json");
  return readFile((await file.path())!, "utf8");
}
async function restoreFile(page: Page, text: string) {
  await openStorage(page);
  await storage(page).getByLabel(storageCopy.selectBackupFile, { exact: true }).setInputFiles({ name: "workspace.json", mimeType: "application/json", buffer: Buffer.from(text) });
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await hideDevOverlay(page);
  await page.goto("/");
  await loadDemo(page);
});

test("V42-1b 通路設定：改名、建群組、套用；顯示名稱出現在範圍文字、期間列、總覽與健檢；備份帶 channel_settings，重新開頁後還原再出現", async ({ page }) => {
  await openEditor(page);
  // 示範資料的起始值是隱含預設的別名（D-V42-13）；沒有群組；展開後頁面不橫向捲動。
  await expect(labelInput(page, "DTC")).toHaveValue(labels.data.demoChannelAlias.DTC);
  await expect(labelInput(page, "MARKETPLACE")).toHaveValue(labels.data.demoChannelAlias.MARKETPLACE);
  await expect(groupRows(page)).toHaveCount(0);
  await expect(editor(page)).toContainText(ui.groups.empty);
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(DEMO_NAMES);
  expect(await noHorizontalScroll(page), "展開編輯器後頁面不橫向捲動").toBe(true);

  await labelInput(page, "DTC").fill(DTC_NAME);
  await labelInput(page, "MARKETPLACE").fill(MARKETPLACE_NAME);
  await editor(page).getByRole("button", { name: ui.buttons.addGroup, exact: true }).click();
  const group = editor(page).getByTestId("channel-settings-group-g1");
  await expect(group).toBeVisible();
  await expect(groupRows(page)).toHaveCount(1);
  await expect(group).toContainText(ui.groups.noMembers);
  await groupNameInput(page, 1).fill(GROUP_NAME);
  await groupSelect(page, "DTC").selectOption("g1");
  await expect(groupSelect(page, "DTC")).toHaveValue("g1");
  await expect(groupSelect(page, "MARKETPLACE")).toHaveValue("");
  // 成員一行用的是目前草稿的顯示名稱。
  await expect(group).toContainText(fill(ui.groups.members, { list: DTC_NAME }));
  expect(await noHorizontalScroll(page), "建群組後頁面不橫向捲動").toBe(true);

  await applyButton(page).click();
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  // 套用後父層傳回正規化的設定、草稿重建：值不變、群組 id 不變。
  await expect(labelInput(page, "DTC")).toHaveValue(DTC_NAME);
  await expect(labelInput(page, "MARKETPLACE")).toHaveValue(MARKETPLACE_NAME);
  await expect(groupSelect(page, "DTC")).toHaveValue("g1");
  await expect(groupNameInput(page, 1)).toHaveValue(GROUP_NAME);
  await expect(metaValue(page, labels.data.panel.meta.channels)).toHaveText(NEW_NAMES);
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(NEW_NAMES);
  // V42-2a（D-V42-10）：有群組時選單是兩層——optgroup「自有」（群組選項＋官網直營）與最後一組「未分組」（蝦皮商城）。
  await expect(channelFilter(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, GROUP_NAME, DTC_NAME, MARKETPLACE_NAME]);
  await expect(channelFilter(page).locator("optgroup")).toHaveCount(2);
  await expect(channelFilter(page).locator("optgroup").first()).toHaveAttribute("label", GROUP_NAME);
  await expect(channelFilter(page).locator("optgroup").last()).toHaveAttribute("label", labels.shell.periodBarV42.ungrouped);

  await navigateTo(page, "overview");
  await expect(overviewRows(page)).toContainText([DTC_NAME, MARKETPLACE_NAME]);
  await navigateTo(page, "diagnosis");
  await expectDiagnosisNames(page, [DTC_NAME, MARKETPLACE_NAME]);

  // 備份：payload.channel_settings 帶顯示名稱與群組（與預設有差的欄位）；active.filters.channels 仍是通路代碼。
  const text = await backup(page);
  const wire = JSON.parse(text);
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.channel_settings).toEqual({ version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: DTC_NAME, group: "g1" }, { code: "MARKETPLACE", label: MARKETPLACE_NAME }], groups: [{ id: "g1", label: GROUP_NAME, order: 0 }] });
  expect(wire.payload.active.filters.channels).toEqual(["DTC", "MARKETPLACE"]);

  // 重新開頁（記憶體裡的工作區清空）再讀入備份：還原預覽的通路片段、期間列、編輯器都再出現顯示名稱與群組。
  await page.goto("/");
  await expect(status(page)).toContainText(labels.shell.status.empty);
  await restoreFile(page, text);
  await expect(restorePreview(page)).toBeVisible();
  await expect(restorePreview(page)).toContainText(NEW_NAMES);
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toHaveText(storageCopy.restoredNotice);
  await closeStorage(page);
  await dismissSavePrompt(page);
  // V42-2a（D-V42-10）：有群組時選單是兩層——optgroup「自有」（群組選項＋官網直營）與最後一組「未分組」（蝦皮商城）。
  await expect(channelFilter(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, GROUP_NAME, DTC_NAME, MARKETPLACE_NAME]);
  await expect(channelFilter(page).locator("optgroup")).toHaveCount(2);
  await expect(channelFilter(page).locator("optgroup").first()).toHaveAttribute("label", GROUP_NAME);
  await expect(channelFilter(page).locator("optgroup").last()).toHaveAttribute("label", labels.shell.periodBarV42.ungrouped);
  await openEditor(page);
  await expect(labelInput(page, "DTC")).toHaveValue(DTC_NAME);
  await expect(labelInput(page, "MARKETPLACE")).toHaveValue(MARKETPLACE_NAME);
  await expect(groupSelect(page, "DTC")).toHaveValue("g1");
  await expect(groupSelect(page, "MARKETPLACE")).toHaveValue("");
  await expect(groupRows(page)).toHaveCount(1);
  await expect(groupNameInput(page, 1)).toHaveValue(GROUP_NAME);
  await expect(editor(page).getByTestId("channel-settings-group-g1")).toContainText(fill(ui.groups.members, { list: DTC_NAME }));
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(NEW_NAMES);
  await navigateTo(page, "overview");
  await expect(overviewRows(page)).toContainText([DTC_NAME, MARKETPLACE_NAME]);
});

test("V42-1b 通路設定：不合規則的名稱（前面有空格）列出規則句、狀態句空白、不套用；改成合規的名稱後再套用就通過", async ({ page }) => {
  await openEditor(page);
  const bad = ` ${DTC_NAME}`;
  await labelInput(page, "DTC").fill(bad);
  await applyButton(page).click();
  await expect(problems(page)).toHaveText([fill(ui.validation.invalidName, { name: bad })]);
  await expect(statusLine(page)).toHaveText("");
  // 沒有套用：草稿保留使用者打的字（不修剪），範圍文字與期間列仍是示範別名。
  await expect(labelInput(page, "DTC")).toHaveValue(bad);
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(DEMO_NAMES);
  await expect(channelFilter(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, labels.data.demoChannelAlias.DTC, labels.data.demoChannelAlias.MARKETPLACE]);
  // 問題清單出現的狀態跑 axe：live role 在外層 div、<ul> 仍是 list（li 的父層是 list），serious／critical 都是 0。
  const violations = await axeSeriousViolations(page);
  if (violations === null) test.info().annotations.push({ type: "axe", description: "node_modules 沒有 axe-core，這一步略過" });
  else expect(violations, JSON.stringify(violations)).toEqual([]);
  // 201 字、沒有空白的名稱：規則句原樣引出名稱，問題清單要折行、頁面不橫向捲動。
  const long = "x".repeat(201);
  await labelInput(page, "DTC").fill(long);
  await applyButton(page).click();
  await expect(problems(page)).toHaveText([fill(ui.validation.invalidName, { name: long })]);
  await expect(statusLine(page)).toHaveText("");
  expect(await noHorizontalScroll(page), "長名稱的規則句不造成橫向捲動").toBe(true);
  await labelInput(page, "DTC").fill(DTC_NAME);
  await applyButton(page).click();
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(`${DTC_NAME}、${labels.data.demoChannelAlias.MARKETPLACE}`);
});

test("V42-1b 通路設定：套用之後、重算完成之前繼續打字，打的字不會被父層傳回的設定蓋掉；套用成功時沒有成員的群組當場從草稿去掉", async ({ page }) => {
  await openEditor(page);
  await labelInput(page, "DTC").fill(DTC_NAME);
  // 暫停頁面的時鐘：applyFilters 先等一個 requestAnimationFrame（afterPaint）才重算，暫停時這個 frame 不會來、aria-busy 一直掛著；Playwright 自己的等待不受頁面時鐘影響。
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1_000);
  await applyButton(page).click();
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(viewContent(page)).toHaveAttribute("aria-busy", "true");
  await labelInput(page, "MARKETPLACE").fill(MARKETPLACE_NAME);
  await expect(viewContent(page)).toHaveAttribute("aria-busy", "true");
  await page.clock.resume();
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
  // 父層傳回的是剛套用的那份設定：草稿不重建，MARKETPLACE 打到一半的名稱還在（狀態句因為有未套用的改動而空白）；DTC 已生效、MARKETPLACE 仍是示範別名。
  await expect(labelInput(page, "MARKETPLACE")).toHaveValue(MARKETPLACE_NAME);
  await expect(labelInput(page, "DTC")).toHaveValue(DTC_NAME);
  await expect(statusLine(page)).toHaveText("");
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(`${DTC_NAME}、${labels.data.demoChannelAlias.MARKETPLACE}`);
  await expect(channelFilter(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, DTC_NAME, labels.data.demoChannelAlias.MARKETPLACE]);
  // 再套用：MARKETPLACE 的名稱生效；一起新增一個沒有成員的群組，套用當下群組列就從草稿去掉。
  await editor(page).getByRole("button", { name: ui.buttons.addGroup, exact: true }).click();
  await expect(groupRows(page)).toHaveCount(1);
  await applyButton(page).click();
  await expect(groupRows(page)).toHaveCount(0);
  await expect(editor(page)).toContainText(ui.groups.empty);
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(labelInput(page, "MARKETPLACE")).toHaveValue(MARKETPLACE_NAME);
  await expect(metaValue(page, labels.data.panel.meta.scopeChannels)).toHaveText(NEW_NAMES);
  await expect(channelFilter(page).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, DTC_NAME, MARKETPLACE_NAME]);
});
