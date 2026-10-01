import Decimal from "decimal.js";
import { moneyMetric, parseCents, ratioMetric, subtractAmounts } from "./money";
import type { Amount, Metric, Metrics, Totals } from "./types";

/** contribution-v1 管理口徑；各層未知金額只向依賴它的指標傳遞。 */
export function calculateMetrics(totals: Totals): Metrics {
  const netRevenue = subtractAmounts(totals.gross_sales, totals.discounts, totals.refunds);
  const grossProfit = subtractAmounts(netRevenue, totals.cogs_net);
  const beforeMarketing = subtractAmounts(
    grossProfit,
    totals.platform_fees,
    totals.payment_fees,
    totals.fulfillment_costs,
    totals.other_variable_costs,
  );
  const afterMarketing = subtractAmounts(beforeMarketing, totals.ad_spend);
  const mer = ratioMetric(netRevenue, totals.ad_spend);
  // MER additionally requires positive revenue. Negative/zero revenue amounts
  // are retained above; they never become an apparently meaningful MER.
  if (netRevenue.cents !== null && netRevenue.cents <= 0n) {
    mer.value = null;
    mer.reason_codes = [...new Set([...mer.reason_codes, "NON_POSITIVE_NET_REVENUE"])];
  }
  return {
    gross_sales: moneyMetric(totals.gross_sales),
    discounts: moneyMetric(totals.discounts),
    refunds: moneyMetric(totals.refunds),
    cogs_net: moneyMetric(totals.cogs_net),
    platform_fees: moneyMetric(totals.platform_fees),
    payment_fees: moneyMetric(totals.payment_fees),
    fulfillment_costs: moneyMetric(totals.fulfillment_costs),
    other_variable_costs: moneyMetric(totals.other_variable_costs),
    ad_spend: moneyMetric(totals.ad_spend),
    net_revenue: moneyMetric(netRevenue),
    gross_profit: moneyMetric(grossProfit),
    contribution_before_marketing: moneyMetric(beforeMarketing),
    contribution_after_marketing: moneyMetric(afterMarketing),
    gross_margin: ratioMetric(grossProfit, netRevenue),
    contribution_margin: ratioMetric(afterMarketing, netRevenue),
    discount_rate: ratioMetric(totals.discounts, totals.gross_sales),
    refund_ratio: ratioMetric(totals.refunds, subtractAmounts(totals.gross_sales, totals.discounts)),
    mer,
    fulfillment_burden: ratioMetric(totals.fulfillment_costs, netRevenue),
    marketing_burden: ratioMetric(totals.ad_spend, netRevenue),
  };
}

function metricAmount(metric: Metric): Amount {
  let cents: bigint | null;
  try {
    cents = parseCents(metric.value);
  } catch {
    // Imported/derived metric boundaries preserve invalid values as unknown;
    // the CSV validator separately reports malformed financial input blocking.
    cents = null;
  }
  return {
    cents,
    reason_codes: cents === null
      ? [...new Set([...metric.reason_codes, ...(metric.reason_codes.length ? [] : ["INVALID_OR_MISSING_METRIC"])])]
      : [...metric.reason_codes],
  };
}

export function compareMoney(previous: Metric, current: Metric): {
  absolute_change: Metric;
  growth_rate: Metric;
  transition: "turned_positive" | "turned_negative" | "no_sign_change" | "unavailable";
} {
  const before = metricAmount(previous);
  const after = metricAmount(current);
  const change = subtractAmounts(after, before);
  let transition: "turned_positive" | "turned_negative" | "no_sign_change" | "unavailable" = "unavailable";
  if (before.cents !== null && after.cents !== null) {
    transition = before.cents <= 0n && after.cents > 0n
      ? "turned_positive"
      : before.cents >= 0n && after.cents < 0n
        ? "turned_negative"
        : "no_sign_change";
  }
  return {
    absolute_change: moneyMetric(change),
    growth_rate: ratioMetric(change, before),
    transition,
  };
}

/** 比率的差 × 100；value 的單位為百分點，不是相對成長率。 */
export function percentagePointChange(previous: Metric, current: Metric): Metric {
  const reason_codes = [...new Set([...previous.reason_codes, ...current.reason_codes])];
  const isDecimal = (value: string | null): value is string => typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value);
  if (!isDecimal(previous.value) || !isDecimal(current.value)) {
    return { value: null, reason_codes: reason_codes.length ? reason_codes : ["INVALID_OR_MISSING_METRIC"] };
  }
  // Clone configuration per call rather than mutating Decimal's shared state.
  // Size precision to preserve both very large integers and fractional inputs.
  const ExactDecimal = Decimal.clone({
    precision: previous.value.length + current.value.length + 20,
    rounding: Decimal.ROUND_HALF_UP,
  });
  return {
    value: new ExactDecimal(current.value).minus(previous.value).times(100).toFixed(12),
    reason_codes,
  };
}
