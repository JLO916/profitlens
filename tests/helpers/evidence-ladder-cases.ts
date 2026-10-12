import { createHash } from "node:crypto";
import { assistKpis } from "@/application/assist-kpi";
import { breakevenMer } from "@/application/breakeven-mer";
import { assistWeeks } from "@/application/chart-assist-weeks";
import { channelWeeks } from "@/application/chart-channel-weeks";
import { channelStructure } from "@/application/chart-structure";
import { demoAlias } from "@/application/copy";
import { priorityEvidence } from "@/application/manager-summary";
import { buildPnlTable } from "@/application/pnl-table";
import { metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { channelWeekEvidence } from "@/components/channel-table";
import { heatCellEvidence, heatSectionModel } from "@/components/diagnosis/heat-section";
import { RATE_METRICS, ratesEvidence } from "@/components/diagnosis/rates-section";
import { shareAmountEvidence, shareFeesEvidence, sharePerHundredEvidence } from "@/components/diagnosis/share-section";
import type { EvidenceSelection } from "@/components/evidence-drawer";
import { assistEvidence, assistWeekEvidence } from "@/components/overview/assist-spark";
import { breakevenEvidence } from "@/components/overview/assist-table";
import { bridgeEvidence } from "@/components/overview/charts/bridge-section";
import { channelChangeEvidence, channelEvidence } from "@/components/overview/charts/channel-section";
import { profitEvidence } from "@/components/overview/charts/profit-section";
import { weekEvidence } from "@/components/overview/charts/trend-section";
import { pnlEvidence, pnlShareEvidence } from "@/components/overview/pnl-table";
import { productDeltaEvidence, productEvidence } from "@/components/product-evidence";
import { impactEvidence } from "@/components/top-three";
import { compareProducts } from "@/domain/product-comparison";
import { AMOUNT_FIELDS, type AnalysisFilters, type Dataset, type DatasetInput, type MetricName, type Metrics, type Period } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { synthetic4ChannelInput } from "./synthetic-4-channel";
import { yoyInput } from "./yoy-dataset";

// V4-7b 代理 B（06_BATCHES V4-7b、CHART_CATALOG G23、feature-retention MV5）：ladderMetrics 由 src/components/evidence-drawer.tsx 搬到
// src/application/evidence-ladder.ts（只搬移，邏輯不改）。本檔提供「搬移前後輸出相同」的三種證明共用的材料：
// （1）frozenLadderMetrics：搬移前（V4-7b 開工錨點 3ea161b，evidence-drawer.tsx:93-115）的函式原文凍結；只把參數型別寫開（原為 EvidenceDrawerProps["snapshot"]），函式本體逐字相同。
// （2）ladderCases：每一種證據——各頁 evidence builder 實際組出的 EvidenceSelection（橋接、利潤結構、通路、趨勢週、比率、管理損益表日／週格與佔比、
//      結構、各通路每週、熱表日格、其他常用指標與每週、損益兩平 MER、規則的優先證據與影響、商品與商品差額）＋期間 × 通路範圍 × 排除條件的格狀組合（grid）。
// （3）ladderGridBaseline：grid 的輸出摘要（每筆回傳哪一個既有的 Metrics 物件），tests/fixtures/evidence-ladder-v4-7a.json 是在 3ea161b 以原函式產生的基準。
//      grid 只依 domain（禁區）與 workspace 的快照組出，與各頁 builder 無關，所以之後的批次改 builder 不會動到它。
// 資料：golden、demo、refund_only、zero_ad、4 通路合成、兩年合成（去年同期可用）、三個通路篩選的快照，與兩個在記憶體改過的快照（最後一週只有 1 天、沒有 yoy 欄）。

export type LadderSnapshot = Pick<WorkspaceSnapshot, "report" | "weeks" | "yoy">;
export interface LadderLoaded { name: string; dataset: Dataset; snapshot: WorkspaceSnapshot }
export interface LadderCase { id: string; kind: string; evidence: EvidenceSelection }

/**
 * 搬移前的 ladderMetrics（3ea161b，src/components/evidence-drawer.tsx:93-115）原文凍結，供逐筆比對；不得修改。
 * 找出與這筆證據同期間、同通路範圍的合計指標；找不到（例如商品或跨期差額）就不畫階梯。
 */
export function frozenLadderMetrics(snapshot: LadderSnapshot | undefined, evidence: EvidenceSelection): Metrics | null {
  if (!snapshot || evidence.components || evidence.unitOverride || evidence.sku) return null;
  const { report, weeks } = snapshot;
  const same = (period: Period) => period.start === evidence.period.start && period.end === evidence.period.end;
  const allChannels = [...report.scope.channels].sort().join("|") === [...evidence.channels].sort().join("|");
  const base = same(report.previous.period) ? report.previous : same(report.current.period) ? report.current : null;
  if (base) {
    if (allChannels) return base.metrics;
    if (evidence.channels.length === 1 && base.channels[evidence.channels[0]]) return base.channels[evidence.channels[0]].metrics;
    return null;
  }
  if (!allChannels) return null;
  // V3-9b F8：去年同期整段與各週（snapshot.yoy）也能畫階梯；既有 weeks 的查找不變，找不到才看去年同期。
  const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy : null;
  if (yoy && same(yoy.period)) return yoy.metrics;
  const week = weeks.find(row => row.start === evidence.period.start && row.end === evidence.period.end) ?? yoy?.weeks.find(row => same(row));
  return week ? week.metrics : null;
}

/** 回傳值是快照裡的哪一個既有物件（以參照比對）：null、current、previous、current:{通路}、week:{n}、yoy、yoy-week:{n}；都不是時為 unknown。 */
export function ladderKey(snapshot: LadderSnapshot | undefined, result: Metrics | null): string {
  if (result === null) return "null";
  if (!snapshot) return "unknown";
  const { report } = snapshot;
  for (const period of ["previous", "current"] as const) {
    if (report[period].metrics === result) return period;
    for (const [channel, row] of Object.entries(report[period].channels)) if (row.metrics === result) return `${period}:${channel}`;
  }
  const week = snapshot.weeks.findIndex(row => row.metrics === result);
  if (week >= 0) return `week:${week}`;
  if (snapshot.yoy?.status === "ready") {
    if (snapshot.yoy.metrics === result) return "yoy";
    const yoyWeek = snapshot.yoy.weeks.findIndex(row => row.metrics === result);
    if (yoyWeek >= 0) return `yoy-week:${yoyWeek}`;
  }
  return "unknown";
}

async function load(name: string, input: DatasetInput, filters: AnalysisFilters = {}): Promise<LadderLoaded> {
  const dataset = validateDataset(input).dataset!;
  return { name, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)) };
}

