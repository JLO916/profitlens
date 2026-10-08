// V4-0a chart-lint 掃描核心（PRD §7.9 CL-1 到 CL-11、§4.7 testid 命名；06_BATCHES V4-0a 第 5 項）。
// tests/chart-lint.test.ts 使用本模組。AST 的作法沿用 scripts/lib/ui-scan.mjs：只用 Node 內建模組與既有 devDependency「typescript」，不新增依賴；
// ui-scan.mjs 的 SCAN_SCOPE 不改，本檔有自己的掃描範圍。掃描分兩種：
// （1）AST（scanChartSource）：CL-2 的樣板索引、CL-3 到 CL-8、CL-10 掃 src/components/charts/** 與 src/components/overview/charts/**（.ts、.tsx）；
//      CL-3 的 `var(--chart-` 字串常值禁令擴到整個 src/components/**（大多數圖的色與 testid 在呼叫端組出來）。
// （2）SSR（checkChartMarkup）：CL-1、CL-2、CL-9、CL-11 檢查 renderToStaticMarkup 的 markup；頁面狀態來自 tests/helpers/page-states.tsx。
// 每條違規是一個字串（`檔案:行 說明` 或 `頁面：元素 說明`）；同一條違規在多個頁面狀態出現時只算一次（由呼叫端以字串去重）。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import ts from "typescript";

export const CHART_LINT_RULES = ["CL-1", "CL-2", "CL-3", "CL-4", "CL-5", "CL-6", "CL-7", "CL-8", "CL-9", "CL-10", "CL-11"];
/** AST 掃的規則（CL-2 只有「樣板不得用 ${i}、${index}」這一半）與 SSR 掃的規則。 */
export const AST_RULES = ["CL-2", "CL-3", "CL-4", "CL-5", "CL-6", "CL-7", "CL-8", "CL-10"];
export const SSR_RULES = ["CL-1", "CL-2", "CL-9", "CL-11"];

/** 掃描範圍：圖表元件兩個目錄（AST 規則）；`var(--chart-` 禁令的範圍；找 next/dynamic 載入點的範圍。 */
export const CHART_SCAN_SCOPE = { chartDirs: ["src/components/charts", "src/components/overview/charts"], componentsDir: "src/components", sourceDir: "src" };

/** §4.7 命名：區塊 chart-{page}-{id}；柱、點、段、格、sparkline chart-{page}-{id}-{bar|point|seg|cell|spark}-{語意 key}；資料表 chart-{page}-{id}-table。 */
export const CHART_PAGES = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "import", "evidence"];
export const CHART_PARTS = ["bar", "point", "seg", "cell", "spark"];
export const CHART_TESTID_RE = new RegExp(`^chart-(?:${CHART_PAGES.join("|")})-[a-z][a-z0-9]*(?:-table|-(?:${CHART_PARTS.join("|")})-([^\\s"]+))?$`);
/** CL-2 白名單：既有 12 個圖表 testid（§4.7）與 kpi-target-*；這些放在圖的固定高容器內也不必以 chart- 開頭。 */
export const LEGACY_CHART_TESTIDS = ["bridge-section", "bridge-waterfall", "bridge-table", "bridge-balance-check", "profit-waterfall", "profit-waterfall-scope", "trend", "trend-legend-yoy", "trend-yoy-note", "trend-events", "channel-mix"];
export const LEGACY_CHART_TESTID_PREFIXES = ["profit-waterfall-bar-", "kpi-target-"];
export const isLegacyChartTestId = id => LEGACY_CHART_TESTIDS.includes(id) || LEGACY_CHART_TESTID_PREFIXES.some(prefix => id.startsWith(prefix));

