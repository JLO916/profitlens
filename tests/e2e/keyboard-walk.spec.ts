// V3-10 上線檢查（06_BATCHES V3-10「四尺寸走查與鍵盤走查」；docs/revamp/08_RELAUNCH.md §4 第 6 條、PRD §2.3 B「內容前的可見控制項數」、§11.1 鍵盤、D-V3-27 待拍板）：七頁 Tab 步數、Esc 回焦、焦點可見、沒有焦點陷阱。
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { closeTopbarMore, openTopbarMore } from "./replacement-helpers";
import { LAUNCH_PAGES, activeStop, copy, evidenceDrawer, gotoPage, hideDevOverlay, kpiLink, loadDemo, pageName, writeLaunchJson, type FocusStop, type LaunchPage } from "./launch-helpers-v310";

/*
 * 1440（desktop）與 390（mobile）各跑一次，示範資料：
 *   A. 每頁從 main 開始按 Tab 一路走到焦點離開 main（整頁走完），記錄到「該頁第一個主要結果」的 Tab 數與經過的元素（tag＋可及名稱）。
 *      步數只記錄、不斷言（D-V3-27 試算頁 ≤ 12 步待拍板）。「到達」＝焦點落在結果區塊內，或已經越過它（結果區塊本身沒有可聚焦元素時，例如資料來源的範圍列表）。
 *   B. 斷言只放不退步的硬規則：main 內每個停留點焦點可見（:focus-visible＋outline／box-shadow，或視覺隱藏的控制由同組元素畫框，或原生日期欄位的子欄位）；
 *      沒有焦點陷阱（每按一次 Tab 都換到沒停過的元素、焦點不掉回 body、最後一定會離開 main）；
 *      Esc：抽屜回到開它的按鈕、頂欄匯出選單回到 summary、投影模式回到按鈕（只有桌機有投影按鈕）。
 *   C. PRD §11.1：總覽 → 開抽屜 → 關閉回焦 → 加入待辦 → 改狀態 → 匯出，全程只用 Tab／Shift+Tab／Enter／Esc。
 * 結果寫到 KEYBOARD_WALK_OUT（例如 verification/revamp-v3/V3-10/keyboard-walk.json，以專案名為鍵）；沒給就寫到 test-results。
 * V4-0a（06_BATCHES V4-0a 第 8 項、PRD §2.2 B6、§8.1）：通用斷言「任何 Tab 停留點都不在 [aria-hidden=true] 內」。七頁整頁走查的每一步（含離開 main 的那一步）
 *   與 C 段 tabTo 經過的每一步，都檢查焦點元素本身或祖先有沒有 aria-hidden="true"；v3.0.0 應為 0，之後每批都跑（v4 的圖容器 aria-hidden，圖內不得有可聚焦元素）。
 * V4-3b：健檢頁另記「經過 G11 熱表」的停留點數與 Tab 數（PASS_REGIONS），斷言經過熱表的 Tab 數 ≤ 3。
 * V4-4：商品頁加「第一張圖的資料表 summary」里程碑（在「最差商品」之後），「最差商品」的 Tab 數不晚於 V4-0a。
 */
