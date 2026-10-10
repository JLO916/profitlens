"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { chartFontSize, chartHeights, chartColors } from "@/application/chart-theme";

// V4-3b 代理 B：C26 SmallMultiples 小倍數（PRD §6.3 C26、§7.2、§7.6；CHART_CATALOG §9.1 C26、G12、G19）。第一個使用者是 G12 五項比率每週走勢，V4-6 的 G19 沿用。
// 單一 ChartFrame（frameClassName="multiples"）內的 CSS grid：每張子圖一個 inline SVG 折線（不套 section.panel，X8），子圖小標畫在 svg 內左上角。
// 用 inline SVG 而不用 Recharts：五張 LineChart 在健檢頁切換時的主執行緒成本較高（V4-3a 量到切到通路健檢的 390 TBT 只剩約 5% 餘裕），
// inline SVG 在 SSR 就輸出圖形，單元測試可以直接驗每張子圖的 Y 範圍；圖形規則（色、線寬、虛線、缺值斷線、最後一點 3px 實心點）與趨勢圖相同。
// 每張子圖各自定 Y（axis 由呼叫端給：同一指標的系列共用、不同指標各自）；X 是位置（第幾個，例如第幾週），所有子圖共用同一組位置。
// 全部子圖在 ChartFrame 的 aria-hidden 固定高容器內，所以本元件不輸出任何 <details>、按鈕、連結、tabIndex（CL-7、X35）；
// 點的熱區是透明圓（circle.chart-point-hit，沿用趨勢圖的作法；r 最多 8，位置窄時縮成位置寬的一半），點擊以事件代理交給每張 svg 的一個 onClick
// （不在每個點掛 handler），鍵盤經由資料表同一個 builder 的 number-link。
// 高度：每張子圖 svg 高＝chartHeights.sm（CL-10）。≥ 768px 一列放全部子圖、框高 sm；≤ 767px 單欄，框高＝chartHeights.sm × 子圖數（multiplesFrameStyle 給值，
// globals.css「V4-3b B」以 !important 蓋過 ChartFrame 固定高容器的 inline height；子圖數不隨期間改變，B4 照常比較）。
// 色只經 chart-theme.ts 的 chartColors（沒有色碼與 var() 字串常值，CL-3）；字級只用 chartFontSize（CL-5）。
// V4-6 代理 A（G19 會議歷史；CHART_CATALOG G19、§9.1 C26）：向下相容地擴充四項，沒有給新選項時輸出與 V4-5 逐字相同（tests/charts-meeting-g19.test.tsx 以
// tests/fixtures/small-multiples-v4-5.json 逐字比對 G12）：（1）系列的 dots：每個有值的點畫小實心點（最後一點仍是 3px 的 lastDot）；（2）gaps：斷段的間隙位置
// （該位置所有系列都是 null）在繪圖區垂直中間標一行字（例如「不同資料集」），放不進相鄰兩點之間時不畫（原因仍在資料表）；（3）fitXLabels：X 標依最寬的標估寬，
// 相鄰兩標放得下才每個都畫，否則只畫頭尾（頭尾也放不下時只畫最後一個），並把標收在 svg 內（G19 的標是資料本期「7/13–8/23」，比週序寬）；
// （4）估字寬時中日韓全形字算 12px（金額軸的「萬」「元」；G12 的比率標沒有全形字，估寬不變）。另加金額軸 amountAxis（整數萬含 0，刻度文字由呼叫端經 formatAxisWan）。

