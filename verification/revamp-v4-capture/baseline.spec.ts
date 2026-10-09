import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { confirmAndCheck, confirmMappingIfShown, chooseBasis, nextFromFiles, openWizard, setWizardFiles } from "../../tests/e2e/import-wizard-helpers";
import { FIXED_NOW, calculateKeepPreset, evidenceDrawer, goTo, loadDemo, navigateTo, noOverlayStylePath, readTargets } from "./shared";

// V4-0a 第 9 項：四尺寸 toHaveScreenshot 基準，12 畫面 × 4 尺寸＝48 張，再加 13 KPI 帶元素截圖 4 張，共 52 張。
// 01–09：v3 的 9 個畫面（verification/revamp-v3-capture/baseline.spec.ts 的同一個走查，操作與檔名一字不改；V4-0a 以 V3-10 的 36 張為基準，差異必須 0）。
// 10–13：v3.0.0 還沒有這些圖，基準拍的是 v4 圖要插入的位置，之後各批的差異就是插入的圖（06_BATCHES V4-0a 第 9 項）：
//   10 健檢圖區：載入示範資料、切到通路健檢；範圍＝diagnosis-list 下緣到 channel-compare 下緣（G10、G11、G12 都插在這兩者之間，
//      src/components/workspace-panels.tsx:188-189）；水平範圍＝diagnosis-panel 與 channel-compare 的聯集；<details> 保持預設。
//      以捲回頂端後的整頁截圖裁切（fullPage＋clip）。
//   11 商品圖區：載入示範資料、切到商品毛利，對 section.product-highlights（src/components/product-comparison-panel.tsx:257，沒有 testid）做元素截圖。
//   12 匯入精靈步驟 4：空狀態開精靈，選 tests/fixtures/inclusive_tax 三個檔、口徑含稅、確認並檢核（valid），對 import-step-4 做元素截圖。
//   13 KPI 帶：載入示範資料、在資料來源頁讀入 verification/revamp-v4-capture/targets.csv、回總覽，對 kpi-band 做元素截圖
//      （三格 kpi-target-*：淨營收與扣廣告後貢獻達成、商品毛利落後，C18 細條兩種狀態都在畫面上）。
// 10–13 都帶 stylePath（shared.ts 的 NO_OVERLAY_STYLE，執行時寫到 test-results 底下）：sticky 的頂欄、期間列、精靈底部動作列與手機底部分頁列不疊在截圖範圍內，版面位置不變。
// 01–09、10–11、12、13 分成四個測試（各自全新的瀏覽器狀態）：10–13 的操作不會影響 01–09 的畫面。
// 基準位置：verification/revamp-v4/${CAPTURE_BATCH}/snapshots/{project}/{名稱}.png（見 verification/revamp-v4.capture.config.ts）。
// 用 expect.soft：一張不同不會擋住後面幾張，報告一次列出全部差異。
const top = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));
/** 10–13：捲回頂端並把滑鼠移到左上角，最後一次點擊的位置不會在截圖範圍內留下 hover 底色（版面在之後的批次變動時 hover 的對象也會跟著變）。 */
const settle = async (page: Page) => { await top(page); await page.mouse.move(0, 0); };
const inclusive = resolve("tests/fixtures/inclusive_tax");

/** 收集 console error 與 pageerror；每個測試最後斷言為空。 */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

test("V4-0a 畫面基準 01–09（v3 的 9 個畫面）", async ({ page }) => {
  const errors = collectErrors(page);

  await loadDemo(page);
  await top(page);
  await expect.soft(page).toHaveScreenshot("01-overview-top.png");
  await expect.soft(page).toHaveScreenshot("02-overview-full.png", { fullPage: true });

  // 公式與來源抽屜：三件事第 1 列「看證據」。
  await page.getByTestId("top-three").getByRole("button", { name: labels.evidence.buttons.viewEvidence, exact: true }).first().click();
  await expect(evidenceDrawer(page)).toBeVisible();
  await expect.soft(page).toHaveScreenshot("03-evidence-drawer.png");
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);

  // 行動看板：三件事第 1 列「加入待辦」會切到待辦頁並新增一張卡。
  await page.getByTestId("top-three").getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }).first().click();
  await expect(page.getByTestId("board-card-1")).toBeVisible();
  await top(page);
  await expect.soft(page).toHaveScreenshot("04-actions-board.png", { fullPage: true });

  await goTo(page, "diagnosis", page.getByTestId("diagnosis-panel"));
  await expect.soft(page).toHaveScreenshot("05-diagnosis.png", { fullPage: true });

  await goTo(page, "products", page.getByTestId("product-table"));
  await expect.soft(page).toHaveScreenshot("06-products.png", { fullPage: true });

  await navigateTo(page, "scenarios");
  await calculateKeepPreset(page);
  await top(page);
  await expect.soft(page).toHaveScreenshot("07-scenarios.png", { fullPage: true });

  await goTo(page, "meeting", page.getByTestId("meeting-page"));
  await expect(page.getByTestId("manager-summary")).toBeVisible();
  await expect.soft(page).toHaveScreenshot("08-meeting.png", { fullPage: true });

  await goTo(page, "data", page.getByTestId("targets-entry"));
  await expect.soft(page).toHaveScreenshot("09-data.png", { fullPage: true });

  expect(errors, `${errors.length} console／page errors`).toEqual([]);
});

