"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RuleCode } from "@/domain/types";
import { labels } from "@/i18n";

const copy = labels.data.pageV3.diagnosisEmpty;

/**
 * §7.10「健檢沒有結果」區段空狀態（C10，ui-empty-block：1px 虛線 --border-default、radius 6px、padding 16px、14px）：
 * 標題「本期沒有需要處理的項目。」＋說明「8 條規則都沒有觸發。」（role=status 沿用 v2）＋動作「查看健檢規則」文字按鈕。
 * 頁面上沒有既有的規則說明區塊，按鈕展開下方 8 條規則的白話說明（M1：hidden 保持掛載）並把焦點移過去。
 */
export function DiagnosisEmpty() {
  const rulesId = useId();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (open && opened.current) listRef.current?.focus();
  }, [open]);
  const toggle = () => { opened.current = true; setOpen(value => !value); };
  return <div className="ui-empty-block diagnosis-empty" data-testid="diagnosis-empty">
    <div role="status"><p className="diagnosis-empty-title">{copy.title}</p><p>{copy.body}</p></div>
    <button type="button" className="ui-btn ui-btn-text" aria-expanded={open} aria-controls={rulesId} onClick={toggle}>{copy.action}</button>
    <ol id={rulesId} ref={listRef} className="diagnosis-empty-rules" aria-label={copy.rulesAria} tabIndex={-1} hidden={!open || undefined}>{(Object.entries(copy.rules) as [RuleCode, string][]).map(([code, text]) => <li key={code}>{text}</li>)}</ol>
  </div>;
}
