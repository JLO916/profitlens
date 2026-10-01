"use client";

import { useMemo, useState } from "react";
import { downloadText } from "@/application/download";
import { exportProductsCsv } from "@/application/export";
import { exportProductComparisonCsv } from "@/application/product-comparison-export";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { uniqueSources } from "@/domain/aggregation";
import { compareProducts, selectProductComparisonRows, type ProductComparisonRow, type ProductComparisonSort } from "@/domain/product-comparison";
import type { Dataset, Metric, ProductMetrics, SourceRef } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";

const currentColumns: { name: keyof ProductMetrics; label: string }[] = [
  { name: "net_revenue", label: "商品淨營收" }, { name: "cogs_net", label: "銷貨成本淨額" },
  { name: "gross_profit", label: "商品毛利" }, { name: "gross_margin", label: "毛利率" },
  { name: "discounts", label: "折扣" }, { name: "refunds", label: "退款" },
];
const activityLabels: Record<ProductComparisonRow["activity"], string> = {
  both_observed: "兩期皆有銷售檔列", current_only: "前期未觀察銷售列", previous_only: "本期未觀察銷售列", coverage_unknown: "銷售完整性待確認",
};
const presenceLabels: Record<ProductComparisonRow["previous"]["presence"], string> = {
  observed: "已觀察銷售檔列", no_rows_confirmed: "未觀察銷售列；依完整性確認計為零", unknown_coverage: "未觀察銷售列且未確認完整性，金額未知",
};
function display(name: keyof ProductMetrics, metric: Metric): string {
  return metric.value === null ? "N/A" : metricDefinitions[name].unit === "percent" ? formatRate(metric.value) : formatMoney(metric.value);
}

