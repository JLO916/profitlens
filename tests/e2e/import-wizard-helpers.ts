import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { clickReplacing } from "./replacement-helpers";

// R3 匯入精靈共用 helper：所有字串由 labels 取字；檔案角色標籤對應 step-files 的 aria-label。
export const wizardRoles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
export type WizardRole = typeof wizardRoles[number];
export type FilePayload = { name: string; mimeType: string; buffer: Buffer };
const copy = labels.importWizard;
export const wizardFileLabels: Record<WizardRole, string> = { "sales_daily.csv": copy.files.sales, "channel_costs_daily.csv": copy.files.costs, "ad_spend_daily.csv": copy.files.ads };
export const wizard = (page: Page) => page.getByTestId("import-wizard");
export const wizardStatus = (page: Page) => page.getByTestId("import-status");
export const commitButton = (page: Page) => wizard(page).getByRole("button", { name: copy.commit, exact: true });
export type Classification = "valid" | "partial" | "blocking";

export async function openWizard(page: Page) {
  await page.getByRole("button", { name: labels.buttons.importData, exact: true }).click();
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
export async function fillWizardSettings(page: Page, settings: Record<string, string>) {
  for (const [label, value] of Object.entries(settings)) await wizard(page).getByLabel(label, { exact: true }).fill(value);
}
export async function confirmAndCheck(page: Page, classification: Classification) {
  await wizard(page).getByRole("button", { name: copy.confirmAndCheck, exact: true }).click();
  await expect(wizardStatus(page)).toHaveText(copy.result[classification], { timeout: 20_000 });
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
