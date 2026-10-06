#!/usr/bin/env node
// V3-2c labels 結構重整產生器（PRD §8.10；一次性工具，保留在 repo 以便追溯）。
// 讀 V3-2b 收尾版（git 版本 BASE_REV）的 src/i18n/labels.zh-TW.ts，依 scripts/labels-regroup.map.json 把 42 個舊區段搬到新分組：
//   1. 舊檔每個字串葉節點攤平成 { 舊路徑: 字串 }，存成 verification/revamp-v3/labels-v3-2b.flat.json（驗證基準）；
//   2. 新分組是「儲存處」：字串常值只寫在新分組；被其他字串引用的葉節點提到檔案前段的具名常數；
//   3. 42 個舊區段重新產生成「alias 樹」：只放指向新分組的參照（整棵子樹相同時直接參照子樹），型別與舊檔相同；
//      舊區段與新分組同名（metrics、rules、actions、meeting）時，以「...新分組」展開再補上舊鍵的參照；
//   4. 匯出 LABEL_GROUPS、LEGACY_SECTIONS 與 legacyAliases（舊路徑 → 新路徑，由 LEGACY_PREFIXES 在載入時展開到每個葉節點）。
// 文字一字不改；tests/labels-structure.test.ts 逐一比對快照。只用 Node 內建模組與既有 devDependency「typescript」。
// V3-2c 收尾：verification/revamp-v3/labels-removed-v3-2c.txt 列的舊路徑（scripts/labels-unused.mjs 判定沒有引用）在搬家前先剪掉；
//   快照仍是 V3-2b 全量，自我檢查略過這些路徑。
// 用法：node scripts/labels-regroup.mjs [--base <git 版本>] [--check]
//   --check：只比對產生結果與目前檔案是否相同（不寫檔），不同時結束碼 1。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const LABELS = "src/i18n/labels.zh-TW.ts";
const SNAPSHOT = "verification/revamp-v3/labels-v3-2b.flat.json";
const MAP = "scripts/labels-regroup.map.json";
const REMOVED = "verification/revamp-v3/labels-removed-v3-2c.txt";
/** V3-2b 收尾（6e64b05）；之後到 V3-2c 開工前 labels 沒有再改。 */
const BASE_REV = "6e64b05";

const args = process.argv.slice(2);
const baseRev = args.includes("--base") ? args[args.indexOf("--base") + 1] : BASE_REV;
const checkOnly = args.includes("--check");
const fail = message => { console.error(`labels-regroup：${message}`); process.exit(1); };
/** V3-2c 刪除的舊路徑（每列第一欄；# 開頭是註解）。 */
const removedPaths = new Set(readFileSync(resolve(ROOT, REMOVED), "utf8").split("\n").filter(line => line.trim() && !line.startsWith("#")).map(line => line.split("\t")[0]));

