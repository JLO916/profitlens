import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "./fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, Dataset, DatasetInput, FileName, SourceRef } from "@/domain/types";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, scenarioSelectionRef, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createReviewSession, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, setAdDecision, type ActionWorkspace } from "@/application/action-workspace";
import type { Meeting } from "@/application/meeting";
import { parseTargets, type TargetSet } from "@/application/targets";
import { parseEvents, type EventSet } from "@/application/events";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import { periodPresets, type PeriodPreset } from "@/application/period-presets";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import type { TaxConversion } from "@/application/tax-basis";
import type { WorkspaceBackupSource } from "@/application/workspace-backup";
import { fill, labels } from "@/i18n";
import { Dashboard } from "@/components/dashboard";
import { ShellFrame, type ShellPanel } from "@/components/shell/shell-frame";
import { ExportMenu } from "@/components/shell/export-menu";
import { PageHeader, ShellFooter } from "@/components/shell/page-chrome";
import { ErrorState, FirstRunState } from "@/components/shell/page-states";
import { NeedsAttention, PeriodBar } from "@/components/shell/period-bar";
import { Overview } from "@/components/overview";
import { Diagnosis, DataWorkspace } from "@/components/workspace-panels";
import { AiPanel } from "@/components/ai-panel";
import { AiCollapse } from "@/components/ai-collapse";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { MultiScenarioWorkbench } from "@/components/multi-scenario-workbench";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { MeetingEntry, MeetingPage } from "@/components/meeting-page";
import { ImportWizard } from "@/components/import-wizard";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { BasisDialog } from "@/components/basis-dialog";
import { WorkspaceStorage } from "@/components/workspace-storage";
import { yoyInput } from "./yoy-dataset";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

/*
 * 頁面狀態（V4-0a 由 tests/mounted-testids.test.tsx 原樣搬出並匯出；PRD §7.9、§8.6、06_BATCHES V4-0a 第 7 項）。
 * tests/mounted-testids.test.tsx（M1／M6）與 tests/chart-lint.test.ts（CL-1、CL-2、CL-9、CL-11 的 SSR 檢查）都從這裡匯入；
 * 本檔不是 *.test.tsx，vitest 不會把它當測試檔登記（直接從另一支 .test.tsx 匯入會讓那支的測試再登記一次）。
 * 搬移時只加 export 與改相對路徑，函式內容不變；「── V3-n 新增的頁面狀態在此之後」錨點隨 states 物件一起搬來，
 * V4-1 起新增的頁面狀態寫在下方 states 物件內的「── V4-n 新增頁面狀態」錨點後，對應的 M1 測試寫在 mounted-testids 的「── V4-n 新增 M1 測試」錨點後。
 *
 * 為什麼要自己組殼層：Dashboard 是 client 元件，資料要經過 fetch／effect 才載入，SSR 只停在空工作區（shell-empty 仍渲染真正的 Dashboard）。
 * 有資料的各頁狀態由 `shellPage()` 依 dashboard.tsx 的 return 逐段組合（同一組子元件、同一個掛載條件，例如試算工作台在每一頁都掛著、只用 hidden 切換）；
 * 「Dashboard 的組法沒有漂移」由 mounted-testids 最後一組測試直接讀 dashboard.tsx 原始碼檢查（每個殼層元件只實例化一次、掛載條件相同）。
 */

export const noop = () => undefined;
export const asyncNoop = async () => undefined;
/** V3-7 C：dashboard 一律傳 onCopySummary（copySummaryFromView）給頂欄匯出選單；SSR 不會呼叫。 */
const copySummaryNoop = async () => ({ copied: true, text: "" });
export const bytes = (text: string) => new TextEncoder().encode(text);

export type Active = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; conversion?: TaxConversion | null; targets?: TargetSet | null; events?: EventSet | null };
export type ShellState = {
  panel: ShellPanel;
  active: Active;
  status: "ready" | "partial";
  showImport?: boolean;
  showValidation?: boolean;
  filterError?: string;
  scenarioWorkspace?: ScenarioWorkspace;
  actionWorkspace?: ActionWorkspace;
  review?: ReviewSession | null;
  history?: Meeting[];
  consent?: boolean;
  /** V3-6 B：待辦頁的檢視（預設看板；清單檢視用 actions-list 狀態）。 */
  actionsView?: "board" | "list";
};

