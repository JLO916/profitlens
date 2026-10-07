import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { formatAmountL1, formatCount, formatPerUnit, formatRateL1 } from "../../src/application/presentation";
import { openWizard, setWizardFiles, nextFromFiles, confirmMappingIfShown, chooseBasis, confirmAndCheck, commitWizard } from "./import-wizard-helpers";
import { choosePreset, clickReplacing, closeDownloads, closeStorage, dismissSavePrompt, isMobile, navigateTo, openDownloads, openStorage, openValidation, periodSummary, periodSummaryText, presetButton } from "./replacement-helpers";
import { expectIssueRow, issueCells, issueColumns, issueTable, showReasonCodes, versionInfo } from "./data-page-helpers-v3";

// R4：輔助指標橫列、「去年同期」快捷、目標達成率、趨勢檔期區帶、備份 v4 來回。
// 合成資料（一個通路「官網」、一個商品）：2025-06-01～2026-08-31，2025 年每天原價收入 100.00、2026 年每天 200.00，成本一律 40.00；
// 費用每天 5.00／2.00／3.00／0.00；廣告 2025 年每天 10.00、2026 年每天 40.00。
// 手算：2026-08（31 天）淨營收 31 × 200 ＝ 6200.00；2025-08 淨營收 31 × 100 ＝ 3100.00；件數 2026-08 ＝ 31 × 2 ＝ 62 件；件均 6200 ÷ 62 ＝ 100.00 元／件。
//        目標 8000.00 → 達成 6200 ÷ 8000 ＝ 77.5%。
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
function days(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
function synthetic() {
  const all = days("2025-06-01", "2026-08-31");
  const sales = ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...all.map(day => `${day},官網,SKU-1,服飾,2,${day < "2026" ? "100.00" : "200.00"},0.00,0.00,40.00,TWD`)].join("\n");
  const costs = ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...all.map(day => `${day},官網,5.00,2.00,3.00,0.00,TWD`)].join("\n");
  const ads = ["date,channel,ad_spend,currency", ...all.map(day => `${day},官網,${day < "2026" ? "10.00" : "40.00"},TWD`)].join("\n");
  const buffer = (text: string) => Buffer.from(text, "utf8");
  return { "sales_daily.csv": { name: "sales_daily.csv", mimeType: "text/csv", buffer: buffer(sales) }, "channel_costs_daily.csv": { name: "channel_costs_daily.csv", mimeType: "text/csv", buffer: buffer(costs) }, "ad_spend_daily.csv": { name: "ad_spend_daily.csv", mimeType: "text/csv", buffer: buffer(ads) } } as const;
}
async function importSynthetic(page: Page) {
  await openWizard(page);
  await setWizardFiles(page, "", synthetic());
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await commitWizard(page);
}
// V3-3（D-V3-10＝A）：期間快捷單擊就套用，不再按「套用」；套用後的範圍看期間摘要（period-summary）。手機上快捷在期間底部面板裡（choosePreset 會先開）。
// 本月 vs 上月：本期 2026-08-01～08-31、上期 2026-07-01～07-31（各 31 天）；去年同期：上期 2025-08-01～08-31。資料到 2026-08-31。
const MONTH_SUMMARY = periodSummaryText("2026-08-01", "2026-08-31", "2026-07-01", "2026-07-31");
const YOY_SUMMARY = periodSummaryText("2026-08-01", "2026-08-31", "2025-08-01", "2025-08-31");

/**
 * V3-3 手機：首次保存提示（.local-save-prompt，z-index 25）疊在「更多」面板（.mobile-tabbar 的堆疊層 20）與頂欄「更多」工具列（.topbar 的堆疊層 21）之上，
 * 提示出現時點不到「更多」裡的頁面與儲存／匯出選單（已回報為產品問題）。本檔不測保存提示，手機流程先按「先不要」；桌機流程不變。
 */
