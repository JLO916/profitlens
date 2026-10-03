"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Diagnostic } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { compareProducts } from "@/domain/product-comparison";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import { decisionSignature } from "@/application/decision";
import { actionDocuments, taipeiToday, type ActionExecutionStatus, type ActionWorkspace } from "@/application/action-workspace";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown } from "@/application/manager-summary";
import { compareWithLastMeeting, exportMeetingMarkdown, lastMeeting, type Meeting, type MeetingActionFollowUp, type MeetingComparison, type MeetingDecision, type MeetingPriority } from "@/application/meeting";
import { exportExcel, type ExcelMeeting } from "@/application/excel-export";
import { exportPptx } from "@/application/pptx-export";
import { downloadText } from "@/application/download";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import { scenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, refreshReviewActionReferences, REVIEW_DECISION_LABELS, reviewScenarioId, selectReviewScenario, syncReviewPins, updateReviewSession, validateReviewSession, type ReviewDecisionState, type ReviewSession } from "@/application/review-session";
import { ManagerSummary, PrintSummaryPortal } from "./manager-summary";
import { amountTone } from "./top-three";
import type { EvidenceSelection } from "./evidence-drawer";

// R6-2 會議紀錄分頁（02 §8）：會議基本 → 議程 ①–⑥ → 決議與結束會議 → 上次會議比較 → 會議歷史 → 輸出。承接原 ReviewWorkbench 的全部控制項。
const copy = labels.ui.reviewWorkbench;
const page = labels.meetingPage;
const record = labels.meetingRecord;
type Targets = { set: TargetSet | null; allChannels: readonly string[] } | null;
/** ReviewDecisionState（needs_data／not_adopted）→ labels.meeting.decisions 的鍵（need_data／rejected）；只做顯示對照，不改機器值。 */
export const DECISION_LABEL_KEY: Record<ReviewDecisionState, keyof typeof labels.meeting.decisions> = { draft: "draft", adopted: "adopted", needs_data: "need_data", not_adopted: "rejected" };
const EXECUTION_LABELS: Record<ActionExecutionStatus, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
const MARKDOWN_MIME = "text/markdown;charset=utf-8";

/** Excel／PPT 的會議資訊（名稱、日期、決議鍵、備註）；沒有會議稿就是 null。日期沒填用臺北今天。 */
export function meetingExportInfo(review: ReviewSession | null, today: string = taipeiToday()): ExcelMeeting | null {
  return review ? { name: review.name, date: review.meeting_date ?? today, decision: DECISION_LABEL_KEY[review.decision_state], notes: review.notes } : null;
}
const decisionText = (row: MeetingDecision): string => row.confirmed_revision === null
  ? fill(record.decisionUnconfirmed, { decision: REVIEW_DECISION_LABELS[row.state] })
  : fill(record.decisionConfirmed, { decision: REVIEW_DECISION_LABELS[row.state], revision: row.confirmed_revision });
const latestDecision = (meeting: Meeting): MeetingDecision => meeting.decisions[meeting.decisions.length - 1];
const signedOrMissing = (value: string | null) => value === null ? labels.status.missing : formatSignedMoney(value);
const moneyOrMissing = (value: string | null) => value === null ? labels.status.missing : formatMoney(value);
/** 已結束會議的 Markdown（含本工作階段結束時算好的上次比較；備份不保存比較，還原後只有紀錄本身）。 */
export function downloadMeetingMarkdown(meeting: Meeting, comparison?: MeetingComparison) {
  downloadText(exportMeetingMarkdown(meeting, comparison), `profitlens-meeting-${meeting.date}.md`, MARKDOWN_MIME);
}

/** 總覽頁只留一行入口（05 §10）：本期會議的決議狀態（或尚未建立）＋同一份資料的上次會議日期。 */
export function MeetingEntry({ review, history, datasetHash, onOpen }: { review: ReviewSession | null; history: readonly Meeting[]; datasetHash: string; onOpen: () => void }) {
  const state = review ? labels.meeting.decisions[DECISION_LABEL_KEY[review.decision_state]] : labels.sections.meetingNotCreated;
  const last = lastMeeting(history);
  return <p className="meeting-entry" data-testid="overview-meeting-entry"><span>{fill(page.entry, { state })}</span>{last && last.source_fixed.dataset_hash === datasetHash && <span className="note">{fill(page.entryLast, { date: last.date })}</span>}<button type="button" className="text-button" onClick={onOpen}>{page.goToMeeting} <span aria-hidden="true">→</span></button></p>;
}

