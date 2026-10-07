import { expect, type Locator } from "@playwright/test";
import { labels } from "../../src/i18n";

/**
 * V3-6（D-V3-12＝B）：試算聲明「我了解這是試算，不是預測」同一工作區勾一次就記住（寫進 scenario_workspace.assumptions_acknowledged_at），
 * 直到清空目前資料；換通路、換期間、取代資料都沿用。
 * - 第一次（state "first"）：方案卡有勾選框（data-testid scenario-accept，標籤 labels.scenario.acceptAssumptions）。點下去後勾選框立刻換成一行說明
 *   p[data-testid=scenario-acknowledged]（labels.scenarios.pageV3.acknowledged），焦點移到該方案的「試算」。
 *   Playwright 的 check() 點完會再讀一次勾選狀態，元素已被移除時會一直重試到逾時，所以這裡改用 click()，再斷言換成說明與焦點。
 * - 記住之後（state "remembered"）：沒有勾選框，只有說明。
 * 不傳 state 時依畫面上有沒有勾選框決定（給不確定是否已勾過的流程用）。
 */
export async function acceptScenarioAssumptions(card: Locator, state?: "first" | "remembered") {
  const box = card.getByLabel(labels.scenario.acceptAssumptions, { exact: true });
  const remembered = card.getByTestId("scenario-acknowledged");
  const first = state ? state === "first" : (await box.count()) > 0;
  if (first) {
    await expect(box).toHaveAttribute("data-testid", "scenario-accept");
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toHaveCount(0);
    await expect(remembered).toHaveText(labels.scenarios.pageV3.acknowledged);
    await expect(card.getByRole("button", { name: labels.buttons.calculate, exact: true })).toBeFocused();
  } else {
    await expect(box).toHaveCount(0);
    await expect(remembered).toHaveText(labels.scenarios.pageV3.acknowledged);
  }
}
