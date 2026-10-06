import { closeDownloads, closePeriodSheet, dismissSavePrompt, navigateTo, openDownloads, openPeriodSheet, openProductExport, ruleHeadline } from "./replacement-helpers";
import { chooseBasis, commitButton, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardFileLabels, wizardRoles, type Classification, type FilePayload, type WizardRole } from "./import-wizard-helpers";
import { fill, labels } from "../../src/i18n";
import { ASSIST_KPI_VERSION } from "../../src/application/assist-kpi";
import { formatAmountL1, formatAmountL2, formatSignedDelta } from "../../src/application/presentation";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

// R3：單頁匯入面板改為四步匯入精靈（選檔 → 對照欄位 → 口徑與期間 → 檢核與套用）；所有畫面字串由 labels 取字。
const copy = labels.importWizard;
const panel = labels.ui.importPanel;
const channelFilter = (page: Page) => page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true });
/** V3-3：通路下拉在期間列；手機期間列收成 period-toggle，先開底部面板、選完按「完成」（桌機兩步不動）。 */
async function selectChannel(page: Page, option: Parameters<Locator["selectOption"]>[0]) {
  await openPeriodSheet(page);
  await channelFilter(page).selectOption(option);
  await closePeriodSheet(page);
}
const alternative = resolve("tests/fixtures/alternative");
const golden = resolve("fixtures/golden");
const maliciousSku = '=IMPORTXML("https://example.invalid","x")';
const maliciousCategory = "<img src=x onerror=alert(1)>";
const status = (page: Page) => page.getByTestId("workspace-status");
const importStatus = (page: Page) => page.getByTestId("import-status");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
// V3-2b（PRD §8.5）：KPI 卡是 L1（< 1 萬「255 元」）、表格是 L2（整數元，單位在表頭）、橋接合計是 L3（到分、U+2212）；
// 斷言一律把 golden 精確值交給 presentation 的格式化函式，不手寫畫面文字。
const nextButton = (page: Page) => wizard(page).getByRole("button", { name: copy.next, exact: true });
const confirmButton = (page: Page) => wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true });
const confirmMappingButton = (page: Page) => wizard(page).getByRole("button", { name: copy.confirmMapping, exact: true });
/** V3-2a：「資料到 {date}」由套用資料集的 data_as_of 填入。 */
const ready = (dataAsOf: string) => fill(labels.status.ready, { date: dataAsOf });
const alternativeAsOf = "2026-09-05";
const goldenAsOf = "2026-08-03";
/** importErrors 的白話訊息含 {line} 等占位符；比對時以任意文字代入。 */
const plainMessage = (code: string) => new RegExp(labels.importErrors[code].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, ".+?"));

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
    await appendFile(resolve("verification/review-v2-a-regression-regression-m6-regression-import-regression-meta.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-metadata", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    expect(events.filter(event => event.kind === "pageerror" || event.kind === "javascript-dialog" || event.type === "error"), "匯入不得執行文字或產生未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

/** 第 1 步：三份 CSV（可覆寫成改名或合成檔）＋選填的資料集設定檔。 */
async function selectCsvs(page: Page, directory: string, overrides: Partial<Record<WizardRole, FilePayload>> = {}) {
  await setWizardFiles(page, directory, overrides);
}
/** 第 1 步 → 第 3 步：設定檔帶入期間與通路，但讀 JSON 絕不會默默確認金額口徑；口徑要使用者自己選。 */
async function toSettings(page: Page, expectedDatasetId?: string) {
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  if (expectedDatasetId !== undefined) await expect(wizard(page).getByLabel(copy.datasetName, { exact: true })).toHaveValue(expectedDatasetId);
  for (const basis of ["exclusive", "inclusive", "unsure"] as const) await expect(wizard(page).getByLabel(copy.basis[basis], { exact: true })).not.toBeChecked();
  await expect(confirmButton(page)).toBeDisabled();
  await chooseBasis(page, "exclusive");
  await expect(confirmButton(page)).toBeEnabled();
}
async function readManifest(page: Page, file: string | FilePayload) {
  const manifest = typeof file === "string" ? JSON.parse(await readFile(file, "utf8")) as { dataset_id: string } : JSON.parse(file.buffer.toString("utf8")) as { dataset_id: string };
  await setWizardManifest(page, file);
  return manifest.dataset_id;
}
async function stage(page: Page, directory: string, overrides: Partial<Record<WizardRole, FilePayload>> = {}, manifest: string | FilePayload = resolve(directory, "manifest.json")) {
  await openWizard(page);
  await selectCsvs(page, directory, overrides);
  await toSettings(page, await readManifest(page, manifest));
}
async function check(page: Page, classification: Classification) {
  await confirmAndCheck(page, classification);
  await expect(importStatus(page)).toHaveText(copy.result[classification]);
}
async function commit(page: Page, dataAsOf: string, classification: "valid" | "partial" = "valid") {
  await check(page, classification);
  await commitWizard(page);
  await expect(status(page)).toContainText(classification === "valid" ? ready(dataAsOf) : labels.status.partial);
  await expect(wizard(page)).toHaveCount(0);
  // R6：首次載入資料後出現非 modal 的「自動保存？」提示；V3-3 手機它疊在底部分頁列上方，會擋住「更多」面板與頂欄「更多」的匯出選單。本檔不測自動保存，先按「暫時不要」。
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
}
async function importFixture(page: Page, directory = alternative) {
  await stage(page, directory);
  await commit(page, (JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as { data_as_of: string }).data_as_of);
}
async function returnToGolden(page: Page) {
  await wizard(page).getByRole("button", { name: copy.cancel, exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);
  await navigateTo(page, "overview");
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("255.00"));
}
/** V3-5：「下載商品明細 CSV」搬進商品毛利頁頁首「匯出本頁」下拉（product-export-menu）；每次下載前先展開，再依原按鈕名稱取得。 */
async function productsCsvButton(page: Page) {
  const button = (await openProductExport(page)).getByRole("button", { name: labels.downloads.productsCsv, exact: true });
  await expect(button).toHaveAttribute("data-testid", "product-export-products");
  return button;
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
    return Object.fromEntries(headers.map((header, index) => [header.replace(/^.*\(([^()]+)\)\s*$/, "$1"), values[index]]));
  });
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("真正選取兩套本機檔案會更新 KPI、圖表表格、商品與診斷", async ({ page }, testInfo) => {
  await importFixture(page, golden);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("255.00"));
  await openWizard(page);
  await selectCsvs(page, alternative);
  // R3：舊版的 10 列預覽表改為第 1 步的檔案摘要（大小 · 列數 · 欄數 · 編碼）；惡意品類文字在套用後於商品頁檢查。
  await expect(page.getByTestId("import-file-sales_daily.csv")).toContainText(fill(panel.rowCount, { n: 16 }));
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await readManifest(page, resolve(alternative, "manifest.json"));
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-import-regression-${testInfo.project.name}-import.png`), fullPage: true });
  await toSettings(page, "alternative-import-synthetic-v1");
  // 欄名全符合標準：第 2 步自動完成。
  await expect(page.getByTestId("import-stepper").locator("li").nth(1)).toHaveClass(/skipped/);
  await commit(page, alternativeAsOf);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "gross_profit")).toHaveText(formatAmountL1("260.00"));
  await expect(kpi(page, "contribution_before_marketing")).toHaveText(formatAmountL1("200.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  const weekly = page.locator("details").filter({ has: page.locator("summary", { hasText: fill(labels.ui.overview.dataTable, { title: labels.sections.trend }) }) });
  await weekly.locator("summary").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(2);
  // 週趨勢表：第 3 欄是淨營收（L2）。
  await expect(weekly.locator("tbody tr").first().locator("td").nth(2)).toHaveText(formatAmountL2("464.00"));
  await expect(weekly.locator("tbody tr").last().locator("td").nth(2)).toHaveText(formatAmountL2("600.00"));
  await expect(page.locator(".bridge-total")).toContainText(formatSignedDelta("-130.00", "L3"));
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-import-regression-${testInfo.project.name}-overview.png`), fullPage: true });
  await navigateTo(page, "diagnosis");
  await expect(page.getByRole("heading", { name: ruleHeadline("REV_UP_CM_DOWN") }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: ruleHeadline("NEGATIVE_CHANNEL_CM") })).toBeVisible();
  await navigateTo(page, "products");
  await expect(page.getByTestId("product-table").locator("tbody tr")).toHaveCount(4);
  await expect(page.getByTestId("product-table")).toContainText(maliciousSku);
  await expect(page.getByTestId("product-table")).toContainText(maliciousCategory);
  await expect(page.getByTestId("product-table")).toContainText(formatAmountL2("-100.00"));
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("不讀 JSON 也能手填 manifest，金額口徑須明確確認（R3：第 3 步由檔案預填，可改）", async ({ page }) => {
  await openWizard(page);
  await selectCsvs(page, alternative);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // 沒有設定檔：期間與通路由檔案提議；通路是勾選清單（預設全勾），不再是文字框。
  await expect(page.getByTestId("import-settings-proposal")).toContainText(copy.proposedBy);
  await expect(wizard(page).getByLabel("DTC", { exact: true })).toBeChecked();
  await expect(wizard(page).getByLabel("MARKETPLACE", { exact: true })).toBeChecked();
  const settings: Record<string, string> = {
    [copy.datasetName]: "alternative-manual-v1", [copy.dataAsOf]: "2026-09-05", [copy.coverageStart]: "2026-09-01", [copy.coverageEnd]: "2026-09-04",
    [labels.csvColumns.previous_start]: "2026-09-01", [labels.csvColumns.previous_end]: "2026-09-02", [labels.csvColumns.current_start]: "2026-09-03", [labels.csvColumns.current_end]: "2026-09-04",
  };
  for (const [label, value] of Object.entries(settings)) await wizard(page).getByLabel(label, { exact: true }).fill(value);
  for (const [label, value] of Object.entries(settings)) await expect(wizard(page).getByLabel(label, { exact: true })).toHaveValue(value);
  // 金額口徑沒有預設：沒選就不能確認、不能檢核，也沒有套用按鈕。
  for (const basis of ["exclusive", "inclusive", "unsure"] as const) await expect(wizard(page).getByLabel(copy.basis[basis], { exact: true })).not.toBeChecked();
  await expect(confirmButton(page)).toBeDisabled();
  await expect(importStatus(page)).toHaveCount(0);
  await expect(commitButton(page)).toHaveCount(0);
  await chooseBasis(page, "exclusive");
  await commit(page, settings[copy.dataAsOf]);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  const manifest = JSON.parse(await downloadText(page, (await openDownloads(page)).getByRole("button", { name: labels.downloads.manifestJson, exact: true }), "profitlens-manifest.json")) as Record<string, unknown>;
  await closeDownloads(page);
  expect(manifest).toMatchObject({ dataset_id: "alternative-manual-v1", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei", sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income" });
});

