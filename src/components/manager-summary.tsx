"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, priorityEvidence, summaryDecisionState, withSummaryScenarioSelection, type ManagerSummary as SummaryData, type SummaryDecisionContext, type SummaryEvidence } from "@/application/manager-summary";
import { channelLabel, channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { downloadText } from "@/application/download";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ChannelWideTable } from "./channel-table";
import { ImpactAmount } from "./top-three";
import styles from "./manager-summary.module.css";

const copy = labels.ui.managerSummary;

export interface ManagerSummaryProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  decisionContext?: SummaryDecisionContext;
  onCreateAction?: (diagnostic: Diagnostic) => void;
  reviewControls?: { importanceThreshold: string; onThresholdChange: (value: string) => void };
  selectionManaged?: boolean;
  /** R3：含稅換算一句併入口徑說明與 Markdown。 */
  conversion?: TaxConversion | null;
  /** R4：目標達成小節。 */
  targets?: { set: TargetSet | null; allChannels: readonly string[] } | null;
  /** R6-2：false 時不顯示匯出列（會議紀錄頁另有「輸出」區）。預設 true。 */
  outputs?: boolean;
  /** R6-2：在會議紀錄頁以議程 ①②③ 標示關鍵差額、三件事與通路表；channelSummary 取代通路表收合標題（避免與 ③ 重複）。 */
  agenda?: { kpis: string; priorities: string; channels: string; channelSummary?: string };
  /** R6-3：列印頁首的會議名稱與日期。 */
  meeting?: PrintMeeting | null;
  /** R6-2：false 時不顯示「方案與待辦」與其他待辦附錄（會議紀錄頁改在議程 ⑤⑥ 列出）。預設 true。 */
  decisions?: boolean;
}
export interface PrintMeeting { name: string; date: string }
/** 列印第一頁的備註上限（字元數，以 code point 計）；超過時截斷，全文放附錄。 */
export const PRINT_NOTES_LIMIT = 200;

const comparisonModeLabel = (mode: SummaryData["scope"]["comparison_mode"]) => mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
const periodValues = (summary: SummaryData) => ({ prevStart: summary.scope.previous_period.start, prevEnd: summary.scope.previous_period.end, prevDays: summary.previous_days, curStart: summary.scope.current_period.start, curEnd: summary.scope.current_period.end, curDays: summary.current_days, mode: comparisonModeLabel(summary.scope.comparison_mode) });