/** SSR（還沒量到寬）時每張子圖的座標系寬：1440 一列 5 張（面板內寬約 1122、間距 16）時的寬。 */
export const MULTIPLE_SSR_WIDTH = 211;
/** 小標的文字基線（svg 頂起算）。 */
const TITLE_BASELINE = 12;
/** 繪圖區上緣（小標一列之下）與下緣留給 X 標的高度。 */
const PLOT_TOP = 26;
const X_AXIS_SPACE = 20;
/** Y 標與繪圖區的間距、右側留白、Y 標每個字的估計寬（12px：數字與負號約 7、百分號約 11、小數點約 4），另留 2px 避免被 svg 邊緣裁掉。 */
const TICK_GAP = 6;
const RIGHT_PAD = 8;
const LABEL_PAD = 2;
/** V4-6：中日韓全形字（「萬」「元」與全形標點）的估計寬 12px（＝chartFontSize）。 */
const WIDE_CHAR = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const charWidth = (char: string) => char === "%" ? 11 : char === "." ? 4 : WIDE_CHAR.test(char) ? 12 : 7;
const labelWidth = (label: string) => [...label].reduce((sum, char) => sum + charWidth(char), 0);
/** 每個位置寬於這個值時每個 X 標都畫，否則只畫頭尾（768 寬一列 5 張時每張只有約 80px）。 */
const X_LABEL_MIN_SLOT = 16;
/** V4-6 fitXLabels：相鄰兩個 X 標之間至少留的空白。 */
const X_LABEL_GAP = 8;
/** 點的熱區半徑上限、最後一點的圓點半徑、前後都斷線的單一點半徑。 */
const HIT_R = 8;
const LAST_R = 3;
const ISOLATED_R = 1.5;
/** V4-6 dots：每個有值的點的小實心點半徑（比最後一點的 3px 小）。 */
const POINT_R = 2;
/** V4-6 gaps：間隙標與相鄰兩點之間至少留的空白（兩側各 6：最後一點半徑 3＋3）；文字基線在繪圖區垂直中間往下 4（12px 字的視覺中線）。 */
const GAP_PAD = 12;
const GAP_BASELINE = 4;
/** 線尾標值相對最後一點的位移（左上方，與趨勢圖相同）。 */
const LAST_LABEL_DX = 6;
const LAST_LABEL_DY = 8;
const LAST_LABEL_BELOW = 16;

/** 一張子圖的數值軸（只是圖形座標）：domain 含所有系列的值；labels 與 ticks 逐一對齊（文字由呼叫端經 presentation／copy 的格式化函式產生）。 */
export interface SmallMultipleAxis {
  domain: readonly [number, number];
  ticks: readonly number[];
  labels: readonly string[];
}
/** 一條線：values 與共用的位置逐一對齊（null 斷線，不內插、不當 0）；keys 是每個位置的語意 key（例如週起日），輸出在熱區的 data-key。 */
export interface SmallMultipleSeries {
  key: string;
  color: string;
  strokeWidth: number;
  dash?: string;
  values: readonly (number | null)[];
  keys?: readonly (string | null)[];
  /** 最後一個有值的點畫 3px 實心圓點（只給本期，強調色只在本期資料）。 */
  lastDot?: boolean;
  /** 線尾標值（L1，由呼叫端格式化）；畫在最後一個有值的點左上方，放不進繪圖區時不畫。 */
  lastLabel?: string;
  /**
   * V4-6：每個有值的點畫 2px 的小實心點（circle.multiple-point，data-index、data-key）；lastDot 時最後一點只畫 3px 的那一顆。
   * 給「每個位置都是一筆獨立紀錄」的序列（G19 每點是一次會議）；畫了小點就不另畫前後都斷線的單一點。
   */
  dots?: boolean;
}
/** V4-6：斷段的間隙（index 是該位置；所有系列在這個位置都應是 null）與間隙標（例如「不同資料集」「期間不同」）。 */
export interface SmallMultipleGap {
  index: number;
  label: string;
}
export interface SmallMultiplePanel {
  /** 語意 key（例如比率的 MetricName）：子圖外層 div 的 data-panel。 */
  key: string;
  /** 小標（指標名，取 metricDefinitions）。 */
  title: string;
  axis: SmallMultipleAxis;
  /** 畫線的順序就是疊放順序（後畫的在上層；本期放最後）。 */
  series: readonly SmallMultipleSeries[];
}

/** 1／2／5 × 10ⁿ 的步長（以 √2、√10、√50 為分界，與 H5 設計稿 gen/format.ts 的 niceStep 相同）。 */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= Math.SQRT2 * 5 ? 10 : unit >= Math.sqrt(10) ? 5 : unit >= Math.SQRT2 ? 2 : 1) * power;
}
/** 百分點去掉浮點尾數（0.07 × 100＝7.000000000000001）。 */
const toPoints = (ratio: number) => Math.round(ratio * 100 * 1e6) / 1e6;

