"use client";
import { useSyncExternalStore } from "react";

const subscribeNever = () => () => undefined;
/**
 * V3-6 開工錨點：頁首插槽（shell/page-chrome.tsx 的 #page-actions 與 #page-title-addon）。
 * 伺服器端與 hydration 當下回傳 null（內容先渲染在頁面元件內，SSR／testid 基準看得到），掛載後改用 createPortal 放進頁首；同一時間只有一份（M6）。
 * 用法同 product-comparison-panel.tsx 的 usePageActionsSlot：`const slot = usePageSlot("page-actions"); slot ? createPortal(node, slot) : <div className="…-inline">{node}</div>`。
 */
export function usePageSlot(id: "page-actions" | "page-title-addon"): HTMLElement | null {
  return useSyncExternalStore(subscribeNever, () => document.getElementById(id), () => null);
}
