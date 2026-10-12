import { dateRange, dayCount } from "@/domain/date";
import type { Dataset, FileName, Period, ReasonCode, ValidationIssue } from "@/domain/types";
import type { EventSet } from "./events";
import type { YoySummary } from "./workspace";

// V4-7a 代理 A：G20 涵蓋時間軸的整理函式 coverageTimeline（PRD §4.1–§4.7 G20、§6.4；CHART_CATALOG G20、§9.2；D-V4-15、D-V4-40＝A）。
// B 級，版本 coverage-timeline-v1。只挑選、合併與計數，不新增財務口徑，也不碰任何金額：
// - 缺列區段：dataset.issues 中 MISSING_CHANNEL_COST_DAY（通路費用檔）、MISSING_AD_DAY（廣告檔）的逐日問題（src/domain/validation.ts 的 appendMissingDays：
//   line 為 null、帶 date 與 channel、field "$row"）依「檔 × 通路」合併成連續日期區段（跨月照樣相連）；golden：每檔 × 通路的區段天數加總＝該檔 × 通路的缺列問題筆數。
// - 範圍級問題（涵蓋日 × 通路超過每檔列數上限時，appendMissingDays 改發 field "$coverage"、沒有 date 的問題）：fallback＝true，
//   不產生區段（呼叫端退回文字，不畫區段；PRD §4.3 G20「超過列數上限只有範圍級問題時退回文字」）。
// - X 軸（D-V4-40＝A）：「上期起日到涵蓋訖日」，最早的缺列區段比上期起日早時再往前延伸到它（不早於涵蓋起日）；
//   去年同期不畫在這條軸上，改由 yoy 給圖上方一行的期間與天數（呼叫端組字）。
//   D-V4-53＝B（使用者 2026-10-12）：去年同期那一行出現時（yoy 不是 null），落在去年同期期間內的缺列日子不延伸軸——那一行已寫出它們的天數；
//   去年同期期間外、比上期起日早的缺列照 D-V4-40 延伸。一段缺列只有部分落在去年同期時，只有期間外的日子算數：
//   起日在去年同期之前的照它的起日延伸；起日在去年同期內、訖日在它之後的延伸到去年同期訖日的下一天（這段在圖上從軸起日畫起）。
//   因此軸起日之前的缺列日子一定都在去年同期期間內；這些區段（全部或部分不在軸上）另給 yoyBeforeAxis，資料表照列、呼叫端在資料表後寫說明。
//   版本維持 coverage-timeline-v1：v4 尚未發行，這個版本只標在本函式的輸出上（不進備份、匯出與抽屜），每段缺列的 golden（天數＝問題筆數）不變。
// - 銷售軌：軸上每一天有沒有任何銷售列（dataset.sales[].date）。沒有列的日子是「無列」（v4 GLOSSARY #5：不當作零銷售，也不是缺列）。
//   涵蓋起日到軸起日之間（軸從上期起日開始時）的無列日子不在軸上，另給 noRowsBeforeAxis（呼叫端寫在資料表後的說明；審查 R1-F1、D-V4-51（a）＝A）。
//   通路費用與廣告軌的「有列」＝那一天該檔沒有任何通路缺列（與 H5 設計稿 data.html 相同）。
// - 檔期軌：EventSet.rows 中與軸重疊的檔期（只畫細線與名稱，不參與任何金額）。
// 純函式、可序列化（日期一律 ISO 字串、天數是整數）；通路順序依 manifest.channels。

export const COVERAGE_TIMELINE_VERSION = "coverage-timeline-v1" as const;