/** CL-6：以完整名稱比對的禁用 import（ReferenceArea 允許）；Scatter、ScatterChart 只允許在以 next/dynamic 載入的 *-lazy.tsx。 */
export const BANNED_CHART_IMPORTS = ["Treemap", "SunburstChart", "Sankey", "Funnel", "FunnelChart", "Pie", "PieChart", "Radar", "RadarChart", "RadialBar", "RadialBarChart", "Area", "AreaChart", "Brush"];
export const LAZY_ONLY_IMPORTS = ["Scatter", "ScatterChart"];
/** CL-4 的 Recharts 系列元件（每個都要 isAnimationActive={false}）；圖的根元素是 recharts 匯出、名稱以 Chart 結尾的元件。 */
export const RECHARTS_SERIES = ["Line", "Bar", "Area", "Scatter", "Pie", "Radar", "RadialBar", "Funnel"];
/** CL-9：每頁主層（<details> 外、沒有 hidden 祖先）的 section.chart-section 上限；總覽 4（v3 既有 G1–G4）。 */
export const CHART_SECTION_LIMITS = { overview: 4 };
export const DEFAULT_CHART_SECTION_LIMIT = 3;
/** CL-11：testid 含這些片段的元素（以及帶 data-chart-kind 的元素）本身或祖先要 aria-hidden="true"。 */
export const ARIA_HIDDEN_FRAGMENTS = ["-bar-", "-spark-", "-seg-", "-point-"];

const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const GRADIENT_RE = /(?:linear|radial|conic)-gradient\(/;
const BANNED_SVG_TAGS = ["linearGradient", "radialGradient", "filter", "pattern"];

// ---------------------------------------------------------------- AST

const unwrap = node => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
};
const isJsxElementLike = node => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
const openingOf = node => ts.isJsxElement(node) ? node.openingElement : node;
const attributesOf = node => openingOf(node).attributes.properties;
const findAttr = (node, name) => attributesOf(node).find(attr => ts.isJsxAttribute(attr) && attr.name.getText() === name) ?? null;
/** JSX 屬性值：沒有值（布林屬性）為 true；字串、true／false、數字常值回傳值；其他運算式回傳 undefined（動態）。 */
function attrLiteral(attr) {
  if (!attr) return null;
  const init = attr.initializer;
  if (!init) return true;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const expr = unwrap(init.expression);
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isStringLiteralLike(expr)) return expr.text;
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
  }
  return undefined;
}
const attrExpression = attr => attr?.initializer && ts.isJsxExpression(attr.initializer) ? unwrap(attr.initializer.expression) : null;
/** className 裡所有字串片段（字串常值、樣板的固定部分、運算式內的字串常值）。 */
function classText(node) {
  const attr = findAttr(node, "className");
  if (!attr?.initializer) return "";
  const parts = [];
  const visit = child => {
    if (ts.isStringLiteralLike(child)) parts.push(child.text);
    else if (ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child)) parts.push(child.text);
    ts.forEachChild(child, visit);
  };
  if (ts.isStringLiteral(attr.initializer)) parts.push(attr.initializer.text); else visit(attr.initializer);
  return parts.join(" ");
}
/** node 之下（不含 node）所有 JSX 元素。 */
function jsxDescendants(node) {
  const out = [];
  const visit = child => { if (isJsxElementLike(child)) out.push(child); ts.forEachChild(child, visit); };
  ts.forEachChild(node, visit);
  return out;
}

/**
 * 掃描圖表目錄內的單一檔案（CL-2 樣板索引、CL-3 色與漸層、CL-4、CL-5、CL-6、CL-7、CL-8、CL-10）。
 * @param {string} text 原始碼
 * @param {string} file 相對路徑（違規訊息用；CL-6 依檔名判斷 *-lazy.tsx）
 * @param {{ lazyLoaded?: Set<string> }} [options] lazyLoaded：src 內以 next/dynamic 載入、且沒有被靜態 import 的模組檔名（不含副檔名）
 */
