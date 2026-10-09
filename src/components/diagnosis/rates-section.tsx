"use client";

import { useMemo } from "react";
import { track } from "@/application/analytics";
import { isFullWeek } from "@/application/chart-takeaways";
import { chartColors } from "@/application/chart-theme";
import { formatAxisPercent } from "@/application/copy";
import { formatPeriodL1, formatRateL1, metricDefinitions } from "@/application/presentation";
import type { WeeklyRow, WorkspaceSnapshot } from "@/application/workspace";
import type { MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { multiplesFrameStyle, rateAxis, SmallMultiples, type SmallMultiplePanel, type SmallMultipleSeries } from "../charts/small-multiples";
import type { EvidenceSelection } from "../evidence-drawer";
import { ChartFrame, coordinate, type ChartLegendItem } from "../overview/charts/chart-frame";
import { weekEvidence, YOY_LINE } from "../overview/charts/trend-section";
import { useDeferredMount } from "../charts/deferred-mount";

// V4-3b 代理 B：G12 五項比率每週走勢（PRD §4.1–§4.7 G12、§5.2 第 5 列、§7.2、§7.4 X40；CHART_CATALOG G12；H5 設計稿 diagnosis.html）。
// 健檢頁 G11 之後、通路寬表之前的 <details class="chart-more">（summary「五項比率走勢」），收合時保持掛載（M1）；在 <details> 內，不算主層獨立圖（CL-9、X37）。
// 資料（A 級，只挑選既有值）：snapshot.weeks 的上期、本期與 snapshot.yoy.weeks（ready 時）的 discount_rate、refund_ratio、fulfillment_burden、marketing_burden、gross_margin，
// 都是 createSnapshot 已算好的 domain 比率（contribution-v1），不另算、不加版本常數。
// 標題是區塊名「五項比率每週走勢」，不寫結論句、不做跨比率排名：五項比率的分母不同（docs/METRICS.md），百分點差不能互比（PRD §4.2）。
// 圖：C26 小倍數，每個比率一張子圖、各自的 Y（同一比率的本期、上期、去年同期共用，rateAxis）；本期與上期（與去年同期）以第幾週對齊（與趨勢圖相同：
// 去年同期第 i 週對齊本期第 i 週）；本期 chartColors.current 2px、上期 chartColors.previous 1.5px、去年同期 chartColors.yoy 虛線 4 3；線尾標本期 L1 百分比。
// 比率可畫未滿 7 天的週（X40 只限金額與件數），資料表的起訖日欄註明「未滿 7 天」並在表後加一句說明。
// 點與資料表格呼叫同一個 builder：weekEvidence（trend-section.tsx，帶 filter.week；比率由抽屜既有 RATIOS 畫分子分母）；點擊記 chart_clicked（D-V4-14）。

const copy = labels.diagnosis.chartsV4.rates;
const frameCopy = labels.overview.chartFrame;
const yoyCopy = labels.overview.trendYoyV3;

/** 五項比率（PRD §4.3 G12；順序同設計稿）。 */
export const RATE_METRICS = ["discount_rate", "refund_ratio", "fulfillment_burden", "marketing_burden", "gross_margin"] as const satisfies readonly MetricName[];
export type RateMetric = typeof RATE_METRICS[number];
/** 線：上期、去年同期、本期（畫的順序就是疊放順序，本期在最上層）。 */
export type RateSeriesKey = "previous" | "yoy" | "current";

export interface RatesModel {
  /** 各系列的週，以第幾週對齊（去年同期只取到本期的週數，與趨勢圖相同）。 */
  weeks: Record<RateSeriesKey, WeeklyRow[]>;
  yoyReady: boolean;
  /** 位置數＝max(本期週數, 上期週數)；X 標「1」到「n」。 */
  xLabels: string[];
  /** 資料表的列：上期各週、本期各週、去年同期各週（與圖上畫的點一一對應）。 */
  rows: WeeklyRow[];
  panels: SmallMultiplePanel[];
  subtitle: string;
  caption: string;
  /** 有沒有未滿 7 天的週（資料表後加說明）。 */
  incomplete: boolean;
}

const seriesColor: Record<RateSeriesKey, string> = { previous: chartColors.previous, yoy: chartColors.yoy, current: chartColors.current };
const seriesWidth: Record<RateSeriesKey, number> = { previous: 1.5, yoy: YOY_LINE.strokeWidth, current: 2 };

/** G12 的資料與文字（純函式，tests/charts-diagnosis-g12.test.tsx）。值一律是 domain 字串；座標用 coordinate()（Number 近似值，只用來畫圖）。 */
export function ratesModel(snapshot: Pick<WorkspaceSnapshot, "report" | "weeks" | "yoy" | "data_as_of">): RatesModel {
  const current = snapshot.weeks.filter(week => week.period === "current");
  const previous = snapshot.weeks.filter(week => week.period === "previous");
  const yoyReady = snapshot.yoy?.status === "ready";
  const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy.weeks.slice(0, current.length) : [];
  const weeks: Record<RateSeriesKey, WeeklyRow[]> = { previous, yoy, current };
  const slots = Math.max(current.length, previous.length);
  const xLabels = Array.from({ length: slots }, (_, index) => String(index + 1));
  const order: RateSeriesKey[] = yoyReady ? ["previous", "yoy", "current"] : ["previous", "current"];
  const panels = RATE_METRICS.map((rate): SmallMultiplePanel => {
    const series = order.map((key): SmallMultipleSeries => {
      const list = weeks[key];
      const lastCurrent = key === "current" ? [...list].reverse().find(week => week.metrics[rate].value !== null) : undefined;
      return {
        key, color: seriesColor[key], strokeWidth: seriesWidth[key], dash: key === "yoy" ? YOY_LINE.strokeDasharray : undefined,
        values: Array.from({ length: slots }, (_, index) => list[index] ? coordinate(list[index].metrics[rate]) : null),
        keys: Array.from({ length: slots }, (_, index) => list[index]?.start ?? null),
        lastDot: key === "current",
        lastLabel: lastCurrent ? formatRateL1(lastCurrent.metrics[rate].value) : undefined,
      };
    });
    const axis = rateAxis(series.flatMap(line => line.values));
    return { key: rate, title: metricDefinitions[rate].label, axis: { domain: axis.domain, ticks: axis.ticks, labels: formatAxisPercent(axis.ticks) }, series };
  });
  const { period } = snapshot.report.current;
  const range = formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of });
  const subtitle = current.length === previous.length
    ? fill(copy.subtitle, { period: range, n: current.length })
    : fill(copy.subtitleUneven, { period: range, current: current.length, previous: previous.length });
  const rows = [...previous, ...current, ...yoy];
  return { weeks, yoyReady, xLabels, rows, panels, subtitle, caption: fill(copy.caption, { title: copy.title, period: range }), incomplete: rows.some(week => !isFullWeek(week)) };
}

