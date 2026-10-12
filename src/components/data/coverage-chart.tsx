"use client";

import { useCallback, useMemo } from "react";
import { track } from "@/application/analytics";
import { coverageTimeline, type CoverageFileKey, type CoverageSegment, type CoverageTimeline } from "@/application/chart-coverage";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import type { EventSet } from "@/application/events";
import { formatCount, formatDateL1, formatPeriodL1 } from "@/application/presentation";
import type { IssueFilter } from "@/application/issue-filter";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Dataset } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataColumn } from "../charts/chart-data-table";
import { Timeline, type TimelineBandInput, type TimelineSegmentRef, type TimelineTrackInput } from "../charts/timeline";
import { ChartFrame, type ChartLegendItem } from "../overview/charts/chart-frame";

// V4-7a 代理 A：G20 涵蓋時間軸（PRD §4.1–§4.7 G20、§5.7 第 2 列；CHART_CATALOG G20；06_BATCHES V4-7a；D-V4-40＝A；H5 設計稿 data.html 建議版）。
// 資料來源頁狀態列之下、data-issues 之上（由整合代理接進 DataWorkspace，本檔不碰 workspace-panels.tsx）。主層常駐獨立圖區塊 1 張（CL-9）。
// - 資料：coverageTimeline（B 級，coverage-timeline-v1），兩期取目前套用的期間（snapshot.report.scope），去年同期取 snapshot.yoy。
// - 標題（L1）取最長的缺列區段：一般「{檔案}缺 {start} 到 {end} 共 {n} 天（{通路}）」；只有 1 天時 missingOneDay；沒有缺列時 none；只有範圍級缺列時 range（圖區退回文字）。
// - 去年同期（D-V4-40＝A）不畫在軸上：副標第二行（.coverage-yoy）寫期間與缺列、無列天數。
// - 點缺列框或資料表每列的「篩選問題表」按鈕：呼叫 onFilter({ file, channel, reason })（問題不是金額，不開抽屜）；
//   整合端（DataWorkspace 的 issueFilter）負責篩問題表、捲到 data-issues 並把焦點移到篩選片語（CHART_CATALOG G20「鍵盤」「抽屜」）。
// - 資料表（C33）：檔案｜通路｜缺列起日｜缺列訖日｜天數｜篩選（每列一個 <button>，可及名稱帶檔案與通路），列數＝缺列區段數。

const copy = labels.data.chartsV4.coverage;
/** 缺列框的 testid 前綴：chart-data-coverage-seg-{file}-{channel}-{start}（file＝sales、costs、ads；start＝ISO）。 */
export const COVERAGE_SEG_TESTID_PREFIX = "chart-data-coverage-seg-";
/**
 * 篩選條件：檔案（標準檔名）、通路、原因碼（MISSING_CHANNEL_COST_DAY／MISSING_AD_DAY）。
 * V4-7a 整合：與問題表的 IssueFilter（src/application/issue-filter.ts）同一個型別，三個欄位都給（G21 的格只給 file、reason）；
 * file 都是 domain 的標準檔名（FileName），DataWorkspace 的 issueFilter 直接收 G20 與 G21 的值，不另轉換。
 */
export type CoverageIssueFilter = Required<IssueFilter> & TimelineSegmentRef;

/** 缺列框的 testid（CL-2：語意 key，不用陣列索引）。 */
export const coverageSegmentTestId = (segment: Pick<CoverageSegment, "key" | "channel" | "start">) => `${COVERAGE_SEG_TESTID_PREFIX}${segment.key}-${segment.channel}-${segment.start}`;
const fileTitle = (key: CoverageFileKey) => labels.importWizard.files[key];

export type CoverageTitleKind = "missing" | "missingOneDay" | "none" | "range" | "noData";
export interface CoverageChartModel {
  timeline: CoverageTimeline | null;
  /** ready＝畫時間軸；empty＝沒有資料集，或只有範圍級缺列（退回文字）。 */
  state: "ready" | "empty";
  titleKind: CoverageTitleKind;
  title: string;
  subtitle: string;
  /** D-V4-40＝A：圖上方一行（去年同期可用時）。 */
  yoyLine: string | null;
  /** empty 時圖區的說明（範圍級缺列）；沒有資料集時 undefined（ChartFrame 預設「無資料」）。 */
  message: string | undefined;
  bands: TimelineBandInput[];
  tracks: TimelineTrackInput[];
  /** 資料表之後的說明（在收合的 <details> 內）。 */
  notes: string[];
  alias: boolean;
}

