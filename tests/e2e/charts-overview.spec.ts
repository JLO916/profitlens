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
import { ASSIST_KPI_VERSION } from "../../src/application/assist-kpi";
import { ASSIST_WEEKS_VERSION } from "../../src/application/chart-assist-weeks";
import { evidenceDrawer, loadDemo } from "./launch-helpers-v310";
import { choosePreset, closeDetails, isMobile, openDetails } from "./replacement-helpers";
import { DOT_ZERO_WAN, WAN, analyticsCount, analyticsEvents, assistCell, assistKpis, assistSpark, assistSparkHeads, assistSparks, assistWeeksDetails, assistWeeksTable, axisTickTexts, axisTickValue, bridgeBar, bridgeBarInfo, bridgeBars, bridgeRowLink, bridgeWaterfallSvg, channelBar, channelBarInfo, channelBars, channelChangeCellByRow, channelChangeLink, channelKv, chartFrame, evidenceTechnicalRows, expectNoPageScrollX, frameBox, frameHeights, importSynthetic, merBullet, merBulletLine, openDataTable, profitWaterfallSvg, readTargetsCsv, signedAmount, stubAnalytics, waterfallTicks } from "./chart-helpers-v4";

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
    // <details> 的 toggle 事件是非同步派送（展開屬性先變、事件在下一個工作才到），所以等事件數而不是立刻讀（V4-2 代理 B 交接：next start 下四尺寸穩定先讀到 0）。
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開拆解的資料表" }).toBe(1);
    await closeDetails(details);
    await expect(details).not.toHaveAttribute("open", /.*/);
    await page.waitForTimeout(300);
    expect(await analyticsCount(page, "chart_table_opened"), "收合不記").toBe(1);
    await openDataTable(chartFrame(page, "profit-waterfall"));
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開利潤結構的資料表" }).toBe(2);
    // 瀑布柱：第 2 根是九項的第一項（原價收入）；與橋接表同列開同一個抽屜（revamp-r1-layout.spec 的 V3-4b charts 另測精確值）。
    await bridgeWaterfallSvg(page).locator("rect.wf-bar").nth(1).click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(labels.overview.page.bridgeRowTitle, { metric: metricDefinitions[AMOUNT_FIELDS[0]].label })));
    await page.keyboard.press("Escape");
    await expect(evidenceDrawer(page)).toHaveCount(0);
    expect(await analyticsCount(page, "waterfall_clicked")).toBe(1);
    expect(await analyticsCount(page, "chart_clicked")).toBe(0);
  });
});

// ── V4-2 代理 E（06_BATCHES V4-2「驗收重點」的瀏覽器部分；CHART_CATALOG G3、G4、G5、G7（a）的 E2E 草案；PRD §4.4–4.7、§7.2、§8.7、X40）──
// G3 趨勢與 G4 各通路的數值軸改 formatAxisWan（整數萬）；G4 緊湊表差額欄與 C24 差額條（D-V4-16＝A）；G5 損益兩平 MER 段的 C18 bullet；
// G7a 其他常用指標表「近 {n} 週」sparkline 與「各指標每週」資料表（C33，arrangeVersion assist-weeks-v1）。四個視窗都跑；示範資料（fixtures/demo），
// X40 的未滿 7 天空心點用 4 通路合成資料（tests/fixtures/synthetic-4-channel，期間結束在週三）。

