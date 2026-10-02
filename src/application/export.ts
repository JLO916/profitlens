import { uniqueSources } from "../domain/aggregation";
import { AMOUNT_FIELDS, COST_FIELDS, MONEY_METRICS, PRODUCT_METRICS, SALES_FIELDS, type Dataset, type Metric, type MetricName, type Period, type ProductRow, type SourceRef, type ValidationIssue } from "../domain/types";
import { fill, labels } from "../i18n";
import { conversionSentence, csvHeader, plainIssueMessage } from "./copy";
import type { TaxConversion } from "./tax-basis";
import { metricDefinitions } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

export type CsvCell = { kind: "text"; value: string } | { kind: "number"; value: string } | { kind: "null" };
export type FilenameMap = Partial<Record<SourceRef["file"], string>>;
export interface ProductExportScope { category?: string; query?: string }

const text = (value: string): CsvCell => ({ kind: "text", value });
const numeric = (value: string): CsvCell => ({ kind: "number", value });
const empty: CsvCell = { kind: "null" };

/** Inert CSV text. Numbers must already be domain-produced decimal strings. */
export function encodeCsv(rows: readonly (readonly CsvCell[])[]): string {
  const serialize = (cell: CsvCell): string => {
    let value: string;
    if (cell.kind === "null") value = "";
    else if (cell.kind === "number") {
      if (typeof cell.value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(cell.value)) throw new TypeError("INVALID_NUMERIC_CELL");
      // Never convert through Number: retain cents and arbitrarily long ratios.
      value = cell.value;
    } else if (cell.kind === "text") {
      if (typeof cell.value !== "string") throw new TypeError("INVALID_TEXT_CELL");
      value = cell.value;
      // Conservatively neutralize leading whitespace/control characters too,
      // including BOM and directional/zero-width formatting prefixes.
      if (/^[=+\-@\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) value = `'${value}`;
    } else throw new TypeError("INVALID_CSV_CELL");
    return `"${value.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${rows.map(row => row.map(serialize).join(",")).join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

const HEADERS = [
  "dataset_id", "dataset_hash", "filter_hash", "metric_version", "as_of", "currency", "timezone", "amount_basis", "sales_coverage_confirmed", "filter_scope",
  "comparison_mode", "previous_days", "current_days", "row_type", "scope", "period", "period_start", "period_end", "previous_period_start", "previous_period_end", "current_period_start", "current_period_end",
  "channel", "sku", "category", "product_category", "product_query", "metric", "metric_label", "unit", "value", "reason_codes", "source_refs", "bridge_reconciled", "limitations",
] as const;
type ExportColumn = typeof HEADERS[number];
type ExportRecord = Partial<Record<ExportColumn, CsvCell>>;

function metadata(dataset: Dataset, snapshot: WorkspaceSnapshot, conversion?: TaxConversion | null): ExportRecord {
  const converted = conversionSentence(conversion);
  return {
    dataset_id: text(dataset.manifest.dataset_id), dataset_hash: text(snapshot.dataset_hash), filter_hash: text(snapshot.filter_hash),
    metric_version: text(snapshot.metric_version), as_of: text(snapshot.data_as_of), currency: text(dataset.manifest.currency), timezone: text(dataset.manifest.timezone),
    amount_basis: text(dataset.manifest.amount_basis), sales_coverage_confirmed: text(String(dataset.manifest.sales_coverage_confirmed)), filter_scope: text(JSON.stringify(snapshot.report.scope)),
    comparison_mode: text(snapshot.report.comparison.mode), previous_days: numeric(String(snapshot.report.comparison.previous_days)), current_days: numeric(String(snapshot.report.comparison.current_days)),
    previous_period_start: text(snapshot.report.previous.period.start), previous_period_end: text(snapshot.report.previous.period.end),
    current_period_start: text(snapshot.report.current.period.start), current_period_end: text(snapshot.report.current.period.end),
    limitations: text(converted ? `${labels.ui.export.limitationsSnapshot} ${converted}` : labels.ui.export.limitationsSnapshot),
  };
}
function sourceRefs(sources: readonly SourceRef[], filenameMap: FilenameMap): CsvCell {
  return text(JSON.stringify(uniqueSources(sources).map(source => ({ ...source, file: filenameMap[source.file] ?? source.file, logical_file: source.file }))));
}
function metricSources(name: MetricName, sources: readonly SourceRef[]): SourceRef[] {
  const files = new Set<SourceRef["file"]>(["manifest.json"]);
  for (const field of metricDefinitions[name].fields) {
    if ((SALES_FIELDS as readonly string[]).includes(field)) files.add("sales_daily.csv");
    else if ((COST_FIELDS as readonly string[]).includes(field)) files.add("channel_costs_daily.csv");
    else if (field === "ad_spend") files.add("ad_spend_daily.csv");
  }
  return sources.filter(source => files.has(source.file));
}
function valueFields(metric: Metric): ExportRecord {
  return { value: metric.value === null ? empty : numeric(metric.value), reason_codes: text(JSON.stringify(metric.value === null && !metric.reason_codes.length ? ["MISSING_VALUE"] : metric.reason_codes)) };
}
function recordScope(kind: string, channels: readonly string[], period: string, range: Period): ExportRecord {
  return { scope: text(JSON.stringify({ kind, channels })), period: text(period), period_start: text(range.start), period_end: text(range.end) };
}
function renderRecords(base: ExportRecord, records: readonly ExportRecord[]): string {
  return encodeCsv([HEADERS.map(header => text(csvHeader(header))), ...records.map(record => HEADERS.map(header => record[header] ?? base[header] ?? text("")))]);
}
function metricRecord(name: MetricName, metric: Metric, sources: readonly SourceRef[], filenameMap: FilenameMap): ExportRecord {
  const definition = metricDefinitions[name];
  return {
    metric: text(name), metric_label: text(definition.label), unit: text(definition.unit === "percent" ? "ratio" : definition.unit === "money" ? "TWD" : "multiple"),
    ...valueFields(metric), source_refs: sourceRefs(metricSources(name, sources), filenameMap),
  };
}

/** Export the already-calculated active snapshot, without recomputing formulas. */
export function exportSnapshotCsv(dataset: Dataset, snapshot: WorkspaceSnapshot, filenameMap: FilenameMap = {}, conversion: TaxConversion | null = null): string {
  const records: ExportRecord[] = [];
  const metricNames = Object.keys(metricDefinitions) as MetricName[];
  for (const period of ["previous", "current"] as const) {
    const summary = snapshot.report[period];
    for (const name of metricNames) records.push({ row_type: text("period_summary"), ...recordScope("all", snapshot.report.scope.channels, period, summary.period), ...metricRecord(name, summary.metrics[name], summary.sources, filenameMap) });
    const dailyAverages = snapshot.report.comparison[period === "previous" ? "previous_daily_average" : "current_daily_average"];
    for (const name of MONEY_METRICS) records.push({ row_type: text("daily_average"), ...recordScope("all", snapshot.report.scope.channels, period, summary.period), ...metricRecord(name, dailyAverages[name], summary.sources, filenameMap), metric_label: text(fill(labels.ui.export.dailyAverageLabel, { metric: metricDefinitions[name].label })), unit: text("TWD/day") });
    for (const channel of snapshot.report.scope.channels) {
      const channelSummary = summary.channels[channel];
      for (const name of metricNames) records.push({ row_type: text("channel"), channel: text(channel), ...recordScope("channel", [channel], period, summary.period), ...metricRecord(name, channelSummary.metrics[name], channelSummary.sources, filenameMap) });
    }
  }
  for (const week of snapshot.weeks) {
    for (const name of metricNames) records.push({ row_type: text("weekly"), ...recordScope("all", snapshot.report.scope.channels, week.period, week), ...metricRecord(name, week.metrics[name], week.sources, filenameMap) });
  }
  const comparison = {
    start: [snapshot.report.previous.period.start, snapshot.report.current.period.start].sort()[0],
    end: [snapshot.report.previous.period.end, snapshot.report.current.period.end].sort()[1],
  };
  const bridgeSources = [...snapshot.report.previous.sources, ...snapshot.report.current.sources];
  for (const name of MONEY_METRICS) records.push({ row_type: text("daily_average_change"), ...recordScope("all", snapshot.report.scope.channels, "comparison", comparison), ...metricRecord(name, snapshot.report.comparison.daily_average_changes[name], [...snapshot.report.previous.sources, ...snapshot.report.current.sources], filenameMap), metric_label: text(fill(labels.ui.export.dailyAverageChangeLabel, { metric: metricDefinitions[name].label })), unit: text("TWD/day") });
  const bridgeMetadata: ExportRecord = {
    row_type: text("bridge"), ...recordScope("all", snapshot.report.scope.channels, "comparison", comparison), unit: text("TWD"),
    bridge_reconciled: snapshot.report.bridge.reconciled === null ? empty : text(String(snapshot.report.bridge.reconciled)),
  };
  for (const name of AMOUNT_FIELDS) records.push({ ...bridgeMetadata, metric: text(name), metric_label: text(`${metricDefinitions[name].label}${labels.csvSuffix.change}`), ...valueFields(snapshot.report.bridge.components[name]), source_refs: sourceRefs(metricSources(name, bridgeSources), filenameMap) });
  records.push({ ...bridgeMetadata, metric: text("sum"), metric_label: text(labels.ui.export.bridgeSumLabel), ...valueFields(snapshot.report.bridge.sum), source_refs: sourceRefs(bridgeSources, filenameMap) });
  records.push({ ...bridgeMetadata, metric: text("contribution_change"), metric_label: text(fill(labels.ui.export.contributionChangeLabel, { metric: metricDefinitions.contribution_after_marketing.label })), ...valueFields(snapshot.report.bridge.contribution_change), source_refs: sourceRefs(bridgeSources, filenameMap) });
  return renderRecords(metadata(dataset, snapshot, conversion), records);
}

/** Caller supplies the exact currently visible product rows; no ad allocation. */
export function exportProductsCsv(dataset: Dataset, snapshot: WorkspaceSnapshot, rows: readonly ProductRow[], productScope: ProductExportScope, filenameMap: FilenameMap = {}, conversion: TaxConversion | null = null): string {
  const selection: ExportRecord = { ...metadata(dataset, snapshot, conversion), product_category: text(productScope.category ?? ""), product_query: text(productScope.query ?? "") };
  const records: ExportRecord[] = [];
  for (const row of rows) {
    for (const name of PRODUCT_METRICS) records.push({
      row_type: text("product"), ...recordScope("sku", [row.channel], "current", snapshot.report.current.period),
      scope: text(JSON.stringify({ kind: "sku", channels: [row.channel], sku: row.sku, category: row.category, product_category: productScope.category ?? "", product_query: productScope.query ?? "" })),
      channel: text(row.channel), sku: text(row.sku), category: text(row.category), ...metricRecord(name, row.metrics[name], row.sources, filenameMap),
      limitations: text(labels.ui.export.limitationsProducts),
    });
  }
  if (!rows.length) records.push({ row_type: text("selection"), ...recordScope("sku", snapshot.report.scope.channels, "current", snapshot.report.current.period), value: empty, reason_codes: text(JSON.stringify(["NO_MATCHING_PRODUCTS"])), source_refs: text("[]") });
  return renderRecords(selection, records);
}

export function exportIssuesCsv(issues: readonly ValidationIssue[], filenameMap: FilenameMap = {}): string {
  const headers = ["severity", "file", "logical_file", "line", "field", "reason_code", "message", "message_plain", "date", "channel", "sku"];
  return encodeCsv([headers.map(header => text(csvHeader(header))), ...issues.map(issue => [
    text(issue.severity), text(filenameMap[issue.file] ?? issue.file), text(issue.file), issue.line === null ? empty : numeric(String(issue.line)),
    text(issue.field), text(issue.reason_code), text(issue.message), text(plainIssueMessage(issue)), text(issue.date ?? ""), text(issue.channel ?? ""), text(issue.sku ?? ""),
  ])]);
}
