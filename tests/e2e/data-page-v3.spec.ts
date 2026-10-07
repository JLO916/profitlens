import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatCount } from "../../src/application/presentation";
import { clearWorkspace, clickReplacing, closeStorage, dismissSavePrompt, navigateTo, openValidation } from "./replacement-helpers";
import { importViaWizard, type FilePayload, type WizardRole } from "./import-wizard-helpers";
import { blockPositions, dataPageBlocks, expectHeaderOrder, expectIssueRow, issueCells, issueColumns, issueTable, openVersionInfo, reasonCodeToggle, showReasonCodes, versionInfo } from "./data-page-helpers-v3";

// V3-8 驗收（PRD §7.7.1 資料來源頁、§7.10 健檢區段空狀態）。所有字串取自 labels；金額與行號取自 fixtures（不呼叫財務函式）。
const v3 = labels.data.pageV3;
const status = (page: Page) => page.getByTestId("workspace-status");

/** 開發者驗證頁載入一份 fixtures 資料集（missing-cogs＝fixtures/errors/missing_cogs，partial）。 */
async function loadFixture(page: Page, id: string, state: string) {
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(status(page)).toContainText(state);
  await dismissSavePrompt(page);
}

/**
 * 健檢 8 條規則都不會觸發的合成資料：一個通路「官網」、一個商品，2026-07-01～08-31 每天完全相同
 * （原價 200.00、折扣 0、退款 0、成本 40.00；費用 5.00／2.00／3.00／0.00；廣告 40.00）。
 * 任何兩期的各項比率都相同（不會「上升」）、淨營收沒有增加、扣廣告後貢獻與商品毛利都是正的、沒有缺漏。
 */
