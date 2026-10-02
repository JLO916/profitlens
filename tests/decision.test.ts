import { beforeAll, describe, expect, it } from "vitest";
import { blankScenarioInputs, createDecisionSession, isDecisionSessionStale, reconfirmDecision, refreshDecisionSession, removeAction, removeScenario, reorderActions, reorderScenarios, saveAction, saveScenario, type ActionCard, type ActionCardInput, type DecisionSession, type ScenarioPlan } from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { Dataset } from "@/domain/types";
import { labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

let dataset: Dataset;
let snapshot: WorkspaceSnapshot;
beforeAll(async () => {
  const input = fixture();
  dataset = validateDataset(input).dataset!;
  snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
});
const inputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
const session = () => createDecisionSession(dataset, snapshot, 1, { "sales_daily.csv": "商店訂單.csv" });
const plan = (id = "p1", name = "履約改善") => ({ id, name, inputs: { ...inputs } });
function action(s: DecisionSession, id = "a1"): ActionCardInput {
  return { id, problem: "履約成本待查", fact_ids: [s.facts.find(fact => fact.metric === "fulfillment_costs")!.id], action: "確認物流計價", owner_role: "營運", validation_metric: "每件履約成本", deadline: "2026-10-31", stop_condition: "準時率下降即停止", required_data: "物流帳單" };
}

describe("M4 immutable binding and S07 freshness", () => {
  it("captures serializable single-channel current baseline with source IDs and versions", () => {
    const s = session();
    expect(s.baseline.eligible).toBe(true);
    expect(s.baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(s.period).toEqual({ start: "2026-08-02", end: "2026-08-02" });
    expect(s.scope.channels).toEqual(["DTC"]);
    expect(s.schema_version).toBe("decision-v1");
    expect(s.scenario_version).toBe("scenario-v1");
    expect(s.metric_version).toBe("contribution-v1");
    expect(s).toMatchObject({ currency: "TWD", timezone: "Asia/Taipei", amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income" });
    expect(s.filenames["sales_daily.csv"]).toBe("商店訂單.csv");
    expect(s.facts.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it("detaches baseline, period, sources and facts from mutable incoming snapshot", () => {
    const s = session();
    const oldId = snapshot.report.facts[0].id;
    s.facts[0].id = "edited-copy";
    s.period.start = "2000-01-01";
    expect(() => { s.baseline.amounts.contribution_after_marketing = "999.00"; }).toThrow();
    expect(snapshot.report.facts[0].id).toBe(oldId);
    expect(snapshot.report.current.period.start).toBe("2026-08-02");
    expect(s.baseline.amounts.contribution_after_marketing).toBe("270.00");
  });
  it("does not allow a multiple-channel baseline", async () => {
    const both = await createSnapshot(dataset, {}, snapshot.dataset_hash);
    const s = createDecisionSession(dataset, both, 1);
    expect(s.baseline.eligible).toBe(false);
    expect(s.baseline.reasons.some(reason => reason.code === "SINGLE_CHANNEL_REQUIRED")).toBe(true);
  });
  it.each(["dataset_hash", "filter_hash", "data_as_of"] as const)("marks changed %s stale", key => {
    const s = session();
    expect(isDecisionSessionStale(s, snapshot, 1)).toBe(false);
    expect(isDecisionSessionStale(s, { ...snapshot, [key]: "changed" }, 1)).toBe(true);
  });
  it("detects period or channel changes even if caller passes the old hash", () => {
    const changed = structuredClone(snapshot);
    changed.report.scope.channels = ["MARKETPLACE"];
    expect(isDecisionSessionStale(session(), changed, 1)).toBe(true);
    changed.report.scope.channels = ["DTC"];
    changed.report.scope.current_period.start = "2026-08-03";
    expect(isDecisionSessionStale(session(), changed, 1)).toBe(true);
  });
  it("reload of identical bytes still invalidates and returning old data never revives latched state", () => {
    const s = session();
    const expired = refreshDecisionSession(s, snapshot, 2);
    expect(expired.stale).toBe(true);
    expect(s.stale).toBe(false);
    expect(refreshDecisionSession(expired, snapshot, 1).stale).toBe(true);
    expect(isDecisionSessionStale(s, snapshot, 3)).toBe(true);
  });
  it("explicit reconfirm captures new baseline and clears input assumptions and fact confirmations", () => {
    const s = session();
    const plans = saveScenario(s, [], plan());
    const actions = saveAction(s, [], action(s));
    const fresh = reconfirmDecision(s, plans, actions, dataset, snapshot, 2);
    expect(fresh.session.stale).toBe(false);
    expect(fresh.session.revision).toBe(2);
    expect(fresh.scenarios[0]).toMatchObject({ id: "p1", name: "履約改善", result: null, inputs: { volume_change_pct: "", assumptions_accepted: false } });
    expect(Object.values(fresh.scenarios[0].inputs).filter(value => typeof value === "string")).toEqual(["", "", "", "", ""]);
    expect(fresh.actions[0]).toMatchObject({ problem: "履約成本待查", fact_ids: [], evidence_confirmed: false, origin: "manual" });
    expect(plans[0].result?.status).toBe("valid");
  });
});

describe("manual scenarios and action state", () => {
  it("defaults all inputs blank and never silently assumes no volume effect", () => {
    expect(blankScenarioInputs()).toEqual({ volume_change_pct: "", discount_change_pp: "", fulfillment_change_pct: "", ad_change_pct: "", one_time_cost: "", assumptions_accepted: false });
  });
  it("binds fixed golden result to the exact saved input copy", () => {
    const p = plan();
    const plans = saveScenario(session(), [], p);
    p.inputs.one_time_cost = "20";
    expect(plans[0].inputs.one_time_cost).toBe("0");
    expect(plans[0].result).toMatchObject({ status: "valid", contribution: "284.00", delta: "14.00" });
    expect(plans[0].result!.inputs).toEqual(plans[0].inputs);
    const updated = saveScenario(session(), plans, p);
    expect(updated).toHaveLength(1);
    expect(updated[0].result).toMatchObject({ contribution: "264.00", delta: "-6.00" });
  });
  it("limits scenarios to three with explicit order and deletion", () => {
    const s = session();
    const plans = ["p1", "p2", "p3"].reduce((all, id) => saveScenario(s, all, plan(id)), [] as ScenarioPlan[]);
    expect(() => saveScenario(s, plans, plan("p4"))).toThrow("MAX_SCENARIOS");
    expect(reorderScenarios(plans, ["p3", "p1", "p2"]).map(p => p.id)).toEqual(["p3", "p1", "p2"]);
    expect(removeScenario(plans, "p2").map(p => p.id)).toEqual(["p1", "p3"]);
    expect(() => reorderScenarios(plans, ["p1", "p1", "p3"])).toThrow("INVALID_ORDER");
  });
  it("allows max three manually ordered actions using existing facts only", () => {
    const s = session();
    const actions = ["a1", "a2", "a3"].reduce((all, id) => saveAction(s, all, action(s, id)), [] as ActionCard[]);
    expect(actions[0]).toMatchObject({ origin: "manual", evidence_confirmed: true });
    expect(() => saveAction(s, actions, action(s, "a4"))).toThrow("MAX_ACTIONS");
    expect(reorderActions(actions, ["a3", "a2", "a1"]).map(a => a.id)).toEqual(["a3", "a2", "a1"]);
    expect(removeAction(actions, "a1")).toHaveLength(2);
    expect(() => saveAction(s, [], { ...action(s), fact_ids: ["made-up"] })).toThrow("UNKNOWN_FACT_ID");
    expect(() => saveAction(s, [], { ...action(s), fact_ids: [] })).toThrow("FACT_REQUIRED");
  });
  it("rejects edits and calculations on an expired session", () => {
    const s = refreshDecisionSession(session(), snapshot, 2);
    expect(() => saveScenario(s, [], plan())).toThrow("STALE_DECISION");
    expect(() => saveAction(s, [], action(s))).toThrow("STALE_DECISION");
  });
  it.each(["problem", "action", "owner_role", "validation_metric", "deadline", "stop_condition", "required_data"] as const)("confirmed action requires nonempty %s", field => {
    const s = session();
    expect(() => saveAction(s, [], { ...action(s), [field]: "  " })).toThrow("INVALID_ACTION_FIELD");
  });
  it("confirmed action requires genuine ISO date and bounded typed text", () => {
    const s = session();
    expect(() => saveAction(s, [], { ...action(s), deadline: "2026-02-30" })).toThrow("INVALID_ACTION_DEADLINE");
    expect(() => saveAction(s, [], { ...action(s), deadline: "10/31/2026" })).toThrow("INVALID_ACTION_DEADLINE");
    expect(() => saveAction(s, [], { ...action(s), problem: "x".repeat(2001) })).toThrow("INVALID_ACTION_FIELD");
    expect(() => saveAction(s, [], { ...action(s), owner_role: 123 as unknown as string })).toThrow("INVALID_ACTION_FIELD");
    expect(() => saveScenario(s, [], plan("p1", " "))).toThrow("INVALID_SCENARIO_NAME");
    expect(() => saveScenario(s, [], plan("p1", "x".repeat(101)))).toThrow("INVALID_SCENARIO_NAME");
  });
});

describe("M4 decision exports", () => {
  it("JSON includes complete captured metadata, model assumptions, inputs, formulas, rounding and facts", () => {
    const s = session();
    const content = JSON.parse(exportDecisionJson(s, saveScenario(s, [], plan()), saveAction(s, [], action(s))));
    expect(content.session).toMatchObject({ schema_version: "decision-v1", scenario_version: "scenario-v1", metric_version: "contribution-v1", dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, data_as_of: snapshot.data_as_of, stale: false });
    expect(content.session.baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(content.scenarios[0]).toMatchObject({ status: "valid", inputs, result: { contribution: "284.00", rounding_adjustment: "0.00" } });
    expect(content.fixed_assumptions.length).toBeGreaterThan(4);
    expect(content.formulas).toHaveProperty("rounding_adjustment");
    expect(content.rounding).toMatch(/HALF_UP/);
    expect(content.actions[0]).toMatchObject({ origin: "manual", evidence_confirmed: true });
    expect(content.actions[0].evidence[0].id).toBe(content.actions[0].fact_ids[0]);
    // R2：主層只留一句「注意」（口徑說明第 7 條：不是預測、方案不能相加）；其餘限制併入技術細節，JSON 仍完整列出。
    expect(content.limitations).toContain(labels.basis.items[6]);
    expect(content.limitations).toEqual(expect.arrayContaining([labels.ui.decisionExport.limitations.scenarioScope, labels.ui.decisionExport.limitations.adSpendNoVolume]));
  });
  it("keeps null draft results and unconfirmed manual text labeled", () => {
    const s = session();
    const draft: ScenarioPlan = { ...plan(), inputs: blankScenarioInputs(), result: null };
    const a: ActionCard = { ...action(s), fact_ids: [], origin: "manual", evidence_confirmed: false };
    const parsed = JSON.parse(exportDecisionJson(s, [draft], [a]));
    expect(parsed.scenarios[0]).toMatchObject({ status: "draft", result: null });
    expect(parsed.actions[0]).toMatchObject({ status: "draft", evidence: [] });
    expect(exportDecisionCsv(s, [draft], [a])).toContain("UNCOMPUTED_DRAFT");
  });
  it("stale export is allowed but prominently retains old captured data and stale markers", () => {
    const s = session();
    const plans = saveScenario(s, [], plan());
    const expired = refreshDecisionSession(s, { ...snapshot, dataset_hash: "new" }, 2);
    const parsed = JSON.parse(exportDecisionJson(expired, plans, []));
    expect(parsed.status).toBe("stale");
    expect(parsed.session.dataset_hash).toBe(snapshot.dataset_hash);
    expect(exportDecisionMarkdown(expired, plans, [])).toContain("過期");
    expect(exportDecisionCsv(expired, plans, [])).toContain('"stale"');
  });
  it("rejects dirty input/result mismatch and fabricated result values", () => {
    const s = session();
    const plans = saveScenario(s, [], plan());
    plans[0].inputs.volume_change_pct = "10";
    expect(() => exportDecisionJson(s, plans, [])).toThrow("INVALID_SCENARIO_RESULT");
    const tampered = saveScenario(s, [], plan());
    if (tampered[0].result?.status === "valid") tampered[0].result.contribution = "999999.00";
    expect(() => exportDecisionCsv(s, tampered, [])).toThrow("INVALID_SCENARIO_RESULT");
  });
  it("rejects unknown action references at export boundary, not just save", () => {
    const s = session();
    const actions = saveAction(s, [], action(s));
    actions[0].fact_ids = ["invented"];
    expect(() => exportDecisionMarkdown(s, [], actions)).toThrow("UNKNOWN_FACT_ID");
  });
  it("revalidates confirmed action content at export, while drafts may keep empty fields", () => {
    const s = session();
    const actions = saveAction(s, [], action(s));
    actions[0].deadline = "not-a-date";
    expect(() => exportDecisionJson(s, [], actions)).toThrow("INVALID_ACTION_DEADLINE");
    actions[0].evidence_confirmed = false;
    actions[0].deadline = "";
    expect(JSON.parse(exportDecisionJson(s, [], actions)).actions[0].status).toBe("draft");
  });
  it("escapes unsafe Markdown HTML, links, headings, and line breaks from manual/source text", () => {
    const s = session();
    s.dataset_id = "<script>alert(1)</script>";
    s.filenames["sales_daily.csv"] = "[open](javascript:alert(1))";
    const name = "[x](javascript:alert(1))\n# forged";
    const a = saveAction(s, [], { ...action(s), problem: "<img src=x onerror=alert(1)>", action: "[go](https://evil.invalid)\n<script>" });
    const md = exportDecisionMarkdown(s, saveScenario(s, [], plan("p1", name)), a);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img");
    expect(md).not.toContain("[go](https://evil.invalid)");
    expect(md).not.toContain("\n# forged");
    expect(md).toContain("&lt;script&gt;");
    // R2：人工來源不再用主層句子標示，改在待辦的「技術細節」收合區列出 origin：manual（§8 併入技術 details）。
    const actionSection = md.slice(md.indexOf(`## ${labels.sections.actionList}`), md.indexOf(`## ${labels.ui.decisionExport.sectionFacts}`));
    expect(actionSection).toContain(`<summary>${labels.sections.technicalDetails}</summary>`);
    expect(actionSection).toContain("- origin：manual");
  });
  it("CSV protects every untrusted metadata/manual text cell but retains real negative numeric values", () => {
    const s = session();
    s.dataset_id = "=HYPERLINK(1)";
    const plans = saveScenario(s, [], { ...plan("p1", "\t=EVIL(1)"), inputs: { ...inputs, one_time_cost: "20" } });
    const a = saveAction(s, [], { ...action(s), owner_role: "+cmd", required_data: "A,\"B\"\nC" });
    const csv = exportDecisionCsv(s, plans, a);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(1)"');
    expect(csv).toContain('"\'\t=EVIL(1)"');
    expect(csv).toContain('"\'+cmd"');
    expect(csv).toContain('"A,""B""\nC"');
    expect(csv).toContain('"-6.00"');
    expect(csv).not.toContain('"\'-6.00"');
    expect(csv).toContain("商店訂單.csv");
    expect(csv).toContain("rounding_adjustment");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("exports unavailable baselines as null with reason codes rather than zero", async () => {
    const both = await createSnapshot(dataset, {}, snapshot.dataset_hash);
    const s = createDecisionSession(dataset, both, 1);
    const plans = saveScenario(s, [], plan());
    const parsed = JSON.parse(exportDecisionJson(s, plans, []));
    expect(parsed.scenarios[0].result).toMatchObject({ status: "ineligible", contribution: null, delta: null });
    expect(exportDecisionCsv(s, plans, [])).toContain("SINGLE_CHANNEL_REQUIRED");
  });
  it("retains fixed MARKETPLACE S05 rounding adjustment without changing the conditional contribution", async () => {
    const market = await createSnapshot(dataset, { channels: ["MARKETPLACE"] }, snapshot.dataset_hash);
    const s = createDecisionSession(dataset, market, 1);
    const plans = saveScenario(s, [], { id: "market", name: "市場費用條件", inputs: { volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20", assumptions_accepted: true } });
    const parsed = JSON.parse(exportDecisionJson(s, plans, []));
    expect(parsed.scenarios[0].result).toMatchObject({ contribution: "19.70", delta: "34.70", rounding_adjustment: "-0.01", amounts: { gross_sales: "1560.00", discounts: "295.20", refunds: "105.40", net_revenue: "1159.40", platform_fees: "140.53", payment_fees: "25.76" } });
    expect(exportDecisionCsv(s, plans, [])).toContain('"-0.01"');
    expect(exportDecisionMarkdown(s, plans, [])).toContain("取分調整");
  });
  it("serializes genuinely missing baseline money as null and never substitutes zero", async () => {
    const partial = structuredClone(dataset);
    partial.sales.find(row => row.channel === "DTC" && row.date === "2026-08-02")!.cogs_net = null;
    const current = await createSnapshot(partial, { channels: ["DTC"] }, "partial-hash");
    const s = createDecisionSession(partial, current, 2);
    expect(s.baseline.amounts.cogs_net).toBeNull();
    const parsed = JSON.parse(exportDecisionJson(s, saveScenario(s, [], plan()), []));
    expect(parsed.session.baseline.amounts.cogs_net).toBeNull();
    expect(parsed.scenarios[0].result.contribution).toBeNull();
    const csv = exportDecisionCsv(s, [], []);
    expect(csv).toContain('"baseline_amount","","","","cogs_net",""');
    expect(csv).toContain("BASELINE_MISSING_AMOUNT");
  });
});
