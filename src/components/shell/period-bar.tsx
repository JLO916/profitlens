"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { AnalysisFilters, ComparisonMode, Period } from "@/domain/types";
import type { PeriodPreset } from "@/application/period-presets";
import { formatPeriodL1 } from "@/application/presentation";
import { channelSelection, groupIdOfOption, groupOptionValue, SUBSET_OPTION_VALUE } from "@/application/channel-settings";
import { channelLabel, scopeDetailText, snapshotResolver } from "@/application/copy";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";

// V3-3 A2：期間列（C23）、自訂期間 popover（C14）、需要處理橫幅（C22）、手機期間底部面板。
// 規則（PRD §6.3 #18–#20、§6.4 M1／M3／M6、§7.0）：
// - 桌機與手機是同一份 DOM：手機只用 CSS 把期間列收成一顆按鈕，點開後同一個面板改成底部面板；日期欄位 id 只有一份。
// - 自訂期間 popover 與手機底部面板都用 CSS（data-open）隱藏，內容保持掛載，不做條件渲染。
// - D-V3-10＝A：快捷單擊就套用；只有在自訂期間裡手動改日期才需要按「套用」。
// V42-2a（D-V42-10；PRD §4.1）：通路選單改兩層（同一個原生 <select>）——每個群組一個 <optgroup>（群組本身一個選項＋成員通路）、沒有群組的通路放最後一組「未分組」；
// 沒有任何群組時 markup 與 v4.1.3 逐位元組相同（只多 data-testid="scope-select"）；範圍是沒有對應群組的子集時最後加一個只讀選項「{n} 個通路」。行高與 class 不變。

export type PeriodDates = { previousStart: string; previousEnd: string; currentStart: string; currentEnd: string };
/** 目前已套用的範圍（取自快照），用來寫期間摘要與手機按鈕文字。 */
export type AppliedPeriodScope = { previous: Period; current: Period; previousDays: number; currentDays: number; comparisonMode: ComparisonMode; channelsText: string; dataAsOf: string };

const fieldLabel = (edge: "start" | "end", period: string) => fill(edge === "start" ? labels.shell.periodBar.filter.periodStart : labels.shell.periodBar.filter.periodEnd, { period });
const modeText = (mode: ComparisonMode) => mode === "calendar_months" ? labels.shell.periods.calendarMonths : labels.shell.periods.sameDays;

/** 期間摘要：可見文字只寫兩期與天數（§7.0）；detail 是通路、比較方式與資料到（v2 scopeNote 的其餘資訊，放 title 與 sr-only）。 */
export function periodSummary(scope: AppliedPeriodScope): { text: string; detail: string } {
  const range = (period: Period) => formatPeriodL1(period.start, period.end, { anchor: scope.dataAsOf, days: false });
  const current = range(scope.current), previous = range(scope.previous);
  const text = scope.previousDays === scope.currentDays
    ? fill(labels.shell.periodBarV3.summary, { current, previous, days: scope.currentDays })
    : fill(labels.shell.periodBarV3.summaryUnequal, { current, previous, currentDays: scope.currentDays, previousDays: scope.previousDays });
  const detail = fill(labels.shell.periodBarV3.summaryDetail, { channels: scope.channelsText, mode: modeText(scope.comparisonMode), dataAsOf: scope.dataAsOf });
  return { text, detail };
}

/** D-V3-10＝A：按快捷就用這組篩選套用（通路沿用目前範圍）；與「套用」按鈕走同一個 applyFilters。不可用的快捷回傳 null。 */
export function presetFilters(preset: PeriodPreset, channels: string[]): AnalysisFilters | null {
  if (preset.status !== "ready") return null;
  return { comparison_mode: preset.comparison_mode, channels, previous_period: { ...preset.previous }, current_period: { ...preset.current } };
}

