import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { periodPresets, type PeriodPreset } from "../src/application/period-presets";
import { groupOptionValue, SUBSET_OPTION_VALUE } from "../src/application/channel-settings";
import { channelsLabel, snapshotResolver } from "../src/application/copy";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { NeedsAttention, PeriodBar, appliedPreset, channelSelectModel, channelsForOption, periodSummary, periodToggleText, presetFilters, type AppliedPeriodScope, type ChannelGroupOption, type PeriodBarProps } from "../src/components/shell/period-bar";
import { fill, labels } from "../src/i18n";
import { SYNTHETIC_CHANNEL_SETTINGS } from "./helpers/page-states";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V3-3 A2 期間列（C23）、自訂期間 popover（C14）、需要處理橫幅（C22）、手機期間底部面板（PRD §6.3 #18–#20、§6.4 M1／M6、§7.0、D-V3-10＝A）。

const demo = { data_as_of: "2026-08-24", coverage_start: "2026-06-01", coverage_end: "2026-08-23" };
const demoScope: AppliedPeriodScope = { previous: { start: "2026-06-01", end: "2026-07-12" }, current: { start: "2026-07-13", end: "2026-08-23" }, previousDays: 42, currentDays: 42, comparisonMode: "same_days", channelsText: labels.shell.periodBar.filter.allChannels, dataAsOf: "2026-08-24" };
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
    expect(detail).toBe(fill(labels.shell.periodBarV3.summaryDetail, { channels: "DTC", mode: labels.shell.periods.sameDays, dataAsOf: "2026-08-24" }));
    const html = render();
    expect(html).toMatch(new RegExp(`<p class="period-summary" data-testid="period-summary" title="[^"]*${labels.shell.periods.sameDays}[^"]*">本期 7/13–8/23 對比 上期 6/1–7/12（各 42 天）<span class="sr-only">`));
  });
});

