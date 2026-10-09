import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { chartColors, chartRowHeights } from "../src/application/chart-theme";
import { BAR_CELL_HEIGHT, BAR_CELL_OUTLINE_STROKE, BAR_CELL_TICK_WIDTH, BAR_CELL_WIDTH, BarCell, barCellFill, barCellGeometry, barCellScale, type BarCellProps } from "../src/components/charts/bar-cell";
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

// ── V4-3a 代理 C：C24 加 tick（門檻刻度）與 outline（空心條）；G9 健檢清單用（CHART_CATALOG G9、PRD §4.4、§6.3 C24、§7.1）。
// 示範資料 G9 的數字：差額類規則 |影響| 最大＝DISCOUNT_BURDEN_UP −1,188,365.10（共用尺度），REV_UP_CM_DOWN −598,833.95（空心條）；
// H5 設計稿的門檻示意 300,000 元：刻度中心＝48 − 300000 ÷ 1188365.10 × 48＝48 − 12.1＝35.9，矩形 x＝34.9（verification/revamp-v4/mockups/diagnosis.html）。
const G9_MAX = "1188365.10";
const tickOf = (value: BarCellProps["value"], max: BarCellProps["max"], tick: BarCellProps["tick"]) => barCellGeometry({ mode: "variance", value, max, tick });

describe("V4-3a barCellGeometry：tick（2×12 刻度，畫在條所在那一側的 |tick| 位置）", () => {
  it("設計稿門檻 300,000：不利（往左）的條，刻度中心 35.9、矩形 x 34.9、寬 2、高＝盒高 12", () => {
    expect(BAR_CELL_TICK_WIDTH).toBe(2);
    const geometry = tickOf("-1188365.10", G9_MAX, "300000.00");
    expect(geometry.tick).toEqual({ x: 34.9, y: 0, width: BAR_CELL_TICK_WIDTH, height: BAR_CELL_HEIGHT });
    expect(geometry.tickRatio).toBeCloseTo(300000 / 1188365.1, 12);
    // 刻度不改條本身：與沒給 tick 時同一個 bar、ratio、direction。
    const plain = variance("-1188365.10", G9_MAX);
    expect({ ratio: geometry.ratio, direction: geometry.direction, bar: geometry.bar }).toEqual({ ratio: plain.ratio, direction: plain.direction, bar: plain.bar });
    expect(plain).toMatchObject({ tick: null, tickRatio: null, outline: null });
  });

  it("有利（往右）的條，刻度畫在右側；tick 取絕對值（負數門檻與正數相同）；精確字串與數值結果相同", () => {
    expect(tickOf("50", "100", "25").tick).toEqual({ x: HALF + 12 - 1, y: 0, width: 2, height: BAR_CELL_HEIGHT });
    expect(tickOf("50", "100", "-25")).toEqual(tickOf("50", "100", "25"));
    expect(tickOf(-50, 100, 25)).toEqual(tickOf("-50", "100", "25.00"));
    expect(tickOf("-50", "100", "25").tick).toMatchObject({ x: HALF - 12 - 1 });
  });

  it("tick 0 與零線重疊、不另畫（設計稿「門檻 0 元」狀態）；缺值或無法解析時不畫", () => {
    for (const tick of ["0.00", "-0.00", 0, null, undefined, "", labels.shell.status.missing, "300,000.00"] as const) {
      expect(tickOf("-1188365.10", G9_MAX, tick), String(tick)).toMatchObject({ tickRatio: null, tick: null });
    }
  });

  it("超出共同尺度不畫（不夾在端點，避免看起來像門檻等於最大值）；剛好等於尺度時畫在端點並夾在座標系內", () => {
    expect(tickOf("-100", "100", "100.01")).toMatchObject({ tickRatio: null, tick: null });
    expect(tickOf("-100", "100", "100")).toMatchObject({ tickRatio: 1, tick: { x: 0, width: 2 } });
    expect(tickOf("100", "100", "100")).toMatchObject({ tickRatio: 1, tick: { x: BAR_CELL_WIDTH - 2, width: 2 } });
  });

  it("沒有條（值為 0）時沒有「哪一側」，不畫刻度（tickRatio 照算）；值缺或尺度無效時全部為 null", () => {
    expect(tickOf("0.00", "100", "25")).toMatchObject({ bar: null, direction: null, tickRatio: 0.25, tick: null });
    expect(tickOf(null, "100", "25")).toMatchObject({ bar: null, tickRatio: null, tick: null });
    expect(tickOf("-50", null, "25")).toMatchObject({ bar: null, tickRatio: null, tick: null });
  });
});

