import { fill, labels } from '../../src/i18n';
import { formatPeriodL1, periodDays } from '../../src/application/presentation';
import { expect, type Locator, type Page } from '@playwright/test';
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

// ── V3-3 殼層：頂欄單列、側欄分組、手機底部分頁列與「更多」 ──
export type NavId = keyof typeof labels.nav;
/** V3-3：寬度 ≤ 767px 是手機殼層（側欄隱藏、底部分頁列、頂欄「更多」、期間按鈕＋底部面板）；768 起是桌機殼層。 */
export const isMobile = (page: Page) => page.viewportSize()!.width < 768;
/** 手機底部分頁列直接有的四頁；其餘（商品毛利／假設試算／資料來源／開發者驗證）在「更多」面板。 */
const TAB_IDS: readonly NavId[] = ['overview', 'diagnosis', 'actions', 'meeting'];
/**
 * 側欄（主要導覽）裡的頁面按鈕；手機上側欄是 display:none 但仍掛載，用來讀 aria-current（目前在哪一頁）。
 * 不用 getByRole({ includeHidden })：那會把 aria-hidden 的徽章（CSS attr 畫的「3」）算進名稱；改以按鈕內的頁名文字定位。
 */
export const sidebarNav = (page: Page, id: NavId) => page.locator('aside.sidebar nav button.nav-item').filter({ has: page.getByText(labels.nav[id].label, { exact: true }) });
/** 目前看得到的導覽控制：桌機是側欄按鈕；手機是底部分頁（四頁）或「更多」面板裡的項目（面板要先開，見 openMobileMore）。 */
export function navControl(page: Page, id: NavId): Locator {
  if (!isMobile(page)) return page.getByRole('navigation', { name: labels.ui.dashboard.mainNavAria, exact: true }).getByRole('button', { name: labels.nav[id].label, exact: true });
  return (TAB_IDS.includes(id) ? page.getByTestId('mobile-tabbar') : page.getByTestId('mobile-more')).getByRole('button', { name: labels.nav[id].label, exact: true });
}
/** 手機「更多」（底部分頁列第 5 格 mobile-tabbar-more）：面板還沒開就點開。 */
export async function openMobileMore(page: Page) {
  const more = page.getByTestId('mobile-tabbar-more');
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  await expect(page.getByTestId('mobile-more')).toBeVisible();
}
/**
 * V3-3 切頁：桌機點側欄按鈕；手機點底部分頁（總覽／健檢／待辦／會議），或「更多」→ 面板裡的項目（商品毛利／假設試算／資料來源／開發者驗證）。
 * 每次都會點（與 v2 測試直接點側欄相同，點目前頁也無妨），然後等該頁成為 aria-current="page"。
 */
export async function navigateTo(page: Page, id: NavId) {
  if (isMobile(page) && !TAB_IDS.includes(id)) await openMobileMore(page);
  await navControl(page, id).click();
  await expect(sidebarNav(page, id)).toHaveAttribute('aria-current', 'page');
}
/** R6：會議稿搬到新分頁「會議紀錄」；openMeeting 改為切到該分頁並回傳 meeting-page 區塊（舊的 overview-meeting details 已移除）。V3-3：經 navigateTo（手機走底部分頁）。 */
export async function openMeeting(page: Page) {
  if (await sidebarNav(page, 'meeting').getAttribute('aria-current') !== 'page') await navigateTo(page, 'meeting');
  const root = page.getByTestId('meeting-page');
  await root.waitFor({ state: 'visible' });
  return root;
}
/**
 * R7-4（D10＝A）：「開發者驗證」頁隱藏為 #validation，側欄預設不顯示。網址還不是 #validation 就設定 hash（觸發 hashchange；
 * 若尚未 hydrate，掛載時也會讀到），等側欄「開發者」組出現該項目後切過去（已在其他頁時切回來），再等驗證頁可見。
 * V3-3 手機：側欄隱藏，改由「更多」→「開發者驗證」。
 */
