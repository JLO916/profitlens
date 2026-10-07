import { sumTotals, uniqueSources } from "../domain/aggregation";
import { dateRange } from "../domain/date";
import { calculateMetrics } from "../domain/metrics";
import { parseCents, ratioMetric } from "../domain/money";
import type { Amount, DailyChannel, Metric, MONEY_METRICS, Period, SourceRef } from "../domain/types";
import { fill, labels } from "../i18n";
import { emptyKindOf, formatAmountL3, formatEmpty, formatRateL3, metricDefinitions, MINUS } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

/*
 * V3-9a F9 每日／每週管理損益表（PRD §10.1 F9、§7.1 區塊 10、§9.3 報表型表格；D-V3-19＝A、D-V3-8）。
 * 只重新呈現既有的彙總，不新增財務公式（contribution-v1 不變）：
 * - 日欄：report.current.daily（每天每通路）把同一天各通路的 totals 用 domain 的 sumTotals 相加，再交給 domain 的 calculateMetrics（與 aggregatePeriod 算通路合計的方法相同）；
 *   daily 完全沒有那一天時整欄為 null（原因碼 PNL_NO_DAILY_ROWS，畫面寫「無資料」），不當成 0。
 * - 週欄：snapshot.weeks 中 period === "current" 的列，metrics 與 sources 直接用，不重算。
 * - 合計欄：report.current.metrics（直接用，不重算）。
 * - 佔淨營收 %：合計 ÷ 淨營收合計，用 domain 的 ratioMetric（精確 12 位比率小數、淨營收 ≤ 0 回傳 null＋NON_POSITIVE_DENOMINATOR）；顯示時由 formatRateL1 從精確值取位。
 * 金額只經 bigint 分與 decimal 字串，不經過浮點數。
 */

/** 管理損益表的格子：domain 的 Metric（到分字串或 null＋原因碼）、這一格的期間與來源列（抽屜「計算與來源」用）。 */
export interface PnlCell { metric: Metric; period: Period; sources: SourceRef[] }
export type PnlGranularity = "day" | "week";
/** item＝一般列（費用列畫面加「減：」）；subtotal＝淨營收、商品毛利、扣廣告前貢獻；total＝扣廣告後貢獻。 */
export type PnlRowKind = "item" | "subtotal" | "total";
export type PnlMetric = typeof MONEY_METRICS[number];
/** 一欄（一天或一週）。label：日欄是 ISO 日期（畫面用 formatDateL1），週欄是既有的 WeeklyRow.label。hasData＝false 表示 daily 沒有這一天的任何列。 */
export interface PnlColumn { id: string; granularity: PnlGranularity; period: Period; label: string; hasData: boolean }
/** 一列：每欄一格、合計格、佔淨營收 %（精確比率小數）；isZero＝所有有資料的欄與合計都恰好是 0（資料待補不算 0）。 */
export interface PnlRow { metric: PnlMetric; kind: PnlRowKind; deduct: boolean; cells: PnlCell[]; total: PnlCell; share: Metric; isZero: boolean }
export interface PnlTable { granularity: PnlGranularity; period: Period; columns: PnlColumn[]; rows: PnlRow[] }

/** §9.3 報表型表格的列順序（固定）：原價收入 → 減：折扣 → 減：退款 → 淨營收 → 減：商品成本 → 商品毛利 → 減：四項費用 → 扣廣告前貢獻 → 減：廣告投放費 → 扣廣告後貢獻。 */
export const PNL_ROWS: readonly { metric: PnlMetric; kind: PnlRowKind; deduct: boolean }[] = [
  { metric: "gross_sales", kind: "item", deduct: false },
  { metric: "discounts", kind: "item", deduct: true },
  { metric: "refunds", kind: "item", deduct: true },
  { metric: "net_revenue", kind: "subtotal", deduct: false },
  { metric: "cogs_net", kind: "item", deduct: true },
  { metric: "gross_profit", kind: "subtotal", deduct: false },
  { metric: "platform_fees", kind: "item", deduct: true },
  { metric: "payment_fees", kind: "item", deduct: true },
  { metric: "fulfillment_costs", kind: "item", deduct: true },
  { metric: "other_variable_costs", kind: "item", deduct: true },
  { metric: "contribution_before_marketing", kind: "subtotal", deduct: false },
  { metric: "ad_spend", kind: "item", deduct: true },
  { metric: "contribution_after_marketing", kind: "total", deduct: false },
];
/** daily 沒有這一天的任何列（只會出現在 domain 的稀疏 daily 檢視，或自組的資料）：整欄 null，不是 0。 */
export const PNL_NO_DAILY_ROWS = "PNL_NO_DAILY_ROWS";
/** 日欄上限（約一季）：本期超過這個天數時畫面只提供每週，避免總覽掛載過多格子；buildPnlTable 本身不設限。 */
export const PNL_DAY_COLUMN_LIMIT = 92;

/** Metric → domain 的 Amount（到分 bigint）；值不是到分字串時視為缺值，保留原因碼。 */
function amountOf(metric: Metric): Amount {
  let cents: bigint | null = null;
  try { cents = parseCents(metric.value); } catch { cents = null; }
  return { cents, reason_codes: [...metric.reason_codes] };
}
/** 到分字串是否恰好為 0（"0.00"、"-0.00"）；null 不是 0。 */
function isZeroMetric(metric: Metric): boolean {
  return amountOf(metric).cents === 0n;
}

