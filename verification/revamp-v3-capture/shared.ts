import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { navControl, navigateTo, type NavId } from "../../tests/e2e/replacement-helpers";

// V3-0 基準共用的操作：所有字串由 labels 取字，與 tests/e2e 同一套選擇器。

/** 固定時鐘（台北 2026-10-05 10:00）：行動到期日、會議日期等「今天」衍生的文字不會因執行日不同而變。計時器照常執行。 */
export const FIXED_NOW = new Date("2026-10-05T10:00:00+08:00");

/**
 * 目前看得到的導覽控制（V3-3：桌機是側欄按鈕；手機是底部分頁列，商品毛利／假設試算／資料來源／開發者驗證在「更多」面板裡，要先開面板）。
 * 只在桌機直接 .click()（metrics.spec.ts）；四尺寸的走查請用 goTo／navigateTo（手機會先開「更多」）。
 */
export const nav = (page: Page, id: NavId) => navControl(page, id);
export { navigateTo };

/** 新訪客：開首頁 → 載入示範資料 → 拒絕本機保存提示（量測狀態：示範資料 ready、沒有保存提示）。 */
export async function loadDemo(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready.replace("{date}", ""));
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("top-three")).toBeVisible();
  // V3-4a：KPI 帶（C1）取代五張卡；五格仍帶 kpi-* testid。
  await expect(page.locator(".kpi-band [data-testid^='kpi-']")).toHaveCount(5);
}

/** V3-3：經 navigateTo 切頁（桌機側欄；手機底部分頁列或「更多」），等 anchor 可見後捲回頂端。 */
export async function goTo(page: Page, id: NavId, anchor: Locator) {
  await navigateTo(page, id);
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
  // V3-6（D-V3-12＝B）：聲明勾一次就記住；checkbox 勾完即卸載（改顯示 scenario-acknowledged），所以用 click() 而不是 check()。
  const consent = card.getByTestId("scenario-accept");
  if (await consent.count()) await consent.click();
  await expect(card.getByTestId("scenario-acknowledged")).toBeVisible();
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
}

export const evidenceDrawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence}$`) });