/** 已套用的範圍對到哪一個快捷（沒有就回傳 null）。 */
export function appliedPreset(presets: PeriodPreset[], scope: Pick<AppliedPeriodScope, "previous" | "current" | "comparisonMode">): PeriodPreset | null {
  return presets.find(preset => preset.status === "ready" && preset.comparison_mode === scope.comparisonMode && preset.previous.start === scope.previous.start && preset.previous.end === scope.previous.end && preset.current.start === scope.current.start && preset.current.end === scope.current.end) ?? null;
}

/** 手機期間按鈕：「近 4 週 · 7/13–8/23」；沒有對到快捷時「自訂期間 · 7/13–8/23」。 */
export function periodToggleText(presets: PeriodPreset[], scope: AppliedPeriodScope): string {
  const preset = appliedPreset(presets, scope);
  return fill(labels.shell.periodBarV3.toggle, { preset: preset?.label ?? labels.shell.periodBarV3.custom, range: formatPeriodL1(scope.current.start, scope.current.end, { anchor: scope.dataAsOf, days: false }) });
}

const Chevron = () => <svg className="period-chevron" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
/** 只有看得到的元素才接焦點（手機上自訂期間按鈕是 display:none；桌機上手機按鈕是 display:none）。 */
const focusIfShown = (element: HTMLElement | null) => { if (element && element.getClientRects().length > 0) element.focus(); };

export type ChannelOption = { value: string; label: string };
/** V42-2a：一個群組在選單裡的一組（value 是帶控制字元前綴的群組選項值，members 依 manifest 順序）。 */
export type ChannelGroupOption = { id: string; label: string; value: string; members: ChannelOption[] };
export type PeriodBarProps = {
  /** options＝未分組的通路（沒有群組時就是全部）；groups 空或未給＝單層選單；subset 為正整數時最後加只讀的「{n} 個通路」（value 指到它）。 */
  channel: { value: string; options: ChannelOption[]; groups?: ChannelGroupOption[]; subset?: number | null; onChange: (value: string) => void };
  presets: PeriodPreset[];
  /** 快捷的 aria-pressed（沿用 v2：與表單目前的日期與比較方式相同）。 */
  isPressed: (preset: PeriodPreset) => boolean;
  onPreset: (preset: PeriodPreset) => void;
  comparisonMode: ComparisonMode;
  onComparisonMode: (mode: ComparisonMode) => void;
  dates: PeriodDates;
  onDates: (dates: PeriodDates) => void;
  onSubmit: (event: FormEvent) => void;
  applyRef?: RefObject<HTMLButtonElement | null>;
  scope: AppliedPeriodScope;
  /** 套用中（status=loading）：期間列保持掛載，避免焦點掉到 body 與版面跳動。 */
  busy?: boolean;
  /** V4-8a（D-V3-35＝A）：按了不可用（aria-disabled）的快捷：不套用、手機面板不關（同 v3），只通知 dashboard（去年同期的理由改成按了才顯示）。 */
  onUnavailablePreset?: (preset: PeriodPreset) => void;
};

export type ChannelSelectModel = { value: string; options: ChannelOption[]; groups: ChannelGroupOption[]; subset: number | null; channelsText: string };
/**
 * V42-2a（D-V42-10；PRD §4.1）：期間列通路選單的模型（dashboard 與 tests/helpers/page-states.tsx 的 shellPage 共用）。
 * 通路依 manifest 順序（order 欄位本批不套到期間列，同 V42-1b）；群組依快照 channel_groups 的順序，成員依 manifest 順序；未分組的通路在 options。
 * value 依 channelSelection（全部 ""、單一通路代碼、群組選項值、子集 SUBSET_OPTION_VALUE）；channelsText 依 scopeDetailText（群組寫「{群組名}（成員）」，給期間摘要的 title 與 sr-only）。
 * 沒有群組時 options 與 value 與 v4.1.3 相同（子集除外：v4.1.3 顯示「全部通路」，現在是只讀的「{n} 個通路」）。
 */
