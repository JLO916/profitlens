import { expect, test as base, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors } from "../../src/application/chart-theme";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatPeriodL1, metricDefinitions } from "../../src/application/presentation";
import { choosePreset, clickReplacing, dismissSavePrompt, openDetails, periodSummary, periodSummaryText } from "./replacement-helpers";
import {
  TREND_TABLE_HEADERS, TWO_YEARS, YOY_DASH, YOY_EMPTY, drawerSubtitle, evidenceDialog, evidenceFilter, evidenceFilterText, evidenceHeading, expectDatesWithin, filterApply, filterClear, filterPhrase,
  importTwoYears, openTrendTable, pointHits, pointStarts, sourceChannels, sourceTabName, sourceTabs, trendLegendItems, trendLines, trendTakeaways, weekLabel, weekScope, yoyCells, yoyCurves, yoyLegend, yoyNote,
} from "./trend-helpers-v39";

// V3-9b F8 趨勢圖第三線「去年同期」與 F10 圖表點擊下鑽（PRD §10.1 F8、F10；§9.5「互動 P1：週與通路點擊後開抽屜，並篩到該週或該通路」）。
// (a) 示範資料：去年同期不可用（資料從 2026-06-01 起）——圖例保留第三項並標「無資料」、圖下方寫原因、不畫線、資料表最後兩欄「無資料」。
// (b) 兩年合成資料（trend-helpers-v39.ts 的 twoYearFiles）：本月 vs 上月後去年同期可用——第三線、第三格提示列、資料表去年欄可開抽屜、點去年同期的點下鑽到該週。
// (c) 示範資料下鑽：點本期第 2 週的點→抽屜篩到該週、清除／套用切換焦點不動；點通路長條或通路資料表→篩到該通路。
// mobile（390）與 desktop（1440）都跑 (a)(b)(c)。

/** 每個測試都不可有 page error 或 console error（新的點熱區、虛線、抽屜篩選都只是呈現）。 */
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
    await use(errors);
    expect(errors, "瀏覽器不應出現 page error 或 console error").toEqual([]);
  }, { auto: true }],
});

const DEMO_AS_OF = "2026-08-24";
const yoyCopy = labels.overview.trendYoyV3;
const frame = labels.overview.chartFrame;
const allChannels = labels.evidence.allChannels;
const preciseMoney = (amount: string) => fill(labels.format.units.yuan, { value: formatAmountL3(amount) });

async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }));
  // 示範資料本期扣廣告後貢獻 1269792.73（KPI 卡 L1）。
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("1269792.73"));
  await dismissSavePrompt(page);
}

test("(a) 示範資料：去年同期不可用時圖例保留第三項並標無資料、圖下方寫原因、只有 4 條線、資料表最後兩欄無資料", async ({ page }) => {
  await loadDemo(page);
  // 圖例三項：本期、上期、去年同期（虛線段＋「無資料」）。
  await expect(trendLegendItems(page)).toHaveCount(3);
  await expect(trendLegendItems(page)).toHaveText([frame.legend.current, frame.legend.previous, `${yoyCopy.legend}${frame.noData}`]);
  await expect(yoyLegend(page).locator("small")).toHaveText(frame.noData);
  await expect(yoyLegend(page).locator("svg.legend-dash line")).toHaveAttribute("stroke", chartColors.yoy);
  await expect(yoyLegend(page).locator("svg.legend-dash line")).toHaveAttribute("stroke-dasharray", YOY_DASH);
  // 圖下方一行原因（與期間列「去年同期」快捷停用的原因同一句）。
  await expect(yoyNote(page)).toHaveText(fill(yoyCopy.unavailable, { reason: fill(labels.shell.periods.presetTooShort, { date: "2026-06-01", preset: labels.shell.periods.presets.yoy }) }));
  // 不畫去年同期線（缺資料不畫成 0）：只有本期、上期 × 淨營收、扣廣告後貢獻 4 條。
  await expect(trendLines(page)).toHaveCount(4);
  await expect(yoyCurves(page)).toHaveCount(0);
  // F10 點熱區：上期 6 週、本期 6 週 × 2 個指標＝24 個；沒有去年同期的點。
  await expect(pointHits(page)).toHaveCount(24);
  await expect(pointHits(page, "revenueYoy")).toHaveCount(0);
  await expect(pointHits(page, "contributionYoy")).toHaveCount(0);
  expect(await pointStarts(pointHits(page, "revenueCurrent"))).toEqual(["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17"]);
  // 提示列只有兩格（沒有「去年同期淨營收合計」）。
  await expect(trendTakeaways(page)).toHaveCount(2);
  await expect(trendTakeaways(page).locator("dt")).toHaveText([labels.overview.trendV3.takeaways.total, labels.overview.trendV3.takeaways.lastCompleteWeek]);
  // 資料表：7 欄；12 列（上期 6 週＋本期 6 週）的最後兩欄都是 span.trend-yoy-empty「無資料」，沒有按鈕。
  const table = await openTrendTable(page);
  await expect(table.locator("thead th")).toHaveCount(7);
  await expect(table.locator("thead th")).toHaveText(TREND_TABLE_HEADERS);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(12);
  await expect(rows.first().locator("td")).toHaveCount(7);
  await expect(table.locator("tbody td span.trend-yoy-empty")).toHaveCount(24);
  for (const row of await rows.all()) {
    await expect(yoyCells(row)).toHaveText([YOY_EMPTY, YOY_EMPTY]);
    await expect(yoyCells(row).locator("span.trend-yoy-empty")).toHaveCount(2);
    await expect(yoyCells(row).locator("button")).toHaveCount(0);
  }
  // 金額欄的 number-link 數不變：12 週 × 3 個指標。
  await expect(table.locator("button.number-link")).toHaveCount(36);
});

