import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { fixture, expected } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { compareProducts } from "@/domain/product-comparison";
import { parseCents } from "@/domain/money";
import type { AnalysisFilters, DatasetInput } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { buildManagerSummary } from "@/application/manager-summary";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { conversionSentence, scopeLabel } from "@/application/copy";
import { encodeCsv } from "@/application/export";
import { downloadBinary } from "@/application/download";
import { buildExcelWorkbook, countCell, EXCEL_CELL_TEXT_LIMIT, EXCEL_MIME, excelSheetName, excelText, exportExcel, moneyCell, ratioCell, writeExcel, type ExcelCell, type ExcelExportInput, type ExcelSheet, type ExcelWorkbook } from "@/application/excel-export";
import type { TaxConversion } from "@/application/tax-basis";
import { fill, labels } from "@/i18n";

const copy = labels.excelExport;
const SHEET_KEYS = ["summary", "channels", "bridge", "products", "actions", "basis"] as const;
const HYPERLINK = '=HYPERLINK("x")';
const HTML = "<b>注意</b>";

async function load(input: DatasetInput = fixture(), filters: AnalysisFilters = {}) {
  const dataset = validateDataset(input).dataset!;
  expect(dataset).not.toBeNull();
  const snapshot = await createSnapshot(dataset, filters, await hashInput(input));
  return { input, dataset, snapshot };
}
/** golden：兩筆待辦（一筆問題是公式、一筆是 HTML），B 引用第一個健檢結果、已完成並置頂。 */
async function golden(): Promise<ExcelExportInput & { diagnosticFacts: number; diagnosticScope: string; diagnosticStep: string }> {
  const { input, dataset, snapshot } = await load();
  const source: ActionSource = { input, dataset, snapshot, revision: 1 };
  const diagnostic = snapshot.report.diagnostics[0];
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), source, "A", undefined, { problem: HYPERLINK, action: "+加碼廣告" });
  actions = addActionDraft(actions, source, "B", diagnostic.id, { problem: HTML });
  actions = editBoundAction(actions, "A", { owner_role: "@行銷", deadline: "2026-10-10" });
  actions = editActionManagement(actions, "B", { execution_status: "completed" }, "2026-10-03");
  actions = pinAction(actions, "B", true);
  return {
    summary: buildManagerSummary(snapshot), snapshot, dataset, actions, products: compareProducts(dataset, snapshot.report.scope).rows,
    diagnosticFacts: diagnostic.fact_ids.length, diagnosticScope: scopeLabel(diagnostic.scope, false), diagnosticStep: diagnostic.recommendation,
  };
}
const value = (cell: ExcelCell) => cell.kind === "null" ? null : cell.value;
/** 以表頭（labels 字串）取格子的值，斷言讀的是真的格子而不是位置。 */
function records(sheet: ExcelSheet): Record<string, string | number | null>[] {
  return sheet.rows.map(row => Object.fromEntries(sheet.header.map((header, index) => [header, value(row[index])])));
}
const sheetOf = (workbook: ExcelWorkbook, key: typeof SHEET_KEYS[number]) => workbook.sheets.find(sheet => sheet.name === copy.sheets[key])!;
const cents = (amount: number) => BigInt(Math.round(amount * 100));
const col = copy.columns;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("R6-4 buildExcelWorkbook: six labelled sheets from already-calculated results", () => {
  it("has the six sheets in order, with sheet names and headers taken from labels", async () => {
    const workbook = buildExcelWorkbook(await golden());
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(SHEET_KEYS.map(key => copy.sheets[key]));
    expect(new Set(workbook.sheets.map(sheet => sheet.name)).size).toBe(6);
    for (const key of SHEET_KEYS) {
      const sheet = sheetOf(workbook, key);
      expect(sheet.header, key).toEqual(Object.values(col[key]));
      expect(sheet.formats, key).toHaveLength(sheet.header.length);
      for (const row of sheet.rows) expect(row, key).toHaveLength(sheet.header.length);
    }
    // 03 §6：Excel 用新名稱；拆解表與畫面同名，欄名沿用既有指標字串。
    expect(copy.sheets.bridge).toBe(labels.sections.bridge);
    expect(col.channels.previous_net_revenue).toBe(`${labels.periods.previous}${labels.metrics.net_revenue.label}`);
  });

  it("summary: scope lines, the two key deltas (golden 2250 → 2470, +220) and the three things", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "summary"));
    const gold = expected("golden");
    const s = copy.summary;
    const scope = rows.filter(row => row[col.summary.section] === s.sections.scope);
    expect(scope.map(row => [row[col.summary.item], row[col.summary.detail]])).toEqual([
      [s.items.dataset, "golden-v1"], [s.items.source, labels.status.demo], [s.items.asOf, "2026-08-03"],
      [s.items.previous, fill(s.periodValue, { start: "2026-08-01", end: "2026-08-01", days: 1 })],
      [s.items.current, fill(s.periodValue, { start: "2026-08-02", end: "2026-08-02", days: 1 })],
      [s.items.comparison, labels.periods.sameDays], [s.items.channels, "DTC、MARKETPLACE"],
    ]);
    const revenue = rows.find(row => row[col.summary.section] === s.sections.keyDeltas && row[col.summary.item] === labels.metrics.net_revenue.label)!;
    expect([revenue[col.summary.previous], revenue[col.summary.current], revenue[col.summary.change]]).toEqual([Number(gold.previous.net_revenue), Number(gold.current.net_revenue), 220]);
    expect(revenue[col.summary.scope]).toBe(`${labels.sections.total}（DTC、MARKETPLACE）`);
    expect(revenue[col.summary.detail]).toBeNull();
    const contribution = rows.find(row => row[col.summary.item] === labels.metrics.contribution_after_marketing.label)!;
    expect([contribution[col.summary.previous], contribution[col.summary.current], contribution[col.summary.change]]).toEqual([570, 255, -315]);
    const three = rows.filter(row => row[col.summary.section] === s.sections.topThree);
    expect(three).toHaveLength(input.summary.priorities.length);
    expect(three).toHaveLength(3);
    for (const [index, item] of input.summary.priorities.entries()) {
      expect(three[index][col.summary.item]).toBe(fill(s.priorityItem, { n: index + 1, headline: item.title }));
      expect(three[index][col.summary.impact]).toBe(Number((item.impact ?? item.ranking_amount).value));
      expect(three[index][col.summary.detail]).toBe(fill(s.nextStep, { text: item.recommendation }));
    }
    // 第一件事是「營收多了、扣廣告後貢獻少了 315」：對貢獻影響 −315。
    expect(three[0][col.summary.impact]).toBe(-315);
    expect(rows.some(row => row[col.summary.section] === s.sections.meeting)).toBe(false);
  });

  it("summary: meeting lines when given; decision keys map to labels, unknown or prototype keys stay as typed", async () => {
    const input = await golden();
    const meetingRows = (decision: string) => records(sheetOf(buildExcelWorkbook({ ...input, meeting: { name: "=週會", date: "2026-10-03", decision, notes: "@全員 <script>" } }), "summary"))
      .filter(row => row[col.summary.section] === copy.summary.sections.meeting).map(row => [row[col.summary.item], row[col.summary.detail]]);
    expect(meetingRows("adopted")).toEqual([[copy.summary.items.meetingName, "=週會"], [copy.summary.items.meetingDate, "2026-10-03"], [copy.summary.items.decision, labels.meeting.decisions.adopted], [copy.summary.items.notes, "@全員 <script>"]]);
    expect(meetingRows("constructor")[2][1]).toBe("constructor");
    expect(meetingRows("自訂決議")[2][1]).toBe("自訂決議");
    expect(records(sheetOf(buildExcelWorkbook({ ...input, meeting: null }), "summary")).some(row => row[col.summary.section] === copy.summary.sections.meeting)).toBe(false);
  });

  it("channels: one row per channel plus a total row equal to the key deltas", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "channels"));
    expect(rows).toHaveLength(input.summary.channels.length + 1);
    const pick = (row: Record<string, unknown>) => [row[col.channels.channel], row[col.channels.previous_net_revenue], row[col.channels.current_net_revenue], row[col.channels.net_revenue_change], row[col.channels.previous_contribution], row[col.channels.current_contribution], row[col.channels.contribution_change], row[col.channels.data_status]];
    // 手算：DTC 上期 900+450、本期 1120+360；MARKETPLACE 上期 540+360、本期 640+350。
    expect(rows.map(pick)).toEqual([
      ["DTC", 1350, 1480, 130, 400, 270, -130, labels.status.ready],
      ["MARKETPLACE", 900, 990, 90, 170, -15, -185, labels.status.ready],
      [labels.sections.total, 2250, 2470, 220, 570, 255, -315, labels.status.ready],
    ]);
  });

  it("bridge: contribution 570 → 255, nine components that add up to bridge.sum, and the reconciled sum row", async () => {
    const input = await golden();
    const sheet = sheetOf(buildExcelWorkbook(input), "bridge");
    const rows = records(sheet);
    const gold = expected("golden").bridge as Record<string, string>;
    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({ [col.bridge.item]: labels.metrics.contribution_after_marketing.label, [col.bridge.previous]: 570, [col.bridge.current]: 255, [col.bridge.impact]: -315 });
    const components = rows.slice(1, 10);
    expect(components.map(row => row[col.bridge.item])).toEqual(["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"].map(field => labels.metrics[field as keyof typeof labels.metrics].label));
    expect(components.map(row => row[col.bridge.impact])).toEqual(["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"].map(field => Number(gold[field])));
    const total = components.reduce((sum, row) => sum + cents(row[col.bridge.impact] as number), 0n);
    expect(total).toBe(-31500n);
    expect(total).toBe(parseCents(input.snapshot.report.bridge.sum.value));
    expect(rows[1][col.bridge.formula]).toBe(labels.ui.overview.amountDeltaFormula);
    expect(rows[2][col.bridge.formula]).toBe(labels.ui.overview.costDeltaFormula);
    expect(rows[10]).toMatchObject({ [col.bridge.item]: labels.ui.export.bridgeSumLabel, [col.bridge.previous]: null, [col.bridge.current]: null, [col.bridge.impact]: Number(gold.sum), [col.bridge.formula]: labels.ui.overview.bridgeReconciled });
  });

  it("products: one row per compareProducts row, hand-computed golden values, ratio as a decimal", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "products"));
    expect(rows).toHaveLength(input.products!.length);
    const c = col.products;
    expect(rows.map(row => [row[c.channel], row[c.sku], row[c.category], row[c.current_units], row[c.previous_net_revenue], row[c.current_net_revenue], row[c.previous_gross_profit], row[c.current_gross_profit], row[c.gross_profit_change], row[c.data_status]])).toEqual([
      ["DTC", "A", "HOME", 3, 900, 1120, 500, 540, 40, labels.productHighlights.status.both],
      ["DTC", "B", "CARE", 1, 450, 360, 250, 200, -50, labels.productHighlights.status.both],
      ["MARKETPLACE", "A", "HOME", 3, 540, 640, 270, 280, 10, labels.productHighlights.status.both],
      ["MARKETPLACE", "B", "CARE", 1, 360, 350, 180, 125, -55, labels.productHighlights.status.both],
    ]);
    // 540 ÷ 1120、200 ÷ 360、280 ÷ 640、125 ÷ 350（12 位小數字串轉小數，不是百分比）。
    expect(rows.map(row => row[c.current_gross_margin])).toEqual([0.482142857143, 0.555555555556, 0.4375, 0.357142857143]);
  });

  it("products: data status text for current-only / previous-only rows, and empty cells for unknown values", async () => {
    const base = fixture();
    const sales = (base.files["sales_daily.csv"] as string).split("\n").filter(line => !line.startsWith("2026-08-01,DTC,B,") && !line.startsWith("2026-08-02,MARKETPLACE,B,")).join("\n");
    const changed = await load({ ...base, files: { ...base.files, "sales_daily.csv": sales } });
    const rows = records(sheetOf(buildExcelWorkbook({ summary: buildManagerSummary(changed.snapshot), ...changed, actions: emptyActionWorkspace(), products: compareProducts(changed.dataset, changed.snapshot.report.scope).rows }), "products"));
    const c = col.products;
    const status = Object.fromEntries(rows.map(row => [`${row[c.channel]}/${row[c.sku]}`, row[c.data_status]]));
    expect(status).toEqual({ "DTC/A": labels.productHighlights.status.both, "DTC/B": labels.productHighlights.status.current_only, "MARKETPLACE/A": labels.productHighlights.status.both, "MARKETPLACE/B": labels.productHighlights.status.previous_only });
    // 本期沒有銷售列（已確認完整）：件數與淨營收為 0，毛利率分母為 0 → 空格。
    const gone = rows.find(row => row[c.channel] === "MARKETPLACE" && row[c.sku] === "B")!;
    expect([gone[c.current_units], gone[c.current_net_revenue], gone[c.current_gross_margin], gone[c.gross_profit_change]]).toEqual([0, 0, null, -180]);

    const missing = await load(fixture("errors/missing_cogs"));
    const missingSummary = buildManagerSummary(missing.snapshot);
    const workbook = buildExcelWorkbook({ summary: missingSummary, ...missing, actions: emptyActionWorkspace(), products: compareProducts(missing.dataset, missing.snapshot.report.scope).rows });
    const dtcA = records(sheetOf(workbook, "products")).find(row => row[c.channel] === "DTC" && row[c.sku] === "A")!;
    expect([dtcA[c.current_net_revenue], dtcA[c.current_gross_profit], dtcA[c.current_gross_margin], dtcA[c.gross_profit_change], dtcA[c.data_status]]).toEqual([1120, null, null, null, labels.productHighlights.status.cost_unknown]);
    const channelRows = records(sheetOf(workbook, "channels"));
    expect(channelRows.find(row => row[col.channels.channel] === "DTC")![col.channels.data_status]).toBe(labels.status.partial);
    expect(channelRows.find(row => row[col.channels.channel] === "MARKETPLACE")![col.channels.data_status]).toBe(labels.status.ready);
    const contribution = records(sheetOf(workbook, "summary")).find(row => row[col.summary.item] === labels.metrics.contribution_after_marketing.label)!;
    expect(contribution[col.summary.current]).toBeNull();
    expect(contribution[col.summary.detail]).toBe(fill(labels.ui.managerSummary.missingWithReasons, { reasons: "MISSING_COGS" }));
    const bridge = records(sheetOf(workbook, "bridge"));
    expect(bridge.find(row => row[col.bridge.item] === labels.metrics.cogs_net.label)![col.bridge.impact]).toBeNull();
    expect(bridge[10]).toMatchObject({ [col.bridge.impact]: null, [col.bridge.formula]: labels.status.missing });
  });

  it("actions: one row per action in priority order; status, pinned and scope text come from labels", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "actions"));
    const c = col.actions;
    expect(rows).toEqual([
      { [c.priority]: 1, [c.problem]: HTML, [c.step]: input.diagnosticStep, [c.owner]: labels.actionBoard.unassigned, [c.due]: labels.actionBoard.noDeadline, [c.status]: labels.actions.statuses.done, [c.status_updated_at]: "2026-10-03", [c.pinned]: copy.actions.pinned, [c.evidence_count]: input.diagnosticFacts, [c.scope]: input.diagnosticScope, [c.caution]: null },
      { [c.priority]: 2, [c.problem]: HYPERLINK, [c.step]: "+加碼廣告", [c.owner]: "@行銷", [c.due]: "2026-10-10", [c.status]: labels.actions.statuses.not_started, [c.status_updated_at]: null, [c.pinned]: copy.actions.notPinned, [c.evidence_count]: 0, [c.scope]: `${labels.sections.total}（DTC、MARKETPLACE）`, [c.caution]: null },
    ]);
    expect(input.diagnosticFacts).toBeGreaterThan(0);
  });

  it("actions bound to an older dataset carry the stale badge", async () => {
    const input = await golden();
    const older = { ...input.actions, active_dataset_hash: "another-dataset" };
    const rows = records(sheetOf(buildExcelWorkbook({ ...input, actions: older }), "actions"));
    expect(rows.map(row => row[col.actions.caution])).toEqual([labels.actions.staleBadge, labels.actions.staleBadge]);
  });

  it("basis: every basis item, the alias note, the tax-conversion sentence and the technical versions", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "basis"));
    const b = copy.basis;
    expect(rows.filter(row => row[col.basis.section] === b.sections.basis && row[col.basis.item] === null).map(row => row[col.basis.detail])).toEqual([...labels.basis.items]);
    expect(rows.some(row => row[col.basis.section] === b.sections.preprocessing)).toBe(false);
    const technical = Object.fromEntries(rows.filter(row => row[col.basis.section] === b.sections.technical).map(row => [row[col.basis.item], row[col.basis.detail]]));
    expect(Object.values(technical)).toEqual(["golden-v1", input.snapshot.dataset_hash, input.snapshot.filter_hash, "contribution-v1", "assist-kpi-v1", "TWD", "Asia/Taipei"]);
    expect(input.snapshot.dataset_hash).toMatch(/^[0-9a-f]{64}$/);

    const conversion: TaxConversion = { basis: "inclusive", rate: "0.05", fields: ["gross_sales", "ad_spend"], rows_converted: 8 };
    const converted = records(sheetOf(buildExcelWorkbook({ ...input, conversion }), "basis")).filter(row => row[col.basis.section] === b.sections.preprocessing);
    expect(converted).toEqual([{ [col.basis.section]: b.sections.preprocessing, [col.basis.item]: b.conversion, [col.basis.detail]: conversionSentence(conversion) }]);
    expect(converted[0][col.basis.detail]).toContain("5%");
    // 摘要建立時已帶換算句、匯出時沒給 conversion：沿用摘要那一句。
    const fromSummary = records(sheetOf(buildExcelWorkbook({ ...input, summary: buildManagerSummary(input.snapshot, { conversion }) }), "basis"));
    expect(fromSummary.find(row => row[col.basis.section] === b.sections.preprocessing)![col.basis.detail]).toBe(conversionSentence(conversion));
  });

  it("no products and no actions still yields six sheets, the two lists with headers only", async () => {
    const input = await golden();
    const workbook = buildExcelWorkbook({ ...input, products: undefined, actions: emptyActionWorkspace(), meeting: undefined });
    expect(workbook.sheets).toHaveLength(6);
    expect(sheetOf(workbook, "products").rows).toEqual([]);
    expect(sheetOf(workbook, "actions").rows).toEqual([]);
    expect(sheetOf(buildExcelWorkbook({ ...input, products: [] }), "products").rows).toEqual([]);
  });

  it("refuses a summary built from another snapshot, and never mutates its inputs", async () => {
    const input = await golden();
    const dtc = await load(fixture(), { channels: ["DTC"] });
    expect(() => buildExcelWorkbook({ ...input, summary: buildManagerSummary(dtc.snapshot) })).toThrow("EXCEL_SOURCE_MISMATCH");
    const before = structuredClone({ summary: input.summary, snapshot: input.snapshot, actions: input.actions, products: input.products });
    buildExcelWorkbook(input);
    expect({ summary: input.summary, snapshot: input.snapshot, actions: input.actions, products: input.products }).toEqual(before);
  });
});

