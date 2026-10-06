"use client";

import { useMemo, useState } from "react";
import { evidenceRows, formatAmountL2, formatMultiple, formatRateL2, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { analyzeProducts } from "@/domain/analysis";
import { COST_FIELDS, SALES_FIELDS, type Dataset, type Metric, type MetricName, type ProductMetrics, type SourceRef } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { IssueList } from "./issue-list";
import { downloadText } from "@/application/download";
import { exportProductsCsv } from "@/application/export";
import { sideFileIssueMessage } from "@/application/import";
import { buildManagerSummary } from "@/application/manager-summary";
import { categoryLabel, channelLabel, channelsLabel, conversionSentence, demoAlias } from "@/application/copy";
import type { TaxConversion } from "@/application/tax-basis";
import { exportTargetsCsv, targetDisplay, targetsCsvTemplate, type TargetIssue, type TargetSet } from "@/application/targets";
import { eventsCsvTemplate, exportEventsCsv, type EventIssue, type EventSet } from "@/application/events";
import { fill, labels } from "@/i18n";
import { ChannelWideTable } from "./channel-table";
import { DiagnosisList } from "./diagnosis-list";

type EvidenceHandler = (selection: EvidenceSelection) => void;
const ui = labels.ui.workspacePanels;
const previewLabels: Record<string, string> = {
  date: ui.previewColumns.date, channel: ui.previewColumns.channel, sku: "SKU", category: ui.previewColumns.category, units_sold: ui.previewColumns.unitsSold, currency: ui.previewColumns.currency,
  gross_sales: metricDefinitions.gross_sales.shortLabel, discounts: metricDefinitions.discounts.shortLabel, refunds: metricDefinitions.refunds.shortLabel, cogs_net: metricDefinitions.cogs_net.shortLabel,
  platform_fees: metricDefinitions.platform_fees.shortLabel, payment_fees: metricDefinitions.payment_fees.shortLabel, fulfillment_costs: metricDefinitions.fulfillment_costs.shortLabel, other_variable_costs: metricDefinitions.other_variable_costs.shortLabel, ad_spend: metricDefinitions.ad_spend.shortLabel,
};

/** V3-2b：商品表是 L2（整數元、一位小數 %），金額欄的表頭標一次「（元）」；精確值在「計算與來源」抽屜。 */
function displayMetric(name: MetricName, metric: Metric): string {
  if (metric.value === null) return labels.status.notApplicable;
  const unit = metricDefinitions[name].unit;
  if (unit === "percent") return formatRateL2(metric.value);
  if (unit === "multiple") return formatMultiple(metric.value, "L2");
  return formatAmountL2(metric.value);
}

export function DataWorkspace({ dataset, snapshot, filenames, mappings, conversion, targets = null, events = null, targetIssues = [], eventIssues = [], onTargets, onEvents, onRemoveTargets, onRemoveEvents, onRemoveTargetRow, onRemoveEventRow }: { dataset: Dataset; snapshot: WorkspaceSnapshot; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>; conversion?: TaxConversion | null; targets?: TargetSet | null; events?: EventSet | null; targetIssues?: TargetIssue[]; eventIssues?: EventIssue[]; onTargets?: (file: File | undefined) => void; onEvents?: (file: File | undefined) => void; onRemoveTargets?: () => void; onRemoveEvents?: () => void; onRemoveTargetRow?: (line: number) => void; onRemoveEventRow?: (line: number) => void }) {
  const settings = dataset.manifest;
  const alias = demoAlias(settings.dataset_id);
  const files = [
    { name: "sales_daily.csv", title: labels.importWizard.files.sales, description: ui.fileGrain.sales, rows: dataset.sales, fields: ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"] },
    { name: "channel_costs_daily.csv", title: labels.importWizard.files.costs, description: ui.fileGrain.costs, rows: dataset.costs, fields: ["date", "channel", ...COST_FIELDS, "currency"] },
    { name: "ad_spend_daily.csv", title: labels.importWizard.files.ads, description: ui.fileGrain.ads, rows: dataset.ads, fields: ["date", "channel", "ad_spend", "currency"] },
  ];
  return <>
    <section className="panel" aria-labelledby="dataset-heading">
      <div className="section-heading"><div><h2 id="dataset-heading">{labels.sections.dataScope}</h2></div><span className="tag">{settings.source_type === "synthetic" ? labels.status.demo : labels.status.local}</span></div>
      <dl className="metadata-grid">
        <div><dt>{ui.meta.datasetId}</dt><dd>{settings.dataset_id}</dd></div>
        <div><dt>{labels.status.dataAsOf}</dt><dd>{settings.data_as_of}</dd></div>
        <div><dt>{ui.meta.coverage}</dt><dd>{fill(ui.dateRange, { start: settings.coverage_start, end: settings.coverage_end })}</dd></div>
        <div><dt>{ui.meta.currencyTimezone}</dt><dd>{settings.currency} · {settings.timezone}</dd></div>
        <div><dt>{ui.meta.channels}</dt><dd>{channelsLabel(settings.channels, alias)}</dd></div>
        <div><dt>{ui.meta.coverageConfirmed}</dt><dd>{settings.sales_coverage_confirmed ? ui.meta.coverageYes : ui.meta.coverageNo}</dd></div>
        <div><dt>{labels.periods.previous}</dt><dd>{fill(ui.dateRange, { start: snapshot.report.previous.period.start, end: snapshot.report.previous.period.end })}</dd></div>
        <div><dt>{labels.periods.current}</dt><dd>{fill(ui.dateRange, { start: snapshot.report.current.period.start, end: snapshot.report.current.period.end })}</dd></div>
        <div><dt>{ui.meta.scopeChannels}</dt><dd>{channelsLabel(snapshot.report.scope.channels, alias)}</dd></div>
      </dl>
      <p className="note">{ui.datasetCaution}</p>
      <details><summary>{labels.sections.technicalDetails}</summary><dl className="metadata-grid"><div><dt>{labels.ui.workspacePanels.meta.formatVersionTechnical}</dt><dd>{settings.schema_version} / {snapshot.metric_version}</dd></div><div><dt>{labels.ui.workspacePanels.meta.datasetShaTechnical}</dt><dd><code>{snapshot.dataset_hash}</code></dd></div><div><dt>{labels.ui.workspacePanels.meta.filterShaTechnical}</dt><dd><code>{snapshot.filter_hash}</code></dd></div><div><dt>{labels.ui.workspacePanels.meta.amountBasisTechnical}</dt><dd><code>{settings.amount_basis}</code></dd></div></dl></details>
      {conversion && <section aria-label={labels.sections.dataPreprocessing} data-testid="data-preprocessing"><h3>{labels.sections.dataPreprocessing}</h3><p>{conversionSentence(conversion)}</p>{conversion.totals && <ul>{Object.entries(conversion.totals).map(([field, totals]) => <li key={field}>{fill(labels.importWizard.conversionTotals, { field: field in labels.metrics ? labels.metrics[field as MetricName].label : field, raw: totals.raw, converted: totals.converted })}</li>)}</ul>}</section>}
      {mappings && <details><summary>{ui.mappingsSummary}</summary>{Object.entries(mappings).map(([file, mapping]) => <div key={file}><h3>{filenames?.[file as SourceRef["file"]] ?? file}</h3><dl className="metadata-grid">{Object.entries(mapping).map(([standard, original]) => <div key={standard}><dt>{standard}</dt><dd>{original}</dd></div>)}</dl></div>)}</details>}
    </section>
    {/* R4 選配：目標（達成率）與促銷檔期（趨勢圖區帶）；只標示，不改計算。 */}
    <section className="panel side-entry" aria-labelledby="targets-heading" data-testid="targets-entry">
      <div className="section-heading"><div><h2 id="targets-heading">{labels.targets.entry}</h2><p className="note">{labels.targets.intro}</p></div><span className="tag">{targets ? fill(labels.targets.loaded, { n: targets.rows.length, name: targets.filename ?? "" }) : labels.targets.none}</span></div>
      <div className="side-entry-controls">
        <label className="file-pick"><span className="button quiet">{labels.targets.upload}</span><input aria-label={labels.targets.upload} type="file" accept=".csv,text/csv" onChange={event => { onTargets?.(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <button type="button" className="text-button" onClick={() => downloadText(targetsCsvTemplate(), "targets.csv")}>{labels.targets.template}</button>
        {targets && <button type="button" className="text-button" onClick={() => downloadText(exportTargetsCsv(targets), "targets.csv")}>{labels.targets.download}</button>}
        {targets && <button type="button" className="text-button" onClick={onRemoveTargets}>{labels.targets.remove}</button>}
      </div>
      {targetIssues.length > 0 && <ul className="alert file-issues" role="alert" data-testid="targets-issues">{targetIssues.map((issue, index) => <li key={index}>{sideFileIssueMessage("targets.csv", issue)}<br /><code>{issue.reason_code}</code></li>)}</ul>}
      {targets && <div className="table-scroll" role="region" aria-label={labels.targets.entry} tabIndex={0}><table data-testid="targets-table"><thead><tr><th>{labels.csvColumns.line}</th><th>{labels.targets.columns.period_start}</th><th>{labels.targets.columns.period_end}</th><th>{labels.targets.columns.channel}</th><th>{labels.targets.columns.metric}</th><th>{labels.targets.columns.target}</th><th></th></tr></thead><tbody>{targets.rows.map(row => <tr key={row.line}><th scope="row">{row.line}</th><td>{row.period_start}</td><td>{row.period_end}</td><td>{row.channel === "ALL" ? ui.scopeAll : channelLabel(row.channel, alias)}</td><td>{metricDefinitions[row.metric].label}</td><td>{targetDisplay(row)}</td><td><button type="button" className="text-button" aria-label={`${labels.targets.removeRow} ${row.line}`} onClick={() => onRemoveTargetRow?.(row.line)}>{labels.targets.removeRow}</button></td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel side-entry" aria-labelledby="events-heading" data-testid="events-entry">
      <div className="section-heading"><div><h2 id="events-heading">{labels.events.entry}</h2><p className="note">{labels.events.intro}</p></div><span className="tag">{events ? fill(labels.events.loaded, { n: events.rows.length, name: events.filename ?? "" }) : labels.events.none}</span></div>
      <div className="side-entry-controls">
        <label className="file-pick"><span className="button quiet">{labels.events.upload}</span><input aria-label={labels.events.upload} type="file" accept=".csv,text/csv" onChange={event => { onEvents?.(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <button type="button" className="text-button" onClick={() => downloadText(eventsCsvTemplate(), "events.csv")}>{labels.events.template}</button>
        {events && <button type="button" className="text-button" onClick={() => downloadText(exportEventsCsv(events), "events.csv")}>{labels.events.download}</button>}
        {events && <button type="button" className="text-button" onClick={onRemoveEvents}>{labels.events.remove}</button>}
      </div>
      {eventIssues.length > 0 && <ul className="alert file-issues" role="alert" data-testid="events-issues">{eventIssues.map((issue, index) => <li key={index}>{sideFileIssueMessage("events.csv", issue)}<br /><code>{issue.reason_code}</code></li>)}</ul>}
      {events && <div className="table-scroll" role="region" aria-label={labels.events.entry} tabIndex={0}><table data-testid="events-table"><thead><tr><th>{labels.csvColumns.line}</th><th>{labels.events.columns.start}</th><th>{labels.events.columns.end}</th><th>{labels.events.columns.label}</th><th></th></tr></thead><tbody>{events.rows.map(row => <tr key={row.line}><th scope="row">{row.line}</th><td>{row.start}</td><td>{row.end}</td><td>{row.label}</td><td><button type="button" className="text-button" aria-label={`${labels.events.removeRow} ${row.line}`} onClick={() => onRemoveEventRow?.(row.line)}>{labels.events.removeRow}</button></td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel" aria-labelledby="preview-heading">
      <div className="section-heading"><div><h2 id="preview-heading">{labels.sections.dataPreview}</h2><p className="note">{ui.previewNote}</p></div><span className="tag">{ui.previewTag}</span></div>
      {files.map(file => {
        const preview = evidenceRows(dataset, file.rows.slice(0, 10).map(row => row.source)).sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        const dates = file.rows.map(row => row.date).sort();
        return <article className="file-card" key={file.name}>
          <h3>{file.title} <span className="tag">{fill(ui.rowCount, { n: file.rows.length })}</span></h3>
          <p className="note"><code>{filenames?.[file.name as SourceRef["file"]] ?? file.name}</code>（{file.name}） · {file.description} · {dates.length ? fill(ui.dateRange, { start: dates[0], end: dates[dates.length - 1] }) : ui.noRows}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={fill(ui.previewRegionAria, { title: file.title })}>
            <table className="table preview-table"><caption className="sr-only">{fill(ui.previewCaption, { fileName: file.name })}</caption><thead><tr><th scope="col">{ui.lineNumber}</th>{file.fields.map(field => <th scope="col" key={field}>{previewLabels[field]}</th>)}</tr></thead><tbody>{preview.map(row => <tr key={`${row.file}-${row.line}`}><th scope="row">{row.line}</th>{file.fields.map(field => <td key={field}>{row.values[field] === null ? labels.status.missing : row.values[field]}</td>)}</tr>)}</tbody></table>
          </div>
        </article>;
      })}
    </section>
    <section className="panel" aria-labelledby="quality-heading"><div className="section-heading"><div><h2 id="quality-heading">{labels.sections.dataIssues}</h2><p className="note">{ui.issuesNote}</p></div><span className="tag">{fill(ui.itemCount, { n: dataset.issues.length })}</span></div>{dataset.issues.length ? <IssueList issues={dataset.issues} filenames={filenames} mappings={mappings} /> : <p>{ui.noIssues}</p>}</section>
  </>;
}

export function Diagnosis({ snapshot, onEvidence, onCreateAction, events = null }: { snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler; onCreateAction?: (diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number]) => void; events?: EventSet | null }) {
  const summary = useMemo(() => buildManagerSummary(snapshot), [snapshot]);
  const alias = demoAlias(snapshot.report.dataset_id);
  // R5：通路寬表置頂 → 健檢清單（一個規則一列，與三件事同一套 diagnosisGroups）；AI 區塊由 dashboard 接在後面。
  return <>
  <section className="panel" aria-labelledby="channel-table-heading">
    <div className="section-heading"><div><h2 id="channel-table-heading">{ui.channelTableHeading}</h2><p className="note">{ui.channelTableCaution}</p></div><span className="tag">{channelsLabel(summary.scope.channels, alias)}</span></div>
    <ChannelWideTable summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} />
  </section>
  <DiagnosisList snapshot={snapshot} groups={summary.diagnosis} onEvidence={onEvidence} onCreateAction={onCreateAction} events={events} />
  </>;
}

const productColumns: { name: Exclude<keyof ProductMetrics, "units_sold">; label: string }[] = [
  { name: "net_revenue", label: metricDefinitions.net_revenue.label }, { name: "cogs_net", label: metricDefinitions.cogs_net.label },
  { name: "gross_profit", label: metricDefinitions.gross_profit.label }, { name: "gross_margin", label: metricDefinitions.gross_margin.shortLabel },
  { name: "discounts", label: metricDefinitions.discounts.label }, { name: "refunds", label: metricDefinitions.refunds.shortLabel },
];

export function Products({ dataset, snapshot, onEvidence, filenames }: { dataset: Dataset; snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler; filenames?: Partial<Record<SourceRef["file"], string>> }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const channels = snapshot.report.scope.channels;
  const period = snapshot.report.current.period;
  const alias = demoAlias(dataset.manifest.dataset_id);
  const categories = [...new Set(dataset.sales.filter(row => channels.includes(row.channel)).map(row => row.category).filter(category => category.trim() !== ""))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const result = useMemo(() => analyzeProducts(dataset, { period, channels, ...(activeCategory ? { category: activeCategory } : {}) }), [dataset, period, channels, activeCategory]);
  const query = search.trim().toLocaleLowerCase();
  const rows = result.rows.filter(row => !query || row.sku.toLocaleLowerCase().includes(query));
  return <section className="panel" aria-labelledby="products-heading">
    <div className="section-heading"><div><h2 id="products-heading">{labels.sections.productTable}</h2><p className="note">{ui.productsCaution}</p></div><span className="tag">{ui.tagTwdExclusive}</span></div>
    <div className="product-filters"><label htmlFor="product-category">{ui.filterCategory}<select aria-label={ui.filterCategory} id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">{ui.allCategories}</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value, alias)}</option>)}</select></label><label htmlFor="product-search">{ui.searchSku}<input id="product-search" type="search" placeholder={ui.searchSkuPlaceholder} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <div className="export-actions"><button className="button quiet" onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows, { category: activeCategory, query }, filenames), "profitlens-products.csv")}>{labels.downloads.productsCsv}</button><span className="note">{ui.productsCsvHint}</span></div>
    <div className="metric-strip"><p aria-live="polite">{fill(ui.productCount, { n: rows.length })}</p><p className="note">{fill(ui.productScope, { start: period.start, end: period.end, channels: channelsLabel(channels, alias), category: activeCategory ? categoryLabel(activeCategory, alias) : ui.allCategories })}</p></div>
    {rows.length === 0 ? <p>{ui.noProducts}</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.productTableAria}><table className="table" data-testid="product-table"><caption className="sr-only">{ui.productTableCaption}</caption><thead><tr><th scope="col">{ui.previewColumns.channel}</th><th scope="col">SKU</th><th scope="col">{ui.previewColumns.category}</th>{productColumns.map(column => <th scope="col" key={column.name}>{metricDefinitions[column.name].unit === "money" ? fill(labels.units.yuanColumn, { label: column.label }) : column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.channel, row.sku])}><td>{channelLabel(row.channel, alias)}</td><th scope="row">{row.sku}</th><td>{row.category.trim() ? categoryLabel(row.category, alias) : ui.uncategorized}</td>{productColumns.map(column => {
      const metric = row.metrics[column.name];
      return <td key={column.name}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined} aria-label={fill(ui.productCellAria, { channel: channelLabel(row.channel, alias), sku: row.sku, metric: column.label, value: displayMetric(column.name, metric) })} onClick={() => onEvidence({ title: fill(ui.productEvidenceTitle, { sku: row.sku, metric: column.label }), name: column.name, metric, period, channels: [row.channel], sources: row.sources, scopeLabel: fill(ui.productScopeLabel, { sku: row.sku, category: categoryLabel(row.category, alias) }) })}>{displayMetric(column.name, metric)}</button>{metric.value === null && metric.reason_codes.length > 0 && <small className="note">{labels.status.missing}</small>}</td>;
    })}</tr>)}</tbody></table></div>}
  </section>;
}
