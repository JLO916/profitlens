"use client";

import { useState } from "react";
import { columnGuidance } from "@/application/import-guidance";
import { importColumns } from "@/application/import";
import { isOrderLevel } from "@/application/source-presets";
import { FILE_ROLES, missingFields, unusedHeaders, ORDER_AGGREGATION_DOC_PATH, ORDER_AGGREGATION_DOC_URL, type MappingOrigin, type WizardFile, type WizardState } from "@/application/import-wizard";
import { formatCount } from "@/application/presentation";
import type { FileName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { ShellIcon } from "../shell/shell-icon";
import { FieldHelp } from "./field-help";
import { fileLabels } from "./step-files";

const copy = labels.importWizard;
const v3 = copy.wizardV3;
const panel = labels.ui.importPanel;
const shortDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : iso;

/**
 * 「需要確認」依既有 mappingStatus 判斷：只有欄名完全相同（exact）與使用者手動選的（manual）算已對照；
 * 上次的對照（memory）、來源預設（preset）、中文欄名字典（dictionary）的狀態文字都是「…請確認」，必填未對（none）更要處理。
 */
const CONFIRMED_ORIGINS: readonly MappingOrigin[] = ["exact", "manual"];
export const needsConfirmation = (origin: MappingOrigin) => !CONFIRMED_ORIGINS.includes(origin);
const originOf = (file: WizardFile, field: string): MappingOrigin => file.origins[field] ?? "none";
const originTone: Record<MappingOrigin, string | undefined> = { exact: undefined, manual: undefined, memory: "warning", preset: "warning", dictionary: "warning", none: "unfavorable" };
/** 每份檔進入第 2 步時「需要確認」的欄位（凍結）：改選來源欄後列不在收合區與展開區之間搬動，焦點不會跳走。 */
export function pendingFieldsAtEntry(state: WizardState): Record<FileName, string[]> {
  return Object.fromEntries(FILE_ROLES.map(role => { const file = state.files[role]; return [role, file ? importColumns[role].filter(field => needsConfirmation(originOf(file, field))) : [...importColumns[role]]]; })) as Record<FileName, string[]>;
}

export function StepMapping({ state, onMap, onIgnore }: {
  state: WizardState;
  onMap: (role: FileName, field: string, source: string) => void;
  onIgnore: (role: FileName, value: boolean) => void;
}) {
  const [pendingAtEntry] = useState(() => pendingFieldsAtEntry(state));
  return <div data-testid="import-step-2" className="wizard-step">
    <p className="wizard-note">{copy.mappingIntro}</p>
    {state.mappingSkipped && <p className="wizard-note" role="status">{copy.allExact}</p>}
    {FILE_ROLES.map(role => {
      const file = state.files[role];
      if (!file?.draft.parsed) return null;
      const parsed = file.draft.parsed;
      const unused = unusedHeaders(file), missing = missingFields(file);
      const usesMemory = Object.values(file.origins).includes("memory");
      const preset = file.preset;
      const orderLevel = preset ? isOrderLevel(preset.preset) : false;
      const columns = importColumns[role];
      const pendingNow = columns.filter(field => needsConfirmation(originOf(file, field))).length;
      const frozen = new Set(pendingAtEntry[role]);
      const pendingRows = columns.filter(field => frozen.has(field)), mappedRows = columns.filter(field => !frozen.has(field));
      const idBase = `import-${role.replace(/\.csv$/, "")}`;
      const row = (field: string) => {
        const source = file.draft.mapping[field] ?? "";
        const origin = originOf(file, field);
        const index = source ? parsed.headers.indexOf(source) : -1;
        const samples = index >= 0 ? parsed.rows.slice(0, 3).map(item => item.values[index] || copy.noSamples).join("、") : "";
        const guidance = columnGuidance[field];
        return <tr key={field} className={`origin-${origin}`}>
          <th scope="row"><span className="mapping-field">{fill(panel.fieldWithKey, { label: guidance.label, field })}<FieldHelp id={`${idBase}-help-${field}`} label={fill(v3.fieldHelpAria, { label: guidance.label })}>{guidance.meaning}</FieldHelp></span></th>
          <td><select className="ui-field-control" aria-label={fill(panel.mappingAria, { file: role, field })} value={source} onChange={event => onMap(role, field, event.target.value)}><option value="">{copy.selectColumn}</option>{parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></td>
          <td className="samples">{samples}</td>
          <td><span className="ui-lozenge" data-tone={originTone[origin]}>{!needsConfirmation(origin) && <ShellIcon name="check" size={12} />}{copy.mappingStatus[origin]}</span></td>
        </tr>;
      };
      const table = (fields: string[], aria: string) => <div className="table-scroll" role="region" aria-label={aria} tabIndex={0}>
        <table className="ui-table mapping-table">
          <thead><tr><th scope="col">{copy.mappingHead.field}</th><th scope="col">{copy.mappingHead.source}</th><th scope="col">{copy.mappingHead.samples}</th><th scope="col">{copy.mappingHead.status}</th></tr></thead>
          <tbody>{fields.map(row)}</tbody>
        </table>
      </div>;
      return <article className="mapping-card" key={role} data-testid={`import-mapping-${role}`}>
        {/* §7.7.2 步驟 2：區段標題「銷售日報 · 已對照 8／10 欄 · 2 欄需要確認」（標準欄位數取自 import.ts 的 importColumns）。 */}
        <div className="mapping-head"><h3>{fill(v3.mappingTitle, { file: fileLabels[role], mapped: formatCount(columns.length - pendingNow, "L2"), total: formatCount(columns.length, "L2"), pending: formatCount(pendingNow, "L2") })}</h3><span className="mapping-file">{file.draft.name}</span></div>
        {/* 記憶提示與預設提示合併成一行 inline 提示；兩個 testid 各留在自己的 span。 */}
        {((usesMemory && file.memory) || (preset && !orderLevel)) && <p className="mapping-hints">
          {usesMemory && file.memory && <span className="mapping-hint" data-testid="import-memory-hint">{fill(copy.memoryHint, { date: shortDate(file.memory.used_at) })}</span>}
          {preset && !orderLevel && <span className="mapping-hint" data-testid="import-preset-hint">{fill(copy.presetHint, { preset: copy.presetNames[preset.preset.id] ?? preset.preset.source })} {preset.preset.verified ? fill(copy.presetVerified, { date: preset.preset.verifiedAt ?? "" }) : copy.presetUnverified}{preset.preset.grain === "daily_campaign" ? ` ${copy.campaignLevelDetected}` : ""}{preset.preset.inclusiveTax ? ` ${copy.presetInclusiveHint}` : ""}</span>}
        </p>}
        {preset && orderLevel && <div className="ui-notice" data-tone="warning" role="alert" data-testid="import-order-level"><p>{copy.orderLevelDetected}（{fill(copy.presetHint, { preset: copy.presetNames[preset.preset.id] ?? preset.preset.source })}）</p><p><a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.orderLevelLink}</a>（{ORDER_AGGREGATION_DOC_PATH}）</p></div>}
        {/* 需要確認的列展開在外；自動對上且不需確認的列預設收進 <details>（內容保持掛載，M1）。 */}
        {pendingRows.length > 0 && table(pendingRows, fill(panel.mappingSummary, { file: role }))}
        {mappedRows.length > 0 && <details className="wizard-details mapping-done"><summary>{fill(v3.mappedSummary, { n: formatCount(mappedRows.length, "L2") })}</summary>{table(mappedRows, fill(v3.mappedRegionAria, { file: role }))}</details>}
        {missing.length > 0 && <p className="ui-notice" data-tone="unfavorable">{fill(copy.mappingIncomplete, { fields: missing.join("、") })}</p>}
        {unused.length > 0 ? <><p className="wizard-note">{fill(copy.ignoredColumns, { columns: unused.join("、") })}</p><label className="check-label"><input type="checkbox" className="ui-check" aria-label={fill(panel.ignoreAria, { file: role })} checked={file.draft.ignoredColumnsConfirmed} onChange={event => onIgnore(role, event.target.checked)} />{copy.ignoreConfirm}</label></> : <p className="wizard-note">{copy.noIgnored}</p>}
      </article>;
    })}
  </div>;
}
