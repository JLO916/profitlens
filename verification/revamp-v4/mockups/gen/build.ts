import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDataSource } from "./data-source";
import { buildDiagnosis } from "./diagnosis";
import { esc } from "./format";
import { buildOverview, type PageOutput } from "./overview";
import { buildProducts } from "./products";
import { loadSource, SOURCES, type MockupSource } from "./source";

// 設計稿產生器的登記處：每一頁一筆（檔名、資料來源、狀態、圖）。index.html 與 mockup-data.json 都由這裡產生。
// 代理 C2 已加上商品毛利（兩種狀態各一個檔）與資料來源兩頁；之後要加頁時在 PAGES 加一筆（build 函式＋截圖檔名）即可。

export const OUT_DIR = "verification/revamp-v4/mockups";
export const SHOTS_DIR = "verification/revamp-v4/V4-0b/mockups-shots";

export interface PageEntry {
  file: string;
  title: string;
  /** 資料來源說明（頁面與目錄共用）。 */
  sourceNote: string;
  /** 畫了哪些狀態。 */
  states: string;
  charts: string;
  /** 由哪個代理產出（V4-0b 分工）。 */
  owner: string;
  /** 截圖檔名（相對 SHOTS_DIR）。 */
  shots: readonly string[];
  /** 尚未產出時為 null（目錄列出、標「待產出」）。 */
  build: ((sources: LoadedSources) => PageOutput) | null;
}

export type LoadedSources = { demo: MockupSource; synthetic: MockupSource };

export const PAGES: readonly PageEntry[] = [
  { file: "overview.html", title: "經營總覽", sourceNote: "示範資料（fixtures/demo）＋目標檔 verification/revamp-v4-capture/targets.csv", states: "示範資料；G2 範圍可切換（合計、官網 · DTC、平台 · MARKETPLACE）", charts: "G1、G2、G3、G4、G5、G6（≤ 767）、G7a", owner: "代理 C1", shots: ["overview-1440-full.png", "overview-390-full.png", "overview-1440-annotated.png"], build: sources => buildOverview(sources.demo) },
  { file: "diagnosis.html", title: "通路健檢", sourceNote: "示範資料（fixtures/demo）", states: "示範資料；G9 門檻刻度可切換（0.00 與 300,000.00 示意）；G12 畫展開狀態", charts: "G9、G10、G11、G12、G7b", owner: "代理 C1", shots: ["diagnosis-1440-full.png", "diagnosis-1280-full.png", "diagnosis-768-full.png", "diagnosis-390-full.png", "diagnosis-1440-annotated.png"], build: sources => buildDiagnosis(sources.demo) },
  { file: "products.html", title: "商品毛利（狀態 1：示範資料）", sourceNote: "示範資料（fixtures/demo）：本期沒有商品毛利為負的商品", states: "第一格照 v3 原樣放 product-worst（不渲染 G14）；G13 可切換 PRD 版（≥ 768 兩欄並排）與建議版（各寬度都上下）", charts: "G13", owner: "代理 C2", shots: ["products-1440-full.png", "products-390-full.png", "products-1440-g13-stacked.png"], build: sources => buildProducts(sources.demo, "demo") },
  { file: "products-synthetic.html", title: "商品毛利（狀態 2：合成資料）", sourceNote: "4 通路合成資料（tests/fixtures/synthetic-4-channel）：5 個商品毛利為負，跨 MARKETPLACE、SOCIAL", states: "第一格 G14（after＝product-worst）；G13 可切換 PRD 版與建議版", charts: "G14、G13", owner: "代理 C2", shots: ["products-synthetic-1440-full.png", "products-synthetic-390-full.png", "products-synthetic-1440-annotated.png", "products-synthetic-1440-g13-stacked.png"], build: sources => buildProducts(sources.synthetic, "synthetic") },
  { file: "data.html", title: "資料來源", sourceNote: "4 通路合成資料（tests/fixtures/synthetic-4-channel；示範資料沒有缺列與問題），畫面當作經匯入精靈匯入", states: "合成資料；G20 可切換「去年同期」示意（假設檔案從 2025/9/1 起）；G21 格與 G20 資料表的篩選按鈕會篩問題表；前處理表可切換「含稅 5%」示意（G22）", charts: "G20、G21、G22", owner: "代理 C2", shots: ["data-1440-full.png", "data-390-full.png", "data-1440-annotated.png", "data-1440-g20-yoy.png", "data-390-g20-yoy.png", "data-1440-issues-filtered.png", "data-390-issues.png", "data-1440-g22.png"], build: sources => buildDataSource(sources.synthetic) },
];

export interface BuildResult { pages: { entry: PageEntry; output: PageOutput }[]; index: string; tokens: string; data: Record<string, unknown> }

export async function buildAll(): Promise<BuildResult> {
  const sources: LoadedSources = { demo: await loadSource(SOURCES.demo), synthetic: await loadSource(SOURCES.synthetic) };
  const pages = PAGES.flatMap(entry => entry.build ? [{ entry, output: entry.build(sources) }] : []);
  const data = Object.fromEntries(pages.map(({ entry, output }) => [entry.file, output.data]));
  return { pages, index: indexHtml(), tokens: tokensCss(), data };
}

export function writeAll(result: BuildResult): string[] {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const written: string[] = [];
  for (const { entry, output } of result.pages) {
    writeFileSync(resolve(OUT_DIR, entry.file), output.html);
    written.push(`${OUT_DIR}/${entry.file}`);
  }
  writeFileSync(resolve(OUT_DIR, "index.html"), result.index);
  writeFileSync(resolve(OUT_DIR, "tokens.css"), result.tokens);
  writeFileSync(resolve(OUT_DIR, "mockup-data.json"), `${JSON.stringify(result.data, null, 1)}\n`);
  written.push(`${OUT_DIR}/index.html`, `${OUT_DIR}/tokens.css`, `${OUT_DIR}/mockup-data.json`);
  return written;
}

