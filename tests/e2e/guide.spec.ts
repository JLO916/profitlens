// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項；01_PRD.md §3.1、§3.2、§3.3、§3.6、§3.10）：說明首頁 /guide 與工作台「使用說明」入口的 E2E，四尺寸都跑。
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { guideLabels } from "../../src/i18n/guide.zh-TW";
import { GUIDE_AREAS, GUIDE_HUB_SECTIONS, GUIDE_VIDEOS, guideAreaPath, resolveUiRefs, type GuideAreaCode } from "../../src/application/guide";
import guideMedia from "../../src/application/guide-media.json";
import { formatAmountL1 } from "../../src/application/presentation";
import { DEMO_RESULT, hideDevOverlay, loadDemo, writeLaunchJson } from "./launch-helpers-v310";
import { isMobile, openMobileMore } from "./replacement-helpers";

/*
 * A. /guide：回應 200；h1 恰好一個＝guide.hub.title；guide-hub、guide-toc 看得到；目錄每個錨點都跳到自己的段落（網址 #id、段落標題進到視窗）；
 *    頁面不橫向捲動（document.scrollingElement.scrollWidth ≤ 視窗寬）；axe（與 tests/e2e/axe-sweep.spec.ts 同一組 tag 與設定）serious、critical 為 0。
 * B. 工作台入口（D-V41-5）：四個入口都是 <a href="/guide" target="_blank" rel="noopener">；看得到的入口可及名稱＝可見文字＋shell.guideV41.newTab（sr-only）。
 *    首頁空狀態的入口另開分頁到 /guide；載入示範資料後，側欄（≥ 768）或「更多」最後一列（≤ 767）、頁尾的入口都另開分頁到 /guide，原分頁的示範資料仍在（同分頁換頁會丟掉記憶體裡的資料）。
 * C. V41-2a 功能區頁（docs/revamp-v4.1/06_BATCHES.md V41-2a 第 5 項；01_PRD.md §3.3、§3.5、§3.6）：GUIDE_AREAS 的每一頁 /guide/{area}，四尺寸：200；h1 恰好一個＝功能區標題；
 *    guide-area-{area}、guide-toc 看得到；目錄每個錨點跳到自己的步驟（網址 #stepKey、guide-step-{area}-{stepKey} 與它的 h2 進到視窗）；不橫向捲動；
 *    每張圖（guide-shot-{mediaId}）的 src＝/guide/{area}/{mediaId}.webp、alt 取 guideLabels、寬高取媒體清單、第一張以外 loading=lazy，捲進視窗後載入完成（complete、naturalWidth > 0）；
 *    外包的連結 href＝img src（原尺寸檔），可及名稱＝alt＋guide.common.fullSize；390 另把每張圖的顯示寬度、naturalWidth 與比值寫到 GUIDE_SHOTS_OUT
 *    （以功能區為鍵；只記錄、不斷言，低於 0.45 的列進驗收文件）；axe serious、critical 為 0。
 *    說明首頁的功能區目錄（#areas）每個已上線的功能區恰好一張卡、依序連到 /guide/{area}；/guide/overview#bridge（直接開、從說明首頁點）落在 bridge 步驟。
 * D. V41-3 示範影片（docs/revamp-v4.1/06_BATCHES.md V41-3 第 4 項；01_PRD.md §3.3 第 7 項、§3.6、§3.7）：GUIDE_VIDEOS 的每支影片在它的每一頁（/guide、/guide/start、
 *    /guide/import、/guide/meeting），四尺寸：媒體清單 src/application/guide-media.json 的 videos 一定要有這支影片（不略過）；guide-video-{id} 看得到、不造成橫向捲動；
 *    <video> 的可及名稱＝guide.videos.{id}.title、preload=none、poster、沒有自動播放與循環、首載後 readyState＝0；載入頁面（含捲到影片、用 Tab 走過影片）
 *    都沒有請求 /guide/video/*.mp4（只允許 poster 與字幕檔）；外框高度＝寬度 × 清單的高／寬（沒有版面位移）；影片前一個停留點按 Tab 到達 <video>，
 *    再按 Tab 走過原生控制後離開影片（沒有焦點陷阱）；字幕軌 kind=captions、srclang=zh-Hant-TW、預設顯示，字幕檔載入後 cue 數＝逐字稿 <ol> 的項數＝GUIDE_VIDEOS 的 cue 數，
 *    每段字幕＝逐字稿同一項的文字；影片說明一行＝guide.common.videoNote；axe serious、critical 為 0，video-caption 規則通過（passes）；MP4 本身 200、video/mp4、大小＝清單的 bytes。
 * 字串一律取 labels 與 guideLabels（{ui:…} 以 resolveUiRefs 換成 labels 原字串），定位以 testid 為主；非 testid 的定位器登記在 verification/revamp-v41/e2e-text-assertions.csv。
 */
