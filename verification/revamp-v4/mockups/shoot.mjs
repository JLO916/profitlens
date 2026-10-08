// H5 設計稿的截圖與實測（V4-0b 第 3 項）。用 file:// 開 HTML，不起任何伺服器、不占 3100／3101 埠。
//   node verification/revamp-v4/mockups/shoot.mjs
// 產物：verification/revamp-v4/V4-0b/mockups-shots/*.png 與 measure.json（G11 格寬、每列月曆張數、formatHeatCell 文字寬、390 無橫向捲動等）。
// 頁面清單由 SHOTS 決定（代理 C2 產出商品與資料來源頁後，在 SHOTS 加列即可，實測也會跟著跑）。
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
      await tab.screenshot({ path: resolve(out, shot.name), fullPage: true });
      await context.close();
    }
    for (const page of PAGES) {
      measures[page] = {};
      for (const viewport of MEASURE) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "zh-TW" });
        const tab = await context.newPage();
        await tab.goto(url(page));
        measures[page][viewport.width] = await tab.evaluate(measureInPage);
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