type LadderSpec = (get: (name: string) => Promise<LadderLoaded>) => Promise<LadderLoaded>;
/** 全部資料（插入順序固定；基準檔的鍵就是 name）。改過的快照由原快照衍生。 */
const SPECS: Record<string, LadderSpec> = {
  "golden": () => load("golden", fixture("golden")),
  "demo": () => load("demo", fixture("demo")),
  "refund_only": () => load("refund_only", fixture("refund_only")),
  "zero_ad": () => load("zero_ad", fixture("zero_ad")),
  "synthetic-4-channel": () => load("synthetic-4-channel", synthetic4ChannelInput()),
  "yoy-two-year": () => load("yoy-two-year", yoyInput()),
  "demo MARKETPLACE": () => load("demo MARKETPLACE", fixture("demo"), { channels: ["MARKETPLACE"] }),
  "synthetic-4-channel LIVE+DTC": () => load("synthetic-4-channel LIVE+DTC", synthetic4ChannelInput(), { channels: ["LIVE", "DTC"] }),
  "yoy-two-year DTC": () => load("yoy-two-year DTC", yoyInput(), { channels: ["DTC"] }),
  // 最後一週只有 1 天（同 tests/evidence-drawer-v3.test.tsx V4-3a）：單日證據的期間會和週相同。
  "demo last-week-1-day": async get => {
    const demo = await get("demo");
    const last = demo.snapshot.weeks.filter(row => row.period === "current").at(-1)!;
    return { name: "demo last-week-1-day", dataset: demo.dataset, snapshot: { ...demo.snapshot, weeks: [...demo.snapshot.weeks.filter(row => row !== last), { ...last, start: last.end, end: last.end }] } };
  },
  // 舊程式組出的快照沒有 yoy 欄（WorkspaceSnapshot.yoy 選填）。
  "yoy-two-year without yoy": async get => {
    const two = await get("yoy-two-year");
    const { yoy: dropped, ...withoutYoy } = two.snapshot;
    void dropped;
    return { name: "yoy-two-year without yoy", dataset: two.dataset, snapshot: withoutYoy };
  },
};
export const LADDER_DATASET_NAMES: readonly string[] = Object.keys(SPECS);

