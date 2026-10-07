"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { BoundAction } from "@/application/action-workspace";
import { labels } from "@/i18n";
import { ShellIcon } from "./shell/shell-icon";

/**
 * V3-6 開工錨點（PRD §7.5 第 4 點、§9.4 C6）：待辦編輯抽屜。B 代理在 actions-workbench.tsx 以
 * `<ActionDrawer item index title … >{editor(item, index, 'drawer')}</ActionDrawer>` 接線；C 代理在本檔完成規格：
 * 右側 560／≥1440 640／768–1279 480／<768 全螢幕、固定標題列 56px（h2＋副標＋關閉 icon 鈕）、可捲動內容、固定底部動作列 64px
 * （關閉、置頂、往上移；移除是危險文字按鈕放最右）、modal dialog、focus trap、Esc 與關閉都回焦到開啟它的元素（不存在時用 fallbackFocus）。
 * props 名稱是 B／C 的介面契約，C 只能新增選填 props。
 */
export interface ActionDrawerProps {
  item: BoundAction; index: number;
  /** 標題列 h2：卡片的問題標題，沒有時用「待辦 n」。 */
  title: string;
  onClose: () => void;
  pinned: boolean; onPin: () => void;
  canMoveUp: boolean; onMoveUp: () => void;
  onRemove: () => void;
  /** 關閉時開啟它的元素已不存在（例如移除後）時的焦點備援。 */
  fallbackFocus?: () => void;
  /** 工作台的通知文字（action-notice 在 modal 外會被 inert 掉），抽屜內另以 role=status 顯示一份；空字串不渲染。 */
  notice?: string;
  children: ReactNode;
}

export function ActionDrawer({ item, index, title, onClose, pinned, onPin, canMoveUp, onMoveUp, onRemove, fallbackFocus, notice, children }: ActionDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); const target = opener.current; if (target?.isConnected) target.focus(); else fallbackFocus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <dialog ref={dialogRef} className="action-drawer" data-testid="action-drawer" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} data-action-id={item.card.id} data-index={index + 1}>
    <div className="action-drawer-head"><h2 id={titleId}>{title}</h2><button type="button" className="ui-btn ui-btn-icon action-drawer-close" aria-label={labels.buttons.close} onClick={onClose} autoFocus><ShellIcon name="close" size={20} /></button></div>
    <div className="action-drawer-body">{notice ? <p role="status" className="ui-notice action-drawer-notice">{notice}</p> : null}{children}</div>
    <div className="action-drawer-foot">
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>{labels.buttons.close}</button>
      <button type="button" className="ui-btn ui-btn-secondary" aria-pressed={pinned} onClick={onPin}>{pinned ? labels.ui.actionsWorkbench.unpin : labels.buttons.pin}</button>
      <button type="button" className="ui-btn ui-btn-secondary" disabled={!canMoveUp} onClick={onMoveUp}>{labels.buttons.moveUp}</button>
      <button type="button" className="ui-btn ui-btn-text ui-btn-danger" onClick={onRemove}>{labels.buttons.remove}</button>
    </div>
  </dialog>;
}
