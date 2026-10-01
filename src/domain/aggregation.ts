import { calculateMetrics } from "./metrics";
import { dateRange, dayCount } from "./date";
import { reasons, sumAmounts } from "./money";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type Amount, type AmountField, type Dataset, type DailyChannel, type Period, type PeriodAnalysis, type SalesRow, type SourceRef, type Summary, type Totals } from "./types";

export function emptyTotals(): Totals {
  const totals = {} as Totals;
  for (const field of AMOUNT_FIELDS) totals[field] = { cents: 0n, reason_codes: [] };
  return totals;
}
export function sumTotals(values: readonly Totals[]): Totals {
  return Object.fromEntries(AMOUNT_FIELDS.map(field => [field, sumAmounts(values.map(total => total[field]))])) as Totals;
}
export function fieldAmount(cents: bigint | null, field: AmountField): Amount {
  return { cents, reason_codes: cents === null ? [field === "cogs_net" ? "MISSING_COGS" : `MISSING_${field.toUpperCase()}`] : [] };
}
export function uniqueSources(sources: readonly SourceRef[]): SourceRef[] {
  const map = new Map(sources.map(source => [JSON.stringify([source.file, source.line, source.date, source.channel, source.sku]), { ...source }]));
  return [...map.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, source]) => source);
}
export function aggregateSales(rows: readonly SalesRow[], confirmed: boolean): Totals {
  const totals = emptyTotals();
  for (const field of SALES_FIELDS) {
    totals[field] = sumAmounts(rows.map(row => fieldAmount(row[field], field)));
    if (!confirmed) totals[field] = { cents: null, reason_codes: reasons(totals[field].reason_codes, ["SALES_COVERAGE_UNCONFIRMED"]) };
  }
  return totals;
}
const pairKey = (date: string, channel: string) => JSON.stringify([date, channel]);
const within = (date: string, period: Period) => date >= period.start && date <= period.end;

/** sales先彙總成唯一日×通路，再接一筆日通路成本/廣告；不做SKU費用分攤。 */
export function aggregatePeriod(dataset: Dataset, period: Period, channels: readonly string[]): PeriodAnalysis {
  if (channels.length === 0 || new Set(channels).size !== channels.length || channels.some(channel => !dataset.manifest.channels.includes(channel))) throw new RangeError("INVALID_CHANNEL_FILTER");
  const days = dayCount(period);
  if (period.start < dataset.manifest.coverage_start || period.end > dataset.manifest.coverage_end) throw new RangeError("PERIOD_OUTSIDE_COVERAGE");
  const selected = new Set(channels);
  const sales = dataset.sales.filter(row => selected.has(row.channel) && within(row.date, period));
  const costs = dataset.costs.filter(row => selected.has(row.channel) && within(row.date, period));
  const ads = dataset.ads.filter(row => selected.has(row.channel) && within(row.date, period));
  const salesMap = new Map<string, SalesRow[]>();
  for (const row of sales) {
    const key = pairKey(row.date, row.channel);
    const group = salesMap.get(key) ?? [];
    group.push(row);
    salesMap.set(key, group);
  }
  const costsMap = new Map(costs.map(row => [pairKey(row.date, row.channel), row]));
  const adsMap = new Map(ads.map(row => [pairKey(row.date, row.channel), row]));
  const pairs = new Map<string, { date: string; channel: string }>();
  const daily_complete = days * channels.length <= 50_000;
  if (daily_complete) {
    for (const date of dateRange(period.start, period.end)) for (const channel of channels) pairs.set(pairKey(date, channel), { date, channel });
  } else {
    // 避免惡意超長coverage展開巨量空列。保留每個已觀察pair，摘要下方仍檢查完整性。
    for (const row of [...sales, ...costs, ...ads]) pairs.set(pairKey(row.date, row.channel), { date: row.date, channel: row.channel });
  }
  const daily: DailyChannel[] = [...pairs.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, pair]) => {
    const salesRows = salesMap.get(key) ?? [];
    const totals = aggregateSales(salesRows, dataset.manifest.sales_coverage_confirmed);
    const cost = costsMap.get(key);
    const ad = adsMap.get(key);
    for (const field of COST_FIELDS) totals[field] = cost ? fieldAmount(cost[field], field) : { cents: null, reason_codes: ["MISSING_CHANNEL_COST_DAY"] };
    totals.ad_spend = ad ? fieldAmount(ad.ad_spend, "ad_spend") : { cents: null, reason_codes: ["MISSING_AD_DAY"] };
    const sources: SourceRef[] = [
      ...salesRows.map(row => row.source),
      cost?.source ?? { file: "channel_costs_daily.csv", line: null, ...pair },
      ad?.source ?? { file: "ad_spend_daily.csv", line: null, ...pair },
    ];
    if (!dataset.manifest.sales_coverage_confirmed) sources.push({ file: "manifest.json", line: null });
    return { ...pair, totals, metrics: calculateMetrics(totals), sources: uniqueSources(sources) };
  });
  const summaries = channels.map(channel => {
    const rows = daily.filter(row => row.channel === channel);
    const totals = sumTotals(rows.map(row => row.totals));
    const sources = rows.flatMap(row => row.sources);
    if (!dataset.manifest.sales_coverage_confirmed) {
      for (const field of SALES_FIELDS) totals[field] = { cents: null, reason_codes: reasons(totals[field].reason_codes, ["SALES_COVERAGE_UNCONFIRMED"]) };
      sources.push({ file: "manifest.json", line: null, channel });
    }
    // sparse daily view也不可將未觀察到的費用當作0，檢查完整日數。
    if (costs.filter(row => row.channel === channel).length < days) {
      for (const field of COST_FIELDS) totals[field] = { cents: null, reason_codes: reasons(totals[field].reason_codes, ["MISSING_CHANNEL_COST_DAY"]) };
      if (!daily_complete) sources.push({ file: "channel_costs_daily.csv", line: null, channel });
    }
    if (ads.filter(row => row.channel === channel).length < days) {
      totals.ad_spend = { cents: null, reason_codes: reasons(totals.ad_spend.reason_codes, ["MISSING_AD_DAY"]) };
      if (!daily_complete) sources.push({ file: "ad_spend_daily.csv", line: null, channel });
    }
    const summary: Summary = { totals, metrics: calculateMetrics(totals), sources: uniqueSources(sources) };
    return [channel, summary] as const;
  });
  const totals = sumTotals(summaries.map(([, summary]) => summary.totals));
  return { period: { ...period }, totals, metrics: calculateMetrics(totals), sources: uniqueSources(summaries.flatMap(([, summary]) => summary.sources)), channels: Object.fromEntries(summaries), daily, daily_complete };
}
