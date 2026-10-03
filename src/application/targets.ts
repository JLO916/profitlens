import Decimal from "decimal.js";
import { dayCount, isBusinessDate } from "@/domain/date";
import { formatCents, parseCents } from "@/domain/money";
import type { Metric, MetricName, Period } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { CsvParseError, parseCsv } from "@/lib/csv";
import { formatMoney } from "./presentation";

// R4 目標與達成率（targets.csv，選配；05_FEATURES §3）。
// 目標是使用者輸入的參考值，不進入任何財務計算；只在本期與目標期間完全相同時顯示達成率，不按比例折算。
export const TARGET_METRICS = ["net_revenue", "gross_profit", "contribution_after_marketing", "ad_spend"] as const;
export type TargetMetric = typeof TARGET_METRICS[number] & MetricName;
export interface TargetRow {
  period_start: string;
  period_end: string;
  /** 通路名稱或 "ALL"（全部通路）。 */
  channel: string;
  metric: TargetMetric;
  /** 未稅 TWD，兩位小數字串。 */
  target: string;
  /** targets.csv 的原始行號。 */
  line: number;
}
export interface TargetSet { filename: string | null; rows: TargetRow[] }

export const TARGETS_FILE = "targets.csv";
export const TARGET_ALL_CHANNELS = "ALL";
export const TARGET_COLUMNS = ["period_start", "period_end", "channel", "metric", "target"] as const;
export type TargetColumn = typeof TARGET_COLUMNS[number];
export type TargetReasonCode = "MISSING_COLUMN" | "INVALID_DATE" | "PERIOD_ORDER" | "UNKNOWN_CHANNEL" | "INVALID_METRIC" | "INVALID_TARGET" | "DUPLICATE" | "EMPTY" | "TOO_MANY_ROWS";
/** 與備份 v4 的 schema 共用：超過就不接受，否則存檔會失敗。 */
export const MAX_TARGET_ROWS = 1_000;

/** targets.csv 的檢核結果。targets.csv 不屬於三份核心 CSV，所以不用 ValidationIssue。 */
export interface TargetIssue { line: number | null; field: string; reason_code: string; message: string }
export interface TargetParseResult { set: TargetSet | null; issues: TargetIssue[] }

export type TargetMatch = { status: "none" } | { status: "mismatch"; nearest: TargetRow } | { status: "matched"; row: TargetRow };
export interface TargetScope { current_period: Period; channels: readonly string[]; allChannels: readonly string[] }

export interface Achievement { rate: string | null; display: string; status: "ok" | "undefined" | "missing" }

const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

function isTargetMetric(value: string): value is TargetMetric {
  return (TARGET_METRICS as readonly string[]).includes(value);
}

function issue(reason_code: TargetReasonCode, line: number | null, field: string, values: { value?: string; other?: number; max?: number } = {}): TargetIssue {
  const template = labels.targets.errors[reason_code] ?? reason_code;
  return { line, field, reason_code, message: fill(template, { line, field, value: values.value, other: values.other }) };
}

