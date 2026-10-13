import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL3, formatSignedDelta, metricDefinitions } from "../../src/application/presentation";
import { PNL_ROWS } from "../../src/application/pnl-table";
import { channelsLabel } from "../../src/application/copy";
import { VARIANT_KPI_METRICS } from "../../src/application/export-variants";
import { closeDownloads, openDownloads, openMeeting } from "./replacement-helpers";
import { exportVersionLineRe, meetingExportItem } from "./meeting-helpers-v3";
import { importFixtureDirectory, loadValidationDataset } from "./breakeven-helpers-v39";
import {
  BOSS_SHEETS, EXPORT_VARIANTS, STANDARD_SHEETS, chooseVariant, columnIndex, downloadFrom, downloadVariantExcel, downloadVariantMarkdown, downloadVariantPptx, endPrint,
  expectPressed, printSurface, printVariant, printedPages, sheetCell, sheetRows, slideParagraphs, slideTexts, slideXml, stubPrint, summaryExportItems, summaryGroup, variantButton, variantCopy, variantPicker,
} from "./variant-helpers-v39";

// V3-9b F14 匯出範本變體（PRD §10.1 F14、§7.9、§9.6、D-V3-8；06_BATCHES V3-9b）：頂欄「匯出」選單「一頁摘要（目前檢視）」分組內的版本切換
// （標準版／老闆一頁版／客戶報告版），以及三個變體的列印／PDF、Excel、PPT 產物；Markdown 與會議頁的「匯出會議」不受影響（一律標準版）。
// 金額一律用 fixtures 的已知值：golden（fixtures/golden/expected.json，上期 2026-08-01、本期 2026-08-02，本期只有一週）
//   淨營收 2,250.00 → 2,470.00；商品毛利 1,200.00 → 1,145.00；扣廣告前貢獻 870.00 → 705.00；扣廣告後貢獻 570.00 → 255.00；
//   三件事（門檻 0）依 |對貢獻影響|：−315.00、−250.00、−150.00。
// refund_only（fixtures/refund_only/expected.json，經匯入精靈帶入）：本期淨營收 −100.00、扣廣告後貢獻 −60.00 → 管理損益表括號負數 (100.00)。

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use) => {
    const events: string[] = [];
    page.on("pageerror", error => events.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") events.push(`console:${message.text()}`); });
    page.on("dialog", dialog => { events.push(`dialog:${dialog.type()}`); void dialog.dismiss(); });
    await use(events);
    expect(events).toEqual([]);
  }, { auto: true }],
});

const summaryCopy = labels.meeting.managerSummary;
const excelSummary = labels.exports.excel.summary;
const summaryColumns = labels.exports.excel.columns.summary;
const actionColumns = labels.exports.excel.columns.actions;
const pnlCopy = labels.overview.pnlV3;
const headerV3 = labels.exports.headerV3;
const GOLDEN_NAME = labels.shell.devValidation.datasets.golden;
const GOLDEN_CHANNELS = ["DTC", "MARKETPLACE"];
/** golden 本期只有一週（2026-08-02）：管理損益表的週欄 id 是週起日。 */
const GOLDEN_WEEK = { start: "2026-08-02", end: "2026-08-02" };
/** 三件事的影響金額（golden，門檻 0）。 */
const GOLDEN_PRIORITY_IMPACTS = ["-315.00", "-250.00", "-150.00"] as const;
/** 客戶報告版版頭的客戶行（資料集名稱＝畫面上的名稱，製表＝品牌名）。 */
const goldenClientLine = fill(variantCopy.clientLine, { client: GOLDEN_NAME, brand: labels.brand.name });
/** D-V3-8：管理損益表（列印、Excel）負數用半形括號 (1,234.00)。 */
const parenAmount = (absolute: string) => fill(variantCopy.negativeParen, { value: formatAmountL3(absolute) });
/** 管理損益表的列名：費用列加「減：」前綴（PNL_ROWS 的固定順序）。 */
const PNL_ROW_LABELS = PNL_ROWS.map(row => row.deduct ? fill(pnlCopy.rowDeduct, { label: metricDefinitions[row.metric].label }) : metricDefinitions[row.metric].label);
const pnlRowIndex = (metric: (typeof PNL_ROWS)[number]["metric"]) => PNL_ROWS.findIndex(row => row.metric === metric);

type Expected = Record<"previous" | "current", Record<string, string>>;
async function goldenExpected(): Promise<Expected> {
  return JSON.parse(await readFile(resolve("fixtures/golden/expected.json"), "utf8")) as Expected;
}
/** 兩個到分的金額字串相減（以分為單位的整數運算），回傳到分字串。 */
const minus = (current: string, previous: string) => {
  const cents = (value: string) => BigInt(value.replace(".", ""));
  const diff = cents(current) - cents(previous);
  const sign = diff < 0n ? "-" : "";
  const abs = (diff < 0n ? -diff : diff).toString().padStart(3, "0");
  return `${sign}${abs.slice(0, -2)}.${abs.slice(-2)}`;
};
/** 總覽「本期一句話」：老闆一頁版的一句話與它同一句（同一份 snapshot）。 */
async function overviewSentence(page: Page) {
  const sentence = (await page.getByTestId("snapshot-sentence").innerText()).trim();
  expect(sentence.length).toBeGreaterThan(0);
  return sentence;
}
/** 列印版面裡是否出現某個標題（列印版在 print media 下可見，用 role 查）。 */
const printHeading = (print: Locator, name: string) => print.getByRole("heading", { name, exact: true });
/** Markdown 版頭第 4 行有產出時間（台北時間到分）：比對內容前把它換成固定字，其他行逐字比較。 */
const normalizeMarkdown = (markdown: string) => {
  const lines = markdown.split("\n");
  expect(lines.filter(line => exportVersionLineRe().test(line))).toHaveLength(1);
  return lines.map(line => exportVersionLineRe().test(line) ? "<version-line>" : line).join("\n");
};
/** Excel 某工作表裡「項目」欄（item）等於 label 的那一列。 */
function summaryRow(rows: unknown[][], label: string) {
  const item = columnIndex(rows[0], summaryColumns.item);
  const matches = rows.filter(row => row[item] === label);
  expect(matches, `摘要工作表應有一列「${label}」`).toHaveLength(1);
  return matches[0];
}

