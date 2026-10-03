import { dayCount, isBusinessDate } from "@/domain/date";
import type { Period } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { CsvParseError, parseCsv, type ParsedCsv } from "@/lib/csv";
import { encodeCsv } from "./export";

// R4 促銷檔期（events.csv，選配；05 §4）。只用於趨勢圖區帶與三件事標題提示，不參與任何金額計算。
export interface EventRow {
  start: string;
  end: string;
  label: string;
  /** events.csv 的原始行號。 */
  line: number;
}
export interface EventSet { filename: string | null; rows: EventRow[] }

export interface EventIssue { line: number | null; field: string; reason_code: string; message: string }
export interface EventBand { event: EventRow; from: number; to: number }

export const EVENT_COLUMNS = ["start", "end", "label"] as const;
export const EVENT_LABEL_MAX = 60;
/** 與備份 v4 的 schema 共用：超過就不接受，否則存檔會失敗。 */
export const MAX_EVENT_ROWS = 500;
/** 列舉分隔符（標點，非文案；與既有元件的 join 慣例一致）。 */
const LIST_JOINER = labels.events.joiner;
const DAY_MS = 86_400_000;

function issue(reason_code: string, line: number | null, field: string): EventIssue {
  const template = labels.events.errors[reason_code];
  return { line, field, reason_code, message: template ? fill(template, { line, field }) : reason_code };
}

/** 讀入 events.csv。任何一個問題都讓 set 為 null，問題逐列附行號。 */
export function parseEvents(payload: { name: string; bytes: Uint8Array }): { set: EventSet | null; issues: EventIssue[] } {
  let parsed: ParsedCsv;
  try {
    parsed = parseCsv(payload.bytes);
  } catch (error) {
    // 空檔（連標題列都沒有）與「只有標題列」同樣歸為 EMPTY，訊息走 labels。
    if (error instanceof CsvParseError && error.reason_code === "EMPTY_CSV") return { set: null, issues: [issue("EMPTY", null, "$record")] };
    if (error instanceof CsvParseError) return { set: null, issues: [{ line: error.line, field: error.field, reason_code: error.reason_code, message: error.message }] };
    throw error;
  }
  if (parsed.headers.length === 0) return { set: null, issues: [issue("EMPTY", null, "$record")] };
  const missing = EVENT_COLUMNS.filter(column => !parsed.headers.includes(column));
  if (missing.length > 0) return { set: null, issues: missing.map(column => issue("MISSING_COLUMN", parsed.headerLine, column)) };
  if (parsed.rows.length === 0) return { set: null, issues: [issue("EMPTY", null, "$record")] };

  const index = Object.fromEntries(EVENT_COLUMNS.map(column => [column, parsed.headers.indexOf(column)])) as Record<typeof EVENT_COLUMNS[number], number>;
  const issues: EventIssue[] = [];
  const rows: EventRow[] = [];
  for (const { line, values } of parsed.rows) {
    const start = values[index.start].trim();
    const end = values[index.end].trim();
    const label = values[index.label].trim();
    const before = issues.length;
    if (!isBusinessDate(start)) issues.push(issue("INVALID_DATE", line, "start"));
    if (!isBusinessDate(end)) issues.push(issue("INVALID_DATE", line, "end"));
    if (isBusinessDate(start) && isBusinessDate(end) && end < start) issues.push(issue("PERIOD_ORDER", line, "end"));
    if (label === "") issues.push(issue("EMPTY_LABEL", line, "label"));
    else if ([...label].length > EVENT_LABEL_MAX) issues.push(issue("LABEL_TOO_LONG", line, "label"));
    if (issues.length === before) rows.push({ start, end, label, line });
  }
  if (rows.length > MAX_EVENT_ROWS) issues.push({ ...issue("TOO_MANY_ROWS", null, "$record"), message: fill(labels.events.errors.TOO_MANY_ROWS, { max: MAX_EVENT_ROWS }) });
  if (issues.length > 0) return { set: null, issues };
  // 穩定排序：同起訖時保留原檔順序。
  rows.sort((a, b) => a.start === b.start ? (a.end < b.end ? -1 : a.end > b.end ? 1 : 0) : a.start < b.start ? -1 : 1);
  return { set: { filename: payload.name, rows }, issues: [] };
}

