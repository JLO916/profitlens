// V3-0 靜態掃描核心（PRD §2.3 B、§5.2、§5.4、§11.7）。
// scripts/ui-audit.mjs 與 tests/design-lint.test.ts 共用本模組，兩邊的數字一定一致。
// 只用 Node 內建模組與既有 devDependency「typescript」（用來正確切出 JSX 文字節點；不新增依賴）。
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

/** 掃描範圍：globals.css（拆成 :root token 定義區與其餘規則）、src/components 下所有 .tsx 與 .css（含 CSS module）。 */
export const SCAN_SCOPE = { globalsCss: "src/app/globals.css", componentsDir: "src/components" };

/**
 * X4 的功能性 rotate 例外清單（明確列出，其餘 rotate( 一律算裝飾性）：
 * - keyframes：spinner 的 `@keyframes spin`（globals.css:200）。
 * - selectors：disclosure／chevron 展開指示；規則的選擇器「結尾」符合下列樣式才豁免。
 */
export const ROTATE_EXEMPT = {
  keyframes: ["spin"],
  selectors: [/\.diagnosis-summary::before$/],
};

/** X8 巢狀卡片：祖先為 .panel，後代複合選擇器含 .panel、[class*=card] 或名稱含 card 的 class（看板卡 .board-card 例外）。 */
export const NESTED_CARD_EXEMPT_CLASSES = ["board-card"];

/** 允許的 box-shadow 值（V3-1 起的 overlay token）；`none` 不算陰影。 */
export const BOX_SHADOW_ALLOWED = ["none", "var(--shadow-overlay)"];

/** inherit 等 CSS 全域關鍵字不是一種「值」，不計入相異圓角與字級。 */
const CSS_WIDE_KEYWORDS = ["inherit", "initial", "unset", "revert", "revert-layer"];
const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const ARROW_RE = /[→↗▸▾]/;
const DECORATIVE_CHAR_RE = /[①-⑳★☆ⓘ●]/;
const ALL_CAPS_RE = /^[A-Z ]{4,}$/;
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;

// ---------------------------------------------------------------- CSS

/** 去除註解後切出規則：{ selector, context: 外層 at-rule 序列, declarations: [{ prop, value }] }。不支援 CSS nesting（專案未使用）。 */
export function parseCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let i = 0;
  const readBody = () => {
    let depth = 1, body = "";
    while (i < src.length && depth > 0) {
      const ch = src[i++];
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) break; }
      body += ch;
    }
    return body;
  };
  const parseDeclarations = body => body.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const colon = part.indexOf(":");
    if (colon < 0) return null;
    return { prop: part.slice(0, colon).trim().toLowerCase(), value: part.slice(colon + 1).replace(/!important/i, "").replace(/\s+/g, " ").trim() };
  }).filter(Boolean);
  const parseBlock = context => {
    let buffer = "";
    while (i < src.length) {
      const ch = src[i++];
      if (ch === "{") {
        const prelude = buffer.replace(/\s+/g, " ").trim();
        buffer = "";
        if (/^@(?:-[\w]+-)?keyframes\b/i.test(prelude) || /^@(media|supports|layer|container|document)\b/i.test(prelude)) parseBlock([...context, prelude]);
        else rules.push({ selector: prelude, context, declarations: parseDeclarations(readBody()) });
      } else if (ch === "}") return;
      else if (ch === ";") buffer = "";
      else buffer += ch;
    }
  };
  parseBlock([]);
  return rules;
}

