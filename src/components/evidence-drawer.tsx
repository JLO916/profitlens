"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { channelLabel, channelsLabel, demoAlias } from "@/application/copy";
import { emptyKindOf, evidenceRows, formatAmountL1, formatAmountL3, formatCount, formatEmpty, formatMultiple, formatPerUnit, formatPeriodL1, formatPointsValue, formatRateLayer, formatSignedDelta, metricDefinitions, type Layer } from "@/application/presentation";
import { rateToPercent, type RawValuesByFile, type TaxConversion } from "@/application/tax-basis";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS } from "@/domain/types";
import type { Dataset, FileName, Metric, MetricName, Metrics, Period, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { trapTabKey } from "./shell/focus-trap";
import { ShellIcon } from "./shell/shell-icon";

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
  /** R4：輔助指標的件數與件均不是金額；count／money_per_unit 不畫階梯，直接顯示。 */
  unitOverride?: "percentage-point" | "count" | "money_per_unit";
  /** R4：非 domain 指標（輔助指標、目標）自帶技術公式與版本；null 值的顯示字（例如「不適用」）。 */
  formulaTechnical?: string;
  /** V3-9a 收尾：非 domain 指標（例如損益兩平 MER）自帶的白話定義；沒給時用 metricDefinitions[name].plain。 */
  definition?: string;
  metricVersion?: string;
  nullDisplay?: string;
  /** 商品層級證據：不畫四層階梯（商品只看毛利）。 */
  sku?: string;
}
interface EvidenceDrawerProps {
  dataset: Dataset;
  snapshot?: Pick<WorkspaceSnapshot, "report" | "weeks">;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  mappings?: Partial<Record<SourceRef["file"], Record<string, string>>>;
  /** R3：含稅匯入時每列被換算格子的原值（檔案 → 行號 → 欄位），顯示「含稅原值 → 未稅換算值」。 */
  rawValues?: RawValuesByFile;
  conversion?: TaxConversion | null;
  evidence: EvidenceSelection | null;
  onClose: () => void;
  onBasis?: () => void;
}
const pageSize = 50;
const copy = labels.evidence;
const v3 = labels.evidence.drawerV3;
type SourceTab = "sales" | "costs" | "ads" | "manifest";
const fileOfTab: Record<SourceTab, SourceRef["file"]> = { sales: "sales_daily.csv", costs: "channel_costs_daily.csv", ads: "ad_spend_daily.csv", manifest: "manifest.json" };

/** 四層階梯：原價收入 → 淨營收 → 商品毛利 → 通路貢獻 → 扣廣告後貢獻；每行的 sign 決定顯示 −／＝。 */
const LADDER: { name: MetricName; op: "" | "−" | "＝" }[] = [
  { name: "gross_sales", op: "" }, { name: "discounts", op: "−" }, { name: "refunds", op: "−" }, { name: "net_revenue", op: "＝" },
  { name: "cogs_net", op: "−" }, { name: "gross_profit", op: "＝" },
  { name: "platform_fees", op: "−" }, { name: "payment_fees", op: "−" }, { name: "fulfillment_costs", op: "−" }, { name: "other_variable_costs", op: "−" }, { name: "contribution_before_marketing", op: "＝" },
  { name: "ad_spend", op: "−" }, { name: "contribution_after_marketing", op: "＝" },
];
const RATIOS: Partial<Record<MetricName, [MetricName, MetricName]>> = {
  gross_margin: ["gross_profit", "net_revenue"], contribution_margin: ["contribution_after_marketing", "net_revenue"], discount_rate: ["discounts", "gross_sales"],
  mer: ["net_revenue", "ad_spend"], fulfillment_burden: ["fulfillment_costs", "net_revenue"], marketing_burden: ["ad_spend", "net_revenue"],
};

/** 原始明細表自己有欄的來源欄位（日期、通路；商品寫在通路欄下一行）。 */
const OWN_COLUMNS: readonly string[] = ["date", "channel", "sku"];
/** 原始明細裡要依 L3 取位的欄位（金額到分、件數加千分位）；其他欄位（日期、通路、幣別）原樣顯示。 */
const NUMERIC_TEXT = /^[+-]?\d+(?:\.\d+)?$/;
function sourceValue(field: string, value: string): string {
  if (!NUMERIC_TEXT.test(value.trim())) return value;
  if ((AMOUNT_FIELDS as readonly string[]).includes(field)) return formatAmountL3(value);
  return field === "units_sold" ? formatCount(value, "L3") : value;
}