export function channelSelectModel(input: { snapshot: Pick<WorkspaceSnapshot, "report" | "channel_names" | "channel_groups">; manifestChannels: readonly string[] }): ChannelSelectModel {
  const { snapshot, manifestChannels } = input;
  const resolver = snapshotResolver(snapshot);
  const groups = snapshot.channel_groups ?? [];
  const option = (code: string): ChannelOption => ({ value: code, label: channelLabel(code, resolver) });
  const grouped = new Set(groups.flatMap(group => group.members));
  const channels = snapshot.report.scope.channels;
  const selection = channelSelection(channels, manifestChannels, groups);
  const value = selection.kind === "all" ? "" : selection.kind === "channel" ? selection.code : selection.kind === "group" ? groupOptionValue(selection.group.id) : SUBSET_OPTION_VALUE;
  return {
    value,
    options: manifestChannels.filter(code => !grouped.has(code)).map(option),
    groups: groups.map(group => ({ id: group.id, label: group.label, value: groupOptionValue(group.id), members: manifestChannels.filter(code => group.members.includes(code)).map(option) })),
    subset: selection.kind === "subset" ? selection.count : null,
    channelsText: scopeDetailText(channels, resolver),
  };
}
/** V42-2a：選單選項值 → 要套用的通路（A 級，之後走既有的 applyFilters）：「全部通路」→ manifest 全部；群組 → 成員；只讀的子集選項或不認得的群組 → null（不動）；其餘 → 單一通路。 */
export function channelsForOption(value: string, model: Pick<ChannelSelectModel, "groups">, manifestChannels: readonly string[]): string[] | null {
  if (value === "") return [...manifestChannels];
  if (value === SUBSET_OPTION_VALUE) return null;
  const groupId = groupIdOfOption(value);
  if (groupId === null) return [value];
  const group = model.groups.find(item => item.id === groupId);
  return group ? group.members.map(member => member.value) : null;
}
/** V42-2a：選單的選項——沒有群組時與 v4.1.3 相同（只有通路選項）；有群組時每群組一個 <optgroup>，未分組的通路放最後一組；子集的只讀選項一律在最後。 */
function channelOptions(channel: PeriodBarProps["channel"]) {
  const plain = (options: ChannelOption[]) => options.map(option => <option key={option.value} value={option.value}>{option.label}</option>);
  const groups = channel.groups ?? [];
  const subset = channel.subset != null && channel.subset > 0 ? <option value={SUBSET_OPTION_VALUE} disabled>{fill(labels.shell.periodBarV42.subsetCount, { n: channel.subset })}</option> : null;
  if (groups.length === 0) return <>{plain(channel.options)}{subset}</>;
  return <>
    {groups.map(group => <optgroup key={group.id} label={group.label}><option value={group.value} data-testid={`scope-option-group-${group.id}`}>{group.label}</option>{plain(group.members)}</optgroup>)}
    {channel.options.length > 0 && <optgroup label={labels.shell.periodBarV42.ungrouped}>{plain(channel.options)}</optgroup>}
    {subset}
  </>;
}

