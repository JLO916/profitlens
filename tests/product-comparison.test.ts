import { describe, expect, it } from "vitest";
import { compareProducts, selectProductComparisonRows } from "@/domain/product-comparison";
import { exportProductComparisonCsv } from "@/application/product-comparison-export";
import { csvHeaderKey } from "@/application/copy";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { parseCsv } from "@/lib/csv";
import { parseCents } from "@/domain/money";
import type { Dataset, DatasetInput } from "@/domain/types";
import { fixture } from "./helpers/fixtures";

function dataset(input: DatasetInput = fixture()): Dataset {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  return result.dataset!;
}
function withSales(rows: string[], confirmed = true): DatasetInput {
  const input = fixture();
  input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: confirmed };
  input.files["sales_daily.csv"] = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + rows.join("\n") + "\n";
  return input;
}
const sale = (date: string, sku: string, gross: string, cogs: string, refund = "0") => `${date},DTC,${sku},HOME,1,${gross},0,${refund},${cogs},TWD`;
const aug1 = "2026-08-01";
const aug2 = "2026-08-02";

describe("PL-07 兩期商品毛利：固定答案、未知及已觀察來源", () => {
  it("golden 四個商品通路差額精確加回 GP 1145 − 1200 = -55，沒有費用分攤", () => {
    const comparison = compareProducts(dataset());
    const values = comparison.rows.map(row => [row.channel, row.sku, row.previous.metrics.gross_profit.value, row.current.metrics.gross_profit.value, row.changes.gross_profit.value]);
    expect(values).toEqual([["DTC", "A", "500.00", "540.00", "40.00"], ["DTC", "B", "250.00", "200.00", "-50.00"], ["MARKETPLACE", "A", "270.00", "280.00", "10.00"], ["MARKETPLACE", "B", "180.00", "125.00", "-55.00"]]);
    expect(comparison.rows.reduce((sum, row) => sum + parseCents(row.changes.gross_profit.value)!, 0n)).toBe(-5500n);
    expect(comparison.rows.every(row => row.activity === "both_observed")).toBe(true);
    expect(JSON.stringify(comparison)).not.toMatch(/ad_spend|platform_fees|contribution_after_marketing/);
  });

  it("聯集保留只在一期間出現的 SKU；已確認涵蓋範圍的無列才是零，明確零列仍是 observed", () => {
    const input = withSales([sale(aug1, "EXIT", "100", "40"), sale(aug2, "ENTER", "50", "10"), sale(aug1, "ZERO", "0", "0"), sale(aug2, "ZERO", "0", "0")]);
    const rows = compareProducts(dataset(input)).rows;
    expect(rows.map(row => [row.sku, row.activity, row.previous.presence, row.current.presence, row.changes.gross_profit.value])).toEqual([
      ["ENTER", "current_only", "no_rows_confirmed", "observed", "40.00"],
      ["EXIT", "previous_only", "observed", "no_rows_confirmed", "-60.00"],
      ["ZERO", "both_observed", "observed", "observed", "0.00"],
    ]);
    expect(rows[0].previous.sources).toContainEqual({ file: "manifest.json", line: null, channel: "DTC", sku: "ENTER" });
    expect(rows[1].current.metrics.gross_margin.value).toBeNull();
  });

  it("未確認銷售完整性時無列與已觀察列皆不冒充完整毛利；保留未知原因", () => {
    const rows = compareProducts(dataset(withSales([sale(aug2, "ENTER", "50", "10")], false))).rows;
    expect(rows[0].activity).toBe("coverage_unknown");
    expect(rows[0].previous.presence).toBe("unknown_coverage");
    expect(rows[0].current.presence).toBe("observed");
    expect(rows[0].previous.metrics.gross_profit.value).toBeNull();
    expect(rows[0].current.metrics.gross_profit.value).toBeNull();
    expect(rows[0].changes.gross_profit).toEqual({ value: null, reason_codes: ["SALES_COVERAGE_UNCONFIRMED"] });
  });

  it("缺成本保留可算營收差；GP 差 null，未知不被負毛利篩選當零或負數", () => {
    const rows = compareProducts(dataset(fixture("errors/missing_cogs"))).rows;
    const affected = rows.find(row => row.current.metrics.cogs_net.value === null)!;
    expect(affected.changes.net_revenue.value).not.toBeNull();
    expect(affected.changes.gross_profit.value).toBeNull();
    expect(affected.changes.gross_profit.reason_codes).toContain("MISSING_COGS");
    expect(selectProductComparisonRows(rows, { negativeOnly: true })).not.toContain(affected);
    expect(selectProductComparisonRows(rows, { sort: "gross_profit_change", direction: "ascending" }).at(-1)).toBe(affected);
    expect(selectProductComparisonRows(rows, { sort: "gross_profit_change", direction: "descending" }).at(-1)).toBe(affected);
  });

  it("純退款與負成本回沖按入帳資料算，不自行二次沖回", () => {
    const row = compareProducts(dataset(withSales([sale(aug1, "REFUND", "100", "40"), sale(aug2, "REFUND", "0", "-40", "100")]))).rows[0];
    expect(row.current.metrics.net_revenue.value).toBe("-100.00");
    expect(row.current.metrics.gross_profit.value).toBe("-60.00");
    expect(row.changes.gross_profit.value).toBe("-120.00");
    expect(row.current.metrics.gross_margin.value).toBeNull();
    expect(selectProductComparisonRows([row], { negativeOnly: true })).toHaveLength(1);
  });

  it("兩期證據分開保存原始行號；通路 filter 不帶入其他通路", () => {
    const row = compareProducts(dataset(), { channels: ["DTC"] }).rows[0];
    expect(row.previous.sources).toEqual([{ file: "sales_daily.csv", line: 2, date: aug1, channel: "DTC", sku: "A" }]);
    expect(row.current.sources).toEqual([{ file: "sales_daily.csv", line: 6, date: aug2, channel: "DTC", sku: "A" }]);
    expect(compareProducts(dataset(), { channels: ["DTC"] }).rows).toHaveLength(2);
  });

  it("精確排序保留超過 Number 可表達的分位差，不改原陣列；null 最後", () => {
    const rows = compareProducts(dataset(withSales([sale(aug2, "Z", "9007199254740993.01", "0"), sale(aug2, "A", "9007199254740993.02", "0"), sale(aug2, "MISSING", "1", "")]))).rows;
    const before = structuredClone(rows);
    expect(selectProductComparisonRows(rows, { sort: "gross_profit_change", direction: "ascending" }).map(row => row.sku)).toEqual(["Z", "A", "MISSING"]);
    expect(selectProductComparisonRows(rows, { sort: "gross_profit_change", direction: "descending" }).map(row => row.sku)).toEqual(["A", "Z", "MISSING"]);
    expect(rows).toEqual(before);
  });

  it("品類與 SKU 關鍵字只篩商品，所有排序有固定 tie-break", () => {
    const rows = compareProducts(dataset()).rows;
    expect(selectProductComparisonRows(rows, { category: "HOME", query: "a", sort: "gross_profit_change", direction: "ascending" }).map(row => `${row.channel}/${row.sku}`)).toEqual(["MARKETPLACE/A", "DTC/A"]);
    expect(selectProductComparisonRows(rows, { query: "NO-SUCH-SKU" })).toEqual([]);
  });

  it("金額差使用精確分位，不把顯示值轉成浮點累加", () => {
    const input = withSales([sale(aug1, "A", "0.10", "0"), sale(aug2, "A", "0.20", "0")]);
    const row = compareProducts(dataset(input)).rows[0];
    expect(row.changes.gross_profit.value).toBe("0.10");
    expect(row.current.metrics.gross_margin.value).toBe("1.000000000000");
  });

  it("完整自然月保留所有日期，商品比率使用合計分子／分母，不平均各日", () => {
    const input = withSales([sale(aug1, "A", "100", "50"), sale("2026-08-31", "A", "900", "90"), sale("2026-09-01", "A", "100", "50")]);
    input.manifest = { ...(input.manifest as object), coverage_end: "2026-09-30", data_as_of: "2026-10-01", comparison_mode: "calendar_months", previous_period: { start: aug1, end: "2026-08-31" }, current_period: { start: "2026-09-01", end: "2026-09-30" } };
    const row = compareProducts(dataset(input)).rows[0];
    expect(row.previous.metrics.gross_profit.value).toBe("860.00");
    expect(row.previous.metrics.gross_margin.value).toBe("0.860000000000");
    expect(row.current.metrics.gross_profit.value).toBe("50.00");
    expect(row.changes.gross_profit.value).toBe("-810.00");
  });

  it("拒絕反向期間、未知通路及 SKU 偷渡至分析 scope", () => {
    const ds = dataset();
    expect(() => compareProducts(ds, { previous_period: ds.manifest.current_period, current_period: ds.manifest.previous_period })).toThrow();
    expect(() => compareProducts(ds, { channels: ["NOT_A_CHANNEL"] })).toThrow();
    expect(() => compareProducts(ds, { sku: "A" } as never)).toThrow("INVALID_PRODUCT_COMPARISON_FILTER");
  });
});

