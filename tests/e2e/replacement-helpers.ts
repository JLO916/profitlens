import { labels } from '../../src/i18n';
import { type Locator, type Page } from '@playwright/test';
/** Legacy workflows explicitly choose to discard; guard behavior has its own dedicated tests. */
export async function clickReplacing(page: Page, button: Locator) {
  await button.click();
  const dialog = page.getByRole('dialog', { name: labels.ui.replacementDialog.heading });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
}
export async function startChannelContext(page: Page) {
  const start = page.getByRole('button', { name: new RegExp(`^${labels.ui.multiScenarioWorkbench.startButton.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{channel\\\}/, '.+')}$`) });
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

/** R2 rule-card headlines are glossary templates with numbers filled in; match them by template shape. */
export function ruleHeadline(code: keyof typeof labels.rules): RegExp {
  const template = labels.rules[code].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?');
  return new RegExp(`^${template}$`);
}
