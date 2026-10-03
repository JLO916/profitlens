import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildScenarioBaseline, calculateScenario, SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, SCENARIO_VERSION } from "@/domain/scenarios";
import type { ScenarioInputs } from "@/domain/scenarios";
import { analyzeDataset } from "@/domain/analysis";
import { calculateMetrics } from "@/domain/metrics";
import { validateDataset } from "@/domain/validation";
import { AMOUNT_FIELDS } from "@/domain/types";
import type { AmountField, Summary, Totals } from "@/domain/types";
import { fixture } from "./helpers/fixtures";

const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
function golden(channel = "DTC"): Summary {
  const dataset = validateDataset(fixture()).dataset!;
  return analyzeDataset(dataset).current.channels[channel];
}
function summary(values: Partial<Record<AmountField, string | null>> = {}): Summary {
  const defaults: Record<AmountField, string> = { gross_sales: "1000.00", discounts: "100.00", refunds: "90.00", cogs_net: "400.00", platform_fees: "81.00", payment_fees: "16.20", fulfillment_costs: "50.00", other_variable_costs: "10.00", ad_spend: "100.00" };
  const totals = Object.fromEntries(AMOUNT_FIELDS.map(field => {
    const value = field in values ? values[field]! : defaults[field];
    return [field, { cents: value === null ? null : BigInt(value.replace(".", "")), reason_codes: value === null ? [`MISSING_${field.toUpperCase()}`] : [] }];
  })) as unknown as Totals;
  return { totals, metrics: calculateMetrics(totals), sources: [], units_sold: { value: null, reason_codes: [] } };
}
function result(input: Partial<ScenarioInputs> = {}, base = golden()) {
  return calculateScenario(buildScenarioBaseline(base, true), { ...zero, ...input });
}
function cents(value: string): bigint { return BigInt(value.replace(".", "")); }

describe("scenario-v1 baseline eligibility", () => {
  it("accepts a complete confirmed current channel and serializes exact amounts without bigint", () => {
    const input = golden();
    const baseline = buildScenarioBaseline(input, true);
    expect(baseline.eligible).toBe(true);
    expect(baseline.reasons).toEqual([]);
    expect(baseline.amounts.net_revenue).toBe("1480.00");
    expect(baseline.amounts.contribution_after_marketing).toBe("270.00");
    expect(baseline.version).toBe("scenario-v1");
    expect(() => JSON.stringify(baseline)).not.toThrow();
    expect(baseline.sources).toEqual(input.sources);
    expect(baseline.sources).not.toBe(input.sources);
  });
  it("does not confuse negative baseline contribution with an ineligible baseline", () => {
    const baseline = buildScenarioBaseline(golden("MARKETPLACE"), true);
    expect(baseline.eligible).toBe(true);
    expect(baseline.amounts.contribution_after_marketing).toBe("-15.00");
  });
  it("requires confirmed coverage", () => {
    const baseline = buildScenarioBaseline(golden(), false);
    expect(baseline.eligible).toBe(false);
    expect(baseline.reasons).toContainEqual(expect.objectContaining({ code: "BASELINE_COVERAGE_UNCONFIRMED" }));
  });
  it.each(AMOUNT_FIELDS)("disables missing %s without filling zero", field => {
    const baseline = buildScenarioBaseline(summary({ [field]: null }), true);
    expect(baseline.eligible).toBe(false);
    expect(baseline.amounts[field]).toBeNull();
    expect(calculateScenario(baseline, zero)).toMatchObject({ status: "ineligible", contribution: null, amounts: null });
  });
  it.each(["cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"] as const)("disables negative booked %s without changing actual metrics", field => {
    const actual = summary({ [field]: "-0.01" });
    const copy = structuredClone(actual);
    const baseline = buildScenarioBaseline(actual, true);
    expect(baseline.eligible).toBe(false);
    expect(baseline.reasons).toContainEqual(expect.objectContaining({ code: "BASELINE_NEGATIVE_COST", field }));
    expect(actual).toEqual(copy);
  });
  it.each([
    { gross_sales: "0.00", discounts: "0.00", refunds: "0.00" },
    { gross_sales: "-1.00", discounts: "0.00", refunds: "0.00" },
    { refunds: "900.00" }, { refunds: "901.00" }, { discounts: "1000.00" },
    { discounts: "1001.00" }, { discounts: "-0.01" }, { refunds: "-0.01" },
  ])("disables invalid G/N/d/r baseline %j", values => {
    expect(buildScenarioBaseline(summary(values), true).eligible).toBe(false);
  });
  it("pure-refund fixtures remain actual diagnostics, not a scenario baseline", () => {
    const dataset = validateDataset(fixture("refund_only")).dataset!;
    const actual = analyzeDataset(dataset).current.channels.DTC;
    expect(actual.metrics.contribution_after_marketing.value).toBe("-60.00");
    expect(result({}, actual).status).toBe("ineligible");
  });
});

