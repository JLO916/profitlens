"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { track } from "@/application/analytics";
import { CUMULATIVE_DAILY_MAX_DAYS, CUMULATIVE_DAILY_VERSION, cumulativeConclusion, cumulativeDaily, cumulativeSources, type CumulativeDaily, type CumulativePeriod, type CumulativeSeries } from "@/application/chart-cumulative";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { formatAmountL1, formatDateL1, formatEmpty, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataColumn } from "../../charts/chart-data-table";
import type { EvidenceSelection } from "../../evidence-drawer";
import { ChartFrame, coordinate, type ChartLegendItem } from "./chart-frame";
import { trendAxis } from "./trend-section";

// V4-10 代理 A：G8 兩期每日累計線（PRD §4.1–§4.7 G8、§7.4；CHART_CATALOG G8；D-V4-22＝A），放在總覽進階 <details data-testid="overview-advanced"> 內、管理損益表之後。
// 資料：cumulativeDaily(snapshot, "contribution_after_marketing")（cumulative-daily-v1）。Recharts LineChart（首載已有）：本期 chartColors.current 2px、上期 chartColors.previous 1.5px；
// X「第 n 天」（兩期依第幾天對齊）、Y 整數萬含 0（trend-section 的 trendAxis → formatAxisWan）；任一日 null 之後斷線（connectNulls={false}），斷開的那一天標「無資料」；
// 目標只在 matchTargets matched 時畫一條水平線（chartColors.target；呼叫端給值與既有的目標抽屜），不畫等速目標線（屬預測，D-V4-22＝A）；兩條線尾標累計值（L1）。
// 點的透明熱區（circle.chart-point-hit，不可聚焦）與資料表的累計格呼叫同一個 builder（cumulativeEvidence：valueKind level、metricVersion cumulative-daily-v1、組成是累加的日、篩到該日）；
// 當日格開該日（cumulativeDayEvidence：值取自 domain，維持 contribution-v1，arrangeVersion cumulative-daily-v1）。鍵盤經資料表（C33）。
// 進階區預設收合：瀏覽器在第一次展開進階區之前只放同高的 loading 骨架、資料表只留 summary（同 V4-4 的延後渲染；收合時 Recharts 量不到寬，也不讓總覽載入時多畫 84 個點與一張表）；
// 伺服器與單元測試（沒有 window）直接渲染全部，SSR markup 照常有區塊與資料表（M1）。投影中整個進階區隱藏（globals.css 投影白名單）。

const copy = labels.overview.chartsV4.cumulative;
const frameCopy = labels.overview.chartFrame;
export const CUMULATIVE_TESTID = "chart-overview-cumulative";
export const CUMULATIVE_TABLE_TESTID = `${CUMULATIVE_TESTID}-table`;
/** 總覽的 G8 指標（PRD §4.2：扣廣告後貢獻）。 */
export const CUMULATIVE_METRIC = "contribution_after_marketing" as const;
/** 點的熱區半徑（不可聚焦，鍵盤經資料表）與本期最後一點的實心圓點半徑（同趨勢圖）；線尾標值相對最後一點的位移（左上；兩條線同一天結束時較低的那條改放下方）。 */
const HIT_R = 6;
const LAST_R = 3;
const LABEL_DX = 6;
const LABEL_RISE = 8;
const LABEL_DROP = 16;
/** X 軸刻度間隔（第 1、8、15…天，與每週趨勢同一組 7 天）。 */
const TICK_DAYS = 7;

/** 目標（只在 matchTargets matched 時給）：值（到分字串）與既有的目標抽屜（與 KPI 帶的目標 number-link 同一個 evidence）。 */
export interface CumulativeTarget { value: string; evidence: EvidenceSelection }
export interface CumulativeSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  target?: CumulativeTarget | null;
  /** 進階區是否展開過（瀏覽器在展開之前只放骨架）；伺服器端一律渲染全部。 */
  drawn?: boolean;
}

const periodName = (period: CumulativePeriod) => labels.shell.periods[period];
const metricLabel = (result: Pick<CumulativeDaily, "metric">) => metricDefinitions[result.metric].label;

