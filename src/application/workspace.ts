import { assertSupportedAnalysisChannels, assertSupportedAnalysisPeriods } from "./limits";
import { fill, labels } from "@/i18n";
import { periodPresets } from "./period-presets";
import { aggregatePeriod } from "../domain/aggregation";
import { analyzeDataset, analyzeProducts } from "../domain/analysis";
import { dayCount } from "../domain/date";
import type { AnalysisFilters, Dataset, DatasetInput, Metrics, Period, SourceRef } from "../domain/types";

export interface WeeklyRow {
  label: string;
  start: string;
  end: string;
  /** V3-9b F8：去年同期的週標 "yoy"，只放在 snapshot.yoy.weeks；既有 snapshot.weeks 只放 previous／current。 */
  period: "previous" | "current" | "yoy";
  metrics: Metrics;
  sources: SourceRef[];
}
/** 既有 snapshot.weeks 的列（上期與本期）；管理損益表、趨勢 takeaway、抽屜的 weeks.find 都只看這兩期。 */
export type PeriodWeeklyRow = WeeklyRow & { period: "previous" | "current" };
/** V3-9b F8 去年同期的週（切法與 weeks 相同：從去年同期起日每 7 天一段，最後一段可不滿 7 天）。 */
export type YoyWeeklyRow = WeeklyRow & { period: "yoy" };
/**
 * V3-9b F8 去年同期彙總（PRD §10.1 F8、§9.5）：期間取 periodPresets 的「去年同期」（本期各減一年，規則見 period-presets.ts）。
 * ready：整段與每週都用 domain 既有的 aggregatePeriod 多算一次（同一組通路），不改函式、不自己寫公式；
 * unavailable：reason 直接用該快捷的原因（labels 文案）。只在 client 端隨快照重建，不進備份、不影響 filter_hash／dataset_hash。
 */
export type YoySummary =
  | { status: "ready"; period: Period; weeks: YoyWeeklyRow[]; metrics: Metrics; sources: SourceRef[] }
  | { status: "unavailable"; reason: string };
export interface WorkspaceSnapshot {
  report: ReturnType<typeof analyzeDataset>;
  products: ReturnType<typeof analyzeProducts>;
  weeks: PeriodWeeklyRow[];
  /** V3-9b F8：選填（舊程式組出的快照沒有這一欄時，趨勢圖當作去年同期無資料）。 */
  yoy?: YoySummary;
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
  const weeks: PeriodWeeklyRow[] = [];
  for (const period of ["previous", "current"] as const) {
    // V3-9a 收尾：週欄標題改從 labels 取（只在管理損益表的週欄、格子的可及名稱與抽屜標題顯示）。
    weeks.push(...weeklyRows(dataset, report[period].period, report.scope.channels, period, n => fill(labels.overview.pnlV3.weekLabel[period], { n })));
  }
  return {
    report, products, weeks, yoy: yoySummary(dataset, report), dataset_hash: datasetHash,
    filter_hash: await digest(report.scope), metric_version: report.metric_version, data_as_of: report.data_as_of,
  };
}

/** 每週切法（既有 weeks 與 V3-9b 去年同期共用）：從期間起日每 7 天一段、最後一段可不滿 7 天，每段用 aggregatePeriod 彙總同一組通路。 */
function weeklyRows<P extends WeeklyRow["period"]>(dataset: Dataset, selected: Period, channels: readonly string[], period: P, label: (n: number) => string): (WeeklyRow & { period: P })[] {
  const rows: (WeeklyRow & { period: P })[] = [];
  const count = dayCount(selected);
  const first = Date.parse(`${selected.start}T00:00:00Z`);
  const dateAt = (offset: number) => new Date(first + offset * 86_400_000).toISOString().slice(0, 10);
  for (let offset = 0; offset < count; offset += 7) {
    const start = dateAt(offset);
    const end = dateAt(Math.min(offset + 6, count - 1));
    const summary = aggregatePeriod(dataset, { start, end }, channels);
    rows.push({ label: label(offset / 7 + 1), start, end, period, metrics: summary.metrics, sources: summary.sources });
  }
  return rows;
}

/** V3-9b F8 去年同期（PRD §10.1 F8）：periodPresets 以目前兩期與比較方式算出「去年同期」；可用時整段與每週各多呼叫一次 aggregatePeriod。 */
function yoySummary(dataset: Dataset, report: WorkspaceSnapshot["report"]): YoySummary {
  const { scope } = report;
  let preset: ReturnType<typeof periodPresets>[number] | undefined;
  try {
    preset = periodPresets(dataset.manifest, { previous: scope.previous_period, current: scope.current_period, comparison_mode: scope.comparison_mode }).find(item => item.id === "yoy");
  } catch {
    // 資料集的涵蓋日期不合法時 periodPresets 會拋錯（驗證已擋下，這裡只是防呆）：去年同期當作無法取得，不讓整個快照中斷。
    preset = undefined;
  }
  if (!preset) return { status: "unavailable", reason: labels.shell.periods.yoyInvalidCurrent };
  if (preset.status !== "ready") return { status: "unavailable", reason: preset.reason };
  const period = { start: preset.previous.start, end: preset.previous.end };
  const summary = aggregatePeriod(dataset, period, scope.channels);
  return {
    status: "ready", period,
    weeks: weeklyRows(dataset, period, scope.channels, "yoy", n => fill(labels.overview.trendYoyV3.weekLabel, { n })),
    metrics: summary.metrics, sources: summary.sources,
  };
}
