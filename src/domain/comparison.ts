import Decimal from "decimal.js";
import { dayCount } from "./date";
import { parseCents, reasons } from "./money";
import { MONEY_METRICS, type ComparisonMode, type Metric, type MoneyMetrics, type PeriodAnalysis, type PeriodComparison } from "./types";

/** Per-calendar-day amounts are displayed separately; rates and monthly totals never change. */
function dailyMetric(metric: Metric, days: number): Metric {
  const value = parseCents(metric.value);
  if (value === null) return { value: null, reason_codes: metric.reason_codes.length ? [...metric.reason_codes] : ["MISSING_VALUE"] };
  const ExactDecimal = Decimal.clone({ precision: value.toString().length + 40, rounding: Decimal.ROUND_HALF_UP });
  return { value: new ExactDecimal(value.toString()).div(100).div(days).toFixed(2), reason_codes: [...metric.reason_codes] };
}
function dailyChange(previous: Metric, current: Metric, previousDays: number, currentDays: number): Metric {
  const before = parseCents(previous.value), after = parseCents(current.value);
  const reason_codes = reasons(previous.reason_codes, current.reason_codes);
  if (before === null || after === null) return { value: null, reason_codes: reason_codes.length ? reason_codes : ["MISSING_VALUE"] };
  const ExactDecimal = Decimal.clone({ precision: before.toString().length + after.toString().length + 40, rounding: Decimal.ROUND_HALF_UP });
  // Subtract unrounded ratios: do not derive changes from rounded display averages.
  const difference = new ExactDecimal(after.toString()).div(currentDays).minus(new ExactDecimal(before.toString()).div(previousDays)).div(100);
  return { value: difference.toFixed(2), reason_codes };
}
export function comparePeriods(previous: PeriodAnalysis, current: PeriodAnalysis, mode: ComparisonMode): PeriodComparison {
  const previous_days = dayCount(previous.period), current_days = dayCount(current.period);
  return {
    mode, previous_days, current_days,
    previous_daily_average: Object.fromEntries(MONEY_METRICS.map(metric => [metric, dailyMetric(previous.metrics[metric], previous_days)])) as MoneyMetrics,
    current_daily_average: Object.fromEntries(MONEY_METRICS.map(metric => [metric, dailyMetric(current.metrics[metric], current_days)])) as MoneyMetrics,
    daily_average_changes: Object.fromEntries(MONEY_METRICS.map(metric => [metric, dailyChange(previous.metrics[metric], current.metrics[metric], previous_days, current_days)])) as MoneyMetrics,
  };
}
