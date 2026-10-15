import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_BEFORE_AREAS, GUIDE_AREA_BEFORE_LINKS, GUIDE_AREA_CODES, GUIDE_AREA_GROUP, GUIDE_AREA_NEXT, GUIDE_AREA_NOTE_LINKS, GUIDE_AREA_STEPS, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_PUBLISHED_AREAS, GUIDE_VIDEOS, guideAreaHref, guideDataNote, resolveUiRefs, type GuideAreaCode, type GuideMediaEntry, type GuideMediaManifest, type GuideVideo as GuideVideoData } from "@/application/guide";
import guideMedia from "@/application/guide-media.json";
import { ORDER_AGGREGATION_DOC_URL } from "@/application/import-wizard";
import GuideLayout from "@/app/guide/layout";
import GuideHubPage, { metadata as hubMetadata } from "@/app/guide/page";
import GuideAreaPage, { dynamicParams, generateMetadata, generateStaticParams } from "@/app/guide/[area]/page";
import { GuideStep } from "@/components/guide/guide-step";
import { GuideVideo, GuideVideos, guideVideosFor, manifestVideos, type GuideVideoEntry } from "@/components/guide/guide-video";

// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項、01_PRD.md §3.1、§3.8、§3.10）：說明頁路由。
// 說明首頁（外框＋頁面）以 react-dom/server SSR：h1 唯一、guide-hub／guide-toc、頁內錨點都有對應 id、沒有連到還沒上線的功能區頁（不產生 404 連結）；
// metadata 由 guideMetadata 一次給齊（canonical、openGraph、twitter）；import 邊界：說明頁的模組圖不碰工作台與圖表模組、沒有 "use client"，
// 任何 "use client" 模組也走不到說明頁的模組（說明文字不進工作台首載）。V41-2a 起每個功能區頁另加 SSR 與 metadata 斷言（本檔後半）；V41-2b 起 11 區全部上線，
// 說明首頁與功能區頁提到的功能區都是連結（不再有純文字），站內連結都指到存在的頁面、錨點或 public 下的檔案。

const hub = () => renderToStaticMarkup(createElement(GuideLayout, null, createElement(GuideHubPage)));
const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const g = guideLabels.guide;
const text = (value: string) => resolveUiRefs(value, labels);
const manifest = guideMedia as GuideMediaManifest;
/** 功能區頁的 params（Next 16：params 是 Promise）。 */
const areaProps = (area: string) => ({ params: Promise.resolve({ area }) });
/** 功能區頁（外框＋頁面）的 SSR 結果；頁面是 async 伺服器元件，先取得它回傳的元素再渲染。 */
const areaHtml = async (area: string) => renderToStaticMarkup(createElement(GuideLayout, null, await GuideAreaPage(areaProps(area))));
const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => decode(match[1]));
const idsOf = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
/** 一段 HTML 的可及文字（近似）：<img> 換成 alt，其餘標記拿掉。 */
const accessibleText = (html: string) => decode(html.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, "$1").replace(/<[^>]+>/g, ""));
/** 功能區頁每一步的文字（guide.areas.{area}.steps.{key}）。 */
const stepCopy = (area: GuideAreaCode, key: string) => (g.areas[area] as unknown as { steps: Record<string, { title: string; body: string; alt: string; caption: string }> }).steps[key];

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

// ---------------------------------------------------------------- V41-2a 功能區頁

