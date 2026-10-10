"use client";

import Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { chartColors, chartFontSize, chartHeights, chartRowHeights } from "@/application/chart-theme";
import { MINUS } from "@/application/presentation";

// V4-4 代理 B：C25 RankedBars 水平長條（PRD §6.3 C25、§4.4 G13／G14、§4.6、§7.1、§7.2；CHART_CATALOG G13、G14、§9.1；D-V4-38＝A、D-V4-39＝A）。
// 純 inline SVG（不用 Recharts），SSR 會輸出每根柱與 testid。三種模式：
//   variance：每一段（block）依值的正負決定方向——全部 ≤ 0 從 0 往左（零線在右緣）、全部 ≥ 0 從 0 往右（零線在標籤欄右緣）、正負都有時零線在中間、雙向；
//   ranked：單向排序（呼叫端給同號的值），幾何同 variance；
//   pareto：排序長條（G14 商品毛利為負，從 0 往左）＋右側「累計 {pct}」標值欄（每列的文字由呼叫端組好傳入）＋最後一列「另 {n} 個」文字（不畫「其他」柱，X38）。
// G13（D-V4-38＝A）：減少、增加兩段在各寬度都上下排列（減少在上），共用一把尺（PRD §7.2：同一指標同尺度）、各自從 0；段名不畫在 svg 內（用 ChartFrame legend），
// 兩段各有自己的零線（減少段在右緣、增加段在標籤欄右緣），以此區分兩段；預設不畫段間分隔線（與 H5 設計稿建議版相同，D-V4-38 以建議版為準），separator 時才在段界畫 1px chartColors.grid。
// 版面（H5 設計稿 verification/revamp-v4/mockups/gen/charts-c2.ts 的 rankedBarsSvg）：標籤（SKU · 通路）靠左 x＝0；標籤欄寬＝最長標籤估寬＋8；
// 標值（L1 帶號，呼叫端用 presentation.ts 格式化）緊貼柱端（間隔 4），另保留一欄標值寬，所以標值不會壓到標籤欄；標籤太長時截斷加「…」，繪圖區至少保留 RANKED_MIN_PLOT。
// pareto 的累計欄是獨立的 svg.chart-ranked-extra（不在主圖的寬度內）：D-V4-39＝A 在 ≤ 767px 以 CSS 隱藏（hideExtraOnNarrow），主圖的量寬容器隨之變寬、柱變長（390 約 107px），
// markup 與 SSR 不變、沒有依視窗寬度的 JS 分支。
// 根 svg aria-hidden、focusable=false，圖內沒有 tabIndex、<a>、<button>（CL-7）；柱與整列的透明熱區只接指標點擊（onBarClick(row.evidence)），鍵盤經由資料表同一個 builder 的 number-link。
// 點擊的分析事件（chart_clicked）由呼叫端記，與 G4、G6、G10 相同。
// 色只經 chart-theme.ts 的 chartColors（沒有色碼與 var() 字串常值，CL-3）；列高只用 chartRowHeights（CL-10）；字級只用 chartFontSize（CL-5）。
// 長度比例以 Decimal 用 domain 的精確字串計算（|值| × 每單位像素），座標取到 0.1；顯示文字一律用呼叫端傳入的 display，不在這裡格式化金額。
// V4-5 代理 B（G15 方案差額；PRD §4.4 G15「（根數＋軸 1 列）× 24 ≤ sm 180；零線＝現況」）：加選用的軸列 axis——給了文字時，柱列之後多 1 列，
// 零線往下延伸一小段刻度，文字（例如「現況 270 元」，呼叫端從 labels 組好）置中對齊零線、不超出左右邊界。沒給 axis 時幾何與 markup 和 V4-4 逐字相同
// （tests/charts-scenarios-v4.test.tsx 以 tests/fixtures/ranked-bars-v4-4.json 比對商品頁 G13、G14 與各模式的輸出）。

