"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * V3-9b 開工錨點（F22 投影模式，PRD §9.7、D-V3-23＝A）：只在經營總覽與會議紀錄可用。
 * 進入時在 <html> 設 data-mode="present"（CSS 以 :root[data-mode="present"] 重新對應 token、隱藏側欄與期間列、只顯示 L1——C 代理實作），Esc 離開；
 * 離開可用頁（切到其他頁、資料清空）時自動退出。按鈕在 PageHeader（presentToggle）。
 */
export function usePresentMode(enabled: boolean) {
  const [requested, setRequested] = useState(false);
  // 可用頁以外一律不是投影中（衍生值，不在 effect 裡 setState）；回到可用頁時若還沒按過離開，會接著投影。
  const active = requested && enabled;
  const enter = useCallback(() => setRequested(true), []);
  const exit = useCallback(() => setRequested(false), []);
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.mode = "present";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setRequested(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); delete document.documentElement.dataset.mode; };
  }, [active]);
  return { active, enter, exit };
}
