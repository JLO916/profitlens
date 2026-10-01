import { dayCount } from "@/domain/date";
import type { Period } from "@/domain/types";

/** Browser workload limits; these do not alter contribution-v1 financial definitions. */
export const MAX_ANALYSIS_WEEK_INTERVALS = 1040;
export const MAX_ANALYSIS_CHANNELS = 1000;
export const ANALYSIS_PERIOD_LIMIT_MESSAGE = "前後期合計最多支援 1,040 個七日區間（約 20 年），請縮短比較期間。資料不會截斷，先前成功的資料仍會保留。";
export const ANALYSIS_CHANNEL_LIMIT_MESSAGE = "每次分析最多支援 1,000 個銷售通路，請縮小通路範圍。資料不會截斷，先前成功的資料仍會保留。";

export class AnalysisPeriodLimitError extends RangeError {
  readonly reason_code = "ANALYSIS_PERIOD_TOO_LARGE";
  constructor() { super(ANALYSIS_PERIOD_LIMIT_MESSAGE); this.name = "AnalysisPeriodLimitError"; }
}
export class AnalysisChannelLimitError extends RangeError {
  readonly reason_code = "ANALYSIS_CHANNEL_LIMIT";
  constructor() { super(ANALYSIS_CHANNEL_LIMIT_MESSAGE); this.name = "AnalysisChannelLimitError"; }
}

export function assertSupportedAnalysisPeriods(previous: Period, current: Period): void {
  // Count the final partial seven-day interval; never truncate it.
  const intervals = Math.ceil(dayCount(previous) / 7) + Math.ceil(dayCount(current) / 7);
  if (intervals > MAX_ANALYSIS_WEEK_INTERVALS) throw new AnalysisPeriodLimitError();
}
export function assertSupportedAnalysisChannels(channels: readonly string[]): void {
  if (channels.length > MAX_ANALYSIS_CHANNELS) throw new AnalysisChannelLimitError();
}