export function scanChartTsx(text, file, { lazyLoaded = new Set() } = {}) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  const result = Object.fromEntries(AST_RULES.map(rule => [rule, []]));
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const at = (node, message) => `${file}:${line(node)} ${message}`;

  // recharts 的匯入：本地名稱對應匯出名稱；命名空間匯入的本地名稱。
  const recharts = new Map(), rechartsNamespaces = new Set();
  // 同檔的變數宣告（名稱對應初始值），給 CL-4 的 spread 與 CL-10 的高度運算式追值。
  const declarations = new Map();
  const collect = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause && !node.importClause.isTypeOnly) {
      const bindings = node.importClause.namedBindings;
      const fromRecharts = node.moduleSpecifier.text === "recharts";
      if (bindings && ts.isNamespaceImport(bindings) && fromRecharts) rechartsNamespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const imported = (element.propertyName ?? element.name).text;
        if (fromRecharts) recharts.set(element.name.text, imported);
        // CL-6：以完整名稱比對（不用前綴，ReferenceArea 不受影響）。
        if (BANNED_CHART_IMPORTS.includes(imported)) result["CL-6"].push(at(element, `禁止 import ${imported}`));
        if (LAZY_ONLY_IMPORTS.includes(imported)) {
          const stem = basename(file).replace(/\.[^.]+$/, "");
          if (!/-lazy$/.test(stem) || !lazyLoaded.has(stem)) result["CL-6"].push(at(element, `${imported} 只能在以 next/dynamic 載入的 *-lazy.tsx 使用`));
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(source);

  /** JSX 標籤對應的 recharts 匯出名稱（不是 recharts 元件時回傳 null）。 */
  const rechartsName = node => {
    const tag = openingOf(node).tagName;
    if (ts.isIdentifier(tag)) return recharts.get(tag.text) ?? null;
    if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && rechartsNamespaces.has(tag.expression.text)) return tag.name.text;
    return null;
  };
  const tagText = node => openingOf(node).tagName.getText(source);
  const isChartRoot = node => /Chart$/.test(rechartsName(node) ?? "");
  /** CL-4：屬性或同檔物件常值的 spread（例如 {...YOY_LINE}）帶 isAnimationActive: false。 */
  const animationOff = node => {
    if (attrLiteral(findAttr(node, "isAnimationActive")) === false) return true;
    return attributesOf(node).some(attr => {
      if (!ts.isJsxSpreadAttribute(attr)) return false;
      let expr = unwrap(attr.expression);
      if (ts.isIdentifier(expr)) expr = unwrap(declarations.get(expr.text));
      return !!expr && ts.isObjectLiteralExpression(expr) && expr.properties.some(prop => ts.isPropertyAssignment(prop) && prop.name.getText(source) === "isAnimationActive" && unwrap(prop.initializer).kind === ts.SyntaxKind.FalseKeyword);
    });
  };

  /**
   * CL-10：高度運算式只能由 chartHeights／chartRowHeights 組成（整數倍或其和），不得出現數字常值；
   * 唯一的數字常值例外是 `chartHeights.x * N`（固定高的整數倍）。識別字先追同檔的變數宣告，追不到（props 等）視為傳入值、不判。
   */
  const heightProblems = (expr, seen = new Set()) => {
    expr = unwrap(expr);
    if (!expr) return [];
    if (ts.isIdentifier(expr)) {
      if (seen.has(expr.text) || !declarations.has(expr.text)) return [];
      return heightProblems(declarations.get(expr.text), new Set([...seen, expr.text]));
    }
    if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) return [];
    if (ts.isNumericLiteral(expr)) return [`數字常值 ${expr.text}`];
    if (ts.isConditionalExpression(expr)) return [...heightProblems(expr.whenTrue, seen), ...heightProblems(expr.whenFalse, seen)];
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (op === ts.SyntaxKind.AsteriskToken) {
        const [left, right] = [unwrap(expr.left), unwrap(expr.right)];
        const integerTimesHeights = (literal, other) => ts.isNumericLiteral(literal) && Number.isInteger(Number(literal.text)) && /\bchartHeights\b/.test(other.getText(source));
        if (integerTimesHeights(left, right)) return heightProblems(right, seen);
        if (integerTimesHeights(right, left)) return heightProblems(left, seen);
        return [...heightProblems(left, seen), ...heightProblems(right, seen)];
      }
      if (op === ts.SyntaxKind.PlusToken) return [...heightProblems(expr.left, seen), ...heightProblems(expr.right, seen)];
      return [`運算子 ${expr.operatorToken.getText(source)}（只允許整數倍或其和）`];
    }
    if (ts.isCallExpression(expr)) {
      const literals = [];
      const visit = child => { if (ts.isNumericLiteral(child)) literals.push(child.text); ts.forEachChild(child, visit); };
      visit(expr);
      return literals.map(text => `數字常值 ${text}`);
    }
    return [`不支援的高度寫法 ${expr.getText(source).slice(0, 40)}`];
  };
  const checkHeight = (node, expr, what) => { for (const problem of heightProblems(expr)) result["CL-10"].push(at(node, `${what}：${problem}`)); };
  /** style={{ height }}／style={{ height: … }} 的高度運算式。 */
  const styleHeight = node => {
    const style = attrExpression(findAttr(node, "style"));
    if (!style || !ts.isObjectLiteralExpression(style)) return null;
    for (const prop of style.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name.getText(source) === "height") return prop.initializer;
      if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === "height") return prop.name;
    }
    return null;
  };
  const heightAttr = (node, allowPercent) => {
    const attr = findAttr(node, "height");
    if (!attr?.initializer) return;
    if (ts.isStringLiteral(attr.initializer)) { if (!(allowPercent && attr.initializer.text === "100%")) result["CL-10"].push(at(node, `${tagText(node)} height="${attr.initializer.text}"`)); return; }
    const expr = attrExpression(attr);
    if (expr && ts.isStringLiteralLike(expr)) { if (!(allowPercent && expr.text === "100%")) result["CL-10"].push(at(node, `${tagText(node)} height="${expr.text}"`)); return; }
    checkHeight(node, expr, `${tagText(node)} height`);
  };

  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    // CL-3：hex 與 CSS 漸層（字串常值、樣板片段）。
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (!ts.isLiteralTypeNode(node.parent)) {
        for (const hex of node.text.match(HEX_RE) ?? []) result["CL-3"].push(at(node, `hex ${hex.toLowerCase()}`));
        if (GRADIENT_RE.test(node.text)) result["CL-3"].push(at(node, `漸層 ${JSON.stringify(node.text.slice(0, 40))}`));
      }
    }
    // CL-2（AST 半）：樣板內出現 ${i}、${index}（陣列索引）。
    if (ts.isTemplateSpan(node) && ts.isIdentifier(unwrap(node.expression)) && ["i", "index"].includes(unwrap(node.expression).text)) result["CL-2"].push(at(node, `樣板使用 \${${unwrap(node.expression).text}}`));
    // CL-5：fontSize 只能是 chartFontSize（JSX 屬性與物件屬性）。
    const fontSize = ts.isJsxAttribute(node) && node.name.getText(source) === "fontSize" ? (node.initializer ? (ts.isStringLiteral(node.initializer) ? node.initializer : attrExpression(node)) : null)
      : ts.isPropertyAssignment(node) && node.name.getText(source) === "fontSize" ? unwrap(node.initializer)
        : ts.isShorthandPropertyAssignment(node) && node.name.text === "fontSize" ? node.name : null;
    if (fontSize && !(ts.isIdentifier(fontSize) && fontSize.text === "chartFontSize") && !(ts.isPropertyAccessExpression(fontSize) && fontSize.name.text === "chartFontSize")) result["CL-5"].push(at(node, `fontSize ${fontSize.getText(source).slice(0, 30)}`));

    if (isJsxElementLike(node)) {
      const tag = tagText(node);
      const name = rechartsName(node);
      // CL-3：SVG 漸層、濾鏡、圖樣。
      if (BANNED_SVG_TAGS.includes(tag)) result["CL-3"].push(at(node, `<${tag}>`));
      // CL-4：根元素 accessibilityLayer={false}；系列 isAnimationActive={false}；ResponsiveContainer 有 initialDimension。
      if (isChartRoot(node) && attrLiteral(findAttr(node, "accessibilityLayer")) !== false) result["CL-4"].push(at(node, `<${tag}> 缺 accessibilityLayer={false}`));
      if (name && RECHARTS_SERIES.includes(name) && !animationOff(node)) result["CL-4"].push(at(node, `<${tag}> 缺 isAnimationActive={false}`));
      if (name === "ResponsiveContainer") {
        const dimension = findAttr(node, "initialDimension");
        if (!dimension) result["CL-4"].push(at(node, "<ResponsiveContainer> 缺 initialDimension"));
        const value = attrExpression(dimension);
        if (value && ts.isObjectLiteralExpression(value)) for (const prop of value.properties) if (ts.isPropertyAssignment(prop) && prop.name.getText(source) === "height") checkHeight(node, prop.initializer, "initialDimension.height");
        heightAttr(node, true);
      }
      // CL-7：aria-hidden 容器（含自己）內不得有 tabIndex、onKeyDown、<a>、<button>。
      const hidden = findAttr(node, "aria-hidden");
      if (hidden && attrLiteral(hidden) !== false && attrLiteral(hidden) !== "false") {
        for (const inner of [node, ...jsxDescendants(node)]) {
          const innerTag = tagText(inner);
          if (innerTag === "a" || innerTag === "button") result["CL-7"].push(at(inner, `aria-hidden 容器內有 <${innerTag}>`));
          for (const forbidden of ["tabIndex", "onKeyDown"]) if (findAttr(inner, forbidden)) result["CL-7"].push(at(inner, `aria-hidden 容器內有 ${forbidden}`));
        }
      }
      // CL-8：每個 Recharts 圖的數值軸 ≤ 1（橫向版面數 YAxis 非 category；layout="vertical" 數 XAxis type="number"）。
      if (isChartRoot(node)) {
        const vertical = attrLiteral(findAttr(node, "layout")) === "vertical";
        const numeric = jsxDescendants(node).filter(inner => {
          const axis = rechartsName(inner);
          const type = attrLiteral(findAttr(inner, "type"));
          return vertical ? axis === "XAxis" && type !== "category" && type !== null : axis === "YAxis" && type !== "category";
        });
        if (numeric.length > 1) result["CL-8"].push(at(node, `<${tag}> 有 ${numeric.length} 個數值軸`));
      }
      // CL-10：固定高容器（class 含 chart-frame）與圖根 svg（class 含 chart-、waterfall-svg、spark，或帶 data-chart-kind）的高度。
      const classes = classText(node);
      if (classes.split(/\s+/).includes("chart-frame")) { const expr = styleHeight(node); if (expr) checkHeight(node, expr, "chart-frame style.height"); heightAttr(node, false); }
      if (tag === "svg" && (/(^|\s)chart-|waterfall-svg|spark/.test(classes) || findAttr(node, "data-chart-kind"))) { const expr = styleHeight(node); if (expr) checkHeight(node, expr, "svg style.height"); heightAttr(node, false); }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

/** CL-3 的擴大範圍：src/components/** 內的 `var(--chart-` 字串常值（字串、樣板片段；import 與型別常值不計）。 */
export function scanChartVarLiterals(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  const out = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && !ts.isLiteralTypeNode(node.parent) && node.text.includes("var(--chart-")) {
      out.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} 字串常值 ${JSON.stringify(node.text.slice(0, 40))}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/**
 * src 內以 next/dynamic 載入的模組（`dynamic(() => import("…/x-lazy"))`），扣掉有被靜態 import 的（`import type` 不算）。回傳檔名（不含副檔名）集合。
 * @param {{ path: string, text: string }[]} files
 */
export function lazyLoadedModules(files) {
  const dynamicStems = new Set(), staticStems = new Set();
  const stem = specifier => basename(specifier).replace(/\.[^.]+$/, "");
  for (const { text } of files) {
    for (const match of text.matchAll(/\bdynamic\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g)) dynamicStems.add(stem(match[1]));
    for (const match of text.matchAll(/^\s*import\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gm)) staticStems.add(stem(match[1]));
  }
  return new Set([...dynamicStems].filter(name => !staticStems.has(name)));
}

const listSource = dir => existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(name => /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)).sort().map(name => join(dir, name)) : [];