const g = guideLabels.guide;
const text = (value: string) => resolveUiRefs(value, labels);
const entry = labels.shell.guideV41;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 可及名稱＝可見文字＋「（另開分頁）」：.sr-only 是 position:absolute，Chromium 計算名稱時在兩段之間補一個空白（代理 B 實測），所以允許中間有空白。 */
const entryName = (visible: string) => new RegExp(`^${escape(visible)}\\s?${escape(entry.newTab)}$`);
/** 本批（GUIDE_AREAS 是空的）目錄只有 why、who、unique、quickstart；功能區頁上線後多 areas。 */
const tocSections = GUIDE_HUB_SECTIONS.filter(id => id !== "areas" || GUIDE_AREAS.length > 0);

/** 收集 console error 與 pageerror；每個測試最後斷言為空。 */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

/** 連結中看得到的文字（拿掉 .sr-only 與 aria-hidden 的子節點，例如「更多」列的圖示）。 */
const visibleText = (link: Locator) => link.evaluate(element => {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element) || node.classList.contains("sr-only") || node.getAttribute("aria-hidden") === "true") return "";
    return [...node.childNodes].map(walk).join("");
  };
  return walk(element).trim();
});

/** 入口的屬性：href=/guide、target=_blank、rel=noopener（四個入口在每個狀態都掛載，手機的側欄、關著的「更多」也一樣）。 */
async function expectEntryAttributes(link: Locator) {
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/guide");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener");
}

/** 點看得到的入口：可見文字、可及名稱正確；另開一個分頁到 /guide（說明首頁渲染），原分頁的網址不變。回傳後關掉新分頁。 */
async function openEntry(page: Page, context: BrowserContext, link: Locator, visible: string) {
  await expect(link).toBeVisible();
  expect(await visibleText(link)).toBe(visible);
  await expect(link).toHaveAccessibleName(entryName(visible));
  const before = page.url();
  const [opened] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await opened.waitForLoadState("domcontentloaded");
  expect(new URL(opened.url()).pathname).toBe("/guide");
  await expect(opened.getByTestId("guide-hub")).toBeVisible();
  await opened.close();
  expect(page.url(), "入口另開分頁，原分頁不換頁").toBe(before);
}

