"use client";

import type { WorkspaceSnapshot } from "@/application/workspace";
import { actionDocuments, type ActionExecutionStatus, type ActionWorkspace } from "@/application/action-workspace";
import type { SummaryDecisionContext } from "@/application/manager-summary";
import { exportMeetingMarkdown, lastMeeting, type Meeting } from "@/application/meeting";
import { downloadText } from "@/application/download";
import { channelsLabel, snapshotResolver } from "@/application/copy";
import { makeResolver, type NameResolver } from "@/application/channel-settings";
import { fill, labels } from "@/i18n";
import type { ReviewDecisionState, ReviewSession } from "@/application/review-session";

// V4-3c（D-V4-42＝A）：總覽與下載選單在首載就要用到的會議小工具，由 meeting-page.tsx 原樣搬來（meeting-page.tsx 再匯出，呼叫端不變），
// 讓會議紀錄頁本體可以隨頁載入（lazy-panels.tsx），不留在首載的 page chunk 裡。
const page = labels.meeting.page;
/** ReviewDecisionState（needs_data／not_adopted）→ labels.meeting.form.decisions 的鍵（need_data／rejected）；只做顯示對照，不改機器值。 */
export const DECISION_LABEL_KEY: Record<ReviewDecisionState, keyof typeof labels.meeting.form.decisions> = { draft: "draft", adopted: "adopted", needs_data: "need_data", not_adopted: "rejected" };
/** 待辦執行狀態 → 顯示字（會議頁議程、歷史與目前檢視的決策脈絡共用）。 */
export const EXECUTION_LABELS: Record<ActionExecutionStatus, string> = { not_started: labels.actions.form.statuses.not_started, in_progress: labels.actions.form.statuses.in_progress, blocked: labels.actions.form.statuses.blocked, completed: labels.actions.form.statuses.done };
/** 會議紀錄與主管摘要 Markdown 的 MIME。 */
export const MARKDOWN_MIME = "text/markdown;charset=utf-8";
/** 會議紀錄 Markdown 的檔名（含會議日期）。 */
export const meetingMarkdownFilename = (meeting: Meeting): string => `profitlens-meeting-${meeting.date}.md`;
/** 已結束會議的 Markdown：紀錄本身含結束當時凍結的上次比較（follow_up），還原備份後輸出相同。 */
export function downloadMeetingMarkdown(meeting: Meeting, datasetName?: string, resolver?: NameResolver) {
  // V42-1a：resolver 由呼叫端在會議與目前資料同一版本時傳入（目前快照的 channel_names）；沒給時輸出逐字不變。
  downloadText(exportMeetingMarkdown(meeting, undefined, { ...(datasetName ? { datasetName } : {}), ...(resolver ? { resolver } : {}) }), meetingMarkdownFilename(meeting), MARKDOWN_MIME);
}
/**
 * 下載選單「目前檢視」列印用的決策脈絡：只帶待辦工作區的待辦（置頂最多三項，其餘進附錄），與 PPT 一頁式的置頂待辦同源；
 * 不帶會議名稱、決議、備註與選入方案。待辦引用的資料與目前檢視不同時標為過期。
 */
export function currentViewDecisionContext(snapshot: Pick<WorkspaceSnapshot, "dataset_hash" | "filter_hash" | "report" | "channel_names">, actions: ActionWorkspace): SummaryDecisionContext {
  const ui = labels.meeting.session;
  // V42-1a：與目前資料同一版本的待辦讀目前快照的 channel_names；引用其他資料的待辦維持該資料集的隱含預設。
  const resolver = snapshotResolver(snapshot);
  return {
    dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, pinnedOnly: true, scenarios: [], selectedScenarioIds: [], decisionState: page.printViewState,
    actions: actionDocuments(actions).map(doc => ({
      id: doc.id, problem: doc.problem || ui.actionProblemMissing, action: doc.action, owner: doc.owner_role, deadline: doc.deadline, risk: doc.stop_condition, pinned: doc.pinned,
      executionStatus: EXECUTION_LABELS[doc.execution_status as ActionExecutionStatus] ?? EXECUTION_LABELS.not_started, executionNotes: doc.progress_notes,
      status: doc.status === "stale" || doc.binding.dataset_hash !== snapshot.dataset_hash ? "stale" as const : doc.status === "confirmed" ? "current" as const : "draft" as const,
      scopeLabel: fill(ui.actionScope, { channels: channelsLabel(doc.binding.scope.channels, doc.binding.dataset_hash === snapshot.dataset_hash ? resolver : makeResolver(undefined, doc.binding.dataset_id)), start: doc.binding.period.start, end: doc.binding.period.end }),
    })),
  };
}

/**
 * 總覽頁只留一行入口（05 §10）：本期會議的決議狀態（或尚未建立）＋同一份資料的上次會議日期。
 * 剛結束會議、新會議稿還沒動過（同資料同範圍、第 1 版草稿）時改顯示「已結束（日期）· 本次草稿」。
 * V3-4a：放在本期一句話右側，整句就是唯一的文字按鈕（可及名稱補上「前往會議紀錄」）；上次會議日期是旁邊的註記。
 */
export function MeetingEntry({ review, history, datasetHash, onOpen }: { review: ReviewSession | null; history: readonly Meeting[]; datasetHash: string; onOpen: () => void }) {
  const state = review ? labels.meeting.form.decisions[DECISION_LABEL_KEY[review.decision_state]] : labels.meeting.sections.meetingNotCreated;
  const last = lastMeeting(history);
  const justFinalized = review !== null && last !== null && last.source_fixed.dataset_hash === review.dataset_hash && last.source_fixed.filter_hash === review.filter_hash && review.revision === 1 && review.decision_state === "draft";
  const entry = labels.overview.snapshotUi;
  const text = justFinalized ? fill(entry.meetingEntryFinalized, { date: last.date }) : fill(entry.meetingEntry, { state });
  const showLast = !justFinalized && last !== null && last.source_fixed.dataset_hash === datasetHash;
  return <p className="meeting-entry" data-testid="overview-meeting-entry"><button type="button" className="text-button" aria-label={fill(entry.meetingGoAria, { text, go: page.goToMeeting })} onClick={onOpen}>{text}</button>{showLast && <span className="note">{fill(page.entryLast, { date: last.date })}</span>}</p>;
}