/** 示範資料的兩個通路（緊湊表順序）與畫面上的別名（labels.data.demoChannelAlias）。 */
const DEMO_CHANNELS = ["DTC", "MARKETPLACE"] as const;
const demoAliasOf = (channel: (typeof DEMO_CHANNELS)[number]) => labels.data.demoChannelAlias[channel];
/** KPI 帶的五格（kpi-{metric}）；讀入 targets.csv 後多三個 kpi-target-{metric}（net_revenue、gross_profit、contribution_after_marketing）。 */
const KPI_CARDS = ["kpi-net_revenue", "kpi-gross_profit", "kpi-contribution_before_marketing", "kpi-contribution_after_marketing", "kpi-contribution_margin"];
const KPI_TARGETS = ["kpi-target-net_revenue", "kpi-target-gross_profit", "kpi-target-contribution_after_marketing"];
/** 其他常用指標的七列（ASSIST_KPI_IDS 的順序：左表 4 列、右表 3 列）。 */
const ASSIST_IDS = ["units_sold", "net_revenue_per_unit", "marketing_burden", "mer", "gross_margin", "refund_ratio", "fulfillment_burden"] as const;
/** 示範資料本期 7/13（週一）到 8/23（週日）剛好 6 個完整週（CHART_CATALOG G7 E2E 草案）。 */
const DEMO_WEEKS = 6;
const spark = labels.overview.chartsV4.assistSpark;
const kpiBandIds = (page: Page) => page.getByTestId("kpi-band").locator("[data-testid^='kpi-']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")!).sort());
const drawerNumber = (page: Page) => evidenceDrawer(page).locator(".evidence-body > p.number");
async function closeDrawer(page: Page) {
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);
}
/** 數值軸刻度的共同檢查：至少兩個、含 0、沒有「.0 萬」、非 0 刻度都以萬為單位、由小到大等距（一張圖一個數值軸、整齊步長）。回傳刻度文字。 */
async function expectWanAxis(frame: Locator, axis: "x" | "y", label: string): Promise<string[]> {
  const ticks = await axisTickTexts(frame, axis);
  expect(ticks.filter(text => DOT_ZERO_WAN.test(text)), `${label}：刻度沒有「.0 萬」`).toEqual([]);
  expect(ticks, `${label}：含 0`).toContain("0");
  expect(ticks.filter(text => text !== "0" && !text.endsWith(WAN)), `${label}：非 0 刻度以萬為單位`).toEqual([]);
  const values = ticks.map(axisTickValue);
  expect(values.every(Number.isFinite), `${label}：刻度可解析（${ticks.join(" | ")}）`).toBe(true);
  const sorted = [...values].sort((a, b) => a - b);
  const steps = sorted.slice(1).map((value, index) => value - sorted[index]);
  expect(new Set(steps).size, `${label}：等距刻度（${ticks.join(" | ")}）`).toBe(1);
  return ticks;
}

test.describe("V4-2 總覽 G3 趨勢與 G4 各通路的刻度", () => {
  test("G3 Y 軸與 G4 X 軸刻度改 formatAxisWan：沒有「.0 萬」、含 0、整齊等距；切到近 7 天仍成立；三項圖例不變；390 頁面不橫向捲動", async ({ page }, testInfo) => {
    await open(page);
    const trend = chartFrame(page, "trend"), channels = chartFrame(page, "channel-mix");
    const trendTicks = await expectWanAxis(trend, "y", "G3 趨勢");
    const channelTicks = await expectWanAxis(channels, "x", "G4 各通路");
    // 三項圖例（本期、上期、去年同期）沿用 v3（trend-yoy.spec 另測文字與去年同期項）。
    await expect(trend.locator(".legend > span")).toHaveCount(3);
    await choosePreset(page, "last7");
    const shortTrend = await expectWanAxis(trend, "y", "G3 趨勢（近 7 天）");
    await expectWanAxis(channels, "x", "G4 各通路（近 7 天）");
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-axis", description: JSON.stringify({ trendTicks, channelTicks, shortTrend }) });
  });
});

