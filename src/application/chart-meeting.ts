import { dayCount } from "@/domain/date";
import type { ComparisonMode, Period } from "@/domain/types";
import { MAX_MEETING_HISTORY, type Meeting, type MeetingKpiMetric } from "./meeting";

// V4-6 代理 A：G19 會議歷史小倍數的整理函式 meetingSeries（PRD §4.1–§4.7 G19、§6.4；CHART_CATALOG G19、§9.2；06_BATCHES V4-6）。
// B 級，版本 meeting-series-v1。輸入是已結束的會議歷史（meeting_history，每筆都是 finalize 時深層凍結的 Meeting），只讀、不改：
// - 值逐字取自 agenda.kpis[].current（結束當時凍結的本期淨營收與扣廣告後貢獻，到分的字串），不重算、不轉 Number；
// - 排序：依會議日期（date）、再依結束時間（finalized_at），同時間保留輸入順序（穩定排序）；超過 MAX_MEETING_HISTORY（100）筆時只留排序後最後 100 筆；
// - 本期起訖、資料集（dataset_hash）與通路集合都相同的重複會議只畫最新一筆（finalized_at 最大；同時間取排序在後者，與 lastMeeting 同規則），omitted 計省略的筆數
//   （D-V4-48（b）＝B，使用者 2026-10-12：範圍不同的會議不是重複，各自保留；它們本來就落在不同段）；
// - 斷段（segment 加一）：與前一個保留的點相比，dataset_hash 不同（break＝"dataset"）、通路集合不同（break＝"channels"，D-V4-49（b）＝C），
//   否則比較方式不同，或（比較方式不是整月對比時）本期天數不同（break＝"period"）。compareWithLastMeeting 在期間不同時回傳 different_periods 並照樣比較（meeting.ts），
//   但 42 天期與 7 天期的合計不能連成一條走勢，所以這裡另立規則；整月對比（calendar_months）每期都是一個完整月份，以「一個月」為單位，
//   月份天數不同不斷開（D-V4-48（a）＝B，使用者 2026-10-12；docs/DATA_CONTRACT.md:48）；
// - 保留的點 < 2 時回傳空的 points（呼叫端畫等高空狀態）。
// 真正新產生的只有排序、去重與斷段的位置（segment、break、omitted），沒有新的金額；純函式、可序列化，沒有模組層級的使用者資料。

export const MEETING_SERIES_VERSION = "meeting-series-v1" as const;
/** 斷段的原因：dataset＝資料集不同；channels＝同一份資料、通路集合不同（D-V4-49（b）＝C）；period＝比較方式不同，或（非整月對比時）本期天數不同。 */
export type MeetingSeriesBreak = "dataset" | "channels" | "period";

/** 一個點＝一次已結束的會議（本期的兩個關鍵數字）。 */
export interface MeetingSeriesPoint {
  id: string;
  /** 會議日期（YYYY-MM-DD）。 */
  date: string;
  name: string;
  /** agenda.kpis 的 net_revenue.current（逐字沿用；未知時 null）。 */
  net_revenue: string | null;
  /** agenda.kpis 的 contribution_after_marketing.current（逐字沿用；未知時 null）。 */
  contribution_after_marketing: string | null;
  /** 第幾段（從 0 起）；同一段的點可以連線。 */
  segment: number;
  /** 這個點與前一個點斷開的原因；第一個點與同一段的點為 null。 */
  break: MeetingSeriesBreak | null;
  /** 資料本期（source_fixed.periods.current）。 */
  period: Period;
  comparison_mode: ComparisonMode;
}

export interface MeetingSeries {
  version: typeof MEETING_SERIES_VERSION;
  /** 依會議順序；< 2 個時是空陣列。 */
  points: MeetingSeriesPoint[];
  /** 本期、資料集與通路集合都與較晚結束的會議相同而省略的筆數（資料表註明）。 */
  omitted: number;
}

const finalizedAt = (meeting: Meeting) => Date.parse(meeting.finalized_at);
/** 會議順序：日期、結束時間；Array.prototype.sort 是穩定排序，同時間保留輸入順序。 */
const byDateThenFinalized = (a: Meeting, b: Meeting) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || finalizedAt(a) - finalizedAt(b);
/** 去重的鍵：本期起訖＋資料集＋通路集合（D-V4-48（b）＝B；通路集合不看順序）。 */
const duplicateKey = (meeting: Meeting) => { const fixed = meeting.source_fixed; return `${fixed.periods.current.start}/${fixed.periods.current.end}|${fixed.dataset_hash}|${[...new Set(fixed.channels)].sort().join(",")}`; };
const sameChannels = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
const kpi = (meeting: Meeting, metric: MeetingKpiMetric) => meeting.agenda.kpis.find(row => row.metric === metric)?.current ?? null;

/** 與前一個保留的點相比的斷段原因；可以連線時回傳 null。 */
export function meetingBreak(previous: Meeting, current: Meeting): MeetingSeriesBreak | null {
  const a = previous.source_fixed, b = current.source_fixed;
  if (a.dataset_hash !== b.dataset_hash) return "dataset";
  if (!sameChannels(a.channels, b.channels)) return "channels";
  if (a.periods.comparison_mode !== b.periods.comparison_mode) return "period";
  // 整月對比：每期一個完整月份，以月為單位，月份天數不同仍相連（D-V4-48（a）＝B）。
  if (a.periods.comparison_mode !== "calendar_months" && dayCount(a.periods.current) !== dayCount(b.periods.current)) return "period";
  return null;
}

/** G19 的序列（meeting-series-v1）。 */
export function meetingSeries(history: readonly Meeting[]): MeetingSeries {
  const ordered = [...history].sort(byDateThenFinalized).slice(-MAX_MEETING_HISTORY);
  // 本期、資料集與通路集合都相同的會議只留結束時間最晚的一筆（同時間取排序在後者）。
  const latest = new Map<string, Meeting>();
  for (const meeting of ordered) {
    const key = duplicateKey(meeting);
    const kept = latest.get(key);
    if (!kept || finalizedAt(meeting) >= finalizedAt(kept)) latest.set(key, meeting);
  }
  const kept = ordered.filter(meeting => latest.get(duplicateKey(meeting)) === meeting);
  const omitted = ordered.length - kept.length;
  if (kept.length < 2) return { version: MEETING_SERIES_VERSION, points: [], omitted };
  let segment = 0;
  const points = kept.map((meeting, index): MeetingSeriesPoint => {
    const reason = index === 0 ? null : meetingBreak(kept[index - 1], meeting);
    if (reason !== null) segment += 1;
    return {
      id: meeting.id, date: meeting.date, name: meeting.name,
      net_revenue: kpi(meeting, "net_revenue"), contribution_after_marketing: kpi(meeting, "contribution_after_marketing"),
      segment, break: reason, period: { ...meeting.source_fixed.periods.current }, comparison_mode: meeting.source_fixed.periods.comparison_mode,
    };
  });
  return { version: MEETING_SERIES_VERSION, points, omitted };
}
