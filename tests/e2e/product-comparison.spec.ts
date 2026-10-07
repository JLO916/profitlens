import { clickReplacing, dismissSavePrompt, navigateTo, openProductColumns, openProductExport, openValidation } from "./replacement-helpers";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardManifest, wizard } from "./import-wizard-helpers";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatCount, formatPeriodL1, formatRateL2, formatSignedDelta } from "../../src/application/presentation";
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
/**
 * V3-2b（§7.8、§8.5）：抽屜標題下的大數字是 L1（差額帶號「−55 元」），下一行 evidence-precise-value 是到分的精確值「−55.00 元」；
 * 組成項目一律 L3 到分、不帶單位（單位在小標「組成（元）」）。
 */
const drawerHeadlineDelta = (delta: string) => formatSignedDelta(delta, "L1");
const drawerPreciseDelta = (delta: string) => fill(labels.units.yuan, { value: formatSignedDelta(delta, "L3") });
/** V3-2b：商品表與小表是 L2——金額整數元（單位只在表頭「（元）」）、差額帶正負號（U+2212）、毛利率一位小數。 */
const deltaL2 = (value: string) => formatSignedDelta(value, "L2");
/** 毛利率 = 毛利 ÷ 淨營收（golden 手算的分子、分母；顯示取位交給 formatRateL2）。 */
const marginL2 = (grossProfit: string, netRevenue: string) => formatRateL2(String(Number(grossProfit) / Number(netRevenue)));
/** V3-2a：狀態列「資料到 {date}」— 以模板組 RegExp，{date} 對應 YYYY-MM-DD（各驗證資料集的 data_as_of 不同）。 */
const readyRe = escape(labels.status.ready).replace(escape("{date}"), "\\d{4}-\\d{2}-\\d{2}");
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
/** V3-2b（§8.5 規則 5）：金額欄的表頭標一次「（元）」（labels.units.yuanColumn），比率與件數欄不標。 */
const yuan = (label: string) => fill(labels.units.yuanColumn, { label });
/** 通路｜SKU｜品類｜本期售出件數｜本期淨營收｜本期商品毛利｜本期毛利率｜商品毛利差額｜淨營收差額｜上期淨營收｜上期商品毛利｜資料狀態 */
const mainColumns = [
  labels.csvColumns.channel, "SKU", labels.csvColumns.category, current(unitsLabel),
  yuan(current(labels.metrics.net_revenue.short)), yuan(current(labels.metrics.gross_profit.short)), current(labels.metrics.gross_margin.short),
  yuan(grossProfitChange), yuan(netRevenueChange), yuan(previous(labels.metrics.net_revenue.label)), yuan(previous(labels.metrics.gross_profit.label)), highlight.columns.dataStatus,
];
/** 「更多欄位」：本期商品成本／折扣／退款，上期售出件數／商品成本／毛利率／折扣／退款。 */
const moreColumns = [
  yuan(current(labels.metrics.cogs_net.short)), yuan(current(labels.metrics.discounts.short)), yuan(current(labels.metrics.refunds.short)),
  previous(unitsLabel), yuan(previous(labels.metrics.cogs_net.short)), previous(labels.metrics.gross_margin.short), yuan(previous(labels.metrics.discounts.short)), yuan(previous(labels.metrics.refunds.short)),
];
/** V3-5（C3）：前 10 名兩表改成 排名｜商品（SKU · 通路）｜本期商品毛利（元）｜差額（元）（labels.products.pageV3.columns）；毛利率改在全表核對。 */
const pageV3 = labels.products.pageV3;
const highlightColumns = [pageV3.columns.rank, pageV3.columns.product, yuan(current(labels.metrics.gross_profit.short)), yuan(pageV3.columns.change)];
/** 小表的列標頭：「{SKU} · {通路}」（通路在 .product-channel 內，分隔號 aria-hidden 但仍在 textContent）。 */
const productHead = (sku: string, channel: string) => `${sku} · ${channel}`;
/** 小表的排名欄（L2 件數格式，1 起算）。 */
const rank = (n: number) => formatCount(n, "L2");
/** V3-5：排序依據與方向合併成一個 select（#product-sort，名稱 labels.products.pageV3.sortLabel），依選項文字選。 */
const sortSelect = (page: Page) => page.getByLabel(pageV3.sortLabel, { exact: true });
/** V3-5：抽屜原始明細的「檔名:行號」（labels.evidence.drawerV3.fileLine）。 */
const fileLine = (line: number, file = "sales_daily.csv") => fill(labels.evidence.drawerV3.fileLine, { file, line });
/** V3-5：工具列右端的筆數句（product-count，aria-live=polite）「顯示 {n} 筆，共 {total} 筆」。 */
const showing = (n: number, total: number) => fill(pageV3.showing, { n: formatCount(n, "L2"), total: formatCount(total, "L2") });
const headerTexts = (table: Locator) => table.locator("thead th").evaluateAll(cells => cells.map(cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim()));
/** 每列儲存格文字（空白壓成一格）；小表的列標頭是「SKU · 通路」。 */
const rowTexts = (root: Locator) => root.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.children].map(cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim())));
/** 全表某列的「資料狀態」欄（主欄第 12 欄）。 */
const statusCell = (row: Locator) => row.locator(":scope > *").nth(mainColumns.length - 1);

