"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importColumns, inspectImportFile, inspectManifestFile, prepareImport, type ImportFileDraft, type PreparedImport, type SourceAmountBasis } from "@/application/import";
import { buildImportReconciliation, columnGuidance, proposeImportSettings, roleGuidance, standardCsvTemplate } from "@/application/import-guidance";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { metricDefinitions } from "@/application/presentation";
import { MAX_CSV_BYTES } from "@/lib/csv";
import { ANALYSIS_CHANNEL_LIMIT_MESSAGE, ANALYSIS_PERIOD_LIMIT_MESSAGE } from "@/application/limits";
import type { FileName, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { IssueList } from "./issue-list";

const copy = labels.ui.importPanel;
const fileLabels: Record<FileName, string> = {
  "sales_daily.csv": labels.importWizard.files.sales,
  "channel_costs_daily.csv": labels.importWizard.files.costs,
  "ad_spend_daily.csv": labels.importWizard.files.ads,
};
const blankSettings = {
  dataset_id: "", data_as_of: "", coverage_start: "", coverage_end: "",
  previous_start: "", previous_end: "", current_start: "", current_end: "", channels: "",
  sales_coverage_confirmed: false, comparison_mode: "same_days",
};
type Settings = typeof blankSettings;
const dateFields: { key: keyof Pick<Settings, "data_as_of" | "coverage_start" | "coverage_end" | "previous_start" | "previous_end" | "current_start" | "current_end">; label: string }[] = [
  { key: "data_as_of", label: copy.dateFields.dataAsOf }, { key: "coverage_start", label: copy.dateFields.coverageStart }, { key: "coverage_end", label: copy.dateFields.coverageEnd },
  { key: "previous_start", label: labels.csvColumns.previous_start }, { key: "previous_end", label: labels.csvColumns.previous_end },
  { key: "current_start", label: labels.csvColumns.current_start }, { key: "current_end", label: labels.csvColumns.current_end },
];
const fieldWithKey = (label: string, field: string) => fill(copy.fieldWithKey, { label, field });

export function ImportPanel({ onCommit, onCancel, busy }: {
  onCommit: (prepared: PreparedImport, manifestName?: string) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [basisConfirmed, setBasisConfirmed] = useState(false);
  const [sourceAmountBasis, setSourceAmountBasis] = useState<SourceAmountBasis>("standard");
  const [drafts, setDrafts] = useState<Partial<Record<FileName, ImportFileDraft>>>({});
  const [fileIssues, setFileIssues] = useState<Partial<Record<FileName | "manifest.json", ValidationIssue[]>>>({});
  const [reading, setReading] = useState<Record<string, boolean>>({});
  const [candidate, setCandidate] = useState<PreparedImport | null>(null);
  const [checking, setChecking] = useState(false);
  const [manifestName, setManifestName] = useState<string>();
  const [originalNames, setOriginalNames] = useState<Partial<Record<FileName | "manifest.json", string>>>({});
  const sequence = useRef<Record<string, number>>({});
  const generation = useRef(0);
  const settingsRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function invalidate() { generation.current++; setCandidate(null); }
  function changeSetting(key: keyof Settings, value: string | boolean) {
    settingsRevision.current++;
    invalidate(); setSettings(previous => ({ ...previous, [key]: value }));
  }
  async function read(file: File | undefined, role: FileName | "manifest.json") {
    const ticket = (sequence.current[role] ?? 0) + 1;
    sequence.current[role] = ticket;
    const settingsTicket = settingsRevision.current;
    invalidate(); setBasisConfirmed(false);
    setOriginalNames(previous => ({ ...previous, [role]: file?.name }));
    setReading(previous => ({ ...previous, [role]: false }));
    setFileIssues(previous => ({ ...previous, [role]: [] }));
    if (role !== "manifest.json") setDrafts(previous => { const next = { ...previous }; delete next[role]; return next; });
    else { setManifestName(undefined); setBasisConfirmed(false); }
    if (!file) return;
    setReading(previous => ({ ...previous, [role]: true }));
    try {
      // Reject before allocating the file body; the parser checks the bytes again.
      if (file.size > MAX_CSV_BYTES) throw new Error(copy.errors.fileTooLarge);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current || sequence.current[role] !== ticket) return;
      if (role === "manifest.json") {
        if (settingsRevision.current !== settingsTicket) { setOriginalNames(previous => ({ ...previous, "manifest.json": undefined })); return; }
        const result = inspectManifestFile({ name: file.name, size: file.size, bytes });
        // Nonblocking completeness is evaluated from the editable form at check
        // time. A prefill warning must not become a stale blocking file error.
        setFileIssues(previous => ({ ...previous, [role]: result.issues.filter(issue => issue.severity === "blocking") }));
        if (result.manifest) {
          const manifest = result.manifest;
          const previous = manifest.previous_period as { start: string; end: string };
          const current = manifest.current_period as { start: string; end: string };
          setSettings({ dataset_id: String(manifest.dataset_id), data_as_of: String(manifest.data_as_of), coverage_start: String(manifest.coverage_start), coverage_end: String(manifest.coverage_end), previous_start: previous.start, previous_end: previous.end, current_start: current.start, current_end: current.end, channels: (manifest.channels as string[]).join("\n"), sales_coverage_confirmed: manifest.sales_coverage_confirmed === true, comparison_mode: manifest.comparison_mode === "calendar_months" ? "calendar_months" : "same_days" });
          setManifestName(file.name);
          setBasisConfirmed(false);
        }
      } else {
        const draft = inspectImportFile(role, { name: file.name, size: file.size, bytes });
        setDrafts(previous => ({ ...previous, [role]: draft }));
      }
    } catch (error) {
      if (!mounted.current || sequence.current[role] !== ticket) return;
      setFileIssues(previous => ({ ...previous, [role]: [{ file: role, field: "$file", line: null, severity: "blocking", reason_code: file.size > MAX_CSV_BYTES ? "FILE_TOO_LARGE" : "FILE_READ_FAILED", message: error instanceof Error ? error.message : copy.errors.fileReadFailed }] }));
    } finally {
      if (mounted.current && sequence.current[role] === ticket) setReading(previous => ({ ...previous, [role]: false }));
    }
  }
  function updateDraft(role: FileName, patch: Partial<ImportFileDraft>) {
    if (patch.mapping) setBasisConfirmed(false);
    invalidate(); setDrafts(previous => ({ ...previous, [role]: { ...previous[role]!, ...patch } }));
  }
  const readIssues = Object.values(fileIssues).flatMap(value => value ?? []);
  const busyReading = Object.values(reading).some(Boolean);
  const sourceNames = originalNames;
  const proposed = useMemo(() => proposeImportSettings(drafts), [drafts]);
  const reconciliation = useMemo(() => candidate ? buildImportReconciliation(candidate, drafts) : null, [candidate, drafts]);
  function applyProposal() {
    if (!proposed.proposal) return;
    const proposal = proposed.proposal;
    settingsRevision.current++; invalidate();
    setSettings(previous => ({ ...previous, coverage_start: proposal.coverage_start, coverage_end: proposal.coverage_end, data_as_of: proposal.data_as_of, channels: proposal.channels.join("\n"), comparison_mode: proposal.comparison_mode, previous_start: proposal.previous_period?.start ?? "", previous_end: proposal.previous_period?.end ?? "", current_start: proposal.current_period?.start ?? "", current_end: proposal.current_period?.end ?? "", sales_coverage_confirmed: false }));
  }
  async function check() {
    const ticket = ++generation.current;
    setCandidate(null); setChecking(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!mounted.current) return;
    if (ticket !== generation.current) { setChecking(false); return; }
    const manifest = {
      schema_version: "1.0", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei",
      dataset_id: settings.dataset_id, data_as_of: settings.data_as_of,
      coverage_start: settings.coverage_start, coverage_end: settings.coverage_end,
      previous_period: { start: settings.previous_start, end: settings.previous_end },
      current_period: { start: settings.current_start, end: settings.current_end },
      channels: settings.channels.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
      sales_coverage_confirmed: settings.sales_coverage_confirmed, comparison_mode: settings.comparison_mode,
      amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
    };
    const prepared = prepareImport(manifest, drafts, { amountBasisConfirmed: basisConfirmed, sourceAmountBasis });
    if (readIssues.length) {
      prepared.input = null;
      prepared.validation = { ...prepared.validation, dataset: null, classification: "blocking", issues: [...readIssues, ...prepared.validation.issues] };
    }
    setCandidate(prepared); setChecking(false);
  }
  const issues = candidate?.validation.issues ?? [...readIssues, ...Object.values(drafts).flatMap(draft => draft.issues)];
  const statusText = checking || busyReading ? copy.status.checking : candidate ? ({ valid: copy.status.valid, partial: copy.status.partial, blocking: copy.status.blocking })[candidate.validation.classification] : copy.status.draft;
  const periodText = (period: { start: string; end: string } | null | undefined) => period ? `${period.start} ～ ${period.end}` : copy.noProposal;
  return <section className="panel import-panel" aria-labelledby="import-heading" data-testid="import-panel">
    <div className="section-heading"><div><p className="eyebrow">{labels.status.local}</p><h2 id="import-heading">{labels.buttons.importData}</h2><p className="note">{copy.privacyNote}</p></div><button className="button quiet" type="button" onClick={onCancel}>{copy.cancel}</button></div>
    <p className="alert">{copy.intro}</p>
    <fieldset className="import-fields" disabled={busy || checking}>
      <legend className="sr-only">{copy.legend}</legend>
      <h3>{copy.stepFiles}</h3><p className="note">{copy.fileRequirements}</p>
      <div className="import-files">{(Object.keys(fileLabels) as FileName[]).map(role => <article key={role}><label>{fileLabels[role]}<input aria-label={fileLabels[role]} type="file" accept=".csv,text/csv" onChange={event => void read(event.target.files?.[0], role)} /><small>{role}{reading[role] ? ` · ${copy.reading}` : ""}</small></label><p className="note">{roleGuidance[role]}</p><button className="text-button" type="button" onClick={() => downloadText(standardCsvTemplate(role), role)}>{fill(copy.downloadTemplate, { file: fileLabels[role] })}</button></article>)}</div>
      <details><summary>{labels.importWizard.howTo}</summary><p className="note">{copy.columnGuideNote}</p><dl>{Object.entries(columnGuidance).map(([field, guidance]) => <div key={field}><dt>{fieldWithKey(guidance.label, field)}</dt><dd>{guidance.meaning}</dd></div>)}</dl></details>
      <h3>{copy.stepSettings}</h3>
      <section aria-label={copy.proposalAria} className="file-card" data-testid="import-settings-proposal">
        <h4>{labels.importWizard.proposedBy}</h4>
        {proposed.proposal ? <><p>{fill(copy.proposalCoverage, { start: proposed.proposal.coverage_start, end: proposed.proposal.coverage_end, channels: proposed.proposal.channels.join("、") })}</p><p>{fill(copy.proposalPeriods, { previousLabel: labels.periods.previous, previous: periodText(proposed.proposal.previous_period), currentLabel: labels.periods.current, current: periodText(proposed.proposal.current_period) })}</p>{proposed.notes.map(note => <p className="note" key={note}>{note}</p>)}<button type="button" className="button quiet" disabled={busyReading} onClick={applyProposal}>{copy.applyProposal}</button></> : <p className="note">{copy.proposalEmpty}</p>}
        {Object.keys(drafts).length === 3 && proposed.issues.length > 0 && <IssueList issues={proposed.issues} filenames={sourceNames} />}
      </section>
      <label>{copy.manifestLabel}<input aria-label={copy.manifestLabel} type="file" accept=".json,application/json" onChange={event => void read(event.target.files?.[0], "manifest.json")} /><small>{copy.manifestHint}</small></label>
      {(manifestName || fileIssues["manifest.json"]?.length) ? <button type="button" className="text-button" onClick={() => { invalidate(); sequence.current["manifest.json"] = (sequence.current["manifest.json"] ?? 0) + 1; setManifestName(undefined); setFileIssues(previous => ({ ...previous, "manifest.json": [] })); setReading(previous => ({ ...previous, "manifest.json": false })); setOriginalNames(previous => ({ ...previous, "manifest.json": undefined })); setBasisConfirmed(false); }}>{copy.manualSettings}</button> : null}
      {manifestName && <p className="note">{fill(copy.manifestLoaded, { name: manifestName })}</p>}
      <div className="import-settings"><label>{copy.datasetName}<input aria-label={copy.datasetName} value={settings.dataset_id} onChange={e => changeSetting("dataset_id", e.target.value)} /></label>{dateFields.map(({ key, label }) => <label key={key}>{label}<input aria-label={label} type="date" value={settings[key]} onChange={e => changeSetting(key, e.target.value)} /></label>)}<label>{copy.channels}<textarea aria-label={copy.channels} rows={3} value={settings.channels} onChange={e => changeSetting("channels", e.target.value)} placeholder={copy.channelsPlaceholder} /></label></div>
      <label>{copy.comparisonMode}<select aria-label={copy.comparisonMode} value={settings.comparison_mode} onChange={e => changeSetting("comparison_mode", e.target.value)}><option value="same_days">{labels.periods.sameDays}</option><option value="calendar_months">{labels.periods.calendarMonths}</option></select></label>
      <p className="note">{copy.settingsNote}</p>
      <details><summary>{copy.limitsSummary}</summary><p className="note">{ANALYSIS_PERIOD_LIMIT_MESSAGE}</p><p className="note">{ANALYSIS_CHANNEL_LIMIT_MESSAGE}</p></details>
      <label className="check-label"><input type="checkbox" checked={settings.sales_coverage_confirmed} onChange={e => changeSetting("sales_coverage_confirmed", e.target.checked)} />{labels.importWizard.coverageConfirm}</label><p className="note">{copy.coverageNote}</p>
      <label>{labels.importWizard.basis.label}<select aria-label={labels.importWizard.basis.label} value={sourceAmountBasis} onChange={e => { settingsRevision.current++; invalidate(); setBasisConfirmed(false); setSourceAmountBasis(e.target.value as SourceAmountBasis); }}><option value="standard">{labels.importWizard.basis.exclusive}</option><option value="including_tax">{copy.basisOptions.includingTax}</option><option value="net_after_deductions">{copy.basisOptions.netAfterDeductions}</option><option value="unknown">{labels.importWizard.basis.unsure}</option></select></label>
      {sourceAmountBasis !== "standard" && <p className="alert">{copy.basisNotSupported}{sourceAmountBasis === "unknown" ? ` ${labels.importWizard.basisUnsureHelp}` : ""}</p>}
      <label className="check-label"><input type="checkbox" checked={basisConfirmed} onChange={e => { settingsRevision.current++; invalidate(); setBasisConfirmed(e.target.checked); }} />{labels.importWizard.amountConfirm}</label>
      <details><summary>{labels.basis.title}</summary><ul>{labels.basis.items.map(item => <li className="note" key={item}>{item}</li>)}</ul><p className="note">{labels.basis.aliasNote}</p></details>
      <h3>{copy.stepPreview}</h3>
      {(Object.keys(fileLabels) as FileName[]).map(role => {
        const draft = drafts[role];
        if (!draft?.parsed) return null;
        const parsed = draft.parsed;
        const unused = parsed.headers.filter(header => !Object.values(draft.mapping).includes(header));
        const needsMapping = importColumns[role].some(field => draft.mapping[field] !== field);
        return <article className="file-card" key={role} data-testid={`import-preview-${role}`}>
          <h4>{draft.name} <span className="tag">{fill(copy.rowCount, { n: parsed.rows.length })}</span></h4><p className="note">{fill(copy.previewNote, { file: role, n: draft.preview.length })}</p>
          <details open={needsMapping || undefined}><summary>{fill(copy.mappingSummary, { file: role })}</summary><p className="note">{labels.importWizard.suggested}</p><div className="mapping-grid">{importColumns[role].map(field => <label key={field}>{fieldWithKey(columnGuidance[field].label, field)}<small>{columnGuidance[field].meaning}</small><select aria-label={fill(copy.mappingAria, { file: role, field })} value={draft.mapping[field] ?? ""} onChange={e => updateDraft(role, { mapping: { ...draft.mapping, [field]: e.target.value }, mappingConfirmed: false, ignoredColumnsConfirmed: false })}><option value="">{copy.selectColumn}</option>{parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></details>
          {needsMapping && <label className="check-label"><input type="checkbox" aria-label={fill(copy.mappingConfirmAria, { file: role })} checked={draft.mappingConfirmed} onChange={e => updateDraft(role, { mappingConfirmed: e.target.checked })} />{fill(copy.mappingConfirm, { file: role })}</label>}
          {unused.length > 0 && <label className="check-label"><input type="checkbox" aria-label={fill(copy.ignoreAria, { file: role })} checked={draft.ignoredColumnsConfirmed} onChange={e => updateDraft(role, { ignoredColumnsConfirmed: e.target.checked })} />{fill(copy.ignoreColumns, { columns: unused.join("、") })}</label>}
          <div className="table-scroll" role="region" aria-label={fill(copy.previewAria, { file: draft.name })} tabIndex={0}><table><caption>{fill(copy.previewCaption, { file: draft.name })}</caption><thead><tr><th>{copy.lineNumber}</th>{parsed.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{draft.preview.map(row => <tr key={row.line}><th>{row.line}</th>{row.values.map((value, index) => <td key={index}>{value === "" ? copy.blankCell : value}</td>)}</tr>)}</tbody></table></div>
        </article>;
      })}
      <button type="button" className="button primary" disabled={busyReading} onClick={() => void check()}>{copy.check}</button>
    </fieldset>
    <p role="status" data-testid="import-status" className="import-result">{statusText}</p>
    {issues.length > 0 && <><button className="button quiet" onClick={() => downloadText(exportIssuesCsv(issues, sourceNames), "profitlens-import-issues.csv")}>{labels.downloads.issuesCsv}</button><IssueList issues={issues} filenames={sourceNames} mappings={candidate?.columnMappings} /></>}
    {reconciliation && <section className="file-card" aria-label={copy.reconciliationAria} data-testid="import-reconciliation"><h3>{copy.stepReconcile}</h3><p className="note">{fill(copy.reconciliationNote, { start: reconciliation.period.start, end: reconciliation.period.end, channels: reconciliation.channels.join("、") })}</p>
      <div className="table-scroll" role="region" aria-label={copy.reconciliationTableAria} tabIndex={0}><table><caption>{copy.reconciliationCaption}</caption><thead><tr><th>{copy.reconciliationHead.source}</th><th>{copy.reconciliationHead.field}</th><th>{copy.reconciliationHead.sourceTotal}</th><th>{copy.reconciliationHead.standardTotal}</th><th>{copy.reconciliationHead.difference}</th></tr></thead><tbody>{reconciliation.fields.map(row => <tr key={row.field} data-testid={`reconciliation-${row.field}`}><th>{row.filename}／{row.source_column}</th><td>{fieldWithKey(columnGuidance[row.field].label, row.field)}</td><td>{row.source_total ?? fill(copy.unknownBlanks, { n: row.missing_values })}{row.source_total === null && <small>{fill(copy.knownSubtotal, { subtotal: row.known_subtotal })}</small>}</td><td>{row.standard_total ?? labels.status.missing}</td><td>{row.difference ?? fill(copy.cannotReconcile, { reasons: row.reason_codes.join("、") || copy.sourceMissing })}</td></tr>)}</tbody></table></div>
      <div className="table-scroll" role="region" aria-label={copy.metricsTableAria} tabIndex={0}><table><caption>{copy.metricsCaption}</caption><thead><tr><th>{copy.metricsHead.metric}</th><th>{copy.metricsHead.total}</th></tr></thead><tbody>{(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const).map(metric => <tr key={metric} data-testid={`reconciliation-metric-${metric}`}><th>{metricDefinitions[metric].label}＝{metricDefinitions[metric].formula}</th><td>{reconciliation.metrics[metric].value ?? fill(copy.unknownReasons, { reasons: reconciliation.metrics[metric].reason_codes.join("、") })}</td></tr>)}</tbody></table></div>
      <h4>{copy.excludedHeading}</h4><ul>{reconciliation.excluded.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
    {issues.some(issue => issue.reason_code.startsWith("DUPLICATE_")) && <p className="alert">{copy.duplicateAlert}</p>}
    {candidate?.validation.dataset && <div className="alert"><p>{candidate.validation.classification === "partial" ? copy.partialNote : copy.validNote}{copy.commitHint}</p><button className="button primary" disabled={busy || busyReading || checking} onClick={() => void onCommit(candidate, manifestName)}>{copy.commit}</button></div>}
  </section>;
}
