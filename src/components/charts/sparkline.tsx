"use client";

import { chartColors, chartHeights } from "@/application/chart-theme";

// V4-2 代理 A：C19 Sparkline（PRD §6.2 C19、§4.4 G7、§7.1、§7.4、X40；CHART_CATALOG G7、§9.1）。純 inline SVG，不加套件，SSR 可渲染。
// 16×64（高＝chartHeights.xs，對應 --chart-h-xs）、無軸無框、不標值；線 chartColors.total 1.5px（不是本期資料的序列一律用 total，PRD §7.1），
// 最後一點 3px 實心 chartColors.current；null 斷線（不內插、不當 0）；水準值序列（件數）的未滿 7 天的點畫空心、不和完整週連線（X40）。
// 根 svg 帶 aria-hidden 與 data-chart-kind="spark"（CL-1、CL-11 用這個標記辨識）；不可點、不可聚焦，圖內沒有 tabIndex：語意由同列數字承擔。
// 色只經 chart-theme.ts 的 chartColors（元件內沒有色碼與 var() 字串常值，CL-3）；高度只用 chartHeights（CL-10）。

/** 座標系寬（viewBox；顯示寬同值，PRD §4.1 G7「16×64」）。 */
export const SPARK_WIDTH = 64;
/** 上下左右留白＝最後一點的半徑：點畫在邊上也不被裁掉。 */
export const SPARK_PAD = 3;
/** 最後一點的半徑（3px 圓點，與趨勢圖的最後一點相同）。 */
export const SPARK_DOT_R = 3;
/** 折線寬與空心點的框線寬。 */
export const SPARK_STROKE = 1.5;
/** 前後都斷線的單一點（不是最後一點）：畫一個與線同寬的小點，不然整週的值會看不到。 */
const SPARK_POINT_R = 1.5;

