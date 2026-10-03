import { labels } from '../../src/i18n';
import { type Locator, type Page } from '@playwright/test';
/** Legacy workflows explicitly choose to discard; guard behavior has its own dedicated tests. */
export async function clickReplacing(page: Page, button: Locator) {
  await button.click();
  const dialog = page.getByRole('dialog', { name: labels.ui.replacementDialog.heading });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
}
/** R5：試算頁進頁即表單（沒有「開始試算」按鈕）；全站多通路時先等單通路基準重算完成，方案 1 的表單出現即可。 */
export async function startChannelContext(page: Page) {
  await page.getByTestId('decision-workbench').waitFor({ state: 'visible' });
  await page.getByTestId('scenario-1').waitFor({ state: 'visible' });
}
/** R5：試算頁的通路只改本頁（select data-testid="scenario-channel"），不改全站篩選。 */
export async function selectScenarioChannel(page: Page, channel: string) {
  await page.getByTestId('scenario-channel').selectOption(channel);
  await startChannelContext(page);
}
/** R5：行動頁預設看板；需要清單編輯表單時先切到清單檢視。 */
export async function switchActionsView(page: Page, view: 'board' | 'list') {
  const button = page.getByTestId(`actions-view-${view}`);
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
}

/** R1 folded the meeting draft and the period table into <details>, and moved downloads into a top-bar menu. */
export async function openDetails(root: Locator) {
  if (await root.getAttribute('open') === null) await root.locator(':scope > summary').click();
  return root;
}
export async function closeDetails(root: Locator) {
  if (await root.getAttribute('open') !== null) await root.locator(':scope > summary').click();
}
/** R6：會議稿搬到新分頁「會議紀錄」；openMeeting 改為切到該分頁並回傳 meeting-page 區塊（舊的 overview-meeting details 已移除）。 */
export async function openMeeting(page: Page) {
  const nav = page.getByRole('button', { name: labels.nav.meeting.label, exact: true });
  if (await nav.getAttribute('aria-current') !== 'page') await nav.click();
  const root = page.getByTestId('meeting-page');
  await root.waitFor({ state: 'visible' });
  return root;
}
/** R6：首次載入資料時會出現非 modal 的「存在這台電腦？」提示（右下角）；不測自動保存的流程先按「先不要」。 */
export async function dismissSavePrompt(page: Page) {
  const prompt = page.getByTestId('local-save-prompt');
  if (await prompt.count() && await prompt.isVisible()) await prompt.getByRole('button', { name: labels.autoSave.decline, exact: true }).click();
}
export async function acceptSavePrompt(page: Page) {
  const prompt = page.getByTestId('local-save-prompt');
  await prompt.waitFor({ state: 'visible' });
  await prompt.getByRole('button', { name: labels.autoSave.accept, exact: true }).click();
}
export const openPeriodComparison = (page: Page) => openDetails(page.getByTestId('period-comparison'));
export const openDownloads = (page: Page) => openDetails(page.getByTestId('download-menu'));
export const closeDownloads = (page: Page) => closeDetails(page.getByTestId('download-menu'));

/** R2 rule-card headlines are glossary templates with numbers filled in; match them by template shape. */
export function ruleHeadline(code: keyof typeof labels.rules): RegExp {
  const template = labels.rules[code].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?');
  return new RegExp(`^${template}$`);
}
