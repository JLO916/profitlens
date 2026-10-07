"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Period } from "@/domain/types";
import { channelsLabel, demoAlias } from "@/application/copy";
import { periodDays } from "@/application/presentation";
import type { ReviewSession } from "@/application/review-session";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { periodSummary } from "./period-bar";

/**
 * V3-9b 開工錨點（F22 投影模式，PRD §9.7、D-V3-23＝A）：只在經營總覽與會議紀錄可用。
 * 進入時在 <html> 設 data-mode="present"（CSS 以 :root[data-mode="present"] 重新對應 token、隱藏側欄與期間列、只顯示 L1——C 代理實作），Esc 離開；
 * 離開可用頁（切到其他頁、資料清空）時自動退出。按鈕在 PageHeader（presentToggle）。
 * V3-9b C：進入時記住觸發的按鈕（點擊的 currentTarget，沒有就用目前焦點），用按鈕或 Esc 離開後焦點回到它；自動退出（切頁）不搬焦點。
 * 離開可用頁就清掉「要投影」的狀態（render 期間依前一次的 enabled 調整，React 文件的做法），回到總覽或會議頁不會自己又進入投影。
 */
export function usePresentMode(enabled: boolean) {
  const [requested, setRequested] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) { setWasEnabled(enabled); if (!enabled) setRequested(false); }
  // 可用頁以外一律不是投影中（衍生值，不在 effect 裡 setState）。
  const active = requested && enabled;
  const returnFocus = useRef<FocusTarget | null>(null);
  const enter = useCallback((event?: { currentTarget?: unknown }) => {
    const trigger = event?.currentTarget ?? (typeof document === "undefined" ? null : document.activeElement);
    returnFocus.current = isFocusTarget(trigger) ? trigger : null;
    setRequested(true);
  }, []);
  const exit = useCallback(() => {
    setRequested(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target && target.isConnected !== false) target.focus();
  }, []);
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.mode = "present";
    const onKey = (event: KeyboardEvent) => { if (presentEscapeExits(event, document)) exit(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); delete root.dataset.mode; };
  }, [active, exit]);
  return { active, enter, exit };
}

type FocusTarget = { focus: () => void; isConnected?: boolean };
const isFocusTarget = (value: unknown): value is FocusTarget => typeof value === "object" && value !== null && typeof (value as FocusTarget).focus === "function";

/** Esc 在這些元素裡按下時，交給它們自己處理（抽屜、對話框、會議的結束確認區；M3）。 */
const OVERLAY_TARGET = "dialog, [role=\"dialog\"]";
/** 還開著的浮層（抽屜與對話框、頂欄與頁內下拉、調整門檻、? 說明與其他 aria-expanded 的 popover）：Esc 先關它們，再按一次才離開投影。 */
const OPEN_OVERLAY = "dialog[open], [role=\"dialog\"]:not([hidden]), details.topbar-menu[open], details.threshold-popover[open], [aria-expanded=\"true\"]";

/** F22（§9.7 Esc 離開）：這次按鍵要不要離開投影。只有 Esc、沒被其他元件處理（defaultPrevented）、焦點不在對話框裡、畫面上也沒有開著的浮層時才離開。 */
export function presentEscapeExits(event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "target">, root: Pick<ParentNode, "querySelector">): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (target && typeof target.closest === "function" && target.closest(OVERLAY_TARGET)) return false;
  return root.querySelector(OPEN_OVERLAY) === null;
}

/**
 * F22（§9.7「隱藏側欄與期間列，只留一行期間文字」）：投影中頁首的一行期間文字＝期間列的期間摘要（formatPeriodL1，同 periodSummary）＋通路。
 * 會議紀錄頁有會議時用會議固定的範圍（議程數字的來源），否則用目前檢視的範圍；全部通路寫「全部通路」（同總覽一句話下方的範圍行）。
 */
export function presentPeriodText(snapshot: WorkspaceSnapshot, review: Pick<ReviewSession, "meeting_filters" | "data_as_of"> | null, allChannels: readonly string[]): string {
  const { report } = snapshot;
  const days = (period: Period) => periodDays(period.start, period.end) ?? 0;
  const filters = review?.meeting_filters ?? null;
  const selected = filters ? filters.channels : report.scope.channels;
  const everyChannel = allChannels.length > 0 && allChannels.every(channel => selected.includes(channel));
  const channels = everyChannel ? labels.shell.periodBar.filter.allChannels : channelsLabel(selected, demoAlias(report.dataset_id));
  const { text } = periodSummary(filters && review
    ? { previous: filters.previous_period, current: filters.current_period, previousDays: days(filters.previous_period), currentDays: days(filters.current_period), comparisonMode: filters.comparison_mode, channelsText: channels, dataAsOf: review.data_as_of }
    : { previous: report.previous.period, current: report.current.period, previousDays: report.comparison.previous_days, currentDays: report.comparison.current_days, comparisonMode: report.comparison.mode, channelsText: channels, dataAsOf: snapshot.data_as_of });
  return fill(labels.shell.presentV3.period, { period: text, channels });
}