/** axe-core（與 tests/e2e/axe-sweep.spec.ts 同一份 axe.min.js、同一組 tag、同樣排除 nextjs-portal）；回傳 serious 與 critical 的違規。 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axeBlocking(page: Page) {
  if (!await page.evaluate(() => "axe" in window)) await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async tags => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.slice(0, 5).map(node => JSON.stringify(node.target)) }));
  }, TAGS);
  return violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.impact} ${item.id}：${item.targets.join(" ")}`);
}

test.describe("V41-1 說明首頁與入口", () => {
  test("/guide：200、h1 唯一、說明首頁與目錄、目錄錨點跳到段落、不橫向捲動、axe 0 serious", async ({ page }) => {
    const errors = collectErrors(page);
    await hideDevOverlay(page);
    const response = await page.goto("/guide");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(text(g.hub.title));
    const hub = page.getByTestId("guide-hub");
    await expect(hub).toBeVisible();
    await expect(hub.getByRole("heading", { level: 1 })).toHaveText(text(g.hub.title));
    const toc = page.getByTestId("guide-toc");
    await expect(toc).toBeVisible();
    await expect(toc).toHaveAccessibleName(text(g.hub.tocAria));

    // 目錄：依閱讀順序列出段落；每個錨點都跳到自己的段落（網址帶 #id、段落的 h2 進到視窗內）。
    const links = toc.getByRole("link");
    await expect(links).toHaveCount(tocSections.length);
    for (const [index, id] of tocSections.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveText(text(g.sections[id]));
      await expect(link).toHaveAttribute("href", `#${id}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      const heading = page.locator(`#${id}`).getByRole("heading", { level: 2 });
      await expect(heading).toHaveText(text(g.sections[id]));
      await expect(heading).toBeInViewport();
    }

    // 不橫向捲動（四尺寸）。
    await page.evaluate(() => window.scrollTo(0, 0));
    const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, width: window.innerWidth }));
    expect(scroll.scrollWidth, `scrollWidth ${scroll.scrollWidth} ≤ 視窗寬 ${scroll.width}`).toBeLessThanOrEqual(scroll.width);

    expect(await axeBlocking(page), "/guide：axe serious／critical 必須為 0").toEqual([]);
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });

  test("入口：首頁空狀態、側欄或「更多」、頁尾都另開分頁到 /guide，原分頁的示範資料仍在", async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await hideDevOverlay(page);
    await page.goto("/");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    for (const id of ["sidebar", "more", "home", "footer"]) await expectEntryAttributes(page.getByTestId(`guide-entry-${id}`));

    // 首頁空狀態：按鈕列下方一行（陳述句），另開分頁；原分頁仍是空狀態。
    await openEntry(page, context, page.getByTestId("guide-entry-home"), entry.homeHint);
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await loadDemo(page);
    const demoValue = page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
    await expect(page.getByTestId("guide-entry-home")).toHaveCount(0);
    for (const id of ["sidebar", "more", "footer"]) await expectEntryAttributes(page.getByTestId(`guide-entry-${id}`));

    // 側欄（≥ 768）或手機「更多」面板最後一列（≤ 767）。
    if (isMobile(page)) {
      await expect(page.getByTestId("guide-entry-sidebar")).toBeHidden();
      await openMobileMore(page);
      await openEntry(page, context, page.getByTestId("guide-entry-more"), entry.entry);
      // 收起「更多」再點頁尾（面板固定在底部分頁列之上）。
      await page.getByTestId("mobile-tabbar-more").click();
      await expect(page.getByTestId("mobile-tabbar-more")).toHaveAttribute("aria-expanded", "false");
    } else {
      await expect(page.getByTestId("guide-entry-more")).toBeHidden();
      await openEntry(page, context, page.getByTestId("guide-entry-sidebar"), entry.entry);
    }
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    await expect(demoValue).toHaveText(formatAmountL1(DEMO_RESULT));

    // 頁尾「指標定義」旁。
    await openEntry(page, context, page.getByTestId("guide-entry-footer"), entry.entry);
    await expect(page.getByTestId("kpi-band")).toBeVisible();
    await expect(demoValue).toHaveText(formatAmountL1(DEMO_RESULT));
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });
});

/** V41-2a：功能區頁的步驟文字（guideLabels.guide.areas.{area}.steps；V41-2a 起加）。型別放寬成選填，缺字時 required() 丟錯讓測試失敗。 */
interface GuideStepCopy { title?: string; body?: string; alt?: string; caption?: string }
const areaSteps = (area: GuideAreaCode) => (g.areas[area] as { title: string; steps?: Record<string, GuideStepCopy> }).steps ?? {};
const required = (value: string | undefined, path: string) => {
  if (value === undefined) throw new Error(`guideLabels 缺 ${path}`);
  return text(value);
};
/** 原尺寸連結的 sr-only 文字（guide.common.fullSize）。 */
const fullSize = () => required((g.common as { pageTitle: string; fullSize?: string }).fullSize, "guide.common.fullSize");
/** 媒體清單 src/application/guide-media.json 的一筆（file＝public/ 之下的路徑，例如 guide/start/start-load.webp）。 */
interface GuideMediaEntry { id: string; file: string; width: number; height: number; bytes: number; sha256: string; labels_hash: string }
const MEDIA = guideMedia.media as GuideMediaEntry[];
/** 390 寬時「顯示寬度／naturalWidth」低於這個值的圖要列進驗收文件、優先改成更窄的裁切（06_BATCHES V41-2a 第 5 項；只記錄、不斷言）。 */
const NARROW_RATIO = 0.45;

