import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { GUIDE_AREA_STEPS, GUIDE_VIDEOS, type GuideAreaCode, type GuideVideo } from "../../src/application/guide";
import { labels } from "../../src/i18n";
import { chooseBasis, confirmAndCheck, confirmMappingIfShown, importViaWizard, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard } from "../../tests/e2e/import-wizard-helpers";
import { FIXED_NOW, calculateKeepPreset, goTo, loadDemo, navigateTo } from "../revamp-v4-capture/shared";
import { labelsHash } from "./labels-hash";
import { buildVtt, mp4Info, VIDEO_MAX_BYTES, videoCueBaseline, videoCueTexts, videoFile, videoLabelsHash, videoPosterFile, videoVttFile, VIDEO_SIZE, type GuideVideoCueEntry, type GuideVideoEntry } from "./vtt";

// V41-2a 說明頁媒體管線的共用 helper（docs/revamp-v4.1/01_PRD.md §3.5；GUIDE_CONTENT.md §0 擷取狀態）：擷取狀態、強調框、裁切範圍、WebP 轉檔與媒體清單讀寫。
// 所有字串由 labels 取字，與 tests/e2e、verification/revamp-v4-capture 同一套選擇器與流程；只注入擷取的頁面，不改產品程式。

/** GUIDE_MEDIA=write 才寫檔（基準 PNG 由 Playwright 的 updateSnapshots: "changed" 寫；WebP 與清單由 syncMedia 寫）；其他值（含未設定）都是 check，不寫任何檔。 */
export const GUIDE_MEDIA_WRITE = process.env.GUIDE_MEDIA === "write";

/** 桌機 1440×1000、手機 390×844（mediaId 以 -m 結尾），deviceScaleFactor 1（config 的 use）。 */
export const DESKTOP = { width: 1440, height: 1000 } as const;
export const MOBILE = { width: 390, height: 844 } as const;
export const isMobileMedia = (mediaId: string) => mediaId.endsWith("-m");

/** GUIDE_AREA_STEPS 攤平成擷取順序（＝清單 media 的順序）。 */
export interface GuideMediaStep {
  area: GuideAreaCode;
  stepKey: string;
  mediaId: string;
}
export const GUIDE_MEDIA_STEPS: readonly GuideMediaStep[] = (Object.entries(GUIDE_AREA_STEPS) as [GuideAreaCode, readonly { key: string; mediaId: string }[]][])
  .flatMap(([area, steps]) => steps.map(step => ({ area, stepKey: step.key, mediaId: step.mediaId })));

/** 公開檔（相對 public/）、基準 PNG 與清單的路徑。 */
export const mediaFile = (area: GuideAreaCode, mediaId: string) => `guide/${area}/${mediaId}.webp`;
export const BASELINE_DIR = resolve("verification/guide-media/baseline");
export const baselinePath = (mediaId: string) => resolve(BASELINE_DIR, `${mediaId}.png`);
export const MANIFEST_PATH = resolve("src/application/guide-media.json");

// ── 擷取狀態（GUIDE_CONTENT §0）──────────────────────────────────────────────

const INCLUSIVE_TAX_DIR = resolve("tests/fixtures/inclusive_tax");
const MISSING_AD_DAY_DIR = resolve("fixtures/errors/missing_ad_day");
const SYNTHETIC_4_CHANNEL_DIR = resolve("tests/fixtures/synthetic-4-channel");

/** S0 首頁空狀態：開 /，不載入資料。 */
export async function stateEmptyHome(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await expect(page.getByTestId("empty-state")).toBeVisible();
}

/** S1 示範資料、預設期間：沿用畫面基準的 loadDemo（固定時鐘、按「載入示範資料」、本機保存提示按「暫時不要」）。 */
export const stateDemo = loadDemo;

/**
 * S3 匯入精靈（含稅）：空狀態開精靈、選 tests/fixtures/inclusive_tax 三個檔（同畫面基準 12 與 tests/e2e/import-wizard.spec.ts 的含稅流程），停在第 step 步。
 * 這組檔的欄名全是標準欄名，第 2 步會自動完成；第 2 步的畫面由第 3 步按「上一步」回看（自動完成的第 2 步也會經過）。
 */
export async function stateInclusiveWizard(page: Page, step: 1 | 2 | 3 | 4) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await openWizard(page);
  await setWizardFiles(page, INCLUSIVE_TAX_DIR);
  if (step === 1) return;
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  if (step === 2) {
    await wizard(page).getByRole("button", { name: labels.importWizard.back, exact: true }).click();
    await expect(page.getByTestId("import-step-2")).toBeVisible();
    return;
  }
  await chooseBasis(page, "inclusive");
  if (step === 3) return;
  await confirmAndCheck(page, "valid");
}

