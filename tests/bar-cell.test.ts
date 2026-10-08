import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { chartColors, chartRowHeights } from "../src/application/chart-theme";
import { BAR_CELL_HEIGHT, BAR_CELL_WIDTH, BarCell, barCellFill, barCellGeometry, barCellScale, type BarCellProps } from "../src/components/charts/bar-cell";
import { labels } from "../src/i18n";
import { byTestId, openTag } from "./helpers/markup";

// V4-1 代理 B：C24 BarCell variance 模式（PRD §6.3 C24、§6.5、§7.2；CHART_CATALOG G6 單元測試「最大值滿寬、負值往左、0 不畫、null 不畫」）。
// 幾何用 barCellGeometry 純函式驗；元件用 SSR（renderToStaticMarkup）驗根節點標記、aria-hidden、不可聚焦、沒有色碼；chart-lint 口徑用 scripts/lib/chart-scan.mjs 驗。
// 示範資料九項差額取自 fixtures/demo/computed_summary.json（原價收入 +3,161,970.00 是九項 |值| 最大值、商品成本 −1,575,080.55）。

const DEMO_BRIDGE = {
  gross_sales: "3161970.00",
  discounts: "-1188365.10",
  refunds: "-264522.72",
  cogs_net: "-1575080.55",
  platform_fees: "-253417.53",
  payment_fees: "-34181.63",
  fulfillment_costs: "-75791.00",
  other_variable_costs: "-8545.42",
  ad_spend: "-360900.00",
} as const;
const HALF = BAR_CELL_WIDTH / 2;
const variance = (value: BarCellProps["value"], max: BarCellProps["max"]) => barCellGeometry({ mode: "variance", value, max });
const render = (props: Partial<BarCellProps> = {}) => renderToStaticMarkup(createElement(BarCell, { mode: "variance", value: "-1575080.55", max: "3161970.00", tone: "unfavorable", testId: "chart-overview-bridge-bar-cogs_net", ...props }));
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;

describe("barCellScale：共同尺度＝|值| 最大值（精確字串）", () => {
  it("示範資料九項的尺度是原價收入 3,161,970.00（正值）", () => {
    expect(barCellScale(Object.values(DEMO_BRIDGE))).toBe("3161970");
  });
  it("負值取絕對值；略過缺值與無法解析的值；數值也可以", () => {
    expect(barCellScale(["-315.00", "120.5", null, undefined, "", labels.shell.status.missing, Number.NaN])).toBe("315");
    expect(barCellScale([12, -40.25])).toBe("40.25");
  });
  it("沒有可用的值或全部為 0 時回傳 null", () => {
    expect(barCellScale([])).toBeNull();
    expect(barCellScale([null, undefined])).toBeNull();
    expect(barCellScale(["0.00", "-0.00", 0])).toBeNull();
  });
});

