import { analyzeProducts } from "./analysis";
import { aggregateSales, uniqueSources } from "./aggregation";
import { validatePeriods } from "./date";
import { calculateMetrics, compareMoney } from "./metrics";
import { parseCents } from "./money";
import { PRODUCT_METRICS, SALES_FIELDS, type AnalysisFilters, type Dataset, type Metric, type ProductMetrics, type SourceRef } from "./types";

export const PRODUCT_MONEY_FIELDS = [...SALES_FIELDS, "net_revenue", "gross_profit"] as const;
export type ProductMoneyField = typeof PRODUCT_MONEY_FIELDS[number];
export interface ProductPeriodValue {
  /** A literal zero sales row remains observed; absence is separate from zero. */
  presence: "observed" | "no_rows_confirmed" | "unknown_coverage";
  metrics: ProductMetrics;
  sources: SourceRef[];
}
export interface ProductComparisonRow {
  channel: string;
  sku: string;
  category: string;
  activity: "both_observed" | "current_only" | "previous_only" | "coverage_unknown";
  previous: ProductPeriodValue;
  current: ProductPeriodValue;
  changes: Record<ProductMoneyField, Metric>;
}
export type ProductComparisonSort = "gross_profit_change" | "current_gross_profit" | "net_revenue_change" | "current_net_revenue" | "sku";
export interface ProductComparisonSelection {
  category?: string;
  query?: string;
  negativeOnly?: boolean;
  sort?: ProductComparisonSort;
  direction?: "ascending" | "descending";
}

/** Two periods' channel × SKU union. No channel cost/ad fields enter this API.
 * Absence is zero ONLY under the provider's explicit sales coverage confirmation.
 * An observed first/last row never establishes launch or discontinuation. */
export function compareProducts(dataset: Dataset, filters: AnalysisFilters = {}) {
  if (!filters || Object.keys(filters).some(key => !["channels", "previous_period", "current_period", "comparison_mode"].includes(key))) throw new TypeError("INVALID_PRODUCT_COMPARISON_FILTER");
  const previous_period = filters.previous_period ?? dataset.manifest.previous_period;
  const current_period = filters.current_period ?? dataset.manifest.current_period;
  const comparison_mode = filters.comparison_mode ?? dataset.manifest.comparison_mode ?? "same_days";
  const errors = validatePeriods({ ...dataset.manifest, previous_period, current_period, comparison_mode });
  if (errors.length) throw new RangeError(errors.join(","));
  const previous = analyzeProducts(dataset, { period: previous_period, channels: filters.channels });
  const current = analyzeProducts(dataset, { period: current_period, channels: filters.channels });
  const key = (row: { channel: string; sku: string }) => JSON.stringify([row.channel, row.sku]);
  const before = new Map(previous.rows.map(row => [key(row), row]));
  const after = new Map(current.rows.map(row => [key(row), row]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const empty = calculateMetrics(aggregateSales([], dataset.manifest.sales_coverage_confirmed));
  const emptyProductMetrics = Object.fromEntries(PRODUCT_METRICS.map(name => [name, empty[name]])) as ProductMetrics;
  const rows: ProductComparisonRow[] = keys.map(id => {
    const p = before.get(id);
    const c = after.get(id);
    const identity = (p ?? c)!;
    const absent = (): ProductPeriodValue => ({
      presence: dataset.manifest.sales_coverage_confirmed ? "no_rows_confirmed" : "unknown_coverage",
      metrics: structuredClone(emptyProductMetrics),
      sources: [{ file: "manifest.json", line: null, channel: identity.channel, sku: identity.sku }],
    });
    const previousValue: ProductPeriodValue = p ? { presence: "observed", metrics: p.metrics, sources: uniqueSources(p.sources) } : absent();
    const currentValue: ProductPeriodValue = c ? { presence: "observed", metrics: c.metrics, sources: uniqueSources(c.sources) } : absent();
    return {
      channel: identity.channel, sku: identity.sku, category: identity.category,
      activity: !dataset.manifest.sales_coverage_confirmed ? "coverage_unknown" : p && c ? "both_observed" : c ? "current_only" : "previous_only",
      previous: previousValue, current: currentValue,
      changes: Object.fromEntries(PRODUCT_MONEY_FIELDS.map(name => [name, compareMoney(previousValue.metrics[name], currentValue.metrics[name]).absolute_change])) as Record<ProductMoneyField, Metric>,
    };
  });
  return { scope: { channels: previous.scope.channels, previous_period: { ...previous_period }, current_period: { ...current_period }, comparison_mode }, rows };
}

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const identityOrder = (a: ProductComparisonRow, b: ProductComparisonRow) => lexical(a.channel, b.channel) || lexical(a.sku, b.sku);

/** Sorting never converts cents to Number. Unknown values stay last in BOTH directions. */
export function selectProductComparisonRows(rows: readonly ProductComparisonRow[], selection: ProductComparisonSelection = {}): ProductComparisonRow[] {
  const query = selection.query?.trim().toLocaleLowerCase() ?? "";
  const sort = selection.sort ?? "gross_profit_change";
  const direction = selection.direction === "descending" ? -1 : 1;
  const metric = (row: ProductComparisonRow): Metric => sort === "current_gross_profit" ? row.current.metrics.gross_profit : sort === "current_net_revenue" ? row.current.metrics.net_revenue : sort === "net_revenue_change" ? row.changes.net_revenue : row.changes.gross_profit;
  return rows.filter(row => (!selection.category || row.category === selection.category)
    && (!query || row.sku.toLocaleLowerCase().includes(query))
    && (!selection.negativeOnly || (row.current.metrics.gross_profit.value !== null && parseCents(row.current.metrics.gross_profit.value)! < 0n)))
    .sort((a, b) => {
      if (sort === "sku") return direction * lexical(a.sku, b.sku) || identityOrder(a, b);
      const av = parseCents(metric(a).value);
      const bv = parseCents(metric(b).value);
      if (av === null || bv === null) return av === bv ? identityOrder(a, b) : av === null ? 1 : -1;
      return direction * (av < bv ? -1 : av > bv ? 1 : 0) || identityOrder(a, b);
    });
}
