import { describe, expect, it } from "vitest";
import expected from "../fixtures/golden/expected.json";
import { buildBridge } from "../src/domain/bridge";
import {
  calculateMetrics,
  compareMoney,
  percentagePointChange,
} from "../src/domain/metrics";
import type { Amount, Metric, Totals } from "../src/domain/types";

// Inputs are literal booked cents. Expected answers come from the immutable
// hand-specified fixture or independent literal arithmetic, never the engine.
const known = (cents: bigint): Amount => ({ cents, reason_codes: [] });
const missing = (code: string): Amount => ({ cents: null, reason_codes: [code] });
const metric = (value: string | null, reason_codes: string[] = []): Metric => ({
  value,
  reason_codes,
});
const previous: Totals = {
  gross_sales: known(250000n), discounts: known(20000n), refunds: known(5000n),
  cogs_net: known(105000n), platform_fees: known(9000n), payment_fees: known(6000n),
  fulfillment_costs: known(16000n), other_variable_costs: known(2000n), ad_spend: known(30000n),
};
const current: Totals = {
  gross_sales: known(310000n), discounts: known(45000n), refunds: known(18000n),
  cogs_net: known(132500n), platform_fees: known(12000n), payment_fees: known(6600n),
  fulfillment_costs: known(22500n), other_variable_costs: known(2900n), ad_spend: known(45000n),
};
const zero: Totals = {
  gross_sales: known(0n), discounts: known(0n), refunds: known(0n), cogs_net: known(0n),
  platform_fees: known(0n), payment_fees: known(0n), fulfillment_costs: known(0n),
  other_variable_costs: known(0n), ad_spend: known(0n),
};

