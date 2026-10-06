import { closeDownloads, dismissSavePrompt, openDownloads, openPeriodComparison } from "./replacement-helpers";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardManifest, wizard } from "./import-wizard-helpers";
import { fill, labels } from "../../src/i18n";
import { channelsLabel } from "../../src/application/copy";
import { formatAmountL1, formatAmountL2, formatSignedDelta } from "../../src/application/presentation";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

/** R2: every user-visible string is read from the label dictionary; composed strings mirror the component exactly. */
const ui = labels.ui.overview;
const metric = (name: keyof typeof labels.metrics) => labels.metrics[name].label;
/** dashboard.tsx periodFieldLabel: sr-only date labels such as 「上期開始」. */
const periodField = (edge: "start" | "end", period: "previous" | "current") => fill((edge === "start" ? labels.ui.dashboard.filter.periodStart : labels.ui.dashboard.filter.periodEnd).split(" → ")[0], { period: labels.periods[period] });
/** V3-2a：dashboard scopeNote 改成一句「本期 {currentStart}–{currentEnd} 對比 上期 …」；取模板開頭到 {currentEnd} 的本期片段。 */
const scopeNoteCurrent = (start: string, end: string) => { const template = labels.ui.dashboard.scopeNote; return fill(template.slice(0, template.indexOf("{currentEnd}") + "{currentEnd}".length), { currentStart: start, currentEnd: end }); };
/** V3-2a：抽屜說明列 evidenceDrawer.scopeLine「{scope}；{start}–{end}；通路：{channels}。」（期間改用 en dash，不再寫「至」）。 */
const drawerScopeLine = (scope: string, start: string, end: string, channels: string[]) => fill(labels.ui.evidenceDrawer.scopeLine, { scope, start, end, channels: channelsLabel(channels, false) });
const sourceTab = (tab: keyof typeof labels.evidence.sourceTabs, n: number) => fill(labels.ui.evidenceDrawer.tabWithCount, { tab: labels.evidence.sourceTabs[tab], n });
/** Synthetic input only. Fixed expected answers below do not call domain calculations. */
function monthlyFiles(kind: "complete" | "zero" | "missing" = "complete") {
  const dates = [...Array.from({ length: 31 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`)];
  const zero = kind === "zero";
  return {
    manifest: {
      schema_version: "1.0", dataset_id: `pl02-${kind}-synthetic`, source_type: "synthetic", currency: "TWD", timezone: "Asia/Taipei", data_as_of: "2026-09-30", coverage_start: "2026-08-01", coverage_end: "2026-09-30", channels: ["DTC"], comparison_mode: "calendar_months",
      previous_period: { start: "2026-08-01", end: "2026-08-31" }, current_period: { start: "2026-09-01", end: "2026-09-30" }, sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
    },
    files: {
      [labels.importWizard.files.sales]: { name: "sales_daily.csv", text: "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + dates.map(date => `${date},DTC,A,合成測試,1,${zero ? 0 : 100},0,0,${kind === "missing" && date === "2026-09-01" ? "" : zero ? 0 : 40},TWD`).join("\n") },
      [labels.importWizard.files.costs]: { name: "channel_costs_daily.csv", text: "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency\n" + dates.map(date => `${date},DTC,${zero ? 0 : 5},0,${zero ? 0 : 10},0,TWD`).join("\n") },
      [labels.importWizard.files.ads]: { name: "ad_spend_daily.csv", text: "date,channel,ad_spend,currency\n" + dates.map(date => `${date},DTC,${zero ? 0 : 20},TWD`).join("\n") },
    },
  };
}
const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use, testInfo) => {
    const events: string[] = [];
    page.on("pageerror", error => events.push(`pageerror:${error.name}`));
    page.on("console", message => { if (message.type() === "error") events.push("console:error"); });
    await use(events);
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-period-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, test: testInfo.title, status: testInfo.status, browser_errors: events })}\n`);
    expect(events).toEqual([]);
  }, { auto: true }],
});
const comparison = (page: Page) => page.getByTestId("period-comparison");
const contributionRow = (page: Page) => comparison(page).getByRole("row").filter({ has: page.getByText(metric("contribution_after_marketing"), { exact: true }) });
const revenueRow = (page: Page) => comparison(page).getByRole("row").filter({ has: page.getByText(metric("net_revenue"), { exact: true }) });
const currentContribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
/** V3-2b（§8.5）：期間合計與日均表是 L2（整數元、千分位、不帶單位），最後一欄日均差額帶正負號（U+2212）；KPI 大數字 L1；橋接總差額 L3。 */
const periodCells = (prevTotal: string, curTotal: string, prevAvg: string, curAvg: string, avgChange: string) => [formatAmountL2(prevTotal), formatAmountL2(curTotal), formatAmountL2(prevAvg), formatAmountL2(curAvg), formatSignedDelta(avgChange, "L2")];
/** R3: drives the four-step import wizard (step 1 files + advanced manifest → step 2 auto-skipped for standard headers → step 3 basis/settings → step 4 check → commit). */
async function importMonthly(page: Page, kind: "complete" | "zero" | "missing" = "complete") {
  await page.goto("/");
  await openWizard(page);
  const root = wizard(page);
  const input = monthlyFiles(kind);
  for (const [label, file] of Object.entries(input.files)) await root.getByLabel(label, { exact: true }).setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text) });
  for (const file of Object.values(input.files)) await expect(page.getByTestId(`import-file-${file.name}`)).toContainText(file.name);
  await setWizardManifest(page, { name: "manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input.manifest)) });
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // Standard headers only: the mapping step is skipped automatically.
  await expect(page.getByTestId("import-stepper").locator("li").nth(1)).toHaveClass(/skipped/);
  // Step 3 settings are prefilled from the manifest JSON read in step 1.
  await expect(root.getByLabel(labels.importWizard.datasetName, { exact: true })).toHaveValue(input.manifest.dataset_id);
  await expect(root.getByLabel(labels.importWizard.comparisonMode, { exact: true })).toHaveValue("calendar_months");
  await expect(root.getByLabel(labels.csvColumns.previous_start, { exact: true })).toHaveValue("2026-08-01");
  await expect(root.getByLabel(labels.csvColumns.previous_end, { exact: true })).toHaveValue("2026-08-31");
  await expect(root.getByLabel(labels.csvColumns.current_start, { exact: true })).toHaveValue("2026-09-01");
  await expect(root.getByLabel(labels.csvColumns.current_end, { exact: true })).toHaveValue("2026-09-30");
  await expect(root.getByLabel("DTC", { exact: true })).toBeChecked();
  // The former amount-basis checkbox is now the explicit basis choice plus the single confirm button.
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, kind === "missing" ? "partial" : "valid");
  await commitWizard(page);
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  await openPeriodComparison(page);
  await expect(comparison(page)).toBeVisible();
  await expect(page.getByLabel(labels.ui.dashboard.filter.comparisonMode, { exact: true })).toHaveValue("calendar_months");
}
/** Independent reader for exported quoted CSV, with no production parser/expected generator. */
function records(csv: string): Record<string, string>[] {
  const text = csv.replace(/^\uFEFF/, ""), rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(value); value = ""; }
    else if (!quoted && (char === "\r" || char === "\n")) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += char;
  }
  expect(quoted).toBe(false);
  if (value || row.length) rows.push([...row, value]);
  const headers = rows.shift()!;
  return rows.map(values => {
    expect(values).toHaveLength(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header.replace(/^.*\(([^()]+)\)\s*$/, "$1"), values[index]]));
  });
}
async function downloadAnalysis(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }).click()]);
  await closeDownloads(page);
  expect(download.suggestedFilename()).toBe("profitlens-analysis.csv");
  return records(await readFile((await download.path())!, "utf8"));
}

