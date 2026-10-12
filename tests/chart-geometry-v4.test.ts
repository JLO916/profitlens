import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Decimal from "decimal.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { chartColors, chartHeights, chartRowHeights } from "../src/application/chart-theme";
import { formatSignedDelta } from "../src/application/presentation";
import { RANKED_MIN_PLOT, RANKED_SSR_WIDTH, RANKED_TEXT_PAD, RANKED_VALUE_GAP, hbarGeometry, hbarMaxRows, rankedTextWidth, type HbarGeometry, type RankedBarBlock, type RankedBarRow } from "../src/components/charts/ranked-bars";
import { SHARE_STACK_LABEL_WIDTH, SHARE_STACK_SSR_WIDTH, SHARE_STACK_VALUE_WIDTH, ShareStack, shareStackGeometry, type ShareStackRowInput } from "../src/components/charts/share-stack";
import { SPARK_DOT_R, SPARK_PAD, SPARK_STROKE, SPARK_WIDTH, Sparkline, sparklineGeometry, type SparklinePoint } from "../src/components/charts/sparkline";
import { THRESHOLD_NARROW_BELOW, THRESHOLD_POINT_R, THRESHOLD_SSR_WIDTH, THRESHOLD_X_STEP, THRESHOLD_X_TICKS, ThresholdLine, thresholdGeometry, type ThresholdGeometry, type ThresholdLinePoint } from "../src/components/charts/threshold-line";
import { TIMELINE_END_WIDTH, TIMELINE_LABEL_WIDTH, TIMELINE_MIN_SEGMENT, TIMELINE_NARROW_BELOW, TIMELINE_SSR_WIDTH, Timeline, timelineGeometry, type TimelineTrackInput } from "../src/components/charts/timeline";
import { coverageTimeline } from "../src/application/chart-coverage";
import { coverageChartModel } from "../src/components/data/coverage-chart";
import { validateDataset } from "../src/domain/validation";
import { formatDateL1 } from "../src/application/presentation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { formatAxisPercent } from "../src/application/copy";
import { formatAxisWan } from "../src/application/presentation";
import { ChartFrame } from "../src/components/overview/charts/chart-frame";
import { scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { byTestId, openTag } from "./helpers/markup";

// V4-2 起的圖表幾何純函式（CHART_CATALOG §1.6：一檔，之後各批擴）。本批：C19 sparklineGeometry（PRD §6.2 C19、§4.4 G7、§7.4、X40）。
// 座標系 64 × 16（高＝chartHeights.xs）；四邊留白 3（最後一點的半徑）；X 平均分、只有 1 點時在最右；Y＝該列最小到最大；座標取到 0.1。

const geometry = (values: readonly (number | null)[], options: { hollowIncomplete?: boolean; incomplete?: number } = {}) =>
  sparklineGeometry(values.map((value, index): SparklinePoint => ({ value, incomplete: index === options.incomplete })), { hollowIncomplete: options.hollowIncomplete });
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;
/** 示範資料本期 6 週的件數（tests/chart-assist-weeks.test.ts 以 CSV 加總驗過；這裡只當圖形輸入）。 */
const DEMO_UNITS = [1223, 1173, 1248, 1252, 1260, 1264];

describe("sparklineGeometry：座標系與 X、Y", () => {
  it("座標系 64 × chartHeights.xs（16）、留白 3；6 點平均分在 3 到 61（步長 11.6）", () => {
    const result = geometry(DEMO_UNITS);
    expect([result.width, result.height]).toEqual([SPARK_WIDTH, chartHeights.xs]);
    expect(SPARK_PAD).toBe(SPARK_DOT_R);
    expect(result.coordinates.map(point => point!.x)).toEqual([3, 14.6, 26.2, 37.8, 49.4, 61]);
  });

  it("Y＝該列最小到最大：最大值在 y＝3、最小值在 y＝13，其餘線性內插（取到 0.1）", () => {
    const result = geometry(DEMO_UNITS);
    expect(result.domain).toEqual([1173, 1264]);
    expect(result.coordinates.map(point => point!.y)).toEqual([7.5, 13, 4.8, 4.3, 3.4, 3]);
    expect(geometry([0, 10]).coordinates.map(point => point!.y)).toEqual([13, 3]);
    expect(geometry([-5, 5, 0]).coordinates.map(point => point!.y)).toEqual([13, 3, 8]);
  });

  it("全部相同時畫在正中央（y＝8）；只有 1 點時放在最右（最新的一週）", () => {
    expect(geometry([0.25, 0.25, 0.25]).coordinates.map(point => point!.y)).toEqual([8, 8, 8]);
    const single = geometry([8]);
    expect(single.coordinates).toEqual([{ index: 0, x: SPARK_WIDTH - SPARK_PAD, y: chartHeights.xs / 2 }]);
    expect(single.lines).toEqual([]);
    expect(single.dots).toEqual([{ index: 0, x: 61, y: 8, kind: "last", last: true }]);
  });

  it("最多 8 點（PRD §8.2 sparkline 點 ≤ 8）：所有座標都在留白之內", () => {
    const result = geometry([5, -3, 12, 0, 7, 7, 1, 9]);
    for (const point of result.coordinates) {
      expect(point!.x).toBeGreaterThanOrEqual(SPARK_PAD);
      expect(point!.x).toBeLessThanOrEqual(SPARK_WIDTH - SPARK_PAD);
      expect(point!.y).toBeGreaterThanOrEqual(SPARK_PAD);
      expect(point!.y).toBeLessThanOrEqual(chartHeights.xs - SPARK_PAD);
    }
    expect(result.coordinates.map(point => point!.x)).toEqual([3, 11.3, 19.6, 27.9, 36.1, 44.4, 52.7, 61]);
  });
});

describe("sparklineGeometry：線、斷線與點", () => {
  it("全部有值：一條折線、最後一點 last（實心 current）", () => {
    const result = geometry(DEMO_UNITS);
    expect(result.lines).toEqual(["3,7.5 14.6,13 26.2,4.8 37.8,4.3 49.4,3.4 61,3"]);
    expect(result.dots).toEqual([{ index: 5, x: 61, y: 3, kind: "last", last: true }]);
  });

  it("null 斷線（不內插、不當 0）；前後都斷線的單一點畫小點（point）；最後一點是最後一個有值的點", () => {
    const result = geometry([1, null, 3, 4, null]);
    expect(result.coordinates.map(point => point === null ? null : point.index)).toEqual([0, null, 2, 3, null]);
    expect(result.lines).toEqual(["32,6.3 46.5,3"]);
    expect(result.dots.map(dot => [dot.index, dot.kind, dot.last])).toEqual([[0, "point", false], [3, "last", true]]);
    // 0 是真的值，不是缺值。
    expect(geometry([0, 0]).lines).toHaveLength(1);
  });

  it("沒有任何值（全部 null 或不是有限數）：沒有線、沒有點、domain 為 null", () => {
    for (const values of [[null, null], [Number.NaN, Number.POSITIVE_INFINITY], []]) {
      const result = geometry(values);
      expect(result.lines).toEqual([]);
      expect(result.dots).toEqual([]);
      expect(result.domain).toBeNull();
    }
  });

  it("X40：水準值序列（hollowIncomplete）的未滿 7 天的點空心、不和前面的完整週連線；比值序列照畫成實心最後一點", () => {
    const values = [210, 210, 90];
    const level = geometry(values, { hollowIncomplete: true, incomplete: 2 });
    expect(level.lines).toEqual(["3,3 32,3"]);
    expect(level.dots).toEqual([{ index: 2, x: 61, y: 13, kind: "hollow", last: true }]);
    const ratio = geometry(values, { incomplete: 2 });
    expect(ratio.lines).toEqual(["3,3 32,3 61,13"]);
    expect(ratio.dots).toEqual([{ index: 2, x: 61, y: 13, kind: "last", last: true }]);
    // 只有一個未滿週的列（golden：本期 1 天）：空心點、沒有線。
    expect(geometry([8], { hollowIncomplete: true, incomplete: 0 })).toMatchObject({ lines: [], dots: [{ index: 0, kind: "hollow", last: true }] });
  });
});

describe("Sparkline：SSR 結構（C19；CL-1、CL-3、CL-10、CL-11）", () => {
  const render = (points: readonly SparklinePoint[], hollowIncomplete = false) => renderToStaticMarkup(createElement(Sparkline, { points, hollowIncomplete, testId: "chart-overview-assist-spark-units_sold" }));

  it("根 svg.spark 帶 data-chart-kind=\"spark\"、aria-hidden、focusable=false、testid；寬 64、高 chartHeights.xs；沒有 tabindex、按鈕、連結與色碼", () => {
    const html = render(DEMO_UNITS.map(value => ({ value })));
    const root = openTag(html, "<svg")!;
    expect(html.startsWith("<svg")).toBe(true);
    expect(root).toContain('class="spark"');
    expect(root).toContain('data-chart-kind="spark"');
    expect(root).toContain('data-testid="chart-overview-assist-spark-units_sold"');
    expect(root).toContain('data-points="6"');
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain(`viewBox="0 0 ${SPARK_WIDTH} ${chartHeights.xs}"`);
    expect(root).toContain(`width="${SPARK_WIDTH}"`);
    expect(root).toContain(`height="${chartHeights.xs}"`);
    expect(html).not.toMatch(/tabindex|<button|<a\b/i);
    expect(html).not.toMatch(HEX);
    expect(byTestId(html, "chart-overview-assist-spark-units_sold")).toBe(html);
  });

  it("線 chartColors.total 1.5px；最後一點 3px 實心 chartColors.current（PRD §4.4 G7、§7.1）", () => {
    const html = render(DEMO_UNITS.map(value => ({ value })));
    expect(html).toContain(`<polyline class="spark-line" points="3,7.5 14.6,13 26.2,4.8 37.8,4.3 49.4,3.4 61,3" fill="none" stroke="${chartColors.total}" stroke-width="${SPARK_STROKE}" stroke-linejoin="round" stroke-linecap="round"></polyline>`);
    expect(html).toContain(`<circle class="spark-dot" data-kind="last" cx="61" cy="3" r="${SPARK_DOT_R}" fill="${chartColors.current}"></circle>`);
    expect(html.match(/<circle/g)).toHaveLength(1);
  });

  it("未滿 7 天的空心點：最後一個 circle 的 fill 是 chartColors.surface、框線 current（E2E 草案的判準）", () => {
    const html = render([{ value: 210 }, { value: 210 }, { value: 90, incomplete: true }], true);
    const circles = html.match(/<circle[^>]*>/g)!;
    expect(circles).toHaveLength(1);
    expect(circles.at(-1)).toContain(`fill="${chartColors.surface}"`);
    expect(circles.at(-1)).toContain(`stroke="${chartColors.current}"`);
    expect(circles.at(-1)).toContain('data-kind="hollow"');
    expect(circles.at(-1)).toContain(`r="${SPARK_DOT_R - SPARK_STROKE / 2}"`);
  });

  it("chart-lint：放在表格列內、同列有數字時 CL-1、CL-2、CL-11 都是 0；不在表格或清單列內時 CL-1 會抓到", () => {
    const spark = render(DEMO_UNITS.map(value => ({ value })));
    const inTable = checkChartMarkup(`<table><tbody><tr><th>售出件數</th><td>7,420 件</td><td>${spark}</td></tr></tbody></table>`, { page: "overview" });
    for (const rule of ["CL-1", "CL-2", "CL-11"] as const) expect(inTable.violations[rule], rule).toEqual([]);
    expect(inTable.chartTestIds).toEqual(["chart-overview-assist-spark-units_sold"]);
    const loose = checkChartMarkup(`<div>${spark}</div>`, { page: "overview" });
    expect(loose.violations["CL-1"]).toHaveLength(1);
  });

  it("原始碼：AST 規則（CL-2 到 CL-8、CL-10）0 違規；沒有 `var(--chart-` 字串常值（色一律經 chartColors）", () => {
    const file = "src/components/charts/sparkline.tsx";
    const text = readFileSync(resolve(file), "utf8");
    const result = scanChartTsx(text, file);
    for (const rule of AST_RULES) expect(result[rule], rule).toEqual([]);
    expect(scanChartVarLiterals(text, file)).toEqual([]);
  });
});

// V4-3a 代理 A：C27 shareStackGeometry（PRD §6.3 C27、§4.4 G10、§7.2；CHART_CATALOG G10）。輸入是 golden 本期 8/2 的比率字串（與 profitWaterfall、channelStructure 相同的 12 位小數），
// 只當圖形座標；座標系寬 1122（H5 設計稿 1440 的圖區寬）：列名欄 152、圖 160 到 1034、標值 1042；x 軸上限＝max(100, 扣項合計)＝101.5151515152（MARKETPLACE）。
describe("shareStackGeometry（C27）：段寬、超過 100、x 軸上限與列高", () => {
  const GOLDEN: ShareStackRowInput[] = [
    // DTC：商品成本 740 ÷ 1480、四項費用 200 ÷ 1480、廣告 270 ÷ 1480、剩 270 ÷ 1480
    { key: "DTC", label: "DTC", status: "ready", cogs: "0.500000000000", fees: "0.135135135135", ad: "0.182432432432", remain: "0.182432432432", over: "0.000000000000", value: "a", tone: "remain" },
    // MARKETPLACE：585 ÷ 990、240 ÷ 990、180 ÷ 990；扣廣告後貢獻 −15 ÷ 990；超過 100 的部分 15 ÷ 990
    { key: "MARKETPLACE", label: "MARKETPLACE", status: "ready", cogs: "0.590909090909", fees: "0.242424242424", ad: "0.181818181818", remain: "-0.015151515152", over: "0.015151515152", value: "b", tone: "loss" },
    // 合計：1325 ÷ 2470、440 ÷ 2470、450 ÷ 2470、255 ÷ 2470
    { key: "total", label: "total", status: "ready", cogs: "0.536437246964", fees: "0.178137651822", ad: "0.182186234818", remain: "0.103238866397", over: "0.000000000000", value: "c", tone: "remain", total: true },
  ];
  const AXIS_MAX = "1.015151515152";
  const segmentsOf = (result: ReturnType<typeof shareStackGeometry>, key: string) => Object.fromEntries(result.rows.find(row => row.key === key)!.segments.map(segment => [segment.segment, segment]));
  const end = (segment: { x: number; width: number }) => Math.round((segment.x + segment.width) * 10) / 10;

  it("座標系：寬 1122 時列名欄 152、圖 160 到 1034、標值 1042；高＝（列數＋1）× chartRowHeights.row24（3 列＝96）；刻度 0、25、50、75、100", () => {
    const result = shareStackGeometry(GOLDEN, { width: 1122, axisMax: AXIS_MAX });
    expect([result.width, result.height]).toEqual([1122, (GOLDEN.length + 1) * chartRowHeights.row24]);
    expect(result.height).toBe(96);
    expect(result.plot).toEqual({ left: SHARE_STACK_LABEL_WIDTH.wide + 8, right: 1122 - SHARE_STACK_VALUE_WIDTH.wide });
    expect([result.labelX, result.valueX]).toEqual([152, 1042]);
    expect(result.scaleMax).toBeCloseTo(101.5151515152, 9);
    // x(v)＝160＋v ÷ 101.5151… × 874：25 → 375.2、50 → 590.5、75 → 805.7、100 → 1021.0。
    expect(result.ticks).toEqual([{ value: 0, x: 160, label: "0" }, { value: 25, x: 375.2, label: "25" }, { value: 50, x: 590.5, label: "50" }, { value: 75, x: 805.7, label: "75" }, { value: 100, x: 1021, label: "100" }]);
    expect(result.x100).toBe(1021);
    expect(result.rows.map(row => row.y)).toEqual([0, 24, 48]);
    expect(result.separatorY).toBe(48.5);
    expect(result.axisTextY).toBe(3 * 24 + 16);
  });

  it("超過 100（MARKETPLACE）：三段從 0 接續、在 100 截斷，over 段從 100 到 x 軸上限（874 × 1.5151… ÷ 101.5151… ≈ 13.0），沒有剩餘段", () => {
    const result = shareStackGeometry(GOLDEN, { width: 1122, axisMax: AXIS_MAX });
    const marketplace = segmentsOf(result, "MARKETPLACE");
    expect(Object.keys(marketplace)).toEqual(["cogs", "fees", "ad", "over"]);
    expect(marketplace.cogs.x).toBe(160);
    expect(marketplace.fees.x).toBe(end(marketplace.cogs));
    expect(marketplace.ad.x).toBe(end(marketplace.fees));
    expect(end(marketplace.ad)).toBe(result.x100);
    expect(marketplace.over).toEqual({ segment: "over", x: result.x100, width: 13 });
    expect(end(marketplace.over)).toBe(result.plot.right);
  });

  it("沒有超過（DTC、合計）：剩餘段從 100 − 剩往右到 100（DTC 874 × 18.2432… ÷ 101.5151… ≈ 157.1）；沒有 over 段", () => {
    const result = shareStackGeometry(GOLDEN, { width: 1122, axisMax: AXIS_MAX });
    const dtc = segmentsOf(result, "DTC");
    expect(Object.keys(dtc)).toEqual(["cogs", "fees", "ad", "remain"]);
    expect(dtc.remain.width).toBe(157.1);
    expect(end(dtc.remain)).toBe(result.x100);
    expect(dtc.remain.x).toBe(end(dtc.ad));
    const total = segmentsOf(result, "total");
    expect(end(total.remain)).toBe(result.x100);
  });

  it("x 軸上限：沒給 axisMax 時由 over 推回同一個值；扣項都沒超過時是 100（右端就是 100 的位置）", () => {
    expect(shareStackGeometry(GOLDEN, { width: 1122 }).scaleMax).toBeCloseTo(101.5151515152, 9);
    const notOver = GOLDEN.filter(row => row.key !== "MARKETPLACE");
    const result = shareStackGeometry(notOver, { width: 1122, axisMax: "1.000000000000" });
    expect(result.scaleMax).toBe(100);
    expect(result.x100).toBe(result.plot.right);
    expect(shareStackGeometry(notOver, { width: 1122 }).scaleMax).toBe(100);
  });

  it("zero_ad（廣告 0）：廣告段寬 0；不適用、資料待補的列沒有段（只畫文字）", () => {
    const zero: ShareStackRowInput = { ...GOLDEN[0], ad: "0.000000000000", remain: "0.364864864865" };
    expect(segmentsOf(shareStackGeometry([zero], { width: 1122 }), "DTC").ad.width).toBe(0);
    const text = shareStackGeometry([{ ...GOLDEN[0], status: "notApplicable", tone: "muted" }, { ...GOLDEN[1], key: "LIVE", status: "missing", tone: "muted" }], { width: 1122 });
    expect(text.rows.map(row => row.segments)).toEqual([[], []]);
    expect(text.scaleMax).toBe(100);
  });

  it("390（座標系寬 324）：列名欄 128、標值欄 64；列高與總高不變", () => {
    const result = shareStackGeometry(GOLDEN, { width: 324, axisMax: AXIS_MAX });
    expect(result.plot).toEqual({ left: SHARE_STACK_LABEL_WIDTH.narrow + 8, right: 324 - SHARE_STACK_VALUE_WIDTH.narrow });
    expect([result.labelX, result.valueX]).toEqual([128, 268]);
    expect(result.height).toBe(96);
  });

  it("（列數＋2）× 24 ≤ 所選固定高：通路 5 用 sm（7 × 24＝168 ≤ 180）、通路 8 用 lg（10 × 24＝240 ≤ 320）", () => {
    const rows = (count: number): ShareStackRowInput[] => [...Array.from({ length: count }, (_, index) => ({ ...GOLDEN[0], key: `C${index + 1}` })), GOLDEN[2]];
    const five = shareStackGeometry(rows(5), { width: 1122 }), eight = shareStackGeometry(rows(8), { width: 1122 });
    expect(five.height).toBe((5 + 2) * chartRowHeights.row24);
    expect(five.height).toBeLessThanOrEqual(chartHeights.sm);
    expect(eight.height).toBe((8 + 2) * chartRowHeights.row24);
    expect(eight.height).toBeLessThanOrEqual(chartHeights.lg);
    expect(eight.height).toBeGreaterThan(chartHeights.sm);
  });
});

describe("ShareStack：SSR 結構（C27；CL-3、CL-7、CL-10、CL-11）", () => {
  const rows: ShareStackRowInput[] = [
    { key: "DTC", label: "DTC", status: "ready", cogs: "0.5", fees: "0.135135135135", ad: "0.182432432432", remain: "0.182432432432", over: "0.000000000000", value: "a", tone: "remain" },
    { key: "MARKETPLACE", label: "MARKETPLACE", status: "ready", cogs: "0.590909090909", fees: "0.242424242424", ad: "0.181818181818", remain: "-0.015151515152", over: "0.015151515152", value: "b", tone: "loss" },
  ];
  const render = () => renderToStaticMarkup(createElement(ShareStack, { rows, axisMax: "1.015151515152", testIdPrefix: "chart-diagnosis-share-seg-" }));

  it("根 svg.chart-share-stack：aria-hidden、focusable=false、高＝（列數＋1）× 24；段帶 testid（前綴＋key＋segment）；沒有 tabindex、按鈕、連結與色碼", () => {
    const html = render();
    const root = openTag(html, "<svg")!;
    expect(root).toContain('class="chart-share-stack"');
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain(`height="${3 * chartRowHeights.row24}"`);
    expect(root).toContain(`viewBox="0 0 ${SHARE_STACK_SSR_WIDTH} ${3 * chartRowHeights.row24}"`);
    expect(html.match(/data-testid="chart-diagnosis-share-seg-[^"]+"/g)!.map(item => item.slice(13, -1))).toEqual([
      "chart-diagnosis-share-seg-DTC-cogs", "chart-diagnosis-share-seg-DTC-fees", "chart-diagnosis-share-seg-DTC-ad", "chart-diagnosis-share-seg-DTC-remain",
      "chart-diagnosis-share-seg-MARKETPLACE-cogs", "chart-diagnosis-share-seg-MARKETPLACE-fees", "chart-diagnosis-share-seg-MARKETPLACE-ad", "chart-diagnosis-share-seg-MARKETPLACE-over",
    ]);
    expect(html).not.toMatch(/tabindex|<button|<a\b/i);
    expect(html).not.toMatch(HEX);
    const check = checkChartMarkup(`<section class="panel chart-section" aria-describedby="s"><p id="s">s</p><div class="chart-frame sm" aria-hidden="true">${html}</div><details class="data-alternative"><summary>t</summary></details></section>`, { page: "diagnosis" });
    for (const rule of ["CL-1", "CL-2", "CL-11"] as const) expect(check.violations[rule], rule).toEqual([]);
  });

  it("色：三段 seg1／seg2／seg3、段間 1px chartColors.surface（D-V4-19＝B）；剩餘空心框 chartColors.total；超過 100 的部分 chartColors.unfavorable；100 參考線 chartColors.axis", () => {
    const html = render();
    const seg = (id: string) => openTag(html, `data-testid="chart-diagnosis-share-seg-${id}"`)!;
    expect(seg("DTC-cogs")).toContain(`fill="${chartColors.seg1}" stroke="${chartColors.surface}" stroke-width="1"`);
    expect(seg("DTC-fees")).toContain(`fill="${chartColors.seg2}"`);
    expect(seg("DTC-ad")).toContain(`fill="${chartColors.seg3}"`);
    expect(seg("DTC-remain")).toContain(`fill="none" stroke="${chartColors.total}" stroke-width="1.5"`);
    expect(seg("MARKETPLACE-over")).toContain(`fill="${chartColors.unfavorable}"`);
    expect(openTag(html, 'class="share-reference"')).toContain(`stroke="${chartColors.axis}"`);
  });

  it("原始碼：AST 規則（CL-2 到 CL-8、CL-10）0 違規；沒有 `var(--chart-` 字串常值", () => {
    const file = "src/components/charts/share-stack.tsx";
    const text = readFileSync(resolve(file), "utf8");
    const result = scanChartTsx(text, file);
    for (const rule of AST_RULES) expect(result[rule], rule).toEqual([]);
    expect(scanChartVarLiterals(text, file)).toEqual([]);
  });
});

