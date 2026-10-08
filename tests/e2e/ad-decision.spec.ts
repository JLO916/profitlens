import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fill, labels } from '../../src/i18n';
import { formatAmountL1 } from '../../src/application/presentation';
import { AD_DECISIONS } from '../../src/application/action-workspace';
import { WORKSPACE_V4, WORKSPACE_VERSION } from '../../src/application/workspace-backup';
import { clearButton, clickReplacing, closeStorage, dismissSavePrompt, navigateTo, openStorage, openValidation, sidebarNav, switchActionsView } from './replacement-helpers';
import { actionDrawer, closeActionDrawer, decisionExportButton, openActionDrawer, type DecisionFormat } from './actions-helpers-v3';
import { adCopy, adDecisionBadge, adDecisionCsvHeader, adDecisionMarkdownLine, adDecisionSelect, boardBadge, decisionCsv, expectAdDecisionOptions, listBadge, tabUntil, whatsNew } from './ad-decision-helpers-v39';

// V3-9a（PRD §10.1 F13、§7.5 第 7 點、§11.8）：待辦的廣告決策標籤（使用者自選 暫停／調整／加碼）＋備份 v5。
// 示範資料（fixtures/demo）：載入後總覽 KPI 本期扣廣告後貢獻 1,269,792.73（L1 顯示）；健檢第一列「加入待辦」帶入它的引用數字。
// 長流程（載入 → 健檢 → 待辦 → 三種決策匯出 → 備份 → 清空 → 還原 → 再匯出）；比照 action-workspace.spec 放寬單一案例的時間上限，斷言不變。
test.describe.configure({ timeout: 90_000 });
const ws = labels.storage.workspace;
const asOf = (id: 'demo' | 'golden') => (JSON.parse(readFileSync(resolve('fixtures', id, 'manifest.json'), 'utf8')) as { data_as_of: string }).data_as_of;
const demoReady = fill(labels.shell.status.ready, { date: asOf('demo') });
const goldenReady = fill(labels.shell.status.ready, { date: asOf('golden') });
const status = (page: Page) => page.getByTestId('workspace-status');
const savePrompt = (page: Page) => page.getByTestId('local-save-prompt');

