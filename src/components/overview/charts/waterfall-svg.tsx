"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { chartColors, chartFontSize } from "@/application/chart-theme";
import { formatAmountL1, MINUS } from "@/application/presentation";
import { waterfallToneColor, type WaterfallBar } from "@/application/waterfall";
import { fill, labels } from "@/i18n";

// V3-4b 代理 B1：純 inline SVG 的瀑布圖（C17；PRD §7.1 第 5 點、§9.5、§10.3）。不加套件。
// 金額一律來自 waterfall.ts 組好的 WaterfallBar：柱上標值用 bar.display，Number() 只用來換算圖形座標。
// 整張圖是 aria-hidden 的視覺層；鍵盤與螢幕報讀走旁邊表格的 number-link（同一個開抽屜的 handler）。

/**
 * SVG 的預設最小寬（px）：容器比這個窄時（手機、平板）改成水平捲動。幾何也至少用這個寬度計算，CSS min-width 與它相同，
 * 所以 SVG 永遠 1:1 顯示、12px 字不會被縮小。各圖可依柱數傳 minWidth（拆解 11 根、利潤結構 10 根）。
 */
export const WATERFALL_MIN_WIDTH = 560;
/** SSR 與量到寬度之前的預設寬。 */
export const WATERFALL_SSR_WIDTH = 800;
/** 繪圖區邊界：左側放 Y 軸刻度、上方放柱上標值、下方放兩行 x 標籤。 */
const MARGIN = { top: 24, right: 8, bottom: 40, left: 64 } as const;
const LABEL_GAP = 6;
/** 標值避讓：一行的高度、左右最少間隔、最高的基線位置。 */
const LABEL_LINE = 13;
const LABEL_PAD = 2;
const LABEL_TOP_MIN = 12;
/** x 標籤兩行的基線（繪圖區底下 15px、第二行再 13px）：容器水平捲動時，傳統捲軸只會蓋到圖底最後幾 px。 */
const X_LABEL_FIRST = 15;
const X_LABEL_LINE = 13;
/** 資料待補的虛線框最矮高度（前面沒有水位可參考時）。 */
const MISSING_MIN = 24;
/** 柱寬佔每格的比例（約 60% 柱、40% 間距）。 */
const BAR_RATIO = 0.6;
const TEN_THOUSAND = 10_000;
const HUNDRED_MILLION = 100_000_000;

export type WaterfallValueTone = "strong" | "neg" | "muted" | "missing";
export interface WaterfallBarShape {
  bar: WaterfallBar;
  x: number;
  cx: number;
  width: number;
  /** null：前面有缺值、無法定位（不畫柱、不標值，只畫 x 標籤）。 */
  rect: { y: number; height: number; dashed: boolean } | null;
  value: { y: number; tone: WaterfallValueTone } | null;
  xLabel: string[];
}
export interface WaterfallGeometry {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  ticks: { value: number; y: number; label: string }[];
  zeroY: number;
  shapes: WaterfallBarShape[];
  connectors: { key: string; x1: number; x2: number; y: number }[];
}

/** 圖形座標（只用於畫圖，顯示文字一律用 bar.display）。 */
const coordinate = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const round = (n: number) => Math.round(n * 10) / 10;

/** 1／2／5 × 10^n 的刻度間距（以 √2、√10、√50 為分界取最接近的整齊間距，刻度約 4–7 條）。 */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= Math.SQRT2 * 5 ? 10 : unit >= Math.sqrt(10) ? 5 : unit >= Math.SQRT2 ? 2 : 1) * power;
}

/** 12px 字的估寬（px）：全形與中日韓字 12、數字與正負號 7、其他（小數點、逗號、空白）4。只用於排版避讓。 */
export function waterfallTextWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    return sum + (code >= 0x2e80 ? 12 : (code >= 48 && code <= 57) || char === "+" || char === MINUS ? 7 : 4);
  }, 0);
}

/** 千分位（整數部分）。 */
const grouped = (fixed: string) => { const [integer, fraction] = fixed.split("."); const withCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ","); return fraction === undefined ? withCommas : `${withCommas}.${fraction}`; };

/**
 * Y 軸刻度文字（§9.5：整數萬元「0、50 萬、100 萬」）。刻度只是座標，不是金額：
 * 最大刻度 ≥ 1 萬時全部用萬（間距是整萬時不帶小數），< 1 萬或 ≥ 1 億時交給 formatAmountL1（元／億）；0 只寫「0」。
 */
export function waterfallTickLabels(ticks: readonly number[], step: number): string[] {
  const top = Math.max(0, ...ticks.map(value => Math.abs(value)));
  const wan = top >= TEN_THOUSAND && top < HUNDRED_MILLION;
  const digits = step % TEN_THOUSAND === 0 ? 0 : step % 1000 === 0 ? 1 : 2;
  return ticks.map(value => {
    if (value === 0) return "0";
    if (!wan) return formatAmountL1(value.toFixed(2));
    return `${value < 0 ? MINUS : ""}${fill(labels.units.wan, { value: grouped((Math.abs(value) / TEN_THOUSAND).toFixed(digits)) })}`;
  });
}

