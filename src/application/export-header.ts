import type { Period } from "../domain/types";
import { fill, labels } from "../i18n";
import { formatSavedDateTime } from "./auto-save";
import { formatPeriodExport, metricDefinitions, periodDays } from "./presentation";

// V3-7 PRD §7.9「匯出版頭」：PDF、PPT、Excel 首頁、Markdown 開頭共用的台灣報表格式四行。
//   {資料集名稱}
//   扣廣告後貢獻兩期比較（管理報表）
//   本期 2026-07-13 至 2026-08-23（42 天）；上期 2026-06-01 至 2026-07-12（42 天） · 單位：新台幣元，未稅
//   指標版本 contribution-v1 · 產出時間 2026-10-05 14:32（台北時間）
// 只做呈現：期間用 formatPeriodExport、時間用 formatSavedDateTime（台北時間），不碰任何金額。

/** exclusive：來源本來就是未稅；inclusive：匯入時做過含稅換算（版頭寫「已換算為未稅」）。 */
export type ExportAmountBasis = "exclusive" | "inclusive";
export interface ExportHeaderInput {
  /** 資料集名稱；V3-7 呼叫端還沒有獨立的名稱欄位，一律傳 dataset_id（V3-10 可補）。 */
  datasetName: string;
  /** 兩期期間；天數有給時以它為準（domain 的 previous_days／current_days），沒給就由起訖日算。 */
  scope: { previous: Period; current: Period; previousDays?: number; currentDays?: number };
  metricVersion: string;
  /** 產出時間；呼叫端注入（測試用固定時間）。 */
  generatedAt: Date;
  amountBasis?: ExportAmountBasis;
}
export interface ExportHeader {
  /** 版頭四行（純文字，各自一行）。 */
  lines: [string, string, string, string];
  datasetName: string;
  /** 第 2 行：報表名。 */
  title: string;
  /** 第 3 行前段：兩期期間。 */
  periodLine: string;
  /** 第 3 行後段：金額單位。 */
  unitLine: string;
  /** 第 4 行：指標版本與產出時間。 */
  versionLine: string;
}

const copy = labels.exports.headerV3;
/** 匯出格式「YYYY-MM-DD 至 YYYY-MM-DD（天數）」；呼叫端給的天數與起訖日算出的不同時，以呼叫端（domain）為準。 */
function range(period: Period, days?: number): string {
  if (days === undefined || days === periodDays(period.start, period.end)) return formatPeriodExport(period.start, period.end);
  return fill(labels.units.exportRange, { start: period.start, end: period.end, days });
}

/** §7.9 版頭四行。 */
export function buildExportHeader(input: ExportHeaderInput): ExportHeader {
  // 名稱是空白時寫「資料待補」，版頭仍是完整四行。
  const datasetName = input.datasetName.trim() || labels.status.missing;
  const title = fill(copy.reportTitle, { metric: metricDefinitions.contribution_after_marketing.label });
  const periodLine = fill(copy.periodLine, { current: range(input.scope.current, input.scope.currentDays), previous: range(input.scope.previous, input.scope.previousDays) });
  const unitLine = input.amountBasis === "inclusive" ? copy.unitConverted : copy.unitExclusive;
  const versionLine = fill(copy.versionLine, { version: input.metricVersion, time: formatSavedDateTime(input.generatedAt) || labels.status.missing });
  return { lines: [datasetName, title, fill(copy.periodUnitLine, { period: periodLine, unit: unitLine }), versionLine], datasetName, title, periodLine, unitLine, versionLine };
}

/**
 * 資料集名稱可能來自使用者輸入：Markdown 裡當純文字。HTML 字元轉成實體、Markdown 標記字元加反斜線、換行收成空白、
 * 頭尾空白去掉（避免縮排成程式碼區塊），開頭的「-」「=」與「1.」不讓它變成清單或分隔線。
 */
function markdownInline(text: string): string {
  const inline = text.replace(/\r\n|\r|\n/g, " ").trim().replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[\\`*_{}[\]()#+!|~]/g, character => `\\${character}`);
  return inline.replace(/^([-=])/, "\\$1").replace(/^(\d+)([.])/, "$1\\$2");
}
/**
 * Markdown 開頭的版頭：四行各自一行（前三行行尾兩個空白＝硬換行，渲染後仍是四行），資料集名稱逸出。
 * 放在「# 標題」與空行之後、既有內容之前。
 */
export function markdownExportHeader(header: ExportHeader): string[] {
  const [, title, periodUnit, version] = header.lines;
  return [`${markdownInline(header.datasetName) || labels.status.missing}  `, `${title}  `, `${periodUnit}  `, version];
}
