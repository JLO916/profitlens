"use client";

import Decimal from "decimal.js";
import { chartColors, chartRowHeights } from "@/application/chart-theme";

// V4-1 代理 B：C24 BarCell 表格內嵌條（PRD §6.3 C24、§6.5、§7.1、§7.2；CHART_CATALOG §1.5、§9.1 與 G6 實作卡）。純 inline SVG，不加套件。
// 本批只做 variance 模式（G6 橋接表；V4-2 的 G4 差額條沿用）：以零線為中心，負值往左、正值往右；條長＝|值| ÷ 共同尺度（同一張表所有條的 |值| 最大值）。
// share、pair、count 與 tick 在後續批次加（V4-3a tick、V4-7b pair 與 share、V4-10 count），型別先列出。
// V4-3a 代理 C（G9 健檢清單，CHART_CATALOG G9、PRD §4.4、§6.3 C24）：variance 加兩個選填參數，沒給時輸出與 V4-2 逐字相同（G4、G6 不受影響）：
//   tick：門檻或目標刻度（chartColors.target 2×12），畫在條所在那一側的 |tick| 位置；tick 為 0 時與零線重疊、不另畫（H5 設計稿「門檻 0 元」狀態），
//         超出共同尺度（|tick| > 尺度）時不畫，避免把刻度夾在端點而看起來像門檻等於最大值；沒有條（值為 0 或缺值）時沒有「哪一側」，也不畫。
//   outline：空心條（2px 框線、不填色；G9 的 REV_UP_CM_DOWN 是扣廣告後貢獻的總差額，費用規則的差額是它的組成）；框線外緣與實心條同一個盒，仍用同一把尺。
// V4-7b 代理 A（CHART_CATALOG G22、G23、PRD §6.3 C24、§7.1）：加 share 與 pair 兩種模式；variance 的幾何與 markup 一個字都不改
// （tests/fixtures/bar-cell-variance-v4-7a.json 是開工錨點 3ea161b 上 G4、G6、G9 與直接渲染的輸出，tests/bar-cell.test.ts 逐字比對）。
//   share（G23 抽屜階梯表）：條長＝|值| ÷ 基準（例如淨營收；只用於長度），夾在 100%；基準 ≤ 0、缺值或無法解析時沒有條（比照 ratioMetric 分母 ≤ 0 回傳 null）。
//   pair（G22 前處理表）：同一格上下兩條，上 4px 參考值（含稅原值、上期）chartColors.previous、下 6px 主值（換算值、本期）chartColors.total；
//         兩條共用呼叫端給的尺度（例如原值的 |值| 最大值，barCellScale），條長＝|值| ÷ |尺度|，夾在 100%。
//   兩種模式共用版面 signed：false（預設）零線在左緣、條往右，滿寬＝100%；true 零線在正中央、正往右負往左，半寬＝100%（同 variance）。
//   同一張表的每一格要用同一個 signed（零線才對齊），由呼叫端以 barCellSigned(整張表的值) 算一次；signed 為 false 時負值沒有地方畫，不畫條（direction 仍為 left）。
//   share、pair 的條不可點（G22 精靈資料尚未提交、前處理表是純文字；G23 不另設點擊；PRD §8.7），型別上沒有 onClick；pair 的色固定，不收 tone。
// 條只是視覺輔助：根 svg 帶 aria-hidden 與 data-chart-kind="cell"（CL-1、CL-11 以它辨識內嵌條）、不可聚焦、圖內沒有 tabIndex；
// 鍵盤與螢幕報讀走同列的 number-link，點條呼叫與 number-link 相同的 handler（同一個 evidence builder）。
// 色只經 chart-theme.ts 的 chartColors（元件內沒有色碼與 var() 字串常值，CL-3）；高度只用 chartRowHeights（CL-10）；
// 顯示寬由 globals.css「V4-1 B」錨點決定（≥ 768 為 96px、≤ 767 為 64px）；要不要顯示（例如 G6 只在 ≤ 767 顯示）由各圖自己的錨點決定，本元件不藏。

