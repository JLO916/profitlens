import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expected, fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { buildReviewDecisionContext, createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, taipeiToday, type ActionWorkspace } from "@/application/action-workspace";
import { exportMeetingMarkdown, finalizeMeeting, freezeMeeting, MAX_MEETING_HISTORY, removeMeeting, validateMeeting, type Meeting } from "@/application/meeting";
import { buildManagerSummary } from "@/application/manager-summary";
import { channelsLabel, formatHeadlineAmount } from "@/application/copy";
import { formatAmountL1, formatAmountL2, formatGrowth, formatSignedDelta } from "@/application/presentation";
import { exportWorkspaceBackup, restoreWorkspaceBackup } from "@/application/workspace-backup";
import { currentViewDecisionContext, DECISION_LABEL_KEY, finalizeErrorText, MeetingEntry, MeetingHistory, MeetingPage, meetingExportInfo, meetingMarkdownFilename, reviewDatasetId, type MeetingPageProps } from "../src/components/meeting-page";
import { PRINT_NOTES_LIMIT, PrintSummary } from "../src/components/manager-summary";
import styles from "../src/components/manager-summary.module.css";
import { fill, labels } from "../src/i18n";

/*
 * R6-2 會議紀錄分頁的 DOM 契約（主流程 E2E 會依這些 testid 重寫）：
 * meeting-page > review-workbench（會議基本）→ meeting-agenda（①②③ 在會議摘要內、④⑤⑥ 在下方）→ meeting-decision（決議＋結束會議）
 * → meeting-compare → meeting-history → meeting-outputs。數字一律來自 golden fixture 的手算值。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = hooks.states[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { hooks.states[index] = value; hooks.dirty = true; }
      };
      return [hooks.states[index], set];
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.refCursor++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useEffect(effect, deps),
  };
});
afterEach(() => { hooks.active = false; hooks.states = []; hooks.refs = []; vi.restoreAllMocks(); });
// 輸出列的 Excel／PPT：只換掉實際產生檔案的函式（node 沒有下載），用來控制「處理中」的時間點與失敗。
const exportsMock = vi.hoisted(() => ({ excel: vi.fn<(input: { meeting?: unknown }) => Promise<void>>(async () => undefined), pptx: vi.fn<(input: { meeting?: unknown }) => Promise<Uint8Array>>(async () => new Uint8Array()) }));
vi.mock("@/application/excel-export", async importOriginal => ({ ...await importOriginal<typeof import("@/application/excel-export")>(), exportExcel: exportsMock.excel }));
vi.mock("@/application/pptx-export", async importOriginal => ({ ...await importOriginal<typeof import("@/application/pptx-export")>(), exportPptx: exportsMock.pptx }));
function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.refs = [];
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; hooks.refCursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    return tree;
  };
}
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const element = node as TreeElement;
    if (match(element)) found.push(element);
    findAll(element.props.children as ReactNode, match, found);
  }
  return found;
}
/** 讓 onClick 裡的 async 流程（await onFinalize）跑完。 */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const byTestId = (tree: ReactNode, id: string) => findAll(tree, element => element.props["data-testid"] === id);

const page = labels.meetingPage, record = labels.meetingRecord, copy = labels.ui.reviewWorkbench, summaryCopy = labels.ui.managerSummary;
const NOW = "2026-10-03T06:00:00.000Z";
const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
async function source(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name); const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
/** golden：DTC 方案 p（物流費 −10%）選入會議；待辦 a1（置頂、進行中、2026-10-01 更新）與 a2（未置頂）。與 tests/meeting.test.ts 相同。 */
async function setup() {
  const s = await source();
  let scenarios: ScenarioWorkspace = ensureScenarioContext(emptyScenarioWorkspace("e"), await source("golden", { channels: ["DTC"] }));
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs });
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  const diagnostic = s.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), s, "a1", diagnostic.id);
  actions = addActionDraft(actions, s, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  let review: ReviewSession = createReviewSession(s, "e", "rev-1");
  review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, { name: "十月例會", decision_state: "adopted", notes: "照做", meeting_date: "2026-10-03" });
  return { s, scenarios, actions, review };
}
async function finalized() {
  const state = await setup();
  const meeting = finalizeMeeting({ review: state.review, snapshot: await rebuildReviewSnapshot(state.review), scenarios: state.scenarios, actions: state.actions, date: "2026-10-03", now: NOW });
  return { ...state, meeting };
}
const noop = () => undefined;
function props(state: Awaited<ReturnType<typeof setup>>, extra: Partial<MeetingPageProps> = {}): MeetingPageProps {
  return { source: state.s, scenarioWorkspace: state.scenarios, actionWorkspace: state.actions, review: state.review, history: [], onChange: noop, onEvidence: noop, onFinalize: async () => undefined, ...extra };
}
const render = (value: MeetingPageProps) => renderToStaticMarkup(createElement(MeetingPage, value));
/** 依 data-testid 取出整個元素（同名標籤以巢狀深度配對）。 */
function block(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  expect(at, testId).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(start))![1];
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error(`unclosed ${testId}`);
}
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'");
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]));

describe("R6-2 meeting page without a draft", () => {
  it("offers the create button and still lists the (empty) history", async () => {
    const state = await setup();
    const html = render(props(state, { review: null }));
    expect(block(html, "review-workbench")).toContain(labels.ui.reviewWorkbench.createButton);
    expect(block(html, "meeting-history")).toContain(page.historyEmpty);
    expect(html).not.toContain('data-testid="meeting-agenda"');
    expect(html).not.toContain('data-testid="meeting-finalize"');
  });
});

