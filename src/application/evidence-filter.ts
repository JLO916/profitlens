import { fill, labels } from "@/i18n";
import { channelLabel } from "./copy";
import { formatPeriodL1, type EvidenceRow } from "./presentation";

// V3-9b F10 圖表點擊下鑽（PRD §10.1 F10、§9.5「互動 P1：週與通路點擊後開抽屜，並篩到該週或該通路」）。
// 篩選只在 application 層：抽屜照舊由 evidenceRows 讀出來源列，再交給 applyEvidenceFilter 依日期範圍與通路過濾後分頁；不重算任何金額。
// manifest.json 的列（資料集設定、銷售涵蓋未確認的標記）不屬於任何一天或一個通路，一律保留。

/** 下鑽的篩選條件：週（起訖含當天與週名）與通路代碼；兩者都給時同時成立。 */
export interface EvidenceFilter {
  week?: { start: string; end: string; label: string };
  channel?: string;
}

/** 有沒有任何一個篩選條件（空物件與 undefined 都當作沒有篩選）。 */
export function hasEvidenceFilter(filter: EvidenceFilter | null | undefined): filter is EvidenceFilter {
  return filter !== null && filter !== undefined && (filter.week !== undefined || filter.channel !== undefined);
}

/** F10：依日期落在週的起訖（含）與通路相等過濾原始明細；manifest 列保留；沒有日期或通路的資料列在對應條件下不列入。 */
export function applyEvidenceFilter(rows: readonly EvidenceRow[], filter: EvidenceFilter | null | undefined): EvidenceRow[] {
  if (!hasEvidenceFilter(filter)) return [...rows];
  const { week, channel } = filter;
  return rows.filter(row => {
    if (row.file === "manifest.json") return true;
    if (week !== undefined && (row.date === undefined || row.date < week.start || row.date > week.end)) return false;
    if (channel !== undefined && row.channel !== channel) return false;
    return true;
  });
}

/** F10 抽屜的篩選片語：「篩選：本期第 2 週（7/20–7/26） · 直營官網」；沒有篩選條件時回傳 null。日期用主層期間（與資料到的年份不同時寫年份）。 */
export function evidenceFilterText(filter: EvidenceFilter | null | undefined, options: { alias: boolean; anchor?: string }): string | null {
  if (!hasEvidenceFilter(filter)) return null;
  const copy = labels.overview.trendYoyV3.filter;
  const parts: string[] = [];
  if (filter.week !== undefined) parts.push(fill(copy.week, { label: filter.week.label, range: formatPeriodL1(filter.week.start, filter.week.end, { anchor: options.anchor, days: false }) }));
  if (filter.channel !== undefined) parts.push(channelLabel(filter.channel, options.alias));
  return fill(copy.phrase, { scope: parts.join(copy.joiner) });
}
