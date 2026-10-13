import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, type Request, type TestInfo } from "@playwright/test";

/**
 * V4-3c（D-V4-42＝A，首載瘦身）：通路健檢、資料來源、商品毛利、會議紀錄、待辦與 AI 解釋改成隨頁載入，決策匯出、Excel、PPT 的程式改成按下時載入，
 * 資料就緒約 2 秒後在閒置時預先載入各頁與決策匯出的 chunk。第一次用到（或預先載入）時，瀏覽器向同一個網站要程式 chunk：
 * GET /_next/static/chunks/*.js，沒有內容、沒有查詢字串。這是程式檔，不帶任何使用者資料。
 * 「零網路」測試放寬到只放行這一種請求（D-V4-43 待使用者拍板，見 docs/revamp-v4/09_DECISIONS_PENDING.md）。
 */
export function isPageCodeChunk(request: Request, origin: string): boolean {
  const url = new URL(request.url());
  return request.method() === "GET" && url.origin === origin && url.search === "" && url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js") && request.postDataBuffer() === null;
}

/** 放行的程式 chunk：路徑與當時在哪一步（setPhase 標記）。 */
export interface AllowedChunk { path: string; phase: string }
/** 被攔下的其他請求（零網路測試斷言為空）。 */
export interface BlockedRequest { method: string; resourceType: string; hasBody: boolean }

/**
 * 零網路測試的網路規則：程式 chunk（isPageCodeChunk）放行並逐筆記下路徑與步驟（chunks），其餘請求一律攔下並記錄（blocked）。
 * setPhase 標記目前在哪一步，讓測試斷言某一段（例如讀檔、匯入精靈）完全沒有放行任何請求。
 */
export async function guardZeroNetwork(page: Page) {
  const origin = new URL(page.url()).origin;
  const blocked: BlockedRequest[] = [];
  const chunks: AllowedChunk[] = [];
  let phase = "start";
  await page.route("**/*", async route => {
    const request = route.request();
    if (isPageCodeChunk(request, origin)) { chunks.push({ path: decodeURIComponent(new URL(request.url()).pathname), phase }); await route.continue(); return; }
    blocked.push({ method: request.method(), resourceType: request.resourceType(), hasBody: request.postDataBuffer() !== null });
    await route.abort("blockedbyclient");
  });
  return { blocked, chunks, setPhase: (next: string) => { phase = next; } };
}

/**
 * 隨頁載入的 chunk 最多幾個檔：五個頁面面板、決策匯出、Excel 與 PPT 的產生程式各一個入口，再加它們共用、拆出來的小 chunk。
 * 零網路測試裡實際只會用到其中一部分；超過就表示有新的程式在這段時間被載入，要重新檢查。
 */
export const MAX_LAZY_CHUNKS = 12;

/**
 * 放行的 chunk 都必須是這次建置真的產生的程式檔（.next/static/chunks/ 裡有這個檔），每個檔最多要一次（失敗重試或快取失效會重複），總數有上限；
 * 清單寫進測試的 annotation，留下紀錄。
 */
export function expectOnlyBuiltChunks(chunks: readonly AllowedChunk[], testInfo: TestInfo) {
  testInfo.annotations.push({ type: "v43c-allowed-chunks", description: JSON.stringify(chunks) });
  for (const chunk of chunks) expect(existsSync(resolve(".next", chunk.path.replace(/^\/_next\//, ""))), `${chunk.path} 是這次建置的程式檔`).toBe(true);
  expect(new Set(chunks.map(chunk => chunk.path)).size, "每個 chunk 最多要一次").toBe(chunks.length);
  expect(chunks.length, `隨頁載入的 chunk 不超過 ${MAX_LAZY_CHUNKS} 個`).toBeLessThanOrEqual(MAX_LAZY_CHUNKS);
}

/** 程式 chunk 的網址（首頁載入完成後才攔：之後要的都是隨頁載入、預先載入或匯出的 chunk）。V4-8b 由 lazy-panels-v43c.spec.ts 搬來，axe-sweep 共用。 */
export const LAZY_CHUNKS = "**/_next/static/chunks/**";

/** 首頁載入完成後才攔：之後要的程式 chunk（隨頁載入、預先載入、匯出）全部扣住，release() 後才放行。 */
export async function holdLazyChunks(page: Page) {
  let release!: () => void;
  const released = new Promise<void>(done => { release = done; });
  const held: string[] = [];
  await page.route(LAZY_CHUNKS, async route => { held.push(route.request().url()); await released; await route.continue(); });
  return { held, release };
}

/**
 * V4-8b（D-V4-44 B）：首頁載入完成後，之後要的程式 chunk 一律失敗（斷線）；hold() 之後改成扣住、release() 才放行——
 * 按「再試一次」之前先 hold()，確保沒有 chunk（例如資料就緒約 2 秒後的預先載入）先載好、把錯誤狀態換掉。不再需要時呼叫端自己 page.unroute(LAZY_CHUNKS)。
 */
export async function failLazyChunks(page: Page) {
  let mode: "fail" | "hold" = "fail";
  let release!: () => void;
  const released = new Promise<void>(done => { release = done; });
  await page.route(LAZY_CHUNKS, async route => {
    if (mode === "fail") { await route.abort("internetdisconnected"); return; }
    await released; await route.continue();
  });
  return { hold: () => { mode = "hold"; }, release };
}
