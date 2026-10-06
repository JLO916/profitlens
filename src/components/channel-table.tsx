"use client";

import { useState, type MouseEvent } from "react";
import type { ManagerSummary as SummaryData, SummaryEvidence } from "@/application/manager-summary";
import { channelLabel, demoAlias } from "@/application/copy";
import { deltaTone, deltaWord, formatAmountL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { parseCents } from "@/domain/money";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ShellIcon } from "./shell/shell-icon";
import { toneClass } from "./top-three";
import styles from "./manager-summary.module.css";

/** default：會議摘要（R1 起的上期／本期／差額欄序，原樣保留）；diagnosis：通路健檢頁（V3-5，PRD §7.2 第 3 點、§9.4 C3）。 */
export type ChannelTableVariant = "default" | "diagnosis";

interface ChannelWideTableProps { summary: SummaryData; onEvidence: (evidence: EvidenceSelection) => void; ariaLabel: string; caption: string; variant?: ChannelTableVariant }

/**
 * 通路寬表（上期／本期／差額）。R1 起同時用於通路健檢頁頂與會議摘要；數字一律可開「計算與來源」。欄名由 labels.periods 與 metricDefinitions 組成，示範資料的通路名僅在顯示層套 alias。
 * V3-2b：L2（整數元、千分位、U+2212）；單位「元」只在 caption 標一次；差額欄只有不利上色（依 favorableDirection）。
 * V3-5：variant="diagnosis" 改成台灣報表欄序（本期｜上期｜差額，欄群組標單位）、可排序、備註欄與手機清單；會議摘要仍用 default。
 */
export function ChannelWideTable({ summary, onEvidence, ariaLabel, caption, variant = "default" }: ChannelWideTableProps) {
  if (variant === "diagnosis") return <DiagnosisChannelTable summary={summary} onEvidence={onEvidence} ariaLabel={ariaLabel} caption={caption} />;
  const alias = demoAlias(summary.dataset_id);
  const columnHeaders = (["net_revenue", "contribution_after_marketing"] as const).flatMap(name => [`${labels.periods.previous}${metricDefinitions[name].shortLabel}`, `${labels.periods.current}${metricDefinitions[name].shortLabel}`, `${metricDefinitions[name].shortLabel}${labels.csvSuffix.change}`]);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? labels.status.missing : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value)}</button>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table><caption>{fill(labels.ui.channelTable.unitCaption, { caption })}</caption><thead><tr><th scope="col">{labels.ui.channelTable.channelHeader}</th>{columnHeaders.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{channelLabel(row.channel, alias)}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>{labels.ui.channelTable.turnedNegative}</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>{labels.ui.channelTable.turnedPositive}</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`} className={period === "change" ? metric.evidence.change.metric.value === null ? "neutral" : toneClass(deltaTone(metric.metric, metric.evidence.change.metric.value, "L2")) : ""}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div>;
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
  return period === "change" ? fill(tableV3.changeLabel, { metric }) : fill(tableV3.cellLabel, { period: labels.periods[period], metric });
}
const periodText = (period: Period) => period === "change" ? tableV3.change : labels.periods[period];

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

function DiagnosisChannelTable({ summary, onEvidence, ariaLabel, caption }: Omit<ChannelWideTableProps, "variant">) {
  const [sort, setSort] = useState<ChannelSort>(DEFAULT_CHANNEL_SORT);
  const alias = demoAlias(summary.dataset_id);
  const rows = sortChannelRows(summary.channels, sort);
  const toggle = (key: ChannelSortKey) => setSort(current => current.key === key ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" });
  // PRD §7 共通規則的可及名稱句型「{通路} {指標} {值} 元，看明細」（labels.overview.channelsV3.amountAria），取代 manager-summary 的「一頁摘要 · …」標題。
  const amount = (evidence: SummaryEvidence, signed: boolean, channel: string, label: string) => {
    const text = evidence.metric.value === null ? labels.status.missing : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value);
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
  return <div className="table-scroll channel-table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}>
    <table className="ui-table channel-table-v3" role="table">
      <caption>{caption}</caption>
      <colgroup><col /></colgroup>{GROUPS.map(name => <colgroup key={name} span={3} />)}<colgroup><col /></colgroup>
      <thead role="rowgroup">
        <tr role="row" className="group-row"><th role="columnheader" scope="col" rowSpan={2} className="channel-col">{labels.ui.channelTable.channelHeader}</th>{GROUPS.map(name => <th key={name} role="columnheader" scope="colgroup" colSpan={3} className="group-head">{fill(labels.format.units.yuanColumn, { label: metricDefinitions[name].label })}</th>)}<th role="columnheader" scope="col" rowSpan={2} className="note-col">{tableV3.note}</th></tr>
        <tr role="row" className="column-row">{GROUPS.flatMap(name => PERIODS.map(period => header(name, period)))}</tr>
      </thead>
      <tbody role="rowgroup">{rows.map(row => {
        const turned = deltaWord("contribution_after_marketing", row.contribution.change.value, { previous: row.contribution.previous.value });
        const group = channelDiagnosis(summary, row.channel);
        return <tr key={row.channel} role="row">
          <th role="rowheader" scope="row" className="channel-cell" data-label={labels.ui.channelTable.channelHeader} data-list-role="primary">{channelLabel(row.channel, alias)}</th>
          {GROUPS.flatMap(name => PERIODS.map(period => {
            const metric = metricOf(row, name);
            const value = metric.evidence[period].metric.value;
            const tone = period !== "change" ? "" : value === null ? " neutral" : ` ${toneClass(deltaTone(name, value, "L2"))}`;
            const listRole = period === "previous" ? "secondary" : name === "contribution_after_marketing" ? "labeled" : "secondary";
            return <td key={`${name}-${period}`} role="cell" className={`num${period === "previous" ? " prev" : ""}${tone}`} data-label={columnLabel(name, period, true)} data-list-role={listRole}>{amount(metric.evidence[period], period === "change", channelLabel(row.channel, alias), columnLabel(name, period, false))}</td>;
          }))}
          <td role="cell" className="note-cell" data-label={tableV3.note} data-list-role="secondary">{turned === labels.format.turnedLoss && <span className="ui-lozenge" data-tone="unfavorable">{labels.overview.channelsV3.turnedNegative}</span>}{turned === labels.format.turnedPositive && <span className="ui-lozenge">{labels.overview.channelsV3.turnedPositive}</span>}{group && <a className="note-link" href={`#diagnosis-row-${group.rule}`} onClick={event => jumpToRow(event, group.rule)}>{group.headline}</a>}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
