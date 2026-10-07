import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { formatSavedDateTime } from "@/application/auto-save";
import { conversionSentence } from "@/application/copy";
import { createDecisionSession } from "@/application/decision";
import { exportDecisionMarkdown } from "@/application/decision-export";
import { buildExcelWorkbook, EXCEL_NUMBER_FORMATS, writeExcel } from "@/application/excel-export";
import { buildExportHeader, markdownExportHeader } from "@/application/export-header";
import { argb, EXPORT_THEME } from "@/application/export-theme";
import { buildManagerSummary, exportManagerSummaryMarkdown, summaryExportHeader } from "@/application/manager-summary";
import { exportMeetingMarkdown } from "@/application/meeting";
import { formatPeriodExport, MINUS } from "@/application/presentation";
import type { TaxConversion } from "@/application/tax-basis";
import { createSnapshot, hashInput } from "@/application/workspace";
import type { AnalysisFilters } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { PrintSummary } from "../src/components/print-summary";
import { FIXED_GENERATED_AT, goldenFormattedExports, normalizeMarkdown, normalizeWorkbook } from "./helpers/export-normalize";
import { fixture } from "./helpers/fixtures";

// V3-7 PRD §7.9「匯出版頭」（台灣報表格式四行）、§9.6 列印與匯出、§6.5 正規化比對、§6.3 #50 A4 列印版。

const copy = labels.exports.headerV3;
const REPORT_TITLE = fill(copy.reportTitle, { metric: labels.metrics.contribution_after_marketing.label });
/** FIXED_GENERATED_AT＝2026-10-05 06:32Z＝台北 14:32。 */
const FIXED_TIME = "2026-10-05 14:32";
const periodUnit = (current: [string, string], previous: [string, string], unit: string = copy.unitExclusive) =>
  fill(copy.periodUnitLine, { period: fill(copy.periodLine, { current: formatPeriodExport(...current), previous: formatPeriodExport(...previous) }), unit });
const GOLDEN_PERIOD_UNIT = periodUnit(["2026-08-02", "2026-08-02"], ["2026-08-01", "2026-08-01"]);
const versionLine = (time: string, version = "contribution-v1") => fill(copy.versionLine, { version, time });
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const BASELINE = JSON.parse(readFileSync(resolve("tests/fixtures/export-format-baseline-v3-6.json"), "utf8")) as Record<string, { sha256: string; chars: number }>;

async function golden(filters: AnalysisFilters = {}) {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)) };
}
const TAX: TaxConversion = { basis: "inclusive", rate: "0.05", fields: ["gross_sales", "discounts"], rows_converted: 12 };

