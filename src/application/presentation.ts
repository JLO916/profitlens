import Decimal from "decimal.js";
import { uniqueSources } from "../domain/aggregation";
import { formatCents, parseCents } from "../domain/money";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type AmountField, type Dataset, type MetricName, type SourceRef } from "../domain/types";

export interface MetricDefinition {
  label: string;
  formula: string;
  unit: "money" | "percent" | "multiple";
  fields: AmountField[];
}
const revenueFields: AmountField[] = ["gross_sales", "discounts", "refunds"];
const grossProfitFields: AmountField[] = [...revenueFields, "cogs_net"];
const beforeFields: AmountField[] = [...grossProfitFields, ...COST_FIELDS];

/** Formula and source dependencies for contribution-v1 evidence views. */
export const metricDefinitions: Record<MetricName, MetricDefinition> = {
  gross_sales: { label: "折扣前商品收入", formula: "G = 來源已入帳 gross_sales 合計", unit: "money", fields: ["gross_sales"] },
  discounts: { label: "商品折扣", formula: "D = 來源已入帳 discounts 合計", unit: "money", fields: ["discounts"] },
  refunds: { label: "已入帳退款", formula: "R = 按退款入帳日合計 refunds，不依訂單原始日期重分配", unit: "money", fields: ["refunds"] },
  cogs_net: { label: "銷貨成本淨額", formula: "C = 來源已入帳 cogs_net 合計；負值為來源實際成本沖回", unit: "money", fields: ["cogs_net"] },
  platform_fees: { label: "平台費用", formula: "P = 每日通路 platform_fees 合計，每日通路只計一次", unit: "money", fields: ["platform_fees"] },
  payment_fees: { label: "金流費用", formula: "Q = 每日通路 payment_fees 合計，每日通路只計一次", unit: "money", fields: ["payment_fees"] },
  fulfillment_costs: { label: "履約費用", formula: "F = 每日通路 fulfillment_costs 合計，每日通路只計一次", unit: "money", fields: ["fulfillment_costs"] },
  other_variable_costs: { label: "其他變動成本", formula: "O = 每日通路 other_variable_costs 合計，不含其他欄已列成本", unit: "money", fields: ["other_variable_costs"] },
  ad_spend: { label: "廣告費", formula: "A = 每日銷售目的通路 ad_spend 合計，不分攤到 SKU", unit: "money", fields: ["ad_spend"] },
  net_revenue: { label: "商品淨營收", formula: "N = G − D − R（折扣前收入 − 折扣 − 已入帳退款）", unit: "money", fields: [...revenueFields] },
  gross_profit: { label: "商品毛利", formula: "GP = N − C（商品淨營收 − 已入帳銷貨成本淨額）", unit: "money", fields: [...grossProfitFields] },
  contribution_before_marketing: { label: "行銷前貢獻", formula: "CM_before = GP − P − Q − F − O", unit: "money", fields: [...beforeFields] },
  contribution_after_marketing: { label: "行銷後貢獻", formula: "CM_after = GP − P − Q − F − O − A；不是公司淨利", unit: "money", fields: [...AMOUNT_FIELDS] },
  gross_margin: { label: "商品毛利率", formula: "GP / N；N > 0 才定義；先合計分子分母再相除", unit: "percent", fields: [...grossProfitFields] },
  contribution_margin: { label: "行銷後貢獻率", formula: "CM_after / N；N > 0 才定義；先合計分子分母再相除", unit: "percent", fields: [...AMOUNT_FIELDS] },
  discount_rate: { label: "折扣率", formula: "D / G；G > 0 才定義；不平均各列百分比", unit: "percent", fields: ["discounts", "gross_sales"] },
  refund_ratio: { label: "退款金額比", formula: "R / (G − D)；G − D > 0 才定義；不是件數退貨率或 cohort 最終退款率", unit: "percent", fields: ["refunds", "gross_sales", "discounts"] },
  mer: { label: "混合行銷效率 MER", formula: "N / A；N > 0 且 A > 0 才定義；不是 ROAS，不提供媒體歸因", unit: "multiple", fields: [...revenueFields, "ad_spend"] },
  fulfillment_burden: { label: "履約費用占淨營收比", formula: "F / N；N > 0 才定義；不平均各列百分比", unit: "percent", fields: ["fulfillment_costs", ...revenueFields] },
  marketing_burden: { label: "廣告費占淨營收比", formula: "A / N；N > 0 才定義；不提供因果或媒體歸因", unit: "percent", fields: ["ad_spend", ...revenueFields] },
};

function amount(value: string | null): bigint | null {
  try { return parseCents(value); } catch { return null; }
}
export function formatMoney(value: string | null): string {
  const cents = amount(value);
  if (cents === null) return "—";
  const [integer, fractional] = formatCents(cents).split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fractional}`;
}
export function formatSignedMoney(value: string | null): string {
  const cents = amount(value);
  return `${cents !== null && cents > 0n ? "+" : ""}${formatMoney(value)}`;
}
export function formatRate(value: string | null): string {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "N/A";
  const ExactDecimal = Decimal.clone({ precision: value.length + 20, rounding: Decimal.ROUND_HALF_UP });
  const formatted = new ExactDecimal(value).times(100).toFixed(2);
  return `${formatted === "-0.00" ? "0.00" : formatted}%`;
}

export interface EvidenceRow extends SourceRef {
  values: Record<string, string | null>;
  missing: boolean;
}
/** Serialize source booked values only; missing rows/fields stay visibly null. */
export function evidenceRows(dataset: Dataset, sources: readonly SourceRef[]): EvidenceRow[] {
  const known = new Map<string, Dataset["sales"][number] | Dataset["costs"][number] | Dataset["ads"][number]>();
  for (const row of [...dataset.sales, ...dataset.costs, ...dataset.ads]) known.set(JSON.stringify([row.source.file, row.source.line]), row);
  return uniqueSources(sources).map(source => {
    if (source.file === "manifest.json") {
      return { ...source, missing: false, values: Object.fromEntries(Object.entries(dataset.manifest).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) };
    }
    const row = source.line === null ? undefined : known.get(JSON.stringify([source.file, source.line]));
    if (row) {
      const values = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "source").map(([key, value]) => [key,
        value === null ? null : typeof value === "bigint" ? key === "units_sold" ? value.toString() : formatCents(value) : String(value),
      ]));
      return { ...source, date: row.date, channel: row.channel, ...("sku" in row ? { sku: row.sku } : {}), missing: false, values };
    }
    const fields = source.file === "sales_daily.csv" ? ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"] : source.file === "channel_costs_daily.csv" ? ["date", "channel", ...COST_FIELDS, "currency"] : ["date", "channel", "ad_spend", "currency"];
    const values: Record<string, string | null> = Object.fromEntries(fields.map(field => [field, null]));
    if (source.date) values.date = source.date;
    if (source.channel) values.channel = source.channel;
    if (source.sku) values.sku = source.sku;
    return { ...source, missing: true, values };
  });
}
