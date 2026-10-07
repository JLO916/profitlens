import { describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { decisionSignature, emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession } from "@/application/review-session";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction } from "@/application/action-workspace";
import { appendMeeting, exportMeetingMarkdown, finalizeMeeting, freezeMeeting, MAX_MEETING_HISTORY, type Meeting } from "@/application/meeting";
import { fill, labels } from "@/i18n";
import { formatAmountL2, formatSignedDelta } from "@/application/presentation";
import { exportWorkspaceBackup, restoreWorkspaceBackup, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";

const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
async function source(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name); const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
async function resign(value: Record<string, unknown>): Promise<string> {
  const { checksum: _checksum, ...body } = value;
  void _checksum;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(body)));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("") });
}
/** Same helper as workspace-backup.test.ts: the exact v3 wire shape (no v4 keys), re-signed like a genuine v3 file. */
async function asV3(text: string): Promise<string> {
  const body = JSON.parse(text);
  body.schema_version = "profitlens-workspace-v3";
  for (const key of ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"]) delete body.payload[key];
  // R5 的待辦狀態更新日只存在 v4 信封；真正的 v3 檔沒有這個欄位。
  for (const item of body.payload.action_workspace.items) delete item.status_updated_at;
  return resign(body);
}
const again = (restored: RestoredWorkspace): WorkspaceBackupSource => ({ ...restored, filters: restored.snapshot.report.scope });

/** golden 工作區＋兩次已結束的會議（不同 review，同一份資料）；第二次會議時待辦已完成。 */
async function workspace() {
  const s = await source();
  let scenarios = ensureScenarioContext(emptyScenarioWorkspace("e"), await source("golden", { channels: ["DTC"] }));
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs });
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  let actions = pinAction(addActionDraft(emptyActionWorkspace(), s, "a1"), "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  const meeting = async (id: string, name: string, now: string, history: readonly Meeting[] = []) => {
    let review = createReviewSession(s, "e", id, `${now.slice(0, 10)}T01:00:00.000Z`);
    review = syncReviewPins(selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p")), actions);
    review = updateReviewSession(review, { name, decision_state: "adopted", notes: `${name}備註` });
    return { review, meeting: finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: now.slice(0, 10), now, history }) };
  };
  const first = await meeting("rev-1", "十月第一週", "2026-10-03T06:00:00.000Z");
  actions = editActionManagement(actions, "a1", { execution_status: "completed" }, "2026-10-08");
  const second = await meeting("rev-2", "十月第二週", "2026-10-10T06:00:00.000Z", [first.meeting]);
  const history = appendMeeting(appendMeeting([], first.meeting), second.meeting);
  const backup: WorkspaceBackupSource = { input: s.input, filters: s.snapshot.report.scope, id: "golden", revision: 1, decision: emptyDecisionWorkspace(), action_workspace: actions, scenario_workspace: scenarios, review_session: second.review, meeting_history: history };
  return { backup, history, first: first.meeting, second: second.meeting };
}
const withId = (meeting: Meeting, id: string): Meeting => freezeMeeting({ ...structuredClone(meeting), id });

