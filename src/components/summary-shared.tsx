"use client";
import { variantSpec, type ExportVariant } from "@/application/export-variants";
import { summaryDecisionState, type ManagerSummary as SummaryData } from "@/application/manager-summary";
import { fill, labels } from "@/i18n";

// V3-7 開工錨點：一頁摘要（畫面）、列印版（print-summary.tsx）與會議頁共用的小件，自 manager-summary.tsx 原樣搬出（markup 不變），
// 讓 A 代理（manager-summary.tsx、meeting-page.tsx）與 B 代理（print-summary.tsx、manager-summary.module.css）各自擁有自己的檔案。
const copy = labels.ui.managerSummary;

export interface PrintMeeting { name: string; date: string }
/** 列印第一頁的備註上限（字元數，以 code point 計）；超過時截斷，全文放附錄。 */
export const PRINT_NOTES_LIMIT = 200;
const comparisonModeLabel = (mode: SummaryData["scope"]["comparison_mode"]) => mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
export const periodValues = (summary: SummaryData) => ({ prevStart: summary.scope.previous_period.start, prevEnd: summary.scope.previous_period.end, prevDays: summary.previous_days, curStart: summary.scope.current_period.start, curEnd: summary.scope.current_period.end, curDays: summary.current_days, mode: comparisonModeLabel(summary.scope.comparison_mode) });

/**
 * 方案與待辦的待辦清單（會議摘要、列印版與會議紀錄頁議程 ⑥ 共用）。
 * V3-9b F14：客戶報告版（variantSpec 的 internal 為 false）拿掉內部備註——確認狀態與「引用較早資料」（引用歷史）、執行狀態的備註（待辦進度紀錄），只留狀態；沒給 variant 時與 v2 相同。
 */
export function ActionSummaryList({ actions, variant }: { actions: ReturnType<typeof summaryDecisionState>["actions"]; variant?: ExportVariant }) {
  const spec = variantSpec(variant);
  if (!spec.internal.citationHistory || !spec.internal.actionProgress) return <ul>{actions.map(action => <li key={action.id}><strong>{action.problem}</strong>{spec.internal.citationHistory && <> · {action.status === "stale" ? labels.actions.staleBadge : action.status === "current" ? copy.actionConfirmed : copy.actionDraft}</>} · {action.scopeLabel}<p>{action.action}</p><p>{fill(copy.actionMeta, { owner: action.owner || copy.ownerPending, deadline: action.deadline || copy.duePending, risk: action.risk || copy.riskPending })}</p>{action.executionStatus && <p>{spec.internal.actionProgress ? fill(copy.actionExecution, { status: action.executionStatus, notes: action.executionNotes }) : fill(labels.exports.variantsV3.actionStatus, { status: action.executionStatus })}</p>}</li>)}</ul>;
  return <ul>{actions.map(action => <li key={action.id}><strong>{action.problem}</strong> · {action.status === "stale" ? labels.actions.staleBadge : action.status === "current" ? copy.actionConfirmed : copy.actionDraft} · {action.scopeLabel}<p>{action.action}</p><p>{fill(copy.actionMeta, { owner: action.owner || copy.ownerPending, deadline: action.deadline || copy.duePending, risk: action.risk || copy.riskPending })}</p>{action.executionStatus && <p>{fill(copy.actionExecution, { status: action.executionStatus, notes: action.executionNotes })}</p>}</li>)}</ul>;
}
