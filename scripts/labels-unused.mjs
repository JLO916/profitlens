#!/usr/bin/env node
// V3-2c：列出 labels 新分組裡「程式碼沒有引用」的字串葉節點（PRD §8.10）。
//
// 判斷方式（TypeScript AST，偏保守：拿不準就算有引用）：
// 1. 從 `labels`（以及把 labels 子物件存進變數、解構出來的名稱）出發，沿著 a.b.c 取值鏈解析出 labels 路徑。
// 2. 取值鏈停在字串葉節點 → 只算那一個葉節點有引用；停在物件但之後接的是方法、方括號索引、
//    當參數傳出去、展開、迭代等任何「整個物件被拿走」的用法 → 整棵子樹都算有引用。
// 3. 程式碼裡任何字串常值剛好等於某個 labels 路徑（新路徑或 v2 舊路徑，例如 t("metrics.mer.headline")）→ 算有引用。
// 4. V3-10 起 labels 只剩新分組（v2 舊鍵 alias 已移除），程式碼只用新路徑；v2 舊路徑（例如 copy-rewrite.csv 的鍵）經
//    tests/fixtures/labels-legacy-map.json（移除前凍結的 legacyAliases）換成新路徑後比對。
// 5. 動態索引的物件（DYNAMIC_PARENTS）與 copy-rewrite.csv 標成 removed、但 V3-2 版面改版前仍顯示的列一律保留。
//
// 用法：node scripts/labels-unused.mjs [--json]
//   「沒有引用」只看 src/（排除 src/i18n）；tests/、scripts/ 直接取到該字串者另外標示，不列為可刪（刪了會讓測試或腳本壞掉）。
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { loadLabelsModule } from "./lib/load-labels.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const asJson = args.includes("--json");

/** 以方括號或迴圈動態取值的物件（新路徑）：只要上層物件有被引用，整棵都保留。 */
export const DYNAMIC_PARENTS = [
  "rules", // labels.rules[code]
  "metrics", // labels.metrics[name]
  "errors.import", // labels.errors.import[reason]
  "scenarios.sensitivity.reasons", // labels.scenarios.sensitivity.reasons[code]
  "glossary.terms",
  "glossary.basis.items",
  "glossary.aliases",
  "data.demoChannelAlias",
  "data.demoCategoryAlias",
  "exports.csv.columns",
  "shell.nav",
];

const SOURCE_DIRS = { src: ["src"], outside: ["tests", "scripts"] };
/** V3-10：v2 舊路徑 → 新路徑的凍結對照（leaves）。 */
const LEGACY_MAP = "tests/fixtures/labels-legacy-map.json";
const EXCLUDE = [/^src\/i18n\//, /^scripts\/labels-(regroup|unused)\.mjs$/, /node_modules/];

function listFiles(dir) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { recursive: true, encoding: "utf8" })
    .map(name => join(dir, name).replaceAll("\\", "/"))
    .filter(file => /\.(?:m?[jt]sx?|mts)$/.test(file) && !EXCLUDE.some(re => re.test(file)));
}

/** labels 執行期物件上取路徑；不存在回傳 undefined。 */
function getPath(labels, path) {
  let node = labels;
  for (const key of path) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/** 一個檔案裡所有 labels 引用：回傳 Set<"a.b.c">（v2 或新路徑都有可能，之後再換算）。 */
function referencesIn(file, text, labels, knownPaths) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : file.endsWith(".mjs") || file.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  /** 名稱 → 綁定的 labels 路徑（同名不同作用域取聯集，保守）。 */
  const bindings = new Map([["labels", new Set([""])]]);
  const refs = new Set();
  const split = path => (path === "" ? [] : path.split("."));
  /** 型別位置（typeof labels.x、keyof …）不會顯示任何字。 */
  const inType = node => { for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) { if (ts.isTypeNode(at) || ts.isQualifiedName(at)) return true; if (ts.isStatement(at)) return false; } return false; };

  // 第一輪：找出 `const x = labels.a.b`、`const { a, b: c } = labels.x` 等綁定；重複到不再增加（支援連續綁定）。
  const rootPaths = node => {
    // 回傳 node（取值鏈）解析出的路徑集合；不是 labels 鏈回傳 null。
    if (ts.isIdentifier(node)) return bindings.get(node.text) ?? null;
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) return rootPaths(node.expression);
    if (ts.isPropertyAccessExpression(node)) {
      const base = rootPaths(node.expression);
      if (!base) return null;
      const out = new Set();
      for (const path of base) {
        const next = path === "" ? node.name.text : `${path}.${node.name.text}`;
        if (getPath(labels, split(next)) !== undefined) out.add(next);
      }
      return out.size ? out : null;
    }
    return null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visit = node => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const paths = rootPaths(node.initializer);
        if (paths) {
          const bind = (name, values) => {
            const set = bindings.get(name) ?? new Set();
            const before = set.size;
            for (const value of values) set.add(value);
            bindings.set(name, set);
            if (set.size !== before) changed = true;
          };
          if (ts.isIdentifier(node.name)) bind(node.name.text, paths);
          else if (ts.isObjectBindingPattern(node.name)) for (const element of node.name.elements) {
            if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
            const key = element.propertyName ? element.propertyName.getText(source) : element.name.text;
            bind(element.name.text, [...paths].map(path => (path === "" ? key : `${path}.${key}`)).filter(path => getPath(labels, split(path)) !== undefined));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  // 第二輪：每個最外層的 labels 取值鏈。
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // 只認點分路徑（t("metrics.mer.label") 這類）；"format"、"data" 這種單字常值多半不是 labels 路徑。
      if (node.text.includes(".") && knownPaths.has(node.text)) refs.add(node.text);
    }
    if ((ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) && !inType(node)) {
      const parent = node.parent;
      // 外層還能繼續解析（labels.a 後面接 .b）→ 交給外層。
      const continues = ts.isPropertyAccessExpression(parent) && parent.expression === node && rootPaths(parent) !== null;
      // 宣告名稱、屬性名稱（x.labels 的 labels、{ copy: … } 的 copy）不是取值；簡寫屬性 { copy } 是把整個物件傳出去，要算。
      const isName = !ts.isShorthandPropertyAssignment(parent) && parent.name === node || ts.isBindingElement(parent) || ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent);
      // 只是存進變數或解構（第一輪已綁定，之後的取值會各自計入）→ 不直接算。
      const boundOnly = ts.isVariableDeclaration(parent) && parent.initializer === node && (ts.isIdentifier(parent.name) || ts.isObjectBindingPattern(parent.name) && parent.name.elements.every(element => !element.dotDotDotToken));
      const paths = !continues && !isName && !boundOnly ? rootPaths(node) : null;
      if (paths) for (const path of paths) refs.add(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return refs;
}

function leavesUnder(node, path, out) {
  if (typeof node === "string") out.push(path);
  else if (Array.isArray(node)) node.forEach((item, index) => leavesUnder(item, `${path}.${index}`, out));
  else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) leavesUnder(value, path ? `${path}.${key}` : key, out);
  return out;
}