describe("V3-7 buildExportHeader：四行（資料集、報表名、兩期與單位、指標版本與產出時間）", () => {
  const scope = { previous: { start: "2026-06-01", end: "2026-07-12" }, current: { start: "2026-07-13", end: "2026-08-23" } };

  it("PRD §7.9 範例：本期在前、上期在後，都寫出天數；單位未稅；版本字串與台北時間在第 4 行", () => {
    const header = buildExportHeader({ datasetName: "demo-store", scope, metricVersion: "contribution-v1", generatedAt: FIXED_GENERATED_AT });
    expect(header.lines).toEqual(["demo-store", REPORT_TITLE, periodUnit(["2026-07-13", "2026-08-23"], ["2026-06-01", "2026-07-12"]), versionLine(FIXED_TIME)]);
    expect(formatPeriodExport("2026-07-13", "2026-08-23")).toBe(fill(labels.units.exportRange, { start: "2026-07-13", end: "2026-08-23", days: 42 }));
    expect(header).toMatchObject({ datasetName: "demo-store", title: REPORT_TITLE, unitLine: copy.unitExclusive, versionLine: versionLine(FIXED_TIME) });
    expect(header.periodLine).toBe(fill(copy.periodLine, { current: formatPeriodExport("2026-07-13", "2026-08-23"), previous: formatPeriodExport("2026-06-01", "2026-07-12") }));
    expect(header.lines[2]).toBe(fill(copy.periodUnitLine, { period: header.periodLine, unit: header.unitLine }));
    // 報表名的指標名取 metricDefinitions（GLOSSARY：扣廣告後貢獻）。
    expect(REPORT_TITLE.startsWith(labels.metrics.contribution_after_marketing.label)).toBe(true);
  });

  it("含稅換算過：單位寫「已換算為未稅」；D-V3-6 新台幣、台北時間都用「台」", () => {
    const header = buildExportHeader({ datasetName: "x", scope, metricVersion: "contribution-v1", generatedAt: FIXED_GENERATED_AT, amountBasis: "inclusive" });
    expect(header.unitLine).toBe(copy.unitConverted);
    expect(header.lines[2]).toBe(periodUnit(["2026-07-13", "2026-08-23"], ["2026-06-01", "2026-07-12"], copy.unitConverted));
    for (const text of [copy.unitExclusive, copy.unitConverted, copy.versionLine]) expect(text).not.toContain("臺");
  });

  it("產出時間是台北時間 YYYY-MM-DD hh:mm（跨午夜以台北日期為準）；無效時間寫「資料待補」", () => {
    const at = (iso: string) => buildExportHeader({ datasetName: "x", scope, metricVersion: "contribution-v1", generatedAt: new Date(iso) }).versionLine;
    expect(at("2026-10-05T06:32:00Z")).toBe(versionLine("2026-10-05 14:32"));
    expect(at("2026-10-05T16:30:00Z")).toBe(versionLine("2026-10-06 00:30"));
    expect(formatSavedDateTime(new Date("2026-10-05T16:30:00Z"))).toBe("2026-10-06 00:30");
    expect(buildExportHeader({ datasetName: "x", scope, metricVersion: "v", generatedAt: new Date(Number.NaN) }).versionLine).toBe(versionLine(labels.status.missing, "v"));
  });

  it("天數：呼叫端（domain）給的天數優先；與起訖日一致時就是 formatPeriodExport；資料集名稱空白時寫「資料待補」", () => {
    const same = buildExportHeader({ datasetName: "x", scope: { ...scope, previousDays: 42, currentDays: 42 }, metricVersion: "v", generatedAt: FIXED_GENERATED_AT });
    expect(same.periodLine).toBe(fill(copy.periodLine, { current: formatPeriodExport("2026-07-13", "2026-08-23"), previous: formatPeriodExport("2026-06-01", "2026-07-12") }));
    const given = buildExportHeader({ datasetName: "x", scope: { ...scope, previousDays: 41 }, metricVersion: "v", generatedAt: FIXED_GENERATED_AT });
    expect(given.periodLine).toContain(fill(labels.units.exportRange, { start: "2026-06-01", end: "2026-07-12", days: 41 }));
    expect(buildExportHeader({ datasetName: "   ", scope, metricVersion: "v", generatedAt: FIXED_GENERATED_AT }).lines[0]).toBe(labels.status.missing);
  });

  it("Markdown 版頭：四行各自一行（前三行行尾兩個空白＝硬換行），資料集名稱當純文字逸出", () => {
    const header = buildExportHeader({ datasetName: " <b>店</b> *x* [a](b) ", scope, metricVersion: "v", generatedAt: FIXED_GENERATED_AT });
    const lines = markdownExportHeader(header);
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).every(line => line.endsWith("  "))).toBe(true);
    expect(lines[3].endsWith(" ")).toBe(false);
    expect(lines[0]).toBe("&lt;b&gt;店&lt;/b&gt; \\*x\\* \\[a\\]\\(b\\)  ");
    expect(lines.slice(1).map(line => line.trimEnd())).toEqual(header.lines.slice(1));
    // 開頭的「-」「=」「1.」不變成清單、分隔線或編號。
    for (const [name, escaped] of [["- x", "\\- x"], ["===", "\\==="], ["1. x", "1\\. x"]]) expect(markdownExportHeader({ ...header, datasetName: name })[0]).toBe(`${escaped}  `);
  });
});