async function load(page: Page, id = "golden") {
  await page.goto("/");
  await openValidation(page);
  await page.getByLabel(validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(new RegExp(`${readyRe}|${escape(labels.status.partial)}`));
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  // V3-3：切頁走 navigateTo（桌機側欄；手機底部分頁列「更多」→ 商品毛利）。
  await navigateTo(page, "products");
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
/** V3-5：「下載商品比較 CSV」搬進頁首「匯出本頁」下拉（product-export-menu）；先展開再依原按鈕名稱點。 */
async function downloadComparison(page: Page) {
  const menu = await openProductExport(page);
  const button = menu.getByRole("button", { name: panel.downloadComparisonCsv, exact: true });
  await expect(button).toHaveAttribute("data-testid", "product-export-comparison");
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("profitlens-product-comparison.csv");
  return records(await readFile((await download.path())!, "utf8"));
}

test("PL-07 golden 按毛利下降排序，兩期證據可鍵盤開啟，匯出同範圍", async ({ page }, testInfo) => {
  await load(page);
  const table = page.getByTestId("product-table");
  // V3-5 頁首：描述（取代 v2 eyebrow／「元，未稅」）、範圍副標（golden 本期 8/2、上期 8/1，全部通路，金額未稅）、筆數句。
  await expect(page.getByRole("heading", { level: 1, name: labels.nav.products.label, exact: true }).locator("xpath=following-sibling::p[1]")).toHaveText(pageV3.description);
  const asOf = "2026-08-03";
  await expect(page.getByTestId("product-scope")).toHaveText(fill(pageV3.scope, { current: formatPeriodL1("2026-08-02", "2026-08-02", { days: false, anchor: asOf }), previous: formatPeriodL1("2026-08-01", "2026-08-01", { days: false, anchor: asOf }), channels: labels.shell.periodBar.filter.allChannels }));
  const count = page.getByTestId("product-count");
  await expect(count).toHaveAttribute("aria-live", "polite");
  await expect(count).toHaveText(showing(4, 4));
  // R5-6：欄位重排（件數、毛利率、資料狀態），「更多欄位」預設關閉。
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "false");
  expect(await headerTexts(table)).toEqual(mainColumns);
  // 預設由小到大（先看下降）：MARKETPLACE/B −55、DTC/B −50、MARKETPLACE/A +10、DTC/A +40；四列都是兩期皆有。
  expect((await rowTexts(table)).map(row => [row[0], row[1], row[7], row[11]])).toEqual([
    ["MARKETPLACE", "B", deltaL2("-55.00"), highlight.status.both], ["DTC", "B", deltaL2("-50.00"), highlight.status.both],
    ["MARKETPLACE", "A", deltaL2("10.00"), highlight.status.both], ["DTC", "A", deltaL2("40.00"), highlight.status.both],
  ]);
  for (const old of [panel.activity.bothObserved, panel.activity.currentOnly, panel.activity.previousOnly]) await expect(table).not.toContainText(old);
  // 全表本期商品毛利與毛利率（golden 手算）：本期毛利 = 淨營收 − 成本；毛利率 = 毛利 ÷ 淨營收（V3-5 小表不再有毛利率欄，改在全表核對同一組數字）。
  expect((await rowTexts(table)).map(row => [row[0], row[1], row[5], row[6]])).toEqual([
    ["MARKETPLACE", "B", formatAmountL2("125.00"), marginL2("125", "350")], // 500−100−50=350；350−225=125；125÷350
    ["DTC", "B", formatAmountL2("200.00"), marginL2("200", "360")], // 400−20−20=360；360−160=200；200÷360
    ["MARKETPLACE", "A", formatAmountL2("280.00"), marginL2("280", "640")], // 800−120−40=640；640−360=280；280÷640
    ["DTC", "A", formatAmountL2("540.00"), marginL2("540", "1120")], // 1400−210−70=1120；1120−580=540；540÷1120
  ]);
  // Top／Bottom 小表（golden 手算，同上）：排名｜商品（SKU · 通路）｜本期商品毛利｜商品毛利差額。
  const worst = page.getByTestId("product-worst"), best = page.getByTestId("product-best");
  await expect(worst.getByRole("heading", { level: 4 })).toHaveText(fill(highlight.worstTitle, { n: 10 }));
  await expect(best.getByRole("heading", { level: 4 })).toHaveText(fill(highlight.bestTitle, { n: 10 }));
  expect(await headerTexts(worst)).toEqual(highlightColumns);
  expect(await headerTexts(best)).toEqual(highlightColumns);
  expect(await rowTexts(worst)).toEqual([
    [rank(1), productHead("B", "MARKETPLACE"), formatAmountL2("125.00"), deltaL2("-55.00")],
    [rank(2), productHead("B", "DTC"), formatAmountL2("200.00"), deltaL2("-50.00")],
    [rank(3), productHead("A", "MARKETPLACE"), formatAmountL2("280.00"), deltaL2("10.00")],
    [rank(4), productHead("A", "DTC"), formatAmountL2("540.00"), deltaL2("40.00")],
  ]);
  expect(await rowTexts(best)).toEqual([[rank(1), productHead("A", "DTC"), formatAmountL2("540.00"), deltaL2("40.00")], [rank(2), productHead("A", "MARKETPLACE"), formatAmountL2("280.00"), deltaL2("10.00")]]);
  await expect(worst.getByRole("rowheader")).toHaveText([productHead("B", "MARKETPLACE"), productHead("B", "DTC"), productHead("A", "MARKETPLACE"), productHead("A", "DTC")]);
  await expect(worst.getByRole("region", { name: highlight.worstAria, exact: true })).toHaveAttribute("tabindex", "0");
  await expect(best.getByRole("region", { name: highlight.bestAria, exact: true })).toHaveAttribute("tabindex", "0");
  // 「更多欄位」：開啟後 12 → 20 欄（主欄後接 8 欄），再關回 12 欄。V3-5：按鈕在工具列「欄位」popover 內，先展開。
  const columnsPopover = await openProductColumns(page);
  await expect(columnsPopover.getByTestId("product-more-columns")).toBeVisible();
  await page.getByTestId("product-more-columns").click();
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("thead th")).toHaveCount(mainColumns.length + moreColumns.length);
  expect(await headerTexts(table)).toEqual([...mainColumns, ...moreColumns]);
  await expect(table.locator("tbody tr").first().locator(":scope > *")).toHaveCount(mainColumns.length + moreColumns.length);
  await page.getByTestId("product-more-columns").click();
  await expect(page.getByTestId("product-more-columns")).toHaveAttribute("aria-pressed", "false");
  await expect(table.locator("thead th")).toHaveCount(mainColumns.length);
  // 同一 popover 的列高（F18）：預設標準，切精簡後本頁 data-density 跟著改，再切回標準。
  const density = columnsPopover.getByTestId("product-density");
  await expect(density.getByRole("radio", { name: pageV3.densityStandard, exact: true })).toBeChecked();
  await density.getByRole("radio", { name: pageV3.densityCompact, exact: true }).check();
  await expect(page.locator("section.product-page")).toHaveAttribute("data-density", "compact");
  await density.getByRole("radio", { name: pageV3.densityStandard, exact: true }).check();
  await expect(page.locator("section.product-page")).toHaveAttribute("data-density", "standard");
  // C14：焦點在 popover 內按 Esc 關閉，焦點回到「欄位」觸發器。
  await page.getByTestId("product-more-columns").focus();
  await page.keyboard.press("Escape");
  await expect(columnsPopover).not.toHaveAttribute("open", "");
  await expect(columnsPopover.locator(":scope > summary")).toBeFocused();
  await expect(page.getByTestId("product-more-columns")).toBeHidden();
  await expect(table.locator("tbody tr").first()).toContainText("MARKETPLACE");
  await expect(table.locator("tbody tr").first().getByRole("rowheader")).toHaveText("B");
  // Golden keeps raw channel codes; the 官網／平台 alias applies only to the demo dataset.
  const trigger = table.getByRole("button", { name: fill(panel.deltaEvidenceAria, { channel: "MARKETPLACE", sku: "B", label: grossProfitChange, value: deltaL2("-55.00") }), exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: evidenceDialog });
  await expect(dialog.locator("p.number")).toHaveText(drawerHeadlineDelta("-55.00"));
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(drawerPreciseDelta("-55.00"));
  // V3-5：組成項目改成表格（table.kv.l3，單位只在欄頭）；上期、本期各一列。
  await expect(dialog.locator(".evidence-components h3")).toHaveText(labels.evidence.components);
  await expect(dialog.locator(".evidence-components table.kv.l3 tbody td.num")).toHaveText([formatAmountL3("180.00"), formatAmountL3("125.00")]);
  await expect(dialog).toContainText("2026-08-01");
  await expect(dialog).toContainText("2026-08-02");
  await expect(dialog).toContainText(fileLine(5));
  await expect(dialog).toContainText(fileLine(9));
  await expect(dialog).not.toContainText("ad_spend_daily.csv");
  // V3-9b F10：商品證據不是下鑽，沒有篩選列（evidence-filter 只在趨勢週與通路的抽屜出現）。
  await expect(dialog.getByTestId("evidence-filter")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await sortSelect(page).selectOption({ label: pageV3.sortOptions.grossProfitChangeDescending });
  await expect(sortSelect(page)).toHaveValue("gross_profit_change.descending");
  await expect(table.locator("tbody tr").first()).toContainText("DTC");
  await expect(table.locator("tbody tr").first().getByRole("rowheader")).toHaveText("A");
  await page.getByLabel(labels.csvColumns.category, { exact: true }).selectOption("HOME");
  await page.getByLabel(panel.searchSku, { exact: true }).fill("a");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(count).toHaveText(showing(2, 4));
  const output = await downloadComparison(page);
  expect(output.map(row => [row.channel, row.sku, row.gross_profit_change])).toEqual([["DTC", "A", "40.00"], ["MARKETPLACE", "A", "10.00"]]);
  expect(output.every(row => row.category_filter === "HOME" && row.query === "a" && row.direction === "descending" && row.previous_start === "2026-08-01" && row.current_start === "2026-08-02")).toBe(true);
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  await expect(page.getByRole("button", { name: panel.negativeOnly, exact: true })).toHaveAttribute("aria-pressed", "true");
  // V3-5（C10）：篩選型空狀態＝labels.products.panel.noProducts＋「清除篩選」。
  await expect(page.getByTestId("product-empty")).toContainText(labels.products.panel.noProducts);
  await expect(page.getByTestId("product-clear-filters")).toHaveText(pageV3.clearFilters);
  await expect(count).toHaveText(showing(0, 4));
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-products-${testInfo.project.name}.png`), fullPage: true });
  // 「清除篩選」：品類、搜尋、只看負毛利一起清空，回到全部 4 筆，焦點回到搜尋框。
  await page.getByRole("button", { name: panel.negativeOnly, exact: true }).click();
  await page.getByTestId("product-clear-filters").click();
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(count).toHaveText(showing(4, 4));
  await expect(page.getByLabel(labels.csvColumns.category, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(panel.searchSku, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(panel.searchSku, { exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: panel.negativeOnly, exact: true })).toHaveAttribute("aria-pressed", "false");
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1("255.00"));
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
  expect((await rowTexts(page.getByTestId("product-worst"))).map(row => [row[1], row[2]])).toEqual([[productHead("B", "MARKETPLACE"), formatAmountL2("125.00")], [productHead("B", "DTC"), formatAmountL2("200.00")], [productHead("A", "MARKETPLACE"), formatAmountL2("280.00")]]);
  expect((await rowTexts(page.getByTestId("product-best"))).map(row => [row[1], row[3]])).toEqual([[productHead("A", "MARKETPLACE"), deltaL2("10.00")]]);
  await sortSelect(page).selectOption({ label: pageV3.sortOptions.grossProfitChangeDescending });
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
  // V3-3：切頁走 navigateTo（桌機側欄；手機底部分頁列「更多」→ 商品毛利）。
  await navigateTo(page, "products");
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
  await exit.getByRole("button", { name: deltaTrigger(deltaL2("-5.00")) }).click();
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
  // 「=1+1」本期毛利與差額都是 −60（L2，U+2212）；CSV 仍是 ASCII 到分。
  await expect(skuRow("=1+1").getByRole("button", { name: deltaTrigger(deltaL2("-60.00")) })).toHaveText(deltaL2("-60.00"));
  const rows = await downloadComparison(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ sku: "'=1+1", category: "'@HOME", previous_gross_profit: "0.00", current_gross_profit: "-60.00", gross_profit_change: "-60.00", negative_only: "true", previous_presence: "no_rows_confirmed" });
  expect(rows[0].current_sources).toContain("商品來源.csv");
});

test("PL-07 390px：Top／Bottom 小表改成手機清單，每列主行是商品與本期商品毛利，頁面本身不橫向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  // V3-5（C3）：≤ 767px 時小表以 CSS 重排成清單（DOM 仍是 table，明確的 role=table／row／rowheader／cell 讓 display 改變後語意不變），不再需要橫向捲動。
  // golden 手算（同 PL-07 golden 案例）：本期商品毛利 = 淨營收 − 成本；差額 = 本期 − 上期。
  const expected = {
    worst: [["B", "MARKETPLACE", "125.00", "-55.00"], ["B", "DTC", "200.00", "-50.00"], ["A", "MARKETPLACE", "280.00", "10.00"], ["A", "DTC", "540.00", "40.00"]],
    best: [["A", "DTC", "540.00", "40.00"], ["A", "MARKETPLACE", "280.00", "10.00"]],
  } as const;
  for (const [kind, name] of [["worst", highlight.worstAria], ["best", highlight.bestAria]] as const) {
    const region = page.getByTestId(`product-${kind}`).getByRole("region", { name, exact: true });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("tabindex", "0");
    // 清單不溢出：區塊內容不比區塊寬，區塊也不超出視窗。
    const box = await region.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: element.getBoundingClientRect().right }));
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    expect(box.right).toBeLessThanOrEqual(390 + 1);
    const list = region.getByRole("table");
    await expect(list).toBeVisible();
    // 表頭只給輔助科技（視覺隱藏，欄頭仍可讀）；畫面上的欄名改由每格的 data-label 標示。
    await expect(list.getByRole("columnheader")).toHaveText(highlightColumns);
    expect(await list.locator("thead").evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    const rows = list.locator("tbody").getByRole("row");
    await expect(rows).toHaveCount(expected[kind].length);
    for (const [index, [sku, channel, grossProfit, change]] of expected[kind].entries()) {
      const row = rows.nth(index);
      await expect(row.getByRole("rowheader")).toHaveText(productHead(sku, channel));
      await expect(row.getByRole("cell")).toHaveText([rank(index + 1), formatAmountL2(grossProfit), deltaL2(change)]);
      await expect(row.locator("td[data-list-role='primary']")).toHaveText(formatAmountL2(grossProfit));
      await expect(row.locator("td[data-list-role='secondary']")).toHaveText([rank(index + 1), deltaL2(change)]);
      expect(await row.locator("td[data-list-role='secondary']").evaluateAll(cells => cells.map(cell => cell.getAttribute("data-label")))).toEqual([pageV3.columns.rank, yuan(pageV3.columns.change)]);
      // 主行：商品（列標頭）與本期商品毛利在同一行；排名與差額在下一行。
      const layout = await row.evaluate(tr => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const head = rect(tr.querySelector("th")!), primary = rect(tr.querySelector("td[data-list-role='primary']")!);
        return { head: { top: head.top, bottom: head.bottom }, primary: { top: primary.top, bottom: primary.bottom }, secondary: [...tr.querySelectorAll("td[data-list-role='secondary']")].map(cell => rect(cell).top) };
      });
      expect(layout.primary.top).toBeLessThan(layout.head.bottom);
      expect(layout.primary.bottom).toBeGreaterThan(layout.head.top);
      for (const top of layout.secondary) expect(top).toBeGreaterThanOrEqual(Math.max(layout.head.bottom, layout.primary.bottom) - 1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
