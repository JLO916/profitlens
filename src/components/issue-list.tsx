"use client";

import { useEffect, useId, useRef, useState } from "react";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { issueMessageParts, issueTemplate, renderIssueTemplate, sideFileIssueMessage, splitIssueTemplate, type IssueMessageContext, type IssueRef } from "@/application/import";
import { filterIssues, hasIssueFilter, issueFilterKey, issueFilterPhrase, type IssueFilter } from "@/application/issue-filter";
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

/** V4-7a：問題表上方的篩選列（只有 IssueList 給了 filter 時）。key＝issueFilterKey（換了篩選時回到第 1 頁、焦點移到片語），phrase＝issueFilterPhrase。 */
interface IssueTableFilter { key: string; phrase: string; onClear?: () => void }

/**
 * §7.7.1 第 3 段、§9.4 C3／C15：資料問題表。工具列左邊是「顯示原因碼」切換（aria-pressed；原因碼欄預設以 hidden 收合但保持掛載，M1），
 * 右邊是表頭右上角寫一次的單位與「下載問題清單 CSV」（只有傳 onDownload 時）；每頁 50 列，分頁、region、caption 沿用 v2。
 * V4-7a：給 filter 時，工具列之下、表之上加篩選列（div.issue-filter：role="status" 的片語＋「清除篩選」）；沒給時輸出不變。
 */
function IssueTable<T>({ items, toRow, regionLabel, onDownload, downloadTestId, filter }: { items: readonly T[]; toRow: (item: T) => IssueRow; regionLabel: string; onDownload?: () => void; downloadTestId?: string; filter?: IssueTableFilter }) {
  const tableId = useId();
  const filterKey = filter?.key ?? "";
  // V4-7a：頁碼記在篩選鍵之下，換了篩選（含清除、回到先前用過的篩選）就回到第 1 頁：鍵一變就在渲染中重設（不保留舊鍵的頁碼）；
  // 沒有篩選時鍵永遠是空字串，不會重設，行為與 V3 相同。
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  if (paging.key !== filterKey) setPaging({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });
  const [showCodes, setShowCodes] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const phrase = useRef<HTMLParagraphElement>(null);
  // V4-7a：換了篩選（G20 缺列段、G21 的格按下後）焦點移到篩選片語；第一次掛載不搶焦點。清除後片語消失，焦點移到問題表的捲動區。
  const shownKey = useRef(filterKey);
  useEffect(() => {
    if (shownKey.current === filterKey) return;
    shownKey.current = filterKey;
    if (filterKey !== "") phrase.current?.focus();
  }, [filterKey]);
  const onClear = filter?.onClear;
  const clearFilter = () => { onClear?.(); region.current?.focus(); };
  const last = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
  const current = Math.min(page, last);
  const visible = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE).map(toRow);
  const codesHidden = !showCodes || undefined;
  return <div className="issue-list">
    <div className="ui-toolbar issue-toolbar">
      <button type="button" className="ui-btn ui-btn-text issue-codes-toggle" aria-pressed={showCodes} aria-controls={tableId} onClick={() => setShowCodes(value => !value)}>{v3.showCodes}</button>
      <span className="ui-toolbar-end"><span className="issue-unit">{v3.unit}</span>{onDownload && <button type="button" className="ui-btn ui-btn-secondary" data-testid={downloadTestId} onClick={onDownload}>{labels.exports.downloads.issuesCsv}</button>}</span>
    </div>
    {filter && <div className="issue-filter"><p className="issue-filter-phrase" role="status" tabIndex={-1} ref={phrase} data-testid="data-issues-filter">{filter.phrase}</p>{onClear && <button type="button" className="ui-btn ui-btn-secondary issue-filter-clear" data-testid="data-issues-filter-clear" onClick={clearFilter}>{labels.overview.trendYoyV3.filter.clear}</button>}</div>}
    <div className="table-scroll" tabIndex={0} role="region" aria-label={regionLabel} ref={region}><table className="ui-table issue-table" id={tableId}>
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

export function IssueList({ issues, filenames, mappings, context, download, filter, onClearFilter }: {
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
  /**
   * V4-7a（PRD §6.4；CHART_CATALOG §7）：選填的篩選（檔案、通路、原因碼；src/application/issue-filter.ts 的 IssueFilter），由資料來源頁的 DataWorkspace 持有，
   * G20 缺列段與資料表的篩選按鈕、G21 的格設定它。有篩選時表只列符合的問題（caption 的筆數跟著變），工具列之下、表之上出現
   * role="status" 的篩選片語（data-testid="data-issues-filter"，tabIndex=-1；換了篩選時焦點移到這裡）與「清除篩選」鈕（data-testid="data-issues-filter-clear"，
   * 只有給 onClearFilter 時；按下後呼叫 onClearFilter，焦點移到問題表的捲動區）。「下載問題清單 CSV」仍是全部問題（issues，不經篩選）。
   * 沒給 filter（或空的篩選）時輸出與 V4-6 逐字相同（tests/fixtures/issue-list-v4-6.json）。捲到 data-issues 由呼叫端負責。
   */
  filter?: IssueFilter | null;
  onClearFilter?: () => void;
}) {
  const messageContext: IssueMessageContext = { mappings: context?.mappings ?? mappings, sources: context?.sources };
  const active = hasIssueFilter(filter);
  const shown = active ? filterIssues(issues, filter) : issues;
  return <IssueTable items={shown} toRow={issue => coreRow(issue, messageContext, filenames, mappings)} regionLabel={copy.regionAria} onDownload={download ? () => downloadText(exportIssuesCsv(issues, filenames), download.filename) : undefined} downloadTestId={download?.testId}
    filter={active ? { key: issueFilterKey(filter), phrase: issueFilterPhrase(filter, shown.length)!, onClear: onClearFilter } : undefined} />;
}

/** §7.7.1 第 6 點：目標、促銷檔期的錯誤清單，和第 3 段用同樣的欄位（沒有嚴重程度與原始列，行號取自檔案）。 */
export function SideFileIssueList({ file, issues, regionLabel }: { file: SideFile; issues: readonly SideFileIssue[]; regionLabel: string }) {
  return <IssueTable items={issues} toRow={issue => sideRow(file, issue)} regionLabel={regionLabel} />;
}