type ReviewSource = { key: string; snapshot: WorkspaceSnapshot; dataset: Dataset };
/**
 * 會議固定範圍的快照：與目前檢視同一份資料、同一個範圍時直接用目前快照（filter_hash 是範圍的摘要，兩者相同即同一份結果）；
 * 否則用會議保存的來源重建（與原 ReviewWorkbench 相同的檢查），重建失敗就不顯示數字。
 */
function useReviewSource(review: ReviewSession | null, source: ScenarioSource): { ready: ReviewSource | null; failed: boolean } {
  const key = review ? `${review.dataset_hash}-${review.filter_hash}` : "";
  const direct = review !== null && source.snapshot.dataset_hash === review.dataset_hash && source.snapshot.filter_hash === review.filter_hash;
  const current = useMemo(() => direct ? { key, snapshot: source.snapshot, dataset: source.dataset } : null, [direct, key, source.snapshot, source.dataset]);
  const [loaded, setLoaded] = useState<ReviewSource | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const sourceInput = review?.source_input, filters = review?.meeting_filters, datasetHash = review?.dataset_hash, filterHash = review?.filter_hash, asOf = review?.data_as_of, metricVersion = review?.metric_version;
  useEffect(() => {
    if (direct || !sourceInput || !filters) return;
    let cancelled = false;
    void (async () => {
      const result = validateDataset(sourceInput);
      if (!result.dataset || result.classification === "blocking" || await hashInput(sourceInput) !== datasetHash) throw new Error("REVIEW_SOURCE_MISMATCH");
      const snapshot = await createSnapshot(result.dataset, filters, datasetHash);
      if (snapshot.filter_hash !== filterHash || snapshot.data_as_of !== asOf || snapshot.metric_version !== metricVersion) throw new Error("REVIEW_SOURCE_MISMATCH");
      if (!cancelled) { setLoaded({ key, snapshot, dataset: result.dataset }); setFailedKey(null); }
    })().catch(() => { if (!cancelled) setFailedKey(key); });
    return () => { cancelled = true; };
  }, [direct, sourceInput, filters, datasetHash, filterHash, asOf, metricVersion, key]);
  if (!review) return { ready: null, failed: false };
  if (current) return { ready: current, failed: false };
  return { ready: loaded?.key === key ? loaded : null, failed: failedKey === key };
}

export interface MeetingPageProps {
  source: ScenarioSource; scenarioWorkspace: ScenarioWorkspace; actionWorkspace: ActionWorkspace;
  review: ReviewSession | null;
  /** 已結束的會議（只讀，由舊到新）。 */
  history: readonly Meeting[];
  /** 本工作階段結束會議時算好的上次比較（依 meeting id），給歷史的 Markdown 用；備份不保存。 */
  comparisons?: Readonly<Record<string, MeetingComparison>>;
  onChange: (review: ReviewSession) => void;
  onEvidence: (selection: EvidenceSelection, review: ReviewSession) => void;
  onCreateAction?: (diagnostic: Diagnostic, review: ReviewSession) => void;
  onRefreshSource?: () => void;
  /** 「結束會議」確認後呼叫；失敗時擲錯（畫面顯示 finalizeError）。 */
  onFinalize: () => Promise<void>;
  /** 目前資料的含稅換算與目標；只在會議用的資料與目前資料相同時帶進摘要與匯出。 */
  conversion?: TaxConversion | null;
  targets?: Targets;
}

