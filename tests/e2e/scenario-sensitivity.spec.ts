import { clickReplacing, dismissSavePrompt, openValidation, selectScenarioChannel, startChannelContext } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL2, formatPercentNumber, formatSignedDelta } from "../../src/application/presentation";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const validation = labels.ui.dashboard.validation;
const copy = labels.ui.scenarioSensitivity;
const channelField = labels.ui.dashboard.filter.channel;
/** R2 renamed the per-letter sensitivity inputs/rows; A／B／C are plain labels, built from the same templates the component uses. */
const letter = (index: number) => String.fromCharCode(65 + index);
const sensitivityInput = (index: number) => fill(copy.inputLabel, { letter: letter(index) });
const sensitivityRow = (index: number) => new RegExp(fill(copy.rowLabel, { letter: letter(index) }));
/** Main-layer caution is the single "注意：…" sentence (03_GLOSSARY_COPY §8); the rest moved into 技術細節. */
const mainCaution = `${labels.sections.caution}：${labels.basis.items[6]}`;
const dw = labels.ui.decisionWorkbench;
/** V3-2a：狀態列「資料到 {date}」，日期取 golden manifest 的 data_as_of（不在測試內另寫日期）。 */
const goldenReady = fill(labels.status.ready, { date: (JSON.parse(readFileSync(resolve("fixtures/golden/manifest.json"), "utf8")) as { data_as_of: string }).data_as_of });
const inputValues = ["-3", "-2.5", "0"] as const;
/**
 * V3-2b：三個假設的比較表是 L2（銷量增減一位小數帶號、試算結果整數元、與現況相比帶號整數元，表頭「（元）」）；
 * 傳入 golden 的精確字串（domain 到分），顯示文字一律由呈現層格式化函式產生。delta 手算＝contribution − 本期基準 270.00。
 */
const golden = {
  base: [
    { volume: "-3", contribution: "267.38", delta: "-2.62" },
    { volume: "-2.5", contribution: "270.15", delta: "0.15" },
    { volume: "0", contribution: "284.00", delta: "14.00" },
  ],
  oneOff: [
    { volume: "1", contribution: "269.54", delta: "-0.46" },
    { volume: "1.1", contribution: "270.09", delta: "0.09" },
    { volume: "0", contribution: "264.00", delta: "-6.00" },
  ],
} as const;
async function expectSensitivityRow(sensitivity: Locator, index: number, row: { volume: string; contribution: string; delta: string }) {
  await expect(sensitivity.getByRole("table").getByRole("row", { name: sensitivityRow(index) }).getByRole("cell")).toHaveText([
    formatPercentNumber(row.volume, "L2", { signed: true }), formatAmountL2(row.contribution), formatSignedDelta(row.delta, "L2"),
  ]);
}
/** V3-2b：銷量門檻是 L1（一位小數、帶號、U+2212）；傳入 domain threshold_pct 的精確字串。 */
const thresholdPct = (value: string) => formatPercentNumber(value, "L1", { signed: true });

/** R5-4：三格受控，輸入即寫回方案（plan.sensitivity）。 */
async function fillSensitivity(sensitivity: Locator, values: readonly string[]) {
  for (const [index, value] of values.entries()) await sensitivity.getByLabel(sensitivityInput(index), { exact: true }).fill(value);
}
async function expectSensitivityValues(sensitivity: Locator, values: readonly string[]) {
  for (const [index, value] of values.entries()) await expect(sensitivity.getByLabel(sensitivityInput(index), { exact: true })).toHaveValue(value);
}
async function openSensitivity(sensitivity: Locator) {
  if (await sensitivity.getAttribute("open") === null) await sensitivity.locator(":scope > summary").click();
  await expect(sensitivity.getByLabel(sensitivityInput(0), { exact: true })).toBeVisible();
}

// 每個案例都是多段流程（載入→試算→敏感度→換通路／下載）；比照 review-v2-a 長流程把逾時放寬到 120 秒（平行代理共用伺服器時單步明顯變慢），斷言不放寬。
test.describe.configure({ timeout: 120_000 });

