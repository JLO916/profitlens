import Decimal from "decimal.js";
import type { Amount, Metric } from "./types";

/** CSV 僅接受十進位字串；禁止 Number coercion，保留未知。 */
export function parseCents(value: unknown): bigint | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new TypeError("INVALID_MONEY");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}
export function formatCents(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function reasons(...codes: readonly string[][]): string[] {
  return [...new Set(codes.flat())].sort();
}
export function sumAmounts(amounts: readonly Amount[]): Amount {
  const missing = amounts.some(amount => amount.cents === null);
  const reason_codes = reasons(...amounts.map(amount => amount.reason_codes));
  if (missing) return { cents: null, reason_codes: reason_codes.length ? reason_codes : ["MISSING_VALUE"] };
  return { cents: amounts.reduce((total, amount) => total + amount.cents!, 0n), reason_codes };
}
export function subtractAmounts(first: Amount, ...rest: Amount[]): Amount {
  return sumAmounts([first, ...rest.map(amount => ({ ...amount, cents: amount.cents === null ? null : -amount.cents }))]);
}
export function moneyMetric(amount: Amount): Metric {
  return { value: amount.cents === null ? null : formatCents(amount.cents), reason_codes: amount.cents === null && !amount.reason_codes.length ? ["MISSING_VALUE"] : [...amount.reason_codes] };
}
export function ratioMetric(numerator: Amount, denominator: Amount): Metric {
  const reason_codes = reasons(numerator.reason_codes, denominator.reason_codes);
  if (numerator.cents === null || denominator.cents === null) return { value: null, reason_codes: reason_codes.length ? reason_codes : ["MISSING_VALUE"] };
  if (denominator.cents <= 0n) return { value: null, reason_codes: reasons(reason_codes, ["NON_POSITIVE_DENOMINATOR"]) };
  // clone 只保存數學設定，不更改 Decimal 的全域設定、不保存使用者資料。
  const RatioDecimal = Decimal.clone({ precision: numerator.cents.toString().length + denominator.cents.toString().length + 20, rounding: Decimal.ROUND_HALF_UP });
  return { value: new RatioDecimal(numerator.cents.toString()).div(denominator.cents.toString()).toFixed(12), reason_codes };
}
