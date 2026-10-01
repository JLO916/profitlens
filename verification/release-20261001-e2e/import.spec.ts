import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

const roles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
type FileRole = typeof roles[number];
type FilePayload = { name: string; mimeType: string; buffer: Buffer };
const labels: Record<FileRole, string> = {
  "sales_daily.csv": "商品銷售 CSV", "channel_costs_daily.csv": "通路費用 CSV", "ad_spend_daily.csv": "廣告支出 CSV",
};
const alternative = resolve("tests/fixtures/alternative");
const golden = resolve("fixtures/golden");
const maliciousSku = '=IMPORTXML("https://example.invalid","x")';
const maliciousCategory = "<img src=x onerror=alert(1)>";
const status = (page: Page) => page.getByTestId("workspace-status");
const form = (page: Page) => page.getByTestId("import-panel");
const importStatus = (page: Page) => page.getByTestId("import-status");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");

interface AuditEvent { kind: string; errorName?: string; type?: string }
const test = base.extend<{ browserAudit: AuditEvent[] }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const events: AuditEvent[] = [];
    // Uploaded contents, console arguments and request bodies never enter logs.
    page.on("console", message => events.push({ kind: "console", type: message.type() }));
    page.on("pageerror", error => events.push({ kind: "pageerror", errorName: error.name }));
    page.on("dialog", dialog => {
      if (dialog.type() === "beforeunload") {
        events.push({ kind: "unsaved-changes-warning", type: dialog.type() });
        void dialog.accept();
        return;
      }
      events.push({ kind: "javascript-dialog", type: dialog.type() });
      void dialog.dismiss();
    });
    await use(events);
    const record = { recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title, status: testInfo.status, events };
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/release-20261001-regression-regression-m6-regression-import-regression-meta.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-metadata", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    expect(events.filter(event => event.kind === "pageerror" || event.kind === "javascript-dialog" || event.type === "error"), "匯入不得執行文字或產生未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