/** C25 的三種模式（PRD §6.3）。 */
export type RankedBarsMode = "variance" | "ranked" | "pareto";
/** 柱色的語意：由呼叫端依 deltaTone／favorableDirectionOf 判斷後傳入（依有利方向，不依數學正負號；D-V3-7 有利不用綠）。 */
export type RankedBarTone = "unfavorable" | "favorable" | "total";
/** 列高：chartRowHeights 的 row16（G13、G14）或 row24（G15）。 */
export type RankedBarRowHeight = "row16" | "row24";
/** 一段的方向：left＝從 0 往左、right＝從 0 往右、both＝雙向（零線在中間）。由值的正負自動決定，不接受覆寫（避免把正值畫成往左）。 */
export type HbarDirection = "left" | "right" | "both";
/** 值：domain 或 B 級函式回傳的精確字串（例如 "-30198.96"），或數值；不接受顯示用的格式化字串（千分位、U+2212）。 */
export type RankedBarAmount = string | number | null | undefined;

/** 一列（一根柱）。evidence 原樣傳回 onBarClick（與資料表 number-link 同一個 builder 的結果）。 */
export interface RankedBarRow<E = unknown> {
  /** 語意 key（testid 尾段，例如 {channel}-{sku}）；同一張圖內唯一，不用陣列索引（CL-2）。 */
  key: string;
  /** 左側標籤（例如「SKU-020 · 平台 · MARKETPLACE」）；太長時截斷，完整文字在資料表。 */
  label: string;
  /** 長度用的精確值；null、無法解析時柱寬 0（呼叫端應先排除差額 null 的列，CHART_CATALOG G13）。 */
  value: RankedBarAmount;
  tone: RankedBarTone;
  /** 柱端標值（L1，呼叫端格式化，例如 formatSignedDelta(delta, "L1")）。 */
  display: string;
  evidence: E;
  /** 柱的 data-testid；不給時用 RankedBars 的 testIdPrefix＋key。 */
  testId?: string;
  /** pareto：右側累計欄的文字（例如「累計 38.0%」），由呼叫端從 labels 組好；其他模式忽略。 */
  extra?: string;
}
/** 一段（G13 的減少、增加）。段名不畫在 svg 內（用 ChartFrame legend）。more＝段末的「另 {n} 個」文字列（多佔一列）。 */
export interface RankedBarBlock<E = unknown> {
  key: string;
  rows: readonly RankedBarRow<E>[];
  more?: string;
}
export interface HbarOptions {
  /** 列高（預設 row16）。 */
  rowHeight?: RankedBarRowHeight;
  /** 只有一段（傳入的是列）時，段末的「另 {n} 個」文字列。 */
  more?: string;
  /** 繪圖區的最小寬（px，預設 RANKED_MIN_PLOT）：標籤欄超過「寬 − 標值欄 − 本值」時截斷標籤。 */
  minPlot?: number;
  /** V4-5：軸列的文字（G15「現況 {amount}」）；給了時柱列之後多 1 列，標在最後一段的零線下方。沒給或空字串時不畫軸列（V4-4 的輸出不變）。 */
  axis?: string;
}

