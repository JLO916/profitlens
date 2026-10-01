import { encodeCsv, type CsvCell, type FilenameMap } from "./export";
import type { WorkspaceSnapshot } from "./workspace";
import { PRODUCT_MONEY_FIELDS, type ProductComparisonRow, type ProductComparisonSelection } from "../domain/product-comparison";
import type { Dataset, Metric, SourceRef } from "../domain/types";

const text = (value: string): CsvCell => ({ kind: "text", value });
const numeric = (value: string | null): CsvCell => value === null ? { kind: "null" } : { kind: "number", value };

/** One row per visible product; monetary values are supplied by the pure domain.
 * Text uses the existing formula-injection safe encoder, including source names. */
export function exportProductComparisonCsv(dataset: Dataset, snapshot: WorkspaceSnapshot, rows: readonly ProductComparisonRow[], selection: ProductComparisonSelection, filenames: FilenameMap = {}): string {
  const headers = [
    "row_type", "channel", "sku", "category", "activity", "previous_presence", "current_presence",
    ...PRODUCT_MONEY_FIELDS.flatMap(name => [`previous_${name}`, `previous_${name}_reasons`, `current_${name}`, `current_${name}_reasons`, `${name}_change`, `${name}_change_reasons`]),
    "previous_gross_margin", "previous_gross_margin_reasons", "current_gross_margin", "current_gross_margin_reasons", "previous_sources", "current_sources",
    "dataset_id", "dataset_hash", "filter_hash", "metric_version", "as_of", "currency", "timezone", "amount_basis", "sales_coverage_confirmed", "comparison_mode", "previous_days", "current_days", "previous_start", "previous_end", "current_start", "current_end", "channels", "category_filter", "query", "negative_only", "sort", "direction", "limitations",
  ];
  const metricCells = (metric: Metric): CsvCell[] => [numeric(metric.value), text(JSON.stringify(metric.reason_codes))];
  const sources = (refs: readonly SourceRef[]) => text(JSON.stringify(refs.map(source => ({ ...source, file: filenames[source.file] ?? source.file, logical_file: source.file }))));
  const metadata: CsvCell[] = [
    text(dataset.manifest.dataset_id), text(snapshot.dataset_hash), text(snapshot.filter_hash), text(snapshot.metric_version), text(snapshot.data_as_of), text(dataset.manifest.currency), text(dataset.manifest.timezone), text(dataset.manifest.amount_basis), text(String(dataset.manifest.sales_coverage_confirmed)),
    text(snapshot.report.comparison.mode), numeric(String(snapshot.report.comparison.previous_days)), numeric(String(snapshot.report.comparison.current_days)),
    text(snapshot.report.previous.period.start), text(snapshot.report.previous.period.end), text(snapshot.report.current.period.start), text(snapshot.report.current.period.end), text(JSON.stringify(snapshot.report.scope.channels)),
    text(selection.category ?? ""), text(selection.query ?? ""), text(String(selection.negativeOnly ?? false)), text(selection.sort ?? "gross_profit_change"), text(selection.direction ?? "ascending"),
    text("兩期實際商品金額合計，非日均；差額為本期減前期。通路費用及廣告不分攤至 SKU，不提供商品行銷後貢獻。比率原值為分子／分母。未觀察銷售列不證明新品或停售；只有完整性確認後才能將無列視為無銷售活動。缺值不補零；退款按入帳日；成本回沖僅依已入帳淨額。"),
  ];
  const contents = rows.map(row => [
    text("product_comparison"), text(row.channel), text(row.sku), text(row.category), text(row.activity), text(row.previous.presence), text(row.current.presence),
    ...PRODUCT_MONEY_FIELDS.flatMap(name => [...metricCells(row.previous.metrics[name]), ...metricCells(row.current.metrics[name]), ...metricCells(row.changes[name])]),
    ...metricCells(row.previous.metrics.gross_margin), ...metricCells(row.current.metrics.gross_margin), sources(row.previous.sources), sources(row.current.sources), ...metadata,
  ]);
  if (!contents.length) contents.push([text("selection"), ...Array.from({ length: headers.length - metadata.length - 1 }, (): CsvCell => ({ kind: "null" })), ...metadata]);
  return encodeCsv([headers.map(text), ...contents]);
}
