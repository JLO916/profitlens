import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BarChart, LabelList } from "recharts";
import { beforeAll, describe, expect, it } from "vitest";
import { trendTakeaways } from "../src/application/chart-takeaways";
import { chartHeights } from "../src/application/chart-theme";
import { deltaTone, formatAmountL1 } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { rankedTextWidth } from "../src/components/charts/ranked-bars";
import { thresholdGeometry, type ThresholdLinePoint } from "../src/components/charts/threshold-line";
import { ChannelSection } from "../src/components/overview/charts/channel-section";
import { lastPoints, TREND_END_LABEL, trendAxis, trendEndLabelLayout, trendEndLabels, trendRows, type TrendEndAnchor, type TrendEndPlacement } from "../src/components/overview/charts/trend-section";
import { waterfallTextWidth } from "../src/components/overview/charts/waterfall-svg";
import type { DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-8b 代理 B（D-V4-59 (5)(6)(7)(1)–(4)(8)、D-V4-63）：390 總檢修正的單元測試。
// (5) G4 各通路長條末端標值：Recharts 3 的 LabelList 只為有畫出的長條編號，v3 以 index 取列，有 null 通路時其後的標值錯位一列；改為以長條 payload 的通路代號找列。
//     測試從 ChannelSection 的元素樹取出兩個 LabelList 的 valueAccessor 與 content，照 Recharts 的作法只為非 null 的長條建標值（index 是畫出長條的序號）。
// (6) G3 末點標值：trendEndLabelLayout 只在碰撞時移動（往左進 Y 軸刻度欄改放右側；與先放的標值重疊時上下移開），示範資料在任何寬度都與 v3 位置逐字相同。
//     圖形座標照 Recharts 的版面（390 瀏覽器實測核對過：繪圖區 x 60–312、y 22–146）：margin { top 22, right 12, bottom 4, left 4 }、YAxis 寬 56、XAxis 預設高 30、
//     圖高 chartHeights.sm；X 是週序號的線性軸（上界取整，見 trendAnchors）。
// (7) G16 門檻點標籤：左界是繪圖區左緣（y 刻度文字欄不算可放的空間）。
// CSS 修正（(1)(2)(3)(4)(8) 與 D-V4-63）只在 globals.css 的「V4-8b B」錨點區塊內；這裡斷言規則存在，版面效果由 E2E（tests/e2e/v48b-390.spec.ts）檢查。

const noop = () => undefined;
async function snapshotOf(input: DatasetInput): Promise<WorkspaceSnapshot> {
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const snapshots = {} as Record<"demo" | "synthetic" | "missingAdDay", WorkspaceSnapshot>;
beforeAll(async () => {
  snapshots.demo = await snapshotOf(fixture("demo"));
  snapshots.synthetic = await snapshotOf(synthetic4ChannelInput());
  snapshots.missingAdDay = await snapshotOf(fixture("errors/missing_ad_day"));
});

// ---------------------------------------------------------------- (5) G4

/** 在 React render 內呼叫 ChannelSection，取回它回傳的元素樹（同 tests/overview-g4.test.tsx）。 */
function channelTree(snapshot: WorkspaceSnapshot): ReactElement {
  let tree: ReactElement | null = null;
  function Capture() { tree = ChannelSection({ snapshot, onEvidence: noop }) as ReactElement; return null; }
  renderToStaticMarkup(createElement(Capture));
  return tree!;
}
function elementsOf(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const { children, after } = node.props;
  return [node, ...elementsOf(after as ReactNode), ...elementsOf(children as ReactNode)];
}
type ChartRow = { channel: string; label: string; previousValue: number | null; currentValue: number | null; previous: { value: string | null }; current: { value: string | null } };
type Accessor = (entry: { payload: unknown }, index: number) => unknown;
/**
 * 照 Recharts 3.10.1 的 Bar：只為值非 null、寬不為 0 的資料列畫長條，LabelList 的 index 是畫出長條的序號，entry.payload 是該資料列；
 * 對每個畫出的長條呼叫 valueAccessor 與 content（EndLabel），回傳 { 通路, 標值 markup }。長條幾何是固定的假座標（x 100、寬 40、y 每列 30）。
 */
function endLabels(snapshot: WorkspaceSnapshot, dataKey: "previousValue" | "currentValue"): { channel: string; html: string }[] {
  const all = elementsOf(channelTree(snapshot));
  const rows = all.find(element => element.type === BarChart)!.props.data as ChartRow[];
  const bar = all.find(element => element.props.dataKey === dataKey && elementsOf(element.props.children as ReactNode).some(child => child.type === LabelList))!;
  const list = elementsOf(bar.props.children as ReactNode).find(child => child.type === LabelList)!;
  const accessor = list.props.valueAccessor as Accessor, content = list.props.content as ComponentType<Record<string, unknown>>;
  expect(list.props.dataKey, "LabelList 不再用 dataKey（改用 valueAccessor 取通路代號）").toBeUndefined();
  const drawn = rows.filter(row => row[dataKey] !== null && row[dataKey] !== 0);
  return drawn.map((row, index) => {
    const geometry = { x: 100, y: 30 * index, width: 40, height: 8 };
    const value = accessor({ payload: row, ...geometry }, index);
    return { channel: row.channel, html: renderToStaticMarkup(createElement("svg", null, createElement(content, { ...geometry, value, index }))) };
  });
}
/** v3 的標值 markup（長條右端外 6px、垂直置中；本期 L1 金額＋不利色或強調、上期「上期 {L1}」）。 */
function v3Label(row: ChartRow, dataKey: "previousValue" | "currentValue", index: number): string {
  const current = dataKey === "currentValue";
  const value = current ? row.current.value : row.previous.value;
  const shown = formatAmountL1(value);
  const tone = current ? (deltaTone("contribution_after_marketing", value, "L1") === "unfavorable" ? " is-unfavorable" : " is-strong") : "";
  return `<svg><text class="chart-value${tone}" x="${100 + 40 + 6}" y="${30 * index + 4}" dominant-baseline="central">${current ? shown : fill(labels.overview.channelsV3.previousValue, { value: shown })}</text></svg>`;
}
const rowsOf = (snapshot: WorkspaceSnapshot) => elementsOf(channelTree(snapshot)).find(element => element.type === BarChart)!.props.data as ChartRow[];

describe("V4-8b (5) G4 長條末端標值依通路找列（D-V4-59 (5)）", () => {
  it("示範資料（沒有 null 通路）：每個標值的 markup 與 v3（以 index 取列）逐字相同", () => {
    for (const dataKey of ["previousValue", "currentValue"] as const) {
      const rows = rowsOf(snapshots.demo);
      expect(rows.every(row => row[dataKey] !== null), "示範資料每個通路兩期都有值").toBe(true);
      const shown = endLabels(snapshots.demo, dataKey);
      expect(shown.map(item => item.channel)).toEqual(rows.map(row => row.channel));
      shown.forEach((item, index) => expect(item.html, `${dataKey} ${item.channel}`).toBe(v3Label(rows[index], dataKey, index)));
    }
  });

  it("4 通路合成資料（LIVE 的扣廣告後貢獻資料待補）：null 之後的通路仍標自己的金額（v3 會把 MARKETPLACE 的金額標在 SOCIAL 旁）", () => {
    const rows = rowsOf(snapshots.synthetic);
    for (const dataKey of ["previousValue", "currentValue"] as const) {
      const nullAt = rows.findIndex(row => row[dataKey] === null);
      expect(nullAt, `${dataKey}：合成資料有 null 通路，且不是最後一列（index 會錯位）`).toBeGreaterThanOrEqual(0);
      expect(nullAt).toBeLessThan(rows.length - 1);
      const shown = endLabels(snapshots.synthetic, dataKey);
      const drawn = rows.filter(row => row[dataKey] !== null && row[dataKey] !== 0);
      expect(shown.map(item => item.channel)).toEqual(drawn.map(row => row.channel));
      shown.forEach((item, index) => expect(item.html, `${dataKey} ${item.channel}`).toBe(v3Label(drawn[index], dataKey, index)));
      // v3 的錯位：第 i 個畫出的長條拿 rows[i]——null 通路之後的長條都拿到前一列（null 通路本身沒有標值，下一個通路標的是別的通路的金額）。
      expect(drawn.map(row => row.channel), "以 index 取列會錯位（修正前的壞例）").not.toEqual(rows.slice(0, drawn.length).map(row => row.channel));
    }
  });
});

// ---------------------------------------------------------------- (6) G3

const TREND_KEYS = ["revenuePrevious", "contributionPrevious", "revenueCurrent", "contributionCurrent", "revenueYoy", "contributionYoy"] as const;
/** Recharts 的繪圖區（trend-section 的 margin、YAxis 寬 56、XAxis 預設高 30、ChartFrame sm 高）。 */
const plotOf = (width: number) => ({ x: 4 + 56, y: 22, width: width - 4 - 56 - 12, height: chartHeights.sm - 22 - 4 - 30 });
/** 某寬度下 G3 各系列末點的像素錨點（圓心），與 TrendEndText 從軸比例換算的方式相同。 */
function trendAnchors(snapshot: WorkspaceSnapshot, width: number) {
  const yoyWeeks = snapshot.yoy?.status === "ready" ? snapshot.yoy.weeks : [];
  const rows = trendRows(snapshot.weeks, yoyWeeks);
  const ends = trendEndLabels(rows, lastPoints(rows), trendTakeaways(snapshot).lastWeekIncomplete ? labels.overview.trendV3.incompleteShort : null);
  const axis = trendAxis(rows.flatMap(row => TREND_KEYS.map(key => row[key])));
  const plot = plotOf(width);
  // X 軸 domain 是 [−0.5, n − 0.5]，Recharts（allowDecimals=false）把上界取整：瀏覽器實測 12 週的示範資料是 [−0.5, 12]、2 週的缺廣告日是 [−0.5, 2]。
  const [x0, x1] = [-0.5, Math.ceil(Math.max(rows.length - 0.5, 0.5))];
  const anchors: TrendEndAnchor[] = ends.map(end => ({
    key: end.key, text: end.text, note: end.note,
    cx: plot.x + (end.index - x0) / (x1 - x0) * plot.width,
    cy: plot.y + (axis.domain[1] - end.value) / (axis.domain[1] - axis.domain[0]) * plot.height,
  }));
  return { anchors, plot, bounds: { left: plot.x, top: 0, bottom: plot.y + plot.height } };
}
const v3Placement = (anchor: TrendEndAnchor): TrendEndPlacement => ({ x: anchor.cx - 6, y: anchor.cy - 8, noteY: anchor.cy + 18, anchor: "end" });
/** 標值的近似框（與 trendEndLabelLayout 相同的估寬與上下伸）：主字一框，「未滿 7 天」另一框。 */
function boxesOf(anchor: TrendEndAnchor, place: TrendEndPlacement) {
  const span = (text: string) => { const width = waterfallTextWidth(text); return place.anchor === "start" ? { left: place.x, right: place.x + width } : { left: place.x - width, right: place.x }; };
  const boxes = [{ key: anchor.key, ...span(anchor.text), top: place.y - TREND_END_LABEL.ascent, bottom: place.y + TREND_END_LABEL.descent }];
  if (anchor.note !== null) boxes.push({ key: `${anchor.key}-note`, ...span(anchor.note), top: place.noteY - TREND_END_LABEL.ascent, bottom: place.noteY + TREND_END_LABEL.descent });
  return boxes;
}
type Box = ReturnType<typeof boxesOf>[number];
const overlapPairs = (boxes: readonly Box[]) => boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).map(b => `${a.key}×${b.key}`));
function layoutOf(snapshot: WorkspaceSnapshot, width: number) {
  const { anchors, plot, bounds } = trendAnchors(snapshot, width);
  const placed = trendEndLabelLayout(anchors, bounds);
  return {
    anchors, plot, placed,
    before: anchors.flatMap(anchor => boxesOf(anchor, v3Placement(anchor))),
    after: anchors.flatMap(anchor => boxesOf(anchor, placed[anchor.key])),
  };
}

