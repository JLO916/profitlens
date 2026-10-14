import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_CODES, GUIDE_AREAS, resolveUiRefs } from "@/application/guide";
import GuideLayout from "@/app/guide/layout";
import GuideHubPage, { metadata as hubMetadata } from "@/app/guide/page";

// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項、01_PRD.md §3.1、§3.8、§3.10）：說明頁路由。
// 說明首頁（外框＋頁面）以 react-dom/server SSR：h1 唯一、guide-hub／guide-toc、頁內錨點都有對應 id、沒有連到還沒上線的功能區頁（不產生 404 連結）；
// metadata 由 guideMetadata 一次給齊（canonical、openGraph、twitter）；import 邊界：說明頁的模組圖不碰工作台與圖表模組、沒有 "use client"，
// 任何 "use client" 模組也走不到說明頁的模組（說明文字不進工作台首載）。V41-2a 起每個功能區頁另加 SSR 與 metadata 斷言。

const hub = () => renderToStaticMarkup(createElement(GuideLayout, null, createElement(GuideHubPage)));
const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

describe("V41-1 說明首頁 SSR", () => {
  const html = hub();

  it("h1 只有一個＝guide.hub.title；有 guide-hub、guide-toc；主要內容是 #main-content，跳至主要內容連到它", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(`<h1>${guideLabels.guide.hub.title}</h1>`);
    expect(html).toContain('data-testid="guide-hub"');
    expect(html).toContain(`<nav class="guide-toc" aria-label="${guideLabels.guide.hub.tocAria}" data-testid="guide-toc">`);
    expect(html).toMatch(/<main id="main-content"[^>]*tabindex="-1"/i);
    expect(html).toContain(`<a class="skip-link" href="#main-content">${labels.shell.sidebar.skipLink}</a>`);
  });

  it("一句話引用 brand.description；兩個動作：開啟工作台（同分頁連到 /）、從 30 秒上手開始（#quickstart）", () => {
    expect(decode(html)).toContain(labels.brand.description);
    expect(html).toContain(`<a class="ui-btn ui-btn-primary" href="/">${guideLabels.guide.hub.openApp}</a>`);
    expect(html).toContain(`href="#quickstart">${guideLabels.guide.hub.startHere}</a>`);
    expect(html).not.toMatch(/target="_blank"/);
  });

  it("標題層級不跳級（h1 → h2 → h3）；四個段落各有 h2，功能區目錄在 GUIDE_AREAS 是空的時候不出現", () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(match => Number(match[1]));
    levels.forEach((level, index) => { if (index > 0) expect(level - levels[index - 1], `第 ${index + 1} 個標題 h${level}`).toBeLessThanOrEqual(1); });
    for (const id of ["why", "who", "unique", "quickstart"]) expect(html, id).toMatch(new RegExp(`<section id="${id}"[^>]*aria-labelledby="guide-${id}-title"`));
    if (GUIDE_AREAS.length === 0) {
      expect(html).not.toContain('id="areas"');
      expect(html).not.toContain('href="#areas"');
    }
    // 7 項獨特性與「適合誰，還沒涵蓋什麼」「這些做法的代價」都是 h3。
    for (const item of Object.values(guideLabels.guide.unique.items)) expect(html).toContain(`<h3>${item.title}</h3>`);
    expect(html).toMatch(new RegExp(`<h3 class="guide-subheading">${guideLabels.guide.sections.scope}</h3>`));
    expect(html).toMatch(new RegExp(`<h3 class="guide-subheading">${guideLabels.guide.sections.tradeoffs}</h3>`));
  });

  it("每個頁內錨點（#…）都有對應的 id；沒有任何連到還沒上線的功能區頁（/guide/{area} 只在 GUIDE_AREAS 裡才是連結）", () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => decode(match[1]));
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
    const anchors = hrefs.filter(href => href.startsWith("#"));
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    expect(anchors.filter(href => !ids.has(href.slice(1)))).toEqual([]);
    const published = new Set(GUIDE_AREAS.map(entry => entry.area));
    const areaLinks = hrefs.filter(href => href.startsWith("/guide/")).map(href => href.slice("/guide/".length).split("#")[0]);
    expect(areaLinks.filter(area => !published.has(area as typeof GUIDE_AREA_CODES[number]))).toEqual([]);
    // 其他連結只有工作台 /（品牌、開啟工作台、30 秒上手第 1 步）。
    expect(hrefs.filter(href => !href.startsWith("#") && !href.startsWith("/guide/")).every(href => href === "/")).toBe(true);
    // 還沒上線的功能區仍以標題文字出現（例如「在哪裡看得到」）。
    if (!published.has("evidence")) expect(decode(html)).toContain(`<span>${resolveUiRefs(guideLabels.guide.areas.evidence.title, labels)}</span>`);
  });

  it("沒有表單、輸入或未解析的 {ui:…}；頁尾是示範資料與資料不上傳兩句（本機不載入分析，所以沒有揭露句）", () => {
    expect(html).not.toMatch(/<(form|input|textarea|select|button)[\s>]/);
    expect(html).not.toContain("{ui:");
    expect(html).toContain(labels.shell.sidebar.sidebarNote.demo);
    expect(html).toContain(labels.shell.sidebar.sidebarNote.local);
    expect(html).not.toContain(labels.relaunch.analyticsNote);
  });
});

