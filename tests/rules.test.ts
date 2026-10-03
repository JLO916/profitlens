import { describe, expect, it } from "vitest";
import manifest from "../fixtures/golden/manifest.json";
import { calculateMetrics } from "../src/domain/metrics";
import { diagnose } from "../src/domain/rules";
import { AMOUNT_FIELDS, PRODUCT_METRICS, type Amount, type Dataset, type Manifest, type Metric, type PeriodAnalysis, type ProductMetrics, type ProductRow, type SourceRef, type Totals } from "../src/domain/types";

const known = (cents: bigint): Amount => ({ cents, reason_codes: [] });
const metric = (value: string | null): Metric => ({ value, reason_codes: value === null ? ["MISSING_COGS"] : [] });
const source: SourceRef = { file: "sales_daily.csv", line: 2, date: "2026-08-01", channel: "DTC", sku: "A" };
const zero = Object.fromEntries(AMOUNT_FIELDS.map(field => [field, known(0n)])) as Totals;
const dataset: Dataset = { manifest: manifest as Manifest, sales: [], costs: [], ads: [], issues: [] };
function period(totals: Totals, current = false): PeriodAnalysis {
  const scope = { totals, metrics: calculateMetrics(totals), sources: [source], units_sold: { value: null, reason_codes: [] } };
  return { ...scope, period: current ? dataset.manifest.current_period : dataset.manifest.previous_period, daily: [], daily_complete: true, channels: { DTC: scope }, units_sold: { value: null, reason_codes: [] } };
}
function input(before: Partial<Totals> = {}, after: Partial<Totals> = {}, products: ProductRow[] = []) {
  return { dataset, previous: period({ ...zero, gross_sales: known(10000n), ...before }), current: period({ ...zero, gross_sales: known(10000n), ...after }, true), currentProducts: products, channels: ["DTC"] };
}