export interface HbarRect { x: number; y: number; width: number; height: number }
export interface HbarBarShape<E = unknown> {
  row: RankedBarRow<E>;
  /** React key：{段 key}-{列 key}。 */
  key: string;
  /** 列頂 y 與文字基線。 */
  top: number;
  textY: number;
  /** 標籤文字（可能已截斷）與是否截斷。 */
  label: string;
  truncated: boolean;
  /** 柱（寬 0：值為 0、null 或無法解析）。 */
  bar: HbarRect;
  /** 柱從零線往哪一側長。 */
  side: "left" | "right";
  /** 柱端標值：往左的柱標在柱的左端外側（text-anchor end），往右的標在右端外側（start）。 */
  value: { x: number; anchor: "start" | "end" };
}
export interface HbarBlockShape<E = unknown> {
  key: string;
  direction: HbarDirection;
  /** 段頂 y。 */
  top: number;
  /** 零線 x。 */
  zeroX: number;
  /** 零線（只畫在本段的柱列，不含「另 n 個」列）；沒有柱時為 null。 */
  zeroLine: { y1: number; y2: number } | null;
  bars: HbarBarShape<E>[];
  /** 段末「另 {n} 個」文字列的基線與文字。 */
  more: { y: number; text: string } | null;
}
/** V4-5 軸列（G15 的零線＝現況）：零線延伸的刻度與置中的文字。 */
export interface HbarAxis {
  /** 零線 x（最後一段有柱的段）。 */
  zeroX: number;
  /**
   * 刻度：從該段柱列底（零線下端）往下到軸列頂＋RANKED_AXIS_TICK。沒有「另 n 個」列時就是柱列底到柱列底＋RANKED_AXIS_TICK；
   * V4-5 代理 C（審查 B-R2）：該段有「另 n 個」列時穿過那一列接到軸列（原本從所有列的底起算，刻度會浮在零線下端 1 列之外）。
   */
  tick: { y1: number; y2: number };
  /** 文字：置中於零線，夾在 [半寬, 寬 − 半寬] 內（不超出左右邊界）；y 是基線。 */
  label: { x: number; y: number; text: string };
}
export interface HbarGeometry<E = unknown> {
  mode: RankedBarsMode;
  /** 主圖座標系寬（不含 pareto 的累計欄）與高（＝列數 × 列高）。 */
  width: number;
  height: number;
  rowHeight: number;
  /** 列數（柱列＋「另 n 個」列）。 */
  rowCount: number;
  labelWidth: number;
  valueWidth: number;
  /** 單向段的繪圖區寬（雙向段另扣一欄標值寬）。 */
  plotWidth: number;
  /** 每單位（元）的像素（精確字串）；沒有可畫的非零值時為 null。只用於長度。 */
  scale: string | null;
  blocks: HbarBlockShape<E>[];
  /** 段與段之間分隔線的 y（第二段起每段的段頂）。 */
  separators: number[];
  /** pareto 的右側累計欄（獨立 svg）；沒有累計文字或不是 pareto 時為 null。 */
  extra: { width: number; rows: { key: string; y: number; text: string }[] } | null;
  /** V4-5：軸列（只在 options.axis 有文字、且至少有一根柱時才有這個鍵；V4-4 的呼叫端沒有）。 */
  axis?: HbarAxis;
}

/** SSR（還沒量到寬）時主圖的座標系寬（PRD §6.3 C25）。 */
export const RANKED_SSR_WIDTH = 560;
/** 文字與欄邊的間距（標籤欄另加 2）。 */
export const RANKED_TEXT_PAD = 6;
const LABEL_TRAIL = 2;
/** 柱端到標值的間隔。 */
export const RANKED_VALUE_GAP = 4;
/** 累計欄的左側額外間隔。 */
const EXTRA_GAP = 4;
/** V4-5 軸列：零線往下延伸的刻度長（px）。 */
export const RANKED_AXIS_TICK = 4;
/** 繪圖區最小寬：標籤再長也至少留這麼寬給柱（≈ C24 在 390 的條寬）。 */
export const RANKED_MIN_PLOT = 64;
/** 標籤欄最小寬（截斷後至少能放「SKU-…」）。 */
export const RANKED_MIN_LABEL = 48;
/** 柱高：row16 為 10（上下各 3）、row24 為 14（上下各 5，同 C27）。 */
export const RANKED_BAR_HEIGHT = { row16: 10, row24: 14 } as const;
/** 文字基線在列中線下 4px（row16 為 12、row24 為 16，同設計稿與 C27）。 */
const TEXT_DROP = 4;
/** 非零值的最短柱（px）：比例很小時仍看得到。0 的柱寬 0（設計稿）。 */
const MIN_BAR = 1;
/** 截斷記號（U+2026）與保守估寬。 */
const ELLIPSIS = "…";
const ELLIPSIS_WIDTH = 12;

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const round1 = (value: number) => Math.round(value * 10) / 10;
const toTenth = (value: Decimal) => value.toDecimalPlaces(1, Decimal.ROUND_HALF_UP);

