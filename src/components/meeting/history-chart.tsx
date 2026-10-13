"use client";

import { useMemo } from "react";
import { meetingSeries, type MeetingSeries, type MeetingSeriesBreak, type MeetingSeriesPoint } from "@/application/chart-meeting";
import { chartColors } from "@/application/chart-theme";
import type { Meeting } from "@/application/meeting";
import { formatAmountL1, formatAxisWan, formatPeriodL1, metricDefinitions } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { useDeferredMount } from "../charts/deferred-mount";
import { amountAxis, multiplesFrameStyle, SmallMultiples, type SmallMultipleGap, type SmallMultiplePanel } from "../charts/small-multiples";
import { ChartFrame } from "../overview/charts/chart-frame";

// V4-6 代理 A：G19 會議歷史小倍數（PRD §4.1–§4.7 G19、§5.6、§7.1、§8.7；CHART_CATALOG G19；06_BATCHES V4-6）。
// 位置：會議紀錄頁 section.panel.meeting-history 內、historyNote 之後、歷史清單（meeting-history-list）之前；沒有任何已結束的會議時接在 v3 的空狀態區塊（meeting-history-empty）之後，
// 一樣是等高空狀態（V4-6 整合，審查 A-4：06「歷史 < 2 筆等高空狀態」含 0 筆；兩句互補：v3 區塊說清單、本圖說走勢要兩次以上）。
// ChartFrame variant="inline"（已在 .panel 內，不套 panel，X8）、headingLevel 3（h2#meeting-history-title 之下）、height sm、frameClassName="multiples"；
// 外層 div 以 multiplesFrameStyle(2) 給 ≤ 767px 的框高（chartHeights.sm × 2，單欄兩張；載入與有資料同高）；V4-8b（D-V4-63＝B）起空狀態在 ≤ 767px 改用 sm 高度（globals.css「V4-8b B」）。投影隱藏：整個 .meeting-history 在投影中不顯示（globals.css 投影段）。
// 資料：meetingSeries（meeting-series-v1，src/application/chart-meeting.ts）——會議順序、本期相同的只留最近結束的一次、斷段位置與原因；值是凍結的 agenda.kpis[].current，逐字沿用。
// 圖：C26 小倍數兩張（淨營收、扣廣告後貢獻，小標取 metricDefinitions），各自的 Y（amountAxis：整數萬含 0，刻度文字 formatAxisWan）；X 是會議順序，
// 刻度標資料本期（M/D–M/D，fitXLabels 放不下時只留頭尾）；不同段之間插入一個空位置（null 斷線，不連線），間隙標「不同資料集」或「期間不同」。
// 線與點一律 chartColors.total（歷史是凍結值、不是本期資料，強調色只給本期，也避免虧損的點被綠色讀成有利；不用 chartColors.current）；
// 每點 2px 小實心點，最後一點（最近一次會議）3px 實心並標 L1 值。點不可點（PRD §8.7 例外：凍結值，v3 就不是 number-link），沒有熱區、不記 chart_clicked；
// 鍵盤經資料表（C33，純文字 L2）：會議日期、會議名稱、資料本期、淨營收（元）、扣廣告後貢獻（元）、與前一次可比。
// hooks 只在本元件與 C26 內（useMemo、useDeferredMount）：tests/meeting-page.test.tsx 的 hooks harness 直接呼叫 MeetingHistory，不會呼叫到這裡。

const copy = labels.meeting.chartsV4.history;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });
const CONTRIBUTION = metricDefinitions.contribution_after_marketing.label;

export const MEETING_HISTORY_TESTID = "chart-meeting-history";
export const MEETING_HISTORY_TABLE_TESTID = "chart-meeting-history-table";
/** 兩張小倍數：淨營收、扣廣告後貢獻（同 agenda.kpis 的順序）。 */
export const MEETING_HISTORY_METRICS = ["net_revenue", "contribution_after_marketing"] as const;
type HistoryMetric = typeof MEETING_HISTORY_METRICS[number];
/** 每張子圖的系列 key（只有一條線）。 */
export const MEETING_HISTORY_SERIES = "history";

