import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL3 } from "../../src/application/presentation";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { backToFiles, chooseBasis, commitButton, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, wizard, wizardStatus } from "./import-wizard-helpers";
import { navigateTo } from "./replacement-helpers";
// R3：舊的單頁匯入面板（import-panel）已由四步匯入精靈取代；本檔改由精靈操作，產品行為的斷言照舊保留。
// V3-3：空狀態從頂欄資料狀態 →「匯入新資料」開精靈（openWizard 處理）；切頁走 navigateTo（手機用底部分頁列）。
const panel = labels.ui.importPanel;
const copy = labels.importWizard;
/** R2 labels with placeholders (e.g. "已有的部分小計 {subtotal}，不是完整總額") are matched by template shape, like ruleHeadline. */
function templateText(template: string): RegExp {
  return new RegExp(template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, ".+?"));
}
async function stage(page: Page, folder: string) {
  await page.goto("/");
  await openWizard(page);
  await setWizardFiles(page, folder);
  return wizard(page);
}
/** 沒有設定檔：進第 3 步時檔案提議已自動帶入（標示「由檔案提議，請確認」），只改名稱並選「未稅」，確認由「我確認口徑與期間，開始檢核」一次完成。 */
async function setupWithoutManifest(page: Page) {
  const form = wizard(page);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  const settings = page.getByTestId("import-settings-proposal");
  await expect(settings).toContainText(copy.proposedBy);
  await expect(form.getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeDisabled();
  await form.getByLabel(copy.datasetName, { exact: true }).fill("manager-import-review");
  await chooseBasis(page, "exclusive");
  // 兩句確認（涵蓋完整、商品金額口徑）不再是勾選框，而是確認按鈕上方的說明文字。
  await expect(form.locator(".confirm-list")).toContainText(copy.coverageConfirm);
  await expect(form.locator(".confirm-list")).toContainText(copy.amountConfirm);
  await expect(form.getByRole("checkbox", { name: copy.amountConfirm, exact: true })).toHaveCount(0);
}
test("PL03 三檔提議需確認、範本可下载，PL04完整涵蓋對帳後才套用（R3：提議自動帶入第 3 步）", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  const templates = form.locator("details", { has: page.locator("summary", { hasText: copy.noFiles }) });
  await templates.locator(":scope > summary").click();
  const downloaded = page.waitForEvent("download");
  await templates.locator(".template-grid > div", { hasText: copy.files.sales }).getByRole("button", { name: copy.templatesBlank, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("sales_daily.csv");
  expect((await readFile((await download.path())!, "utf8")).trim()).toBe("date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency");
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // 檔案提議（原「帶入建議」）在進第 3 步時自動填好，仍標示需確認。
  const proposal = form.getByTestId("import-settings-proposal");
  await expect(proposal).toContainText(copy.proposedBy);
  await expect(form.getByLabel(copy.coverageStart, { exact: true })).toHaveValue("2026-08-01");
  await expect(form.getByLabel(copy.coverageEnd, { exact: true })).toHaveValue("2026-08-02");
  await expect(form.getByLabel("DTC", { exact: true })).toBeChecked();
  await expect(form.getByLabel("MARKETPLACE", { exact: true })).toBeChecked();
  await expect(proposal.getByRole("checkbox")).toHaveCount(2);
  // 回第 1 步會經過自動完成的第 2 步（可回看，顯示「欄名全部符合標準」）。
  await form.getByRole("button", { name: copy.back, exact: true }).click();
  await expect(page.getByTestId("import-step-2")).toContainText(copy.allExact);
  await backToFiles(page);
  await setupWithoutManifest(page);
  await expect(form.getByLabel(copy.comparisonMode, { exact: true })).toHaveValue("same_days");
  await confirmAndCheck(page, "valid");
  // V3-2b：對帳表是 L3（到分、千分位，PRD §3.3／§8.5），數字一律由 golden 精確值經 formatAmountL3 產生。
  await expect(form.getByTestId("reconciliation-gross_sales")).toContainText(formatAmountL3("5600.00"));
  await expect(form.getByTestId("reconciliation-gross_sales")).toContainText("sales_daily.csv");
  await expect(form.getByTestId("reconciliation-ad_spend")).toContainText(formatAmountL3("750.00"));
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText(formatAmountL3("4720.00"));
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText(formatAmountL3("825.00"));
  await expect(form.getByTestId("import-reconciliation")).toContainText(labels.ui.importGuidance.excluded.platformSubsidy);
  await commitWizard(page);
  await navigateTo(page, "overview");
  // V3-2b：KPI 大數字是 L1；golden 本期 255.00 < 1 萬，顯示為整數元。
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1("255.00"));
});
test("PL04缺成本保留來源未知與已知小計，貢獻不冒充完整合計", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/missing_cogs");
  await setupWithoutManifest(page);
  await confirmAndCheck(page, "partial");
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText(fill(panel.unknownBlanks, { n: 1 }));
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText(templateText(panel.knownSubtotal));
  await expect(form.getByTestId("reconciliation-cogs_net")).toContainText("MISSING_COGS");
  await expect(form.getByTestId("reconciliation-metric-net_revenue")).toContainText(formatAmountL3("4720.00"));
  await expect(form.getByTestId("reconciliation-metric-contribution_after_marketing")).toContainText(templateText(panel.unknownReasons));
});
test("PL04含稅或淨結算來源不可直接套用，也不自動換算（R3：含稅改為明示換算；淨結算選項已移除；「我不確定」停在第 3 步）", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  // 口徑只剩三個選項：未稅／含稅（系統換算）／我不確定；沒有「淨結算」可選，也沒有舊的下拉選單。
  await expect(form.getByRole("radio")).toHaveCount(3);
  await expect(form.getByRole("combobox", { name: copy.basis.label, exact: true })).toHaveCount(0);
  // 我不確定：不能確認、顯示停下說明，沒有檢核結果、沒有套用按鈕。
  await chooseBasis(page, "unsure");
  await expect(form.getByRole("alert")).toContainText(copy.basisUnsureStop);
  await expect(form.getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeDisabled();
  await expect(page.getByTestId("import-step-4")).toHaveCount(0);
  await expect(commitButton(page)).toHaveCount(0);
  await expect(page.getByTestId("import-conversion")).toHaveCount(0);
  // 未稅：不換算。
  await chooseBasis(page, "exclusive");
  await expect(page.getByTestId("import-conversion")).toHaveCount(0);
  // 含稅：不再阻擋，而是顯示換算設定，由使用者確認稅率與欄位後明示換算（不是靜默自動換算）。
  await chooseBasis(page, "inclusive");
  const conversion = page.getByTestId("import-conversion");
  await expect(conversion).toBeVisible();
  await expect(conversion.getByLabel(copy.rateLabel, { exact: true })).toHaveValue("5");
  await confirmAndCheck(page, "valid");
  await expect(page.getByTestId("import-preprocessing")).toContainText("5%");
  await expect(page.getByTestId("import-preprocessing")).not.toContainText(copy.noConversion);
  // 原始含稅值保留可追溯：前處理摘要列出原價收入的含稅合計（golden 原值 5600.00）與換算後合計。
  await expect(page.getByTestId("import-preprocessing")).toContainText(formatAmountL3("5600.00"));
  await expect(form.getByTestId("import-reconciliation")).toBeVisible();
  await expect(commitButton(page)).toBeVisible();
});
test("PL03訂單級重複鍵說明先整理與對帳，不自行彙總或刪列", async ({ page }) => {
  const form = await stage(page, "fixtures/errors/duplicate_sales_key");
  await setupWithoutManifest(page);
  await confirmAndCheck(page, "blocking");
  await expect(form).toContainText(panel.duplicateAlert);
  await expect(form).toContainText("DUPLICATE_SALES_KEY");
  await expect(commitButton(page)).toHaveCount(0);
});

