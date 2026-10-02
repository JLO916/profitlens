import Decimal from "decimal.js";
import { uniqueSources } from "../domain/aggregation";
import { formatCents, parseCents } from "../domain/money";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type AmountField, type Dataset, type MetricName, type SourceRef } from "../domain/types";
import { labels } from "../i18n";

export interface MetricDefinition {
  /** 主名稱（頁面、匯出）；來源 labels.metrics */
  label: string;
  /** 短名（卡片、表頭） */
  shortLabel: string;
  /** 白話一句（tooltip） */
  plain: string;
  /** 中文階梯公式 */
  formula: string;
  /** 技術公式（技術細節區） */
  formulaTechnical: string;
  unit: "money" | "percent" | "multiple";
  fields: AmountField[];
}
const revenueFields: AmountField[] = ["gross_sales", "discounts", "refunds"];
const grossProfitFields: AmountField[] = [...revenueFields, "cogs_net"];
const beforeFields: AmountField[] = [...grossProfitFields, ...COST_FIELDS];
const metricShape: Record<MetricName, Pick<MetricDefinition, "unit" | "fields">> = {
  gross_sales: { unit: "money", fields: ["gross_sales"] },
  discounts: { unit: "money", fields: ["discounts"] },
  refunds: { unit: "money", fields: ["refunds"] },
  cogs_net: { unit: "money", fields: ["cogs_net"] },
  platform_fees: { unit: "money", fields: ["platform_fees"] },
  payment_fees: { unit: "money", fields: ["payment_fees"] },
  fulfillment_costs: { unit: "money", fields: ["fulfillment_costs"] },
  other_variable_costs: { unit: "money", fields: ["other_variable_costs"] },
  ad_spend: { unit: "money", fields: ["ad_spend"] },
  net_revenue: { unit: "money", fields: [...revenueFields] },
  gross_profit: { unit: "money", fields: [...grossProfitFields] },
  contribution_before_marketing: { unit: "money", fields: [...beforeFields] },
  contribution_after_marketing: { unit: "money", fields: [...AMOUNT_FIELDS] },
  gross_margin: { unit: "percent", fields: [...grossProfitFields] },
  contribution_margin: { unit: "percent", fields: [...AMOUNT_FIELDS] },
  discount_rate: { unit: "percent", fields: ["discounts", "gross_sales"] },
  refund_ratio: { unit: "percent", fields: ["refunds", "gross_sales", "discounts"] },
  mer: { unit: "multiple", fields: [...revenueFields, "ad_spend"] },
  fulfillment_burden: { unit: "percent", fields: ["fulfillment_costs", ...revenueFields] },
  marketing_burden: { unit: "percent", fields: ["ad_spend", ...revenueFields] },
};

/** Formula and source dependencies for contribution-v1 evidence views. Names and formulas come from labels (R2). */
export const metricDefinitions: Record<MetricName, MetricDefinition> = Object.fromEntries((Object.keys(metricShape) as MetricName[]).map(name => {
  const copy = labels.metrics[name];
  return [name, { label: copy.label, shortLabel: copy.short, plain: copy.plain, formula: copy.formula, formulaTechnical: copy.formulaTechnical, ...metricShape[name] }];
})) as Record<MetricName, MetricDefinition>;

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
