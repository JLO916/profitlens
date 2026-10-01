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
export function validatePeriods(manifest: Pick<Manifest, "coverage_start" | "coverage_end" | "previous_period" | "current_period">): string[] {
  const coverage = { start: manifest.coverage_start, end: manifest.coverage_end };
  const periods = [coverage, manifest.previous_period, manifest.current_period];
  if (periods.some(period => !period || !isBusinessDate(period.start) || !isBusinessDate(period.end) || period.start > period.end)) return ["INVALID_PERIOD"];
  const errors: string[] = [];
  if (dayCount(manifest.previous_period) !== dayCount(manifest.current_period)) errors.push("UNEQUAL_PERIOD_LENGTH");
  if (manifest.previous_period.start <= manifest.current_period.end && manifest.current_period.start <= manifest.previous_period.end) errors.push("OVERLAPPING_PERIODS");
  for (const period of [manifest.previous_period, manifest.current_period]) {
    if (period.start < coverage.start || period.end > coverage.end) errors.push("PERIOD_OUTSIDE_COVERAGE");
  }
  return [...new Set(errors)];
}