describe("M1 metrics — independent monetary oracles", () => {
  it.each([ ["C01 previous", previous, expected.previous], ["C02 current", current, expected.current] ] as const)(
    "%s matches every golden monetary field", (_name, input, reference) => {
      const result = calculateMetrics(input);
      for (const [field, value] of Object.entries(reference)) {
        expect(result[field as keyof typeof result], field).toEqual(metric(value));
      }
    },
  );

  it("calculates all rates from summed amounts with 12-place half-up output", () => {
    const result = calculateMetrics(current);
    const rates = {
      gross_margin: "0.463562753036", contribution_margin: "0.103238866397",
      discount_rate: "0.145161290323", refund_ratio: "0.067924528302",
      mer: "5.488888888889", fulfillment_burden: "0.091093117409",
      marketing_burden: "0.182186234818",
    };
    for (const [field, value] of Object.entries(rates)) {
      expect(result[field as keyof typeof result]).toEqual(metric(value));
    }
  });

  it("C06 propagates missing cogs through GP and contribution, preserving revenue and independent rates", () => {
    const result = calculateMetrics({ ...current, cogs_net: missing("MISSING_COGS") });
    expect(result.net_revenue).toEqual(metric("2470.00"));
    for (const field of ["gross_profit", "contribution_before_marketing", "contribution_after_marketing", "gross_margin", "contribution_margin"] as const) {
      expect(result[field]).toEqual(metric(null, ["MISSING_COGS"]));
    }
    expect(result.mer).toEqual(metric("5.488888888889"));
    expect(result.discount_rate).toEqual(metric("0.145161290323"));
  });

  it("C08 missing ad is unknown, while before-marketing contribution remains known", () => {
    const result = calculateMetrics({ ...current, ad_spend: missing("MISSING_AD_DAY") });
    expect(result.contribution_before_marketing).toEqual(metric("705.00"));
    expect(result.contribution_after_marketing).toEqual(metric(null, ["MISSING_AD_DAY"]));
    expect(result.mer).toEqual(metric(null, ["MISSING_AD_DAY"]));
    expect(result.marketing_burden).toEqual(metric(null, ["MISSING_AD_DAY"]));
  });

  it("missing channel cost does not erase product gross profit or masquerade as a complete contribution", () => {
    const result = calculateMetrics({ ...current, fulfillment_costs: missing("MISSING_FULFILLMENT") });
    expect(result.gross_profit).toEqual(metric("1145.00"));
    expect(result.contribution_after_marketing).toEqual(metric(null, ["MISSING_FULFILLMENT"]));
    expect(result.fulfillment_burden).toEqual(metric(null, ["MISSING_FULFILLMENT"]));
    expect(result.mer).toEqual(metric("5.488888888889"));
  });

  it("C10 zero ad leaves contribution calculable and MER undefined", () => {
    const result = calculateMetrics({ ...current, ad_spend: known(0n) });
    expect(result.contribution_after_marketing).toEqual(metric("705.00"));
    expect(result.marketing_burden).toEqual(metric("0.000000000000"));
    expect(result.mer.value).toBeNull();
    expect(result.mer.reason_codes.length).toBeGreaterThan(0);
  });

  it("C11 pure refund day uses booked refund once and never invents a cogs reversal", () => {
    const result = calculateMetrics({ ...zero, refunds: known(10000n), cogs_net: known(1500n), ad_spend: known(2000n) });
    expect(result.net_revenue).toEqual(metric("-100.00"));
    expect(result.gross_profit).toEqual(metric("-115.00"));
    expect(result.contribution_after_marketing).toEqual(metric("-135.00"));
    for (const field of ["gross_margin", "contribution_margin", "discount_rate", "refund_ratio", "mer", "fulfillment_burden", "marketing_burden"] as const) {
      expect(result[field].value, field).toBeNull();
    }
  });

  it("C12 negative booked cogs reverses cost exactly once", () => {
    const result = calculateMetrics({ ...zero, refunds: known(10000n), cogs_net: known(-6000n) });
    expect(result.net_revenue).toEqual(metric("-100.00"));
    expect(result.gross_profit).toEqual(metric("-40.00"));
    expect(result.contribution_after_marketing).toEqual(metric("-40.00"));
  });

  it("C14 N = 0 has visible amounts but undefined N-denominator rates and MER", () => {
    const result = calculateMetrics({ ...zero, gross_sales: known(10000n), refunds: known(10000n), cogs_net: known(1000n), ad_spend: known(500n) });
    expect(result.net_revenue).toEqual(metric("0.00"));
    expect(result.contribution_after_marketing).toEqual(metric("-15.00"));
    for (const field of ["gross_margin", "contribution_margin", "mer", "fulfillment_burden", "marketing_burden"] as const) expect(result[field].value).toBeNull();
    expect(result.refund_ratio).toEqual(metric("1.000000000000"));
  });

  it("C17 computes a ratio of totals, not an average of two unequal row ratios", () => {
    // Row A G=100,D=50; row B G=900,D=0. Mean of rates=.25; aggregate=.05.
    expect(calculateMetrics({ ...zero, gross_sales: known(100000n), discounts: known(5000n) }).discount_rate).toEqual(metric("0.050000000000"));
  });

  it("retains signed credits for all booked channel expenses", () => {
    const result = calculateMetrics({ ...zero, gross_sales: known(10000n), platform_fees: known(-100n), payment_fees: known(-200n), fulfillment_costs: known(-300n), other_variable_costs: known(-400n) });
    expect(result.contribution_after_marketing).toEqual(metric("110.00"));
  });

  it("preserves cents above the native Number safe-integer range", () => {
    const result = calculateMetrics({ ...zero, gross_sales: known(900719925474099312345n), discounts: known(12n), refunds: known(33n) });
    expect(result.net_revenue).toEqual(metric("9007199254740993123.00"));
    expect(result.contribution_after_marketing).toEqual(metric("9007199254740993123.00"));
  });

  it("does not mutate caller totals or reason arrays", () => {
    const input = { ...current, cogs_net: missing("MISSING_COGS") };
    const before = structuredClone(input);
    calculateMetrics(input);
    expect(input).toEqual(before);
  });
});