describe("R6-4 cell converters", () => {
  it("money: two-decimal strings become numbers, null stays empty, malformed throws, beyond 10 trillion keeps the exact text", () => {
    expect(moneyCell("220.00")).toEqual({ kind: "number", value: 220 });
    expect(moneyCell("-315.00")).toEqual({ kind: "number", value: -315 });
    expect(moneyCell("0.10")).toEqual({ kind: "number", value: 0.1 });
    expect(moneyCell("-0.00")).toEqual({ kind: "number", value: 0 });
    expect(Object.is((moneyCell("-0.00") as { value: number }).value, -0)).toBe(false);
    expect(moneyCell(null)).toEqual({ kind: "null" });
    for (const bad of ["abc", "1.234", "1e3", "12,000.00", " 1.00"]) expect(() => moneyCell(bad), bad).toThrow();
    const largest = moneyCell("9999999999999.99");
    expect(largest.kind).toBe("number");
    expect((largest as { value: number }).value.toFixed(2)).toBe("9999999999999.99");
    expect(moneyCell("10000000000000.00")).toEqual({ kind: "text", value: "10000000000000.00" });
    expect(moneyCell("-10000000000000.00")).toEqual({ kind: "text", value: "-10000000000000.00" });
  });

  it("ratio: decimal strings become decimals (not percentages); count: integers, unsafe integers keep the exact text", () => {
    expect(ratioCell("0.482142857143")).toEqual({ kind: "number", value: 0.482142857143 });
    expect(ratioCell("-1.500000000000")).toEqual({ kind: "number", value: -1.5 });
    expect(ratioCell(null)).toEqual({ kind: "null" });
    for (const bad of ["12%", "1e-3", "", "NaN"]) expect(() => ratioCell(bad), bad).toThrow("INVALID_RATIO");
    expect(countCell("3")).toEqual({ kind: "number", value: 3 });
    expect(countCell("0")).toEqual({ kind: "number", value: 0 });
    expect(countCell(null)).toEqual({ kind: "null" });
    expect(countCell("9007199254740993")).toEqual({ kind: "text", value: "9007199254740993" });
    for (const bad of ["1.5", "3 件", ""]) expect(() => countCell(bad), bad).toThrow("INVALID_COUNT");
  });

  it("text: the same leading-character rule as encodeCsv", () => {
    const samples = ["=1+1", "+886", "-5", "@SUM(A1)", "\tcmd", "\rcmd", "\ncmd", " lead", "\u00a0nbsp", "\u200bzero", "\u202eRTL", "\ufeffbom", "\u0001ctl", "normal", "a=b", "中文", "100", "", "'quoted"];
    for (const sample of samples) {
      const csvPrefixed = encodeCsv([[{ kind: "text", value: sample }]]) === `\ufeff"'${sample.replaceAll('"', '""')}"\r\n`;
      expect(excelText(sample), JSON.stringify(sample)).toBe(csvPrefixed ? `'${sample}` : sample);
    }
    expect(samples.filter(sample => excelText(sample) !== sample)).toHaveLength(13);
    expect(excelText(HYPERLINK)).toBe(`'${HYPERLINK}`);
    expect(excelText(HTML)).toBe(HTML);
  });

  it("text: truncates at Excel's cell limit without splitting a surrogate pair, repairs lone surrogates, escapes literal _xHHHH_", () => {
    const long = excelText("a".repeat(40_000));
    expect(long).toHaveLength(EXCEL_CELL_TEXT_LIMIT);
    expect(long.endsWith(copy.truncated)).toBe(true);
    expect(excelText("a".repeat(EXCEL_CELL_TEXT_LIMIT))).toHaveLength(EXCEL_CELL_TEXT_LIMIT);
    const end = EXCEL_CELL_TEXT_LIMIT - copy.truncated.length;
    const emoji = excelText(`${"a".repeat(end - 1)}😀${"b".repeat(100)}`);
    expect(emoji.length).toBeLessThanOrEqual(EXCEL_CELL_TEXT_LIMIT);
    expect(emoji).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(excelText("a\ud800b")).toBe("a�b");
    expect(excelText("\udc00x")).toBe("�x");
    expect(excelText("😀")).toBe("😀");
    expect(excelText("_x0041_ and _X0041_ and _x00zz_")).toBe("_x005F_x0041_ and _X0041_ and _x00zz_");
  });

  it("text: removes U+FFFE/U+FFFF (not allowed in XML) and turns DEL/C1 controls into U+FFFD", () => {
    expect(excelText("a￾b￿c")).toBe("abc");
    expect(excelText("a\u007fb\u0085c\u009fd")).toBe("a�b�c�d");
    // 開頭的 C1 控制字元改成 U+FFFD 後就不是公式字元，不必再加 '。
    expect(excelText("\u0085=cmd")).toBe("�=cmd");
    expect(excelText("￾=cmd")).toBe("'=cmd");
    for (const sample of ["a￾b", "x\u0080y", "￿"]) expect(excelText(sample)).not.toMatch(/[￾￿\u007f-\u009f]/);
  });

  it("text: escapes overlapping literal _xHHHH_ so every underscore that starts one is protected", () => {
    // 原文 _x005F_x0041_ 有兩個 _xHHHH_（共用中間的 _），兩個 _ 都要寫成 _x005F_。
    expect(excelText("_x005F_x0041_")).toBe("_x005F_x005F_x005F_x0041_");
    expect(excelText("__x0041_")).toBe("__x005F_x0041_");
  });

  it("text: escaping happens before truncation, so the final text never exceeds Excel's limit", () => {
    const budget = EXCEL_CELL_TEXT_LIMIT - copy.truncated.length;
    // 32,760 字＋_x0041_：原文剛好 32,767 字，跳脫後 32,773 字，必須截斷。
    const boundary = excelText(`${"a".repeat(32_760)}_x0041_`);
    expect(boundary.length).toBeLessThanOrEqual(EXCEL_CELL_TEXT_LIMIT);
    expect(boundary).toBe(`${"a".repeat(budget)}${copy.truncated}`);
    // 原文 32,767 字、沒有要跳脫的字：不截斷。
    expect(excelText("a".repeat(EXCEL_CELL_TEXT_LIMIT))).toBe("a".repeat(EXCEL_CELL_TEXT_LIMIT));
    // 跳脫後剛好放得下：整段 _x005F_x0041_ 保留，總長＝上限。
    const fits = excelText(`${"a".repeat(budget - 13)}_x0041_${"b".repeat(100)}`);
    expect(fits).toBe(`${"a".repeat(budget - 13)}_x005F_x0041_${copy.truncated}`);
    expect(fits).toHaveLength(EXCEL_CELL_TEXT_LIMIT);
    // 差一個字放不下：整段捨去，不留下半個跳脫序列。
    for (const shift of [12, 7, 3, 1]) {
      const cut = excelText(`${"a".repeat(budget - shift)}_x0041_${"b".repeat(100)}`);
      expect(cut, String(shift)).toBe(`${"a".repeat(budget - shift)}${copy.truncated}`);
      expect(cut.length).toBeLessThanOrEqual(EXCEL_CELL_TEXT_LIMIT);
    }
    // 大量要跳脫的文字（每 7 字變 13 字）也不超過上限，且結尾前是完整的跳脫序列。
    const dense = excelText("_x0041_".repeat(10_000));
    expect(dense.length).toBeLessThanOrEqual(EXCEL_CELL_TEXT_LIMIT);
    expect(dense.endsWith(`_x005F_x0041_${copy.truncated}`)).toBe(true);
    expect(dense.slice(0, -copy.truncated.length)).toBe("_x005F_x0041_".repeat((dense.length - copy.truncated.length) / 13));
    // 代理對在切點上：不切斷。
    const emoji = excelText(`${"a".repeat(budget - 1)}😀_x0041_${"b".repeat(100)}`);
    expect(emoji).toBe(`${"a".repeat(budget - 1)}${copy.truncated}`);
  });

  it("sheet names: strips [ ] : * ? / \\ and edge quotes, keeps 31 characters, falls back for empty or History", () => {
    expect(excelSheetName("a[b]c:d*e?f/g\\h", "S")).toBe("abcdefgh");
    expect(excelSheetName("x".repeat(40), "S")).toHaveLength(31);
    expect(excelSheetName("'quoted'", "S")).toBe("quoted");
    expect(excelSheetName("[]:*?/\\", "S1")).toBe("S1");
    expect(excelSheetName("", "S2")).toBe("S2");
    expect(excelSheetName("history", "S3")).toBe("S3");
    expect(excelSheetName(`${"x".repeat(30)}😀`, "S")).toBe("x".repeat(30));
    for (const key of SHEET_KEYS) expect(excelSheetName(copy.sheets[key], "S")).toBe(copy.sheets[key]);
  });
});