describe("S01–S06 conditional scenario calculations", () => {
  it.each(["DTC", "MARKETPLACE"])("S01 zero change returns exact %s baseline", channel => {
    const actual = golden(channel);
    const computed = result({}, actual);
    expect(computed.status).toBe("valid");
    expect(computed.contribution).toBe(channel === "DTC" ? "270.00" : "-15.00");
    expect(computed.delta).toBe("0.00");
    expect(computed.rounding_adjustment).toBe("0.00");
    for (const field of AMOUNT_FIELDS) expect(computed.amounts![field]).toBe(actual.metrics[field].value);
  });
  it("S02 matches immutable golden fulfillment anchors with and without one-time investment", () => {
    const expected = JSON.parse(readFileSync(join(process.cwd(), "fixtures/golden/expected.json"), "utf8"));
    expect(result({ fulfillment_change_pct: "-10" }).contribution).toBe(expected.scenario_dtc_fulfillment_reduction.expected_contribution);
    expect(result({ fulfillment_change_pct: "-10", one_time_cost: "20" }).contribution).toBe(expected.scenario_dtc_fulfillment_reduction_with_investment.expected_contribution);
  });
  it("S03 requires explicit volume even when the user reduces advertising", () => {
    const computed = result({ volume_change_pct: "", ad_change_pct: "-50" });
    expect(computed.status).toBe("invalid");
    expect(computed.contribution).toBeNull();
    expect(computed.delta).toBeNull();
    expect(computed.reasons).toContainEqual(expect.objectContaining({ code: "INPUT_REQUIRED", field: "volume_change_pct" }));
  });
  it.each(["volume_change_pct", "discount_change_pp", "fulfillment_change_pct", "ad_change_pct", "one_time_cost"] as const)("requires explicit %s, not only volume", field => {
    expect(result({ [field]: " " })).toMatchObject({ status: "invalid", contribution: null });
  });
  it("requires explicit acceptance of every fixed model assumption", () => {
    const computed = result({ assumptions_accepted: false });
    expect(computed).toMatchObject({ status: "ineligible", contribution: null });
    expect(computed.reasons).toContainEqual(expect.objectContaining({ code: "ASSUMPTIONS_NOT_ACCEPTED" }));
  });
  it("S05 adds discount percentage points and recomputes all modeled costs independently", () => {
    // Hand calculation: G=1000,D=100,R=90 => d=.10,r=.10,N=810.
    // v=.10,δ=.05,f=-.20,a=.50,K=20 => N'=841.50 and CM'=75.52.
    const computed = result({ volume_change_pct: "10", discount_change_pp: "5", fulfillment_change_pct: "-20", ad_change_pct: "50", one_time_cost: "20" }, summary());
    expect(computed.status).toBe("valid");
    expect(computed.amounts).toMatchObject({ gross_sales: "1100.00", discounts: "165.00", refunds: "93.50", net_revenue: "841.50", cogs_net: "440.00", platform_fees: "84.15", payment_fees: "16.83", fulfillment_costs: "44.00", other_variable_costs: "11.00", ad_spend: "150.00", one_time_cost: "20.00" });
    expect(computed.contribution).toBe("75.52");
    expect(computed.delta).toBe("-77.28");
    expect(computed.rates!.discount_rate).toBe("0.150000000000");
  });
  it("rounds the independently checked marketplace anchor and exposes its -0.01 reconciliation", () => {
    // Independent rational check: contribution = 4433/225, baseline=-15.
    const computed = result({ volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20" }, golden("MARKETPLACE"));
    expect(computed.amounts).toMatchObject({ gross_sales: "1560.00", discounts: "295.20", refunds: "105.40", net_revenue: "1159.40", cogs_net: "702.00", platform_fees: "140.53", payment_fees: "25.76", fulfillment_costs: "91.80", other_variable_costs: "15.60", ad_spend: "144.00", one_time_cost: "20.00" });
    expect(computed.contribution).toBe("19.70");
    expect(computed.delta).toBe("34.70");
    expect(computed.rounding_adjustment).toBe("-0.01");
    const rows = computed.amounts!;
    const displayedSum = cents(rows.gross_sales) - AMOUNT_FIELDS.filter(field => field !== "gross_sales").reduce((sum, field) => sum + cents(rows[field]), 0n) - cents(rows.one_time_cost);
    expect(displayedSum + cents(computed.rounding_adjustment!)).toBe(cents(computed.contribution!));
  });
  it("S06 recomputes each scenario from baseline and never stacks earlier improvements", () => {
    const baseline = buildScenarioBaseline(golden(), true);
    const saved = structuredClone(baseline);
    expect(calculateScenario(baseline, { ...zero, fulfillment_change_pct: "-10" }).contribution).toBe("284.00");
    expect(calculateScenario(baseline, { ...zero, fulfillment_change_pct: "-10", one_time_cost: "20" }).contribution).toBe("264.00");
    expect(calculateScenario(baseline, zero).contribution).toBe("270.00");
    expect(baseline).toEqual(saved);
  });
  it("keeps zero advertising at zero and does not infer sales volume", () => {
    const dataset = validateDataset(fixture("zero_ad")).dataset!;
    const actual = analyzeDataset(dataset).current.channels.DTC;
    const computed = result({ ad_change_pct: "200" }, actual);
    expect(computed.status).toBe("valid");
    expect(computed.amounts!.ad_spend).toBe("0.00");
    expect(computed.amounts!.net_revenue).toBe("1480.00");
  });
  it("retains huge monetary digits and cents under a zero-change scenario without global Decimal changes", () => {
    const oldPrecision = Decimal.precision;
    const actual = summary({ gross_sales: "1234567890123456789012345678901234567890.12", discounts: "100.00", refunds: "90.00" });
    const computed = result({}, actual);
    expect(computed.contribution).toBe("1234567890123456789012345678901234567042.92");
    expect(computed.amounts!.gross_sales).toBe("1234567890123456789012345678901234567890.12");
    expect(computed.delta).toBe("0.00");
    expect(Decimal.precision).toBe(oldPrecision);
  });
  it("rounds a half-cent with a repeating refund ratio using HALF_UP", () => {
    const actual = summary({ gross_sales: "0.03", discounts: "0.00", refunds: "0.02", cogs_net: "0.00", platform_fees: "0.00", payment_fees: "0.00", fulfillment_costs: "0.00", other_variable_costs: "0.00", ad_spend: "0.00" });
    const computed = result({ volume_change_pct: "-50" }, actual);
    expect(computed.contribution).toBe("0.01");
    expect(computed.delta).toBe("-0.01");
  });
  it("accepts explicit plus signs on percentage and percentage-point assumptions", () => {
    const computed = result({ volume_change_pct: "+20", discount_change_pp: "+2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20" }, golden("MARKETPLACE"));
    expect(computed.status).toBe("valid");
    expect(computed.contribution).toBe("19.70");
    expect(computed.inputs.volume_change_pct).toBe("+20");
    expect(computed.inputs.discount_change_pp).toBe("+2");
    expect(result({ fulfillment_change_pct: "+10", ad_change_pct: "+20" }).status).toBe("valid");
  });
  it("does not mistake an arbitrarily small explicit volume change for zero", () => {
    const actual = summary({ gross_sales: "1000000000000000000000000000000.00", discounts: "0.00", refunds: "0.00", cogs_net: "0.00", platform_fees: "0.00", payment_fees: "0.00", fulfillment_costs: "0.00", other_variable_costs: "0.00", ad_spend: "0.00" });
    const computed = result({ volume_change_pct: "0.000000000000000000000001" }, actual);
    expect(computed.status).toBe("valid");
    expect(computed.contribution).toBe(`${10n ** 30n + 10000n}.00`);
    expect(computed.delta).toBe("10000.00");
  });
  it("accepts at least six decimal places for all four percentage inputs", () => {
    expect(result({ volume_change_pct: "0.000001", discount_change_pp: "0.000001", fulfillment_change_pct: "0.000001", ad_change_pct: "0.000001" }).status).toBe("valid");
  });
  it.each([
    { volume_change_pct: "-90" }, { volume_change_pct: "100" },
    { fulfillment_change_pct: "-100" }, { fulfillment_change_pct: "100" },
    { ad_change_pct: "-100" }, { ad_change_pct: "200" },
  ])("accepts inclusive product guardrail boundary %j", input => expect(result(input).status).toBe("valid"));
  it.each([
    { volume_change_pct: "-90.000001" }, { volume_change_pct: "100.000001" },
    { fulfillment_change_pct: "-100.000001" }, { fulfillment_change_pct: "100.000001" },
    { ad_change_pct: "-100.000001" }, { ad_change_pct: "200.000001" },
    { one_time_cost: "-0.01" }, { one_time_cost: "0.001" }, { one_time_cost: "NaN" },
    { volume_change_pct: "Infinity" }, { volume_change_pct: "1e2" }, { discount_change_pp: "10%" },
    { discount_change_pp: "-100" }, { discount_change_pp: "100" },
  ])("rejects invalid explicit input %j without usable financial outputs", input => {
    const computed = result(input);
    expect(computed.status).toBe("invalid");
    expect(computed.amounts).toBeNull();
    expect(computed.contribution).toBeNull();
    expect(JSON.stringify({ amounts: computed.amounts, contribution: computed.contribution, delta: computed.delta })).not.toContain("NaN");
  });
  it("permits zero discount rate but not exactly 100 percent", () => {
    expect(result({ discount_change_pp: "-10" }, summary()).status).toBe("valid");
    expect(result({ discount_change_pp: "90" }, summary()).status).toBe("invalid");
  });
  it("exports transparent assumptions and formulas without causal or forecast labels", () => {
    const computed = result();
    expect(SCENARIO_VERSION).toBe("scenario-v1");
    expect(computed.version).toBe("scenario-v1");
    expect(computed.assumptions).toEqual(SCENARIO_ASSUMPTIONS);
    expect(computed.formulas).toEqual(SCENARIO_FORMULAS);
    expect(computed.formulas.rounding_adjustment).toContain("G");
    expect(computed.assumptions.join(" ")).toContain("不是預測");
    expect(computed.assumptions.join(" ")).toContain("退款");
    expect(computed.assumptions.join(" ")).toContain("廣告");
    expect(() => JSON.stringify(computed)).not.toThrow();
  });
});
