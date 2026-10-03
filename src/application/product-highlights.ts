import { parseCents } from "@/domain/money";
import type { ProductComparisonRow } from "@/domain/product-comparison";
import type { Metric } from "@/domain/types";

// R5-6 商品毛利頁的呈現層：Top／Bottom 小表與「資料狀態」。只排序、挑選既有 domain 的列，
// 不新增任何財務指標；金額比較一律用 parseCents（bigint），不轉 Number。

/** 兩張小表各最多幾列（02 §5）。 */
export const PRODUCT_HIGHLIGHT_LIMIT = 10;
export type ProductDataStatus = "both" | "current_only" | "previous_only" | "cost_unknown" | "coverage_unknown";
/** 比率欄的三種顯示狀態：有值、資料待補、不適用（03 §4 維持兩種空值）。 */
export type RateAvailability = "value" | "missing" | "not_applicable";

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** 與 domain selectProductComparisonRows 相同的固定 tie-break：通路、再 SKU。 */
const identityOrder = (a: ProductComparisonRow, b: ProductComparisonRow) => lexical(a.channel, b.channel) || lexical(a.sku, b.sku);
const compareCents = (a: bigint, b: bigint) => a < b ? -1 : a > b ? 1 : 0;

function valued(rows: readonly ProductComparisonRow[], pick: (row: ProductComparisonRow) => Metric) {
  return rows.flatMap(row => {
    const cents = parseCents(pick(row).value);
    return cents === null ? [] : [{ row, cents }];
  });
}

/**
 * worstCurrent：本期商品毛利有值的列，由小到大取前 limit（同值依通路、SKU）；毛利待補（null）不列入。
 * bestChange：商品毛利差額有值且 > 0 的列，由大到小取前 limit；沒有正差額時是空陣列。
 * 不改原陣列。limit 必須是 ≥ 0 的整數，否則丟 RangeError。
 */
export function productHighlights(rows: readonly ProductComparisonRow[], limit = PRODUCT_HIGHLIGHT_LIMIT): { worstCurrent: ProductComparisonRow[]; bestChange: ProductComparisonRow[] } {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("INVALID_PRODUCT_HIGHLIGHT_LIMIT");
  const worstCurrent = valued(rows, row => row.current.metrics.gross_profit)
    .sort((a, b) => compareCents(a.cents, b.cents) || identityOrder(a.row, b.row))
    .slice(0, limit).map(entry => entry.row);
  const bestChange = valued(rows, row => row.changes.gross_profit)
    .filter(entry => entry.cents > 0n)
    .sort((a, b) => compareCents(b.cents, a.cents) || identityOrder(a.row, b.row))
    .slice(0, limit).map(entry => entry.row);
  return { worstCurrent, bestChange };
}

/**
 * 「資料狀態」欄（取代「資料活動」）：任一期商品毛利因缺成本（MISSING_COGS）無法計算 → cost_unknown；
 * 銷售完整性未確認 → coverage_unknown；其餘依兩期是否有銷售列。CSV 的 activity 欄位不受影響。
 */
export function dataStatus(row: ProductComparisonRow): ProductDataStatus {
  if ([row.previous, row.current].some(period => period.metrics.gross_profit.reason_codes.includes("MISSING_COGS"))) return "cost_unknown";
  if (row.activity === "coverage_unknown") return "coverage_unknown";
  return row.activity === "both_observed" ? "both" : row.activity;
}

/** 毛利率等比率為 null 時，缺資料（MISSING_*、涵蓋未確認、無原因）是「資料待補」，分母 ≤ 0 等是「不適用」。 */
export function rateAvailability(metric: Metric): RateAvailability {
  if (metric.value !== null) return "value";
  const missing = metric.reason_codes.length === 0 || metric.reason_codes.some(reason => reason.startsWith("MISSING") || reason === "SALES_COVERAGE_UNCONFIRMED" || reason === "INVALID_OR_MISSING_METRIC");
  return missing ? "missing" : "not_applicable";
}
