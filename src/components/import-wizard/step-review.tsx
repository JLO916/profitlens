"use client";

import { useMemo } from "react";
import { buildImportReconciliation, columnGuidance } from "@/application/import-guidance";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { issueContextFromDrafts } from "@/application/import";
import { mappingSourceSummary, FILE_ROLES, type WizardState } from "@/application/import-wizard";
import { formatAmountL3, formatCount, formatRateL3, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { rateToPercent } from "@/application/tax-basis";
import type { SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { IssueList } from "../issue-list";

const copy = labels.importWizard;
const v3 = copy.wizardV3;
const panel = labels.ui.importPanel;

/** §7.7.2 步驟 4 頂部狀態一行（L1）：可以套用／可套用已有範圍／無法套用；數字一律經 presentation 的整數千分位。 */
export function reviewStatusText(state: WizardState): string {
  const candidate = state.candidate;
  if (state.checking) return copy.checking;
  if (!candidate) return copy.result.draft;
  const issues = candidate.validation.issues;
  const count = (severity: "blocking" | "partial" | "warning") => formatCount(issues.filter(issue => issue.severity === severity).length, "L2");
  const files = formatCount(FILE_ROLES.filter(role => state.files[role]?.draft.parsed).length, "L2");
  const rows = formatCount(FILE_ROLES.reduce((sum, role) => sum + (state.files[role]?.draft.parsed?.rows.length ?? 0), 0), "L2");
  switch (candidate.validation.classification) {
    case "valid": return fill(v3.statusReady, { files, rows, errors: count("blocking"), warnings: count("warning") });
    case "partial": return fill(v3.statusPartial, { files, rows, pending: count("partial"), warnings: count("warning") });
    default: return fill(v3.statusBlocked, { errors: count("blocking") });
  }
}

export function StepReview({ state, filenames, memoryPersistent }: {
  state: WizardState;
  filenames: Partial<Record<SourceRef["file"], string>>;
  /** 本機保存同意：決定對照記憶寫 IndexedDB 還是只留在分頁。 */
  memoryPersistent: boolean;
}) {
  const candidate = state.candidate;
  const drafts = useMemo(() => Object.fromEntries(FILE_ROLES.flatMap(role => state.files[role] ? [[role, state.files[role]!.draft]] : [])), [state.files]);
  const reconciliation = useMemo(() => candidate ? buildImportReconciliation(candidate, drafts) : null, [candidate, drafts]);
  const issues = useMemo(() => candidate?.validation.issues ?? [], [candidate]);
  // V3-2a §7.7.3：{value} 取自已讀入的原始 CSV 列，{column} 取自欄位對照；問題清單只顯示 labels 樣板。
  const issueContext = useMemo(() => issueContextFromDrafts(drafts), [drafts]);
  const classification = candidate?.validation.classification ?? "draft";
  const conversion = candidate?.conversion ?? null;
  const sources = mappingSourceSummary(state);
  return <div data-testid="import-step-4" className="wizard-step">
    {/* §7.7.2 步驟 4：頂部狀態一行（L1）；既有的檢核結果句放在下一行（13px）。 */}
    <div className="review-status">
      <p role="status" data-testid="import-status" data-classification={state.checking ? "checking" : classification} className={`import-result ${classification}`}>{reviewStatusText(state)}</p>
      {candidate && !state.checking && <p className="wizard-note" data-testid="import-result-note">{copy.result[candidate.validation.classification]}</p>}
      {candidate?.validation.classification === "partial" && !state.checking && <p className="wizard-note">{copy.resultNote.partial}</p>}
    </div>
    {/* 前處理摘要表：欄位｜含稅合計（元）｜未稅合計（元）｜稅率；未稅時一句。 */}
    {candidate && <section className="wizard-section" aria-label={copy.preprocessingTitle} data-testid="import-preprocessing">
      <h3>{copy.preprocessingTitle}</h3>
      {conversion ? <>
        <p className="wizard-note">{fill(copy.conversionSummary, { percent: rateToPercent(conversion.rate), fields: conversion.fields.map(field => columnGuidance[field]?.label ?? field).join("、"), n: formatCount(conversion.rows_converted, "L2") })}</p>
        <div className="table-scroll" role="region" aria-label={v3.preprocessingTableAria} tabIndex={0}><table className="ui-table">
          <thead><tr><th scope="col">{v3.preprocessingHead.field}</th><th scope="col" className="num">{v3.preprocessingHead.raw}</th><th scope="col" className="num">{v3.preprocessingHead.converted}</th><th scope="col" className="num">{v3.preprocessingHead.rate}</th></tr></thead>
          <tbody>{Object.entries(conversion.totals ?? {}).map(([field, totals]) => <tr key={field}><th scope="row">{columnGuidance[field]?.label ?? field}</th><td className="num">{formatAmountL3(totals.raw)}</td><td className="num">{formatAmountL3(totals.converted)}</td><td className="num">{formatRateL3(conversion.rate)}</td></tr>)}</tbody>
        </table></div>
      </> : <p>{copy.noConversion}</p>}
      <p className="wizard-note">{fill(copy.mappingSourceSummary, { sources: sources.map(origin => copy.mappingSources[origin as keyof typeof copy.mappingSources] ?? origin).join("、") || copy.mappingSources.exact })}</p>
    </section>}
    {/* 問題清單（欄位同 §7.7.1）＋下載問題清單 CSV（檔名不變）。 */}
    {issues.length > 0 && <section className="wizard-section" aria-label={copy.issuesTitle}>
      <div className="wizard-section-head"><h3>{copy.issuesTitle}</h3><button type="button" className="ui-btn ui-btn-secondary" onClick={() => downloadText(exportIssuesCsv(issues, filenames), "profitlens-import-issues.csv")}>{labels.downloads.issuesCsv}</button></div>
      <IssueList issues={issues} filenames={filenames} mappings={candidate?.columnMappings} context={issueContext} />
    </section>}
    {issues.some(issue => issue.reason_code.startsWith("DUPLICATE_")) && <p className="ui-notice" data-tone="warning">{panel.duplicateAlert}</p>}
    {/* 對帳表（到分，reconciliation-{field}）→ 指標表（reconciliation-metric-{metric}）。 */}
    {reconciliation && <section className="wizard-section" aria-label={panel.reconciliationAria} data-testid="import-reconciliation"><h3>{panel.stepReconcile}</h3><p className="wizard-note">{fill(panel.reconciliationNote, { start: reconciliation.period.start, end: reconciliation.period.end, channels: reconciliation.channels.join("、") })}</p>{conversion && <p className="wizard-note">{copy.reconciliationConverted}</p>}
      <div className="table-scroll" role="region" aria-label={panel.reconciliationTableAria} tabIndex={0}><table className="ui-table"><caption>{panel.reconciliationCaption}</caption><thead><tr><th scope="col">{panel.reconciliationHead.source}</th><th scope="col">{panel.reconciliationHead.field}</th><th scope="col" className="num">{panel.reconciliationHead.sourceTotal}</th><th scope="col" className="num">{panel.reconciliationHead.standardTotal}</th><th scope="col" className="num">{panel.reconciliationHead.difference}</th></tr></thead><tbody>{reconciliation.fields.map(row => <tr key={row.field} data-testid={`reconciliation-${row.field}`}><th scope="row">{row.filename}／{row.source_column}</th><td>{fill(panel.fieldWithKey, { label: columnGuidance[row.field].label, field: row.field })}</td><td className="num">{row.source_total === null ? fill(panel.unknownBlanks, { n: formatCount(row.missing_values, "L2") }) : formatAmountL3(row.source_total)}{row.source_total === null && <small>{fill(panel.knownSubtotal, { subtotal: formatAmountL3(row.known_subtotal) })}</small>}</td><td className="num">{row.standard_total == null ? labels.status.missing : formatAmountL3(row.standard_total)}</td><td className="num">{row.difference == null ? fill(panel.cannotReconcile, { reasons: row.reason_codes.join("、") || panel.sourceMissing }) : formatSignedDelta(row.difference, "L3")}</td></tr>)}</tbody></table></div>
      <div className="table-scroll" role="region" aria-label={panel.metricsTableAria} tabIndex={0}><table className="ui-table"><caption>{panel.metricsCaption}</caption><thead><tr><th scope="col">{panel.metricsHead.metric}</th><th scope="col" className="num">{panel.metricsHead.total}</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(metric => <tr key={metric} data-testid={`reconciliation-metric-${metric}`}><th scope="row">{metricDefinitions[metric].label}＝{metricDefinitions[metric].formula}</th><td className="num">{reconciliation.metrics[metric].value == null ? fill(panel.unknownReasons, { reasons: reconciliation.metrics[metric].reason_codes.join("、") }) : formatAmountL3(reconciliation.metrics[metric].value)}</td></tr>)}</tbody></table></div>
      <h4>{panel.excludedHeading}</h4><ul>{reconciliation.excluded.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
    {/* 對照記憶備註；「套用這批資料」在底部動作列（index.tsx）。 */}
    {candidate && <p className="wizard-note" data-testid="import-memory-note">{memoryPersistent ? copy.memoryPersistent : copy.memorySessionOnly}</p>}
  </div>;
}
