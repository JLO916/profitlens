import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { scanCssText, scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { chartColors, chartHeights, chartRowHeights } from "../src/application/chart-theme";
import { formatAmountL1, formatRateL2, formatSignedDelta } from "../src/application/presentation";
import { RANKED_SSR_WIDTH, RankedBars, RankedBarsView, hbarGeometry, rankedBarFill, type RankedBarBlock, type RankedBarRow, type RankedBarTone } from "../src/components/charts/ranked-bars";
import { ChartFrame } from "../src/components/overview/charts/chart-frame";
import { labels } from "../src/i18n";
import { byTestId, element, openTag, textOf } from "./helpers/markup";

// V4-4 代理 B：C25 RankedBars 的 SSR 結構與點擊（PRD §6.3 C25、§4.4 G13／G14、§7.1；CHART_CATALOG G13、G14；D-V4-38＝A、D-V4-39＝A）。
// 幾何（座標、尺度、列數 × 列高 ≤ 框高）在 tests/chart-geometry-v4.test.ts；這裡驗 markup（testid、aria-hidden、沒有可聚焦元素、色、累計欄的窄螢幕 class、「另 n 個」列、段的順序）、
// chart-lint（放進 ChartFrame 後 CL-1、CL-2、CL-9、CL-11 為 0）與點擊（柱與整列熱區都把同一個 evidence 物件交給 onBarClick）。
// 測試環境沒有 DOM：點擊直接呼叫 RankedBarsView（沒有 hook 的純輸出）回傳的元素樹上的 onClick，與 tests/empty-states-v3.test.tsx 的作法相同。
// 標值一律用 presentation.ts 的格式化函式組；標題、副標借用 labels 既有字串（G13、G14 的字串由代理 C 加在 products.chartsV4.*）。

interface Evidence { id: string }
const row = (key: string, label: string, value: string, tone: RankedBarTone, extra?: string): RankedBarRow<Evidence> => ({ key, label, value, tone, display: formatSignedDelta(value, "L1"), evidence: { id: key }, extra });
const DECREASE = [
  row("MARKETPLACE-SKU-203", "SKU-203 · MARKETPLACE", "-8600.00", "unfavorable"),
  row("MARKETPLACE-SKU-101", "SKU-101 · MARKETPLACE", "-8500.00", "unfavorable"),
  row("SOCIAL-SKU-301", "SKU-301 · SOCIAL", "-3060.00", "unfavorable"),
];
const INCREASE = [
  row("DTC-SKU-101", "SKU-101 · DTC", "9350.00", "favorable"),
  row("LIVE-SKU-401", "SKU-401 · LIVE", "6800.00", "favorable"),
];
const BLOCKS: RankedBarBlock<Evidence>[] = [{ key: "decrease", rows: DECREASE }, { key: "increase", rows: INCREASE }];
const VARIANCE_PREFIX = "chart-products-variance-bar-";
const PARETO_PREFIX = "chart-products-pareto-bar-";
/** 佔比字串只當輸入（「累計 {pct}」的完整句由代理 C 從 labels 組）。 */
const PARETO = [
  row("MARKETPLACE-SKU-201", "SKU-201 · MARKETPLACE", "-3400.00", "unfavorable", formatRateL2("0.38")),
  row("SOCIAL-SKU-301", "SKU-301 · SOCIAL", "-2040.00", "unfavorable", formatRateL2("0.609")),
  row("SOCIAL-SKU-302", "SKU-302 · SOCIAL", "-850.00", "unfavorable", formatRateL2("1")),
].map(item => ({ ...item, display: formatAmountL1(String(item.value)) }));
const MORE = "+7";
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;
const testIdsOf = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map(match => match[1]);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

type TreeElement = ReactElement<Record<string, unknown>>;
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const item = node as TreeElement;
    if (match(item)) found.push(item);
    findAll(item.props.children as ReactNode, match, found);
  }
  return found;
}
const hasClass = (item: TreeElement, name: string) => typeof item.props.className === "string" && item.props.className.split(/\s+/).includes(name);

