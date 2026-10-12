"use client";

import { useCallback, useMemo } from "react";
import { track } from "@/application/analytics";
import { coverageTimeline, type CoverageFileKey, type CoverageMissingFileKey, type CoverageSegment, type CoverageTimeline } from "@/application/chart-coverage";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import type { EventSet } from "@/application/events";
import { formatCount, formatDateL1, formatPeriodL1 } from "@/application/presentation";
import type { IssueFilter } from "@/application/issue-filter";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Dataset, FileName, ReasonCode } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataColumn } from "../charts/chart-data-table";
import { Timeline, timelineSegmentRef, type TimelineBandInput, type TimelineSegmentRef, type TimelineTrackInput } from "../charts/timeline";
import { ChartFrame, type ChartLegendItem } from "../overview/charts/chart-frame";

// V4-7a 代理 A：G20 涵蓋時間軸（PRD §4.1–§4.7 G20、§5.7 第 2 列；CHART_CATALOG G20；06_BATCHES V4-7a；D-V4-40＝A；H5 設計稿 data.html 建議版）。
// 資料來源頁狀態列之下、data-issues 之上（由整合代理接進 DataWorkspace，本檔不碰 workspace-panels.tsx）。主層常駐獨立圖區塊 1 張（CL-9）。
// - 資料：coverageTimeline（B 級，coverage-timeline-v1），兩期取目前套用的期間（snapshot.report.scope），去年同期取 snapshot.yoy。
// - 標題（L1）取最長的缺列區段：一般「{檔案}缺 {start} 到 {end} 共 {n} 天（{通路}）」；只有 1 天時 missingOneDay；沒有缺列時 none；只有範圍級缺列時 range（圖區退回文字）。
// - 去年同期（D-V4-40＝A）不畫在軸上：副標第二行（.coverage-yoy）寫期間與缺列、無列天數。
// - 點缺列框或資料表每列的「篩選問題表」按鈕：呼叫 onFilter({ file, channel, reason })（問題不是金額，不開抽屜）；
//   整合端（DataWorkspace 的 issueFilter）負責篩問題表、捲到 data-issues 並把焦點移到篩選片語（CHART_CATALOG G20「鍵盤」「抽屜」）。
// - D-V4-51（b）＝B（使用者 2026-10-12）：同一檔不同通路的缺列日期重疊時，圖上合成一個框（coverageBoxes：起訖＝重疊各段的聯集），
//   testid 的通路段寫 all，點下去 onFilter({ file, reason })（不限通路）；不重疊的照舊一段一框。資料表照列每個通路的區段，每列的按鈕仍帶通路。
// - D-V4-53＝B（使用者 2026-10-12）：去年同期期間內的缺列不延伸軸（coverageTimeline），資料表照列，資料表後加 yoyBeforeAxisNote。
// - 資料表（C33）：檔案｜通路｜缺列起日｜缺列訖日｜天數｜篩選（每列一個 <button>，可及名稱帶檔案與通路），列數＝缺列區段數。

const copy = labels.data.chartsV4.coverage;
/**
 * 缺列框的 testid 前綴：chart-data-coverage-seg-{file}-{channel}-{start}（file＝sales、costs、ads；start＝ISO）；
 * 同一檔不同通路重疊而合成的框，通路段寫 COVERAGE_ALL_CHANNELS（all），start＝合成後的起日（D-V4-51（b）＝B）。
 */
export const COVERAGE_SEG_TESTID_PREFIX = "chart-data-coverage-seg-";
/**
 * 合成框的 testid 通路段（D-V4-51（b）＝B）。manifest.channels 只要求非空、不重複（validation.ts），不保證是大寫英文；
 * 即使有通路就叫 all，testid 也不會重複：同一檔的框彼此沒有相同的日子（重疊的都已合成一框），起日各不相同。
 */
export const COVERAGE_ALL_CHANNELS = "all";
/**
 * 篩選條件：檔案（標準檔名）、通路、原因碼（MISSING_CHANNEL_COST_DAY／MISSING_AD_DAY）。
 * V4-7a 整合：與問題表的 IssueFilter（src/application/issue-filter.ts）同一個型別；file、reason 一定給，channel 只有一段一框與資料表的按鈕給
 * （D-V4-51（b）＝B：合成的框不帶 channel，篩該檔＋該原因的全部通路；G21 的格同樣只給 file、reason）。
 * file 都是 domain 的標準檔名（FileName），DataWorkspace 的 issueFilter 直接收 G20 與 G21 的值，不另轉換。
 */
export type CoverageIssueFilter = IssueFilter & TimelineSegmentRef;

