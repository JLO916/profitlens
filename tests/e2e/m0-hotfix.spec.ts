import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";
import { demoButton } from "./replacement-helpers";

/** M0 / v2.1 hotfix acceptance (PRD v3 §9.1 HF-01..HF-07). */
const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

const status = (page: Page) => page.getByTestId("workspace-status");
const guard = (page: Page) => page.getByRole("dialog", { name: "替換前先儲存工作區" });
const LOSS = "rgb(180, 35, 24)";

async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
  await expect(page.getByTestId("kpi-net_revenue")).toContainText("7,850,657.90");
}
async function loadGolden(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
  await expect(status(page)).toContainText("資料已就緒");
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
}
async function stageAlternative(page: Page) {
  await page.getByRole("button", { name: "匯入標準 CSV", exact: true }).click();
  const form = page.getByTestId("import-panel");
  for (const [label, file] of Object.entries({ "商品銷售 CSV": "sales_daily.csv", "通路費用 CSV": "channel_costs_daily.csv", "廣告支出 CSV": "ad_spend_daily.csv", "讀取 manifest JSON": "manifest.json" })) {
    await form.getByLabel(label, { exact: true }).setInputFiles(resolve("tests/fixtures/alternative", file));
  }
  await form.getByLabel("我已確認未稅商品金額與費用口徑", { exact: true }).check();
  await form.getByRole("button", { name: "檢核匯入資料", exact: true }).click();
  await expect(page.getByTestId("import-status")).toContainText("檢核通過");
}
async function discardAndContinue(page: Page) {
  await expect(guard(page)).toBeVisible();
  await guard(page).getByRole("button", { name: "不儲存並繼續", exact: true }).click();
}