describe("RankedBars：G13 兩段（variance）的 SSR 結構", () => {
  const html = renderToStaticMarkup(createElement(RankedBars<Evidence>, { mode: "variance", blocks: BLOCKS, testIdPrefix: VARIANCE_PREFIX }));

  it("每根柱一個 testid（前綴＋key，不用索引）：減少段在前、增加段在後；根 svg aria-hidden、focusable=false、SSR 寬 560、高＝列數 × row16", () => {
    expect(testIdsOf(html)).toEqual([...DECREASE, ...INCREASE].map(item => `${VARIANCE_PREFIX}${item.key}`));
    const root = openTag(html, 'class="chart-ranked-bars"')!;
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain(`viewBox="0 0 ${RANKED_SSR_WIDTH} ${5 * chartRowHeights.row16}"`);
    expect(root).toContain(`height="${5 * chartRowHeights.row16}"`);
    expect(root).toContain('width="100%"');
    expect(html.indexOf('data-block="decrease"')).toBeLessThan(html.indexOf('data-block="increase"'));
    expect(openTag(html, 'data-block="decrease"')).toBe('<g class="ranked-block" data-block="decrease" data-direction="left">');
    expect(openTag(html, 'data-block="increase"')).toBe('<g class="ranked-block" data-block="increase" data-direction="right">');
    // 段名不畫在 svg 內（用 ChartFrame legend）；svg 內的文字只有標籤與標值。
    expect(count(html, /<text\b/g)).toBe(2 * (DECREASE.length + INCREASE.length));
  });

  it("圖內沒有可聚焦元素（tabindex、button、a）、沒有色碼；svg 只有 aria-hidden 的根；沒有給 onBarClick 時沒有熱區與 is-clickable", () => {
    expect(html).not.toMatch(/tabindex|<button|<a\b/i);
    expect(html).not.toMatch(HEX);
    expect(count(html, /<svg\b/g)).toBe(count(html, /<svg\b[^>]*aria-hidden="true"/g));
    expect(html).not.toContain("ranked-hit");
    expect(html).not.toContain("is-clickable");
    expect(html).not.toContain("chart-ranked-extra");
  });

  it("色：不利 chartColors.unfavorable、有利 chartColors.favorable（D-V3-7 不用綠）、total chartColors.total；不利標值加 is-unfavorable；零線 axis；預設沒有段間分隔線（H5 設計稿建議版）", () => {
    expect(openTag(html, `data-testid="${VARIANCE_PREFIX}MARKETPLACE-SKU-203"`)).toContain(`fill="${chartColors.unfavorable}"`);
    expect(openTag(html, `data-testid="${VARIANCE_PREFIX}DTC-SKU-101"`)).toContain(`fill="${chartColors.favorable}"`);
    expect([rankedBarFill("unfavorable"), rankedBarFill("favorable"), rankedBarFill("total")]).toEqual([chartColors.unfavorable, chartColors.favorable, chartColors.total]);
    const values = [...html.matchAll(/<text class="([^"]*ranked-value[^"]*)"[^>]*>([^<]*)<\/text>/g)].map(match => [match[1], match[2]]);
    expect(values).toEqual([...DECREASE.map(item => ["chart-value ranked-value is-unfavorable", item.display]), ...INCREASE.map(item => ["chart-value ranked-value", item.display])]);
    expect(count(html, new RegExp(`<line class="ranked-zero"[^>]*stroke="${chartColors.axis.replace(/[()]/g, "\\$&")}"`, "g"))).toBe(2);
    expect(html).not.toContain("ranked-separator");
  });

  it("separator 時段界畫一條 grid 分隔線；給 width 時用給的寬（390 主圖 324）", () => {
    const separated = renderToStaticMarkup(createElement(RankedBars<Evidence>, { mode: "variance", blocks: BLOCKS, testIdPrefix: VARIANCE_PREFIX, separator: true }));
    expect(openTag(separated, 'class="ranked-separator"')).toContain(`stroke="${chartColors.grid}"`);
    expect(openTag(separated, 'class="ranked-separator"')).toContain(`y1="${DECREASE.length * chartRowHeights.row16}"`);
    const plain = renderToStaticMarkup(createElement(RankedBars<Evidence>, { mode: "variance", blocks: BLOCKS, testIdPrefix: VARIANCE_PREFIX, separator: false, width: 324 }));
    expect(plain).not.toContain("ranked-separator");
    expect(openTag(plain, 'class="chart-ranked-bars"')).toContain(`viewBox="0 0 324 ${5 * chartRowHeights.row16}"`);
  });
});