/** C24 的四種模式（PRD §6.3）：variance 共用零線雙向、share 0 到 100%、pair 上下成對、count 從 0 計數。V4-7b 起實作 variance、share、pair（count 在 V4-10）。 */
export type BarCellMode = "variance" | "share" | "pair" | "count";
/**
 * 條色的語意：由呼叫端依 deltaTone／favorableDirectionOf 判斷後傳入（依有利方向，不依數學正負號）。
 * V4-7b：加 total（非本期序列或水準值的中性條，chartColors.total；與 neutral 同色、data-tone 不同，給 share 的呼叫端明示）。
 */
export type BarCellTone = "favorable" | "unfavorable" | "neutral" | "total";
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
/** V4-3a 刻度寬（座標單位）；高＝盒高 BAR_CELL_HEIGHT（12），即 PRD §7.1 的「2×12 刻度」。 */
export const BAR_CELL_TICK_WIDTH = 2;
/** V4-3a 空心條的框線寬（px，non-scaling-stroke）；框線矩形向內縮半個框線寬，外緣與實心條同一個盒。 */
export const BAR_CELL_OUTLINE_STROKE = 2;
/** 空心條的最短外框（座標單位）：內縮後至少留 1 個座標單位，框線才不會疊成一團。 */
const MIN_OUTLINE_BAR = BAR_CELL_OUTLINE_STROKE + 1;
/** V4-7b pair 上條（參考值）的高（px，PRD §6.3「上 4px、下 6px」）；下條（主值）高＝chartRowHeights.cell。上條貼盒頂、下條貼盒底，中間留 12 − 4 − 6＝2。 */
export const BAR_CELL_PAIR_PREVIOUS_HEIGHT = 4;
/** V4-7b share、pair 未分正負（signed 為 false）時零線畫在 x＝0.5（1px 線的中心），不被 svg 的左邊界切掉一半；條仍從 x＝0 起。 */
export const BAR_CELL_EDGE_ZERO_X = 0.5;

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
/**
 * V4-7b：一組值裡有沒有負值（缺值、無法解析與 −0 略過）。share、pair 的同一張表以它決定共用版面 signed（有負值時零線在正中央、負值往左）。
 * share 傳整張表要畫條的各列值；pair 傳上下兩條的全部值。
 */
export function barCellSigned(values: readonly BarCellAmount[]): boolean {
  return values.some(value => {
    const parsed = exactOf(value);
    return parsed !== null && parsed.lt(0);
  });
}
/**
 * V4-7b share 的基準：> 0 時回傳精確字串（toFixed），≤ 0、缺值或無法解析時回傳 null（比照 ratioMetric 分母 ≤ 0 回傳 null）。
 * 呼叫端以它決定整張表要不要畫條（G23：淨營收 ≤ 0 或 null 時整張表不畫條）。
 */
export function barCellShareBase(base: BarCellAmount): string | null {
  const parsed = exactOf(base);
  return parsed === null || parsed.lte(0) ? null : parsed.toFixed();
}

export interface BarCellVarianceInput {
  mode: "variance";
  value: BarCellAmount;
  /** 共同尺度（|值| 最大值；負數取絕對值）。 */
  max: BarCellAmount;
  /** V4-3a：門檻或目標刻度（精確字串或數值；取絕對值，與條同一把尺）。缺值、無法解析、0、超出尺度或沒有條時不畫。 */
  tick?: BarCellAmount;
  /** V4-3a：空心條（2px 框線、不填色）；預設實心。 */
  outline?: boolean;
}
/** V4-7b share：條長＝|值| ÷ 基準（> 0），夾在 100%。 */
export interface BarCellShareInput {
  mode: "share";
  value: BarCellAmount;
  /** 比較基準（例如淨營收；精確字串或數值）。≤ 0、缺值或無法解析時沒有條（barCellShareBase）。 */
  base: BarCellAmount;
  /** 版面：false（預設）零線在左緣、滿寬＝100%；true 零線在正中央、半寬＝100%、負值往左。同一張表共用一個值（barCellSigned）。 */
  signed?: boolean;
}
/** V4-7b pair：上 4px 參考值（previous）、下 6px 主值（value），共用呼叫端給的尺度。 */
export interface BarCellPairInput {
  mode: "pair";
  /** 下條（高 chartRowHeights.cell，chartColors.total）：主值，例如換算後金額。 */
  value: BarCellAmount;
  /** 上條（高 BAR_CELL_PAIR_PREVIOUS_HEIGHT，chartColors.previous）：參考值，例如含稅原值。 */
  previous: BarCellAmount;
  /** 共同尺度（負數取絕對值；例如原值的 |值| 最大值，barCellScale）。缺值、無法解析或 0 時兩條都不畫。 */
  max: BarCellAmount;
  /** 版面：同 share。 */
  signed?: boolean;
}
export type BarCellGeometryInput = BarCellVarianceInput | BarCellShareInput | BarCellPairInput;

