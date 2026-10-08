import { expect, test, type Page } from "@playwright/test";
import { clickReplacing, closeTopbarMore, dismissSavePrompt, navigateTo, openBasis, openDownloads, openValidation, periodSummary, periodSummaryText, periodSummaryVisibleText, ruleHeadline } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { csvHeaderKey } from "../../src/application/copy";
import { formatAmountL1, formatAmountL3 } from "../../src/application/presentation";

// R2 語言與文案層：口徑說明的三個入口、怎麼算的階梯、商品證據不畫階梯、示範通路 alias、CSV 標題列、規則卡模板標題。
async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }));
  // V3-2b：KPI 卡是 L1（萬），由 golden 精確值經 formatAmountL1 產生。
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("1269792.73"));
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
}
async function loadGolden(page: Page) {
  await page.goto("/");
  await openValidation(page);
  await page.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption("golden");
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }));
  // V3-2b：golden 本期 255.00 在 KPI 卡（L1，< 1 萬）顯示為整數元。
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("255.00"));
  await dismissSavePrompt(page);
}
// 把含 {占位符} 的標籤模板轉成整行比對的正規式（占位符換成非空字串）。
const templatePattern = (template: string) => new RegExp(`^${template.split(/\{[^}]+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+?")}$`);
const basis = (page: Page) => page.getByRole("dialog", { name: labels.glossary.basis.title });
const drawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence}$`) });

test.describe("R2 口徑說明與怎麼算的", () => {
  test("basis dialog opens from the top bar, the footer and the evidence drawer, and Escape returns focus", async ({ page }) => {
    await loadDemo(page);
    // V3-3：頂欄「指標定義」是 icon 按鈕（aria-label 不變）；手機收在頂欄「更多」裡，openBasis 先展開再點。
    const topbar = await openBasis(page);
    await expect(basis(page)).toBeVisible();
    await expect(basis(page).getByRole("listitem")).toHaveCount(9);
    await expect(basis(page)).toContainText(labels.glossary.basis.items[2]);
    await page.keyboard.press("Escape");
    await expect(basis(page)).toBeHidden();
    await expect(topbar).toBeFocused();
    await closeTopbarMore(page);
    const footer = page.locator("footer.main-footer").getByRole("button", { name: labels.shell.buttons.basis, exact: true });
    await expect(page.locator("footer.main-footer")).toContainText(labels.glossary.basis.footer);
    await footer.click();
    await expect(basis(page)).toBeVisible();
    await basis(page).getByRole("button", { name: labels.shell.buttons.close, exact: true }).click();
    await expect(basis(page)).toBeHidden();
    await expect(footer).toBeFocused();
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button").click();
    await expect(drawer(page)).toBeVisible();
    // V3-5：抽屜內的「指標定義」按鈕搬到「指標定義與算法」段。
    await drawer(page).getByRole("region", { name: labels.evidence.drawerV3.definitionTitle, exact: true }).getByRole("button", { name: labels.shell.buttons.basis, exact: true }).click();
    await expect(basis(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(basis(page)).toBeHidden();
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
  });

  test("the drawer shows the four-level ladder for a KPI and no ladder for a product", async ({ page }) => {
    await loadGolden(page);
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button").click();
    const rows = drawer(page).locator(".ladder-table tbody tr");
    await expect(rows).toHaveCount(13);
    await expect(rows.first()).toContainText(labels.metrics.gross_sales.headline);
    await expect(rows.last()).toContainText(labels.metrics.contribution_after_marketing.headline);
    // V3-2b：抽屜階梯是 L3（到分＋「元」），標題下一行的精確值也是 L3。
    await expect(rows.last()).toContainText(fill(labels.format.units.yuan, { value: formatAmountL3("255.00") }));
    await expect(drawer(page).getByTestId("evidence-precise-value")).toHaveText(fill(labels.format.units.yuan, { value: formatAmountL3("255.00") }));
    await expect(drawer(page).locator(".ladder-table tr.current")).toHaveCount(1);
    // V3-5 區段順序：計算方式 →（組成項目，KPI 沒有）→ 指標定義與算法（「指標定義」按鈕在這段）→ 原始明細 → 技術細節（收合）。
    await expect(drawer(page).locator(".evidence-body > section > h3")).toHaveText([labels.evidence.ladderTitle, labels.evidence.drawerV3.definitionTitle, labels.evidence.drawerV3.sourcesTitle]);
    await expect(drawer(page).locator(".evidence-body > :is(section, details)").last()).toHaveClass(/evidence-technical/);
    await expect(drawer(page).getByRole("group", { name: labels.evidence.drawer.sourceTabsAria })).toBeVisible();
    await expect(drawer(page).locator("details.evidence-technical")).not.toHaveAttribute("open", /.*/);
    // V3-9b F10：篩選列（evidence-filter）只在趨勢週與通路的下鑽出現，KPI 抽屜沒有；原始明細段仍直接接分段與搜尋。
    await expect(drawer(page).getByTestId("evidence-filter")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await navigateTo(page, "products");
    const table = page.getByTestId("product-table");
    await table.locator("tbody tr").first().getByRole("button").first().click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator(".ladder-table")).toHaveCount(0);
    await expect(drawer(page).getByTestId("evidence-filter")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("demo channels show the Taiwanese alias while golden keeps raw codes", async ({ page }) => {
    await loadDemo(page);
    await expect(page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true }).locator("option")).toContainText([labels.shell.periodBar.filter.allChannels, labels.data.demoChannelAlias.DTC, labels.data.demoChannelAlias.MARKETPLACE]);
    // V3-2a（copy-rewrite.csv ui.dashboard.scopeNote）：通路移出期間說明列，只留在通路選單；說明列只剩兩期日期與天數。
    await expect(page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true }).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, labels.data.demoChannelAlias.DTC, labels.data.demoChannelAlias.MARKETPLACE]);
    // V3-3（§6.3 #19）：v2 的範圍說明列（.scope-note）併入期間列的期間摘要（period-summary）；可見文字只寫兩期與天數，
    // 通路、比較方式、資料到只在 title 與 sr-only（不是可見文字）。
    const demoSummary = periodSummaryText("2026-07-13", "2026-08-23", "2026-06-01", "2026-07-12");
    await expect(periodSummary(page)).toContainText(demoSummary);
    await expect.poll(() => periodSummaryVisibleText(page)).toBe(demoSummary);
    expect(await periodSummaryVisibleText(page)).not.toContain(labels.data.demoChannelAlias.DTC);
    await loadGolden(page);
    await expect(page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true }).locator("option")).toHaveText([labels.shell.periodBar.filter.allChannels, "DTC", "MARKETPLACE"]);
    await expect.poll(() => periodSummaryVisibleText(page)).toMatch(templatePattern(labels.shell.periodBarV3.summary));
    expect(await periodSummaryVisibleText(page)).not.toContain(labels.data.demoChannelAlias.DTC);
    expect(await periodSummaryVisibleText(page)).not.toContain("DTC");
  });

  test("rule cards use glossary headlines and the analysis CSV header reads 中文 (key)", async ({ page }) => {
    await loadGolden(page);
    await navigateTo(page, "diagnosis");
    await expect(page.getByRole("heading", { name: ruleHeadline("REV_UP_CM_DOWN") }).first()).toBeVisible();
    // R5-1：健檢改成一個規則一列；golden 的 REV_UP_CM_DOWN（|對貢獻影響| 315.00 最大）排第一且預設展開。
    const rule = page.getByTestId("diagnosis-list").locator("details.diagnosis-row").first();
    await expect(rule).toHaveAttribute("data-testid", "diagnosis-row-REV_UP_CM_DOWN");
    await expect(rule.getByRole("heading", { level: 3, name: ruleHeadline("REV_UP_CM_DOWN") })).toBeVisible();
    const ruleCopy = rule.locator(".diagnosis-copy");
    await expect(ruleCopy.getByText(labels.diagnosis.sections.cause, { exact: true })).toBeVisible();
    await expect(ruleCopy.getByText(labels.diagnosis.sections.caution, { exact: true })).toBeVisible();
    await expect(ruleCopy.getByText(labels.rules.REV_UP_CM_DOWN.caution, { exact: true })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), (await openDownloads(page)).getByRole("button", { name: labels.exports.downloads.analysisCsv, exact: true }).click()]);
    const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
    const header = text.replace(/^﻿/, "").split(/\r?\n/)[0].split(",").map(cell => cell.replace(/^"|"$/g, ""));
    expect(header).toContain(`${labels.exports.csv.columns.row_type} (row_type)`);
    expect(header.map(csvHeaderKey)).toContain("metric_label");
  });
});