/** 讀入 targets.csv。全有或全無：任何一列有錯，整份不採用（set = null），並列出每個錯誤的行號。 */
export function parseTargets(payload: { name: string; bytes: Uint8Array }, manifestChannels: readonly string[]): TargetParseResult {
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(payload.bytes);
  } catch (error) {
    if (error instanceof CsvParseError) return { set: null, issues: [{ line: error.line, field: error.field, reason_code: error.reason_code, message: error.message }] };
    throw error;
  }
  const headers = parsed.headers.map(header => header.trim());
  const index = {} as Record<TargetColumn, number>;
  const issues: TargetIssue[] = [];
  for (const column of TARGET_COLUMNS) {
    const position = headers.indexOf(column);
    if (position < 0) issues.push(issue("MISSING_COLUMN", parsed.headerLine, column));
    index[column] = position;
  }
  if (issues.length) return { set: null, issues };
  if (parsed.rows.length === 0) return { set: null, issues: [issue("EMPTY", null, "$record")] };

  const channels = new Set(manifestChannels);
  const rows: TargetRow[] = [];
  const seen = new Map<string, number>();
  for (const { line, values } of parsed.rows) {
    const cell = (column: TargetColumn) => values[index[column]].trim();
    const period_start = cell("period_start");
    const period_end = cell("period_end");
    const channel = cell("channel");
    const metric = cell("metric");
    const rawTarget = cell("target");
    const before = issues.length;

    const startValid = isBusinessDate(period_start);
    const endValid = isBusinessDate(period_end);
    if (!startValid) issues.push(issue("INVALID_DATE", line, "period_start", { value: period_start }));
    if (!endValid) issues.push(issue("INVALID_DATE", line, "period_end", { value: period_end }));
    if (startValid && endValid && period_end < period_start) issues.push(issue("PERIOD_ORDER", line, "period_end", { value: period_end }));
    if (channel !== TARGET_ALL_CHANNELS && !channels.has(channel)) issues.push(issue("UNKNOWN_CHANNEL", line, "channel", { value: channel }));
    if (!isTargetMetric(metric)) issues.push(issue("INVALID_METRIC", line, "metric", { value: metric }));
    const cents = MONEY_PATTERN.test(rawTarget) ? parseCents(rawTarget) : null;
    if (cents === null) issues.push(issue("INVALID_TARGET", line, "target", { value: rawTarget }));
    if (issues.length > before || cents === null || !isTargetMetric(metric)) continue;

    const key = JSON.stringify([period_start, period_end, channel, metric]);
    const other = seen.get(key);
    if (other !== undefined) {
      issues.push(issue("DUPLICATE", line, "$record", { other }));
      continue;
    }
    seen.set(key, line);
    rows.push({ period_start, period_end, channel, metric, target: formatCents(cents), line });
  }
  if (rows.length > MAX_TARGET_ROWS) issues.push(issue("TOO_MANY_ROWS", null, "$record", { max: MAX_TARGET_ROWS }));
  if (issues.length) return { set: null, issues };
  return { set: { filename: payload.name, rows }, issues: [] };
}

/** 還原備份時重新檢查已解析的列（規則與 parseTargets 相同）；回傳違規清單。 */
export function targetRowIssues(rows: readonly TargetRow[], manifestChannels: readonly string[]): TargetIssue[] {
  const issues: TargetIssue[] = [];
  const channels = new Set(manifestChannels);
  const seen = new Map<string, number>();
  if (rows.length > MAX_TARGET_ROWS) issues.push(issue("TOO_MANY_ROWS", null, "$record", { max: MAX_TARGET_ROWS }));
  for (const row of rows) {
    if (!isBusinessDate(row.period_start)) issues.push(issue("INVALID_DATE", row.line, "period_start", { value: row.period_start }));
    if (!isBusinessDate(row.period_end)) issues.push(issue("INVALID_DATE", row.line, "period_end", { value: row.period_end }));
    if (isBusinessDate(row.period_start) && isBusinessDate(row.period_end) && row.period_end < row.period_start) issues.push(issue("PERIOD_ORDER", row.line, "period_end"));
    if (row.channel !== TARGET_ALL_CHANNELS && !channels.has(row.channel)) issues.push(issue("UNKNOWN_CHANNEL", row.line, "channel", { value: row.channel }));
    if (!(TARGET_METRICS as readonly string[]).includes(row.metric)) issues.push(issue("INVALID_METRIC", row.line, "metric", { value: row.metric }));
    if (!/^-?\d+\.\d{2}$/.test(row.target)) issues.push(issue("INVALID_TARGET", row.line, "target", { value: row.target }));
    const key = JSON.stringify([row.period_start, row.period_end, row.channel, row.metric]);
    const other = seen.get(key);
    if (other !== undefined) issues.push(issue("DUPLICATE", row.line, "$record", { other }));
    seen.set(key, row.line);
  }
  return issues;
}

/** 本期篩選對應的目標通路鍵：全選 → "ALL"；只選一個 → 該通路；部分多選 → 無（不加總、不拆分目標）。 */
function scopeChannelKeys(scope: TargetScope): string[] {
  const selected = new Set(scope.channels);
  const all = new Set(scope.allChannels);
  const keys: string[] = [];
  if (selected.size > 0 && selected.size === all.size && [...all].every(channel => selected.has(channel))) keys.push(TARGET_ALL_CHANNELS);
  if (selected.size === 1) keys.push([...selected][0]);
  return keys;
}

function overlapDays(row: TargetRow, period: Period): number {
  const start = row.period_start > period.start ? row.period_start : period.start;
  const end = row.period_end < period.end ? row.period_end : period.end;
  return start <= end ? dayCount({ start, end }) : 0;
}
function gapDays(row: TargetRow, period: Period): number {
  if (row.period_end < period.start) return dayCount({ start: row.period_end, end: period.start }) - 1;
  if (period.end < row.period_start) return dayCount({ start: period.end, end: row.period_start }) - 1;
  return 0;
}

