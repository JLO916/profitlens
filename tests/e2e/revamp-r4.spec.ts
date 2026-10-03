import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { openWizard, setWizardFiles, nextFromFiles, confirmMappingIfShown, chooseBasis, confirmAndCheck, commitWizard } from "./import-wizard-helpers";
import { clickReplacing, openDetails, openDownloads, closeDownloads } from "./replacement-helpers";

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
const preset = (page: Page, name: string) => page.getByRole("group", { name: labels.sections.presetGroup }).getByRole("button", { name, exact: true });
const applyPeriod = (page: Page) => page.locator("form.period-form").getByRole("button", { name: labels.buttons.apply, exact: true });

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("golden 的輔助指標橫列：七格、件數 8 件、件均 308.75 元／件，可開「怎麼算的」", async ({ page }) => {
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(kpi(page, "net_revenue")).toHaveText("2,470.00");
  const row = page.getByTestId("assist-kpis");
  await expect(row.locator(".assist-card")).toHaveCount(7);
  await expect(page.getByTestId("assist-units_sold")).toContainText("8 件");
  await expect(page.getByTestId("assist-units_sold")).toContainText(`${labels.periods.previous} 6 件`);
  await expect(page.getByTestId("assist-net_revenue_per_unit")).toContainText("308.75 元／件");
  // 本期值與上期值都是按鈕；點本期的。
  await page.getByTestId("assist-net_revenue_per_unit").locator(".assist-value button").click();
  const drawer = page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("308.75 元／件");
  await expect(drawer).toContainText(labels.assist.items.net_revenue_per_unit.formula);
  await expect(drawer.locator(".ladder-table")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("去年同期快捷：本月 vs 上月套用後，上期各減一年；超出涵蓋時停用並說明", async ({ page }) => {
  await importSynthetic(page);
  await expect(kpi(page, "net_revenue")).toBeVisible();
  // 剛匯入的提議期間：上期起日是 2025-06-01，去年同期會早於涵蓋 → 停用＋原因。
  const yoy = preset(page, labels.periods.presets.yoy);
  await expect(yoy).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#preset-reason-yoy")).toContainText("2025-06-01");
  // 理由也要看得見（不只 title／sr-only）。
  await expect(page.getByTestId("preset-reason-visible-yoy")).toContainText("2025-06-01");
  await preset(page, labels.periods.presets.monthVsPrev).click();
  await applyPeriod(page).click();
  await expect(kpi(page, "net_revenue")).toHaveText("6,200.00");
  await expect(yoy).not.toHaveAttribute("aria-disabled", "true");
  await yoy.click();
  await expect(page.locator("#previous-start")).toHaveValue("2025-08-01");
  await expect(page.locator("#previous-end")).toHaveValue("2025-08-31");
  await expect(page.locator("#current-start")).toHaveValue("2026-08-01");
  await expect(page.locator("#current-end")).toHaveValue("2026-08-31");
  await expect(yoy).toHaveAttribute("aria-pressed", "true");
  await applyPeriod(page).click();
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-previous")).toContainText("3,100.00");
  await expect(page.getByTestId("assist-units_sold")).toContainText("62 件");
  await expect(page.getByTestId("assist-net_revenue_per_unit")).toContainText("100.00 元／件");
});

test("目標與檔期：KPI 卡達成率只在期間完全相同時顯示、趨勢圖標示檔期、備份 v4 來回保留", async ({ page }) => {
  await importSynthetic(page);
  await preset(page, labels.periods.presets.monthVsPrev).click();
  await applyPeriod(page).click();
  await expect(kpi(page, "net_revenue")).toHaveText("6,200.00");
  await page.getByRole("button", { name: labels.nav.data.label, exact: true }).click();
  const targetsCsv = ["period_start,period_end,channel,metric,target", "2026-08-01,2026-08-31,ALL,net_revenue,8000.00", "2026-07-01,2026-07-31,ALL,gross_profit,5000.00"].join("\n");
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from(targetsCsv) });
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(2);
  // 錯誤檔：指標不在白名單 → 問題列出行號，原目標保留。
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,ALL,profit,1\n") });
  await expect(page.getByTestId("targets-issues")).toContainText("INVALID_METRIC");
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(2);
  const eventsCsv = "start,end,label\n2026-08-10,2026-08-16,夏季特賣\n";
  await page.getByLabel(labels.events.upload, { exact: true }).setInputFiles({ name: "events.csv", mimeType: "text/csv", buffer: Buffer.from(eventsCsv) });
  await expect(page.getByTestId("events-table").locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(page.getByTestId("kpi-target-net_revenue")).toHaveText(fill(labels.targets.achieved, { target: "8,000.00", rate: "77.5%" }));
  await expect(page.getByTestId("kpi-target-gross_profit")).toHaveText(fill(labels.targets.mismatch, { start: "2026-07-01", end: "2026-07-31" }));
  // 目標數字可追溯：抽屜列出實際、目標與 targets.csv 行號。
  await page.getByTestId("kpi-target-net_revenue").getByRole("button").click();
  const targetDrawer = page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
  await expect(targetDrawer).toContainText(fill(labels.targets.sourceLine, { file: "targets.csv", line: 2 }));
  await expect(targetDrawer).toContainText(labels.targets.formula);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("kpi-target-contribution_after_marketing")).toHaveCount(0);
  await expect(page.getByTestId("trend-events")).toContainText(fill(labels.events.trendItem, { label: "夏季特賣", start: "2026-08-10", end: "2026-08-16" }));
  const topThree = page.getByTestId("top-three");
  if (await topThree.locator(".top-three-list li").count()) await expect(topThree.locator(".top-three-list li").first().locator("h3")).toContainText(fill(labels.events.during, { label: "夏季特賣" }));
  // 匯出：分析 CSV 有 target／achievement 列；主管摘要 Markdown 有「目標達成」。
  const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }).click()]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("target_net_revenue");
  expect(csv).toContain("achievement_net_revenue");
  expect(csv).toContain("assist_kpi");
  await closeDownloads(page);
  // 備份 v4：下載 → 檢查 → 清空 → 恢復 → 目標與檔期都回來。
  const storage = await openDetails(page.getByTestId("workspace-storage"));
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
  await expect(page.getByTestId("kpi-target-net_revenue")).toHaveText(fill(labels.targets.achieved, { target: "8,000.00", rate: "77.5%" }));
  await expect(page.getByTestId("trend-events")).toContainText("夏季特賣");
  // 資料頁可逐列刪除：刪掉毛利那列後只剩一列。
  await page.getByRole("button", { name: labels.nav.data.label, exact: true }).click();
  await page.getByTestId("targets-table").getByRole("button", { name: `${labels.targets.removeRow} 3`, exact: true }).click();
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(1);
});

test("舊的單頁匯入面板已移除：#legacy-import 不再掛載", async ({ page }) => {
  await page.goto("/#legacy-import");
  await page.getByRole("button", { name: labels.buttons.importData, exact: true }).click();
  await expect(page.getByTestId("import-wizard")).toBeVisible();
  await expect(page.locator("#legacy-import")).toHaveCount(0);
  await expect(page.getByTestId("import-panel")).toHaveCount(0);
});