/** tabTo 的上限（找單一目標）與整頁走查的上限（商品毛利頁約 390 個停留點）。 */
const MAX_TABS = 160;
const MAX_WALK = 700;
/** 各頁的「第一個主要結果」（依序記錄每一個里程碑第一次到達的步數）。 */
const MILESTONES: Record<LaunchPage, { name: string; selector: string }[]> = {
  overview: [{ name: "第一張 KPI", selector: "[data-testid='kpi-band'] [data-testid^='kpi-']" }],
  diagnosis: [{ name: "健檢第一列", selector: "[data-testid^='diagnosis-row-']" }],
  // V4-4（06_BATCHES V4-4、CHART_CATALOG G14「鍵盤」）：加「第一張圖的資料表 summary」（示範資料是 G13，有商品毛利為負時是 G14），必須在「最差商品」之後。
  products: [{ name: "最差商品（第一個結果）", selector: "[data-testid='product-worst']" }, { name: "第一張圖的資料表 summary", selector: "section.product-highlights section.chart-section > details.data-alternative > summary" }, { name: "商品表第一列", selector: "[data-testid='product-table'] tbody tr" }],
  // D-V3-27＝C（待拍板）：「記住聲明後從範本起 ≤ 12 步」——另記「範本」的步數，兩者相減即從範本到「試算」的 Tab 數（示範資料剛載入時聲明還沒勾，含聲明 checkbox 一步）。
  scenarios: [{ name: "第一個結果數字（基準）", selector: "[data-testid^='baseline-']" }, { name: "範本", selector: "[data-testid='scenario-preset']" }, { name: "「試算」按鈕", selector: `[data-testid='scenario-1'] button[data-v310-calculate]` }],
  actions: [{ name: "第一張待辦卡或新增", selector: "[data-testid^='board-card-'], [data-testid='actions-empty-add'], [data-testid='actions-add']" }],
  meeting: [{ name: "議程 1", selector: "[data-testid='meeting-agenda-1']" }],
  data: [{ name: "問題表或範圍列表", selector: "[data-testid='data-issues'], [data-testid='data-scope']" }],
};
/**
 * V4-3b（06_BATCHES V4-3b、護欄表 keyboard-walk、CHART_CATALOG G11「鍵盤」）：整頁走查時另數「經過某個區塊」的 Tab：
 * stops＝焦點落在區塊內的步數；across＝從區塊前一個停留點到區塊後一個停留點按的 Tab 數（＝區塊內最後一步 − 區塊內第一步 ＋ 2）。
 * 健檢頁 G11 熱表是 grid 型 roving tabindex（整張 1 個停留點），所以 stops 應為 1、across 應為 2；斷言 across ≤ 3。
 */
/**
 * V4-4（06_BATCHES V4-4「驗收重點」）：商品頁「最差商品」的 Tab 數不晚於 V4-0a 實測（verification/revamp-v4/V4-0a/keyboard-walk.json：1440 是 9、390 是 3），
 * 而且「第一張圖的資料表 summary」在它之後。
 */
const V4_0A_PRODUCT_WORST_TABS: Record<string, number> = { desktop: 9, mobile: 3 };
const PASS_REGIONS: Partial<Record<LaunchPage, { name: string; selector: string; maxAcross: number }[]>> = {
  diagnosis: [{ name: "熱表", selector: "[data-testid='chart-diagnosis-heat']", maxAcross: 3 }],
};
type Position = "inside" | "after" | "before" | "missing";
/** 焦點相對於第一個「看得到」的里程碑元素的位置。 */
const positionOf = (page: Page, selector: string) => page.evaluate(sel => {
  const target = [...document.querySelectorAll(sel)].find(el => (el as HTMLElement).checkVisibility?.() ?? true);
  const active = document.activeElement;
  if (!target || !active || active === document.body) return "missing";
  if (target.contains(active)) return "inside";
  return target.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING ? "after" : "before";
}, selector) as Promise<Position>;

const describe = (stop: FocusStop) => `${stop.tag}${stop.testid ? `[${stop.testid}]` : ""} ${stop.name}`.trim();
/** V4-0a：目前焦點元素本身或祖先帶 aria-hidden="true" 時，回傳最近那個祖先的描述（tag、testid、class，以及它所在、帶 testid 的區塊）；沒有就回傳 null。 */
const ariaHiddenAncestor = (page: Page) => page.evaluate(() => {
  const active = document.activeElement;
  const hidden = active && active !== document.body ? active.closest("[aria-hidden='true']") : null;
  if (!hidden) return null;
  const testid = (hidden as HTMLElement).dataset?.testid;
  const className = typeof hidden.className === "string" ? hidden.className.trim().split(/\s+/).filter(Boolean).join(".") : "";
  const block = (hidden.parentElement?.closest("[data-testid]") as HTMLElement | null)?.dataset.testid;
  return `${hidden.tagName.toLowerCase()}${testid ? `[${testid}]` : ""}${className ? `.${className}` : ""}${block ? `，所在區塊 ${block}` : ""}`;
});
/**
 * V4-0a 在 v3.0.0 實測到的既有違規（06_BATCHES 的規定：上限＝實測並逐條列出，之後只降不升；以 Playwright 專案名與頁面為鍵，內容是去掉步數的停留點描述）。
 * V4-0a 列過 390 寬總覽的 2 條：G1（bridge-section）與 G2（profit-waterfall）的瀑布外框 div.chart-frame.waterfall 帶 aria-hidden，內容比框寬而成為水平捲動容器，
 * Chromium 讓它可用 Tab 停留（keyboard-focusable scrollers），axe 的 aria-hidden-focus 不計這種隱含可聚焦的捲動容器。
 * V4-1（06_BATCHES V4-1「V4-0a 量到、併入本批的修正」）已修正：G1、G2 搬進 ChartFrame 後外框不帶 aria-hidden、改 role=region＋aria-label
 * （shell.chartsV4.common.chartRegion），比框寬時 tabIndex=0；只有 svg aria-hidden。兩列已刪除，清單現在是空的：任何頁面、任何尺寸的 aria-hidden 停留點都必須是 0。
 * 之後若再量到既有違規，依同一規定逐條列在這裡（只降不升）。
 */
