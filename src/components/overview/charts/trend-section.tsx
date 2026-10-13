"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, usePlotArea, useXAxisScale, useYAxisScale, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { trendTakeaways } from "@/application/chart-takeaways";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { eventBands as computeEventBands, type EventSet } from "@/application/events";
import { formatAmountL1, formatAxisWan, metricDefinitions, type Layer } from "@/application/presentation";
import type { PeriodWeeklyRow, WeeklyRow, WorkspaceSnapshot, YoyWeeklyRow } from "@/application/workspace";
import type { Metric, MetricName, Period, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { ChartFrame, coordinate, metricText, type ChartLegendItem, type ChartTakeaway } from "./chart-frame";
import { waterfallTextWidth } from "./waterfall-svg";

// V3-4b 區塊 7 每週淨營收與扣廣告後貢獻（C16，PRD §7.1 第 7 點、§9.5）。
// 標題用標準名稱，副標是週的分組說明；takeaway 列「淨營收期間合計」「最近完整週淨營收」（chart-takeaways.ts）；
// 折線：本期 --chart-current 2px、上期 --chart-previous 1.5px，只在最後一點畫 3px 圓點並直接標值；缺資料的週斷線並標「無資料」；檔期區帶沿用 events.ts。
// V3-9b F8（PRD §10.1 F8、§9.5）：第三線「去年同期」--chart-yoy 1.5px 虛線、不畫圓點，去年同期第 i 週對齊本期第 i 週；不可用時圖例項保留並標「無資料」，圖下方寫原因（trend-yoy-note）。
// V3-9b F10：每一週的點都可點（透明熱區），開該週該指標的抽屜並篩到該週；鍵盤經由資料表的同一個抽屜（weekEvidence）。
// V4-2 代理 B（G3；PRD §4.1、§4.4、§7.2；CHART_CATALOG G3）：只改 Y 軸刻度。刻度由 trendAxis 自己算（1／2／2.5／5 × 10ⁿ 的整齊步長、含 0、上下界取步長的整數倍），
// 文字改呼叫 presentation.ts 的 formatAxisWan（整數萬，不再出現「50.0 萬」）；本期、上期末點標值、三項圖例、去年同期線（390 不隱藏）都沿用 V3，不新增 labels。
// V4-8b 代理 B（D-V4-59 (6)）：末點標值只在碰撞時移動（trendEndLabelLayout）：往左會進 Y 軸刻度欄時改放點的右側，與先放的標值重疊時上下移開；沒有碰撞時位置與 V3 逐字相同。

const ui = labels.overview.page;
const copy = labels.overview.trendV3;
const frame = labels.overview.chartFrame;
const yoyCopy = labels.overview.trendYoyV3;
const TABLE_METRICS = ["net_revenue", "gross_profit", "contribution_after_marketing"] as const;
/** 四條線：淨營收與扣廣告後貢獻 × 本期與上期；上期與本期各自只在自己的週有值（x 軸是 snapshot.weeks 的順序）。 */
const SERIES = [
  { key: "revenuePrevious", metric: "net_revenue", period: "previous" },
  { key: "contributionPrevious", metric: "contribution_after_marketing", period: "previous" },
  { key: "revenueCurrent", metric: "net_revenue", period: "current" },
  { key: "contributionCurrent", metric: "contribution_after_marketing", period: "current" },
] as const;
/** V3-9b F8 去年同期兩條線（淨營收、扣廣告後貢獻）：只在本期的週有值（對齊本期第 i 週）。 */
export const YOY_SERIES = [
  { key: "revenueYoy", metric: "net_revenue" },
  { key: "contributionYoy", metric: "contribution_after_marketing" },
] as const;
/** 去年同期線的樣式（§9.5「去年同期固定 --chart-yoy 虛線」）：1.5px、虛線、缺資料斷線（不內插、不畫成 0）。圖在伺服器端不繪製，單元測試直接斷言這組設定。 */
export const YOY_LINE = { stroke: chartColors.yoy, strokeWidth: 1.5, strokeDasharray: "4 3", connectNulls: false, isAnimationActive: false } as const;
type SeriesKey = typeof SERIES[number]["key"];
type YoySeriesKey = typeof YOY_SERIES[number]["key"];
type TrendRow = PeriodWeeklyRow & { index: number; tick: string; yoy: YoyWeeklyRow | null } & Record<SeriesKey | YoySeriesKey, number | null>;

/** 刻度約幾條（與 V3 的 tickCount 相同）。 */
const AXIS_TICK_COUNT = 4;
/** 整齊步長的係數（與 V3 的 niceTicks="snap125" 及 chart-frame.tsx 的 axisTicks 相同：1、2、2.5、5 × 10ⁿ）。 */
const AXIS_STEPS = [1, 2, 2.5, 5, 10] as const;
export interface TrendAxis { domain: [number, number]; ticks: number[]; step: number; labels: string[] }
/**
 * V4-2 G3：Y 軸的範圍、刻度與刻度文字（只是圖形座標；金額本身一律來自 domain 字串）。
 * 範圍含 0（與 V3 的 Recharts 預設相同），上下界取步長的整數倍，所以最高與最低的線一定落在刻度內；刻度文字＝formatAxisWan(ticks, step)。
 * 沒有任何有值的點時回傳 [0, 1] 與單一刻度 0。
 */
export function trendAxis(values: readonly (number | null)[], count = AXIS_TICK_COUNT): TrendAxis {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  if (max - min <= 0) return { domain: [0, 1], ticks: [0], step: 1, labels: formatAxisWan([0], 1) };
  const raw = (max - min) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Number((AXIS_STEPS.map(factor => factor * magnitude).find(candidate => candidate >= raw) ?? 10 * magnitude).toPrecision(12));
  const lo = Math.floor(min / step), hi = Math.ceil(max / step);
  const ticks: number[] = [];
  for (let k = lo; k <= hi; k++) ticks.push(Number((k * step).toPrecision(12)) || 0);
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step, labels: formatAxisWan(ticks, step) };
}
// 「{指標} {數值}」提示列（與 v2 tooltip 相同的組合）。
const metricValue = (metric: string, value: string) => `${metric} ${value}`;

