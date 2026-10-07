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
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, type SummaryDecisionContext } from "@/application/manager-summary";
import { compareWithLastMeeting, exportMeetingMarkdown, lastMeeting, type Meeting, type MeetingActionFollowUp, type MeetingComparison, type MeetingDecision, type MeetingFollowUp, type MeetingKpiMetric, type MeetingPriority } from "@/application/meeting";
import { exportExcel, type ExcelMeeting } from "@/application/excel-export";
import { exportPptx } from "@/application/pptx-export";
import { downloadText } from "@/application/download";
import { track } from "@/application/analytics";
import { deltaTone, formatAmountL1, formatAmountL2, formatDateL1, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import { scenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, refreshReviewActionReferences, REVIEW_DECISION_LABELS, reviewScenarioId, selectReviewScenario, syncReviewPins, updateReviewSession, validateReviewSession, type ReviewDecisionState, type ReviewSession } from "@/application/review-session";
import { AgendaItem, ManagerSummary, toneClass } from "./manager-summary";
import { PrintSummaryPortal } from "./print-summary";
import { ActionSummaryList } from "./summary-shared";
import { COPY_STATUS_MS, CopyFallback, copyWeeklySummary } from "./overview/weekly-snapshot";
import { ShellIcon } from "./shell/shell-icon";
import type { EvidenceSelection } from "./evidence-drawer";

// R6-2 會議紀錄分頁；V3-7（PRD §7.6）改成文件式版面：頁首動作列（sticky）→ 固定範圍一行與差異橫幅 → 左側議程目錄＋議程 1–6（<ol>）
// → 決議備註 → 與上次會議比較（預設收合）→ 會議歷史（最底）。承接原 ReviewWorkbench 的全部控制項，handler 與 v2 相同。
const copy = labels.ui.reviewWorkbench;
const summaryCopy = labels.ui.managerSummary;
const page = labels.meetingPage;
const record = labels.meetingRecord;
const pageV3 = labels.meeting.pageV3;
const snapshotUi = labels.overview.snapshotUi;
/** 議程 1–6 的標題（議程目錄與各項 h3 同一組字串，labels.meeting.record.agenda）。 */
const AGENDA_TITLES = [record.agenda.kpis, record.agenda.priorities, record.agenda.channels, record.agenda.followUp, record.agenda.scenarios, record.agenda.actions] as const;
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
// V3-2b：會議頁的句子與三件事用 L1（萬），議程表格用 L2（整數元，表頭標「（元）」）。
const signedL1 = (value: string | null) => formatSignedDelta(value, "L1");
const yuanColumn = (label: string) => fill(labels.units.yuanColumn, { label });
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
/** 週會摘要的待辦概況（與 dashboard.tsx 的 overviewActions 同一個算法）：未完成的數量與置頂的前 3 項。 */
function weeklyActions(actions: ActionWorkspace) {
  return { pending: actions.items.filter(item => item.execution_status !== "completed").length, pinned: actions.items.filter(item => item.pinned).slice(0, 3).map(item => ({ problem: item.card.problem, owner: item.card.owner_role, deadline: item.card.deadline })) };
}

/**
 * 總覽頁只留一行入口（05 §10）：本期會議的決議狀態（或尚未建立）＋同一份資料的上次會議日期。
 * 剛結束會議、新會議稿還沒動過（同資料同範圍、第 1 版草稿）時改顯示「已結束（日期）· 本次草稿」。
 * V3-4a：放在本期一句話右側，整句就是唯一的文字按鈕（可及名稱補上「前往會議紀錄」）；上次會議日期是旁邊的註記。
 */
export function MeetingEntry({ review, history, datasetHash, onOpen }: { review: ReviewSession | null; history: readonly Meeting[]; datasetHash: string; onOpen: () => void }) {
  const state = review ? labels.meeting.decisions[DECISION_LABEL_KEY[review.decision_state]] : labels.sections.meetingNotCreated;
  const last = lastMeeting(history);
  const justFinalized = review !== null && last !== null && last.source_fixed.dataset_hash === review.dataset_hash && last.source_fixed.filter_hash === review.filter_hash && review.revision === 1 && review.decision_state === "draft";
  const entry = labels.overview.snapshotUi;
  const text = justFinalized ? fill(entry.meetingEntryFinalized, { date: last.date }) : fill(entry.meetingEntry, { state });
  const showLast = !justFinalized && last !== null && last.source_fixed.dataset_hash === datasetHash;
  return <p className="meeting-entry" data-testid="overview-meeting-entry"><button type="button" className="text-button" aria-label={fill(entry.meetingGoAria, { text, go: page.goToMeeting })} onClick={onOpen}>{text}</button>{showLast && <span className="note">{fill(page.entryLast, { date: last.date })}</span>}</p>;
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
  /** V3-7（§7.6 頁首「複製週會摘要」）：組週會摘要要用的資料集名稱、缺資料項數與全部通路；沒給就不顯示這顆按鈕。摘要用會議固定的 snapshot。 */
  summaryContext?: { datasetName: string; missingItems: number; allChannels: readonly string[] };
  /** 目前資料的含稅換算與目標；只在會議用的資料與目前資料相同時帶進摘要與匯出。 */
  conversion?: TaxConversion | null;
  targets?: Targets;
}
type FocusTarget = { focus: () => void } | null;

export function MeetingPage({ source, scenarioWorkspace, actionWorkspace, review, history, onChange, onEvidence, onCreateAction, onRefreshSource, onFinalize, onRemoveMeeting, summaryContext, conversion = null, targets = null }: MeetingPageProps) {
  const [error, setError] = useState<{ at: "basics" | "scenarios" | "decision"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<"done" | "error" | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState("");
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pptx" | null>(null);
  const [exportError, setExportError] = useState(false);
  // V3-7 頁首「複製週會摘要」：成功訊息（role=status 保持掛載，每次複製換一個 key）與剪貼簿不可用時的備案對話框（同總覽）。
  const [copyStatus, setCopyStatus] = useState<{ text: string; key: number }>({ text: "", key: 0 });
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const finalizeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const basicsRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  // 處理中的按鈕用 aria-disabled（不用 disabled，焦點才不會掉到 body）；guard 用 ref，連點也只跑一次。
  const working = useRef(false);
  const pdfTrigger = useRef<FocusTarget>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 確認區打開時焦點移到它的標題；取消時回到「結束會議」；結束成功後移到新會議的標題（頁首的「本次會議（草稿）」）。
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (returnFocus.current) { returnFocus.current = false; finalizeRef.current?.focus(); }
  }, [confirming]);
  useEffect(() => { if (finalizeResult === "done") basicsRef.current?.focus(); }, [finalizeResult]);
  useEffect(() => {
    const pending = copyTimer;
    return () => { if (pending.current) clearTimeout(pending.current); };
  }, []);
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

  // §6.3 #43a、C10 頁面型空狀態：還沒有會議稿（例如還原沒有會議稿的舊備份）；按鈕文字與行為同 v2，是全頁唯一的主要按鈕。
  if (!review) return <section className="meeting-page" data-testid="meeting-page">{status}<div className="ui-empty-page meeting-empty" data-testid="review-workbench"><h2>{pageV3.emptyTitle}</h2><p>{copy.createIntro}</p><button type="button" className="ui-btn ui-btn-primary" data-testid="meeting-create" onClick={() => onChange(syncReviewPins(createReviewSession(source, scenarioWorkspace.active_epoch), actionWorkspace))}>{copy.createButton}</button></div>{historySection}</section>;

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
      // 完成或失敗都把焦點留在觸發的地方（V3-7：選單已關閉，觸發點是「匯出會議」的 summary）。
      trigger?.focus();
    }
  }
  /** V3-7「匯出會議」頁內下拉：點完一項就關閉選單並回焦到 summary（Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`）。回傳 summary 當之後的回焦目標。 */
  function closeExportMenu(): FocusTarget {
    const menu = exportMenuRef.current;
    const trigger = menu?.querySelector<HTMLElement>(":scope > summary") ?? null;
    if (menu) menu.open = false;
    trigger?.focus();
    return trigger;
  }
  const startPrint = () => { if (!summary || busy || working.current) return; pdfTrigger.current = closeExportMenu(); setPrinting(true); };
  const endPrint = () => { setPrinting(false); pdfTrigger.current?.focus(); };
  const startExport = (kind: "excel" | "pptx") => { if (!summary || busy || working.current) return; void runExport(kind, closeExportMenu()); };
  const download = (run: () => void) => { if (!summary) return; run(); closeExportMenu(); };
  async function copySummary() {
    if (!ready || !summaryContext) return;
    const { copied, text } = await copyWeeklySummary({ snapshot: ready.snapshot, datasetName: summaryContext.datasetName, missingItems: summaryContext.missingItems, actions: weeklyActions(actionWorkspace), allChannels: summaryContext.allChannels }, typeof navigator === "undefined" ? null : navigator.clipboard);
    if (!copied) { setCopyFallback(text); return; }
    track("summary_copied");
    setCopyStatus(previous => ({ text: snapshotUi.copied, key: previous.key + 1 }));
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => { copyTimer.current = null; setCopyStatus(previous => ({ ...previous, text: "" })); }, COPY_STATUS_MS);
  }
  const alertFor = (at: "basics" | "scenarios" | "decision") => error?.at === at ? <p role="alert">{error.text}</p> : null;
  /** 匯出項目的說明行：會議資料還沒載入時（例如重建中）改寫 notReady，項目停用。 */
  const hint = (text: string) => summary ? text : page.notReady;

  // §7.6 第 1 點、§6.3 #49：「匯出會議」頁內下拉（會議範圍 5 項，呼叫 v2 的同一組 handler）；每項 14px 名稱＋12px 說明（ui-menu-item[data-lines=2]），可及名稱只用名稱。
  const exportMenu = <details ref={exportMenuRef} className="topbar-menu auto-close export-page meeting-outputs" data-testid="meeting-outputs">
    <summary className="ui-btn ui-btn-secondary" data-testid="export-page-meeting">{pageV3.exportMenu}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
    <div className="menu-panel ui-menu meeting-export-menu">
      <button type="button" className="ui-menu-item" data-lines="2" data-testid="meeting-export-pdf" disabled={!summary} aria-disabled={busy || undefined} aria-label={labels.buttons.exportPdf} aria-describedby="meeting-pdf-hint" onClick={startPrint}><span>{labels.buttons.exportPdf}</span><small id="meeting-pdf-hint">{hint(page.pdfHint)}</small></button>
      <button type="button" className="ui-menu-item" data-lines="2" data-testid="meeting-export-markdown" disabled={!summary} aria-label={labels.buttons.exportMarkdown} aria-describedby="meeting-markdown-hint" onClick={() => download(() => { if (summary) downloadText(exportManagerSummaryMarkdown(summary, context), "profitlens-manager-summary.md", MARKDOWN_MIME); })}><span>{labels.buttons.exportMarkdown}</span><small id="meeting-markdown-hint">{hint(pageV3.exportHints.markdown)}</small></button>
      <button type="button" className="ui-menu-item" data-lines="2" data-testid="meeting-export-csv" disabled={!summary} aria-label={labels.downloads.channelTableCsv} aria-describedby="meeting-csv-hint" onClick={() => download(() => { if (summary) downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv"); })}><span>{labels.downloads.channelTableCsv}</span><small id="meeting-csv-hint">{hint(pageV3.exportHints.channelCsv)}</small></button>
      <button type="button" className="ui-menu-item" data-lines="2" data-testid="meeting-export-excel" disabled={!summary} aria-disabled={busy || undefined} aria-label={labels.buttons.exportExcel} aria-describedby="meeting-excel-hint" onClick={() => startExport("excel")}><span>{labels.buttons.exportExcel}</span><small id="meeting-excel-hint">{hint(pageV3.exportHints.excel)}</small></button>
      <button type="button" className="ui-menu-item" data-lines="2" data-testid="meeting-export-pptx" disabled={!summary} aria-disabled={busy || undefined} aria-label={labels.buttons.exportPptx} aria-describedby="meeting-pptx-hint" onClick={() => startExport("pptx")}><span>{labels.buttons.exportPptx}</span><small id="meeting-pptx-hint">{hint(pageV3.exportHints.pptx)}</small></button>
    </div>
  </details>;

  // §7.6 第 4 點 5：每通路一列（選入 select 同 v2：含「尚未選擇」與保留的舊選項）＋已選入方案的試算結果、過期標示；假設收合。
  const scenarioRows = <ul className="meeting-scenario-rows">{scope.channels.map(channel => {
    const index = review.selected_scenarios.findIndex(row => row.channel === channel);
    const reference = index >= 0 ? review.selected_scenarios[index] : undefined;
    const plan = index >= 0 ? context.scenarios[index] : undefined;
    const rows = options.filter(row => row.session.scope.channels[0] === channel).flatMap(row => row.plans.filter(plan => plan.result?.status === "valid").map(plan => ({ label: fill(copy.planOption, { name: plan.name }), reference: scenarioSelectionRef(row, plan.id) })));
    const retained = reference && !rows.some(row => reviewScenarioId(row.reference) === reviewScenarioId(reference));
    const selectLabel = fill(copy.scenarioSelect, { channel: channelLabel(channel, alias) });
    return <li key={channel} className="meeting-scenario-row">
      <label className="ui-field meeting-scenario-field"><span className="ui-field-label">{channelLabel(channel, alias)}</span><select className="ui-field-control" aria-label={selectLabel} data-testid={`meeting-scenario-select-${channel}`} disabled={historical} value={reference ? reviewScenarioId(reference) : ""} onChange={event => { try { const selected = rows.find(row => reviewScenarioId(row.reference) === event.target.value); onChange(selectReviewScenario(review, scenarioWorkspace, selected?.reference ?? null, channel)); setError(null); } catch { setError({ at: "scenarios", text: copy.scenarioChangedError }); } }}><option value="">{copy.notSelected}</option>{retained && <option value={reviewScenarioId(reference)} disabled>{copy.retainedOption}</option>}{rows.map(row => <option key={reviewScenarioId(row.reference)} value={reviewScenarioId(row.reference)}>{row.label}</option>)}</select></label>
      {plan && <div className="meeting-scenario-result" data-testid="meeting-scenario-result" data-status={plan.status}>
        {plan.status === "stale" && <span className="ui-lozenge" data-tone="warning">{copy.staleScenarios}</span>}
        <p>{fill(summaryCopy.scenarioLine, { name: plan.name, scope: plan.scopeLabel, baseline: formatAmountL1(plan.baseline ?? null), contribution: formatAmountL1(plan.contribution ?? null), delta: signedL1(plan.delta ?? null) })}</p>
        {plan.assumptions.length > 0 && <details className="meeting-scenario-assumptions"><summary>{labels.sections.scenarioAssumptions}</summary><ul>{plan.assumptions.map((text, position) => <li key={position}>{text}</li>)}</ul></details>}
      </div>}
    </li>;
  })}</ul>;

  return <section className="meeting-page" data-testid="meeting-page">
    {status}
    {/* §7.6 第 1 點、§6.3 #43／#46／#49：頁首動作列（≥ 1280 sticky 48px）。順序：標題、會議名稱、會議日期（行內編輯）、決議＋結束會議、複製週會摘要、匯出會議。 */}
    <div className="meeting-head" data-testid="review-workbench">
      <h2 id="meeting-title" className="meeting-title" data-testid="meeting-title" ref={basicsRef} tabIndex={-1}>{pageV3.title}</h2>
      <label className="meeting-head-field meeting-head-name"><span className="sr-only">{labels.meeting.name}</span><input className="ui-field-control" maxLength={200} value={review.name} onChange={event => apply({ name: event.target.value }, "basics")} /></label>
      <label className="meeting-head-field meeting-head-date"><span className="sr-only">{labels.meeting.date}</span><input className="ui-field-control" type="date" required value={date} onChange={event => apply({ meeting_date: event.target.value }, "basics")} /></label>
      <div className="meeting-head-actions">
        <div className="meeting-decision" data-testid="meeting-decision">
          <select className="ui-field-control" aria-label={labels.meeting.decision} value={review.decision_state} onChange={event => apply({ decision_state: event.target.value as ReviewDecisionState }, "basics")}>{(Object.keys(REVIEW_DECISION_LABELS) as ReviewDecisionState[]).map(value => <option key={value} value={value}>{labels.meeting.decisions[DECISION_LABEL_KEY[value]]}</option>)}</select>
          <button ref={finalizeRef} type="button" className="ui-btn ui-btn-primary" data-testid="meeting-finalize" disabled={historical || finalizing || confirming} aria-describedby="meeting-finalize-hint" onClick={() => { setConfirming(true); setFinalizeResult(null); }}>{labels.buttons.finalizeMeeting}</button>
          <span className="sr-only" id="meeting-finalize-hint">{historical ? page.historicalNote : page.finalizeHint}</span>
        </div>
        {summaryContext && <>
          <button type="button" className="ui-btn ui-btn-secondary" data-testid="meeting-copy-summary" disabled={!ready} onClick={() => void copySummary()}><ShellIcon name="copy" size={16} />{snapshotUi.copy}</button>
          <span className="copy-status meeting-copy-status" role="status" data-testid="meeting-copy-summary-status">{copyStatus.text && <span key={copyStatus.key} className="copy-status-text">{copyStatus.text}</span>}</span>
        </>}
        {exportMenu}
        {/* 「結束列印」只在列印模式中出現，放在下拉旁（不在下拉內）。 */}
        {printing && <button type="button" className="ui-btn ui-btn-secondary" onClick={endPrint}>{labels.ui.managerSummary.exitPrint}</button>}
      </div>
    </div>
    {/* §6.3 #46：結束會議的確認區（非 modal 的 role=dialog、Esc 取消），在動作列下方。 */}
    {confirming && <div className="meeting-confirm" role="dialog" aria-modal="false" aria-labelledby="meeting-confirm-title" aria-describedby="meeting-confirm-body" data-testid="meeting-finalize-confirm" onKeyDown={event => { if (event.key === "Escape" && !finalizing) { event.stopPropagation(); cancelConfirm(); } }}>
      <h3 id="meeting-confirm-title" ref={confirmRef} tabIndex={-1}>{page.confirmTitle}</h3>
      <p id="meeting-confirm-body">{page.confirmBody}</p>
      {finalizeResult === "error" && <p role="alert" className="alert error" data-testid="meeting-finalize-error">{finalizeMessage}</p>}
      <div className="button-row"><button type="button" className="ui-btn ui-btn-primary" data-testid="meeting-finalize-confirm-button" aria-disabled={finalizing || undefined} onClick={() => void confirmFinalize()}>{labels.buttons.confirm}</button><button type="button" className="ui-btn ui-btn-secondary" aria-disabled={finalizing || undefined} onClick={() => { if (!finalizing) cancelConfirm(); }}>{labels.buttons.cancel}</button></div>
    </div>}
    <div className="meeting-head-messages">
      {alertFor("basics")}
      {exporting && <p role="status">{page.exporting}</p>}
      {exportError && <p role="alert" className="ui-notice" data-tone="unfavorable">{page.exportError}</p>}
    </div>
    {/* §7.6 第 3 點：固定範圍一行（13px 次要色）；範圍不同時改成 C22 橫幅（檢視差異、用目前資料更新會議）。技術細節保留。 */}
    <div className="meeting-info">
      <p className="meeting-scope-line">{fill(copy.sourceLine, { sourceStatus: historical ? copy.sourceHistorical : copy.sourceFixed, channels: channelsLabel(scope.channels, alias) })} · {fill(pageV3.scopeLine, { previous: formatPeriodL1(scope.previous_period.start, scope.previous_period.end, { anchor: review.data_as_of }), current: formatPeriodL1(scope.current_period.start, scope.current_period.end, { anchor: review.data_as_of }), asOf: formatDateL1(review.data_as_of, { anchor: review.data_as_of }) })}{!viewDiffers && <> <button type="button" className="ui-btn ui-btn-text" onClick={refresh}>{labels.buttons.updateMeetingSource}</button></>}</p>
      {viewDiffers && <div className="ui-banner meeting-banner" data-testid="review-view-difference">
        <span>{pageV3.viewDifferenceBanner}</span>
        <details className="topbar-menu auto-close meeting-banner-detail"><summary className="ui-btn ui-btn-text">{pageV3.viewDifferenceToggle}</summary><div className="ui-popover meeting-banner-popover"><p>{fill(copy.viewDifference, { meetingChannels: channelsLabel(scope.channels, alias), meetingStart: scope.current_period.start, meetingEnd: scope.current_period.end, viewChannels: channelsLabel(source.snapshot.report.scope.channels, viewAlias), viewStart: source.snapshot.report.current.period.start, viewEnd: source.snapshot.report.current.period.end, datasetNote: source.snapshot.dataset_hash !== review.dataset_hash ? copy.viewDifferenceDataset : copy.viewDifferenceScope })}</p></div></details>
        <button type="button" className="ui-btn ui-btn-text" onClick={refresh}>{labels.buttons.updateMeetingSource}</button>
      </div>}
      <details className="meeting-technical"><summary>{labels.sections.technicalDetails}</summary><p>{copy.refreshHint}</p></details>
      {review.action_bindings.map(binding => {
        const action = actions.find(row => row.id === binding.action_id);
        if (!action || action.binding.context_id === binding.context_id && action.binding_revision === binding.binding_revision) return null;
        const name = action.problem || copy.actionFallback;
        return <div className="ui-notice meeting-drift" data-tone="warning" key={binding.action_id}><p>{fill(copy.actionDrift, { problem: name })}</p><button type="button" className="ui-btn ui-btn-secondary" disabled={review.status !== "current" || action.binding.dataset_hash !== review.dataset_hash} onClick={() => { try { onChange(refreshReviewActionReferences(review, actionWorkspace, [binding.action_id])); setError(null); } catch { setError({ at: "basics", text: copy.actionDataMismatchError }); } }}>{fill(copy.refreshActionRef, { name })}</button><details><summary>{labels.sections.technicalDetails}</summary><p>action_id: {action.id} · binding_revision: {binding.binding_revision} → {action.binding_revision}</p></details></div>;
      })}
    </div>

    <div className="meeting-layout">
      <AgendaToc version={ready ? ready.key : failed ? "failed" : "loading"} />
      <div className="meeting-main">
        {/* §7.6 第 4 點、§6.3 #44：議程 <ol>（不用圈數字，CSS counter 顯示 1–6）；1–3 是會議模式的一頁摘要（ManagerSummary agenda），4–6 在這裡。 */}
        <section className="meeting-agenda" data-testid="meeting-agenda" aria-labelledby="meeting-agenda-title">
          <div className="meeting-agenda-head"><h2 id="meeting-agenda-title">{labels.sections.meetingAgenda}</h2><p className="meeting-agenda-note">{page.agendaNote}</p></div>
          <ol className="meeting-agenda-list" data-testid={ready ? "manager-summary" : undefined}>
            {ready ? <ManagerSummary key={`${review.id}-${ready.key}`} snapshot={ready.snapshot} conversion={reviewConversion} targets={reviewTargets} decisionContext={context} selectionManaged outputs={false} decisions={false} agenda={{ kpis: record.agenda.kpis, priorities: record.agenda.priorities, channels: record.agenda.channels, channelSummary: pageV3.fullChannelTable, missingItems: ready.dataset.issues.length }} meeting={{ name: review.name, date }} reviewControls={{ importanceThreshold: review.importance_threshold, onThresholdChange: value => apply({ importance_threshold: value }, "basics") }} onEvidence={selection => onEvidence(selection, review)} onCreateAction={onCreateAction ? diagnostic => onCreateAction(diagnostic, review) : undefined} />
              : AGENDA_TITLES.slice(0, 3).map((title, index) => <AgendaItem key={title} n={index + 1} title={title}>{index > 0 ? <p className="meeting-agenda-note">{failed ? copy.sourceRebuildError : copy.rebuilding}</p> : failed ? <p role="alert">{copy.sourceRebuildError}</p> : <p role="status">{copy.rebuilding}</p>}</AgendaItem>)}
            {/* 4 上次決議追蹤（C3 列）：即時比較用 compareWithLastMeeting。 */}
            <AgendaItem n={4} title={record.agenda.followUp}>{comparison ? comparison.last ? <FollowUp name={comparison.last.name} date={comparison.last.date} decisions={comparison.decisions} actions={comparison.actions} testId="meeting-followup" /> : <p className="meeting-agenda-note">{record.noLastMeeting}</p> : failed ? <p className="meeting-agenda-note">{copy.sourceRebuildError}</p> : <p role="status">{copy.rebuilding}</p>}</AgendaItem>
            {/* 5 選入方案：每通路一列＋試算結果（與一頁摘要同一份 buildReviewDecisionContext）；過期方案標示、不列入決議。 */}
            <AgendaItem n={5} title={record.agenda.scenarios}>
              <p className="meeting-agenda-note">{page.scenariosNote}</p>
              {context.scenarios.length ? <div className="meeting-scenarios" data-testid="meeting-scenario-results">{scenarioRows}<p className="meeting-agenda-note">{summaryCopy.scenarioNote}</p></div> : <div className="meeting-scenarios">{scenarioRows}<p className="meeting-agenda-note" data-testid="meeting-scenario-results-empty">{summaryCopy.noScenario}</p></div>}
              {alertFor("scenarios")}
            </AgendaItem>
            {/* 6 置頂待辦：列表；其他待辦收合。 */}
            <AgendaItem n={6} title={record.agenda.actions}>
              <p className="meeting-agenda-note">{page.actionsNote}</p>
              {pinnedActions.length ? <div className="meeting-pinned-actions" data-testid="meeting-pinned-actions"><ActionSummaryList actions={pinnedActions} /></div> : <p className="meeting-agenda-note" data-testid="meeting-pinned-actions-empty">{record.noPinnedActions}</p>}
              {otherActions.length > 0 && <details className="meeting-other-actions"><summary>{fill(summaryCopy.appendixActions, { n: otherActions.length })}</summary><ActionSummaryList actions={otherActions} /></details>}
            </AgendaItem>
          </ol>
        </section>

        {/* §7.6 第 5 點：決議備註放在議程之後，下方一句限制（次要樣式，不加「注意：」）。 */}
        <div className="meeting-notes-block">
          <label className="meeting-notes-label" htmlFor="meeting-notes-input">{labels.meeting.notes}</label>
          <textarea id="meeting-notes-input" className="ui-field-control meeting-notes-input" maxLength={8000} aria-describedby="meeting-notes-hint" value={review.notes} onChange={event => apply({ notes: event.target.value }, "decision")} />
          <p className="meeting-notes-hint" id="meeting-notes-hint">{labels.meeting.decisionNote}</p>
          {alertFor("decision")}
        </div>

        {/* §7.6 第 6 點、§6.3 #47：與上次會議比較，預設收合（內容保持掛載）。 */}
        <details className="meeting-compare" data-testid="meeting-compare">
          <summary className="meeting-compare-summary"><h2 id="meeting-compare-title">{labels.sections.meetingCompare}</h2></summary>
          {comparison ? <MeetingCompare comparison={comparison} /> : <p className="meeting-agenda-note">{failed ? copy.sourceRebuildError : copy.rebuilding}</p>}
        </details>

        {/* §7.6 第 7 點：會議歷史在頁面最底。 */}
        {historySection}
      </div>
    </div>
    {copyFallback !== null && <CopyFallback text={copyFallback} onClose={() => setCopyFallback(null)} />}
    {printing && summary && ready && <PrintSummaryPortal summary={summary} decisionContext={context} snapshot={ready.snapshot} meeting={{ name: review.name, date }} onDone={endPrint} />}
  </section>;
}

/**
 * §7.6 版面：議程目錄（≥ 1280 左側 200px sticky；< 1280 收成頁首下方一列可水平捲動的錨點）。
 * 目前位置用 2px 強調線＋aria-current，跟著捲動（IntersectionObserver）；SSR 與還沒捲動時沒有 current。version 換了（議程 1–3 從載入中換成摘要）就重新觀察。
 */
function AgendaToc({ version }: { version: string }) {
  const [current, setCurrent] = useState<number | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = AGENDA_TITLES.map((_, index) => document.getElementById(`meeting-agenda-${index + 1}`)).filter((section): section is HTMLElement => section !== null);
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target.id); else visible.delete(entry.target.id); }
      const first = sections.find(section => visible.has(section.id));
      if (first) setCurrent(sections.indexOf(first) + 1);
    }, { rootMargin: "-160px 0px -50% 0px" });
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [version]);
  return <nav className="meeting-toc" aria-label={pageV3.tocAria}><ol>{AGENDA_TITLES.map((title, index) => <li key={title}><a href={`#meeting-agenda-${index + 1}`} aria-current={current === index + 1 ? "location" : undefined} onClick={() => setCurrent(index + 1)}>{title}</a></li>)}</ol></nav>;
}