const KNOWN_ARIA_HIDDEN_STOPS: Partial<Record<string, Partial<Record<LaunchPage, string[]>>>> = {};
/**
 * V4-1：總覽兩張瀑布外框（role=region）的可及名稱。390、768 寬時瀑布比外框寬，外框是合法的 Tab 停留點（不在 aria-hidden 內、方向鍵捲動）；
 * 1440 不捲動、沒有 tabIndex，不是停留點。
 */
const WATERFALL_REGIONS = [labels.overview.sections.bridge, labels.overview.profit.section].map(title => fill(labels.shell.chartsV4.common.chartRegion, { title }));
/** 總覽走查的停留點中，名稱是瀑布外框 region 的那幾個（describe＝「div 貢獻變化拆解（圖）」）。 */
const waterfallRegionStops = (walk: Walk) => WATERFALL_REGIONS.filter(region => walk.stops.some(stop => stop.replace(/^\d+\. /, "") === `div ${region}`));
/** 實測的 aria-hidden 停留點中，不在 KNOWN_ARIA_HIDDEN_STOPS 清單內（或超出清單次數）的部分。 */
function unexpectedAriaHiddenStops(project: string, id: LaunchPage, actual: string[]) {
  const remaining = [...(KNOWN_ARIA_HIDDEN_STOPS[project]?.[id] ?? [])];
  return actual.filter(stop => {
    const index = remaining.indexOf(stop.replace(/^\d+\. /, ""));
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}
async function focusMain(page: Page) {
  await page.evaluate(() => { window.scrollTo(0, 0); (document.querySelector("main") as HTMLElement | null)?.focus(); });
  return page.evaluate(() => document.activeElement?.tagName.toLowerCase() === "main");
}

interface RegionPass { name: string; stops: number; first: number | null; last: number | null; across: number | null; maxAcross: number }
interface Walk { page: LaunchPage; startedOnMain: boolean; milestones: { name: string; tabs: number | null; reachedBy: Position | null }[]; stopsInMain: number; leftMainAt: number | null; leftMainTo: string | null; stops: string[]; invisibleStops: string[]; repeatedStops: string[]; ariaHiddenStops: string[]; lostFocus: number; controlsBeforeFirstKpi?: number; regionPasses?: RegionPass[] }

/** 從 main 開始按 Tab，一路走到焦點離開 main（或掉回 body、或到上限）；途中記錄各里程碑第一次到達的步數。 */
async function walk(page: Page, id: LaunchPage): Promise<Walk> {
  await gotoPage(page, id);
  // 「試算」按鈕的可及名稱取 labels，標成屬性給選擇器用（只加在測試的瀏覽器內）。
  if (id === "scenarios") await page.getByTestId("scenario-1").getByRole("button", { name: copy.calculate, exact: true }).evaluate(el => el.setAttribute("data-v310-calculate", ""));
  const startedOnMain = await focusMain(page);
  const milestones = MILESTONES[id].map(item => ({ name: item.name, selector: item.selector, tabs: null as number | null, reachedBy: null as Position | null }));
  const passes = (PASS_REGIONS[id] ?? []).map(item => ({ ...item, stops: 0, first: null as number | null, last: null as number | null }));
  const stops: string[] = [], invisibleStops: string[] = [], repeatedStops: string[] = [], ariaHiddenStops: string[] = [];
  const seen = new Set<string>();
  let lostFocus = 0, leftMainAt: number | null = null, leftMainTo: string | null = null, previousKey = "";
  for (let tab = 1; tab <= MAX_WALK; tab++) {
    await page.keyboard.press("Tab");
    const stop = await activeStop(page);
    if (stop.isBody) {
      // 焦點到 body：上一個停留點之後的文件裡已經沒有可 Tab 的元素＝文件結尾（正常走完，焦點交給瀏覽器）；還有就是焦點中途遺失。
      const remaining = await page.evaluate(() => {
        const last = document.querySelector("[data-v310-last]");
        if (!last) return -1;
        return [...document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,summary,[tabindex]")]
          .filter(el => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.checkVisibility() && !last.contains(el) && (last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)).length;
      });
      if (remaining === 0) { leftMainAt = tab; leftMainTo = "body（文件結尾，焦點交給瀏覽器）"; }
      else { lostFocus++; stops.push(`${tab}. body（之後還有 ${remaining} 個可 Tab 的元素）`); }
      break;
    }
    // V4-0a：每個停留點（含離開 main 的那一步）都不可在 [aria-hidden=true] 內。
    const hiddenBy = await ariaHiddenAncestor(page);
    if (hiddenBy) ariaHiddenStops.push(`${tab}. ${describe(stop)}（${hiddenBy}）`);
    if (!stop.inMain) { leftMainAt = tab; leftMainTo = describe(stop); break; }
    stops.push(`${tab}. ${describe(stop)}`);
    if (!stop.focusVisible) invisibleStops.push(`${tab}. ${describe(stop)}（${stop.focusRing}）`);
    // 原生日期欄位的月／日／年／日曆按鈕是連續停在同一個 input（不算陷阱）；其他元素再次出現就是回到停過的地方。
    const consecutiveNative = stop.nativeComposite && stop.key === previousKey;
    if (seen.has(stop.key) && !consecutiveNative) repeatedStops.push(`${tab}. ${describe(stop)}`);
    seen.add(stop.key);
    previousKey = stop.key;
    // 標記目前停留點（只在測試的瀏覽器內），焦點到 body 時用來判斷是不是文件結尾。
    await page.evaluate(() => { document.querySelector("[data-v310-last]")?.removeAttribute("data-v310-last"); document.activeElement?.setAttribute("data-v310-last", ""); });
    for (const item of milestones) {
      if (item.tabs !== null) continue;
      const position = await positionOf(page, item.selector);
      if (position === "inside" || position === "after") { item.tabs = tab; item.reachedBy = position; }
    }
    for (const item of passes) {
      if (await positionOf(page, item.selector) !== "inside") continue;
      item.stops++;
      item.first ??= tab;
      item.last = tab;
    }
  }
  const result: Walk = { page: id, startedOnMain, milestones: milestones.map(({ name, tabs, reachedBy }) => ({ name, tabs, reachedBy })), stopsInMain: stops.length, leftMainAt, leftMainTo, stops, invisibleStops, repeatedStops, ariaHiddenStops, lostFocus };
  if (passes.length) result.regionPasses = passes.map(({ name, stops: count, first, last, maxAcross }) => ({ name, stops: count, first, last, across: first === null || last === null ? null : last - first + 2, maxAcross }));
  if (id === "overview") {
    // PRD §2.3 B：main 內、第一個 kpi-* 之前、可見且可聚焦的元素數（期間列計入）。
    result.controlsBeforeFirstKpi = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const firstKpi = main.querySelector("[data-testid='kpi-band'] [data-testid^='kpi-']");
      if (!firstKpi) return -1;
      return [...main.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,summary,[tabindex]")]
        .filter(el => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.checkVisibility() && (firstKpi.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) && !firstKpi.contains(el)).length;
    });
  }
  return result;
}

/** 依方向一直按 Tab（或 Shift+Tab）直到 target 取得焦點；遇到收合的 <details> 而目標在裡面時按 Enter 展開。回傳按鍵數。V4-0a：經過的停留點在 [aria-hidden=true] 內時記到 ariaHiddenStops。 */
async function tabTo(page: Page, target: Locator, direction: "forward" | "backward" = "forward", max = MAX_TABS, ariaHiddenStops?: string[]): Promise<number> {
  const handle = await target.elementHandle();
  for (let count = 1; count <= max; count++) {
    await page.keyboard.press(direction === "forward" ? "Tab" : "Shift+Tab");
    if (ariaHiddenStops) {
      const hiddenBy = await ariaHiddenAncestor(page);
      if (hiddenBy) ariaHiddenStops.push(`${direction === "forward" ? "Tab" : "Shift+Tab"} ${count}. ${describe(await activeStop(page))}（${hiddenBy}）`);
    }
    const state = await page.evaluate(el => {
      const active = document.activeElement;
      if (active === el) return "reached";
      const details = active?.tagName === "SUMMARY" ? active.parentElement : null;
      return details instanceof HTMLDetailsElement && !details.open && details.contains(el) ? "expand" : "continue";
    }, handle);
    if (state === "reached") return count;
    if (state === "expand") await page.keyboard.press("Enter");
  }
  throw new Error(`按了 ${max} 次 ${direction === "forward" ? "Tab" : "Shift+Tab"} 仍沒有到達目標`);
}

test("V3-10 鍵盤走查：七頁 Tab 步數、焦點可見、沒有焦點陷阱、Esc 回焦，以及 PRD §11.1 只用鍵盤的流程", async ({ page }, testInfo) => {
  test.skip(!["desktop", "mobile"].includes(testInfo.project.name), "鍵盤走查只跑 1440（desktop）與 390（mobile）");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
  await hideDevOverlay(page);
  await page.goto("/");
  await loadDemo(page);

  // A／B：七頁 Tab 走查。
  const walks: Walk[] = [];
  for (const id of LAUNCH_PAGES) walks.push(await walk(page, id));

  // B：Esc 行為。
  const esc: Record<string, unknown> = {};
  await gotoPage(page, "overview");
  // 1) 計算與來源抽屜：Enter 開、焦點進抽屜、Esc 關、焦點回到 KPI 數字。
  await kpiLink(page).focus();
  await page.keyboard.press("Enter");
  await expect(evidenceDrawer(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("dialog,[role=dialog]"))).toBe(true);
  const inDrawer = await activeStop(page);
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);
  await expect(kpiLink(page)).toBeFocused();
  esc.evidenceDrawer = { focusInside: describe(inDrawer), closedByEscape: true, focusReturnedTo: describe(await activeStop(page)) };
  // 2) 頂欄「匯出」選單（details）：Enter 開、Esc 關、焦點留在 summary（手機先展開「更多」）。
  await openTopbarMore(page);
  const menu = page.getByTestId("download-menu");
  const summary = menu.locator(":scope > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  esc.exportMenu = { closedByEscape: true, focusReturnedTo: describe(await activeStop(page)), topbarMoreExpanded: testInfo.project.name === "mobile" ? await page.getByTestId("topbar-more").getAttribute("aria-expanded") : null };
  if (testInfo.project.name === "mobile") {
    // 手機：選單關了以後「更多」仍展開；再按一次 Esc 只記錄結果，沒收起就點一下恢復原狀（不斷言）。
    await page.keyboard.press("Escape");
    const more = page.getByTestId("topbar-more");
    (esc.exportMenu as Record<string, unknown>).topbarMoreAfterSecondEscape = await more.getAttribute("aria-expanded");
    if (await more.getAttribute("aria-expanded") === "true") await closeTopbarMore(page);
  }
  // 3) 投影模式：Enter 進、Esc 離開、焦點回到按鈕（≤ 767px 的按鈕以 CSS 隱藏，手機不測）。
  const present = page.getByTestId("present-toggle");
  if (await present.isVisible()) {
    await present.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "present");
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).not.toHaveAttribute("data-mode", /.*/);
    await expect(present).toBeFocused();
    esc.presentMode = { enteredByEnter: true, exitedByEscape: true, focusReturnedTo: describe(await activeStop(page)) };
  } else esc.presentMode = { skipped: "投影按鈕在 ≤ 767px 以 CSS 隱藏（PRD §9.7）" };

  // C：PRD §11.1 只用鍵盤：總覽 → 開抽屜 → 關閉回焦 → 加入待辦 → 改狀態 → 匯出。
  const flow: Record<string, number | string> = {};
  const flowAriaHiddenStops: string[] = [];
  await gotoPage(page, "overview");
  await focusMain(page);
  flow.tabsToKpi = await tabTo(page, kpiLink(page), "forward", MAX_TABS, flowAriaHiddenStops);
  await page.keyboard.press("Enter");
  await expect(evidenceDrawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(kpiLink(page)).toBeFocused();
  const addToActions = page.getByTestId("top-three").getByRole("button", { name: labels.actions.buttons.addToActions, exact: true, includeHidden: true }).first();
  flow.tabsToAddAction = await tabTo(page, addToActions, "forward", MAX_TABS, flowAriaHiddenStops);
  await page.keyboard.press("Enter");
  await expect(page.locator("main h1")).toHaveText(pageName("actions"));
  const move = page.getByTestId("board-card-1-move-in_progress");
  await focusMain(page);
  flow.tabsToStatus = await tabTo(page, move, "forward", MAX_TABS, flowAriaHiddenStops);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("board-card-1-move-in_progress")).toHaveCount(0);
  flow.statusAfter = describe(await activeStop(page));
  const exportSummary = page.getByTestId("export-page-actions");
  flow.shiftTabsToExport = await tabTo(page, exportSummary, "backward", MAX_TABS, flowAriaHiddenStops);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("actions-export-menu")).toHaveAttribute("open", "");
  flow.tabsToCsv = await tabTo(page, page.getByTestId("actions-export-csv"), "forward", MAX_TABS, flowAriaHiddenStops);
  const [file] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  flow.downloaded = file.suggestedFilename();

  const ariaHiddenTotal = walks.reduce((total, item) => total + item.ariaHiddenStops.length, 0) + flowAriaHiddenStops.length;
  const knownAriaHiddenStops = KNOWN_ARIA_HIDDEN_STOPS[testInfo.project.name] ?? {};
  const result = { checked_at: new Date().toISOString(), viewport: testInfo.project.use.viewport, walks, esc, keyboardOnlyFlow: flow, flowAriaHiddenStops, ariaHiddenStopsTotal: ariaHiddenTotal, knownAriaHiddenStops, pageErrors: errors };
  const written = await writeLaunchJson("KEYBOARD_WALK_OUT", "keyboard-walk.json", testInfo, result);
  testInfo.annotations.push({ type: "keyboard-walk", description: written });

  // 硬規則（不退步）：焦點可見、沒有陷阱、焦點不掉回 body、每頁都從 main 開始而且都到達第一個主要結果。
  for (const item of walks) {
    expect(item.startedOnMain, `${item.page}：main 可以取得焦點（跳至主要內容的目標）`).toBe(true);
    expect(item.invisibleStops, `${item.page}：每個停留點都要看得到焦點`).toEqual([]);
    expect(item.repeatedStops, `${item.page}：Tab 不可回到停過的元素（焦點陷阱）`).toEqual([]);
    expect(item.lostFocus, `${item.page}：Tab 不可讓焦點掉回 body`).toBe(0);
    // V4-0a：任何 Tab 停留點都不在 [aria-hidden=true] 內；KNOWN_ARIA_HIDDEN_STOPS 逐條列出的既有違規以外，一個都不可以多。
    expect(unexpectedAriaHiddenStops(testInfo.project.name, item.page, item.ariaHiddenStops), `${item.page}：任何 Tab 停留點都不在 [aria-hidden=true] 內（V4-0a；已知既有違規見 KNOWN_ARIA_HIDDEN_STOPS）`).toEqual([]);
    expect(item.leftMainAt, `${item.page}：一路按 Tab 最後要離開 main（沒有困在頁內）`).not.toBeNull();
    for (const milestone of item.milestones) expect(milestone.tabs, `${item.page}：Tab 要能到達「${milestone.name}」`).not.toBeNull();
    // V4-3b：健檢頁經過熱表的 Tab 數 ≤ 3（整張熱表 1 個停留點；區塊內的停留點連續、至少 1 個）。
    for (const pass of item.regionPasses ?? []) {
      expect(pass.stops, `${item.page}：Tab 要經過「${pass.name}」至少一次`).toBeGreaterThanOrEqual(1);
      expect(pass.last! - pass.first! + 1, `${item.page}：「${pass.name}」內的停留點連續`).toBe(pass.stops);
      expect(pass.across, `${item.page}：經過「${pass.name}」的 Tab 數 ≤ ${pass.maxAcross}`).toBeLessThanOrEqual(pass.maxAcross);
    }
  }
  // V4-4：商品頁「最差商品」不晚於 V4-0a，「第一張圖的資料表 summary」在它之後。
  const productMilestones = walks.find(item => item.page === "products")!.milestones;
  const worstTabs = productMilestones.find(item => item.name === "最差商品（第一個結果）")!.tabs!;
  const summaryTabs = productMilestones.find(item => item.name === "第一張圖的資料表 summary")!.tabs!;
  expect(worstTabs, "V4-4：商品頁「最差商品」的 Tab 數不晚於 V4-0a").toBeLessThanOrEqual(V4_0A_PRODUCT_WORST_TABS[testInfo.project.name]);
  expect(summaryTabs, "V4-4：「第一張圖的資料表 summary」在「最差商品」之後").toBeGreaterThan(worstTabs);
  expect(flowAriaHiddenStops, "§11.1 只用鍵盤的流程：經過的 Tab 停留點都不在 [aria-hidden=true] 內（V4-0a）").toEqual([]);
  // V4-1：KNOWN_ARIA_HIDDEN_STOPS 已清空，1440 與 390 七頁走查加上 §11.1 流程的 aria-hidden 停留點合計必須是 0。
  expect(ariaHiddenTotal, "V4-1：aria-hidden 內的 Tab 停留點合計 0").toBe(0);
  // V4-1：390 總覽兩張瀑布的外框是合法停留點（region，不在 aria-hidden 內）；1440 不捲動，不是停留點。
  const overviewWalk = walks.find(item => item.page === "overview")!;
  expect(waterfallRegionStops(overviewWalk), "V4-1：瀑布外框 region 停留點").toEqual(testInfo.project.name === "mobile" ? WATERFALL_REGIONS : []);
  expect(flow.downloaded).toMatch(/\.csv$/);
  expect(errors).toEqual([]);
});

