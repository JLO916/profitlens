import { createHash } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { fill, labels } from '../../src/i18n';
import { AD_DECISIONS, type AdDecision } from '../../src/application/action-workspace';
import { decisionSignature } from '../../src/application/decision';

// ── V3-9a（PRD §10.1 F13、§7.5 第 7 點）廣告決策標籤與備份 v5 的 E2E 輔助；共用的 replacement-helpers.ts／import-wizard-helpers.ts 不動。 ──

export const adCopy = labels.actions.adDecisionV3;
/** 待辦編輯器「內容」段的「廣告決策」select（清單檢視每個 action-{n} 裡一份、看板的待辦抽屜裡一份；看板本身沒有）。 */
export const adDecisionSelect = (scope: Locator) => scope.getByTestId('action-ad-decision');
/** C8 徽章文字：「廣告加碼」＝fill(badge, { decision: options[value] })。 */
export const adDecisionBadge = (value: AdDecision) => fill(adCopy.badge, { decision: adCopy.options[value] });
/** 看板卡（p.board-card-tags 裡，狀態標籤之後）與清單項（.section-heading 裡，引用標籤之後）的徽章；只在有標時渲染。 */
export const boardBadge = (page: Page, n: number) => page.getByTestId(`board-card-${n}-ad-decision`);
export const listBadge = (page: Page, n: number) => page.getByTestId(`action-${n}-ad-decision`);
/** 決策 Markdown 有標的待辦多一行「- 廣告決策：加碼」（fieldLine 模板；沒標不印）。 */
export const adDecisionMarkdownLine = (value: AdDecision) => fill(labels.exports.decision.fieldLine, { label: adCopy.field, value: adCopy.options[value] });
/** 決策 CSV 最後一欄的欄名（「中文 (english_key)」）。 */
export const adDecisionCsvHeader = `${adCopy.csvColumn} (ad_decision)`;

/** select 的四個選項：'' 不標、再依 AD_DECISIONS 順序（暫停／調整／加碼）；值與文字都對。 */
export async function expectAdDecisionOptions(select: Locator) {
  await expect(select.locator('option')).toHaveText([adCopy.none, ...AD_DECISIONS.map(value => adCopy.options[value])]);
  expect(await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', ...AD_DECISIONS]);
}

/** 「這版改了什麼」提示（data-testid=whats-new）：還原 v5 備份不出現；還原 v1–v4 會出現（未讀時）。 */
export const whatsNew = (page: Page) => page.getByTestId('whats-new');

/**
 * 決策 CSV 的獨立讀取器（不 import 產品的 parser）：去 BOM、處理引號與引號內的逗號／換行；回傳 { headers（原始欄名）, records（以英文 key 為鍵） }。
 * 示範資料的決策 CSV 很大（每個 fact 列都帶完整來源），所以逐欄切片而不是逐字累加，欄數檢查也只做一次 expect。
 */
export function decisionCsv(input: string): { headers: string[]; records: Record<string, string>[] } {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], index = 0;
  while (index < text.length) {
    let value: string;
    if (text[index] === '"') {
      const parts: string[] = [];
      let from = index + 1;
      for (;;) {
        const quote = text.indexOf('"', from);
        if (quote < 0) throw new Error('CSV 引號沒有成對');
        parts.push(text.slice(from, quote));
        if (text[quote + 1] === '"') { parts.push('"'); from = quote + 2; continue; }
        index = quote + 1; break;
      }
      value = parts.join('');
    } else {
      let end = index;
      while (end < text.length && text[end] !== ',' && text[end] !== '\n' && text[end] !== '\r') end += 1;
      value = text.slice(index, end); index = end;
    }
    row.push(value);
    if (text[index] === ',') { index += 1; if (index === text.length) row.push(''); continue; }
    if (text[index] === '\r' && text[index + 1] === '\n') index += 2; else if (index < text.length) index += 1;
    rows.push(row); row = [];
  }
  if (row.length) rows.push(row);
  const headers = rows.shift() ?? [];
  expect(headers.length).toBeGreaterThan(0);
  expect(rows.map((values, line) => ({ line: line + 2, columns: values.length })).filter(entry => entry.columns !== headers.length), '每一列的欄數都等於表頭').toEqual([]);
  const keys = headers.map(header => /\(([^()]+)\)\s*$/.exec(header)?.[1] ?? header);
  return { headers, records: rows.map(values => Object.fromEntries(keys.map((key, column) => [key, values[column]]))) };
}

/** 測試會讀寫的備份信封欄位（其餘欄位原樣保留）。 */
export type BackupWire = { schema_version: string; checksum?: string; payload: { action_workspace: { items: Record<string, unknown>[] } } & Record<string, unknown> } & Record<string, unknown>;
/**
 * 把 App 下載的備份（目前寫 v5）改寫成另一個 schema_version 的信封，重算 SHA-256 checksum（同 App：decisionSignature 正規化後雜湊）。
 * mutate 可在重算前改 payload（例如拿掉或塞入 items[].ad_decision）。
 */
export function reenvelope(text: string, schemaVersion: string, mutate: (wire: BackupWire) => void = () => {}): Buffer {
  const wire = JSON.parse(text) as BackupWire;
  delete wire.checksum;
  wire.schema_version = schemaVersion;
  mutate(wire);
  return Buffer.from(JSON.stringify({ ...wire, checksum: createHash('sha256').update(decisionSignature(wire), 'utf8').digest('hex') }), 'utf8');
}

/**
 * 在待辦抽屜（或任何 focus trap 容器）裡從目前焦點一路 Tab，記錄每一步焦點所在控制的 testid／aria-label，直到 testid＝lastTestId。
 * 每一步都斷言焦點仍在 root（dialog）之內；回傳走過的序列（不含起點）。
 */
export async function tabUntil(page: Page, rootSelector: string, lastTestId: string, maxSteps = 300) {
  const trail: { testid: string | null; label: string | null; tag: string | null }[] = [];
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(selector => { const active = document.activeElement; return { inside: !!active?.closest(selector), testid: active?.getAttribute('data-testid') ?? null, label: active?.getAttribute('aria-label') ?? null, tag: active?.tagName ?? null }; }, rootSelector);
    expect(state.inside, `第 ${step + 1} 次 Tab 後焦點仍在 ${rootSelector} 內（目前 ${state.tag}）`).toBe(true);
    trail.push({ testid: state.testid, label: state.label, tag: state.tag });
    if (state.testid === lastTestId) return trail;
  }
  throw new Error(`${maxSteps} 次 Tab 內沒有走到 ${lastTestId}`);
}
