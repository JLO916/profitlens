import { describe, expect, it } from "vitest";
import { blankScenarioInputs, createDecisionSession, decisionSignature, emptyDecisionWorkspace, saveAction, saveScenario } from "@/application/decision";
import { exportWorkspaceBackup, MAX_RAW_VALUE_LINES, MAX_WORKSPACE_BYTES, restoreWorkspaceBackup, WORKSPACE_VERSION, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { addActionDraft, emptyActionWorkspace, pinAction } from "@/application/action-workspace";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { createReviewSession, selectReviewScenario, syncReviewPins, updateReviewSession } from "@/application/review-session";
import type { TargetSet } from "@/application/targets";
import type { EventSet } from "@/application/events";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

async function source(): Promise<WorkspaceBackupSource> {
  const input = fixture();
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  const session = createDecisionSession(dataset, snapshot, 4, { "sales_daily.csv": "銷售來源.csv" });
  const base = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  const scenarios = saveScenario(session, saveScenario(session, [], { id: "plan-a", name: "履約", inputs: base }), { id: "plan-b", name: "履約含投入", inputs: { ...base, one_time_cost: "20" } });
  const actions = saveAction(session, [], { id: "action-a", problem: "履約成本待查", fact_ids: [session.facts.find(fact => fact.metric === "fulfillment_costs")!.id], action: "核對物流帳單", owner_role: "營運", validation_metric: "每件履約成本", deadline: "2026-10-31", stop_condition: "準時率下降", required_data: "物流帳單" });
  return { input, id: "golden", filters: snapshot.report.scope, revision: 4, filenames: session.filenames, mappings: { "sales_daily.csv": { date: "交易日", gross_sales: "未稅牌價" } }, decision: { captured: session, scenarios, actions, source_input: input } };
}
async function resign(value: Record<string, unknown>): Promise<string> {
  const { checksum: _checksum, ...body } = value;
  void _checksum;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(body)));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("") });
}