/** 三份檔案的短名（testid、抽屜 SourceTab 同一組：sales、costs、ads）。 */
export type CoverageFileKey = "sales" | "costs" | "ads";
/** 會有缺列的兩份檔（銷售檔不檢查逐日缺列）。 */
export type CoverageMissingFileKey = Exclude<CoverageFileKey, "sales">;
/** 三份檔案的順序與缺列原因碼（validation.ts appendMissingDays 的 requirements）。標題同長時依這個順序取前者。 */
export const COVERAGE_FILES: readonly { key: CoverageFileKey; file: FileName; reason: ReasonCode | null }[] = [
  { key: "sales", file: "sales_daily.csv", reason: null },
  { key: "costs", file: "channel_costs_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" },
  { key: "ads", file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" },
];
const MISSING_FILES = COVERAGE_FILES.filter((spec): spec is { key: CoverageMissingFileKey; file: FileName; reason: ReasonCode } => spec.reason !== null);
const FILE_RANK = new Map<CoverageFileKey, number>(COVERAGE_FILES.map((spec, index) => [spec.key, index]));
/** 範圍級缺列問題的欄位（validation.ts：涵蓋日 × 通路超過每檔列數上限時）。 */
export const COVERAGE_RANGE_FIELD = "$coverage";

/** 含頭含尾的日期區段（ISO）與天數。 */
export interface CoverageRange { start: string; end: string; days: number }
/** 一段缺列：某檔、某通路連續幾天沒有任何一列。 */
export interface CoverageSegment extends CoverageRange {
  key: CoverageMissingFileKey;
  file: FileName;
  channel: string;
  reason: ReasonCode;
}
/** 一軌（銷售、通路費用、廣告）：軸上的有列區段、缺列區段（只有通路費用與廣告）、無列區段（只有銷售）。 */
export interface CoverageTrack {
  key: CoverageFileKey;
  file: FileName;
  rows: CoverageRange[];
  missing: CoverageSegment[];
  noRows: CoverageRange[];
  /**
   * 缺列的日子數（右端「缺 n 天」）：軸上任一通路缺列的日期，同一天幾個通路都缺只算 1 天（審查修正：不再是檔 × 通路 × 日的問題筆數，
   * 否則同一天 4 個通路都缺時右端寫「缺 4 天」、與標題的「1 天」矛盾）。問題筆數的 golden 在每個區段（檔 × 通路）。
   * D-V4-53＝B：軸起日之前（去年同期期間內）的缺列日子不算，已寫在去年同期那一行；沒有這種日子時＝該檔全部的缺列日子。
   */
  missingDays: number;
  /** 軸上無列的天數（只有銷售軌）。 */
  noRowDays: number;
}
/** 與軸重疊的檔期（events.csv 的原始起訖、名稱與行號）。 */
export interface CoverageEvent { start: string; end: string; label: string; line: number }
/** 範圍級缺列問題（沒有逐日資訊）。 */
export interface CoverageRangeIssue { key: CoverageMissingFileKey; file: FileName; reason: ReasonCode }
/** 去年同期（D-V4-40＝A：不畫在軸上）：期間、天數，以及其中有缺列的日子（任一檔任一通路）與銷售無列的日子。 */
export interface CoverageYoy extends CoverageRange { missingDays: number; noRowDays: number }

export interface CoverageTimeline {
  version: typeof COVERAGE_TIMELINE_VERSION;
  /** manifest 的涵蓋期間。 */
  coverage: CoverageRange;
  dataAsOf: string;
  /** manifest.channels（缺列檢查的通路，與分析範圍的通路篩選無關）。 */
  channels: string[];
  previous: Period;
  current: Period;
  /** X 軸（D-V4-40＝A；D-V4-53＝B：去年同期內的缺列日子不延伸）。 */
  axis: CoverageRange;
  /** 有範圍級缺列問題時為 true：不產生缺列區段，呼叫端退回文字。 */
  fallback: boolean;
  rangeIssues: CoverageRangeIssue[];
  /** 銷售、通路費用、廣告三軌（固定這個順序）。 */
  tracks: CoverageTrack[];
  /**
   * 涵蓋起日到軸起日前一天之間，銷售無列的日子（合併成區段）：D-V4-40＝A 的軸從上期起日開始，這些日子不畫在軸上，
   * 呼叫端寫在資料表後的說明（審查 R1-F1；D-V4-51（a）＝A，使用者 2026-10-12：銷售無列不延伸軸）。軸起日＝涵蓋起日時是空陣列。
   */
  noRowsBeforeAxis: CoverageRange[];
  /** 全部缺列區段：依檔案、通路（manifest.channels 的順序）、起日排序。 */
  segments: CoverageSegment[];
  /**
   * D-V4-53＝B：起日在軸起日之前的缺列區段（整段或前段不在軸上；依 segments 的順序）。這些日子都在去年同期期間內，天數已算進 yoy.missingDays；
   * 資料表照列（篩選按鈕照常），呼叫端在資料表後寫說明。沒有去年同期那一行時是空陣列（缺列一律照 D-V4-40 延伸軸）。
   */
  yoyBeforeAxis: CoverageSegment[];
  /**
   * 最長的缺列區段（標題用）：天數最多；同長依檔案順序、起日、通路順序取前者。沒有缺列時為 null。
   * D-V4-53＝B：只從至少部分在軸上的區段取；全部區段都在軸起日之前時才從全部區段取（標題仍寫得出真的缺列，資料表照列）。
   */
  longest: CoverageSegment | null;
  events: CoverageEvent[];
  /** 去年同期可用、與上期不同、而且不是 fallback 時才有。 */
  yoy: CoverageYoy | null;
}

const DAY_MS = 86_400_000;
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
const rangeOf = (start: string, end: string): CoverageRange => ({ start, end, days: dayCount({ start, end }) });
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 連續日期合併成區段（含頭含尾）；輸入可亂序、可重複；跨月、跨年照樣相連。 */
export function mergeDates(dates: Iterable<string>): CoverageRange[] {
  const ranges: CoverageRange[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = ranges[ranges.length - 1];
    if (last !== undefined && nextDay(last.end) === date) { last.end = date; last.days += 1; }
    else ranges.push({ start: date, end: date, days: 1 });
  }
  return ranges;
}

const isMissingReason = (issue: ValidationIssue) => MISSING_FILES.some(spec => spec.file === issue.file && spec.reason === issue.reason_code);
/** 逐日缺列問題（有日期與通路）。 */
const isDailyMissing = (issue: ValidationIssue): issue is ValidationIssue & { date: string; channel: string } => isMissingReason(issue) && typeof issue.date === "string" && typeof issue.channel === "string";
/** 範圍級缺列問題（field "$coverage"、沒有日期）。 */
const isRangeMissing = (issue: ValidationIssue) => isMissingReason(issue) && issue.field === COVERAGE_RANGE_FIELD && issue.date === undefined;

/**
 * G20 涵蓋時間軸的資料（純函式，tests/chart-coverage.test.ts）。
 * events：選填的檔期（EventSet）；yoy：snapshot.yoy（ready 時給圖上方一行，D-V4-40＝A）；
 * periods：目前套用的兩期（snapshot.report.scope 的 previous_period／current_period），不給時用 manifest 的兩期。
 */
export function coverageTimeline(dataset: Dataset, events?: EventSet | null, yoy?: YoySummary | null, periods?: { previous: Period; current: Period }): CoverageTimeline {
  const { manifest } = dataset;
  const coverage = rangeOf(manifest.coverage_start, manifest.coverage_end);
  const previous = periods?.previous ?? manifest.previous_period;
  const current = periods?.current ?? manifest.current_period;
  const channelRank = new Map(manifest.channels.map((channel, index) => [channel, index]));
  const byChannel = (a: string, b: string) => (channelRank.get(a) ?? channelRank.size) - (channelRank.get(b) ?? channelRank.size) || compareText(a, b);

  // 範圍級缺列：每份檔一筆（同一檔重複時只記一次）。
  const rangeIssues: CoverageRangeIssue[] = MISSING_FILES
    .filter(spec => dataset.issues.some(issue => isRangeMissing(issue) && issue.file === spec.file && issue.reason_code === spec.reason))
    .map(spec => ({ key: spec.key, file: spec.file, reason: spec.reason }));
  const fallback = rangeIssues.length > 0;

  // 缺列區段：依檔、通路合併連續日期。
  const daily = dataset.issues.filter(isDailyMissing);
  const segments: CoverageSegment[] = fallback ? [] : MISSING_FILES.flatMap(spec => {
    const issues = daily.filter(issue => issue.file === spec.file && issue.reason_code === spec.reason);
    return [...new Set(issues.map(issue => issue.channel))].sort(byChannel).flatMap(channel =>
      mergeDates(issues.filter(issue => issue.channel === channel).map(issue => issue.date)).map(range => ({ ...range, key: spec.key, file: spec.file, channel, reason: spec.reason })));
  });

  // 去年同期那一行（D-V4-40＝A）：可用、與上期不同、而且不是 fallback 時才有。
  const yoyPeriod = !fallback && yoy?.status === "ready" && !(yoy.period.start === previous.start && yoy.period.end === previous.end) ? yoy.period : null;
  // 一段缺列延伸軸時的起點（D-V4-53＝B）：去年同期期間外的第一天；整段都在去年同期內時不延伸（null）。
  const extendFrom = (segment: CoverageSegment): string | null => {
    if (yoyPeriod === null || segment.start < yoyPeriod.start || segment.start > yoyPeriod.end) return segment.start;
    return segment.end > yoyPeriod.end ? nextDay(yoyPeriod.end) : null;
  };

  // X 軸（D-V4-40＝A）：上期起日到涵蓋訖日；最早的缺列區段更早時往前延伸，不早於涵蓋起日（D-V4-53＝B：去年同期內的缺列日子不算）。
  const earliest = segments.reduce<string | null>((min, segment) => { const from = extendFrom(segment); return from !== null && (min === null || from < min) ? from : min; }, null);
  const wanted = earliest !== null && earliest < previous.start ? earliest : previous.start;
  const axisStart = wanted < coverage.start ? coverage.start : wanted > coverage.end ? coverage.end : wanted;
  const axis = rangeOf(axisStart, coverage.end);
  const axisDates = dateRange(axis.start, axis.end);

  const salesDates = new Set(dataset.sales.map(row => row.date));
  const salesNoRows = mergeDates(axisDates.filter(date => !salesDates.has(date)));
  // 軸外（涵蓋起日到軸起日前一天）的銷售無列：dateRange 含頭含尾，去掉最後一天（軸起日本身）。
  const noRowsBeforeAxis = mergeDates(dateRange(coverage.start, axis.start).slice(0, -1).filter(date => !salesDates.has(date)));
  const tracks: CoverageTrack[] = COVERAGE_FILES.map(spec => {
    if (spec.key === "sales") {
      return { key: spec.key, file: spec.file, rows: mergeDates(axisDates.filter(date => salesDates.has(date))), missing: [], noRows: salesNoRows, missingDays: 0, noRowDays: salesNoRows.reduce((sum, range) => sum + range.days, 0) };
    }
    const missing = segments.filter(segment => segment.key === spec.key);
    const missingDates = new Set(missing.flatMap(segment => dateRange(segment.start, segment.end)));
    // fallback 時不知道哪幾天有列：不畫有列細條（呼叫端整張退回文字）。
    const rows = fallback ? [] : mergeDates(axisDates.filter(date => !missingDates.has(date)));
    // 右端天數只算軸上的日子（與銷售軌的無列天數相同）；D-V4-53＝B 軸起日之前的缺列日子已算在去年同期那一行，不在這裡再算一次。
    return { key: spec.key, file: spec.file, rows, missing, noRows: [], missingDays: [...missingDates].filter(date => date >= axis.start).length, noRowDays: 0 };
  });

  // 標題取軸上（至少部分在軸上）的最長區段；全部都在軸起日之前（D-V4-53＝B，只有去年同期內有缺列）時才從全部區段取。
  const onAxis = segments.filter(segment => segment.end >= axis.start);
  const longest = (onAxis.length > 0 ? onAxis : segments).reduce<CoverageSegment | null>((best, segment) => {
    if (best === null) return segment;
    const order = best.days - segment.days || FILE_RANK.get(segment.key)! - FILE_RANK.get(best.key)! || compareText(segment.start, best.start) || byChannel(segment.channel, best.channel);
    return order < 0 ? segment : best;
  }, null);

  const eventRows = (events?.rows ?? [])
    .filter(row => row.end >= axis.start && row.start <= axis.end)
    .map(row => ({ start: row.start, end: row.end, label: row.label, line: row.line }))
    .sort((a, b) => compareText(a.start, b.start) || a.line - b.line);

  let yoyRange: CoverageYoy | null = null;
  if (yoyPeriod !== null) {
    const dates = dateRange(yoyPeriod.start, yoyPeriod.end);
    const missingDates = new Set(daily.map(issue => issue.date));
    yoyRange = { ...rangeOf(yoyPeriod.start, yoyPeriod.end), missingDays: dates.filter(date => missingDates.has(date)).length, noRowDays: dates.filter(date => !salesDates.has(date)).length };
  }
  const yoyBeforeAxis = segments.filter(segment => segment.start < axis.start);

  return {
    version: COVERAGE_TIMELINE_VERSION,
    coverage, dataAsOf: manifest.data_as_of, channels: [...manifest.channels],
    previous: { start: previous.start, end: previous.end }, current: { start: current.start, end: current.end },
    axis, fallback, rangeIssues, tracks, noRowsBeforeAxis, segments, yoyBeforeAxis, longest, events: eventRows, yoy: yoyRange,
  };
}
