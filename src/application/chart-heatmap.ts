import Decimal from "decimal.js";
import { CHANNEL_WEEKS_MAX_CHANNELS, channelWeeks } from "./chart-channel-weeks";
import { isFullWeek } from "./chart-takeaways";
import type { WorkspaceSnapshot } from "./workspace";
import { dayCount } from "@/domain/date";
import type { DailyChannel, Metric, Period, SourceRef } from "@/domain/types";

// V4-3b 代理 A：G11 日 × 通路月曆熱表的整理函式 dailyHeatmap（PRD §4.1–§4.7 G11、§6.4、§8.2；CHART_CATALOG G11、§9.2；D-V4-15、D-V4-17＝A）。
// B 級，版本 daily-heatmap-v1。只挑選與分階，不新增財務口徑：
// - 格值直接取自 domain：report.current.daily（aggregatePeriod 已算好的「日 × 通路」列）的扣廣告後貢獻與來源列，逐字沿用（contribution-v1）；
// - 列＝snapshot 本期週（createSnapshot 的 weeklyRows：從期間起日每 7 天一段，最後一段可未滿 7 天；與 G3、G7、G12 同一組週），
//   欄＝該週第 1 到 7 天（每欄的星期固定，跟著期間起日）；期間外的格（最後一週未滿 7 天）標 outside；
// - 分階（真正新產生的只有這一項）：階 1＝取位到元後仍為負（與 v3 通路結論句「虧」同一規則，src/application/chart-takeaways.ts 的 channelConclusion：
//   deltaTone(…, "L1")，金額不到 1 萬時 L1 就是取位到元）；階 2＝該通路階 1 中最差 3 天（值最小；同值依日期先後）；正值與取位到元後為 0 的格不分階（D-V3-7）；
//   值缺漏的格是 missing（呼叫端畫虛線框「資料待補」），不參與排名；
// - 標題所指的一格（headline）：全部通路的階 1 格中最差的一格（同值依日期先後，再依 report.scope.channels 的順序）；沒有任何階 1 格時取全部有值格中最低的一格；
//   通路的輸出順序：headline 所在的通路排第一，其餘依 report.scope.channels（元件照這個順序輸出 DOM，不用 CSS order）。
// - 本期超過 92 天改成週 × 通路：每格是 channelWeeks（channel-weeks-v1，健檢頁通路寬表 G7b 用的同一個函式、同一組週）的該週該通路值，分階規則相同（階 2＝最差 3 週）；
//   週 × 通路的格數超過 8 × 92＝736 時也不渲染（PRD §8.2 的格數上限）。
// - 範圍內通路 > 8 時不計算（與 G7b、G10 同一個上限，CHANNEL_WEEKS_MAX_CHANNELS），回傳 { heatmap: null, reason: "tooManyChannels" }；
//   逐日列不完整（daily_complete=false，只會在超長期間出現）時回傳 reason "incompleteDaily"，不把沒有列的日子當成 0。
// 純函式、可序列化（值一律是 domain 的精確字串）；排名用 Decimal 比較，不用浮點。

export const DAILY_HEATMAP_VERSION = "daily-heatmap-v1" as const;
/** 日粒度的期間上限（天）；超過時改成週 × 通路。 */
export const DAILY_HEATMAP_MAX_DAYS = 92;
/** 計算與渲染的通路上限（G7b、G10、G11 共用）。 */
export const DAILY_HEATMAP_MAX_CHANNELS = CHANNEL_WEEKS_MAX_CHANNELS;
/** 格數上限：8 通路 × 92 天＝736（PRD §8.2）；週 × 通路也套用。 */
export const DAILY_HEATMAP_MAX_CELLS = DAILY_HEATMAP_MAX_DAYS * DAILY_HEATMAP_MAX_CHANNELS;
/** 階 2 的格數上限：每通路最差 3 天（或 3 週）。 */
export const DAILY_HEATMAP_WORST = 3;

export type HeatMetric = "contribution_after_marketing";
/** 格的階：0＝不上色（正值，或取位到元後為 0）；1＝取位到元後仍為負（不在最差 3 格內）；2＝該通路階 1 中最差 3 格；missing＝值缺漏；outside＝期間外。 */
export type HeatTier = 0 | 1 | 2 | "missing" | "outside";

