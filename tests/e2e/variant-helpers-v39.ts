import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { expect, type Download, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { EXPORT_VARIANTS, type ExportVariant } from "../../src/application/export-variants";
import { openDownloads } from "./replacement-helpers";

// V3-9b F14（PRD §10.1 F14、§7.9、§9.6、D-V3-8）匯出範本變體的 E2E 小工具（代理 E2）。共用的 replacement-helpers 不動；這裡只放變體選擇器、
// 列印替身、下載與產物（xlsx／pptx／pdf）解析。

export const variantCopy = labels.exports.variantsV3;
export { EXPORT_VARIANTS, type ExportVariant };

/** V3-9b：Excel 標準版（與客戶報告版）的工作表＝v2 六張＋最後一張「管理損益表」。 */
export const STANDARD_SHEETS = [...Object.values(labels.excelExport.sheets), variantCopy.pnlSheet];
/** 老闆一頁版只有摘要與管理損益表。 */
export const BOSS_SHEETS = [labels.excelExport.sheets.summary, variantCopy.pnlSheet];

/** 「一頁摘要（目前檢視）」分組（role=group）；分組內是版本切換＋四個匯出項目。 */
export const summaryGroup = (menu: Locator) => menu.getByTestId("download-group-summary");
/** 分組內的匯出項目（button.export-item；不含版本切換的三顆 aria-pressed 按鈕）。 */
export const summaryExportItems = (menu: Locator) => summaryGroup(menu).locator("button.export-item");
/** 版本切換（div.ui-segmented[role=group] data-testid download-variant-picker）。 */
export const variantPicker = (menu: Locator) => menu.getByTestId("download-variant-picker");
export const variantButton = (menu: Locator, variant: ExportVariant) => menu.getByTestId(`download-variant-${variant}`);

/** 打開頂欄「匯出」選單（手機先展開 topbar-more），點選版本並確認只有它 aria-pressed=true；回傳展開後的選單。 */
export async function chooseVariant(page: Page, variant: ExportVariant): Promise<Locator> {
  const menu = await openDownloads(page);
  await variantButton(menu, variant).click();
  await expectPressed(menu, variant);
  return menu;
}
/** 三顆版本按鈕中只有 variant 是 aria-pressed=true。 */
export async function expectPressed(menu: Locator, variant: ExportVariant) {
  for (const other of EXPORT_VARIANTS) await expect(variantButton(menu, other)).toHaveAttribute("aria-pressed", String(other === variant));
}

/** 只替換會擋住流程的系統列印對話框（記錄呼叫次數）；列印版面與 print media 樣式照常運作。要在第一次 goto 之前呼叫。 */
export async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __v39PrintCalls: number };
    w.__v39PrintCalls = 0;
    window.print = () => { w.__v39PrintCalls++; };
  });
}
export const printCalls = (page: Page) => page.evaluate(() => (window as unknown as { __v39PrintCalls: number }).__v39PrintCalls);
export const printSurface = (page: Page) => page.getByTestId("manager-summary-print");

/** 選版本 → 「匯出 PDF」：選單關閉、列印版面掛上、window.print() 多呼叫一次；切到 print media 後回傳列印版面。 */
export async function printVariant(page: Page, variant: ExportVariant): Promise<Locator> {
  const before = await printCalls(page);
  const menu = await chooseVariant(page, variant);
  await menu.getByRole("button", { name: labels.buttons.exportPdf, exact: true }).click();
  await expect(menu).not.toHaveAttribute("open", "");
  await expect.poll(() => printCalls(page)).toBe(before + 1);
  const print = printSurface(page);
  await expect(print).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeVisible();
  return print;
}
/** 回到畫面：page.pdf() 已觸發 afterprint；再送一次只是保險。列印版面移除。 */
export async function endPrint(page: Page) {
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(printSurface(page)).toHaveCount(0);
}
/** A4 PDF 的頁數（/Type /Page，不含 /Pages）。 */
export const pdfPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
/** 目前的 print media 版面印成 A4 PDF，回傳頁數。 */
export async function printedPages(page: Page): Promise<number> {
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  return pdfPages(pdf);
}

