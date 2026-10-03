import { clickReplacing, dismissSavePrompt } from "./replacement-helpers";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardManifest, wizard } from "./import-wizard-helpers";
import { fill, labels } from "../../src/i18n";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Locator, type Page } from "@playwright/test";

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use, testInfo) => {
    const events: string[] = [];
    page.on("pageerror", error => events.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") events.push(`console:${message.text()}`); });
    await use(events);
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-products-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, test: testInfo.title, status: testInfo.status, browser_errors: events })}\n`);
    expect(events).toEqual([]);
  }, { auto: true }],
});

/** R2: every visible string comes from the label dictionary; compose the same way the panel does. */
const panel = labels.ui.productComparisonPanel;
const validation = labels.ui.dashboard.validation;
/** 「商品毛利差額」= metric label + change suffix, as product-comparison-panel.tsx's changeLabel(). */
const grossProfitChange = `${labels.metrics.gross_profit.label}${labels.csvSuffix.change}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Evidence dialog is titled `${title}｜怎麼算的`; match by its suffix. */
const evidenceDialog = new RegExp(`${escape(labels.sections.evidence)}$`);
/** Two-period delta trigger `查看 {channel} {sku} {label}兩期怎麼算的，{value}`, matched from {label} onward so channel/sku stay open. */
const deltaTrigger = (value: string) => new RegExp(`${escape(fill(panel.deltaEvidenceAria.slice(panel.deltaEvidenceAria.indexOf("{label}")), { label: grossProfitChange, value }))}$`);
/** R2 evidence drawer lists source rows per file in tabs labelled `${sourceTabs[file]}（count）`; switch before asserting rows from that file. */
const sourceTab = (dialog: ReturnType<Page["getByRole"]>, file: keyof typeof labels.evidence.sourceTabs) => dialog.getByRole("button", { name: new RegExp(`^${escape(labels.evidence.sourceTabs[file])}（\\d+）$`) });
/** R5-6（02 §5）：全表與小表的欄名，由 labels 依 product-comparison-panel.tsx 的組字方式組出（期間短名＋指標短名／差額後綴）。 */
const highlight = labels.productHighlights;
const current = (label: string) => `${labels.periods.current}${label}`;
const previous = (label: string) => `${labels.periods.previous}${label}`;
const netRevenueChange = `${labels.metrics.net_revenue.label}${labels.csvSuffix.change}`;
const unitsLabel = labels.assist.items.units_sold.label;
/** 通路｜SKU｜品類｜本期售出件數｜本期淨營收｜本期商品毛利｜本期毛利率｜商品毛利差額｜淨營收差額｜上期淨營收｜上期商品毛利｜資料狀態 */
const mainColumns = [
  labels.csvColumns.channel, "SKU", labels.csvColumns.category, current(unitsLabel),
  current(labels.metrics.net_revenue.short), current(labels.metrics.gross_profit.short), current(labels.metrics.gross_margin.short),
  grossProfitChange, netRevenueChange, previous(labels.metrics.net_revenue.label), previous(labels.metrics.gross_profit.label), highlight.columns.dataStatus,
];
/** 「更多欄位」：本期商品成本／折扣／退款，上期售出件數／商品成本／毛利率／折扣／退款。 */
const moreColumns = [
  current(labels.metrics.cogs_net.short), current(labels.metrics.discounts.short), current(labels.metrics.refunds.short),
  previous(unitsLabel), previous(labels.metrics.cogs_net.short), previous(labels.metrics.gross_margin.short), previous(labels.metrics.discounts.short), previous(labels.metrics.refunds.short),
];
const highlightColumns = ["SKU", labels.csvColumns.category, current(labels.metrics.gross_profit.short), grossProfitChange, current(labels.metrics.gross_margin.short)];
const headerTexts = (table: Locator) => table.locator("thead th").evaluateAll(cells => cells.map(cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim()));
/** 每列儲存格文字（空白壓成一格）；小表的列標頭是「SKU 通路」。 */
const rowTexts = (root: Locator) => root.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.children].map(cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim())));
/** 全表某列的「資料狀態」欄（主欄第 12 欄）。 */
const statusCell = (row: Locator) => row.locator(":scope > *").nth(mainColumns.length - 1);

async function load(page: Page, id = "golden") {
  await page.goto("/");
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(new RegExp(`${escape(labels.status.ready)}|${escape(labels.status.partial)}`));
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  await page.getByRole("button", { name: labels.nav.products.label, exact: true }).click();
  await expect(page.getByTestId("product-table")).toBeVisible();
}

