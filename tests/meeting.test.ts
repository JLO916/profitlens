import { describe, expect, it } from "vitest";
import { expected, fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createReviewSession, rebuildReviewSnapshot, refreshReviewSession, selectReviewScenario, syncReviewPins, updateReviewSession, type ReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, removeBoundAction, type ActionWorkspace } from "@/application/action-workspace";
import { buildManagerSummary } from "@/application/manager-summary";
import { appendMeeting, compareWithLastMeeting, exportMeetingMarkdown, finalizeMeeting, freezeMeeting, lastMeeting, MAX_MEETING_HISTORY, MEETING_SCHEMA_VERSION, validateMeeting, type Meeting } from "@/application/meeting";
import { fill, labels } from "@/i18n";

const NOW = "2026-10-03T06:00:00.000Z";
const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
async function source(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name); const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
/** golden：DTC 方案 p（物流費 −10%）選入會議；待辦 a1（置頂、進行中）與 a2（未置頂）。 */
async function setup(reviewId = "rev-1", patch: Parameters<typeof updateReviewSession>[1] = { name: "十月例會", decision_state: "adopted", notes: "照做" }) {
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
  let review: ReviewSession = createReviewSession(s, "e", reviewId);
  review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, patch);
  const snapshot = await rebuildReviewSnapshot(review);
  return { s, scenarios, actions, review, snapshot };
}
async function finalized(reviewId = "rev-1", now = NOW, patch?: Parameters<typeof updateReviewSession>[1]) {
  const state = await setup(reviewId, patch);
  return { ...state, meeting: finalizeMeeting({ review: state.review, snapshot: state.snapshot, scenarios: state.scenarios, actions: state.actions, date: "2026-10-03", now }) };
}
/** 可變的合法副本（測試竄改用）。 */
const mutable = (meeting: Meeting): Meeting => structuredClone(meeting);
const withId = (meeting: Meeting, id: string, finalized_at = meeting.finalized_at): Meeting => freezeMeeting({ ...mutable(meeting), id, created_at: finalized_at, finalized_at });

