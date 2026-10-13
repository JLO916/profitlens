import { uniqueSources } from "@/domain/aggregation";
import { dayCount } from "@/domain/date";
import { moneyMetric, parseCents, sumAmounts } from "@/domain/money";
import type { Amount, Metric, Period, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { formatAmountL1, metricDefinitions } from "./presentation";
import { PNL_DAY_COLUMN_LIMIT, PNL_NO_DAILY_ROWS, periodDailyMetrics, type PnlMetric } from "./pnl-table";
import type { WorkspaceSnapshot } from "./workspace";

// V4-10 代理 A：G8「兩期每日累計」的整理函式 cumulativeDaily（PRD §4.2、§4.3、§6.4、§7.4；CHART_CATALOG G8；D-V4-22＝A）。
// B 級，版本 cumulative-daily-v1。不新增財務口徑：
// - 每日值：兩期各自呼叫 periodDailyMetrics(report.previous)、periodDailyMetrics(report.current)（由 pnl-table.ts 的 dayColumns 抽出：同一天各通路的 totals
//   以 domain 的 sumTotals 相加後交給 domain 的 calculateMetrics），逐字沿用 domain 的 contribution-v1 值；daily 沒有那一天時是 null（PNL_NO_DAILY_ROWS），不當成 0。
// - 真正新產生的數字只有累計：第 1 天到第 n 天的每日值以 domain 的 sumAmounts 逐日相加（bigint 分，到分；不轉 Number、不用浮點）。
//   任一日為 null 時 sumAmounts 回傳 null，之後每一天的累計都是 null（斷線；不內插、不當 0，§7.4）。末日累計＝該期合計（恆等式）。
// - 比較（標題用）：只比兩期都有累計值的第 1 到 min(兩期天數) 天；以最後一個可比的天判定落後、超過或相同；
//   d＝最後一次由「不落後」轉為「落後」（或由「不超過」轉為「超過」）的那一天，第 1 天就落後（或超過）時 d＝1（PRD §4.2）。比較只比到分的 bigint。
// - 任一期超過 PNL_DAY_COLUMN_LIMIT（92）天時不畫（drawable＝false、兩期都沒有點；日欄上限兩期都套用）。
// - 目標不在這裡：目標線＝matchTargets matched 時的 target（A 級，呼叫端挑選既有值）；不畫等速目標線（屬預測，D-V4-22＝A）。

export const CUMULATIVE_DAILY_VERSION = "cumulative-daily-v1" as const;
/** 任一期超過這個天數時不畫（與管理損益表的日欄上限相同，PNL_DAY_COLUMN_LIMIT）。 */
export const CUMULATIVE_DAILY_MAX_DAYS = PNL_DAY_COLUMN_LIMIT;

export type CumulativePeriod = "previous" | "current";
/** 一天：第幾天（1 起算）、日期、當日值（domain 值）、第 1 天到這一天的累計（cumulative-daily-v1）、當日的來源列。 */
export interface CumulativePoint {
  day: number;
  date: string;
  /** 當日值（periodDailyMetrics 的 metrics[metric]，逐字沿用；daily 沒有那一天時 null＋PNL_NO_DAILY_ROWS）。 */
  daily: Metric;
  /** 第 1 天到第 day 天的 sumAmounts（到分）；之前任一日為 null 時是 null。 */
  cumulative: Metric;
  sources: SourceRef[];
}
/** 一期的累計序列。end＝末日累計（沒有點時 null）；breakDay＝第一個累計為 null 的天（之後都斷線），沒有時 null。 */
export interface CumulativeSeries {
  period: CumulativePeriod;
  range: Period;
  days: number;
  points: CumulativePoint[];
  end: Metric | null;
  breakDay: number | null;
}
export type CumulativeStanding = "behind" | "ahead" | "even";
/** 標題用的比較：standing＝最後一個可比的天本期落後、超過或等於上期（沒有可比的天時 null）；day＝d（相同或沒有可比的天時 null）。 */
export interface CumulativeComparison { standing: CumulativeStanding | null; day: number | null; comparableDays: number }
export interface CumulativeDaily {
  version: typeof CUMULATIVE_DAILY_VERSION;
  metric: PnlMetric;
  /** 兩期都 ≤ 92 天才畫；false 時兩期都沒有點、comparison 沒有可比的天。 */
  drawable: boolean;
  previous: CumulativeSeries;
  current: CumulativeSeries;
  comparison: CumulativeComparison;
}

const ZERO: Amount = { cents: 0n, reason_codes: [] };
/** Metric → domain 的 Amount（到分 bigint）；值不是到分字串時視為缺值，保留原因碼（同 pnl-table.ts 的 amountOf）。 */
function amountOf(metric: Metric): Amount {
  let cents: bigint | null = null;
  try { cents = parseCents(metric.value); } catch { cents = null; }
  return { cents, reason_codes: cents === null && metric.reason_codes.length === 0 ? ["MISSING_VALUE"] : [...metric.reason_codes] };
}

function cumulativeSeries(period: CumulativePeriod, analysis: WorkspaceSnapshot["report"]["current"], metric: PnlMetric, drawable: boolean): CumulativeSeries {
  const range = { ...analysis.period };
  const days = dayCount(range);
  if (!drawable) return { period, range, days, points: [], end: null, breakDay: null };
  let running: Amount = ZERO;
  const points = periodDailyMetrics(analysis).map((day, index): CumulativePoint => {
    const source = day.metrics?.[metric];
    const daily: Metric = source ? { value: source.value, reason_codes: [...source.reason_codes] } : { value: null, reason_codes: [PNL_NO_DAILY_ROWS] };
    running = sumAmounts([running, amountOf(daily)]);
    return { day: index + 1, date: day.date, daily, cumulative: moneyMetric(running), sources: day.sources };
  });
  const broken = points.find(point => point.cumulative.value === null);
  return { period, range, days, points, end: points.length ? points[points.length - 1].cumulative : null, breakDay: broken?.day ?? null };
}

/** 兩期的比較（PRD §4.2）：只比兩期都有累計值的第 1 到 min(兩期天數) 天；累計在第一個 null 之後都是 null，所以遇到 null 就停。 */
export function compareCumulative(previous: readonly CumulativePoint[], current: readonly CumulativePoint[]): CumulativeComparison {
  const standings: CumulativeStanding[] = [];
  for (let index = 0; index < Math.min(previous.length, current.length); index++) {
    const now = amountOf(current[index].cumulative).cents, before = amountOf(previous[index].cumulative).cents;
    if (now === null || before === null) break;
    standings.push(now < before ? "behind" : now > before ? "ahead" : "even");
  }
  if (standings.length === 0) return { standing: null, day: null, comparableDays: 0 };
  const standing = standings[standings.length - 1];
  if (standing === "even") return { standing, day: null, comparableDays: standings.length };
  // 最後一段連續落後（或超過）的起點＝最後一次由「不落後」轉為「落後」的那一天。
  let start = standings.length - 1;
  while (start > 0 && standings[start - 1] === standing) start--;
  return { standing, day: start + 1, comparableDays: standings.length };
}

/**
 * G8 的 B 級整理（cumulative-daily-v1）：兩期各自的每日值與逐日累計、兩期比較。metric 是金額指標（總覽傳 contribution_after_marketing）。
 * 純函式、可序列化（金額一律是到分的精確字串）。
 */
export function cumulativeDaily(snapshot: Pick<WorkspaceSnapshot, "report">, metric: PnlMetric): CumulativeDaily {
  const { previous, current } = snapshot.report;
  const drawable = dayCount(previous.period) <= CUMULATIVE_DAILY_MAX_DAYS && dayCount(current.period) <= CUMULATIVE_DAILY_MAX_DAYS;
  const previousSeries = cumulativeSeries("previous", previous, metric, drawable);
  const currentSeries = cumulativeSeries("current", current, metric, drawable);
  return { version: CUMULATIVE_DAILY_VERSION, metric, drawable, previous: previousSeries, current: currentSeries, comparison: compareCumulative(previousSeries.points, currentSeries.points) };
}

/** 第 1 天到第 day 天的來源列聯集（抽屜「計算與來源」用；只挑選既有來源列）。 */
export function cumulativeSources(series: Pick<CumulativeSeries, "points">, day: number): SourceRef[] {
  return uniqueSources(series.points.slice(0, day).flatMap(point => point.sources));
}

/**
 * G8 標題（結論句，PRD §4.2；overview.chartsV4.cumulative.title.*）與副標。{amount}＝本期末日累計（L1；不畫時用本期合計，與末日累計恆等）；
 * 兩期天數不同時副標加「依第幾天對齊」。Excel「圖表資料」與畫面共用（同一句）。
 */
export function cumulativeConclusion(result: CumulativeDaily, snapshot: Pick<WorkspaceSnapshot, "report">): { title: string; subtitle: string } {
  const copy = labels.overview.chartsV4.cumulative;
  const metric = metricDefinitions[result.metric].label;
  const amount = formatAmountL1((result.current.end ?? snapshot.report.current.metrics[result.metric]).value);
  const { standing, day } = result.comparison;
  const title = standing === null ? fill(copy.title.single, { metric, amount }) : standing === "even" ? fill(copy.title.even, { metric, amount }) : fill(copy.title[standing], { metric, amount, d: day });
  const subtitle = fill(copy.subtitle, { metric });
  return { title, subtitle: result.previous.days === result.current.days ? subtitle : fill(copy.alignNote, { subtitle, previous: result.previous.days, current: result.current.days }) };
}