describe("V41-2a 功能區頁的資料（src/application/guide.ts、guideLabels）", () => {
  it("V41-2b：11 區全部上線（依 GUIDE_AREA_CODES 的順序）；GUIDE_AREAS 依序帶 GUIDE_AREA_STEPS 的步驟（V41-2a 的 21 步＋V41-2b 的 23 步＝44 步）", () => {
    expect(GUIDE_PUBLISHED_AREAS).toEqual([...GUIDE_AREA_CODES]);
    expect(GUIDE_AREAS.map(entry => entry.area)).toEqual([...GUIDE_PUBLISHED_AREAS]);
    for (const entry of GUIDE_AREAS) expect(entry.steps, entry.area).toEqual(GUIDE_AREA_STEPS[entry.area]);
    expect(GUIDE_AREAS.flatMap(entry => entry.steps)).toHaveLength(44);
    expect(GUIDE_AREAS.filter(entry => ["scenarios", "actions", "meeting", "data", "evidence", "export"].includes(entry.area)).flatMap(entry => entry.steps)).toHaveLength(23);
    for (const area of GUIDE_AREA_CODES) expect(guideAreaHref(area), area).toBe(`/guide/${area}`);
  });

  it.each(GUIDE_PUBLISHED_AREAS)("%s：answers、before、notes（1–3 點）齊全；steps 的鍵＝GUIDE_AREA_STEPS（同順序），每一步都有 title、body、alt、caption", area => {
    const copy = g.areas[area] as unknown as { answers: string; before: string; notes: readonly string[]; steps: Record<string, Record<string, string>> };
    expect(copy.answers.length, "answers").toBeGreaterThan(0);
    expect(copy.before.length, "before").toBeGreaterThan(0);
    expect(copy.notes.length).toBeGreaterThanOrEqual(1);
    expect(copy.notes.length).toBeLessThanOrEqual(3);
    expect(Object.keys(copy.steps)).toEqual(GUIDE_AREA_STEPS[area]!.map(step => step.key));
    for (const [key, step] of Object.entries(copy.steps)) expect(Object.keys(step).sort(), key).toEqual(["alt", "body", "caption", "title"]);
    for (const [key, step] of Object.entries(copy.steps)) for (const [field, value] of Object.entries(step)) expect(value.trim().length, `${key}.${field}`).toBeGreaterThan(0);
  });

  it("下一步最多 2 個功能區、不指回自己；要注意的連結指到存在的那一點；開始前的文件連結＝匯入精靈的整理工具說明（public 下有檔）", () => {
    // GUIDE_CONTENT 各區的「下一步」（V41-2a 前 5 區、V41-2b 後 6 區）。
    expect(GUIDE_AREA_NEXT).toEqual({
      start: ["overview", "import"], import: ["data", "overview"], overview: ["diagnosis", "evidence"], diagnosis: ["actions", "products"], products: ["scenarios", "overview"],
      scenarios: ["meeting", "actions"], actions: ["meeting"], meeting: ["export", "actions"], data: ["import", "evidence"], evidence: ["overview", "data"], export: ["meeting", "start"],
    });
    for (const area of GUIDE_PUBLISHED_AREAS) {
      const next = GUIDE_AREA_NEXT[area] ?? [];
      expect(next.length, area).toBeGreaterThanOrEqual(1);
      expect(next.length, area).toBeLessThanOrEqual(2);
      expect(next, area).not.toContain(area);
      const notes = (g.areas[area] as unknown as { notes: readonly string[] }).notes;
      for (const link of GUIDE_AREA_NOTE_LINKS[area] ?? []) expect(link.note, area).toBeLessThan(notes.length);
    }
    expect(GUIDE_AREA_BEFORE_LINKS).toEqual({ import: ORDER_AGGREGATION_DOC_URL });
    expect(existsSync(resolve("public", ORDER_AGGREGATION_DOC_URL.slice(1)))).toBe(true);
    expect(g.areas.import.beforeLink).toBe("{ui:importWizard.orderLevelLink}");
  });

  it("截圖的資料來源註記：S0 的 start-load 不加；S3、S4、S5 的匯入精靈 5 張、products-pareto 與 S4 的 data-coverage、data-issues 是合成資料（D-V41-21＝A）；其餘是示範資料（含 S6–S8）", () => {
    const notes = Object.fromEntries(GUIDE_AREAS.flatMap(entry => entry.steps).map(step => [step.mediaId, guideDataNote(step.mediaId)]));
    expect(Object.entries(notes).filter(([, note]) => note !== "demo")).toEqual([["start-load", "none"], ["import-files", "synthetic"], ["import-mapping", "synthetic"], ["import-basis", "synthetic"], ["import-review", "synthetic"], ["import-issues", "synthetic"], ["products-pareto", "synthetic"], ["data-coverage", "synthetic"], ["data-issues", "synthetic"]]);
    expect(Object.values(notes).filter(note => note === "demo")).toHaveLength(44 - 9);
    expect(g.common.demoCaption).toBe("畫面為示範資料（虛構）");
    expect(g.common.syntheticCaption).toBe("畫面為虛構的合成資料");
  });
});

describe("V41-2a 功能區頁路由（generateStaticParams、dynamicParams、404）", () => {
  it("generateStaticParams＝GUIDE_AREAS；dynamicParams＝false（其他網址 404）", () => {
    expect(generateStaticParams()).toEqual(GUIDE_AREAS.map(({ area }) => ({ area })));
    expect(dynamicParams).toBe(false);
  });

  it("不在 GUIDE_AREAS 的網址（未知或還沒上線）：頁面與 metadata 都走 notFound()", async () => {
    for (const area of ["not-a-area", ...GUIDE_AREA_CODES.filter(code => !GUIDE_PUBLISHED_AREAS.includes(code))]) {
      await expect(GuideAreaPage(areaProps(area)), area).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
      await expect(generateMetadata(areaProps(area)), area).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    }
  });
});