describe("期間列 SSR 結構（M1 保持掛載、M6 單一實例）", () => {
  const html = render();

  it("四個日期欄位、比較方式、套用各只有一份；自訂期間 popover 與手機面板都在 markup 中", () => {
    for (const id of ["previous-start", "previous-end", "current-start", "current-end", "period-custom-panel", "period-bar-panel"]) expect(count(html, ` id="${id}"`), id).toBe(1);
    for (const id of ["period-bar", "period-presets", "period-summary", "period-custom", "period-custom-panel", "period-toggle"]) expect(count(html, `data-testid="${id}"`), id).toBe(1);
    expect(count(html, `aria-label="${labels.shell.periodBar.filter.comparisonMode}"`)).toBe(1);
    expect(count(html, `aria-label="${labels.shell.periodBar.filter.channel}"`)).toBe(1);
    expect(count(html, `>${labels.shell.buttons.apply}</button>`)).toBe(1);
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
    expect(pressed).toMatch(new RegExp(`role="group" aria-label="${labels.shell.sections.presetGroup}" data-testid="period-presets"`));
    expect(pressed).toMatch(new RegExp(`aria-pressed="true">${labels.shell.periods.presets.last7}</button>`));
    for (const preset of presets.filter(item => item.status === "unavailable")) {
      expect(html).toContain(`aria-describedby="preset-reason-${preset.id}"`);
      expect(html).toContain(`id="preset-reason-${preset.id}" class="sr-only"`);
    }
    expect(presets.find(preset => preset.id === "yoy")?.status).toBe("unavailable");
    expect(html).not.toContain(labels.shell.periods.presetHint);
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

  it("V4-8a（D-V3-35＝A）：停用的快捷保留 aria-disabled、aria-describedby、title；按下時不套用，只呼叫 onUnavailablePreset", () => {
    const yoy = presetsFor(demoScope).find(preset => preset.id === "yoy")!;
    expect(yoy.status).toBe("unavailable");
    const html = render({ onUnavailablePreset: noop });
    expect(html).toBe(render());
    const button = html.slice(html.lastIndexOf("<button", html.indexOf(`>${labels.shell.periods.presets.yoy}</button>`)), html.indexOf(`>${labels.shell.periods.presets.yoy}</button>`) + 1);
    expect(button).toContain('aria-disabled="true" aria-describedby="preset-reason-yoy" title="');
    expect(button).toContain('aria-pressed="false"');
    const source = readFileSync(resolve("src/components/shell/period-bar.tsx"), "utf8");
    const choose = source.slice(source.indexOf("function choose("), source.indexOf("function submit("));
    expect(choose).toContain('if (preset.status !== "ready") { onUnavailablePreset?.(preset); return; }');
    expect(choose.indexOf("onUnavailablePreset?.(preset)")).toBeLessThan(choose.indexOf("onPreset(preset)"));
  });

  it("V4-8a（D-V3-35＝A）：dashboard 只在按了停用的「去年同期」時顯示理由；選其他快捷、送出自訂日期、載入、匯入、還原、清空都收起；還原的 last_preset 不算按過", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    const body = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));
    expect(source).toContain('function requestYoyHint(preset: PeriodPreset) { if (preset.id === "yoy") setYoyHintRequested(true); }');
    expect(source.match(/setYoyHintRequested\(true\)/g)).toHaveLength(1);
    expect(source).toMatch(/<PeriodBar[\s\S]*?onPreset=\{choosePreset\} onUnavailablePreset=\{requestYoyHint\}/);
    expect(source).toMatch(/\{visible && <NeedsAttention [^\n]*yoyHintVisible=\{yoyHintRequested\} \/>\}/);
    for (const [from, to] of [["function choosePreset", "function submitDates"], ["function submitDates", "function clear()"], ["async function performLoad", "function startImport"], ["async function performCommitImport", "async function applyFilters"], ["function performRestore", "function draftFromDiagnostic"], ["function performClear", "function restore("]]) {
      expect(body(from, to), from).toContain("setYoyHintRequested(false)");
    }
    const restore = body("function performRestore", "function draftFromDiagnostic");
    expect(restore).toContain("setLastPreset(workspace.ui_prefs.last_preset)");
    expect(restore).not.toContain("setYoyHintRequested(true");
  });
});

