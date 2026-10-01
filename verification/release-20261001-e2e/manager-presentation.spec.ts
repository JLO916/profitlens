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
    await appendFile(resolve("verification/release-20261001-presentation-browser.jsonl"), `${JSON.stringify({ recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title, status: testInfo.status, errors })}\n`);
    expect(errors, "主管流程沒有未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});

async function loadVerificationDataset(page: Page, id: string, state = "資料已就緒") {
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption(id);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/datasets/${id}`) && response.status() === 200),
    page.getByRole("button", { name: "載入資料集", exact: true }).click(),
  ]);
  await expect(page.getByTestId("workspace-status")).toContainText(state);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("PL10 主管首頁只提供示範與匯入入口，測試案例位於獨立進階驗證頁", async ({ page }, testInfo) => {
  await expect(page.getByLabel("資料集", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "載入資料集", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "載入示範資料", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "匯入標準 CSV", exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/Golden|缺漏案例|錯誤案例|contribution-v1/);
  await page.getByRole("button", { name: "進階驗證", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "進階驗證", exact: true, level: 1 })).toBeVisible();
  const datasets = page.getByLabel("資料集", { exact: true });
  await expect(datasets).toBeVisible();
  expect(await datasets.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(["demo", "golden", "missing-cogs", "missing-ad", "duplicate"]);
  await expect(page.getByTestId("manager-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "載入資料集", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/release-20261001-advanced-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(datasets).toHaveCount(0);
  await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
  await expect(datasets).toHaveCount(0);
});

test("PL10 進階驗證仍可重現 golden、缺費用與 blocking，錯誤不覆寫可用資料", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await expect(page.getByRole("heading", { name: "經營總覽", exact: true })).toBeVisible();
  await expect(page.getByLabel("資料集", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("2,470.00");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("255.00");
  await loadVerificationDataset(page, "missing-ad", "部分資料待補");
  await expect(page.getByRole("heading", { name: "經營總覽", exact: true })).toBeVisible();
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("2,470.00");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("資料待補");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("270.00");
  await loadVerificationDataset(page, "duplicate", "資料載入失敗");
  await expect(page.getByRole("main")).toContainText("重複");
  await page.getByRole("button", { name: "返回前次成功資料", exact: true }).click();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("270.00");
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("1,480.00");
});

test("PL10 單純導航進階頁不載入資料、不更改通路，也不清除方案及行動草稿", async ({ page }) => {
  await loadVerificationDataset(page, "golden");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await page.getByRole("button", { name: "新增方案", exact: true }).click();
  const scenario = page.getByTestId("scenario-1");
  await scenario.getByLabel("方案名稱", { exact: true }).fill("PL10 尚未送算的合成草稿");
  await scenario.getByLabel("售出量變化（相對 %）", { exact: true }).fill("3");
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await page.getByRole("button", { name: "新增行動", exact: true }).click();
  const action = page.getByTestId("action-1");
  await action.getByLabel("問題", { exact: true }).fill("PL10 待人工確認的合成工作稿");
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/datasets/")) requests.push(request.url()); });
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await expect(page.getByLabel("資料集", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("DTC");
  await expect(action.getByLabel("問題", { exact: true })).toHaveValue("PL10 待人工確認的合成工作稿");
  await expect(action).not.toContainText("已過期");
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(scenario.getByLabel("方案名稱", { exact: true })).toHaveValue("PL10 尚未送算的合成草稿");
  await expect(scenario.getByLabel("售出量變化（相對 %）", { exact: true })).toHaveValue("3");
  await expect(scenario.getByLabel("折扣率變化（百分點）", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("decision-freshness")).toContainText("使用目前快照");
  expect(requests).toEqual([]);
});

test("PL10 主要說明可讀、技術 ID 預設折疊並可用鍵盤查看", async ({ page }, testInfo) => {
  await loadVerificationDataset(page, "golden");
  await page.getByRole("button", { name: "通路診斷", exact: true }).click();
  const diagnostic = page.locator(".diagnostic-card").first();
  const technical = diagnostic.locator("details");
  const fact = technical.locator("li code").first();
  await expect(diagnostic.getByRole("heading", { level: 3 })).toBeVisible();
  await expect(technical).not.toHaveAttribute("open", "");
  await expect(fact).not.toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/REV_UP_CM_DOWN|contribution-v1|\["fact"/);
  await technical.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(fact).toBeVisible();
  await expect(fact).toContainText('["fact"');
  await page.keyboard.press("Enter");
  await expect(fact).not.toBeVisible();
  const measured = await page.locator(".subtitle, .scope-note, .diagnostic-card .note, .main-footer, .sidebar-note, .diagnostic-card .tag").evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => ({ element: element.className, size: Number.parseFloat(getComputedStyle(element).fontSize) })));
  expect(measured.length).toBeGreaterThan(4);
  expect(measured.filter(item => item.size < 12), "主管主要說明、範圍及標記至少 12px").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/release-20261001-diagnosis-${testInfo.project.name}.png`), fullPage: true });
});