/**
 * 累計（圖上的點與資料表的累計格同一個 builder；CHART_CATALOG G8 抽屜）：第 1 天到第 day 天的累計，水準值（valueKind level，抽屜大數字不帶「+」）、
 * metricVersion cumulative-daily-v1、組成是累加的每一天、來源是那些天的來源聯集、篩到該日（filter.date，可在抽屜清除）。標題、定義、算式由證據自帶。
 */
export function cumulativeEvidence(snapshot: Pick<WorkspaceSnapshot, "report" | "data_as_of">, result: CumulativeDaily, series: CumulativeSeries, day: number): EvidenceSelection {
  const point = series.points[day - 1];
  const metric = metricLabel(result), period = periodName(series.period);
  const date = (iso: string) => formatDateL1(iso, { anchor: snapshot.data_as_of });
  return {
    title: fill(copy.evidence.title, { period, metric, n: day, date: date(point.date) }),
    name: result.metric, metric: point.cumulative, period: { start: series.range.start, end: point.date }, channels: snapshot.report.scope.channels, sources: cumulativeSources(series, day),
    formula: fill(copy.evidence.formula, { period, n: day, metric }),
    components: series.points.slice(0, day).map(item => ({ label: fill(copy.evidence.component, { n: item.day, date: date(item.date) }), metric: item.daily })),
    valueKind: "level", metricVersion: CUMULATIVE_DAILY_VERSION,
    definition: fill(copy.evidence.definition, { period, n: day, metric }), formulaTechnical: copy.evidence.formulaTechnical,
    filter: { date: point.date },
  };
}
/** 當日格：值直接取自 domain（contribution-v1，不給 metricVersion），arrangeVersion cumulative-daily-v1；標題沿用管理損益表的「{指標} · {日期}」；篩到該日。 */
export function cumulativeDayEvidence(snapshot: Pick<WorkspaceSnapshot, "report" | "data_as_of">, result: CumulativeDaily, series: CumulativeSeries, day: number): EvidenceSelection {
  const point = series.points[day - 1];
  return {
    title: fill(labels.overview.pnlV3.evidenceTitle, { metric: metricLabel(result), date: formatDateL1(point.date, { anchor: snapshot.data_as_of }) }),
    name: result.metric, metric: point.daily, period: { start: point.date, end: point.date }, channels: snapshot.report.scope.channels, sources: point.sources,
    arrangeVersion: CUMULATIVE_DAILY_VERSION, filter: { date: point.date },
  };
}

/** 資料表的一列：一期的一天。 */
export interface CumulativeTableRow { series: CumulativeSeries; day: number }
type ColumnKey = "date" | "daily" | "cumulative" | "target";
/** 資料表的列（上期在前、本期在後，各自從第 1 天起；列數＝兩期天數和）。 */
export const cumulativeTableRows = (result: CumulativeDaily): CumulativeTableRow[] => [result.previous, result.current].flatMap(series => series.points.map(point => ({ series, day: point.day })));
export const cumulativeRowLabel = (row: CumulativeTableRow) => fill(copy.rowLabel, { period: periodName(row.series.period), n: row.day });
/** 圖的列：第 1 到 max(兩期天數) 天，兩期各自的累計座標（沒有那一天或累計為 null 時 null，斷線）。 */
export function cumulativeChartRows(result: CumulativeDaily): { day: number; previous: number | null; current: number | null }[] {
  const length = Math.max(result.previous.points.length, result.current.points.length);
  const at = (series: CumulativeSeries, index: number) => { const point = series.points[index]; return point === undefined ? null : coordinate(point.cumulative); };
  return Array.from({ length }, (_, index) => ({ day: index + 1, previous: at(result.previous, index), current: at(result.current, index) }));
}