/** S4 有資料問題（缺廣告列）：精靈套用 fixtures/errors/missing_ad_day 三個檔與 manifest（唯讀），停在第 4 步檢核結果（partial）。 */
export async function stateMissingAdDayReview(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await openWizard(page);
  await setWizardFiles(page, MISSING_AD_DAY_DIR);
  await setWizardManifest(page, resolve(MISSING_AD_DAY_DIR, "manifest.json"));
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "partial");
}

/** 精靈套用 directory 的三個檔與 manifest（檢核結果 partial），本機保存提示按「暫時不要」，停在總覽。 */
async function importPartial(page: Page, directory: string) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await importViaWizard(page, directory, { manifest: true, classification: "partial" });
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("kpi-band")).toBeVisible();
}

/** S5 4 通路合成資料：精靈匯入 tests/fixtures/synthetic-4-channel（帶 manifest；LIVE 有缺列，檢核結果 partial），本機保存提示按「暫時不要」。D-V41-21＝A。 */
export const stateSynthetic = (page: Page) => importPartial(page, SYNTHETIC_4_CHANNEL_DIR);

/** V41-2b：S4 套用到工作台——精靈套用 fixtures/errors/missing_ad_day 三個檔與 manifest（唯讀；MARKETPLACE 缺 8/2 的廣告列，檢核結果 partial），本機保存提示按「暫時不要」。資料來源頁的涵蓋時間軸與資料問題用。 */
export const stateMissingAdDay = (page: Page) => importPartial(page, MISSING_AD_DAY_DIR);

// ── V41-2b 錨點：擷取狀態 S6–S8（GUIDE_CONTENT §0）──────────────────────────────

/** S6 第 2 個方案套用的範本：砍廣告一半（範本只是起點；方案 2 試算後與現況有差額，方案差額圖與比較表才看得出「並排比較」）。 */
export const S6_SECOND_PRESET = "cut_ads_half";

/**
 * S6 S1＋已試算：到假設試算，方案 1 用 calculateKeepPreset（範本「維持現況」、同意聲明、試算），再按「新增方案」加方案 2，
 * 方案 2 套用範本 S6_SECOND_PRESET 並試算（聲明已記住，不再有勾選框）。停在假設試算頁。
 */
export async function stateScenarios(page: Page) {
  await stateDemo(page);
  await navigateTo(page, "scenarios");
  await calculateKeepPreset(page);
  await page.getByTestId("scenario-add").click();
  const card = page.getByTestId("scenario-2");
  await expect(card).toBeVisible();
  await card.getByTestId("scenario-preset").selectOption(S6_SECOND_PRESET);
  await card.getByTestId("scenario-preset-apply").click();
  await expect(card.getByTestId("scenario-acknowledged")).toBeVisible();
  await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toBeVisible();
}

/**
 * S7 S6＋待辦與選入會議：通路健檢第一項按「加入待辦」（切到待辦頁、新增一張卡），回假設試算把方案 1 按「選入會議」，再切到會議紀錄確認議程 5 有選入的方案。停在會議紀錄頁。
 */
export async function stateActionsAndMeeting(page: Page) {
  await stateScenarios(page);
  await goTo(page, "diagnosis", page.getByTestId("diagnosis-list"));
  await page.getByTestId("diagnosis-list").locator(":scope > li").first().getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }).click();
  await expect(page.getByTestId("board-card-1")).toBeVisible();
  await navigateTo(page, "scenarios");
  await page.getByTestId("scenario-select-1").click();
  await goTo(page, "meeting", page.getByTestId("meeting-page"));
  await expect(page.getByTestId("meeting-scenario-results")).toBeVisible();
}

/** S8 S7＋已結束一次會議：會議紀錄按「結束會議」並在確認區按「確認」，等會議歷史出現一筆。停在會議紀錄頁。 */
export async function stateFinalized(page: Page) {
  await stateActionsAndMeeting(page);
  await page.getByTestId("meeting-finalize").click();
  await page.getByTestId("meeting-finalize-confirm-button").click();
  await expect(page.getByTestId("meeting-history-item")).toHaveCount(1);
}

// ── 截圖前的穩定、強調框與裁切範圍 ─────────────────────────────────────────────

/**
 * 裁切範圍的一塊：元素本身的外框，或 { contents } 元素內文字實際佔的範圍（例如期間摘要的 <p> 撐滿整列，只要文字那一段）。
 */
export type Region = Locator | { contents: Locator };
const regionLocator = (region: Region) => ("contents" in region ? region.contents : region);

/**
 * 字型載入完、裁切範圍內延後掛載的圖都畫好（沒有 loading 骨架；收合的進階區塊裡的圖不掛載，所以只看裁切範圍），
 * 捲回頂端並把滑鼠移到左上角（不在截圖範圍留下 hover 底色）、移除焦點（點過的按鈕不留焦點框）。
 */
export async function settle(page: Page, regions: readonly Region[]) {
  await page.evaluate(async () => { await document.fonts.ready; });
  for (const region of regions) await expect(regionLocator(region).locator(".chart-frame[data-state='loading'], .chart-frame-skeleton, [data-testid='panel-loading']")).toHaveCount(0);
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
}