// V4-4 代理 B：C25 hbarGeometry（PRD §6.3 C25、§4.4 G13／G14；CHART_CATALOG G13、G14；D-V4-38＝A、D-V4-39＝A）。
// 輸入是 4 通路合成資料的差額與商品毛利（H5 設計稿 verification/revamp-v4/mockups/products-synthetic.html 的建議版用同一組數字）：
// 設計稿的 rankedBarsSvg 與本函式用同一個字寬估計，所以 1440 半格（524）、390（324）的座標要逐點相同。標值一律用 presentation.ts 的 L1 格式化。
const hbarRow = (key: string, label: string, value: string, extra?: string): RankedBarRow<string> => ({ key, label, value, tone: value.startsWith("-") ? "unfavorable" : "favorable", display: formatSignedDelta(value, "L1"), evidence: `evidence-${key}`, extra });
const G13_DECREASE = [
  hbarRow("MARKETPLACE-SKU-203", "SKU-203 · MARKETPLACE", "-8600.00"),
  hbarRow("MARKETPLACE-SKU-101", "SKU-101 · MARKETPLACE", "-8500.00"),
  hbarRow("MARKETPLACE-SKU-201", "SKU-201 · MARKETPLACE", "-3400.00"),
  hbarRow("SOCIAL-SKU-301", "SKU-301 · SOCIAL", "-3060.00"),
  hbarRow("MARKETPLACE-SKU-202", "SKU-202 · MARKETPLACE", "-1700.00"),
];
const G13_INCREASE = [
  hbarRow("DTC-SKU-101", "SKU-101 · DTC", "9350.00"),
  hbarRow("LIVE-SKU-401", "SKU-401 · LIVE", "6800.00"),
  hbarRow("DTC-SKU-103", "SKU-103 · DTC", "3060.00"),
  hbarRow("SOCIAL-SKU-103", "SKU-103 · SOCIAL", "2550.00"),
];
const g13Blocks = (increase = G13_INCREASE): RankedBarBlock<string>[] => [{ key: "decrease", rows: G13_DECREASE }, { key: "increase", rows: increase }];
/** 累計佔比文字只當排版輸入（G14 的「累計 {pct}」由代理 C 從 labels 組；這裡用百分比本身）。 */
const G14_ROWS = [
  hbarRow("MARKETPLACE-SKU-201", "SKU-201 · MARKETPLACE", "-3400.00", "38.0%"),
  hbarRow("SOCIAL-SKU-301", "SKU-301 · SOCIAL", "-2040.00", "60.9%"),
  hbarRow("MARKETPLACE-SKU-203", "SKU-203 · MARKETPLACE", "-1800.00", "81.0%"),
  hbarRow("MARKETPLACE-SKU-202", "SKU-202 · MARKETPLACE", "-850.00", "90.5%"),
  hbarRow("SOCIAL-SKU-302", "SKU-302 · SOCIAL", "-850.00", "100.0%"),
];
const barsOf = (geometry: HbarGeometry<string>, block?: string) => geometry.blocks.filter(item => block === undefined || item.key === block).flatMap(item => item.bars);
/** 標值不壓標籤欄（往左的柱：標值左緣 ≥ 標籤欄右緣；往右的柱：標值起點 ≥ 標籤欄右緣），也不超出主圖右緣；標籤在標籤欄內。 */
const expectValuesClear = (geometry: HbarGeometry<string>) => {
  for (const bar of barsOf(geometry)) {
    const text = rankedTextWidth(bar.row.display);
    if (bar.value.anchor === "end") expect(bar.value.x - text, bar.key).toBeGreaterThanOrEqual(geometry.labelWidth);
    else {
      expect(bar.value.x, bar.key).toBeGreaterThanOrEqual(geometry.labelWidth);
      expect(bar.value.x + text, bar.key).toBeLessThanOrEqual(geometry.width);
    }
    expect(rankedTextWidth(bar.label), bar.key).toBeLessThanOrEqual(geometry.labelWidth - RANKED_TEXT_PAD);
  }
};