describe("R6-1 finalizeMeeting builds a frozen meeting from the review's fixed scope", () => {
  it("agenda numbers match the golden fixture and buildManagerSummary (hand-checked differences)", async () => {
    const { meeting, snapshot, review } = await finalized();
    const golden = expected();
    expect(meeting.schema_version).toBe(MEETING_SCHEMA_VERSION);
    expect(meeting.id).toBe(`meeting-${review.id}-r${review.revision}`);
    expect(meeting).toMatchObject({ review_id: "rev-1", review_revision: review.revision, name: "十月例會", date: "2026-10-03", created_at: NOW, finalized_at: NOW, notes: "照做", thresholds: { importance: "0.00" } });
    expect(meeting.source_fixed).toEqual({ dataset_id: "golden-v1", dataset_hash: review.dataset_hash, filter_hash: review.filter_hash, metric_version: "contribution-v1", data_as_of: "2026-08-03",
      periods: { previous: { start: "2026-08-01", end: "2026-08-01" }, current: { start: "2026-08-02", end: "2026-08-02" }, comparison_mode: "same_days" }, channels: ["DTC", "MARKETPLACE"] });
    // 淨營收 2,250.00 → 2,470.00：差額 +220.00；扣廣告後貢獻 570.00 → 255.00：差額 −315.00（expected.json 的 bridge.sum）。
    expect(meeting.agenda.kpis).toEqual([
      { metric: "net_revenue", previous: golden.previous.net_revenue, current: golden.current.net_revenue, change: "220.00" },
      { metric: "contribution_after_marketing", previous: golden.previous.contribution_after_marketing, current: golden.current.contribution_after_marketing, change: golden.bridge.sum },
    ]);
    // 上期（08-01）手算：DTC 淨營收 1500 − 100 − 50 = 1350，貢獻 1350 − 600 − 150 − 200 = 400；MARKETPLACE 1000 − 100 − 0 = 900，900 − 450 − 180 − 100 = 170。
    // 本期（08-02）：DTC 1800 − 230 − 90 = 1480，1480 − 740 − 200 − 270 = 270；MARKETPLACE 1300 − 220 − 90 = 990，990 − 585 − 240 − 180 = −15。
    expect(meeting.agenda.channels).toEqual([
      { channel: "DTC", previous_net_revenue: "1350.00", current_net_revenue: golden.current_channels.DTC.net_revenue, net_revenue_change: "130.00", previous_contribution: "400.00", current_contribution: golden.current_channels.DTC.contribution_after_marketing, contribution_change: "-130.00" },
      { channel: "MARKETPLACE", previous_net_revenue: "900.00", current_net_revenue: golden.current_channels.MARKETPLACE.net_revenue, net_revenue_change: "90.00", previous_contribution: "170.00", current_contribution: golden.current_channels.MARKETPLACE.contribution_after_marketing, contribution_change: "-185.00" },
    ]);
    // 三件事＝對貢獻影響 |ΔCM| 315 > |−Δ折扣| (450 − 200) 250 > |−Δ廣告| (450 − 300) 150；與 summary.priorities 同源。
    const summary = buildManagerSummary(snapshot, { importanceThreshold: review.importance_threshold });
    expect(meeting.agenda.priorities.map(row => [row.rule, row.impact, row.scope])).toEqual([["REV_UP_CM_DOWN", "-315.00", labels.sections.total], ["DISCOUNT_BURDEN_UP", "-250.00", labels.sections.total], ["MARKETING_BURDEN_UP", "-150.00", labels.sections.total]]);
    expect(meeting.agenda.priorities.map(row => [row.headline, row.next_step])).toEqual(summary.priorities.map(row => [row.title, row.recommendation]));
    expect(meeting.agenda.priorities[0].next_step).toBe(labels.rules.REV_UP_CM_DOWN.nextStep);
    // 方案：DTC 基準 270.00，試算後 284.00（golden），差 284 − 270 = 14.00。
    expect(meeting.agenda.scenarios).toHaveLength(1);
    expect(meeting.agenda.scenarios[0]).toMatchObject({ channel: "DTC", plan_id: "p", revision: 1, name: "履約", baseline: golden.current_channels.DTC.contribution_after_marketing, contribution: golden.scenario_dtc_fulfillment_reduction.expected_contribution, delta: "14.00" });
    expect(meeting.agenda.scenarios[0].assumptions[0]).toBe(fill(labels.ui.reviewSession.assumptionVolume, { value: "0" }));
    expect(meeting.selected_scenarios).toEqual(review.selected_scenarios);
    // 只取置頂待辦；執行狀態與更新日來自 actionDocuments。
    expect(meeting.pinned_action_ids).toEqual(["a1"]);
    expect(meeting.agenda.pinned_actions).toEqual([expect.objectContaining({ action_id: "a1", execution_status: "in_progress", status_updated_at: "2026-10-01", owner: "", deadline: "" })]);
    expect(meeting.decisions).toEqual([{ state: "adopted", notes: "照做", confirmed_revision: review.revision }]);
  });
  it("applies the review threshold to the three things and keeps an explicit creation time", async () => {
    const state = await setup("rev-t", { importance_threshold: "200" });
    const meeting = finalizeMeeting({ review: state.review, snapshot: state.snapshot, scenarios: state.scenarios, actions: state.actions, date: "2026-10-03", now: NOW, created_at: "2026-10-03T01:00:00Z" });
    expect(meeting.thresholds.importance).toBe("200.00");
    expect(meeting.agenda.priorities.map(row => row.rule)).toEqual(["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP"]);
    expect(meeting.decisions).toEqual([{ state: "draft", notes: "", confirmed_revision: null }]);
    expect(meeting.created_at).toBe("2026-10-03T01:00:00Z");
  });
  it("is deeply frozen: every write throws TypeError and the review is left untouched", async () => {
    const { meeting, review } = await finalized();
    expect(() => { (meeting as { name: string }).name = "改名"; }).toThrow(TypeError);
    expect(() => { (meeting.agenda.kpis[0] as { current: string | null }).current = "1.00"; }).toThrow(TypeError);
    expect(() => { meeting.decisions.push({ state: "draft", notes: "", confirmed_revision: null }); }).toThrow(TypeError);
    expect(() => { (meeting.source_fixed.periods.current as { start: string }).start = "2026-01-01"; }).toThrow(TypeError);
    expect(() => { meeting.agenda.scenarios[0].assumptions[0] = "x"; }).toThrow(TypeError);
    expect(Object.isFrozen(review.selected_scenarios)).toBe(false);
    expect(meeting.agenda.kpis[0].current).toBe("2470.00");
  });
  it("rejects a historical review, another dataset or another scope, and invalid dates", async () => {
    const state = await setup();
    const base = { review: state.review, snapshot: state.snapshot, scenarios: state.scenarios, actions: state.actions, date: "2026-10-03", now: NOW };
    expect(() => finalizeMeeting({ ...base, review: refreshReviewSession(state.review, "another-epoch") })).toThrow("MEETING_SOURCE_MISMATCH");
    const demo = (await source("demo")).snapshot, dtc = (await source("golden", { channels: ["DTC"] })).snapshot;
    expect(() => finalizeMeeting({ ...base, snapshot: demo })).toThrow("MEETING_SOURCE_MISMATCH");
    expect(() => finalizeMeeting({ ...base, snapshot: dtc })).toThrow("MEETING_SOURCE_MISMATCH");
    for (const date of ["2026-02-30", "2026/10/03", "", "2026-10-3"]) expect(() => finalizeMeeting({ ...base, date })).toThrow("INVALID_MEETING_DATE");
    expect(() => finalizeMeeting({ ...base, now: "yesterday" })).toThrow("INVALID_MEETING");
    expect(() => finalizeMeeting({ ...base, created_at: "2026-10-04T00:00:00Z" })).toThrow("INVALID_MEETING");
  });
});