/**
 * 強調框（D-V41-20）：只注入擷取的頁面；外框用既有 token --accent 畫 3px，outline 不佔版面、不移動任何元素。
 * offset 是 outline-offset（px）：預設 2（畫在元素外 2–5px）；0 用在緊貼文字的圖形（框不壓到旁邊的數值）；
 * −3 畫在元素內（滿版的面板，外框才不會超出畫面；表格的格子，sticky 表頭與捲動容器不會蓋掉或裁掉外框）。
 */
export const HIGHLIGHT_CLASS = "guide-media-highlight";
export const HIGHLIGHT_STYLE = `.${HIGHLIGHT_CLASS} { outline: 3px solid var(--accent) !important; outline-offset: var(--guide-media-highlight-offset, 2px) !important; }`;
/** 預設 outline 畫在元素外 2＋3px；裁切範圍至少要多留這麼多。 */
export const HIGHLIGHT_REACH = 6;
export async function highlight(page: Page, targets: readonly Locator[], offset = 2) {
  if (targets.length === 0) return;
  await page.addStyleTag({ content: HIGHLIGHT_STYLE });
  for (const target of targets) {
    await expect(target).toHaveCount(1);
    // SVG 裡的圖形：外框畫在 <svg> 或固定高圖框（.chart-frame，overflow: hidden）的範圍外時會被裁掉（例如貼著圖右緣的柱），
    // 擷取時把這兩層設成 overflow: visible（圖的內容本來就在框內，圖形位置不變）。
    await target.evaluate((element, [name, px]) => {
      element.classList.add(name);
      if (px !== 2) (element as HTMLElement).style.setProperty("--guide-media-highlight-offset", `${px}px`);
      if (element instanceof SVGElement && element.ownerSVGElement) {
        element.ownerSVGElement.style.setProperty("overflow", "visible");
        (element.closest(".chart-frame") as HTMLElement | null)?.style.setProperty("overflow", "visible");
      }
    }, [HIGHLIGHT_CLASS, offset] as const);
  }
}

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** 一塊裁切範圍的文件座標（已捲回頂端）。 */
async function regionBox(region: Region): Promise<Box> {
  const locator = regionLocator(region);
  await expect(locator).toHaveCount(1);
  await expect(locator).toBeVisible();
  return locator.evaluate((element, contents) => {
    let rect = element.getBoundingClientRect();
    // contents：只量直屬的文字節點（sr-only 的補充說明是 absolute 定位的元素，不算進去）。
    if (contents) {
      const rects = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).map(node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect(); });
      if (rects.length) rect = new DOMRect(Math.min(...rects.map(r => r.left)), Math.min(...rects.map(r => r.top)), Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)), Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)));
    }
    return { left: rect.left + window.scrollX, top: rect.top + window.scrollY, right: rect.right + window.scrollX, bottom: rect.bottom + window.scrollY };
  }, "contents" in region);
}
/**
 * 裁切範圍＝regions 的聯集，四周各留 pad px，向外取整；左右不超出文件寬度、上緣不小於 0。
 * across 有值時左右改取 across 的聯集（例如商品表：上下到第 5 列，左右只到工具列的最後一個按鈕）；maxWidth 從左緣起算截斷寬度。
 */
export async function unionClip(page: Page, regions: readonly Region[], options: { pad: number; across?: readonly Region[]; maxWidth?: number; within?: Locator }): Promise<Clip> {
  const { pad } = options;
  const boxes = await Promise.all(regions.map(regionBox));
  const horizontal = options.across ? await Promise.all(options.across.map(regionBox)) : boxes;
  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  // V41-2b：within 有值時，裁切範圍不超出它的外框（對話框、抽屜：留白不帶到後面模糊的頁面；主內容區：上緣不帶到頂欄）。
  const bounds = options.within ? await regionBox(options.within) : { left: 0, top: 0, right: docWidth, bottom: Infinity };
  const left = Math.max(Math.floor(bounds.left), Math.floor(Math.min(...horizontal.map(box => box.left)) - pad));
  const top = Math.max(Math.floor(bounds.top), Math.floor(Math.min(...boxes.map(box => box.top)) - pad));
  const right = Math.min(Math.ceil(bounds.right), Math.ceil(Math.max(...horizontal.map(box => box.right)) + pad));
  const bottom = Math.min(Math.ceil(bounds.bottom), Math.ceil(Math.max(...boxes.map(box => box.bottom)) + pad));
  return { x: left, y: top, width: Math.min(right - left, options.maxWidth ?? Infinity), height: bottom - top };
}

