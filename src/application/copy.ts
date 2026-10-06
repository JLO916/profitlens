import Decimal from "decimal.js";
import { formatCents, parseCents } from "../domain/money";
import type { Diagnostic, Fact, MetricName, RuleCode, Scope, ValidationIssue } from "../domain/types";
import { fill as fillTemplate, labels } from "../i18n";
import type { TaxConversion } from "./tax-basis";
import { importIssueMessage, type IssueMessageContext, type IssueRef } from "./import";
import { asciiMinus, formatAmountL1, formatRateL3, formatSignedDelta, metricDefinitions } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

// R2 文案機制：示範通路 alias、標題用「萬」金額、規則卡文案模板、CSV 標題列。全部只做呈現，不碰 domain 數值。

/** 只有示範資料集（dataset_id 以 synthetic-demo 開頭）套用顯示 alias；驗證用合成資料與使用者匯入維持原通路代碼。 */
export function demoAlias(datasetId: string): boolean {
  return datasetId.startsWith("synthetic-demo");
}
export function channelLabel(channel: string, alias: boolean): string {
  return (alias && labels.demoChannelAlias[channel]) || channel;
}
export function channelsLabel(channels: readonly string[], alias: boolean): string {
  return channels.map(channel => channelLabel(channel, alias)).join("、");
}
export function categoryLabel(category: string, alias: boolean): string {
  return (alias && labels.demoCategoryAlias[category]) || category;
}
/** 「合計（官網 · DTC、平台 · MARKETPLACE）」／「官網 · DTC」／「官網 · DTC／SKU-001」 */
export function scopeLabel(scope: Scope, alias: boolean): string {
  const channels = channelsLabel(scope.channels, alias);
  if (scope.kind === "all") return `${labels.sections.total}（${channels}）`;
  return scope.sku ? `${channels}／${scope.sku}` : channels;
}

/**
 * 標題用金額（L1，V3-2b）：≥ 1 億「1.25 億」、≥ 1 萬「118.8 萬」、否則「8,420 元」；未知顯示「資料待補」。
 * 預設取絕對值（方向由「多花／少賺」等方向詞表達），signed 時改用 formatSignedDelta（+／U+2212，零不帶符號）。
 */
export function formatHeadlineAmount(value: string | null, signed = false): string {
  if (signed) return formatSignedDelta(value, "L1");
  return formatAmountL1(value === null ? null : value.trim().replace(/^[-+]/, ""));
}

export interface RuleCopy { headline: string; cause: string; nextStep: string; caution: string }
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? labels.status.missing);

/** 規則卡文案：labels.rules 模板 ＋ 由事實算出的占位符；排序、門檻與公式抽屜仍用原始 ranking_amount。 */
export function ruleCopy(snapshot: Pick<WorkspaceSnapshot, "report">, diagnostic: Pick<Diagnostic, "code" | "scope" | "fact_ids" | "ranking_amount">, alias: boolean): RuleCopy {
  const { report } = snapshot;
  const facts = report.facts.filter(fact => diagnostic.fact_ids.includes(fact.id));
  const isPrevious = (fact: Fact) => fact.period.start === report.previous.period.start && fact.period.end === report.previous.period.end;
  const find = (metric: MetricName, period: "previous" | "current") => facts.find(fact => fact.metric === metric && (period === "previous" ? isPrevious(fact) : !isPrevious(fact)));
  const rate = (metric: MetricName, period: "previous" | "current") => { const fact = find(metric, period); return fact && fact.value !== null ? asciiMinus(formatRateL3(fact.value)) : labels.status.missing; };
  const difference = (metric: MetricName) => {
    const before = parseCents(find(metric, "previous")?.value ?? null), after = parseCents(find(metric, "current")?.value ?? null);
    return before === null || after === null ? null : formatCents(after - before);
  };
  const ranking = diagnostic.ranking_amount?.value ?? null;
  const channel = diagnostic.scope.kind === "all" ? labels.sections.total : channelsLabel(diagnostic.scope.channels, alias);
  const values: Record<string, string> = { channel, sku: diagnostic.scope.sku ?? "" };
  const code: RuleCode = diagnostic.code;
  switch (code) {
    case "REV_UP_CM_DOWN": values.dNet = formatHeadlineAmount(difference("net_revenue")); values.dCM = formatHeadlineAmount(ranking); break;
    // V3-2a：標題改成「扣完廣告虧 {cm}」「商品毛利虧 {cm}」，方向已由「虧」表達，金額取絕對值。
    case "NEGATIVE_CHANNEL_CM": case "SKU_NEGATIVE_GP": values.cm = formatHeadlineAmount(ranking); break;
    case "DISCOUNT_BURDEN_UP": values.prevRate = rate("discount_rate", "previous"); values.curRate = rate("discount_rate", "current"); values.dAmount = formatHeadlineAmount(ranking); break;
    case "REFUND_BURDEN_UP": values.prevRate = rate("refund_ratio", "previous"); values.curRate = rate("refund_ratio", "current"); values.dAmount = formatHeadlineAmount(ranking); break;
    case "FULFILLMENT_BURDEN_UP": values.prevRate = rate("fulfillment_burden", "previous"); values.curRate = rate("fulfillment_burden", "current"); values.dAmount = formatHeadlineAmount(ranking); break;
    case "MARKETING_BURDEN_UP": values.prevRate = rate("marketing_burden", "previous"); values.curRate = rate("marketing_burden", "current"); values.dAmount = formatHeadlineAmount(ranking); break;
    case "MISSING_CRITICAL_DATA": values.missing = [...new Set(facts.filter(fact => fact.value === null).map(fact => metricDefinitions[fact.metric].shortLabel))].join("、") || labels.status.missing; break;
  }
  const copy = labels.rules[code];
  // V3-2a：比率（{prevRate}{curRate}）從標題移到 cause（PRD §8.8 #3），四段都用同一組占位符值填入。
  return { headline: fill(copy.title, values), cause: fill(copy.cause, values), nextStep: fill(copy.nextStep, values), caution: fill(copy.caution, values) };
}