/**
 * 比率軸（PRD §4.3、§4.4 G12、§7.2；值是 domain 的比率小數，例如 0.0188）：下界 min(0, 最小值)、上界 max(0, 最大值)；
 * 範圍 ≥ 10 個百分點時取整到 5 個百分點，否則取整到 1 個百分點；刻度從下界起每 step 一個（最多約 6 個，超過時步長放大成取整單位的倍數）。
 * 回傳的 domain、ticks、step 都是比率小數（只是座標）；沒有任何值時回傳 0 到 1 個百分點。
 */
export function rateAxis(values: readonly (number | null)[]): { domain: [number, number]; ticks: number[]; step: number } {
  const points = values.filter((value): value is number => value !== null && Number.isFinite(value)).map(toPoints);
  const min = Math.min(0, ...points), max = Math.max(0, ...points);
  const unit = max - min >= 10 ? 5 : 1;
  const lo = Math.floor(min / unit) * unit;
  const hi = Math.max(Math.ceil(max / unit) * unit, lo + unit);
  const span = hi - lo;
  const step = span / unit <= 5 ? unit : Math.max(unit, Math.ceil(niceStep(span / 4) / unit) * unit);
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + 1e-9; tick += step) ticks.push(Number((tick / 100).toFixed(6)) || 0);
  return { domain: [lo / 100, hi / 100], ticks, step: step / 100 };
}

