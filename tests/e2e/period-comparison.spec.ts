import { clickReplacing } from "./replacement-helpers";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

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
      "商品銷售 CSV": { name: "sales_daily.csv", text: "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + dates.map(date => `${date},DTC,A,合成測試,1,${zero ? 0 : 100},0,0,${kind === "missing" && date === "2026-09-01" ? "" : zero ? 0 : 40},TWD`).join("\n") },
      "通路費用 CSV": { name: "channel_costs_daily.csv", text: "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency\n" + dates.map(date => `${date},DTC,${zero ? 0 : 5},0,${zero ? 0 : 10},0,TWD`).join("\n") },
      "廣告支出 CSV": { name: "ad_spend_daily.csv", text: "date,channel,ad_spend,currency\n" + dates.map(date => `${date},DTC,${zero ? 0 : 20},TWD`).join("\n") },
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
const contributionRow = (page: Page) => comparison(page).getByRole("row").filter({ has: page.getByText("行銷後貢獻", { exact: true }) });
const revenueRow = (page: Page) => comparison(page).getByRole("row").filter({ has: page.getByText("商品淨營收", { exact: true }) });
const currentContribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
async function importMonthly(page: Page, kind: "complete" | "zero" | "missing" = "complete") {
  await page.goto("/");
  await page.getByRole("button", { name: "匯入標準 CSV", exact: true }).click();
  const form = page.getByTestId("import-panel");
  const input = monthlyFiles(kind);
  for (const [label, file] of Object.entries(input.files)) await form.getByLabel(label, { exact: true }).setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text) });
  await form.getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles({ name: "manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input.manifest)) });
  await expect(form.getByLabel("資料集名稱", { exact: true })).toHaveValue(input.manifest.dataset_id);
  await expect(form.getByLabel("匯入比較方式", { exact: true })).toHaveValue("calendar_months");
  await form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(page.getByTestId("import-status")).toHaveText(kind === "missing" ? "部分資料待補，可套用已知範圍" : "檢核通過，可套用資料");
  await clickReplacing(page, form.getByRole("button", { name: "套用匯入資料", exact: true }));
  await expect(form).toHaveCount(0);
  await expect(comparison(page)).toBeVisible();
  await expect(page.getByLabel("比較方式", { exact: true })).toHaveValue("calendar_months");
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
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
async function downloadAnalysis(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "下載目前分析 CSV", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("profitlens-analysis.csv");
  return records(await readFile((await download.path())!, "utf8"));
}

test("PL-02 匯入完整八九月，合計與日均分開，公式來源與下載一致", async ({ page }, testInfo) => {
  await importMonthly(page);
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText("3,000.00");
  await expect(currentContribution(page)).toHaveText("750.00");
  await expect(page.locator(".bridge-total")).toContainText("-25.00");
  await expect(comparison(page)).toContainText("前期 31 天；本期 30 天");
  await expect(revenueRow(page).getByRole("cell")).toHaveText(["3,100.00", "3,000.00", "100.00", "100.00", "0.00"]);
  await expect(contributionRow(page).getByRole("cell")).toHaveText(["775.00", "750.00", "25.00", "25.00", "0.00"]);
  await contributionRow(page).getByRole("cell").nth(3).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: /公式與來源$/ });
  await expect(dialog).toContainText("期間合計 ÷ 30 個日曆天");
  await expect(dialog).toContainText("日均值（TWD／日）");
  await expect(dialog).toContainText("2026-09-01 至 2026-09-30");
  await expect(dialog).toContainText("ad_spend_daily.csv");
  await expect(dialog).toContainText("納入來源共 90 筆");
  await dialog.getByRole("button", { name: "下一頁", exact: true }).click();
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText("第 2／2 頁");
  await dialog.getByRole("button", { name: "關閉公式與來源", exact: true }).click();
  const rows = await downloadAnalysis(page);
  expect(rows.every(row => row.comparison_mode === "calendar_months" && row.previous_days === "31" && row.current_days === "30")).toBe(true);
  expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "750.00" });
  expect(rows.find(row => row.row_type === "daily_average" && row.period === "current" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "25.00", unit: "TWD/day" });
  expect(rows.find(row => row.row_type === "daily_average_change" && row.metric === "contribution_after_marketing")).toMatchObject({ value: "0.00" });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-period-${testInfo.project.name}.png`), fullPage: true });
});

test("PL-02 反向、未完整自然月與未套用模式不取代目前有效範圍", async ({ page }) => {
  await importMonthly(page);
  for (const [label, value] of Object.entries({ "前期開始": "2026-09-01", "前期結束": "2026-09-30", "本期開始": "2026-08-01", "本期結束": "2026-08-31" })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "期間未套用" })).toBeVisible();
  await expect(currentContribution(page)).toHaveText("750.00");
  await expect(page.locator(".scope-note")).toContainText("本期 2026-09-01 — 2026-09-30");
  for (const [label, value] of Object.entries({ "前期開始": "2026-08-01", "前期結束": "2026-08-31", "本期開始": "2026-09-01", "本期結束": "2026-09-29" })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "完整自然月模式" })).toBeVisible();
  await expect(currentContribution(page)).toHaveText("750.00");
  const unchanged = await downloadAnalysis(page);
  expect(unchanged.every(row => row.comparison_mode === "calendar_months" && row.current_period_end === "2026-09-30")).toBe(true);
  await page.getByLabel("比較方式", { exact: true }).selectOption("same_days");
  await expect(comparison(page)).toContainText("完整自然月");
  await page.getByLabel("前期結束", { exact: true }).fill("2026-08-30");
  await page.getByLabel("本期結束", { exact: true }).fill("2026-09-30");
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "期間未套用" })).toHaveCount(0);
  await expect(comparison(page)).toContainText("前期 30 天；本期 30 天");
  await expect(contributionRow(page).getByRole("cell")).toHaveText(["750.00", "750.00", "25.00", "25.00", "0.00"]);
  expect((await downloadAnalysis(page)).every(row => row.comparison_mode === "same_days" && row.previous_days === "30" && row.current_days === "30")).toBe(true);
});

for (const kind of ["zero", "missing"] as const) test(`PL-02 ${kind} 月合計與日均保留零及未知邊界`, async ({ page }) => {
  await importMonthly(page, kind);
  await expect(currentContribution(page)).toHaveText(kind === "zero" ? "0.00" : "資料待補");
  await expect(revenueRow(page).getByRole("cell").nth(3)).toHaveText(kind === "zero" ? "0.00" : "100.00");
  await expect(contributionRow(page).getByRole("cell").nth(3)).toHaveText(kind === "zero" ? "0.00" : "資料待補");
  await expect(contributionRow(page).getByRole("cell").nth(4)).toHaveText(kind === "zero" ? "0.00" : "資料待補");
  const row = (await downloadAnalysis(page)).find(row => row.row_type === "daily_average" && row.period === "current" && row.metric === "contribution_after_marketing")!;
  expect(row.value).toBe(kind === "zero" ? "0.00" : "");
  if (kind === "missing") expect(JSON.parse(row.reason_codes)).toContain("MISSING_COGS");
});
