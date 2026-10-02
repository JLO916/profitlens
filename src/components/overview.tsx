"use client";

import Decimal from "decimal.js";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { compareMoney, percentagePointChange } from "@/domain/metrics";
import { AMOUNT_FIELDS, type Metric, type MetricName, type Period, type SourceRef } from "@/domain/types";
import type { Diagnostic } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { TopThree } from "./top-three";
import { labels } from "@/i18n";

type Props = { snapshot: WorkspaceSnapshot; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void; periodOpen?: boolean; onPeriodToggle?: (open: boolean) => void };
const kpis = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const;
const nullLabel = (metric: Metric) => metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? "資料待補" : "不適用";
function text(name: MetricName, metric: Metric) {
  if (metric.value === null) return nullLabel(metric);
  return metricDefinitions[name].unit === "percent" ? formatRate(metric.value) : formatMoney(metric.value);
}
// Number values below are solely chart coordinates; displayed financial values
// and evidence always use the exact domain strings, never these approximations.
function coordinate(metric: Metric) { return metric.value === null ? null : Number(metric.value); }
const axis = (value: number) => new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function Overview({ snapshot, onEvidence, onCreateAction, periodOpen = false, onPeriodToggle }: Props) {
  const { report, weeks } = snapshot;
  const channels = report.scope.channels;
  const open = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], title?: string, selectedChannels = channels) => onEvidence({ name, metric, period, sources, channels: selectedChannels, title: title ?? metricDefinitions[name].label });
  const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
  const sourcesBoth = [...report.previous.sources, ...report.current.sources];
  const changes = AMOUNT_FIELDS.map(name => ({ name: metricDefinitions[name].label, field: name, value: coordinate(report.bridge.components[name]), metric: report.bridge.components[name] }));
  const trend = weeks.map(week => ({ ...week, tick: week.start.slice(5).replace("-", "/"), revenue: coordinate(week.metrics.net_revenue), contribution: coordinate(week.metrics.contribution_after_marketing) }));
  const comparisons = Object.entries(report.current.channels).map(([channel, summary]) => ({ channel, previous: coordinate(report.previous.channels[channel].metrics.contribution_after_marketing), current: coordinate(summary.metrics.contribution_after_marketing) }));
  const number = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], selectedChannels = channels) => <button className="number-link" onClick={() => open(name, metric, period, sources, undefined, selectedChannels)}>{text(name, metric)}</button>;

  return <>
    <div className="section-heading compact"><h2>核心營運指標</h2><span className="note">未稅 TWD · 點擊數字查看公式與來源 ↗</span></div>
    <section className="kpi-grid" aria-label={labels.sections.kpis}>
      {kpis.map(name => {
        const before = report.previous.metrics[name], current = report.current.metrics[name];
        const rate = name === "contribution_margin";
        const change = rate ? percentagePointChange(before, current) : compareMoney(before, current).absolute_change;
        const growth = rate ? null : compareMoney(before, current).growth_rate;
        return <article className={`kpi-card ${name === "contribution_after_marketing" ? "featured" : ""}`} key={name} data-testid={`kpi-${name}`}>
          <h3>{metricDefinitions[name].label}</h3><div className="kpi-value">{number(name, current, report.current.period, report.current.sources)}</div>
          <p className="kpi-previous">前期 {number(name, before, report.previous.period, report.previous.sources)}</p>
          <div className={`kpi-change ${change.value?.startsWith("-") ? "negative" : "positive"}`}>
            {change.value === null ? <span>差異待確認</span> : <button className="number-link" onClick={() => onEvidence({ title: `${metricDefinitions[name].label}變化`, unitOverride: rate ? "percentage-point" : undefined, name: rate ? "contribution_margin" : name, metric: change, period: periodBoth, channels, sources: sourcesBoth, formula: rate ? "（本期貢獻率 − 前期貢獻率）× 100，單位為百分點" : "本期金額 − 前期金額", scopeLabel: rate ? "百分點變化（精確值見下方）" : "兩期完整通路金額差異", components: rate ? undefined : [{ label: "前期", metric: before }, { label: "本期", metric: current }] })}>{rate ? `${new Decimal(change.value).toFixed(2)} 百分點` : formatSignedMoney(change.value)}</button>}
            {!rate && growth?.value !== null && growth?.value !== undefined && <span className="change-rate">{formatRate(growth.value)}</span>}
          </div>
        </article>;
      })}
    </section>

    <TopThree snapshot={snapshot} onEvidence={onEvidence} onCreateAction={onCreateAction} />

    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="section-heading"><div><p className="eyebrow">TREND</p><h2 id="trend-title">每週營收與貢獻</h2></div><div className="chart-legend"><span><i className="legend-dot teal" />商品淨營收</span><span><i className="legend-dot navy" />行銷後貢獻</span></div></div>
      <p className="note">各期從起日每 7 天彙總，期末不足 7 天單獨列示；缺漏不畫成零值。圖形為近似比例，數據表保留精確金額。</p>
      <div className="chart-frame" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 270 }}><LineChart data={trend} margin={{ top: 18, right: 20, bottom: 10, left: 10 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke="#e8eded" strokeDasharray="3 4" /><XAxis dataKey="tick" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#687878" }} minTickGap={26} /><YAxis tickFormatter={axis} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#687878" }} width={50} />
        <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof trend[number] | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.start} — {row.end}</strong><p>{row.period === "previous" ? "前期" : "本期"}</p><p>商品淨營收 {formatMoney(row.metrics.net_revenue.value)}</p><p>行銷後貢獻 {formatMoney(row.metrics.contribution_after_marketing.value)}</p></div> : null; }} />
        <Line dataKey="revenue" stroke="#198b7b" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="contribution" stroke="#283f54" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
      </LineChart></ResponsiveContainer></div>
      <details className="data-alternative"><summary>數據表 · 每週營收與貢獻</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="週趨勢數據"><table><caption>目前期間及通路的每週精確金額</caption><thead><tr><th>期間</th><th>起訖日</th><th>商品淨營收</th><th>商品毛利</th><th>行銷後貢獻</th></tr></thead><tbody>{weeks.map(week => <tr key={`${week.period}-${week.start}`}><td>{week.period === "previous" ? "前期" : "本期"}</td><td>{week.start} — {week.end}</td>{(["net_revenue", "gross_profit", "contribution_after_marketing"] as const).map(name => <td key={name}>{number(name, week.metrics[name], { start: week.start, end: week.end }, week.sources)}</td>)}</tr>)}</tbody></table></div></details>
    </section>

    <div className="analysis-grid">
      <section className="panel" aria-labelledby="bridge-title"><div className="section-heading"><div><p className="eyebrow">CONTRIBUTION BRIDGE</p><h2 id="bridge-title">貢獻變化拆解</h2></div><span className={`tag ${report.bridge.reconciled ? "valid" : "partial"}`}>{report.bridge.reconciled ? "精確對帳" : "資料待補"}</span></div>
        <div className="bridge-summary"><div><small>前期</small>{number("contribution_after_marketing", report.previous.metrics.contribution_after_marketing, report.previous.period, report.previous.sources)}</div><span>→</span><div><small>本期</small>{number("contribution_after_marketing", report.current.metrics.contribution_after_marketing, report.current.period, report.current.sources)}</div></div>
        <div className="bridge-total">總差異 <button className={`number-link ${report.bridge.sum.value?.startsWith("-") ? "negative" : "positive"}`} onClick={() => onEvidence({ title: "行銷後貢獻總差異", name: "contribution_after_marketing", metric: report.bridge.sum, period: periodBoth, channels, sources: sourcesBoth, formula: "Δ營收 − Δ折扣 − Δ退款 − Δ成本 − Δ平台費 − Δ金流費 − Δ履約費 − Δ其他變動費 − Δ廣告費", components: changes.map(row => ({ label: metricDefinitions[row.field].label, metric: row.metric })) })}>{report.bridge.sum.value === null ? "資料待補" : formatSignedMoney(report.bridge.sum.value)}</button></div>
        <div className="chart-frame bridge-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 500, height: 300 }}><BarChart data={changes} layout="vertical" margin={{ top: 0, right: 14, left: 0, bottom: 0 }} accessibilityLayer={false}><CartesianGrid horizontal={false} stroke="#e8eded" /><XAxis type="number" tickFormatter={axis} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" width={106} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#536866" }} /><ReferenceLine x={0} stroke="#afbfbb" /><Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof changes[number] | undefined; return active && row ? <div className="chart-tooltip">{row.name}：{row.metric.value === null ? "資料待補" : formatSignedMoney(row.metric.value)}</div> : null; }} /><Bar dataKey="value" barSize={12} radius={3} isAnimationActive={false}>{changes.map(row => <Cell key={row.field} fill={row.metric.value?.startsWith("-") ? "#c97658" : "#248e7e"} />)}</Bar></BarChart></ResponsiveContainer></div>
        <p className="note">已觀察的金額差異，不代表因果或可直接取得的改善收益。</p>
        <details className="data-alternative"><summary>數據表 · 九項精確橋接</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="金額橋接數據"><table><caption>正值增加貢獻，負值減少貢獻；單位 TWD</caption><thead><tr><th>項目</th><th>前期</th><th>本期</th><th>對貢獻的金額差</th></tr></thead><tbody>{changes.map(row => <tr key={row.field}><th>{row.name}</th><td>{number(row.field, report.previous.metrics[row.field], report.previous.period, report.previous.sources)}</td><td>{number(row.field, report.current.metrics[row.field], report.current.period, report.current.sources)}</td><td><button className="number-link" onClick={() => onEvidence({ title: `${row.name}橋接差額`, name: row.field, metric: row.metric, period: periodBoth, channels, sources: sourcesBoth, formula: row.field === "gross_sales" ? "本期金額 − 前期金額" : "前期金額 − 本期金額（費用增加會減少貢獻）", components: [{ label: "前期", metric: report.previous.metrics[row.field] }, { label: "本期", metric: report.current.metrics[row.field] }] })}>{row.metric.value === null ? "資料待補" : formatSignedMoney(row.metric.value)}</button></td></tr>)}</tbody></table></div></details>
      </section>
      <section className="panel" aria-labelledby="channel-title"><div className="section-heading"><div><p className="eyebrow">CHANNEL MIX</p><h2 id="channel-title">通路貢獻比較</h2></div><span className="unit">TWD</span></div><div className="chart-legend"><span><i className="legend-dot pale" />前期</span><span><i className="legend-dot teal" />本期</span></div>
        <div className="chart-frame channel-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 500, height: 250 }}><BarChart data={comparisons} margin={{ top: 20, left: 5, right: 10, bottom: 0 }} accessibilityLayer={false}><CartesianGrid vertical={false} stroke="#e8eded" /><XAxis dataKey="channel" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={axis} width={50} tick={{ fontSize: 11 }} /><ReferenceLine y={0} stroke="#9bafaa" /><Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof comparisons[number] | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.channel}</strong><p>前期 {formatMoney(report.previous.channels[row.channel].metrics.contribution_after_marketing.value)}</p><p>本期 {formatMoney(report.current.channels[row.channel].metrics.contribution_after_marketing.value)}</p></div> : null; }} /><Bar dataKey="previous" fill="#c9ded9" barSize={35} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="current" fill="#248e7e" barSize={35} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        <div className="channel-summaries">{Object.entries(report.current.channels).map(([channel, row]) => <div key={channel}><span>{channel}</span>{number("contribution_after_marketing", row.metrics.contribution_after_marketing, report.current.period, row.sources, [channel])}<small>貢獻率 {number("contribution_margin", row.metrics.contribution_margin, report.current.period, row.sources, [channel])}</small></div>)}</div>
        <details className="data-alternative"><summary>數據表 · 通路比較</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="通路比較數據"><table><caption>通路層級的完整 SKU 集合；沒有廣告分攤</caption><thead><tr><th>通路</th><th>本期商品淨營收</th><th>前期貢獻</th><th>本期貢獻</th><th>本期貢獻率</th></tr></thead><tbody>{Object.entries(report.current.channels).map(([channel, row]) => <tr key={channel}><th>{channel}</th><td>{number("net_revenue", row.metrics.net_revenue, report.current.period, row.sources, [channel])}</td><td>{number("contribution_after_marketing", report.previous.channels[channel].metrics.contribution_after_marketing, report.previous.period, report.previous.channels[channel].sources, [channel])}</td><td>{number("contribution_after_marketing", row.metrics.contribution_after_marketing, report.current.period, row.sources, [channel])}</td><td>{number("contribution_margin", row.metrics.contribution_margin, report.current.period, row.sources, [channel])}</td></tr>)}</tbody></table></div></details>
      </section>
    </div>

    <details className="panel period-comparison" aria-labelledby="daily-average-title" data-testid="period-comparison" open={periodOpen} onToggle={event => onPeriodToggle?.(event.currentTarget.open)}>
      <summary><span className="section-title">期間合計與日均值</span><span className="tag">{report.comparison.mode === "calendar_months" ? "完整自然月" : "相同天數"}</span></summary>
      <h2 id="daily-average-title" className="sr-only">期間合計與日均值</h2>
      <p>前期 {report.comparison.previous_days} 天；本期 {report.comparison.current_days} 天。上方 KPI、診斷與金額橋接使用實際期間合計。日均值另以各期完整日曆天數相除；未截掉月份天數，不是營收預測。</p>
      <p className="note">資料截至 {snapshot.data_as_of}。完整自然月只接受兩個各自完整且已涵蓋的月份；未滿月請使用相同天數模式，明確選擇已入帳範圍。已確認無活動的日期仍計入天數；缺漏保持未知。</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="期間合計與日均值數據"><table><caption>金額 TWD；日均 TWD／日，顯示至分。日均差使用未取分值計算後再取分。</caption><thead><tr><th>指標</th><th>前期合計</th><th>本期合計</th><th>前期日均</th><th>本期日均</th><th>日均差</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(name => <tr key={name}>
        <th>{metricDefinitions[name].label}</th><td>{number(name, report.previous.metrics[name], report.previous.period, report.previous.sources)}</td><td>{number(name, report.current.metrics[name], report.current.period, report.current.sources)}</td>
        {(["previous", "current"] as const).map(period => {
          const summary = report[period], days = period === "previous" ? report.comparison.previous_days : report.comparison.current_days;
          const average = period === "previous" ? report.comparison.previous_daily_average[name] : report.comparison.current_daily_average[name];
          return <td key={period}><button className="number-link" onClick={() => onEvidence({ title: `${period === "previous" ? "前期" : "本期"}${metricDefinitions[name].label}日均值`, name, metric: average, period: summary.period, channels, sources: summary.sources, formula: `${metricDefinitions[name].label}期間合計 ÷ ${days} 個日曆天；Decimal 計算至顯示才取分`, scopeLabel: "日均值（TWD／日），與期間合計分開呈現", components: [{ label: "期間合計", metric: summary.metrics[name] }] })}>{average.value === null ? "資料待補" : formatMoney(average.value)}</button></td>;
        })}
        <td><button className="number-link" onClick={() => onEvidence({ title: `${metricDefinitions[name].label}日均差`, name, metric: report.comparison.daily_average_changes[name], period: periodBoth, channels, sources: sourcesBoth, formula: `本期合計 ÷ ${report.comparison.current_days} 天 − 前期合計 ÷ ${report.comparison.previous_days} 天；以未取分日均值相減後取分`, scopeLabel: "兩期日均金額差，非橋接差額或預測", components: [{ label: "前期合計", metric: report.previous.metrics[name] }, { label: "本期合計", metric: report.current.metrics[name] }] })}>{report.comparison.daily_average_changes[name].value === null ? "資料待補" : formatSignedMoney(report.comparison.daily_average_changes[name].value)}</button></td>
      </tr>)}</tbody></table></div>
    </details>
  </>;
}