interface Point { index: number; x: number; y: number }
export interface SmallMultipleSeriesGeometry {
  key: string;
  color: string;
  strokeWidth: number;
  dash?: string;
  /** polyline 的 points 字串：只連相鄰的有值點，null 斷線；每段至少 2 點。 */
  lines: string[];
  /** 前後都斷線的單一點（畫小實心點，不然那一週的值看不到）。 */
  isolated: Point[];
  /** 每個有值的點（熱區）。 */
  points: (Point & { key: string | null })[];
  /** 最後一個有值的點；整條沒有值時為 null。 */
  last: Point | null;
  lastDot: boolean;
  lastLabel: { x: number; y: number; text: string } | null;
  /** V4-6 dots：要畫小實心點的點（不含 lastDot 的最後一點）；沒給 dots 時是空陣列。 */
  dots: (Point & { key: string | null })[];
  /** V4-6：系列有給 dots（最後一點的 3px 圓點也帶 data-index、data-key，與小點一致）。 */
  dotted: boolean;
}
export interface SmallMultipleGeometry {
  width: number;
  height: number;
  /** 點的熱區半徑：r 8，位置比 16px 窄時縮成位置寬的一半（768 一列 5 張時相鄰的熱區才不重疊）。 */
  hitRadius: number;
  plot: { left: number; right: number; top: number; bottom: number };
  titleY: number;
  /** 水平格線與 Y 標（每個刻度一條）。 */
  grid: { value: number; y: number; label: string }[];
  /** X 標（位置序；位置太窄時只留頭尾）。 */
  xTicks: { index: number; x: number; label: string }[];
  series: SmallMultipleSeriesGeometry[];
  /** V4-6：放得下的間隙標（文字置中於該位置、繪圖區垂直中間）；沒給 gaps 時是空陣列。 */
  gaps: { index: number; x: number; y: number; label: string }[];
}
/** smallMultipleGeometry 的選項。gaps、fitXLabels 是 V4-6 新增（不給時與 V4-5 相同）。 */
export interface SmallMultipleGeometryOptions {
  width?: number;
  height?: number;
  gaps?: readonly SmallMultipleGap[];
  fitXLabels?: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * C26 一張子圖的幾何（純函式，tests/charts-diagnosis-g12.test.tsx）。X：n 個位置平均分在繪圖區，第 i 個在 (i＋0.5) / n；
 * Y：axis.domain 對應繪圖區的下緣到上緣；座標取到 0.1。左邊留白依最寬的 Y 標估算。
 */
export function smallMultipleGeometry(panel: SmallMultiplePanel, xLabels: readonly string[], options: SmallMultipleGeometryOptions = {}): SmallMultipleGeometry {
  const width = Math.max(1, Math.round(options.width ?? MULTIPLE_SSR_WIDTH));
  const height = options.height ?? chartHeights.sm;
  const left = LABEL_PAD + TICK_GAP + Math.max(0, ...panel.axis.labels.map(labelWidth));
  const plot = { left, right: Math.max(left + 1, width - RIGHT_PAD), top: PLOT_TOP, bottom: height - X_AXIS_SPACE };
  const count = Math.max(1, xLabels.length);
  const slot = (plot.right - plot.left) / count;
  const x = (index: number) => round1(plot.left + (index + 0.5) * slot);
  const [lo, hi] = panel.axis.domain;
  const range = hi - lo || 1;
  const y = (value: number) => round1(plot.top + ((hi - value) / range) * (plot.bottom - plot.top));
  const grid = panel.axis.ticks.map((tick, index) => ({ value: tick, y: y(tick), label: panel.axis.labels[index] ?? "" }));
  const everyLabel = slot >= X_LABEL_MIN_SLOT;
  const xTicks = options.fitXLabels ? fittedXTicks(xLabels, x, width)
    : xLabels.map((label, index) => ({ index, x: x(index), label })).filter(tick => everyLabel || tick.index === 0 || tick.index === count - 1);
  // V4-6 gaps：文字要放進相鄰兩點之間（兩點相距 2 個位置寬），放不下就不畫。
  const gaps = (options.gaps ?? []).filter(gap => Number.isInteger(gap.index) && gap.index >= 0 && gap.index < count && labelWidth(gap.label) <= 2 * slot - GAP_PAD)
    .map(gap => ({ index: gap.index, x: x(gap.index), y: round1((plot.top + plot.bottom) / 2 + GAP_BASELINE), label: gap.label }));
  const series = panel.series.map((line): SmallMultipleSeriesGeometry => {
    const points: (Point & { key: string | null })[] = [];
    const segments: Point[][] = [];
    let run: Point[] = [];
    line.values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) { if (run.length) segments.push(run); run = []; return; }
      const point = { index, x: x(index), y: y(value) };
      points.push({ ...point, key: line.keys?.[index] ?? null });
      run.push(point);
    });
    if (run.length) segments.push(run);
    const last = points.at(-1) ?? null;
    const lastPoint = last === null ? null : { index: last.index, x: last.x, y: last.y };
    const labelY = lastPoint === null ? 0 : lastPoint.y - LAST_LABEL_DY >= plot.top ? lastPoint.y - LAST_LABEL_DY : lastPoint.y + LAST_LABEL_BELOW;
    return {
      key: line.key, color: line.color, strokeWidth: line.strokeWidth, dash: line.dash,
      lines: segments.filter(segment => segment.length >= 2).map(segment => segment.map(point => `${point.x},${point.y}`).join(" ")),
      // V4-6：畫了小實心點（dots）就不另畫單一點（小點已經涵蓋它）。
      isolated: line.dots ? [] : segments.filter(segment => segment.length === 1).map(segment => segment[0]),
      points, last: lastPoint, lastDot: line.lastDot === true,
      // 線尾標值放不進繪圖區（768 一列 5 張時每張只有約 80px，會蓋到 Y 標）時不畫；數字仍在資料表。
      lastLabel: lastPoint === null || line.lastLabel === undefined || lastPoint.x - LAST_LABEL_DX - labelWidth(line.lastLabel) < plot.left ? null : { x: round1(lastPoint.x - LAST_LABEL_DX), y: round1(labelY), text: line.lastLabel },
      dots: line.dots ? points.filter(point => !(line.lastDot && lastPoint !== null && point.index === lastPoint.index)) : [],
      dotted: line.dots === true,
    };
  });
  return { width, height, hitRadius: round1(Math.min(HIT_R, slot / 2)), plot, titleY: TITLE_BASELINE, grid, xTicks, series, gaps };
}

/**
 * V4-6 fitXLabels：空字串的位置（斷段的間隙）不畫標；相鄰兩個標的距離都 ≥ 最寬的標＋8 時每個都畫，否則只畫頭尾，頭尾也放不下時只畫最後一個。
 * 每個標的中心收在 svg 內（半個標寬＋2 到 svg 寬−半個標寬−2），頭一個標不會被 svg 左緣切掉。
 */