/** 解析 .xlsx：工作表、格子型別，以及原始 XML 裡沒有任何公式標籤。 */
function parse(bytes: Uint8Array) {
  const book = XLSX.read(bytes, { type: "array", cellNF: true });
  const zip = XLSX.CFB.read(bytes, { type: "array" });
  const paths: string[] = zip.FullPaths;
  const sheetXml = paths.filter(path => /\/xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .map(path => new TextDecoder().decode(new Uint8Array(XLSX.CFB.find(zip, path.replace(/^Root Entry/, ""))!.content)));
  return { book, sheetXml };
}
const cellsOf = (sheet: XLSX.WorkSheet) => Object.entries(sheet).filter(([key]) => !key.startsWith("!")).map(([address, cell]) => ({ address, cell: cell as XLSX.CellObject }));

describe("R6-4 writeExcel: real .xlsx parsed back with SheetJS", () => {
  it("keeps sheet names, only string/number cells, no formulas, escaped formula text and numeric amounts", async () => {
    const input = await golden();
    const workbook = buildExcelWorkbook(input);
    const bytes = await writeExcel(workbook);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const { book, sheetXml } = parse(bytes);
    expect(book.SheetNames).toEqual(workbook.sheets.map(sheet => sheet.name));
    expect(sheetXml).toHaveLength(6);
    for (const xml of sheetXml) expect(xml).not.toMatch(/<f[\s>]/);
    const all = book.SheetNames.flatMap(name => cellsOf(book.Sheets[name]));
    for (const { address, cell } of all) {
      expect(["s", "n"], address).toContain(cell.t);
      expect(cell.f, address).toBeUndefined();
    }
    const actions = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[copy.sheets.actions]);
    expect(actions.map(row => row[col.actions.problem])).toEqual([HTML, `'${HYPERLINK}`]);
    expect(actions.map(row => row[col.actions.step])[1]).toBe("'+加碼廣告");
    expect(actions.map(row => row[col.actions.owner])[1]).toBe("'@行銷");
    const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[copy.sheets.summary]);
    const revenue = summary.find(row => row[col.summary.item] === labels.metrics.net_revenue.label)!;
    expect(revenue[col.summary.change]).toBe(220);
    expect(typeof revenue[col.summary.change]).toBe("number");
    // 金額格的顯示格式是千分位兩位小數，比率是百分比；數值本身不變。
    const sheet = book.Sheets[copy.sheets.summary];
    const changeCell = cellsOf(sheet).find(({ cell }) => cell.t === "n" && cell.v === 220)!.cell;
    expect(changeCell.z).toBe("#,##0.00");
    const products = book.Sheets[copy.sheets.products];
    const margin = cellsOf(products).find(({ cell }) => cell.v === 0.4375)!.cell;
    expect([margin.t, margin.z, margin.w]).toEqual(["n", "0.00%", "43.75%"]);
    const header = XLSX.utils.sheet_to_json<string[]>(book.Sheets[copy.sheets.channels], { header: 1 })[0];
    expect(header).toEqual(Object.values(col.channels));
    const channelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[copy.sheets.channels]);
    expect(channelRows.at(-1)).toMatchObject({ [col.channels.channel]: labels.sections.total, [col.channels.net_revenue_change]: 220, [col.channels.contribution_change]: -315 });
  });

  it("writes header-only sheets when there are no products or actions, and empty cells for unknown values", async () => {
    const input = await golden();
    const { book } = parse(await writeExcel(buildExcelWorkbook({ ...input, products: undefined, actions: emptyActionWorkspace() })));
    expect(book.SheetNames).toEqual(SHEET_KEYS.map(key => copy.sheets[key]));
    for (const key of ["products", "actions"] as const) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[copy.sheets[key]], { header: 1 });
      expect(rows).toEqual([Object.values(col[key])]);
    }
    const missing = await load(fixture("errors/missing_cogs"));
    const parsed = parse(await writeExcel(buildExcelWorkbook({ summary: buildManagerSummary(missing.snapshot), ...missing, actions: emptyActionWorkspace() })));
    const bridge = XLSX.utils.sheet_to_json<unknown[]>(parsed.book.Sheets[copy.sheets.bridge], { header: 1, defval: null });
    expect(bridge.at(-1)).toEqual([labels.ui.export.bridgeSumLabel, null, null, null, labels.status.missing]);
  });

  it("round-trips untrusted text exactly (apart from the leading quote) and keeps every cell within Excel's limit", async () => {
    const tricky = [" lead", "a\r\nb", "_x0041_", "😀 表情", "a\ud800b", "x".repeat(40_000), "<script>alert(1)</script>", "@user", "-1+2", "Tab\tinside"];
    const sheet: ExcelSheet = { name: "測試", header: ["文字"], rows: tricky.map(item => [{ kind: "text", value: item }]) };
    const { book } = parse(await writeExcel({ sheets: [sheet] }));
    const values = XLSX.utils.sheet_to_json<string[]>(book.Sheets["測試"], { header: 1 }).slice(1).map(row => row[0]);
    expect(values).toEqual(tricky.map(excelText).map(item => item.replace(/_x005F_(x[0-9a-fA-F]{4}_)/g, "_$1")));
    expect(values[2]).toBe("_x0041_");
    expect(values[0]).toBe("' lead");
    expect(values[5]).toHaveLength(EXCEL_CELL_TEXT_LIMIT);
  });

  it("round-trips overlapping _xHHHH_, removes noncharacters and keeps escaped long text within the limit after parsing", async () => {
    const budget = EXCEL_CELL_TEXT_LIMIT - copy.truncated.length;
    const tricky = ["_x005F_x0041_", "__x0041__x0042_", "a￾b￿c", "a\u0085b", `${"a".repeat(32_760)}_x0041_`, `${"a".repeat(budget - 13)}_x0041_${"b".repeat(100)}`];
    const sheet: ExcelSheet = { name: "測試", header: ["文字"], rows: tricky.map(item => [{ kind: "text", value: item }]) };
    const { book } = parse(await writeExcel({ sheets: [sheet] }));
    const values = XLSX.utils.sheet_to_json<string[]>(book.Sheets["測試"], { header: 1 }).slice(1).map(row => row[0]);
    expect(values[0]).toBe("_x005F_x0041_");
    expect(values[1]).toBe("__x0041__x0042_");
    expect(values[2]).toBe("abc");
    expect(values[3]).toBe("a�b");
    expect(values[4]).toBe(`${"a".repeat(budget)}${copy.truncated}`);
    expect(values[5]).toBe(`${"a".repeat(budget - 13)}_x0041_${copy.truncated}`);
    for (const value of values) expect(value.length).toBeLessThanOrEqual(EXCEL_CELL_TEXT_LIMIT);
  });

  it("sanitizes and de-duplicates sheet names", async () => {
    const one = (name: string): ExcelSheet => ({ name, header: ["a"], rows: [] });
    const { book } = parse(await writeExcel({ sheets: [one("摘要"), one("摘要"), one("A/B?"), one(""), one("x".repeat(40)), one("X".repeat(40))] }));
    expect(book.SheetNames).toEqual(["摘要", "摘要 (2)", "AB", "Sheet4", "x".repeat(31), `${"X".repeat(27)} (2)`]);
    for (const name of book.SheetNames) expect(name.length).toBeLessThanOrEqual(31);
  });

  it("rejects an empty workbook, ragged rows, unknown cell kinds and non-finite numbers before writing", async () => {
    await expect(writeExcel({ sheets: [] })).rejects.toThrow("EXCEL_EMPTY_WORKBOOK");
    await expect(writeExcel({ sheets: [{ name: "a", header: [], rows: [] }] })).rejects.toThrow("EXCEL_EMPTY_HEADER");
    await expect(writeExcel({ sheets: [{ name: "a", header: ["x", "y"], rows: [[{ kind: "null" }]] }] })).rejects.toThrow("EXCEL_ROW_WIDTH");
    await expect(writeExcel({ sheets: [{ name: "a", header: ["x"], rows: [], formats: [null, null] }] })).rejects.toThrow("EXCEL_FORMAT_WIDTH");
    await expect(writeExcel({ sheets: [{ name: "a", header: ["x"], rows: [[{ kind: "formula", value: "=1" } as unknown as ExcelCell]] }] })).rejects.toThrow("INVALID_EXCEL_CELL");
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) await expect(writeExcel({ sheets: [{ name: "a", header: ["x"], rows: [[{ kind: "number", value: bad }]] }] })).rejects.toThrow("INVALID_EXCEL_NUMBER");
    await expect(writeExcel({ sheets: [{ name: "a", header: ["x"], rows: [[{ kind: "text", value: 1 as unknown as string }]] }] })).rejects.toThrow("INVALID_TEXT_CELL");
  });
});

