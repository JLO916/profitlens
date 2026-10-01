import Decimal from "decimal.js";
import { calculateScenario, type ScenarioBaseline, type ScenarioInputs, type ScenarioReason, type ScenarioResult } from "./scenarios";

export const SENSITIVITY_VERSION = "scenario-sensitivity-v1" as const;
export const SENSITIVITY_FORMULA = "H = G − D；L = [(G − D − G × δ) × (N − P − Q) − H × (C + F × (1 + f) + O)] / H；B = A × (1 + a) + K；條件貢獻 = L × (1 + v) − B；目標 T 的等式門檻 v = ((T + B) / L − 1) × 100%。δ 為輸入百分點 / 100；f、a、v 為相對百分比 / 100。";
export interface ContributionThreshold {
  id: "zero_contribution" | "maintain_baseline";
  target: string;
  status: "within_range" | "outside_range" | "constant_equal" | "constant_above" | "constant_below";
  /** Display approximation only. Range and direction are classified before rounding. */
  threshold_pct: string | null;
  /** Exact rational percentage with positive denominator; never inferred from the displayed money. */
  threshold_fraction: { numerator: string; denominator: string } | null;
  meets_target_when: "at_or_above" | "at_or_below" | "all" | "none";
  range_outcome: "crosses_target" | "all_at_or_above" | "all_below";
}
export interface ScenarioSensitivityAnalysis {
  version: typeof SENSITIVITY_VERSION;
  status: "valid" | "invalid" | "ineligible" | "stale";
  reasons: ScenarioReason[];
  formula: string;
  coefficients: null | {
    volume_coefficient: string;
    volume_coefficient_fraction: { numerator: string; denominator: string };
    fixed_outflow: string;
    slope: "positive" | "zero" | "negative";
  };
  targets: ContributionThreshold[];
  sensitivity: {
    status: "valid" | "invalid" | "unfilled" | "unavailable";
    reasons: ScenarioReason[];
    rows: { volume_change_pct: string; result: Extract<ScenarioResult, { status: "valid" }> }[];
  };
}

