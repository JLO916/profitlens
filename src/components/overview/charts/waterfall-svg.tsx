"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { chartColors, chartFontSize } from "@/application/chart-theme";
import { formatAxisWan, MINUS } from "@/application/presentation";
import { waterfallToneColor, type WaterfallBar } from "@/application/waterfall";

// V3-4b 代理 B1：純 inline SVG 的瀑布圖（C17；PRD §7.1 第 5 點、§9.5、§10.3）。不加套件。
// 金額一律來自 waterfall.ts 組好的 WaterfallBar：柱上標值用 bar.display，Number() 只用來換算圖形座標。
// 整張圖是 aria-hidden 的視覺層；鍵盤與螢幕報讀走旁邊表格的 number-link（同一個開抽屜的 handler）。
// V4-1 代理 A（PRD §6.2 C17、§7.2；CHART_CATALOG G1、G2）：加 bare（不再自己輸出 .chart-frame.waterfall 外框，外框由 ChartFrame 的
// frameClassName="waterfall" 提供，每張圖只有一個 .chart-frame）與選填 domain（總覽兩張瀑布同尺度）；刻度改呼叫 presentation.ts 的 formatAxisWan。
// V4-8a 代理 A（D-V4-9）：投影把 --text-12 對應到 14px。WaterfallSvg 量圖內文字的實際字級，不是 12px 時排版依比例換算（waterfallTextLayout）；
// 12px（一般模式、SSR、列印）的輸出與開工錨點 03dc3a8 逐字相同。

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
/** Y 軸刻度文字的基線比刻度線低 4px（12px 字垂直置中）。 */
const TICK_DY = 4;
/**
 * 排版的基準字級（px）：圖內文字是 chartFontSize＝var(--text-12)。V4-8a（D-V4-9）投影把 --text-12 對應到 14px：
 * WaterfallSvg 量到的字級不是 12 時，估寬、標值與 x 標籤的行高、圖頂最高基線與四邊邊界（右邊界除外）依比例換算；12px 時一律用原值，輸出逐字不變。
 */
export const WATERFALL_FONT_PX = 12;
interface WaterfallTextLayout { fontPx: number; margin: { top: number; right: number; bottom: number; left: number }; labelLine: number; labelTopMin: number; xFirst: number; xLine: number; tickDy: number }
const BASE_TEXT_LAYOUT: WaterfallTextLayout = { fontPx: WATERFALL_FONT_PX, margin: MARGIN, labelLine: LABEL_LINE, labelTopMin: LABEL_TOP_MIN, xFirst: X_LABEL_FIRST, xLine: X_LABEL_LINE, tickDy: TICK_DY };
/** 字級換算後的排版常數（四捨五入到整數 px）；12px（或量不到）時就是原值。 */
function waterfallTextLayout(fontPx: number): WaterfallTextLayout {
  if (fontPx === WATERFALL_FONT_PX || !(fontPx > 0)) return BASE_TEXT_LAYOUT;
  const scale = (n: number) => Math.round((n * fontPx) / WATERFALL_FONT_PX);
  return { fontPx, margin: { top: scale(MARGIN.top), right: MARGIN.right, bottom: scale(MARGIN.bottom), left: scale(MARGIN.left) }, labelLine: scale(LABEL_LINE), labelTopMin: scale(LABEL_TOP_MIN), xFirst: scale(X_LABEL_FIRST), xLine: scale(X_LABEL_LINE), tickDy: scale(TICK_DY) };
}
/** 資料待補的虛線框最矮高度（前面沒有水位可參考時）。 */
const MISSING_MIN = 24;
/** 柱寬佔每格的比例（約 60% 柱、40% 間距）。 */
const BAR_RATIO = 0.6;

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
  /** V4-8a：排版用的字級與換算後的刻度文字、x 標籤基線（12px 時是 4、15、13）。 */
  text: { fontPx: number; tickDy: number; xFirst: number; xLine: number };
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