describe("V4-8b (6) G3 末點標值只在碰撞時移動（D-V4-59 (6)）", () => {
  it("沒有碰撞時每個標值都是 v3 的位置（點左 6px、基線在點上 8px、未滿 7 天在點下 18px、靠右對齊）", () => {
    const anchors: TrendEndAnchor[] = [
      { key: "revenueCurrent", text: "淨營收 130.2 萬", note: "未滿 7 天", cx: 500, cy: 40 },
      { key: "contributionCurrent", text: "扣廣告後 23.3 萬", note: null, cx: 500, cy: 120 },
      { key: "revenuePrevious", text: "上期 98.0 萬", note: null, cx: 260, cy: 60 },
    ];
    const placed = trendEndLabelLayout(anchors, { left: 60, top: 0, bottom: 146 });
    for (const anchor of anchors) expect(placed[anchor.key], anchor.key).toEqual(v3Placement(anchor));
  });

  it("示範資料：寬 280–1,200（含 390、768、1280、1440 的圖寬）每個標值都與 v3 逐字相同", () => {
    for (let width = 280; width <= 1200; width += 2) {
      const { anchors, placed } = layoutOf(snapshots.demo, width);
      expect(anchors.length, `寬 ${width}`).toBeGreaterThanOrEqual(4);
      for (const anchor of anchors) expect(placed[anchor.key], `寬 ${width} ${anchor.key}`).toEqual(v3Placement(anchor));
    }
  });

  it("4 通路合成資料、390 的圖寬 324：v3 的「上期」與「扣廣告後」標值互相重疊；改後沒有重疊、本期標值不動", () => {
    const { anchors, placed, before, after, plot } = layoutOf(snapshots.synthetic, 324);
    expect(overlapPairs(before), "v3 位置有重疊（修正前的壞例）").not.toEqual([]);
    expect(overlapPairs(after)).toEqual([]);
    for (const box of after) expect(box.left, box.key).toBeGreaterThanOrEqual(plot.x);
    for (const box of after) { expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(plot.y + plot.height); }
    for (const anchor of anchors.filter(item => item.key.endsWith("Current"))) expect(placed[anchor.key], anchor.key).toEqual(v3Placement(anchor));
  });

  it("缺廣告日（1 天的兩期、只有兩週）、圖寬 324：v3 的上期標值往左進 Y 軸刻度欄；改後放在點的右側、不進刻度欄、彼此不重疊", () => {
    const { anchors, placed, before, after, plot } = layoutOf(snapshots.missingAdDay, 324);
    const previous = anchors.filter(anchor => anchor.key.endsWith("Previous"));
    expect(previous.length).toBeGreaterThan(0);
    expect(before.filter(box => box.left < plot.x).map(box => box.key), "v3 位置進 Y 軸刻度欄（修正前的壞例）").not.toEqual([]);
    for (const anchor of previous) expect(placed[anchor.key], anchor.key).toMatchObject({ anchor: "start", x: anchor.cx + 6 });
    for (const box of after) expect(box.left, box.key).toBeGreaterThanOrEqual(plot.x);
    expect(overlapPairs(after)).toEqual([]);
  });

  it("上下都放不下時不動（不把標值移出 svg 上緣或繪圖區下緣）", () => {
    const anchors: TrendEndAnchor[] = [
      { key: "a", text: "淨營收 1.0 萬", note: null, cx: 200, cy: 20 },
      { key: "b", text: "上期 1.0 萬", note: null, cx: 200, cy: 22 },
    ];
    const placed = trendEndLabelLayout(anchors, { left: 60, top: 0, bottom: 20 });
    expect(placed.b).toEqual(v3Placement(anchors[1]));
  });
});