test("PL04換檔後需重新確認口徑，不沿用先前勾選（R3：回上一步換檔後要重新按確認、重跑第 4 步；第 2 步可回看）", async ({ page }) => {
  const form = await stage(page, "fixtures/golden");
  await setupWithoutManifest(page);
  await confirmAndCheck(page, "valid");
  await expect(commitButton(page)).toBeVisible();
  // 回到第 1 步換掉銷售檔：先前的確認與檢核結果作廢。
  await form.getByRole("button", { name: copy.back, exact: true }).click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await expect(page.getByTestId("import-step-4")).toHaveCount(0);
  await backToFiles(page);
  await form.getByLabel(copy.files.sales, { exact: true }).setInputFiles({ name: "replacement-sales.csv", mimeType: "text/csv", buffer: await readFile(resolve("fixtures/golden/sales_daily.csv")) });
  await expect(page.getByTestId("import-file-sales_daily.csv")).toContainText("replacement-sales.csv");
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // 沒有沿用的檢核結果或套用按鈕；必須再按一次確認才會重新檢核。
  await expect(wizardStatus(page)).toHaveCount(0);
  await expect(commitButton(page)).toHaveCount(0);
  await expect(form.getByRole("button", { name: copy.confirmAndCheck, exact: true })).toBeEnabled();
  await confirmAndCheck(page, "valid");
  await expect(form.getByTestId("reconciliation-gross_sales")).toContainText("replacement-sales.csv");
  await expect(commitButton(page)).toBeVisible();
});
