"use client";

import { startTransition, useEffect, useState } from "react";

/**
 * V4-3b（PRD §8.2：390「切到通路健檢」TBT 門檻）：健檢頁 G11 熱表與 G12 小倍數的內容延後一拍渲染。
 * - 伺服器與單元測試的 renderToStaticMarkup 沒有 window：直接回傳 true，SSR markup 與 M1／M6、chart-lint 的檢查不變。
 * - 瀏覽器：第一次渲染回傳 false（呼叫端讓 ChartFrame 顯示同高的 loading 骨架），掛載後在下一個 animation frame 以 startTransition 改成 true；
 *   transition 由 React 分段渲染，不會跟切頁的那一次渲染合成一個長任務。圖框高度固定，所以沒有版面位移。
 * 健檢頁在正式站不會在伺服器端渲染（首頁預先渲染的是空狀態），所以沒有 hydration 不一致的問題。
 */
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(() => typeof window === "undefined");
  useEffect(() => {
    if (ready) return;
    const frame = window.requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);
  return ready;
}