/** Product-only comparison. Filters remain local to this panel and never change channel contribution. */
export function ProductComparisonPanel({ dataset, snapshot, onEvidence, filenames }: {
  dataset: Dataset;
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  filenames?: Partial<Record<SourceRef["file"], string>>;
}) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [sort, setSort] = useState<ProductComparisonSort>("gross_profit_change");
  const [direction, setDirection] = useState<"ascending" | "descending">("ascending");
  const comparison = useMemo(() => compareProducts(dataset, snapshot.report.scope), [dataset, snapshot.report.scope]);
  const categories = [...new Set(comparison.rows.map(row => row.category).filter(value => value.trim()))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const selection = { category: activeCategory, query, negativeOnly, sort, direction };
  const rows = selectProductComparisonRows(comparison.rows, selection);
  const unavailable = comparison.rows.filter(row => row.changes.gross_profit.value === null).length;
  const { previous_period: previous, current_period: current, channels } = comparison.scope;

  const cell = (row: ProductComparisonRow, period: "previous" | "current", name: keyof ProductMetrics, label: string) => {
    const value = row[period];
    const metric = value.metrics[name];
    const periodLabel = period === "previous" ? "前期" : "本期";
    return <td key={`${period}-${name}`}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={`查看 ${row.channel} ${row.sku} ${period === "previous" ? "前期" : ""}${label}公式與來源，${display(name, metric)}`}
      onClick={() => onEvidence({ title: `${row.sku} · ${periodLabel}${label}`, name, metric, period: period === "previous" ? previous : current, channels: [row.channel], sources: value.sources, scopeLabel: `商品 ${row.sku} · 品類 ${row.category || "未填"} · ${presenceLabels[value.presence]}` })}>
      {display(name, metric)}</button>{metric.value === null && <small className="note">{metric.reason_codes.includes("MISSING_COGS") ? "成本待補" : "條件不成立或資料待補"}</small>}</td>;
  };
  const deltaCell = (row: ProductComparisonRow, name: "net_revenue" | "gross_profit") => {
    const metric = row.changes[name];
    const label = `${metricDefinitions[name].label}差額`;
    return <td key={`change-${name}`}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={`查看 ${row.channel} ${row.sku} ${label}兩期公式與來源，${metric.value === null ? "N/A" : formatSignedMoney(metric.value)}`}
      onClick={() => onEvidence({ title: `${row.sku} · ${label}`, name, metric, period: { start: previous.start, end: current.end }, channels: [row.channel],
        sources: uniqueSources([...row.previous.sources, ...row.current.sources]),
        scopeLabel: `商品 ${row.sku} · 品類 ${row.category || "未填"}；前期 ${previous.start} 至 ${previous.end}（${presenceLabels[row.previous.presence]}）；本期 ${current.start} 至 ${current.end}（${presenceLabels[row.current.presence]}）`,
        formula: `${label} = 本期${metricDefinitions[name].label} − 前期${metricDefinitions[name].label}；${metricDefinitions[name].formula}。已觀察金額變化，不是可回收收益；無列僅在銷售完整性確認後計為零，不代表新品或停售。`,
        components: [{ label: `前期 ${previous.start} 至 ${previous.end}`, metric: row.previous.metrics[name] }, { label: `本期 ${current.start} 至 ${current.end}`, metric: row.current.metrics[name] }],
      })}>{metric.value === null ? "N/A" : formatSignedMoney(metric.value)}</button>{metric.value === null && <small className="note">差額未知</small>}</td>;
  };

  return <section className="panel" aria-labelledby="products-heading">
    <div className="section-heading"><div><p className="eyebrow">商品收入與成本 · 前後期比較</p><h2 id="products-heading">商品毛利明細</h2><p className="note">通路費用與廣告費不分攤到 SKU，因此不提供商品行銷後貢獻。差額為本期減前期的實際期間合計；不是日均，也不是可回收收益。</p></div><span className="tag">TWD 未稅</span></div>
    <p className="note">前期 {previous.start} 至 {previous.end}（{snapshot.report.comparison.previous_days} 天）；本期 {current.start} 至 {current.end}（{snapshot.report.comparison.current_days} 天）。所選通路：{channels.join("、")}。</p>
    <div className="product-filters">
      <label htmlFor="product-category">品類<select aria-label="品類" id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">全部品類</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label htmlFor="product-search">搜尋 SKU<input id="product-search" type="search" placeholder="輸入 SKU 關鍵字" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label htmlFor="product-sort">商品排序依據<select aria-label="商品排序依據" id="product-sort" value={sort} onChange={event => setSort(event.target.value as ProductComparisonSort)}><option value="gross_profit_change">商品毛利差額</option><option value="current_gross_profit">本期商品毛利</option><option value="net_revenue_change">商品淨營收差額</option><option value="current_net_revenue">本期商品淨營收</option><option value="sku">SKU</option></select></label>
      <label htmlFor="product-direction">商品排序方向<select aria-label="商品排序方向" id="product-direction" value={direction} onChange={event => setDirection(event.target.value as "ascending" | "descending")}><option value="ascending">由小到大（差額先看下降）</option><option value="descending">由大到小</option></select></label>
    </div>
    <div className="export-actions"><button type="button" className={`button ${negativeOnly ? "" : "quiet"}`} aria-pressed={negativeOnly} onClick={() => setNegativeOnly(value => !value)}>只看本期負毛利</button><span className="note">未知毛利不算負毛利；差額未知固定排在最後。全部範圍有 {unavailable} 筆商品毛利差額待補。</span></div>
    <div className="export-actions">
      <button type="button" className="button quiet" onClick={() => downloadText(exportProductComparisonCsv(dataset, snapshot, rows, selection, filenames), "profitlens-product-comparison.csv")}>下載商品比較 CSV</button>
      <button type="button" className="button quiet" onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows.map(row => ({ channel: row.channel, sku: row.sku, category: row.category, metrics: row.current.metrics, sources: row.current.sources })), { category: activeCategory, query: query.trim().toLowerCase() }, filenames), "profitlens-products.csv")}>下載商品明細 CSV</button>
      <span className="note">比較 CSV：每商品一列、前後期與差額；原明細 CSV：本期指標逐列。兩種均只匯出目前顯示的商品，保留來源與快照版本。比較 CSV 另記錄負毛利與排序條件。</span>
    </div>
    <div className="metric-strip"><p aria-live="polite">顯示 {rows.length} 筆商品通路組合</p><p className="note">{activeCategory || "全部品類"} · {negativeOnly ? "僅本期負毛利" : "含非負與未知毛利"}</p></div>
    <p className="note">品類與 SKU 搜尋只影響此商品明細；上方通路範圍與其他頁面總計維持完整通路口徑。未填品類仍列入全部品類，可用 SKU 搜尋。未觀察銷售列不證明新品或停售；已確認完整性時，該期無列才以零計算，否則未知。</p>
    {rows.length === 0 ? <p>此範圍沒有符合條件的商品資料。可取消負毛利或搜尋條件檢視其他商品。</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="商品毛利前後期明細，可水平捲動"><table className="table" data-testid="product-table">
      <caption className="sr-only">兩期商品淨營收、毛利差額與本期細節；不含廣告分攤或商品行銷後貢獻</caption>
      <thead><tr><th scope="col">通路</th><th scope="col">SKU</th><th scope="col">品類</th><th scope="col">資料活動</th><th scope="col">前期商品淨營收</th><th scope="col">前期商品毛利</th><th scope="col">商品淨營收差額</th><th scope="col">商品毛利差額</th>{currentColumns.map(column => <th scope="col" key={column.name}>本期{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={JSON.stringify([row.channel, row.sku])}><td>{row.channel}</td><th scope="row">{row.sku}</th><td>{row.category.trim() ? row.category : "未填品類"}</td><td>{activityLabels[row.activity]}</td>{cell(row, "previous", "net_revenue", "商品淨營收")}{cell(row, "previous", "gross_profit", "商品毛利")}{deltaCell(row, "net_revenue")}{deltaCell(row, "gross_profit")}{currentColumns.map(column => cell(row, "current", column.name, column.label))}</tr>)}</tbody>
    </table></div>}
  </section>;
}
