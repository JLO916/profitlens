"use client";

import { useId, useMemo, useState } from "react";
import { buildPnlTable, PNL_DAY_COLUMN_LIMIT, type PnlCell, type PnlColumn, type PnlGranularity, type PnlRow } from "@/application/pnl-table";
import { emptyKindOf, formatAmountL2, formatDateL1, formatEmpty, formatPeriodL1, formatRateL1, metricDefinitions, periodDays } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../evidence-drawer";

const copy = labels.overview.pnlV3;

/** F9 列名（§9.3）：費用列寫「減：{指標名}」，其餘用 metricDefinitions 的指標名。 */
export const pnlRowLabel = (row: Pick<PnlRow, "metric" | "deduct">): string => row.deduct ? fill(copy.rowDeduct, { label: metricDefinitions[row.metric].label }) : metricDefinitions[row.metric].label;
/** F9 欄名（§8.6）：日欄 M/D（與資料到的年份不同時寫年份），週欄沿用 WeeklyRow.label。 */
export const pnlColumnLabel = (column: PnlColumn, anchor: string): string => column.granularity === "day" ? formatDateL1(column.label, { anchor }) : column.label;
/** F9 格子（L2 整數元，負數 U+2212）；缺值依原因碼寫資料待補／不適用。 */
export const pnlCellText = (cell: PnlCell): string => cell.metric.value === null ? formatEmpty(emptyKindOf(cell.metric.reason_codes)) : formatAmountL2(cell.metric.value);
/** F9 佔淨營收 %（L1 一位小數，從精確比率取位）；淨營收 ≤ 0 寫不適用，缺值寫資料待補。 */
export const pnlShareText = (row: Pick<PnlRow, "share">): string => formatRateL1(row.share.value, emptyKindOf(row.share.reason_codes));
/** F9 每格的「計算與來源」（PRD §11.6）：指標、該格的值、期間（那天、那週或本期）、本期的通路範圍與來源列；版本沿用 contribution-v1。 */
export function pnlEvidence(snapshot: WorkspaceSnapshot, row: Pick<PnlRow, "metric">, cell: PnlCell, columnText: string): EvidenceSelection {
  return { title: fill(copy.evidenceTitle, { metric: metricDefinitions[row.metric].label, date: columnText }), name: row.metric, metric: cell.metric, period: cell.period, channels: snapshot.report.scope.channels, sources: cell.sources };
}

export interface PnlTableProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/**
 * 總覽區塊 10「進階」內的每日／每週管理損益表（PRD §10.1 F9、§9.3 報表型表格；D-V3-19＝A、D-V3-8 螢幕用 U+2212）。
 * <details> 預設收合、內容保持掛載（§6.4 M1）；日／週分段與「顯示零值列」各只有一份（M6）；零值列用 hidden 隱藏但掛載。
 * 每格金額是 number-link，開「計算與來源」；佔淨營收 % 是呈現層比率（合計 ÷ 淨營收合計），不另開抽屜。
 */
export function PnlTable({ snapshot, onEvidence }: PnlTableProps) {
  const [granularity, setGranularity] = useState<PnlGranularity>("day");
  const [showZero, setShowZero] = useState(false);
  const tableId = useId();
  const limitId = useId();
  const { period } = snapshot.report.current;
  // 本期超過一季時只提供每週（日欄上限 PNL_DAY_COLUMN_LIMIT），避免總覽掛載過多格子。
  const dayAvailable = (periodDays(period.start, period.end) ?? Number.POSITIVE_INFINITY) <= PNL_DAY_COLUMN_LIMIT;
  const active: PnlGranularity = dayAvailable ? granularity : "week";
  const table = useMemo(() => buildPnlTable(snapshot, active), [snapshot, active]);
  const anchor = snapshot.data_as_of;
  const columnTexts = table.columns.map(column => pnlColumnLabel(column, anchor));
  const link = (row: PnlRow, cell: PnlCell, columnText: string, col: string) => {
    const text = pnlCellText(cell);
    return <td key={col} className="num" data-col={col}><button type="button" className="number-link" aria-label={fill(copy.cellAria, { date: columnText, metric: metricDefinitions[row.metric].label, value: text })} onClick={() => onEvidence(pnlEvidence(snapshot, row, cell, columnText))}>{text}</button></td>;
  };

  return <details className="panel pnl-table" aria-labelledby="pnl-table-title" data-testid="pnl-table">
    <summary><span className="section-title">{copy.summary}</span></summary>
    <h2 id="pnl-table-title" className="sr-only">{copy.summary}</h2>
    <div className="pnl-toolbar">
      <div className="ui-segmented" role="group" aria-label={copy.granularity.aria}>
        <button type="button" aria-pressed={active === "day"} data-testid="pnl-granularity-day" disabled={!dayAvailable} aria-describedby={dayAvailable ? undefined : limitId} onClick={() => setGranularity("day")}>{copy.granularity.day}</button>
        <button type="button" aria-pressed={active === "week"} data-testid="pnl-granularity-week" onClick={() => setGranularity("week")}>{copy.granularity.week}</button>
      </div>
      <button type="button" className="ui-btn ui-btn-secondary pnl-zero-toggle" aria-pressed={showZero} aria-controls={tableId} data-testid="pnl-show-zero" onClick={() => setShowZero(value => !value)}>{copy.showZero}</button>
      {!dayAvailable && <p className="note pnl-limit" id={limitId}>{fill(copy.dayLimit, { n: PNL_DAY_COLUMN_LIMIT })}</p>}
      <p className="pnl-unit">{copy.unit}</p>
    </div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.tableAria}>
      <table className="ui-table report-table" id={tableId} data-granularity={active}>
        <caption className="sr-only">{fill(copy.caption, { granularity: copy.granularity[active] })}</caption>
        <thead><tr>
          <th scope="col">{copy.columns.item}</th>
          {table.columns.map((column, index) => <th scope="col" className="num" key={column.id} data-col={column.id}>{column.granularity === "week" ? <><span className="pnl-col-label">{columnTexts[index]}</span><span className="pnl-col-range">{formatPeriodL1(column.period.start, column.period.end, { anchor, days: false })}</span></> : columnTexts[index]}</th>)}
          <th scope="col" className="num" data-col="total">{copy.columns.total}</th>
          <th scope="col" className="num" data-col="share">{copy.columns.share}</th>
        </tr></thead>
        <tbody>{table.rows.map(row => <tr key={row.metric} className={`pnl-row-${row.kind}`} data-row={row.metric} data-zero={row.isZero ? "true" : undefined} hidden={row.kind === "item" && row.isZero && !showZero ? true : undefined}>
          <th scope="row">{pnlRowLabel(row)}</th>
          {row.cells.map((cell, index) => table.columns[index].hasData ? link(row, cell, columnTexts[index], table.columns[index].id) : <td key={table.columns[index].id} className="num pnl-empty" data-col={table.columns[index].id}>{copy.noData}</td>)}
          {link(row, row.total, copy.columns.total, "total")}
          <td className="num" data-col="share">{pnlShareText(row)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <details className="data-alternative"><summary>{labels.evidence.sections.technicalDetails}</summary><p className="note">{copy.noteTechnical}</p></details>
  </details>;
}
