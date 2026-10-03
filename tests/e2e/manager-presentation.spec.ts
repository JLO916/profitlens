import { clickReplacing, dismissSavePrompt, startChannelContext, switchActionsView } from "./replacement-helpers";
import { labels } from "../../src/i18n";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

const test = base.extend<{ browserAudit: string[] }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.name}`));
    page.on("console", event => { if (event.type() === "error") errors.push(`console:${event.type()}`); });
    await use(errors);
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-presentation-browser.jsonl"), `${JSON.stringify({ recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title, status: testInfo.status, errors })}\n`);
    expect(errors, "主管流程沒有未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

// R2 renames (03_GLOSSARY_COPY): nav/status/button strings are read from the label dictionary, never retyped.
const nav = labels.nav;
const validation = labels.ui.dashboard.validation;
const channelFilter = labels.ui.dashboard.filter.channel;

async function loadVerificationDataset(page: Page, id: string, state: string = labels.status.ready) {
  await page.getByRole("button", { name: nav.validation.label, exact: true }).click();
  await page.getByLabel(validation.datasetLabel, { exact: true }).selectOption(id);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/datasets/${id}`) && response.status() === 200),
    clickReplacing(page, page.getByRole("button", { name: validation.loadButton, exact: true })),
  ]);
  await expect(page.getByTestId("workspace-status")).toContainText(state);
  // R6：第一次載入資料後右下角會出現「存在這台電腦？」提示（非 modal）；本檔不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("PL10 主管首頁只提供示範與匯入入口，測試案例位於獨立進階驗證頁", async ({ page }, testInfo) => {
  await expect(page.getByLabel(validation.datasetLabel, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: validation.loadButton, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: labels.buttons.loadDemo, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: labels.buttons.importData, exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/Golden|缺漏案例|錯誤案例|contribution-v1/);
  await page.getByRole("button", { name: nav.validation.label, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: nav.validation.label, exact: true, level: 1 })).toBeVisible();
  const datasets = page.getByLabel(validation.datasetLabel, { exact: true });
  await expect(datasets).toBeVisible();
  expect(await datasets.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(["demo", "golden", "missing-cogs", "missing-ad", "duplicate"]);
  await expect(page.getByTestId("manager-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: validation.loadButton, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-advanced-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: nav.overview.label, exact: true }).click();
  await expect(datasets).toHaveCount(0);
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
  await expect(datasets).toHaveCount(0);
});

test("PL10 進階驗證仍可重現 golden、缺費用與 blocking，錯誤不覆寫可用資料", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await expect(page.getByRole("heading", { name: nav.overview.label, exact: true })).toBeVisible();
  await expect(page.getByLabel(validation.datasetLabel, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("2,470.00");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("255.00");
  await loadVerificationDataset(page, "missing-ad", labels.status.partial);
  await expect(page.getByRole("heading", { name: nav.overview.label, exact: true })).toBeVisible();
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("2,470.00");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(labels.status.missing);
  await page.getByLabel(channelFilter, { exact: true }).selectOption("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("270.00");
  await loadVerificationDataset(page, "duplicate", labels.status.error);
  // The blocking message is domain text (src/domain/validation.ts, financial core — not in labels); only its keyword is asserted.
  await expect(page.getByRole("main")).toContainText("重複");
  await page.getByRole("button", { name: labels.ui.dashboard.errorState.back, exact: true }).click();
  await page.getByRole("button", { name: nav.overview.label, exact: true }).click();
  await expect(page.getByLabel(channelFilter, { exact: true })).toHaveValue("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("270.00");
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("1,480.00");
});

test("PL10 單純導航進階頁不載入資料、不更改通路，也不清除方案及行動草稿", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await page.getByLabel(channelFilter, { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: nav.scenarios.label, exact: true }).click();
  // R5-3 進頁即表單：方案 1 已是本地草稿，不必再按「新增方案」；第一次編輯才寫進工作區。
  await startChannelContext(page);
  const scenario = page.getByTestId("scenario-1");
  await scenario.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true }).fill("PL10 尚未送算的合成草稿");
  await scenario.getByLabel(labels.scenario.volume.label, { exact: true }).fill("3");
  await page.getByRole("button", { name: nav.actions.label, exact: true }).click();
  // R5-5 行動頁預設看板；這裡要驗證編輯表單的值，先切到清單檢視（檢視偏好由殼層保存，切頁回來仍是清單）。
  await switchActionsView(page, "list");
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  const action = page.getByTestId("action-1");
  await action.getByLabel(labels.actions.problem, { exact: true }).fill("PL10 待人工確認的合成工作稿");
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/datasets/")) requests.push(request.url()); });
  await page.getByRole("button", { name: nav.validation.label, exact: true }).click();
  await expect(page.getByLabel(validation.datasetLabel, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: nav.actions.label, exact: true }).click();
  await expect(page.getByLabel(channelFilter, { exact: true })).toHaveValue("DTC");
  await expect(action.getByLabel(labels.actions.problem, { exact: true })).toHaveValue("PL10 待人工確認的合成工作稿");
  await expect(action).not.toContainText(labels.actions.staleBadge);
  await page.getByRole("button", { name: nav.scenarios.label, exact: true }).click();
  await expect(scenario.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true })).toHaveValue("PL10 尚未送算的合成草稿");
  await expect(scenario.getByLabel(labels.scenario.volume.label, { exact: true })).toHaveValue("3");
  await expect(scenario.getByLabel(labels.scenario.discount.label, { exact: true })).toHaveValue("");
  await expect(page.getByTestId("decision-freshness")).toContainText(labels.ui.decisionWorkbench.freshTitle);
  expect(requests).toEqual([]);
});

test("PL10 主要說明可讀、技術 ID 預設折疊並可用鍵盤查看", async ({ page }, testInfo) => {
  await loadVerificationDataset(page, "golden");
  await page.getByRole("button", { name: nav.diagnosis.label, exact: true }).click();
  // R5-1 健檢清單：一個規則一列（details.diagnosis-row，前三列預設展開）；技術細節是列內再一層 details.diagnosis-technical。
  const diagnostic = page.getByTestId("diagnosis-list").locator("details.diagnosis-row").first();
  const technical = diagnostic.locator("details.diagnosis-technical");
  const fact = technical.locator("li code").first();
  await expect(diagnostic).toHaveAttribute("open", "");
  await expect(diagnostic.getByRole("heading", { level: 3 })).toBeVisible();
  await expect(diagnostic.locator(".diagnosis-copy")).toBeVisible();
  await expect(technical).not.toHaveAttribute("open", "");
  await expect(fact).not.toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/REV_UP_CM_DOWN|contribution-v1|\["fact"/);
  await technical.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(fact).toBeVisible();
  await expect(fact).toContainText('["fact"');
  await page.keyboard.press("Enter");
  await expect(fact).not.toBeVisible();
  const measured = await page.locator(".subtitle, .scope-note, .diagnosis-panel .note, .main-footer, .sidebar-note, .diagnosis-panel .tag, .diagnosis-row .scope-tag, .diagnosis-copy > div").evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => ({ element: element.className, size: Number.parseFloat(getComputedStyle(element).fontSize) })));
  expect(measured.length).toBeGreaterThan(4);
  expect(measured.filter(item => item.size < 12), "主管主要說明、範圍及標記至少 12px").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-diagnosis-${testInfo.project.name}.png`), fullPage: true });
});
