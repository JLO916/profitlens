import { aggregatePeriod, aggregateSales, uniqueSources } from "./aggregation";
import { buildBridge } from "./bridge";
import { dayCount, validatePeriods } from "./date";
import { calculateMetrics } from "./metrics";
import { diagnose } from "./rules";
import { PRODUCT_METRICS, type AnalysisFilters, type Dataset, type Metrics, type Period, type ProductFilters, type ProductMetrics, type ProductRow, type SalesRow } from "./types";

function selectChannels(dataset: Dataset, selected?: string[]): string[] {
  const channels = selected ?? dataset.manifest.channels;
  if (!Array.isArray(channels) || channels.length === 0 || channels.some(channel => typeof channel !== "string" || !dataset.manifest.channels.includes(channel)) || new Set(channels).size !== channels.length) throw new RangeError("INVALID_CHANNEL_FILTER");
  return [...channels].sort();
}
function checkDataset(dataset: Dataset): void {
  if (dataset.issues.some(issue => issue.severity === "blocking")) throw new Error("BLOCKING_DATASET");
}
function checkPeriod(dataset: Dataset, period: Period): void {
  dayCount(period);
  if (period.start < dataset.manifest.coverage_start || period.end > dataset.manifest.coverage_end) throw new RangeError("PERIOD_OUTSIDE_COVERAGE");
}
function productMetrics(metrics: Metrics): ProductMetrics {
  return Object.fromEntries(PRODUCT_METRICS.map(field => [field, metrics[field]])) as ProductMetrics;
}

/** 僅限已驗證的完整通路scope；拒絕把SKU/category filters帶進通路貢獻。 */
export function analyzeDataset(dataset: Dataset, filters: AnalysisFilters = {}) {
  checkDataset(dataset);
  if (!filters || Object.keys(filters).some(key => !["channels", "previous_period", "current_period"].includes(key))) throw new TypeError("INVALID_CHANNEL_ANALYSIS_FILTER");
  const channels = selectChannels(dataset, filters.channels);
  const previousPeriod = filters.previous_period ?? dataset.manifest.previous_period;
  const currentPeriod = filters.current_period ?? dataset.manifest.current_period;
  const periodErrors = validatePeriods({ ...dataset.manifest, previous_period: previousPeriod, current_period: currentPeriod });
  if (periodErrors.length) throw new RangeError(periodErrors.join(","));
  const previous = aggregatePeriod(dataset, previousPeriod, channels);
  const current = aggregatePeriod(dataset, currentPeriod, channels);
  const products = analyzeProducts(dataset, { period: currentPeriod, channels });
  const diagnostics = diagnose({ dataset, previous, current, currentProducts: products.rows, channels });
  return {
    metric_version: "contribution-v1" as const,
    data_as_of: dataset.manifest.data_as_of,
    dataset_id: dataset.manifest.dataset_id,
    scope: { channels: [...channels], previous_period: { ...previousPeriod }, current_period: { ...currentPeriod } },
    previous,
    current,
    bridge: buildBridge(previous.totals, current.totals),
    ...diagnostics,
  };
}

/** 商品API的型別/回傳值皆不含通路費用、廣告與貢獻，無任何SKU分攤。 */
export function analyzeProducts(dataset: Dataset, filters: ProductFilters) {
  checkDataset(dataset);
  if (!filters || Object.keys(filters).some(key => !["period", "channels", "sku", "category"].includes(key))) throw new TypeError("INVALID_PRODUCT_FILTER");
  for (const key of ["sku", "category"] as const) {
    if (filters[key] !== undefined && (typeof filters[key] !== "string" || filters[key]!.trim() === "")) throw new TypeError("INVALID_PRODUCT_FILTER");
  }
  const channels = selectChannels(dataset, filters.channels);
  checkPeriod(dataset, filters.period);
  const sales = dataset.sales.filter(row => channels.includes(row.channel) && row.date >= filters.period.start && row.date <= filters.period.end && (filters.sku === undefined || row.sku === filters.sku) && (filters.category === undefined || row.category === filters.category));
  const groups = new Map<string, SalesRow[]>();
  for (const row of sales) {
    const key = JSON.stringify([row.channel, row.sku]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const rows: ProductRow[] = [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => ({
    channel: group[0].channel,
    sku: group[0].sku,
    category: group[0].category,
    metrics: productMetrics(calculateMetrics(aggregateSales(group, dataset.manifest.sales_coverage_confirmed))),
    sources: uniqueSources([...group.map(row => row.source), ...(!dataset.manifest.sales_coverage_confirmed ? [{ file: "manifest.json" as const, line: null }] : [])]),
  }));
  return {
    scope: { period: { ...filters.period }, channels, ...(filters.sku === undefined ? {} : { sku: filters.sku }), ...(filters.category === undefined ? {} : { category: filters.category }) },
    metrics: productMetrics(calculateMetrics(aggregateSales(sales, dataset.manifest.sales_coverage_confirmed))),
    sources: uniqueSources([...sales.map(row => row.source), ...(!dataset.manifest.sales_coverage_confirmed ? [{ file: "manifest.json" as const, line: null }] : [])]),
    rows,
  };
}