const datasetNames: Record<string, string> = { demo: labels.shell.devValidation.datasets.demo, golden: labels.shell.devValidation.datasets.golden, "missing-cogs": labels.shell.devValidation.datasets.missingCogs };
const panelCopy = (panel: ShellPanel) => labels.shell.nav[panel];

/** 依 dashboard.tsx 的 return 組出「已載入資料」的整頁（殼層＋期間列＋橫幅＋頁面內容＋頁尾＋抽屜／dialog 的關閉狀態）。 */
export function shellPage(state: ShellState): ReactElement {
  const { active, status, panel } = state;
  const scenarioWorkspace = state.scenarioWorkspace ?? emptyScenarioWorkspace("e");
  const actionWorkspace = state.actionWorkspace ?? emptyActionWorkspace();
  const review = state.review === undefined ? createReviewSession(active, "e", "rev-shell") : state.review;
  const history = state.history ?? [];
  const visible = true;
  const local = active.dataset.manifest.source_type === "user_provided";
  const alias = demoAlias(active.dataset.manifest.dataset_id);
  const report = active.snapshot.report;
  // performLoad／activate：表單日期與比較方式取自快照。
  const dates = { previousStart: report.previous.period.start, previousEnd: report.previous.period.end, currentStart: report.current.period.start, currentEnd: report.current.period.end };
  const comparisonMode = report.scope.comparison_mode;
  const presets = periodPresets(active.dataset.manifest, { previous: { start: dates.previousStart, end: dates.previousEnd }, current: { start: dates.currentStart, end: dates.currentEnd }, comparison_mode: comparisonMode });
  const presetMatches = (preset: PeriodPreset) => preset.status === "ready" && preset.comparison_mode === comparisonMode && preset.previous.start === dates.previousStart && preset.previous.end === dates.previousEnd && preset.current.start === dates.currentStart && preset.current.end === dates.currentEnd;
  const datasetName = datasetNames[active.id] ?? active.dataset.manifest.dataset_id;
  const statusText = status === "ready" ? fill(labels.shell.status.ready, { date: active.dataset.manifest.data_as_of }) : labels.shell.status[status];
  const currentContext = scenarioWorkspace.contexts.find(context => context.status === "current" && context.session.filter_hash === active.snapshot.filter_hash);
  const decision = currentContext ? scenarioContextDecision(currentContext) : emptyDecisionWorkspace();
  const backupSource: WorkspaceBackupSource = { input: active.input, filters: report.scope, id: active.id, revision: active.revision, filenames: active.filenames, decision, action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: review, preprocessing: null, targets: active.targets ?? null, events: active.events ?? null, meeting_history: history, ui_prefs: {} };
  const yoyReason = presets.flatMap(preset => preset.id === "yoy" && preset.status === "unavailable" ? [preset.reason] : [])[0] ?? null;
  const content = (() => {
    switch (panel) {
      case "overview": return <Overview snapshot={active.snapshot} onEvidence={noop} onCreateAction={noop} periodOpen={false} onPeriodToggle={noop} targets={active.targets} events={active.events} allChannels={active.dataset.manifest.channels} onBasis={noop} onNavigate={noop} datasetName={datasetName} missingItems={active.dataset.issues.length} actionsSummary={{ pending: actionWorkspace.items.filter(item => item.execution_status !== "completed").length, pinned: actionWorkspace.items.filter(item => item.pinned).slice(0, 3).map(item => ({ problem: item.card.problem, owner: item.card.owner_role, deadline: item.card.deadline })) }} meetingEntry={<MeetingEntry review={review} history={history} datasetHash={active.snapshot.dataset_hash} onOpen={noop} />} />;
      case "meeting": return <MeetingPage source={active} conversion={active.conversion} targets={{ set: active.targets ?? null, allChannels: active.dataset.manifest.channels }} scenarioWorkspace={scenarioWorkspace} actionWorkspace={actionWorkspace} review={review} history={history} onChange={noop} onEvidence={noop} onRefreshSource={noop} onCreateAction={noop} onFinalize={asyncNoop} onRemoveMeeting={noop} />;
      case "diagnosis": return <><Diagnosis snapshot={active.snapshot} onEvidence={noop} onCreateAction={noop} events={active.events} /><AiCollapse capability={{ available: false, reason: "PUBLIC_DEMO", provider: "openai" }}><AiPanel capability={{ available: false, reason: "PUBLIC_DEMO", provider: "openai" }} snapshot={active.snapshot} revision={active.revision} onEvidence={noop} /></AiCollapse></>;
      case "products": return <ProductComparisonPanel dataset={active.dataset} snapshot={active.snapshot} onEvidence={noop} filenames={active.filenames} conversion={active.conversion} />;
      case "data": return <DataWorkspace dataset={active.dataset} snapshot={active.snapshot} filenames={active.filenames} conversion={active.conversion} targets={active.targets} events={active.events} targetIssues={[]} eventIssues={[]} onTargets={noop} onEvents={noop} onRemoveTargets={noop} onRemoveEvents={noop} onRemoveTargetRow={noop} onRemoveEventRow={noop} />;
      default: return null;
    }
  })();
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{labels.shell.sidebar.skipLink}</a>
    <ShellFrame panel={panel} showValidation={!!state.showValidation} onNavigate={noop}
      dataStatus={{ state: status, data: { local, datasetName, dataAsOf: active.dataset.manifest.data_as_of, coverageStart: active.dataset.manifest.coverage_start, issueCount: active.dataset.issues.length }, statusText, statusDetail: status === "ready" ? datasetName : fill(labels.shell.topbar.statusDataset, { dataset: datasetName, date: active.dataset.manifest.data_as_of }), publicDemo: true, onGoData: noop, onImport: noop }}
      ai={{ headline: labels.shell.status.aiOff, detail: labels.shell.topbar.aiDetail.publicDemo, open: false, onToggle: noop }} aiContainerRef={{ current: null }} aiButtonRef={{ current: null }}
      onBasis={noop}
      badges={{ snapshot: active.snapshot, issues: active.dataset.issues.length, meetingDraft: review?.decision_state === "draft" }}
      storage={<WorkspaceStorage source={backupSource} version={1} dirty={false} onRestore={noop} onSaved={noop} onDeleted={noop} consent={state.consent ?? true} onConsentChange={noop} onClear={noop} />}
      exportMenu={<ExportMenu source={active} busy={null} error={null} summaryRef={{ current: null }} onCopySummary={copySummaryNoop} onDecision={noop} onPrint={noop} onExport={noop} onMeetingNotes={noop} />} />
    <div className="main-shell">
      <main id="main-content" tabIndex={-1}>
        <PageHeader title={panelCopy(panel).headline} description={panelCopy(panel).explain} isData={panel === "data"} showLoadDemo onLoadDemo={noop} onImport={noop} presentToggle={panel === "overview" || panel === "meeting" ? <button type="button" className="ui-btn ui-btn-secondary" data-testid="present-toggle" aria-pressed={false} onClick={noop}>{labels.shell.presentV3.enter}</button> : undefined} />
        {state.showImport && <div hidden={panel !== "data"}><ImportWizard onCommit={asyncNoop} onCancel={noop} busy={false} localSaveConsented={state.consent ?? true} /></div>}
        <PeriodBar
          channel={{ value: report.scope.channels.length > 1 ? "" : report.scope.channels[0], options: active.dataset.manifest.channels.map(channel => ({ value: channel, label: channelLabel(channel, alias) })), onChange: noop }}
          presets={presets} isPressed={presetMatches} onPreset={noop}
          comparisonMode={comparisonMode} onComparisonMode={noop} dates={dates} onDates={noop} onSubmit={noop}
          scope={{ previous: report.previous.period, current: report.current.period, previousDays: report.comparison.previous_days, currentDays: report.comparison.current_days, comparisonMode: report.comparison.mode, channelsText: channelsLabel(report.scope.channels, alias), dataAsOf: active.snapshot.data_as_of }} />
        <NeedsAttention filterError={state.filterError ?? ""} partialIssues={status === "partial" ? active.dataset.issues.length : null} onViewIssues={noop} yoyReason={yoyReason} />
        {visible && <div className="view-content">{content}</div>}
        <div hidden={panel !== "scenarios"}><MultiScenarioWorkbench source={active} state={scenarioWorkspace} setState={noop} onExport={noop} onEvidence={noop} onSelectForReview={noop} onContextChange={noop} /></div>
        {panel === "actions" && <ActionsWorkbench workspace={actionWorkspace} onChange={noop} source={active} onEvidence={noop} onExport={noop} view={state.actionsView ?? "board"} onViewChange={noop} />}
        <ShellFooter analytics onBasis={noop} />
      </main>
    </div>
    <EvidenceDrawer dataset={active.dataset} snapshot={active.snapshot} evidence={null} onClose={noop} onBasis={noop} />
    <BasisDialog open={false} onClose={noop} />
  </div>;
}