export async function openValidation(page: Page) {
  if (await page.evaluate(() => location.hash) !== '#validation') await page.evaluate(() => { location.hash = '#validation'; });
  await sidebarNav(page, 'validation').waitFor({ state: 'attached' });
  await navigateTo(page, 'validation');
  await page.getByTestId('validation-panel').waitFor({ state: 'visible' });
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

/** V3-3 手機：頂欄右側的 AI 狀態／指標定義／儲存／匯出收在「更多」（topbar-more）裡，收起時是 display:none；用之前先展開。桌機不動。 */
export async function openTopbarMore(page: Page) {
  if (!isMobile(page)) return;
  const more = page.getByTestId('topbar-more');
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
}
export async function closeTopbarMore(page: Page) {
  if (!isMobile(page)) return;
  const more = page.getByTestId('topbar-more');
  if (await more.getAttribute('aria-expanded') === 'true') await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
}
/** 頂欄「匯出」選單（v2「下載」；testid download-menu、各項目的名稱不變）。手機先展開 topbar-more。回傳展開後的 details。 */
export async function openDownloads(page: Page) {
  await openTopbarMore(page);
  return openDetails(page.getByTestId('download-menu'));
}
export async function closeDownloads(page: Page) {
  await closeDetails(page.getByTestId('download-menu'));
  await closeTopbarMore(page);
}
/** 頂欄「儲存」選單（workspace-storage；V3-3 分三段：本機保存／備份檔／危險區）。手機先展開 topbar-more。回傳展開後的 details。 */
export async function openStorage(page: Page) {
  await openTopbarMore(page);
  return openDetails(page.getByTestId('workspace-storage'));
}
export async function closeStorage(page: Page) {
  await closeDetails(page.getByTestId('workspace-storage'));
  await closeTopbarMore(page);
}
/** 頂欄「指標定義」（icon 按鈕，aria-label＝labels.buttons.basis）：手機先展開 topbar-more；點開口徑說明對話框，回傳頂欄按鈕（Esc 關閉後焦點應回到它）。 */
export async function openBasis(page: Page) {
  await openTopbarMore(page);
  const button = page.locator('header.topbar').getByRole('button', { name: labels.buttons.basis, exact: true });
  await button.click();
  await expect(page.getByRole('dialog', { name: labels.basis.title })).toBeVisible();
  return button;
}
/** 頂欄 AI 狀態（ai-availability 裡的文字按鈕）：手機先展開 topbar-more；說明 popover 沒開就點開，回傳 ai-availability 區塊。 */
export async function openAiStatus(page: Page) {
  await openTopbarMore(page);
  const status = page.getByTestId('ai-availability');
  const button = status.getByRole('button').first();
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await expect(status.locator('#ai-availability-detail')).toBeVisible();
  return status;
}
/** V3-3：v2 頂欄的「清空」搬進儲存選單的「危險區」。開好選單後回傳該按鈕（可直接交給 clickReplacing）。 */
export async function clearButton(page: Page) {
  const storage = await openStorage(page);
  return storage.getByRole('button', { name: labels.buttons.clear, exact: true });
}
/** 開儲存選單 → 點危險區的「清空」；取代確認對話框交給呼叫端處理（回傳該 dialog locator；沒有未保存內容時不會出現）。 */
export async function clearWorkspace(page: Page) {
  await (await clearButton(page)).click();
  return page.getByRole('dialog', { name: labels.ui.replacementDialog.heading });
}

// ── V3-3 期間列（D-V3-10＝A：快捷單擊就套用；只有在自訂期間裡改日期才要按「套用」） ──
export type PresetId = keyof typeof labels.periods.presets;
export const periodSummary = (page: Page) => page.getByTestId('period-summary');
/** 期間摘要「看得到」的文字：去掉 sr-only 的範圍說明（通路、比較方式、資料到只在 title 與 sr-only）。 */
export const periodSummaryVisibleText = (page: Page) => periodSummary(page).evaluate(element => [...element.childNodes].filter(node => !(node instanceof Element && node.classList.contains('sr-only'))).map(node => node.textContent ?? '').join(''));
/** 手機：期間列收成 period-toggle，點開才有底部面板（#period-bar-panel）。桌機不動。 */
export async function openPeriodSheet(page: Page) {
  if (!isMobile(page)) return;
  const toggle = page.getByTestId('period-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
/** 手機底部面板的「完成」；桌機不動。 */
export async function closePeriodSheet(page: Page) {
  if (!isMobile(page)) return;
  const toggle = page.getByTestId('period-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'true') await page.locator('#period-bar-panel').getByRole('button', { name: labels.shell.periodBarV3.sheetClose, exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}
/** 期間快捷按鈕（period-presets 群組內，依名稱；includeHidden：手機面板收起時仍可讀 aria-pressed）。手機上要先 openPeriodSheet 才點得到。 */
export const presetButton = (page: Page, id: PresetId) => page.getByTestId('period-presets').getByRole('button', { name: labels.periods.presets[id], exact: true, includeHidden: true });
/**
 * 點快捷（單擊即套用）：手機先開期間面板（選了之後面板自動關閉）。點之前不是 aria-pressed 時，等期間摘要換成新的文字；
 * 最後等快捷 aria-pressed="true"、期間列不再 aria-busy。回傳新的期間摘要 textContent（含 sr-only 的範圍說明）。
 */
export async function choosePreset(page: Page, id: PresetId) {
  await openPeriodSheet(page);
  const button = presetButton(page, id);
  const before = (await periodSummary(page).textContent()) ?? '';
  const wasPressed = await button.getAttribute('aria-pressed') === 'true';
  await button.click();
  if (isMobile(page)) await expect(page.getByTestId('period-toggle')).toHaveAttribute('aria-expanded', 'false');
  if (!wasPressed) await expect(periodSummary(page)).not.toHaveText(before);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('period-bar')).not.toHaveAttribute('aria-busy', 'true');
  return (await periodSummary(page).textContent()) ?? '';
}
export type CustomPeriod = { previousStart: string; previousEnd: string; currentStart: string; currentEnd: string; mode?: 'same_days' | 'calendar_months' };
/** 開自訂期間（桌機：period-custom → popover；手機：period-toggle 底部面板，面板內直接是自訂期間表單）。回傳 period-custom-panel。 */
export async function openCustomPeriod(page: Page) {
  if (isMobile(page)) await openPeriodSheet(page);
  else {
    const trigger = page.getByTestId('period-custom');
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  }
  const panel = page.getByTestId('period-custom-panel');
  await expect(panel).toBeVisible();
  return panel;
}
/**
 * 自訂期間：開面板 →（選比較方式 mode）→ 填四個日期欄（id 不變：previous-start／previous-end／current-start／current-end）→ 按「套用」。
 * 等 popover／底部面板關閉、期間列不再 aria-busy。
 */
export async function applyCustomPeriod(page: Page, period: CustomPeriod) {
  const panel = await openCustomPeriod(page);
  if (period.mode) await panel.getByLabel(labels.ui.dashboard.filter.comparisonMode, { exact: true }).selectOption(period.mode);
  await page.locator('#previous-start').fill(period.previousStart);
  await page.locator('#previous-end').fill(period.previousEnd);
  await page.locator('#current-start').fill(period.currentStart);
  await page.locator('#current-end').fill(period.currentEnd);
  await panel.getByRole('button', { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByTestId(isMobile(page) ? 'period-toggle' : 'period-custom')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('period-bar')).not.toHaveAttribute('aria-busy', 'true');
}
/**
 * 期間摘要的可見文字（labels.shell.periodBarV3.summary／summaryUnequal＋formatPeriodL1，不附天數），例如「本期 8/17–8/23 對比 上期 8/10–8/16（各 7 天）」。
 * anchor（資料到）預設用本期迄日，只影響跨年時是否寫年份。period-summary 的 textContent 另含 sr-only 的範圍說明，請用 toContainText 比對。
 */
export function periodSummaryText(start: string, end: string, prevStart: string, prevEnd: string, options: { anchor?: string } = {}) {
  const anchor = options.anchor ?? end;
  const current = formatPeriodL1(start, end, { anchor, days: false }), previous = formatPeriodL1(prevStart, prevEnd, { anchor, days: false });
  const currentDays = periodDays(start, end)!, previousDays = periodDays(prevStart, prevEnd)!;
  return currentDays === previousDays
    ? fill(labels.shell.periodBarV3.summary, { current, previous, days: currentDays })
    : fill(labels.shell.periodBarV3.summaryUnequal, { current, previous, currentDays, previousDays });
}
/** 手機期間按鈕（period-toggle）的可見文字：「近 4 週 · 7/27–8/23」；沒有對到快捷時 preset 傳 null →「自訂期間 · …」。 */
export function periodToggleText(preset: PresetId | null, start: string, end: string, options: { anchor?: string } = {}) {
  return fill(labels.shell.periodBarV3.toggle, { preset: preset ? labels.periods.presets[preset] : labels.shell.periodBarV3.custom, range: formatPeriodL1(start, end, { anchor: options.anchor ?? end, days: false }) });
}

/** R2 rule-card headlines are glossary templates with numbers filled in; match them by template shape. */
export function ruleHeadline(code: keyof typeof labels.rules): RegExp {
  const template = labels.rules[code].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?');
  return new RegExp(`^${template}$`);
}
