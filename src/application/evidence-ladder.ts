import type { Metrics, Period } from "@/domain/types";
import type { WorkspaceSnapshot } from "./workspace";

// V4-7b（06_BATCHES V4-7b、CHART_CATALOG G23、PRD §6.4 ladderMetrics）：計算與來源抽屜四層階梯的查找，
// 由 src/components/evidence-drawer.tsx 原樣搬來並匯出（V4-3a 已修正單一通路的週與日證據查找，本批只搬移，邏輯不再改）。
// 只挑出快照裡既有的合計指標（回傳同一個物件），不產生任何新數值，所以沒有版本常數；值的版本沿用 contribution-v1。
// 搬移前後輸出相同：tests/evidence-ladder.test.ts（每一種證據 × golden、demo、合成資料等，逐筆與搬移前的原文凍結比對，並對 3ea161b 產生的基準）。

/** 抽屜用到的快照欄位（同 EvidenceDrawer 的 snapshot prop）。 */
export type LadderSnapshot = Pick<WorkspaceSnapshot, "report" | "weeks" | "yoy">;

/**
 * ladderMetrics 只看證據的期間、通路範圍與四個「不畫階梯」的條件（有組成項目、改了單位、商品層級）。
 * src/components/evidence-drawer.tsx 的 EvidenceSelection 結構上相容（application 不匯入元件的型別）。
 */
export interface LadderEvidence {
  period: Period;
  channels: readonly string[];
  components?: readonly unknown[];
  unitOverride?: string;
  sku?: string;
}

/**
 * 找出與這筆證據同期間、同通路範圍的合計指標；找不到（例如商品或跨期差額）就不畫階梯。
 * V4-3a（PRD §6.4 ladderMetrics、CHART_CATALOG G7（b））：snapshot.weeks 與去年同期（snapshot.yoy）都是 report.scope.channels 全部通路的合計，
 * 所以週與去年同期的查找只在 evidence.channels 等於 report.scope.channels 時成立；單一通路的週值或單日值（最後一週只有 1 天時期間會和週相同）不畫全通路的階梯。
 */
export function ladderMetrics(snapshot: LadderSnapshot | undefined, evidence: LadderEvidence): Metrics | null {
  if (!snapshot || evidence.components || evidence.unitOverride || evidence.sku) return null;
  const { report, weeks } = snapshot;
  const same = (period: Period) => period.start === evidence.period.start && period.end === evidence.period.end;
  const allChannels = [...report.scope.channels].sort().join("|") === [...evidence.channels].sort().join("|");
  const base = same(report.previous.period) ? report.previous : same(report.current.period) ? report.current : null;
  if (base) {
    if (allChannels) return base.metrics;
    if (evidence.channels.length === 1 && base.channels[evidence.channels[0]]) return base.channels[evidence.channels[0]].metrics;
    return null;
  }
  if (!allChannels) return null;
  // V3-9b F8：去年同期整段與各週（snapshot.yoy）也能畫階梯；既有 weeks 的查找不變，找不到才看去年同期。
  const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy : null;
  if (yoy && same(yoy.period)) return yoy.metrics;
  const week = weeks.find(row => row.start === evidence.period.start && row.end === evidence.period.end) ?? yoy?.weeks.find(row => same(row));
  return week ? week.metrics : null;
}