describe("R6-2 meeting page with a draft", () => {
  it("renders basics, the six agenda items, the decision controls and the finalize button in 02 §8 order", async () => {
    const state = await setup();
    const html = render(props(state));
    const order = ["review-workbench", "meeting-agenda", "meeting-agenda-1", "meeting-agenda-2", "meeting-agenda-3", "meeting-agenda-4", "meeting-agenda-5", "meeting-agenda-6", "meeting-decision", "meeting-finalize", "meeting-compare", "meeting-history", "meeting-outputs"];
    const positions = order.map(id => html.indexOf(`data-testid="${id}"`));
    expect(positions.every(position => position > -1), order.join()).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const [id, title] of [["meeting-agenda-1", record.agenda.kpis], ["meeting-agenda-2", record.agenda.priorities], ["meeting-agenda-3", record.agenda.channels], ["meeting-agenda-4", record.agenda.followUp], ["meeting-agenda-5", record.agenda.scenarios], ["meeting-agenda-6", record.agenda.actions]] as const) expect(text(block(html, id)), id).toContain(title);
    // 會議基本：名稱、日期（存 review.meeting_date）、固定範圍一行（來源、通路、兩期）。
    const basics = block(html, "review-workbench");
    expect(basics).toContain(`value="十月例會"`);
    expect(basics).toMatch(/<input type="date" required="" value="2026-10-03"/);
    expect(text(basics)).toContain(fill(page.periodsLine, { previousStart: "2026-08-01", previousEnd: "2026-08-01", currentStart: "2026-08-02", currentEnd: "2026-08-02" }));
    expect(text(basics)).toContain(labels.buttons.updateMeetingSource);
    expect(basics).not.toContain('data-testid="review-view-difference"');
    // ①②③ 由會議摘要（固定範圍）提供：淨營收 +220.00、扣廣告後貢獻 −315.00（golden 手算）；V3-2b 起主層用 L1 方向詞＋成長率。
    const summary = block(html, "manager-summary");
    const golden = expected();
    expect(text(summary)).toContain(fill(summaryCopy.changePhraseGrowth, { word: labels.format.more, amount: formatHeadlineAmount("220.00"), growth: formatGrowth(golden.current.net_revenue, golden.previous.net_revenue, "L1")! }));
    expect(text(summary)).toContain(fill(summaryCopy.changePhraseGrowth, { word: labels.format.earnLess, amount: formatHeadlineAmount("-315.00"), growth: formatGrowth(golden.current.contribution_after_marketing, golden.previous.contribution_after_marketing, "L1")! }));
    expect(summary).not.toContain(labels.buttons.print);
    // ⑤ 每個通路一個「選入會議的方案」；DTC 已選 p 第 1 版。
    const scenarios = block(html, "meeting-agenda-5");
    expect(scenarios).toContain(`aria-label="${fill(labels.ui.reviewWorkbench.scenarioSelect, { channel: "DTC" })}"`);
    expect(scenarios).toContain(`aria-label="${fill(labels.ui.reviewWorkbench.scenarioSelect, { channel: "MARKETPLACE" })}"`);
    // 決議：四個選項，目前為「採用」；備註；結束會議按鈕（還沒有確認區）。
    const decision = block(html, "meeting-decision");
    expect(decision).toContain(`aria-label="${labels.meeting.decision}"`);
    for (const key of ["draft", "adopted", "need_data", "rejected"] as const) expect(text(decision)).toContain(labels.meeting.decisions[key]);
    expect(decision).toMatch(/<option value="adopted" selected="">/);
    expect(text(decision)).toContain("照做");
    expect(text(block(html, "meeting-finalize"))).toBe(labels.buttons.finalizeMeeting);
    expect(html).not.toContain('data-testid="meeting-finalize-confirm"');
    // 沒有上次會議：④ 與比較區都顯示同一句。
    expect(text(block(html, "meeting-agenda-4"))).toContain(record.noLastMeeting);
    expect(text(block(html, "meeting-compare"))).toContain(record.noLastMeeting);
    expect(text(block(html, "meeting-history"))).toContain(page.historyEmpty);
  });

  it("defaults the meeting date to today in Taipei when none is stored", async () => {
    const state = await setup();
    const { meeting_date: _date, ...review } = state.review;
    void _date;
    expect(block(render(props(state, { review })), "review-workbench")).toContain(`value="${taipeiToday()}"`);
  });

  it("shows the view-difference notice when the meeting scope differs from the current view", async () => {
    const state = await setup();
    const dtc = await source("golden", { channels: ["DTC"] });
    const html = render(props(state, { source: dtc }));
    // 會議固定在兩個通路；畫面目前只看 DTC。快照用會議保存的來源重建（SSR 不執行 effect，先顯示「正在載入」）。
    expect(text(block(html, "review-view-difference"))).toContain(labels.ui.reviewWorkbench.viewDifferenceScope);
    expect(html).toContain(labels.ui.reviewWorkbench.rebuilding);
    expect(buttons(block(html, "meeting-outputs")).length).toBe(5);
    expect(block(html, "meeting-outputs")).toContain(page.notReady);
  });

  it("has an output row with five buttons whose text all comes from labels, plus the PDF hint", async () => {
    const state = await setup();
    const outputs = block(render(props(state)), "meeting-outputs");
    expect(buttons(outputs)).toEqual([labels.buttons.exportPdf, labels.buttons.exportMarkdown, labels.downloads.channelTableCsv, labels.buttons.exportExcel, labels.buttons.exportPptx]);
    expect(outputs).not.toContain("disabled");
    expect(text(outputs)).toContain(page.pdfHint);
    expect(text(outputs)).toContain(page.outputs);
  });
});

