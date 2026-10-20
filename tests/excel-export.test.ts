import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { fixture, expected } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { compareProducts } from "@/domain/product-comparison";
import { dateRange } from "@/domain/date";
import { parseCents } from "@/domain/money";
import type { AnalysisFilters, DatasetInput } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { buildManagerSummary, metricComparison } from "@/application/manager-summary";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { ASSIST_WEEKS_VERSION, assistWeeks } from "@/application/chart-assist-weeks";
import { CHANNEL_WEEKS_VERSION, channelWeeks, recentChannelWeeks } from "@/application/chart-channel-weeks";
import { CUMULATIVE_DAILY_VERSION, cumulativeConclusion, cumulativeDaily } from "@/application/chart-cumulative";
import { DAILY_HEATMAP_VERSION } from "@/application/chart-heatmap";
import { PRODUCT_PARETO_LIMIT, PRODUCT_PARETO_VERSION, productPareto } from "@/application/chart-pareto";
import { CHANNEL_STRUCTURE_VERSION } from "@/application/chart-structure";
import { channelConclusion } from "@/application/chart-takeaways";
import type { ExportVariant } from "@/application/export-variants";
import { productHighlights } from "@/application/product-highlights";
import { bridgeWaterfall, profitWaterfall } from "@/application/waterfall";
import { channelLabel, conversionSentence, scopeLabel, snapshotResolver } from "@/application/copy";
import { heatSectionModel } from "@/components/diagnosis/heat-section";
import { RATE_METRICS, ratesModel, RATES_TABLE_COLUMNS } from "@/components/diagnosis/rates-section";
import { sharePerHundredText, shareSectionModel, shareTableCell, SHARE_TABLE_COLUMNS } from "@/components/diagnosis/share-section";
import { paretoSectionModel, PARETO_TABLE_COLUMNS, varianceSectionModel, VARIANCE_TABLE_COLUMNS, type ProductChartScope } from "@/components/products/highlight-charts";
import { encodeCsv } from "@/application/export";
import { downloadBinary } from "@/application/download";
import { buildExcelWorkbook, countCell, EXCEL_CELL_TEXT_LIMIT, EXCEL_MIME, EXCEL_NUMBER_FORMATS, excelHeader, excelSheetName, excelText, exportExcel, moneyCell, ratioCell, writeExcel, type ExcelCell, type ExcelExportInput, type ExcelSheet, type ExcelWorkbook } from "@/application/excel-export";
import { formatPeriodExport, metricDefinitions, MINUS } from "@/application/presentation";
import type { TaxConversion } from "@/application/tax-basis";
import { fill, labels } from "@/i18n";

const copy = labels.exports.excel;
const SHEET_KEYS = ["summary", "channels", "bridge", "products", "actions", "basis"] as const;
/** V3-9b（D-V3-8、PRD §9.6）：六張既有工作表之後多一張管理損益表；待辦工作表最後多一欄廣告決策（F13）。V4-9b（C34）：管理損益表之前多一張「圖表資料」。 */
const SHEET_NAMES = [...SHEET_KEYS.map(key => copy.sheets[key]), labels.exports.chartsV4.excel.sheet, labels.exports.variantsV3.pnlSheet];
const AD_DECISION = labels.actions.adDecisionV3.csvColumn;
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
    diagnosticFacts: diagnostic.fact_ids.length, diagnosticScope: scopeLabel(diagnostic.scope, snapshotResolver(snapshot)), diagnosticStep: diagnostic.recommendation,
  };
}
const value = (cell: ExcelCell) => cell.kind === "null" ? null : cell.value;
/** 以表頭（labels 字串）取格子的值，斷言讀的是真的格子而不是位置。 */
function records(sheet: ExcelSheet): Record<string, string | number | null>[] {
  return sheet.rows.map(row => Object.fromEntries(sheet.header.map((header, index) => [header, value(row[index])])));
}
const sheetOf = (workbook: ExcelWorkbook, key: typeof SHEET_KEYS[number]) => workbook.sheets.find(sheet => sheet.name === copy.sheets[key])!;
const cents = (amount: number) => BigInt(Math.round(amount * 100));
/**
 * V3-2b §8.5 規則 5：金額欄的表頭加「（元）」（單位只標一次）。這裡逐欄寫出哪些是金額欄（手寫的預期，不從程式反推），
 * col 是實際的表頭字串；labels 原字串仍在 copy.columns。
 */