/** 精確字串或數值轉成 Decimal；null、undefined、空字串、NaN、Infinity 或無法解析時回傳 null。 */
function exactOf(value: RankedBarAmount): Decimal | null {
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
const isNegative = (value: Decimal | null): value is Decimal => value !== null && !value.isZero() && value.isNegative();
const isPositive = (value: Decimal | null): value is Decimal => value !== null && value.gt(0);

/**
 * 12px 字的估寬（px；排版用，只決定標籤欄、標值欄、累計欄的寬）：與 H5 設計稿的 textWidth12 相同（比 waterfallTextWidth 保守）——
 * 中日韓字 12、英文大寫 8、小寫與數字 6.7、正負號與 % 7、空白與其他標點 3.5。設計稿以瀏覽器實測核對過（mockups measure.json 的 g13、g14）。
 */
export function rankedTextWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    if (char === ELLIPSIS) return sum + ELLIPSIS_WIDTH;
    if (code >= 0x2e80) return sum + 12;
    if (char >= "A" && char <= "Z") return sum + 8;
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) return sum + 6.7;
    if (char === "+" || char === MINUS || char === "%" || char === "-") return sum + 7;
    return sum + 3.5;
  }, 0);
}

/** 標籤截斷：估寬超過 room 時從尾端去字並加「…」（完整文字在資料表）。 */
export function truncateRankedLabel(text: string, room: number): { text: string; truncated: boolean } {
  if (rankedTextWidth(text) <= room) return { text, truncated: false };
  const chars = Array.from(text);
  const budget = room - ELLIPSIS_WIDTH;
  let used = 0, cut = 0;
  for (; cut < chars.length; cut++) {
    const width = rankedTextWidth(chars[cut]);
    if (used + width > budget) break;
    used += width;
  }
  return { text: `${chars.slice(0, cut).join("").trimEnd()}${ELLIPSIS}`, truncated: true };
}

/** 某個固定高的框（chartHeights）放得下幾列柱：floor(框高 ÷ 列高) − 保留列（「另 n 個」或軸列）。G14 sm／row16／1 → 10；G15 sm／row24／1 → 6。 */
export function hbarMaxRows(frame: keyof typeof chartHeights, rowHeight: RankedBarRowHeight = "row16", reservedRows = 0): number {
  return Math.max(0, Math.floor(chartHeights[frame] / chartRowHeights[rowHeight]) - reservedRows);
}

const isBlockList = <E,>(input: readonly RankedBarRow<E>[] | readonly RankedBarBlock<E>[]): input is readonly RankedBarBlock<E>[] =>
  input.length > 0 && "rows" in input[0];

/** 柱色（tone → chart-theme 的 var() 字串）：不利 unfavorable、有利 favorable（灰）、total（非本期或中性）。 */
export function rankedBarFill(tone: RankedBarTone): string {
  return tone === "unfavorable" ? chartColors.unfavorable : tone === "favorable" ? chartColors.favorable : chartColors.total;
}

/**
 * C25 幾何（純函式，tests/chart-geometry-v4.test.ts）。input 是列（單段）或段（G13 減少、增加）；width 是主圖寬（pareto 的累計欄另算，不含在內）。
 * 1. 標值欄寬＝最長 display 估寬＋6；標籤欄寬＝最長 label 估寬＋8，但不超過「寬 − 標值欄（雙向段兩欄）− minPlot」（超過時截斷）。
 * 2. 繪圖區寬：單向段＝寬 − 標籤欄 − 標值欄；雙向段再扣一欄標值寬。
 * 3. 共用一把尺：每單位像素＝各段「繪圖區寬 ÷ 需要的跨度」的最小值（單向段跨度＝|值| 最大值；雙向段＝負的最大 |值|＋正的最大值）。
 *    所以 |值| 最大的那根柱用滿繪圖區，其他段同一把尺（G13：減少與增加最長的那根是 plotWidth）。
 * 4. 零線：往右的段在標籤欄右緣；往左的段在右緣（標籤欄＋標值欄＋繪圖區）；雙向段在標籤欄＋標值欄＋負的跨度。
 * 5. 柱長＝|值| × 每單位像素（Decimal，取到 0.1），非零至少 1px；標值在柱端外側 4px。
 * 高＝（柱列＋「另 n 個」列）× 列高（chartRowHeights）。空段（沒有列也沒有 more）不輸出。
 * 6. V4-5：options.axis 有文字且有柱時，最後加 1 列軸列（高再加 1 列）：刻度在最後一段有柱的段的零線，文字置中於零線、夾在左右邊界內。
 */
