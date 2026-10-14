import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { GUIDE_AREA_STEPS, type GuideAreaCode } from "../../src/application/guide";
import { labels } from "../../src/i18n";
import { chooseBasis, confirmAndCheck, confirmMappingIfShown, importViaWizard, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard } from "../../tests/e2e/import-wizard-helpers";
import { FIXED_NOW, loadDemo } from "../revamp-v4-capture/shared";
import { labelsHash } from "./labels-hash";

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

/** S5 4 通路合成資料：精靈匯入 tests/fixtures/synthetic-4-channel（帶 manifest；LIVE 有缺列，檢核結果 partial），本機保存提示按「暫時不要」。D-V41-21＝A。 */
export async function stateSynthetic(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await importViaWizard(page, SYNTHETIC_4_CHANNEL_DIR, { manifest: true, classification: "partial" });
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("kpi-band")).toBeVisible();
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
const HIGHLIGHT_STYLE = `.${HIGHLIGHT_CLASS} { outline: 3px solid var(--accent) !important; outline-offset: var(--guide-media-highlight-offset, 2px) !important; }`;
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
export async function unionClip(page: Page, regions: readonly Region[], options: { pad: number; across?: readonly Region[]; maxWidth?: number }): Promise<Clip> {
  const { pad } = options;
  const boxes = await Promise.all(regions.map(regionBox));
  const horizontal = options.across ? await Promise.all(options.across.map(regionBox)) : boxes;
  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const left = Math.max(0, Math.floor(Math.min(...horizontal.map(box => box.left)) - pad));
  const top = Math.max(0, Math.floor(Math.min(...boxes.map(box => box.top)) - pad));
  const right = Math.min(docWidth, Math.ceil(Math.max(...horizontal.map(box => box.right)) + pad));
  const bottom = Math.ceil(Math.max(...boxes.map(box => box.bottom)) + pad);
  return { x: left, y: top, width: Math.min(right - left, options.maxWidth ?? Infinity), height: bottom - top };
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
/** 2 格縮排、結尾換行；media 依 GUIDE_AREA_STEPS 的順序，不在 GUIDE_AREA_STEPS 的項目不寫。 */
async function writeManifest(manifest: GuideMediaManifest) {
  const order = GUIDE_MEDIA_STEPS.map(step => step.mediaId);
  const media = order.map(id => manifest.media.find(entry => entry.id === id)).filter((entry): entry is GuideMediaEntry => entry !== undefined);
  await writeFile(MANIFEST_PATH, `${JSON.stringify({ updated: manifest.updated, media }, null, 2)}\n`);
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
