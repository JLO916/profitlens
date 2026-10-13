"use client";

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { chartColors, chartFontSize, chartHeights, chartRowHeights } from "@/application/chart-theme";
import { THRESHOLD_V_MAX, THRESHOLD_V_MIN, type ThresholdPointKind } from "@/application/chart-threshold";
import { formatAxisPercent } from "@/application/copy";
import { formatAxisWan } from "@/application/presentation";
import { rankedTextWidth } from "./ranked-bars";

// V4-5 代理 A：C29 ThresholdLine 門檻點（PRD §6.3 C29、§4.3 G16、§7.1、§7.4、X29；CHART_CATALOG G16、§9.1；D-V4-20＝A′）。
// 純 inline SVG，SSR 會輸出每個點與 testid。只畫範圍內的既有點，不連線（D-V4-20＝A′：幾何沒有任何線段，圖內沒有 path、polyline，
// 所有 line 都是格線、零線與 x 刻度），不外插、不延伸、不把超界的點夾到邊界：
//   x：銷量變動 %，固定 [−90%, +100%]（docs/SCENARIOS.md:12），每 25 個百分點一個刻度（範圍內 25 的倍數：−75 到 +100），刻度文字用 formatAxisPercent；
//      繪圖區太窄、相鄰刻度文字放不下時只標 50 的倍數（刻度線照畫）；
//   y：扣廣告後貢獻，範圍一定含 0，刻度是 1、2、5 × 10ⁿ 的整齊步長（至少 1 元：formatAxisWan 不到萬時取到元，步長小於 1 元會讓刻度文字重複或與刻度不符）、上下界取步長的整數倍，刻度文字用 formatAxisWan；零線 chartColors.axis，其他格線 chartColors.grid；
//   門檻點（kind="threshold"）：空心圓，fill="none"、stroke chartColors.target；使用者點（kind="user"）：實心 chartColors.total
//   （試算是假設、不是本期資料，不用強調色 chartColors.current，也避免綠點被讀成有利，CHART_CATALOG G16）；
//   點標籤由呼叫端從 labels 組好傳入（label 寬版、shortLabel 窄版：繪圖寬 < THRESHOLD_NARROW_BELOW 時用 shortLabel，390 的「門檻標籤縮短為百分比」）；
//   標籤預設在點的上方，碰到上緣、x 軸列或其他標籤、點時依序改放下方、右側、左側（都碰到時取 svg 內與已放標籤、其他點重疊面積最小的位置）；端點不另標值（只有呼叫端給的標籤）。
//   V4-8b（D-V4-59 (7)）：標籤的左界是繪圖區左緣（不進 y 刻度文字欄），置中放不下時從繪圖區左緣起。
// 根 svg aria-hidden、focusable=false；點不可點（PRD §8.7 例外：試算結果是假設、不是 CSV 彙總，v3 的門檻與敏感度表都是純文字），
// 圖內沒有 tabIndex、onClick、<a>、<button>（CL-7）；語意由同區塊的門檻說明（threshold-{id}）、敏感度表與 C33 資料表承擔。
// 色只經 chart-theme.ts 的 chartColors（沒有色碼與 var() 字串常值，CL-3）；svg 高＝chartHeights.sm（CL-10）；字級只用 chartFontSize（CL-5）。
// 座標只是圖形近似值（Number，取到 0.1）；顯示文字一律是呼叫端傳入或格式化函式的輸出。

/** 一個要畫的點：與 chart-threshold.ts 的 ThresholdPoint 相容（id、kind、v、y），另加呼叫端組好的標籤與 testid。 */
export interface ThresholdLinePoint {
  /** 語意 key（testid 尾段）：zero_contribution、maintain_baseline、a、b、c；同一張圖內唯一，不用陣列索引（CL-2）。 */
  id: string;
  kind: ThresholdPointKind;
  /** 銷量變動（百分數，domain 的精確字串，例如 "-51.263537906137"、"+20"）；不在 [−90, +100] 或無法解析時不畫（不外插、不夾到邊界）。 */
  v: string | number;
  /** 扣廣告後貢獻（domain 的精確字串，例如 "284.00"）；無法解析時不畫。 */
  y: string | number;
  /** 寬版標籤（例如「打平 −51.3%」）；不給時沒有標籤。 */
  label?: string;
  /** 窄版標籤（例如「−51.3%」）；不給時沿用 label。 */
  shortLabel?: string;
  /** 點的 data-testid；不給時用 ThresholdLine 的 testIdPrefix＋id。 */
  testId?: string;
}