export async function load(id: string, dir: string, filters: AnalysisFilters = {}): Promise<Active> {
  const input = fixture(dir);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), id, revision: 1 };
}
export const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
export function wizardFiles(dir: string): WizardState {
  let state = initialWizardState();
  for (const role of roles) {
    const content = new Uint8Array(readFileSync(resolve(dir, role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
  }
  return state;
}

export type StateMarkup = { name: string; html: string; state: ShellState | null };
export async function pageStates(): Promise<StateMarkup[]> {
  const demo = await load("demo", "demo");
  const golden = await load("golden", "golden");
  const period = demo.snapshot.report.current.period;
  const targets = parseTargets({ name: "targets.csv", bytes: bytes(["period_start,period_end,channel,metric,target", ...["net_revenue", "gross_profit", "contribution_after_marketing", "ad_spend"].map(metric => `${period.start},${period.end},ALL,${metric},${metric === "ad_spend" ? "-50000.00" : "100000.00"}`)].join("\n")) }, demo.dataset.manifest.channels).set;
  const events = parseEvents({ name: "events.csv", bytes: bytes(`start,end,label\n${period.start},${period.end},週年慶\n`) }).set;
  const demoWithSides: Active = { ...demo, targets, events };

  // 試算（golden，一個已計算方案＋一個草稿方案）、待辦（看板兩張卡、一張置頂）、會議（選入方案、置頂待辦、一筆歷史）。
  const goldenDtc = await load("golden", "golden", { channels: ["DTC"] });
  const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  let scenarios: ScenarioWorkspace = ensureScenarioContext(emptyScenarioWorkspace("e"), goldenDtc);
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs });
  draft.scenarios = saveScenario(context.session, draft.scenarios, { id: "q", name: "超出範圍", inputs: { ...inputs, volume_change_pct: "250" } });
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), golden, "a1", diagnostic.id);
  actions = addActionDraft(actions, golden, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  let review: ReviewSession = createReviewSession(golden, "e", "rev-1");
  review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  review = updateReviewSession(syncReviewPins(review, actions), { name: "十月例會", meeting_date: "2026-10-03" });

  // 資料來源：含稅換算後匯入的資料（有前處理）；部分資料待補（missing_cogs，partial 橫幅）。
  const basis = wizardReducer(wizardReducer(wizardFiles(resolve("tests/fixtures/inclusive_tax")), { type: "next" }), { type: "basis", basis: "inclusive" });
  const confirmed = wizardReducer(basis, { type: "confirm" });
  const prepared = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) }).candidate!;
  const importedDataset = validateDataset(prepared.input!).dataset!;
  const imported: Active = { input: prepared.input!, dataset: importedDataset, snapshot: await createSnapshot(importedDataset, {}, await hashInput(prepared.input!)), id: "import-1", revision: 2, conversion: prepared.conversion, targets, events };
  const partialInput = fixture("errors/missing_cogs");
  const partialDataset = validateDataset(partialInput).dataset!;
  const partial: Active = { input: partialInput, dataset: partialDataset, snapshot: await createSnapshot(partialDataset, {}, await hashInput(partialInput)), id: "missing-cogs", revision: 3 };

  const states: Record<string, ShellState> = {
    overview: { panel: "overview", active: demoWithSides, status: "ready" },
    diagnosis: { panel: "diagnosis", active: demo, status: "ready", filterError: labels.shell.state.errors.processingFailed },
    products: { panel: "products", active: demo, status: "ready" },
    scenarios: { panel: "scenarios", active: goldenDtc, status: "ready", scenarioWorkspace: scenarios },
    actions: { panel: "actions", active: golden, status: "ready", actionWorkspace: actions, scenarioWorkspace: scenarios },
    meeting: { panel: "meeting", active: golden, status: "ready", review, actionWorkspace: actions, scenarioWorkspace: scenarios },
    data: { panel: "data", active: imported, status: "ready" },
    "import-step-1": { panel: "data", active: demo, status: "ready", showImport: true, consent: false },
    "data-partial": { panel: "data", active: partial, status: "partial" },
    validation: { panel: "validation", active: demo, status: "ready", showValidation: true },
    // ── V3-6 A 新增的頁面狀態在此之後（例如 scenarios-first-visit）──
    "scenarios-first-visit": { panel: "scenarios", active: goldenDtc, status: "ready" },

    // ── V3-6 B 新增的頁面狀態在此之後（例如 actions-empty、actions-list）──
    "actions-empty": { panel: "actions", active: golden, status: "ready", actionWorkspace: emptyActionWorkspace(), scenarioWorkspace: scenarios },
    "actions-list": { panel: "actions", active: golden, status: "ready", actionWorkspace: actions, scenarioWorkspace: scenarios, actionsView: "list" },

    // ── V3-7 A 新增的頁面狀態在此之後（例如 meeting-finalized、meeting-v2-record）──
    // 會議紀錄頁＋一筆 v2 結束的紀錄（沒有 copy_version，D-V3-22）：歷史項目多結束標示與 v2 加註兩行。
    "meeting-v2-record": { panel: "meeting", active: golden, status: "ready", review, actionWorkspace: actions, scenarioWorkspace: scenarios, history: [await (async () => {
      const { finalizeMeeting, freezeMeeting } = await import("@/application/meeting");
      const { rebuildReviewSnapshot } = await import("@/application/review-session");
      const finished = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" });
      const { copy_version: _version, ...v2 } = structuredClone(finished);
      void _version;
      return freezeMeeting(v2);
    })()] },

    // ── V3-7 C 新增的頁面狀態在此之後（例如匯出選單處理中）──

    // ── V3-8 A 新增的頁面狀態在此之後（例如 data-with-issues）──
    // 資料來源頁：有問題的資料集（missing_cogs）＋實際檔名與標準檔名不同＋目標與檔期都已讀入（選填資料兩表與問題表同時掛著）。
    "data-with-issues": { panel: "data", active: { ...partial, filenames: { "sales_daily.csv": "=uploaded-sales.csv" }, targets, events }, status: "partial" },

    // ── V3-8 B 新增的頁面狀態在此之後（例如 import-step-2／3／4 的 SSR 狀態）──

    // ── V3-8 C 新增的頁面狀態在此之後（例如 error 狀態）──

    // ── V3-9a A 新增的頁面狀態在此之後（例如損益兩平 MER 不適用的資料集）──
    // 總覽＋廣告費為 0（fixtures/zero_ad：損益兩平 MER 照算、實際 MER 不適用）與淨營收為負（fixtures/refund_only：損益兩平 MER 不適用）。
    "overview-zero-ad": { panel: "overview", active: await load("zero-ad", "zero_ad"), status: "ready" },
    "overview-refund-only": { panel: "overview", active: await load("refund-only", "refund_only"), status: "ready" },

    // ── V3-9a B 新增的頁面狀態在此之後（例如帶廣告決策標籤的待辦）──
    // F13：第 1 項待辦標了「加碼」、第 2 項沒標；看板與清單各一個狀態。
    "actions-ad-decision": { panel: "actions", active: golden, status: "ready", actionWorkspace: setAdDecision(actions, "a1", "increase"), scenarioWorkspace: scenarios },
    "actions-ad-decision-list": { panel: "actions", active: golden, status: "ready", actionWorkspace: setAdDecision(actions, "a1", "increase"), scenarioWorkspace: scenarios, actionsView: "list" },

    // ── V3-9a C 新增的頁面狀態在此之後（例如進階區展開、週檢視）──

    // ── V3-9b A 新增的頁面狀態在此之後（例如去年同期不可用的資料集）──
    // 總覽＋涵蓋兩年的合成資料（tests/helpers/yoy-dataset.ts）：去年同期可用，趨勢圖多第三線圖例、提示列第三格與資料表兩欄（demo 的 overview 狀態是不可用）。
    "overview-yoy": { panel: "overview", active: await (async () => { const input = yoyInput(); const dataset = validateDataset(input).dataset!; return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), id: "yoy", revision: 1 }; })(), status: "ready" },

    // ── V3-9b B 新增的頁面狀態在此之後（例如匯出選單選了變體）──

    // ── V3-9b C 新增的頁面狀態在此之後（投影模式是 html 屬性，SSR 狀態可不加）──
    // 總覽：淨營收為負、零值列多的資料集（refund_only）——管理損益表 7 列零值列 hidden 但掛載，佔淨營收 % 不適用。
    // 沒有資料（空工作區停在資料來源頁）與載入失敗的整頁不是 ShellState（它需要資料），由下方 statusShells() 依 dashboard.tsx 的 return 另外組，state 為 null（同 shell-empty）。

    // ── V4-1 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-1 新增 M1 測試」錨點後加對應測試）──

    // ── V4-2 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-2 新增 M1 測試」錨點後加對應測試）──
    // 總覽＋4 通路合成資料（tests/fixtures/synthetic-4-channel，D-V4-31；期間取 manifest：本期 9/07–9/23，最後一週 9/21–9/23 未滿 7 天）：
    // G7a 件數 sparkline 最後一點空心（X40）、廣告佔比等本期資料待補的列不畫；G4 的 LIVE 兩期扣廣告後貢獻資料待補，差額條只畫 3 條；本期實際 MER 資料待補，G5 bullet 整行不出現。
    "overview-synthetic": { panel: "overview", active: await (async () => { const input = synthetic4ChannelInput(); const dataset = validateDataset(input).dataset!; return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), id: "synthetic", revision: 1 }; })(), status: "partial" },

    // ── V4-3a 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-3a 新增 M1 測試」錨點後加對應測試）──
    // 健檢＋4 通路合成資料（D-V4-31）：G10 的 SOCIAL 是「不適用」列（9/15 平台抽成 −6,000，扣項為負）、LIVE 本期資料待補，兩列只有文字、沒有段；
    // G7b 的 LIVE 不畫 sparkline，其餘 3 條最後一週未滿 7 天畫空心點；G9 只畫差額類規則。
    "diagnosis-synthetic": { panel: "diagnosis", active: await (async () => { const input = synthetic4ChannelInput(); const dataset = validateDataset(input).dataset!; return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), id: "synthetic", revision: 1 }; })(), status: "partial" },
    // 健檢＋9 通路（記憶體合成資料，上期、本期各 7 天，通路代碼 CH01–CH09，不寫檔）：通路 > 8 時 G10 只留資料表（state="empty"、不畫段），
    // G7b 不計算 channelWeeks、改成表格之後一句說明（channel-weeks-too-many；PRD §4.4 G10、§8.2）。
    "diagnosis-many-channels": { panel: "diagnosis", active: await (async () => {
      const base = fixture("golden").manifest as Record<string, unknown>, day = (offset: number) => new Date(Date.parse("2026-01-01T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10);
      const channels = Array.from({ length: 9 }, (_, index) => `CH${String(index + 1).padStart(2, "0")}`), dates = Array.from({ length: 14 }, (_, index) => day(index));
      const rows = (make: (date: string, channel: string, index: number, offset: number) => string) => dates.flatMap((date, offset) => channels.map((channel, index) => make(date, channel, index, offset)));
      const input: DatasetInput = {
        manifest: { ...base, dataset_id: "synthetic-many-channels-9x7", data_as_of: day(14), coverage_start: day(0), coverage_end: day(13), channels, previous_period: { start: day(0), end: day(6) }, current_period: { start: day(7), end: day(13) } },
        files: {
          "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...rows((date, channel, index, offset) => `${date},${channel},SKU-${index + 1},HOME,2,${(1000 + offset + index).toFixed(2)},50.00,0.00,400.00,TWD`)].join("\n"),
          "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...rows((date, channel) => `${date},${channel},30.00,10.00,20.00,5.00,TWD`)].join("\n"),
          "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...rows((date, channel) => `${date},${channel},100.00,TWD`)].join("\n"),
        },
      };
      const dataset = validateDataset(input).dataset!;
      return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), id: "many-channels", revision: 1 };
    })(), status: "ready" },

    // ── V4-3b 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-3b 新增 M1 測試」錨點後加對應測試）──

    // ── V4-4 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-4 新增 M1 測試」錨點後加對應測試）──

    // ── V4-5 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-5 新增 M1 測試」錨點後加對應測試）──

    // ── V4-6 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-6 新增 M1 測試」錨點後加對應測試）──

    // ── V4-7a 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-7a 新增 M1 測試」錨點後加對應測試）──

    // ── V4-7b 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-7b 新增 M1 測試」錨點後加對應測試）──

    // ── V4-8 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-8 新增 M1 測試」錨點後加對應測試）──

    // ── V4-9a 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-9a 新增 M1 測試」錨點後加對應測試）──

    // ── V4-9b 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-9b 新增 M1 測試」錨點後加對應測試）──

    // ── V4-10 新增頁面狀態在此之後（PRD §8.6；同批在 tests/mounted-testids.test.tsx 的「V4-10 新增 M1 測試」錨點後加對應測試）──

  };
  const out: StateMarkup[] = [{ name: "shell-empty", html: renderToStaticMarkup(createElement(Dashboard, { analytics: true })), state: null }];
  for (const [name, state] of Object.entries(states)) out.push({ name, html: renderToStaticMarkup(shellPage(state)), state });
  out.push(...statusShells());
  return out;
}

