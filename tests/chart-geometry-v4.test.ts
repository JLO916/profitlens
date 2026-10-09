import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { chartColors, chartHeights, chartRowHeights } from "../src/application/chart-theme";
import { SHARE_STACK_LABEL_WIDTH, SHARE_STACK_SSR_WIDTH, SHARE_STACK_VALUE_WIDTH, ShareStack, shareStackGeometry, type ShareStackRowInput } from "../src/components/charts/share-stack";
import { SPARK_DOT_R, SPARK_PAD, SPARK_STROKE, SPARK_WIDTH, Sparkline, sparklineGeometry, type SparklinePoint } from "../src/components/charts/sparkline";
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
