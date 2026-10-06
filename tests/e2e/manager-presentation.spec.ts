import { clickReplacing, closePeriodSheet, dismissSavePrompt, isMobile, navControl, navigateTo, openMobileMore, openPeriodSheet, openValidation, sidebarNav, startChannelContext, switchActionsView } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1 } from "../../src/application/presentation";
import { readFileSync } from "node:fs";
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
/** V3-2b（§8.5）：KPI 大數字是 L1（< 1 萬「255 元」、≥ 1 萬「127.0 萬」）；斷言 .kpi-value 整格文字，金額取自 golden／demo 精確值。 */
const kpiValue = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");
/** V3-3：全站通路下拉在期間列裡；手機期間列收成 period-toggle，要先開底部面板才能選，選完按「完成」收起。 */
async function selectChannel(page: Page, value: string) {
  await openPeriodSheet(page);
  await page.getByLabel(channelFilter, { exact: true }).selectOption(value);
  await closePeriodSheet(page);
}

/** V3-2a：狀態列「資料到 {date}」的日期取自 fixtures/{id}/manifest.json 的 data_as_of（本檔只有 golden 用預設狀態）。 */
const readyFor = (id: string) => fill(labels.status.ready, { date: JSON.parse(readFileSync(resolve(`fixtures/${id}/manifest.json`), "utf8")).data_as_of });

