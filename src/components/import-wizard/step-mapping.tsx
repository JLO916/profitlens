"use client";

import { columnGuidance } from "@/application/import-guidance";
import { importColumns } from "@/application/import";
import { isOrderLevel } from "@/application/source-presets";
import { FILE_ROLES, missingFields, unusedHeaders, ORDER_AGGREGATION_DOC_PATH, ORDER_AGGREGATION_DOC_URL, type WizardState } from "@/application/import-wizard";
import type { FileName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { fileLabels } from "./step-files";

const copy = labels.importWizard;
const panel = labels.ui.importPanel;
const shortDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : iso;

export function StepMapping({ state, onMap, onIgnore }: {
  state: WizardState;
  onMap: (role: FileName, field: string, source: string) => void;
  onIgnore: (role: FileName, value: boolean) => void;
}) {
  return <div data-testid="import-step-2">
    <p className="note">{copy.mappingIntro}</p>
    {state.mappingSkipped && <p className="note" role="status">{copy.allExact}</p>}
    {FILE_ROLES.map(role => {
      const file = state.files[role];
      if (!file?.draft.parsed) return null;
      const parsed = file.draft.parsed;
      const unused = unusedHeaders(file), missing = missingFields(file);
      const usesMemory = Object.values(file.origins).includes("memory");
      const preset = file.preset;
      return <article className="file-card mapping-card" key={role} data-testid={`import-mapping-${role}`}>
        <h3>{fileLabels[role]} <span className="tag">{file.draft.name}</span></h3>
        {usesMemory && file.memory && <p className="hint memory" data-testid="import-memory-hint">{fill(copy.memoryHint, { date: shortDate(file.memory.used_at) })}</p>}
        {preset && (isOrderLevel(preset.preset)
          ? <div className="alert" role="alert" data-testid="import-order-level"><p>{copy.orderLevelDetected}（{fill(copy.presetHint, { preset: copy.presetNames[preset.preset.id] ?? preset.preset.source })}）</p><p><a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.orderLevelLink}</a>（{ORDER_AGGREGATION_DOC_PATH}）</p></div>
          : <p className="hint preset" data-testid="import-preset-hint">{fill(copy.presetHint, { preset: copy.presetNames[preset.preset.id] ?? preset.preset.source })} {copy.presetUnverified}{preset.preset.grain === "daily_campaign" ? ` ${copy.campaignLevelDetected}` : ""}{preset.preset.inclusiveTax ? ` ${copy.presetInclusiveHint}` : ""}</p>)}
        <div className="table-scroll" role="region" aria-label={fill(panel.mappingSummary, { file: role })} tabIndex={0}>
          <table className="mapping-table">
            <thead><tr><th scope="col">{copy.mappingHead.field}</th><th scope="col">{copy.mappingHead.source}</th><th scope="col">{copy.mappingHead.samples}</th><th scope="col">{copy.mappingHead.status}</th></tr></thead>
            <tbody>{importColumns[role].map(field => {
              const source = file.draft.mapping[field] ?? "";
              const origin = file.origins[field] ?? "none";
              const index = source ? parsed.headers.indexOf(source) : -1;
              const samples = index >= 0 ? parsed.rows.slice(0, 3).map(row => row.values[index] || copy.noSamples).join("、") : "";
              return <tr key={field} className={`origin-${origin}`}>
                <th scope="row">{fill(panel.fieldWithKey, { label: columnGuidance[field].label, field })}<br /><small>{columnGuidance[field].meaning}</small></th>
                <td><select aria-label={fill(panel.mappingAria, { file: role, field })} value={source} onChange={event => onMap(role, field, event.target.value)}><option value="">{copy.selectColumn}</option>{parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></td>
                <td className="samples">{samples}</td>
                <td><span className={`tag origin ${origin}`}>{copy.mappingStatus[origin]}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {missing.length > 0 && <p className="alert">{fill(copy.mappingIncomplete, { fields: missing.join("、") })}</p>}
        {unused.length > 0 ? <><p className="note">{fill(copy.ignoredColumns, { columns: unused.join("、") })}</p><label className="check-label"><input type="checkbox" aria-label={fill(panel.ignoreAria, { file: role })} checked={file.draft.ignoredColumnsConfirmed} onChange={event => onIgnore(role, event.target.checked)} />{copy.ignoreConfirm}</label></> : <p className="note">{copy.noIgnored}</p>}
      </article>;
    })}
  </div>;
}