describe("需要處理橫幅（C22）", () => {
  const banner = (overrides: Parameters<typeof NeedsAttention>[0]) => renderToStaticMarkup(createElement(NeedsAttention, overrides));

  it("沒有內容時不渲染（不預留高度）", () => {
    expect(banner({})).toBe("");
    expect(banner({ filterError: "", partialIssues: null, yoyReason: null })).toBe("");
  });

  it("篩選錯誤：不利色、role=alert", () => {
    expect(banner({ filterError: labels.shell.state.errors.periodNotApplied })).toContain(`<p role="alert" class="ui-banner period-banner" data-tone="unfavorable" data-testid="banner-filter-error">${labels.shell.state.errors.periodNotApplied}</p>`);
  });

  it("部分資料待補：一行文字＋一個文字連結「查看 n 項資料問題」", () => {
    const html = banner({ partialIssues: 3 });
    expect(html).toContain(`data-tone="warning" data-testid="banner-partial"><span>${labels.shell.banner.partial}</span>`);
    expect(html).toContain(`<button type="button" class="ui-btn ui-btn-text">${fill(labels.shell.periodBar.viewIssues, { n: 3 })}</button>`);
    expect(count(html, "<button")).toBe(1);
  });

  const demoYoyReason = () => periodPresets(demo, { previous: demoScope.previous, current: demoScope.current, comparison_mode: "same_days" }).flatMap(preset => preset.id === "yoy" && preset.status === "unavailable" ? [preset.reason] : [])[0];
  const yoyOpen = (shown: boolean) => `<p class="period-banner-note" role="status" data-testid="preset-reason-visible-yoy"${shown ? "" : ' hidden=""'}>`;
  const bannerOpen = (shown: boolean) => `<div class="needs-attention" data-testid="needs-attention" role="group" aria-label="${labels.shell.banner.regionAria}"${shown ? "" : ' hidden=""'}>`;

  it("V4-8a（D-V3-35＝A）去年同期不可用、沒按過「去年同期」：12px 理由保持掛載（preset-reason-visible-yoy）但 hidden，橫幅整塊 hidden", () => {
    const reason = demoYoyReason();
    expect(reason).toBeTruthy();
    const text = fill(labels.shell.banner.yoyUnavailable, { reason: reason! });
    expect(banner({ yoyReason: reason })).toBe(`${bannerOpen(false)}${yoyOpen(false)}${text}</p></div>`);
    expect(banner({ yoyReason: reason, yoyHintVisible: false })).toBe(`${bannerOpen(false)}${yoyOpen(false)}${text}</p></div>`);
  });

  it("V4-8a（D-V3-35＝A）按過停用的「去年同期」（yoyHintVisible）：理由與橫幅都沒有 hidden，文字不變", () => {
    const reason = demoYoyReason()!;
    expect(banner({ yoyReason: reason, yoyHintVisible: true })).toBe(`${bannerOpen(true)}${yoyOpen(true)}${fill(labels.shell.banner.yoyUnavailable, { reason })}</p></div>`);
    // 去年同期可用（沒有理由）時 yoyHintVisible 不影響：沒有內容就不渲染。
    expect(banner({ yoyReason: null, yoyHintVisible: true })).toBe("");
  });

  it("V4-8a：有篩選錯誤或部分資料時橫幅照常顯示，只有去年同期理由跟著 yoyHintVisible", () => {
    const reason = demoYoyReason()!;
    for (const extra of [{ filterError: labels.shell.state.errors.periodNotApplied }, { partialIssues: 2 }]) {
      const name = Object.keys(extra)[0];
      const hidden = banner({ ...extra, yoyReason: reason });
      expect(hidden.startsWith(bannerOpen(true)), name).toBe(true);
      expect(hidden, name).toContain(yoyOpen(false));
      const shown = banner({ ...extra, yoyReason: reason, yoyHintVisible: true });
      expect(shown.startsWith(bannerOpen(true)), name).toBe(true);
      expect(shown, name).toContain(yoyOpen(true));
    }
  });

  it("多種狀態同時出現時依序：篩選錯誤、部分資料、去年同期", () => {
    const html = banner({ filterError: "x", partialIssues: 1, yoyReason: "y" });
    expect(html.indexOf("banner-filter-error")).toBeLessThan(html.indexOf("banner-partial"));
    expect(html.indexOf("banner-partial")).toBeLessThan(html.indexOf("preset-reason-visible-yoy"));
  });
});

