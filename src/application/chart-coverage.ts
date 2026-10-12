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
// - 銷售軌：軸上每一天有沒有任何銷售列（dataset.sales[].date）。沒有列的日子是「無列」（v4 GLOSSARY #5：不當作零銷售，也不是缺列）。
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
  /** 缺列天數合計（檔 × 通路 × 日；＝這一檔的缺列問題筆數）。 */
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
  /** X 軸（D-V4-40＝A）。 */
  axis: CoverageRange;
  /** 有範圍級缺列問題時為 true：不產生缺列區段，呼叫端退回文字。 */
  fallback: boolean;
  rangeIssues: CoverageRangeIssue[];
  /** 銷售、通路費用、廣告三軌（固定這個順序）。 */
  tracks: CoverageTrack[];
  /** 全部缺列區段：依檔案、通路（manifest.channels 的順序）、起日排序。 */
  segments: CoverageSegment[];
  /** 最長的缺列區段（標題用）：天數最多；同長依檔案順序、起日、通路順序取前者。沒有缺列時為 null。 */
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

  // X 軸（D-V4-40＝A）：上期起日到涵蓋訖日；最早的缺列區段更早時往前延伸，不早於涵蓋起日。
  const earliest = segments.reduce<string | null>((min, segment) => (min === null || segment.start < min ? segment.start : min), null);
  const wanted = earliest !== null && earliest < previous.start ? earliest : previous.start;
  const axisStart = wanted < coverage.start ? coverage.start : wanted > coverage.end ? coverage.end : wanted;
  const axis = rangeOf(axisStart, coverage.end);
  const axisDates = dateRange(axis.start, axis.end);

  const salesDates = new Set(dataset.sales.map(row => row.date));
  const salesNoRows = mergeDates(axisDates.filter(date => !salesDates.has(date)));
  const tracks: CoverageTrack[] = COVERAGE_FILES.map(spec => {
    if (spec.key === "sales") {
      return { key: spec.key, file: spec.file, rows: mergeDates(axisDates.filter(date => salesDates.has(date))), missing: [], noRows: salesNoRows, missingDays: 0, noRowDays: salesNoRows.reduce((sum, range) => sum + range.days, 0) };
    }
    const missing = segments.filter(segment => segment.key === spec.key);
    const missingDates = new Set(missing.flatMap(segment => dateRange(segment.start, segment.end)));
    // fallback 時不知道哪幾天有列：不畫有列細條（呼叫端整張退回文字）。
    const rows = fallback ? [] : mergeDates(axisDates.filter(date => !missingDates.has(date)));
    return { key: spec.key, file: spec.file, rows, missing, noRows: [], missingDays: missing.reduce((sum, segment) => sum + segment.days, 0), noRowDays: 0 };
  });

  const longest = segments.reduce<CoverageSegment | null>((best, segment) => {
    if (best === null) return segment;
    const order = best.days - segment.days || FILE_RANK.get(segment.key)! - FILE_RANK.get(best.key)! || compareText(segment.start, best.start) || byChannel(segment.channel, best.channel);
    return order < 0 ? segment : best;
  }, null);

  const eventRows = (events?.rows ?? [])
    .filter(row => row.end >= axis.start && row.start <= axis.end)
    .map(row => ({ start: row.start, end: row.end, label: row.label, line: row.line }))
    .sort((a, b) => compareText(a.start, b.start) || a.line - b.line);

  let yoyRange: CoverageYoy | null = null;
  if (!fallback && yoy?.status === "ready" && !(yoy.period.start === previous.start && yoy.period.end === previous.end)) {
    const dates = dateRange(yoy.period.start, yoy.period.end);
    const missingDates = new Set(daily.map(issue => issue.date));
    yoyRange = { ...rangeOf(yoy.period.start, yoy.period.end), missingDays: dates.filter(date => missingDates.has(date)).length, noRowDays: dates.filter(date => !salesDates.has(date)).length };
  }

  return {
    version: COVERAGE_TIMELINE_VERSION,
    coverage, dataAsOf: manifest.data_as_of, channels: [...manifest.channels],
    previous: { start: previous.start, end: previous.end }, current: { start: current.start, end: current.end },
    axis, fallback, rangeIssues, tracks, segments, longest, events: eventRows, yoy: yoyRange,
  };
}
