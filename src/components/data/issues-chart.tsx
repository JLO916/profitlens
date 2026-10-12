"use client";

import { useMemo } from "react";
import { track } from "@/application/analytics";
import { issueDistribution, type IssueDistribution } from "@/application/chart-issues";
import { issueFileTitle, issueReasonLabel, type IssueFilter } from "@/application/issue-filter";
import { formatCount } from "@/application/presentation";
import type { ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { HeatMatrix, type HeatMatrixFooter, type HeatMatrixRow } from "../charts/heat-table";
import { ChartFrame } from "../overview/charts/chart-frame";

// V4-7a 代理 B：G21 問題分布表（檔案 × 原因）（PRD §4.1–§4.7 G21、§5.7 第 3 列、§6.1 mode／variant／headingLevel、§6.3 C28 matrix；CHART_CATALOG G21）。
// 位置：資料來源頁 section.panel.data-section[data-testid="data-issues"] 內，ui-section-head 之後、IssueList 之前（由 V4-7a 整合代理接到 DataWorkspace）。
// ChartFrame id="data-issues-dist"、testId="chart-data-issues"、variant="inline"（已在 .panel 內，不套 .panel）、mode="table"、headingLevel 3（在 h2#quality-heading 之下）、height sm；
// 不給 dataTable：表本身就是資料（C28 matrix 的按鈕版 HeatMatrix）。列級與範圍級問題都是 0 筆時整個不渲染（示範資料、golden），data-issues 既有的「沒有問題」狀態不變。
// 資料：issueDistribution（issue-distribution-v1）；格內是計數按鈕，按下（含 Enter／空白鍵）記 chart_clicked、呼叫 onFilter({ file, reason })：問題不是金額，不開抽屜。
// 標題：全表最多的一格「{檔案}：{原因}最多，{n} 列」（審查 R1-F4：原規劃「{檔案}的{原因}最多」遇 8 字原因名超過 14 字）；只有一格時「{檔案}有 {n} 列{原因}」（不寫「最多」）；只有範圍級問題時 title.rangeOnly。

const copy = labels.data.chartsV4.issues;
/** 格的 testid（PRD §4.7：chart-{page}-{id}-cell-{語意 key}，key＝{檔案短名}-{原因碼}）。 */
export const issuesCellTestId = (fileKey: string, reason: string) => `chart-data-issues-cell-${fileKey}-${reason}`;
/** 表的 testid（C33 慣例 chart-{page}-{id}-table）。 */
export const ISSUES_TABLE_TESTID = "chart-data-issues-table";

export interface IssuesChartModel {
  distribution: IssueDistribution;
  title: string;
  /** 副標（區塊的 aria 描述）。 */
  subtitle: string;
  caption: string;
  columns: { key: string; label: string }[];
  rows: HeatMatrixRow[];
  footer?: HeatMatrixFooter;
}

/** G21 的文字與表（純函式，tests/charts-data-issues-v4.test.tsx）；列級與範圍級問題都是 0 筆時回傳 null（不渲染）。 */
export function issuesChartModel(issues: readonly ValidationIssue[]): IssuesChartModel | null {
  const distribution = issueDistribution(issues);
  if (distribution === null) return null;
  const count = (n: number) => formatCount(n, "L2");
  const { section } = copy;
  const top = distribution.top;
  const title = top === null
    ? fill(copy.title.rangeOnly, { n: count(distribution.rangeLevel) })
    : fill(distribution.single ? copy.title.single : copy.title.most, { file: issueFileTitle(top.fileKey), reason: issueReasonLabel(top.reason), n: count(top.count) });
  const subtitle = distribution.rowLevel === 0
    ? fill(copy.subtitleRangeOnly, { section, n: count(distribution.rangeLevel) })
    : fill(copy.subtitle, { section, n: count(distribution.rowLevel) });
  const columns = distribution.reasons.map(reason => ({ key: reason, label: issueReasonLabel(reason) }));
  const rows: HeatMatrixRow[] = distribution.rows.map(row => ({
    key: row.fileKey, head: issueFileTitle(row.fileKey),
    cells: row.cells.map(cell => cell.count === 0
      ? { key: cell.reason, tier: 0, text: "" }
      : { key: cell.reason, tier: cell.tier, text: count(cell.count), aria: fill(copy.cellAria, { file: issueFileTitle(cell.fileKey), n: count(cell.count), reason: issueReasonLabel(cell.reason) }), testId: issuesCellTestId(cell.fileKey, cell.reason) }),
  }));
  const footer: HeatMatrixFooter | undefined = distribution.rangeLevel > 0
    ? { head: copy.rangeRow, text: fill(labels.data.panel.itemCount, { n: count(distribution.rangeLevel) }), columnLabel: labels.data.pageV3.issueTable.columns.problem }
    : undefined;
  return { distribution, title, subtitle, caption: fill(copy.caption, { section }), columns, rows, footer };
}

/** 格（列＝檔案短名、欄＝原因碼）對應的問題表篩選 { file（標準檔名）, reason }；不是表上的格時回傳 null。點格與測試共用。 */
export function issuesCellFilter(distribution: IssueDistribution, cell: { row: string; column: string }): IssueFilter | null {
  const entry = distribution.rows.find(item => item.fileKey === cell.row);
  return entry && distribution.reasons.includes(cell.column) ? { file: entry.file, reason: cell.column } : null;
}

export interface IssuesChartProps {
  /** dataset.issues（domain 的 ValidationIssue，逐筆沿用）。 */
  issues: readonly ValidationIssue[];
  /**
   * 格被按下（含 Enter／空白鍵）：{ file, reason }，file 是 domain 的標準檔名（ValidationIssue.file）、reason 是原因碼。
   * 資料來源頁把它設成 issueFilter 傳給 IssueList 的 filter（問題表只列符合的問題、篩選片語取得焦點），並捲到 data-issues。
   */
  onFilter?: (filter: IssueFilter) => void;
}

/** 資料來源頁 G21：ChartFrame（inline、table 模式、h3、sm）＋C28 HeatMatrix；沒有任何問題時回傳 null。 */
export function IssuesChart({ issues, onFilter }: IssuesChartProps) {
  const model = useMemo(() => issuesChartModel(issues), [issues]);
  if (model === null) return null;
  const onCell = (cell: { row: string; column: string }) => {
    const filter = issuesCellFilter(model.distribution, cell);
    if (filter === null) return;
    track("chart_clicked");
    onFilter?.(filter);
  };
  return <ChartFrame id="data-issues-dist" testId="chart-data-issues" className="issues-chart" title={model.title} subtitle={model.subtitle} height="sm" mode="table" headingLevel={3} variant="inline">
    <HeatMatrix caption={model.caption} corner={labels.data.pageV3.issueTable.columns.file} columns={model.columns} rows={model.rows} footer={model.footer} testId={ISSUES_TABLE_TESTID} onCell={onCell} />
  </ChartFrame>;
}