/** 載入資料（預設全部，依 SPECS 順序；only 給名稱時只載入那幾份與它們衍生自的原快照）。 */
export async function ladderDatasets(only: readonly string[] = LADDER_DATASET_NAMES): Promise<LadderLoaded[]> {
  const cache = new Map<string, Promise<LadderLoaded>>();
  const get = (name: string): Promise<LadderLoaded> => {
    if (!cache.has(name)) cache.set(name, SPECS[name](get));
    return cache.get(name)!;
  };
  const out: LadderLoaded[] = [];
  for (const name of only) out.push(await get(name));
  return out;
}

const NAMES = Object.keys(metricDefinitions) as MetricName[];
const MONEY: readonly MetricName[] = ["gross_sales", "discounts", "refunds", "net_revenue", "cogs_net", "gross_profit", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "contribution_before_marketing", "ad_spend", "contribution_after_marketing"];
const span = (period: Period) => `${period.start}..${period.end}`;
const DAY_MS = 86_400_000;
function daysOf(period: Period): string[] {
  const out: string[] = [];
  for (let at = Date.parse(`${period.start}T00:00:00Z`), end = Date.parse(`${period.end}T00:00:00Z`); at <= end; at += DAY_MS) out.push(new Date(at).toISOString().slice(0, 10));
  return out;
}