describe("PL-01 complete workspace backup and transactional restoration", () => {
  it("round trips two golden scenarios and a confirmed action, original mappings, source lines and versions", async () => {
    const original = await source();
    const text = await exportWorkspaceBackup(original);
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.snapshot.report.current.metrics.contribution_after_marketing.value).toBe("270.00");
    expect(restored.decision.scenarios.map(plan => plan.result?.contribution)).toEqual(["284.00", "264.00"]);
    expect(restored.decision.actions).toEqual(original.decision.actions);
    expect(restored.decision.captured).toEqual(original.decision.captured);
    expect(restored.filenames).toEqual(original.filenames);
    expect(restored.mappings).toEqual(original.mappings);
    expect(restored.snapshot.dataset_hash).toBe(await hashInput(original.input));
  });
  it("serializes inputs and calculation intent; never stores derived totals, facts, AI responses or consent", async () => {
    const original = await source();
    const text = await exportWorkspaceBackup({ ...original, ai_response: "secret", api_key: "secret", consent: true } as WorkspaceBackupSource);
    const parsed = JSON.parse(text);
    expect(text).not.toContain("secret");
    expect(parsed.payload).not.toHaveProperty("ai_response");
    expect(parsed.payload.decision.scenarios[0]).not.toHaveProperty("result");
    expect(parsed.payload.decision).not.toHaveProperty("facts");
    expect(parsed.payload.decision).not.toHaveProperty("baseline");
    expect(parsed.payload.decision.scenarios[0].calculated).toBe(true);
  });
  it("keeps unfinished fields uncomputed and does not confirm draft evidence", async () => {
    const original = await source();
    original.decision.scenarios[0] = { ...original.decision.scenarios[0], inputs: blankScenarioInputs(), result: null };
    original.decision.actions[0] = { ...original.decision.actions[0], deadline: "", fact_ids: [], evidence_confirmed: false };
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup(original));
    expect(restored.decision.scenarios[0].result).toBeNull();
    expect(restored.decision.scenarios[0].inputs.volume_change_pct).toBe("");
    expect(restored.decision.actions[0].evidence_confirmed).toBe(false);
  });
  it("recomputes a stale historical decision from its own original data and never binds it to the active replacement", async () => {
    const original = await source();
    original.input = fixture("demo"); original.filters = {}; original.id = "demo"; original.revision = 5;
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup(original));
    expect(restored.decision.captured?.stale).toBe(true);
    expect(restored.decision.captured?.baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(restored.decision.scenarios[0].result?.contribution).toBe("284.00");
    expect(restored.snapshot.dataset_hash).not.toBe(restored.decision.captured?.dataset_hash);
  });
  it("handles empty decision state and partial costs as unknown", async () => {
    const original = await source();
    original.input = fixture("errors/missing_cogs"); original.filters = {}; original.decision = emptyDecisionWorkspace();
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup(original));
    expect(restored.classification).toBe("partial");
    expect(restored.snapshot.report.current.metrics.gross_profit.value).toBeNull();
    expect(restored.decision).toEqual(emptyDecisionWorkspace());
  });
  it("rejects checksum changes without mutating the source state", async () => {
    const original = await source(); const before = structuredClone(original);
    const body = JSON.parse(await exportWorkspaceBackup(original)); body.payload.active.id = "tampered";
    await expect(restoreWorkspaceBackup(JSON.stringify(body))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
    expect(original).toEqual(before);
  });
  it.each(["schema_version", "metric_version", "scenario_version"])("rejects incompatible %s even with a matching checksum", async field => {
    const body = JSON.parse(await exportWorkspaceBackup(await source())); body[field] = "unsupported-v0";
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("WORKSPACE_VERSION_UNSUPPORTED");
  });
  it("rejects invented fact evidence even if the checksum is recomputed", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source())); body.payload.decision.actions[0].fact_ids = ["invented"];
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("UNKNOWN_FACT_ID");
  });
  it("rejects fabricated results, secrets and unsupported manifest/CSV data even with a matching checksum", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source()));
    body.payload.decision.scenarios[0].result = { contribution: "999999" };
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    delete body.payload.decision.scenarios[0].result;
    const oldHash = body.payload.active.source_hash;
    const invalidInput = body.payload.sources[oldHash];
    invalidInput.files["ad_spend_daily.csv"] += "2026-08-01,DTC,1.00,TWD\n";
    const changedHash = await hashInput(invalidInput);
    delete body.payload.sources[oldHash]; body.payload.sources[changedHash] = invalidInput;
    body.payload.active.source_hash = changedHash;
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("WORKSPACE_DATA_INVALID");
  });
  it("rejects stale metadata hashes inconsistent with the revalidated source", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source())); body.payload.decision.dataset_hash = "0".repeat(64);
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("WORKSPACE_BINDING_MISMATCH");
  });
  it("rejects invented mapping fields and duplicate source mappings even with a rewritten checksum", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source()));
    body.payload.active.mappings["sales_daily.csv"].customer_email = "Email";
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    delete body.payload.active.mappings["sales_daily.csv"].customer_email;
    body.payload.active.mappings["sales_daily.csv"].date = "未稅牌價";
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("rejects prototype keys and injected top-level AI state rather than restoring them", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source()));
    body.payload.active.mappings["sales_daily.csv"] = JSON.parse('{"__proto__":"forged"}');
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    body.payload.active.mappings = {};
    body.payload.ai_consent = true;
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("a rewritten calculated flag never bypasses input validation or manufactures a financial result", async () => {
    const body = JSON.parse(await exportWorkspaceBackup(await source()));
    body.payload.decision.scenarios[0].inputs.volume_change_pct = "";
    body.payload.decision.scenarios[0].calculated = true;
    const restored = await restoreWorkspaceBackup(await resign(body));
    expect(restored.decision.scenarios[0].result).toMatchObject({ status: "invalid", contribution: null, delta: null });
    body.payload.decision.scenarios[0].calculated = "true";
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("allows hostile-looking manual text only as inert strings without execution", async () => {
    const original = await source();
    original.decision.scenarios[0].name = '<img src=x onerror="alert(1)">';
    original.decision.actions[0].problem = "=HYPERLINK(\"https://example.invalid\")";
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup(original));
    expect(restored.decision.scenarios[0].name).toBe(original.decision.scenarios[0].name);
    expect(restored.decision.actions[0].problem).toBe(original.decision.actions[0].problem);
  });
  it("rejects malformed and oversized JSON before expensive revalidation", async () => {
    await expect(restoreWorkspaceBackup("{" )).rejects.toThrow("INVALID_WORKSPACE_JSON");
    await expect(restoreWorkspaceBackup(" ".repeat(MAX_WORKSPACE_BYTES + 1))).rejects.toThrow("WORKSPACE_TOO_LARGE");
  });
});

