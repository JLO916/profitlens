import { describe, expect, it } from "vitest";
import { periodPresets, presetAnchor, shiftYear, type PresetView } from "../src/application/period-presets";
import { fill, labels } from "../src/i18n";

const demo = { data_as_of: "2026-08-24", coverage_start: "2026-06-01", coverage_end: "2026-08-23" };
const golden = { data_as_of: "2026-08-03", coverage_start: "2026-08-01", coverage_end: "2026-08-02" };
const byId = (manifest: typeof demo) => Object.fromEntries(periodPresets(manifest).map(preset => [preset.id, preset]));

describe("R1 period presets fill dates only, anchored to the last covered day", () => {
  it("anchors on the earlier of data_as_of and coverage_end", () => {
    expect(presetAnchor(demo)).toBe("2026-08-23");
    expect(presetAnchor({ ...demo, data_as_of: "2026-08-20" })).toBe("2026-08-20");
  });

  it("computes 7 / 28 day windows by hand for the demo manifest", () => {
    const presets = byId(demo);
    expect(presets.last7).toMatchObject({ status: "ready", comparison_mode: "same_days", previous: { start: "2026-08-10", end: "2026-08-16" }, current: { start: "2026-08-17", end: "2026-08-23" } });
    expect(presets.last4w).toMatchObject({ status: "ready", comparison_mode: "same_days", previous: { start: "2026-06-29", end: "2026-07-26" }, current: { start: "2026-07-27", end: "2026-08-23" } });
    expect(presets.last7.label).toBe(labels.periods.presets.last7);
    expect(presets.last4w.label).toBe(labels.periods.presets.last4w);
  });

  it("refuses 12-week and month presets that would leave coverage, naming the reason", () => {
    const presets = byId(demo);
    expect(presets.last12w).toMatchObject({ status: "unavailable", reason: fill(labels.periods.presetTooShort, { date: "2026-06-01", preset: labels.periods.presets.last12w }) });
    expect(presets.monthVsPrev).toMatchObject({ status: "unavailable", reason: fill(labels.periods.monthIncomplete, { date: "2026-08-23" }) });
  });

  it("marks every preset unavailable for a two-day golden coverage", () => {
    for (const preset of periodPresets(golden)) expect(preset.status).toBe("unavailable");
  });

  it("builds full-month comparisons including leap February and the January rollover", () => {
    const leap = byId({ data_as_of: "2024-03-31", coverage_start: "2024-01-01", coverage_end: "2024-03-31" });
    expect(leap.monthVsPrev).toMatchObject({ status: "ready", comparison_mode: "calendar_months", previous: { start: "2024-02-01", end: "2024-02-29" }, current: { start: "2024-03-01", end: "2024-03-31" } });
    const january = byId({ data_as_of: "2025-02-10", coverage_start: "2024-12-01", coverage_end: "2025-01-31" });
    expect(january.monthVsPrev).toMatchObject({ status: "ready", previous: { start: "2024-12-01", end: "2024-12-31" }, current: { start: "2025-01-01", end: "2025-01-31" } });
    const shortMonth = byId({ data_as_of: "2025-01-31", coverage_start: "2025-01-01", coverage_end: "2025-01-31" });
    expect(shortMonth.monthVsPrev).toMatchObject({ status: "unavailable", reason: fill(labels.periods.presetTooShort, { date: "2025-01-01", preset: labels.periods.presets.monthVsPrev }) });
  });

  it("rejects malformed manifests instead of guessing", () => {
    expect(() => periodPresets({ ...demo, data_as_of: "2026-02-30" })).toThrow("INVALID_PERIOD");
    expect(() => periodPresets({ ...demo, coverage_start: "2026-09-01" })).toThrow("INVALID_PERIOD");
  });
});