describe("R6-1 validateMeeting", () => {
  it("accepts finalize output and its JSON round trip", async () => {
    const { meeting } = await finalized();
    expect(() => validateMeeting(meeting)).not.toThrow();
    expect(() => validateMeeting(JSON.parse(JSON.stringify(meeting)))).not.toThrow();
  });
  it.each<[string, (meeting: Meeting) => unknown]>([
    ["null", () => null],
    ["an empty object", () => ({})],
    ["an unknown key", meeting => ({ ...meeting, extra: 1 })],
    ["another schema version", meeting => ({ ...meeting, schema_version: "meeting-v2" })],
    ["a blank name", meeting => ({ ...meeting, name: "   " })],
    ["a name over 200 characters", meeting => ({ ...meeting, name: "會".repeat(201) })],
    ["notes over 8000 characters", meeting => ({ ...meeting, notes: "x".repeat(8001) })],
    ["an impossible meeting date", meeting => ({ ...meeting, date: "2026-13-01" })],
    ["a non-ISO finalize time", meeting => ({ ...meeting, finalized_at: "2026-10-03 06:00" })],
    ["created after finalize", meeting => ({ ...meeting, created_at: "2026-10-04T00:00:00Z" })],
    ["a float amount", meeting => { const value = mutable(meeting); (value.agenda.kpis[0] as unknown as { current: number }).current = 2470; return value; }],
    ["an amount with three decimals", meeting => { const value = mutable(meeting); value.agenda.channels[0].current_net_revenue = "1480.001"; return value; }],
    ["a change that is not current − previous", meeting => { const value = mutable(meeting); value.agenda.kpis[1].change = "-314.00"; return value; }],
    ["a tampered channel amount", meeting => { const value = mutable(meeting); value.agenda.channels[1].current_contribution = "15.00"; return value; }],
    ["a missing KPI row", meeting => { const value = mutable(meeting); value.agenda.kpis.pop(); return value; }],
    ["four priorities", meeting => { const value = mutable(meeting); value.agenda.priorities.push({ ...value.agenda.priorities[0], rule: "REFUND_BURDEN_UP" }); return value; }],
    ["four pinned actions", meeting => { const value = mutable(meeting); const row = value.agenda.pinned_actions[0]; value.agenda.pinned_actions = ["a1", "b", "c", "d"].map(action_id => ({ ...row, action_id })); value.pinned_action_ids = ["a1", "b", "c", "d"]; return value; }],
    ["pinned rows that differ from the pinned ids", meeting => ({ ...mutable(meeting), pinned_action_ids: ["other"] })],
    ["more scenarios than channels", meeting => { const value = mutable(meeting); const ref = value.selected_scenarios[0]; const row = value.agenda.scenarios[0]; value.selected_scenarios = [ref, { ...ref, channel: "MARKETPLACE" }, { ...ref, channel: "OTHER" }]; value.agenda.scenarios = value.selected_scenarios.map(item => ({ ...row, channel: item.channel })); return value; }],
    ["a scenario that is not the selected version", meeting => { const value = mutable(meeting); value.agenda.scenarios[0].revision = 2; return value; }],
    ["over 1,000 channels", meeting => { const value = mutable(meeting); value.source_fixed.channels = Array.from({ length: 1001 }, (_, index) => `C${index}`); return value; }],
    ["duplicate channels", meeting => { const value = mutable(meeting); value.source_fixed.channels = ["DTC", "DTC"]; return value; }],
    ["an unconfirmed adopted decision", meeting => { const value = mutable(meeting); value.decisions[0].confirmed_revision = null; return value; }],
    ["no decision", meeting => ({ ...mutable(meeting), decisions: [] })],
    ["an invalid status date", meeting => { const value = mutable(meeting); value.agenda.pinned_actions[0].status_updated_at = "2026-02-30"; return value; }],
    ["a malformed threshold", meeting => ({ ...mutable(meeting), thresholds: { importance: "1e3" } })],
    ["overlapping periods", meeting => { const value = mutable(meeting); value.source_fixed.periods.previous = { start: "2026-08-01", end: "2026-08-02" }; return value; }],
  ])("rejects %s with INVALID_MEETING", async (_label, mutate) => {
    const { meeting } = await finalized();
    expect(() => validateMeeting(mutate(meeting))).toThrow("INVALID_MEETING");
  });
});