describe("period comparison", () => {
  it("uses exact absolute money difference and growth only for positive previous amount", () => {
    expect(compareMoney(metric("570.00"), metric("255.00"))).toEqual({
      absolute_change: metric("-315.00"), growth_rate: metric("-0.552631578947"), transition: "no_sign_change",
    });
  });

  it.each([
    ["-10.00", "5.00", "15.00", "turned_positive"],
    ["0.00", "5.00", "5.00", "turned_positive"],
    ["0.00", "-5.00", "-5.00", "turned_negative"],
    ["-10.00", "-20.00", "-10.00", "no_sign_change"],
  ] as const)("previous %s/current %s preserves difference without invalid growth", (before, after, change, transition) => {
    const result = compareMoney(metric(before), metric(after));
    expect(result.absolute_change).toEqual(metric(change));
    expect(result.growth_rate.value).toBeNull();
    expect(result.growth_rate.reason_codes.length).toBeGreaterThan(0);
    expect(result.transition).toBe(transition);
  });

  it("identifies turning negative from a positive previous value", () => {
    expect(compareMoney(metric("10.00"), metric("-5.00"))).toEqual({
      absolute_change: metric("-15.00"), growth_rate: metric("-1.500000000000"), transition: "turned_negative",
    });
  });

  it("propagates null period comparison without sign claims", () => {
    const result = compareMoney(metric(null, ["MISSING_COGS"]), metric("5.00"));
    expect(result.absolute_change).toEqual(metric(null, ["MISSING_COGS"]));
    expect(result.growth_rate).toEqual(metric(null, ["MISSING_COGS"]));
    expect(result.transition).toBe("unavailable");
  });

  it.each(["", "NaN", "Infinity"])("C13 rejects invalid metric value %j at comparison boundary", (invalid) => {
    const result = compareMoney(metric(invalid), metric("5.00"));
    expect(result.absolute_change.value).toBeNull();
    expect(result.growth_rate.value).toBeNull();
    expect(result.transition).toBe("unavailable");
    expect(percentagePointChange(metric(invalid), metric("0.1")).value).toBeNull();
  });

  it("reports rate differences in percentage points", () => {
    expect(percentagePointChange(metric("0.10"), metric("0.125"))).toEqual(metric("2.500000000000"));
    expect(percentagePointChange(metric("0.10"), metric("0.075"))).toEqual(metric("-2.500000000000"));
    expect(percentagePointChange(metric("0.10"), metric("0.10"))).toEqual(metric("0.000000000000"));
    expect(percentagePointChange(metric(null, ["MISSING_RATE"]), metric("0.10"))).toEqual(metric(null, ["MISSING_RATE"]));
  });

  it("keeps a tiny rate difference beside a very large integer exact", () => {
    expect(percentagePointChange(metric("9007199254740993.100000000001"), metric("9007199254740993.100000000002"))).toEqual(metric("0.000000000100"));
    expect(compareMoney(metric("9007199254740993.10"), metric("9007199254740993.11")).absolute_change).toEqual(metric("0.01"));
  });
});

describe("M1 exact bridge", () => {
  it("C04 independently matches all nine signed golden components and reconciles to the cent", () => {
    const result = buildBridge(previous, current);
    for (const [field, value] of Object.entries(expected.bridge)) {
      if (field === "sum") continue;
      expect(result.components[field as keyof Totals], field).toEqual(metric(value));
    }
    expect(result.sum).toEqual(metric(expected.bridge.sum));
    expect(result.contribution_change).toEqual(metric("-315.00"));
    expect(result.reconciled).toBe(true);
    expect(result.interpretation).toBe("observed_amount_changes_not_causality");
  });

  it("preserves known components with no partial bridge total or reconciliation claim", () => {
    const result = buildBridge(previous, { ...current, ad_spend: missing("MISSING_AD_DAY") });
    expect(result.components.gross_sales).toEqual(metric("600.00"));
    expect(result.components.ad_spend).toEqual(metric(null, ["MISSING_AD_DAY"]));
    expect(result.sum).toEqual(metric(null, ["MISSING_AD_DAY"]));
    expect(result.contribution_change).toEqual(metric(null, ["MISSING_AD_DAY"]));
    expect(result.reconciled).toBeNull();
  });

  it("handles cent-scale changes and negative booked credits exactly", () => {
    const result = buildBridge(zero, { ...zero, gross_sales: known(30n), discounts: known(10n), cogs_net: known(-20n), fulfillment_costs: known(-1n), ad_spend: known(2n) });
    expect(result.components.gross_sales).toEqual(metric("0.30"));
    expect(result.components.discounts).toEqual(metric("-0.10"));
    expect(result.components.cogs_net).toEqual(metric("0.20"));
    expect(result.components.fulfillment_costs).toEqual(metric("0.01"));
    expect(result.sum).toEqual(metric("0.39"));
    expect(result.contribution_change).toEqual(metric("0.39"));
    expect(result.reconciled).toBe(true);
  });
});