/** V41-2b：滿版的區塊（標題、段落）擷取時設成 width: fit-content（display 不變、高度不變、不移動其他元素），強調框只圍住文字。回傳同一個 locator。 */
export async function fitContent(locator: Locator): Promise<Locator> {
  await locator.evaluate(element => (element as HTMLElement).style.setProperty("width", "fit-content"));
  return locator;
}

/** 收集 console error 與 pageerror；每個測試最後斷言為空。 */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

// ── WebP 轉檔與媒體清單（只在 GUIDE_MEDIA=write 執行）──────────────────────────────

export interface GuideMediaEntry {
  id: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  labels_hash: string;
}
export interface GuideMediaManifest {
  updated: string | null;
  media: GuideMediaEntry[];
  /** V41-3：示範影片（vtt.ts 的 GuideVideoEntry）；還沒有影片時不寫這個鍵。 */
  videos?: GuideVideoEntry[];
}

export const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
/** PNG 的寬高（IHDR：第 16–23 位元組）。 */
export function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
/** 今天的日期（台北，YYYY-MM-DD）；清單的 updated 只在實際更新了媒體時改。 */
export const taipeiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function readManifest(): Promise<GuideMediaManifest> {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as GuideMediaManifest;
}
/**
 * 2 格縮排、結尾換行；media 依 GUIDE_AREA_STEPS 的順序，不在 GUIDE_AREA_STEPS 的項目不寫。
 * V41-3：videos 依 GUIDE_VIDEOS 的順序寫在 media 之後（截圖的 syncMedia 也經過這裡，不會把影片洗掉）；沒有影片時不寫這個鍵（清單與 V41-2b 逐字相同）。
 */
async function writeManifest(manifest: GuideMediaManifest) {
  const order = GUIDE_MEDIA_STEPS.map(step => step.mediaId);
  const media = order.map(id => manifest.media.find(entry => entry.id === id)).filter((entry): entry is GuideMediaEntry => entry !== undefined);
  const videos = GUIDE_VIDEOS.map(video => manifest.videos?.find(entry => entry.id === video.id)).filter((entry): entry is GuideVideoEntry => entry !== undefined);
  await writeFile(MANIFEST_PATH, `${JSON.stringify({ updated: manifest.updated, media, ...(videos.length ? { videos } : {}) }, null, 2)}\n`);
}

/** 基準 PNG → WebP：在空白頁把 PNG 畫進 canvas，toDataURL("image/webp", 0.9)（Chromium 內建編碼器，有損；不需外部工具，D-V41-20）。 */
export async function pngToWebp(browser: Browser, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const base64 = await page.evaluate(async source => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", 0.9).replace(/^data:image\/webp;base64,/, "");
    }, png.toString("base64"));
    return Buffer.from(base64, "base64");
  } finally {
    await page.close();
  }
}

/**
 * write 模式在 toHaveScreenshot 之後呼叫：
 * - 基準 PNG 的 SHA-256 與清單不同（或清單沒有這一筆）→ 重轉 WebP、更新這一筆（寬高取自 PNG、bytes 是 WebP 的大小、sha256、labels_hash），updated 改成今天；
 * - SHA-256 相同、只有 labels_hash 不同 → 只更新 labels_hash（不重轉 WebP、不改 updated）；
 * - 都相同 → 不動任何檔。
 * 回傳做了什麼（給測試輸出）。check 模式不呼叫。
 */
export async function syncMedia(browser: Browser, step: GuideMediaStep): Promise<"webp" | "labels_hash" | "unchanged"> {
  if (!GUIDE_MEDIA_WRITE) throw new Error("syncMedia 只在 GUIDE_MEDIA=write 執行");
  const png = await readFile(baselinePath(step.mediaId));
  const sha256 = sha256Hex(png);
  const hash = labelsHash(step.area, step.stepKey);
  const manifest = await readManifest();
  const entry = manifest.media.find(item => item.id === step.mediaId);
  const file = mediaFile(step.area, step.mediaId);
  if (entry && entry.sha256 === sha256 && entry.file === file && existsSync(resolve("public", file))) {
    if (entry.labels_hash === hash) return "unchanged";
    entry.labels_hash = hash;
    await writeManifest(manifest);
    return "labels_hash";
  }
  const webp = await pngToWebp(browser, png);
  const target = resolve("public", file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, webp);
  const next: GuideMediaEntry = { id: step.mediaId, file, ...pngSize(png), bytes: webp.length, sha256, labels_hash: hash };
  manifest.media = [...manifest.media.filter(item => item.id !== step.mediaId), next];
  manifest.updated = taipeiToday();
  await writeManifest(manifest);
  return "webp";
}

// ── V41-3 錨點：示範影片（錄影的頁面操作、cue 比對、MP4 轉檔、poster、字幕與清單）──────────────────────────
// 錄影只在 GUIDE_MEDIA=write：Playwright recordVideo（WebM）→ 本機 ffmpeg 轉 MP4（H.264、yuv420p、無音軌、+faststart；D-V41-7＝A，ffmpeg 不進 package.json）。
// check（預設）照同一個流程、同樣的停留時間重跑但不錄影，每個 cue 擷取一張視窗截圖與 baseline/video/{id}-{cue}.png 比對；不寫任何檔。