describe("R6-1 meeting history", () => {
  it("appends without touching the input, sorts by finalize time and finds the last meeting", async () => {
    const { meeting } = await finalized();
    const later = withId(meeting, "later", "2026-10-10T06:00:00Z");
    const earlier = withId(meeting, "earlier", "2026-09-26T06:00:00.500Z");
    const history = Object.freeze([meeting]);
    const once = appendMeeting(history, later);
    const twice = appendMeeting(once, earlier);
    expect(history).toEqual([meeting]);
    expect(once.map(row => row.id)).toEqual([meeting.id, "later"]);
    expect(twice.map(row => row.id)).toEqual(["earlier", meeting.id, "later"]);
    expect(lastMeeting(twice)?.id).toBe("later");
    expect(lastMeeting([later, earlier, meeting])?.id).toBe("later");
    expect(lastMeeting([])).toBeNull();
    // 同一時間：保留加入順序，最後加入者視為最近一次。
    const tie = withId(meeting, "tie", meeting.finalized_at);
    expect(appendMeeting([meeting], tie).map(row => row.id)).toEqual([meeting.id, "tie"]);
    expect(lastMeeting([meeting, tie])?.id).toBe("tie");
  });
  it("rejects duplicates, a full history and an invalid meeting", async () => {
    const { meeting } = await finalized();
    expect(() => appendMeeting([meeting], meeting)).toThrow("DUPLICATE_MEETING");
    expect(() => appendMeeting([meeting], withId(meeting, meeting.id, "2026-10-10T00:00:00Z"))).toThrow("DUPLICATE_MEETING");
    const full = Array.from({ length: MAX_MEETING_HISTORY }, (_, index) => withId(meeting, `m${index}`));
    expect(() => appendMeeting(full.slice(0, -1), full.at(-1)!)).not.toThrow();
    expect(() => appendMeeting(full, withId(meeting, "one-more"))).toThrow("MEETING_HISTORY_FULL");
    expect(() => appendMeeting([], { ...mutable(meeting), name: "" })).toThrow("INVALID_MEETING");
  });
});

