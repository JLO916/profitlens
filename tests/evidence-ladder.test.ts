import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ladderMetrics, type LadderEvidence } from "@/application/evidence-ladder";
import type { EvidenceSelection } from "@/components/evidence-drawer";
import { EVIDENCE_LADDER_BASELINE_FILE, builderCases, frozenLadderMetrics, gridCases, ladderDatasets, ladderGridBaseline, ladderKey, type LadderCase, type LadderLoaded } from "./helpers/evidence-ladder-cases";

// V4-7b 代理 B（06_BATCHES V4-7b「ladderMetrics 搬移前後輸出相同」、CHART_CATALOG G23 單元測試、feature-retention MV5）：
// ladderMetrics 由 src/components/evidence-drawer.tsx 搬到 src/application/evidence-ladder.ts 並匯出；只搬移，V4-3a 的邏輯不改。
// 三種證明（材料見 tests/helpers/evidence-ladder-cases.ts）：
// （1）每一種證據（各頁 evidence builder 實際組出的 EvidenceSelection＋期間 × 通路範圍 × 排除條件的 grid）× 每份資料，回傳與搬移前的原文凍結是同一個物件（toBe）；
// （2）grid 的輸出摘要（每筆回傳哪一個既有物件的 sha256 與分佈）等於 3ea161b 以原函式（當時暫時加 export）產生的基準 tests/fixtures/evidence-ladder-v4-7a.json；
// （3）搬移後的模組只依 domain 與 workspace 的型別，不匯入元件；抽屜改從 application 匯入。抽屜 SSR 逐字相同另見 tests/evidence-drawer-v3.test.tsx 的 V4-7b 段。

let datasets: LadderLoaded[];
const builders = new Map<LadderLoaded, LadderCase[]>();
const grids = new Map<LadderLoaded, LadderCase[]>();
beforeAll(async () => {
  datasets = await ladderDatasets();
  for (const loaded of datasets) { builders.set(loaded, builderCases(loaded)); grids.set(loaded, gridCases(loaded)); }
}, 60_000);

const mismatches = (loaded: LadderLoaded, cases: readonly LadderCase[]) => cases.filter(item => ladderMetrics(loaded.snapshot, item.evidence) !== frozenLadderMetrics(loaded.snapshot, item.evidence)).map(item => item.id);
/** 回傳物件的種類（week:3 → week、current:DTC → current:channel）。 */
const group = (key: string) => key.replace(/:\d+$/, "").replace(/^(previous|current):.+$/, "$1:channel");

describe("V4-7b ladderMetrics 搬移前後輸出相同（逐筆比對搬移前的原文凍結）", () => {
  it("各頁 evidence builder 的每一種證據 × 每份資料：回傳同一個物件", () => {
    for (const loaded of datasets) expect(mismatches(loaded, builders.get(loaded)!), loaded.name).toEqual([]);
  }, 60_000);

  it("期間（本期、上期、跨期、期間外、去年同期、每週、去年同期每週、每一天）× 通路範圍 × 排除條件的 grid × 每份資料：回傳同一個物件", () => {
    for (const loaded of datasets) expect(mismatches(loaded, grids.get(loaded)!), loaded.name).toEqual([]);
  }, 60_000);

  it("沒有快照時（抽屜未給 snapshot）一律不畫階梯", () => {
    for (const loaded of datasets) expect(builders.get(loaded)!.filter(item => ladderMetrics(undefined, item.evidence) !== null || frozenLadderMetrics(undefined, item.evidence) !== null).map(item => item.id), loaded.name).toEqual([]);
    expect(ladderMetrics(undefined, { period: datasets[0].snapshot.report.current.period, channels: datasets[0].snapshot.report.scope.channels })).toBeNull();
  }, 60_000);

  it("證據種類、資料與分支都有涵蓋：21 種 builder 證據都出現；回傳涵蓋本期、上期、單一通路、週、去年同期、去年同期的週與 null，且都是快照裡既有的物件", () => {
    const kinds = new Set<string>();
    const keys = new Set<string>();
    for (const loaded of datasets) for (const item of [...builders.get(loaded)!, ...grids.get(loaded)!]) {
      kinds.add(item.kind);
      keys.add(group(ladderKey(loaded.snapshot, ladderMetrics(loaded.snapshot, item.evidence))));
    }
    expect([...kinds].sort()).toEqual(["assist", "assist-week", "breakeven", "bridge", "channel", "channel-change", "channel-week", "grid", "heat", "impact", "pnl", "pnl-share", "pnl-total", "priority", "product", "product-delta", "profit", "rates", "share-amount", "share-fees", "share-per-hundred", "week"]);
    expect([...keys].sort()).toEqual(["current", "current:channel", "null", "previous", "previous:channel", "week", "yoy", "yoy-week"]);
    expect(datasets.map(item => item.name)).toEqual(["golden", "demo", "refund_only", "zero_ad", "synthetic-4-channel", "yoy-two-year", "demo MARKETPLACE", "synthetic-4-channel LIVE+DTC", "yoy-two-year DTC", "demo last-week-1-day", "yoy-two-year without yoy"]);
  }, 60_000);
});

