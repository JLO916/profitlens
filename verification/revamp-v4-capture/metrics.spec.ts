import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { FIXED_NOW, SEVEN_PAGES, calculateKeepPreset, loadDemo, navigateTo, type SevenPage } from "./shared";

// V4-0a 第 9 項：PRD §2.2 B 的 v3.0.0 基準量測（metrics.spec v4；量法沿用 verification/revamp-v3-capture/metrics.spec.ts）。
// 寫入 verification/revamp-v4/${CAPTURE_BATCH}/metrics.json（Lighthouse 腳本也合併寫同一個檔的 lighthouse 鍵）與 first-load-modules.json。
// 量測狀態（PRD §2.2 B）：新訪客、示範資料 ready、拒絕本機保存提示後。
// 硬斷言（V4-0a 起每批）：
//   B2 首屏：1440 一句話頂 ≤ 192、KPI 帶底 ≤ 420、三件事首列底 ≤ 561；1280 KPI 帶底 ≤ 420；390 扣廣告後貢獻值頂 ≤ 295。
//      1280 的一句話頂與三件事首列底 v3 沒有量過，V4-0a 只量不斷言；V4-1 起以 V4-0a 實測（192、583）為門檻斷言（06_BATCHES 護欄表 B2）。
//      V4-8a（D-V3-35＝A：期間列下的去年同期理由改成按了才顯示，內容上移 24px）起改以 V4-8a 實測（168、559）為門檻（只能更早；≤ 192、≤ 420、≤ 561、≤ 295 這類絕對預算不動）。
//   B3 七頁在 390 寬 document.scrollingElement.scrollWidth ≤ 390（頁面不橫向捲動；.chart-frame.waterfall 與 .table-scroll 內部捲動不影響這個值）。
//   B5 First Load JS gzip ≤ 545,397 bytes（v3.0.0 的 519,426 × 1.05，D-V4-24）；首載 chunk 中 Treemap、Sankey、Funnel、PieChart、RadarChart 字串出現 0 次；
//      V4-3c 起另驗首載 chunk 不含隨頁載入的面板與匯出程式（SPLIT_SENTINELS 皆為 0），首頁腳本清單寫進 first-load-modules.json。
// V4-1 起硬斷言（06_BATCHES 護欄表 B1、B9；PRD §2.2）：
//   B9 七頁（1440、1280、390）載入示範資料後的 DOM 節點數 ≤ V4-0a 基準＋1,500（B9_BASELINE，取自 verification/revamp-v4/V4-0a/metrics.json）。
//   B1 依護欄表的時程：總覽第一張 .chart-frame 頂在 1440 ≤ 900 且不晚於 V4-0a 實測 855（V4-1 起；V4-8a 起不晚於 V4-8a 實測 831）；健檢第一個 G9 內嵌條頂 ≤ 900（V4-3a 起）、
//      商品第一張 .chart-frame 頂 ≤ 900（V4-4 起）、試算 G15 頂 ≤ 方案比較表區塊頂（V4-0a）＋24（V4-5 起，剛載入與「維持現況」計算後各一）、資料來源 G20 頂 ≤ 900（V4-7a 起）由各批加進 B1_ASSERTED。
//      V4-3a 起另斷言健檢首列底不晚於 V4-0a 實測（1440、1280 為 888，390 為 985；PRD §5.2）；V4-8a 起不晚於 V4-8a 實測（1440、1280 為 864，390 仍為 985）。
// 只記錄：B1 其餘參考位置（健檢清單第一列頂、G10 區塊頂與 channel-compare 頂、試算方案比較表區塊頂、資料來源狀態列底，以及 1280、390 的總覽第一張 .chart-frame 頂）；
//   B8 各頁主層否定句數；首頁 HTML 每個 chunk 的檔名與 gzip 大小。
// 執行 desktop（1440×1000）、laptop（1280×900）、mobile（390×844）三個 project；tablet 略過。所有位置是文件座標（已捲回頂端），單位 CSS px，取到 0.1。
const batch = process.env.CAPTURE_BATCH ?? "V4-0a";
const OUT = resolve(process.env.METRICS_OUT ?? `verification/revamp-v4/${batch}/metrics.json`);
const MODULES_OUT = resolve(process.env.FIRST_LOAD_MODULES_OUT ?? `verification/revamp-v4/${batch}/first-load-modules.json`);
/** KPI 帶的五格（C1）。v3 的「KPI 帶底 419」是五格底邊的最大值（verification/revamp-v3/V3-10/metrics.json 的 kpiCardsBottom），v4 沿用同一口徑斷言，另記 kpi-band 元素本身的底。 */
const KPI_CARDS = ".kpi-band [data-testid^='kpi-']";

