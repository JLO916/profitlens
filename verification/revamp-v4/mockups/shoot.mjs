// H5 設計稿的截圖與實測（V4-0b 第 3 項）。用 file:// 開 HTML，不起任何伺服器、不占 3100／3101 埠。
//   node verification/revamp-v4/mockups/shoot.mjs
// 產物：verification/revamp-v4/V4-0b/mockups-shots/*.png 與 measure.json（G11 格寬、每列月曆張數、formatHeatCell 文字寬、390 無橫向捲動等）。
// 頁面清單由 SHOTS 決定；代理 C2 的商品毛利兩種狀態與資料來源頁另量 G13、G14、G20、G21、G22（measureC2，對比用 scripts/contrast-check.mjs 的算法）。
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contrastRatio } from "../../../scripts/contrast-check.mjs";

const root = resolve("verification/revamp-v4/mockups");
const out = resolve(process.env.SHOTS_OUT ?? "verification/revamp-v4/V4-0b/mockups-shots");

/** 截圖清單：整頁；annotate＝勾「標示 v4 變更」與「標示新字串」後再拍。 */
const SHOTS = [
  { page: "overview", width: 1440, height: 1000, name: "overview-1440-full.png" },
  { page: "overview", width: 390, height: 844, name: "overview-390-full.png" },
  { page: "overview", width: 1440, height: 1000, name: "overview-1440-annotated.png", annotate: true },
  { page: "diagnosis", width: 1440, height: 1000, name: "diagnosis-1440-full.png" },
  { page: "diagnosis", width: 1280, height: 900, name: "diagnosis-1280-full.png" },
  { page: "diagnosis", width: 768, height: 1024, name: "diagnosis-768-full.png" },
  { page: "diagnosis", width: 390, height: 844, name: "diagnosis-390-full.png" },
  { page: "diagnosis", width: 1440, height: 1000, name: "diagnosis-1440-annotated.png", annotate: true },
  // 代理 C2：商品毛利兩種狀態、資料來源。clicks＝拍照前依序點的元素（設計稿狀態切換、篩選按鈕）；element＝只拍該元素。
  { page: "products", width: 1440, height: 1000, name: "products-1440-full.png" },
  { page: "products", width: 390, height: 844, name: "products-390-full.png" },
  { page: "products", width: 1440, height: 1000, name: "products-1440-g13-stacked.png", clicks: ["[data-switch='g13-layout'][data-value='stacked']"], element: ".product-highlights" },
  { page: "products-synthetic", width: 1440, height: 1000, name: "products-synthetic-1440-full.png" },
  { page: "products-synthetic", width: 390, height: 844, name: "products-synthetic-390-full.png" },
  { page: "products-synthetic", width: 1440, height: 1000, name: "products-synthetic-1440-annotated.png", annotate: true },
  { page: "products-synthetic", width: 1440, height: 1000, name: "products-synthetic-1440-g13-stacked.png", clicks: ["[data-switch='g13-layout'][data-value='stacked']"], element: ".product-highlights" },
  { page: "data", width: 1440, height: 1000, name: "data-1440-full.png" },
  { page: "data", width: 390, height: 844, name: "data-390-full.png" },
  { page: "data", width: 1440, height: 1000, name: "data-1440-annotated.png", annotate: true },
  { page: "data", width: 1440, height: 1000, name: "data-1440-g20-yoy.png", clicks: ["[data-switch='g20-yoy'][data-value='yoy']"], element: "[data-testid='chart-data-coverage']" },
  { page: "data", width: 390, height: 844, name: "data-390-g20-yoy.png", clicks: ["[data-switch='g20-yoy'][data-value='yoy']"], element: "[data-testid='chart-data-coverage']" },
  { page: "data", width: 1440, height: 1000, name: "data-1440-issues-filtered.png", clicks: ["[data-testid='chart-data-issues-cell-costs-MISSING_CHANNEL_COST_DAY'] button"], element: "[data-testid='data-issues']" },
  { page: "data", width: 390, height: 844, name: "data-390-issues.png", element: "[data-testid='data-issues']" },
  { page: "data", width: 1440, height: 1000, name: "data-1440-g22.png", clicks: ["[data-switch='g22'][data-value='mock']"], element: "[data-testid='data-preprocessing']" },
];
/** 實測的視窗（四尺寸）。 */
const MEASURE = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
/** 整頁截圖時把固定在視窗底的手機分頁列改放到頁尾（否則整頁圖會出現在第一屏的底部）。 */
/** 要實測的頁面（SHOTS 出現過的頁）。 */
const PAGES = [...new Set(SHOTS.map(shot => shot.page))];
const FULL_PAGE_CSS = "html, body { position: relative; } .mobile-tabbar { position: absolute !important; } .topbar, .period-bar { position: relative !important; top: auto !important; }";