/** 座標系內的矩形（viewBox 單位）。 */
export interface BarCellRect { x: number; y: number; width: number; height: number }

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
  /** 條的矩形；值缺、為 0 或尺度無效時為 null（只畫零線）。空心條時是框線的外緣（與實心條同一個盒）。 */
  bar: BarCellRect | null;
  /** V4-3a 空心條的框線矩形（bar 向內縮半個框線寬）；不是空心條或沒有條時為 null。 */
  outline: BarCellRect | null;
  /** V4-3a |tick| ÷ |尺度|（夾在 0 到 1 之內才有值）；沒給 tick、tick 無效或為 0、超出尺度、尺度無效時為 null。只用於位置。 */
  tickRatio: number | null;
  /** V4-3a 刻度矩形（2×12，中心在刻度位置，夾在座標系內）；tickRatio 為 null 或沒有條（方向不明）時為 null。 */
  tick: BarCellRect | null;
}
/** V4-7b share 與 pair 的一條（長度、方向、矩形）。 */
export interface BarCellLengthBar {
  /** |值| ÷ 基準（或 |尺度|），夾在 0 到 1；值、基準或尺度無效時為 null。只用於長度。 */
  ratio: number | null;
  /** |值| 超過基準（或 |尺度|），條夾在滿長。 */
  clamped: boolean;
  /** 負值往左、正值往右；值為 0 或無效時為 null。 */
  direction: "left" | "right" | null;
  /** 條的矩形；值缺、為 0、基準或尺度無效，或 signed 為 false 時的負值（沒有地方畫）為 null。 */
  bar: BarCellRect | null;
}
/** V4-7b share、pair 共用的版面。 */
export interface BarCellLayout {
  /** viewBox 的寬與高（同 variance：96 × 12）。 */
  width: number;
  height: number;
  /** 版面是否分正負（零線在正中央）。 */
  signed: boolean;
  /** 值 0 的 x：signed 為 48，否則 0。 */
  zeroX: number;
  /** 零線畫在哪個 x：signed 為 48，否則 BAR_CELL_EDGE_ZERO_X（0.5）。 */
  zeroLineX: number;
}
export interface BarCellShareGeometry extends BarCellLayout, BarCellLengthBar { mode: "share" }
export interface BarCellPairGeometry extends BarCellLayout {
  mode: "pair";
  /** 上條（參考值；y＝0、高 BAR_CELL_PAIR_PREVIOUS_HEIGHT）。 */
  previous: BarCellLengthBar;
  /** 下條（主值；貼盒底、高 chartRowHeights.cell）。 */
  value: BarCellLengthBar;
}
export type BarCellGeometry = BarCellVarianceGeometry | BarCellShareGeometry | BarCellPairGeometry;

/** 座標取到 0.1（HALF_UP，全程用 Decimal，避免浮點誤差）。 */
const toTenth = (value: Decimal) => value.toDecimalPlaces(1, Decimal.ROUND_HALF_UP);

/**
 * C24 幾何（純函式，單元測試用）。variance：零線在正中央，半寬（48）＝尺度；條長＝|值| ÷ |尺度| × 半寬，超過尺度時夾在半寬。
 * 比例用 Decimal 以精確字串計算，座標取到 0.1；非零值至少畫 MIN_BAR 寬（空心條至少 MIN_OUTLINE_BAR）。
 * V4-3a：刻度中心＝零線 ∓ |tick| ÷ |尺度| × 半寬（與條同一側）；tick 為 0（與零線重疊）、超出尺度或沒有條時不畫。
 * V4-7b：依 mode 分派到 share（barCellShareGeometry）與 pair（barCellPairGeometry）；variance 的實作不變。
 */