async function openPlan(page: Page, investment = "0") {
  await page.goto("/");
  await openValidation(page);
  await page.getByLabel(validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(goldenReady);
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  await page.getByLabel(channelField, { exact: true }).selectOption("DTC");
  // R5-3 進頁即表單：方案 1 是進頁草稿，不按「新增方案」。
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  const card = page.getByTestId("scenario-1");
  await expect(card.getByTestId("scenario-draft")).toHaveText(labels.scenario.draft);
  await card.getByLabel(dw.planName, { exact: true }).fill("履約改善條件檢核");
  for (const [label, value] of Object.entries({
    [labels.scenario.volume.label]: "0", [labels.scenario.discount.label]: "0", [labels.scenario.fulfillmentUnit.label]: "-10",
    [labels.scenario.adSpend.label]: "0", [labels.scenario.oneOff.label]: investment,
  })) await card.getByLabel(label, { exact: true }).fill(value);
  await expect(card.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  // V3-2b：試算結果大字是 L1（formatAmountL1）。
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1(investment === "0" ? "284.00" : "264.00"));
  const sensitivity = card.getByTestId("scenario-sensitivity");
  await sensitivity.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toBeVisible();
  return { card, sensitivity };
}

test("PL-08 分開零貢獻與維持 baseline 目標，三組 v 明填後獨立重算", async ({ page }, testInfo) => {
  const events: { kind: string; type: string }[] = [];
  page.on("pageerror", error => events.push({ kind: "pageerror", type: error.name }));
  page.on("console", event => { if (event.type() === "error") events.push({ kind: "console", type: event.type() }); });
  const { sensitivity } = await openPlan(page);
  await expect(sensitivity.getByTestId("threshold-zero_contribution").getByTestId("threshold-pct")).toHaveText(thresholdPct("-51.263537906137"));
  await expect(sensitivity.getByTestId("threshold-maintain_baseline").getByTestId("threshold-pct")).toHaveText(thresholdPct("-2.527075812274"));
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText(fill(copy.thresholdExact, { direction: copy.directionAtOrAbove }));
  // 主層只留一句「注意：…」（§8）；「不是公司淨利」「不提供成功機率」等免責已集中到口徑說明或刪除。
  await expect(sensitivity.locator(":scope > p.note").first()).toHaveText(mainCaution);
  await expect(sensitivity).toContainText(copy.fixedAssumptionsTechnical);
  await expect(sensitivity).toContainText(copy.inputsHint);
  await expectSensitivityValues(sensitivity, ["", "", ""]);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText(copy.reasons.SENSITIVITY_VOLUME_REQUIRED);
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  await fillSensitivity(sensitivity, inputValues);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  for (const [index, row] of golden.base.entries()) await expectSensitivityRow(sensitivity, index, row);
  // 「不可相加」改由口徑說明第 7 條（主層注意句）承載。
  await expect(sensitivity).toContainText(labels.basis.items[6]);
  const region = sensitivity.getByRole("region", { name: copy.tableAria });
  await region.focus(); await expect(region).toBeFocused();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate(element => element.clientWidth));
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-sensitivity-${testInfo.project.name}.png`), fullPage: true });
  // R5-4：三組輸入跟著方案保存，決策 JSON 匯出帶出 plan.sensitivity.volumes 與 analysis.rows（以原基準重算，與畫面一致）。
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: labels.downloads.decisionJson, exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("profitlens-decision.json");
  const path = await download.path();
  expect(path).not.toBeNull();
  const document = JSON.parse(await readFile(path!, "utf8")) as { scenarios: { name: string; sensitivity: null | { volumes: string[]; analysis: null | { status: string; sensitivity_status: string; rows: { volume_change_pct: string; contribution: string; delta: string }[] } } }[] };
  expect(document.scenarios).toHaveLength(1);
  expect(document.scenarios[0].name).toBe("履約改善條件檢核");
  expect(document.scenarios[0].sensitivity?.volumes).toEqual([...inputValues]);
  expect(document.scenarios[0].sensitivity?.analysis).toMatchObject({ status: "valid", sensitivity_status: "valid" });
  expect(document.scenarios[0].sensitivity?.analysis?.rows.map(row => row.contribution)).toEqual(golden.base.map(row => row.contribution));
  // JSON 維持 domain 的精確字串（ASCII 負號、到分）；同時核對上面手算的 delta。
  expect(document.scenarios[0].sensitivity?.analysis?.rows.map(row => row.delta)).toEqual(golden.base.map(row => row.delta));
  await appendFile(resolve("verification/review-v2-a-regression-sensitivity-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, title: testInfo.title, recorded_at: new Date().toISOString(), events })}\n`);
  expect(events).toEqual([]);
});

