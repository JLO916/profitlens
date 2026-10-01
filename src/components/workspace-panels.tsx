"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { evidenceRows, formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { analyzeProducts } from "@/domain/analysis";
import { COST_FIELDS, SALES_FIELDS, type Dataset, type Fact, type Metric, type MetricName, type ProductMetrics, type SourceRef } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { IssueList } from "./issue-list";
import { downloadText } from "@/application/download";
import { exportIssuesCsv, exportProductsCsv } from "@/application/export";

type EvidenceHandler = (selection: EvidenceSelection) => void;
const previewLabels: Record<string, string> = {
  date: "入帳日", channel: "通路", sku: "SKU", category: "品類", units_sold: "售出件數", currency: "幣別",
  gross_sales: "折扣前收入", discounts: "折扣", refunds: "退款", cogs_net: "成本淨額",
  platform_fees: "平台費", payment_fees: "金流費", fulfillment_costs: "履約費", other_variable_costs: "其他變動成本", ad_spend: "廣告費",
};

function displayMetric(name: MetricName, metric: Metric): string {
  if (metric.value === null) return "N/A";
  const unit = metricDefinitions[name].unit;
  if (unit === "percent") return formatRate(metric.value);
  if (unit === "multiple") return `${new Decimal(metric.value).toFixed(2, Decimal.ROUND_HALF_UP)} 倍`;
  return formatMoney(metric.value);
}