/** 12px 字的估寬（px）：全形與中日韓字 12、數字與正負號 7、其他（小數點、逗號、空白）4。只用於排版避讓。V4-8a：fontPx 不是 12 時依比例換算。 */
export function waterfallTextWidth(text: string, fontPx: number = WATERFALL_FONT_PX): number {
  const width = Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    return sum + (code >= 0x2e80 ? 12 : (code >= 48 && code <= 57) || char === "+" || char === MINUS ? 7 : 4);
  }, 0);
  return fontPx === WATERFALL_FONT_PX || !(fontPx > 0) ? width : (width * fontPx) / WATERFALL_FONT_PX;
}

/**
 * Y 軸刻度文字（§9.5：整數萬元「0、50 萬、100 萬」）。V4-1 起是 formatAxisWan（presentation.ts）的薄包裝，輸出與 V3 相同：
 * 最大刻度 ≥ 1 萬時全部用萬（間距是整萬時不帶小數），< 1 萬或 ≥ 1 億時交給 formatAmountL1（元／億）；0 只寫「0」。
 */
export function waterfallTickLabels(ticks: readonly number[], step: number): string[] {
  return formatAxisWan(ticks, step);
}

/** x 標籤：放不下一行（12px 字估寬；V4-8a 起依 fontPx）時從中間拆成兩行，寫法同設計稿（商品／成本、其他／變動費）。 */
export function splitWaterfallLabel(text: string, room: number, fontPx: number = WATERFALL_FONT_PX): string[] {
  const chars = Array.from(text);
  if (waterfallTextWidth(text, fontPx) <= room - 4 || chars.length < 2) return [text];
  const cut = Math.floor(chars.length / 2);
  return [chars.slice(0, cut).join(""), chars.slice(cut).join("")];
}

/**
 * 瀑布幾何（純函式，單元測試用）：Y 軸含 0（§9.5「長條與瀑布從 0 開始」），水位為負時往下畫；
 * total／subtotal／result 從 0 畫到 value，delta 從 start 畫到 end；value 缺值畫虛線框，value 有值但 start／end 為 null 不畫柱。
 * V4-1 domain（選填，[最低, 最高] 的圖形座標）：與自己的水位一起決定刻度間距與上下界，給同頁同尺度用（PRD §7.2；
 * 總覽兩張瀑布傳 waterfall.ts 的 overviewWaterfallDomain）。上下界取刻度間距的整數倍，所以範圍含負值時下界延伸到下一個刻度（D-V4-41 註記）。
 * 兩張圖的 domain 涵蓋各自全部的水位時，刻度間距、上下界與刻度完全相同。
 * V4-8a fontPx（選填，預設 12）：圖內文字的實際字級（投影 14px）；不是 12 時估寬、行高與邊界依比例換算（waterfallTextLayout），12 時輸出與開工錨點 03dc3a8 逐字相同（tests/fixtures/waterfall-svg-v4-8a.json）。
 */