/** x 標籤：放不下一行（12px 字估寬）時從中間拆成兩行，寫法同設計稿（商品／成本、其他／變動費）。 */
export function splitWaterfallLabel(text: string, room: number): string[] {
  const chars = Array.from(text);
  if (waterfallTextWidth(text) <= room - 4 || chars.length < 2) return [text];
  const cut = Math.floor(chars.length / 2);
  return [chars.slice(0, cut).join(""), chars.slice(cut).join("")];
}

/**
 * 瀑布幾何（純函式，單元測試用）：Y 軸含 0（§9.5「長條與瀑布從 0 開始」），水位為負時往下畫；
 * total／subtotal／result 從 0 畫到 value，delta 從 start 畫到 end；value 缺值畫虛線框，value 有值但 start／end 為 null 不畫柱。
 */
export function waterfallGeometry(bars: readonly WaterfallBar[], width: number, height: number): WaterfallGeometry {
  const plot = { left: MARGIN.left, right: Math.max(width - MARGIN.right, MARGIN.left + 1), top: MARGIN.top, bottom: Math.max(height - MARGIN.bottom, MARGIN.top + 1) };
  const levels = [0];
  for (const bar of bars) for (const value of [bar.start, bar.end]) { const n = coordinate(value); if (n !== null) levels.push(n); }
  const min = Math.min(...levels), max = Math.max(...levels);
  let lo = 0, hi = 1, step = 1, tickValues = [0];
  if (min !== 0 || max !== 0) {
    step = niceStep((max - min) / 5);
    lo = Math.floor(min / step) * step;
    hi = Math.ceil(max / step) * step;
    if (hi === lo) hi = lo + step;
    tickValues = [];
    for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) tickValues.push(Number((k * step).toPrecision(12)) || 0);
  }
  const y = (value: number) => plot.top + ((hi - value) / (hi - lo)) * (plot.bottom - plot.top);
  const zeroY = y(0);
  const tickText = waterfallTickLabels(tickValues, step);
  const ticks = tickValues.map((value, index) => ({ value, y: round(y(value)), label: tickText[index] }));

  const slot = (plot.right - plot.left) / Math.max(bars.length, 1);
  const barWidth = slot * BAR_RATIO;
  let lastLevel: number | null = null;
  const shapes = bars.map((bar, index): WaterfallBarShape => {
    const x = plot.left + index * slot + (slot - barWidth) / 2;
    const base = { bar, x: round(x), cx: round(x + barWidth / 2), width: round(barWidth), xLabel: splitWaterfallLabel(bar.shortLabel, slot) };
    const start = coordinate(bar.start), end = coordinate(bar.end);
    if (bar.value === null) {
      // 資料待補：虛線框從 0 畫到最後一個已知水位（沒有時畫 24px 高），框上標「資料待補」。
      const ref = y(lastLevel ?? 0);
      let top = Math.min(zeroY, ref), bottom = Math.max(zeroY, ref);
      if (bottom - top < MISSING_MIN) { top = Math.max(plot.top, zeroY - MISSING_MIN); bottom = top + MISSING_MIN; }
      return { ...base, rect: { y: round(top), height: round(bottom - top), dashed: true }, value: { y: round(top - LABEL_GAP), tone: "missing" } };
    }
    if (start === null || end === null) return { ...base, rect: null, value: null };
    const [a, b] = bar.kind === "delta" ? [start, end] : [0, end];
    const top = y(Math.max(a, b)), bottom = y(Math.min(a, b));
    // 0 元的段畫成 1px 細線，仍可點。
    const rect = bottom - top < 1 ? { y: round(top - 0.5), height: 1, dashed: false } : { y: round(top), height: round(bottom - top), dashed: false };
    lastLevel = end;
    const tone: WaterfallValueTone = bar.kind === "delta" ? (bar.tone === "unfavorable" ? "neg" : "muted") : end < 0 ? "neg" : "strong";
    return { ...base, rect, value: { y: round(Math.min(top, rect.y) - LABEL_GAP), tone } };
  });

  // 柱上標值避讓：與前一個標值水平重疊、高度相近時（例如增加段之後緊接的扣項、相鄰的小額扣項），
  // 往下的段改標在柱底下方；其餘往上移一行（不超出圖頂）。只動標值位置，不動柱。
  let previousBox: { x2: number; y: number } | null = null;
  for (const shape of shapes) {
    if (!shape.value) continue;
    const half = waterfallTextWidth(shape.bar.display) / 2;
    let labelY = shape.value.y;
    if (previousBox && shape.cx - half < previousBox.x2 + LABEL_PAD && Math.abs(labelY - previousBox.y) < LABEL_LINE) {
      const start = coordinate(shape.bar.start), end = coordinate(shape.bar.end);
      const downward = shape.rect !== null && !shape.rect.dashed && shape.bar.kind === "delta" && start !== null && end !== null && end < start;
      const below = downward ? shape.rect!.y + shape.rect!.height + LABEL_LINE : null;
      if (below !== null && below <= plot.bottom - 2) labelY = below;
      else if (previousBox.y - LABEL_LINE >= LABEL_TOP_MIN) labelY = Math.min(labelY, previousBox.y - LABEL_LINE);
      shape.value = { ...shape.value, y: round(labelY) };
    }
    previousBox = { x2: shape.cx + half, y: labelY };
  }

  const connectors: WaterfallGeometry["connectors"] = [];
  for (let index = 1; index < shapes.length; index++) {
    const previous = shapes[index - 1], current = shapes[index];
    const level = coordinate(previous.bar.end);
    if (!previous.rect || previous.rect.dashed || !current.rect || current.rect.dashed || level === null || current.bar.start === null) continue;
    connectors.push({ key: `${previous.bar.id}-${current.bar.id}`, x1: round(previous.x + barWidth), x2: current.x, y: round(y(level)) });
  }
  return { width, height, plot, ticks, zeroY: round(zeroY), shapes, connectors };
}