test("a. 版本切換：一頁摘要分組內三顆 aria-pressed 按鈕（預設標準版）、名稱與說明、Tab 順序；選了之後關閉再開仍保持", async ({ page }) => {
  await loadValidationDataset(page, "golden");
  const menu = await openDownloads(page);
  const picker = variantPicker(menu);
  // 分段控制：role=group，以 pickerAria 為名；在「一頁摘要」分組標題之後、PDF 之前，每個按鈕在 DOM 只有一份。
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("role", "group");
  await expect(picker).toHaveAccessibleName(variantCopy.pickerAria);
  await expect(summaryGroup(menu).getByTestId("download-variant-picker")).toHaveCount(1);
  expect(await picker.evaluate(element => ({ previous: element.previousElementSibling?.id ?? "", next: element.nextElementSibling?.querySelector("button")?.getAttribute("aria-labelledby") ?? "" })))
    .toEqual({ previous: "download-group-summary-title", next: "download-pdf-name" });
  await expect(picker.getByRole("button")).toHaveCount(EXPORT_VARIANTS.length);
  for (const [index, variant] of EXPORT_VARIANTS.entries()) {
    const button = variantButton(menu, variant);
    await expect(page.getByTestId(`download-variant-${variant}`)).toHaveCount(1);
    await expect(picker.getByRole("button").nth(index)).toHaveAttribute("data-testid", `download-variant-${variant}`);
    // 可及名稱只取名稱（aria-labelledby）；一行 12px 說明是可及描述（aria-describedby）。
    await expect(button).toHaveAccessibleName(variantCopy.names[variant]);
    await expect(button).toHaveAccessibleDescription(variantCopy.descriptions[variant]);
    await expect(button.locator(".export-variant-name")).toHaveText(variantCopy.names[variant]);
    await expect(button.locator("small")).toHaveText(variantCopy.descriptions[variant]);
    await expect(button).toBeVisible();
  }
  // 預設標準版。
  await expectPressed(menu, "standard");
  // 版本切換不是匯出項目：分組裡的四個匯出項目照舊（PDF、Excel、PPT、會議紀錄 Markdown）。
  await expect(summaryExportItems(menu).locator(".export-item-name")).toHaveText([labels.exports.buttons.exportPdf, labels.exports.buttons.exportExcel, labels.exports.buttons.exportPptx, labels.meeting.page.menuMarkdown]);

  // Tab 順序：目前檢視分組的最後一項 → 標準版 → 老闆一頁版 → 客戶報告版 → 匯出 PDF。
  await menu.getByTestId("download-group-current").locator("button.export-item").last().focus();
  for (const variant of EXPORT_VARIANTS) {
    await page.keyboard.press("Tab");
    await expect(variantButton(menu, variant)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: labels.exports.buttons.exportPdf, exact: true })).toBeFocused();
  // 鍵盤也能切換（按鈕的 Enter／Space）：Shift+Tab 回到客戶報告版按 Space，再回到老闆一頁版按 Enter。
  await page.keyboard.press("Shift+Tab");
  await expect(variantButton(menu, "client")).toBeFocused();
  await page.keyboard.press("Space");
  await expectPressed(menu, "client");
  await page.keyboard.press("Shift+Tab");
  await expect(variantButton(menu, "boss")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectPressed(menu, "boss");
  // 點版本不會關閉選單；關閉再開仍是老闆一頁版。
  await expect(menu).toHaveAttribute("open", "");
  await closeDownloads(page);
  await expect(menu).not.toHaveAttribute("open", "");
  const again = await openDownloads(page);
  await expectPressed(again, "boss");
  // 用滑鼠切回標準版。
  await variantButton(again, "standard").click();
  await expectPressed(again, "standard");
  await closeDownloads(page);
  await expectPressed(await openDownloads(page), "standard");
  await closeDownloads(page);
});