/** 各頁 evidence builder 實際組出的證據（每一種）。 */
export function builderCases({ dataset, snapshot }: LadderLoaded): LadderCase[] {
  const cases: LadderCase[] = [];
  const add = (kind: string, detail: string, evidence: EvidenceSelection | null) => { if (evidence) cases.push({ id: `${kind}|${detail}`, kind, evidence }); };
  const { report } = snapshot;
  const scope = report.scope.channels;
  const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy : null;
  for (const target of ["previous", "current", "total", ...AMOUNT_FIELDS] as const) add("bridge", target, bridgeEvidence(snapshot, target));
  for (const key of ["all", ...scope]) {
    const metrics = key === "all" ? report.current.metrics : report.current.channels[key]?.metrics ?? report.current.metrics;
    for (const name of MONEY) add("profit", `${key}|${name}`, profitEvidence(snapshot, key, { metric: name, value: metrics[name] }));
  }
  for (const channel of dataset.manifest.channels) {
    for (const period of ["previous", "current"] as const) for (const name of NAMES) add("channel", `${channel}|${period}|${name}`, channelEvidence(snapshot, channel, period, name));
    add("channel-change", channel, channelChangeEvidence(snapshot, channel));
  }
  for (const week of [...snapshot.weeks, ...(yoy?.weeks ?? [])]) {
    for (const name of NAMES) add("week", `${week.period}|${span(week)}|all|${name}`, weekEvidence(week, name, [...scope]));
    for (const channel of scope) add("week", `${week.period}|${span(week)}|${channel}`, weekEvidence(week, "contribution_after_marketing", [channel]));
  }
  for (const week of snapshot.weeks) for (const rate of RATE_METRICS) add("rates", `${span(week)}|${rate}`, ratesEvidence(snapshot, week, rate));
  for (const granularity of ["day", "week"] as const) {
    const table = buildPnlTable(snapshot, granularity);
    for (const row of table.rows) {
      row.cells.forEach((cell, index) => add("pnl", `${granularity}|${row.metric}|${table.columns[index].id}`, pnlEvidence(snapshot, row, cell, table.columns[index].label)));
      add("pnl-total", `${granularity}|${row.metric}`, pnlEvidence(snapshot, row, row.total, "total"));
      add("pnl-share", `${granularity}|${row.metric}`, pnlShareEvidence(snapshot, row));
    }
  }
  for (const channel of [null, ...scope]) {
    for (const name of NAMES) add("share-amount", `${channel ?? "all"}|${name}`, shareAmountEvidence(snapshot, channel, name));
    add("share-per-hundred", channel ?? "all", sharePerHundredEvidence(snapshot, channel));
  }
  for (const period of ["current", "previous"] as const) {
    const structure = channelStructure(snapshot, period);
    for (const row of [...structure.rows, structure.total]) add("share-fees", `${period}|${row.channel ?? "total"}`, shareFeesEvidence(row));
  }
  const weeks = channelWeeks(snapshot);
  if (weeks) for (const series of weeks.channels) series.values.forEach((value, index) => add("channel-week", `${series.channel}|${span(weeks.weeks[index].period)}`, channelWeekEvidence(series, weeks.weeks[index], value)));
  const heat = heatSectionModel(snapshot).result.heatmap;
  if (heat) for (const channel of heat.channels) for (const row of channel.rows) for (const cell of row.cells) if (cell.kind === "value") add("heat", `${channel.channel}|${cell.key}`, heatCellEvidence(heat, channel.channel, row, cell));
  for (const period of ["previous", "current"] as const) {
    for (const item of assistKpis(report[period])) add("assist", `${period}|${item.id}`, assistEvidence(item, report[period].period, [...scope]));
    add("breakeven", period, breakevenEvidence(breakevenMer(report[period]), report[period].period, [...scope]));
  }
  const assist = assistWeeks(snapshot);
  const kpis = assistKpis(report.current);
  for (const series of assist.series) {
    const kpi = kpis.find(item => item.id === series.id);
    if (kpi) series.values.forEach((value, index) => add("assist-week", `${series.id}|${span(assist.weeks[index].period)}`, assistWeekEvidence(kpi, value, assist.weeks[index], [...scope])));
  }
  for (const diagnostic of report.diagnostics) {
    add("priority", diagnostic.id, priorityEvidence(snapshot, diagnostic));
    add("impact", diagnostic.id, impactEvidence(snapshot, diagnostic));
  }
  const comparison = compareProducts(dataset, report.scope);
  const ctx = { previous: comparison.scope.previous_period, current: comparison.scope.current_period, alias: demoAlias(dataset.manifest.dataset_id) };
  for (const row of comparison.rows) {
    for (const name of ["net_revenue", "gross_profit"] as const) {
      for (const period of ["previous", "current"] as const) add("product", `${row.channel}|${row.sku}|${period}|${name}`, productEvidence(row, period, name, metricDefinitions[name].label, ctx, { drill: period === "current" }));
      add("product-delta", `${row.channel}|${row.sku}|${name}`, productDeltaEvidence(row, name, ctx));
    }
  }
  return cases;
}

