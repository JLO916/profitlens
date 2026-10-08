"use client";

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { track } from "@/application/analytics";
import { chartHeights } from "@/application/chart-theme";
import { formatEmpty, formatMetric, type Layer } from "@/application/presentation";
import type { Metric, MetricName } from "@/domain/types";
import { labels } from "@/i18n";

// V3-4b C16 圖表框（PRD §9.4 C16、§9.5、§11.1「圖表」）：標題列（結論標題 16／600＋副標 13px＋右側圖例或其他）→ takeaway 列 → 固定高度的圖 → 收合的資料表。
// 圖的容器高度固定（--chart-h-sm 180px／--chart-h-lg 320px），載入、空、錯誤、有資料四種狀態都在同一個容器裡，切換時區塊不跳動（CLS）。
// 有資料時圖本身 aria-hidden；副標是區塊的 aria 描述；可點的長條一定有對應的表格 number-link（鍵盤經由表格）。
// V4-1 代理 A（PRD §6.1；CHART_CATALOG §1.1）：擴充 aside、unitNote、frameClassName、legend[].shape、mode（型別）、page、scrollLabel，
// 資料表 <details> 展開時記 track("chart_table_opened")（D-V4-14）。沒有給新 props 時輸出與 V3 逐字相同（向下相容）。

const copy = labels.overview.chartFrame;

export type ChartFrameState = "ready" | "loading" | "empty" | "error";
export type ChartFrameSize = keyof typeof chartHeights;

/**
 * V4-1 圖例記號（PRD §6.1、§7.1；X32 不得有實心圓點或方塊）：line＝12×2 線段（預設）、dash＝12×2 虛線段、tick＝2×12 目標刻度、
 * ring＝空心圓、rect＝空心矩形（只給圖內也用同形空心記號的圖，例如 G10 的剩餘段）。
 */
export type ChartLegendShape = "line" | "dash" | "tick" | "ring" | "rect";
/**
 * 圖例一項：12×2px 線段（顏色用 chartColors 的 var() 字串）＋文字；不用彩色圓點（§9.5）。
 * V3-9b F8：dash＝虛線段的 stroke-dasharray（與折線相同，例如去年同期 --chart-yoy；12px 的 CSS 虛線框在瀏覽器會畫成實線，所以用 12×2 的 SVG 線段）；
 * note＝線段文字後的第三色短註（例如「無資料」）；testId 給需要定位的項目。
 * V4-1 shape：沒給時沿用 V3（有 dash 是虛線段，否則線段）；shape="dash" 沒給 dash 時用 4 3。
 */
export interface ChartLegendItem { key: string; label: string; color: string; dash?: string; note?: string; testId?: string; shape?: ChartLegendShape }
/** V4-1 圖表框模式（PRD §6.1）：chart＝圖（預設，固定高容器 aria-hidden）；table＝熱表（G11、G21，V4-3b 起），固定高容器不設 aria-hidden、帶 data-mode="table"。 */
export type ChartFrameMode = "chart" | "table";
/** takeaway 列的一格：dt 12px 第三色、dd 20px tabular 600；note 是 dd 內的 <small> 註記（例如週範圍）。 */
export interface ChartTakeaway { key: string; label: string; value: ReactNode; note?: ReactNode }

