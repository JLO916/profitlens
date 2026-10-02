import { describe, expect, it } from "vitest";
import { actionDocuments, addActionDraft, commitActionRebind, confirmBoundAction, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, previewActionRebind } from "@/application/action-workspace";
import { createDecisionSession, emptyDecisionWorkspace, saveScenario } from "@/application/decision";
import { createSnapshot, hashInput } from "@/application/workspace";
import { exportWorkspaceBackup, restoreWorkspaceBackup } from "@/application/workspace-backup";
import { validateDataset } from "@/domain/validation";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { createReviewSession, selectReviewScenario, syncReviewPins, updateReviewSession } from "@/application/review-session";
import { fixture } from "./helpers/fixtures";

// Legacy inputs describe the old wire format independently of the new exporter.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
async function sign(envelope: Record<string, unknown>): Promise<string> {
  const { checksum: ignored, ...body } = envelope; void ignored;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(body))));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(bytes), item => item.toString(16).padStart(2, "0")).join("") });
}
const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
async function setup() {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  const session = createDecisionSession(dataset, snapshot, 1);
  const decision = { ...emptyDecisionWorkspace(), captured: session, source_input: input, scenarios: saveScenario(session, [], { id: "plan", name: "履約假設", inputs }) };
  const actions = addActionDraft(emptyActionWorkspace(), { input, dataset, snapshot, revision: 1 }, "task");
  return { input, snapshot, session, source: { input, filters: snapshot.report.scope, id: "golden", revision: 1, decision, action_workspace: actions } };
}
async function legacy(version: "profitlens-workspace-v1" | "profitlens-workspace-v2", stale = false) {
  const { input, snapshot, session, source } = await setup();
  const oldDecision = {
    source_input: input, filters: snapshot.report.scope, filenames: {}, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, revision: 1,
    stale, stale_reasons: stale ? ["WORKSPACE_REVISION_CHANGED"] : [],
    scenarios: [{ id: "plan", name: "履約假設", inputs, calculated: true }],
    actions: [{ id: "legacy-task", problem: "原稿", fact_ids: [], action: "", owner_role: "", validation_metric: "", deadline: "", stop_condition: "", required_data: "", origin: "manual", evidence_confirmed: false }],
  };
  const actionContext = { ...oldDecision, id: source.action_workspace.contexts[0].id, scenarios: [], actions: [] };
  const item = { card: oldDecision.actions[0], context_id: actionContext.id, pinned: true, scope: { kind: "all", channels: session.scope.channels } };
  return {
    schema_version: version, metric_version: "contribution-v1", scenario_version: "scenario-v1", saved_at: "2026-10-01T00:00:00.000Z",
    payload: { active: { input, filters: snapshot.report.scope, id: "golden", revision: 1, filenames: {}, mappings: {} }, decision: oldDecision, ...(version === "profitlens-workspace-v2" ? { action_workspace: { contexts: [actionContext], items: [item] } } : {}) },
  };
}

