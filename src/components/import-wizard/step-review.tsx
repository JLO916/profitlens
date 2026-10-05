"use client";

import { useMemo } from "react";
import { buildImportReconciliation, columnGuidance } from "@/application/import-guidance";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { issueContextFromDrafts } from "@/application/import";
import { mappingSourceSummary, FILE_ROLES, type WizardState } from "@/application/import-wizard";
import { metricDefinitions } from "@/application/presentation";
import { rateToPercent } from "@/application/tax-basis";
import type { SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { IssueList } from "../issue-list";

const copy = labels.importWizard;
const panel = labels.ui.importPanel;

export function StepReview({ state, filenames, onCommit, busy, memoryPersistent }: {
  state: WizardState;
  filenames: Partial<Record<SourceRef["file"], string>>;
  onCommit: () => void;
  busy: boolean;
  /** 本機保存同意：決定對照記憶寫 IndexedDB 還是只留在分頁。 */
  memoryPersistent: boolean;
}) {
  const candidate = state.candidate;
  const drafts = useMemo(() => Object.fromEntries(FILE_ROLES.flatMap(role => state.files[role] ? [[role, state.files[role]!.draft]] : [])), [state.files]);
  const reconciliation = useMemo(() => candidate ? buildImportReconciliation(candidate, drafts) : null, [candidate, drafts]);
  const issues = useMemo(() => candidate?.validation.issues ?? [], [candidate]);
  // V3-2a §7.7.3：{value} 取自已讀入的原始 CSV 列，{column} 取自欄位對照；問題清單只顯示 labels 樣板。
  const issueContext = useMemo(() => issueContextFromDrafts(drafts), [drafts]);
  const statusText = state.checking ? copy.checking : candidate ? copy.result[candidate.validation.classification] : copy.result.draft;
  const conversion = candidate?.conversion ?? null;
  const sources = mappingSourceSummary(state);
  return <div data-testid="import-step-4">
    <p role="status" data-testid="import-status" className={`import-result ${candidate?.validation.classification ?? "draft"}`}>{statusText}</p>
    {candidate && <section className="file-card" aria-label={copy.preprocessingTitle} data-testid="import-preprocessing">
      <h3>{copy.preprocessingTitle}</h3>
      {conversion ? <><p>{fill(copy.conversionSummary, { percent: rateToPercent(conversion.rate), fields: conversion.fields.map(field => columnGuidance[field]?.label ?? field).join("、"), n: conversion.rows_converted })}</p>
        <ul>{Object.entries(conversion.totals ?? {}).map(([field, totals]) => <li key={field}>{fill(copy.conversionTotals, { field: columnGuidance[field]?.label ?? field, raw: totals.raw, converted: totals.converted })}</li>)}</ul></> : <p>{copy.noConversion}</p>}
      <p className="note">{fill(copy.mappingSourceSummary, { sources: sources.map(origin => copy.mappingSources[origin as keyof typeof copy.mappingSources] ?? origin).join("、") || copy.mappingSources.exact })}</p>
      <p className="note" data-testid="import-memory-note">{memoryPersistent ? copy.memoryPersistent : copy.memorySessionOnly}</p>
    </section>}
    {issues.length > 0 && <section className="file-card" aria-label={copy.issuesTitle}><h3>{copy.issuesTitle}</h3><button type="button" className="button quiet" onClick={() => downloadText(exportIssuesCsv(issues, filenames), "profitlens-import-issues.csv")}>{labels.downloads.issuesCsv}</button><IssueList issues={issues} filenames={filenames} mappings={candidate?.columnMappings} context={issueContext} /></section>}
    {issues.some(issue => issue.reason_code.startsWith("DUPLICATE_")) && <p className="alert">{panel.duplicateAlert}</p>}
    {reconciliation && <section className="file-card" aria-label={panel.reconciliationAria} data-testid="import-reconciliation"><h3>{panel.stepReconcile}</h3><p className="note">{fill(panel.reconciliationNote, { start: reconciliation.period.start, end: reconciliation.period.end, channels: reconciliation.channels.join("、") })}</p>{conversion && <p className="note">{copy.reconciliationConverted}</p>}
      <div className="table-scroll" role="region" aria-label={panel.reconciliationTableAria} tabIndex={0}><table><caption>{panel.reconciliationCaption}</caption><thead><tr><th>{panel.reconciliationHead.source}</th><th>{panel.reconciliationHead.field}</th><th>{panel.reconciliationHead.sourceTotal}</th><th>{panel.reconciliationHead.standardTotal}</th><th>{panel.reconciliationHead.difference}</th></tr></thead><tbody>{reconciliation.fields.map(row => <tr key={row.field} data-testid={`reconciliation-${row.field}`}><th>{row.filename}／{row.source_column}</th><td>{fill(panel.fieldWithKey, { label: columnGuidance[row.field].label, field: row.field })}</td><td>{row.source_total ?? fill(panel.unknownBlanks, { n: row.missing_values })}{row.source_total === null && <small>{fill(panel.knownSubtotal, { subtotal: row.known_subtotal })}</small>}</td><td>{row.standard_total ?? labels.status.missing}</td><td>{row.difference ?? fill(panel.cannotReconcile, { reasons: row.reason_codes.join("、") || panel.sourceMissing })}</td></tr>)}</tbody></table></div>
      <div className="table-scroll" role="region" aria-label={panel.metricsTableAria} tabIndex={0}><table><caption>{panel.metricsCaption}</caption><thead><tr><th>{panel.metricsHead.metric}</th><th>{panel.metricsHead.total}</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(metric => <tr key={metric} data-testid={`reconciliation-metric-${metric}`}><th>{metricDefinitions[metric].label}＝{metricDefinitions[metric].formula}</th><td>{reconciliation.metrics[metric].value ?? fill(panel.unknownReasons, { reasons: reconciliation.metrics[metric].reason_codes.join("、") })}</td></tr>)}</tbody></table></div>
      <h4>{panel.excludedHeading}</h4><ul>{reconciliation.excluded.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
    {candidate?.validation.dataset && <div className="alert commit-row"><p>{candidate.validation.classification === "partial" ? copy.resultNote.partial : copy.resultNote.valid}{copy.commitHint}</p><button className="button primary" data-testid="import-commit" disabled={busy || state.checking} onClick={onCommit}>{copy.commit}</button></div>}
  </div>;
}