describe("hbarGeometry（C25）：G13 兩段上下排列（D-V4-38＝A）、共用尺度、各自從 0", () => {
  it("1440 半格（主圖 524）：與設計稿建議版逐點相同——標籤欄 158、標值欄 59、繪圖區 307；減少段零線在右緣、增加段在標籤欄右緣；9 列 × 16＝144", () => {
    const geometry = hbarGeometry(g13Blocks(), 524, "variance");
    expect([geometry.labelWidth, geometry.valueWidth, geometry.plotWidth, geometry.height, geometry.rowCount]).toEqual([158, 59, 307, 9 * chartRowHeights.row16, 9]);
    expect(geometry.blocks.map(block => [block.key, block.direction, block.top, block.zeroX])).toEqual([["decrease", "left", 0, 524], ["increase", "right", 80, 158]]);
    expect(geometry.separators).toEqual([80]);
    expect(barsOf(geometry, "decrease").map(bar => [bar.bar.x, bar.bar.width, bar.value.x, bar.value.anchor])).toEqual([
      [241.6, 282.4, 237.6, "end"], [244.9, 279.1, 240.9, "end"], [412.4, 111.6, 408.4, "end"], [423.5, 100.5, 419.5, "end"], [468.2, 55.8, 464.2, "end"],
    ]);
    expect(barsOf(geometry, "increase").map(bar => [bar.bar.x, bar.bar.width, bar.value.x, bar.value.anchor])).toEqual([
      [158, 307, 469, "start"], [158, 223.3, 385.3, "start"], [158, 100.5, 262.5, "start"], [158, 83.7, 245.7, "start"],
    ]);
    // 列頂、柱（高 10、上下各 3）與文字基線（列頂＋12）。
    expect(barsOf(geometry).map(bar => [bar.top, bar.bar.y, bar.bar.height, bar.textY])).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128].map(top => [top, top + 3, 10, top + 12]));
    expect(geometry.blocks.map(block => block.zeroLine)).toEqual([{ y1: 0, y2: 80 }, { y1: 80, y2: 144 }]);
  });

  it("390（主圖 324）：標籤欄不變、繪圖區 107——增加最長 107、減少最長 98.4（設計稿建議版）；減少段在上（y 較小）", () => {
    const geometry = hbarGeometry(g13Blocks(), 324, "variance");
    expect([geometry.labelWidth, geometry.plotWidth]).toEqual([158, 107]);
    expect(barsOf(geometry, "increase").map(bar => bar.bar.width)).toEqual([107, 77.8, 35, 29.2]);
    expect(barsOf(geometry, "decrease").map(bar => bar.bar.width)).toEqual([98.4, 97.3, 38.9, 35, 19.5]);
    expect(barsOf(geometry, "decrease").map(bar => bar.bar.x)).toEqual([225.6, 226.7, 285.1, 289, 304.5]);
    expect(Math.max(...barsOf(geometry, "decrease").map(bar => bar.top))).toBeLessThan(Math.min(...barsOf(geometry, "increase").map(bar => bar.top)));
  });

  it("共用一把尺：|值| 最大的柱（增加 9,350）用滿繪圖區，減少段同一把尺（8,600 ÷ 9,350 × 307）；各段從自己的零線起", () => {
    const geometry = hbarGeometry(g13Blocks(), 524, "variance");
    expect(new Decimal(geometry.scale!).toDecimalPlaces(15).toString()).toBe(new Decimal(307).div(9350).toDecimalPlaces(15).toString());
    expect(barsOf(geometry, "decrease")[0].bar.width).toBe(new Decimal(8600).times(307).div(9350).toDecimalPlaces(1).toNumber());
    for (const bar of barsOf(geometry, "decrease")) expect(bar.bar.x + bar.bar.width, bar.key).toBeCloseTo(524, 6);
    for (const bar of barsOf(geometry, "increase")) expect(bar.bar.x, bar.key).toBe(158);
    // 只有減少段時（增加段沒有列、不輸出），減少段最長的柱用滿繪圖區；沒有分隔線。
    const only = hbarGeometry([{ key: "decrease", rows: G13_DECREASE }, { key: "increase", rows: [] }], 524, "variance");
    expect(only.blocks.map(block => block.key)).toEqual(["decrease"]);
    expect(barsOf(only)[0].bar.width).toBe(307);
    expect(only.separators).toEqual([]);
  });

  it("每段 ≤ 5 列：10 列 × chartRowHeights.row16＝160 ≤ chartHeights.sm（180）；340 到 560 寬每根柱都有正長度、標值不壓標籤", () => {
    const five = [...G13_INCREASE, hbarRow("LIVE-SKU-402", "SKU-402 · LIVE", "1200.00")];
    for (const width of [340, 444, 450, 524, RANKED_SSR_WIDTH]) {
      const geometry = hbarGeometry(g13Blocks(five), width, "variance");
      expect(geometry.rowCount, String(width)).toBe(10);
      expect(geometry.height).toBe(10 * chartRowHeights.row16);
      expect(geometry.height).toBeLessThanOrEqual(chartHeights.sm);
      for (const bar of barsOf(geometry)) expect(bar.bar.width, `${width} ${bar.key}`).toBeGreaterThan(0);
      expectValuesClear(geometry);
    }
    expect(10 * chartRowHeights.row16).toBe(160);
  });
});

