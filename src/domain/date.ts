import type { Manifest, Period } from "./types";
const DAY_MS = 86_400_000;
export function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function dayCount(period: Period): number {
  if (!isBusinessDate(period.start) || !isBusinessDate(period.end) || period.start > period.end) throw new RangeError("INVALID_PERIOD");
  return (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / DAY_MS + 1;
}
export function dateRange(start: string, end: string): string[] {
  const count = dayCount({ start, end });
  const first = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(first + index * DAY_MS).toISOString().slice(0, 10));
}
export function isCompleteCalendarMonth(period: Period): boolean {
  if (!isBusinessDate(period.start) || !isBusinessDate(period.end) || !period.start.endsWith("-01") || period.start.slice(0, 7) !== period.end.slice(0, 7)) return false;
  const nextDay = new Date(Date.parse(`${period.end}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return nextDay.endsWith("-01");
}

export function validatePeriods(manifest: Pick<Manifest, "coverage_start" | "coverage_end" | "previous_period" | "current_period"> & Partial<Pick<Manifest, "comparison_mode" | "data_as_of">>): string[] {
  const coverage = { start: manifest.coverage_start, end: manifest.coverage_end };
  const periods = [coverage, manifest.previous_period, manifest.current_period];
  if (periods.some(period => !period || !isBusinessDate(period.start) || !isBusinessDate(period.end) || period.start > period.end)) return ["INVALID_PERIOD"];
  const mode = manifest.comparison_mode === undefined ? "same_days" : manifest.comparison_mode;
  const errors: string[] = [];
  if (mode !== "same_days" && mode !== "calendar_months") errors.push("INVALID_COMPARISON_MODE");
  if (mode === "same_days" && dayCount(manifest.previous_period) !== dayCount(manifest.current_period)) errors.push("UNEQUAL_PERIOD_LENGTH");
  if (mode === "calendar_months" && ![manifest.previous_period, manifest.current_period].every(isCompleteCalendarMonth)) errors.push("INCOMPLETE_CALENDAR_MONTH");
  if (manifest.previous_period.start <= manifest.current_period.end && manifest.current_period.start <= manifest.previous_period.end) errors.push("OVERLAPPING_PERIODS");
  if (manifest.previous_period.end >= manifest.current_period.start) errors.push("PERIOD_ORDER_INVALID");
  if (manifest.data_as_of !== undefined && !isBusinessDate(manifest.data_as_of)) errors.push("INVALID_DATA_AS_OF");
  for (const period of [manifest.previous_period, manifest.current_period]) {
    if (period.start < coverage.start || period.end > coverage.end) errors.push("PERIOD_OUTSIDE_COVERAGE");
    if (manifest.data_as_of !== undefined && isBusinessDate(manifest.data_as_of) && period.end > manifest.data_as_of) errors.push("PERIOD_AFTER_DATA_AS_OF");
  }
  return [...new Set(errors)];
}
