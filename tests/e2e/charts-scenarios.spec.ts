// V4-5 代理 C（06_BATCHES V4-5「驗收重點」的瀏覽器部分；CHART_CATALOG G15、G16 的 E2E 草案；PRD §4.4–§4.7 G15、G16、§8.7、X29；D-V4-20＝A′）：
// 試算頁 G15 方案差額（方案欄之後、方案比較表之前，全頁一份）與 G16 要賣到多少才划算（每個方案欄的 scenario-sensitivity 內，只畫點、不連線）。
// golden DTC 兩個方案（f−10%＝284.00、f−10%＋K20＝264.00）與 4 通路合成資料 MARKETPLACE（零貢獻門檻 104% 超出範圍）各一條；總覽頁 main .chart-frame:visible 仍是 4。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的數字在 Node 端以同一組 domain、application 函式算（不寫死）。
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors } from "../../src/application/chart-theme";
import { formatHeadlineAmount } from "../../src/application/copy";
import { formatAmountL1, formatSignedDelta } from "../../src/application/presentation";
import { thresholdDescription, thresholdTargetLabel } from "../../src/application/scenario-threshold-text";
import { analyzeDataset } from "../../src/domain/analysis";
import { analyzeScenarioSensitivity } from "../../src/domain/scenario-sensitivity";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "../../src/domain/scenarios";
import { validateDataset } from "../../src/domain/validation";
import { fixture } from "../helpers/fixtures";
import { VISIBLE_CHART_FRAMES, calculateKeep, importSynthetic, openDataTable, openSensitivityChart, scenarioCard, scenarioVarianceBars, scenarioVarianceSection, scenarioVarianceValues, thresholdPoint, thresholdPoints, thresholdSection } from "./chart-helpers-v4";
import { loadValidationDataset } from "./breakeven-helpers-v39";
import { evidenceDrawer } from "./launch-helpers-v310";
import { navigateTo, selectScenarioChannel } from "./replacement-helpers";
import { acceptAssumptions } from "./scenario-helpers-v3";

const variance = labels.scenarios.chartsV4.variance;
const g16 = labels.scenarios.chartsV4.threshold;
const sensitivity = labels.scenarios.sensitivity;
const dw = labels.scenarios.decision;
test.describe.configure({ timeout: 120_000 });

const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
/** golden DTC 的兩個方案（docs/SCENARIOS.md Test anchors）：f−10%（284.00）、f−10%＋一次性 20（264.00）。 */
const PLANS: ScenarioInputs[] = [{ ...zero, fulfillment_change_pct: "-10" }, { ...zero, fulfillment_change_pct: "-10", one_time_cost: "20" }];
const goldenDtc = () => buildScenarioBaseline(analyzeDataset(validateDataset(fixture("golden")).dataset!).current.channels.DTC, true);
const FIELDS: [keyof ScenarioInputs, string][] = [
  ["volume_change_pct", labels.scenarios.inputs.volume.label], ["discount_change_pp", labels.scenarios.inputs.discount.label], ["fulfillment_change_pct", labels.scenarios.inputs.fulfillmentUnit.label],
  ["ad_change_pct", labels.scenarios.inputs.adSpend.label], ["one_time_cost", labels.scenarios.inputs.oneOff.label],
];

/** 方案欄填五個假設、同意聲明（勾一次就記住）、按「試算」，等試算後的扣廣告後貢獻（L1）。 */
async function calculatePlan(card: Locator, inputs: ScenarioInputs, contribution: string) {
  for (const [key, label] of FIELDS) await card.getByLabel(label, { exact: true }).fill(String(inputs[key]));
  await acceptAssumptions(card);
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1(contribution));
}
/** 載入 golden、試算頁改 DTC，方案 1、方案 2 依序試算（284.00、264.00）。 */
async function goldenPlans(page: Page) {
  await loadValidationDataset(page, "golden");
  await expect(page.locator(VISIBLE_CHART_FRAMES)).toHaveCount(4);
  await navigateTo(page, "scenarios");
  await selectScenarioChannel(page, "DTC");
  const results = PLANS.map(inputs => calculateScenario(goldenDtc(), inputs));
  expect(results.map(result => result.contribution)).toEqual(["284.00", "264.00"]);
  await calculatePlan(scenarioCard(page, 1), PLANS[0], results[0].contribution!);
  await page.getByTestId("scenario-add").click();
  await calculatePlan(scenarioCard(page, 2), PLANS[1], results[1].contribution!);
  return results;
}
/**
 * 在柱或點上送一個會冒泡的 click 事件（React 的 onClick 掛在根節點、靠冒泡接收），確認沒有開「計算與來源」抽屜（PRD §8.7 例外）。
 * 不用滑鼠點座標：svg 不接指標事件（pointer-events: none），實際點下去會落到底下或疊在上面的其他元素（390 的期間列），量不到柱與點本身。
 */
async function expectNotClickable(page: Page, target: Locator) {
  await target.dispatchEvent("click");
  await page.waitForTimeout(200);
  await expect(evidenceDrawer(page)).toHaveCount(0);
}