export function ManagerSummary({ snapshot, onEvidence, decisionContext, onCreateAction, reviewControls, selectionManaged = false, conversion = null, targets = null, outputs = true, agenda, meeting = null, decisions: showDecisions = true }: ManagerSummaryProps) {
  const [thresholdInput, setThresholdInput] = useState(reviewControls?.importanceThreshold ?? "0.00");
  const [threshold, setThreshold] = useState("0.00");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const appliedThreshold = reviewControls?.importanceThreshold ?? threshold;
  const summary = useMemo(() => buildManagerSummary(snapshot, { importanceThreshold: appliedThreshold, conversion, targets: targets ?? undefined }), [snapshot, appliedThreshold, conversion, targets]);
  const alias = demoAlias(summary.dataset_id);
  const effectiveContext = selectionManaged ? decisionContext : withSummaryScenarioSelection(decisionContext, selected);
  const decisions = summaryDecisionState(summary, effectiveContext);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? labels.status.missing : signed ? formatSignedMoney(evidence.metric.value) : formatMoney(evidence.metric.value)}</button>;
  // 議程模式下「① 兩個關鍵差額」是 h3，指標名降一級。
  const MetricHeading = agenda ? "h4" : "h3";
  return <section className={`panel ${styles.summary}`} data-testid="manager-summary" aria-labelledby="manager-summary-title">
    <div className="section-heading"><div><h2 id="manager-summary-title">{copy.title}</h2></div><span className="tag">{decisionContext?.decisionState ?? copy.draftDecision}</span></div>
    <p className={styles.context}>{fill(copy.context, { asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p>
    <p className="note">{fill(copy.periodLine, periodValues(summary))}</p>
    {agenda && <h3 className={styles.agendaStep} data-testid="meeting-agenda-1">{agenda.kpis}</h3>}
    <div className={styles.headlines}>{summary.headlines.map(row => <div key={row.metric}><MetricHeading>{metricDefinitions[row.metric].label}</MetricHeading><p className={styles.change}>{amount(row.evidence.change, true)}</p><p className="note">{amount(row.evidence.previous)} → {amount(row.evidence.current)}</p></div>)}</div>
    <p className="note">{copy.headlineNote}</p>
    <div className={styles.priorityHeader}><h3 data-testid={agenda ? "meeting-agenda-2" : undefined}>{agenda?.priorities ?? labels.sections.topThree}</h3><form className={styles.threshold} data-testid={agenda ? "threshold-form-meeting" : undefined} onSubmit={event => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); reviewControls?.onThresholdChange(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.notes.thresholdInvalid); } }}><label>{labels.meeting.threshold}<input aria-describedby="manager-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">{labels.buttons.apply}</button></form></div>
    <p className="note" id="manager-threshold-help">{fill(labels.diagnosisList.thresholdHelp, { amount: formatMoney(summary.importance_threshold) })}</p>
    {error && <p role="alert">{error}</p>}
    {summary.priorities.length ? <ol className={styles.priorities}>{summary.priorities.map(item => { const rule = ruleCopy(snapshot, item.primary, alias); return <li key={item.code} data-testid={`manager-priority-${item.code}`}><div className={styles.priorityTitle}><h4>{rule.headline}</h4></div><p className="top-three-impact"><span>{labels.sections.impact}</span>{item.code === "MISSING_CRITICAL_DATA" ? amount(item.evidence, true) : <ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} />}</p><p className="note">{scopeLabel(item.primary.scope, alias)} · {item.code === "MISSING_CRITICAL_DATA" ? copy.missingDataNote : copy.rankingNote}</p><p>{rule.nextStep}</p>{item.members.length > 1 && <details><summary>{fill(copy.relatedScopes, { n: item.members.length - 1 })}</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{scopeLabel(member.scope, alias)}：{item.code === "MISSING_CRITICAL_DATA" ? amount(priorityEvidence(snapshot, member), true) : <ImpactAmount snapshot={snapshot} diagnostic={member} onEvidence={onEvidence} />}</li>)}</ul><p className="note">{labels.notes.scopesNotAdditive}</p></details>}{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>{labels.buttons.addToActions}</button>}</li>; })}</ol> : <p role="status">{labels.notes.noPriorities}</p>}
    <p className="note">{fill(labels.notes.omittedGroups, { n: summary.omitted_group_count })}</p>
    {agenda && <h3 className={styles.agendaStep} data-testid="meeting-agenda-3">{agenda.channels}</h3>}
    <details className={styles.wideTable} open><summary>{agenda?.channelSummary ?? copy.channelTableSummary}</summary><ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} /></details>
    {showDecisions && <><div className={styles.decisions}><h3>{copy.decisionsHeading}</h3>{!selectionManaged && decisions.scenarios.length > 0 && <label>{copy.selectedScenario}<select aria-label={copy.selectedScenario} value={decisions.selected?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="">{copy.noneSelected}</option>{decisions.scenarios.map(plan => <option key={plan.id} value={plan.id} disabled={plan.status !== "current"}>{fill(copy.scenarioOption, { name: plan.name, statusOrScope: plan.status === "current" ? plan.scopeLabel : plan.status === "stale" ? copy.scenarioStale : labels.meeting.decisions.draft })}</option>)}</select></label>}{decisions.selectedScenarios.length ? <>{decisions.selectedScenarios.map(plan => <div key={plan.id}><p>{fill(copy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatMoney(plan.baseline ?? null), contribution: formatMoney(plan.contribution ?? null), delta: formatSignedMoney(plan.delta ?? null) })}</p><details><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details></div>)}<p className="note">{copy.scenarioNote}</p></> : <p className="note">{copy.noScenario}</p>}{decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p className="note">{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}</div>
    {decisions.appendixActions.length > 0 && <details><summary>{fill(copy.appendixActions, { n: decisions.appendixActions.length })}</summary><ActionSummaryList actions={decisions.appendixActions} /></details>}</>}
    <details><summary>{labels.sections.technicalDetails}</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    {outputs && <><div className={styles.controls}><button type="button" className="button quiet" onClick={() => downloadText(exportManagerSummaryMarkdown(summary, effectiveContext), "profitlens-manager-summary.md", "text/markdown;charset=utf-8")}>{labels.buttons.exportMarkdown}</button><button type="button" className="button quiet" onClick={() => downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button><button type="button" className="button quiet" onClick={() => setPrinting(true)}>{labels.buttons.print}</button><button type="button" className="button quiet" aria-describedby="manager-summary-pdf-hint" onClick={() => setPrinting(true)}>{labels.buttons.exportPdf}</button>{printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>{copy.exitPrint}</button>}</div>
    <p className="note" id="manager-summary-pdf-hint">{labels.meetingPage.pdfHint}</p></>}
    <p className="note">{reviewControls ? copy.persistNoteManaged : copy.persistNoteLocal}</p>
    {printing && <PrintSummaryPortal summary={summary} decisionContext={effectiveContext} snapshot={snapshot} meeting={meeting} onDone={() => setPrinting(false)} />}
  </section>;
}

export interface PrintSummaryProps { summary: SummaryData; decisionContext?: SummaryDecisionContext; snapshot?: Pick<WorkspaceSnapshot, "report">; meeting?: PrintMeeting | null }

/**
 * R6-3「列印」與「匯出 PDF」共用同一流程：把 PrintSummary 放到 body 後呼叫 window.print()（使用者在列印對話框選「另存為 PDF」）；
 * afterprint 時呼叫 onDone 回到畫面。只在需要列印時掛上；reactStrictMode 的重複 effect 不會開兩次列印對話框。
 */
export function PrintSummaryPortal({ onDone, ...props }: PrintSummaryProps & { onDone: () => void }) {
  const done = useRef(onDone);
  const printed = useRef(false);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const stop = () => done.current();
    window.addEventListener("afterprint", stop);
    if (!printed.current) { printed.current = true; window.print(); }
    return () => window.removeEventListener("afterprint", stop);
  }, []);
  return createPortal(<PrintSummary {...props} />, document.body);
}