test.describe("V41-2a 功能區頁", () => {
  for (const { area, steps } of GUIDE_AREAS) {
    test(`/guide/${area}：200、h1 唯一、目錄錨點跳到步驟、不橫向捲動、每張圖載得到且有原尺寸連結、axe 0 serious`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors = collectErrors(page);
      await hideDevOverlay(page);
      const path = guideAreaPath(area);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const copy = areaSteps(area);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(text(g.areas[area].title));
      const root = page.getByTestId(`guide-area-${area}`);
      await expect(root).toBeVisible();
      const toc = page.getByTestId("guide-toc");
      await expect(toc).toBeVisible();

      // 目錄：依步驟順序列出；每個錨點都跳到自己的步驟（網址帶 #stepKey、步驟與它的 h2 進到視窗內）。
      const links = toc.getByRole("link");
      await expect(links).toHaveCount(steps.length);
      for (const [index, { key }] of steps.entries()) {
        const title = required(copy[key]?.title, `guide.areas.${area}.steps.${key}.title`);
        const link = links.nth(index);
        await expect(link).toHaveText(title);
        await expect(link).toHaveAttribute("href", `#${key}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await link.click();
        await expect(page).toHaveURL(new RegExp(`#${escape(key)}$`));
        const step = page.getByTestId(`guide-step-${area}-${key}`);
        await expect(step).toHaveAttribute("id", key);
        await expect(step).toBeInViewport();
        const heading = step.getByRole("heading", { level: 2 });
        await expect(heading).toHaveText(title);
        await expect(heading).toBeInViewport();
      }

      // 不橫向捲動（四尺寸）。
      await page.evaluate(() => window.scrollTo(0, 0));
      const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, width: window.innerWidth }));
      expect(scroll.scrollWidth, `scrollWidth ${scroll.scrollWidth} ≤ 視窗寬 ${scroll.width}`).toBeLessThanOrEqual(scroll.width);

      // 每張圖：依步驟順序各一張，在自己的步驟裡；捲進視窗後載入完成；外包的連結是原尺寸檔（導覽，不是下載）。
      await expect(root.locator("img")).toHaveCount(steps.length);
      const shots: { mediaId: string; src: string; displayedWidth: number; naturalWidth: number; ratio: number; belowThreshold: boolean }[] = [];
      for (const [index, { key, mediaId }] of steps.entries()) {
        const src = `/guide/${area}/${mediaId}.webp`;
        const entry = MEDIA.find(item => item.id === mediaId);
        expect(entry, `媒體清單 src/application/guide-media.json 有 ${mediaId}`).toBeDefined();
        expect(`/${entry!.file}`, `${mediaId} 的檔名`).toBe(src);
        const alt = required(copy[key]?.alt, `guide.areas.${area}.steps.${key}.alt`);
        const figure = page.getByTestId(`guide-step-${area}-${key}`).getByTestId(`guide-shot-${mediaId}`);
        await expect(figure).toHaveCount(1);
        const img = figure.locator("img");
        await expect(img).toHaveCount(1);
        await expect(img).toHaveAttribute("src", src);
        await expect(img).toHaveAttribute("alt", alt);
        await expect(img).toHaveAttribute("width", String(entry!.width));
        await expect(img).toHaveAttribute("height", String(entry!.height));
        await expect(img).toHaveAttribute("decoding", "async");
        // 頁面上第一張圖不 lazy（首屏可能看得到），其餘一律 lazy。
        if (index === 0) expect(await img.getAttribute("loading"), `${mediaId}：第一張圖不 lazy`).not.toBe("lazy");
        else await expect(img).toHaveAttribute("loading", "lazy");
        const fullLink = figure.locator("a:has(img)");
        await expect(fullLink).toHaveCount(1);
        await expect(fullLink).toHaveAttribute("href", src);
        // 可及名稱＝alt＋原尺寸（sr-only；Chromium 在兩段之間補一個空白，同入口的 entryName）。
        await expect(fullLink).toHaveAccessibleName(new RegExp(`^${escape(alt)}\\s?${escape(fullSize())}$`));
        await expect(figure.locator("figcaption")).toContainText(required(copy[key]?.caption, `guide.areas.${area}.steps.${key}.caption`));
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `${mediaId} 捲進視窗後載入完成` }).toBe(true);
        if (testInfo.project.name === "mobile") {
          const size = await img.evaluate((el: HTMLImageElement) => ({ displayed: el.getBoundingClientRect().width, natural: el.naturalWidth }));
          const ratio = Math.round((size.displayed / size.natural) * 1000) / 1000;
          shots.push({ mediaId, src, displayedWidth: Math.round(size.displayed * 10) / 10, naturalWidth: size.natural, ratio, belowThreshold: ratio < NARROW_RATIO });
        }
      }
      if (testInfo.project.name === "mobile") {
        const written = await writeLaunchJson("GUIDE_SHOTS_OUT", "guide-shots.json", testInfo, { checked_at: new Date().toISOString(), viewport: testInfo.project.use.viewport, path, threshold: NARROW_RATIO, shots, belowThreshold: shots.filter(shot => shot.belowThreshold).map(shot => shot.mediaId), note: "V41-2a：390 寬每張圖的顯示寬度（CSS px）／naturalWidth；低於 threshold 的列進驗收文件，優先改成更窄的裁切（只記錄、不斷言）" }, area);
        testInfo.annotations.push({ type: "guide-shots", description: written });
      }

      expect(await axeBlocking(page), `${path}：axe serious／critical 必須為 0`).toEqual([]);
      expect(errors, `${errors.length} console／page errors`).toEqual([]);
    });
  }

  test("說明首頁的功能區目錄：每個已上線的功能區恰好一張卡、依序連到 /guide/{area}；/guide/overview#bridge 落在 bridge 步驟", async ({ page }) => {
    const errors = collectErrors(page);
    await hideDevOverlay(page);
    // 直接開 /guide/overview#bridge：瀏覽器捲到 id="bridge" 的步驟（說明首頁「獨特性」的金額橋接連到這裡）。
    await page.goto("/guide/overview#bridge");
    const bridge = page.getByTestId("guide-step-overview-bridge");
    await expect(bridge).toHaveAttribute("id", "bridge");
    await expect(bridge).toBeInViewport();

    await page.goto("/guide");
    const catalog = page.locator("#areas");
    await expect(catalog).toBeVisible();
    const cards = catalog.getByRole("link");
    await expect(cards).toHaveCount(GUIDE_AREAS.length);
    for (const [index, { area }] of GUIDE_AREAS.entries()) {
      await expect(cards.nth(index)).toHaveAttribute("href", guideAreaPath(area));
      await expect(cards.nth(index)).toContainText(text(g.areas[area].title));
      await expect(catalog.locator(`a[href="${guideAreaPath(area)}"]`)).toHaveCount(1);
    }

    // 從說明首頁點「在哪裡看得到」的 /guide/overview#bridge。
    await page.getByTestId("guide-hub").locator('a[href="/guide/overview#bridge"]').first().click();
    await expect(page).toHaveURL(/\/guide\/overview#bridge$/);
    await expect(bridge).toBeInViewport();
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });
});

