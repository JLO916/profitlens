"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { track } from "@/application/analytics";
import { channelLabel, formatAxisPercent } from "@/application/copy";
import { formatCount, metricDefinitions } from "@/application/presentation";
import type { ProductComparisonRow } from "@/domain/product-comparison";
import { fill, labels } from "@/i18n";
import type { ProductsScatterAxis, ProductsScatterPoint } from "../charts/products-scatter-lazy";
import { chartDataTable, type ChartDataColumn } from "../charts/chart-data-table";
import type { EvidenceSelection } from "../evidence-drawer";
import { ChartFrame, coordinate } from "../overview/charts/chart-frame";
import { productEvidence, type ProductEvidenceContext } from "../product-evidence";
import { productChartLabel, type ProductChartScope } from "./highlight-charts";

// V4-10 代理 D：G24 折扣率 × 商品毛利率散佈（PRD §4.1–§4.7 G24、§5.3 第 4 列、§8.2；CHART_CATALOG §8 G24；D-V4-21＝A；P2）。
// 位置：商品頁完整表（section.product-full）之後的 <details class="chart-more products-scatter-more">（summary＝區塊標準名），收合時區塊與資料表照常掛載（M1）；
// 在 <details> 內，不算主層獨立圖（CL-9、X37）。
// 資料（A 級，只挑選既有值，不產生新數字）：同 G13、G14 的 compareProducts 結果（comparison.rows）本期的 discount_rate、gross_margin（domain 的比率，contribution-v1）；
// 任一為 null 的列不畫，筆數寫進副標（nullNote）。標題的「{n} 個商品毛利率為負」與副標的筆數只是數圖上的點（列數），不是新的金額或比率。
// 圖：Recharts ScatterChart，只在 src/components/charts/products-scatter-lazy.tsx，這裡以 next/dynamic（ssr: false）載入（CL-6；不在首載，也不在商品頁的 chunk）。
// 第一次展開 <details> 才渲染圖（才下載散佈圖的 chunk）；在那之前與 SSR 時，圖框是同高的 loading 骨架，資料表照常（CHART_CATALOG G24 單元測試欄）。
// 點 > PRODUCT_SCATTER_LIMIT（200）時不畫圖、只留資料表（ChartFrame state="empty"，message 指向資料表；PRD §8.2 散佈點 ≤ 200）。
// 點與資料表格呼叫同一個 builder：scatterEvidence＝productEvidence(row, "current", 折扣率或商品毛利率)＋filter { channel, sku }（點開商品毛利率）；點擊記 chart_clicked（D-V4-14）。
// 限制句「只呈現分布，不代表因果」放在資料表 <details> 內（表格之後，B8）。390：圖框 display:none，只留資料表（globals.css「V4-10 D」錨點）。投影、匯出不適用。
// 使用者看得到的字一律取 labels.products.chartsV4.scatter；指標名取 metricDefinitions；色只在 products-scatter-lazy.tsx 經 chartColors。

const copy = labels.products.chartsV4.scatter;
const comparison = labels.products.comparison;
const X = metricDefinitions.discount_rate.label;
const Y = metricDefinitions.gross_margin.label;

export const PRODUCTS_SCATTER_TESTID = "chart-products-scatter";
export const PRODUCTS_SCATTER_TABLE_TESTID = "chart-products-scatter-table";
/** PRD §8.2：散佈點 ≤ 200；超過時不畫圖、只留資料表。 */
export const PRODUCT_SCATTER_LIMIT = 200;
/** 兩軸的指標（資料表欄的順序同 CHART_CATALOG G24：折扣率、毛利率）。 */
export const SCATTER_METRICS = ["discount_rate", "gross_margin"] as const;
export type ScatterMetric = typeof SCATTER_METRICS[number];
/** 刻度 5 個百分點（CHART_CATALOG G24）；範圍太大時步長放大成 5 個百分點的整數倍，最多約 SCATTER_MAX_INTERVALS 格。 */
export const SCATTER_TICK_POINTS = 5;
export const SCATTER_MAX_INTERVALS = 12;

/** 點與資料表列的鍵（通路＋SKU；不是陣列索引）。 */
export const scatterPointKey = (row: Pick<ProductComparisonRow, "channel" | "sku">) => JSON.stringify([row.channel, row.sku]);
/** 點與資料表格的「計算與來源」：本期的折扣率或商品毛利率（值直接取自 domain，維持 contribution-v1）＋filter { channel, sku }。 */
export const scatterEvidence = (row: ProductComparisonRow, name: ScatterMetric, ctx: ProductEvidenceContext): EvidenceSelection => productEvidence(row, "current", name, metricDefinitions[name].shortLabel, ctx, { drill: true });