describe.each(GUIDE_AREAS.map(entry => [entry.area, entry] as const))("V41-2a 功能區頁 /guide/%s（SSR）", (area, entry) => {
  const copy = g.areas[area] as unknown as { title: string; answers: string; before: string; notes: readonly string[] };
  const title = text(copy.title);

  it("外框＋頁面：guide-area-{area}、h1 只有一個＝功能區標題、麵包屑（使用說明 › 本頁，aria-current）、這頁回答什麼與開始前、主要內容 #main-content", async () => {
    const html = await areaHtml(area);
    expect(html).toContain(`data-testid="guide-area-${area}"`);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(decode(html)).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`<nav class="guide-breadcrumb" aria-label="${g.areaPage.breadcrumbAria}">`);
    expect(decode(html)).toContain(`<li><a class="guide-link" href="/guide">${labels.shell.guideV41.entry}</a></li><li><span aria-current="page">${title}</span></li>`);
    expect(decode(html)).toContain(`<dt>${g.sections.answers}</dt><dd>${text(copy.answers)}</dd><dt>${g.sections.before}</dt><dd>${text(copy.before)}`);
    expect(html).toMatch(/<main id="main-content"[^>]*tabindex="-1"/i);
    expect(html).toContain(`<a class="skip-link" href="#main-content">${labels.shell.sidebar.skipLink}</a>`);
  });

  it("本頁目錄 guide-toc：每一步一個錨點（#{stepKey}，同順序、文字＝步驟標題）；每一步是 <li id={stepKey} data-testid=guide-step-{area}-{stepKey}>，內有 h2", async () => {
    const html = decode(await areaHtml(area));
    const toc = html.match(/<nav class="guide-toc" aria-label="([^"]+)" data-testid="guide-toc"><ol>(.*?)<\/ol><\/nav>/);
    expect(toc?.[1]).toBe(g.hub.tocAria);
    expect([...toc![2].matchAll(/<a class="guide-link" href="#([^"]+)">([^<]+)<\/a>/g)].map(match => [match[1], match[2]])).toEqual(entry.steps.map(step => [step.key, text(stepCopy(area, step.key).title)]));
    for (const step of entry.steps) {
      expect(html, step.key).toContain(`<li id="${step.key}" class="guide-step" data-testid="guide-step-${area}-${step.key}"><h2>${text(stepCopy(area, step.key).title)}</h2>`);
    }
    // 步驟內文：引用的介面字串是粗體。
    const first = stepCopy(area, entry.steps[0].key);
    const firstRef = first.body.match(/\{ui:([\w.]+)\}/);
    if (firstRef) expect(html).toContain(`<strong>${text(`{ui:${firstRef[1]}}`)}</strong>`);
  });

  it("標題層級不跳級；id 不重複；每個頁內錨點都有對應的 id；要注意（#notes，1–3 點）與下一步（#next，最後一項是開啟工作台 /）", async () => {
    const html = await areaHtml(area);
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(match => Number(match[1]));
    levels.forEach((level, index) => { if (index > 0) expect(level - levels[index - 1], `第 ${index + 1} 個標題 h${level}`).toBeLessThanOrEqual(1); });
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size, ids.join(",")).toBe(ids.length);
    expect(hrefsOf(html).filter(href => href.startsWith("#") && !ids.includes(href.slice(1)))).toEqual([]);
    expect(html).toMatch(/<section id="notes" class="guide-section" aria-labelledby="guide-notes-title"><h2 id="guide-notes-title">/);
    expect(html).toMatch(/<section id="next" class="guide-section" aria-labelledby="guide-next-title"><h2 id="guide-next-title">/);
    const notes = html.match(/<ul class="guide-notes">(.*?)<\/ul>/)![1];
    expect(notes.match(/<li>/g)).toHaveLength(copy.notes.length);
    const next = html.match(/<ul class="guide-next">(.*?)<\/ul>/)![1];
    expect(next.match(/<li>/g)).toHaveLength((GUIDE_AREA_NEXT[area] ?? []).length + 1);
    expect(decode(next)).toMatch(new RegExp(`<li><a class="guide-link" href="/">${g.hub.openApp}</a></li>$`));
  });

  it("沒有表單、輸入、target=_blank 或未解析的 {ui:…}；頁尾同說明首頁（示範資料、資料不上傳；媒體清單有日期時加截圖更新日期）", async () => {
    const html = await areaHtml(area);
    expect(html).not.toMatch(/<(form|input|textarea|select|button)[\s>]/);
    expect(html).not.toMatch(/target="_blank"/);
    expect(html).not.toContain("{ui:");
    expect(html).toContain(labels.shell.sidebar.sidebarNote.demo);
    expect(html).toContain(labels.shell.sidebar.sidebarNote.local);
    if (manifest.updated) expect(html).toContain(g.common.mediaUpdated.replace("{date}", manifest.updated));
    else expect(html).not.toContain(g.common.mediaUpdated.split("{date}")[0]);
  });

  it("截圖：媒體清單有的步驟才有 figure（guide-shot-{mediaId}），img 的寬高取自清單、decoding=async，頁面第一張不 lazy、其餘 lazy；原尺寸連結＝同一個檔、可及名稱＝alt＋（開啟原尺寸圖）", async () => {
    const html = await areaHtml(area);
    const shots = entry.steps.map(step => ({ step, media: manifest.media.find(item => item.id === step.mediaId) }));
    const firstShot = shots.find(shot => shot.media)?.step.mediaId;
    for (const { step, media } of shots) {
      const figure = html.match(new RegExp(`<figure class="guide-shot" data-testid="guide-shot-${step.mediaId}">(.*?)</figure>`));
      // 媒體清單是 agent A（媒體管線）產生的；還沒有這張圖時只有文字（tests/guide-content.test.ts 的媒體同步檢查要求最終每一步都有圖）。
      if (!media) { expect(figure, step.mediaId).toBeNull(); continue; }
      expect(figure, step.mediaId).not.toBeNull();
      const src = `/guide/${area}/${step.mediaId}.webp`;
      expect(media.file).toBe(src.slice(1));
      const link = figure![1].match(/<a class="guide-shot-link" href="([^"]+)">(.*?)<\/a>/)!;
      expect(link[1]).toBe(src);
      const img = link[2].match(/<img [^>]*>/)![0];
      expect(img).toContain(`src="${src}"`);
      expect(img).toContain(`width="${media.width}"`);
      expect(img).toContain(`height="${media.height}"`);
      expect(img).toContain('decoding="async"');
      if (step.mediaId === firstShot) expect(img).not.toContain("loading=");
      else expect(img).toContain('loading="lazy"');
      expect(accessibleText(link[2])).toBe(`${text(stepCopy(area, step.key).alt)}${g.common.fullSize}`);
    }
  });

  it("metadata：title＝「功能區標題 · 品牌名」、description＝這頁回答什麼；canonical＝/guide/{area}；openGraph 與 twitter 完整、分享圖是 /og.png", async () => {
    const metadata = await generateMetadata(areaProps(area));
    const pageTitle = `${title} · ${labels.brand.name}`;
    const description = text(copy.answers);
    expect(metadata.title).toBe(pageTitle);
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe(`/guide/${area}`);
    expect(metadata.openGraph).toMatchObject({ title: pageTitle, description, url: `/guide/${area}`, siteName: labels.brand.name, locale: "zh_TW", type: "website" });
    expect(metadata.openGraph?.images).toEqual([{ url: "/og.png", width: 1200, height: 630, alt: labels.brand.title }]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: pageTitle, description, images: ["/og.png"] });
  });
});