describe("V2-A portable workspace v3 and exact legacy boundaries", () => {
  it("deduplicates the active and retained sources by hash in a v3 backup", async () => {
    const { source, snapshot } = await setup();
    const body = JSON.parse(await exportWorkspaceBackup(source));
    expect(body.schema_version).toBe("profitlens-workspace-v3");
    expect(Object.keys(body.payload.sources)).toEqual([snapshot.dataset_hash]);
    expect(body.payload.active.source_hash).toBe(snapshot.dataset_hash);
    expect(body.payload.active).not.toHaveProperty("input");
    expect(body.payload.decision).not.toHaveProperty("source_input");
    expect(body.payload.action_workspace.contexts[0]).not.toHaveProperty("source_input");
    expect(body.payload.sources[snapshot.dataset_hash].files["sales_daily.csv"]).toBe(source.input.files["sales_daily.csv"]);
    const restored = await restoreWorkspaceBackup(JSON.stringify(body));
    expect(restored.decision.scenarios[0].result?.contribution).toBe("284.00");
    expect(restored.action_workspace.items[0]).toMatchObject({ execution_status: "not_started", progress_notes: "", binding_revision: 1 });
    const retained = restored.action_workspace.contexts[0].source_input.files["sales_daily.csv"];
    restored.input.files["sales_daily.csv"] = "edited current in-memory source";
    expect(restored.action_workspace.contexts[0].source_input.files["sales_daily.csv"]).toBe(retained);
    expect(restored.scenario_workspace.contexts[0].source_input.files["sales_daily.csv"]).toBe(retained);
  });
  it.each(["profitlens-workspace-v1", "profitlens-workspace-v2"] as const)("validates and migrates genuine %s using its original shape", async version => {
    const body = await legacy(version);
    const restored = await restoreWorkspaceBackup(await sign(body));
    expect(restored.decision.scenarios[0].result?.contribution).toBe("284.00");
    expect(restored.action_workspace.items[0].card.problem).toBe("原稿");
    expect(restored.action_workspace.items[0]).toMatchObject({ execution_status: "not_started", progress_notes: "", binding_revision: 1 });
  });
  it.each(["profitlens-workspace-v1", "profitlens-workspace-v2"] as const)("does not revive stale %s action evidence during migration", async version => {
    const restored = await restoreWorkspaceBackup(await sign(await legacy(version, true)));
    expect(restored.action_workspace.contexts[0].session.stale).toBe(true);
    expect(restored.action_workspace.items[0]).toMatchObject({ legacy_review_required: true, execution_status: "not_started" });
    expect(restored.decision.captured?.stale).toBe(true);
  });
  it("checks the original legacy checksum before migrating metadata", async () => {
    const body = JSON.parse(await sign(await legacy("profitlens-workspace-v2")));
    body.payload.active.id = "altered";
    await expect(restoreWorkspaceBackup(JSON.stringify(body))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
  });
  it("rejects fields that were not valid in a legacy envelope even after re-signing", async () => {
    const body = await legacy("profitlens-workspace-v2");
    const payload = body.payload as Record<string, unknown>; payload.review_session = {};
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("rejects a source reference outside the v3 source table", async () => {
    const body = JSON.parse(await exportWorkspaceBackup((await setup()).source));
    body.payload.active.source_hash = "0".repeat(64);
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("WORKSPACE_SOURCE_MISSING");
  });
  it("rejects changed source bytes even when the envelope checksum is recomputed", async () => {
    const { source, snapshot } = await setup();
    const body = JSON.parse(await exportWorkspaceBackup(source));
    expect(body.schema_version).toBe("profitlens-workspace-v3");
    body.payload.sources[snapshot.dataset_hash].files["sales_daily.csv"] += "\n";
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("WORKSPACE_BINDING_MISMATCH");
  });
  it("retains independent action execution and immutable evidence history across a rebind", async () => {
    const { source, snapshot } = await setup();
    const fact = snapshot.report.facts.find(row => row.metric === "contribution_after_marketing" && row.scope.kind === "channel" && row.period.start === "2026-08-02")!;
    let actions = confirmBoundAction(editBoundAction(source.action_workspace, "task", { fact_ids: [fact.id] }), "task");
    actions = editActionManagement(actions, "task", { execution_status: "completed", progress_notes: "已核對帳單；成效尚待驗證" });
    const nextInput = fixture();
    nextInput.files["ad_spend_daily.csv"] = String(nextInput.files["ad_spend_daily.csv"]).replace("2026-08-02,DTC,270.00", "2026-08-02,DTC,370.00");
    const dataset = validateDataset(nextInput).dataset!;
    const nextSnapshot = await createSnapshot(dataset, snapshot.report.scope, await hashInput(nextInput));
    const target = { input: nextInput, dataset, snapshot: nextSnapshot, revision: 2 };
    actions = await commitActionRebind(actions, "task", await previewActionRebind(actions, "task", target), target, true);
    const text = await exportWorkspaceBackup({ ...source, input: nextInput, revision: 2, action_workspace: actions });
    const portable = JSON.parse(text);
    expect(Object.keys(portable.payload.sources)).toHaveLength(2);
    const restored = await restoreWorkspaceBackup(text);
    const doc = actionDocuments(restored.action_workspace)[0];
    expect(doc).toMatchObject({ execution_status: "completed", progress_notes: "已核對帳單；成效尚待驗證", binding_revision: 3 });
    expect(doc.binding_history[0].fact_ids).toEqual([]);
    expect(doc.evidence[0].value).toBe("170.00");
    expect(doc.binding_history.at(-1)!.evidence[0].value).toBe("270.00");
    expect(doc.binding_history.at(-1)!.dataset_hash).toBe(snapshot.dataset_hash);
    portable.payload.action_workspace.items[0].binding_history[0].fact_ids = ["invented"];
    await expect(restoreWorkspaceBackup(await sign(portable))).rejects.toThrow("UNKNOWN_FACT_ID");
  });
  it("deduplicates separate channel scenario contexts and recalculates every stored plan revision", async () => {
    const { source } = await setup(); const dataset = validateDataset(source.input).dataset!;
    let workspace = emptyScenarioWorkspace("meeting-epoch");
    for (const [index, channel] of ["DTC", "MARKETPLACE"].entries()) {
      const snapshot = await createSnapshot(dataset, { channels: [channel] }, await hashInput(source.input));
      workspace = ensureScenarioContext(workspace, { input: source.input, dataset, snapshot, revision: index + 1 });
      const context = workspace.contexts[index];
      const decision = scenarioContextDecision(context);
      decision.scenarios = saveScenario(context.session, [], { id: "plan", name: `${channel}履約`, inputs });
      workspace = updateScenarioContext(workspace, context.id, decision);
    }
    const first = workspace.contexts[0], edited = scenarioContextDecision(first);
    edited.scenarios = saveScenario(first.session, edited.scenarios, { id: "plan", name: "DTC另有投入", inputs: { ...inputs, one_time_cost: "20" } });
    workspace = updateScenarioContext(workspace, first.id, edited);
    const text = await exportWorkspaceBackup({ ...source, scenario_workspace: workspace });
    const portable = JSON.parse(text);
    expect(Object.keys(portable.payload.sources)).toHaveLength(1);
    expect(portable.payload.scenario_workspace.contexts[0].versions).toHaveLength(2);
    expect(portable.payload.scenario_workspace.contexts[0].versions[0]).not.toHaveProperty("result");
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.scenario_workspace.contexts[0].plans[0].result?.contribution).toBe("264.00");
    expect(restored.scenario_workspace.contexts[0].versions.map(plan => plan.result.contribution)).toEqual(["284.00", "264.00"]);
    // Independent source anchor: MARKETPLACE baseline -15 + 10% of its 85 fulfillment = -6.50.
    expect(restored.scenario_workspace.contexts[1].plans[0].result?.contribution).toBe("-6.50");
    portable.payload.scenario_workspace.contexts[0].versions[0].result = { contribution: "999.00" };
    await expect(restoreWorkspaceBackup(await sign(portable))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("round trips a meeting's own scope, decision, pins and selected immutable plan revision", async () => {
    const { source } = await setup(), dataset = validateDataset(source.input).dataset!;
    const meetingSnapshot = await createSnapshot(dataset, {}, await hashInput(source.input));
    let workspace = ensureScenarioContext(emptyScenarioWorkspace("meeting-epoch"), { input: source.input, dataset, snapshot: await createSnapshot(dataset, { channels: ["DTC"] }, meetingSnapshot.dataset_hash), revision: 1 });
    let context = workspace.contexts[0], decision = scenarioContextDecision(context);
    decision.scenarios = saveScenario(context.session, [], { id: "plan", name: "履約假設", inputs });
    workspace = updateScenarioContext(workspace, context.id, decision); context = workspace.contexts[0];
    let review = createReviewSession({ input: source.input, dataset, snapshot: meetingSnapshot, revision: 1 }, "meeting-epoch", "meeting");
    review = selectReviewScenario(review, workspace, scenarioSelectionRef(context, "plan"));
    review = syncReviewPins(review, pinAction(source.action_workspace, "task", true));
    review = updateReviewSession(review, { name: "十月資料核對會議", importance_threshold: "1000", notes: "只採用原始條件；尚無效益結論" });
    review = updateReviewSession(review, { decision_state: "needs_data" });
    decision = scenarioContextDecision(context);
    decision.scenarios = saveScenario(context.session, decision.scenarios, { id: "plan", name: "另有投入", inputs: { ...inputs, one_time_cost: "20" } });
    workspace = updateScenarioContext(workspace, context.id, decision);
    const text = await exportWorkspaceBackup({ ...source, scenario_workspace: workspace, review_session: review });
    const portable = JSON.parse(text);
    expect(Object.keys(portable.payload.sources)).toHaveLength(1);
    expect(portable.payload.review_session).not.toHaveProperty("source_input");
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.review_session).toEqual(review);
    expect(restored.review_session?.selected_scenarios[0].plan_revision).toBe(1);
    expect(restored.scenario_workspace.contexts[0].plans[0].revision).toBe(2);
    expect(restored.review_session?.meeting_filters.channels).toEqual(["DTC", "MARKETPLACE"]);
    portable.payload.review_session.selected_scenarios[0].plan_revision = 99;
    await expect(restoreWorkspaceBackup(await sign(portable))).rejects.toThrow("SCENARIO_VERSION_MISSING");
  });
  it("rejects a meeting's forged scope hash and unsupported AI persistence", async () => {
    const { source, snapshot } = await setup(), dataset = validateDataset(source.input).dataset!;
    const review = createReviewSession({ input: source.input, dataset, snapshot, revision: 1 }, "meeting-epoch", "meeting");
    const body = JSON.parse(await exportWorkspaceBackup({ ...source, scenario_workspace: emptyScenarioWorkspace("meeting-epoch"), review_session: review }));
    body.payload.review_session.filter_hash = "0".repeat(64);
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("WORKSPACE_BINDING_MISMATCH");
    body.payload.review_session.filter_hash = snapshot.filter_hash;
    body.payload.review_session.ai_consent = true;
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("does not accept a current scenario label against a replacement active dataset", async () => {
    const { source } = await setup(); const body = JSON.parse(await exportWorkspaceBackup(source));
    const replacement = fixture("demo"), hash = await hashInput(replacement);
    body.payload.sources[hash] = replacement;
    body.payload.active.source_hash = hash; body.payload.active.filters = {};
    body.payload.action_workspace.active_dataset_hash = hash;
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("SCENARIO_CONTEXT_MISMATCH");
  });
  it("does not accept a current meeting label against a replacement active dataset", async () => {
    const { source, snapshot } = await setup(), dataset = validateDataset(source.input).dataset!;
    const review = createReviewSession({ input: source.input, dataset, snapshot, revision: 1 }, "meeting-epoch", "meeting");
    const body = JSON.parse(await exportWorkspaceBackup({ ...source, decision: emptyDecisionWorkspace(), scenario_workspace: emptyScenarioWorkspace("meeting-epoch"), review_session: review }));
    const replacement = fixture("demo"), hash = await hashInput(replacement);
    body.payload.sources[hash] = replacement;
    body.payload.active.source_hash = hash; body.payload.active.filters = {};
    body.payload.action_workspace.active_dataset_hash = hash;
    await expect(restoreWorkspaceBackup(await sign(body))).rejects.toThrow("REVIEW_ACTIVE_CONTEXT_MISMATCH");
  });
});
