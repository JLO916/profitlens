"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chartColors, chartFontSize, chartRowHeights } from "@/application/chart-theme";
import type { FileName, ReasonCode } from "@/domain/types";
import { rankedTextWidth } from "./ranked-bars";

// V4-7a 代理 A：C30 Timeline 涵蓋時間軸（PRD §6.3 C30、§4.4 G20、§7.1、§7.4；CHART_CATALOG G20、§9.1；D-V4-40＝A；H5 設計稿 data.html 建議版）。
// 純 inline SVG。由上到下：區帶標字列（row24：上期、本期區帶的名稱直接標在區帶頂端）→ 每軌一列（row24：銷售、通路費用、廣告、檔期，≤ 4 軌）→ 日期軸（chartRowHeights.axis）；
// svg 高＝（軌數＋1）× row24＋axis，4 軌時 144 ≤ chartHeights.sm（PRD §5.7「sm 180（4 軌 × 24＋日期軸）」）。
// - 期間區帶 chartColors.band（上期、本期，從標字列一路畫到最後一軌）；相鄰兩段各內縮 1px，中間留 2px 白縫；寬放得下時直接標名稱。
// - 有列 chartColors.total 6px 細條；缺列 chartColors.missing 1px 虛線框（3 2），最小寬 TIMELINE_MIN_SEGMENT（6px，H5 設計稿 README §6 第 21 點：1 天的框在 390 只剩 4.8px）；
//   無列（銷售那天沒有任何一列）只在寬放得下時標「無列」字樣；檔期 chartColors.axis 2px 細線，寬放得下時標名稱。
// - 軌名在左（右對齊）、右端是呼叫端給的字（缺列天數、無列天數）。
// - 日期軸：軸的起訖兩端＋每月 1 日的刻度；與已放的字重疊時只畫刻度線不標字；窄（< TIMELINE_NARROW_BELOW，只有 390 的版面）時月份刻度減半（PRD §5.7）。
// - 去年同期（D-V4-40＝A）不畫在這條軸上：呼叫端在圖上方另寫一行（G20 的副標），所以這裡沒有 yoy 細線。
// 根 svg aria-hidden、不可聚焦、圖內沒有 tabIndex 與按鈕；缺列框可點（onSegment），鍵盤經由資料表每列的「篩選問題表」按鈕（同一個 { file, channel, reason }）。
// 色只經 chart-theme.ts 的 chartColors（CL-3）；高度只用 chartRowHeights（CL-10）；字級只用 chartFontSize（CL-5）。

/** SSR（還沒量到寬）時的座標系寬，與 C25、C27 相同。 */
export const TIMELINE_SSR_WIDTH = 560;
/**
 * 窄於這個值時是 390 的版面：軌名欄、右端欄 60，月份刻度減半（PRD §5.7「390：月份刻度減半」）。
 * V4-7a 整合（審查 A-4）：資料來源頁 G20 的框內寬 390＝324、768＝450（768 側欄仍在，H5 設計稿 README 的實測），
 * 門檻取兩者之間的 400；原本的 480 會把 768 也當成 390 版面（月份刻度減半），與 PRD 與設計稿不符。
 */
