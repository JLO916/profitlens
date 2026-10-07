import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, Dataset, DatasetInput, Diagnostic, FileName, Scope, SourceRef } from "@/domain/types";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, scenarioSelectionRef, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createReviewSession, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, type ActionWorkspace } from "@/application/action-workspace";
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

/*
 * V3-3 掛載規則測試（PRD §6.4 M1／M6、§11.7）。
 * M1：搬進 popover、底部面板、`<details>`、「更多」的內容一律保持掛載——各頁狀態的 SSR markup（所有彈出層都是關著的）必須含有
 *     §6.3 #1–#23 的殼層 testid 與錨點（data-status-popover、period-custom-panel、download-menu 各項、workspace-storage 各控制、mobile-more、
 *     mobile-tabbar、ai-availability、指標定義按鈕、需要處理橫幅…），而且彈出層確實是「關著但掛載」（hidden／未帶 data-open）。
 * M6：同一個控制在 DOM 只有一個實例——每個 testid、每個 id（含 #previous-start 等日期欄位、期間列通路 select、儲存選單的 checkbox）
 *     在每個狀態只出現一次（每張卡、每個方案、每筆歷史各一份的樣板 testid 依實例數計）；兩個 nav 各一個且 aria-label 不同；
 *     桌機頂欄群組（topbar-cluster）與手機「更多」面板（mobile-more）沒有共用任何 testid；aria-controls／label for 都指到唯一的元素。
 *
 * 為什麼要自己組殼層：Dashboard 是 client 元件，資料要經過 fetch／effect 才載入，SSR 只停在空工作區（下面的 shell-empty 仍渲染真正的 Dashboard）。
 * 有資料的各頁狀態由 `shellPage()` 依 dashboard.tsx 的 return 逐段組合（同一組子元件、同一個掛載條件，例如試算工作台在每一頁都掛著、只用 hidden 切換）；
 * 「Dashboard 的組法沒有漂移」由最後一組測試直接讀 dashboard.tsx 原始碼檢查（每個殼層元件只實例化一次、掛載條件相同）。
 */

const noop = () => undefined;
const asyncNoop = async () => undefined;
const bytes = (text: string) => new TextEncoder().encode(text);