export function barCellGeometry(input: BarCellVarianceInput): BarCellVarianceGeometry;
export function barCellGeometry(input: BarCellShareInput): BarCellShareGeometry;
export function barCellGeometry(input: BarCellPairInput): BarCellPairGeometry;
export function barCellGeometry(input: BarCellGeometryInput): BarCellGeometry;
export function barCellGeometry(input: BarCellGeometryInput): BarCellGeometry {
  if (input.mode === "share") return barCellShareGeometry(input);
  if (input.mode === "pair") return barCellPairGeometry(input);
  return barCellVarianceGeometry(input);
}

/** variance 的幾何（V4-1、V4-3a 的實作；V4-7b 只把它從 barCellGeometry 抽成獨立函式，內容不變）。 */
function barCellVarianceGeometry(input: BarCellVarianceInput): BarCellVarianceGeometry {
  const half = new Exact(BAR_CELL_WIDTH).div(2);
  const zeroX = half.toNumber();
  const base = { mode: "variance" as const, width: BAR_CELL_WIDTH, height: BAR_CELL_HEIGHT, zeroX };
  const empty = { outline: null, tickRatio: null, tick: null };
  const value = exactOf(input.value), max = exactOf(input.max);
  if (value === null || max === null || max.isZero()) return { ...base, ratio: null, direction: null, bar: null, ...empty };
  const ratio = Exact.min(value.abs().div(max.abs()), 1);
  // 刻度比例：只在 0 < |tick| ≤ |尺度| 時有值（0 與零線重疊；超出尺度不夾在端點）。
  const tickValue = input.tick === undefined ? null : exactOf(input.tick);
  const tickExact = tickValue === null || tickValue.isZero() || tickValue.abs().gt(max.abs()) ? null : tickValue.abs().div(max.abs());
  const tickRatio = tickExact === null ? null : tickExact.toNumber();
  if (value.isZero()) return { ...base, ratio: 0, direction: null, bar: null, outline: null, tickRatio, tick: null };
  const length = Exact.max(toTenth(ratio.times(half)), input.outline ? MIN_OUTLINE_BAR : MIN_BAR);
  const direction = value.isNegative() ? "left" as const : "right" as const;
  const x = direction === "left" ? half.minus(length).toNumber() : zeroX;
  const bar = { x, y: (BAR_CELL_HEIGHT - chartRowHeights.cell) / 2, width: length.toNumber(), height: chartRowHeights.cell };
  const inset = new Exact(BAR_CELL_OUTLINE_STROKE).div(2);
  const outline = input.outline ? { x: new Exact(x).plus(inset).toNumber(), y: bar.y + inset.toNumber(), width: length.minus(inset.times(2)).toNumber(), height: bar.height - inset.times(2).toNumber() } : null;
  let tick: BarCellRect | null = null;
  if (tickExact !== null) {
    const offset = toTenth(tickExact.times(half));
    const center = direction === "left" ? half.minus(offset) : half.plus(offset);
    const tickHalf = new Exact(BAR_CELL_TICK_WIDTH).div(2);
    const left = Exact.min(Exact.max(center.minus(tickHalf), 0), new Exact(BAR_CELL_WIDTH).minus(BAR_CELL_TICK_WIDTH));
    tick = { x: left.toNumber(), y: 0, width: BAR_CELL_TICK_WIDTH, height: BAR_CELL_HEIGHT };
  }
  return { ...base, ratio: ratio.toNumber(), direction, bar, outline, tickRatio, tick };
}

/** V4-7b share、pair 的版面（signed 時零線在正中央、半寬＝100%；否則零線在左緣、全寬＝100%）與 100% 的座標長。 */
function layoutOf(signed: boolean): { layout: BarCellLayout; full: Decimal } {
  const full = signed ? new Exact(BAR_CELL_WIDTH).div(2) : new Exact(BAR_CELL_WIDTH);
  const zeroX = signed ? full.toNumber() : 0;
  return { layout: { width: BAR_CELL_WIDTH, height: BAR_CELL_HEIGHT, signed, zeroX, zeroLineX: signed ? zeroX : BAR_CELL_EDGE_ZERO_X }, full };
}
/**
 * V4-7b 一條的長度與矩形：ratio＝|值| ÷ 分母（呼叫前已確認 > 0），夾在 1；條長＝ratio × 100% 的座標長（取到 0.1），非零值至少 MIN_BAR。
 * signed 時正值從零線往右、負值往左；未分正負時正值從左緣往右，負值沒有地方畫（bar 為 null，direction 仍為 left）。
 */