export function hbarGeometry<E = unknown>(input: readonly RankedBarRow<E>[] | readonly RankedBarBlock<E>[], width: number, mode: RankedBarsMode, options: HbarOptions = {}): HbarGeometry<E> {
  const drawWidth = Math.max(1, Math.round(width));
  const rowHeightKey = options.rowHeight ?? "row16";
  const rowHeight = chartRowHeights[rowHeightKey];
  const barHeight = RANKED_BAR_HEIGHT[rowHeightKey];
  const inset = (rowHeight - barHeight) / 2;
  const baseline = rowHeight / 2 + TEXT_DROP;
  const minPlot = options.minPlot ?? RANKED_MIN_PLOT;
  const source: readonly RankedBarBlock<E>[] = isBlockList(input) ? input : [{ key: "rows", rows: input as readonly RankedBarRow<E>[], more: options.more }];
  const blocks = source.filter(block => block.rows.length > 0 || (block.more !== undefined && block.more !== ""));
  const parsed = blocks.map(block => {
    const values = block.rows.map(row => exactOf(row.value));
    const negative = values.some(isNegative), positive = values.some(isPositive);
    const direction: HbarDirection = negative && positive ? "both" : negative ? "left" : "right";
    const negMax = values.reduce<Decimal>((top, value) => isNegative(value) && value.abs().gt(top) ? value.abs() : top, new Exact(0));
    const posMax = values.reduce<Decimal>((top, value) => isPositive(value) && value.gt(top) ? value : top, new Exact(0));
    return { block, values, direction, negMax, posMax };
  });
  const allRows = blocks.flatMap(block => block.rows);
  const valueWidth = allRows.length ? Math.ceil(Math.max(...allRows.map(row => rankedTextWidth(row.display)))) + RANKED_TEXT_PAD : 0;
  const reserveOf = (direction: HbarDirection) => direction === "both" ? valueWidth * 2 : valueWidth;
  const maxReserve = Math.max(0, ...parsed.filter(item => item.block.rows.length > 0).map(item => reserveOf(item.direction)));
  const naturalLabel = allRows.length ? Math.ceil(Math.max(...allRows.map(row => rankedTextWidth(row.label)))) + RANKED_TEXT_PAD + LABEL_TRAIL : 0;
  const labelWidth = Math.min(naturalLabel, Math.max(RANKED_MIN_LABEL, drawWidth - maxReserve - minPlot));
  const labelRoom = labelWidth - RANKED_TEXT_PAD - LABEL_TRAIL;
  const plotOf = (direction: HbarDirection) => Math.max(0, drawWidth - labelWidth - reserveOf(direction));
  // 共用一把尺：每單位像素取各段的最小值（Decimal）。
  let scale: Decimal | null = null;
  for (const item of parsed) {
    const span = item.direction === "both" ? item.negMax.plus(item.posMax) : item.direction === "left" ? item.negMax : item.posMax;
    const plot = plotOf(item.direction);
    if (span.isZero() || plot <= 0) continue;
    const candidate = new Exact(plot).div(span);
    if (scale === null || candidate.lt(scale)) scale = candidate;
  }
  const lengthOf = (value: Decimal | null): number => {
    if (value === null || value.isZero() || scale === null) return 0;
    return Exact.max(toTenth(value.abs().times(scale)), MIN_BAR).toNumber();
  };

  let offset = 0;
  const separators: number[] = [];
  const shapes = parsed.map((item, index): HbarBlockShape<E> => {
    const { block, values, direction } = item;
    const top = offset;
    if (index > 0) separators.push(top);
    const plot = plotOf(direction);
    const zeroX = direction === "right" ? labelWidth
      : direction === "left" ? labelWidth + valueWidth + plot
        : round1(labelWidth + valueWidth + (scale === null ? 0 : toTenth(item.negMax.times(scale)).toNumber()));
    const bars = block.rows.map((row, rowIndex): HbarBarShape<E> => {
      const value = values[rowIndex];
      const rowTop = top + rowIndex * rowHeight;
      const length = lengthOf(value);
      const side: "left" | "right" = direction === "left" || (direction === "both" && isNegative(value)) ? "left" : "right";
      const x = side === "left" ? round1(zeroX - length) : zeroX;
      const label = truncateRankedLabel(row.label, labelRoom);
      return {
        row, key: `${block.key}-${row.key}`, top: rowTop, textY: rowTop + baseline,
        label: label.text, truncated: label.truncated,
        bar: { x, y: rowTop + inset, width: length, height: barHeight },
        side,
        value: side === "left" ? { x: round1(x - RANKED_VALUE_GAP), anchor: "end" } : { x: round1(zeroX + length + RANKED_VALUE_GAP), anchor: "start" },
      };
    });
    const barRows = block.rows.length;
    const hasMore = block.more !== undefined && block.more !== "";
    offset += (barRows + (hasMore ? 1 : 0)) * rowHeight;
    return {
      key: block.key, direction, top, zeroX,
      zeroLine: barRows > 0 ? { y1: top, y2: top + barRows * rowHeight } : null,
      bars,
      more: hasMore ? { y: top + barRows * rowHeight + baseline, text: block.more! } : null,
    };
  });
  const barRowCount = shapes.reduce((sum, block) => sum + block.bars.length + (block.more ? 1 : 0), 0);
  const axisBlock = options.axis ? [...shapes].reverse().find(block => block.bars.length > 0) : undefined;
  const axis = axisBlock && options.axis ? axisOf(options.axis, axisBlock.zeroX, axisBlock.zeroLine?.y2 ?? offset, offset, baseline, drawWidth) : undefined;
  const rowCount = barRowCount + (axis ? 1 : 0);
  const extraRows = mode === "pareto" ? shapes.flatMap(block => block.bars.filter(bar => bar.row.extra !== undefined && bar.row.extra !== "").map(bar => ({ key: bar.key, y: bar.textY, text: bar.row.extra! }))) : [];
  const extra = extraRows.length ? { width: Math.ceil(Math.max(...extraRows.map(item => rankedTextWidth(item.text)))) + RANKED_TEXT_PAD + EXTRA_GAP, rows: extraRows } : null;
  return {
    mode, width: drawWidth, height: rowCount * chartRowHeights[rowHeightKey], rowHeight, rowCount,
    labelWidth, valueWidth, plotWidth: plotOf("right"),
    scale: scale === null ? null : scale.toFixed(),
    blocks: shapes, separators, extra,
    ...(axis ? { axis } : {}),
  };
}