export function waterfallGeometry(bars: readonly WaterfallBar[], width: number, height: number, domain?: readonly [number, number], fontPx: number = WATERFALL_FONT_PX): WaterfallGeometry {
  const layout = waterfallTextLayout(fontPx);
  const { margin } = layout;
  const plot = { left: margin.left, right: Math.max(width - margin.right, margin.left + 1), top: margin.top, bottom: Math.max(height - margin.bottom, margin.top + 1) };
  const levels = [0];
  for (const bar of bars) for (const value of [bar.start, bar.end]) { const n = coordinate(value); if (n !== null) levels.push(n); }
  if (domain) for (const value of domain) if (Number.isFinite(value)) levels.push(value);
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
    const base = { bar, x: round(x), cx: round(x + barWidth / 2), width: round(barWidth), xLabel: splitWaterfallLabel(bar.shortLabel, slot, layout.fontPx) };
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
    const half = waterfallTextWidth(shape.bar.display, layout.fontPx) / 2;
    let labelY = shape.value.y;
    if (previousBox && shape.cx - half < previousBox.x2 + LABEL_PAD && Math.abs(labelY - previousBox.y) < layout.labelLine) {
      const start = coordinate(shape.bar.start), end = coordinate(shape.bar.end);
      const downward = shape.rect !== null && !shape.rect.dashed && shape.bar.kind === "delta" && start !== null && end !== null && end < start;
      const below = downward ? shape.rect!.y + shape.rect!.height + layout.labelLine : null;
      if (below !== null && below <= plot.bottom - 2) labelY = below;
      else if (previousBox.y - layout.labelLine >= layout.labelTopMin) labelY = Math.min(labelY, previousBox.y - layout.labelLine);
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
  return { width, height, plot, ticks, zeroY: round(zeroY), shapes, connectors, text: { fontPx: layout.fontPx, tickDy: layout.tickDy, xFirst: layout.xFirst, xLine: layout.xLine } };
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
  /**
   * V4-1：放在 ChartFrame（frameClassName="waterfall"）內時傳 true。不輸出 .chart-frame.waterfall 外框，只輸出量寬用的
   * div.waterfall-measure（沒有 chart-frame class、沒有 aria-hidden）與 aria-hidden 的 svg；固定高與水平捲動由 ChartFrame 的外框負責。
   */
  bare?: boolean;
  /** V4-1：同頁同尺度的共同範圍（圖形座標 [最低, 最高]），見 waterfallGeometry。 */
  domain?: readonly [number, number];
}

/**
 * 瀑布圖：容器寬度不足 minWidth 時水平捲動（手機、平板）。
 * 預設（V3）自己輸出 .chart-frame.waterfall 外框（固定高、aria-hidden）；bare（V4-1）只輸出量寬容器與 aria-hidden 的 svg，外框交給 ChartFrame。
 */
export function WaterfallSvg({ bars, height, width, testId, testIdPrefix, minWidth = WATERFALL_MIN_WIDTH, onBarClick, bare = false, domain }: WaterfallSvgProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  // V4-8a（D-V4-9）：圖內文字的實際字級。SSR 與量到之前是 12px；投影把 --text-12 對應到 14px（<html> 的屬性改變後樣式重算），量到不同才換算排版。
  const [fontPx, setFontPx] = useState(WATERFALL_FONT_PX);
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const readFont = () => {
      const sample = node.querySelector("svg text");
      const px = sample ? Number.parseFloat(getComputedStyle(sample).fontSize) : Number.NaN;
      if (px > 0) setFontPx(current => current === px ? current : px);
    };
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setMeasured(current => current === next ? current : next);
      readFont();
    });
    observer.observe(node);
    // 進出投影時寬度通常也會變（側欄隱藏），但不保證；<html> 的屬性一變就再量一次字級。
    const root = typeof MutationObserver === "undefined" ? null : new MutationObserver(readFont);
    root?.observe(document.documentElement, { attributes: true });
    return () => { observer.disconnect(); root?.disconnect(); };
  }, []);
  const drawWidth = Math.max(Math.round(width ?? measured ?? WATERFALL_SSR_WIDTH), minWidth);
  const lo = domain?.[0], hi = domain?.[1];
  const geometry = useMemo(() => waterfallGeometry(bars, drawWidth, height, lo === undefined || hi === undefined ? undefined : [lo, hi], fontPx), [bars, drawWidth, height, lo, hi, fontPx]);
  const { plot, ticks, shapes, connectors, zeroY, text: textLayout } = geometry;

  const svg = <svg className="waterfall-svg" viewBox={`0 0 ${drawWidth} ${height}`} width="100%" height={height} aria-hidden="true" focusable="false" fontSize={chartFontSize} style={{ "--wf-min-w": `${minWidth}px` } as CSSProperties} data-testid={testId}>
    <g className="wf-grid">{ticks.map(tick => <line key={tick.value} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
    <g className="wf-axis">{ticks.map(tick => <text key={tick.value} x={plot.left - 8} y={tick.y + textLayout.tickDy} textAnchor="end">{tick.label}</text>)}</g>
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
    <g className="wf-x">{shapes.map(shape => <text key={shape.bar.id} x={shape.cx} y={plot.bottom + textLayout.xFirst} textAnchor="middle">{shape.xLabel.map((line, index) => <tspan key={index} x={shape.cx} dy={index === 0 ? 0 : textLayout.xLine}>{line}</tspan>)}</text>)}</g>
    <line className="wf-zero" x1={plot.left} x2={plot.right} y1={zeroY} y2={zeroY} stroke={chartColors.connector} strokeWidth={1} shapeRendering="crispEdges" />
  </svg>;
  if (bare) return <div ref={frame} className="waterfall-measure">{svg}</div>;
  return <div ref={frame} className="chart-frame waterfall" aria-hidden="true" style={{ height }}>{svg}</div>;
}
