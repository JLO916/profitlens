/**
 * Taiwan source presets (04_IMPORT_TW §4.2) — CANDIDATE header mappings, NOT VERIFIED.
 *
 * verified: false — every preset in this file is `verified: false`, `verifiedAt: null`.
 * The fingerprints and candidate column names come from the spec table and public knowledge
 * of each platform's export; none has been checked against a real export file yet.
 *
 * Verification method (per preset):
 *   1. Take one de-identified real export of that report (strip buyer names, phones,
 *      addresses, order IDs if needed; keep the header row and a few rows untouched).
 *   2. Run `detectPreset(headers)` and confirm it returns this preset id.
 *   3. Run `suggestMapping(role, headers, importColumns[role], preset)` for every target file
 *      and check each suggested column against the real meaning of the source column.
 *   4. Fix fingerprints / candidates that do not match, then set `verified: true`,
 *      `verifiedAt: "YYYY-MM-DD"`, and record the report name and export date in
 *      `verification`. Record the run in `verification/revamp-R3-acceptance.md`.
 *
 * Presets only pre-select a mapping; they never aggregate rows. Order / settlement level
 * exports must first be aggregated to day × channel (× SKU) outside the UI (§4.3).
 *
 * Header names below are data describing external files; user-visible copy (report names,
 * hints) lives in `src/i18n/labels.zh-TW.ts`, keyed by preset id.
 */
import type { FileName } from "@/domain/types";

export type PresetGrain = "order" | "settlement" | "daily_campaign";

export type SourcePresetId =
  | "shopline_orders" | "91app_orders" | "cyberbiz_orders" | "shopee_orders" | "shopee_income"
  | "momo_settlement" | "pchome_settlement" | "meta_ads" | "google_ads";

export interface SourcePreset {
  id: SourcePresetId;
  /** Platform name (proper noun). The localized report name is in labels, keyed by `id`. */
  source: string;
  grain: PresetGrain;
  /** 2–3 header names; a header row containing at least two of them is treated as this source. */
  fingerprint: string[];
  targets: FileName[];
  /** standard field → candidate source header names, in preference order, per target file. */
  columns: Partial<Record<FileName, Record<string, string[]>>>;
  /** Whether amounts in this export are expected to include 5% business tax (hint only). */
  inclusiveTax: boolean;
  notes: string;
  verified: false;
  verifiedAt: null;
  verification: string;
}

const UNVERIFIED =
  "Not verified. Method: run one de-identified real export through detectPreset + suggestMapping, " +
  "check every suggested column, then set verified/verifiedAt and record the report name here.";

const SALES: FileName = "sales_daily.csv";
const COSTS: FileName = "channel_costs_daily.csv";
const ADS: FileName = "ad_spend_daily.csv";