type Active = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; id: string; revision: number; filenames?: Partial<Record<SourceRef["file"], string>>; conversion?: TaxConversion | null; targets?: TargetSet | null; events?: EventSet | null };
type ShellState = {
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

const datasetNames: Record<string, string> = { demo: labels.ui.dashboard.datasets.demo, golden: labels.ui.dashboard.datasets.golden, "missing-cogs": labels.ui.dashboard.datasets.missingCogs };
const panelCopy = (panel: ShellPanel) => labels.nav[panel];

/** 依 dashboard.tsx 的 return 組出「已載入資料」的整頁（殼層＋期間列＋橫幅＋頁面內容＋頁尾＋抽屜／dialog 的關閉狀態）。 */
function shellPage(state: ShellState): ReactElement {
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
  const statusText = status === "ready" ? fill(labels.status.ready, { date: active.dataset.manifest.data_as_of }) : labels.status[status];
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
    <a className="skip-link" href="#main-content">{labels.ui.dashboard.skipLink}</a>
    <ShellFrame panel={panel} showValidation={!!state.showValidation} onNavigate={noop}
      dataStatus={{ state: status, data: { local, datasetName, dataAsOf: active.dataset.manifest.data_as_of, coverageStart: active.dataset.manifest.coverage_start, issueCount: active.dataset.issues.length }, statusText, statusDetail: status === "ready" ? datasetName : fill(labels.ui.dashboard.statusDataset, { dataset: datasetName, date: active.dataset.manifest.data_as_of }), publicDemo: true, onGoData: noop, onImport: noop }}
      ai={{ headline: labels.status.aiOff, detail: labels.ui.dashboard.aiDetail.publicDemo, open: false, onToggle: noop }} aiContainerRef={{ current: null }} aiButtonRef={{ current: null }}
      onBasis={noop}
      badges={{ snapshot: active.snapshot, issues: active.dataset.issues.length, meetingDraft: review?.decision_state === "draft" }}
      storage={<WorkspaceStorage source={backupSource} version={1} dirty={false} onRestore={noop} onSaved={noop} onDeleted={noop} consent={state.consent ?? true} onConsentChange={noop} onClear={noop} />}
      exportMenu={<ExportMenu source={active} busy={null} error={null} summaryRef={{ current: null }} onDecision={noop} onPrint={noop} onExport={noop} onMeetingNotes={noop} />} />
    <div className="main-shell">
      <main id="main-content" tabIndex={-1}>
        <PageHeader title={panelCopy(panel).label} description={panelCopy(panel).description} isData={panel === "data"} showLoadDemo onLoadDemo={noop} onImport={noop} />
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

async function load(id: string, dir: string, filters: AnalysisFilters = {}): Promise<Active> {
  const input = fixture(dir);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), id, revision: 1 };
}
const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
function wizardFiles(dir: string): WizardState {
  let state = initialWizardState();
  for (const role of roles) {
    const content = new Uint8Array(readFileSync(resolve(dir, role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
  }
  return state;
}

type StateMarkup = { name: string; html: string; state: ShellState | null };
async function pageStates(): Promise<StateMarkup[]> {
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
    diagnosis: { panel: "diagnosis", active: demo, status: "ready", filterError: labels.ui.dashboard.errors.processingFailed },
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

  };
  const out: StateMarkup[] = [{ name: "shell-empty", html: renderToStaticMarkup(createElement(Dashboard, { analytics: true })), state: null }];
  for (const [name, state] of Object.entries(states)) out.push({ name, html: renderToStaticMarkup(shellPage(state)), state });
  return out;
}

/* ---------- markup 工具（renderToStaticMarkup 的輸出是良構的；只需要成對的同名標籤）。 ---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function counts(html: string, pattern: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  for (const match of html.matchAll(pattern)) out.set(match[1], (out.get(match[1]) ?? 0) + 1);
  return out;
}
const testIdCounts = (html: string) => counts(html, /\sdata-testid="([^"]+)"/g);
const idCounts = (html: string) => counts(html, /\sid="([^"]+)"/g);
const occurrences = (html: string, text: string) => html.split(text).length - 1;
/** 回傳含有 `attr` 的那個元素（開始標籤到對應的結束標籤）；找不到回傳 null，有多個時回傳第一個。 */
function element(html: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`元素沒有結束標籤：${attr}`);
}
const openTag = (html: string, attr: string) => { const el = element(html, attr); return el ? el.slice(0, el.indexOf(">") + 1) : null; };

/* ---------- §6.3 #1–#23 的殼層 testid／錨點 ---------- */
/** 每個有資料的頁面狀態都要掛著（不論彈出層開關）。 */
const SHELL_TESTIDS = [
  "data-status", "data-status-popover", "data-status-go-data", "data-status-import", "workspace-status", // #5 #6 #9 #11 #23
  "ai-availability", // #13
  "workspace-storage", "autosave-status", "local-save-announce", // #14 #15
  "download-menu", "download-meeting-section", "download-templates", // #16
  "topbar-more", "mobile-tabbar", "mobile-tabbar-more", "mobile-more", // #2 手機
  "nav-group-results", "nav-group-causes", "nav-group-decisions", "nav-group-data", // #2 側欄分組
  "period-bar", "period-toggle", "period-presets", "period-summary", "period-custom", "period-custom-panel", // #18 #19
  "analytics-note", // #57（頁尾）
] as const;
/** 空工作區（真正的 Dashboard SSR）：沒有資料時仍掛著的殼層。 */
const EMPTY_SHELL_TESTIDS = ["data-status", "data-status-popover", "data-status-import", "workspace-status", "ai-availability", "workspace-storage", "autosave-status", "local-save-announce", "download-menu", "download-templates", "topbar-more", "mobile-tabbar", "mobile-tabbar-more", "mobile-more", "nav-group-results", "nav-group-causes", "nav-group-decisions", "nav-group-data", "analytics-note"] as const;
/** 表單 id 與錨點（#1、#13、#18；手機底部面板與自訂期間是同一個 #period-bar-panel）。 */
const SHELL_IDS = ["main-content", "ai-availability-detail", "data-status-popover", "topbar-cluster", "mobile-more", "period-bar-panel", "period-custom-panel", "previous-start", "previous-end", "current-start", "current-end"] as const;
/**
 * 每個實例各一份的樣板容器（§6.4 M6 的例外：「每個方案、每張卡各一份的樣板 testid 依實例數計」）：
 * 試算方案欄 `scenario-{n}`、看板卡 `board-card-{n}`、清單項 `action-{n}`、敏感度的門檻區塊 `threshold-{id}`（§6.3 #38）。
 * 容器內的 testid（scenario-preset、scenario-result、threshold-pct、sensitivity-result…）在「每個容器內」各只能一次，容器外整頁只能一次。
 */
const INSTANCE_CONTAINER = /^(?:(?:scenario|board-card|action)-\d+|threshold-(?!form-|pct$)[\w-]+)$/;
/** 回傳 html 中重複的 testid（`路徑 > testid×次數`）；樣板容器的內容另外遞迴檢查。 */
function duplicateTestIds(html: string, path = ""): string[] {
  let outside = "", rest = html;
  const inner: { id: string; body: string }[] = [];
  for (;;) {
    const match = [...rest.matchAll(/\sdata-testid="([^"]+)"/g)].find(found => INSTANCE_CONTAINER.test(found[1]));
    if (!match) { outside += rest; break; }
    const body = element(rest, match[0].trim())!;
    const start = rest.indexOf(body);
    const open = body.slice(0, body.indexOf(">") + 1);
    outside += rest.slice(0, start) + open;
    inner.push({ id: match[1], body: body.slice(open.length) });
    rest = rest.slice(start + body.length);
  }
  const here = [...testIdCounts(outside)].filter(([, count]) => count > 1).map(([id, count]) => `${path}${id}×${count}`);
  return [...here, ...inner.flatMap(({ id, body }) => duplicateTestIds(body, `${path}${id} > `))];
}

describe("V3-3 mounted-testids（PRD §6.4 M1／M6）", () => {
  let states: StateMarkup[];
  beforeAll(async () => { states = await pageStates(); }, 60_000);
  const loaded = () => states.filter(state => state.state);

  describe("M1：搬進彈出層的殼層內容保持掛載", () => {
    it("各頁狀態都掛著 §6.3 #1–#23 的殼層 testid（彈出層全部關著）", () => {
      for (const { name, html } of loaded()) {
        const ids = testIdCounts(html);
        const missing = SHELL_TESTIDS.filter(id => !ids.has(id));
        expect(missing, `${name} 少了：${missing.join(", ")}`).toEqual([]);
        const anchors = idCounts(html);
        expect(SHELL_IDS.filter(id => !anchors.has(id)), name).toEqual([]);
      }
    });

    it("空工作區（真正的 Dashboard SSR）也掛著殼層的彈出層與兩個 nav", () => {
      const { html } = states.find(state => state.name === "shell-empty")!;
      const ids = testIdCounts(html);
      expect(EMPTY_SHELL_TESTIDS.filter(id => !ids.has(id))).toEqual([]);
      for (const id of ["main-content", "ai-availability-detail", "data-status-popover", "topbar-cluster", "mobile-more"]) expect(idCounts(html).get(id), id).toBe(1);
      expect(occurrences(html, 'class="skip-link"'), "skip-link").toBe(1);
      expect(occurrences(html, 'class="brand-mark"'), "brand-mark").toBe(1);
    });

    it("彈出層預設關著但仍在 DOM：data-status-popover、mobile-more、AI 說明用 hidden；自訂期間面板不帶 data-open；選單是收合的 <details>", () => {
      for (const { name, html } of states) {
        for (const attr of ['data-testid="data-status-popover"', 'data-testid="mobile-more"', 'id="ai-availability-detail"']) expect(openTag(html, attr), `${name} ${attr}`).toMatch(/\shidden=""/);
        for (const attr of ['data-testid="download-menu"', 'data-testid="workspace-storage"']) {
          const tag = openTag(html, attr)!;
          expect(tag, `${name} ${attr}`).toMatch(/^<details\s/);
          expect(tag, `${name} ${attr}`).not.toMatch(/\sopen=""/);
          expect(tag, `${name} ${attr}`).toContain("topbar-menu");
        }
        if (!html.includes('data-testid="period-bar"')) continue;
        expect(openTag(html, 'data-testid="period-custom-panel"'), name).not.toMatch(/data-open/);
        expect(openTag(html, 'data-testid="period-bar"'), name).not.toMatch(/data-sheet-open/);
        expect(openTag(html, 'data-testid="period-toggle"'), name).toMatch(/aria-expanded="false"/);
        expect(openTag(html, 'data-testid="period-custom"'), name).toMatch(/aria-expanded="false"/);
      }
    });

    it("關著的彈出層裡仍有完整內容：自訂期間（比較方式、4 個日期、套用）、資料狀態（前往資料來源、匯入新資料）、「更多」頁面、匯出選單各組、儲存選單三段", () => {
      for (const { name, html, state } of loaded()) {
        const custom = element(html, 'data-testid="period-custom-panel"')!;
        for (const id of ["previous-start", "previous-end", "current-start", "current-end"]) expect(custom, `${name} #${id}`).toContain(`id="${id}"`);
        expect(custom, name).toContain(`aria-label="${escapeAttr(labels.ui.dashboard.filter.comparisonMode)}"`);
        expect(custom, name).toContain('type="submit"');
        const popover = element(html, 'data-testid="data-status-popover"')!;
        for (const id of ["data-status-go-data", "data-status-import"]) expect(popover, `${name} ${id}`).toContain(`data-testid="${id}"`);
        const more = element(html, 'data-testid="mobile-more"')!;
        const moreItems = [labels.nav.products.label, labels.nav.scenarios.label, labels.nav.data.label, ...(state!.showValidation ? [labels.nav.validation.label] : [])];
        expect([...more.matchAll(/<button[^>]*class="more-item"[^>]*>.*?<span>([^<]+)<\/span><\/button>/g)].map(match => match[1]), name).toEqual(moreItems);
        const menu = element(html, 'data-testid="download-menu"')!;
        for (const id of ["download-meeting-section", "download-templates"]) expect(menu, `${name} ${id}`).toContain(`data-testid="${id}"`);
        for (const text of [labels.downloads.analysisCsv, labels.downloads.channelTableCsv, labels.downloads.manifestJson, labels.buttons.exportPdf, labels.buttons.exportExcel, labels.buttons.exportPptx, labels.meetingPage.menuMarkdown, labels.downloads.decisionMd, labels.downloads.decisionCsv, labels.downloads.decisionJson]) expect(menu, `${name} 匯出：${text}`).toContain(`>${escapeAttr(text)}</button>`);
        const storage = element(html, 'data-testid="workspace-storage"')!;
        expect(storage, `${name} 清空目前資料在儲存選單的危險區`).toMatch(/storage-danger[\s\S]*clear-button/);
        for (const id of ["autosave-status", ...(state!.consent ?? true ? ["autosave-toggle"] : [])]) expect(storage, `${name} ${id}`).toContain(`data-testid="${id}"`);
        expect(occurrences(storage, 'class="storage-group'), `${name} 儲存選單三段`).toBe(3);
      }
    });

    it("需要處理橫幅只在需要時出現；出現時是期間列下方的單一插槽（篩選錯誤 role=alert、部分資料、去年同期理由）", () => {
      for (const { name, html, state } of loaded()) {
        const report = state!.active;
        const yoy = periodPresets(report.dataset.manifest, { previous: report.snapshot.report.previous.period, current: report.snapshot.report.current.period, comparison_mode: report.snapshot.report.scope.comparison_mode }).find(preset => preset.id === "yoy");
        const expectYoy = yoy?.status === "unavailable";
        const needed = !!state!.filterError || state!.status === "partial" || expectYoy;
        const ids = testIdCounts(html);
        expect(ids.get("needs-attention") ?? 0, name).toBe(needed ? 1 : 0);
        expect(ids.get("banner-filter-error") ?? 0, name).toBe(state!.filterError ? 1 : 0);
        expect(ids.get("banner-partial") ?? 0, name).toBe(state!.status === "partial" ? 1 : 0);
        expect(ids.get("preset-reason-visible-yoy") ?? 0, name).toBe(expectYoy ? 1 : 0);
        if (state!.filterError) expect(openTag(html, 'data-testid="banner-filter-error"'), name).toContain('role="alert"');
        if (needed) expect(html.indexOf('data-testid="needs-attention"'), `${name} 橫幅在期間列之後`).toBeGreaterThan(html.indexOf('data-testid="period-bar"'));
      }
      // 至少有一個狀態真的走到每一種橫幅（避免條件全部沒觸發而空過）。
      const all = loaded().map(({ html }) => testIdCounts(html));
      for (const id of ["needs-attention", "banner-filter-error", "banner-partial", "preset-reason-visible-yoy"]) expect(all.some(ids => ids.has(id)), id).toBe(true);
    });

    it("頁首「匯入資料」（page-import）只在資料來源頁；其他頁由資料狀態 popover 的「匯入新資料」進入（§6.3 #23）", () => {
      for (const { name, html, state } of loaded()) expect(testIdCounts(html).get("page-import") ?? 0, name).toBe(state!.panel === "data" ? 1 : 0);
      expect(testIdCounts(states.find(state => state.name === "shell-empty")!.html).get("page-import") ?? 0).toBe(0);
    });

    it("V3-4a 總覽：進階 <details> 收合時期間合計與日均仍掛著；會議入口在本期一句話區塊內、只有一個", () => {
      const { html } = states.find(state => state.name === "overview")!;
      const advanced = element(html, 'data-testid="overview-advanced"')!;
      expect(openTag(html, 'data-testid="overview-advanced"')).toMatch(/^<details\s/);
      expect(openTag(html, 'data-testid="overview-advanced"')).not.toMatch(/\sopen=""/);
      expect(advanced).toContain('data-testid="period-comparison"');
      expect(advanced).toContain('id="daily-average-title"');
      expect(element(html, 'data-testid="weekly-snapshot"')).toContain('data-testid="overview-meeting-entry"');
      for (const id of ["weekly-snapshot", "snapshot-sentence", "copy-summary", "copy-summary-status", "overview-meeting-entry", "kpi-band", "assist-kpis", "overview-advanced", "period-comparison"]) expect(testIdCounts(html).get(id), id).toBe(1);
    });

    it("V3-5 通路健檢：健檢結果在前、各通路兩期比較在後、AI 區最後；AI 區收合（<details data-testid=ai-collapsed>）時 ai-panel 與 ai-* testid 仍掛著，summary 只有文字", () => {
      const { html } = states.find(state => state.name === "diagnosis")!;
      const order = ['data-testid="diagnosis-panel"', 'data-testid="channel-compare"', 'data-testid="ai-collapsed"'].map(attr => html.indexOf(attr));
      expect(order.every(index => index > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      const tag = openTag(html, 'data-testid="ai-collapsed"')!;
      expect(tag).toMatch(/^<details\s/);
      expect(tag).not.toMatch(/\sopen=""/);
      const collapsed = element(html, 'data-testid="ai-collapsed"')!;
      const summary = collapsed.slice(collapsed.indexOf("<summary"), collapsed.indexOf("</summary>") + "</summary>".length);
      expect(summary).not.toMatch(/<button|<a\s|<input|<select|<details|tabindex/i);
      const copy = labels.diagnosis.aiCollapse;
      expect(summary.replace(/<[^>]*>/g, "")).toBe(`${fill(copy.summary, { status: copy.status.off })}${copy.publicNote}`);
      // 公開示範站（能力不可用）時 SSR 會出現的 ai-* testid 全部在收合的 details 裡（與 testid 基準的 diagnosis-ai 情境同一組）。
      for (const id of ["ai-panel", "ai-mode", "ai-status"]) {
        expect(collapsed, id).toContain(`data-testid="${id}"`);
        expect(testIdCounts(html).get(id), id).toBe(1);
      }
      // 每一列健檢的 id 唯一，通路寬表備註欄的同頁連結都指到存在的列。
      const anchors = idCounts(html);
      const links = [...html.matchAll(/\shref="#(diagnosis-row-[A-Z_]+)"/g)].map(match => match[1]);
      expect(links.length).toBeGreaterThan(0);
      for (const id of links) expect(anchors.get(id), id).toBe(1);
    });

    it("V3-5 AI 可用時（需先預覽並同意）：預覽、進階、payload、request、對照等 ai-* testid 也都在收合的 details 裡；summary 不寫公開示範站", async () => {
      const { snapshot } = await load("demo", "demo");
      const capability = { available: true, reason: "AVAILABLE", provider: "openai" as const };
      const html = renderToStaticMarkup(<AiCollapse capability={capability}><AiPanel capability={capability} snapshot={snapshot} revision={1} onEvidence={noop} /></AiCollapse>);
      const collapsed = element(html, 'data-testid="ai-collapsed"')!;
      expect(openTag(html, 'data-testid="ai-collapsed"')).not.toMatch(/\sopen=""/);
      for (const id of ["ai-panel", "ai-mode", "ai-status", "ai-readable-preview", "ai-facts-preview", "ai-advanced", "ai-payload-preview", "ai-request-preview", "ai-local-mapping"]) expect(collapsed, id).toContain(`data-testid="${id}"`);
      const copy = labels.diagnosis.aiCollapse;
      const summary = collapsed.slice(collapsed.indexOf("<summary"), collapsed.indexOf("</summary>"));
      expect(summary.replace(/<[^>]*>/g, "")).toBe(fill(copy.summary, { status: copy.status.needsConsent }));
      expect(html).not.toContain(copy.publicNote);
    });

    it("V3-5 健檢列範圍超過 4 個：其餘 chips 收進「更多範圍」popover，<details> 收合時仍掛著，而且仍是同一組 role=group 的範圍切換", async () => {
      const golden = await load("golden", "golden");
      const scope = (index: number): Scope => ({ kind: "sku", channels: ["DTC"], sku: `S${String(index).padStart(2, "0")}` });
      const diagnostics: Diagnostic[] = Array.from({ length: 9 }, (_, index) => ({ id: `sku-${index}`, code: "SKU_NEGATIVE_GP", scope: scope(index), title: "", fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: { value: `-${index + 1}.00`, reason_codes: [] } }));
      const snapshot = { ...golden.snapshot, report: { ...golden.snapshot.report, diagnostics } };
      const html = renderToStaticMarkup(<Diagnosis snapshot={snapshot} onEvidence={noop} onCreateAction={noop} />);
      const row = element(html, 'data-testid="diagnosis-row-SKU_NEGATIVE_GP"')!;
      const more = element(row, 'class="scope-more ui-popover-host"')!;
      expect(more).toMatch(/^<details\s/);
      expect(more.slice(0, more.indexOf(">") + 1)).not.toMatch(/\sopen=""/);
      expect(more).toContain(`>${fill(labels.diagnosis.listV3.moreScopes, { n: 5 })}</summary>`);
      expect(more.match(/class="scope-chip" aria-pressed=/g)).toHaveLength(5);
      expect(row.match(/class="scope-chip" aria-pressed=/g)).toHaveLength(9);
      expect(occurrences(row, `role="group" aria-label="${escapeAttr(labels.diagnosisList.scopeSwitch)}"`)).toBe(2);
      const duplicates = [...idCounts(html)].filter(([, count]) => count > 1);
      expect(duplicates).toEqual([]);
    });

    it("開發者分組只在 #validation 時出現（§6.3 #3）", () => {
      for (const { name, html, state } of loaded()) expect(testIdCounts(html).get("nav-group-developer") ?? 0, name).toBe(state!.showValidation ? 1 : 0);
    });

    it("匯入精靈步驟 1 與資料來源頁同時掛著，期間列與殼層不重複", () => {
      const { html } = states.find(state => state.name === "import-step-1")!;
      const ids = testIdCounts(html);
      for (const id of ["import-wizard", "import-stepper", "import-step-1", "page-import", "period-bar"]) expect(ids.get(id), id).toBe(1);
    });

    // ── V3-6 A（假設試算）的 M1 掛載測試在此之後新增（範本 ? popover 的 scenario-preset-purpose／scenario-template-note、範圍提示 hidden 掛載、匯出選單）──
    it("V3-6 假設試算：範本 ? 說明（用途、只是起點）與範圍提示 hidden 掛載；匯出本頁三項在收合的 details 內；每個方案欄內各一份", () => {
      for (const name of ["scenarios", "scenarios-first-visit"]) {
        const { html } = states.find(state => state.name === name)!;
        const plans = [...html.matchAll(/\sdata-testid="(scenario-\d+)"/g)].map(match => match[1]);
        expect(plans.length, name).toBe(name === "scenarios" ? 2 : 1);
        for (const plan of plans) {
          const column = element(html, `data-testid="${plan}"`)!;
          const ids = testIdCounts(column);
          for (const id of ["scenario-preset", "scenario-preset-apply", "scenario-preset-purpose", "scenario-template-note", "scenario-range-volume_change_pct", "scenario-range-one_time_cost", "scenario-equivalent-volume_change_pct", "scenario-absolute-error-volume_change_pct", "scenario-mode-volume_change_pct", "scenario-result"]) expect(ids.get(id), `${name} ${plan} ${id}`).toBe(1);
          // 範本說明在 ? popover（role=region、hidden）內；觸發器的 aria-controls 指到它。
          const help = element(column, 'class="ui-popover ui-help-content scenario-help-panel"')!;
          expect(help, `${name} ${plan}`).toMatch(/^<div id="[^"]+" role="region"[^>]*\shidden=""/);
          for (const id of ["scenario-preset-purpose", "scenario-template-note"]) expect(help, `${name} ${plan} ${id}`).toContain(`data-testid="${id}"`);
          const helpId = /^<div id="([^"]+)"/.exec(help)![1];
          expect(column, `${name} ${plan}`).toContain(`aria-expanded="false" aria-controls="${helpId}"`);
          expect(idCounts(html).get(helpId), helpId).toBe(1);
        }
        // 範圍提示沒有超出時 hidden（方案 1 都在範圍內）；第 2 個方案銷量 250% 超出，提示看得到。
        expect(openTag(element(html, 'data-testid="scenario-1"')!, 'data-testid="scenario-range-volume_change_pct"'), name).toMatch(/\shidden=""/);
        if (name === "scenarios") expect(openTag(element(html, 'data-testid="scenario-2"')!, 'data-testid="scenario-range-volume_change_pct"')).not.toMatch(/\shidden=""/);
        // 頁首「匯出本頁」：SSR 時在工作台頂端；收合的 details（auto-close），三項各一份。
        const menuTag = openTag(html, 'data-testid="scenario-export-menu"')!;
        expect(menuTag, name).toMatch(/^<details class="topbar-menu auto-close export-page/);
        expect(menuTag, name).not.toMatch(/\sopen=""/);
        const menu = element(html, 'data-testid="scenario-export-menu"')!;
        for (const id of ["export-page-scenarios", "scenario-export-md", "scenario-export-csv", "scenario-export-json"]) {
          expect(menu, `${name} ${id}`).toContain(`data-testid="${id}"`);
          expect(testIdCounts(html).get(id), `${name} ${id}`).toBe(1);
        }
        // 試算通路的 ? 說明也是 hidden 掛載；試算通路 select 只有一份。
        expect(testIdCounts(html).get("scenario-channel"), name).toBe(1);
        expect(occurrences(html, `aria-label="${escapeAttr(labels.scenarios.pageV3.channelHelpAria)}" aria-expanded="false"`), name).toBe(1);
      }
      // 其他頁也掛著試算工作台（hidden 切換）：試算通路 select 與頁首插槽各只有一份。
      for (const { name, html } of loaded()) {
        expect(testIdCounts(html).get("scenario-channel") ?? 0, name).toBe(1);
        expect(testIdCounts(html).get("page-actions"), name).toBe(1);
      }
    });


    // ── V3-6 B（待辦）的 M1 掛載測試在此之後新增（頁首 ? 說明、匯出選單 actions-export-*、看板卡「移到」列）──
    it("V3-6 B 待辦：頁首 ? 說明 hidden 掛載；匯出本頁三項在收合的 <details> 內；SSR 時頁首節點 inline 一份、頁首插槽是空的", () => {
      for (const name of ["actions", "actions-list", "actions-empty"]) {
        const { html } = states.find(state => state.name === name)!;
        const ids = testIdCounts(html);
        for (const id of ["actions-workbench", "actions-count", "actions-help", "actions-export-menu", "export-page-actions", "actions-export-md", "actions-export-csv", "actions-export-json"]) expect(ids.get(id), `${name} ${id}`).toBe(1);
        // 「新增待辦」全頁唯一：有待辦時在頁首（actions-add），空狀態時只在空狀態區（actions-empty-add）。
        expect(ids.get("actions-add"), `${name} actions-add`).toBe(name === "actions-empty" ? undefined : 1);
        expect(ids.get("actions-empty-add"), `${name} actions-empty-add`).toBe(name === "actions-empty" ? 1 : undefined);
        expect(openTag(html, 'data-testid="actions-help"'), name).toMatch(/\shidden=""/);
        expect(openTag(html, `aria-controls="actions-help-panel"`), name).toMatch(/aria-expanded="false"/);
        const menu = openTag(html, 'data-testid="actions-export-menu"')!;
        expect(menu, name).toMatch(/^<details\s/);
        expect(menu, name).not.toMatch(/\sopen=""/);
        expect(menu, name).toContain("topbar-menu auto-close export-page");
        const body = element(html, 'data-testid="actions-export-menu"')!;
        for (const format of ["md", "csv", "json"]) expect(body, `${name} actions-export-${format}`).toContain(`data-testid="actions-export-${format}"`);
        const inline = element(html, 'class="actions-page-head-inline"')!;
        for (const id of ["actions-count", "actions-help", "actions-export-menu", ...(name === "actions-empty" ? [] : ["actions-add"])]) expect(inline, `${name} ${id} inline`).toContain(`data-testid="${id}"`);
        expect(element(html, 'id="page-actions"'), name).toBe('<div class="page-actions" id="page-actions" data-testid="page-actions"></div>');
        expect(element(html, 'id="page-title-addon"'), name).toBe('<div class="page-title-addon" id="page-title-addon" data-testid="page-title-addon"></div>');
        // 試算工作台每頁都掛著（hidden），所以只數待辦工作台內的主要按鈕；清單檢視的內嵌編輯器自成一個容器（C12 每個容器最多 1 顆），不在此計。
        if (name !== "actions-list") expect(occurrences(element(html, 'data-testid="actions-workbench"')!, "ui-btn-primary"), `${name} 待辦頁唯一主要按鈕`).toBe(1);
      }
    });

    it("V3-6 B 待辦看板：每張卡的「移到」三個文字按鈕與「編輯」各一份、可及名稱是「移到{狀態}」；看板不渲染 action-{n}；清單不渲染看板；空狀態不渲染看板（工具列仍在）", () => {
      const { html } = states.find(state => state.name === "actions")!;
      const ids = testIdCounts(html);
      const moves: Record<string, string[]> = { "board-card-1": ["not_started", "blocked", "completed"], "board-card-2": ["in_progress", "blocked", "completed"] };
      const statusName: Record<string, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
      for (const [card, statuses] of Object.entries(moves)) {
        const body = element(html, `data-testid="${card}"`)!;
        for (const status of statuses) {
          expect(ids.get(`${card}-move-${status}`), `${card}-move-${status}`).toBe(1);
          expect(openTag(body, `data-testid="${card}-move-${status}"`), status).toContain(`aria-label="${escapeAttr(fill(labels.actionBoard.moveTo, { status: statusName[status] }))}"`);
        }
        expect(ids.get(`${card}-edit`), `${card}-edit`).toBe(1);
        expect(body, card).not.toMatch(/<details|<dl/);
      }
      for (const id of ["actions-toolbar", "actions-view-board", "actions-view-list", "action-board", "board-column-not_started", "board-column-in_progress", "board-column-blocked", "board-column-completed"]) expect(ids.get(id), id).toBe(1);
      expect([...ids.keys()].filter(id => /^action-\d+$/.test(id)), "看板不渲染 action-{n}").toEqual([]);
      expect(ids.has("evidence-checklist")).toBe(false);
      expect(ids.has("action-drawer"), "抽屜是條件渲染的 dialog（同 v2）").toBe(false);
      const list = testIdCounts(states.find(state => state.name === "actions-list")!.html);
      for (const id of ["action-1", "action-2", "actions-view-list"]) expect(list.get(id), `actions-list ${id}`).toBe(1);
      expect([...list.keys()].filter(id => /^(?:board-card-|board-column-|action-board$)/.test(id)), "清單不渲染看板").toEqual([]);
      const empty = testIdCounts(states.find(state => state.name === "actions-empty")!.html);
      // 空狀態：工具列仍在（可先選檢視，同 v2），看板與「新增待辦」頁首鈕不渲染。
      for (const id of ["actions-empty", "actions-empty-add", "actions-toolbar", "actions-view-board", "actions-view-list"]) expect(empty.get(id), `actions-empty ${id}`).toBe(1);
      for (const id of ["action-board", "actions-add"]) expect(empty.has(id), `actions-empty ${id}`).toBe(false);
    });


    // ── V3-6 C（待辦編輯抽屜）的 M1 掛載測試在此之後新增（清單檢視的內嵌編輯器三段仍常駐；抽屜是條件渲染的 dialog，同 v2）──
    it("V3-6 C：看板狀態沒有 action-{n}、evidence-checklist 與待辦編輯抽屜（抽屜是條件渲染的 dialog，同 v2；看板與清單不同時渲染）", () => {
      const { html } = states.find(state => state.name === "actions")!;
      const ids = testIdCounts(html);
      expect([...ids.keys()].filter(id => /^action-\d+$/.test(id))).toEqual([]);
      for (const id of ["evidence-checklist", "action-drawer", "action-drawer-close", "action-drawer-remove"]) expect(ids.get(id) ?? 0, id).toBe(0);
      expect(html).not.toContain('<dialog class="action-drawer"');
      for (const id of ["board-card-1", "board-card-2"]) expect(ids.get(id), id).toBe(1);
    });

    it("V3-6 C：清單檢視每個 action-{n} 內嵌同一個編輯器的三段（內容／引用的數字／歷史），evidence-checklist 各一份；收合的限制與技術細節仍掛著；id 不重複", async () => {
      const golden = await load("golden", "golden");
      const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
      const workspace = addActionDraft(addActionDraft(emptyActionWorkspace(), golden, "a1", diagnostic.id), golden, "a2");
      const html = renderToStaticMarkup(<ActionsWorkbench workspace={workspace} onChange={noop} source={golden} onEvidence={noop} onExport={noop} view="list" onViewChange={noop} />);
      const copy = labels.actions.drawerV3;
      for (const n of [1, 2]) {
        const item = element(html, `data-testid="action-${n}"`)!;
        const regions = [copy.content, copy.evidence, copy.history].map(name => element(item, `role="region" aria-label="${escapeAttr(name)}"`));
        expect(regions.every(Boolean), `action-${n}`).toBe(true);
        expect(regions.map(region => item.indexOf(region!)), `action-${n}`).toEqual([...regions.map(region => item.indexOf(region!))].sort((a, b) => a - b));
        expect(testIdCounts(item).get("evidence-checklist"), `action-${n}`).toBe(1);
        expect(regions[1], `action-${n}`).toContain('data-testid="evidence-checklist"');
        expect(regions[2], `action-${n}`).toContain(`<summary>${labels.sections.technicalDetails}</summary>`);
        for (const region of regions) expect(region, `action-${n}`).not.toMatch(/<details[^>]*\sopen=""/);
      }
      expect(element(html, `data-testid="action-1"`)).toContain(`<summary>${labels.ui.actionsWorkbench.limitations}</summary>`);
      expect(testIdCounts(html).get("action-drawer") ?? 0).toBe(0);
      expect([...idCounts(html)].filter(([, count]) => count > 1)).toEqual([]);
      expect(duplicateTestIds(html)).toEqual([]);
    });

  });

  describe("M6：同一個控制在 DOM 只有一個實例", () => {
    it("每個 testid 在每個狀態只出現一次（方案欄、看板卡、門檻區塊內的 testid 依實例數計）", () => {
      for (const { name, html } of states) {
        const duplicates = duplicateTestIds(html);
        expect(duplicates, `${name} 重複：${duplicates.join(", ")}`).toEqual([]);
      }
      // 樣板容器真的有被拆開檢查（試算兩個方案欄、看板兩張卡）。
      const scenarios = states.find(state => state.name === "scenarios")!.html, actions = states.find(state => state.name === "actions")!.html;
      for (const id of ["scenario-1", "scenario-2"]) expect(testIdCounts(scenarios).get(id), id).toBe(1);
      for (const id of ["board-card-1", "board-card-2"]) expect(testIdCounts(actions).get(id), id).toBe(1);
    });

    it("§6.3 #1–#23 的殼層 testid 與表單 id 各恰好一次", () => {
      for (const { name, html } of loaded()) {
        const ids = testIdCounts(html), anchors = idCounts(html);
        for (const id of SHELL_TESTIDS) expect(ids.get(id), `${name} data-testid=${id}`).toBe(1);
        for (const id of SHELL_IDS) expect(anchors.get(id), `${name} #${id}`).toBe(1);
      }
    });

    it("每個 id 屬性在每個狀態都唯一（label for／aria-controls 不會指錯元素）", () => {
      for (const { name, html } of states) {
        const duplicates = [...idCounts(html)].filter(([, count]) => count > 1).map(([id, count]) => `${id}×${count}`);
        expect(duplicates, `${name} 重複 id：${duplicates.join(", ")}`).toEqual([]);
      }
    });

    it("殼層的 aria-controls 與 label for 都指到唯一存在的元素", () => {
      for (const { name, html } of states) {
        const anchors = idCounts(html);
        const shellRegion = [element(html, '<header class="topbar"') ?? "", element(html, 'data-testid="mobile-tabbar"') ?? "", element(html, 'data-testid="period-bar"') ?? ""].join("");
        for (const match of shellRegion.matchAll(/\saria-controls="([^"]+)"/g)) for (const id of match[1].split(/\s+/)) expect(anchors.get(id), `${name} aria-controls=${id}`).toBe(1);
        for (const match of shellRegion.matchAll(/\sfor="([^"]+)"/g)) expect(anchors.get(match[1]), `${name} for=${match[1]}`).toBe(1);
      }
    });

    it("期間列的通路 select、比較方式 select、4 個日期欄位各只有一份（桌機 popover 與手機底部面板共用 #period-bar-panel）", () => {
      for (const { name, html } of loaded()) {
        const bar = element(html, 'data-testid="period-bar"')!;
        expect(occurrences(html, `aria-label="${escapeAttr(labels.ui.dashboard.filter.channel)}"`), `${name} 通路 select`).toBe(1);
        expect(occurrences(bar, "<select"), `${name} 期間列 select 數`).toBe(2);
        expect(occurrences(bar, 'type="date"'), `${name} 期間列日期欄位數`).toBe(4);
        expect(occurrences(html, 'id="period-bar-panel"'), name).toBe(1);
        expect(element(html, 'id="period-bar-panel"'), `${name} 自訂期間在期間面板內`).toContain('data-testid="period-custom-panel"');
        expect(occurrences(bar, 'class="period-bar"'), name).toBe(1);
      }
    });

    it("儲存選單的 checkbox 各一個（同意本機保存、自動保存；自動保存在同意後才出現，同 v2）", () => {
      for (const { name, html, state } of states) {
        const storage = element(html, 'data-testid="workspace-storage"')!;
        const consent = state ? state.consent ?? true : false;
        expect(occurrences(storage, 'type="checkbox"'), `${name} 儲存選單 checkbox 數`).toBe(consent ? 2 : 1);
        expect(occurrences(html, 'class="local-save-consent"'), `${name} 同意本機保存`).toBe(1);
        expect(testIdCounts(html).get("autosave-toggle") ?? 0, `${name} 自動保存`).toBe(consent ? 1 : 0);
        expect(occurrences(html, "clear-button"), `${name} 清空目前資料`).toBe(1);
        expect(occurrences(html, 'data-testid="workspace-storage"'), name).toBe(1);
      }
    });

    it("兩個 nav 各一個，aria-label 不同（桌機「主要導覽」、手機「手機導覽」）", () => {
      for (const { name, html } of states) {
        const navs = [...html.matchAll(/<nav\b[^>]*>/g)].map(match => /aria-label="([^"]*)"/.exec(match[0])?.[1] ?? "");
        const main = escapeAttr(labels.ui.dashboard.mainNavAria), mobile = escapeAttr(labels.shell.mobileNav.aria);
        expect(main, name).not.toBe(mobile);
        expect(navs.filter(label => label === main).length, `${name} 主要導覽`).toBe(1);
        expect(navs.filter(label => label === mobile).length, `${name} 手機導覽`).toBe(1);
        expect(openTag(html, `aria-label="${mobile}"`), name).toContain('data-testid="mobile-tabbar"');
        expect(element(html, `aria-label="${main}"`), `${name} 側欄 nav 在 aside 內`).toContain('data-testid="nav-group-results"');
        // 兩個 nav 指向同一組頁面，但手機列只放前四頁＋更多；aria-current 各自只有一個（或在「更多」面板內）。
        const mainNav = element(html, `aria-label="${main}"`)!, mobileNav = element(html, `aria-label="${mobile}"`)!;
        expect(occurrences(mainNav, 'aria-current="page"'), `${name} 側欄 aria-current`).toBe(1);
        expect(occurrences(mobileNav, 'aria-current="page"'), `${name} 手機 aria-current`).toBe(1);
      }
    });

    it("桌機頂欄群組與手機「更多」面板沒有重複任何控制（同一份 DOM，CSS 重新定位）", () => {
      for (const { name, html } of states) {
        const cluster = element(html, 'id="topbar-cluster"')!, more = element(html, 'data-testid="mobile-more"')!;
        const clusterIds = [...testIdCounts(cluster).keys()], moreIds = new Set(testIdCounts(more).keys());
        expect(clusterIds.filter(id => moreIds.has(id)), name).toEqual([]);
        for (const id of ["ai-availability", "workspace-storage", "download-menu"]) {
          expect(cluster, `${name} ${id} 在頂欄群組`).toContain(`data-testid="${id}"`);
          expect(occurrences(html, `data-testid="${id}"`), `${name} ${id}`).toBe(1);
        }
        // 指標定義（icon 按鈕）只有頂欄一個；頁尾的「指標定義」是另一個入口（§6.3 #12 三個入口都保留）。
        expect(occurrences(html, "basis-button"), `${name} 頂欄指標定義`).toBe(1);
        expect(cluster, name).toContain(`aria-label="${escapeAttr(labels.buttons.basis)}"`);
        expect(occurrences(html, "footer-basis"), `${name} 頁尾指標定義`).toBe(1);
        // 「更多」面板只放頁面導覽，不放頂欄的控制；topbar-more 同時控制兩者。
        expect(more, name).not.toMatch(/topbar-menu|ai-availability|basis-button/);
        expect(openTag(html, 'data-testid="topbar-more"'), name).toMatch(/aria-controls="topbar-cluster mobile-more"/);
        expect(occurrences(html, 'data-testid="mobile-tabbar-more"'), name).toBe(1);
      }
    });
  });

  describe("Dashboard 的組法與本測試一致（防漂移）", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    it("每個殼層元件在 Dashboard 只實例化一次", () => {
      for (const component of ["ShellFrame", "ExportMenu", "WorkspaceStorage", "PageHeader", "PeriodBar", "NeedsAttention", "ShellFooter", "ImportWizard", "MultiScenarioWorkbench", "ActionsWorkbench", "EvidenceDrawer", "BasisDialog", "Overview", "Diagnosis", "AiCollapse", "AiPanel", "ProductComparisonPanel", "DataWorkspace", "MeetingPage", "MeetingEntry"]) expect(source.match(new RegExp(`<${component}[\\s/>]`, "g"))?.length ?? 0, component).toBe(1);
    });
    it("V3-5：通路健檢的 AI 區包在 AiCollapse 裡（預設收合），與 shellPage() 的組法相同", () => {
      expect(source).toMatch(/<AiCollapse capability=\{aiCapability\}><AiPanel key=\{restoreEpoch\} capability=\{aiCapability\} /);
    });
    it("掛載條件與 shellPage() 相同：試算工作台每頁都掛著（hidden 切換）、匯入精靈只在資料來源頁顯示、期間列與橫幅在有資料或套用中時掛著", () => {
      expect(source).toMatch(/\{active && <div hidden=\{!visible \|\| panel !== "scenarios"\}><MultiScenarioWorkbench /);
      expect(source).toMatch(/\{showImport && <div hidden=\{panel !== "data"\}><ImportWizard /);
      expect(source).toMatch(/\{active && \(visible \|\| status === "loading"\) && <>\s*<PeriodBar/);
      expect(source).toMatch(/\{visible && <NeedsAttention /);
      expect(source).toMatch(/storage=\{<WorkspaceStorage /);
      expect(source).toMatch(/exportMenu=\{<ExportMenu /);
      expect(source).toMatch(/<BasisDialog open=\{basisOpen\}/);
      // V3-4a：會議入口搬進總覽的本期一句話區塊（Overview 的 meetingEntry），不再在 Overview 外渲染。
      expect(source).toMatch(/meetingEntry=\{<MeetingEntry /);
    });
  });
});