// ── V42-2a（D-V42-10；PRD §4.1；docs/revamp-v4.2/06_BATCHES.md V42-2a 第 1、2 項）：兩層通路選單——沒有群組時 markup 逐位元組不變（只多 data-testid="scope-select"）、
//    有群組時的 optgroup 結構、未分組組、子集的只讀選項；channelSelectModel 四種選取值；channelsForOption 四種對應。
describe("V42-2a 期間列兩層通路選單（markup）", () => {
  const selectOf = (html: string) => html.slice(html.indexOf("<select"), html.indexOf("</select>") + "</select>".length);
  const open = `<select class="ui-field-control" aria-label="${labels.shell.periodBar.filter.channel}" data-testid="scope-select">`;
  const all = (selected: boolean) => `<option value=""${selected ? ' selected=""' : ""}>${labels.shell.periodBar.filter.allChannels}</option>`;
  const g1: ChannelGroupOption = { id: "g1", label: "自有", value: groupOptionValue("g1"), members: [{ value: "DTC", label: "官網" }, { value: "SOCIAL", label: "社群" }] };
  const g2: ChannelGroupOption = { id: "g2", label: "平台", value: groupOptionValue("g2"), members: [{ value: "LIVE", label: "直播" }, { value: "MARKETPLACE", label: "蝦皮" }] };

  it("沒有群組：groups 未給、[]、subset null 三種 markup 逐位元組相同，而且就是 v4.1.3 的單層選單加 data-testid=\"scope-select\"（沒有 optgroup、沒有「未分組」）", () => {
    const base = render();
    expect(render({ channel: { ...props().channel, groups: [] } })).toBe(base);
    expect(render({ channel: { ...props().channel, groups: [], subset: null } })).toBe(base);
    expect(render({ channel: { ...props().channel, groups: undefined, subset: undefined } })).toBe(base);
    expect(selectOf(base)).toBe(`${open}${all(true)}<option value="DTC">DTC</option><option value="MARKETPLACE">MARKETPLACE</option></select>`);
    expect(count(base, 'data-testid="scope-select"')).toBe(1);
    expect(base).not.toContain("<optgroup");
    expect(base).not.toContain(labels.shell.periodBarV42.ungrouped);
    // 選中單一通路：那個選項 selected，其餘不變。
    expect(selectOf(render({ channel: { ...props().channel, value: "MARKETPLACE" } }))).toBe(`${open}${all(false)}<option value="DTC">DTC</option><option value="MARKETPLACE" selected="">MARKETPLACE</option></select>`);
  });

  it("有群組：每群組一個 optgroup（群組選項 scope-option-group-{id}＋成員）、未分組的通路放最後一組「未分組」；選中群組時群組選項 selected；群組內的通路選項值仍是代碼", () => {
    const html = render({ channel: { value: g1.value, options: [{ value: "OTHER", label: "其他通路" }], groups: [g1, g2], onChange: noop } });
    expect(selectOf(html)).toBe(`${open}${all(false)}<optgroup label="自有"><option value="${g1.value}" data-testid="scope-option-group-g1" selected="">自有</option><option value="DTC">官網</option><option value="SOCIAL">社群</option></optgroup><optgroup label="平台"><option value="${g2.value}" data-testid="scope-option-group-g2">平台</option><option value="LIVE">直播</option><option value="MARKETPLACE">蝦皮</option></optgroup><optgroup label="${labels.shell.periodBarV42.ungrouped}"><option value="OTHER">其他通路</option></optgroup></select>`);
    expect(count(html, 'data-testid="scope-select"')).toBe(1);
    expect(count(html, "<optgroup")).toBe(3);
    // 選中群組內的通路：該通路選項 selected（在它的 optgroup 下）。
    const single = selectOf(render({ channel: { value: "SOCIAL", options: [], groups: [g1, g2], onChange: noop } }));
    expect(single).toContain('<option value="SOCIAL" selected="">社群</option>');
    expect(count(single, 'selected=""')).toBe(1);
    expect(single).not.toContain(labels.shell.periodBarV42.ungrouped);
    // 期間列的行高與 class 不變：select 仍是 ui-field-control、仍在 label.period-channel 內。
    expect(html).toContain(`<label class="period-channel"><span class="sr-only">${labels.shell.periodBar.filter.channel}</span>${open}`);
  });

  it("範圍是沒有對應群組的子集：最後一個選項是只讀（disabled）的「{n} 個通路」且被選中；沒有群組的資料集也一樣；subset 0 或 null 不加選項", () => {
    expect(fill(labels.shell.periodBarV42.subsetCount, { n: 2 })).toBe("2 個通路");
    const subset = `<option value="${SUBSET_OPTION_VALUE}" disabled="" selected="">${fill(labels.shell.periodBarV42.subsetCount, { n: 2 })}</option></select>`;
    const grouped = selectOf(render({ channel: { value: SUBSET_OPTION_VALUE, options: [], groups: [g1, g2], subset: 2, onChange: noop } }));
    expect(grouped.endsWith(`</optgroup>${subset}`)).toBe(true);
    expect(count(grouped, 'selected=""')).toBe(1);
    const flat = selectOf(render({ channel: { value: SUBSET_OPTION_VALUE, options: props().channel.options, subset: 2, onChange: noop } }));
    expect(flat).toBe(`${open}${all(false)}<option value="DTC">DTC</option><option value="MARKETPLACE">MARKETPLACE</option>${subset}`);
    expect(render({ channel: { ...props().channel, subset: 0 } })).toBe(render());
    expect(render({ channel: { ...props().channel, subset: null } })).toBe(render());
  });
});

