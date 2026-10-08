import Decimal from "decimal.js";
import { MINUS } from "@/application/presentation";
import { waterfallTickLabels } from "@/components/overview/charts/waterfall-svg";

// 設計稿用的呈現函式。正式版在各批的 src/application/presentation.ts（formatAxisWan 於 V4-1、formatHeatCell 於 V4-3b），
// 這裡只照 PRD 的規格先寫一份，讓設計稿看得到格式；設計稿上一律標「設計稿試算」，正式數字與格式以各批的函式為準。

/** HTML 跳脫。 */
export function esc(text: string | number): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 圖形座標（只用於畫圖）：精確字串的近似值；顯示一律用 domain 的精確字串經格式化函式。 */
export function coordinate(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** SVG 座標取一位小數，避免輸出過長。 */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * formatAxisWan（PRD §6.4，V4-1 才進 presentation.ts）：整數萬、0 寫「0」、U+2212、「萬」取自 labels；步長不是整萬時保留 1 或 2 位。
 * PRD 規定 waterfallTickLabels 改呼叫它且輸出不變，所以設計稿直接呼叫既有的 waterfallTickLabels 當作試算版。
 */
export function formatAxisWan(ticks: readonly number[], step: number): string[] {
  return waterfallTickLabels(ticks, step);
}

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

/**
 * formatHeatCell（PRD §6.4、CHART_CATALOG G11，V4-3b 才進 presentation.ts）：以萬為單位、兩位小數、不帶單位；
 * 取位到元後仍為負時保留 U+2212（萬位取位為 0 也不丟負號，寫「−0.00」）；取位到元後為 0 寫「0.00」；正值不加號。
 */
export function formatHeatCell(value: string | null): string | null {
  if (value === null) return null;
  const exact = new Exact(value);
  const yuan = exact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const negative = yuan.isNegative() && !yuan.isZero();
  const wan = exact.abs().div(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  if (yuan.isZero()) return "0.00";
  return `${negative ? MINUS : ""}${wan}`;
}

/** 取位到元後仍為負（與 v3 通路結論句「虧」同規則，chart-takeaways.ts:101-103 用 L1 取位判斷）。 */
export function negativeAfterYuan(value: string | null): boolean {
  if (value === null) return false;
  const yuan = new Exact(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return yuan.isNegative() && !yuan.isZero();
}

/** 星期（0＝日 … 6＝六），ISO 日期以 UTC 解析，避免時區位移。 */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
/** M/D（主層日期，不補零）。 */
export function md(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** 1／2／5 × 10ⁿ 的刻度間距（與 waterfall-svg.tsx 的 niceStep 相同：以 √2、√10、√50 為分界）。 */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= Math.SQRT2 * 5 ? 10 : unit >= Math.sqrt(10) ? 5 : unit >= Math.SQRT2 ? 2 : 1) * power;
}

/** 數值軸範圍：含 0，下界與上界取整到步長的倍數（與 waterfallGeometry 相同）；回傳範圍、步長與刻度值。 */
export function niceScale(values: readonly (number | null)[], divisions = 5): { lo: number; hi: number; step: number; ticks: number[] } {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  if (min === 0 && max === 0) return { lo: 0, hi: 1, step: 1, ticks: [0] };
  const step = niceStep((max - min) / divisions);
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) ticks.push(Number((k * step).toPrecision(12)) || 0);
  return { lo, hi, step, ticks };
}

/** 比率軸（G12）：下界 min(0, 最小值)、上界最大值；範圍 ≥ 10 個百分點時取整到 5，否則取整到 1（PRD §4.3 G12；值是比率小數）。 */
export function rateScale(values: readonly (number | null)[]): { lo: number; hi: number; step: number; ticks: number[] } {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value)).map(value => value * 100);
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  const unit = max - min >= 10 ? 5 : 1;
  const lo = Math.floor(min / unit) * unit;
  const hi = Math.max(Math.ceil(max / unit) * unit, lo + unit);
  const span = hi - lo;
  const step = span / unit <= 5 ? unit : niceStep(span / 4) < unit ? unit : Math.ceil(niceStep(span / 4) / unit) * unit;
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + 1e-9; tick += step) ticks.push(Number(tick.toFixed(6)));
  return { lo: lo / 100, hi: hi / 100, step: step / 100, ticks: ticks.map(tick => tick / 100) };
}