const url = page => pathToFileURL(resolve(root, `${page}.html`)).href;

/** 在頁面內量測（G11 熱表、橫向捲動、圖框高、G1 拆解在 390 的順序）。 */
function measureInPage() {
  const rect = element => element ? element.getBoundingClientRect() : null;
  const scroller = document.scrollingElement;
  const result = { viewport: window.innerWidth, pageScrollWidth: scroller.scrollWidth, pageScrollsX: scroller.scrollWidth > window.innerWidth };
  const heat = document.querySelector("[data-testid='chart-diagnosis-heat'] .heat-scroll");
  if (heat) {
    const grid = heat.querySelector(".heat-grid");
    const tables = [...heat.querySelectorAll(".heat-table")];
    const tops = [...new Set(tables.map(table => Math.round(table.getBoundingClientRect().top)))];
    const firstRowCount = tables.filter(table => Math.round(table.getBoundingClientRect().top) === tops[0]).length;
    const cell = heat.querySelector(".heat-table td[data-tier]:not([data-tier='outside'])");
    const style = getComputedStyle(cell);
    const cellInner = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const links = [...heat.querySelectorAll(".heat-link")];
    const widest = links.reduce((best, link) => { const width = link.getBoundingClientRect().width; return width > best.width ? { text: link.textContent, width } : best; }, { text: "", width: 0 });
    // 「−0.45」與較長的「−10.25」各放一個量測用 span（同一個 td 的字級與字型）。
    const probe = text => { const span = document.createElement("span"); span.className = "number-link heat-link"; span.textContent = text; span.style.position = "absolute"; span.style.visibility = "hidden"; cell.appendChild(span); const width = span.getBoundingClientRect().width; span.remove(); return Math.round(width * 100) / 100; };
    result.heat = {
      frameInnerWidth: Math.round(heat.clientWidth),
      gridColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns,
      calendarsInFirstRow: firstRowCount,
      calendars: tables.length,
      tableWidths: tables.map(table => Math.round(table.getBoundingClientRect().width * 100) / 100),
      tableFitsFrame: tables.every(table => table.getBoundingClientRect().width <= heat.clientWidth + 0.5),
      heatScrollsX: heat.scrollWidth > heat.clientWidth,
      heatScrollsY: heat.scrollHeight > heat.clientHeight,
      cellWidth: Math.round(cell.getBoundingClientRect().width * 100) / 100,
      cellInnerWidth: Math.round(cellInner * 100) / 100,
      widestCellText: { text: widest.text, width: Math.round(widest.width * 100) / 100 },
      probeMinus045: probe("−0.45"),
      probeMinus1025: probe("−10.25"),
      firstCaption: tables[0]?.querySelector("caption")?.textContent ?? null,
      firstCalendarVisibleInFrame: (() => { const frame = rect(heat), first = rect(tables[0]); return !!frame && !!first && first.top >= frame.top - 0.5 && first.bottom <= frame.bottom + 0.5; })(),
      scrollNoteVisible: !!document.querySelector(".heat-scroll-note") && getComputedStyle(document.querySelector(".heat-scroll-note")).display !== "none",
    };
  }
  result.frames = [...document.querySelectorAll("section.chart-section")].map(section => {
    const frame = [...section.querySelectorAll(".chart-frame")].find(node => node.getClientRects().length > 0);
    return { testId: section.dataset.testid, frameHeight: frame ? Math.round(frame.getBoundingClientRect().height) : null, frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null };
  });
  const bridgeTable = document.querySelector("[data-testid='bridge-table']");
  const bridgeFrame = document.querySelector("[data-testid='bridge-section'] .chart-frame.waterfall");
  if (bridgeTable && bridgeFrame) {
    const visibleSvg = [...bridgeFrame.querySelectorAll("svg.waterfall-svg")].find(svg => svg.getClientRects().length > 0);
    result.bridge = {
      tableAboveWaterfall: rect(bridgeTable).top < rect(bridgeFrame).top,
      tableLeftOfWaterfall: rect(bridgeTable).left > rect(bridgeFrame).left,
      waterfallFrameWidth: Math.round(bridgeFrame.clientWidth),
      waterfallSvgWidth: visibleSvg ? Math.round(visibleSvg.getBoundingClientRect().width) : null,
      waterfallScrollsX: bridgeFrame.scrollWidth > bridgeFrame.clientWidth,
      g6Visible: [...document.querySelectorAll("[data-testid^='chart-overview-bridge-bar-']")].filter(node => node.getClientRects().length > 0).length,
      g6Mounted: document.querySelectorAll("[data-testid^='chart-overview-bridge-bar-']").length,
      g6Width: (() => { const node = [...document.querySelectorAll("[data-testid^='chart-overview-bridge-bar-']")].find(item => item.getClientRects().length > 0); return node ? Math.round(node.getBoundingClientRect().width) : null; })(),
    };
  }
  const multiples = document.querySelector("[data-testid='chart-diagnosis-rates'] .chart-frame");
  if (multiples) {
    const figures = [...multiples.querySelectorAll(".rv")].find(node => node.getClientRects().length > 0)?.querySelectorAll("figure") ?? [];
    result.rates = { frameHeight: Math.round(multiples.getBoundingClientRect().height), subchartWidth: figures[0] ? Math.round(figures[0].getBoundingClientRect().width) : null, perRow: [...new Set([...figures].map(figure => Math.round(figure.getBoundingClientRect().top)))].length === 1 ? figures.length : [...figures].filter(figure => Math.round(figure.getBoundingClientRect().top) === Math.round(figures[0].getBoundingClientRect().top)).length };
  }
  return result;
}

