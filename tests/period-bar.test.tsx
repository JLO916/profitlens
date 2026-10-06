import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { periodPresets, type PeriodPreset } from "../src/application/period-presets";
import { NeedsAttention, PeriodBar, appliedPreset, periodSummary, periodToggleText, presetFilters, type AppliedPeriodScope, type PeriodBarProps } from "../src/components/shell/period-bar";
import { fill, labels } from "../src/i18n";

// V3-3 A2 期間列（C23）、自訂期間 popover（C14）、需要處理橫幅（C22）、手機期間底部面板（PRD §6.3 #18–#20、§6.4 M1／M6、§7.0、D-V3-10＝A）。

const demo = { data_as_of: "2026-08-24", coverage_start: "2026-06-01", coverage_end: "2026-08-23" };
const demoScope: AppliedPeriodScope = { previous: { start: "2026-06-01", end: "2026-07-12" }, current: { start: "2026-07-13", end: "2026-08-23" }, previousDays: 42, currentDays: 42, comparisonMode: "same_days", channelsText: labels.ui.dashboard.filter.allChannels, dataAsOf: "2026-08-24" };
const presetsFor = (scope: AppliedPeriodScope) => periodPresets(demo, { previous: scope.previous, current: scope.current, comparison_mode: scope.comparisonMode });
const noop = () => undefined;
const props = (overrides: Partial<PeriodBarProps> = {}): PeriodBarProps => ({
  channel: { value: "", options: [{ value: "DTC", label: "DTC" }, { value: "MARKETPLACE", label: "MARKETPLACE" }], onChange: noop },
  presets: presetsFor(demoScope), isPressed: () => false, onPreset: noop,
  comparisonMode: "same_days", onComparisonMode: noop,
  dates: { previousStart: "2026-06-01", previousEnd: "2026-07-12", currentStart: "2026-07-13", currentEnd: "2026-08-23" }, onDates: noop, onSubmit: noop,
  scope: demoScope, ...overrides,
});
const render = (overrides?: Partial<PeriodBarProps>) => renderToStaticMarkup(createElement(PeriodBar, props(overrides)));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("期間摘要（formatPeriodL1，§7.0、§8.6）", () => {
  it("兩期天數相同：「本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）」", () => {
    expect(periodSummary(demoScope).text).toBe(fill(labels.shell.periodBarV3.summary, { current: "7/13–8/23", previous: "6/1–7/12", days: 42 }));
    expect(periodSummary(demoScope).text).toBe("本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）");
  });

  it("兩期天數不同：改寫成「本期 30 天、上期 31 天，日均較可比」", () => {
    const months: AppliedPeriodScope = { ...demoScope, previous: { start: "2026-07-01", end: "2026-07-31" }, current: { start: "2026-09-01", end: "2026-09-30" }, previousDays: 31, currentDays: 30, comparisonMode: "calendar_months", dataAsOf: "2026-10-01" };
    const { text } = periodSummary(months);
    expect(text).toBe(fill(labels.shell.periodBarV3.summaryUnequal, { current: "9/1–9/30", previous: "7/1–7/31", currentDays: 30, previousDays: 31 }));
    expect(text).toContain("本期 30 天、上期 31 天，日均較可比");
  });

  it("上期在去年時寫出年份（anchor＝資料到）", () => {
    const yoy: AppliedPeriodScope = { ...demoScope, previous: { start: "2025-07-13", end: "2025-08-23" } };
    expect(periodSummary(yoy).text).toBe("本期 7/13–8/23 對比 上期 2025/7/13–2025/8/23（各 42 天）");
  });

  it("v2 整行範圍說明的其餘資訊（通路、比較方式、資料到）在 title 與 sr-only（§6.3 #19 是合併不是移除）", () => {
    const { detail } = periodSummary({ ...demoScope, channelsText: "DTC" });
    expect(detail).toBe(fill(labels.shell.periodBarV3.summaryDetail, { channels: "DTC", mode: labels.periods.sameDays, dataAsOf: "2026-08-24" }));
    const html = render();
    expect(html).toMatch(new RegExp(`<p class="period-summary" data-testid="period-summary" title="[^"]*${labels.periods.sameDays}[^"]*">本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）<span class="sr-only">`));
  });
});