test.describe("V4-2 總覽 G4 各通路緊湊表差額條", () => {
  test("條數＝通路數，在差額格內、number-link 之前，aria-hidden 不可聚焦；不利 chartColors.unfavorable、有利 chartColors.total（不是 chartColors.favorable）；390 條獨立一行在數字上方、寬 ≤ 64", async ({ page }, testInfo) => {
    await open(page);
    const rows = channelKv(page).locator("tbody tr");
    await expect(rows).toHaveCount(DEMO_CHANNELS.length);
    await expect(channelKv(page).locator("td.channel-change")).toHaveCount(DEMO_CHANNELS.length);
    await expect(channelKv(page).locator("td.channel-change button.number-link")).toHaveCount(DEMO_CHANNELS.length);
    await expect(channelKv(page).locator("thead th").last()).toHaveText(labels.overview.channelsV3.dataTable.change);
    await expect(channelBars(page), "差額條數＝通路數（示範資料兩個通路都有差額）").toHaveCount(DEMO_CHANNELS.length);
    const info = await channelBarInfo(page);
    expect(info.map(item => item.channel), "依緊湊表順序").toEqual([...DEMO_CHANNELS]);
    for (const item of info) {
      expect(item.inChangeCell, `${item.channel}：在 td.num.channel-change 內`).toBe(true);
      expect(item.beforeLink, `${item.channel}：在同格差額 number-link 之前`).toBe(true);
      expect([item.ariaHidden, item.focusable, item.tabIndex], `${item.channel}：aria-hidden、不可聚焦`).toEqual(["true", "false", null]);
      expect(item.fill, `${item.channel}：有利條不用 chartColors.favorable（同框上期長條已是同色）`).not.toBe(chartColors.favorable);
      // 條色與同格 number-link 的帶號一致：負的差額（扣廣告後貢獻變少）是不利。
      expect(item.fill, `${item.channel}：條色`).toBe(item.linkText.startsWith(MINUS) ? chartColors.unfavorable : chartColors.total);
      expect(item.box.width, `${item.channel}：條寬 > 0`).toBeGreaterThan(0);
      if (isMobile(page)) {
        expect(item.box.width, `${item.channel}：390 條寬 ≤ 64`).toBeLessThanOrEqual(64);
        expect(item.box.y + item.box.height, `${item.channel}：390 條獨立一行、在數字上方`).toBeLessThanOrEqual(item.linkBox.y + 0.5);
      } else {
        expect(item.box.width, `${item.channel}：條寬 ≤ 96`).toBeLessThanOrEqual(96);
        expect(item.box.y < item.linkBox.y + item.linkBox.height && item.box.y + item.box.height > item.linkBox.y, `${item.channel}：≥ 768 條與數字同一行`).toBe(true);
      }
    }
    // 示範資料：官網差額為正（有利，chartColors.total），平台差額為負（不利，chartColors.unfavorable）。
    expect(info.map(item => item.fill)).toEqual([chartColors.total, chartColors.unfavorable]);
    await expect(channelBar(page, "DTC").locator("rect.bar-cell-bar")).toHaveAttribute("fill", chartColors.total);
    await expect(channelBar(page, "MARKETPLACE").locator("rect.bar-cell-bar")).toHaveAttribute("fill", chartColors.unfavorable);
    // 差額 number-link 的可及名稱（labels.overview.chartsV4.channels.changeAria，含畫面上的帶號值）。
    for (const item of info) {
      const channel = item.channel as (typeof DEMO_CHANNELS)[number];
      await expect(channelChangeLink(page, channel)).toHaveAccessibleName(fill(labels.overview.chartsV4.channels.changeAria, { channel: demoAliasOf(channel), metric: metricDefinitions.contribution_after_marketing.label, value: item.linkText }));
    }
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-g4-bars", description: JSON.stringify(info) });
  });

  test("點差額條與點差額 number-link 開同一個抽屜（帶兩期組成、大數字帶正負號、篩到該通路）；點條記 chart_clicked、點 number-link 不記；點長條的抽屜大數字不帶正負號、畫四層階梯", async ({ page }, testInfo) => {
    await stubAnalytics(page);
    await open(page);
    const metric = metricDefinitions.contribution_after_marketing.label;
    const columns = labels.evidence.drawerV3.componentsColumns;
    for (const channel of DEMO_CHANNELS) {
      const title = drawerTitle(fill(labels.meeting.managerSummary.evidenceChange, { scope: demoAliasOf(channel), metric }));
      const link = channelChangeLink(page, channel);
      const shown = (await link.textContent())!.trim();
      await link.click();
      await expect(drawerHeading(page)).toHaveText(title);
      const sign = shown.startsWith(MINUS) ? MINUS : "+";
      await expect(drawerNumber(page), `${channel}：差額的大數字帶正負號`).toHaveText(new RegExp(`^${sign === "+" ? "\\+" : sign}`));
      const precise = (await preciseValue(page).textContent())!.trim();
      expect(precise.startsWith(sign), `${channel}：精確值帶正負號（${precise}）`).toBe(true);
      // 兩期組成：上期、本期、差額一列三欄加項目欄；差額類證據不畫四層階梯。
      const components = evidenceDrawer(page).locator(".evidence-components table");
      await expect(components.locator("thead th")).toHaveText([columns.item, columns.previous, columns.current, columns.change]);
      await expect(components.locator("tbody tr")).toHaveCount(1);
      await expect(components.locator("tbody th")).toHaveText(metric);
      await expect(evidenceDrawer(page).locator(".ladder-table")).toHaveCount(0);
      await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator(":scope > span")).toHaveText(fill(labels.overview.trendYoyV3.filter.phrase, { scope: demoAliasOf(channel) }));
      await closeDrawer(page);
      await expect(link).toBeFocused();
      expect(await analyticsCount(page, "chart_clicked"), `${channel}：點差額 number-link 不記 chart_clicked`).toBe(0);
      await channelBar(page, channel).click();
      await expect(drawerHeading(page)).toHaveText(title);
      await expect(preciseValue(page)).toHaveText(precise);
      await expect(evidenceDrawer(page).locator(".evidence-components table tbody tr")).toHaveCount(1);
      await closeDrawer(page);
      expect(await analyticsCount(page, "chart_clicked"), `${channel}：點差額條記 chart_clicked 一次`).toBe(1);
      await page.evaluate(() => { (window as unknown as { __v41Events: string[] }).__v41Events.length = 0; });
      testInfo.annotations.push({ type: `v4-2-g4-drawer-${channel}`, description: `${shown} | ${precise}` });
    }
    // 長條（本期粗條，第一根是官網）：沿用 channelEvidence（該期水準值、不帶 components）——大數字不帶正負號、畫淨營收到扣廣告後貢獻的四層階梯。
    await chartFrame(page, "channel-mix").locator(`path.chart-bar-link:not([fill='${chartColors.previous}'])`).first().click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metric));
    await expect(drawerNumber(page), "長條：大數字不帶正負號").not.toHaveText(/^[+−-]/);
    await expect(preciseValue(page)).not.toHaveText(/^[+−-]/);
    const ladder = evidenceDrawer(page).locator(".evidence-ladder table.ladder-table");
    await expect(ladder).toHaveCount(1);
    await expect(ladder.locator("tr")).toHaveCount(13);
    await expect(ladder.locator("tr.subtotal th"), "四層：淨營收、商品毛利、扣廣告前貢獻（小計列）").toHaveText([metricDefinitions.net_revenue.label, metricDefinitions.gross_profit.label, metricDefinitions.contribution_before_marketing.label]);
    await expect(ladder.locator("tr.current th"), "第四層：扣廣告後貢獻（目前列）").toHaveText(metric);
    await expect(evidenceDrawer(page).locator(".evidence-components")).toHaveCount(0);
    await closeDrawer(page);
    expect(await analyticsCount(page, "chart_clicked"), "長條點擊沿用 v3、不記 chart_clicked").toBe(0);
  });
});