/** 錄影頁上，按下之前先在目標畫強調框的時間（影片沒有游標，讓觀眾知道要按哪裡）。 */
export const VIDEO_RING_MS = 800;
/** 每個 cue 至少這麼長（字幕讀得完）；cue 的結果畫面至少停這麼久；最後一個 cue 結束後再多停這麼久。 */
export const VIDEO_MIN_CUE_MS = 5_000;
export const VIDEO_RESULT_MS = 2_000;
export const VIDEO_END_HOLD_MS = 1_500;

/** 強調框的樣式只注入一次（同 highlight() 的 HIGHLIGHT_STYLE；只在擷取／錄影的頁面，不改產品程式）。 */
async function ensureHighlightStyle(page: Page) {
  await page.evaluate(([css, id]) => {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.append(style);
  }, [HIGHLIGHT_STYLE, "guide-video-highlight-style"] as const);
}

/** 等捲動停下來（smooth 捲動）：視窗與所有捲動容器的位置連續 4 次（每 50 ms）都沒變。 */
export async function waitScrollIdle(page: Page) {
  await page.evaluate(() => new Promise<void>(done => {
    const positions = () => JSON.stringify([window.scrollY, ...[...document.querySelectorAll("*")].filter(element => element.scrollTop > 0).map(element => element.scrollTop)]);
    let last = "";
    let stable = 0;
    const tick = () => {
      const now = positions();
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 4) done();
      else window.setTimeout(tick, 50);
    };
    tick();
  }));
}

/**
 * 目標不在可視範圍（扣掉 sticky 的頂欄、期間列、會議頁首、精靈底部動作列）時，smooth 捲到可視範圍中間並等捲動停下來；已經看得到就不捲。
 * 目標在頂欄（與它的選單）、期間列、會議頁首、精靈底部動作列、fixed 的區塊、抽屜與對話框裡時不捲視窗（捲了只會移動後面的頁面），
 * 只在它被區塊內的捲動容器裁掉時（例如「匯出」選單下方的「會議」組）smooth 捲那個容器。
 * 側欄是 sticky，但頁面捲到底時會被往上推出畫面（例如假設試算頁捲到方案下方再按「會議紀錄」），所以側欄裡的目標照一般規則捲視窗。
 */
export async function reveal(page: Page, target: Locator) {
  const scrolled = await target.evaluate(element => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      const pinned = position === "fixed" || node.tagName === "DIALOG" || node.getAttribute("role") === "dialog" || (position === "sticky" && node.matches(".topbar, .period-bar, .meeting-head, .wizard-footer"));
      if (!pinned) continue;
      for (let box = element.parentElement; box && box !== node.parentElement; box = box.parentElement) {
        if (!/(auto|scroll)/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight) continue;
        const outer = box.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const delta = rect.bottom > outer.bottom - 8 ? Math.min(rect.bottom - outer.bottom + 8, rect.top - outer.top - 8) : rect.top < outer.top + 8 ? rect.top - outer.top - 8 : 0;
        if (delta === 0) return false;
        box.scrollBy({ top: delta, behavior: "smooth" });
        return true;
      }
      return false;
    }
    let top = 0;
    let bottom = window.innerHeight;
    for (const bar of document.querySelectorAll(".topbar, .period-bar, .meeting-head, .wizard-footer")) {
      const position = getComputedStyle(bar).position;
      const rect = bar.getBoundingClientRect();
      if ((position !== "sticky" && position !== "fixed") || rect.height === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      if (rect.top < window.innerHeight / 2) top = Math.max(top, rect.bottom);
      else bottom = Math.min(bottom, rect.top);
    }
    const rect = element.getBoundingClientRect();
    if (rect.top >= top + 8 && rect.bottom <= bottom - 8) return false;
    window.scrollBy({ top: (rect.top + rect.bottom) / 2 - (top + bottom) / 2, behavior: "smooth" });
    return true;
  });
  if (scrolled) await waitScrollIdle(page);
}

/** smooth 捲到 target 的上緣貼在 sticky 頂欄與期間列下方 12 px（例如貢獻變化拆解整個圖框），並等捲動停下來。 */
export async function scrollToTop(page: Page, target: Locator) {
  await target.evaluate(element => {
    const top = Math.max(0, ...[...document.querySelectorAll(".topbar, .period-bar")].map(bar => (getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().bottom : 0)));
    window.scrollBy({ top: element.getBoundingClientRect().top - top - 12, behavior: "smooth" });
  });
  await waitScrollIdle(page);
}

