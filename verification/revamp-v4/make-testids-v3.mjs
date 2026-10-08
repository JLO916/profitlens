// V4-0a：把 testid 基準的三步結果合成 verification/revamp-v4/testids-v3.txt（PRD v4 §8.6、06_BATCHES V4-0a 第 3 項）。格式與 verification/revamp-v3/testids-v2.txt 相同：
//   testid<TAB>來源<TAB>說明；來源 ssr（SSR 渲染到）、e2e（只有瀏覽器互動後才出現）、cond（條件項，SSR 與收集流程都不進入）。
// 三步：
//   1. TESTID_BASELINE_DUMP=<ssr.json> npx vitest run tests/testid-baseline.test.ts：得到 ssr 列（每個 id 對應 SSR 情境）
//   2. PROFITLENS_PORT=<埠> npx playwright test --config verification/revamp-v4.config.ts：得到 verification/revamp-v4/collect-testids.json（每個 id 對應瀏覽器步驟）；
//      瀏覽器收集到、SSR 沒有的 id 是 e2e 列（帶 crypto.randomUUID() 的會議 id 不收錄，同 v2）
//   3. cond 列：沿用 testids-v2.txt 的 cond 列，再加下方 V3_COND（v3 新增、只在失敗或特殊資料下才出現的 testid）
// 用法：node verification/revamp-v4/make-testids-v3.mjs --ssr <ssr.json> [--e2e verification/revamp-v4/collect-testids.json] [--out verification/revamp-v4/testids-v3.txt]
// 只用 Node 內建模組與既有 devDependency「typescript」（找每個 testid 在原始碼的產生位置）。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(resolve("package.json"));
const ts = require("typescript");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
if (!args.ssr) { console.error("缺 --ssr <TESTID_BASELINE_DUMP 寫出的 JSON>"); process.exit(1); }
const ssr = JSON.parse(readFileSync(resolve(args.ssr), "utf8"));
const e2e = JSON.parse(readFileSync(resolve(args.e2e ?? "verification/revamp-v4/collect-testids.json"), "utf8"));
const v2File = resolve(args.v2 ?? "verification/revamp-v3/testids-v2.txt");
const outFile = resolve(args.out ?? "verification/revamp-v4/testids-v3.txt");
const BASE_COMMIT = "625bfa5";

/**
 * v3 新增的條件項（SSR 與 verification/revamp-v4/collect-testids.spec.ts 都不進入）：每個 testid 對應條件與覆蓋它的既有測試。
 * V4-0a 實際跑完收集流程後，原始碼會產生、但 SSR 與瀏覽器都沒收集到的 testid 一律要列在這裡或 v2 的 cond 列（否則本腳本中止）。
 */
const V3_COND = {
  "diagnosis-count-favorable": "健檢列有「有利」方向的規則時才出現的計數徽章（示範資料、golden、missing_cogs 都沒有）；tests/diagnosis-v3.test.tsx（合成健檢結果的 SSR）覆蓋",
  "meeting-compare-different_periods": "與上次會議比較時兩場的期間不同才出現（同一份資料、同一組通路）；比較種類的判定由 tests/meeting.test.ts 覆蓋，收集流程改期間後會議草稿跟著目前檢視，仍是 same_scope",
};

// ---------------------------------------------------------------- 原始碼裡的產生位置

