import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import type { AnalyticsEvent } from "../../src/application/analytics";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../../src/application/workspace";
import { validateDataset } from "../../src/domain/validation";
import { fixture } from "../helpers/fixtures";
import { SYNTHETIC_4_CHANNEL_DIR, synthetic4ChannelInput } from "../helpers/synthetic-4-channel";
import { importViaWizard } from "./import-wizard-helpers";
import { dismissSavePrompt, navigateTo, openDetails } from "./replacement-helpers";

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

// ── 總覽 G3 趨勢、G4 各通路差額條、G5 MER bullet、G7a sparkline 與「各指標每週」（V4-2） ──
/**
 * Recharts 3 把刻度文字放在另一個圖層（g.recharts-{x|y}Axis-tick-labels），不在 .recharts-{x|y}Axis 內。
 * G3 的數值軸是 Y 軸（X 軸是週的起日），G4 的數值軸是 X 軸（Y 軸是通路名）。圖在 ResponsiveContainer 量到寬後才畫刻度，所以先等到至少 2 個刻度。
 */
export async function axisTickTexts(frame: Locator, axis: "x" | "y"): Promise<string[]> {
  const ticks = frame.locator(`.recharts-${axis}Axis-tick-labels text`);
  await expect.poll(() => ticks.count(), { message: `${axis} 軸刻度畫出來` }).toBeGreaterThan(1);
  return ticks.allTextContents();
}
/** 刻度文字（「0」「50 萬」「−5 萬」）轉成元；只用來比大小與步長，不用於金額斷言。單位由 labels.format.units.wan 組出（WAN）。 */
export function axisTickValue(text: string): number {
  const trimmed = text.trim();
  const wan = trimmed.endsWith(WAN);
  const body = (wan ? trimmed.slice(0, -WAN.length) : trimmed).trim();
  const match = /^([−-]?)(\d+(?:\.\d+)?)$/.exec(body);
  if (!match) return Number.NaN;
  const value = Number(match[2]) * (wan ? 10_000 : 1);
  return match[1] ? -value : value;
}

/** G4 各通路緊湊表（table.channel-kv，第四欄是 V4-2 的差額欄 td.channel-change）。 */
export const channelKv = (page: Page) => page.getByTestId("channel-mix").locator("table.channel-kv");
/** G4 差額條：chart-overview-channels-bar-{channel}（C24 根 svg.bar-cell，在 td.channel-change 內、差額 number-link 之前）。 */
export const channelBar = (page: Page, channel: string) => page.getByTestId(`chart-overview-channels-bar-${channel}`);
export const channelBars = (page: Page) => page.getByTestId("channel-mix").locator("[data-testid^='chart-overview-channels-bar-']");
/** 某通路差額格的 number-link（以格內的差額條定位）。 */
export const channelChangeLink = (page: Page, channel: string) => channelKv(page).locator("td.channel-change").filter({ has: channelBar(page, channel) }).locator("button.number-link");
/** 差額缺值、沒有條的通路：以列頭文字定位該列的差額格。 */
export const channelChangeCellByRow = (page: Page, rowHeader: string) => channelKv(page).locator("tbody tr").filter({ has: page.locator("th", { hasText: rowHeader }) }).locator("td.channel-change");

