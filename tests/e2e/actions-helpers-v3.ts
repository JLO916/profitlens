import { labels } from '../../src/i18n';
import { expect, type Locator, type Page } from '@playwright/test';
import { sidebarNav } from './replacement-helpers';

// ── V3-6 待辦頁（PRD §7.5）與假設試算頁（§7.4）的 E2E 輔助；共用的 replacement-helpers.ts 不動。 ──

/** V3-6：看板的待辦編輯抽屜（dialog[data-testid=action-drawer]，modal；只在開啟時渲染）。 */
export const actionDrawer = (page: Page) => page.getByTestId('action-drawer');
/** 「計算與來源」抽屜（dialog.evidence-drawer）。在待辦抽屜裡點「看明細」時會疊在待辦抽屜之上，此時頁面上有兩個 dialog，不能用 page.getByRole('dialog')。 */
export const evidenceDrawer = (page: Page) => page.locator('dialog.evidence-drawer');

/**
 * V3-6：點看板卡的「編輯」（board-card-n-edit，可見文字 labels.actions.pageV3.edit）開待辦編輯抽屜；
 * 等抽屜可見、焦點落在標題列的關閉 icon 鈕（action-drawer-close，autofocus）。回傳抽屜。
 */
export async function openActionDrawer(page: Page, n: number) {
  const edit = page.getByTestId(`board-card-${n}-edit`);
  await expect(edit).toHaveText(labels.actions.pageV3.edit);
  await edit.click();
  const drawer = actionDrawer(page);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('action-drawer-close')).toBeFocused();
  return drawer;
}
/** 關閉待辦編輯抽屜：點標題列的關閉 icon 鈕（action-drawer-close；抽屜裡另有底部的「關閉」action-drawer-dismiss，所以不用名稱定位），等抽屜卸載。 */
export async function closeActionDrawer(page: Page) {
  await actionDrawer(page).getByTestId('action-drawer-close').click();
  await expect(actionDrawer(page)).toHaveCount(0);
}

export type DecisionFormat = 'md' | 'csv' | 'json';
const decisionLabels: Record<DecisionFormat, string> = { md: labels.downloads.decisionMd, csv: labels.downloads.decisionCsv, json: labels.downloads.decisionJson };

/** 頁首 #page-actions 的「匯出本頁」頁內下拉：沒展開就點 summary（已展開時再點會把它收起，所以先看 open）。回傳展開後的 details。 */
async function openPageExport(page: Page, menuId: string, summaryId: string) {
  const menu = page.getByTestId(menuId);
  if (await menu.getAttribute('open') === null) await page.getByTestId(summaryId).click();
  await expect(menu).toHaveAttribute('open', '');
  return menu;
}
/** V3-6：待辦頁「匯出本頁」（details[data-testid=actions-export-menu]，summary export-page-actions）；三項 actions-export-{md|csv|json}，點完選單關閉、焦點回 summary。 */
export const openActionsExport = (page: Page) => openPageExport(page, 'actions-export-menu', 'export-page-actions');
/** V3-6：假設試算頁「匯出本頁」（details[data-testid=scenario-export-menu]，summary export-page-scenarios）；三項 scenario-export-{md|csv|json}。 */
export const openScenarioExport = (page: Page) => openPageExport(page, 'scenario-export-menu', 'export-page-scenarios');

/**
 * V3-6：v2 頁面上的「下載決策 Markdown／CSV／JSON」三顆按鈕搬進頁首「匯出本頁」。依目前所在頁（側欄 aria-current，手機也掛載）
 * 開待辦頁或假設試算頁的選單，回傳該格式的按鈕（可見文字仍是 v2 的按鈕名稱 labels.downloads.decision*，先斷言）。呼叫端自己點擊並等下載。
 */
export async function decisionExportButton(page: Page, format: DecisionFormat) {
  const onActions = await sidebarNav(page, 'actions').getAttribute('aria-current') === 'page';
  const onScenarios = await sidebarNav(page, 'scenarios').getAttribute('aria-current') === 'page';
  expect(onActions || onScenarios, '決策匯出只在待辦頁與假設試算頁的頁首').toBe(true);
  const menu = onActions ? await openActionsExport(page) : await openScenarioExport(page);
  const button = menu.getByTestId(`${onActions ? 'actions' : 'scenario'}-export-${format}`);
  await expect(button).toHaveText(decisionLabels[format]);
  return button;
}

/**
 * V3-6（D-V3-12＝B）：試算聲明在同一工作區勾一次就記住——勾過後所有方案（含切換通路、換期間）都不再有 checkbox（scenario-accept），
 * 改顯示 p[data-testid=scenario-acknowledged]（labels.scenarios.pageV3.acknowledged），直到清空目前資料。
 * checkbox 勾下去就被換掉，Playwright 的 check() 會一直等它「變成已勾選」而逾時，所以第一次是點擊後確認：已記住、checkbox 消失、焦點移到該方案的「試算」。
 * expected 指定預期狀態（'first'＝這張卡一定還有 checkbox；'acknowledged'＝一定已記住）；不給時依畫面判斷。
 */
export async function acceptAssumptions(card: Locator, expected?: 'first' | 'acknowledged') {
  const box = card.getByTestId('scenario-accept');
  const first = expected ? expected === 'first' : await box.count() > 0;
  if (first) {
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(card.locator('label.scenario-accept')).toHaveText(labels.scenario.acceptAssumptions);
    await box.click();
    await expect(card.getByRole('button', { name: labels.buttons.calculate, exact: true })).toBeFocused();
  }
  await expect(box).toHaveCount(0);
  await expect(card.getByTestId('scenario-acknowledged')).toHaveText(labels.scenarios.pageV3.acknowledged);
}
