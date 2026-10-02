"use client";

import { columnGuidance } from "@/application/import-guidance";
import { conversionExample, conversionFieldsSelected, monthShortcut, taxRate, FILE_ROLES, type WizardAction, type WizardSettings, type WizardState } from "@/application/import-wizard";
import { CONVERTIBLE_FIELDS, type AmountBasisChoice } from "@/application/tax-basis";
import { ANALYSIS_CHANNEL_LIMIT_MESSAGE, ANALYSIS_PERIOD_LIMIT_MESSAGE } from "@/application/limits";
import { fill, labels } from "@/i18n";
import { fileLabels } from "./step-files";

const copy = labels.importWizard;
const panel = labels.ui.importPanel;
type DateKey = Exclude<keyof WizardSettings, "channels" | "sales_coverage_confirmed" | "comparison_mode" | "dataset_id">;
const dateFields: { key: DateKey; label: string }[] = [
  { key: "coverage_start", label: copy.coverageStart }, { key: "coverage_end", label: copy.coverageEnd },
  { key: "previous_start", label: labels.csvColumns.previous_start }, { key: "previous_end", label: labels.csvColumns.previous_end },
  { key: "current_start", label: labels.csvColumns.current_start }, { key: "current_end", label: labels.csvColumns.current_end },
];
const basisOptions: { value: AmountBasisChoice; label: string }[] = [{ value: "exclusive", label: copy.basis.exclusive }, { value: "inclusive", label: copy.basis.inclusive }, { value: "unknown", label: copy.basis.unsure }];

export function StepBasis({ state, dispatch }: { state: WizardState; dispatch: (action: WizardAction) => void }) {
  const rate = taxRate(state);
  const months = monthShortcut({ start: state.settings.coverage_start, end: state.settings.coverage_end });
  const example = rate ? conversionExample(rate) : null;
  return <div data-testid="import-step-3">
    <fieldset className="basis-choice"><legend>{copy.basis.label}</legend>
      {basisOptions.map(option => <label key={option.value} className="radio-label"><input type="radio" name="amount-basis" value={option.value} aria-label={option.label} checked={state.basis === option.value} onChange={() => dispatch({ type: "basis", basis: option.value })} />{option.label}</label>)}
      {state.basis === null && <p className="note">{copy.basisRequired}</p>}
      {state.basis === "unknown" && <div className="alert" role="alert"><p>{copy.basisUnsureHelp}</p><p>{copy.basisUnsureStop}</p></div>}
      {state.basis === "inclusive" && <div className="conversion-settings" data-testid="import-conversion">
        <label>{copy.rateLabel}<input aria-label={copy.rateLabel} type="number" inputMode="numeric" min={0} max={20} step={1} value={state.ratePercent} onChange={event => dispatch({ type: "ratePercent", percent: event.target.value })} /><small>{copy.rateNote}</small></label>
        {rate === null ? <p className="alert">{copy.rateInvalid}</p> : example && <p className="note">{fill(copy.conversionExample, example)}</p>}
        <h4>{copy.convertFields}</h4>
        <div className="convert-grid">{FILE_ROLES.map(role => <div key={role}><strong>{fileLabels[role]}</strong>{CONVERTIBLE_FIELDS[role].map(field => <label key={field} className="check-label"><input type="checkbox" aria-label={`${fileLabels[role]} ${columnGuidance[field].label}`} checked={state.convertFields[role].includes(field)} onChange={event => dispatch({ type: "convertField", role, field, checked: event.target.checked })} />{fill(panel.fieldWithKey, { label: columnGuidance[field].label, field })}<small>{copy.convertFieldHints[field]}</small></label>)}</div>)}</div>
        {!conversionFieldsSelected(state) && <p className="alert">{copy.convertFieldsRequired}</p>}
        <p className="note">{copy.basisNote}</p>
      </div>}
    </fieldset>
    <section className="settings-block" aria-label={copy.settingsTitle} data-testid="import-settings-proposal">
      <div className="section-heading compact"><h3>{copy.settingsTitle}</h3><span className="tag">{state.settingsSource === "manifest" ? copy.settingsFromManifest : copy.proposedBy}</span></div>
      {state.settingsSource === "none" && <p className="alert" role="status">{copy.proposalUnavailable}</p>}
      <div className="import-settings">
        <label>{copy.datasetName}<input aria-label={copy.datasetName} value={state.settings.dataset_id} onChange={event => dispatch({ type: "setting", key: "dataset_id", value: event.target.value })} /></label>
        <label>{copy.dataAsOf}<input aria-label={copy.dataAsOf} type="date" value={state.settings.data_as_of} onChange={event => dispatch({ type: "setting", key: "data_as_of", value: event.target.value })} /><small>{copy.dataAsOfNote}</small></label>
        {dateFields.map(({ key, label }) => <label key={key}>{label}<input aria-label={label} type="date" value={state.settings[key]} onChange={event => dispatch({ type: "setting", key, value: event.target.value })} /></label>)}
        <label>{copy.comparisonMode}<select aria-label={copy.comparisonMode} value={state.settings.comparison_mode} onChange={event => dispatch({ type: "setting", key: "comparison_mode", value: event.target.value })}><option value="same_days">{labels.periods.sameDays}</option><option value="calendar_months">{labels.periods.calendarMonths}</option></select></label>
      </div>
      {months ? <button type="button" className="button quiet" onClick={() => dispatch({ type: "monthShortcut" })}>{fill(copy.monthShortcut, { previous: months.previous.start.slice(0, 7), current: months.current.start.slice(0, 7) })}</button> : <p className="note">{copy.monthShortcutUnavailable}</p>}
      <h4>{copy.channelsTitle}</h4>
      {state.availableChannels.length ? <div className="channel-list" role="group" aria-label={copy.channelsTitle}>{state.availableChannels.map(channel => <label key={channel} className="check-label"><input type="checkbox" aria-label={channel} checked={state.settings.channels.includes(channel)} onChange={event => dispatch({ type: "channel", channel, checked: event.target.checked })} />{channel}</label>)}</div> : <p className="note">{copy.channelsNone}</p>}
      {state.settings.channels.length === 0 && <p className="alert">{copy.channelsRequired}</p>}
      <p className="note">{copy.channelsNote}</p>
      <details><summary>{panel.limitsSummary}</summary><p className="note">{panel.settingsNote}</p><p className="note">{ANALYSIS_PERIOD_LIMIT_MESSAGE}</p><p className="note">{ANALYSIS_CHANNEL_LIMIT_MESSAGE}</p></details>
    </section>
    <ul className="confirm-list"><li>{copy.coverageConfirm}</li><li>{copy.amountConfirm}</li></ul>
    <p className="note">{copy.confirmHint}</p>
  </div>;
}
