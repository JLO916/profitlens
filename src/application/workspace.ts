import { assertSupportedAnalysisChannels, assertSupportedAnalysisPeriods } from "./limits";
import { aggregatePeriod } from "../domain/aggregation";
import { analyzeDataset, analyzeProducts } from "../domain/analysis";
import { dayCount } from "../domain/date";
import type { AnalysisFilters, Dataset, DatasetInput, Metrics, SourceRef } from "../domain/types";

export interface WeeklyRow {
  label: string;
  start: string;
  end: string;
  period: "previous" | "current";
  metrics: Metrics;
  sources: SourceRef[];
}
export interface WorkspaceSnapshot {
  report: ReturnType<typeof analyzeDataset>;
  products: ReturnType<typeof analyzeProducts>;
  weeks: WeeklyRow[];
  dataset_hash: string;
  filter_hash: string;
  metric_version: "contribution-v1";
  data_as_of: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Hash original CSV text and settings; key insertion order is immaterial. */
export async function hashInput(input: DatasetInput): Promise<string> {
  const files = Object.fromEntries(Object.entries(input.files).map(([file, contents]) => [file,
    typeof contents === "string" ? contents : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(contents),
  ]));
  return digest({ manifest: input.manifest, files, ...(input.confirmedUnknownColumns === undefined ? {} : { confirmedUnknownColumns: input.confirmedUnknownColumns }) });
}

/** Framework-free view data: every money/ratio/diagnosis comes from M1. */
export async function createSnapshot(dataset: Dataset, filters: AnalysisFilters, datasetHash: string): Promise<WorkspaceSnapshot> {
  assertSupportedAnalysisChannels(filters.channels ?? dataset.manifest.channels);
  assertSupportedAnalysisPeriods(
    filters.previous_period ?? dataset.manifest.previous_period,
    filters.current_period ?? dataset.manifest.current_period,
  );
  const report = analyzeDataset(dataset, filters);
  const products = analyzeProducts(dataset, { period: report.scope.current_period, channels: report.scope.channels });
  const weeks: WeeklyRow[] = [];
  for (const period of ["previous", "current"] as const) {
    const selected = report[period].period;
    const count = dayCount(selected);
    const first = Date.parse(`${selected.start}T00:00:00Z`);
    const dateAt = (offset: number) => new Date(first + offset * 86_400_000).toISOString().slice(0, 10);
    for (let offset = 0; offset < count; offset += 7) {
      const start = dateAt(offset);
      const end = dateAt(Math.min(offset + 6, count - 1));
      const summary = aggregatePeriod(dataset, { start, end }, report.scope.channels);
      weeks.push({ label: `${period === "previous" ? "前期" : "本期"}第 ${offset / 7 + 1} 週`, start, end, period, metrics: summary.metrics, sources: summary.sources });
    }
  }
  return {
    report, products, weeks, dataset_hash: datasetHash,
    filter_hash: await digest(report.scope), metric_version: report.metric_version, data_as_of: report.data_as_of,
  };
}