/** 找出與這筆證據同期間、同通路範圍的合計指標；找不到（例如商品或跨期差額）就不畫階梯。 */
function ladderMetrics(snapshot: EvidenceDrawerProps["snapshot"], evidence: EvidenceSelection): Metrics | null {
  if (!snapshot || evidence.components || evidence.unitOverride || evidence.sku) return null;
  const { report, weeks } = snapshot;
  const same = (period: Period) => period.start === evidence.period.start && period.end === evidence.period.end;
  const base = same(report.previous.period) ? report.previous : same(report.current.period) ? report.current : null;
  if (base) {
    const all = [...report.scope.channels].sort().join("|") === [...evidence.channels].sort().join("|");
    if (all) return base.metrics;
    if (evidence.channels.length === 1 && base.channels[evidence.channels[0]]) return base.channels[evidence.channels[0]].metrics;
    return null;
  }
  const week = weeks.find(row => row.start === evidence.period.start && row.end === evidence.period.end);
  return week ? week.metrics : null;
}

/**
 * V3-5（§7.8）：標題列副標「{範圍} · {期間}」，例如「全部通路 · 本期 7/13–8/23」「影響金額 · 合計（…） · 7/13–8/23」。
 * 期間用 formatPeriodL1（M/D，不附天數；以資料到的年份為準，跨年才寫年份）；與報表本期或上期相同時前面加「本期」「上期」。
 * 沒有 scopeLabel 時範圍就是通路（涵蓋資料集全部通路時寫「全部通路」）；scopeLabel 沒寫出通路時另附「通路：…」（v2 範圍行的資訊不少）。只組字，不做任何計算。
 */
export function evidenceSubtitle(evidence: Pick<EvidenceSelection, "period" | "channels" | "scopeLabel">, options: { alias: boolean; anchor?: string; allChannels?: readonly string[]; report?: { current: { period: Period }; previous: { period: Period } } }): string {
  const sorted = (list: readonly string[]) => [...list].sort().join("|");
  const all = options.allChannels !== undefined && options.allChannels.length > 0 && sorted(options.allChannels) === sorted(evidence.channels);
  const listed = evidence.channels.length ? channelsLabel(evidence.channels, options.alias) : copy.noChannels;
  const channels = all ? copy.allChannels : listed;
  const range = formatPeriodL1(evidence.period.start, evidence.period.end, { anchor: options.anchor, days: false });
  const same = (period: Period | undefined) => period !== undefined && period.start === evidence.period.start && period.end === evidence.period.end;
  const name = same(options.report?.current.period) ? labels.periods.current : same(options.report?.previous.period) ? labels.periods.previous : null;
  const period = name ? fill(v3.periodNamed, { name, range }) : range;
  if (!evidence.scopeLabel) return fill(v3.subtitle, { scope: channels, period });
  const named = evidence.scopeLabel.includes(listed) || (all && evidence.scopeLabel.includes(copy.allChannels));
  return named ? fill(v3.subtitle, { scope: evidence.scopeLabel, period }) : fill(v3.subtitleChannels, { scope: evidence.scopeLabel, period, channels });
}

export function EvidenceDrawer({ dataset, snapshot, evidence, onClose, onBasis, filenames, mappings, rawValues, conversion }: EvidenceDrawerProps) {
  // Remounting the modal for a different selected metric resets paging without
  // placing derived financial or source data in component state.
  if (!evidence) return null;
  const selectionKey = JSON.stringify([
    dataset.manifest.dataset_id, evidence.title, evidence.name, evidence.period,
    evidence.channels, evidence.scopeLabel, evidence.metric, evidence.formula, evidence.unitOverride,
  ]);
  return <EvidenceDialog key={selectionKey} dataset={dataset} snapshot={snapshot} evidence={evidence} onClose={onClose} onBasis={onBasis} filenames={filenames} mappings={mappings} rawValues={rawValues} conversion={conversion} />;
}