// ---------------------------------------------------------------- (7) G16

/** 390 示範資料的 G16（維持現況方案計算後）：打平門檻 −87.9%（貢獻 0）、維持現況門檻 0%（貢獻 1,330,963）；svg 寬 332（窄版標籤）。 */
const DEMO_THRESHOLD_POINTS: ThresholdLinePoint[] = [
  { id: "zero_contribution", kind: "threshold", v: "-87.9", y: "0", label: "zero", shortLabel: "−87.9%" },
  { id: "maintain_baseline", kind: "threshold", v: "0", y: "1330963", label: "maintain", shortLabel: "0.0%" },
];
describe("V4-8b (7) G16 標籤不進 y 刻度文字欄（D-V4-59 (7)）", () => {
  it("390 示範資料（寬 332）：「−87.9%」標籤從繪圖區左緣起（v3 置中、左緣在刻度欄內，壓到「0」刻度）", () => {
    const geometry = thresholdGeometry(DEMO_THRESHOLD_POINTS, 332);
    expect(geometry.narrow).toBe(true);
    const zero = geometry.points.find(shape => shape.point.id === "zero_contribution")!;
    expect(zero.cx - rankedTextWidth("−87.9%") / 2, "置中時左緣會進刻度欄（修正前的壞例）").toBeLessThan(geometry.plot.left);
    expect(zero.label).toMatchObject({ text: "−87.9%", placement: "above", anchor: "start", x: geometry.plot.left });
    for (const shape of geometry.points) {
      if (!shape.label) continue;
      const width = rankedTextWidth(shape.label.text);
      const left = shape.label.anchor === "start" ? shape.label.x : shape.label.anchor === "middle" ? shape.label.x - width / 2 : shape.label.x - width;
      expect(left, shape.point.id).toBeGreaterThanOrEqual(geometry.plot.left);
    }
  });

  it("點離左緣夠遠時照舊置中（維持現況 0% 的標籤在點的正上方）", () => {
    const geometry = thresholdGeometry(DEMO_THRESHOLD_POINTS, 332);
    const maintain = geometry.points.find(shape => shape.point.id === "maintain_baseline")!;
    expect(maintain.label).toMatchObject({ anchor: "middle", x: maintain.cx });
  });
});

