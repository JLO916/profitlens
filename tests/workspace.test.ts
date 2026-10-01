import { describe, expect, it } from "vitest";
import demoExpected from "../fixtures/demo/computed_summary.json";
import goldenExpected from "../fixtures/golden/expected.json";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { evidenceRows, formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "../src/application/presentation";
import { validateDataset } from "../src/domain/validation";
import type { Dataset, DatasetInput, MetricName } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";

function load(input: DatasetInput): Dataset {
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  return result.dataset!;
}
// Independent test-only parse for checking summed weekly actuals against fixed
// fixture answers; no production function produces the expected references.
function cents(value: string): bigint {
  const negative = value.startsWith("-");
  const digits = value.replace("-", "").replace(".", "");
  return BigInt(digits) * (negative ? -1n : 1n);
}

describe("M2 application snapshot", () => {
  it.each([["golden", goldenExpected], ["demo", demoExpected]] as const)("%s calls M1 and agrees with existing fixed reference JSON", async (name, reference) => {
    const input = fixture(name);
    const snapshot = await createSnapshot(load(input), {}, await hashInput(input));
    for (const period of ["previous", "current"] as const) {
      for (const [field, value] of Object.entries(reference[period])) {
        expect(snapshot.report[period].metrics[field as MetricName].value).toBe(value);
      }
    }
    expect(snapshot.dataset_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.filter_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.metric_version).toBe("contribution-v1");
    expect(snapshot.data_as_of).toBe((input.manifest as { data_as_of: string }).data_as_of);
    expect(snapshot.products.metrics).not.toHaveProperty("ad_spend");
    expect(snapshot.products.metrics).not.toHaveProperty("contribution_after_marketing");
  });

  it("demo weekly totals reconcile to fixed period totals and never mix the two periods", async () => {
    const input = fixture("demo");
    const snapshot = await createSnapshot(load(input), {}, await hashInput(input));
    expect(snapshot.weeks).toHaveLength(12);
    expect(snapshot.weeks[0]).toMatchObject({ period: "previous", start: "2026-06-01", end: "2026-06-07" });
    expect(snapshot.weeks[5]).toMatchObject({ period: "previous", start: "2026-07-06", end: "2026-07-12" });
    expect(snapshot.weeks[6]).toMatchObject({ period: "current", start: "2026-07-13", end: "2026-07-19" });
    expect(snapshot.weeks[11]).toMatchObject({ period: "current", start: "2026-08-17", end: "2026-08-23" });
    for (const period of ["previous", "current"] as const) {
      for (const field of ["net_revenue", "contribution_after_marketing"] as const) {
        const sum = snapshot.weeks.filter(week => week.period === period).reduce((total, week) => total + cents(week.metrics[field].value!), 0n);
        expect(sum).toBe(cents(demoExpected[period][field]));
      }
    }
    expect(snapshot.weeks.every(week => week.sources.length > 0)).toBe(true);
  });

  it("short custom periods keep final partial weeks and share active channel scope", async () => {
    const input = fixture("demo");
    const snapshot = await createSnapshot(load(input), { channels: ["DTC"], previous_period: { start: "2026-06-02", end: "2026-06-09" }, current_period: { start: "2026-07-14", end: "2026-07-21" } }, await hashInput(input));
    expect(snapshot.weeks.map(week => [week.start, week.end])).toEqual([["2026-06-02", "2026-06-08"], ["2026-06-09", "2026-06-09"], ["2026-07-14", "2026-07-20"], ["2026-07-21", "2026-07-21"]]);
    expect(snapshot.weeks.every(week => week.sources.every(source => source.channel === undefined || source.channel === "DTC"))).toBe(true);
    expect(snapshot.products.rows.every(row => row.channel === "DTC")).toBe(true);
    expect(snapshot.products.scope.period).toEqual(snapshot.report.scope.current_period);
  });

  it("missing advertisement remains a null gap in the weekly contribution", async () => {
    const input = fixture("errors/missing_ad_day");
    const snapshot = await createSnapshot(load(input), {}, await hashInput(input));
    const week = snapshot.weeks.find(row => row.period === "current")!;
    expect(week.metrics.net_revenue.value).toBe("2470.00");
    expect(week.metrics.contribution_after_marketing.value).toBeNull();
    expect(week.metrics.contribution_after_marketing.reason_codes).toContain("MISSING_AD_DAY");
  });

  it("filter hash uses canonical active scope and changes for channels or periods", async () => {
    const input = fixture("demo");
    const dataset = load(input);
    const datasetHash = await hashInput(input);
    const baseline = await createSnapshot(dataset, {}, datasetHash);
    const reverse = await createSnapshot(dataset, { channels: ["MARKETPLACE", "DTC"] }, datasetHash);
    const dtc = await createSnapshot(dataset, { channels: ["DTC"] }, datasetHash);
    const custom = await createSnapshot(dataset, { previous_period: { start: "2026-06-01", end: "2026-06-07" }, current_period: { start: "2026-07-13", end: "2026-07-19" } }, datasetHash);
    expect(reverse.filter_hash).toBe(baseline.filter_hash);
    expect(dtc.filter_hash).not.toBe(baseline.filter_hash);
    expect(custom.filter_hash).not.toBe(baseline.filter_hash);
    expect(dtc.dataset_hash).toBe(baseline.dataset_hash);
    expect(dtc.report.scope.channels).toEqual(["DTC"]);
  });

  it("dataset hashing is stable for object-key order and sensitive to input text", async () => {
    const input = fixture();
    const reordered = { files: Object.fromEntries(Object.entries(input.files).reverse()), manifest: Object.fromEntries(Object.entries(input.manifest as object).reverse()) } as DatasetInput;
    expect(await hashInput(reordered)).toBe(await hashInput(input));
    const bytes = { ...input, files: { ...input.files, "sales_daily.csv": new TextEncoder().encode(input.files["sales_daily.csv"] as string) } };
    expect(await hashInput(bytes)).toBe(await hashInput(input));
    const changed = { ...input, files: { ...input.files, "ad_spend_daily.csv": `${input.files["ad_spend_daily.csv"]}\n` } };
    expect(await hashInput(changed)).not.toBe(await hashInput(input));
  });
});

describe("M2 exact presentation and source evidence", () => {
  it("formats money without Number precision loss and preserves two decimal places", () => {
    expect(formatMoney("9007199254740993.01")).toBe("9,007,199,254,740,993.01");
    expect(formatMoney("-1234.5")).toBe("-1,234.50");
    expect(formatMoney("0.00")).toBe("0.00");
    expect(formatMoney(null)).toBe("—");
    expect(formatSignedMoney("315.00")).toBe("+315.00");
    expect(formatSignedMoney("-315.00")).toBe("-315.00");
    expect(formatSignedMoney("0.00")).toBe("0.00");
  });

  it("formats rates as percentages, not ratio numbers or monetary calculations", () => {
    expect(formatRate("0.12345")).toBe("12.35%");
    expect(formatRate("-0.1")).toBe("-10.00%");
    expect(formatRate("0")).toBe("0.00%");
    expect(formatRate(null)).toBe("N/A");
    expect(formatRate("-0.00000001")).toBe("0.00%");
  });

  it("provides formulas and correct raw-field dependencies including MER gates", () => {
    expect(metricDefinitions.contribution_after_marketing.fields).toEqual(["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
    expect(metricDefinitions.gross_profit.fields).toEqual(["gross_sales", "discounts", "refunds", "cogs_net"]);
    expect(metricDefinitions.mer.unit).toBe("multiple");
    expect(metricDefinitions.mer.formula).toContain("N > 0");
    expect(metricDefinitions.mer.formula).toContain("A > 0");
    for (const definition of Object.values(metricDefinitions)) {
      expect(definition.label).toBeTruthy();
      expect(definition.formula).toBeTruthy();
      expect(definition.fields.length).toBeGreaterThan(0);
    }
  });

  it("evidence keeps raw booked rows and never substitutes an aggregate", () => {
    const dataset = load(fixture());
    const rows = evidenceRows(dataset, [dataset.sales[0].source, dataset.sales[0].source, dataset.costs[0].source, dataset.ads[0].source]);
    expect(rows).toHaveLength(3);
    const sale = rows.find(row => row.file === "sales_daily.csv")!;
    expect(sale.line).toBe(2);
    expect(sale.values).toMatchObject({ sku: "A", units_sold: "2", gross_sales: "1000.00", discounts: "100.00", refunds: "0.00", cogs_net: "400.00" });
    expect(sale.values).not.toHaveProperty("net_revenue");
    expect(sale.missing).toBe(false);
  });

  it("missing sources and missing booked cost remain null evidence", () => {
    const missingAd = load(fixture("errors/missing_ad_day"));
    const missing = evidenceRows(missingAd, [{ file: "ad_spend_daily.csv", line: null, date: "2026-08-02", channel: "MARKETPLACE" }])[0];
    expect(missing.missing).toBe(true);
    expect(missing.values.ad_spend).toBeNull();
    expect(missing.line).toBeNull();
    const missingCogs = load(fixture("errors/missing_cogs"));
    const row = missingCogs.sales.find(sale => sale.cogs_net === null)!;
    expect(evidenceRows(missingCogs, [row.source])[0].values.cogs_net).toBeNull();
    const setting = evidenceRows(missingAd, [{ file: "manifest.json", line: null }])[0];
    expect(setting.values.sales_coverage_confirmed).toBe("true");
    expect(setting.missing).toBe(false);
  });
});