function fittedXTicks(xLabels: readonly string[], x: (index: number) => number, width: number): { index: number; x: number; label: string }[] {
  const ticks = xLabels.map((label, index) => ({ index, label, half: labelWidth(label) / 2 })).filter(tick => tick.label !== "")
    .map(tick => ({ index: tick.index, label: tick.label, x: round1(Math.min(Math.max(x(tick.index), tick.half + LABEL_PAD), width - tick.half - LABEL_PAD)) }));
  if (ticks.length <= 1) return ticks;
  const need = Math.max(...ticks.map(tick => labelWidth(tick.label))) + X_LABEL_GAP;
  if (ticks.every((tick, index) => index === 0 || tick.x - ticks[index - 1].x >= need)) return ticks;
  const first = ticks[0], last = ticks[ticks.length - 1];
  return last.x - first.x >= need ? [first, last] : [last];
}

/** 1／2／5 × 10ⁿ 的整齊步長裡，金額軸的最小步長（1 元）與萬位步長（formatAxisWan 在最大刻度 ≥ 1 萬時用萬）。 */
const AMOUNT_MIN_STEP = 1;
const WAN = 10_000;
/** 金額軸目標約 4 格。 */
const AMOUNT_INTERVALS = 4;

/**
 * V4-6 金額軸（G19；PRD §7.2「Y 整數萬含 0」；值是元，只是座標）：範圍一定含 0；步長是 1、2、5 × 10ⁿ（至少 1 元：formatAxisWan 在 1 萬以下取到元）；
 * 上下界取步長的整數倍，所以最高與最低的點一定落在刻度內；最大刻度的絕對值 ≥ 1 萬時步長至少 1 萬（1、2、5 × 10ⁿ 且 ≥ 1 萬，一定是整萬，
 * 刻度文字是整數萬「50 萬」，不出現「2.5 萬」）。刻度文字由呼叫端經 presentation.ts 的 formatAxisWan(ticks, step) 產生。沒有任何值時回傳 0 到 1 元與單一刻度 0。
 */
export function amountAxis(values: readonly (number | null)[]): { domain: [number, number]; ticks: number[]; step: number } {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  if (max - min <= 0) return { domain: [0, 1], ticks: [0], step: 1 };
  const bounds = (step: number): [number, number] => [Math.floor(min / step), Math.ceil(max / step)];
  let step = Math.max(AMOUNT_MIN_STEP, niceStep((max - min) / AMOUNT_INTERVALS));
  let [lo, hi] = bounds(step);
  if (Math.max(Math.abs(lo), Math.abs(hi)) * step >= WAN && step < WAN) { step = WAN; [lo, hi] = bounds(step); }
  const ticks: number[] = [];
  for (let k = lo; k <= hi; k++) ticks.push(Number((k * step).toPrecision(12)) || 0);
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step };
}

/**
 * ≤ 767px 單欄時框高＝chartHeights.sm × 子圖數：放在 ChartFrame 的祖先（例如 G12 的 <details>）上，ChartFrame 的固定高容器（.chart-frame.multiples）
 * 繼承這個 CSS 變數（globals.css「V4-3b B」）。≥ 768px 不用它（框高維持 sm）。
 */
export function multiplesFrameStyle(count: number): CSSProperties {
  return { ["--multiples-h" as string]: `${chartHeights.sm * count}px` } as CSSProperties;
}

export interface SmallMultiplesProps {
  panels: readonly SmallMultiplePanel[];
  /** 共用的位置標（例如「1」「2」…＝第幾週）。 */
  xLabels: readonly string[];
  /** 點擊某張子圖某條線的第 index 個位置（事件代理：每張 svg 一個 onClick，讀熱區的 data-series、data-index）。 */
  onPoint?: (panelKey: string, seriesKey: string, index: number) => void;
  /** 每張子圖的寬（px）；不給時以 ResizeObserver 量第一張子圖，SSR 先用 MULTIPLE_SSR_WIDTH。 */
  width?: number;
  /** V4-6：斷段的間隙標（所有子圖共用位置，每張子圖都標；放不下時不畫）。 */
  gaps?: readonly SmallMultipleGap[];
  /** V4-6：X 標依最寬的標取捨並收在 svg 內（標比週序寬時用，例如 G19 的資料本期）。 */
  fitXLabels?: boolean;
}

/** 點擊事件代理：從事件目標往上找 circle.chart-point-hit，取出它的系列與位置。 */
function hitOf(event: MouseEvent<SVGSVGElement>): { series: string; index: number } | null {
  const target = event.target instanceof Element ? event.target.closest("circle.chart-point-hit") : null;
  const series = target?.getAttribute("data-series");
  const index = Number(target?.getAttribute("data-index"));
  return series && Number.isInteger(index) ? { series, index } : null;
}