describe("hbarGeometry（C25）：G14 pareto 從 0 往左、右側累計欄、「另 n 個」列（D-V4-39＝A）", () => {
  it("合成資料 5 筆（主圖 449＝1440 半格 524 − 累計欄 75）：與設計稿相同——零線 449、柱 232／139.2／122.8／58／58、標值在柱左端外側", () => {
    const geometry = hbarGeometry(G14_ROWS, 449, "pareto");
    expect([geometry.labelWidth, geometry.valueWidth, geometry.plotWidth]).toEqual([158, 59, 232]);
    expect(geometry.blocks.map(block => [block.direction, block.zeroX])).toEqual([["left", 449]]);
    expect(barsOf(geometry).map(bar => [bar.bar.x, bar.bar.width, bar.value.x, bar.value.anchor])).toEqual([
      [217, 232, 213, "end"], [309.8, 139.2, 305.8, "end"], [326.2, 122.8, 322.2, "end"], [391, 58, 387, "end"], [391, 58, 387, "end"],
    ]);
    // 累計欄：獨立 svg 的寬＝最長累計文字估寬＋10；每列文字基線與主圖同列相同。
    expect(geometry.extra).toEqual({ width: Math.ceil(rankedTextWidth("100.0%")) + RANKED_TEXT_PAD + 4, rows: barsOf(geometry).map(bar => ({ key: bar.key, y: bar.textY, text: bar.row.extra })) });
    expect(geometry.extra!.rows.map(item => item.y)).toEqual([12, 28, 44, 60, 76]);
    expectValuesClear(geometry);
  });

  it("390 不畫累計（D-V4-39＝A，CSS 隱藏累計欄、主圖量到整格 324）：繪圖區 107（設計稿 PRD 版只剩 32）", () => {
    const geometry = hbarGeometry(G14_ROWS, 324, "pareto");
    expect(geometry.plotWidth).toBe(107);
    expect(barsOf(geometry)[0].bar).toEqual({ x: 217, y: 3, width: 107, height: 10 });
    expectValuesClear(geometry);
  });

  it("柱 ≤ 10＋「另 n 個」1 列＝11 × 16＝176 ≤ chartHeights.sm；「另 n 個」只是文字列（不畫柱、零線只到最後一根柱）", () => {
    const sku = (rank: number) => `SKU-${String(rank + 1).padStart(3, "0")}`;
    const rows = Array.from({ length: 10 }, (_, rank) => hbarRow(`DTC-${sku(rank)}`, `${sku(rank)} · DTC`, `-${(10 - rank) * 100}.00`, `${(rank + 1) * 10}.0%`));
    const geometry = hbarGeometry(rows, 449, "pareto", { more: "+3" });
    expect(geometry.rowCount).toBe(11);
    expect(geometry.height).toBe(11 * chartRowHeights.row16);
    expect(geometry.height).toBeLessThanOrEqual(chartHeights.sm);
    expect(barsOf(geometry)).toHaveLength(10);
    expect(geometry.blocks[0].more).toEqual({ y: 10 * chartRowHeights.row16 + 12, text: "+3" });
    expect(geometry.blocks[0].zeroLine).toEqual({ y1: 0, y2: 10 * chartRowHeights.row16 });
    expect(geometry.extra!.rows).toHaveLength(10);
  });

  it("hbarMaxRows：sm／row16 保留 1 列（「另 n 個」）→ 10、不保留 → 11；sm／row24 保留 1 列（軸）→ 6（G15 會議實例上限）", () => {
    expect(hbarMaxRows("sm", "row16", 1)).toBe(10);
    expect(hbarMaxRows("sm")).toBe(11);
    expect(hbarMaxRows("sm", "row24", 1)).toBe(6);
    expect((hbarMaxRows("sm", "row16", 1) + 1) * chartRowHeights.row16).toBeLessThanOrEqual(chartHeights.sm);
    expect((hbarMaxRows("sm", "row24", 1) + 1) * chartRowHeights.row24).toBeLessThanOrEqual(chartHeights.sm);
  });

  it("variance、ranked 不輸出累計欄（只有 pareto 有）；沒有累計文字時也沒有", () => {
    expect(hbarGeometry(G14_ROWS, 449, "variance").extra).toBeNull();
    expect(hbarGeometry(G14_ROWS, 449, "ranked").extra).toBeNull();
    expect(hbarGeometry(G14_ROWS.map(row => ({ ...row, extra: undefined })), 449, "pareto").extra).toBeNull();
  });
});

