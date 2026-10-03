import { describe, expect, it } from "vitest";
import { blankScenarioInputs, blankSensitivity, createDecisionSession, decisionSignature, emptyDecisionWorkspace, saveScenario, type SensitivityInputs } from "@/application/decision";
import { exportWorkspaceBackup, restoreWorkspaceBackup, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
const V4_KEYS = ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"] as const;
async function resign(value: Record<string, unknown>): Promise<string> {
  const { checksum: _checksum, ...body } = value;
  void _checksum;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(body)));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("") });
}
/** Rebuild the exact v3 wire shape (no v4 keys) and re-sign it like a genuine v3 file. */
async function asV3(text: string): Promise<string> {
  const body = JSON.parse(text);
  body.schema_version = "profitlens-workspace-v3";
  for (const key of V4_KEYS) delete body.payload[key];
  return resign(body);
}

/** p：已計算＋三組敏感度；q：草稿＋只填一格；r：沒有敏感度。legacy decision 的方案也帶敏感度。 */
async function setup(withSensitivity = true): Promise<WorkspaceBackupSource & { scenario_workspace: ScenarioWorkspace }> {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  const session = createDecisionSession(dataset, snapshot, 1);
  const sensitivity = (volumes: SensitivityInputs["volumes"]) => withSensitivity ? { sensitivity: { volumes } } : {};
  let workspace = ensureScenarioContext(emptyScenarioWorkspace("epoch"), { input, dataset, snapshot, revision: 1 });
  const context = workspace.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = [
    ...saveScenario(context.session, [], { id: "p", name: "履約", inputs, ...sensitivity(["-10", "0", "10"]) }),
    { id: "q", name: "草稿", inputs: blankScenarioInputs(), result: null, ...sensitivity(["5", "", ""]) },
    { id: "r", name: "沒有敏感度", inputs: blankScenarioInputs(), result: null },
  ];
  workspace = updateScenarioContext(workspace, context.id, draft);
  const decision = { ...emptyDecisionWorkspace(), captured: session, source_input: input, scenarios: saveScenario(session, [], { id: "plan", name: "履約假設", inputs, ...sensitivity(["1", "2", "3"]) }) };
  return { input, filters: snapshot.report.scope, id: "golden", revision: 1, decision, scenario_workspace: workspace };
}