describe("R6-2 comparison with the last meeting (05 §10)", () => {
  it("same scope: KPI table with hand-checked differences, both three-things lists, and the follow-up table", async () => {
    const state = await finalized();
    // 上次會議的扣廣告後貢獻改成 300.00（上期 570.00、差額 −270.00，內部一致才過得了 validateMeeting）：本次 255.00 − 300.00 = −45.00。
    const edited = structuredClone(state.meeting);
    edited.agenda.kpis[1] = { metric: "contribution_after_marketing", previous: "570.00", current: "300.00", change: "-270.00" };
    const last: Meeting = freezeMeeting(edited);
    validateMeeting(last);
    const golden = expected();
    const html = render(props(state, { history: [last] }));
    const compare = block(html, "meeting-compare");
    expect(compare).toContain('data-testid="meeting-compare-same_scope"');
    expect(text(compare)).toContain(record.sameScope);
    expect(text(compare)).toContain(fill(page.compareKind, { kind: record.kinds.same_scope }));
    expect(text(compare)).toContain(fill(record.mdLastMeeting, { name: "十月例會", date: "2026-10-03" }));
    const kpis = block(compare, "meeting-compare-kpis");
    for (const column of Object.values(record.compareColumns)) expect(text(kpis)).toContain(column);
    const rows = [...kpis.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)].map(match => [text(match[1]), ...[...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => text(cell[1]))]);
    expect(golden.current.net_revenue).toBe("2470.00");
    expect(golden.current.contribution_after_marketing).toBe("255.00");
    // V3-2b：議程表格是 L2（整數元，表頭標「（元）」）；顏色依有利／不利。
    expect(rows).toEqual([
      [labels.metrics.net_revenue.label, formatAmountL2("2470.00"), formatAmountL2("2470.00"), formatSignedDelta("0.00", "L2")],
      [labels.metrics.contribution_after_marketing.label, formatAmountL2("300.00"), formatAmountL2("255.00"), formatSignedDelta("-45.00", "L2")],
    ]);
    expect(kpis).toContain(`<td class="negative">${formatSignedDelta("-45.00", "L2")}</td>`);
    expect(text(compare)).toContain(record.lastPriorities);
    expect(text(compare)).toContain(record.currentPriorities);
    expect(text(compare)).toContain(fill(page.priorityRow, { n: 1, headline: last.agenda.priorities[0].headline, scope: labels.sections.total, impact: labels.sections.impact, amount: formatSignedDelta("-315.00", "L1") }));
    // ④ 上次決議追蹤：上次「採用」（已確認）；a1 上次與目前都是進行中，更新日 2026-10-01。
    const followUp = block(html, "meeting-followup");
    expect(text(followUp)).toContain(fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: state.review.revision }));
    for (const column of Object.values(page.followUpColumns)) expect(text(followUp)).toContain(column);
    expect(text(followUp)).toContain(`${labels.actions.statuses.in_progress}${labels.actions.statuses.in_progress}2026-10-01`);
    // 歷史一筆：名稱 · 日期 · 決議，可下載 Markdown。
    const history = block(html, "meeting-history");
    expect(history.match(/data-testid="meeting-history-item"/g)).toHaveLength(1);
    expect(text(history)).toContain(fill(page.historyItem, { name: "十月例會", date: "2026-10-03", decision: fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: state.review.revision }) }));
    expect(text(history)).toContain(fill(page.historyKpiRow, { metric: labels.metrics.contribution_after_marketing.label, previous: formatAmountL1("570.00"), current: formatAmountL1("300.00"), change: formatSignedDelta("-270.00", "L1") }));
    expect(buttons(history)).toEqual([labels.buttons.exportMarkdown]);
  });

  it("different dataset: no KPI comparison; the last decisions and the pinned-action status table appear once, in ④", async () => {
    const state = await setup();
    const demo = await source("demo");
    let demoActions = pinAction(addActionDraft(emptyActionWorkspace(), demo, "d1"), "d1", true);
    demoActions = editActionManagement(demoActions, "d1", { execution_status: "blocked" }, "2026-09-30");
    const demoReview = updateReviewSession(syncReviewPins(createReviewSession(demo, "e-demo", "rev-demo"), demoActions), { name: "九月例會", decision_state: "needs_data" });
    const last = finalizeMeeting({ review: demoReview, snapshot: await rebuildReviewSnapshot(demoReview), scenarios: emptyScenarioWorkspace("e-demo"), actions: demoActions, date: "2026-09-30", now: "2026-09-30T06:00:00.000Z" });
    const html = render(props(state, { history: [last] }));
    const compare = block(html, "meeting-compare");
    expect(compare).toContain('data-testid="meeting-compare-different_dataset"');
    expect(text(block(compare, "meeting-compare-note"))).toBe(labels.meeting.noComparable);
    expect(compare).not.toContain('data-testid="meeting-compare-kpis"');
    // 比較區不再重複 ④ 的表：只留一句指向 ④。
    expect(compare).not.toContain('data-testid="meeting-compare-followup"');
    expect(compare).not.toContain("<table");
    expect(text(block(compare, "meeting-compare-see-followup"))).toBe(page.compareSeeFollowUp);
    expect(page.compareSeeFollowUp).toContain(record.agenda.followUp);
    expect(html.match(/data-testid="meeting-followup"/g)).toHaveLength(1);
    const followUp = block(block(html, "meeting-agenda-4"), "meeting-followup");
    expect(text(followUp)).toContain(fill(record.mdLastMeeting, { name: "九月例會", date: "2026-09-30" }));
    expect(text(followUp)).toContain(fill(record.decisionConfirmed, { decision: labels.meeting.decisions.need_data, revision: demoReview.revision }));
    // d1 不在目前（golden）的待辦工作區：上次「受阻」→ 目前找不到；更新日沿用目前工作區（沒有）。
    expect(text(followUp)).toContain(`${labels.actions.statuses.blocked}${record.actionMissing}${record.statusNotUpdated}`);
    // 總覽入口：上次會議用的是另一份資料，不顯示「上次會議 日期」。
    const entry = renderToStaticMarkup(createElement(MeetingEntry, { review: state.review, history: [last], datasetHash: state.s.snapshot.dataset_hash, onOpen: noop }));
    expect(text(entry)).not.toContain(fill(page.entryLast, { date: "2026-09-30" }));
  });
});

describe("R6-2 overview keeps a one-line entry (05 §10)", () => {
  it("shows the draft state, the last meeting on the same data and a button to the meeting page", async () => {
    const state = await finalized();
    const html = renderToStaticMarkup(createElement(MeetingEntry, { review: state.review, history: [state.meeting], datasetHash: state.s.snapshot.dataset_hash, onOpen: noop }));
    expect(html).toMatch(/^<p class="meeting-entry" data-testid="overview-meeting-entry">/);
    expect(text(html)).toContain(fill(page.entry, { state: labels.meeting.decisions.adopted }));
    expect(text(html)).toContain(fill(page.entryLast, { date: "2026-10-03" }));
    expect(buttons(html)).toEqual([page.goToMeeting]); // V3-2a：裝飾箭頭已移除（PRD §5.2 X5）
    const empty = renderToStaticMarkup(createElement(MeetingEntry, { review: null, history: [], datasetHash: state.s.snapshot.dataset_hash, onOpen: noop }));
    expect(text(empty)).toContain(fill(page.entry, { state: labels.sections.meetingNotCreated }));
  });
});