export interface WaterfallSvgProps {
  bars: readonly WaterfallBar[];
  /** 圖高（px）：瀑布用 chartHeights.lg（320）。容器固定這個高度，資料、狀態改變都不改高度（C16）。 */
  height: number;
  /** 容器寬（px）；不給時以 ResizeObserver 量測，SSR 先用 800。 */
  width?: number;
  /** 圖本身的 data-testid（例如 bridge-waterfall）。 */
  testId?: string;
  /** 每根柱 <rect data-testid={testIdPrefix + bar.metric}>（例如 profit-waterfall-bar-）。 */
  testIdPrefix?: string;
  /** SVG 最小寬（px，預設 560）；容器較窄時水平捲動。 */
  minWidth?: number;
  /** 點柱子：與表格列的 number-link 呼叫同一個開抽屜的 handler。 */
  onBarClick?: (bar: WaterfallBar) => void;
}

/** 瀑布圖：外框 .chart-frame.waterfall 固定高、aria-hidden；容器寬度不足 minWidth 時水平捲動（手機、平板）。 */
export function WaterfallSvg({ bars, height, width, testId, testIdPrefix, minWidth = WATERFALL_MIN_WIDTH, onBarClick }: WaterfallSvgProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setMeasured(current => current === next ? current : next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const drawWidth = Math.max(Math.round(width ?? measured ?? WATERFALL_SSR_WIDTH), minWidth);
  const geometry = useMemo(() => waterfallGeometry(bars, drawWidth, height), [bars, drawWidth, height]);
  const { plot, ticks, shapes, connectors, zeroY } = geometry;

  return <div ref={frame} className="chart-frame waterfall" aria-hidden="true" style={{ height }}>
    <svg className="waterfall-svg" viewBox={`0 0 ${drawWidth} ${height}`} width="100%" height={height} aria-hidden="true" focusable="false" fontSize={chartFontSize} style={{ "--wf-min-w": `${minWidth}px` } as CSSProperties} data-testid={testId}>
      <g className="wf-grid">{ticks.map(tick => <line key={tick.value} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
      <g className="wf-axis">{ticks.map(tick => <text key={tick.value} x={plot.left - 8} y={tick.y + 4} textAnchor="end">{tick.label}</text>)}</g>
      <g className="wf-connectors">{connectors.map(line => <line key={line.key} x1={line.x1} x2={line.x2} y1={line.y} y2={line.y} stroke={chartColors.connector} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
      <g className="wf-bars">{shapes.map(shape => shape.rect && <rect
        key={shape.bar.id}
        className={`wf-bar is-${shape.bar.tone}${onBarClick ? " is-clickable" : ""}`}
        data-testid={testIdPrefix ? `${testIdPrefix}${shape.bar.metric}` : undefined}
        x={shape.x} y={shape.rect.y} width={shape.width} height={shape.rect.height}
        fill={shape.rect.dashed ? "none" : waterfallToneColor[shape.bar.tone]}
        stroke={shape.rect.dashed ? chartColors.axis : undefined}
        strokeWidth={shape.rect.dashed ? 1 : undefined}
        strokeDasharray={shape.rect.dashed ? "4 3" : undefined}
        onClick={onBarClick ? () => onBarClick(shape.bar) : undefined}
      />)}</g>
      <g className="wf-values">{shapes.map(shape => shape.value && <text key={shape.bar.id} className={`wf-value is-${shape.value.tone}`} x={shape.cx} y={shape.value.y} textAnchor="middle">{shape.bar.display}</text>)}</g>
      <g className="wf-x">{shapes.map(shape => <text key={shape.bar.id} x={shape.cx} y={plot.bottom + X_LABEL_FIRST} textAnchor="middle">{shape.xLabel.map((line, index) => <tspan key={index} x={shape.cx} dy={index === 0 ? 0 : X_LABEL_LINE}>{line}</tspan>)}</text>)}</g>
      <line className="wf-zero" x1={plot.left} x2={plot.right} y1={zeroY} y2={zeroY} stroke={chartColors.connector} strokeWidth={1} shapeRendering="crispEdges" />
    </svg>
  </div>;
}
