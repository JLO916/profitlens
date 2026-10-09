"use client";

import type { ReactNode } from "react";
import { emptyKindOf, formatAmountL2, formatAmountL3, formatCount, formatEmpty, formatMultiple, formatPerUnit, formatRateLayer, formatSignedDelta } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../evidence-drawer";
import { onChartTableToggle } from "../overview/charts/chart-frame";

// V4-2 代理 A：C33 ChartDataTable 資料表產生器（PRD §6.3 C33、§8.1；CHART_CATALOG §1.4）。第一個使用者是 G7a「各指標每週」，V4-3a 起各新圖共用。
// 輸出 div.table-scroll[role=region][tabindex=0][aria-label=caption] > table[data-testid=chart-{page}-{id}-table]：
// caption 寫單位、th scope 齊全；數字格右對齊、tabular（.num）、負號 U+2212（格式化一律經 presentation.ts）；
// 數字格的 evidenceOf 回傳非 null 時是 button.number-link（與圖上點擊同一個 builder），回傳 null 時是純文字（試算、凍結值等）。
// 列數＝資料長度（含整列缺值的列）；限制句放在表格之後（仍在 <details> 內，不進主層，B8）。
// 使用者看得到的字一律由呼叫端從 labels 取來傳入；本元件只用 labels.overview.page.dataTable 組 summary（「表格 · {title}」，CHART_CATALOG §1.1）。

/**
 * 格的單位（決定格式化函式）：money 金額、rate 比率（domain 的小數）、count 件數、multiple 倍數、per_unit 件均、text 原樣、date ISO 日期原樣。
 * V4-4：signed＝帶正負號的金額差額（formatSignedDelta，L2「+9,350」「−8,600」，同商品前 10 名表的差額格；G13 資料表的差額欄）。
 */
export type ChartDataUnit = "money" | "signed" | "rate" | "count" | "multiple" | "per_unit" | "text" | "date";
/** 金額層：L2 整數元、L3 到分（單位寫在欄頭或 caption，例如「（元）」）；比率、倍數、件均依 presentation.ts 的同層格式。 */
export type ChartDataLayer = "L2" | "L3";

/** 一欄。data 是呼叫端自帶的資料（例如該欄的週），valueOf／evidenceOf 用它取值。 */
export interface ChartDataColumn<C = undefined> {
  key: string;
  /** 欄頭第一行（純文字）。 */
  label: string;
  /** 欄頭第二行以後的小字（例如週的起訖、「未滿 7 天」）。 */
  notes?: readonly string[];
  /** 這一欄的預設單位與層；格可以覆寫。 */
  unit?: ChartDataUnit;
  layer?: ChartDataLayer;
  data: C;
}
/** 一格的值：value 是 domain 或 B 級函式回傳的精確字串；null 時依 reasonCodes 寫「資料待補」或「不適用」（或 emptyText）。 */
export interface ChartDataCell {
  value: string | null;
  reasonCodes?: readonly string[];
  unit?: ChartDataUnit;
  layer?: ChartDataLayer;
  /** 空值的顯示字（例如輔助指標的「不適用」）；不給時用 formatEmpty(emptyKindOf(reasonCodes))。 */
  emptyText?: string;
}
/** 列名欄（th scope=row）。 */
export interface ChartDataRowHeader {
  label: string;
  /** th 的 title（例如指標的白話定義）。 */
  title?: string;
}

export interface ChartDataTableProps<R, C = undefined> {
  /** table 的 data-testid：chart-{page}-{id}-table（PRD §4.7）。 */
  testId: string;
  /** caption（含單位）；同時是捲動容器的 aria-label。 */
  caption: string;
  /** 第一欄（列名）的欄頭。 */
  rowHeaderLabel: string;
  rows: readonly R[];
  rowKey: (row: R) => string;
  rowHeader: (row: R) => ChartDataRowHeader;
  columns: readonly ChartDataColumn<C>[];
  valueOf: (row: R, column: ChartDataColumn<C>) => ChartDataCell;
  /** 與圖上點擊同一個 builder；回傳 null 的格是純文字。 */
  evidenceOf: (row: R, column: ChartDataColumn<C>) => EvidenceSelection | null;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** number-link 的可及名稱；不給時就是可見文字。 */
  cellAria?: (row: R, column: ChartDataColumn<C>, text: string) => string;
  /** 表格之後的說明句（限制句、未滿 7 天的註記）；仍在 <details> 內。 */
  notes?: readonly string[];
  className?: string;
}