/** 代理 C2 的頁面：另量 G13、G14（C25）、G20（C30）、G21（C28 matrix）、G22（C24 pair）。 */
const C2_PAGES = ["products", "products-synthetic", "data"];

/**
 * 在頁面內量 G13／G14 的標籤、標值與柱（G13 含 PRD 版與建議版兩種排法、文字是否互相重疊），G20 兩種狀態（合成資料、去年同期示意）的
 * 缺列虛線框、去年同期細線、期間區帶、有列細條與檔期線（位置、寬、線寬、虛線、計算後的顏色），G21 格與 G22 成對條的顏色。
 * 顏色回傳 getComputedStyle 的 rgb()，對比由 node 端用 scripts/contrast-check.mjs 的同一套 WCAG 算法算（withContrast）。
 */
function measureC2() {
  const out = {};
  const visible = node => !!node && node.getClientRects().length > 0;
  const round = n => Math.round(n * 100) / 100;
  const box = el => { const b = el.getBBox(); return { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height, width: b.width, height: b.height }; };
  const intersects = (a, b) => a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
  const surfaceOf = el => getComputedStyle(el.closest("section.panel") ?? document.body).backgroundColor;
  const ranked = section => {
    const svg = [...section.querySelectorAll(".chart-frame svg.ranked-svg")].find(visible);
    if (!svg) return null;
    const labels = [...svg.querySelectorAll("text.chart-label")].map(box);
    const values = [...svg.querySelectorAll("text.chart-value")].map(box);
    const bars = [...svg.querySelectorAll("rect[data-testid]")].map(box);
    let overlaps = 0;
    for (const label of labels) overlaps += [...values, ...bars].filter(other => intersects(label, other)).length;
    const columns = [...svg.querySelectorAll("g[data-column]")].map(group => { const b = group.getBBox(); return { id: group.dataset.column, top: round(b.y), left: round(b.x) }; });
    const frame = section.querySelector(".chart-frame");
    const frameRect = frame.getBoundingClientRect(), svgRect = svg.getBoundingClientRect();
    return { frameWidth: Math.round(frameRect.width), frameHeight: Math.round(frameRect.height), svgWidth: round(svgRect.width), svgHeight: round(svgRect.height), bars: bars.length, maxBarPx: round(Math.max(0, ...bars.map(b => b.width))), minBarPx: round(Math.min(...bars.map(b => b.width))), labelMaxPx: round(Math.max(0, ...labels.map(b => b.width))), valueMaxPx: round(Math.max(0, ...values.map(b => b.width))), textOverlaps: overlaps, columns, svgFitsFrame: svgRect.height <= frameRect.height + 0.5 && svgRect.width <= frameRect.width + 0.5 };
  };
  const variance = document.querySelector("[data-testid='chart-products-variance']");
  if (variance) {
    out.g13 = {};
    for (const state of ["prd", "stacked"]) {
      variance.querySelector(`[data-switch='g13-layout'][data-value='${state}']`)?.click();
      out.g13[state] = ranked(variance);
    }
    variance.querySelector("[data-switch='g13-layout'][data-value='prd']")?.click();
    const worst = document.querySelector("[data-testid='product-worst'] table"), best = document.querySelector("[data-testid='product-best'] table");
    if (worst && best) out.rankTablesTopOffset = Math.round(best.getBoundingClientRect().top - worst.getBoundingClientRect().top);
  }
  const pareto = document.querySelector("[data-testid='chart-products-pareto']");
  if (pareto) out.g14 = ranked(pareto);
  if (variance) out.productWorstInPareto = !!document.querySelector("[data-testid='chart-products-pareto'] [data-testid='product-worst']");
  const coverage = document.querySelector("[data-testid='chart-data-coverage']");
  if (coverage) {
    out.g20 = {};
    for (const state of ["actual", "yoy"]) {
      coverage.querySelector(`[data-switch='g20-yoy'][data-value='${state}']`)?.click();
      const svg = [...coverage.querySelectorAll(".chart-frame svg.timeline-svg")].find(visible);
      if (!svg) continue;
      const frame = coverage.querySelector(".chart-frame");
      const surface = surfaceOf(coverage);
      const bands = [...svg.querySelectorAll("[data-kind='band']")].map(rect => ({ ...box(rect), fill: getComputedStyle(rect).fill }));
      const bandAt = x => bands.find(band => x >= band.x && x <= band.right);
      const missing = [...svg.querySelectorAll("[data-kind='missing']")].map(rect => {
        const b = box(rect), style = getComputedStyle(rect), band = bandAt(b.x + b.width / 2);
        return { testId: rect.dataset.testid, x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height), stroke: style.stroke, strokeWidth: style.strokeWidth, dasharray: style.strokeDasharray, background: band ? band.fill : surface, insideBand: !!band, dashCyclesOnTop: Math.floor(b.width / 5) };
      });
      const yoyLine = svg.querySelector("[data-kind='yoy']");
      let yoy = null;
      if (yoyLine) {
        const b = box(yoyLine), style = getComputedStyle(yoyLine);
        yoy = { x: round(b.x), y: round(b.y), width: round(b.width), stroke: style.stroke, strokeWidth: style.strokeWidth, dasharray: style.strokeDasharray, background: surface, gapToNearestMissingTop: missing.length ? round(Math.min(...missing.map(item => item.y)) - b.y) : null };
      }
      const rows = [...svg.querySelectorAll("[data-kind='rows']")];
      const events = [...svg.querySelectorAll("[data-kind='event']")].map(line => ({ width: round(box(line).width), stroke: getComputedStyle(line).stroke, strokeWidth: getComputedStyle(line).strokeWidth }));
      const texts = [...svg.querySelectorAll("text")].map(box);
      let textOverlaps = 0;
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (intersects(texts[i], texts[j])) textOverlaps++;
      const frameRect = frame.getBoundingClientRect(), svgRect = svg.getBoundingClientRect();
      out.g20[state] = {
        frameWidth: Math.round(frameRect.width), frameHeight: Math.round(frameRect.height), svgWidth: round(svgRect.width), svgHeight: round(svgRect.height),
        bands: bands.map(band => ({ x: round(band.x), width: round(band.width), fill: band.fill })), bandGap: bands.length > 1 ? round(bands[1].x - bands[0].right) : null,
        bandLabels: [...svg.querySelectorAll("text")].filter(text => ["上期", "本期"].includes(text.textContent)).map(text => text.textContent),
        missing, yoy, rowsFill: rows[0] ? getComputedStyle(rows[0]).fill : null, rowsHeight: rows[0] ? round(box(rows[0]).height) : null, events, surface, textOverlaps,
        axisLabels: [...svg.querySelectorAll(":scope > g:last-child text")].map(text => text.textContent),
      };
    }
    coverage.querySelector("[data-switch='g20-yoy'][data-value='actual']")?.click();
  }
  const matrix = document.querySelector("[data-testid='chart-data-issues']");
  if (matrix) {
    const cells = [...matrix.querySelectorAll("td[data-tier]")].filter(visible);
    out.g21 = {
      frameHeight: Math.round(matrix.querySelector(".chart-frame").getBoundingClientRect().height), tableHeight: Math.round(matrix.querySelector("table").getBoundingClientRect().height),
      listMode: getComputedStyle(matrix.querySelector("tbody tr")).display === "flex",
      cells: cells.map(cell => ({ testId: cell.dataset.testid ?? null, tier: cell.dataset.tier, text: cell.textContent, background: getComputedStyle(cell).backgroundColor, boxShadow: getComputedStyle(cell).boxShadow, color: cell.querySelector("button") ? getComputedStyle(cell.querySelector("button")).color : null, width: Math.round(cell.getBoundingClientRect().width), height: Math.round(cell.getBoundingClientRect().height) })),
      buttons: matrix.querySelectorAll("button").length, surface: surfaceOf(matrix),
    };
  }
  const pairs = [...document.querySelectorAll("[data-testid^='chart-data-preprocess-bar-']")];
  if (pairs.length) {
    const rects = pairs[0].querySelectorAll("rect");
    out.g22 = { cells: pairs.length, top: getComputedStyle(rects[0]).fill, bottom: getComputedStyle(rects[1]).fill, surface: surfaceOf(pairs[0]) };
  }
  return out;
}