/**
 * V4-5 軸列的幾何：barsBottom＝該段柱列底（零線下端）、top＝軸列頂（所有列之後）；刻度從 barsBottom 到 top＋RANKED_AXIS_TICK（兩者相同時就是柱列底下 4px）。
 * 文字以估寬置中於零線，夾在 [半寬, 寬 − 半寬]（寬不夠時置中於圖寬）。
 */
function axisOf(text: string, zeroX: number, barsBottom: number, top: number, baseline: number, width: number): HbarAxis {
  const half = rankedTextWidth(text) / 2;
  const x = half * 2 >= width ? width / 2 : Math.min(Math.max(zeroX, half), width - half);
  return { zeroX, tick: { y1: barsBottom, y2: top + RANKED_AXIS_TICK }, label: { x: round1(x), y: top + baseline, text } };
}

export interface RankedBarsViewProps<E = unknown> {
  geometry: HbarGeometry<E>;
  /** 柱的 data-testid 前綴（例如 chart-products-variance-bar-）；柱的 testid＝前綴＋row.key（row.testId 優先）。 */
  testIdPrefix?: string;
  /** 點柱或該列的透明熱區：與資料表同列 number-link 呼叫同一個 builder（evidence 原樣傳回）；chart_clicked 由呼叫端記。 */
  onBarClick?: (evidence: E, row: RankedBarRow<E>) => void;
  /** D-V4-39＝A：pareto 的累計欄在 ≤ 767px 隱藏（CSS；svg 帶 is-narrow-hidden）。 */
  hideExtraOnNarrow?: boolean;
  /** 段與段之間的分隔線（預設不畫：H5 設計稿建議版沒有分隔線，兩段靠各自的零線區分）。 */
  separator?: boolean;
  /** 量寬容器（主圖）的 ref；RankedBars 用它接 ResizeObserver。 */
  measureRef?: Ref<HTMLDivElement>;
}