test.describe("V4-2 總覽 G5 目標細條與損益兩平 MER", () => {
  test("讀入 targets.csv 後 KPI 帶的 kpi- testid 只多三個目標列（新 testid 沒有撞名）、細條沿用 v3 markup；MER bullet 一個、aria-hidden、不落後、滿格，旁邊一行與兩個數字一致、沒有 Tab 停留點", async ({ page }, testInfo) => {
    await open(page);
    expect(await kpiBandIds(page), "只載入示範資料：KPI 帶五格").toEqual([...KPI_CARDS].sort());
    await readTargetsCsv(page);
    const band = page.getByTestId("kpi-band");
    expect(await kpiBandIds(page), "讀入目標後：五格加三個 kpi-target-*").toEqual([...KPI_CARDS, ...KPI_TARGETS].sort());
    await expect(band.locator("[data-testid^='chart-'], [data-chart-kind]"), "KPI 帶內沒有 v4 圖表 testid 與 data-chart-kind").toHaveCount(0);
    await expect(band.locator(".kpi-bullet")).toHaveCount(KPI_TARGETS.length);
    await expect(band.locator(".kpi-bullet[data-testid]"), "KPI 帶的細條不帶 testid（markup 與 v3 相同）").toHaveCount(0);
    await expect(band.locator(".kpi-bullet[aria-hidden='true']")).toHaveCount(KPI_TARGETS.length);
    await expect(band.locator(".kpi-bullet.is-behind")).toHaveCount(1);
    await expect(band.getByTestId("kpi-target-gross_profit").locator(".kpi-bullet")).toHaveClass(/is-behind/);

    // G5 MER：示範資料實際 MER 高於損益兩平 MER（有利方向 up，不落後，比值超過 1 時條滿格）。
    await expect(merBullet(page)).toHaveCount(1);
    await expect(merBullet(page)).toHaveAttribute("aria-hidden", "true");
    await expect(merBullet(page)).toHaveClass(/(^|\s)kpi-bullet(\s|$)/);
    await expect(merBullet(page)).not.toHaveClass(/is-behind/);
    expect(await merBullet(page).locator(".kpi-bullet-bar").evaluate(node => parseFloat((node as HTMLElement).style.width)), "比值 ≥ 1 時條滿格").toBe(100);
    await expect(merBullet(page).locator(".kpi-bullet-target")).toHaveCount(1);
    const mer = (await assistCell(page, "mer", "current").textContent())!.trim();
    const breakeven = (await page.getByTestId("assist-breakeven-current").textContent())!.trim();
    await expect(merBulletLine(page)).toHaveText(fill(labels.overview.chartsV4.bullet.merLine, { mer, breakeven }));
    await expect(merBulletLine(page).locator("a, button, input, [tabindex]"), "bullet 那一行沒有 Tab 停留點").toHaveCount(0);
    await expect(page.getByTestId("assist-breakeven-mer").locator("table.assist-breakeven-table tbody tr"), "損益兩平表格仍是一列").toHaveCount(1);
    await expect(merBulletLine(page)).toBeVisible();
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-g5", description: `${mer} | ${breakeven}` });
  });
});

