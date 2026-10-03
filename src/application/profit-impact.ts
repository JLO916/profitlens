import { compareMoney } from "@/domain/metrics";
import { formatCents, parseCents } from "@/domain/money";
import type { Metric, RuleCode } from "@/domain/types";
import { formatMoney, formatRate } from "./presentation";

/**
 * HF-03: every signed amount shown in the three-things list, the diagnosis cards
 * and the bridge follows its impact on profit: eating profit is "-" (loss, red),
 * adding profit is "+" (gain, green). The domain keeps its own observed-change
 * sign for ranking; this module only translates it for display.
 */

/** Rules whose domain ranking amount is "current cost − previous cost". */
export const COST_INCREASE_RULES: ReadonlySet<RuleCode> = new Set<RuleCode>([
  "DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP",
]);

function cents(value: string | null): bigint | null {
  try { return parseCents(value); } catch { return null; }
}

/** Profit impact of a rule's ranking amount; a cost increase becomes a negative impact. */
export function profitImpactAmount(code: RuleCode, amount: Metric | null): Metric | null {
  if (!amount) return null;
  const copy = { value: amount.value, reason_codes: [...amount.reason_codes] };
  if (!COST_INCREASE_RULES.has(code)) return copy;
  const value = cents(amount.value);
  return value === null ? copy : { ...copy, value: formatCents(-value) };
}

export type ImpactTone = "gain" | "loss" | "flat" | "unknown";

export function impactTone(value: string | null): ImpactTone {
  const amount = cents(value);
  return amount === null ? "unknown" : amount > 0n ? "gain" : amount < 0n ? "loss" : "flat";
}

/** Shared CSS class so the same impact renders in the same colour everywhere. */
export function impactClass(value: string | null): string {
  return `impact-${impactTone(value)}`;
}

/** Colours used by both the CSS classes and the bridge chart bars (keep in sync with globals.css). */
export const IMPACT_COLORS = { gain: "#17795e", loss: "#b42318" } as const;

/**
 * HF-04: a percentage change is meaningless when the amount crosses zero.
 * Returns "由賺 X 轉為虧 Y" / "由虧 X 轉為賺 Y" instead, otherwise the growth rate.
 */
export type MoneyChangeDescription =
  | { kind: "transition"; direction: "turned_negative" | "turned_positive"; text: string }
  | { kind: "rate"; text: string }
  | { kind: "none" };

function side(value: bigint): string {
  if (value === 0n) return " 0.00";
  return `${value > 0n ? "賺" : "虧"} ${formatMoney(formatCents(value < 0n ? -value : value))}`;
}

export function describeMoneyChange(previous: Metric, current: Metric): MoneyChangeDescription {
  const comparison = compareMoney(previous, current);
  const before = cents(previous.value);
  const after = cents(current.value);
  if ((comparison.transition === "turned_negative" || comparison.transition === "turned_positive") && before !== null && after !== null) {
    return { kind: "transition", direction: comparison.transition, text: `由${side(before)} 轉為${side(after)}` };
  }
  if (comparison.growth_rate.value === null) return { kind: "none" };
  return { kind: "rate", text: formatRate(comparison.growth_rate.value) };
}