/** rgb() 轉 #rrggbb，再用 scripts/contrast-check.mjs 的 contrastRatio 算 WCAG 對比（與 contrast-check 相同，取到小數 2 位無條件捨去）。 */
function hexOf(rgb) {
  const match = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return match ? `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, "0")).join("")}` : null;
}
function ratio(a, b) {
  const x = hexOf(a), y = hexOf(b);
  return x && y ? Math.floor(contrastRatio(x, y) * 100) / 100 : null;
}
function withContrast(c2) {
  for (const state of Object.values(c2.g20 ?? {})) {
    const missing = state.missing ?? [];
    state.contrast = {
      missingStrokeOnBackground: missing.map(item => ({ testId: item.testId, insideBand: item.insideBand, ratio: ratio(item.stroke, item.background) })),
      yoyOnSurface: state.yoy ? ratio(state.yoy.stroke, state.yoy.background) : null,
      yoyVsMissingStroke: state.yoy && missing[0] ? ratio(state.yoy.stroke, missing[0].stroke) : null,
      bandOnSurface: state.bands?.[0] ? ratio(state.bands[0].fill, state.surface) : null,
      rowsOnBand: state.rowsFill && state.bands?.[0] ? ratio(state.rowsFill, state.bands[0].fill) : null,
      rowsOnSurface: state.rowsFill ? ratio(state.rowsFill, state.surface) : null,
      eventOnSurface: state.events?.[0] ? ratio(state.events[0].stroke, state.surface) : null,
    };
  }
  for (const cell of c2.g21?.cells ?? []) {
    if (cell.tier === "0") continue;
    const border = (cell.boxShadow.match(/rgb\([^)]*\)/) ?? [null])[0];
    cell.contrast = { textOnCell: cell.color ? ratio(cell.color, cell.background) : null, cellOnSurface: ratio(cell.background, c2.g21.surface), borderOnCell: cell.tier === "2" && border ? ratio(border, cell.background) : null, borderOnSurface: cell.tier === "2" && border ? ratio(border, c2.g21.surface) : null };
  }
  if (c2.g22) c2.g22.contrast = { topOnSurface: ratio(c2.g22.top, c2.g22.surface), bottomOnSurface: ratio(c2.g22.bottom, c2.g22.surface), topVsBottom: ratio(c2.g22.top, c2.g22.bottom) };
  return c2;
}