// ---------------------------------------------------------------- CSS（(1)(2)(3)(4)(8)、D-V4-63）

describe("V4-8b B 的 CSS 規則都在 globals.css 的「V4-8b B」錨點區塊內", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V4-8b B：");
  const end = css.indexOf("/* ── V4-8b B 錨點結束 ── */");
  const block = css.slice(start, end);
  it("錨點存在且區塊內有每一條修正", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    for (const rule of [
      ".meeting-agenda-item { grid-template-columns: minmax(0, 1fr); }",
      ".kpi-delta .text-button { min-height: 24px; }",
      ".meeting-priority-body .top-three-impact > .number-link { min-height: 24px; }",
      ".chart-data-table td:not(.num) { white-space: nowrap; }",
      ".page-heading { position: relative; }",
      ".page-actions > .export-page { position: static; }",
      ".page-actions > .export-page > .menu-panel { top: calc(100% - var(--space-3) + var(--space-1)); left: 0; right: 0; width: auto; }",
      "main a, main [tabindex] { scroll-margin-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-2)); }",
      ".meeting-history-chart .chart-frame.multiples[data-state=\"empty\"] { height: var(--chart-h-sm) !important; }",
    ]) expect(block, rule).toContain(rule);
    // 手機規則都在 ≤ 767 的 media 內。
    const mobile = block.slice(block.indexOf("@media (max-width: 767px)"));
    for (const rule of [".page-heading { position: relative; }", "scroll-margin-bottom", ".meeting-history-chart .chart-frame.multiples"]) expect(mobile, rule).toContain(rule);
  });
});
