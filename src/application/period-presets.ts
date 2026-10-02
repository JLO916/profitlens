import { dayCount, isBusinessDate, isCompleteCalendarMonth } from "@/domain/date";
import type { ComparisonMode, Manifest, Period } from "@/domain/types";
import { labels } from "@/i18n";

// R1 期間快捷：只產生四個日期與比較方式，不套用；使用者仍須按「套用」。
// 規則見 docs/revamp/05_FEATURES.md §2。R4 補「去年同期」。
export type PeriodPresetId = "last7" | "last4w" | "last12w" | "monthVsPrev";
export type PeriodPreset =
  | { id: PeriodPresetId; label: string; status: "ready"; comparison_mode: ComparisonMode; previous: Period; current: Period; anchor: string }
  | { id: PeriodPresetId; label: string; status: "unavailable"; reason: string; anchor: string };
export type PresetManifest = Pick<Manifest, "data_as_of" | "coverage_start" | "coverage_end">;

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const previousMonth = (date: string) => { const [year, month] = date.slice(0, 7).split("-").map(Number); return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`; };
const monthEnd = (yearMonth: string) => shift(monthStart(shift(`${yearMonth}-01`, 31)), -1);
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/** 快捷的基準日：資料到期日與涵蓋迄日取較早者；日期超出涵蓋即不可用，不截短、不補零。 */
export function presetAnchor(manifest: PresetManifest): string {
  return manifest.data_as_of < manifest.coverage_end ? manifest.data_as_of : manifest.coverage_end;
}

function sameDays(id: PeriodPresetId, label: string, manifest: PresetManifest, days: number): PeriodPreset {
  const anchor = presetAnchor(manifest);
  const current = { start: shift(anchor, -(days - 1)), end: anchor };
  const previous = { start: shift(current.start, -days), end: shift(current.start, -1) };
  if (previous.start < manifest.coverage_start) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.presetTooShort, { date: manifest.coverage_start, preset: label }) };
  return { id, label, status: "ready", comparison_mode: "same_days", previous, current, anchor };
}

function monthVsPrevious(manifest: PresetManifest): PeriodPreset {
  const id = "monthVsPrev", label = labels.periods.presets.monthVsPrev, anchor = presetAnchor(manifest);
  const current = { start: monthStart(anchor), end: anchor };
  if (!isCompleteCalendarMonth(current)) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.monthIncomplete, { date: anchor }) };
  const last = previousMonth(anchor);
  const previous = { start: `${last}-01`, end: monthEnd(last) };
  if (previous.start < manifest.coverage_start) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.presetTooShort, { date: manifest.coverage_start, preset: label }) };
  return { id, label, status: "ready", comparison_mode: "calendar_months", previous, current, anchor };
}

export function periodPresets(manifest: PresetManifest): PeriodPreset[] {
  if (![manifest.data_as_of, manifest.coverage_start, manifest.coverage_end].every(isBusinessDate) || manifest.coverage_start > manifest.coverage_end) throw new RangeError("INVALID_PERIOD");
  const presets = labels.periods.presets;
  const result = [sameDays("last7", presets.last7, manifest, 7), sameDays("last4w", presets.last4w, manifest, 28), sameDays("last12w", presets.last12w, manifest, 84), monthVsPrevious(manifest)];
  for (const preset of result) if (preset.status === "ready" && (dayCount(preset.previous) < 1 || dayCount(preset.current) < 1)) throw new RangeError("INVALID_PERIOD");
  return result;
}
