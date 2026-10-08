"use client";

import { useState } from "react";
import { columnGuidance } from "@/application/import-guidance";
import { conversionExample, conversionFieldsSelected, monthShortcut, taxRate, FILE_ROLES, type WizardAction, type WizardSettings, type WizardState } from "@/application/import-wizard";
import { CONVERTIBLE_FIELDS, type AmountBasisChoice } from "@/application/tax-basis";
import { ANALYSIS_CHANNEL_LIMIT_MESSAGE, ANALYSIS_PERIOD_LIMIT_MESSAGE } from "@/application/limits";
import { formatCount, formatPeriodL1 } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { fileLabels } from "./step-files";

const copy = labels.importWizard;
const v3 = copy.wizardV3;
const panel = labels.importWizard.panel;
type DateKey = Exclude<keyof WizardSettings, "channels" | "sales_coverage_confirmed" | "comparison_mode" | "dataset_id">;
const coverageFields: { key: DateKey; label: string }[] = [{ key: "coverage_start", label: copy.coverageStart }, { key: "coverage_end", label: copy.coverageEnd }];
const periodFields: { key: DateKey; label: string }[] = [
  { key: "previous_start", label: labels.exports.csv.columns.previous_start }, { key: "previous_end", label: labels.exports.csv.columns.previous_end },
  { key: "current_start", label: labels.exports.csv.columns.current_start }, { key: "current_end", label: labels.exports.csv.columns.current_end },
];
const basisOptions: { value: AmountBasisChoice; label: string; help: string }[] = [
  { value: "exclusive", label: copy.basis.exclusive, help: v3.basisHelp.exclusive },
  { value: "inclusive", label: copy.basis.inclusive, help: v3.basisHelp.inclusive },
  { value: "unknown", label: copy.basis.unsure, help: v3.basisHelp.unsure },
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * §7.7.1 驗收：步驟 3 選「含稅」後預設可見的控制 ≤ 12（不含底部動作列與 stepper）。
 * 固定可見：金額基準 3 個 radio、稅率、「調整換算欄位」、資料集名稱、資料到、涵蓋起日、涵蓋迄日、「調整比較期間」、版頭「取消匯入」＝11。
 * 剩下的名額給通路勾選框；通路多於名額時改成「已選 n 個通路」一行＋「調整通路」展開（用含稅的最多控制數計算，切換金額基準時版面不跳）。
 */
export const STEP3_VISIBLE_BUDGET = 12;
const STEP3_FIXED_VISIBLE = 3 + 2 + 4 + 1 + 1;
export const CHANNELS_INLINE_MAX = STEP3_VISIBLE_BUDGET - STEP3_FIXED_VISIBLE;

export function StepBasis({ state, dispatch }: { state: WizardState; dispatch: (action: WizardAction) => void }) {
  const rate = taxRate(state);
  const { settings } = state;
  const months = monthShortcut({ start: settings.coverage_start, end: settings.coverage_end });
  const example = rate ? conversionExample(rate) : null;
  const convertCount = FILE_ROLES.reduce((sum, role) => sum + state.convertFields[role].length, 0);
  const periodsSet = periodFields.every(({ key }) => ISO_DATE.test(settings[key]));
  // 進入第 3 步時兩期沒填好（沒有提議）、或一個通路都沒勾，就先展開對應的收合區；之後由使用者開關。
  const [periodsOpen] = useState(() => !periodsSet);
  const [channelsOpen] = useState(() => settings.channels.length === 0);
  const channelsInline = state.availableChannels.length <= CHANNELS_INLINE_MAX;
  const setting = (key: Exclude<keyof WizardSettings, "channels" | "sales_coverage_confirmed">, value: string) => dispatch({ type: "setting", key, value });
  const dateField = ({ key, label }: { key: DateKey; label: string }) => <label key={key} className="ui-field"><span className="ui-field-label">{label}</span><input className="ui-field-control" aria-label={label} type="date" value={settings[key]} onChange={event => setting(key, event.target.value)} /></label>;
  const channelGroup = <div className="channel-list" role="group" aria-label={copy.channelsTitle}>{state.availableChannels.map(channel => <label key={channel} className="check-label"><input type="checkbox" className="ui-check" aria-label={channel} checked={settings.channels.includes(channel)} onChange={event => dispatch({ type: "channel", channel, checked: event.target.checked })} />{channel}</label>)}</div>;
  return <div data-testid="import-step-3" className="wizard-step">
    {/* §7.7.2 步驟 3：金額基準 radio（未稅／含稅／不確定），每個選項下一行 13px 說明。 */}
    <fieldset className="basis-choice"><legend>{copy.basis.label}</legend>
      {basisOptions.map(option => <div key={option.value} className="basis-option">
        <label className="radio-label"><input type="radio" className="ui-check" name="amount-basis" value={option.value} aria-label={option.label} aria-describedby={`import-basis-${option.value}-help`} checked={state.basis === option.value} onChange={() => dispatch({ type: "basis", basis: option.value })} />{option.label}</label>
        <p className="basis-help" id={`import-basis-${option.value}-help`}>{option.help}</p>
      </div>)}
      {state.basis === null && <p className="wizard-note">{copy.basisRequired}</p>}
      {state.basis === "unknown" && <div className="ui-notice" data-tone="warning" role="alert"><p>{copy.basisUnsureHelp}</p><p>{copy.basisUnsureStop}</p></div>}
      {/* 選「含稅」：稅率＋「將換算 n 個欄位」一行；9 個可換算欄位（D2 預設勾 8 個，由 reducer 決定）收在「調整換算欄位」裡，內容保持掛載。 */}
      {state.basis === "inclusive" && <div className="conversion-settings" data-testid="import-conversion">
        <label className="ui-field rate-field"><span className="ui-field-label">{copy.rateLabel}</span><input className="ui-field-control" aria-label={copy.rateLabel} type="number" inputMode="numeric" min={0} max={20} step={1} value={state.ratePercent} onChange={event => dispatch({ type: "ratePercent", percent: event.target.value })} /><small className="ui-field-hint">{copy.rateNote}</small></label>
        {rate === null ? <p className="ui-notice" data-tone="unfavorable">{copy.rateInvalid}</p> : example && <p className="wizard-note">{fill(copy.conversionExample, example)}</p>}
        <p className="wizard-line">{fill(v3.convertCount, { n: formatCount(convertCount, "L2") })}</p>
        <details className="wizard-details convert-details"><summary>{v3.adjustConvert}</summary>
          <h3>{copy.convertFields}</h3>
          <div className="convert-grid">{FILE_ROLES.map(role => <div key={role} className="convert-group"><strong>{fileLabels[role]}</strong>{CONVERTIBLE_FIELDS[role].map(field => <label key={field} className="check-label"><input type="checkbox" className="ui-check" aria-label={`${fileLabels[role]} ${columnGuidance[field].label}`} checked={state.convertFields[role].includes(field)} onChange={event => dispatch({ type: "convertField", role, field, checked: event.target.checked })} /><span className="check-text">{fill(panel.fieldWithKey, { label: columnGuidance[field].label, field })}<small>{copy.convertFieldHints[field]}</small></span></label>)}</div>)}</div>
        </details>
        {!conversionFieldsSelected(state) && <p className="ui-notice" data-tone="unfavorable">{copy.convertFieldsRequired}</p>}
        <p className="wizard-note">{copy.basisNote}</p>
      </div>}
    </fieldset>
    {/* §7.7.2 步驟 3：設定提案改兩欄表單（資料集名稱、資料到、涵蓋起訖）；比較方式、兩期日期與整月捷徑收在「調整比較期間」，通路依名額直接列出或收合。 */}
    <section className="settings-proposal" aria-label={copy.settingsTitle} data-testid="import-settings-proposal">
      <div className="wizard-section-head"><h3>{copy.settingsTitle}</h3><span className="ui-lozenge" data-tone="warning">{state.settingsSource === "manifest" ? copy.settingsFromManifest : copy.proposedBy}</span></div>
      {state.settingsSource === "none" && <p className="ui-notice" data-tone="warning" role="status">{copy.proposalUnavailable}</p>}
      <div className="ui-form-grid">
        <label className="ui-field"><span className="ui-field-label">{copy.datasetName}</span><input className="ui-field-control" aria-label={copy.datasetName} value={settings.dataset_id} onChange={event => setting("dataset_id", event.target.value)} /></label>
        <label className="ui-field"><span className="ui-field-label">{copy.dataAsOf}</span><input className="ui-field-control" aria-label={copy.dataAsOf} type="date" value={settings.data_as_of} onChange={event => setting("data_as_of", event.target.value)} /><small className="ui-field-hint">{copy.dataAsOfNote}</small></label>
        {coverageFields.map(dateField)}
      </div>
      <div className="wizard-group">
        <p className="wizard-line">{periodsSet ? fill(v3.periodsSummary, { mode: settings.comparison_mode === "calendar_months" ? labels.shell.periods.calendarMonths : labels.shell.periods.sameDays, previous: formatPeriodL1(settings.previous_start, settings.previous_end, { anchor: settings.current_end }), current: formatPeriodL1(settings.current_start, settings.current_end, { anchor: settings.current_end }) }) : v3.periodsUnset}</p>
        <details className="wizard-details" open={periodsOpen || undefined}><summary>{v3.adjustPeriods}</summary>
          <div className="ui-form-grid">
            <label className="ui-field"><span className="ui-field-label">{copy.comparisonMode}</span><select className="ui-field-control" aria-label={copy.comparisonMode} value={settings.comparison_mode} onChange={event => setting("comparison_mode", event.target.value)}><option value="same_days">{labels.shell.periods.sameDays}</option><option value="calendar_months">{labels.shell.periods.calendarMonths}</option></select></label>
            <div className="ui-field month-shortcut">{months ? <button type="button" className="ui-btn ui-btn-secondary" onClick={() => dispatch({ type: "monthShortcut" })}>{fill(copy.monthShortcut, { previous: months.previous.start.slice(0, 7), current: months.current.start.slice(0, 7) })}</button> : <p className="wizard-note">{copy.monthShortcutUnavailable}</p>}</div>
            {periodFields.map(dateField)}
          </div>
          <details className="wizard-details"><summary>{panel.limitsSummary}</summary><p className="wizard-note">{panel.settingsNote}</p><p className="wizard-note">{ANALYSIS_PERIOD_LIMIT_MESSAGE}</p><p className="wizard-note">{ANALYSIS_CHANNEL_LIMIT_MESSAGE}</p></details>
        </details>
      </div>
      <div className="wizard-group">
        <p className="ui-field-label">{copy.channelsTitle}</p>
        {state.availableChannels.length === 0 ? <p className="wizard-note">{copy.channelsNone}</p> : channelsInline ? channelGroup : <>
          {settings.channels.length > 0 && <p className="wizard-line">{fill(v3.channelsSelected, { n: formatCount(settings.channels.length, "L2"), channels: settings.channels.join("、") })}</p>}
          <details className="wizard-details" open={channelsOpen || undefined}><summary>{v3.adjustChannels}</summary>{channelGroup}</details>
        </>}
        {settings.channels.length === 0 && <p className="ui-notice" data-tone="unfavorable">{copy.channelsRequired}</p>}
        <p className="wizard-note">{copy.channelsNote}</p>
      </div>
    </section>
    <ul className="confirm-list"><li>{copy.coverageConfirm}</li><li>{copy.amountConfirm}</li></ul>
    <p className="wizard-note">{copy.confirmHint}</p>
  </div>;
}
