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

/** R1 folded the meeting draft and the period table into <details>, and moved downloads into a top-bar menu. */
export async function openDetails(root: Locator) {
  if (await root.getAttribute('open') === null) await root.locator(':scope > summary').click();
  return root;
}
export async function closeDetails(root: Locator) {
  if (await root.getAttribute('open') !== null) await root.locator(':scope > summary').click();
}
export const openMeeting = (page: Page) => openDetails(page.getByTestId('overview-meeting'));
export const openPeriodComparison = (page: Page) => openDetails(page.getByTestId('period-comparison'));
export const openDownloads = (page: Page) => openDetails(page.getByTestId('download-menu'));
export const closeDownloads = (page: Page) => closeDetails(page.getByTestId('download-menu'));