export function CumulativeSection({ snapshot, onEvidence, target = null, drawn = false }: CumulativeSectionProps) {
  // 伺服器與單元測試沒有 window：直接渲染全部（同 useDeferredMount 的作法）。
  const [server] = useState(() => typeof window === "undefined");
  const shown = drawn || server;
  // V4-10 收尾（390 TBT）：進階區沒展開過時不算兩期每日累計（periodDailyMetrics 逐日重算），載入示範資料的主執行緒不多花這段；收合時只放等高骨架。
  const result = useMemo(() => shown ? cumulativeDaily(snapshot, CUMULATIVE_METRIC) : null, [snapshot, shown]);
  const legend: ChartLegendItem[] = [
    { key: "current", label: frameCopy.legend.current, color: chartColors.current },
    { key: "previous", label: frameCopy.legend.previous, color: chartColors.previous },
    ...(target ? [{ key: "target", label: copy.columns.target, color: chartColors.target, shape: "tick" as const }] : []),
  ];
  const tableTitle = copy.tableTitle;
  const summary = fill(labels.overview.page.dataTable, { title: tableTitle });
  if (!result) return <ChartFrame id="cumulative" page="overview" title={tableTitle} subtitle={fill(copy.subtitle, { metric: metricLabel({ metric: CUMULATIVE_METRIC }) })} legend={legend} height="sm" state="loading" dataTable={{ summary, content: null }} />;
  const { title, subtitle } = cumulativeConclusion(result, snapshot);

  if (!result.drawable) {
    const message = fill(copy.tooLong, { n: CUMULATIVE_DAILY_MAX_DAYS });
    return <ChartFrame id="cumulative" page="overview" title={title} subtitle={subtitle} height="sm" state="empty" message={message} dataTable={{ summary, content: <p className="note">{message}</p> }} />;
  }

  const columns: ChartDataColumn<ColumnKey>[] = [
    { key: "date", label: copy.columns.date, unit: "date", data: "date" },
    { key: "daily", label: fill(labels.format.units.yuanColumn, { label: copy.columns.daily }), unit: "money", layer: "L3", data: "daily" },
    { key: "cumulative", label: fill(labels.format.units.yuanColumn, { label: copy.columns.cumulative }), unit: "money", layer: "L3", data: "cumulative" },
    ...(target ? [{ key: "target", label: fill(labels.format.units.yuanColumn, { label: copy.columns.target }), unit: "money" as const, layer: "L3" as const, data: "target" as const }] : []),
  ];
  const pointOf = (row: CumulativeTableRow) => row.series.points[row.day - 1];
  const dataTable = chartDataTable<CumulativeTableRow, ColumnKey>({
    title: tableTitle, testId: CUMULATIVE_TABLE_TESTID, caption: fill(copy.caption, { metric: metricLabel(result) }), rowHeaderLabel: copy.columns.day,
    rows: cumulativeTableRows(result), rowKey: row => `${row.series.period}-${row.day}`, rowHeader: row => ({ label: cumulativeRowLabel(row) }), columns,
    valueOf: (row, column) => {
      const point = pointOf(row);
      switch (column.data) {
        case "date": return { value: point.date };
        case "daily": return { value: point.daily.value, reasonCodes: point.daily.reason_codes };
        case "cumulative": return { value: point.cumulative.value, reasonCodes: point.cumulative.reason_codes };
        case "target": return row.series.period === "current" && target ? { value: target.value } : { value: null, emptyText: formatEmpty("notApplicable") };
      }
    },
    hasEvidence: (row, column) => column.data === "daily" || column.data === "cumulative" || (column.data === "target" && row.series.period === "current"),
    evidenceOf: (row, column) => column.data === "cumulative" ? cumulativeEvidence(snapshot, result, row.series, row.day)
      : column.data === "daily" ? cumulativeDayEvidence(snapshot, result, row.series, row.day)
        : column.data === "target" && row.series.period === "current" && target ? target.evidence : null,
    cellAria: (row, column, text) => fill(copy.cellAria, { row: cumulativeRowLabel(row), column: column.label, value: text }),
    onEvidence, notes: [copy.missingNote],
  });

  // 圖：兩期依第幾天對齊；Y 軸涵蓋兩條線與目標線（trendAxis：含 0、整齊步長、formatAxisWan）。
  const rows = cumulativeChartRows(result);
  const targetY = target ? Number(target.value) : null;
  const yAxis = trendAxis([...rows.flatMap(row => [row.previous, row.current]), targetY]);
  const yTickText = new Map(yAxis.ticks.map((tick, index) => [tick, yAxis.labels[index]]));
  const lastDay = Math.max(rows.length, 1);
  const xTicks = rows.filter(row => (row.day - 1) % TICK_DAYS === 0).map(row => row.day);
  const openPoint = (series: CumulativeSeries, day: number) => { track("chart_clicked"); onEvidence(cumulativeEvidence(snapshot, result, series, day)); };
  /** 每一天有累計值的點：透明熱區（不可聚焦）；末日（累計有值時）另畫線尾標值（本期再加 3px 實心點）。斷線的期間不標線尾值（末日累計資料待補，標題已寫）。 */
  const pointDot = (series: CumulativeSeries) => function CumulativePoint(props: DotItemDotProps): ReactNode {
    const point = series.points[props.index];
    if (point === undefined || props.cx === undefined || props.cy === undefined || props.value === null || props.value === undefined || point.cumulative.value === null) return null;
    const cx = Number(props.cx), cy = Number(props.cy);
    const hit = <circle key={`${series.period}-hit-${point.date}`} className="chart-point-hit" data-series={series.period} data-date={point.date} cx={cx} cy={cy} r={HIT_R} fill="transparent" onClick={() => openPoint(series, point.day)} />;
    if (point.day !== series.points.length) return hit;
    const other = series.period === "current" ? result.previous : result.current;
    // 兩條線同一天結束、另一條的末值較高時，標值改放點的下方（避免兩個標值疊在一起）。
    const otherEnd = other.points.length === series.points.length ? other.end?.value ?? null : null;
    const below = otherEnd !== null && Number(otherEnd) > Number(point.cumulative.value);
    const current = series.period === "current";
    return <g key={`${series.period}-last`}>
      {current && <circle cx={cx} cy={cy} r={LAST_R} fill={chartColors.current} />}
      {hit}
      <text className={`chart-value${current ? " is-strong" : ""}`} x={cx - LABEL_DX} y={below ? cy + LABEL_DROP : cy - LABEL_RISE} textAnchor="end">{fill(copy.endLabel, { period: periodName(series.period), value: formatAmountL1(point.cumulative.value) })}</text>
    </g>;
  };
  const breaks = [result.previous, result.current].flatMap(series => series.breakDay === null ? [] : [{ period: series.period, day: series.breakDay }]).filter((item, index, list) => list.findIndex(other => other.day === item.day) === index);

  return <ChartFrame id="cumulative" page="overview" title={title} subtitle={subtitle} legend={legend} height="sm" dataTable={dataTable}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.sm }}>
      <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey="day" type="number" domain={[0.5, lastDay + 0.5]} ticks={xTicks} tickFormatter={(value: number) => fill(copy.axisDay, { n: value })} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} minTickGap={16} />
        <YAxis domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={(value: number) => yTickText.get(value) ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} width={56} />
        <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as { day: number } | undefined; if (!active || !row) return null; const value = (series: CumulativeSeries) => { const point = series.points[row.day - 1]; return point === undefined ? null : fill(copy.endLabel, { period: periodName(series.period), value: formatAmountL1(point.cumulative.value) }); }; return <div className="chart-tooltip"><strong>{fill(copy.axisDay, { n: row.day })}</strong>{[result.current, result.previous].map(series => { const text = value(series); return text === null ? null : <p key={series.period}>{text}</p>; })}</div>; }} />
        {breaks.map(item => <ReferenceLine key={`missing-${item.period}`} x={item.day} stroke={chartColors.grid} strokeDasharray="2 4" label={{ value: frameCopy.noData, position: "insideBottom", fontSize: chartFontSize, fill: chartColors.axis }} />)}
        {targetY !== null && <ReferenceLine y={targetY} stroke={chartColors.target} strokeWidth={2} />}
        <Line dataKey="previous" stroke={chartColors.previous} strokeWidth={1.5} dot={pointDot(result.previous)} activeDot={false} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="current" stroke={chartColors.current} strokeWidth={2} dot={pointDot(result.current)} activeDot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