describe("V3-7 Markdown：「# 標題」之後緊接版頭四行，其後內容與數值不變", () => {
  it("一頁摘要：標題、空行、版頭四行、空行，然後是既有的資料範圍與期間（版頭用 summary 的範圍與 metric_version）", async () => {
    const { snapshot } = await golden();
    const summary = buildManagerSummary(snapshot);
    const lines = exportManagerSummaryMarkdown(summary, undefined, { generatedAt: FIXED_GENERATED_AT }).split("\n");
    expect(lines[0]).toBe(fill(labels.ui.managerSummary.mdTitle, { brand: labels.brand.name, decision: labels.meeting.decisions.draft }));
    expect(lines[1]).toBe("");
    expect(lines.slice(2, 6).map(line => line.trimEnd())).toEqual(["golden-v1", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine(FIXED_TIME)]);
    expect(lines.slice(2, 6)).toEqual(markdownExportHeader(summaryExportHeader(summary, { generatedAt: FIXED_GENERATED_AT })));
    expect(lines[6]).toBe("");
    expect(lines[7]).toBe(fill(labels.ui.managerSummary.mdMeta, { asOf: "2026-08-03", channels: "DTC、MARKETPLACE" }));
    // 含稅換算過：單位寫「已換算為未稅」；資料集名稱可由呼叫端給。
    const converted = exportManagerSummaryMarkdown(buildManagerSummary(snapshot, { conversion: TAX }), undefined, { generatedAt: FIXED_GENERATED_AT, datasetName: "store" }).split("\n");
    expect(converted.slice(2, 6).map(line => line.trimEnd())).toEqual(["store", REPORT_TITLE, periodUnit(["2026-08-02", "2026-08-02"], ["2026-08-01", "2026-08-01"], copy.unitConverted), versionLine(FIXED_TIME)]);
  });

  it("決策紀錄：兩期取試算建立時的範圍；有含稅換算一句（extraLimitations）時寫「已換算為未稅」", async () => {
    const { dataset, snapshot } = await golden({ channels: ["DTC"] });
    const session = createDecisionSession(dataset, snapshot, 1);
    const lines = exportDecisionMarkdown(session, [], [], undefined, [], { generatedAt: FIXED_GENERATED_AT }).split("\n");
    expect(lines.slice(0, 7).map(line => line.trimEnd())).toEqual([`# ${labels.ui.decisionExport.title}`, "", "golden-v1", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine(FIXED_TIME), ""]);
    expect(lines[7]).toBe(fill(labels.ui.decisionExport.statusLine, { status: labels.ui.decisionExport.statusCurrent }));
    const converted = exportDecisionMarkdown(session, [], [], undefined, [conversionSentence(TAX)!], { generatedAt: FIXED_GENERATED_AT }).split("\n");
    expect(converted[4].trimEnd()).toBe(periodUnit(["2026-08-02", "2026-08-02"], ["2026-08-01", "2026-08-01"], copy.unitConverted));
  });

  it("會議紀錄：版頭的產出時間預設是結束時間（同一筆紀錄每次下載都相同），也可以指定", async () => {
    const { meetingMd, meeting } = await goldenFormattedExports();
    const lines = meetingMd.split("\n");
    expect(lines[0]).toBe(fill(labels.meetingRecord.mdTitle, { brand: labels.brand.name, name: "golden" }));
    // finalizeMeeting 的 now＝2026-10-03T06:00Z＝台北 14:00。
    expect(lines.slice(1, 7).map(line => line.trimEnd())).toEqual(["", "golden-v1", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine("2026-10-03 14:00"), ""]);
    expect(lines[7].startsWith(fill(labels.meetingRecord.mdMeta, { date: labels.meeting.date, value: "2026-10-03", decision: labels.meeting.decision, state: "" }).split(" · ")[0])).toBe(true);
    expect(exportMeetingMarkdown(meeting)).toBe(meetingMd);
    const custom = exportMeetingMarkdown(meeting, undefined, { generatedAt: FIXED_GENERATED_AT, datasetName: "store" }).split("\n");
    expect(custom.slice(2, 6).map(line => line.trimEnd())).toEqual(["store", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine(FIXED_TIME)]);
  });

  it("表格的數字欄右對齊（---:）；負號是 U+2212，主文沒有 ASCII 負號金額", async () => {
    const exports = await goldenFormattedExports();
    for (const key of ["managerSummaryMd", "managerSummaryContextMd", "decisionMd", "meetingMd"] as const) {
      const separators = exports[key].split("\n").filter(line => /^\|( ?:?-{3,}:? ?\|)+$/.test(line));
      for (const row of separators) expect(row, key).toMatch(/^\| --- (\| ---: )+\|$/);
    }
    expect(exports.managerSummaryMd).toContain(`${MINUS}315`);
    expect(exports.meetingMd).toContain(`${MINUS}185`);
  });
});