type RatesColumn = { kind: "range" } | { kind: "rate"; rate: RateMetric };
/** 資料表欄（CHART_CATALOG G12「週（週名、起訖）× 5 比率」）：起訖日、五項比率（L2 百分比 number-link）；列名欄是週名。 */
export const RATES_TABLE_COLUMNS: readonly ChartDataColumn<RatesColumn>[] = [
  { key: "range", label: labels.overview.page.colRange, unit: "text", data: { kind: "range" } },
  ...RATE_METRICS.map((rate): ChartDataColumn<RatesColumn> => ({ key: rate, label: metricDefinitions[rate].label, unit: "rate", layer: "L2", data: { kind: "rate", rate } })),
];
/** 資料表格的值（純函式）：起訖日（未滿 7 天的週註明）、比率取自該週的 domain 值。 */
export function ratesTableCell(week: WeeklyRow, column: ChartDataColumn<RatesColumn>, anchor?: string): ChartDataCell {
  const spec = column.data;
  if (spec.kind === "range") {
    const range = formatPeriodL1(week.start, week.end, { days: false, anchor });
    return { value: isFullWeek(week) ? range : fill(copy.incompleteRange, { range }) };
  }
  const metric = week.metrics[spec.rate];
  return { value: metric.value, reasonCodes: metric.reason_codes };
}
/** 點與資料表格的「計算與來源」（同一個 builder）：該週該比率，帶 filter.week；範圍是快照的通路。 */
export function ratesEvidence(snapshot: Pick<WorkspaceSnapshot, "report">, week: WeeklyRow, rate: RateMetric): EvidenceSelection {
  return weekEvidence(week, rate, snapshot.report.scope.channels);
}

export interface RatesSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/** 健檢頁 G12：<details class="chart-more">＋ChartFrame（id rates、testid chart-diagnosis-rates）＋C26 SmallMultiples＋C33 資料表。 */
export function RatesSection({ snapshot, onEvidence }: RatesSectionProps) {
  const model = useMemo(() => ratesModel(snapshot), [snapshot]);
  // V4-3b：小倍數延後一拍渲染（390 切到通路健檢的 TBT；<details> 收合時區塊與資料表照常掛載），之前由同高的 loading 骨架佔位；SSR 與單元測試不延後。
  const ready = useDeferredMount();
  const anchor = snapshot.data_as_of;
  const legend: ChartLegendItem[] = [
    { key: "current", label: frameCopy.legend.current, color: chartColors.current },
    { key: "previous", label: frameCopy.legend.previous, color: chartColors.previous },
    { key: "yoy", label: yoyCopy.legend, color: chartColors.yoy, shape: "dash", dash: YOY_LINE.strokeDasharray, note: model.yoyReady ? undefined : frameCopy.noData },
  ];
  const onPoint = (panelKey: string, seriesKey: string, index: number) => {
    const week = model.weeks[seriesKey as RateSeriesKey]?.[index];
    const rate = RATE_METRICS.find(item => item === panelKey);
    if (!week || !rate) return;
    track("chart_clicked");
    onEvidence(ratesEvidence(snapshot, week, rate));
  };
  const dataTable = chartDataTable<WeeklyRow, RatesColumn>({
    title: copy.title,
    testId: "chart-diagnosis-rates-table",
    caption: model.caption,
    rowHeaderLabel: labels.overview.page.colPeriod,
    rows: model.rows,
    rowKey: week => `${week.period}-${week.start}`,
    rowHeader: week => ({ label: week.label }),
    columns: RATES_TABLE_COLUMNS,
    valueOf: (week, column) => ratesTableCell(week, column, anchor),
    evidenceOf: (week, column) => column.data.kind === "rate" ? ratesEvidence(snapshot, week, column.data.rate) : null,
    onEvidence,
    cellAria: (week, column, text) => fill(copy.cellAria, { week: week.label, metric: column.label, value: text }),
    notes: model.incomplete ? [copy.incompleteNote] : [],
    className: "rates-data-table",
  });
  return <details className="chart-more rates-more" style={multiplesFrameStyle(RATE_METRICS.length)}>
    <summary>{copy.summary}</summary>
    <ChartFrame id="rates" page="diagnosis" className="rates-section" title={copy.title} subtitle={model.subtitle} legend={legend} height="sm" frameClassName="multiples"
      state={model.rows.length === 0 ? "empty" : ready ? undefined : "loading"} dataTable={dataTable}>
      {model.rows.length === 0 || !ready ? null : <SmallMultiples panels={model.panels} xLabels={model.xLabels} onPoint={onPoint} />}
    </ChartFrame>
  </details>;
}
