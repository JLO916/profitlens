"use client";

import Decimal from "decimal.js";
import type { FavorableDirection } from "@/application/presentation";

// V4-2 代理 C：C18 Bullet 目標細條（PRD §6.2 C18、§4.4 G5、§7.1、§7.2；CHART_CATALOG G5 實作卡）。
// 由 v3 總覽 overview.tsx 的 targetBar 抽成共用元件，畫法、DOM 與 class 與 v3 逐字相同（KPI 帶的 markup 與畫面 13 不變）：
// 6px 細條從 0 畫到基準（目標、損益兩平），寬度＝達成率夾在 0 到 1；基準刻度 2×12 固定在右端（.kpi-bullet-target 的 right: 0）；
// 超過基準時條滿格，超出多少由旁邊文字承擔；落後時加 is-behind（條改不利色）。色只在 globals.css（--chart-total、--chart-unfavorable、--chart-target），元件內沒有色碼。
// 細條只是視覺輔助：根節點 aria-hidden、不可聚焦、裡面沒有按鈕；數字與可點的 number-link 由呼叫端放在旁邊。
// 不新算任何數值（G5 是 A 級）：達成率取位與 targets.ts 的 achievement 相同（實際 ÷ 基準，百分比一位小數、ROUND_HALF_UP），只拿來決定寬度與是否落後。

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
/** 只接受十進位字串（domain 與 application 的精確字串，例如 "1269792.73"、"11.357021996615"）；千分位、U+2212 等顯示字串一律不畫。 */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export interface BulletGeometry {
  /** 達成率（實際 ÷ 基準）取到 0.1%（ROUND_HALF_UP，與「達成 x%」同一個取位）後的比值；可能大於 1 或小於 0。 */
  ratio: number;
  /** 細條寬（CSS 百分比字串，一位小數）：ratio 夾在 0 到 1。 */
  width: string;
  /** 落後：有利方向 up 時 ratio < 1；down（費用、預算）時 ratio > 1。 */
  behind: boolean;
}

/**
 * C18 幾何（純函式，只是圖形座標）：實際或基準不是十進位字串、基準 ≤ 0 時回傳 null（不畫）。
 * 判斷用的是取到 0.1% 的達成率，與 v3 targetBar 相同：例如達成 99.95% 顯示為「100.0%」時不算落後，細條顏色與旁邊的達成文字一致。
 */
export function bulletGeometry(actual: string | null | undefined, target: string | null | undefined, favorableDirection: FavorableDirection): BulletGeometry | null {
  if (typeof actual !== "string" || typeof target !== "string" || !DECIMAL.test(actual) || !DECIMAL.test(target)) return null;
  const base = new Exact(target);
  if (base.lte(0)) return null;
  const percent = new Exact(actual).div(base).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  const ratio = Number(percent.toFixed(1)) / 100;
  if (!Number.isFinite(ratio)) return null;
  const behind = favorableDirection === "up" ? ratio < 1 : ratio > 1;
  const width = Math.min(Math.max(ratio, 0), 1);
  return { ratio, width: `${(width * 100).toFixed(1)}%`, behind };
}

export interface BulletProps {
  /** 實際值：domain 或 application 的精確十進位字串；null 時不畫。 */
  actual: string | null | undefined;
  /** 比較基準（目標、預算、損益兩平）：精確十進位字串；null、0 或負數時不畫。 */
  target: string | null | undefined;
  /** 指標的有利方向（favorableDirectionOf）：up 時實際低於基準是落後；down（廣告費預算）時高於基準是落後。 */
  favorableDirection: FavorableDirection;
  /** 細條根節點的 data-testid（PRD §4.7：chart-{page}-{id}-bar-{key}，不以 kpi- 開頭）。KPI 帶不給，markup 與 v3 相同。 */
  testId?: string;
}

/** C18 Bullet：畫不出來（缺值、基準 ≤ 0）時回傳 null，呼叫端照常放文字。 */
export function Bullet({ actual, target, favorableDirection, testId }: BulletProps) {
  const geometry = bulletGeometry(actual, target, favorableDirection);
  if (geometry === null) return null;
  return <span className={`kpi-bullet${geometry.behind ? " is-behind" : ""}`} data-testid={testId} aria-hidden="true"><span className="kpi-bullet-bar" style={{ width: geometry.width }} /><span className="kpi-bullet-target" /></span>;
}
