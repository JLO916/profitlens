import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { acceptSavePrompt, clickReplacing, openDownloads, openMeeting, startChannelContext, switchActionsView } from "../../tests/e2e/replacement-helpers";

// R6 截圖：首次保存提示（golden 載入後）、同意後頂欄「已保存 hh:mm」與儲存選單的自動保存狀態、結束一次會議後的會議紀錄分頁（議程、比較、歷史）、
// 下載選單的「會議摘要」區、列印版面（print media）；四尺寸。只拍照，不斷言產品行為；這裡的 expect 只用來等畫面到位。
async function shoot(page: Page, dir: string, name: string, anchor?: Locator) {
  if (anchor) await anchor.evaluate(element => element.scrollIntoView({ block: "start" }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${name}-viewport.png` });
  await page.screenshot({ path: `${dir}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}
const nav = (page: Page, id: keyof typeof labels.shell.nav) => page.getByRole("button", { name: labels.shell.nav[id].headline, exact: true });
async function load(page: Page, id: "golden" | "demo") {
  await page.goto("/");
  await nav(page, "validation").click();
  await page.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready);
}

test("R6 截圖", async ({ page }, testInfo) => {
  // R6_CAPTURE_DIR 只供試跑時把圖輸出到別處（不覆寫證據檔）；正式流程不設，輸出到 verification/revamp-R6。
  const dir = resolve(process.env.R6_CAPTURE_DIR ?? "verification/revamp-R6");
  await mkdir(dir, { recursive: true });
  const suffix = testInfo.project.name;
  // 只替換會擋住流程的系統列印對話框；列印版面與 print media 樣式照常運作。
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });

  // 1. golden 載入後右下角（手機：底部）的首次保存提示。
  await load(page, "golden");
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await shoot(page, dir, `1-save-prompt-${suffix}`);

  // 2. 按「存在這台電腦」→ 頂欄「已保存 hh:mm」；打開儲存選單看自動保存狀態。
  await acceptSavePrompt(page);
  const storage = page.getByTestId("workspace-storage");
  await expect(storage.locator(":scope > summary")).toContainText(labels.shell.status.savedAt.split("{time}")[0].trim());
  await storage.locator(":scope > summary").click();
  await expect(storage.getByTestId("autosave-status")).toContainText(labels.storage.autoSave.statusOn);
  await shoot(page, dir, `2-saved-time-${suffix}`);
  await storage.locator(":scope > summary").click();
  await expect(storage).not.toHaveAttribute("open", "");

  // 3. 結束一次會議後的會議紀錄分頁：DTC「維持現況」方案（270.00）選入、置頂一張待辦、決議採用。
  await nav(page, "scenarios").click();
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  await card.getByLabel(labels.scenarios.inputs.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
  await nav(page, "actions").click();
  await switchActionsView(page, "board");
  await page.getByRole("button", { name: labels.actions.buttons.addAction, exact: true }).click();
  const action = page.getByTestId("board-card-1");
  await action.getByLabel(labels.actions.form.problem, { exact: true }).fill("核對 DTC 物流報價");
  await action.getByRole("button", { name: labels.actions.buttons.pin, exact: true }).click();
  const meeting = await openMeeting(page);
  await meeting.getByTestId("review-workbench").getByLabel(labels.meeting.form.name, { exact: true }).fill("10 月第一週營運會議");
  await meeting.getByTestId("meeting-agenda-5").getByLabel(fill(labels.meeting.review.scenarioSelect, { channel: "DTC" }), { exact: true }).selectOption({ label: fill(labels.meeting.review.planOption, { name: fill(labels.scenarios.decision.defaultPlanName, { n: 1 }) }) });
  await meeting.getByTestId("meeting-decision").getByLabel(labels.meeting.form.decision, { exact: true }).selectOption("adopted");
  await meeting.getByTestId("meeting-finalize").click();
  await meeting.getByTestId("meeting-finalize-confirm-button").click();
  await expect(meeting.getByTestId("meeting-status")).toHaveText(labels.meeting.page.finalized);
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await expect(meeting.getByTestId("meeting-compare-same_scope")).toBeVisible();
  await meeting.getByTestId("meeting-history-item").first().locator("summary").click();
  await shoot(page, dir, `3-meeting-page-${suffix}`);
  await shoot(page, dir, `3b-meeting-compare-${suffix}`, meeting.getByTestId("meeting-compare"));

  // 4. 下載選單（含「會議摘要」區）。
  const menu = await openDownloads(page);
  const section = menu.getByTestId("download-meeting-section");
  await expect(section).toBeVisible();
  await shoot(page, dir, `4-download-menu-${suffix}`, section);

  // 5. 「匯出 PDF」→ 列印版面（print media）全頁。
  await menu.getByRole("button", { name: labels.exports.buttons.exportPdf, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("manager-summary-print")).toBeVisible();
  await shoot(page, dir, `5-print-${suffix}`);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("manager-summary-print")).toHaveCount(0);
});
