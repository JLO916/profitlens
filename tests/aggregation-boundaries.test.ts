import { describe, expect, it } from "vitest";
import { aggregatePeriod } from "@/domain/aggregation";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

describe("聚合入口的範圍防護", () => {
  it("拒絕重複通路，避免總計被加倍而通路小計不變", () => {
    const ds = validateDataset(fixture()).dataset!;
    expect(() => aggregatePeriod(ds, ds.manifest.current_period, ["DTC", "DTC"])).toThrow();
  });
  it("拒絕空通路、未知通路與coverage外的日期", () => {
    const ds = validateDataset(fixture()).dataset!;
    expect(() => aggregatePeriod(ds, ds.manifest.current_period, [])).toThrow();
    expect(() => aggregatePeriod(ds, ds.manifest.current_period, ["UNKNOWN"])).toThrow();
    expect(() => aggregatePeriod(ds, { start: "2026-07-31", end: "2026-08-01" }, ["DTC"])).toThrow();
  });
  it("不展開巨大日通路矩陣，但摘要必須保持費用未知而非零", () => {
    const ds = validateDataset(fixture()).dataset!;
    ds.manifest.coverage_start = "0001-01-01";
    ds.manifest.coverage_end = "9999-12-31";
    const report = aggregatePeriod(ds, { start: "0001-01-01", end: "9999-12-31" }, ["DTC"]);
    expect(report.daily_complete).toBe(false);
    expect(report.daily).toHaveLength(2);
    expect(report.metrics.net_revenue.value).toBe("2830.00");
    expect(report.metrics.contribution_after_marketing.value).toBeNull();
    expect(report.metrics.ad_spend.reason_codes).toContain("MISSING_AD_DAY");
  });
});