export async function findUnused() {
  const mod = await loadLabelsModule({ root: ROOT });
  const { labels, LABEL_GROUPS } = mod;
  const legacyAliases = JSON.parse(readFileSync(resolve(ROOT, LEGACY_MAP), "utf8")).leaves;
  const toNew = path => legacyAliases[path] ?? path;
  // 新分組的葉節點（V3-10 起 labels 頂層就是 LABEL_GROUPS，沒有 alias）。
  const newLeaves = LABEL_GROUPS.flatMap(group => leavesUnder(labels[group], group, []));
  const oldPathsOf = new Map();
  for (const [from, to] of Object.entries(legacyAliases)) if (from !== to) oldPathsOf.set(to, [...(oldPathsOf.get(to) ?? []), from]);
  const knownPaths = new Set([...newLeaves, ...Object.keys(legacyAliases)]);
  for (const path of [...knownPaths]) { const parts = path.split("."); for (let i = 1; i < parts.length; i += 1) knownPaths.add(parts.slice(0, i).join(".")); }

  /**
   * 收集引用：回傳 Map<新路徑, Set<檔名>>。
   * specificOnly：只算直接取到葉節點或它的上一層物件（tests／scripts 常把整個 labels 拿去迭代檢查，那不是「使用」）。
   */
  const collect = (dirs, specificOnly) => {
    const referenced = new Map();
    for (const file of dirs.flatMap(listFiles)) {
      for (const ref of referencesIn(file, readFileSync(resolve(ROOT, file), "utf8"), labels, knownPaths)) {
        const depth = ref === "" ? 0 : ref.split(".").length;
        const node = getPath(labels, ref === "" ? [] : ref.split("."));
        for (const leaf of leavesUnder(node, ref, [])) {
          if (specificOnly && leaf.split(".").length - depth > 1) continue;
          const target = toNew(leaf);
          if (!referenced.has(target)) referenced.set(target, new Set());
          referenced.get(target).add(file);
        }
      }
    }
    return referenced;
  };
  const inSrc = collect(SOURCE_DIRS.src, false);
  const elsewhere = collect(SOURCE_DIRS.outside, true);

  // copy-rewrite.csv 的 removed 列（v2 路徑）：版面改版前仍可能顯示，保留。
  const removedRows = new Set();
  const csvPath = resolve(ROOT, "docs/revamp-v3/copy-rewrite.csv");
  if (existsSync(csvPath)) for (const line of readFileSync(csvPath, "utf8").replace(/^\ufeff/, "").split(/\r?\n/).slice(1)) {
    const key = line.split(",")[0];
    if (/,removed,/.test(line) && key) removedRows.add(toNew(key));
  }
  const dynamic = path => DYNAMIC_PARENTS.some(parent => path === parent || path.startsWith(`${parent}.`));

  const unused = newLeaves.filter(path => !inSrc.has(path)).map(path => ({
    path,
    legacy: oldPathsOf.get(path) ?? [],
    value: getPath(labels, path.split(".")),
    dynamic: dynamic(path),
    removedRow: removedRows.has(path),
    usedOutsideSrc: [...(elsewhere.get(path) ?? [])].sort(),
  }));
  const deletable = unused.filter(item => !item.dynamic && !item.removedRow && item.usedOutsideSrc.length === 0);
  return { total: newLeaves.length, unused, deletable };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await findUnused();
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`labels-unused：新分組字串 ${result.total} 個；src/ 沒有引用 ${result.unused.length} 個；可刪 ${result.deletable.length} 個（略過動態索引、copy-rewrite removed 列、tests／scripts 直接用到者）。`);
    for (const item of result.unused) {
      const tags = [item.dynamic && "動態索引", item.removedRow && "removed 列", item.usedOutsideSrc.length && `src 以外用到：${item.usedOutsideSrc.join("、")}`].filter(Boolean);
      console.log(`${result.deletable.includes(item) ? "刪" : "留"}\t${item.path}${item.legacy.length ? `（舊：${item.legacy.join("、")}）` : ""}${tags.length ? `［${tags.join("、")}］` : ""}\t${JSON.stringify(item.value)}`);
    }
  }
}
