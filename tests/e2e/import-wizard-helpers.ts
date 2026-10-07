import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { clickReplacing } from "./replacement-helpers";

// R3 匯入精靈共用 helper：所有字串由 labels 取字；檔案角色標籤對應 step-files 的 aria-label。
export const wizardRoles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
export type WizardRole = typeof wizardRoles[number];
export type FilePayload = { name: string; mimeType: string; buffer: Buffer };
const copy = labels.importWizard;
const v3 = copy.wizardV3;
export const wizardFileLabels: Record<WizardRole, string> = { "sales_daily.csv": copy.files.sales, "channel_costs_daily.csv": copy.files.costs, "ad_spend_daily.csv": copy.files.ads };
export const wizard = (page: Page) => page.getByTestId("import-wizard");
export const wizardStatus = (page: Page) => page.getByTestId("import-status");
/** V3-8：第 4 步既有的檢核結果句（copy.result[x]），檢核中不出現。 */
export const wizardResultNote = (page: Page) => page.getByTestId("import-result-note");
export const commitButton = (page: Page) => wizard(page).getByRole("button", { name: copy.commit, exact: true });
export type Classification = "valid" | "partial" | "blocking";

/**
 * V3-3：頁首的「匯入資料」（page-import）只留在資料來源頁；其他頁（含空狀態）從頂欄資料狀態（data-status）→「匯入新資料」（data-status-import），2 次點擊。
 * 手機的資料狀態按鈕仍在頂欄（不在「更多」裡）。簽名不變。
 */