/**
 * 掃描整個範圍（AST 規則）。回傳每條規則的違規清單與掃描的檔案數。
 * @param {{ root?: string }} [options]
 */
export function scanChartSource({ root = process.cwd() } = {}) {
  const rel = path => relative(root, path);
  const read = path => ({ path, text: readFileSync(path, "utf8") });
  const lazyLoaded = lazyLoadedModules(listSource(resolve(root, CHART_SCAN_SCOPE.sourceDir)).map(read));
  const chartFiles = CHART_SCAN_SCOPE.chartDirs.flatMap(dir => listSource(resolve(root, dir)));
  const violations = Object.fromEntries(AST_RULES.map(rule => [rule, []]));
  for (const file of chartFiles) {
    const found = scanChartTsx(readFileSync(file, "utf8"), rel(file), { lazyLoaded });
    for (const rule of AST_RULES) violations[rule].push(...found[rule]);
  }
  const componentFiles = listSource(resolve(root, CHART_SCAN_SCOPE.componentsDir));
  for (const file of componentFiles) violations["CL-3"].push(...scanChartVarLiterals(readFileSync(file, "utf8"), rel(file)));
  return { violations, files: { chartDirs: chartFiles.length, components: componentFiles.length }, lazyLoaded: [...lazyLoaded].sort() };
}

