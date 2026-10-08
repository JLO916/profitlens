import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { navControl, navigateTo, type NavId } from "../../tests/e2e/replacement-helpers";

// V4-0a 基準共用的操作（自 verification/revamp-v3-capture/shared.ts 複製，01–09 的操作一字不改）：所有字串由 labels 取字，與 tests/e2e 同一套選擇器。

/** 固定時鐘（台北 2026-10-05 10:00）：行動到期日、會議日期等「今天」衍生的文字不會因執行日不同而變。計時器照常執行。 */
export const FIXED_NOW = new Date("2026-10-05T10:00:00+08:00");

/** 七頁（側欄順序；與 tests/e2e/launch-helpers-v310.ts 的 LAUNCH_PAGES 相同）。開發者驗證頁不在量測範圍。 */
export const SEVEN_PAGES = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data"] as const;
export type SevenPage = typeof SEVEN_PAGES[number];

/** 畫面 13 用的目標檔：期間＝示範資料本期（2026-07-13–2026-08-23）、通路 ALL；淨營收與扣廣告後貢獻達成、商品毛利落後。 */
export const TARGETS_CSV = resolve("verification/revamp-v4-capture/targets.csv");

/**
 * 目前看得到的導覽控制（V3-3：桌機是側欄按鈕；手機是底部分頁列，商品毛利／假設試算／資料來源／開發者驗證在「更多」面板裡，要先開面板）。
 * 只在桌機直接 .click()；四尺寸的走查請用 goTo／navigateTo（手機會先開「更多」）。
 */
export const nav = (page: Page, id: NavId) => navControl(page, id);
export { navigateTo };

/** 新訪客：開首頁、載入示範資料、拒絕本機保存提示（量測狀態：示範資料 ready、沒有保存提示）。 */
export async function loadDemo(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready.replace("{date}", ""));
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("top-three")).toBeVisible();
  // V3-4a：KPI 帶（C1）取代五張卡；五格仍帶 kpi-* testid。
  await expect(page.locator(".kpi-band [data-testid^='kpi-']")).toHaveCount(5);
}

/** V3-3：經 navigateTo 切頁（桌機側欄；手機底部分頁列或「更多」），等 anchor 可見後捲回頂端。 */
export async function goTo(page: Page, id: NavId, anchor: Locator) {
  await navigateTo(page, id);
  await expect(anchor).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** 試算：方案 1 套用「維持現況」範本、同意假設、計算（與 R7 走查相同）。 */
export async function calculateKeepPreset(page: Page) {
  await page.getByTestId("decision-workbench").waitFor({ state: "visible" });
  const card = page.getByTestId("scenario-1");
  await card.waitFor({ state: "visible" });
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  // V3-6（D-V3-12＝B）：聲明勾一次就記住；checkbox 勾完即卸載（改顯示 scenario-acknowledged），所以用 click() 而不是 check()。
  const consent = card.getByTestId("scenario-accept");
  if (await consent.count()) await consent.click();
  await expect(card.getByTestId("scenario-acknowledged")).toBeVisible();
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
}

/**
 * 畫面 10–13 截圖時套用的樣式（只在截圖當下生效）：元素比視窗高時 Playwright 會捲動，
 * sticky 的頂欄、期間列、匯入精靈底部動作列與手機 fixed 的底部分頁列會疊在元素上，疊的位置又隨捲動量而變。
 * sticky 改成 static 不改任何元素的位置（sticky 本來就佔著正常流的位置，只是視覺上位移）；fixed 的分頁列不佔版面，改成 visibility: hidden。
 * toHaveScreenshot 只接受 stylePath（樣式檔路徑，不接受字串），所以執行時把這段寫到 test-results 底下的暫存檔（不提交）。01–09 沿用 v3 的拍法，不套用。
 */
export const NO_OVERLAY_STYLE = ".topbar, .period-bar, .wizard-footer { position: static !important; }\n.mobile-tabbar { visibility: hidden !important; }\n";
export const NO_OVERLAY_STYLE_PATH = resolve("test-results/revamp-v4-capture/no-overlay.css");
/** 寫出 NO_OVERLAY_STYLE 暫存檔並回傳路徑（給 toHaveScreenshot 的 stylePath）。 */
export async function noOverlayStylePath() {
  await mkdir(dirname(NO_OVERLAY_STYLE_PATH), { recursive: true });
  await writeFile(NO_OVERLAY_STYLE_PATH, NO_OVERLAY_STYLE);
  return NO_OVERLAY_STYLE_PATH;
}

export const evidenceDrawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence}$`) });

/**
 * 畫面 13：在資料來源頁讀入 targets.csv（流程比照 tests/e2e/revamp-r4.spec.ts 約第 145 行：getByLabel(labels.targets.upload)、setInputFiles、等 targets-table 出現），
 * 再回總覽。讀完後 KPI 帶三格出現 kpi-target-*（兩格達成、一格落後）。
 */
export async function readTargets(page: Page, file = TARGETS_CSV) {
  await goTo(page, "data", page.getByTestId("targets-entry"));
  await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles(file);
  await expect(page.getByTestId("targets-table").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("targets-issues")).toHaveCount(0);
  await goTo(page, "overview", page.getByTestId("kpi-band"));
}