describe("V41-2a 說明頁之間的連結（說明首頁＋已上線的功能區頁）", () => {
  it("站內連結只有 /、/guide、已上線的 /guide/{area}（#錨點要在該頁存在，例如 /guide/overview#bridge）、該頁步驟的截圖 /guide/{area}/{mediaId}.webp、/docs/ORDER_AGGREGATION.md（檔案都在 public 下）；沒有外部連結", async () => {
    const pages = new Map<string, string>([["/guide", hub()]]);
    for (const { area } of GUIDE_AREAS) pages.set(`/guide/${area}`, await areaHtml(area));
    const ids = new Map([...pages].map(([path, html]) => [path, idsOf(html)]));
    const problems: string[] = [];
    for (const [path, html] of pages) {
      const own = GUIDE_AREAS.find(entry => `/guide/${entry.area}` === path);
      const shots = new Set(own?.steps.map(step => `/guide/${own.area}/${step.mediaId}.webp`) ?? []);
      for (const href of hrefsOf(html)) {
        if (href.startsWith("#")) { if (!ids.get(path)!.has(href.slice(1))) problems.push(`${path}: ${href}`); continue; }
        if (href === "/") continue;
        if ((href === ORDER_AGGREGATION_DOC_URL && path === "/guide/import") || shots.has(href)) { if (!existsSync(resolve("public", href.slice(1)))) problems.push(`${path}: ${href}（public 下沒有這個檔）`); continue; }
        const [target, hash] = href.split("#");
        if (!ids.has(target)) { problems.push(`${path}: ${href}`); continue; }
        if (hash !== undefined && !ids.get(target)!.has(hash)) problems.push(`${path}: ${href}（${target} 沒有 #${hash}）`);
      }
    }
    expect(problems).toEqual([]);
    // 說明首頁的「兩期差額拆到分」連到總覽頁的瀑布圖那一步。
    expect(hrefsOf(pages.get("/guide")!)).toContain("/guide/overview#bridge");
    expect(ids.get("/guide/overview")!.has("bridge")).toBe(true);
  });

  it("說明首頁的功能區目錄（#areas）：11 區各一張卡（連到 /guide/{area}，標題＋這頁回答什麼），依分組排列（開始使用、側欄四組、跨頁工具）", () => {
    const html = decode(hub());
    expect(html).toMatch(/<section id="areas" class="guide-section" aria-labelledby="guide-areas-title">/);
    expect(html).toContain('href="#areas"');
    const cards = [...html.matchAll(/<a class="guide-card" href="([^"]+)"><span class="guide-card-title">([^<]+)<\/span><span class="guide-card-answer">([^<]+)<\/span><\/a>/g)].map(match => [match[1], match[2], match[3]]);
    expect(cards).toEqual(GUIDE_AREAS.map(({ area }) => [`/guide/${area}`, text(g.areas[area].title), text((g.areas[area] as unknown as { answers: string }).answers)]));
    expect(cards).toHaveLength(11);
    // 分組：每組一個 h3（guide.groups.*），組內的卡片依 GUIDE_AREA_CODES 的順序。
    const groups = [...html.matchAll(/<div class="guide-card-group"><h3>([^<]+)<\/h3><ul class="guide-cards">(.*?)<\/ul><\/div>/g)].map(match => [match[1], [...match[2].matchAll(/href="\/guide\/([^"]+)"/g)].map(card => card[1])]);
    expect(groups).toEqual(GUIDE_GROUPS.map(group => [text(g.groups[group]), GUIDE_AREA_CODES.filter(area => GUIDE_AREA_GROUP[area] === group)]));
    expect(Object.fromEntries(groups)).toEqual({
      [g.groups.start]: ["start", "import"], [text(g.groups.results)]: ["overview"], [text(g.groups.causes)]: ["diagnosis", "products"],
      [text(g.groups.decisions)]: ["scenarios", "actions", "meeting"], [text(g.groups.data)]: ["data"], [g.groups.tools]: ["evidence", "export"],
    });
  });

  it("要注意與下一步：連到已上線的功能區是連結，還沒上線的只顯示標題文字（例如 start 的要注意連到 export、overview 的下一步 evidence）", async () => {
    const start = decode(await areaHtml("start"));
    const overview = decode(await areaHtml("overview"));
    for (const [html, area] of [[start, "export"], [overview, "evidence"]] as const) {
      if (GUIDE_PUBLISHED_AREAS.includes(area)) expect(html).toContain(`href="/guide/${area}"`);
      else expect(html).toContain(`<span>${text(g.areas[area].title)}</span>`);
    }
    expect(start).toContain(`<span class="guide-note-link">${g.areaPage.seeAlso}`);
    expect(decode(await areaHtml("import"))).toContain(`<a class="guide-link" href="${ORDER_AGGREGATION_DOC_URL}">${labels.importWizard.orderLevelLink}</a>`);
  });

  it("V41-2b：11 區都上線後，說明首頁與功能區頁提到的功能區全部是連結（30 秒上手第 3 步、三種角色、獨特性、要注意、下一步），沒有只剩標題文字的", async () => {
    const pages = [decode(hub()), ...await Promise.all(GUIDE_AREAS.map(async ({ area }) => decode(await areaHtml(area))))];
    const plain = pages.flatMap((html, index) => GUIDE_AREA_CODES.filter(area => html.includes(`<span>${text(g.areas[area].title)}</span>`)).map(area => `${index === 0 ? "/guide" : `/guide/${GUIDE_AREAS[index - 1].area}`}：${area}`));
    expect(plain).toEqual([]);
    const hubHtml = pages[0];
    expect(hubHtml).toContain(`<a class="guide-link" href="/guide/evidence">${text(g.quickstart.steps.step3)}</a>`);
    for (const area of ["meeting", "scenarios", "actions", "data", "export"] as const) expect(hubHtml, area).toContain(`<a class="guide-link" href="/guide/${area}">${text(g.areas[area].title)}</a>`);
  });

  it("V41-2b：要注意與開始前的「相關說明：」——actions 的要注意連到通路健檢（#add-action）與會議紀錄（#decision）；actions、meeting、export 的開始前連到要先做的功能區；錨點都在該頁", async () => {
    expect(GUIDE_AREA_NOTE_LINKS.actions).toEqual([{ note: 0, area: "diagnosis", hash: "add-action" }, { note: 0, area: "meeting", hash: "decision" }]);
    expect(GUIDE_AREA_BEFORE_AREAS).toEqual({
      actions: [{ area: "diagnosis", hash: "add-action" }],
      meeting: [{ area: "scenarios" }, { area: "diagnosis", hash: "add-action" }],
      export: [{ area: "scenarios" }, { area: "diagnosis", hash: "add-action" }],
    });
    const links = (list: readonly { area: GuideAreaCode; hash?: string }[]) => list.map(link => `<a class="guide-link" href="/guide/${link.area}${link.hash ? `#${link.hash}` : ""}">${text(g.areas[link.area].title)}</a>`).join("");
    for (const [area, list] of Object.entries(GUIDE_AREA_BEFORE_AREAS) as [GuideAreaCode, readonly { area: GuideAreaCode; hash?: string }[]][]) {
      const html = decode(await areaHtml(area));
      expect(html, area).toContain(`<dt>${g.sections.before}</dt><dd>${text((g.areas[area] as unknown as { before: string }).before)}<span class="guide-note-link">${g.areaPage.seeAlso}${links(list)}</span></dd>`);
      for (const link of list) if (link.hash) expect(GUIDE_AREA_STEPS[link.area]!.map(step => step.key), `${area} → ${link.area}#${link.hash}`).toContain(link.hash);
    }
    const actions = decode(await areaHtml("actions"));
    expect(actions).toContain(`<span class="guide-note-link">${g.areaPage.seeAlso}${links(GUIDE_AREA_NOTE_LINKS.actions!)}</span></li>`);
    // 沒有相關說明的開始前只有文字。
    expect(decode(await areaHtml("scenarios"))).toContain(`<dd>${text(g.areas.scenarios.before)}</dd>`);
  });
});

describe("V41-2a GuideStep（假的媒體清單項目；不依賴 src/application/guide-media.json 的內容）", () => {
  const fake = (mediaId: string): GuideMediaEntry => ({ id: mediaId, file: `guide/x/${mediaId}.webp`, width: 800, height: 450, bytes: 1, sha256: "0".repeat(64), labels_hash: "0".repeat(64) });
  const render = (area: GuideAreaCode, index: number, media: GuideMediaEntry | undefined, eager: boolean) => {
    const step = GUIDE_AREA_STEPS[area]![index];
    return { step, html: renderToStaticMarkup(createElement(GuideStep, { area, step, copy: stepCopy(area, step.key), media, eager })) };
  };

  it("有媒體：figure、原尺寸連結（可及名稱＝alt＋fullSize）、寬高、decoding=async；eager 時沒有 loading，否則 loading=lazy", () => {
    const { step, html } = render("overview", 0, fake("overview-snapshot"), true);
    expect(html).toContain(`data-testid="guide-shot-${step.mediaId}"`);
    const link = html.match(/<a class="guide-shot-link" href="([^"]+)">(.*?)<\/a>/)!;
    expect(link[1]).toBe("/guide/x/overview-snapshot.webp");
    expect(accessibleText(link[2])).toBe(`${text(stepCopy("overview", step.key).alt)}${g.common.fullSize}`);
    expect(link[2]).toContain('<span class="sr-only">（開啟原尺寸圖）</span>');
    expect(link[2]).toMatch(/<img src="\/guide\/x\/overview-snapshot\.webp" alt="[^"]+" width="800" height="450" decoding="async"\/>/);
    const lazy = render("overview", 1, fake("overview-top-three"), false).html;
    expect(lazy).toMatch(/<img [^>]*width="800" height="450" loading="lazy" decoding="async"\/>/);
  });

  it("圖說＝這一步的結果，另起一行資料來源註記：示範資料（demo）、合成資料（synthetic）、S0 不加（none）", () => {
    const demo = decode(render("overview", 2, fake("overview-bridge"), false).html);
    expect(demo).toContain(`<figcaption><span>${text(stepCopy("overview", "bridge").caption)}</span><span class="guide-shot-note">${g.common.demoCaption}</span></figcaption>`);
    const synthetic = decode(render("products", 2, fake("products-pareto"), false).html);
    expect(synthetic).toContain(`<span class="guide-shot-note">${g.common.syntheticCaption}</span>`);
    const none = decode(render("start", 0, fake("start-load"), true).html);
    expect(none).toContain(`<figcaption><span>${text(stepCopy("start", "load").caption)}</span></figcaption>`);
  });

  it("沒有媒體：只有 h2 與操作文字，沒有 figure", () => {
    const { step, html } = render("diagnosis", 0, undefined, false);
    expect(html).toContain(`<li id="${step.key}" class="guide-step" data-testid="guide-step-diagnosis-${step.key}">`);
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("<img");
  });
});

// ---------------------------------------------------------------- V41-3 示範影片

/*
 * V41-3（docs/revamp-v4.1/06_BATCHES.md V41-3 第 3 項；01_PRD.md §3.3 第 7 項、§3.6、§3.7；GUIDE_CONTENT.md §3）：src/components/guide/guide-video.tsx 與它在說明頁的位置。
 * 影片、字幕檔與 poster 是媒體管線（verification/guide-media/）產生的，本檔不依賴它們存在：元件與位置都以「假的媒體清單項目」斷言（GuideVideo 直接傳入；
 * 頁面上的位置以 vi.doMock 換掉 src/application/guide-media.json 再重新載入頁面模組）。真的清單有哪支影片，頁面就渲染哪支（最後一個 describe）。
 */
/** 假的媒體清單項目（檔名同媒體清單的約定：guide/video/{id}.mp4、.vtt、-poster.webp；1280×800；每個 cue 6 秒）。 */
const fakeVideoEntry = (video: GuideVideoData): GuideVideoEntry => ({
  id: video.id, file: `guide/video/${video.id}.mp4`, vtt: `guide/video/${video.id}.vtt`, poster: `guide/video/${video.id}-poster.webp`, width: 1280, height: 800, bytes: 1, posterBytes: 1,
  durationMs: video.cues.length * 6000, cues: video.cues.map((cue, index) => ({ key: cue.key, startMs: index * 6000, endMs: (index + 1) * 6000, sha256: "0".repeat(64) })), labels_hash: "0".repeat(64),
});
/** 一支影片的文字（guide.videos.{id}）。 */
const videoCopyOf = (id: string) => (g.videos as unknown as Record<string, { title: string; cues: Record<string, string> }>)[id];
/** 一段 HTML 裡的 guide-video-{id}（依出現順序）。 */
const videoIdsIn = (html: string) => [...html.matchAll(/data-testid="guide-video-([^"]+)"/g)].map(match => match[1]);
/** 影片放在哪些頁（GUIDE_CONTENT §3「放在」欄；hub＝說明首頁「30 秒上手」）。 */
const VIDEO_PAGES = { "start-30s": ["hub", "start"], "import-wizard": ["import"], "meeting-weekly": ["meeting"] } as const;

describe("V41-3 示範影片的資料（GUIDE_VIDEOS、guideLabels.guide.videos）", () => {
  it("3 支影片、各 5 個 cue；放置頁＝GUIDE_CONTENT §3（說明首頁與 start、import、meeting）；guide.videos 的鍵與 cue 順序＝GUIDE_VIDEOS", () => {
    expect(Object.fromEntries(GUIDE_VIDEOS.map(video => [video.id, [...video.pages]]))).toEqual(VIDEO_PAGES);
    for (const video of GUIDE_VIDEOS) expect(video.cues, video.id).toHaveLength(5);
    expect(Object.keys(g.videos)).toEqual(GUIDE_VIDEOS.map(video => video.id));
    for (const video of GUIDE_VIDEOS) {
      const copy = videoCopyOf(video.id);
      expect(Object.keys(copy).sort(), video.id).toEqual(["cues", "title"]);
      expect(Object.keys(copy.cues), video.id).toEqual(video.cues.map(cue => cue.key));
      for (const value of [copy.title, ...Object.values(copy.cues)]) expect(text(value).trim().length, video.id).toBeGreaterThan(0);
    }
  });

  it("字幕與逐字稿一句一個 cue（句末一個句號、沒有換行）；影片說明是 GUIDE_CONTENT §1.7 的原文；字幕軌名稱有字", () => {
    for (const video of GUIDE_VIDEOS) for (const [key, value] of Object.entries(videoCopyOf(video.id).cues)) {
      const plain = text(value);
      expect(plain, `${video.id}.${key}`).toMatch(/。$/);
      expect(plain.slice(0, -1), `${video.id}.${key}：一句`).not.toMatch(/[。\n]/);
    }
    expect(g.common.videoNote).toBe("影片沒有聲音；下方是影片的逐步文字。");
    expect(text(g.common.captionsLabel).length).toBeGreaterThan(0);
  });

  it("manifestVideos：清單沒有 videos（V41-3 之前）時是空陣列；guideVideosFor 依頁面與清單挑影片（清單沒有的不挑）", () => {
    expect(manifestVideos({ updated: null, media: [] })).toEqual([]);
    expect(manifestVideos(null)).toEqual([]);
    const entries = GUIDE_VIDEOS.map(fakeVideoEntry);
    expect(manifestVideos({ updated: null, media: [], videos: entries })).toEqual(entries);
    const ids = (page: Parameters<typeof guideVideosFor>[0], list: readonly GuideVideoEntry[] = entries) => guideVideosFor(page, list).map(item => item.video.id);
    expect(ids("hub")).toEqual(["start-30s"]);
    expect(ids("start")).toEqual(["start-30s"]);
    expect(ids("import")).toEqual(["import-wizard"]);
    expect(ids("meeting")).toEqual(["meeting-weekly"]);
    for (const area of GUIDE_AREA_CODES.filter(code => !["start", "import", "meeting"].includes(code))) expect(ids(area), area).toEqual([]);
    expect(ids("hub", [])).toEqual([]);
    expect(ids("meeting", entries.filter(entry => entry.id !== "meeting-weekly"))).toEqual([]);
  });
});

describe.each(GUIDE_VIDEOS.map(video => [video.id, video] as const))("V41-3 GuideVideo %s（假的媒體清單項目）", (id, video) => {
  const entry = fakeVideoEntry(video);
  const html = renderToStaticMarkup(createElement(GuideVideo, { video, entry }));
  const copy = videoCopyOf(id);
  const title = text(copy.title);
  const videoTag = html.match(/<video\b[^>]*>/)![0];

  it("<figure class=guide-video data-testid=guide-video-{id}>：圖說＝影片標題，接著 <video>、影片說明一行、逐字稿 <ol>", () => {
    expect(html).toMatch(new RegExp(`^<figure class="guide-video" data-testid="guide-video-${id}"><figcaption>[^<]+</figcaption><video\\b[^>]*>.*</video><p class="guide-video-note">[^<]+</p><ol class="guide-video-transcript">.*</ol></figure>$`));
    expect(decode(html)).toContain(`<figcaption>${title}</figcaption>`);
    expect(decode(html)).toContain(`<p class="guide-video-note">${g.common.videoNote}</p>`);
    expect(html).not.toContain("{ui:");
  });

  it("<video>：原生 controls、preload=none、playsinline、poster、寬高取自清單（同一組 aspect-ratio）、可及名稱＝影片標題；沒有 autoplay、loop、muted", () => {
    const attributes = Object.fromEntries([...videoTag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1].toLowerCase(), decode(match[2])]));
    expect(attributes).toEqual({ controls: "", preload: "none", playsinline: "", poster: `/guide/video/${id}-poster.webp`, width: "1280", height: "800", style: "aspect-ratio:1280 / 800", "aria-label": title });
    expect(videoTag).not.toMatch(/autoplay|loop|muted/i);
  });

  it("<video> 內一個 MP4 <source> 與一條預設開啟的中文字幕 <track kind=captions srclang=zh-Hant-TW>（字幕檔在 public/guide/video/）", () => {
    const inner = html.match(/<video\b[^>]*>(.*)<\/video>/)![1];
    expect(inner).toBe(`<source src="/guide/video/${id}.mp4" type="video/mp4"/><track kind="captions" srcLang="zh-Hant-TW" label="${g.common.captionsLabel}" src="/guide/video/${id}.vtt" default=""/>`);
    expect(inner.match(/<source\b/g)).toHaveLength(1);
    expect(inner.match(/<track\b/g)).toHaveLength(1);
  });

  it("逐字稿 <ol>：li 數＝cue 數，依 GUIDE_VIDEOS 的順序，每一項＝guide.videos.{id}.cues.{key} 的純文字（引用的介面字串不加粗、沒有連結）", () => {
    const transcript = html.match(/<ol class="guide-video-transcript">(.*)<\/ol>/)![1];
    const items = [...transcript.matchAll(/<li>([^<]*)<\/li>/g)].map(match => decode(match[1]));
    expect(transcript.match(/<li>/g)).toHaveLength(video.cues.length);
    expect(items).toEqual(video.cues.map(cue => text(copy.cues[cue.key])));
    expect(transcript).not.toMatch(/<(strong|a)\b/);
  });

  it("GuideVideos：清單沒有這支影片時什麼都不輸出；有時輸出同一個 figure", () => {
    for (const page of video.pages) {
      expect(renderToStaticMarkup(createElement(GuideVideos, { page, entries: [] })), page).toBe("");
      expect(renderToStaticMarkup(createElement(GuideVideos, { page, entries: [entry] })), page).toBe(html);
    }
  });
});

