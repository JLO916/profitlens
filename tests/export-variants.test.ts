import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, createRef, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, setAdDecision, type ActionWorkspace } from "@/application/action-workspace";
import { buildExcelWorkbook, EXCEL_NUMBER_FORMATS, excelHeader, writeExcel, type ExcelCell, type ExcelSheet, type ExcelWorkbook } from "@/application/excel-export";
import { buildExportHeader, clientHeaderLine } from "@/application/export-header";
import { DEFAULT_EXPORT_VARIANT, EXPORT_VARIANTS, variantHeaderLines, variantKpis, variantOneLiner, variantSpec, type ExportVariant } from "@/application/export-variants";
import { buildManagerSummary, type ManagerSummary, type SummaryDecisionContext } from "@/application/manager-summary";
import { buildPnlTable, pnlExportAmount, pnlExportShare, pnlExportTable, PNL_ROWS } from "@/application/pnl-table";
import { buildPptxOnePager, writePptx, type PptxOnePager } from "@/application/pptx-export";
import { formatAmountL1, formatAmountL3, formatPeriodExport, formatRateL3, formatSignedDelta, metricDefinitions, MINUS } from "@/application/presentation";
import type { TaxConversion } from "@/application/tax-basis";
import { snapshotSentence } from "@/application/weekly-summary";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { compareProducts } from "@/domain/product-comparison";
import type { Dataset, DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { PrintSummary } from "../src/components/print-summary";
import { ExportMenu, type ExportMenuProps, type ExportMenuSource } from "../src/components/shell/export-menu";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";
import baseline from "./fixtures/export-numeric-baseline.json";
import { excelNumerics } from "./helpers/export-numeric";
import { FIXED_GENERATED_AT, normalizeWorkbook } from "./helpers/export-normalize";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { readZip, zipText } from "./helpers/zip";

/*
 * V3-9b F14 匯出範本變體（PRD §10.1 F14、§7.9、§6.5、§9.6；D-V3-8）＋F9 管理損益表進匯出＋F13 廣告決策進 Excel 待辦工作表。
 * 規則一處定義（src/application/export-variants.ts 的 variantSpec），列印／PDF、Excel、PPT 三個管線都讀它：
 * - standard（標準版）：現況；只多「每週管理損益表」（列印附錄、Excel 最後一張工作表）與 Excel 待辦工作表最後的「廣告決策」欄。去掉新增內容後與 V3-9a 逐字相同。
 * - boss（老闆一頁版）：只留 L1——版頭四行、本期一句話、四個關鍵數字（本期／上期／差額）、三件事的標題與影響金額、決議一行（有會議時）。
 *   Excel 只有「摘要」與「管理損益表」兩張；PPT 一張；列印一頁（不放附錄）。
 * - client（客戶報告版）：標準版＋版頭第 1 行之後的客戶行；拿掉內部備註（決策備註、待辦進度紀錄、引用歷史）與技術細節，附每週管理損益表。
 * 數值一律來自同一個 ManagerSummary／snapshot：變體的每個數字格都在標準版同一格（老闆一頁版的商品毛利與扣廣告前貢獻在分析 CSV 的期間合計列）。
 * 期待值由 labels、fill 與 presentation 的格式化函式組出（golden：本期淨營收 2470.00、扣廣告後貢獻 255.00、差額 −315.00）。
 */

const variants = labels.exports.variantsV3;
const sheetNames = labels.excelExport.sheets;
const STANDARD_SHEETS = [sheetNames.summary, sheetNames.channels, sheetNames.bridge, sheetNames.products, sheetNames.actions, sheetNames.basis, variants.pnlSheet];
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const cellValue = (cell: ExcelCell) => cell.kind === "null" ? null : cell.value;
const sheetNamed = (workbook: ExcelWorkbook, name: string) => workbook.sheets.find(sheet => sheet.name === name)!;
/** 以表頭（labels 字串）取格子的值。 */
const records = (sheet: ExcelSheet) => sheet.rows.map(row => Object.fromEntries(sheet.header.map((header, index) => [header, cellValue(row[index])])));
const TAX: TaxConversion = { basis: "inclusive", rate: "0.05", fields: ["gross_sales", "discounts"], rows_converted: 12 };
const MEETING = { name: "十月例會", date: "2026-10-03", decision: "adopted", notes: "內部備註不給客戶" };

type Loaded = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; summary: ManagerSummary };
async function load(name: string, conversion: TaxConversion | null = null): Promise<Loaded> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  return { input, dataset, snapshot, summary: buildManagerSummary(snapshot, { conversion }) };
}
let golden: Loaded, demo: Loaded, refundOnly: Loaded;
/** golden 的兩筆待辦：a1 引用健檢結果、置頂、進行中、標了「加碼」；a2 沒標、引用較早資料（另一個 dataset）時才有提醒。 */
let actions: ActionWorkspace;
beforeAll(async () => {
  [golden, demo, refundOnly] = await Promise.all([load("golden"), load("demo"), load("refund_only")]);
  const source = { input: golden.input, dataset: golden.dataset, snapshot: golden.snapshot, revision: 1 };
  const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  actions = addActionDraft(emptyActionWorkspace(), source, "a1", diagnostic.id);
  actions = addActionDraft(actions, source, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  actions = setAdDecision(actions, "a1", "increase");
});
const workbook = (source: Loaded, variant: ExportVariant | undefined, extra: Partial<Parameters<typeof buildExcelWorkbook>[0]> = {}) => buildExcelWorkbook({
  variant, summary: source.summary, snapshot: source.snapshot, dataset: source.dataset, actions, products: compareProducts(source.dataset, source.snapshot.report.scope).rows, meeting: MEETING, generatedAt: FIXED_GENERATED_AT, datasetName: "店", ...extra,
});

describe("variantSpec：三個變體的規則只定義一次", () => {
  it("標準版是預設；三個變體依序；不認得的值當標準版", () => {
    expect(EXPORT_VARIANTS).toEqual(["standard", "boss", "client"]);
    expect(DEFAULT_EXPORT_VARIANT).toBe("standard");
    expect(variantSpec()).toBe(variantSpec("standard"));
    expect(variantSpec("nope" as ExportVariant)).toBe(variantSpec("standard"));
    for (const variant of EXPORT_VARIANTS) expect(variantSpec(variant).variant).toBe(variant);
  });

  it("標準版全留＋管理損益表；老闆一頁版只留 L1；客戶報告版加客戶行、拿掉內部備註與技術細節、附管理損益表", () => {
    const [standard, boss, client] = EXPORT_VARIANTS.map(variant => variantSpec(variant));
    expect(standard.header.clientLine).toBe(false);
    expect(Object.values(standard.internal).every(Boolean)).toBe(true);
    expect(Object.values(standard.appendix).every(Boolean)).toBe(true);
    expect(standard.sections).toMatchObject({ oneLiner: false, kpis: "headlines", scope: true, priorityDetail: true, assist: true, channels: true, decisions: true, footer: true });
    expect(boss.sections).toEqual({ oneLiner: true, kpis: "four", scope: false, priorityDetail: false, assist: false, channels: false, decisions: false, footer: false });
    expect(Object.values(boss.appendix).some(Boolean)).toBe(false);
    expect(boss.excelSheets).toEqual(["summary", "pnl"]);
    expect(client.header.clientLine).toBe(true);
    expect(client.sections).toEqual(standard.sections);
    expect(client.internal).toEqual({ decisionNotes: false, actionProgress: false, citationHistory: false });
    expect(client.appendix).toEqual({ assumptions: true, notes: false, otherActions: true, pnl: true, technical: false });
    expect(client.excelSheets).toEqual(standard.excelSheets);
    expect(standard.excelSheets.at(-1)).toBe("pnl");
  });

  it("版頭：客戶行在第 1 行之後（客戶：資料集名稱 · 製表：EC ProfitLens），其他行不變", () => {
    const header = buildExportHeader({ datasetName: "店", scope: { previous: golden.summary.scope.previous_period, current: golden.summary.scope.current_period }, metricVersion: "contribution-v1", generatedAt: FIXED_GENERATED_AT });
    expect(clientHeaderLine(header)).toBe(fill(variants.clientLine, { client: "店", brand: labels.brand.name }));
    expect(clientHeaderLine(header)).toBe(`客戶：店 · 製表：${labels.brand.name}`);
    expect(variantHeaderLines(header, variantSpec("standard"))).toEqual(header.lines);
    expect(variantHeaderLines(header, variantSpec("boss"))).toEqual(header.lines);
    expect(variantHeaderLines(header, variantSpec("client"))).toEqual([header.lines[0], clientHeaderLine(header), ...header.lines.slice(1)]);
  });

  it("四個關鍵數字：淨營收與扣廣告後貢獻就是 summary.headlines；商品毛利與扣廣告前貢獻取同一個 snapshot（golden 手算）", () => {
    const kpis = variantKpis(golden.summary, golden.snapshot.report);
    expect(kpis.map(row => row.metric)).toEqual(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"]);
    expect(kpis.map(row => [row.previous.value, row.current.value, row.change.value])).toEqual([["2250.00", "2470.00", "220.00"], ["1200.00", "1145.00", "-55.00"], ["870.00", "705.00", "-165.00"], ["570.00", "255.00", "-315.00"]]);
    expect(kpis[0].current).toBe(golden.summary.headlines[0].current);
    expect(kpis[3].change).toBe(golden.summary.headlines[1].change);
    // 沒有 report 時只回 headlines 的兩個（不猜）。
    expect(variantKpis(golden.summary).map(row => row.metric)).toEqual(["net_revenue", "contribution_after_marketing"]);
    // 本期一句話與總覽同一句（snapshotSentence，摘要的門檻）。
    expect(variantOneLiner(golden.summary, golden.snapshot)).toBe(snapshotSentence(golden.snapshot, { importanceThreshold: golden.summary.importance_threshold }).text);
  });
});

describe("Excel：三個變體的工作表與列", () => {
  it("標準版：六張既有工作表＋管理損益表；去掉新增內容後與 V3-7 正規化基準相同的工作表（新增的只有管理損益表與廣告決策欄）", () => {
    const standard = workbook(golden, "standard");
    expect(standard.sheets.map(sheet => sheet.name)).toEqual(STANDARD_SHEETS);
    expect(workbook(golden, undefined)).toEqual(standard);
    const normalized = normalizeWorkbook(standard);
    expect(normalized.sheets.map(sheet => sheet.name)).toEqual(STANDARD_SHEETS.slice(0, -1));
    expect(sheetNamed(normalized, sheetNames.actions).header).toEqual(Object.values(labels.excelExport.columns.actions).map((label, index) => excelHeader(label, sheetNamed(normalized, sheetNames.actions).formats![index])));
    // 摘要：版頭四列、資料範圍、兩個關鍵數字、其他常用指標、三件事、會議四列（含備註）。
    const summary = records(sheetNamed(standard, sheetNames.summary));
    expect(summary).toHaveLength(4 + 7 + 2 + 1 + 3 + 4);
    expect(summary.some(row => row[labels.excelExport.columns.summary.detail] === MEETING.notes)).toBe(true);
  });

  it("老闆一頁版：只有摘要與管理損益表；摘要＝版頭四列、本期一句話、四個關鍵數字、三件事（標題與影響金額）、決議一列", () => {
    const boss = workbook(golden, "boss");
    expect(boss.sheets.map(sheet => sheet.name)).toEqual([sheetNames.summary, variants.pnlSheet]);
    const columns = labels.excelExport.columns.summary;
    const s = labels.excelExport.summary;
    const sheet = sheetNamed(boss, sheetNames.summary);
    expect(sheet.header).toEqual(sheetNamed(workbook(golden, "standard"), sheetNames.summary).header);
    const rows = records(sheet);
    expect(rows.map(row => row[columns.section])).toEqual([
      ...Array(4).fill(labels.exports.headerV3.excelSection), labels.overview.snapshotUi.heading, ...Array(4).fill(s.sections.keyDeltas), ...Array(3).fill(s.sections.topThree), s.sections.meeting,
    ]);
    expect(rows[4][columns.detail]).toBe(variantOneLiner(golden.summary, golden.snapshot));
    // 金額欄的表頭加「（元）」（excelHeader）。
    const money = (label: string) => excelHeader(label, "money_l2");
    expect(rows.slice(5, 9).map(row => [row[columns.item], row[money(columns.previous)], row[money(columns.current)], row[money(columns.change)]])).toEqual([
      [labels.metrics.net_revenue.label, 2250, 2470, 220], [labels.metrics.gross_profit.label, 1200, 1145, -55],
      [labels.metrics.contribution_before_marketing.label, 870, 705, -165], [labels.metrics.contribution_after_marketing.label, 570, 255, -315],
    ]);
    // 三件事只有標題與影響金額，沒有範圍與下一步。
    expect(rows.slice(9, 12).map(row => [row[columns.item], row[money(columns.impact)], row[columns.scope], row[columns.detail]])).toEqual(golden.summary.priorities.map((item, index) => [fill(s.priorityItem, { n: index + 1, headline: item.title }), Number(item.impact!.value), null, null]));
    expect(rows[12]).toMatchObject({ [columns.item]: s.items.decision, [columns.detail]: labels.meeting.decisions.adopted });
    // 不放資料範圍、其他常用指標（損益兩平 MER）、會議名稱與備註。
    const all = JSON.stringify(rows);
    for (const text of [s.sections.scope, labels.overview.sections.assistKpis, labels.assist.breakevenV3.label, MEETING.notes, MEETING.name]) expect(all, text).not.toContain(text);
    // 沒有會議時沒有決議列。
    expect(records(sheetNamed(workbook(golden, "boss", { meeting: null }), sheetNames.summary))).toHaveLength(12);
  });

  it("客戶報告版：版頭第 2 列是客戶行；會議不列備註；待辦拿掉狀態更新日與引用較早資料兩欄（廣告決策仍在最後）；指標定義不放技術細節", () => {
    const client = workbook(golden, "client");
    expect(client.sheets.map(sheet => sheet.name)).toEqual(STANDARD_SHEETS);
    const columns = labels.excelExport.columns.summary;
    const summary = records(sheetNamed(client, sheetNames.summary));
    expect(summary.slice(0, 5).map(row => row[columns.detail])).toEqual(["店", fill(variants.clientLine, { client: "店", brand: labels.brand.name }), fill(labels.exports.headerV3.reportTitle, { metric: metricDefinitions.contribution_after_marketing.label }), expect.any(String), expect.any(String)]);
    expect(summary).toHaveLength(5 + 7 + 2 + 1 + 3 + 3);
    expect(JSON.stringify(summary)).not.toContain(MEETING.notes);
    const actionsSheet = sheetNamed(client, sheetNames.actions);
    const actionColumns = labels.excelExport.columns.actions;
    expect(actionsSheet.header).toEqual([...Object.entries(actionColumns).filter(([key]) => key !== "status_updated_at" && key !== "caution").map(([, label]) => label), labels.actions.adDecisionV3.csvColumn]);
    expect(actionsSheet.rows).toHaveLength(2);
    const basis = records(sheetNamed(client, sheetNames.basis));
    expect(basis.some(row => row[labels.excelExport.columns.basis.section] === labels.excelExport.basis.sections.technical)).toBe(false);
    expect(JSON.stringify(basis)).not.toContain(golden.snapshot.dataset_hash);
    expect(basis.filter(row => row[labels.excelExport.columns.basis.section] === labels.excelExport.basis.sections.basis)).toHaveLength(labels.basis.items.length + 1);
    // 其餘工作表（通路、拆解、商品、管理損益表）與標準版逐格相同。
    const standard = workbook(golden, "standard");
    for (const name of [sheetNames.channels, sheetNames.bridge, sheetNames.products, variants.pnlSheet]) expect(sheetNamed(client, name), name).toEqual(sheetNamed(standard, name));
  });

  it("§6.5 數值逐格相同：變體的每個數字格都在標準版同一格；老闆一頁版多的兩個關鍵數字等於分析 CSV 的期間合計", () => {
    const standard = excelNumerics(workbook(golden, "standard"));
    for (const variant of ["boss", "client"] as const) {
      const numbers = excelNumerics(workbook(golden, variant));
      const extra = Object.keys(numbers).filter(key => !(key in standard));
      for (const key of Object.keys(numbers).filter(key => key in standard)) expect(numbers[key], `${variant} ${key}`).toBe(standard[key]);
      if (variant === "client") expect(extra).toEqual([]);
      else {
        expect(extra.sort()).toEqual([labels.metrics.gross_profit.label, labels.metrics.contribution_before_marketing.label].flatMap(metric => [labels.periods.previous, labels.periods.current, labels.excelExport.columns.summary.change].map(column => `${sheetNames.summary}|${labels.excelExport.summary.sections.keyDeltas}|${metric}|${excelHeader(column, "money_l2")}`)).sort());
        const csv = baseline.snapshot_csv as Record<string, { value: string }>;
        for (const metric of ["gross_profit", "contribution_before_marketing"] as const) {
          const key = (column: string) => numbers[`${sheetNames.summary}|${labels.excelExport.summary.sections.keyDeltas}|${labels.metrics[metric].label}|${excelHeader(column, "money_l2")}`];
          expect(key(labels.periods.previous), metric).toBe(String(Number(csv[`period_summary|previous||${metric}|2026-08-01|2026-08-01`].value)));
          expect(key(labels.periods.current), metric).toBe(String(Number(csv[`period_summary|current||${metric}|2026-08-02|2026-08-02`].value)));
        }
      }
    }
    // export-numeric 基準（只新增）：三個變體的數字格投影。
    expect(excelNumerics(buildExcelWorkbook({ variant: "standard", summary: golden.summary, snapshot: golden.snapshot, dataset: golden.dataset, actions: emptyActionWorkspace(), products: compareProducts(golden.dataset, golden.snapshot.report.scope).rows, generatedAt: FIXED_GENERATED_AT }))).toEqual(baseline.excel_variants.standard);
  });
});

describe("Excel：管理損益表工作表（D-V3-8：#,##0.00;(#,##0.00)、0.00%）", () => {
  it("golden：13 列（「減：」前綴、零值列也列出）× 項目＋1 週＋合計＋佔淨營收 %；數值＝buildPnlTable 的字串", () => {
    const table = buildPnlTable(golden.snapshot, "week");
    const sheet = sheetNamed(workbook(golden, "standard"), variants.pnlSheet);
    const pnl = labels.overview.pnlV3;
    const week = table.columns[0];
    expect(table.columns).toHaveLength(1);
    expect(sheet.header).toEqual([pnl.columns.item, fill(labels.ui.export.moneyColumn, { label: fill(variants.pnlWeekColumn, { label: week.label, range: fill(variants.pnlWeekRange, { start: week.period.start, end: week.period.end }) }) }), fill(labels.ui.export.moneyColumn, { label: pnl.columns.total }), pnl.columns.share]);
    expect(sheet.formats).toEqual([null, "money_paren", "money_paren", "ratio"]);
    expect(sheet.rows).toHaveLength(13);
    expect(sheet.rows.map(row => cellValue(row[0]))).toEqual(PNL_ROWS.map(row => row.deduct ? fill(pnl.rowDeduct, { label: metricDefinitions[row.metric].label }) : metricDefinitions[row.metric].label));
    expect(sheet.rows.map(row => row.slice(1).map(cellValue))).toEqual(table.rows.map(row => [Number(row.cells[0].metric.value), Number(row.total.metric.value), Number(row.share.value)]));
    const byMetric = Object.fromEntries(table.rows.map((row, index) => [row.metric, sheet.rows[index].map(cellValue)]));
    expect(byMetric.net_revenue.slice(1, 3)).toEqual([2470, 2470]);
    expect(byMetric.contribution_after_marketing.slice(1, 3)).toEqual([255, 255]);
    expect(table.rows.find(row => row.metric === "net_revenue")!.total.metric.value).toBe("2470.00");
    expect(table.rows.find(row => row.metric === "contribution_after_marketing")!.total.metric.value).toBe("255.00");
    // pnlExportTable 只是加上列名與欄名，表本身就是 buildPnlTable 的輸出。
    expect(pnlExportTable(golden.snapshot).table).toEqual(table);
  });

  it("demo：6 週；每一列各週相加＝合計（到分）", () => {
    const table = buildPnlTable(demo.snapshot, "week");
    const sheet = sheetNamed(workbook(demo, "standard"), variants.pnlSheet);
    expect(table.columns).toHaveLength(6);
    expect(sheet.header).toHaveLength(1 + 6 + 2);
    sheet.rows.forEach((row, index) => {
      const cents = (cell: ExcelCell) => BigInt(Math.round((cellValue(cell) as number) * 100));
      expect(row.slice(1, 7).map(cents).reduce((sum, value) => sum + value, 0n), PNL_ROWS[index].metric).toBe(cents(row[7]));
    });
  });

  it("refund_only：淨營收為負——數字格仍是 −100，顯示格式是括號 (100.00)；淨營收 ≤ 0 時佔淨營收 % 是空格；寫出後讀回顯示相同、表頭凍結", async () => {
    const book = workbook(refundOnly, "standard");
    const sheet = sheetNamed(book, variants.pnlSheet);
    const net = sheet.rows[PNL_ROWS.findIndex(row => row.metric === "net_revenue")];
    expect(net.map(cellValue)).toEqual([labels.metrics.net_revenue.label, -100, -100, null]);
    expect(EXCEL_NUMBER_FORMATS.money_paren).toBe("#,##0.00;(#,##0.00)");
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money_paren, -100)).toBe("(100.00)");
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money_paren, 2470)).toBe("2,470.00");
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money_paren, 0)).toBe("0.00");
    // 與列印的括號格式同一個字串。
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money_paren, -1234567.8)).toBe(pnlExportAmount({ value: "-1234567.80", reason_codes: [] }));
    const bytes = await writeExcel(book);
    const parsed = XLSX.read(bytes, { type: "array", cellNF: true });
    expect(parsed.SheetNames).toEqual(STANDARD_SHEETS);
    const ws = parsed.Sheets[variants.pnlSheet];
    const cells = Object.entries(ws).filter(([key]) => !key.startsWith("!")).map(([, cell]) => cell as XLSX.CellObject);
    const minus = cells.filter(cell => cell.t === "n" && cell.v === -100);
    expect(minus.length).toBeGreaterThan(0);
    for (const cell of minus) expect([cell.z, cell.w]).toEqual([EXCEL_NUMBER_FORMATS.money_paren, "(100.00)"]);
    const zip = XLSX.CFB.read(bytes, { type: "array" });
    const sheet7 = new TextDecoder().decode(new Uint8Array(XLSX.CFB.find(zip, "/xl/worksheets/sheet7.xml")!.content));
    expect(sheet7).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    // 比率格（golden）：0.00%。
    const goldenBook = XLSX.read(await writeExcel(workbook(golden, "boss")), { type: "array", cellNF: true });
    const share = Object.values(goldenBook.Sheets[variants.pnlSheet]).find(cell => typeof cell === "object" && cell !== null && (cell as XLSX.CellObject).v === 0.103238866397) as XLSX.CellObject;
    expect([share.z, share.w]).toEqual([EXCEL_NUMBER_FORMATS.ratio, "10.32%"]);
  });
});