function lengthBar(value: Decimal | null, denominator: Decimal | null, { layout, full }: ReturnType<typeof layoutOf>, y: number, height: number): BarCellLengthBar {
  if (value === null || denominator === null) return { ratio: null, clamped: false, direction: null, bar: null };
  const exactRatio = value.abs().div(denominator);
  const ratio = Exact.min(exactRatio, 1);
  const clamped = exactRatio.gt(1);
  if (value.isZero()) return { ratio: 0, clamped, direction: null, bar: null };
  const direction = value.isNegative() ? "left" as const : "right" as const;
  if (direction === "left" && !layout.signed) return { ratio: ratio.toNumber(), clamped, direction, bar: null };
  const length = Exact.max(toTenth(ratio.times(full)), MIN_BAR);
  const x = direction === "left" ? new Exact(layout.zeroX).minus(length).toNumber() : layout.zeroX;
  return { ratio: ratio.toNumber(), clamped, direction, bar: { x, y, width: length.toNumber(), height } };
}

/**
 * V4-7b share 幾何（純函式）：條長＝|值| ÷ 基準 × 100% 的座標長（signed 時 48，否則 96），夾在 100%；條高 chartRowHeights.cell、垂直置中（同 variance）。
 * 基準 ≤ 0、缺值或無法解析時 ratio 為 null、沒有條（barCellShareBase）；值為 0 時 ratio 0、沒有條，只畫零線。
 */
export function barCellShareGeometry(input: Omit<BarCellShareInput, "mode">): BarCellShareGeometry {
  const shape = layoutOf(input.signed === true);
  const base = barCellShareBase(input.base);
  const bar = lengthBar(exactOf(input.value), base === null ? null : new Exact(base), shape, (BAR_CELL_HEIGHT - chartRowHeights.cell) / 2, chartRowHeights.cell);
  return { mode: "share", ...shape.layout, ...bar };
}

/**
 * V4-7b pair 幾何（純函式）：上條（previous）y＝0、高 BAR_CELL_PAIR_PREVIOUS_HEIGHT；下條（value）貼盒底、高 chartRowHeights.cell；
 * 兩條共用 |尺度|，條長＝|值| ÷ |尺度| × 100% 的座標長，夾在 100%。尺度缺值、無法解析或為 0 時兩條都沒有（ratio 為 null）；任一值為 0 或缺值時只少那一條。
 */
export function barCellPairGeometry(input: Omit<BarCellPairInput, "mode">): BarCellPairGeometry {
  const shape = layoutOf(input.signed === true);
  const max = exactOf(input.max);
  const denominator = max === null || max.isZero() ? null : max.abs();
  return {
    mode: "pair", ...shape.layout,
    previous: lengthBar(exactOf(input.previous), denominator, shape, 0, BAR_CELL_PAIR_PREVIOUS_HEIGHT),
    value: lengthBar(exactOf(input.value), denominator, shape, BAR_CELL_HEIGHT - chartRowHeights.cell, chartRowHeights.cell),
  };
}

/** 條色（tone → chart-theme 的 var() 字串）：只有不利上色（D-V3-7，有利不用綠）；有利預設灰（favorable）或 total；neutral 與 total（V4-7b）用 total。 */
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
/** V4-7b share 的 props：條色依 tone（呼叫端依列的角色判斷，例如 G23 扣項為負用 favorable、小計與結果列為負用 unfavorable）；不可點。 */
export interface BarCellShareProps extends BarCellShareInput {
  tone: BarCellTone;
  favorableFill?: BarCellFavorableFill;
  /** 根 svg 的 data-testid（例如 chart-evidence-ladder-bar-{metric}）。 */
  testId?: string;
  /** 加在根 svg 的額外 class。 */
  className?: string;
}
/** V4-7b pair 的 props：色固定（上條 chartColors.previous、下條 chartColors.total），不收 tone；不可點。 */
export interface BarCellPairProps extends BarCellPairInput {
  /** 根 svg 的 data-testid（例如 chart-data-preprocess-bar-{field}）。 */
  testId?: string;
  /** 加在根 svg 的額外 class。 */
  className?: string;
}
export type BarCellProps = BarCellVarianceProps | BarCellShareProps | BarCellPairProps;