/** 標籤相對於點的位置：上方（預設）、下方、右側、左側。 */
export type ThresholdLabelPlacement = "above" | "below" | "right" | "left";
export interface ThresholdLabelShape { text: string; x: number; y: number; anchor: "start" | "middle" | "end"; placement: ThresholdLabelPlacement }
export interface ThresholdPointShape {
  point: ThresholdLinePoint;
  cx: number;
  cy: number;
  label: ThresholdLabelShape | null;
}
export interface ThresholdTick { value: number; x: number; label: string | null }
export interface ThresholdYTick { value: number; y: number; label: string }
export interface ThresholdGeometry {
  width: number;
  height: number;
  /** 繪圖區（點的圓心只落在這個範圍內）。 */
  plot: { left: number; right: number; top: number; bottom: number };
  narrow: boolean;
  xTicks: ThresholdTick[];
  yTicks: ThresholdYTick[];
  /** y 的範圍（圖形座標，一定含 0）。 */
  domain: [number, number];
  zeroY: number;
  /** 要畫的點（畫的順序：使用者點在前、門檻點在後，空心圈疊在實心點之上，兩者重合時都看得到）。 */
  points: ThresholdPointShape[];
  /** 沒畫的點 id（v 不在 [−90, +100]、v 或 y 無法解析）。 */
  dropped: string[];
  /** D-V4-20＝A′：永遠不連線（沒有任何線段）。 */
  connected: false;
}
export interface ThresholdGeometryOptions {
  /** 窄版（用 shortLabel）；不給時依寬度：寬 < THRESHOLD_NARROW_BELOW。 */
  narrow?: boolean;
}

/** SSR（還沒量到寬）時的座標系寬，與 C25、C27 相同。 */
export const THRESHOLD_SSR_WIDTH = 560;
/** 寬度小於這個值時用窄版標籤（與 C27 ShareStack 的窄版斷點相同）。 */
export const THRESHOLD_NARROW_BELOW = 480;
/** x 刻度間距（百分點）與刻度：[−90, +100] 內 THRESHOLD_X_STEP 的倍數。 */
export const THRESHOLD_X_STEP = 25;
export const THRESHOLD_X_TICKS = [-75, -50, -25, 0, 25, 50, 75, 100] as const;
/** 放不下每 25 的刻度文字時，只標這個步長的倍數。 */
const X_LABEL_COARSE = 50;
/** 點的半徑與空心圈的框線寬（圖例 ring 同形：r 4、1.5）。 */
export const THRESHOLD_POINT_R = 4;
export const THRESHOLD_RING_STROKE = 1.5;
/** 繪圖區上緣：最上方的點上面留一行標籤。 */
const PLOT_TOP = 18;
/** x 刻度線長、刻度文字基線（繪圖區下緣起算）；x 軸佔一列 row24。 */
const X_TICK_LENGTH = 4;
const X_LABEL_BASELINE = 16;
/** y 刻度文字與繪圖區之間、文字與欄邊的間距。 */
const Y_LABEL_GAP = 8;
/** 點與標籤的間距；12px 字的上伸與下伸（避讓用的近似框）。 */
const LABEL_GAP = 4;
const LABEL_ASCENT = 10;
const LABEL_DESCENT = 3;
/** 左右側標籤的基線在圓心下方 4px（12px 字的視覺中線約與圓心齊）。 */
const LABEL_SIDE_DROP = 4;
/** 目標 y 刻度數（間距約 4 格）。 */
const Y_INTERVALS = 4;
/** y 最小步長 1 元：formatAxisWan 在 1 萬以下用 formatAmountL1 取到元，0.5 元的刻度會寫成「1 元」（與 1 元的刻度重複）。 */
const Y_MIN_STEP = 1;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** 1、2、5 × 10ⁿ 的刻度間距（同 C17 瀑布：以 √2、√10、√50 為分界取最接近的整齊間距）。 */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= Math.SQRT2 * 5 ? 10 : unit >= Math.sqrt(10) ? 5 : unit >= Math.SQRT2 ? 2 : 1) * power;
}

