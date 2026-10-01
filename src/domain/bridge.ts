import { calculateMetrics, compareMoney } from "./metrics";
import { moneyMetric, subtractAmounts, sumAmounts } from "./money";
import { AMOUNT_FIELDS, type AmountField, type Metric, type Totals } from "./types";

/** 精確金額恆等式；正收入、負費用差異，不作因果解讀或預估收益。 */
export function buildBridge(previous: Totals, current: Totals): {
  components: Record<AmountField, Metric>;
  sum: Metric;
  contribution_change: Metric;
  reconciled: boolean | null;
  interpretation: "observed_amount_changes_not_causality";
} {
  const differences = Object.fromEntries(AMOUNT_FIELDS.map((field) => [
    field,
    field === "gross_sales"
      ? subtractAmounts(current[field], previous[field])
      : subtractAmounts(previous[field], current[field]),
  ])) as Totals;
  const components = Object.fromEntries(AMOUNT_FIELDS.map((field) => [field, moneyMetric(differences[field])])) as Record<AmountField, Metric>;
  const sum = moneyMetric(sumAmounts(AMOUNT_FIELDS.map((field) => differences[field])));
  const contribution_change = compareMoney(
    calculateMetrics(previous).contribution_after_marketing,
    calculateMetrics(current).contribution_after_marketing,
  ).absolute_change;
  return {
    components,
    sum,
    contribution_change,
    reconciled: sum.value === null || contribution_change.value === null ? null : sum.value === contribution_change.value,
    interpretation: "observed_amount_changes_not_causality",
  };
}
