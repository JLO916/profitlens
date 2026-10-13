// V4-8b 代理 B（06_BATCHES V4-8b「七頁 390 總檢」；D-V4-59＝A 八項、D-V4-63＝B）：2026-10-13 範圍盤點在 390 實測到的問題，修正後的瀏覽器檢查。
// (1) 會議頁展開「完整通路寬表」後頁面不橫向捲動（寬表只在自己的 .table-scroll 內捲動）；1280／1440 的兩欄會議版面不變（議程欄寬不被寬表撐開）。
// (2) 商品毛利、假設試算（與待辦）的「匯出本頁」選單整個在畫面內、開在按鈕下方。
// (3) Tab 移到的控制不被固定的底部分頁列完全遮住（WCAG 2.4.11；手機殼層才有分頁列）；會議頁議程目錄的跳轉仍落在期間列之下。
// (4) 兩個部分資料狀態的 target-size 由 tests/e2e/axe-sweep.spec.ts 的兩個新狀態檢查（D-V4-60）。
// (5) G4 有 null 通路時（4 通路合成資料的 LIVE），每根長條旁的標值是該通路自己的金額（不限 390，四個尺寸都跑）。
// (6) G3 末點標值彼此不重疊、不壓到 Y 軸刻度（合成資料、缺廣告日資料；390）。
// (7) G16 門檻點標籤不壓到 y 刻度文字（示範資料、390）。(8) G16 資料表的文字欄不換行（各列等高；390）。
// D-V4-63＝B：G19 會議歷史少於 2 筆的空狀態框高在每個寬度都是 chartHeights.sm。
// 字串一律由 labels 組出、定位用 testid；期待的金額在 Node 端以同一組 application 函式算（不寫死）。
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { channelConclusion } from "../../src/application/chart-takeaways";
import { chartHeights } from "../../src/application/chart-theme";
import { demoAlias } from "../../src/application/copy";
import { formatAmountL1 } from "../../src/application/presentation";
import { fill, labels } from "../../src/i18n";
import { openActionsExport, openScenarioExport } from "./actions-helpers-v3";
import { calculateKeep, datasetSnapshot, expectNoPageScrollX, importSynthetic, openDataTable, openSensitivityChart, scenarioCard, thresholdSection } from "./chart-helpers-v4";
import { importViaWizard } from "./import-wizard-helpers";
import { gotoPage, loadDemo, type LaunchPage } from "./launch-helpers-v310";
import { openWideTable } from "./meeting-helpers-v3";
import { dismissSavePrompt, isMobile, openMeeting, openProductExport } from "./replacement-helpers";

test.describe.configure({ timeout: 180_000 });
const mobileOnly = (page: Page) => test.skip(!isMobile(page), "手機殼層（≤ 767px）才有底部分頁列與這項 390 版面");

type Box = { left: number; right: number; top: number; bottom: number; text: string };
/** 一組 svg 文字的畫面框（getBoundingClientRect）。 */
const textBoxes = (texts: Locator): Promise<Box[]> => texts.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: (node.textContent ?? "").trim() }; }));
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
/** 兩組框之間（或同一組內兩兩）重疊面積 ≥ 1px² 的配對。 */
function overlaps(a: readonly Box[], b?: readonly Box[]): string[] {
  const pairs = b ? a.flatMap(x => b.map(y => [x, y] as const)) : a.flatMap((x, i) => a.slice(i + 1).map(y => [x, y] as const));
  return pairs.filter(([x, y]) => overlapArea(x, y) >= 1).map(([x, y]) => `${x.text} × ${y.text}（${overlapArea(x, y).toFixed(1)}px²）`);
}

test("(1) 會議頁展開「完整通路寬表」：頁面不橫向捲動，寬表在自己的捲動容器內；議程欄寬不被撐開", async ({ page }) => {
  await page.goto("/");
  await loadDemo(page);
  const meeting = await openMeeting(page);
  const agenda = meeting.getByTestId("meeting-agenda-3");
  const before = (await agenda.boundingBox())!.width;
  const wide = await openWideTable(meeting.getByTestId("manager-summary"));
  await expect(wide).toHaveAttribute("open", "");
  const scroller = wide.locator(".table-scroll").first();
  await expect(scroller).toBeVisible();
  await expectNoPageScrollX(page);
  expect((await agenda.boundingBox())!.width, "展開前後議程 3 的欄寬相同").toBeCloseTo(before, 0);
  const widths = await wide.evaluate(details => ({ details: details.getBoundingClientRect().width, section: details.parentElement!.getBoundingClientRect().width }));
  expect(widths.details, "寬表的 <details> 不比議程項寬").toBeLessThanOrEqual(widths.section + 0.5);
  if (isMobile(page)) {
    const scroll = await scroller.evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(scroll.scrollWidth, "390：寬表比容器寬，在 .table-scroll 內橫向捲動").toBeGreaterThan(scroll.clientWidth);
  }
});