/** V41-3：媒體清單 videos 的一支影片（file、vtt、poster 是 public/ 之下的路徑，例如 guide/video/start-30s.mp4）。 */
interface GuideVideoEntry { id: string; file: string; vtt: string; poster: string; width: number; height: number; bytes: number; cues: { key: string }[] }
const VIDEO_ENTRIES = (guideMedia as unknown as { videos?: GuideVideoEntry[] }).videos ?? [];
/** 一支影片的文字（guideLabels.guide.videos.{id}；V41-3 起加）。 */
const videoCopy = (id: string) => {
  const copy = (g as unknown as { videos?: Record<string, { title: string; cues: Record<string, string> }> }).videos?.[id];
  if (!copy) throw new Error(`guideLabels 缺 guide.videos.${id}`);
  return copy;
};
/** 字幕與逐字稿比對時拿掉空白與換行（字幕檔可以把一句拆成兩行）。 */
const squash = (value: string) => value.replace(/\s+/g, "");

/** axe 的 video-caption 規則（WCAG 1.2.2；有 <track kind="captions"> 才通過，沒有時是 incomplete）：回傳通過的節點數與違規、待確認的數量。axe 要先注入（axeBlocking）。 */
const axeVideoCaption = (page: Page) => page.evaluate(async () => {
  const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<Record<"passes" | "violations" | "incomplete", { nodes: unknown[] }[]>> } }).axe;
  const result = await axe.run(document, { runOnly: { type: "rule", values: ["video-caption"] } });
  return { passes: result.passes.reduce((sum, rule) => sum + rule.nodes.length, 0), violations: result.violations.length, incomplete: result.incomplete.length };
});