/** 一格有值或缺值的格：key＝ISO 日期（日粒度）或該週起日（週粒度）；metric、sources 逐字取自 domain。 */
export interface HeatValueCell {
  kind: "value";
  key: string;
  period: Period;
  tier: Exclude<HeatTier, "outside">;
  metric: Metric;
  sources: SourceRef[];
}
/** 期間外的格（最後一週未滿 7 天時的週尾）：key＝該格的日期，只給 React key 用。 */
export interface HeatOutsideCell {
  kind: "outside";
  key: string;
  tier: "outside";
}
export type HeatCell = HeatValueCell | HeatOutsideCell;

/** 一列＝一週（label、period 與 snapshot.weeks 的本期週相同）；日粒度 7 格，週粒度 1 格。 */
export interface HeatRow {
  label: string;
  period: Period;
  full: boolean;
  cells: HeatCell[];
}
/** 一個通路的月曆（日粒度）或一欄（週粒度）。losing＝階 1 格數（含階 2）；worst＝階 2 格的 key，依名次。 */
export interface HeatChannel {
  channel: string;
  rows: HeatRow[];
  losing: number;
  worst: string[];
}
/** 標題所指的一格：loss＝最差的虧損格（n＝該通路的階 1 格數）；none＝沒有虧損格時最低的一格。 */
export interface HeatHeadline {
  kind: "loss" | "none";
  channel: string;
  key: string;
  period: Period;
  value: string;
  losing: number;
}
export interface DailyHeatmap {
  version: typeof DAILY_HEATMAP_VERSION;
  metric: HeatMetric;
  /** daily＝每通路一塊月曆（列＝週、欄＝該週第 1 到 7 天）；weekly＝本期超過 92 天，改週 × 通路。 */
  mode: "daily" | "weekly";
  /** 日粒度的 7 欄各是星期幾（0＝日 … 6＝六，從期間起日起算）；週粒度為空陣列。 */
  weekdays: number[];
  /** 本期全部週（與 snapshot.weeks 的本期週相同的起訖與週名）。 */
  weeks: { label: string; period: Period; full: boolean }[];
  /** 輸出順序：headline 所在的通路第一，其餘依 report.scope.channels。 */
  channels: HeatChannel[];
  headline: HeatHeadline | null;
  /** 期間內的格數（不含期間外的格）＝通路數 × 天數（或週數）。 */
  cellCount: number;
}
export type DailyHeatmapSkipReason = "tooManyChannels" | "tooManyCells" | "incompleteDaily";
/** 不計算時 heatmap 為 null，reason 說明原因（呼叫端改成一句說明，指向通路寬表）。 */
export type DailyHeatmapResult = { heatmap: DailyHeatmap; reason: null } | { heatmap: null; reason: DailyHeatmapSkipReason };

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** 星期（0＝日 … 6＝六），ISO 日期以 UTC 解析，避免時區位移。 */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** 取位到元（HALF_UP）後仍為負：與 v3 通路結論句的「虧」同一規則（L1 金額先取整元判斷正負號）。 */
export function negativeAfterYuan(value: string | null): boolean {
  if (value === null) return false;
  const yuan = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return yuan.isNegative() && !yuan.isZero();
}
/** 值小者在前；同值依 key（日期）先後。 */
const byValueThenKey = (a: { value: string; key: string }, b: { value: string; key: string }) => new Decimal(a.value).comparedTo(b.value) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

type Ranked = { channel: string; key: string; period: Period; value: string };
/** 分階：先把值缺漏的格標 missing，再挑階 1、階 2（只排名有值的格）；回傳 losing、worst，並把 tier 寫回格。 */
function tierChannel(channel: string, rows: HeatRow[]): HeatChannel {
  const cells = rows.flatMap(row => row.cells).filter((cell): cell is HeatValueCell => cell.kind === "value");
  const losing: HeatValueCell[] = [];
  for (const cell of cells) {
    const loss = negativeAfterYuan(cell.metric.value);
    cell.tier = cell.metric.value === null ? "missing" : loss ? 1 : 0;
    if (loss) losing.push(cell);
  }
  const worst = losing.map(cell => ({ key: cell.key, value: cell.metric.value! })).sort(byValueThenKey).slice(0, DAILY_HEATMAP_WORST).map(item => item.key);
  const worstSet = new Set(worst);
  for (const cell of losing) if (worstSet.has(cell.key)) cell.tier = 2;
  return { channel, rows, losing: losing.length, worst };
}

