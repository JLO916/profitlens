import { describe, expect, it } from "vitest";
import { analyzeDataset, analyzeProducts } from "@/domain/analysis";
import { validateDataset } from "@/domain/validation";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "@/domain/scenarios";
import { createSnapshot, hashInput } from "@/application/workspace";
import { createDecisionSession, reconfirmDecision, refreshDecisionSession, saveScenario } from "@/application/decision";
import { exportDecisionJson } from "@/application/decision-export";
import type { DatasetInput } from "@/domain/types";

// Independent four-day ledger, not derived from golden or production functions.
// Previous: N=900, C=480, GP=420, other costs=87, A=35, CM=298.
// Current:  N=970, C=485, GP=485, other costs=95, A=60, CM=330.
// Refunds and actual cost/fee reversals remain on their separate posting dates.
function ledger(): DatasetInput {
  return {
    manifest: {
      schema_version: "1.0", dataset_id: "m6-independent-ledger", source_type: "synthetic",
      currency: "TWD", timezone: "Asia/Taipei", data_as_of: "2026-09-05",
      coverage_start: "2026-09-01", coverage_end: "2026-09-04", channels: ["DTC", "MARKETPLACE"],
      previous_period: { start: "2026-09-01", end: "2026-09-02" },
      current_period: { start: "2026-09-03", end: "2026-09-04" },
      sales_coverage_confirmed: true,
      amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
    },
    files: {
      "sales_daily.csv": [
        "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency",
        "2026-09-01,DTC,A,HOME,1,100,10,0,40,TWD",
        "2026-09-01,DTC,B,HOME,3,300,60,0,150,TWD",
        "2026-09-01,MARKETPLACE,C,OTHER,6,600,0,0,300,TWD",
        "2026-09-02,DTC,A,HOME,0,0,0,30,-10,TWD",
        "2026-09-03,DTC,A,HOME,1,120,0,0,50,TWD",
        "2026-09-03,DTC,B,HOME,2,280,140,0,100,TWD",
        "2026-09-03,MARKETPLACE,C,OTHER,9,900,90,0,360,TWD",
        "2026-09-04,DTC,A,HOME,0,0,0,100,-25,TWD",
      ].join("\n"),
      "channel_costs_daily.csv": [
        "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency",
        "2026-09-01,DTC,10,3,12,1,TWD",
        "2026-09-02,DTC,-2,0,4,0,TWD",
        "2026-09-01,MARKETPLACE,30,6,15,2,TWD",
        "2026-09-02,MARKETPLACE,0,0,5,1,TWD",
        "2026-09-03,DTC,8,2,10,1,TWD",
        "2026-09-04,DTC,-3,-1,3,0,TWD",
        "2026-09-03,MARKETPLACE,40,8,18,2,TWD",
        "2026-09-04,MARKETPLACE,0,0,6,1,TWD",
      ].join("\n"),
      "ad_spend_daily.csv": [
        "date,channel,ad_spend,currency",
        "2026-09-01,DTC,20,TWD", "2026-09-02,DTC,5,TWD",
        "2026-09-01,MARKETPLACE,10,TWD", "2026-09-02,MARKETPLACE,0,TWD",
        "2026-09-03,DTC,30,TWD", "2026-09-04,DTC,10,TWD",
        "2026-09-03,MARKETPLACE,15,TWD", "2026-09-04,MARKETPLACE,5,TWD",
      ].join("\n"),
    },
  };
}
function load(input = ledger()) {
  const validated = validateDataset(input);
  expect(validated.classification).not.toBe("blocking");
  return validated.dataset!;
}
const explicit: ScenarioInputs = {
  volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0",
  ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true,
};