/** 以頂層逗號切開選擇器清單（不切括號內的逗號）。 */
export function splitSelectors(selector) {
  const parts = [];
  let depth = 0, current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const inKeyframes = rule => rule.context.find(prelude => /^@(?:-[\w]+-)?keyframes\b/i.test(prelude));
const keyframesName = prelude => prelude.replace(/^@(?:-[\w]+-)?keyframes\s+/i, "").trim();
const isTokenDeclaration = (rule, decl) => decl.prop.startsWith("--") && splitSelectors(rule.selector).every(part => part === ":root");
const compounds = selector => selector.replace(/\s*([>+~])\s*/g, " ").split(/\s+/).filter(Boolean);
const classNamesOf = text => [...text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(match => match[1]);

function isNestedCardSelector(selector) {
  const parts = compounds(selector);
  const panelIndex = parts.findIndex(part => classNamesOf(part).includes("panel"));
  if (panelIndex < 0) return false;
  return parts.slice(panelIndex + 1).some(part => {
    const names = classNamesOf(part).filter(name => !NESTED_CARD_EXEMPT_CLASSES.includes(name));
    return names.includes("panel") || names.some(name => /card/i.test(name)) || /\[class\*=["']?card/i.test(part);
  });
}

/** 掃描單一 CSS 檔；回傳原始觀察值，彙總由 scanUi 負責。 */
export function scanCssText(text, file) {
  const result = { tokenHex: [], hex: [], borderRadius: [], fontSize: [], letterSpacing: [], rotate: [], buttonRowCentered: [], nestedCard: [], linearGradient: [], boxShadow: [], decorativeContent: [], classNames: [] };
  for (const rule of parseCss(text)) {
    const keyframes = inKeyframes(rule);
    if (!keyframes) for (const part of splitSelectors(rule.selector)) {
      for (const name of classNamesOf(part.replace(/\[[^\]]*\]/g, ""))) result.classNames.push(name);
      if (isNestedCardSelector(part)) result.nestedCard.push(`${file}: ${part}`);
    }
    for (const decl of rule.declarations) {
      const where = `${file}: ${rule.selector} { ${decl.prop}: ${decl.value} }`;
      const hexes = (decl.value.match(HEX_RE) ?? []).map(hex => hex.toLowerCase());
      if (isTokenDeclaration(rule, decl)) { result.tokenHex.push(...hexes); continue; }
      result.hex.push(...hexes.map(hex => ({ hex, where })));
      const print = rule.context.some(prelude => /\bprint\b/i.test(prelude));
      if (/^border(-(top|bottom)-(left|right))?-radius$/.test(decl.prop) && !CSS_WIDE_KEYWORDS.includes(decl.value)) result.borderRadius.push({ value: decl.value, where, print });
      if (decl.prop === "font-size" && !CSS_WIDE_KEYWORDS.includes(decl.value)) result.fontSize.push({ value: decl.value, where, print });
      if (decl.prop === "letter-spacing" && !/^(0(px|em|rem)?|normal)$/.test(decl.value)) result.letterSpacing.push(where);
      for (let n = (decl.value.match(/rotate\(/g) ?? []).length; n > 0; n--) {
        const exempt = (keyframes && ROTATE_EXEMPT.keyframes.includes(keyframesName(keyframes))) || splitSelectors(rule.selector).every(part => ROTATE_EXEMPT.selectors.some(pattern => pattern.test(part)));
        if (!exempt) result.rotate.push(where);
      }
      if (decl.prop === "justify-content" && decl.value === "center" && splitSelectors(rule.selector).some(part => classNamesOf(compounds(part).at(-1) ?? "").includes("button-row"))) result.buttonRowCentered.push(where);
      for (let n = (decl.value.match(/linear-gradient\(/g) ?? []).length; n > 0; n--) result.linearGradient.push(where);
      if (decl.prop === "box-shadow" && !BOX_SHADOW_ALLOWED.includes(decl.value)) result.boxShadow.push(where);
      if (decl.prop === "content" && (ARROW_RE.test(decl.value) || DECORATIVE_CHAR_RE.test(decl.value))) result.decorativeContent.push(where);
    }
  }
  return result;
}

// ---------------------------------------------------------------- TSX

const STYLE_PROPS = { fontSize: "fontSize", borderRadius: "borderRadius", letterSpacing: "letterSpacing", boxShadow: "boxShadow" };
const pxValue = node => ts.isNumericLiteral(node) ? `${node.text}px` : ts.isStringLiteralLike(node) ? node.text.trim() : null;

/** 掃描單一 .tsx；用 TypeScript AST 取 JSX 文字節點與字串常值（註解自然排除）。 */
export function scanTsxText(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = { hex: [], fontSize: [], borderRadius: [], letterSpacing: [], rotate: [], linearGradient: [], boxShadow: [], jsxArrow: [], jsxAllCaps: [], jsxDecorative: [], jsxCjk: [], cjkLiterals: [], staticTestIds: [], dynamicTestIds: [], staticTestIdProps: [] };
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const jsxText = (node, value) => {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const where = `${file}:${line(node)} ${JSON.stringify(trimmed.slice(0, 60))}`;
    if (ARROW_RE.test(trimmed)) result.jsxArrow.push(where);
    if (ALL_CAPS_RE.test(trimmed)) result.jsxAllCaps.push(where);
    if (DECORATIVE_CHAR_RE.test(trimmed)) result.jsxDecorative.push(where);
    if (CJK_RE.test(trimmed)) result.jsxCjk.push(where);
  };
  const literalText = node => {
    const value = node.text;
    const where = `${file}:${line(node)} ${JSON.stringify(value.slice(0, 60))}`;
    for (const hex of value.match(HEX_RE) ?? []) result.hex.push({ hex: hex.toLowerCase(), where });
    for (let n = (value.match(/rotate\(/g) ?? []).length; n > 0; n--) result.rotate.push(where);
    for (let n = (value.match(/linear-gradient\(/g) ?? []).length; n > 0; n--) result.linearGradient.push(where);
    if (CJK_RE.test(value)) result.cjkLiterals.push(where);
  };
  const testIdValue = initializer => {
    if (!initializer) return null;
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) return initializer.expression.text;
    return undefined;
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) jsxText(node, node.text);
    else if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) jsxText(node, node.expression.text);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (!(ts.isLiteralTypeNode(node.parent))) literalText(node);
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (name === "data-testid") {
        const value = testIdValue(node.initializer);
        if (typeof value === "string") result.staticTestIds.push(value); else result.dynamicTestIds.push(`${file}:${line(node)}`);
      }
      if (name === "testId") { const value = testIdValue(node.initializer); if (typeof value === "string") result.staticTestIdProps.push(value); }
      if (name in STYLE_PROPS && node.initializer) {
        const expr = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        const value = expr && pxValue(expr);
        if (value) result[STYLE_PROPS[name]].push({ value, where: `${file}:${line(node)} ${name}=${value}` });
      }
    }
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text in STYLE_PROPS) {
      const key = STYLE_PROPS[node.name.text];
      const value = pxValue(node.initializer);
      if (value) {
        const entry = { value, where: `${file}:${line(node)} ${node.name.text}: ${value}` };
        if (key === "letterSpacing") { if (!/^(0(px|em|rem)?|normal)$/.test(value)) result.letterSpacing.push(entry.where); }
        else if (key === "boxShadow") { if (!BOX_SHADOW_ALLOWED.includes(value)) result.boxShadow.push(entry.where); }
        else result[key].push(entry);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

// ---------------------------------------------------------------- 彙總

function listFiles(dir, extension) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith(extension)).sort().map(name => join(dir, name));
}

const distinct = values => [...new Set(values)].sort();

/**
 * 掃描整個範圍。metrics 為棘輪指標（越低越好，design-lint 逐項比上限）；info 為只記錄、不設上限的數字。
 * @param {{ root?: string }} [options]
 */
export function scanUi({ root = process.cwd() } = {}) {
  const abs = path => resolve(root, path);
  const rel = path => relative(root, path);
  const globals = scanCssText(readFileSync(abs(SCAN_SCOPE.globalsCss), "utf8"), SCAN_SCOPE.globalsCss);
  const componentDir = abs(SCAN_SCOPE.componentsDir);
  const moduleCss = listFiles(componentDir, ".css").map(file => scanCssText(readFileSync(file, "utf8"), rel(file)));
  const tsx = listFiles(componentDir, ".tsx").map(file => scanTsxText(readFileSync(file, "utf8"), rel(file)));
  const css = [globals, ...moduleCss];
  const all = [...css, ...tsx];
  const collect = key => all.flatMap(part => part[key] ?? []);

  const hexEntries = collect("hex");
  const hexOutsideRoot = distinct(hexEntries.map(entry => entry.hex));
  const borderRadius = distinct(collect("borderRadius").map(entry => entry.value));
  const fontSize = distinct(collect("fontSize").map(entry => entry.value));
  const staticTestIds = distinct(tsx.flatMap(part => part.staticTestIds));

  const metrics = {
    hexOutsideRoot: hexOutsideRoot.length,
    borderRadiusValues: borderRadius.length,
    fontSizeValues: fontSize.length,
    letterSpacingNonZero: collect("letterSpacing").length,
    decorativeRotate: collect("rotate").length,
    jsxArrowTextNodes: collect("jsxArrow").length,
    jsxAllCapsEyebrow: collect("jsxAllCaps").length,
    jsxDecorativeChars: collect("jsxDecorative").length,
    cssDecorativeContent: collect("decorativeContent").length,
    buttonRowCentered: collect("buttonRowCentered").length,
    nestedCardSelectors: collect("nestedCard").length,
    linearGradient: collect("linearGradient").length,
    boxShadow: collect("boxShadow").length,
    jsxCjkTextNodes: collect("jsxCjk").length,
    cjkStringLiterals: collect("cjkLiterals").length,
  };
  const info = {
    hexGlobalsCss: distinct(globals.hex.map(entry => entry.hex)).length,
    hexComponentCss: distinct(moduleCss.flatMap(part => part.hex.map(entry => entry.hex))).length,
    hexTsx: distinct(tsx.flatMap(part => part.hex.map(entry => entry.hex))).length,
    tokenHexDistinct: distinct(globals.tokenHex).length,
    borderRadiusValuesExcludingPrint: distinct(collect("borderRadius").filter(entry => !entry.print).map(entry => entry.value)).length,
    fontSizeValuesExcludingPrint: distinct(collect("fontSize").filter(entry => !entry.print).map(entry => entry.value)).length,
    staticTestIdsDistinct: staticTestIds.length,
    staticTestIdOccurrences: tsx.reduce((sum, part) => sum + part.staticTestIds.length, 0),
    dynamicTestIdAttributes: tsx.reduce((sum, part) => sum + part.dynamicTestIds.length, 0),
    staticTestIdProps: distinct(tsx.flatMap(part => part.staticTestIdProps)).length,
    classSelectorsDistinct: distinct(css.flatMap(part => part.classNames)).length,
    filesScanned: { css: css.length, tsx: tsx.length },
  };
  const details = {
    hexOutsideRoot, borderRadius, fontSize, staticTestIds,
    letterSpacing: collect("letterSpacing"), decorativeRotate: collect("rotate"), jsxArrow: collect("jsxArrow"), jsxAllCaps: collect("jsxAllCaps"), jsxDecorative: collect("jsxDecorative"),
    cssDecorativeContent: collect("decorativeContent"), buttonRowCentered: collect("buttonRowCentered"), nestedCard: collect("nestedCard"), linearGradient: collect("linearGradient"), boxShadow: collect("boxShadow"),
    jsxCjk: collect("jsxCjk"), cjkLiterals: collect("cjkLiterals"),
  };
  return { metrics, info, details };
}