/** 精確字串或數值轉圖形座標；null、空字串、無法解析時回傳 null。 */
function coordinateOf(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = value.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

interface Box { left: number; right: number; top: number; bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * 標籤的 x、對齊與左緣（避讓用）。上、下方置中，置中會超出左緣或 svg 右緣時改從點的左緣起（start，不早於左緣）或到點的右緣止（end）；
 * 右側從點的右緣＋4 起（start）、左側到點的左緣−4 止（end）。
 * V4-8b（D-V4-59 (7)）：左緣是繪圖區左緣 plot.left（不是 svg 左緣 0）——y 刻度文字欄不算可放標籤的空間（390 示範資料的「−87.9%」原本壓在「0」刻度上）。
 */
function labelX(cx: number, textWidth: number, placement: ThresholdLabelPlacement, width: number, left: number): { x: number; anchor: ThresholdLabelShape["anchor"]; left: number } {
  if (placement === "right") { const x = round1(cx + THRESHOLD_POINT_R + LABEL_GAP); return { x, anchor: "start", left: x }; }
  if (placement === "left") { const x = round1(cx - THRESHOLD_POINT_R - LABEL_GAP); return { x, anchor: "end", left: x - textWidth }; }
  if (cx - textWidth / 2 >= left && cx + textWidth / 2 <= width) return { x: cx, anchor: "middle", left: cx - textWidth / 2 };
  if (cx - textWidth / 2 < left) { const x = round1(Math.max(left, cx - THRESHOLD_POINT_R)); return { x, anchor: "start", left: x }; }
  const x = round1(Math.min(width, cx + THRESHOLD_POINT_R));
  return { x, anchor: "end", left: x - textWidth };
}

/**
 * C29 幾何（純函式，tests/chart-geometry-v4.test.ts、tests/chart-threshold.test.ts）。
 * 1. 只取 v ∈ [−90, +100]、v 與 y 都可解析的點；其他列入 dropped（不畫、不夾到邊界）。
 * 2. y：範圍含 0 與所有點；步長 niceStep((最大 − 最小) ÷ 4)、至少 1（元），上下界取步長的整數倍；只有 0（或沒有點）時範圍 [−1, 1]、只有 0 一個刻度，零線在正中。
 * 3. 左欄寬＝最長 y 刻度文字估寬＋8；右側留「100%」半個字寬與點半徑；繪圖區 x 從 −90 對到左緣、+100 對到右緣。
 * 4. x 刻度每 25 個百分點；相鄰刻度間距放不下最長刻度文字＋6 時，只標 50 的倍數。
 * 5. 標籤：先放門檻點、再放使用者點；依序試點的上方、下方、右側、左側，取第一個不超出 svg（上下不進 x 軸列、左邊不進 y 刻度文字欄，V4-8b）、不碰已放的標籤與其他點的位置；
 *    都碰到時取不超出的位置中，與已放標籤、其他點重疊面積最小者（同面積依上、下、右、左；都超出時放上方，上方超出上緣時放下方）。上、下方置中放不下時改靠左（不早於繪圖區左緣）或靠右對齊。
 * 不輸出任何線段（connected 恆為 false；D-V4-20＝A′）。
 */
export function thresholdGeometry(points: readonly ThresholdLinePoint[], width: number, options: ThresholdGeometryOptions = {}): ThresholdGeometry {
  const drawWidth = Math.max(1, Math.round(width));
  const height = chartHeights.sm;
  const narrow = options.narrow ?? drawWidth < THRESHOLD_NARROW_BELOW;
  const dropped: string[] = [];
  const drawn: { point: ThresholdLinePoint; v: number; y: number }[] = [];
  for (const point of points) {
    const v = coordinateOf(point.v), y = coordinateOf(point.y);
    if (v === null || y === null || v < THRESHOLD_V_MIN || v > THRESHOLD_V_MAX) dropped.push(point.id);
    else drawn.push({ point, v, y });
  }

  // y 範圍與刻度（圖形座標）。
  const ys = drawn.map(item => item.y);
  const min = Math.min(0, ...ys), max = Math.max(0, ...ys);
  let lo = -1, hi = 1, step = 1, tickValues = [0];
  if (min !== max) {
    step = Math.max(Y_MIN_STEP, niceStep((max - min) / Y_INTERVALS));
    lo = Math.floor(min / step) * step;
    hi = Math.ceil(max / step) * step;
    tickValues = [];
    for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) tickValues.push(Number((k * step).toPrecision(12)) || 0);
  }
  const yText = formatAxisWan(tickValues, step);
  const yLabelWidth = Math.ceil(Math.max(...yText.map(rankedTextWidth))) + Y_LABEL_GAP;

  // x 範圍：右側留「100%」半個字寬（置中的末刻度文字不被切）與點半徑。
  const xText = formatAxisPercent(THRESHOLD_X_TICKS.map(value => value / 100));
  const xTextWidth = Math.max(...xText.map(rankedTextWidth));
  const rightPad = Math.ceil(Math.max(rankedTextWidth(xText[xText.length - 1]) / 2, THRESHOLD_POINT_R + THRESHOLD_RING_STROKE)) + 2;
  const plot = {
    left: yLabelWidth,
    right: Math.max(yLabelWidth + 1, drawWidth - rightPad),
    top: PLOT_TOP,
    bottom: height - chartRowHeights.row24,
  };
  const xAt = (v: number) => round1(plot.left + (v - THRESHOLD_V_MIN) / (THRESHOLD_V_MAX - THRESHOLD_V_MIN) * (plot.right - plot.left));
  const yAt = (value: number) => round1(plot.top + (hi - value) / (hi - lo) * (plot.bottom - plot.top));
  const spacing = (plot.right - plot.left) * THRESHOLD_X_STEP / (THRESHOLD_V_MAX - THRESHOLD_V_MIN);
  const coarse = spacing < xTextWidth + 6;
  const xTicks = THRESHOLD_X_TICKS.map((value, index): ThresholdTick => ({ value, x: xAt(value), label: coarse && value % X_LABEL_COARSE !== 0 ? null : xText[index] }));
  const yTicks = tickValues.map((value, index): ThresholdYTick => ({ value, y: yAt(value), label: yText[index] }));

  // 點（使用者點在前、門檻點在後）與標籤（門檻點先放）。
  const shapes = drawn.map(item => ({ point: item.point, cx: xAt(item.v), cy: yAt(item.y), label: null as ThresholdLabelShape | null }));
  const ordered = [...shapes.filter(shape => shape.point.kind === "user"), ...shapes.filter(shape => shape.point.kind !== "user")];
  const pointBox = (shape: { cx: number; cy: number }): Box => ({ left: shape.cx - THRESHOLD_POINT_R, right: shape.cx + THRESHOLD_POINT_R, top: shape.cy - THRESHOLD_POINT_R, bottom: shape.cy + THRESHOLD_POINT_R });
  const placed: Box[] = [];
  const labelOrder = [...ordered.filter(shape => shape.point.kind !== "user"), ...ordered.filter(shape => shape.point.kind === "user")];
  for (const shape of labelOrder) {
    const text = (narrow ? shape.point.shortLabel ?? shape.point.label : shape.point.label ?? shape.point.shortLabel) ?? "";
    if (text === "") continue;
    const textWidth = rankedTextWidth(text);
    const others = shapes.filter(other => other !== shape).map(pointBox);
    const candidate = (placement: ThresholdLabelPlacement) => {
      const { x, anchor, left } = labelX(shape.cx, textWidth, placement, drawWidth, plot.left);
      const baseline = round1(placement === "above" ? shape.cy - THRESHOLD_POINT_R - LABEL_GAP : placement === "below" ? shape.cy + THRESHOLD_POINT_R + LABEL_GAP + LABEL_ASCENT : shape.cy + LABEL_SIDE_DROP);
      const box: Box = { left, right: left + textWidth, top: baseline - LABEL_ASCENT, bottom: baseline + LABEL_DESCENT };
      const inside = box.top >= 0 && box.bottom <= plot.bottom + X_TICK_LENGTH && box.left >= plot.left && box.right <= drawWidth;
      const blockers = [...placed, ...others];
      const clear = inside && !blockers.some(other => overlaps(box, other));
      const cost = inside ? blockers.reduce((sum, other) => sum + overlapArea(box, other), 0) : Number.POSITIVE_INFINITY;
      const label: ThresholdLabelShape = { text, x, y: baseline, anchor, placement };
      return { label, box, clear, cost };
    };
    const candidates = (["above", "below", "right", "left"] as const).map(candidate);
    const fitting = candidates.filter(item => Number.isFinite(item.cost));
    const chosen = candidates.find(item => item.clear)
      ?? (fitting.length > 0 ? fitting.reduce((best, item) => item.cost < best.cost ? item : best) : candidates[0].box.top >= 0 ? candidates[0] : candidates[1]);
    shape.label = chosen.label;
    placed.push(chosen.box);
  }
  return {
    width: drawWidth, height, plot, narrow, xTicks, yTicks,
    domain: [lo, hi], zeroY: yAt(0),
    points: ordered, dropped, connected: false,
  };
}

export interface ThresholdLineViewProps {
  geometry: ThresholdGeometry;
  /** 點的 data-testid 前綴（例如 chart-scenarios-threshold-point-）；點的 testid＝前綴＋id（point.testId 優先）。 */
  testIdPrefix?: string;
  /** 量寬容器的 ref；ThresholdLine 用它接 ResizeObserver。 */
  measureRef?: Ref<HTMLDivElement>;
}

/**
 * C29 的畫面（沒有 hook，給定幾何就是純輸出；ThresholdLine 量寬後交給它）。結構：div.threshold-line（量寬）> svg.chart-threshold（aria-hidden）：
 * y 格線（chartColors.grid）→ 零線（chartColors.axis）→ x 刻度線 → 軸文字 → 使用者點（實心 total）→ 門檻點（空心 target）→ 點標籤。沒有 path、polyline。
 */
export function ThresholdLineView({ geometry, testIdPrefix, measureRef }: ThresholdLineViewProps) {
  const { width, height, plot } = geometry;
  const testIdOf = (point: ThresholdLinePoint) => point.testId ?? (testIdPrefix ? `${testIdPrefix}${point.id}` : undefined);
  return <div ref={measureRef} className="threshold-line">
    <svg className="chart-threshold" viewBox={`0 0 ${width} ${height}`} width="100%" height={chartHeights.sm} aria-hidden="true" focusable="false" fontSize={chartFontSize} preserveAspectRatio="xMinYMin meet" data-points={geometry.points.length} data-narrow={geometry.narrow ? "true" : undefined}>
      <g className="threshold-grid">{geometry.yTicks.filter(tick => tick.value !== 0).map(tick => <line key={tick.value} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
      <line className="threshold-zero" x1={plot.left} x2={plot.right} y1={geometry.zeroY} y2={geometry.zeroY} stroke={chartColors.axis} strokeWidth={1} shapeRendering="crispEdges" />
      <g className="threshold-x-ticks">{geometry.xTicks.map(tick => <line key={tick.value} x1={tick.x} x2={tick.x} y1={plot.bottom} y2={plot.bottom + X_TICK_LENGTH} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
      <g className="threshold-axis threshold-y">{geometry.yTicks.map(tick => <text key={tick.value} x={plot.left - Y_LABEL_GAP} y={tick.y + 4} textAnchor="end">{tick.label}</text>)}</g>
      <g className="threshold-axis threshold-x">{geometry.xTicks.map(tick => tick.label !== null && <text key={tick.value} x={tick.x} y={plot.bottom + X_LABEL_BASELINE} textAnchor="middle">{tick.label}</text>)}</g>
      <g className="threshold-points">{geometry.points.map(shape => shape.point.kind === "user"
        ? <circle key={shape.point.id} className="threshold-point is-user" data-testid={testIdOf(shape.point)} data-kind="user" cx={shape.cx} cy={shape.cy} r={THRESHOLD_POINT_R} fill={chartColors.total} />
        : <circle key={shape.point.id} className="threshold-point is-threshold" data-testid={testIdOf(shape.point)} data-kind="threshold" cx={shape.cx} cy={shape.cy} r={THRESHOLD_POINT_R} fill="none" stroke={chartColors.target} strokeWidth={THRESHOLD_RING_STROKE} />)}</g>
      <g className="threshold-labels">{geometry.points.map(shape => shape.label && <text key={shape.point.id} className={`chart-value threshold-label is-${shape.point.kind}`} x={shape.label.x} y={shape.label.y} textAnchor={shape.label.anchor} data-placement={shape.label.placement}>{shape.label.text}</text>)}</g>
    </svg>
  </div>;
}

export interface ThresholdLineProps {
  /** 範圍內的既有點（thresholdPoints(...).points 加上呼叫端組好的標籤）；超界、無法解析的點不畫。 */
  points: readonly ThresholdLinePoint[];
  testIdPrefix?: string;
  /** 寬（px）；不給時以 ResizeObserver 量測，SSR 先用 560。 */
  width?: number;
  /** 窄版標籤；不給時依寬度（< THRESHOLD_NARROW_BELOW）。 */
  narrow?: boolean;
}

/**
 * C29 ThresholdLine：放在 ChartFrame（variant="inline"、height="sm"、固定高、aria-hidden）內。量寬（ResizeObserver）後算幾何，交給 ThresholdLineView。
 * svg 高固定 chartHeights.sm；量到寬之前以 560 的座標系等比縮放。L＝0、超出範圍、過期的說明文字由呼叫端放在 ChartFrame 的 subtitle、after、state／message（圖外、可讀）。
 */
export function ThresholdLine({ points, testIdPrefix, width, narrow }: ThresholdLineProps) {
  const main = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const node = main.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setMeasured(current => current === next ? current : next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const drawWidth = Math.round(width ?? measured ?? THRESHOLD_SSR_WIDTH);
  const geometry = useMemo(() => thresholdGeometry(points, drawWidth, { narrow }), [points, drawWidth, narrow]);
  return <ThresholdLineView geometry={geometry} testIdPrefix={testIdPrefix} measureRef={main} />;
}