/**
 * PRD §2.2 B2 的門檻（CSS px）。1280 的一句話頂 192 與三件事首列底 583 是 V4-0a 實測（verification/revamp-v4/V4-0a/metrics.json 的 laptop.firstScreen），
 * V4-0a 只記錄（當時的 B2_LAPTOP_RECORDED），V4-1 起改成斷言「不晚於 V4-0a 實測」；metrics.json 的 b2.recordedOnly 因此是空物件。
 * V4-8a（06_BATCHES V4-8a 驗收重點）：這兩項「不晚於 V4-0a 實測」的門檻改以 V4-8a 實測為新基準（verification/revamp-v4/V4-8a/metrics.json 的 laptop.firstScreen：
 * 一句話頂 168、三件事首列底 559；D-V3-35 讓期間列下少一行、上移 24px）。1440 的 192、420、561，1280 的 KPI 帶底 420 與 390 的 295 是 PRD 絕對預算，不動。
 */
const B2 = {
  desktop: { snapshotSentenceTop: 192, kpiCardsBottom: 420, topThreeFirstRowBottom: 561 },
  laptop: { snapshotSentenceTop: 168, kpiCardsBottom: 420, topThreeFirstRowBottom: 559 },
  mobile: { contributionAfterMarketingValueTop: 295 },
} as const;
/**
 * B9（V4-1 起硬斷言）：V4-0a 在三個尺寸、七頁載入示範資料後量到的 DOM 節點數（verification/revamp-v4/V4-0a/metrics.json 的 {project}.pages.{page}.domNodes）。
 * 各頁 ≤ 基準＋B9_ALLOWANCE。
 */
const B9_BASELINE: Record<"desktop" | "laptop" | "mobile", Record<SevenPage, number>> = {
  desktop: { overview: 3075, diagnosis: 1324, products: 1822, scenarios: 660, actions: 688, meeting: 998, data: 1129 },
  laptop: { overview: 3099, diagnosis: 1324, products: 1822, scenarios: 660, actions: 688, meeting: 998, data: 1129 },
  mobile: { overview: 3062, diagnosis: 1324, products: 1822, scenarios: 660, actions: 688, meeting: 998, data: 1129 },
};
const B9_ALLOWANCE = 1_500;
/**
 * B1（06_BATCHES 護欄表「B1 首屏有圖（1440）」；PRD §2.2 B1）依批次加入的硬斷言：值是 b1 記錄裡的路徑與上限。
 * V4-1：總覽第一張 .chart-frame 頂 ≤ min(900, V4-0a 實測 855)。之後的批次在這裡加健檢（V4-3a）、商品（V4-4）、試算（V4-5）、資料來源（V4-7a）。
 * V4-3a：健檢第一個 G9 內嵌條頂 ≤ 900（1440）；健檢首列底不晚於 V4-0a 實測（PRD §5.2 第 2 列「首列底不晚於 V4-0 實測」，390 同；
 *   verification/revamp-v4/V4-0a/metrics.json 的 {project}.b1.diagnosis.firstRowBottom：1440 與 1280 是 888、390 是 985）。
 * V4-4：商品第一張 .chart-frame 頂 ≤ 900（1440；示範資料沒有商品毛利為負，第一張是第二格的 G13）。
 * V4-5：試算 G15 頂 ≤ V4-0a 量到的方案比較表區塊頂＋24（1440；verification/revamp-v4/V4-0a/metrics.json 的 desktop.b1.scenarios）：
 *   示範資料剛載入（方案 1 是進頁草稿、G15 空狀態）時比 scenarioCompareTop 938，「維持現況」計算後（畫面基準 07 的狀態，G15 一根柱）時比 scenarioCompareTopAfterCalculate 1,114。
 * V4-7a：資料來源 G20（chart-data-coverage，狀態一行之下）頂 ≤ 900（1440）。
 * V4-8a：「不晚於 V4-0a 實測」的三項改以 V4-8a 實測為新基準（只能更早；verification/revamp-v4/V4-8a/metrics.json 的 {project}.b1）：
 *   總覽第一張 .chart-frame 頂 855 → 831、健檢首列底 1440 與 1280 888 → 864、390 維持 985（390 不受 D-V3-35 影響）。≤ 900 的絕對預算與試算的「V4-0a＋24」不動。
 */