export function DataWorkspace({ dataset, snapshot, filenames, mappings }: { dataset: Dataset; snapshot: WorkspaceSnapshot; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>> }) {
  const settings = dataset.manifest;
  const files = [
    { name: "sales_daily.csv", title: "商品銷售與成本", description: "日 × 通路 × SKU", rows: dataset.sales, fields: ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"] },
    { name: "channel_costs_daily.csv", title: "通路費用", description: "日 × 通路", rows: dataset.costs, fields: ["date", "channel", ...COST_FIELDS, "currency"] },
    { name: "ad_spend_daily.csv", title: "廣告支出", description: "日 × 銷售目的通路", rows: dataset.ads, fields: ["date", "channel", "ad_spend", "currency"] },
  ];
  return <>
    <section className="panel" aria-labelledby="dataset-heading">
      <div className="section-heading"><div><p className="eyebrow">來源與完整性</p><h2 id="dataset-heading">資料範圍與口徑</h2></div><span className="tag">{settings.source_type === "synthetic" ? "合成資料" : "使用者提供資料"}</span></div>
      <dl className="metadata-grid">
        <div><dt>資料集</dt><dd>{settings.dataset_id}</dd></div>
        <div><dt>資料截至日</dt><dd>{settings.data_as_of}</dd></div>
        <div><dt>完整涵蓋期間</dt><dd>{settings.coverage_start} 至 {settings.coverage_end}</dd></div>
        <div><dt>幣別與商業日期</dt><dd>{settings.currency} · {settings.timezone}</dd></div>
        <div><dt>資料包含通路</dt><dd>{settings.channels.join("、")}</dd></div>
        <div><dt>銷售涵蓋範圍確認</dt><dd>{settings.sales_coverage_confirmed ? "資料提供者已確認完整" : "尚未確認，未知範圍不視為零活動"}</dd></div>
        <div><dt>目前前期</dt><dd>{snapshot.report.previous.period.start} 至 {snapshot.report.previous.period.end}</dd></div>
        <div><dt>目前本期</dt><dd>{snapshot.report.current.period.start} 至 {snapshot.report.current.period.end}</dd></div>
        <div><dt>目前通路</dt><dd>{snapshot.report.scope.channels.join("、")}</dd></div>
        <div><dt>資料格式／指標版本</dt><dd>{settings.schema_version} / {snapshot.metric_version}</dd></div>
      </dl>
      <p className="note">金額均為 TWD 未稅商品收入與已入帳費用，不含消費者支付的運費收入、固定月租、所得稅與其他未建模收入。退款按入帳日扣除；成本採來源已入帳淨額，不依退款自行回沖。</p>
      <p className="note">完整性確認來自資料提供者，並非系統已獨立查核原始來源。CSV 空白保持未知，缺少費用列不代表零費用。</p>
      <details><summary>檢視快照識別與資料口徑</summary><dl className="metadata-grid"><div><dt>資料 SHA-256</dt><dd><code>{snapshot.dataset_hash}</code></dd></div><div><dt>篩選 SHA-256</dt><dd><code>{snapshot.filter_hash}</code></dd></div><div><dt>金額口徑識別</dt><dd><code>{settings.amount_basis}</code></dd></div></dl></details>
      {mappings && <details><summary>匯入時確認的標準欄位對照</summary>{Object.entries(mappings).map(([file, mapping]) => <div key={file}><h3>{filenames?.[file as SourceRef["file"]] ?? file}</h3><dl className="metadata-grid">{Object.entries(mapping).map(([standard, original]) => <div key={standard}><dt>{standard}</dt><dd>{original}</dd></div>)}</dl></div>)}</details>}
    </section>
    <section className="panel" aria-labelledby="preview-heading">
      <div className="section-heading"><div><h2 id="preview-heading">來源檔案預覽</h2><p className="note">以下是完整資料集各檔案的前 10 列，不隨上方分析篩選縮減；金額單位 TWD。</p></div><span className="tag">3 份標準 CSV</span></div>
      {files.map(file => {
        const preview = evidenceRows(dataset, file.rows.slice(0, 10).map(row => row.source)).sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        const dates = file.rows.map(row => row.date).sort();
        return <article className="file-card" key={file.name}>
          <h3>{file.title} <span className="tag">{file.rows.length} 列</span></h3>
          <p className="note"><code>{filenames?.[file.name as SourceRef["file"]] ?? file.name}</code>（{file.name}） · {file.description} · {dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : "沒有資料列"}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`${file.title}前 10 列預覽，可水平捲動`}>
            <table className="table preview-table"><caption className="sr-only">{file.name} 原始來源前 10 列</caption><thead><tr><th scope="col">原始行號</th>{file.fields.map(field => <th scope="col" key={field}>{previewLabels[field]}</th>)}</tr></thead><tbody>{preview.map(row => <tr key={`${row.file}-${row.line}`}><th scope="row">{row.line}</th>{file.fields.map(field => <td key={field}>{row.values[field] === null ? "缺值（未知）" : row.values[field]}</td>)}</tr>)}</tbody></table>
          </div>
        </article>;
      })}
    </section>
    <section className="panel" aria-labelledby="quality-heading"><div className="section-heading"><div><h2 id="quality-heading">資料完整性與問題</h2><p className="note">依來源檔案、欄位與原始行號追查。</p></div><span className="tag">{dataset.issues.length} 項</span></div>{dataset.issues.length ? <><button className="button quiet" onClick={() => downloadText(exportIssuesCsv(dataset.issues, filenames), "profitlens-issues.csv")}>下載問題清單 CSV</button><IssueList issues={dataset.issues} filenames={filenames} mappings={mappings} /></> : <p>目前資料集沒有檢出的格式或完整性問題。</p>}</section>
  </>;
}

function factSelection(fact: Fact): EvidenceSelection {
  return { title: metricDefinitions[fact.metric].label, name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: fact.scope.kind === "all" ? "所選通路合計" : fact.scope.channels.join("、") };
}

