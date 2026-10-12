import type { FileName, ValidationIssue } from "@/domain/types";
import { ALL_IMPORT_ISSUE_REASON_CODES } from "./import";
import { ISSUE_FILES, issueFileKey, type IssueFileKey } from "./issue-filter";

// V4-7a 代理 B：G21「問題分布（檔案 × 原因）」的整理函式 issueDistribution（PRD §4.1–§4.7 G21、§6.4；CHART_CATALOG G21、§9.2）。
// B 級，版本 issue-distribution-v1。輸入是 dataset.issues（domain 的 ValidationIssue，逐筆沿用、不改），不新增財務口徑、不碰金額：
// - 列級問題＝三份核心 CSV 的問題中有 line（原始行號）或 date（缺列的那一天）的；依「檔案 × 原因碼」計數。
//   其餘（沒有行號也沒有日期的範圍級問題，例如缺列超過上限的 $coverage、manifest.json 的銷售涵蓋未確認）不進格，另成一列只計筆數。
// - 欄＝列級問題出現過的原因碼，依 IMPORT_ISSUE_REASON_CODES（src/application/import.ts）的順序；清單外的原因碼排在後面、依代碼字串排序。
// - 列＝三份核心 CSV（銷售、通路費用、廣告；固定順序，與匯入精靈與抽屜相同），沒有列級問題時不給列（只剩範圍級那一列）。
// - 每個檔標出最多的原因（tier 2）；同值依原因碼順序取前者。其餘有問題的格 tier 1，0 格 tier 0（呼叫端留白、不上色）。
// - 全表最多的一格（top）：同值依檔案順序、再依原因碼順序取前者；只有一格有問題時 single＝true（標題不寫「最多」）。
// - 列級與範圍級問題都是 0 筆時回傳 null（呼叫端不渲染 G21，data-issues 既有的「沒有問題」狀態不變）。
// golden：全部格加總＝列級問題筆數（rowLevel）；rowLevel＋rangeLevel＝輸入的問題筆數。純函式、可序列化；新算出的數字只有計數。

export const ISSUE_DISTRIBUTION_VERSION = "issue-distribution-v1" as const;

/** 列級問題：三份核心 CSV（ISSUE_FILES，src/application/issue-filter.ts）的問題中有原始行號或日期的（其餘是範圍級問題）。 */
export function isRowLevelIssue(issue: Pick<ValidationIssue, "file" | "line" | "date">): boolean {
  return issueFileKey(issue.file) !== null && (issue.line !== null || Boolean(issue.date));
}

/** 一格：檔案 × 原因碼的列級問題筆數；tier 0＝沒有、1＝有、2＝該檔最多的原因。 */
export interface IssueDistributionCell {
  file: FileName;
  fileKey: IssueFileKey;
  reason: string;
  count: number;
  tier: 0 | 1 | 2;
}
export interface IssueDistributionRow {
  file: FileName;
  fileKey: IssueFileKey;
  /** 與 reasons 同序、同長。 */
  cells: IssueDistributionCell[];
  /** 該檔的列級問題筆數（＝cells 加總）。 */
  total: number;
  /** 該檔最多的原因碼（同值依原因碼順序）；該檔沒有列級問題時為 null。 */
  top: string | null;
}
export interface IssueDistribution {
  version: typeof ISSUE_DISTRIBUTION_VERSION;
  /** 欄：列級問題出現過的原因碼（原因碼順序）。 */
  reasons: string[];
  /** 列：三份核心 CSV（固定順序）；沒有列級問題時是空陣列。 */
  rows: IssueDistributionRow[];
  /** 列級問題筆數（＝全部格加總）。 */
  rowLevel: number;
  /** 範圍級問題筆數（不進格，另成一列）。 */
  rangeLevel: number;
  /** 範圍級問題出現過的原因碼（原因碼順序）。 */
  rangeReasons: string[];
  /** 全表最多的一格（同值依檔案順序、再依原因碼順序）；沒有列級問題時為 null。 */
  top: IssueDistributionCell | null;
  /** 有問題的格數。 */
  cellsWithIssues: number;
  /** 只有一格有問題（一個檔、一種原因）：標題用單格模板，不寫「最多」。 */
  single: boolean;
}

const REASON_ORDER = new Map(ALL_IMPORT_ISSUE_REASON_CODES.map((code, at) => [code, at]));
/** 原因碼順序：IMPORT_ISSUE_REASON_CODES 的順序；清單外的排在後面、依代碼字串排序。 */
export function compareIssueReasons(a: string, b: string): number {
  const left = REASON_ORDER.get(a), right = REASON_ORDER.get(b);
  if (left !== undefined && right !== undefined) return left - right;
  if (left !== undefined) return -1;
  if (right !== undefined) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** G21：dataset.issues 依「檔案 × 原因碼」計數（issue-distribution-v1）；列級與範圍級問題都是 0 筆時回傳 null。 */
export function issueDistribution(issues: readonly ValidationIssue[]): IssueDistribution | null {
  if (issues.length === 0) return null;
  const counts = new Map<IssueFileKey, Map<string, number>>(ISSUE_FILES.map(entry => [entry.key, new Map()]));
  const rangeReasons = new Set<string>();
  let rowLevel = 0, rangeLevel = 0;
  for (const issue of issues) {
    const key = issueFileKey(issue.file);
    if (key === null || !isRowLevelIssue(issue)) {
      // 範圍級：不進格，只計筆數與原因碼。
      rangeLevel++;
      rangeReasons.add(issue.reason_code);
      continue;
    }
    const byReason = counts.get(key)!;
    byReason.set(issue.reason_code, (byReason.get(issue.reason_code) ?? 0) + 1);
    rowLevel++;
  }
  const reasons = [...new Set([...counts.values()].flatMap(byReason => [...byReason.keys()]))].sort(compareIssueReasons);
  const rows: IssueDistributionRow[] = rowLevel === 0 ? [] : ISSUE_FILES.map(({ file, key }) => {
    const byReason = counts.get(key)!;
    // 該檔最多的原因：reasons 已依原因碼排序，嚴格大於才換，同值留前者。
    let top: string | null = null, best = 0;
    for (const reason of reasons) {
      const count = byReason.get(reason) ?? 0;
      if (count > best) { best = count; top = reason; }
    }
    const cells = reasons.map((reason): IssueDistributionCell => {
      const count = byReason.get(reason) ?? 0;
      return { file, fileKey: key, reason, count, tier: count === 0 ? 0 : reason === top ? 2 : 1 };
    });
    return { file, fileKey: key, cells, total: cells.reduce((sum, cell) => sum + cell.count, 0), top };
  });
  // 全表最多的一格：列依檔案順序、格依原因碼順序走訪，嚴格大於才換（同值留前者）。
  let top: IssueDistributionCell | null = null;
  let cellsWithIssues = 0;
  for (const row of rows) for (const cell of row.cells) {
    if (cell.count === 0) continue;
    cellsWithIssues++;
    if (top === null || cell.count > top.count) top = cell;
  }
  return {
    version: ISSUE_DISTRIBUTION_VERSION, reasons, rows, rowLevel, rangeLevel,
    rangeReasons: [...rangeReasons].sort(compareIssueReasons), top, cellsWithIssues, single: cellsWithIssues === 1,
  };
}