test("b. 老闆一頁版：PDF 只留 L1（一句話、四個關鍵數字、三件事標題與影響金額）A4 一頁；Excel 只有摘要與管理損益表；PPT 一張含一句話與四個數字", async ({ page }) => {
  test.setTimeout(90_000);
  const expected = await goldenExpected();
  await stubPrint(page);
  await loadValidationDataset(page, "golden");
  const sentence = await overviewSentence(page);

  // PDF／列印：article[data-variant=boss]；版頭四行（沒有客戶行、會議一行與範圍一行）。
  const print = await printVariant(page, "boss");
  await expect(print).toHaveAttribute("data-variant", "boss");
  await expect(print.getByTestId("print-header-dataset")).toHaveText(GOLDEN_NAME);
  await expect(print.getByTestId("print-header-client")).toHaveCount(0);
  await expect(print.getByTestId("print-header-meeting")).toHaveCount(0);
  await expect(print.getByTestId("print-header-scope")).toHaveCount(0);
  await expect(print.getByTestId("print-header-version")).toHaveText(exportVersionLineRe());
  // 本期一句話與總覽同一句。
  await expect(print.getByTestId("print-one-liner")).toHaveText(sentence);
  // 四個關鍵數字（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻）：上期／本期／差額都是 L1。
  const kpis = print.getByTestId("print-kpis").locator(":scope > p");
  await expect(kpis).toHaveCount(4);
  await expect(kpis.locator("strong")).toHaveText(VARIANT_KPI_METRICS.map(metric => metricDefinitions[metric].label));
  for (const [index, metric] of VARIANT_KPI_METRICS.entries()) {
    const previous = expected.previous[metric], current = expected.current[metric];
    await expect(kpis.nth(index)).toContainText(fill(summaryCopy.printHeadline, { prev: formatAmountL1(previous), cur: formatAmountL1(current), change: formatSignedDelta(minus(current, previous), "L1") }));
  }
  // 三件事只留標題與影響金額（沒有範圍、下一步與門檻一行）。
  const topThree = print.getByTestId("print-top-three").locator(":scope > li");
  await expect(topThree).toHaveCount(3);
  for (const [index, amount] of GOLDEN_PRIORITY_IMPACTS.entries()) await expect(topThree.nth(index)).toContainText(`${labels.overview.sections.impact} ${formatSignedDelta(amount, "L1")}`);
  await expect(topThree.locator("p")).toHaveCount(0);
  await expect(print).not.toContainText(fill(summaryCopy.printThresholdLine, { amount: formatAmountL3("0.00") }));
  // 沒有通路表、方案與待辦、口徑頁尾，也沒有任何附錄（含每週管理損益表與技術細節）。
  await expect(print.locator("table")).toHaveCount(0);
  await expect(print.locator(":scope > footer")).toHaveCount(0);
  await expect(print.locator(":scope > section")).toHaveCount(0);
  await expect(print.getByTestId("print-appendix-pnl")).toHaveCount(0);
  await expect(printHeading(print, labels.evidence.sections.technicalDetails)).toHaveCount(0);
  await expect(printHeading(print, summaryCopy.printDecisionsHeading)).toHaveCount(0);
  await expect(print).not.toContainText("dataset_hash");
  // A4 剛好一頁。
  expect(await printedPages(page)).toBe(1);
  await endPrint(page);

  // Excel：工作表只有摘要與管理損益表；摘要是版頭四列 → 本期一句話 → 四個關鍵數字 → 三件事（沒有資料範圍與其他常用指標）。
  const book = await downloadVariantExcel(page, "boss");
  expect(book.SheetNames).toEqual(BOSS_SHEETS);
  const rows = sheetRows(book, labels.exports.excel.sheets.summary, true);
  const section = columnIndex(rows[0], summaryColumns.section), detail = columnIndex(rows[0], summaryColumns.detail);
  expect(rows.slice(1, 5).map(row => row[section])).toEqual(Array(4).fill(headerV3.excelSection));
  expect(rows[5][section]).toBe(labels.overview.snapshotUi.heading);
  expect(rows[5][detail]).toBe(sentence);
  const previousColumn = columnIndex(rows[0], summaryColumns.previous, true), currentColumn = columnIndex(rows[0], summaryColumns.current, true), changeColumn = columnIndex(rows[0], summaryColumns.change, true);
  for (const metric of VARIANT_KPI_METRICS) {
    const row = summaryRow(rows, labels.metrics[metric].headline);
    expect(row[section]).toBe(excelSummary.sections.keyDeltas);
    expect([row[previousColumn], row[currentColumn], row[changeColumn]]).toEqual([Number(expected.previous[metric]), Number(expected.current[metric]), Number(minus(expected.current[metric], expected.previous[metric]))]);
  }
  expect(rows.filter(row => row[section] === excelSummary.sections.topThree)).toHaveLength(3);
  expect(rows.map(row => row[section])).not.toContain(excelSummary.sections.scope);
  expect(rows.map(row => row[section])).not.toContain(labels.overview.sections.assistKpis);
  expect(sheetRows(book, variantCopy.pnlSheet)).toHaveLength(PNL_ROWS.length + 1);
  await expect(page.getByTestId("download-menu").locator(":scope > summary")).toBeFocused();

  // PPT：第一張是本期一句話＋四個關鍵數字的標籤；沒有通路表、置頂待辦與資料版本（V4-9a 起多第二張 G1 瀑布，見 f）。
  const slides = await downloadVariantPptx(page, "boss");
  expect(slides).toHaveLength(2);
  const texts = slideTexts(slides[0]);
  expect(texts).toContain(sentence);
  for (const metric of VARIANT_KPI_METRICS) expect(texts).toContain(metricDefinitions[metric].label);
  expect(texts).not.toContain(labels.exports.csv.columns.channel);
  expect(texts).not.toContain(labels.exports.pptx.pinnedTitle);
  expect(texts.join("")).not.toContain(fill(headerV3.pptxDataVersion, { datasetHash: "" }));
  await closeDownloads(page);
});