describe("R6-2 finalize asks for an in-page confirmation first", () => {
  it("finalize → confirm region (non-modal dialog) → confirm calls onFinalize and reports success; failures show an alert", async () => {
    const state = await setup();
    const onFinalize = vi.fn(async () => undefined);
    const view = mount(MeetingPage);
    const value = props(state, { onFinalize });
    let tree = view(value);
    expect(byTestId(tree, "meeting-finalize-confirm")).toHaveLength(0);
    (byTestId(tree, "meeting-finalize")[0].props.onClick as () => void)();
    tree = view(value);
    const [dialog] = byTestId(tree, "meeting-finalize-confirm");
    expect(dialog.props).toMatchObject({ role: "dialog", "aria-modal": "false" });
    expect(byTestId(tree, "meeting-finalize")[0].props.disabled).toBe(true);
    (byTestId(tree, "meeting-finalize-confirm-button")[0].props.onClick as () => void)();
    await settle();
    tree = view(value);
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(byTestId(tree, "meeting-finalize-confirm")).toHaveLength(0);
    expect(byTestId(tree, "meeting-status")[0].props.children).toBe(page.finalized);

    const failing = props(state, { onFinalize: async () => { throw new Error("MEETING_SOURCE_MISMATCH"); } });
    const second = mount(MeetingPage);
    tree = second(failing);
    (byTestId(tree, "meeting-finalize")[0].props.onClick as () => void)();
    tree = second(failing);
    (byTestId(tree, "meeting-finalize-confirm-button")[0].props.onClick as () => void)();
    await settle();
    tree = second(failing);
    expect(findAll(tree, element => element.props.role === "alert").map(element => element.props.children)).toContain(page.finalizeError);
    expect(byTestId(tree, "meeting-finalize-confirm")).toHaveLength(1);
  });

  it("is disabled for a meeting fixed on earlier data", async () => {
    const state = await setup();
    const html = render(props(state, { review: { ...state.review, status: "historical", decision_state: "draft", confirmed_revision: null } }));
    expect(block(html, "meeting-finalize")).toContain("disabled");
    expect(text(block(html, "meeting-decision"))).toContain(page.historicalNote);
  });
});

describe("R6-2 meeting date and export info", () => {
  it("updateReviewSession accepts only real dates for meeting_date and the backup keeps it", async () => {
    const state = await setup();
    for (const date of ["2026-02-30", "2026/10/03", "", "2026-10-3"]) expect(() => updateReviewSession(state.review, { meeting_date: date })).toThrow("INVALID_MEETING_DATE");
    const moved = updateReviewSession(state.review, { meeting_date: "2026-10-09" });
    expect(moved).toMatchObject({ meeting_date: "2026-10-09", decision_state: "draft", revision: state.review.revision + 1 });
    const backup = await exportWorkspaceBackup({ input: state.s.input, filters: state.s.snapshot.report.scope, id: "golden", revision: 1, decision: emptyDecisionWorkspace(), action_workspace: state.actions, scenario_workspace: state.scenarios, review_session: moved });
    const restored = await restoreWorkspaceBackup(backup);
    expect(restored.review_session?.meeting_date).toBe("2026-10-09");
    const wire = JSON.parse(backup);
    wire.payload.review_session.meeting_date = "2026-13-01";
    await expect(restoreWorkspaceBackup(JSON.stringify(wire))).rejects.toThrow();
  });

  it("maps the review decision to the labels key used by Excel and PPT", async () => {
    const state = await setup();
    expect(meetingExportInfo(state.review)).toEqual({ name: "十月例會", date: "2026-10-03", decision: "adopted", notes: "照做" });
    expect(meetingExportInfo(null)).toBeNull();
    expect(meetingExportInfo({ ...state.review, meeting_date: undefined }, "2026-10-05")?.date).toBe("2026-10-05");
    expect(DECISION_LABEL_KEY).toEqual({ draft: "draft", adopted: "adopted", needs_data: "need_data", not_adopted: "rejected" });
  });
});

/* ---------------------------------------------------------------------------------------------
 * R6-F2 對抗式審查後修正：議程 ⑤⑥、總覽入口「已結束」、比較區不重複 ④、歷史凍結的追蹤與移除、
 * 結束會議的錯誤碼文案、處理中按鈕的焦點、通路別名看會議自己的資料、列印第一頁＋附錄規則。
 * ------------------------------------------------------------------------------------------- */
const DTC_SCOPE = fill(labels.ui.reviewSession.scenarioScope, { channel: "DTC", start: "2026-08-02", end: "2026-08-02" });
const FULFILLMENT_10 = fill(labels.ui.reviewSession.assumptionFulfillment, { value: "-10" });

