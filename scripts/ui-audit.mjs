#!/usr/bin/env node
// V3-0 UI 靜態基準（PRD §2.3 B、§5.4、§11.7）。用法：node scripts/ui-audit.mjs [--json out.json]
// 掃描範圍與 tests/design-lint.test.ts 相同（共用 scripts/lib/ui-scan.mjs）；labels 指標與 tests/copy-style.test.ts 相同（共用 scripts/lib/copy-scan.mjs）。
// 本腳本只輸出數字、不判定通過與否（上限由兩支測試的棘輪檔負責），所以永遠以 exit 0 結束，除非讀檔失敗。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { scanLabels } from "./lib/copy-scan.mjs";
import { loadLabelsModule } from "./lib/load-labels.mjs";
import { scanUi } from "./lib/ui-scan.mjs";

const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
if (jsonIndex >= 0 && !jsonPath) { console.error("用法：node scripts/ui-audit.mjs [--json out.json]"); process.exit(2); }

const ui = scanUi();
const labelModule = await loadLabelsModule();
// V3-2c：只掃新分組，略過 v2 舊鍵 alias（同一個字串不算兩次）；口徑與 tests/copy-style.test.ts 相同。
const copy = scanLabels(labelModule.labels, labelModule);

const report = {
  generatedAt: new Date().toISOString(),
  scope: { css: ["src/app/globals.css（:root token 定義區另計）", "src/components/**/*.css"], tsx: ["src/components/**/*.tsx"], labels: "src/i18n/labels.zh-TW.ts 新分組（LABEL_GROUPS；v2 舊鍵 alias、technical 子樹與 glossary.aliases／basis.aliases 除外）" },
  design: ui.metrics,
  copy: copy.metrics,
  info: ui.info,
  details: { design: ui.details, copy: copy.details },
};

const rows = [
  ["寫死色碼（:root 以外相異 hex）", ui.metrics.hexOutsideRoot, `globals.css ${ui.info.hexGlobalsCss}／元件 CSS ${ui.info.hexComponentCss}／TSX ${ui.info.hexTsx}；token 定義區 ${ui.info.tokenHexDistinct}`],
  ["相異圓角值", ui.metrics.borderRadiusValues, `不含 @media print：${ui.info.borderRadiusValuesExcludingPrint}`],
  ["相異字級值", ui.metrics.fontSizeValues, `不含 @media print：${ui.info.fontSizeValuesExcludingPrint}`],
  ["非 0 字距", ui.metrics.letterSpacingNonZero, "宣告數"],
  ["裝飾性 rotate(", ui.metrics.decorativeRotate, "已排除 @keyframes spin、.diagnosis-summary::before"],
  ["JSX 文字節點含箭頭", ui.metrics.jsxArrowTextNodes, "→ ↗ ▸ ▾"],
  ["JSX 全大寫 eyebrow", ui.metrics.jsxAllCapsEyebrow, "/^[A-Z ]{4,}$/"],
  ["JSX 裝飾字元", ui.metrics.jsxDecorativeChars, "①–⑳ ★ ☆ ⓘ ●"],
  ["CSS content 裝飾字元", ui.metrics.cssDecorativeContent, "content: \"▾\" 等"],
  [".button-row 置中", ui.metrics.buttonRowCentered, "justify-content: center"],
  ["巢狀卡片選擇器", ui.metrics.nestedCardSelectors, ".panel .panel、.panel [class*=card]（.board-card 除外）"],
  ["linear-gradient", ui.metrics.linearGradient, ""],
  ["box-shadow", ui.metrics.boxShadow, "--shadow-overlay 與 none 除外"],
  ["JSX 文字節點含中文", ui.metrics.jsxCjkTextNodes, ""],
  ["元件字串常值含中文", ui.metrics.cjkStringLiterals, "屬性值、變數等（註解不計）"],
  ["labels「注意：」開頭", copy.metrics.noticePrefix, `含「注意：」出現次數 ${copy.metrics.noticeAnywhere}`],
  ["labels 箭頭字元", copy.metrics.arrows, "字元數"],
  ["靜態 data-testid（相異）", ui.info.staticTestIdsDistinct, `出現 ${ui.info.staticTestIdOccurrences} 次；動態屬性 ${ui.info.dynamicTestIdAttributes} 處；testId 屬性 ${ui.info.staticTestIdProps}`],
  ["相異 class 選擇器", ui.info.classSelectorsDistinct, `CSS 檔 ${ui.info.filesScanned.css}、TSX 檔 ${ui.info.filesScanned.tsx}`],
];
/** 終端機顯示寬度：中日韓與全形字元算 2 格。 */
const displayWidth = text => [...text].reduce((sum, ch) => sum + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1), 0);
const width = Math.max(...rows.map(([name]) => displayWidth(name)));
console.log("UI 靜態基準（scripts/ui-audit.mjs）");
for (const [name, value, note] of rows) console.log(`${name}${" ".repeat(width - displayWidth(name))}  ${String(value).padStart(4)}  ${note}`);
console.log(`labels 其餘：${Object.entries(copy.metrics).filter(([key]) => !["noticePrefix", "noticeAnywhere", "arrows"].includes(key)).map(([key, value]) => `${key}=${value}`).join("、")}`);

if (jsonPath) {
  const out = resolve(jsonPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON 已寫入 ${jsonPath}`);
}
