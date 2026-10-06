import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, FileName } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, type ActionWorkspace } from "@/application/action-workspace";
import { finalizeMeeting, freezeMeeting, type Meeting } from "@/application/meeting";
import { buildManagerSummary } from "@/application/manager-summary";
import { parseTargets } from "@/application/targets";
import { parseEvents } from "@/application/events";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import type { MappingMemoryEntry } from "@/application/mapping-memory";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/shell/page-chrome";
import { Overview } from "@/components/overview";
import { Diagnosis, DataWorkspace, Products } from "@/components/workspace-panels";
import { AiPanel } from "@/components/ai-panel";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { MultiScenarioWorkbench } from "@/components/multi-scenario-workbench";
import { DecisionWorkbench } from "@/components/decision-workbench";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { MeetingEntry, MeetingHistory, MeetingPage, type MeetingPageProps } from "@/components/meeting-page";
import { PrintSummary } from "@/components/manager-summary";
import { ImportWizard } from "@/components/import-wizard";
import { StepFiles } from "@/components/import-wizard/step-files";
import { StepMapping } from "@/components/import-wizard/step-mapping";
import { StepBasis } from "@/components/import-wizard/step-basis";
import { StepReview } from "@/components/import-wizard/step-review";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { BasisDialog } from "@/components/basis-dialog";
import { WorkspaceStorage } from "@/components/workspace-storage";
import { IssueList } from "@/components/issue-list";

/*
 * V3-0 testid 基準（PRD §11.7、§6.4 M1）：比對「實際渲染」出來的 data-testid，不是只 grep 原始碼。
 * - verification/revamp-v3/testids-v2.txt 每列「testid<TAB>來源<TAB>說明」。
 *   來源 ssr：本檔以 renderToStaticMarkup 渲染 golden／示範資料的各頁狀態後必須出現（嚴格比對；少一個就失敗）。
 *   來源 e2e：只在瀏覽器互動後才出現（例如 #validation、開啟確認框），由 verification/revamp-v3/collect-testids.spec.ts 在真實瀏覽器收集；
 *            本檔對這些 id 退一步檢查「原始碼仍會產生它」（字面值或樣板前綴），真正的渲染比對在 Playwright。
 *   來源 cond：條件項（失敗、IndexedDB 既有副本等），SSR 與收集流程都不會進入；同樣只做原始碼檢查，並在說明欄列出覆蓋它的既有 E2E。
 * - 新增 testid 不會失敗；刪除（或改名）任何一個列在清單上的 testid 都會失敗。
 * - TESTID_BASELINE_DUMP=<路徑> 時，把本次 SSR 收集結果（id → 情境）寫成 JSON，供重新產生清單時使用。
 */
const BASELINE = resolve("verification/revamp-v3/testids-v2.txt");
const noop = () => undefined;
const asyncNoop = async () => undefined;
const testIds = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map(match => match[1]);

async function source(name: string, filters: AnalysisFilters = {}): Promise<ScenarioSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
const bytes = (text: string) => new TextEncoder().encode(text);
const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
function wizardFiles(dir: string, overrides: Partial<Record<FileName, { name?: string; text: string }>> = {}, memory: Partial<Record<FileName, MappingMemoryEntry>> = {}): WizardState {
  let state = initialWizardState();
  for (const role of roles) {
    const override = overrides[role];
    const content = override ? bytes(override.text) : new Uint8Array(readFileSync(resolve(dir, role)));
    const name = override?.name ?? role;
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name, size: content.byteLength, bytes: content }), encoding: "utf8", memory: memory[role] ?? null });
  }
  return state;
}

