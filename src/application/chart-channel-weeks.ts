import { isFullWeek } from "./chart-takeaways";
import type { WorkspaceSnapshot } from "./workspace";
import { sumTotals, uniqueSources } from "@/domain/aggregation";
import { calculateMetrics } from "@/domain/metrics";
import type { DailyChannel, Metric, Period, SourceRef } from "@/domain/types";

// V4-3a G7b「近 {n} 週」（PRD §4.1、§4.3 G7b、§6.4、§8.2；CHART_CATALOG G7（b）、§9.2；D-V4-15）：健檢頁通路寬表每通路的 sparkline 與「各通路每週」資料表的資料。
// B 級整理函式，版本 channel-weeks-v1。只把既有的每日數字逐週加起來，不新增財務口徑：
// - 週：snapshot.weeks 的本期週（createSnapshot 的 weeklyRows，從期間起日每 7 天一段，最後一段可未滿 7 天；與 G3、G7a、G11、G12 同一組週）；
// - 每通路每週：把 report.current.daily（aggregatePeriod 已算好的「日 × 通路」列）中該通路、該週的列，用 domain 的 sumTotals 加總、
//   再交給 domain 的 calculateMetrics——與 aggregatePeriod(dataset, 週, [通路]) 對單一通路做的事相同（逐日 totals 相加後算指標，缺列日的 null 照樣傳遞），
//   所以金額逐字等於該週只選該通路時的 domain 結果（tests/chart-channel-weeks.test.ts 逐格比對）；
// - 指標＝扣廣告後貢獻（contribution_after_marketing）；sources＝那幾天的來源列（uniqueSources，與 domain 同一個函式）。
// 不放進 createSnapshot（PRD §8.2、§8.8）：健檢頁元件（channel-table.tsx 的 diagnosis 變體）在 useMemo 內呼叫，Excel「圖表資料」匯出時由 excel-export 自行呼叫。
// 通路 > 8 時不計算（回傳 null），呼叫端改為一句說明（系統允許 1,000 個通路，src/application/limits.ts）；
// report.current.daily 是稀疏的（daily_complete=false，天數 × 通路數 > 50,000，src/domain/aggregation.ts）時也不計算，避免把沒有列的日子當成 0。
// 純函式、可序列化（值一律是 domain 的精確字串），不用浮點；圖形座標由元件另外換算。

export const CHANNEL_WEEKS_VERSION = "channel-weeks-v1" as const;
/** 計算與渲染的通路上限（PRD §4.3 G7b、§8.2：G7b、G10、G11 共用同一個上限）。 */
export const CHANNEL_WEEKS_MAX_CHANNELS = 8;
/** 「近 n 週」的上限（PRD §4.1 G7：n＝實際週數，上限 8）；channelWeeks 本身回傳本期全部週，呈現時才取最後 ≤ 8 週。 */
export const CHANNEL_WEEKS_RECENT = 8;

/** 一週（資料表的一欄、sparkline 的一點）。full＝7 天整週（isFullWeek）；未滿 7 天的週，金額序列畫空心點（X40）。 */
export interface ChannelWeek {
  label: string;
  period: Period;
  full: boolean;
}
/** 一通路一週：metric 是 domain 的精確字串（null 時 reason_codes 說明原因，例如 MISSING_CHANNEL_COST_DAY）；sources 是那幾天的來源列。 */
export interface ChannelWeekValue {
  metric: Metric;
  sources: SourceRef[];
}
/** 一個通路的逐週值（values 與 weeks 逐一對齊）。 */
export interface ChannelWeekSeries {
  channel: string;
  values: ChannelWeekValue[];
}
export interface ChannelWeeks {
  version: typeof CHANNEL_WEEKS_VERSION;
  metric: "contribution_after_marketing";
  /** 本期全部週，依時間先後。 */
  weeks: ChannelWeek[];
  /** 順序同 report.scope.channels。 */
  channels: ChannelWeekSeries[];
}

/** 通路數在上限內才計算（呼叫端先用它決定要不要呼叫 channelWeeks，超過時不呼叫）。 */
export const channelWeeksAvailable = (snapshot: Pick<WorkspaceSnapshot, "report">) => snapshot.report.scope.channels.length <= CHANNEL_WEEKS_MAX_CHANNELS;

/**
 * G7b 的資料（channel-weeks-v1）：本期每週 × 範圍內每個通路的扣廣告後貢獻。值直接取自 domain（逐日列的 totals 以 domain 函式加總後算指標），
 * 所以抽屜的 metric_version 維持 contribution-v1，本函式的版本放在 arrangeVersion（PRD §8.7）。
 * 對帳點（tests/chart-channel-weeks.test.ts）：每通路逐週加總＝該通路本期合計（到分）；每格＝aggregatePeriod(dataset, 週, [通路]) 的同一個值。
 * 通路 > 8 或逐日列不完整時回傳 null（不計算）。
 */
export function channelWeeks(snapshot: Pick<WorkspaceSnapshot, "report" | "weeks">): ChannelWeeks | null {
  const { report } = snapshot;
  const channels = report.scope.channels;
  if (!channelWeeksAvailable(snapshot) || !report.current.daily_complete) return null;
  const rows = snapshot.weeks.filter(week => week.period === "current");
  const weeks: ChannelWeek[] = rows.map(row => ({ label: row.label, period: { start: row.start, end: row.end }, full: isFullWeek(row) }));
  const daily = new Map<string, DailyChannel[]>(channels.map(channel => [channel, []]));
  for (const row of report.current.daily) daily.get(row.channel)?.push(row);
  return {
    version: CHANNEL_WEEKS_VERSION,
    metric: "contribution_after_marketing",
    weeks,
    channels: channels.map(channel => ({
      channel,
      values: weeks.map(({ period }) => {
        const days = daily.get(channel)!.filter(row => row.date >= period.start && row.date <= period.end);
        const metric = calculateMetrics(sumTotals(days.map(row => row.totals))).contribution_after_marketing;
        return { metric: { value: metric.value, reason_codes: [...metric.reason_codes] }, sources: uniqueSources(days.flatMap(row => row.sources)) };
      }),
    })),
  };
}

/** 「近 n 週」：本期最後 ≤ 8 週（只挑選既有值，不另算）；sparkline 與「各通路每週」資料表共用。 */
export function recentChannelWeeks(data: ChannelWeeks): ChannelWeeks {
  const from = Math.max(0, data.weeks.length - CHANNEL_WEEKS_RECENT);
  return { ...data, weeks: data.weeks.slice(from), channels: data.channels.map(series => ({ ...series, values: series.values.slice(from) })) };
}