async function declineSavePromptOnMobile(page: Page) {
  if (!isMobile(page)) return;
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("golden 的輔助指標橫列：七格、件數 8 件、件均 308.75 元／件，可開「怎麼算的」", async ({ page }) => {
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  // V3-2b：KPI 卡大數字是 L1（< 1 萬顯示整數元＋「元」）。
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
  const row = page.getByTestId("assist-kpis");
  // V3-4a：七格改成 C2 兩欄緊湊表（7 列；本期、上期兩欄都是 number-link）。
  await expect(row.locator("tr[data-testid^='assist-']")).toHaveCount(7);
  await expect(page.getByTestId("assist-units_sold").locator("td.num:not(.prev)")).toHaveText(formatCount("8", "L1"));
  await expect(page.getByTestId("assist-units_sold").locator("td.prev")).toHaveText(formatCount("6", "L1"));
  // 輔助指標橫列是 L1（件均取整元）；抽屜下一行是到分的精確值（L3）。
  await expect(page.getByTestId("assist-net_revenue_per_unit")).toContainText(formatPerUnit("308.75", "L1"));
  // 本期值與上期值都是按鈕；點本期的。
  await page.getByTestId("assist-net_revenue_per_unit").locator("td.num:not(.prev) button").click();
  const drawer = page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(formatPerUnit("308.75", "L1"));
  await expect(drawer.getByTestId("evidence-precise-value")).toHaveText(formatPerUnit("308.75", "L3"));
  await expect(drawer).toContainText(labels.assist.items.net_revenue_per_unit.formula);
  await expect(drawer.locator(".ladder-table")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("去年同期快捷：本月 vs 上月套用後，上期各減一年；超出涵蓋時停用並說明", async ({ page }) => {
  await importSynthetic(page);
  await expect(kpi(page, "net_revenue")).toBeVisible();
  // 剛匯入的提議期間：上期起日是 2025-06-01，去年同期會早於涵蓋 → 停用＋原因。
  const yoy = presetButton(page, "yoy");
  await expect(yoy).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#preset-reason-yoy")).toContainText("2025-06-01");
  // 理由也要看得見（不只 title／sr-only）。
  await expect(page.getByTestId("preset-reason-visible-yoy")).toContainText("2025-06-01");
  await choosePreset(page, "monthVsPrev");
  await expect(periodSummary(page)).toContainText(MONTH_SUMMARY);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("6200.00"));
  await expect(yoy).not.toHaveAttribute("aria-disabled", "true");
  // 理由橫幅在去年同期可用後消失。
  await expect(page.getByTestId("preset-reason-visible-yoy")).toHaveCount(0);
  await choosePreset(page, "yoy");
  await expect(page.locator("#previous-start")).toHaveValue("2025-08-01");
  await expect(page.locator("#previous-end")).toHaveValue("2025-08-31");
  await expect(page.locator("#current-start")).toHaveValue("2026-08-01");
  await expect(page.locator("#current-end")).toHaveValue("2026-08-31");
  await expect(yoy).toHaveAttribute("aria-pressed", "true");
  await expect(periodSummary(page)).toContainText(YOY_SUMMARY);
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-prev")).toContainText(formatAmountL1("3100.00"));
  await expect(page.getByTestId("assist-units_sold")).toContainText(formatCount("62", "L1"));
  await expect(page.getByTestId("assist-net_revenue_per_unit")).toContainText(formatPerUnit("100.00", "L1"));
});

test("目標與檔期：KPI 卡達成率只在期間完全相同時顯示、趨勢圖標示檔期、備份 v4 來回保留", async ({ page }) => {
  await importSynthetic(page);
  await declineSavePromptOnMobile(page);
  await choosePreset(page, "monthVsPrev");
  await expect(periodSummary(page)).toContainText(MONTH_SUMMARY);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("6200.00"));
  await navigateTo(page, "data");
  // V3-8（§7.7.1 第 8 點）：精靈匯入後「版本與來源資訊」多一列「匯入時間」（還原備份後沒有這一列）。
  const importedAtRow = versionInfo(page).locator("dt").filter({ hasText: labels.data.pageV3.version.importedAt });
  await expect(importedAtRow).toHaveCount(1);
  const targetsCsv = ["period_start,period_end,channel,metric,target", "2026-08-01,2026-08-31,ALL,net_revenue,8000.00", "2026-07-01,2026-07-31,ALL,gross_profit,5000.00"].join("\n");
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from(targetsCsv) });
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(2);
  // 錯誤檔：指標不在白名單 → 問題列出行號，原目標保留。
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,ALL,profit,1\n") });
  // V3-8（§7.7.1 第 6 點）：錯誤清單改成與資料問題同一組欄位的六欄表（檔案｜行號｜欄位｜問題｜修法｜原因碼），外層仍是 role=alert；原因碼欄預設收合。
  const targetIssues = page.getByTestId("targets-issues");
  await expect(targetIssues).toHaveAttribute("role", "alert");
  await expect(targetIssues).toContainText("INVALID_METRIC");
  await expect(targetIssues.getByRole("region", { name: fill(labels.data.pageV3.issueTable.sideRegionAria, { name: labels.targets.entry }), exact: true })).toBeVisible();
  await expect(issueTable(targetIssues).locator("thead th")).toHaveText([...issueColumns]);
  const targetRow = issueTable(targetIssues).locator("tbody tr");
  await expect(targetRow).toHaveCount(1);
  const invalidMetric = issueCells(fill(labels.targets.errors.INVALID_METRIC, { line: 2, value: "profit" }));
  await expectIssueRow(targetRow, { file: "targets.csv", line: 2, field: "metric", ...invalidMetric });
  await expect(targetRow.locator("td.issue-code")).toBeHidden();
  await showReasonCodes(targetIssues);
  await expectIssueRow(targetRow, { file: "targets.csv", line: 2, field: "metric", ...invalidMetric, code: "INVALID_METRIC" });
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(2);
  // 檔期的錯誤檔（迄日早於起日）：同一張六欄表，原檔期不建立；再讀正確檔後錯誤清單消失。
  await page.getByLabel(labels.events.upload, { exact: true }).setInputFiles({ name: "bad-events.csv", mimeType: "text/csv", buffer: Buffer.from("start,end,label\n2026-08-16,2026-08-10,夏季特賣\n") });
  const eventIssues = page.getByTestId("events-issues");
  await expect(eventIssues).toHaveAttribute("role", "alert");
  await expect(eventIssues.getByRole("region", { name: fill(labels.data.pageV3.issueTable.sideRegionAria, { name: labels.events.entry }), exact: true })).toBeVisible();
  const eventRow = issueTable(eventIssues).locator("tbody tr");
  await expect(eventRow).toHaveCount(1);
  const periodOrder = issueCells(fill(labels.events.errors.PERIOD_ORDER, { line: 2 }));
  await expectIssueRow(eventRow, { file: "events.csv", line: 2, field: "end", ...periodOrder });
  await showReasonCodes(eventIssues);
  await expectIssueRow(eventRow, { file: "events.csv", line: 2, field: "end", ...periodOrder, code: "PERIOD_ORDER" });
  await expect(page.getByTestId("events-table")).toHaveCount(0);
  const eventsCsv = "start,end,label\n2026-08-10,2026-08-16,夏季特賣\n";
  await page.getByLabel(labels.events.upload, { exact: true }).setInputFiles({ name: "events.csv", mimeType: "text/csv", buffer: Buffer.from(eventsCsv) });
  await expect(page.getByTestId("events-table").locator("tbody tr")).toHaveCount(1);
  await expect(eventIssues).toHaveCount(0);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-target-net_revenue")).toHaveText(fill(labels.targets.achieved, { target: formatAmountL1("8000.00"), rate: formatRateL1("0.775") }));
  await expect(page.getByTestId("kpi-target-gross_profit")).toHaveText(fill(labels.targets.mismatch, { start: "2026-07-01", end: "2026-07-31" }));
  // 目標數字可追溯：抽屜列出實際、目標與 targets.csv 行號。
  await page.getByTestId("kpi-target-net_revenue").getByRole("button").click();
  const targetDrawer = page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
  await expect(targetDrawer).toContainText(fill(labels.targets.sourceLine, { file: "targets.csv", line: 2 }));
  await expect(targetDrawer).toContainText(labels.targets.formula);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("kpi-target-contribution_after_marketing")).toHaveCount(0);
  // V3-4b：趨勢改成 C16 圖表框（section data-testid="trend"）；檔期清單 trend-events 仍在趨勢區塊內（圖下方的註記）。
  await expect(page.getByTestId("trend").getByTestId("trend-events")).toContainText(fill(labels.events.trendItem, { label: "夏季特賣", start: "2026-08-10", end: "2026-08-16" }));
  const topThree = page.getByTestId("top-three");
  // V3-4a（C9 摘要型）：檔期不再接在標題後，改放進列內展開內容的「檔期」一行（收合時仍掛載，textContent 可讀）。
  const firstPriority = topThree.locator("[data-testid^='overview-priority-']").first();
  if (await firstPriority.count()) await expect(firstPriority.locator(".alert-body")).toContainText(`${labels.overview.alerts.eventPeriod}${fill(labels.overview.alerts.eventValue, { label: "夏季特賣" })}`);
  // 匯出：分析 CSV 有 target／achievement 列；主管摘要 Markdown 有「目標達成」。
  const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }).click()]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("target_net_revenue");
  expect(csv).toContain("achievement_net_revenue");
  expect(csv).toContain("assist_kpi");
  await closeDownloads(page);
  // 備份 v4：下載 → 檢查 → 清空 → 恢復 → 目標與檔期都回來。
  // V3-3：儲存選單（手機收在頂欄「更多」）。
  const storage = await openStorage(page);
  const [backup] = await Promise.all([page.waitForEvent("download"), storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true }).click()]);
  const text = await readFile((await backup.path())!, "utf8");
  const wire = JSON.parse(text) as { schema_version: string; payload: { targets: { rows: unknown[] } | null; events: { rows: unknown[] } | null; preprocessing: unknown; meeting_history: unknown[]; ui_prefs: Record<string, unknown> } };
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.targets?.rows).toHaveLength(2);
  expect(wire.payload.events?.rows).toHaveLength(1);
  expect(wire.payload.preprocessing).toBeNull();
  expect(wire.payload.meeting_history).toEqual([]);
  expect(wire.payload.ui_prefs).toEqual({ last_preset: "monthVsPrev" });
  await storage.getByLabel(labels.ui.workspaceStorage.selectBackupFile, { exact: true }).setInputFiles({ name: "r4.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.getByRole("region", { name: labels.ui.workspaceStorage.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, storage.getByRole("button", { name: labels.ui.workspaceStorage.applyRestore, exact: true }));
  await expect(page.getByTestId("kpi-target-net_revenue")).toHaveText(fill(labels.targets.achieved, { target: formatAmountL1("8000.00"), rate: formatRateL1("0.775") }));
  await expect(page.getByTestId("trend").getByTestId("trend-events")).toContainText("夏季特賣");
  // 若恢復後又出現保存提示，先按「先不要」（手機上才點得到頂欄「更多」裡的儲存選單）。
  await dismissSavePrompt(page);
  await closeStorage(page);
  // 資料頁可逐列刪除：刪掉毛利那列後只剩一列。
  await navigateTo(page, "data");
  // 還原後的資料來源頁：目標與檔期表回來；先前讀檔留下的錯誤清單清空；沒有「匯入時間」列。
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("events-table").locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("targets-issues")).toHaveCount(0);
  await expect(importedAtRow).toHaveCount(0);
  await page.getByTestId("targets-table").getByRole("button", { name: `${labels.targets.removeRow} 3`, exact: true }).click();
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(1);
});

test("舊的單頁匯入面板已移除：#legacy-import 不再掛載", async ({ page }) => {
  await page.goto("/#legacy-import");
  // V3-3：頁首「匯入資料」只在資料來源頁；其他頁經頂欄資料狀態 →「匯入新資料」開精靈。
  await openWizard(page);
  await expect(page.getByTestId("import-wizard")).toBeVisible();
  await expect(page.locator("#legacy-import")).toHaveCount(0);
  await expect(page.getByTestId("import-panel")).toHaveCount(0);
});