test.describe("M0 HF-01..HF-06", () => {
  test("HF-01 試算頁「編輯 MARKETPLACE 方案」只改頁內試算通路，回總覽仍是全部通路", async ({ page }) => {
    await loadDemo(page);
    const channel = page.getByLabel("通路", { exact: true });
    await expect(channel.locator("option:checked")).toHaveText("全部通路");
    await page.getByRole("button", { name: "情境試算", exact: true }).click();
    await page.getByRole("button", { name: "編輯 MARKETPLACE 方案", exact: true }).click();
    await expect(page.getByTestId("scenario-channel")).toContainText("試算通路：MARKETPLACE");
    await expect(page.getByTestId("scenario-channel")).toContainText("全站篩選維持「全部通路」");
    await expect(page.getByRole("button", { name: "建立 MARKETPLACE 方案工作區", exact: true })).toBeVisible();
    await expect(channel.locator("option:checked")).toHaveText("全部通路");
    await page.getByRole("button", { name: "經營總覽", exact: true }).click();
    await expect(channel.locator("option:checked")).toHaveText("全部通路");
    await expect(page.getByTestId("kpi-net_revenue")).toContainText("7,850,657.90");
  });

  test("HF-02 會議稿固定舊資料時，摘要改標版本並換底色，不與目前 KPI 混淆", async ({ page }) => {
    await loadDemo(page);
    await expect(page.getByTestId("manager-summary").getByRole("heading", { level: 2 })).toHaveText("本期經營摘要");
    await stageAlternative(page);
    await page.getByRole("button", { name: "套用匯入資料", exact: true }).click();
    await discardAndContinue(page);
    await expect(status(page)).toContainText("alternative-import");
    await expect(page.getByTestId("kpi-net_revenue")).toContainText("600.00");
    const summary = page.getByTestId("manager-summary");
    await expect(summary).toContainText("7,850,657.90");
    await expect(summary.getByRole("heading", { level: 2 })).toHaveText("會議資料（8/24 版，與目前資料不同）");
    await expect(summary).toHaveAttribute("data-meeting-version", "differs");
    await expect(page.getByTestId("meeting-version-note")).toContainText("不是下方 KPI 的目前資料");
    const surface = await summary.evaluate(element => getComputedStyle(element).backgroundColor);
    const plain = await page.getByTestId("period-comparison").evaluate(element => getComputedStyle(element).backgroundColor);
    expect(surface).not.toBe(plain);
    // Invariant: both datasets' numbers never appear together without the version label.
    const text = await page.locator("main").innerText();
    if (text.includes("7,850,657.90") && text.includes("600.00")) expect(text).toContain("與目前資料不同");
    await page.getByRole("button", { name: "以目前資料與範圍更新會議來源", exact: true }).click();
    await expect(summary.getByRole("heading", { level: 2 })).toHaveText("本期經營摘要");
    await expect(summary).toHaveAttribute("data-meeting-version", "current");
    await expect(page.locator("main")).not.toContainText("7,850,657.90");
  });

  test("HF-03 三件事「折扣」與拆解圖同一項同號同色（對獲利的影響）", async ({ page }) => {
    await loadDemo(page);
    const discount = page.getByTestId("manager-priority-DISCOUNT_BURDEN_UP");
    const impact = discount.getByTestId("priority-impact").first();
    await expect(impact).toHaveText("-1,188,365.10");
    await expect(impact).toHaveCSS("color", LOSS);
    await expect(discount).toContainText("對獲利的影響");
    const table = page.locator("details.data-alternative", { hasText: "九項精確橋接" });
    await table.locator("summary").click();
    const bridge = page.getByTestId("bridge-discounts").getByTestId("bridge-impact");
    await expect(bridge).toHaveText("-1,188,365.10");
    await expect(bridge).toHaveCSS("color", LOSS);
    expect(await page.locator('.bridge-chart path[fill="#b42318"]').count()).toBeGreaterThan(0);
    await page.getByRole("button", { name: "通路診斷", exact: true }).click();
    const card = page.locator(".diagnostic-card").filter({ has: page.getByRole("heading", { name: "折扣率上升", exact: true }) }).first();
    const diagnostic = card.getByTestId("diagnostic-impact");
    await expect(diagnostic).toHaveText(/^-/);
    await expect(diagnostic).toHaveCSS("color", LOSS);
  });

  test("HF-04 平台由正轉負時 KPI 不顯示百分比，改為「由賺 X 轉為虧 Y」", async ({ page }) => {
    await loadDemo(page);
    await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
    const card = page.getByTestId("kpi-contribution_after_marketing");
    await expect(card.getByTestId("sign-transition")).toHaveText("由賺 721,100.88 轉為虧 61,169.93");
    await expect(card).not.toContainText("%");
    await expect(card).not.toContainText("-108.48");
  });

  test("HF-05 同意 → 載入示範資料 → 重新整理：資料仍在，頂部顯示「已保存 hh:mm」", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", dialog => { dialogs.push(dialog.type()); void dialog.accept(); });
    await loadGolden(page);
    const prompt = page.getByTestId("autosave-prompt");
    await expect(prompt.getByRole("heading", { level: 2 })).toHaveText("要把資料存在這台電腦嗎？（不會上傳）");
    await expect(page.getByTestId("save-status")).toHaveText("未保存（僅此分頁）");
    await prompt.getByRole("button", { name: "存在這台電腦", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId("save-status")).toHaveText(/^已保存 \d{2}:\d{2}$/);
    await (await demoButton(page)).click();
    await expect(guard(page)).toContainText("自動保存只保留目前工作區");
    await discardAndContinue(page);
    await expect(page.getByTestId("kpi-net_revenue")).toContainText("7,850,657.90");
    await expect(page.getByTestId("save-status")).toHaveText(/^已保存 \d{2}:\d{2}$/);
    dialogs.length = 0;
    await page.reload();
    expect(dialogs).toEqual([]);
    await expect(page.getByTestId("kpi-net_revenue")).toContainText("7,850,657.90");
    await expect(page.getByTestId("save-status")).toHaveText(/^已保存 \d{2}:\d{2}$/);
    await expect(page.getByTestId("autosave-notice")).toContainText("已自動恢復");
    await expect(page.getByTestId("autosave-prompt")).toHaveCount(0);
    await expect(page.locator(".main-footer")).toContainText("已開啟自動保存");
  });

  test("HF-05 選「先不要」不建立任何本機資料；刪除本機副本會停止自動保存", async ({ page }) => {
    page.on("dialog", dialog => void dialog.accept());
    await loadDemo(page);
    await page.getByTestId("autosave-prompt").getByRole("button", { name: "先不要", exact: true }).click();
    await expect(page.getByTestId("autosave-prompt")).toHaveCount(0);
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.reload();
    await expect(status(page)).toContainText("尚未載入資料");

    await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
    await page.getByTestId("autosave-prompt").getByRole("button", { name: "存在這台電腦", exact: true }).click();
    await expect(page.getByTestId("save-status")).toHaveText(/^已保存 \d{2}:\d{2}$/);
    const storage = page.getByTestId("workspace-storage");
    await storage.locator("summary").click();
    await expect(page.getByTestId("autosave-note")).toBeVisible();
    await storage.getByRole("button", { name: "刪除本機副本並關閉保存", exact: true }).click();
    await expect(page.getByTestId("save-status")).toHaveText("未保存（僅此分頁）");
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.reload();
    await expect(status(page)).toContainText("尚未載入資料");
  });

  test("HF-06 有資料時頁首沒有綠色主按鈕「載入示範資料」，改收在「更多」", async ({ page }) => {
    await loadDemo(page);
    const heading = page.locator(".page-heading");
    await expect(heading.locator(".button.primary", { hasText: "載入示範資料" })).toHaveCount(0);
    await expect(heading.getByRole("button", { name: "載入示範資料", exact: true })).toBeHidden();
    await page.getByTestId("more-menu").locator("summary").click();
    const item = page.getByTestId("more-menu").getByRole("button", { name: "載入示範資料", exact: true });
    await expect(item).toBeVisible();
    await expect(item).not.toHaveClass(/primary/);
    // The open menu stays fully inside the viewport on every size.
    const menu = (await page.getByTestId("more-menu").locator(".more-menu-items").boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
  });
});

test.describe("M0 HF-07 行動版 390×844", () => {
  test.skip(({ viewport }) => viewport?.width !== 390 || viewport?.height !== 844, "HF-07 驗收只在 390×844 視窗執行");

  test("替換保護對話框置中並有遮罩", async ({ page }) => {
    await loadDemo(page);
    await (await demoButton(page)).click();
    const dialog = guard(page);
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
    expect(box.width).toBeLessThan(viewport.width);
    // Content-sized, not stretched to the full viewport height.
    expect(box.height).toBeLessThan(viewport.height * 0.75);
    const backdrop = await dialog.evaluate(element => getComputedStyle(element, "::backdrop").backgroundColor);
    expect(backdrop).not.toBe("rgba(0, 0, 0, 0)");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  });

  test("套用匯入後捲回頁首", async ({ page }) => {
    await loadDemo(page);
    await stageAlternative(page);
    const apply = page.getByRole("button", { name: "套用匯入資料", exact: true });
    await apply.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await apply.click();
    await discardAndContinue(page);
    await expect(status(page)).toContainText("alternative-import");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("行動「執行狀態」下拉高度與其他欄位一致", async ({ page }) => {
    await loadDemo(page);
    await page.getByRole("button", { name: "行動摘要", exact: true }).click();
    await page.getByRole("button", { name: "新增行動", exact: true }).click();
    const action = page.getByTestId("action-1");
    const select = (await action.getByLabel("執行狀態", { exact: true }).boundingBox())!;
    const deadline = (await action.getByLabel("期限", { exact: true }).boundingBox())!;
    expect(Math.abs(select.height - deadline.height)).toBeLessThanOrEqual(4);
    expect(select.height).toBeLessThan(60);
  });
});

/** DoD #5: evidence screenshots at 390×844 and 1440×900 under verification/M0/. */
test.describe("M0 截圖（390×844、1440×900）", () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, "截圖只在 desktop 專案產生一次");
  const sizes = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
  const shot = (name: string, size: { width: number; height: number }) => resolve(`verification/M0/${name}-${size.width}x${size.height}.png`);

  test("HF-01／HF-03／HF-04／HF-06 截圖", async ({ page }) => {
    page.on("dialog", dialog => void dialog.accept());
    for (const size of sizes) {
      await page.setViewportSize(size);
      await loadDemo(page);
      await page.getByTestId("autosave-prompt").getByRole("button", { name: "先不要", exact: true }).click();
      await page.getByTestId("manager-priority-DISCOUNT_BURDEN_UP").scrollIntoViewIfNeeded();
      await page.getByTestId("manager-priority-DISCOUNT_BURDEN_UP").screenshot({ path: shot("hf03-three-things-discount", size) });
      const table = page.locator("details.data-alternative", { hasText: "九項精確橋接" });
      await table.locator("summary").click();
      await page.locator("section", { has: page.locator("#bridge-title") }).screenshot({ path: shot("hf03-bridge", size) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByTestId("more-menu").locator("summary").click();
      await page.screenshot({ path: shot("hf06-more-menu", size) });
      await page.getByTestId("more-menu").locator("summary").click();
      await page.getByRole("button", { name: "情境試算", exact: true }).click();
      await page.getByRole("button", { name: "編輯 MARKETPLACE 方案", exact: true }).click();
      await expect(page.getByTestId("scenario-channel")).toContainText("試算通路：MARKETPLACE");
      await page.getByTestId("scenario-channel").scrollIntoViewIfNeeded();
      await page.screenshot({ path: shot("hf01-scenario-channel", size) });
      await page.getByRole("button", { name: "經營總覽", exact: true }).click();
      await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
      await expect(page.getByTestId("sign-transition")).toBeVisible();
      await page.getByTestId("kpi-contribution_after_marketing").screenshot({ path: shot("hf04-kpi-transition", size) });
    }
  });

  test("HF-02／HF-05／HF-07 截圖", async ({ page }) => {
    page.on("dialog", dialog => void dialog.accept());
    for (const size of sizes) {
      await page.setViewportSize(size);
      await loadDemo(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot("hf05-autosave-prompt", size) });
      await page.getByTestId("autosave-prompt").getByRole("button", { name: "存在這台電腦", exact: true }).click();
      await expect(page.getByTestId("save-status")).toHaveText(/^已保存 \d{2}:\d{2}$/);
      await page.reload();
      await expect(page.getByTestId("autosave-notice")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot("hf05-restored-saved-badge", size) });
      await (await demoButton(page)).click();
      await expect(guard(page)).toBeVisible();
      await page.screenshot({ path: shot("hf07-dialog", size) });
      await guard(page).getByRole("button", { name: "取消", exact: true }).click();
      await stageAlternative(page);
      await page.getByRole("button", { name: "套用匯入資料", exact: true }).click();
      await discardAndContinue(page);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({ path: shot("hf07-after-import-top", size) });
      await page.getByTestId("manager-summary").evaluate(element => element.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: shot("hf02-meeting-differs", size) });
      await page.getByRole("button", { name: "行動摘要", exact: true }).click();
      await page.getByRole("button", { name: "新增行動", exact: true }).click();
      await page.getByTestId("action-1").getByLabel("執行狀態", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: shot("hf07-action-status", size) });
      // Leave a clean slate for the next size: stop autosave and delete the local copy.
      const storage = page.getByTestId("workspace-storage");
      if (await storage.getAttribute("open") === null) await storage.locator("summary").click();
      await storage.getByRole("button", { name: "刪除本機副本並關閉保存", exact: true }).click();
      await expect(page.getByTestId("save-status")).toHaveText("未保存（僅此分頁）");
    }
  });
});