describe("V4-7b grid 輸出等於搬移前（3ea161b）的基準", () => {
  it("每份資料的筆數、sha256 與回傳物件分佈都等於 tests/fixtures/evidence-ladder-v4-7a.json", async () => {
    const expected = JSON.parse(readFileSync(EVIDENCE_LADDER_BASELINE_FILE, "utf8"));
    expect(await ladderGridBaseline(ladderMetrics, datasets)).toEqual(expected);
  }, 60_000);
});

describe("V4-7b 不畫階梯的條件與查找規則（行為同 V4-3a）", () => {
  it("本期／上期全部通路回傳該期合計；有組成項目（含空陣列）、改了單位、商品層級時一律 null", () => {
    const { snapshot } = datasets[0];
    const { report } = snapshot;
    const base: LadderEvidence = { period: report.current.period, channels: [...report.scope.channels].reverse() };
    expect(ladderMetrics(snapshot, base)).toBe(report.current.metrics);
    expect(ladderMetrics(snapshot, { ...base, period: report.previous.period })).toBe(report.previous.metrics);
    expect(ladderMetrics(snapshot, { ...base, components: [] })).toBeNull();
    for (const unitOverride of ["percentage-point", "count", "money_per_unit", "percent"] as const) expect(ladderMetrics(snapshot, { ...base, unitOverride })).toBeNull();
    expect(ladderMetrics(snapshot, { ...base, sku: "SKU-A" })).toBeNull();
  });

  it("單一通路：本期整段回傳該通路的合計；週與單日（即使期間等於某一週）不畫全通路的階梯", () => {
    const demo = datasets.find(item => item.name === "demo")!.snapshot;
    const shortened = datasets.find(item => item.name === "demo last-week-1-day")!.snapshot;
    const week = demo.weeks.filter(row => row.period === "current")[2];
    expect(ladderMetrics(demo, { period: demo.report.current.period, channels: ["MARKETPLACE"] })).toBe(demo.report.current.channels.MARKETPLACE.metrics);
    expect(ladderMetrics(demo, { period: { start: week.start, end: week.end }, channels: ["DTC"] })).toBeNull();
    expect(ladderMetrics(demo, { period: { start: week.start, end: week.end }, channels: demo.report.scope.channels })).toBe(week.metrics);
    const last = shortened.weeks.at(-1)!;
    expect(ladderMetrics(shortened, { period: { start: last.end, end: last.end }, channels: ["MARKETPLACE"] })).toBeNull();
    expect(ladderMetrics(shortened, { period: { start: last.end, end: last.end }, channels: shortened.report.scope.channels })).toBe(last.metrics);
  });

  it("去年同期：整段與每週只在全部通路時回傳（既有週找不到才看去年同期）；沒有 yoy 欄或不可用時不畫", () => {
    const two = datasets.find(item => item.name === "yoy-two-year")!.snapshot;
    const without = datasets.find(item => item.name === "yoy-two-year without yoy")!.snapshot;
    const yoy = two.yoy!;
    if (yoy.status !== "ready") throw new Error("yoy 不可用");
    const all = two.report.scope.channels;
    expect(ladderMetrics(two, { period: yoy.period, channels: all })).toBe(yoy.metrics);
    expect(ladderMetrics(two, { period: { start: yoy.weeks[1].start, end: yoy.weeks[1].end }, channels: all })).toBe(yoy.weeks[1].metrics);
    expect(ladderMetrics(two, { period: yoy.period, channels: ["DTC"] })).toBeNull();
    expect(ladderMetrics(without, { period: yoy.period, channels: all })).toBeNull();
    expect(ladderMetrics(datasets.find(item => item.name === "demo")!.snapshot, { period: yoy.period, channels: all })).toBeNull();
  });
});

describe("V4-7b 模組邊界", () => {
  const source = readFileSync("src/application/evidence-ladder.ts", "utf8");
  const drawer = readFileSync("src/components/evidence-drawer.tsx", "utf8");

  it("src/application/evidence-ladder.ts 匯出 ladderMetrics，只匯入 domain 與 workspace 的型別（不匯入元件、不是 client 模組、沒有模組層級的資料）", () => {
    expect(source).toMatch(/^export function ladderMetrics\(/m);
    expect([...source.matchAll(/^import .*$/gm)].map(match => match[0])).toEqual(['import type { Metrics, Period } from "@/domain/types";', 'import type { WorkspaceSnapshot } from "./workspace";']);
    expect(source).not.toMatch(/\bimport\(|\brequire\(/);
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/^(?:export )?(?:const|let|var) /m);
  });

  it("抽屜不再自己定義 ladderMetrics，改從 @/application/evidence-ladder 匯入；EvidenceSelection 結構上相容 LadderEvidence", () => {
    expect(drawer).not.toMatch(/function ladderMetrics\(/);
    expect(drawer).toContain('import { ladderMetrics } from "@/application/evidence-ladder";');
    const asLadder = (evidence: EvidenceSelection): LadderEvidence => evidence;
    const sample = builders.get(datasets[0])![0].evidence;
    expect(asLadder(sample)).toBe(sample);
  });
});