export function PeriodBar({ channel, presets, isPressed, onPreset, comparisonMode, onComparisonMode, dates, onDates, onSubmit, applyRef, scope, busy = false, onUnavailablePreset }: PeriodBarProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const customRef = useRef<HTMLDivElement>(null);
  const customButtonRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const summary = periodSummary(scope);

  // M3：Esc 關閉並回焦；自訂期間 popover 另有外部點擊關閉（底部面板用遮罩點擊關閉）。對話框（抽屜、取代確認）裡的操作不影響。
  useEffect(() => {
    if (!customOpen && !sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest("dialog")) return;
      if (customOpen) { setCustomOpen(false); focusIfShown(customButtonRef.current); }
      if (sheetOpen) { setSheetOpen(false); focusIfShown(toggleRef.current); }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target instanceof Element && target.closest("dialog")) return;
      if (customOpen && (!target || !customRef.current?.contains(target))) setCustomOpen(false);
    };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [customOpen, sheetOpen]);
  useEffect(() => { if (sheetOpen) focusIfShown(sheetCloseRef.current); }, [sheetOpen]);

  function closeSheet() { setSheetOpen(false); focusIfShown(toggleRef.current); }
  function choose(preset: PeriodPreset) {
    if (preset.status !== "ready") { onUnavailablePreset?.(preset); return; }
    onPreset(preset);
    if (sheetOpen) closeSheet();
  }
  function submit(event: FormEvent) {
    onSubmit(event);
    if (customOpen) { setCustomOpen(false); focusIfShown(customButtonRef.current); }
    if (sheetOpen) closeSheet();
  }

  return <div className="period-bar" data-testid="period-bar" data-sheet-open={sheetOpen || undefined} aria-busy={busy || undefined}>
    <button ref={toggleRef} type="button" className="ui-btn ui-btn-secondary period-toggle" data-testid="period-toggle" aria-expanded={sheetOpen} aria-controls="period-bar-panel" aria-label={periodToggleAria(presets, scope)} onClick={() => setSheetOpen(open => !open)}><span>{periodToggleText(presets, scope)}</span><Chevron /></button>
    <div className="period-sheet-scrim" aria-hidden="true" onClick={closeSheet} />
    <div id="period-bar-panel" className="period-bar-panel" role="region" aria-label={labels.shell.periodBarV3.regionAria}>
      <div className="period-sheet-head"><p className="period-sheet-title">{labels.shell.periodBarV3.sheetTitle}</p><button ref={sheetCloseRef} type="button" className="ui-btn ui-btn-secondary" onClick={closeSheet}>{labels.shell.periodBarV3.sheetClose}</button></div>
      <label className="period-channel"><span className="sr-only">{labels.shell.periodBar.filter.channel}</span><select className="ui-field-control" aria-label={labels.shell.periodBar.filter.channel} data-testid="scope-select" value={channel.value} onChange={event => channel.onChange(event.target.value)}><option value="">{labels.shell.periodBar.filter.allChannels}</option>{channelOptions(channel)}</select></label>
      <div className="ui-segmented period-presets" role="group" aria-label={labels.shell.sections.presetGroup} data-testid="period-presets">
        {presets.map(preset => <button key={preset.id} type="button" className="preset" aria-disabled={preset.status !== "ready" || undefined} aria-describedby={preset.status === "ready" ? undefined : `preset-reason-${preset.id}`} title={preset.status === "ready" ? undefined : preset.reason} aria-pressed={isPressed(preset)} onClick={() => choose(preset)}>{preset.label}</button>)}
        {presets.filter(preset => preset.status !== "ready").map(preset => <span key={preset.id} id={`preset-reason-${preset.id}`} className="sr-only">{fill(labels.shell.periodBar.filter.presetReason, { preset: preset.label, reason: preset.status === "unavailable" ? preset.reason : "" })}</span>)}
      </div>
      <p className="period-summary" data-testid="period-summary" title={summary.detail}>{summary.text}<span className="sr-only">{summary.detail}</span></p>
      <div className="period-custom" ref={customRef}>
        <button ref={customButtonRef} type="button" className="ui-btn ui-btn-secondary period-custom-trigger" data-testid="period-custom" aria-expanded={customOpen} aria-controls="period-custom-panel" onClick={() => setCustomOpen(open => !open)}>{labels.shell.periodBarV3.custom}<Chevron /></button>
        <div id="period-custom-panel" className="ui-popover period-custom-panel" role="region" aria-label={labels.shell.periodBarV3.customPanelAria} data-open={customOpen || undefined} data-testid="period-custom-panel">
          <form className="period-form" onSubmit={submit}>
            <label className="comparison-mode"><span className="ui-field-label">{labels.shell.periodBar.filter.comparisonMode}</span><select className="ui-field-control" aria-label={labels.shell.periodBar.filter.comparisonMode} value={comparisonMode} onChange={event => onComparisonMode(event.target.value as ComparisonMode)}><option value="same_days">{labels.shell.periods.sameDays}</option><option value="calendar_months">{labels.shell.periods.calendarMonths}</option></select></label>
            <fieldset><legend>{labels.shell.periods.previous}</legend><label className="sr-only" htmlFor="previous-start">{fieldLabel("start", labels.shell.periods.previous)}</label><input id="previous-start" className="ui-field-control" type="date" required value={dates.previousStart} onChange={e => onDates({ ...dates, previousStart: e.target.value })} /><span aria-hidden="true">–</span><label className="sr-only" htmlFor="previous-end">{fieldLabel("end", labels.shell.periods.previous)}</label><input id="previous-end" className="ui-field-control" type="date" required value={dates.previousEnd} onChange={e => onDates({ ...dates, previousEnd: e.target.value })} /></fieldset>
            <fieldset><legend>{labels.shell.periods.current}</legend><label className="sr-only" htmlFor="current-start">{fieldLabel("start", labels.shell.periods.current)}</label><input id="current-start" className="ui-field-control" type="date" required value={dates.currentStart} onChange={e => onDates({ ...dates, currentStart: e.target.value })} /><span aria-hidden="true">–</span><label className="sr-only" htmlFor="current-end">{fieldLabel("end", labels.shell.periods.current)}</label><input id="current-end" className="ui-field-control" type="date" required value={dates.currentEnd} onChange={e => onDates({ ...dates, currentEnd: e.target.value })} /></fieldset>
            <p className="period-custom-hint">{labels.shell.periodBarV3.customHint}</p>
            <button ref={applyRef} className="ui-btn ui-btn-primary" type="submit">{labels.shell.buttons.apply}</button>
          </form>
        </div>
      </div>
    </div>
  </div>;
}

