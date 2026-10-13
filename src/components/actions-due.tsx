import { actionDueBuckets, type ActionDueBucketKey } from "@/application/chart-actions";
import type { ActionWorkspace } from "@/application/action-workspace";
import { formatCount } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { BarCell, type BarCellTone } from "./charts/bar-cell";

const due = labels.actions.chartsV4.due;

/** G17 條色：逾期是不利（chartColors.unfavorable）；其餘是非本期資料，用 total（不用強調色；CHART_CATALOG G17）。 */
const toneOf = (key: ActionDueBucketKey): BarCellTone => key === "overdue" ? "unfavorable" : "total";

/**
 * V4-10 代理 B：G17 待辦期限分布（PRD §5.5、§4.1–§4.7 G17；CHART_CATALOG G17）。
 * 4 列小表 table.chart-actions-due：每列 th（桶名）＋td（件數 L2＋C24 count 條）；caption 是結論句「{n} 件逾期，{m} 件 7 天內到期」。
 * 不用 ChartFrame（小表本身就是資料表）；條 aria-hidden、表內沒有可聚焦元素（0 個新停留點）；列不可點（看板沒有期限篩選，PRD §4.5）。
 * 四桶的件數由 actionDueBuckets（action-due-buckets-v1）算，共用尺度＝四桶最大值；today 由呼叫端傳入台北今天（與看板卡的逾期判定同一個值）。
 * 沒有待辦時呼叫端不渲染（actions-empty）。
 */
export function ActionsDue({ workspace, today }: { workspace: ActionWorkspace; today: string }) {
  const model = actionDueBuckets(workspace, today);
  const countOf = (key: ActionDueBucketKey) => model.buckets.find(bucket => bucket.key === key)?.count ?? 0;
  return <table className="chart-actions-due" data-testid="chart-actions-due">
    <caption>{fill(due.caption, { n: formatCount(countOf("overdue"), "L2"), m: formatCount(countOf("week"), "L2") })}</caption>
    <tbody>{model.buckets.map(bucket => <tr key={bucket.key} data-bucket={bucket.key}>
      <th scope="row">{due.buckets[bucket.key]}</th>
      <td className="num"><BarCell mode="count" value={bucket.count} max={model.max} tone={toneOf(bucket.key)} testId={`chart-actions-due-bar-${bucket.key}`} />{formatCount(bucket.count, "L2")}</td>
    </tr>)}</tbody>
  </table>;
}
