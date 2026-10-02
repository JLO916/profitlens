import { describe, expect, it } from "vitest";
import { periodPresets, presetAnchor } from "../src/application/period-presets";
import { labels } from "../src/i18n";

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
    expect(presets.last12w).toMatchObject({ status: "unavailable", reason: "資料從 2026-06-01 開始，不足近 12 週所需天數" });
    expect(presets.monthVsPrev).toMatchObject({ status: "unavailable", reason: "資料只到 2026-08-23，本月未滿月；請改用等天數快捷" });
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
    expect(shortMonth.monthVsPrev).toMatchObject({ status: "unavailable", reason: "資料從 2025-01-01 開始，不足本月 vs 上月所需天數" });
  });

  it("rejects malformed manifests instead of guessing", () => {
    expect(() => periodPresets({ ...demo, data_as_of: "2026-02-30" })).toThrow("INVALID_PERIOD");
    expect(() => periodPresets({ ...demo, coverage_start: "2026-09-01" })).toThrow("INVALID_PERIOD");
  });
});