describe("RankedBars：G14 pareto 的累計欄與「另 n 個」列（D-V4-39＝A）", () => {
  const render = (hideExtraOnNarrow?: boolean) => renderToStaticMarkup(createElement(RankedBars<Evidence>, { mode: "pareto", rows: PARETO, more: MORE, testIdPrefix: PARETO_PREFIX, hideExtraOnNarrow }));

  it("累計欄是獨立的 svg.chart-ranked-extra（aria-hidden、focusable=false）：每根柱一個累計文字、與主圖同高；hideExtraOnNarrow 時帶 is-narrow-hidden（≤ 767px 由 CSS 隱藏、仍掛載）", () => {
    const html = render(true);
    const extra = element(html, 'class="chart-ranked-extra is-narrow-hidden"')!;
    const tag = openTag(extra, "<svg")!;
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).toContain('focusable="false"');
    expect(tag).toContain(`height="${(PARETO.length + 1) * chartRowHeights.row16}"`);
    expect([...extra.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match => match[1])).toEqual(PARETO.map(item => item.extra));
    expect(openTag(html, 'class="ranked-bars has-extra"')).toBe('<div class="ranked-bars has-extra" data-mode="pareto">');
    // 主圖在量寬容器內、累計欄在它之後（右側）。
    expect(html.indexOf('class="ranked-bars-main"')).toBeLessThan(html.indexOf("chart-ranked-extra"));
    expect(render()).toContain('class="chart-ranked-extra"');
    expect(render()).not.toContain("is-narrow-hidden");
  });

  it("柱從 0 往左（data-direction=left）、不利色；「另 n 個」是最後一列的文字（不畫柱、沒有「其他」柱，X38）；高＝（柱數＋1）× row16", () => {
    const html = render(true);
    expect(testIdsOf(html)).toEqual(PARETO.map(item => `${PARETO_PREFIX}${item.key}`));
    expect(openTag(html, "data-block=")).toContain('data-direction="left"');
    for (const item of PARETO) expect(openTag(html, `data-testid="${PARETO_PREFIX}${item.key}"`)).toContain(`fill="${chartColors.unfavorable}"`);
    const more = element(html, 'class="ranked-more"')!;
    expect(textOf(more)).toBe(MORE);
    expect(more).toContain(`y="${PARETO.length * chartRowHeights.row16 + 12}"`);
    expect(count(html, /<rect\b/g)).toBe(PARETO.length);
    expect(openTag(html, 'class="chart-ranked-bars"')).toContain(`height="${(PARETO.length + 1) * chartRowHeights.row16}"`);
  });
});