describe("Excel：待辦工作表最後一欄「廣告決策」（F13）", () => {
  it("值是使用者自選的暫停／調整／加碼或空格；列數與既有欄位不變", () => {
    const standard = workbook(golden, "standard");
    const sheet = sheetNamed(standard, sheetNames.actions);
    const column = labels.actions.adDecisionV3.csvColumn;
    expect(sheet.header.at(-1)).toBe(column);
    expect(sheet.header.slice(0, -1)).toEqual(Object.values(labels.excelExport.columns.actions).map((label, index) => excelHeader(label, sheet.formats![index])));
    expect(sheet.rows).toHaveLength(2);
    expect(records(sheet).map(row => row[column])).toEqual([labels.actions.adDecisionV3.options.increase, null]);
    const all = setAdDecision(setAdDecision(actions, "a1", "pause"), "a2", "adjust");
    expect(records(sheetNamed(workbook(golden, "standard", { actions: all }), sheetNames.actions)).map(row => row[column])).toEqual([labels.actions.adDecisionV3.options.pause, labels.actions.adDecisionV3.options.adjust]);
  });
});

describe("PPT：老闆一頁版一張、客戶報告版多客戶行", () => {
  const model = (variant: ExportVariant | undefined, meeting: Parameters<typeof buildPptxOnePager>[0]["meeting"] = null, work: ActionWorkspace = actions) => buildPptxOnePager({ variant, summary: golden.summary, snapshot: golden.snapshot, actions: work, meeting, generatedAt: FIXED_GENERATED_AT, datasetName: "店" });
  const runs = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1].replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&"));
  async function slides(value: PptxOnePager) {
    const files = readZip(await writePptx(value));
    return { names: [...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)), texts: runs(zipText(files, "ppt/slides/slide1.xml")!) };
  }

  it("標準版：模型與沒給 variant 時相同（沒有 variant 欄位）", () => {
    expect(model("standard")).toEqual(model(undefined));
    expect(model("standard")).not.toHaveProperty("variant");
    expect(model("standard")).not.toHaveProperty("one_liner");
  });

  it("老闆一頁版：本期一句話、四個關鍵數字、三件事只有標題與影響金額；沒有通路表、置頂待辦、口徑與資料版本；有會議時決議不帶備註", async () => {
    const boss = model("boss");
    expect(boss.variant).toBe("boss");
    expect(boss.one_liner).toBe(variantOneLiner(golden.summary, golden.snapshot));
    expect(boss.key_deltas).toEqual(variantKpis(golden.summary, golden.snapshot.report).map(row => ({ label: metricDefinitions[row.metric].label, previous: formatAmountL1(row.previous.value), current: formatAmountL1(row.current.value), change: formatSignedDelta(row.change.value, "L1") })));
    expect(boss.priorities.map(row => [row.impact, row.next_step])).toEqual(["-315.00", "-250.00", "-150.00"].map(value => [formatSignedDelta(value, "L1"), ""]));
    expect([boss.channels, boss.pinned_actions, boss.footer, boss.technical, boss.decision]).toEqual([[], [], "", "", ""]);
    expect(boss.header).toEqual(model("standard").header);
    const withMeeting = model("boss", MEETING);
    expect(withMeeting.decision).toBe(fill(labels.pptxExport.decision, { decision: labels.meeting.decisions.adopted }));
    expect(withMeeting.decision).not.toContain(MEETING.notes);
    const { names, texts } = await slides(withMeeting);
    expect(names).toEqual(["ppt/slides/slide1.xml"]);
    for (const text of [boss.one_liner!, ...boss.key_deltas.map(row => row.label), labels.sections.keyDeltas, labels.sections.topThree, labels.sections.meetingDecision, withMeeting.decision]) expect(texts, text).toContain(text);
    for (const text of [labels.csvColumns.channel, labels.pptxExport.pinnedTitle, labels.basis.footer, labels.rules.REV_UP_CM_DOWN.nextStep]) expect(texts.join("\n"), text).not.toContain(text);
    expect(texts.some(text => text.startsWith(fill(labels.exports.headerV3.pptxDataVersion, { datasetHash: "" })))).toBe(false);
    expect(texts.filter(text => /^-\d/.test(text))).toEqual([]);
    expect(texts).toContain(`${MINUS}315`);
  });

  it("客戶報告版：版頭第 2 行是客戶行（最多四行）；決議不帶備註；置頂待辦不加「引用較早資料」；頁尾不放資料版本；其餘與標準版相同", async () => {
    // 待辦引用的是另一份資料（context 的資料版本與目前 snapshot 不同）：標準版的狀態加「引用較早資料」。
    const older: ActionWorkspace = { ...actions, contexts: actions.contexts.map(context => ({ ...context, session: { ...context.session, dataset_hash: "another-dataset" } })) };
    const standard = model("standard", MEETING, older), client = model("client", MEETING, older);
    expect(client.variant).toBe("client");
    expect(client.header).toEqual([standard.header[0], fill(variants.clientLine, { client: "店", brand: labels.brand.name }), ...standard.header.slice(1)]);
    expect(standard.decision).toContain(MEETING.notes);
    expect(client.decision).toBe(fill(labels.pptxExport.decision, { decision: labels.meeting.decisions.adopted }));
    expect(standard.pinned_actions[0].status).toContain(labels.actions.staleBadge);
    expect(client.pinned_actions[0].status).not.toContain(labels.actions.staleBadge);
    expect(client.technical).toBe("");
    expect({ ...client, variant: undefined, header: undefined, decision: undefined, pinned_actions: undefined, technical: undefined }).toEqual({ ...standard, variant: undefined, header: undefined, decision: undefined, pinned_actions: undefined, technical: undefined });
    const { names, texts } = await slides(client);
    expect(names).toEqual(["ppt/slides/slide1.xml"]);
    expect(texts).toContain(client.header[1]);
    expect(texts.join("\n")).not.toContain(MEETING.notes);
  });
});