describe("R6-1 compareWithLastMeeting (05 §10)", () => {
  it("none: no previous meeting", async () => {
    const { snapshot, review, actions } = await setup();
    const result = compareWithLastMeeting({ snapshot, review, actions }, null);
    expect(result).toEqual({ kind: "none", last: null, note: labels.meetingRecord.noLastMeeting, kpis: [], priorities: { last: [], current: [] }, decisions: [], actions: [] });
  });
  it("same_scope: two meetings from different reviews on the same snapshot compare KPI and track actions", async () => {
    const first = await finalized("rev-1");
    const second = await setup("rev-2", { name: "下週例會" });
    const history = appendMeeting([], first.meeting);
    let actions = editActionManagement(second.actions, "a1", { execution_status: "completed" }, "2026-10-08");
    const result = compareWithLastMeeting({ snapshot: second.snapshot, review: second.review, actions }, lastMeeting(history));
    expect(result.kind).toBe("same_scope");
    expect(result.last).toBe(first.meeting);
    expect(result.note).toBe(labels.meetingRecord.sameScope);
    // 同一份資料同一期間：本期對本期差額為 0.00。
    expect(result.kpis).toEqual([
      { metric: "net_revenue", last: "2470.00", current: "2470.00", change: "0.00" },
      { metric: "contribution_after_marketing", last: "255.00", current: "255.00", change: "0.00" },
    ]);
    expect(result.priorities.last).toEqual(first.meeting.agenda.priorities);
    expect(result.priorities.current.map(row => row.rule)).toEqual(["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "MARKETING_BURDEN_UP"]);
    expect(result.decisions).toEqual(first.meeting.decisions);
    expect(result.actions).toEqual([{ action_id: "a1", problem: first.meeting.agenda.pinned_actions[0].problem, last_status: "in_progress", current_status: "completed", status_updated_at: "2026-10-08" }]);
    // 待辦被刪掉：目前狀態未知（null）。
    actions = removeBoundAction(actions, "a1");
    expect(compareWithLastMeeting({ snapshot: second.snapshot, review: second.review, actions }, first.meeting).actions[0]).toMatchObject({ action_id: "a1", last_status: "in_progress", current_status: null, status_updated_at: null });
  });
  it("different_periods: same dataset and channels, other periods — still compares and labels both current periods", async () => {
    const demo = await source("demo");
    const review = createReviewSession(demo, "d", "demo-review");
    const last = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: emptyScenarioWorkspace("d"), actions: emptyActionWorkspace(), date: "2026-08-24", now: "2026-08-24T02:00:00Z" });
    // 示範資料預設本期 7/13–8/23：淨營收 7,850,657.90、扣廣告後貢獻 1,269,792.73（computed_summary.json）。
    expect(last.agenda.kpis.map(row => row.current)).toEqual(["7850657.90", "1269792.73"]);
    const moved = await source("demo", { previous_period: { start: "2026-06-29", end: "2026-07-26" }, current_period: { start: "2026-07-27", end: "2026-08-23" } });
    const result = compareWithLastMeeting({ snapshot: moved.snapshot, review: null, actions: emptyActionWorkspace() }, last);
    expect(result.kind).toBe("different_periods");
    expect(result.note).toBe(fill(labels.meetingRecord.differentPeriods, { last: "7/13–8/23", current: "7/27–8/23" }));
    const cents = (value: string) => BigInt(value.replace(".", ""));
    for (const [index, metric] of (["net_revenue", "contribution_after_marketing"] as const).entries()) {
      const current = moved.snapshot.report.current.metrics[metric].value!;
      const change = cents(current) - cents(last.agenda.kpis[index].current!);
      const sign = change < 0n ? "-" : "", abs = change < 0n ? -change : change;
      expect(result.kpis[index]).toEqual({ metric, last: last.agenda.kpis[index].current, current, change: `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}` });
    }
    expect(result.priorities.last).toEqual(last.agenda.priorities);
    expect(result.decisions).toEqual([{ state: "draft", notes: "", confirmed_revision: null }]);
  });
  it("labels years when the two periods fall in different years", async () => {
    const { meeting, snapshot, review, actions } = await finalized();
    const older = freezeMeeting({ ...mutable(meeting), source_fixed: { ...mutable(meeting).source_fixed, periods: { previous: { start: "2025-12-01", end: "2025-12-01" }, current: { start: "2025-12-02", end: "2025-12-02" }, comparison_mode: "same_days" } } });
    const result = compareWithLastMeeting({ snapshot, review, actions }, older);
    expect(result.kind).toBe("different_periods");
    expect(result.note).toBe(fill(labels.meetingRecord.differentPeriods, { last: "2025/12/2–2025/12/2", current: "2026/8/2–2026/8/2" }));
  });
  it("different_dataset: another dataset only lists the last decisions and action statuses", async () => {
    const { meeting, actions } = await finalized();
    const demo = await source("demo");
    const result = compareWithLastMeeting({ snapshot: demo.snapshot, review: null, actions }, meeting);
    expect(result).toEqual({
      kind: "different_dataset", last: meeting, note: labels.meeting.noComparable, kpis: [], priorities: { last: [], current: [] }, decisions: meeting.decisions,
      actions: [{ action_id: "a1", problem: meeting.agenda.pinned_actions[0].problem, last_status: "in_progress", current_status: "in_progress", status_updated_at: "2026-10-01" }],
    });
  });
  it("same dataset with another channel set follows the different-dataset rule and says the channels differ", async () => {
    const { meeting, actions } = await finalized();
    const dtc = await source("golden", { channels: ["DTC"] });
    const result = compareWithLastMeeting({ snapshot: dtc.snapshot, review: null, actions }, meeting);
    expect(result.kind).toBe("different_dataset");
    expect(result.note).toBe(fill(labels.meetingRecord.differentChannels, { last: "DTC、MARKETPLACE", current: "DTC" }));
    expect(result.kpis).toEqual([]);
    expect(result.priorities).toEqual({ last: [], current: [] });
    expect(result.decisions).toEqual(meeting.decisions);
  });
});

