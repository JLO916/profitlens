"use client";
import type { KeyboardEvent } from "react";

/**
 * V3-6（PRD §9.4 C6「focus trap」、§7.5 驗收）：抽屜的鍵盤焦點圈。
 * `dialog.showModal()` 只讓頁面其他部分 inert，瀏覽器在最後一個控制按 Tab 仍會把焦點移到 body 或瀏覽器工具列；
 * 依 APG modal dialog 的做法，Tab 在最後一個控制時繞回第一個，Shift+Tab 在第一個時繞到最後。掛在 <dialog onKeyDown={trapTabKey}>。
 * 可聚焦的判定只看「目前畫得出來」的控制（收合的 <details> 內容、hidden 的 popover 都不算）。
 */
const TABBABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function tabbableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(element => element.tabIndex >= 0 && !element.closest("[hidden]") && element.getClientRects().length > 0);
}

export function trapTabKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const root = event.currentTarget;
  const items = tabbableWithin(root);
  if (items.length === 0) { event.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof HTMLElement) || active === root || !root.contains(active);
  if (event.shiftKey) {
    if (outside || active === first) { event.preventDefault(); last.focus(); }
  } else if (outside || active === last) { event.preventDefault(); first.focus(); }
}