export interface TrendSectionProps {
  snapshot: WorkspaceSnapshot;
  events?: EventSet | null;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/**
 * 趨勢圖的列：每週一列，系列值只在對應期間的週有值，其他週為 null（connectNulls=false 會斷開兩期）。
 * V3-9b F8：本期第 i 週帶去年同期第 i 週（yoy）；去年同期週數較多時多出的不畫，較少時本期多出的週 yoy 為 null；缺值為 null（斷線），絕不畫成 0。
 */
export function trendRows(weeks: readonly PeriodWeeklyRow[], yoyWeeks: readonly YoyWeeklyRow[] = []): TrendRow[] {
  const currentOrder = (index: number) => weeks.slice(0, index).filter(week => week.period === "current").length;
  return weeks.map((week, index) => {
    const yoy = week.period === "current" ? yoyWeeks[currentOrder(index)] ?? null : null;
    return {
      ...week, index, tick: week.start.slice(5).replace("-", "/"), yoy,
      ...Object.fromEntries(SERIES.map(series => [series.key, week.period === series.period ? coordinate(week.metrics[series.metric]) : null])) as Record<SeriesKey, number | null>,
      ...Object.fromEntries(YOY_SERIES.map(series => [series.key, yoy === null ? null : coordinate(yoy.metrics[series.metric])])) as Record<YoySeriesKey, number | null>,
    };
  });
}

/** V3-9b F10：一週一個指標的抽屜內容（圖上的點與資料表的金額共用）：指標名為標題、期間與來源是該週，filter 篩到該週。 */
export function weekEvidence(week: WeeklyRow, name: MetricName, channels: string[]): EvidenceSelection {
  return { name, metric: week.metrics[name], period: { start: week.start, end: week.end }, sources: week.sources, channels, title: metricDefinitions[name].label, filter: { week: { start: week.start, end: week.end, label: week.label } } };
}

/** 各系列最後一個有值的點（只在這一點畫圓點與直接標值）；整條沒有值時為 -1。 */
export function lastPoints(rows: readonly TrendRow[]): Record<SeriesKey, number> {
  return Object.fromEntries(SERIES.map(series => [series.key, rows.reduce((last, row) => row[series.key] === null ? last : row.index, -1)])) as Record<SeriesKey, number>;
}

/** V4-8b：一個末點標值（資料座標）：系列、x＝週序號、y＝圖形座標值、標值文字、本期淨營收的「未滿 7 天」（沒有時 null）、是否為本期（強調字）。 */
export interface TrendEndLabel { key: SeriesKey; index: number; value: number; text: string; note: string | null; strong: boolean }
/** 放標值的順序：本期（淨營收、扣廣告後）先放、留在原位；上期後放，碰撞時由上期讓開。 */
const END_LABEL_ORDER: readonly SeriesKey[] = ["revenueCurrent", "contributionCurrent", "revenuePrevious", "contributionPrevious"];
/**
 * V4-8b：各系列最後一點的標值（文字與 V3 相同：本期「{指標} {L1}」、上期「上期 {L1}」；最後一週未滿 7 天時本期淨營收另帶「未滿 7 天」）。
 * 整條沒有值的系列不列。順序＝END_LABEL_ORDER（trendEndLabelLayout 依這個順序放）。
 */
export function trendEndLabels(rows: readonly TrendRow[], last: Record<SeriesKey, number>, incompleteNote: string | null): TrendEndLabel[] {
  return END_LABEL_ORDER.flatMap(key => {
    const series = SERIES.find(item => item.key === key)!;
    const row = rows[last[key]];
    const value = row?.[key];
    if (row === undefined || value === null || value === undefined) return [];
    const shown = formatAmountL1(row.metrics[series.metric].value);
    const current = series.period === "current";
    const text = current ? fill(copy.lastPoint, { metric: metricDefinitions[series.metric].shortLabel, value: shown }) : fill(copy.previousPoint, { value: shown });
    return [{ key, index: row.index, value, text, note: current && series.metric === "net_revenue" ? incompleteNote : null, strong: current }];
  });
}

/** 末點標值的像素錨點（圓心）與要畫的字。 */
export interface TrendEndAnchor { key: string; text: string; note: string | null; cx: number; cy: number }
/** 標值的位置：x、基線 y、「未滿 7 天」的基線、對齊（end＝V3 的點左側；start＝改放點右側）。 */
export interface TrendEndPlacement { x: number; y: number; noteY: number; anchor: "start" | "end" }
/** V3 的標值偏移（點左 6px、基線在點上 8px、「未滿 7 天」在點下 18px）與避讓用的近似框（12px 字的 svg 文字框：基線上 11、下 3；移開時與他框留 2px）。 */
export const TREND_END_LABEL = { gap: 6, rise: 8, noteDrop: 18, ascent: 11, descent: 3, clearance: 2 } as const;
interface EndLabelBox { left: number; right: number; top: number; bottom: number }
const endBoxesOverlap = (a: EndLabelBox, b: EndLabelBox) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * V4-8b（D-V4-59 (6)）：G3 末點標值的位置（純函式，tests/v48b-390.test.tsx）。依 anchors 的順序放，預設照 V3（點左 6px、靠右對齊、基線在點上 8px），只在兩種碰撞時移動：
 *   1. 往左放會進 Y 軸刻度欄（圓心 x − 6 − 估寬 < bounds.left，估寬取標值與「未滿 7 天」較寬者）：改放點的右側 6px、靠左對齊；
 *   2. 與先放的標值（含「未滿 7 天」）重疊（框＝估寬 × 基線上 11、下 3）：上下移到最近的不重疊位置（貼齊某個已放框的上緣或下緣、留 2px；移動量最小者，同量時往上；
 *      不超出 bounds.top 與 bounds.bottom；都放不下時不動）。
 * 沒有碰撞時每個標值都是 { x: cx − 6, y: cy − 8, noteY: cy + 18, anchor: "end" }，與 V3 逐字相同。字寬用 waterfallTextWidth（只用於避讓）。
 */
export function trendEndLabelLayout(anchors: readonly TrendEndAnchor[], bounds: { left: number; top: number; bottom: number }): Record<string, TrendEndPlacement> {
  const { gap, rise, noteDrop, ascent, descent, clearance } = TREND_END_LABEL;
  const placed: EndLabelBox[] = [];
  const result: Record<string, TrendEndPlacement> = {};
  for (const anchor of anchors) {
    const textWidth = waterfallTextWidth(anchor.text);
    const noteWidth = anchor.note === null ? 0 : waterfallTextWidth(anchor.note);
    const flip = anchor.cx - gap - Math.max(textWidth, noteWidth) < bounds.left;
    const x = flip ? anchor.cx + gap : anchor.cx - gap;
    const span = (width: number) => flip ? { left: x, right: x + width } : { left: x - width, right: x };
    const boxesAt = (dy: number): EndLabelBox[] => {
      const y = anchor.cy - rise + dy;
      const main = { ...span(textWidth), top: y - ascent, bottom: y + descent };
      if (anchor.note === null) return [main];
      const noteY = anchor.cy + noteDrop + dy;
      return [main, { ...span(noteWidth), top: noteY - ascent, bottom: noteY + descent }];
    };
    const collides = (boxes: readonly EndLabelBox[]) => boxes.some(box => placed.some(other => endBoxesOverlap(box, other)));
    const base = boxesAt(0);
    let dy = 0;
    if (collides(base)) {
      const top = Math.min(...base.map(box => box.top)), bottom = Math.max(...base.map(box => box.bottom));
      const fits = (shift: number) => top + shift >= bounds.top && bottom + shift <= bounds.bottom && !collides(boxesAt(shift));
      const shifts = placed.flatMap(other => [other.top - clearance - bottom, other.bottom + clearance - top]).filter(fits).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
      dy = shifts[0] ?? 0;
    }
    placed.push(...boxesAt(dy));
    result[anchor.key] = { x, y: anchor.cy - rise + dy, noteY: anchor.cy + noteDrop + dy, anchor: flip ? "start" : "end" };
  }
  return result;
}

/**
 * V4-8b：末點標值的 <text>（在 Recharts 圖內渲染，讀得到軸比例與繪圖區）。用軸比例把各系列末點換成像素（自己的點用 Line 給的圓心），
 * 交給 trendEndLabelLayout 取自己的位置；量不到繪圖區時照 V3 的位置。輸出的元素、class 與文字與 V3 相同，只有 x、y、text-anchor 可能不同。
 */
function TrendEndText({ ends, own, cx, cy }: { ends: readonly TrendEndLabel[]; own: SeriesKey; cx: number; cy: number }) {
  const xScale = useXAxisScale(), yScale = useYAxisScale(), plot = usePlotArea();
  const label = ends.find(end => end.key === own);
  if (label === undefined) return null;
  const anchors = ends.flatMap((end): TrendEndAnchor[] => {
    if (end.key === own) return [{ key: end.key, text: end.text, note: end.note, cx, cy }];
    const x = xScale?.(end.index), y = yScale?.(end.value);
    return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y) ? [{ key: end.key, text: end.text, note: end.note, cx: x, cy: y }] : [];
  });
  const place: TrendEndPlacement = plot ? trendEndLabelLayout(anchors, { left: plot.x, top: 0, bottom: plot.y + plot.height })[own]
    : { x: cx - TREND_END_LABEL.gap, y: cy - TREND_END_LABEL.rise, noteY: cy + TREND_END_LABEL.noteDrop, anchor: "end" };
  return <>
    <text className={`chart-value${label.strong ? " is-strong" : ""}`} x={place.x} y={place.y} textAnchor={place.anchor}>{label.text}</text>
    {label.note !== null && <text className="chart-value" x={place.x} y={place.noteY} textAnchor={place.anchor}>{label.note}</text>}
  </>;
}