/** G20 的標題、副標、軌與區帶（純函式，tests/charts-data-coverage-v4.test.tsx）。alias：示範資料的通路別名。 */
export function coverageChartModel(timeline: CoverageTimeline | null, options: { alias?: boolean } = {}): CoverageChartModel {
  const alias = options.alias ?? false;
  if (timeline === null) {
    return { timeline, state: "empty", titleKind: "noData", title: copy.section, subtitle: fill(copy.subtitleEmpty, { section: copy.section }), yoyLine: null, message: undefined, bands: [], tracks: [], notes: [], alias };
  }
  const anchor = timeline.dataAsOf;
  const md = (iso: string) => formatDateL1(iso, { anchor });
  const { longest } = timeline;
  const titleKind: CoverageTitleKind = timeline.fallback ? "range" : longest === null ? "none" : longest.days === 1 ? "missingOneDay" : "missing";
  const title = titleKind === "range" ? copy.title.range
    : longest === null ? fill(copy.title.none, { start: md(timeline.coverage.start), end: md(timeline.coverage.end) })
      : longest.days === 1 ? fill(copy.title.missingOneDay, { file: fileTitle(longest.key), date: md(longest.start), channel: channelLabel(longest.channel, alias) })
        : fill(copy.title.missing, { file: fileTitle(longest.key), start: md(longest.start), end: md(longest.end), n: formatCount(longest.days, "L2"), channel: channelLabel(longest.channel, alias) });
  const subtitle = fill(copy.subtitle, { section: copy.section, range: formatPeriodL1(timeline.coverage.start, timeline.coverage.end, { anchor }), channels: channelsLabel(timeline.channels, alias) });

  const { yoy } = timeline;
  let yoyLine: string | null = null;
  if (yoy !== null) {
    const parts = [
      ...(yoy.missingDays > 0 ? [fill(copy.yoy.missing, { n: formatCount(yoy.missingDays, "L2") })] : []),
      ...(yoy.noRowDays > 0 ? [fill(copy.yoy.noRows, { file: fileTitle("sales"), n: formatCount(yoy.noRowDays, "L2") })] : []),
    ];
    yoyLine = fill(copy.yoy.line, { yoy: labels.shell.periods.presets.yoy, range: formatPeriodL1(yoy.start, yoy.end, { anchor }), detail: parts.length ? parts.join(copy.yoy.joiner) : copy.yoy.complete });
  }

  const tracks: TimelineTrackInput[] = timeline.tracks.map(item => ({
    key: item.key, label: fileTitle(item.key), rows: item.rows, noRows: item.noRows, events: [],
    missing: item.missing.map(segment => ({ start: segment.start, end: segment.end, file: segment.file, channel: segment.channel, reason: segment.reason, testId: coverageSegmentTestId(segment) })),
    endLabel: item.key === "sales" ? (item.noRowDays > 0 ? fill(copy.noRowDays, { n: formatCount(item.noRowDays, "L2") }) : "") : item.missingDays > 0 ? fill(copy.gapDays, { n: formatCount(item.missingDays, "L2") }) : "",
  }));
  // 檔期軌（≤ 4 軌的第 4 軌）：只在軸上有檔期時加。
  if (timeline.events.length > 0) tracks.push({ key: "events", label: labels.overview.alerts.eventPeriod, rows: [], missing: [], noRows: [], endLabel: "", events: timeline.events.map(event => ({ key: String(event.line), start: event.start, end: event.end, label: event.label })) });
  const bands: TimelineBandInput[] = [
    { key: "previous", label: labels.shell.periods.previous, start: timeline.previous.start, end: timeline.previous.end },
    { key: "current", label: labels.shell.periods.current, start: timeline.current.start, end: timeline.current.end },
  ];

  const sales = timeline.tracks.find(item => item.key === "sales");
  const beforeAxisDays = timeline.noRowsBeforeAxis.reduce((sum, range) => sum + range.days, 0);
  const notes = [
    ...(timeline.fallback ? [copy.rangeFallback] : timeline.segments.length === 0 ? [copy.tableNone] : []),
    ...(sales !== undefined && sales.noRowDays > 0 ? [fill(copy.noRowsNote, { file: fileTitle("sales"), n: formatCount(sales.noRowDays, "L2") })] : []),
    // 審查 R1-F1：涵蓋起日到圖的起日之間的銷售無列（D-V4-40＝A 不在軸上）只寫在這裡，副標的涵蓋期間仍從涵蓋起日算。
    ...(beforeAxisDays > 0 ? [fill(copy.noRowsBeforeAxisNote, { file: fileTitle("sales"), date: md(timeline.axis.start), n: formatCount(beforeAxisDays, "L2") })] : []),
  ];
  return { timeline, state: timeline.fallback ? "empty" : "ready", titleKind, title, subtitle, yoyLine, message: timeline.fallback ? copy.rangeFallback : undefined, bands, tracks, notes, alias };
}

type CoverageColumnKey = "channel" | "start" | "end" | "days";
/** 資料表欄（檔案是列名欄）：通路、缺列起日、缺列訖日、天數；篩選按鈕是表尾的動作欄。 */
export const COVERAGE_TABLE_COLUMNS: readonly ChartDataColumn<CoverageColumnKey>[] = [
  { key: "channel", label: labels.overview.page.colChannel, unit: "text", data: "channel" },
  { key: "start", label: copy.columns.start, unit: "date", data: "start" },
  { key: "end", label: copy.columns.end, unit: "date", data: "end" },
  { key: "days", label: copy.columns.days, unit: "count", layer: "L2", data: "days" },
];

