import Decimal from "decimal.js";
import type { ContributionThreshold, ScenarioSensitivityAnalysis } from "@/domain/scenario-sensitivity";

// V4-5 代理 A：G16「要賣到多少才划算」的整理函式 thresholdPoints（PRD §4.3 G16、§6.4、§7.4、X29；CHART_CATALOG G16、§9.2；D-V4-20＝A′）。
// 等級 A（只組既有點），不加版本常數：CHART_CATALOG §9.2「A 級的整理與搬移（不加版本常數）：thresholdPoints（V4-5）」；
// D-V4-20＝A′ 只畫點、不連線，所以沒有任何模型在使用者沒填的 v 上產生的值（選 A 才要標 scenario-sensitivity-v1、選 B 才要 threshold-line-v1）。
// 讀 analyzeScenarioSensitivity()（src/domain/scenario-sensitivity.ts）的輸出，不重算、不轉 Number、不改 domain 的字串：
// - 門檻點：targets[] 中 status＝within_range 的目標；v＝threshold_pct（domain 已依未取分分數判定在範圍內），y＝目標值 target 本身（不是由 v 回推的模型值）；
// - outOfRange：status＝outside_range 的目標 id（不出現在 points；呼叫端在圖下寫「超出範圍」與 thresholdDescription 的範圍內是否達標）；
// - flat：L＝0（coefficients.slope＝"zero"；兩個目標都是 constant_*）。不畫門檻點，使用者點照畫。用 slope 而不用 volume_coefficient 判斷：
//   volume_coefficient 是取到分的顯示值，|L| < 0.005 時也會寫成 "0.00"，但 domain 仍算得出門檻（targets 不是 constant_*）；slope 是未取分的分類，與 targets 一致；
// - 使用者點：sensitivity.rows（三個假設都明填且都有效時才有列；domain 不補值、不代填，docs/SCENARIOS.md:68），id 依序 a、b、c，v＝使用者填的 volume_change_pct 原字串，
//   y＝該假設由 calculateScenario 重算的 result.contribution（與敏感度表同列逐字相同）；
// - stale：status＝"stale"（快照過期，domain 不回傳門檻與敏感度）時 true，points 與 outOfRange 一律空；
// - 每個點的 v 都在 [−90, +100]（X29；docs/SCENARIOS.md:12）。domain 已保證（within_range 以精確分數判定、使用者假設超界時整組 invalid），
//   這裡再以 Decimal 檢查一次：不在範圍內的點不畫（門檻點改列 outOfRange），絕不外插、不夾到邊界。
// 純函式、可序列化；不寫任何使用者看得到的字（文字由呼叫端從 labels 組）。

/** x 軸固定範圍（銷量變動 %，docs/SCENARIOS.md:12「v：售出量變化百分比，[-90%, +100%]」）。 */
export const THRESHOLD_V_MIN = -90;
export const THRESHOLD_V_MAX = 100;
/** 使用者點的 id（敏感度 A／B／C，testid chart-scenarios-threshold-point-{a|b|c}）。 */
export const SENSITIVITY_POINT_IDS = ["a", "b", "c"] as const;
export type SensitivityPointId = typeof SENSITIVITY_POINT_IDS[number];
export type ThresholdTargetId = ContributionThreshold["id"];
export type ThresholdPointId = ThresholdTargetId | SensitivityPointId;
export type ThresholdPointKind = "threshold" | "user";

/** 一個點。v、y 都是 domain 的精確字串（v 是百分數，例如 "-51.263537906137"、"+20"；y 是到分的金額，例如 "0.00"、"284.00"）。 */
export interface ThresholdPoint {
  id: ThresholdPointId;
  kind: ThresholdPointKind;
  v: string;
  y: string;
}
export interface ThresholdPoints {
  /** 範圍內的既有點：門檻點（zero_contribution、maintain_baseline 的順序）在前，使用者點（a、b、c）在後。 */
  points: ThresholdPoint[];
  /** 門檻超出 [−90%, +100%] 的目標 id（不畫點）。 */
  outOfRange: ThresholdTargetId[];
  /** L＝0：沒有單一門檻，不畫門檻點。 */
  flat: boolean;
  /** 快照過期：整張圖改空狀態（沿用既有過期說明）。 */
  stale: boolean;
}

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
/** v 是十進位字串且在 [−90, +100]（含邊界）。 */
export function withinThresholdRange(v: string | null | undefined): boolean {
  if (typeof v !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(v.trim())) return false;
  const value = new Exact(v.trim());
  return value.gte(THRESHOLD_V_MIN) && value.lte(THRESHOLD_V_MAX);
}

/**
 * G16 的點（A 級：只組既有點）。sensitivity 預設是 analysis.sensitivity（同一次 analyzeScenarioSensitivity 的結果）；
 * 只在呼叫端另外持有敏感度段（例如同一方案的三點另算）時才傳，只讀 status＝"valid" 的 rows。
 */
export function thresholdPoints(analysis: ScenarioSensitivityAnalysis, sensitivity: ScenarioSensitivityAnalysis["sensitivity"] = analysis.sensitivity): ThresholdPoints {
  if (analysis.status === "stale") return { points: [], outOfRange: [], flat: false, stale: true };
  if (analysis.status !== "valid") return { points: [], outOfRange: [], flat: false, stale: false };
  const flat = analysis.coefficients?.slope === "zero";
  const points: ThresholdPoint[] = [];
  const outOfRange: ThresholdTargetId[] = [];
  if (!flat) for (const target of analysis.targets) {
    if (target.status === "outside_range") { outOfRange.push(target.id); continue; }
    if (target.status !== "within_range") continue;
    if (withinThresholdRange(target.threshold_pct)) points.push({ id: target.id, kind: "threshold", v: target.threshold_pct!, y: target.target });
    else outOfRange.push(target.id);
  }
  if (sensitivity.status === "valid") sensitivity.rows.forEach((row, position) => {
    const id = SENSITIVITY_POINT_IDS[position];
    if (id !== undefined && withinThresholdRange(row.volume_change_pct)) points.push({ id, kind: "user", v: row.volume_change_pct, y: row.result.contribution });
  });
  return { points, outOfRange, flat, stale: false };
}