// R4-6 schema v4. Helpers rebuild the exact v3 wire shape (no v4 keys) and re-sign it like a genuine v3 file.
const V4_KEYS = ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"] as const;
async function asV3(text: string): Promise<string> {
  const body = JSON.parse(text);
  body.schema_version = "profitlens-workspace-v3";
  for (const key of V4_KEYS) delete body.payload[key];
  return resign(body);
}
function csvTexts(text: string): Record<string, unknown>[] {
  const sources = JSON.parse(text).payload.sources as Record<string, { files: Record<string, string> }>;
  return Object.entries(sources).map(([key, value]) => ({ key, ...value.files }));
}
function again(restored: RestoredWorkspace): WorkspaceBackupSource {
  return { ...restored, filters: restored.snapshot.report.scope };
}
const planInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
/** Full workspace: decision plans, a scenario context, an action card and a meeting with a selected plan. */
async function fullSource(): Promise<WorkspaceBackupSource> {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  const session = createDecisionSession(dataset, snapshot, 1);
  const decision = { ...emptyDecisionWorkspace(), captured: session, source_input: input, scenarios: saveScenario(session, [], { id: "plan", name: "履約假設", inputs: planInputs }) };
  const actions = pinAction(addActionDraft(emptyActionWorkspace(), { input, dataset, snapshot, revision: 1 }, "task"), "task", true);
  const meetingSnapshot = await createSnapshot(dataset, {}, snapshot.dataset_hash);
  let workspace = ensureScenarioContext(emptyScenarioWorkspace("meeting-epoch"), { input, dataset, snapshot, revision: 1 });
  const context = workspace.contexts[0], contextDecision = scenarioContextDecision(context);
  contextDecision.scenarios = saveScenario(context.session, [], { id: "plan", name: "履約假設", inputs: planInputs });
  workspace = updateScenarioContext(workspace, context.id, contextDecision);
  let review = createReviewSession({ input, dataset, snapshot: meetingSnapshot, revision: 1 }, "meeting-epoch", "meeting");
  review = selectReviewScenario(review, workspace, scenarioSelectionRef(workspace.contexts[0], "plan"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, { name: "十月例會", notes: "只採用原始條件" });
  return { input, filters: snapshot.report.scope, id: "golden", revision: 1, mappings: { "sales_daily.csv": { date: "交易日" } }, decision, action_workspace: actions, scenario_workspace: workspace, review_session: review };
}
// Small hand-made side data; amounts are decimal strings (1,050.00 incl. 5% → 1,000.00).
const sideData = () => ({
  preprocessing: {
    conversion: { basis: "inclusive" as const, rate: "0.05", fields: ["gross_sales", "ad_spend"], rows_converted: 2, totals: { gross_sales: { raw: "1050.00", converted: "1000.00" }, ad_spend: { raw: "105.00", converted: "100.00" } } },
    raw_values: { "sales_daily.csv": { 2: { gross_sales: "1050.00" } }, "ad_spend_daily.csv": { 3: { ad_spend: "105.00" } } },
  },
  targets: { filename: "targets.csv", rows: [{ period_start: "2026-08-03", period_end: "2026-08-04", channel: "ALL", metric: "net_revenue", target: "8000000.00", line: 2 }, { period_start: "2026-08-03", period_end: "2026-08-04", channel: "DTC", metric: "ad_spend", target: "300.50", line: 3 }] } satisfies TargetSet,
  events: { filename: "events.csv", rows: [{ start: "2026-07-15", end: "2026-07-20", label: "夏季特賣", line: 2 }] } satisfies EventSet,
  ui_prefs: { last_preset: "last_year", view: "board" as const },
});

describe("R4-6 workspace backup schema v4", () => {
  it("exports profitlens-workspace-v4 with null side data and an empty reserved meeting history", async () => {
    const parsed = JSON.parse(await exportWorkspaceBackup(await source()));
    expect(WORKSPACE_VERSION).toBe("profitlens-workspace-v4");
    expect(parsed.schema_version).toBe("profitlens-workspace-v4");
    expect(parsed.payload).toMatchObject({ preprocessing: null, targets: null, events: null, meeting_history: [], ui_prefs: {} });
  });
  it("v3 → v4 → v3-shape: CSV bytes, scenarios, actions and meeting stay identical; v4 fields default to empty", async () => {
    const original = await fullSource();
    const v3Text = await asV3(await exportWorkspaceBackup(original));
    expect(JSON.parse(v3Text).schema_version).toBe("profitlens-workspace-v3");
    const fromV3 = await restoreWorkspaceBackup(v3Text);
    expect(fromV3).toMatchObject({ preprocessing: null, targets: null, events: null, ui_prefs: {} });
    const v4Text = await exportWorkspaceBackup(again(fromV3));
    expect(JSON.parse(v4Text).schema_version).toBe("profitlens-workspace-v4");
    const fromV4 = await restoreWorkspaceBackup(v4Text);
    const v3AgainText = await asV3(await exportWorkspaceBackup(again(fromV4)));
    const fromV3Again = await restoreWorkspaceBackup(v3AgainText);
    // Byte-identical CSV text at every stage, both on the wire and after restore.
    expect(csvTexts(v4Text)).toEqual(csvTexts(v3Text));
    expect(csvTexts(v3AgainText)).toEqual(csvTexts(v3Text));
    for (const file of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const) {
      expect(fromV3.input.files[file]).toBe(original.input.files[file]);
      expect(fromV4.input.files[file]).toBe(original.input.files[file]);
      expect(fromV3Again.input.files[file]).toBe(original.input.files[file]);
    }
    for (const restored of [fromV4, fromV3Again]) {
      expect(restored.scenario_workspace).toEqual(fromV3.scenario_workspace);
      expect(restored.action_workspace).toEqual(fromV3.action_workspace);
      expect(restored.review_session).toEqual(fromV3.review_session);
      expect(restored.decision).toEqual(fromV3.decision);
    }
    expect(fromV3.review_session).toEqual(original.review_session);
    expect(fromV3.scenario_workspace.contexts[0].plans.map(plan => plan.inputs)).toEqual([planInputs]);
    expect(fromV3.action_workspace.items.map(item => item.card)).toEqual(original.action_workspace!.items.map(item => item.card));
    expect(fromV3Again).toMatchObject({ preprocessing: null, targets: null, events: null, ui_prefs: {} });
  });
  it("a v3 file carrying v4-only keys is rejected rather than half-read", async () => {
    const body = JSON.parse(await asV3(await exportWorkspaceBackup(await source())));
    body.payload.targets = null;
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("v4 round trip keeps preprocessing raw values, targets, events and UI preferences exactly", async () => {
    const side = sideData();
    const text = await exportWorkspaceBackup({ ...(await fullSource()), ...side });
    const parsed = JSON.parse(text);
    expect(parsed.payload.preprocessing.raw_values["sales_daily.csv"]["2"]).toEqual({ gross_sales: "1050.00" });
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.preprocessing).toEqual(side.preprocessing);
    expect(restored.targets).toEqual(side.targets);
    expect(restored.events).toEqual(side.events);
    expect(restored.ui_prefs).toEqual(side.ui_prefs);
    const twice = await restoreWorkspaceBackup(await exportWorkspaceBackup(again(restored)));
    expect(twice).toMatchObject({ preprocessing: side.preprocessing, targets: side.targets, events: side.events, ui_prefs: side.ui_prefs });
    expect(twice.snapshot.report.current.metrics.contribution_after_marketing.value).toBe(restored.snapshot.report.current.metrics.contribution_after_marketing.value);
  });
  it("drops undefined optional preferences so the file and its checksum agree", async () => {
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup({ ...(await source()), ui_prefs: { view: "list", last_preset: undefined } }));
    expect(restored.ui_prefs).toEqual({ view: "list" });
  });
  it.each([
    ["an unknown target metric", (body: { payload: Record<string, unknown> }) => { body.payload.targets = { filename: "targets.csv", rows: [{ period_start: "2026-08-03", period_end: "2026-08-04", channel: "ALL", metric: "orders", target: "1.00", line: 2 }] }; }],
    ["a float target amount", (body: { payload: Record<string, unknown> }) => { body.payload.targets = { filename: null, rows: [{ period_start: "2026-08-03", period_end: "2026-08-04", channel: "ALL", metric: "net_revenue", target: 1.5, line: 2 }] }; }],
    ["a target with three decimals", (body: { payload: Record<string, unknown> }) => { body.payload.targets = { filename: null, rows: [{ period_start: "2026-08-03", period_end: "2026-08-04", channel: "ALL", metric: "net_revenue", target: "1.005", line: 2 }] }; }],
    ["an event label over 60 characters", (body: { payload: Record<string, unknown> }) => { body.payload.events = { filename: null, rows: [{ start: "2026-07-15", end: "2026-07-20", label: "檔".repeat(61), line: 2 }] }; }],
    ["a tax rate above 20%", (body: { payload: Record<string, unknown> }) => { const side = sideData(); body.payload.preprocessing = { ...side.preprocessing, conversion: { ...side.preprocessing.conversion, rate: "0.25" } }; }],
    ["raw values for a field that was not converted", (body: { payload: Record<string, unknown> }) => { const side = sideData(); body.payload.preprocessing = { ...side.preprocessing, raw_values: { "sales_daily.csv": { 2: { refunds: "10.00" } } } }; }],
    ["raw values beyond the line bound", (body: { payload: Record<string, unknown> }) => {
      const side = sideData();
      const lines = Object.fromEntries(Array.from({ length: MAX_RAW_VALUE_LINES + 1 }, (_, index) => [index + 2, { ad_spend: "1.05" }]));
      body.payload.preprocessing = { ...side.preprocessing, raw_values: { "ad_spend_daily.csv": lines } };
    }],
    ["a stored meeting history before R6", (body: { payload: Record<string, unknown> }) => { body.payload.meeting_history = [{ id: "m1" }]; }],
    ["an unknown UI preference", (body: { payload: Record<string, unknown> }) => { body.payload.ui_prefs = { theme: "dark" }; }],
    ["a missing v4 key", (body: { payload: Record<string, unknown> }) => { delete body.payload.ui_prefs; }],
  ])("rejects %s with INVALID_WORKSPACE_FORMAT even after re-signing", async (_label, mutate) => {
    const body = JSON.parse(await exportWorkspaceBackup(await source()));
    mutate(body);
    await expect(restoreWorkspaceBackup(await resign(body))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("detects tampering of v4 side data through the unchanged checksum rule", async () => {
    const body = JSON.parse(await exportWorkspaceBackup({ ...(await source()), ...sideData() }));
    body.payload.targets.rows[0].target = "9000000.00";
    await expect(restoreWorkspaceBackup(JSON.stringify(body))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
  });
});

describe("R4 review follow-up: restore re-validates v4 side data against the dataset", () => {
  it("rejects a v4 file whose targets name a channel the dataset does not have, or whose raw value does not convert to the stored cell", async () => {
    const { exportWorkspaceBackup, restoreWorkspaceBackup } = await import("@/application/workspace-backup");
    const { decisionSignature } = await import("@/application/decision");
    const base = await source();
    const resign = async (value: Record<string, unknown>) => {
      const { checksum: _checksum, ...body } = value; void _checksum;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(body)));
      return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("") });
    };
    const good = JSON.parse(await exportWorkspaceBackup({ ...base, targets: { filename: "t.csv", rows: [{ period_start: "2026-08-02", period_end: "2026-08-02", channel: "ALL", metric: "net_revenue", target: "1.00", line: 2 }] } })) as { payload: { targets: { rows: { channel: string }[] }; preprocessing: unknown } };
    await expect(restoreWorkspaceBackup(JSON.stringify(good))).resolves.toBeTruthy();
    good.payload.targets.rows[0].channel = "NOT_A_CHANNEL";
    await expect(restoreWorkspaceBackup(await resign(good as unknown as Record<string, unknown>))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const raw = JSON.parse(await exportWorkspaceBackup({ ...base, preprocessing: { conversion: { basis: "inclusive", rate: "0.05", fields: ["gross_sales"], rows_converted: 1 }, raw_values: { "sales_daily.csv": { 2: { gross_sales: "1050.00" } } } } })) as Record<string, unknown>;
    // golden 第 2 行 gross_sales 是 1000.00：1050 ÷ 1.05 ＝ 1000.00 相符 → 接受；改成 999.00 → 拒絕。
    await expect(restoreWorkspaceBackup(JSON.stringify(raw))).resolves.toBeTruthy();
    (raw.payload as { preprocessing: { raw_values: { "sales_daily.csv": Record<string, Record<string, string>> } } }).preprocessing.raw_values["sales_daily.csv"]["2"].gross_sales = "999.00";
    await expect(restoreWorkspaceBackup(await resign(raw))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
});

describe("R5 review follow-up: sensitivity and status_updated_at exist only in the v4 envelope", () => {
  type Wire = { action_workspace: { items: Record<string, unknown>[] }; scenario_workspace: { contexts: { plans: Record<string, unknown>[] }[] }; decision: { scenarios: Record<string, unknown>[] } };
  it.each([
    ["status_updated_at on an action", (payload: Wire) => { payload.action_workspace.items[0].status_updated_at = "2026-10-03"; }],
    ["sensitivity on a scenario-workspace plan", (payload: Wire) => { payload.scenario_workspace.contexts[0].plans[0].sensitivity = { volumes: ["1", "2", "3"] }; }],
    ["sensitivity on a decision plan", (payload: Wire) => { payload.decision.scenarios[0].sensitivity = { volumes: ["1", "2", "3"] }; }],
  ])("a v3 envelope with %s is INVALID_WORKSPACE_FORMAT, while the same v4 file restores", async (_label, mutate) => {
    const v4 = JSON.parse(await exportWorkspaceBackup(await fullSource()));
    mutate(v4.payload);
    const v4Text = await resign(v4);
    await expect(restoreWorkspaceBackup(v4Text)).resolves.toBeTruthy();
    await expect(restoreWorkspaceBackup(await asV3(v4Text))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it.each([
    ["an unknown key on a v4 action", (payload: Wire) => { payload.action_workspace.items[0].status_updated = "2026-10-03"; }],
    ["an unknown key on a v4 scenario-workspace plan", (payload: Wire) => { payload.scenario_workspace.contexts[0].plans[0].sensitivities = { volumes: ["1", "2", "3"] }; }],
    ["an unknown key on a v4 decision plan", (payload: Wire) => { payload.decision.scenarios[0].analysis = {}; }],
    ["a non-ISO status day on a v4 action", (payload: Wire) => { payload.action_workspace.items[0].status_updated_at = "2026/10/03"; }],
  ])("the v4-only extensions stay strict: %s is INVALID_WORKSPACE_FORMAT", async (_label, mutate) => {
    const v4 = JSON.parse(await exportWorkspaceBackup(await fullSource()));
    mutate(v4.payload);
    await expect(restoreWorkspaceBackup(await resign(v4))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
});