/** 在 target 畫強調框 ms 毫秒後移除（不按）：指出這一段要看哪裡。target 不在可視範圍時先捲過去。 */
export async function point(page: Page, target: Locator, ms = VIDEO_RING_MS) {
  await expect(target).toBeVisible();
  await reveal(page, target);
  await ensureHighlightStyle(page);
  await target.evaluate((element, name) => element.classList.add(name), HIGHLIGHT_CLASS);
  await page.waitForTimeout(ms);
  await target.evaluate((element, name) => element.classList.remove(name), HIGHLIGHT_CLASS);
}

/** 強調框 VIDEO_RING_MS 之後按下 target，再把滑鼠移到左上角（不留 hover 底色；影片沒有游標）。 */
export async function ringClick(page: Page, target: Locator, ms = VIDEO_RING_MS) {
  await point(page, target, ms);
  await target.click();
  await page.mouse.move(0, 0);
}

/**
 * cue 擷取前的穩定：字型載入完、捲動停下來、視窗內沒有延後掛載中的圖或頁面骨架
 * （收合的進階區塊裡的圖不掛載、一直是 loading，所以只看畫面上看得到、和視窗有交集的）。
 */
export async function settleVideoFrame(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await waitScrollIdle(page);
  await page.waitForFunction(() => [...document.querySelectorAll(".chart-frame[data-state='loading'], .chart-frame-skeleton, [data-testid='panel-loading']")].every(element => {
    const rect = element.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight || element.closest("details:not([open])") !== null;
  }), undefined, { timeout: 15_000 });
}

/** cue 比對基準的絕對路徑（verification/guide-media/baseline/video/{id}-{cue}.png）。 */
export const videoCueBaselinePath = (id: string, key: string) => resolve(BASELINE_DIR, videoCueBaseline(id, key));
const fileSha = (path: string) => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);

/**
 * 一個 cue 的視窗截圖與基準比對（toHaveScreenshot，設定同截圖：maxDiffPixels 0、threshold 0.02、animations disabled）。
 * check：不符就失敗、不寫檔。write（updateSnapshots: "changed"）：不符或沒有基準時 Playwright 重寫基準；回傳基準有沒有被改寫（位元組比較前後）。
 */
export async function compareVideoCue(page: Page, id: string, key: string): Promise<boolean> {
  const path = videoCueBaselinePath(id, key);
  const before = fileSha(path);
  await expect(page, `${id} › ${key}`).toHaveScreenshot(videoCueBaseline(id, key).split("/"));
  return fileSha(path) !== before;
}

// ── 轉檔（本機 ffmpeg／ffprobe；GUIDE_FFMPEG 可指定 ffmpeg 路徑，ffprobe 取同一個目錄）──

