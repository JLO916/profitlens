"use client";

import { useId, useState } from "react";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { issueMessageParts, issueTemplate, renderIssueTemplate, sideFileIssueMessage, splitIssueTemplate, type IssueMessageContext, type IssueRef } from "@/application/import";
import type { SourceRef, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";

const copy = labels.data.issues;
const v3 = labels.data.pageV3.issueTable;
const PAGE_SIZE = 50;
/** 樣板的位置前綴以全形冒號結束（「{file} 第 {line} 行：」「{file}：」）。 */
const COLON = "：";
type SideFile = "targets.csv" | "events.csv";
/** 目標與促銷檔期的錯誤（TargetIssue／EventIssue 同形）。 */
export interface SideFileIssue { line: number | null; field: string; reason_code: string; message: string }

/** §7.7.1 第 3 段：問題表的一列（核心三份 CSV 與選填檔共用同一組欄位：檔案｜行號｜欄位｜問題｜修法｜原因碼）。 */
interface IssueRow {
  file: string;
  /** 實際檔名和標準檔名不同時，在檔名下補一行標準檔名。 */
  logicalFile?: string;
  /** 結帳日與通路（domain 的 SourceRef 有記才顯示）。 */
  where?: string;
  line: number | null;
  field: string;
  /** 欄位對照把標準欄位對到別的來源欄名時，在欄位下補一行原欄位。 */
  originalColumn?: string;
  /** L1（去掉與檔案、行號欄重複的位置前綴）。 */
  problem: string;
  /** L2。 */
  fix: string;
  /** L3。 */
  code: string;
  severity?: ValidationIssue["severity"];
}

/**
 * 樣板 L1 開頭的位置前綴只含檔名與行號（「{file} 第 {line} 行：」「{file}：」，或選填檔寫死檔名的同型前綴）時回傳它；
 * 含日期、通路、欄位等其他占位符（例如「{date} {channel}：」）就回傳 null，整句照常顯示，資訊不會少。
 */
function locationPrefix(template: string | undefined, file: string): string | null {
  if (!template) return null;
  const colon = template.indexOf(COLON);
  if (colon < 0) return null;
  const head = template.slice(0, colon + 1);
  if (head.replace(/\{(?:file|line)\}/g, "").includes("{")) return null;
  return head.startsWith("{file}") || head.startsWith(file) ? head : null;
}
const stripPrefix = (headline: string, prefix: string | null) => prefix && headline.startsWith(prefix) ? headline.slice(prefix.length) : headline;

/** 核心三份 CSV 的問題：L1／L2／L3 取自 V3-2a 的 issueMessageParts（不另拼句子）。 */
function coreRow(issue: ValidationIssue, context: IssueMessageContext, filenames?: Partial<Record<SourceRef["file"], string>>, mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>): IssueRow {
  const parts = issueMessageParts(issue, context);
  const head = locationPrefix(issueTemplate(issue.reason_code)?.headline, issue.file);
  const display = filenames?.[issue.file];
  const original = mappings?.[issue.file]?.[issue.field];
  const where = [issue.date, issue.channel].filter(Boolean).join(" ");
  return {
    file: display ?? issue.file, logicalFile: display && display !== issue.file ? issue.file : undefined, where: where || undefined, line: issue.line, field: issue.field,
    originalColumn: original && original !== issue.field ? original : undefined,
    problem: stripPrefix(parts.headline, head ? renderIssueTemplate(head, issue, context) : null), fix: parts.explain, code: parts.code, severity: issue.severity,
  };
}

/** 選填檔（targets.csv／events.csv）的問題：整句沿用 sideFileIssueMessage，再依句號拆成 L1／L2。 */
function sideRow(file: SideFile, issue: SideFileIssue): IssueRow {
  const own: Readonly<Record<string, string>> = file === "targets.csv" ? labels.targets.errors : labels.events.errors;
  const parts = splitIssueTemplate(sideFileIssueMessage(file, issue));
  const ownTemplate = Object.hasOwn(own, issue.reason_code);
  const head = locationPrefix(ownTemplate ? own[issue.reason_code] : issueTemplate(issue.reason_code)?.headline, file);
  const ref: IssueRef = { file: file as unknown as IssueRef["file"], line: issue.line, field: issue.field, reason_code: issue.reason_code };
  const filled = head ? ownTemplate ? fill(head, { file, line: issue.line }) : renderIssueTemplate(head, ref) : null;
  return { file, line: issue.line, field: issue.field, problem: stripPrefix(parts.headline, filled), fix: parts.explain, code: issue.reason_code };
}

const SEVERITY_TONE: Record<ValidationIssue["severity"], "unfavorable" | "warning" | undefined> = { blocking: "unfavorable", partial: "warning", warning: undefined };

/**
 * §7.7.1 第 3 段、§9.4 C3／C15：資料問題表。工具列左邊是「顯示原因碼」切換（aria-pressed；原因碼欄預設以 hidden 收合但保持掛載，M1），
 * 右邊是表頭右上角寫一次的單位與「下載問題清單 CSV」（只有傳 onDownload 時）；每頁 50 列，分頁、region、caption 沿用 v2。
 */
function IssueTable<T>({ items, toRow, regionLabel, onDownload, downloadTestId }: { items: readonly T[]; toRow: (item: T) => IssueRow; regionLabel: string; onDownload?: () => void; downloadTestId?: string }) {
  const tableId = useId();
  const [page, setPage] = useState(0);
  const [showCodes, setShowCodes] = useState(false);
  const last = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
  const current = Math.min(page, last);
  const visible = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE).map(toRow);
  const codesHidden = !showCodes || undefined;
  return <div className="issue-list">
    <div className="ui-toolbar issue-toolbar">
      <button type="button" className="ui-btn ui-btn-text issue-codes-toggle" aria-pressed={showCodes} aria-controls={tableId} onClick={() => setShowCodes(value => !value)}>{v3.showCodes}</button>
      <span className="ui-toolbar-end"><span className="issue-unit">{v3.unit}</span>{onDownload && <button type="button" className="ui-btn ui-btn-secondary" data-testid={downloadTestId} onClick={onDownload}>{labels.exports.downloads.issuesCsv}</button>}</span>
    </div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={regionLabel}><table className="ui-table issue-table" id={tableId}>
      <caption className="sr-only">{fill(copy.caption, { n: items.length })}</caption>
      <thead><tr><th scope="col">{v3.columns.file}</th><th scope="col" className="num">{v3.columns.line}</th><th scope="col">{v3.columns.field}</th><th scope="col">{v3.columns.problem}</th><th scope="col">{v3.columns.fix}</th><th scope="col" className="issue-code" hidden={codesHidden}>{v3.columns.code}</th></tr></thead>
      <tbody>{visible.map((row, i) => { const tone = row.severity ? SEVERITY_TONE[row.severity] : undefined; return <tr key={i}>
        <td className="issue-file"><span className="ui-mono">{row.file}</span>{row.logicalFile && <small>{fill(copy.logicalFile, { file: row.logicalFile })}</small>}{row.where && <small>{row.where}</small>}</td>
        <td className="num ui-mono">{row.line ?? ""}</td>
        <td className="issue-field"><span className="ui-mono">{row.field}</span>{row.originalColumn && <small>{fill(copy.originalColumn, { column: row.originalColumn })}</small>}</td>
        <td className="issue-problem">{row.severity && <span className="ui-lozenge" data-tone={tone} data-severity={row.severity}>{copy.severity[row.severity]}</span>}{row.problem}</td>
        <td className="issue-fix">{row.fix}</td>
        <td className="issue-code" hidden={codesHidden}><details open={showCodes || undefined}><summary>{copy.reasonCodeSummary}</summary><code>{row.code}</code></details></td>
      </tr>; })}</tbody>
    </table></div>
    {items.length > PAGE_SIZE && <nav className="issue-pagination" aria-label={copy.paginationAria}><button className="button quiet" disabled={current === 0} onClick={() => setPage(current - 1)}>{copy.prevPage}</button><span>{fill(copy.pageStatus, { page: current + 1, pages: last + 1 })}</span><button className="button quiet" disabled={current === last} onClick={() => setPage(current + 1)}>{copy.nextPage}</button></nav>}
  </div>;
}

