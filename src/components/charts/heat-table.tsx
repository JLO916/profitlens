"use client";

import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";

// V4-3b 代理 A：C28 HeatTable 熱表（PRD §6.3 C28、§4.4–§4.5 G11、§7.5、§8.1；CHART_CATALOG G11、§1.5；D-V4-17＝A）。
// 原生 <table>（每張 role="grid"），放在 ChartFrame mode="table" 的 .table-scroll 內，不在 aria-hidden 容器內；th scope 齊全、caption 寫通路與單位。
// calendar 排法：每通路一張（列＝週、欄＝該週第 1 到 7 天），多張依 DOM 順序排（CSS grid auto-fill 依框寬決定每列張數，不用 CSS order）；
// matrix 排法：一張（列＝週、欄＝通路；本期超過 92 天的週 × 通路）。V4-7a 的 G21（檔案 × 原因）可沿用 matrix。
// 格：td[data-tier="0|1|2|missing|outside"]，底色與框線只由 globals.css 依 data-tier 套 --chart-heat-1／-2、--chart-unfavorable、--chart-missing（元件不寫色）；
// 期間外的格留白、不可聚焦；其他格內是 button.number-link（可見文字由呼叫端用 formatHeatCell 或「資料待補」給，可及名稱帶 L2）。
// 鍵盤（grid 型 roving tabindex）：整個熱表（含多張月曆）只有 1 個 Tab 停留點（上次停留的格，一開始是第一個有值的格）；
// 方向鍵在格間移動（左右沿 DOM 順序、上下同一欄，跨月曆時接到下一張的同一欄），Home／End 到該列首尾（加 Ctrl 到整個熱表的首尾），
// Enter 或空白鍵由按鈕原生觸發點擊。點擊、按鍵與聚焦都用外層的事件代理（每格不掛 handler），格數上限 8 × 92＝736（PRD §8.2）。

export type HeatTableTier = 0 | 1 | 2 | "missing" | "outside";
/** 一格：outside 只留白；其他格是 number-link（text＝可見文字，aria＝可及名稱，testId＝chart-{page}-{id}-cell-{語意 key}）。 */
export interface HeatTableCell {
  key: string;
  tier: HeatTableTier;
  text: string;
  aria?: string;
  testId?: string;
}
/** 一列：head 是列頭（th scope=row），note 是列頭下一行的小字（例如「未滿 7 天」）。 */
export interface HeatTableRow {
  key: string;
  head: string;
  note?: string;
  cells: readonly HeatTableCell[];
}
/** 一張表：corner 是左上角欄頭，columns 是其餘欄頭（th scope=col）。 */
export interface HeatTableSpec {
  key: string;
  caption: string;
  corner: string;
  columns: readonly { key: string; label: string }[];
  rows: readonly HeatTableRow[];
}
/** 格的位置（第幾張表、第幾列、第幾格；只在元件內部與 onActivate 使用，不進 testid）。 */
export interface HeatPosition {
  table: number;
  row: number;
  cell: number;
}
export interface HeatTableProps {
  tables: readonly HeatTableSpec[];
  layout: "calendar" | "matrix";
  /** 格被點擊（或按 Enter／空白鍵）：呼叫端依位置找到同一個抽屜 builder。 */
  onActivate: (position: HeatPosition) => void;
}

const positionId = (position: HeatPosition) => `${position.table}:${position.row}:${position.cell}`;

/** 可聚焦的格（期間外以外的格）依 DOM 順序列出；第一個有值（不是資料待補）的格是預設停留點。 */
export function heatPositions(tables: readonly HeatTableSpec[]): { positions: HeatPosition[]; initial: number } {
  const positions: HeatPosition[] = [];
  let initial = -1;
  tables.forEach((spec, table) => spec.rows.forEach((line, row) => line.cells.forEach((item, cell) => {
    if (item.tier === "outside") return;
    if (initial < 0 && item.tier !== "missing") initial = positions.length;
    positions.push({ table, row, cell });
  })));
  return { positions, initial: positions.length === 0 ? -1 : Math.max(initial, 0) };
}