describe("R4 去年同期 (yoy): current unchanged, previous = current shifted back one year", () => {
  const wide = { data_as_of: "2026-10-01", coverage_start: "2023-01-01", coverage_end: "2026-09-30" };
  const sameDaysView = (start: string, end: string): PresetView => ({ previous: { start: "2000-01-01", end: "2000-01-01" }, current: { start, end }, comparison_mode: "same_days" });
  const yoy = (manifest: typeof demo, view: PresetView) => periodPresets(manifest, view).find(preset => preset.id === "yoy");

  it("shiftYear keeps month-end dates and maps 2/29 to 2/28", () => {
    expect(shiftYear("2026-03-31")).toBe("2025-03-31");
    expect(shiftYear("2025-01-31")).toBe("2024-01-31");
    expect(shiftYear("2024-02-29")).toBe("2023-02-28");
    expect(shiftYear("2025-02-28")).toBe("2024-02-28");
    expect(shiftYear("2025-12-31")).toBe("2024-12-31");
    expect(() => shiftYear("2026-02-30")).toThrow("INVALID_PERIOD");
  });

  it("without a view returns exactly the four R1 presets; with a view the four are identical and yoy is appended", () => {
    const plain = periodPresets(demo);
    expect(plain.map(preset => preset.id)).toEqual(["last7", "last4w", "last12w", "monthVsPrev"]);
    const withView = periodPresets(demo, sameDaysView("2026-08-17", "2026-08-23"));
    expect(withView.slice(0, 4)).toEqual(plain);
    expect(withView.map(preset => preset.id)).toEqual(["last7", "last4w", "last12w", "monthVsPrev", "yoy"]);
    expect(withView[4].label).toBe(labels.periods.presets.yoy);
  });

  it("shifts same_days month-end windows by one calendar year (hand-computed)", () => {
    expect(yoy(wide, sameDaysView("2026-03-25", "2026-03-31"))).toMatchObject({ status: "ready", comparison_mode: "same_days", current: { start: "2026-03-25", end: "2026-03-31" }, previous: { start: "2025-03-25", end: "2025-03-31" } });
    expect(yoy(wide, sameDaysView("2025-01-25", "2025-01-31"))).toMatchObject({ status: "ready", previous: { start: "2024-01-25", end: "2024-01-31" }, current: { start: "2025-01-25", end: "2025-01-31" } });
  });

  it("leap day: same_days 2024-02-01..2024-02-29 (29 days) keeps 29 days by anchoring the end on 2023-02-28", () => {
    // 逐日減一年會得 2023-02-01..2023-02-28（28 天），等天數比較不允許（UNEQUAL_PERIOD_LENGTH）。
    // 實作以上期迄日（本期迄日的去年同一天 2023-02-28）為錨，回推 29 天：2023-02-28 往前 28 天＝2023-01-31。
    const preset = yoy(wide, sameDaysView("2024-02-01", "2024-02-29"));
    expect(preset).toMatchObject({ status: "ready", comparison_mode: "same_days", previous: { start: "2023-01-31", end: "2023-02-28" }, current: { start: "2024-02-01", end: "2024-02-29" } });
    // 反向：本期 2025-02-01..2025-03-31（59 天），去年同期含 2/29；以 2024-03-31 為錨回推 59 天＝2024-02-02。
    expect(yoy(wide, sameDaysView("2025-02-01", "2025-03-31"))).toMatchObject({ status: "ready", previous: { start: "2024-02-02", end: "2024-03-31" } });
  });

  it("calendar_months: same calendar month one year earlier, including a 29-day vs 28-day February", () => {
    const view = (start: string, end: string): PresetView => ({ previous: { start: "2000-01-01", end: "2000-01-31" }, current: { start, end }, comparison_mode: "calendar_months" });
    expect(yoy(wide, view("2026-03-01", "2026-03-31"))).toMatchObject({ status: "ready", comparison_mode: "calendar_months", previous: { start: "2025-03-01", end: "2025-03-31" }, current: { start: "2026-03-01", end: "2026-03-31" } });
    expect(yoy(wide, view("2024-02-01", "2024-02-29"))).toMatchObject({ status: "ready", previous: { start: "2023-02-01", end: "2023-02-28" } });
    // 2025 年 2 月（28 天）→ 2024 年 2 月整月（迄日取 2024-02-29，仍是完整月份）。
    expect(yoy(wide, view("2025-02-01", "2025-02-28"))).toMatchObject({ status: "ready", previous: { start: "2024-02-01", end: "2024-02-29" } });
  });

  it("coverage edge: previous.start equal to coverage_start is ready; one day earlier is unavailable with the exact reason", () => {
    const edge = { data_as_of: "2026-08-24", coverage_start: "2025-08-17", coverage_end: "2026-08-23" };
    expect(yoy(edge, sameDaysView("2026-08-17", "2026-08-23"))).toMatchObject({ status: "ready", previous: { start: "2025-08-17", end: "2025-08-23" } });
    const short = { ...edge, coverage_start: "2025-08-18" };
    expect(yoy(short, sameDaysView("2026-08-17", "2026-08-23"))).toEqual({ id: "yoy", label: labels.periods.presets.yoy, status: "unavailable", anchor: "2026-08-23", reason: "資料從 2025-08-18 開始，不足去年同期所需天數" });
  });

  it("is unavailable when the current period runs past the anchor, naming the anchor date", () => {
    expect(yoy(demo, sameDaysView("2026-08-18", "2026-08-24"))).toMatchObject({ status: "unavailable", anchor: "2026-08-23", reason: "資料只到 2026-08-23，無法取去年同期" });
  });

  it("the demo manifest (three months of coverage) cannot reach last year", () => {
    expect(yoy(demo, sameDaysView("2026-08-17", "2026-08-23"))).toMatchObject({ status: "unavailable", reason: "資料從 2026-06-01 開始，不足去年同期所需天數" });
  });

  it("degrades to unavailable (never throws) for an invalid or over-long current period", () => {
    expect(yoy(wide, sameDaysView("2026-02-30", "2026-03-05"))).toMatchObject({ status: "unavailable", reason: labels.periods.yoyInvalidCurrent });
    expect(yoy(wide, sameDaysView("2026-03-05", "2026-03-01"))).toMatchObject({ status: "unavailable", reason: labels.periods.yoyInvalidCurrent });
    expect(yoy(wide, sameDaysView("2025-01-01", "2026-01-01"))).toMatchObject({ status: "unavailable", reason: labels.periods.yoyOverlap });
  });
});
