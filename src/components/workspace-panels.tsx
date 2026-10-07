"use client";

import { useMemo, useState } from "react";
import { evidenceRows, formatAmountL2, formatAmountL3, formatCount, formatDateL1, formatMultiple, formatPeriodL1, formatRateL2, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { analyzeProducts } from "@/domain/analysis";
import { COST_FIELDS, SALES_FIELDS, type Dataset, type Metric, type MetricName, type ProductMetrics, type SourceRef } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import { IssueList, SideFileIssueList } from "./issue-list";
import { TemplateTable } from "./shell/template-table";
import { downloadText } from "@/application/download";
import { exportProductsCsv } from "@/application/export";
import { ASSIST_KPI_VERSION } from "@/application/assist-kpi";
import { formatSavedDateTime } from "@/application/auto-save";
import { buildManagerSummary } from "@/application/manager-summary";
import { categoryLabel, channelLabel, channelsLabel, conversionSentence, demoAlias } from "@/application/copy";
import type { TaxConversion } from "@/application/tax-basis";
import { exportTargetsCsv, targetDisplay, targetsCsvTemplate, type TargetIssue, type TargetSet } from "@/application/targets";
import { eventsCsvTemplate, exportEventsCsv, type EventIssue, type EventSet } from "@/application/events";
import { fill, labels } from "@/i18n";
import { ChannelWideTable } from "./channel-table";
import { DiagnosisList } from "./diagnosis-list";

type EvidenceHandler = (selection: EvidenceSelection) => void;
const ui = labels.ui.workspacePanels;
const v3 = labels.data.pageV3;
const previewLabels: Record<string, string> = {
  date: ui.previewColumns.date, channel: ui.previewColumns.channel, sku: "SKU", category: ui.previewColumns.category, units_sold: ui.previewColumns.unitsSold, currency: ui.previewColumns.currency,
  gross_sales: metricDefinitions.gross_sales.shortLabel, discounts: metricDefinitions.discounts.shortLabel, refunds: metricDefinitions.refunds.shortLabel, cogs_net: metricDefinitions.cogs_net.shortLabel,
  platform_fees: metricDefinitions.platform_fees.shortLabel, payment_fees: metricDefinitions.payment_fees.shortLabel, fulfillment_costs: metricDefinitions.fulfillment_costs.shortLabel, other_variable_costs: metricDefinitions.other_variable_costs.shortLabel, ad_spend: metricDefinitions.ad_spend.shortLabel,
};

/** V3-2b：商品表是 L2（整數元、一位小數 %），金額欄的表頭標一次「（元）」；精確值在「計算與來源」抽屜。 */
function displayMetric(name: MetricName, metric: Metric): string {
  if (metric.value === null) return labels.status.notApplicable;
  const unit = metricDefinitions[name].unit;
  if (unit === "percent") return formatRateL2(metric.value);
  if (unit === "multiple") return formatMultiple(metric.value, "L2");
  return formatAmountL2(metric.value);
}

/** §7.7.1 第 8 點：欄位對照的彙整（只列來源欄名與標準欄位不同的欄；全部相同時寫「標準欄名」）。 */
function mappingSummary(mapping: Record<string, string>): string {
  const renamed = Object.entries(mapping).filter(([standard, original]) => original && original !== standard);
  return renamed.length ? renamed.map(([standard, original]) => fill(v3.version.mappingItem, { original, standard })).join(v3.version.mappingJoiner) : labels.importWizard.mappingSources.exact;
}
/** 資料來源頁問題表的「下載問題清單 CSV」：與頂欄匯出選單同一個檔名（同一份內容）。 */
const ISSUES_CSV_FILENAME = "profitlens-issues.csv";

/**
 * V3-8 資料來源頁（PRD §7.7.1，依 1–9 的順序）：頁首（page-chrome）→ 資料狀態一行 → 資料問題 → 範圍與金額基準 → 本次匯入的前處理 →
 * 選填資料（目標、促銷檔期並列）→ 來源檔案預覽（三個 details）→ 版本與來源資訊（details，L3）→ 範本下載（3×3）。
 * 全部是既有資料，不新增計算；收合的內容保持掛載（M1）。
 */
export function DataWorkspace({ dataset, snapshot, filenames, mappings, conversion, targets = null, events = null, targetIssues = [], eventIssues = [], importedAt = null, onTargets, onEvents, onRemoveTargets, onRemoveEvents, onRemoveTargetRow, onRemoveEventRow }: { dataset: Dataset; snapshot: WorkspaceSnapshot; filenames?: Partial<Record<SourceRef["file"], string>>; mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>; conversion?: TaxConversion | null; targets?: TargetSet | null; events?: EventSet | null; targetIssues?: TargetIssue[]; eventIssues?: EventIssue[]; /** §7.7.1 第 8 點：匯入時間（ISO）；呼叫端沒有記錄時省略該列。 */ importedAt?: string | null; onTargets?: (file: File | undefined) => void; onEvents?: (file: File | undefined) => void; onRemoveTargets?: () => void; onRemoveEvents?: () => void; onRemoveTargetRow?: (line: number) => void; onRemoveEventRow?: (line: number) => void }) {
  const settings = dataset.manifest;
  const alias = demoAlias(settings.dataset_id);
  const anchor = settings.data_as_of;
  const files = [
    { name: "sales_daily.csv", title: labels.importWizard.files.sales, description: ui.fileGrain.sales, rows: dataset.sales, fields: ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"] },
    { name: "channel_costs_daily.csv", title: labels.importWizard.files.costs, description: ui.fileGrain.costs, rows: dataset.costs, fields: ["date", "channel", ...COST_FIELDS, "currency"] },
    { name: "ad_spend_daily.csv", title: labels.importWizard.files.ads, description: ui.fileGrain.ads, rows: dataset.ads, fields: ["date", "channel", "ad_spend", "currency"] },
  ] as const;
  const fileName = (name: SourceRef["file"]) => filenames?.[name] ?? name;
  const issueCount = dataset.issues.length;
  const issueCountText = formatCount(issueCount, "L2");
  const source = settings.source_type === "synthetic" ? labels.status.demo : labels.status.local;
  const basisText = conversion ? v3.statusLine.basisConverted : v3.statusLine.basisExclusive;
  const coverage = formatPeriodL1(settings.coverage_start, settings.coverage_end, { anchor });
  const period = (range: { start: string; end: string }) => formatPeriodL1(range.start, range.end, { anchor });
  // §7.7.1 第 2 點：「本機匯入 · 資料到 8/24 · 涵蓋 6/1–8/24（85 天）· 3 份檔案 · 金額基準：未稅（匯入時含稅已換算）· 3 項問題」。
  const statusLine = [
    source,
    fill(labels.status.ready, { date: formatDateL1(settings.data_as_of, { anchor }) }),
    fill(v3.statusLine.coverage, { range: coverage }),
    fill(v3.statusLine.files, { n: files.length }),
    fill(v3.statusLine.basis, { basis: basisText }),
    issueCount ? fill(v3.statusLine.issues, { n: issueCountText }) : v3.statusLine.noIssues,
  ].join(v3.separator);
  const preprocessingColumns = v3.preprocessing.columns;
  return <>
    {/* §7.7.1 第 2 點：資料狀態一行（L1，14px）；每一段都是既有資料。 */}
    <p className="data-status-line" data-testid="data-status-line">{statusLine}</p>
    {/* §7.7.1 第 3 點：資料問題（從頁尾移到第二段，給執行者先看）；欄位 檔案｜行號｜欄位｜問題｜修法｜原因碼，工具列有「下載問題清單 CSV」。 */}
    <section className="panel data-section" aria-labelledby="quality-heading" data-testid="data-issues">
      <div className="ui-section-head"><span className="data-section-title"><h2 className="ui-section-title" id="quality-heading">{labels.sections.dataIssues}</h2>{issueCount > 0 && <span className="ui-count-badge" role="img" aria-label={fill(v3.statusLine.issues, { n: issueCountText })}>{issueCountText}</span>}</span><p className="ui-section-subtitle">{ui.issuesNote}</p></div>
      {issueCount ? <IssueList issues={dataset.issues} filenames={filenames} mappings={mappings} download={{ filename: ISSUES_CSV_FILENAME, testId: "data-issues-download" }} /> : <p className="data-section-empty">{ui.noIssues}</p>}
    </section>
    {/* §7.7.1 第 4 點：範圍與金額基準——v2 的 9 欄 metadata 卡改成兩欄定義列表（dt 13px 次要色、dd 14px）；技術細節與欄位對照留在原處（收合）。 */}
    <section className="panel data-section" aria-labelledby="dataset-heading" data-testid="data-scope">
      <div className="ui-section-head"><h2 className="ui-section-title" id="dataset-heading">{labels.sections.dataScope}</h2><span className="ui-section-end"><span className="ui-lozenge">{source}</span></span></div>
      <dl className="ui-dl">
        <div><dt>{ui.meta.datasetId}</dt><dd>{settings.dataset_id}</dd></div>
        <div><dt>{labels.status.dataAsOf}</dt><dd>{formatDateL1(settings.data_as_of, { anchor })}</dd></div>
        <div><dt>{ui.meta.coverage}</dt><dd>{coverage}</dd></div>
        <div><dt>{labels.importWizard.basis.label}</dt><dd>{basisText}</dd></div>
        <div><dt>{ui.meta.currencyTimezone}</dt><dd>{settings.currency}{v3.separator}{settings.timezone}</dd></div>
        <div><dt>{ui.meta.channels}</dt><dd>{channelsLabel(settings.channels, alias)}</dd></div>
        <div><dt>{ui.meta.coverageConfirmed}</dt><dd>{settings.sales_coverage_confirmed ? ui.meta.coverageYes : ui.meta.coverageNo}</dd></div>
        <div><dt>{labels.periods.previous}</dt><dd>{period(snapshot.report.previous.period)}</dd></div>
        <div><dt>{labels.periods.current}</dt><dd>{period(snapshot.report.current.period)}</dd></div>
        <div><dt>{ui.meta.scopeChannels}</dt><dd>{channelsLabel(snapshot.report.scope.channels, alias)}</dd></div>
      </dl>
      <p className="note">{ui.datasetCaution}</p>
      <details><summary>{labels.sections.technicalDetails}</summary><dl className="ui-dl"><div><dt>{labels.ui.workspacePanels.meta.formatVersionTechnical}</dt><dd className="ui-mono">{settings.schema_version} / {snapshot.metric_version}</dd></div><div><dt>{labels.ui.workspacePanels.meta.datasetShaTechnical}</dt><dd><code>{snapshot.dataset_hash}</code></dd></div><div><dt>{labels.ui.workspacePanels.meta.filterShaTechnical}</dt><dd><code>{snapshot.filter_hash}</code></dd></div><div><dt>{labels.ui.workspacePanels.meta.amountBasisTechnical}</dt><dd><code>{settings.amount_basis}</code></dd></div></dl></details>
      {mappings && <details><summary>{ui.mappingsSummary}</summary>{Object.entries(mappings).map(([file, mapping]) => <div key={file}><h3 className="ui-mono">{fileName(file as SourceRef["file"])}</h3><dl className="ui-dl">{Object.entries(mapping).map(([standard, original]) => <div key={standard}><dt className="ui-mono">{standard}</dt><dd>{original}</dd></div>)}</dl></div>)}</details>}
    </section>
    {/* §7.7.1 第 5 點：本次匯入的前處理——表格（欄位｜含稅合計（元）｜未稅合計（元）｜稅率），一列一個換算欄位，取代 v2 的條列；未稅匯入時一句 noConversion。 */}
    <section className="panel data-section" aria-labelledby="preprocessing-heading" data-testid="data-preprocessing">
      <div className="ui-section-head"><h2 className="ui-section-title" id="preprocessing-heading">{labels.sections.dataPreprocessing}</h2>{conversion && <p className="ui-section-subtitle">{conversionSentence(conversion)}</p>}</div>
      {!conversion ? <p className="data-section-empty">{labels.importWizard.noConversion}</p> : conversion.totals && <div className="table-scroll" tabIndex={0} role="region" aria-label={v3.preprocessing.tableAria}><table className="ui-table data-preprocessing-table">
        <caption className="sr-only">{v3.preprocessing.tableAria}</caption>
        <thead><tr><th scope="col">{preprocessingColumns.field}</th><th scope="col" className="num">{preprocessingColumns.raw}</th><th scope="col" className="num">{preprocessingColumns.converted}</th><th scope="col" className="num">{preprocessingColumns.rate}</th></tr></thead>
        <tbody>{conversion.fields.map(field => { const totals = conversion.totals?.[field]; return <tr key={field} data-field={field}><th scope="row">{field in labels.metrics ? labels.metrics[field as MetricName].label : field}</th><td className="num">{formatAmountL3(totals?.raw)}</td><td className="num">{formatAmountL3(totals?.converted)}</td><td className="num">{formatRateL2(conversion.rate)}</td></tr>; })}</tbody>
      </table></div>}
    </section>
    {/* §7.7.1 第 6 點：選填資料——目標與促銷檔期兩表並列（≥ 1024 兩欄）；每表工具列 上傳、下載範本、下載目前資料、移除；錯誤清單與第 3 段同一組欄位。R4：只標示，不改計算。 */}
    <section className="panel data-section" aria-labelledby="optional-heading" data-testid="data-optional">
      <div className="ui-section-head"><h2 className="ui-section-title" id="optional-heading">{v3.optionalHeading}</h2></div>
      <div className="data-optional-grid">
        <section className="side-entry" aria-labelledby="targets-heading" data-testid="targets-entry">
          <div className="side-entry-head"><h3 id="targets-heading">{labels.targets.entry}</h3><span className="side-entry-state">{targets ? fill(labels.targets.loaded, { n: targets.rows.length, name: targets.filename ?? "" }) : labels.targets.none}</span></div>
          <p className="side-entry-intro">{labels.targets.intro}</p>
          <div className="ui-toolbar side-entry-controls">
            <label className="file-pick"><span className="button quiet">{labels.targets.upload}</span><input aria-label={labels.targets.upload} type="file" accept=".csv,text/csv" onChange={event => { onTargets?.(event.target.files?.[0]); event.target.value = ""; }} /></label>
            <button type="button" className="ui-btn ui-btn-text" onClick={() => downloadText(targetsCsvTemplate(), "targets.csv")}>{labels.targets.template}</button>
            {targets && <button type="button" className="ui-btn ui-btn-text" onClick={() => downloadText(exportTargetsCsv(targets), "targets.csv")}>{labels.targets.download}</button>}
            {targets && <button type="button" className="ui-btn ui-btn-text" onClick={onRemoveTargets}>{labels.targets.remove}</button>}
          </div>
          {targetIssues.length > 0 && <div className="side-entry-issues" role="alert" data-testid="targets-issues"><SideFileIssueList file="targets.csv" issues={targetIssues} regionLabel={fill(v3.issueTable.sideRegionAria, { name: labels.targets.entry })} /></div>}
          {targets && <div className="table-scroll" role="region" aria-label={labels.targets.entry} tabIndex={0}><table className="ui-table" data-testid="targets-table"><thead><tr><th scope="col" className="num">{labels.csvColumns.line}</th><th scope="col">{labels.targets.columns.period_start}</th><th scope="col">{labels.targets.columns.period_end}</th><th scope="col">{labels.targets.columns.channel}</th><th scope="col">{labels.targets.columns.metric}</th><th scope="col" className="num">{labels.targets.columns.target}</th><th scope="col"></th></tr></thead><tbody>{targets.rows.map(row => <tr key={row.line}><th scope="row" className="num ui-mono">{row.line}</th><td>{row.period_start}</td><td>{row.period_end}</td><td>{row.channel === "ALL" ? ui.scopeAll : channelLabel(row.channel, alias)}</td><td>{metricDefinitions[row.metric].label}</td><td className="num">{targetDisplay(row)}</td><td className="row-action"><button type="button" className="ui-btn ui-btn-text" aria-label={`${labels.targets.removeRow} ${row.line}`} onClick={() => onRemoveTargetRow?.(row.line)}>{labels.targets.removeRow}</button></td></tr>)}</tbody></table></div>}
        </section>
        <section className="side-entry" aria-labelledby="events-heading" data-testid="events-entry">
          <div className="side-entry-head"><h3 id="events-heading">{labels.events.entry}</h3><span className="side-entry-state">{events ? fill(labels.events.loaded, { n: events.rows.length, name: events.filename ?? "" }) : labels.events.none}</span></div>
          <p className="side-entry-intro">{labels.events.intro}</p>
          <div className="ui-toolbar side-entry-controls">
            <label className="file-pick"><span className="button quiet">{labels.events.upload}</span><input aria-label={labels.events.upload} type="file" accept=".csv,text/csv" onChange={event => { onEvents?.(event.target.files?.[0]); event.target.value = ""; }} /></label>
            <button type="button" className="ui-btn ui-btn-text" onClick={() => downloadText(eventsCsvTemplate(), "events.csv")}>{labels.events.template}</button>
            {events && <button type="button" className="ui-btn ui-btn-text" onClick={() => downloadText(exportEventsCsv(events), "events.csv")}>{labels.events.download}</button>}
            {events && <button type="button" className="ui-btn ui-btn-text" onClick={onRemoveEvents}>{labels.events.remove}</button>}
          </div>
          {eventIssues.length > 0 && <div className="side-entry-issues" role="alert" data-testid="events-issues"><SideFileIssueList file="events.csv" issues={eventIssues} regionLabel={fill(v3.issueTable.sideRegionAria, { name: labels.events.entry })} /></div>}
          {events && <div className="table-scroll" role="region" aria-label={labels.events.entry} tabIndex={0}><table className="ui-table" data-testid="events-table"><thead><tr><th scope="col" className="num">{labels.csvColumns.line}</th><th scope="col">{labels.events.columns.start}</th><th scope="col">{labels.events.columns.end}</th><th scope="col">{labels.events.columns.label}</th><th scope="col"></th></tr></thead><tbody>{events.rows.map(row => <tr key={row.line}><th scope="row" className="num ui-mono">{row.line}</th><td>{row.start}</td><td>{row.end}</td><td>{row.label}</td><td className="row-action"><button type="button" className="ui-btn ui-btn-text" aria-label={`${labels.events.removeRow} ${row.line}`} onClick={() => onRemoveEventRow?.(row.line)}>{labels.events.removeRow}</button></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </section>
    {/* §7.7.1 第 7 點：來源檔案預覽——三個 <details>（預設收合、內容保持掛載），summary 寫檔案角色、檔名與列數；各前 10 列，行號等寬字。 */}
    <section className="panel data-section" aria-labelledby="preview-heading" data-testid="data-preview">
      <div className="ui-section-head"><h2 className="ui-section-title" id="preview-heading">{labels.sections.dataPreview}</h2><p className="ui-section-subtitle">{ui.previewNote}</p></div>
      {files.map(file => {
        const preview = evidenceRows(dataset, file.rows.slice(0, 10).map(row => row.source)).sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        const dates = file.rows.map(row => row.date).sort();
        return <details className="data-preview-file" key={file.name} data-testid={`data-preview-${file.name}`}>
          <summary>{file.title}{v3.separator}<span className="ui-mono">{fileName(file.name)}</span>{v3.separator}{fill(ui.rowCount, { n: formatCount(file.rows.length, "L2") })}</summary>
          <p className="note"><code>{fileName(file.name)}</code>（{file.name}） · {file.description} · {dates.length ? fill(ui.dateRange, { start: dates[0], end: dates[dates.length - 1] }) : ui.noRows}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={fill(ui.previewRegionAria, { title: file.title })}>
            <table className="table preview-table"><caption className="sr-only">{fill(ui.previewCaption, { fileName: file.name })}</caption><thead><tr><th scope="col">{ui.lineNumber}</th>{file.fields.map(field => <th scope="col" key={field}>{previewLabels[field]}</th>)}</tr></thead><tbody>{preview.map(row => <tr key={`${row.file}-${row.line}`}><th scope="row" className="ui-mono">{row.line}</th>{file.fields.map(field => <td key={field}>{row.values[field] === null ? labels.status.missing : row.values[field]}</td>)}</tr>)}</tbody></table>
          </div>
        </details>;
      })}
    </section>
    {/* §7.7.1 第 8 點：版本與來源資訊（L3，新的彙整 <details>，預設收合）：資料版本、指標版本、金額基準代碼、匯入時間、欄位對照；原處的技術細節保留。 */}
    <details className="panel data-section data-version" data-testid="data-version-info">
      <summary><h2 className="ui-section-title">{v3.version.heading}</h2></summary>
      <dl className="ui-dl">
        <div><dt>{v3.version.dataVersion}</dt><dd className="ui-mono">{snapshot.dataset_hash}</dd></div>
        <div><dt>{v3.version.metricVersion}</dt><dd className="ui-mono">{[snapshot.metric_version, ASSIST_KPI_VERSION].join(v3.separator)}</dd></div>
        <div><dt>{ui.meta.amountBasisTechnical}</dt><dd className="ui-mono">{conversion ? [settings.amount_basis, `${conversion.basis} ${conversion.rate}`].join(v3.separator) : settings.amount_basis}</dd></div>
        {importedAt && <div><dt>{v3.version.importedAt}</dt><dd>{formatSavedDateTime(new Date(importedAt))}</dd></div>}
        {mappings && Object.keys(mappings).length > 0 && <div className="ui-dl-wide"><dt>{ui.mappingsSummary}</dt><dd><ul className="data-version-mappings">{Object.entries(mappings).map(([file, mapping]) => <li key={file}><span className="ui-mono">{fileName(file as SourceRef["file"])}</span>{v3.separator}{mappingSummary(mapping ?? {})}</li>)}</ul></dd></div>}
      </dl>
    </details>
    {/* §7.7.1 第 9 點：範本下載——與頂欄匯出選單「匯入範本」同一張 3×3 表（檔案｜空白範本｜範例檔）。 */}
    <section className="panel data-section" aria-labelledby="templates-heading" data-testid="data-templates">
      <div className="ui-section-head"><h2 className="ui-section-title" id="templates-heading">{labels.downloads.templatesHeading}</h2></div>
      <TemplateTable />
    </section>
  </>;
}

export function Diagnosis({ snapshot, onEvidence, onCreateAction, events = null }: { snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler; onCreateAction?: (diagnostic: WorkspaceSnapshot["report"]["diagnostics"][number]) => void; events?: EventSet | null }) {
  const summary = useMemo(() => buildManagerSummary(snapshot), [snapshot]);
  const alias = demoAlias(snapshot.report.dataset_id);
  // V3-5（PRD §7.2）：健檢結果先放（這是結論；一個規則一列，與三件事同一套 diagnosisGroups）→ 各通路兩期比較（通路寬表 diagnosis 變體）；AI 區塊由 dashboard 接在最後（預設收合）。
  return <>
  <DiagnosisList snapshot={snapshot} groups={summary.diagnosis} onEvidence={onEvidence} onCreateAction={onCreateAction} events={events} />
  <section className="panel channel-compare" aria-labelledby="channel-table-heading" data-testid="channel-compare">
    <div className="sec-head"><div className="sec-title"><h2 id="channel-table-heading">{labels.diagnosis.tableV3.heading}</h2></div><span className="sec-scope">{channelsLabel(summary.scope.channels, alias)}</span></div>
    <p className="sub">{ui.channelTableCaution}</p>
    <ChannelWideTable variant="diagnosis" summary={summary} onEvidence={onEvidence} ariaLabel={labels.sections.channelTableAria} caption={labels.sections.channelTableCaption} />
  </section>
  </>;
}

const productColumns: { name: Exclude<keyof ProductMetrics, "units_sold">; label: string }[] = [
  { name: "net_revenue", label: metricDefinitions.net_revenue.label }, { name: "cogs_net", label: metricDefinitions.cogs_net.label },
  { name: "gross_profit", label: metricDefinitions.gross_profit.label }, { name: "gross_margin", label: metricDefinitions.gross_margin.shortLabel },
  { name: "discounts", label: metricDefinitions.discounts.label }, { name: "refunds", label: metricDefinitions.refunds.shortLabel },
];

export function Products({ dataset, snapshot, onEvidence, filenames }: { dataset: Dataset; snapshot: WorkspaceSnapshot; onEvidence: EvidenceHandler; filenames?: Partial<Record<SourceRef["file"], string>> }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const channels = snapshot.report.scope.channels;
  const period = snapshot.report.current.period;
  const alias = demoAlias(dataset.manifest.dataset_id);
  const categories = [...new Set(dataset.sales.filter(row => channels.includes(row.channel)).map(row => row.category).filter(category => category.trim() !== ""))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const result = useMemo(() => analyzeProducts(dataset, { period, channels, ...(activeCategory ? { category: activeCategory } : {}) }), [dataset, period, channels, activeCategory]);
  const query = search.trim().toLocaleLowerCase();
  const rows = result.rows.filter(row => !query || row.sku.toLocaleLowerCase().includes(query));
  return <section className="panel" aria-labelledby="products-heading">
    <div className="section-heading"><div><h2 id="products-heading">{labels.sections.productTable}</h2><p className="note">{ui.productsCaution}</p></div><span className="tag">{ui.tagTwdExclusive}</span></div>
    <div className="product-filters"><label htmlFor="product-category">{ui.filterCategory}<select aria-label={ui.filterCategory} id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">{ui.allCategories}</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value, alias)}</option>)}</select></label><label htmlFor="product-search">{ui.searchSku}<input id="product-search" type="search" placeholder={ui.searchSkuPlaceholder} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <div className="export-actions"><button className="button quiet" onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows, { category: activeCategory, query }, filenames), "profitlens-products.csv")}>{labels.downloads.productsCsv}</button><span className="note">{ui.productsCsvHint}</span></div>
    <div className="metric-strip"><p aria-live="polite">{fill(ui.productCount, { n: rows.length })}</p><p className="note">{fill(ui.productScope, { start: period.start, end: period.end, channels: channelsLabel(channels, alias), category: activeCategory ? categoryLabel(activeCategory, alias) : ui.allCategories })}</p></div>
    {rows.length === 0 ? <p>{ui.noProducts}</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.productTableAria}><table className="table" data-testid="product-table"><caption className="sr-only">{ui.productTableCaption}</caption><thead><tr><th scope="col">{ui.previewColumns.channel}</th><th scope="col">SKU</th><th scope="col">{ui.previewColumns.category}</th>{productColumns.map(column => <th scope="col" key={column.name}>{metricDefinitions[column.name].unit === "money" ? fill(labels.units.yuanColumn, { label: column.label }) : column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.channel, row.sku])}><td>{channelLabel(row.channel, alias)}</td><th scope="row">{row.sku}</th><td>{row.category.trim() ? categoryLabel(row.category, alias) : ui.uncategorized}</td>{productColumns.map(column => {
      const metric = row.metrics[column.name];
      return <td key={column.name}><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined} aria-label={fill(ui.productCellAria, { channel: channelLabel(row.channel, alias), sku: row.sku, metric: column.label, value: displayMetric(column.name, metric) })} onClick={() => onEvidence({ title: fill(ui.productEvidenceTitle, { sku: row.sku, metric: column.label }), name: column.name, metric, period, channels: [row.channel], sources: row.sources, scopeLabel: fill(ui.productScopeLabel, { sku: row.sku, category: categoryLabel(row.category, alias) }) })}>{displayMetric(column.name, metric)}</button>{metric.value === null && metric.reason_codes.length > 0 && <small className="note">{labels.status.missing}</small>}</td>;
    })}</tr>)}</tbody></table></div>}
  </section>;
}
