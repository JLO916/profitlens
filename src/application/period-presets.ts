import { dayCount, isBusinessDate, isCompleteCalendarMonth } from "@/domain/date";
import type { ComparisonMode, Manifest, Period } from "@/domain/types";
import { labels } from "@/i18n";

// 期間快捷：本模組只產生四個日期與比較方式（純函式，不套用）。V3-3 起（D-V3-10＝A）期間列按快捷就直接套用（src/components/shell/period-bar.tsx 的 presetFilters）。規則見 docs/revamp/05_FEATURES.md §2。
// R1：近 7 天、近 4 週、近 12 週、本月 vs 上月（以 presetAnchor 為基準）。
// R4：periodPresets 的第二個參數（選填）傳入使用者目前的兩期與比較方式時，另附第五個「去年同期」：
//   本期不變；上期＝本期起訖各減一年（shiftYear，2/29 → 2/28），比較方式沿用。
//   - 整月（calendar_months）：本期迄日若是月底，上期迄日取去年同月的月底（2025-02-28 → 2024-02-29），維持完整月份；
//     29 天的 2024 年 2 月對到 28 天的 2023 年 2 月，整月比較允許兩期天數不同。
//   - 等天數（same_days）：上期必須與本期同天數。逐日減一年後若因 2/29 差一天，以上期迄日（去年同一天）為錨，
//     回推上期起日讓天數相等，例如 2024-02-01..2024-02-29（29 天）→ 2023-01-31..2023-02-28（29 天）。
//   - 上期起日早於涵蓋起日 → 不可用（presetTooShort）；本期迄日晚於基準日 → 不可用（presetUnavailable）；
//     本期日期無效 → 不可用（INVALID_PERIOD 文案，不拋錯，避免表單輸入中途讓畫面中斷）；
//     本期超過一年使兩期重疊 → 不可用（OVERLAPPING_PERIODS 文案）。
//   不傳第二個參數時，結果與 R1 完全相同（四個快捷）。
export type PeriodPresetId = "last7" | "last4w" | "last12w" | "monthVsPrev" | "yoy";
export type PeriodPreset =
  | { id: PeriodPresetId; label: string; status: "ready"; comparison_mode: ComparisonMode; previous: Period; current: Period; anchor: string }
  | { id: PeriodPresetId; label: string; status: "unavailable"; reason: string; anchor: string };
export type PresetManifest = Pick<Manifest, "data_as_of" | "coverage_start" | "coverage_end">;

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const previousMonth = (date: string) => { const [year, month] = date.slice(0, 7).split("-").map(Number); return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`; };
const monthEnd = (yearMonth: string) => shift(monthStart(shift(`${yearMonth}-01`, 31)), -1);
const isMonthEnd = (date: string) => shift(date, 1).endsWith("-01");
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

/** 同月同日減一年；2/29 → 前一年 2/28。輸入須為有效日期（YYYY-MM-DD）。 */
export function shiftYear(date: string): string {
  if (!isBusinessDate(date)) throw new RangeError("INVALID_PERIOD");
  const year = String(Number(date.slice(0, 4)) - 1).padStart(4, "0"), monthDay = date.slice(5);
  return monthDay === "02-29" ? `${year}-02-28` : `${year}-${monthDay}`;
}

export type PresetView = { previous: Period; current: Period; comparison_mode: ComparisonMode };

function yearOverYear(manifest: PresetManifest, view: PresetView): PeriodPreset {
  const id = "yoy", label = labels.periods.presets.yoy, anchor = presetAnchor(manifest);
  const { current, comparison_mode } = view;
  if (!isBusinessDate(current.start) || !isBusinessDate(current.end) || current.start > current.end) return { id, label, status: "unavailable", anchor, reason: labels.periods.yoyInvalidCurrent };
  if (current.end > anchor) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.presetUnavailable, { date: anchor, preset: label }) };
  // 整月模式的本期必須是完整月份，否則 validatePeriods 會拒絕（INCOMPLETE_CALENDAR_MONTH）。
  if (comparison_mode === "calendar_months" && !isCompleteCalendarMonth(current)) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.monthIncomplete, { date: current.end }) };
  const end = comparison_mode === "calendar_months" && isMonthEnd(current.end) ? monthEnd(shiftYear(current.end).slice(0, 7)) : shiftYear(current.end);
  const start = comparison_mode === "same_days" ? shift(end, -(dayCount(current) - 1)) : shiftYear(current.start);
  const previous = { start, end };
  if (previous.end >= current.start) return { id, label, status: "unavailable", anchor, reason: labels.periods.yoyOverlap };
  if (previous.start < manifest.coverage_start) return { id, label, status: "unavailable", anchor, reason: fill(labels.periods.presetTooShort, { date: manifest.coverage_start, preset: label }) };
  return { id, label, status: "ready", comparison_mode, previous, current: { start: current.start, end: current.end }, anchor };
}

export function periodPresets(manifest: PresetManifest, view?: PresetView): PeriodPreset[] {
  if (![manifest.data_as_of, manifest.coverage_start, manifest.coverage_end].every(isBusinessDate) || manifest.coverage_start > manifest.coverage_end) throw new RangeError("INVALID_PERIOD");
  const presets = labels.periods.presets;
  const result = [sameDays("last7", presets.last7, manifest, 7), sameDays("last4w", presets.last4w, manifest, 28), sameDays("last12w", presets.last12w, manifest, 84), monthVsPrevious(manifest)];
  if (view) result.push(yearOverYear(manifest, view));
  for (const preset of result) if (preset.status === "ready" && (dayCount(preset.previous) < 1 || dayCount(preset.current) < 1)) throw new RangeError("INVALID_PERIOD");
  return result;
}