test.describe("V41-3 示範影片", () => {
  for (const video of GUIDE_VIDEOS) for (const where of video.pages) {
    const path = where === "hub" ? "/guide" : guideAreaPath(where);
    test(`${path}：${video.id} 看得到、首載不下載影片、Tab 到得了原生控制、字幕與逐字稿一致、axe video-caption 通過`, async ({ page }) => {
      test.setTimeout(90_000);
      // 影片是 V41-3 的交付物：清單沒有這支影片就失敗（不略過）。
      const entry = VIDEO_ENTRIES.find(item => item.id === video.id);
      expect(entry, `媒體清單 src/application/guide-media.json 的 videos 要有 ${video.id}`).toBeDefined();
      const copy = videoCopy(video.id);
      const cueTexts = video.cues.map(cue => text(copy.cues[cue.key]));
      const errors = collectErrors(page);
      const requested: string[] = [];
      page.on("request", request => requested.push(new URL(request.url()).pathname));
      await hideDevOverlay(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState("networkidle");

      const figure = page.getByTestId(`guide-video-${video.id}`);
      await expect(figure).toHaveCount(1);
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toBeVisible();
      if (where === "hub") await expect(page.locator("#quickstart").getByTestId(`guide-video-${video.id}`)).toHaveCount(1);
      else await expect(page.getByTestId(`guide-area-${where}`).getByTestId(`guide-video-${video.id}`)).toHaveCount(1);

      // <video>：可及名稱＝影片標題；preload=none、poster、原生 controls；不自動播放、不循環；首載後沒有載入任何影片資料（readyState 0）。
      const player = figure.locator("video");
      await expect(player).toHaveCount(1);
      await expect(player).toBeVisible();
      await expect(player).toHaveAccessibleName(text(copy.title));
      await expect(player).toHaveAttribute("preload", "none");
      await expect(player).toHaveAttribute("poster", `/${entry!.poster}`);
      // 圖說＝影片標題，另起一行資料來源註記（同截圖：import-wizard 是合成資料，其餘是示範資料；GUIDE_CONTENT §0）。
      await expect(figure.locator("figcaption > span")).toHaveText([text(copy.title), text(video.note === "synthetic" ? g.common.syntheticCaption : g.common.demoCaption)]);
      const state = await player.evaluate((el: HTMLVideoElement) => ({ controls: el.controls, autoplay: el.autoplay, loop: el.loop, muted: el.muted, paused: el.paused, readyState: el.readyState, sources: [...el.querySelectorAll("source")].map(source => [source.getAttribute("src"), source.getAttribute("type")]) }));
      expect(state).toEqual({ controls: true, autoplay: false, loop: false, muted: false, paused: true, readyState: 0, sources: [[`/${entry!.file}`, "video/mp4"]] });

      // 外框高度＝寬度 × 清單的高／寬（poster 載入前後不變，沒有版面位移）；不造成橫向捲動。
      const box = await player.boundingBox();
      expect(Math.abs(box!.height - box!.width * entry!.height / entry!.width), `影片外框 ${box!.width}×${box!.height}`).toBeLessThanOrEqual(1);
      const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement!.scrollWidth, width: window.innerWidth }));
      expect(scroll.scrollWidth, `scrollWidth ${scroll.scrollWidth} ≤ 視窗寬 ${scroll.width}`).toBeLessThanOrEqual(scroll.width);
      expect(box!.x + box!.width).toBeLessThanOrEqual(scroll.width);

      // 字幕軌：kind=captions、srclang=zh-Hant-TW、預設顯示；字幕檔載入後 cue 數＝GUIDE_VIDEOS 的 cue 數，每段＝逐字稿同一項。
      const track = player.locator("track");
      await expect(track).toHaveCount(1);
      await expect(track).toHaveAttribute("kind", "captions");
      await expect(track).toHaveAttribute("srclang", "zh-Hant-TW");
      await expect(track).toHaveAttribute("src", `/${entry!.vtt}`);
      await expect.poll(() => track.evaluate((el: HTMLTrackElement) => el.readyState), { message: `${entry!.vtt} 載入完成` }).toBe(2);
      const cues = await player.evaluate((el: HTMLVideoElement) => ({ mode: el.textTracks[0]?.mode, kind: el.textTracks[0]?.kind, texts: [...(el.textTracks[0]?.cues ?? [])].map(cue => (cue as VTTCue).text) }));
      expect(cues.kind).toBe("captions");
      expect(cues.mode).toBe("showing");
      expect(cues.texts.map(squash)).toEqual(cueTexts.map(squash));

      // 影片說明一行與逐字稿 <ol>：項數＝cue 數，文字＝guide.videos.{id}.cues（純文字）。
      await expect(figure.locator("p.guide-video-note")).toHaveText(text(g.common.videoNote));
      const transcript = figure.locator("ol.guide-video-transcript > li");
      await expect(transcript).toHaveCount(video.cues.length);
      await expect(transcript).toHaveText(cueTexts);

      // 鍵盤：影片前一個停留點按 Tab 到達 <video>（焦點看得到），再按 Tab 走過原生控制（焦點在影片的 UA shadow 內），最後離開影片到它之後的元素。
      const hasBefore = await player.evaluate((el: HTMLVideoElement) => {
        const stops = [...document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,summary,video[controls],[tabindex]")].filter(item => item.tabIndex >= 0 && item.checkVisibility());
        const before = stops.filter(item => item.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
        before?.setAttribute("data-v41-before-video", "");
        return !!before;
      });
      expect(hasBefore, "影片前面要有一個 Tab 停留點").toBe(true);
      await page.locator("[data-v41-before-video]").focus();
      await page.keyboard.press("Tab");
      expect(await player.evaluate((el: HTMLVideoElement) => document.activeElement === el && el.matches(":focus-visible")), "Tab 到達 <video>，焦點看得到").toBe(true);
      let presses = 0;
      while (presses < 10 && await player.evaluate((el: HTMLVideoElement) => el.matches(":focus-within"))) { await page.keyboard.press("Tab"); presses++; }
      expect(presses, "影片本身之後還有原生控制可以 Tab 到").toBeGreaterThan(1);
      expect(presses, "Tab 會離開影片（沒有焦點陷阱）").toBeLessThan(10);
      expect(await player.evaluate((el: HTMLVideoElement) => { const active = document.activeElement; return !!active && active !== document.body && !!(el.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING); }), "離開影片後焦點在影片之後的元素").toBe(true);
      expect(await player.evaluate((el: HTMLVideoElement) => ({ paused: el.paused, readyState: el.readyState })), "只用 Tab 走過不會開始播放或載入").toEqual({ paused: true, readyState: 0 });

      // 首載、捲到影片與 Tab 走過影片：/guide/video/ 只請求 poster 與字幕檔，沒有任何 .mp4。
      await page.waitForLoadState("networkidle");
      const videoRequests = requested.filter(pathname => pathname.startsWith("/guide/video/"));
      expect(requested.filter(pathname => pathname.endsWith(".mp4")), "preload=none：首載不下載影片").toEqual([]);
      expect(videoRequests.filter(pathname => pathname !== `/${entry!.poster}` && pathname !== `/${entry!.vtt}`), "/guide/video/ 只允許 poster 與字幕檔").toEqual([]);

      expect(await axeBlocking(page), `${path}：axe serious／critical 必須為 0`).toEqual([]);
      expect(await axeVideoCaption(page), `${path}：axe video-caption 通過（有 <track kind="captions">）`).toEqual({ passes: 1, violations: 0, incomplete: 0 });

      // 影片檔本身（使用者按播放時才會請求）：200、video/mp4、大小＝清單的 bytes。
      const mp4 = await page.request.get(`/${entry!.file}`);
      expect(mp4.status()).toBe(200);
      expect(mp4.headers()["content-type"]).toContain("video/mp4");
      expect((await mp4.body()).length).toBe(entry!.bytes);
      expect(errors, `${errors.length} console／page errors`).toEqual([]);
    });
  }
});
