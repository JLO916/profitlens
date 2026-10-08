import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import type { AnalyticsEvent } from "../../src/application/analytics";
import { openDetails } from "./replacement-helpers";

// V4-1 代理 E（CHART_CATALOG §1.6；06_BATCHES V4-1「同批 labels 與測試」）：v4 圖表 E2E 的共用小工具。
// 每頁一支 charts-*.spec.ts 共用；字串一律由 labels 組出、定位一律用 testid 或 class（PRD §4.7、§8.6），不寫死中文。

/** 圖表區塊（section.chart-section，data-testid＝區塊 testid；例如 bridge-section、profit-waterfall、chart-diagnosis-heat）。 */
export const chartFrame = (page: Page, testId: string) => page.getByTestId(testId);
/** 區塊內的固定高容器（.chart-frame；每張圖恰好 1 個）。 */
export const frameBox = (frame: Locator) => frame.locator(".chart-frame");

/**
 * 展開區塊的資料表 <details class="data-alternative">（已展開就不動），等 summary 之後的內容可見。回傳 details。
 * C16 在展開時記 chart_table_opened（D-V4-14），搭配 stubAnalytics 可以數事件。
 */
export async function openDataTable(frame: Locator): Promise<Locator> {
  const details = frame.locator(":scope > details.data-alternative");
  await openDetails(details);
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator(":scope > :not(summary)").first()).toBeVisible();
  return details;
}

/** B3：頁面沒有橫向捲動（document.scrollingElement.scrollWidth ≤ 視窗寬）；只允許 .chart-frame.waterfall 與 .table-scroll 內部捲動。回傳量到的 scrollWidth。 */
export async function expectNoPageScrollX(page: Page): Promise<number> {
  const width = page.viewportSize()!.width;
  const scrollWidth = await page.evaluate(() => document.scrollingElement!.scrollWidth);
  expect(scrollWidth, `頁面 scrollWidth ${scrollWidth} ≤ 視窗寬 ${width}（不橫向捲動）`).toBeLessThanOrEqual(width);
  return scrollWidth;
}

/**
 * B4：自動收集 main 內「看得到」的 .chart-frame（Playwright 的 :visible 排除 hidden 祖先內與未展開 <details> 內的框，它們沒有 bounding box；
 * 不限 .view-content，因為試算頁的工作台在 .view-content 之外，src/components/dashboard.tsx:576-577），回傳 {鍵: 高度}。
 * 鍵＝所在 section.chart-section 的 data-testid（沒有 testid 時用 id）；同一區塊有多個框時依序加「#2」「#3」。順序＝DOM 順序。
 */
export const VISIBLE_CHART_FRAMES = "main .chart-frame:visible";
export function frameHeights(page: Page): Promise<Record<string, number>> {
  return page.locator(VISIBLE_CHART_FRAMES).evaluateAll(nodes => {
    const heights: Record<string, number> = {};
    for (const node of nodes) {
      const block = node.closest("section.chart-section") ?? node.closest("[data-testid]");
      const base = block?.getAttribute("data-testid") ?? block?.id ?? "chart-frame";
      let key = base;
      for (let n = 2; key in heights; n++) key = `${base}#${n}`;
      heights[key] = Math.round(node.getBoundingClientRect().height * 10) / 10;
    }
    return heights;
  });
}

/**
 * 分析事件（D-V4-14：只記事件名）。本機與 E2E 沒有 Vercel Analytics 腳本，track() 因為沒有 window.va 而不做事（src/application/analytics.ts）；
 * 這裡比照 launch-helpers-v310.ts 的 stubPrint，在第一次 goto 之前以 addInitScript 放一個只記事件名的 window.va，不改產品的任何元素或請求。
 */
export async function stubAnalytics(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { va?: (command: string, payload?: { name?: string }) => void; __v41Events?: string[] };
    w.__v41Events = [];
    w.va = (command, payload) => { if (command === "event" && typeof payload?.name === "string") w.__v41Events!.push(payload.name); };
  });
}
/** 到目前為止記到的事件名（依序）。 */
export const analyticsEvents = (page: Page) => page.evaluate(() => [...((window as unknown as { __v41Events?: string[] }).__v41Events ?? [])]) as Promise<AnalyticsEvent[]>;
/** 某個事件名記到的次數。 */
export const analyticsCount = async (page: Page, name: AnalyticsEvent) => (await analyticsEvents(page)).filter(item => item === name).length;