/** Derive thresholds from the existing closed model, without modifying actual data or its definition. */
export function analyzeScenarioSensitivity(
  baseline: ScenarioBaseline,
  inputs: ScenarioInputs,
  volumeValues: readonly string[],
  options: { stale?: boolean } = {},
): ScenarioSensitivityAnalysis {
  const unavailable = (status: ScenarioSensitivityAnalysis["status"], reasons: ScenarioReason[]): ScenarioSensitivityAnalysis => ({
    version: SENSITIVITY_VERSION, status, reasons, formula: SENSITIVITY_FORMULA,
    coefficients: null, targets: [], sensitivity: { status: "unavailable", reasons: [], rows: [] },
  });
  if (options.stale) return unavailable("stale", [{ code: "STALE_SCENARIO", message: "快照已過期；請重新確認範圍與假設後再分析。" }]);
  // A blank volume or unaccepted parent scenario must not be made valid by this tool.
  const checked = calculateScenario(baseline, inputs);
  if (checked.status !== "valid") return unavailable(checked.status, checked.reasons);
  const digits = [...Object.values(baseline.amounts), ...Object.values(inputs)].reduce<number>((count, value) => count + (typeof value === "string" ? value.length : 0), 0);
  const Exact = Decimal.clone({ precision: Math.max(100, digits * 3 + 100), rounding: Decimal.ROUND_HALF_UP });
  const number = (field: keyof ScenarioBaseline["amounts"]) => new Exact(baseline.amounts[field]!);
  const G = number("gross_sales"), D = number("discounts"), N = number("net_revenue");
  const H = G.minus(D);
  const adjustedAfterDiscount = H.minus(G.times(inputs.discount_change_pp).div(100));
  const scaledCosts = number("cogs_net").plus(number("fulfillment_costs").times(new Exact(inputs.fulfillment_change_pct).div(100).plus(1))).plus(number("other_variable_costs"));
  // Keep an exact numerator until the last display boundary. All finite-decimal
  // products have enough private precision; no rounded scenario output is reused.
  const slopeNumerator = adjustedAfterDiscount.times(N.minus(number("platform_fees")).minus(number("payment_fees"))).minus(H.times(scaledCosts));
  const B = number("ad_spend").times(new Exact(inputs.ad_change_pct).div(100).plus(1)).plus(inputs.one_time_cost);
  const slope = slopeNumerator.isZero() ? "zero" : slopeNumerator.isPositive() ? "positive" : "negative";
  const money = (value: Decimal) => value.toFixed(2) === "-0.00" ? "0.00" : value.toFixed(2);
  const threshold = (id: ContributionThreshold["id"], target: string): ContributionThreshold => {
    const T = new Exact(target);
    if (slope === "zero") {
      const difference = B.negated().minus(T);
      return {
        id, target, status: difference.isZero() ? "constant_equal" : difference.isPositive() ? "constant_above" : "constant_below",
        threshold_pct: null, threshold_fraction: null,
        meets_target_when: difference.gte(0) ? "all" : "none",
        range_outcome: difference.gte(0) ? "all_at_or_above" : "all_below",
      };
    }
    let numerator = T.plus(B).times(H).minus(slopeNumerator).times(100);
    let denominator = slopeNumerator;
    if (denominator.isNegative()) { numerator = numerator.negated(); denominator = denominator.negated(); }
    const within = numerator.gte(denominator.times(-90)) && numerator.lte(denominator.times(100));
    // Compare exact contribution at the inclusive endpoints; no rounded-root
    // comparison can misclassify a root arbitrarily close to a guardrail.
    const differenceAtMin = slopeNumerator.times("0.1").minus(T.plus(B).times(H));
    const differenceAtMax = slopeNumerator.times(2).minus(T.plus(B).times(H));
    const allMeet = differenceAtMin.gte(0) && differenceAtMax.gte(0);
    const rendered = numerator.div(denominator).toFixed(12);
    return {
      id, target, status: within ? "within_range" : "outside_range",
      threshold_pct: rendered === "-0.000000000000" ? "0.000000000000" : rendered,
      threshold_fraction: { numerator: numerator.toFixed(), denominator: denominator.toFixed() },
      meets_target_when: slope === "positive" ? "at_or_above" : "at_or_below",
      range_outcome: within ? "crosses_target" : allMeet ? "all_at_or_above" : "all_below",
    };
  };

  const sensitivity: ScenarioSensitivityAnalysis["sensitivity"] = { status: "unfilled", reasons: [], rows: [] };
  if (volumeValues.length !== 3) {
    sensitivity.status = "invalid";
    sensitivity.reasons.push({ code: "THREE_VOLUME_VALUES_REQUIRED", message: "請明確提供三個售出量變化假設；不補值、不捨棄多餘假設。" });
  } else if (volumeValues.some(value => typeof value !== "string" || value.trim() === "")) {
    sensitivity.reasons.push({ code: "SENSITIVITY_VOLUME_REQUIRED", message: "三個售出量假設皆須明填；0 也須由使用者輸入。" });
  } else {
    const results = volumeValues.map(value => calculateScenario(baseline, { ...inputs, volume_change_pct: value }));
    sensitivity.reasons = results.flatMap((result, index) => result.reasons.map(reason => ({ ...reason, message: `假設 ${index + 1}：${reason.message}` })));
    if (results.every(result => result.status === "valid")) {
      sensitivity.status = "valid";
      sensitivity.rows = results.map((result, index) => ({ volume_change_pct: volumeValues[index], result }));
    } else sensitivity.status = "invalid";
  }
  return {
    version: SENSITIVITY_VERSION, status: "valid", reasons: [], formula: SENSITIVITY_FORMULA,
    coefficients: {
      volume_coefficient: money(slopeNumerator.div(H)),
      volume_coefficient_fraction: { numerator: slopeNumerator.toFixed(), denominator: H.toFixed() },
      fixed_outflow: money(B), slope,
    },
    targets: [threshold("zero_contribution", "0.00"), threshold("maintain_baseline", baseline.amounts.contribution_after_marketing!)],
    sensitivity,
  };
}