test("(b) 兩年資料：去年同期可用時多兩條虛線、第三格提示列、資料表去年欄可開抽屜，點去年同期的點篩到該週", async ({ page }) => {
  await page.goto("/");
  await importTwoYears(page);
  await dismissSavePrompt(page);
  await choosePreset(page, "monthVsPrev");
  await expect(periodSummary(page)).toContainText(periodSummaryText("2026-08-01", "2026-08-31", "2026-07-01", "2026-07-31"));
  // 本期 2026-08 淨營收 31 × 200.00 ＝ 6200.00。
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText(formatAmountL1("6200.00"));
  const anchor = TWO_YEARS.coverageEnd;

  // ready：沒有原因列；圖例第三項沒有「無資料」。
  await expect(yoyNote(page)).toHaveCount(0);
  await expect(yoyLegend(page)).toHaveText(yoyCopy.legend);
  await expect(yoyLegend(page).locator("small")).toHaveCount(0);
  // 6 條線，其中兩條是去年同期的虛線（--chart-yoy、"4 3"、1.5px）。
  await expect(trendLines(page)).toHaveCount(6);
  await expect(yoyCurves(page)).toHaveCount(2);
  for (const curve of await yoyCurves(page).all()) await expect(curve).toHaveAttribute("stroke-width", "1.5");
  // 去年同期的點對齊本期 5 週（2026-08 的 7、7、7、7、3 天），data-start 是去年那一週的起日。
  const yoyStarts = ["2025-08-01", "2025-08-08", "2025-08-15", "2025-08-22", "2025-08-29"];
  expect(await pointStarts(pointHits(page, "revenueYoy"))).toEqual(yoyStarts);
  expect(await pointStarts(pointHits(page, "contributionYoy"))).toEqual(yoyStarts);
  await expect(pointHits(page, "revenueCurrent")).toHaveCount(5);

  // 第三格提示列「去年同期淨營收合計」：2025-08 淨營收 31 × 50.00 ＝ 1550.00；下方小字是去年同期的期間。
  await expect(trendTakeaways(page)).toHaveCount(3);
  const yoyTakeaway = trendTakeaways(page).nth(2);
  await expect(yoyTakeaway.locator("dt")).toHaveText(yoyCopy.takeawayTotal);
  const yoyTotalButton = yoyTakeaway.getByRole("button", { name: fill(labels.overview.trendV3.takeawayAria, { label: yoyCopy.takeawayTotal, value: formatAmountL1("1550.00") }), exact: true });
  await expect(yoyTotalButton).toHaveText(formatAmountL1("1550.00"));
  await expect(yoyTakeaway.locator("small")).toHaveText(formatPeriodL1("2025-08-01", "2025-08-31", { anchor, days: false }));
  // 整段的抽屜：副標寫「去年同期 2025/8/1–2025/8/31」；不是下鑽，沒有篩選列。
  await yoyTotalButton.click();
  const dialog = evidenceDialog(page);
  await expect(dialog).toBeVisible();
  await expect(evidenceHeading(dialog)).toHaveText(`${metricDefinitions.net_revenue.label} · ${labels.evidence.sections.evidence}`);
  await expect(dialog).toHaveAccessibleDescription(drawerSubtitle(allChannels, "2025-08-01", "2025-08-31", anchor, labels.shell.periods.presets.yoy));
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(preciseMoney("1550.00"));
  await expect(evidenceFilter(dialog)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(yoyTotalButton).toBeFocused();

  // 資料表：上期 5 列的去年欄是「無資料」；本期 5 列的去年欄是 number-link（L2）。第 1 週：350.00、−70.00。
  const table = await openTrendTable(page);
  await expect(table.locator("thead th")).toHaveText(TREND_TABLE_HEADERS);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(10);
  const previousRows = rows.filter({ has: page.locator("td:first-child", { hasText: labels.shell.periods.previous }) });
  const currentRows = rows.filter({ has: page.locator("td:first-child", { hasText: labels.shell.periods.current }) });
  await expect(previousRows).toHaveCount(5);
  await expect(currentRows).toHaveCount(5);
  for (const row of await previousRows.all()) await expect(yoyCells(row).locator("span.trend-yoy-empty")).toHaveText([YOY_EMPTY, YOY_EMPTY]);
  for (const row of await currentRows.all()) await expect(yoyCells(row).locator("button.number-link")).toHaveCount(2);
  await expect(yoyCells(currentRows.first()).locator("button.number-link")).toHaveText([formatAmountL2("350.00"), formatAmountL2("-70.00")]);
  // 本期與上期 10 週 × 3 個指標＋本期 5 週 × 2 個去年欄。
  await expect(table.locator("button.number-link")).toHaveCount(40);

  // F10：點去年同期第 1 週的淨營收點 → 淨營收抽屜，期間是去年那一週，篩選片語「篩選：去年同期第 1 週（2025/8/1–2025/8/7）」。
  const yoyScope = weekScope(weekLabel("yoy", 1), "2025-08-01", "2025-08-07", anchor);
  await pointHits(page, "revenueYoy").first().click();
  await expect(dialog).toBeVisible();
  await expect(evidenceHeading(dialog)).toContainText(metricDefinitions.net_revenue.label);
  await expect(dialog).toHaveAccessibleDescription(drawerSubtitle(allChannels, "2025-08-01", "2025-08-07", anchor));
  await expect(dialog.locator(".evidence-body > .number")).toHaveText(formatAmountL1("350.00"));
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(preciseMoney("350.00"));
  await expect(evidenceFilterText(dialog)).toHaveText(filterPhrase(yoyScope));
  await expect(evidenceFilterText(dialog)).toContainText(labels.shell.periods.presets.yoy);
  await expect(filterClear(dialog)).toHaveText(yoyCopy.filter.clear);
  // 原始明細只有銷售分段：該週 7 天 × 1 列，日期都在 2025-08-01～08-07。
  await expect(sourceTabs(dialog)).toHaveText([sourceTabName("sales", 7)]);
  await expectDatesWithin(dialog, "2025-08-01", "2025-08-07");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // 鍵盤經由資料表：同一週的去年欄 number-link（Enter 開啟）→ 同一個抽屜；Esc 關閉後焦點回到該連結。
  const yoyLink = yoyCells(currentRows.first()).locator("button.number-link").first();
  await yoyLink.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(evidenceFilterText(dialog)).toHaveText(filterPhrase(yoyScope));
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(preciseMoney("350.00"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(yoyLink).toBeFocused();
});

test("(c) 示範資料下鑽：點本期第 2 週篩到該週、清除與套用焦點不動；點通路長條或通路資料表篩到該通路", async ({ page }) => {
  await loadDemo(page);
  const dialog = evidenceDialog(page);

  // 週：本期第 2 週（2026-07-20～07-26）的淨營收點。
  await pointHits(page, "revenueCurrent", "2026-07-20").click();
  await expect(dialog).toBeVisible();
  await expect(evidenceHeading(dialog)).toHaveText(`${metricDefinitions.net_revenue.label} · ${labels.evidence.sections.evidence}`);
  await expect(dialog).toHaveAccessibleDescription(drawerSubtitle(allChannels, "2026-07-20", "2026-07-26", DEMO_AS_OF));
  const weekPhrase = filterPhrase(weekScope(weekLabel("current", 2), "2026-07-20", "2026-07-26", DEMO_AS_OF));
  await expect(evidenceFilterText(dialog)).toHaveText(weekPhrase);
  await expect(evidenceFilterText(dialog)).toContainText(fill(labels.overview.pnlV3.weekLabel.current, { n: 2 }));
  await expect(evidenceFilterText(dialog)).toContainText(formatPeriodL1("2026-07-20", "2026-07-26", { anchor: DEMO_AS_OF, days: false }));
  // 示範資料每天 2 通路 × 20 商品＝40 列銷售明細；一週 280 列，日期都在該週。
  await expect(sourceTabs(dialog)).toHaveText([sourceTabName("sales", 280)]);
  await expectDatesWithin(dialog, "2026-07-20", "2026-07-26");
  // 清除篩選：片語變「全部來源」、同一顆按鈕變「套用篩選」且焦點留在按鈕上；再按一次回到該週。
  await filterClear(dialog).click();
  await expect(evidenceFilterText(dialog)).toHaveText(yoyCopy.filter.all);
  await expect(filterClear(dialog)).toHaveCount(0);
  await expect(filterApply(dialog)).toHaveText(yoyCopy.filter.apply);
  await expect(filterApply(dialog)).toBeFocused();
  await expect(sourceTabs(dialog)).toHaveText([sourceTabName("sales", 280)]);
  await filterApply(dialog).click();
  await expect(evidenceFilterText(dialog)).toHaveText(weekPhrase);
  await expect(filterClear(dialog)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // 通路長條：第一根本期粗條是官網（通路緊湊表第一列）→ 扣廣告後貢獻抽屜，篩選片語是通路別名，原始明細都是該通路。
  const channelMix = page.getByTestId("channel-mix");
  const dtc = labels.data.demoChannelAlias.DTC, marketplace = labels.data.demoChannelAlias.MARKETPLACE;
  await expect(channelMix.locator("table.channel-kv tbody th").first()).toContainText(dtc);
  await channelMix.locator(`path.chart-bar-link:not([fill='${chartColors.previous}'])`).first().click();
  await expect(dialog).toBeVisible();
  await expect(evidenceHeading(dialog)).toHaveText(`${metricDefinitions.contribution_after_marketing.label} · ${labels.evidence.sections.evidence}`);
  await expect(dialog).toHaveAccessibleDescription(drawerSubtitle(dtc, "2026-07-13", "2026-08-23", DEMO_AS_OF, labels.shell.periods.current));
  await expect(evidenceFilterText(dialog)).toHaveText(filterPhrase(dtc));
  // 官網本期 42 天：銷售 20 商品 × 42 天＝840 列、通路費用 42 列、廣告 42 列。
  await expect(sourceTabs(dialog)).toHaveText([sourceTabName("sales", 840), sourceTabName("costs", 42), sourceTabName("ads", 42)]);
  expect(new Set(await sourceChannels(dialog))).toEqual(new Set([dtc]));
  await sourceTabs(dialog).nth(2).click();
  expect(new Set(await sourceChannels(dialog))).toEqual(new Set([dtc]));
  await filterClear(dialog).click();
  await expect(evidenceFilterText(dialog)).toHaveText(yoyCopy.filter.all);
  await expect(filterApply(dialog)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // 通路資料表（鍵盤）：平台列的本期扣廣告後 number-link → 同樣篩到平台；Esc 後焦點回到連結。
  const channelTable = await openDetails(channelMix.locator("details.data-alternative"));
  const marketplaceRow = channelTable.locator("tbody tr").filter({ has: page.locator("th", { hasText: marketplace }) });
  const link = marketplaceRow.locator("td").nth(2).getByRole("button");
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(evidenceFilterText(dialog)).toHaveText(filterPhrase(marketplace));
  expect(new Set(await sourceChannels(dialog))).toEqual(new Set([marketplace]));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
});