test("c. 客戶報告版：PDF 版頭多客戶行、沒有技術細節、有每週管理損益表；Excel 八張、待辦沒有內部欄位；PPT 版頭第 2 行是客戶行", async ({ page }) => {
  test.setTimeout(90_000);
  await stubPrint(page);
  await loadValidationDataset(page, "golden");

  // PDF／列印：article[data-variant=client]；客戶行緊接在資料集一行之後。
  const print = await printVariant(page, "client");
  await expect(print).toHaveAttribute("data-variant", "client");
  await expect(print.getByTestId("print-header-dataset")).toHaveText(GOLDEN_NAME);
  await expect(print.getByTestId("print-header-client")).toHaveText(goldenClientLine);
  expect(await print.getByTestId("print-header-client").evaluate(element => element.previousElementSibling?.getAttribute("data-testid"))).toBe("print-header-dataset");
  // 內容同標準版（範圍一行、三件事含下一步、通路表），拿掉技術細節；附錄有每週管理損益表。
  await expect(print.getByTestId("print-header-scope")).toHaveCount(1);
  await expect(print.locator(":scope > ol > li")).toHaveCount(3);
  await expect(print.locator(":scope > table")).toHaveCount(1);
  await expect(printHeading(print, labels.evidence.sections.technicalDetails)).toHaveCount(0);
  await expect(print).not.toContainText("dataset_hash");
  await expect(print.getByTestId("print-appendix-pnl")).toHaveCount(1);
  await expect(print.getByTestId("print-appendix-pnl").getByTestId("print-pnl-table")).toHaveCount(1);
  await expect(print.getByTestId("print-kpis")).toHaveCount(0);
  await expect(print.getByTestId("print-one-liner")).toHaveCount(0);
  await endPrint(page);

  // Excel：七張工作表（同標準版）；摘要版頭五列（第 2 列是客戶行）；沒有會議備註列；待辦沒有「狀態更新日」與「限制」（引用較早資料）兩欄，最後一欄是廣告決策；指標定義沒有技術區。
  const book = await downloadVariantExcel(page, "client");
  expect(book.SheetNames).toEqual(STANDARD_SHEETS);
  const rows = sheetRows(book, labels.exports.excel.sheets.summary);
  const section = columnIndex(rows[0], summaryColumns.section), detail = columnIndex(rows[0], summaryColumns.detail), item = columnIndex(rows[0], summaryColumns.item);
  const headerRows = rows.filter(row => row[section] === headerV3.excelSection);
  expect(headerRows).toHaveLength(5);
  expect(headerRows.map(row => row[detail]).slice(0, 2)).toEqual([GOLDEN_NAME, goldenClientLine]);
  expect(rows.map(row => row[item])).not.toContain(excelSummary.items.notes);
  const actionHeader = sheetRows(book, labels.exports.excel.sheets.actions)[0];
  expect(actionHeader).not.toContain(actionColumns.status_updated_at);
  expect(actionHeader).not.toContain(actionColumns.caution);
  expect(actionHeader.at(-1)).toBe(labels.actions.adDecisionV3.csvColumn);
  expect(sheetRows(book, labels.exports.excel.sheets.actions).flat()).not.toContain(labels.actions.form.staleBadge);
  const basis = sheetRows(book, labels.exports.excel.sheets.basis);
  expect(basis.map(row => row[columnIndex(basis[0], labels.exports.excel.columns.basis.section)])).not.toContain(labels.exports.excel.basis.sections.technical);
  expect(sheetRows(book, variantCopy.pnlSheet)).toHaveLength(PNL_ROWS.length + 1);
  // V4-9b（C34、D-V4-12＝A）：「圖表資料」段落同標準版，但沒有「版本與算法」列；指標定義工作表也不列 B 級版本（spec.appendix.technical）。
  const clientCharts = sheetRows(book, labels.exports.chartsV4.excel.sheet);
  expect(clientCharts[1][0]).toBe(labels.overview.sections.bridge);
  expect(clientCharts.map(row => row[1])).not.toContain(labels.exports.chartsV4.excel.versionRow);
  expect(basis.map(row => row[0])).not.toContain(labels.exports.chartsV4.excel.sheet);

  // PPT：第一張的版頭（標題之後）第 1 行是資料集、第 2 行是客戶行；頁尾沒有資料版本（技術細節）（V4-9a 起多第二張 G1 瀑布，見 f）。
  const slides = await downloadVariantPptx(page, "client");
  expect(slides).toHaveLength(2);
  const paragraphs = slideParagraphs(slides[0]);
  const datasetAt = paragraphs.indexOf(GOLDEN_NAME);
  expect(datasetAt).toBeGreaterThan(0);
  expect(paragraphs[datasetAt + 1]).toBe(goldenClientLine);
  expect(slides[0]).not.toContain(fill(headerV3.pptxDataVersion, { datasetHash: "" }));
  await closeDownloads(page);
});

