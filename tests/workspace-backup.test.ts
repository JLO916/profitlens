import { describe, expect, it } from "vitest";
import { blankScenarioInputs, createDecisionSession, decisionSignature, emptyDecisionWorkspace, saveAction, saveScenario } from "@/application/decision";
import { exportWorkspaceBackup, MAX_WORKSPACE_BYTES, restoreWorkspaceBackup, type WorkspaceBackupSource } from "@/application/workspace-backup";
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
    body.payload.active.input.files["ad_spend_daily.csv"] += "2026-08-01,DTC,1.00,TWD\n";
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
