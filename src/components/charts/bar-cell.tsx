"use client";

import Decimal from "decimal.js";
import { chartColors, chartRowHeights } from "@/application/chart-theme";

// V4-1 代理 B：C24 BarCell 表格內嵌條（PRD §6.3 C24、§6.5、§7.1、§7.2；CHART_CATALOG §1.5、§9.1 與 G6 實作卡）。純 inline SVG，不加套件。
// 本批只做 variance 模式（G6 橋接表；V4-2 的 G4 差額條沿用）：以零線為中心，負值往左、正值往右；條長＝|值| ÷ 共同尺度（同一張表所有條的 |值| 最大值）。
// share、pair、count 與 tick 在後續批次加（V4-3a tick、V4-7b pair 與 share、V4-10 count），型別先列出。
// 條只是視覺輔助：根 svg 帶 aria-hidden 與 data-chart-kind="cell"（CL-1、CL-11 以它辨識內嵌條）、不可聚焦、圖內沒有 tabIndex；
// 鍵盤與螢幕報讀走同列的 number-link，點條呼叫與 number-link 相同的 handler（同一個 evidence builder）。
// 色只經 chart-theme.ts 的 chartColors（元件內沒有色碼與 var() 字串常值，CL-3）；高度只用 chartRowHeights（CL-10）；
// 顯示寬由 globals.css「V4-1 B」錨點決定（≥ 768 為 96px、≤ 767 為 64px）；要不要顯示（例如 G6 只在 ≤ 767 顯示）由各圖自己的錨點決定，本元件不藏。

/** C24 的四種模式（PRD §6.3）：variance 共用零線雙向、share 0 到 100%、pair 上下成對、count 從 0 計數。本批只實作 variance。 */
export type BarCellMode = "variance" | "share" | "pair" | "count";
/** 條色的語意：由呼叫端依 deltaTone／favorableDirectionOf 判斷後傳入（依有利方向，不依數學正負號）。 */
export type BarCellTone = "favorable" | "unfavorable" | "neutral";
/** 有利條用哪個色：預設 chartColors.favorable（灰）；同框已有同色系列時（G4 的上期長條）改用 chartColors.total。 */
export type BarCellFavorableFill = "favorable" | "total";
/** 值與尺度：domain 的精確字串（例如 "-1575080.55"），或數值；不接受顯示用的格式化字串（千分位、U+2212）。 */
export type BarCellAmount = string | number | null | undefined;

/** 座標系（viewBox）寬＝最大顯示寬 96px；CSS 縮成 64px 時 rect 等比縮放（preserveAspectRatio="none"），零線以 non-scaling-stroke 維持 1px。 */
export const BAR_CELL_WIDTH = 96;
/** 盒高＝條高的兩倍：條高 chartRowHeights.cell（6px）垂直置中，零線貫穿上下各多 3px，值為 0 或缺值時也看得到零線（H5 設計稿）。 */
export const BAR_CELL_HEIGHT = chartRowHeights.cell + chartRowHeights.cell;
/** 非零值的最短條（座標單位）：比例太小（例如九項中的其他變動費用）時仍看得出方向；只影響畫法，不影響 ratio。 */
const MIN_BAR = 1;

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

/** 精確字串或數值轉成 Decimal；null、undefined、空字串、NaN、Infinity 或無法解析時回傳 null。 */
function exactOf(value: BarCellAmount): Decimal | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const input = typeof value === "string" ? value.trim() : value;
  if (input === "") return null;
  try {
    const parsed = new Exact(input);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}
/**
 * 共同尺度：一組值的 |值| 最大值（精確字串，toFixed 不用科學記號）。同一張表的內嵌條共用它（PRD §7.2）。
 * 缺值與無法解析的值略過；沒有可用的值或全部為 0 時回傳 null（此時每一格只畫零線）。
 */
export function barCellScale(values: readonly BarCellAmount[]): string | null {
  let top: Decimal | null = null;
  for (const value of values) {
    const parsed = exactOf(value);
    if (parsed !== null && (top === null || parsed.abs().gt(top))) top = parsed.abs();
  }
  return top === null || top.isZero() ? null : top.toFixed();
}

export interface BarCellVarianceInput {
  mode: "variance";
  value: BarCellAmount;
  /** 共同尺度（|值| 最大值；負數取絕對值）。 */
  max: BarCellAmount;
}
export type BarCellGeometryInput = BarCellVarianceInput;

