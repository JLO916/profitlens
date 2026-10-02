import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { clickReplacing } from "../../tests/e2e/replacement-helpers";
import { labels } from "../../src/i18n";

const pages = [
  { file: "overview", nav: labels.nav.overview.label },
  { file: "diagnosis", nav: labels.nav.diagnosis.label },
  { file: "scenarios", nav: labels.nav.scenarios.label },
  { file: "actions", nav: labels.nav.actions.label },
  { file: "data", nav: labels.nav.data.label },
] as const;

test("R2 語言層改版後截圖：載入示範後五個頁面", async ({ page }, testInfo) => {
  const dir = resolve("verification/revamp-R2");
  await mkdir(dir, { recursive: true });
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
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
  // 口徑說明與「怎麼算的」抽屜各拍一張（桌面）
  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
    await page.getByRole("button", { name: new RegExp(labels.buttons.basis) }).first().click();
    await expect(page.getByTestId("basis-dialog")).toBeVisible();
    await page.screenshot({ path: `${dir}/6-basis-dialog-desktop.png` });
    await page.keyboard.press("Escape");
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button").click();
    await expect(page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) })).toBeVisible();
    await page.screenshot({ path: `${dir}/7-evidence-drawer-desktop.png` });
    await page.keyboard.press("Escape");
  }
});
