import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { clickReplacing } from "../../tests/e2e/replacement-helpers";

const pages = [
  { file: "overview", nav: "經營總覽" },
  { file: "diagnosis", nav: "通路診斷" },
  { file: "scenarios", nav: "情境試算" },
  { file: "actions", nav: "行動摘要" },
  { file: "data", nav: "資料工作區" },
] as const;

test("R0 改版前截圖：載入示範後五個頁面", async ({ page }, testInfo) => {
  const dir = resolve("verification/revamp-R0/before");
  await mkdir(dir, { recursive: true });
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: "載入示範資料", exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
  for (const [index, item] of pages.entries()) {
    await page.getByRole("button", { name: item.nav, exact: true }).click();
    await expect(page.getByRole("heading", { name: item.nav, exact: true, level: 1 })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const name = `${index + 1}-${item.file}-${testInfo.project.name}`;
    await page.screenshot({ path: `${dir}/${name}-viewport.png` });
    await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
  }
});
