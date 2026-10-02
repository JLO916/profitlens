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
import { ImportWizard } from "./import-wizard";
import { clearWizardMemory, exampleTemplateUrl, FILE_ROLES } from "@/application/import-wizard";
import { standardCsvTemplate } from "@/application/import-guidance";
import type { RawValuesByFile, TaxConversion } from "@/application/tax-basis";
import type { PreparedImport } from "@/application/import";
import { downloadText } from "@/application/download";
import { exportIssuesCsv, exportSnapshotCsv } from "@/application/export";
import { buildManagerSummary, exportChannelComparisonCsv } from "@/application/manager-summary";
import { periodPresets, type PeriodPreset } from "@/application/period-presets";
import { fill, labels } from "@/i18n";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { AnalysisChannelLimitError, AnalysisPeriodLimitError } from "@/application/limits";
import { MultiScenarioWorkbench } from "./multi-scenario-workbench";
import { ReviewWorkbench } from "./review-workbench";
import { activateScenarioEpoch, emptyScenarioWorkspace, scenarioContextDecision, resolveScenarioReference, type ScenarioWorkspace, type ScenarioSelectionRef } from "@/application/scenario-workspace";
import { createReviewSession, refreshReviewSession, syncReviewPins, selectReviewScenario, rebuildReviewSnapshot, updateReviewSession, type ReviewDecisionState, type ReviewSession } from "@/application/review-session";
import { exportWorkspaceDecision } from "@/application/workspace-decision-export";
import { decisionSignature, emptyDecisionWorkspace } from "@/application/decision";
import type { RestoredWorkspace, WorkspaceBackupSource } from "@/application/workspace-backup";
import { ReplacementDialog, type PendingReplacement } from "./replacement-dialog";
import { BasisDialog } from "./basis-dialog";
import { beginReplacement, type ReplacementKind } from "@/application/replacement-guard";
import { WorkspaceStorage } from "./workspace-storage";
import { ActionsWorkbench } from "./actions-workbench";
import { ProductComparisonPanel } from "./product-comparison-panel";
import { emptyActionWorkspace, refreshActionWorkspace, addActionDraft, type ActionWorkspace, type ActionContext } from "@/application/action-workspace";