describe("R6-1 exportMeetingMarkdown", () => {
  it("writes the six agenda sections, decisions, comparison and technical details", async () => {
    const first = await finalized("rev-1");
    const second = await finalized("rev-2", "2026-10-10T06:00:00Z", { name: "下週例會" });
    const comparison = compareWithLastMeeting({ snapshot: second.snapshot, review: second.review, actions: second.actions }, first.meeting);
    const text = exportMeetingMarkdown(second.meeting, comparison);
    expect(text.startsWith(fill(labels.meetingRecord.mdTitle, { brand: labels.brand.name, name: "下週例會" }))).toBe(true);
    for (const heading of Object.values(labels.meetingRecord.agenda)) expect(text).toContain(`### ${heading}`);
    for (const heading of [labels.meetingRecord.mdScope, `## ${labels.sections.meetingAgenda}`, `## ${labels.sections.meetingDecision}`, `## ${labels.sections.meetingCompare}`, `## ${labels.sections.technicalDetails}`]) expect(text).toContain(heading);
    expect(text.indexOf(labels.meetingRecord.agenda.kpis)).toBeLessThan(text.indexOf(labels.meetingRecord.agenda.actions));
    expect(text).toContain(fill(labels.meetingRecord.mdKpiRow, { metric: labels.metrics.contribution_after_marketing.label, previous: "570.00", current: "255.00", change: "-315.00" }));
    expect(text).toContain(fill(labels.meetingRecord.mdKpiRow, { metric: labels.metrics.net_revenue.label, previous: "2250.00", current: "2470.00", change: "+220.00" }));
    expect(text).toContain("| MARKETPLACE | 900.00 | 990.00 | +90.00 | 170.00 | -15.00 | -185.00 |");
    expect(text).toContain(fill(labels.meetingRecord.mdLastMeeting, { name: "十月例會", date: "2026-10-03" }));
    expect(text).toContain(labels.meetingRecord.sameScope);
    const columns = labels.meetingRecord.compareColumns;
    expect(text).toContain(`| ${columns.metric} | ${columns.last} | ${columns.current} | ${columns.change} |`);
    expect(text).toContain(`| ${labels.metrics.contribution_after_marketing.label} | 255.00 | 255.00 | 0.00 |`);
    expect(text).toContain(`- meeting_id：meeting-rev-2-r${second.review.revision}`);
    expect(text).toContain(`- comparison：same_scope；last_meeting_id：meeting-rev-1-r${first.review.revision}`);
  });
  it("escapes untrusted names, notes and action text (no raw HTML, links or table breaks)", async () => {
    const state = await setup("rev-x", { name: "<script>alert(1)</script> [link](x)", notes: "第一行\n## 假標題 | 破表", decision_state: "needs_data" });
    const actions = editBoundAction(state.actions, "a1", { problem: "退款 | <b>粗</b>\n下一行", owner_role: "[老闆](javascript:x)" });
    const meeting = finalizeMeeting({ review: state.review, snapshot: state.snapshot, scenarios: state.scenarios, actions, date: "2026-10-03", now: NOW });
    const text = exportMeetingMarkdown(meeting);
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("[link](x)");
    expect(text).toContain("&lt;script&gt;alert\\(1\\)&lt;/script&gt; \\[link\\]\\(x\\)");
    expect(text).not.toContain("\n## 假標題");
    expect(text).toContain("第一行&#10;\\#\\# 假標題 \\| 破表");
    expect(text).toContain("退款 \\| &lt;b&gt;粗&lt;/b&gt;&#10;下一行");
    expect(text).not.toContain("[老闆](javascript:x)");
    expect(text).toContain("\\[老闆\\]\\(javascript:x\\)");
    expect(text).toContain(labels.meetingRecord.noLastMeeting);
    expect(text).toContain(fill(labels.meetingRecord.decisionConfirmed, { decision: labels.meeting.decisions.need_data, revision: meeting.decisions[0].confirmed_revision }));
  });
  it("a different-dataset comparison only shows the reason, decisions and action statuses", async () => {
    const { meeting, actions } = await finalized();
    const demo = await source("demo");
    const review = createReviewSession(demo, "d", "demo-review");
    const current = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: emptyScenarioWorkspace("d"), actions: emptyActionWorkspace(), date: "2026-10-10", now: "2026-10-10T06:00:00Z" });
    const text = exportMeetingMarkdown(current, compareWithLastMeeting({ snapshot: demo.snapshot, review, actions }, meeting));
    expect(text).toContain(labels.meeting.noComparable);
    expect(text).not.toContain(`| ${labels.meetingRecord.compareColumns.metric} | ${labels.meetingRecord.compareColumns.last} |`);
    expect(text).not.toContain(`${labels.meetingRecord.lastPriorities}：`);
    expect(text).toContain(fill(labels.meetingRecord.mdFollowUpRow, { problem: meeting.agenda.pinned_actions[0].problem, last: labels.actions.statuses.in_progress, current: labels.actions.statuses.in_progress, updated: fill(labels.meetingRecord.statusUpdatedAt, { date: "2026-10-01" }) }));
    expect(text).toContain(labels.meetingRecord.noScenarios);
    expect(text).toContain(labels.meetingRecord.noPinnedActions);
  });
});