/** 頁首「載入示範資料」→ KPI 帶出現示範資料的扣廣告後貢獻 → 首次保存提示按「先不要」（本檔不測保存）。 */
async function loadDemo(page: Page) {
  await page.goto('/');
  await clickReplacing(page, page.getByRole('button', { name: labels.shell.buttons.loadDemo, exact: true }));
  await expect(status(page)).toContainText(demoReady);
  await expect(page.getByTestId('kpi-contribution_after_marketing')).toContainText(formatAmountL1('1269792.73'));
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);
}
/** 開發者驗證頁載入 golden（fixtures/golden）→ 首次保存提示按「先不要」。鍵盤案例用它：示範資料的引用清單有數百個勾選框，Tab 一圈要走五百多步。 */
async function loadGolden(page: Page) {
  await page.goto('/');
  await openValidation(page);
  await page.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption('golden');
  await clickReplacing(page, page.getByRole('button', { name: labels.shell.devValidation.validation.loadButton, exact: true }));
  await expect(status(page)).toContainText(goldenReady);
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);
}
/** 健檢清單第一列（預設展開）按「加入待辦」→ 自動切到待辦頁（預設看板），新卡在「未開始」欄。 */
async function addFromDiagnosis(page: Page) {
  await navigateTo(page, 'diagnosis');
  const row = page.getByTestId('diagnosis-list').locator(':scope > li > details.diagnosis-row').first();
  await expect(row).toHaveAttribute('open', '');
  await row.getByRole('button', { name: labels.actions.buttons.addToActions, exact: true }).click();
  await expect(sidebarNav(page, 'actions')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('actions-view-board')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toBeVisible();
}
/** 待辦頁頁首「匯出本頁」的決策 Markdown／CSV／JSON（按鈕名稱仍是 labels.exports.downloads.decision*）。 */
async function downloadDecision(page: Page, format: DecisionFormat) {
  const button = await decisionExportButton(page, format);
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return readFile((await file.path())!, 'utf8');
}
/** 頂欄儲存選單「下載備份檔」（手機先展開頂欄「更多」）；下載完收起選單。 */
async function downloadBackup(page: Page) {
  const storage = await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent('download'), storage.getByRole('button', { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
  expect(file.suggestedFilename()).toBe('profitlens-workspace.json');
  const text = await readFile((await file.path())!, 'utf8');
  await closeStorage(page);
  return text;
}
/** 儲存選單選備份檔 → 預覽 → 讀入（有未保存修改時明確捨棄）→ 狀態回到示範資料 → 首次保存提示按「先不要」。 */
async function restoreBackup(page: Page, buffer: Buffer) {
  const storage = await openStorage(page);
  await storage.getByLabel(ws.selectBackupFile, { exact: true }).setInputFiles({ name: 'ad-decision.json', mimeType: 'application/json', buffer });
  await expect(page.getByRole('region', { name: ws.restorePreviewAria })).toBeVisible();
  await clickReplacing(page, storage.getByRole('button', { name: ws.applyRestore, exact: true }));
  await expect(status(page)).toContainText(demoReady);
  await expect(storage.getByTestId('storage-notice')).toHaveText(ws.restoredNotice);
  await closeStorage(page);
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('V3-9a F13 廣告決策：抽屜選「加碼」→ 看板與清單徽章、決策 JSON／CSV／Markdown、備份 v5；清空後還原仍在且沒有「這版改了什麼」，改回不標後徽章與欄位都消失', async ({ page }) => {
  // 示範資料的決策匯出很大（一個待辦時 CSV 約 84 MB、JSON 約 33 MB：每個 fact 列都帶完整來源），CSV 用 decisionCsv 逐欄切片解析、欄數只檢查一次。
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await loadDemo(page);
  await addFromDiagnosis(page);
  // 看板卡本身沒有 select、沒標時沒有徽章。
  await expect(page.getByTestId('action-board').getByTestId('action-ad-decision')).toHaveCount(0);
  await expect(boardBadge(page, 1)).toHaveCount(0);

  // 抽屜「內容」段的「廣告決策」select：label 對到它、預設「不標」、四個選項；選「加碼」即時生效（不用按儲存）。
  let drawer = await openActionDrawer(page, 1);
  const select = adDecisionSelect(drawer);
  await expect(select).toHaveCount(1);
  await expect(drawer.getByLabel(adCopy.field, { exact: true })).toHaveAttribute('data-testid', 'action-ad-decision');
  await expect(select).toHaveValue('');
  await expectAdDecisionOptions(select);
  await select.selectOption('increase');
  await expect(select).toHaveValue('increase');
  await expect(boardBadge(page, 1)).toHaveText(adDecisionBadge('increase'));
  await closeActionDrawer(page);
  await expect(page.getByTestId('board-card-1-edit')).toBeFocused();
  // C8 徽章在 p.board-card-tags 裡、緊接在狀態標籤之後。
  const card = page.getByTestId('board-card-1');
  await expect(boardBadge(page, 1)).toHaveText(adDecisionBadge('increase'));
  await expect(card.locator('p.board-card-tags > span.ui-lozenge:first-child + [data-testid="board-card-1-ad-decision"]')).toHaveCount(1);
  await expect(boardBadge(page, 1)).toHaveClass(/\baction-ad-decision-badge\b/);

  // 清單檢視：同一項的徽章在標題列（引用標籤之後），select 值是 increase；全頁只有這一份 select。
  await switchActionsView(page, 'list');
  const item = page.getByTestId('action-1');
  await expect(listBadge(page, 1)).toHaveText(adDecisionBadge('increase'));
  await expect(item.locator('.section-heading').getByTestId('action-1-ad-decision')).toHaveCount(1);
  await expect(adDecisionSelect(item)).toHaveValue('increase');
  await expect(page.getByTestId('action-ad-decision')).toHaveCount(1);
  await expect(actionDrawer(page)).toHaveCount(0);

  // 決策 JSON：actions[0].ad_decision＝increase，是最後一個欄位。
  const doc = JSON.parse(await downloadDecision(page, 'json'));
  expect(doc.actions).toHaveLength(1);
  expect(doc.actions[0].ad_decision).toBe('increase');
  expect(Object.keys(doc.actions[0]).at(-1)).toBe('ad_decision');
  const actionId: string = doc.actions[0].id;
  expect(doc.actions[0].evidence.length).toBeGreaterThan(0);
  // 決策 CSV：最後一欄「廣告決策 (ad_decision)」；這個待辦的 manual_action／action_fact 每一列都是 increase，其他列空白；不另成一列 field。
  const csv = decisionCsv(await downloadDecision(page, 'csv'));
  expect(csv.headers.at(-1)).toBe(adDecisionCsvHeader);
  const own = csv.records.filter(record => ['manual_action', 'action_fact'].includes(record.row_type) && record.item_id === actionId);
  expect(own.filter(record => record.row_type === 'manual_action').length).toBeGreaterThan(0);
  expect(own.filter(record => record.row_type === 'action_fact')).toHaveLength(doc.actions[0].evidence.length);
  expect(own.map(record => record.ad_decision)).toEqual(own.map(() => 'increase'));
  const others = csv.records.filter(record => !own.includes(record));
  expect(others.length).toBeGreaterThan(0);
  // 失敗時只印列型別與欄位（fact 列的 source_refs 很長）。
  const brief = (record: Record<string, string>) => ({ row_type: record.row_type, item_id: record.item_id, field: record.field, ad_decision: record.ad_decision });
  expect(others.filter(record => record.ad_decision !== '').map(brief)).toEqual([]);
  expect(csv.records.filter(record => record.field === 'ad_decision').map(brief)).toEqual([]);
  // 決策 Markdown：待辦段多一行「- 廣告決策：加碼」。
  expect(await downloadDecision(page, 'md')).toContain(adDecisionMarkdownLine('increase'));

  // 備份 v5：schema_version＝WORKSPACE_VERSION（不再是 v4），items[0].ad_decision＝increase。
  const backupText = await downloadBackup(page);
  const wire = JSON.parse(backupText);
  expect(WORKSPACE_VERSION).not.toBe(WORKSPACE_V4);
  expect(wire.schema_version).toBe(WORKSPACE_VERSION);
  expect(wire.payload.action_workspace.items).toHaveLength(1);
  expect(wire.payload.action_workspace.items[0].ad_decision).toBe('increase');

  // 清空 → 讀回剛下載的 v5 備份：標籤還在，而且不出現「這版改了什麼」（v5 是 v3 自己寫的備份）。
  await clickReplacing(page, await clearButton(page));
  await expect(status(page)).toContainText(labels.shell.status.empty);
  await expect(page.getByTestId('action-1')).toHaveCount(0);
  await restoreBackup(page, Buffer.from(backupText, 'utf8'));
  await expect(whatsNew(page)).toHaveCount(0);
  await navigateTo(page, 'actions');
  // 備份 ui_prefs.view 記住了清單檢視，還原後直接是清單。
  await expect(page.getByTestId('actions-view-list')).toHaveAttribute('aria-pressed', 'true');
  await expect(adDecisionSelect(page.getByTestId('action-1'))).toHaveValue('increase');
  await expect(listBadge(page, 1)).toHaveText(adDecisionBadge('increase'));
  await switchActionsView(page, 'board');
  await expect(boardBadge(page, 1)).toHaveText(adDecisionBadge('increase'));
  await expect(whatsNew(page)).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);

  // 改回「不標」：徽章立刻消失；JSON 沒有 ad_decision 欄位、CSV 該欄全空、Markdown 沒有那一行、備份 items[0] 也沒有。
  drawer = await openActionDrawer(page, 1);
  await expect(adDecisionSelect(drawer)).toHaveValue('increase');
  await adDecisionSelect(drawer).selectOption('');
  await expect(adDecisionSelect(drawer)).toHaveValue('');
  await expect(boardBadge(page, 1)).toHaveCount(0);
  await closeActionDrawer(page);
  await expect(boardBadge(page, 1)).toHaveCount(0);
  await switchActionsView(page, 'list');
  await expect(listBadge(page, 1)).toHaveCount(0);
  await expect(adDecisionSelect(page.getByTestId('action-1'))).toHaveValue('');
  const cleared = JSON.parse(await downloadDecision(page, 'json'));
  expect(cleared.actions[0]).not.toHaveProperty('ad_decision');
  const clearedCsv = decisionCsv(await downloadDecision(page, 'csv'));
  expect(clearedCsv.headers.at(-1)).toBe(adDecisionCsvHeader);
  expect(clearedCsv.records.filter(record => record.ad_decision !== '').map(brief)).toEqual([]);
  const clearedMarkdown = await downloadDecision(page, 'md');
  for (const value of AD_DECISIONS) expect(clearedMarkdown).not.toContain(adDecisionMarkdownLine(value));
  const clearedWire = JSON.parse(await downloadBackup(page));
  expect(clearedWire.schema_version).toBe(WORKSPACE_VERSION);
  expect(clearedWire.payload.action_workspace.items[0]).not.toHaveProperty('ad_decision');
  expect(await noHorizontalOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

/** PRD §7.5、§9.4 C6：新 select 在 Tab 順序裡（狀態 → 廣告決策 → 進度紀錄），用鍵盤到達後改值焦點不跑掉；待辦抽屜的 focus trap 仍成立。 */
test('V3-9a F13 廣告決策 select 的鍵盤：Tab 依序到達、改值後焦點留在 select，抽屜 focus trap 仍成立', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await loadGolden(page);
  await addFromDiagnosis(page);
  const drawer = await openActionDrawer(page, 1);
  const first = drawer.getByTestId('action-drawer-close'), last = drawer.getByTestId('action-drawer-remove');
  // 從關閉鈕一路 Tab 到最後一個控制（移除）：每一步都在抽屜裡；新 select 只出現一次，緊接在「狀態」之後、「進度紀錄」之前。
  const trail = await tabUntil(page, 'dialog[data-testid=action-drawer]', 'action-drawer-remove');
  const at = trail.findIndex(step => step.testid === 'action-ad-decision');
  expect(at, 'Tab 走得到廣告決策 select').toBeGreaterThan(0);
  expect(trail.filter(step => step.testid === 'action-ad-decision')).toHaveLength(1);
  expect(trail[at]).toMatchObject({ tag: 'SELECT', label: adCopy.field });
  expect(trail[at - 1]).toMatchObject({ tag: 'SELECT', label: labels.actions.form.status });
  expect(trail[at + 1]).toMatchObject({ tag: 'TEXTAREA', label: labels.actions.form.progress });
  // focus trap：最後一個控制按 Tab 回到第一個；第一個按 Shift+Tab 回到最後一個。
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
  // 從關閉鈕再 Tab at+1 次回到 select：改成「調整」後焦點仍在 select，徽章即時出現；再 Tab 到進度紀錄。
  await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  for (let step = 0; step <= at; step++) await page.keyboard.press('Tab');
  const select = adDecisionSelect(drawer);
  await expect(select).toBeFocused();
  await select.selectOption('adjust');
  await expect(select).toHaveValue('adjust');
  await expect(select).toBeFocused();
  await expect(boardBadge(page, 1)).toHaveText(adDecisionBadge('adjust'));
  await page.keyboard.press('Tab');
  await expect(drawer.getByLabel(labels.actions.form.progress, { exact: true })).toBeFocused();
  // Esc 關閉抽屜，焦點回到開啟它的「編輯」；徽章留在卡片上。
  await page.keyboard.press('Escape');
  await expect(actionDrawer(page)).toHaveCount(0);
  await expect(page.getByTestId('board-card-1-edit')).toBeFocused();
  await expect(boardBadge(page, 1)).toHaveText(adDecisionBadge('adjust'));
  expect(await noHorizontalOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});