export function MeetingPage({ source, scenarioWorkspace, actionWorkspace, review, history, comparisons, onChange, onEvidence, onCreateAction, onRefreshSource, onFinalize, conversion = null, targets = null }: MeetingPageProps) {
  const [error, setError] = useState<{ at: "basics" | "scenarios" | "decision"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<"done" | "error" | null>(null);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pptx" | null>(null);
  const [exportError, setExportError] = useState(false);
  const finalizeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const basicsRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  // 確認區打開時焦點移到它的標題；取消時回到「結束會議」；結束成功後移到新會議的「會議基本」。
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (returnFocus.current) { returnFocus.current = false; finalizeRef.current?.focus(); }
  }, [confirming]);
  useEffect(() => { if (finalizeResult === "done") basicsRef.current?.focus(); }, [finalizeResult]);
  const { ready, failed } = useReviewSource(review, source);
  const sameData = review !== null && source.snapshot.dataset_hash === review.dataset_hash;
  const reviewConversion = sameData ? conversion : null, reviewTargets = sameData ? targets : null;
  const threshold = review?.importance_threshold;
  const summary = useMemo(() => ready && threshold !== undefined ? buildManagerSummary(ready.snapshot, { importanceThreshold: threshold, conversion: reviewConversion, targets: reviewTargets ?? undefined }) : null, [ready, threshold, reviewConversion, reviewTargets]);
  const last = lastMeeting(history);
  const comparison = useMemo(() => ready && review ? compareWithLastMeeting({ snapshot: ready.snapshot, review, actions: actionWorkspace, conversion: reviewConversion, targets: reviewTargets }, last) : null, [ready, review, actionWorkspace, reviewConversion, reviewTargets, last]);
  const alias = demoAlias(source.snapshot.report.dataset_id);
  const status = <p className="meeting-status" role="status" aria-live="polite" data-testid="meeting-status">{finalizing ? page.finalizing : finalizeResult === "done" ? page.finalized : ""}</p>;
  const historySection = <MeetingHistory history={history} comparisons={comparisons} />;

  if (!review) return <section className="meeting-page" data-testid="meeting-page">{status}<section className="panel" data-testid="review-workbench"><h2>{labels.nav.meeting.label}</h2><p>{copy.createIntro}</p><button type="button" className="button primary" onClick={() => onChange(syncReviewPins(createReviewSession(source, scenarioWorkspace.active_epoch), actionWorkspace))}>{copy.createButton}</button></section>{historySection}</section>;

  const context = buildReviewDecisionContext(review, scenarioWorkspace, actionWorkspace);
  const actions = actionDocuments(actionWorkspace);
  const date = review.meeting_date ?? taipeiToday();
  const scope = review.meeting_filters;
  const viewDiffers = source.snapshot.dataset_hash !== review.dataset_hash || source.snapshot.filter_hash !== review.filter_hash;
  const options = scenarioWorkspace.contexts.filter(row => row.status === "current" && row.epoch === review.epoch && row.session.dataset_hash === review.dataset_hash && decisionSignature({ previous: row.session.scope.previous_period, current: row.session.scope.current_period, mode: row.session.scope.comparison_mode }) === decisionSignature({ previous: scope.previous_period, current: scope.current_period, mode: scope.comparison_mode }));
  const historical = review.status === "historical";
  const busy = exporting !== null || printing;
  function apply(patch: Parameters<typeof updateReviewSession>[1], at: "basics" | "decision") {
    if (!review) return;
    try { const next = updateReviewSession(review, patch); validateReviewSession(next, scenarioWorkspace); onChange(next); setError(null); }
    catch { setError({ at, text: Object.hasOwn(patch, "meeting_date") ? page.dateError : copy.applyError }); }
  }
  const refresh = () => {
    if (onRefreshSource) { onRefreshSource(); return; }
    const next = createReviewSession(source, scenarioWorkspace.active_epoch, review.id);
    onChange(syncReviewPins({ ...next, name: review.name, notes: review.notes, importance_threshold: review.importance_threshold, revision: review.revision + 1, ...(review.meeting_date ? { meeting_date: review.meeting_date } : {}) }, actionWorkspace));
  };
  const cancelConfirm = () => { returnFocus.current = true; setConfirming(false); };
  async function confirmFinalize() {
    setFinalizing(true); setFinalizeResult(null);
    let done = false;
    try { await onFinalize(); done = true; } catch { done = false; }
    setFinalizing(false); setFinalizeResult(done ? "done" : "error");
    if (done) setConfirming(false);
  }
  async function runExport(kind: "excel" | "pptx") {
    if (!ready || !summary || !review) return;
    setExporting(kind); setExportError(false);
    try {
      const meeting = meetingExportInfo(review, date);
      if (kind === "excel") await exportExcel({ summary, snapshot: ready.snapshot, dataset: ready.dataset, actions: actionWorkspace, products: compareProducts(ready.dataset, ready.snapshot.report.scope).rows, conversion: reviewConversion, meeting });
      else await exportPptx({ summary, snapshot: ready.snapshot, actions: actionWorkspace, meeting });
    } catch { setExportError(true); } finally { setExporting(null); }
  }
  const alertFor = (at: "basics" | "scenarios" | "decision") => error?.at === at ? <p role="alert">{error.text}</p> : null;

  return <section className="meeting-page" data-testid="meeting-page">
    {status}
    <section className="panel meeting-basics" data-testid="review-workbench" aria-labelledby="meeting-basics-title">
      <h2 id="meeting-basics-title" ref={basicsRef} tabIndex={-1}>{page.basics}</h2>
      <div className="meeting-fields">
        <label>{labels.meeting.name}<input maxLength={200} value={review.name} onChange={event => apply({ name: event.target.value }, "basics")} /></label>
        <label>{labels.meeting.date}<input type="date" required value={date} onChange={event => apply({ meeting_date: event.target.value }, "basics")} /></label>
      </div>
      {alertFor("basics")}
      <p className="meeting-scope">{fill(copy.sourceLine, { sourceStatus: historical ? copy.sourceHistorical : copy.sourceFixed, channels: channelsLabel(scope.channels, alias) })} · {fill(page.periodsLine, { previousStart: scope.previous_period.start, previousEnd: scope.previous_period.end, currentStart: scope.current_period.start, currentEnd: scope.current_period.end })}</p>
      {viewDiffers && <p className="alert partial" data-testid="review-view-difference">{fill(copy.viewDifference, { meetingChannels: channelsLabel(scope.channels, alias), meetingStart: scope.current_period.start, meetingEnd: scope.current_period.end, viewChannels: channelsLabel(source.snapshot.report.scope.channels, alias), viewStart: source.snapshot.report.current.period.start, viewEnd: source.snapshot.report.current.period.end, datasetNote: source.snapshot.dataset_hash !== review.dataset_hash ? copy.viewDifferenceDataset : copy.viewDifferenceScope })}</p>}
      <button type="button" className="button quiet" onClick={refresh}>{labels.buttons.updateMeetingSource}</button>
      <details className="note"><summary>{labels.sections.technicalDetails}</summary><p>{copy.refreshHint}</p></details>
      {review.action_bindings.map(binding => {
        const action = actions.find(row => row.id === binding.action_id);
        if (!action || action.binding.context_id === binding.context_id && action.binding_revision === binding.binding_revision) return null;
        const name = action.problem || copy.actionFallback;
        return <div className="alert partial" key={binding.action_id}><p>{fill(copy.actionDrift, { problem: name })}</p><button type="button" className="button quiet" disabled={review.status !== "current" || action.binding.dataset_hash !== review.dataset_hash} onClick={() => { try { onChange(refreshReviewActionReferences(review, actionWorkspace, [binding.action_id])); setError(null); } catch { setError({ at: "basics", text: copy.actionDataMismatchError }); } }}>{fill(copy.refreshActionRef, { name })}</button><details><summary>{labels.sections.technicalDetails}</summary><p>action_id: {action.id} · binding_revision: {binding.binding_revision} → {action.binding_revision}</p></details></div>;
      })}
    </section>

    <section className="meeting-agenda" data-testid="meeting-agenda" aria-labelledby="meeting-agenda-title">
      <div className="meeting-agenda-head"><h2 id="meeting-agenda-title">{labels.sections.meetingAgenda}</h2><p className="note">{page.agendaNote}</p></div>
      {failed ? <p role="alert">{copy.sourceRebuildError}</p> : !ready ? <p role="status">{copy.rebuilding}</p> : <ManagerSummary key={`${review.id}-${ready.key}`} snapshot={ready.snapshot} conversion={reviewConversion} targets={reviewTargets} decisionContext={context} selectionManaged outputs={false} agenda={{ kpis: record.agenda.kpis, priorities: record.agenda.priorities, channels: record.agenda.channels }} meeting={{ name: review.name, date }} reviewControls={{ importanceThreshold: review.importance_threshold, onThresholdChange: value => apply({ importance_threshold: value }, "decision") }} onEvidence={selection => onEvidence(selection, review)} onCreateAction={onCreateAction ? diagnostic => onCreateAction(diagnostic, review) : undefined} />}
      <div className="panel meeting-agenda-rest">
        <section data-testid="meeting-agenda-4" aria-labelledby="meeting-agenda-4-title"><h3 id="meeting-agenda-4-title">{record.agenda.followUp}</h3>{comparison ? <FollowUp comparison={comparison} testId="meeting-followup" /> : <p role="status">{copy.rebuilding}</p>}</section>
        <section data-testid="meeting-agenda-5" aria-labelledby="meeting-agenda-5-title"><h3 id="meeting-agenda-5-title">{record.agenda.scenarios}</h3><p className="note">{page.scenariosNote}</p>
          <div className="meeting-fields">{scope.channels.map(channel => {
            const reference = review.selected_scenarios.find(row => row.channel === channel);
            const rows = options.filter(row => row.session.scope.channels[0] === channel).flatMap(row => row.plans.filter(plan => plan.result?.status === "valid").map(plan => ({ label: fill(copy.planOption, { name: plan.name }), reference: scenarioSelectionRef(row, plan.id) })));
            const retained = reference && !rows.some(row => reviewScenarioId(row.reference) === reviewScenarioId(reference));
            const selectLabel = fill(copy.scenarioSelect, { channel: channelLabel(channel, alias) });
            return <label key={channel}>{selectLabel}<select aria-label={selectLabel} disabled={historical} value={reference ? reviewScenarioId(reference) : ""} onChange={event => { try { const selected = rows.find(row => reviewScenarioId(row.reference) === event.target.value); onChange(selectReviewScenario(review, scenarioWorkspace, selected?.reference ?? null, channel)); setError(null); } catch { setError({ at: "scenarios", text: copy.scenarioChangedError }); } }}><option value="">{copy.notSelected}</option>{retained && <option value={reviewScenarioId(reference)} disabled>{copy.retainedOption}</option>}{rows.map(row => <option key={reviewScenarioId(row.reference)} value={reviewScenarioId(row.reference)}>{row.label}</option>)}</select></label>;
          })}</div>
          {alertFor("scenarios")}
          {context.scenarios.some(plan => plan.status === "stale") && <details><summary>{copy.staleScenarios}</summary><ul>{context.scenarios.filter(plan => plan.status === "stale").map(plan => <li key={plan.id}>{fill(copy.staleScenarioRow, { name: plan.name, scope: plan.scopeLabel, resultLabel: labels.scenario.resultTitle, amount: formatMoney(plan.contribution ?? null) })}<ul>{plan.assumptions.map(text => <li key={text}>{text}</li>)}</ul></li>)}</ul></details>}
        </section>
        <section data-testid="meeting-agenda-6" aria-labelledby="meeting-agenda-6-title"><h3 id="meeting-agenda-6-title">{record.agenda.actions}</h3><p className="note">{page.actionsNote}</p></section>
      </div>
    </section>

    <section className="panel meeting-decision" data-testid="meeting-decision">
      {/* 不用 aria-labelledby：區塊名「決議」會和決議下拉選單的標籤同名。 */}
      <h2>{labels.sections.meetingDecision}</h2>
      <div className="meeting-fields">
        <label>{labels.meeting.decision}<select aria-label={labels.meeting.decision} value={review.decision_state} onChange={event => apply({ decision_state: event.target.value as ReviewDecisionState }, "decision")}>{(Object.keys(REVIEW_DECISION_LABELS) as ReviewDecisionState[]).map(value => <option key={value} value={value}>{labels.meeting.decisions[DECISION_LABEL_KEY[value]]}</option>)}</select></label>
        <label className="meeting-notes">{labels.meeting.notes}<textarea maxLength={8000} value={review.notes} onChange={event => apply({ notes: event.target.value }, "decision")} /></label>
      </div>
      <p className="note">{labels.sections.caution}：{labels.meeting.decisionNote}</p>
      {alertFor("decision")}
      <div className="meeting-finalize">
        <button ref={finalizeRef} type="button" className="button primary" data-testid="meeting-finalize" disabled={historical || finalizing || confirming} aria-describedby="meeting-finalize-hint" onClick={() => { setConfirming(true); setFinalizeResult(null); }}>{labels.buttons.finalizeMeeting}</button>
        <p className="note" id="meeting-finalize-hint">{historical ? page.historicalNote : page.finalizeHint}</p>
      </div>
      {confirming && <div className="meeting-confirm" role="dialog" aria-modal="false" aria-labelledby="meeting-confirm-title" aria-describedby="meeting-confirm-body" data-testid="meeting-finalize-confirm" onKeyDown={event => { if (event.key === "Escape" && !finalizing) { event.stopPropagation(); cancelConfirm(); } }}>
        <h3 id="meeting-confirm-title" ref={confirmRef} tabIndex={-1}>{page.confirmTitle}</h3>
        <p id="meeting-confirm-body">{page.confirmBody}</p>
        <div className="button-row"><button type="button" className="button primary" data-testid="meeting-finalize-confirm-button" disabled={finalizing} onClick={() => void confirmFinalize()}>{labels.buttons.confirm}</button><button type="button" className="button quiet" disabled={finalizing} onClick={cancelConfirm}>{labels.buttons.cancel}</button></div>
      </div>}
      {finalizeResult === "error" && <p role="alert" className="alert error">{page.finalizeError}</p>}
    </section>

    <section className="panel meeting-compare" data-testid="meeting-compare" aria-labelledby="meeting-compare-title">
      <h2 id="meeting-compare-title">{labels.sections.meetingCompare}</h2>
      {comparison ? <MeetingCompare comparison={comparison} /> : failed ? <p role="alert">{copy.sourceRebuildError}</p> : <p role="status">{copy.rebuilding}</p>}
    </section>

    {historySection}

    <section className="panel meeting-outputs" data-testid="meeting-outputs" aria-labelledby="meeting-outputs-title">
      <h2 id="meeting-outputs-title">{page.outputs}</h2>
      <div className="meeting-output-buttons">
        <button type="button" className="button quiet" disabled={!summary || busy} aria-describedby="meeting-pdf-hint" onClick={() => setPrinting(true)}>{labels.buttons.exportPdf}</button>
        <button type="button" className="button quiet" disabled={!summary} onClick={() => { if (summary) downloadText(exportManagerSummaryMarkdown(summary, context), "profitlens-manager-summary.md", MARKDOWN_MIME); }}>{labels.buttons.exportMarkdown}</button>
        <button type="button" className="button quiet" disabled={!summary} onClick={() => { if (summary) downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv"); }}>{labels.downloads.channelTableCsv}</button>
        <button type="button" className="button quiet" disabled={!summary || busy} onClick={() => void runExport("excel")}>{labels.buttons.exportExcel}</button>
        <button type="button" className="button quiet" disabled={!summary || busy} onClick={() => void runExport("pptx")}>{labels.buttons.exportPptx}</button>
        {printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>{labels.ui.managerSummary.exitPrint}</button>}
      </div>
      <p className="note" id="meeting-pdf-hint">{page.pdfHint}</p>
      {!summary && <p className="note">{page.notReady}</p>}
      {exporting && <p role="status">{page.exporting}</p>}
      {exportError && <p role="alert" className="alert error">{page.exportError}</p>}
      {printing && summary && ready && <PrintSummaryPortal summary={summary} decisionContext={context} snapshot={ready.snapshot} meeting={{ name: review.name, date }} onDone={() => setPrinting(false)} />}
    </section>
  </section>;
}

/** ④ 上次決議追蹤（也用在資料不同時的比較區）：上次決議＋上次置頂待辦的狀態表。 */
function FollowUp({ comparison, testId }: { comparison: MeetingComparison; testId: string }) {
  if (!comparison.last) return <p className="note">{record.noLastMeeting}</p>;
  const columns = page.followUpColumns;
  return <div className="meeting-followup" data-testid={testId}>
    <p>{fill(record.mdLastMeeting, { name: comparison.last.name, date: comparison.last.date })}</p>
    <ul className="meeting-decisions">{comparison.decisions.map((row, index) => <li key={index}>{page.lastDecision}：{decisionText(row)}{row.notes && <> · {labels.meeting.notes}：{row.notes}</>}</li>)}</ul>
    {comparison.actions.length ? <FollowUpTable rows={comparison.actions} columns={columns} /> : <p className="note">{page.noLastPinned}</p>}
  </div>;
}
function FollowUpTable({ rows, columns }: { rows: readonly MeetingActionFollowUp[]; columns: typeof page.followUpColumns }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={page.followUpAria}><table><thead><tr><th scope="col">{columns.problem}</th><th scope="col">{columns.last}</th><th scope="col">{columns.current}</th><th scope="col">{columns.updated}</th></tr></thead><tbody>{rows.map(row => <tr key={row.action_id}><th scope="row">{row.problem || copy.actionFallback}</th><td>{EXECUTION_LABELS[row.last_status]}</td><td>{row.current_status ? EXECUTION_LABELS[row.current_status] : record.actionMissing}</td><td>{row.status_updated_at ?? record.statusNotUpdated}</td></tr>)}</tbody></table></div>;
}

/** 上次會議比較（05 §10）：同資料同通路才比 KPI 與三件事；資料或通路不同只列上次決議與待辦狀態。 */
function MeetingCompare({ comparison }: { comparison: MeetingComparison }) {
  if (comparison.kind === "none" || !comparison.last) return <p className="note">{record.noLastMeeting}</p>;
  const columns = record.compareColumns;
  return <div data-testid={`meeting-compare-${comparison.kind}`}>
    <p className="meeting-compare-head"><span className="tag">{fill(page.compareKind, { kind: record.kinds[comparison.kind] })}</span> {fill(record.mdLastMeeting, { name: comparison.last.name, date: comparison.last.date })}</p>
    <p data-testid="meeting-compare-note">{comparison.note}</p>
    {comparison.kind === "different_dataset" ? <FollowUp comparison={comparison} testId="meeting-compare-followup" /> : <>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={page.compareKpiAria}><table data-testid="meeting-compare-kpis"><thead><tr><th scope="col">{columns.metric}</th><th scope="col">{columns.last}</th><th scope="col">{columns.current}</th><th scope="col">{columns.change}</th></tr></thead><tbody>{comparison.kpis.map(row => <tr key={row.metric}><th scope="row">{metricDefinitions[row.metric].label}</th><td>{moneyOrMissing(row.last)}</td><td>{moneyOrMissing(row.current)}</td><td className={amountTone(row.change)}>{signedOrMissing(row.change)}</td></tr>)}</tbody></table></div>
      <div className="meeting-priority-compare">{([[record.lastPriorities, comparison.priorities.last], [record.currentPriorities, comparison.priorities.current]] as const).map(([title, rows]) => <div key={title}><h3>{title}</h3><PriorityList rows={rows} /></div>)}</div>
    </>}
  </div>;
}
function PriorityList({ rows }: { rows: readonly MeetingPriority[] }) {
  if (!rows.length) return <p className="note">{labels.notes.noPriorities}</p>;
  return <ul>{rows.map((row, index) => <li key={row.rule}>{fill(page.priorityRow, { n: index + 1, headline: row.headline, scope: row.scope, impact: labels.sections.impact, amount: signedOrMissing(row.impact) })}</li>)}</ul>;
}

/** 會議歷史：每筆已結束的會議一個 <details>（只讀）；可下載該次的會議紀錄 Markdown。 */
function MeetingHistory({ history, comparisons }: { history: readonly Meeting[]; comparisons?: Readonly<Record<string, MeetingComparison>> }) {
  return <section className="panel meeting-history" data-testid="meeting-history" aria-labelledby="meeting-history-title">
    <h2 id="meeting-history-title">{page.history}</h2>
    {history.length ? <><p className="note">{page.historyNote}</p><ul className="meeting-history-list">{[...history].reverse().map(meeting => {
      const title = fill(page.historyItem, { name: meeting.name, date: meeting.date, decision: decisionText(latestDecision(meeting)) });
      return <li key={meeting.id} data-testid="meeting-history-item"><details><summary>{title}</summary>
        <h3>{page.historyKpis}</h3><ul>{meeting.agenda.kpis.map(row => <li key={row.metric}>{fill(page.historyKpiRow, { metric: metricDefinitions[row.metric].label, previous: moneyOrMissing(row.previous), current: moneyOrMissing(row.current), change: signedOrMissing(row.change) })}</li>)}</ul>
        <h3>{page.historyActions}</h3>{meeting.agenda.pinned_actions.length ? <ul>{meeting.agenda.pinned_actions.map(row => <li key={row.action_id}>{fill(page.historyActionRow, { problem: row.problem || copy.actionFallback, status: EXECUTION_LABELS[row.execution_status] })}</li>)}</ul> : <p className="note">{record.noPinnedActions}</p>}
      </details><button type="button" className="button quiet" aria-label={`${labels.buttons.exportMarkdown} · ${title}`} onClick={() => downloadMeetingMarkdown(meeting, comparisons?.[meeting.id])}>{labels.buttons.exportMarkdown}</button></li>;
    })}</ul></> : <p className="note">{page.historyEmpty}</p>}
  </section>;
}