// ---------------------------------------------------------------- SSR

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const decode = text => text.replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * 把 renderToStaticMarkup 的輸出切成節點樹（{ tag, attrs, children, parent }；文字節點 tag 為 "#text"）。
 * React 的輸出是良構的（屬性值一律雙引號、文字的 < > 已跳脫），只需處理成對標籤、void 元素與自我結束的 SVG 元素。
 */
export function parseMarkup(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let current = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[0].startsWith("<!--")) continue;
    if (match[5] !== undefined) { current.children.push({ tag: "#text", text: decode(match[5]), attrs: {}, children: [], parent: current }); continue; }
    const [, close, rawTag, rawAttrs, selfClose] = match;
    const tag = rawTag.toLowerCase();
    if (close) {
      let node = current;
      while (node !== root && node.tag !== tag) node = node.parent;
      if (node !== root) current = node.parent;
      continue;
    }
    const attrs = {};
    for (const attr of rawAttrs.matchAll(/\s+([^\s"'>/=]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] === undefined ? "" : decode(attr[2]);
    const node = { tag, attrs, children: [], parent: current };
    current.children.push(node);
    if (selfClose || VOID_TAGS.has(tag)) continue;
    if (tag === "script" || tag === "style") { const end = html.indexOf(`</${tag}>`, re.lastIndex); re.lastIndex = end < 0 ? html.length : end + tag.length + 3; continue; }
    current = node;
  }
  return root;
}

const classesOf = node => (node.attrs.class ?? "").split(/\s+/).filter(Boolean);
const hasClass = (node, name) => classesOf(node).includes(name);
function* elements(node) { for (const child of node.children) { if (child.tag === "#text") continue; yield child; yield* elements(child); } }
const ancestorsOf = node => { const out = []; for (let parent = node.parent; parent && parent.tag !== "#root"; parent = parent.parent) out.push(parent); return out; };
const textOf = (node, skip) => node.tag === "#text" ? node.text : node === skip ? "" : node.children.map(child => textOf(child, skip)).join("");
const describe = node => node.attrs["data-testid"] ? `[data-testid="${node.attrs["data-testid"]}"]` : node.attrs.id ? `#${node.attrs.id}` : `${node.tag}${classesOf(node).map(name => `.${name}`).join("")}`;
const sectionName = section => section.attrs["data-testid"] ?? section.attrs["aria-labelledby"] ?? describe(section);
const isAriaHidden = node => node.attrs["aria-hidden"] === "true";
/** ChartFrame mode="table"：固定高容器（.chart-frame）不設 aria-hidden，內含真的 <table>（或明確標 data-mode="table"）。 */
const isTableFrame = node => hasClass(node, "chart-frame") && !isAriaHidden(node) && (node.attrs["data-mode"] === "table" || [...elements(node)].some(inner => inner.tag === "table"));
const isTableModeSection = section => section.attrs["data-mode"] === "table" || [...elements(section)].some(isTableFrame);

/**
 * 檢查一個頁面狀態的 markup（CL-1、CL-2、CL-9、CL-11）。
 * @param {string} html renderToStaticMarkup 的輸出
 * @param {{ page: string }} context page＝殼層的 panel（overview、diagnosis…）；CL-9 依它取上限
 * @returns {{ violations: Record<string, string[]>, mainSections: string[], chartTestIds: string[] }}
 */
export function checkChartMarkup(html, { page }) {
  const root = parseMarkup(html);
  const all = [...elements(root)];
  const violations = Object.fromEntries(SSR_RULES.map(rule => [rule, []]));
  const ids = new Set(all.map(node => node.attrs.id).filter(Boolean));
  const sections = all.filter(node => node.tag === "section" && hasClass(node, "chart-section"));

  // CL-1：每個 section.chart-section 有 details.data-alternative，或是 table 模式。
  for (const section of sections) if (!isTableModeSection(section) && ![...elements(section)].some(inner => inner.tag === "details" && hasClass(inner, "data-alternative"))) violations["CL-1"].push(`${page}：section ${sectionName(section)} 沒有 details.data-alternative，也不是 table 模式`);
  // CL-1：帶 data-chart-kind 的元素（C24 cell、C19 spark）只在 <table> 或清單列（li、summary）內，而且同列有數字。
  for (const node of all.filter(item => item.attrs["data-chart-kind"] !== undefined)) {
    const row = ancestorsOf(node).find(parent => ["tr", "li", "summary"].includes(parent.tag));
    const where = `${page}：data-chart-kind="${node.attrs["data-chart-kind"]}" ${describe(node)}`;
    if (!row) violations["CL-1"].push(`${where} 不在 <table> 或清單列（li、summary）內`);
    else if (!/\d/.test(textOf(row, node))) violations["CL-1"].push(`${where} 同列沒有對應數字`);
  }

  // CL-2：chart- 開頭的 testid 符合命名正則、語意 key 不是純數字；圖的固定高容器內的 testid 以 chart- 開頭（既有 12 個與 kpi-target-* 在白名單）。
  const chartTestIds = [];
  for (const node of all) {
    const id = node.attrs["data-testid"];
    if (id === undefined) continue;
    if (id.startsWith("chart-")) {
      chartTestIds.push(id);
      const match = CHART_TESTID_RE.exec(id);
      if (!match) violations["CL-2"].push(`${page}：testid ${id} 不符合 chart-{page}-{id}[-{bar|point|seg|cell|spark}-{key}|-table]`);
      else if (match[1] !== undefined && /^\d+$/.test(match[1])) violations["CL-2"].push(`${page}：testid ${id} 的語意 key 是純數字（陣列索引）`);
    } else if (!isLegacyChartTestId(id) && ancestorsOf(node).some(parent => hasClass(parent, "chart-frame"))) {
      violations["CL-2"].push(`${page}：圖內的 testid ${id} 沒有以 chart- 開頭，也不在既有圖表 testid 白名單`);
    }
  }

  // CL-9：主層（沒有 <details>、hidden 祖先）的 section.chart-section ≤ 上限（總覽 4，其他頁 3）。
  const mainSections = sections.filter(section => !ancestorsOf(section).some(parent => parent.tag === "details" || parent.attrs.hidden !== undefined));
  const limit = CHART_SECTION_LIMITS[page] ?? DEFAULT_CHART_SECTION_LIMIT;
  mainSections.slice(limit).forEach((section, index) => violations["CL-9"].push(`${page}：主層第 ${limit + index + 1} 個圖區塊 ${sectionName(section)}（上限 ${limit}）`));

  // CL-11：柱、點、段、sparkline 與帶 data-chart-kind 的元素，本身或祖先 aria-hidden="true"（table 模式的格除外）。
  for (const node of all) {
    const id = node.attrs["data-testid"] ?? "";
    if (!ARIA_HIDDEN_FRAGMENTS.some(fragment => id.includes(fragment)) && node.attrs["data-chart-kind"] === undefined) continue;
    const chain = [node, ...ancestorsOf(node)];
    if (chain.some(isAriaHidden)) continue;
    const tableCell = ancestorsOf(node).some(parent => parent.tag === "table") && ancestorsOf(node).some(isTableFrame);
    if (!tableCell) violations["CL-11"].push(`${page}：${describe(node)} 本身與祖先都沒有 aria-hidden="true"`);
  }
  // CL-11：每個 section.chart-section 的 aria-describedby 指到頁面上存在的 id。
  for (const section of sections) {
    const refs = (section.attrs["aria-describedby"] ?? "").split(/\s+/).filter(Boolean);
    if (refs.length === 0) violations["CL-11"].push(`${page}：section ${sectionName(section)} 沒有 aria-describedby`);
    for (const ref of refs) if (!ids.has(ref)) violations["CL-11"].push(`${page}：section ${sectionName(section)} 的 aria-describedby="${ref}" 指到不存在的 id`);
  }
  return { violations, mainSections: mainSections.map(sectionName), chartTestIds };
}
