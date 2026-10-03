import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expected, fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, taipeiToday, type ActionWorkspace } from "@/application/action-workspace";
import { finalizeMeeting, freezeMeeting, validateMeeting, type Meeting } from "@/application/meeting";
import { exportWorkspaceBackup, restoreWorkspaceBackup } from "@/application/workspace-backup";
import { DECISION_LABEL_KEY, MeetingEntry, MeetingPage, meetingExportInfo, type MeetingPageProps } from "../src/components/meeting-page";
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

const page = labels.meetingPage, record = labels.meetingRecord;
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
    // ①②③ 由會議摘要（固定範圍）提供：淨營收 +220.00、扣廣告後貢獻 −315.00（golden 手算）。
    const summary = block(html, "manager-summary");
    expect(summary).toContain("+220.00");
    expect(summary).toContain("-315.00");
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
    expect(rows).toEqual([
      [labels.metrics.net_revenue.label, "2,470.00", "2,470.00", "0.00"],
      [labels.metrics.contribution_after_marketing.label, "300.00", "255.00", "-45.00"],
    ]);
    expect(kpis).toContain('<td class="negative">-45.00</td>');
    expect(text(compare)).toContain(record.lastPriorities);
    expect(text(compare)).toContain(record.currentPriorities);
    expect(text(compare)).toContain(fill(page.priorityRow, { n: 1, headline: last.agenda.priorities[0].headline, scope: labels.sections.total, impact: labels.sections.impact, amount: "-315.00" }));
    // ④ 上次決議追蹤：上次「採用」（已確認）；a1 上次與目前都是進行中，更新日 2026-10-01。
    const followUp = block(html, "meeting-followup");
    expect(text(followUp)).toContain(fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: state.review.revision }));
    for (const column of Object.values(page.followUpColumns)) expect(text(followUp)).toContain(column);
    expect(text(followUp)).toContain(`${labels.actions.statuses.in_progress}${labels.actions.statuses.in_progress}2026-10-01`);
    // 歷史一筆：名稱 · 日期 · 決議，可下載 Markdown。
    const history = block(html, "meeting-history");
    expect(history.match(/data-testid="meeting-history-item"/g)).toHaveLength(1);
    expect(text(history)).toContain(fill(page.historyItem, { name: "十月例會", date: "2026-10-03", decision: fill(record.decisionConfirmed, { decision: labels.meeting.decisions.adopted, revision: state.review.revision }) }));
    expect(text(history)).toContain(fill(page.historyKpiRow, { metric: labels.metrics.contribution_after_marketing.label, previous: "570.00", current: "300.00", change: "-270.00" }));
    expect(buttons(history)).toEqual([labels.buttons.exportMarkdown]);
  });

  it("different dataset: no KPI comparison, only the last decisions and the pinned-action status table", async () => {
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
    const followUp = block(compare, "meeting-compare-followup");
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
    expect(buttons(html)).toEqual([`${page.goToMeeting} →`]);
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
