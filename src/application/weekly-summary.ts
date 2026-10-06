// V3-4a 臨時 stub（代理 B 的 worktree 專用）：簽名與共用契約逐字相同；合併時以代理 A 的實作為準，本檔整份被取代。
import type { WorkspaceSnapshot } from "@/application/workspace";
export type SnapshotKind = "revenueUpContributionDown" | "bothUp" | "bothDown" | "revenueDownContributionUp" | "flat" | "turned" | "missing";
export interface SnapshotSentence { kind: SnapshotKind; text: string; topHeadline: string | null }
/** 總覽「本期一句話」：數字全部來自既有 snapshot（report.previous／current.metrics、diagnosisGroups），不新增任何計算。 */
export function snapshotSentence(snapshot: WorkspaceSnapshot, options?: { importanceThreshold?: string; missingItems?: number }): SnapshotSentence {
  void snapshot; void options;
  return { kind: "bothUp", text: "", topHeadline: null };
}
export interface WeeklySummaryInput { snapshot: WorkspaceSnapshot; datasetName: string; importanceThreshold?: string; missingItems?: number; actions: { pending: number; pinned: { problem: string; owner: string; deadline: string }[] } }
export interface WeeklySummary { text: string; markdown: string; sentence: SnapshotSentence }
/** F1 週會摘要（PRD §10.2）：純文字版與 Markdown 版。 */
export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const sentence = snapshotSentence(input.snapshot, { importanceThreshold: input.importanceThreshold, missingItems: input.missingItems });
  return { text: "", markdown: "", sentence };
}
