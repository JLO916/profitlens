import { clickReplacing } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
const panel = labels.ui.importPanel;
const roles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
const fileLabels = [labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads];
/** R2 labels with placeholders (e.g. "已有的部分小計 {subtotal}，不是完整總額") are matched by template shape, like ruleHeadline. */
function templateText(template: string): RegExp {
  return new RegExp(template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, ".+?"));
}
async function stage(page: Page, folder: string) {
  await page.goto("/");
  await page.getByRole("button", { name: labels.buttons.importData, exact: true }).click();
  const form = page.getByTestId("import-panel");
  for (let index = 0; index < roles.length; index++) await form.getByLabel(fileLabels[index], { exact: true }).setInputFiles(resolve(folder, roles[index]));
  return form;
}
async function setupWithoutManifest(page: Page) {
  const form = page.getByTestId("import-panel");
  await expect(form.getByLabel(panel.dateFields.coverageStart, { exact: true })).toHaveValue("");
  await form.getByRole("button", { name: panel.applyProposal, exact: true }).click();
  await form.getByLabel(panel.datasetName, { exact: true }).fill("manager-import-review");
  await form.getByLabel(labels.importWizard.coverageConfirm, { exact: true }).check();
  await form.getByLabel(labels.importWizard.amountConfirm, { exact: true }).check();
}
test("PL03 三檔提議需確認、範本可下载，PL04完整涵蓋對帳後才套用", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  const proposal = form.getByTestId("import-settings-proposal");
  await expect(proposal).toContainText(fill(panel.proposalCoverage, { start: "2026-08-01", end: "2026-08-02", channels: "DTC、MARKETPLACE" }));
  await expect(form.getByLabel(panel.channels, { exact: true })).toHaveValue("");
  const downloaded = page.waitForEvent("download");
  await form.getByRole("button", { name: fill(panel.downloadTemplate, { file: labels.importWizard.files.sales }), exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("sales_daily.csv");
  expect((await readFile((await download.path())!, "utf8")).trim()).toBe("date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency");
  await setupWithoutManifest(page);
  await expect(form.getByLabel(panel.comparisonMode, { exact: true })).toHaveValue("same_days");
  await form.getByRole("button", { name: panel.check, exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText(panel.status.valid);
  await expect(form.getByTestId("reconciliation-gross_sales")).toContainText("5600.00");
  await expect(form.getByTestId("reconciliation-ad_spend")).toContainText("750.00");
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText("4720.00");
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText("825.00");
  await expect(form.getByTestId("import-reconciliation")).toContainText(labels.ui.importGuidance.excluded.platformSubsidy);
  await clickReplacing(page, form.getByRole("button", { name: panel.commit, exact: true }));
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("255.00");
});
test("PL04缺成本保留來源未知與已知小計，貢獻不冒充完整合計", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/missing_cogs");
  await setupWithoutManifest(page);
  await form.getByRole("button", { name: panel.check, exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText(panel.status.partial);
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText(fill(panel.unknownBlanks, { n: 1 }));
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText(templateText(panel.knownSubtotal));
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText("MISSING_COGS");
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText("4720.00");
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText(templateText(panel.unknownReasons));
});
test("PL04含稅或淨結算來源不可直接套用，也不自動換算", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  for (const basis of ["including_tax", "net_after_deductions", "unknown"]) {
    await form.getByLabel(labels.importWizard.basis.label, { exact: true }).selectOption(basis);
    await expect(form.getByLabel(labels.importWizard.amountConfirm, { exact: true })).not.toBeChecked();
    await form.getByLabel(labels.importWizard.amountConfirm, { exact: true }).check();
    await form.getByRole("button", { name: panel.check, exact: true }).click();
    await expect(form.getByTestId("import-status")).toContainText(panel.status.blocking);
    await expect(form.getByRole("button", { name: panel.commit, exact: true })).toHaveCount(0);
    await expect(form.getByTestId("import-reconciliation")).toHaveCount(0);
    await expect(form.getByTestId("import-preview-sales_daily.csv").locator("tbody tr").first()).toContainText("1000.00");
  }
});
test("PL03訂單級重複鍵說明先整理與對帳，不自行彙總或刪列", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/duplicate_sales_key");
  await setupWithoutManifest(page);
  await form.getByRole("button", { name: panel.check, exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText(panel.status.blocking);
  await expect(form).toContainText(panel.duplicateAlert);
  await expect(form).toContainText("DUPLICATE_SALES_KEY");
  await expect(form.getByRole("button", { name: panel.commit, exact: true })).toHaveCount(0);
});

test("PL04換檔後需重新確認口徑，不沿用先前勾選", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  await expect(form.getByLabel(labels.importWizard.amountConfirm, { exact: true })).toBeChecked();
  await form.getByLabel(labels.importWizard.files.sales, { exact: true }).setInputFiles({ name: "replacement-sales.csv", mimeType: "text/csv", buffer: await readFile(resolve("fixtures/golden/sales_daily.csv")) });
  await expect(form.getByLabel(labels.importWizard.amountConfirm, { exact: true })).not.toBeChecked();
  await form.getByRole("button", { name: panel.check, exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText(panel.status.blocking);
  await expect(form).toContainText("AMOUNT_BASIS_UNCONFIRMED");
  await form.getByLabel(labels.importWizard.amountConfirm, { exact: true }).check();
  await form.getByRole("button", { name: panel.check, exact: true }).click();
  await expect(form.getByTestId("import-status")).toContainText(panel.status.valid);
});