/** 模擬瀏覽器：攔下 createObjectURL 的 Blob 與 <a download> 的點擊。 */
function fakeBrowser() {
  const blobs: Blob[] = [];
  const link = { href: "", download: "", click: vi.fn() };
  vi.stubGlobal("document", { createElement: vi.fn(() => link) });
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { blobs.push(blob as Blob); return `blob:test/${blobs.length}`; });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  return { blobs, link, revoke };
}

describe("R6-4 downloadBinary and exportExcel (local download only)", () => {
  it("downloadBinary saves a copy of the bytes with the given type and name, then revokes the URL", async () => {
    vi.useFakeTimers();
    const { blobs, link, revoke } = fakeBrowser();
    const bytes = new Uint8Array([1, 2, 3]);
    downloadBinary(bytes, "a.bin", "application/octet-stream");
    bytes[0] = 9;
    expect(link).toMatchObject({ href: "blob:test/1", download: "a.bin" });
    expect(link.click).toHaveBeenCalledOnce();
    expect(blobs[0].type).toBe("application/octet-stream");
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual([1, 2, 3]);
    const buffer = new Uint8Array([4, 5]).buffer;
    downloadBinary(buffer, "b.bin", "application/x-test");
    expect([...new Uint8Array(await blobs[1].arrayBuffer())]).toEqual([4, 5]);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
    expect(revoke).toHaveBeenCalledWith("blob:test/2");
  });

  it("exportExcel builds, writes and downloads a parseable workbook named profitlens.xlsx by default", async () => {
    const input = await golden();
    const { blobs, link } = fakeBrowser();
    await exportExcel(input);
    expect(link.download).toBe("profitlens.xlsx");
    expect(blobs[0].type).toBe(EXCEL_MIME);
    const { book } = parse(new Uint8Array(await blobs[0].arrayBuffer()));
    expect(book.SheetNames).toEqual(SHEET_KEYS.map(key => copy.sheets[key]));
    await exportExcel(input, "週會.xlsx");
    expect(link.download).toBe("週會.xlsx");
  });

  it("exportExcel does not download anything when the workbook cannot be built", async () => {
    const input = await golden();
    const dtc = await load(fixture(), { channels: ["DTC"] });
    const { blobs, link } = fakeBrowser();
    await expect(exportExcel({ ...input, summary: buildManagerSummary(dtc.snapshot) })).rejects.toThrow("EXCEL_SOURCE_MISMATCH");
    expect(blobs).toHaveLength(0);
    expect(link.click).not.toHaveBeenCalled();
  });
});