describe("hbarGeometry（C25）：雙向、0 與空、長標籤、row24", () => {
  it("同一段正負都有（G15 試算的少賺、多賺）：零線在中間、負往左、正往右，都從 0 起；左右各留一欄標值寬", () => {
    const geometry = hbarGeometry([hbarRow("a", "A", "-100.00"), hbarRow("b", "B", "50.00")], 400, "variance");
    const [block] = geometry.blocks;
    expect(block.direction).toBe("both");
    const plot = 400 - geometry.labelWidth - 2 * geometry.valueWidth;
    expect(new Decimal(geometry.scale!).toDecimalPlaces(15).toString()).toBe(new Decimal(plot).div(150).toDecimalPlaces(15).toString());
    expect(block.zeroX).toBe(new Decimal(geometry.labelWidth + geometry.valueWidth).plus(new Decimal(plot).times(100).div(150).toDecimalPlaces(1)).toNumber());
    const [negative, positive] = barsOf(geometry);
    expect([negative.side, positive.side]).toEqual(["left", "right"]);
    expect(negative.bar.x + negative.bar.width).toBeCloseTo(block.zeroX, 6);
    expect(positive.bar.x).toBe(block.zeroX);
    expect(negative.bar.width + positive.bar.width).toBeCloseTo(plot, 0);
    expectValuesClear(geometry);
  });

  it("空輸入：高 0、沒有段；全部 0 或 null：柱寬 0、scale null、零線在標籤欄右緣、標值在零線右側", () => {
    const empty = hbarGeometry([], 560, "variance");
    expect([empty.height, empty.rowCount, empty.blocks.length, empty.extra]).toEqual([0, 0, 0, null]);
    expect(hbarGeometry([{ key: "decrease", rows: [] }, { key: "increase", rows: [] }], 560, "variance").blocks).toEqual([]);
    const zero = hbarGeometry([hbarRow("a", "A", "0.00"), { ...hbarRow("b", "B", "0.00"), value: null }, { ...hbarRow("c", "C", "0.00"), value: "not-a-number" }], 560, "variance");
    expect(zero.scale).toBeNull();
    expect(zero.blocks[0].zeroX).toBe(zero.labelWidth);
    for (const bar of barsOf(zero)) {
      expect(bar.bar.width).toBe(0);
      expect(bar.value).toEqual({ x: zero.labelWidth + RANKED_VALUE_GAP, anchor: "start" });
    }
  });

  it("非零值至少 1px（比例很小時仍看得到）", () => {
    const geometry = hbarGeometry([hbarRow("a", "A", "-1000000.00"), hbarRow("b", "B", "-0.01")], 340, "ranked");
    expect(barsOf(geometry).map(bar => bar.bar.width)).toEqual([geometry.plotWidth, 1]);
  });

  it("長標籤：截斷加「…」，標籤欄 ≤ 寬 − 標值欄 − RANKED_MIN_PLOT；390 與 1440 半格的柱長仍為正、標值不壓標籤", () => {
    const long = "SKU-VERY-LONG-PRODUCT-IDENTIFIER-0001 · MARKETPLACE-CHANNEL-WITH-LONG-NAME";
    const rows = [hbarRow("MARKETPLACE-LONG", long, "-12345.67"), hbarRow("DTC-SKU-001", "SKU-001 · DTC", "-2345.67")];
    for (const width of [324, 340, 524, RANKED_SSR_WIDTH]) {
      const geometry = hbarGeometry(rows, width, "variance");
      expect(geometry.labelWidth, String(width)).toBeLessThanOrEqual(width - geometry.valueWidth - RANKED_MIN_PLOT);
      expect(geometry.plotWidth).toBeGreaterThanOrEqual(RANKED_MIN_PLOT);
      const [first, second] = barsOf(geometry);
      expect(first.truncated).toBe(true);
      expect(first.label.endsWith("…")).toBe(true);
      expect(long.startsWith(first.label.slice(0, -1))).toBe(true);
      expect(second.truncated).toBe(false);
      expect(second.label).toBe("SKU-001 · DTC");
      for (const bar of barsOf(geometry)) expect(bar.bar.width).toBeGreaterThan(0);
      expectValuesClear(geometry);
    }
  });

  it("row24（G15）：列高 24、柱高 14（上下各 5）、基線在列頂＋16；高＝列數 × 24", () => {
    const geometry = hbarGeometry([hbarRow("p1", "A", "-20.00"), hbarRow("p2", "B", "19.70")], 560, "variance", { rowHeight: "row24" });
    expect([geometry.rowHeight, geometry.height]).toEqual([chartRowHeights.row24, 2 * chartRowHeights.row24]);
    expect(barsOf(geometry).map(bar => [bar.top, bar.bar.y, bar.bar.height, bar.textY])).toEqual([[0, 5, 14, 16], [24, 29, 14, 40]]);
  });
});

// V4-5 代理 A：C29 thresholdGeometry（PRD §6.3 C29、§4.3 G16、§7.4、X29；CHART_CATALOG G16、§9.1；D-V4-20＝A′）。
// 輸入是 golden DTC f−10%（試算 284.00）的兩個門檻與三個假設（tests/chart-threshold.test.ts 由 analyzeScenarioSensitivity 逐字取得；這裡只當圖形輸入）。
// x 固定 [−90, +100]；y 含 0；只畫範圍內的既有點、不連線、不外插；高＝chartHeights.sm。標籤文字由呼叫端組（這裡用百分比本身與假設代號）。
const G16_POINTS: ThresholdLinePoint[] = [
  { id: "zero_contribution", kind: "threshold", v: "-51.263537906137", y: "0.00", label: "zero −51.3%", shortLabel: "−51.3%" },
  { id: "maintain_baseline", kind: "threshold", v: "-2.527075812274", y: "270.00", label: "maintain −2.5%", shortLabel: "−2.5%" },
  { id: "a", kind: "user", v: "-10", y: "228.60", label: "A" },
  { id: "b", kind: "user", v: "0", y: "284.00", label: "B" },
  { id: "c", kind: "user", v: "10", y: "339.40", label: "C" },
];
const thresholdShapes = (geometry: ThresholdGeometry) => Object.fromEntries(geometry.points.map(shape => [shape.point.id, shape]));
type LabelBox = { left: number; right: number; top: number; bottom: number };
const labelBox = (label: NonNullable<ThresholdGeometry["points"][number]["label"]>): LabelBox => {
  const width = rankedTextWidth(label.text);
  const left = label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - width : label.x - width / 2;
  return { left, right: left + width, top: label.y - 10, bottom: label.y + 3 };
};
const boxesOverlap = (a: LabelBox, b: LabelBox) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const userPoints = (values: readonly string[], y: (index: number) => string) => values.map((v, index): ThresholdLinePoint => ({ id: `p${String.fromCharCode(97 + index)}`, kind: "user", v, y: y(index) }));

describe("thresholdGeometry（C29）：x 固定 [−90%, +100%]、y 含 0、不外插（X29）", () => {
  it("所有點的 x 都在繪圖區內：v＝−90 對到左緣、+100 對到右緣，其餘依 v 線性、單調遞增（390 到 1440 的寬）", () => {
    const values = ["-90", "-89.999", "-51.263537906137", "-0.5", "0", "33.333333333333", "99.99", "100"];
    for (const width of [300, 324, 480, THRESHOLD_SSR_WIDTH, 900]) {
      const geometry = thresholdGeometry(userPoints(values, () => "100.00"), width);
      const xs = geometry.points.map(shape => shape.cx);
      expect(geometry.dropped, String(width)).toEqual([]);
      expect(xs[0]).toBe(geometry.plot.left);
      expect(xs.at(-1)).toBe(geometry.plot.right);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(geometry.plot.left);
        expect(x).toBeLessThanOrEqual(geometry.plot.right);
      }
      for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThanOrEqual(xs[k - 1]);
      expect(geometry.plot.right + THRESHOLD_POINT_R).toBeLessThanOrEqual(geometry.width);
    }
  });

  it("不外插、不夾到邊界：v 超出 [−90, +100] 或 v、y 無法解析的點不畫，列入 dropped", () => {
    const geometry = thresholdGeometry([
      { id: "low", kind: "user", v: "-90.1", y: "10.00" },
      { id: "high", kind: "threshold", v: "100.000000000001", y: "0.00" },
      { id: "far", kind: "threshold", v: "400.000000000000", y: "0.00" },
      { id: "text", kind: "user", v: "1e1", y: "10.00" },
      { id: "money", kind: "user", v: "10", y: "−10.00" },
      { id: "ok", kind: "user", v: "+20", y: "19.70" },
    ], THRESHOLD_SSR_WIDTH);
    expect(geometry.dropped).toEqual(["low", "high", "far", "text", "money"]);
    expect(geometry.points.map(shape => shape.point.id)).toEqual(["ok"]);
  });

  it("y 範圍一定含 0（全正、全負、正負都有、很大）；刻度含 0、零線＝0 刻度的 y；每個點的 y 在繪圖區內", () => {
    for (const ys of [["270.00", "339.40"], ["-60.00", "-55.00", "-65.00"], ["-15.00", "19.70", "0.00"], ["123456789.12"]]) {
      const geometry = thresholdGeometry(userPoints(ys.map(() => "0"), index => ys[index]), THRESHOLD_SSR_WIDTH);
      const [lo, hi] = geometry.domain;
      expect(lo, ys.join()).toBeLessThanOrEqual(0);
      expect(hi, ys.join()).toBeGreaterThanOrEqual(0);
      const zero = geometry.yTicks.find(tick => tick.value === 0)!;
      expect(zero.label).toBe("0");
      expect(geometry.zeroY).toBe(zero.y);
      expect(geometry.yTicks[0].value).toBe(lo);
      expect(geometry.yTicks.at(-1)!.value).toBe(hi);
      for (const shape of geometry.points) {
        expect(shape.cy).toBeGreaterThanOrEqual(geometry.plot.top);
        expect(shape.cy).toBeLessThanOrEqual(geometry.plot.bottom);
      }
    }
  });

  it("golden DTC 284：y 0 到 400、步長 100，刻度文字是 formatAxisWan；零線在繪圖區下緣（門檻 zero_contribution 落在零線上）", () => {
    const geometry = thresholdGeometry(G16_POINTS, THRESHOLD_SSR_WIDTH);
    expect(geometry.domain).toEqual([0, 400]);
    expect(geometry.yTicks.map(tick => tick.value)).toEqual([0, 100, 200, 300, 400]);
    expect(geometry.yTicks.map(tick => tick.label)).toEqual(formatAxisWan([0, 100, 200, 300, 400], 100));
    expect(geometry.zeroY).toBe(geometry.plot.bottom);
    expect(thresholdShapes(geometry).zero_contribution.cy).toBe(geometry.zeroY);
    expect([geometry.width, geometry.height, geometry.plot.bottom]).toEqual([THRESHOLD_SSR_WIDTH, chartHeights.sm, chartHeights.sm - chartRowHeights.row24]);
  });

  it("y 步長至少 1 元：每點都不到 3 元時，刻度是整數元、文字與 formatAxisWan 相同且不重複（不會把 −2.5 寫成「−3 元」）", () => {
    for (const ys of [["-1.78", "-1.84", "-2.06"], ["0.00", "1.50"], ["-0.01"], ["0.40", "2.80"]]) {
      const geometry = thresholdGeometry(userPoints(ys.map(() => "0"), index => ys[index]), THRESHOLD_SSR_WIDTH);
      const values = geometry.yTicks.map(tick => tick.value);
      const text = geometry.yTicks.map(tick => tick.label);
      for (const value of values) expect(Number.isInteger(value), `${ys.join()} ${value}`).toBe(true);
      expect(new Set(text).size, `${ys.join()} ${text.join("／")}`).toBe(text.length);
      expect(text).toEqual(formatAxisWan(values, 1));
    }
    expect(thresholdGeometry(userPoints(["0", "0", "0"], index => ["-1.78", "-1.84", "-2.06"][index]), THRESHOLD_SSR_WIDTH).yTicks.map(tick => tick.value)).toEqual([-3, -2, -1, 0]);
  });

  it("沒有點或只有 0：範圍 [−1, 1]、只有 0 一個刻度，零線在繪圖區正中", () => {
    for (const points of [[], [{ id: "zero_contribution", kind: "threshold", v: "-90.000000000000", y: "0.00" }]] as ThresholdLinePoint[][]) {
      const geometry = thresholdGeometry(points, THRESHOLD_SSR_WIDTH);
      expect(geometry.domain).toEqual([-1, 1]);
      expect(geometry.yTicks.map(tick => [tick.value, tick.label])).toEqual([[0, "0"]]);
      expect(geometry.zeroY).toBe((geometry.plot.top + geometry.plot.bottom) / 2);
      expect(geometry.points).toHaveLength(points.length);
    }
  });

  it("x 刻度每 25 個百分點（−75 到 +100），文字是 formatAxisPercent；繪圖區太窄時只標 50 的倍數（刻度線照畫）", () => {
    expect([...THRESHOLD_X_TICKS]).toEqual([-75, -50, -25, 0, 25, 50, 75, 100]);
    expect(THRESHOLD_X_TICKS.every(value => value % THRESHOLD_X_STEP === 0 && value >= -90 && value <= 100)).toBe(true);
    expect(THRESHOLD_X_STEP).toBe(25);
    const wide = thresholdGeometry(G16_POINTS, THRESHOLD_SSR_WIDTH);
    expect(wide.xTicks.map(tick => tick.label)).toEqual(formatAxisPercent(THRESHOLD_X_TICKS.map(value => value / 100)));
    for (let k = 1; k < wide.xTicks.length; k++) expect(wide.xTicks[k].x - wide.xTicks[k - 1].x).toBeCloseTo((wide.plot.right - wide.plot.left) * 25 / 190, 0);
    const narrow = thresholdGeometry(G16_POINTS, 300);
    expect(narrow.xTicks).toHaveLength(8);
    expect(narrow.xTicks.filter(tick => tick.label !== null).map(tick => tick.value)).toEqual([-50, 0, 50, 100]);
  });

  it("D-V4-20＝A′：不輸出線段（connected 恆為 false；幾何沒有 segments、lines、path）", () => {
    for (const width of [300, THRESHOLD_SSR_WIDTH]) {
      const geometry = thresholdGeometry(G16_POINTS, width);
      expect(geometry.connected).toBe(false);
      for (const key of ["segments", "lines", "path", "line"]) expect(geometry).not.toHaveProperty(key);
    }
  });
});

