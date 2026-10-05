#!/usr/bin/env node
// V3-0（PRD §6.4 M5）：盤點 tests/e2e 的 21 個 spec＋2 支 helper 中「不是 testid 的定位器」，產生 verification/revamp-v3/e2e-text-assertions.csv。
// 每一個 getByText／getByRole／getByLabel 等文字或角色定位器、每一個 .locator() 的 CSS／DOM 結構選擇器各一列，標出最可能被哪一批影響、建議改用的 testid。
// 用法：node scripts/e2e-locator-inventory.mjs [輸出路徑]；統計（行數）印在 stdout。可重複執行，結果只取決於 tests/e2e 的內容。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve("tests/e2e");
const out = resolve(process.argv[2] ?? "verification/revamp-v3/e2e-text-assertions.csv");
const files = readdirSync(dir).filter(name => name.endsWith(".spec.ts") || name === "import-wizard-helpers.ts" || name === "replacement-helpers.ts").sort();

// 依選擇器內容判斷受影響的批次（先比對的優先）。V3-2：寫死的中文字（要改成 labels）；其餘依頁面區塊。
const AREA = [
  ["V3-3", /labels\.nav\.|nav-item|aria-current|replacementDialog|validation/i],
  ["V3-7", /meeting|review|manager|print|record\.|exportPdf|exportExcel|exportPptx|exportMarkdown|menuMarkdown|summary-print|decisionMd|decisionCsv|decisionJson/i],
  ["V3-6", /scenario|decision|sensitivity|threshold-(?!form)|\baction|(?<![a-z])board|addAction|evidence-?(?:option|checklist|picker)|datalist|confirm-list|\bpin\b|moveUp|rebind/i],
  ["V3-8", /import|wizard|dropzone|template|targets|events|issue|validation|loadDemo|preprocess|reconcil|mapping|labels\.importErrors|labels\.dataset/i],
  ["V3-5", /diagnosis|rules\.|evidence|drawer|ladder|product|ai[-.]|aiPanel|labels\.ai\b|channel-table|channelTable|impact/i],
  ["V3-4", /kpi|assist|overview|top-three|topThree|trend|bridge|chart|period-comparison|dailyAverage|labels\.metrics|achieved/i],
  ["V3-3", /nav|sidebar|topbar|breadcrumb|workspace-status|status\.|download|storage|autoSave|scope-note|preset|periods\.|filter|skip-link|main-footer|basis|ai-availability|replacement|clear|previous-start|previous-end|current-start|current-end|tiny-tag|brand|footer|header|html|body/i],
];
const FILE_BATCH = {
  "action-workspace.spec.ts": "V3-6", "ai.spec.ts": "V3-5", "import-guidance.spec.ts": "V3-8", "import-wizard-helpers.ts": "V3-8", "import-wizard.spec.ts": "V3-8", "import.spec.ts": "V3-8",
  "m6-acceptance.spec.ts": "V3-4", "manager-presentation.spec.ts": "V3-7", "manager-summary.spec.ts": "V3-7", "period-comparison.spec.ts": "V3-4", "product-comparison.spec.ts": "V3-5",
  "replacement-helpers.ts": "V3-3", "revamp-r1-layout.spec.ts": "V3-3", "revamp-r2-copy.spec.ts": "V3-2", "revamp-r4.spec.ts": "V3-4", "revamp-r5.spec.ts": "V3-6", "revamp-r6.spec.ts": "V3-7",
  "review-v2-a-export.spec.ts": "V3-7", "review-v2-a.spec.ts": "V3-7", "scenario-sensitivity.spec.ts": "V3-6", "scenarios.spec.ts": "V3-6", "workspace-storage.spec.ts": "V3-3", "workspace.spec.ts": "V3-3",
};
// 已有（或 PRD 已規劃）的 testid：選擇器命中就建議改用。
const SUGGEST = [
  [/\.scope-note/, "period-summary（V3-3 新增）"],
  [/sidebar \.tiny-tag|sidebar-note|mode-badge/, "data-status（V3-3 新增）"],
  [/labels\.buttons\.importData/, "page-import／data-status-import"],
  [/\.kpi-value/, "kpi-{metric}"],
  [/details\.diagnosis-row/, "diagnosis-row-{rule}"],
  [/\.top-three-list/, "overview-priority-{rule}"],
  [/\.bridge-total/, "bridge-table／bridge-balance-check（V3-4 新增）"],
  [/#ai-availability-detail/, "ai-availability"],
  [/#previous-start|#previous-end|#current-start|#current-end/, "period-custom（V3-3 新增；欄位 id 保留）"],
  [/header\.topbar/, "data-status／download-menu／workspace-storage"],
  [/footer\.main-footer/, "analytics-note（頁尾）"],
  [/labels\.downloads\.decision(Md|Csv|Json)/, "actions-export-{md,csv,json}／export-page-{page}"],
  [/labels\.buttons\.exportExcel/, "meeting-export-excel"],
  [/labels\.buttons\.exportPptx/, "meeting-export-pptx"],
  [/labels\.buttons\.download\b/, "download-menu"],
  [/labels\.buttons\.save\b/, "workspace-storage"],
  [/labels\.nav\.\w+\.label/, "nav-group-{id}／mobile-tabbar（V3-3 新增）"],
  [/labels\.meeting\.threshold/, "threshold-form-overview／threshold-form-meeting"],
  [/copy\.scenarioSelect|scenarioSelect/, "meeting-scenario-select-{channel}"],
  [/labels\.ui\.reviewWorkbench\.createButton|createButton/, "meeting-create"],
  [/data-testid=["']?([\w-]+)/, "$1"],
];
const KINDS = [["getByText(", "getByText"], ["getByRole(", "getByRole"], [".locator(", "locator-css"], ["getByLabel(", "other"], ["getByPlaceholder(", "other"], ["getByTitle(", "other"], ["getByAltText(", "other"]];

/** 取出從 start 開始、括號平衡的呼叫文字（可跨行，最多 400 字）。 */
function callText(text, start) {
  let depth = 0, quote = null;
  for (let i = text.indexOf("(", start); i < text.length && i - start < 400; i++) {
    const ch = text[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start, start + 400);
}
const csv = value => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const hasCjkLiteral = snippet => /(["'`])[^"'`]*[㐀-鿿][^"'`]*\1/.test(snippet);

const rows = [];
const lineCounts = { textRole: { all: 0, spec: 0 }, locator: { all: 0, spec: 0 }, testId: { all: 0, spec: 0 }, label: { all: 0, spec: 0 } };
for (const file of files) {
  const text = readFileSync(join(dir, file), "utf8");
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const lineOf = index => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; } return lo + 1; };
  const spec = file.endsWith(".spec.ts");
  for (const line of text.split("\n")) {
    const add = (key, hit) => { if (hit) { lineCounts[key].all++; if (spec) lineCounts[key].spec++; } };
    add("textRole", /getByText\(|getByRole\(/.test(line));
    add("locator", /\.locator\(/.test(line));
    add("testId", /getByTestId\(/.test(line));
    add("label", /getByLabel\(|getByPlaceholder\(|getByTitle\(|getByAltText\(/.test(line));
  }
  for (const [token, kind] of KINDS) {
    for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + token.length)) {
      // 定位器的起點：往前找到這條鏈的接收者（page／元素變數），只為了讓 snippet 看得出範圍。
      const start = token === ".locator(" ? at + 1 : at;
      const call = callText(text, start).replace(/\s+/g, " ");
      const lineStart = starts[lineOf(at) - 1];
      const prefix = text.slice(lineStart, at).trim();
      const receiver = /([\w.$]*(?:getByTestId\([^)]*\)|[\w$]+)\s*\.?\s*)$/.exec(prefix)?.[1]?.replace(/\s+/g, "") ?? "";
      // 接收者是一串鏈（例如 page.getByTestId("x").first()）時正規式抓不到，改附上同一行前面最多 60 字。
      const head = receiver ? (receiver.endsWith(".") ? receiver : `${receiver}.`) : prefix ? `…${prefix.slice(-60)}` : "";
      const snippet = `${head}${call}`.slice(0, 300);
      const literal = kind !== "locator-css" && hasCjkLiteral(call);
      const area = AREA.find(([, pattern]) => pattern.test(snippet))?.[0];
      const batch = literal ? "V3-2" : area ?? FILE_BATCH[file] ?? "V3-2";
      let suggested = "";
      for (const [pattern, id] of SUGGEST) { const match = pattern.exec(snippet); if (match) { suggested = id.replace("$1", match[1] ?? ""); break; } }
      rows.push({ file: `tests/e2e/${file}`, line: lineOf(at), kind, snippet, batch, suggested });
    }
  }
}
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
const header = ["file", "line", "locator_kind", "snippet", "likely_batch", "suggested_testid"];
writeFileSync(out, `${[header.join(","), ...rows.map(row => [row.file, row.line, row.kind, row.snippet, row.batch, row.suggested].map(String).map(csv).join(","))].join("\n")}\n`);

const byKind = Object.fromEntries(["getByText", "getByRole", "locator-css", "other"].map(kind => [kind, rows.filter(row => row.kind === kind).length]));
const byBatch = Object.fromEntries([...new Set(rows.map(row => row.batch))].sort().map(batch => [batch, rows.filter(row => row.batch === batch).length]));
console.log(JSON.stringify({
  files: files.length, rows: rows.length, rows_by_kind: byKind, rows_by_batch: byBatch, rows_with_suggested_testid: rows.filter(row => row.suggested).length,
  lines: {
    "getByText/getByRole（含 helper）": lineCounts.textRole.all, "getByText/getByRole（只算 spec）": lineCounts.textRole.spec,
    "locator()（含 helper）": lineCounts.locator.all, "locator()（只算 spec）": lineCounts.locator.spec,
    "getByTestId（含 helper）": lineCounts.testId.all, "getByTestId（只算 spec）": lineCounts.testId.spec,
    "getByLabel 等其他（含 helper）": lineCounts.label.all, "getByLabel 等其他（只算 spec）": lineCounts.label.spec,
  },
  output: out,
}, null, 2));
