import type { ContributionThreshold } from "@/domain/scenario-sensitivity";
import { fill, labels } from "@/i18n";
import { metricDefinitions } from "./presentation";

// V4-5 代理 A（06_BATCHES V4-5「thresholdDescription 搬到可共用處（字不改）」；CHART_CATALOG G16「標題沿用零貢獻門檻的既有說明句」）：
// 由 src/components/scenario-sensitivity.tsx 原樣搬來，輸出逐字不變（tests/scenario-threshold-text.test.ts 對每個 status 比對搬移前的組字）。
// 門檻說明（threshold-{id} 的主層一句話）與目標名（threshold-{id} 的 h5）同時給 G16 的標題、圖下的超出範圍說明與資料表用。

const copy = labels.scenarios.sensitivity;

/** 主層文案：門檻說明一句話；精確分數與取分說明移到技術細節。 */
export function thresholdDescription(target: ContributionThreshold): string {
  if (target.status === "constant_equal") return copy.thresholdConstantEqual;
  if (target.status === "constant_above") return copy.thresholdConstantAbove;
  if (target.status === "constant_below") return copy.thresholdConstantBelow;
  const direction = target.meets_target_when === "at_or_above" ? copy.directionAtOrAbove : copy.directionAtOrBelow;
  if (target.status === "outside_range") return fill(copy.thresholdOutsideRange, { outcome: target.range_outcome === "all_at_or_above" ? copy.outcomeAllAtOrAbove : copy.outcomeAllBelow });
  return fill(copy.thresholdExact, { direction });
}

/** 目標名：零貢獻「打平（扣廣告後貢獻 = 0）」、維持原貢獻「維持現況的扣廣告後貢獻」（threshold-{id} 的 h5 前半）。 */
export const thresholdTargetLabel = (id: ContributionThreshold["id"]): string => id === "zero_contribution" ? fill(copy.targetZero, { metric: metricDefinitions.contribution_after_marketing.label }) : copy.targetMaintain;
