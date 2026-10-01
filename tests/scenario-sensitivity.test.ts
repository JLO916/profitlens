import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { calculateMetrics } from "@/domain/metrics";
import { buildScenarioBaseline, type ScenarioInputs } from "@/domain/scenarios";
import { analyzeScenarioSensitivity } from "@/domain/scenario-sensitivity";
import { AMOUNT_FIELDS, type AmountField, type Summary, type Totals } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
function golden() { return buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels.DTC, true); }
function baseline(values: Partial<Record<AmountField, string | null>>) {
  const totals = Object.fromEntries(AMOUNT_FIELDS.map(field => {
    const value = field in values ? values[field] : field === "gross_sales" ? "100.00" : "0.00";
    return [field, { cents: value == null ? null : BigInt(value.replace(".", "")), reason_codes: value == null ? ["MISSING_COST"] : [] }];
  })) as Totals;
  const summary: Summary = { totals, metrics: calculateMetrics(totals), sources: [] };
  return buildScenarioBaseline(summary, true);
}
const analyze = (inputs: Partial<ScenarioInputs> = {}, values: string[] = ["-10", "0", "10"]) => analyzeScenarioSensitivity(golden(), { ...zero, ...inputs }, values);

describe("PL-08 exact conditional thresholds and explicit sensitivity", () => {
  it("has separate zero-contribution and original-baseline goals with independent literal anchors", () => {
    // Golden DTC after f=-10%: L=1480-740-44-126-16=554; B=270.
    // Solve 554*(1+v)-270=T. These constants are hand-derived, not computed by production.
    const result = analyze({ fulfillment_change_pct: "-10" });
    expect(result.status).toBe("valid");
    expect(result.coefficients).toMatchObject({ volume_coefficient: "554.00", fixed_outflow: "270.00", slope: "positive" });
    expect(result.targets).toMatchObject([
      { id: "zero_contribution", target: "0.00", threshold_pct: "-51.263537906137", status: "within_range", meets_target_when: "at_or_above" },
      { id: "maintain_baseline", target: "270.00", threshold_pct: "-2.527075812274", status: "within_range", meets_target_when: "at_or_above" },
    ]);
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["228.60", "284.00", "339.40"]);
  });
  it("includes K=20 once in both thresholds and each independent sensitivity result", () => {
    const result = analyze({ fulfillment_change_pct: "-10", one_time_cost: "20" });
    expect(result.targets).toMatchObject([
      { target: "0.00", threshold_pct: "-47.653429602888" },
      { target: "270.00", threshold_pct: "1.083032490975" },
    ]);
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["208.60", "264.00", "319.40"]);
    expect(result.sensitivity.rows.map(row => row.result.delta)).toEqual(["-61.40", "-6.00", "49.40"]);
  });
  it.each([
    { k: "0", target: "maintain_baseline", volumes: ["-3", "-2.5", "0"], amounts: ["267.38", "270.15", "284.00"] },
    { k: "20", target: "maintain_baseline", volumes: ["1", "1.1", "0"], amounts: ["269.54", "270.09", "264.00"] },
    { k: "0", target: "zero_contribution", volumes: ["-51.3", "-51.2", "0"], amounts: ["-0.20", "0.35", "284.00"] },
    { k: "20", target: "zero_contribution", volumes: ["-47.7", "-47.6", "0"], amounts: ["-0.26", "0.30", "264.00"] },
  ])("brackets $target with independently checked amounts and K=$k", ({ k, volumes, amounts }) => {
    expect(analyze({ fulfillment_change_pct: "-10", one_time_cost: k }, volumes).sensitivity.rows.map(row => row.result.contribution)).toEqual(amounts);
  });
  it("zero-change maintain-baseline threshold is exactly 0 and returns baseline at explicit zero", () => {
    const result = analyze();
    expect(result.targets[1]).toMatchObject({ threshold_pct: "0.000000000000", status: "within_range" });
    expect(result.sensitivity.rows[1].result).toMatchObject({ contribution: "270.00", delta: "0.00" });
  });
  it("retains discount percentage points and preserves original assumptions without mutation", () => {
    // Base G100,D10,N90,C30. delta +5pp => N85, L55; 0-volume CM=55.
    const base = baseline({ discounts: "10.00", cogs_net: "30.00" });
    const input = { ...zero, discount_change_pp: "5" };
    const original = structuredClone({ base, input });
    const result = analyzeScenarioSensitivity(base, input, ["0", "10", "-10"]);
    expect(result.coefficients?.volume_coefficient).toBe("55.00");
    expect(result.targets[1].threshold_pct).toBe("9.090909090909");
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["55.00", "60.50", "49.50"]);
    expect(result.sensitivity.rows[0].result.inputs.discount_change_pp).toBe("5");
    expect({ base, input }).toEqual(original);
  });
  it("negative slope reverses the threshold direction and does not claim more volume improves contribution", () => {
    const result = analyzeScenarioSensitivity(baseline({ cogs_net: "150.00", ad_spend: "10.00" }), zero, ["-10", "0", "10"]);
    expect(result.coefficients?.slope).toBe("negative");
    expect(result.targets[1]).toMatchObject({ target: "-60.00", threshold_pct: "0.000000000000", meets_target_when: "at_or_below" });
    expect(result.targets[0]).toMatchObject({ status: "outside_range", range_outcome: "all_below" });
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["-55.00", "-60.00", "-65.00"]);
  });
  it("zero slope distinguishes equality, always below and always above without division by zero", () => {
    const base = baseline({ cogs_net: "100.00", ad_spend: "10.00" });
    const equal = analyzeScenarioSensitivity(base, zero, ["-90", "0", "100"]);
    expect(equal.targets).toMatchObject([{ status: "constant_below", threshold_pct: null }, { status: "constant_equal", threshold_pct: null }]);
    const above = analyzeScenarioSensitivity(base, { ...zero, ad_change_pct: "-100" }, ["-90", "0", "100"]);
    expect(above.targets).toMatchObject([{ status: "constant_equal" }, { status: "constant_above" }]);
    expect(JSON.stringify(equal)).not.toMatch(/NaN|Infinity/);
  });
  it("labels a root below -90 as outside the supported range even when every permitted volume beats the goal", () => {
    const result = analyzeScenarioSensitivity(baseline({}), zero, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "-100.000000000000", status: "outside_range", range_outcome: "all_at_or_above" });
  });
  it("labels an unreachable root above +100 without extrapolating sensitivity beyond the input limit", () => {
    const result = analyzeScenarioSensitivity(baseline({ ad_spend: "500.00" }), zero, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "400.000000000000", status: "outside_range", range_outcome: "all_below" });
  });
  it.each([{ ad: "10.00", threshold: "-90.000000000000" }, { ad: "200.00", threshold: "100.000000000000" }])("accepts threshold exactly at inclusive range boundary $threshold", ({ ad, threshold }) => {
    expect(analyzeScenarioSensitivity(baseline({ ad_spend: ad }), zero, ["-90", "0", "100"]).targets[0]).toMatchObject({ threshold_pct: threshold, status: "within_range" });
  });
  it("uses unrounded exact algebra to classify a threshold infinitesimally above +100", () => {
    const result = analyzeScenarioSensitivity(baseline({ ad_spend: "100.00" }), { ...zero, ad_change_pct: "100.000000000000000000000000000001" }, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "100.000000000000", status: "outside_range", range_outcome: "all_below" });
  });
  it("retains huge precise amounts and a rational threshold without changing global Decimal precision", () => {
    const originalPrecision = Decimal.precision;
    const result = analyzeScenarioSensitivity(baseline({ gross_sales: "123456789012345678901234567890.12", ad_spend: "0.01" }), zero, ["0", "0", "0"]);
    expect(result.coefficients?.volume_coefficient).toBe("123456789012345678901234567890.12");
    expect(result.targets[1].threshold_fraction?.numerator).toBe("0");
    expect(result.sensitivity.rows[0].result.contribution).toBe("123456789012345678901234567890.11");
    expect(Decimal.precision).toBe(originalPrecision);
  });
  it.each([
    { volume_change_pct: "" }, { volume_change_pct: "-90.1" }, { assumptions_accepted: false }, { ad_change_pct: "-50", volume_change_pct: "" }, { discount_change_pp: "100" },
  ])("rejects an unvalidated parent scenario %j without thresholds", input => {
    const result = analyze(input);
    expect(result.status).not.toBe("valid");
    expect(result.targets).toEqual([]);
    expect(result.coefficients).toBeNull();
    expect(result.sensitivity.rows).toEqual([]);
  });
  it("missing baseline costs remain unavailable", () => {
    const result = analyzeScenarioSensitivity(baseline({ cogs_net: null }), zero, ["-10", "0", "10"]);
    expect(result.status).toBe("ineligible");
    expect(result.targets).toEqual([]);
  });
  it("stale context does not return usable new thresholds or sensitivity results", () => {
    const result = analyzeScenarioSensitivity(golden(), zero, ["-10", "0", "10"], { stale: true });
    expect(result).toMatchObject({ status: "stale", coefficients: null, targets: [], sensitivity: { status: "unavailable", rows: [] } });
  });
  it.each([["", "", ""], ["0", "", "10"], ["0", "10"], ["0", "10", "20", "30"]].map(values => ({ values })))("never fills missing sensitivity volume or silently drops extra cases $values", ({ values }) => {
    const result = analyze({}, values);
    expect(result.status).toBe("valid");
    expect(result.sensitivity.status).not.toBe("valid");
    expect(result.sensitivity.rows).toEqual([]);
  });
  it.each(["-90.00001", "100.00001", "1e1", "NaN", "10%", "<script>"])("invalid user sensitivity %s blocks the entire comparison", value => {
    expect(analyze({}, ["0", value, "10"]).sensitivity).toMatchObject({ status: "invalid", rows: [] });
  });
});