test("V4-1 鍵盤走查（768）：總覽沒有 aria-hidden 內的 Tab 停留點；兩張瀑布外框是 region 停留點", async ({ page }, testInfo) => {
  // 上面的七頁走查只跑 1440 與 390；06 V4-1 要求 768 寬一併確認瀑布外框的修正（768 的瀑布同樣比外框寬、在框內水平捲動）。
  test.skip(testInfo.project.name !== "tablet", "只跑 768（tablet）；1440 與 390 由上面的七頁走查涵蓋");
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
  await hideDevOverlay(page);
  await page.goto("/");
  await loadDemo(page);
  const overview = await walk(page, "overview");
  const written = await writeLaunchJson("KEYBOARD_WALK_OUT", "keyboard-walk.json", testInfo, { checked_at: new Date().toISOString(), viewport: testInfo.project.use.viewport, walks: [overview], ariaHiddenStopsTotal: overview.ariaHiddenStops.length, waterfallRegionStops: waterfallRegionStops(overview), pageErrors: errors, note: "V4-1：只走總覽（瀑布外框的 aria-hidden 修正在 768 的確認）" });
  testInfo.annotations.push({ type: "keyboard-walk", description: written });
  expect(overview.startedOnMain).toBe(true);
  expect(overview.ariaHiddenStops, "768 總覽：任何 Tab 停留點都不在 [aria-hidden=true] 內").toEqual([]);
  expect(waterfallRegionStops(overview), "768 總覽：兩張瀑布外框都是 region 停留點").toEqual(WATERFALL_REGIONS);
  expect(overview.invisibleStops).toEqual([]);
  expect(overview.repeatedStops).toEqual([]);
  expect(overview.lostFocus).toBe(0);
  expect(overview.leftMainAt).not.toBeNull();
  for (const milestone of overview.milestones) expect(milestone.tabs, `Tab 要能到達「${milestone.name}」`).not.toBeNull();
  expect(errors).toEqual([]);
});