/**
 * C25 的畫面（沒有 hook，給定幾何就是純輸出；RankedBars 量寬後交給它）。結構：
 * div.ranked-bars > div.ranked-bars-main（量寬）> svg.chart-ranked-bars（aria-hidden）；pareto 有累計文字時另有 svg.chart-ranked-extra（aria-hidden）。
 * 每列：整列寬的透明熱區（在最底層，只有 onBarClick 時輸出）→ 標籤 → 柱（data-testid）→ 標值；每段一條零線；separator 時段間一條分隔線。
 * V4-5：幾何有 axis 時，最後輸出 g.ranked-axis（零線下的刻度＋置中的文字）；沒有時不輸出任何東西（V4-4 的 markup 不變）。
 */
export function RankedBarsView<E = unknown>({ geometry, testIdPrefix, onBarClick, hideExtraOnNarrow = false, separator = false, measureRef }: RankedBarsViewProps<E>) {
  const { width, height } = geometry;
  const testIdOf = (row: RankedBarRow<E>) => row.testId ?? (testIdPrefix ? `${testIdPrefix}${row.key}` : undefined);
  const clickOf = (row: RankedBarRow<E>) => onBarClick ? () => onBarClick(row.evidence, row) : undefined;
  const bars = geometry.blocks.flatMap(block => block.bars);
  return <div className={`ranked-bars${geometry.extra ? " has-extra" : ""}`} data-mode={geometry.mode}>
    <div ref={measureRef} className="ranked-bars-main">
      <svg className="chart-ranked-bars" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true" focusable="false" fontSize={chartFontSize} preserveAspectRatio="xMinYMin meet" data-rows={geometry.rowCount}>
        {onBarClick && <g className="ranked-hits">{bars.map(bar => <rect key={bar.key} className="ranked-hit" x={0} y={bar.top} width={width} height={geometry.rowHeight} fill="transparent" onClick={clickOf(bar.row)} />)}</g>}
        {separator && geometry.separators.map(y => <line key={y} className="ranked-separator" x1={0} x2={width} y1={y} y2={y} stroke={chartColors.grid} strokeWidth={1} shapeRendering="crispEdges" />)}
        {geometry.blocks.map(block => <g key={block.key} className="ranked-block" data-block={block.key} data-direction={block.direction}>
          {block.bars.map(bar => <g key={bar.key} className="ranked-row">
            <text className="ranked-label" x={0} y={bar.textY}>{bar.label}</text>
            <rect
              className={`ranked-bar is-${bar.row.tone}${onBarClick ? " is-clickable" : ""}`}
              data-testid={testIdOf(bar.row)}
              data-tone={bar.row.tone}
              x={bar.bar.x} y={bar.bar.y} width={bar.bar.width} height={bar.bar.height}
              fill={rankedBarFill(bar.row.tone)}
              onClick={clickOf(bar.row)}
            />
            <text className={`chart-value ranked-value${bar.row.tone === "unfavorable" ? " is-unfavorable" : ""}`} x={bar.value.x} y={bar.textY} textAnchor={bar.value.anchor}>{bar.row.display}</text>
          </g>)}
          {block.zeroLine && <line className="ranked-zero" x1={block.zeroX} x2={block.zeroX} y1={block.zeroLine.y1} y2={block.zeroLine.y2} stroke={chartColors.axis} strokeWidth={1} shapeRendering="crispEdges" />}
          {block.more && <text className="ranked-more" x={0} y={block.more.y}>{block.more.text}</text>}
        </g>)}
        {geometry.axis && <g className="ranked-axis">
          <line className="ranked-axis-tick" x1={geometry.axis.zeroX} x2={geometry.axis.zeroX} y1={geometry.axis.tick.y1} y2={geometry.axis.tick.y2} stroke={chartColors.axis} strokeWidth={1} shapeRendering="crispEdges" />
          <text className="ranked-axis-label" x={geometry.axis.label.x} y={geometry.axis.label.y} textAnchor="middle">{geometry.axis.label.text}</text>
        </g>}
      </svg>
    </div>
    {geometry.extra && <svg className={`chart-ranked-extra${hideExtraOnNarrow ? " is-narrow-hidden" : ""}`} viewBox={`0 0 ${geometry.extra.width} ${height}`} width={geometry.extra.width} height={height} aria-hidden="true" focusable="false" fontSize={chartFontSize}>
      {geometry.extra.rows.map(item => <text key={item.key} className="chart-value ranked-extra-text" x={geometry.extra!.width} y={item.y} textAnchor="end">{item.text}</text>)}
    </svg>}
  </div>;
}

