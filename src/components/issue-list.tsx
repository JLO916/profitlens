"use client";

import { useState } from "react";
import { plainIssueMessage } from "@/application/copy";
import type { IssueMessageContext } from "@/application/import";
import type { SourceRef, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";

const copy = labels.ui.issueList;

export function IssueList({ issues, filenames, mappings, context }: {
  issues: ValidationIssue[];
  filenames?: Partial<Record<SourceRef["file"], string>>;
  mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>;
  /** V3-2a §7.7.3：帶入 {value}（原始 CSV 列）與 {column}（欄位對照）；只有匯入精靈有原始列。 */
  context?: IssueMessageContext;
}) {
  const messageContext: IssueMessageContext = { mappings: context?.mappings ?? mappings, sources: context?.sources };
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(issues.length / 50) - 1);
  const current = Math.min(page, last);
  const visible = issues.slice(current * 50, current * 50 + 50);
  return <>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.regionAria}><table>
      <caption>{fill(copy.caption, { n: issues.length })}</caption>
      <thead><tr><th>{copy.columns.severity}</th><th>{copy.columns.source}</th><th>{copy.columns.field}</th><th>{copy.columns.message}</th></tr></thead>
      <tbody>{visible.map((issue, i) => <tr key={i}>
        <td><span className={`tag ${issue.severity}`}>{issue.severity === "blocking" ? copy.severity.blocking : issue.severity === "partial" ? copy.severity.partial : copy.severity.warning}</span></td>
        <td>{filenames?.[issue.file] ?? issue.file}{filenames?.[issue.file] && filenames[issue.file] !== issue.file && <small>{fill(copy.logicalFile, { file: issue.file })}</small>}<small>{fill(copy.lineRef, { line: issue.line ?? "—", date: issue.date, channel: issue.channel })}</small></td>
        <td>{issue.field}{mappings?.[issue.file]?.[issue.field] && mappings[issue.file]![issue.field] !== issue.field && <small>{fill(copy.originalColumn, { column: mappings[issue.file]![issue.field] })}</small>}</td>
        <td>{plainIssueMessage(issue, messageContext)}<details><summary>{copy.reasonCodeSummary}</summary><code>{issue.reason_code}</code></details></td>
      </tr>)}</tbody>
    </table></div>
    {issues.length > 50 && <nav className="issue-pagination" aria-label={copy.paginationAria}><button className="button quiet" disabled={current === 0} onClick={() => setPage(current - 1)}>{copy.prevPage}</button><span>{fill(copy.pageStatus, { page: current + 1, pages: last + 1 })}</span><button className="button quiet" disabled={current === last} onClick={() => setPage(current + 1)}>{copy.nextPage}</button></nav>}
  </>;
}
