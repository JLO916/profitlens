#!/usr/bin/env node
// V3-0 色彩對比檢查（PRD §2.3 C）：純 Node，無依賴。用法：node scripts/contrast-check.mjs
// 讀 globals.css 的 :root 自訂屬性，依下方明確列出的配對算 WCAG 2.x 對比；
// 文字配對 < 4.5:1 或非文字配對 < 3:1 即 exit 1。
// V3-0 範圍：現行 token（--ink、--muted、--teal、--negative）在 --paper 與 #ffffff 上，
// 加上側欄、頂欄、頁尾實際渲染的寫死灰階（尚未 token 化，V3-1 換成 token 後改寫成 var(--*)）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const GLOBALS_CSS = "src/app/globals.css";

/**
 * kind：text（≥ 4.5）或 non-text（≥ 3.0）。fg／bg 可寫 var(--token) 或 #hex；where 記錄出處（globals.css 規則）。
 * 新增 token 或配色時，把「它會出現的每一種底色」都列進來。
 */
export const PAIRS = [
  { kind: "text", fg: "var(--ink)", bg: "var(--paper)", where: "body 正文" },
  { kind: "text", fg: "var(--ink)", bg: "#ffffff", where: ".panel 正文" },
  { kind: "text", fg: "var(--muted)", bg: "var(--paper)", where: ".subtitle 等次要文字" },
  { kind: "text", fg: "var(--muted)", bg: "#ffffff", where: ".panel 內 small" },
  { kind: "text", fg: "var(--muted)", bg: "#fcfdfb", where: ".brand small（側欄）" },
  { kind: "text", fg: "var(--teal)", bg: "var(--paper)", where: "強調文字" },
  { kind: "text", fg: "var(--teal)", bg: "#ffffff", where: ".panel 內強調、正值" },
  { kind: "text", fg: "var(--negative)", bg: "var(--paper)", where: "負值" },
  { kind: "text", fg: "var(--negative)", bg: "#ffffff", where: ".panel 內負值" },
  { kind: "text", fg: "#62746e", bg: "#fcfdfb", where: ".nav-item 於 .sidebar" },
  { kind: "text", fg: "#62746e", bg: "#f0f4ef", where: ".nav-item:hover", knownIssue: "v2 既有：4.45 未達 4.5；V3-0 不改 UI，V3-1 換 token 時修正" },
  { kind: "text", fg: "#205f4d", bg: "#e6efe9", where: ".nav-item.active" },
  { kind: "text", fg: "#5f6d65", bg: "#fcfdfb", where: ".workspace-label" },
  { kind: "text", fg: "#516657", bg: "#f6f8f2", where: ".sidebar-note" },
  { kind: "text", fg: "#5b6a5e", bg: "#f6f8f2", where: ".sidebar-note p" },
  { kind: "text", fg: "#5f6e66", bg: "#fcfdfb", where: ".sidebar-footer" },
  { kind: "text", fg: "#5e6d67", bg: "#fcfdfb", where: ".breadcrumb 於 .topbar" },
  { kind: "text", fg: "#5f7566", bg: "#f0f5ef", where: ".mode-badge" },
  { kind: "text", fg: "#52685f", bg: "var(--paper)", where: ".main-footer、.analytics-note" },
  { kind: "non-text", fg: "#18816f", bg: "var(--paper)", where: ":focus-visible 焦點框" },
  { kind: "non-text", fg: "#18816f", bg: "#ffffff", where: ":focus-visible 焦點框（.panel 內）" },
  { kind: "non-text", fg: "#d8e2dc", bg: "#ffffff", where: "select, input 邊框", knownIssue: "v2 既有：1.32 未達 3.0；V3-0 不改 UI，V3-1 換 token 時修正" },
];

/**
 * knownIssue：V3-0 實測時已不合格、但本批不能改 UI 的配對。照常計算與列出，標「已知」，不讓 exit 失敗。
 * 這是一次性的過渡清單：V3-1 驗收要求 contrast-check 全過，屆時必須修正配色並刪掉所有 knownIssue，之後不得再新增。
 */

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
    return { ...pair, fgHex: fg, bgHex: bg, ratio: Math.floor(ratio * 100) / 100, min, pass: ratio >= min, status: ratio >= min ? "通過" : pair.knownIssue ? "已知" : "失敗" };
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("contrast-check.mjs")) {
  const results = checkContrast();
  console.log("色彩對比（WCAG 2.x；文字 ≥ 4.5、非文字 ≥ 3.0）");
  for (const row of results) console.log(`${row.status}  ${row.ratio.toFixed(2).padStart(5)} ≥ ${row.min.toFixed(1)}  ${row.kind.padEnd(8)}  ${row.fg} (${row.fgHex}) on ${row.bg} (${row.bgHex})  ${row.where}${row.status === "已知" ? `（${row.knownIssue}）` : ""}`);
  const failed = results.filter(row => row.status === "失敗");
  const known = results.filter(row => row.status === "已知");
  console.log(`共 ${results.length} 組：通過 ${results.length - failed.length - known.length}、失敗 ${failed.length}、已知 v2 問題 ${known.length}（不擋 V3-0，V3-1 必須清零）`);
  if (failed.length) process.exit(1);
}
