#!/usr/bin/env node
// 色彩對比檢查（PRD §2.3 C、§9.1、§9.8 第 6 點）：純 Node，無依賴。用法：node scripts/contrast-check.mjs
// 讀 globals.css 的 :root 自訂屬性，依下方明確列出的配對算 WCAG 2.x 對比；
// 文字配對 < 4.5:1 或非文字配對 < 3:1 即 exit 1。
// V3-1 起：配對一律寫成語意 token（var(--*)），依 PRD §9.1 對比表列出「每個文字 token × 它會出現的每一種底色」，
// 以及需要辨識的非文字元素（輸入框外框、焦點框、number-link 底線、圖表線與類別色、狀態點）。不再有豁免清單。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const GLOBALS_CSS = "src/app/globals.css";

/** 底色：--bg-page（頁面、期間列）、--bg-surface（面板、抽屜、選單、頂欄）、--bg-subtle（表頭、看板欄、通知）、--bg-sidebar（側欄）、--bg-hover（按鈕與表格列 hover）。 */
const NEUTRAL_BGS = ["--bg-surface", "--bg-page", "--bg-subtle", "--bg-sidebar", "--bg-hover"];
const text = (fg, bgs, where) => bgs.map(bg => ({ kind: "text", fg: `var(${fg})`, bg: `var(${bg})`, where }));
const nonText = (fg, bgs, where) => bgs.map(bg => ({ kind: "non-text", fg: `var(${fg})`, bg: `var(${bg})`, where }));

/**
 * kind：text（≥ 4.5）或 non-text（≥ 3.0）。fg／bg 可寫 var(--token) 或 #hex；where 記錄用途（PRD §9.1、§9.4）。
 * 新增 token 或配色時，把「它會出現的每一種底色」都列進來；不得新增豁免。
 */
export const PAIRS = [
  // 文字 token（≥ 4.5）
  ...text("--text-primary", [...NEUTRAL_BGS, "--accent-subtle", "--warning-subtle", "--unfavorable-subtle"], "標題、數字、正文（含需要處理橫幅、通知、選中列）"),
  ...text("--text-secondary", [...NEUTRAL_BGS, "--accent-subtle", "--warning-subtle", "--unfavorable-subtle"], "次要文字、表頭、導覽、標籤（中性 lozenge 在 --bg-subtle 上；橫幅與確認區內的說明）"),
  ...text("--text-tertiary", [...NEUTRAL_BGS, "--accent-subtle", "--warning-subtle", "--unfavorable-subtle"], "說明、時間戳、分組標題、上期值、軸標（含橫幅、確認區、選中列內的說明）"),
  ...text("--accent", [...NEUTRAL_BGS, "--accent-subtle", "--warning-subtle"], "文字按鈕、選中的分段鈕與導覽、「進行中」標籤、橫幅內連結"),
  ...text("--on-accent", ["--accent", "--accent-hover"], "主要按鈕文字（含 hover）"),
  ...text("--on-accent", ["--unfavorable"], "確認對話框中的危險按鈕"),
  ...text("--unfavorable", ["--bg-surface", "--bg-page", "--bg-subtle", "--unfavorable-subtle"], "不利金額、錯誤、逾期、危險按鈕、「不利」標籤"),
  ...text("--warning", ["--bg-surface", "--bg-page", "--bg-subtle", "--warning-subtle"], "資料待補、受阻、提醒、過期、「資料待補」標籤"),
  ...text("--favorable", ["--bg-surface", "--bg-page", "--favorable-subtle"], "有利金額與「有利」標籤（D-V3-7＝A：主文字色）"),
  ...text("--chart-axis", ["--bg-surface"], "圖表軸標 12px"),
  // 非文字 token（≥ 3.0）
  ...nonText("--border-input", NEUTRAL_BGS, "輸入框、select、checkbox、分段鈕群組外框；number-link 虛線底線"),
  ...nonText("--focus-ring", [...NEUTRAL_BGS, "--accent-subtle"], ":focus-visible 焦點框（2px）"),
  ...nonText("--accent", ["--bg-surface", "--bg-page", "--bg-subtle"], "KPI 強調線、active 導覽線、stepper 目前步驟、ready 狀態點"),
  ...nonText("--warning", ["--bg-surface", "--bg-page"], "partial 狀態點、通知與橫幅語意色線"),
  ...nonText("--unfavorable", ["--bg-surface", "--bg-page"], "error 狀態點、危險按鈕外框、通知與橫幅語意色線"),
  ...nonText("--chart-current", ["--bg-surface"], "本期折線"),
  ...nonText("--chart-previous", ["--bg-surface"], "上期（實線 1.5px）"),
  ...nonText("--chart-yoy", ["--bg-surface"], "去年同期（虛線）"),
  ...nonText("--chart-total", ["--bg-surface"], "瀑布起訖柱與小計柱"),
  ...nonText("--chart-unfavorable", ["--bg-surface"], "瀑布不利項、負值長條"),
  ...nonText("--chart-favorable", ["--bg-surface"], "瀑布有利項（D-V3-7＝A，柱上標「+」）"),
  ...nonText("--chart-cat-1", ["--bg-surface"], "通路類別色 1"),
  ...nonText("--chart-cat-2", ["--bg-surface"], "通路類別色 2"),
  ...nonText("--chart-cat-3", ["--bg-surface"], "通路類別色 3"),
  ...nonText("--chart-cat-4", ["--bg-surface"], "通路類別色 4"),
  ...nonText("--chart-other", ["--bg-surface"], "第 5 個以上通路合併的「其他」"),
];