describe("barCellGeometry：variance（零線在正中央，負往左、正往右）", () => {
  it("座標系 96 × 12：盒高＝chartRowHeights.cell 兩倍，條高＝cell、垂直置中，零線在 48", () => {
    expect(chartRowHeights.cell).toBe(6);
    expect(BAR_CELL_HEIGHT).toBe(chartRowHeights.cell * 2);
    const geometry = variance("100", "100");
    expect(geometry).toMatchObject({ mode: "variance", width: BAR_CELL_WIDTH, height: BAR_CELL_HEIGHT, zeroX: HALF });
    expect(geometry.bar).toEqual({ x: HALF, y: (BAR_CELL_HEIGHT - chartRowHeights.cell) / 2, width: HALF, height: chartRowHeights.cell });
  });

  it("最大值時滿半寬：正值從零線往右畫 48、負值從 0 畫到零線", () => {
    expect(variance("3161970.00", "3161970.00")).toMatchObject({ ratio: 1, direction: "right", bar: { x: HALF, width: HALF } });
    expect(variance("-315.00", "315")).toMatchObject({ ratio: 1, direction: "left", bar: { x: 0, width: HALF } });
  });

  it("負值往左：條的右端貼齊零線（示範商品成本 −1,575,080.55 ÷ 3,161,970.00 × 48＝23.9，x＝24.1）", () => {
    const geometry = variance(DEMO_BRIDGE.cogs_net, "3161970.00");
    expect(geometry.direction).toBe("left");
    expect(geometry.bar).toMatchObject({ x: 24.1, width: 23.9 });
    expect(geometry.bar!.x + geometry.bar!.width).toBe(HALF);
    expect(geometry.ratio).toBeCloseTo(1575080.55 / 3161970, 12);
  });

  it("條長與 |值| 成比例（座標取到 0.1），尺度用負數也取絕對值；精確字串與數值結果相同", () => {
    expect(variance(DEMO_BRIDGE.discounts, "3161970.00").bar).toMatchObject({ x: 30, width: 18 });
    expect(variance(DEMO_BRIDGE.ad_spend, "-3161970.00").bar).toMatchObject({ x: 42.5, width: 5.5 });
    expect(variance("50", "200").bar).toMatchObject({ x: HALF, width: 12 });
    expect(variance(-50, 200)).toEqual(variance("-50", "200"));
  });

  it("九項共用尺度時，原價收入最長；不利（負值）條中商品成本最長", () => {
    const max = barCellScale(Object.values(DEMO_BRIDGE));
    const widths = Object.fromEntries(Object.entries(DEMO_BRIDGE).map(([field, value]) => [field, variance(value, max).bar!.width]));
    expect(Math.max(...Object.values(widths))).toBe(widths.gross_sales);
    const negatives = Object.entries(widths).filter(([field]) => field !== "gross_sales").map(([, width]) => width);
    expect(Math.max(...negatives)).toBe(widths.cogs_net);
  });

  it("非零但比例極小的值至少畫 1 個座標單位（看得出方向）；ratio 仍是精確比例", () => {
    const geometry = variance(DEMO_BRIDGE.other_variable_costs, "3161970.00");
    expect(geometry.bar).toMatchObject({ x: HALF - 1, width: 1 });
    expect(geometry.ratio).toBeCloseTo(8545.42 / 3161970, 12);
    expect(variance("0.01", "3161970.00").bar).toMatchObject({ x: HALF, width: 1 });
  });

  it("超過尺度時夾在半寬（ratio 1）", () => {
    expect(variance("-500", "100")).toMatchObject({ ratio: 1, bar: { x: 0, width: HALF } });
  });

  it("零值只畫零線（ratio 0、沒有條）；缺值、無法解析或尺度無效時 ratio 為 null、沒有條", () => {
    expect(variance("0.00", "100")).toMatchObject({ ratio: 0, direction: null, bar: null });
    expect(variance("-0.00", "100")).toMatchObject({ ratio: 0, direction: null, bar: null });
    for (const [value, max] of [[null, "100"], [undefined, "100"], ["", "100"], [labels.shell.status.missing, "100"], ["−1,575,080.55", "100"], [Number.POSITIVE_INFINITY, "100"], ["10", null], ["10", "0"], ["10", barCellScale([])]] as const) {
      expect(variance(value, max), `${String(value)} ÷ ${String(max)}`).toMatchObject({ ratio: null, direction: null, bar: null });
    }
  });
});

describe("barCellFill：只有不利上色（D-V3-7）", () => {
  it("不利用 unfavorable；有利預設 favorable（灰），可改 total；neutral 用 total", () => {
    expect(barCellFill("unfavorable")).toBe(chartColors.unfavorable);
    expect(barCellFill("favorable")).toBe(chartColors.favorable);
    expect(barCellFill("favorable", "total")).toBe(chartColors.total);
    expect(barCellFill("unfavorable", "total")).toBe(chartColors.unfavorable);
    expect(barCellFill("neutral")).toBe(chartColors.total);
  });
});