const FFMPEG = process.env.GUIDE_FFMPEG ?? (existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");
const FFPROBE = FFMPEG.endsWith("ffmpeg") ? `${FFMPEG.slice(0, -"ffmpeg".length)}ffprobe` : "ffprobe";
const run = (command: string, args: readonly string[]) => new Promise<string>((done, fail) => {
  execFile(command, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => (error ? fail(new Error(`${command} ${args.join(" ")}\n${stderr || error.message}`)) : done(stdout)));
});

/** 影片檔的長度（毫秒，ffprobe 的 format=duration）。 */
export async function probeDurationMs(path: string): Promise<number> {
  const seconds = Number((await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path])).trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe 讀不到 ${path} 的長度`);
  return Math.round(seconds * 1000);
}

// ── 對時：錄影的時間軸與 Node 的 Date.now() 對齊 ──
// Playwright 的 WebM 從第一個畫面開始計時，與建立頁面的時刻差幾百毫秒且每次不同；停止時又會把最後一格補長，結尾也不準。
// 所以在第一個 cue 之前與最後一個 cue 之後，各在錄影頁蓋一層滿版的對時色塊 SYNC_MS 毫秒（只在片頭、片尾被切掉的範圍內，成品看不到），
// 記下移除色塊的 Node 時刻；轉檔前逐格讀 WebM 中央一點的顏色，找到色塊消失的那一格，兩者相減就是錄影時間與 Node 時間的差。

const SYNC_ID = "guide-video-sync";
const SYNC_COLOR = [255, 0, 255] as const;
const SYNC_MS = 300;
/** 色塊消失後到下一個動作之前的空白（對時誤差一格 40 ms 也不會把色塊切進成品）。 */
export const SYNC_GAP_MS = 300;
/** 片頭與片尾兩次對時的差容許 ±3 格（25 fps）。 */
const VIDEO_SYNC_TOLERANCE_MS = 120;

/** 蓋滿版對時色塊 SYNC_MS 毫秒再移除；回傳移除那一刻的 Node 時間（evaluate 前後的中點）。之後空 SYNC_GAP_MS 毫秒。 */
export async function syncFlash(page: Page): Promise<number> {
  await page.evaluate(([id, [r, g, b]]) => {
    const block = document.createElement("div");
    block.id = id;
    block.style.cssText = `position: fixed; inset: 0; z-index: 2147483647; background: rgb(${r}, ${g}, ${b});`;
    document.body.append(block);
  }, [SYNC_ID, SYNC_COLOR] as const);
  await page.waitForTimeout(SYNC_MS);
  const before = Date.now();
  await page.evaluate(id => document.getElementById(id)?.remove(), SYNC_ID);
  const at = Math.round((before + Date.now()) / 2);
  await page.waitForTimeout(SYNC_GAP_MS);
  return at;
}

/** WebM 每一格（25 fps）中央 2×2 的第一個像素是不是對時色；回傳每段色塊結束後第一格的時間（毫秒，取該格與前一格的中點）。 */
export async function findSyncFlashes(raw: string): Promise<number[]> {
  const pixels = await new Promise<Buffer>((done, fail) => {
    execFile(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", raw, "-vf", `crop=2:2:${VIDEO_SIZE.width / 2}:${VIDEO_SIZE.height / 2}`, "-r", "25", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => (error ? fail(new Error(`${FFMPEG} 讀不到 ${raw} 的畫面\n${stderr.toString() || error.message}`)) : done(stdout)));
  });
  const frames = pixels.length / 12;
  const isSync = (index: number) => Math.abs(pixels[index * 12] - SYNC_COLOR[0]) < 40 && Math.abs(pixels[index * 12 + 1] - SYNC_COLOR[1]) < 40 && Math.abs(pixels[index * 12 + 2] - SYNC_COLOR[2]) < 40;
  const ends: number[] = [];
  for (let index = 1; index < frames; index++) if (isSync(index - 1) && !isSync(index)) ends.push(index * 40 - 20);
  return ends;
}

/** H.264 的 CRF：從 VIDEO_CRF_START 起，檔案大於 VIDEO_MAX_BYTES 就加 VIDEO_CRF_STEP 再轉（最多到 VIDEO_CRF_MAX）。 */
const VIDEO_CRF_START = 28;
const VIDEO_CRF_STEP = 2;
const VIDEO_CRF_MAX = 40;

/** 錄好的 WebM → MP4：從 startMs 起取 durationMs（-ss 在 -i 之前、重新編碼，切點精確到影格），H.264（libx264、preset slow）、yuv420p、25 fps、無音軌、+faststart、不帶原檔的 metadata。回傳用的 CRF。 */
export async function encodeMp4(raw: string, target: string, startMs: number, durationMs: number): Promise<number> {
  await mkdir(dirname(target), { recursive: true });
  for (let crf = VIDEO_CRF_START; crf <= VIDEO_CRF_MAX; crf += VIDEO_CRF_STEP) {
    await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (startMs / 1000).toFixed(3), "-i", raw, "-t", (durationMs / 1000).toFixed(3), "-map", "0:v:0", "-an", "-map_metadata", "-1", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", target]);
    if ((await readFile(target)).length <= VIDEO_MAX_BYTES) return crf;
  }
  throw new Error(`${target}：CRF ${VIDEO_CRF_MAX} 仍大於 ${VIDEO_MAX_BYTES} bytes`);
}

/** 一支影片錄完的時間軸（Node 的 Date.now()）：片頭與片尾對時色塊移除的時刻、每個 cue 開始的時間、最後一個 cue 停留結束的時間。 */
export interface VideoTimeline {
  syncStart: number;
  cues: { key: string; at: number }[];
  end: number;
  syncEnd: number;
}

/** 這支影片的字幕文字：目前 guideLabels 的 cue 文字；還沒有文字的 cue 用「(guide.videos.{id}.cues.{key})」暫代並在輸出提醒（tests/guide-content.test.ts 會因字幕與 buildVtt 不符而失敗，補字後再跑 write）。 */
function cueTextsOrPlaceholder(video: GuideVideo): { texts: Record<string, string>; missing: string[] } {
  const texts = videoCueTexts(video.id);
  const missing = video.cues.filter(cue => !texts[cue.key]?.trim()).map(cue => cue.key);
  for (const key of missing) texts[key] = `(guide.videos.${video.id}.cues.${key})`;
  return { texts, missing };
}

/** 寫字幕檔（內容相同就不寫）；回傳有沒有寫。 */
async function writeVtt(entry: GuideVideoEntry, texts: Record<string, string>): Promise<boolean> {
  const target = resolve("public", entry.vtt);
  const vtt = buildVtt(entry, texts);
  if (existsSync(target) && (await readFile(target, "utf8")) === vtt) return false;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, vtt);
  return true;
}

/**
 * write 模式在錄完一支影片（頁面已關、raw 是 Playwright 存下的 WebM）之後呼叫：
 * - 每個 cue 的基準都沒被改寫、清單有這一筆且 cue 與基準雜湊相符、MP4 與 poster 都在 → 丟掉這次的錄影，不動影片與 poster；
 *   只在字幕文字或被引用的介面字串改了時重寫 .vtt、更新 labels_hash（不改 updated）。
 * - 否則（有 cue 不同或新增、或 MP4／poster 不在）：ffmpeg 轉 MP4、poster＝第一個 cue 的基準 PNG 轉 WebP（Chromium canvas 0.9，同截圖）、寫字幕與清單這一筆，updated 改成今天。
 *   只改了 cue 之間的過程（例如強調框、捲動）而每個 cue 的畫面都相同時不會重錄：要重錄就先刪掉 public/guide/video/{id}.mp4 再跑 write。
 * 影片時間的起點＝第一個 cue 開始的時刻：用片頭對時色塊算出 WebM 與 Node 時間的差（findSyncFlashes），cue 1 在 WebM 裡的位置＝cue 1 開始的 Node 時刻＋差；
 * 片尾色塊算出的差與片頭相差超過 VIDEO_SYNC_TOLERANCE_MS（錄影時間軸漂移）就失敗。cue 的 startMs＝開始時刻 − cue 1 開始時刻。
 */
export async function syncVideo(browser: Browser, video: GuideVideo, raw: string, timeline: VideoTimeline, changed: boolean): Promise<string> {
  if (!GUIDE_MEDIA_WRITE) throw new Error("syncVideo 只在 GUIDE_MEDIA=write 執行");
  const manifest = await readManifest();
  const existing = manifest.videos?.find(entry => entry.id === video.id);
  const baselines = video.cues.map(cue => ({ key: cue.key, sha256: fileSha(videoCueBaselinePath(video.id, cue.key)) }));
  const { texts, missing } = cueTextsOrPlaceholder(video);
  const note = missing.length ? `；字幕暫代 ${missing.length} 段（guideLabels 還沒有 guide.videos.${video.id}.cues）` : "";
  const keep = !changed && existing !== undefined && existsSync(resolve("public", existing.file)) && existsSync(resolve("public", existing.poster))
    && JSON.stringify(existing.cues.map(cue => [cue.key, cue.sha256])) === JSON.stringify(baselines.map(cue => [cue.key, cue.sha256]));
  if (keep) {
    const hash = videoLabelsHash(video.id);
    const hashChanged = existing.labels_hash !== hash;
    existing.labels_hash = hash;
    const vttChanged = await writeVtt(existing, texts);
    if (hashChanged) await writeManifest(manifest);
    return `${video.id}: unchanged（不重錄）${vttChanged ? "；重寫字幕" : ""}${hashChanged ? "；更新 labels_hash" : ""}${note}`;
  }
  const first = timeline.cues[0].at;
  const total = timeline.end - first;
  const rawMs = await probeDurationMs(raw);
  const flashes = await findSyncFlashes(raw);
  if (flashes.length !== 2) throw new Error(`${video.id}：WebM 裡找到 ${flashes.length} 段對時色塊（要 2 段：片頭、片尾）`);
  const offset = flashes[0] - timeline.syncStart;
  const drift = flashes[1] - timeline.syncEnd - offset;
  if (Math.abs(drift) > VIDEO_SYNC_TOLERANCE_MS) throw new Error(`${video.id}：片頭與片尾的對時差 ${drift} ms（容許 ±${VIDEO_SYNC_TOLERANCE_MS}）`);
  const startMs = first + offset;
  const mp4Path = resolve("public", videoFile(video.id));
  const crf = await encodeMp4(raw, mp4Path, startMs, total);
  const mp4 = await readFile(mp4Path);
  const info = mp4Info(mp4);
  const cues: GuideVideoCueEntry[] = timeline.cues.map((cue, index) => ({
    key: cue.key,
    startMs: cue.at - first,
    endMs: index + 1 < timeline.cues.length ? timeline.cues[index + 1].at - first : info.durationMs,
    sha256: baselines[index].sha256 ?? "",
  }));
  const poster = await pngToWebp(browser, await readFile(videoCueBaselinePath(video.id, video.cues[0].key)));
  await writeFile(resolve("public", videoPosterFile(video.id)), poster);
  const entry: GuideVideoEntry = {
    id: video.id, file: videoFile(video.id), vtt: videoVttFile(video.id), poster: videoPosterFile(video.id), ...VIDEO_SIZE,
    bytes: mp4.length, posterBytes: poster.length, durationMs: info.durationMs, cues, labels_hash: videoLabelsHash(video.id),
  };
  await writeVtt(entry, texts);
  manifest.videos = [...(manifest.videos ?? []).filter(item => item.id !== video.id), entry];
  manifest.updated = taipeiToday();
  await writeManifest(manifest);
  return `${video.id}: 重錄（WebM ${rawMs} ms，對時色塊在 ${flashes.join("、")} ms、片尾漂移 ${drift} ms；從 ${startMs} ms 起取 ${total} ms → MP4 ${info.durationMs} ms、${mp4.length} bytes、CRF ${crf}；poster ${poster.length} bytes）${note}`;
}
