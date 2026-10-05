import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { calculateKeepPreset, evidenceDrawer, goTo, loadDemo, nav } from "./shared";

// V3-0 ⑤：四尺寸 toHaveScreenshot 基準（PRD §11.7「截圖」、§12.2 V3-0「畫面零變化（toHaveScreenshot 差異 0）」）。
// 走查順序：總覽首屏 → 總覽整頁 → 公式與來源抽屜 → 三件事加入待辦（行動看板）→ 通路健檢 → 商品毛利 → 假設試算（維持現況＋計算）→ 會議紀錄 → 資料來源。
// 基準位置：verification/revamp-v3/V3-0/snapshots/{project}/{名稱}.png（見 verification/revamp-v3.capture.config.ts 的 snapshotPathTemplate）。
// 用 expect.soft：一張不同不會擋住後面幾張，報告一次列出全部差異。
const top = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));

test("V3-0 四尺寸畫面基準", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  await loadDemo(page);
  await top(page);
  await expect.soft(page).toHaveScreenshot("01-overview-top.png");
  await expect.soft(page).toHaveScreenshot("02-overview-full.png", { fullPage: true });

  // 公式與來源抽屜：三件事第 1 列「看證據」。
  await page.getByTestId("top-three").getByRole("button", { name: labels.buttons.viewEvidence, exact: true }).first().click();
  await expect(evidenceDrawer(page)).toBeVisible();
  await expect.soft(page).toHaveScreenshot("03-evidence-drawer.png");
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);

  // 行動看板：三件事第 1 列「加入待辦」會切到待辦頁並新增一張卡。
  await page.getByTestId("top-three").getByRole("button", { name: labels.buttons.addToActions, exact: true }).first().click();
  await expect(page.getByTestId("board-card-1")).toBeVisible();
  await top(page);
  await expect.soft(page).toHaveScreenshot("04-actions-board.png", { fullPage: true });

  await goTo(page, "diagnosis", page.getByTestId("diagnosis-panel"));
  await expect.soft(page).toHaveScreenshot("05-diagnosis.png", { fullPage: true });

  await goTo(page, "products", page.getByTestId("product-table"));
  await expect.soft(page).toHaveScreenshot("06-products.png", { fullPage: true });

  await nav(page, "scenarios").click();
  await calculateKeepPreset(page);
  await top(page);
  await expect.soft(page).toHaveScreenshot("07-scenarios.png", { fullPage: true });

  await goTo(page, "meeting", page.getByTestId("meeting-page"));
  await expect(page.getByTestId("manager-summary")).toBeVisible();
  await expect.soft(page).toHaveScreenshot("08-meeting.png", { fullPage: true });

  await goTo(page, "data", page.getByTestId("targets-entry"));
  await expect.soft(page).toHaveScreenshot("09-data.png", { fullPage: true });

  expect(errors, `${errors.length} console／page errors`).toEqual([]);
});
