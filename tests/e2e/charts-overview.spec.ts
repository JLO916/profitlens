// V4-1 代理 E（06_BATCHES V4-1「驗收重點」的瀏覽器部分；CHART_CATALOG G1、G2、G6 的 E2E 草案；PRD §2.2 B3、B4、§4.4–4.7、§7.2、§8.7）：
// 總覽 G1 貢獻變化拆解瀑布、G2 本期利潤結構瀑布（搬進 C16 ChartFrame、兩張同尺度）與 G6 橋接表內嵌變異條（D-V4-33＝B：只在 ≤ 767px 顯示）。
// 四個視窗都跑（1440×1000、1280×900、768×1024、390×844）；示範資料（fixtures/demo）。字串一律由 labels 組出、定位用 testid（PRD §4.7）。
// CHART_CATALOG G1 的草案寫「.chart-frame.waterfall toHaveAttribute aria-hidden true」，已被 06 V4-1 的 390 鍵盤修正取代：
// 外框不帶 aria-hidden、改 role=region＋aria-label（比框寬時 tabIndex=0），svg 本身 aria-hidden（代理 A 交接）。
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors } from "../../src/application/chart-theme";
import { MINUS, formatAmountL3, metricDefinitions } from "../../src/application/presentation";
import { AMOUNT_FIELDS } from "../../src/domain/types";
import { evidenceDrawer, loadDemo } from "./launch-helpers-v310";
import { choosePreset, closeDetails, isMobile } from "./replacement-helpers";
import { DOT_ZERO_WAN, WAN, analyticsCount, analyticsEvents, bridgeBar, bridgeBarInfo, bridgeBars, bridgeRowLink, bridgeWaterfallSvg, chartFrame, expectNoPageScrollX, frameBox, frameHeights, openDataTable, profitWaterfallSvg, signedAmount, stubAnalytics, waterfallTicks } from "./chart-helpers-v4";

/** 抽屜標題（h2 可及名稱）：「{title} · 計算與來源」（evidence-drawer.tsx 的 sr-only 後綴）。 */
const drawerTitle = (title: string) => `${title} · ${labels.evidence.sections.evidence}`;
const drawerHeading = (page: Page) => evidenceDrawer(page).getByRole("heading", { level: 2 });
const preciseValue = (page: Page) => evidenceDrawer(page).getByTestId("evidence-precise-value");
/** 兩張瀑布：區塊 testid 與外框 region 的可及名稱（shell.chartsV4.common.chartRegion＋區塊標準名稱）。 */
const WATERFALLS = [
  { testId: "bridge-section", region: fill(labels.shell.chartsV4.common.chartRegion, { title: labels.overview.sections.bridge }) },
  { testId: "profit-waterfall", region: fill(labels.shell.chartsV4.common.chartRegion, { title: labels.overview.profit.section }) },
] as const;
/** 總覽可見的四個圖表框（DOM 順序）：拆解、利潤結構兩張瀑布，趨勢、各通路兩張並列圖（06 護欄表：可見數量總覽 4）。 */
const OVERVIEW_FRAMES = ["bridge-section", "profit-waterfall", "trend", "channel-mix"];
/** 示範資料的虧損通路（profitWaterfallScopes 的通路代碼；分段按鈕帶 data-scope）；本期扣廣告後貢獻 −61,169.93（CHART_CATALOG G2）。 */
const LOSS_SCOPE = "MARKETPLACE";
const LOSS_SCOPE_RESULT = "-61169.93";
const wide = (page: Page) => page.viewportSize()!.width >= 1024;

