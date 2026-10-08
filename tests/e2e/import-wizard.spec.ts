import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL3, formatCount, formatRateL2 } from "../../src/application/presentation";
import { chooseBasis, commitButton, commitWizard, confirmAndCheck, confirmMappingIfShown, importViaWizard, nextFromFiles, openWizard, setWizardFiles, wizard, wizardFileLabels, wizardResultNote, wizardRoles, wizardStatus } from "./import-wizard-helpers";
import { closeDownloads, dismissSavePrompt, navigateTo, openDownloads, sidebarNav } from "./replacement-helpers";

// R3 匯入精靈：≤ 5 次點擊、對照記憶提示、含稅換算後 KPI＝手算、超限拒絕、訂單級偵測、「我不確定」停下。
const copy = labels.importWizard;
const v3 = copy.wizardV3;
const alternative = resolve("tests/fixtures/alternative");
const inclusive = resolve("tests/fixtures/inclusive_tax");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
// V3-2b（PRD §8.5）：KPI 卡是 L1；golden／手算精確值交給 formatAmountL1 轉成畫面文字。
const drawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence}$`) });
/** 測試自己數 CSV 資料列（非空行減表頭），不呼叫 application 的 parser。 */
async function fixtureRows(directory: string) {
  const counts = await Promise.all(wizardRoles.map(async role => (await readFile(resolve(directory, role), "utf8")).split(/\r?\n/).filter(line => line.trim()).length - 1));
  return counts.reduce((sum, n) => sum + n, 0);
}
/** §7.7.2 步驟 4 頂部狀態一行（L1）「可以套用：…」；數字一律經 formatCount（L2 整數千分位）。 */
const statusReady = (files: number, rows: number, errors = 0, warnings = 0) => fill(v3.statusReady, { files: formatCount(files, "L2"), rows: formatCount(rows, "L2"), errors: formatCount(errors, "L2"), warnings: formatCount(warnings, "L2") });
/** V3-8：版頭 h2 是 sr-only 的「第 n 步，共 4 步：」＋步驟名（不再「匯入資料｜…」拼接）。 */
const stepHeading = (n: number) => `${fill(v3.stepOf, { n, total: copy.steps.length })}${copy.steps[n - 1]}`;

test.beforeEach(async ({ page }) => { await page.goto("/"); });

// V3-3：頁首「匯入資料」（page-import）只留在資料來源頁；從總覽進精靈改為 資料狀態（data-status）→「匯入新資料」（data-status-import），
// 入口多 1 次點擊。點擊預算的算法：從總覽起算，入口 2 次＋精靈內（第 1 步起）≤ 5 次（v2 原本的預算不放寬），合計 ≤ 6；兩段分開斷言。
test("標準三檔從「匯入資料」到總覽 KPI 最多 5 次點擊", async ({ page }) => {
  let clicks = 0;
  const count = async (action: () => Promise<void>) => { clicks += 1; await action(); };
  await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("page-import")).toHaveCount(0);
  // 第 1 次（資料狀態）：剛 goto 時可能還沒 hydrate，toPass 只為等互動就緒而重試，使用者只點 1 次；點之前看 aria-expanded，不會把 popover 關掉。
  const dataStatus = page.getByTestId("data-status");
  await count(() => expect(async () => {
    if (await dataStatus.getAttribute("aria-expanded") !== "true") await dataStatus.click();
    await expect(page.getByTestId("data-status-popover")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 }));
  await expect(page.getByTestId("data-status-import")).toHaveText(labels.shell.dataStatus.importNew);
  await count(() => page.getByTestId("data-status-import").click());
  await expect(wizard(page)).toBeVisible();
  const entryClicks = clicks;
  expect(entryClicks, "從總覽開啟匯入精靈的點擊數（資料狀態 → 匯入新資料）").toBe(2);
  await setWizardFiles(page, alternative);
  await count(() => wizard(page).getByRole("button", { name: copy.next, exact: true }).click());
  // 欄名全部符合標準：第 2 步自動完成，直接到口徑與期間，期間與通路已由檔案填好。
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await expect(page.getByTestId("import-stepper").locator("li").nth(1)).toHaveClass(/skipped/);
  await expect(wizard(page).getByLabel(copy.coverageStart, { exact: true })).toHaveValue("2026-09-01");
  await expect(wizard(page).getByLabel(copy.dataAsOf, { exact: true })).toHaveValue("2026-09-05");
  await expect(wizard(page).getByLabel(labels.exports.csv.columns.current_end, { exact: true })).toHaveValue("2026-09-04");
  await expect(wizard(page).getByLabel("DTC", { exact: true })).toBeChecked();
  await expect(wizard(page).getByLabel("MARKETPLACE", { exact: true })).toBeChecked();
  await expect(wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeDisabled();
  await count(() => wizard(page).getByLabel(copy.basis.exclusive, { exact: true }).check());
  await count(() => wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true }).click());
  // V3-8（§7.7.2）：頂部狀態一行改成 L1 樣板，既有的檢核結果句移到 import-result-note。
  await expect(wizardStatus(page)).toHaveAttribute("data-classification", "valid");
  await expect(wizardStatus(page)).toHaveText(statusReady(wizardRoles.length, await fixtureRows(alternative)));
  await expect(wizardResultNote(page)).toHaveText(copy.result.valid);
  await expect(page.getByTestId("import-preprocessing")).toContainText(copy.noConversion);
  // 未勾選本機保存同意：對照記憶只留在分頁，摘要要講清楚。
  await expect(page.getByTestId("import-memory-note")).toHaveText(copy.memorySessionOnly);
  await count(() => commitButton(page).click());
  await expect(wizard(page)).toHaveCount(0);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("10.00"));
  expect(clicks - entryClicks, "精靈第 1 步到 KPI 的點擊數").toBeLessThanOrEqual(5);
  expect(clicks, "從總覽（資料狀態 → 匯入新資料）到 KPI 的點擊數").toBeLessThanOrEqual(6);
});

test("含稅來源逐列換算後 KPI 等於手算，抽屜顯示原值→換算值，匯出帶換算摘要", async ({ page }) => {
  await openWizard(page);
  await setWizardFiles(page, inclusive);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "inclusive");
  const conversion = page.getByTestId("import-conversion");
  await expect(conversion.getByLabel(copy.rateLabel, { exact: true })).toHaveValue("5");
  await expect(conversion.getByLabel(`${copy.files.sales} ${labels.metrics.cogs_net.headline}`, { exact: true })).not.toBeChecked();
  await expect(conversion.getByLabel(`${copy.files.ads} ${labels.metrics.ad_spend.headline}`, { exact: true })).toBeChecked();
  await confirmAndCheck(page, "valid");
  // tests/fixtures/inclusive_tax/README.md 的手算：原價收入含稅合計 4725.00 → 4500.00；共 12 列。
  const summary = page.getByTestId("import-preprocessing");
  await expect(summary).toContainText("5%");
  await expect(summary).toContainText("12");
  await expect(summary).toContainText(formatAmountL3("4725.00"));
  await expect(summary).toContainText(formatAmountL3("4500.00"));
  await expect(page.getByTestId("reconciliation-metric-net_revenue")).toContainText(formatAmountL3("4150.00"));
  await commitWizard(page);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2150.00"));
  await expect(kpi(page, "gross_profit")).toHaveText(formatAmountL1("1230.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("518.05"));
  // R6：首次載入資料後的「自動保存？」提示（非 modal）；V3-3 手機它疊在底部，會擋住頂欄「更多」裡的匯出選單。本測試不測自動保存，先按「暫時不要」。
  await dismissSavePrompt(page);
  await page.getByTestId("kpi-net_revenue").locator(".kpi-value button").click();
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByTestId("evidence-conversion-note")).toContainText("5%");
  const sourceTable = drawer(page).getByRole("region", { name: labels.evidence.drawer.sourceTableAria });
  await expect(sourceTable).toContainText("840.00");
  await expect(sourceTable).toContainText("800.00");
  await expect(sourceTable.locator(".converted-value").first()).toContainText("→");
  await page.keyboard.press("Escape");
  await navigateTo(page, "data");
  const preprocessing = page.getByTestId("data-preprocessing");
  await expect(preprocessing).toContainText("5%");
  // V3-8（§7.7.1 第 5 點）：前處理改成表格，一列一個換算欄位：含稅合計（元）｜未稅合計（元）｜稅率（L3 金額、L2 稅率）。
  const grossSales = preprocessing.locator("tr[data-field=gross_sales]");
  await expect(grossSales.locator("th")).toHaveText(labels.metrics.gross_sales.headline);
  await expect(grossSales.locator("td")).toHaveText([formatAmountL3("4725.00"), formatAmountL3("4500.00"), formatRateL2("0.05")]);
  // cogs_net 已是未稅（預設不勾），不在換算表裡。
  await expect(preprocessing.locator("tr[data-field=cogs_net]")).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.exports.downloads.analysisCsv, exact: true }).click()]);
  const text = await readFile((await download.path())!, "utf8");
  expect(text).toContain("5%");
  expect(text).toContain(labels.metrics.gross_sales.headline);
});

test("同一組非標準欄名第二次匯入會顯示記憶提示並帶入對照", async ({ page }) => {
  const sales = (await readFile(resolve(alternative, "sales_daily.csv"), "utf8")).replace(/^date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency/, "結帳日,通路,商品貨號,品類,件數,商品金額,折扣,退款,成本,幣別");
  const payload = { name: "shop-sales.csv", mimeType: "text/csv", buffer: Buffer.from(sales) };
  await openWizard(page);
  await setWizardFiles(page, alternative, { "sales_daily.csv": payload });
  await nextFromFiles(page);
  const mapping = page.getByTestId("import-mapping-sales_daily.csv");
  await expect(mapping).toBeVisible();
  await expect(page.getByTestId("import-memory-hint")).toHaveCount(0);
  await expect(mapping.locator("tbody tr").first()).toContainText(copy.mappingStatus.dictionary);
  await expect(mapping.getByLabel(`sales_daily.csv gross_sales 對應欄位`, { exact: true })).toHaveValue("商品金額");
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await commitWizard(page);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
  // 第二次：同一組欄名 → 記憶命中，狀態改為「上次用過，請確認」，仍要按確認。
  await openWizard(page);
  await setWizardFiles(page, alternative, { "sales_daily.csv": payload });
  await nextFromFiles(page);
  await expect(page.getByTestId("import-memory-hint")).toBeVisible();
  await expect(page.getByTestId("import-memory-hint")).toContainText(copy.memoryHint.split("（")[0]);
  await expect(mapping.getByLabel(`sales_daily.csv gross_sales 對應欄位`, { exact: true })).toHaveValue("商品金額");
  await expect(mapping.locator("tbody tr").first()).toContainText(copy.mappingStatus.memory);
  await expect(page.getByTestId("import-step-3")).toHaveCount(0);
});

test("超過 5 MiB 或 50,000 列在第 1 步直接拒絕，不能下一步", async ({ page }) => {
  await openWizard(page);
  const huge = { name: "huge-sales.csv", mimeType: "text/csv", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x61) };
  await wizard(page).getByLabel(wizardFileLabels["sales_daily.csv"], { exact: true }).setInputFiles(huge);
  const slot = page.getByTestId("import-file-sales_daily.csv");
  // V3-2a：{file} 由 application 帶入標準檔名（SourceRef.file），不是使用者上傳的檔名。
  await expect(slot.getByRole("alert")).toContainText(fill(labels.errors.import.FILE_TOO_LARGE, { file: "sales_daily.csv" }));
  await expect(wizard(page).getByRole("button", { name: copy.next, exact: true })).toBeDisabled();
  const rows = ["date,channel,ad_spend,currency", ...Array.from({ length: 50_001 }, (_, index) => `2026-01-01,C${index},1.00,TWD`)].join("\n");
  await wizard(page).getByLabel(wizardFileLabels["ad_spend_daily.csv"], { exact: true }).setInputFiles({ name: "too-many-rows.csv", mimeType: "text/csv", buffer: Buffer.from(rows) });
  await expect(page.getByTestId("import-file-ad_spend_daily.csv").getByRole("alert")).toContainText("50,000");
  await expect(wizard(page).getByRole("button", { name: copy.next, exact: true })).toBeDisabled();
});

test("訂單級匯出檔會被指出並導向整理工具；「我不確定」停在第 3 步", async ({ page }) => {
  const orders = ["訂單號碼,訂單日期,商品貨號,商品名稱,數量,商品金額", "#1001,2026-09-01,SKU-1,T 恤,1,500.00", "#1002,2026-09-02,SKU-2,帽子,2,300.00"].join("\n");
  await openWizard(page);
  await setWizardFiles(page, alternative, { "sales_daily.csv": { name: "shopline-orders.csv", mimeType: "text/csv", buffer: Buffer.from(orders) } });
  // 第 1 步就在該格提示（04 §4.3），第 2 步再提示一次並連到說明。
  await expect(page.getByTestId("import-order-level-sales_daily.csv")).toContainText(copy.orderLevelDetected);
  await nextFromFiles(page);
  await expect(page.getByTestId("import-order-level")).toContainText(copy.orderLevelDetected);
  await expect(page.getByTestId("import-order-level").getByRole("link", { name: copy.orderLevelLink })).toHaveAttribute("href", /ORDER_AGGREGATION\.md$/);
  await expect(wizard(page).getByRole("button", { name: copy.confirmMapping, exact: true })).toBeDisabled();
  await wizard(page).getByRole("button", { name: copy.back, exact: true }).click();
  await setWizardFiles(page, alternative);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "unsure");
  await expect(wizard(page).getByRole("alert")).toContainText(copy.basisUnsureStop);
  await expect(wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeDisabled();
  await chooseBasis(page, "exclusive");
  await expect(wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeEnabled();
});

test("下載選單提供空白範本與含三列範例的範本", async ({ page }) => {
  const menu = await openDownloads(page);
  const templates = menu.getByTestId("download-templates");
  await expect(templates).toContainText(labels.exports.downloads.templatesHeading);
  const [example] = await Promise.all([page.waitForEvent("download"), templates.getByRole("link", { name: labels.exports.downloads.exampleTemplate.replace("{file}", copy.files.sales), exact: true }).click()]);
  expect(example.suggestedFilename()).toBe("sales_daily.csv");
  const text = (await readFile((await example.path())!, "utf8")).replace(/^﻿/, "");
  expect(text.split(/\r?\n/).filter(Boolean)).toHaveLength(4);
  expect(text.split(/\r?\n/)[0]).toBe("date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency");
  const [blank] = await Promise.all([page.waitForEvent("download"), templates.getByRole("button", { name: labels.exports.downloads.blankTemplate.replace("{file}", copy.files.costs), exact: true }).click()]);
  expect((await readFile((await blank.path())!, "utf8")).replace(/^﻿/, "").trim().split(/\r?\n/)).toHaveLength(1);
  // 範例三檔可直接匯入（先收起下載選單，免得遮住「匯入資料」）。
  await closeDownloads(page);
  await importViaWizard(page, resolve("templates/examples"));
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("980.00"));
});

test("拖放三份檔案或一次選三份會依檔名自動歸位；看不出角色的檔案留給使用者指定", async ({ page }) => {
  const texts = await Promise.all(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"].map(name => readFile(resolve(alternative, name), "utf8")));
  await openWizard(page);
  const files = [{ name: "2026-09 Sales 官網.csv", text: texts[0] }, { name: "通路費用.csv", text: texts[1] }, { name: "meta-ads-daily.csv", text: texts[2] }, { name: "report.csv", text: "a,b\n1,2\n" }];
  const dataTransfer = await page.evaluateHandle(payload => { const dt = new DataTransfer(); for (const file of payload) dt.items.add(new File([file.text], file.name, { type: "text/csv" })); return dt; }, files);
  await page.locator(".dropzone").dispatchEvent("drop", { dataTransfer });
  await expect(page.getByTestId("import-file-sales_daily.csv")).toContainText("2026-09 Sales 官網.csv");
  await expect(page.getByTestId("import-file-channel_costs_daily.csv")).toContainText("通路費用.csv");
  await expect(page.getByTestId("import-file-ad_spend_daily.csv")).toContainText("meta-ads-daily.csv");
  await expect(page.locator(".dropzone").getByRole("status")).toContainText("report.csv");
  await expect(wizard(page).getByRole("button", { name: copy.next, exact: true })).toBeEnabled();
  // 一次在同一個選檔框選三份也會依檔名歸位。
  await wizard(page).getByLabel(wizardFileLabels["sales_daily.csv"], { exact: true }).setInputFiles(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"].map(name => resolve(alternative, name)));
  for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const) await expect(page.getByTestId(`import-file-${role}`)).toContainText(role);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await commitWizard(page);
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("600.00"));
});

// V3-8（PRD §7.7.2 驗收）：含稅匯入從「匯入資料」到「套用」≤ 5 次點擊。入口是空的總覽空狀態「匯入資料」（empty-import，1 次點擊開精靈）；
// setInputFiles 不算點擊；欄名全符合標準時第 2 步自動完成；稅率 5% 與 8 個換算欄位用預設，不必展開「調整換算欄位」。
test("含稅匯入從「匯入資料」到「套用」最多 5 次點擊（inclusive_tax）", async ({ page }) => {
  let clicks = 0;
  const count = async (action: () => Promise<void>) => { clicks += 1; await action(); };
  const importButton = page.getByTestId("empty-import");
  await expect(importButton).toHaveText(labels.shell.buttons.importData);
  // 剛 goto 時按鈕可能還沒 hydrate：toPass 只為等互動就緒而重試（精靈出現就停），使用者只點 1 次。
  await count(() => expect(async () => {
    if (!(await wizard(page).isVisible())) await importButton.click();
    await expect(wizard(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 }));
  await setWizardFiles(page, inclusive);
  await count(() => wizard(page).getByRole("button", { name: copy.next, exact: true }).click());
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await expect(page.getByTestId("import-stepper").locator("li").nth(1)).toHaveClass(/skipped/);
  await count(() => wizard(page).getByLabel(copy.basis.inclusive, { exact: true }).check());
  await expect(page.getByTestId("import-conversion").getByLabel(copy.rateLabel, { exact: true })).toHaveValue("5");
  await count(() => wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true }).click());
  await expect(wizardStatus(page)).toHaveAttribute("data-classification", "valid", { timeout: 20_000 });
  await expect(wizardStatus(page)).toHaveText(statusReady(wizardRoles.length, await fixtureRows(inclusive)));
  await expect(wizardResultNote(page)).toHaveText(copy.result.valid);
  await count(() => commitButton(page).click());
  await expect(wizard(page)).toHaveCount(0);
  // tests/fixtures/inclusive_tax/README.md 的手算：本期淨營收 2150.00、扣廣告後貢獻 518.05。
  await expect(kpi(page, "net_revenue")).toHaveText(formatAmountL1("2150.00"));
  await expect(kpi(page, "contribution_after_marketing")).toHaveText(formatAmountL1("518.05"));
  expect(clicks, "含稅匯入：「匯入資料」到「套用」的點擊數").toBeLessThanOrEqual(5);
});

// V3-8（§7.7.1／§7.7.2 驗收）：步驟 3 選「含稅」後，精靈裡可見且可操作的控制 ≤ 12（不含底部動作列與 stepper）。
// 收合的 <details> 內容（換算欄位、比較期間、通路）不算可見；summary 本身算一個控制。
test("步驟 3 選含稅後可見且可操作的控制最多 12 個（不含底部動作列與 stepper）", async ({ page }) => {
  await openWizard(page);
  await setWizardFiles(page, inclusive);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "inclusive");
  await expect(page.getByTestId("import-conversion")).toBeVisible();
  const controls = await wizard(page).evaluate(root => Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=checkbox], [role=radio], [role=switch], [role=combobox], [contenteditable=true]"))
    .filter(element => !element.closest(".wizard-footer, [data-testid=import-stepper]"))
    .filter(element => element.checkVisibility({ visibilityProperty: true }) && !element.matches(":disabled"))
    .map(element => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName));
  // 金額基準 3 個 radio、稅率、取消匯入與兩個收合區的 summary 一定在可見控制裡（確認計數真的掃到第 3 步）。
  expect(controls).toEqual(expect.arrayContaining([copy.basis.exclusive, copy.basis.inclusive, copy.basis.unsure, copy.rateLabel, copy.cancel, v3.adjustConvert, v3.adjustPeriods]));
  // 換算欄位 checkbox 收在「調整換算欄位」裡，不可見。
  expect(controls).not.toContain(`${copy.files.sales} ${labels.metrics.gross_sales.headline}`);
  expect(controls.length, `步驟 3（含稅）可見且可操作的控制：${controls.join("、")}`).toBeLessThanOrEqual(12);
});

// V3-8（§7.7.2）：版頭 h2#import-heading 四步都只寫「第 n 步，共 4 步：{步驟名}」，沒有「匯入資料｜…」拼接；stepper 只有一個 aria-current=step。
test("精靈四步的 h2#import-heading 都沒有「｜」，stepper 只有一個 aria-current=step", async ({ page }) => {
  // 欄名改成中文（字典對照，需要確認），第 2 步不會自動完成，四步都會走到。
  const sales = (await readFile(resolve(alternative, "sales_daily.csv"), "utf8")).replace(/^date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency/, "結帳日,通路,商品貨號,品類,件數,商品金額,折扣,退款,成本,幣別");
  const heading = page.locator("h2#import-heading");
  const stepper = page.getByTestId("import-stepper");
  const expectStep = async (n: number) => {
    await expect(heading).toHaveText(stepHeading(n));
    await expect(heading).not.toContainText("｜");
    await expect(stepper.locator("li[aria-current=step]")).toHaveCount(1);
    await expect(stepper.locator("li").nth(n - 1)).toHaveAttribute("aria-current", "step");
    // 頁首 h1 在匯入中是「匯入資料」（PageHeader 提供），精靈裡沒有第二個 h1。
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(wizard(page).getByRole("heading", { level: 1 })).toHaveCount(0);
  };
  await openWizard(page);
  await expectStep(1);
  await setWizardFiles(page, alternative, { "sales_daily.csv": { name: "shop-sales.csv", mimeType: "text/csv", buffer: Buffer.from(sales) } });
  await nextFromFiles(page);
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await expectStep(2);
  await confirmMappingIfShown(page);
  await expectStep(3);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await expectStep(4);
  for (const n of [0, 1, 2]) await expect(stepper.locator("li").nth(n)).toHaveClass(/done/);
});

// V3-8（§7.7.2 全版專注模式）：匯入中期間列（period-bar）與頁面內容（.view-content）保持掛載但 hidden，頂欄仍在；取消匯入後恢復。
test("匯入中期間列與頁面內容 hidden、頂欄仍在，取消匯入後恢復", async ({ page }) => {
  await page.getByTestId("empty-load-demo").click();
  await expect(kpi(page, "net_revenue")).toBeVisible();
  await dismissSavePrompt(page);
  const periodBar = page.getByTestId("period-bar");
  const viewContent = page.locator(".view-content");
  await expect(periodBar).toBeVisible();
  await expect(viewContent).toBeVisible();
  await openWizard(page);
  await expect(periodBar).toHaveCount(1);
  await expect(periodBar).toBeHidden();
  await expect(viewContent).toHaveCount(1);
  await expect(viewContent).toBeHidden();
  await expect(page.locator("header.topbar")).toBeVisible();
  await expect(page.getByTestId("data-status")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
  await expect(page.locator(".page-heading .subtitle")).toHaveText(copy.privacyNote);
  // 頁首的「匯入資料／載入示範資料」保持掛載但 hidden（page-import 不消失）。
  await expect(page.getByTestId("page-import")).toHaveCount(1);
  await expect(page.getByTestId("page-import")).toBeHidden();
  await wizard(page).getByRole("button", { name: copy.cancel, exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);
  await expect(periodBar).toBeVisible();
  await expect(viewContent).toBeVisible();
});