const B1_ASSERTED: { project: "desktop" | "laptop" | "mobile"; page: SevenPage; key: string; max: number; note: string }[] = [
  { project: "desktop", page: "overview", key: "firstChartFrameTop", max: Math.min(900, 831), note: "總覽第一張 .chart-frame 頂 ≤ 900 且不晚於 V4-8a 實測 831（V4-1 起；V4-0a 實測 855，V4-8a 起改以本批實測為新基準）" },
  { project: "desktop", page: "diagnosis", key: "firstImpactBarTop", max: 900, note: "健檢第一個 G9 內嵌條頂 ≤ 900（V4-3a 起）" },
  { project: "desktop", page: "diagnosis", key: "firstRowBottom", max: 864, note: "健檢首列底不晚於 V4-8a 實測 864（V4-3a 起；G9 條在列內、列高不變；V4-0a 實測 888，V4-8a 起改以本批實測為新基準）" },
  { project: "laptop", page: "diagnosis", key: "firstRowBottom", max: 864, note: "1280 健檢首列底不晚於 V4-8a 實測 864（V4-3a 起；V4-0a 實測 888）" },
  { project: "mobile", page: "diagnosis", key: "firstRowBottom", max: 985, note: "390 健檢首列底不晚於 V4-8a 實測 985（V4-3a 起；PRD §5.2「390 同」；與 V4-0a 實測相同）" },
  { project: "desktop", page: "products", key: "firstChartFrameTop", max: 900, note: "商品第一張 .chart-frame 頂 ≤ 900（V4-4 起；示範資料是 G13 的框）" },
  { project: "desktop", page: "scenarios", key: "g15Top", max: 938 + 24, note: "試算 G15 頂 ≤ V4-0a 方案比較表區塊頂 938＋24（V4-5 起；示範資料剛載入，G15 空狀態）" },
  { project: "desktop", page: "scenarios", key: "g15TopAfterCalculate", max: 1114 + 24, note: "試算 G15 頂 ≤ V4-0a「維持現況」計算後的方案比較表區塊頂 1,114＋24（V4-5 起；畫面基準 07 的狀態）" },
  { project: "desktop", page: "data", key: "g20Top", max: 900, note: "資料來源 G20 頂 ≤ 900（V4-7a 起；示範資料，G20 標題 title.none）" },
];
/** B3：390 寬頁面不橫向捲動。 */
const B3_MAX_SCROLL_WIDTH = 390;
/** B5（D-V4-24）。 */
const B5_GZIP_MAX = 545_397;
/** 首載 chunk 必須為 0 的符號（PRD §8.2）；另記 v3.0.0 已存在、不斷言的符號。 */
const FORBIDDEN_SYMBOLS = ["Treemap", "Sankey", "Funnel", "PieChart", "RadarChart"] as const;
const RECORDED_SYMBOLS = ["ScatterChart", "AreaChart", "Brush", "ComposedChart", "LineChart", "BarChart"] as const;
/**
 * V4-3c（D-V4-42＝A，首載瘦身）：拆成隨頁載入的面板與按下時才載入的匯出程式才有的字串（各面板根元素的 testid、SheetJS 的 book_new、pptxgenjs 的 PptxGenJS），
 * 首載 chunk 必須為 0——任何一個出現，就表示有面板或匯出程式又被靜態匯入首載（tests/lazy-panels.test.tsx 另從原始碼的模組圖檢查）。
 */
