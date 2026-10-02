import { clickReplacing } from "./replacement-helpers";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
const roles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
const labels = ["商品銷售 CSV", "通路費用 CSV", "廣告支出 CSV"];
async function stage(page: Page, folder: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "匯入標準 CSV", exact: true }).click();
  const form = page.getByTestId("import-panel");
  for (let index = 0; index < roles.length; index++) await form.getByLabel(labels[index], { exact: true }).setInputFiles(resolve(folder, roles[index]));
  return form;
}
async function setupWithoutManifest(page: Page) {
  const form = page.getByTestId("import-panel");
  await expect(form.getByLabel("涵蓋開始", { exact: true })).toHaveValue("");
  await form.getByRole("button", { name: "確認並帶入日期與通路提議", exact: true }).click();
  await form.getByLabel("資料集名稱", { exact: true }).fill("manager-import-review");
  await form.getByLabel("資料提供者確認銷售涵蓋範圍完整", { exact: true }).check();
  await form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
}
test("PL03 三檔提議需確認、範本可下载，PL04完整涵蓋對帳後才套用", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  const proposal = form.getByTestId("import-settings-proposal");
  await expect(proposal).toContainText("涵蓋 2026-08-01 ～ 2026-08-02");
  await expect(form.getByLabel("銷售通路（每行一個）", { exact: true })).toHaveValue("");
  const downloaded = page.waitForEvent("download");
  await form.getByRole("button", { name: "下載 商品銷售 CSV 標準空白範本", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("sales_daily.csv");
  expect((await readFile((await download.path())!, "utf8")).trim()).toBe("date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency");
  await setupWithoutManifest(page);
  await expect(form.getByLabel("匯入比較方式", { exact: true })).toHaveValue("same_days");
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText("檢核通過");
  await expect(form.getByTestId("reconciliation-gross_sales")).toContainText("5600.00");
  await expect(form.getByTestId("reconciliation-ad_spend")).toContainText("750.00");
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText("4720.00");
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText("825.00");
  await expect(form.getByTestId("import-reconciliation")).toContainText("平台補助");
  await clickReplacing(page, form.getByRole("button", { name: "套用匯入資料", exact: true }));
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("255.00");
});
test("PL04缺成本保留來源未知與已知小計，貢獻不冒充完整合計", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/missing_cogs");
  await setupWithoutManifest(page);
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText("部分資料待補");
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText("未知（1 個空白）");
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText("已知部分小計");
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText("MISSING_COGS");
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText("4720.00");
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText("未知");
});
test("PL04含稅或淨結算來源不可直接套用，也不自動換算", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  for (const basis of ["including_tax", "net_after_deductions", "unknown"]) {
    await form.getByLabel("來源金額口徑", { exact: true }).selectOption(basis);
    await expect(form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
    await form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
    await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
    await expect(form.getByTestId("import-status")).toContainText("檢核未通過");
    await expect(form.getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
    await expect(form.getByTestId("import-reconciliation")).toHaveCount(0);
    await expect(form.getByTestId("import-preview-sales_daily.csv").locator("tbody tr").first()).toContainText("1000.00");
  }
});
test("PL03訂單級重複鍵說明先整理與對帳，不自行彙總或刪列", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/duplicate_sales_key");
  await setupWithoutManifest(page);
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText("檢核未通過");
  await expect(form).toContainText("疑似訂單級或重複匯出");
  await expect(form).toContainText("DUPLICATE_SALES_KEY");
  await expect(form.getByRole("button", { name: "套用匯入資料", exact: true })).toHaveCount(0);
});

test("PL04換檔後需重新確認口徑，不沿用先前勾選", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  await expect(form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).toBeChecked();
  await form.getByLabel("商品銷售 CSV", { exact: true }).setInputFiles({ name: "replacement-sales.csv", mimeType: "text/csv", buffer: await readFile(resolve("fixtures/golden/sales_daily.csv")) });
  await expect(form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true })).not.toBeChecked();
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText("檢核未通過");
  await expect(form).toContainText("AMOUNT_BASIS_UNCONFIRMED");
  await form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText("檢核通過");
});