describe("R6-1 backup v4 carries meeting_history (additive, same version string)", () => {
  it("round trips two meetings exactly and keeps them frozen", async () => {
    const { backup, history } = await workspace();
    const text = await exportWorkspaceBackup(backup);
    const wire = JSON.parse(text);
    expect(wire.schema_version).toBe("profitlens-workspace-v4");
    expect(wire.payload.meeting_history).toEqual(JSON.parse(JSON.stringify(history)));
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.meeting_history).toEqual(history);
    expect(restored.meeting_history.map(row => row.agenda.pinned_actions[0].execution_status)).toEqual(["in_progress", "completed"]);
    expect(restored.meeting_history[0].agenda.kpis[1]).toEqual({ metric: "contribution_after_marketing", previous: "570.00", current: "255.00", change: "-315.00" });
    expect(Object.isFrozen(restored.meeting_history[1].agenda.scenarios[0].assumptions)).toBe(true);
    expect(() => { (restored.meeting_history[0] as { notes: string }).notes = "改"; }).toThrow(TypeError);
    // 再存一次：會議紀錄逐位元相同。
    const twice = JSON.parse(await exportWorkspaceBackup(again(restored)));
    expect(twice.payload.meeting_history).toEqual(wire.payload.meeting_history);
  });
  it("carries the frozen follow-up, basis and the review's creation time; the restored record still exports ④ and the comparison", async () => {
    const { backup, first, second } = await workspace();
    expect(second.follow_up.kind).toBe("same_scope");
    const text = await exportWorkspaceBackup(backup);
    const wire = JSON.parse(text);
    expect(wire.payload.meeting_history[1].follow_up).toEqual(JSON.parse(JSON.stringify(second.follow_up)));
    expect(wire.payload.meeting_history[1].source_fixed.basis).toEqual([...labels.basis.items]);
    expect(wire.payload.review_session.created_at).toBe("2026-10-10T01:00:00.000Z");
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.meeting_history[0].follow_up.kind).toBe("none");
    expect(restored.meeting_history[1].follow_up).toEqual(second.follow_up);
    expect(restored.meeting_history[1].created_at).toBe("2026-10-10T01:00:00.000Z");
    expect(restored.review_session?.created_at).toBe("2026-10-10T01:00:00.000Z");
    // ④：上次會議名稱、上次決議、上次待辦「進行中」→ 第二次會議時「已完成」。
    const markdown = exportMeetingMarkdown(restored.meeting_history[1]);
    expect(markdown).toContain(fill(labels.meetingRecord.mdLastMeeting, { name: "十月第一週", date: "2026-10-03" }));
    expect(markdown).toContain(fill(labels.meetingRecord.mdFollowUpRow, { problem: first.agenda.pinned_actions[0].problem, last: labels.actions.statuses.in_progress, current: labels.actions.statuses.done, updated: fill(labels.meetingRecord.statusUpdatedAt, { date: "2026-10-08" }) }));
    // V3-2b：會議紀錄 Markdown 主文是 L2 整數元。
    expect(markdown).toContain(`| ${labels.metrics.contribution_after_marketing.label} | ${formatAmountL2("255.00")} | ${formatAmountL2("255.00")} | ${formatSignedDelta("0.00", "L2")} |`);
    expect(markdown).not.toContain(labels.meetingRecord.noLastMeeting);
    // 會議稿沒有建立時間（舊資料）也照常備份與還原。
    const { created_at: _created, ...legacyReview } = backup.review_session!;
    void _created;
    const legacy = await restoreWorkspaceBackup(await exportWorkspaceBackup({ ...backup, review_session: legacyReview }));
    expect(legacy.review_session).not.toHaveProperty("created_at");
  });
  it("writes [] when there is no history, and keeps a meeting from another dataset as a self-contained record", async () => {
    const { backup, first } = await workspace();
    expect(JSON.parse(await exportWorkspaceBackup({ ...backup, meeting_history: undefined })).payload.meeting_history).toEqual([]);
    const demo = await source("demo");
    const review = createReviewSession(demo, "d", "demo-review");
    const old = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: emptyScenarioWorkspace("d"), actions: emptyActionWorkspace(), date: "2026-08-24", now: "2026-08-24T02:00:00Z" });
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup({ ...backup, meeting_history: appendMeeting([first], old) }));
    expect(restored.meeting_history.map(row => row.source_fixed.dataset_id)).toEqual(["synthetic-demo-12w-v1", "golden-v1"]);
  });
  it("a v3 backup restores with an empty meeting history; a v3 file carrying meeting_history is rejected", async () => {
    const { backup } = await workspace();
    const v3Text = await asV3(await exportWorkspaceBackup(backup));
    const restored = await restoreWorkspaceBackup(v3Text);
    expect(restored.meeting_history).toEqual([]);
    expect(restored.review_session?.name).toBe("十月第二週");
    const body = JSON.parse(v3Text);
    body.payload.meeting_history = [];
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  /** 備份檔裡一筆會議的可竄改形狀（只列測試會改到的欄位）。 */
  type WireMeeting = { id: string; date: string; name: string; extra?: unknown; copy_version?: unknown; agenda: { kpis: { current: unknown; change: unknown }[]; channels: { current_net_revenue: unknown; current_contribution: unknown }[] } };
  it.each<[string, (history: WireMeeting[]) => void]>([
    ["an amount with three decimals", history => { history[0].agenda.kpis[0].current = "2470.001"; }],
    ["a float amount", history => { history[1].agenda.channels[0].current_net_revenue = 1480; }],
    ["a well-formed amount that breaks current − previous", history => { history[0].agenda.channels[1].current_contribution = "15.00"; }],
    ["a tampered KPI change", history => { history[1].agenda.kpis[0].change = "0.00"; }],
    ["a duplicate meeting id", history => { history[1].id = history[0].id; }],
    ["an unknown meeting key", history => { history[0].extra = true; }],
    ["an invalid meeting date", history => { history[0].date = "2026-02-30"; }],
    ["a name over 200 characters", history => { history[0].name = "會".repeat(201); }],
    ["a meeting that is not an object", history => { history.push("meeting" as unknown as WireMeeting); }],
    // V3-7（D-V3-22）：copy_version 只接受 "v3"（或沒有這個欄位）。
    ["a copy_version other than v3", history => { history[0].copy_version = "v2"; }],
  ])("rejects %s with INVALID_WORKSPACE_FORMAT even after re-signing", async (_label, mutate) => {
    const { backup } = await workspace();
    const body = JSON.parse(await exportWorkspaceBackup(backup));
    mutate(body.payload.meeting_history);
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  /** 內部一致（差額＝本期 − 上期、格式合法）但與來源重算不符的竄改：validateMeeting 擋不下，要靠重算核對。 */
  type RecomputedMeeting = { source_fixed: { dataset_id: string; filter_hash: string; data_as_of: string }; thresholds: { importance: string }; agenda: { kpis: { metric: string; previous: string; current: string; change: string }[]; channels: Record<string, string>[]; priorities: { rule: string; impact: string; headline: string }[] } };
  it.each<[string, (meeting: RecomputedMeeting) => void]>([
    // 扣廣告後貢獻 570.00 → 300.00（差額 −270.00）；golden 實際本期 255.00。
    ["a KPI changed consistently", meeting => { meeting.agenda.kpis[1] = { metric: "contribution_after_marketing", previous: "570.00", current: "300.00", change: "-270.00" }; }],
    // MARKETPLACE 貢獻 170.00 → 15.00（差額 −155.00）；golden 實際 −15.00、差額 −185.00。
    ["a channel row changed consistently", meeting => { Object.assign(meeting.agenda.channels[1], { current_contribution: "15.00", contribution_change: "-155.00" }); }],
    ["a priority impact", meeting => { meeting.agenda.priorities[0].impact = "-300.00"; }],
    ["the priority order", meeting => { meeting.agenda.priorities.reverse(); }],
    ["the importance threshold (would leave two priorities)", meeting => { meeting.thresholds.importance = "200.00"; }],
    ["the filter hash", meeting => { meeting.source_fixed.filter_hash = "0".repeat(64); }],
    ["the data-as-of date", meeting => { meeting.source_fixed.data_as_of = "2026-08-04"; }],
    ["the dataset id", meeting => { meeting.source_fixed.dataset_id = "golden-v2"; }],
  ])("recomputes a meeting whose source is in the backup and rejects %s with INVALID_WORKSPACE_FORMAT", async (_label, mutate) => {
    const { backup } = await workspace();
    const body = JSON.parse(await exportWorkspaceBackup(backup));
    mutate(body.payload.meeting_history[0]);
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("V3-7（D-V3-22）：v2 結束的紀錄（沒有 copy_version）照樣還原，讀回 undefined；v3 結束的紀錄讀回 \"v3\"", async () => {
    const { backup } = await workspace();
    const body = JSON.parse(await exportWorkspaceBackup(backup));
    expect(body.payload.meeting_history.map((row: { copy_version?: string }) => row.copy_version)).toEqual(["v3", "v3"]);
    delete body.payload.meeting_history[0].copy_version;
    const restored = await restoreWorkspaceBackup(await resign(body));
    expect(restored.meeting_history.map(row => row.copy_version)).toEqual([undefined, "v3"]);
    expect(Object.hasOwn(restored.meeting_history[0], "copy_version")).toBe(false);
  });
  it("does not compare priority wording (label copy may change between releases), only rules and impact amounts", async () => {
    const { backup } = await workspace();
    const body = JSON.parse(await exportWorkspaceBackup(backup));
    body.payload.meeting_history[0].agenda.priorities[0].headline = "舊版文案的標題";
    const restored = await restoreWorkspaceBackup(await resign(body));
    expect(restored.meeting_history[0].agenda.priorities[0].headline).toBe("舊版文案的標題");
  });
  it("keeps a meeting whose source is not in the backup as a self-contained record (not recomputed)", async () => {
    const { backup, first } = await workspace();
    const demo = await source("demo");
    const review = createReviewSession(demo, "d", "demo-review");
    const old = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: emptyScenarioWorkspace("d"), actions: emptyActionWorkspace(), date: "2026-08-24", now: "2026-08-24T02:00:00Z" });
    const body = JSON.parse(await exportWorkspaceBackup({ ...backup, meeting_history: appendMeeting([first], old) }));
    expect(Object.keys(body.payload.sources)).not.toContain(old.source_fixed.dataset_hash);
    // 示範資料的會議：扣廣告後貢獻改成內部一致的另一個數字，來源不在備份裡，無從核對。
    const kpi = body.payload.meeting_history[0].agenda.kpis[1];
    expect(body.payload.meeting_history[0].source_fixed.dataset_id).toBe("synthetic-demo-12w-v1");
    Object.assign(kpi, { current: "1.00", change: `-${(BigInt(kpi.previous.replace(".", "")) - 100n).toString().replace(/(\d{2})$/, ".$1")}` });
    const restored = await restoreWorkspaceBackup(await resign(body));
    expect(restored.meeting_history[0].agenda.kpis[1].current).toBe("1.00");
  });
  it("detects an unsigned change to a meeting amount through the unchanged checksum rule", async () => {
    const { backup } = await workspace();
    const body = JSON.parse(await exportWorkspaceBackup(backup));
    body.payload.meeting_history[0].agenda.kpis[0].current = "9999.00";
    await expect(restoreWorkspaceBackup(JSON.stringify(body))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
  });
  it(`accepts ${MAX_MEETING_HISTORY} meetings and rejects one more`, async () => {
    const { backup, first } = await workspace();
    const full = Array.from({ length: MAX_MEETING_HISTORY }, (_, index) => withId(first, `m${index}`));
    const text = await exportWorkspaceBackup({ ...backup, meeting_history: full });
    expect((await restoreWorkspaceBackup(text)).meeting_history).toHaveLength(MAX_MEETING_HISTORY);
    await expect(exportWorkspaceBackup({ ...backup, meeting_history: [...full, withId(first, "one-more")] })).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const body = JSON.parse(text);
    body.payload.meeting_history.push({ ...body.payload.meeting_history[0], id: "one-more" });
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
});