/**
 * 方向鍵、Home、End 的移動（純函式）：回傳目標在 positions 的序號；不是導覽鍵時回傳 null（交給瀏覽器，例如 Tab、Enter）。
 * 左右沿 DOM 順序（跨列、跨月曆）；上下找同一欄的下一列或上一列（同一張表沒有了就接到下一張或上一張表）；到邊界時留在原格。
 */
export function heatMove(positions: readonly HeatPosition[], from: number, key: string, ctrlKey = false): number | null {
  const here = positions[from];
  if (!here) return null;
  const sameRow = (item: HeatPosition) => item.table === here.table && item.row === here.row;
  const later = (item: HeatPosition) => item.table > here.table || (item.table === here.table && item.row > here.row);
  const earlier = (item: HeatPosition) => item.table < here.table || (item.table === here.table && item.row < here.row);
  const found = (target: number) => (target < 0 ? from : target);
  switch (key) {
    case "ArrowRight": return Math.min(from + 1, positions.length - 1);
    case "ArrowLeft": return Math.max(from - 1, 0);
    case "ArrowDown": return found(positions.findIndex((item, at) => at > from && item.cell === here.cell && later(item)));
    case "ArrowUp": return found(positions.findLastIndex((item, at) => at < from && item.cell === here.cell && earlier(item)));
    case "Home": return ctrlKey ? 0 : positions.findIndex(sameRow);
    case "End": return ctrlKey ? positions.length - 1 : positions.findLastIndex(sameRow);
    default: return null;
  }
}

const NAV_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]);
const cellButton = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLButtonElement>("button[data-cell]") : null);
const parsePosition = (id: string): HeatPosition => {
  const [table, row, cell] = id.split(":").map(Number);
  return { table, row, cell };
};

/** C28 熱表本體：外層 div.heat-grid（事件代理）＋每張 table.heat-table[role=grid]。 */
export function HeatTable({ tables, layout, onActivate }: HeatTableProps) {
  const { positions, initial } = useMemo(() => heatPositions(tables), [tables]);
  const ids = useMemo(() => positions.map(positionId), [positions]);
  const [active, setActive] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  // 上次停留的格仍存在就沿用；資料換了（例如切期間）而那一格不在時回到第一個有值的格。
  const current = active !== null && ids.includes(active) ? active : (ids[initial] ?? null);

  const focusAt = (index: number) => {
    const id = ids[index];
    if (id === undefined) return;
    setActive(id);
    grid.current?.querySelector<HTMLButtonElement>(`button[data-cell="${id}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(event.key)) return;
    const button = cellButton(event.target);
    if (!button) return;
    const next = heatMove(positions, ids.indexOf(button.dataset.cell ?? ""), event.key, event.ctrlKey || event.metaKey);
    if (next === null) return;
    event.preventDefault();
    focusAt(next);
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const button = cellButton(event.target);
    if (button?.dataset.cell) setActive(button.dataset.cell);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = cellButton(event.target);
    if (!button?.dataset.cell) return;
    setActive(button.dataset.cell);
    onActivate(parsePosition(button.dataset.cell));
  };

  return <div ref={grid} className="heat-grid" data-layout={layout} onKeyDown={onKeyDown} onFocus={onFocus} onClick={onClick}>
    {tables.map((spec, table) => <table key={spec.key} className="heat-table" role="grid">
      <caption>{spec.caption}</caption>
      <thead><tr><th scope="col">{spec.corner}</th>{spec.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{spec.rows.map((line, row) => <tr key={line.key}>
        <th scope="row">{line.head}{line.note !== undefined && <small>{line.note}</small>}</th>
        {line.cells.map((item, cell) => {
          if (item.tier === "outside") return <td key={item.key} data-tier="outside" />;
          const id = positionId({ table, row, cell });
          // 資料待補的字包在 span.heat-missing（CSS 限寬 2 字、兩行），列高與有值的格相同。
          return <td key={item.key} data-tier={item.tier} data-testid={item.testId}><button type="button" className="number-link heat-link" tabIndex={id === current ? 0 : -1} aria-label={item.aria} data-cell={id}>{item.tier === "missing" ? <span className="heat-missing">{item.text}</span> : item.text}</button></td>;
        })}
      </tr>)}</tbody>
    </table>)}
  </div>;
}
