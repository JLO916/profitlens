"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { track } from "@/application/analytics";
import { channelsLabel, demoAlias } from "@/application/copy";
import { formatPeriodL1 } from "@/application/presentation";
import { buildWeeklySummary, snapshotSentence, type WeeklySummaryInput } from "@/application/weekly-summary";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { ShellIcon } from "../shell/shell-icon";

const ui = labels.overview.snapshotUi;
/** 「已複製週會摘要。」顯示多久後清空（PRD §7.1 區塊 2：2 秒；淡出只在 CSS，reduced-motion 時不做）。 */
export const COPY_STATUS_MS = 2000;

export interface WeeklySnapshotProps {
  snapshot: WorkspaceSnapshot;
  /** 資料集名稱（與頂欄資料狀態同一來源），寫進週會摘要第二行。 */
  datasetName: string;
  /** 資料待補的項數（資料來源頁的資料問題數）；一句話與摘要的「資料待補」句型用。 */
  missingItems: number;
  actionsSummary: WeeklySummaryInput["actions"];
  /** 資料集全部通路；與目前範圍相同時範圍行寫「全部通路」。 */
  allChannels?: readonly string[];
  /** 會議入口（MeetingEntry），放在「複製週會摘要」右側。 */
  meetingEntry?: ReactNode;
}

/** 寫入剪貼簿；沒有 Clipboard API 或寫入被拒時回傳 false（呼叫端改開 textarea 對話框）。 */
export async function writeClipboard(text: string, clipboard: Pick<Clipboard, "writeText"> | null | undefined): Promise<boolean> {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 產生週會摘要（純文字版，§10.2）並寫入剪貼簿；回傳是否成功與全文（失敗時給 textarea 對話框用）。 */
export async function copyWeeklySummary(input: WeeklySummaryInput, clipboard: Pick<Clipboard, "writeText"> | null | undefined): Promise<{ copied: boolean; text: string }> {
  const { text } = buildWeeklySummary(input);
  return { copied: await writeClipboard(text, clipboard), text };
}

/** 一句話下方的範圍行：「本期 7/13–8/23 · 全部通路 · 金額未稅」。 */
export function snapshotMeta(snapshot: WorkspaceSnapshot, allChannels?: readonly string[]): string {
  const { report } = snapshot;
  const channels = report.scope.channels, all = allChannels ?? channels;
  const everyChannel = all.length > 0 && all.every(channel => channels.includes(channel));
  const channelsText = everyChannel ? labels.shell.periodBar.filter.allChannels : channelsLabel(channels, demoAlias(report.dataset_id));
  return fill(ui.meta, { period: formatPeriodL1(report.current.period.start, report.current.period.end, { days: false, anchor: snapshot.data_as_of }), channels: channelsText });
}

/**
 * 總覽區塊 2「本期一句話」（PRD §7.1、F1）：左邊一句結論與範圍行；右邊「複製週會摘要」、會議入口與 role=status。
 * 句中金額不做 number-link（同一金額已在 KPI 帶可點）。剪貼簿失敗時開 textarea 對話框，內容已全選；Esc 或關閉回到按鈕。
 */
export function WeeklySnapshot({ snapshot, datasetName, missingItems, actionsSummary, allChannels, meetingEntry }: WeeklySnapshotProps) {
  const sentence = useMemo(() => snapshotSentence(snapshot, { missingItems }), [snapshot, missingItems]);
  // 成功訊息：live region（role=status）本身保持掛載，訊息放在裡面的子元素；每次複製換一個 key，淡出動畫重新開始、讀屏軟體重新朗讀。
  const [status, setStatus] = useState<{ text: string; key: number }>({ text: "", key: 0 });
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const pending = timer;
    return () => { if (pending.current) clearTimeout(pending.current); };
  }, []);
  const copy = async () => {
    const { copied, text } = await copyWeeklySummary({ snapshot, datasetName, missingItems, actions: actionsSummary, allChannels }, typeof navigator === "undefined" ? null : navigator.clipboard);
    if (!copied) { setFallback(text); return; }
    track("summary_copied");
    setStatus(previous => ({ text: ui.copied, key: previous.key + 1 }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setStatus(previous => ({ ...previous, text: "" })); }, COPY_STATUS_MS);
  };
  return <section className="snapshot" data-testid="weekly-snapshot" aria-labelledby="snapshot-title">
    <h2 id="snapshot-title" className="sr-only">{ui.heading}</h2>
    <div className="snapshot-main">
      <p className="snapshot-sentence" data-testid="snapshot-sentence">{sentence.text}</p>
      <p className="snapshot-meta">{snapshotMeta(snapshot, allChannels)}</p>
    </div>
    <div className="snapshot-actions">
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="copy-summary" onClick={() => void copy()}><ShellIcon name="copy" size={16} />{ui.copy}</button>
      {meetingEntry}
      <span className="copy-status" role="status" data-testid="copy-summary-status">{status.text && <span key={status.key} className="copy-status-text">{status.text}</span>}</span>
    </div>
    {fallback !== null && <CopyFallback text={fallback} onClose={() => setFallback(null)} />}
  </section>;
}

/** 剪貼簿不可用時的對話框：textarea 唯讀、開啟時全選；Esc 或「關閉」關閉後回焦到開啟它的按鈕。V3-7：會議頁頁首的「複製週會摘要」共用。 */
export function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const titleId = useId(), bodyId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    area.current?.focus();
    area.current?.select();
    return () => { if (dialog.open) dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="copy-fallback" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="copy-summary-fallback" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="copy-fallback-head"><h2 id={titleId}>{ui.fallbackTitle}</h2><button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>{labels.shell.buttons.close}</button></div>
    <p id={bodyId} className="copy-fallback-body">{ui.fallbackBody}</p>
    <textarea ref={area} className="copy-fallback-text" readOnly value={text} rows={14} aria-label={ui.fallbackTextAria} onFocus={event => event.currentTarget.select()} />
  </dialog>;
}
