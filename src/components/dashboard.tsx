"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, ComparisonMode, Dataset, DatasetInput, SourceRef, ValidationIssue } from "@/domain/types";
import { EvidenceDrawer, type EvidenceSelection } from "./evidence-drawer";
import { Overview } from "./overview";
// V4-3c：通路健檢、資料來源、AI 解釋、會議紀錄、商品毛利與待辦改成隨頁載入（lazy-panels.tsx 的同名包裝元件）；會議入口等首載要用的小工具在 meeting-entry.tsx。
import { ActionsWorkbench, AiPanel, DataWorkspace, Diagnosis, MeetingPage, ProductComparisonPanel, panelReady, preparePanel, schedulePanelPreload, usePanelReady } from "./lazy-panels";
import { AiCollapse } from "./ai-collapse";
import { getAiCapability, type AiCapability } from "@/application/ai-client";
import { ImportWizard } from "./import-wizard";
import { clearWizardMemory } from "@/application/import-wizard";
import { importedAtMinute } from "@/application/imported-at";
import type { RawValuesByFile, TaxConversion } from "@/application/tax-basis";
import { parseTargets, type TargetIssue, type TargetSet } from "@/application/targets";
import { parseEvents, type EventIssue, type EventSet } from "@/application/events";
import type { PreparedImport } from "@/application/import";
import { downloadText } from "@/application/download";
import { buildManagerSummary, exportManagerSummaryMarkdown } from "@/application/manager-summary";
import { periodPresets, type PeriodPreset } from "@/application/period-presets";
import { fill, labels } from "@/i18n";
import { channelLabel, channelsLabel, demoAlias, ruleCopy } from "@/application/copy";
import { AnalysisChannelLimitError, AnalysisPeriodLimitError } from "@/application/limits";
import { MultiScenarioWorkbench } from "./multi-scenario-workbench";
import { MeetingEntry, currentViewDecisionContext, downloadMeetingMarkdown } from "./meeting-entry";
import { PrintSummaryPortal, type PrintSummaryProps } from "./print-summary";
import { copyWeeklySummary } from "./overview/weekly-snapshot";
import { activateScenarioEpoch, emptyScenarioWorkspace, scenarioContextDecision, resolveScenarioReference, type ScenarioWorkspace, type ScenarioSelectionRef } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, refreshReviewScenarioReferences, refreshReviewSession, syncReviewPins, selectReviewScenario, rebuildReviewSnapshot, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { appendMeeting, finalizeMeeting, lastMeeting, removeMeeting, type Meeting } from "@/application/meeting";
import { DEFAULT_EXPORT_VARIANT, type ExportVariant } from "@/application/export-variants";
import { presentPeriodText, usePresentMode } from "./shell/present-mode";
import { compareProducts } from "@/domain/product-comparison";
import { decisionSignature, emptyDecisionWorkspace } from "@/application/decision";
import type { RestoredWorkspace, WorkspaceBackupSource } from "@/application/workspace-backup";
import { ReplacementDialog, type PendingReplacement } from "./replacement-dialog";
import { BasisDialog, type BasisDialogSection } from "./basis-dialog";
import { useWhatsNew, WhatsNewNote } from "./whats-new-note";
import { beginReplacement, type ReplacementKind } from "@/application/replacement-guard";
import { WorkspaceStorage } from "./workspace-storage";
import { emptyActionWorkspace, refreshActionWorkspace, addActionDraft, taipeiToday, type ActionWorkspace, type ActionContext } from "@/application/action-workspace";
import { track } from "@/application/analytics";
// V3-3 A1 imports（頂欄／側欄／頁尾／手機底部分頁列的子元件）
import { ShellFrame } from "./shell/shell-frame";
import { ExportMenu } from "./shell/export-menu";
import { PageHeader, ShellFooter } from "./shell/page-chrome";

// V3-3 A2 imports（期間列／橫幅／手機期間底部面板的子元件）
import { NeedsAttention, PeriodBar, presetFilters } from "./shell/period-bar";
// V3-8 C imports（首次進入／載入中／錯誤的頁面型容器）
import { ErrorState, FirstRunState, LoadingState, PanelErrorState, PanelLoadingState } from "./shell/page-states";


type Panel = "overview" | "diagnosis" | "products" | "data" | "scenarios" | "actions" | "meeting" | "validation";
type Status = "empty" | "loading" | "error" | "partial" | "ready";
type Active = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>; conversion?: TaxConversion | null; raw_values?: RawValuesByFile; targets?: TargetSet | null; events?: EventSet | null };
// R2：導覽、資料集名稱與決議標籤都從 labels 取字；id／value 維持機器值。
const panelIds: Panel[] = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "validation"];
const panels: { id: Panel; label: string; description: string }[] = panelIds.map(id => ({ id, label: labels.shell.nav[id].headline, description: labels.shell.nav[id].explain }));
const datasetLabels: Record<string, string> = {
  demo: labels.shell.devValidation.datasets.demo, golden: labels.shell.devValidation.datasets.golden,
  "missing-cogs": labels.shell.devValidation.datasets.missingCogs, "missing-ad": labels.shell.devValidation.datasets.missingAd, duplicate: labels.shell.devValidation.datasets.duplicate,
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    diagnosis: "M4 19V9 M10 19V4 M16 19v-6 M22 19V7",
    products: "m3 7 9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10",
    data: "M4 4h16v16H4z M4 9h16 M9 4v16 M4 14h16",
    scenarios: "M4 4v16h16 M8 16l4-5 4 2 4-8",
    actions: "M8 5h12 M8 12h12 M8 19h12 M3 5h1 M3 12h1 M3 19h1",
    meeting: "M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4",
    arrow: "M5 12h14 M13 6l6 6-6 6",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.data} /></svg>;
}
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
// R7 使用分析（D9）：試算成功會新增一個方案版本、加入待辦會多一張卡；以數量增加判斷事件（不讀任何內容）。
const scenarioVersionCount = (workspace: ScenarioWorkspace) => workspace.contexts.reduce((total, context) => total + context.versions.length, 0);
// R7-4（D10＝A）：進階驗證頁只在網址 #validation 時出現在側欄。
const VALIDATION_HASH = "#validation";