async function openImport(page: Page) {
  await page.getByRole("button", { name: "匯入標準 CSV", exact: true }).click();
  await expect(form(page)).toBeVisible();
}
async function selectCsvs(page: Page, directory: string, overrides: Partial<Record<FileRole, FilePayload>> = {}) {
  for (const role of roles) await form(page).getByLabel(labels[role], { exact: true }).setInputFiles(overrides[role] ?? resolve(directory, role));
}
async function readManifest(page: Page, directory: string) {
  const path = resolve(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as { dataset_id: string };
  await form(page).getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles(path);
  await expect(form(page).getByLabel("資料集名稱", { exact: true })).toHaveValue(manifest.dataset_id);
  // Reading JSON must never silently confirm the financial basis.
  await expect(form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
}
async function stage(page: Page, directory: string, overrides: Partial<Record<FileRole, FilePayload>> = {}) {
  await openImport(page);
  await selectCsvs(page, directory, overrides);
  await readManifest(page, directory);
}
async function check(page: Page, classification: "valid" | "partial" | "blocking") {
  await form(page).getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(importStatus(page)).toHaveText({
    valid: "檢核通過，可套用資料", partial: "部分資料待補，可套用已知範圍", blocking: "檢核未通過，未取代目前資料",
  }[classification]);
}
async function commit(page: Page, classification: "valid" | "partial" = "valid") {
  await check(page, classification);
  await form(page).getByRole("button", { name: "套用匯入資料", exact: true }).click();
  await expect(status(page)).toContainText(classification === "valid" ? "資料已就緒" : "部分資料待補");
  await expect(form(page)).toHaveCount(0);
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
}
async function importFixture(page: Page, directory = alternative) {
  await stage(page, directory);
  await commit(page);
}
async function returnToGolden(page: Page) {
  await form(page).getByRole("button", { name: "取消匯入", exact: true }).click();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(kpi(page, "net_revenue")).toHaveText("2,470.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("255.00");
}
async function downloadText(page: Page, button: Locator, expectedName: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe(expectedName);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}

/** Independent test-only CSV reader; never calls the application parser or exporter. */
function csvRecords(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") { row.push(value); value = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += character;
  }
  expect(quoted, "下載 CSV 的引號須閉合").toBe(false);
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift() ?? [];
  expect(headers.length).toBeGreaterThan(0);
  return rows.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("真正選取兩套本機檔案會更新 KPI、圖表表格、商品與診斷", async ({ page }, testInfo) => {
  await importFixture(page, golden);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("255.00");
  await stage(page, alternative);
  await expect(form(page).getByTestId("import-preview-sales_daily.csv").locator("tbody tr")).toHaveCount(10);
  await expect(form(page).getByTestId("import-preview-sales_daily.csv")).toContainText("16 列");
  await expect(form(page)).toContainText(maliciousCategory);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/release-20261001-regression-regression-m6-regression-import-regression-${testInfo.project.name}-import.png`), fullPage: true });
  await commit(page);
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "gross_profit")).toHaveText("260.00");
  await expect(kpi(page, "contribution_before_marketing")).toHaveText("200.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  const weekly = page.locator("details").filter({ has: page.locator("summary", { hasText: "數據表 · 每週營收與貢獻" }) });
  await weekly.locator("summary").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(2);
  await expect(weekly.locator("tbody tr").first()).toContainText("464.00");
  await expect(weekly.locator("tbody tr").last()).toContainText("600.00");
  await expect(page.locator(".bridge-total")).toContainText("-130.00");
  await page.screenshot({ path: resolve(`verification/release-20261001-regression-regression-m6-regression-import-regression-${testInfo.project.name}-overview.png`), fullPage: true });
  await page.getByRole("button", { name: "通路診斷", exact: true }).click();
  await expect(page.getByRole("heading", { name: "淨營收增加，行銷後貢獻下降", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "本期通路行銷後貢獻為負", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "商品毛利", exact: true }).click();
  await expect(page.getByTestId("product-table").locator("tbody tr")).toHaveCount(4);
  await expect(page.getByTestId("product-table")).toContainText(maliciousSku);
  await expect(page.getByTestId("product-table")).toContainText("-100.00");
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("不讀 JSON 也能手填 manifest，金額口徑須明確確認", async ({ page }) => {
  await openImport(page);
  await selectCsvs(page, alternative);
  const settings: Record<string, string> = {
    "資料集名稱": "alternative-manual-v1", "資料截至日": "2026-09-05", "涵蓋開始": "2026-09-01", "涵蓋結束": "2026-09-04",
    "匯入前期開始": "2026-09-01", "匯入前期結束": "2026-09-02", "匯入本期開始": "2026-09-03", "匯入本期結束": "2026-09-04",
    "銷售通路（每行一個）": "DTC\nMARKETPLACE",
  };
  for (const [label, value] of Object.entries(settings)) await form(page).getByLabel(label, { exact: true }).fill(value);
  await form(page).getByLabel("資料提供者確認銷售涵蓋範圍完整", { exact: true }).check();
  await expect(form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
  await check(page, "blocking");
  await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await commit(page);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  const manifest = JSON.parse(await downloadText(page, page.getByRole("button", { name: "下載資料集設定 JSON", exact: true }), "profitlens-manifest.json")) as Record<string, unknown>;
  expect(manifest).toMatchObject({ dataset_id: "alternative-manual-v1", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei", sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income" });
});

test("超長但格式合法的期間明確拒絕，不截斷或取代先前資料", async ({ page }) => {
  await importFixture(page, golden);
  await openImport(page);
  await selectCsvs(page, golden);
  const manifest = {
    ...JSON.parse(await readFile(resolve(golden, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "oversized-analysis-span-synthetic", data_as_of: "8000-12-31",
    coverage_start: "0001-01-01", coverage_end: "8000-12-31",
    previous_period: { start: "0001-01-01", end: "4000-12-31" },
    current_period: { start: "4001-01-01", end: "8000-12-31" },
  };
  await form(page).getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles({ name: "long-period-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(form(page).getByLabel("資料集名稱", { exact: true })).toHaveValue("oversized-analysis-span-synthetic");
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await check(page, "blocking");
  await expect(form(page)).toContainText("ANALYSIS_PERIOD_TOO_LARGE");
  await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
  await returnToGolden(page);
});

test("JSON 未確認銷售涵蓋範圍可在表單確認後重新檢核成功", async ({ page }) => {
  await openImport(page);
  await selectCsvs(page, golden);
  const manifest = {
    ...JSON.parse(await readFile(resolve(golden, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "coverage-confirmed-in-form-synthetic", sales_coverage_confirmed: false,
  };
  await form(page).getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles({ name: "unconfirmed-coverage-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(form(page).getByLabel("資料集名稱", { exact: true })).toHaveValue("coverage-confirmed-in-form-synthetic");
  const coverage = form(page).getByLabel("資料提供者確認銷售涵蓋範圍完整", { exact: true });
  await expect(coverage).not.toBeChecked();
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await check(page, "partial");
  await coverage.check();
  await commit(page);
  await expect(kpi(page, "net_revenue")).toHaveText("2,470.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("255.00");
});

for (const invalid of [
  { directory: "duplicate_sales_key", reason: "DUPLICATE_SALES_KEY", line: "10", field: "$key" },
  { directory: "mixed_currency", reason: "MIXED_CURRENCY", line: "6", field: "currency" },
]) {
  test(`${invalid.directory} 整份阻擋且問題清單追溯原檔，舊資料不變`, async ({ page }) => {
    await importFixture(page, golden);
    const directory = resolve("fixtures/errors", invalid.directory);
    const sales = await readFile(resolve(directory, "sales_daily.csv"));
    await stage(page, directory, { "sales_daily.csv": { name: "=uploaded-sales.csv", mimeType: "text/csv", buffer: sales } });
    await check(page, "blocking");
    await expect(form(page)).toContainText(invalid.reason);
    await expect(form(page)).toContainText("=uploaded-sales.csv");
    await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
    const content = await downloadText(page, form(page).getByRole("button", { name: "下載問題清單 CSV", exact: true }), "profitlens-import-issues.csv");
    const rows = csvRecords(content);
    const issue = rows.find(row => row.reason_code === invalid.reason);
    expect(issue).toBeDefined();
    expect(issue!.file).toBe("'=uploaded-sales.csv");
    expect(issue!.logical_file).toBe("sales_daily.csv");
    expect(issue!.line).toBe(invalid.line);
    expect(issue!.field).toBe(invalid.field);
    await returnToGolden(page);
  });
}

for (const incomplete of [
  { directory: "missing_cogs", reason: "MISSING_COGS", unaffected: "MARKETPLACE", expected: "-15.00" },
  { directory: "missing_ad_day", reason: "MISSING_AD_DAY", unaffected: "DTC", expected: "270.00" },
]) {
  test(`${incomplete.directory} 本機匯入保留收入、未知貢獻與未受影響通路`, async ({ page }) => {
    await stage(page, resolve("fixtures/errors", incomplete.directory));
    await check(page, "partial");
    await expect(form(page)).toContainText(incomplete.reason);
    await form(page).getByRole("button", { name: "套用匯入資料", exact: true }).click();
    await expect(status(page)).toContainText("部分資料待補");
    await expect(kpi(page, "net_revenue")).toHaveText("2,470.00");
    await expect(kpi(page, "contribution_after_marketing")).toHaveText("資料待補");
    const rows = csvRecords(await downloadText(page, page.getByRole("button", { name: "下載目前分析 CSV", exact: true }), "profitlens-analysis.csv"));
    const current = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing");
    expect(current).toBeDefined();
    expect(current!.value).toBe("");
    expect(JSON.parse(current!.reason_codes)).toContain(incomplete.reason);
    await page.getByLabel("通路", { exact: true }).selectOption(incomplete.unaffected);
    await expect(kpi(page, "contribution_after_marketing")).toHaveText(incomplete.expected);
  });
}

for (const invalid of ["malformed", "invalid-utf8", "too-many-bytes", "too-many-rows"] as const) {
  test(`${invalid} 友善拒絕、不截斷且不破壞成功資料`, async ({ page }) => {
    await importFixture(page, golden);
    const header = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n";
    const cases = {
      malformed: { reason: "MALFORMED_CSV", buffer: Buffer.from(`${header}2026-08-01,DTC,\"unterminated`) },
      "invalid-utf8": { reason: "INVALID_UTF8", buffer: Buffer.concat([Buffer.from(header), Buffer.from([0xc3, 0x28])]) },
      "too-many-bytes": { reason: "FILE_TOO_LARGE", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "a") },
      "too-many-rows": { reason: "ROW_LIMIT_EXCEEDED", buffer: Buffer.from(header + "2026-08-01,DTC,A,HOME,1,1,0,0,0,TWD\n".repeat(50_001)) },
    };
    const selected = cases[invalid];
    await stage(page, golden, { "sales_daily.csv": { name: "invalid-sales.csv", mimeType: "text/csv", buffer: selected.buffer } });
    await check(page, "blocking");
    await expect(form(page)).toContainText(selected.reason);
    await expect(form(page).getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
    await returnToGolden(page);
  });
}

test("改名欄位與未知欄須分別確認，不能猜測或把忽略內容放入分析", async ({ page }) => {
  const source = await readFile(resolve(alternative, "sales_daily.csv"), "utf8");
  const renamed = source.trimEnd().split(/\r?\n/).map((line, index) => index === 0
    ? line.replace("gross_sales", "revenue") + ",private_note"
    : line + ",SYNTHETIC_UNKNOWN_MARKER").join("\n") + "\n";
  await stage(page, alternative, { "sales_daily.csv": { name: "renamed-sales.csv", mimeType: "text/csv", buffer: Buffer.from(renamed) } });
  const mapping = form(page).getByLabel("sales_daily.csv gross_sales 對應欄位", { exact: true });
  await expect(mapping).toHaveValue("");
  await expect(form(page).getByTestId("import-preview-sales_daily.csv")).toContainText("private_note");
  await check(page, "blocking");
  await mapping.selectOption("revenue");
  await expect(form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await check(page, "blocking");
  await form(page).getByLabel("確認 sales_daily.csv 欄位對照", { exact: true }).check();
  await check(page, "blocking");
  await form(page).getByLabel("確認忽略 sales_daily.csv 未使用欄位", { exact: true }).check();
  await commit(page);
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  const text = await downloadText(page, page.getByRole("button", { name: "下載目前分析 CSV", exact: true }), "profitlens-analysis.csv");
  expect(text).not.toContain("private_note");
  expect(text).not.toContain("SYNTHETIC_UNKNOWN_MARKER");
  expect(text).toContain("renamed-sales.csv");
});

test("檔案留在本頁記憶體，匯入期間零網路、零持久化、文字不執行", async ({ page, context, browserAudit }) => {
  await openImport(page);
  const beforeStorage = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  const requests: { method: string; resourceType: string; hasBody: boolean }[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    requests.push({ method: request.method(), resourceType: request.resourceType(), hasBody: request.postDataBuffer() !== null });
    await route.abort("blockedbyclient");
  });
  await selectCsvs(page, alternative);
  await readManifest(page, alternative);
  await commit(page);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  await page.getByRole("button", { name: "商品毛利", exact: true }).click();
  await expect(page.getByTestId("product-table")).toContainText(maliciousCategory);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  const afterStorage = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(afterStorage).toEqual(beforeStorage);
  expect(requests, "本機匯入與分析不可傳送任何 HTTP 請求").toEqual([]);
  await page.unroute("**/*");
  const other = await context.newPage();
  await other.goto("/");
  await expect(status(other)).toContainText("尚未載入資料");
  await expect(other.getByTestId("product-table")).toHaveCount(0);
  await other.close();
  await page.reload();
  expect(browserAudit.filter(event => event.kind === "unsaved-changes-warning")).toEqual([{ kind: "unsaved-changes-warning", type: "beforeunload" }]);
  await expect(status(page)).toContainText("尚未載入資料");
  await expect(page.getByTestId("kpi-net_revenue")).toHaveCount(0);
});

test("下載共用期間通路與商品篩選，公式文字安全而負數金額仍是數字", async ({ page }) => {
  await importFixture(page);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("40.00");
  const analysis = csvRecords(await downloadText(page, page.getByRole("button", { name: "下載目前分析 CSV", exact: true }), "profitlens-analysis.csv"));
  const current = analysis.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing");
  expect(current).toBeDefined();
  expect(current!.value).toBe("40.00");
  expect(current!.current_period_start).toBe("2026-09-03");
  expect(current!.current_period_end).toBe("2026-09-04");
  expect(JSON.parse(current!.filter_scope).channels).toEqual(["DTC"]);
  expect(analysis.filter(row => row.row_type === "channel").every(row => row.channel === "DTC")).toBe(true);
  expect(analysis.every(row => row.metric_version === "contribution-v1" && row.as_of === "2026-09-05")).toBe(true);
  await page.getByLabel("通路", { exact: true }).selectOption({ label: "全部通路" });
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  await page.getByRole("button", { name: "商品毛利", exact: true }).click();
  const downloadProducts = page.getByRole("button", { name: "下載商品明細 CSV", exact: true });
  const allProducts = csvRecords(await downloadText(page, downloadProducts, "profitlens-products.csv"));
  expect(new Set(allProducts.map(row => row.sku))).toEqual(new Set([`'${maliciousSku}`, "'+TEST()", "'-TEST()", "'@TEST()"]));
  expect(allProducts.some(row => row.category === "'\t=FORMULA()")).toBe(true);
  expect(allProducts.some(row => row.category === "'@NOTE")).toBe(true);
  expect(allProducts.some(row => row.metric === "gross_profit" && row.value === "-100.00")).toBe(true);
  expect(allProducts.every(row => !["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(true);
  await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
  await page.getByLabel("品類", { exact: true }).selectOption("\t=FORMULA()");
  await page.getByLabel("搜尋 SKU", { exact: true }).fill("-TEST()");
  await expect(page.getByTestId("product-table").locator("tbody tr")).toHaveCount(1);
  const selectedProducts = csvRecords(await downloadText(page, downloadProducts, "profitlens-products.csv"));
  expect(selectedProducts.length).toBeGreaterThan(0);
  expect(selectedProducts.every(row => row.channel === "MARKETPLACE" && row.sku === "'-TEST()" && row.category === "'\t=FORMULA()")).toBe(true);
  expect(selectedProducts.every(row => row.product_query === "'-test()" && row.product_category === "'\t=FORMULA()")).toBe(true);
  expect(selectedProducts.find(row => row.metric === "net_revenue")?.value).toBe("-40.00");
  expect(selectedProducts.find(row => row.metric === "gross_profit")?.value).toBe("-100.00");
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("-30.00");
  await expect(kpi(page, "net_revenue")).toHaveText("200.00");
});

test("空白品類商品仍可搜尋匯出，合法 all 通路與全部通路各自正確", async ({ page }) => {
  const overrides: Partial<Record<FileRole, FilePayload>> = {};
  for (const role of roles) {
    let text = (await readFile(resolve(alternative, role), "utf8")).replaceAll(",DTC,", ",all,");
    if (role === "sales_daily.csv") text = text.replaceAll(",+TEST(),@NOTE,", ",+TEST(),,");
    overrides[role] = { name: role, mimeType: "text/csv", buffer: Buffer.from(text) };
  }
  const manifest = {
    ...JSON.parse(await readFile(resolve(alternative, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "alternative-blank-category-all-channel-synthetic", channels: ["all", "MARKETPLACE"],
  };
  await openImport(page);
  await selectCsvs(page, alternative, overrides);
  await form(page).getByLabel("讀取 manifest JSON", { exact: true }).setInputFiles({ name: "blank-category-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(form(page).getByLabel("資料集名稱", { exact: true })).toHaveValue("alternative-blank-category-all-channel-synthetic");
  await form(page).getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await commit(page);
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  await page.getByLabel("通路", { exact: true }).selectOption({ label: "all" });
  await expect(kpi(page, "net_revenue")).toHaveText("400.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("40.00");
  await page.getByLabel("通路", { exact: true }).selectOption({ label: "全部通路" });
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
  await page.getByRole("button", { name: "商品毛利", exact: true }).click();
  const table = page.getByTestId("product-table");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  const blankCategoryRow = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "+TEST()", exact: true }) });
  await expect(blankCategoryRow).toContainText("未填品類");
  const optionLabels = await page.getByLabel("品類", { exact: true }).locator("option").allTextContents();
  expect(optionLabels.every(label => label.trim().length > 0), "品類下拉不得出現無名稱的空白選項").toBe(true);
  await page.getByLabel("搜尋 SKU", { exact: true }).fill("+TEST()");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("未填品類");
  await expect(table).toContainText("120.00");
  await expect(table).toContainText("80.00");
  const exported = csvRecords(await downloadText(page, page.getByRole("button", { name: "下載商品明細 CSV", exact: true }), "profitlens-products.csv"));
  expect(exported.length).toBeGreaterThan(0);
  expect(exported.every(row => row.channel === "all" && row.sku === "'+TEST()" && row.category === "")).toBe(true);
  expect(exported.every(row => row.product_query === "'+test()" && row.product_category === "")).toBe(true);
  expect(exported.find(row => row.metric === "net_revenue")?.value).toBe("120.00");
  expect(exported.find(row => row.metric === "gross_profit")?.value).toBe("80.00");
  expect(exported.every(row => !["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(true);
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(kpi(page, "net_revenue")).toHaveText("600.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("10.00");
});