describe("thresholdGeometry（C29）：點標籤（390 縮短為百分比）與避讓", () => {
  it("寬 < THRESHOLD_NARROW_BELOW 用 shortLabel（沒給時沿用 label）；≥ 時用 label；narrow 選項可覆寫；沒有標籤時 null", () => {
    const text = (geometry: ThresholdGeometry) => Object.fromEntries(geometry.points.map(shape => [shape.point.id, shape.label?.text]));
    const wide = thresholdGeometry(G16_POINTS, THRESHOLD_NARROW_BELOW);
    expect(wide.narrow).toBe(false);
    expect(text(wide)).toEqual({ zero_contribution: "zero −51.3%", maintain_baseline: "maintain −2.5%", a: "A", b: "B", c: "C" });
    const narrow = thresholdGeometry(G16_POINTS, THRESHOLD_NARROW_BELOW - 1);
    expect(narrow.narrow).toBe(true);
    expect(text(narrow)).toEqual({ zero_contribution: "−51.3%", maintain_baseline: "−2.5%", a: "A", b: "B", c: "C" });
    expect(text(thresholdGeometry(G16_POINTS, 900, { narrow: true })).zero_contribution).toBe("−51.3%");
    expect(thresholdGeometry([{ id: "x", kind: "user", v: "0", y: "1.00" }], 300).points[0].label).toBeNull();
  });

  it("golden 的五個標籤：都在 svg 內、上下不進 x 軸文字列，彼此不重疊，也不壓到其他點（390 與 1440）", () => {
    for (const width of [300, 324, THRESHOLD_SSR_WIDTH, 900]) {
      const geometry = thresholdGeometry(G16_POINTS, width);
      const boxes = geometry.points.filter(shape => shape.label !== null).map(shape => ({ id: shape.point.id, box: labelBox(shape.label!) }));
      expect(boxes).toHaveLength(5);
      for (const { id, box } of boxes) {
        expect(box.left, `${width} ${id}`).toBeGreaterThanOrEqual(0);
        expect(box.right, `${width} ${id}`).toBeLessThanOrEqual(geometry.width);
        expect(box.top, `${width} ${id}`).toBeGreaterThanOrEqual(0);
        expect(box.bottom, `${width} ${id}`).toBeLessThanOrEqual(geometry.plot.bottom + 4);
        for (const other of boxes) if (other.id !== id) expect(boxesOverlap(box, other.box), `${width} ${id}／${other.id}`).toBe(false);
        for (const shape of geometry.points) if (shape.point.id !== id) {
          const point = { left: shape.cx - THRESHOLD_POINT_R, right: shape.cx + THRESHOLD_POINT_R, top: shape.cy - THRESHOLD_POINT_R, bottom: shape.cy + THRESHOLD_POINT_R };
          expect(boxesOverlap(box, point), `${width} ${id} 壓到點 ${shape.point.id}`).toBe(false);
        }
      }
    }
  });

  it("四個位置都碰到時取重疊最小的位置：golden DTC f−10%、假設 −5／0／+5（只標門檻）時，「維持現況」標籤不壓在 B、C 兩點上", () => {
    // 維持現況門檻 −2.53%（y 270.00）夾在 A（−5%，256.30）、B（0%，284.00）、C（+5%，311.70）之間：上、下、右、左都碰到點；
    // 舊的「都碰到時放上方」會把標籤疊在 B、C 兩點上，改取重疊面積最小的位置。
    const points: ThresholdLinePoint[] = [
      { id: "zero_contribution", kind: "threshold", v: "-51.263537906137", y: "0.00", label: "zero −51.3%", shortLabel: "−51.3%" },
      { id: "maintain_baseline", kind: "threshold", v: "-2.527075812274", y: "270.00", label: "maintain −2.5%", shortLabel: "−2.5%" },
      { id: "a", kind: "user", v: "-5", y: "256.30" },
      { id: "b", kind: "user", v: "0", y: "284.00" },
      { id: "c", kind: "user", v: "5", y: "311.70" },
    ];
    const area = (a: LabelBox, b: LabelBox) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (const width of [THRESHOLD_SSR_WIDTH, 900]) {
      const geometry = thresholdGeometry(points, width);
      const shapes = thresholdShapes(geometry);
      const label = shapes.maintain_baseline.label!;
      const box = labelBox(label);
      const pointBox = (id: string): LabelBox => ({ left: shapes[id].cx - THRESHOLD_POINT_R, right: shapes[id].cx + THRESHOLD_POINT_R, top: shapes[id].cy - THRESHOLD_POINT_R, bottom: shapes[id].cy + THRESHOLD_POINT_R });
      expect(label.placement, String(width)).not.toBe("above");
      for (const id of ["b", "c"]) expect(boxesOverlap(box, pointBox(id)), `${width} 壓到點 ${id}`).toBe(false);
      const covered = ["a", "b", "c", "zero_contribution"].reduce((sum, id) => sum + area(box, pointBox(id)), 0);
      expect(covered, String(width)).toBeLessThan(THRESHOLD_POINT_R * THRESHOLD_POINT_R);
    }
  });

  it("點在繪圖區上緣、右緣時：標籤不超出 svg 上緣與右緣", () => {
    const geometry = thresholdGeometry([{ id: "top", kind: "threshold", v: "100", y: "500.00", label: "maintain +100.0%" }], THRESHOLD_SSR_WIDTH);
    const [shape] = geometry.points;
    expect(shape.cy).toBe(geometry.plot.top);
    expect(shape.cx).toBe(geometry.plot.right);
    const box = labelBox(shape.label!);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(geometry.width);
  });
});

