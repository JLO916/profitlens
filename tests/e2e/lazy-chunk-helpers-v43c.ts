import type { Request } from "@playwright/test";

/**
 * V4-3c（D-V4-42＝A，首載瘦身）：通路健檢、資料來源、商品毛利、會議紀錄、待辦與 AI 解釋改成隨頁載入，匯出程式改成按下時載入。
 * 第一次切到這些頁（或第一次匯出）時，瀏覽器向同一個網站要該頁的程式 chunk：GET /_next/static/chunks/*.js，沒有內容、沒有查詢字串。
 * 「零網路」測試只放行這一種請求（另外記錄），其餘請求照舊攔下、記錄且必須為 0；資料不會因此送出（network-log.spec 另驗全程沒有資料外送）。
 */
export function isPageCodeChunk(request: Request, origin: string): boolean {
  const url = new URL(request.url());
  return request.method() === "GET" && url.origin === origin && url.search === "" && url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js") && request.postDataBuffer() === null;
}
