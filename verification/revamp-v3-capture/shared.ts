import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";

// V3-0 基準共用的操作：所有字串由 labels 取字，與 tests/e2e 同一套選擇器。

/** 固定時鐘（台北 2026-10-05 10:00）：行動到期日、會議日期等「今天」衍生的文字不會因執行日不同而變。計時器照常執行。 */
export const FIXED_NOW = new Date("2026-10-05T10:00:00+08:00");

export const nav = (page: Page, id: keyof typeof labels.nav) => page.getByRole("button", { name: labels.nav[id].label, exact: true });

/** 新訪客：開首頁 → 載入示範資料 → 拒絕本機保存提示（量測狀態：示範資料 ready、沒有保存提示）。 */
export async function loadDemo(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready.replace("{date}", ""));
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("top-three")).toBeVisible();
  await expect(page.locator(".kpi-grid article.kpi-card")).toHaveCount(5);
}

export async function goTo(page: Page, id: keyof typeof labels.nav, anchor: Locator) {
  await nav(page, id).click();
  await expect(anchor).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** 試算：方案 1 套用「維持現況」範本 → 同意假設 → 計算（與 R7 走查相同）。 */
export async function calculateKeepPreset(page: Page) {
  await page.getByTestId("decision-workbench").waitFor({ state: "visible" });
  const card = page.getByTestId("scenario-1");
  await card.waitFor({ state: "visible" });
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
}

export const evidenceDrawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