describe("M1 deterministic rules", () => {
  it("REV_UP_CM_DOWN requires positive revenue difference and negative contribution difference", () => {
    const report = diagnose(input({ cogs_net: known(2000n), ad_spend: known(1000n) }, { gross_sales: known(20000n), cogs_net: known(15000n), ad_spend: known(3000n) }));
    const rule = report.diagnostics.find(item => item.code === "REV_UP_CM_DOWN" && item.scope.kind === "all")!;
    expect(rule).toBeDefined();
    expect(rule.ranking_amount?.value).toBe("-50.00");
    expect(rule.fact_ids.map(id => report.facts.find(f => f.id === id)?.metric)).toEqual(expect.arrayContaining(["net_revenue", "contribution_after_marketing"]));
    expect(diagnose(input({}, { gross_sales: known(20000n) })).diagnostics.map(d => d.code)).not.toContain("REV_UP_CM_DOWN");
  });

  it("NEGATIVE_CHANNEL_CM is only a channel rule with observed negative contribution", () => {
    const report = diagnose(input({}, { cogs_net: known(20000n) }));
    const rules = report.diagnostics.filter(item => item.code === "NEGATIVE_CHANNEL_CM");
    expect(rules).toHaveLength(1);
    expect(rules[0].scope).toEqual({ kind: "channel", channels: ["DTC"] });
    expect(rules[0].ranking_amount?.value).toBe("-100.00");
  });

  it.each([
    ["DISCOUNT_BURDEN_UP", "discounts", "discount_rate"],
    ["REFUND_BURDEN_UP", "refunds", "refund_ratio"],
    ["FULFILLMENT_BURDEN_UP", "fulfillment_costs", "fulfillment_burden"],
    ["MARKETING_BURDEN_UP", "ad_spend", "marketing_burden"],
  ] as const)("%s compares the correct ratio and supplies both period evidence", (code, amount, rate) => {
    const report = diagnose(input({ [amount]: known(1000n) }, { [amount]: known(2000n) }));
    const rule = report.diagnostics.find(d => d.code === code && d.scope.kind === "all")!;
    expect(rule).toBeDefined();
    expect(rule.ranking_amount?.value).toBe("10.00");
    const facts = rule.fact_ids.map(id => report.facts.find(f => f.id === id)!);
    expect(facts.filter(f => f.metric === rate).map(f => f.period.start).sort()).toEqual(["2026-08-01", "2026-08-02"]);
    expect(facts.some(f => f.metric === amount)).toBe(true);
    expect(rule.hypothesis).toContain("待驗證");
    expect(rule.limitations.length).toBeGreaterThan(0);
    if (code === "DISCOUNT_BURDEN_UP") expect(facts.some(f => f.metric === "gross_sales")).toBe(true);
    if (code === "REFUND_BURDEN_UP") expect(rule.limitations.join(" ")).toMatch(/入帳|cohort/);
    if (code === "MARKETING_BURDEN_UP") expect(rule.recommendation).not.toMatch(/停止投放|立即停投|浪費/);
  });

  it("a ratio that falls does not trigger merely because the amount rises", () => {
    const report = diagnose(input({ ad_spend: known(1000n) }, { gross_sales: known(30000n), ad_spend: known(2000n) }));
    expect(report.diagnostics.map(d => d.code)).not.toContain("MARKETING_BURDEN_UP");
  });

  it("identical or non-positive ratio denominators do not generate a burden-up diagnosis", () => {
    expect(diagnose(input()).diagnostics).toEqual([]);
    const report = diagnose(input({ gross_sales: known(0n) }, { gross_sales: known(0n), refunds: known(1000n), fulfillment_costs: known(1000n), ad_spend: known(1000n) }));
    expect(report.diagnostics.filter(d => d.code.endsWith("BURDEN_UP"))).toEqual([]);
    const negativeBefore = diagnose(input({ refunds: known(20000n), fulfillment_costs: known(1000n), ad_spend: known(1000n) }, { fulfillment_costs: known(2000n), ad_spend: known(2000n) }));
    expect(negativeBefore.diagnostics.map(d => d.code)).not.toContain("FULFILLMENT_BURDEN_UP");
    expect(negativeBefore.diagnostics.map(d => d.code)).not.toContain("MARKETING_BURDEN_UP");
  });

  it("compares the underlying exact ratios even when formatted ratios round identically", () => {
    const report = diagnose(input({ gross_sales: known(100000000000000000n), discounts: known(10000000000000000n) }, { gross_sales: known(100000000000000000n), discounts: known(10000000000000001n) }));
    const rateFacts = report.facts.filter(f => f.scope.kind === "all" && f.metric === "discount_rate");
    expect(rateFacts.map(f => f.value)).toEqual(["0.100000000000", "0.100000000000"]);
    expect(report.diagnostics.map(d => d.code)).toContain("DISCOUNT_BURDEN_UP");
  });

  it("MISSING_CRITICAL_DATA sorts first and cannot trigger unknown contribution rules", () => {
    const report = diagnose(input({}, { gross_sales: known(20000n), discounts: known(5000n), cogs_net: { cents: null, reason_codes: ["MISSING_COGS"] } }));
    expect(report.diagnostics[0].code).toBe("MISSING_CRITICAL_DATA");
    expect(report.diagnostics.map(d => d.code)).not.toContain("REV_UP_CM_DOWN");
    expect(report.diagnostics.map(d => d.code)).not.toContain("NEGATIVE_CHANNEL_CM");
    expect(report.diagnostics.map(d => d.code)).toContain("DISCOUNT_BURDEN_UP");
    for (const rule of report.diagnostics.filter(d => d.code === "MISSING_CRITICAL_DATA")) {
      expect(rule.ranking_amount).toBeNull();
      expect(rule.fact_ids.some(id => report.facts.find(f => f.id === id)?.value === null)).toBe(true);
    }
  });

  it("missing ad forbids marketing-burden facts from becoming a monetary claim", () => {
    const report = diagnose(input({}, { fulfillment_costs: known(2000n), ad_spend: { cents: null, reason_codes: ["MISSING_AD_DAY"] } }));
    expect(report.diagnostics.map(d => d.code)).not.toContain("MARKETING_BURDEN_UP");
    expect(report.diagnostics.map(d => d.code)).toContain("FULFILLMENT_BURDEN_UP");
  });

  it("SKU_NEGATIVE_GP references only product facts, never channel ads or contribution", () => {
    const totals = { ...zero, gross_sales: known(10000n), cogs_net: known(12000n) };
    const metrics = calculateMetrics(totals);
    const productMetrics = Object.fromEntries(PRODUCT_METRICS.map(field => [field, metrics[field]])) as ProductMetrics;
    const products: ProductRow[] = [{ channel: "DTC", sku: "A", category: "HOME", metrics: { ...productMetrics, ad_spend: metric("999.00") } as ProductMetrics, sources: [source] }];
    const report = diagnose(input({}, {}, products));
    const rule = report.diagnostics.find(d => d.code === "SKU_NEGATIVE_GP")!;
    expect(rule.scope).toEqual({ kind: "sku", channels: ["DTC"], sku: "A", category: "HOME" });
    expect(rule.ranking_amount?.value).toBe("-20.00");
    expect(report.facts.filter(f => f.scope.kind === "sku").every(f => (PRODUCT_METRICS as readonly string[]).includes(f.metric))).toBe(true);
    expect(rule.fact_ids.every(id => report.facts.find(f => f.id === id)?.scope.kind === "sku")).toBe(true);
    products[0].metrics.gross_profit = metric(null);
    expect(diagnose(input({}, {}, products)).diagnostics.map(d => d.code)).not.toContain("SKU_NEGATIVE_GP");
  });

  it("stable unique IDs encode dataset, periods, scopes and every reference resolves to a traceable fact", () => {
    const args = input({ ad_spend: known(1000n) }, { ad_spend: known(2000n), discounts: known(1000n) });
    const report = diagnose(args);
    expect(new Set(report.facts.map(f => f.id)).size).toBe(report.facts.length);
    expect(new Set(report.diagnostics.map(d => d.id)).size).toBe(report.diagnostics.length);
    for (const diagnostic of report.diagnostics) {
      expect(diagnostic.fact_ids.length).toBeGreaterThan(0);
      expect(diagnostic.hypothesis).toContain("待驗證");
      expect(diagnostic.recommendation).toBeTruthy();
      for (const id of diagnostic.fact_ids) {
        const fact = report.facts.find(f => f.id === id)!;
        expect(fact).toBeDefined();
        expect(fact.scope).toEqual(diagnostic.scope);
        expect(fact.sources).toContainEqual(source);
      }
    }
    const original = structuredClone(args);
    expect(diagnose(args)).toEqual(report);
    expect(args).toEqual(original);
    const other = diagnose({ ...args, dataset: { ...dataset, manifest: { ...dataset.manifest, dataset_id: "other" } } });
    expect(other.facts.some(f => report.facts.some(g => f.id === g.id))).toBe(false);
  });

  it("sorts missing data first, then absolute observed amounts descending with stable ID ties", () => {
    const report = diagnose(input({}, { discounts: known(1000n), refunds: known(2000n), fulfillment_costs: known(3000n), ad_spend: known(4000n) }));
    const values = report.diagnostics.map(d => Math.abs(Number(d.ranking_amount?.value)));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    const ties = report.diagnostics.filter(d => d.ranking_amount?.value === "10.00").map(d => d.id);
    expect(ties).toEqual([...ties].sort());
  });

  it("ranks amounts exactly when they differ by one cent above Number precision", () => {
    const report = diagnose(input({ gross_sales: known(1000000000000000000000n) }, { gross_sales: known(1000000000000000000000n), fulfillment_costs: known(1000000000000000000n), ad_spend: known(1000000000000000001n) }));
    expect(report.diagnostics.map(d => d.code)).toEqual(["MARKETING_BURDEN_UP", "MARKETING_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "FULFILLMENT_BURDEN_UP"]);
  });
});
