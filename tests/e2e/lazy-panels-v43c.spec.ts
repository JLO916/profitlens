import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { navControl, navigateTo, openDownloads, sidebarNav } from "./replacement-helpers";
import { evidenceDrawer, kpiLink, loadDemo } from "./launch-helpers-v310";
import { openWizard, wizard } from "./import-wizard-helpers";

/*
 * V4-3c（D-V4-42＝A，首載瘦身）：頁面面板隨頁載入。資料就緒後約 2 秒才預先載入，所以在那之前（或網路慢、斷線時）第一次切頁要等程式 chunk。
 * 這裡把頁面載入完成之後的程式 chunk 全部扣住（或讓它失敗），驗等待期間與失敗時的行為：
 * 1. 切到待辦還在等時，再按「加入待辦」不重複新增（v3 按下就切頁，不會有這段時間）。
 * 2. 切頁還在等時打開的「計算與來源」抽屜，在切頁落地時關掉，焦點在 main。
 * 3. 開匯入精靈不等頁面程式（精靈在首載；匯入中資料來源頁的內容是 hidden）。
 * 4. 程式載入失敗時頁面先空白、不擲錯；連線恢復後再按一次這一頁就出現內容，不必離開再回來。
 * 5. 預先載入也帶上決策匯出程式：載入完之後斷線，下載選單的決策工作稿照樣能匯出（v3 載入後離線也能匯出）。
 */
const LAZY_CHUNKS = "**/_next/static/chunks/**";

/** 首頁載入完成後才攔：之後要的程式 chunk（隨頁載入、預先載入、匯出）全部扣住，release() 後才放行。 */
async function holdLazyChunks(page: Page) {
  let release!: () => void;
  const released = new Promise<void>(done => { release = done; });
  const held: string[] = [];
  await page.route(LAZY_CHUNKS, async route => { held.push(route.request().url()); await released; await route.continue(); });
  return { held, release };
}
function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

test("切到待辦還在等程式時，再按「加入待辦」不重複新增（v3 第一次按下就切頁，按鈕隨即消失）", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  const add = page.getByTestId("top-three").getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }).first();
  await add.click();
  await expect.poll(() => gate.held.length, "待辦頁的程式被扣住").toBeGreaterThan(0);
  await expect(sidebarNav(page, "overview"), "程式還沒到：仍在總覽").toHaveAttribute("aria-current", "page");
  await add.click();
  gate.release();
  await expect(sidebarNav(page, "actions")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.actions.headline);
  await expect(page.locator("article.board-card"), "第二次按「加入待辦」不重複新增").toHaveCount(1);
  expect(errors).toEqual([]);
});

test("切頁還在等程式時打開的「計算與來源」抽屜，在切頁落地時關掉，焦點在新頁的 main", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  await navControl(page, "diagnosis").click();
  await expect.poll(() => gate.held.length, "通路健檢的程式被扣住").toBeGreaterThan(0);
  await expect(sidebarNav(page, "overview"), "程式還沒到：仍在總覽").toHaveAttribute("aria-current", "page");
  await kpiLink(page).click();
  await expect(evidenceDrawer(page)).toBeVisible();
  gate.release();
  await expect(sidebarNav(page, "diagnosis")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("diagnosis-panel")).toBeVisible();
  await expect(evidenceDrawer(page), "切頁落地時關掉等待中打開的抽屜").toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
  expect(errors).toEqual([]);
});

test("開匯入精靈不等頁面程式：資料已載入、程式 chunk 還扣著時，按「匯入資料」精靈立刻出現", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  await openWizard(page);
  await expect(wizard(page)).toBeVisible();
  await expect(page.locator("main h1")).toHaveText(labels.importWizard.title);
  gate.release();
  expect(errors).toEqual([]);
});

test("頁面程式載入失敗：先空白、不擲錯；連線恢復後再按一次這一頁就出現內容（不必離開再回來）", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  await page.route(LAZY_CHUNKS, route => route.abort("internetdisconnected"));
  await loadDemo(page);
  await navigateTo(page, "products");
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.products.headline);
  await expect(page.getByTestId("product-table"), "程式沒載到：這一頁先空白（D-V4-44 待拍板是否加說明）").toHaveCount(0);
  await page.unroute(LAZY_CHUNKS);
  await navigateTo(page, "products");
  await expect(page.getByTestId("product-table")).toBeVisible();
  await expect(sidebarNav(page, "products")).toHaveAttribute("aria-current", "page");
  expect(errors).toEqual([]);
});

test("預先載入之後斷線：下載選單的決策工作稿照樣能匯出（預先載入帶上決策匯出程式；v3 載入後離線也能匯出）", async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  // 首頁載入完成後才開始記：之後的程式 chunk 都是隨頁載入或預先載入。
  const lazy: string[] = [];
  page.on("requestfinished", request => { if (request.url().includes("/_next/static/chunks/")) lazy.push(request.url()); });
  await loadDemo(page);
  // 預先載入在資料就緒約 2 秒後的閒置時一次開始、幾十毫秒內結束：等到有 chunk 載入、而且連續 1 秒不再增加。
  await expect.poll(async () => { const before = lazy.length; await page.waitForTimeout(1_000); return before > 0 && lazy.length === before; }, { timeout: 20_000 }).toBe(true);
  await context.setOffline(true);
  try {
    const menu = await openDownloads(page);
    const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("button", { name: labels.exports.downloads.decisionJson, exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("profitlens-decision.json");
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
});