describe("期間列 SSR 結構（M1 保持掛載、M6 單一實例）", () => {
  const html = render();

  it("四個日期欄位、比較方式、套用各只有一份；自訂期間 popover 與手機面板都在 markup 中", () => {
    for (const id of ["previous-start", "previous-end", "current-start", "current-end", "period-custom-panel", "period-bar-panel"]) expect(count(html, ` id="${id}"`), id).toBe(1);
    for (const id of ["period-bar", "period-presets", "period-summary", "period-custom", "period-custom-panel", "period-toggle"]) expect(count(html, `data-testid="${id}"`), id).toBe(1);
    expect(count(html, `aria-label="${labels.ui.dashboard.filter.comparisonMode}"`)).toBe(1);
    expect(count(html, `aria-label="${labels.ui.dashboard.filter.channel}"`)).toBe(1);
    expect(count(html, `>${labels.buttons.apply}</button>`)).toBe(1);
    expect(html).toContain(`<form class="period-form">`);
  });

  it("popover 與手機面板關閉時用 CSS 隱藏（不加 hidden、不卸載），觸發器帶 aria-expanded／aria-controls（M3）", () => {
    expect(html).toMatch(/<button type="button" class="ui-btn ui-btn-secondary period-custom-trigger" data-testid="period-custom" aria-expanded="false" aria-controls="period-custom-panel">/);
    expect(html).toMatch(/data-testid="period-toggle" aria-expanded="false" aria-controls="period-bar-panel"/);
    expect(html).toMatch(new RegExp(`id="period-custom-panel" class="ui-popover period-custom-panel" role="region" aria-label="${labels.shell.periodBarV3.customPanelAria}"`));
    expect(html).not.toMatch(/id="period-custom-panel"[^>]*hidden/);
    expect(html).not.toContain("data-open");
  });

  it("快捷是分段鈕：aria-pressed；不可用時 aria-disabled＋title＋sr-only 理由（#preset-reason-{id}）", () => {
    const presets = presetsFor(demoScope);
    const pressed = render({ isPressed: preset => preset.id === "last7" });
    expect(pressed).toMatch(new RegExp(`role="group" aria-label="${labels.sections.presetGroup}" data-testid="period-presets"`));
    expect(pressed).toMatch(new RegExp(`aria-pressed="true">${labels.periods.presets.last7}</button>`));
    for (const preset of presets.filter(item => item.status === "unavailable")) {
      expect(html).toContain(`aria-describedby="preset-reason-${preset.id}"`);
      expect(html).toContain(`id="preset-reason-${preset.id}" class="sr-only"`);
    }
    expect(presets.find(preset => preset.id === "yoy")?.status).toBe("unavailable");
    expect(html).not.toContain(labels.periods.presetHint);
    expect(html).toContain(labels.shell.periodBarV3.customHint);
  });

  it("手機按鈕文字：對到快捷寫快捷名，否則寫「自訂期間」", () => {
    expect(periodToggleText(presetsFor(demoScope), demoScope)).toBe(`${labels.shell.periodBarV3.custom} · 7/13–8/23`);
    const last4w: AppliedPeriodScope = { ...demoScope, previous: { start: "2026-06-29", end: "2026-07-26" }, current: { start: "2026-07-27", end: "2026-08-23" }, previousDays: 28, currentDays: 28 };
    expect(appliedPreset(presetsFor(last4w), last4w)?.id).toBe("last4w");
    expect(periodToggleText(presetsFor(last4w), last4w)).toBe("近 4 週 · 7/27–8/23");
    expect(render({ scope: last4w, presets: presetsFor(last4w) })).toContain(`<span>近 4 週 · 7/27–8/23</span>`);
  });

  it("套用中（busy）期間列保持掛載並標 aria-busy", () => {
    expect(render({ busy: true })).toMatch(/data-testid="period-bar" aria-busy="true"/);
    expect(html).not.toContain("aria-busy");
  });
});

describe("D-V3-10＝A：快捷單擊就套用", () => {
  it("presetFilters 產生與「套用」相同形狀的篩選；不可用的快捷回傳 null", () => {
    const presets = presetsFor(demoScope);
    const last7 = presets.find(preset => preset.id === "last7") as Extract<PeriodPreset, { status: "ready" }>;
    expect(presetFilters(last7, ["DTC"])).toEqual({ comparison_mode: "same_days", channels: ["DTC"], previous_period: { start: "2026-08-10", end: "2026-08-16" }, current_period: { start: "2026-08-17", end: "2026-08-23" } });
    expect(presetFilters(presets.find(preset => preset.id === "last12w")!, ["DTC"])).toBeNull();
  });

  it("dashboard 的 choosePreset 直接呼叫 applyFilters（不再只填日期、不再把焦點移到「套用」）", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    const body = source.slice(source.indexOf("function choosePreset"), source.indexOf("function submitDates"));
    expect(body).toContain("presetFilters(preset");
    expect(body).toContain("void applyFilters(filters)");
    expect(body).not.toContain("applyRef.current?.focus()");
  });
});

describe("需要處理橫幅（C22）", () => {
  const banner = (overrides: Parameters<typeof NeedsAttention>[0]) => renderToStaticMarkup(createElement(NeedsAttention, overrides));

  it("沒有內容時不渲染（不預留高度）", () => {
    expect(banner({})).toBe("");
    expect(banner({ filterError: "", partialIssues: null, yoyReason: null })).toBe("");
  });

  it("篩選錯誤：不利色、role=alert", () => {
    expect(banner({ filterError: labels.ui.dashboard.errors.periodNotApplied })).toContain(`<p role="alert" class="ui-banner period-banner" data-tone="unfavorable" data-testid="banner-filter-error">${labels.ui.dashboard.errors.periodNotApplied}</p>`);
  });

  it("部分資料待補：一行文字＋一個文字連結「查看 n 項資料問題」", () => {
    const html = banner({ partialIssues: 3 });
    expect(html).toContain(`data-tone="warning" data-testid="banner-partial"><span>${labels.shell.banner.partial}</span>`);
    expect(html).toContain(`<button type="button" class="ui-btn ui-btn-text">${fill(labels.ui.dashboard.viewIssues, { n: 3 })}</button>`);
    expect(count(html, "<button")).toBe(1);
  });

  it("去年同期不可用：12px 理由，保留 preset-reason-visible-yoy", () => {
    const reason = periodPresets(demo, { previous: demoScope.previous, current: demoScope.current, comparison_mode: "same_days" }).flatMap(preset => preset.id === "yoy" && preset.status === "unavailable" ? [preset.reason] : [])[0];
    expect(reason).toBeTruthy();
    expect(banner({ yoyReason: reason })).toContain(`<p class="period-banner-note" role="status" data-testid="preset-reason-visible-yoy">${fill(labels.shell.banner.yoyUnavailable, { reason: reason! })}</p>`);
  });

  it("多種狀態同時出現時依序：篩選錯誤、部分資料、去年同期", () => {
    const html = banner({ filterError: "x", partialIssues: 1, yoyReason: "y" });
    expect(html.indexOf("banner-filter-error")).toBeLessThan(html.indexOf("banner-partial"));
    expect(html.indexOf("banner-partial")).toBeLessThan(html.indexOf("preset-reason-visible-yoy"));
  });
});