test("d. 標準版：Excel 八張（最後是管理損益表 13 列、golden 淨營收 2,470.00／扣廣告後貢獻 255.00）、待辦最後一欄廣告決策；PDF 附錄一張每週管理損益表；Markdown 不受版本影響", async ({ page }) => {
  test.setTimeout(90_000);
  await stubPrint(page);
  await loadValidationDataset(page, "golden");

  // Excel：v2 六張＋管理損益表；表頭＝項目、本期每週（週名＋起訖日，金額欄加「（元）」）、合計（元）、佔淨營收 %。
  const book = await downloadVariantExcel(page, "standard");
  expect(book.SheetNames).toEqual(STANDARD_SHEETS);
  const pnl = sheetRows(book, variantCopy.pnlSheet);
  expect(pnl).toHaveLength(PNL_ROWS.length + 1);
  const weekColumn = fill(variantCopy.pnlWeekColumn, { label: fill(pnlCopy.weekLabel.current, { n: 1 }), range: fill(variantCopy.pnlWeekRange, GOLDEN_WEEK) });
  expect(pnl[0]).toEqual([pnlCopy.columns.item, fill(labels.exports.common.moneyColumn, { label: weekColumn }), fill(labels.exports.common.moneyColumn, { label: pnlCopy.columns.total }), pnlCopy.columns.share]);
  expect(pnl.slice(1).map(row => row[0])).toEqual(PNL_ROW_LABELS);
  // 金額格是數字格（可加總）、格式 #,##0.00;(#,##0.00)；顯示到分。
  const totalColumn = 2;
  for (const [metric, value] of [["net_revenue", "2470.00"], ["contribution_after_marketing", "255.00"]] as const) {
    const row = pnlRowIndex(metric) + 1;
    for (const column of [1, totalColumn]) {
      const cell = sheetCell(book, variantCopy.pnlSheet, row, column) as XLSX.CellObject;
      expect(cell.t).toBe("n");
      expect(cell.v).toBe(Number(value));
      expect(cell.w).toBe(formatAmountL3(value));
      expect(cell.z).toBe("#,##0.00;(#,##0.00)");
    }
  }
  // 待辦工作表：v2 的欄位（含狀態更新日與限制）之後，最後一欄是廣告決策。
  const actionHeader = sheetRows(book, labels.exports.excel.sheets.actions)[0];
  expect(actionHeader).toEqual([...Object.values(actionColumns), labels.actions.adDecisionV3.csvColumn]);
  expect(actionHeader.at(-1)).toBe(labels.actions.adDecisionV3.csvColumn);
  // V4-9b（C34、D-V4-12＝A）：「圖表資料」表頭＝區塊、內容；第一段是貢獻變化拆解（標題列是結論句）；每段最後一列「版本與算法」；沒有試算的 G15、G16；
  // 指標定義工作表最後（區塊「圖表資料」）列出用到的 B 級版本（golden 沒有商品毛利為負，沒有 product-pareto-v1）。
  const chartRows = sheetRows(book, labels.exports.chartsV4.excel.sheet);
  expect(chartRows[0].slice(0, 2)).toEqual([labels.exports.excel.columns.basis.section, labels.exports.excel.columns.basis.detail]);
  expect(chartRows[1][0]).toBe(labels.overview.sections.bridge);
  const chartSections = [...new Set(chartRows.slice(1).map(row => row[0]))];
  expect(chartRows.filter(row => row[1] === labels.exports.chartsV4.excel.versionRow)).toHaveLength(chartSections.length);
  expect(chartSections).not.toContain(labels.scenarios.chartsV4.variance.section);
  expect(chartSections).not.toContain(labels.scenarios.chartsV4.threshold.section);
  const basisRows = sheetRows(book, labels.exports.excel.sheets.basis);
  expect(basisRows.filter(row => row[0] === labels.exports.chartsV4.excel.sheet).map(row => row[2])).toEqual(["assist-weeks-v1", "channel-weeks-v1", "channel-structure-v1", "daily-heatmap-v1"]);
  await expect(page.getByTestId("download-menu").locator(":scope > summary")).toBeFocused();

  // PDF／列印：標準版沒有 data-variant；附錄依序是每週管理損益表 → 技術細節；golden 本期一週 → 一張表、13 列，金額到分。
  const print = await printVariant(page, "standard");
  await expect(print).not.toHaveAttribute("data-variant", /.*/);
  await expect(print.getByTestId("print-header-client")).toHaveCount(0);
  const appendix = print.getByTestId("print-appendix-pnl");
  await expect(appendix).toHaveCount(1);
  await expect(printHeading(appendix, variantCopy.pnlHeading)).toBeVisible();
  const tables = appendix.getByTestId("print-pnl-table");
  await expect(tables).toHaveCount(1);
  await expect(tables.locator("caption")).toHaveText(fill(pnlCopy.caption, { granularity: pnlCopy.granularity.week }));
  await expect(tables.locator("tbody > tr")).toHaveCount(PNL_ROWS.length);
  expect(await tables.locator("tbody > tr").evaluateAll(rows => rows.map(row => row.getAttribute("data-row")))).toEqual(PNL_ROWS.map(row => row.metric));
  await expect(tables.locator("tbody > tr > th")).toHaveText(PNL_ROW_LABELS);
  for (const [metric, value] of [["net_revenue", "2470.00"], ["contribution_after_marketing", "255.00"]] as const) {
    for (const column of [GOLDEN_WEEK.start, "total"]) await expect(tables.locator(`tr[data-row=${metric}] > td[data-col="${column}"]`)).toHaveText(formatAmountL3(value));
  }
  await expect(appendix).toContainText(variantCopy.pnlNote);
  await expect(printHeading(print, labels.evidence.sections.technicalDetails)).toHaveCount(1);
  expect(await print.locator(":scope > section").evaluateAll(sections => sections.map(section => section.getAttribute("data-testid")))).toEqual(["print-appendix-pnl", null]);
  await endPrint(page);

  // Markdown（會議紀錄 Markdown）不受版本影響：三個版本下載的內容相同（只差產出時間）。
  const markdown: string[] = [];
  for (const variant of EXPORT_VARIANTS) markdown.push(normalizeMarkdown(await downloadVariantMarkdown(page, variant)));
  expect(markdown[1]).toBe(markdown[0]);
  expect(markdown[2]).toBe(markdown[0]);
  // V4-9b（D-V4-12＝A）：三個選擇都有九項差額表（Markdown 沒有版本之分）。
  for (const output of markdown) expect(output).toContain(`\n## ${labels.overview.sections.bridge}\n\n| ${labels.overview.bridgeV3.table.item} | ${fill(labels.exports.common.moneyColumn, { label: labels.exports.csv.suffix.change })} |\n| --- | ---: |\n| ${labels.overview.bridgeV3.rows.gross_sales} |`);
  await chooseVariant(page, "standard");
  await closeDownloads(page);
});

