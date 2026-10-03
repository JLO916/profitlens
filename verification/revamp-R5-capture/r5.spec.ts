import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { clickReplacing, startChannelContext } from "../../tests/e2e/replacement-helpers";

// R5 截圖：健檢清單（golden）、試算表單（golden，套用雙 11 範本並切到絕對值）、行動看板（demo，兩張待辦、一張在進行中）、商品 Top／Bottom（golden）；四尺寸。
// 只拍照，不斷言產品行為；這裡的 expect 只用來等畫面到位。
async function shoot(page: Page, dir: string, name: string, anchor?: Locator) {
  if (anchor) await anchor.evaluate(element => element.scrollIntoView({ block: "start" }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${name}-viewport.png` });
  await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}
const nav = (page: Page, id: keyof typeof labels.nav) => page.getByRole("button", { name: labels.nav[id].label, exact: true });
async function load(page: Page, id: "golden" | "demo") {
  await page.goto("/");
  await nav(page, "validation").click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready);
}
const modeButton = (card: Locator, field: string) => card.getByTestId(`scenario-mode-${field}`).getByRole("button", { name: labels.scenario.modeAbsolute, exact: true });

test("R5 截圖", async ({ page }, testInfo) => {
  // R5_CAPTURE_DIR 只供試跑時把圖輸出到別處（不覆寫證據檔）；正式流程不設，輸出到 verification/revamp-R5。
  const dir = resolve(process.env.R5_CAPTURE_DIR ?? "verification/revamp-R5");
  await mkdir(dir, { recursive: true });
  const suffix = testInfo.project.name;

  await load(page, "golden");
  await nav(page, "diagnosis").click();
  await expect(page.getByTestId("diagnosis-list")).toBeVisible();
  await shoot(page, dir, `1-diagnosis-list-${suffix}`);

  await nav(page, "scenarios").click();
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("double11");
  await card.getByTestId("scenario-preset-apply").click();
  await expect(card.getByTestId("scenario-preset-purpose")).toBeVisible();
  // 切到絕對值時該格預填反推值；改填接近範本的絕對值（DTC 本期 4 件 → 6 件、廣告 270 → 540 元），畫面顯示等值相對值。
  for (const [field, label, value] of [["volume_change_pct", labels.scenario.volume.label, "6"], ["ad_change_pct", labels.scenario.adSpend.label, "540"]] as const) {
    await modeButton(card, field).click();
    await card.getByLabel(label, { exact: true }).fill(value);
    await expect(card.getByTestId(`scenario-equivalent-${field}`)).toBeVisible();
  }
  await shoot(page, dir, `2-scenario-form-${suffix}`, card);

  await nav(page, "products").click();
  await expect(page.getByTestId("product-worst")).toBeVisible();
  await shoot(page, dir, `4-products-top-bottom-${suffix}`, page.locator(".product-highlights"));

  await load(page, "demo");
  for (const index of [0, 1]) {
    await nav(page, "diagnosis").click();
    const row = page.getByTestId("diagnosis-list").locator(":scope > li > details.diagnosis-row").nth(index);
    await row.getByRole("button", { name: labels.buttons.addToActions, exact: true }).click();
    await expect(page.getByTestId(`board-card-${index + 1}`)).toBeVisible();
  }
  await page.getByTestId("board-card-1-move-in_progress").click();
  await expect(page.getByTestId("board-column-in_progress").getByTestId("board-card-1")).toBeVisible();
  await shoot(page, dir, `3-action-board-${suffix}`, page.getByTestId("actions-workbench"));
});
