// 讓純 Node 腳本讀到 labels：用既有 devDependency「typescript」把 labels.zh-TW.ts 轉成 JS 後以 data: URL 載入。
// labels 檔只有型別匯入（轉譯後會移除），沒有執行期相依；若日後加入執行期 import，這裡會直接報錯，不會靜默算錯。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export const LABELS_SOURCE = "src/i18n/labels.zh-TW.ts";

/** @param {{ root?: string }} [options] */
export async function loadLabels({ root = process.cwd() } = {}) {
  const source = readFileSync(resolve(root, LABELS_SOURCE), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: LABELS_SOURCE });
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(outputText, "utf8").toString("base64")}`);
  return loaded.labels;
}
