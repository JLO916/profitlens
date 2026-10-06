"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { AnalysisFilters, ComparisonMode, Period } from "@/domain/types";
import type { PeriodPreset } from "@/application/period-presets";
import { formatPeriodL1 } from "@/application/presentation";
import { fill, labels } from "@/i18n";

// V3-3 A2：期間列（C23）、自訂期間 popover（C14）、需要處理橫幅（C22）、手機期間底部面板。
// 規則（PRD §6.3 #18–#20、§6.4 M1／M3／M6、§7.0）：
// - 桌機與手機是同一份 DOM：手機只用 CSS 把期間列收成一顆按鈕，點開後同一個面板改成底部面板；日期欄位 id 只有一份。
// - 自訂期間 popover 與手機底部面板都用 CSS（data-open）隱藏，內容保持掛載，不做條件渲染。
// - D-V3-10＝A：快捷單擊就套用；只有在自訂期間裡手動改日期才需要按「套用」。

export type PeriodDates = { previousStart: string; previousEnd: string; currentStart: string; currentEnd: string };
/** 目前已套用的範圍（取自快照），用來寫期間摘要與手機按鈕文字。 */
export type AppliedPeriodScope = { previous: Period; current: Period; previousDays: number; currentDays: number; comparisonMode: ComparisonMode; channelsText: string; dataAsOf: string };

const fieldLabel = (edge: "start" | "end", period: string) => fill(edge === "start" ? labels.ui.dashboard.filter.periodStart : labels.ui.dashboard.filter.periodEnd, { period });
const modeText = (mode: ComparisonMode) => mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;

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

export type PeriodBarProps = {
  channel: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
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
};

export function PeriodBar({ channel, presets, isPressed, onPreset, comparisonMode, onComparisonMode, dates, onDates, onSubmit, applyRef, scope, busy = false }: PeriodBarProps) {
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
    if (preset.status !== "ready") return;
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
      <label className="period-channel"><span className="sr-only">{labels.ui.dashboard.filter.channel}</span><select className="ui-field-control" aria-label={labels.ui.dashboard.filter.channel} value={channel.value} onChange={event => channel.onChange(event.target.value)}><option value="">{labels.ui.dashboard.filter.allChannels}</option>{channel.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className="ui-segmented period-presets" role="group" aria-label={labels.sections.presetGroup} data-testid="period-presets">
        {presets.map(preset => <button key={preset.id} type="button" className="preset" aria-disabled={preset.status !== "ready" || undefined} aria-describedby={preset.status === "ready" ? undefined : `preset-reason-${preset.id}`} title={preset.status === "ready" ? undefined : preset.reason} aria-pressed={isPressed(preset)} onClick={() => choose(preset)}>{preset.label}</button>)}
        {presets.filter(preset => preset.status !== "ready").map(preset => <span key={preset.id} id={`preset-reason-${preset.id}`} className="sr-only">{fill(labels.ui.dashboard.filter.presetReason, { preset: preset.label, reason: preset.status === "unavailable" ? preset.reason : "" })}</span>)}
      </div>
      <p className="period-summary" data-testid="period-summary" title={summary.detail}>{summary.text}<span className="sr-only">{summary.detail}</span></p>
      <div className="period-custom" ref={customRef}>
        <button ref={customButtonRef} type="button" className="ui-btn ui-btn-secondary period-custom-trigger" data-testid="period-custom" aria-expanded={customOpen} aria-controls="period-custom-panel" onClick={() => setCustomOpen(open => !open)}>{labels.shell.periodBarV3.custom}<Chevron /></button>
        <div id="period-custom-panel" className="ui-popover period-custom-panel" role="region" aria-label={labels.shell.periodBarV3.customPanelAria} data-open={customOpen || undefined} data-testid="period-custom-panel">
          <form className="period-form" onSubmit={submit}>
            <label className="comparison-mode"><span className="ui-field-label">{labels.ui.dashboard.filter.comparisonMode}</span><select className="ui-field-control" aria-label={labels.ui.dashboard.filter.comparisonMode} value={comparisonMode} onChange={event => onComparisonMode(event.target.value as ComparisonMode)}><option value="same_days">{labels.periods.sameDays}</option><option value="calendar_months">{labels.periods.calendarMonths}</option></select></label>
            <fieldset><legend>{labels.periods.previous}</legend><label className="sr-only" htmlFor="previous-start">{fieldLabel("start", labels.periods.previous)}</label><input id="previous-start" className="ui-field-control" type="date" required value={dates.previousStart} onChange={e => onDates({ ...dates, previousStart: e.target.value })} /><span aria-hidden="true">–</span><label className="sr-only" htmlFor="previous-end">{fieldLabel("end", labels.periods.previous)}</label><input id="previous-end" className="ui-field-control" type="date" required value={dates.previousEnd} onChange={e => onDates({ ...dates, previousEnd: e.target.value })} /></fieldset>
            <fieldset><legend>{labels.periods.current}</legend><label className="sr-only" htmlFor="current-start">{fieldLabel("start", labels.periods.current)}</label><input id="current-start" className="ui-field-control" type="date" required value={dates.currentStart} onChange={e => onDates({ ...dates, currentStart: e.target.value })} /><span aria-hidden="true">–</span><label className="sr-only" htmlFor="current-end">{fieldLabel("end", labels.periods.current)}</label><input id="current-end" className="ui-field-control" type="date" required value={dates.currentEnd} onChange={e => onDates({ ...dates, currentEnd: e.target.value })} /></fieldset>
            <p className="period-custom-hint">{labels.shell.periodBarV3.customHint}</p>
            <button ref={applyRef} className="ui-btn ui-btn-primary" type="submit">{labels.buttons.apply}</button>
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
};

/** C22 需要處理橫幅：期間列下方的固定位置；沒有內容時不渲染（不預留高度）。 */
export function NeedsAttention({ filterError, partialIssues = null, onViewIssues, yoyReason = null }: NeedsAttentionProps) {
  if (!filterError && partialIssues === null && !yoyReason) return null;
  return <div className="needs-attention" data-testid="needs-attention" role="group" aria-label={labels.shell.banner.regionAria}>
    {filterError && <p role="alert" className="ui-banner period-banner" data-tone="unfavorable" data-testid="banner-filter-error">{filterError}</p>}
    {partialIssues !== null && <div className="ui-banner period-banner" data-tone="warning" data-testid="banner-partial"><span>{labels.shell.banner.partial}</span><button type="button" className="ui-btn ui-btn-text" onClick={onViewIssues}>{fill(labels.ui.dashboard.viewIssues, { n: partialIssues })}</button></div>}
    {yoyReason && <p className="period-banner-note" role="status" data-testid="preset-reason-visible-yoy">{fill(labels.shell.banner.yoyUnavailable, { reason: yoyReason })}</p>}
  </div>;
}
