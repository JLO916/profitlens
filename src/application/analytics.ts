// R7（決策 D9＝B）：Vercel Web Analytics，不加依賴。
// 只記錄頁面瀏覽與按鈕事件的「事件名」；永遠不帶任何資料內容、數字、檔名或通路名稱。
// 只有 Vercel production（VERCEL_ENV === "production"）且未以 NEXT_PUBLIC_DISABLE_ANALYTICS 停用時才載入腳本；
// 本機、preview、E2E 都不載入，track() 因為沒有 window.va 而不做任何事。

export type AnalyticsEvent =
  | "demo_loaded"
  | "import_committed"
  | "evidence_opened"
  | "action_added"
  | "scenario_calculated"
  | "meeting_finalized"
  | "export_pdf"
  | "export_excel"
  | "export_pptx"
  | "export_markdown";

/** Vercel Web Analytics 的腳本路徑（專案在 Vercel 儀表板啟用 Web Analytics 後才會回應）。 */
export const ANALYTICS_SCRIPT_SRC = "/_vercel/insights/script.js";
/** 與 Vercel 官方 HTML 片段相同的佇列：腳本載入前的事件先排隊，載入後由腳本送出。 */
export const ANALYTICS_QUEUE_SNIPPET = "window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};";

const DISABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/** 只有 Vercel production 且未停用時為 true。NEXT_PUBLIC_DISABLE_ANALYTICS 為 1／true／yes／on（不分大小寫）即停用。 */
export function analyticsEnabled(env: { VERCEL_ENV?: string; NEXT_PUBLIC_DISABLE_ANALYTICS?: string }): boolean {
  if (env.VERCEL_ENV !== "production") return false;
  return !DISABLED_VALUES.has((env.NEXT_PUBLIC_DISABLE_ANALYTICS ?? "").trim().toLowerCase());
}

type VercelAnalytics = (command: "event", payload: { name: AnalyticsEvent }) => void;

/** 送出一個互動事件（只有事件名）。沒有 window.va（未啟用、伺服器端、測試）時不做任何事；分析失敗不影響操作。 */
export function track(name: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const va = (window as unknown as { va?: unknown }).va;
  if (typeof va !== "function") return;
  try { (va as VercelAnalytics)("event", { name }); } catch { /* 分析失敗不影響操作 */ }
}
