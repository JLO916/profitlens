import { readFile } from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';

// ── V3-7 會議紀錄頁（PRD §7.6 文件式版面）的共用定位：頁首「匯出會議」下拉、議程 ② 的「調整門檻」、議程 ① – ③ ──

/** 「匯出會議」下拉的五項（data-testid meeting-export-{kind}；可及名稱沿用 v2 輸出列的按鈕名，見 meeting-page.tsx exportMenu）。 */
export type MeetingExportKind = 'pdf' | 'markdown' | 'csv' | 'excel' | 'pptx';

/**
 * V3-7：v2 會議頁的「輸出」列（meeting-outputs 內五顆按鈕）改成頁首的頁內下拉——details[data-testid=meeting-outputs]、summary export-page-meeting。
 * 沒展開就點 summary 展開；回傳展開後的 details。點完任一項選單會關閉並回焦到 summary，所以每次匯出前都要重新呼叫。
 */
export async function openMeetingExport(page: Page) {
  const menu = page.getByTestId('meeting-outputs');
  if (await menu.getAttribute('open') === null) await page.getByTestId('export-page-meeting').click();
  await expect(menu).toHaveAttribute('open', '');
  return menu;
}
/** 展開「匯出會議」後依 testid 取該項（meeting-export-{kind}）。 */
export async function meetingExportItem(page: Page, kind: MeetingExportKind) {
  return (await openMeetingExport(page)).getByTestId(`meeting-export-${kind}`);
}
/** 展開「匯出會議」後依 v2 的按鈕名稱（exact）取該項；可及名稱只有名稱（aria-label），不含下方 small 說明。 */
export async function meetingExportButton(page: Page, name: string) {
  return (await openMeetingExport(page)).getByRole('button', { name, exact: true });
}
/** 點「匯出會議」裡的一項並等下載，回傳下載檔的文字內容（UTF-8）。 */
export async function downloadMeetingExport(page: Page, name: string) {
  const button = await meetingExportButton(page, name);
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return readFile((await file.path())!, 'utf8');
}

/**
 * V3-7：會議門檻表單（threshold-form-meeting）收在議程 ② 的 details.meeting-threshold（summary＝labels.sections.adjustThreshold，預設收合、內容保持掛載）。
 * 沒展開就展開；回傳 details。收合時 toHaveValue 仍可讀，但 fill 與「套用」要先展開。
 */
export async function openThreshold(page: Page) {
  const details = page.getByTestId('meeting-agenda-2').locator('details.meeting-threshold');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  await expect(details).toHaveAttribute('open', '');
  return details;
}

/**
 * V3-7：manager-summary 現在是議程 <ol>（含 ① – ⑥）；v2「主管摘要」本體對應議程 ① – ③（關鍵數字、本期重點、各通路表現）。
 * 要斷言「主管摘要裡沒有某內容」時用這個範圍，不把議程 ④ – ⑥（上次決議、選入方案、置頂待辦）算進去。
 */
export const summaryAgenda = (root: Locator) => root.getByTestId(/^meeting-agenda-[1-3]$/);
