// 讓純 Node 腳本讀到 labels：用既有 devDependency「typescript」把 labels.zh-TW.ts 轉成 JS 後以 data: URL 載入。
// labels 檔只有型別匯入（轉譯後會移除），沒有執行期相依；若日後加入執行期 import，這裡會直接報錯，不會靜默算錯。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export const LABELS_SOURCE = "src/i18n/labels.zh-TW.ts";
/** V41-0（D-V41-12＝A'）：說明頁的全部中文在這個檔的 guideLabels（V41-1 起才有；不存在時掃描器只掃 labels）。 */
export const GUIDE_LABELS_SOURCE = "src/i18n/guide.zh-TW.ts";

const toDataUrl = text => `data:text/javascript;base64,${Buffer.from(text, "utf8").toString("base64")}`;
const transpile = (source, fileName) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName }).outputText;

/**
 * 載入整個 labels 模組（labels、LABEL_GROUPS…）。
 * 掃描器用 LABEL_GROUPS 確認 labels 頂層沒有多出別的區段（V3-10 已移除 v2 舊鍵 alias），見 scripts/lib/copy-scan.mjs labelScope。
 * @param {{ root?: string }} [options]
 */
export async function loadLabelsModule({ root = process.cwd() } = {}) {
  return import(toDataUrl(transpile(readFileSync(resolve(root, LABELS_SOURCE), "utf8"), LABELS_SOURCE)));
}

/** @param {{ root?: string }} [options] */
export async function loadLabels(options) {
  return (await loadLabelsModule(options)).labels;
}

/**
 * V41-0：載入說明頁的 guideLabels；檔案不存在（V41-0）時回傳 null。
 * guide 檔可以 import labels 解析 {ui:路徑}（D-V41-12）：`./labels.zh-TW` 與 `@/i18n/labels.zh-TW` 換成同一份轉譯後的 labels；其他執行期 import 會直接報錯，不會靜默算錯。
 * @param {{ root?: string }} [options]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadGuideLabels({ root = process.cwd() } = {}) {
  const file = resolve(root, GUIDE_LABELS_SOURCE);
  if (!existsSync(file)) return null;
  const labelsUrl = toDataUrl(transpile(readFileSync(resolve(root, LABELS_SOURCE), "utf8"), LABELS_SOURCE));
  const output = transpile(readFileSync(file, "utf8"), GUIDE_LABELS_SOURCE).replace(/(from\s*)(["'])(?:\.\/labels\.zh-TW|@\/i18n\/labels\.zh-TW)\2/g, (_, from, quote) => `${from}${quote}${labelsUrl}${quote}`);
  return (await import(toDataUrl(output))).guideLabels;
}
