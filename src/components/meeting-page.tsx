"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Dataset, Diagnostic } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { compareProducts } from "@/domain/product-comparison";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import type { TargetSet } from "@/application/targets";
import { decisionSignature } from "@/application/decision";
import { actionDocuments, taipeiToday, type ActionExecutionStatus, type ActionWorkspace } from "@/application/action-workspace";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, type SummaryDecisionContext } from "@/application/manager-summary";
import { compareWithLastMeeting, exportMeetingMarkdown, lastMeeting, type Meeting, type MeetingActionFollowUp, type MeetingComparison, type MeetingDecision, type MeetingFollowUp, type MeetingKpiMetric, type MeetingPriority } from "@/application/meeting";
import { exportExcel, type ExcelMeeting } from "@/application/excel-export";
import { exportPptx } from "@/application/pptx-export";
import { downloadText } from "@/application/download";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import { scenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, refreshReviewActionReferences, REVIEW_DECISION_LABELS, reviewScenarioId, selectReviewScenario, syncReviewPins, updateReviewSession, validateReviewSession, type ReviewDecisionState, type ReviewSession } from "@/application/review-session";
import { ActionSummaryList, ManagerSummary, PrintSummaryPortal } from "./manager-summary";
import { amountTone } from "./top-three";
import type { EvidenceSelection } from "./evidence-drawer";

// R6-2 會議紀錄分頁（02 §8）：會議基本 → 議程 ①–⑥ → 決議與結束會議 → 上次會議比較 → 會議歷史 → 輸出。承接原 ReviewWorkbench 的全部控制項。
const copy = labels.ui.reviewWorkbench;
const summaryCopy = labels.ui.managerSummary;
const page = labels.meetingPage;
const record = labels.meetingRecord;
type Targets = { set: TargetSet | null; allChannels: readonly string[] } | null;
/** ReviewDecisionState（needs_data／not_adopted）→ labels.meeting.decisions 的鍵（need_data／rejected）；只做顯示對照，不改機器值。 */
export const DECISION_LABEL_KEY: Record<ReviewDecisionState, keyof typeof labels.meeting.decisions> = { draft: "draft", adopted: "adopted", needs_data: "need_data", not_adopted: "rejected" };
const EXECUTION_LABELS: Record<ActionExecutionStatus, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
const MARKDOWN_MIME = "text/markdown;charset=utf-8";
/** 議程 ⑥ 與會議摘要相同：最多列三項置頂行動。 */
const MAX_AGENDA_ACTIONS = 3;

/** Excel／PPT 的會議資訊（名稱、日期、決議鍵、備註）；沒有會議稿就是 null。日期沒填用臺北今天。只給會議紀錄頁的輸出列用。 */
export function meetingExportInfo(review: ReviewSession | null, today: string = taipeiToday()): ExcelMeeting | null {
  return review ? { name: review.name, date: review.meeting_date ?? today, decision: DECISION_LABEL_KEY[review.decision_state], notes: review.notes } : null;
}
/** 會議固定來源的 dataset_id（review.source_input.manifest.dataset_id）：通路別名只看會議自己的資料，不看目前檢視。 */
export function reviewDatasetId(review: ReviewSession): string {
  const manifest: unknown = review.source_input.manifest;
  return manifest !== null && typeof manifest === "object" && "dataset_id" in manifest && typeof manifest.dataset_id === "string" ? manifest.dataset_id : "";
}
const decisionText = (row: MeetingDecision): string => row.confirmed_revision === null
  ? fill(record.decisionUnconfirmed, { decision: REVIEW_DECISION_LABELS[row.state] })
  : fill(record.decisionConfirmed, { decision: REVIEW_DECISION_LABELS[row.state], revision: row.confirmed_revision });