/**
 * V3-8 C（PRD §7.10、C10 頁面型）：沒有資料時的整頁（status empty／error，沒有期間列與頁面內容），依 dashboard.tsx 的 return 組：
 * 殼層（資料狀態沒有資料、匯出選單只剩範本、儲存選單未同意）＋頁首＋同一個頁面型容器（FirstRunState／ErrorState）＋頁尾＋指標定義 dialog（關著）。
 * - shell-empty-data：空工作區停在資料來源頁——頁首的「匯入資料」（page-import）與空狀態的「匯入資料」（empty-import）是兩個入口，各一份。
 * - shell-error：第一次載入就失敗（沒有上次成功的資料，所以沒有「回到上次成功的資料」），有一筆阻擋問題（重複的銷售鍵）。
 */
export function statusShells(): StateMarkup[] {
  const issues = validateDataset(fixture("errors/duplicate_sales_key")).issues;
  const shell = (status: "empty" | "error", panel: ShellPanel, body: ReactElement) => <div className="app-shell">
    <a className="skip-link" href="#main-content">{labels.shell.sidebar.skipLink}</a>
    <ShellFrame panel={panel} showValidation={false} onNavigate={noop}
      dataStatus={{ state: status, data: null, statusText: labels.shell.status[status], statusDetail: null, publicDemo: true, onGoData: noop, onImport: noop }}
      ai={{ headline: labels.shell.status.aiOff, detail: labels.shell.topbar.aiDetail.publicDemo, open: false, onToggle: noop }} aiContainerRef={{ current: null }} aiButtonRef={{ current: null }}
      onBasis={noop}
      badges={{ snapshot: null, issues: 0, meetingDraft: false }}
      storage={<WorkspaceStorage source={null} version={0} dirty={false} onRestore={noop} onSaved={noop} onDeleted={noop} consent={false} onConsentChange={noop} onClear={noop} />}
      exportMenu={<ExportMenu source={null} busy={null} error={null} summaryRef={{ current: null }} onCopySummary={copySummaryNoop} onDecision={noop} onPrint={noop} onExport={noop} onMeetingNotes={noop} />} />
    <div className="main-shell">
      <main id="main-content" tabIndex={-1}>
        <PageHeader title={panelCopy(panel).headline} description={panelCopy(panel).explain} isData={panel === "data"} importing={false} hasData={status !== "empty"} showLoadDemo onLoadDemo={noop} onImport={noop} />
        {body}
        <ShellFooter analytics onBasis={noop} />
      </main>
    </div>
    <BasisDialog open={false} onClose={noop} />
  </div>;
  return [
    { name: "shell-empty-data", html: renderToStaticMarkup(shell("empty", "data", <FirstRunState onLoadDemo={noop} onImport={noop} showActions={false} />)), state: null },
    { name: "shell-error", html: renderToStaticMarkup(shell("error", "overview", <ErrorState error={labels.shell.state.errors.validationFailed} issues={issues} onRetry={noop} />)), state: null },
  ];
}
