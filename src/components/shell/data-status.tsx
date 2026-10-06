"use client";

import { useEffect, useRef, useState } from "react";
import { fill, labels } from "@/i18n";
import { formatDateL1, periodDays } from "@/application/presentation";
import { ShellIcon } from "./shell-icon";

export type DataStatusState = "empty" | "loading" | "error" | "partial" | "ready";

export interface DataStatusProps {
  state: DataStatusState;
  /** 目前資料（有成功載入過才有）；loading／error 時仍是上一份成功的資料。 */
  data: { local: boolean; datasetName: string; dataAsOf: string; coverageStart: string; issueCount: number } | null;
  /** v2 資料狀態列的文字（role=status 的 sr-only 鏡像，沿用 v2 文案，E2E 與螢幕閱讀器讀這一份）。 */
  statusText: string;
  /** v2 狀態列旁的資料集說明（ready 時是資料集名稱；其他狀態是「資料集 · 資料到 日期」）。 */
  statusDetail: string | null;
  publicDemo: boolean;
  onGoData: () => void;
  onImport: () => void;
}

const copy = labels.shell.dataStatus;

/**
 * V3-3 A1 頂欄資料狀態按鈕（C7）＋ popover（C14，寬 320px）。§6.3 #5、#6、#9、#11 合併到這裡：
 * 按鈕顯示「示範資料 · 資料到 8/24」；popover 有資料集、資料到（天數）、資料問題、公開示範站說明與「匯入新資料」（任一頁 ≤ 2 次點擊進匯入精靈）。
 * popover 常駐掛載（M1，hidden 切換）；Esc 關閉並回焦到按鈕，點外面關閉（M3）。
 */
export function DataStatus({ state, data, statusText, statusDetail, publicDemo, onGoData, onImport }: DataStatusProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inside = rootRef.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) buttonRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target instanceof Element && target.closest("dialog")) return;
      if (!target || !rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [open]);

  const date = data ? formatDateL1(data.dataAsOf, { anchor: data.dataAsOf }) : "";
  const source = data?.local ? labels.status.local : labels.status.demo;
  const buttonText = state === "ready" && data ? fill(copy.button, { source, date })
    : state === "partial" && data ? fill(copy.button, { source: labels.status.partial, date })
      : labels.status[state];
  const dot = state === "loading" ? "loading" : state;
  // §7.0 範例「資料到：2026-08-24（85 天）」：天數從資料起日算到「資料到」那天（含頭尾），與按鈕上的「資料到」同一個日期。
  const days = data ? periodDays(data.coverageStart, data.dataAsOf) : null;
  const close = () => setOpen(false);
  return <div className="data-status" ref={rootRef}>
    <button ref={buttonRef} type="button" className="ui-btn ui-btn-secondary data-status-button" data-testid="data-status" data-state={dot} aria-haspopup="dialog" aria-expanded={open} aria-controls="data-status-popover" onClick={() => setOpen(value => !value)}>
      <span className="ui-state-dot" data-state={dot} aria-hidden="true" /><span className="data-status-text">{buttonText}</span>
    </button>
    {/* §6.3 #9：v2 的 role=status 狀態列改成 sr-only 鏡像（文字與 v2 相同），按鈕本身只放精簡文字。 */}
    <span className="sr-only" role="status" aria-live="polite" data-testid="workspace-status">{statusText}{statusDetail && <> · {statusDetail}</>}</span>
    <div id="data-status-popover" className="ui-popover data-status-popover" role="dialog" aria-label={copy.popoverAria} data-testid="data-status-popover" hidden={!open}>
      <p className="data-status-title">{data ? data.local ? copy.localTitle : copy.demoTitle : labels.status.empty}</p>
      {data && <p className="data-status-note">{data.local ? labels.ui.dashboard.sidebarNote.local : labels.ui.dashboard.sidebarNote.demo}</p>}
      {data && <dl className="data-status-facts">
        <div><dt>{copy.dataset}</dt><dd>{data.datasetName}</dd></div>
        <div><dt>{copy.dataAsOf}</dt><dd>{days === null ? data.dataAsOf : fill(copy.dataAsOfValue, { date: data.dataAsOf, days })}</dd></div>
        <div><dt>{copy.issues}</dt><dd>{fill(copy.issuesValue, { n: data.issueCount })}<button type="button" className="ui-btn ui-btn-text" data-testid="data-status-go-data" onClick={() => { close(); onGoData(); }}>{copy.goToData}</button></dd></div>
      </dl>}
      {publicDemo && <p className="data-status-note">{labels.ui.dashboard.aiDetail.publicDemo}</p>}
      <button type="button" className="ui-btn ui-btn-secondary data-status-import" data-testid="data-status-import" onClick={() => { close(); onImport(); }}><ShellIcon name="import" size={16} />{copy.importNew}</button>
    </div>
  </div>;
}