export const SOURCE_PRESETS: readonly SourcePreset[] = [
  {
    id: "shopline_orders", source: "Shopline", grain: "order",
    fingerprint: ["訂單號碼", "訂單日期", "商品貨號"],
    targets: [SALES],
    columns: {
      [SALES]: {
        date: ["訂單日期"], channel: ["銷售渠道", "訂單來源"], sku: ["商品貨號"], category: ["商品分類"],
        units_sold: ["數量"], gross_sales: ["商品原價小計", "商品小計"], discounts: ["優惠折扣", "折扣金額"],
        refunds: ["退款金額"], cogs_net: ["商品成本"], currency: ["幣別"],
      },
    },
    inclusiveTax: true,
    notes: "Order-level; aggregate to day x channel x SKU first. Tax-inclusive. Discounts are at order level and need allocation.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "91app_orders", source: "91APP", grain: "order",
    fingerprint: ["訂單編號", "交易日期", "SKU"],
    targets: [SALES],
    columns: {
      [SALES]: {
        date: ["交易日期"], channel: ["銷售通路", "通路"], sku: ["SKU", "商品料號"], category: ["商品分類"],
        units_sold: ["數量"], gross_sales: ["商品金額", "售價小計"], discounts: ["折扣金額", "折價券折抵"],
        refunds: ["退款金額"], currency: ["幣別"],
      },
    },
    inclusiveTax: true,
    notes: "Order-level; aggregate to day x channel x SKU first. Tax-inclusive.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "cyberbiz_orders", source: "Cyberbiz", grain: "order",
    fingerprint: ["訂單編號", "建立時間", "商品代碼"],
    targets: [SALES],
    columns: {
      [SALES]: {
        date: ["訂單日期", "建立時間"], channel: ["銷售通路"], sku: ["商品代碼"], category: ["商品分類"],
        units_sold: ["數量"], gross_sales: ["商品金額", "小計"], discounts: ["折扣金額", "優惠金額"],
        refunds: ["退款金額"], currency: ["幣別"],
      },
    },
    inclusiveTax: true,
    notes: "Order-level; aggregate first. Tax-inclusive. 建立時間 is a timestamp and must be reduced to YYYY-MM-DD (Asia/Taipei).",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "shopee_orders", source: "Shopee", grain: "order",
    fingerprint: ["訂單編號", "商品名稱", "買家支付金額"],
    targets: [SALES],
    columns: {
      [SALES]: {
        date: ["訂單成立日期", "訂單成立時間"], sku: ["商品選項貨號", "主商品貨號"], category: ["商品分類"],
        units_sold: ["數量"], gross_sales: ["商品原價", "商品總價"], discounts: ["賣場優惠券", "賣家折扣"],
        refunds: ["退款金額"], currency: ["幣別"],
      },
    },
    inclusiveTax: true,
    notes: "Order-level; aggregate first. Tax-inclusive. 買家支付金額 is after discounts and is NOT gross_sales. Commission is in the income report (shopee_income).",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "shopee_income", source: "Shopee", grain: "order",
    fingerprint: ["訂單編號", "成交手續費", "金流與系統處理費"],
    targets: [COSTS],
    columns: {
      [COSTS]: {
        date: ["撥款完成日期", "撥款日期"], platform_fees: ["成交手續費"], payment_fees: ["金流與系統處理費"],
        fulfillment_costs: ["運費", "賣家負擔運費"], other_variable_costs: ["活動服務費", "其他費用"], currency: ["幣別"],
      },
    },
    inclusiveTax: true,
    notes: "Order-level income / reconciliation report; aggregate to day x channel first. Fees are tax-inclusive.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "momo_settlement", source: "momo", grain: "settlement",
    fingerprint: ["商品編號", "對帳期間", "銷售金額"],
    targets: [SALES, COSTS],
    columns: {
      [SALES]: { sku: ["商品編號"], units_sold: ["銷售數量", "數量"], gross_sales: ["銷售金額"], refunds: ["退貨金額"], currency: ["幣別"] },
      [COSTS]: { platform_fees: ["抽成金額", "佣金"], other_variable_costs: ["其他費用"], currency: ["幣別"] },
    },
    inclusiveTax: false,
    notes: "Settlement-period grain (對帳期間 is a range, not a date); must be split to days before import. Tax basis unconfirmed.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "pchome_settlement", source: "PChome", grain: "settlement",
    fingerprint: ["訂單編號", "結帳日", "手續費"],
    targets: [SALES, COSTS],
    columns: {
      [SALES]: { date: ["結帳日"], sku: ["商品編號"], units_sold: ["數量"], gross_sales: ["銷售金額", "訂單金額"], refunds: ["退款金額"], currency: ["幣別"] },
      [COSTS]: { date: ["結帳日"], platform_fees: ["手續費"], payment_fees: ["金流手續費"], currency: ["幣別"] },
    },
    inclusiveTax: false,
    notes: "Settlement batch grain; aggregate to day x channel first. Tax basis unconfirmed.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "meta_ads", source: "Meta Ads", grain: "daily_campaign",
    fingerprint: ["Day", "Amount spent (TWD)", "Campaign name"],
    targets: [ADS],
    columns: {
      [ADS]: { date: ["Day", "Reporting starts", "天數"], ad_spend: ["Amount spent (TWD)", "Amount spent", "花費金額 (TWD)"], currency: ["Currency", "幣別"] },
    },
    inclusiveTax: false,
    notes: "Day x campaign; campaigns must be assigned to a sales channel and summed per day. Amount spent normally excludes tax billed on the invoice.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
  {
    id: "google_ads", source: "Google Ads", grain: "daily_campaign",
    fingerprint: ["Day", "Cost", "Campaign"],
    targets: [ADS],
    columns: {
      [ADS]: { date: ["Day", "天"], ad_spend: ["Cost", "費用"], currency: ["Currency code", "Currency", "貨幣代碼"] },
    },
    inclusiveTax: false,
    notes: "Day x campaign; campaigns must be assigned to a sales channel and summed per day. Cost normally excludes tax.",
    verified: false, verifiedAt: null, verification: UNVERIFIED,
  },
];
