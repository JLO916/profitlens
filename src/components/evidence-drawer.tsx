"use client";

import { useEffect, useId, useRef, useState } from "react";
import Decimal from "decimal.js";
import { evidenceRows, formatMoney, formatRate, metricDefinitions } from "@/application/presentation";
import { COST_FIELDS, SALES_FIELDS } from "@/domain/types";
import type { Dataset, Metric, MetricName, Period, SourceRef } from "@/domain/types";

export interface EvidenceSelection {
  title: string;
  metric: Metric;
  name: MetricName;
  period: Period;
  channels: string[];
  sources: SourceRef[];
  formula?: string;
  components?: { label: string; metric: Metric }[];
  scopeLabel?: string;
  unitOverride?: "percentage-point";
}
interface EvidenceDrawerProps {
  dataset: Dataset;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>;
  evidence: EvidenceSelection | null;
  onClose: () => void;
}
const pageSize = 50;
const fieldLabels: Record<string, string> = {
  date: "入帳日", channel: "通路", sku: "SKU", category: "品類", units_sold: "售出件數",
  gross_sales: "折扣前商品收入", discounts: "商品折扣", refunds: "已入帳退款", cogs_net: "已入帳銷貨成本淨額",
  platform_fees: "平台費", payment_fees: "金流費", fulfillment_costs: "履約費", other_variable_costs: "其他變動費用",
  ad_spend: "廣告費", currency: "幣別", sales_coverage_confirmed: "銷售範圍完整性確認",
  coverage_start: "涵蓋起日", coverage_end: "涵蓋迄日", data_as_of: "資料截至日",
};

export function EvidenceDrawer({ dataset, evidence, onClose, filenames, mappings }: EvidenceDrawerProps) {
  // Remounting the modal for a different selected metric resets paging without
  // placing derived financial or source data in component state.
  if (!evidence) return null;
  const selectionKey = JSON.stringify([
    dataset.manifest.dataset_id, evidence.title, evidence.name, evidence.period,
    evidence.channels, evidence.scopeLabel, evidence.metric, evidence.formula, evidence.unitOverride,
  ]);
  return <EvidenceDialog key={selectionKey} dataset={dataset} evidence={evidence} onClose={onClose} filenames={filenames} mappings={mappings} />;
}