export interface ChartFrameProps {
  /** 區塊代號：h2#{id}-title、p#{id}-sub。 */
  id: string;
  testId?: string;
  /** V4-1（D-V4-25）：頁面代號（overview、diagnosis…）；沒給 testId 時區塊 testid 是 chart-{page}-{id}。既有五張圖繼續傳明確的 testId。 */
  page?: string;
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
  /** 無障礙替代：<details class="data-alternative">，summary 與內容由呼叫端給；V4-1 起展開時記 track("chart_table_opened")（只記事件名）。 */
  dataTable?: { summary: ReactNode; content: ReactNode };
  className?: string;
  children?: ReactNode;
  /** V4-1：標題列右側的單位註記（span.unit-note，排在圖例與 extra 之前），承接 V3 bridge-section 的 .unit-note。 */
  unitNote?: string;
  /**
   * V4-1：圖旁欄（例如 G1 的橋接表，外層由呼叫端沿用 .bridge-table-wrap）。輸出 div.frame-grid.has-aside > div.frame-aside（在前）＋div.frame-main（固定高容器）：
   * DOM 順序旁欄在前、圖在後；≥ 1024px 以 grid-template-areas 把旁欄放回右欄（7fr／5fr，沿用 V3 .bridge-grid 的比例與斷點），≤ 1023px 單欄、旁欄在上（不用 CSS order）。
   * 旁欄在 aria-hidden 容器之外。
   */
  aside?: ReactNode;
  /** V4-1：加在固定高容器上的 class，例如 G1、G2 傳 waterfall，容器成為 .chart-frame.lg.waterfall（水平捲動）。 */
  frameClassName?: string;
  /**
   * V4-1：可水平捲動的圖（G1、G2 瀑布）。給了時固定高容器不帶 aria-hidden（圖自己 aria-hidden，例如 WaterfallSvg 的 svg），
   * 改為 role="region"＋aria-label＝本字串；內容比容器寬（390、768）時才加 tabIndex=0，鍵盤可停留並用方向鍵捲動，寬螢幕不多一個停留點。
   */
  scrollLabel?: string;
  /** V4-1 只定型別（V4-3b 的 G11、G21 第一次使用）：table 時固定高容器不設 aria-hidden，並帶 data-mode="table"。 */
  mode?: ChartFrameMode;
}

/** shape="dash" 沒給 dash 時的虛線樣式（與去年同期線相同）。 */
const LEGEND_DASH = "4 3";

/** 圖例記號：沒給 shape 時與 V3 逐字相同（<i> 線段或 svg.legend-dash）；新形狀都是 svg.legend-mark（空心或線，沒有實心點與方塊）。 */
function LegendMark({ item }: { item: ChartLegendItem }) {
  const shape: ChartLegendShape = item.shape ?? (item.dash === undefined ? "line" : "dash");
  if (shape === "dash") return <svg className="legend-dash" width={12} height={2} viewBox="0 0 12 2" aria-hidden="true" focusable="false"><line x1={0} y1={1} x2={12} y2={1} stroke={item.color} strokeWidth={2} strokeDasharray={item.dash ?? LEGEND_DASH} /></svg>;
  if (shape === "tick") return <svg className="legend-mark" data-shape="tick" width={2} height={12} viewBox="0 0 2 12" aria-hidden="true" focusable="false"><line x1={1} y1={0} x2={1} y2={12} stroke={item.color} strokeWidth={2} /></svg>;
  if (shape === "ring") return <svg className="legend-mark" data-shape="ring" width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" focusable="false"><circle cx={5} cy={5} r={4} fill="none" stroke={item.color} strokeWidth={1.5} /></svg>;
  if (shape === "rect") return <svg className="legend-mark" data-shape="rect" width={12} height={8} viewBox="0 0 12 8" aria-hidden="true" focusable="false"><rect x={0.5} y={0.5} width={11} height={7} fill="none" stroke={item.color} strokeWidth={1} /></svg>;
  return <i aria-hidden="true" style={{ background: item.color }} />;
}

export function ChartLegend({ items }: { items: readonly ChartLegendItem[] }) {
  return <div className="legend">{items.map(item => <span key={item.key} data-testid={item.testId}><LegendMark item={item} />{item.label}{item.note !== undefined && <small>{item.note}</small>}</span>)}</div>;
}

/** 資料表 <details> 展開（不含收合）時記事件名 chart_table_opened（D-V4-14；不帶圖名或任何資料）。 */
export const onChartTableToggle = (event: SyntheticEvent<HTMLDetailsElement>) => { if (event.currentTarget.open) track("chart_table_opened"); };

/** 可水平捲動的圖區何時是 Tab 停留點：內容寬（scrollWidth）超過可視寬（clientWidth）1px 以上時 0，否則不加 tabIndex。 */
export function scrollFrameTabIndex(scrollWidth: number, clientWidth: number): 0 | undefined {
  return scrollWidth - clientWidth > 1 ? 0 : undefined;
}