/** 標題所指的一格與通路順序（headline 所在的通路排第一）。 */
function headlineOf(channels: HeatChannel[]): { headline: HeatHeadline | null; ordered: HeatChannel[] } {
  const all: (Ranked & { tier: HeatValueCell["tier"] })[] = channels.flatMap(item => item.rows.flatMap(row => row.cells.flatMap(cell => cell.kind === "value" && cell.metric.value !== null ? [{ channel: item.channel, key: cell.key, period: cell.period, value: cell.metric.value, tier: cell.tier }] : [])));
  const losing = all.filter(cell => cell.tier === 1 || cell.tier === 2);
  const pool = losing.length ? losing : all;
  // 依 report.scope.channels 的順序逐一比較；只有嚴格較小（或同值而日期較早）才換，所以同值同日時留在較前面的通路。
  const pick = pool.reduce<Ranked | null>((best, cell) => best === null || byValueThenKey(cell, best) < 0 ? cell : best, null);
  if (pick === null) return { headline: null, ordered: channels };
  const first = channels.find(item => item.channel === pick.channel)!;
  return {
    headline: { kind: losing.length ? "loss" : "none", channel: pick.channel, key: pick.key, period: { ...pick.period }, value: pick.value, losing: first.losing },
    ordered: [first, ...channels.filter(item => item !== first)],
  };
}

const copyMetric = (metric: Metric): Metric => ({ value: metric.value, reason_codes: [...metric.reason_codes] });

/**
 * G11 的資料（daily-heatmap-v1）。metric 目前只支援扣廣告後貢獻（PRD §4.3 G11）。
 * 對帳點（tests/chart-heatmap.test.ts）：每通路逐日加總＝該通路本期合計（到分）；階 2 每通路恰好 min(3, 階 1 格數) 格；null 格不參與排名。
 */
export function dailyHeatmap(snapshot: Pick<WorkspaceSnapshot, "report" | "weeks">, metric: HeatMetric = "contribution_after_marketing"): DailyHeatmapResult {
  const { report } = snapshot;
  const scope = report.scope.channels;
  if (scope.length > DAILY_HEATMAP_MAX_CHANNELS) return { heatmap: null, reason: "tooManyChannels" };
  const { period } = report.current;
  const days = dayCount(period);
  const currentWeeks = snapshot.weeks.filter(week => week.period === "current").map(week => ({ label: week.label, period: { start: week.start, end: week.end }, full: isFullWeek(week) }));

  if (days > DAILY_HEATMAP_MAX_DAYS) {
    if (currentWeeks.length * scope.length > DAILY_HEATMAP_MAX_CELLS) return { heatmap: null, reason: "tooManyCells" };
    const data = channelWeeks(snapshot);
    if (data === null) return { heatmap: null, reason: "incompleteDaily" };
    const tiered = data.channels.map(series => tierChannel(series.channel, data.weeks.map((week, index) => ({
      label: week.label, period: { ...week.period }, full: week.full,
      cells: [{ kind: "value", key: week.period.start, period: { ...week.period }, tier: 0, metric: copyMetric(series.values[index].metric), sources: [...series.values[index].sources] }],
    }))));
    const { headline, ordered } = headlineOf(tiered);
    return { heatmap: { version: DAILY_HEATMAP_VERSION, metric, mode: "weekly", weekdays: [], weeks: data.weeks.map(week => ({ label: week.label, period: { ...week.period }, full: week.full })), channels: ordered, headline, cellCount: data.weeks.length * scope.length }, reason: null };
  }

  if (!report.current.daily_complete) return { heatmap: null, reason: "incompleteDaily" };
  const daily = new Map<string, DailyChannel>();
  for (const row of report.current.daily) daily.set(`${row.channel}\n${row.date}`, row);
  const tiered = scope.map(channel => tierChannel(channel, currentWeeks.map(week => ({
    label: week.label, period: { ...week.period }, full: week.full,
    cells: Array.from({ length: 7 }, (_, offset): HeatCell => {
      const date = addDays(week.period.start, offset);
      if (date > week.period.end) return { kind: "outside", key: date, tier: "outside" };
      const row = daily.get(`${channel}\n${date}`);
      return { kind: "value", key: date, period: { start: date, end: date }, tier: 0, metric: row ? copyMetric(row.metrics[metric]) : { value: null, reason_codes: ["MISSING_VALUE"] }, sources: row ? [...row.sources] : [] };
    }),
  }))));
  const { headline, ordered } = headlineOf(tiered);
  return {
    heatmap: { version: DAILY_HEATMAP_VERSION, metric, mode: "daily", weekdays: Array.from({ length: 7 }, (_, offset) => weekdayOf(addDays(period.start, offset))), weeks: currentWeeks, channels: ordered, headline, cellCount: days * scope.length },
    reason: null,
  };
}
