"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { trendTakeaways } from "@/application/chart-takeaways";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { eventBands as computeEventBands, type EventSet } from "@/application/events";
import { formatAmountL1, metricDefinitions, type Layer } from "@/application/presentation";
import type { WeeklyRow, WorkspaceSnapshot } from "@/application/workspace";
import type { Metric, MetricName, Period, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { ChartFrame, coordinate, metricText, type ChartLegendItem, type ChartTakeaway } from "./chart-frame";

// V3-4b 區塊 7 每週淨營收與扣廣告後貢獻（C16，PRD §7.1 第 7 點、§9.5）。
// 標題用標準名稱，副標是週的分組說明；takeaway 列「淨營收期間合計」「最近完整週淨營收」（chart-takeaways.ts）；
// 折線：本期 --chart-current 2px、上期 --chart-previous 1.5px，只在最後一點畫 3px 圓點並直接標值；缺資料的週斷線並標「無資料」；檔期區帶沿用 events.ts。

const ui = labels.ui.overview;
const copy = labels.overview.trendV3;
const frame = labels.overview.chartFrame;
const TABLE_METRICS = ["net_revenue", "gross_profit", "contribution_after_marketing"] as const;
/** 四條線：淨營收與扣廣告後貢獻 × 本期與上期；上期與本期各自只在自己的週有值（x 軸是 snapshot.weeks 的順序）。 */
const SERIES = [
  { key: "revenuePrevious", metric: "net_revenue", period: "previous" },
  { key: "contributionPrevious", metric: "contribution_after_marketing", period: "previous" },
  { key: "revenueCurrent", metric: "net_revenue", period: "current" },
  { key: "contributionCurrent", metric: "contribution_after_marketing", period: "current" },
] as const;
type SeriesKey = typeof SERIES[number]["key"];
type TrendRow = WeeklyRow & { index: number; tick: string } & Record<SeriesKey, number | null>;

// 圖軸刻度只是座標（Recharts 給的整齊數字），用 L1 尺度（萬／億、U+2212）顯示；金額本身一律來自 domain 字串。
const axis = (value: number) => Number.isFinite(value) ? formatAmountL1(String(value)) : "";
// 「{指標} {數值}」提示列（與 v2 tooltip 相同的組合）。
const metricValue = (metric: string, value: string) => `${metric} ${value}`;

export interface TrendSectionProps {
  snapshot: WorkspaceSnapshot;
  events?: EventSet | null;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/** 趨勢圖的列：每週一列，系列值只在對應期間的週有值，其他週為 null（connectNulls=false 會斷開兩期）。 */
export function trendRows(weeks: readonly WeeklyRow[]): TrendRow[] {
  return weeks.map((week, index) => ({
    ...week, index, tick: week.start.slice(5).replace("-", "/"),
    ...Object.fromEntries(SERIES.map(series => [series.key, week.period === series.period ? coordinate(week.metrics[series.metric]) : null])) as Record<SeriesKey, number | null>,
  }));
}

/** 各系列最後一個有值的點（只在這一點畫圓點與直接標值）；整條沒有值時為 -1。 */
export function lastPoints(rows: readonly TrendRow[]): Record<SeriesKey, number> {
  return Object.fromEntries(SERIES.map(series => [series.key, rows.reduce((last, row) => row[series.key] === null ? last : row.index, -1)])) as Record<SeriesKey, number>;
}

export function TrendSection({ snapshot, events = null, onEvidence }: TrendSectionProps) {
  const { report, weeks } = snapshot;
  const channels = report.scope.channels;
  const open = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[]) => onEvidence({ name, metric, period, sources, channels, title: metricDefinitions[name].label });
  const number = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], layer: Layer) => <button className="number-link" onClick={() => open(name, metric, period, sources)}>{metricText(name, metric, layer)}</button>;
  const takeaway = trendTakeaways(snapshot);
  const week = takeaway.lastCompleteWeek.week;
  const takeaways: ChartTakeaway[] = [
    { key: "total", label: takeaway.total.label, value: <button type="button" className="number-link" aria-label={fill(copy.takeawayAria, { label: takeaway.total.label, value: takeaway.total.display })} onClick={() => open("net_revenue", takeaway.total.metric, report.current.period, report.current.sources)}>{takeaway.total.display}</button> },
    {
      key: "last-complete-week", label: takeaway.lastCompleteWeek.label, note: takeaway.lastCompleteWeek.range,
      value: week === null ? <span className="takeaway-empty">{takeaway.lastCompleteWeek.display}</span>
        : <button type="button" className="number-link" aria-label={fill(copy.takeawayAria, { label: takeaway.lastCompleteWeek.label, value: takeaway.lastCompleteWeek.display })} onClick={() => open("net_revenue", week.metrics.net_revenue, { start: week.start, end: week.end }, week.sources)}>{takeaway.lastCompleteWeek.display}</button>,
    },
  ];
  const legend: ChartLegendItem[] = [{ key: "current", label: frame.legend.current, color: chartColors.current }, { key: "previous", label: frame.legend.previous, color: chartColors.previous }];

  // 趨勢圖 x 軸用週序號（數值軸，避免上期／本期同月同日的刻度撞名），檔期區帶用 events.ts 的分數位置（週 i 的點在 x＝i，區帶以 ±0.5 置中）。
  const bands = computeEventBands(events, weeks).map(band => ({ event: band.event, x1: band.from - 0.5, x2: band.to - 0.5 }));
  const rows = trendRows(weeks);
  const last = lastPoints(rows);
  const missingWeeks = rows.filter(row => row.metrics.net_revenue.value === null);
  /** 最後一點：本期畫 3px 圓點並標「{指標} {L1}」；上期只標「上期 {L1}」；最後一週未滿 7 天時本期淨營收下方加「未滿 7 天」。 */
  const lastPointDot = (series: typeof SERIES[number]) => function LastPoint(props: DotItemDotProps): ReactNode {
    if (props.index !== last[series.key] || props.cx === undefined || props.cy === undefined) return null;
    const row = rows[props.index];
    const value = formatAmountL1(row.metrics[series.metric].value);
    const current = series.period === "current";
    const text = current ? fill(copy.lastPoint, { metric: metricDefinitions[series.metric].shortLabel, value }) : fill(copy.previousPoint, { value });
    const cx = Number(props.cx), cy = Number(props.cy);
    return <g key={`${series.key}-last`}>
      {current && <circle cx={cx} cy={cy} r={3} fill={chartColors.current} />}
      <text className={`chart-value${current ? " is-strong" : ""}`} x={cx - 6} y={cy - 8} textAnchor="end">{text}</text>
      {current && series.metric === "net_revenue" && takeaway.lastWeekIncomplete && <text className="chart-value" x={cx - 6} y={cy + 18} textAnchor="end">{copy.incompleteShort}</text>}
    </g>;
  };

  const after = <>
    {takeaway.incompleteNote !== null && <p className="note">{takeaway.incompleteNote}</p>}
    {bands.length > 0 && <p className="note" data-testid="trend-events">{fill(labels.events.trendList, { list: bands.map(band => fill(labels.events.trendItem, { label: band.event.label, start: band.event.start, end: band.event.end })).join(labels.events.joiner) })}</p>}
  </>;
  const table = <><div className="table-scroll" tabIndex={0} role="region" aria-label={ui.trendTableAria}><table><caption>{fill(ui.captionWithUnit, { caption: ui.trendCaption })}</caption><thead><tr><th>{ui.colPeriod}</th><th>{ui.colRange}</th>{TABLE_METRICS.map(name => <th key={name}>{metricDefinitions[name].label}</th>)}</tr></thead><tbody>{weeks.map(row => <tr key={`${row.period}-${row.start}`}><td>{labels.periods[row.period]}</td><td>{row.start} — {row.end}</td>{TABLE_METRICS.map(name => <td key={name}>{number(name, row.metrics[name], { start: row.start, end: row.end }, row.sources, "L2")}</td>)}</tr>)}</tbody></table></div><p className="note">{ui.trendTechnical}</p></>;

  return <ChartFrame id="trend" testId="trend" title={labels.sections.trend} subtitle={takeaway.subtitle} legend={legend} takeaways={takeaways} height="sm" state={weeks.length === 0 ? "empty" : "ready"} after={after}
    dataTable={{ summary: fill(ui.dataTable, { title: labels.sections.trend }), content: table }}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.sm }}>
      <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey="index" type="number" domain={[-0.5, Math.max(rows.length - 0.5, 0.5)]} ticks={rows.map(row => row.index)} tickFormatter={(value: number) => rows[value]?.tick ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} minTickGap={26} />
        <YAxis tickFormatter={axis} tickCount={4} niceTicks="snap125" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} width={56} />
        <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as TrendRow | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.start} — {row.end}</strong><p>{labels.periods[row.period]}</p><p>{metricValue(metricDefinitions.net_revenue.shortLabel, metricText("net_revenue", row.metrics.net_revenue, "L1"))}</p><p>{metricValue(metricDefinitions.contribution_after_marketing.shortLabel, metricText("contribution_after_marketing", row.metrics.contribution_after_marketing, "L1"))}</p></div> : null; }} />
        {bands.map(band => <ReferenceArea key={`${band.event.line}-${band.x1}`} x1={band.x1} x2={band.x2} ifOverflow="visible" fill={chartColors.band} fillOpacity={1} strokeOpacity={0} label={{ value: band.event.label, position: "insideTop", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {missingWeeks.map(row => <ReferenceLine key={`missing-${row.index}`} x={row.index} stroke={chartColors.grid} strokeDasharray="2 4" label={{ value: frame.noData, position: "insideBottom", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {SERIES.map(series => <Line key={series.key} dataKey={series.key} stroke={series.period === "current" ? chartColors.current : chartColors.previous} strokeWidth={series.period === "current" ? 2 : 1.5} dot={lastPointDot(series)} activeDot={{ r: 4, fill: series.period === "current" ? chartColors.current : chartColors.previous }} isAnimationActive={false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