function EvidenceDialog({ dataset, snapshot, evidence, onClose, onBasis, filenames, mappings, rawValues, conversion }: Omit<EvidenceDrawerProps, "evidence"> & { evidence: EvidenceSelection }) {
  const conversionNote = conversion ? fill(copy.conversionNote, { percent: rateToPercent(conversion.rate), fields: conversion.fields.map(field => field in labels.metrics ? labels.metrics[field as MetricName].label : field).join("、") }) : null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const alias = demoAlias(dataset.manifest.dataset_id);
  const definition = metricDefinitions[evidence.name];
  const files = new Set<SourceRef["file"]>(["manifest.json"]);
  for (const field of definition.fields) {
    if ((SALES_FIELDS as readonly string[]).includes(field)) files.add("sales_daily.csv");
    else if ((COST_FIELDS as readonly string[]).includes(field)) files.add("channel_costs_daily.csv");
    else if (field === "ad_spend") files.add("ad_spend_daily.csv");
  }
  const rows = useMemo(() => evidenceRows(dataset, evidence.formula ? evidence.sources : evidence.sources.filter((source) => files.has(source.file))), [dataset, evidence]);  // eslint-disable-line react-hooks/exhaustive-deps -- files derives from evidence.name
  const counts = { sales: 0, costs: 0, ads: 0, manifest: 0 } as Record<SourceTab, number>;
  for (const row of rows) counts[(Object.keys(fileOfTab) as SourceTab[]).find(tab => fileOfTab[tab] === row.file) ?? "manifest"]++;
  const tabs = (Object.keys(fileOfTab) as SourceTab[]).filter(tab => counts[tab] > 0);
  const [tab, setTab] = useState<SourceTab>(tabs[0] ?? "sales");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(row => row.file === fileOfTab[activeTab]).filter(row => !needle || [row.date, row.channel, row.sku, row.channel ? channelLabel(row.channel, alias) : null].some(value => value?.toLowerCase().includes(needle)));
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const visibleRows = filtered.slice(start, start + pageSize);
  const end = start + visibleRows.length;
  const ladder = ladderMetrics(snapshot, evidence);
  const ratio = RATIOS[evidence.name];
  const ladderRows = ladder && !ratio ? LADDER.slice(0, LADDER.findIndex(row => row.name === evidence.name) + 1) : [];
  // V3-2b（§7.8）：標題下的大數字是 L1（萬、一位小數），下一行永遠顯示到分的精確值（L3）；抽屜內其餘數字（階梯、組成、原始明細）一律 L3。
  // 差額類證據（有上期／本期組成或百分點）帶正負號。只做顯示取位，精確的 domain 值仍在技術細節。
  const signed = Boolean(evidence.components?.length);
  const displayValue = (metric: Metric, layer: Layer = "L3") => {
    if (metric.value === null) return evidence.nullDisplay ?? formatEmpty(emptyKindOf(metric.reason_codes), layer === "L3" ? { layer, reasonCodes: metric.reason_codes } : {});
    if (evidence.unitOverride === "count") return formatCount(metric.value, "L1");
    if (evidence.unitOverride === "money_per_unit") return formatPerUnit(metric.value, layer === "L1" ? "L1" : "L3");
    if (evidence.unitOverride === "percentage-point") return formatPointsValue(metric.value, layer);
    if (definition.unit === "money") {
      if (layer === "L1") return signed ? formatSignedDelta(metric.value, "L1") : formatAmountL1(metric.value);
      return fill(labels.units.yuan, { value: signed ? formatSignedDelta(metric.value, "L3") : formatAmountL3(metric.value) });
    }
    if (definition.unit === "percent") return formatRateLayer(metric.value, layer);
    return formatMultiple(metric.value, layer);
  };
  /** 精確值行：件數沒有取位，不重複顯示；空值不顯示（原因碼在技術細節）。 */
  const preciseValue = evidence.metric.value === null || evidence.unitOverride === "count" ? null : displayValue(evidence.metric, "L3");
  const emptyL3 = (metric: Metric) => formatEmpty(emptyKindOf(metric.reason_codes), { layer: "L3", reasonCodes: metric.reason_codes });
  const money = (metric: Metric) => metric.value === null ? emptyL3(metric) : fill(labels.units.yuan, { value: formatAmountL3(metric.value) });
  // V3-5 組成項目表（14px）：單位只寫在表頭；上期／本期兩項時一列三欄加差額（差額＝這筆證據的值），其他情況兩欄。
  const components = evidence.components ?? [];
  const moneyUnit = !evidence.unitOverride && definition.unit === "money";
  const componentValue = (metric: Metric) => metric.value === null ? emptyL3(metric) : moneyUnit ? formatAmountL3(metric.value) : displayValue(metric);
  const previousComponent = components.find(component => component.label === labels.periods.previous);
  const currentComponent = components.find(component => component.label === labels.periods.current);
  const periodPair = components.length === 2 && previousComponent && currentComponent ? { previous: previousComponent.metric, current: currentComponent.metric } : null;
  // 指標定義與算法：domain 指標用指標定義；件數、件均這類非 domain 指標用證據自帶的公式說明。版本與技術細節同源。
  const definitionText = evidence.definition ?? (evidence.unitOverride === "count" || evidence.unitOverride === "money_per_unit" ? evidence.formula ?? definition.plain : definition.plain);
  const metricVersion = evidence.metricVersion ?? "contribution-v1";
  const subtitle = evidenceSubtitle(evidence, { alias, anchor: dataset.manifest.data_as_of, allChannels: dataset.manifest.channels, report: snapshot?.report });
  const column = v3.sourceColumns;

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
      className="evidence-dialog evidence-drawer"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={trapTabKey}
    >
      <header className="evidence-head">
        <div className="evidence-head-text">
          <h2 id={titleId}>{evidence.title}<span className="sr-only">{" · "}{labels.sections.evidence}</span></h2>
          <p id={descriptionId} className="sub">{subtitle}</p>
        </div>
        <button type="button" className="ui-btn ui-btn-icon evidence-close" aria-label={labels.buttons.close} onClick={onClose} autoFocus><ShellIcon name="close" size={20} /></button>
      </header>
      <div className="evidence-body">
        <p className="number">{displayValue(evidence.metric, "L1")}</p>
        {preciseValue && <p className="evidence-precise" data-testid="evidence-precise-value">{preciseValue}</p>}
        <section className="evidence-section evidence-ladder" aria-label={copy.ladderTitle}>
          <h3>{copy.ladderTitle}</h3>
          <p className="evidence-formula">{evidence.formula ?? definition.formula}</p>
          {ladderRows.length > 0 && <table className="ladder-table"><caption className="sr-only">{copy.ladderNote}</caption><tbody>{ladderRows.map(row => <tr key={row.name} className={row.name === evidence.name ? "current" : row.op === "＝" ? "subtotal" : ""}><td className="ladder-op" aria-hidden="true">{row.op}</td><th scope="row">{metricDefinitions[row.name].label}</th><td className="ladder-amount">{money(ladder![row.name])}</td></tr>)}</tbody></table>}
          {ladder && ratio && <table className="ladder-table"><tbody>
            <tr><td className="ladder-op" aria-hidden="true"></td><th scope="row">{metricDefinitions[ratio[0]].label}</th><td className="ladder-amount">{money(ladder[ratio[0]])}</td></tr>
            <tr><td className="ladder-op" aria-hidden="true">÷</td><th scope="row">{metricDefinitions[ratio[1]].label}</th><td className="ladder-amount">{money(ladder[ratio[1]])}</td></tr>
            <tr className="current"><td className="ladder-op" aria-hidden="true">＝</td><th scope="row">{definition.label}</th><td className="ladder-amount">{displayValue(evidence.metric)}</td></tr>
          </tbody></table>}
          {ladderRows.length > 0 && <p className="note">{copy.ladderNote}</p>}
        </section>
        {components.length > 0 && (
          <section className="evidence-section evidence-components" aria-label={copy.components}>
            <h3>{copy.components}</h3>
            {periodPair ? (
              <table className="kv l3">
                <thead><tr><th scope="col">{v3.componentsColumns.item}</th><th scope="col" className="num">{v3.componentsColumns.previous}</th><th scope="col" className="num">{v3.componentsColumns.current}</th><th scope="col" className="num">{v3.componentsColumns.change}</th></tr></thead>
                <tbody><tr>
                  <th scope="row">{definition.label}</th>
                  <td className="num">{componentValue(periodPair.previous)}</td>
                  <td className="num">{componentValue(periodPair.current)}</td>
                  <td className="num">{evidence.metric.value === null ? emptyL3(evidence.metric) : moneyUnit ? formatSignedDelta(evidence.metric.value, "L3") : displayValue(evidence.metric)}</td>
                </tr></tbody>
              </table>
            ) : (
              <table className="kv l3">
                <thead><tr><th scope="col">{v3.componentsColumns.item}</th><th scope="col" className="num">{moneyUnit ? v3.componentsColumns.amount : v3.componentsColumns.value}</th></tr></thead>
                <tbody>{components.map((component, index) => <tr key={`${component.label}-${index}`}><th scope="row">{component.label}</th><td className="num">{componentValue(component.metric)}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        )}
        <section className="evidence-section evidence-definition" aria-label={v3.definitionTitle}>
          <h3>{v3.definitionTitle}</h3>
          <p>{definitionText}<span className="evidence-version">{fill(v3.version, { version: metricVersion })}</span>{onBasis && <button type="button" className="ui-btn ui-btn-text evidence-basis" onClick={onBasis}>{labels.buttons.basis}</button>}</p>
        </section>
        <section aria-label={copy.sourcesTitle} className="evidence-section evidence-sources">
          <h3>{v3.sourcesTitle}</h3>
          <p className="note">{copy.sourcesNote}</p>
          {conversionNote && <p className="note" data-testid="evidence-conversion-note">{conversionNote}</p>}
          {rows.length === 0 ? <p>{copy.none}</p> : (<>
            <div className="source-controls">
              <div className="source-tabs ui-segmented" role="group" aria-label={labels.ui.evidenceDrawer.sourceTabsAria}>{tabs.map(item => <button key={item} type="button" className="preset" aria-pressed={item === activeTab} onClick={() => { setTab(item); setPage(0); }}>{fill(labels.ui.evidenceDrawer.tabWithCount, { tab: copy.sourceTabs[item], n: counts[item] })}</button>)}</div>
              <label className="source-search">{copy.searchLabel}<input type="search" value={query} placeholder={copy.searchPlaceholder} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
            </div>
            <p className="note" aria-live="polite">{fill(copy.showing, { from: filtered.length === 0 ? 0 : start + 1, to: end, n: filtered.length })}</p>
            {filtered.length === 0 ? <p>{copy.none}</p> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label={labels.ui.evidenceDrawer.sourceTableAria}>
              {/* C3 手機清單：保留 <table>，≤ 767px 以 CSS 重排；明確的 role 讓 display 改變後仍是表格語意，data-label 是每格的欄名。 */}
              <table className="source-table" role="table">
                <caption className="sr-only">{evidence.title} · {copy.sourcesTitle}，{fill(copy.pageOf, { page: currentPage + 1, pages: lastPage + 1 })}</caption>
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">{column.fileLine}</th><th scope="col" role="columnheader">{column.date}</th><th scope="col" role="columnheader">{column.channel}</th><th scope="col" role="columnheader">{column.values}</th></tr></thead>
                <tbody role="rowgroup">
                  {visibleRows.map((row, index) => {
                    const allowedFields: readonly string[] = ["date", "channel", "sku", "category", "currency", ...definition.fields];
                    // V3-5：日期、通路、商品已有自己的欄，欄位與數值不重複列出；匯入時改過欄名（有「原欄位」）的仍列出，原欄位資訊不少。
                    const ownColumn = (field: string) => row.file !== "manifest.json" && OWN_COLUMNS.includes(field) && !(mappings?.[row.file]?.[field] && mappings[row.file]![field] !== field);
                    const values = Object.entries(row.values).filter(([field]) => !ownColumn(field) && (evidence.formula || row.file === "manifest.json" || allowedFields.includes(field)));
                    const file = filenames?.[row.file] ?? row.file;
                    return (
                      <tr key={`${row.file}-${row.line}-${row.date}-${row.channel}-${row.sku}-${start + index}`} role="row">
                        <th scope="row" role="rowheader" data-label={column.fileLine} data-list-role="primary">
                          <span className="evidence-fileline">{row.line === null ? file : fill(v3.fileLine, { file, line: row.line })}</span>
                          {row.line === null && <small>{row.missing ? copy.missingRow : copy.manifestRow}</small>}
                          {filenames?.[row.file] && filenames[row.file] !== row.file && <small>{copy.standardRole}：{row.file}</small>}
                          {row.missing && <span className="tag">{copy.missingTag}</span>}
                        </th>
                        <td role="cell" className="evidence-date" data-label={column.date} data-list-role="secondary">{row.date ?? copy.wholeDataset}</td>
                        <td role="cell" data-label={column.channel} data-list-role="secondary">{row.channel ? channelLabel(row.channel, alias) : copy.allChannels}{row.sku ? <small>{fill(labels.ui.evidenceDrawer.skuLine, { sku: row.sku })}</small> : null}</td>
                        <td role="cell" data-label={column.values} data-list-role="labeled"><dl>{values.map(([field, value]) => <div key={field}><dt>{copy.fields[field] ?? ((AMOUNT_FIELDS as readonly string[]).includes(field) ? metricDefinitions[field as MetricName].label : field)}{mappings?.[row.file]?.[field] && mappings[row.file]![field] !== field && <small>{copy.originalColumn}：{mappings[row.file]![field]}</small>}</dt><dd>{value === null ? copy.missingValue : rawValues?.[row.file as FileName]?.[row.line ?? -1]?.[field] !== undefined ? <span className="converted-value" title={copy.rawToConverted}><s>{sourceValue(field, rawValues[row.file as FileName]![row.line!][field])}</s> → <strong>{sourceValue(field, value)}</strong><span className="sr-only">（{copy.rawToConverted}）</span></span> : sourceValue(field, value)}</dd></div>)}</dl></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>)}
            {lastPage > 0 && <nav aria-label={labels.ui.evidenceDrawer.sourcePagerAria}>
              <button type="button" className="button quiet" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{copy.prev}</button>
              <span>{fill(copy.pageOf, { page: currentPage + 1, pages: lastPage + 1 })}</span>
              <button type="button" className="button quiet" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>{copy.next}</button>
            </nav>}
          </>)}
        </section>
        {evidence.metric.reason_codes.length > 0 && <p className="evidence-limit" role="status">{copy.conditionsNote}</p>}
        <details className="evidence-technical">
          <summary>{labels.sections.technicalDetails}</summary>
          <dl>
            <div><dt>{copy.technicalFormula}</dt><dd><code>{evidence.formulaTechnical ?? definition.formulaTechnical}</code></dd></div>
            {(evidence.unitOverride || definition.unit !== "money") && evidence.metric.value !== null && <div><dt>{copy.exactValue}</dt><dd><code>{evidence.metric.value}</code>{evidence.unitOverride === "percentage-point" ? `（${copy.pointNote}）` : definition.unit === "percent" ? `（${copy.ratioNote}）` : ""}</dd></div>}
            {evidence.metric.reason_codes.length > 0 && <div><dt>{copy.conditions}</dt><dd><ul>{evidence.metric.reason_codes.map((reason) => <li key={reason}><code>{reason}</code></li>)}</ul></dd></div>}
            {evidence.components?.some(component => component.metric.reason_codes.length > 0) && <div><dt>{copy.components}</dt><dd><ul>{evidence.components.filter(component => component.metric.reason_codes.length > 0).map((component, index) => <li key={index}>{component.label}：<code>{component.metric.reason_codes.join("、")}</code></li>)}</ul></dd></div>}
            <div><dt>metric_version</dt><dd><code>{metricVersion}</code></dd></div>
          </dl>
          {(signed || evidence.unitOverride === "percentage-point") && <p className="note" data-testid="evidence-rounding-note">{labels.format.roundingNote}</p>}
        </details>
      </div>
    </dialog>
  );
}