const text = execFileSync("git", ["show", `${baseRev}:${LABELS}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
const sf = ts.createSourceFile(LABELS, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line;
const commentText = range => text.slice(range.pos, range.end);
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const keyText = key => (IDENT_RE.test(key) ? key : JSON.stringify(key));
const accessor = key => (IDENT_RE.test(key) ? `.${key}` : /^\d+$/.test(key) ? `[${key}]` : `[${JSON.stringify(key)}]`);

// ---------------------------------------------------------------- 1. 解析舊檔

/** @typedef {{ kind: "object" | "array", assertion: string | null, children: Child[], closing: string[] }} Container */
/** @typedef {{ kind: "leaf", literal: boolean, text: string, expr: ts.Expression, refs: { start: number, end: number, path: string }[] }} Leaf */
/** @typedef {{ key: string, node: Container | Leaf, leading: string[], trailing: string[] }} Child */

const statements = sf.statements;
const sectionNames = new Set();
const moduleConstNames = new Set();
for (const statement of statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const decl of statement.declarationList.declarations) {
    const name = decl.name.getText(sf);
    if (name === "labels") continue;
    if (decl.initializer && ts.isStringLiteralLike(decl.initializer)) moduleConstNames.add(name);
    else sectionNames.add(name);
  }
}

const afterComma = pos => { let p = pos; while (/\s/.test(text[p] ?? "")) p++; return text[p] === "," ? p + 1 : pos; };

function chainPath(node) {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) { const base = chainPath(node.expression); return base && [...base, node.name.text]; }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) { const base = chainPath(node.expression); return base && [...base, node.argumentExpression.text]; }
  return null;
}

function collectRefs(expr) {
  const refs = [];
  const visit = node => {
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const chain = chainPath(node);
      if (chain && (sectionNames.has(chain[0]) || moduleConstNames.has(chain[0]))) { refs.push({ start: node.getStart(sf), end: node.getEnd(), path: chain.join(".") }); return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(expr);
  return refs;
}

function buildNode(expr) {
  let assertion = null;
  if (ts.isAsExpression(expr) && expr.type.getText(sf) !== "const") { assertion = expr.type.getText(sf); expr = expr.expression; }
  if (ts.isObjectLiteralExpression(expr)) return { kind: "object", assertion, ...buildChildren(expr, expr.properties, property => {
    if (!ts.isPropertyAssignment(property)) fail(`不支援的屬性寫法：${property.getText(sf).slice(0, 60)}`);
    return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name) ? property.name.text : fail(`不支援的鍵：${property.name.getText(sf)}`);
  }, property => property.initializer) };
  if (ts.isArrayLiteralExpression(expr)) return { kind: "array", assertion, ...buildChildren(expr, expr.elements, (_, index) => String(index), element => element) };
  if (assertion) fail(`型別斷言只支援物件或陣列：${expr.getText(sf).slice(0, 60)}`);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { kind: "leaf", literal: true, text: expr.getText(sf), expr, refs: [] };
  return { kind: "leaf", literal: false, text: expr.getText(sf), expr, refs: collectRefs(expr) };
}

/** 子節點與註解：同一行在前一個子節點之後的註解算「行尾」，其餘算下一個子節點的「前置」；最後一個子節點之後的獨立註解放在容器結尾。 */
function buildChildren(container, elements, keyOf, valueOf) {
  const children = [];
  const closing = [];
  elements.forEach((element, index) => {
    const gapStart = index === 0 ? container.getStart(sf) + 1 : afterComma(elements[index - 1].getEnd());
    const leading = [];
    for (const range of ts.getLeadingCommentRanges(text, gapStart) ?? []) {
      if (index > 0 && lineOf(range.pos) === lineOf(elements[index - 1].getEnd())) children[index - 1].trailing.push(commentText(range));
      else leading.push(commentText(range));
    }
    children.push({ key: keyOf(element, index), node: buildNode(valueOf(element)), leading, trailing: [] });
  });
  if (elements.length) {
    const last = elements[elements.length - 1];
    for (const range of ts.getLeadingCommentRanges(text, afterComma(last.getEnd())) ?? []) {
      if (lineOf(range.pos) === lineOf(last.getEnd())) children[children.length - 1].trailing.push(commentText(range));
      else closing.push(commentText(range));
    }
  }
  return { children, closing };
}

/** 舊區段：{ name, node, form: { annotation, asConst, satisfies }, comments }。 */
const sections = [];
const moduleConsts = [];
const interfaces = [];
let importText = "";
let labelsOrder = [];
for (const [index, statement] of statements.entries()) {
  const comments = index === 0 ? [] : (ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? []).map(commentText);
  if (ts.isImportDeclaration(statement)) { importText = statement.getText(sf); continue; }
  if (ts.isInterfaceDeclaration(statement)) { interfaces.push([...comments, statement.getText(sf)].join("\n")); continue; }
  if (ts.isTypeAliasDeclaration(statement)) continue;
  if (!ts.isVariableStatement(statement)) fail(`不支援的頂層敘述：${statement.getText(sf).slice(0, 60)}`);
  for (const decl of statement.declarationList.declarations) {
    const name = decl.name.getText(sf);
    if (name === "labels") { labelsOrder = decl.initializer.properties.map(property => property.getText(sf)); continue; }
    if (moduleConstNames.has(name)) { moduleConsts.push({ name, text: statement.getText(sf), comments }); continue; }
    let expr = decl.initializer;
    const form = { annotation: decl.type ? decl.type.getText(sf) : null, asConst: false, satisfies: null };
    if (ts.isAsExpression(expr) && expr.type.getText(sf) === "const") { form.asConst = true; expr = expr.expression; }
    else if (ts.isSatisfiesExpression(expr)) { form.satisfies = expr.type.getText(sf); expr = expr.expression; }
    const node = buildNode(expr);
    if (node.kind !== "object") fail(`區段 ${name} 不是物件`);
    sections.push({ name, node, form, comments });
  }
}
if (labelsOrder.length !== sections.length) fail(`labels 匯出 ${labelsOrder.length} 個區段，檔案宣告 ${sections.length} 個`);

// 剪掉 V3-2c 刪除的葉節點；因此變空的容器一併移除（原本就空的容器保留）。
{
  const pruned = new Set();
  const prune = (node, path) => {
    if (node.kind === "leaf") return !removedPaths.has(path);
    if (!node.children.length) return true;
    node.children = node.children.filter(child => prune(child.node, `${path}.${child.key}`) || (pruned.add(`${path}.${child.key}`), false));
    if (node.kind === "array" && node.children.some((child, i) => child.key !== String(i))) fail(`${path} 是陣列，不能只刪其中幾項`);
    return node.children.length > 0;
  };
  for (const section of sections) if (!prune(section.node, section.name)) fail(`區段 ${section.name} 整個被刪除`);
  const unknown = [...removedPaths].filter(path => !pruned.has(path));
  if (unknown.length) fail(`${REMOVED} 有不是字串葉節點的路徑：${unknown.slice(0, 5).join("、")}`);
}
const isRemoved = path => removedPaths.has(path) || [...removedPaths].some(removed => path.startsWith(`${removed}.`));
const sectionByName = new Map(sections.map(section => [section.name, section]));

/** 葉節點清單（檔案順序）：{ path: string[], node, section, nonConst }。nonConst：原型別是 string（非 as const 或在 Record 斷言內）。 */
const leaves = [];
/** 舊容器：路徑字串 → { node, comments, section, path }。空容器（例如 glossary 的 oldNames: []）另記，搬家時跟著所在的規則走。 */
const oldContainers = new Map();
const emptyContainers = [];
/** 檔案順序：葉節點與空容器的先後，決定新物件內鍵的順序。 */
const fileOrder = new Map();
function collect(node, path, section, nonConst, comments) {
  fileOrder.set(path.join("."), fileOrder.size);
  if (node.kind === "leaf") { leaves.push({ path, node, section, nonConst, comments }); return; }
  oldContainers.set(path.join("."), { node, path, section, comments });
  if (!node.children.length) emptyContainers.push({ path, node, comments });
  const childNonConst = nonConst || Boolean(node.assertion);
  for (const child of node.children) collect(child.node, [...path, child.key], section, childNonConst, { leading: child.leading, trailing: child.trailing });
}
for (const section of sections) collect(section.node, [section.name], section, !section.form.asConst, { leading: section.comments, trailing: [] });
const leafByPath = new Map(leaves.map(leaf => [leaf.path.join("."), leaf]));

// ---------------------------------------------------------------- 2. 快照（執行期的實際字串）

async function runtimeLabels(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: LABELS });
  return import(`data:text/javascript;base64,${Buffer.from(outputText, "utf8").toString("base64")}`);
}
function flatten(node, prefix, out = {}) {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  return out;
}
const oldModule = await runtimeLabels(text);
const snapshot = flatten(oldModule.labels, "");
{
  const parsed = new Set(leafByPath.keys());
  const missing = Object.keys(snapshot).filter(path => !parsed.has(path) && !isRemoved(path));
  const extra = [...parsed].filter(path => !(path in snapshot));
  if (missing.length || extra.length) fail(`解析結果與執行期不一致：缺 ${missing.slice(0, 5).join("、")}；多 ${extra.slice(0, 5).join("、")}`);
}

// ---------------------------------------------------------------- 3. 對照表

const map = JSON.parse(readFileSync(resolve(ROOT, MAP), "utf8"));
const groupNames = map.groups.map(group => group.name);
const groupSet = new Set(groupNames);
const rules = map.rules.map(([from, to], index) => {
  const pattern = from.split(".").map(segment => segment === "*" ? { any: true } : segment.startsWith("{") ? { set: new Set(segment.slice(1, -1).split(",")) } : { literal: segment });
  const wildcards = pattern.filter(segment => !segment.literal).length;
  if (to.split(".").filter(segment => segment === "*").length !== wildcards) fail(`規則 ${from} → ${to} 的萬用字元數不一致`);
  if (!groupSet.has(to.split(".")[0])) fail(`規則 ${from} → ${to} 的目標不在 groups`);
  return { from, to: to.split("."), pattern, wildcards, index, used: 0 };
});
function matchRule(rule, path) {
  if (path.length < rule.pattern.length) return null;
  const captures = [];
  for (const [i, segment] of rule.pattern.entries()) {
    if (segment.literal !== undefined) { if (segment.literal !== path[i]) return null; }
    else if (segment.set && !segment.set.has(path[i])) return null;
    else captures.push(path[i]);
  }
  return captures;
}
function resolveRule(path) {
  let best = null;
  for (const rule of rules) {
    const captures = matchRule(rule, path);
    if (!captures) continue;
    if (!best || rule.pattern.length > best.rule.pattern.length || (rule.pattern.length === best.rule.pattern.length && rule.wildcards < best.rule.wildcards)) best = { rule, captures };
  }
  if (!best) fail(`沒有規則對應 ${path.join(".")}`);
  best.rule.used++;
  const captures = [...best.captures];
  return { rule: best.rule, newPath: [...best.rule.to.map(segment => segment === "*" ? captures.shift() : segment), ...path.slice(best.rule.pattern.length)] };
}
for (const item of [...leaves, ...emptyContainers]) Object.assign(item, resolveRule(item.path));
for (const rule of rules) if (!rule.used) fail(`規則 ${rule.from} 沒有對到任何字串`);
{
  const seen = new Map();
  for (const leaf of leaves) {
    const key = leaf.newPath.join(".");
    if (seen.has(key)) fail(`${leaf.path.join(".")} 與 ${seen.get(key)} 搬到同一個位置 ${key}`);
    seen.set(key, leaf.path.join("."));
  }
  for (const key of seen.keys()) for (let i = 1; i < key.split(".").length; i++) { const prefix = key.split(".").slice(0, i).join("."); if (seen.has(prefix)) fail(`${prefix} 同時是字串與物件`); }
}

// ---------------------------------------------------------------- 4. 新分組（儲存處）

const newObject = () => ({ kind: "object", assertion: null, children: new Map(), leading: [], closing: [], groupComment: null });
const newRoot = newObject();
for (const group of map.groups) newRoot.children.set(group.name, Object.assign(newObject(), { groupComment: group.comment }));
for (const emptyPath of map.empty ?? []) {
  let node = newRoot;
  for (const key of emptyPath.split(".")) { if (!node.children.has(key)) node.children.set(key, newObject()); node = node.children.get(key); }
}
const ordered = [...leaves, ...emptyContainers].sort((a, b) => a.rule.index - b.rule.index || fileOrder.get(a.path.join(".")) - fileOrder.get(b.path.join(".")));
for (const leaf of ordered) {
  let node = newRoot;
  leaf.newPath.forEach((key, i) => {
    if (i === leaf.newPath.length - 1) {
      if (node.children.has(key)) fail(`${leaf.newPath.join(".")} 重複`);
      node.children.set(key, leaf.node.kind === "leaf" ? { kind: "leaf", leaf } : Object.assign(newObject(), { kind: leaf.node.kind, assertion: leaf.node.assertion, leading: [...leaf.comments.leading, ...leaf.comments.trailing] }));
      return;
    }
    if (!node.children.has(key)) node.children.set(key, newObject());
    node = node.children.get(key);
    if (node.kind === "leaf") fail(`${leaf.newPath.slice(0, i + 1).join(".")} 已是字串`);
  });
}
const getNew = path => path.reduce((node, key) => node && node.kind !== "leaf" ? node.children.get(key) : undefined, newRoot);
const newLeavesUnder = node => node.kind === "leaf" ? [node.leaf] : [...node.children.values()].flatMap(newLeavesUnder);
const oldLeavesUnder = path => { const prefix = `${path.join(".")}.`; return leaves.filter(leaf => leaf.path.join(".") === path.join(".") || leaf.path.join(".").startsWith(prefix)); };
const isRecordAnnotation = annotation => annotation === "Record<string, string>";

/** 舊節點（路徑）整棵搬到新位置、且新位置沒有多出其他字串時，回傳新路徑；否則 null。 */
function equivalent(path) {
  const old = oldLeavesUnder(path);
  if (!old.length) return null;
  const suffix0 = old[0].path.slice(path.length);
  const target = old[0].newPath.slice(0, old[0].newPath.length - suffix0.length);
  if (suffix0.length && old[0].newPath.slice(-suffix0.length).join(".") !== suffix0.join(".")) return null;
  if (!old.every(leaf => leaf.newPath.join(".") === [...target, ...leaf.path.slice(path.length)].join("."))) return null;
  const node = getNew(target);
  if (!node) return null;
  const mapped = newLeavesUnder(node);
  if (mapped.length !== old.length || mapped.some((leaf, i) => leaf !== old[i])) return null;
  const oldContainer = oldContainers.get(path.join("."));
  if (Boolean(oldContainer) !== (node.kind !== "leaf")) return null;
  if (oldContainer) {
    if (oldContainer.node.kind !== node.kind) return null;
    const oldAssertion = oldContainer.node.assertion ?? (path.length === 1 && isRecordAnnotation(sectionByName.get(path[0]).form.annotation) ? "Record<string, string>" : null);
    if (oldAssertion !== node.assertion) return null;
  }
  return target;
}

// 容器整棵搬家時，連同陣列種類、Record 斷言與註解一起帶過去（R2「由盤點產生」的 ui 區段註解不保留）。
const droppedComments = [];
for (const [key, container] of oldContainers) {
  const old = oldLeavesUnder(container.path);
  if (!old.length) continue;
  const suffix0 = old[0].path.slice(container.path.length);
  const target = old[0].newPath.slice(0, old[0].newPath.length - suffix0.length);
  const wholesale = old.every(leaf => leaf.newPath.join(".") === [...target, ...leaf.path.slice(container.path.length)].join("."));
  const comments = key === "ui" ? [] : [...container.comments.leading, ...container.comments.trailing];
  if (!wholesale) { if (comments.length || container.node.closing.length) droppedComments.push(`${key}: ${[...comments, ...container.node.closing].join(" ").slice(0, 80)}`); continue; }
  const node = getNew(target);
  node.kind = container.node.kind;
  node.assertion = container.node.assertion ?? (container.path.length === 1 && isRecordAnnotation(container.section.form.annotation) ? "Record<string, string>" : node.assertion);
  node.leading = [...node.leading, ...comments];
  node.closing = [...node.closing, ...container.node.closing];
}
// 第 1 層（新分組）以外，新物件若沒有對應的舊容器，就是一般物件。陣列子節點要連號。
(function checkArrays(node, path) {
  if (node.kind === "leaf") return;
  if (node.kind === "array" && [...node.children.keys()].some((key, i) => key !== String(i))) fail(`${path} 陣列索引不連續`);
  for (const [key, child] of node.children) checkArrays(child, path ? `${path}.${key}` : key);
})(newRoot, "");

// 被其他字串引用的葉節點：提成具名常數，避免同一個分組在初始化時引用自己。
const camel = path => path.join("_").split(/[._]/).map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join("");
const hoisted = new Map(); // 舊路徑 → { name, leaf }
for (const leaf of leaves) for (const ref of leaf.node.refs) {
  if (moduleConstNames.has(ref.path)) continue;
  const target = leafByPath.get(ref.path);
  if (!target) fail(`${leaf.path.join(".")} 引用了不是字串的 ${ref.path}`);
  if (!hoisted.has(ref.path)) hoisted.set(ref.path, { name: camel(target.newPath), leaf: target });
}
const mergedGroups = new Set(groupNames.filter(name => sectionByName.has(name) && oldLeavesUnder([name]).some(leaf => leaf.newPath.join(".") !== leaf.path.join("."))));
const identifierOf = group => mergedGroups.has(group) ? `${group}Store` : group === "exports" ? "exportLabels" : group;
{
  const names = [...hoisted.values()].map(entry => entry.name);
  const taken = new Set([...sectionNames, ...moduleConstNames, ...groupNames.map(identifierOf), "labels", "legacyAliases", "LEGACY_SECTIONS", "LABEL_GROUPS", "LEGACY_PREFIXES"]);
  for (const name of names) if (taken.has(name) || names.indexOf(name) !== names.lastIndexOf(name)) fail(`具名常數 ${name} 重名`);
}
const refExpr = newPath => `${identifierOf(newPath[0])}${newPath.slice(1).map(accessor).join("")}`;

/** 葉節點的值：字串常值原樣；計算值把舊路徑引用改成具名常數。 */
function leafValue(leaf) {
  const entry = hoisted.get(leaf.path.join("."));
  if (entry) return entry.name;
  return leafExpression(leaf);
}
function leafExpression(leaf) {
  if (leaf.node.literal) return leaf.node.text;
  const start = leaf.node.expr.getStart(sf);
  let out = leaf.node.text;
  for (const ref of [...leaf.node.refs].sort((a, b) => b.start - a.start)) {
    if (moduleConstNames.has(ref.path)) continue;
    out = out.slice(0, ref.start - start) + hoisted.get(ref.path).name + out.slice(ref.end - start);
  }
  return out;
}

// ---------------------------------------------------------------- 5. 輸出

const MAX_LINE = 170;
/** alias／展開區只有參照，單行放寬，避免 metrics 這類逐鍵展開拉得太長。 */
const ALIAS_MAX_LINE = 260;
const pad = depth => "  ".repeat(depth);
/** entries：[{ head, value, leading, trailing }]；value 可能多行。 */
function formatContainer(open, close, entries, depth, closing = [], maxLine = MAX_LINE) {
  if (!entries.length && !closing.length) return `${open}${close}`;
  const simple = entries.every(entry => !entry.leading.length && !entry.trailing.length && !entry.value.includes("\n")) && !closing.length;
  if (simple) {
    const line = `${open} ${entries.map(entry => `${entry.head}${entry.value}`).join(", ")} ${close}`;
    if (line.length + depth * 2 <= maxLine) return line;
  }
  const lines = [open];
  for (const entry of entries) {
    for (const comment of entry.leading) lines.push(`${pad(depth + 1)}${comment}`);
    lines.push(`${pad(depth + 1)}${entry.head}${entry.value},${entry.trailing.length ? ` ${entry.trailing.join(" ")}` : ""}`);
  }
  for (const comment of closing) lines.push(`${pad(depth + 1)}${comment}`);
  lines.push(`${pad(depth)}${close}`);
  return lines.join("\n");
}
function emitStorage(node, depth) {
  if (node.kind === "leaf") return leafValue(node.leaf);
  const entries = [...node.children].map(([key, child]) => ({
    head: node.kind === "array" ? "" : `${keyText(key)}: `,
    value: emitStorage(child, depth + 1),
    leading: child.kind === "leaf" ? child.leaf.comments.leading : child.leading,
    trailing: child.kind === "leaf" ? child.leaf.comments.trailing : [],
  }));
  const body = node.kind === "array" ? formatContainer("[", "]", entries, depth, node.closing) : formatContainer("{", "}", entries, depth, node.closing);
  return node.assertion ? `${body} as ${node.assertion}` : body;
}

/** 舊節點的 alias：整棵相同就直接參照新位置；否則逐鍵展開。 */
function emitAlias(path, depth) {
  const target = equivalent(path);
  if (target) return refExpr(target);
  const container = oldContainers.get(path.join("."));
  if (!container) fail(`${path.join(".")} 找不到對應`);
  const entries = container.node.children.map(child => ({ head: container.node.kind === "array" ? "" : `${keyText(child.key)}: `, value: emitAlias([...path, child.key], depth + 1), leading: [], trailing: [] }));
  return container.node.kind === "array" ? formatContainer("[", "]", entries, depth, [], ALIAS_MAX_LINE) : formatContainer("{", "}", entries, depth, [], ALIAS_MAX_LINE);
}
const allIdentity = path => oldLeavesUnder(path).every(leaf => leaf.newPath.join(".") === leaf.path.join("."));
/** 同名分組：展開新分組，再補上舊鍵（舊鍵與新鍵重名但意義不同時中止）。 */
function emitMerge(path, depth) {
  const container = oldContainers.get(path.join("."));
  const entries = [{ head: "...", value: refExpr(path), leading: [], trailing: [] }];
  for (const child of container.node.children) {
    const childPath = [...path, child.key];
    if (allIdentity(childPath)) continue;
    const existing = getNew(childPath);
    if (existing) {
      if (existing.kind === "leaf" || child.node.kind === "leaf") fail(`${childPath.join(".")} 舊鍵與新鍵衝突`);
      entries.push({ head: `${keyText(child.key)}: `, value: emitMerge(childPath, depth + 1), leading: [], trailing: [] });
    } else entries.push({ head: `${keyText(child.key)}: `, value: emitAlias(childPath, depth + 1), leading: [], trailing: [] });
  }
  return formatContainer("{", "}", entries, depth, [], ALIAS_MAX_LINE);
}
function pairsFor(path) {
  const target = equivalent(path);
  if (target) return [[path.join("."), target.join(".")]];
  return oldContainers.get(path.join(".")).node.children.flatMap(child => pairsFor([...path, child.key]));
}

const GROUP_FORMS = { metrics: " satisfies Record<MetricName, MetricUnit>", rules: " satisfies Record<RuleCode, RuleUnit>" };
const LEGACY_MERGE_FORMS = { metrics: " satisfies Record<MetricName, MetricLabel & MetricUnit>", rules: " satisfies Record<RuleCode, RuleLabel & RuleUnit>" };

const out = [];
out.push(
  "// EC ProfitLens — 使用者可見文字的單一來源（繁體中文／台灣電商用語）",
  "// 規格：docs/revamp-v3/01_PRD.md §8.10、docs/revamp-v3/GLOSSARY.md（v2 規格 docs/revamp/03_GLOSSARY_COPY.md 為歷史紀錄）。",
  "// V3-2c 結構（由 scripts/labels-regroup.mjs 依 scripts/labels-regroup.map.json 產生，文字與 V3-2b 逐字相同；沒有引用而刪除的鍵見 verification/revamp-v3/labels-removed-v3-2c.txt）：",
  "//   第 1 部分：被其他字串引用的共用字串（具名常數）；",
  "//   第 2 部分：新分組（頁面 › 區塊 › 元件）。字串常值只寫在這裡；改字、加字都改這一部分；",
  "//   第 3 部分：v2 舊鍵 alias（只放參照，不放字串；V3-10 移除）；",
  "//   第 4 部分：labels 匯出、LABEL_GROUPS／LEGACY_SECTIONS／legacyAliases（給掃描器與 tests/labels-structure.test.ts）。",
  "// 規則：元件、匯出、AI 預覽都從這裡取字；技術代號（L3）只放在 technical／*Technical 鍵或 glossary.aliases 內；模板用 fill() 填值。",
  importText,
  "",
  ...interfaces.flatMap(block => [block, ""]),
  "/** V3-2c 指標單元（PRD §3.2 規則 4、§8.10）：headline＝主名稱，explain＝白話一句，technical＝計算方式（L3）。舊鍵 label／plain／formula／formulaTechnical 是 alias。 */",
  "export interface MetricUnit {",
  "  headline: string;",
  "  short: string;",
  "  explain: string;",
  "  technical: { formula: string; formulaTechnical: string };",
  "}",
  "",
  "/** V3-2c 規則卡單元：title → headline，cause／nextStep → explain.cause／explain.nextStep（分兩行顯示，不合併），caution 不變。 */",
  "export interface RuleUnit {",
  "  headline: string;",
  "  explain: { cause: string; nextStep: string };",
  "  caution: string;",
  "  technical?: Record<string, string>;",
  "}",
  "",
  "// ═════════════════════════════════════════════ 第 1 部分：共用字串（被其他字串引用）",
  "",
);
for (const constant of moduleConsts) out.push(...constant.comments, constant.text);
{
  // 具名常數依引用順序輸出（被引用者在前）。
  const emitted = new Set();
  const emit = entry => {
    if (emitted.has(entry.name)) return;
    for (const ref of entry.leaf.node.refs) if (hoisted.has(ref.path)) emit(hoisted.get(ref.path));
    emitted.add(entry.name);
    out.push(`/** ${entry.leaf.newPath.join(".")}（v2：${entry.leaf.path.join(".")}） */`);
    out.push(`const ${entry.name}${entry.leaf.nonConst ? ": string" : ""} = ${leafExpression(entry.leaf)};`);
  };
  for (const entry of hoisted.values()) emit(entry);
}
out.push("", "// ═════════════════════════════════════════════ 第 2 部分：新分組（儲存處）", "");
for (const group of groupNames) {
  const node = newRoot.children.get(group);
  out.push(`// ── ${group}：${node.groupComment}`);
  out.push(...node.leading);
  out.push(`${mergedGroups.has(group) ? "const" : "export const"} ${identifierOf(group)} = ${emitStorage(Object.assign({}, node, { assertion: null }), 0)}${GROUP_FORMS[group] ?? " as const"};`, "");
}
out.push(
  "// ═════════════════════════════════════════════ 第 3 部分：v2 舊鍵 alias（V3-10 移除）",
  "// 每個值都是指向第 2 部分的參照（整棵子樹相同時直接參照子樹），型別與 V3-2b 相同；不要在這裡寫字串。",
  `// 與新分組同名且鍵沒有改的區段直接就是新分組：${sections.filter(section => groupSet.has(section.name) && !mergedGroups.has(section.name)).map(section => section.name).join("、")}。`,
  "",
);
for (const section of sections) {
  const name = section.name;
  if (groupSet.has(name) && !mergedGroups.has(name)) continue;
  if (mergedGroups.has(name)) {
    out.push(`/** v2 ${name}：展開新分組，再補上舊鍵。 */`);
    out.push(`export const ${name} = ${emitMerge([name], 0)}${LEGACY_MERGE_FORMS[name] ?? " as const"};`);
    continue;
  }
  const expr = emitAlias([name], 0);
  const isRef = !expr.startsWith("{");
  const annotation = section.form.annotation ? `: ${section.form.annotation}` : "";
  const suffix = isRef ? "" : section.form.asConst ? " as const" : section.form.satisfies ? ` satisfies ${section.form.satisfies}` : "";
  out.push(`export const ${name}${annotation} = ${expr}${suffix};`);
}

const pairs = sections.flatMap(section => pairsFor([section.name]));
const legacyOnly = labelsOrder.filter(name => !groupSet.has(name));
out.push(
  "",
  "// ═════════════════════════════════════════════ 第 4 部分：匯出與遷移對照",
  "",
  `export const labels = { ${groupNames.map(group => group === identifierOf(group) || mergedGroups.has(group) ? group : `${group}: ${identifierOf(group)}`).join(", ")}, ${legacyOnly.join(", ")} };`,
  "export type Labels = typeof labels;",
  "",
  "/** 新分組（V3-2c）。掃描器只掃這些分組，略過下面的舊區段與 legacyAliases 指到別處的舊鍵，同一個字串不會算兩次。 */",
  `export const LABEL_GROUPS = [${groupNames.map(name => JSON.stringify(name)).join(", ")}] as const;`,
  "/** v2 的 42 個頂層區段名（V3-10 移除 alias 後刪除）。與新分組同名者（例如 metrics、importWizard）同時是新分組。 */",
  `export const LEGACY_SECTIONS = [${labelsOrder.map(name => JSON.stringify(name)).join(", ")}] as const;`,
  "",
  "/**",
  " * 舊路徑 → 新路徑的前綴對照（產生器輸出；整棵子樹相同時只列子樹）。legacyAliases 由此展開到每個葉節點。",
  " * 每列 [舊的上層, 新的上層, 鍵]：鍵以空白分隔；「舊鍵:新的相對路徑」表示改名或搬到更深一層，只寫一個名字表示同名。",
  " */",
  "const LEGACY_PREFIXES: readonly (readonly [string, string, string])[] = [",
  ...compressPairs(pairs),
  "];",
  "",
  "function expandLegacyPrefixes(): Record<string, string> {",
  "  const out: Record<string, string> = {};",
  "  const get = (path: string): unknown => path.split(\".\").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], labels);",
  "  const walk = (node: unknown, from: string, to: string): void => {",
  "    if (typeof node === \"string\") { out[from] = to; return; }",
  "    for (const [key, value] of Object.entries(node as Record<string, unknown>)) walk(value, `${from}.${key}`, `${to}.${key}`);",
  "  };",
  "  const join = (parent: string, rest: string): string => (parent ? `${parent}.${rest}` : rest);",
  "  for (const [fromParent, toParent, keys] of LEGACY_PREFIXES) for (const entry of keys.split(\" \")) {",
  "    const [key, rest = key] = entry.split(\":\");",
  "    walk(get(join(toParent, rest)), join(fromParent, key), join(toParent, rest));",
  "  }",
  "  return out;",
  "}",
  "",
  "/** v2 舊路徑 → V3-2c 新路徑（每個字串葉節點一筆；舊路徑與新路徑相同者代表沒有搬）。V3-10 移除舊鍵時一起刪除。 */",
  "export const legacyAliases: Readonly<Record<string, string>> = expandLegacyPrefixes();",
  "",
);
/** 舊上層相同、搬到同一個新分組的對照併成一列 [舊上層, 新上層（共同前綴）, "鍵 鍵:新相對路徑 …"]。 */
function compressPairs(list) {
  const split = path => path.split(".");
  const lcp = paths => { const first = split(paths[0]); let n = first.length; for (const path of paths.slice(1)) { const segments = split(path); let i = 0; while (i < n && segments[i] === first[i]) i++; n = i; } return first.slice(0, n); };
  const buckets = new Map();
  for (const [from, to] of list) {
    const parent = split(from).slice(0, -1).join(".");
    const key = `${parent}\u0000${split(to)[0]}`;
    if (!buckets.has(key)) buckets.set(key, { parent, items: [] });
    buckets.get(key).items.push([from, to]);
  }
  return [...buckets.values()].map(bucket => {
    let toParent = lcp(bucket.items.map(item => item[1]));
    if (bucket.items.some(([, to]) => split(to).length <= toParent.length)) toParent = toParent.slice(0, -1);
    const keys = bucket.items.map(([from, to]) => { const key = split(from).at(-1); const rest = split(to).slice(toParent.length).join("."); if (/[ :]/.test(key)) fail(`鍵 ${key} 含空白或冒號`); return rest === key ? key : `${key}:${rest}`; });
    const head = `  [${JSON.stringify(bucket.parent)}, ${JSON.stringify(toParent.join("."))}, `;
    const chunks = [];
    for (const key of keys) { if (!chunks.length || chunks.at(-1).length + key.length + 1 > MAX_LINE - 10) chunks.push(key); else chunks[chunks.length - 1] += ` ${key}`; }
    return `${head}${chunks.map((chunk, i) => JSON.stringify(i < chunks.length - 1 ? `${chunk} ` : chunk)).join(" +\n    ")}],`;
  });
}

const generated = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;

// ---------------------------------------------------------------- 6. 自我檢查：新檔的執行期字串必須與快照逐字相同

const newModule = await runtimeLabels(generated);
for (const [path, value] of Object.entries(snapshot)) {
  if (isRemoved(path)) {
    if (path.split(".").reduce((node, key) => node?.[key], newModule.labels) !== undefined || path in newModule.legacyAliases) fail(`已刪除的 ${path} 還在`);
    continue;
  }
  const actual = path.split(".").reduce((node, key) => node?.[key], newModule.labels);
  if (actual !== value) fail(`舊路徑 ${path} 不同：${JSON.stringify(actual)} ≠ ${JSON.stringify(value)}`);
  const target = newModule.legacyAliases[path];
  const viaAlias = target?.split(".").reduce((node, key) => node?.[key], newModule.labels);
  if (viaAlias !== value) fail(`legacyAliases ${path} → ${target} 不同`);
}
const keptLeaves = Object.keys(snapshot).filter(path => !isRemoved(path)).length;
if (Object.keys(newModule.legacyAliases).length !== keptLeaves) fail(`legacyAliases 筆數 ${Object.keys(newModule.legacyAliases).length} ≠ 快照扣掉已刪除 ${keptLeaves}`);

const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
const stats = {
  base: baseRev,
  sectionsBefore: sections.length,
  leavesBefore: Object.keys(snapshot).length,
  removedLeaves: Object.keys(snapshot).length - keptLeaves,
  storageLeaves: newLeavesUnder(newRoot).length,
  groups: groupNames.length,
  mergedGroups: [...mergedGroups],
  identityGroups: sections.filter(section => groupSet.has(section.name) && !mergedGroups.has(section.name)).map(section => section.name),
  aliasLeaves: Object.entries(newModule.legacyAliases).filter(([from, to]) => from !== to).length,
  identityLeaves: Object.entries(newModule.legacyAliases).filter(([from, to]) => from === to).length,
  prefixPairs: pairs.length,
  hoisted: hoisted.size,
  linesBefore: text.split("\n").length,
  linesAfter: generated.split("\n").length,
  droppedContainerComments: droppedComments,
};
if (checkOnly) {
  const current = readFileSync(resolve(ROOT, LABELS), "utf8");
  const snapshotCurrent = readFileSync(resolve(ROOT, SNAPSHOT), "utf8");
  if (current !== generated || snapshotCurrent !== snapshotText) fail("產生結果與目前檔案不同（請重跑 node scripts/labels-regroup.mjs）");
  console.log("labels-regroup：目前檔案與產生結果相同。");
} else {
  writeFileSync(resolve(ROOT, LABELS), generated);
  writeFileSync(resolve(ROOT, SNAPSHOT), snapshotText);
  console.log(JSON.stringify(stats, null, 2));
}