const MONEY_COLUMNS: { [S in keyof typeof copy.columns]?: readonly (keyof typeof copy.columns[S])[] } = {
  summary: ["previous", "current", "change", "impact"],
  channels: ["previous_net_revenue", "current_net_revenue", "net_revenue_change", "previous_contribution", "current_contribution", "contribution_change"],
  bridge: ["previous", "current", "impact"],
  products: ["previous_net_revenue", "current_net_revenue", "previous_gross_profit", "current_gross_profit", "gross_profit_change"],
};
const moneyHeader = (label: string) => fill(labels.exports.common.moneyColumn, { label });
const col = Object.fromEntries(Object.entries(copy.columns).map(([sheet, columns]) => [sheet, Object.fromEntries(Object.entries(columns).map(([key, label]) => [key, (MONEY_COLUMNS[sheet as keyof typeof copy.columns] as readonly string[] | undefined)?.includes(key) ? moneyHeader(label) : label]))])) as { [S in keyof typeof copy.columns]: Record<keyof typeof copy.columns[S], string> };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("R6-4 buildExcelWorkbook: six labelled sheets from already-calculated results (V3-9b: plus the management P&L sheet)", () => {
  it("has the six sheets in order, with sheet names and headers taken from labels; V3-9b adds the management P&L last and the ad-decision column last on the actions sheet", async () => {
    const workbook = buildExcelWorkbook(await golden());
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(SHEET_NAMES);
    expect(new Set(workbook.sheets.map(sheet => sheet.name)).size).toBe(8);
    for (const key of SHEET_KEYS) {
      const sheet = sheetOf(workbook, key);
      const extra = key === "actions" ? [AD_DECISION] : [];
      expect(sheet.header, key).toEqual([...Object.values(col[key]), ...extra]);
      expect(sheet.header, key).toEqual([...Object.values(copy.columns[key]), ...extra].map((label, index) => excelHeader(label, sheet.formats![index])));
      expect(sheet.formats, key).toHaveLength(sheet.header.length);
      for (const row of sheet.rows) expect(row, key).toHaveLength(sheet.header.length);
    }
    // 03 §6：Excel 用新名稱；拆解表與畫面同名，欄名沿用既有指標字串。
    expect(copy.sheets.bridge).toBe(labels.overview.sections.bridge);
    expect(copy.columns.channels.previous_net_revenue).toBe(`${labels.shell.periods.previous}${labels.metrics.net_revenue.headline}`);
    expect(col.channels.previous_net_revenue).toBe(moneyHeader(`${labels.shell.periods.previous}${labels.metrics.net_revenue.headline}`));
    // V3-2b §3.3：摘要與通路表是 L2（整數元），拆解與商品明細是 L3（到分）。
    expect(sheetOf(workbook, "summary").formats).toEqual([null, null, null, "money_l2", "money_l2", "money_l2", "money_l2", null]);
    expect(sheetOf(workbook, "channels").formats!.filter(Boolean)).toEqual(Array(6).fill("money_l2"));
    expect(sheetOf(workbook, "bridge").formats).toEqual([null, "money", "money", "money", null]);
  });

  it("summary: scope lines, the two key deltas (golden 2250 → 2470, +220) and the three things", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "summary"));
    const gold = expected("golden");
    const s = copy.summary;
    const scope = rows.filter(row => row[col.summary.section] === s.sections.scope);
    expect(scope.map(row => [row[col.summary.item], row[col.summary.detail]])).toEqual([
      [s.items.dataset, "golden-v1"], [s.items.source, labels.shell.status.demo], [s.items.asOf, "2026-08-03"],
      // V3-2b §8.6：版頭期間「YYYY-MM-DD 至 YYYY-MM-DD（天數）」。
      [s.items.previous, formatPeriodExport("2026-08-01", "2026-08-01")],
      [s.items.current, fill(labels.format.units.exportRange, { start: "2026-08-02", end: "2026-08-02", days: 1 })],
      [s.items.comparison, labels.shell.periods.sameDays], [s.items.channels, "DTC、MARKETPLACE"],
    ]);
    const revenue = rows.find(row => row[col.summary.section] === s.sections.keyDeltas && row[col.summary.item] === labels.metrics.net_revenue.headline)!;
    expect([revenue[col.summary.previous], revenue[col.summary.current], revenue[col.summary.change]]).toEqual([Number(gold.previous.net_revenue), Number(gold.current.net_revenue), 220]);
    expect(revenue[col.summary.scope]).toBe(`${labels.overview.sections.total}（DTC、MARKETPLACE）`);
    expect(revenue[col.summary.detail]).toBeNull();
    const contribution = rows.find(row => row[col.summary.item] === labels.metrics.contribution_after_marketing.headline)!;
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
    expect(meetingRows("adopted")).toEqual([[copy.summary.items.meetingName, "=週會"], [copy.summary.items.meetingDate, "2026-10-03"], [copy.summary.items.decision, labels.meeting.form.decisions.adopted], [copy.summary.items.notes, "@全員 <script>"]]);
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
    const ready = fill(labels.shell.status.ready, { date: input.summary.data_as_of });
    expect(rows.map(pick)).toEqual([
      ["DTC", 1350, 1480, 130, 400, 270, -130, ready],
      ["MARKETPLACE", 900, 990, 90, 170, -15, -185, ready],
      [labels.overview.sections.total, 2250, 2470, 220, 570, 255, -315, ready],
    ]);
  });

  it("bridge: contribution 570 → 255, nine components that add up to bridge.sum, and the reconciled sum row", async () => {
    const input = await golden();
    const sheet = sheetOf(buildExcelWorkbook(input), "bridge");
    const rows = records(sheet);
    const gold = expected("golden").bridge as Record<string, string>;
    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({ [col.bridge.item]: labels.metrics.contribution_after_marketing.headline, [col.bridge.previous]: 570, [col.bridge.current]: 255, [col.bridge.impact]: -315 });
    const components = rows.slice(1, 10);
    expect(components.map(row => row[col.bridge.item])).toEqual(["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"].map(field => labels.metrics[field as keyof typeof labels.metrics].headline));
    expect(components.map(row => row[col.bridge.impact])).toEqual(["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"].map(field => Number(gold[field])));
    const total = components.reduce((sum, row) => sum + cents(row[col.bridge.impact] as number), 0n);
    expect(total).toBe(-31500n);
    expect(total).toBe(parseCents(input.snapshot.report.bridge.sum.value));
    expect(rows[1][col.bridge.formula]).toBe(labels.overview.page.amountDeltaFormula);
    expect(rows[2][col.bridge.formula]).toBe(labels.overview.page.costDeltaFormula);
    expect(rows[10]).toMatchObject({ [col.bridge.item]: labels.exports.common.bridgeSumLabel, [col.bridge.previous]: null, [col.bridge.current]: null, [col.bridge.impact]: Number(gold.sum), [col.bridge.formula]: labels.overview.page.bridgeReconciled });
  });

  it("products: one row per compareProducts row, hand-computed golden values, ratio as a decimal", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "products"));
    expect(rows).toHaveLength(input.products!.length);
    const c = col.products;
    expect(rows.map(row => [row[c.channel], row[c.sku], row[c.category], row[c.current_units], row[c.previous_net_revenue], row[c.current_net_revenue], row[c.previous_gross_profit], row[c.current_gross_profit], row[c.gross_profit_change], row[c.data_status]])).toEqual([
      ["DTC", "A", "HOME", 3, 900, 1120, 500, 540, 40, labels.products.highlights.status.both],
      ["DTC", "B", "CARE", 1, 450, 360, 250, 200, -50, labels.products.highlights.status.both],
      ["MARKETPLACE", "A", "HOME", 3, 540, 640, 270, 280, 10, labels.products.highlights.status.both],
      ["MARKETPLACE", "B", "CARE", 1, 360, 350, 180, 125, -55, labels.products.highlights.status.both],
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
    expect(status).toEqual({ "DTC/A": labels.products.highlights.status.both, "DTC/B": labels.products.highlights.status.current_only, "MARKETPLACE/A": labels.products.highlights.status.both, "MARKETPLACE/B": labels.products.highlights.status.previous_only });
    // 本期沒有銷售列（已確認完整）：件數與淨營收為 0，毛利率分母為 0 → 空格。
    const gone = rows.find(row => row[c.channel] === "MARKETPLACE" && row[c.sku] === "B")!;
    expect([gone[c.current_units], gone[c.current_net_revenue], gone[c.current_gross_margin], gone[c.gross_profit_change]]).toEqual([0, 0, null, -180]);

    const missing = await load(fixture("errors/missing_cogs"));
    const missingSummary = buildManagerSummary(missing.snapshot);
    const workbook = buildExcelWorkbook({ summary: missingSummary, ...missing, actions: emptyActionWorkspace(), products: compareProducts(missing.dataset, missing.snapshot.report.scope).rows });
    const dtcA = records(sheetOf(workbook, "products")).find(row => row[c.channel] === "DTC" && row[c.sku] === "A")!;
    expect([dtcA[c.current_net_revenue], dtcA[c.current_gross_profit], dtcA[c.current_gross_margin], dtcA[c.gross_profit_change], dtcA[c.data_status]]).toEqual([1120, null, null, null, labels.products.highlights.status.cost_unknown]);
    const channelRows = records(sheetOf(workbook, "channels"));
    expect(channelRows.find(row => row[col.channels.channel] === "DTC")![col.channels.data_status]).toBe(labels.shell.status.partial);
    expect(channelRows.find(row => row[col.channels.channel] === "MARKETPLACE")![col.channels.data_status]).toBe(fill(labels.shell.status.ready, { date: missingSummary.data_as_of }));
    const contribution = records(sheetOf(workbook, "summary")).find(row => row[col.summary.item] === labels.metrics.contribution_after_marketing.headline)!;
    expect(contribution[col.summary.current]).toBeNull();
    expect(contribution[col.summary.detail]).toBe(fill(labels.meeting.managerSummary.missingWithReasons, { reasons: "MISSING_COGS" }));
    const bridge = records(sheetOf(workbook, "bridge"));
    expect(bridge.find(row => row[col.bridge.item] === labels.metrics.cogs_net.headline)![col.bridge.impact]).toBeNull();
    expect(bridge[10]).toMatchObject({ [col.bridge.impact]: null, [col.bridge.formula]: labels.shell.status.missing });
  });

  it("actions: one row per action in priority order; status, pinned and scope text come from labels", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "actions"));
    const c = col.actions;
    expect(rows).toEqual([
      { [c.priority]: 1, [c.problem]: HTML, [c.step]: input.diagnosticStep, [c.owner]: labels.actions.board.unassigned, [c.due]: labels.actions.board.noDeadline, [c.status]: labels.actions.form.statuses.done, [c.status_updated_at]: "2026-10-03", [c.pinned]: copy.actions.pinned, [c.evidence_count]: input.diagnosticFacts, [c.scope]: input.diagnosticScope, [c.caution]: null, [AD_DECISION]: null },
      { [c.priority]: 2, [c.problem]: HYPERLINK, [c.step]: "+加碼廣告", [c.owner]: "@行銷", [c.due]: "2026-10-10", [c.status]: labels.actions.form.statuses.not_started, [c.status_updated_at]: null, [c.pinned]: copy.actions.notPinned, [c.evidence_count]: 0, [c.scope]: `${labels.overview.sections.total}（DTC、MARKETPLACE）`, [c.caution]: null, [AD_DECISION]: null },
    ]);
    expect(input.diagnosticFacts).toBeGreaterThan(0);
  });

  it("actions bound to an older dataset carry the stale badge", async () => {
    const input = await golden();
    const older = { ...input.actions, active_dataset_hash: "another-dataset" };
    const rows = records(sheetOf(buildExcelWorkbook({ ...input, actions: older }), "actions"));
    expect(rows.map(row => row[col.actions.caution])).toEqual([labels.actions.form.staleBadge, labels.actions.form.staleBadge]);
  });

  it("basis: every basis item, the alias note, the tax-conversion sentence and the technical versions", async () => {
    const input = await golden();
    const rows = records(sheetOf(buildExcelWorkbook(input), "basis"));
    const b = copy.basis;
    expect(rows.filter(row => row[col.basis.section] === b.sections.basis && row[col.basis.item] === null).map(row => row[col.basis.detail])).toEqual([...labels.glossary.basis.items]);
    expect(rows.some(row => row[col.basis.section] === b.sections.preprocessing)).toBe(false);
    const technical = Object.fromEntries(rows.filter(row => row[col.basis.section] === b.sections.technical).map(row => [row[col.basis.item], row[col.basis.detail]]));
    // V3-9a F12：損益兩平 MER 的版本列接在輔助指標版本之後（D-V3-17＝C，獨立版本 breakeven-mer-v1）。
    expect(Object.values(technical)).toEqual(["golden-v1", input.snapshot.dataset_hash, input.snapshot.filter_hash, "contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "TWD", "Asia/Taipei"]);
    expect(technical[labels.assist.breakevenV3.excelVersion]).toBe("breakeven-mer-v1");
    expect(input.snapshot.dataset_hash).toMatch(/^[0-9a-f]{64}$/);
    // V4-9b（D-V4-12＝A）：技術細節之後（區塊「圖表資料」）列出「圖表資料」用到的每個 B 級版本；golden 本期沒有商品毛利為負，沒有 product-pareto-v1。
    const chartVersions = rows.filter(row => row[col.basis.section] === labels.exports.chartsV4.excel.sheet);
    const versionItem = (section: string) => fill(labels.exports.chartsV4.excel.basisVersion, { section });
    expect(chartVersions.map(row => [row[col.basis.item], row[col.basis.detail]])).toEqual([
      [versionItem(labels.overview.chartsV4.assistSpark.tableTitle), "assist-weeks-v1"],
      [versionItem(labels.diagnosis.chartsV4.channelsSpark.tableTitle), "channel-weeks-v1"],
      // V4-10 G8 兩期每日累計（cumulative-daily-v1）：接在各通路每週之後（CHART_CATALOG 的順序）。
      [versionItem(labels.overview.chartsV4.cumulative.tableTitle), "cumulative-daily-v1"],
      [versionItem(labels.diagnosis.chartsV4.share.section), "channel-structure-v1"],
      [versionItem(fill(labels.diagnosis.chartsV4.heat.section, { metric: metricDefinitions.contribution_after_marketing.label })), "daily-heatmap-v1"],
    ]);
    expect(rows.slice(-chartVersions.length)).toEqual(chartVersions);

    const conversion: TaxConversion = { basis: "inclusive", rate: "0.05", fields: ["gross_sales", "ad_spend"], rows_converted: 8 };
    const converted = records(sheetOf(buildExcelWorkbook({ ...input, conversion }), "basis")).filter(row => row[col.basis.section] === b.sections.preprocessing);
    expect(converted).toEqual([{ [col.basis.section]: b.sections.preprocessing, [col.basis.item]: b.conversion, [col.basis.detail]: conversionSentence(conversion) }]);
    expect(converted[0][col.basis.detail]).toContain("5%");
    // 摘要建立時已帶換算句、匯出時沒給 conversion：沿用摘要那一句。
    const fromSummary = records(sheetOf(buildExcelWorkbook({ ...input, summary: buildManagerSummary(input.snapshot, { conversion }) }), "basis"));
    expect(fromSummary.find(row => row[col.basis.section] === b.sections.preprocessing)![col.basis.detail]).toBe(conversionSentence(conversion));
  });

  it("no products and no actions still yields six sheets (V3-9b: plus the management P&L), the two lists with headers only", async () => {
    const input = await golden();
    const workbook = buildExcelWorkbook({ ...input, products: undefined, actions: emptyActionWorkspace(), meeting: undefined });
    expect(workbook.sheets).toHaveLength(8);
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

// ── V4-9b C34「圖表資料」工作表（PRD §5.10、§6.3 C34；CHART_CATALOG §9.5 與各圖卡的「匯出」列；D-V4-12＝A）──
const chartCopy = labels.exports.chartsV4.excel;
const GROSS_PROFIT = metricDefinitions.gross_profit.label;
/** 各段的段名（欄 A）：畫面資料表的標題。 */
const CHART_SECTION = {
  G1: labels.overview.sections.bridge, G2: labels.overview.profit.section, G4: labels.overview.sections.channelMix,
  G7a: labels.overview.chartsV4.assistSpark.tableTitle, G7b: labels.diagnosis.chartsV4.channelsSpark.tableTitle, G8: labels.overview.chartsV4.cumulative.tableTitle, G10: labels.diagnosis.chartsV4.share.section,
  G11: fill(labels.diagnosis.chartsV4.heat.section, { metric: metricDefinitions.contribution_after_marketing.label }), G12: labels.diagnosis.chartsV4.rates.title,
  G13: fill(labels.products.chartsV4.variance.section, { metric: GROSS_PROFIT }), G14: fill(labels.products.chartsV4.pareto.section, { metric: GROSS_PROFIT }),
} as const;
type ChartKey = keyof typeof CHART_SECTION;
/** 「版本與算法」列：B 級段是整理函式的版本常數，A 級段是 contribution-v1。 */
const CHART_VERSION: Record<ChartKey, string> = {
  G1: "contribution-v1", G2: "contribution-v1", G4: "contribution-v1", G7a: ASSIST_WEEKS_VERSION, G7b: CHANNEL_WEEKS_VERSION, G8: CUMULATIVE_DAILY_VERSION, G10: CHANNEL_STRUCTURE_VERSION,
  G11: DAILY_HEATMAP_VERSION, G12: "contribution-v1", G13: "contribution-v1", G14: PRODUCT_PARETO_VERSION,
};
type Cell = string | number | null;
interface ChartBlock { section: string; title: Cell; header: Cell[]; rows: Cell[][]; version: Cell | undefined }
/** 依欄 A（段名）切段：第 1 列標題、第 2 列欄名（去掉補齊用的空格），之後是資料列（取到欄名的寬）；「版本與算法」列另外取出。 */
function chartBlocks(sheet: ExcelSheet): ChartBlock[] {
  const blocks: ChartBlock[] = [];
  for (const row of sheet.rows) {
    const values = row.map(value);
    const block = blocks.at(-1);
    if (!block || block.section !== values[0]) blocks.push({ section: values[0] as string, title: values[1], header: [], rows: [], version: undefined });
    else if (!block.header.length) block.header = values.slice(1, values.findLastIndex(cell => cell !== null) + 1);
    else if (values[1] === chartCopy.versionRow) block.version = values[2];
    else block.rows.push(values.slice(1, 1 + block.header.length));
  }
  return blocks;
}
const chartSheet = (workbook: ExcelWorkbook) => workbook.sheets.find(sheet => sheet.name === chartCopy.sheet);
const num = (amount: string | null) => amount === null ? null : Number(amount);
async function chartInput(name: string): Promise<ExcelExportInput> {
  const { dataset, snapshot } = await load(fixture(name));
  return { summary: buildManagerSummary(snapshot), snapshot, dataset, actions: emptyActionWorkspace(), products: compareProducts(dataset, snapshot.report.scope).rows };
}
/** G13、G14 的標題不用副標的期間與通路字，這裡只給抽屜 ctx（同商品頁的 alias）。 */
const productScope = (input: ExcelExportInput): ProductChartScope => ({ ctx: { previous: input.snapshot.report.scope.previous_period, current: input.snapshot.report.scope.current_period, resolver: snapshotResolver(input.snapshot) }, current: "", previous: "", channels: "" });

describe("V4-9b C34「圖表資料」工作表：標準與客戶版各一張，每張圖一段", () => {
  it("工作表數：老闆一頁版 2、標準版 8、客戶報告版 8；「圖表資料」在管理損益表之前，老闆一頁版沒有", async () => {
    for (const name of ["golden", "demo"]) {
      const input = await chartInput(name);
      const names = (variant: ExportVariant) => buildExcelWorkbook({ ...input, variant }).sheets.map(sheet => sheet.name);
      expect(names("boss"), name).toEqual([copy.sheets.summary, labels.exports.variantsV3.pnlSheet]);
      for (const variant of ["standard", "client"] as const) {
        expect(names(variant), `${name} ${variant}`).toEqual(SHEET_NAMES);
        expect(names(variant).indexOf(chartCopy.sheet), `${name} ${variant}`).toBe(names(variant).length - 2);
      }
    }
  });

  it("段的順序同 CHART_CATALOG（G1、G2、G4、G7a、G7b、G8（V4-10）、G10、G11、G12、G13；沒有商品毛利為負時沒有 G14）；沒有 G15、G16；表頭＝區塊、內容", async () => {
    for (const name of ["golden", "demo"]) {
      const sheet = chartSheet(buildExcelWorkbook(await chartInput(name)))!;
      expect(sheet.header.slice(0, 2), name).toEqual([copy.columns.basis.section, copy.columns.basis.detail]);
      expect(sheet.header.slice(2).every(header => header === ""), name).toBe(true);
      expect(sheet.formats, name).toBeUndefined();
      for (const row of sheet.rows) expect(row, name).toHaveLength(sheet.header.length);
      const sections = chartBlocks(sheet).map(block => block.section);
      expect(sections, name).toEqual((["G1", "G2", "G4", "G7a", "G7b", "G8", "G10", "G11", "G12", "G13"] as const).map(key => CHART_SECTION[key]));
      // G15、G16（試算）不放：ExcelExportInput 沒有試算資料。
      for (const section of [labels.scenarios.chartsV4.variance.section, labels.scenarios.chartsV4.threshold.section]) expect(sheet.rows.flat().map(value), `${name} ${section}`).not.toContain(section);
    }
  });

  it("標準版每段最後一列是「版本與算法」，指標定義工作表列出 B 級版本；客戶報告版兩者都沒有（spec.appendix.technical）；段落與數字同標準版", async () => {
    const input = await chartInput("refund_only");
    const standard = buildExcelWorkbook({ ...input, variant: "standard" }), client = buildExcelWorkbook({ ...input, variant: "client" });
    const blocks = chartBlocks(chartSheet(standard)!);
    // refund_only 本期 DTC · A 商品毛利為負，所以有 G14（product-pareto-v1）。
    const keys = (Object.keys(CHART_SECTION) as ChartKey[]).filter(key => blocks.some(block => block.section === CHART_SECTION[key]));
    expect(keys).toEqual(["G1", "G2", "G4", "G7a", "G7b", "G8", "G10", "G11", "G12", "G13", "G14"]);
    expect(blocks.map(block => block.version)).toEqual(keys.map(key => CHART_VERSION[key]));
    const versionItem = (section: string) => fill(chartCopy.basisVersion, { section });
    const basisRows = (book: ExcelWorkbook) => records(sheetOf(book, "basis")).filter(row => row[col.basis.section] === chartCopy.sheet).map(row => [row[col.basis.item], row[col.basis.detail]]);
    expect(basisRows(standard)).toEqual((["G7a", "G7b", "G8", "G10", "G11", "G14"] as const).map(key => [versionItem(CHART_SECTION[key]), CHART_VERSION[key]]));
    // 客戶報告版：沒有任何「版本與算法」列、指標定義工作表沒有 B 級版本列；其餘列與標準版逐列相同。
    const clientSheet = chartSheet(client)!;
    expect(clientSheet.rows.some(row => row[1].kind === "text" && row[1].value === chartCopy.versionRow)).toBe(false);
    expect(basisRows(client)).toEqual([]);
    expect(JSON.stringify(clientSheet)).not.toMatch(/-v1"/);
    expect(clientSheet.rows).toEqual(chartSheet(standard)!.rows.filter(row => !(row[1].kind === "text" && row[1].value === chartCopy.versionRow)));
    expect(chartBlocks(clientSheet).map(block => ({ ...block, version: undefined }))).toEqual(blocks.map(block => ({ ...block, version: undefined })));
  });

  it("標題列＝畫面同一個 builder 的結論句（G7、G12 沒有結論句，用段名）", async () => {
    for (const name of ["golden", "demo", "refund_only"]) {
      const input = await chartInput(name);
      const { snapshot } = input;
      const blocks = new Map(chartBlocks(chartSheet(buildExcelWorkbook(input))!).map(block => [block.section, block.title]));
      const products = input.products!;
      const top = productHighlights(products), all = productHighlights(products, products.length);
      const pareto = productPareto(products, "gross_profit", PRODUCT_PARETO_LIMIT);
      const expectedTitles: Partial<Record<ChartKey, string>> = {
        G1: bridgeWaterfall(snapshot).title, G2: profitWaterfall(snapshot, "all").title, G4: channelConclusion(snapshot).title,
        G7a: CHART_SECTION.G7a, G7b: CHART_SECTION.G7b, G8: cumulativeConclusion(cumulativeDaily(snapshot, "contribution_after_marketing"), snapshot).title,
        G10: shareSectionModel(snapshot).title, G11: heatSectionModel(snapshot).title, G12: CHART_SECTION.G12,
        G13: varianceSectionModel({ decrease: top.worstChange, increase: top.bestChange, allDecrease: all.worstChange, allIncrease: all.bestChange }, productScope(input)).title,
        ...(pareto.count > 0 ? { G14: paretoSectionModel(pareto, productScope(input)).title } : {}),
      };
      for (const [key, title] of Object.entries(expectedTitles) as [ChartKey, string][]) expect(blocks.get(CHART_SECTION[key]), `${name} ${key}`).toBe(title);
      expect(blocks.size, name).toBe(Object.keys(expectedTitles).length);
    }
    // 示範資料：與畫面上的結論句相同（例：G1「少賺 59.9 萬，扣最多的一項是商品成本（−157.5 萬）」）。
    const demo = await chartInput("demo");
    expect(chartBlocks(chartSheet(buildExcelWorkbook(demo))!)[0].title).toBe(bridgeWaterfall(demo.snapshot).title);
  });

  it("欄名＝該圖資料表的欄（金額欄帶「（元）」）；數值＝畫面同一個函式的值（golden、demo）", async () => {
    for (const name of ["golden", "demo"]) {
      const input = await chartInput(name);
      const { snapshot } = input;
      const { report } = snapshot;
      const resolver = snapshotResolver(snapshot);
      const blocks = new Map(chartBlocks(chartSheet(buildExcelWorkbook(input))!).map(block => [block.section, block]));
      const block = (key: ChartKey) => blocks.get(CHART_SECTION[key])!;
      const money = (label: string) => moneyHeader(label);

      const bridge = bridgeWaterfall(snapshot);
      expect(block("G1").header, name).toEqual([chartCopy.columns.bar, money(chartCopy.columns.start), money(chartCopy.columns.end), money(labels.exports.csv.suffix.change)]);
      expect(block("G1").rows, name).toEqual(bridge.bars.map(bar => [bar.label, num(bar.start), num(bar.end), bar.kind === "delta" ? num(bar.value) : null]));
      expect(block("G1").rows, name).toHaveLength(11);

      const profit = profitWaterfall(snapshot, "all");
      const profitCopy = labels.overview.profit;
      expect(block("G2").header, name).toEqual([profitCopy.table.item, profitCopy.table.amount, profitCopy.table.share]);
      expect(block("G2").rows, name).toEqual([
        ...profit.rows.map(row => [row.kind === "delta" ? fill(profitCopy.rowDeduct, { label: row.label }) : row.label, num(row.value.value), num(row.share)]),
        [labels.diagnosis.chartsV4.share.columns.perHundred, sharePerHundredText(profit.perHundred), null],
      ]);

      const channels = channelConclusion(snapshot);
      expect(block("G4").header, name).toEqual([labels.overview.channelsV3.table.channel, money(labels.shell.periods.previous), money(labels.shell.periods.current), money(labels.exports.csv.suffix.change)]);
      expect(block("G4").rows, name).toEqual(channels.rows.map(row => [row.label, num(row.previous.value), num(row.current.value), num(metricComparison(snapshot, "contribution_after_marketing", row.channel).change.value)]));

      const assist = assistWeeks({ weeks: snapshot.weeks });
      const week = (label: string, period: { start: string; end: string }) => fill(labels.exports.variantsV3.pnlWeekColumn, { label, range: fill(labels.exports.variantsV3.pnlWeekRange, period) });
      expect(block("G7a").header, name).toEqual([labels.overview.assistTable.columns.metric, ...assist.weeks.map(item => week(item.label, item.period))]);
      expect(block("G7a").rows, name).toHaveLength(7);
      const units = block("G7a").rows.find(row => row[0] === fill(labels.overview.chartsV4.assistSpark.rowUnit.count, { label: labels.assist.items.units_sold.label }))!;
      expect(units.slice(1), name).toEqual(assist.series.find(series => series.id === "units_sold")!.values.map(item => num(item.value)));

      const weekly = recentChannelWeeks(channelWeeks(snapshot)!);
      expect(block("G7b").header, name).toEqual([labels.overview.channelTable.channelHeader, ...weekly.weeks.map(item => money(week(item.label, item.period)))]);
      expect(block("G7b").rows, name).toEqual(weekly.channels.map(series => [channelLabel(series.channel, resolver), ...series.values.map(item => num(item.metric.value))]));

      const share = shareSectionModel(snapshot);
      expect(block("G10").header, name).toEqual([labels.overview.channelsV3.table.channel, ...SHARE_TABLE_COLUMNS.map(column => column.label)]);
      expect(block("G10").rows, name).toEqual(share.rows.map(row => [row.label, ...SHARE_TABLE_COLUMNS.map(column => { const cell = shareTableCell(snapshot, row, column).value; return column.unit === "money" ? num(cell) : cell; })]));
      expect(block("G10").rows.at(-1)![0], name).toBe(labels.overview.sections.total);

      // G11：日 × 通路，格＝report.current.daily 的扣廣告後貢獻（L3）；列數＝本期天數。
      const heatmap = heatSectionModel(snapshot).result.heatmap!;
      const daily = new Map(report.current.daily.map(row => [`${row.channel}|${row.date}`, row.metrics.contribution_after_marketing.value]));
      expect(block("G11").header, name).toEqual([labels.exports.csv.columns.date, ...heatmap.channels.map(channel => money(channelLabel(channel.channel, resolver)))]);
      expect(block("G11").rows.map(row => row[0]), name).toEqual(report.current.daily.map(row => row.date).filter((date, index, dates) => dates.indexOf(date) === index).sort());
      for (const row of block("G11").rows) expect(row.slice(1), `${name} ${row[0]}`).toEqual(heatmap.channels.map(channel => num(daily.get(`${channel.channel}|${row[0]}`) ?? null)));

      const rates = ratesModel(snapshot);
      expect(block("G12").header, name).toEqual([labels.overview.page.colPeriod, ...RATES_TABLE_COLUMNS.map(column => column.label)]);
      expect(block("G12").rows, name).toEqual(rates.rows.map(item => [item.label, fill(labels.exports.variantsV3.pnlWeekRange, { start: item.start, end: item.end }), ...RATE_METRICS.map(rate => num(item.metrics[rate].value))]));

      const products = input.products!;
      const all = productHighlights(products, products.length);
      expect(block("G13").header, name).toEqual([copy.columns.products.sku, copy.columns.products.channel, ...VARIANCE_TABLE_COLUMNS.map(column => column.label)]);
      expect(block("G13").rows, name).toEqual([...all.worstChange, ...all.bestChange].map(row => [row.sku, channelLabel(row.channel, resolver), num(row.previous.metrics.gross_profit.value), num(row.current.metrics.gross_profit.value), num(row.changes.gross_profit.value)]));
    }
  });

  // V4-10 代理 A（CHART_CATALOG G8「匯出」列：Excel「圖表資料」日期、當日、累計；D-V4-12＝A）。
  it("V4-10 G8 兩期每日累計：欄＝日期、當日（元）、累計（元）；列＝上期、本期的每一天（上期在前）；兩期末日累計＝各期合計（示範 1,868,626.68／1,269,792.73、golden 570.00／255.00）；標準版段末 cumulative-daily-v1", async () => {
    const cumulativeCopy = labels.overview.chartsV4.cumulative;
    for (const [name, days, previousEnd, currentEnd] of [["golden", 1, "570.00", "255.00"], ["demo", 42, "1868626.68", "1269792.73"]] as const) {
      const input = await chartInput(name);
      const block = chartBlocks(chartSheet(buildExcelWorkbook(input))!).find(item => item.section === CHART_SECTION.G8)!;
      expect(block.title, name).toBe(cumulativeConclusion(cumulativeDaily(input.snapshot, "contribution_after_marketing"), input.snapshot).title);
      expect(block.header, name).toEqual([cumulativeCopy.columns.date, moneyHeader(cumulativeCopy.columns.daily), moneyHeader(cumulativeCopy.columns.cumulative)]);
      expect(block.rows, name).toHaveLength(2 * days);
      const { previous, current } = input.snapshot.report;
      // 日期依序是上期起日到迄日、本期起日到迄日（同畫面資料表的列）。
      expect(block.rows.map(row => row[0]), name).toEqual([...dateRange(previous.period.start, previous.period.end), ...dateRange(current.period.start, current.period.end)]);
      expect(block.rows[0][0], name).toBe(previous.period.start);
      expect(block.rows[days - 1][0], name).toBe(previous.period.end);
      expect(block.rows[days][0], name).toBe(current.period.start);
      expect(block.rows.at(-1)![0], name).toBe(current.period.end);
      // 手算的末日累計＝各期合計（report 的值，contribution-v1）。
      expect(block.rows[days - 1][2], name).toBe(Number(previousEnd));
      expect(block.rows.at(-1)![2], name).toBe(Number(currentEnd));
      expect(previous.metrics.contribution_after_marketing.value, name).toBe(previousEnd);
      expect(current.metrics.contribution_after_marketing.value, name).toBe(currentEnd);
      expect(block.version, name).toBe(CUMULATIVE_DAILY_VERSION);
    }
    // 示範資料前 2 天（本期 7/13、7/14）：當日 35,842.27、32,410.52，累計 35,842.27、68,252.79（35,842.27 ＋ 32,410.52）。
    const demo = chartBlocks(chartSheet(buildExcelWorkbook(await chartInput("demo")))!).find(item => item.section === CHART_SECTION.G8)!;
    expect(demo.rows.slice(42, 44)).toEqual([["2026-07-13", 35842.27, 35842.27], ["2026-07-14", 32410.52, 68252.79]]);
    // 客戶報告版：同一段、同一組數字，沒有「版本與算法」列（spec.appendix.technical）。
    const client = chartBlocks(chartSheet(buildExcelWorkbook({ ...(await chartInput("demo")), variant: "client" }))!).find(item => item.section === CHART_SECTION.G8)!;
    expect(client.version).toBeUndefined();
    expect({ ...client, version: undefined }).toEqual({ ...demo, version: undefined });
  });

  it("G14 只在有商品毛利為負時放（refund_only：DTC · A −60.00，累計 −60.00、累計佔比 100%）", async () => {
    const input = await chartInput("refund_only");
    const block = chartBlocks(chartSheet(buildExcelWorkbook(input))!).find(item => item.section === CHART_SECTION.G14)!;
    const pareto = productPareto(input.products!, "gross_profit", PRODUCT_PARETO_LIMIT);
    expect(block.title).toBe(paretoSectionModel(pareto, productScope(input)).title);
    expect(block.header).toEqual([copy.columns.products.sku, copy.columns.products.channel, ...PARETO_TABLE_COLUMNS.map(column => column.label)]);
    expect(block.rows).toEqual([["A", "DTC", -60, -60, 1]]);
    expect(block.rows).toEqual(pareto.allRows.map(entry => [entry.row.sku, entry.row.channel, num(entry.value.value), num(entry.cumulative.value), num(entry.share.value)]));
  });

  it("寫出的 .xlsx：「圖表資料」只有 s／n 格；數字格逐格帶格式（L3 money、L2 money_l2、比率、件數），負號 U+2212", async () => {
    const input = await chartInput("golden");
    const { book } = parse(await writeExcel(buildExcelWorkbook(input)));
    const cells = cellsOf(book.Sheets[chartCopy.sheet]);
    for (const { address, cell } of cells) expect(["s", "n"], address).toContain(cell.t);
    const numbers = cells.filter(({ cell }) => cell.t === "n").map(({ cell }) => cell);
    expect(numbers.length).toBeGreaterThan(0);
    for (const cell of numbers) expect(Object.values(EXCEL_NUMBER_FORMATS)).toContain(cell.z);
    // G1 折扣柱的差額 −250.00（L3 到分）、G4 MARKETPLACE 的差額 −185（L2 整數元）。
    const rows = XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[chartCopy.sheet], { header: 1, defval: null, raw: true });
    const at = (section: string, label: string, column: number) => {
      const r = rows.findIndex(row => row[0] === section && row[1] === label);
      return book.Sheets[chartCopy.sheet][XLSX.utils.encode_cell({ r, c: column })] as XLSX.CellObject;
    };
    expect([at(CHART_SECTION.G1, metricDefinitions.discounts.label, 4).z, at(CHART_SECTION.G1, metricDefinitions.discounts.label, 4).w]).toEqual([EXCEL_NUMBER_FORMATS.money, `${MINUS}250.00`]);
    expect([at(CHART_SECTION.G4, channelLabel("MARKETPLACE", snapshotResolver(input.snapshot)), 4).z, at(CHART_SECTION.G4, channelLabel("MARKETPLACE", snapshotResolver(input.snapshot)), 4).w]).toEqual([EXCEL_NUMBER_FORMATS.money_l2, `${MINUS}185`]);
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
    expect(excelText("a\ufffeb\uffffc")).toBe("abc");
    expect(excelText("a\u007fb\u0085c\u009fd")).toBe("a�b�c�d");
    // 開頭的 C1 控制字元改成 U+FFFD 後就不是公式字元，不必再加 '。
    expect(excelText("\u0085=cmd")).toBe("�=cmd");
    expect(excelText("\ufffe=cmd")).toBe("'=cmd");
    for (const sample of ["a\ufffeb", "x\u0080y", "\uffff"]) expect(excelText(sample)).not.toMatch(/[\ufffe\uffff\u007f-\u009f]/);
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
    expect(sheetXml).toHaveLength(8);
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
    const revenue = summary.find(row => row[col.summary.item] === labels.metrics.net_revenue.headline)!;
    expect(revenue[col.summary.change]).toBe(220);
    expect(typeof revenue[col.summary.change]).toBe("number");
    // V3-2b：格子仍是數字（數值本身不變）；顯示格式依層取位，負號 U+2212。摘要 L2 整數元，拆解與商品 L3 到分，比率百分比兩位小數。
    const sheet = book.Sheets[copy.sheets.summary];
    const changeCell = cellsOf(sheet).find(({ cell }) => cell.t === "n" && cell.v === 220)!.cell;
    expect([changeCell.z, changeCell.w]).toEqual([EXCEL_NUMBER_FORMATS.money_l2, "220"]);
    const minusCell = cellsOf(sheet).find(({ cell }) => cell.t === "n" && cell.v === -315)!.cell;
    expect([minusCell.z, minusCell.w]).toEqual([EXCEL_NUMBER_FORMATS.money_l2, `${MINUS}315`]);
    const bridgeSheet = book.Sheets[copy.sheets.bridge];
    const bridgeCell = cellsOf(bridgeSheet).find(({ cell }) => cell.t === "n" && cell.v === -315)!.cell;
    expect([bridgeCell.z, bridgeCell.w]).toEqual([EXCEL_NUMBER_FORMATS.money, `${MINUS}315.00`]);
    const products = book.Sheets[copy.sheets.products];
    const margin = cellsOf(products).find(({ cell }) => cell.v === 0.4375)!.cell;
    expect([margin.t, margin.z, margin.w]).toEqual(["n", EXCEL_NUMBER_FORMATS.ratio, "43.75%"]);
    const header = XLSX.utils.sheet_to_json<string[]>(book.Sheets[copy.sheets.channels], { header: 1 })[0];
    expect(header).toEqual(Object.values(col.channels));
    const channelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[copy.sheets.channels]);
    expect(channelRows.at(-1)).toMatchObject({ [col.channels.channel]: labels.overview.sections.total, [col.channels.net_revenue_change]: 220, [col.channels.contribution_change]: -315 });
  });

  it("writes header-only sheets when there are no products or actions, and empty cells for unknown values", async () => {
    const input = await golden();
    const { book } = parse(await writeExcel(buildExcelWorkbook({ ...input, products: undefined, actions: emptyActionWorkspace() })));
    expect(book.SheetNames).toEqual(SHEET_NAMES);
    for (const key of ["products", "actions"] as const) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[copy.sheets[key]], { header: 1 });
      expect(rows).toEqual([[...Object.values(col[key]), ...(key === "actions" ? [AD_DECISION] : [])]]);
    }
    const missing = await load(fixture("errors/missing_cogs"));
    const parsed = parse(await writeExcel(buildExcelWorkbook({ summary: buildManagerSummary(missing.snapshot), ...missing, actions: emptyActionWorkspace() })));
    const bridge = XLSX.utils.sheet_to_json<unknown[]>(parsed.book.Sheets[copy.sheets.bridge], { header: 1, defval: null });
    expect(bridge.at(-1)).toEqual([labels.exports.common.bridgeSumLabel, null, null, null, labels.shell.status.missing]);
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
    const tricky = ["_x005F_x0041_", "__x0041__x0042_", "a\ufffeb\uffffc", "a\u0085b", `${"a".repeat(32_760)}_x0041_`, `${"a".repeat(budget - 13)}_x0041_${"b".repeat(100)}`];
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
    expect(book.SheetNames).toEqual(SHEET_NAMES);
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