describe("R6-F2 agenda ⑤⑥ hold the selected plans and pinned actions", () => {
  it("⑤ lists the selected plan's result under the selects; ⑥ lists the pinned action; the summary no longer repeats 方案與待辦", async () => {
    const state = await setup();
    const golden = expected();
    const html = render(props(state));
    const five = block(html, "meeting-agenda-5");
    const results = block(five, "meeting-scenario-results");
    expect(text(results)).toContain(page.scenarioResults);
    expect(results.match(/data-testid="meeting-scenario-result"/g)).toHaveLength(1);
    expect(results).toContain('data-status="current"');
    // DTC 方案 p（物流費 −10%）：現況 270.00 → 試算後 284.00，差額 +14.00（golden 手算）。
    expect(golden.scenario_dtc_fulfillment_reduction.expected_contribution).toBe("284.00");
    expect(text(results)).toContain(fill(summaryCopy.scenarioLine, { name: "履約", scope: DTC_SCOPE, baseline: formatAmountL1("270.00"), contribution: formatAmountL1("284.00"), delta: formatSignedDelta("14.00", "L1") }));
    expect(text(results)).toContain(FULFILLMENT_10);
    expect(text(results)).not.toContain(copy.staleScenarios);
    // select 在結果之前。
    expect(five.indexOf("<select")).toBeLessThan(five.indexOf('data-testid="meeting-scenario-results"'));
    // ⑥：a1 置頂（進行中）；a2 未置頂 → 收在「其他待辦（1）」。
    const context = buildReviewDecisionContext(state.review, state.scenarios, state.actions);
    const [a1, a2] = ["a1", "a2"].map(id => context.actions.find(row => row.id === id)!);
    const six = block(html, "meeting-agenda-6");
    const pinned = block(six, "meeting-pinned-actions");
    expect(text(pinned)).toContain(a1.problem);
    expect(text(pinned)).toContain(fill(summaryCopy.actionExecution, { status: labels.actions.statuses.in_progress, notes: "" }));
    expect(pinned.match(/<li>/g)).toHaveLength(1);
    expect(text(six)).toContain(fill(summaryCopy.appendixActions, { n: 1 }));
    expect(text(six).split(fill(summaryCopy.appendixActions, { n: 1 }))[1]).toContain(a2.problem);
    expect(six).not.toContain('data-testid="meeting-pinned-actions-empty"');
    // 會議摘要（①②③）：不再有「方案與待辦」、指標名是 h4、③ 的收合標題不重複「通路表」。
    const summary = block(html, "manager-summary");
    expect(text(summary)).not.toContain(summaryCopy.decisionsHeading);
    expect(text(summary)).not.toContain(a1.problem);
    expect(summary).toContain(`<h4>${labels.metrics.net_revenue.label}</h4>`);
    expect(summary).not.toContain(`<h3>${labels.metrics.net_revenue.label}</h3>`);
    expect(text(summary)).toContain(page.channelTableSummary);
    expect(text(summary)).not.toContain(summaryCopy.channelTableSummary);
    expect(page.channelTableSummary).not.toContain(labels.sections.channelTable);
  });

  it("⑤ marks a superseded plan as stale; ⑥ says there is no pinned action when nothing is pinned", async () => {
    const state = await setup();
    const context = state.scenarios.contexts[0], draft = scenarioContextDecision(context);
    draft.scenarios = saveScenario(context.session, draft.scenarios, { id: "p", name: "履約加碼", inputs: { ...inputs, fulfillment_change_pct: "-20" } });
    const scenarios = updateScenarioContext(state.scenarios, context.id, draft);
    const actions = pinAction(state.actions, "a1", false);
    const review = syncReviewPins(updateReviewSession(state.review, { decision_state: "draft" }), actions);
    const html = render(props(state, { scenarioWorkspace: scenarios, actionWorkspace: actions, review }));
    const results = block(block(html, "meeting-agenda-5"), "meeting-scenario-results");
    expect(results).toContain('data-status="stale"');
    expect(text(results)).toContain(copy.staleScenarios);
    expect(text(results)).toContain("履約");
    const six = block(html, "meeting-agenda-6");
    expect(text(block(six, "meeting-pinned-actions-empty"))).toBe(record.noPinnedActions);
    expect(text(six)).toContain(fill(summaryCopy.appendixActions, { n: 2 }));
    // 沒有選入方案：⑤ 顯示一句說明。
    const none = render(props(state, { review: selectReviewScenario(updateReviewSession(state.review, { decision_state: "draft" }), state.scenarios, null, "DTC") }));
    expect(text(block(none, "meeting-scenario-results-empty"))).toBe(summaryCopy.noScenario);
  });
});

describe("R6-F2 overview entry after finalizing", () => {
  it("an untouched new draft on the same data and scope reads 已結束（date）· 新會議稿：草稿; edits or another scope fall back", async () => {
    const state = await finalized();
    const entry = (review: ReviewSession) => text(renderToStaticMarkup(createElement(MeetingEntry, { review, history: [state.meeting], datasetHash: state.s.snapshot.dataset_hash, onOpen: noop })));
    const fresh = createReviewSession(state.s, "e", "rev-2");
    expect(fresh).toMatchObject({ revision: 1, decision_state: "draft" });
    expect(entry(fresh)).toContain(fill(page.entryFinalized, { date: "2026-10-03" }));
    expect(entry(fresh)).not.toContain(fill(page.entry, { state: labels.meeting.decisions.draft }));
    expect(entry(fresh)).toContain(page.goToMeeting);
    const edited = updateReviewSession(fresh, { name: "改過的會議" });
    expect(entry(edited)).not.toContain(fill(page.entryFinalized, { date: "2026-10-03" }));
    expect(entry(edited)).toContain(fill(page.entry, { state: labels.meeting.decisions.draft }));
    expect(entry(edited)).toContain(fill(page.entryLast, { date: "2026-10-03" }));
    const dtc = createReviewSession(await source("golden", { channels: ["DTC"] }), "e", "rev-3");
    expect(entry(dtc)).toContain(fill(page.entry, { state: labels.meeting.decisions.draft }));
    expect(entry(dtc)).not.toContain(fill(page.entryFinalized, { date: "2026-10-03" }));
  });
});