test("PL-02 匯入完整八九月，合計與日均分開，公式來源與下載一致", async ({ page }, testInfo) => {
  await importMonthly(page);
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText(formatAmountL1("3000.00"));
  await expect(currentContribution(page)).toHaveText(formatAmountL1("750.00"));
  await expect(page.locator(".bridge-total")).toContainText(formatSignedDelta("-25.00", "L3"));
  await expect(comparison(page)).toContainText(fill(ui.periodDays, { previousDays: 31, currentDays: 30 }));
  await expect(revenueRow(page).getByRole("cell")).toHaveText(periodCells("3100.00", "3000.00", "100.00", "100.00", "0.00"));
  await expect(contributionRow(page).getByRole("cell")).toHaveText(periodCells("775.00", "750.00", "25.00", "25.00", "0.00"));
  await contributionRow(page).getByRole("cell").nth(3).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
  await expect(dialog).toContainText(`${metric("contribution_after_marketing")}${ui.periodTotal} ÷ 30 天`);
  await expect(dialog).toContainText(ui.dailyAverageScope);
  await expect(dialog).toContainText(drawerScopeLine(ui.dailyAverageScope, "2026-09-01", "2026-09-30", ["DTC"]));
  // R2 groups source rows by file tab (sales／costs／ads) instead of one paged list: 30 + 30 + 30 = 90 rows.
  await expect(dialog.getByRole("button", { name: sourceTab("sales", 30), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: sourceTab("costs", 30), exact: true })).toBeVisible();
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText(fill(labels.evidence.showing, { from: 1, to: 30, n: 30 }));
  await dialog.getByRole("button", { name: sourceTab("ads", 30), exact: true }).click();
  await expect(dialog).toContainText("ad_spend_daily.csv");
  await expect(dialog).toContainText(fill(labels.evidence.showing, { from: 1, to: 30, n: 30 }));
  await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
  const rows = await downloadAnalysis(page);
  expect(rows.every(row => row.comparison_mode === "calendar_months" && row.previous_days === "31" && row.current_days === "30")).toBe(true);
  expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "750.00" });
  expect(rows.find(row => row.row_type === "daily_average" && row.period === "current" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "25.00", unit: "TWD/day" });
  expect(rows.find(row => row.row_type === "daily_average_change" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "0.00" });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-period-${testInfo.project.name}.png`), fullPage: true });
});

test("PL-02 反向、未完整自然月與未套用模式不取代目前有效範圍", async ({ page }) => {
  await importMonthly(page);
  for (const [label, value] of Object.entries({ [periodField("start", "previous")]: "2026-09-01", [periodField("end", "previous")]: "2026-09-30", [periodField("start", "current")]: "2026-08-01", [periodField("end", "current")]: "2026-08-31" })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: labels.ui.dashboard.errors.periodNotApplied })).toBeVisible();
  await expect(currentContribution(page)).toHaveText(formatAmountL1("750.00"));
  await expect(page.locator(".scope-note")).toContainText(scopeNoteCurrent("2026-09-01", "2026-09-30"));
  for (const [label, value] of Object.entries({ [periodField("start", "previous")]: "2026-08-01", [periodField("end", "previous")]: "2026-08-31", [periodField("start", "current")]: "2026-09-01", [periodField("end", "current")]: "2026-09-29" })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: labels.periods.calendarMonths })).toBeVisible();
  await expect(currentContribution(page)).toHaveText(formatAmountL1("750.00"));
  const unchanged = await downloadAnalysis(page);
  expect(unchanged.every(row => row.comparison_mode === "calendar_months" && row.current_period_end === "2026-09-30")).toBe(true);
  await page.getByLabel(labels.ui.dashboard.filter.comparisonMode, { exact: true }).selectOption("same_days");
  await expect(comparison(page)).toContainText(labels.periods.calendarMonths);
  await page.getByLabel(periodField("end", "previous"), { exact: true }).fill("2026-08-30");
  await page.getByLabel(periodField("end", "current"), { exact: true }).fill("2026-09-30");
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: labels.ui.dashboard.errors.periodNotApplied })).toHaveCount(0);
  await expect(comparison(page)).toContainText(fill(ui.periodDays, { previousDays: 30, currentDays: 30 }));
  await expect(contributionRow(page).getByRole("cell")).toHaveText(periodCells("750.00", "750.00", "25.00", "25.00", "0.00"));
  expect((await downloadAnalysis(page)).every(row => row.comparison_mode === "same_days" && row.previous_days === "30" && row.current_days === "30")).toBe(true);
});

for (const kind of ["zero", "missing"] as const) test(`PL-02 ${kind} 月合計與日均保留零及未知邊界`, async ({ page }) => {
  await importMonthly(page, kind);
  // V3-2b（§8.5 規則 3）：真正的零顯示「0 元」（L1）／「0」（L2），不帶正負號；缺值只寫「資料待補」。
  await expect(currentContribution(page)).toHaveText(kind === "zero" ? formatAmountL1("0.00") : labels.status.missing);
  await expect(revenueRow(page).getByRole("cell").nth(3)).toHaveText(formatAmountL2(kind === "zero" ? "0.00" : "100.00"));
  await expect(contributionRow(page).getByRole("cell").nth(3)).toHaveText(kind === "zero" ? formatAmountL2("0.00") : labels.status.missing);
  await expect(contributionRow(page).getByRole("cell").nth(4)).toHaveText(kind === "zero" ? formatSignedDelta("0.00", "L2") : labels.status.missing);
  const row = (await downloadAnalysis(page)).find(row => row.row_type === "daily_average" && row.period === "current" && row.metric === "contribution_after_marketing")!;
  expect(row.value).toBe(kind === "zero" ? "0.00" : "");
  if (kind === "missing") expect(JSON.parse(row.reason_codes)).toContain("MISSING_COGS");
});