/** 一點：圖形座標（Number 近似值，只用來畫圖；顯示與抽屜一律用 domain 的精確字串）；incomplete＝未滿 7 天的週。 */
export interface SparklinePoint {
  value: number | null;
  incomplete?: boolean;
}
export interface SparklineCoordinate {
  index: number;
  x: number;
  y: number;
}
/** 要畫的點：last＝最後一個有值的點（實心 current）；hollow＝水準值序列的未滿 7 天的點（空心）；point＝前後都斷線的單一點（小實心點）。 */
export interface SparklineDot extends SparklineCoordinate {
  kind: "last" | "hollow" | "point";
  /** 是不是最後一個有值的點（空心點也可能是最後一點）。 */
  last: boolean;
}
export interface SparklineGeometry {
  width: number;
  height: number;
  /** 與輸入逐一對齊；null 值（缺值）為 null。 */
  coordinates: (SparklineCoordinate | null)[];
  /** 折線段（polyline 的 points 字串）：只連相鄰的有值點；null 斷線；hollowIncomplete 時未滿 7 天的點不連線。每段至少 2 點。 */
  lines: string[];
  dots: SparklineDot[];
  /** Y 範圍＝該列有值的點的最小到最大（PRD §4.4 G7）；沒有任何值時為 null。 */
  domain: [number, number] | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * C19 幾何（純函式，tests/chart-geometry-v4.test.ts）。X：n 點平均分在 [PAD, 寬 − PAD]，只有 1 點時放在最右（最新）；
 * Y：該列的最小到最大對應 [高 − PAD, PAD]，全部相同時畫在正中央。座標取到 0.1。
 */
export function sparklineGeometry(points: readonly SparklinePoint[], options: { hollowIncomplete?: boolean } = {}): SparklineGeometry {
  const width = SPARK_WIDTH, height = chartHeights.xs;
  const values = points.map(point => point.value !== null && Number.isFinite(point.value) ? point.value : null);
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return { width, height, coordinates: values.map(() => null), lines: [], dots: [], domain: null };
  const min = Math.min(...present), max = Math.max(...present);
  const innerWidth = width - 2 * SPARK_PAD, innerHeight = height - 2 * SPARK_PAD;
  const xAt = (index: number) => points.length === 1 ? width - SPARK_PAD : SPARK_PAD + innerWidth * index / (points.length - 1);
  const yAt = (value: number) => max === min ? height / 2 : SPARK_PAD + (max - value) / (max - min) * innerHeight;
  const coordinates = values.map((value, index): SparklineCoordinate | null => value === null ? null : { index, x: round1(xAt(index)), y: round1(yAt(value)) });
  const hollow = (index: number) => options.hollowIncomplete === true && points[index].incomplete === true;
  const lastIndex = coordinates.reduce((last, coordinate) => coordinate === null ? last : coordinate.index, -1);

  const lines: string[] = [];
  const isolated = new Set<number>();
  let run: SparklineCoordinate[] = [];
  const flush = () => {
    if (run.length >= 2) lines.push(run.map(point => `${point.x},${point.y}`).join(" "));
    else if (run.length === 1) isolated.add(run[0].index);
    run = [];
  };
  for (const coordinate of coordinates) {
    if (coordinate === null || hollow(coordinate.index)) flush();
    else run.push(coordinate);
  }
  flush();

  const dots: SparklineDot[] = [];
  for (const coordinate of coordinates) {
    if (coordinate === null) continue;
    const last = coordinate.index === lastIndex;
    if (hollow(coordinate.index)) dots.push({ ...coordinate, kind: "hollow", last });
    else if (last) dots.push({ ...coordinate, kind: "last", last });
    else if (isolated.has(coordinate.index)) dots.push({ ...coordinate, kind: "point", last });
  }
  return { width, height, coordinates, lines, dots, domain: [min, max] };
}

export interface SparklineProps {
  points: readonly SparklinePoint[];
  /** 水準值序列（件數）：未滿 7 天的點空心、不連線（X40）；比值序列不給。 */
  hollowIncomplete?: boolean;
  /** 根 svg 的 data-testid（必填），依 PRD §4.7 由呼叫端組，例如 chart-overview-assist-spark-{kpiId}；不以 kpi- 開頭。 */
  testId: string;
  className?: string;
}

/** C19 Sparkline：放在表格列內、同列數字旁；整個 svg aria-hidden、不可聚焦、不可點。沒有任何值時只輸出空的 svg（呼叫端可改為不渲染）。 */
export function Sparkline({ points, hollowIncomplete = false, testId, className }: SparklineProps) {
  const geometry = sparklineGeometry(points, { hollowIncomplete });
  const drawn = geometry.coordinates.filter(coordinate => coordinate !== null).length;
  return <svg
    className={`spark${className ? ` ${className}` : ""}`}
    data-chart-kind="spark"
    data-testid={testId}
    data-points={drawn}
    viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    width={geometry.width}
    height={chartHeights.xs}
    aria-hidden="true"
    focusable="false"
  >
    {geometry.lines.map(line => <polyline key={line} className="spark-line" points={line} fill="none" stroke={chartColors.total} strokeWidth={SPARK_STROKE} strokeLinejoin="round" strokeLinecap="round" />)}
    {geometry.dots.map(dot => dot.kind === "hollow"
      ? <circle key={dot.index} className="spark-dot" data-kind={dot.kind} cx={dot.x} cy={dot.y} r={SPARK_DOT_R - SPARK_STROKE / 2} fill={chartColors.surface} stroke={dot.last ? chartColors.current : chartColors.total} strokeWidth={SPARK_STROKE} />
      : <circle key={dot.index} className="spark-dot" data-kind={dot.kind} cx={dot.x} cy={dot.y} r={dot.kind === "last" ? SPARK_DOT_R : SPARK_POINT_R} fill={dot.kind === "last" ? chartColors.current : chartColors.total} />)}
  </svg>;
}
