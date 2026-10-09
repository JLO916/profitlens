import type { DiagnosisGroup } from "@/application/diagnosis-group";
import { alertStatus } from "./top-three";

// V4-3c（D-V4-42＝A）：由 diagnosis-list.tsx 原樣搬來（diagnosis-list.tsx 再匯出）。側欄的健檢徽章（shell-frame，首載）只用到這個函式，
// 不必為了它把健檢清單元件一起放進首載的 page chunk。
/**
 * 標題列的計數徽章（PRD §7.2、§9.4 C8）：直接數每列的狀態標籤（alertStatus），不做新的分類；中性（沒有方向）的列不計。
 * 回傳的數字一定等於列內同色調狀態標籤的個數。
 */
export function diagnosisCounts(groups: readonly Pick<DiagnosisGroup, "missing" | "impact_cents">[]): { missing: number; unfavorable: number; favorable: number } {
  const tones = groups.map(group => alertStatus(group)?.tone ?? null);
  return { missing: tones.filter(tone => tone === "warning").length, unfavorable: tones.filter(tone => tone === "unfavorable").length, favorable: tones.filter(tone => tone === "favorable").length };
}
