import { type Locator, type Page } from '@playwright/test';
/** Legacy workflows explicitly choose to discard; guard behavior has its own dedicated tests. */
export async function clickReplacing(page: Page, button: Locator) {
  await button.click();
  const dialog = page.getByRole('dialog', { name: '替換前先儲存工作區' });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: '不儲存並繼續', exact: true }).click();
}
export async function startChannelContext(page: Page) {
  const start = page.getByRole('button', { name: /^建立 .+ 方案工作區$/ });
  // The context preparation runs asynchronously from source validation.
  await Promise.race([start.waitFor({state:'visible'}), page.getByTestId('decision-workbench').waitFor({state:'visible'})]);
  if (await start.isVisible()) await start.click();
}
/** HF-06: once data exists, "載入示範資料" lives in the "更多" menu instead of the header. */
export async function demoButton(page: Page): Promise<Locator> {
  const menu = page.getByTestId('more-menu');
  if (await menu.count() && await menu.isVisible() && await menu.getAttribute('open') === null) await menu.locator('summary').click();
  return page.getByRole('button', { name: '載入示範資料', exact: true });
}