export const TIMELINE_NARROW_BELOW = 400;
/** 窄於這個值（且不窄於 TIMELINE_NARROW_BELOW）時是 768 的版面：軌名欄、右端欄 64，月份刻度不減半（設計稿 768＝450）；1280＝962、1440＝1122 為 72。 */
export const TIMELINE_MEDIUM_BELOW = 720;
/** 軌名欄與右端欄寬（H5 設計稿：1440／1280 為 72，768 為 64，390 為 60）。 */
export const TIMELINE_LABEL_WIDTH = { wide: 72, medium: 64, narrow: 60 } as const;
export const TIMELINE_END_WIDTH = { wide: 72, medium: 64, narrow: 60 } as const;
/** 依寬度選欄寬的級距（narrow 給了時只決定 390 版面與否：true＝narrow，false＝依寬度取 wide 或 medium）。 */
export type TimelineColumns = keyof typeof TIMELINE_LABEL_WIDTH;
export function timelineColumns(width: number, narrow?: boolean): TimelineColumns {
  if (narrow ?? width < TIMELINE_NARROW_BELOW) return "narrow";
  return width < TIMELINE_MEDIUM_BELOW ? "medium" : "wide";
}
/** 缺列框的最小寬（px）：1 天的缺列在窄螢幕仍看得到完整的虛線框。 */
export const TIMELINE_MIN_SEGMENT = 6;
/** 有列細條的最小寬（px）。 */
export const TIMELINE_MIN_ROW = 1;
/** 軌名與繪圖區、繪圖區與右端字的間距。 */
const GAP = 8;
/** 列內的位置（列頂起算）：字的基線、有列細條（上緣 9、高 6）、缺列框（上緣 5、高 14，框線內縮半個線寬）、檔期線與名稱。 */
const TEXT_BASELINE = 16;
const ROW_BAR_TOP = 9;
const ROW_BAR_HEIGHT = 6;
const MISSING_TOP = 5;
const MISSING_HEIGHT = 14;
const EVENT_LINE_Y = 17;
const EVENT_LABEL_Y = 11;
/** 日期軸刻度線長。 */
const TICK_LENGTH = 4;
/** 相鄰區帶各內縮的寬（兩段之間共 2px 白縫）。 */
const BAND_INSET = 1;
/** 區帶名、檔期名、刻度字放得下的留白。 */
const BAND_LABEL_PAD = 8;
const EVENT_LABEL_PAD = 4;
const TICK_LABEL_PAD = 4;
const NO_ROWS_PAD = 2;

/** 含頭含尾的日期區段（ISO）。 */
export interface TimelineRange { start: string; end: string }
/** 點缺列框時回傳的篩選條件（G20：問題表篩到該檔、該通路、該原因）。 */
export interface TimelineSegmentRef { file: FileName; channel: string; reason: ReasonCode }
/** 一段缺列：testId＝chart-{page}-{id}-seg-{語意 key}（呼叫端組好）。 */
export interface TimelineMissingInput extends TimelineRange, TimelineSegmentRef { testId: string }
/** 一個檔期：key 只給 React key（例如 events.csv 的行號）。 */
export interface TimelineEventInput extends TimelineRange { key: string; label: string }
/** 一軌。 */
export interface TimelineTrackInput {
  key: string;
  label: string;
  rows: readonly TimelineRange[];
  missing: readonly TimelineMissingInput[];
  noRows: readonly TimelineRange[];
  events: readonly TimelineEventInput[];
  /** 右端字（缺列天數、無列天數）；空字串時不畫。 */
  endLabel: string;
}
/** 期間區帶（上期、本期）：名稱直接標在區帶頂端。 */
export interface TimelineBandInput extends TimelineRange { key: string; label: string }