test.describe("V4-2 總覽 G7a 其他常用指標「近 {n} 週」與「各指標每週」", () => {
  test("兩張表都有「近 6 週」欄；七條 sparkline 各 6 點、沒有空心點、aria-hidden 不可聚焦（Tab 從上期數字直接到下一列本期數字）；390 頁面不橫向捲動", async ({ page }, testInfo) => {
    await open(page);
    await expect(assistSparkHeads(page)).toHaveText([fill(spark.head, { n: DEMO_WEEKS }), fill(spark.head, { n: DEMO_WEEKS })]);
    await expect(assistSparks(page)).toHaveCount(ASSIST_IDS.length);
    await expect(assistKpis(page).locator("tr[data-testid^='assist-']")).toHaveCount(ASSIST_IDS.length);
    for (const id of ASSIST_IDS) {
      const svg = assistSpark(page, id);
      await expect(svg.locator("xpath=..")).toHaveClass("spark-cell");
      await expect(page.getByTestId(`assist-${id}`).locator("td.spark-cell")).toHaveCount(1);
      await expect(svg).toHaveAttribute("data-points", String(DEMO_WEEKS));
      await expect(svg).toHaveAttribute("aria-hidden", "true");
      await expect(svg).toHaveAttribute("focusable", "false");
      await expect(svg.locator("[tabindex]")).toHaveCount(0);
      await expect(svg.locator("circle[data-kind='hollow']"), `${id}：示範資料都是完整週`).toHaveCount(0);
      await expect(svg.locator("circle[data-kind='last']")).toHaveAttribute("fill", chartColors.current);
      await expect(svg.locator("polyline.spark-line").first()).toHaveAttribute("stroke", chartColors.total);
      await expect(svg).toBeVisible();
      const box = await boxOf(svg);
      expect(box.width, `${id}：寬 ≤ 64`).toBeLessThanOrEqual(64);
    }
    // 不可聚焦：上期數字之後的下一個 Tab 停留點是下一列的本期數字（sparkline 不是停留點）。
    const from = assistCell(page, "units_sold", "previous");
    await from.focus();
    await expect(from).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(assistCell(page, "net_revenue_per_unit", "current")).toBeFocused();
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-g7a-spark-box", description: JSON.stringify(await boxOf(assistSpark(page, "units_sold"))) });
  });

  test("「各指標每週」收合時已掛載；展開記 chart_table_opened；7 列 × 6 週可開抽屜，比率格 metric_version 是 contribution-v1、件數格是 assist-kpi-v1，技術細節在它之後另列 assist-weeks-v1", async ({ page }, testInfo) => {
    await stubAnalytics(page);
    await open(page);
    const details = assistWeeksDetails(page);
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open", /.*/);
    await expect(details.locator(":scope > summary")).toHaveText(fill(labels.overview.page.dataTable, { title: spark.tableTitle }));
    // M1：收合時表格已在 DOM（不可見）。
    await expect(assistWeeksTable(page)).toHaveCount(1);
    await expect(assistWeeksTable(page)).toBeHidden();
    await expect(details.locator("xpath=preceding-sibling::*[1]"), "放在損益兩平段之後").toHaveAttribute("data-testid", "assist-breakeven-mer");
    await openDetails(details);
    await expect(details).toHaveAttribute("open", "");
    await expect(assistWeeksTable(page)).toBeVisible();
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開「各指標每週」記 chart_table_opened" }).toBe(1);
    const table = assistWeeksTable(page);
    await expect(table.locator("caption")).toHaveText(fill(spark.caption, { n: DEMO_WEEKS }));
    await expect(details.locator(".chart-data-scroll[role='region']")).toHaveAttribute("aria-label", fill(spark.caption, { n: DEMO_WEEKS }));
    await expect(table.locator("thead th")).toHaveCount(1 + DEMO_WEEKS);
    await expect(table.locator("thead th").first()).toHaveText(labels.overview.assistTable.columns.metric);
    await expect(table.locator("tbody tr")).toHaveCount(ASSIST_IDS.length);
    await expect(table.locator("tbody th").first()).toHaveText(fill(spark.rowUnit.count, { label: labels.assist.items.units_sold.label }));
    await expect(table.locator("tbody button.number-link"), "示範資料每格都有值").toHaveCount(ASSIST_IDS.length * DEMO_WEEKS);
    // V4-8a（D-V4-45＝B）：只有有利方向是上升的指標落到不利側才上色；示範資料 0 格（成本類比率的正值不上色）。
    await expect(table.locator("tbody .negative"), "示範資料 G7a 不利色 0 格").toHaveCount(0);

    // 比率格（廣告佔比，最後一週）：值取自 domain，metric_version 維持 contribution-v1，另列 assist-weeks-v1。
    const ratioCell = table.locator("tbody tr").nth(ASSIST_IDS.indexOf("marketing_burden")).locator("button.number-link").last();
    await ratioCell.click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.marketing_burden.label));
    const ratioRows = await evidenceTechnicalRows(evidenceDrawer(page));
    const ratioVersion = ratioRows.findIndex(row => row.dt === "metric_version");
    expect(ratioRows[ratioVersion]?.dd, "比率格：metric_version").toBe("contribution-v1");
    expect(ratioRows[ratioVersion + 1], "metric_version 之後另列圖表整理版本").toEqual({ testId: "evidence-arrange-version", dt: labels.evidence.chartsV4.arrangeVersion, dd: ASSIST_WEEKS_VERSION });
    await expect(evidenceDrawer(page).getByTestId("evidence-arrange-version")).toHaveCount(1);
    await closeDrawer(page);
    await expect(ratioCell).toBeFocused();

    // 件數格（第一週）：件數、件均的算法版本維持 assist-kpi-v1，同樣另列 assist-weeks-v1。
    const countCell = table.locator("tbody tr").first().locator("button.number-link").first();
    await countCell.click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(labels.assist.items.units_sold.label));
    const countRows = await evidenceTechnicalRows(evidenceDrawer(page));
    const countVersion = countRows.findIndex(row => row.dt === "metric_version");
    expect(countRows[countVersion]?.dd, "件數格：metric_version").toBe(ASSIST_KPI_VERSION);
    expect(countRows[countVersion + 1]).toEqual({ testId: "evidence-arrange-version", dt: labels.evidence.chartsV4.arrangeVersion, dd: ASSIST_WEEKS_VERSION });
    await closeDrawer(page);

    // 本期、上期兩格的抽屜照舊：沒有圖表整理版本那一行（只在有給 arrangeVersion 時顯示）。
    await assistCell(page, "marketing_burden", "current").click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.marketing_burden.label));
    const plainRows = await evidenceTechnicalRows(evidenceDrawer(page));
    expect(plainRows.find(row => row.dt === "metric_version")?.dd).toBe("contribution-v1");
    expect(plainRows.some(row => row.testId === "evidence-arrange-version"), "本期格沒有 arrangeVersion").toBe(false);
    await closeDrawer(page);
    expect(await analyticsCount(page, "chart_clicked"), "資料表 number-link 不記 chart_clicked").toBe(0);
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-g7a-technical", description: JSON.stringify({ ratioRows, countRows }) });
  });
});

