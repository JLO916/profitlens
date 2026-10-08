import { ASSIST_KPI_IDS, netRevenuePerUnit, type AssistKpiId, type AssistUnit } from "./assist-kpi";
import { isFullWeek } from "./chart-takeaways";
import type { PeriodWeeklyRow, WorkspaceSnapshot } from "./workspace";
import type { Count, Metric, MetricName, Period, SourceRef } from "@/domain/types";

// V4-2 G7a「近 {n} 週」（PRD §4.1、§4.3、§6.4；CHART_CATALOG G7、§9.2；D-V4-6、D-V4-15）：總覽其他常用指標表每列的 sparkline 與「各指標每週」資料表的資料。
// B 級整理函式，版本 assist-weeks-v1（assist-kpi-v1 不變）。只重新整理既有的每週數字，不新增財務口徑：
// - 週：snapshot.weeks 本期最後 ≤ 8 週（createSnapshot 的 weeklyRows，從期間起日每 7 天一段，最後一段可未滿 7 天）；
// - 廣告佔淨營收、廣告效率（MER）、商品毛利率、退款金額比、物流費佔比：直接取週列 metrics（domain 的 contribution-v1 值，逐字不改）；
// - 售出件數：週列 units_sold（aggregatePeriod 已回傳的 domain Count，只轉成整數字串）；
// - 件均淨營收：呼叫既有 netRevenuePerUnit(週淨營收, 週件數)（assist-kpi.ts，只呼叫、不改）。
// 損益兩平 MER 不在這裡（D-V4-6：那一列不畫 sparkline）。純函式、可序列化（值一律是精確字串），不用浮點；圖形座標由元件另外換算。

export const ASSIST_WEEKS_VERSION = "assist-weeks-v1" as const;
/** 近 n 週的上限（PRD §4.1 G7：n＝實際週數，上限 8）。 */
export const ASSIST_WEEKS_MAX = 8;

/** 一週（資料表的一欄、sparkline 的一點）。full＝7 天整週（isFullWeek）；未滿 7 天的週，水準值序列（件數）畫空心點（X40）。 */
export interface AssistWeek {
  label: string;
  period: Period;
  full: boolean;
  sources: SourceRef[];
}
/** 一格：精確字串（件數為整數字串、件均兩位、比率與倍數沿用 domain 的 12 位），null 時 reason_codes 說明原因。 */
export interface AssistWeekValue {
  value: string | null;
  reason_codes: string[];
}
/** 一個指標的近 n 週（values 與 weeks 逐一對齊）。 */
export interface AssistWeekSeries {
  id: AssistKpiId;
  /** 既有 domain 指標（比率、倍數）才有，抽屜用它畫該週的比率表；件數、件均沒有。 */
  metric?: Extract<AssistKpiId, MetricName>;
  unit: AssistUnit;
  /**
   * 水準值（期間合計，週天數少就會變小）：只有售出件數。未滿 7 天的週不和完整週連線、畫空心點（X40、PRD §4.3 G7a「件數只畫完整週」）；
   * 件均淨營收與比率、倍數是比值，不會因天數少而假下跌，照畫。
   */
  level: boolean;
  values: AssistWeekValue[];
}
export interface AssistWeeks {
  version: typeof ASSIST_WEEKS_VERSION;
  /** 本期最後 ≤ 8 週，依時間先後。 */
  weeks: AssistWeek[];
  /** 7 個指標，順序同 ASSIST_KPI_IDS。 */
  series: AssistWeekSeries[];
}

/** 五個直接取 domain 週值的指標與單位（與 assistKpis 的 existing(...) 相同）。 */
const DOMAIN_UNITS: Record<Extract<AssistKpiId, MetricName>, AssistUnit> = { marketing_burden: "percent", mer: "multiple", gross_margin: "percent", refund_ratio: "percent", fulfillment_burden: "percent" };
/** 舊程式組出的週列沒有 units_sold（選填欄位）時，件數與件均都當缺值。 */
const MISSING_UNITS: Count = { value: null, reason_codes: ["MISSING_VALUE"] };

const ofMetric = (metric: Metric): AssistWeekValue => ({ value: metric.value, reason_codes: [...metric.reason_codes] });
const ofCount = (count: Count): AssistWeekValue => ({ value: count.value === null ? null : count.value.toString(), reason_codes: [...count.reason_codes] });
const isDomain = (id: AssistKpiId): id is Extract<AssistKpiId, MetricName> => Object.hasOwn(DOMAIN_UNITS, id);

/** 本期最後 ≤ 8 週（snapshot.weeks 已依時間排序；上期與去年同期的週不列入）。 */
export function assistWeekRows(snapshot: Pick<WorkspaceSnapshot, "weeks">): PeriodWeeklyRow[] {
  return snapshot.weeks.filter(week => week.period === "current").slice(-ASSIST_WEEKS_MAX);
}

/**
 * G7a 的資料（assist-weeks-v1）：本期最後 ≤ 8 週 × 7 個輔助指標。週值一律取自 domain（週列 metrics、units_sold）或既有函式（netRevenuePerUnit），
 * 所以抽屜的 metric_version 維持 contribution-v1（件數、件均維持 assist-kpi-v1），本函式的版本放在 arrangeVersion（PRD §8.7）。
 * 對帳點（tests/chart-assist-weeks.test.ts）：本期全部週的件數加總＝本期件數；每週件均＝netRevenuePerUnit(該週淨營收, 該週件數)。
 */
export function assistWeeks(snapshot: Pick<WorkspaceSnapshot, "weeks">): AssistWeeks {
  const rows = assistWeekRows(snapshot);
  const weeks: AssistWeek[] = rows.map(row => ({ label: row.label, period: { start: row.start, end: row.end }, full: isFullWeek(row), sources: row.sources }));
  const series = ASSIST_KPI_IDS.map((id): AssistWeekSeries => {
    if (isDomain(id)) return { id, metric: id, unit: DOMAIN_UNITS[id], level: false, values: rows.map(row => ofMetric(row.metrics[id])) };
    if (id === "units_sold") return { id, unit: "count", level: true, values: rows.map(row => ofCount(row.units_sold ?? MISSING_UNITS)) };
    return { id, unit: "money_per_unit", level: false, values: rows.map(row => ofMetric(netRevenuePerUnit(row.metrics.net_revenue, row.units_sold ?? MISSING_UNITS))) };
  });
  return { version: ASSIST_WEEKS_VERSION, weeks, series };
}