export interface RankedBarsProps<E = unknown> {
  mode: RankedBarsMode;
  /** 單段的列（pareto、ranked、G15 variance）；與 blocks 擇一。 */
  rows?: readonly RankedBarRow<E>[];
  /** 多段（G13：減少在上、增加在下）；給了時忽略 rows 與 more。 */
  blocks?: readonly RankedBarBlock<E>[];
  /** 單段時段末的「另 {n} 個」文字列（G14，呼叫端從 labels 組好）。 */
  more?: string;
  rowHeight?: RankedBarRowHeight;
  testIdPrefix?: string;
  onBarClick?: (evidence: E, row: RankedBarRow<E>) => void;
  hideExtraOnNarrow?: boolean;
  separator?: boolean;
  /** 主圖寬（px）；不給時以 ResizeObserver 量測，SSR 先用 560。 */
  width?: number;
  /** V4-5（G15）：軸列文字（零線＝現況，例如「現況 270 元」，呼叫端從 labels 組好）；不給時沒有軸列。 */
  axis?: string;
}

/**
 * C25 RankedBars：放在 ChartFrame（固定高、aria-hidden）內。量寬（ResizeObserver）後算幾何，交給 RankedBarsView。
 * svg 高只由列數決定（不隨寬度變），量到寬之前以 560 的座標系等比縮放，不跳動。
 */
export function RankedBars<E = unknown>({ mode, rows, blocks, more, rowHeight, testIdPrefix, onBarClick, hideExtraOnNarrow, separator, width, axis }: RankedBarsProps<E>) {
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
  const drawWidth = Math.round(width ?? measured ?? RANKED_SSR_WIDTH);
  const geometry = useMemo(() => hbarGeometry<E>(blocks ?? rows ?? [], drawWidth, mode, { rowHeight, more, axis }), [blocks, rows, drawWidth, mode, rowHeight, more, axis]);
  return <RankedBarsView geometry={geometry} testIdPrefix={testIdPrefix} onBarClick={onBarClick} hideExtraOnNarrow={hideExtraOnNarrow} separator={separator} measureRef={main} />;
}