function EvidenceDialog({ dataset, evidence, onClose, filenames, mappings }: Omit<EvidenceDrawerProps, "evidence"> & { evidence: EvidenceSelection }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [page, setPage] = useState(0);
  const definition = metricDefinitions[evidence.name];
  const files = new Set<SourceRef["file"]>(["manifest.json"]);
  for (const field of definition.fields) {
    if ((SALES_FIELDS as readonly string[]).includes(field)) files.add("sales_daily.csv");
    else if ((COST_FIELDS as readonly string[]).includes(field)) files.add("channel_costs_daily.csv");
    else if (field === "ad_spend") files.add("ad_spend_daily.csv");
  }
  const sources = evidence.formula ? evidence.sources : evidence.sources.filter((source) => files.has(source.file));
  const rows = evidenceRows(dataset, sources);
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);
  const end = start + visibleRows.length;
  const displayValue = (metric: Metric) => {
    if (evidence.unitOverride === "percentage-point") return metric.value === null ? "N/A" : `${new Decimal(metric.value).toFixed(2, Decimal.ROUND_HALF_UP)} 百分點`;
    if (definition.unit === "money") return metric.value === null ? "N/A" : `NT$ ${formatMoney(metric.value)}`;
    if (definition.unit === "percent") return formatRate(metric.value);
    // This is display rounding only; the exact domain ratio is preserved below.
    return metric.value === null ? "N/A" : `${new Decimal(metric.value).toFixed(2, Decimal.ROUND_HALF_UP)} 倍`;
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    // Runs once per selected-evidence mount. The parent may pass an inline
    // onClose callback; callback identity never closes or reopens this dialog.
    return () => {
      if (dialog?.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="evidence-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <header className="evidence-header">
        <div>
          <p className="eyebrow">公式與來源</p>
          <h2 id={titleId}>{evidence.title}｜公式與來源</h2>
        </div>
        <button type="button" className="button quiet" onClick={onClose} autoFocus aria-label="關閉公式與來源">關閉</button>
      </header>
      <div className="evidence-body">
        <p id={descriptionId}>{evidence.scopeLabel ?? "目前篩選範圍"}；{evidence.period.start} 至 {evidence.period.end}；通路：{evidence.channels.join("、") || "未選擇"}。</p>
        <p className="number">{displayValue(evidence.metric)}</p>
        <p><strong>公式：</strong>{evidence.formula ?? definition.formula}</p>
        {(evidence.unitOverride || definition.unit !== "money") && evidence.metric.value !== null && (
          <p className="note">{evidence.unitOverride === "percentage-point" ? "系統百分點差值：" : "系統比率值："}{evidence.metric.value}{evidence.unitOverride === "percentage-point" ? " 百分點" : definition.unit === "percent" ? "（百分比顯示時乘以 100）" : " 倍"}。顯示值僅做格式化與捨入。</p>
        )}
        {evidence.metric.reason_codes.length > 0 && (
          <div className="note" role="status">
            <strong>資料限制／指標條件</strong>
            <ul>{evidence.metric.reason_codes.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <p>缺值保持未知；缺少費用列不代表零費用。比率的分母條件不成立時顯示 N/A。</p>
          </div>
        )}
        {evidence.components && evidence.components.length > 0 && (
          <section aria-label="公式組成項目">
            <h3>公式組成項目（TWD）</h3>
            <dl>
              {evidence.components.map((component, index) => (
                <div key={`${component.label}-${index}`}>
                  <dt>{component.label}</dt>
                  <dd className="number">{component.metric.value === null ? "N/A" : `NT$ ${formatMoney(component.metric.value)}`}{component.metric.reason_codes.length > 0 && <span className="note">（{component.metric.reason_codes.join("、")}）</span>}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <section aria-label="原始來源列">
          <h3>原始來源列</h3>
          <p className="note" aria-live="polite">納入來源共 {rows.length} 筆；本頁顯示 {rows.length === 0 ? 0 : start + 1}–{end} 筆，每頁最多 {pageSize} 筆。可翻頁查看全部來源。</p>
          <p className="note">金額單位為 TWD，列號是 CSV 的原始實際行號。以下僅展示此指標依賴的欄位；缺列與缺值均不補零。</p>
          {rows.length === 0 ? <p>此範圍沒有可列示的來源；請確認資料完整性。</p> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="可水平捲動的來源明細表">
              <table className="source-table">
                <caption className="sr-only">{evidence.title}的原始來源，第 {currentPage + 1} 頁，共 {lastPage + 1} 頁</caption>
                <thead><tr><th scope="col">檔案／原始行號</th><th scope="col">入帳範圍</th><th scope="col">來源欄位與值</th></tr></thead>
                <tbody>
                  {visibleRows.map((row, index) => {
                    const allowedFields: readonly string[] = ["date", "channel", "sku", "category", "currency", ...definition.fields];
                    const values = Object.entries(row.values).filter(([field]) => evidence.formula || row.file === "manifest.json" || allowedFields.includes(field));
                    return (
                      <tr key={`${row.file}-${row.line}-${row.date}-${row.channel}-${row.sku}-${start + index}`}>
                        <th scope="row">
                          <span>{filenames?.[row.file] ?? row.file}</span><br />{filenames?.[row.file] && filenames[row.file] !== row.file && <small>標準角色：{row.file}</small>}
                          <span>{row.line === null ? row.missing ? "缺列（無原始行號）" : "資料集設定（無 CSV 行號）" : `第 ${row.line} 行`}</span>
                          {row.missing && <span className="tag">缺漏來源</span>}
                        </th>
                        <td>{row.date ?? "整體資料集"}<br />{row.channel ?? "全部通路"}{row.sku ? <><br />SKU：{row.sku}</> : null}</td>
                        <td><dl>{values.map(([field, value]) => <div key={field}><dt>{fieldLabels[field] ?? field}{mappings?.[row.file]?.[field] && mappings[row.file]![field] !== field && <small>原欄位：{mappings[row.file]![field]}</small>}</dt><dd>{value === null ? "缺值（未知）" : value}</dd></div>)}</dl></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="原始來源分頁">
            <button type="button" className="button quiet" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button>
            <span>第 {currentPage + 1}／{lastPage + 1} 頁</span>
            <button type="button" className="button quiet" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>下一頁</button>
          </nav>
        </section>
      </div>
    </dialog>
  );
}