function periodToggleAria(presets: PeriodPreset[], scope: AppliedPeriodScope): string {
  const preset = appliedPreset(presets, scope);
  return fill(labels.shell.periodBarV3.toggleAria, { preset: preset?.label ?? labels.shell.periodBarV3.custom, range: formatPeriodL1(scope.current.start, scope.current.end, { anchor: scope.dataAsOf, days: false }) });
}

export type NeedsAttentionProps = {
  /** 篩選或套用失敗的訊息（不利色、role=alert）。 */
  filterError?: string;
  /** 部分資料待補時的資料問題數；null 表示不是 partial。 */
  partialIssues?: number | null;
  onViewIssues?: () => void;
  /** 去年同期不可用的理由（12px 文字，保留 preset-reason-visible-yoy）。 */
  yoyReason?: string | null;
  /** V4-8a（D-V3-35＝A）：使用者在本次工作階段按了停用的「去年同期」才為 true；false 時理由保持掛載但 hidden（≤ 767 照 v3 一律不顯示，見 globals.css）。 */
  yoyHintVisible?: boolean;
};

/** C22 需要處理橫幅：期間列下方的固定位置；沒有內容時不渲染（不預留高度）。V4-8a：只剩隱藏的去年同期理由時整塊 hidden（保持掛載，不佔高度）。 */
export function NeedsAttention({ filterError, partialIssues = null, onViewIssues, yoyReason = null, yoyHintVisible = false }: NeedsAttentionProps) {
  if (!filterError && partialIssues === null && !yoyReason) return null;
  const yoyShown = !!yoyReason && yoyHintVisible;
  return <div className="needs-attention" data-testid="needs-attention" role="group" aria-label={labels.shell.banner.regionAria} hidden={(!filterError && partialIssues === null && !yoyShown) || undefined}>
    {filterError && <p role="alert" className="ui-banner period-banner" data-tone="unfavorable" data-testid="banner-filter-error">{filterError}</p>}
    {partialIssues !== null && <div className="ui-banner period-banner" data-tone="warning" data-testid="banner-partial"><span>{labels.shell.banner.partial}</span><button type="button" className="ui-btn ui-btn-text" onClick={onViewIssues}>{fill(labels.shell.periodBar.viewIssues, { n: partialIssues })}</button></div>}
    {yoyReason && <p className="period-banner-note" role="status" data-testid="preset-reason-visible-yoy" hidden={!yoyHintVisible || undefined}>{fill(labels.shell.banner.yoyUnavailable, { reason: yoyReason })}</p>}
  </div>;
}