/** CSV 標題列「中文名稱 (english_key)」；欄位 key 維持英文，機器可讀。 */
export function csvHeader(key: string): string {
  const columns: Record<string, string> = labels.csvColumns;
  const metric = (name: string): string | null => name in labels.metrics ? labels.metrics[name as MetricName].label : null;
  const derive = (): string | null => {
    if (columns[key]) return columns[key];
    const direct = metric(key); if (direct) return direct;
    let match = /^(previous|current)_(.+?)(_reasons)?$/.exec(key);
    if (match) { const base = metric(match[2]) ?? columns[match[2]]; if (base) return `${match[1] === "previous" ? labels.periods.previous : labels.periods.current}${base}${match[3] ? labels.csvSuffix.reasons : ""}`; }
    match = /^(.+?)_change(_reasons)?$/.exec(key);
    if (match) { const base = metric(match[1]); if (base) return `${base}${labels.csvSuffix.change}${match[2] ? labels.csvSuffix.reasons : ""}`; }
    match = /^(.+?)_reasons$/.exec(key);
    if (match) { const base = metric(match[1]) ?? columns[match[1]]; if (base) return `${base}${labels.csvSuffix.reasons}`; }
    return null;
  };
  const label = derive();
  return label ? `${label} (${key})` : key;
}
/** 從「中文名稱 (english_key)」取回 key；沒有括號時原樣回傳。 */
export function csvHeaderKey(header: string): string {
  const match = /\(([^()]+)\)\s*$/.exec(header);
  return match ? match[1] : header;
}

/**
 * 白話錯誤（V3-2a §7.7.3）：以 reason code 查 labels.importErrors 樣板，帶入 {file}{line}{value}{column} 等占位符；
 * 一律不退回 domain 的中文 message。實作在 import.ts（importIssueMessage）；這裡保留舊入口給既有呼叫端。
 */
export function plainIssueMessage(issue: IssueRef & Partial<Pick<ValidationIssue, "message">>, context?: IssueMessageContext): string {
  return importIssueMessage(issue, context);
}
/** R3 含稅換算摘要一句：「含稅換算：5%，欄位 原價收入、折扣，共 12 列」；匯出、抽屜、資料頁共用。 */
export function conversionSentence(conversion: TaxConversion | null | undefined): string | null {
  if (!conversion) return null;
  const percent = new Decimal(conversion.rate).mul(100).toFixed(0);
  const fields = conversion.fields.map(field => field in labels.metrics ? labels.metrics[field as MetricName].label : field).join("、");
  return fillTemplate(labels.importWizard.conversionSummary, { percent, fields, n: conversion.rows_converted });
}
