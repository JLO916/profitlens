"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { ManagerSummary as SummaryData, SummaryEvidence } from "@/application/manager-summary";
import { CHANNEL_WEEKS_MAX_CHANNELS, CHANNEL_WEEKS_VERSION, channelWeeks, channelWeeksAvailable, recentChannelWeeks, type ChannelWeek, type ChannelWeeks, type ChannelWeekSeries, type ChannelWeekValue } from "@/application/chart-channel-weeks";
import { channelLabel, demoAlias } from "@/application/copy";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { deltaTone, deltaWord, formatAmountL2, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { parseCents } from "@/domain/money";
import { fill, labels } from "@/i18n";
import { ChartDataDetails, type ChartDataColumn } from "./charts/chart-data-table";
import { Sparkline } from "./charts/sparkline";
import type { EvidenceSelection } from "./evidence-drawer";
import { ShellIcon } from "./shell/shell-icon";
import { toneClass } from "./top-three";
import styles from "./manager-summary.module.css";

/** default：會議摘要（R1 起的上期／本期／差額欄序，原樣保留）；diagnosis：通路健檢頁（V3-5，PRD §7.2 第 3 點、§9.4 C3）。 */
export type ChannelTableVariant = "default" | "diagnosis";

interface ChannelWideTableProps { summary: SummaryData; onEvidence: (evidence: EvidenceSelection) => void; ariaLabel: string; caption: string; variant?: ChannelTableVariant;
  /** V4-3a（G7b，代理 B 接線）：健檢頁傳入快照，通路寬表 diagnosis 變體的「近 {n} 週」由它在元件內 useMemo 計算；會議摘要不傳。 */
  snapshot?: WorkspaceSnapshot }

/**
 * 通路寬表（上期／本期／差額）。R1 起同時用於通路健檢頁頂與會議摘要；數字一律可開「計算與來源」。欄名由 labels.shell.periods 與 metricDefinitions 組成，示範資料的通路名僅在顯示層套 alias。
 * V3-2b：L2（整數元、千分位、U+2212）；單位「元」只在 caption 標一次；差額欄只有不利上色（依 favorableDirection）。
 * V3-5：variant="diagnosis" 改成台灣報表欄序（本期｜上期｜差額，欄群組標單位）、可排序、備註欄與手機清單；會議摘要仍用 default。
 * V4-3a G7b：diagnosis 變體在傳入 snapshot 時，扣廣告後貢獻欄群組與備註欄之間多一欄「近 {n} 週」sparkline，表格之後多一個收合的「各通路每週」資料表；
 * 通路 > 8 時兩者都不渲染（也不計算），改為表格之後一句說明。default 變體（會議摘要）不變。
 */
export function ChannelWideTable({ summary, onEvidence, ariaLabel, caption, variant = "default", snapshot }: ChannelWideTableProps) {
  if (variant === "diagnosis") return <DiagnosisChannelTable summary={summary} onEvidence={onEvidence} ariaLabel={ariaLabel} caption={caption} snapshot={snapshot} />;
  const alias = demoAlias(summary.dataset_id);
  const columnHeaders = (["net_revenue", "contribution_after_marketing"] as const).flatMap(name => [`${labels.shell.periods.previous}${metricDefinitions[name].shortLabel}`, `${labels.shell.periods.current}${metricDefinitions[name].shortLabel}`, `${metricDefinitions[name].shortLabel}${labels.exports.csv.suffix.change}`]);
  // V3-10 收尾：可及名稱含可見數字（Lighthouse label-content-name-mismatch；抽屜標題 evidence.title 不變）。
  const amount = (evidence: SummaryEvidence, signed = false) => { const shown = evidence.metric.value === null ? labels.shell.status.missing : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value); return <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={fill(labels.overview.channelsV3.wideAmountAria, { title: evidence.title, value: shown })}>{shown}</button>; };
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table><caption>{fill(labels.overview.channelTable.unitCaption, { caption })}</caption><thead><tr><th scope="col">{labels.overview.channelTable.channelHeader}</th>{columnHeaders.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{channelLabel(row.channel, alias)}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>{labels.overview.channelTable.turnedNegative}</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>{labels.overview.channelTable.turnedPositive}</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`} className={period === "change" ? metric.evidence.change.metric.value === null ? "neutral" : toneClass(deltaTone(metric.metric, metric.evidence.change.metric.value, "L2")) : ""}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div>;
}

type ChannelRow = SummaryData["channels"][number];
type GroupName = "net_revenue" | "contribution_after_marketing";
type Period = "current" | "previous" | "change";
/** 可排序的四欄：本期淨營收、淨營收差額、本期扣廣告後貢獻、扣廣告後貢獻差額。 */
export type ChannelSortKey = `${GroupName}:${Exclude<Period, "previous">}`;
export type SortDirection = "ascending" | "descending";
export interface ChannelSort { key: ChannelSortKey; direction: SortDirection }
/** 預設依本期扣廣告後貢獻由低到高（最需要看的通路排最前面）。 */
export const DEFAULT_CHANNEL_SORT: ChannelSort = { key: "contribution_after_marketing:current", direction: "ascending" };

const GROUPS: readonly GroupName[] = ["net_revenue", "contribution_after_marketing"];
const PERIODS: readonly Period[] = ["current", "previous", "change"];
const tableV3 = labels.diagnosis.tableV3;
const metricOf = (row: ChannelRow, name: GroupName) => name === "net_revenue" ? row.revenue : row.contribution;
const sortKeyOf = (name: GroupName, period: Period): ChannelSortKey | null => period === "previous" ? null : `${name}:${period}`;

/** 排序只是呈現層的順序：依該欄的精確值（分）比較；資料待補一律排最後；同值維持原本的通路順序。 */
export function sortChannelRows(rows: readonly ChannelRow[], sort: ChannelSort): ChannelRow[] {
  const [name, period] = sort.key.split(":") as [GroupName, Exclude<Period, "previous">];
  const value = (row: ChannelRow) => parseCents(metricOf(row, name)[period].value);
  return rows.map((row, index) => ({ row, index, cents: value(row) })).sort((a, b) => {
    if (a.cents === null || b.cents === null) return a.cents === b.cents ? a.index - b.index : a.cents === null ? 1 : -1;
    if (a.cents === b.cents) return a.index - b.index;
    return (a.cents < b.cents ? -1 : 1) * (sort.direction === "ascending" ? 1 : -1);
  }).map(item => item.row);
}

/** 欄名：手機清單的 data-label 用短名（表頭空間不足時，GLOSSARY），排序按鈕的可及名稱用全名（包含可見的「本期」「差額」）。 */
function columnLabel(name: GroupName, period: Period, short: boolean): string {
  const metric = short ? metricDefinitions[name].shortLabel : metricDefinitions[name].label;
  return period === "change" ? fill(tableV3.changeLabel, { metric }) : fill(tableV3.cellLabel, { period: labels.shell.periods[period], metric });
}
const periodText = (period: Period) => period === "change" ? tableV3.change : labels.shell.periods[period];

/** 黏在頂部的頂欄與期間列會蓋住列首：捲動時扣掉兩者的實際高度（期間列在窄螢幕會換行，不能只用 token）。 */
function stickyOffset(): number {
  return [...document.querySelectorAll<HTMLElement>("header.topbar, .period-bar")].filter(element => ["sticky", "fixed"].includes(getComputedStyle(element).position)).reduce((sum, element) => sum + element.offsetHeight, 0);
}

/** 備註欄的健檢標題連結：跳到同頁的健檢列並展開（列是 <details id="diagnosis-row-{rule}">），焦點移到該列的 summary；網址不加 hash。 */
function jumpToRow(event: MouseEvent<HTMLAnchorElement>, rule: string) {
  const target = document.getElementById(`diagnosis-row-${rule}`);
  if (!(target instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  target.open = true;
  // 直接跳（不做平滑捲動）：展開列會改變頁高，平滑捲動途中瀏覽器的捲動錨定會讓終點偏掉。
  window.scrollTo({ top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - stickyOffset() - 12) });
  target.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
}

/** 該通路觸發的第一個健檢群組（依健檢結果的順序）：範圍是這個通路（或 SKU）的成員；只選一個通路時，合計就是這個通路。 */
function channelDiagnosis(summary: SummaryData, channel: string) {
  return summary.diagnosis.find(group => group.scopes.some(({ scope }) => scope.channels.includes(channel) && (scope.kind !== "all" || scope.channels.length === 1))) ?? null;
}

// ── V4-3a B：G7b 通路寬表「近 {n} 週」sparkline 與「各通路每週」資料表（PRD §4.1–§4.7 G7、§5.2 第 6 列、§8.2；CHART_CATALOG G7（b））。
// 資料由 channelWeeks（channel-weeks-v1，不放進快照）在本元件內以 useMemo 計算，只取本期最後 ≤ 8 週；通路 > 8 時不呼叫。
// - sparkline（C19）放在扣廣告後貢獻欄群組之後、備註欄之前的新欄，aria-hidden、不可點；testid chart-diagnosis-channels-spark-{通路代碼}；
//   語意由同列的本期扣廣告後貢獻承擔（CL-1），所以該通路本期扣廣告後貢獻是資料待補或不適用、或整列沒有任何週值時不畫（各週數字仍在資料表裡），同 G7a。
//   金額是期間合計：未滿 7 天的週畫空心點、不和完整週連線（X40，同 G7a 的件數）。
// - 「各通路每週」（C33）放在表格之後的收合 <details>，收合時保持掛載（M1）；列＝通路（順序同目前寬表的排序），欄＝近 {n} 週，格＝扣廣告後貢獻 L2，可開抽屜；
//   表 testid chart-diagnosis-channels-table。
// - 每格的抽屜：值取自 domain（metric_version 維持 contribution-v1），整理函式的版本放 arrangeVersion: "channel-weeks-v1"；filter 篩到該週、該通路。

const spark = labels.diagnosis.chartsV4.channelsSpark;
const CHANNEL_METRIC = "contribution_after_marketing" as const;
/** sparkline 的 testid（PRD §4.7：chart-{page}-{id}-spark-{語意 key}，key＝通路代碼）。 */
export const channelSparkTestId = (channel: string) => `chart-diagnosis-channels-spark-${channel}`;
/** 「各通路每週」資料表的 testid（PRD §4.7：chart-{page}-{id}-table）。 */
export const CHANNEL_WEEKS_TABLE_TESTID = "chart-diagnosis-channels-table";
/** 通路 > 8 時取代「近 {n} 週」欄與資料表的一句說明（不是圖，不用 chart- 前綴）。 */
export const CHANNEL_WEEKS_TOO_MANY_TESTID = "channel-weeks-too-many";

/** G7b 的狀態：off＝沒傳快照（會議摘要、既有呼叫端）或逐日列不完整；tooMany＝通路 > 8，不計算；ready＝本期最後 ≤ 8 週。 */
export type ChannelWeeksState = { status: "off" } | { status: "tooMany" } | { status: "ready"; data: ChannelWeeks };
/** 只在通路數在上限內時呼叫 channelWeeks（PRD §8.2：通路 > 8 時不呼叫）。純函式，元件以 useMemo 包住。 */
export function channelWeeksState(snapshot: Pick<WorkspaceSnapshot, "report" | "weeks"> | undefined): ChannelWeeksState {
  if (!snapshot) return { status: "off" };
  if (!channelWeeksAvailable(snapshot)) return { status: "tooMany" };
  const data = channelWeeks(snapshot);
  return data === null || data.weeks.length === 0 ? { status: "off" } : { status: "ready", data: recentChannelWeeks(data) };
}

/** 欄名「近 {n} 週」（n＝實際週數，上限 8）。 */
export const channelSparkHead = (data: ChannelWeeks) => fill(spark.head, { n: data.weeks.length });

/** 資料表一格的「計算與來源」（PRD §8.7、CHART_CATALOG G7（b））：該通路該週的扣廣告後貢獻；不給 metricVersion（domain 值，contribution-v1）。 */
export function channelWeekEvidence(series: ChannelWeekSeries, week: ChannelWeek, value: ChannelWeekValue): EvidenceSelection {
  return { name: CHANNEL_METRIC, metric: { value: value.metric.value, reason_codes: [...value.metric.reason_codes] }, period: { ...week.period }, channels: [series.channel], sources: value.sources, title: metricDefinitions[CHANNEL_METRIC].label, filter: { week: { start: week.period.start, end: week.period.end, label: week.label }, channel: series.channel }, arrangeVersion: CHANNEL_WEEKS_VERSION };
}

/** 一列的 sparkline：圖形座標用 Number 近似值（顯示與抽屜一律用精確字串）；本期值缺漏或整列沒有週值時不畫。 */
export function ChannelSparkCell({ data, channel, current }: { data: ChannelWeeks; channel: string; current: string | null }) {
  const series = data.channels.find(item => item.channel === channel);
  if (!series || current === null || series.values.every(value => value.metric.value === null)) return null;
  const points = series.values.map((value, index) => ({ value: value.metric.value === null ? null : Number(value.metric.value), incomplete: !data.weeks[index].full }));
  return <Sparkline points={points} hollowIncomplete testId={channelSparkTestId(channel)} />;
}

type WeeksRow = { series: ChannelWeekSeries; label: string };

/** 「各通路每週」（C33）：列＝通路，欄＝近 {n} 週（週名＋起訖；未滿 7 天的週欄頭加「未滿 7 天」），格＝扣廣告後貢獻 L2 number-link；V4-8a（D-V4-45＝B）不利（deltaTone L2）時帶 unfavorable。 */
export function ChannelWeeksDetails({ data, channels, alias, anchor, onEvidence }: { data: ChannelWeeks; channels: readonly string[]; alias: boolean; anchor: string; onEvidence: (evidence: EvidenceSelection) => void }) {
  const metric = metricDefinitions[CHANNEL_METRIC].label;
  const rows: WeeksRow[] = channels.flatMap(channel => { const series = data.channels.find(item => item.channel === channel); return series ? [{ series, label: channelLabel(channel, alias) }] : []; });
  const columns: ChartDataColumn<number>[] = data.weeks.map((week, index) => ({
    key: week.period.start, label: week.label, unit: "money", layer: "L2", data: index,
    notes: [formatPeriodL1(week.period.start, week.period.end, { anchor, days: false }), ...(week.full ? [] : [labels.overview.trendV3.incompleteShort])],
  }));
  const value = (row: WeeksRow, column: ChartDataColumn<number>) => row.series.values[column.data];
  const incomplete = data.weeks.some(week => !week.full);
  return <ChartDataDetails<WeeksRow, number>
    title={spark.tableTitle}
    testId={CHANNEL_WEEKS_TABLE_TESTID}
    caption={fill(spark.caption, { metric, n: data.weeks.length })}
    rowHeaderLabel={labels.overview.channelTable.channelHeader}
    rows={rows}
    rowKey={row => row.series.channel}
    rowHeader={row => ({ label: row.label })}
    columns={columns}
    valueOf={(row, column) => { const cell = value(row, column); return { value: cell.metric.value, reasonCodes: cell.metric.reason_codes, unfavorable: deltaTone(CHANNEL_METRIC, cell.metric.value, "L2") === "unfavorable" }; }}
    evidenceOf={(row, column) => channelWeekEvidence(row.series, data.weeks[column.data], value(row, column))}
    onEvidence={onEvidence}
    cellAria={(row, column, text) => fill(value(row, column).metric.value === null ? labels.overview.channelsV3.marginAria : labels.overview.channelsV3.amountAria, { channel: row.label, metric: fill(tableV3.cellLabel, { period: data.weeks[column.data].label, metric }), value: text })}
    notes={incomplete ? [fill(spark.incompleteNote, { metric })] : []}
  />;
}
// ── V4-3a B 結束

function DiagnosisChannelTable({ summary, onEvidence, ariaLabel, caption, snapshot }: Omit<ChannelWideTableProps, "variant">) {
  const [sort, setSort] = useState<ChannelSort>(DEFAULT_CHANNEL_SORT);
  const alias = demoAlias(summary.dataset_id);
  const rows = sortChannelRows(summary.channels, sort);
  // V4-3a G7b：只依快照的報表與週列計算（排序切換不重算）；沒傳快照時（既有呼叫端）不多任何欄。
  const report = snapshot?.report, weeks = snapshot?.weeks;
  const g7b = useMemo(() => channelWeeksState(report && weeks ? { report, weeks } : undefined), [report, weeks]);
  const sparkHead = g7b.status === "ready" ? channelSparkHead(g7b.data) : null;
  const toggle = (key: ChannelSortKey) => setSort(current => current.key === key ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" });
  // PRD §7 共通規則的可及名稱句型「{通路} {指標} {值} 元，看明細」（labels.overview.channelsV3.amountAria），取代 manager-summary 的「一頁摘要 · …」標題。
  const amount = (evidence: SummaryEvidence, signed: boolean, channel: string, label: string) => {
    const text = evidence.metric.value === null ? labels.shell.status.missing : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value);
    const aria = evidence.metric.value === null ? fill(labels.overview.channelsV3.marginAria, { channel, metric: label, value: text }) : fill(labels.overview.channelsV3.amountAria, { channel, metric: label, value: text });
    return <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={aria}>{text}</button>;
  };
  const header = (name: GroupName, period: Period) => {
    const key = sortKeyOf(name, period);
    const active = key !== null && sort.key === key;
    const short = columnLabel(name, period, true);
    return <th key={`${name}-${period}`} role="columnheader" scope="col" className={`num${period === "previous" ? " prev" : ""}${key ? " sortable" : ""}`} data-label={short} aria-sort={active ? sort.direction : undefined}>
      {key ? <button type="button" className="sort-button" data-label={short} aria-label={columnLabel(name, period, false)} onClick={() => toggle(key)}><span className="sort-text">{periodText(period)}</span><ShellIcon name={active ? sort.direction === "ascending" ? "sort-asc" : "sort-desc" : "sort"} size={16} className="sort-icon" /></button> : periodText(period)}
    </th>;
  };
  return <><div className="table-scroll channel-table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}>
    <table className="ui-table channel-table-v3" role="table">
      <caption>{caption}</caption>
      <colgroup><col /></colgroup>{GROUPS.map(name => <colgroup key={name} span={3} />)}{sparkHead !== null && <colgroup><col /></colgroup>}<colgroup><col /></colgroup>
      <thead role="rowgroup">
        <tr role="row" className="group-row"><th role="columnheader" scope="col" rowSpan={2} className="channel-col">{labels.overview.channelTable.channelHeader}</th>{GROUPS.map(name => <th key={name} role="columnheader" scope="colgroup" colSpan={3} className="group-head">{fill(labels.format.units.yuanColumn, { label: metricDefinitions[name].label })}</th>)}{sparkHead !== null && <th role="columnheader" scope="col" rowSpan={2} className="spark-head">{sparkHead}</th>}<th role="columnheader" scope="col" rowSpan={2} className="note-col">{tableV3.note}</th></tr>
        <tr role="row" className="column-row">{GROUPS.flatMap(name => PERIODS.map(period => header(name, period)))}</tr>
      </thead>
      <tbody role="rowgroup">{rows.map(row => {
        const turned = deltaWord("contribution_after_marketing", row.contribution.change.value, { previous: row.contribution.previous.value });
        const group = channelDiagnosis(summary, row.channel);
        return <tr key={row.channel} role="row">
          <th role="rowheader" scope="row" className="channel-cell" data-label={labels.overview.channelTable.channelHeader} data-list-role="primary">{channelLabel(row.channel, alias)}</th>
          {GROUPS.flatMap(name => PERIODS.map(period => {
            const metric = metricOf(row, name);
            const value = metric.evidence[period].metric.value;
            const tone = period !== "change" ? "" : value === null ? " neutral" : ` ${toneClass(deltaTone(name, value, "L2"))}`;
            const listRole = period === "previous" ? "secondary" : name === "contribution_after_marketing" ? "labeled" : "secondary";
            return <td key={`${name}-${period}`} role="cell" className={`num${period === "previous" ? " prev" : ""}${tone}`} data-label={columnLabel(name, period, true)} data-list-role={listRole}>{amount(metric.evidence[period], period === "change", channelLabel(row.channel, alias), columnLabel(name, period, false))}</td>;
          }))}
          {g7b.status === "ready" && <td role="cell" className="spark-cell" data-label={sparkHead ?? undefined} data-list-role="spark"><ChannelSparkCell data={g7b.data} channel={row.channel} current={row.contribution.current.value} /></td>}
          <td role="cell" className="note-cell" data-label={tableV3.note} data-list-role="secondary">{turned === labels.format.turnedLoss && <span className="ui-lozenge" data-tone="unfavorable">{labels.overview.channelsV3.turnedNegative}</span>}{turned === labels.format.turnedPositive && <span className="ui-lozenge">{labels.overview.channelsV3.turnedPositive}</span>}{group && <a className="note-link" href={`#diagnosis-row-${group.rule}`} onClick={event => jumpToRow(event, group.rule)}>{group.headline}</a>}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>
  {g7b.status === "ready" && snapshot && <ChannelWeeksDetails data={g7b.data} channels={rows.map(row => row.channel)} alias={alias} anchor={snapshot.data_as_of} onEvidence={onEvidence} />}
  {g7b.status === "tooMany" && <p className="note channel-weeks-note" data-testid={CHANNEL_WEEKS_TOO_MANY_TESTID}>{fill(spark.tooMany, { max: CHANNEL_WEEKS_MAX_CHANNELS })}</p>}
  </>;
}