/** 圖形座標（Number 近似值，只用來畫圖）；顯示一律用凍結的精確字串。 */
const coordinateOf = (value: string | null) => value === null ? null : Number(value);
const breakLabel = (reason: MeetingSeriesBreak) => reason === "dataset" ? copy.differentDataset : reason === "channels" ? copy.differentChannels : copy.differentPeriod;

export interface MeetingHistoryModel {
  series: MeetingSeries;
  /** 位置：每個點一個位置，不同段之間多一個空位置（gap）。 */
  slots: (MeetingSeriesPoint | null)[];
  xLabels: string[];
  gaps: SmallMultipleGap[];
  panels: SmallMultiplePanel[];
  title: string;
  subtitle: string;
  /** 資料表「資料本期」的年份基準（最近一次會議的本期迄日：與它不同年的期間寫年份）。 */
  anchor: string | undefined;
}

/** G19 的資料與文字（純函式）。 */
export function meetingHistoryModel(history: readonly Meeting[]): MeetingHistoryModel {
  const series = meetingSeries(history);
  const { points } = series;
  const slots: (MeetingSeriesPoint | null)[] = [];
  const gaps: SmallMultipleGap[] = [];
  for (const point of points) {
    if (point.break !== null) { gaps.push({ index: slots.length, label: breakLabel(point.break) }); slots.push(null); }
    slots.push(point);
  }
  // 刻度標資料本期（M/D–M/D；期間跨年時兩端寫年份）；空位置不標。
  const xLabels = slots.map(point => point === null ? "" : formatPeriodL1(point.period.start, point.period.end, { days: false, anchor: point.period.start }));
  const last = points.at(-1);
  const panels = MEETING_HISTORY_METRICS.map((metric): SmallMultiplePanel => {
    const values = slots.map(point => point === null ? null : coordinateOf(point[metric]));
    const axis = amountAxis(values);
    const lastValue = [...points].reverse().find(point => point[metric] !== null)?.[metric] ?? null;
    return {
      key: metric, title: metricDefinitions[metric].label,
      axis: { domain: axis.domain, ticks: axis.ticks, labels: formatAxisWan(axis.ticks, axis.step) },
      series: [{
        key: MEETING_HISTORY_SERIES, color: chartColors.total, strokeWidth: 1.5, values, keys: slots.map(point => point?.id ?? null),
        dots: true, lastDot: true, lastLabel: lastValue === null ? undefined : formatAmountL1(lastValue),
      }],
    };
  });
  // 標題只取最新一段可比的會議；那一段只有 1 次（或整張圖是空狀態）時用區塊名。
  // V4-6 整合（審查 R1-V46-S4）：該段第一次或最後一次的扣廣告後貢獻是未知（凍結值為 null，例如缺廣告日）時也用區塊名，不寫「從 資料待補 到 …」。
  const latest = last === undefined ? [] : points.filter(point => point.segment === last.segment);
  const from = latest[0]?.contribution_after_marketing ?? null, to = latest.at(-1)?.contribution_after_marketing ?? null;
  const title = latest.length >= 2 && from !== null && to !== null
    ? fill(copy.title, { n: latest.length, metric: CONTRIBUTION, a: formatAmountL1(from), b: formatAmountL1(to) })
    : copy.section;
  const base = fill(copy.subtitle, { n: points.length });
  const subtitle = points.length < 2 ? copy.subtitleEmpty : gaps.length > 0 ? fill(copy.subtitleBreaks, { subtitle: base }) : base;
  return { series, slots, xLabels, gaps, panels, title, subtitle, anchor: last?.period.end };
}