async function loadVerificationDataset(page: Page, id: string, state: string = readyFor(id)) {
  await openValidation(page);
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
  // V3-3（§6.3）：頁首「匯入資料」只留在資料來源頁；首頁的匯入入口是頂欄資料狀態（data-status）→「匯入新資料」（2 次點擊）。
  // 剛 goto 時按鈕可能還沒 hydrate：重試到 popover 出現為止（每次先看 aria-expanded，不會把它關掉）。
  const dataStatus = page.getByTestId("data-status");
  await expect(dataStatus).toBeVisible();
  await expect(async () => {
    if (await dataStatus.getAttribute("aria-expanded") !== "true") await dataStatus.click();
    await expect(page.getByTestId("data-status-popover")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("data-status-import")).toBeVisible();
  await expect(page.getByTestId("data-status-import")).toHaveText(labels.shell.dataStatus.importNew);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("data-status-popover")).toBeHidden();
  expect(await page.locator("body").innerText()).not.toMatch(/Golden|缺漏案例|錯誤案例|contribution-v1/);
  // R7-4（D10＝A）：首頁側欄沒有「開發者驗證」；只有網址 #validation 才出現，出現後切到別頁仍保留（直到重新整理），可用鍵盤切回。
  // V3-3：側欄「開發者」組（手機在「更多」面板）都沒有這一項；sidebarNav 與 includeHidden 連隱藏的也算。
  await expect(sidebarNav(page, "validation")).toHaveCount(0);
  await expect(page.getByTestId("mobile-more").getByRole("button", { name: nav.validation.label, exact: true, includeHidden: true })).toHaveCount(0);
  await openValidation(page);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("validation-panel")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#validation$/);
  if (isMobile(page)) await openMobileMore(page);
  const validationNav = navControl(page, "validation");
  await validationNav.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: nav.validation.label, exact: true, level: 1 })).toBeVisible();
  const datasets = page.getByLabel(validation.datasetLabel, { exact: true });
  await expect(datasets).toBeVisible();
  expect(await datasets.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(["demo", "golden", "missing-cogs", "missing-ad", "duplicate"]);
  await expect(page.getByTestId("manager-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: validation.loadButton, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-advanced-${testInfo.project.name}.png`), fullPage: true });
  await navigateTo(page, "overview");
  await expect(datasets).toHaveCount(0);
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  await expect(kpiValue(page, "contribution_after_marketing")).toHaveText(formatAmountL1("1269792.73"));
  await expect(datasets).toHaveCount(0);
});

test("PL10 進階驗證仍可重現 golden、缺費用與 blocking，錯誤不覆寫可用資料", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await expect(page.getByRole("heading", { name: nav.overview.label, exact: true })).toBeVisible();
  await expect(page.getByLabel(validation.datasetLabel, { exact: true })).toHaveCount(0);
  await expect(kpiValue(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
  await expect(kpiValue(page, "contribution_after_marketing")).toHaveText(formatAmountL1("255.00"));
  await loadVerificationDataset(page, "missing-ad", labels.status.partial);
  await expect(page.getByRole("heading", { name: nav.overview.label, exact: true })).toBeVisible();
  await expect(kpiValue(page, "net_revenue")).toHaveText(formatAmountL1("2470.00"));
  await expect(kpiValue(page, "contribution_after_marketing")).toHaveText(labels.status.missing);
  await selectChannel(page, "DTC");
  await expect(kpiValue(page, "contribution_after_marketing")).toHaveText(formatAmountL1("270.00"));
  await loadVerificationDataset(page, "duplicate", labels.status.error);
  // The blocking message is domain text (src/domain/validation.ts, financial core — not in labels); only its keyword is asserted.
  await expect(page.getByRole("main")).toContainText("重複");
  await page.getByRole("button", { name: labels.ui.dashboard.errorState.back, exact: true }).click();
  await navigateTo(page, "overview");
  await expect(page.getByLabel(channelFilter, { exact: true })).toHaveValue("DTC");
  await expect(kpiValue(page, "contribution_after_marketing")).toHaveText(formatAmountL1("270.00"));
  await expect(kpiValue(page, "net_revenue")).toHaveText(formatAmountL1("1480.00"));
});

test("PL10 單純導航進階頁不載入資料、不更改通路，也不清除方案及行動草稿", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await selectChannel(page, "DTC");
  await navigateTo(page, "scenarios");
  // R5-3 進頁即表單：方案 1 已是本地草稿，不必再按「新增方案」；第一次編輯才寫進工作區。
  await startChannelContext(page);
  const scenario = page.getByTestId("scenario-1");
  await scenario.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true }).fill("PL10 尚未送算的合成草稿");
  await scenario.getByLabel(labels.scenario.volume.label, { exact: true }).fill("3");
  await navigateTo(page, "actions");
  // R5-5 行動頁預設看板；這裡要驗證編輯表單的值，先切到清單檢視（檢視偏好由殼層保存，切頁回來仍是清單）。
  await switchActionsView(page, "list");
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  const action = page.getByTestId("action-1");
  await action.getByLabel(labels.actions.problem, { exact: true }).fill("PL10 待人工確認的合成工作稿");
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/datasets/")) requests.push(request.url()); });
  await openValidation(page);
  await expect(page.getByLabel(validation.datasetLabel, { exact: true })).toBeVisible();
  await navigateTo(page, "actions");
  await expect(page.getByLabel(channelFilter, { exact: true })).toHaveValue("DTC");
  await expect(action.getByLabel(labels.actions.problem, { exact: true })).toHaveValue("PL10 待人工確認的合成工作稿");
  await expect(action).not.toContainText(labels.actions.staleBadge);
  await navigateTo(page, "scenarios");
  await expect(scenario.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true })).toHaveValue("PL10 尚未送算的合成草稿");
  await expect(scenario.getByLabel(labels.scenario.volume.label, { exact: true })).toHaveValue("3");
  await expect(scenario.getByLabel(labels.scenario.discount.label, { exact: true })).toHaveValue("");
  await expect(page.getByTestId("decision-freshness")).toContainText(labels.ui.decisionWorkbench.freshTitle);
  expect(requests).toEqual([]);
});

test("PL10 主要說明可讀、技術 ID 預設折疊並可用鍵盤查看", async ({ page }, testInfo) => {
  await loadVerificationDataset(page, "golden");
  await navigateTo(page, "diagnosis");
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
  // V3-3：.scope-note 改為期間摘要（.period-summary），側欄說明（.sidebar-note）併入頂欄資料狀態（.data-status-text）；手機 .subtitle 隱藏，由可見篩選排除。
  const measured = await page.locator(".subtitle, .period-summary, .diagnosis-panel .note, .main-footer, .data-status-text, .diagnosis-panel .tag, .diagnosis-row .scope-tag, .diagnosis-copy > div").evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => ({ element: element.className, size: Number.parseFloat(getComputedStyle(element).fontSize) })));
  expect(measured.length).toBeGreaterThan(4);
  expect(measured.filter(item => item.size < 12), "主管主要說明、範圍及標記至少 12px").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-diagnosis-${testInfo.project.name}.png`), fullPage: true });
});