const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter(name => /\.tsx?$/.test(name)).sort().map(name => join("src", name));
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** { kind: "literal" | "template" | "expression" | "passthrough", text, where, prefix?, re? } */
const producers = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = node => `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const visit = node => {
    let expr = null;
    if (ts.isJsxAttribute(node) && ["data-testid", "testId", "testIdPrefix"].includes(node.name.getText(source)) && node.initializer) expr = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
    if (ts.isPropertyAssignment(node) && ["testId", "testid"].includes(node.name.getText(source))) expr = node.initializer;
    if (expr) {
      // testIdPrefix="profit-waterfall-bar-"：元件以 `${testIdPrefix}${bar.metric}` 輸出，當成樣板。
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "testIdPrefix" && ts.isStringLiteralLike(expr)) producers.push({ kind: "template", text: `${expr.text}{metric}`, where: where(node), prefix: expr.text, fixed: expr.text.length, re: new RegExp(`^${escapeRe(expr.text)}.+$`) });
      else if (ts.isStringLiteralLike(expr)) producers.push({ kind: "literal", text: expr.text, where: where(node) });
      else if (ts.isTemplateExpression(expr)) {
        const pattern = escapeRe(expr.head.text) + expr.templateSpans.map(span => `[^]+?${escapeRe(span.literal.text)}`).join("");
        producers.push({ kind: "template", text: expr.getText(source), where: where(node), prefix: expr.head.text, fixed: expr.head.text.length + expr.templateSpans.reduce((sum, span) => sum + span.literal.text.length, 0), re: new RegExp(`^${pattern}$`) });
      } else {
        const literals = [];
        // 比較運算的字串（例如 spec.sections.kpis === "four"）不是 testid。
        const comparison = child => ts.isBinaryExpression(child.parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(child.parent.operatorToken.kind);
        const collect = child => { if (ts.isStringLiteralLike(child) && !comparison(child)) literals.push(child.text); ts.forEachChild(child, collect); };
        collect(expr);
        for (const literal of literals) producers.push({ kind: "expression", text: literal, where: where(node) });
        if (literals.length === 0) producers.push({ kind: "passthrough", text: expr.getText(source), where: where(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
/** 一個 testid 的產生位置（字面值優先；樣板取整段符合、固定字元最多的那個，例如 board-card-1-move-x 歸 `board-card-${n}-move-${value}`）：{ label, where }。 */
function producerOf(id) {
  const literal = producers.find(item => item.kind === "literal" && item.text === id);
  if (literal) return { label: `字面值 ${literal.where}`, where: literal.where };
  const expression = producers.find(item => item.kind === "expression" && item.text === id);
  if (expression) return { label: `運算式 ${expression.where}`, where: expression.where };
  const template = producers.filter(item => item.kind === "template" && item.re.test(id)).sort((a, b) => b.fixed - a.fixed)[0];
  if (template) return { label: `樣板 ${template.text} ${template.where}`, where: template.where };
  return { label: "變數傳入（元件以 data-testid={變數} 或 testId 屬性輸出）", where: null };
}

// ---------------------------------------------------------------- 三步合成

const v2Rows = readFileSync(v2File, "utf8").split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#")).map(line => { const [id, source, note = ""] = line.split("\t"); return { id, source, note }; });
const v2Cond = new Map(v2Rows.filter(row => row.source === "cond").map(row => [row.id, row.note]));
const listSteps = (steps, limit) => steps.length <= limit ? steps.join("、") : `${steps.slice(0, limit).join("、")} 等 ${steps.length} 個`;

const rows = new Map();
for (const [id, scenarios] of Object.entries(ssr)) rows.set(id, { id, source: "ssr", note: `${producerOf(id).label}；SSR 情境：${listSteps(scenarios, 4)}` });
for (const [id, steps] of Object.entries(e2e)) {
  if (rows.has(id) || id.includes("{uuid}")) continue;
  rows.set(id, { id, source: "e2e", note: `${producerOf(id).label}；瀏覽器步驟：${listSteps(steps, 2)}` });
}
for (const [id, note] of [...v2Cond, ...Object.entries(V3_COND)]) {
  if (rows.has(id)) continue;
  // v2 的 cond 列沿用說明，只把原始碼位置更新成 v3.0.0 的行號。
  const { label, where } = producerOf(id);
  rows.set(id, { id, source: "cond", note: v2Cond.has(id) && !Object.hasOwn(V3_COND, id) ? (where ? note.replace(/src\/[\w/.-]+:\d+/, where) : note) : `${label}；${note}` });
}

// 原始碼的字面值 testid 都要有歸屬（ssr、e2e 或 cond）；v2 的每一列都要在。
const unassigned = [...new Set(producers.filter(item => item.kind === "literal" || item.kind === "expression").map(item => item.text))].filter(id => !rows.has(id));
const templatesWithoutInstance = producers.filter(item => item.kind === "template" && ![...rows.keys()].some(id => item.re.test(id))).map(item => `${item.text} ${item.where}`);
const missingV2 = v2Rows.filter(row => !rows.has(row.id)).map(row => row.id);
if (unassigned.length || missingV2.length) {
  console.error(`原始碼字面值沒有歸屬（請補進 V3_COND 或收集流程）：${unassigned.join(", ") || "無"}`);
  console.error(`v2 清單有、v3 沒有：${missingV2.join(", ") || "無"}`);
  process.exit(1);
}

const sorted = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
const count = source => sorted.filter(row => row.source === source).length;
const literalIds = new Set(producers.filter(item => item.kind === "literal").map(item => item.text));
const templateFamilies = new Set(producers.filter(item => item.kind === "template").map(item => item.text));
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const header = [
  `# EC ProfitLens v3.0.0 data-testid 基準（V4-0a，PRD v4 §8.6、06_BATCHES V4-0a 第 3 項；產生日 ${today}，基準 v3.0.0＝${BASE_COMMIT}）`,
  "# 格式：testid<TAB>來源<TAB>說明（原始碼位置；收集到它的 SSR 情境或瀏覽器步驟）。以 # 開頭的是註解。與 verification/revamp-v3/testids-v2.txt 相同。",
  "# 來源：",
  "#   ssr  = tests/testid-baseline.test.ts 以 renderToStaticMarkup 渲染各頁狀態後實際出現（嚴格比對，少一個即失敗）；V4-0a 起 SSR 情境含 tests/helpers/page-states.tsx 的整頁狀態（情境名 page:{狀態名}）。",
  "#   e2e  = 只在瀏覽器互動後出現（確認區、抽屜、備案對話框、列印版、載入中與錯誤、本機副本等），由 verification/revamp-v4/collect-testids.spec.ts",
  "#          （設定檔 verification/revamp-v4.config.ts，production build、PUBLIC_DEMO 模式）實際收集；結果在 collect-testids.json。",
  "#   cond = 條件項（失敗狀態、live AI、非整數件數等），SSR 與收集流程都不進入；說明欄列出覆蓋它的既有測試。",
  "#   e2e／cond 在 vitest 另做原始碼檢查（字面值或樣板字首仍存在）；真正的渲染比對在 Playwright。",
  `# 統計（實測）：共 ${sorted.length} 列（ssr ${count("ssr")}、e2e ${count("e2e")}、cond ${count("cond")}）。原始碼字面值 testid ${literalIds.size} 個、樣板 ${templateFamilies.size} 種（全部展開成實際渲染值收錄）。`,
  `#   v2 基準（verification/revamp-v3/testids-v2.txt）的 ${v2Rows.length} 列全部在本清單（v3 對 v2 刪除 0）；帶 crypto.randomUUID() 的 meeting-history-remove-meeting-{uuid} 不收錄（同 v2，SSR 的固定 id 版本已收錄）。`,
  `#   沒有任何實例的樣板：${templatesWithoutInstance.length ? templatesWithoutInstance.join("；") : "無"}（以 cond 列的實例代表）。`,
  "#   audit:ui 的「靜態 testid 253」是原始碼字面值的另一種計數，和本清單是不同的量。",
  "# 產生方式（三步）：",
  "#   1. TESTID_BASELINE_DUMP=<ssr.json> npx vitest run tests/testid-baseline.test.ts（ssr 列）",
  "#   2. NEXT_TELEMETRY_DISABLED=1 npm run build；APP_MODE=PUBLIC_DEMO PUBLIC_DEMO=true ENABLE_LIVE_AI=false npm start -- --port <埠>；",
  "#      PROFITLENS_PORT=<埠> npx playwright test --config verification/revamp-v4.config.ts（e2e 列：瀏覽器收集到、SSR 沒有的 id）",
  "#   3. cond 列沿用 testids-v2.txt 的 cond 列，並補 v3 新增的條件項（verification/revamp-v4/make-testids-v3.mjs 的 V3_COND）",
  "#   合成：node verification/revamp-v4/make-testids-v3.mjs --ssr <ssr.json>",
];
writeFileSync(outFile, `${[...header, ...sorted.map(row => `${row.id}\t${row.source}\t${row.note}`)].join("\n")}\n`);
console.log(JSON.stringify({ rows: sorted.length, ssr: count("ssr"), e2e: count("e2e"), cond: count("cond"), literalIds: literalIds.size, templateFamilies: templateFamilies.size, templatesWithoutInstance }, null, 2));