/** 缺列區段的篩選條件（圖上的缺列框與資料表的按鈕共用）：檔案、通路、原因碼。 */
export const coverageFilterOf = (segment: Pick<CoverageSegment, "file" | "channel" | "reason">): CoverageIssueFilter => ({ file: segment.file, channel: segment.channel, reason: segment.reason });

/**
 * G20 資料表（C33；純函式，回傳 ChartFrame 的 dataTable）：檔案（列名）｜通路｜缺列起日｜缺列訖日｜天數｜篩選。列數＝缺列區段數。
 * 問題不是金額：格都是純文字、不開抽屜。給 onFilter 時每列最後一欄是一個「篩選問題表」按鈕（可及名稱帶檔案與通路），按下呼叫 onFilter（不記 chart_clicked：那是點圖的事件）。
 */
export function coverageDataTable(model: CoverageChartModel, onFilter?: (filter: CoverageIssueFilter) => void) {
  return chartDataTable<CoverageSegment, CoverageColumnKey>({
    title: copy.section,
    testId: "chart-data-coverage-table",
    caption: copy.section,
    rowHeaderLabel: labels.data.pageV3.issueTable.columns.file,
    rows: model.timeline?.segments ?? [],
    rowKey: segment => coverageSegmentTestId(segment),
    rowHeader: segment => ({ label: fileTitle(segment.key) }),
    columns: COVERAGE_TABLE_COLUMNS,
    valueOf: (segment, column) => ({ value: column.data === "channel" ? channelLabel(segment.channel, model.alias) : column.data === "days" ? String(segment.days) : segment[column.data] }),
    evidenceOf: () => null,
    onEvidence: () => undefined,
    notes: model.notes,
    className: "coverage-data-table",
    actionColumn: onFilter ? {
      label: copy.columns.action,
      render: segment => <button type="button" className="ui-btn ui-btn-text coverage-filter" aria-label={fill(copy.filterName, { file: fileTitle(segment.key), channel: channelLabel(segment.channel, model.alias) })} onClick={() => onFilter(coverageFilterOf(segment))}>{copy.filterButton}</button>,
    } : undefined,
  });
}

export interface CoverageChartProps {
  /** 沒有資料集時渲染等高的空狀態。 */
  dataset: Dataset | null;
  /** 目前的快照：兩期取 report.scope（使用者套用的期間），去年同期取 snapshot.yoy；不給時用 manifest 的兩期、沒有去年同期。 */
  snapshot?: WorkspaceSnapshot | null;
  /** 選填的檔期（events.csv）。 */
  events?: EventSet | null;
  /** 點缺列框或資料表的「篩選問題表」：{ file, channel, reason }。不給時缺列框不可點、資料表不輸出篩選欄。 */
  onFilter?: (filter: CoverageIssueFilter) => void;
  /** 圖寬（測試用）；不給時量測容器。 */
  width?: number;
}

/** 資料來源頁 G20：ChartFrame（id data-coverage、testid chart-data-coverage、sm）＋C30 Timeline＋C33 資料表。 */
export function CoverageChart({ dataset, snapshot = null, events = null, onFilter, width }: CoverageChartProps) {
  const scope = snapshot?.report.scope;
  const previous = scope?.previous_period, current = scope?.current_period;
  const yoy = snapshot?.yoy ?? null;
  const timeline = useMemo(() => dataset === null ? null : coverageTimeline(dataset, events, yoy, previous && current ? { previous, current } : undefined), [dataset, events, yoy, previous, current]);
  const model = useMemo(() => coverageChartModel(timeline, { alias: dataset === null ? false : demoAlias(dataset.manifest.dataset_id) }), [timeline, dataset]);
  const anchor = timeline?.dataAsOf;
  const dateLabel = useCallback((iso: string) => formatDateL1(iso, { anchor }), [anchor]);
  const onSegment = useCallback((segment: TimelineSegmentRef) => {
    if (!onFilter) return;
    track("chart_clicked");
    onFilter(coverageFilterOf(segment));
  }, [onFilter]);

  const legend: ChartLegendItem[] = [
    { key: "rows", label: copy.legend.rows, color: chartColors.total, shape: "line" },
    { key: "missing", label: copy.legend.missing, color: chartColors.missing, shape: "dash" },
  ];
  const separator = labels.data.pageV3.separator;
  const subtitle = model.yoyLine === null ? model.subtitle
    : <>{model.subtitle}<span className="coverage-yoy" data-testid="data-coverage-yoy"><span className="sr-only">{separator}</span>{model.yoyLine}</span></>;
  const dataTable = coverageDataTable(model, onFilter);
  return <ChartFrame id="data-coverage" page="data" testId="chart-data-coverage" className="coverage-section" title={model.title} subtitle={subtitle}
    legend={model.state === "ready" ? legend : undefined} height="sm" state={model.state} message={model.message} dataTable={dataTable}>
    {model.state === "ready" && timeline !== null
      ? <Timeline domain={timeline.axis} bands={model.bands} tracks={model.tracks} noRowsText={copy.noRows} dateLabel={dateLabel} onSegment={onFilter ? onSegment : undefined} width={width} />
      : null}
  </ChartFrame>;
}
