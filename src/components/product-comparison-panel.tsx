"use client";

import { useMemo, useState } from "react";
import { categoryLabel, channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { downloadText } from "@/application/download";
import { exportProductsCsv } from "@/application/export";
import { exportProductComparisonCsv } from "@/application/product-comparison-export";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { uniqueSources } from "@/domain/aggregation";
import { compareProducts, selectProductComparisonRows, type ProductComparisonRow, type ProductComparisonSort } from "@/domain/product-comparison";
import type { Dataset, Metric, ProductMetrics, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";

const copy = labels.ui.productComparisonPanel;
const currentColumns: (keyof ProductMetrics)[] = ["net_revenue", "cogs_net", "gross_profit", "gross_margin", "discounts", "refunds"];
const activityLabels: Record<ProductComparisonRow["activity"], string> = {
  both_observed: copy.activity.bothObserved, current_only: copy.activity.currentOnly, previous_only: copy.activity.previousOnly, coverage_unknown: copy.activity.coverageUnknown,
};
const presenceLabels: Record<ProductComparisonRow["previous"]["presence"], string> = {
  observed: copy.presence.observed, no_rows_confirmed: copy.presence.noRowsConfirmed, unknown_coverage: copy.presence.unknownCoverage,
};
/** 「淨營收差額」「商品毛利差額」：指標名＋差額後綴，與 CSV 標題同源。 */
const changeLabel = (name: keyof ProductMetrics) => `${metricDefinitions[name].label}${labels.csvSuffix.change}`;
/** 「上期淨營收」「本期毛利率」：期間短名＋指標名。 */
const periodMetric = (period: "previous" | "current", label: string) => `${labels.periods[period]}${label}`;
function display(name: keyof ProductMetrics, metric: Metric): string {
  return metric.value === null ? labels.status.missing : metricDefinitions[name].unit === "percent" ? formatRate(metric.value) : formatMoney(metric.value);
}

/** Product-only comparison. Filters remain local to this panel and never change channel contribution. */
export function ProductComparisonPanel({ dataset, snapshot, onEvidence, filenames }: {
  dataset: Dataset;
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  filenames?: Partial<Record<SourceRef["file"], string>>;
}) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [sort, setSort] = useState<ProductComparisonSort>("gross_profit_change");
  const [direction, setDirection] = useState<"ascending" | "descending">("ascending");
  const alias = demoAlias(dataset.manifest.dataset_id);
  const comparison = useMemo(() => compareProducts(dataset, snapshot.report.scope), [dataset, snapshot.report.scope]);
  const categories = [...new Set(comparison.rows.map(row => row.category).filter(value => value.trim()))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const selection = { category: activeCategory, query, negativeOnly, sort, direction };
  const rows = selectProductComparisonRows(comparison.rows, selection);
  const unavailable = comparison.rows.filter(row => row.changes.gross_profit.value === null).length;
  const { previous_period: previous, current_period: current, channels } = comparison.scope;
  const categoryText = (value: string) => value ? categoryLabel(value, alias) : copy.blankCategoryShort;

  const cell = (row: ProductComparisonRow, period: "previous" | "current", name: keyof ProductMetrics, label: string) => {
    const value = row[period];
    const metric = value.metrics[name];
    const periodLabel = labels.periods[period];
    return <td key={`${period}-${name}`}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={fill(copy.evidenceAria, { channel: channelLabel(row.channel, alias), sku: row.sku, period: period === "previous" ? labels.periods.previous : "", label, value: display(name, metric) })}
      onClick={() => onEvidence({ sku: row.sku, title: fill(copy.evidenceTitle, { sku: row.sku, period: periodLabel, label }), name, metric, period: period === "previous" ? previous : current, channels: [row.channel], sources: value.sources, scopeLabel: fill(copy.scopeLabel, { sku: row.sku, category: categoryText(row.category), presence: presenceLabels[value.presence] }) })}>
      {display(name, metric)}</button>{metric.value === null && <small className="note">{metric.reason_codes.includes("MISSING_COGS") ? copy.costMissing : copy.notComputable}</small>}</td>;
  };
  const deltaCell = (row: ProductComparisonRow, name: "net_revenue" | "gross_profit") => {
    const metric = row.changes[name];
    const label = changeLabel(name);
    const value = metric.value === null ? labels.status.missing : formatSignedMoney(metric.value);
    return <td key={`change-${name}`}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={fill(copy.deltaEvidenceAria, { channel: channelLabel(row.channel, alias), sku: row.sku, label, value })}
      onClick={() => onEvidence({ sku: row.sku, title: fill(copy.deltaEvidenceTitle, { sku: row.sku, label }), name, metric, period: { start: previous.start, end: current.end }, channels: [row.channel],
        sources: uniqueSources([...row.previous.sources, ...row.current.sources]),
        scopeLabel: fill(copy.deltaScopeLabel, { sku: row.sku, category: categoryText(row.category), previousStart: previous.start, previousEnd: previous.end, previousPresence: presenceLabels[row.previous.presence], currentStart: current.start, currentEnd: current.end, currentPresence: presenceLabels[row.current.presence] }),
        formula: fill(copy.deltaFormula, { label, metric: metricDefinitions[name].label, formula: metricDefinitions[name].formula }),
        components: [{ label: fill(copy.periodRange, { period: labels.periods.previous, start: previous.start, end: previous.end }), metric: row.previous.metrics[name] }, { label: fill(copy.periodRange, { period: labels.periods.current, start: current.start, end: current.end }), metric: row.current.metrics[name] }],
      })}>{value}</button>{metric.value === null && <small className="note">{copy.deltaMissing}</small>}</td>;
  };

  return <section className="panel" aria-labelledby="products-heading">
    <div className="section-heading"><div><p className="eyebrow">{copy.eyebrow}</p><h2 id="products-heading">{labels.sections.productTable}</h2><p className="note">{copy.intro}</p></div><span className="tag">{copy.basisTag}</span></div>
    <p className="note">{fill(copy.periodSummary, { previousStart: previous.start, previousEnd: previous.end, previousDays: snapshot.report.comparison.previous_days, currentStart: current.start, currentEnd: current.end, currentDays: snapshot.report.comparison.current_days, channels: channelsLabel(channels, alias) })}</p>
    <div className="product-filters">
      <label htmlFor="product-category">{labels.csvColumns.category}<select aria-label={labels.csvColumns.category} id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">{copy.allCategories}</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value, alias)}</option>)}</select></label>
      <label htmlFor="product-search">{copy.searchSku}<input id="product-search" type="search" placeholder={copy.searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label htmlFor="product-sort">{copy.sortBy}<select aria-label={copy.sortBy} id="product-sort" value={sort} onChange={event => setSort(event.target.value as ProductComparisonSort)}><option value="gross_profit_change">{changeLabel("gross_profit")}</option><option value="current_gross_profit">{periodMetric("current", metricDefinitions.gross_profit.label)}</option><option value="net_revenue_change">{changeLabel("net_revenue")}</option><option value="current_net_revenue">{periodMetric("current", metricDefinitions.net_revenue.label)}</option><option value="sku">SKU</option></select></label>
      <label htmlFor="product-direction">{copy.sortDirection}<select aria-label={copy.sortDirection} id="product-direction" value={direction} onChange={event => setDirection(event.target.value as "ascending" | "descending")}><option value="ascending">{copy.ascending}</option><option value="descending">{copy.descending}</option></select></label>
    </div>
    <div className="export-actions"><button type="button" className={`button ${negativeOnly ? "" : "quiet"}`} aria-pressed={negativeOnly} onClick={() => setNegativeOnly(value => !value)}>{copy.negativeOnly}</button><span className="note">{fill(copy.negativeNote, { n: unavailable })}</span></div>
    <div className="export-actions">
      <button type="button" className="button quiet" onClick={() => downloadText(exportProductComparisonCsv(dataset, snapshot, rows, selection, filenames), "profitlens-product-comparison.csv")}>{copy.downloadComparisonCsv}</button>
      <button type="button" className="button quiet" onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows.map(row => ({ channel: row.channel, sku: row.sku, category: row.category, metrics: row.current.metrics, sources: row.current.sources })), { category: activeCategory, query: query.trim().toLowerCase() }, filenames), "profitlens-products.csv")}>{copy.downloadProductsCsv}</button>
      <span className="note">{copy.downloadNote}</span>
    </div>
    <div className="metric-strip"><p aria-live="polite">{fill(copy.rowCount, { n: rows.length })}</p><p className="note">{activeCategory ? categoryLabel(activeCategory, alias) : copy.allCategories} · {negativeOnly ? copy.stateNegativeOnly : copy.stateAll}</p></div>
    <details><summary>{labels.sections.technicalDetails}</summary><p className="note">{copy.deltaFormulaNote}</p></details>
    {rows.length === 0 ? <p>{copy.empty}</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.tableAria}><table className="table" data-testid="product-table">
      <caption className="sr-only">{copy.tableCaption}</caption>
      <thead><tr><th scope="col">{labels.csvColumns.channel}</th><th scope="col">SKU</th><th scope="col">{labels.csvColumns.category}</th><th scope="col">{labels.csvColumns.activity}</th><th scope="col">{periodMetric("previous", metricDefinitions.net_revenue.label)}</th><th scope="col">{periodMetric("previous", metricDefinitions.gross_profit.label)}</th><th scope="col">{changeLabel("net_revenue")}</th><th scope="col">{changeLabel("gross_profit")}</th>{currentColumns.map(name => <th scope="col" key={name}>{periodMetric("current", metricDefinitions[name].shortLabel)}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={JSON.stringify([row.channel, row.sku])}><td>{channelLabel(row.channel, alias)}</td><th scope="row">{row.sku}</th><td>{row.category.trim() ? categoryLabel(row.category, alias) : copy.blankCategory}</td><td>{activityLabels[row.activity]}</td>{cell(row, "previous", "net_revenue", metricDefinitions.net_revenue.label)}{cell(row, "previous", "gross_profit", metricDefinitions.gross_profit.label)}{deltaCell(row, "net_revenue")}{deltaCell(row, "gross_profit")}{currentColumns.map(name => cell(row, "current", name, metricDefinitions[name].shortLabel))}</tr>)}</tbody>
    </table></div>}
  </section>;
}