/** 一條 G4 差額條的屬性與位置（rect 的 fill、所在格、下一個兄弟是否為 number-link、條與 number-link 的 bounding box）。 */
export interface ChannelBarInfo { channel: string; tone: string | null; fill: string | null; inChangeCell: boolean; beforeLink: boolean; linkText: string; ariaHidden: string | null; focusable: string | null; tabIndex: string | null; box: { x: number; y: number; width: number; height: number }; linkBox: { x: number; y: number; width: number; height: number } }
export function channelBarInfo(page: Page): Promise<ChannelBarInfo[]> {
  return channelBars(page).evaluateAll(nodes => nodes.map(node => {
    const link = node.nextElementSibling;
    const rect = (element: Element | null) => { const r = element?.getBoundingClientRect(); return { x: Math.round((r?.x ?? 0) * 10) / 10, y: Math.round((r?.y ?? 0) * 10) / 10, width: Math.round((r?.width ?? 0) * 10) / 10, height: Math.round((r?.height ?? 0) * 10) / 10 }; };
    return {
      channel: (node.getAttribute("data-testid") ?? "").replace("chart-overview-channels-bar-", ""),
      tone: node.getAttribute("data-tone"),
      fill: node.querySelector("rect.bar-cell-bar")?.getAttribute("fill") ?? null,
      inChangeCell: node.parentElement?.matches("td.num.channel-change") ?? false,
      beforeLink: !!link && link.matches("button.number-link") && link.parentElement === node.parentElement,
      linkText: (link?.textContent ?? "").trim(),
      ariaHidden: node.getAttribute("aria-hidden"), focusable: node.getAttribute("focusable"), tabIndex: node.getAttribute("tabindex"),
      box: rect(node), linkBox: rect(link),
    };
  }));
}

/** G5：損益兩平 MER 段的 C18 bullet（span.kpi-bullet，aria-hidden）與它所在的一行 p.assist-breakeven-bullet。 */
export const merBullet = (page: Page) => page.getByTestId("chart-overview-bullet-bar-mer");
export const merBulletLine = (page: Page) => page.getByTestId("assist-breakeven-mer").locator("p.assist-breakeven-bullet");

/** G7a：其他常用指標區塊、sparkline、「近 {n} 週」欄頭與「各指標每週」<details>（.assist-panel 最後一個 details.data-alternative，details 沒有 testid）。 */
export const assistKpis = (page: Page) => page.getByTestId("assist-kpis");
export const assistSpark = (page: Page, id: string) => page.getByTestId(`chart-overview-assist-spark-${id}`);
export const assistSparks = (page: Page) => assistKpis(page).locator("[data-testid^='chart-overview-assist-spark-']");
export const assistSparkHeads = (page: Page) => assistKpis(page).locator("th.spark-head");
export const assistWeeksDetails = (page: Page) => assistKpis(page).locator(".assist-panel > details.data-alternative");
export const assistWeeksTable = (page: Page) => page.getByTestId("chart-overview-assist-table");
/** 其他常用指標某列的本期或上期 number-link（tr[data-testid=assist-{id}]；本期是 td.num:not(.prev)）。 */
export const assistCell = (page: Page, id: string, period: "current" | "previous") => page.getByTestId(`assist-${id}`).locator(period === "current" ? "td.num:not(.prev) button.number-link" : "td.num.prev button.number-link");

/** 抽屜技術細節（details.evidence-technical）：展開後回傳 dl 內每一行 {testId, dt, dd}（順序＝DOM 順序）。 */
export async function evidenceTechnicalRows(drawer: Locator): Promise<{ testId: string | null; dt: string; dd: string }[]> {
  const technical = drawer.locator("details.evidence-technical");
  await openDetails(technical);
  await expect(technical).toHaveAttribute("open", "");
  return technical.locator(":scope > dl > div").evaluateAll(rows => rows.map(row => ({ testId: row.getAttribute("data-testid"), dt: (row.querySelector("dt")?.textContent ?? "").trim(), dd: (row.querySelector("dd")?.textContent ?? "").trim() })));
}

/** 畫面 13 用的目標檔（三個 ALL 目標：兩格達成、一格落後）；與 verification/revamp-v4-capture 的 readTargets 讀同一個檔、同一個流程。 */
export const CAPTURE_TARGETS_CSV = resolve("verification/revamp-v4-capture/targets.csv");
/** 在資料來源頁讀入目標檔，再回總覽（等 KPI 帶）。 */
export async function readTargetsCsv(page: Page, file = CAPTURE_TARGETS_CSV) {
  await navigateTo(page, "data");
  await expect(page.getByTestId("targets-entry")).toBeVisible();
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles(file);
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("targets-issues")).toHaveCount(0);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-band")).toBeVisible();
}