export async function openWizard(page: Page) {
  const pageImport = page.getByTestId("page-import");
  if (await pageImport.isVisible()) await pageImport.click();
  else {
    // 剛 goto 時按鈕可能還沒 hydrate（點了不會開）：重試到 popover 出現為止；每次點之前看 aria-expanded，不會把它關掉。
    const status = page.getByTestId("data-status");
    await expect(async () => {
      if (await status.getAttribute("aria-expanded") !== "true") await status.click();
      await expect(page.getByTestId("data-status-popover")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("data-status-import").click();
  }
  await expect(wizard(page)).toBeVisible();
}
/** setInputFiles 不算點擊。 */
export async function setWizardFiles(page: Page, directory: string, overrides: Partial<Record<WizardRole, FilePayload>> = {}) {
  for (const role of wizardRoles) await wizard(page).getByLabel(wizardFileLabels[role], { exact: true }).setInputFiles(overrides[role] ?? resolve(directory, role));
  for (const role of wizardRoles) await expect(page.getByTestId(`import-file-${role}`)).toContainText((overrides[role] ?? { name: role }).name);
}
/** 進階：資料集設定檔在第 1 步的收合區。 */
export async function setWizardManifest(page: Page, file: string | FilePayload) {
  const advanced = wizard(page).locator("details", { has: page.locator("summary", { hasText: copy.advanced }) });
  if (await advanced.getAttribute("open") === null) await advanced.locator(":scope > summary").click();
  await advanced.getByLabel(copy.manifestLabel, { exact: true }).setInputFiles(file);
  await expect(advanced.getByRole("status")).toContainText(typeof file === "string" ? file.split("/").pop()! : file.name);
}
export async function nextFromFiles(page: Page) {
  await wizard(page).getByRole("button", { name: copy.next, exact: true }).click();
  await expect(page.getByTestId("import-step-1")).toHaveCount(0);
}
/** 欄名全符合標準時第 2 步會自動完成；否則按「確認對照」。 */
export async function confirmMappingIfShown(page: Page) {
  if (await page.getByTestId("import-step-2").count()) await wizard(page).getByRole("button", { name: copy.confirmMapping, exact: true }).click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
}
export async function chooseBasis(page: Page, basis: "exclusive" | "inclusive" | "unsure" = "exclusive") {
  await wizard(page).getByLabel(copy.basis[basis], { exact: true }).check();
}
/**
 * V3-8（§7.7.2）：第 3 步的收合區（內容保持掛載）——「調整比較期間」（比較方式、上期／本期 4 個日期、整月捷徑）、
 * 「調整換算欄位」（含稅時 9 個換算 checkbox）、「調整通路」（通路多於 1 個時）。找 summary 是該文字的直屬 <details>。
 */
export const wizardDetails = (page: Page, summary: string) => wizard(page).locator("details", { has: page.locator(":scope > summary", { hasText: summary }) });
/** 展開第 3 步的收合區（已展開就不點，不會把它關掉）；回傳該 <details>。 */
export async function openWizardDetails(page: Page, summary: string) {
  const details = wizardDetails(page, summary);
  if (await details.getAttribute("open") === null) {
    const toggle = details.locator(":scope > summary");
    // 底部動作列是 sticky：先把 summary 捲到畫面中間，避免被動作列蓋住。
    await toggle.evaluate(element => element.scrollIntoView({ block: "center" }));
    await toggle.click();
  }
  await expect(details).toHaveAttribute("open", "");
  return details;
}
export const openWizardPeriods = (page: Page) => openWizardDetails(page, v3.adjustPeriods);
export const openWizardChannels = (page: Page) => openWizardDetails(page, v3.adjustChannels);
export const openWizardConversion = (page: Page) => openWizardDetails(page, v3.adjustConvert);
/** 比較方式與上期／本期起訖收在「調整比較期間」裡：要填這些欄位時先展開。資料集名稱、資料到、涵蓋起訖仍直接可見。 */
const periodLabels = new Set<string>([copy.comparisonMode, labels.csvColumns.previous_start, labels.csvColumns.previous_end, labels.csvColumns.current_start, labels.csvColumns.current_end]);
export async function fillWizardSettings(page: Page, settings: Record<string, string>) {
  if (Object.keys(settings).some(label => periodLabels.has(label))) await openWizardPeriods(page);
  for (const [label, value] of Object.entries(settings)) await wizard(page).getByLabel(label, { exact: true }).fill(value);
}
/**
 * V3-8（§7.7.2）：第 4 步頂部 import-status 改成 L1 一行（「可以套用：…」），並帶 data-classification（檢核中是 checking）；
 * 既有的檢核結果句（copy.result[x]）移到 import-result-note。兩者都斷言。
 */
export async function confirmAndCheck(page: Page, classification: Classification) {
  await wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true }).click();
  await expect(wizardStatus(page)).toHaveAttribute("data-classification", classification, { timeout: 20_000 });
  await expect(wizardResultNote(page)).toHaveText(copy.result[classification]);
}
export async function commitWizard(page: Page) {
  await clickReplacing(page, commitButton(page));
  await expect(wizard(page)).toHaveCount(0);
}
/** 標準三檔 → 總覽：選檔、下一步、（對照）、口徑、確認、套用。 */
export async function importViaWizard(page: Page, directory: string, options: { manifest?: boolean | string | FilePayload; basis?: "exclusive" | "inclusive"; classification?: Exclude<Classification, "blocking">; overrides?: Partial<Record<WizardRole, FilePayload>>; settings?: Record<string, string>; beforeConfirm?: (root: Locator) => Promise<void> } = {}) {
  await openWizard(page);
  await setWizardFiles(page, directory, options.overrides);
  if (options.manifest) await setWizardManifest(page, options.manifest === true ? resolve(directory, "manifest.json") : options.manifest);
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, options.basis ?? "exclusive");
  if (options.settings) await fillWizardSettings(page, options.settings);
  if (options.beforeConfirm) await options.beforeConfirm(wizard(page));
  await confirmAndCheck(page, options.classification ?? "valid");
  await commitWizard(page);
}

/** 一路回到第 1 步（自動完成的第 2 步也會經過，可回看）。 */
export async function backToFiles(page: Page) {
  for (let step = 0; step < 4 && (await page.getByTestId("import-step-1").count()) === 0; step++) await wizard(page).getByRole("button", { name: copy.back, exact: true }).click();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
}