describe("V3-7 §6.5 正規化比對：去掉版頭、負號換回 ASCII 後，與開工前（71e9f5f）的輸出逐字相同", () => {
  it("Markdown 五種與 Excel 活頁簿模型都相同（數值一格都沒變）", async () => {
    const exports = await goldenFormattedExports();
    for (const key of ["managerSummaryMd", "managerSummaryContextMd", "decisionMd", "workspaceDecisionMd", "meetingMd"] as const) {
      const normalized = normalizeMarkdown(exports[key]);
      expect({ sha256: sha(normalized), chars: normalized.length }, key).toEqual(BASELINE[key]);
      // 新版確實多了版頭（正規化有拿掉東西）。
      expect(exports[key].length, key).toBeGreaterThan(normalized.length);
    }
    // V3-9a F12：兩種一頁摘要 Markdown 確實多了損益兩平 MER 一列與版本一行（正規化時拿掉，見 tests/helpers/export-normalize.ts）。
    for (const key of ["managerSummaryMd", "managerSummaryContextMd"] as const) {
      expect(exports[key], key).toContain(`\n| ${labels.assist.breakevenV3.label} |`);
      expect(exports[key], key).toContain(`\n- ${labels.assist.breakevenV3.technicalVersion}：breakeven-mer-v1\n`);
    }
    const workbook = normalizeWorkbook(exports.excel);
    expect({ sha256: sha(JSON.stringify(workbook)), chars: JSON.stringify(workbook).length }).toEqual(BASELINE.excel);
    // 摘要工作表拿掉四列版頭與 V3-9a 損益兩平 MER 一列（新增列）；指標定義表拿掉損益兩平 MER 版本一列。
    expect(exports.excel.sheets[0].rows.length - workbook.sheets[0].rows.length).toBe(4 + 1);
    expect(exports.excel.sheets[5].rows.length - workbook.sheets[5].rows.length).toBe(1);
  });

  it("normalizeMarkdown 去掉每一段版頭（工作稿 Markdown 的附錄各有一段），也把 U+2212 與括號負數換成 ASCII「-」", async () => {
    const { workspaceDecisionMd } = await goldenFormattedExports();
    const headers = workspaceDecisionMd.split("\n").filter(line => line.trimEnd() === REPORT_TITLE).length;
    expect(headers).toBeGreaterThanOrEqual(2);
    expect(normalizeMarkdown(workspaceDecisionMd)).not.toContain(REPORT_TITLE);
    expect(normalizeMarkdown(`a ${MINUS}315 （1,234.00）（42 天）`)).toBe("a -315 -1,234.00（42 天）");
  });
});