/** 經四步精靈匯入 4 通路合成資料（tests/fixtures/synthetic-4-channel，D-V4-31；帶 manifest 取兩期；LIVE 有缺列，檢核結果是 partial），關掉首次保存提示。 */
export async function importSynthetic(page: Page) {
  await importViaWizard(page, SYNTHETIC_4_CHANNEL_DIR, { manifest: true, classification: "partial" });
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
  await expect(page.getByTestId("kpi-band")).toBeVisible();
}

// ── 健檢 G9 影響金額條、G10 每 100 元淨營收去向、G7b 通路寬表 sparkline 與「各通路每週」（V4-3a） ──
/**
 * 期待值用的快照（在 Node 端以 domain 與 application 的同一組函式算，不寫死數字）：示範資料（fixtures/demo）、4 通路合成資料、fixtures/refund_only。
 * 與瀏覽器載入的是同一份檔案（示範資料由「載入示範資料」、其餘經四步精靈），所以數字逐字相同。每個 worker 只算一次。
 */
const snapshotCache = new Map<string, Promise<WorkspaceSnapshot>>();
export function datasetSnapshot(name: "demo" | "synthetic" | "refund_only"): Promise<WorkspaceSnapshot> {
  if (!snapshotCache.has(name)) snapshotCache.set(name, (async () => {
    const input = name === "synthetic" ? synthetic4ChannelInput() : fixture(name);
    return createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
  })());
  return snapshotCache.get(name)!;
}

/** G9：健檢清單內所有影響金額條、某規則的條（C24 根 svg.bar-cell.impact-bar，在 diagnosis-row-{rule} 的 summary > span.diagnosis-impact 內、span.impact-amount 之後）。 */
export const impactBars = (page: Page) => page.getByTestId("diagnosis-list").locator("[data-testid^='chart-diagnosis-impact-bar-']");
export const impactBar = (page: Page, rule: string) => page.getByTestId(`chart-diagnosis-impact-bar-${rule}`);
/** 健檢清單的列（details.diagnosis-row，data-testid＝diagnosis-row-{rule}）依 DOM 順序的規則代碼。 */
export const diagnosisRuleOrder = (page: Page) => page.getByTestId("diagnosis-list").locator(":scope > li > details.diagnosis-row").evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")!.replace("diagnosis-row-", "")));

