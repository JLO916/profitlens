"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { trendTakeaways } from "@/application/chart-takeaways";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { eventBands as computeEventBands, type EventSet } from "@/application/events";
import { formatAmountL1, metricDefinitions, type Layer } from "@/application/presentation";
import type { PeriodWeeklyRow, WeeklyRow, WorkspaceSnapshot, YoyWeeklyRow } from "@/application/workspace";
import type { Metric, MetricName, Period, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { ChartFrame, coordinate, metricText, type ChartLegendItem, type ChartTakeaway } from "./chart-frame";

// V3-4b 區塊 7 每週淨營收與扣廣告後貢獻（C16，PRD §7.1 第 7 點、§9.5）。
// 標題用標準名稱，副標是週的分組說明；takeaway 列「淨營收期間合計」「最近完整週淨營收」（chart-takeaways.ts）；
// 折線：本期 --chart-current 2px、上期 --chart-previous 1.5px，只在最後一點畫 3px 圓點並直接標值；缺資料的週斷線並標「無資料」；檔期區帶沿用 events.ts。
// V3-9b F8（PRD §10.1 F8、§9.5）：第三線「去年同期」--chart-yoy 1.5px 虛線、不畫圓點，去年同期第 i 週對齊本期第 i 週；不可用時圖例項保留並標「無資料」，圖下方寫原因（trend-yoy-note）。
// V3-9b F10：每一週的點都可點（透明熱區），開該週該指標的抽屜並篩到該週；鍵盤經由資料表的同一個抽屜（weekEvidence）。

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

// 圖軸刻度只是座標（Recharts 給的整齊數字），用 L1 尺度（萬／億、U+2212）顯示；金額本身一律來自 domain 字串。
const axis = (value: number) => Number.isFinite(value) ? formatAmountL1(String(value)) : "";
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
  const missingWeeks = rows.filter(row => row.metrics.net_revenue.value === null);
  // 去年同期某週淨營收缺值（本週自己有值）：斷線並在該週標「去年同期無資料」。
  const missingYoy = rows.filter(row => row.yoy !== null && row.yoy.metrics.net_revenue.value === null && row.metrics.net_revenue.value !== null);
  /** V3-9b F10：每一週的點的透明熱區（8px），點了開該週該指標的抽屜；圖本身 aria-hidden，熱區不可聚焦（鍵盤經由資料表）。data-series／data-start 標出系列與該週起日。 */
  const pointHit = (props: DotItemDotProps, row: WeeklyRow | null, name: MetricName, series: SeriesKey | YoySeriesKey): ReactNode => {
    if (row === null || props.cx === undefined || props.cy === undefined || props.value === null || props.value === undefined) return null;
    return <circle key={`${series}-hit-${props.index}`} className="chart-point-hit" data-series={series} data-start={row.start} cx={Number(props.cx)} cy={Number(props.cy)} r={8} fill="transparent" onClick={() => openWeek(name, row)} />;
  };
  /** 最後一點：本期畫 3px 圓點並標「{指標} {L1}」；上期只標「上期 {L1}」；最後一週未滿 7 天時本期淨營收下方加「未滿 7 天」。 */
  const lastPointDot = (series: typeof SERIES[number]) => function LastPoint(props: DotItemDotProps): ReactNode {
    const hit = pointHit(props, rows[props.index] ?? null, series.metric, series.key);
    if (props.index !== last[series.key] || props.cx === undefined || props.cy === undefined) return hit;
    const row = rows[props.index];
    const value = formatAmountL1(row.metrics[series.metric].value);
    const current = series.period === "current";
    const text = current ? fill(copy.lastPoint, { metric: metricDefinitions[series.metric].shortLabel, value }) : fill(copy.previousPoint, { value });
    const cx = Number(props.cx), cy = Number(props.cy);
    return <g key={`${series.key}-last`}>
      {current && <circle cx={cx} cy={cy} r={3} fill={chartColors.current} />}
      {hit}
      <text className={`chart-value${current ? " is-strong" : ""}`} x={cx - 6} y={cy - 8} textAnchor="end">{text}</text>
      {current && series.metric === "net_revenue" && takeaway.lastWeekIncomplete && <text className="chart-value" x={cx - 6} y={cy + 18} textAnchor="end">{copy.incompleteShort}</text>}
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
        <YAxis tickFormatter={axis} tickCount={4} niceTicks="snap125" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} width={56} />
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