/** 點按鈕並等下載，回傳下載與內容。 */
export async function downloadFrom(page: Page, button: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return { download, bytes: await readFile((await download.path())!) };
}
/** 選版本後從頂欄「匯出」下載 Excel（profitlens.xlsx），回傳活頁簿（cellNF：保留數字格式，讀得到 .z 與格式化後的 .w）。 */
export async function downloadVariantExcel(page: Page, variant: ExportVariant): Promise<XLSX.WorkBook> {
  const menu = await chooseVariant(page, variant);
  const { download, bytes } = await downloadFrom(page, menu.getByRole("button", { name: labels.buttons.exportExcel, exact: true }));
  expect(download.suggestedFilename()).toBe("profitlens.xlsx");
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  return XLSX.read(bytes, { type: "buffer", cellNF: true });
}
/** 選版本後從頂欄「匯出」下載 PPT（profitlens-onepager.pptx），回傳每張投影片的 XML。 */
export async function downloadVariantPptx(page: Page, variant: ExportVariant): Promise<string[]> {
  const menu = await chooseVariant(page, variant);
  const { download, bytes } = await downloadFrom(page, menu.getByRole("button", { name: labels.buttons.exportPptx, exact: true }));
  expect(download.suggestedFilename()).toBe("profitlens-onepager.pptx");
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  return slideXml(bytes);
}
/** 選版本後從頂欄「匯出」下載「會議紀錄 Markdown」（profitlens-manager-summary.md；不受版本影響）。 */
export async function downloadVariantMarkdown(page: Page, variant: ExportVariant): Promise<string> {
  const menu = await chooseVariant(page, variant);
  const { download, bytes } = await downloadFrom(page, menu.getByRole("button", { name: labels.meetingPage.menuMarkdown, exact: true }));
  expect(download.suggestedFilename()).toBe("profitlens-manager-summary.md");
  return bytes.toString("utf8");
}

/** 工作表的所有列（表頭列在第 0 列）；raw=false 時是 Excel 顯示的文字（套數字格式後）。 */
export const sheetRows = (book: XLSX.WorkBook, name: string, raw = false) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw, defval: "" });
/** 表頭列裡某欄的位置：金額欄的表頭是「{label}（元）」（labels.ui.export.moneyColumn）。 */
export const columnIndex = (header: unknown[], label: string, moneyColumn = false) => header.indexOf(moneyColumn ? fill(labels.ui.export.moneyColumn, { label }) : label);
/** 工作表某列某欄的儲存格（0 起算；列 0 是表頭）。 */
export function sheetCell(book: XLSX.WorkBook, name: string, row: number, column: number): XLSX.CellObject | undefined {
  return book.Sheets[name][XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
}

/** pptx 是 zip；SheetJS 內建的 CFB 也能讀 zip（只用來解析下載的產物）。回傳每張投影片的 XML。 */
type Zip = { FullPaths: string[] };
const zip = XLSX.CFB as { read(data: Buffer, options: { type: "buffer" }): Zip; find(container: Zip, path: string): { content: Uint8Array | number[] } | null };
export function slideXml(bytes: Buffer): string[] {
  const deck = zip.read(bytes, { type: "buffer" });
  return deck.FullPaths.filter(path => /ppt\/slides\/slide\d+\.xml$/.test(path)).map(path => Buffer.from(zip.find(deck, path)!.content).toString("utf8"));
}
const XML_ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": "\"", "&apos;": "'" };
/** 投影片 XML 裡依序的每個文字段（<a:t>，實體已還原）。 */
export function slideTexts(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1].replace(/&(lt|gt|amp|quot|apos);/g, entity => XML_ENTITIES[entity]));
}
/** 投影片 XML 裡依序的段落（<a:p>）文字：同一段的各文字段接起來；空段落略過。 */
export function slideParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(match => slideTexts(match[1]).join("")).filter(Boolean);
}