/** 百分點去掉浮點尾數（0.07 × 100＝7.000000000000001）。 */
const toPoints = (ratio: number) => Math.round(ratio * 100 * 1e6) / 1e6;
/**
 * 比率軸（只是圖形座標；值是 domain 的比率小數）：範圍含 0（下界 min(0, 最小值)、上界 max(0, 最大值)），兩端取整到步長；
 * 步長 5 個百分點，格數超過 SCATTER_MAX_INTERVALS 時放大成 5 的整數倍（lg 高 320 放得下 12 格；例如商品毛利率到 −300%、最高 50% 時每 30 個百分點一格）；刻度含 0。
 */
export function scatterAxis(values: readonly number[]): ProductsScatterAxis {
  const points = values.filter(value => Number.isFinite(value)).map(toPoints);
  const min = Math.min(0, ...points), max = Math.max(0, ...points);
  const span = Math.ceil(max / SCATTER_TICK_POINTS) * SCATTER_TICK_POINTS - Math.floor(min / SCATTER_TICK_POINTS) * SCATTER_TICK_POINTS;
  const step = SCATTER_TICK_POINTS * Math.max(1, Math.ceil(span / SCATTER_TICK_POINTS / SCATTER_MAX_INTERVALS));
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + 1e-9; tick += step) ticks.push(Number((tick / 100).toFixed(6)) || 0);
  return { domain: [lo / 100, hi / 100], ticks, labels: formatAxisPercent(ticks) };
}

export interface ScatterSectionModel {
  /** 區塊標準名（<details> summary、資料表 summary 與 caption）。 */
  section: string;
  title: string;
  subtitle: string;
  /** 兩個比率都有值的列（圖上的點、資料表的列；順序同 comparison.rows）。 */
  rows: ProductComparisonRow[];
  /** 任一比率為 null、沒畫的列數。 */
  missing: number;
  /** 圖上的點中商品毛利率 < 0 的列數。 */
  negative: number;
  /** 點 > PRODUCT_SCATTER_LIMIT：不畫圖，只留資料表。 */
  tooMany: boolean;
  /** 點（tooMany 時是空陣列）。 */
  points: ProductsScatterPoint[];
  x: ProductsScatterAxis;
  y: ProductsScatterAxis;
}

/** G24 的標題、副標、點與資料表列（純函式；rows 是 compareProducts 的 rows，呼叫端以 useMemo 保存）。 */
export function scatterSectionModel(rows: readonly ProductComparisonRow[], scope: ProductChartScope): ScatterSectionModel {
  const plotted = rows.filter(row => row.current.metrics.discount_rate.value !== null && row.current.metrics.gross_margin.value !== null);
  const missing = rows.length - plotted.length;
  const negative = plotted.filter(row => coordinate(row.current.metrics.gross_margin)! < 0).length;
  const tooMany = plotted.length > PRODUCT_SCATTER_LIMIT;
  const points = tooMany ? [] : plotted.map((row): ProductsScatterPoint => {
    const y = coordinate(row.current.metrics.gross_margin)!;
    return { key: scatterPointKey(row), x: coordinate(row.current.metrics.discount_rate)!, y, unfavorable: y < 0 };
  });
  const base = fill(copy.subtitle, { x: X, y: Y, period: scope.current, scope: scope.channels });
  return {
    section: fill(copy.summary, { x: X, y: Y }),
    title: fill(copy.title, { n: formatCount(negative, "L2"), metric: Y }),
    subtitle: missing > 0 ? fill(copy.nullNote, { subtitle: base, n: formatCount(missing, "L2") }) : base,
    rows: plotted, missing, negative, tooMany, points,
    x: scatterAxis(points.map(point => point.x)),
    y: scatterAxis(points.map(point => point.y)),
  };
}

/** 散佈圖的 chunk 載入失敗時（離線等）：圖區改寫「圖表無法顯示」（資料表照常），不讓 React.lazy 的錯誤往上拋到整頁。 */
function ScatterUnavailable() {
  return <p className="chart-frame-message">{labels.overview.chartFrame.error}</p>;
}
/** G24 的圖本體：只在這裡以 next/dynamic 載入（ssr: false）；下載中是同高的骨架。 */
const ProductsScatterChart = dynamic(() => import("../charts/products-scatter-lazy").catch(() => ({ default: ScatterUnavailable })), { ssr: false, loading: () => <div className="chart-frame-skeleton" /> });