// ── 總覽瀑布（G1、G2）與橋接表內嵌條（G6） ──
/** 瀑布的 Y 軸刻度文字（.wf-axis text，由上到下＝由大到小）。 */
export const waterfallTicks = (svg: Locator) => svg.locator(".wf-axis text").allTextContents();
/** 瀑布 svg：G1 有 testid bridge-waterfall；G2 的 svg 沒有 testid，以區塊 profit-waterfall 內的 svg.waterfall-svg 定位（柱另有 profit-waterfall-bar-{metric}）。 */
export const bridgeWaterfallSvg = (page: Page) => page.getByTestId("bridge-waterfall");
export const profitWaterfallSvg = (page: Page) => page.getByTestId("profit-waterfall").locator("svg.waterfall-svg");
/** 刻度文字裡的「萬」單位（labels.format.units.wan 去掉 {value} 與空白）。 */
export const WAN = labels.format.units.wan.replace("{value}", "").trim();
/** 「.0 萬」這類多餘的小數（formatAxisWan 在整萬步長時不帶小數）。 */
export const DOT_ZERO_WAN = new RegExp(`\\.0\\s*${WAN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

/** G6：chart-overview-bridge-bar-{field}（根 svg.bar-cell，在 bridge-table 的 tr[data-row={field}] > td.num 內、number-link 之前）。 */
export const bridgeBar = (page: Page, field: string) => page.getByTestId(`chart-overview-bridge-bar-${field}`);
export const bridgeBars = (page: Page) => page.getByTestId("bridge-table").locator("[data-testid^='chart-overview-bridge-bar-']");
/** 橋接表某一列（tr[data-row]；列沒有逐列 testid）與該列的 number-link。 */
export const bridgeRow = (page: Page, row: string) => page.getByTestId("bridge-table").locator(`tr[data-row='${row}']`);
export const bridgeRowLink = (page: Page, row: string) => bridgeRow(page, row).locator("button.number-link");

/** 一條 G6 的幾何與位置（隱藏時也讀得到屬性）：rect 的 x、width、fill，零線的 x，所在列、下一個兄弟元素是否為 number-link，以及 computed display 與 bounding box 寬。 */
export interface BridgeBarInfo { field: string; tone: string | null; row: string | null; beforeLink: boolean; linkClass: string; linkText: string; hasRect: boolean; x: number | null; width: number | null; fill: string | null; zeroX: number | null; display: string; boxWidth: number; ariaHidden: string | null; focusable: string | null; tabIndex: string | null }
export function bridgeBarInfo(page: Page): Promise<BridgeBarInfo[]> {
  return bridgeBars(page).evaluateAll(nodes => nodes.map(node => {
    const rect = node.querySelector("rect.bar-cell-bar");
    const zero = node.querySelector("line.bar-cell-zero");
    const link = node.nextElementSibling;
    const num = (value: string | null | undefined) => value === null || value === undefined ? null : Number(value);
    return {
      field: (node.getAttribute("data-testid") ?? "").replace("chart-overview-bridge-bar-", ""),
      tone: node.getAttribute("data-tone"),
      row: node.closest("tr")?.getAttribute("data-row") ?? null,
      beforeLink: !!link && link.matches("button.number-link") && node.parentElement === link.parentElement && node.parentElement!.matches("td.num"),
      linkClass: link?.getAttribute("class") ?? "",
      linkText: (link?.textContent ?? "").trim(),
      hasRect: rect !== null,
      x: num(rect?.getAttribute("x")), width: num(rect?.getAttribute("width")), fill: rect?.getAttribute("fill") ?? null,
      zeroX: num(zero?.getAttribute("x1")),
      display: getComputedStyle(node).display,
      boxWidth: Math.round(node.getBoundingClientRect().width * 10) / 10,
      ariaHidden: node.getAttribute("aria-hidden"), focusable: node.getAttribute("focusable"), tabIndex: node.getAttribute("tabindex"),
    };
  }));
}

/** 顯示用的帶號金額（L3：「+3,161,970.00」「−1,575,080.55」）轉成數值；只用來比大小，不用於金額斷言。 */
export function signedAmount(text: string): number {
  const match = /([+−-]?)([\d,]+(?:\.\d+)?)/.exec(text);
  if (!match) return Number.NaN;
  const value = Number(match[2].replace(/,/g, ""));
  return match[1] === "−" || match[1] === "-" ? -value : value;
}