/** 與期間有交集的檔期（含端點相接，例如檔期迄日＝期間起日），依排序順序回傳。 */
export function overlapping(set: EventSet | null | undefined, period: Period): EventRow[] {
  if (!set) return [];
  return set.rows.filter(row => row.start <= period.end && period.start <= row.end);
}

const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * 檔期在週軸上的水平位置：第 i 週佔 [i, i+1)，週內依天數等分。
 * from＝起日當天開始的位置，to＝迄日當天結束的位置；夾在 [0, weeks.length]，完全落在軸外的檔期略過。
 */
export function eventBands(set: EventSet | null | undefined, weeks: readonly { start: string; end: string }[]): EventBand[] {
  if (!set || weeks.length === 0) return [];
  const axis = weeks.map(week => ({ first: dayIndex(week.start), days: dayCount(week) }));
  const bands: EventBand[] = [];
  for (const event of set.rows) {
    const first = dayIndex(event.start);
    const last = dayIndex(event.end);
    let from: number | null = null;
    let to: number | null = null;
    axis.forEach((week, i) => {
      const weekLast = week.first + week.days - 1;
      if (first > weekLast || last < week.first) return;
      if (from === null) from = i + Math.max(0, first - week.first) / week.days;
      to = i + (Math.min(last, weekLast) - week.first + 1) / week.days;
    });
    if (from === null || to === null) continue;
    bands.push({ event, from: Math.min(Math.max(from, 0), weeks.length), to: Math.min(Math.max(to, 0), weeks.length) });
  }
  return bands;
}

/** 三件事標題後的檔期提示，例如「（夏季特賣期間）」；多個檔期以「、」併列，無重疊回傳空字串。不改任何數字。 */
export function eventSuffix(set: EventSet | null | undefined, period: Period): string {
  const names = [...new Set(overlapping(set, period).map(row => row.label))];
  return names.length === 0 ? "" : fill(labels.events.during, { label: names.join(LIST_JOINER) });
}

/** 空白範本（只有標題列），與 standardCsvTemplate 同格式。 */
export function eventsCsvTemplate(): string {
  return `﻿${EVENT_COLUMNS.join(",")}\r\n`;
}

/** 匯出目前檔期；文字欄位沿用 encodeCsv 的公式注入防護。 */
export function exportEventsCsv(set: EventSet): string {
  return encodeCsv([
    EVENT_COLUMNS.map(value => ({ kind: "text" as const, value })),
    ...set.rows.map(row => [row.start, row.end, row.label].map(value => ({ kind: "text" as const, value }))),
  ]);
}

/** 還原備份時重新檢查已解析的檔期（規則與 parseEvents 相同）。 */
export function eventRowIssues(rows: readonly EventRow[]): EventIssue[] {
  const issues: EventIssue[] = [];
  if (rows.length > MAX_EVENT_ROWS) issues.push({ ...issue("TOO_MANY_ROWS", null, "$record"), message: fill(labels.events.errors.TOO_MANY_ROWS, { max: MAX_EVENT_ROWS }) });
  for (const row of rows) {
    if (!isBusinessDate(row.start)) issues.push(issue("INVALID_DATE", row.line, "start"));
    if (!isBusinessDate(row.end)) issues.push(issue("INVALID_DATE", row.line, "end"));
    if (isBusinessDate(row.start) && isBusinessDate(row.end) && row.end < row.start) issues.push(issue("PERIOD_ORDER", row.line, "end"));
    if (row.label.trim() === "") issues.push(issue("EMPTY_LABEL", row.line, "label"));
    else if ([...row.label].length > EVENT_LABEL_MAX) issues.push(issue("LABEL_TOO_LONG", row.line, "label"));
  }
  return issues;
}