const latestDecision = (meeting: Meeting): MeetingDecision => meeting.decisions[meeting.decisions.length - 1];
const signedOrMissing = (value: string | null) => value === null ? labels.status.missing : formatSignedMoney(value);
const moneyOrMissing = (value: string | null) => value === null ? labels.status.missing : formatMoney(value);
/** 會議紀錄 Markdown 的檔名（含會議日期）。 */
export const meetingMarkdownFilename = (meeting: Meeting): string => `profitlens-meeting-${meeting.date}.md`;
/** 已結束會議的 Markdown：紀錄本身含結束當時凍結的上次比較（follow_up），還原備份後輸出相同。 */
export function downloadMeetingMarkdown(meeting: Meeting) {
  downloadText(exportMeetingMarkdown(meeting), meetingMarkdownFilename(meeting), MARKDOWN_MIME);
}
/** 「結束會議」失敗時依錯誤碼顯示的文案（meeting.ts／review-session.ts 的錯誤碼）；其餘一律 finalizeError。 */
export function finalizeErrorText(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "MEETING_HISTORY_FULL") return page.historyFull;
  if (code === "DUPLICATE_MEETING") return page.duplicateMeeting;
  if (code === "REVIEW_ADOPTED_STALE_SCENARIO") return page.staleScenario;
  return page.finalizeError;
}
/**
 * 下載選單「目前檢視」列印用的決策脈絡：只帶待辦工作區的待辦（置頂最多三項，其餘進附錄），與 PPT 一頁式的置頂待辦同源；
 * 不帶會議名稱、決議、備註與選入方案。待辦引用的資料與目前檢視不同時標為過期。
 */
export function currentViewDecisionContext(snapshot: Pick<WorkspaceSnapshot, "dataset_hash" | "filter_hash">, actions: ActionWorkspace): SummaryDecisionContext {
  const ui = labels.ui.reviewSession;
  return {
    dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, pinnedOnly: true, scenarios: [], selectedScenarioIds: [], decisionState: page.printViewState,
    actions: actionDocuments(actions).map(doc => ({
      id: doc.id, problem: doc.problem || ui.actionProblemMissing, action: doc.action, owner: doc.owner_role, deadline: doc.deadline, risk: doc.stop_condition, pinned: doc.pinned,
      executionStatus: EXECUTION_LABELS[doc.execution_status as ActionExecutionStatus] ?? EXECUTION_LABELS.not_started, executionNotes: doc.progress_notes,
      status: doc.status === "stale" || doc.binding.dataset_hash !== snapshot.dataset_hash ? "stale" as const : doc.status === "confirmed" ? "current" as const : "draft" as const,
      scopeLabel: fill(ui.actionScope, { channels: channelsLabel(doc.binding.scope.channels, demoAlias(doc.binding.dataset_id)), start: doc.binding.period.start, end: doc.binding.period.end }),
    })),
  };
}

/**
 * 總覽頁只留一行入口（05 §10）：本期會議的決議狀態（或尚未建立）＋同一份資料的上次會議日期。
 * 剛結束會議、新會議稿還沒動過（同資料同範圍、第 1 版草稿）時改顯示「已結束（日期）· 新會議稿：草稿」。
 */
export function MeetingEntry({ review, history, datasetHash, onOpen }: { review: ReviewSession | null; history: readonly Meeting[]; datasetHash: string; onOpen: () => void }) {
  const state = review ? labels.meeting.decisions[DECISION_LABEL_KEY[review.decision_state]] : labels.sections.meetingNotCreated;
  const last = lastMeeting(history);
  const justFinalized = review !== null && last !== null && last.source_fixed.dataset_hash === review.dataset_hash && last.source_fixed.filter_hash === review.filter_hash && review.revision === 1 && review.decision_state === "draft";
  return <p className="meeting-entry" data-testid="overview-meeting-entry">{justFinalized ? <span>{fill(page.entryFinalized, { date: last.date })}</span> : <><span>{fill(page.entry, { state })}</span>{last && last.source_fixed.dataset_hash === datasetHash && <span className="note">{fill(page.entryLast, { date: last.date })}</span>}</>}<button type="button" className="text-button" onClick={onOpen}>{page.goToMeeting} <span aria-hidden="true">→</span></button></p>;
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
  onChange: (review: ReviewSession) => void;
  onEvidence: (selection: EvidenceSelection, review: ReviewSession) => void;
  onCreateAction?: (diagnostic: Diagnostic, review: ReviewSession) => void;
  onRefreshSource?: () => void;
  /** 「結束會議」確認後呼叫；失敗時擲錯（畫面依錯誤碼顯示 finalizeErrorText）。 */
  onFinalize: () => Promise<void>;
  /** 從會議歷史移除一筆（歷史滿 100 筆時騰出空間）；沒給就不顯示移除按鈕。 */
  onRemoveMeeting?: (id: string) => void;
  /** 目前資料的含稅換算與目標；只在會議用的資料與目前資料相同時帶進摘要與匯出。 */
  conversion?: TaxConversion | null;
  targets?: Targets;
}
type FocusTarget = { focus: () => void } | null;