export interface TimelineBandShape { key: string; label: string; x: number; width: number; labelX: number | null }
export interface TimelineMissingShape extends TimelineSegmentRef { testId: string; start: string; end: string; x: number; width: number; y: number; height: number }
export interface TimelineTrackShape {
  key: string;
  label: string;
  /** 列頂 y。 */
  y: number;
  textY: number;
  rows: { start: string; x: number; width: number; y: number; height: number }[];
  missing: TimelineMissingShape[];
  noRows: { start: string; x: number; width: number; labelX: number | null }[];
  events: { key: string; label: string; x1: number; x2: number; y: number; labelX: number | null; labelY: number }[];
  endLabel: string;
  /** 右端字的 x（左對齊）：通常是 geometry.endX；字比右端欄寬時往左移到貼齊 svg 右緣，不被裁掉（審查修正：390 的「無列 10 天」）。 */
  endX: number;
}
export interface TimelineTick { iso: string; x: number; label: string | null }
export interface TimelineGeometry {
  width: number;
  /** （軌數＋1）× row24＋axis。 */
  height: number;
  /** 390 的版面（月份刻度減半）。 */
  narrow: boolean;
  /** 軌名欄與右端欄的級距（wide 72、medium 64、narrow 60）。 */
  columns: TimelineColumns;
  plot: { left: number; right: number };
  /** 軌名（右對齊）與右端字（左對齊）的 x。 */
  labelX: number;
  endX: number;
  days: number;
  dayWidth: number;
  /** 區帶從 0 畫到 bodyHeight（標字列＋各軌）。 */
  bodyHeight: number;
  bandLabelY: number;
  bands: TimelineBandShape[];
  tracks: TimelineTrackShape[];
  axis: { y: number; textY: number; start: { x: number; label: string }; end: { x: number; label: string } | null; ticks: TimelineTick[] };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const dayIndex = (from: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const overlaps = (range: TimelineRange, domain: TimelineRange) => range.end >= domain.start && range.start <= domain.end;
/** 軸上每月 1 日（嚴格晚於起日、不晚於訖日）。 */
function monthStarts(domain: TimelineRange): string[] {
  const out: string[] = [];
  let [year, month] = domain.start.split("-").map(Number);
  for (;;) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    if (iso > domain.end) return out;
    out.push(iso);
  }
}

/**
 * C30 幾何（純函式，tests/chart-geometry-v4.test.ts）。
 * domain：X 軸（D-V4-40＝A 由 coverageTimeline 決定）；超出軸的區段裁到軸內，完全在軸外的不畫。dateLabel：日期字（呼叫端用 formatDateL1）。
 * 座標取到 0.1；一天的寬＝繪圖區寬 ÷ 軸天數。
 */
export function timelineGeometry(input: { width: number; domain: TimelineRange; bands: readonly TimelineBandInput[]; tracks: readonly TimelineTrackInput[]; noRowsText: string; dateLabel: (iso: string) => string; narrow?: boolean }): TimelineGeometry {
  const width = Math.max(1, Math.round(input.width));
  const columns = timelineColumns(width, input.narrow);
  const narrow = columns === "narrow";
  const labelWidth = TIMELINE_LABEL_WIDTH[columns];
  const endWidth = TIMELINE_END_WIDTH[columns];
  const left = labelWidth, right = Math.max(left + 1, width - endWidth);
  const { domain } = input;
  const days = Math.max(1, dayIndex(domain.start, domain.end) + 1);
  const dayWidth = (right - left) / days;
  const clampDay = (index: number) => Math.min(Math.max(index, 0), days);
  const xStart = (iso: string) => left + clampDay(dayIndex(domain.start, iso)) * dayWidth;
  const xEnd = (iso: string) => left + clampDay(dayIndex(domain.start, iso) + 1) * dayWidth;
  const row24 = chartRowHeights.row24;
  const bodyHeight = (input.tracks.length + 1) * row24;

  const visibleBands = input.bands.filter(band => overlaps(band, domain));
  const bands = visibleBands.map((band, index): TimelineBandShape => {
    const before = visibleBands[index - 1], after = visibleBands[index + 1];
    const x0 = xStart(band.start) + (before !== undefined && dayIndex(before.end, band.start) === 1 ? BAND_INSET : 0);
    const x1 = xEnd(band.end) - (after !== undefined && dayIndex(band.end, after.start) === 1 ? BAND_INSET : 0);
    const bandWidth = Math.max(0, x1 - x0);
    const fits = bandWidth >= rankedTextWidth(band.label) + BAND_LABEL_PAD;
    return { key: band.key, label: band.label, x: round1(x0), width: round1(bandWidth), labelX: fits ? round1((x0 + x1) / 2) : null };
  });

  const tracks = input.tracks.map((track, index): TimelineTrackShape => {
    const y = (index + 1) * row24;
    const rows = track.rows.filter(range => overlaps(range, domain)).map(range => {
      const x0 = xStart(range.start);
      return { start: range.start, x: round1(x0), width: round1(Math.max(xEnd(range.end) - x0, TIMELINE_MIN_ROW)), y: y + ROW_BAR_TOP, height: ROW_BAR_HEIGHT };
    });
    const missing = track.missing.filter(range => overlaps(range, domain)).map((range): TimelineMissingShape => {
      const x0 = xStart(range.start), natural = xEnd(range.end) - x0;
      const boxWidth = Math.min(Math.max(natural, TIMELINE_MIN_SEGMENT), right - left);
      const x = Math.min(Math.max(x0 + natural / 2 - boxWidth / 2, left), right - boxWidth);
      return { testId: range.testId, file: range.file, channel: range.channel, reason: range.reason, start: range.start, end: range.end, x: round1(x), width: round1(boxWidth), y: y + MISSING_TOP, height: MISSING_HEIGHT };
    });
    const noRows = track.noRows.filter(range => overlaps(range, domain)).map(range => {
      const x0 = xStart(range.start), x1 = xEnd(range.end);
      return { start: range.start, x: round1(x0), width: round1(x1 - x0), labelX: x1 - x0 >= rankedTextWidth(input.noRowsText) + NO_ROWS_PAD ? round1((x0 + x1) / 2) : null };
    });
    const events = track.events.filter(range => overlaps(range, domain)).map(range => {
      const x0 = xStart(range.start), x1 = xEnd(range.end);
      const fits = x1 - x0 >= rankedTextWidth(range.label) + EVENT_LABEL_PAD;
      return { key: range.key, label: range.label, x1: round1(x0 + 1), x2: round1(Math.max(x1 - 1, x0 + 1.5)), y: y + EVENT_LINE_Y, labelX: fits ? round1((x0 + x1) / 2) : null, labelY: y + EVENT_LABEL_Y };
    });
    const endX = round1(Math.min(right + GAP, width - rankedTextWidth(track.endLabel)));
    return { key: track.key, label: track.label, y, textY: y + TEXT_BASELINE, rows, missing, noRows, events, endLabel: track.endLabel, endX };
  });

  // 日期軸：起訖兩端＋每月 1 日；窄時月份刻度減半（留第 2、4、6… 個）；標字與已放的字重疊時只畫刻度線。
  const startLabel = input.dateLabel(domain.start), endLabel = input.dateLabel(domain.end);
  const kept: { from: number; to: number }[] = [{ from: left, to: left + rankedTextWidth(startLabel) }];
  const end = domain.end === domain.start ? null : { x: round1(right), label: endLabel };
  if (end !== null) kept.push({ from: right - rankedTextWidth(endLabel), to: right });
  const months = monthStarts(domain);
  const ticks = months.filter((_, order) => !narrow || months.length < 2 || order % 2 === 1).map((iso): TimelineTick => {
    const x = xStart(iso), label = input.dateLabel(iso), half = rankedTextWidth(label) / 2 + TICK_LABEL_PAD;
    const box = { from: x - half, to: x + half };
    const fits = !kept.some(other => box.from < other.to && box.to > other.from);
    if (fits) kept.push(box);
    return { iso, x: round1(x), label: fits ? label : null };
  });

  return {
    width, height: bodyHeight + chartRowHeights.axis, narrow, columns,
    plot: { left, right }, labelX: left - GAP, endX: right + GAP, days, dayWidth: Math.round(dayWidth * 100) / 100,
    bodyHeight, bandLabelY: TEXT_BASELINE, bands, tracks,
    axis: { y: bodyHeight, textY: bodyHeight + TEXT_BASELINE, start: { x: left, label: startLabel }, end, ticks },
  };
}

export interface TimelineProps {
  domain: TimelineRange;
  bands: readonly TimelineBandInput[];
  tracks: readonly TimelineTrackInput[];
  /** 無列的字樣（labels）。 */
  noRowsText: string;
  dateLabel: (iso: string) => string;
  /** 點缺列框：G20 把問題表篩到該檔、該通路、該原因（鍵盤經由資料表的篩選按鈕）。不給時缺列框不可點。 */
  onSegment?: (segment: TimelineSegmentRef) => void;
  /** 容器寬（px）；不給時以 ResizeObserver 量測，SSR 先用 560。 */
  width?: number;
}

/** C30：放在 ChartFrame（固定高 sm、aria-hidden）內。根 svg.chart-timeline aria-hidden、focusable=false。 */
export function Timeline({ domain, bands, tracks, noRowsText, dateLabel, onSegment, width }: TimelineProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setMeasured(current => current === next ? current : next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const drawWidth = Math.round(width ?? measured ?? TIMELINE_SSR_WIDTH);
  const geometry = useMemo(() => timelineGeometry({ width: drawWidth, domain, bands, tracks, noRowsText, dateLabel }), [drawWidth, domain, bands, tracks, noRowsText, dateLabel]);
  const { axis } = geometry;
  return <div ref={frame} className="timeline-measure">
    <svg className="chart-timeline" viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%" height={geometry.height} aria-hidden="true" focusable="false" fontSize={chartFontSize} preserveAspectRatio="xMinYMin meet" data-days={geometry.days}>
      <g className="timeline-bands">{geometry.bands.map(band => <g key={band.key}>
        <rect data-kind="band" data-band={band.key} x={band.x} y={0} width={band.width} height={geometry.bodyHeight} fill={chartColors.band} />
        {band.labelX !== null && <text className="timeline-note" x={band.labelX} y={geometry.bandLabelY} textAnchor="middle">{band.label}</text>}
      </g>)}</g>
      <g className="timeline-tracks">{geometry.tracks.map(track => <g key={track.key} className="timeline-track" data-track={track.key}>
        <text className="timeline-name" x={geometry.labelX} y={track.textY} textAnchor="end">{track.label}</text>
        {track.rows.map(row => <rect key={row.start} data-kind="rows" x={row.x} y={row.y} width={row.width} height={row.height} fill={chartColors.total} />)}
        {track.noRows.map(range => range.labelX === null ? null : <text key={range.start} className="timeline-note" data-kind="no-rows" x={range.labelX} y={track.textY} textAnchor="middle">{noRowsText}</text>)}
        {track.events.map(event => <g key={event.key} data-kind="event">
          <line x1={event.x1} x2={event.x2} y1={event.y} y2={event.y} stroke={chartColors.axis} strokeWidth={2} />
          {event.labelX !== null && <text className="timeline-note" x={event.labelX} y={event.labelY} textAnchor="middle">{event.label}</text>}
        </g>)}
        {track.missing.map(segment => <rect
          key={segment.testId}
          className={`timeline-missing${onSegment ? " is-clickable" : ""}`}
          data-kind="missing"
          data-testid={segment.testId}
          x={round1(segment.x + 0.5)} y={segment.y + 0.5} width={round1(Math.max(segment.width - 1, 0.5))} height={segment.height - 1}
          fill="none" stroke={chartColors.missing} strokeWidth={1} strokeDasharray="3 2"
          pointerEvents={onSegment ? "all" : undefined}
          onClick={onSegment ? () => onSegment({ file: segment.file, channel: segment.channel, reason: segment.reason }) : undefined}
        />)}
        {track.endLabel !== "" && <text className="timeline-end" x={track.endX} y={track.textY}>{track.endLabel}</text>}
      </g>)}</g>
      <g className="timeline-axis">
        <line x1={geometry.plot.left} x2={geometry.plot.right} y1={axis.y + 0.5} y2={axis.y + 0.5} stroke={chartColors.grid} strokeWidth={1} />
        {axis.ticks.map(tick => <g key={tick.iso}>
          <line x1={tick.x} x2={tick.x} y1={axis.y} y2={axis.y + TICK_LENGTH} stroke={chartColors.axis} strokeWidth={1} />
          {tick.label !== null && <text x={tick.x} y={axis.textY} textAnchor="middle">{tick.label}</text>}
        </g>)}
        <text x={axis.start.x} y={axis.textY}>{axis.start.label}</text>
        {axis.end !== null && <text x={axis.end.x} y={axis.textY} textAnchor="end">{axis.end.label}</text>}
      </g>
    </svg>
  </div>;
}
