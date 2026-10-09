import type { DeltaTone } from "@/application/presentation";

// V4-3c（D-V4-42＝A）：由 manager-summary.tsx 原樣搬來（manager-summary.tsx 再匯出）。試算頁（首載）只用到這一行，
// 不必為了它把主管摘要元件與通路寬表一起放進首載的 page chunk。
/** V3-2b：有利／不利的顏色 class（依 favorableDirection，不依數學正負號）；顏色一定搭配正負號或方向詞。 */
export const toneClass = (tone: DeltaTone): "positive" | "negative" | "neutral" => tone === "favorable" ? "positive" : tone === "unfavorable" ? "negative" : "neutral";