describe("R6-F2 meeting history reads the record itself", () => {
  it("each item shows the follow-up frozen at finalize (kind, note, KPI, last decision, action status); Markdown names carry the date", async () => {
    const state = await finalized();
    const next = updateReviewSession(createReviewSession(state.s, "e", "rev-2"), { name: "十一月例會", decision_state: "adopted", meeting_date: "2026-11-03" });
    const second = finalizeMeeting({ review: next, snapshot: await rebuildReviewSnapshot(next), scenarios: state.scenarios, actions: state.actions, history: [state.meeting], date: "2026-11-03", now: "2026-11-03T06:00:00.000Z" });
    expect(second.follow_up.kind).toBe("same_scope");
    const html = render(props(state, { history: [state.meeting, second], onRemoveMeeting: noop }));
    const history = block(html, "meeting-history");
    expect(history.match(/data-testid="meeting-history-item"/g)).toHaveLength(2);
    // 新的在前：十一月例會的追蹤是凍結的 same_scope；十月例會沒有上次會議。
    expect(history.match(/data-testid="meeting-history-followup"/g)).toHaveLength(1);
    const followUp = block(history, "meeting-history-followup");
    expect(text(followUp)).toContain(fill(page.compareKind, { kind: record.kinds.same_scope }));
    expect(text(followUp)).toContain(fill(record.mdLastMeeting, { name: "十月例會", date: "2026-10-03" }));
    expect(text(followUp)).toContain(record.sameScope);
    const kpis = block(followUp, "meeting-history-kpis");
    const rows = [...kpis.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)].map(match => [text(match[1]), ...[...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => text(cell[1]))]);
    // 同一份資料同範圍：上次本期 = 本次本期（2,470.00；255.00），差額 0.00。
    expect(rows).toEqual([
      [labels.metrics.net_revenue.label, formatAmountL2("2470.00"), formatAmountL2("2470.00"), formatSignedDelta("0.00", "L2")],
      [labels.metrics.contribution_after_marketing.label, formatAmountL2("255.00"), formatAmountL2("255.00"), formatSignedDelta("0.00", "L2")],
    ]);
    expect(text(followUp)).toContain(`${page.lastDecision}：${fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: state.review.revision })}`);
    expect(text(followUp)).toContain(`${labels.actions.statuses.in_progress}${labels.actions.statuses.in_progress}2026-10-01`);
    expect(text(history)).toContain(page.historyFollowUp);
    expect(text(history)).toContain(record.noLastMeeting);
    // 每筆：下載 Markdown（aria-label 含名稱與日期）＋移除。
    expect(buttons(history)).toEqual([labels.buttons.exportMarkdown, page.removeMeeting, labels.buttons.exportMarkdown, page.removeMeeting]);
    const title = fill(page.historyItem, { name: "十一月例會", date: "2026-11-03", decision: fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: next.revision }) });
    expect(history).toContain(`aria-label="${labels.buttons.exportMarkdown} · ${title}"`);
    expect(history).toContain(`aria-label="${page.removeMeeting} · ${title}"`);
    expect(history).toContain(`data-testid="meeting-history-remove-${second.id}"`);
    expect(meetingMarkdownFilename(second)).toBe("profitlens-meeting-2026-11-03.md");
    // Markdown 就是紀錄本身（凍結的比較），不需要本工作階段的資料。
    expect(exportMeetingMarkdown(second)).toContain(record.sameScope);
  });

  it("remove asks first (warning + confirm/cancel), Esc cancels back to the button, confirm calls onRemove and announces it", async () => {
    const state = await finalized();
    const onRemove = vi.fn();
    const view = mount(MeetingHistory);
    const value = { history: [state.meeting], onRemove };
    let tree = view(value);
    const removeId = `meeting-history-remove-${state.meeting.id}`;
    const click = (id: string, event: unknown = {}) => (byTestId(tree, id)[0].props.onClick as (event: unknown) => void)(event);
    expect(byTestId(tree, "meeting-history-remove-confirm")).toHaveLength(0);
    expect(byTestId(tree, removeId)[0].props["aria-expanded"]).toBe(false);
    const trigger = vi.fn();
    click(removeId, { currentTarget: { focus: trigger } });
    tree = view(value);
    expect(byTestId(tree, removeId)[0].props["aria-expanded"]).toBe(true);
    const region = byTestId(tree, "meeting-history-remove-confirm-region")[0];
    expect(region.props.role).toBe("group");
    expect(findAll(region, element => element.type === "p")[0].props.children).toBe(page.removeWarning);
    expect(byTestId(tree, "meeting-history-remove-confirm")[0].props.children).toBe(page.removeConfirm);
    expect(findAll(region, element => element.type === "button").map(element => element.props.children)).toEqual([page.removeConfirm, labels.buttons.cancel]);
    (region.props.onKeyDown as (event: unknown) => void)({ key: "Escape", stopPropagation: noop });
    tree = view(value);
    expect(byTestId(tree, "meeting-history-remove-confirm")).toHaveLength(0);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
    click(removeId, { currentTarget: { focus: trigger } });
    tree = view(value);
    const titleFocus = vi.fn();
    (findAll(tree, element => element.props.id === "meeting-history-title")[0].props.ref as { current: unknown }).current = { focus: titleFocus };
    click("meeting-history-remove-confirm");
    tree = view(value);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(state.meeting.id);
    expect(titleFocus).toHaveBeenCalledTimes(1);
    expect(byTestId(tree, "meeting-history-remove-confirm")).toHaveLength(0);
    expect(byTestId(tree, "meeting-history-status")[0].props.children).toBe(fill(page.removed, { name: "十月例會", date: "2026-10-03" }));
    // 儀表板以 removeMeeting 寫回（不改原陣列）。
    expect(removeMeeting([state.meeting], state.meeting.id)).toEqual([]);
    // 沒給 onRemove：不顯示移除按鈕。
    expect(renderToStaticMarkup(createElement(MeetingHistory, { history: [state.meeting] }))).not.toContain(page.removeMeeting);
  });

  it("maps finalize error codes to their own copy (history full asks to download and remove the oldest)", () => {
    expect(finalizeErrorText(new Error("MEETING_HISTORY_FULL"))).toBe(page.historyFull);
    expect(page.historyFull).toContain(String(MAX_MEETING_HISTORY));
    expect(finalizeErrorText(new Error("DUPLICATE_MEETING"))).toBe(page.duplicateMeeting);
    expect(finalizeErrorText(new Error("REVIEW_ADOPTED_STALE_SCENARIO"))).toBe(page.staleScenario);
    expect(page.staleScenario).toContain(record.agenda.scenarios);
    expect(finalizeErrorText(new Error("MEETING_SOURCE_MISMATCH"))).toBe(page.finalizeError);
    expect(finalizeErrorText("not an error")).toBe(page.finalizeError);
  });
});