export function IssueList({ issues, filenames, mappings, context, download }: {
  issues: ValidationIssue[];
  filenames?: Partial<Record<SourceRef["file"], string>>;
  mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>;
  /** V3-2a §7.7.3：帶入 {value}（原始 CSV 列）與 {column}（欄位對照）；只有匯入精靈有原始列。 */
  context?: IssueMessageContext;
  /**
   * V3-8（§7.7.1 第 3 段）：給檔名時，表格工具列出現「下載問題清單 CSV」（exportIssuesCsv(issues, filenames)，與頂欄匯出選單同一份內容）。
   * testId 選填：同一頁可能同時掛著兩份問題表（資料來源頁 hidden＋匯入精靈），由呼叫端給不同的 testid（M6）。
   */
  download?: { filename: string; testId?: string };
}) {
  const messageContext: IssueMessageContext = { mappings: context?.mappings ?? mappings, sources: context?.sources };
  return <IssueTable items={issues} toRow={issue => coreRow(issue, messageContext, filenames, mappings)} regionLabel={copy.regionAria} onDownload={download ? () => downloadText(exportIssuesCsv(issues, filenames), download.filename) : undefined} downloadTestId={download?.testId} />;
}

/** §7.7.1 第 6 點：目標、促銷檔期的錯誤清單，和第 3 段用同樣的欄位（沒有嚴重程度與原始列，行號取自檔案）。 */
export function SideFileIssueList({ file, issues, regionLabel }: { file: SideFile; issues: readonly SideFileIssue[]; regionLabel: string }) {
  return <IssueTable items={issues} toRow={issue => sideRow(file, issue)} regionLabel={regionLabel} />;
}