/** 設計稿目錄（index.html）：列出所有設計稿與狀態；標明靜態設計稿、數字來源與 H5 待審字串。 */
function indexHtml(): string {
  const rows = PAGES.map(entry => {
    const link = entry.build ? `<a href="${entry.file}">${esc(entry.title)}</a>` : esc(entry.title);
    const shots = entry.shots.length ? entry.shots.map(shot => `<a href="../V4-0b/mockups-shots/${shot}">${esc(shot)}</a>`).join("<br>") : "—";
    return `<tr><th scope="row">${link}<br><code>${esc(entry.file)}</code></th><td>${esc(entry.sourceNote)}</td><td>${esc(entry.states)}</td><td>${esc(entry.charts)}</td><td>${entry.build ? "已產出" : "待產出"}（${esc(entry.owner)}）</td><td>${shots}</td></tr>`;
  }).join("");
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>v4 設計稿目錄 · H5 審查用</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="mockups.css">
</head>
<body class="mockup mockup-index">
<main class="index-main">
<h1>EC ProfitLens v4 設計稿（人工關卡 H5 審查用）</h1>
<p class="index-lead"><strong>靜態設計稿，不是產品畫面。</strong>數字取自示範資料或合成資料，由既有的 domain／application 函式算出，不是手打的；B 級整理函式（加總、佔比、累計、分階）尚不存在的地方，頁面上標「設計稿試算」，正式數字由 V4-n 的 B 級函式產生。</p>
<p class="index-lead">各頁新增的字串（將放在 <code>{group}.chartsV4.*</code>）都是 <strong>H5 待審提案</strong>：頁面上方可勾「標示新字串（H5 待審）」，頁尾有本頁新字串清單；既有字串一字不改。勾「標示 v4 變更」會框出 v4 新增或改變的區塊。</p>
<table class="ui-table index-table">
<caption>設計稿與狀態</caption>
<thead><tr><th scope="col">頁面</th><th scope="col">資料來源</th><th scope="col">狀態</th><th scope="col">圖</th><th scope="col">產出</th><th scope="col">截圖</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<h2>怎麼看</h2>
<ul>
<li>直接用瀏覽器開 HTML（<code>tokens.css</code>、<code>mockups.css</code> 要在同一個資料夾）；不載入任何外部資源，不需要伺服器。</li>
<li>把視窗縮到 390 寬就是手機版（底部分頁列、期間按鈕、清單式表格）；768、1280、1440 各有對應的版面。</li>
<li>重新產生、截圖與實測的命令見 <a href="README.md">README.md</a>。</li>
</ul>
</main>
</body>
</html>
`;
}

/**
 * PRD §6.5 的新 token 提案值（設計稿用、尚未進 :root）。--red-100 依 V4-0-baseline.md §13 的試算取 t＝0.25（白與 --red-600 在 sRGB 內插）：
 * --text-primary 文字 10.71、--text-secondary 5.20、--chart-unfavorable 框線對它 4.07、對 --red-50 的 ΔE2000 8.6；V4-3b 以 contrast-check 定案。
 */
export const PROPOSED_TOKENS: readonly { name: string; value: string; batch: string; note: string }[] = [
  { name: "--red-100", value: "#ebcecb", batch: "V4-3b", note: "原始色階新增一階紅色（提案 t＝0.25，V4-0-baseline §13）" },
  { name: "--chart-target", value: "var(--text-primary)", batch: "V4-2", note: "目標刻度、門檻點、目標線" },
  { name: "--chart-seg-1", value: "var(--gray-700)", batch: "V4-3a", note: "G10 商品成本" },
  { name: "--chart-seg-2", value: "var(--gray-500)", batch: "V4-3a", note: "G10 通路費用合計" },
  { name: "--chart-seg-3", value: "var(--gray-400)", batch: "V4-3a", note: "G10 廣告費" },
  { name: "--chart-heat-1", value: "var(--unfavorable-subtle)", batch: "V4-3b", note: "熱表階 1（即 --red-50）" },
  { name: "--chart-heat-2", value: "var(--red-100)", batch: "V4-3b", note: "熱表階 2（另加 2px --chart-unfavorable 框線）" },
  { name: "--chart-missing", value: "var(--gray-400)", batch: "V4-3b", note: "新圖的資料待補虛線框" },
  { name: "--chart-h-xs", value: "16px", batch: "V4-2", note: "sparkline 高" },
];

/** tokens.css：每次從 src/app/globals.css 原樣複製 :root 的全部 token（含 ≤ 767 的 --gutter），再附上設計稿用的新 token 提案值。 */
export function tokensCss(): string {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf(":root {");
  const end = css.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("globals.css 找不到 :root 區塊");
  const root = css.slice(start, end + 2);
  const gutter = css.split("\n").find(line => line.startsWith("@media (max-width: 767px) { :root {")) ?? "";
  const proposed = PROPOSED_TOKENS.map(token => `  ${token.name}: ${token.value}; /* ${token.batch}：${token.note} */`).join("\n");
  return `/*
 * v4 設計稿的 token（由 gen/build.ts 產生，請勿手改）。
 * 第一段：從 src/app/globals.css 的 :root 原樣複製（產品的單一來源；每次重跑產生器都重新複製）。
 * 第二段：設計稿用、尚未進 :root 的 PRD §6.5 新 token 提案值；正式宣告批次寫在各行註解，值以該批的 contrast-check 為準。
 */
${root}
${gutter}

/* ── 設計稿用、尚未進 :root（PRD §6.5 新 token 提案值） ── */
:root {
${proposed}
}
`;
}