describe("列印／PDF（SSR）", () => {
  const decisionContext = (summary: ManagerSummary, notes = "備註".repeat(120)): SummaryDecisionContext => ({
    dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioIds: ["p1"], pinnedOnly: true, reviewName: "十月例會", decisionState: labels.meeting.decisions.adopted, notes,
    scenarios: [{ id: "p1", name: "方案一", status: "current", scopeLabel: "DTC", baseline: "270.00", contribution: "284.00", delta: "14.00", assumptions: ["假設一", "假設二"] }],
    actions: [
      { id: "a1", problem: "問題一", action: "做法一", owner: "行銷", deadline: "2026-10-20", risk: "喊停", status: "current", scopeLabel: "DTC", pinned: true, executionStatus: "進行中", executionNotes: "內部進度" },
      { id: "a2", problem: "問題二", action: "做法二", owner: "", deadline: "", risk: "", status: "stale", scopeLabel: "合計", pinned: false },
    ],
  });
  const render = (source: Loaded, variant: ExportVariant | undefined, options: { rich?: boolean; snapshot?: Partial<WorkspaceSnapshot> | null } = {}) => renderToStaticMarkup(createElement(PrintSummary, {
    variant, summary: source.summary, snapshot: options.snapshot === null ? undefined : (options.snapshot ?? source.snapshot) as WorkspaceSnapshot, generatedAt: FIXED_GENERATED_AT, datasetName: "店",
    decisionContext: options.rich ? decisionContext(source.summary) : { dataset_hash: source.summary.dataset_hash, filter_hash: source.summary.filter_hash, scenarios: [], actions: [], decisionState: labels.meetingPage.printViewState },
    meeting: options.rich ? { name: "十月例會", date: "2026-10-03" } : null,
  }));
  /** vitest 的 CSS module class 名稱帶檔案雜湊；比對時拿掉。 */
  const stable = (html: string) => html.replace(/class="_([A-Za-z]+)_[0-9a-f]{6}"/g, 'class="_$1"');

  it("標準版：去掉每週管理損益表一段後，與 V3-9a（d87bdbe）的列印版逐字相同（golden／demo／refund_only，有無會議與方案待辦）", async () => {
    // 基準：在 d87bdbe 的 src/components/print-summary.tsx 以同樣的 props 渲染、拿掉 class 雜湊後的 SHA-256 與字元數（產生方式見本檔註解；只在 V3-9b 開工時產生一次）。
    const BASELINE: Record<string, { sha256: string; chars: number }> = {
      golden: { sha256: "8b29bb009fa891378d914c070bdcf3cfb221917d7f6110377702f83a7fc1bda4", chars: 2317 },
      "golden-rich": { sha256: "1e05dda2049d07a71335f8e22529a38b0ccfdbcca6c2e0386d7af0ed8316de7c", chars: 3550 },
      demo: { sha256: "6c3c663996ede0175bca290f19f63164366129ec9499d094e6305325de900127", chars: 2426 },
      "demo-rich": { sha256: "bf9d86b62d9ffde2326bb519715ca041446293fbda33b70a540a7d7e0ff3aa7f", chars: 3659 },
      refund_only: { sha256: "b1b3a32c4838f838d5bfd75f304c9af4a792daa167474f43ec8a4b2ad5811bae", chars: 2073 },
      "refund_only-rich": { sha256: "6304980ae1c2370683de7dcb1a028043d08b7ce1097de414f32ab5f15118c958", chars: 3306 },
    };
    for (const [name, rich] of [["golden", false], ["golden", true], ["demo", false], ["demo", true], ["refund_only", false], ["refund_only", true]] as const) {
      const source = rich ? await load(name, TAX) : { golden, demo, refund_only: refundOnly }[name];
      const html = stable(render(source, "standard", { rich }));
      const pnl = element(html, 'data-testid="print-appendix-pnl"')!;
      expect(pnl, name).not.toBeNull();
      const stripped = html.replace(pnl, "");
      expect({ sha256: sha(stripped), chars: stripped.length }, `${name}${rich ? "-rich" : ""}`).toEqual(BASELINE[`${name}${rich ? "-rich" : ""}`]);
      // 沒給 variant＝標準版；只拿得到 report（沒有 weeks）時不放管理損益表，其餘相同。
      expect(stable(render(source, undefined, { rich }))).toBe(html);
      expect(stable(render(source, "standard", { rich, snapshot: { report: source.snapshot.report } }))).toBe(stripped);
    }
  });

  it("附錄的每週管理損益表：在技術細節之前；13 列、金額到分、負數括號（只有這張表），佔淨營收 % 兩位小數；golden 一張表、demo 6 週分成兩張", () => {
    const html = render(golden, "standard");
    const pnl = byTestId(html, "print-appendix-pnl");
    expect(html.indexOf('data-testid="print-appendix-pnl"')).toBeLessThan(html.indexOf(`<h2>${labels.sections.technicalDetails}</h2>`));
    expect(pnl).toContain(`<h2>${escapeAttr(variants.pnlHeading)}</h2>`);
    expect(pnl.split('data-testid="print-pnl-table"').length - 1).toBe(1);
    const rowsOf = (table: string) => [...table.matchAll(/<tr data-row="([a-z_]+)"[^>]*><th scope="row">([^<]+)<\/th>(.*?)<\/tr>/g)].map(match => ({ metric: match[1], label: match[2], cells: [...match[3].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(cell => cell[1]) }));
    const rows = rowsOf(pnl);
    expect(rows.map(row => row.metric)).toEqual(PNL_ROWS.map(row => row.metric));
    const table = buildPnlTable(golden.snapshot, "week");
    expect(rows.map(row => row.cells)).toEqual(table.rows.map(row => [formatAmountL3(row.cells[0].metric.value), formatAmountL3(row.total.metric.value), formatRateL3(row.share.value)]));
    expect(rows.find(row => row.metric === "net_revenue")!.cells).toEqual(["2,470.00", "2,470.00", "100.00%"]);
    expect(rows.find(row => row.metric === "contribution_after_marketing")!.cells).toEqual(["255.00", "255.00", "10.32%"]);
    // 週欄名：週名＋起訖日（ISO）；小計與扣廣告後貢獻加粗。
    const week = table.columns[0];
    expect(pnl).toContain(`<th scope="col" data-col="${week.id}">${week.label}<br/>${fill(variants.pnlWeekRange, { start: week.period.start, end: week.period.end })}</th>`);
    expect(pnl).toContain(textOf(variants.pnlNote));
    // 第一頁仍是 U+2212（括號只在管理損益表）。
    const firstPage = html.slice(0, html.indexOf("print-appendix-pnl"));
    expect(firstPage).toContain(`${MINUS}315`);
    expect(firstPage).not.toMatch(/\(\d/);
    // demo：6 週＋合計＋佔淨營收 % ＝ 8 個資料欄，每張最多 5 欄 → 兩張表，列名每張都有。
    const demoPnl = byTestId(render(demo, "standard"), "print-appendix-pnl");
    const tables = [...demoPnl.matchAll(/<table[\s\S]*?<\/table>/g)].map(match => match[0]);
    expect(tables.map(item => (item.match(/<th scope="col"/g) ?? []).length)).toEqual([1 + 5, 1 + 3]);
    for (const item of tables) expect(rowsOf(item)).toHaveLength(13);
  });

  it("refund_only：管理損益表的負數是括號 (100.00)、佔淨營收 % 不適用；缺值依原因碼", () => {
    const pnl = byTestId(render(refundOnly, "standard"), "print-appendix-pnl");
    const net = /<tr data-row="net_revenue"[^>]*>(.*?)<\/tr>/.exec(pnl)![1];
    expect([...net.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(match => match[1])).toEqual(["(100.00)", "(100.00)", labels.status.notApplicable]);
    expect(pnl).not.toContain(MINUS);
    expect(pnlExportAmount({ value: "-100.00", reason_codes: [] })).toBe(fill(variants.negativeParen, { value: "100.00" }));
    expect(pnlExportAmount({ value: "0.00", reason_codes: [] })).toBe("0.00");
    expect(pnlExportAmount({ value: null, reason_codes: ["MISSING_COGS"] })).toBe(labels.status.missing);
    expect(pnlExportShare({ share: { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] } })).toBe(labels.status.notApplicable);
  });

  it("老闆一頁版：版頭四行、本期一句話、四個關鍵數字、三件事標題與影響金額、決議一行（不帶備註）；沒有通路表、方案與待辦、頁尾、附錄", () => {
    const html = render(golden, "boss", { rich: true });
    expect(openTag(html, 'data-testid="manager-summary-print"')).toContain('data-variant="boss"');
    const header = byTestId(html, "print-report-header");
    for (const id of ["print-header-dataset", "print-header-period", "print-header-version"]) expect(header).toContain(`data-testid="${id}"`);
    for (const id of ["print-header-client", "print-header-meeting", "print-header-scope"]) expect(header).not.toContain(`data-testid="${id}"`);
    expect(textOf(byTestId(html, "print-one-liner"))).toBe(variantOneLiner(golden.summary, golden.snapshot));
    const kpis = [...byTestId(html, "print-kpis").matchAll(/<p><strong>([^<]+)<\/strong><br\/>([^<]+)<\/p>/g)].map(match => [match[1], match[2]]);
    expect(kpis).toEqual(variantKpis(golden.summary, golden.snapshot.report).map(row => [metricDefinitions[row.metric].label, fill(labels.ui.managerSummary.printHeadline, { prev: formatAmountL1(row.previous.value), cur: formatAmountL1(row.current.value), change: formatSignedDelta(row.change.value, "L1") })]));
    const three = byTestId(html, "print-top-three");
    expect((three.match(/<li>/g) ?? []).length).toBe(3);
    expect(three).not.toContain("<p>");
    expect(textOf(three)).toContain(`${labels.sections.impact} ${formatSignedDelta("-315.00", "L1")}`);
    expect(textOf(byTestId(html, "print-decision-line"))).toBe(fill(variants.printDecisionLine, { name: "十月例會", state: labels.meeting.decisions.adopted }));
    for (const absent of ["<table", "<footer", "print-appendix", "print-scenario-line", labels.sections.technicalDetails, labels.ui.managerSummary.printDecisionsHeading, "內部進度", "備註備註", labels.assist.breakevenV3.label]) expect(html, absent).not.toContain(absent);
    expect(html).not.toContain(escapeAttr(fill(labels.ui.managerSummary.printThresholdLine, { amount: formatAmountL3(golden.summary.importance_threshold) })));
  });

  it("客戶報告版：版頭第 1 行之後是客戶行；決議不帶備註、沒有備註全文附錄；待辦不列確認狀態、引用較早資料與進度紀錄；沒有技術細節；有每週管理損益表", () => {
    const html = render(golden, "client", { rich: true });
    expect(openTag(html, 'data-testid="manager-summary-print"')).toContain('data-variant="client"');
    const header = byTestId(html, "print-report-header");
    expect(header.indexOf('data-testid="print-header-dataset"')).toBeLessThan(header.indexOf('data-testid="print-header-client"'));
    expect(header.indexOf('data-testid="print-header-client"')).toBeLessThan(header.indexOf("<h1>"));
    expect(textOf(byTestId(html, "print-header-client"))).toBe(fill(variants.clientLine, { client: "店", brand: labels.brand.name }));
    expect(textOf(byTestId(html, "print-decision-line"))).toBe(fill(variants.printDecisionLine, { name: "十月例會", state: labels.meeting.decisions.adopted }));
    for (const absent of ["print-appendix-notes", "備註備註", "內部進度", labels.actions.staleBadge, labels.ui.managerSummary.actionConfirmed, labels.sections.technicalDetails, "dataset_hash", golden.summary.dataset_hash]) expect(html, absent).not.toContain(absent);
    expect(html).toContain(fill(variants.actionStatus, { status: "進行中" }));
    expect(html).toContain('data-testid="print-appendix-pnl"');
    expect(html).toContain('data-testid="print-appendix-assumptions"');
    // 第一頁與標準版相同的部分：關鍵數字、三件事（含下一步）、通路表、方案與待辦、頁尾。
    const standard = render(golden, "standard", { rich: true });
    for (const part of ['<div class="', "<table><caption>", "<footer>"]) expect(html.includes(part), part).toBe(standard.includes(part));
    expect(byTestId(stable(html), "print-scenario-line")).toBe(byTestId(stable(standard), "print-scenario-line"));
  });

  it("§9.6 列印 CSS：新增的版面規則在 @media print 內、字級只用 --print-*、不印底色", () => {
    const css = readFileSync(resolve("src/components/manager-summary.module.css"), "utf8");
    const print = css.slice(css.indexOf("@media print"));
    for (const name of ["printOneLiner", "printPnl", "printPnlStrong", "printPnlNote"]) expect(print, name).toContain(`.${name}`);
    expect(css.slice(0, css.indexOf("@media print"))).not.toMatch(/\.printPnl|\.printOneLiner/);
    for (const match of print.matchAll(/font-size:\s*([^;]+);/g)) expect(["var(--print-body)", "var(--print-note)", "var(--print-title)", "inherit"]).toContain(match[1].trim());
  });
});

/*
 * 選單互動沿用 tests/pnl-table-ui.test.tsx 的 hooks harness（沒有 DOM 套件）：把 ExportMenu 當函式呼叫，useState 存在陣列，useRef／useEffect 在 harness 內是假的。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], cursor: 0, dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = hooks.states[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { hooks.states[index] = value; hooks.dirty = true; }
      };
      return [hooks.states[index], set];
    },
    useRef: (initial: unknown) => hooks.active ? { current: initial } : actual.useRef(initial),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useEffect(effect, deps),
  };
});
afterEach(() => { hooks.active = false; hooks.states = []; });
type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.cursor = 0;
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    return tree;
  };
}
function findAll(node: ReactNode, match: (item: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const item = node as TreeElement;
    if (match(item)) found.push(item);
    findAll(item.props.children as ReactNode, match, found);
  }
  return found;
}

describe("匯出選單的版本切換（§7.9、M6）", () => {
  let source: ExportMenuSource;
  beforeAll(() => { source = { dataset: golden.dataset, snapshot: golden.snapshot }; });
  const props = (overrides: Partial<ExportMenuProps> = {}): ExportMenuProps => ({ source, busy: null, error: null, summaryRef: createRef<HTMLElement>(), onDecision: () => undefined, onPrint: () => undefined, onExport: () => undefined, onMeetingNotes: () => undefined, onCopySummary: async () => ({ copied: true, text: "" }), ...overrides });

  it("SSR：「一頁摘要（目前檢視）」分組標題之後、PDF 之前一列 .ui-segmented[role=group]；三個 aria-pressed 按鈕各一份（預設標準版），名稱與 12px 說明各有 id", () => {
    const html = renderToStaticMarkup(createElement(ExportMenu, props()));
    const group = byTestId(html, "download-group-summary");
    const picker = byTestId(group, "download-variant-picker");
    expect(openTag(group, 'data-testid="download-variant-picker"')).toBe(`<div class="ui-segmented export-variant-picker" role="group" aria-label="${escapeAttr(variants.pickerAria)}" data-testid="download-variant-picker">`);
    expect(group.indexOf('data-testid="download-meeting-section"')).toBeLessThan(group.indexOf('data-testid="download-variant-picker"'));
    expect(group.indexOf('data-testid="download-variant-picker"')).toBeLessThan(group.indexOf('aria-labelledby="download-pdf-name"'));
    for (const variant of EXPORT_VARIANTS) {
      expect(html.split(`data-testid="download-variant-${variant}"`).length - 1, variant).toBe(1);
      const button = byTestId(picker, `download-variant-${variant}`);
      expect(openTag(button, `data-testid="download-variant-${variant}"`)).toBe(`<button type="button" class="export-variant" aria-pressed="${variant === "standard"}" data-testid="download-variant-${variant}" aria-labelledby="download-variant-${variant}-name" aria-describedby="download-variant-${variant}-hint">`);
      expect(button).toContain(`<span id="download-variant-${variant}-name" class="export-variant-name">${escapeAttr(variants.names[variant])}</span><small id="download-variant-${variant}-hint">${escapeAttr(variants.descriptions[variant])}</small>`);
    }
    // 其他分組沒有版本切換；匯出項目數不變（版本按鈕不是 export-item）。
    for (const id of ["download-group-current", "download-group-decision", "download-group-meeting"]) expect(byTestId(html, id), id).not.toContain("download-variant");
    expect((group.match(/class="ui-menu-item export-item"/g) ?? []).length).toBe(4);
  });

  it("選老闆一頁版後：PDF、Excel、PPT 帶 boss；會議紀錄 Markdown 不帶版本；重新渲染（選單關閉再開）仍是上次的選擇", () => {
    const calls: unknown[][] = [];
    const render = mount(ExportMenu);
    const current = props({ onPrint: (...args) => calls.push(["print", ...args]), onExport: (...args) => calls.push(["export", ...args]), onMeetingNotes: (...args: unknown[]) => calls.push(["md", ...args]) });
    let tree = render(current);
    const picker = () => findAll(tree, item => typeof item.props.onChange === "function" && "value" in item.props)[0];
    const item = (id: string) => findAll(tree, entry => entry.props.id === id)[0];
    expect(picker().props.value).toBe("standard");
    (item("download-excel").props.onClick as () => void)();
    (picker().props.onChange as (variant: ExportVariant) => void)("boss");
    tree = render(current);
    expect(picker().props.value).toBe("boss");
    (item("download-pdf").props.onClick as (event: unknown) => void)({ currentTarget: { closest: () => null } });
    (item("download-excel").props.onClick as () => void)();
    (item("download-pptx").props.onClick as () => void)();
    (item("download-meeting-md").props.onClick as () => void)();
    (picker().props.onChange as (variant: ExportVariant) => void)("client");
    tree = render(current);
    tree = render(current);
    (item("download-pptx").props.onClick as () => void)();
    expect(calls).toEqual([["export", "excel", "standard"], ["print", "boss"], ["export", "excel", "boss"], ["export", "pptx", "boss"], ["md"], ["export", "pptx", "client"]]);
  });

  it("labels.exports.variantsV3 沒有黑名單詞、注意前綴、箭頭、「｜」、驚嘆號；按鈕名稱與說明是標籤（不加句號）", () => {
    const { metrics, details } = scanLabels({ exports: { variantsV3: variants } });
    expect(metrics, JSON.stringify(details, null, 2)).toEqual({ noticePrefix: 0, noticeAnywhere: 0, arrows: 0, circledNumbers: 0, decorativeChars: 0, exclamations: 0, emoji: 0, allCaps: 0, pipes: 0, blacklistSynonym: 0, blacklistJargon: 0, blacklistTone: 0, blacklistEmotion: 0, placeholderMalformed: 0, placeholderVariantMismatch: 0, l1ClauseOverLimit: 0 });
    for (const text of [...Object.values(variants.names), ...Object.values(variants.descriptions), variants.pnlHeading, variants.pnlSheet]) expect(text.endsWith("。"), text).toBe(false);
    expect(variants.pnlNote.endsWith("。")).toBe(true);
    expect(formatPeriodExport("2026-08-02", "2026-08-02")).toContain("2026-08-02");
  });

  it("globals.css 的 V3-9b 代理 B 區段：只用 token（沒有 hex、字級與圓角都是 var 或 0）", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V3-9b 錨點（代理 B：");
    const end = css.indexOf("/* ── V3-9b 錨點（代理 C：");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    expect(block).toContain(".export-variant-picker");
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const match of block.matchAll(/font-size:\s*([^;]+);/g)) expect(match[1]).toMatch(/^var\(--text-\d+\)$/);
    for (const match of block.matchAll(/border-radius:\s*([^;]+);/g)) expect(match[1]).toMatch(/^(?:0|var\(--radius-[a-z]+\))$/);
  });
});
