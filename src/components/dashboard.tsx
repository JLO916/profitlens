"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, ComparisonMode, Dataset, DatasetInput, SourceRef, ValidationIssue } from "@/domain/types";
import { EvidenceDrawer, type EvidenceSelection } from "./evidence-drawer";
import { Overview } from "./overview";
import { DataWorkspace, Diagnosis } from "./workspace-panels";
import { AiPanel } from "./ai-panel";
import { getAiCapability, type AiCapability } from "@/application/ai-client";
import { IssueList } from "./issue-list";
import { ImportPanel } from "./import-panel";
import type { PreparedImport } from "@/application/import";
import { downloadText } from "@/application/download";
import { exportSnapshotCsv } from "@/application/export";
import { AnalysisChannelLimitError, AnalysisPeriodLimitError } from "@/application/limits";
import { MultiScenarioWorkbench } from "./multi-scenario-workbench";
import { ReviewWorkbench } from "./review-workbench";
import { activateScenarioEpoch, emptyScenarioWorkspace, scenarioContextDecision, resolveScenarioReference, type ScenarioWorkspace, type ScenarioSelectionRef } from "@/application/scenario-workspace";
import { createReviewSession, refreshReviewSession, syncReviewPins, selectReviewScenario, rebuildReviewSnapshot, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { exportWorkspaceDecision } from "@/application/workspace-decision-export";
import { decisionSignature, emptyDecisionWorkspace } from "@/application/decision";
import { exportWorkspaceBackup, restoreWorkspaceBackup, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { clearAutosaveWorkspace, loadAutosaveWorkspace, saveAutosaveWorkspace } from "@/application/local-store";
import { formatSavedClock, grantAutosaveConsent, readAutosaveConsent, revokeAutosaveConsent } from "@/application/autosave";
import { ReplacementDialog, type PendingReplacement } from "./replacement-dialog";
import { beginReplacement, type ReplacementKind } from "@/application/replacement-guard";
import { WorkspaceStorage } from "./workspace-storage";
import { ActionsWorkbench } from "./actions-workbench";
import { ProductComparisonPanel } from "./product-comparison-panel";
import { emptyActionWorkspace, refreshActionWorkspace, addActionDraft, type ActionWorkspace, type ActionContext } from "@/application/action-workspace";

type Panel = "overview" | "diagnosis" | "products" | "data" | "scenarios" | "actions" | "validation";
type Status = "empty" | "loading" | "error" | "partial" | "ready";
type Active = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>> };
const panels: { id: Panel; label: string; description: string }[] = [
  { id: "overview", label: "經營總覽", description: "掌握營收、成本與行銷後貢獻的變化。" },
  { id: "diagnosis", label: "通路診斷", description: "從可核查的事實，找到下一個需要確認的問題。" },
  { id: "products", label: "商品毛利", description: "回到商品收入與已入帳成本，查看毛利明細。" },
  { id: "scenarios", label: "情境試算", description: "明示假設，從同一通路基準比較條件結果。" },
  { id: "actions", label: "行動摘要", description: "把證據、驗證方式與停止條件整理成可執行的工作稿。" },
  { id: "data", label: "資料工作區", description: "確認來源、口徑與完整性，再開始營運檢討。" },
  { id: "validation", label: "進階驗證", description: "用合成案例檢查計算與缺漏處理；載入前先保存需要保留的工作區。" },
];
const datasetLabels: Record<string, string> = {
  demo: "營運示範｜12 週合成資料", golden: "Golden｜小型對帳資料",
  "missing-cogs": "缺漏案例｜商品成本", "missing-ad": "缺漏案例｜廣告日期", duplicate: "錯誤案例｜重複銷售鍵",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    diagnosis: "M4 19V9 M10 19V4 M16 19v-6 M22 19V7",
    products: "m3 7 9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10",
    data: "M4 4h16v16H4z M4 9h16 M9 4v16 M4 14h16",
    scenarios: "M4 4v16h16 M8 16l4-5 4 2 4-8",
    actions: "M8 5h12 M8 12h12 M8 19h12 M3 5h1 M3 12h1 M3 19h1",
    arrow: "M5 12h14 M13 6l6 6-6 6", lens: "M4 18V6h5v12 M13 18V3h6v15 M3 21h18",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.data} /></svg>;
}
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export function Dashboard() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [aiCapability, setAiCapability] = useState<AiCapability | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void getAiCapability(fetch, abort.signal).then(value => { if (!abort.signal.aborted) setAiCapability(value); });
    return () => abort.abort();
  }, []);
  const [status, setStatus] = useState<Status>("empty");
  const [selected, setSelected] = useState("demo");
  const [showImport, setShowImport] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [scenarioWorkspace, setScenarioWorkspaceState] = useState<ScenarioWorkspace>(emptyScenarioWorkspace);
  const scenarioRef = useRef(scenarioWorkspace);
  const [reviewSession, setReviewSessionState] = useState<ReviewSession | null>(null);
  const reviewRef = useRef(reviewSession);
  const [actionWorkspace, setActionWorkspaceState] = useState<ActionWorkspace>(emptyActionWorkspace);
  const actionRef = useRef(actionWorkspace);
  const storeActions = (next: ActionWorkspace) => { actionRef.current = next; setActionWorkspaceState(next); };
  const [version, setVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);
  const versionRef = useRef(0);
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  const [storageResetEpoch, setStorageResetEpoch] = useState(0);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("same_days");
  const markChanged = useCallback(() => { const next = ++versionRef.current; setVersion(next); }, []);
  const storeReview = useCallback((next: ReviewSession | null) => { reviewRef.current = next; setReviewSessionState(next); }, []);
  const storeScenarios = useCallback((next: ScenarioWorkspace) => { scenarioRef.current = next; setScenarioWorkspaceState(next); }, []);
  const setReview = (next: ReviewSession) => { storeReview(next); markChanged(); };
  const setScenarios: Dispatch<SetStateAction<ScenarioWorkspace>> = useCallback(next => {
    const updated = typeof next === "function" ? next(scenarioRef.current) : next;
    if (updated === scenarioRef.current) return;
    storeScenarios(updated);
    const review = reviewRef.current;
    if (review && review.decision_state !== "draft" && review.selected_scenarios.some(ref => resolveScenarioReference(updated, ref).status !== "current")) storeReview(updateReviewSession(review, { decision_state: "draft" }));
    markChanged();
  }, [markChanged, storeScenarios, storeReview]);
  const setActionWorkspace = (next: ActionWorkspace) => {
    storeActions(next);
    if (reviewRef.current) storeReview(syncReviewPins(reviewRef.current, next));
    markChanged();
  };
  const dirty = active !== null && version !== savedVersion;
  // HF-05: consented autosave. `dirty` keeps meaning "not explicitly backed up" for the
  // replacement guard; the unload warning is skipped once the autosave copy is current.
  const [autosave, setAutosave] = useState(false);
  const [autosaveAnswered, setAutosaveAnswered] = useState(false);
  const [autosavedVersion, setAutosavedVersion] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveError, setAutosaveError] = useState("");
  const [autosaveNotice, setAutosaveNotice] = useState("");
  const backupRef = useRef<WorkspaceBackupSource | null>(null);
  const autosaveBusy = useRef(false);
  const autosaveAgain = useRef(false);
  const autosaveCurrent = autosave && autosavedVersion === version;
  const unloadWarning = (dirty && !autosaveCurrent) || showImport;
  useEffect(() => {
    if (!unloadWarning) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unloadWarning]);
  const [evidence, setEvidenceState] = useState<EvidenceSelection | null>(null);
  const [evidenceSource, setEvidenceSource] = useState<Pick<Active, "dataset" | "filenames" | "mappings"> | null>(null);
  function setEvidence(selection: EvidenceSelection | null) { setEvidenceSource(null); setEvidenceState(selection); }
  function actionEvidence(selection: EvidenceSelection, context: ActionContext) {
    const historical = validateDataset(context.source_input).dataset;
    if (!historical) return;
    setEvidenceSource({ dataset: historical, filenames: context.session.filenames, mappings: context.source_mappings });
    setEvidenceState(selection);
  }
  function activate(next: Active, newEpoch = true) {
    setActive(next);
    storeActions(refreshActionWorkspace(actionRef.current, next.snapshot, next.revision));
    if (newEpoch) {
      const epoch = crypto.randomUUID(); storeScenarios(activateScenarioEpoch(scenarioRef.current, epoch));
      storeReview(reviewRef.current ? refreshReviewSession(reviewRef.current, epoch) : createReviewSession(next, epoch));
    }
  }
  const requestId = useRef(0);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [dates, setDates] = useState({ previousStart: "", previousEnd: "", currentStart: "", currentEnd: "" });
  const currentPanel = panels.find(item => item.id === panel)!;

  function requestReplacement(kind: ReplacementKind, run: () => void | Promise<void>) {
    requestId.current++; controller.current?.abort();
    const guard = beginReplacement(kind, versionRef.current, dirty || (showImport && kind !== "import"));
    if (guard.stage === "ready") { void run(); return; }
    if (active) setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    setPendingReplacement({ kind, version: guard.version, run });
  }
  function load(id: string) { requestReplacement("dataset", () => performLoad(id)); }
  async function performLoad(id: string) {
    const ticket = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setShowImport(false); setSelected(id); setStatus("loading"); setError(""); setFilterError(""); setIssues([]); setEvidence(null);
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(id)}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error("無法取得合成資料，請確認本機服務後重試。");
      const input: DatasetInput = await response.json();
      await afterPaint();
      if (ticket !== requestId.current) return;
      const validation = validateDataset(input);
      if (!validation.dataset) { setIssues(validation.issues); throw new Error("新資料未通過檢核。請查看問題清單，先前成功的資料仍保留。"); }
      const snapshot = await createSnapshot(validation.dataset, {}, await hashInput(input));
      if (ticket !== requestId.current) return;
      activate({ input, dataset: validation.dataset, snapshot, id, revision: ++revision.current }); setIssues(validation.issues);
      setComparisonMode(snapshot.report.scope.comparison_mode); markChanged();
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setStatus(validation.classification === "partial" ? "partial" : "ready"); setPanel("overview");
    } catch (caught) {
      if (ticket !== requestId.current || abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "資料處理失敗，請重試。"); setStatus("error");
    }
  }
  function startImport() {
    requestId.current++; controller.current?.abort(); setEvidence(null); setError(""); setFilterError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
    setPanel("data"); setShowImport(true);
  }
  function cancelImport() {
    requestId.current++; controller.current?.abort(); setShowImport(false); setError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
  }
  async function commitImport(prepared: PreparedImport, manifestName?: string) {
    if (!prepared.input || !prepared.validation.dataset || prepared.validation.classification === "blocking") return;
    requestReplacement("import", () => performCommitImport(prepared, manifestName));
  }
  async function performCommitImport(prepared: PreparedImport, manifestName?: string) {
    if (!prepared.input || !prepared.validation.dataset || prepared.validation.classification === "blocking") return;
    const ticket = ++requestId.current;
    controller.current?.abort(); setStatus("loading"); setEvidence(null); setError(""); setFilterError("");
    try {
      await afterPaint();
      const dataset = prepared.validation.dataset;
      const snapshot = await createSnapshot(dataset, {}, await hashInput(prepared.input));
      if (ticket !== requestId.current) return;
      activate({ input: prepared.input, dataset, snapshot, id: `import-${snapshot.dataset_hash}`, revision: ++revision.current, mappings: prepared.columnMappings, filenames: { ...prepared.originalNames, ...(manifestName ? { "manifest.json": manifestName } : {}) } });
      setComparisonMode(snapshot.report.scope.comparison_mode); markChanged();
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setIssues(prepared.validation.issues);
      setStatus(prepared.validation.classification === "partial" ? "partial" : "ready");
      setShowImport(false); setPanel("overview");
      // HF-07: the import form was long; land on the top of the new overview.
      requestAnimationFrame(() => { document.getElementById("main-content")?.focus({ preventScroll: true }); window.scrollTo({ top: 0, left: 0 }); });
    } catch {
      if (ticket !== requestId.current) return;
      setError("匯入計算未完成，尚未取代先前資料。請重試或取消匯入。"); setStatus("error");
    }
  }
  async function applyFilters(filters: AnalysisFilters) {
    if (!active) return;
    const ticket = ++requestId.current;
    setFilterError(""); setEvidence(null); setStatus("loading");
    try {
      await afterPaint();
      const snapshot = await createSnapshot(active.dataset, filters, active.snapshot.dataset_hash);
      if (ticket !== requestId.current) return;
      const oldScope = active.snapshot.report.scope, newScope = snapshot.report.scope;
      const periodChanged = decisionSignature([oldScope.previous_period, oldScope.current_period, oldScope.comparison_mode]) !== decisionSignature([newScope.previous_period, newScope.current_period, newScope.comparison_mode]);
      activate({ ...active, snapshot, revision: snapshot.filter_hash === active.snapshot.filter_hash ? active.revision : ++revision.current }, periodChanged);
      if (snapshot.filter_hash !== active.snapshot.filter_hash) markChanged();
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    } catch (caught) {
      if (ticket !== requestId.current) return;
      setFilterError(caught instanceof AnalysisPeriodLimitError || caught instanceof AnalysisChannelLimitError ? caught.message : "期間未套用：前期必須早於本期且都在資料涵蓋與截至日內。相同天數模式須等長；完整自然月模式須各為一個完整月份。目前仍顯示上次成功的範圍。");
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    }
  }
  function submitDates(event: FormEvent) {
    event.preventDefault();
    if (active) void applyFilters({ comparison_mode: comparisonMode, channels: active.snapshot.report.scope.channels, previous_period: { start: dates.previousStart, end: dates.previousEnd }, current_period: { start: dates.currentStart, end: dates.currentEnd } });
  }
  function clear() { requestReplacement("clear", performClear); }
  function performClear() {
    storeScenarios(emptyScenarioWorkspace()); storeReview(null); storeActions(emptyActionWorkspace()); setSavedVersion(versionRef.current);
    setStorageResetEpoch(value => value + 1);
    requestId.current++; controller.current?.abort(); setActive(null); setIssues([]); setEvidence(null);
    setStatus("empty"); setError(""); setFilterError(""); setShowImport(false);
  }
  function restore(workspace: RestoredWorkspace, accepted?: () => void) {
    requestReplacement("restore", () => { performRestore(workspace); accepted?.(); });
  }
  /** `explicitlySaved` is false for autosave recovery: that copy is overwritten by later replacements. */
  function performRestore(workspace: RestoredWorkspace, explicitlySaved = true) {
    requestId.current++; controller.current?.abort(); setEvidence(null);
    revision.current = Math.max(revision.current, workspace.revision);
    setActive({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, id: workspace.id, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings });
    storeScenarios(workspace.scenario_workspace); storeReview(workspace.review_session ?? syncReviewPins(createReviewSession({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings }, workspace.scenario_workspace.active_epoch), workspace.action_workspace)); storeActions(workspace.action_workspace); setIssues(workspace.issues);
    setComparisonMode(workspace.snapshot.report.scope.comparison_mode);
    setDates({ previousStart: workspace.snapshot.report.previous.period.start, previousEnd: workspace.snapshot.report.previous.period.end, currentStart: workspace.snapshot.report.current.period.start, currentEnd: workspace.snapshot.report.current.period.end });
    const next = ++versionRef.current; setVersion(next); if (explicitlySaved) setSavedVersion(next);
    setRestoreEpoch(value => value + 1); setShowImport(false); setError(""); setFilterError(""); setPanel("overview");
    setStatus(workspace.classification === "partial" ? "partial" : "ready");
    return next;
  }
  function draftFromDiagnostic(diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number]) {
    if (!active) return;
    setActionWorkspace(addActionDraft(actionWorkspace, active, crypto.randomUUID(), diagnostic.id));
    setPanel("actions"); setEvidence(null);
  }
  function exportDecision(format: "md" | "csv" | "json") {
    if (!active) return;
    const body = exportWorkspaceDecision(format, active, scenarioWorkspace, actionWorkspace, reviewSession);
    downloadText(body, `profitlens-decision.${format}`, format === "json" ? "application/json;charset=utf-8" : format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8");
  }
  function reviewEvidence(selection: EvidenceSelection, review: ReviewSession) {
    const dataset = validateDataset(review.source_input).dataset;
    if (!dataset) return;
    setEvidenceSource({ dataset, filenames: review.filenames, mappings: review.source_mappings }); setEvidenceState(selection);
  }
  async function draftFromReview(diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number], review: ReviewSession) {
    if (!active) return;
    const ticket = requestId.current;
    try {
      const snapshot = await rebuildReviewSnapshot(review), dataset = validateDataset(review.source_input).dataset;
      if (!dataset || ticket !== requestId.current || reviewRef.current?.id !== review.id || reviewRef.current.revision !== review.revision) return;
      const next = addActionDraft(actionRef.current, { input: review.source_input, dataset, snapshot, revision: review.revision, filenames: review.filenames, mappings: review.source_mappings }, crypto.randomUUID(), diagnostic.id);
      setActionWorkspace(refreshActionWorkspace(next, active.snapshot, active.revision));
      setPanel("actions"); setEvidence(null);
    } catch { if (ticket === requestId.current) setFilterError("會議原始引用無法重建，尚未新增行動；目前工作稿仍保留。"); }
  }
  function refreshReviewSource() {
    if (!active) return;
    const old = reviewRef.current;
    const next = createReviewSession(active, scenarioRef.current.active_epoch, old?.id);
    setReview(syncReviewPins({ ...next, revision: (old?.revision ?? 0) + 1, name: old?.name ?? next.name, notes: old?.notes ?? next.notes, importance_threshold: old?.importance_threshold ?? next.importance_threshold }, actionWorkspace));
  }
  function selectForReview(reference: ScenarioSelectionRef) {
    if (!reviewRef.current) return;
    try { setReview(selectReviewScenario(reviewRef.current, scenarioRef.current, reference)); setFilterError(""); }
    catch { setFilterError("此方案與會議的資料或範圍不同。請回經營總覽，明確更新會議資料／範圍後再選用。"); }
  }
  const visible = active && (status === "ready" || status === "partial");
  const local = active?.dataset.manifest.source_type === "user_provided";
  const currentContext = scenarioWorkspace.contexts.find(context => context.status === "current" && context.session.filter_hash === active?.snapshot.filter_hash);
  const decision = currentContext ? scenarioContextDecision(currentContext) : emptyDecisionWorkspace();
  const backupSource: WorkspaceBackupSource | null = active ? { input: active.input, filters: active.snapshot.report.scope, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, decision, action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: reviewSession } : null;
  useEffect(() => { backupRef.current = backupSource; });
  const restoreRef = useRef(performRestore);
  useEffect(() => { restoreRef.current = performRestore; });
  const moreMenu = useRef<HTMLDetailsElement>(null);

  // HF-05: write the current workspace after each change, serialised so only one write runs.
  const runAutosave = useCallback(async () => {
    if (autosaveBusy.current) { autosaveAgain.current = true; return; }
    autosaveBusy.current = true;
    try {
      do {
        autosaveAgain.current = false;
        const target = versionRef.current;
        const source = backupRef.current;
        if (!readAutosaveConsent()) return;
        if (source) {
          const text = await exportWorkspaceBackup(source);
          if (!readAutosaveConsent()) return;
          const record = await saveAutosaveWorkspace(text);
          setLastSavedAt(record.saved_at);
        } else {
          await clearAutosaveWorkspace();
          setLastSavedAt(null);
        }
        setAutosavedVersion(target); setAutosaveError("");
      } while (autosaveAgain.current);
    } catch {
      setAutosaveError("自動保存未完成：瀏覽器可能不允許儲存或容量不足。目前分頁資料仍保留，可先下載完整工作區備份。");
    } finally { autosaveBusy.current = false; }
  }, []);
  useEffect(() => {
    if (!autosave || autosavedVersion === version) return;
    const timer = window.setTimeout(() => { void runAutosave(); }, 400);
    return () => window.clearTimeout(timer);
  }, [autosave, autosavedVersion, version, runAutosave]);
  // HF-05: reopen restores the consented autosave copy after full validation and recalculation.
  useEffect(() => {
    if (!readAutosaveConsent()) return;
    let cancelled = false;
    const ticket = requestId.current;
    void loadAutosaveWorkspace().then(async record => {
      if (cancelled) return;
      setAutosave(true); setAutosaveAnswered(true);
      if (!record) return;
      const workspace = await restoreWorkspaceBackup(record.text);
      if (cancelled || ticket !== requestId.current) return;
      const restoredVersion = restoreRef.current(workspace, false);
      setAutosavedVersion(restoredVersion); setLastSavedAt(record.saved_at);
      setAutosaveNotice(`已自動恢復 ${formatSavedClock(record.saved_at)} 保存的工作區。`);
    }).catch(() => {
      if (cancelled) return;
      setAutosave(true); setAutosaveAnswered(true);
      setAutosaveError("上次自動保存的工作區無法讀取或驗證，未載入任何資料。可重新載入資料，或在「工作區保存與恢復」刪除本機副本並關閉保存。");
    });
    return () => { cancelled = true; };
  }, []);
  function acceptAutosave() {
    setAutosaveAnswered(true);
    if (!grantAutosaveConsent()) { setAutosaveError("這個瀏覽器不允許保存，資料仍只留在此分頁。可改用「下載完整工作區備份」。"); return; }
    setAutosaveError(""); setAutosave(true);
  }
  function stopAutosave() {
    revokeAutosaveConsent();
    setAutosave(false); setAutosaveAnswered(true); setAutosavedVersion(null); setLastSavedAt(null); setAutosaveNotice(""); setAutosaveError("");
  }
  const saveLabel = autosave
    ? autosaveError ? "保存失敗" : active && !autosaveCurrent ? "保存中…" : lastSavedAt ? `已保存 ${formatSavedClock(lastSavedAt)}` : "自動保存已開啟"
    : active ? "未保存（僅此分頁）" : null;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <aside className="sidebar">
      <a className="brand" href="#main-content"><span className="brand-mark"><Icon name="lens" size={24} /></span><span>ProfitLens<small>營運決策工作台</small></span></a>
      <div className="workspace-label">我的工作區 <span className="tiny-tag">{local ? "匯入" : "合成"}</span></div>
      <nav aria-label="主要導覽">{panels.map(item => <button key={item.id} className={`nav-item ${panel === item.id ? "active" : ""}`} aria-current={panel === item.id ? "page" : undefined} onClick={() => { setPanel(item.id); setEvidence(null); }}><Icon name={item.id} /><span>{item.label}</span>{panel === item.id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="green-dot" /> {local ? "本機匯入資料" : "合成資料示範"}<p>{local ? "預設只留此分頁；主動保存才存本機，不上傳伺服器。" : "資料只用於功能驗證，不代表真實商業成果。"}</p></div>
      <footer className="sidebar-footer">新臺幣 · 臺北時間</footer>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作區 <span>/</span> <strong>{currentPanel.label}</strong></div><div className="topbar-badges">{saveLabel && <span className={`save-badge ${autosave && !autosaveError ? "on" : "off"}`} data-testid="save-status" aria-live="polite">{saveLabel}</span>}<span className="mode-badge"><span className="green-dot" /> {aiCapability?.reason === "PUBLIC_DEMO" ? "公開示範模式" : local ? "瀏覽器匯入資料" : "合成資料工作區"}</span></div></header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">營運檢討工作台</p><h1>{currentPanel.label}</h1><p className="subtitle">{currentPanel.description}</p></div><div className="load-controls">{!active && (status !== "empty" || showImport) && panel !== "validation" && <button className="button primary" onClick={() => void load("demo")}>載入示範資料 <Icon name="arrow" size={16} /></button>}<button className="button quiet" onClick={startImport}>匯入標準 CSV</button>{active && panel !== "validation" && <details className="more-menu" ref={moreMenu} data-testid="more-menu"><summary className="button quiet">更多</summary><div className="more-menu-items"><button type="button" className="button quiet" onClick={() => { if (moreMenu.current) moreMenu.current.open = false; void load("demo"); }}>載入示範資料</button><p className="note">會取代目前資料；未另存的工作稿會先提醒。</p></div></details>}</div></div>
        <div className="ai-availability" data-testid="ai-availability" role="status" aria-live="polite">
          <strong>規則診斷可用｜{aiCapability === null ? "正在確認即時 AI 設定" : aiCapability.available ? "即時 AI 需預覽同意" : aiCapability.reason === "STATUS_UNAVAILABLE" ? "即時 AI 狀態未確認" : "即時 AI 未啟用"}</strong>
          <p>{aiCapability?.reason === "PUBLIC_DEMO" ? "公開版已關閉模型連線。載入資料後，計算、診斷、試算與本機匯出仍可使用。" : aiCapability?.available ? "僅在預覽同意後才會送出彙總資料；請到通路診斷查看本次狀態與來源。" : "載入資料後即可查看可追溯的診斷與試算；目前未傳送分析資料給模型。"}</p>
        </div>
        {panel === "validation" && <section className="panel validation-panel" aria-labelledby="validation-heading" data-testid="validation-panel">
          <h2 id="validation-heading">合成資料驗證案例</h2>
          <p>僅供對帳與檢查缺漏處理，不代表真實營運成果。切換此頁不改變目前資料；按下載入才會檢核並取代工作區資料。</p>
          <div className="validation-controls"><label>資料集<select aria-label="資料集" value={selected} onChange={event => setSelected(event.target.value)}>{Object.entries(datasetLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="button primary" onClick={() => void load(selected)}>載入資料集 <Icon name="arrow" size={16} /></button></div>
          <ul className="validation-descriptions"><li>營運示範：跨通路的合成資料，可練習完整檢討流程。</li><li>Golden：小型固定對帳資料，供核對公式與來源。</li><li>缺漏案例：收入可算；缺成本或廣告費的相關貢獻保持未知。</li><li>重複鍵案例：故意不良資料，應阻擋載入並保留先前成功資料。</li></ul>
          <p className="note">成功載入後返回經營總覽。舊方案保留歷史版本；舊行動會明示引用較早資料，仍可更新執行進度。未保存的資料請先備份。</p>
        </section>}
        <div className="status-line" role="status" aria-live="polite" data-testid="workspace-status"><span className={`status-dot ${status}`} />{({ empty: "尚未載入資料", loading: "正在載入與計算…", error: "資料載入失敗", partial: "部分資料待補", ready: "資料已就緒" })[status]}{active && status !== "empty" && <span className="muted">{datasetLabels[active.id] ?? active.dataset.manifest.dataset_id} · 資料截至 {active.dataset.manifest.data_as_of}</span>}<button className="text-button clear-button" onClick={clear}>清空工作區</button></div>
        {active && !autosave && !autosaveAnswered && <section className="autosave-prompt" aria-labelledby="autosave-prompt-heading" data-testid="autosave-prompt">
          <h2 id="autosave-prompt-heading">要把資料存在這台電腦嗎？（不會上傳）</h2>
          <p>同意後，之後每次變更都會自動保存在這個瀏覽器，下次開啟自動恢復。資料不會上傳伺服器；共享電腦建議選「先不要」。可隨時在「工作區保存與恢復」刪除本機副本並關閉保存。</p>
          <div className="button-row"><button type="button" className="button primary" onClick={acceptAutosave}>存在這台電腦</button><button type="button" className="button quiet" onClick={() => setAutosaveAnswered(true)}>先不要</button></div>
        </section>}
        {autosaveNotice && <p className="note autosave-notice" data-testid="autosave-notice">{autosaveNotice}</p>}
        {autosaveError && <p role="alert" className="alert error" data-testid="autosave-error">{autosaveError}</p>}
        <WorkspaceStorage key={storageResetEpoch} source={backupSource} version={version} dirty={dirty} autosave={autosave} onBeforeDelete={stopAutosave} onRestore={restore} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onDeleted={() => { if (active) markChanged(); }} />
        {showImport && <div hidden={panel !== "data"}><ImportPanel onCommit={commitImport} onCancel={cancelImport} busy={status === "loading"} /></div>}
        {visible && <>
          <div className="filter-bar">
            <label className="channel-field">通路<select aria-label="通路" value={active.snapshot.report.scope.channels.length > 1 ? "" : active.snapshot.report.scope.channels[0]} onChange={event => void applyFilters({ ...active.snapshot.report.scope, channels: event.target.value === "" ? active.dataset.manifest.channels : [event.target.value] })}><option value="">全部通路</option>{active.dataset.manifest.channels.map(channel => <option key={channel}>{channel}</option>)}</select></label>
            <form className="period-form" onSubmit={submitDates}>
              <label className="comparison-mode">比較方式<select aria-label="比較方式" value={comparisonMode} onChange={event => setComparisonMode(event.target.value as ComparisonMode)}><option value="same_days">相同天數</option><option value="calendar_months">完整自然月</option></select></label>
              <fieldset><legend>前期</legend><label className="sr-only" htmlFor="previous-start">前期開始</label><input id="previous-start" type="date" required value={dates.previousStart} onChange={e => setDates({ ...dates, previousStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="previous-end">前期結束</label><input id="previous-end" type="date" required value={dates.previousEnd} onChange={e => setDates({ ...dates, previousEnd: e.target.value })} /></fieldset>
              <fieldset><legend>本期</legend><label className="sr-only" htmlFor="current-start">本期開始</label><input id="current-start" type="date" required value={dates.currentStart} onChange={e => setDates({ ...dates, currentStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="current-end">本期結束</label><input id="current-end" type="date" required value={dates.currentEnd} onChange={e => setDates({ ...dates, currentEnd: e.target.value })} /></fieldset>
              <button className="button quiet" type="submit">套用期間</button>
            </form>
          </div>
          {filterError && <p role="alert" className="alert error">{filterError}</p>}
          {status === "partial" && <div className="alert partial"><strong>部分資料待補</strong><span>受影響指標保留未知；不以零代替缺漏。</span><button className="text-button" onClick={() => setPanel("data")}>查看 {active.dataset.issues.length} 項來源問題 →</button></div>}
          <p className="scope-note">目前範圍：{active.snapshot.report.scope.channels.join("、")} · {active.snapshot.report.comparison.mode === "calendar_months" ? "完整自然月" : "相同天數"}（前期 {active.snapshot.report.comparison.previous_days} 天／本期 {active.snapshot.report.comparison.current_days} 天） · 資料截至 {active.snapshot.data_as_of} · 前期 {active.snapshot.report.previous.period.start} — {active.snapshot.report.previous.period.end} · 本期 {active.snapshot.report.current.period.start} — {active.snapshot.report.current.period.end}</p>
        </>}
        {status === "empty" && !showImport && panel !== "validation" && <section className="empty-state"><div className="empty-illustration"><Icon name="lens" size={56} /></div><p className="eyebrow">從一份完整的資料開始</p><h2>看清營收背後的貢獻</h2><p>載入銷售、通路費用與廣告的合成資料，<br />從整體變化一路追溯到每筆來源。</p><button className="button primary large" onClick={() => void load("demo")}>載入示範資料 <Icon name="arrow" size={18} /></button><div className="empty-steps"><span>01　確認資料</span><span>02　查看貢獻</span><span>03　追溯變化</span></div></section>}
        {status === "loading" && <section className="loading-state" aria-busy="true"><div className="spinner" /><h2>正在檢核資料與計算指標</h2><p>銷售先彙總，再合併通路費用與廣告。請稍候。</p><div className="skeleton-grid">{[0, 1, 2, 3].map(i => <div className="skeleton" key={i} />)}</div></section>}
        {status === "error" && <section className="error-state"><span className="error-icon">!</span><h2>資料載入失敗</h2><p role="alert">{error}</p><div className="button-row"><button className="button primary" onClick={() => void load(selected)}>重新載入</button>{active && <button className="button quiet" onClick={() => { setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready"); setIssues(active.dataset.issues); }}>返回前次成功資料</button>}</div>{issues.length > 0 && <IssueList issues={issues} />}</section>}
        {visible && <div key={active.id} className="view-content">{!["products", "scenarios", "actions", "validation"].includes(panel) && <div className="export-actions"><button className="button quiet" onClick={() => downloadText(exportSnapshotCsv(active.dataset, active.snapshot, active.filenames), "profitlens-analysis.csv")}>下載目前分析 CSV</button><button className="text-button" onClick={() => downloadText(JSON.stringify(active.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")}>下載資料集設定 JSON</button><span className="note">依目前期間與通路匯出；不含原始 CSV。</span></div>}{panel === "overview" && <><ReviewWorkbench source={active} scenarioWorkspace={scenarioWorkspace} review={reviewSession} onChange={setReview} actionWorkspace={actionWorkspace} onEvidence={reviewEvidence} onRefreshSource={refreshReviewSource} onCreateAction={(diagnostic, review) => void draftFromReview(diagnostic, review)} /><Overview snapshot={active.snapshot} onEvidence={setEvidence} /></>}{panel === "diagnosis" && <><Diagnosis snapshot={active.snapshot} onEvidence={setEvidence} onCreateAction={draftFromDiagnostic} /><AiPanel key={restoreEpoch} capability={aiCapability} snapshot={active.snapshot} revision={active.revision} onEvidence={setEvidence} /></>}{panel === "products" && <ProductComparisonPanel dataset={active.dataset} snapshot={active.snapshot} onEvidence={setEvidence} filenames={active.filenames} />}{panel === "data" && <DataWorkspace dataset={active.dataset} snapshot={active.snapshot} filenames={active.filenames} mappings={active.mappings} />}</div>}
        {active && <div hidden={!visible || panel !== "scenarios"}><MultiScenarioWorkbench source={active} state={scenarioWorkspace} setState={setScenarios} onExport={exportDecision} onEvidence={setEvidence} onSelectForReview={selectForReview} /></div>}
        {visible && panel === "actions" && <ActionsWorkbench workspace={actionWorkspace} onChange={setActionWorkspace} source={active} onEvidence={actionEvidence} onExport={exportDecision} />}
        <footer className="main-footer"><p>行銷後貢獻不等於公司淨利，不含未輸入的固定費與所得稅。</p><p>{local ? "本機記憶體資料" : "合成資料"} · {autosave ? "已開啟自動保存，重新整理後自動恢復" : "重新整理會清空分頁，已保存的備份須手動恢復"} · 規則診斷不需 AI</p></footer>
      </main>
    </div>
    {pendingReplacement && <ReplacementDialog intent={pendingReplacement} source={backupSource} autosave={autosave} currentVersion={() => versionRef.current} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onCancel={() => setPendingReplacement(null)} onProceed={() => {
      if (pendingReplacement.version !== versionRef.current) return;
      const run = pendingReplacement.run; setPendingReplacement(null); void run();
    }} />}
    {active && <EvidenceDrawer dataset={evidenceSource?.dataset ?? active.dataset} filenames={evidenceSource?.filenames ?? active.filenames} mappings={evidenceSource ? evidenceSource.mappings : active.mappings} evidence={evidence} onClose={() => setEvidence(null)} />}
  </div>;
}