/**
 * C24 表格內嵌條：放在既有 <td> 或清單列內、同列數字之前；整個 svg aria-hidden，不改表格 DOM、testid 與 number-link。
 * V4-3a：tick（刻度，畫在最上層）與 outline（空心條）只在有給時輸出，根 svg 另加 has-tick、is-outline；沒給時 markup 與 V4-2 逐字相同。
 * V4-7b：依 mode 分派；variance 的 markup 與 V4-7a 逐字相同。
 */
export function BarCell(props: BarCellProps) {
  if (props.mode === "share") return shareCell(props);
  if (props.mode === "pair") return pairCell(props);
  return varianceCell(props);
}

/** variance（V4-1、V4-3a 的 BarCell 本體；V4-7b 只改成由 BarCell 分派，markup 不變）。 */
function varianceCell({ value, max, tick, outline = false, tone, favorableFill = "favorable", testId, className, onClick }: BarCellVarianceProps) {
  const geometry = barCellGeometry({ mode: "variance", value, max, tick, outline });
  const { width, height, zeroX, bar } = geometry;
  const color = barCellFill(tone, favorableFill);
  return <svg
    className={`bar-cell is-variance${outline ? " is-outline" : ""}${geometry.tick ? " has-tick" : ""}${onClick ? " is-clickable" : ""}${className ? ` ${className}` : ""}`}
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
    {geometry.outline
      ? <rect className="bar-cell-bar" x={geometry.outline.x} y={geometry.outline.y} width={geometry.outline.width} height={geometry.outline.height} fill="none" stroke={color} strokeWidth={BAR_CELL_OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />
      : bar && <rect className="bar-cell-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={color} />}
    <line className="bar-cell-zero" x1={zeroX} x2={zeroX} y1={0} y2={height} stroke={chartColors.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
    {geometry.tick && <rect className="bar-cell-tick" x={geometry.tick.x} y={geometry.tick.y} width={geometry.tick.width} height={geometry.tick.height} fill={chartColors.target} />}
  </svg>;
}

/** V4-7b share：根 svg class 加 is-share（signed 時再加 is-signed）與 data-tone；條（rect.bar-cell-bar）在零線之前畫，零線在最上層。 */
function shareCell({ value, base, signed = false, tone, favorableFill = "favorable", testId, className }: BarCellShareProps) {
  const geometry = barCellShareGeometry({ value, base, signed });
  const { width, height, zeroLineX, bar } = geometry;
  return <svg
    className={`bar-cell is-share${signed ? " is-signed" : ""}${className ? ` ${className}` : ""}`}
    data-chart-kind="cell"
    data-testid={testId}
    data-tone={tone}
    viewBox={`0 0 ${width} ${height}`}
    width={width}
    height={BAR_CELL_HEIGHT}
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    {bar && <rect className="bar-cell-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={barCellFill(tone, favorableFill)} />}
    <line className="bar-cell-zero" x1={zeroLineX} x2={zeroLineX} y1={0} y2={height} stroke={chartColors.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
  </svg>;
}

/** V4-7b pair：根 svg class 加 is-pair（signed 時再加 is-signed）；上條 rect.bar-cell-previous（chartColors.previous）、下條 rect.bar-cell-bar（chartColors.total），零線在最上層。 */
function pairCell({ value, previous, max, signed = false, testId, className }: BarCellPairProps) {
  const geometry = barCellPairGeometry({ value, previous, max, signed });
  const { width, height, zeroLineX } = geometry;
  const top = geometry.previous.bar, bottom = geometry.value.bar;
  return <svg
    className={`bar-cell is-pair${signed ? " is-signed" : ""}${className ? ` ${className}` : ""}`}
    data-chart-kind="cell"
    data-testid={testId}
    viewBox={`0 0 ${width} ${height}`}
    width={width}
    height={BAR_CELL_HEIGHT}
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    {top && <rect className="bar-cell-previous" x={top.x} y={top.y} width={top.width} height={top.height} fill={chartColors.previous} />}
    {bottom && <rect className="bar-cell-bar" x={bottom.x} y={bottom.y} width={bottom.width} height={bottom.height} fill={chartColors.total} />}
    <line className="bar-cell-zero" x1={zeroLineX} x2={zeroLineX} y1={0} y2={height} stroke={chartColors.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
  </svg>;
}