function flatDataset(): Record<WizardRole, FilePayload> {
  const days: string[] = [];
  for (let t = Date.parse("2026-07-01T00:00:00Z"); t <= Date.parse("2026-08-31T00:00:00Z"); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const csv = (name: WizardRole, header: string, row: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from([header, ...days.map(day => `${day},${row}`)].join("\n"), "utf8") });
  return {
    "sales_daily.csv": csv("sales_daily.csv", "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", "官網,SKU-1,服飾,2,200.00,0.00,0.00,40.00,TWD"),
    "channel_costs_daily.csv": csv("channel_costs_daily.csv", "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", "官網,5.00,2.00,3.00,0.00,TWD"),
    "ad_spend_daily.csv": csv("ad_spend_daily.csv", "date,channel,ad_spend,currency", "官網,40.00,TWD"),
  };
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("V3-8 資料來源頁：區塊依序、問題表六欄與原因碼切換、下載問題清單、頁首主次隨有無資料對調", async ({ page }) => {
  await loadFixture(page, "missing-cogs", labels.status.partial);
  await navigateTo(page, "data");
  // §7.7.1 順序：狀態一行 → 問題 → 範圍與金額基準 → 前處理 → 選填資料 → 來源預覽 → 版本與來源資訊 → 範本。DOM 順序與由上到下的位置都要一致。
  const { domOrdered, tops } = await blockPositions(page, dataPageBlocks);
  expect(domOrdered, "資料來源頁區塊的 DOM 順序").toBe(true);
  for (let index = 1; index < tops.length; index += 1) expect(tops[index], `${dataPageBlocks[index]} 在 ${dataPageBlocks[index - 1]} 下方`).toBeGreaterThan(tops[index - 1]);
  // 狀態一行的最後一段：1 項問題（fixtures/errors/missing_cogs：sales_daily.csv 第 6 行 cogs_net 空白）。
  await expect(page.getByTestId("data-status-line")).toContainText(fill(v3.statusLine.issues, { n: formatCount(1, "L2") }));
  // 有資料：「匯入資料」主要在前、「載入示範資料」次要在後。
  await expectHeaderOrder(page, true);

  const issues = page.getByTestId("data-issues");
  await expect(issues.getByRole("heading", { level: 2, name: labels.sections.dataIssues })).toBeVisible();
  const table = issueTable(issues);
  // 六欄表頭（textContent 含預設 hidden 的原因碼欄）；可及表頭只有前五欄，原因碼欄預設看不見。
  await expect(table.locator("thead th")).toHaveText([...issueColumns]);
  await expect(table.getByRole("columnheader")).toHaveText(issueColumns.slice(0, 5));
  await expect(table.locator("thead th.issue-code")).toBeHidden();
  const toggle = reasonCodeToggle(issues);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const row = table.locator("tbody tr");
  await expect(row).toHaveCount(1);
  // 「問題」欄只放 L1 冒號後段、「修法」欄放 L2（labels.importErrors 樣板帶入檔名與行號後拆開）。
  const missing = issueCells(fill(labels.importErrors.MISSING_COGS, { file: "sales_daily.csv", line: 6 }));
  await expectIssueRow(row, { file: "sales_daily.csv", line: 6, field: "cogs_net", ...missing, severity: "partial" });
  await expect(row.locator("td.issue-code")).toBeHidden();
  // 按「顯示原因碼」：aria-pressed=true，原因碼欄（表頭與每列）看得見。
  await showReasonCodes(issues);
  await expect(table.getByRole("columnheader")).toHaveText([...issueColumns]);
  await expectIssueRow(row, { file: "sales_daily.csv", line: 6, field: "cogs_net", ...missing, severity: "partial", code: "MISSING_COGS" });
  // 再按一次收回（hidden 但保持掛載）。
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(table.locator("thead th.issue-code")).toBeHidden();
  await expect(row.locator("td.issue-code")).toHaveCount(1);

  // 工具列「下載問題清單 CSV」：檔名與頂欄匯出選單相同。
  const download = page.getByTestId("data-issues-download");
  await expect(download).toHaveText(labels.downloads.issuesCsv);
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("profitlens-issues.csv");
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain("MISSING_COGS");
  expect(csv).toContain("sales_daily.csv");

  // 清空後仍停在資料來源頁：頁首「載入示範資料」主要在前、「匯入資料」次要在後；空狀態不重複按鈕列（M6），整頁只有一顆「載入示範資料」。
  const replacement = await clearWorkspace(page);
  await replacement.getByRole("button", { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await closeStorage(page);
  await expect(page.getByTestId("data-issues")).toHaveCount(0);
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("empty-load-demo")).toHaveCount(0);
  await expect(page.getByTestId("empty-import")).toHaveCount(0);
  await expectHeaderOrder(page, false);
  await expect(page.getByRole("button", { name: labels.buttons.loadDemo, exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: labels.buttons.importData, exact: true })).toHaveCount(1);
  // 主要按鈕真的會載入示範資料。
  await clickReplacing(page, page.locator(".page-heading .load-controls .ui-btn-primary"));
  await expect(status(page)).toContainText(fill(labels.status.ready, { date: "2026-08-24" }));
  await dismissSavePrompt(page);
  await navigateTo(page, "data");
  await expectHeaderOrder(page, true);
  await expect(page.getByTestId("data-status-line")).toContainText(v3.statusLine.noIssues);
});

test("V3-8 通路健檢空狀態：8 條規則都沒觸發時顯示標題、說明與「查看健檢規則」；精靈匯入的資料來源頁沒有問題、記下匯入時間", async ({ page }) => {
  // repo 內的 fixtures（golden、demo、zero_ad、refund_only、errors/*）都會觸發至少一條規則，所以用每天相同的合成資料。
  await importViaWizard(page, "", { overrides: flatDataset() });
  await dismissSavePrompt(page);
  await navigateTo(page, "diagnosis");
  const empty = page.getByTestId("diagnosis-empty");
  await expect(empty).toBeVisible();
  await expect(page.locator("details.diagnosis-row")).toHaveCount(0);
  await expect(empty.locator(".diagnosis-empty-title")).toHaveText(v3.diagnosisEmpty.title);
  // role=status 沿用 v2：標題＋說明兩句。
  await expect(empty.getByRole("status")).toHaveText(`${v3.diagnosisEmpty.title}${v3.diagnosisEmpty.body}`);
  await expect(empty.getByRole("status").locator("p").nth(1)).toHaveText(v3.diagnosisEmpty.body);
  const rulesButton = empty.getByRole("button", { name: v3.diagnosisEmpty.action, exact: true });
  const rules = empty.getByRole("list", { name: v3.diagnosisEmpty.rulesAria, exact: true });
  await expect(rulesButton).toHaveAttribute("aria-expanded", "false");
  await expect(rules).toBeHidden();
  await rulesButton.click();
  await expect(rulesButton).toHaveAttribute("aria-expanded", "true");
  await expect(rules).toBeVisible();
  await expect(rules.getByRole("listitem")).toHaveText(Object.values(v3.diagnosisEmpty.rules));
  await expect(rules.getByRole("listitem")).toHaveCount(8);
  await expect(rules).toBeFocused();
  await rulesButton.click();
  await expect(rulesButton).toHaveAttribute("aria-expanded", "false");
  await expect(rules).toBeHidden();

  // 同一份資料的資料來源頁：沒有問題（沒有問題表與下載鈕）、未稅匯入沒有前處理、版本與來源資訊多一列「匯入時間」。
  await navigateTo(page, "data");
  await expect(page.getByTestId("data-status-line")).toContainText(v3.statusLine.noIssues);
  await expect(page.getByTestId("data-issues")).toContainText(labels.ui.workspacePanels.noIssues);
  await expect(issueTable(page.getByTestId("data-issues"))).toHaveCount(0);
  await expect(page.getByTestId("data-issues-download")).toHaveCount(0);
  await expect(page.getByTestId("data-preprocessing")).toContainText(labels.importWizard.noConversion);
  await openVersionInfo(page);
  await expect(versionInfo(page).locator("dt").filter({ hasText: v3.version.importedAt })).toBeVisible();
});