export function Dashboard({ analytics = false }: { analytics?: boolean }) {
  const [panel, showPanel] = useState<Panel>("overview");
  // 「計算與來源」抽屜的選取。
  const [evidence, setEvidenceState] = useState<EvidenceSelection | null>(null);
  const [evidenceSource, setEvidenceSource] = useState<(Pick<Active, "dataset" | "filenames" | "mappings"> & { dataset_hash?: string }) | null>(null);
  // V4-8b（D-V4-44 B、D-V4-56＝A）：按下就切頁（同 v3）——導覽標示與頁標題立刻換成新頁。有資料而這一頁的 chunk 還沒載入（還沒預先載入）時，
  // 內容區先放骨架（PanelLoadingState，main 標 aria-busy），chunk 載好後換成內容（usePanelReady）；載入失敗時換成錯誤狀態與「再試一次」（PanelErrorState，D-V4-57＝A）。
  // 已載入時不出現骨架。連續切頁時只有最後一次生效。pendingPanel 記著等待中的目標頁（加入待辦據此不重複新增）；panelLoadFailed 是最後一次載入失敗的頁。
  const panelRequest = useRef(0);
  const pendingPanel = useRef<Panel | null>(null);
  const hasData = useRef(false);
  const [panelLoadFailed, setPanelLoadFailed] = useState<Panel | null>(null);
  const setPanel = useCallback((next: Panel) => {
    const request = ++panelRequest.current;
    const pending = hasData.current ? preparePanel(next) : null;
    pendingPanel.current = pending ? next : null; setPanelLoadFailed(null); showPanel(next);
    void pending?.then(() => {
      if (request !== panelRequest.current) return;
      pendingPanel.current = null; if (!panelReady(next)) setPanelLoadFailed(next);
    });
  }, []);
  // D10＝A：側欄預設不顯示「開發者驗證」；掛載時或 hashchange 讀到 #validation 才顯示並切過去。
  // 顯示後維持到重新整理（切到其他頁時不消失）；離開驗證頁時清掉 hash（replaceState，不觸發 hashchange），重新整理即回到一般首頁。
  const [showValidation, setShowValidation] = useState(false);
  const [aiCapability, setAiCapability] = useState<AiCapability | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void getAiCapability(fetch, abort.signal).then(value => { if (!abort.signal.aborted) setAiCapability(value); });
    return () => abort.abort();
  }, []);
  const [status, setStatus] = useState<Status>("empty");
  const [selected, setSelected] = useState("demo");
  const [showImport, setShowImport] = useState(false);
  // 本機保存同意由這裡保存，供儲存面板與匯入精靈的對照記憶共用（R4 已移除舊版單頁匯入面板）。
  const [localConsent, setLocalConsent] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  /** V3-8（§7.7.1 第 8 點「匯入時間」）：精靈套用的時間。V4-7c（D-V3-30＝A）起只記到分（UTC，importedAtMinute）並寫進備份 v5 的 active.imported_at，還原時帶回；
   * 示範／golden 載入、清空與還原沒有此欄位的備份為 null。只跟著換資料（載入成功、匯入、還原、清空）一起換，期間／通路篩選與目標、檔期不動它。 */
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [scenarioWorkspace, setScenarioWorkspaceState] = useState<ScenarioWorkspace>(emptyScenarioWorkspace);
  const scenarioRef = useRef(scenarioWorkspace);
  const [reviewSession, setReviewSessionState] = useState<ReviewSession | null>(null);
  const reviewRef = useRef(reviewSession);
  const [actionWorkspace, setActionWorkspaceState] = useState<ActionWorkspace>(emptyActionWorkspace);
  const actionRef = useRef(actionWorkspace);
  const storeActions = (next: ActionWorkspace) => { actionRef.current = next; setActionWorkspaceState(next); };
  // R6-2 已結束的會議（只讀，由舊到新）；寫進備份 v4 的 meeting_history。換資料保留（紀錄自足）；清空工作區時一起清掉。
  const [meetingHistory, setMeetingHistoryState] = useState<Meeting[]>([]);
  const meetingHistoryRef = useRef(meetingHistory);
  const storeMeetingHistory = (next: Meeting[]) => { meetingHistoryRef.current = next; setMeetingHistoryState(next); };
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
    const calculated = scenarioVersionCount(updated) > scenarioVersionCount(scenarioRef.current);
    storeScenarios(updated);
    if (calculated) track("scenario_calculated");
    const review = reviewRef.current;
    if (review && review.decision_state !== "draft" && review.selected_scenarios.some(ref => resolveScenarioReference(updated, ref).status !== "current")) storeReview(updateReviewSession(review, { decision_state: "draft" }));
    markChanged();
  }, [markChanged, storeScenarios, storeReview]);
  const setActionWorkspace = (next: ActionWorkspace) => {
    const added = next.items.length > actionRef.current.items.length;
    storeActions(next);
    if (added) track("action_added");
    if (reviewRef.current) storeReview(syncReviewPins(reviewRef.current, next));
    markChanged();
  };
  const dirty = active !== null && version !== savedVersion;
  // V4-3c：資料第一次就緒（ready／partial）後，等一段時間再於閒置時預先載入各頁的 chunk（lazy-panels.tsx），第一次切頁就不會閃空白；
  // 等待時間讓預先載入落在「載入示範資料」那一段之後。只排一次（已開始就不再排），卸載或資料又進入載入中時取消還沒開始的排程。
  const dataReady = status === "ready" || status === "partial";
  useEffect(() => {
    if (!dataReady) return;
    return schedulePanelPreload();
  }, [dataReady]);
  useEffect(() => { hasData.current = active !== null; }, [active]);
  useEffect(() => {
    if (!dirty && !showImport) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, showImport]);
  function setEvidence(selection: EvidenceSelection | null) { setEvidenceSource(null); setEvidenceState(selection); if (selection) track("evidence_opened"); }
  function actionEvidence(selection: EvidenceSelection, context: ActionContext) {
    const historical = validateDataset(context.source_input).dataset;
    if (!historical) return;
    setEvidenceSource({ dataset: historical, filenames: context.session.filenames, mappings: context.source_mappings, dataset_hash: context.session.dataset_hash });
    setEvidenceState(selection); track("evidence_opened");
  }
  useEffect(() => {
    const sync = () => {
      if (window.location.hash !== VALIDATION_HASH) return;
      setShowValidation(true); setPanel("validation"); setEvidenceSource(null); setEvidenceState(null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [setPanel]);
  const previousPanel = useRef<Panel>(panel);
  useEffect(() => {
    if (previousPanel.current === "validation" && panel !== "validation" && window.location.hash === VALIDATION_HASH) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    previousPanel.current = panel;
  }, [panel]);
  function activate(next: Active, newEpoch = true) {
    setActive(next);
    // 目標／檔期的檢核錯誤屬於上一份資料；換資料就清掉。
    setTargetIssues([]); setEventIssues([]);
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
  const [basisOpen, setBasisOpen] = useState(false);
  // V3-2a（F23）：「這版改了什麼」提示；連結開啟指標定義並捲到「v2 舊名」。
  const [basisSection, setBasisSection] = useState<BasisDialogSection | null>(null);
  const whatsNew = useWhatsNew();
  const [periodOpen, setPeriodOpen] = useState(false);
  // V3-4b（C16「切換時區塊不跳動」）：套用篩選（期間、通路）時舊內容保持掛載、只標 aria-busy，不換成全頁載入畫面；新快照算好後原地更新（圖表容器固定高度，CLS 不累加、捲動位置不重設）。
  // 只有載入資料集（performLoad）才顯示全頁載入畫面。
  const [refiltering, setRefiltering] = useState(false);
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
    setShowImport(false); setSelected(id); setStatus("loading"); setRefiltering(false); setError(""); setFilterError(""); setIssues([]); setEvidence(null);
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(id)}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error(labels.shell.state.errors.fetchFailed);
      const input: DatasetInput = await response.json();
      await afterPaint();
      if (ticket !== requestId.current) return;
      const validation = validateDataset(input);
      if (!validation.dataset) { setIssues(validation.issues); throw new Error(labels.shell.state.errors.validationFailed); }
      const snapshot = await createSnapshot(validation.dataset, {}, await hashInput(input));
      if (ticket !== requestId.current) return;
      // V4-7c：匯入時間跟著 active 一起換；載入失敗（「返回」回到上一份資料）時保留上一份資料的匯入時間。
      activate({ input, dataset: validation.dataset, snapshot, id, revision: ++revision.current }); setImportedAt(null); setIssues(validation.issues); setYoyHintRequested(false);
      setComparisonMode(snapshot.report.scope.comparison_mode); markChanged();
      setDates({ previousStart: snapshot.report.previous.period.start, previousEnd: snapshot.report.previous.period.end, currentStart: snapshot.report.current.period.start, currentEnd: snapshot.report.current.period.end });
      setStatus(validation.classification === "partial" ? "partial" : "ready"); setPanel("overview");
      if (id === "demo") track("demo_loaded");
    } catch (caught) {
      if (ticket !== requestId.current || abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : labels.shell.state.errors.processingFailed); setStatus("error");
    }
  }
  function startImport() {
    requestId.current++; controller.current?.abort(); setEvidence(null); setError(""); setFilterError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
    // V4-3c：匯入精靈在首載裡，精靈與 v3 一樣按下就出現；V4-8b 起匯入中不顯示骨架與錯誤狀態（!importing），資料來源頁的 chunk 照樣開始載入（取消匯入後才用到）。
    setPanel("data"); setShowImport(true);
  }
  function cancelImport() {
    requestId.current++; controller.current?.abort(); setShowImport(false); setError("");
    setStatus(active ? (active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready") : "empty");
  }
  // R4：目標與檔期（選配）掛在目前資料上；換資料即清空；寫進備份 v4。
  const [targetIssues, setTargetIssues] = useState<TargetIssue[]>([]);
  const [eventIssues, setEventIssues] = useState<EventIssue[]>([]);
  async function readSideFile(kind: "targets" | "events", file: File | undefined) {
    if (!file || !active) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === "targets") {
      const result = parseTargets({ name: file.name, bytes }, active.dataset.manifest.channels);
      setTargetIssues(result.issues);
      if (result.set) { setActive(previous => previous ? { ...previous, targets: result.set } : previous); markChanged(); }
    } else {
      const result = parseEvents({ name: file.name, bytes });
      setEventIssues(result.issues);
      if (result.set) { setActive(previous => previous ? { ...previous, events: result.set } : previous); markChanged(); }
    }
  }
  function removeSideFile(kind: "targets" | "events") {
    if (kind === "targets") setTargetIssues([]); else setEventIssues([]);
    setActive(previous => previous ? { ...previous, [kind]: null } : previous); markChanged();
  }
  /** 逐列刪除（05 §4 要求檔期可在資料來源頁編輯／刪除；目標同樣處理）；刪到沒有列就整組移除。 */
  function removeSideRow(kind: "targets" | "events", line: number) {
    setActive(previous => {
      if (!previous) return previous;
      if (kind === "targets") { const rows = (previous.targets?.rows ?? []).filter(row => row.line !== line); return { ...previous, targets: rows.length ? { filename: previous.targets?.filename ?? null, rows } : null }; }
      const rows = (previous.events?.rows ?? []).filter(row => row.line !== line);
      return { ...previous, events: rows.length ? { filename: previous.events?.filename ?? null, rows } : null };
    });
    markChanged();
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
      setIssues(prepared.validation.issues); setImportedAt(importedAtMinute(new Date())); setYoyHintRequested(false);
      setStatus(prepared.validation.classification === "partial" ? "partial" : "ready");
      setShowImport(false); setPanel("overview");
      track("import_committed");
      afterCommit?.();
    } catch {
      if (ticket !== requestId.current) return;
      setError(labels.shell.state.errors.importIncomplete); setStatus("error");
    }
  }
  async function applyFilters(filters: AnalysisFilters) {
    if (!active) return;
    const ticket = ++requestId.current;
    setFilterError(""); setEvidence(null); setStatus("loading"); setRefiltering(true);
    try {
      await afterPaint();
      const snapshot = await createSnapshot(active.dataset, filters, active.snapshot.dataset_hash);
      if (ticket !== requestId.current) return;
      setRefiltering(false);
      const oldScope = active.snapshot.report.scope, newScope = snapshot.report.scope;
      const periodChanged = decisionSignature([oldScope.previous_period, oldScope.current_period, oldScope.comparison_mode]) !== decisionSignature([newScope.previous_period, newScope.current_period, newScope.comparison_mode]);
      activate({ ...active, snapshot, revision: snapshot.filter_hash === active.snapshot.filter_hash ? active.revision : ++revision.current }, periodChanged);
      if (snapshot.filter_hash !== active.snapshot.filter_hash) markChanged();
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    } catch (caught) {
      if (ticket !== requestId.current) return;
      setRefiltering(false);
      setFilterError(caught instanceof AnalysisPeriodLimitError || caught instanceof AnalysisChannelLimitError ? caught.message : labels.shell.state.errors.periodNotApplied);
      setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready");
    }
  }
  // V3-3（D-V3-10＝A）：快捷單擊就套用，與「套用」按鈕走同一個 applyFilters；只有在自訂期間裡手動改日期才需要按「套用」。
  // R4 備份 v4 的 ui_prefs：記住上次用的快捷（只記錄，還原時不自動套用）。
  const [lastPreset, setLastPreset] = useState<string | undefined>(undefined);
  // R5 行動頁的看板／清單檢視也記在 ui_prefs.view（只記錄，還原時讀回）。
  const [actionsView, setActionsView] = useState<"board" | "list" | undefined>(undefined);
  // V4-8a（D-V3-35＝A）：去年同期不可用時，期間列下的理由（preset-reason-visible-yoy）只在使用者本次工作階段按了停用的「去年同期」才顯示；
  // 選其他快捷、送出自訂日期、換資料（載入、匯入、還原、清空）就收起。還原的 ui_prefs.last_preset 不算按過（不讀它）。
  const [yoyHintRequested, setYoyHintRequested] = useState(false);
  function requestYoyHint(preset: PeriodPreset) { if (preset.id === "yoy") setYoyHintRequested(true); }
  function choosePreset(preset: PeriodPreset) {
    const filters = active ? presetFilters(preset, active.snapshot.report.scope.channels) : null;
    if (preset.status !== "ready" || !filters) return;
    setLastPreset(preset.id); setYoyHintRequested(false);
    setComparisonMode(preset.comparison_mode);
    setDates({ previousStart: preset.previous.start, previousEnd: preset.previous.end, currentStart: preset.current.start, currentEnd: preset.current.end });
    void applyFilters(filters);
  }
  function submitDates(event: FormEvent) {
    event.preventDefault(); setYoyHintRequested(false);
    if (active) void applyFilters({ comparison_mode: comparisonMode, channels: active.snapshot.report.scope.channels, previous_period: { start: dates.previousStart, end: dates.previousEnd }, current_period: { start: dates.currentStart, end: dates.currentEnd } });
  }
  function clear() { requestReplacement("clear", performClear); }
  function performClear() {
    storeScenarios(emptyScenarioWorkspace()); storeReview(null); storeActions(emptyActionWorkspace()); storeMeetingHistory([]); setSavedVersion(versionRef.current);
    // 清空工作區也重設本機保存同意（與 R2 以前儲存面板自己重掛載的行為一致）；對照記憶的 IndexedDB 寫入隨之停止。
    setStorageResetEpoch(value => value + 1); setLocalConsent(false);
    requestId.current++; controller.current?.abort(); setActive(null); setIssues([]); setImportedAt(null); setYoyHintRequested(false); setEvidence(null);
    setStatus("empty"); setError(""); setFilterError(""); setShowImport(false);
  }
  function restore(workspace: RestoredWorkspace, accepted?: () => void) {
    requestReplacement("restore", () => { performRestore(workspace); accepted?.(); });
  }
  function performRestore(workspace: RestoredWorkspace) {
    requestId.current++; controller.current?.abort(); setEvidence(null);
    revision.current = Math.max(revision.current, workspace.revision);
    setActive({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, id: workspace.id, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings, conversion: workspace.preprocessing?.conversion ?? null, raw_values: workspace.preprocessing?.raw_values, targets: workspace.targets, events: workspace.events });
    setTargetIssues([]); setEventIssues([]); setLastPreset(workspace.ui_prefs.last_preset); setActionsView(workspace.ui_prefs.view); setYoyHintRequested(false);
    storeScenarios(workspace.scenario_workspace); storeReview(workspace.review_session ?? syncReviewPins(createReviewSession({ input: workspace.input, dataset: workspace.dataset, snapshot: workspace.snapshot, revision: workspace.revision, filenames: workspace.filenames, mappings: workspace.mappings }, workspace.scenario_workspace.active_epoch), workspace.action_workspace)); storeActions(workspace.action_workspace); storeMeetingHistory(workspace.meeting_history); setIssues(workspace.issues);
    setComparisonMode(workspace.snapshot.report.scope.comparison_mode);
    setDates({ previousStart: workspace.snapshot.report.previous.period.start, previousEnd: workspace.snapshot.report.previous.period.end, currentStart: workspace.snapshot.report.current.period.start, currentEnd: workspace.snapshot.report.current.period.end });
    const next = ++versionRef.current; setVersion(next); setSavedVersion(next);
    setRestoreEpoch(value => value + 1); setShowImport(false); setImportedAt(workspace.imported_at); setError(""); setFilterError(""); setPanel("overview");
    setStatus(workspace.classification === "partial" ? "partial" : "ready");
    whatsNew.onRestore(workspace.restored_schema_version);
  }
  function draftFromDiagnostic(diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number]) {
    // V4-3c：切到待辦還在等 chunk 時再按不重複新增（V4-8b 起與 v3 一樣按下就切頁、按鈕隨即消失；守門保留）。
    if (!active || pendingPanel.current === "actions") return;
    // R5：待辦卡的「問題／具體動作」預設用 R2 的規則文案（與健檢列同一句），不用 domain 的舊標題。
    const rule = ruleCopy(active.snapshot, diagnostic, demoAlias(active.snapshot.report.dataset_id));
    setActionWorkspace(addActionDraft(actionWorkspace, active, crypto.randomUUID(), diagnostic.id, { problem: rule.headline, action: rule.nextStep }));
    setPanel("actions"); setEvidence(null);
  }
  // R5 試算頁的通路獨立於全站篩選：決策匯出的「目前」區段跟著試算頁正在編輯的 context。
  const [scenarioFocus, setScenarioFocus] = useState<string | null>(null);
  // V4-3c：決策匯出的程式按下時才載入（不在首載）；回傳 promise，失敗時 reject，由呼叫端（試算頁、待辦頁的通知與下載選單）照原本的錯誤路徑處理。
  async function exportDecision(format: "md" | "csv" | "json"): Promise<void> {
    if (!active) return;
    const { exportWorkspaceDecision } = await import("@/application/workspace-decision-export");
    const body = exportWorkspaceDecision(format, active, scenarioWorkspace, actionWorkspace, reviewSession, active.conversion ?? null, scenarioFocus, activeDatasetName(active));
    downloadText(body, `profitlens-decision.${format}`, format === "json" ? "application/json;charset=utf-8" : format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8");
    if (format === "md") track("export_markdown");
  }
  // R6-7「下載 ▾」的會議摘要：PDF／Excel／PPT 只依目前檢視（active.snapshot）產生，不帶會議名稱、日期、決議與選入方案；
  // 會議範圍的版本在會議紀錄頁的輸出列。處理中的按鈕標 aria-disabled（焦點不會掉到 body），完成或失敗後焦點回到「下載」。
  const [menuExport, setMenuExport] = useState<{ busy: "excel" | "pptx" | "md" | null; error: "export" | "markdown" | null }>({ busy: null, error: null });
  const menuBusy = useRef(false);
  const downloadSummaryRef = useRef<HTMLElement>(null);
  const [menuPrint, setMenuPrint] = useState<PrintSummaryProps | null>(null);
  // V3-7 §7.9：匯出版頭第 1 行用畫面上的資料集名稱（示範資料／golden／使用者檔名），不用 dataset_id。
  const activeDatasetName = (current: Active) => datasetLabels[current.id] ?? current.dataset.manifest.dataset_id;
  const viewSummary = (current: Active) => buildManagerSummary(current.snapshot, { conversion: current.conversion, targets: { set: current.targets ?? null, allChannels: current.dataset.manifest.channels } });
  // V3-9b 開工錨點（F14）：變體由匯出選單帶入，預設 standard；各管線的版面差異由 B 代理在 builder 實作。
  async function exportCurrentView(kind: "excel" | "pptx", variant: ExportVariant = DEFAULT_EXPORT_VARIANT) {
    if (!active || menuBusy.current) return;
    menuBusy.current = true;
    setMenuExport({ busy: kind, error: null });
    try {
      const summary = viewSummary(active);
      // V4-3c：Excel／PPT 的產生程式按下時才載入；載入失敗與產生失敗走同一個 catch（選單顯示 export 錯誤）。
      if (kind === "excel") { const { exportExcel } = await import("@/application/excel-export"); await exportExcel({ variant, summary, snapshot: active.snapshot, dataset: active.dataset, actions: actionRef.current, products: compareProducts(active.dataset, active.snapshot.report.scope).rows, conversion: active.conversion ?? null, meeting: null, datasetName: activeDatasetName(active) }); }
      else { const { exportPptx } = await import("@/application/pptx-export"); await exportPptx({ variant, summary, snapshot: active.snapshot, actions: actionRef.current, meeting: null, datasetName: activeDatasetName(active) }); }
      track(kind === "excel" ? "export_excel" : "export_pptx");
      setMenuExport({ busy: null, error: null });
    } catch { setMenuExport({ busy: null, error: "export" }); } finally { menuBusy.current = false; downloadSummaryRef.current?.focus(); }
  }
  /** 會議紀錄 Markdown：有已結束的會議就下載最近一筆（紀錄本身）；否則下載目前會議稿（固定範圍）的主管摘要 Markdown。 */
  async function exportMeetingNotes() {
    if (!active || menuBusy.current) return;
    menuBusy.current = true;
    const latest = lastMeeting(meetingHistoryRef.current), review = reviewRef.current;
    setMenuExport({ busy: "md", error: null });
    try {
      if (latest) downloadMeetingMarkdown(latest, latest.source_fixed.dataset_hash === active.snapshot.dataset_hash ? activeDatasetName(active) : undefined);
      else if (!review) downloadText(exportManagerSummaryMarkdown(viewSummary(active), undefined, { datasetName: activeDatasetName(active) }), "profitlens-manager-summary.md", "text/markdown;charset=utf-8");
      else {
        const snapshot = await rebuildReviewSnapshot(review), same = active.snapshot.dataset_hash === review.dataset_hash;
        const summary = buildManagerSummary(snapshot, { importanceThreshold: review.importance_threshold, conversion: same ? active.conversion : null, targets: same ? { set: active.targets ?? null, allChannels: active.dataset.manifest.channels } : undefined });
        downloadText(exportManagerSummaryMarkdown(summary, buildReviewDecisionContext(review, scenarioRef.current, actionRef.current), same ? { datasetName: activeDatasetName(active) } : {}), "profitlens-manager-summary.md", "text/markdown;charset=utf-8");
      }
      track("export_markdown");
      setMenuExport({ busy: null, error: null });
    } catch { setMenuExport({ busy: null, error: "markdown" }); } finally { menuBusy.current = false; downloadSummaryRef.current?.focus(); }
  }
  /** 「匯出 PDF」：在 body 放列印版面後 window.print()（與會議頁、會議摘要的列印同一流程）；只帶目前待辦，不帶會議。 */
  function printCurrentView(variant: ExportVariant = DEFAULT_EXPORT_VARIANT) {
    if (!active) return;
    let decisionContext: PrintSummaryProps["decisionContext"];
    try { decisionContext = currentViewDecisionContext(active.snapshot, actionRef.current); } catch { decisionContext = undefined; }
    setMenuPrint({ variant, summary: viewSummary(active), decisionContext, snapshot: active.snapshot, meeting: null, datasetName: activeDatasetName(active) });
    track("export_pdf");
  }
  function reviewEvidence(selection: EvidenceSelection, review: ReviewSession) {
    const dataset = validateDataset(review.source_input).dataset;
    if (!dataset) return;
    setEvidenceSource({ dataset, filenames: review.filenames, mappings: review.source_mappings, dataset_hash: review.dataset_hash }); setEvidenceState(selection); track("evidence_opened");
  }
  async function draftFromReview(diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number], review: ReviewSession) {
    if (!active || pendingPanel.current === "actions") return;
    const ticket = requestId.current;
    try {
      const snapshot = await rebuildReviewSnapshot(review), dataset = validateDataset(review.source_input).dataset;
      if (!dataset || ticket !== requestId.current || reviewRef.current?.id !== review.id || reviewRef.current.revision !== review.revision) return;
      const rule = ruleCopy(snapshot, diagnostic, demoAlias(snapshot.report.dataset_id));
      const next = addActionDraft(actionRef.current, { input: review.source_input, dataset, snapshot, revision: review.revision, filenames: review.filenames, mappings: review.source_mappings }, crypto.randomUUID(), diagnostic.id, { problem: rule.headline, action: rule.nextStep });
      setActionWorkspace(refreshActionWorkspace(next, active.snapshot, active.revision));
      setPanel("actions"); setEvidence(null);
    } catch { if (ticket === requestId.current) setFilterError(labels.shell.state.errors.reviewRebuildFailed); }
  }
  function refreshReviewSource() {
    if (!active) return;
    const old = reviewRef.current;
    const next = createReviewSession(active, scenarioRef.current.active_epoch, old?.id);
    setReview(syncReviewPins({ ...next, revision: (old?.revision ?? 0) + 1, name: old?.name ?? next.name, notes: old?.notes ?? next.notes, importance_threshold: old?.importance_threshold ?? next.importance_threshold, ...(old?.meeting_date ? { meeting_date: old.meeting_date } : {}), ...(old?.created_at ? { created_at: old.created_at } : {}) }, actionWorkspace));
  }
  /**
   * R6-2「結束會議」：用會議的固定來源重建快照 → 方案已過期就先把決議退回草稿 → finalize（以目前的會議歷史算上次比較並凍結進 follow_up）
   * → 寫入會議歷史 → 從目前資料建立新的會議稿。任何一步失敗都擲錯、不改狀態；會議頁依錯誤碼顯示文案（例如 MEETING_HISTORY_FULL）。
   */
  async function finalizeCurrentMeeting(): Promise<void> {
    const current = active, review = reviewRef.current, ticket = requestId.current;
    if (!current || !review) throw new Error("NO_MEETING");
    const snapshot = await rebuildReviewSnapshot(review);
    if (ticket !== requestId.current || reviewRef.current !== review) throw new Error("MEETING_CHANGED");
    const scenarios = scenarioRef.current, actions = actionRef.current, history = meetingHistoryRef.current;
    const fixed = refreshReviewScenarioReferences(review, scenarios);
    const same = current.snapshot.dataset_hash === fixed.dataset_hash;
    const conversion = same ? current.conversion ?? null : null;
    const targets = same ? { set: current.targets ?? null, allChannels: current.dataset.manifest.channels } : null;
    const meeting = finalizeMeeting({ review: fixed, snapshot, scenarios, actions, conversion, targets, history, date: fixed.meeting_date ?? taipeiToday(), now: new Date().toISOString() });
    storeMeetingHistory(appendMeeting(history, meeting));
    track("meeting_finalized");
    // 新會議稿：同步置頂後仍是「第 1 版草稿」，總覽入口才能分辨「剛結束、新稿還沒動過」。
    const fresh = syncReviewPins(createReviewSession(current, scenarios.active_epoch, crypto.randomUUID()), actions);
    storeReview(fresh.revision === 1 ? fresh : { ...fresh, revision: 1 });
    markChanged(); setEvidence(null); setPanel("meeting");
  }
  /** 從會議歷史移除一筆（使用者確認後；歷史滿 100 筆時騰出空間）。 */
  function removeMeetingRecord(id: string) {
    // 已不在歷史裡（例如剛清空或還原）就不動作，避免 removeMeeting 擲 UNKNOWN_MEETING。
    if (!meetingHistoryRef.current.some(row => row.id === id)) return;
    storeMeetingHistory(removeMeeting(meetingHistoryRef.current, id));
    markChanged();
  }
  function selectForReview(reference: ScenarioSelectionRef) {
    if (!reviewRef.current) return;
    try { setReview(selectReviewScenario(reviewRef.current, scenarioRef.current, reference)); setFilterError(""); }
    catch { setFilterError(fill(labels.shell.state.errors.scenarioScopeMismatch, { overview: labels.shell.nav.meeting.headline, updateMeeting: labels.meeting.buttons.updateMeetingSource })); }
  }
  const visible = active && (status === "ready" || status === "partial" || (status === "loading" && refiltering));
  const importing = showImport && panel === "data";
  // V4-8b（D-V4-44 B）：這一頁的 chunk 還沒載入（或載入失敗）時，內容區放骨架或錯誤狀態，頁面內容等 chunk 載好才掛載（一掛載就是真正的面板）；匯入中不顯示。
  const ready = usePanelReady(panel);
  const panelWaiting = !!visible && !importing && !ready;
  // V3-9b 開工錨點（F22）：投影模式只在總覽與會議頁、有資料時可用；按鈕放在 PageHeader，Esc 離開（hook 內）。
  const present = usePresentMode(!!visible && (panel === "overview" || panel === "meeting"));
  // V4-8a（D-V3-33＝B）：按鈕的狀態只看文字（投影模式／離開投影），不帶 aria-pressed。
  const presentToggle = visible && (panel === "overview" || panel === "meeting") ? <button type="button" className="ui-btn ui-btn-secondary" data-testid="present-toggle" aria-keyshortcuts={present.active ? "Escape" : undefined} onClick={present.active ? present.exit : present.enter}>{present.active ? labels.shell.presentV3.exit : labels.shell.presentV3.enter}</button> : undefined;
  // V4-8a（D-V3-34＝A）：投影中在頁首一行內互切總覽與會議紀錄（字樣沿用導覽的頁名；切過去仍在投影中，焦點照一般切頁交給 main）。
  // 與投影按鈕同條件掛載，不在投影中時由 CSS 隱藏（.present-switch，M1）。
  const presentTarget: Panel = panel === "meeting" ? "overview" : "meeting";
  const presentSwitch = visible && (panel === "overview" || panel === "meeting") ? <button type="button" className="ui-btn ui-btn-secondary present-switch" data-testid="present-switch" onClick={() => { setPanel(presentTarget); setEvidence(null); }}>{labels.shell.nav[presentTarget].headline}</button> : undefined;
  const local = active?.dataset.manifest.source_type === "user_provided";
  const currentContext = scenarioWorkspace.contexts.find(context => context.status === "current" && context.session.filter_hash === active?.snapshot.filter_hash);
  const decision = currentContext ? scenarioContextDecision(currentContext) : emptyDecisionWorkspace();
  // R4：第五個快捷「去年同期」以表單目前的兩期為準（本期不變、上期各減一年）；日期還沒填完整時顯示不可用，不拋錯。
  const presets = active ? periodPresets(active.dataset.manifest, { previous: { start: dates.previousStart, end: dates.previousEnd }, current: { start: dates.currentStart, end: dates.currentEnd }, comparison_mode: comparisonMode }) : [];
  const presetMatches = (preset: PeriodPreset) => preset.status === "ready" && preset.comparison_mode === comparisonMode && preset.previous.start === dates.previousStart && preset.previous.end === dates.previousEnd && preset.current.start === dates.currentStart && preset.current.end === dates.currentEnd;
  const alias = active ? demoAlias(active.dataset.manifest.dataset_id) : false;
  // 會議頁的目標（同一份資料才帶進摘要）；固定物件身分，避免每次 render 重算會議摘要。
  const meetingTargets = useMemo(() => active ? { set: active.targets ?? null, allChannels: active.dataset.manifest.channels } : null, [active]);
  // V3-2a：「資料就緒」改為「資料到 {date}」（§8.3 #26）；資料到的日期已在狀態文字內，旁邊只留資料集名稱。
  const statusText = status === "ready" && active ? fill(labels.shell.status.ready, { date: active.dataset.manifest.data_as_of }) : labels.shell.status[status];
  const aiHeadline = aiCapability === null ? labels.shell.status.aiUnknown : aiCapability.available ? labels.shell.status.aiNeedsConsent : aiCapability.reason === "STATUS_UNAVAILABLE" ? labels.shell.status.aiUnknown : aiCapability.reason === "PUBLIC_DEMO" ? labels.shell.status.aiOff : labels.shell.status.aiDisabled;
  // 03 §9：關閉狀態的說明只留一句（併入 AI popover）。
  const aiDetail = aiCapability?.available ? labels.shell.topbar.aiDetail.consent : aiCapability?.reason === "PUBLIC_DEMO" ? labels.shell.topbar.aiDetail.publicDemo : labels.shell.topbar.aiDetail.off;
  // V3-4a 週會摘要的待辦概況：未完成（執行狀態不是已完成）的數量，與置頂的前 3 項（問題、負責人、期限）。
  const overviewActions = { pending: actionWorkspace.items.filter(item => item.execution_status !== "completed").length, pinned: actionWorkspace.items.filter(item => item.pinned).slice(0, 3).map(item => ({ problem: item.card.problem, owner: item.card.owner_role, deadline: item.card.deadline })) };
  // V3-7 開工錨點（§6.5 匯出選單新分組「會議：複製週會摘要」、§7.6 會議頁頁首）：與總覽同一份週會摘要輸入；選單由 C 代理接線。
  const copySummaryFromView = () => active ? copyWeeklySummary({ snapshot: active.snapshot, datasetName: datasetLabels[active.id] ?? active.dataset.manifest.dataset_id, missingItems: issues.length, actions: overviewActions, allChannels: active.dataset.manifest.channels }, typeof navigator === "undefined" ? null : navigator.clipboard) : Promise.resolve({ copied: false, text: "" });
  const backupSource: WorkspaceBackupSource | null = active ? { input: active.input, filters: active.snapshot.report.scope, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, imported_at: importedAt, decision, action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: reviewSession, preprocessing: active.conversion ? { conversion: active.conversion, raw_values: active.raw_values ?? {} } : null, targets: active.targets ?? null, events: active.events ?? null, meeting_history: meetingHistory, ui_prefs: { ...(lastPreset ? { last_preset: lastPreset } : {}), ...(actionsView ? { view: actionsView } : {}) } } : null;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{labels.shell.sidebar.skipLink}</a>
    {/* V3-3 A1：頂欄（48px 單列）、側欄四組、手機底部分頁列與「更多」面板（src/components/shell/）。 */}
    <ShellFrame panel={panel} showValidation={showValidation} onNavigate={id => { setPanel(id); setEvidence(null); }}
      dataStatus={{ state: status, data: active ? { local: !!local, datasetName: datasetLabels[active.id] ?? active.dataset.manifest.dataset_id, dataAsOf: active.dataset.manifest.data_as_of, coverageStart: active.dataset.manifest.coverage_start, issueCount: active.dataset.issues.length } : null, statusText, statusDetail: active && status !== "empty" ? status === "ready" ? datasetLabels[active.id] ?? active.dataset.manifest.dataset_id : fill(labels.shell.topbar.statusDataset, { dataset: datasetLabels[active.id] ?? active.dataset.manifest.dataset_id, date: active.dataset.manifest.data_as_of }) : null, publicDemo: aiCapability?.reason === "PUBLIC_DEMO", onGoData: () => { setPanel("data"); setEvidence(null); }, onImport: startImport }}
      ai={{ headline: aiHeadline, detail: aiDetail, open: aiOpen, onToggle: () => setAiOpen(open => !open) }} aiContainerRef={aiRef} aiButtonRef={aiButtonRef}
      onBasis={() => setBasisOpen(true)}
      badges={{ snapshot: visible ? active.snapshot : null, issues: active ? active.dataset.issues.length : 0, meetingDraft: !!visible && reviewSession?.decision_state === "draft" }}
      storage={<WorkspaceStorage key={storageResetEpoch} source={backupSource} version={version} dirty={dirty} onRestore={restore} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onDeleted={() => { void clearWizardMemory(); if (active) markChanged(); }} consent={localConsent} onConsentChange={setLocalConsent} onClear={clear} />}
      exportMenu={<ExportMenu source={visible ? active : null} busy={menuExport.busy} error={menuExport.error} summaryRef={downloadSummaryRef} onCopySummary={copySummaryFromView} onDecision={exportDecision} onPrint={printCurrentView} onExport={(kind, variant) => void exportCurrentView(kind, variant)} onMeetingNotes={() => void exportMeetingNotes()} />} />
    <div className="main-shell">
      <main id="main-content" tabIndex={-1} aria-busy={(panelWaiting && panelLoadFailed !== panel) || undefined}>
        {/* V3-8 開工錨點（§7.7.2 全版專注模式）：匯入中頁首改「匯入資料」＋隱私一句，期間列、橫幅與頁面內容保持掛載但 hidden；頂欄保留。 */}
        <PageHeader title={importing ? labels.importWizard.title : currentPanel.label} description={importing ? labels.importWizard.privacyNote : panel === "products" ? labels.products.pageV3.description : currentPanel.description} isData={panel === "data"} importing={importing} hasData={status !== "empty"} presentToggle={presentToggle} presentSwitch={presentSwitch} presentPeriod={present.active && visible ? presentPeriodText(active.snapshot, panel === "meeting" ? reviewSession : null, active.dataset.manifest.channels) : undefined} reserveActions={panelWaiting && (panel === "products" || panel === "actions")} showLoadDemo onLoadDemo={() => void load("demo")} onImport={startImport} />
        {whatsNew.visible && <WhatsNewNote onOpenGlossary={() => { whatsNew.markRead(); setBasisSection("v2-names"); setBasisOpen(true); }} onDismiss={whatsNew.dismiss} />}
        {panel === "validation" && <section className="panel validation-panel" aria-labelledby="validation-heading" data-testid="validation-panel">
          <h2 id="validation-heading">{labels.shell.devValidation.validation.heading}</h2>
          <p>{labels.shell.devValidation.validation.intro}</p>
          <div className="validation-controls"><label>{labels.shell.devValidation.validation.datasetLabel}<select aria-label={labels.shell.devValidation.validation.datasetLabel} value={selected} onChange={event => setSelected(event.target.value)}>{Object.entries(datasetLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="button primary" onClick={() => void load(selected)}>{labels.shell.devValidation.validation.loadButton} <Icon name="arrow" size={16} /></button></div>
          <ul className="validation-descriptions"><li>{labels.shell.devValidation.validation.descriptions.demo}</li><li>{labels.shell.devValidation.validation.descriptions.golden}</li><li>{labels.shell.devValidation.validation.descriptions.missing}</li><li>{labels.shell.devValidation.validation.descriptions.duplicate}</li></ul>
          <p className="note">{labels.shell.devValidation.validation.note}</p>
        </section>}
        {showImport && <div hidden={panel !== "data"}><ImportWizard onCommit={commitImport} onCancel={cancelImport} busy={status === "loading"} localSaveConsented={localConsent} /></div>}
        {/* V3-3 A2：期間列（C23，sticky）＋需要處理橫幅（C22）。套用中（loading）期間列保持掛載，焦點留在剛按的快捷上；橫幅只在有內容時出現。 */}
        {active && (visible || status === "loading") && <div className="period-wrap" hidden={importing || undefined}>
          <PeriodBar
            channel={{ value: active.snapshot.report.scope.channels.length > 1 ? "" : active.snapshot.report.scope.channels[0], options: active.dataset.manifest.channels.map(channel => ({ value: channel, label: channelLabel(channel, alias) })), onChange: value => void applyFilters({ ...active.snapshot.report.scope, channels: value === "" ? active.dataset.manifest.channels : [value] }) }}
            presets={presets} isPressed={presetMatches} onPreset={choosePreset} onUnavailablePreset={requestYoyHint}
            comparisonMode={comparisonMode} onComparisonMode={setComparisonMode} dates={dates} onDates={setDates} onSubmit={submitDates} applyRef={applyRef}
            scope={{ previous: active.snapshot.report.previous.period, current: active.snapshot.report.current.period, previousDays: active.snapshot.report.comparison.previous_days, currentDays: active.snapshot.report.comparison.current_days, comparisonMode: active.snapshot.report.comparison.mode, channelsText: channelsLabel(active.snapshot.report.scope.channels, alias), dataAsOf: active.snapshot.data_as_of }}
            busy={status === "loading"} />
          {visible && <NeedsAttention filterError={filterError} partialIssues={status === "partial" ? active.dataset.issues.length : null} onViewIssues={() => setPanel("data")} yoyReason={presets.flatMap(preset => preset.id === "yoy" && preset.status === "unavailable" ? [preset.reason] : [])[0] ?? null} yoyHintVisible={yoyHintRequested} />}
        </div>}
        {/* V3-8 C（§7.10、C10 頁面型）：首次進入、載入中、錯誤共用同一個容器（shell/page-states.tsx，高度＝總覽首屏）；空狀態的「匯入資料」與頁首、資料狀態 popover 走同一個 startImport。 */}
        {status === "empty" && !showImport && panel !== "validation" && <FirstRunState onLoadDemo={() => void load("demo")} onImport={startImport} showActions={panel !== "data"} />}
        {status === "loading" && !refiltering && <LoadingState />}
        {status === "error" && <ErrorState error={error} issues={issues} onRetry={() => void load(selected)} onBack={active ? () => { setStatus(active.dataset.issues.some(i => i.severity === "partial") ? "partial" : "ready"); setIssues(active.dataset.issues); } : undefined} />}
        {panelWaiting && panelLoadFailed !== panel && <PanelLoadingState />}
        {panelWaiting && panelLoadFailed === panel && <PanelErrorState onRetry={() => setPanel(panel)} />}
        {/* V41-4 O2（CLS）：切頁時內容區整塊換成新頁，所以 .view-content 與頁尾跟著頁（頁尾另加 ready：骨架換成內容時）換新節點，不沿用上一頁的節點。
            沿用時，390 頁首多一列本頁動作（商品毛利、資料來源）會讓 .view-content 整塊下移 56px，短頁（待辦）會讓頁尾從畫面外移進首屏，都被算成版面位移；
            換新節點後是新內容出現，不算位移。版面與內容不變（各頁本來就各自掛載自己的面板）。 */}
        {visible && ready && <div key={`${active.id}:${panel}`} className="view-content" aria-busy={refiltering || undefined} hidden={importing || undefined}>{panel === "overview" && <Overview snapshot={active.snapshot} onEvidence={setEvidence} onCreateAction={draftFromDiagnostic} periodOpen={periodOpen} onPeriodToggle={setPeriodOpen} targets={active.targets} events={active.events} allChannels={active.dataset.manifest.channels} onBasis={() => setBasisOpen(true)} onNavigate={id => { setPanel(id); setEvidence(null); }} datasetName={datasetLabels[active.id] ?? active.dataset.manifest.dataset_id} missingItems={issues.length} actionsSummary={overviewActions} meetingEntry={<MeetingEntry review={reviewSession} history={meetingHistory} datasetHash={active.snapshot.dataset_hash} onOpen={() => { setPanel("meeting"); setEvidence(null); }} />} />}{panel === "meeting" && <MeetingPage onGoToScenarios={() => { setPanel("scenarios"); setEvidence(null); }} source={active} conversion={active.conversion} targets={meetingTargets} summaryContext={{ datasetName: datasetLabels[active.id] ?? active.dataset.manifest.dataset_id, missingItems: issues.length, allChannels: active.dataset.manifest.channels }} scenarioWorkspace={scenarioWorkspace} actionWorkspace={actionWorkspace} review={reviewSession} history={meetingHistory} onChange={setReview} onEvidence={reviewEvidence} onRefreshSource={refreshReviewSource} onCreateAction={(diagnostic, review) => void draftFromReview(diagnostic, review)} onFinalize={finalizeCurrentMeeting} onRemoveMeeting={removeMeetingRecord} />}{panel === "diagnosis" && <><Diagnosis snapshot={active.snapshot} onEvidence={setEvidence} onCreateAction={draftFromDiagnostic} events={active.events} /><AiCollapse capability={aiCapability}><AiPanel key={restoreEpoch} capability={aiCapability} snapshot={active.snapshot} revision={active.revision} onEvidence={setEvidence} /></AiCollapse></>}{panel === "products" && <ProductComparisonPanel dataset={active.dataset} snapshot={active.snapshot} onEvidence={setEvidence} filenames={active.filenames} conversion={active.conversion} />}{panel === "data" && <DataWorkspace importedAt={importedAt} dataset={active.dataset} snapshot={active.snapshot} filenames={active.filenames} mappings={active.mappings} conversion={active.conversion} targets={active.targets} events={active.events} targetIssues={targetIssues} eventIssues={eventIssues} onTargets={file => void readSideFile("targets", file)} onEvents={file => void readSideFile("events", file)} onRemoveTargets={() => removeSideFile("targets")} onRemoveEvents={() => removeSideFile("events")} onRemoveTargetRow={line => removeSideRow("targets", line)} onRemoveEventRow={line => removeSideRow("events", line)} />}</div>}
        {active && <div hidden={!visible || panel !== "scenarios"}><MultiScenarioWorkbench active={!!visible && panel === "scenarios"} source={active} state={scenarioWorkspace} setState={setScenarios} onExport={exportDecision} onEvidence={setEvidence} onSelectForReview={selectForReview} onContextChange={setScenarioFocus} /></div>}
        {visible && ready && panel === "actions" && <ActionsWorkbench workspace={actionWorkspace} onChange={setActionWorkspace} source={active} onEvidence={actionEvidence} onExport={exportDecision} view={actionsView} onViewChange={setActionsView} />}
        <ShellFooter key={`${panel}:${ready}`} analytics={analytics} onBasis={() => setBasisOpen(true)} />
      </main>
    </div>
    {pendingReplacement && <ReplacementDialog intent={pendingReplacement} source={backupSource} currentVersion={() => versionRef.current} onSaved={saved => { if (saved === versionRef.current) setSavedVersion(saved); }} onCancel={() => setPendingReplacement(null)} onProceed={() => {
      if (pendingReplacement.version !== versionRef.current) return;
      const run = pendingReplacement.run; setPendingReplacement(null); void run();
    }} />}
    {active && <EvidenceDrawer dataset={evidenceSource?.dataset ?? active.dataset} snapshot={evidenceSource ? undefined : active.snapshot} filenames={evidenceSource?.filenames ?? active.filenames} mappings={evidenceSource ? evidenceSource.mappings : active.mappings} rawValues={!evidenceSource || evidenceSource.dataset_hash === active.snapshot.dataset_hash ? active.raw_values : undefined} conversion={!evidenceSource || evidenceSource.dataset_hash === active.snapshot.dataset_hash ? active.conversion : null} evidence={evidence} onClose={() => setEvidence(null)} onBasis={() => setBasisOpen(true)} />}
    <BasisDialog open={basisOpen} section={basisSection} onClose={() => { setBasisOpen(false); setBasisSection(null); }} />
    {menuPrint && <PrintSummaryPortal {...menuPrint} onDone={() => { setMenuPrint(null); downloadSummaryRef.current?.focus(); }} />}
  </div>;
}
