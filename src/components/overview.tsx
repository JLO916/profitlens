"use client";

import { useState, type ReactNode } from "react";

import { ASSIST_KPI_VERSION } from "@/application/assist-kpi";
import type { EventSet } from "@/application/events";
import { achievement, achievementText, matchTargets, mismatchText, targetDisplay, TARGET_METRICS, type TargetMetric, type TargetSet } from "@/application/targets";
import { favorableDirectionOf, formatAmount, formatEmpty, formatMetric, formatSignedDelta, metricDefinitions, MINUS, type Layer } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Metric, MetricName, Period, SourceRef } from "@/domain/types";
import type { Diagnostic } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { TopThree } from "./top-three";
import { fill, labels } from "@/i18n";
import { AssistTable } from "./overview/assist-table";
import { BridgeSection } from "./overview/charts/bridge-section";
import { ChannelSection } from "./overview/charts/channel-section";
import { ProfitSection } from "./overview/charts/profit-section";
import { TrendSection } from "./overview/charts/trend-section";
import { KPI_BAND_METRICS, KpiBand, type KpiBandMetric } from "./overview/kpi-band";
import { PnlTable } from "./overview/pnl-table";
import { WeeklySnapshot } from "./overview/weekly-snapshot";

/** 週會摘要用的待辦概況（由 dashboard 從待辦工作區算出）：未完成數與置頂的前 3 項。 */
export type OverviewActionsSummary = { pending: number; pinned: { problem: string; owner: string; deadline: string }[] };
type Props = {
  targets?: TargetSet | null; events?: EventSet | null; allChannels?: readonly string[]; snapshot: WorkspaceSnapshot; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void; periodOpen?: boolean; onPeriodToggle?: (open: boolean) => void;
  // V3-4a：本期一句話（資料集名、資料待補項數、待辦概況、會議入口）、KPI 帶的 `?` 定義按鈕與「先補齊」連結。
  onBasis?: () => void; onNavigate?: (id: "diagnosis" | "meeting" | "data") => void; datasetName: string; missingItems: number; actionsSummary: OverviewActionsSummary; meetingEntry?: ReactNode;
};
const ui = labels.ui.overview;
const nullLabel = (metric: Metric) => formatEmpty(metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "notApplicable");
const periodLabel = (period: "previous" | "current") => labels.periods[period];
// V3-2b 三層（§3.3、§8.5）：KPI 與輔助指標 L1（萬／億）；期間合計與日均 L2（整數元）。圖表區塊（V3-4b）在 ./overview/charts。
function text(name: MetricName, metric: Metric, layer: Layer) {
  if (metric.value === null) return nullLabel(metric);
  return formatMetric(name, metric, layer);
}
/**
 * C18 目標細條（V3-4a；只是視覺，aria-hidden）：實際值長條寬＝達成率（targets.ts achievement 的同一個數字）夾在 0–1，目標刻度在 100%；
 * 落後（收入、毛利、貢獻低於目標；廣告費高於預算）時長條改不利色。數字本身仍是旁邊的 number-link 文字。
 */
function targetBar(metric: TargetMetric, actual: Metric, target: string): ReactNode {
  const result = achievement(actual, target);
  if (result.status !== "ok" || result.rate === null) return null;
  const ratio = Number(result.rate.replace(MINUS, "-").replace(/[%,]/g, "")) / 100;
  if (!Number.isFinite(ratio)) return null;
  const behind = favorableDirectionOf(metric) === "up" ? ratio < 1 : ratio > 1;
  const width = Math.min(Math.max(ratio, 0), 1);
  return <span className={`kpi-bullet${behind ? " is-behind" : ""}`} aria-hidden="true"><span className="kpi-bullet-bar" style={{ width: `${(width * 100).toFixed(1)}%` }} /><span className="kpi-bullet-target" /></span>;
}

