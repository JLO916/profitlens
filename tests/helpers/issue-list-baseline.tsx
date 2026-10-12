import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseTargets } from "@/application/targets";
import { IssueList, SideFileIssueList } from "@/components/issue-list";
import type { ValidationIssue } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

// V4-7a 代理 B：問題表（IssueList）向下相容的基準（V4-7a 加了選填的 filter、onClearFilter；沒給這兩個 props 時輸出必須逐字不變）。
// tests/fixtures/issue-list-v4-6.json 是用本檔在 V4-7a 開工錨點（e905189，issue-list.tsx 尚未擴充）上產生的輸出；tests/issue-list-v3.test.tsx 以擴充後的程式重新產生並逐字比對。
// 內容：資料問題表的各種輸入（缺商品成本、缺廣告列、4 通路合成的 11 項、檔名與欄位對照、下載鈕、三種嚴重程度、120 項分頁、空清單）與選填檔的錯誤清單。
// 字串只用固定的 ASCII（不經 labels）；表內文字取自 labels，所以基準也凍結了既有字串（v4 不改既有字串）。

export const ISSUE_LIST_BASELINE_FILE = "tests/fixtures/issue-list-v4-6.json";
const issuesOf = (name: string) => validateDataset(fixture(name)).dataset!.issues;
const bytes = (text: string) => new TextEncoder().encode(text);

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export function issueListBaseline(): Record<string, string> {
  const render = (props: Parameters<typeof IssueList>[0]) => renderToStaticMarkup(createElement(IssueList, props));
  const cogs = issuesOf("errors/missing_cogs");
  const synthetic = validateDataset(synthetic4ChannelInput()).dataset!.issues;
  const costDay: ValidationIssue = { file: "channel_costs_daily.csv", line: null, date: "2026-08-02", channel: "DTC", field: "$record", severity: "partial", reason_code: "MISSING_CHANNEL_COST_DAY", message: "domain" };
  const range: ValidationIssue = { file: "ad_spend_daily.csv", line: null, field: "$coverage", severity: "partial", reason_code: "MISSING_AD_DAY", message: "domain" };
  const many = Array.from({ length: 120 }, (_, at) => ({ ...cogs[0], line: at + 2 }));
  const { issues: targetIssues } = parseTargets({ name: "targets.csv", bytes: bytes("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-02,ALL,net_revenue,100.00\n2026-08-01,2026-08-02,ALL,bogus,100.00\n") }, ["DTC", "MARKETPLACE"]);
  return {
    "missing_cogs": render({ issues: cogs }),
    "missing_ad_day": render({ issues: issuesOf("errors/missing_ad_day") }),
    "synthetic-4-channel download": render({ issues: synthetic, download: { filename: "profitlens-issues.csv", testId: "data-issues-download" } }),
    "synthetic-4-channel download without testid": render({ issues: synthetic, download: { filename: "x.csv" } }),
    "filenames and mappings": render({ issues: cogs, filenames: { "sales_daily.csv": "=uploaded.csv" }, mappings: { "sales_daily.csv": { cogs_net: "COGS" } } }),
    "context": render({ issues: cogs, context: { mappings: { "sales_daily.csv": { cogs_net: "COGS" } } } }),
    "severities and range": render({ issues: [costDay, { ...cogs[0], severity: "blocking" }, { ...cogs[0], severity: "warning" }, range] }),
    "120 issues": render({ issues: many }),
    "empty": render({ issues: [] }),
    "side file targets": renderToStaticMarkup(createElement(SideFileIssueList, { file: "targets.csv", issues: targetIssues, regionLabel: "targets region" })),
  };
}
