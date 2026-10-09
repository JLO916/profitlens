import { productIdentityOrder } from "./product-highlights";
import { moneyMetric, parseCents, ratioMetric, subtractAmounts, sumAmounts } from "@/domain/money";
import type { ProductComparisonRow } from "@/domain/product-comparison";
import type { Amount, Metric } from "@/domain/types";

// V4-4 代理 A：G14「商品毛利為負的商品累計」（Pareto）的整理函式 productPareto（PRD §4.1–§4.7 G14、§6.4；CHART_CATALOG G14、§9.2；D-V4-32＝A、D-V4-39＝A）。
// B 級，版本 product-pareto-v1。輸入是商品頁既有的 compareProducts(dataset, snapshot.report.scope).rows（和 product-worst 同一個結果），不新增財務口徑：
// - 只取本期商品毛利（row.current.metrics.gross_profit，domain 的 contribution-v1 值，逐字沿用）有值且 < 0 的列；
//   不像 product-worst 的 worstCurrent 補入非負的列（src/application/product-highlights.ts），沒有負值時 count＝0，呼叫端不渲染 G14；
// - 排序：依 parseCents 由小到大（最負的在前），同值依通路、SKU（productIdentityOrder，與 product-highlights 相同的固定 tie-break）；
// - 真正新產生的數字只有三種：累計（domain 的 sumAmounts 逐筆相加，到分）、負值合計（全部負值列的 sumAmounts）、
//   累計佔比（佔商品毛利為負合計）＝|累計| ÷ |負值合計|：先以 subtractAmounts({ cents: 0n, reason_codes: [] }, x) 把累計與負值合計取反成正的負值額，
//   再呼叫 domain 的 ratioMetric（12 位小數，HALF_UP）。直接 ratioMetric(累計, 負值合計) 時分母為負，ratioMetric 一律回傳 null（docs/METRICS.md 不以負分母製造率指標），
//   所以一定要先取反；取反後分母 > 0，有負值列時佔比不會是 null，末筆恰為 1（100%）。
// - 不做「其他」合併（X38）：rows 是前 limit 筆（圖上的柱），其餘只計數（more），呼叫端寫「另 {n} 個」；allRows 是全部負值列（資料表用，末筆累計＝負值合計、末筆佔比 100%）。
// - 不做 SKU 層扣廣告後貢獻（不分攤通路費用與廣告）。純函式、可序列化（金額一律是到分的精確字串）；不轉 Number、不用浮點。

export const PRODUCT_PARETO_VERSION = "product-pareto-v1" as const;
/** 圖上的柱數上限（PRD §4.4 G14：柱 ≤ 10，加「另 n 個」1 列共 11 × row16＝176 ≤ sm 180）。 */
export const PRODUCT_PARETO_LIMIT = 10;
/** 標題「前 {k} 個佔 {pct}」的 k 上限（CHART_CATALOG G14：k＝min(3, n)）。 */
export const PRODUCT_PARETO_LEAD = 3;
export type ProductParetoMetric = "gross_profit";

/** 一筆商品毛利為負的列。value、row 逐字取自 domain；cumulative、magnitude、share 是 product-pareto-v1 新算出的值。 */
export interface ProductParetoEntry {
  row: ProductComparisonRow;
  /** 本期商品毛利（row.current.metrics.gross_profit，逐字沿用；一定 < 0）。 */
  value: Metric;
  /** 第 1 到第 i 筆的累計（sumAmounts，到分；水準值，負數）。 */
  cumulative: Metric;
  /** 取反後的累計（＝−cumulative，正的負值額）：累計佔比的分子，抽屜「累計佔比」的組成項目。 */
  magnitude: Metric;
  /** 累計佔比（佔商品毛利為負合計）＝ratioMetric(magnitude, totalMagnitude)，12 位小數；末筆恰為 "1.000000000000"。 */
  share: Metric;
}

export interface ProductPareto {
  version: typeof PRODUCT_PARETO_VERSION;
  metric: ProductParetoMetric;
  /** 前 limit 筆（圖上的柱，排序同 allRows；是 allRows 的前段，同一批物件）。 */
  rows: ProductParetoEntry[];
  /** 全部商品毛利為負的列（資料表用；不受 limit 影響）。 */
  allRows: ProductParetoEntry[];
  /** 負值合計（全部負值列的 sumAmounts，到分）；沒有負值時是 "0.00"。 */
  total: Metric;
  /** 取反後的負值合計（＝−total）：累計佔比的分母。 */
  totalMagnitude: Metric;
  /** 商品毛利為負的列數（＝allRows.length）；0 時呼叫端不渲染 G14。 */
  count: number;
  /** 沒畫成柱的列數（count − rows.length），呼叫端寫「另 {n} 個」。 */
  more: number;
}

const ZERO: Amount = { cents: 0n, reason_codes: [] };
const compareCents = (a: bigint, b: bigint) => a < b ? -1 : a > b ? 1 : 0;
/** 取反：0 − x（domain 的 subtractAmounts，保留原因碼）。 */
const negate = (amount: Amount): Amount => subtractAmounts(ZERO, amount);

/**
 * G14 的 B 級整理（product-pareto-v1）。rows 是 compareProducts(...).rows（不改原陣列）；limit 是圖上的柱數（呼叫端傳 PRODUCT_PARETO_LIMIT），
 * 必須是 ≥ 0 的整數，否則丟 RangeError（同 productHighlights）。allRows 永遠是全部負值列，給資料表用。
 */
export function productPareto(rows: readonly ProductComparisonRow[], metric: ProductParetoMetric, limit: number): ProductPareto {
  if (metric !== "gross_profit") throw new TypeError("UNSUPPORTED_PRODUCT_PARETO_METRIC");
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("INVALID_PRODUCT_PARETO_LIMIT");
  const negatives = rows.flatMap(row => {
    const value = row.current.metrics[metric];
    const cents = parseCents(value.value);
    return cents !== null && cents < 0n ? [{ row, value, amount: { cents, reason_codes: [...value.reason_codes] } satisfies Amount }] : [];
  }).sort((a, b) => compareCents(a.amount.cents, b.amount.cents) || productIdentityOrder(a.row, b.row));
  const totalAmount = sumAmounts(negatives.map(entry => entry.amount));
  const totalMagnitude = negate(totalAmount);
  let running: Amount = ZERO;
  const allRows = negatives.map(({ row, value, amount }): ProductParetoEntry => {
    running = sumAmounts([running, amount]);
    const magnitude = negate(running);
    return { row, value: { value: value.value, reason_codes: [...value.reason_codes] }, cumulative: moneyMetric(running), magnitude: moneyMetric(magnitude), share: ratioMetric(magnitude, totalMagnitude) };
  });
  const shown = allRows.slice(0, limit);
  return {
    version: PRODUCT_PARETO_VERSION, metric, rows: shown, allRows,
    total: moneyMetric(totalAmount), totalMagnitude: moneyMetric(totalMagnitude),
    count: allRows.length, more: allRows.length - shown.length,
  };
}

/**
 * 標題「{n} 個商品毛利為負，前 {k} 個佔 {pct}」用的那一筆：k＝min(PRODUCT_PARETO_LEAD, count)，回傳第 k 筆（它的 share 就是 pct）；
 * 沒有負值時回傳 null。只挑選既有值，不另算。
 */
export function productParetoLead(pareto: Pick<ProductPareto, "allRows" | "count">): { k: number; entry: ProductParetoEntry } | null {
  const k = Math.min(PRODUCT_PARETO_LEAD, pareto.count);
  return k === 0 ? null : { k, entry: pareto.allRows[k - 1] };
}
