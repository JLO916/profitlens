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
  /** true only after a de-identified REAL export file was run through detectPreset + suggestMapping. */
  verified: boolean;
  verifiedAt: string | null;
  verification: string;
  /**
   * Evidence level behind the header names:
   * "none" = spec table / guesses; "api_docs" = header names taken from the platform's official API field
   * descriptions (not an export file); "public_docs" = header rows reconstructed from the platform's public
   * documentation / official screenshots (sources in evidenceSources, sample in tests/fixtures/source-samples);
   * "real_export" = a de-identified real export was run through detectPreset + suggestMapping (verified).
   */
  evidence: "none" | "api_docs" | "public_docs" | "real_export";
  evidenceSources: string[];
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
    verified: false, verifiedAt: null, verification: UNVERIFIED, evidence: "none", evidenceSources: [],
  },
  {
    id: "91app_orders", source: "91APP", grain: "order",
    // TG／TM／TS 三層編號是 91APP 獨有（官方開發者文件與鼎新 A1 逐字使用）；「主單編號」放第一位避免與蝦皮／Cyberbiz 的「訂單編號」相撞。
    fingerprint: ["主單編號", "購物車編號", "訂單編號"],
    targets: [SALES],
    columns: {
      [SALES]: {
        date: ["訂單轉單日", "訂單日期", "交易日期"], channel: ["銷售通路", "通路"], sku: ["商品料號", "商店料號", "商品選項(SKU)編號", "SKU"], category: ["商品分類"],
        units_sold: ["商品數量", "數量"], gross_sales: ["商品總金額(單價*數量)", "商品總金額", "商品金額"], discounts: ["訂單總折扣金額", "折扣活動折扣金額", "折價券折扣金額"],
        cogs_net: ["商品總成本(成本*數量)"],
      },
    },
    inclusiveTax: true,
    notes: "Order-line level (one row per 訂單編號 TS inside a 主單 TM); aggregate to day x channel x SKU first (scripts/rules/91app_orders.rules.json). Tax-inclusive per the Admin API (PriceExcludingTax = Price / 1.05). 訂單總折扣金額 is NEGATIVE in the API; the aggregation script takes abs(). Cancelled rows carry 訂單狀態=已取消; refunds live in the separate 退貨單 report. The OSM export lets merchants pick columns, so a real file may lack some of these.",
    verified: false, verifiedAt: null,
    verification: "Header names come from 91APP's official Admin Order API field descriptions and third-party guides (OSM 所有訂單查詢 → 批次匯出資料); no public source shows the export file's header row itself. Still needs one de-identified real export.",
    evidence: "api_docs",
    evidenceSources: ["https://developer.91app.com/zh-tw/apis/admin-order", "https://developer.91app.com/zh-tw/apis/admin-get-invoice-detail", "https://docs.a1erp.digiwin.com/a1ordermanual/04.91app", "https://docs.ezorderly.com/guide/importly/import-materials/shop-platform"],
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
    verified: false, verifiedAt: null, verification: UNVERIFIED, evidence: "none", evidenceSources: [],
  },
  {
    id: "shopee_orders", source: "Shopee", grain: "order",
    // 官方欄位表（賣家中心 教育文章 11911，57 欄）：訂單匯出沒有「買家支付金額」，正確名稱是「買家總支付金額」；
    // 「商品選項貨號」是逐列欄位，用它和進帳報表（沒有貨號欄）區分。
    fingerprint: ["訂單編號", "商品選項貨號", "買家總支付金額"],
    targets: [SALES, COSTS],
    columns: {
      [SALES]: {
        date: ["訂單成立日期"], sku: ["商品選項貨號", "主商品貨號", "蝦皮商品編碼 (商品ID_規格ID)"],
        units_sold: ["數量"], gross_sales: ["商品活動價格", "商品原價"], discounts: ["賣家負擔優惠券", "賣場負擔優惠券", "賣場優惠券", "賣家負擔蝦幣回饋券", "賣家蝦幣回饋券"],
      },
      [COSTS]: {
        date: ["訂單成立日期"], platform_fees: ["成交手續費"], payment_fees: ["金流與系統處理費", "金流服務費"], fulfillment_costs: ["退貨運費"], other_variable_costs: ["其他服務費", "活動服務費"],
      },
    },
    inclusiveTax: true,
    notes: "One row per order line; 商品活動價格 / 商品原價 are UNIT prices (× 數量; the aggregation script's unit_price does this). 商品總價, 買家總支付金額, coupon and fee columns are per ORDER and repeat on every line of the order: never sum them per line. Seller discounts = 賣家負擔優惠券 + 賣家負擔蝦幣回饋券 (per order, allocate to lines). No refund amount column (see 退貨退款報表 / 我的進帳). Rows with 訂單狀態=不成立 are cancelled (except 不成立原因 containing 遺失). The xlsx is password-protected (last 6 digits of the shop phone) — remove the password and save as CSV UTF-8 first.",
    verified: false, verifiedAt: null,
    verification: "Header row reconstructed from Shopee's official field-table image (seller.shopee.tw/edu/article/11911, 2026-03) and cross-checked against three public parsers of real 57-column files; sample in tests/fixtures/source-samples/shopee_orders.csv. Still needs one de-identified real export to flip verified.",
    evidence: "public_docs",
    evidenceSources: ["https://seller.shopee.tw/edu/article/11911", "https://seller.shopee.tw/edu/article/554", "https://github.com/lee2nd/e-commerce-ERP-system-streamlit-app", "https://github.com/rootimes/shopee-dashboard", "https://www.ragic.com/intl/zh-TW/blog/366/free-shopee-reconciling-tool"],
  },
  {
    id: "shopee_income", source: "Shopee", grain: "order",
    // 「錢包入帳日期」「退款編號」每一版進帳報表都有、訂單匯出沒有，所以不會和 shopee_orders 相撞。
    fingerprint: ["訂單編號", "錢包入帳日期", "退款編號"],
    targets: [COSTS],
    columns: {
      [COSTS]: {
        date: ["錢包入帳日期", "撥款完成日期", "撥款日期"], platform_fees: ["成交手續費"], payment_fees: ["金流與系統處理費", "金流服務費"],
        fulfillment_costs: ["蝦皮代付運費", "退貨運費"], other_variable_costs: ["其他服務費", "活動服務費"],
      },
    },
    inclusiveTax: true,
    notes: "我的進帳 → 已撥款 匯出 (Income.進帳.<from>_<to>.xlsx): one row per order per payout; refund rows carry 退款編號 and 買家退款金額. Row date is the PAYOUT date (錢包入帳日期), not the order date. Deductions are exported as NEGATIVE numbers — flip to positive costs when aggregating. The sheet has preamble rows above the header (seller account, period, bank info): delete them so the header is row 1 before saving as CSV. Fee tax basis unconfirmed.",
    verified: false, verifiedAt: null,
    verification: "Only ~10 headers are verbatim in 2023+ official screenshots (article 25893) and one real-file screenshot; the fee/discount column names of 2026 are inferred from the order export. Still needs one de-identified real export.",
    evidence: "public_docs",
    evidenceSources: ["https://seller.shopee.tw/edu/article/312", "https://seller.shopee.tw/edu/article/25893", "https://www.citerp.com.tw/citwordpress/googleexcel001/", "https://www.ragic.com/intl/zh-TW/blog/366/free-shopee-reconciling-tool"],
  },
  {
    id: "momo_settlement", source: "momo 店+", grain: "order",
    // momo 店+（商店）H101商店對帳 → 對帳明細 → 工作表「訂單明細」（2026-04-21 版，官方公告截圖 46 欄 + 1 欄）。
    // 「商品編號」「單筆售價」是逐列欄位，排除同檔的「訂單彙總」工作表；「訂單號碼」避免與蝦皮／91APP 的「訂單編號」相撞。
    fingerprint: ["訂單號碼", "商品編號", "單筆售價"],
    targets: [SALES, COSTS],
    columns: {
      [SALES]: {
        date: ["訂單確認日（出貨日）", "入帳日"], sku: ["商品編號", "商品原廠編號"], units_sold: ["數量"], gross_sales: ["單筆售價"], discounts: ["總折扣金額"],
      },
      [COSTS]: {
        date: ["訂單確認日（出貨日）", "入帳日"], platform_fees: ["成交手續費"],
        payment_fees: ["信用卡手續費", "ATM手續費", "超商付款手續費", "超商貨到付款手續費", "第三方貨到付款手續費", "全額 mo幣/mo點支付手續費"],
        fulfillment_costs: ["超商取貨運費 - 出貨", "第三方物流運費 - 出貨", "超商取貨運費 - 退貨", "第三方物流運費 - 退貨"],
        other_variable_costs: ["發票處理費", "免運活動服務費", "預購商品服務費", "mo點活動贊助金", "物流隱碼服務費", "聯盟行銷費", "假回壓罰款", "代收付客訴爭議費"],
      },
    },
    inclusiveTax: true,
    notes: "momo 店+ marketplace statement, order-line grain inside a monthly 對帳年月 (not the 3P 供應商 SCM statement, whose public header list is unknown and is tax-EXCLUSIVE). The .xls has several sheets; use 訂單明細, whose header is on row 3 (row 2 is a 總金額 totals row) — delete rows 1–2 and save as CSV. 單筆售價 is a UNIT price (× 數量); 總折扣金額 is the store-funded discount per line; sales amounts are tax-inclusive (bulletin reconciliation 未稅＋營業稅＝總計(含稅)); fee tax basis inferred. Returns appear as 訂單狀態 and in the 已退款明細 sheet; mo點／全站抵用券 portions are platform tenders, not seller discounts.",
    verified: false, verifiedAt: null,
    verification: "Header row reconstructed from momo's official bulletin screenshots (rules.momo.com.tw/bulletin/00016, 2026-04-21 layout) and cross-checked against a public parser calibrated on a real 2026 file; sample in tests/fixtures/source-samples/momo_store_plus.csv. Still needs one de-identified real export (and a separate SCM 供應商 preset once its headers are known).",
    evidence: "public_docs",
    evidenceSources: ["https://rules.momo.com.tw/bulletin/00016/", "https://rules.momo.com.tw/payment/00012/", "https://rules.momo.com.tw/guide/00027/", "https://github.com/kelly83117/ec-dashboard"],
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
    verified: false, verifiedAt: null, verification: UNVERIFIED, evidence: "none", evidenceSources: [],
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
    verified: false, verifiedAt: null, verification: UNVERIFIED, evidence: "none", evidenceSources: [],
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
    verified: false, verifiedAt: null, verification: UNVERIFIED, evidence: "none", evidenceSources: [],
  },
];
