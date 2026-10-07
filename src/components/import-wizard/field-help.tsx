"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShellIcon } from "../shell/shell-icon";

/**
 * V3-8 B（PRD §7.7.2 步驟 2、C14、M1／M3）：標準欄位名旁的 `?` 說明。
 * 觸發器是 icon 按鈕（aria-expanded／aria-controls）；內容關著時用 hidden 保持掛載。
 * 對照表放在可橫向捲動的 .table-scroll 裡，浮層會被裁切，所以說明在欄位名下方就地展開；Esc 關閉並回焦。
 */
export function FieldHelp({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return <span className="field-help">
    <button ref={trigger} type="button" className="ui-help-trigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><ShellIcon name="help" size={16} /></button>
    <span id={id} role="region" aria-label={label} className="ui-popover ui-help-content field-help-panel" hidden={!open}>{children}</span>
  </span>;
}