/**
 * V4-1：可水平捲動的固定高容器（G1、G2 瀑布；06_BATCHES V4-1「V4-0a 量到、併入本批的修正」）。
 * V3 的瀑布外框帶 aria-hidden，390 寬時成為捲動容器，Chromium 讓它可用 Tab 停留，停留點落在 aria-hidden 內。這裡外框不帶 aria-hidden
 * （圖自己 aria-hidden），改為 role=region＋aria-label；內容比容器寬時才加 tabIndex=0：鍵盤可停留、用方向鍵捲動，
 * axe 的 scrollable-region-focusable 也看得到（它不認瀏覽器隱含的可聚焦捲動容器）；寬螢幕不捲動時不多一個停留點。SSR 不帶 tabIndex。
 */
function ScrollFrame({ className, size, label, state, children }: { className: string; size: ChartFrameSize; label: string; state: ChartFrameState; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tabIndex, setTabIndex] = useState<0 | undefined>(undefined);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const check = () => setTabIndex(scrollFrameTabIndex(node.scrollWidth, node.clientWidth));
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [state]);
  return <div ref={ref} className={`chart-frame ${className}`} style={{ height: chartHeights[size] }} role="region" aria-label={label} tabIndex={tabIndex} data-state={state}>{children}</div>;
}

export function ChartFrame({ id, testId, page, title, subtitle, legend, extra, takeaways, height = "sm", state, message, after, dataTable, className, children, unitNote, aside, frameClassName, scrollLabel, mode }: ChartFrameProps) {
  const resolved: ChartFrameState = state ?? (children === undefined || children === null || children === false ? "empty" : "ready");
  const hasLegend = legend !== undefined && legend.length > 0;
  const hasUnitNote = unitNote !== undefined && unitNote !== "";
  const blockTestId = testId ?? (page ? `chart-${page}-${id}` : undefined);
  const frameClass = `${height}${frameClassName ? ` ${frameClassName}` : ""}`;
  const body = resolved === "ready" ? children
    : resolved === "loading" ? <div className="chart-frame-skeleton" />
      : <p className="chart-frame-message">{message ?? (resolved === "error" ? copy.error : copy.noData)}</p>;
  const frame = mode === "table"
    ? <div className={`chart-frame ${frameClass}`} style={{ height: chartHeights[height] }} data-state={resolved} data-mode="table">{body}</div>
    : scrollLabel !== undefined
      ? <ScrollFrame className={frameClass} size={height} label={scrollLabel} state={resolved}>{body}</ScrollFrame>
      : <div className={`chart-frame ${frameClass}`} style={{ height: chartHeights[height] }} aria-hidden={resolved === "ready" || resolved === "loading" ? true : undefined} data-state={resolved}>{body}</div>;
  return <section className={`panel chart-section${className ? ` ${className}` : ""}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-sub`} aria-busy={resolved === "loading" ? true : undefined} data-testid={blockTestId}>
    <div className="sec-head">
      <div className="sec-title"><h2 id={`${id}-title`}>{title}</h2><p className="sub" id={`${id}-sub`}>{subtitle}</p></div>
      {(hasUnitNote || hasLegend || extra) && <div className="sec-end">{hasUnitNote && <span className="unit-note">{unitNote}</span>}{hasLegend && <ChartLegend items={legend} />}{extra}</div>}
    </div>
    {takeaways !== undefined && takeaways.length > 0 && <dl className="takeaways">{takeaways.map(item => <div className="takeaway" key={item.key}><dt>{item.label}</dt><dd>{item.value}{item.note !== undefined && item.note !== null && <small>{item.note}</small>}</dd></div>)}</dl>}
    {aside !== undefined && aside !== null && aside !== false
      ? <div className="frame-grid has-aside"><div className="frame-aside">{aside}</div><div className="frame-main">{frame}</div></div>
      : frame}
    {resolved === "loading" && <p className="sr-only" role="status">{copy.loading}</p>}
    {after}
    {dataTable && <details className="data-alternative" onToggle={onChartTableToggle}><summary>{dataTable.summary}</summary>{dataTable.content}</details>}
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
