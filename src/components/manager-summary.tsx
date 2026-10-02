"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, priorityEvidence, summaryDecisionState, withSummaryScenarioSelection, type ManagerSummary as SummaryData, type SummaryDecisionContext, type SummaryEvidence } from "@/application/manager-summary";
import { channelLabel, channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { downloadText } from "@/application/download";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ChannelWideTable } from "./channel-table";
import styles from "./manager-summary.module.css";

const copy = labels.ui.managerSummary;

export interface ManagerSummaryProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  decisionContext?: SummaryDecisionContext;
  onCreateAction?: (diagnostic: Diagnostic) => void;
  reviewControls?: { importanceThreshold: string; onThresholdChange: (value: string) => void };
  selectionManaged?: boolean;
}

const comparisonModeLabel = (mode: SummaryData["scope"]["comparison_mode"]) => mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
const periodValues = (summary: SummaryData) => ({ prevStart: summary.scope.previous_period.start, prevEnd: summary.scope.previous_period.end, prevDays: summary.previous_days, curStart: summary.scope.current_period.start, curEnd: summary.scope.current_period.end, curDays: summary.current_days, mode: comparisonModeLabel(summary.scope.comparison_mode) });

export function ManagerSummary({ snapshot, onEvidence, decisionContext, onCreateAction, reviewControls, selectionManaged = false }: ManagerSummaryProps) {
  const [thresholdInput, setThresholdInput] = useState(reviewControls?.importanceThreshold ?? "0.00");
  const [threshold, setThreshold] = useState("0.00");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const appliedThreshold = reviewControls?.importanceThreshold ?? threshold;
  const summary = useMemo(() => buildManagerSummary(snapshot, { importanceThreshold: appliedThreshold }), [snapshot, appliedThreshold]);
  const alias = demoAlias(summary.dataset_id);
  const effectiveContext = selectionManaged ? decisionContext : withSummaryScenarioSelection(decisionContext, selected);
  const decisions = summaryDecisionState(summary, effectiveContext);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? labels.status.missing : signed ? formatSignedMoney(evidence.metric.value) : formatMoney(evidence.metric.value)}</button>;
  useEffect(() => {
    if (!printing) return;
    const stop = () => setPrinting(false);
    window.addEventListener("afterprint", stop);
    window.print();
    return () => window.removeEventListener("afterprint", stop);
  }, [printing]);

  return <section className={`panel ${styles.summary}`} data-testid="manager-summary" aria-labelledby="manager-summary-title">
    <div className="section-heading"><div><h2 id="manager-summary-title">{copy.title}</h2></div><span className="tag">{decisionContext?.decisionState ?? copy.draftDecision}</span></div>
    <p className={styles.context}>{fill(copy.context, { asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p>
    <p className="note">{fill(copy.periodLine, periodValues(summary))}</p>
    <div className={styles.headlines}>{summary.headlines.map(row => <div key={row.metric}><h3>{metricDefinitions[row.metric].label}</h3><p className={styles.change}>{amount(row.evidence.change, true)}</p><p className="note">{amount(row.evidence.previous)} → {amount(row.evidence.current)}</p></div>)}</div>
    <p className="note">{copy.headlineNote}</p>
    <div className={styles.priorityHeader}><h3>{labels.sections.topThree}</h3><form className={styles.threshold} onSubmit={event => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); reviewControls?.onThresholdChange(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.notes.thresholdInvalid); } }}><label>{labels.meeting.threshold}<input aria-describedby="manager-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">{labels.buttons.apply}</button></form></div>
    <p className="note" id="manager-threshold-help">{fill(labels.notes.thresholdHelp, { amount: formatMoney(summary.importance_threshold) })}</p>
    {error && <p role="alert">{error}</p>}
    {summary.priorities.length ? <ol className={styles.priorities}>{summary.priorities.map(item => { const rule = ruleCopy(snapshot, item.primary, alias); return <li key={item.code} data-testid={`manager-priority-${item.code}`}><div className={styles.priorityTitle}><h4>{rule.headline}</h4>{amount(item.evidence, true)}</div><p className="note">{scopeLabel(item.primary.scope, alias)} · {item.code === "MISSING_CRITICAL_DATA" ? copy.missingDataNote : copy.rankingNote}</p><p>{rule.nextStep}</p>{item.members.length > 1 && <details><summary>{fill(copy.relatedScopes, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{scopeLabel(member.scope, alias)}：{amount(priorityEvidence(snapshot, member), true)}</li>)}</ul><p className="note">{labels.notes.scopesNotAdditive}</p></details>}{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</li>; })}</ol> : <p role="status">{labels.notes.noPriorities}</p>}
    <p className="note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    <details className={styles.wideTable} open><summary>{copy.channelTableSummary}</summary><ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} /></details>
    <div className={styles.decisions}><h3>{copy.decisionsHeading}</h3>{!selectionManaged && decisions.scenarios.length > 0 && <label>{copy.selectedScenario}<select aria-label={copy.selectedScenario} value={decisions.selected?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="">{copy.noneSelected}</option>{decisions.scenarios.map(plan => <option key={plan.id} value={plan.id} disabled={plan.status !== "current"}>{fill(copy.scenarioOption, { name: plan.name, statusOrScope: plan.status === "current" ? plan.scopeLabel : plan.status === "stale" ? copy.scenarioStale : labels.meeting.decisions.draft })}</option>)}</select></label>}{decisions.selectedScenarios.length ? <>{decisions.selectedScenarios.map(plan => <div key={plan.id}><p>{fill(copy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatMoney(plan.baseline ?? null), contribution: formatMoney(plan.contribution ?? null), delta: formatSignedMoney(plan.delta ?? null) })}</p><details><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details></div>)}<p className="note">{copy.scenarioNote}</p></> : <p className="note">{copy.noScenario}</p>}{decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p className="note">{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}</div>
    {decisions.appendixActions.length > 0 && <details><summary>{fill(copy.appendixActions, { n: decisions.appendixActions.length })}</summary><ActionSummaryList actions={decisions.appendixActions} /></details>}
    <details><summary>{labels.sections.technicalDetails}</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    <div className={styles.controls}><button type="button" className="button quiet" onClick={() => downloadText(exportManagerSummaryMarkdown(summary, effectiveContext), "profitlens-manager-summary.md", "text/markdown;charset=utf-8")}>{labels.buttons.exportMarkdown}</button><button type="button" className="button quiet" onClick={() => downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button><button type="button" className="button quiet" onClick={() => setPrinting(true)}>{labels.buttons.print}</button>{printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>{copy.exitPrint}</button>}</div>
    <p className="note">{reviewControls ? copy.persistNoteManaged : copy.persistNoteLocal}</p>
    {printing && createPortal(<PrintSummary summary={summary} decisionContext={effectiveContext} snapshot={snapshot} />, document.body)}
  </section>;
}

function PrintSummary({ summary, decisionContext, snapshot }: { summary: SummaryData; decisionContext?: SummaryDecisionContext; snapshot?: Pick<WorkspaceSnapshot, "report"> }) {
  const decisions = summaryDecisionState(summary, decisionContext);
  const alias = demoAlias(summary.dataset_id);
  const signedOrMissing = (value: string | null) => value === null ? labels.status.missing : formatSignedMoney(value);
  const priorityCopy = (item: SummaryData["priorities"][number]) => snapshot ? ruleCopy(snapshot, item.primary, alias) : { headline: item.title, nextStep: item.recommendation };
  return <article className={styles.printSurface} data-testid="manager-summary-print"><header><h1>{copy.printTitle}</h1><p>{fill(copy.printContext, { state: decisionContext?.decisionState ?? copy.draftDecision, asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p><p>{fill(copy.printPeriodLine, periodValues(summary))}</p></header><div className={styles.printHeadlines}>{summary.headlines.map(row => <p key={row.metric}><strong>{metricDefinitions[row.metric].label}</strong><br />{fill(copy.printHeadline, { prev: formatMoney(row.previous.value), cur: formatMoney(row.current.value), change: signedOrMissing(row.change.value) })}</p>)}</div><h2>{labels.sections.topThree}</h2><p>{fill(copy.printThresholdLine, { amount: formatMoney(summary.importance_threshold) })}</p><ol>{summary.priorities.map(item => { const rule = priorityCopy(item); return <li key={item.code}><strong>{rule.headline}</strong>｜{scopeLabel(item.primary.scope, alias)}｜{signedOrMissing(item.ranking_amount.value)}<p>{rule.nextStep}</p></li>; })}</ol>{!summary.priorities.length && <p>{labels.notes.noPriorities}</p>}<table><caption>{fill(copy.printChannelCaption, { metric: metricDefinitions.contribution_after_marketing.label })}</caption><thead><tr><th>{copy.channelColumn}</th><th>{labels.periods.previous}</th><th>{labels.periods.current}</th><th>{copy.changeColumn}</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th>{channelLabel(row.channel, alias)}</th><td>{formatMoney(row.contribution.previous.value)}</td><td>{formatMoney(row.contribution.current.value)}</td><td>{signedOrMissing(row.contribution.change.value)}</td></tr>)}</tbody></table><h2>{copy.printDecisionsHeading}</h2>{decisions.selectedScenarios.length ? decisions.selectedScenarios.map(plan => <div key={plan.id}><p>{fill(copy.printScenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatMoney(plan.baseline ?? null), contribution: formatMoney(plan.contribution ?? null), delta: formatSignedMoney(plan.delta ?? null) })}</p><p>{plan.assumptions.join("；")}</p></div>) : <p>{copy.noScenario}</p>}{decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p>{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}{decisionContext?.reviewName && <p>{fill(copy.printMeetingLine, { name: decisionContext.reviewName, state: decisionContext.decisionState, notes: decisionContext.notes })}</p>}{decisions.appendixActions.length > 0 && <section><h2>{copy.appendixHeading}</h2><ActionSummaryList actions={decisions.appendixActions} /></section>}<footer><p>{labels.basis.footer}</p></footer></article>;
}

function ActionSummaryList({ actions }: { actions: ReturnType<typeof summaryDecisionState>["actions"] }) {
  return <ul>{actions.map(action => <li key={action.id}><strong>{action.problem}</strong> · {action.status === "stale" ? labels.actions.staleBadge : action.status === "current" ? copy.actionConfirmed : copy.actionDraft} · {action.scopeLabel}<p>{action.action}</p><p>{fill(copy.actionMeta, { owner: action.owner || copy.ownerPending, deadline: action.deadline || copy.duePending, risk: action.risk || copy.riskPending })}</p>{action.executionStatus && <p>{fill(copy.actionExecution, { status: action.executionStatus, notes: action.executionNotes })}</p>}</li>)}</ul>;
}