test.describe("V4-2 總覽：4 通路合成資料（X40 未滿 7 天的週、差額缺值的通路、MER 不畫）", () => {
  test("件數 sparkline 最後一週（9/21–9/23，3 天）畫空心點、不連線，比值照畫；欄名「近 3 週」；資料表欄頭標「未滿 7 天」並附說明句；G4 只畫有差額的三條、LIVE 差額格照樣有 number-link；MER bullet 不出現；刻度沒有「.0 萬」", async ({ page }, testInfo) => {
    await page.goto("/");
    await importSynthetic(page);
    await expect(assistSparkHeads(page)).toHaveText([fill(spark.head, { n: 3 }), fill(spark.head, { n: 3 })]);
    // 本期值資料待補的列（廣告佔比、MER、物流費佔比：LIVE 本期缺通路費用與廣告列）不畫；其餘四列畫 3 點。
    expect(await assistSparks(page).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")!.replace("chart-overview-assist-spark-", "")))).toEqual(["units_sold", "net_revenue_per_unit", "gross_margin", "refund_ratio"]);
    const units = assistSpark(page, "units_sold");
    await expect(units).toHaveAttribute("data-points", "3");
    await expect(units.locator("circle"), "件數只有最後一週的空心點").toHaveCount(1);
    const hollow = units.locator("circle").last();
    await expect(hollow).toHaveAttribute("data-kind", "hollow");
    await expect(hollow, "空心點的填色是表面色").toHaveAttribute("fill", chartColors.surface);
    await expect(hollow).toHaveAttribute("stroke", chartColors.current);
    await expect(units.locator("polyline.spark-line"), "折線只連前兩個完整週").toHaveCount(1);
    expect(((await units.locator("polyline.spark-line").getAttribute("points")) ?? "").trim().split(/\s+/)).toHaveLength(2);
    for (const id of ["net_revenue_per_unit", "gross_margin", "refund_ratio"]) {
      await expect(assistSpark(page, id).locator("circle[data-kind='hollow']"), `${id}：比值照畫`).toHaveCount(0);
      await expect(assistSpark(page, id).locator("circle[data-kind='last']")).toHaveAttribute("fill", chartColors.current);
    }
    const details = assistWeeksDetails(page);
    await openDetails(details);
    const table = assistWeeksTable(page);
    await expect(table.locator("thead th")).toHaveCount(1 + 3);
    await expect(table.locator("thead th").last()).toContainText(labels.overview.trendV3.incompleteShort);
    await expect(table.locator("thead th").nth(1)).not.toContainText(labels.overview.trendV3.incompleteShort);
    await expect(details.locator("p.note")).toHaveText(spark.incompleteNote);
    await expect(table.locator("tbody tr")).toHaveCount(ASSIST_IDS.length);

    // G4：LIVE 兩期扣廣告後貢獻資料待補，差額缺值不畫條；其餘三個通路各一條（MARKETPLACE 由正轉負，不利）。
    expect((await channelBarInfo(page)).map(item => `${item.channel}:${item.fill}`)).toEqual([`DTC:${chartColors.total}`, `MARKETPLACE:${chartColors.unfavorable}`, `SOCIAL:${chartColors.total}`]);
    const live = channelChangeCellByRow(page, "LIVE");
    await expect(live.locator("svg")).toHaveCount(0);
    await expect(live.locator("button.number-link")).toHaveText(labels.shell.status.missing);
    await expect(live.locator("button.number-link")).toHaveAccessibleName(fill(labels.overview.chartsV4.channels.changeEmptyAria, { channel: "LIVE", metric: metricDefinitions.contribution_after_marketing.label, value: labels.shell.status.missing }));
    // G5：本期實際 MER 資料待補，bullet 整行不出現（一句結論照舊）。
    await expect(merBullet(page)).toHaveCount(0);
    await expect(merBulletLine(page)).toHaveCount(0);
    await expect(page.getByTestId("assist-breakeven-note")).toHaveCount(1);
    await expectWanAxis(chartFrame(page, "trend"), "y", "G3 趨勢（合成資料）");
    await expectWanAxis(chartFrame(page, "channel-mix"), "x", "G4 各通路（合成資料）");
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-2-synthetic-units", description: (await units.locator("polyline.spark-line").getAttribute("points")) ?? "" });
  });
});
