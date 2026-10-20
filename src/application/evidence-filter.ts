import { fill, labels } from "@/i18n";
import { channelLabel } from "./copy";
import type { NameResolver } from "./channel-settings";
import { formatDateL1, formatPeriodL1, type EvidenceRow } from "./presentation";

// V3-9b F10 圖表點擊下鑽（PRD §10.1 F10、§9.5「互動 P1：週與通路點擊後開抽屜，並篩到該週或該通路」）。
// 篩選只在 application 層：抽屜照舊由 evidenceRows 讀出來源列，再交給 applyEvidenceFilter 依日期範圍與通路過濾後分頁；不重算任何金額。
// manifest.json 的列（資料集設定、銷售涵蓋未確認的標記）不屬於任何一天或一個通路，一律保留。
// V4-3b 代理 B（PRD §6.4、§8.7；CHART_CATALOG §1.2 filter、G11 抽屜）：加單日 date 與商品 sku 兩個條件，同樣只過濾原始明細、不重算。
// sku 條件下沒有 sku 欄位的列（通路費用、廣告）一律不列入（AGENTS.md：SKU 篩選不可帶入全通路費用）；
// filter.sku 只和商品層證據（evidence.sku 相同）一起用，其他證據帶 filter.sku 視為錯誤（evidenceFilterError），抽屜改用 scopedEvidenceFilter 拿掉 sku 條件。

/** 下鑽的篩選條件：週（起訖含當天與週名）、單日、通路代碼、商品代碼；給了幾個就同時成立幾個。 */
export interface EvidenceFilter {
  week?: { start: string; end: string; label: string };
  channel?: string;
  /** V4-3b（G11 熱表格下鑽，PRD §8.7）：單日 YYYY-MM-DD；只留日期等於這一天的列。 */
  date?: string;
  /** V4-3b：商品代碼；只和商品層證據一起用，sku 條件下沒有 sku 欄位的通路費用與廣告列一律不列入。 */
  sku?: string;
}

/** 有沒有任何一個篩選條件（空物件與 undefined 都當作沒有篩選）。 */
export function hasEvidenceFilter(filter: EvidenceFilter | null | undefined): filter is EvidenceFilter {
  return filter !== null && filter !== undefined && (filter.week !== undefined || filter.channel !== undefined || filter.date !== undefined || filter.sku !== undefined);
}

/**
 * F10：依日期落在週的起訖（含）、日期等於單日、通路相等、商品代碼相等過濾原始明細；manifest 列保留；
 * 沒有日期、通路或商品代碼的資料列在對應條件下不列入（所以 sku 條件下通路費用與廣告列一律不列入）。
 */
export function applyEvidenceFilter(rows: readonly EvidenceRow[], filter: EvidenceFilter | null | undefined): EvidenceRow[] {
  if (!hasEvidenceFilter(filter)) return [...rows];
  const { week, channel, date, sku } = filter;
  return rows.filter(row => {
    if (row.file === "manifest.json") return true;
    if (week !== undefined && (row.date === undefined || row.date < week.start || row.date > week.end)) return false;
    if (date !== undefined && row.date !== date) return false;
    if (channel !== undefined && row.channel !== channel) return false;
    if (sku !== undefined && row.sku !== sku) return false;
    return true;
  });
}

/** V4-3b：filter.sku 用錯的種類。skuWithoutProductEvidence＝證據不是商品層（沒有 evidence.sku）；skuMismatch＝證據是另一個商品。 */
export type EvidenceFilterError = "skuWithoutProductEvidence" | "skuMismatch";
/** V4-3b（PRD §6.4、§8.7）：filter.sku 只能和同一個商品的商品層證據一起用；其他情況回傳錯誤種類（沒有 sku 條件時為 null）。 */
export function evidenceFilterError(evidence: { sku?: string; filter?: EvidenceFilter | null }): EvidenceFilterError | null {
  const sku = evidence.filter?.sku;
  if (sku === undefined) return null;
  if (evidence.sku === undefined) return "skuWithoutProductEvidence";
  return evidence.sku === sku ? null : "skuMismatch";
}
/**
 * V4-3b：抽屜實際套用的篩選。filter.sku 用錯時（evidenceFilterError 不是 null）拿掉 sku 條件、其餘條件照舊，
 * 避免非商品層的金額（例如通路合計）配上只剩單一商品銷售列的原始明細；用法正確時原物件回傳。
 */
export function scopedEvidenceFilter(evidence: { sku?: string; filter?: EvidenceFilter | null }): EvidenceFilter | undefined {
  const filter = evidence.filter ?? undefined;
  if (filter === undefined || evidenceFilterError(evidence) === null) return filter;
  const scoped: EvidenceFilter = { ...filter };
  delete scoped.sku;
  return scoped;
}

/**
 * F10 抽屜的篩選片語：「篩選：本期第 2 週（7/20–7/26） · 直營官網」；沒有篩選條件時回傳 null。日期用主層期間（與資料到的年份不同時寫年份）。
 * V4-3b：依週、單日（「日期 8/22」）、通路、商品（「商品 SKU-020」）的順序以「 · 」相接。
 */
export function evidenceFilterText(filter: EvidenceFilter | null | undefined, options: { resolver: NameResolver; anchor?: string }): string | null {
  if (!hasEvidenceFilter(filter)) return null;
  const copy = labels.overview.trendYoyV3.filter;
  const v4 = labels.evidence.chartsV4.filter;
  const parts: string[] = [];
  if (filter.week !== undefined) parts.push(fill(copy.week, { label: filter.week.label, range: formatPeriodL1(filter.week.start, filter.week.end, { anchor: options.anchor, days: false }) }));
  if (filter.date !== undefined) parts.push(fill(v4.date, { date: formatDateL1(filter.date, { anchor: options.anchor }) }));
  if (filter.channel !== undefined) parts.push(channelLabel(filter.channel, options.resolver));
  if (filter.sku !== undefined) parts.push(fill(v4.sku, { sku: filter.sku }));
  return fill(copy.phrase, { scope: parts.join(copy.joiner) });
}