export function Overview({ snapshot, onEvidence, onCreateAction, periodOpen = false, onPeriodToggle, targets = null, events = null, allChannels, onBasis, onNavigate, datasetName, missingItems, actionsSummary, meetingEntry }: Props) {
  const { report } = snapshot;
  // 進階（收合）：重新進入總覽時，若期間合計與日均原本是展開的，外層一起展開；之後各自開關。
  const [advancedOpen, setAdvancedOpen] = useState(periodOpen);
  // R4：目標只在期間完全相同時顯示達成率；檔期只標示，不改任何計算。
  const targetMatches = matchTargets(targets, { current_period: report.current.period, channels: report.scope.channels, allChannels: allChannels ?? report.scope.channels });
  const targetLine = (name: string, budget = false) => {
    if (!(TARGET_METRICS as readonly string[]).includes(name)) return null;
    const metric = name as TargetMetric;
    const match = targetMatches[metric];
    if (match.status === "none") return null;
    const actual = report.current.metrics[metric];
    const text = match.status === "matched" ? (budget ? fill(labels.targets.achievedBudget, { target: targetDisplay(match.row, "L1"), rate: achievement(actual, match.row.target).display }) : achievementText(match.row, actual, "L1")) : mismatchText(match.nearest);
    const row = match.status === "matched" ? match.row : match.nearest;
    // 目標數字可追溯：抽屜列出實際與目標、公式「實際 ÷ 目標」、targets.csv 檔名與行號。
    const openTarget = () => onEvidence({ title: fill(labels.targets.evidenceTitle, { metric: metricDefinitions[metric].label }), name: metric, metric: actual, period: report.current.period, channels, sources: report.current.sources, formula: labels.targets.formula, formulaTechnical: `${labels.targets.formula}：${actual.value ?? labels.status.missing} ÷ ${row.target}`, metricVersion: ASSIST_KPI_VERSION, components: [{ label: labels.targets.actual, metric: actual }, { label: labels.targets.columns.target, metric: { value: row.target, reason_codes: [] } }], scopeLabel: fill(labels.targets.sourceLine, { file: targets?.filename ?? "targets.csv", line: row.line }) });
    return <p className={`kpi-target ${match.status}`} data-testid={`kpi-target-${name}`}>{match.status === "matched" && targetBar(metric, actual, match.row.target)}<button className="number-link" onClick={openTarget}>{text}</button></p>;
  };
  const channels = report.scope.channels;
  const open = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], title?: string, selectedChannels = channels) => onEvidence({ name, metric, period, sources, channels: selectedChannels, title: title ?? metricDefinitions[name].label });
  const periodBoth = { start: [report.previous.period.start, report.current.period.start].sort()[0], end: [report.previous.period.end, report.current.period.end].sort()[1] };
  const sourcesBoth = [...report.previous.sources, ...report.current.sources];
  const kpiTargets: Partial<Record<KpiBandMetric, ReactNode>> = Object.fromEntries(KPI_BAND_METRICS.map(name => [name, targetLine(name)]));
  const number = (name: MetricName, metric: Metric, period: Period, sources: SourceRef[], layer: Layer, selectedChannels = channels) => <button className="number-link" onClick={() => open(name, metric, period, sources, undefined, selectedChannels)}>{text(name, metric, layer)}</button>;
  const periodTotalLabel = (period: "previous" | "current") => `${periodLabel(period)}${labels.sections.total}`;
  const dailyAverageLabel = (period: "previous" | "current") => fill(ui.dailyAverageTitle, { period: periodLabel(period), metric: "" });

  return <>
    <WeeklySnapshot snapshot={snapshot} datasetName={datasetName} missingItems={missingItems} actionsSummary={actionsSummary} allChannels={allChannels} meetingEntry={meetingEntry} />

    <KpiBand snapshot={snapshot} onEvidence={onEvidence} onBasis={onBasis} onNavigate={onNavigate} missingItems={missingItems} targets={kpiTargets} />

    <TopThree snapshot={snapshot} onEvidence={onEvidence} onCreateAction={onCreateAction} events={events} onOpenDiagnosis={onNavigate ? () => onNavigate("diagnosis") : undefined} />
    {/* V3-4b 區塊 5「貢獻變化拆解」（C17 瀑布＋橋接表＋平衡檢核）與區塊 6「本期利潤結構」（F2 四層瀑布，範圍切換只影響本圖） */}
    <BridgeSection snapshot={snapshot} onEvidence={onEvidence} />
    <ProfitSection snapshot={snapshot} onEvidence={onEvidence} allChannels={allChannels} />

    <div className="pair">
      <TrendSection snapshot={snapshot} events={events} onEvidence={onEvidence} />
      <ChannelSection snapshot={snapshot} onEvidence={onEvidence} />
    </div>

    <AssistTable snapshot={snapshot} onEvidence={onEvidence} onBasis={onBasis} budget={targetLine("ad_spend", true)} />

    <details className="advanced" data-testid="overview-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>{labels.overview.pnlV3.advancedSummary}</summary>
    <details className="panel period-comparison" aria-labelledby="daily-average-title" data-testid="period-comparison" open={periodOpen} onToggle={event => onPeriodToggle?.(event.currentTarget.open)}>
      <summary><span className="section-title">{labels.sections.periodTotals}</span><span className="tag">{report.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays}</span></summary>
      <h2 id="daily-average-title" className="sr-only">{labels.sections.periodTotals}</h2>
      <p>{fill(ui.periodDays, { previousDays: report.comparison.previous_days, currentDays: report.comparison.current_days })}{ui.periodDaysHelp}</p>
      <p className="note">{labels.status.dataAsOf} {snapshot.data_as_of}。{ui.periodNote}</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.periodTableAria}><table><caption>{ui.periodCaption}</caption><thead><tr><th>{ui.colMetric}</th><th>{periodTotalLabel("previous")}</th><th>{periodTotalLabel("current")}</th><th>{dailyAverageLabel("previous")}</th><th>{dailyAverageLabel("current")}</th><th>{ui.colDailyDelta}</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(name => <tr key={name}>
        <th>{metricDefinitions[name].label}</th><td>{number(name, report.previous.metrics[name], report.previous.period, report.previous.sources, "L2")}</td><td>{number(name, report.current.metrics[name], report.current.period, report.current.sources, "L2")}</td>
        {(["previous", "current"] as const).map(period => {
          const summary = report[period], days = period === "previous" ? report.comparison.previous_days : report.comparison.current_days;
          const average = period === "previous" ? report.comparison.previous_daily_average[name] : report.comparison.current_daily_average[name];
          return <td key={period}><button className="number-link" onClick={() => onEvidence({ title: fill(ui.dailyAverageTitle, { period: periodLabel(period), metric: metricDefinitions[name].label }), name, metric: average, period: summary.period, channels, sources: summary.sources, formula: fill(ui.dailyAverageFormula, { metric: metricDefinitions[name].label, days }), scopeLabel: ui.dailyAverageScope, components: [{ label: ui.periodTotal, metric: summary.metrics[name] }] })}>{average.value === null ? labels.status.missing : formatAmount(average.value, "L2")}</button></td>;
        })}
        <td><button className="number-link" onClick={() => onEvidence({ title: fill(ui.dailyAverageDeltaTitle, { metric: metricDefinitions[name].label }), name, metric: report.comparison.daily_average_changes[name], period: periodBoth, channels, sources: sourcesBoth, formula: fill(ui.dailyAverageDeltaFormula, { currentDays: report.comparison.current_days, previousDays: report.comparison.previous_days }), scopeLabel: ui.dailyAverageDeltaScope, components: [{ label: periodTotalLabel("previous"), metric: report.previous.metrics[name] }, { label: periodTotalLabel("current"), metric: report.current.metrics[name] }] })}>{report.comparison.daily_average_changes[name].value === null ? labels.status.missing : formatSignedDelta(report.comparison.daily_average_changes[name].value, "L2")}</button></td>
      </tr>)}</tbody></table></div>
      <details className="data-alternative"><summary>{labels.sections.technicalDetails}</summary><p className="note">{ui.periodModeTechnical}</p><p className="note">{ui.periodRoundingTechnical}</p></details>
    </details>
    {/* V3-9a F9（D-V3-19＝A）：每日／每週管理損益表，放在期間合計與日均之後；預設收合、內容掛載。 */}
    <PnlTable snapshot={snapshot} onEvidence={onEvidence} />
    </details>
  </>;
}
