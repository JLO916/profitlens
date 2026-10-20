"use client";

import { useMemo } from "react";
import { track } from "@/application/analytics";
import { CHANNEL_WEEKS_VERSION } from "@/application/chart-channel-weeks";
import { chartHeights, chartRowHeights } from "@/application/chart-theme";
import { DAILY_HEATMAP_MAX_CELLS, DAILY_HEATMAP_MAX_CHANNELS, DAILY_HEATMAP_MAX_DAYS, DAILY_HEATMAP_VERSION, DAILY_HEATMAP_WORST, dailyHeatmap, type DailyHeatmap, type DailyHeatmapResult, type HeatCell, type HeatChannel, type HeatRow, type HeatValueCell } from "@/application/chart-heatmap";
import { channelLabel, snapshotResolver } from "@/application/copy";
import type { NameResolver } from "@/application/channel-settings";
import { formatAmountL1, formatAmountL2, formatDateL1, formatHeatCell, formatPeriodL1, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { HeatTable, type HeatPosition, type HeatTableCell, type HeatTableSpec } from "../charts/heat-table";
import type { EvidenceSelection } from "../evidence-drawer";
import { ChartFrame } from "../overview/charts/chart-frame";
import { useDeferredMount } from "../charts/deferred-mount";

// V4-3b 代理 A：G11 日 × 通路月曆熱表（PRD §4.1–§4.7 G11、§5.2 第 4 列、§7.4–§7.6；CHART_CATALOG G11；D-V4-17＝A）。
// 健檢頁 G10 之後（src/components/workspace-panels.tsx 的 Diagnosis「V4-3b A」插入點）；主層常駐獨立圖區塊第 2 張（CL-9）。
// ChartFrame mode="table"（固定高 lg 320、不設 aria-hidden；表放在框內的 .table-scroll，框內垂直捲動）＋C28 HeatTable：表本身就是資料表，不另設 <details>。
// 資料：dailyHeatmap（daily-heatmap-v1；格值直接取自 report.current.daily，contribution-v1）。標題所指的通路排第一張（DOM 順序，不用 CSS order）。
// 格的點擊（含 Enter／空白鍵）開當日該通路的扣廣告後貢獻抽屜：metric_version 維持 contribution-v1，另帶 arrangeVersion daily-heatmap-v1，filter＝{ channel, date }（只過濾原始明細，不重算）。
// 本期超過 92 天改週 × 通路（同一組週的 channelWeeks 值），格的抽屜與通路寬表「各通路每週」同一種（filter＝{ week, channel }、arrangeVersion channel-weeks-v1）。
// 通路 > 8、週 × 通路超過 736 格、逐日列不完整時不計算格（state="empty"），以一句說明指向通路寬表。
// 每列放幾張月曆由 CSS grid auto-fill 依框寬決定；框內放不下全部月曆時副標尾的「其餘通路在框內捲動」由 CSS container query 顯示（span.heat-scroll-note[data-columns]）。

const copy = labels.diagnosis.chartsV4.heat;
const METRIC = "contribution_after_marketing" as const;
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * 月曆的高（px；與 globals.css「V4-3b A」的 .heat-table 一致，tests/charts-diagnosis-v4.test.tsx 比對）：caption 20（行高 16＋下距 4）、欄頭 24、每週一列 32，
 * 月曆之間的列距 16。只用來決定「其餘通路在框內捲動」要不要出現，不設任何元素的高。
 */
export const HEAT_LAYOUT = { caption: chartRowHeights.row16 + 4, head: chartRowHeights.row24, week: 2 * chartRowHeights.row16, gap: chartRowHeights.row16 } as const;
/**
 * 不必捲動就放得下全部月曆所需的每列張數：框高 lg 放得下幾列月曆（rowsFit），全部 calendars 張要排成 ≤ rowsFit 列。
 * 結果 ≤ 1 時（例如只有 1 個通路，或 390 上 2 張 3 週的月曆上下疊也放得下）不需要捲動說明；否則副標尾加 span.heat-scroll-note[data-columns]，
 * 由 CSS container query 在框寬放得下這麼多張時隱藏。
 */
export function heatColumnsNeeded(calendars: number, weeks: number): number {
  const calendar = HEAT_LAYOUT.caption + HEAT_LAYOUT.head + weeks * HEAT_LAYOUT.week;
  const rowsFit = Math.max(1, Math.floor((chartHeights.lg + HEAT_LAYOUT.gap) / (calendar + HEAT_LAYOUT.gap)));
  return Math.ceil(calendars / rowsFit);
}

/** 格的 testid（PRD §4.7：chart-{page}-{id}-cell-{語意 key}，key＝{通路代碼}-{ISO 日期或週起日}）。 */
export const heatCellTestId = (channel: string, key: string) => `chart-diagnosis-heat-cell-${channel}-${key}`;

export interface HeatSectionModel {
  result: DailyHeatmapResult;
  title: string;
  /** 副標文字（不含「其餘通路在框內捲動」）；同時是區塊的 aria 描述。 */
  subtitle: string;
  /** 月曆張數（daily 才有）。 */
  calendars: number;
  /** 不必捲動所需的每列張數（heatColumnsNeeded）；> 1 時副標尾加 scrollNote，由 CSS 依框寬決定是否顯示。週 × 通路與不計算時為 0。 */
  columnsNeeded: number;
  tables: HeatTableSpec[];
  /** 不計算格時圖區的說明（state="empty"）。 */
  message: string | null;
}

/**
 * 格的「計算與來源」（點格、按 Enter 或空白鍵都經由這一個 builder）：當日（或該週）該通路的扣廣告後貢獻，值與來源逐字取自 domain，
 * 不給 metricVersion（抽屜顯示 contribution-v1）；日格帶 arrangeVersion daily-heatmap-v1 與 filter { channel, date }，週格與通路寬表「各通路每週」相同。
 */
export function heatCellEvidence(heatmap: Pick<DailyHeatmap, "mode">, channel: string, row: Pick<HeatRow, "label" | "period">, cell: HeatValueCell): EvidenceSelection {
  const base = { name: METRIC, metric: { value: cell.metric.value, reason_codes: [...cell.metric.reason_codes] }, period: { ...cell.period }, channels: [channel], sources: [...cell.sources], title: metricDefinitions[METRIC].label } satisfies Partial<EvidenceSelection>;
  if (heatmap.mode === "weekly") return { ...base, filter: { week: { start: row.period.start, end: row.period.end, label: row.label }, channel }, arrangeVersion: CHANNEL_WEEKS_VERSION };
  return { ...base, filter: { channel, date: cell.key }, arrangeVersion: DAILY_HEATMAP_VERSION };
}

/** G11 的文字與表格（純函式，tests/charts-diagnosis-v4.test.tsx）。 */
export function heatSectionModel(snapshot: WorkspaceSnapshot, options: { resolver?: NameResolver } = {}): HeatSectionModel {
  const { report } = snapshot;
  const resolver = options.resolver ?? snapshotResolver(snapshot);
  const anchor = snapshot.data_as_of;
  const metric = metricDefinitions[METRIC].label;
  const { period } = report.current;
  const periodText = formatPeriodL1(period.start, period.end, { days: false, anchor });
  const result = dailyHeatmap(snapshot, METRIC);
  const weekly = result.heatmap?.mode === "weekly";
  const section = fill(weekly ? copy.sectionWeekly : copy.section, { metric });
  const subtitle = weekly
    ? fill(copy.subtitleWeekly, { section, period: periodText, days: DAILY_HEATMAP_MAX_DAYS, n: DAILY_HEATMAP_WORST })
    : fill(copy.subtitle, { section, period: periodText, n: DAILY_HEATMAP_WORST });
  if (result.heatmap === null) {
    const channels = report.scope.channels.length;
    const message = result.reason === "tooManyChannels" ? fill(copy.tooMany, { count: channels, n: DAILY_HEATMAP_MAX_CHANNELS })
      : result.reason === "tooManyCells" ? fill(copy.tooManyCells, { weeks: snapshot.weeks.filter(week => week.period === "current").length, count: channels, max: DAILY_HEATMAP_MAX_CELLS })
        : copy.partialNote;
    return { result, title: section, subtitle, calendars: 0, columnsNeeded: 0, tables: [], message };
  }
  const heatmap = result.heatmap;
  const label = (channel: string) => channelLabel(channel, resolver);
  // 日格寫 M/D；週格寫週的起訖（只有 1 天的週寫那一天）。
  const span = (range: { start: string; end: string }) => range.start === range.end ? formatDateL1(range.start, { anchor }) : formatPeriodL1(range.start, range.end, { days: false, anchor });
  const when = (cell: HeatValueCell) => span(cell.period);

  const headline = heatmap.headline;
  const title = headline === null ? section
    : fill(weekly ? (headline.kind === "loss" ? copy.title.lossWeekly : copy.title.noneWeekly) : (headline.kind === "loss" ? copy.title.loss : copy.title.none), {
      channel: label(headline.channel), n: headline.losing, amount: formatAmountL1(headline.value),
      ...(weekly ? { week: span(headline.period) } : { date: span(headline.period) }),
    });

  const cellView = (channel: HeatChannel, cell: HeatCell, key: string): HeatTableCell => {
    if (cell.kind === "outside") return { key, tier: "outside", text: "" };
    const value = cell.metric.value;
    const shared = { channel: label(channel.channel), date: when(cell), metric };
    const text = value === null ? labels.shell.status.missing : formatHeatCell(value);
    return {
      key, tier: cell.tier, testId: heatCellTestId(channel.channel, cell.key), text,
      aria: value === null ? fill(copy.cellAriaMissing, { ...shared, status: text }) : fill(copy.cellAria, { ...shared, cell: text, value: formatAmountL2(value) }),
    };
  };
  const rowHead = (row: HeatRow) => formatDateL1(row.period.start, { anchor });

  const tables: HeatTableSpec[] = weekly
    ? [{
      key: "weekly", caption: fill(copy.captionWeekly, { section }), corner: copy.weekHead,
      columns: heatmap.channels.map(channel => ({ key: channel.channel, label: label(channel.channel) })),
      rows: heatmap.weeks.map((week, row) => ({
        key: week.period.start, head: formatDateL1(week.period.start, { anchor }), note: week.full ? undefined : labels.overview.trendV3.incompleteShort,
        cells: heatmap.channels.map(channel => cellView(channel, channel.rows[row].cells[0], channel.channel)),
      })),
    }]
    : heatmap.channels.map(channel => ({
      key: channel.channel, caption: fill(copy.caption, { channel: label(channel.channel) }), corner: copy.weekHead,
      columns: heatmap.weekdays.map(day => ({ key: WEEKDAY_KEYS[day], label: copy.weekdays[WEEKDAY_KEYS[day]] })),
      rows: channel.rows.map(row => ({ key: row.period.start, head: rowHead(row), cells: row.cells.map(cell => cellView(channel, cell, cell.key)) })),
    }));
  const calendars = weekly ? 0 : heatmap.channels.length;
  return { result, title, subtitle, calendars, columnsNeeded: weekly ? 0 : heatColumnsNeeded(calendars, heatmap.weeks.length), tables, message: null };
}

/** 格的位置換成抽屜（calendar：第幾張月曆＝第幾個通路；matrix：第幾欄＝第幾個通路）；期間外的格回傳 null。 */
export function heatEvidenceAt(heatmap: DailyHeatmap, position: HeatPosition): EvidenceSelection | null {
  const weekly = heatmap.mode === "weekly";
  const channel = heatmap.channels[weekly ? position.cell : position.table];
  const row = channel?.rows[position.row];
  const cell = row?.cells[weekly ? 0 : position.cell];
  if (!channel || !row || !cell || cell.kind !== "value") return null;
  return heatCellEvidence(heatmap, channel.channel, row, cell);
}

export interface HeatSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/** 健檢頁 G11：ChartFrame（id heat、testid chart-diagnosis-heat、mode table、lg）＋C28 HeatTable。 */
export function HeatSection({ snapshot, onEvidence }: HeatSectionProps) {
  const model = useMemo(() => heatSectionModel(snapshot), [snapshot]);
  // V4-3b：表格內容延後一拍渲染（390 切到通路健檢的 TBT），之前由同高的 loading 骨架佔位；SSR 與單元測試不延後（deferred-mount.ts）。
  const ready = useDeferredMount();
  const heatmap = model.result.heatmap;
  const onActivate = (position: HeatPosition) => {
    if (heatmap === null) return;
    const evidence = heatEvidenceAt(heatmap, position);
    if (evidence === null) return;
    track("chart_clicked");
    onEvidence(evidence);
  };
  const subtitle = model.columnsNeeded > 1
    ? <>{model.subtitle}<span className="heat-scroll-note" data-columns={model.columnsNeeded}>{fill(copy.scrollNoteJoin, { note: copy.scrollNote })}</span></>
    : model.subtitle;
  return <ChartFrame id="heat" page="diagnosis" className="heat-section" title={model.title} subtitle={subtitle} height="lg" mode="table" frameClassName="heat"
    state={heatmap === null ? "empty" : ready ? undefined : "loading"} message={model.message ?? undefined}>
    {heatmap === null || !ready ? null : <HeatTable tables={model.tables} layout={heatmap.mode === "weekly" ? "matrix" : "calendar"} onActivate={onActivate} />}
  </ChartFrame>;
}