describe("V4-3a barCellGeometry：outline（空心條；外框與實心條同一個盒，同一把尺）", () => {
  it("示範 REV_UP_CM_DOWN −598,833.95 ÷ 1,188,365.10 × 48＝24.2：外框 x 23.8、寬 24.2；框線矩形內縮 1（x 24.8、y 4、寬 22.2、高 4，同 H5 設計稿）", () => {
    expect(BAR_CELL_OUTLINE_STROKE).toBe(2);
    const geometry = barCellGeometry({ mode: "variance", value: "-598833.95", max: G9_MAX, outline: true });
    expect(geometry.bar).toEqual({ x: 23.8, y: 3, width: 24.2, height: chartRowHeights.cell });
    expect(geometry.bar).toEqual(variance("-598833.95", G9_MAX).bar);
    expect(geometry.outline).toEqual({ x: 24.8, y: 4, width: 22.2, height: chartRowHeights.cell - BAR_CELL_OUTLINE_STROKE });
  });

  it("往右的空心條同樣內縮；比例極小時外框至少 3（框線內至少留 1）", () => {
    expect(barCellGeometry({ mode: "variance", value: "100", max: "100", outline: true }).outline).toEqual({ x: HALF + 1, y: 4, width: HALF - 2, height: 4 });
    const tiny = barCellGeometry({ mode: "variance", value: "-0.01", max: G9_MAX, outline: true });
    expect(tiny.bar).toMatchObject({ x: HALF - 3, width: 3 });
    expect(tiny.outline).toMatchObject({ x: HALF - 2, width: 1 });
  });

  it("沒有條時沒有框線矩形；outline: false 與省略相同", () => {
    for (const value of ["0.00", null]) expect(barCellGeometry({ mode: "variance", value, max: "100", outline: true })).toMatchObject({ bar: null, outline: null });
    expect(barCellGeometry({ mode: "variance", value: "-50", max: "100", outline: false })).toEqual(variance("-50", "100"));
  });
});

describe("V4-3a BarCell：SSR（沒給 tick、outline 時與 V4-2 逐字相同；給了才多 has-tick、is-outline）", () => {
  it("沒給 tick 與 outline：整段 markup 逐字等於 V4-2 的輸出（G4、G6 不受影響）", () => {
    expect(render()).toBe(`<svg class="bar-cell is-variance" data-chart-kind="cell" data-testid="chart-overview-bridge-bar-cogs_net" data-tone="unfavorable" viewBox="0 0 96 12" width="96" height="12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="bar-cell-bar" x="24.1" y="3" width="23.9" height="6" fill="${chartColors.unfavorable}"></rect><line class="bar-cell-zero" x1="48" x2="48" y1="0" y2="12" stroke="${chartColors.axis}" stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"></line></svg>`);
    expect(render({ tick: undefined, outline: false })).toBe(render());
  });

  it("空心條：rect 不填色（fill=\"none\"）、2px 框線用條色、non-scaling-stroke；根 svg 加 is-outline", () => {
    const html = render({ value: "-598833.95", max: G9_MAX, outline: true, testId: "chart-diagnosis-impact-bar-REV_UP_CM_DOWN" });
    expect(openTag(html, "<svg")).toContain('class="bar-cell is-variance is-outline"');
    expect(html).toContain(`<rect class="bar-cell-bar" x="24.8" y="4" width="22.2" height="4" fill="none" stroke="${chartColors.unfavorable}" stroke-width="2" vector-effect="non-scaling-stroke"></rect>`);
    expect(html.match(/<rect/g)).toHaveLength(1);
    // 有利的空心條框線用有利色（只有不利上色，D-V3-7）。
    expect(render({ value: "50", max: "100", outline: true, tone: "favorable" })).toContain(`fill="none" stroke="${chartColors.favorable}"`);
  });

  it("刻度：rect.bar-cell-tick 畫在最上層（零線之後）、色取 chartColors.target；根 svg 加 has-tick；tick 0 時不畫、也不加 has-tick", () => {
    const html = render({ value: "-1188365.10", max: G9_MAX, tick: "300000.00" });
    expect(openTag(html, "<svg")).toContain('class="bar-cell is-variance has-tick"');
    expect(html).toContain(`<rect class="bar-cell-tick" x="34.9" y="0" width="2" height="${BAR_CELL_HEIGHT}" fill="${chartColors.target}"></rect></svg>`);
    expect(html.indexOf("bar-cell-zero")).toBeLessThan(html.indexOf("bar-cell-tick"));
    const zero = render({ value: "-1188365.10", max: G9_MAX, tick: "0.00" });
    expect(zero).not.toContain("bar-cell-tick");
    expect(openTag(zero, "<svg")).toContain('class="bar-cell is-variance"');
    expect(zero).toBe(render({ value: "-1188365.10", max: G9_MAX }));
  });

  it("空心條＋刻度＋呼叫端 class：class 依序 is-variance、is-outline、has-tick、呼叫端；仍 aria-hidden、不可聚焦、沒有色碼", () => {
    const html = render({ value: "-598833.95", max: G9_MAX, outline: true, tick: "300000.00", className: "impact-bar" });
    expect(openTag(html, "<svg")).toContain('class="bar-cell is-variance is-outline has-tick impact-bar"');
    expect(openTag(html, "<svg")).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/tabindex|<button|<a\s/i);
    expect(html).not.toMatch(HEX);
    for (const [, color] of html.matchAll(/(?:fill|stroke)="([^"]+)"/g)) if (color !== "none") expect(Object.values(chartColors)).toContain(color);
  });
});