test("超長但格式合法的期間明確拒絕，不截斷或取代先前資料", async ({ page }) => {
  await importFixture(page, golden);
  const manifest = {
    ...JSON.parse(await readFile(resolve(golden, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "oversized-analysis-span-synthetic", data_as_of: "8000-12-31",
    coverage_start: "0001-01-01", coverage_end: "8000-12-31",
    previous_period: { start: "0001-01-01", end: "4000-12-31" },
    current_period: { start: "4001-01-01", end: "8000-12-31" },
  };
  await stage(page, golden, {}, { name: "long-period-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(wizard(page).getByLabel(copy.coverageStart, { exact: true })).toHaveValue("0001-01-01");
  await expect(wizard(page).getByLabel(copy.coverageEnd, { exact: true })).toHaveValue("8000-12-31");
  await check(page, "blocking");
  await expect(wizard(page)).toContainText("ANALYSIS_PERIOD_TOO_LARGE");
  await expect(commitButton(page)).toHaveCount(0);
  await returnToGolden(page);
});

test("JSON 未確認銷售涵蓋範圍可在表單確認後重新檢核成功", async ({ page }) => {
  const manifest = {
    ...JSON.parse(await readFile(resolve(golden, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "coverage-confirmed-in-form-synthetic", sales_coverage_confirmed: false,
  };
  await stage(page, golden, {}, { name: "unconfirmed-coverage-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(page.getByTestId("import-settings-proposal")).toContainText(copy.settingsFromManifest);
  // R3 新契約：涵蓋範圍與金額口徑不再是兩個勾選框，而是第 3 步列出的兩句聲明，由「我確認口徑與期間，開始檢核」一次確認
  // （會把 sales_coverage_confirmed 設為 true）。因此設定檔寫 false 時，使用者按下確認後的檢核結果是「通過」，不再是先前的「部分」。
  await expect(wizard(page).getByRole("checkbox", { name: copy.coverageConfirm })).toHaveCount(0);
  await expect(wizard(page).getByRole("checkbox", { name: copy.amountConfirm })).toHaveCount(0);
  await expect(wizard(page).locator(".confirm-list")).toContainText(copy.coverageConfirm);
  await expect(wizard(page).locator(".confirm-list")).toContainText(copy.amountConfirm);
  await commit(page, goldenAsOf);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("255.00"));
  const exported = JSON.parse(await downloadText(page, (await openDownloads(page)).getByRole("button", { name: labels.downloads.manifestJson, exact: true }), "profitlens-manifest.json")) as Record<string, unknown>;
  await closeDownloads(page);
  expect(exported).toMatchObject({ dataset_id: "coverage-confirmed-in-form-synthetic", sales_coverage_confirmed: true });
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
    await expect(wizard(page)).toContainText(invalid.reason);
    await expect(wizard(page)).toContainText("=uploaded-sales.csv");
    await expect(commitButton(page)).toHaveCount(0);
    const content = await downloadText(page, wizard(page).getByRole("button", { name: labels.downloads.issuesCsv, exact: true }), "profitlens-import-issues.csv");
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
    await expect(wizard(page)).toContainText(incomplete.reason);
    await commitWizard(page);
    await expect(status(page)).toContainText(labels.status.partial);
    await dismissSavePrompt(page);
    await navigateTo(page, "overview");
    await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
    await expect(kpi(page, "contribution_after_marketing")).toHaveText(labels.status.missing);
    const rows = csvRecords(await downloadText(page, (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }), "profitlens-analysis.csv"));
    await closeDownloads(page);
    const current = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing");
    expect(current).toBeDefined();
    expect(current!.value).toBe("");
    expect(JSON.parse(current!.reason_codes)).toContain(incomplete.reason);
    await selectChannel(page, incomplete.unaffected);
    await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1(incomplete.expected));
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
    await openWizard(page);
    await selectCsvs(page, golden);
    await setWizardManifest(page, resolve(golden, "manifest.json"));
    // R3：讀檔錯誤在第 1 步就以白話訊息＋原因代碼擋下（不截斷、不部分讀入），「下一步」不能按，自然也到不了檢核與套用。
    await wizard(page).getByLabel(wizardFileLabels["sales_daily.csv"], { exact: true }).setInputFiles({ name: "invalid-sales.csv", mimeType: "text/csv", buffer: selected.buffer });
    const alert = page.getByTestId("import-file-sales_daily.csv").getByRole("alert");
    await expect(alert).toContainText(selected.reason);
    await expect(alert).toContainText(plainMessage(selected.reason));
    await expect(nextButton(page)).toBeDisabled();
    await expect(importStatus(page)).toHaveCount(0);
    await expect(commitButton(page)).toHaveCount(0);
    await returnToGolden(page);
  });
}

test("改名欄位與未知欄須分別確認，不能猜測或把忽略內容放入分析", async ({ page }) => {
  const source = await readFile(resolve(alternative, "sales_daily.csv"), "utf8");
  const renamed = source.trimEnd().split(/\r?\n/).map((line, index) => index === 0
    ? line.replace("gross_sales", "revenue") + ",private_note"
    : line + ",SYNTHETIC_UNKNOWN_MARKER").join("\n") + "\n";
  await openWizard(page);
  await selectCsvs(page, alternative, { "sales_daily.csv": { name: "renamed-sales.csv", mimeType: "text/csv", buffer: Buffer.from(renamed) } });
  const datasetId = await readManifest(page, resolve(alternative, "manifest.json"));
  await nextFromFiles(page);
  // 欄名不同：第 2 步不能自動完成；不猜測 revenue＝gross_sales。
  const card = page.getByTestId("import-mapping-sales_daily.csv");
  await expect(card).toBeVisible();
  const mappingAria = fill(panel.mappingAria, { file: "sales_daily.csv", field: "gross_sales" });
  const mapping = card.getByLabel(mappingAria, { exact: true });
  const mappingRow = card.locator("tbody tr").filter({ has: page.getByLabel(mappingAria, { exact: true }) });
  await expect(mapping).toHaveValue("");
  await expect(mappingRow).toContainText(copy.mappingStatus.none);
  await expect(card).toContainText("private_note");
  await expect(card).toContainText(fill(copy.mappingIncomplete, { fields: "gross_sales" }));
  await expect(card).toContainText(fill(copy.ignoredColumns, { columns: "revenue、private_note" }));
  await expect(confirmMappingButton(page)).toBeDisabled();
  await mapping.selectOption("revenue");
  await expect(card).toContainText(fill(copy.ignoredColumns, { columns: "private_note" }));
  await expect(mappingRow).toContainText(copy.mappingStatus.manual);
  await expect(mappingRow.locator(".samples")).toContainText("100.00");
  // 對照已補齊，但未知欄位尚未確認忽略：仍不能往下。
  await expect(confirmMappingButton(page)).toBeDisabled();
  await card.getByLabel(fill(panel.ignoreAria, { file: "sales_daily.csv" }), { exact: true }).check();
  await expect(confirmMappingButton(page)).toBeEnabled();
  await confirmMappingButton(page).click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await expect(wizard(page).getByLabel(copy.datasetName, { exact: true })).toHaveValue(datasetId);
  await expect(confirmButton(page)).toBeDisabled();
  await chooseBasis(page, "exclusive");
  await check(page, "valid");
  await expect(page.getByTestId("reconciliation-gross_sales")).toContainText("renamed-sales.csv／revenue");
  await commitWizard(page);
  await expect(status(page)).toContainText(ready(alternativeAsOf));
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  const text = await downloadText(page, (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }), "profitlens-analysis.csv");
  await closeDownloads(page);
  expect(text).not.toContain("private_note");
  expect(text).not.toContain("SYNTHETIC_UNKNOWN_MARKER");
  expect(text).toContain("renamed-sales.csv");
});

test("檔案留在本頁記憶體，匯入期間零網路、零持久化、文字不執行", async ({ page, context, browserAudit }) => {
  await openWizard(page);
  const beforeStorage = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  const requests: { method: string; resourceType: string; hasBody: boolean }[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    requests.push({ method: request.method(), resourceType: request.resourceType(), hasBody: request.postDataBuffer() !== null });
    await route.abort("blockedbyclient");
  });
  await selectCsvs(page, alternative);
  await toSettings(page, await readManifest(page, resolve(alternative, "manifest.json")));
  await commit(page, alternativeAsOf);
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  await navigateTo(page, "products");
  await expect(page.getByTestId("product-table")).toContainText(maliciousCategory);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  const afterStorage = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(afterStorage).toEqual(beforeStorage);
  expect(requests, "本機匯入與分析不可傳送任何 HTTP 請求").toEqual([]);
  await page.unroute("**/*");
  const other = await context.newPage();
  await other.goto("/");
  await expect(status(other)).toContainText(labels.status.empty);
  await expect(other.getByTestId("product-table")).toHaveCount(0);
  await other.close();
  await page.reload();
  expect(browserAudit.filter(event => event.kind === "unsaved-changes-warning")).toEqual([{ kind: "unsaved-changes-warning", type: "beforeunload" }]);
  await expect(status(page)).toContainText(labels.status.empty);
  await expect(page.getByTestId("kpi-net_revenue")).toHaveCount(0);
});

test("下載共用期間通路與商品篩選，公式文字安全而負數金額仍是數字", async ({ page }) => {
  await importFixture(page);
  await selectChannel(page, "DTC");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("40.00"));
  const analysis = csvRecords(await downloadText(page, (await openDownloads(page)).getByRole("button", { name: labels.downloads.analysisCsv, exact: true }), "profitlens-analysis.csv"));
  await closeDownloads(page);
  const current = analysis.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing");
  expect(current).toBeDefined();
  expect(current!.value).toBe("40.00");
  expect(current!.current_period_start).toBe("2026-09-03");
  expect(current!.current_period_end).toBe("2026-09-04");
  expect(JSON.parse(current!.filter_scope).channels).toEqual(["DTC"]);
  expect(analysis.filter(row => row.row_type === "channel").every(row => row.channel === "DTC")).toBe(true);
  // R4：assist_kpi 列的版本是 assist-kpi-v1；其餘列仍是 contribution-v1。
  expect(analysis.every(row => row.metric_version === (row.row_type === "assist_kpi" ? ASSIST_KPI_VERSION : "contribution-v1") && row.as_of === "2026-09-05")).toBe(true);
  expect(analysis.filter(row => row.row_type === "assist_kpi")).toHaveLength(14);
  await selectChannel(page, { label: labels.ui.dashboard.filter.allChannels });
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  await navigateTo(page, "products");
  const allProducts = csvRecords(await downloadText(page, await productsCsvButton(page), "profitlens-products.csv"));
  expect(new Set(allProducts.map(row => row.sku))).toEqual(new Set([`'${maliciousSku}`, "'+TEST()", "'-TEST()", "'@TEST()"]));
  expect(allProducts.some(row => row.category === "'\t=FORMULA()")).toBe(true);
  expect(allProducts.some(row => row.category === "'@NOTE")).toBe(true);
  expect(allProducts.some(row => row.metric === "gross_profit" && row.value === "-100.00")).toBe(true);
  expect(allProducts.every(row => !["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(true);
  await selectChannel(page, "MARKETPLACE");
  await page.getByLabel(labels.csvColumns.category, { exact: true }).selectOption("\t=FORMULA()");
  await page.getByLabel(labels.ui.productComparisonPanel.searchSku, { exact: true }).fill("-TEST()");
  await expect(page.getByTestId("product-table").locator("tbody tr")).toHaveCount(1);
  const selectedProducts = csvRecords(await downloadText(page, await productsCsvButton(page), "profitlens-products.csv"));
  expect(selectedProducts.length).toBeGreaterThan(0);
  expect(selectedProducts.every(row => row.channel === "MARKETPLACE" && row.sku === "'-TEST()" && row.category === "'\t=FORMULA()")).toBe(true);
  expect(selectedProducts.every(row => row.product_query === "'-test()" && row.product_category === "'\t=FORMULA()")).toBe(true);
  expect(selectedProducts.find(row => row.metric === "net_revenue")?.value).toBe("-40.00");
  expect(selectedProducts.find(row => row.metric === "gross_profit")?.value).toBe("-100.00");
  await navigateTo(page, "overview");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("-30.00"));
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("200.00"));
});

test("空白品類商品仍可搜尋匯出，合法 all 通路與全部通路各自正確", async ({ page }) => {
  const overrides: Partial<Record<WizardRole, FilePayload>> = {};
  for (const role of wizardRoles) {
    let text = (await readFile(resolve(alternative, role), "utf8")).replaceAll(",DTC,", ",all,");
    if (role === "sales_daily.csv") text = text.replaceAll(",+TEST(),@NOTE,", ",+TEST(),,");
    overrides[role] = { name: role, mimeType: "text/csv", buffer: Buffer.from(text) };
  }
  const manifest = {
    ...JSON.parse(await readFile(resolve(alternative, "manifest.json"), "utf8")) as Record<string, unknown>,
    dataset_id: "alternative-blank-category-all-channel-synthetic", channels: ["all", "MARKETPLACE"],
  };
  await stage(page, alternative, overrides, { name: "blank-category-manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(wizard(page).getByLabel(copy.datasetName, { exact: true })).toHaveValue("alternative-blank-category-all-channel-synthetic");
  await expect(wizard(page).getByLabel("all", { exact: true })).toBeChecked();
  await expect(wizard(page).getByLabel("MARKETPLACE", { exact: true })).toBeChecked();
  await commit(page, alternativeAsOf);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  await selectChannel(page, { label: "all" });
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("400.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("40.00"));
  await selectChannel(page, { label: labels.ui.dashboard.filter.allChannels });
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  await navigateTo(page, "products");
  const table = page.getByTestId("product-table");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  const blankCategoryRow = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "+TEST()", exact: true }) });
  await expect(blankCategoryRow).toContainText(labels.ui.workspacePanels.uncategorized);
  const optionLabels = await page.getByLabel(labels.csvColumns.category, { exact: true }).locator("option").allTextContents();
  expect(optionLabels.every(label => label.trim().length > 0), "品類下拉不得出現無名稱的空白選項").toBe(true);
  await page.getByLabel(labels.ui.productComparisonPanel.searchSku, { exact: true }).fill("+TEST()");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText(labels.ui.workspacePanels.uncategorized);
  await expect(table).toContainText(formatAmountL2("120.00"));
  await expect(table).toContainText(formatAmountL2("80.00"));
  const exported = csvRecords(await downloadText(page, await productsCsvButton(page), "profitlens-products.csv"));
  expect(exported.length).toBeGreaterThan(0);
  expect(exported.every(row => row.channel === "all" && row.sku === "'+TEST()" && row.category === "")).toBe(true);
  expect(exported.every(row => row.product_query === "'+test()" && row.product_category === "")).toBe(true);
  expect(exported.find(row => row.metric === "net_revenue")?.value).toBe("120.00");
  expect(exported.find(row => row.metric === "gross_profit")?.value).toBe("80.00");
  expect(exported.every(row => !["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(true);
  await navigateTo(page, "overview");
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
});
