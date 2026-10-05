"use client";

import { useMemo } from "react";

import Decimal from "decimal.js";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ASSIST_KPI_VERSION, assistKpis, type AssistKpi } from "@/application/assist-kpi";
import { eventBands as computeEventBands, type EventSet } from "@/application/events";
import { achievement, achievementText, matchTargets, mismatchText, targetDisplay, TARGET_METRICS, type TargetMetric, type TargetSet } from "@/application/targets";
import { channelLabel, demoAlias } from "@/application/copy";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { compareMoney, percentagePointChange } from "@/domain/metrics";
import { AMOUNT_FIELDS, type Metric, type MetricName, type Period, type SourceRef } from "@/domain/types";
import type { Diagnostic } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { TopThree } from "./top-three";
import { fill, labels } from "@/i18n";

type Props = { targets?: TargetSet | null; events?: EventSet | null; allChannels?: readonly string[]; snapshot: WorkspaceSnapshot; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void; periodOpen?: boolean; onPeriodToggle?: (open: boolean) => void };
const ui = labels.ui.overview;
const kpis = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const;
const nullLabel = (metric: Metric) => metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? labels.status.missing : labels.status.notApplicable;
const periodLabel = (period: "previous" | "current") => labels.periods[period];
// 「數據表 · {標題}」：labels.ui.overview.dataTable 目前帶有實作註記，先以標籤組合；標籤修正後改回 fill(ui.dataTable, { title })。
const dataTable = (title: string) => fill(labels.ui.overview.dataTable, { title });
// 「{指標} {數值}」／「{指標}：{數值}」提示列；tooltipMetric／tooltipDelta 標籤同樣帶註記，先直接組合。
const metricValue = (metric: string, value: string) => `${metric} ${value}`;
function text(name: MetricName, metric: Metric) {
  if (metric.value === null) return nullLabel(metric);
  return metricDefinitions[name].unit === "percent" ? formatRate(metric.value) : formatMoney(metric.value);
}
// Number values below are solely chart coordinates; displayed financial values
// and evidence always use the exact domain strings, never these approximations.
function coordinate(metric: Metric) { return metric.value === null ? null : Number(metric.value); }
const axis = (value: number) => new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function Overview({ snapshot, onEvidence, onCreateAction, periodOpen = false, onPeriodToggle, targets = null, events = null, allChannels }: Props) {
  const { report, weeks } = snapshot;
  // R4：目標只在期間完全相同時顯示達成率；檔期只標示，不改任何計算。
  const targetMatches = matchTargets(targets, { current_period: report.current.period, channels: report.scope.channels, allChannels: allChannels ?? report.scope.channels });
  const targetLine = (name: string, budget = false) => {
    if (!(TARGET_METRICS as readonly string[]).includes(name)) return null;
    const metric = name as TargetMetric;
    const match = targetMatches[metric];
    if (match.status === "none") return null;
    const actual = report.current.metrics[metric];
    const text = match.status === "matched" ? (budget ? fill(labels.targets.achievedBudget, { target: targetDisplay(match.row), rate: achievement(actual, match.row.target).display }) : achievementText(match.row, actual)) : mismatchText(match.nearest);
    const row = match.status === "matched" ? match.row : match.nearest;
    // 目標數字可追溯：抽屜列出實際與目標、公式「實際 ÷ 目標」、targets.csv 檔名與行號。
    const openTarget = () => onEvidence({ title: fill(labels.targets.evidenceTitle, { metric: metricDefinitions[metric].label }), name: metric, metric: actual, period: report.current.period, channels, sources: report.current.sources, formula: labels.targets.formula, formulaTechnical: `${labels.targets.formula}：${actual.value ?? labels.status.missing} ÷ ${row.target}`, metricVersion: ASSIST_KPI_VERSION, components: [{ label: labels.targets.actual, metric: actual }, { label: labels.targets.columns.target, metric: { value: row.target, reason_codes: [] } }], scopeLabel: fill(labels.targets.sourceLine, { file: targets?.filename ?? "targets.csv", line: row.line }) });
    return <p className={`kpi-target ${match.status}`} data-testid={`kpi-target-${name}`}><button className="number-link" onClick={openTarget}>{text}</button></p>;
  };
  const { previous: previousSummary, current: currentSummary } = report;
  const assist = useMemo(() => ({ previous: assistKpis(previousSummary), current: assistKpis(currentSummary) }), [previousSummary, currentSummary]);
  const channels = report.scope.channels;
  const alias = demoAlias(report.dataset_id);
  const open = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], title?: string, selectedChannels = channels) => onEvidence({ name, metric, period, sources, channels: selectedChannels, title: title ?? metricDefinitions[name].label });
  const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
  const sourcesBoth = [...report.previous.sources, ...report.current.sources];
  const changes = AMOUNT_FIELDS.map(name => ({ name: metricDefinitions[name].label, field: name, value: coordinate(report.bridge.components[name]), metric: report.bridge.components[name] }));
  const bridgeFormula = AMOUNT_FIELDS.map(name => `${metricDefinitions[name].label}${labels.csvSuffix.change}`).join(" − ");
  // 趨勢圖 x 軸用週序號（數值軸，避免上期／本期同月同日的刻度撞名），檔期區帶用 events.ts 的分數位置（週 i 的點在 x＝i，區帶以 ±0.5 置中）。
  const eventBands = computeEventBands(events, weeks).map(band => ({ event: band.event, x1: band.from - 0.5, x2: band.to - 0.5 }));
  const trend = weeks.map((week, index) => ({ ...week, index, tick: week.start.slice(5).replace("-", "/"), revenue: coordinate(week.metrics.net_revenue), contribution: coordinate(week.metrics.contribution_after_marketing) }));
  // `channel` 維持原始通路代碼（證據與 key 用）；`label` 只供圖軸與提示顯示。
  const comparisons = Object.entries(report.current.channels).map(([channel, summary]) => ({ channel, label: channelLabel(channel, alias), previous: coordinate(report.previous.channels[channel].metrics.contribution_after_marketing), current: coordinate(summary.metrics.contribution_after_marketing) }));
  const number = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], selectedChannels = channels) => <button className="number-link" onClick={() => open(name, metric, period, sources, undefined, selectedChannels)}>{text(name, metric)}</button>;
  const periodTotalLabel = (period: "previous" | "current") => `${periodLabel(period)}${labels.sections.total}`;
  const dailyAverageLabel = (period: "previous" | "current") => fill(ui.dailyAverageTitle, { period: periodLabel(period), metric: "" });

  return <>
    <div className="section-heading compact"><h2>{labels.sections.kpis}</h2><span className="note">{ui.kpiHint}</span></div>
    <section className="kpi-grid" aria-label={labels.sections.kpis}>
      {kpis.map(name => {
        const before = report.previous.metrics[name], current = report.current.metrics[name];
        const rate = name === "contribution_margin";
        const change = rate ? percentagePointChange(before, current) : compareMoney(before, current).absolute_change;
        const growth = rate ? null : compareMoney(before, current).growth_rate;
        return <article className={`kpi-card ${name === "contribution_after_marketing" ? "featured" : ""}`} key={name} data-testid={`kpi-${name}`}>
          <h3>{metricDefinitions[name].label}</h3><div className="kpi-value">{number(name, current, report.current.period, report.current.sources)}</div>
          <p className="kpi-previous">{labels.periods.previous} {number(name, before, report.previous.period, report.previous.sources)}</p>
          {targetLine(name)}
          <div className={`kpi-change ${change.value?.startsWith("-") ? "negative" : "positive"}`}>
            {change.value === null ? <span>{ui.changePending}</span> : <button className="number-link" onClick={() => onEvidence({ title: fill(ui.changeTitle, { metric: metricDefinitions[name].label }), unitOverride: rate ? "percentage-point" : undefined, name: rate ? "contribution_margin" : name, metric: change, period: periodBoth, channels, sources: sourcesBoth, formula: rate ? ui.ratePointFormula : ui.amountDeltaFormula, scopeLabel: rate ? ui.ratePointScope : ui.amountDeltaScope, components: rate ? undefined : [{ label: labels.periods.previous, metric: before }, { label: labels.periods.current, metric: current }] })}>{rate ? fill(ui.percentagePoints, { value: new Decimal(change.value).toFixed(2) }) : formatSignedMoney(change.value)}</button>}
            {!rate && growth?.value !== null && growth?.value !== undefined && <span className="change-rate">{formatRate(growth.value)}</span>}
          </div>
        </article>;
      })}
    </section>

    <section className="assist-row" aria-label={labels.sections.assistKpis} data-testid="assist-kpis">
      <div className="section-heading compact"><h2>{labels.sections.assistKpis}</h2><span className="note">{labels.assist.intro}</span></div>
      <div className="assist-grid">{assist.current.map((kpi, index) => {
        const previous = assist.previous[index];
        const open = (item: AssistKpi, period: Period) => () => onEvidence({ title: item.label, name: item.metric ?? "net_revenue", metric: { value: item.value, reason_codes: item.reason_codes }, period, channels, sources: item.sources, formula: item.formula, formulaTechnical: item.formulaTechnical, metricVersion: item.metric ? undefined : ASSIST_KPI_VERSION, nullDisplay: item.status === "not_applicable" ? labels.assist.notApplicable : undefined, unitOverride: item.unit === "count" ? "count" : item.unit === "money_per_unit" ? "money_per_unit" : undefined });
        return <article className={`assist-card ${kpi.status}`} key={kpi.id} data-testid={`assist-${kpi.id}`} title={kpi.plain}>
          <h3>{kpi.label}</h3>
          <div className="assist-value"><button className="number-link" onClick={open(kpi, report.current.period)}>{kpi.display}</button></div>
          <p className="kpi-previous">{labels.periods.previous} <button className="number-link" onClick={open(previous, report.previous.period)}>{previous.display}</button></p>
          {kpi.id === "marketing_burden" && targetLine("ad_spend", true)}
        </article>;
      })}</div>
    </section>

    <TopThree snapshot={snapshot} onEvidence={onEvidence} onCreateAction={onCreateAction} events={events} />

    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="section-heading"><div><p className="eyebrow">TREND</p><h2 id="trend-title">{labels.sections.trend}</h2></div><div className="chart-legend"><span><i className="legend-dot teal" />{metricDefinitions.net_revenue.label}</span><span><i className="legend-dot navy" />{metricDefinitions.contribution_after_marketing.label}</span></div></div>
      <p className="note">{ui.trendNote}</p>
      {eventBands.length > 0 && <p className="note" data-testid="trend-events">{fill(labels.events.trendList, { list: eventBands.map(band => fill(labels.events.trendItem, { label: band.event.label, start: band.event.start, end: band.event.end })).join(labels.events.joiner) })}</p>}
      <div className="chart-frame" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 270 }}><LineChart data={trend} margin={{ top: 18, right: 20, bottom: 10, left: 10 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" /><XAxis dataKey="index" type="number" domain={[-0.5, Math.max(trend.length - 0.5, 0.5)]} ticks={trend.map(row => row.index)} tickFormatter={(value: number) => trend[value]?.tick ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} minTickGap={26} /><YAxis tickFormatter={axis} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} width={50} />
        <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof trend[number] | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.start} — {row.end}</strong><p>{periodLabel(row.period)}</p><p>{metricValue(metricDefinitions.net_revenue.shortLabel, formatMoney(row.metrics.net_revenue.value))}</p><p>{metricValue(metricDefinitions.contribution_after_marketing.shortLabel, formatMoney(row.metrics.contribution_after_marketing.value))}</p></div> : null; }} />
        {eventBands.map(band => <ReferenceArea key={`${band.event.line}-${band.x1}`} x1={band.x1} x2={band.x2} ifOverflow="visible" fill="var(--chart-band)" fillOpacity={1} stroke="var(--border-default)" strokeOpacity={1} label={{ value: band.event.label, position: "insideTop", fontSize: 12, fill: "var(--text-secondary)" }} />)}
        <Line dataKey="revenue" stroke="var(--chart-current)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--bg-surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="contribution" stroke="var(--chart-total)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--bg-surface)", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
      </LineChart></ResponsiveContainer></div>
      <details className="data-alternative"><summary>{dataTable(labels.sections.trend)}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={ui.trendTableAria}><table><caption>{ui.trendCaption}</caption><thead><tr><th>{ui.colPeriod}</th><th>{ui.colRange}</th>{(["net_revenue", "gross_profit", "contribution_after_marketing"] as const).map(name => <th key={name}>{metricDefinitions[name].label}</th>)}</tr></thead><tbody>{weeks.map(week => <tr key={`${week.period}-${week.start}`}><td>{periodLabel(week.period)}</td><td>{week.start} — {week.end}</td>{(["net_revenue", "gross_profit", "contribution_after_marketing"] as const).map(name => <td key={name}>{number(name, week.metrics[name], { start: week.start, end: week.end }, week.sources)}</td>)}</tr>)}</tbody></table></div><p className="note">圖形為近似比例，數據表保留精確金額。</p></details>
    </section>

    <div className="analysis-grid">
      <section className="panel" aria-labelledby="bridge-title"><div className="section-heading"><div><p className="eyebrow">CONTRIBUTION BRIDGE</p><h2 id="bridge-title">{labels.sections.bridge}</h2></div><span className={`tag ${report.bridge.reconciled ? "valid" : "partial"}`}>{report.bridge.reconciled ? ui.bridgeReconciled : labels.status.missing}</span></div>
        <div className="bridge-summary"><div><small>{labels.periods.previous}</small>{number("contribution_after_marketing", report.previous.metrics.contribution_after_marketing, report.previous.period, report.previous.sources)}</div><span>→</span><div><small>{labels.periods.current}</small>{number("contribution_after_marketing", report.current.metrics.contribution_after_marketing, report.current.period, report.current.sources)}</div></div>
        <div className="bridge-total">{ui.bridgeTotal} <button className={`number-link ${report.bridge.sum.value?.startsWith("-") ? "negative" : "positive"}`} onClick={() => onEvidence({ title: `${metricDefinitions.contribution_after_marketing.label}${ui.bridgeTotal}`, name: "contribution_after_marketing", metric: report.bridge.sum, period: periodBoth, channels, sources: sourcesBoth, formula: bridgeFormula, components: changes.map(row => ({ label: metricDefinitions[row.field].label, metric: row.metric })) })}>{report.bridge.sum.value === null ? labels.status.missing : formatSignedMoney(report.bridge.sum.value)}</button></div>
        <div className="chart-frame bridge-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 500, height: 300 }}><BarChart data={changes} layout="vertical" margin={{ top: 0, right: 14, left: 0, bottom: 0 }} accessibilityLayer={false}><CartesianGrid horizontal={false} stroke="var(--chart-grid)" /><XAxis type="number" tickFormatter={axis} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} /><YAxis type="category" dataKey="name" width={106} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} /><ReferenceLine x={0} stroke="var(--border-strong)" /><Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof changes[number] | undefined; return active && row ? <div className="chart-tooltip">{row.name}：{row.metric.value === null ? labels.status.missing : formatSignedMoney(row.metric.value)}</div> : null; }} /><Bar dataKey="value" barSize={12} radius={3} isAnimationActive={false}>{changes.map(row => <Cell key={row.field} fill={row.metric.value?.startsWith("-") ? "var(--chart-unfavorable)" : "var(--chart-favorable)"} />)}</Bar></BarChart></ResponsiveContainer></div>
        <p className="note">{ui.bridgeNote}</p>
        <details className="data-alternative"><summary>{dataTable(labels.sections.bridge)}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={ui.bridgeTableAria}><table><caption>{ui.bridgeCaption}</caption><thead><tr><th>{ui.colItem}</th><th>{labels.periods.previous}</th><th>{labels.periods.current}</th><th>{labels.sections.impact}</th></tr></thead><tbody>{changes.map(row => <tr key={row.field}><th>{row.name}</th><td>{number(row.field, report.previous.metrics[row.field], report.previous.period, report.previous.sources)}</td><td>{number(row.field, report.current.metrics[row.field], report.current.period, report.current.sources)}</td><td><button className="number-link" onClick={() => onEvidence({ title: fill(ui.bridgeRowTitle, { metric: row.name }), name: row.field, metric: row.metric, period: periodBoth, channels, sources: sourcesBoth, formula: row.field === "gross_sales" ? ui.amountDeltaFormula : ui.costDeltaFormula, components: [{ label: labels.periods.previous, metric: report.previous.metrics[row.field] }, { label: labels.periods.current, metric: report.current.metrics[row.field] }] })}>{row.metric.value === null ? labels.status.missing : formatSignedMoney(row.metric.value)}</button></td></tr>)}</tbody></table></div></details>
      </section>
      <section className="panel" aria-labelledby="channel-title"><div className="section-heading"><div><p className="eyebrow">CHANNEL MIX</p><h2 id="channel-title">{labels.sections.channelMix}</h2></div><span className="unit">TWD</span></div><div className="chart-legend"><span><i className="legend-dot pale" />{labels.periods.previous}</span><span><i className="legend-dot teal" />{labels.periods.current}</span></div>
        <div className="chart-frame channel-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 500, height: 250 }}><BarChart data={comparisons} margin={{ top: 20, left: 5, right: 10, bottom: 0 }} accessibilityLayer={false}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} /><YAxis axisLine={false} tickLine={false} tickFormatter={axis} width={50} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} /><ReferenceLine y={0} stroke="var(--border-strong)" /><Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof comparisons[number] | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.label}</strong><p>{metricValue(labels.periods.previous, formatMoney(report.previous.channels[row.channel].metrics.contribution_after_marketing.value))}</p><p>{metricValue(labels.periods.current, formatMoney(report.current.channels[row.channel].metrics.contribution_after_marketing.value))}</p></div> : null; }} /><Bar dataKey="previous" fill="var(--chart-previous)" barSize={35} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="current" fill="var(--chart-current)" barSize={35} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        <div className="channel-summaries">{Object.entries(report.current.channels).map(([channel, row]) => <div key={channel}><span>{channelLabel(channel, alias)}</span>{number("contribution_after_marketing", row.metrics.contribution_after_marketing, report.current.period, row.sources, [channel])}<small>{metricDefinitions.contribution_margin.shortLabel} {number("contribution_margin", row.metrics.contribution_margin, report.current.period, row.sources, [channel])}</small></div>)}</div>
        <details className="data-alternative"><summary>{dataTable(labels.sections.channelMix)}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={ui.channelTableAria}><table><caption>{ui.channelCaption}</caption><thead><tr><th>{ui.colChannel}</th><th>{labels.periods.current}{metricDefinitions.net_revenue.label}</th><th>{labels.periods.previous}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.periods.current}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.periods.current}{metricDefinitions.contribution_margin.shortLabel}</th></tr></thead><tbody>{Object.entries(report.current.channels).map(([channel, row]) => <tr key={channel}><th>{channelLabel(channel, alias)}</th><td>{number("net_revenue", row.metrics.net_revenue, report.current.period, row.sources, [channel])}</td><td>{number("contribution_after_marketing", report.previous.channels[channel].metrics.contribution_after_marketing, report.previous.period, report.previous.channels[channel].sources, [channel])}</td><td>{number("contribution_after_marketing", row.metrics.contribution_after_marketing, report.current.period, row.sources, [channel])}</td><td>{number("contribution_margin", row.metrics.contribution_margin, report.current.period, row.sources, [channel])}</td></tr>)}</tbody></table></div></details>
      </section>
    </div>

    <details className="panel period-comparison" aria-labelledby="daily-average-title" data-testid="period-comparison" open={periodOpen} onToggle={event => onPeriodToggle?.(event.currentTarget.open)}>
      <summary><span className="section-title">{labels.sections.periodTotals}</span><span className="tag">{report.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays}</span></summary>
      <h2 id="daily-average-title" className="sr-only">{labels.sections.periodTotals}</h2>
      <p>{fill(ui.periodDays, { previousDays: report.comparison.previous_days, currentDays: report.comparison.current_days })}{ui.periodDaysHelp}</p>
      <p className="note">{labels.status.dataAsOf} {snapshot.data_as_of}。{ui.periodNote}</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.periodTableAria}><table><caption>{ui.periodCaption}</caption><thead><tr><th>{ui.colMetric}</th><th>{periodTotalLabel("previous")}</th><th>{periodTotalLabel("current")}</th><th>{dailyAverageLabel("previous")}</th><th>{dailyAverageLabel("current")}</th><th>{ui.colDailyDelta}</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(name => <tr key={name}>
        <th>{metricDefinitions[name].label}</th><td>{number(name, report.previous.metrics[name], report.previous.period, report.previous.sources)}</td><td>{number(name, report.current.metrics[name], report.current.period, report.current.sources)}</td>
        {(["previous", "current"] as const).map(period => {
          const summary = report[period], days = period === "previous" ? report.comparison.previous_days : report.comparison.current_days;
          const average = period === "previous" ? report.comparison.previous_daily_average[name] : report.comparison.current_daily_average[name];
          return <td key={period}><button className="number-link" onClick={() => onEvidence({ title: fill(ui.dailyAverageTitle, { period: periodLabel(period), metric: metricDefinitions[name].label }), name, metric: average, period: summary.period, channels, sources: summary.sources, formula: `${metricDefinitions[name].label}${ui.periodTotal} ÷ ${days} 天`, scopeLabel: ui.dailyAverageScope, components: [{ label: ui.periodTotal, metric: summary.metrics[name] }] })}>{average.value === null ? labels.status.missing : formatMoney(average.value)}</button></td>;
        })}
        <td><button className="number-link" onClick={() => onEvidence({ title: fill(ui.dailyAverageDeltaTitle, { metric: metricDefinitions[name].label }), name, metric: report.comparison.daily_average_changes[name], period: periodBoth, channels, sources: sourcesBoth, formula: `${periodTotalLabel("current")} ÷ ${report.comparison.current_days} 天 − ${periodTotalLabel("previous")} ÷ ${report.comparison.previous_days} 天`, scopeLabel: ui.dailyAverageDeltaScope, components: [{ label: periodTotalLabel("previous"), metric: report.previous.metrics[name] }, { label: periodTotalLabel("current"), metric: report.current.metrics[name] }] })}>{report.comparison.daily_average_changes[name].value === null ? labels.status.missing : formatSignedMoney(report.comparison.daily_average_changes[name].value)}</button></td>
      </tr>)}</tbody></table></div>
      <details className="data-alternative"><summary>{labels.sections.technicalDetails}</summary><p className="note">整月比較只接受兩個完整且已涵蓋的月份；未滿月請用等天數比較。確認沒有交易的日期仍算天數；缺資料的維持資料待補。</p><p className="note">日均差以未取分日均值相減後再取分；日均以 Decimal 計算，顯示時才取分。</p></details>
    </details>
  </>;
}