export function Diagnosis({ snapshot, onEvidence }: { snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler }) {
  const diagnostics = snapshot.report.diagnostics.filter(diagnostic => diagnostic.scope.kind !== "sku");
  const facts = new Map(snapshot.report.facts.map(fact => [fact.id, fact]));
  return <section className="panel" aria-labelledby="diagnosis-heading">
    <div className="section-heading"><div><p className="eyebrow">規則與事實</p><h2 id="diagnosis-heading">可核查的通路診斷</h2><p className="note">規則依目前前後期與通路計算。先列補資料事項，再按已觀察金額排序；不代表預估改善收益。</p></div><span className="tag">{diagnostics.length} 項</span></div>
    {!diagnostics.length && <p>目前範圍沒有觸發已定義的通路規則；這不代表所有營運風險均已排除。</p>}
    <div className="diagnostic-grid">{diagnostics.map(diagnostic => <article className="diagnostic-card" key={diagnostic.id}>
      <div className="section-heading"><span className="tag">{diagnostic.scope.kind === "all" ? "所選通路合計" : diagnostic.scope.channels.join("、")}</span><span className="tag">{diagnostic.code === "MISSING_CRITICAL_DATA" ? "優先補資料" : "規則診斷"}</span></div>
      <h3>{diagnostic.title}</h3>
      {diagnostic.ranking_amount && <p className="note">{diagnostic.code === "NEGATIVE_CHANNEL_CM" ? "本期已入帳貢獻" : "排序用已觀察金額差"}：TWD <button type="button" className="number-link" onClick={() => {
        const names: Partial<Record<typeof diagnostic.code, MetricName>> = { REV_UP_CM_DOWN: "contribution_after_marketing", NEGATIVE_CHANNEL_CM: "contribution_after_marketing", DISCOUNT_BURDEN_UP: "discounts", REFUND_BURDEN_UP: "refunds", FULFILLMENT_BURDEN_UP: "fulfillment_costs", MARKETING_BURDEN_UP: "ad_spend" };
        const name = names[diagnostic.code];
        if (!name || !diagnostic.ranking_amount) return;
        const referenced = diagnostic.fact_ids.flatMap(id => { const fact = facts.get(id); return fact?.metric === name ? [fact] : []; });
        const currentOnly = diagnostic.code === "NEGATIVE_CHANNEL_CM";
        onEvidence({ title: `${metricDefinitions[name].label}${currentOnly ? "" : "差額"}`, name, metric: diagnostic.ranking_amount, period: currentOnly ? snapshot.report.current.period : { start: [snapshot.report.previous.period.start, snapshot.report.current.period.start].sort()[0], end: [snapshot.report.previous.period.end, snapshot.report.current.period.end].sort()[1] }, channels: diagnostic.scope.channels, sources: referenced.flatMap(fact => fact.sources), scopeLabel: diagnostic.scope.kind === "all" ? "所選通路合計" : diagnostic.scope.channels.join("、"), ...(currentOnly ? {} : { formula: `已觀察差額 = 本期${metricDefinitions[name].label} − 前期${metricDefinitions[name].label}；不是改善收益估計`, components: referenced.map(fact => ({ label: fact.period.start === snapshot.report.previous.period.start ? "前期" : "本期", metric: fact })) }) });
      }} aria-label={`查看${diagnostic.title}排序金額來源，${formatSignedMoney(diagnostic.ranking_amount.value)}`}>{formatSignedMoney(diagnostic.ranking_amount.value)}</button></p>}
      <h4>資料事實</h4>
      <ul className="fact-list">{diagnostic.fact_ids.map(id => {
        const fact = facts.get(id);
        if (!fact) return <li key={id}>引用事實未找到，無法顯示數值。</li>;
        const period = fact.period.start === snapshot.report.previous.period.start && fact.period.end === snapshot.report.previous.period.end ? "前期" : "本期";
        return <li key={id}><span>{period} · {metricDefinitions[fact.metric].label}</span><button type="button" className="number-link" onClick={() => onEvidence(factSelection(fact))} aria-label={`查看${period}${metricDefinitions[fact.metric].label}公式與來源，${displayMetric(fact.metric, fact)}`}>{displayMetric(fact.metric, fact)}</button></li>;
      })}</ul>
      <h4>待驗證假說</h4><p>{diagnostic.hypothesis}</p>
      <h4>建議</h4><p>{diagnostic.recommendation}</p>
      <h4>資料限制</h4><ul className="note">{diagnostic.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
      <details><summary>檢視事實識別與規則</summary><p className="note">規則：<code>{diagnostic.code}</code></p><ul>{diagnostic.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
    </article>)}</div>
  </section>;
}

const productColumns: { name: keyof ProductMetrics; label: string }[] = [
  { name: "net_revenue", label: "商品淨營收" }, { name: "cogs_net", label: "銷貨成本淨額" },
  { name: "gross_profit", label: "商品毛利" }, { name: "gross_margin", label: "毛利率" },
  { name: "discounts", label: "折扣" }, { name: "refunds", label: "退款" },
];

export function Products({ dataset, snapshot, onEvidence, filenames }: { dataset: Dataset; snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler; filenames?: Partial<Record<SourceRef["file"], string>> }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const channels = snapshot.report.scope.channels;
  const period = snapshot.report.current.period;
  const categories = [...new Set(dataset.sales.filter(row => channels.includes(row.channel)).map(row => row.category).filter(category => category.trim() !== ""))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const result = useMemo(() => analyzeProducts(dataset, { period, channels, ...(activeCategory ? { category: activeCategory } : {}) }), [dataset, period, channels, activeCategory]);
  const query = search.trim().toLocaleLowerCase();
  const rows = result.rows.filter(row => !query || row.sku.toLocaleLowerCase().includes(query));
  return <section className="panel" aria-labelledby="products-heading">
    <div className="section-heading"><div><p className="eyebrow">商品收入與成本</p><h2 id="products-heading">商品毛利明細</h2><p className="note">以本期商品淨營收及已入帳銷貨成本檢視毛利。通路費用與廣告費不分攤到 SKU，因此不提供商品行銷後貢獻。</p></div><span className="tag">TWD 未稅</span></div>
    <div className="product-filters"><label htmlFor="product-category">品類<select aria-label="品類" id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">全部品類</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label htmlFor="product-search">搜尋 SKU<input id="product-search" type="search" placeholder="輸入 SKU 關鍵字" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <div className="export-actions"><button className="button quiet" onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows, { category: activeCategory, query }, filenames), "profitlens-products.csv")}>下載商品明細 CSV</button><span className="note">僅匯出目前期間、通路、品類與 SKU 搜尋的商品列。</span></div>
    <div className="metric-strip"><p aria-live="polite">顯示 {rows.length} 筆商品通路組合</p><p className="note">{period.start} 至 {period.end} · {channels.join("、")} · {activeCategory || "全部品類"}</p></div>
    <p className="note">品類與 SKU 搜尋只影響此商品明細；上方通路範圍與其他頁面總計維持完整通路口徑。未填品類仍列入全部品類，可用 SKU 搜尋。</p>
    {rows.length === 0 ? <p>此範圍沒有符合條件的商品資料。</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="商品毛利明細，可水平捲動"><table className="table" data-testid="product-table"><caption className="sr-only">本期商品毛利與來源；不含廣告分攤或商品行銷後貢獻</caption><thead><tr><th scope="col">通路</th><th scope="col">SKU</th><th scope="col">品類</th>{productColumns.map(column => <th scope="col" key={column.name}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.channel, row.sku])}><td>{row.channel}</td><th scope="row">{row.sku}</th><td>{row.category.trim() ? row.category : "未填品類"}</td>{productColumns.map(column => {
      const metric = row.metrics[column.name];
      return <td key={column.name}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined} aria-label={`查看 ${row.channel} ${row.sku} ${column.label}公式與來源，${displayMetric(column.name, metric)}`} onClick={() => onEvidence({ title: `${row.sku} · ${column.label}`, name: column.name, metric, period, channels: [row.channel], sources: row.sources, scopeLabel: `商品 ${row.sku} · 品類 ${row.category}` })}>{displayMetric(column.name, metric)}</button>{metric.value === null && metric.reason_codes.length > 0 && <small className="note">條件不成立或資料待補</small>}</td>;
    })}</tr>)}</tbody></table></div>}
  </section>;
}
