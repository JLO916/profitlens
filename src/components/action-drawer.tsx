"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { taipeiToday, type BoundAction } from "@/application/action-workspace";
import { formatDateL1 } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { statusLabels } from "./action-editor";
import { trapTabKey } from "./shell/focus-trap";
import { ShellIcon } from "./shell/shell-icon";

const copy = labels.actions.drawerV3;
const board = labels.actions.board;

/**
 * V3-6（PRD §7.5 第 4 點、§6.3 #41、§9.4 C6）：待辦編輯抽屜。B 代理在 actions-workbench.tsx 以
 * `<ActionDrawer item index title … >{<ActionEditor … variant="drawer" showPin={false} />}</ActionDrawer>` 接線。
 * 右側 560／≥1440 640／768–1279 480／<768 全螢幕；固定標題列 56px（h2＋副標＋關閉 icon 鈕）→ 可捲動內容（三段，不用分頁）→ 固定底部動作列 64px
 * （關閉、置頂、往上移；移除是危險文字按鈕放最右）。modal dialog（showModal 讓頁面其他部分 inert；焦點圈由 shell/focus-trap.ts 的 trapTabKey 處理：Tab 在最後一個控制繞回第一個、Shift+Tab 反向）；Esc（cancel）與關閉都交給 onClose，
 * 卸載時回焦到開啟它的元素，不存在時（例如移除後）用 fallbackFocus。props 名稱是 B／C 的介面契約，只能新增選填 props。
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

/** C6 標題列副標「{負責人} · {期限} 到期 · {狀態}」：負責人空白寫「未指定」、沒有期限寫「未定」；期限用 formatDateL1（同年只寫 M/D）。只組字，不做計算。 */
export function actionDrawerSubtitle(item: BoundAction, today: string = taipeiToday()): string {
  const card = item.card;
  const owner = card.owner_role.trim() || board.unassigned;
  const due = card.deadline ? fill(copy.due, { date: formatDateL1(card.deadline, { today }) }) : board.noDeadline;
  return fill(copy.subtitle, { owner, due, status: statusLabels[item.execution_status ?? "not_started"] });
}

export function ActionDrawer({ item, index, title, onClose, pinned, onPin, canMoveUp, onMoveUp, onRemove, fallbackFocus, notice, children }: ActionDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const opener = useRef<HTMLElement | null>(null);
  // 卸載時才用得到；保留最新一次傳入的備援（父層每次 render 都可能給新的 inline 函式）。
  const fallback = useRef(fallbackFocus);
  useEffect(() => { fallback.current = fallbackFocus; });
  useEffect(() => {
    // 記住開啟它的元素（autoFocus 在 dialog 開啟前不會搶走焦點），再以 modal 開啟；showModal 依 autofocus 把焦點放到關閉鈕。
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); const target = opener.current; if (target?.isConnected) target.focus(); else fallback.current?.(); };
  }, []);
  return <dialog ref={dialogRef} className="action-drawer" data-testid="action-drawer" aria-labelledby={titleId} aria-describedby={subtitleId} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onKeyDown={trapTabKey} data-action-id={item.card.id} data-index={index + 1}>
    <div className="action-drawer-head">
      <div className="action-drawer-head-text"><h2 id={titleId}>{title}</h2><p id={subtitleId} className="action-drawer-sub">{actionDrawerSubtitle(item)}</p></div>
      <button type="button" className="ui-btn ui-btn-icon action-drawer-close" aria-label={labels.shell.buttons.close} data-testid="action-drawer-close" onClick={onClose} autoFocus><ShellIcon name="close" size={20} /></button>
    </div>
    <div className="action-drawer-body">{notice ? <p role="status" className="ui-notice action-drawer-notice">{notice}</p> : null}{children}</div>
    {/* C6 底部動作列（固定、靠右）：關閉、置頂、往上移（次要）→ 移除（危險文字按鈕，放最右）。 */}
    <div className="action-drawer-foot">
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="action-drawer-dismiss" onClick={onClose}>{labels.shell.buttons.close}</button>
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="action-drawer-pin" aria-pressed={pinned} onClick={onPin}>{pinned ? labels.actions.workbench.unpin : labels.actions.buttons.pin}</button>
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="action-drawer-move-up" disabled={!canMoveUp} onClick={onMoveUp}>{labels.actions.buttons.moveUp}</button>
      <button type="button" className="ui-btn ui-btn-text ui-btn-danger" data-testid="action-drawer-remove" onClick={onRemove}>{labels.actions.buttons.remove}</button>
    </div>
  </dialog>;
}