type Panel = "overview" | "diagnosis" | "products" | "data" | "scenarios" | "actions" | "validation";
type Status = "empty" | "loading" | "error" | "partial" | "ready";
type Active = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>; conversion?: TaxConversion | null; raw_values?: RawValuesByFile };
// R2：導覽、資料集名稱與決議標籤都從 labels 取字；id／value 維持機器值。
const panelIds: Panel[] = ["overview", "diagnosis", "products", "scenarios", "actions", "data", "validation"];
const panels: { id: Panel; label: string; description: string }[] = panelIds.map(id => ({ id, label: labels.nav[id].label, description: labels.nav[id].description }));
const datasetLabels: Record<string, string> = {
  demo: labels.ui.dashboard.datasets.demo, golden: labels.ui.dashboard.datasets.golden,
  "missing-cogs": labels.ui.dashboard.datasets.missingCogs, "missing-ad": labels.ui.dashboard.datasets.missingAd, duplicate: labels.ui.dashboard.datasets.duplicate,
};
const decisionLabelKey: Record<ReviewDecisionState, keyof typeof labels.meeting.decisions> = { draft: "draft", adopted: "adopted", needs_data: "need_data", not_adopted: "rejected" };
// 日期欄位的 sr-only 標籤「上期開始」等。labels.ui.dashboard.filter.periodStart/periodEnd 的模板值帶著「→ 範例」尾巴（盤點筆記誤入字典），
// 直接填入會念成「上期開始 → 上期開始」；這裡只取箭頭前的模板，待字典修正後此處不必再改。
const periodFieldLabel = (edge: "start" | "end", period: string) => fill((edge === "start" ? labels.ui.dashboard.filter.periodStart : labels.ui.dashboard.filter.periodEnd).split(" → ")[0], { period });
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
  // R3：舊版單頁匯入面板只在網址帶 #legacy-import 時掛載（R4 刪除）；本機保存同意由這裡保存，供儲存面板與匯入精靈的對照記憶共用。
  const [legacyImport, setLegacyImport] = useState(false);
  const [localConsent, setLocalConsent] = useState(false);
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
  useEffect(() => {
    if (!dirty && !showImport) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, showImport]);
  const [evidence, setEvidenceState] = useState<EvidenceSelection | null>(null);
  const [evidenceSource, setEvidenceSource] = useState<(Pick<Active, "dataset" | "filenames" | "mappings"> & { dataset_hash?: string }) | null>(null);
  function setEvidence(selection: EvidenceSelection | null) { setEvidenceSource(null); setEvidenceState(selection); }
  function actionEvidence(selection: EvidenceSelection, context: ActionContext) {
    const historical = validateDataset(context.source_input).dataset;
    if (!historical) return;
    setEvidenceSource({ dataset: historical, filenames: context.session.filenames, mappings: context.source_mappings, dataset_hash: context.session.dataset_hash });
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
  const [aiOpen, setAiOpen] = useState(false);
  // Collapsed overview sections keep their open state across filter reloads and page switches.
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [basisOpen, setBasisOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const firstPanel = useRef(true);
  // R1-6: every page switch starts at the top with focus on the main landmark.
  useEffect(() => {
    if (firstPanel.current) { firstPanel.current = false; return; }
    window.scrollTo({ top: 0 });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [panel]);
  // Top-bar menus and the AI popover close on outside click or Escape.
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      const target = event.target instanceof Node ? event.target : null;
      // Modal dialogs (replacement guard, evidence drawer) sit above the menus; interacting with them keeps the menu open.
      if (target instanceof Element && target.closest("dialog")) return;
      if (event instanceof KeyboardEvent) {
        for (const menu of document.querySelectorAll<HTMLDetailsElement>(".topbar-menu[open]")) { const inside = menu.contains(document.activeElement); menu.open = false; if (inside) menu.querySelector<HTMLElement>(":scope > summary")?.focus(); }
        setAiOpen(open => { if (open) aiButtonRef.current?.focus(); return false; });
        return;
      }
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(".topbar-menu.auto-close[open]")) if (!target || !menu.contains(target)) menu.open = false;
      if (!target || !aiRef.current?.contains(target)) setAiOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, []);

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
      if (!response.ok) throw new Error(labels.ui.dashboard.errors.fetchFailed);
      const input: DatasetInput = await response.json();
      await afterPaint();
      if (ticket !== requestId.current) return;
      const validation = validateDataset(input);
      if (!validation.dataset) { setIssues(validation.issues); throw new Error(labels.ui.dashboard.errors.validationFailed); }
      const snapshot = await createSnapshot(validation.dataset, {}, await hashInput(input));
      if (ticket !== requestId.current) return;
      activate({ input, dataset: validation.dataset, snapshot, id, revision: ++revision.current }); setIssues(validation.issues);
      setComparisonMode(snapshot.report.scope.comparison_mode); markChanged();
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setStatus(validation.classification === "partial" ? "partial" : "ready"); setPanel("overview");
    } catch (caught) {
      if (ticket !== requestId.current || abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : labels.ui.dashboard.errors.processingFailed); setStatus("error");
    }
  }
  function startImport() {
    requestId.current++; controller.current?.abort(); setEvidence(null); setError(""); setFilterError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
    setLegacyImport(window.location.hash === "#legacy-import");
    setPanel("data"); setShowImport(true);
  }
  function cancelImport() {
    requestId.current++; controller.current?.abort(); setShowImport(false); setError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
  }
  async function commitImport(prepared: PreparedImport, manifestName?: string, afterCommit?: () => void) {
    if (!prepared.input || !prepared.validation.dataset || prepared.validation.classification === "blocking") return;
    requestReplacement("import", () => performCommitImport(prepared, manifestName, afterCommit));
  }
  async function performCommitImport(prepared: PreparedImport, manifestName?: string, afterCommit?: () => void) {
    if (!prepared.input || !prepared.validation.dataset || prepared.validation.classification === "blocking") return;
    const ticket = ++requestId.current;
    controller.current?.abort(); setStatus("loading"); setEvidence(null); setError(""); setFilterError("");
    try {
      await afterPaint();
      const dataset = prepared.validation.dataset;
      const snapshot = await createSnapshot(dataset, {}, await hashInput(prepared.input));
      if (ticket !== requestId.current) return;
      activate({ input: prepared.input, dataset, snapshot, id: `import-${snapshot.dataset_hash}`, revision: ++revision.current, mappings: prepared.columnMappings, filenames: { ...prepared.originalNames, ...(manifestName ? { "manifest.json": manifestName } : {}) }, conversion: prepared.conversion, raw_values: prepared.raw_values });
      setComparisonMode(snapshot.report.scope.comparison_mode); markChanged();
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setIssues(prepared.validation.issues);
      setStatus(prepared.validation.classification === "partial" ? "partial" : "ready");
      setShowImport(false); setPanel("overview");
      afterCommit?.();
    } catch {
      if (ticket !== requestId.current) return;
      setError(labels.ui.dashboard.errors.importIncomplete); setStatus("error");
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
      setFilterError(caught instanceof AnalysisPeriodLimitError || caught instanceof AnalysisChannelLimitError ? caught.message : labels.ui.dashboard.errors.periodNotApplied);
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    }
  }
  // R1-3: presets only fill the form; applyFilters still waits for an explicit submit.
  function choosePreset(preset: PeriodPreset) {
    if (preset.status !== "ready") return;
    setComparisonMode(preset.comparison_mode);
    setDates({ previousStart: preset.previous.start, previousEnd: preset.previous.end, currentStart: preset.current.start, currentEnd: preset.current.end });
    requestAnimationFrame(() => applyRef.current?.focus());
  }
  function submitDates(event: FormEvent) {
    event.preventDefault();
    if (active) void applyFilters({ comparison_mode: comparisonMode, channels: active.snapshot.report.scope.channels, previous_period: { start: dates.previousStart, end: dates.previousEnd }, current_period: { start: dates.currentStart, end: dates.currentEnd } });
  }
  function clear() { requestReplacement("clear", performClear); }
  function performClear() {
    storeScenarios(emptyScenarioWorkspace()); storeReview(null); storeActions(emptyActionWorkspace()); setSavedVersion(versionRef.current);
    // 清空工作區也重設本機保存同意（與 R2 以前儲存面板自己重掛載的行為一致）；對照記憶的 IndexedDB 寫入隨之停止。
    setStorageResetEpoch(value => value + 1); setLocalConsent(false);
    requestId.current++; controller.current?.abort(); setActive(null); setIssues([]); setEvidence(null);
    setStatus("empty"); setError(""); setFilterError(""); setShowImport(false);
  }
  function restore(workspace: RestoredWorkspace, accepted?: () => void) {
    requestReplacement("restore", () => { performRestore(workspace); accepted?.(); });
  }
  function performRestore(workspace: RestoredWorkspace) {
    requestId.current++; controller.current?.abort(); setEvidence(null);
    revision.current = Math.max(revision.current, workspace.revision);
    setActive({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, id: workspace.id, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings });
    storeScenarios(workspace.scenario_workspace); storeReview(workspace.review_session ?? syncReviewPins(createReviewSession({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings }, workspace.scenario_workspace.active_epoch), workspace.action_workspace)); storeActions(workspace.action_workspace); setIssues(workspace.issues);
    setComparisonMode(workspace.snapshot.report.scope.comparison_mode);
    setDates({ previousStart: workspace.snapshot.report.previous.period.start, previousEnd: workspace.snapshot.report.previous.period.end, currentStart: workspace.snapshot.report.current.period.start, currentEnd: workspace.snapshot.report.current.period.end });
    const next = ++versionRef.current; setVersion(next); setSavedVersion(next);
    setRestoreEpoch(value => value + 1); setShowImport(false); setError(""); setFilterError(""); setPanel("overview");
    setStatus(workspace.classification === "partial" ? "partial" : "ready");
  }
  function draftFromDiagnostic(diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number]) {
    if (!active) return;
    setActionWorkspace(addActionDraft(actionWorkspace, active, crypto.randomUUID(), diagnostic.id));
    setPanel("actions"); setEvidence(null);
  }
  function exportDecision(format: "md" | "csv" | "json") {
    if (!active) return;
    const body = exportWorkspaceDecision(format, active, scenarioWorkspace, actionWorkspace, reviewSession, active.conversion ?? null);
    downloadText(body, `profitlens-decision.${format}`, format === "json" ? "application/json;charset=utf-8" : format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8");
  }
  function reviewEvidence(selection: EvidenceSelection, review: ReviewSession) {
    const dataset = validateDataset(review.source_input).dataset;
    if (!dataset) return;
    setEvidenceSource({ dataset, filenames: review.filenames, mappings: review.source_mappings, dataset_hash: review.dataset_hash }); setEvidenceState(selection);
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
    } catch { if (ticket === requestId.current) setFilterError(labels.ui.dashboard.errors.reviewRebuildFailed); }
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
    catch { setFilterError(fill(labels.ui.dashboard.errors.scenarioScopeMismatch, { overview: labels.nav.overview.label, updateMeeting: labels.buttons.updateMeetingSource })); }
  }
  const visible = active && (status === "ready" || status === "partial");
  const local = active?.dataset.manifest.source_type === "user_provided";
  const currentContext = scenarioWorkspace.contexts.find(context => context.status === "current" && context.session.filter_hash === active?.snapshot.filter_hash);
  const decision = currentContext ? scenarioContextDecision(currentContext) : emptyDecisionWorkspace();
  const presets = active ? periodPresets(active.dataset.manifest) : [];
  const presetMatches = (preset: PeriodPreset) => preset.status === "ready" && preset.comparison_mode === comparisonMode && preset.previous.start === dates.previousStart && preset.previous.end === dates.previousEnd && preset.current.start === dates.currentStart && preset.current.end === dates.currentEnd;
  const alias = active ? demoAlias(active.dataset.manifest.dataset_id) : false;
  const statusText = labels.status[status];
  const aiHeadline = aiCapability === null ? labels.status.aiUnknown : aiCapability.available ? labels.status.aiNeedsConsent : aiCapability.reason === "STATUS_UNAVAILABLE" ? labels.status.aiUnknown : aiCapability.reason === "PUBLIC_DEMO" ? labels.status.aiOff : labels.status.aiDisabled;
  // 03 §9：關閉狀態的說明只留一句（併入 AI popover）。
  const aiDetail = aiCapability?.available ? labels.ui.dashboard.aiDetail.consent : aiCapability?.reason === "PUBLIC_DEMO" ? labels.ui.dashboard.aiDetail.publicDemo : labels.ui.dashboard.aiDetail.off;
  const backupSource: WorkspaceBackupSource | null = active ? { input: active.input, filters: active.snapshot.report.scope, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, decision, action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: reviewSession } : null;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{labels.ui.dashboard.skipLink}</a>
    <aside className="sidebar">
      <a className="brand" href="#main-content"><span className="brand-mark"><Icon name="lens" size={24} /></span><span>{labels.brand.name}<small>{labels.brand.tagline}</small></span></a>
      <div className="workspace-label">{labels.ui.dashboard.workspaceLabel} <span className="tiny-tag">{local ? labels.status.local : labels.status.demo}</span></div>
      <nav aria-label={labels.ui.dashboard.mainNavAria}>{panels.map(item => <button key={item.id} className={`nav-item ${panel === item.id ? "active" : ""}`} aria-current={panel === item.id ? "page" : undefined} onClick={() => { setPanel(item.id); setEvidence(null); }}><Icon name={item.id} /><span>{item.label}</span>{panel === item.id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="green-dot" /> {local ? labels.status.local : labels.status.demo}<p>{local ? labels.ui.dashboard.sidebarNote.local : labels.ui.dashboard.sidebarNote.demo}</p></div>
      <footer className="sidebar-footer">{labels.ui.dashboard.sidebarFooter}</footer>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb">{labels.ui.dashboard.breadcrumbRoot} <span>/</span> <strong>{currentPanel.label}</strong></div>
        <div className="status-line" role="status" aria-live="polite" data-testid="workspace-status"><span className={`status-dot ${status}`} />{statusText}{active && status !== "empty" && <span className="muted">{fill(labels.ui.dashboard.statusDataset, { dataset: datasetLabels[active.id] ?? active.dataset.manifest.dataset_id, date: active.dataset.manifest.data_as_of })}</span>}<button className="text-button clear-button" onClick={clear}>{labels.buttons.clear}</button></div>
        <div className="topbar-actions">
          <span className="mode-badge"><span className="green-dot" /> {aiCapability?.reason === "PUBLIC_DEMO" ? labels.ui.dashboard.modeBadge.publicDemo : local ? labels.status.local : labels.status.demo}</span>
          <button type="button" className="button quiet basis-button" onClick={() => setBasisOpen(true)} aria-haspopup="dialog" aria-label={labels.buttons.basis}><span aria-hidden="true">ⓘ</span><span className="basis-text">{labels.buttons.basis}</span></button>
          <div className="ai-availability" data-testid="ai-availability" role="status" aria-live="polite" ref={aiRef}>
            <button ref={aiButtonRef} type="button" className="ai-label" aria-expanded={aiOpen} aria-controls="ai-availability-detail" onClick={() => setAiOpen(open => !open)}><strong>{fill(labels.ui.dashboard.aiLabel, { ai: aiHeadline })}</strong></button>
            <div id="ai-availability-detail" className="ai-popover" role="region" aria-label={labels.sections.aiDetail} hidden={!aiOpen}><p>{aiDetail}</p></div>
          </div>
        </div>
        <WorkspaceStorage key={storageResetEpoch} source={backupSource} version={version} dirty={dirty} onRestore={restore} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onDeleted={() => { void clearWizardMemory(); if (active) markChanged(); }} consent={localConsent} onConsentChange={setLocalConsent} />
        <details className="topbar-menu auto-close download-menu" data-testid="download-menu">
            <summary>{labels.buttons.download}</summary>
            <div className="menu-panel">{visible ? <div className="menu-list">
              <p className="menu-section">{labels.sections.downloadCurrentView}</p>
              <div className="menu-item"><button type="button" onClick={() => downloadText(exportSnapshotCsv(active.dataset, active.snapshot, active.filenames, active.conversion ?? null), "profitlens-analysis.csv")}>{labels.downloads.analysisCsv}</button><small>{labels.downloads.analysisCsvHint}</small></div>
              <button type="button" onClick={() => downloadText(exportChannelComparisonCsv(buildManagerSummary(active.snapshot, { conversion: active.conversion })), "profitlens-channel-comparison.csv")}>{labels.downloads.channelTableCsv}</button>
              <button type="button" onClick={() => downloadText(JSON.stringify(active.dataset.manifest, null, 2), "profitlens-manifest.json", "application/json;charset=utf-8")}>{labels.downloads.manifestJson}</button>
              {active.dataset.issues.length > 0 && <div className="menu-item"><button type="button" onClick={() => downloadText(exportIssuesCsv(active.dataset.issues, active.filenames), "profitlens-issues.csv")}>{labels.downloads.issuesCsv}</button><small>{labels.downloads.issuesCsvHint.replace("{n}", String(active.dataset.issues.length))}</small></div>}
              <p className="menu-section">{labels.sections.downloadDecision}</p>
              <button type="button" onClick={() => exportDecision("md")}>{labels.downloads.decisionMd}</button>
              <button type="button" onClick={() => exportDecision("csv")}>{labels.downloads.decisionCsv}</button>
              <button type="button" onClick={() => exportDecision("json")}>{labels.downloads.decisionJson}</button>
              <p className="menu-note">{labels.downloads.menuNote}</p>
            </div> : <p className="menu-note">{labels.status.empty}；{labels.downloads.menuEmpty}</p>}
            <div className="menu-section" data-testid="download-templates"><p className="menu-heading">{labels.downloads.templatesHeading}</p>{FILE_ROLES.map(role => { const file = labels.importWizard.files[role === "sales_daily.csv" ? "sales" : role === "channel_costs_daily.csv" ? "costs" : "ads"]; return <div key={role} className="menu-item"><button type="button" onClick={() => downloadText(standardCsvTemplate(role), role)}>{fill(labels.downloads.blankTemplate, { file })}</button><a href={exampleTemplateUrl(role)} download={role}>{fill(labels.downloads.exampleTemplate, { file })}</a></div>; })}</div></div>
        </details>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">{labels.brand.tagline}</p><h1>{currentPanel.label}</h1><p className="subtitle">{currentPanel.description}</p></div><div className="load-controls">{panel === "data" && (status !== "empty" || showImport) && <button className="button primary" onClick={() => void load("demo")}>{labels.buttons.loadDemo} <Icon name="arrow" size={16} /></button>}<button className="button quiet" onClick={startImport}>{labels.buttons.importData}</button></div></div>
        {panel === "validation" && <section className="panel validation-panel" aria-labelledby="validation-heading" data-testid="validation-panel">
          <h2 id="validation-heading">{labels.ui.dashboard.validation.heading}</h2>
          <p>{labels.ui.dashboard.validation.intro}</p>
          <div className="validation-controls"><label>{labels.ui.dashboard.validation.datasetLabel}<select aria-label={labels.ui.dashboard.validation.datasetLabel} value={selected} onChange={event => setSelected(event.target.value)}>{Object.entries(datasetLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="button primary" onClick={() => void load(selected)}>{labels.ui.dashboard.validation.loadButton} <Icon name="arrow" size={16} /></button></div>
          <ul className="validation-descriptions"><li>{labels.ui.dashboard.validation.descriptions.demo}</li><li>{labels.ui.dashboard.validation.descriptions.golden}</li><li>{labels.ui.dashboard.validation.descriptions.missing}</li><li>{labels.ui.dashboard.validation.descriptions.duplicate}</li></ul>
          <p className="note">{labels.ui.dashboard.validation.note}</p>
        </section>}
        {showImport && <div hidden={panel !== "data"}>{legacyImport ? <div id="legacy-import"><ImportPanel onCommit={commitImport} onCancel={cancelImport} busy={status === "loading"} /></div> : <ImportWizard onCommit={commitImport} onCancel={cancelImport} busy={status === "loading"} localSaveConsented={localConsent} />}</div>}
        {visible && <>
          <div className="filter-bar">
            <label className="channel-field">{labels.ui.dashboard.filter.channel}<select aria-label={labels.ui.dashboard.filter.channel} value={active.snapshot.report.scope.channels.length > 1 ? "" : active.snapshot.report.scope.channels[0]} onChange={event => void applyFilters({ ...active.snapshot.report.scope, channels: event.target.value === "" ? active.dataset.manifest.channels : [event.target.value] })}><option value="">{labels.ui.dashboard.filter.allChannels}</option>{active.dataset.manifest.channels.map(channel => <option key={channel} value={channel}>{channelLabel(channel, alias)}</option>)}</select></label>
            <div className="preset-row" role="group" aria-label={labels.sections.presetGroup}>{presets.map(preset => <button key={preset.id} type="button" className="preset" aria-disabled={preset.status !== "ready" || undefined} aria-describedby={preset.status === "ready" ? undefined : `preset-reason-${preset.id}`} title={preset.status === "ready" ? undefined : preset.reason} aria-pressed={presetMatches(preset)} onClick={() => choosePreset(preset)}>{preset.label}</button>)}{presets.filter(preset => preset.status !== "ready").map(preset => <span key={preset.id} id={`preset-reason-${preset.id}`} className="sr-only">{fill(labels.ui.dashboard.filter.presetReason, { preset: preset.label, reason: preset.status === "unavailable" ? preset.reason : "" })}</span>)}<span className="note">{labels.periods.presetHint}</span></div>
            <form className="period-form" onSubmit={submitDates}>
              <label className="comparison-mode">{labels.ui.dashboard.filter.comparisonMode}<select aria-label={labels.ui.dashboard.filter.comparisonMode} value={comparisonMode} onChange={event => setComparisonMode(event.target.value as ComparisonMode)}><option value="same_days">{labels.periods.sameDays}</option><option value="calendar_months">{labels.periods.calendarMonths}</option></select></label>
              <fieldset><legend>{labels.periods.previous}</legend><label className="sr-only" htmlFor="previous-start">{periodFieldLabel("start", labels.periods.previous)}</label><input id="previous-start" type="date" required value={dates.previousStart} onChange={e => setDates({ ...dates, previousStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="previous-end">{periodFieldLabel("end", labels.periods.previous)}</label><input id="previous-end" type="date" required value={dates.previousEnd} onChange={e => setDates({ ...dates, previousEnd: e.target.value })} /></fieldset>
              <fieldset><legend>{labels.periods.current}</legend><label className="sr-only" htmlFor="current-start">{periodFieldLabel("start", labels.periods.current)}</label><input id="current-start" type="date" required value={dates.currentStart} onChange={e => setDates({ ...dates, currentStart: e.target.value })} /><span>—</span><label className="sr-only" htmlFor="current-end">{periodFieldLabel("end", labels.periods.current)}</label><input id="current-end" type="date" required value={dates.currentEnd} onChange={e => setDates({ ...dates, currentEnd: e.target.value })} /></fieldset>
              <button ref={applyRef} className="button quiet" type="submit">{labels.buttons.apply}</button>
            </form>
          </div>
          {filterError && <p role="alert" className="alert error">{filterError}</p>}
          {status === "partial" && <div className="alert partial"><strong>{labels.status.partial}</strong><span>{labels.ui.dashboard.partialNote}</span><button className="text-button" onClick={() => setPanel("data")}>{fill(labels.ui.dashboard.viewIssues, { n: active.dataset.issues.length })}</button></div>}
          <p className="scope-note">{fill(labels.ui.dashboard.scopeNote, { channels: channelsLabel(active.snapshot.report.scope.channels, alias), mode: active.snapshot.report.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays, previousDays: active.snapshot.report.comparison.previous_days, currentDays: active.snapshot.report.comparison.current_days, dataAsOf: active.snapshot.data_as_of, previousStart: active.snapshot.report.previous.period.start, previousEnd: active.snapshot.report.previous.period.end, currentStart: active.snapshot.report.current.period.start, currentEnd: active.snapshot.report.current.period.end })}</p>
        </>}
        {status === "empty" && !showImport && panel !== "validation" && <section className="empty-state"><div className="empty-illustration"><Icon name="lens" size={56} /></div><p className="eyebrow">{labels.emptyState.eyebrow}</p><h2>{labels.emptyState.title}</h2><p>{labels.emptyState.body}</p><button className="button primary large" onClick={() => void load("demo")}>{labels.buttons.loadDemo} <Icon name="arrow" size={18} /></button><div className="empty-steps">{labels.emptyState.steps.map((step, index) => <span key={step}>{index + 1} {step}</span>)}</div></section>}
        {status === "loading" && <section className="loading-state" aria-busy="true"><div className="spinner" /><h2>{labels.ui.dashboard.loading.heading}</h2><p>{labels.ui.dashboard.loading.body}</p><div className="skeleton-grid">{[0, 1, 2, 3].map(i => <div className="skeleton" key={i} />)}</div></section>}
        {status === "error" && <section className="error-state"><span className="error-icon">!</span><h2>{labels.status.error}</h2><p role="alert">{error}</p><div className="button-row"><button className="button primary" onClick={() => void load(selected)}>{labels.ui.dashboard.errorState.retry}</button>{active && <button className="button quiet" onClick={() => { setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready"); setIssues(active.dataset.issues); }}>{labels.ui.dashboard.errorState.back}</button>}</div>{issues.length > 0 && <IssueList issues={issues} />}</section>}
        {visible && <div key={active.id} className="view-content">{panel === "overview" && <><Overview snapshot={active.snapshot} onEvidence={setEvidence} onCreateAction={draftFromDiagnostic} periodOpen={periodOpen} onPeriodToggle={setPeriodOpen} /><details className="panel overview-meeting" data-testid="overview-meeting" open={meetingOpen} onToggle={event => setMeetingOpen(event.currentTarget.open)}><summary>{labels.sections.meetingDraft}<span className="tag">{reviewSession ? labels.meeting.decisions[decisionLabelKey[reviewSession.decision_state]] : labels.sections.meetingNotCreated}</span></summary><ReviewWorkbench source={active} conversion={active.conversion} scenarioWorkspace={scenarioWorkspace} review={reviewSession} onChange={setReview} actionWorkspace={actionWorkspace} onEvidence={reviewEvidence} onRefreshSource={refreshReviewSource} onCreateAction={(diagnostic, review) => void draftFromReview(diagnostic, review)} /></details></>}{panel === "diagnosis" && <><Diagnosis snapshot={active.snapshot} onEvidence={setEvidence} onCreateAction={draftFromDiagnostic} /><AiPanel key={restoreEpoch} capability={aiCapability} snapshot={active.snapshot} revision={active.revision} onEvidence={setEvidence} /></>}{panel === "products" && <ProductComparisonPanel dataset={active.dataset} snapshot={active.snapshot} onEvidence={setEvidence} filenames={active.filenames} conversion={active.conversion} />}{panel === "data" && <DataWorkspace dataset={active.dataset} snapshot={active.snapshot} filenames={active.filenames} mappings={active.mappings} conversion={active.conversion} />}</div>}
        {active && <div hidden={!visible || panel !== "scenarios"}><MultiScenarioWorkbench source={active} state={scenarioWorkspace} setState={setScenarios} onExport={exportDecision} onEvidence={setEvidence} onSelectForReview={selectForReview} onChannelChange={channel => void applyFilters({ ...active.snapshot.report.scope, channels: [channel] })} /></div>}
        {visible && panel === "actions" && <ActionsWorkbench workspace={actionWorkspace} onChange={setActionWorkspace} source={active} onEvidence={actionEvidence} onExport={exportDecision} />}
        <footer className="main-footer"><p>{labels.basis.footer} → <button type="button" className="text-button" onClick={() => setBasisOpen(true)}>{labels.buttons.basis}</button></p></footer>
      </main>
    </div>
    {pendingReplacement && <ReplacementDialog intent={pendingReplacement} source={backupSource} currentVersion={() => versionRef.current} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onCancel={() => setPendingReplacement(null)} onProceed={() => {
      if (pendingReplacement.version !== versionRef.current) return;
      const run = pendingReplacement.run; setPendingReplacement(null); void run();
    }} />}
    {active && <EvidenceDrawer dataset={evidenceSource?.dataset ?? active.dataset} snapshot={evidenceSource ? undefined : active.snapshot} filenames={evidenceSource?.filenames ?? active.filenames} mappings={evidenceSource ? evidenceSource.mappings : active.mappings} rawValues={!evidenceSource || evidenceSource.dataset_hash === active.snapshot.dataset_hash ? active.raw_values : undefined} conversion={!evidenceSource || evidenceSource.dataset_hash === active.snapshot.dataset_hash ? active.conversion : null} evidence={evidence} onClose={() => setEvidence(null)} onBasis={() => setBasisOpen(true)} />}
    <BasisDialog open={basisOpen} onClose={() => setBasisOpen(false)} />
  </div>;
}