describe("R6-F2 busy buttons keep focus (aria-disabled + guard)", () => {
  it("finalize: the confirm button stays focusable while working; a failure keeps the region, shows the coded message and focuses its title; Esc then cancels", async () => {
    const state = await setup();
    const pending = deferred();
    const onFinalize = vi.fn(() => pending.promise);
    const view = mount(MeetingPage);
    const value = props(state, { onFinalize });
    let tree = view(value);
    (byTestId(tree, "meeting-finalize")[0].props.onClick as () => void)();
    tree = view(value);
    const focus = vi.fn();
    (findAll(tree, element => element.props.id === "meeting-confirm-title")[0].props.ref as { current: unknown }).current = { focus };
    const confirm = () => (byTestId(tree, "meeting-finalize-confirm-button")[0].props.onClick as () => void)();
    confirm();
    tree = view(value);
    const button = byTestId(tree, "meeting-finalize-confirm-button")[0];
    expect(button.props.disabled).toBeUndefined();
    expect(button.props["aria-disabled"]).toBe(true);
    const cancel = findAll(byTestId(tree, "meeting-finalize-confirm")[0], element => element.type === "button" && element.props.children === labels.buttons.cancel)[0];
    expect(cancel.props.disabled).toBeUndefined();
    expect(cancel.props["aria-disabled"]).toBe(true);
    expect(byTestId(tree, "meeting-status")[0].props.children).toBe(page.finalizing);
    // 處理中再按一次、按取消、按 Esc：都不動作。
    confirm();
    (cancel.props.onClick as () => void)();
    (byTestId(tree, "meeting-finalize-confirm")[0].props.onKeyDown as (event: unknown) => void)({ key: "Escape", stopPropagation: noop });
    tree = view(value);
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(byTestId(tree, "meeting-finalize-confirm")).toHaveLength(1);
    pending.reject(new Error("MEETING_HISTORY_FULL"));
    await settle();
    tree = view(value);
    expect(focus).toHaveBeenCalledTimes(1);
    const region = byTestId(tree, "meeting-finalize-confirm")[0];
    expect(byTestId(region, "meeting-finalize-error")[0].props).toMatchObject({ role: "alert", children: page.historyFull });
    expect(byTestId(tree, "meeting-finalize-confirm-button")[0].props["aria-disabled"]).toBeUndefined();
    (region.props.onKeyDown as (event: unknown) => void)({ key: "Escape", stopPropagation: noop });
    tree = view(value);
    expect(byTestId(tree, "meeting-finalize-confirm")).toHaveLength(0);
    expect(byTestId(tree, "meeting-finalize-error")).toHaveLength(0);
  });

  it("output row: Excel/PPT are aria-disabled (not disabled) while exporting, ignore extra clicks, and return focus to the trigger after success or failure", async () => {
    const state = await setup();
    exportsMock.excel.mockReset(); exportsMock.pptx.mockReset();
    const pending = deferred();
    exportsMock.excel.mockImplementationOnce(() => pending.promise);
    const view = mount(MeetingPage);
    const value = props(state);
    let tree = view(value);
    const click = (id: string, focus: () => void) => (byTestId(tree, id)[0].props.onClick as (event: unknown) => void)({ currentTarget: { focus } });
    const excelFocus = vi.fn();
    click("meeting-export-excel", excelFocus);
    tree = view(value);
    for (const id of ["meeting-export-excel", "meeting-export-pptx"]) {
      expect(byTestId(tree, id)[0].props["aria-disabled"], id).toBe(true);
      expect(byTestId(tree, id)[0].props.disabled, id).toBe(false);
    }
    expect(findAll(tree, element => element.props.role === "status").map(element => element.props.children)).toContain(page.exporting);
    click("meeting-export-pptx", vi.fn());
    expect(exportsMock.pptx).not.toHaveBeenCalled();
    pending.resolve();
    await settle();
    tree = view(value);
    expect(excelFocus).toHaveBeenCalledTimes(1);
    expect(byTestId(tree, "meeting-export-excel")[0].props["aria-disabled"]).toBeUndefined();
    // 會議頁的輸出列帶會議資訊（下載選單才是純目前檢視）。
    expect(exportsMock.excel.mock.calls[0][0].meeting).toEqual(meetingExportInfo(state.review));
    exportsMock.pptx.mockImplementationOnce(async () => { throw new Error("PPTX_SOURCE_MISMATCH"); });
    const pptxFocus = vi.fn();
    click("meeting-export-pptx", pptxFocus);
    await settle();
    tree = view(value);
    expect(pptxFocus).toHaveBeenCalledTimes(1);
    expect(findAll(tree, element => element.props.role === "alert").map(element => element.props.children)).toContain(page.exportError);
    expect(page.exportError).not.toContain("請重新整理後再試");
  });
});

describe("R6-F2 channel aliases follow the meeting's own data", () => {
  it("a golden meeting viewed while demo data is open keeps golden channel codes; only the current view uses the demo alias", async () => {
    const state = await setup();
    const demo = await source("demo");
    expect(reviewDatasetId(state.review)).toBe(state.s.snapshot.report.dataset_id);
    const html = render(props(state, { source: demo }));
    const basics = block(html, "review-workbench");
    const channels = ["DTC", "MARKETPLACE"];
    expect(text(block(basics, "review-view-difference"))).toBe(fill(copy.viewDifference, {
      meetingChannels: channelsLabel(channels, false), meetingStart: "2026-08-02", meetingEnd: "2026-08-02",
      viewChannels: channelsLabel(demo.snapshot.report.scope.channels, true), viewStart: demo.snapshot.report.current.period.start, viewEnd: demo.snapshot.report.current.period.end, datasetNote: copy.viewDifferenceDataset,
    }));
    expect(text(basics)).toContain(fill(copy.sourceLine, { sourceStatus: copy.sourceFixed, channels: channelsLabel(channels, false) }));
    const agenda = block(html, "meeting-agenda");
    for (const channel of channels) expect(agenda).toContain(`aria-label="${fill(copy.scenarioSelect, { channel })}"`);
    expect(text(agenda)).not.toContain(labels.demoChannelAlias.DTC);
  });

  it("「用目前資料更新會議」 keeps the draft's created_at and meeting date", async () => {
    const state = await setup();
    const review = { ...state.review, created_at: "2026-09-01T00:00:00.000Z" };
    const onChange = vi.fn();
    const view = mount(MeetingPage);
    const tree = view(props(state, { review, onChange }));
    const refresh = findAll(tree, element => element.type === "button" && element.props.children === labels.buttons.updateMeetingSource)[0];
    (refresh.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ id: review.id, name: "十月例會", created_at: "2026-09-01T00:00:00.000Z", meeting_date: "2026-10-03", decision_state: "draft" });
  });
});