describe("V41-1 說明首頁 metadata（guideMetadata；PRD §3.8）", () => {
  it("title＝「服務介紹與使用說明 · 品牌名」；canonical＝/guide；openGraph 與 twitter 完整、分享圖是 /og.png", () => {
    const title = `${guideLabels.guide.hub.title} · ${labels.brand.name}`;
    expect(hubMetadata.title).toBe(title);
    expect(hubMetadata.description).toBe(guideLabels.guide.hub.description);
    expect(hubMetadata.alternates?.canonical).toBe("/guide");
    expect(hubMetadata.openGraph).toMatchObject({ title, description: guideLabels.guide.hub.description, url: "/guide", siteName: labels.brand.name, locale: "zh_TW", type: "website" });
    expect(hubMetadata.openGraph?.images).toEqual([{ url: "/og.png", width: 1200, height: 630, alt: labels.brand.title }]);
    expect(hubMetadata.twitter).toMatchObject({ card: "summary_large_image", title, description: guideLabels.guide.hub.description, images: ["/og.png"] });
  });
});

// ---------------------------------------------------------------- import 邊界

const SRC = resolve("src");
/** 模組的匯入（值匯入、再匯出與 import()；`import type`、只匯入型別的具名匯入、`export type` 不算——打包時會被拿掉）。 */
function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnlyNames = !!clause && !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
      if (!clause?.isTypeOnly && !typeOnlyNames) out.push((node.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const typeOnlyNames = !!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
      if (!node.isTypeOnly && !typeOnlyNames) out.push((node.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}
/** 第一個敘述是 "use client" 指示詞的模組。 */
function isClientModule(file: string): boolean {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use client") return true;
  }
  return false;
}
/** @/ 與相對路徑解析成檔案；套件回傳套件名（@scope/name 或 name）。 */
function resolveSpecifier(from: string, specifier: string): { file?: string; pkg?: string } {
  const base = specifier.startsWith("@/") ? resolve(SRC, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return { pkg: specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0] };
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (existsSync(candidate) && statSync(candidate).isFile()) return { file: candidate };
  throw new Error(`解析不到 ${specifier}（${relative(".", from)}）`);
}
/** 從 entries 沿匯入走訪；回傳走到的 src 內檔案（相對路徑）與套件名。 */
function graph(entries: readonly string[]) {
  const files = new Set<string>(), packages = new Set<string>();
  const queue = entries.map(entry => resolve(entry));
  while (queue.length) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const specifier of importsOf(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target.pkg) packages.add(target.pkg);
      if (target.file) queue.push(target.file);
    }
  }
  return { files: [...files].map(file => relative(".", file)), packages };
}
const listTs = (dir: string) => readdirSync(resolve(dir), { recursive: true, encoding: "utf8" }).filter(name => /\.tsx?$/.test(name)).map(name => join(dir, name));

describe("V41-1 import 邊界（PRD §3.1、§3.10）", () => {
  const guideFiles = [...listTs("src/app/guide"), ...listTs("src/components/guide")];

  it("說明頁的檔案：src/app/guide 的 layout、page、metadata 與 src/components/guide 的元件", () => {
    expect(guideFiles).toEqual(expect.arrayContaining(["src/app/guide/layout.tsx", "src/app/guide/page.tsx", "src/app/guide/metadata.ts", "src/components/guide/guide-text.tsx", "src/components/guide/guide-card-list.tsx"]));
  });

  it("說明頁的模組圖不含 dashboard、圖表元件、recharts、pptxgenjs、xlsx，也沒有任何 \"use client\" 模組", () => {
    const { files, packages } = graph(guideFiles);
    expect(files).toEqual(expect.arrayContaining(["src/i18n/guide.zh-TW.ts", "src/application/guide.ts"]));
    expect(files.filter(file => file === "src/components/dashboard.tsx" || file.startsWith("src/components/charts/"))).toEqual([]);
    expect([...packages].filter(pkg => ["recharts", "pptxgenjs", "xlsx"].includes(pkg))).toEqual([]);
    expect(files.filter(file => /\.tsx?$/.test(file) && isClientModule(resolve(file)))).toEqual([]);
  });

  it("任何 \"use client\" 模組（連同它匯入的模組）都走不到 @/i18n/guide*、@/application/guide、@/components/guide/*", () => {
    const clientModules = listTs("src").filter(file => isClientModule(resolve(file)));
    expect(clientModules.length).toBeGreaterThan(20);
    expect(clientModules).toContain("src/components/dashboard.tsx");
    const isGuideModule = (file: string) => /^src\/i18n\/guide[^/]*\.tsx?$/.test(file) || /^src\/application\/guide(\.tsx?|-[^/]*)$/.test(file) || file.startsWith("src/components/guide/");
    const reached = graph(clientModules).files.filter(isGuideModule);
    expect(reached).toEqual([]);
    // 直接匯入的寫法也擋（含之後新增、還沒有檔案的說明模組）。
    const direct = clientModules.flatMap(file => importsOf(resolve(file)).filter(specifier => /^@\/(i18n\/guide|application\/guide|components\/guide\/)/.test(specifier)).map(specifier => `${file}: ${specifier}`));
    expect(direct).toEqual([]);
  });
});
