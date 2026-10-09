"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chartColors, chartFontSize, chartRowHeights } from "@/application/chart-theme";

// V4-3a 代理 A：C27 ShareStack 每 100 元去向（PRD §6.3 C27、§4.4 G10、§7.1、§7.2、§7.4；CHART_CATALOG G10、§9.1；D-V4-19＝B）。
// 純 inline SVG（Recharts stackOffset="expand" 不支援負值，不用）。每列一個範圍（通路或合計），列高 chartRowHeights.row24；
// svg 高＝（列數＋x 軸與 100 標字 1 列）× row24，列數含合計，所以是（通路數＋2）× 24。
// x 軸 0 到 max(100, 最大扣項合計)：三段灰階（商品成本 seg1、四項通路費用 seg2、廣告費 seg3）、剩餘為空心框（stroke chartColors.total）、
// 扣項合計超過 100 時超過的部分塗 chartColors.unfavorable（三段在 100 處截斷，超過的部分就是虧的元數）；100 處虛線參考線 chartColors.axis；
// 相鄰段之間靠 1px chartColors.surface 分隔線（D-V4-19＝B：灰階相鄰段對比不到 3:1，不另加色相）。
// status 不是 ready 的列（不適用、資料待補）只畫文字，不畫段。
// 根 svg aria-hidden、不可聚焦、圖內沒有 tabIndex；段可點（onSegmentClick），鍵盤經由資料表同一個 builder 的 number-link。
// 色只經 chart-theme.ts 的 chartColors（沒有色碼與 var() 字串常值，CL-3）；高度只用 chartRowHeights（CL-10）；字級只用 chartFontSize（CL-5）。

/** 段的語意 key（testid {prefix}{row.key}-{segment}）：商品成本、四項通路費用合計、廣告費、剩餘（空心）、超過 100 的部分（不利色）。 */
export const SHARE_STACK_SEGMENTS = ["cogs", "fees", "ad", "remain", "over"] as const;
export type ShareStackSegment = typeof SHARE_STACK_SEGMENTS[number];
export type ShareStackStatus = "ready" | "notApplicable" | "missing";
/** 右端標值的語氣：剩（次要色）、虧（不利色）；muted＝不適用、資料待補（畫在段的位置）。 */
export type ShareStackTone = "remain" | "loss" | "muted";

/** SSR（還沒量到寬）時的座標系寬，與 C25 相同。 */
export const SHARE_STACK_SSR_WIDTH = 560;
/** 寬於這個值時列名欄 152px、右端標值欄 88px；否則（390 手機）128px、64px（H5 設計稿）。 */
export const SHARE_STACK_NARROW_BELOW = 480;
export const SHARE_STACK_LABEL_WIDTH = { wide: 152, narrow: 128 } as const;
export const SHARE_STACK_VALUE_WIDTH = { wide: 88, narrow: 64 } as const;
/** 列名與圖之間、圖與標值之間的間距。 */
const GAP = 8;
/** 列內的條：上緣 5、高 14（列高 24，置中）；剩餘的空心框線寬 1.5（框內縮半個線寬，外緣與實心段對齊）。 */
const BAR_TOP = 5;
const BAR_HEIGHT = 14;
const REMAIN_STROKE = 1.5;
/** 文字基線（列頂起算）。 */
const TEXT_BASELINE = 16;
/** x 軸刻度（每 100 元的元數）。 */
export const SHARE_STACK_TICKS = [0, 25, 50, 75, 100] as const;
const HUNDRED = 100;