/** F9 日欄：本期每一天一欄；同一天各通路的 totals 相加後交給 domain 的 calculateMetrics（不寫新公式）。 */
function dayColumns(snapshot: WorkspaceSnapshot): { columns: PnlColumn[]; values: (metric: PnlMetric, index: number) => PnlCell } {
  const { period, daily } = snapshot.report.current;
  const byDate = new Map<string, DailyChannel[]>();
  for (const row of daily) {
    const group = byDate.get(row.date) ?? [];
    group.push(row);
    byDate.set(row.date, group);
  }
  const days = dateRange(period.start, period.end).map(date => {
    const rows = byDate.get(date) ?? [];
    const dayPeriod = { start: date, end: date };
    if (rows.length === 0) return { column: { id: date, granularity: "day" as const, period: dayPeriod, label: date, hasData: false }, metrics: null, sources: [] as SourceRef[] };
    return { column: { id: date, granularity: "day" as const, period: dayPeriod, label: date, hasData: true }, metrics: calculateMetrics(sumTotals(rows.map(row => row.totals))), sources: uniqueSources(rows.flatMap(row => row.sources)) };
  });
  return {
    columns: days.map(day => day.column),
    values: (metric, index) => {
      const day = days[index];
      return { metric: day.metrics ? { ...day.metrics[metric], reason_codes: [...day.metrics[metric].reason_codes] } : { value: null, reason_codes: [PNL_NO_DAILY_ROWS] }, period: { ...day.column.period }, sources: day.sources };
    },
  };
}

/** F9 週欄：沿用 snapshot.weeks 的本期週（與每週趨勢同一組 7 天），metrics 與 sources 直接用。 */
function weekColumns(snapshot: WorkspaceSnapshot): { columns: PnlColumn[]; values: (metric: PnlMetric, index: number) => PnlCell } {
  const weeks = snapshot.weeks.filter(week => week.period === "current");
  return {
    columns: weeks.map(week => ({ id: week.start, granularity: "week", period: { start: week.start, end: week.end }, label: week.label, hasData: true })),
    values: (metric, index) => {
      const week = weeks[index];
      return { metric: { ...week.metrics[metric], reason_codes: [...week.metrics[metric].reason_codes] }, period: { start: week.start, end: week.end }, sources: week.sources };
    },
  };
}

/**
 * F9 管理損益表（PRD §10.1 F9、§9.3）：列＝四層與費用項（PNL_ROWS 的固定順序），欄＝本期的每一天或每一週＋合計＋佔淨營收 %。
 * 每格都帶期間與來源列，供「計算與來源」抽屜使用。
 */
export function buildPnlTable(snapshot: WorkspaceSnapshot, granularity: PnlGranularity): PnlTable {
  const { current } = snapshot.report;
  const { columns, values } = granularity === "day" ? dayColumns(snapshot) : weekColumns(snapshot);
  const netRevenue = amountOf(current.metrics.net_revenue);
  const rows = PNL_ROWS.map(({ metric, kind, deduct }): PnlRow => {
    const cells = columns.map((_, index) => values(metric, index));
    const totalMetric = current.metrics[metric];
    const total: PnlCell = { metric: { ...totalMetric, reason_codes: [...totalMetric.reason_codes] }, period: { ...current.period }, sources: current.sources };
    const share = ratioMetric(amountOf(totalMetric), netRevenue);
    const isZero = isZeroMetric(totalMetric) && cells.every((cell, index) => !columns[index].hasData || isZeroMetric(cell.metric));
    return { metric, kind, deduct, cells, total, share, isZero };
  });
  return { granularity, period: { ...current.period }, columns, rows };
}

/** V3-9b F14（PRD §9.6、D-V3-8）：匯出用的每週管理損益表——buildPnlTable(snapshot, "week") 原樣，加上列名（費用列「減：」前綴）與週欄名（週名＋起訖日）。Excel 工作表與列印附錄共用；不改 buildPnlTable 的輸出。 */
export interface PnlExportTable { table: PnlTable; rowLabels: string[]; columnLabels: string[] }
export function pnlExportTable(snapshot: Pick<WorkspaceSnapshot, "report" | "weeks">): PnlExportTable {
  // 每週欄只讀 report.current 與 weeks（weekColumns），所以列印版拿到的 Pick 也能用；buildPnlTable 本身不改。
  const table = buildPnlTable(snapshot as WorkspaceSnapshot, "week");
  const copy = labels.overview.pnlV3, variants = labels.exports.variantsV3;
  const rowLabels = table.rows.map(row => row.deduct ? fill(copy.rowDeduct, { label: metricDefinitions[row.metric].label }) : metricDefinitions[row.metric].label);
  const columnLabels = table.columns.map(column => fill(variants.pnlWeekColumn, { label: column.label, range: fill(variants.pnlWeekRange, { start: column.period.start, end: column.period.end }) }));
  return { table, rowLabels, columnLabels };
}
/** V3-9b F14（D-V3-8）：列印、PDF 管理損益表的金額——L3 到分（formatAmountL3），負數改成括號 (1,234.00)；缺值依原因碼寫資料待補／不適用。畫面上仍是 U+2212。 */
export function pnlExportAmount(metric: Metric): string {
  if (metric.value === null) return formatEmpty(emptyKindOf(metric.reason_codes));
  const text = formatAmountL3(metric.value);
  return text.startsWith(MINUS) ? fill(labels.exports.variantsV3.negativeParen, { value: text.slice(MINUS.length) }) : text;
}
/** V3-9b F14：列印、PDF 管理損益表的佔淨營收 %（L3 兩位小數，與 Excel 的 0.00% 相同；淨營收 ≤ 0 寫不適用）。 */
export function pnlExportShare(row: Pick<PnlRow, "share">): string {
  return formatRateL3(row.share.value, emptyKindOf(row.share.reason_codes));
}