export const THRESHOLDS = { text: 4.5, "non-text": 3 };

/** 讀 :root 規則內的自訂屬性（只取第一層 :root，與 ui-scan 的 token 定義區口徑相同）。 */
export function readRootTokens(css) {
  const tokens = {};
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of clean.matchAll(/(?:^|[}\s]):root\s*\{([^}]*)\}/g)) {
    for (const decl of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens[decl[1]] = decl[2].trim();
  }
  return tokens;
}

export function resolveColor(value, tokens, seen = new Set()) {
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    if (seen.has(ref[1]) || !(ref[1] in tokens)) throw new Error(`找不到 token ${ref[1]}`);
    return resolveColor(tokens[ref[1]], tokens, new Set([...seen, ref[1]]));
  }
  const hex = value.trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!hex) throw new Error(`不支援的色值 ${value}（只接受不透明的 #rgb／#rrggbb 或 var(--token)）`);
  const full = hex[1].length === 3 ? [...hex[1]].map(ch => ch + ch).join("") : hex[1];
  return `#${full}`;
}

/** WCAG 2.x 相對亮度。 */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function checkContrast({ root = process.cwd(), pairs = PAIRS } = {}) {
  const tokens = readRootTokens(readFileSync(resolve(root, GLOBALS_CSS), "utf8"));
  return pairs.map(pair => {
    const fg = resolveColor(pair.fg, tokens), bg = resolveColor(pair.bg, tokens);
    const ratio = contrastRatio(fg, bg);
    const min = THRESHOLDS[pair.kind];
    return { ...pair, fgHex: fg, bgHex: bg, ratio: Math.floor(ratio * 100) / 100, min, pass: ratio >= min, status: ratio >= min ? "通過" : "失敗" };
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("contrast-check.mjs")) {
  const results = checkContrast();
  console.log("色彩對比（WCAG 2.x；文字 ≥ 4.5、非文字 ≥ 3.0）");
  for (const row of results) console.log(`${row.status}  ${row.ratio.toFixed(2).padStart(5)} ≥ ${row.min.toFixed(1)}  ${row.kind.padEnd(8)}  ${row.fg} (${row.fgHex}) on ${row.bg} (${row.bgHex})  ${row.where}`);
  const failed = results.filter(row => row.status === "失敗");
  console.log(`共 ${results.length} 組：通過 ${results.length - failed.length}、失敗 ${failed.length}（V3-1 起沒有豁免）`);
  if (failed.length) process.exit(1);
}
