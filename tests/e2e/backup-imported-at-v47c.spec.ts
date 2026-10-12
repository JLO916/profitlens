import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { formatSavedDateTime } from "../../src/application/auto-save";
import { importViaWizard } from "./import-wizard-helpers";
import { clickReplacing, closeStorage, dismissSavePrompt, navigateTo, openStorage } from "./replacement-helpers";
import { versionInfo } from "./data-page-helpers-v3";
import { loadDemo } from "./launch-helpers-v310";

// V4-7c（D-V3-30＝A；06_BATCHES V4-7c「E2E 匯入後備份還原一條」）：匯入時間寫進備份 v5 的 payload.active.imported_at（選填，只記到分的 UTC）。
// 精靈匯入 golden（fixtures/golden，含設定檔）→ 資料來源頁「版本與來源資訊」的匯入時間 → 下載備份（帶 imported_at，畫面時間＝formatSavedDateTime(imported_at)）
// → 載入示範資料（沒有匯入時間列；示範資料的備份沒有 imported_at 鍵）→ 還原剛才的備份 → 匯入時間列回來、文字逐字相同。
// 字串一律取 labels；手機的儲存選單在頂欄「更多」裡（openStorage／closeStorage），首次保存提示按「先不要」。
test.describe.configure({ timeout: 90_000 });
const ws = labels.storage.workspace;
const status = (page: Page) => page.getByTestId("workspace-status");
const savePrompt = (page: Page) => page.getByTestId("local-save-prompt");
const asOf = async (id: "demo" | "golden") => (JSON.parse(await readFile(resolve("fixtures", id, "manifest.json"), "utf8")) as { data_as_of: string }).data_as_of;
const importedAtRow = (page: Page) => versionInfo(page).locator("dt").filter({ hasText: labels.data.pageV3.version.importedAt });
const importedAtValue = (page: Page) => importedAtRow(page).locator("xpath=following-sibling::dd[1]");
type Wire = { schema_version: string; payload: { active: Record<string, unknown> & { imported_at?: string } } };

/** 頂欄儲存選單「下載備份檔」（手機先展開頂欄「更多」）；下載完收起選單。 */
async function downloadBackup(page: Page): Promise<string> {
  const storage = await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage.getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("profitlens-workspace.json");
  const text = await readFile((await file.path())!, "utf8");
  await closeStorage(page);
  return text;
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("V4-7c 匯入時間寫進備份：精靈匯入後下載備份帶 imported_at（到分），示範資料沒有，還原後資料來源頁的匯入時間逐字相同", async ({ page }) => {
  const goldenReady = fill(labels.shell.status.ready, { date: await asOf("golden") });
  const demoReady = fill(labels.shell.status.ready, { date: await asOf("demo") });
  const started = Date.now();
  await importViaWizard(page, resolve("fixtures/golden"), { manifest: true });
  const committed = Date.now();
  await expect(status(page)).toContainText(goldenReady);
  // 首次載入資料後的非 modal 保存提示（手機會擋住「更多」）：本檔不測自動保存，按「先不要」。
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);

  // 1. 資料來源頁：精靈匯入後有「匯入時間」列（臺北時間 YYYY-MM-DD hh:mm）。
  await navigateTo(page, "data");
  await expect(importedAtRow(page)).toHaveCount(1);
  const shown = (await importedAtValue(page).textContent())!;
  expect(shown).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  // 2. 下載備份：版本字串仍是 v5；active.imported_at 是到分的 UTC，畫面時間由它格式化而來；時間落在這次匯入的那一分鐘內。
  const importedText = await downloadBackup(page);
  const imported = JSON.parse(importedText) as Wire;
  expect(imported.schema_version).toBe(WORKSPACE_VERSION);
  const value = imported.payload.active.imported_at!;
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
  expect(formatSavedDateTime(new Date(value))).toBe(shown);
  expect(Date.parse(value)).toBeGreaterThanOrEqual(Math.floor(started / 60_000) * 60_000);
  expect(Date.parse(value)).toBeLessThanOrEqual(committed);

  // 3. 載入示範資料（資料來源頁頁首的「載入示範資料」）：沒有匯入時間列；示範資料的備份 active 沒有 imported_at 鍵。
  await loadDemo(page);
  await expect(status(page)).toContainText(demoReady);
  await navigateTo(page, "data");
  await expect(importedAtRow(page)).toHaveCount(0);
  const demo = JSON.parse(await downloadBackup(page)) as Wire;
  expect(demo.schema_version).toBe(WORKSPACE_VERSION);
  expect(Object.keys(demo.payload.active)).not.toContain("imported_at");

  // 4. 還原剛才的備份（有未保存的示範資料時明確捨棄）→ 資料來源頁的匯入時間列回來、文字逐字相同。
  const storage = await openStorage(page);
  await storage.getByLabel(ws.selectBackupFile, { exact: true }).setInputFiles({ name: "imported.json", mimeType: "application/json", buffer: Buffer.from(importedText) });
  await expect(page.getByRole("region", { name: ws.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, storage.getByRole("button", { name: ws.applyRestore, exact: true }));
  await expect(status(page)).toContainText(goldenReady);
  await expect(storage.getByTestId("storage-notice")).toHaveText(ws.restoredNotice);
  await dismissSavePrompt(page);
  await closeStorage(page);
  await navigateTo(page, "data");
  await expect(importedAtRow(page)).toHaveCount(1);
  await expect(importedAtValue(page)).toHaveText(shown);
  // 還原後再下載一次：匯入時間不變（還原不會改寫成還原的時間）。
  expect((JSON.parse(await downloadBackup(page)) as Wire).payload.active.imported_at).toBe(value);
});
