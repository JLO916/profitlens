// V4-6 代理 C（06_BATCHES V4-6「驗收重點」的瀏覽器部分；CHART_CATALOG G15 會議實例、G19 的 E2E 草案；PRD §4.4–§4.7 G15、G19、§7.1、§8.7）：
// 會議紀錄頁的兩張圖——議程 5 的 G15 會議實例（chart-meeting-scenarios，每通路一根、不可點）與會議歷史內的 G19 小倍數（chart-meeting-history）。
// G19：示範資料三次結束的會議（7 天、7 天、14 天）：1 次＝等高空狀態；同資料集、同期間長度的第 2 次＝資料表 2 列、兩點相連；期間長度不同的第 3 次＝該列「否，期間不同」、圖上不相連。
// G15：golden DTC 方案 1（物流費 −10%：284.00、+14.00）選入議程 5：1 根柱（testid 尾段是方案 id，以前綴定位）、不可點、不用強調色；投影只顯示議程 1–2（≤ 767px 沒有投影按鈕）。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的數字在 Node 端以同一組 domain 函式算（不寫死）。
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors, chartHeights } from "../../src/application/chart-theme";
import { formatAmountL1, formatSignedDelta, metricDefinitions } from "../../src/application/presentation";
import { analyzeDataset } from "../../src/domain/analysis";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "../../src/domain/scenarios";
import type { AnalysisFilters } from "../../src/domain/types";
import { validateDataset } from "../../src/domain/validation";
import { fixture } from "../helpers/fixtures";
import { VISIBLE_CHART_FRAMES, openDataTable } from "./chart-helpers-v4";
import { loadValidationDataset } from "./breakeven-helpers-v39";
import { evidenceDrawer } from "./launch-helpers-v310";
import { enterPresent, expectMountedHidden, expectPresentOff, loadDemoForPresent, presentToggle } from "./present-helpers-v39";
import { applyCustomPeriod, isMobile, navigateTo, openMeeting, selectScenarioChannel } from "./replacement-helpers";
import { acceptAssumptions } from "./scenario-helpers-v3";

const history = labels.meeting.chartsV4.history;
const g15 = labels.meeting.chartsV4.scenarios;
const review = labels.meeting.review;
test.describe.configure({ timeout: 180_000 });

/** 示範資料的三次會議（同天數比較）：兩個連續週（7 天），再一次 14 天（期間長度不同）。 */
const MEETINGS: Required<Pick<AnalysisFilters, "previous_period" | "current_period">>[] = [
  { previous_period: { start: "2026-07-27", end: "2026-08-02" }, current_period: { start: "2026-08-03", end: "2026-08-09" } },
  { previous_period: { start: "2026-08-03", end: "2026-08-09" }, current_period: { start: "2026-08-10", end: "2026-08-16" } },
  { previous_period: { start: "2026-07-27", end: "2026-08-09" }, current_period: { start: "2026-08-10", end: "2026-08-23" } },
];
/** 每次會議凍結的本期扣廣告後貢獻（agenda.kpis[].current＝該範圍的本期合計），用 domain 算。 */
const demoContribution = (filters: AnalysisFilters) => analyzeDataset(validateDataset(fixture("demo")).dataset!, { ...filters, comparison_mode: "same_days" }).current.metrics.contribution_after_marketing.value;

const historyChart = (page: Page) => page.getByTestId("chart-meeting-history");
const historyFrame = (page: Page) => historyChart(page).locator(".chart-frame");
const historyRows = (page: Page) => page.getByTestId("chart-meeting-history-table").locator("tbody tr");
const scenariosChart = (page: Page) => page.getByTestId("chart-meeting-scenarios");
const scenarioBars = (page: Page) => scenariosChart(page).locator("[data-testid^='chart-meeting-scenarios-bar-']");

