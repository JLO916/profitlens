"use client";

import { useEffect, useId, useRef } from "react";
import { labels } from "@/i18n";

/** 口徑說明（R2）：九條固定內容，由頂欄 ⓘ、抽屜與頁尾開啟；Esc 或關閉後回到開啟它的按鈕。 */
export function BasisDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      return () => { if (dialog.open) dialog.close(); if (opener?.isConnected) opener.focus(); };
    }
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className="basis-dialog" aria-labelledby={titleId} data-testid="basis-dialog" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="evidence-header"><h2 id={titleId}>{labels.basis.title}</h2><button type="button" className="button quiet" onClick={onClose} autoFocus>{labels.buttons.close}</button></header>
    <div className="evidence-body">
      <ol className="basis-list">{labels.basis.items.map(item => <li key={item}>{item}</li>)}</ol>
      <p className="note">{labels.basis.aliasNote}</p>
    </div>
  </dialog>;
}