/** 各頁狀態：每個情境回傳一段 SSR markup。情境名寫進清單說明欄，方便追查某個 testid 從哪個狀態來。 */
async function scenarios(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const render = (name: string, element: ReactElement) => { out[name] = renderToStaticMarkup(element); };

  // 殼層：空工作區（Dashboard 是 client 元件，載入資料要經過 fetch／effect，載入後的殼層由 Playwright 收集）。
  render("shell-empty", createElement(Dashboard, { analytics: true }));
  // V3-3（§6.3 #23）：頁首「匯入資料」（page-import）只留在資料來源頁；Dashboard 的 SSR 停在總覽，這裡直接渲染資料來源頁的頁首。
  render("shell-data-header", createElement(PageHeader, { title: "", description: "", isData: true, showLoadDemo: true, onLoadDemo: noop, onImport: noop }));

  const demo = await source("demo");
  const golden = await source("golden");
  const goldenDtc = await source("golden", { channels: ["DTC"] });
  const { dataset, snapshot } = demo;
  const period = snapshot.report.current.period;
  const targets = parseTargets({ name: "targets.csv", bytes: bytes(["period_start,period_end,channel,metric,target", ...["net_revenue", "gross_profit", "contribution_after_marketing", "ad_spend"].map(metric => `${period.start},${period.end},ALL,${metric},${metric === "ad_spend" ? "-50000.00" : "100000.00"}`)].join("\n")) }, dataset.manifest.channels);
  const events = parseEvents({ name: "events.csv", bytes: bytes(`start,end,label\n${period.start},${period.end},週年慶\n`) });
  const badTargets = parseTargets({ name: "bad.csv", bytes: bytes("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,ALL,profit,1\n") }, dataset.manifest.channels);
  const badEvents = parseEvents({ name: "bad-events.csv", bytes: bytes("start,end,label\n2026-13-01,2026-08-31,x\n") });

  // 總覽（示範資料、有目標與檔期、期間合計展開）＋會議入口。
  render("overview", createElement(Overview, { snapshot, onEvidence: noop, onCreateAction: noop, periodOpen: true, onPeriodToggle: noop, targets: targets.set, events: events.set, allChannels: dataset.manifest.channels }));
  // 健檢＋ AI（未知能力與可用兩種）。
  render("diagnosis", createElement(Diagnosis, { snapshot, onEvidence: noop, onCreateAction: noop, events: events.set }));
  render("diagnosis-ai", createElement(AiPanel, { snapshot, revision: 1, onEvidence: noop, capability: null }));
  render("diagnosis-ai-available", createElement(AiPanel, { snapshot, revision: 1, onEvidence: noop, capability: { available: true, reason: "AVAILABLE", provider: "openai" } }));
  // 商品毛利（Dashboard 掛的是 ProductComparisonPanel；workspace-panels 的 Products 也有 product-table，PRD #36 要求兩處都納入）。
  render("products", createElement(ProductComparisonPanel, { dataset, snapshot, onEvidence: noop }));
  render("products-legacy", createElement(Products, { dataset, snapshot, onEvidence: noop }));

  // 匯入精靈：步驟 1（ImportWizard 本體）；步驟 1–4 的子元件以 reducer 推進狀態後直接渲染。
  render("import-step-1", createElement(ImportWizard, { onCommit: asyncNoop, onCancel: noop, busy: false, localSaveConsented: false }));
  const alternative = resolve("tests/fixtures/alternative"), inclusive = resolve("tests/fixtures/inclusive_tax");
  const orderLevel = wizardFiles(alternative, { "sales_daily.csv": { name: "orders.csv", text: "訂單號碼,訂單日期,商品貨號,商品名稱,數量,商品金額\n#1001,2026-09-01,SKU-1,T,1,100\n" } });
  render("import-step-1-order-level", createElement(StepFiles, { state: orderLevel, onPick: noop, onDrop: noop, onRemove: noop, onManifest: noop, onManifestClear: noop, dropNotice: "" }));
  render("import-step-2-order-level", createElement(StepMapping, { state: wizardReducer(orderLevel, { type: "next" }), onMap: noop, onIgnore: noop }));
  // 非訂單層級的平台範本（Meta 廣告日報）只顯示範本提示。
  render("import-step-2-preset", createElement(StepMapping, { state: wizardReducer(wizardFiles(alternative, { "ad_spend_daily.csv": { name: "meta-ads.csv", text: "Day,Campaign name,Amount spent (TWD),Currency\n2026-08-01,Brand,100,TWD\n" } }), { type: "next" }), onMap: noop, onIgnore: noop }));
  const headers = ["日期", "channel", "商品貨號", "品類", "件數", "商品金額", "折扣", "退款", "成本", "幣別"];
  const salesText = readFileSync(resolve(alternative, "sales_daily.csv"), "utf8").replace(/^[^\n]*/, headers.join(","));
  const memory = { key: "k", role: "sales_daily.csv" as const, headers, mapping: { date: "日期", sku: "商品貨號", category: "品類", units_sold: "件數", gross_sales: "商品金額", discounts: "折扣", refunds: "退款", cogs_net: "成本", currency: "幣別", channel: "channel" }, preset_id: null, basis: null, rate: null, convert_fields: [], used_at: "2026-09-28" };
  render("import-step-2-memory", createElement(StepMapping, { state: wizardReducer(wizardFiles(alternative, { "sales_daily.csv": { name: "銷售.csv", text: salesText } }, { "sales_daily.csv": memory }), { type: "next" }), onMap: noop, onIgnore: noop }));
  const basis = wizardReducer(wizardReducer(wizardFiles(inclusive), { type: "next" }), { type: "basis", basis: "inclusive" });
  render("import-step-3-inclusive", createElement(StepBasis, { state: basis, dispatch: noop }));
  const confirmed = wizardReducer(basis, { type: "confirm" });
  const checked = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) });
  render("import-step-4-inclusive", createElement(StepReview, { state: checked, filenames: {}, onCommit: noop, busy: false, memoryPersistent: false }));
  const prepared = checked.candidate!;

  // 資料來源頁：含稅換算、目標／檔期與其錯誤、資料問題表。
  const imported = validateDataset(prepared.input!).dataset!;
  const importedSnapshot = await createSnapshot(imported, {}, await hashInput(prepared.input!));
  render("data", createElement(DataWorkspace, { dataset: imported, snapshot: importedSnapshot, conversion: prepared.conversion, targets: targets.set, events: events.set, targetIssues: badTargets.issues, eventIssues: badEvents.issues, onTargets: noop, onEvents: noop, onRemoveTargets: noop, onRemoveEvents: noop, onRemoveTargetRow: noop, onRemoveEventRow: noop }));
  const missing = await source("errors/missing_cogs");
  render("data-issues", createElement(IssueList, { issues: missing.dataset.issues }));
  // 計算與來源抽屜（含稅換算註記）與指標定義 dialog。
  render("evidence-drawer", createElement(EvidenceDrawer, { dataset: imported, snapshot: importedSnapshot, conversion: prepared.conversion, rawValues: prepared.raw_values, evidence: { title: "淨營收", name: "net_revenue", metric: importedSnapshot.report.current.metrics.net_revenue, period: importedSnapshot.report.current.period, channels: importedSnapshot.report.scope.channels, sources: importedSnapshot.report.current.sources }, onClose: noop, onBasis: noop }));
  render("basis-dialog", createElement(BasisDialog, { open: true, onClose: noop }));

  // 試算：golden DTC 一個已計算方案（含「要賣到多少才划算」）＋一個草稿方案；另一通路有方案（其他通路方案）。
  const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  let scenariosWs: ScenarioWorkspace = ensureScenarioContext(emptyScenarioWorkspace("e"), goldenDtc);
  const context = scenariosWs.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs });
  draft.scenarios = saveScenario(context.session, draft.scenarios, { id: "q", name: "超出範圍", inputs: { ...inputs, volume_change_pct: "250" } });
  scenariosWs = updateScenarioContext(scenariosWs, context.id, draft);
  render("scenarios", createElement(MultiScenarioWorkbench, { source: goldenDtc, state: scenariosWs, setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
  // 進頁即表單（尚未寫入的草稿方案）；zero_ad 的廣告費為 0，絕對值切換不可用並附理由。
  render("scenarios-first-visit", createElement(MultiScenarioWorkbench, { source: goldenDtc, state: emptyScenarioWorkspace("e"), setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
  render("scenarios-zero-ad", createElement(MultiScenarioWorkbench, { source: await source("zero_ad", { channels: ["DTC"] }), state: emptyScenarioWorkspace("e"), setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
  // 基準不可試算（多通路基準；app 內在基準缺資料時出現同一個提示）。
  render("scenarios-ineligible", createElement(DecisionWorkbench, { dataset: golden.dataset, snapshot: golden.snapshot, revision: 1, input: golden.input, state: emptyDecisionWorkspace(), setState: noop, onEvidence: noop }));

  // 待辦：看板（含一張卡）與清單兩種檢視。
  const diagnostic = golden.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), golden, "a1", diagnostic.id);
  actions = addActionDraft(actions, golden, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  render("actions-board", createElement(ActionsWorkbench, { workspace: actions, onChange: noop, source: golden, onEvidence: noop, onExport: noop, view: "board" }));
  render("actions-list", createElement(ActionsWorkbench, { workspace: actions, onChange: noop, source: golden, onEvidence: noop, onExport: noop, view: "list" }));

  // 會議：草稿（選入方案、置頂待辦）、尚未建立（review 為 null）、已結束一場後的比較與歷史、列印版。
  let review: ReviewSession = createReviewSession(golden, "e", "rev-1");
  review = selectReviewScenario(review, scenariosWs, scenarioSelectionRef(scenariosWs.contexts[0], "p"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, { name: "十月例會", decision_state: "adopted", notes: "照做", meeting_date: "2026-10-03" });
  const meeting: Meeting = freezeMeeting(finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: scenariosWs, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" }));
  const meetingProps: MeetingPageProps = { source: golden, scenarioWorkspace: scenariosWs, actionWorkspace: actions, review, history: [], onChange: noop, onEvidence: noop, onFinalize: asyncNoop, onRemoveMeeting: noop, onCreateAction: noop };
  render("meeting-draft", createElement(MeetingPage, meetingProps));
  render("meeting-with-history", createElement(MeetingPage, { ...meetingProps, history: [meeting] }));
  render("meeting-empty-draft", createElement(MeetingPage, { ...meetingProps, scenarioWorkspace: emptyScenarioWorkspace("e"), actionWorkspace: emptyActionWorkspace(), review: createReviewSession(golden, "e", "rev-2") }));
  render("meeting-none", createElement(MeetingPage, { ...meetingProps, review: null, history: [meeting] }));
  // 第二場會議（同一份資料）結束時凍結了對第一場的追蹤：歷史展開內容有 meeting-history-followup／-kpis。
  const review2 = updateReviewSession(createReviewSession(golden, "e", "rev-2"), { name: "十一月例會", meeting_date: "2026-11-03" });
  const meeting2: Meeting = freezeMeeting(finalizeMeeting({ review: review2, snapshot: await rebuildReviewSnapshot(review2), scenarios: scenariosWs, actions, date: "2026-11-03", now: "2026-11-03T06:00:00.000Z", history: [meeting] }));
  render("meeting-history", createElement(MeetingHistory, { history: [meeting, meeting2], onRemove: noop }));
  // 會議範圍與目前檢視不同（目前只看 DTC）；上次會議來自另一份資料（示範資料）。
  render("meeting-view-differs", createElement(MeetingPage, { ...meetingProps, source: goldenDtc }));
  const demoReview = updateReviewSession(createReviewSession(demo, "e", "rev-demo"), { name: "示範例會", meeting_date: "2026-09-01" });
  const demoMeeting: Meeting = freezeMeeting(finalizeMeeting({ review: demoReview, snapshot: await rebuildReviewSnapshot(demoReview), scenarios: emptyScenarioWorkspace("e"), actions: emptyActionWorkspace(), date: "2026-09-01", now: "2026-09-01T06:00:00.000Z" }));
  render("meeting-different-dataset", createElement(MeetingPage, { ...meetingProps, history: [demoMeeting] }));
  render("overview-meeting-entry", createElement(MeetingEntry, { review, history: [meeting], datasetHash: golden.snapshot.dataset_hash, onOpen: noop }));
  // 列印版：會議稿的決議、選入方案（含假設附錄）、超過首頁長度的備註（備註附錄）。
  const longNotes = updateReviewSession(review, { notes: "會議備註".repeat(200) });
  render("print-summary", createElement(PrintSummary, { summary: buildManagerSummary(golden.snapshot), decisionContext: buildReviewDecisionContext(longNotes, scenariosWs, actions), snapshot: golden.snapshot, meeting: { name: review.name, date: "2026-10-03" } }));

  // 儲存選單：有資料、已同意本機保存。
  render("storage", createElement(WorkspaceStorage, { source: null, version: 0, dirty: false, onRestore: noop, onSaved: noop, onDeleted: noop, consent: true, onConsentChange: noop }));
  return out;
}

type Row = { id: string; source: "ssr" | "e2e" | "cond"; note: string };
function baseline(): Row[] {
  return readFileSync(BASELINE, "utf8").split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#")).map(line => {
    const [id, source, note = ""] = line.split("\t");
    return { id, source: source as Row["source"], note };
  });
}
/** 原始碼裡會產生 testid 的字面值與樣板前綴（`kpi-${name}` → 前綴 kpi-）。 */
function sourceProducers(): { literals: Set<string>; prefixes: string[] } {
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (/\.tsx?$/.test(entry.name)) files.push(path); } };
  walk(resolve("src"));
  const literals = new Set<string>(), prefixes: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:data-testid|testId)=(?:"([^"]+)"|\{`([^`$]*)\$\{[^`]*`\}|\{[^}]*?"([^"]+)"[^}]*\})/g)) {
      if (match[1]) literals.add(match[1]);
      if (match[2]) prefixes.push(match[2]);
      if (match[3]) for (const quoted of match[0].matchAll(/"([^"]+)"/g)) literals.add(quoted[1]);
    }
  }
  return { literals, prefixes };
}