async function open(page: Page) {
  await page.goto("/");
  await loadDemo(page);
}
/** 元素的頁面座標（bounding box；找不到時測試失敗）。 */
async function boxOf(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value, "元素有 bounding box").not.toBeNull();
  return value!;
}
/** G2 分段按鈕切到某個範圍（data-scope），等 aria-pressed。 */
async function chooseProfitScope(page: Page, scope: string) {
  const button = page.getByTestId("profit-waterfall-scope").locator(`button[data-scope='${scope}']`);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test.describe("V4-1 總覽 G1、G2 圖表框", () => {
  test("各恰好 1 個 .chart-frame（lg waterfall）；外框 role=region 不帶 aria-hidden、svg aria-hidden；可見框 4 個，切期間與切 G2 範圍等高", async ({ page }, testInfo) => {
    await open(page);
    for (const { testId, region } of WATERFALLS) {
      const frame = frameBox(chartFrame(page, testId));
      await expect(frame, `${testId} 內恰好 1 個 .chart-frame`).toHaveCount(1);
      await expect(frame).toHaveClass(/(^|\s)lg(\s|$)/);
      await expect(frame).toHaveClass(/(^|\s)waterfall(\s|$)/);
      await expect(frame).not.toHaveAttribute("aria-hidden", /.*/);
      await expect(frame).toHaveAttribute("role", "region");
      await expect(frame).toHaveAttribute("aria-label", region);
      await expect(frame.locator("svg.waterfall-svg")).toHaveAttribute("aria-hidden", "true");
      await expect(frame.locator("svg.waterfall-svg [tabindex]")).toHaveCount(0);
      // 外框比瀑布窄（可水平捲動）時才是 Tab 停留點（tabindex=0）；768、390 一定捲動，1440 不捲動。
      const scroll = await frame.evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
      const scrollable = scroll.scrollWidth - scroll.clientWidth > 1;
      if (scrollable) await expect(frame).toHaveAttribute("tabindex", "0");
      else await expect(frame).not.toHaveAttribute("tabindex", /.*/);
      if (["tablet", "mobile"].includes(testInfo.project.name)) expect(scrollable, `${testId}：768、390 的瀑布比外框寬（框內水平捲動）`).toBe(true);
      if (testInfo.project.name === "desktop") expect(scrollable, `${testId}：1440 的瀑布不捲動（不多一個 Tab 停留點）`).toBe(false);
      testInfo.annotations.push({ type: `v4-1-${testId}-scroll`, description: `scrollWidth=${scroll.scrollWidth} clientWidth=${scroll.clientWidth}` });
    }
    await expect(bridgeWaterfallSvg(page)).toHaveAttribute("aria-hidden", "true");
    const before = await frameHeights(page);
    expect(Object.keys(before), "總覽可見的 .chart-frame 恰好 4 個（拆解、利潤結構、趨勢、各通路）").toEqual(OVERVIEW_FRAMES);
    expect(Object.values(before).every(height => height > 0)).toBe(true);
    expect(before["bridge-section"]).toBe(before["profit-waterfall"]);
    expect(before.trend).toBe(before["channel-mix"]);
    // 切 G2 範圍（先切到虧損通路，再切回合計）：只換圖內的柱，框高不變。
    await chooseProfitScope(page, LOSS_SCOPE);
    expect(await frameHeights(page), "G2 切到虧損通路：四個框高度不變").toEqual(before);
    await chooseProfitScope(page, "all");
    // 切期間（近 7 天）：四個框高度不變（CLS 由 revamp-r1-layout.spec 的 V3-4b charts 量）。
    await choosePreset(page, "last7");
    expect(await frameHeights(page), "近 7 天：四個框高度不變").toEqual(before);
    testInfo.annotations.push({ type: "v4-1-frame-heights", description: JSON.stringify(before) });
  });

  test("橋接表：≥ 1024 在圖右欄、≤ 1023 在圖上方（DOM 在圖之前）；390 捲到瀑布可見、框內水平捲動、頁面不橫向捲動", async ({ page }, testInfo) => {
    await open(page);
    const table = page.getByTestId("bridge-table");
    const frame = frameBox(chartFrame(page, "bridge-section"));
    const svg = bridgeWaterfallSvg(page);
    // DOM 順序：aside（橋接表）在固定高容器之前，Tab 順序＝DOM 順序（不用 CSS order）。
    expect(await table.evaluate((node, other) => !!(node.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await svg.elementHandle()), "橋接表在瀑布之前（DOM）").toBe(true);
    await expect(chartFrame(page, "bridge-section").locator(".frame-grid.has-aside > .frame-aside + .frame-main")).toHaveCount(1);
    await expect(chartFrame(page, "bridge-section").locator(".frame-aside > .bridge-table-wrap [data-testid='bridge-table']")).toHaveCount(1);
    const tableBox = await boxOf(table), frameRect = await boxOf(frame);
    if (wide(page)) {
      expect(tableBox.x, "≥ 1024：橋接表在瀑布右側").toBeGreaterThanOrEqual(frameRect.x + frameRect.width);
      expect(tableBox.y, "≥ 1024：橋接表與瀑布同一列（表頂不低於框底）").toBeLessThan(frameRect.y + frameRect.height);
      expect(Math.abs(tableBox.y - frameRect.y), "≥ 1024：表頂與框頂對齊").toBeLessThanOrEqual(2);
    } else {
      expect(tableBox.y + tableBox.height, "≤ 1023：橋接表在瀑布上方").toBeLessThanOrEqual(frameRect.y + 1);
    }
    if (testInfo.project.name === "mobile") {
      await svg.scrollIntoViewIfNeeded();
      await expect(svg).toBeVisible();
      const svgBox = await boxOf(svg);
      expect(svgBox.width, "390：瀑布寬 > 0").toBeGreaterThan(0);
      expect(svgBox.height).toBeGreaterThan(0);
      // 瀑布在框內水平捲動（最小寬 520），鍵盤：外框是 Tab 停留點，方向鍵右移捲動。
      const scroll = await frame.evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
      expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
      await frame.focus();
      await expect(frame).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => frame.evaluate(node => node.scrollLeft), { message: "方向鍵右移後外框水平捲動" }).toBeGreaterThan(0);
      await frame.evaluate(node => { node.scrollLeft = 0; });
      const profitFrame = frameBox(chartFrame(page, "profit-waterfall"));
      await profitFrame.scrollIntoViewIfNeeded();
      await expect(profitWaterfallSvg(page)).toBeVisible();
      expect((await boxOf(profitWaterfallSvg(page))).width).toBeGreaterThan(0);
    }
    const scrollWidth = await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-1-bridge-layout", description: JSON.stringify({ table: tableBox, frame: frameRect, scrollWidth }) });
  });

  test("刻度：沒有「.0 萬」；兩張瀑布刻度相同；G2 切到虧損通路時刻度含負值、終點柱在 domain 內", async ({ page }, testInfo) => {
    await stubAnalytics(page);
    await open(page);
    const bridgeTicks = await waterfallTicks(bridgeWaterfallSvg(page));
    const profitTicks = await waterfallTicks(profitWaterfallSvg(page));
    expect(bridgeTicks.length).toBeGreaterThan(1);
    expect(bridgeTicks.filter(text => DOT_ZERO_WAN.test(text)), "刻度沒有「.0 萬」").toEqual([]);
    expect(profitTicks, "兩張瀑布同尺度：刻度文字相同").toEqual(bridgeTicks);
    expect(bridgeTicks).toContain("0");
    expect(bridgeTicks.filter(text => text !== "0" && !text.endsWith(WAN)), "示範資料的刻度都以萬為單位（0 只寫 0）").toEqual([]);
    // 共同尺度含每個通路範圍的 G2 柱：虧損通路的終點柱是負值，下界延伸一個步長（D-V4-41 註記），所以合計時就有 1 個負刻度。
    expect(bridgeTicks.filter(text => text.startsWith(MINUS)), "負刻度恰好 1 個（下界只延伸一個步長）").toHaveLength(1);

    await chooseProfitScope(page, LOSS_SCOPE);
    const lossTicks = await waterfallTicks(profitWaterfallSvg(page));
    expect(lossTicks, "切範圍沿用同一個共同尺度（刻度不變、仍與 G1 相同）").toEqual(bridgeTicks);
    expect(lossTicks.some(text => text.startsWith(MINUS)), "切到虧損通路時刻度含負值").toBe(true);
    // 終點柱（扣廣告後貢獻）往零線下方畫，整根落在最低與最高的格線之間（domain 內，不被切掉）。
    const result = page.getByTestId("profit-waterfall-bar-contribution_after_marketing");
    const geometry = await result.evaluate(rect => {
      const svg = rect.closest("svg")!;
      const gridY = [...svg.querySelectorAll(".wf-grid line")].map(line => Number(line.getAttribute("y1")));
      const zero = Number(svg.querySelector("line.wf-zero")!.getAttribute("y1"));
      return { y: Number(rect.getAttribute("y")), height: Number(rect.getAttribute("height")), top: Math.min(...gridY), bottom: Math.max(...gridY), zero };
    });
    expect(geometry.y, "終點柱從零線往下畫（負值）").toBeGreaterThanOrEqual(geometry.zero - 0.5);
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.y + geometry.height, "終點柱底在最低格線之內").toBeLessThanOrEqual(geometry.bottom + 0.5);
    expect(geometry.y).toBeGreaterThanOrEqual(geometry.top - 0.5);
    // 點終點柱：抽屜是該通路本期扣廣告後貢獻（精確值到分，−61,169.93）；柱點擊記 waterfall_clicked，不記 chart_clicked。
    await result.click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.contribution_after_marketing.label));
    await expect(preciseValue(page)).toHaveText(fill(labels.format.units.yuan, { value: formatAmountL3(LOSS_SCOPE_RESULT) }));
    await page.keyboard.press("Escape");
    await expect(evidenceDrawer(page)).toHaveCount(0);
    expect(await analyticsCount(page, "waterfall_clicked")).toBe(1);
    expect(await analyticsCount(page, "chart_clicked")).toBe(0);
    testInfo.annotations.push({ type: "v4-1-ticks", description: bridgeTicks.join(" | ") }, { type: "v4-1-loss-bar", description: JSON.stringify(geometry) });
  });
});