describe("V41-3 影片在說明頁的位置（vi.doMock 換成有 3 支影片的假媒體清單）", () => {
  const fakeManifest = { ...manifest, videos: GUIDE_VIDEOS.map(fakeVideoEntry) };
  let hubWithVideos = "";
  const areaWithVideos = new Map<GuideAreaCode, string>();

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("@/application/guide-media.json", () => ({ default: fakeManifest }));
    const [{ default: Layout }, { default: Hub }, { default: Area }] = await Promise.all([import("@/app/guide/layout"), import("@/app/guide/page"), import("@/app/guide/[area]/page")]);
    hubWithVideos = renderToStaticMarkup(createElement(Layout, null, createElement(Hub)));
    for (const { area } of GUIDE_AREAS) areaWithVideos.set(area, renderToStaticMarkup(createElement(Layout, null, await Area(areaProps(area)))));
  });
  afterAll(() => {
    vi.doUnmock("@/application/guide-media.json");
    vi.resetModules();
  });

  it("說明首頁：start-30s 恰好一支，在 #quickstart 段落內、4 步之後（段落最後）", () => {
    expect(videoIdsIn(hubWithVideos)).toEqual(["start-30s"]);
    const quickstart = hubWithVideos.match(/<section id="quickstart"[^>]*>(.*?)<\/section>/)![1];
    expect(quickstart).toMatch(/<ol class="guide-steps">(?:(?!<\/ol>).)*<\/ol><figure class="guide-video" data-testid="guide-video-start-30s">.*<\/figure>$/);
    expect(quickstart.match(/<ol class="guide-steps">(.*?)<\/ol>/)![1].match(/<li>/g)).toHaveLength(4);
  });

  it("功能區頁：start、import、meeting 各一支，在本頁目錄之後、步驟清單之前；其他 8 區沒有影片", () => {
    for (const { area } of GUIDE_AREAS) {
      const html = areaWithVideos.get(area)!;
      const expected = GUIDE_VIDEOS.filter(video => (video.pages as readonly string[]).includes(area)).map(video => video.id);
      expect(videoIdsIn(html), area).toEqual(expected);
      for (const id of expected) expect(html, `${area}：${id}`).toMatch(new RegExp(`data-testid="guide-toc"><ol>.*?</ol></nav><figure class="guide-video" data-testid="guide-video-${id}">.*?</figure><ol class="guide-area-steps">`));
    }
    expect([...areaWithVideos].filter(([, html]) => html.includes("guide-video")).map(([area]) => area)).toEqual(["start", "import", "meeting"]);
  });

  it("加了影片的頁：標題層級不跳級、id 不重複、沒有表單或按鈕（影片用原生 controls）、沒有 target=_blank；影片標題不是 heading（不改目錄與標題結構）", () => {
    for (const [path, html] of [["/guide", hubWithVideos], ...["start", "import", "meeting"].map(area => [`/guide/${area}`, areaWithVideos.get(area as GuideAreaCode)!])]) {
      const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(match => Number(match[1]));
      levels.forEach((level, index) => { if (index > 0) expect(level - levels[index - 1], `${path} 第 ${index + 1} 個標題 h${level}`).toBeLessThanOrEqual(1); });
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size, path).toBe(ids.length);
      expect(html, path).not.toMatch(/<(form|input|textarea|select|button)[\s>]/);
      expect(html, path).not.toMatch(/target="_blank"/);
      expect(html.match(/<figure class="guide-video"[^>]*>(.*?)<\/figure>/)![1], path).not.toMatch(/<h[1-6][\s>]/);
    }
  });
});