/** 期間列改成該次會議的範圍 → 會議頁「用目前資料更新會議」（範圍不同時在差異橫幅內）→ 結束會議並確認；等歷史多一筆。 */
async function finalizeWith(page: Page, filters: (typeof MEETINGS)[number], count: number) {
  await applyCustomPeriod(page, { previousStart: filters.previous_period.start, previousEnd: filters.previous_period.end, currentStart: filters.current_period.start, currentEnd: filters.current_period.end, mode: "same_days" });
  const meeting = await openMeeting(page);
  if (await meeting.getByTestId("meeting-create").count()) await meeting.getByTestId("meeting-create").click();
  const banner = meeting.getByTestId("review-view-difference");
  await banner.getByRole("button", { name: labels.meeting.buttons.updateMeetingSource, exact: true }).click();
  await expect(banner).toHaveCount(0);
  await meeting.getByTestId("meeting-finalize").click();
  const confirm = meeting.getByTestId("meeting-finalize-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByTestId("meeting-finalize-confirm-button").click();
  await expect(meeting.getByTestId("meeting-status")).toHaveText(labels.meeting.page.finalized);
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(count);
}
/** G19 每張子圖的線（polyline 的點數）、點（data-index）與最後一點；顏色都要是 chartColors.total（沒有強調色）。 */
function historyGeometry(page: Page) {
  return historyFrame(page).evaluate(frame => [...frame.querySelectorAll(".multiple")].map(panel => ({
    lines: [...panel.querySelectorAll("polyline")].map(line => ({ points: (line.getAttribute("points") ?? "").trim().split(/\s+/).length, xs: (line.getAttribute("points") ?? "").trim().split(/\s+/).map(pair => Number(pair.split(",")[0])), stroke: line.getAttribute("stroke") })),
    dots: [...panel.querySelectorAll("circle.multiple-point, circle.multiple-last")].map(dot => ({ index: Number(dot.getAttribute("data-index")), last: dot.classList.contains("multiple-last"), cx: Number(dot.getAttribute("cx")), fill: dot.getAttribute("fill") })),
    gaps: [...panel.querySelectorAll("text.multiple-gap")].map(text => text.textContent),
  })));
}
/** ≤ 767px 時 C26 小倍數框高＝chartHeights.sm × 子圖數（2），其餘 chartHeights.sm；空狀態與有圖同高。 */
const expectedFrameHeight = (page: Page) => page.viewportSize()!.width < 768 ? chartHeights.sm * 2 : chartHeights.sm;
/** 在柱上送一個會冒泡的 click 事件（svg 不接指標事件），確認沒有開「計算與來源」抽屜（PRD §8.7 例外）。 */
async function expectNotClickable(page: Page, target: Locator) {
  await target.dispatchEvent("click");
  await page.waitForTimeout(200);
  await expect(evidenceDrawer(page)).toHaveCount(0);
}

test("G19：結束 1 次會議＝等高空狀態；同資料集、同期間長度的第 2 次＝資料表 2 列、兩點相連；期間長度不同的第 3 次＝該列「否，期間不同」、圖上不與前一點相連；點與線都是 chartColors.total", async ({ page }) => {
  await loadDemoForPresent(page);
  // 0 次：v3 的空狀態區塊在前，G19 的等高空狀態接在後面（審查 A-4）。
  let meeting = await openMeeting(page);
  await expect(meeting.getByTestId("meeting-history").locator(".meeting-history-empty")).toBeVisible();
  await expect(historyFrame(page)).toHaveAttribute("data-state", "empty");

  await finalizeWith(page, MEETINGS[0], 1);
  meeting = await openMeeting(page);
  await expect(historyChart(page)).toHaveCount(1);
  await expect(historyFrame(page)).toHaveAttribute("data-state", "empty");
  await expect(historyFrame(page)).toHaveText(history.empty);
  await expect(historyChart(page).locator("h3")).toHaveText(history.section);
  expect((await historyFrame(page).boundingBox())!.height).toBeCloseTo(expectedFrameHeight(page), 0);

  await finalizeWith(page, MEETINGS[1], 2);
  await expect(historyFrame(page)).toHaveAttribute("data-state", "ready");
  expect((await historyFrame(page).boundingBox())!.height).toBeCloseTo(expectedFrameHeight(page), 0);
  await expect(historyFrame(page)).toHaveAttribute("aria-hidden", "true");
  await expect(historyFrame(page).locator("button, a[href], [tabindex], details")).toHaveCount(0);
  const [w1, w2, w3] = MEETINGS.map(demoContribution);
  await expect(historyChart(page).locator("h3")).toHaveText(fill(history.title, { n: 2, metric: metricDefinitions.contribution_after_marketing.label, a: formatAmountL1(w1), b: formatAmountL1(w2) }));
  let geometry = await historyGeometry(page);
  expect(geometry.map(panel => panel.lines.map(line => line.points)), "兩張子圖各一條、各 2 點").toEqual([[2], [2]]);
  for (const panel of geometry) {
    expect(panel.lines.every(line => line.stroke === chartColors.total)).toBe(true);
    expect(panel.dots.map(dot => dot.fill)).toEqual([chartColors.total, chartColors.total]);
    expect(panel.gaps).toEqual([]);
  }
  await openDataTable(historyChart(page));
  await expect(historyRows(page)).toHaveCount(2);
  await expect(historyRows(page).locator("td:last-child")).toHaveText([history.comparable.first, history.comparable.yes]);
  await expect(historyChart(page).locator("button.number-link")).toHaveCount(0);

  await finalizeWith(page, MEETINGS[2], 3);
  await expect(historyFrame(page)).toHaveAttribute("data-state", "ready");
  await expect(historyRows(page)).toHaveCount(3);
  await expect(historyRows(page).locator("td:last-child")).toHaveText([history.comparable.first, history.comparable.yes, fill(history.comparable.no, { reason: history.differentPeriod })]);
  // 最新一段只有 1 次（14 天）：標題用區塊名；第 3 點自成一段，與前兩點之間空一個位置、不連線。
  await expect(historyChart(page).locator("h3")).toHaveText(history.section);
  geometry = await historyGeometry(page);
  for (const panel of geometry) {
    expect(panel.lines.map(line => line.points), "只有前兩次相連").toEqual([2]);
    const last = panel.dots.find(dot => dot.last)!;
    expect(panel.dots.map(dot => dot.index)).toEqual([0, 1, 3]);
    expect(last.index).toBe(3);
    expect(panel.lines[0].xs.includes(last.cx), "第 3 點不在任何線上").toBe(false);
    expect(Math.max(...panel.lines[0].xs)).toBeLessThan(last.cx);
    expect(panel.dots.every(dot => dot.fill === chartColors.total), "沒有強調色").toBe(true);
    // 間隙標「期間不同」（4 個位置：1440 每張約 409px、390 單欄約 326px 都放得下；放不下時才不畫，原因仍在資料表）。
    expect(panel.gaps).toEqual([history.differentPeriod]);
  }
  // 值：最後一點標 L1（第 3 次的本期扣廣告後貢獻）。
  await expect(historyFrame(page).locator(".multiple").nth(1).locator("text.chart-value.is-strong")).toHaveText(formatAmountL1(w3));
  // 歷史清單的 v3 DOM 不變：3 筆。
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(3);
});

test("G15 會議實例：golden DTC 方案 1 選入議程 5——在 meeting-agenda-5 內、meeting-scenario-results 之前；1 根柱（尾段＝方案 id）、條端 formatSignedDelta(L1)、不可點、不用強調色；主層可見圖框＝2；投影只顯示議程 1–2", async ({ page }) => {
  await loadValidationDataset(page, "golden");
  await navigateTo(page, "scenarios");
  await selectScenarioChannel(page, "DTC");
  const plan: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  const result = calculateScenario(buildScenarioBaseline(analyzeDataset(validateDataset(fixture("golden")).dataset!).current.channels.DTC, true), plan);
  expect([result.contribution, result.delta]).toEqual(["284.00", "14.00"]);
  const card = page.getByTestId("scenario-1");
  // 五個假設都明填（銷量變化不代填，docs/SCENARIOS.md:68）；同 charts-scenarios.spec 的 calculatePlan。
  const fields: [keyof ScenarioInputs, string][] = [
    ["volume_change_pct", labels.scenarios.inputs.volume.label], ["discount_change_pp", labels.scenarios.inputs.discount.label], ["fulfillment_change_pct", labels.scenarios.inputs.fulfillmentUnit.label],
    ["ad_change_pct", labels.scenarios.inputs.adSpend.label], ["one_time_cost", labels.scenarios.inputs.oneOff.label],
  ];
  for (const [key, label] of fields) await card.getByLabel(label, { exact: true }).fill(String(plan[key]));
  await acceptAssumptions(card);
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1(result.contribution!));

  const meeting = await openMeeting(page);
  const agenda5 = meeting.getByTestId("meeting-agenda-5");
  // 沒有選入方案時不渲染（議程 5 維持 v3 的區段型空狀態）。
  await expect(scenariosChart(page)).toHaveCount(0);
  await expect(agenda5.getByTestId("meeting-scenario-results-empty")).toBeVisible();
  const select = agenda5.getByLabel(fill(review.scenarioSelect, { channel: "DTC" }), { exact: true });
  await select.selectOption({ label: fill(review.planOption, { name: fill(labels.scenarios.decision.defaultPlanName, { n: 1 }) }) });
  const planId = /::(.+)::\d+$/.exec(await select.inputValue())![1];

  await expect(agenda5.getByTestId("chart-meeting-scenarios")).toHaveCount(1);
  const order = await page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector)!;
    return !!(at("[data-testid='chart-meeting-scenarios']").compareDocumentPosition(at("[data-testid='meeting-scenario-results']")) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order, "G15 在每通路選入列之前").toBe(true);
  await expect(scenariosChart(page).locator("h4")).toHaveText(fill(g15.title, { n: 1 }));
  await expect(scenarioBars(page)).toHaveCount(1);
  await expect(scenarioBars(page)).toHaveAttribute("data-testid", `chart-meeting-scenarios-bar-${planId}`);
  await expect(scenarioBars(page)).toHaveAttribute("fill", chartColors.favorable);
  await expect(scenarioBars(page)).not.toHaveAttribute("fill", chartColors.current);
  await expect(scenariosChart(page).locator("svg.chart-ranked-bars text.ranked-value")).toHaveText(formatSignedDelta(result.delta, "L1"));
  await expect(scenariosChart(page).locator(".chart-frame")).toHaveAttribute("aria-hidden", "true");
  await expect(scenariosChart(page).locator(".chart-frame").locator("button, a[href], [tabindex], details")).toHaveCount(0);
  await expectNotClickable(page, scenarioBars(page));
  const table = await openDataTable(scenariosChart(page));
  await expect(table.getByTestId("chart-meeting-scenarios-table").locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("button.number-link")).toHaveCount(0);
  // 會議頁主層可見的圖框：G15 會議實例、G19（等高空狀態）＝2（試算工作台在其他頁以 hidden 掛載，不算）。
  await expect(page.locator(VISIBLE_CHART_FRAMES)).toHaveCount(2);

  // 投影（≥ 768 才有按鈕）：議程 5 與會議歷史連同兩張圖掛載但不可見；議程 1–2 可見（present-mode.spec 的會議頁斷言不變）。
  if (isMobile(page)) {
    await expect(presentToggle(page)).toBeHidden();
    return;
  }
  await enterPresent(page);
  for (const id of ["meeting-agenda-1", "meeting-agenda-2"]) await expect(meeting.getByTestId(id)).toBeVisible();
  for (const id of ["meeting-agenda-5", "chart-meeting-scenarios", "meeting-history", "chart-meeting-history"]) await expectMountedHidden(page.getByTestId(id));
  await page.keyboard.press("Escape");
  await expectPresentOff(page);
  await expect(scenariosChart(page)).toBeVisible();
});