const SPLIT_SENTINELS = ['"diagnosis-panel"', '"data-status-line"', '"product-table"', '"meeting-outputs"', '"actions-workbench"', '"ai-panel"', "book_new", "PptxGenJS"] as const;

/** 七頁切過去後要等的區塊（與 tests/e2e、Lighthouse 腳本相同的 testid）。 */
const ANCHORS: Record<SevenPage, string> = {
  overview: "[data-testid='kpi-band']",
  diagnosis: "[data-testid='diagnosis-panel']",
  products: "[data-testid='product-table']",
  scenarios: "[data-testid='scenario-1']",
  actions: "[data-testid='actions-workbench']",
  meeting: "[data-testid='meeting-page']",
  data: "[data-testid='data-status-line']",
};

/** 依路徑合併寫入（Lighthouse 腳本也寫同一個檔的 lighthouse 鍵）。 */
async function record(path: string[], value: unknown) {
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(await readFile(OUT, "utf8")); } catch { json = {}; }
  let node = json;
  for (const key of path.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>;
  node[path.at(-1)!] = value;
  json._meta = { batch, note: "PRD §2.2 B 的 v3.0.0 基準與各批量測（EC ProfitLens，revamp/v4）。由 verification/revamp-v4-capture/metrics.spec.ts 與 scripts/lighthouse-pages.mjs 產生；說明見 verification/revamp-v4/V4-0-baseline.md。", clock: FIXED_NOW.toISOString(), server: "本機 production（APP_MODE=PUBLIC_DEMO、PUBLIC_DEMO=true、ENABLE_LIVE_AI=false）" };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(json, null, 2)}\n`);
}

const round = (value: number) => Math.round(value * 10) / 10;
/** 第一個符合的元素的文件座標（已含捲動量）。找不到時回傳 null（只記錄的項目用）。 */
async function boxOrNull(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  if (!(await locator.count())) return null;
  const rect = await locator.evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, height: r.height }; });
  return { top: round(rect.top), bottom: round(rect.bottom), height: round(rect.height) };
}
async function box(page: Page, selector: string) {
  const rect = await boxOrNull(page, selector);
  if (!rect) throw new Error(`${selector} 沒有 boundingBox`);
  return rect;
}

/** main 內、第一張 KPI 卡之前、可見且可聚焦的元素（元素數，不是 Tab 停駐點；type=date 的年月日分段算 1 個）。與 v3 metrics.spec 相同。 */
function focusableBeforeFirstKpi(page: Page) {
  return page.evaluate(selector => {
    const main = document.querySelector("main")!;
    const first = main.querySelector(selector)!;
    const candidates = main.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable='true']");
    const items: { tag: string; text: string }[] = [];
    for (const element of candidates) {
      if (element === main) continue;
      if (!(first.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      if ((element as HTMLButtonElement).disabled || element.tabIndex < 0 || element.closest("[inert]")) continue;
      if (element instanceof HTMLInputElement && element.type === "hidden") continue;
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const text = (element.getAttribute("aria-label") ?? element.textContent ?? (element as HTMLInputElement).value ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      items.push({ tag: element instanceof HTMLInputElement ? `input[type=${element.type}]` : element.tagName.toLowerCase(), text: text || (element as HTMLInputElement).id || "" });
    }
    return items;
  }, KPI_CARDS);
}

/** 規則卡的「注意」句（labels.rules[*].caution）不算免責樣板（與 tests/copy-density.test.ts 相同）。 */
const RULE_CAUTIONS = Object.values(labels.rules).map(rule => rule.caution.replace(/[。；]$/, ""));
/**
 * B8：main 主層（拿掉沒有 open 屬性的 <details> 與其內容，含 summary；展開的 <details> 算主層）含「不是／不代表／不等於／不可」的句子（去重）。
 * 口徑對齊 tests/copy-density.test.ts 的 disclaimerSentences（以文字節點為單位，再以句號、分號、換行切句；去掉句首到「注意」加冒號為止的前綴；規則卡注意句不算），
 * 差別：這裡是瀏覽器裡的示範資料畫面（copy-density 是 SSR 的 golden），而且只算畫面上渲染的文字（checkVisibility：不算 hidden 的其他頁與
 * display:none 的另一種尺寸版面；main 內常駐的期間列算進每一頁）。數字只當參考基準。
 */
function mainLayerNegations(page: Page) {
  return page.evaluate(cautions => {
    const skip = new Set(cautions);
    const main = document.querySelector("main");
    if (!main) return [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest("script, style, template, details:not([open])")) continue;
      if (!parent.checkVisibility({ checkVisibilityCSS: true })) continue;
      texts.push(walker.currentNode.nodeValue ?? "");
    }
    const sentences = texts.flatMap(text => text.split(/[。；;\n]/)).map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(sentence => /不是|不代表|不等於|不可/.test(sentence));
    return [...new Set(sentences.map(sentence => sentence.replace(/^.*?注意[:：]\s*/, "")).filter(sentence => !skip.has(sentence)))];
  }, RULE_CAUTIONS);
}

/** DOM 節點數：Recharts 的 ResponsiveContainer 量到尺寸後才畫圖，連續兩次（間隔 200 ms）相同才記錄，最多等 4 秒。 */
async function stableDomCount(page: Page) {
  let previous = -1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await page.evaluate(() => document.querySelectorAll("*").length);
    if (count === previous) return count;
    previous = count;
    await page.waitForTimeout(200);
  }
  return previous;
}

async function goToPage(page: Page, id: SevenPage) {
  await navigateTo(page, id);
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav[id].headline);
  await expect(page.locator(ANCHORS[id]).first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
}

test.beforeEach(() => { test.skip(!["desktop", "laptop", "mobile"].includes(test.info().project.name), "§2.2 B 只量 1440、1280 與 390"); });

test("B2 首屏位置（1440、1280、390）與內容前控制項數", async ({ page }, testInfo) => {
  const project = testInfo.project.name as "desktop" | "laptop" | "mobile";
  await loadDemo(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const cards = await page.locator(KPI_CARDS).evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { id: element.getAttribute("data-testid"), top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY }; }));
  expect(cards).toHaveLength(5);
  const band = await box(page, "[data-testid='kpi-band']");
  const sentence = await box(page, "[data-testid='snapshot-sentence']");
  // V3-4a：三件事是警示列（.alert-list > li.alert-row），標題是列內的 h3。
  const firstRow = await box(page, "[data-testid='top-three'] .alert-list > li:first-child");
  const firstRowTitle = await box(page, "[data-testid='top-three'] .alert-list > li:first-child h3");
  const contribution = await box(page, "[data-testid='kpi-contribution_after_marketing'] .kpi-value");
  const focusable = await focusableBeforeFirstKpi(page);
  const measured = {
    snapshotSentenceTop: sentence.top,
    firstKpiTop: round(Math.min(...cards.map(card => card.top))),
    kpiCardsBottom: round(Math.max(...cards.map(card => card.bottom))),
    kpiBandTop: band.top,
    kpiBandBottom: band.bottom,
    contributionAfterMarketingValueTop: contribution.top,
    contributionAfterMarketingValueBottom: contribution.bottom,
    topThreeFirstRowTitleBottom: firstRowTitle.bottom,
    topThreeFirstRowBottom: firstRow.bottom,
  };
  const thresholds: Record<string, number> = { ...B2[project] };
  await record([project, "firstScreen"], {
    viewport: page.viewportSize(),
    ...measured,
    kpiCards: cards.map(card => ({ id: card.id, top: round(card.top), bottom: round(card.bottom) })),
    viewportHeight: page.viewportSize()!.height,
    numbersVisibleInFirstScreen: contribution.top < page.viewportSize()!.height,
    b2: { asserted: thresholds, recordedOnly: {}, kpiBandBottomNote: "KPI 帶底以五格底邊最大值（kpiCardsBottom，與 v3 基準 419 同口徑）斷言；kpiBandBottom 是 kpi-band 元素本身的底，只記錄" },
  });
  await record([project, "focusableBeforeFirstKpi"], { count: focusable.length, method: "main 內、文件順序在第一張 KPI 卡之前、checkVisibility 可見、未 disabled、tabIndex ≥ 0、大於 1×1 px 的 a[href]／button／input／select／textarea／summary／[tabindex]；以元素計（與 v3 metrics.spec 相同）", elements: focusable });
  for (const [key, max] of Object.entries(thresholds)) expect.soft(measured[key as keyof typeof measured], `B2 ${project} ${key} ≤ ${max}`).toBeLessThanOrEqual(max);
});

test("七頁：B1 參考位置、B3 橫向捲動、B8 主層否定句、B9 DOM 節點數", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const project = testInfo.project.name as "desktop" | "laptop" | "mobile";
  await loadDemo(page);
  const pages: Record<string, unknown> = {};
  const scrollWidths: Record<string, number> = {};
  const b1: Record<string, unknown> = {};
  for (const id of SEVEN_PAGES) {
    await goToPage(page, id);
    const domNodes = await stableDomCount(page);
    const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, clientWidth: document.scrollingElement!.clientWidth }));
    const negations = await mainLayerNegations(page);
    scrollWidths[id] = scroll.scrollWidth;
    pages[id] = { domNodes, ...scroll, mainLayerNegations: { count: negations.length, sentences: negations } };
    if (id === "overview") b1.overview = { firstChartFrameTop: (await boxOrNull(page, "main .chart-frame:visible"))?.top ?? null };
    if (id === "diagnosis") {
      const row = await boxOrNull(page, "[data-testid^='diagnosis-row-']");
      const summary = await boxOrNull(page, "[data-testid^='diagnosis-row-'] > summary");
      b1.diagnosis = {
        firstRowTop: row?.top ?? null, firstRowBottom: row?.bottom ?? null, firstRowSummaryBottom: summary?.bottom ?? null,
        diagnosisListBottom: (await boxOrNull(page, "[data-testid='diagnosis-list']"))?.bottom ?? null,
        diagnosisPanelBottom: (await boxOrNull(page, "[data-testid='diagnosis-panel']"))?.bottom ?? null,
        g10InsertTop: (await boxOrNull(page, "[data-testid='channel-compare']"))?.top ?? null,
        firstImpactBarTop: (await boxOrNull(page, "[data-testid='diagnosis-list'] [data-testid^='chart-diagnosis-impact-bar-']"))?.top ?? null,
        shareTop: (await boxOrNull(page, "[data-testid='chart-diagnosis-share']"))?.top ?? null,
        shareFrameTop: (await boxOrNull(page, "[data-testid='chart-diagnosis-share'] .chart-frame"))?.top ?? null,
        note: "健檢清單第一列＝第一個 diagnosis-row-*（<details>，預設展開；firstRowBottom 含展開內容，firstRowSummaryBottom 是收合列本身的底）；g10InsertTop 沿用 V4-0a 的口徑＝channel-compare 的頂（V4-3a 起 G10 插在它之前，所以這個值往下移；G10 本身的頂另記 shareTop、圖框頂 shareFrameTop）；firstImpactBarTop＝第一個 G9 內嵌條（chart-diagnosis-impact-bar-*）的頂（V4-3a 起）",
      };
    }
    if (id === "products") b1.products = { firstChartFrameTop: (await boxOrNull(page, "main .chart-frame:visible"))?.top ?? null, productHighlightsTop: (await boxOrNull(page, "section.product-highlights"))?.top ?? null, note: "v3.0.0 商品頁沒有 .chart-frame；G13 插在 section.product-highlights（.pair）內" };
    if (id === "scenarios") b1.scenarios = { scenarioCompareTop: (await boxOrNull(page, "section.scenario-compare"))?.top ?? null, g15Top: (await boxOrNull(page, "[data-testid='chart-scenarios-variance']"))?.top ?? null, note: "方案比較表區塊（section.scenario-compare）頂；示範資料剛載入、方案 1 尚未計算。g15Top＝G15 方案差額區塊（chart-scenarios-variance，V4-5 起，空狀態）的頂" };
    if (id === "data") b1.data = { dataStatusLineBottom: (await boxOrNull(page, "[data-testid='data-status-line']"))?.bottom ?? null, g20Top: (await boxOrNull(page, "[data-testid='chart-data-coverage']"))?.top ?? null, g20FrameTop: (await boxOrNull(page, "[data-testid='chart-data-coverage'] .chart-frame"))?.top ?? null, dataIssuesTop: (await boxOrNull(page, "[data-testid='data-issues']"))?.top ?? null, note: "V4-7a 起 G20（chart-data-coverage）在狀態一行之下、data-issues 之上；g20Top＝區塊頂（B1 硬斷言的值），g20FrameTop＝固定高框頂" };
  }
  // 試算頁另量「維持現況」計算後的方案比較表區塊頂（G15 只在有結果時出現，V4-5 的 B1 門檻以這個狀態比較）；放在七頁量完之後，計算結果不影響其他頁的 DOM 節點數。
  await navigateTo(page, "scenarios");
  await calculateKeepPreset(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  (b1.scenarios as Record<string, unknown>).scenarioCompareTopAfterCalculate = (await boxOrNull(page, "section.scenario-compare"))?.top ?? null;
  (b1.scenarios as Record<string, unknown>).g15TopAfterCalculate = (await boxOrNull(page, "[data-testid='chart-scenarios-variance']"))?.top ?? null;
  (b1.scenarios as Record<string, unknown>).afterCalculateNote = "方案 1 套用「維持現況」範本、同意假設、計算之後（與畫面基準 07 相同的狀態）";

  await record([project, "pages"], { ...pages, method: "載入示範資料後依側欄順序切到七頁（navigateTo；手機走底部分頁列或「更多」），等 h1 與該頁區塊出現、捲回頂端；domNodes＝document.querySelectorAll('*').length（連續兩次相同才記錄）；scrollWidth／clientWidth＝document.scrollingElement；mainLayerNegations＝main 主層（拿掉收合的 <details>）含「不是／不代表／不等於／不可」的句子（去重，口徑同 tests/copy-density.test.ts）" });
  const b1Asserted = B1_ASSERTED.filter(item => item.project === project).map(item => ({ ...item, measured: ((b1[item.page] ?? {}) as Record<string, number | null>)[item.key] ?? null }));
  await record([project, "b1"], { ...b1, asserted: b1Asserted });
  const b9 = SEVEN_PAGES.map(id => ({ page: id, domNodes: (pages[id] as { domNodes: number }).domNodes, baseline: B9_BASELINE[project][id], max: B9_BASELINE[project][id] + B9_ALLOWANCE }));
  await record([project, "b9"], { allowance: B9_ALLOWANCE, pages: b9, note: "V4-1 起硬斷言：各頁 DOM 節點數 ≤ V4-0a 基準＋1,500（baseline 取自 verification/revamp-v4/V4-0a/metrics.json）" });
  if (project === "mobile") for (const id of SEVEN_PAGES) expect.soft(scrollWidths[id], `B3 ${id}：390 寬 scrollWidth ≤ ${B3_MAX_SCROLL_WIDTH}`).toBeLessThanOrEqual(B3_MAX_SCROLL_WIDTH);
  for (const item of b9) expect.soft(item.domNodes, `B9 ${project} ${item.page}：DOM 節點數 ≤ V4-0a ${item.baseline}＋${B9_ALLOWANCE}`).toBeLessThanOrEqual(item.max);
  for (const item of b1Asserted) {
    expect.soft(item.measured, `B1 ${project} ${item.page} ${item.key}：有量到`).not.toBeNull();
    expect.soft(item.measured ?? Number.POSITIVE_INFINITY, `B1 ${project} ${item.note}`).toBeLessThanOrEqual(item.max);
  }
});

test("B5 First Load JS（/ 的 HTML 所引用的 /_next/static 腳本）與首載 chunk 符號", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "與尺寸無關");
  const html = await (await request.get("/")).text();
  const tags = [...html.matchAll(/<script([^>]*)\ssrc="([^"]+)"([^>]*)>/g)].map(match => ({ src: match[2], nomodule: /\snoModule|\snomodule/i.test(`${match[1]} ${match[3]}`) })).filter(tag => tag.src.includes("/_next/static/"));
  const sources = [...new Map(tags.map(tag => [tag.src, tag])).values()];
  expect(sources.length).toBeGreaterThan(0);
  const count = (text: string, symbol: string) => text.split(symbol).length - 1;
  const files: { src: string; nomodule: boolean; bytes: number; gzip: number; symbols: Record<string, number> }[] = [];
  for (const { src, nomodule } of sources) {
    const body = await (await request.get(src)).body();
    const text = body.toString("utf8");
    files.push({ src: src.replace(/^.*\/_next\//, "/_next/"), nomodule, bytes: body.length, gzip: gzipSync(body).length, symbols: Object.fromEntries([...FORBIDDEN_SYMBOLS, ...RECORDED_SYMBOLS, ...SPLIT_SENTINELS].map(symbol => [symbol, count(text, symbol)])) });
  }
  const sum = (key: "bytes" | "gzip", list = files) => list.reduce((total, file) => total + file[key], 0);
  const modern = files.filter(file => !file.nomodule);
  const symbolTotals = (list: typeof files, symbols: readonly string[]) => Object.fromEntries(symbols.map(symbol => [symbol, list.reduce((total, file) => total + file.symbols[symbol], 0)]));
  const forbidden = symbolTotals(modern, FORBIDDEN_SYMBOLS);
  const recorded = symbolTotals(modern, RECORDED_SYMBOLS);
  const split = symbolTotals(modern, SPLIT_SENTINELS);
  const method = "GET / 的 HTML 中 <script src> 指向 /_next/static/ 的檔案（去重）；主數字排除 nomodule（polyfills，現代瀏覽器不下載），allScripts 為含 nomodule 的總和；bytes＝未壓縮大小，gzip＝Node zlib gzipSync 預設等級；符號＝檔案內容中該字串出現的次數（子字串計數，含 displayName 與型別名稱）";
  await record(["firstLoadJs"], { scripts: modern.length, bytes: sum("bytes", modern), kib: round(sum("bytes", modern) / 1024), gzipBytes: sum("gzip", modern), gzipKiB: round(sum("gzip", modern) / 1024), gzipMax: B5_GZIP_MAX, forbiddenSymbols: forbidden, recordedSymbols: recorded, splitSentinels: split, nomoduleExcluded: files.filter(file => file.nomodule).map(file => ({ src: file.src, bytes: file.bytes, gzip: file.gzip })), allScripts: { scripts: files.length, bytes: sum("bytes"), gzipBytes: sum("gzip") }, files: files.map(({ src, nomodule, bytes, gzip }) => ({ src, nomodule, bytes, gzip })), method });
  await mkdir(dirname(MODULES_OUT), { recursive: true });
  await writeFile(MODULES_OUT, `${JSON.stringify({ batch, generatedAt: new Date().toISOString(), note: "首頁 HTML 列出的每個 chunk 檔名與 gzip 大小（供人工比對；檔名帶雜湊，每次 build 都變，不逐一斷言）。B5 門檻只看 modern 的 gzip 總和。", method, totals: { modernScripts: modern.length, modernGzipBytes: sum("gzip", modern), gzipMax: B5_GZIP_MAX, allScripts: files.length, allGzipBytes: sum("gzip") }, forbiddenSymbols: forbidden, recordedSymbols: recorded, splitSentinels: split, chunks: files.map(file => ({ file: file.src.split("/").pop(), ...file })) }, null, 2)}\n`);
  expect.soft(sum("gzip", modern), `B5 First Load JS gzip ≤ ${B5_GZIP_MAX}`).toBeLessThanOrEqual(B5_GZIP_MAX);
  for (const symbol of FORBIDDEN_SYMBOLS) expect.soft(forbidden[symbol], `B5 首載 chunk 的 ${symbol} 必須為 0`).toBe(0);
  for (const symbol of SPLIT_SENTINELS) expect.soft(split[symbol], `V4-3c 首載 chunk 不得含隨頁載入的面板或匯出程式（${symbol} 必須為 0）`).toBe(0);
});