describe("V41-3 影片與媒體清單（src/application/guide-media.json 目前的內容）", () => {
  it("清單有的影片才渲染（說明首頁與功能區頁），沒有的不渲染；渲染出來的 figure 與 GuideVideo 對同一筆清單項目的輸出相同", async () => {
    const entries = manifestVideos(guideMedia);
    for (const video of GUIDE_VIDEOS) {
      const entry = entries.find(item => item.id === video.id);
      for (const page of video.pages) {
        const html = page === "hub" ? hub() : await areaHtml(page);
        if (!entry) { expect(videoIdsIn(html), `${page}：清單沒有 ${video.id}`).toEqual([]); continue; }
        expect(html, `${page}：${video.id}`).toContain(renderToStaticMarkup(createElement(GuideVideo, { video, entry })));
      }
    }
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

  it("說明頁的檔案：src/app/guide 的 layout、page、metadata、[area]/page（V41-2a）與 src/components/guide 的元件", () => {
    expect(guideFiles).toEqual(expect.arrayContaining(["src/app/guide/layout.tsx", "src/app/guide/page.tsx", "src/app/guide/metadata.ts", "src/app/guide/[area]/page.tsx", "src/components/guide/guide-text.tsx", "src/components/guide/guide-card-list.tsx", "src/components/guide/guide-area-ref.tsx", "src/components/guide/guide-step.tsx", "src/components/guide/guide-toc.tsx", "src/components/guide/guide-video.tsx"]));
  });

  it("說明頁的模組圖不含 dashboard、圖表元件、recharts、pptxgenjs、xlsx，也沒有任何 \"use client\" 模組", () => {
    const { files, packages } = graph(guideFiles);
    expect(files).toEqual(expect.arrayContaining(["src/i18n/guide.zh-TW.ts", "src/application/guide.ts", "src/application/guide-media.json"]));
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