export interface BarCellVarianceGeometry {
  mode: "variance";
  /** viewBox 的寬與高。 */
  width: number;
  height: number;
  /** 零線的 x（座標系正中央）。 */
  zeroX: number;
  /** |值| ÷ |尺度|，夾在 0 到 1；值或尺度無效（缺值、無法解析、尺度為 0）時為 null。只用於長度。 */
  ratio: number | null;
  /** 負值往左、正值往右；沒有條時為 null。 */
  direction: "left" | "right" | null;
  /** 條的矩形；值缺、為 0 或尺度無效時為 null（只畫零線）。 */
  bar: { x: number; y: number; width: number; height: number } | null;
}
export type BarCellGeometry = BarCellVarianceGeometry;

/**
 * C24 幾何（純函式，單元測試用）。variance：零線在正中央，半寬（48）＝尺度；條長＝|值| ÷ |尺度| × 半寬，超過尺度時夾在半寬。
 * 比例用 Decimal 以精確字串計算，座標取到 0.1；非零值至少畫 MIN_BAR 寬。
 */
export function barCellGeometry(input: BarCellGeometryInput): BarCellGeometry {
  const half = new Exact(BAR_CELL_WIDTH).div(2);
  const zeroX = half.toNumber();
  const base = { mode: "variance" as const, width: BAR_CELL_WIDTH, height: BAR_CELL_HEIGHT, zeroX };
  const value = exactOf(input.value), max = exactOf(input.max);
  if (value === null || max === null || max.isZero()) return { ...base, ratio: null, direction: null, bar: null };
  const ratio = Exact.min(value.abs().div(max.abs()), 1);
  if (value.isZero()) return { ...base, ratio: 0, direction: null, bar: null };
  // 座標取到 0.1（HALF_UP，全程用 Decimal，避免浮點誤差）。
  const length = Exact.max(ratio.times(half).toDecimalPlaces(1, Decimal.ROUND_HALF_UP), MIN_BAR);
  const direction = value.isNegative() ? "left" as const : "right" as const;
  const x = direction === "left" ? half.minus(length).toNumber() : zeroX;
  return { ...base, ratio: ratio.toNumber(), direction, bar: { x, y: (BAR_CELL_HEIGHT - chartRowHeights.cell) / 2, width: length.toNumber(), height: chartRowHeights.cell } };
}

/** 條色（tone → chart-theme 的 var() 字串）：只有不利上色（D-V3-7，有利不用綠）；有利預設灰（favorable）或 total；neutral 用 total。 */
export function barCellFill(tone: BarCellTone, favorableFill: BarCellFavorableFill = "favorable"): string {
  if (tone === "unfavorable") return chartColors.unfavorable;
  if (tone === "favorable") return favorableFill === "total" ? chartColors.total : chartColors.favorable;
  return chartColors.total;
}

export interface BarCellVarianceProps extends BarCellVarianceInput {
  /** 有利或不利（呼叫端以 deltaTone(metric, value) 判斷）；決定條色。 */
  tone: BarCellTone;
  favorableFill?: BarCellFavorableFill;
  /** 根 svg 的 data-testid，由呼叫端依 PRD §4.7 組（例如 chart-overview-bridge-bar-{field}）；不用陣列索引、不以 kpi- 開頭。 */
  testId?: string;
  /** 加在根 svg 的額外 class（例如各圖用來控制顯示的 class）。 */
  className?: string;
  /** 點條：呼叫與同列 number-link 相同的 handler。條本身不可聚焦，鍵盤一律經 number-link。 */
  onClick?: () => void;
}
export type BarCellProps = BarCellVarianceProps;

/** C24 表格內嵌條：放在既有 <td> 或清單列內、同列數字之前；整個 svg aria-hidden，不改表格 DOM、testid 與 number-link。 */
export function BarCell({ value, max, tone, favorableFill = "favorable", testId, className, onClick }: BarCellProps) {
  const { width, height, zeroX, bar } = barCellGeometry({ mode: "variance", value, max });
  return <svg
    className={`bar-cell is-variance${onClick ? " is-clickable" : ""}${className ? ` ${className}` : ""}`}
    data-chart-kind="cell"
    data-testid={testId}
    data-tone={tone}
    viewBox={`0 0 ${width} ${height}`}
    width={width}
    height={BAR_CELL_HEIGHT}
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
    onClick={onClick}
  >
    {bar && <rect className="bar-cell-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={barCellFill(tone, favorableFill)} />}
    <line className="bar-cell-zero" x1={zeroX} x2={zeroX} y1={0} y2={height} stroke={chartColors.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
  </svg>;
}
