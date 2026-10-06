import { describe, expect, it } from "vitest";
import { analyzeDataset } from "../src/domain/analysis";
import { validateDataset } from "../src/domain/validation";
import type { Count, Metric, Summary } from "../src/domain/types";
import { ASSIST_KPI_IDS, ASSIST_KPI_VERSION, assistKpis, netRevenuePerUnit } from "../src/application/assist-kpi";
import { formatCount, formatMultiple, formatPerUnit, formatRateL1 } from "../src/application/presentation";
import { labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// R4-2 輔助指標（assist-kpi-v1）。golden 手算：
//   本期 淨營收 2470.00 ÷ 件數 8 ＝ 308.75 元／件；上期 2250.00 ÷ 6 ＝ 375.00 元／件
//   其餘五格沿用既有 domain 比率（golden expected.json 的 marketing_burden 0.182186…、mer 5.488888… 等），只驗證「呈現＝domain 值的格式化」。
//   V3-2b：畫面值（display）一律 L1（§8.5：7,420 件、1,058 元／件、8.8%、11.4 倍），斷言改成呼叫格式化函式；精確值仍在 value。
const metric = (value: string | null, reason_codes: string[] = []): Metric => ({ value, reason_codes });
const count = (value: bigint | null, reason_codes: string[] = []): Count => ({ value, reason_codes });
function golden() { return analyzeDataset(validateDataset(fixture("golden")).dataset!); }

describe("R4 assist-kpi-v1 derives manager-facing helper numbers without touching the financial core", () => {
  it("names its version and the seven helper indicators in display order", () => {
    expect(ASSIST_KPI_VERSION).toBe("assist-kpi-v1");
    expect(ASSIST_KPI_IDS).toEqual(["units_sold", "net_revenue_per_unit", "marketing_burden", "mer", "gross_margin", "refund_ratio", "fulfillment_burden"]);
  });

  it("computes units and net revenue per unit from the golden current period", () => {
    const report = golden();
    const row = Object.fromEntries(assistKpis(report.current).map(kpi => [kpi.id, kpi]));
    expect(row.units_sold).toMatchObject({ status: "ok", value: "8", display: formatCount("8", "L1"), label: labels.assist.items.units_sold.label });
    expect(row.net_revenue_per_unit).toMatchObject({ status: "ok", value: "308.75", display: formatPerUnit("308.75", "L1") });
    expect(row.marketing_burden).toMatchObject({ status: "ok", value: report.current.metrics.marketing_burden.value, display: formatRateL1(report.current.metrics.marketing_burden.value), metric: "marketing_burden" });
    expect(row.mer).toMatchObject({ status: "ok", value: report.current.metrics.mer.value, display: formatMultiple(report.current.metrics.mer.value, "L1"), metric: "mer" });
    for (const id of ["gross_margin", "refund_ratio", "fulfillment_burden"] as const) expect(row[id].display, id).toBe(formatRateL1(report.current.metrics[id].value));
    const previous = Object.fromEntries(assistKpis(report.previous).map(kpi => [kpi.id, kpi]));
    expect(previous.net_revenue_per_unit.value).toBe("375.00");
    // 每格都帶來源列，能開「怎麼算的」。
    for (const kpi of assistKpis(report.current)) expect(kpi.sources.length, kpi.id).toBeGreaterThan(0);
  });

  it("rounds net revenue per unit half-up to two decimals", () => {
    expect(netRevenuePerUnit(metric("100.00"), count(3n))).toEqual({ value: "33.33", reason_codes: [] });
    expect(netRevenuePerUnit(metric("200.00"), count(3n))).toEqual({ value: "66.67", reason_codes: [] });
    expect(netRevenuePerUnit(metric("0.05"), count(2n))).toEqual({ value: "0.03", reason_codes: [] });
    expect(netRevenuePerUnit(metric("-50.00"), count(4n))).toEqual({ value: "-12.50", reason_codes: [] });
  });

  it("treats net revenue ≤ 0 with ad spend > 0 as not applicable (nothing is missing)", () => {
    const report = golden();
    const negative: Summary = { ...report.current, metrics: { ...report.current.metrics, net_revenue: metric("-10.00"), mer: metric(null, ["NON_POSITIVE_NET_REVENUE"]), marketing_burden: metric(null, ["NON_POSITIVE_NET_REVENUE"]), gross_margin: metric(null, ["NON_POSITIVE_NET_REVENUE"]), refund_ratio: metric(null, ["NON_POSITIVE_NET_REVENUE"]), fulfillment_burden: metric(null, ["NON_POSITIVE_NET_REVENUE"]) } };
    const row = Object.fromEntries(assistKpis(negative).map(kpi => [kpi.id, kpi]));
    for (const id of ["mer", "marketing_burden", "gross_margin", "refund_ratio", "fulfillment_burden"] as const) expect(row[id], id).toMatchObject({ status: "not_applicable", display: labels.assist.notApplicable });
    // 件均：淨營收為負仍可算（-10 ÷ 8 ＝ -1.25），不是「不適用」。
    expect(row.net_revenue_per_unit).toMatchObject({ status: "ok", value: "-1.25" });
  });

  it("handles the edges: A=0 → MER not applicable, units ≤ 0 → per-unit not applicable, missing units → 資料待補", () => {
    const report = golden();
    const zeroAds: Summary = { ...report.current, totals: { ...report.current.totals, ad_spend: { cents: 0n, reason_codes: [] } }, metrics: { ...report.current.metrics, mer: metric(null, ["NON_POSITIVE_DENOMINATOR"]), marketing_burden: metric("0.000000000000") } };
    const withZeroAds = Object.fromEntries(assistKpis(zeroAds).map(kpi => [kpi.id, kpi]));
    expect(withZeroAds.mer).toMatchObject({ status: "not_applicable", value: null, display: labels.assist.notApplicable });
    expect(withZeroAds.marketing_burden).toMatchObject({ status: "ok", display: formatRateL1("0.000000000000") });
    expect(netRevenuePerUnit(metric("100.00"), count(0n))).toEqual({ value: null, reason_codes: ["ZERO_UNITS"] });
    const zeroUnits = Object.fromEntries(assistKpis({ ...report.current, units_sold: count(0n) }).map(kpi => [kpi.id, kpi]));
    expect(zeroUnits.units_sold).toMatchObject({ status: "ok", value: "0", display: formatCount("0", "L1") });
    expect(zeroUnits.net_revenue_per_unit).toMatchObject({ status: "not_applicable", value: null, display: labels.assist.notApplicable, reason_codes: ["ZERO_UNITS"] });
    const missingUnits = Object.fromEntries(assistKpis({ ...report.current, units_sold: count(null, ["MISSING_UNITS_SOLD"]) }).map(kpi => [kpi.id, kpi]));
    expect(missingUnits.units_sold).toMatchObject({ status: "missing", value: null, display: labels.status.missing, reason_codes: ["MISSING_UNITS_SOLD"] });
    expect(missingUnits.net_revenue_per_unit).toMatchObject({ status: "missing", value: null, reason_codes: ["MISSING_UNITS_SOLD"] });
    expect(netRevenuePerUnit(metric(null, ["MISSING_COGS"]), count(5n))).toEqual({ value: null, reason_codes: ["MISSING_COGS"] });
    expect(netRevenuePerUnit(metric("100.00"), count(-1n))).toEqual({ value: null, reason_codes: ["ZERO_UNITS"] });
  });
});

describe("R4 assist KPIs reach the analysis CSV and the manager summary Markdown", () => {
  it("adds seven assist_kpi rows per period to the CSV and an 輔助指標 section to the Markdown", async () => {
    const { createSnapshot, hashInput } = await import("../src/application/workspace");
    const { exportSnapshotCsv } = await import("../src/application/export");
    const { buildManagerSummary, exportManagerSummaryMarkdown } = await import("../src/application/manager-summary");
    const { csvHeaderKey } = await import("../src/application/copy");
    const { parseCsv } = await import("../src/lib/csv");
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const parsed = parseCsv(exportSnapshotCsv(dataset, snapshot));
    const rows = parsed.rows.map(row => Object.fromEntries(parsed.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
    const assist = rows.filter(row => row.row_type === "assist_kpi");
    expect(assist).toHaveLength(14);
    expect(assist.find(row => row.period === "current" && row.metric === "units_sold")).toMatchObject({ value: "8", unit: "count", metric_label: labels.assist.items.units_sold.label });
    expect(assist.find(row => row.period === "current" && row.metric === "net_revenue_per_unit")).toMatchObject({ value: "308.75", unit: "TWD/unit" });
    expect(assist.find(row => row.period === "previous" && row.metric === "net_revenue_per_unit")!.value).toBe("375.00");
    const markdown = exportManagerSummaryMarkdown(buildManagerSummary(snapshot));
    expect(markdown).toContain(`## ${labels.sections.assistKpis}`);
    expect(markdown).toContain(`| ${labels.assist.items.net_revenue_per_unit.label} | ${formatPerUnit("375.00", "L1")} | ${formatPerUnit("308.75", "L1")} |`);
    expect(markdown).toContain("assist_kpi_version：assist-kpi-v1");
  });
});