test("PL-08 一次性投入門檻跨越原貢獻，非法 v 保留未知而不外插", async ({ page }) => {
  const { sensitivity } = await openPlan(page, "20");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline").getByTestId("threshold-pct")).toHaveText(thresholdPct("1.083032490975"));
  for (const [index, value] of golden.oneOff.map(row => row.volume).entries()) await sensitivity.getByLabel(sensitivityInput(index), { exact: true }).fill(value);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  for (const [index, row] of golden.oneOff.entries()) await expectSensitivityRow(sensitivity, index, row);
  await sensitivity.getByLabel(sensitivityInput(1), { exact: true }).fill("100.1");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  // V3-2a：逐列錯誤改由 scenarioReasonText 依原因碼組字，前綴與畫面列名同一模板「假設 {letter}：」（第 2 格＝B），不再顯示 domain 的「假設 n」。
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText(`${fill(copy.rowLabel, { letter: letter(1) })}：${copy.reasons.INPUT_OUT_OF_RANGE}`);
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
});

test("PL-08 換通路後不顯示可用的舊門檻，未填銷量或未同意仍無衍生分析", async ({ page }) => {
  const { card, sensitivity } = await openPlan(page);
  // R5-4：三格受控並跟著方案保存。
  await fillSensitivity(sensitivity, inputValues);
  await card.getByLabel(labels.scenario.volume.label, { exact: true }).fill("");
  await expect(sensitivity).toHaveCount(0);
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(sensitivity).toHaveCount(0);
  await card.getByLabel(labels.scenario.volume.label, { exact: true }).fill("0");
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).uncheck();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-result")).toContainText(dw.planUnavailable);
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(sensitivity).toHaveCount(0);
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1("284.00"));
  // 重算後預填：三格帶回保存的值，三格都有值時直接顯示結果。
  await openSensitivity(sensitivity);
  await expectSensitivityValues(sensitivity, inputValues);
  await expectSensitivityRow(sensitivity, 0, golden.base[0]);
  // 全站篩選切到 MARKETPLACE：試算頁跟著換到 MARKETPLACE，只有進頁草稿，沒有可用的舊門檻。
  await page.getByLabel(channelField, { exact: true }).selectOption("MARKETPLACE");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("MARKETPLACE");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText(formatAmountL1("-15.00"));
  await expect(card.getByLabel(dw.planName, { exact: true })).toHaveValue(fill(dw.defaultPlanName, { n: 1 }));
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(page.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await page.getByLabel(channelField, { exact: true }).selectOption("DTC");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1("284.00"));
  await openSensitivity(sensitivity);
  await expectSensitivityValues(sensitivity, inputValues);
  await expectSensitivityRow(sensitivity, 2, golden.base[2]);
  // R5-3：試算頁自己的通路單選只換本頁（全站篩選仍是 DTC），換過去一樣沒有舊門檻；換回來三格與結果仍在。
  await selectScenarioChannel(page, "MARKETPLACE");
  await expect(page.getByLabel(channelField, { exact: true })).toHaveValue("DTC");
  await expect(page.getByTestId("baseline-contribution_after_marketing")).toHaveText(formatAmountL1("-15.00"));
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(page.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await selectScenarioChannel(page, "DTC");
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1("284.00"));
  await openSensitivity(sensitivity);
  await expectSensitivityValues(sensitivity, inputValues);
  await expectSensitivityRow(sensitivity, 1, golden.base[1]);
});
