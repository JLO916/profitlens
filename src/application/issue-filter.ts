import type { FileName, SourceRef, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { issueTemplate } from "./import";
import { formatCount } from "./presentation";

// V4-7a 代理 B：資料來源頁問題表的篩選（PRD §6.4「IssueList 加選填 filter 與清除鈕」；CHART_CATALOG §7 開頭、G20、G21）。
// DataWorkspace 持有 issueFilter（檔案、通路、原因碼），G20 缺列段、G20 資料表的篩選按鈕、G21 的格設定它，問題表（IssueList）只過濾畫面列；
// 「下載問題清單 CSV」仍是全部問題（不經這裡）。篩選只看 domain 的 ValidationIssue 欄位（file、channel、reason_code），不重算、不改問題。
// 本檔隨問題表在首載（匯入精靈也用 IssueList）；G21 的計數在 chart-issues.ts（只有資料來源頁用，隨頁載入）。

/** 三份核心 CSV 的檔案短名（testid、抽屜 SourceTab 相同：sales、costs、ads）。 */
export type IssueFileKey = "sales" | "costs" | "ads";
/** 三份核心 CSV 的固定順序（銷售、通路費用、廣告；與匯入精靈、抽屜相同）與短名。 */
export const ISSUE_FILES: readonly { file: FileName; key: IssueFileKey }[] = [
  { file: "sales_daily.csv", key: "sales" },
  { file: "channel_costs_daily.csv", key: "costs" },
  { file: "ad_spend_daily.csv", key: "ads" },
];
const FILE_KEY = new Map<SourceRef["file"], IssueFileKey>(ISSUE_FILES.map(entry => [entry.file, entry.key]));
/** 檔名對應的短名；不是三份核心 CSV（manifest.json）時回傳 null。 */
export const issueFileKey = (file: SourceRef["file"]): IssueFileKey | null => FILE_KEY.get(file) ?? null;
/** 檔案角色名（商品銷售、通路費用、廣告投放；沿用 importWizard.files）。 */
export const issueFileTitle = (key: IssueFileKey): string => labels.importWizard.files[key];

/**
 * 問題表的篩選條件：給了幾個就同時成立幾個；空物件、null、undefined 都當作沒有篩選。
 * file 是 domain 的標準檔名（ValidationIssue.file，例如 ad_spend_daily.csv；圖上的 testid 用短名，經 ISSUE_FILES 對應），
 * channel 是通路代碼，reason 是原因碼（ValidationIssue.reason_code）。
 */
export interface IssueFilter {
  file?: FileName;
  channel?: string;
  reason?: string;
}

/** 有沒有任何一個篩選條件。 */
export function hasIssueFilter(filter: IssueFilter | null | undefined): filter is IssueFilter {
  return filter !== null && filter !== undefined && (filter.file !== undefined || filter.channel !== undefined || filter.reason !== undefined);
}

/** 依檔案、通路、原因碼過濾問題（順序不變、逐筆沿用）；沒有篩選時回傳原陣列的複本。 */
export function filterIssues(issues: readonly ValidationIssue[], filter: IssueFilter | null | undefined): ValidationIssue[] {
  if (!hasIssueFilter(filter)) return [...issues];
  const { file, channel, reason } = filter;
  return issues.filter(issue => (file === undefined || issue.file === file) && (channel === undefined || issue.channel === channel) && (reason === undefined || issue.reason_code === reason));
}

/** 篩選條件的穩定鍵（同一組條件同一個字串；沒有篩選時是空字串）：問題表用它判斷「換了篩選」（回到第 1 頁、焦點移到篩選片語）。 */
export function issueFilterKey(filter: IssueFilter | null | undefined): string {
  return hasIssueFilter(filter) ? JSON.stringify([filter.file ?? null, filter.channel ?? null, filter.reason ?? null]) : "";
}

const COPY = labels.data.chartsV4.issues;
/** errors.import 樣板開頭只有位置占位符的前綴（「{file} 第 {line} 行：」「{file}：」「{date} {channel}：」）。 */
const LOCATION_HEAD = /^(?=[^：]*\{)(?:\{\w+\}|\s|第|行)+：/;
/**
 * 原因碼的短名（G21 欄名、標題與篩選片語）：先取 data.chartsV4.issues.reasons；沒有時取 labels.errors.import 的 L1
 * 去掉位置前綴（與問題表「問題」欄同一句，例如 MISSING_COGS「商品成本空白」）；L1 仍有占位符或沒有樣板時退回原因碼本身。
 */
export function issueReasonLabel(code: string): string {
  if (Object.hasOwn(COPY.reasons, code)) return COPY.reasons[code];
  const headline = issueTemplate(code)?.headline;
  if (!headline) return code;
  const name = headline.replace(LOCATION_HEAD, "").trim();
  return name === "" || /[{}]/.test(name) ? code : name;
}

/** 問題表上方的篩選片語：「篩選：{檔案角色名 · 通路 · 原因名}（{n} 項）」；n＝篩選後的筆數。沒有篩選時回傳 null。 */
export function issueFilterPhrase(filter: IssueFilter | null | undefined, n: number): string | null {
  if (!hasIssueFilter(filter)) return null;
  const key = filter.file === undefined ? null : issueFileKey(filter.file);
  const parts = [key === null ? filter.file : issueFileTitle(key), filter.channel, filter.reason === undefined ? undefined : issueReasonLabel(filter.reason)].filter((part): part is string => part !== undefined && part !== "");
  return fill(COPY.filter.phrase, { scope: parts.join(labels.data.pageV3.separator), n: formatCount(n, "L2") });
}
