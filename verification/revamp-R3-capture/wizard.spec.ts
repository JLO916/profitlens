import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { chooseBasis, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, wizard, commitWizard } from "../../tests/e2e/import-wizard-helpers";

// R3 截圖：精靈四步（第 2 步用中文欄名讓對照表出現）、含稅換算、檢核摘要、匯入後總覽、抽屜原值→換算值、資料頁前處理。
const inclusive = resolve("tests/fixtures/inclusive_tax");
async function shoot(page: Page, dir: string, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${name}-viewport.png` });
  await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}

test("R3 匯入精靈截圖", async ({ page }, testInfo) => {
  const dir = resolve("verification/revamp-R3");
  await mkdir(dir, { recursive: true });
  const suffix = testInfo.project.name;
  await page.goto("/");
  await openWizard(page);
  await shoot(page, dir, `1-step1-empty-${suffix}`);
  const sales = (await readFile(resolve(inclusive, "sales_daily.csv"), "utf8")).replace(/^date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency/, "結帳日,通路,商品貨號,品類,件數,商品金額,折扣,退款,成本,幣別");
  await setWizardFiles(page, inclusive, { "sales_daily.csv": { name: "蝦皮銷售報表.csv", mimeType: "text/csv", buffer: Buffer.from(sales) } });
  await shoot(page, dir, `2-step1-files-${suffix}`);
  await nextFromFiles(page);
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await shoot(page, dir, `3-step2-mapping-${suffix}`);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "inclusive");
  await shoot(page, dir, `4-step3-basis-${suffix}`);
  await confirmAndCheck(page, "valid");
  await shoot(page, dir, `5-step4-review-${suffix}`);
  await commitWizard(page);
  await expect(page.getByTestId("kpi-net_revenue").locator(".kpi-value")).toHaveText("2,150.00");
  await shoot(page, dir, `6-overview-after-${suffix}`);
  await page.getByTestId("kpi-net_revenue").locator(".kpi-value button").click();
  const drawer = page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence}$`) });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".converted-value").first()).toBeVisible();
  await drawer.locator(".converted-value").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/7-drawer-raw-converted-${suffix}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: labels.shell.nav.data.headline, exact: true }).click();
  await expect(page.getByTestId("data-preprocessing")).toBeVisible();
  await shoot(page, dir, `8-data-preprocessing-${suffix}`);
  // 第二次匯入同一組欄名：記憶提示
  await openWizard(page);
  await setWizardFiles(page, inclusive, { "sales_daily.csv": { name: "蝦皮銷售報表.csv", mimeType: "text/csv", buffer: Buffer.from(sales) } });
  await nextFromFiles(page);
  await expect(page.getByTestId("import-memory-hint")).toBeVisible();
  await shoot(page, dir, `9-step2-memory-${suffix}`);
  await expect(wizard(page)).toBeVisible();
});
