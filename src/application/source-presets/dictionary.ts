/**
 * Generic header dictionary for files that do not match any source preset (04_IMPORT_TW §4.4).
 *
 * Pre-selection only: a dictionary hit is a suggestion the user still has to confirm in the
 * import wizard. The Chinese strings below are *data* (header names found in external exports),
 * not UI copy; user-visible wording lives in `src/i18n/labels.zh-TW.ts`.
 */

export type StandardField =
  | "date" | "channel" | "sku" | "category" | "units_sold"
  | "gross_sales" | "discounts" | "refunds" | "cogs_net"
  | "platform_fees" | "payment_fees" | "fulfillment_costs" | "other_variable_costs"
  | "ad_spend" | "currency";

/** Exactly the aliases listed in 04_IMPORT_TW §4.4, keyed by the standard field they map to. */
export const HEADER_DICTIONARY: Readonly<Record<StandardField, readonly string[]>> = {
  date: ["日期", "入帳日", "結帳日", "交易日期"],
  channel: ["通路", "銷售通路", "平台", "店別"],
  sku: ["SKU", "商品貨號", "商品代碼", "料號"],
  category: ["品類", "類別", "分類"],
  units_sold: ["件數", "數量", "售出件數", "銷售數量"],
  gross_sales: ["原價收入", "商品金額", "折扣前金額", "銷售金額"],
  discounts: ["折扣", "優惠", "折讓", "折價券"],
  refunds: ["退款", "退貨金額", "退款金額"],
  cogs_net: ["成本", "進貨成本", "商品成本", "銷貨成本"],
  platform_fees: ["平台抽成", "成交手續費", "平台費"],
  payment_fees: ["金流費", "金流手續費", "刷卡手續費"],
  fulfillment_costs: ["物流費", "運費", "出貨費用", "包材"],
  other_variable_costs: ["其他費用", "其他變動費用"],
  ad_spend: ["廣告費", "廣告支出", "花費", "Amount spent", "Cost"],
  currency: ["幣別", "貨幣"],
};

/**
 * Comparison key for a header name: Unicode NFKC (full-width letters/parentheses become
 * half-width), BOM removed, parenthesised content removed (e.g. "Amount spent (TWD)" or
 * "金額（含稅）"), all whitespace removed, lower-cased.
 */
export function headerKey(header: string): string {
  return header
    .normalize("NFKC")
    .replace(/﻿/g, "")
    .replace(/\([^()]*\)/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const dictionaryIndex: ReadonlyMap<string, StandardField> = new Map(
  (Object.entries(HEADER_DICTIONARY) as [StandardField, readonly string[]][])
    .flatMap(([field, aliases]) => aliases.map(alias => [headerKey(alias), field] as const)),
);

/** Standard field suggested by the generic dictionary for a source header, or null when unknown. */
export function dictionaryField(header: string): StandardField | null {
  const key = headerKey(header);
  if (!key) return null;
  return dictionaryIndex.get(key) ?? null;
}
