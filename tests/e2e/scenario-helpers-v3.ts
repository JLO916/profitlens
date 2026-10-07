import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { sidebarNav } from "./replacement-helpers";

// V3-6（PRD §7.4、§7.5；代理 E1）：假設試算頁與待辦頁的 E2E 共用 helper。replacement-helpers.ts 是三個代理共用的檔，不在這裡改。
const pageV3 = labels.scenarios.pageV3;
export type DecisionFormat = "md" | "csv" | "json";
/** 三項決策輸出（Markdown／CSV／JSON）的項目名稱：頂欄、試算頁「匯出本頁」、待辦頁「匯出本頁」都用 labels.downloads 這三個字。 */
export const decisionExportLabel: Record<DecisionFormat, string> = { md: labels.downloads.decisionMd, csv: labels.downloads.decisionCsv, json: labels.downloads.decisionJson };

/** 方案卡的聲明勾選框（D-V3-12 記住之前每張卡都有；名稱＝labels.scenario.acceptAssumptions）。 */
export const consentBox = (card: Locator) => card.getByTestId("scenario-accept");
/** D-V3-12＝B：同一工作區勾過一次後，每張卡改成一行說明，沒有勾選框。 */
export async function expectAcknowledged(card: Locator) {
  await expect(consentBox(card)).toHaveCount(0);
  await expect(card.getByTestId("scenario-acknowledged")).toHaveText(pageV3.acknowledged);
}
/** 還沒記住聲明：勾選框在、沒有勾，也沒有「已了解」那一行。 */
export async function expectConsentPending(card: Locator) {
  await expect(consentBox(card)).toHaveAccessibleName(labels.scenario.acceptAssumptions);
  await expect(consentBox(card)).not.toBeChecked();
  await expect(card.getByTestId("scenario-acknowledged")).toHaveCount(0);
}
/**
 * V3-6（D-V3-12＝B）：同意「我了解這是試算」。工作區第一次（這張卡還有勾選框）就點它；已記住時只斷言那一行說明。之後一律是「已了解」的狀態。
 * 不用 check()／setChecked(true)：一勾下去勾選框就換成 scenario-acknowledged，Playwright 點完要再讀一次勾選狀態，元素已卸載會一直重試到逾時。
 * 回傳這次是否真的勾了（＝工作區第一次）。勾下去後焦點移到同一張卡的「試算」。
 */
export async function acceptAssumptions(card: Locator): Promise<boolean> {
  const box = consentBox(card);
  const first = await box.count() > 0;
  if (first) {
    await expectConsentPending(card);
    await box.click();
    await expect(card.getByRole("button", { name: labels.buttons.calculate, exact: true })).toBeFocused();
  }
  await expectAcknowledged(card);
  return first;
}

/** V3-6（PRD §7.4 頁首）：試算頁「匯出本頁」頁內下拉（details scenario-export-menu，summary export-page-scenarios，在 #page-actions）。沒展開就點開，回傳 details。 */
export async function openScenarioExport(page: Page) {
  const menu = page.getByTestId("scenario-export-menu");
  if (await menu.getAttribute("open") === null) await page.getByTestId("export-page-scenarios").click();
  await expect(menu).toHaveAttribute("open", "");
  return menu;
}
/** V3-6（PRD §7.5 第 1 點）：待辦頁「匯出本頁」頁內下拉（details actions-export-menu，summary export-page-actions，在 #page-actions）。沒展開就點開，回傳 details。 */
export async function openActionsExport(page: Page) {
  const menu = page.getByTestId("actions-export-menu");
  if (await menu.getAttribute("open") === null) await page.getByTestId("export-page-actions").click();
  await expect(menu).toHaveAttribute("open", "");
  return menu;
}
async function readDownload(page: Page, item: Locator, format: DecisionFormat) {
  await expect(item).toHaveText(decisionExportLabel[format]);
  const [download] = await Promise.all([page.waitForEvent("download"), item.click()]);
  expect(download.suggestedFilename()).toBe(`profitlens-decision.${format}`);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}
/**
 * 試算頁：開「匯出本頁」→ 點 scenario-export-{format}，回傳下載檔內容（檔名 profitlens-decision.{format}）。
 * 這個下拉點完項目不會自己收起（.topbar-menu.auto-close：點外面或 Esc 才關）；下載後按 Esc 收起、焦點回 summary，免得展開的選單蓋住下面的方案欄。
 */
export async function downloadScenario(page: Page, format: DecisionFormat) {
  const menu = await openScenarioExport(page);
  const text = await readDownload(page, menu.getByTestId(`scenario-export-${format}`), format);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("export-page-scenarios")).toBeFocused();
  return text;
}
/** 待辦頁：開「匯出本頁」→ 點 actions-export-{format}；點完選單關閉、焦點回 summary。回傳下載檔內容。 */
export async function downloadActionsExport(page: Page, format: DecisionFormat) {
  const menu = await openActionsExport(page);
  const text = await readDownload(page, menu.getByTestId(`actions-export-${format}`), format);
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("export-page-actions")).toBeFocused();
  return text;
}
/**
 * v2 的決策下載按鈕在試算頁與待辦頁各有一組、測試用名稱點「看得到的那一組」；V3-6 兩頁都收進頁首「匯出本頁」下拉。
 * 依目前頁（側欄 aria-current）選對應的下拉：待辦頁 → actions-export-*；否則必須在假設試算頁 → scenario-export-*。
 */
export async function downloadDecision(page: Page, format: DecisionFormat) {
  if (await sidebarNav(page, "actions").getAttribute("aria-current") === "page") return downloadActionsExport(page, format);
  await expect(sidebarNav(page, "scenarios"), "決策下載只在假設試算頁或待辦頁").toHaveAttribute("aria-current", "page");
  return downloadScenario(page, format);
}

/** V3-6（PRD §7.4、C14）：方案卡範本列的 ? 說明（aria-label＝pageV3.templateHelpAria）；說明 region 平時 hidden 掛載。沒開就點開，回傳觸發鈕與 region。 */
export async function openTemplateHelp(card: Locator) {
  const trigger = card.getByRole("button", { name: pageV3.templateHelpAria, exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = card.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  await expect(panel).toBeVisible();
  return { trigger, panel };
}
/** 分段鈕「增減｜改成」（div.ui-segmented[role=group] data-testid scenario-mode-{field}）裡的按鈕。 */
export const modeButton = (card: Locator, field: string, mode: "relative" | "absolute") => card.getByTestId(`scenario-mode-${field}`).getByRole("button", { name: mode === "relative" ? pageV3.modeRelative : pageV3.modeAbsolute, exact: true });