describe("R5-4 sensitivity inputs travel with scenario plans in backup v4 (additive field)", () => {
  it("round trips the three inputs for scenario-workspace plans and legacy decision plans; versions never store them", async () => {
    const original = await setup();
    const text = await exportWorkspaceBackup(original);
    const wire = JSON.parse(text);
    expect(wire.schema_version).toBe("profitlens-workspace-v4");
    const [p, q, r] = wire.payload.scenario_workspace.contexts[0].plans;
    expect(p.sensitivity).toEqual({ volumes: ["-10", "0", "10"] });
    expect(q.sensitivity).toEqual({ volumes: ["5", "", ""] });
    expect(r).not.toHaveProperty("sensitivity");
    expect(wire.payload.scenario_workspace.contexts[0].versions).toHaveLength(1);
    expect(wire.payload.scenario_workspace.contexts[0].versions[0]).not.toHaveProperty("sensitivity");
    expect(wire.payload.decision.scenarios[0].sensitivity).toEqual({ volumes: ["1", "2", "3"] });

    const restored = await restoreWorkspaceBackup(text);
    const plans = restored.scenario_workspace.contexts[0].plans;
    expect(plans.map(plan => plan.sensitivity)).toEqual([{ volumes: ["-10", "0", "10"] }, { volumes: ["5", "", ""] }, undefined]);
    expect(plans.map(plan => plan.revision)).toEqual([1, 1, 1]);
    expect(plans[0].result?.contribution).toBe("284.00");
    expect(restored.scenario_workspace.contexts[0].versions[0]).not.toHaveProperty("sensitivity");
    expect(restored.decision.scenarios[0].sensitivity).toEqual({ volumes: ["1", "2", "3"] });
    // 讀回後再存一次，內容不變（除了存檔時間與校驗碼）。
    const again = JSON.parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope }));
    expect(again.payload.scenario_workspace).toEqual(wire.payload.scenario_workspace);
    expect(again.payload.decision.scenarios).toEqual(wire.payload.decision.scenarios);
  });
  it("keeps a blank triple as entered (it is still the user's draft state)", async () => {
    const original = await setup();
    const context = original.scenario_workspace.contexts[0], draft = scenarioContextDecision(context);
    draft.scenarios[2] = { ...draft.scenarios[2], sensitivity: blankSensitivity() };
    const workspace = updateScenarioContext(original.scenario_workspace, context.id, draft);
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup({ ...original, scenario_workspace: workspace }));
    expect(restored.scenario_workspace.contexts[0].plans[2].sensitivity).toEqual({ volumes: ["", "", ""] });
  });
  it("old v4 and v3 backups without the field read back as undefined", async () => {
    const text = await exportWorkspaceBackup(await setup(false));
    expect(text).not.toContain("sensitivity");
    for (const backup of [text, await asV3(text)]) {
      const restored = await restoreWorkspaceBackup(backup);
      expect(restored.scenario_workspace.contexts[0].plans.map(plan => plan.sensitivity)).toEqual([undefined, undefined, undefined]);
      expect(restored.scenario_workspace.contexts[0].plans.every(plan => !("sensitivity" in plan))).toBe(true);
      expect(restored.decision.scenarios[0].sensitivity).toBeUndefined();
      expect(restored.scenario_workspace.contexts[0].plans[0].result?.contribution).toBe("284.00");
    }
  });
  it.each([
    ["two strings", { volumes: ["1", "2"] }],
    ["four strings", { volumes: ["1", "2", "3", "4"] }],
    ["numbers", { volumes: [1, 2, 3] }],
    ["null entry", { volumes: ["1", null, "3"] }],
    ["over 100 characters", { volumes: ["1".repeat(101), "", ""] }],
    ["extra key", { volumes: ["1", "2", "3"], analysis: {} }],
    ["bare array", ["1", "2", "3"]],
    ["string", "1,2,3"],
    ["null", null],
  ])("rejects a malformed sensitivity (%s) as INVALID_WORKSPACE_FORMAT", async (_label, value) => {
    const wire = JSON.parse(await exportWorkspaceBackup(await setup()));
    wire.payload.scenario_workspace.contexts[0].plans[0].sensitivity = value;
    await expect(restoreWorkspaceBackup(await resign(wire))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const legacy = JSON.parse(await exportWorkspaceBackup(await setup()));
    legacy.payload.decision.scenarios[0].sensitivity = value;
    await expect(restoreWorkspaceBackup(await resign(legacy))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("rejects sensitivity smuggled into an immutable calculated version", async () => {
    const wire = JSON.parse(await exportWorkspaceBackup(await setup()));
    wire.payload.scenario_workspace.contexts[0].versions[0].sensitivity = { volumes: ["1", "2", "3"] };
    await expect(restoreWorkspaceBackup(await resign(wire))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
  it("refuses to write a malformed in-memory sensitivity", async () => {
    const original = await setup();
    const broken = structuredClone(original.scenario_workspace);
    (broken.contexts[0].plans[0] as unknown as { sensitivity: unknown }).sensitivity = { volumes: ["1", "2"] };
    await expect(exportWorkspaceBackup({ ...original, scenario_workspace: broken })).rejects.toThrow("INVALID_SENSITIVITY_INPUT");
    const legacy = structuredClone(original.decision);
    (legacy.scenarios[0] as unknown as { sensitivity: unknown }).sensitivity = { volumes: [1, 2, 3] };
    await expect(exportWorkspaceBackup({ ...original, decision: legacy })).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  });
});