describe("V3-0 testid 基準：實際渲染的 testid 一個都不能少", () => {
  let rendered: Map<string, string[]>;
  beforeAll(async () => {
    rendered = new Map();
    for (const [name, html] of Object.entries(await scenarios())) for (const id of testIds(html)) rendered.set(id, [...new Set([...(rendered.get(id) ?? []), name])]);
    const dump = process.env.TESTID_BASELINE_DUMP;
    if (dump) writeFileSync(dump, JSON.stringify(Object.fromEntries([...rendered].sort(([a], [b]) => a.localeCompare(b))), null, 2));
  }, 60_000);

  it("清單格式正確：每列 testid＋來源（ssr／e2e／cond），沒有重複", () => {
    const rows = baseline();
    expect(rows.length).toBeGreaterThan(129);
    for (const row of rows) expect(["ssr", "e2e", "cond"], row.id).toContain(row.source);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  it("來源為 ssr 的 testid 都出現在本次 SSR markup 中", () => {
    const missing = baseline().filter(row => row.source === "ssr" && !rendered.has(row.id)).map(row => row.id);
    expect(missing, `SSR 渲染少了：${missing.join(", ")}`).toEqual([]);
  });

  it("來源為 e2e／cond 的 testid，原始碼仍會產生（瀏覽器實測見 verification/revamp-v3/collect-testids.spec.ts）", () => {
    const { literals, prefixes } = sourceProducers();
    const missing = baseline().filter(row => row.source !== "ssr" && !literals.has(row.id) && !prefixes.some(prefix => prefix && row.id.startsWith(prefix))).map(row => row.id);
    expect(missing, `原始碼已不產生：${missing.join(", ")}`).toEqual([]);
  });

  it("PRD §11.7 點名的運算式與 testId 屬性來源都在清單上", () => {
    const ids = new Set(baseline().map(row => row.id));
    for (const id of ["meeting-agenda-2", "meeting-followup", "meeting-compare-kpis", "meeting-history-kpis"]) expect(ids.has(id), id).toBe(true);
  });

  it("V3-0 補上的六組 testid 都在清單上", () => {
    const ids = [...new Set(baseline().map(row => row.id))];
    for (const id of ["page-import", "actions-export-md", "actions-export-csv", "actions-export-json", "threshold-form-overview", "threshold-form-meeting", "meeting-create", "meeting-scenario-select-DTC"]) expect(ids, id).toContain(id);
  });
});