describe("BarCell：SSR 結構（根 svg 標記、aria-hidden、不可聚焦、沒有色碼）", () => {
  it("根節點是 svg.bar-cell，帶 data-chart-kind=\"cell\"、aria-hidden=\"true\"、focusable=\"false\"、呼叫端給的 testid 與 tone", () => {
    const html = render();
    expect(html.startsWith("<svg")).toBe(true);
    const root = openTag(html, "<svg")!;
    expect(root).toContain('class="bar-cell is-variance"');
    expect(root).toContain('data-chart-kind="cell"');
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain('data-testid="chart-overview-bridge-bar-cogs_net"');
    expect(root).toContain('data-tone="unfavorable"');
    expect(root).toContain(`viewBox="0 0 ${BAR_CELL_WIDTH} ${BAR_CELL_HEIGHT}"`);
    expect(root).toContain(`width="${BAR_CELL_WIDTH}"`);
    expect(root).toContain(`height="${BAR_CELL_HEIGHT}"`);
    expect(root).toContain('preserveAspectRatio="none"');
    expect(byTestId(html, "chart-overview-bridge-bar-cogs_net")).toBe(html);
  });

  it("條與零線：負值的條在零線左邊、色取 chartColors；零線 1px、--chart-axis 經 chartColors.axis、non-scaling-stroke", () => {
    const html = render();
    expect(html).toContain(`<rect class="bar-cell-bar" x="24.1" y="3" width="23.9" height="${chartRowHeights.cell}" fill="${chartColors.unfavorable}"></rect>`);
    expect(html).toContain(`<line class="bar-cell-zero" x1="${HALF}" x2="${HALF}" y1="0" y2="${BAR_CELL_HEIGHT}" stroke="${chartColors.axis}" stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"></line>`);
    // 零線畫在條之後，正值的條從零線往右畫時零線仍看得到。
    expect(html.indexOf("bar-cell-bar")).toBeLessThan(html.indexOf("bar-cell-zero"));
  });

  it("有利的條往右、預設灰（favorable）；favorableFill=\"total\" 改用 total", () => {
    const favorable = render({ value: DEMO_BRIDGE.gross_sales, tone: "favorable", testId: "chart-overview-bridge-bar-gross_sales" });
    expect(favorable).toContain(`<rect class="bar-cell-bar" x="${HALF}" y="3" width="${HALF}" height="${chartRowHeights.cell}" fill="${chartColors.favorable}"></rect>`);
    expect(render({ value: "100", max: "200", tone: "favorable", favorableFill: "total" })).toContain(`fill="${chartColors.total}"`);
  });

  it("零值與缺值只畫零線、沒有 rect", () => {
    for (const value of ["0.00", null]) {
      const html = render({ value, tone: "neutral" });
      expect(html).not.toContain("<rect");
      expect(html).toContain('class="bar-cell-zero"');
      expect(openTag(html, "<svg")).toContain('data-chart-kind="cell"');
    }
  });

  it("沒有可聚焦元素：沒有 tabindex、按鈕、連結；給 onClick 時只加 is-clickable（SSR 不輸出 handler）", () => {
    for (const html of [render(), render({ onClick: () => undefined, className: "bridge-bar-cell" })]) {
      expect(html).not.toMatch(/tabindex/i);
      expect(html).not.toMatch(/<(button|a|input|select|textarea)[\s>]/);
      expect(html).not.toMatch(/onclick|onkeydown/i);
    }
    expect(openTag(render({ onClick: () => undefined, className: "bridge-bar-cell" }), "<svg")).toContain('class="bar-cell is-variance is-clickable bridge-bar-cell"');
  });

  it("markup 沒有色碼；色都是 chartColors 的 var() 字串", () => {
    for (const html of [render(), render({ value: "10", tone: "favorable" }), render({ value: "10", tone: "neutral" })]) {
      expect(html).not.toMatch(HEX);
      for (const [, color] of html.matchAll(/(?:fill|stroke)="([^"]+)"/g)) expect(Object.values(chartColors)).toContain(color);
    }
  });
});

describe("globals.css「V4-1 B」錨點：顯示寬與零線對齊只用 :root token，不藏條", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V4-1 B：");
  const block = css.slice(start, css.indexOf("/* ── V4-1 B 錨點結束 ── */", start));

  it("≥ 768 用屬性的 96px，≤ 767 縮成 64px；金額格內貼齊左緣讓各列零線對齊", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain(".bar-cell { display: inline-block;");
    expect(block).toContain("@media (max-width: 767px) { .bar-cell { width: 64px; } }");
    expect(block).toContain("td.num > .bar-cell { float: left;");
    expect(block).toContain(`${BAR_CELL_HEIGHT}px`);
  });

  it("沒有色碼、沒有 var(--chart-*)（色在元件內經 chartColors）；本段不寫 display: none（顯示與否由各圖的錨點決定）", () => {
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(HEX);
    expect(rules).not.toContain("var(--chart-");
    expect(rules).not.toContain("display: none");
    for (const [, token] of rules.matchAll(/var\((--[\w-]+)\)/g)) expect(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")))).toContain(`${token}:`);
  });
});

describe("chart-lint 口徑（PRD §7.9）：bar-cell.tsx 本身 0 違規，SSR 放在表格列內 0 違規", () => {
  const FILE = "src/components/charts/bar-cell.tsx";
  const source = readFileSync(resolve(FILE), "utf8");

  it("AST（CL-2、CL-3、CL-4、CL-5、CL-6、CL-7、CL-8、CL-10）全部 0；沒有 hex 與 `var(--chart-` 字串常值", () => {
    const found = scanChartTsx(source, FILE);
    for (const rule of AST_RULES) expect(found[rule], rule).toEqual([]);
    expect(scanChartVarLiterals(source, FILE)).toEqual([]);
    // 註解以外的程式碼沒有色碼（AST 已涵蓋字串常值；這裡再擋數值以外的寫法）。
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(HEX);
    expect(code).not.toContain("var(--");
  });

  it("CL-1、CL-11：放在 <tr> 的金額格內（同列有數字）時 0 違規；不在表格或清單列內時 CL-1 抓得到", () => {
    const cell = render();
    const row = `<table data-testid="bridge-table"><tbody><tr data-row="cogs_net"><th scope="row">cogs_net</th><td class="num">${cell}<button type="button" class="number-link negative">−1,575,080.55</button></td></tr></tbody></table>`;
    const inTable = checkChartMarkup(`<main id="main-content">${row}</main>`, { page: "overview" }).violations;
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(inTable[rule], rule).toEqual([]);
    const loose = checkChartMarkup(`<main id="main-content"><div class="kpi">${cell}</div></main>`, { page: "overview" }).violations;
    expect(loose["CL-1"]).toHaveLength(1);
    expect(loose["CL-11"]).toEqual([]);
  });
});
