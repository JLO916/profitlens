import { clickReplacing, startChannelContext } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const validation = labels.ui.dashboard.validation;
const copy = labels.ui.scenarioSensitivity;
const channelField = labels.ui.dashboard.filter.channel;
/** R2 renamed the per-letter sensitivity inputs/rows; A／B／C are plain labels, built from the same templates the component uses. */
const letter = (index: number) => String.fromCharCode(65 + index);
const sensitivityInput = (index: number) => fill(copy.inputLabel, { letter: letter(index) });
const sensitivityRow = (index: number) => new RegExp(fill(copy.rowLabel, { letter: letter(index) }));
/** Main-layer caution is the single "注意：…" sentence (03_GLOSSARY_COPY §8); the rest moved into 技術細節. */
const mainCaution = `${labels.sections.caution}：${labels.basis.items[6]}`;

async function openPlan(page: Page, investment = "0") {
  await page.goto("/");
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready);
  await page.getByLabel(channelField, { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await startChannelContext(page);
  await page.getByRole("button", { name: labels.buttons.addScenario, exact: true }).click();
  const card = page.getByTestId("scenario-1");
  await card.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true }).fill("履約改善條件檢核");
  for (const [label, value] of Object.entries({
    [labels.scenario.volume.label]: "0", [labels.scenario.discount.label]: "0", [labels.scenario.fulfillmentUnit.label]: "-10",
    [labels.scenario.adSpend.label]: "0", [labels.scenario.oneOff.label]: investment,
  })) await card.getByLabel(label, { exact: true }).fill(value);
  await expect(card.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(investment === "0" ? "284.00" : "264.00");
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
  await expect(sensitivity.getByTestId("threshold-zero_contribution")).toContainText("-51.263537906137%");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText("-2.527075812274%");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText(fill(copy.thresholdExact, { direction: copy.directionAtOrAbove }));
  // 主層只留一句「注意：…」（§8）；「不是公司淨利」「不提供成功機率」等免責已集中到口徑說明或刪除。
  await expect(sensitivity.locator(":scope > p.note").first()).toHaveText(mainCaution);
  await expect(sensitivity).toContainText(copy.fixedAssumptionsTechnical);
  await expect(sensitivity).toContainText(copy.inputsHint);
  for (const index of [0, 1, 2]) await expect(sensitivity.getByLabel(sensitivityInput(index), { exact: true })).toHaveValue("");
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText(copy.reasons.SENSITIVITY_VOLUME_REQUIRED);
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  for (const [index, value] of ["-3", "-2.5", "0"].entries()) await sensitivity.getByLabel(sensitivityInput(index), { exact: true }).fill(value);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  const table = sensitivity.getByRole("table");
  await expect(table.getByRole("row", { name: sensitivityRow(0) })).toContainText("267.38");
  await expect(table.getByRole("row", { name: sensitivityRow(1) })).toContainText("270.15");
  await expect(table.getByRole("row", { name: sensitivityRow(2) })).toContainText("284.00");
  // 「不可相加」改由口徑說明第 7 條（主層注意句）承載。
  await expect(sensitivity).toContainText(labels.basis.items[6]);
  const region = sensitivity.getByRole("region", { name: copy.tableAria });
  await region.focus(); await expect(region).toBeFocused();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate(element => element.clientWidth));
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-sensitivity-${testInfo.project.name}.png`), fullPage: true });
  await appendFile(resolve("verification/review-v2-a-regression-sensitivity-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, title: testInfo.title, recorded_at: new Date().toISOString(), events })}\n`);
  expect(events).toEqual([]);
});

test("PL-08 一次性投入門檻跨越原貢獻，非法 v 保留未知而不外插", async ({ page }) => {
  const { sensitivity } = await openPlan(page, "20");
  await expect(sensitivity.getByTestId("threshold-maintain_baseline")).toContainText("1.083032490975%");
  for (const [index, value] of ["1", "1.1", "0"].entries()) await sensitivity.getByLabel(sensitivityInput(index), { exact: true }).fill(value);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  await expect(sensitivity.getByRole("table")).toContainText("269.54");
  await expect(sensitivity.getByRole("table")).toContainText("270.09");
  await expect(sensitivity.getByRole("table")).toContainText("264.00");
  await sensitivity.getByLabel(sensitivityInput(1), { exact: true }).fill("100.1");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
  await sensitivity.getByRole("button", { name: copy.recalc, exact: true }).click();
  // 逐列錯誤前綴「假設 n：」來自 src/domain/scenario-sensitivity.ts（財務核心禁區，未入 labels），維持原字。
  await expect(sensitivity.getByTestId("sensitivity-result")).toContainText("假設 2");
  await expect(sensitivity.getByRole("table")).toHaveCount(0);
});

test("PL-08 換通路後不顯示可用的舊門檻，未填銷量或未同意仍無衍生分析", async ({ page }) => {
  const { card, sensitivity } = await openPlan(page);
  await card.getByLabel(labels.scenario.volume.label, { exact: true }).fill("");
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(sensitivity).toHaveCount(0);
  await card.getByLabel(labels.scenario.volume.label, { exact: true }).fill("0");
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await sensitivity.locator(":scope > summary").click();
  await page.getByLabel(channelField, { exact: true }).selectOption("MARKETPLACE");
  await expect(card).toHaveCount(0);
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-sensitivity")).toHaveCount(0);
  await page.getByLabel(channelField, { exact: true }).selectOption("DTC");
  await expect(card.getByTestId("scenario-contribution")).toHaveText("284.00");
  await sensitivity.locator(":scope > summary").click();
  await expect(sensitivity.getByLabel(sensitivityInput(0), { exact: true })).toHaveValue("");
});
