import { describe, expect, it } from "vitest";
import { aggregatePeriod } from "../src/domain/aggregation";
import { analyzeDataset, analyzeProducts } from "../src/domain/analysis";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";

// R4-1 售出件數（domain 加法）。golden 的 units_sold 人工加總（fixtures/golden/sales_daily.csv，expected.json 不改）：
//   2026-08-01（上期）：DTC A 2 ＋ DTC B 1 ＝ 3；MARKETPLACE A 2 ＋ B 1 ＝ 3；合計 6
//   2026-08-02（本期）：DTC A 3 ＋ DTC B 1 ＝ 4；MARKETPLACE A 3 ＋ B 1 ＝ 4；合計 8
//   本期商品（全部通路）：A ＝ 3 ＋ 3 ＝ 6；B ＝ 1 ＋ 1 ＝ 2；各通路列：DTC/A 3、DTC/B 1、MARKETPLACE/A 3、MARKETPLACE/B 1
const PREVIOUS_UNITS = 6n, CURRENT_UNITS = 8n;
const PREVIOUS_BY_CHANNEL = { DTC: 3n, MARKETPLACE: 3n }, CURRENT_BY_CHANNEL = { DTC: 4n, MARKETPLACE: 4n };
const CURRENT_PRODUCT_ROWS = { "DTC/A": "3", "DTC/B": "1", "MARKETPLACE/A": "3", "MARKETPLACE/B": "1" };

function golden() { return validateDataset(fixture("golden")).dataset!; }

describe("R4 Summary.units_sold sums units per period and channel", () => {
  it("matches the hand-summed golden counts for both periods and every channel", () => {
    const report = analyzeDataset(golden());
    expect(report.previous.units_sold).toEqual({ value: PREVIOUS_UNITS, reason_codes: [] });
    expect(report.current.units_sold).toEqual({ value: CURRENT_UNITS, reason_codes: [] });
    for (const [channel, units] of Object.entries(PREVIOUS_BY_CHANNEL)) expect(report.previous.channels[channel].units_sold, `previous ${channel}`).toEqual({ value: units, reason_codes: [] });
    for (const [channel, units] of Object.entries(CURRENT_BY_CHANNEL)) expect(report.current.channels[channel].units_sold, `current ${channel}`).toEqual({ value: units, reason_codes: [] });
    // 單一通路的 scope 也只加該通路。
    const dtc = aggregatePeriod(golden(), { start: "2026-08-02", end: "2026-08-02" }, ["DTC"]);
    expect(dtc.units_sold).toEqual({ value: 4n, reason_codes: [] });
  });

  it("leaves every existing metric untouched (financial core unchanged)", () => {
    const report = analyzeDataset(golden());
    expect(report.current.metrics.net_revenue.value).toBe("2470.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBe("255.00");
    expect(report.metric_version).toBe("contribution-v1");
  });

  it("exposes units_sold on product rows and the product scope as integer strings", () => {
    const products = analyzeProducts(golden(), { period: { start: "2026-08-02", end: "2026-08-02" } });
    expect(products.metrics.units_sold).toEqual({ value: "8", reason_codes: [] });
    for (const row of products.rows) expect(row.metrics.units_sold, `${row.channel}/${row.sku}`).toEqual({ value: CURRENT_PRODUCT_ROWS[`${row.channel}/${row.sku}` as keyof typeof CURRENT_PRODUCT_ROWS], reason_codes: [] });
    const skuA = analyzeProducts(golden(), { period: { start: "2026-08-02", end: "2026-08-02" }, sku: "A" });
    expect(skuA.metrics.units_sold.value).toBe("6");
    // 既有商品指標不變：DTC/A 本期 淨營收 1400 − 210 − 70 ＝ 1120，成本 580 → 毛利 540。
    expect(products.rows[0].metrics.gross_profit.value).toBe("540.00");
  });

  it("turns a single blank units_sold cell into null with MISSING_UNITS_SOLD for every scope that contains it", () => {
    const input = fixture("golden");
    const sales = (input.files["sales_daily.csv"] as string).replace("2026-08-02,DTC,A,HOME,3,", "2026-08-02,DTC,A,HOME,,");
    const dataset = validateDataset({ ...input, files: { ...input.files, "sales_daily.csv": sales } }).dataset!;
    const report = analyzeDataset(dataset);
    expect(report.previous.units_sold).toEqual({ value: PREVIOUS_UNITS, reason_codes: [] });
    expect(report.current.units_sold).toEqual({ value: null, reason_codes: ["MISSING_UNITS_SOLD"] });
    expect(report.current.channels.DTC.units_sold).toEqual({ value: null, reason_codes: ["MISSING_UNITS_SOLD"] });
    expect(report.current.channels.MARKETPLACE.units_sold).toEqual({ value: 4n, reason_codes: [] });
    const products = analyzeProducts(dataset, { period: { start: "2026-08-02", end: "2026-08-02" } });
    expect(products.rows.find(row => row.channel === "DTC" && row.sku === "A")!.metrics.units_sold).toEqual({ value: null, reason_codes: ["MISSING_UNITS_SOLD"] });
    expect(products.rows.find(row => row.channel === "DTC" && row.sku === "B")!.metrics.units_sold).toEqual({ value: "1", reason_codes: [] });
    // 金額不受影響（件數缺漏是 partial，不是 blocking）。
    expect(report.current.metrics.net_revenue.value).toBe("2470.00");
  });

  it("carries both reasons when coverage is unconfirmed and a units cell is blank", () => {
    const input = fixture("golden");
    const sales = (input.files["sales_daily.csv"] as string).replace("2026-08-02,DTC,A,HOME,3,", "2026-08-02,DTC,A,HOME,,");
    const dataset = validateDataset({ ...input, manifest: { ...(input.manifest as Record<string, unknown>), sales_coverage_confirmed: false }, files: { ...input.files, "sales_daily.csv": sales } }).dataset!;
    const report = analyzeDataset(dataset);
    expect(report.current.units_sold).toEqual({ value: null, reason_codes: ["MISSING_UNITS_SOLD", "SALES_COVERAGE_UNCONFIRMED"] });
    expect(report.current.channels.MARKETPLACE.units_sold).toEqual({ value: null, reason_codes: ["SALES_COVERAGE_UNCONFIRMED"] });
  });

  it("is unknown while sales coverage is unconfirmed, like the sales amounts", () => {
    const input = fixture("golden");
    const dataset = validateDataset({ ...input, manifest: { ...(input.manifest as Record<string, unknown>), sales_coverage_confirmed: false } }).dataset!;
    const report = analyzeDataset(dataset);
    expect(report.current.units_sold).toEqual({ value: null, reason_codes: ["SALES_COVERAGE_UNCONFIRMED"] });
    expect(report.current.channels.DTC.units_sold.reason_codes).toEqual(["SALES_COVERAGE_UNCONFIRMED"]);
    expect(analyzeProducts(dataset, { period: { start: "2026-08-02", end: "2026-08-02" } }).metrics.units_sold).toEqual({ value: null, reason_codes: ["SALES_COVERAGE_UNCONFIRMED"] });
  });
});