export function MeetingPage({ source, scenarioWorkspace, actionWorkspace, review, history, onChange, onEvidence, onCreateAction, onRefreshSource, onFinalize, onRemoveMeeting, conversion = null, targets = null }: MeetingPageProps) {
  const [error, setError] = useState<{ at: "basics" | "scenarios" | "decision"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<"done" | "error" | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState("");
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pptx" | null>(null);
  const [exportError, setExportError] = useState(false);
  const finalizeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const basicsRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  // 處理中的按鈕用 aria-disabled（不用 disabled，焦點才不會掉到 body）；guard 用 ref，連點也只跑一次。
  const working = useRef(false);
  const pdfTrigger = useRef<FocusTarget>(null);
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
  const statusText = finalizing ? page.finalizing : finalizeResult === "done" ? page.finalized : "";
  const status = <p className="meeting-status" role="status" aria-live="polite" data-testid="meeting-status">{statusText}</p>;
  const historySection = <MeetingHistory history={history} onRemove={onRemoveMeeting} />;

  if (!review) return <section className="meeting-page" data-testid="meeting-page">{status}<section className="panel" data-testid="review-workbench"><h2>{labels.nav.meeting.label}</h2><p>{copy.createIntro}</p><button type="button" className="button primary" data-testid="meeting-create" onClick={() => onChange(syncReviewPins(createReviewSession(source, scenarioWorkspace.active_epoch), actionWorkspace))}>{copy.createButton}</button></section>{historySection}</section>;

  const context = buildReviewDecisionContext(review, scenarioWorkspace, actionWorkspace);
  const actions = actionDocuments(actionWorkspace);
  const date = review.meeting_date ?? taipeiToday();
  const scope = review.meeting_filters;
  // 會議的通路別名看會議固定的來源（golden 不套示範別名）；「目前看的」才用目前檢視的資料。
  const alias = demoAlias(reviewDatasetId(review)), viewAlias = demoAlias(source.snapshot.report.dataset_id);
  const viewDiffers = source.snapshot.dataset_hash !== review.dataset_hash || source.snapshot.filter_hash !== review.filter_hash;
  const options = scenarioWorkspace.contexts.filter(row => row.status === "current" && row.epoch === review.epoch && row.session.dataset_hash === review.dataset_hash && decisionSignature({ previous: row.session.scope.previous_period, current: row.session.scope.current_period, mode: row.session.scope.comparison_mode }) === decisionSignature({ previous: scope.previous_period, current: scope.current_period, mode: scope.comparison_mode }));
  const historical = review.status === "historical";
  const busy = exporting !== null || printing;
  const pinnedActions = context.actions.filter(row => row.pinned).slice(0, MAX_AGENDA_ACTIONS), otherActions = context.actions.filter(row => !row.pinned);
  function apply(patch: Parameters<typeof updateReviewSession>[1], at: "basics" | "decision") {
    if (!review) return;
    try { const next = updateReviewSession(review, patch); validateReviewSession(next, scenarioWorkspace); onChange(next); setError(null); }
    catch { setError({ at, text: Object.hasOwn(patch, "meeting_date") ? page.dateError : copy.applyError }); }
  }
  const refresh = () => {
    if (onRefreshSource) { onRefreshSource(); return; }
    const next = createReviewSession(source, scenarioWorkspace.active_epoch, review.id);
    onChange(syncReviewPins({ ...next, name: review.name, notes: review.notes, importance_threshold: review.importance_threshold, revision: review.revision + 1, ...(review.meeting_date ? { meeting_date: review.meeting_date } : {}), ...(review.created_at ? { created_at: review.created_at } : {}) }, actionWorkspace));
  };
  const cancelConfirm = () => { returnFocus.current = true; setConfirming(false); setFinalizeResult(null); };
  async function confirmFinalize() {
    if (working.current) return;
    working.current = true;
    setFinalizing(true); setFinalizeResult(null);
    try {
      await onFinalize();
      setFinalizing(false); setFinalizeResult("done"); setConfirming(false);
    } catch (caught) {
      // 失敗：確認區保留，錯誤訊息在確認區內；焦點移到確認區標題（Esc 仍可取消）。
      setFinalizing(false); setFinalizeResult("error"); setFinalizeMessage(finalizeErrorText(caught));
      confirmRef.current?.focus();
    } finally { working.current = false; }
  }
  async function runExport(kind: "excel" | "pptx", trigger: FocusTarget) {
    if (!ready || !summary || !review || working.current || busy) return;
    working.current = true;
    setExporting(kind); setExportError(false);
    try {
      const meeting = meetingExportInfo(review, date);
      if (kind === "excel") await exportExcel({ summary, snapshot: ready.snapshot, dataset: ready.dataset, actions: actionWorkspace, products: compareProducts(ready.dataset, ready.snapshot.report.scope).rows, conversion: reviewConversion, meeting });
      else await exportPptx({ summary, snapshot: ready.snapshot, actions: actionWorkspace, meeting });
    } catch { setExportError(true); } finally {
      working.current = false; setExporting(null);
      // 完成或失敗都把焦點留在觸發的按鈕（按鈕一直在畫面上，只是處理中標成 aria-disabled）。
      trigger?.focus();
    }
  }
  const startPrint = (event: ReactMouseEvent<HTMLButtonElement>) => { if (!summary || busy || working.current) return; pdfTrigger.current = event.currentTarget; setPrinting(true); };
  const endPrint = () => { setPrinting(false); pdfTrigger.current?.focus(); };
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
      {viewDiffers && <p className="alert partial" data-testid="review-view-difference">{fill(copy.viewDifference, { meetingChannels: channelsLabel(scope.channels, alias), meetingStart: scope.current_period.start, meetingEnd: scope.current_period.end, viewChannels: channelsLabel(source.snapshot.report.scope.channels, viewAlias), viewStart: source.snapshot.report.current.period.start, viewEnd: source.snapshot.report.current.period.end, datasetNote: source.snapshot.dataset_hash !== review.dataset_hash ? copy.viewDifferenceDataset : copy.viewDifferenceScope })}</p>}
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
      {failed ? <p role="alert">{copy.sourceRebuildError}</p> : !ready ? <p role="status">{copy.rebuilding}</p> : <ManagerSummary key={`${review.id}-${ready.key}`} snapshot={ready.snapshot} conversion={reviewConversion} targets={reviewTargets} decisionContext={context} selectionManaged outputs={false} decisions={false} agenda={{ kpis: record.agenda.kpis, priorities: record.agenda.priorities, channels: record.agenda.channels, channelSummary: page.channelTableSummary }} meeting={{ name: review.name, date }} reviewControls={{ importanceThreshold: review.importance_threshold, onThresholdChange: value => apply({ importance_threshold: value }, "decision") }} onEvidence={selection => onEvidence(selection, review)} onCreateAction={onCreateAction ? diagnostic => onCreateAction(diagnostic, review) : undefined} />}
      <div className="panel meeting-agenda-rest">
        <section data-testid="meeting-agenda-4" aria-labelledby="meeting-agenda-4-title"><h3 id="meeting-agenda-4-title">{record.agenda.followUp}</h3>{comparison ? comparison.last ? <FollowUp name={comparison.last.name} date={comparison.last.date} decisions={comparison.decisions} actions={comparison.actions} testId="meeting-followup" /> : <p className="note">{record.noLastMeeting}</p> : failed ? <p className="note">{copy.sourceRebuildError}</p> : <p role="status">{copy.rebuilding}</p>}</section>
        <section data-testid="meeting-agenda-5" aria-labelledby="meeting-agenda-5-title"><h3 id="meeting-agenda-5-title">{record.agenda.scenarios}</h3><p className="note">{page.scenariosNote}</p>
          <div className="meeting-fields">{scope.channels.map(channel => {
            const reference = review.selected_scenarios.find(row => row.channel === channel);
            const rows = options.filter(row => row.session.scope.channels[0] === channel).flatMap(row => row.plans.filter(plan => plan.result?.status === "valid").map(plan => ({ label: fill(copy.planOption, { name: plan.name }), reference: scenarioSelectionRef(row, plan.id) })));
            const retained = reference && !rows.some(row => reviewScenarioId(row.reference) === reviewScenarioId(reference));
            const selectLabel = fill(copy.scenarioSelect, { channel: channelLabel(channel, alias) });
            return <label key={channel}>{selectLabel}<select aria-label={selectLabel} data-testid={`meeting-scenario-select-${channel}`} disabled={historical} value={reference ? reviewScenarioId(reference) : ""} onChange={event => { try { const selected = rows.find(row => reviewScenarioId(row.reference) === event.target.value); onChange(selectReviewScenario(review, scenarioWorkspace, selected?.reference ?? null, channel)); setError(null); } catch { setError({ at: "scenarios", text: copy.scenarioChangedError }); } }}><option value="">{copy.notSelected}</option>{retained && <option value={reviewScenarioId(reference)} disabled>{copy.retainedOption}</option>}{rows.map(row => <option key={reviewScenarioId(row.reference)} value={reviewScenarioId(row.reference)}>{row.label}</option>)}</select></label>;
          })}</div>
          {alertFor("scenarios")}
          {/* 已選入方案的試算結果（與會議摘要同一份 buildReviewDecisionContext）；過期方案標示、不列入決議。 */}
          {context.scenarios.length ? <div className="meeting-scenario-results" data-testid="meeting-scenario-results"><h4>{page.scenarioResults}</h4><ul>{context.scenarios.map(plan => <li key={plan.id} data-testid="meeting-scenario-result" data-status={plan.status}>{plan.status === "stale" && <><span className="tag warning">{copy.staleScenarios}</span> </>}{fill(summaryCopy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatMoney(plan.baseline ?? null), contribution: formatMoney(plan.contribution ?? null), delta: formatSignedMoney(plan.delta ?? null) })}{plan.assumptions.length > 0 && <details><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></details>}</li>)}</ul><p className="note">{summaryCopy.scenarioNote}</p></div> : <p className="note" data-testid="meeting-scenario-results-empty">{summaryCopy.noScenario}</p>}
        </section>
        <section data-testid="meeting-agenda-6" aria-labelledby="meeting-agenda-6-title"><h3 id="meeting-agenda-6-title">{record.agenda.actions}</h3><p className="note">{page.actionsNote}</p>
          {pinnedActions.length ? <div className="meeting-pinned-actions" data-testid="meeting-pinned-actions"><ActionSummaryList actions={pinnedActions} /></div> : <p className="note" data-testid="meeting-pinned-actions-empty">{record.noPinnedActions}</p>}
          {otherActions.length > 0 && <details className="meeting-other-actions"><summary>{fill(summaryCopy.appendixActions, { n: otherActions.length })}</summary><ActionSummaryList actions={otherActions} /></details>}
        </section>
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
        {finalizeResult === "error" && <p role="alert" className="alert error" data-testid="meeting-finalize-error">{finalizeMessage}</p>}
        <div className="button-row"><button type="button" className="button primary" data-testid="meeting-finalize-confirm-button" aria-disabled={finalizing || undefined} onClick={() => void confirmFinalize()}>{labels.buttons.confirm}</button><button type="button" className="button quiet" aria-disabled={finalizing || undefined} onClick={() => { if (!finalizing) cancelConfirm(); }}>{labels.buttons.cancel}</button></div>
      </div>}
    </section>

    <section className="panel meeting-compare" data-testid="meeting-compare" aria-labelledby="meeting-compare-title">
      <h2 id="meeting-compare-title">{labels.sections.meetingCompare}</h2>
      {comparison ? <MeetingCompare comparison={comparison} /> : failed ? <p role="alert">{copy.sourceRebuildError}</p> : <p role="status">{copy.rebuilding}</p>}
    </section>

    {historySection}

    <section className="panel meeting-outputs" data-testid="meeting-outputs" aria-labelledby="meeting-outputs-title">
      <h2 id="meeting-outputs-title">{page.outputs}</h2>
      <div className="meeting-output-buttons">
        <button type="button" className="button quiet" disabled={!summary} aria-disabled={busy || undefined} aria-describedby="meeting-pdf-hint" onClick={startPrint}>{labels.buttons.exportPdf}</button>
        <button type="button" className="button quiet" disabled={!summary} onClick={() => { if (summary) downloadText(exportManagerSummaryMarkdown(summary, context), "profitlens-manager-summary.md", MARKDOWN_MIME); }}>{labels.buttons.exportMarkdown}</button>
        <button type="button" className="button quiet" disabled={!summary} onClick={() => { if (summary) downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv"); }}>{labels.downloads.channelTableCsv}</button>
        <button type="button" className="button quiet" data-testid="meeting-export-excel" disabled={!summary} aria-disabled={busy || undefined} onClick={event => void runExport("excel", event.currentTarget)}>{labels.buttons.exportExcel}</button>
        <button type="button" className="button quiet" data-testid="meeting-export-pptx" disabled={!summary} aria-disabled={busy || undefined} onClick={event => void runExport("pptx", event.currentTarget)}>{labels.buttons.exportPptx}</button>
        {printing && <button type="button" className="button quiet" onClick={endPrint}>{labels.ui.managerSummary.exitPrint}</button>}
      </div>
      <p className="note" id="meeting-pdf-hint">{page.pdfHint}</p>
      {!summary && <p className="note">{page.notReady}</p>}
      {exporting && <p role="status">{page.exporting}</p>}
      {exportError && <p role="alert" className="alert error">{page.exportError}</p>}
      {printing && summary && ready && <PrintSummaryPortal summary={summary} decisionContext={context} snapshot={ready.snapshot} meeting={{ name: review.name, date }} onDone={endPrint} />}
    </section>
  </section>;
}

/** ④ 上次決議追蹤：上次決議＋上次置頂待辦的狀態表（即時比較用 compareWithLastMeeting；歷史項目用凍結的 follow_up）。 */
function FollowUp({ name, date, decisions, actions, testId }: { name: string; date: string; decisions: readonly MeetingDecision[]; actions: readonly MeetingActionFollowUp[]; testId: string }) {
  return <div className="meeting-followup" data-testid={testId}>
    <p>{fill(record.mdLastMeeting, { name, date })}</p>
    <ul className="meeting-decisions">{decisions.map((row, index) => <li key={index}>{page.lastDecision}：{decisionText(row)}{row.notes && <> · {labels.meeting.notes}：{row.notes}</>}</li>)}</ul>
    {actions.length ? <FollowUpTable rows={actions} /> : <p className="note">{page.noLastPinned}</p>}
  </div>;
}
function FollowUpTable({ rows }: { rows: readonly MeetingActionFollowUp[] }) {
  const columns = page.followUpColumns;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={page.followUpAria}><table><thead><tr><th scope="col">{columns.problem}</th><th scope="col">{columns.last}</th><th scope="col">{columns.current}</th><th scope="col">{columns.updated}</th></tr></thead><tbody>{rows.map(row => <tr key={row.action_id}><th scope="row">{row.problem || copy.actionFallback}</th><td>{EXECUTION_LABELS[row.last_status]}</td><td>{row.current_status ? EXECUTION_LABELS[row.current_status] : record.actionMissing}</td><td>{row.status_updated_at ?? record.statusNotUpdated}</td></tr>)}</tbody></table></div>;
}
function KpiCompareTable({ rows, testId, ariaLabel = page.compareKpiAria }: { rows: readonly { metric: MeetingKpiMetric; last: string | null; current: string | null; change: string | null }[]; testId: string; ariaLabel?: string }) {
  const columns = record.compareColumns;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table data-testid={testId}><thead><tr><th scope="col">{columns.metric}</th><th scope="col">{columns.last}</th><th scope="col">{columns.current}</th><th scope="col">{columns.change}</th></tr></thead><tbody>{rows.map(row => <tr key={row.metric}><th scope="row">{metricDefinitions[row.metric].label}</th><td>{moneyOrMissing(row.last)}</td><td>{moneyOrMissing(row.current)}</td><td className={amountTone(row.change)}>{signedOrMissing(row.change)}</td></tr>)}</tbody></table></div>;
}

/** 上次會議比較（05 §10）：同資料同通路才比 KPI 與三件事；資料或通路不同只留說明，上次決議與待辦狀態只列在 ④。 */
function MeetingCompare({ comparison }: { comparison: MeetingComparison }) {
  if (comparison.kind === "none" || !comparison.last) return <p className="note">{record.noLastMeeting}</p>;
  return <div data-testid={`meeting-compare-${comparison.kind}`}>
    <p className="meeting-compare-head"><span className="tag">{fill(page.compareKind, { kind: record.kinds[comparison.kind] })}</span> {fill(record.mdLastMeeting, { name: comparison.last.name, date: comparison.last.date })}</p>
    <p data-testid="meeting-compare-note">{comparison.note}</p>
    {comparison.kind === "different_dataset" ? <p className="note" data-testid="meeting-compare-see-followup">{page.compareSeeFollowUp}</p> : <>
      <KpiCompareTable rows={comparison.kpis} testId="meeting-compare-kpis" />
      <div className="meeting-priority-compare">{([[record.lastPriorities, comparison.priorities.last], [record.currentPriorities, comparison.priorities.current]] as const).map(([title, rows]) => <div key={title}><h3>{title}</h3><PriorityList rows={rows} /></div>)}</div>
    </>}
  </div>;
}
function PriorityList({ rows }: { rows: readonly MeetingPriority[] }) {
  if (!rows.length) return <p className="note">{labels.notes.noPriorities}</p>;
  return <ul>{rows.map((row, index) => <li key={row.rule}>{fill(page.priorityRow, { n: index + 1, headline: row.headline, scope: row.scope, impact: labels.sections.impact, amount: signedOrMissing(row.impact) })}</li>)}</ul>;
}
/** 歷史項目展開時的上次追蹤：結束當時凍結的 meeting.follow_up（比較方式、說明、KPI、上次決議、待辦狀態）。 */
function FrozenFollowUp({ follow, title }: { follow: MeetingFollowUp; title: string }) {
  if (follow.kind === "none" || follow.last_name === null || follow.last_date === null) return <p className="note">{record.noLastMeeting}</p>;
  return <div className="meeting-followup" data-testid="meeting-history-followup">
    <p className="meeting-compare-head"><span className="tag">{fill(page.compareKind, { kind: record.kinds[follow.kind] })}</span> {fill(record.mdLastMeeting, { name: follow.last_name, date: follow.last_date })}</p>
    <p>{follow.note}</p>
    {follow.kpis.length > 0 && <KpiCompareTable rows={follow.kpis} testId="meeting-history-kpis" ariaLabel={`${page.compareKpiAria} · ${title}`} />}
    <ul className="meeting-decisions">{follow.last_decisions.map((row, index) => <li key={index}>{page.lastDecision}：{decisionText(row)}{row.notes && <> · {labels.meeting.notes}：{row.notes}</>}</li>)}</ul>
    {follow.actions.length ? <FollowUpTable rows={follow.actions} /> : <p className="note">{page.noLastPinned}</p>}
  </div>;
}

/**
 * 會議歷史：每筆已結束的會議一個 <details>（只讀）；可下載該次的會議紀錄 Markdown（紀錄本身），也可移除（先確認；歷史滿 100 筆時騰出空間）。
 */
export function MeetingHistory({ history, onRemove }: { history: readonly Meeting[]; onRemove?: (id: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [removed, setRemoved] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const warningRef = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<FocusTarget>(null);
  // 打開確認時焦點移到提醒句（讀出「請先下載 Markdown」）；取消回到「移除」按鈕；移除後回到「會議歷史」標題。
  useEffect(() => { if (pending) warningRef.current?.focus(); }, [pending]);
  const cancel = () => { setPending(null); trigger.current?.focus(); };
  const confirm = (meeting: Meeting) => {
    if (!onRemove) return;
    onRemove(meeting.id);
    setPending(null); setRemoved(fill(page.removed, { name: meeting.name, date: meeting.date }));
    titleRef.current?.focus();
  };
  return <section className="panel meeting-history" data-testid="meeting-history" aria-labelledby="meeting-history-title">
    <h2 id="meeting-history-title" ref={titleRef} tabIndex={-1}>{page.history}</h2>
    <p className="sr-only" role="status" aria-live="polite" data-testid="meeting-history-status">{removed}</p>
    {history.length ? <><p className="note">{page.historyNote}</p><ul className="meeting-history-list">{[...history].reverse().map((meeting, index) => {
      const title = fill(page.historyItem, { name: meeting.name, date: meeting.date, decision: decisionText(latestDecision(meeting)) });
      const warningId = `meeting-history-remove-warning-${index}`;
      return <li key={meeting.id} data-testid="meeting-history-item"><details><summary>{title}</summary>
        <h3>{page.historyKpis}</h3><ul>{meeting.agenda.kpis.map(row => <li key={row.metric}>{fill(page.historyKpiRow, { metric: metricDefinitions[row.metric].label, previous: moneyOrMissing(row.previous), current: moneyOrMissing(row.current), change: signedOrMissing(row.change) })}</li>)}</ul>
        <h3>{page.historyActions}</h3>{meeting.agenda.pinned_actions.length ? <ul>{meeting.agenda.pinned_actions.map(row => <li key={row.action_id}>{fill(page.historyActionRow, { problem: row.problem || copy.actionFallback, status: EXECUTION_LABELS[row.execution_status] })}</li>)}</ul> : <p className="note">{record.noPinnedActions}</p>}
        <h3>{page.historyFollowUp}</h3><FrozenFollowUp follow={meeting.follow_up} title={title} />
      </details><div className="meeting-history-buttons">
        <button type="button" className="button quiet" aria-label={`${labels.buttons.exportMarkdown} · ${title}`} onClick={() => downloadMeetingMarkdown(meeting)}>{labels.buttons.exportMarkdown}</button>
        {onRemove && <button type="button" className="button quiet" data-testid={`meeting-history-remove-${meeting.id}`} aria-label={`${page.removeMeeting} · ${title}`} aria-expanded={pending === meeting.id} onClick={event => { trigger.current = event.currentTarget; setPending(meeting.id); }}>{page.removeMeeting}</button>}
      </div>
      {onRemove && pending === meeting.id && <div className="meeting-history-remove" role="group" aria-labelledby={warningId} data-testid="meeting-history-remove-confirm-region" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); cancel(); } }}>
        <p id={warningId} ref={warningRef} tabIndex={-1}>{page.removeWarning}</p>
        <div className="button-row"><button type="button" className="button primary" data-testid="meeting-history-remove-confirm" onClick={() => confirm(meeting)}>{page.removeConfirm}</button><button type="button" className="button quiet" onClick={cancel}>{labels.buttons.cancel}</button></div>
      </div>}</li>;
    })}</ul></> : <p className="note">{page.historyEmpty}</p>}
  </section>;
}
