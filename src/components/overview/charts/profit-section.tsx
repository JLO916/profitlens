"use client";

import { useMemo, useState } from "react";
import { track } from "@/application/analytics";
import { chartHeights } from "@/application/chart-theme";
import { formatAmountL3, formatEmpty, formatRateL2, metricDefinitions } from "@/application/presentation";
import { profitWaterfall, profitWaterfallScopes, type ProfitRow, type WaterfallBar } from "@/application/waterfall";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Metric, MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { WaterfallSvg } from "./waterfall-svg";

// V3-4b 代理 B1：總覽區塊 6「本期利潤結構」（F2，PRD §10.3）。
// 四層瀑布：淨營收 → 商品成本 → 商品毛利 → 四項費用 → 扣廣告前貢獻 → 廣告投放費 → 扣廣告後貢獻（10 根）。
// 分段按鈕切換合計或單一通路，只影響本圖（本地 state，不改全站通路篩選）；點柱與點資料表列呼叫同一個 handler（profitEvidence）。

const copy = labels.overview.profit;
const NET_REVENUE: MetricName = "net_revenue";
/** 瀑布 SVG 最小寬：10 根柱，每格至少約 52px，四字的柱名（商品成本、扣廣告前）放得下一行；較窄時水平捲動。 */
const PROFIT_MIN_WIDTH = 600;

const nullLabel = (metric: Metric) => formatEmpty(metric.reason_codes.some(code => code.startsWith("MISSING") || code === "SALES_COVERAGE_UNCONFIRMED") ? "missing" : "notApplicable");

/** 目前範圍的通路與來源：合計用本期全部範圍；單一通路用該通路的 summary.sources（不在本期資料中時退回合計的來源）。 */
function scopeContext(snapshot: WorkspaceSnapshot, scope: "all" | string): { channels: string[]; sources: WorkspaceSnapshot["report"]["current"]["sources"] } {
  const { current } = snapshot.report;
  if (scope === "all") return { channels: [...snapshot.report.scope.channels], sources: current.sources };
  return { channels: [scope], sources: Object.hasOwn(current.channels, scope) ? current.channels[scope].sources : current.sources };
}

/** 利潤結構各列的抽屜內容（與 v2 總覽的 number／open 寫法相同）：指標名、本期、該範圍的通路與來源。瀑布柱與資料表列都經由這裡。 */
export function profitEvidence(snapshot: WorkspaceSnapshot, scope: "all" | string, row: Pick<ProfitRow, "metric" | "value">): EvidenceSelection {
  const { channels, sources } = scopeContext(snapshot, scope);
  return { name: row.metric, metric: row.value, period: snapshot.report.current.period, sources, channels, title: metricDefinitions[row.metric].label };
}

/** 資料表列名：扣項寫「減：{指標名}」，淨營收、小計與結果用指標名。 */
export const profitRowLabel = (row: ProfitRow): string => row.kind === "delta" ? fill(copy.rowDeduct, { label: row.label }) : row.label;
/** 資料表金額（L3 到分，費用為正）；缺值依原因碼寫資料待補／不適用。 */
export const profitRowAmount = (row: ProfitRow): string => row.value.value === null ? nullLabel(row.value) : formatAmountL3(row.value.value);
/** 佔淨營收（L2 一位小數）：金額或淨營收缺值為資料待補；淨營收 ≤ 0 為不適用。 */
export function profitRowShare(row: ProfitRow, netRevenue: Metric): string {
  if (row.value.value === null || netRevenue.value === null) return formatEmpty("missing");
  return formatRateL2(row.share, "notApplicable");
}

export interface ProfitSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** 資料集的全部通路（Overview 的 allChannels）；目前範圍涵蓋全部時，合計的副標寫「全部通路」。 */
  allChannels?: readonly string[];
}

/** 總覽區塊 6：本期利潤結構（四層瀑布＋範圍分段按鈕＋資料表替代）。 */
export function ProfitSection({ snapshot, onEvidence, allChannels }: ProfitSectionProps) {
  const [scope, setScope] = useState<"all" | string>("all");
  const scopes = useMemo(() => profitWaterfallScopes(snapshot), [snapshot]);
  // 期間或通路篩選改變後，原本選的通路可能不在範圍內：退回合計（不另存 state）。
  const active = scopes.some(item => item.id === scope) ? scope : "all";
  const data = useMemo(() => profitWaterfall(snapshot, active, { allChannels }), [snapshot, active, allChannels]);
  const open = (row: Pick<ProfitRow, "metric" | "value">) => onEvidence(profitEvidence(snapshot, active, row));
  const onBar = (bar: WaterfallBar) => {
    track("waterfall_clicked");
    const row = data.rows.find(item => item.metric === bar.metric);
    if (row) open(row);
  };
  const netRevenue: Metric = data.rows.find(row => row.metric === NET_REVENUE)?.value ?? { value: null, reason_codes: ["MISSING_VALUE"] };

  return <section className="panel chart-section profit-section" aria-labelledby="profit-title" aria-describedby="profit-sub" data-testid="profit-waterfall">
    <div className="sec-head">
      <div className="sec-title"><h2 id="profit-title">{data.title}</h2><p className="sub" id="profit-sub">{data.subtitle}</p></div>
      <div className="seg" role="group" aria-label={copy.scope.aria} data-testid="profit-waterfall-scope">
        {scopes.map(item => <button type="button" key={item.id} aria-pressed={item.id === active} data-scope={item.id} onClick={() => setScope(item.id)}>{item.label}</button>)}
      </div>
    </div>
    <WaterfallSvg bars={data.bars} height={chartHeights.lg} testIdPrefix="profit-waterfall-bar-" minWidth={PROFIT_MIN_WIDTH} onBarClick={onBar} />
    <details className="data-alternative"><summary>{fill(labels.ui.overview.dataTable, { title: copy.section })}</summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.table.aria}>
        <table className="kv l3 profit-table">
          <thead><tr><th scope="col">{copy.table.item}</th><th scope="col" className="num">{copy.table.amount}</th><th scope="col" className="num">{copy.table.share}</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id} className={row.kind === "result" ? "is-total" : row.kind === "subtotal" ? "is-subtotal" : undefined} data-row={row.metric}>
            <th scope="row">{profitRowLabel(row)}</th>
            <td className="num"><button type="button" className="number-link" onClick={() => open(row)}>{profitRowAmount(row)}</button></td>
            <td className="num">{profitRowShare(row, netRevenue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