describe("PL-07 比較 CSV 安全且與目前篩選同範圍", () => {
  it("每 SKU 一列，兩期、差額、來源與版本齊全，資料不得變成試算表公式", async () => {
    const input = withSales([sale(aug1, "=1+1", "100", "40"), sale(aug2, "=1+1", "0", "-40", "100")]);
    const ds = dataset(input);
    const snapshot = await createSnapshot(ds, { channels: ["DTC"] }, await hashInput(input));
    const rows = selectProductComparisonRows(compareProducts(ds, snapshot.report.scope).rows, { negativeOnly: true });
    const csv = exportProductComparisonCsv(ds, snapshot, rows, { query: "=1+1", negativeOnly: true }, { "sales_daily.csv": "銷售.csv" });
    const parsed = parseCsv(csv);
    const keys = parsed.headers.map(csvHeaderKey);
    const record = Object.fromEntries(keys.map((key, index) => [key, parsed.rows[0].values[index]]));
    expect(parsed.rows).toHaveLength(1);
    expect(record).toMatchObject({ sku: "'=1+1", query: "'=1+1", previous_gross_profit: "60.00", current_gross_profit: "-60.00", gross_profit_change: "-120.00", negative_only: "true", metric_version: "contribution-v1", dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, previous_start: aug1, current_start: aug2 });
    expect(record.previous_sources).toContain("銷售.csv");
    expect(record.current_sources).toContain('"line":3');
    expect(keys).not.toContain("ad_spend");
    expect(parsed.headers[keys.indexOf("sku")]).toMatch(/ \(sku\)$/);
  });

  it("未知差額輸出空值加原因；空結果仍保留 filter metadata", async () => {
    const input = fixture("errors/missing_cogs");
    const ds = dataset(input);
    const snapshot = await createSnapshot(ds, {}, await hashInput(input));
    const rows = compareProducts(ds).rows.filter(row => row.changes.gross_profit.value === null);
    const parsed = parseCsv(exportProductComparisonCsv(ds, snapshot, rows, {}));
    const record = Object.fromEntries(parsed.headers.map((header, index) => [csvHeaderKey(header), parsed.rows[0].values[index]]));
    expect(record.gross_profit_change).toBe("");
    expect(record.gross_profit_change_reasons).toContain("MISSING_COGS");
    const empty = parseCsv(exportProductComparisonCsv(ds, snapshot, [], { query: "NOT_FOUND" }));
    expect(empty.rows).toHaveLength(1);
    const emptyKeys = empty.headers.map(csvHeaderKey);
    expect(empty.rows[0].values[emptyKeys.indexOf("row_type")]).toBe("selection");
    expect(empty.rows[0].values[emptyKeys.indexOf("query")]).toBe("NOT_FOUND");
  });
});