test("V4-0a 畫面基準 10 健檢圖區、11 商品圖區", async ({ page }) => {
  const errors = collectErrors(page);
  await loadDemo(page);

  await goTo(page, "diagnosis", page.getByTestId("diagnosis-panel"));
  await expect(page.getByTestId("diagnosis-list")).toBeVisible();
  await expect(page.getByTestId("channel-compare")).toBeVisible();
  await settle(page);
  // 文件座標（已捲回頂端）：上緣＝diagnosis-list 下緣、下緣＝channel-compare 下緣；左右＝diagnosis-panel 與 channel-compare 的聯集；向外取整到整數 px。
  const clip = await page.evaluate(() => {
    const rect = (testid: string) => document.querySelector(`[data-testid='${testid}']`)!.getBoundingClientRect();
    const list = rect("diagnosis-list"), panel = rect("diagnosis-panel"), compare = rect("channel-compare");
    const x = Math.floor(Math.min(panel.left, compare.left) + window.scrollX), right = Math.ceil(Math.max(panel.right, compare.right) + window.scrollX);
    const y = Math.floor(list.bottom + window.scrollY), bottom = Math.ceil(compare.bottom + window.scrollY);
    return { x, y, width: right - x, height: bottom - y };
  });
  expect(clip.height, "diagnosis-list 下緣到 channel-compare 下緣要有高度").toBeGreaterThan(0);
  await expect.soft(page).toHaveScreenshot("10-diagnosis-chart-area.png", { fullPage: true, clip, stylePath: await noOverlayStylePath() });

  await goTo(page, "products", page.getByTestId("product-table"));
  // section.product-highlights 沒有 testid（定位器登記在 verification/revamp-v4/e2e-text-assertions.csv）；必須恰好一個。
  const highlights = page.locator("section.product-highlights");
  await expect(highlights).toHaveCount(1);
  await expect(highlights).toBeVisible();
  await settle(page);
  // V4-4：改用 fullPage＋clip（同畫面 10）。元素截圖會先把 section 捲進視窗，main section 的 scroll-margin-top 120px 讓 G13 加入後變高的 section 下緣超出 1000px 視窗，
  // 超出的那段（G13 資料表 summary 與圖框下緣）不會繪製；以文件座標取 section 的範圍，畫面與元素截圖相同，只是下緣完整。
  const highlightsClip = await highlights.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = Math.floor(rect.left + window.scrollX), y = Math.floor(rect.top + window.scrollY);
    return { x, y, width: Math.ceil(rect.right + window.scrollX) - x, height: Math.ceil(rect.bottom + window.scrollY) - y };
  });
  await expect.soft(page).toHaveScreenshot("11-products-chart-area.png", { fullPage: true, clip: highlightsClip, stylePath: await noOverlayStylePath() });

  expect(errors, `${errors.length} console／page errors`).toEqual([]);
});

test("V4-0a 畫面基準 12 匯入精靈步驟 4（含稅 inclusive_tax）", async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  // 流程同 tests/e2e/import-wizard.spec.ts「含稅來源逐列換算後 KPI 等於手算」：選檔、下一步、（對照）、口徑含稅、確認並檢核。
  await openWizard(page);
  await setWizardFiles(page, inclusive);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "inclusive");
  await confirmAndCheck(page, "valid");
  const step = page.getByTestId("import-step-4");
  await expect(step).toBeVisible();
  await settle(page);
  await expect.soft(step).toHaveScreenshot("12-import-step-4.png", { stylePath: await noOverlayStylePath() });

  expect(errors, `${errors.length} console／page errors`).toEqual([]);
});

test("V4-0a 畫面基準 13 KPI 帶（讀入 targets.csv，達成與落後兩種狀態）", async ({ page }) => {
  const errors = collectErrors(page);
  await loadDemo(page);
  await readTargets(page);
  const band = page.getByTestId("kpi-band");
  // 只載入示範資料時沒有任何 kpi-target-*（src/components/overview.tsx:69）；讀入 targets.csv 後三格都有目標列，C18 細條兩種狀態都要在畫面上。
  await expect(band.locator("[data-testid^='kpi-target-']")).toHaveCount(3);
  await expect(band.locator("[data-testid^='kpi-target-'].matched")).toHaveCount(3);
  await expect(band.locator("[data-testid^='kpi-target-'] .kpi-bullet.is-behind")).toHaveCount(1);
  await expect(band.locator("[data-testid^='kpi-target-'] .kpi-bullet:not(.is-behind)")).toHaveCount(2);
  await expect(band.getByTestId("kpi-target-gross_profit").locator(".kpi-bullet")).toHaveClass(/is-behind/);
  await settle(page);
  await expect.soft(band).toHaveScreenshot("13-kpi-band.png", { stylePath: await noOverlayStylePath() });

  expect(errors, `${errors.length} console／page errors`).toEqual([]);
});
