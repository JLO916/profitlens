// 讓純 Node 腳本讀到 labels：用既有 devDependency「typescript」把 labels.zh-TW.ts 轉成 JS 後以 data: URL 載入。
// labels 檔只有型別匯入（轉譯後會移除），沒有執行期相依；若日後加入執行期 import，這裡會直接報錯，不會靜默算錯。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export const LABELS_SOURCE = "src/i18n/labels.zh-TW.ts";

/**
 * 載入整個 labels 模組（labels、LABEL_GROUPS…）。
 * 掃描器用 LABEL_GROUPS 確認 labels 頂層沒有多出別的區段（V3-10 已移除 v2 舊鍵 alias），見 scripts/lib/copy-scan.mjs labelScope。
 * @param {{ root?: string }} [options]
 */
export async function loadLabelsModule({ root = process.cwd() } = {}) {
  const source = readFileSync(resolve(root, LABELS_SOURCE), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: LABELS_SOURCE });
  return import(`data:text/javascript;base64,${Buffer.from(outputText, "utf8").toString("base64")}`);
}

/** @param {{ root?: string }} [options] */
export async function loadLabels(options) {
  return (await loadLabelsModule(options)).labels;
}