describe("R6-F2 print: one-page summary plus appendix (A4)", () => {
  /** 兩個通路各選一個方案：第一頁每個方案一行、決議行在關鍵差額之後，假設（與超過 200 字的備註全文）在附錄。 */
  async function printable(notes: string) {
    const s = await source();
    let scenarios: ScenarioWorkspace = emptyScenarioWorkspace("e");
    for (const [channel, id, name] of [["DTC", "p", "官網履約"], ["MARKETPLACE", "q", "平台履約"]] as const) {
      scenarios = ensureScenarioContext(scenarios, await source("golden", { channels: [channel] }));
      const context = scenarios.contexts.at(-1)!, draft = scenarioContextDecision(context);
      draft.scenarios = saveScenario(context.session, [], { id, name, inputs });
      scenarios = updateScenarioContext(scenarios, context.id, draft);
    }
    let review = createReviewSession(s, "e", "rev-print");
    for (const [index, id] of (["p", "q"] as const).entries()) review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[index], id));
    review = updateReviewSession(review, { name: "列印例會", decision_state: "adopted", notes, meeting_date: "2026-10-03" });
    const context = buildReviewDecisionContext(review, scenarios, emptyActionWorkspace());
    const summary = buildManagerSummary(s.snapshot, { importanceThreshold: review.importance_threshold });
    return renderToStaticMarkup(createElement(PrintSummary, { summary, decisionContext: context, snapshot: s.snapshot, meeting: { name: review.name, date: "2026-10-03" } }));
  }
  const appendixTag = `<section class="${styles.printAppendix}"`;

  it("keeps assumptions in the appendix only, puts the decision line right after the key deltas, and truncates long notes on page one", async () => {
    const tail = "（備註最後一句：只在附錄）";
    const notes = `${"請物流確認報價，".repeat(30)}${tail}`;
    expect(Array.from(notes).length).toBeGreaterThan(PRINT_NOTES_LIMIT);
    const html = await printable(notes);
    const firstPage = html.slice(0, html.indexOf(appendixTag)), appendix = html.slice(html.indexOf(appendixTag));
    expect(html.indexOf(appendixTag)).toBeGreaterThan(0);
    // 第一頁：兩個方案各一行（只有一個 <p>），沒有任何假設句。
    const lines = [...firstPage.matchAll(/<div data-testid="print-scenario-line">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.match(/<p>/g)).toHaveLength(1);
    expect(text(lines[0])).toBe(fill(summaryCopy.printScenarioLine, { name: "官網履約", scope: DTC_SCOPE, baseline: formatAmountL1("270.00"), contribution: formatAmountL1("284.00"), delta: formatSignedDelta("14.00", "L1") }));
    expect(firstPage).not.toContain(FULFILLMENT_10);
    expect(firstPage).not.toContain(fill(labels.ui.reviewSession.assumptionVolume, { value: "0" }));
    // 附錄：兩個方案的完整假設。
    const assumptions = block(appendix, "print-appendix-assumptions");
    expect(assumptions.startsWith(appendixTag)).toBe(true);
    expect(text(assumptions)).toContain(page.printAssumptionsHeading);
    expect(assumptions.split(FULFILLMENT_10)).toHaveLength(3);
    expect(text(assumptions)).toContain(fill(page.printAssumptionsItem, { name: "官網履約", scope: DTC_SCOPE }));
    expect(text(assumptions)).toContain("平台履約");
    // 決議行：在兩個關鍵差額之後、三件事之前；備註截在 200 字，全文在附錄。
    const decision = block(firstPage, "print-decision-line");
    const shortNotes = fill(page.printNotesTruncated, { text: Array.from(notes).slice(0, PRINT_NOTES_LIMIT).join("") });
    expect(text(decision)).toBe(fill(summaryCopy.printMeetingLine, { name: "列印例會", state: labels.meeting.decisions.adopted, notes: shortNotes }));
    expect(firstPage.indexOf(`class="${styles.printHeadlines}"`)).toBeLessThan(firstPage.indexOf('data-testid="print-decision-line"'));
    expect(firstPage.indexOf('data-testid="print-decision-line"')).toBeLessThan(firstPage.indexOf(`<h2>${labels.sections.topThree}</h2>`));
    expect(firstPage).not.toContain(tail);
    expect(text(block(appendix, "print-appendix-notes"))).toContain(notes);
    // 三件事仍是第一頁唯一的 <ol>；列印樣式恢復編號（Tailwind preflight 會清掉 list-style）。
    expect(firstPage.match(/<ol>/g)).toHaveLength(1);
    expect(readFileSync(resolve("src/components/manager-summary.module.css"), "utf8")).toMatch(/@media print[\s\S]*\.printSurface ol \{ list-style: decimal; \}/);
  });

  it("short notes stay on page one without a notes appendix", async () => {
    const html = await printable("照做");
    expect(text(block(html, "print-decision-line"))).toBe(fill(summaryCopy.printMeetingLine, { name: "列印例會", state: labels.meeting.decisions.adopted, notes: "照做" }));
    expect(html).not.toContain('data-testid="print-appendix-notes"');
  });

  it("the download-menu PDF is the current view only: no meeting header or decision line, pinned actions from the action workspace", async () => {
    const state = await setup();
    const context = currentViewDecisionContext(state.s.snapshot, state.actions);
    expect(context).toMatchObject({ dataset_hash: state.s.snapshot.dataset_hash, filter_hash: state.s.snapshot.filter_hash, pinnedOnly: true, scenarios: [], selectedScenarioIds: [], decisionState: page.printViewState });
    expect(context.reviewName).toBeUndefined();
    expect(context.notes).toBeUndefined();
    expect(context.actions.map(row => [row.id, row.pinned])).toEqual([["a1", true], ["a2", false]]);
    const html = renderToStaticMarkup(createElement(PrintSummary, { summary: buildManagerSummary(state.s.snapshot), decisionContext: context, snapshot: state.s.snapshot, meeting: null }));
    expect(html).not.toContain(`class="${styles.printMeta}"`);
    expect(html).not.toContain('data-testid="print-decision-line"');
    expect(html).not.toContain("十月例會");
    expect(text(html)).toContain(page.printViewState);
    expect(text(html)).toContain(summaryCopy.noScenario);
    const firstPage = html.slice(0, html.indexOf(appendixTag)), appendix = html.slice(html.indexOf(appendixTag));
    expect(text(firstPage)).toContain(context.actions[0].problem);
    expect(text(appendix)).toContain(summaryCopy.appendixHeading);
    expect(page.menuViewNote).toContain("不含會議決議");
  });
});
