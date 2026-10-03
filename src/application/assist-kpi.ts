import Decimal from "decimal.js";
import type { Count, Metric, MetricName, SourceRef, Summary } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { formatMoney, formatRate, metricDefinitions } from "./presentation";

// R4 輔助指標（assist-kpi-v1）：給經理人熟悉的數字，明確標示「輔助」，不混入財務核心。
// 件數來自 domain 的 Summary.units_sold（R4 加法）；件均淨營收在這裡算；其餘五個沿用既有 domain 比率，只做呈現。
// 版本獨立於 metric_version（contribution-v1 不變）。

export const ASSIST_KPI_VERSION = "assist-kpi-v1" as const;
export type AssistKpiId = "units_sold" | "net_revenue_per_unit" | "marketing_burden" | "mer" | "gross_margin" | "refund_ratio" | "fulfillment_burden";
export const ASSIST_KPI_IDS: readonly AssistKpiId[] = ["units_sold", "net_revenue_per_unit", "marketing_burden", "mer", "gross_margin", "refund_ratio", "fulfillment_burden"];
export type AssistUnit = "count" | "money_per_unit" | "percent" | "multiple";
export interface AssistKpi {
  id: AssistKpiId;
  label: string; shortLabel: string; plain: string; formula: string; formulaTechnical: string;
  unit: AssistUnit;
  /** 系統原值（整數字串／兩位小數／12 位比率），null 表示缺漏或不適用。 */
  value: string | null;
  display: string;
  status: "ok" | "missing" | "not_applicable";
  reason_codes: string[];
  sources: SourceRef[];
  /** 既有 domain 指標才有，供「怎麼算的」抽屜使用；新指標沒有。 */
  metric?: MetricName;
}

const PerUnitDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
/** 件均淨營收＝淨營收 ÷ 售出件數，ROUND_HALF_UP 兩位；件數 ≤ 0 → ZERO_UNITS；任一缺 → 沿用缺漏原因。 */
export function netRevenuePerUnit(net: Metric, units: Count): Metric {
  if (net.value === null || units.value === null) {
    const reason_codes = [...new Set([...(net.value === null ? net.reason_codes : []), ...(units.value === null ? units.reason_codes : [])])].sort();
    return { value: null, reason_codes: reason_codes.length ? reason_codes : ["MISSING_VALUE"] };
  }
  if (units.value <= 0n) return { value: null, reason_codes: ["ZERO_UNITS"] };
  return { value: new PerUnitDecimal(net.value).div(units.value.toString()).toFixed(2, Decimal.ROUND_HALF_UP), reason_codes: [] };
}

/** 與總覽 KPI 卡同規則：缺資料（MISSING_*／涵蓋未確認）才是「資料待補」，其餘的 null（分母 ≤ 0、件數 0、淨營收 ≤ 0）都是「不適用」。 */
function status(value: string | null, reason_codes: readonly string[]): AssistKpi["status"] {
  if (value !== null) return "ok";
  return reason_codes.length === 0 || reason_codes.some(reason => reason.startsWith("MISSING") || reason === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "not_applicable";
}
function display(unit: AssistUnit, value: string | null, state: AssistKpi["status"]): string {
  if (value === null) return state === "not_applicable" ? labels.assist.notApplicable : labels.status.missing;
  switch (unit) {
    case "count": return fill(labels.assist.units.count, { value: new Decimal(value).toFixed(0) });
    case "money_per_unit": return fill(labels.assist.units.perUnit, { value: formatMoney(value) });
    case "percent": return formatRate(value);
    case "multiple": return `${new Decimal(value).toFixed(2, Decimal.ROUND_HALF_UP)} ${labels.evidence.times}`;
  }
}
function existing(id: Extract<AssistKpiId, MetricName>, summary: Summary, unit: AssistUnit): AssistKpi {
  const metric = summary.metrics[id], definition = metricDefinitions[id], state = status(metric.value, metric.reason_codes);
  return { id, metric: id, label: definition.label, shortLabel: definition.shortLabel, plain: definition.plain, formula: definition.formula, formulaTechnical: definition.formulaTechnical, unit, value: metric.value, display: display(unit, metric.value, state), status: state, reason_codes: [...metric.reason_codes], sources: summary.sources };
}

/** 七格輔助指標（05 §1 表）；每格可開「怎麼算的」（來源列沿用該期間摘要）。 */
export function assistKpis(summary: Summary): AssistKpi[] {
  const units = summary.units_sold;
  const unitsValue = units.value === null ? null : units.value.toString();
  const unitsState = status(unitsValue, units.reason_codes);
  const perUnit = netRevenuePerUnit(summary.metrics.net_revenue, units);
  const perUnitState = status(perUnit.value, perUnit.reason_codes);
  const copy = labels.assist.items;
  return [
    { id: "units_sold", label: copy.units_sold.label, shortLabel: copy.units_sold.short, plain: copy.units_sold.plain, formula: copy.units_sold.formula, formulaTechnical: copy.units_sold.formulaTechnical, unit: "count", value: unitsValue, display: display("count", unitsValue, unitsState), status: unitsState, reason_codes: [...units.reason_codes], sources: summary.sources },
    { id: "net_revenue_per_unit", label: copy.net_revenue_per_unit.label, shortLabel: copy.net_revenue_per_unit.short, plain: copy.net_revenue_per_unit.plain, formula: copy.net_revenue_per_unit.formula, formulaTechnical: copy.net_revenue_per_unit.formulaTechnical, unit: "money_per_unit", value: perUnit.value, display: display("money_per_unit", perUnit.value, perUnitState), status: perUnitState, reason_codes: perUnit.reason_codes, sources: summary.sources },
    existing("marketing_burden", summary, "percent"),
    existing("mer", summary, "multiple"),
    existing("gross_margin", summary, "percent"),
    existing("refund_ratio", summary, "percent"),
    existing("fulfillment_burden", summary, "percent"),
  ];
}