/** 一條 G9 條的屬性與位置：rect（實心或空心）、零線 x、viewBox 寬、同一格影響金額的 bounding box（文件座標）；條是否在 summary 的 span.diagnosis-impact 內、是否在金額之後。 */
export interface ImpactBarInfo { rule: string; classes: string[]; tone: string | null; x: number | null; width: number | null; fill: string | null; stroke: string | null; strokeWidth: string | null; zeroX: number | null; viewWidth: number; ariaHidden: string | null; focusable: string | null; tabIndex: string | null; inSummary: boolean; afterAmount: boolean; box: { x: number; y: number; width: number; height: number }; amountBox: { x: number; y: number; width: number; height: number } }
export function impactBarInfo(page: Page): Promise<ImpactBarInfo[]> {
  return impactBars(page).evaluateAll(nodes => nodes.map(node => {
    const rect = node.querySelector("rect.bar-cell-bar");
    const zero = node.querySelector("line.bar-cell-zero");
    const impact = node.closest(".diagnosis-impact");
    const amount = impact?.querySelector(".impact-amount") ?? null;
    const num = (value: string | null | undefined) => value === null || value === undefined ? null : Number(value);
    const box = (element: Element | null) => { const r = element?.getBoundingClientRect(); return { x: Math.round((r?.x ?? 0) * 10) / 10, y: Math.round(((r?.y ?? 0) + window.scrollY) * 10) / 10, width: Math.round((r?.width ?? 0) * 10) / 10, height: Math.round((r?.height ?? 0) * 10) / 10 }; };
    return {
      rule: (node.getAttribute("data-testid") ?? "").replace("chart-diagnosis-impact-bar-", ""),
      classes: (node.getAttribute("class") ?? "").split(/\s+/).filter(Boolean), tone: node.getAttribute("data-tone"),
      x: num(rect?.getAttribute("x")), width: num(rect?.getAttribute("width")), fill: rect?.getAttribute("fill") ?? null, stroke: rect?.getAttribute("stroke") ?? null, strokeWidth: rect?.getAttribute("stroke-width") ?? null,
      zeroX: num(zero?.getAttribute("x1")), viewWidth: Number((node.getAttribute("viewBox") ?? "0 0 0 0").split(/\s+/)[2]),
      ariaHidden: node.getAttribute("aria-hidden"), focusable: node.getAttribute("focusable"), tabIndex: node.getAttribute("tabindex"),
      inSummary: node.closest("summary") !== null && impact !== null,
      afterAmount: !!amount && !!(amount.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
      box: box(node), amountBox: box(amount),
    };
  }));
}

/** G10：區塊（ChartFrame id share）、段（chart-diagnosis-share-seg-{通路代碼或 total}-{cogs|fees|ad|remain|over}）與資料表。 */
export const shareSection = (page: Page) => page.getByTestId("chart-diagnosis-share");
export const shareSeg = (page: Page, key: string, segment: string) => page.getByTestId(`chart-diagnosis-share-seg-${key}-${segment}`);
export const shareSegs = (page: Page) => shareSection(page).locator("[data-testid^='chart-diagnosis-share-seg-']");
export const shareTable = (page: Page) => page.getByTestId("chart-diagnosis-share-table");
/** G10 資料表某一列（列頭文字＝通路顯示名或「合計」，完全相同）第 n 個資料欄（0 起算，不含列頭）的 number-link。 */
export const shareTableLink = (page: Page, rowHeader: string, column: number) => shareTable(page).locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: rowHeader, exact: true }) }).locator("td").nth(column).locator("button.number-link");
/** G10 的段 rect：屬性（x、width、fill、stroke）依 DOM 順序。 */
export function shareSegInfo(page: Page) {
  return shareSegs(page).evaluateAll(nodes => nodes.map(node => ({ id: (node.getAttribute("data-testid") ?? "").replace("chart-diagnosis-share-seg-", ""), x: Number(node.getAttribute("x")), width: Number(node.getAttribute("width")), fill: node.getAttribute("fill"), stroke: node.getAttribute("stroke") })));
}
/**
 * 圖內的段在 aria-hidden 的 svg 裡（代理 A 交接）：以 dispatchEvent("click") 觸發 React 的 onClick，不經可及性樹、不需要捲動到可點的位置。
 * 鍵盤使用者經資料表同欄的 number-link 得到同一個抽屜（PRD §2.2 C7）。
 */
export const clickChartShape = (shape: Locator) => shape.dispatchEvent("click");

/** G7b：健檢頁通路寬表（channel-compare 內的 table.channel-table-v3）、sparkline、「各通路每週」<details>（channel-compare 的直接子元素，沒有 testid）與資料表。 */
export const channelCompare = (page: Page) => page.getByTestId("channel-compare");
export const channelWideTable = (page: Page) => channelCompare(page).locator("table.channel-table-v3");
export const channelSpark = (page: Page, channel: string) => page.getByTestId(`chart-diagnosis-channels-spark-${channel}`);
export const channelSparks = (page: Page) => channelCompare(page).locator("[data-testid^='chart-diagnosis-channels-spark-']");
export const channelWeeksDetails = (page: Page) => channelCompare(page).locator(":scope > details.data-alternative");
export const channelWeeksTable = (page: Page) => page.getByTestId("chart-diagnosis-channels-table");

/** 總覽「進階」管理損益表「佔淨營收 %」格的 number-link（pnl-share-{指標}）。 */
export const pnlShare = (page: Page, metric: string) => page.getByTestId(`pnl-share-${metric}`);