describe("V3-7 Excel：摘要工作表最前面是版頭四列；表頭粗體、淺灰底；凍結表頭列", () => {
  it("版頭四列（區塊「版頭」、內容欄放各行），其後是既有的資料範圍與關鍵數字", async () => {
    const { dataset, snapshot } = await golden();
    const summary = buildManagerSummary(snapshot);
    const sheet = buildExcelWorkbook({ summary, snapshot, dataset, actions: emptyActionWorkspace(), generatedAt: FIXED_GENERATED_AT }).sheets[0];
    const columns = labels.excelExport.columns.summary;
    const sectionAt = Object.keys(columns).indexOf("section"), detailAt = Object.keys(columns).indexOf("detail");
    const cellText = (row: number, column: number) => { const cell = sheet.rows[row][column]; return cell.kind === "text" ? cell.value : null; };
    expect([0, 1, 2, 3].map(row => cellText(row, sectionAt))).toEqual(Array(4).fill(copy.excelSection));
    expect([0, 1, 2, 3].map(row => cellText(row, detailAt))).toEqual(["golden-v1", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine(FIXED_TIME)]);
    expect(sheet.rows.slice(0, 4).every(row => row.every((cell, column) => column === sectionAt || column === detailAt ? cell.kind === "text" : cell.kind === "null"))).toBe(true);
    expect([cellText(4, sectionAt), cellText(4, detailAt)]).toEqual([labels.excelExport.summary.sections.scope, "golden-v1"]);
    // 含稅換算（conversion 或 summary 的換算一句）：單位寫「已換算為未稅」。
    const converted = buildExcelWorkbook({ summary, snapshot, dataset, actions: emptyActionWorkspace(), conversion: TAX, generatedAt: FIXED_GENERATED_AT }).sheets[0];
    expect(converted.rows[2][detailAt]).toEqual({ kind: "text", value: periodUnit(["2026-08-02", "2026-08-02"], ["2026-08-01", "2026-08-01"], copy.unitConverted) });
  });

  it("寫出的 .xlsx：每張工作表第 1 列套表頭樣式（粗體、#f1f3f3 底）並凍結；格子的值與數字格式不變", async () => {
    const { dataset, snapshot } = await golden();
    const workbook = buildExcelWorkbook({ summary: buildManagerSummary(snapshot), snapshot, dataset, actions: emptyActionWorkspace(), generatedAt: FIXED_GENERATED_AT });
    const bytes = await writeExcel(workbook);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const zip = XLSX.CFB.read(bytes, { type: "array" });
    const xml = (path: string) => new TextDecoder().decode(new Uint8Array(XLSX.CFB.find(zip, path)!.content));
    const styles = xml("/xl/styles.xml");
    const xfs = [...styles.matchAll(/<xf [^>]*\/>/g)].map(match => match[0]);
    const cellXfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(styles)!;
    const headerStyle = Number(cellXfs[1]) - 1;
    const headerXf = [...cellXfs[2].matchAll(/<xf [^>]*\/>/g)][headerStyle][0];
    expect(xfs.length).toBeGreaterThan(1);
    expect(headerXf).toMatch(/applyFont="1"/);
    expect(headerXf).toMatch(/applyFill="1"/);
    const fontId = Number(/fontId="(\d+)"/.exec(headerXf)![1]), fillId = Number(/fillId="(\d+)"/.exec(headerXf)![1]);
    const fonts = [...styles.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(match => match[1]);
    const fills = [...styles.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(match => match[1]);
    expect(fonts[fontId]).toContain("<b/>");
    expect(fonts[fontId]).toContain(`rgb="${argb(EXPORT_THEME.ink)}"`);
    expect(fills[fillId]).toContain(`<fgColor rgb="${argb(EXPORT_THEME.headerFill)}"/>`);
    expect(/<fonts count="(\d+)">/.exec(styles)![1]).toBe(String(fonts.length));
    expect(/<fills count="(\d+)">/.exec(styles)![1]).toBe(String(fills.length));
    const sheets = (zip.FullPaths as string[]).map(path => path.replace(/^Root Entry/, "")).filter(path => /^\/xl\/worksheets\/sheet\d+\.xml$/.test(path));
    expect(sheets).toHaveLength(6);
    for (const path of sheets) {
      const sheet = xml(path);
      expect(sheet, path).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
      const firstRow = /<row r="1"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)![1];
      const cells = [...firstRow.matchAll(/<c ([^>]*?)\/?>/g)].map(match => match[1]);
      expect(cells.length, path).toBeGreaterThan(0);
      for (const cell of cells) expect(cell, path).toContain(` s="${headerStyle}"`);
      // 第 2 列之後沒有套表頭樣式。
      expect(sheet.slice(sheet.indexOf("</row>")), path).not.toContain(` s="${headerStyle}"`);
    }
    // 讀回：表頭文字、版頭四列、金額格與數字格式都和模型相同。
    const book = XLSX.read(bytes, { type: "array", cellNF: true });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[labels.excelExport.sheets.summary], { header: 1, defval: null });
    expect(rows[0]).toEqual(workbook.sheets[0].header);
    expect(rows.slice(1, 5).map(row => row.at(-1))).toEqual(["golden-v1", REPORT_TITLE, GOLDEN_PERIOD_UNIT, versionLine(FIXED_TIME)]);
    const minus = Object.values(book.Sheets[labels.excelExport.sheets.summary]).find(cell => typeof cell === "object" && cell !== null && (cell as XLSX.CellObject).v === -315) as XLSX.CellObject;
    expect([minus.t, minus.z, minus.w]).toEqual(["n", EXCEL_NUMBER_FORMATS.money_l2, `${MINUS}315`]);
  });
});

