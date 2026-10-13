import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { navControl, navigateTo, openDownloads, sidebarNav } from "./replacement-helpers";
import { loadDemo } from "./launch-helpers-v310";
import { openWizard, wizard } from "./import-wizard-helpers";
import { failLazyChunks, holdLazyChunks } from "./lazy-chunk-helpers-v43c";

/*
 * V4-3c（D-V4-42＝A，首載瘦身）：頁面面板隨頁載入。資料就緒後約 2 秒才預先載入，所以在那之前（或網路慢、斷線時）第一次切頁要等程式 chunk。
 * 這裡把頁面載入完成之後的程式 chunk 全部扣住（或讓它失敗），驗等待期間與失敗時的行為。
 * V4-8b（D-V4-44 B、D-V4-56＝A、D-V4-57＝A）起按下就切頁：導覽標示與頁標題立刻換成新頁，等待中內容區是骨架（panel-loading）、main 標 aria-busy；
 * 載入失敗時是錯誤狀態（panel-load-error）與「再試一次」。
 * 1. 按「加入待辦」就切到待辦：等待中是骨架，載好後只新增一張卡。
 * 2. 切到還在等程式的頁：焦點在 main、內容區是骨架；載好後換成內容，焦點仍在 main。
 * 3. 開匯入精靈不等頁面程式（精靈在首載），匯入中不顯示骨架；取消匯入時資料來源頁的程式還扣著就是骨架。
 * 4. 程式載入失敗：錯誤狀態（標題取得焦點）、不擲錯；按「再試一次」重新載入，成功後就地換成內容。
 * 5. 預先載入也帶上決策匯出程式：載入完之後斷線，下載選單的決策工作稿照樣能匯出（v3 載入後離線也能匯出）。
 * 6. 預先載入完成後切頁不出現骨架（52 張畫面基準不變）。
 */
const panelLoading = (page: Page) => page.getByTestId("panel-loading");
const main = (page: Page) => page.locator("#main-content");

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

test("按「加入待辦」就切到待辦（D-V4-56＝A）：程式還在等時內容區是骨架、main 標 aria-busy；載好後換成待辦，只新增一張卡", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  await page.getByTestId("top-three").getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }).first().click();
  await expect(sidebarNav(page, "actions"), "按下就切頁").toHaveAttribute("aria-current", "page");
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.actions.headline);
  await expect(panelLoading(page)).toBeVisible();
  await expect(panelLoading(page).getByRole("heading", { level: 2 })).toHaveText(labels.shell.chartsV4.panelLoad.loading);
  await expect(main(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("top-three"), "總覽的內容已換成骨架").toHaveCount(0);
  await expect.poll(() => gate.held.length, "待辦頁的程式被扣住").toBeGreaterThan(0);
  gate.release();
  await expect(page.getByTestId("actions-workbench")).toBeVisible();
  await expect(panelLoading(page)).toHaveCount(0);
  await expect(main(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("article.board-card"), "只新增一張卡").toHaveCount(1);
  expect(errors).toEqual([]);
});

test("切到還在等程式的頁（D-V4-56＝A）：導覽標示與頁標題立刻換、焦點在 main、內容區是骨架；載好後換成內容，焦點仍在 main", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  await navControl(page, "diagnosis").click();
  await expect(sidebarNav(page, "diagnosis")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.diagnosis.headline);
  await expect(panelLoading(page)).toBeVisible();
  await expect(main(page)).toHaveAttribute("aria-busy", "true");
  await expect(main(page)).toBeFocused();
  await expect.poll(() => gate.held.length, "通路健檢的程式被扣住").toBeGreaterThan(0);
  gate.release();
  await expect(page.getByTestId("diagnosis-panel")).toBeVisible();
  await expect(panelLoading(page)).toHaveCount(0);
  await expect(main(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(main(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("開匯入精靈不等頁面程式：資料已載入、程式 chunk 還扣著時，按「匯入資料」精靈立刻出現、不顯示骨架；取消匯入後資料來源頁先是骨架，放行後換成內容", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const gate = await holdLazyChunks(page);
  await loadDemo(page);
  await openWizard(page);
  await expect(wizard(page)).toBeVisible();
  await expect(page.locator("main h1")).toHaveText(labels.importWizard.title);
  await expect(panelLoading(page), "匯入中不顯示骨架").toHaveCount(0);
  await wizard(page).getByRole("button", { name: labels.importWizard.cancel, exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.data.headline);
  await expect(panelLoading(page)).toBeVisible();
  gate.release();
  await expect(page.getByTestId("data-status-line")).toBeVisible();
  await expect(panelLoading(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("頁面程式載入失敗（D-V4-57＝A）：錯誤狀態（標題取得焦點、一句說明、「再試一次」）、不擲錯；按「再試一次」重新載入，成功後就地換成內容、焦點在 main", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const chunks = await failLazyChunks(page);
  await loadDemo(page);
  await navigateTo(page, "products");
  await expect(page.locator("main h1")).toHaveText(labels.shell.nav.products.headline);
  const failed = page.getByTestId("panel-load-error");
  await expect(failed).toBeVisible();
  await expect(failed.getByRole("heading", { level: 2 })).toHaveText(labels.shell.chartsV4.panelLoad.errorTitle);
  await expect(failed.getByRole("alert")).toHaveText(labels.shell.chartsV4.panelLoad.errorBody);
  await expect(page.locator("#panel-load-error-title")).toBeFocused();
  await expect(main(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("product-table")).toHaveCount(0);
  // 連線恢復：之後的程式 chunk 先扣住（按下之前不會有 chunk 先載好），從標題按 Tab 到「再試一次」、按 Enter。
  chunks.hold();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("panel-load-retry")).toBeFocused();
  await expect(page.getByTestId("panel-load-retry")).toHaveText(labels.shell.chartsV4.panelLoad.retry);
  await page.keyboard.press("Enter");
  await expect(panelLoading(page)).toBeVisible();
  await expect(failed).toHaveCount(0);
  chunks.release();
  await expect(page.getByTestId("product-table")).toBeVisible();
  await expect(panelLoading(page)).toHaveCount(0);
  await expect(main(page)).toBeFocused();
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

test("預先載入完成後切頁不出現骨架（D-V4-44 B：畫面基準不變）", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  const lazy: string[] = [];
  page.on("requestfinished", request => { if (request.url().includes("/_next/static/chunks/")) lazy.push(request.url()); });
  await loadDemo(page);
  // 同上一條：等預先載入結束（有 chunk 載入、而且連續 1 秒不再增加）。
  await expect.poll(async () => { const before = lazy.length; await page.waitForTimeout(1_000); return before > 0 && lazy.length === before; }, { timeout: 20_000 }).toBe(true);
  // 從現在起記下骨架有沒有出現過：看每次新增的節點（同一個工作內插入又移除也記得到）。
  await page.evaluate(() => {
    const record = window as unknown as { panelLoadingSeen: number };
    record.panelLoadingSeen = 0;
    new MutationObserver(mutations => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) if (node instanceof Element && (node.matches("[data-testid='panel-loading']") || node.querySelector("[data-testid='panel-loading']"))) record.panelLoadingSeen++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  for (const id of ["diagnosis", "products", "meeting", "actions", "data"] as const) {
    await navigateTo(page, id);
    await expect(page.locator("main h1")).toHaveText(labels.shell.nav[id].headline);
  }
  await expect(page.getByTestId("data-status-line")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { panelLoadingSeen: number }).panelLoadingSeen), "預先載入完成後切頁不出現骨架").toBe(0);
  expect(errors).toEqual([]);
});