test("(2) 「匯出本頁」選單整個在畫面內、開在按鈕下方（商品毛利、假設試算、待辦）", async ({ page }) => {
  await page.goto("/");
  await loadDemo(page);
  const width = page.viewportSize()!.width;
  const cases: { id: LaunchPage; summary: string; open: (page: Page) => Promise<Locator> }[] = [
    { id: "products", summary: "export-page-products", open: openProductExport },
    { id: "scenarios", summary: "export-page-scenarios", open: openScenarioExport },
    { id: "actions", summary: "export-page-actions", open: openActionsExport },
  ];
  for (const item of cases) {
    await gotoPage(page, item.id);
    const menu = await item.open(page);
    const panel = menu.locator(":scope > .menu-panel");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    const summary = (await page.getByTestId(item.summary).boundingBox())!;
    expect(box.x, `${item.id}：選單左緣在畫面內`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${item.id}：選單右緣在畫面內`).toBeLessThanOrEqual(width);
    expect(box.y, `${item.id}：選單在按鈕下方`).toBeGreaterThanOrEqual(summary.y + summary.height);
    // 每一項的中心都在畫面內（v3 在 390 開到左外時，項目中心在 x < 0）。
    const items = await panel.locator("button").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return r.left + r.width / 2; }));
    expect(items.length, `${item.id}：選單有項目`).toBeGreaterThan(0);
    for (const center of items) { expect(center).toBeGreaterThanOrEqual(0); expect(center).toBeLessThanOrEqual(width); }
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
  }
});

test("(3) 390：Tab 移到的控制不被底部分頁列完全遮住（WCAG 2.4.11）；會議頁議程目錄跳轉仍落在期間列之下", async ({ page }) => {
  mobileOnly(page);
  await page.goto("/");
  await loadDemo(page);
  const hidden: string[] = [];
  for (const id of ["overview", "diagnosis", "products", "scenarios", "data"] as const) {
    await gotoPage(page, id);
    // 從 main 開始（同 keyboard-walk.spec 的 focusMain）。
    await page.evaluate(() => { window.scrollTo(0, 0); (document.querySelector("main") as HTMLElement | null)?.focus(); });
    for (let stop = 0; stop < 60; stop++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body || !element.closest("main")) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        const bar = document.querySelector("[data-testid='mobile-tabbar']")!.getBoundingClientRect();
        return { name: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30), testid: element.getAttribute("data-testid"), top: rect.top, barTop: bar.top };
      });
      // 完全遮住＝控制的上緣在分頁列上緣（或更下面）：整個控制落在分頁列後方。
      if (info && info.top >= info.barTop - 0.5) hidden.push(`${id} 第 ${stop + 1} 站：${info.testid ?? info.name}（上緣 ${info.top.toFixed(1)} ≥ 分頁列 ${info.barTop.toFixed(1)}）`);
    }
  }
  expect(hidden, "Tab 停留點完全被底部分頁列遮住").toEqual([]);

  // 議程目錄（scroll-margin-top 不變）：點「各通路表現」後議程 3 的標題在期間列下緣之下、在畫面內。
  const meeting = await openMeeting(page);
  const toc = meeting.getByRole("navigation", { name: labels.meeting.pageV3.tocAria, exact: true });
  await toc.getByRole("link", { name: labels.meeting.record.agenda.channels, exact: true }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#meeting-agenda-3");
  const title = (await meeting.locator("#meeting-agenda-3-title").boundingBox())!;
  const bar = (await page.getByTestId("period-bar").boundingBox())!;
  expect(title.y, "議程 3 標題不被期間列蓋住").toBeGreaterThanOrEqual(bar.y + bar.height - 0.5);
  expect(title.y + title.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test("(5) G4 有 null 通路時（合成資料 LIVE）每根長條旁的標值是該通路自己的金額", async ({ page }) => {
  await page.goto("/");
  await importSynthetic(page);
  await gotoPage(page, "overview");
  const snapshot = await datasetSnapshot("synthetic");
  const rows = channelConclusion(snapshot, { alias: demoAlias(snapshot.report.dataset_id) }).rows;
  expect(rows.some(row => row.current.value === null), "合成資料有本期資料待補的通路").toBe(true);
  const chart = page.getByTestId("channel-mix");
  const ticks = chart.locator(".recharts-yAxis-tick-labels text");
  await expect.poll(() => ticks.count()).toBe(rows.length);
  const values = chart.locator("svg.recharts-surface text.chart-value");
  await expect.poll(() => values.count()).toBeGreaterThan(0);
  const tickBoxes = await textBoxes(ticks);
  const labelInfo = await values.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { y: r.top + r.height / 2, text: (node.textContent ?? "").trim(), current: node.classList.contains("is-strong") || node.classList.contains("is-unfavorable") }; }));
  const expected = new Map(rows.map(row => [row.label, {
    current: row.current.value === null ? null : formatAmountL1(row.current.value),
    previous: row.previous.value === null ? null : fill(labels.overview.channelsV3.previousValue, { value: formatAmountL1(row.previous.value) }),
  }]));
  const shown: string[] = [];
  for (const label of labelInfo) {
    const tick = tickBoxes.reduce((best, box) => Math.abs((box.top + box.bottom) / 2 - label.y) < Math.abs((best.top + best.bottom) / 2 - label.y) ? box : best);
    const want = expected.get(tick.text);
    expect(want, `標值「${label.text}」旁的刻度「${tick.text}」是通路名`).toBeDefined();
    expect(label.text, `${tick.text} 的${label.current ? "本期" : "上期"}標值`).toBe(label.current ? want!.current : want!.previous);
    shown.push(`${tick.text}:${label.current ? "current" : "previous"}`);
  }
  // 每個有值的通路每期恰好一個標值；資料待補的通路沒有標值。
  const wanted = rows.flatMap(row => [...(row.previous.value === null ? [] : [`${row.label}:previous`]), ...(row.current.value === null ? [] : [`${row.label}:current`])]);
  expect(shown.sort()).toEqual(wanted.sort());
});

test("(6) 390：G3 末點標值彼此不重疊、不壓到 Y 軸刻度（合成資料、缺廣告日資料）", async ({ page }) => {
  mobileOnly(page);
  const check = async (name: string) => {
    await gotoPage(page, "overview");
    const chart = page.getByTestId("trend");
    const values = chart.locator("svg.recharts-surface text.chart-value");
    await expect.poll(() => values.count(), { message: `${name}：末點標值畫出來` }).toBeGreaterThan(1);
    const ticks = chart.locator(".recharts-yAxis-tick-labels text");
    await expect.poll(() => ticks.count()).toBeGreaterThan(1);
    const labelBoxes = await textBoxes(values), tickBoxes = await textBoxes(ticks);
    expect(overlaps(labelBoxes), `${name}：標值彼此不重疊`).toEqual([]);
    expect(overlaps(labelBoxes, tickBoxes), `${name}：標值不壓到 Y 軸刻度`).toEqual([]);
    const tickRight = Math.max(...tickBoxes.map(box => box.right));
    for (const box of labelBoxes) expect(box.left, `${name}：「${box.text}」不進 Y 軸刻度欄`).toBeGreaterThanOrEqual(tickRight);
  };
  await page.goto("/");
  await importSynthetic(page);
  await check("合成資料");
  await page.goto("/");
  await importViaWizard(page, resolve("fixtures/errors/missing_ad_day"), { manifest: true, classification: "partial" });
  await dismissSavePrompt(page);
  await check("缺廣告日");
});

test("(7)(8) 390：G16 標籤不壓到 y 刻度文字；G16 資料表的文字欄不換行（各列等高、表在自己的捲動容器內）", async ({ page }) => {
  mobileOnly(page);
  await page.goto("/");
  await loadDemo(page);
  await gotoPage(page, "scenarios");
  const card = scenarioCard(page, 1);
  await calculateKeep(card);
  await openSensitivityChart(card, ["0", "50", "100"]);
  const section = thresholdSection(card);
  const svg = section.locator("svg.chart-threshold");
  await expect(svg).toBeVisible();
  const labelBoxes = await textBoxes(svg.locator(".threshold-labels text"));
  const tickBoxes = await textBoxes(svg.locator(".threshold-y text"));
  expect(labelBoxes.length).toBeGreaterThan(0);
  expect(overlaps(labelBoxes, tickBoxes), "G16 標籤不壓到 y 刻度文字").toEqual([]);
  const tickRight = Math.max(...tickBoxes.map(box => box.right));
  for (const box of labelBoxes) expect(box.left, `「${box.text}」不進 y 刻度文字欄`).toBeGreaterThanOrEqual(tickRight);

  await openDataTable(section);
  const table = section.getByTestId("chart-scenarios-threshold-table");
  const heights = await table.locator("tbody tr").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(1);
  expect(Math.max(...heights) - Math.min(...heights), `G16 資料表各列等高（文字欄不被擠成一字一行）：${heights.join("、")}`).toBeLessThanOrEqual(1);
  await expectNoPageScrollX(page);
});

test("D-V4-63＝B：G19 會議歷史少於 2 筆的空狀態框高＝chartHeights.sm（每個寬度）", async ({ page }) => {
  await page.goto("/");
  await loadDemo(page);
  await openMeeting(page);
  const frame = page.getByTestId("chart-meeting-history").locator(".chart-frame");
  await expect(frame).toHaveAttribute("data-state", "empty");
  await expect(frame).toHaveText(labels.meeting.chartsV4.history.empty);
  expect((await frame.boundingBox())!.height).toBeCloseTo(chartHeights.sm, 0);
});