test("G15：golden 兩個方案試算後柱數＝有效方案數、條端文字＝formatSignedDelta(delta, L1)；標題取差額絕對值最大者；柱不可點；總覽 main .chart-frame:visible 仍是 4", async ({ page }) => {
  const results = await goldenPlans(page);
  const section = scenarioVarianceSection(page);
  await expect(section).toHaveCount(1);
  await expect(scenarioVarianceBars(page)).toHaveCount(results.length);
  await expect(scenarioVarianceValues(page)).toHaveText(results.map(result => formatSignedDelta(result.delta, "L1")));
  await expect(section.locator("h2")).toHaveText(fill(variance.title.more, { plan: fill(dw.defaultPlanName, { n: 1 }), amount: formatHeadlineAmount(results[0].delta!) }));
  await expect(section.locator(".chart-frame")).toHaveAttribute("aria-hidden", "true");
  await expect(section.locator(".chart-frame").locator("button, a[href], [tabindex]")).toHaveCount(0);
  // G15 在方案欄之後、方案比較表之前，不在任何 scenario-{n} 內。
  for (const n of [1, 2]) await expect(scenarioCard(page, n).getByTestId("chart-scenarios-variance")).toHaveCount(0);
  const order = await page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector)!;
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { afterColumns: follows(at("[data-testid='scenario-columns']"), at("[data-testid='chart-scenarios-variance']")), beforeCompare: follows(at("[data-testid='chart-scenarios-variance']"), at("section.scenario-compare")) };
  });
  expect(order).toEqual({ afterColumns: true, beforeCompare: true });
  await expectNotClickable(page, scenarioVarianceBars(page).first());
  // 試算工作台以 hidden 掛在每一頁：回到總覽，可見的圖框仍是 4（G15 不算進去）。
  await navigateTo(page, "overview");
  await expect(page.locator(VISIBLE_CHART_FRAMES)).toHaveCount(4);
});

test("G16：展開後門檻點空心（stroke chartColors.target）、填三個假設並試算後多 3 個實心點（chartColors.total）；沒有連線；點在繪圖區內；點不可點", async ({ page }) => {
  await goldenPlans(page);
  const card = scenarioCard(page, 1);
  await openSensitivityChart(card);
  const analysis = analyzeScenarioSensitivity(goldenDtc(), PLANS[0], ["-3", "-2.5", "0"]);
  // D-V4-46＝B：標題＝零貢獻門檻的既有目標名＋既有說明句。
  await expect(thresholdSection(card).locator("h4")).toHaveText(fill(labels.scenarios.chartsV4.threshold.title, { target: thresholdTargetLabel("zero_contribution"), description: thresholdDescription(analysis.targets[0]) }));
  // 三個假設預設空白（X29）：只有兩個門檻點，不代填。
  await expect(thresholdPoints(card)).toHaveCount(2);
  for (const id of ["zero_contribution", "maintain_baseline"]) {
    await expect(thresholdPoint(card, id)).toHaveAttribute("fill", "none");
    await expect(thresholdPoint(card, id)).toHaveAttribute("stroke", chartColors.target);
  }
  await openSensitivityChart(card, ["-3", "-2.5", "0"]);
  await expect(thresholdPoints(card)).toHaveCount(5);
  for (const id of ["a", "b", "c"]) await expect(thresholdPoint(card, id)).toHaveAttribute("fill", chartColors.total);
  // D-V4-20＝A′：圖內沒有連線。
  await expect(thresholdSection(card).locator("svg path, svg polyline, svg polygon")).toHaveCount(0);
  // 所有點的圓心在繪圖區（零線的 x1–x2）內（X29：x 固定 −90%～+100%）。
  const inside = await thresholdSection(card).locator("svg.chart-threshold").evaluate(svg => {
    const zero = svg.querySelector("line.threshold-zero")!;
    const [x1, x2] = [Number(zero.getAttribute("x1")), Number(zero.getAttribute("x2"))];
    return [...svg.querySelectorAll("circle")].map(circle => Number(circle.getAttribute("cx"))).every(x => x >= x1 && x <= x2);
  });
  expect(inside).toBe(true);
  // 圖框 aria-hidden、圖內沒有停留點；資料表 5 列（兩個門檻、A／B／C）。
  await expect(thresholdSection(card).locator(".chart-frame")).toHaveAttribute("aria-hidden", "true");
  await expect(thresholdSection(card).locator(".chart-frame").locator("button, a[href], [tabindex]")).toHaveCount(0);
  const table = await openDataTable(thresholdSection(card));
  await expect(table.getByTestId("chart-scenarios-threshold-table").locator("tbody tr")).toHaveCount(5);
  await expect(table.locator("button.number-link")).toHaveCount(0);
  await expectNotClickable(page, thresholdPoint(card, "zero_contribution"));
  // 方案 2 也有自己的一份（每個 scenario-{n} 一份）。
  await openSensitivityChart(scenarioCard(page, 2));
  await expect(page.getByTestId("chart-scenarios-threshold")).toHaveCount(2);
});

test("G16 超出範圍：4 通路合成資料 MARKETPLACE「維持現況」的零貢獻門檻 104%——零貢獻點不畫，圖下寫「超出範圍」與範圍內都低於目標", async ({ page }) => {
  await page.goto("/");
  await importSynthetic(page);
  await navigateTo(page, "scenarios");
  await selectScenarioChannel(page, "MARKETPLACE");
  const card = scenarioCard(page, 1);
  await calculateKeep(card);
  await openSensitivityChart(card);
  await expect(thresholdPoint(card, "zero_contribution")).toHaveCount(0);
  await expect(thresholdPoint(card, "maintain_baseline")).toHaveCount(1);
  const note = thresholdSection(card).locator(".threshold-out-of-range");
  await expect(note).toBeVisible();
  await expect(note).toHaveText(fill(g16.outOfRange, { target: thresholdTargetLabel("zero_contribution"), outcome: sensitivity.outcomeAllBelow }));
  await expect(note).toContainText(g16.outOfRangeCell);
  // 標題沿用零貢獻目標的既有說明句（超出範圍那一句），D-V4-46＝B 起前面加既有目標名。
  await expect(thresholdSection(card).locator("h4")).toHaveText(fill(g16.title, { target: thresholdTargetLabel("zero_contribution"), description: fill(sensitivity.thresholdOutsideRange, { outcome: sensitivity.outcomeAllBelow }) }));
});