/** 缺列框或資料表列的 testid／React key（CL-2：語意 key，不用陣列索引）；channel 為 null（合成的框）時通路段寫 all。 */
export const coverageSegmentTestId = (segment: Pick<CoverageSegment, "key" | "start"> & { channel: string | null }) => `${COVERAGE_SEG_TESTID_PREFIX}${segment.key}-${segment.channel ?? COVERAGE_ALL_CHANNELS}-${segment.start}`;

/** 圖上的一個缺列框：一段缺列，或同一檔不同通路日期重疊的幾段缺列合成的一框（D-V4-51（b）＝B）。 */
export interface CoverageBox {
  key: CoverageMissingFileKey;
  file: FileName;
  reason: ReasonCode;
  /** 一段一框時是該段的通路；合成的框是 null（點下去篩該檔＋該原因，不限通路；testid 通路段 all）。 */
  channel: string | null;
  /** 起訖：一段一框時＝該段；合成的框＝各段起日最早、訖日最晚（重疊區段的聯集，本身也是連續的日期）。 */
  start: string;
  end: string;
  /** 框內的缺列區段（依 segments 的順序）；資料表仍是一段一列。 */
  segments: CoverageSegment[];
}

const compareIso = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * 缺列框（純函式；D-V4-51（b）＝B）：同一檔內日期重疊（至少有一天相同）的缺列區段依重疊關係串成一群（A 與 B 重疊、B 與 C 重疊時三段一框），
 * 兩段以上的群合成一個框（同一通路的區段已依連續日期合併、不會重疊，所以一群兩段以上一定跨通路）；只相鄰、沒有相同日子的不合。
 * 框的順序＝每群第一段在 segments 中的位置（沒有重疊時與 segments 一對一、順序相同）。只挑選既有的起訖日，不產生新數值。
 */
export function coverageBoxes(segments: readonly CoverageSegment[]): CoverageBox[] {
  const group = new Map<CoverageSegment, number>();
  let groups = 0;
  for (const key of new Set(segments.map(segment => segment.key))) {
    let current = -1, end = "";
    for (const segment of segments.filter(item => item.key === key).sort((a, b) => compareIso(a.start, b.start))) {
      if (current < 0 || segment.start > end) { current = groups++; end = segment.end; }
      else if (segment.end > end) end = segment.end;
      group.set(segment, current);
    }
  }
  const boxes = new Map<number, CoverageBox>();
  for (const segment of segments) {
    const id = group.get(segment)!;
    const box = boxes.get(id);
    if (box === undefined) { boxes.set(id, { key: segment.key, file: segment.file, reason: segment.reason, channel: segment.channel, start: segment.start, end: segment.end, segments: [segment] }); continue; }
    box.segments.push(segment);
    if (box.channel !== segment.channel) box.channel = null;
    if (segment.start < box.start) box.start = segment.start;
    if (segment.end > box.end) box.end = segment.end;
  }
  return [...boxes.values()];
}
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

  // D-V4-51（b）＝B：同一檔不同通路重疊的缺列合成一個框（不帶 channel）；不重疊的照舊一段一框。
  const tracks: TimelineTrackInput[] = timeline.tracks.map(item => ({
    key: item.key, label: fileTitle(item.key), rows: item.rows, noRows: item.noRows, events: [],
    missing: coverageBoxes(item.missing).map(box => ({ start: box.start, end: box.end, ...coverageFilterOf(box), testId: coverageSegmentTestId(box) })),
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
    // D-V4-53＝B：去年同期期間內、軸起日之前的缺列不在圖上，資料表照列；說明這些列的天數寫在圖上方的去年同期那一行。
    ...(timeline.yoyBeforeAxis.length > 0 ? [fill(copy.yoyBeforeAxisNote, { yoy: labels.shell.periods.presets.yoy, date: md(timeline.axis.start), n: formatCount(timeline.yoyBeforeAxis.length, "L2") })] : []),
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

/**
 * 缺列區段或缺列框的篩選條件（圖上的缺列框與資料表的按鈕共用）：檔案、通路、原因碼。
 * channel 為 null（D-V4-51（b）＝B 合成的框）時只給檔案與原因碼，回傳的物件沒有 channel 這個鍵。
 */
export const coverageFilterOf = (segment: Pick<CoverageSegment, "file" | "reason"> & { channel: string | null }): CoverageIssueFilter =>
  segment.channel === null ? { file: segment.file, reason: segment.reason } : { file: segment.file, channel: segment.channel, reason: segment.reason };

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
  /** 點缺列框或資料表的「篩選問題表」：{ file, channel, reason }（合成的框沒有 channel）。不給時缺列框不可點、資料表不輸出篩選欄。 */
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
    onFilter(timelineSegmentRef(segment));
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