/** ④ 上次決議追蹤：上次決議＋上次置頂待辦的狀態表（即時比較用 compareWithLastMeeting；歷史項目用凍結的 follow_up）。 */
function FollowUp({ name, date, decisions, actions, testId }: { name: string; date: string; decisions: readonly MeetingDecision[]; actions: readonly MeetingActionFollowUp[]; testId: string }) {
  return <div className="meeting-followup" data-testid={testId}>
    <p>{fill(record.mdLastMeeting, { name, date })}</p>
    <ul className="meeting-decisions">{decisions.map((row, index) => <li key={index}>{page.lastDecision}：{decisionText(row)}{row.notes && <> · {labels.meeting.notes}：{row.notes}</>}</li>)}</ul>
    {actions.length ? <FollowUpTable rows={actions} /> : <p className="note">{page.noLastPinned}</p>}
  </div>;
}
// V3-7（C3）：上次置頂待辦的狀態表改用 ui-table 列樣式（欄位與內容同 v2）。
function FollowUpTable({ rows }: { rows: readonly MeetingActionFollowUp[] }) {
  const columns = page.followUpColumns;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={page.followUpAria}><table className="ui-table"><thead><tr><th scope="col">{columns.problem}</th><th scope="col">{columns.last}</th><th scope="col">{columns.current}</th><th scope="col">{columns.updated}</th></tr></thead><tbody>{rows.map(row => <tr key={row.action_id}><th scope="row">{row.problem || copy.actionFallback}</th><td>{EXECUTION_LABELS[row.last_status]}</td><td>{row.current_status ? EXECUTION_LABELS[row.current_status] : record.actionMissing}</td><td>{row.status_updated_at ?? record.statusNotUpdated}</td></tr>)}</tbody></table></div>;
}
function KpiCompareTable({ rows, testId, ariaLabel = page.compareKpiAria }: { rows: readonly { metric: MeetingKpiMetric; last: string | null; current: string | null; change: string | null }[]; testId: string; ariaLabel?: string }) {
  const columns = record.compareColumns;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table data-testid={testId}><thead><tr><th scope="col">{columns.metric}</th><th scope="col">{yuanColumn(columns.last)}</th><th scope="col">{yuanColumn(columns.current)}</th><th scope="col">{yuanColumn(columns.change)}</th></tr></thead><tbody>{rows.map(row => <tr key={row.metric}><th scope="row">{metricDefinitions[row.metric].label}</th><td>{formatAmountL2(row.last)}</td><td>{formatAmountL2(row.current)}</td><td className={toneClass(deltaTone(row.metric, row.change, "L2"))}>{formatSignedDelta(row.change, "L2")}</td></tr>)}</tbody></table></div>;
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
  return <ul>{rows.map((row, index) => <li key={row.rule}>{fill(page.priorityRow, { n: index + 1, headline: row.headline, scope: row.scope, impact: labels.sections.impact, amount: signedL1(row.impact) })}</li>)}</ul>;
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
 * V3-7（§7.6 第 2 點、D-V3-22）：展開內容頂部一行結束標示；v2 結束的紀錄（沒有 copy_version）再加一行「本紀錄建立於 v2」。數字、決議與備註照紀錄顯示，欄名用新名詞。
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
  const today = taipeiToday();
  return <section className="panel meeting-history" data-testid="meeting-history" aria-labelledby="meeting-history-title">
    <h2 id="meeting-history-title" ref={titleRef} tabIndex={-1}>{page.history}</h2>
    <p className="sr-only" role="status" aria-live="polite" data-testid="meeting-history-status">{removed}</p>
    {history.length ? <><p className="note">{page.historyNote}</p><ul className="meeting-history-list">{[...history].reverse().map((meeting, index) => {
      const title = fill(page.historyItem, { name: meeting.name, date: meeting.date, decision: decisionText(latestDecision(meeting)) });
      const warningId = `meeting-history-remove-warning-${index}`;
      return <li key={meeting.id} data-testid="meeting-history-item"><details><summary>{title}</summary>
        <p className="meeting-snapshot-note" data-testid="meeting-snapshot-note">{fill(pageV3.snapshotNote, { date: formatDateL1(meeting.date, { today }) })}</p>
        {meeting.copy_version !== "v3" && <p className="meeting-snapshot-note" data-testid="meeting-v2-note">{pageV3.v2Note}</p>}
        <h3>{page.historyKpis}</h3><ul>{meeting.agenda.kpis.map(row => <li key={row.metric}>{fill(page.historyKpiRow, { metric: metricDefinitions[row.metric].label, previous: formatAmountL1(row.previous), current: formatAmountL1(row.current), change: signedL1(row.change) })}</li>)}</ul>
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