/** 資料表欄（CHART_CATALOG G24）：本期折扣率、本期毛利率（L2 百分比 number-link）。 */
export const SCATTER_TABLE_COLUMNS: readonly ChartDataColumn<ScatterMetric>[] = SCATTER_METRICS.map(name => ({ key: name, label: `${labels.shell.periods.current}${metricDefinitions[name].shortLabel}`, unit: "rate", layer: "L2", data: name }));
/** 每格都是 number-link；evidence 在點擊時才組（C33 hasEvidence）。 */
const everyCellLinked = () => true;
/** 延後渲染時的資料表：summary 照常（同 chartDataTable 的「表格 · {title}」），內容下一拍才補上（同 G13、G14）。 */
const deferredTable = (title: string) => ({ summary: fill(labels.overview.page.dataTable, { title }), content: null });

export interface ProductScatterFrameProps {
  /** scatterSectionModel(...)（呼叫端以 useMemo 保存）。 */
  model: ScatterSectionModel;
  scope: ProductChartScope;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** <details> 是否展開過（展開過才渲染圖、下載散佈圖的 chunk）。 */
  opened: boolean;
  /** false 時資料表內容延後（商品頁的 useDeferredMount；預設 true）。 */
  ready?: boolean;
}

/** G24 的 ChartFrame（id products-scatter、testid chart-products-scatter、h3、lg）＋C33 資料表。沒有 hook，單元測試可以直接呼叫取得元素樹。 */
export function ProductScatterFrame({ model, scope, onEvidence, opened, ready = true }: ProductScatterFrameProps) {
  const { ctx } = scope;
  const onPoint = (key: string) => {
    const row = model.rows.find(item => scatterPointKey(item) === key);
    if (!row) return;
    track("chart_clicked");
    onEvidence(scatterEvidence(row, "gross_margin", ctx));
  };
  const dataTable = !ready ? deferredTable(model.section) : chartDataTable<ProductComparisonRow, ScatterMetric>({
    title: model.section,
    testId: PRODUCTS_SCATTER_TABLE_TESTID,
    caption: model.section,
    rowHeaderLabel: labels.products.pageV3.columns.product,
    rows: model.rows,
    rowKey: scatterPointKey,
    rowHeader: row => ({ label: productChartLabel(row, ctx.resolver) }),
    columns: SCATTER_TABLE_COLUMNS,
    valueOf: (row, column) => { const metric = row.current.metrics[column.data]; return { value: metric.value, reasonCodes: metric.reason_codes }; },
    evidenceOf: (row, column) => scatterEvidence(row, column.data, ctx),
    hasEvidence: everyCellLinked,
    onEvidence,
    cellAria: (row, column, text) => fill(comparison.evidenceAria, { channel: channelLabel(row.channel, ctx.resolver), sku: row.sku, period: "", label: metricDefinitions[column.data].shortLabel, value: text }),
    notes: [copy.limitNote],
    className: "products-scatter-table",
  });
  const empty = model.tooMany || model.rows.length === 0;
  const drawn = !empty && opened && ready;
  return <ChartFrame id="products-scatter" page="products" testId={PRODUCTS_SCATTER_TESTID} headingLevel={3} className="products-scatter" title={model.title} subtitle={model.subtitle} height="lg"
    state={empty ? "empty" : drawn ? undefined : "loading"} message={model.tooMany ? fill(copy.tooMany, { n: formatCount(PRODUCT_SCATTER_LIMIT, "L2") }) : undefined} dataTable={dataTable}>
    {drawn ? <ProductsScatterChart points={model.points} x={model.x} y={model.y} onPoint={onPoint} /> : null}
  </ChartFrame>;
}

export interface ProductScatterSectionProps {
  model: ScatterSectionModel;
  scope: ProductChartScope;
  onEvidence: (evidence: EvidenceSelection) => void;
  ready?: boolean;
}

/** 商品頁 G24：<details class="chart-more products-scatter-more">（收合）＋ProductScatterFrame；第一次展開才畫圖。 */
export function ProductScatterSection({ model, scope, onEvidence, ready = true }: ProductScatterSectionProps) {
  const [opened, setOpened] = useState(false);
  return <details className="chart-more products-scatter-more" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary>{model.section}</summary>
    <ProductScatterFrame model={model} scope={scope} onEvidence={onEvidence} opened={opened} ready={ready} />
  </details>;
}