describe("M6 independent financial ledger probes", () => {
  it("charges each daily channel once, including no-sale days, and reconciles posted refunds/reversals", () => {
    const report = analyzeDataset(load());
    expect(report.previous.metrics.net_revenue.value).toBe("900.00");
    expect(report.previous.metrics.contribution_after_marketing.value).toBe("298.00");
    expect(report.current.metrics.net_revenue.value).toBe("970.00");
    expect(report.current.metrics.cogs_net.value).toBe("485.00");
    expect(report.current.metrics.gross_profit.value).toBe("485.00");
    expect(report.current.metrics.contribution_before_marketing.value).toBe("390.00");
    expect(report.current.metrics.ad_spend.value).toBe("60.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBe("330.00");
    expect(report.current.channels.DTC.metrics.contribution_after_marketing.value).toBe("-25.00");
    expect(report.current.channels.MARKETPLACE.metrics.contribution_after_marketing.value).toBe("355.00");
    const noSaleDay = report.current.daily.find(row => row.date === "2026-09-04" && row.channel === "MARKETPLACE")!;
    expect(noSaleDay.metrics.net_revenue.value).toBe("0.00");
    expect(noSaleDay.metrics.contribution_after_marketing.value).toBe("-12.00");
    const refundDay = report.current.daily.find(row => row.date === "2026-09-04" && row.channel === "DTC")!;
    expect(refundDay.metrics.net_revenue.value).toBe("-100.00");
    expect(refundDay.metrics.gross_profit.value).toBe("-75.00");
    expect(refundDay.metrics.contribution_after_marketing.value).toBe("-84.00");
    expect(refundDay.metrics.gross_margin.value).toBeNull();
    expect(refundDay.metrics.contribution_margin.value).toBeNull();
    expect(refundDay.metrics.mer.value).toBeNull();
    expect(Object.fromEntries(Object.entries(report.bridge.components).map(([key, value]) => [key, value.value]))).toEqual({
      gross_sales: "300.00", discounts: "-160.00", refunds: "-70.00", cogs_net: "-5.00",
      platform_fees: "-7.00", payment_fees: "0.00", fulfillment_costs: "-1.00", other_variable_costs: "0.00", ad_spend: "-25.00",
    });
    expect(report.bridge.sum.value).toBe("32.00");
    expect(report.bridge.contribution_change.value).toBe("32.00");
    expect(report.bridge.reconciled).toBe(true);
  });

  it("aggregates ratios over the same multi-day scope and does not average day/channel ratios", () => {
    const report = analyzeDataset(load());
    expect(report.current.metrics.discount_rate.value).toBe("0.176923076923"); // 230/1300
    expect(report.current.metrics.refund_ratio.value).toBe("0.093457943925"); // 100/1070
    expect(report.current.metrics.gross_margin.value).toBe("0.500000000000"); // 485/970
    expect(report.current.metrics.contribution_margin.value).toBe("0.340206185567"); // 330/970
    expect(report.current.channels.DTC.metrics.refund_ratio.value).toBe("0.384615384615"); // 100/260
    expect(report.current.channels.DTC.metrics.contribution_margin.value).toBe("-0.156250000000"); // -25/160
  });

  it("isolates SKU/category gross profit while retaining all posted channel costs in channel scope", () => {
    const dataset = load();
    const products = analyzeProducts(dataset, { period: dataset.manifest.current_period, channels: ["DTC"], sku: "A", category: "HOME" });
    expect(products.metrics.net_revenue.value).toBe("20.00");
    expect(products.metrics.cogs_net.value).toBe("25.00");
    expect(products.metrics.gross_profit.value).toBe("-5.00");
    expect(products.metrics).not.toHaveProperty("ad_spend");
    expect(products.metrics).not.toHaveProperty("contribution_after_marketing");
    expect(products.sources).toHaveLength(2);
    expect(products.sources.every(source => source.file === "sales_daily.csv" && source.sku === "A")).toBe(true);
    expect(analyzeDataset(dataset, { channels: ["DTC"] }).current.metrics.contribution_after_marketing.value).toBe("-25.00");
  });

  it.each([
    { file: "channel_costs_daily.csv" as const, line: "2026-09-04,MARKETPLACE,0,0,6,1,TWD", reason: "MISSING_CHANNEL_COST_DAY", before: null },
    { file: "ad_spend_daily.csv" as const, line: "2026-09-04,MARKETPLACE,5,TWD", reason: "MISSING_AD_DAY", before: "390.00" },
  ])("keeps missing $file on a no-sale day unknown at channel and grand-total scope", ({ file, line, reason, before }) => {
    const input = ledger();
    input.files[file] = (input.files[file] as string).split("\n").filter(value => value !== line).join("\n");
    const validated = validateDataset(input);
    expect(validated.classification).toBe("partial");
    const report = analyzeDataset(validated.dataset!);
    expect(report.current.metrics.net_revenue.value).toBe("970.00");
    expect(report.current.metrics.gross_profit.value).toBe("485.00");
    expect(report.current.metrics.contribution_before_marketing.value).toBe(before);
    expect(report.current.metrics.contribution_after_marketing.value).toBeNull();
    expect(report.current.metrics.contribution_after_marketing.reason_codes).toContain(reason);
    expect(report.current.channels.DTC.metrics.contribution_after_marketing.value).toBe("-25.00");
    expect(report.current.channels.MARKETPLACE.metrics.contribution_after_marketing.value).toBeNull();
    expect(report.bridge.reconciled).toBeNull();
    const baseline = buildScenarioBaseline(report.current.channels.MARKETPLACE, true);
    expect(calculateScenario(baseline, explicit)).toMatchObject({ status: "ineligible", contribution: null });
  });

  it("does not infer a missing cost reversal from a known refund amount", () => {
    const input = ledger();
    input.files["sales_daily.csv"] = (input.files["sales_daily.csv"] as string).replace("0,0,0,100,-25,TWD", "0,0,0,100,,TWD");
    const dataset = load(input);
    const report = analyzeDataset(dataset);
    expect(report.current.metrics.net_revenue.value).toBe("970.00");
    expect(report.current.metrics.gross_profit.value).toBeNull();
    expect(report.current.metrics.gross_profit.reason_codes).toContain("MISSING_COGS");
    expect(report.current.channels.MARKETPLACE.metrics.gross_profit.value).toBe("450.00");
    const product = (sku: string) => analyzeProducts(dataset, { period: dataset.manifest.current_period, channels: ["DTC"], sku });
    expect(product("A").metrics.gross_profit.value).toBeNull();
    expect(product("B").metrics.gross_profit.value).toBe("40.00");
  });
});

describe("M6 independent closed-scenario and freshness probes", () => {
  it("recalculates a net-positive baseline containing posted refunds and rebates with percentage points", () => {
    const baseline = buildScenarioBaseline(analyzeDataset(load()).current.channels.DTC, true);
    expect(baseline.eligible).toBe(true);
    expect(calculateScenario(baseline, explicit)).toMatchObject({ contribution: "-25.00", delta: "0.00" });
    // G'=500,D'=125,R'=1875/13,N'=3000/13; contribution=242/13=18.6153846…
    // A -25% is independent of the explicit volume +25%; discount .35 -> .25.
    const result = calculateScenario(baseline, { volume_change_pct: "25", discount_change_pp: "-10", fulfillment_change_pct: "-20", ad_change_pct: "-25", one_time_cost: "3", assumptions_accepted: true });
    expect(result.status).toBe("valid");
    expect(result.amounts).toEqual({
      gross_sales: "500.00", discounts: "125.00", refunds: "144.23", cogs_net: "156.25",
      platform_fees: "7.21", payment_fees: "1.44", fulfillment_costs: "13.00", other_variable_costs: "1.25", ad_spend: "30.00",
      net_revenue: "230.77", gross_profit: "74.52", contribution_before_marketing: "51.62", contribution_after_marketing: "18.62", one_time_cost: "3.00",
    });
    expect(result.contribution).toBe("18.62");
    expect(result.delta).toBe("43.62");
    expect(result.rounding_adjustment).toBe("0.00");
    expect(baseline.amounts.contribution_after_marketing).toBe("-25.00");
    expect(calculateScenario(baseline, { ...explicit, ad_change_pct: "-25", volume_change_pct: "" }).contribution).toBeNull();
  });

  it.each([
    { cost: "0", contribution: "0.02", delta: "0.01", adjustment: "0.01" },
    { cost: "0.02", contribution: "-0.01", delta: "-0.02", adjustment: "0.00" },
  ])("keeps unrounded half-cent sums before positive/negative HALF_UP finalization ($cost one-time cost)", ({ cost, contribution, delta, adjustment }) => {
    const input = ledger();
    input.files["sales_daily.csv"] = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n2026-09-03,DTC,A,HOME,1,0.07,0.02,0.02,0.01,TWD";
    input.files["channel_costs_daily.csv"] = (input.files["channel_costs_daily.csv"] as string).split("\n").map((line, index) => index === 0 ? line : `${line.split(",").slice(0, 2).join(",")},${line.startsWith("2026-09-03,DTC,") ? "0.01" : "0"},0,0,0,TWD`).join("\n");
    input.files["ad_spend_daily.csv"] = (input.files["ad_spend_daily.csv"] as string).split("\n").map((line, index) => index === 0 ? line : `${line.split(",").slice(0, 2).join(",")},0,TWD`).join("\n");
    const baseline = buildScenarioBaseline(analyzeDataset(load(input)).current.channels.DTC, true);
    expect(baseline.amounts.contribution_after_marketing).toBe("0.01");
    // With v=50%, N'=.045,C'=.015,P'=.015, so unrounded CM'=.015-K.
    const result = calculateScenario(baseline, { ...explicit, volume_change_pct: "50", one_time_cost: cost });
    expect(result).toMatchObject({ status: "valid", contribution, delta, rounding_adjustment: adjustment });
  });

  it("invalidates a saved scenario when reimported bytes change under the same dataset id and recaptures only after confirmation", async () => {
    const input = ledger();
    const dataset = load(input);
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
    const session = createDecisionSession(dataset, snapshot, 1);
    const plans = saveScenario(session, [], { id: "review", name: "基準確認", inputs: explicit });
    const changed = ledger();
    changed.files["sales_daily.csv"] = (changed.files["sales_daily.csv"] as string).replace("0,0,0,100,-25,TWD", "0,0,0,0,-25,TWD");
    const nextDataset = load(changed);
    const nextSnapshot = await createSnapshot(nextDataset, { channels: ["DTC"] }, await hashInput(changed));
    const expired = refreshDecisionSession(session, nextSnapshot, 2);
    expect(expired.stale).toBe(true);
    expect(expired.baseline.amounts.contribution_after_marketing).toBe("-25.00");
    expect(() => saveScenario(expired, plans, { id: "review", name: "基準確認", inputs: explicit })).toThrow("STALE_DECISION");
    const exported = JSON.parse(exportDecisionJson(expired, plans, []));
    expect(exported.status).toBe("stale");
    expect(exported.scenarios[0].result.contribution).toBe("-25.00");
    const confirmed = reconfirmDecision(expired, plans, [], nextDataset, nextSnapshot, 2);
    expect(confirmed.session.baseline.amounts.contribution_after_marketing).toBe("75.00");
    expect(confirmed.scenarios[0].result).toBeNull();
    expect(confirmed.scenarios[0].inputs.volume_change_pct).toBe("");
    expect(confirmed.scenarios[0].inputs.assumptions_accepted).toBe(false);
  });
});