/** 期間 × 通路範圍 × 排除條件的格狀組合；只依快照（domain 與 workspace）組出，sources 一律空陣列（ladderMetrics 不看）。 */
export function gridCases({ dataset, snapshot }: LadderLoaded): LadderCase[] {
  const { report } = snapshot;
  const scope = report.scope.channels;
  const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy : null;
  const periods: [string, Period][] = [
    ["current", report.current.period], ["previous", report.previous.period],
    ["cross", { start: report.previous.period.start, end: report.current.period.end }], ["outside", { start: "1999-01-01", end: "1999-01-07" }],
  ];
  if (yoy) periods.push(["yoy", yoy.period]);
  for (const week of [...snapshot.weeks, ...(yoy?.weeks ?? [])]) periods.push([`week-${week.period}`, { start: week.start, end: week.end }]);
  for (const day of [...daysOf(report.previous.period), ...daysOf(report.current.period), ...(yoy ? daysOf(yoy.period) : [])]) periods.push(["day", { start: day, end: day }]);
  const scopes: [string, string[]][] = [
    ["scope", [...scope]], ["scope-reversed", [...scope].reverse()], ["empty", []], ["manifest", [...dataset.manifest.channels]],
    ["first-two", dataset.manifest.channels.slice(0, 2)], ["duplicate", [...scope, scope[0]]], ["unknown", ["NOPE"]],
    ...dataset.manifest.channels.map((channel): [string, string[]] => [`one-${channel}`, [channel]]),
  ];
  const metric = report.current.metrics.contribution_after_marketing;
  const flags: [string, Partial<EvidenceSelection>][] = [
    ["plain", {}], ["components", { components: [{ label: "c", metric }] }], ["components-empty", { components: [] }], ["sku", { sku: "SKU-X" }],
    ...(["percentage-point", "count", "money_per_unit", "percent"] as const).map((unit): [string, Partial<EvidenceSelection>] => [`unit-${unit}`, { unitOverride: unit }]),
  ];
  const cases: LadderCase[] = [];
  for (const [periodName, period] of periods) for (const [scopeName, channels] of scopes) for (const [flagName, flag] of flags) {
    // 排除條件只在本期全通路與單一通路上全排（其餘範圍只跑 plain，數量才不會爆）。
    if (flagName !== "plain" && scopeName !== "scope" && scopeName !== `one-${scope[0]}`) continue;
    cases.push({ id: `grid|${periodName}|${span(period)}|${scopeName}|${flagName}`, kind: "grid", evidence: { title: "t", name: "contribution_after_marketing", metric, period: { ...period }, channels, sources: [], ...flag } });
  }
  return cases;
}

/** 某份資料的全部證據（builder＋grid）。 */
export const ladderCases = (loaded: LadderLoaded): LadderCase[] => [...builderCases(loaded), ...gridCases(loaded)];

export type LadderFn = (snapshot: LadderSnapshot | undefined, evidence: EvidenceSelection) => Metrics | null;
export interface LadderGridSummary { cases: number; sha256: string; keys: Record<string, number> }
/** grid 的輸出摘要：每筆「id=回傳物件」一行的 sha256，與各回傳物件種類的筆數（week:3 這類編號併成 week）。 */
export function ladderGridSummary(loaded: LadderLoaded, fn: LadderFn): LadderGridSummary {
  const lines: string[] = [];
  const keys: Record<string, number> = {};
  for (const item of gridCases(loaded)) {
    const key = ladderKey(loaded.snapshot, fn(loaded.snapshot, item.evidence));
    lines.push(`${item.id}=${key}`);
    const group = key.replace(/:\d+$/, "").replace(/^(previous|current):.+$/, "$1:channel");
    keys[group] = (keys[group] ?? 0) + 1;
  }
  return { cases: lines.length, sha256: createHash("sha256").update(lines.join("\n")).digest("hex"), keys: Object.fromEntries(Object.entries(keys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}
export const EVIDENCE_LADDER_BASELINE_FILE = "tests/fixtures/evidence-ladder-v4-7a.json";
/** 全部資料的 grid 摘要（鍵＝資料名）；已載入的資料可直接傳入。 */
export async function ladderGridBaseline(fn: LadderFn, loaded?: readonly LadderLoaded[]): Promise<Record<string, LadderGridSummary>> {
  const out: Record<string, LadderGridSummary> = {};
  for (const item of loaded ?? await ladderDatasets()) out[item.name] = ladderGridSummary(item, fn);
  return out;
}
