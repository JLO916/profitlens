import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { chartColors, chartHeights } from "../src/application/chart-theme";
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
