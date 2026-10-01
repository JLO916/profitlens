/** 所有金額以精確整數分保存；格式化只發生在輸出邊界。 */
export type FileName = "sales_daily.csv" | "channel_costs_daily.csv" | "ad_spend_daily.csv";
export type ReasonCode = string;
export interface Period { start: string; end: string }
export type ComparisonMode = "same_days" | "calendar_months";
export interface Manifest {
  schema_version: "1.0";
  dataset_id: string;
  source_type: "synthetic" | "user_provided";
  currency: "TWD";
  timezone: "Asia/Taipei";
  data_as_of: string;
  coverage_start: string;
  coverage_end: string;
  channels: string[];
  comparison_mode?: ComparisonMode;
  previous_period: Period;
  current_period: Period;
  sales_coverage_confirmed: boolean;
  amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income";
}
export interface SourceRef {
  file: FileName | "manifest.json";
  line: number | null;
  date?: string;
  channel?: string;
  sku?: string;
}
export interface ValidationIssue extends SourceRef {
  severity: "blocking" | "partial" | "warning";
  reason_code: ReasonCode;
  field: string;
  message: string;
}
interface BaseRow { date: string; channel: string; currency: "TWD"; source: SourceRef }
export interface SalesRow extends BaseRow {
  sku: string;
  category: string;
  units_sold: bigint | null;
  gross_sales: bigint | null;
  discounts: bigint | null;
  refunds: bigint | null;
  cogs_net: bigint | null;
}
export interface CostRow extends BaseRow {
  platform_fees: bigint | null;
  payment_fees: bigint | null;
  fulfillment_costs: bigint | null;
  other_variable_costs: bigint | null;
}
export interface AdRow extends BaseRow { ad_spend: bigint | null }
export interface Dataset {
  manifest: Manifest;
  sales: SalesRow[];
  costs: CostRow[];
  ads: AdRow[];
  issues: ValidationIssue[];
}
export interface DatasetInput {
  manifest: unknown;
  files: Partial<Record<FileName, string | Uint8Array>>;
  confirmedUnknownColumns?: Partial<Record<FileName, string[]>>;
}
export interface ValidationResult {
  classification: "valid" | "partial" | "blocking";
  dataset: Dataset | null;
  issues: ValidationIssue[];
  unknownColumns: Partial<Record<FileName, string[]>>;
}
export const SALES_FIELDS = ["gross_sales", "discounts", "refunds", "cogs_net"] as const;
export const COST_FIELDS = ["platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs"] as const;
export const AMOUNT_FIELDS = [...SALES_FIELDS, ...COST_FIELDS, "ad_spend"] as const;
export type AmountField = typeof AMOUNT_FIELDS[number];
export interface Amount { cents: bigint | null; reason_codes: ReasonCode[] }
export interface Metric { value: string | null; reason_codes: ReasonCode[] }
export type Totals = Record<AmountField, Amount>;
export type MetricName = AmountField | "net_revenue" | "gross_profit" | "contribution_before_marketing" | "contribution_after_marketing" | "gross_margin" | "contribution_margin" | "discount_rate" | "refund_ratio" | "mer" | "fulfillment_burden" | "marketing_burden";
export type Metrics = Record<MetricName, Metric>;
export const MONEY_METRICS = [...AMOUNT_FIELDS, "net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const;
export type MoneyMetrics = Pick<Metrics, typeof MONEY_METRICS[number]>;
export interface PeriodComparison {
  mode: ComparisonMode;
  previous_days: number;
  current_days: number;
  previous_daily_average: MoneyMetrics;
  current_daily_average: MoneyMetrics;
  daily_average_changes: MoneyMetrics;
}
export const PRODUCT_METRICS = [...SALES_FIELDS, "net_revenue", "gross_profit", "gross_margin", "discount_rate", "refund_ratio"] as const;
export type ProductMetrics = Pick<Metrics, typeof PRODUCT_METRICS[number]>;
export interface Scope { kind: "all" | "channel" | "sku"; channels: string[]; sku?: string; category?: string }
export interface DailyChannel {
  date: string;
  channel: string;
  totals: Totals;
  metrics: Metrics;
  sources: SourceRef[];
}
export interface Summary { totals: Totals; metrics: Metrics; sources: SourceRef[] }
export interface PeriodAnalysis extends Summary { period: Period; daily: DailyChannel[]; daily_complete: boolean; channels: Record<string, Summary> }
export interface ProductRow { channel: string; sku: string; category: string; metrics: ProductMetrics; sources: SourceRef[] }
export interface Fact extends Metric { id: string; metric: MetricName; scope: Scope; period: Period; sources: SourceRef[] }
export type RuleCode = "REV_UP_CM_DOWN" | "NEGATIVE_CHANNEL_CM" | "DISCOUNT_BURDEN_UP" | "REFUND_BURDEN_UP" | "FULFILLMENT_BURDEN_UP" | "MARKETING_BURDEN_UP" | "SKU_NEGATIVE_GP" | "MISSING_CRITICAL_DATA";
export interface Diagnostic {
  id: string;
  code: RuleCode;
  scope: Scope;
  title: string;
  fact_ids: string[];
  hypothesis: string;
  recommendation: string;
  limitations: string[];
  ranking_amount: Metric | null;
}
export interface AnalysisFilters { channels?: string[]; previous_period?: Period; current_period?: Period; comparison_mode?: ComparisonMode }
export interface ProductFilters { period: Period; channels?: string[]; sku?: string; category?: string }