/** Independent CSV reader; expected values are literal and not generated by domain functions. */
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
async function downloadComparison(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: panel.downloadComparisonCsv, exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("profitlens-product-comparison.csv");
  return records(await readFile((await download.path())!, "utf8"));
}

test("PL-07 golden 按毛利下降排序，兩期證據可鍵盤開啟，匯出同範圍", async ({ page }, testInfo) => {
  await load(page);
  const table = page.getByTestId("product-table");
  // R5-6：欄位重排（件數、毛利率、資料狀態），「更多欄位」預設關閉。
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "false");
  expect(await headerTexts(table)).toEqual(mainColumns);
  // 預設由小到大（先看下降）：MARKETPLACE/B −55、DTC/B −50、MARKETPLACE/A +10、DTC/A +40；四列都是兩期皆有。
  expect((await rowTexts(table)).map(row => [row[0], row[1], row[7], row[11]])).toEqual([
    ["MARKETPLACE", "B", "-55.00", highlight.status.both], ["DTC", "B", "-50.00", highlight.status.both],
    ["MARKETPLACE", "A", "+10.00", highlight.status.both], ["DTC", "A", "+40.00", highlight.status.both],
  ]);
  for (const old of [panel.activity.bothObserved, panel.activity.currentOnly, panel.activity.previousOnly]) await expect(table).not.toContainText(old);
  // Top／Bottom 小表（golden 手算）：本期毛利 = 淨營收 − 成本；毛利率 = 毛利 ÷ 淨營收（兩位小數百分比）。
  const worst = page.getByTestId("product-worst"), best = page.getByTestId("product-best");
  await expect(worst.getByRole("heading", { level: 4 })).toHaveText(fill(highlight.worstTitle, { n: 10 }));
  await expect(best.getByRole("heading", { level: 4 })).toHaveText(fill(highlight.bestTitle, { n: 10 }));
  expect(await headerTexts(worst)).toEqual(highlightColumns);
  expect(await headerTexts(best)).toEqual(highlightColumns);
  expect(await rowTexts(worst)).toEqual([
    ["B MARKETPLACE", "CARE", "125.00", "-55.00", "35.71%"], // 500−100−50=350；350−225=125；125÷350
    ["B DTC", "CARE", "200.00", "-50.00", "55.56%"], // 400−20−20=360；360−160=200；200÷360
    ["A MARKETPLACE", "HOME", "280.00", "+10.00", "43.75%"], // 800−120−40=640；640−360=280；280÷640
    ["A DTC", "HOME", "540.00", "+40.00", "48.21%"], // 1400−210−70=1120；1120−580=540；540÷1120
  ]);
  expect(await rowTexts(best)).toEqual([["A DTC", "HOME", "540.00", "+40.00", "48.21%"], ["A MARKETPLACE", "HOME", "280.00", "+10.00", "43.75%"]]);
  await expect(worst.getByRole("region", { name: highlight.worstAria, exact: true })).toHaveAttribute("tabindex", "0");
  await expect(best.getByRole("region", { name: highlight.bestAria, exact: true })).toHaveAttribute("tabindex", "0");
  // 「更多欄位」：開啟後 12 → 20 欄（主欄後接 8 欄），再關回 12 欄。
  await page.getByTestId("product-more-columns").click();
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("thead th")).toHaveCount(mainColumns.length + moreColumns.length);
  expect(await headerTexts(table)).toEqual([...mainColumns, ...moreColumns]);
  await expect(table.locator("tbody tr").first().locator(":scope > *")).toHaveCount(mainColumns.length + moreColumns.length);
  await page.getByTestId("product-more-columns").click();
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "false");
  await expect(table.locator("thead th")).toHaveCount(mainColumns.length);
  await expect(table.locator("tbody tr").first()).toContainText("MARKETPLACE");
  await expect(table.locator("tbody tr").first().getByRole("rowheader")).toHaveText("B");
  // Golden keeps raw channel codes; the 官網／平台 alias applies only to the demo dataset.
  const trigger = table.getByRole("button", { name: fill(panel.deltaEvidenceAria, { channel: "MARKETPLACE", sku: "B", label: grossProfitChange, value: "-55.00" }), exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: evidenceDialog });
  await expect(dialog).toContainText("NT$ -55.00");
  await expect(dialog).toContainText("NT$ 180.00");
  await expect(dialog).toContainText("NT$ 125.00");
  await expect(dialog).toContainText("2026-08-01");
  await expect(dialog).toContainText("2026-08-02");
  await expect(dialog).toContainText(fill(labels.evidence.lineN, { n: 5 }));
  await expect(dialog).toContainText(fill(labels.evidence.lineN, { n: 9 }));
  await expect(dialog).not.toContainText("ad_spend_daily.csv");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByLabel(panel.sortDirection, { exact: true }).selectOption("descending");
  await expect(table.locator("tbody tr").first()).toContainText("DTC");
  await expect(table.locator("tbody tr").first().getByRole("rowheader")).toHaveText("A");
  await page.getByLabel(labels.csvColumns.category, { exact: true }).selectOption("HOME");
  await page.getByLabel(panel.searchSku, { exact: true }).fill("a");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  const output = await downloadComparison(page);
  expect(output.map(row => [row.channel, row.sku, row.gross_profit_change])).toEqual([["DTC", "A", "40.00"], ["MARKETPLACE", "A", "10.00"]]);
  expect(output.every(row => row.category_filter === "HOME" && row.query === "a" && row.direction === "descending" && row.previous_start === "2026-08-01" && row.current_start === "2026-08-02")).toBe(true);
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  await expect(page.getByRole("button", { name: panel.negativeOnly, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(panel.empty, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-products-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("255.00");
});

test("PL-07 缺成本差額不補零，正反排序皆最後，可開缺漏來源", async ({ page }) => {
  await load(page, "missing-cogs");
  const table = page.getByTestId("product-table");
  const last = table.locator("tbody tr").last();
  await expect(last).toContainText(panel.costMissing);
  await expect(last).toContainText(panel.deltaMissing);
  // R5-6：資料狀態＝成本未知；其餘三列兩期皆有。小表不收毛利待補的 DTC/A，也不把待補當 0。
  await expect(last.getByRole("rowheader")).toHaveText("A");
  await expect(statusCell(last)).toHaveText(highlight.status.cost_unknown);
  expect((await rowTexts(table)).map(row => row[11])).toEqual([highlight.status.both, highlight.status.both, highlight.status.both, highlight.status.cost_unknown]);
  expect((await rowTexts(page.getByTestId("product-worst"))).map(row => [row[0], row[2]])).toEqual([["B MARKETPLACE", "125.00"], ["B DTC", "200.00"], ["A MARKETPLACE", "280.00"]]);
  expect((await rowTexts(page.getByTestId("product-best"))).map(row => [row[0], row[3]])).toEqual([["A MARKETPLACE", "+10.00"]]);
  await page.getByLabel(panel.sortDirection, { exact: true }).selectOption("descending");
  await expect(last).toContainText(panel.costMissing);
  await last.getByRole("button", { name: deltaTrigger(labels.status.missing) }).click();
  const dialog = page.getByRole("dialog", { name: evidenceDialog });
  await expect(dialog).toContainText("MISSING_COGS");
  await expect(dialog).toContainText(labels.evidence.missingValue);
  await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
  const rows = await downloadComparison(page);
  expect(rows.at(-1)).toMatchObject({ gross_profit_change: "", current_gross_profit: "" });
  expect(rows.at(-1)!.gross_profit_change_reasons).toContain("MISSING_COGS");
});

test("PL-07 真正匯入新進退出零與純退款列，負毛利匯出防公式注入", async ({ page }) => {
  await page.goto("/");
  await openWizard(page);
  const manifest = {
    schema_version: "1.0", dataset_id: "pl07-synthetic-union", source_type: "synthetic", currency: "TWD", timezone: "Asia/Taipei", data_as_of: "2026-08-03", coverage_start: "2026-08-01", coverage_end: "2026-08-02", channels: ["DTC"],
    previous_period: { start: "2026-08-01", end: "2026-08-01" }, current_period: { start: "2026-08-02", end: "2026-08-02" }, sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
  };
  const sales = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + [
    "2026-08-01,DTC,EXIT,@HOME,1,10,0,0,5,TWD", "2026-08-01,DTC,ZERO,@HOME,0,0,0,0,0,TWD",
    "2026-08-02,DTC,ZERO,@HOME,0,0,0,0,0,TWD", "2026-08-02,DTC,ENTER,@HOME,1,50,0,0,10,TWD",
    "2026-08-02,DTC,=1+1,@HOME,0,0,0,100,-40,TWD", "2026-08-02,DTC,MISSING,@HOME,1,1,0,0,,TWD",
  ].join("\n");
  const files = [
    { label: labels.importWizard.files.sales, name: "商品來源.csv", text: sales },
    { label: labels.importWizard.files.costs, name: "channel_costs_daily.csv", text: "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency\n2026-08-01,DTC,0,0,0,0,TWD\n2026-08-02,DTC,0,0,0,0,TWD" },
    { label: labels.importWizard.files.ads, name: "ad_spend_daily.csv", text: "date,channel,ad_spend,currency\n2026-08-01,DTC,0,TWD\n2026-08-02,DTC,0,TWD" },
  ];
  // R3 wizard: step 1 files (the sales file keeps a custom name; headers are standard so step 2 auto-skips), manifest under 「進階」.
  for (const file of files) await wizard(page).getByLabel(file.label, { exact: true }).setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text) });
  for (const [role, file] of [["sales_daily.csv", files[0]], ["channel_costs_daily.csv", files[1]], ["ad_spend_daily.csv", files[2]]] as const) await expect(page.getByTestId(`import-file-${role}`)).toContainText(file.name);
  await setWizardManifest(page, { name: "manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // Step 3: settings come from the manifest; the amount-basis confirmation is now the explicit 「未稅」 choice + the single confirm button.
  await expect(wizard(page).getByLabel(labels.importWizard.datasetName, { exact: true })).toHaveValue(manifest.dataset_id);
  await chooseBasis(page, "exclusive");
  // MISSING has blank cogs_net → still partial (not blocking), so it can be committed.
  await confirmAndCheck(page, "partial");
  await commitWizard(page);
  await dismissSavePrompt(page);
  await page.getByRole("button", { name: labels.nav.products.label, exact: true }).click();
  const table = page.getByTestId("product-table");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const skuRow = (sku: string) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: sku, exact: true }) });
  const exit = skuRow("EXIT");
  // R5-6「資料狀態」：僅上期／僅本期／兩期皆有／成本未知（取代舊的「資料活動」文案）。
  await expect(statusCell(exit)).toHaveText(highlight.status.previous_only);
  await expect(statusCell(skuRow("ENTER"))).toHaveText(highlight.status.current_only);
  await expect(statusCell(skuRow("ZERO"))).toHaveText(highlight.status.both);
  await expect(statusCell(skuRow("MISSING"))).toHaveText(highlight.status.cost_unknown);
  await expect(statusCell(skuRow("=1+1"))).toHaveText(highlight.status.current_only);
  for (const old of [panel.activity.bothObserved, panel.activity.currentOnly, panel.activity.previousOnly]) await expect(table).not.toContainText(old);
  await exit.getByRole("button", { name: deltaTrigger("-5.00") }).click();
  const dialog = page.getByRole("dialog", { name: evidenceDialog });
  // Sales rows show under the default「銷售」tab; manifest rows live under「資料集設定」.
  await expect(dialog).toContainText("商品來源.csv");
  await expect(dialog).toContainText(panel.presence.noRowsConfirmed);
  await sourceTab(dialog, "manifest").click();
  await expect(dialog).toContainText("manifest.json");
  await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("=1+1");
  await expect(table).toContainText("-60.00");
  const rows = await downloadComparison(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ sku: "'=1+1", category: "'@HOME", previous_gross_profit: "0.00", current_gross_profit: "-60.00", gross_profit_change: "-60.00", negative_only: "true", previous_presence: "no_rows_confirmed" });
  expect(rows[0].current_sources).toContain("商品來源.csv");
});

test("PL-07 390px：Top／Bottom 小表在可捲動區塊內，頁面本身不橫向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  for (const [kind, name] of [["worst", highlight.worstAria], ["best", highlight.bestAria]] as const) {
    const region = page.getByTestId(`product-${kind}`).getByRole("region", { name, exact: true });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("tabindex", "0");
    const box = await region.evaluate(element => ({ overflowX: getComputedStyle(element).overflowX, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: element.getBoundingClientRect().right }));
    // 五欄在 390px 放不下：表格比區塊寬，區塊自己可橫向捲動，且區塊不超出視窗。
    expect(["auto", "scroll"]).toContain(box.overflowX);
    expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
    expect(box.right).toBeLessThanOrEqual(390 + 1);
    // 鍵盤可達：聚焦區塊後按右鍵會捲動。
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
