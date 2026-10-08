"use client";

import type { DragEvent } from "react";
import { columnGuidance, roleGuidance } from "@/application/import-guidance";
import { exampleTemplateUrl, fileBlocked, formatBytes, plainIssueMessage, FILE_ROLES, ORDER_AGGREGATION_DOC_PATH, ORDER_AGGREGATION_DOC_URL, type WizardState } from "@/application/import-wizard";
import { formatCount } from "@/application/presentation";
import { isOrderLevel } from "@/application/source-presets";
import type { FileName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { ShellIcon } from "../shell/shell-icon";
import { TemplateTable } from "../shell/template-table";

const copy = labels.importWizard;
const v3 = copy.wizardV3;
const panel = labels.importWizard.panel;
export const fileLabels: Record<FileName, string> = { "sales_daily.csv": copy.files.sales, "channel_costs_daily.csv": copy.files.costs, "ad_spend_daily.csv": copy.files.ads };
const fileHints: Record<FileName, string> = { "sales_daily.csv": copy.fileHints.sales, "channel_costs_daily.csv": copy.fileHints.costs, "ad_spend_daily.csv": copy.fileHints.ads };
type SlotState = "empty" | "reading" | "ready" | "failed";
const slotTone: Record<SlotState, string | undefined> = { empty: undefined, reading: "accent", ready: undefined, failed: "unfavorable" };

export function StepFiles({ state, onPick, onDrop, onRemove, onManifest, onManifestClear, dropNotice }: {
  state: WizardState;
  /** 單選放進該格；一次選多份時依檔名歸位（與拖放相同）。 */
  onPick: (role: FileName, files: FileList | null) => void;
  onDrop: (files: FileList) => void;
  onRemove: (role: FileName) => void;
  onManifest: (file: File | undefined) => void;
  onManifestClear: () => void;
  dropNotice: string;
}) {
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); if (event.dataTransfer.files.length) onDrop(event.dataTransfer.files); }
  const manifestIssues = state.readIssues["manifest.json"] ?? [];
  const slotLabel = (slot: SlotState) => slot === "empty" ? copy.fileEmpty : slot === "reading" ? copy.fileReading : v3.fileState[slot];
  // 檔案槽改成拖放區下方的列後，整個第 1 步都接住拖放（放在列上也會依檔名歸位，不會讓瀏覽器直接開檔）。
  return <div data-testid="import-step-1" className="wizard-step" onDragOver={event => event.preventDefault()} onDrop={drop}>
    {/* §7.7.2 步驟 1：拖放區（1px 虛線 --border-strong、高 120px、文字靠左）；放錯或看不出角色的提示留在拖放區內（role=status）。 */}
    <div className="dropzone" role="group" aria-label={copy.dropzoneAria}>
      <p className="dropzone-hint">{copy.dropHint}</p>
      <p className="dropzone-note">{copy.dropAllHint}</p>
      {dropNotice && <p className="dropzone-note" role="status">{dropNotice}</p>}
    </div>
    <p className="wizard-note">{copy.limitsNote}</p>
    {/* §7.7.2 步驟 1：三個檔案槽改成 C3 列（角色｜檔名｜編碼｜列數｜狀態標籤｜選檔與移除）；欄頭只給視覺，每格內容本身可讀。 */}
    <div className="file-rows">
      <div className="file-rows-head" aria-hidden="true"><span>{v3.fileColumns.role}</span><span>{v3.fileColumns.name}</span><span>{v3.fileColumns.encoding}</span><span className="num">{v3.fileColumns.rows}</span><span>{v3.fileColumns.status}</span><span /></div>
      {FILE_ROLES.map(role => {
        const file = state.files[role];
        const parsed = file?.draft.parsed ?? null;
        const issues = [...(state.readIssues[role] ?? []), ...(file?.draft.issues.filter(issue => issue.severity === "blocking") ?? [])];
        const blocked = fileBlocked(state, role);
        const slot: SlotState = state.reading[role] ? "reading" : blocked || issues.length > 0 ? "failed" : file ? "ready" : "empty";
        return <article key={role} data-testid={`import-file-${role}`} className="file-slot" data-state={slot}>
          <div className="file-cell file-role"><h3>{fileLabels[role]}</h3><p className="file-sub">{fileHints[role]}</p></div>
          <div className="file-cell file-name">{file && <><span className="file-mono">{file.draft.name}</span><span className="file-sub">{parsed ? fill(v3.fileSize, { size: formatBytes(file.draft.size), columns: formatCount(parsed.headers.length, "L2") }) : formatBytes(file.draft.size)}</span></>}</div>
          <div className="file-cell file-encoding">{parsed && file ? copy.encoding[file.encoding] : null}</div>
          <div className="file-cell file-rows-count num">{parsed ? fill(panel.rowCount, { n: formatCount(parsed.rows.length, "L2") }) : null}</div>
          <div className="file-cell file-state"><span className="ui-lozenge" data-tone={slotTone[slot]} role={slot === "reading" ? "status" : undefined}>{slot === "ready" && <ShellIcon name="check" size={12} />}{slotLabel(slot)}</span></div>
          <div className="file-cell file-actions">
            <label className="file-pick"><span className="ui-btn ui-btn-secondary">{file ? copy.replaceFile : copy.pickFile}</span><input aria-label={fileLabels[role]} type="file" accept=".csv,text/csv" multiple onChange={event => { onPick(role, event.target.files); event.target.value = ""; }} /></label>
            {file && <button type="button" className="ui-btn ui-btn-text" aria-label={fill(v3.removeAria, { file: fileLabels[role] })} onClick={() => onRemove(role)}>{copy.removeFile}</button>}
          </div>
          {issues.length > 0 && <ul className="file-issues ui-notice" data-tone="unfavorable" role="alert">{issues.map((issue, index) => <li key={index}>{plainIssueMessage(issue)} <code>{issue.reason_code}</code></li>)}</ul>}
          {/* D5：偵測到訂單級資料時 inline 提示，連到整理工具說明。 */}
          {file?.preset && isOrderLevel(file.preset.preset) && <p className="ui-notice file-order-level" data-tone="warning" role="alert" data-testid={`import-order-level-${role}`}>{copy.orderLevelDetected}（{fill(copy.presetHint, { preset: copy.presetNames[file.preset.preset.id] ?? file.preset.preset.source })}）<a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.orderLevelLink}</a></p>}
        </article>;
      })}
    </div>
    <p className="wizard-note">{copy.pickMany}</p>
    {/* §7.7.2 步驟 1：範本、欄位說明、進階設定檔各收進 <details>（內容保持掛載，M1）。範本用與頂欄匯出選單相同的 3×3 表（§6.5）。 */}
    <details className="wizard-details"><summary>{copy.noFiles}</summary>
      <TemplateTable />
      <p className="wizard-note"><a className="ui-btn ui-btn-text" href={exampleTemplateUrl("manifest.json")} download="manifest.json">{labels.exports.downloads.exampleManifest}</a></p>
    </details>
    <details className="wizard-details"><summary>{copy.howTo}</summary>
      <p className="wizard-note">{copy.howToIntro}</p>
      <dl className="column-guide">{Object.entries(columnGuidance).map(([field, guidance]) => <div key={field}><dt>{fill(panel.fieldWithKey, { label: guidance.label, field })}</dt><dd>{guidance.meaning}</dd></div>)}</dl>
      <p className="wizard-note">{FILE_ROLES.map(role => `${fileLabels[role]}：${roleGuidance[role]}`).join(" ")}</p>
      <p className="wizard-note"><a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.howToDoc}</a>（{ORDER_AGGREGATION_DOC_PATH}）</p>
    </details>
    <details className="wizard-details"><summary>{copy.advanced}</summary>
      <label className="ui-field manifest-field"><span className="ui-field-label">{copy.manifestLabel}</span><input aria-label={copy.manifestLabel} type="file" accept=".json,application/json" onChange={event => { onManifest(event.target.files?.[0]); event.target.value = ""; }} /><small className="ui-field-hint">{copy.manifestHint}</small></label>
      {state.manifestName && <p className="wizard-note" role="status">{fill(copy.manifestLoaded, { name: state.manifestName })} <button type="button" className="ui-btn ui-btn-text" onClick={onManifestClear}>{panel.manualSettings}</button></p>}
      {manifestIssues.length > 0 && <><ul className="ui-notice" data-tone="unfavorable" role="alert">{manifestIssues.map((issue, index) => <li key={index}>{plainIssueMessage(issue)} <code>{issue.reason_code}</code></li>)}</ul><button type="button" className="ui-btn ui-btn-text" onClick={onManifestClear}>{panel.manualSettings}</button></>}
    </details>
  </div>;
}