/**
 * 依本期與通路篩選找目標。只有期間「完全相同」才 matched；
 * 同指標同通路但期間不同 → mismatch（取重疊天數最多者，其次距離最近，再其次行號較小），UI 只提示不折算。
 */
export function matchTargets(set: TargetSet | null, scope: TargetScope): Record<TargetMetric, TargetMatch> {
  const result = Object.fromEntries(TARGET_METRICS.map(metric => [metric, { status: "none" }])) as Record<TargetMetric, TargetMatch>;
  if (!set) return result;
  const keys = scopeChannelKeys(scope);
  const period = scope.current_period;
  for (const metric of TARGET_METRICS) {
    const candidates = set.rows.filter(row => row.metric === metric && keys.includes(row.channel));
    if (!candidates.length) continue;
    // 單一通路資料集全選時，"ALL" 與該通路都適用；"ALL" 優先。
    const exact = keys.map(key => candidates.find(row => row.channel === key && row.period_start === period.start && row.period_end === period.end)).find(row => row !== undefined);
    if (exact) { result[metric] = { status: "matched", row: exact }; continue; }
    const nearest = [...candidates].sort((a, b) =>
      overlapDays(b, period) - overlapDays(a, period)
      || gapDays(a, period) - gapDays(b, period)
      || keys.indexOf(a.channel) - keys.indexOf(b.channel)
      || a.line - b.line)[0];
    result[metric] = { status: "mismatch", nearest };
  }
  return result;
}

/** 達成率 = 實際 ÷ 目標，以百分比一位小數（ROUND_HALF_UP）呈現；目標 ≤ 0 不定義，實際缺值為資料待補。 */
export function achievement(actual: Metric, target: string): Achievement {
  const targetCents = MONEY_PATTERN.test(target) ? parseCents(target) : null;
  if (targetCents === null || targetCents <= 0n) return { rate: null, display: labels.targets.undefinedTarget, status: "undefined" };
  if (actual.value === null || !/^-?\d+(?:\.\d+)?$/.test(actual.value)) return { rate: null, display: labels.status.missing, status: "missing" };
  const ExactDecimal = Decimal.clone({ precision: actual.value.length + targetCents.toString().length + 20, rounding: Decimal.ROUND_HALF_UP });
  // 目標以分為單位：actual ÷ (cents / 100) × 100 = actual × 10000 ÷ cents。
  const fixed = new ExactDecimal(actual.value).times(10000).div(targetCents.toString()).toFixed(1);
  const rate = `${fixed === "-0.0" ? "0.0" : fixed}%`;
  return { rate, display: rate, status: "ok" };
}

/** 目標金額的畫面格式（千分位、兩位小數）。 */
export function targetDisplay(row: TargetRow): string {
  return formatMoney(row.target);
}

/** KPI 卡右下角的一行字：matched 且可算 →「目標 X · 達成 Y」；目標 ≤ 0 或實際缺值 → 對應說明。 */
export function achievementText(row: TargetRow, actual: Metric): string {
  const result = achievement(actual, row.target);
  return result.status === "ok" ? fill(labels.targets.achieved, { target: targetDisplay(row), rate: result.rate }) : result.display;
}

/** 期間不一致提示：「目標期間 8/1–8/31 與本期不一致」。 */
/** 不一致訊息用完整日期（去年同期時 8/1–8/31 會與本期撞名）。 */
export function mismatchText(row: TargetRow): string {
  return fill(labels.targets.mismatch, { start: row.period_start, end: row.period_end });
}

/** 空白範本（BOM + 標題列），與核心 CSV 範本同格式。 */
export function targetsCsvTemplate(): string {
  return "\uFEFF" + TARGET_COLUMNS.join(",") + "\r\n";
}

/** CSV 儲存格：與 export.ts encodeCsv 相同的防公式注入規則；不 import export.ts，避免日後匯出模組引用本檔時形成循環依賴。 */
function csvText(value: string): string {
  const safe = /^[=+\-@\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** 匯出目前的目標（供下載與備份往返）；可再用 parseTargets 讀回同樣的列。 */
export function exportTargetsCsv(set: TargetSet): string {
  const lines = [
    TARGET_COLUMNS.map(csvText).join(","),
    // 目標已是正規化的兩位小數字串（數值格，不加前綴），負數仍可原樣讀回。
    ...set.rows.map(row => [csvText(row.period_start), csvText(row.period_end), csvText(row.channel), csvText(row.metric), `"${row.target}"`].join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