describe("ThresholdLine：SSR 結構（C29；CL-1、CL-2、CL-3、CL-7、CL-9、CL-10、CL-11）", () => {
  const render = (points: readonly ThresholdLinePoint[] = G16_POINTS) => renderToStaticMarkup(createElement(ThresholdLine, { points, testIdPrefix: "chart-scenarios-threshold-point-" }));

  it("根 svg.chart-threshold：aria-hidden、focusable=false、高 chartHeights.sm、SSR 座標系 560；每個點一個 testid（語意 key）；沒有 tabindex、onclick、按鈕、連結、色碼、path", () => {
    const html = render();
    const root = openTag(html, "<svg")!;
    expect(root).toContain('class="chart-threshold"');
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain(`height="${chartHeights.sm}"`);
    expect(root).toContain(`viewBox="0 0 ${THRESHOLD_SSR_WIDTH} ${chartHeights.sm}"`);
    expect(root).toContain('data-points="5"');
    expect(html.match(/data-testid="[^"]+"/g)!.map(item => item.slice(13, -1)).sort()).toEqual(["a", "b", "c", "maintain_baseline", "zero_contribution"].map(id => `chart-scenarios-threshold-point-${id}`).sort());
    expect(html).not.toMatch(/tabindex|onclick|<button|<a\b|cursor/i);
    expect(html).not.toMatch(HEX);
    expect(html).not.toMatch(/<(path|polyline|polygon)\b/);
  });

  it("色：門檻點 fill none＋stroke chartColors.target、使用者點 fill chartColors.total；零線 chartColors.axis；沒有 current、favorable", () => {
    const html = render();
    expect(openTag(html, 'data-testid="chart-scenarios-threshold-point-zero_contribution"')).toContain(`fill="none" stroke="${chartColors.target}" stroke-width="1.5"`);
    expect(openTag(html, 'data-testid="chart-scenarios-threshold-point-a"')).toContain(`fill="${chartColors.total}"`);
    expect(openTag(html, 'class="threshold-zero"')).toContain(`stroke="${chartColors.axis}"`);
    expect(html).not.toContain(chartColors.current);
    expect(html).not.toContain(chartColors.favorable);
  });

  it("放在 ChartFrame（variant inline、headingLevel 4、資料表）內：chart-lint 的 SSR 規則 CL-1、CL-2、CL-9、CL-11 都是 0；點在 aria-hidden 內", () => {
    const html = renderToStaticMarkup(createElement(ChartFrame, {
      id: "scenarios-threshold-p1", testId: "chart-scenarios-threshold", variant: "inline", headingLevel: 4, title: "t", subtitle: "s",
      dataTable: { summary: "d", content: createElement("table", { "data-testid": "chart-scenarios-threshold-table" }) },
    }, createElement(ThresholdLine, { points: G16_POINTS, testIdPrefix: "chart-scenarios-threshold-point-" })));
    const check = checkChartMarkup(html, { page: "scenarios" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(check.violations[rule], rule).toEqual([]);
    expect(check.chartTestIds).toContain("chart-scenarios-threshold");
    expect(check.chartTestIds).toContain("chart-scenarios-threshold-point-zero_contribution");
    expect(check.mainSections).toEqual(["chart-scenarios-threshold"]);
    expect(openTag(html, "<section")).toContain('class="chart-section is-inline"');
    expect(byTestId(html, "chart-scenarios-threshold")).toContain('<h4 id="scenarios-threshold-p1-title">');
  });

  it("原始碼：AST 規則（CL-2 到 CL-8、CL-10）0 違規；沒有 `var(--chart-` 字串常值、色碼、中文字串與 JSX 中文、fontSize 常值", () => {
    const file = "src/components/charts/threshold-line.tsx";
    const text = readFileSync(resolve(file), "utf8");
    const result = scanChartTsx(text, file);
    for (const rule of AST_RULES) expect(result[rule], rule).toEqual([]);
    expect(scanChartVarLiterals(text, file)).toEqual([]);
    const scan = scanTsxText(text, file);
    expect(scan.hex).toEqual([]);
    expect(scan.jsxCjk).toEqual([]);
    expect(scan.cjkLiterals).toEqual([]);
    expect(scan.fontSize).toEqual([]);
  });
});

// ── V4-7a 代理 A：C30 timelineGeometry（PRD §6.3 C30、§4.4 G20、§5.7「sm 180（4 軌 × 24＋日期軸）」；H5 設計稿 data.html；D-V4-40＝A）。
// 寬度取設計稿量到的資料來源頁面板內寬：1440＝1122、1280＝962、768＝450、390＝324；SSR 560。
const TIMELINE_WIDTHS = [324, 450, TIMELINE_SSR_WIDTH, 962, 1122] as const;
function coverageModel(name: "synthetic" | "missing_ad_day" | "demo") {
  const input = name === "synthetic" ? synthetic4ChannelInput() : fixture(name === "demo" ? "demo" : "errors/missing_ad_day");
  const timeline = coverageTimeline(validateDataset(input).dataset!);
  return { timeline, model: coverageChartModel(timeline) };
}
const timelineOf = (name: "synthetic" | "missing_ad_day" | "demo", width: number, extraTracks: TimelineTrackInput[] = []) => {
  const { timeline, model } = coverageModel(name);
  return timelineGeometry({ width, domain: timeline.axis, bands: model.bands, tracks: [...model.tracks, ...extraTracks], noRowsText: labels.data.chartsV4.coverage.noRows, dateLabel: iso => formatDateL1(iso, { anchor: timeline.dataAsOf }) });
};
const EVENTS_TRACK: TimelineTrackInput = { key: "events", label: labels.overview.alerts.eventPeriod, rows: [], missing: [], noRows: [], endLabel: "", events: [{ key: "2", start: "2026-09-11", end: "2026-09-13", label: "x" }] };

describe("timelineGeometry（C30）：高度、繪圖區、缺列框", () => {
  it("svg 高＝（軌數＋1）× row24＋axis：3 軌 120、4 軌（加檔期）144，都 ≤ chartHeights.sm（180）", () => {
    expect(chartRowHeights.axis).toBe(24);
    const three = timelineOf("synthetic", 1122), four = timelineOf("synthetic", 1122, [EVENTS_TRACK]);
    expect(three.height).toBe(4 * chartRowHeights.row24 + chartRowHeights.axis);
    expect(four.height).toBe(5 * chartRowHeights.row24 + chartRowHeights.axis);
    expect([three.height, four.height]).toEqual([120, 144]);
    expect(four.height).toBeLessThanOrEqual(chartHeights.sm);
    expect(four.tracks.map(track => track.y)).toEqual([24, 48, 72, 96]);
    expect(four.bodyHeight).toBe(120);
    expect(four.axis.y).toBe(four.bodyHeight);
  });

  it("合成資料四種寬（＋SSR）：軸 34 天；有列細條、缺列框、區帶都在繪圖區內；缺列框 testid 是語意 key", () => {
    for (const width of TIMELINE_WIDTHS) {
      const geometry = timelineOf("synthetic", width, [EVENTS_TRACK]);
      const { left, right } = geometry.plot;
      expect(geometry.days, String(width)).toBe(34);
      const narrow = width < TIMELINE_NARROW_BELOW;
      expect(geometry.narrow).toBe(narrow);
      expect(left).toBe(narrow ? TIMELINE_LABEL_WIDTH.narrow : TIMELINE_LABEL_WIDTH.wide);
      expect(right).toBe(width - (narrow ? TIMELINE_END_WIDTH.narrow : TIMELINE_END_WIDTH.wide));
      const shapes = [...geometry.bands, ...geometry.tracks.flatMap(track => [...track.rows, ...track.missing])];
      for (const shape of shapes) {
        expect(shape.x, `${width} ${JSON.stringify(shape)}`).toBeGreaterThanOrEqual(left);
        expect(shape.x + shape.width, `${width} ${JSON.stringify(shape)}`).toBeLessThanOrEqual(right + 0.1);
      }
      expect(geometry.tracks.flatMap(track => track.missing.map(segment => segment.testId))).toEqual([
        "chart-data-coverage-seg-costs-LIVE-2026-09-14", "chart-data-coverage-seg-ads-LIVE-2026-08-30", "chart-data-coverage-seg-ads-LIVE-2026-09-22",
      ]);
      for (const track of geometry.tracks) for (const segment of track.missing) {
        expect(segment.y).toBe(track.y + 5);
        expect(segment.y + segment.height).toBeLessThanOrEqual(track.y + chartRowHeights.row24);
      }
    }
  });

  it("1440（1122）：一天 978 ÷ 34 px；缺列框寬＝天數 × 一天寬（6 天、4 天、1 天）", () => {
    const geometry = timelineOf("synthetic", 1122);
    expect(geometry.dayWidth).toBeCloseTo(978 / 34, 2);
    // 設計稿的軸是 35 天（8/20 起），D-V4-40＝A 改為 34 天（8/21 起），所以每天略寬。
    const widths = geometry.tracks.flatMap(track => track.missing.map(segment => segment.width));
    expect(widths).toEqual([6, 4, 1].map(days => Math.round(days * 978 / 34 * 10) / 10));
  });

  it("1 天的缺列在很長的軸、390 寬時仍至少 TIMELINE_MIN_SEGMENT（6px），而且框留在繪圖區內（貼在軸的兩端時往內移）", () => {
    const domain = { start: "2025-09-01", end: "2026-09-23" };
    const track = (start: string): TimelineTrackInput => ({ key: `ads-${start}`, label: "x", rows: [], noRows: [], events: [], endLabel: "", missing: [{ start, end: start, file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY", testId: `chart-data-coverage-seg-ads-LIVE-${start}` }] });
    for (const width of [324, 1122]) {
      const geometry = timelineGeometry({ width, domain, bands: [], tracks: [track("2025-09-01"), track("2026-03-01"), track("2026-09-23")], noRowsText: "x", dateLabel: iso => iso });
      expect(geometry.days).toBe(388);
      expect(geometry.dayWidth).toBeLessThan(TIMELINE_MIN_SEGMENT);
      for (const shape of geometry.tracks.flatMap(item => item.missing)) {
        expect(shape.width, `${width} ${shape.start}`).toBe(TIMELINE_MIN_SEGMENT);
        expect(shape.x).toBeGreaterThanOrEqual(geometry.plot.left);
        expect(shape.x + shape.width).toBeLessThanOrEqual(geometry.plot.right + 0.1);
      }
      const [first, , last] = geometry.tracks.map(item => item.missing[0]);
      expect(first.x).toBe(geometry.plot.left);
      expect(last.x + last.width).toBeCloseTo(geometry.plot.right, 1);
    }
  });

  it("missing_ad_day（軸 2 天）：區帶上期、本期各佔一半，相鄰兩段之間 2px 白縫；名稱直接標在區帶上；1 天的缺列框＝一天寬", () => {
    for (const width of TIMELINE_WIDTHS) {
      const geometry = timelineOf("missing_ad_day", width);
      const [previous, current] = geometry.bands;
      expect([previous.key, current.key]).toEqual(["previous", "current"]);
      expect([previous.label, current.label]).toEqual([labels.shell.periods.previous, labels.shell.periods.current]);
      expect(current.x - (previous.x + previous.width)).toBeCloseTo(2, 1);
      expect(previous.labelX).not.toBeNull();
      expect(current.labelX).not.toBeNull();
      const [segment] = geometry.tracks[2].missing;
      expect(segment.testId).toBe("chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02");
      expect(segment.width).toBeCloseTo(geometry.dayWidth, 0);
      expect(segment.x + segment.width).toBeCloseTo(geometry.plot.right, 0);
    }
  });

  it("區帶太窄時不標名稱（只畫底色）", () => {
    const geometry = timelineGeometry({ width: 324, domain: { start: "2025-09-01", end: "2026-09-23" }, bands: [{ key: "previous", label: labels.shell.periods.previous, start: "2026-09-06", end: "2026-09-14" }, { key: "current", label: labels.shell.periods.current, start: "2026-09-15", end: "2026-09-23" }], tracks: [], noRowsText: "x", dateLabel: iso => iso });
    expect(geometry.bands.map(band => band.labelX)).toEqual([null, null]);
    expect(geometry.bands.every(band => band.width > 0)).toBe(true);
  });
});

describe("timelineGeometry（C30）：日期軸與無列", () => {
  it("合成資料：起訖兩端（8/21、9/23）＋月初 9/1 的刻度；四種寬都標得下 9/1；刻度線在 9/1 那一天的左緣", () => {
    for (const width of TIMELINE_WIDTHS) {
      const geometry = timelineOf("synthetic", width);
      expect(geometry.axis.start.label).toBe("8/21");
      expect(geometry.axis.end?.label).toBe("9/23");
      expect(geometry.axis.ticks.map(tick => [tick.iso, tick.label])).toEqual([["2026-09-01", "9/1"]]);
      expect(geometry.axis.ticks[0].x).toBeCloseTo(geometry.plot.left + 11 * (geometry.plot.right - geometry.plot.left) / 34, 1);
    }
  });

  it("388 天的軸：12 個月初；寬時標字與起點重疊的略過，390（< TIMELINE_NARROW_BELOW）月份刻度減半（只留第 2、4、6…個）", () => {
    const options = { domain: { start: "2025-09-01", end: "2026-09-23" }, bands: [], tracks: [], noRowsText: "x", dateLabel: (iso: string) => formatDateL1(iso, { anchor: "2026-09-24" }) };
    const wide = timelineGeometry({ ...options, width: 1122 });
    expect(wide.axis.ticks.map(tick => tick.iso)).toEqual(["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(wide.axis.start.label).toBe("2025/9/1");
    expect(wide.axis.ticks.filter(tick => tick.label !== null).length).toBeGreaterThanOrEqual(9);
    const narrow = timelineGeometry({ ...options, width: 324 });
    expect(narrow.narrow).toBe(true);
    expect(narrow.axis.ticks.map(tick => tick.iso)).toEqual(["2025-11-01", "2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01", "2026-09-01"]);
    // 標了字的刻度互不重疊（估寬＋左右各 4px），也不壓起訖兩端的字。
    for (const geometry of [wide, narrow]) {
      const boxes = [
        { from: geometry.axis.start.x, to: geometry.axis.start.x + rankedTextWidth(geometry.axis.start.label) },
        { from: geometry.axis.end!.x - rankedTextWidth(geometry.axis.end!.label), to: geometry.axis.end!.x },
        ...geometry.axis.ticks.filter(tick => tick.label !== null).map(tick => ({ from: tick.x - rankedTextWidth(tick.label!) / 2, to: tick.x + rankedTextWidth(tick.label!) / 2 })),
      ];
      for (const [index, box] of boxes.entries()) for (const other of boxes.slice(index + 1)) expect(box.from < other.to && box.to > other.from, JSON.stringify([box, other])).toBe(false);
    }
  });

  it("軸只有 1 天時只標起日（不重複標訖日）；沒有月初", () => {
    const geometry = timelineGeometry({ width: 560, domain: { start: "2026-08-02", end: "2026-08-02" }, bands: [], tracks: [], noRowsText: "x", dateLabel: iso => iso });
    expect(geometry.days).toBe(1);
    expect(geometry.axis.end).toBeNull();
    expect(geometry.axis.ticks).toEqual([]);
  });

  it("無列：寬放得下時在區段中間標「無列」，太窄時不標（右端天數照常由呼叫端給）", () => {
    const track: TimelineTrackInput = { key: "sales", label: "x", rows: [], missing: [], events: [], endLabel: "", noRows: [{ start: "2026-09-10", end: "2026-09-11" }] };
    const domain = { start: "2026-08-21", end: "2026-09-23" };
    const wide = timelineGeometry({ width: 1122, domain, bands: [], tracks: [track], noRowsText: labels.data.chartsV4.coverage.noRows, dateLabel: iso => iso });
    const narrow = timelineGeometry({ width: 324, domain, bands: [], tracks: [{ ...track, noRows: [{ start: "2026-09-10", end: "2026-09-10" }] }], noRowsText: labels.data.chartsV4.coverage.noRows, dateLabel: iso => iso });
    const [wideRange] = wide.tracks[0].noRows, [narrowRange] = narrow.tracks[0].noRows;
    expect(Math.abs(wideRange.labelX! - (wideRange.x + wideRange.width / 2))).toBeLessThanOrEqual(0.1);
    expect(narrowRange.labelX).toBeNull();
  });

  it("右端字（審查修正）：放得下時左對齊在 plot.right＋8；390 的「無列 12 天」比右端欄寬時往左移，估寬不超出 svg 右緣、也不壓進繪圖區", () => {
    const domain = { start: "2026-08-21", end: "2026-09-23" };
    const track = (endLabel: string): TimelineTrackInput => ({ key: endLabel, label: "x", rows: [], missing: [], noRows: [], events: [], endLabel });
    const long = fill(labels.data.chartsV4.coverage.noRowDays, { n: "12" }), short = fill(labels.data.chartsV4.coverage.gapDays, { n: "6" });
    for (const width of TIMELINE_WIDTHS) {
      const geometry = timelineGeometry({ width, domain, bands: [], tracks: [track(long), track(short)], noRowsText: "x", dateLabel: iso => iso });
      const [longShape, shortShape] = geometry.tracks;
      expect(shortShape.endX, String(width)).toBe(geometry.endX);
      expect(longShape.endX + rankedTextWidth(long), String(width)).toBeLessThanOrEqual(width + 0.05);
      expect(longShape.endX, String(width)).toBeGreaterThan(geometry.plot.right);
    }
    const narrow = timelineGeometry({ width: 324, domain, bands: [], tracks: [track(long)], noRowsText: "x", dateLabel: iso => iso });
    expect(narrow.tracks[0].endX).toBeLessThan(narrow.endX);
  });
});

describe("Timeline：SSR 結構（C30；CL-1、CL-2、CL-3、CL-7、CL-9、CL-10、CL-11）", () => {
  const { timeline, model } = coverageModel("synthetic");
  const render = (onSegment?: () => void) => renderToStaticMarkup(createElement(Timeline, { domain: timeline.axis, bands: model.bands, tracks: model.tracks, noRowsText: labels.data.chartsV4.coverage.noRows, dateLabel: (iso: string) => formatDateL1(iso, { anchor: timeline.dataAsOf }), onSegment }));

  it("根 svg.chart-timeline：aria-hidden、focusable=false、高＝4 × row24＋axis、SSR 座標系 560；缺列框一段一個 testid；沒有 tabindex、onclick、按鈕、連結、色碼", () => {
    const html = render(() => undefined);
    const root = openTag(html, "<svg")!;
    expect(root).toContain('class="chart-timeline"');
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain(`height="${4 * chartRowHeights.row24 + chartRowHeights.axis}"`);
    expect(root).toContain(`viewBox="0 0 ${TIMELINE_SSR_WIDTH} ${4 * chartRowHeights.row24 + chartRowHeights.axis}"`);
    expect(html.match(/data-testid="[^"]+"/g)!.map(item => item.slice(13, -1))).toEqual(["chart-data-coverage-seg-costs-LIVE-2026-09-14", "chart-data-coverage-seg-ads-LIVE-2026-08-30", "chart-data-coverage-seg-ads-LIVE-2026-09-22"]);
    expect(html).not.toMatch(/tabindex|onclick|<button|<a\b/i);
    expect(html).not.toMatch(HEX);
    expect(openTag(html, 'data-testid="chart-data-coverage-seg-costs-LIVE-2026-09-14"')).toContain('pointer-events="all"');
    expect(openTag(html, 'data-testid="chart-data-coverage-seg-costs-LIVE-2026-09-14"')).toContain('class="timeline-missing is-clickable"');
    // 不給 onSegment 時缺列框不可點。
    expect(render()).not.toMatch(/is-clickable|pointer-events/);
  });

  it("色：區帶 chartColors.band、有列 chartColors.total、缺列框 fill none＋stroke chartColors.missing 虛線；軸 chartColors.grid／axis；沒有強調色與有利、不利色", () => {
    const html = render();
    expect(openTag(html, 'data-band="previous"')).toContain(`fill="${chartColors.band}"`);
    expect(openTag(html, 'data-kind="rows"')).toContain(`fill="${chartColors.total}"`);
    expect(openTag(html, 'data-testid="chart-data-coverage-seg-ads-LIVE-2026-09-22"')).toContain(`fill="none" stroke="${chartColors.missing}" stroke-width="1" stroke-dasharray="3 2"`);
    expect(html).toContain(`stroke="${chartColors.grid}"`);
    for (const color of [chartColors.current, chartColors.favorable, chartColors.unfavorable, chartColors.previous, chartColors.yoy]) expect(html).not.toContain(color);
    // 區帶名直接標字（沿用 shell.periods），軌名沿用 importWizard.files；右端天數。
    const gap = (n: number) => labels.data.chartsV4.coverage.gapDays.replace("{n}", String(n));
    for (const text of [labels.shell.periods.previous, labels.shell.periods.current, ...Object.values(labels.importWizard.files), gap(6), gap(5)]) expect(html).toContain(`>${text}</text>`);
  });

  it("原始碼：AST 規則（CL-2 到 CL-8、CL-10）0 違規；沒有 `var(--chart-` 字串常值、色碼、中文字串與 JSX 中文、fontSize 常值", () => {
    for (const file of ["src/components/charts/timeline.tsx", "src/components/data/coverage-chart.tsx"]) {
      const text = readFileSync(resolve(file), "utf8");
      const result = scanChartTsx(text, file);
      for (const rule of AST_RULES) expect(result[rule], `${file} ${rule}`).toEqual([]);
      expect(scanChartVarLiterals(text, file)).toEqual([]);
      const scan = scanTsxText(text, file);
      expect(scan.hex).toEqual([]);
      expect(scan.jsxCjk).toEqual([]);
      expect(scan.cjkLiterals).toEqual([]);
      expect(scan.fontSize).toEqual([]);
    }
  });
});