/** C26：放在 ChartFrame（frameClassName="multiples"，固定高、aria-hidden）內。每張 svg.chart-multiple aria-hidden、focusable=false。 */
export function SmallMultiples({ panels, xLabels, onPoint, width, gaps, fitXLabels }: SmallMultiplesProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const first = gridRef.current?.firstElementChild;
    if (!first || typeof ResizeObserver === "undefined") return;
    // 收合的 <details> 內寬是 0：不更新，展開後才量到實際寬（收合時不重畫）。
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setMeasured(current => current === next ? current : next);
    });
    observer.observe(first);
    return () => observer.disconnect();
  }, []);
  const drawWidth = Math.round(width ?? measured ?? MULTIPLE_SSR_WIDTH);
  const geometries = useMemo(() => panels.map(panel => smallMultipleGeometry(panel, xLabels, { width: drawWidth, gaps, fitXLabels })), [panels, xLabels, drawWidth, gaps, fitXLabels]);
  return <div ref={gridRef} className="multiples-grid" data-count={panels.length}>
    {panels.map((panel, panelIndex) => {
      const geometry = geometries[panelIndex];
      const onClick = onPoint ? (event: MouseEvent<SVGSVGElement>) => { const hit = hitOf(event); if (hit) onPoint(panel.key, hit.series, hit.index); } : undefined;
      return <div key={panel.key} className="multiple" data-panel={panel.key}>
        <svg className="chart-multiple" viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%" height={chartHeights.sm} aria-hidden="true" focusable="false" fontSize={chartFontSize} preserveAspectRatio="xMinYMin meet" onClick={onClick}>
          <text className="multiple-title" x={0} y={geometry.titleY}>{panel.title}</text>
          <g className="multiple-grid">{geometry.grid.map(line => <line key={line.value} x1={geometry.plot.left} x2={geometry.plot.right} y1={line.y} y2={line.y} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}</g>
          <g className="multiple-axis" fill={chartColors.axis}>
            {geometry.grid.map(line => <text key={line.value} x={geometry.plot.left - TICK_GAP} y={line.y + 4} textAnchor="end">{line.label}</text>)}
            {geometry.xTicks.map(tick => <text key={tick.index} x={tick.x} y={geometry.plot.bottom + 16} textAnchor="middle">{tick.label}</text>)}
          </g>
          {geometry.gaps.length > 0 && <g className="multiple-gaps" fill={chartColors.axis}>{geometry.gaps.map(gap => <text key={gap.index} className="multiple-gap" data-index={gap.index} x={gap.x} y={gap.y} textAnchor="middle">{gap.label}</text>)}</g>}
          {geometry.series.map(line => <g key={line.key} className="multiple-series" data-series={line.key}>
            {line.lines.map(points => <polyline key={points} points={points} fill="none" stroke={line.color} strokeWidth={line.strokeWidth} strokeDasharray={line.dash} strokeLinejoin="round" strokeLinecap="round" />)}
            {line.isolated.map(point => <circle key={point.index} cx={point.x} cy={point.y} r={ISOLATED_R} fill={line.color} />)}
            {line.dots.map(point => <circle key={point.index} className="multiple-point" data-index={point.index} data-key={point.key ?? undefined} cx={point.x} cy={point.y} r={POINT_R} fill={line.color} />)}
            {line.lastDot && line.last !== null && <circle className="multiple-last" data-index={line.dotted ? line.last.index : undefined} data-key={line.dotted ? line.points.at(-1)?.key ?? undefined : undefined} cx={line.last.x} cy={line.last.y} r={LAST_R} fill={line.color} />}
            {line.lastLabel !== null && <text className="chart-value is-strong" x={line.lastLabel.x} y={line.lastLabel.y} textAnchor="end">{line.lastLabel.text}</text>}
          </g>)}
          {onPoint && <g className="multiple-hits">{geometry.series.flatMap(line => line.points.map(point => <circle key={`${line.key}-${point.index}`} className="chart-point-hit" data-series={line.key} data-index={point.index} data-key={point.key ?? undefined} cx={point.x} cy={point.y} r={geometry.hitRadius} fill="transparent" />))}</g>}
        </svg>
      </div>;
    })}
  </div>;
}