test.describe("V4-1 總覽 G6 橋接表內嵌變異條", () => {
  test("九條掛載在差額列金額格內、number-link 之前；色依有利不利、長度依 |差額|；390 可見寬 ≤ 64，≥ 768 隱藏但掛載", async ({ page }, testInfo) => {
    await open(page);
    await expect(bridgeBars(page), "示範資料九項都有值：9 條").toHaveCount(AMOUNT_FIELDS.length);
    const info = await bridgeBarInfo(page);
    expect(info.map(item => item.field), "依九項順序，每列一條").toEqual([...AMOUNT_FIELDS]);
    for (const item of info) {
      expect(item.row, `${item.field}：在 tr[data-row=${item.field}] 內`).toBe(item.field);
      expect(item.beforeLink, `${item.field}：在 td.num 內、同列 number-link 之前`).toBe(true);
      expect([item.ariaHidden, item.focusable, item.tabIndex], `${item.field}：aria-hidden、不可聚焦`).toEqual(["true", "false", null]);
      expect(item.hasRect, `${item.field}：非 0 的差額畫條`).toBe(true);
      // 色與同列 number-link 的有利／不利相同（deltaTone）：只有不利上色，有利用灰（D-V3-7）。
      expect(item.tone === "unfavorable" ? "negative" : "positive", `${item.field}：條色語意與 number-link 相同`).toBe(item.linkClass.includes("negative") ? "negative" : "positive");
      expect(item.fill, `${item.field}：fill`).toBe(item.tone === "unfavorable" ? chartColors.unfavorable : chartColors.favorable);
      // 方向：正的差額往零線右邊、負的往左邊（零線在 viewBox 正中央）。
      const value = signedAmount(item.linkText);
      if (value > 0) expect(item.x, `${item.field}：正值從零線往右`).toBeCloseTo(item.zeroX!, 1);
      else expect(item.x! + item.width!, `${item.field}：負值從零線往左`).toBeCloseTo(item.zeroX!, 1);
    }
    // 長度依 |差額| 單調（共用一把尺）；原價收入（+3,161,970.00）最寬且滿半寬，不利條中商品成本（−1,575,080.55）最寬。
    const values = info.map(item => ({ ...item, abs: Math.abs(signedAmount(item.linkText)) }));
    for (const a of values) for (const b of values) if (a.abs > b.abs) expect(a.width!, `${a.field} 比 ${b.field} 的 |差額| 大，條不可較短`).toBeGreaterThanOrEqual(b.width!);
    const widest = values.reduce((top, item) => item.width! > top.width! ? item : top);
    expect(widest.field).toBe("gross_sales");
    expect(widest.fill).toBe(chartColors.favorable);
    expect(widest.width, "最大值滿半寬（零線到邊）").toBeCloseTo(widest.zeroX!, 1);
    expect(values.filter(item => item.field !== "gross_sales").every(item => item.width! < widest.width!)).toBe(true);
    const unfavorable = values.filter(item => item.fill === chartColors.unfavorable);
    expect(unfavorable.reduce((top, item) => item.width! > top.width! ? item : top).field).toBe("cogs_net");
    // 顯示：只在 ≤ 767px（D-V4-33＝B）；≥ 768 以 CSS display: none 隱藏、保持掛載（M1）。
    if (isMobile(page)) {
      for (const field of AMOUNT_FIELDS) await expect(bridgeBar(page, field)).toBeVisible();
      for (const item of await bridgeBarInfo(page)) {
        expect(item.display).not.toBe("none");
        expect(item.boxWidth, `${item.field}：390 條寬 ≤ 64`).toBeLessThanOrEqual(64);
        expect(item.boxWidth).toBeGreaterThan(0);
      }
      await expectNoPageScrollX(page);
    } else {
      for (const field of AMOUNT_FIELDS) await expect(bridgeBar(page, field)).toBeHidden();
      expect(info.map(item => item.display), "≥ 768：display: none").toEqual(AMOUNT_FIELDS.map(() => "none"));
    }
    // 總差額列與平衡檢核列沒有條。
    await expect(page.getByTestId("bridge-table").locator("tr[data-row='total'] svg.bar-cell, [data-testid='bridge-balance-check'] svg.bar-cell")).toHaveCount(0);
    testInfo.annotations.push({ type: "v4-1-g6", description: JSON.stringify(info.map(({ field, tone, width, fill: color, display, boxWidth }) => ({ field, tone, width, fill: color, display, boxWidth }))) });
  });

  test("390：點條與點同列 number-link 開同一個抽屜（標題、精確值相同）；點條記 chart_clicked、點 number-link 不記", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "G6 只在 ≤ 767px 顯示（D-V4-33＝B），≥ 768 的條不可見、不可點");
    await stubAnalytics(page);
    await open(page);
    for (const field of ["cogs_net", "gross_sales"] as const) {
      const title = drawerTitle(fill(labels.overview.page.bridgeRowTitle, { metric: metricDefinitions[field].label }));
      const link = bridgeRowLink(page, field);
      await link.click();
      await expect(drawerHeading(page)).toHaveText(title);
      const precise = (await preciseValue(page).textContent())!.trim();
      await page.keyboard.press("Escape");
      await expect(evidenceDrawer(page)).toHaveCount(0);
      await expect(link).toBeFocused();
      const clicked = await analyticsCount(page, "chart_clicked");
      await bridgeBar(page, field).click();
      await expect(drawerHeading(page)).toHaveText(title);
      await expect(preciseValue(page)).toHaveText(precise);
      await page.keyboard.press("Escape");
      await expect(evidenceDrawer(page)).toHaveCount(0);
      expect(await analyticsCount(page, "chart_clicked"), `${field}：點條記 chart_clicked 一次`).toBe(clicked + 1);
      testInfo.annotations.push({ type: `v4-1-g6-drawer-${field}`, description: precise });
    }
    expect((await analyticsEvents(page)).filter(name => name === "chart_clicked")).toHaveLength(2);
  });

  test("分析事件：展開圖的資料表記 chart_table_opened（收合不記）；瀑布柱記 waterfall_clicked、不記 chart_clicked", async ({ page }) => {
    await stubAnalytics(page);
    await open(page);
    expect(await analyticsCount(page, "chart_table_opened")).toBe(0);
    const bridge = chartFrame(page, "bridge-section");
    const details = await openDataTable(bridge);
    expect(await analyticsCount(page, "chart_table_opened"), "展開拆解的資料表").toBe(1);
    await closeDetails(details);
    await expect(details).not.toHaveAttribute("open", /.*/);
    expect(await analyticsCount(page, "chart_table_opened"), "收合不記").toBe(1);
    await openDataTable(chartFrame(page, "profit-waterfall"));
    expect(await analyticsCount(page, "chart_table_opened"), "展開利潤結構的資料表").toBe(2);
    // 瀑布柱：第 2 根是九項的第一項（原價收入）；與橋接表同列開同一個抽屜（revamp-r1-layout.spec 的 V3-4b charts 另測精確值）。
    await bridgeWaterfallSvg(page).locator("rect.wf-bar").nth(1).click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(labels.overview.page.bridgeRowTitle, { metric: metricDefinitions[AMOUNT_FIELDS[0]].label })));
    await page.keyboard.press("Escape");
    await expect(evidenceDrawer(page)).toHaveCount(0);
    expect(await analyticsCount(page, "waterfall_clicked")).toBe(1);
    expect(await analyticsCount(page, "chart_clicked")).toBe(0);
  });
});