describe("V42-2a channelSelectModel 與 channelsForOption（synthetic-4-channel 加 SYNTHETIC_CHANNEL_SETTINGS：自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE）", () => {
  const input = synthetic4ChannelInput();
  const dataset = validateDataset(input).dataset!;
  const manifest = dataset.manifest.channels;
  const make = async (channels?: string[], settings: typeof SYNTHETIC_CHANNEL_SETTINGS | null = SYNTHETIC_CHANNEL_SETTINGS) => createSnapshot(dataset, channels ? { channels } : {}, await hashInput(input), settings);
  const model = async (channels?: string[], settings: typeof SYNTHETIC_CHANNEL_SETTINGS | null = SYNTHETIC_CHANNEL_SETTINGS) => channelSelectModel({ snapshot: await make(channels, settings), manifestChannels: manifest });
  const own = { id: "g1", label: "自有", value: groupOptionValue("g1"), members: [{ value: "DTC", label: "官網" }, { value: "SOCIAL", label: "社群" }] };
  const platform = { id: "g2", label: "平台", value: groupOptionValue("g2"), members: [{ value: "LIVE", label: "直播" }, { value: "MARKETPLACE", label: "蝦皮" }] };

  it("manifest 是 DTC、LIVE、MARKETPLACE、SOCIAL；群組依設定順序、成員依 manifest 順序；全部通路在群組裡時 options（未分組）是空的", async () => {
    expect(manifest).toEqual(["DTC", "LIVE", "MARKETPLACE", "SOCIAL"]);
    const all = await model();
    expect(all.groups).toEqual([own, platform]);
    expect(all.options).toEqual([]);
  });

  it("value 四種：全部 → \"\"；單一通路 → 代碼（channelsText「{群組名} · {通路名}」）；群組 → 群組選項值（channelsText「{群組名}（成員）」）；子集 → 子集值＋subset 數（channelsText 成員清單）", async () => {
    const all = await model();
    expect([all.value, all.subset, all.channelsText]).toEqual(["", null, "官網、直播、蝦皮、社群"]);
    const single = await model(["DTC"]);
    expect([single.value, single.subset, single.channelsText]).toEqual(["DTC", null, fill(labels.shell.scopeV42.memberOfGroup, { group: "自有", channel: "官網" })]);
    const group = await model(["SOCIAL", "DTC"]);
    expect([group.value, group.subset, group.channelsText]).toEqual([groupOptionValue("g1"), null, fill(labels.shell.scopeV42.groupWithMembers, { group: "自有", members: "官網、社群" })]);
    expect(group.channelsText).toBe("自有（官網、社群）");
    const platformScope = await model(["MARKETPLACE", "LIVE"]);
    expect([platformScope.value, platformScope.channelsText]).toEqual([groupOptionValue("g2"), "平台（直播、蝦皮）"]);
    const subset = await model(["LIVE", "DTC"]);
    expect([subset.value, subset.subset, subset.channelsText]).toEqual([SUBSET_OPTION_VALUE, 2, "官網、直播"]);
    // 期間摘要的 title 與 sr-only 用 channelsText（summaryDetail 的 {channels}）。
    const snapshot = await make(["DTC", "SOCIAL"]);
    const html = render({ channel: { ...group, onChange: noop }, scope: { ...demoScope, channelsText: group.channelsText } });
    expect(html).toContain(`title="${fill(labels.shell.periodBarV3.summaryDetail, { channels: "自有（官網、社群）", mode: labels.shell.periods.sameDays, dataAsOf: demoScope.dataAsOf })}"`);
    expect(html).toContain('data-testid="scope-option-group-g1" selected=""');
    expect(snapshot.report.scope.channels).toEqual(["DTC", "SOCIAL"]);
  }, 60_000);

  it("沒有設定（示範、golden 的情況）：options＝manifest 全部（代碼）、groups []、subset null、channelsText＝channelsLabel；子集改成只讀的「{n} 個通路」", async () => {
    const all = await model(undefined, null);
    expect(all).toEqual({ value: "", options: manifest.map(code => ({ value: code, label: code })), groups: [], subset: null, channelsText: "DTC、LIVE、MARKETPLACE、SOCIAL" });
    const single = await model(["SOCIAL"], null);
    expect([single.value, single.subset, single.channelsText]).toEqual(["SOCIAL", null, "SOCIAL"]);
    const subset = await make(["DTC", "LIVE"], null);
    const subsetModel = channelSelectModel({ snapshot: subset, manifestChannels: manifest });
    expect([subsetModel.value, subsetModel.subset, subsetModel.channelsText]).toEqual([SUBSET_OPTION_VALUE, 2, channelsLabel(subset.report.scope.channels, snapshotResolver(subset))]);
  }, 60_000);

  it("channelsForOption 四種：「」→ manifest 全部；群組值 → 成員代碼（manifest 順序）；子集值 → null（不動）；其餘 → [value]；不認得的群組 id → null", async () => {
    const all = await model();
    expect(channelsForOption("", all, manifest)).toEqual([...manifest]);
    expect(channelsForOption(groupOptionValue("g1"), all, manifest)).toEqual(["DTC", "SOCIAL"]);
    expect(channelsForOption(groupOptionValue("g2"), all, manifest)).toEqual(["LIVE", "MARKETPLACE"]);
    expect(channelsForOption(SUBSET_OPTION_VALUE, all, manifest)).toBeNull();
    expect(channelsForOption("DTC", all, manifest)).toEqual(["DTC"]);
    expect(channelsForOption(groupOptionValue("g9"), all, manifest)).toBeNull();
    expect(channelsForOption("", { groups: [] }, manifest)).toEqual([...manifest]);
    expect(channelsForOption(groupOptionValue("g1"), { groups: [] }, manifest)).toBeNull();
  });

  it("dashboard 的期間列用 channelSelectModel 與 channelsForOption，選單選項換成通路後走既有的 applyFilters；三頁的「只看這個通路」走同一個 drillChannel", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    expect(source).toContain("const channelModel = active ? channelSelectModel({ snapshot: active.snapshot, manifestChannels: active.dataset.manifest.channels })");
    expect(source).toContain("channel={{ value: channelModel.value, options: channelModel.options, groups: channelModel.groups, subset: channelModel.subset, onChange: value => { const channels = channelsForOption(value, channelModel, active.dataset.manifest.channels); if (channels) void applyFilters({ ...active.snapshot.report.scope, channels }); } }}");
    expect(source).toContain("channelsText: channelModel.channelsText");
    expect(source).toContain("void applyFilters({ ...active.snapshot.report.scope, channels: [channel] });");
    expect(source.match(/onDrill=\{drillChannel\}/g)).toHaveLength(3);
    const helper = readFileSync(resolve("tests/helpers/page-states.tsx"), "utf8");
    expect(helper).toContain("const channelModel = channelSelectModel({ snapshot: active.snapshot, manifestChannels: active.dataset.manifest.channels });");
    expect(helper.match(/onDrill=\{noop\}/g)).toHaveLength(3);
  });
});
