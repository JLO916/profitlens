"use client";

import type { DragEvent } from "react";
import { columnGuidance, roleGuidance, standardCsvTemplate } from "@/application/import-guidance";
import { downloadText } from "@/application/download";
import { exampleTemplateUrl, fileBlocked, formatBytes, plainIssueMessage, FILE_ROLES, ORDER_AGGREGATION_DOC_PATH, ORDER_AGGREGATION_DOC_URL, type WizardState } from "@/application/import-wizard";
import { isOrderLevel } from "@/application/source-presets";
import type { FileName } from "@/domain/types";
import { fill, labels } from "@/i18n";

const copy = labels.importWizard;
const panel = labels.ui.importPanel;
export const fileLabels: Record<FileName, string> = { "sales_daily.csv": copy.files.sales, "channel_costs_daily.csv": copy.files.costs, "ad_spend_daily.csv": copy.files.ads };
const fileHints: Record<FileName, string> = { "sales_daily.csv": copy.fileHints.sales, "channel_costs_daily.csv": copy.fileHints.costs, "ad_spend_daily.csv": copy.fileHints.ads };

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
  return <div data-testid="import-step-1">
    <p className="note">{copy.limitsNote}</p>
    <div className="dropzone" role="group" aria-label={copy.dropzoneAria} onDragOver={event => event.preventDefault()} onDrop={drop}>
      <p className="dropzone-hint">{copy.dropHint}</p><p className="note">{copy.dropAllHint}</p>
      {dropNotice && <p className="note" role="status">{dropNotice}</p>}
      <div className="import-files">{FILE_ROLES.map(role => {
        const file = state.files[role];
        const issues = [...(state.readIssues[role] ?? []), ...(file?.draft.issues.filter(issue => issue.severity === "blocking") ?? [])];
        const blocked = fileBlocked(state, role);
        return <article key={role} data-testid={`import-file-${role}`} className={blocked ? "file-slot blocked" : file ? "file-slot ready" : "file-slot"}>
          <h3>{fileLabels[role]}</h3><p className="note">{fileHints[role]}</p>
          <label className="file-pick"><span className="button quiet">{file ? copy.replaceFile : copy.pickFile}</span><input aria-label={fileLabels[role]} type="file" accept=".csv,text/csv" multiple onChange={event => { onPick(role, event.target.files); event.target.value = ""; }} /><small>{copy.pickMany}</small></label>
          {state.reading[role] ? <p className="note" role="status">{copy.fileReading}</p> : file ? <p className="file-meta"><strong>{file.draft.name}</strong><br />{file.draft.parsed ? fill(copy.fileMeta, { size: formatBytes(file.draft.size), rows: file.draft.parsed.rows.length.toLocaleString("en-US"), columns: file.draft.parsed.headers.length, encoding: copy.encoding[file.encoding] }) : formatBytes(file.draft.size)}</p> : <p className="note">{copy.fileEmpty}</p>}
          {issues.length > 0 && <ul className="alert file-issues" role="alert">{issues.map((issue, index) => <li key={index}>{plainIssueMessage(issue)}<br /><code>{issue.reason_code}</code></li>)}</ul>}
          {file?.preset && isOrderLevel(file.preset.preset) && <p className="alert" role="alert" data-testid={`import-order-level-${role}`}>{copy.orderLevelDetected}（{fill(copy.presetHint, { preset: copy.presetNames[file.preset.preset.id] ?? file.preset.preset.source })}）<a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.orderLevelLink}</a></p>}
          {file && <button type="button" className="text-button" onClick={() => onRemove(role)}>{copy.removeFile}</button>}
        </article>;
      })}</div>
    </div>
    <details className="file-card"><summary>{copy.noFiles}</summary>
      <p className="note">{copy.howToIntro}</p>
      <div className="template-grid">{FILE_ROLES.map(role => <div key={role}><strong>{fileLabels[role]}</strong><button type="button" className="text-button" onClick={() => downloadText(standardCsvTemplate(role), role)}>{copy.templatesBlank}</button><a className="text-button" href={exampleTemplateUrl(role)} download={role}>{copy.templatesExample}</a></div>)}<div><strong>manifest.json</strong><a className="text-button" href={exampleTemplateUrl("manifest.json")} download="manifest.json">{labels.downloads.exampleManifest}</a></div></div>
      <details><summary>{copy.howTo}</summary><dl className="column-guide">{Object.entries(columnGuidance).map(([field, guidance]) => <div key={field}><dt>{fill(panel.fieldWithKey, { label: guidance.label, field })}</dt><dd>{guidance.meaning}</dd></div>)}</dl><p className="note">{FILE_ROLES.map(role => `${fileLabels[role]}：${roleGuidance[role]}`).join(" ")}</p><p className="note"><a href={ORDER_AGGREGATION_DOC_URL} target="_blank" rel="noreferrer">{copy.howToDoc}</a>（{ORDER_AGGREGATION_DOC_PATH}）</p></details>
    </details>
    <details className="file-card"><summary>{copy.advanced}</summary>
      <label>{copy.manifestLabel}<input aria-label={copy.manifestLabel} type="file" accept=".json,application/json" onChange={event => { onManifest(event.target.files?.[0]); event.target.value = ""; }} /><small>{copy.manifestHint}</small></label>
      {state.manifestName && <p className="note" role="status">{fill(copy.manifestLoaded, { name: state.manifestName })} <button type="button" className="text-button" onClick={onManifestClear}>{panel.manualSettings}</button></p>}
      {manifestIssues.length > 0 && <><ul className="alert" role="alert">{manifestIssues.map((issue, index) => <li key={index}>{plainIssueMessage(issue)}<br /><code>{issue.reason_code}</code></li>)}</ul><button type="button" className="text-button" onClick={onManifestClear}>{panel.manualSettings}</button></>}
    </details>
  </div>;
}
