import { z } from "zod";
import { AMOUNT_FIELDS, type MetricName, type Period } from "../domain/types";
import { dayCount, isBusinessDate } from "../domain/date";

export const AI_SNAPSHOT_VERSION = "ai-snapshot-v1" as const;
export interface AiFact {
  id: string;
  kind: "metric";
  metric: MetricName;
  period: "previous" | "current";
  scope: "selected_channels";
  value: string | null;
  reason_codes: string[];
  source_refs: { role: "sales" | "channel_costs" | "ad_spend" | "manifest"; rows: number; missing_rows: number }[];
}
export interface AiSnapshot {
  schema_version: typeof AI_SNAPSHOT_VERSION;
  snapshot_id: string;
  currency: "TWD";
  metric_version: "contribution-v1";
  data_as_of: string;
  periods: { previous: Period; current: Period };
  filters: { channels: string[] };
  data_quality: { status: "complete" | "partial"; missing_fact_ids: string[] };
  facts: AiFact[];
}
export interface InsightOutput {
  snapshot_id: string;
  insights: {
    fact_ids: string[];
    observation: string;
    hypotheses: string[];
    recommended_action: string;
    owner_role: string;
    verification_metric: string;
    stop_condition: string;
    additional_data_needed: string[];
    limitations: string[];
  }[];
  limitations: string[];
}
export const AI_METRIC_NAMES = [...AMOUNT_FIELDS, "net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "gross_margin", "contribution_margin", "discount_rate", "refund_ratio", "mer", "fulfillment_burden", "marketing_burden"] as const;
export const AI_MONEY_METRICS: readonly MetricName[] = AI_METRIC_NAMES.slice(0, 13);
const reasonCodes = [
  "MISSING_VALUE", "INVALID_OR_MISSING_METRIC", "NON_POSITIVE_DENOMINATOR", "NON_POSITIVE_NET_REVENUE",
  "SALES_COVERAGE_UNCONFIRMED", "MISSING_COGS", "MISSING_AD_DAY", "MISSING_CHANNEL_COST_DAY",
  ...AMOUNT_FIELDS.map(field => `MISSING_${field.toUpperCase()}`),
];
const businessDate = z.string().refine(isBusinessDate, "日期格式或日曆日期不合法");
const periodSchema = z.object({ start: businessDate, end: businessDate }).strict().refine(period => period.start <= period.end, "起日不得晚於迄日");
const factId = z.string().regex(/^F\d{3}$/);
const numericString = z.string().max(256).regex(/^-?\d+(?:\.\d{1,12})?$/);
const sourceSchema = z.object({ role: z.enum(["sales", "channel_costs", "ad_spend", "manifest"]), rows: z.number().int().min(0).max(10_000_000), missing_rows: z.number().int().min(0).max(10_000_000) }).strict();
const factSchema = z.object({
  id: factId, kind: z.literal("metric"), metric: z.enum(AI_METRIC_NAMES), period: z.enum(["previous", "current"]), scope: z.literal("selected_channels"),
  value: numericString.nullable(), reason_codes: z.array(z.string().refine(code => reasonCodes.includes(code), "未知原因代碼")).max(20), source_refs: z.array(sourceSchema).max(4),
}).strict().superRefine((fact, context) => {
  if (fact.value === null && !fact.reason_codes.length) context.addIssue({ code: "custom", path: ["reason_codes"], message: "未知值必須保留原因" });
  if (AI_MONEY_METRICS.includes(fact.metric) && fact.value !== null && !/^-?\d+\.\d{2}$/.test(fact.value)) context.addIssue({ code: "custom", path: ["value"], message: "金額須為精確兩位小數字串" });
  if (new Set(fact.reason_codes).size !== fact.reason_codes.length || new Set(fact.source_refs.map(source => source.role)).size !== fact.source_refs.length) context.addIssue({ code: "custom", message: "來源角色與原因不可重複" });
});

/** Only generated aggregate fields are allowed. No user-provided prose enters this boundary. */
export const AiSnapshotSchema: z.ZodType<AiSnapshot> = z.object({
  schema_version: z.literal(AI_SNAPSHOT_VERSION), snapshot_id: z.string().regex(/^ai-v1:[a-f0-9]{64}:[a-f0-9]{64}:\d{1,16}$/),
  currency: z.literal("TWD"), metric_version: z.literal("contribution-v1"), data_as_of: businessDate,
  periods: z.object({ previous: periodSchema, current: periodSchema }).strict(),
  filters: z.object({ channels: z.array(z.string().regex(/^C\d{2,4}$/)).min(1).max(1000) }).strict(),
  data_quality: z.object({ status: z.enum(["complete", "partial"]), missing_fact_ids: z.array(factId).max(40) }).strict(),
  // v1 deliberately sends the full bounded set, never silently truncates or cherry-picks facts.
  facts: z.array(factSchema).length(40),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.filters.channels.some((alias, index) => alias !== `C${String(index + 1).padStart(2, "0")}`)) context.addIssue({ code: "custom", path: ["filters", "channels"], message: "通路僅能使用連續匿名代號" });
  const combinations = new Set(snapshot.facts.map(fact => `${fact.period}:${fact.metric}`));
  if (combinations.size !== 40 || snapshot.facts.some((fact, index) => fact.id !== `F${String(index + 1).padStart(3, "0")}`)) context.addIssue({ code: "custom", path: ["facts"], message: "前本期指標與匿名 ID 必須唯一完整" });
  const missing = snapshot.facts.filter(fact => AI_MONEY_METRICS.includes(fact.metric) && fact.value === null).map(fact => fact.id);
  if (snapshot.data_quality.status !== (missing.length ? "partial" : "complete") || JSON.stringify(snapshot.data_quality.missing_fact_ids) !== JSON.stringify(missing)) context.addIssue({ code: "custom", path: ["data_quality"], message: "資料完整性必須對應未知金額" });
  try {
    const { previous, current } = snapshot.periods;
    if (dayCount(previous) !== dayCount(current) || !(previous.end < current.start || current.end < previous.start)) context.addIssue({ code: "custom", path: ["periods"], message: "前後期須等長且不重疊" });
  } catch { context.addIssue({ code: "custom", path: ["periods"], message: "期間不合法" }); }
});

const prose = z.string().trim().min(1).max(1000);
/** Original output keys are unchanged; local resource bounds and semantics are additional gates. */
export const InsightOutputSchema: z.ZodType<InsightOutput> = z.object({
  snapshot_id: z.string().min(1).max(180),
  insights: z.array(z.object({
    fact_ids: z.array(factId).min(1).max(3), observation: prose, hypotheses: z.array(prose).min(1).max(3),
    recommended_action: prose, owner_role: prose, verification_metric: prose, stop_condition: prose,
    additional_data_needed: z.array(prose).max(5), limitations: z.array(prose).min(1).max(5),
  }).strict()).min(1).max(3),
  limitations: z.array(prose).min(1).max(5),
}).strict();