type HistoryColumn = { kind: "name" } | { kind: "period" } | { kind: "metric"; metric: HistoryMetric } | { kind: "comparable" };
/** 資料表欄（CHART_CATALOG G19「資料表」）：列名欄是會議日期。 */
export const MEETING_HISTORY_COLUMNS: readonly ChartDataColumn<HistoryColumn>[] = [
  { key: "name", label: copy.columns.name, unit: "text", data: { kind: "name" } },
  { key: "period", label: copy.columns.period, unit: "text", data: { kind: "period" } },
  ...MEETING_HISTORY_METRICS.map((metric): ChartDataColumn<HistoryColumn> => ({ key: metric, label: yuanColumn(metricDefinitions[metric].label), unit: "money", layer: "L2", data: { kind: "metric", metric } })),
  { key: "comparable", label: copy.columns.comparable, unit: "text", data: { kind: "comparable" } },
];
/** 資料表格（純函式）：金額是凍結的精確字串（L2 整數元）；與前一次可比＝第一次／是／否＋原因。 */
export function meetingHistoryCell(point: MeetingSeriesPoint, column: ChartDataColumn<HistoryColumn>, first: boolean, anchor?: string): ChartDataCell {
  const spec = column.data;
  if (spec.kind === "name") return { value: point.name };
  if (spec.kind === "period") return { value: formatPeriodL1(point.period.start, point.period.end, { days: false, anchor }) };
  if (spec.kind === "metric") return { value: point[spec.metric] };
  return { value: first ? copy.comparable.first : point.break === null ? copy.comparable.yes : fill(copy.comparable.no, { reason: breakLabel(point.break) }) };
}
/** 資料表格都不是 number-link（PRD §8.7 例外：會議紀錄是凍結值）。 */
const noEvidence = () => null;

/** 會議頁 G19：外層 div（≤ 767px 框高變數）＋ChartFrame（id meeting-history-chart、testid chart-meeting-history、inline、h3、sm、multiples）＋C26＋C33。 */
export function MeetingHistoryChart({ history }: { history: readonly Meeting[] }) {
  const model = useMemo(() => meetingHistoryModel(history), [history]);
  // 小倍數延後一拍渲染（切到會議紀錄的 TBT；與 G12 相同），之前由同高的 loading 骨架佔位；SSR 與單元測試不延後。
  const ready = useDeferredMount();
  const { points } = model.series;
  const empty = points.length < 2;
  const firstId = points[0]?.id;
  // V4-6 整合（審查 R1-V46-S2、R2-V46-A11Y-1、R3-V46-G2）：空狀態時表是 0 列，只放 tableEmpty 說明為什麼沒有列；「只列最近結束的一次」（omittedNote）在 0 列時不成立，不放。
  const notes = empty ? [copy.tableEmpty]
    : [...(model.gaps.length > 0 ? [copy.breakNote] : []), ...(model.series.omitted > 0 ? [fill(copy.omittedNote, { n: model.series.omitted })] : [])];
  const dataTable = chartDataTable<MeetingSeriesPoint, HistoryColumn>({
    title: copy.section,
    testId: MEETING_HISTORY_TABLE_TESTID,
    caption: yuanColumn(copy.section),
    rowHeaderLabel: copy.columns.date,
    rows: points,
    rowKey: point => point.id,
    rowHeader: point => ({ label: point.date }),
    columns: MEETING_HISTORY_COLUMNS,
    valueOf: (point, column) => meetingHistoryCell(point, column, point.id === firstId, model.anchor),
    evidenceOf: noEvidence,
    onEvidence: noEvidence,
    notes,
    className: "meeting-history-table",
  });
  return <div className="meeting-history-chart" style={multiplesFrameStyle(MEETING_HISTORY_METRICS.length)}>
    <ChartFrame id="meeting-history-chart" testId={MEETING_HISTORY_TESTID} variant="inline" headingLevel={3} title={model.title} subtitle={model.subtitle} height="sm" frameClassName="multiples"
      state={empty ? "empty" : ready ? undefined : "loading"} message={empty ? copy.empty : undefined} dataTable={dataTable}>
      {empty || !ready ? null : <SmallMultiples panels={model.panels} xLabels={model.xLabels} gaps={model.gaps} fitXLabels />}
    </ChartFrame>
  </div>;
}
