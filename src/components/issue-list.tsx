"use client";

import { useState } from "react";
import type { SourceRef, ValidationIssue } from "@/domain/types";

export function IssueList({ issues, filenames, mappings }: {
  issues: ValidationIssue[];
  filenames?: Partial<Record<SourceRef["file"], string>>;
  mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>;
}) {
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(issues.length / 50) - 1);
  const current = Math.min(page, last);
  const visible = issues.slice(current * 50, current * 50 + 50);
  return <>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="資料問題清單"><table>
      <caption>資料問題清單 · {issues.length} 項</caption>
      <thead><tr><th>嚴重程度</th><th>來源檔案 / 行號</th><th>欄位</th><th>問題</th></tr></thead>
      <tbody>{visible.map((issue, i) => <tr key={i}>
        <td><span className={`tag ${issue.severity}`}>{issue.severity === "blocking" ? "阻擋" : issue.severity === "partial" ? "待補" : "提醒"}</span></td>
        <td>{filenames?.[issue.file] ?? issue.file}{filenames?.[issue.file] && filenames[issue.file] !== issue.file && <small>標準角色：{issue.file}</small>}<small>第 {issue.line ?? "—"} 行 {issue.date} {issue.channel}</small></td>
        <td>{issue.field}{mappings?.[issue.file]?.[issue.field] && mappings[issue.file]![issue.field] !== issue.field && <small>原欄位：{mappings[issue.file]![issue.field]}</small>}</td>
        <td>{issue.message}<details><summary>問題代碼</summary><code>{issue.reason_code}</code></details></td>
      </tr>)}</tbody>
    </table></div>
    {issues.length > 50 && <nav className="issue-pagination" aria-label="問題清單分頁"><button className="button quiet" disabled={current === 0} onClick={() => setPage(current - 1)}>前 50 項問題</button><span>第 {current + 1}／{last + 1} 頁 · 全部問題可下載</span><button className="button quiet" disabled={current === last} onClick={() => setPage(current + 1)}>後 50 項問題</button></nav>}
  </>;
}