describe("V3-7 §6.3 #50 A4 列印版：版頭四行＋會議一行（有會議時）＋範圍一行，其後內容順序不變", () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  async function render(meeting: { name: string; date: string } | null, conversion: TaxConversion | null = null) {
    const { snapshot } = await golden();
    const summary = buildManagerSummary(snapshot, { conversion });
    return renderToStaticMarkup(createElement(PrintSummary, { summary, snapshot, meeting, generatedAt: FIXED_GENERATED_AT, decisionContext: { dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, scenarios: [], actions: [], decisionState: labels.meetingPage.printViewState } }));
  }
  const header = (html: string) => /<header[^>]*data-testid="print-report-header"[^>]*>([\s\S]*?)<\/header>/.exec(html)![1];
  const pieces = (html: string) => [...header(html).matchAll(/<(p|h1)[^>]*>([\s\S]*?)<\/\1>/g)].map(match => ({ tag: match[1], text: text(match[2]), html: match[0] }));

  it("沒有會議：資料集、報表名（h1）、兩期與單位、版本與產出時間，再一行範圍（狀態、資料到、通路、比較方式）", async () => {
    const html = await render(null);
    expect(pieces(html).map(piece => [piece.tag, piece.text])).toEqual([
      ["p", "golden-v1"], ["h1", REPORT_TITLE], ["p", `${fill(copy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") })}${copy.unitExclusive}`],
      ["p", versionLine(FIXED_TIME)], ["p", fill(copy.printScope, { state: labels.meetingPage.printViewState, asOf: "2026-08-03", channels: "DTC、MARKETPLACE", mode: labels.periods.sameDays })],
    ]);
    // 期間與單位同一行、各自一段（單位靠右）。
    expect(pieces(html)[2].html).toMatch(/<p[^>]*data-testid="print-header-period"[^>]*><span>[^<]+<\/span><span>[^<]+<\/span><\/p>/);
    for (const id of ["print-header-dataset", "print-header-period", "print-header-version", "print-header-scope"]) expect(header(html)).toContain(`data-testid="${id}"`);
    // 版頭之後的內容順序不變：關鍵差額、三件事、通路表、方案與待辦、頁尾、附錄。
    const order = ['data-testid="print-report-header"', "<h2>", "<table>", "<footer>"].map(marker => html.indexOf(marker));
    expect(order.every((at, index) => at > -1 && (index === 0 || at > order[index - 1]))).toBe(true);
    expect(html).toContain('data-testid="manager-summary-print"');
  });

  it("有會議：版頭四行之後是會議名稱與日期一行，範圍一行不再重複資料到；含稅換算時單位寫「已換算為未稅」", async () => {
    const html = await render({ name: "十月例會", date: "2026-10-03" }, TAX);
    const list = pieces(html);
    expect(list.map(piece => piece.text)).toEqual([
      "golden-v1", REPORT_TITLE, `${fill(copy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") })}${copy.unitConverted}`, versionLine(FIXED_TIME),
      fill(labels.meetingPage.printHeader, { name: "十月例會", date: "2026-10-03", asOf: "2026-08-03" }),
      fill(copy.printScopeMeeting, { state: labels.meetingPage.printViewState, channels: "DTC、MARKETPLACE", mode: labels.periods.sameDays }),
    ]);
    expect(list[4].html).toContain('data-testid="print-header-meeting"');
    expect(header(await render(null))).not.toContain('data-testid="print-header-meeting"');
  });

  it("§9.6 列印 CSS：字級只用 --print-title／--print-body／--print-note，不印底色、表格線 0.5pt --border-strong、數字 tabular", () => {
    const css = readFileSync(resolve("src/components/manager-summary.module.css"), "utf8");
    const print = css.slice(css.indexOf("@media print"));
    const sizes = [...print.matchAll(/font-size:\s*([^;]+);/g)].map(match => match[1].trim());
    expect(new Set(sizes)).toEqual(new Set(["var(--print-body)", "var(--print-note)", "var(--print-title)", "inherit"]));
    expect(print).not.toMatch(/\d(?:\.\d+)?pt\s*;|font-size:\s*\d/);
    expect(print).toMatch(/\.printSurface, \.printSurface \* \{ background: none !important; \}/);
    expect(print).not.toMatch(/background:\s*var\(/);
    expect(print).toMatch(/border-bottom: 0\.5pt solid var\(--border-strong\)/);
    expect(print).toMatch(/font-variant-numeric: tabular-nums/);
    expect(print).toMatch(/@page \{ size: A4 portrait;/);
    // 決議行只有左線（不印底色）。
    expect(/\.printDecision \{[^}]*\}/.exec(print)![0]).not.toContain("background");
  });
});