/** 一列的輸入：比率是 domain 或 B 級函式回傳的 12 位小數字串（只用來畫圖，Number 近似值）；顯示字由呼叫端從 labels 組好傳入。 */
export interface ShareStackRowInput {
  /** 通路代碼或合計列的鍵；testid 用。 */
  key: string;
  label: string;
  status: ShareStackStatus;
  /** 商品成本、四項費用合計、廣告費佔淨營收比（比率小數）。 */
  cogs: string | null;
  fees: string | null;
  ad: string | null;
  /** 扣廣告後貢獻佔淨營收比（剩餘段；負值時不畫剩餘）。 */
  remain: string | null;
  /** 扣項合計超過 100 的部分（比率小數，channelStructure 的 overShare）；0 或 null 時不畫。 */
  over: string | null;
  /** 列右端的字（剩 {n} 元、虧 {n} 元），或不適用、資料待補（畫在圖的起點）。 */
  value: string;
  tone: ShareStackTone;
  /** 合計列（列名與標值加粗，前面畫一條分隔線）。 */
  total?: boolean;
}
export interface ShareStackSegmentShape { segment: ShareStackSegment; x: number; width: number }
export interface ShareStackRowShape {
  key: string;
  label: string;
  status: ShareStackStatus;
  total: boolean;
  /** 列頂 y。 */
  y: number;
  /** 條的上緣與高（剩餘段另內縮半個線寬）。 */
  barY: number;
  barHeight: number;
  textY: number;
  segments: ShareStackSegmentShape[];
  value: string;
  tone: ShareStackTone;
}
export interface ShareStackGeometry {
  width: number;
  /** （列數＋1）× chartRowHeights.row24。 */
  height: number;
  plot: { left: number; right: number };
  /** 列名（右對齊）的 x 與右端標值（左對齊）的 x。 */
  labelX: number;
  valueX: number;
  /** x 軸上限（每 100 元的元數）：max(100, 最大扣項合計)。 */
  scaleMax: number;
  /** 100 的 x（參考線）。 */
  x100: number;
  ticks: { value: number; x: number; label: string }[];
  rows: ShareStackRowShape[];
  /** 合計列之前的分隔線 y（沒有合計列時為 null）。 */
  separatorY: number | null;
  /** 參考線下端與 x 軸刻度字的基線。 */
  referenceBottom: number;
  axisTextY: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
/** 比率小數字串 → 每 100 元的元數（圖形座標）；缺值或不是有限數為 null。 */
const hundredOf = (ratio: string | number | null | undefined): number | null => {
  if (ratio === null || ratio === undefined || ratio === "") return null;
  const value = Number(ratio) * HUNDRED;
  return Number.isFinite(value) ? value : null;
};

/**
 * C27 幾何（純函式，tests/chart-geometry-v4.test.ts）。
 * axisMax：x 軸上限（比率小數，channelStructure 的 axisMax）；不給時用各 ready 列「三段相加＋超過 100 的部分」的最大值與 1 取大者。
 * 三段依序從 0 累加並在 100 截斷；超過 100 時另畫 over 段 [100, 100＋over]（over 由呼叫端傳入，就是扣項合計 ÷ 淨營收 − 1）；
 * 沒有超過時畫剩餘段 [100 − remain, 100]。寬度為 0 的段照樣輸出（例如 zero_ad 的廣告段），只是看不到。座標取到 0.1。
 */
export function shareStackGeometry(rows: readonly ShareStackRowInput[], options: { width: number; axisMax?: string | number | null }): ShareStackGeometry {
  const width = Math.max(1, Math.round(options.width));
  const narrow = width < SHARE_STACK_NARROW_BELOW;
  const labelWidth = narrow ? SHARE_STACK_LABEL_WIDTH.narrow : SHARE_STACK_LABEL_WIDTH.wide;
  const valueWidth = narrow ? SHARE_STACK_VALUE_WIDTH.narrow : SHARE_STACK_VALUE_WIDTH.wide;
  const left = labelWidth + GAP, right = Math.max(left + 1, width - valueWidth);
  const given = hundredOf(options.axisMax);
  const fallback = Math.max(HUNDRED, ...rows.filter(row => row.status === "ready").map(row => HUNDRED + Math.max(0, hundredOf(row.over) ?? 0)));
  const scaleMax = given !== null ? Math.max(HUNDRED, given) : fallback;
  const xOf = (value: number) => round1(left + Math.min(Math.max(value, 0), scaleMax) / scaleMax * (right - left));
  const span = (segment: ShareStackSegment, from: number, to: number): ShareStackSegmentShape => {
    const x = xOf(from);
    return { segment, x, width: Math.max(0, round1(xOf(to) - x)) };
  };
  const row24 = chartRowHeights.row24;
  const totalIndex = rows.findIndex(row => row.total === true);
  const shapes = rows.map((row, index): ShareStackRowShape => {
    const y = index * row24;
    const base = { key: row.key, label: row.label, status: row.status, total: row.total === true, y, barY: y + BAR_TOP, barHeight: BAR_HEIGHT, textY: y + TEXT_BASELINE, value: row.value, tone: row.tone };
    if (row.status !== "ready") return { ...base, segments: [] };
    const cogs = Math.max(0, hundredOf(row.cogs) ?? 0), fees = Math.max(0, hundredOf(row.fees) ?? 0), ad = Math.max(0, hundredOf(row.ad) ?? 0);
    const b1 = cogs, b2 = cogs + fees, b3 = cogs + fees + ad;
    const segments = [span("cogs", 0, Math.min(b1, HUNDRED)), span("fees", Math.min(b1, HUNDRED), Math.min(b2, HUNDRED)), span("ad", Math.min(b2, HUNDRED), Math.min(b3, HUNDRED))];
    const over = Math.max(0, hundredOf(row.over) ?? 0);
    if (over > 0) segments.push(span("over", HUNDRED, HUNDRED + over));
    else segments.push(span("remain", HUNDRED - Math.max(0, hundredOf(row.remain) ?? 0), HUNDRED));
    return { ...base, segments };
  });
  const referenceBottom = rows.length * row24 + 4;
  return {
    width, height: (rows.length + 1) * row24,
    plot: { left, right }, labelX: labelWidth, valueX: right + GAP,
    scaleMax, x100: xOf(HUNDRED),
    ticks: SHARE_STACK_TICKS.map(value => ({ value, x: xOf(value), label: String(value) })),
    rows: shapes,
    separatorY: totalIndex > 0 ? totalIndex * row24 + 0.5 : null,
    referenceBottom,
    axisTextY: rows.length * row24 + TEXT_BASELINE,
  };
}

const segmentFill: Record<ShareStackSegment, string> = { cogs: chartColors.seg1, fees: chartColors.seg2, ad: chartColors.seg3, remain: "none", over: chartColors.unfavorable };

export interface ShareStackProps {
  rows: readonly ShareStackRowInput[];
  /** x 軸上限（比率小數，channelStructure 的 axisMax）。 */
  axisMax?: string | null;
  /** 段的 data-testid 前綴（例如 chart-diagnosis-share-seg-）；段的 testid＝前綴＋row.key＋「-」＋segment。 */
  testIdPrefix: string;
  /** 點段：與資料表同欄 number-link 呼叫同一個 builder（剩餘與超過 100 的部分都開扣廣告後貢獻）。 */
  onSegmentClick?: (row: ShareStackRowInput, segment: ShareStackSegment) => void;
  /** 容器寬（px）；不給時以 ResizeObserver 量測，SSR 先用 560。 */
  width?: number;
}

/** C27：放在 ChartFrame（固定高、aria-hidden）內。根 svg.chart-share-stack aria-hidden、focusable=false。 */
export function ShareStack({ rows, axisMax, testIdPrefix, onSegmentClick, width }: ShareStackProps) {
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
  const drawWidth = Math.round(width ?? measured ?? SHARE_STACK_SSR_WIDTH);
  const geometry = useMemo(() => shareStackGeometry(rows, { width: drawWidth, axisMax }), [rows, drawWidth, axisMax]);
  const byKey = new Map(rows.map(row => [row.key, row]));
  return <div ref={frame} className="share-stack-measure">
    <svg className="chart-share-stack" viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%" height={geometry.height} aria-hidden="true" focusable="false" fontSize={chartFontSize} preserveAspectRatio="xMinYMin meet">
      {geometry.separatorY !== null && <line className="share-separator" x1={0} x2={geometry.width} y1={geometry.separatorY} y2={geometry.separatorY} stroke={chartColors.grid} strokeWidth={1} />}
      {geometry.rows.map(row => <g key={row.key} className={`share-row${row.total ? " is-total" : ""}`} data-status={row.status}>
        <text className={`share-label${row.total ? " is-strong" : ""}`} x={geometry.labelX} y={row.textY} textAnchor="end">{row.label}</text>
        {row.segments.map(shape => {
          const source = byKey.get(row.key)!;
          const remain = shape.segment === "remain";
          const inset = remain && shape.width > REMAIN_STROKE ? REMAIN_STROKE / 2 : 0;
          return <rect
            key={shape.segment}
            className={`share-seg is-${shape.segment}${onSegmentClick ? " is-clickable" : ""}`}
            data-testid={`${testIdPrefix}${row.key}-${shape.segment}`}
            x={round1(shape.x + inset)} y={round1(row.barY + inset)} width={round1(shape.width - 2 * inset)} height={round1(row.barHeight - 2 * inset)}
            fill={segmentFill[shape.segment]}
            stroke={remain ? chartColors.total : chartColors.surface}
            strokeWidth={remain ? REMAIN_STROKE : 1}
            onClick={onSegmentClick ? () => onSegmentClick(source, shape.segment) : undefined}
          />;
        })}
        {row.status === "ready"
          ? <text className={`chart-value share-value${row.tone === "loss" ? " is-unfavorable" : row.total ? " is-strong" : ""}`} x={geometry.valueX} y={row.textY}>{row.value}</text>
          : <text className="chart-value share-status" x={geometry.plot.left} y={row.textY}>{row.value}</text>}
      </g>)}
      <line className="share-reference" x1={geometry.x100} x2={geometry.x100} y1={0} y2={geometry.referenceBottom} stroke={chartColors.axis} strokeWidth={1} strokeDasharray="3 2" />
      <g className="share-axis">{geometry.ticks.map(tick => <text key={tick.value} x={tick.x} y={geometry.axisTextY} textAnchor="middle">{tick.label}</text>)}</g>
    </svg>
  </div>;
}
