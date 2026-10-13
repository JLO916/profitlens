"use client";

import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";

// V4-10 代理 D：G24 折扣率 × 商品毛利率散佈的圖本體（PRD §4.1–§4.7 G24、§8.2；CHART_CATALOG §8 G24；D-V4-21＝A）。
// 本檔是全站唯一 import ScatterChart、Scatter 的地方（CL-6）：只由 src/components/products/scatter-section.tsx 以 next/dynamic（ssr: false）載入，
// 任何檔案都不得靜態 import 本檔（`import type` 例外），所以它與 ScatterChart 的程式碼在自己的 chunk，不在首載，也不在商品頁的 chunk（tests/lazy-panels.test.tsx）。
// 只畫點：X 折扣率、Y 商品毛利率（兩軸都是比率，只有一個數值 YAxis，CL-8），刻度與範圍由呼叫端算好傳入（只是座標）；點 chartColors.total，
// 商品毛利率 < 0 的點 chartColors.unfavorable（只有不利上色，D-V3-7）；不標 SKU（資料表可查）、沒有圖例與 tooltip。
// 圖在 ChartFrame 的 aria-hidden 固定高容器內（lg），圖內沒有可聚焦元素（accessibilityLayer={false}）；點擊交給呼叫端（與資料表同一個 builder），鍵盤經由資料表。
// 色只經 chartColors、字級只用 chartFontSize、固定高只用 chartHeights（CL-3、CL-5、CL-10）；沒有動畫（CL-4）。

/** 一個點：key 是呼叫端用來找回那一列的鍵（不是陣列索引）；x、y 是比率的圖形座標（Number 近似值，顯示與抽屜一律用 domain 的精確字串）。 */
export interface ProductsScatterPoint {
  key: string;
  x: number;
  y: number;
  /** 商品毛利率 < 0：點用不利色。 */
  unfavorable: boolean;
}
/** 一個比率軸（只是座標）：domain 含所有點；labels 與 ticks 逐一對齊（文字由呼叫端經 copy.ts 的 formatAxisPercent 產生）。 */
export interface ProductsScatterAxis {
  domain: [number, number];
  ticks: number[];
  labels: string[];
}
export interface ProductsScatterChartProps {
  points: readonly ProductsScatterPoint[];
  x: ProductsScatterAxis;
  y: ProductsScatterAxis;
  /** 點擊某個點：傳回該點的 key。 */
  onPoint: (key: string) => void;
}

/** Y 軸刻度文字的寬（「−100%」約 5 個字）。 */
const Y_AXIS_WIDTH = 52;

export default function ProductsScatterChart({ points, x, y, onPoint }: ProductsScatterChartProps) {
  const xText = new Map(x.ticks.map((tick, position) => [tick, x.labels[position] ?? ""]));
  const yText = new Map(y.ticks.map((tick, position) => [tick, y.labels[position] ?? ""]));
  const tick = { fontSize: chartFontSize, fill: chartColors.axis };
  return <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.lg }}>
    <ScatterChart margin={{ top: 12, right: 16, bottom: 4, left: 4 }} accessibilityLayer={false}>
      <CartesianGrid stroke={chartColors.grid} />
      <XAxis type="number" dataKey="x" domain={x.domain} ticks={x.ticks} tickFormatter={(value: number) => xText.get(value) ?? ""} allowDataOverflow={false} tickLine={false} axisLine={false} tick={tick} />
      <YAxis type="number" dataKey="y" domain={y.domain} ticks={y.ticks} tickFormatter={(value: number) => yText.get(value) ?? ""} allowDataOverflow={false} tickLine={false} axisLine={false} tick={tick} width={Y_AXIS_WIDTH} />
      <Scatter data={[...points]} className="products-scatter-points" fill={chartColors.total} isAnimationActive={false}
        onClick={item => { const key = (item.payload as ProductsScatterPoint | undefined)?.key; if (key !== undefined) onPoint(key); }}>
        {points.map(point => <Cell key={point.key} fill={point.unfavorable ? chartColors.unfavorable : chartColors.total} />)}
      </Scatter>
    </ScatterChart>
  </ResponsiveContainer>;
}
