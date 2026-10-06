"use client";

import type { ReactNode } from "react";
import { chartHeights } from "@/application/chart-theme";
import { formatEmpty, formatMetric, type Layer } from "@/application/presentation";
import type { Metric, MetricName } from "@/domain/types";
import { labels } from "@/i18n";

// V3-4b C16 圖表框（PRD §9.4 C16、§9.5、§11.1「圖表」）：標題列（結論標題 16／600＋副標 13px＋右側圖例或其他）→ takeaway 列 → 固定高度的圖 → 收合的資料表。
// 圖的容器高度固定（--chart-h-sm 180px／--chart-h-lg 320px），載入、空、錯誤、有資料四種狀態都在同一個容器裡，切換時區塊不跳動（CLS）。
// 有資料時圖本身 aria-hidden；副標是區塊的 aria 描述；可點的長條一定有對應的表格 number-link（鍵盤經由表格）。

const copy = labels.overview.chartFrame;

export type ChartFrameState = "ready" | "loading" | "empty" | "error";
export type ChartFrameSize = keyof typeof chartHeights;

/** 圖例一項：12×2px 線段（顏色用 chartColors 的 var() 字串）＋文字；不用彩色圓點（§9.5）。 */
export interface ChartLegendItem { key: string; label: string; color: string }
/** takeaway 列的一格：dt 12px 第三色、dd 20px tabular 600；note 是 dd 內的 <small> 註記（例如週範圍）。 */
export interface ChartTakeaway { key: string; label: string; value: ReactNode; note?: ReactNode }

export interface ChartFrameProps {
  /** 區塊代號：h2#{id}-title、p#{id}-sub。 */
  id: string;
  testId?: string;
  title: ReactNode;
  /** 副標（L2，資料組成）；同時是區塊的 aria-describedby。 */
  subtitle: ReactNode;
  legend?: readonly ChartLegendItem[];
  /** 標題列右側的其他元素（例如分段按鈕）；與圖例並列。 */
  extra?: ReactNode;
  takeaways?: readonly ChartTakeaway[];
  /** 圖高：sm＝--chart-h-sm（總覽並列圖）、lg＝--chart-h-lg（瀑布、詳圖）。 */
  height?: ChartFrameSize;
  /** 不給時：有 children 為 ready，沒有為 empty。 */
  state?: ChartFrameState;
  /** 空與錯誤狀態的文字；不給時用「無資料」／圖表無法顯示。 */
  message?: ReactNode;
  /** 圖下方、資料表之前的內容（註記、緊湊表）。 */
  after?: ReactNode;
  /** 無障礙替代：<details class="data-alternative">，summary 與內容由呼叫端給。 */
  dataTable?: { summary: ReactNode; content: ReactNode };
  className?: string;
  children?: ReactNode;
}

export function ChartLegend({ items }: { items: readonly ChartLegendItem[] }) {
  return <div className="legend">{items.map(item => <span key={item.key}><i aria-hidden="true" style={{ background: item.color }} />{item.label}</span>)}</div>;
}

export function ChartFrame({ id, testId, title, subtitle, legend, extra, takeaways, height = "sm", state, message, after, dataTable, className, children }: ChartFrameProps) {
  const resolved: ChartFrameState = state ?? (children === undefined || children === null || children === false ? "empty" : "ready");
  const hasLegend = legend !== undefined && legend.length > 0;
  return <section className={`panel chart-section${className ? ` ${className}` : ""}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-sub`} aria-busy={resolved === "loading" ? true : undefined} data-testid={testId}>
    <div className="sec-head">
      <div className="sec-title"><h2 id={`${id}-title`}>{title}</h2><p className="sub" id={`${id}-sub`}>{subtitle}</p></div>
      {(hasLegend || extra) && <div className="sec-end">{hasLegend && <ChartLegend items={legend} />}{extra}</div>}
    </div>
    {takeaways !== undefined && takeaways.length > 0 && <dl className="takeaways">{takeaways.map(item => <div className="takeaway" key={item.key}><dt>{item.label}</dt><dd>{item.value}{item.note !== undefined && item.note !== null && <small>{item.note}</small>}</dd></div>)}</dl>}
    <div className={`chart-frame ${height}`} style={{ height: chartHeights[height] }} aria-hidden={resolved === "ready" || resolved === "loading" ? true : undefined} data-state={resolved}>
      {resolved === "ready" ? children
        : resolved === "loading" ? <div className="chart-frame-skeleton" />
          : <p className="chart-frame-message">{message ?? (resolved === "error" ? copy.error : copy.noData)}</p>}
    </div>
    {resolved === "loading" && <p className="sr-only" role="status">{copy.loading}</p>}
    {after}
    {dataTable && <details className="data-alternative"><summary>{dataTable.summary}</summary>{dataTable.content}</details>}
  </section>;
}

/** 金額與比率的顯示字（與總覽既有的 text() 相同）：空值依原因碼寫「資料待補」或「不適用」，其餘交給 formatMetric。 */
export function metricText(name: MetricName, metric: Metric, layer: Layer): string {
  if (metric.value === null) return formatEmpty(metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "notApplicable");
  return formatMetric(name, metric, layer);
}

/** 圖形座標：只用來畫圖（Number() 近似值）；顯示與抽屜一律用 domain 的精確字串。 */
export function coordinate(metric: Metric): number | null {
  return metric.value === null ? null : Number(metric.value);
}

/**
 * 數值軸的範圍與刻度（只是圖形座標）：範圍一定含 0（長條從 0 開始），刻度是「1、2、2.5、5 × 10ⁿ」整齊步長的倍數，含 0，約 count 個。
 * 範圍不向外延伸，長條可以用滿寬度；沒有資料時回傳 [0, 1] 與 [0]。
 */
export function axisTicks(values: readonly (number | null)[], count = 4): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  if (max - min <= 0) return { domain: [0, 1], ticks: [0] };
  const raw = (max - min) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + step * 1e-9; tick += step) ticks.push(Math.abs(tick) < step * 1e-9 ? 0 : tick);
  return { domain: [min, max], ticks };
}