async function main() {
  for (const page of PAGES) if (!existsSync(resolve(root, `${page}.html`))) throw new Error(`找不到 ${page}.html，請先跑產生器（README.md）`);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const measures = {};
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 1, locale: "zh-TW" });
      const tab = await context.newPage();
      await tab.goto(url(shot.page));
      await tab.addStyleTag({ content: FULL_PAGE_CSS });
      if (shot.annotate) await tab.evaluate(() => { document.body.classList.add("show-v4", "show-proposals"); document.querySelectorAll("[data-toggle]").forEach(input => { input.checked = true; }); });
      for (const selector of shot.clicks ?? []) await tab.locator(selector).first().click();
      if (shot.element) await tab.locator(shot.element).first().screenshot({ path: resolve(out, shot.name) });
      else await tab.screenshot({ path: resolve(out, shot.name), fullPage: true });
      await context.close();
    }
    for (const page of PAGES) {
      measures[page] = {};
      for (const viewport of MEASURE) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "zh-TW" });
        const tab = await context.newPage();
        await tab.goto(url(page));
        measures[page][viewport.width] = await tab.evaluate(measureInPage);
        if (C2_PAGES.includes(page)) measures[page][viewport.width].c2 = withContrast(await tab.evaluate(measureC2));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(out, "measure.json"), `${JSON.stringify(measures, null, 1)}\n`);
  console.log(`已寫入 ${SHOTS.length} 張截圖與 measure.json 到 ${out}`);
}

await main();