/**
 * A4 直式：第一頁＝標題、關鍵差額、決議與備註一行、三件事、通路表、選入方案（每個一行）與置頂行動；
 * 附錄（方案的完整假設、超過 200 字的備註全文、未置頂待辦、技術資訊）從新的一頁開始。
 */
export function PrintSummary({ summary, decisionContext, snapshot, meeting = null }: PrintSummaryProps) {
  const decisions = summaryDecisionState(summary, decisionContext);
  const alias = demoAlias(summary.dataset_id);
  const page = labels.meetingPage;
  const signedOrMissing = (value: string | null) => value === null ? labels.status.missing : formatSignedMoney(value);
  const priorityCopy = (item: SummaryData["priorities"][number]) => snapshot ? ruleCopy(snapshot, item.primary, alias) : { headline: item.title, nextStep: item.recommendation };
  const notes = decisionContext?.notes ?? "";
  const noteChars = Array.from(notes);
  const notesTruncated = noteChars.length > PRINT_NOTES_LIMIT;
  const firstPageNotes = notesTruncated ? fill(page.printNotesTruncated, { text: noteChars.slice(0, PRINT_NOTES_LIMIT).join("") }) : notes;
  const assumptions = decisions.selectedScenarios.filter(plan => plan.assumptions.length > 0);
  return <article className={styles.printSurface} data-testid="manager-summary-print">
    <header>{meeting && <p className={styles.printMeta}>{fill(page.printHeader, { name: meeting.name, date: meeting.date, asOf: summary.data_as_of })}</p>}<h1>{copy.printTitle}</h1><p>{fill(copy.printContext, { state: decisionContext?.decisionState ?? copy.draftDecision, asOf: summary.data_as_of, channels: channelsLabel(summary.scope.channels, alias) })}</p><p>{fill(copy.printPeriodLine, periodValues(summary))}</p></header>
    <div className={styles.printHeadlines}>{summary.headlines.map(row => <p key={row.metric}><strong>{metricDefinitions[row.metric].label}</strong><br />{fill(copy.printHeadline, { prev: formatMoney(row.previous.value), cur: formatMoney(row.current.value), change: signedOrMissing(row.change.value) })}</p>)}</div>
    {decisionContext?.reviewName && <p className={styles.printDecision} data-testid="print-decision-line">{fill(copy.printMeetingLine, { name: decisionContext.reviewName, state: decisionContext.decisionState ?? copy.draftDecision, notes: firstPageNotes })}</p>}
    <h2>{labels.sections.topThree}</h2><p>{fill(copy.printThresholdLine, { amount: formatMoney(summary.importance_threshold) })}</p>
    <ol>{summary.priorities.map(item => { const rule = priorityCopy(item); return <li key={item.code}><strong>{rule.headline}</strong>｜{scopeLabel(item.primary.scope, alias)}｜<span>{labels.sections.impact}</span> {signedOrMissing(item.impact?.value ?? null)}<p>{rule.nextStep}</p></li>; })}</ol>{!summary.priorities.length && <p>{labels.notes.noPriorities}</p>}
    <table><caption>{fill(copy.printChannelCaption, { metric: metricDefinitions.contribution_after_marketing.label })}</caption><thead><tr><th>{copy.channelColumn}</th><th>{labels.periods.previous}</th><th>{labels.periods.current}</th><th>{copy.changeColumn}</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th>{channelLabel(row.channel, alias)}</th><td>{formatMoney(row.contribution.previous.value)}</td><td>{formatMoney(row.contribution.current.value)}</td><td>{signedOrMissing(row.contribution.change.value)}</td></tr>)}</tbody></table>
    <h2>{copy.printDecisionsHeading}</h2>
    {/* 第一頁每個選入方案只印一行；完整假設在附錄。 */}
    {decisions.selectedScenarios.length ? decisions.selectedScenarios.map(plan => <div key={plan.id} data-testid="print-scenario-line"><p>{fill(copy.printScenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatMoney(plan.baseline ?? null), contribution: formatMoney(plan.contribution ?? null), delta: formatSignedMoney(plan.delta ?? null) })}</p></div>) : <p>{copy.noScenario}</p>}
    {decisions.mainActions.length ? <ActionSummaryList actions={decisions.mainActions} /> : <p>{decisions.appendixActions.length ? copy.unpinnedNotice : copy.noActions}</p>}
    <footer><p>{labels.basis.footer}</p></footer>
    {assumptions.length > 0 && <section className={styles.printAppendix} data-testid="print-appendix-assumptions"><h2>{page.printAssumptionsHeading}</h2>{assumptions.map(plan => <div key={plan.id}><h3>{fill(page.printAssumptionsItem, { name: plan.name, scope: plan.scopeLabel })}</h3><ul>{plan.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></div>)}</section>}
    {notesTruncated && decisionContext?.reviewName && <section className={styles.printAppendix} data-testid="print-appendix-notes"><h2>{page.printNotesHeading}</h2><p className={styles.printNotes}>{notes}</p></section>}
    {decisions.appendixActions.length > 0 && <section className={styles.printAppendix}><h2>{copy.appendixHeading}</h2><ActionSummaryList actions={decisions.appendixActions} /></section>}
    <section className={styles.printAppendix}><h2>{labels.sections.technicalDetails}</h2><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}<li><code>metric_version</code> {summary.metric_version} · <code>dataset_id</code> {summary.dataset_id}</li><li><code>dataset_hash</code> {summary.dataset_hash}</li><li><code>filter_hash</code> {summary.filter_hash}</li></ul></section>
  </article>;
}

/** 方案與待辦的待辦清單（會議摘要、列印版與會議紀錄頁議程 ⑥ 共用）。 */
export function ActionSummaryList({ actions }: { actions: ReturnType<typeof summaryDecisionState>["actions"] }) {
  return <ul>{actions.map(action => <li key={action.id}><strong>{action.problem}</strong> · {action.status === "stale" ? labels.actions.staleBadge : action.status === "current" ? copy.actionConfirmed : copy.actionDraft} · {action.scopeLabel}<p>{action.action}</p><p>{fill(copy.actionMeta, { owner: action.owner || copy.ownerPending, deadline: action.deadline || copy.duePending, risk: action.risk || copy.riskPending })}</p>{action.executionStatus && <p>{fill(copy.actionExecution, { status: action.executionStatus, notes: action.executionNotes })}</p>}</li>)}</ul>;
}