export function TrendSection({ snapshot, events = null, onEvidence }: TrendSectionProps) {
  const { report, weeks } = snapshot;
  const channels = report.scope.channels;
  const yoy = snapshot.yoy;
  const yoyWeeks = yoy?.status === "ready" ? yoy.weeks : [];
  const open = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[]) => onEvidence({ name, metric, period, sources, channels, title: metricDefinitions[name].label });
  const openWeek = (name: MetricName, row: WeeklyRow) => onEvidence(weekEvidence(row, name, channels));
  /** 資料表的金額（L2 number-link）：開該週該指標的抽屜，與點圖上的點相同（鍵盤經由這裡）。 */
  const number = (name: MetricName, row: WeeklyRow, layer: Layer) => <button className="number-link" onClick={() => openWeek(name, row)}>{metricText(name, row.metrics[name], layer)}</button>;
  const takeaway = trendTakeaways(snapshot);
  const week = takeaway.lastCompleteWeek.week;
  const yoyTotal = takeaway.yoy;
  const takeaways: ChartTakeaway[] = [
    { key: "total", label: takeaway.total.label, value: <button type="button" className="number-link" aria-label={fill(copy.takeawayAria, { label: takeaway.total.label, value: takeaway.total.display })} onClick={() => open("net_revenue", takeaway.total.metric, report.current.period, report.current.sources)}>{takeaway.total.display}</button> },
    {
      key: "last-complete-week", label: takeaway.lastCompleteWeek.label, note: takeaway.lastCompleteWeek.range,
      value: week === null ? <span className="takeaway-empty">{takeaway.lastCompleteWeek.display}</span>
        : <button type="button" className="number-link" aria-label={fill(copy.takeawayAria, { label: takeaway.lastCompleteWeek.label, value: takeaway.lastCompleteWeek.display })} onClick={() => open("net_revenue", week.metrics.net_revenue, { start: week.start, end: week.end }, week.sources)}>{takeaway.lastCompleteWeek.display}</button>,
    },
    // V3-9b F8：去年同期可用時加「去年同期淨營收合計」（整段的抽屜，附去年同期的期間）。
    ...(yoyTotal === null ? [] : [{ key: "yoy-total", label: yoyTotal.label, note: yoyTotal.range, value: <button type="button" className="number-link" aria-label={fill(copy.takeawayAria, { label: yoyTotal.label, value: yoyTotal.display })} onClick={() => open("net_revenue", yoyTotal.metric, yoyTotal.period, yoyTotal.sources)}>{yoyTotal.display}</button> }]),
  ];
  // V3-9b F8：圖例第三項「去年同期」（虛線段）；不可用時保留並標「無資料」。
  const legend: ChartLegendItem[] = [{ key: "current", label: frame.legend.current, color: chartColors.current }, { key: "previous", label: frame.legend.previous, color: chartColors.previous }, { key: "yoy", label: yoyCopy.legend, color: chartColors.yoy, dash: YOY_LINE.strokeDasharray, note: yoy?.status === "ready" ? undefined : frame.noData, testId: "trend-legend-yoy" }];

  // 趨勢圖 x 軸用週序號（數值軸，避免上期／本期同月同日的刻度撞名），檔期區帶用 events.ts 的分數位置（週 i 的點在 x＝i，區帶以 ±0.5 置中）。
  const bands = computeEventBands(events, weeks).map(band => ({ event: band.event, x1: band.from - 0.5, x2: band.to - 0.5 }));
  const rows = trendRows(weeks, yoyWeeks);
  const last = lastPoints(rows);
  const ends = trendEndLabels(rows, last, takeaway.lastWeekIncomplete ? copy.incompleteShort : null);
  // V4-2 G3：刻度涵蓋圖上所有的線（本期、上期與去年同期）；Recharts 只照這組刻度畫格線與文字。
  const yAxis = trendAxis(rows.flatMap(row => [...SERIES, ...YOY_SERIES].map(series => row[series.key])));
  const yTickText = new Map(yAxis.ticks.map((tick, index) => [tick, yAxis.labels[index]]));
  const missingWeeks = rows.filter(row => row.metrics.net_revenue.value === null);
  // 去年同期某週淨營收缺值（本週自己有值）：斷線並在該週標「去年同期無資料」。
  const missingYoy = rows.filter(row => row.yoy !== null && row.yoy.metrics.net_revenue.value === null && row.metrics.net_revenue.value !== null);
  /** V3-9b F10：每一週的點的透明熱區（8px），點了開該週該指標的抽屜；圖本身 aria-hidden，熱區不可聚焦（鍵盤經由資料表）。data-series／data-start 標出系列與該週起日。 */
  const pointHit = (props: DotItemDotProps, row: WeeklyRow | null, name: MetricName, series: SeriesKey | YoySeriesKey): ReactNode => {
    if (row === null || props.cx === undefined || props.cy === undefined || props.value === null || props.value === undefined) return null;
    return <circle key={`${series}-hit-${props.index}`} className="chart-point-hit" data-series={series} data-start={row.start} cx={Number(props.cx)} cy={Number(props.cy)} r={8} fill="transparent" onClick={() => openWeek(name, row)} />;
  };
  /** 最後一點：本期畫 3px 圓點並標「{指標} {L1}」；上期只標「上期 {L1}」；最後一週未滿 7 天時本期淨營收下方加「未滿 7 天」（文字與位置見 trendEndLabels、TrendEndText）。 */
  const lastPointDot = (series: typeof SERIES[number]) => function LastPoint(props: DotItemDotProps): ReactNode {
    const hit = pointHit(props, rows[props.index] ?? null, series.metric, series.key);
    if (props.index !== last[series.key] || props.cx === undefined || props.cy === undefined) return hit;
    const current = series.period === "current";
    const cx = Number(props.cx), cy = Number(props.cy);
    return <g key={`${series.key}-last`}>
      {current && <circle cx={cx} cy={cy} r={3} fill={chartColors.current} />}
      {hit}
      <TrendEndText ends={ends} own={series.key} cx={cx} cy={cy} />
    </g>;
  };

  /** 去年同期線的點：不畫圓點，只有可點的熱區（該列對齊的去年同期週）。 */
  const yoyPointDot = (series: typeof YOY_SERIES[number]) => function YoyPoint(props: DotItemDotProps): ReactNode {
    return pointHit(props, rows[props.index]?.yoy ?? null, series.metric, series.key);
  };
  /** 資料表的去年同期欄：該列對齊的去年同期週（number-link，開去年那一週的抽屜）；沒有時寫「無資料」。 */
  const yoyCell = (row: TrendRow, name: MetricName) => row.yoy === null ? <span className="trend-yoy-empty">{frame.noData}</span> : number(name, row.yoy, "L2");

  const after = <>
    {takeaway.incompleteNote !== null && <p className="note">{takeaway.incompleteNote}</p>}
    {yoy?.status === "unavailable" && <p className="note trend-yoy-note" data-testid="trend-yoy-note">{fill(yoyCopy.unavailable, { reason: yoy.reason })}</p>}
    {bands.length > 0 && <p className="note" data-testid="trend-events">{fill(labels.events.trendList, { list: bands.map(band => fill(labels.events.trendItem, { label: band.event.label, start: band.event.start, end: band.event.end })).join(labels.events.joiner) })}</p>}
  </>;
  const table = <><div className="table-scroll" tabIndex={0} role="region" aria-label={ui.trendTableAria}><table><caption>{fill(ui.captionWithUnit, { caption: ui.trendCaption })}</caption><thead><tr><th>{ui.colPeriod}</th><th>{ui.colRange}</th>{TABLE_METRICS.map(name => <th key={name}>{metricDefinitions[name].label}</th>)}{YOY_SERIES.map(series => <th key={series.key}>{fill(yoyCopy.tableColumn, { metric: metricDefinitions[series.metric].label })}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.period}-${row.start}`}><td>{labels.shell.periods[row.period]}</td><td>{row.start} — {row.end}</td>{TABLE_METRICS.map(name => <td key={name}>{number(name, row, "L2")}</td>)}{YOY_SERIES.map(series => <td key={series.key}>{yoyCell(row, series.metric)}</td>)}</tr>)}</tbody></table></div><p className="note">{ui.trendTechnical}</p></>;

  return <ChartFrame id="trend" testId="trend" title={labels.overview.sections.trend} subtitle={takeaway.subtitle} legend={legend} takeaways={takeaways} height="sm" state={weeks.length === 0 ? "empty" : "ready"} after={after}
    dataTable={{ summary: fill(ui.dataTable, { title: labels.overview.sections.trend }), content: table }}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.sm }}>
      <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey="index" type="number" domain={[-0.5, Math.max(rows.length - 0.5, 0.5)]} ticks={rows.map(row => row.index)} tickFormatter={(value: number) => rows[value]?.tick ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} minTickGap={26} />
        <YAxis domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={(value: number) => yTickText.get(value) ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} width={56} />
        <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as TrendRow | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.start} — {row.end}</strong><p>{labels.shell.periods[row.period]}</p><p>{metricValue(metricDefinitions.net_revenue.shortLabel, metricText("net_revenue", row.metrics.net_revenue, "L1"))}</p><p>{metricValue(metricDefinitions.contribution_after_marketing.shortLabel, metricText("contribution_after_marketing", row.metrics.contribution_after_marketing, "L1"))}</p>{row.yoy !== null && <p>{metricValue(fill(yoyCopy.tableColumn, { metric: metricDefinitions.net_revenue.shortLabel }), metricText("net_revenue", row.yoy.metrics.net_revenue, "L1"))}</p>}</div> : null; }} />
        {bands.map(band => <ReferenceArea key={`${band.event.line}-${band.x1}`} x1={band.x1} x2={band.x2} ifOverflow="visible" fill={chartColors.band} fillOpacity={1} strokeOpacity={0} label={{ value: band.event.label, position: "insideTop", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {missingWeeks.map(row => <ReferenceLine key={`missing-${row.index}`} x={row.index} stroke={chartColors.grid} strokeDasharray="2 4" label={{ value: frame.noData, position: "insideBottom", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {missingYoy.map(row => <ReferenceLine key={`missing-yoy-${row.index}`} x={row.index} stroke={chartColors.grid} strokeDasharray="2 4" label={{ value: yoyCopy.missingPoint, position: "insideBottom", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {SERIES.map(series => <Line key={series.key} dataKey={series.key} stroke={series.period === "current" ? chartColors.current : chartColors.previous} strokeWidth={series.period === "current" ? 2 : 1.5} dot={lastPointDot(series)} activeDot={{ r: 4, fill: series.period === "current" ? chartColors.current : chartColors.previous }} isAnimationActive={false} connectNulls={false} />)}
        {/* V3-9b 收尾：去年同期線排在本期與上期之後，讓它的熱區畫在上層；兩值相近時點去年同期的點才不會被本期的熱區接走（E2E 代理回報）。 */}
        {yoy?.status === "ready" && YOY_SERIES.map(series => <Line key={series.key} dataKey={series.key} {...YOY_LINE} dot={yoyPointDot(series)} activeDot={{ r: 3, fill: chartColors.yoy }} />)}
      </LineChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