test("d2. refund_only（匯入）：管理損益表的負數在 Excel 與列印附錄都用半形括號 (100.00)", async ({ page }) => {
  test.setTimeout(120_000);
  await stubPrint(page);
  await importFixtureDirectory(page, "fixtures/refund_only");

  // Excel（標準版）：本期淨營收 −100.00 → 數字格 -100、顯示 (100.00)；扣廣告後貢獻 −60.00 → (60.00)。
  const book = await downloadVariantExcel(page, "standard");
  expect(book.SheetNames).toEqual(STANDARD_SHEETS);
  for (const [metric, value] of [["net_revenue", "100.00"], ["contribution_after_marketing", "60.00"]] as const) {
    const cell = sheetCell(book, variantCopy.pnlSheet, pnlRowIndex(metric) + 1, 2) as XLSX.CellObject;
    expect(cell.t).toBe("n");
    expect(cell.v).toBe(-Number(value));
    expect(cell.w).toBe(parenAmount(value));
    expect(cell.w?.startsWith("(")).toBe(true);
  }

  // 列印附錄：同樣是半形括號，不用 U+2212 也不用全形括號。
  const print = await printVariant(page, "standard");
  const table = print.getByTestId("print-appendix-pnl").getByTestId("print-pnl-table");
  await expect(table).toHaveCount(1);
  for (const [metric, value] of [["net_revenue", "100.00"], ["contribution_after_marketing", "60.00"]] as const) {
    const cell = table.locator(`tr[data-row=${metric}] > td[data-col=total]`);
    await expect(cell).toHaveText(parenAmount(value));
    await expect(cell).toHaveText(/^\(\d/);
  }
  const tableText = await table.innerText();
  expect(tableText).not.toContain("−");
  expect(tableText).not.toContain("（");
  await endPrint(page);
  await closeDownloads(page);
});

test("e. 會議頁「匯出會議」一律是標準版：頂欄選了老闆一頁版後，會議頁的 Excel 工作表與標準版相同、PDF 有技術細節但沒有管理損益表附錄（會議頁數不增加）、PPT 有資料版本", async ({ page }) => {
  test.setTimeout(90_000);
  await stubPrint(page);
  await loadValidationDataset(page, "golden");
  await chooseVariant(page, "boss");
  await closeDownloads(page);

  await openMeeting(page);
  const excel = await downloadFrom(page, await meetingExportItem(page, "excel"));
  expect(excel.download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(XLSX.read(excel.bytes, { type: "buffer" }).SheetNames).toEqual(STANDARD_SHEETS);

  const pptx = await downloadFrom(page, await meetingExportItem(page, "pptx"));
  const [slide] = slideXml(pptx.bytes);
  expect(slide).toContain(fill(headerV3.pptxDataVersion, { datasetHash: "" }));
  expect(slideTexts(slide)).toContain(labels.exports.csv.columns.channel);

  await (await meetingExportItem(page, "pdf")).click();
  const print = printSurface(page);
  await expect(print).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  await expect(print).not.toHaveAttribute("data-variant", /.*/);
  await expect(print.getByTestId("print-header-client")).toHaveCount(0);
  await expect(print.getByTestId("print-kpis")).toHaveCount(0);
  // V3-9b 收尾：會議範圍的列印維持 V3-7 版面、不加每週管理損益表附錄（PRD §7.6 會議 PDF 頁數不增加）。
  await expect(print.getByTestId("print-appendix-pnl")).toHaveCount(0);
  await expect(printHeading(print, labels.evidence.sections.technicalDetails)).toHaveCount(1);
  await expect(print).toContainText(fill(headerV3.printScopeMeeting, { state: labels.meeting.form.decisions.draft, channels: channelsLabel(GOLDEN_CHANNELS, false), mode: labels.shell.periods.sameDays }));
  await endPrint(page);

  // 頂欄的選擇沒有被會議頁改掉：仍是老闆一頁版。
  await expectPressed(await openDownloads(page), "boss");
  await closeDownloads(page);
});

// ── V4-9a 代理 A：C31 PrintChart（PDF 的圖；PRD §5.10、§6.3 C31、§7.7；CHART_CATALOG G1、G2；D-V4-11＝B）。本區塊只放列印圖，PPT 在另一個區塊 ──
// 數值與色碼的逐格比對在 tests/export-variants.test.ts、tests/export-theme.test.ts（SSR）；這裡在真的 print media 下量尺寸、頁數與附錄分頁。
/** CSS px／mm（96 dpi）。 */
const PX_PER_MM = 96 / 25.4;
/** 負號（U+2212），取自格式化函式本身。 */
const PRINT_MINUS = formatSignedDelta("-1.00", "L3").charAt(0);

test("V4-9a C31 列印圖：老闆一頁版只有 G1 且維持 1 頁；標準與客戶版另有附錄一頁（G2＋兩張圖的資料表）；170mm 寬、高 ≤ 60mm、灰階三種填色、不利帶「−」", async ({ page }) => {
  test.setTimeout(150_000);
  await stubPrint(page);
  await loadValidationDataset(page, "golden");
  for (const variant of EXPORT_VARIANTS) {
    const print = await printVariant(page, variant);
    await expect(print.locator("svg[data-print-chart]")).toHaveCount(variant === "boss" ? 1 : 2);
    const bridge = print.locator('svg[data-print-chart="bridge"]');
    await expect(bridge).toHaveCount(1);
    await expect(bridge).toHaveAttribute("width", "170mm");
    await expect(bridge).toHaveAttribute("aria-hidden", "true");
    const box = (await bridge.boundingBox())!;
    expect(Math.abs(box.width - 170 * PX_PER_MM), variant).toBeLessThan(1);
    expect(box.height, variant).toBeLessThanOrEqual(60 * PX_PER_MM);
    // golden 的起訖柱：上期 570.00、本期 255.00（柱上標值 L1）。
    await expect(bridge.locator('text[data-bar="previous"]')).toHaveText(formatAmountL1("570.00"));
    await expect(bridge.locator('text[data-bar="current"]')).toHaveText(formatAmountL1("255.00"));
    // 灰階：同一種樣式同一個填色，三種樣式的填色兩兩不同；只有起訖與小計有外框；不利柱的標值以「−」開頭。
    const bars = await bridge.locator("rect[data-bar]").evaluateAll(rects => rects.map(rect => ({ id: rect.getAttribute("data-bar")!, kind: rect.getAttribute("data-fill")!, fill: rect.getAttribute("fill"), stroke: rect.getAttribute("stroke") })));
    expect(bars, variant).toHaveLength(11);
    const fills = new Map<string, Set<string | null>>();
    for (const bar of bars) {
      fills.set(bar.kind, (fills.get(bar.kind) ?? new Set()).add(bar.fill));
      expect(bar.stroke === null, `${variant} ${bar.id}`).toBe(bar.kind !== "level");
      if (bar.kind === "unfavorable") await expect(bridge.locator(`text[data-bar="${bar.id}"]`)).toHaveText(new RegExp(`^${PRINT_MINUS}`));
    }
    expect([...fills.keys()].sort(), variant).toEqual(["favorable", "level", "unfavorable"]);
    expect([...fills.values()].every(set => set.size === 1), variant).toBe(true);
    expect(new Set([...fills.values()].map(set => [...set][0])).size, variant).toBe(3);
    // 圖例：三個 SVG 記號（列印會清掉 CSS 底色）＋labels 的字。
    await expect(bridge.locator("g[data-legend] > rect")).toHaveCount(3);
    await expect(bridge.locator("g[data-legend] > text")).toHaveText([labels.exports.chartsV4.print.legend.level, labels.format.favorable, labels.format.unfavorable]);
    // 附錄（D-V4-11＝B）：標準與客戶版從新的一頁開始，是列印版面的最後一塊。
    const appendix = print.getByTestId("print-appendix-charts");
    if (variant === "boss") await expect(appendix).toHaveCount(0);
    else {
      await expect(appendix).toHaveCount(1);
      expect(await appendix.evaluate(element => getComputedStyle(element).breakBefore)).toBe("page");
      expect(await print.evaluate(article => article.lastElementChild?.getAttribute("data-testid") ?? "")).toBe("print-appendix-charts");
      await expect(appendix.getByRole("heading", { level: 2, name: labels.exports.chartsV4.print.appendixHeading, exact: true })).toBeVisible();
      await expect(appendix.locator('svg[data-print-chart="profit"]')).toHaveCount(1);
      await expect(appendix.locator("table[data-print-chart-table]")).toHaveCount(2);
      await expect(appendix.locator('table[data-print-chart-table="bridge"] tr[data-row="total"] > td')).toHaveText(formatSignedDelta("-315.00", "L3"));
      await expect(appendix.locator('table[data-print-chart-table="bridge"] tr[data-row="current"] > td')).toHaveText(formatAmountL3("255.00"));
    }
    // 頁數：老闆一頁版維持 1 頁；標準與客戶版是 v3.0.0 的 2 頁再加附錄 1 頁。
    expect(await printedPages(page), variant).toBe(variant === "boss" ? 1 : 3);
    await endPrint(page);
  }
});

test("V4-9a C31 會議範圍的列印：只印 G1、不加圖表附錄（比照管理損益表附錄，PRD §7.6 會議 PDF 頁數不增加）", async ({ page }) => {
  test.setTimeout(90_000);
  await stubPrint(page);
  await loadValidationDataset(page, "golden");
  await openMeeting(page);
  await (await meetingExportItem(page, "pdf")).click();
  const print = printSurface(page);
  await expect(print).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  await expect(print.locator("svg[data-print-chart]")).toHaveCount(1);
  await expect(print.locator('svg[data-print-chart="bridge"]')).toBeVisible();
  await expect(print.getByTestId("print-appendix-charts")).toHaveCount(0);
  await expect(print.getByTestId("print-appendix-pnl")).toHaveCount(0);
  await endPrint(page);
});

// ── V4-9a 代理 B：PPT 第二張 G1 原生瀑布（C32；D-V4-10＝A、D-V4-34＝A、D-V4-37＝A）。列印／PDF（C31）在另一個區塊。 ──
/** pptx 是 zip：SheetJS 內建的 CFB 讀出每個檔（路徑去掉 CFB 的根目錄前綴 → 內容），只用來解析下載的產物。 */
type PptxZip = { FullPaths: string[]; FileIndex: { type: number; content: Uint8Array | number[] }[] };
function pptxFiles(bytes: Buffer): Map<string, Buffer> {
  const deck = (XLSX.CFB as { read(data: Buffer, options: { type: "buffer" }): PptxZip }).read(bytes, { type: "buffer" });
  const files = new Map<string, Buffer>();
  deck.FullPaths.forEach((path, index) => { const entry = deck.FileIndex[index]; if (entry.type === 2) files.set(path.replace(/^Root Entry\//, ""), Buffer.from(entry.content)); });
  return files;
}

test("f. V4-9a PPT（C32）：三個版本都是兩張——第一張的區塊照舊；第二張是 G1 原生瀑布（chart part 1、ppt/media 空、輔助系列名＝labels、標值＝golden 手算的 L1），三個版本的第二張逐字相同", async ({ page }) => {
  test.setTimeout(120_000);
  const golden = JSON.parse(await readFile(resolve("fixtures/golden/expected.json"), "utf8")) as Expected & { bridge: Record<string, string> };
  // 標值（D-V4-37＝A，bars[].display）：上期、九項差額（expected.json 的 bridge，順序同 AMOUNT_FIELDS）、本期；L1、負號 U+2212。
  const deltas = Object.entries(golden.bridge).filter(([key]) => key !== "sum").map(([, value]) => value);
  expect(deltas).toHaveLength(9);
  const displays = [formatAmountL1(golden.previous.contribution_after_marketing), ...deltas.map(value => formatSignedDelta(value, "L1")), formatAmountL1(golden.current.contribution_after_marketing)];
  const series = labels.exports.chartsV4.pptx.series;
  await loadValidationDataset(page, "golden");
  const title = (await page.locator("#bridge-title").innerText()).trim();
  expect(title.length).toBeGreaterThan(0);

  const secondSlides: string[] = [];
  for (const variant of EXPORT_VARIANTS) {
    const menu = await chooseVariant(page, variant);
    const { download, bytes } = await downloadFrom(page, menu.getByRole("button", { name: labels.exports.buttons.exportPptx, exact: true }));
    expect(download.suggestedFilename()).toBe("profitlens-onepager.pptx");
    const files = pptxFiles(bytes);
    expect([...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(), variant).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]);
    const charts = [...files.keys()].filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
    expect(charts, variant).toHaveLength(1);
    expect([...files.entries()].filter(([name, data]) => name.startsWith("ppt/media/") && data.length > 0).map(([name]) => name), variant).toEqual([]);
    const slide1 = files.get("ppt/slides/slide1.xml")!.toString("utf8"), slide2 = files.get("ppt/slides/slide2.xml")!.toString("utf8");
    expect(slide2).not.toContain("<p:pic");

    // 第一張照舊：關鍵數字、三件事、決議；標準與客戶版另有通路表與置頂待辦，老闆一頁版沒有。
    const first = slideTexts(slide1).join("\n");
    for (const value of [labels.overview.sections.keyDeltas, labels.overview.sections.topThree]) expect(first, `${variant}: ${value}`).toContain(value);
    for (const value of [labels.exports.csv.columns.channel, labels.exports.pptx.pinnedTitle, labels.meeting.sections.meetingDecision]) {
      if (variant === "boss") expect(first, `${variant}: ${value}`).not.toContain(value);
      else expect(first, `${variant}: ${value}`).toContain(value);
    }

    // 第二張：標題＝總覽瀑布的結論句；副標有區塊名與單位；之後依序是 11 根柱的標值（沒有 ASCII「-」金額）。
    const texts = slideTexts(slide2);
    expect(texts[0], variant).toBe(title);
    expect(texts[1], variant).toContain(labels.overview.sections.bridge);
    expect(texts[1], variant).toContain(headerV3.unitExclusive);
    expect(texts.slice(2), variant).toEqual(displays);
    expect(texts.filter(text => /^-\d/.test(text)), variant).toEqual([]);
    // 原生圖：四個系列（透明底段、起訖與小計、有利與不利的絕對值）的名稱就是「編輯資料」裡看到的 labels 字串。
    const chartXml = files.get(charts[0])!.toString("utf8");
    expect([...chartXml.matchAll(/<c:ser>[\s\S]*?<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/g)].map(match => match[1]), variant).toEqual([series.base, series.level, series.favorable, series.unfavorable]);
    expect([...files.keys()].filter(name => /^ppt\/embeddings\/.+\.xlsx$/.test(name)), variant).toHaveLength(1);
    secondSlides.push(slide2);
  }
  // 三個版本的第二張逐字相同（數字逐格相同）。
  expect(secondSlides[1]).toBe(secondSlides[0]);
  expect(secondSlides[2]).toBe(secondSlides[0]);
  await chooseVariant(page, "standard");
  await closeDownloads(page);
});