// ── 健檢 G11 日 × 通路月曆熱表、G12 五項比率每週走勢（V4-3b） ──
/**
 * G11：區塊（ChartFrame id heat、mode table）、固定高框（.chart-frame.lg.heat[data-mode=table]，不設 aria-hidden）、框內的捲動區（.table-scroll[role=region]，沒有 tabindex）、
 * 熱表外層（div.heat-grid[data-layout]，click／keydown／focus 都掛在這裡）、每張月曆（table.heat-table[role=grid]）與格（td[data-testid=chart-diagnosis-heat-cell-{通路}-{ISO 日期或週起日}]，格內 button.heat-link）。
 */
export const heatSection = (page: Page) => page.getByTestId("chart-diagnosis-heat");
export const heatFrame = (page: Page) => heatSection(page).locator(".chart-frame");
export const heatScroll = (page: Page) => heatFrame(page).locator(":scope > .table-scroll");
export const heatGrid = (page: Page) => heatSection(page).locator(".heat-grid");
export const heatTables = (page: Page) => heatGrid(page).locator("table.heat-table");
export const heatCells = (page: Page) => heatSection(page).locator("[data-testid^='chart-diagnosis-heat-cell-']");
export const heatCell = (page: Page, channel: string, key: string) => page.getByTestId(`chart-diagnosis-heat-cell-${channel}-${key}`);
export const heatLink = (page: Page, channel: string, key: string) => heatCell(page, channel, key).locator("button.heat-link");
/** 熱表內 tabindex=0 的格（整張熱表恰好 1 個；roving tabindex）。 */
export const heatTabStop = (page: Page) => heatGrid(page).locator("button.heat-link[tabindex='0']");

/** 熱表每一格的屬性（依 DOM 順序）：testid、data-tier、可見文字、按鈕的 tabindex、計算後的底色與框線樣式（只讀，不改元素）。 */
export interface HeatCellInfo { testId: string; tier: string | null; text: string; tabIndex: string | null; background: string; borderStyle: string; borderColor: string; ariaHiddenAncestor: boolean }
export function heatCellInfo(page: Page): Promise<HeatCellInfo[]> {
  return heatCells(page).evaluateAll(nodes => nodes.map(node => {
    const button = node.querySelector("button.heat-link");
    const style = button ? getComputedStyle(button) : null;
    return {
      testId: node.getAttribute("data-testid") ?? "", tier: node.getAttribute("data-tier"), text: (button?.textContent ?? "").trim(), tabIndex: button?.getAttribute("tabindex") ?? null,
      background: getComputedStyle(node).backgroundColor, borderStyle: style?.borderTopStyle ?? "", borderColor: style?.borderTopColor ?? "",
      ariaHiddenAncestor: node.closest("[aria-hidden='true']") !== null,
    };
  }));
}

/** G12：<details class="chart-more rates-more">（summary「五項比率走勢」）、區塊（ChartFrame id rates）、固定高框（.chart-frame.sm.multiples，aria-hidden）、子圖與資料表。 */
export const ratesMore = (page: Page) => page.locator("details.rates-more");
export const ratesSection = (page: Page) => page.getByTestId("chart-diagnosis-rates");
export const ratesFrame = (page: Page) => ratesSection(page).locator(".chart-frame");
export const ratesPanels = (page: Page) => ratesFrame(page).locator(".multiples-grid > .multiple");
export const ratesTable = (page: Page) => page.getByTestId("chart-diagnosis-rates-table");
/** 展開「五項比率走勢」（已展開就不動），等區塊可見。 */
export async function openRates(page: Page) {
  const details = ratesMore(page);
  await openDetails(details);
  await expect(details).toHaveAttribute("open", "");
  await expect(ratesSection(page)).toBeVisible();
}
/** 每張子圖的 Y 標文字（g.multiple-axis 內 text-anchor=end 的 text；DOM 順序＝刻度由小到大）。 */
export function ratesYTicks(page: Page): Promise<{ panel: string; ticks: string[] }[]> {
  return ratesPanels(page).evaluateAll(nodes => nodes.map(node => ({ panel: node.getAttribute("data-panel") ?? "", ticks: [...node.querySelectorAll(".multiple-axis text[text-anchor='end']")].map(text => (text.textContent ?? "").trim()) })));
}
