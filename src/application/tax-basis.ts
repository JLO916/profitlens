import Decimal from "decimal.js";
import type { FileName } from "../domain/types";

// R3 含稅換算只在這裡做：逐列 excl = incl ÷ (1 + rate)，ROUND_HALF_UP 到兩位小數。
// 空白與非數字原樣保留（交給 validation 回報）；換算後的字串仍符合 DATA_CONTRACT 的兩位小數十進位格式，
// 進入 src/domain 的資料與 metric_version 都不變。原值與換算值由呼叫端寫進來源抽屜、匯出與備份。

export const DEFAULT_TAX_RATE = "0.05";
export const MAX_TAX_RATE = "0.20";
const AMOUNT_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const RATE_PATTERN = /^\d+(?:\.\d{1,2})?$/;
// clone 只保存數學設定，不更改 Decimal 的全域設定；位數超過 40 位的金額依長度放大精度，避免除法先被截斷。
const TaxDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
function exact(value: string | number): Decimal {
  const digits = String(value).replace(/[^0-9]/g, "").length;
  return digits + 20 > 40 ? new (Decimal.clone({ precision: digits + 20, rounding: Decimal.ROUND_HALF_UP }))(value) : new TaxDecimal(value);
}

export type AmountBasisChoice = "exclusive" | "inclusive" | "unknown";
/** 寫入 PreparedImport／備份／匯出的換算摘要；basis 為 exclusive 時整個物件為 null。 */
export interface TaxConversion { basis: "inclusive"; rate: string; fields: string[]; rows_converted: number; totals?: Record<string, { raw: string; converted: string }> }
/** 原值：檔案 → 行號 → 欄位 → 含稅原值；只記錄真的被換算的格子。 */
export type RawValues = Record<number, Record<string, string>>;
export type RawValuesByFile = Partial<Record<FileName, RawValues>>;

export const CONVERTIBLE_FIELDS: Record<FileName, readonly string[]> = {
  "sales_daily.csv": ["gross_sales", "discounts", "refunds", "cogs_net"],
  "channel_costs_daily.csv": ["platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs"],
  "ad_spend_daily.csv": ["ad_spend"],
};
/** D2＝A：預設勾選除 cogs_net 以外的金額欄（進貨成本多半已是未稅）。 */
export const DEFAULT_CONVERSION_FIELDS: Record<FileName, readonly string[]> = {
  "sales_daily.csv": ["gross_sales", "discounts", "refunds"],
  "channel_costs_daily.csv": [...CONVERTIBLE_FIELDS["channel_costs_daily.csv"]],
  "ad_spend_daily.csv": ["ad_spend"],
};

export function isValidTaxRate(rate: string): boolean {
  return RATE_PATTERN.test(rate) && new TaxDecimal(rate).gte(0) && new TaxDecimal(rate).lte(MAX_TAX_RATE);
}
/** 表單輸入整數百分比（0–20）→ 稅率字串；不合法回 null。 */
export function percentToRate(percent: string): string | null {
  if (!/^\d{1,2}$/.test(percent.trim())) return null;
  const rate = new TaxDecimal(percent.trim()).div(100).toFixed(2);
  return isValidTaxRate(rate) ? rate : null;
}
export function rateToPercent(rate: string): string {
  return new TaxDecimal(rate).mul(100).toFixed(0);
}
function divisor(rate: string): Decimal {
  if (!isValidTaxRate(rate)) throw new RangeError("INVALID_TAX_RATE");
  return new TaxDecimal(1).plus(rate);
}

/** 單一格子：合法金額字串才換算，其餘原樣回傳。 */
export function convertInclusiveAmount(value: string, rate: string): string {
  const base = divisor(rate);
  if (!AMOUNT_PATTERN.test(value)) return value;
  const converted = exact(value).div(base).toFixed(2, Decimal.ROUND_HALF_UP);
  return converted === "-0.00" ? "0.00" : converted;
}

export interface ConvertibleCsv { headers: string[]; rows: { line: number; values: string[] }[] }
export interface ConvertedCsv extends ConvertibleCsv { rows_converted: number; raw: RawValues }
/** 只換算指定欄位；回傳新陣列（不改輸入），並附上每列被換算格子的原值。 */
export function convertInclusiveRows(csv: ConvertibleCsv, fields: readonly string[], rate: string): ConvertedCsv {
  divisor(rate);
  const columns = fields.map(field => {
    const index = csv.headers.indexOf(field);
    if (index < 0) throw new RangeError(`UNKNOWN_CONVERSION_COLUMN:${field}`);
    return { field, index };
  });
  const raw: RawValues = {};
  let rows_converted = 0;
  const rows = csv.rows.map(row => {
    const values = [...row.values];
    let touched = false;
    for (const { field, index } of columns) {
      const value = values[index] ?? "";
      if (!AMOUNT_PATTERN.test(value)) continue;
      values[index] = convertInclusiveAmount(value, rate);
      (raw[row.line] ??= {})[field] = value;
      touched = true;
    }
    if (touched) rows_converted += 1;
    return { ...row, values };
  });
  return { headers: csv.headers, rows, rows_converted, raw };
}

/** 逐列換算後加總 vs 合計後再換算：兩者可差一分，產品一律採逐列（與來源行號一一對應）。 */
export function sumConvertedRows(values: readonly string[], rate: string): { perRow: string; afterTotal: string } {
  const base = divisor(rate);
  const numeric = values.filter(value => AMOUNT_PATTERN.test(value));
  const width = numeric.reduce((max, value) => Math.max(max, value.length), 0) + numeric.length;
  const Sum = Decimal.clone({ precision: width + 40, rounding: Decimal.ROUND_HALF_UP });
  const perRow = numeric.reduce((total, value) => total.plus(convertInclusiveAmount(value, rate)), new Sum(0));
  const total = numeric.reduce((sum, value) => sum.plus(value), new Sum(0));
  return { perRow: perRow.toFixed(2), afterTotal: total.div(base).toFixed(2, Decimal.ROUND_HALF_UP) };
}