describe("RankedBars 放進 ChartFrame（h4、資料表）：chart-lint 的 SSR 規則", () => {
  // CHART_CATALOG G13 寫 id="products-variance"、page="products"：ChartFrame 的預設 testid 是 chart-{page}-{id}＝chart-products-products-variance（CL-2 不合規），
  // 所以要明確傳 testId="chart-products-variance"（id 保留 products-variance，標題 id 不與 G15 的 scenarios-variance 撞名）。
  it("CL-1（有資料表）、CL-2（testid 命名）、CL-9、CL-11（柱在 aria-hidden 內）都是 0；chartTestIds 收到區塊與每根柱", () => {
    const html = renderToStaticMarkup(createElement(ChartFrame, {
      id: "products-variance", testId: "chart-products-variance", headingLevel: 4, title: labels.overview.sections.bridge, subtitle: labels.overview.page.bridgeNote, height: "sm",
      dataTable: { summary: "s", content: createElement("table", { "data-testid": "chart-products-variance-table" }) },
    }, createElement(RankedBars<Evidence>, { mode: "variance", blocks: BLOCKS, testIdPrefix: VARIANCE_PREFIX })));
    const result = checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "products" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(result.violations[rule], rule).toEqual([]);
    expect(result.chartTestIds).toEqual(["chart-products-variance", ...[...DECREASE, ...INCREASE].map(item => `${VARIANCE_PREFIX}${item.key}`), "chart-products-variance-table"]);
    expect(html).toContain('<h4 id="products-variance-title">');
    // 圖高（5 列 × 16＝80）在固定高容器（sm 180）之內；容器 aria-hidden，圖內沒有 Tab 停留點。
    expect(openTag(html, 'class="chart-frame ')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    expect(element(html, 'class="chart-frame ')).not.toMatch(/tabindex|<button|<a\b/i);
  });
});

describe("RankedBars：點擊（柱與整列熱區都把同一個 evidence 交給 onBarClick；鍵盤經資料表）", () => {
  const geometry = hbarGeometry(BLOCKS, RANKED_SSR_WIDTH, "variance");

  it("點柱：onBarClick(row.evidence, row)，evidence 是同一個物件（與資料表 number-link 同一個 builder 的結果）；柱帶 is-clickable", () => {
    const onBarClick = vi.fn();
    const tree = RankedBarsView({ geometry, testIdPrefix: VARIANCE_PREFIX, onBarClick });
    for (const item of [...DECREASE, ...INCREASE]) {
      const [bar] = findAll(tree, node => node.props["data-testid"] === `${VARIANCE_PREFIX}${item.key}`);
      expect(hasClass(bar, "is-clickable")).toBe(true);
      (bar.props.onClick as () => void)();
      expect(onBarClick).toHaveBeenLastCalledWith(item.evidence, item);
      expect(onBarClick.mock.lastCall![0]).toBe(item.evidence);
    }
    expect(onBarClick).toHaveBeenCalledTimes(DECREASE.length + INCREASE.length);
  });

  it("整列透明熱區（在最底層、與列同高、跨整個主圖寬）：每列一個，點它開同一列的 evidence；熱區沒有 testid、不可聚焦", () => {
    const onBarClick = vi.fn();
    const tree = RankedBarsView({ geometry, testIdPrefix: VARIANCE_PREFIX, onBarClick });
    const hits = findAll(tree, node => hasClass(node, "ranked-hit"));
    expect(hits).toHaveLength(DECREASE.length + INCREASE.length);
    expect(hits.map(hit => [hit.props.x, hit.props.y, hit.props.width, hit.props.height, hit.props.fill, hit.props["data-testid"], hit.props.tabIndex])).toEqual(
      [0, 1, 2, 3, 4].map(index => [0, index * chartRowHeights.row16, RANKED_SSR_WIDTH, chartRowHeights.row16, "transparent", undefined, undefined]),
    );
    (hits[3].props.onClick as () => void)();
    expect(onBarClick).toHaveBeenCalledWith(INCREASE[0].evidence, INCREASE[0]);
    // 熱區在所有段之前輸出（SVG 後畫的在上層），柱仍可直接點到。
    const html = renderToStaticMarkup(tree);
    expect(html.indexOf("ranked-hit")).toBeLessThan(html.indexOf("ranked-block"));
    expect(html).not.toMatch(/tabindex|<button|<a\b/i);
  });

  it("沒有 onBarClick：柱沒有 onClick、沒有熱區", () => {
    const tree = RankedBarsView({ geometry, testIdPrefix: VARIANCE_PREFIX });
    expect(findAll(tree, node => hasClass(node, "ranked-hit"))).toEqual([]);
    for (const bar of findAll(tree, node => hasClass(node, "ranked-bar"))) expect(bar.props.onClick).toBeUndefined();
  });

  it("row.testId 優先於前綴；沒有前綴也沒有 testId 時不輸出 data-testid", () => {
    const custom = hbarGeometry([{ ...DECREASE[0], testId: "chart-products-variance-bar-custom" }, DECREASE[1]], RANKED_SSR_WIDTH, "variance");
    const html = renderToStaticMarkup(RankedBarsView({ geometry: custom }));
    expect(testIdsOf(html)).toEqual(["chart-products-variance-bar-custom"]);
    expect(byTestId(html, "chart-products-variance-bar-custom")).toContain(`fill="${chartColors.unfavorable}"`);
  });
});

describe("原始碼與樣式護欄（CL-2 到 CL-8、CL-10；design-lint）", () => {
  it("ranked-bars.tsx：AST 規則 0 違規；沒有 `var(--chart-` 字串常值、色碼、中文字串或 JSX 中文、fontSize 常值", () => {
    const file = "src/components/charts/ranked-bars.tsx";
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

  it("globals.css「V4-4 B」錨點只用 token：沒有色碼、圓角、陰影；字級只有 --text-12、--text-16；≤ 767px 隱藏 is-narrow-hidden 的累計欄", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V4-4 B：");
    const end = css.indexOf("/* ── V4-4 B 錨點結束 ── */");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    const scan = scanCssText(block, "globals.css#V4-4-B");
    expect(scan.hex).toEqual([]);
    expect(scan.borderRadius).toEqual([]);
    expect(scan.boxShadow).toEqual([]);
    expect([...new Set((scan.fontSize as { value: string }[]).map(item => item.value))].sort()).toEqual(["var(--text-12)", "var(--text-16)"]);
    expect(block).toMatch(/@media \(max-width: 767px\) \{\s*\.chart-ranked-extra\.is-narrow-hidden \{ display: none; \}\s*\}/);
    // 零線、分隔線不接指標事件（1px 柱的中心不被零線蓋住、整列熱區沒有 1px 的縫）；主圖 overflow: visible（pareto 零線在主圖右緣，不被 svg 切掉半條）。
    expect(block).toContain(".chart-ranked-bars line { pointer-events: none; }");
    expect(block).toMatch(/\.chart-ranked-bars \{[^}]*overflow: visible;/);
  });
});