/** 數字格的顯示字（純函式，測試用）：依格或欄的單位與層選 presentation.ts 的格式化函式；空值寫「資料待補」或「不適用」。 */
export function chartDataCellText(cell: ChartDataCell, column: Pick<ChartDataColumn<unknown>, "unit" | "layer">): string {
  if (cell.value === null) return cell.emptyText ?? formatEmpty(emptyKindOf(cell.reasonCodes));
  const unit = cell.unit ?? column.unit ?? "text";
  const layer = cell.layer ?? column.layer ?? "L2";
  switch (unit) {
    case "money": return layer === "L3" ? formatAmountL3(cell.value) : formatAmountL2(cell.value);
    case "signed": return formatSignedDelta(cell.value, layer);
    case "rate": return formatRateLayer(cell.value, layer);
    case "count": return formatCount(cell.value, layer);
    case "multiple": return formatMultiple(cell.value, layer);
    case "per_unit": return formatPerUnit(cell.value, layer);
    case "text":
    case "date": return cell.value;
  }
}
const isNumeric = (unit: ChartDataUnit | undefined) => unit !== undefined && unit !== "text" && unit !== "date";

/** C33 表格本體（.table-scroll > table）。 */
export function ChartDataTable<R, C = undefined>({ testId, caption, rowHeaderLabel, rows, rowKey, rowHeader, columns, valueOf, evidenceOf, onEvidence, cellAria, notes, className }: ChartDataTableProps<R, C>) {
  return <>
    <div className="table-scroll chart-data-scroll" role="region" tabIndex={0} aria-label={caption}>
      <table className={`ui-table chart-data-table${className ? ` ${className}` : ""}`} data-density="compact" data-testid={testId}>
        <caption>{caption}</caption>
        <thead><tr>
          <th scope="col">{rowHeaderLabel}</th>
          {columns.map(column => <th key={column.key} scope="col" className={isNumeric(column.unit) ? "num" : undefined}>{column.label}{column.notes?.map(note => <small key={note}>{note}</small>)}</th>)}
        </tr></thead>
        <tbody>{rows.map(row => {
          const header = rowHeader(row);
          return <tr key={rowKey(row)}>
            <th scope="row" title={header.title}>{header.label}</th>
            {columns.map(column => {
              const cell = valueOf(row, column);
              const text = chartDataCellText(cell, column);
              const evidence = evidenceOf(row, column);
              const numeric = isNumeric(cell.unit ?? column.unit);
              const content: ReactNode = evidence === null ? text
                : <button type="button" className="number-link" aria-label={cellAria ? cellAria(row, column, text) : undefined} onClick={() => onEvidence(evidence)}>{text}</button>;
              return <td key={column.key} className={`${numeric ? "num" : ""}${cell.value === null ? " is-empty" : ""}`.trim() || undefined}>{content}</td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
    {notes?.map(note => <p key={note} className="note">{note}</p>)}
  </>;
}

/** 給 ChartFrame 的 dataTable（{summary, content}）：summary 是「表格 · {title}」（labels.overview.page.dataTable，CHART_CATALOG §1.1）。 */
export function chartDataTable<R, C = undefined>({ title, ...table }: ChartDataTableProps<R, C> & { title: string }): { summary: string; content: ReactNode } {
  return { summary: fill(labels.overview.page.dataTable, { title }), content: <ChartDataTable {...table} /> };
}

/**
 * 不在 ChartFrame 裡的圖（表格內嵌的 sparkline、內嵌條）用的獨立資料表：<details class="data-alternative">，收合時保持掛載（M1）；
 * 展開時記 track("chart_table_opened")（只記事件名，D-V4-14）。testId 給 <details>（選填）。
 */
export function ChartDataDetails<R, C = undefined>({ title, detailsTestId, ...table }: ChartDataTableProps<R, C> & { title: string; detailsTestId?: string }) {
  const { summary, content } = chartDataTable({ title, ...table });
  return <details className="data-alternative" data-testid={detailsTestId} onToggle={onChartTableToggle}><summary>{summary}</summary>{content}</details>;
}
