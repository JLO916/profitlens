"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ASSIST_KPI_VERSION } from "@/application/assist-kpi";
import { categoryLabel, channelLabel, channelsLabel, conversionSentence, demoAlias } from "@/application/copy";
import { downloadText } from "@/application/download";
import { exportProductsCsv } from "@/application/export";
import { exportProductComparisonCsv } from "@/application/product-comparison-export";
import { dataStatus, PRODUCT_HIGHLIGHT_LIMIT, productHighlights, rateAvailability } from "@/application/product-highlights";
import { deltaTone, formatAmountL2, formatCount, formatPeriodL1, formatRateL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { TaxConversion } from "@/application/tax-basis";
import { uniqueSources } from "@/domain/aggregation";
import { compareProducts, selectProductComparisonRows, type ProductComparisonRow, type ProductComparisonSort } from "@/domain/product-comparison";
import type { Dataset, Metric, ProductMetrics, SourceRef } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { toneClass } from "./manager-summary";
import { ShellIcon } from "./shell/shell-icon";

const copy = labels.ui.productComparisonPanel;
const highlight = labels.productHighlights;
const page = labels.products.pageV3;
/** R4：ProductMetrics 多了件數（非金額）；金額／比率欄另列，件數欄單獨處理。 */
type ProductMoneyMetric = Exclude<keyof ProductMetrics, "units_sold">;
/** R5-6（02 §5）：主欄之外的欄位，按「更多欄位」才顯示。 */
const moreCurrentColumns: ProductMoneyMetric[] = ["cogs_net", "discounts", "refunds"];
const morePreviousColumns: ProductMoneyMetric[] = ["cogs_net", "gross_margin", "discounts", "refunds"];
const presenceLabels: Record<ProductComparisonRow["previous"]["presence"], string> = {
  observed: copy.presence.observed, no_rows_confirmed: copy.presence.noRowsConfirmed, unknown_coverage: copy.presence.unknownCoverage,
};
/** 「淨營收差額」「商品毛利差額」：指標名＋差額後綴，與 CSV 標題同源。 */
const changeLabel = (name: ProductMoneyMetric) => `${metricDefinitions[name].label}${labels.csvSuffix.change}`;
/** 「上期淨營收」「本期毛利率」：期間短名＋指標名。 */
const periodMetric = (period: "previous" | "current", label: string) => `${labels.periods[period]}${label}`;
/** V3-2b：表格是 L2（整數元），金額欄的表頭標一次「（元）」，儲存格不帶單位；比率欄維持 %。 */
const withUnit = (name: ProductMoneyMetric, label: string) => metricDefinitions[name].unit === "money" ? fill(labels.units.yuanColumn, { label }) : label;
/** 比率欄的 null 分兩種：缺資料顯示「資料待補」，淨營收 ≤ 0 等顯示「不適用」。 */
const notApplicable = (name: ProductMoneyMetric, metric: Metric) => metricDefinitions[name].unit === "percent" && rateAvailability(metric) === "not_applicable";
function display(name: ProductMoneyMetric, metric: Metric): string {
  return notApplicable(name, metric) ? labels.status.notApplicable : metric.value === null ? labels.status.missing : metricDefinitions[name].unit === "percent" ? formatRateL2(metric.value) : formatAmountL2(metric.value);
}
const unitsText = (metric: Metric) => formatCount(metric.value, "L2");

/**
 * V3-5（PRD §7.3、C15）：排序依據與方向合併成一個 select；值仍對應 ProductComparisonSort × direction（CSV 的 sort／direction 欄不變）。
 * 選項順序與 labels.products.pageV3.sortOptions 相同。
 */
type SortDirection = "ascending" | "descending";
export const PRODUCT_SORT_OPTIONS: readonly { value: string; sort: ProductComparisonSort; direction: SortDirection; label: string }[] = ([
  ["gross_profit_change", "ascending", page.sortOptions.grossProfitChangeAscending], ["gross_profit_change", "descending", page.sortOptions.grossProfitChangeDescending],
  ["current_gross_profit", "ascending", page.sortOptions.currentGrossProfitAscending], ["current_gross_profit", "descending", page.sortOptions.currentGrossProfitDescending],
  ["net_revenue_change", "ascending", page.sortOptions.netRevenueChangeAscending], ["net_revenue_change", "descending", page.sortOptions.netRevenueChangeDescending],
  ["current_net_revenue", "ascending", page.sortOptions.currentNetRevenueAscending], ["current_net_revenue", "descending", page.sortOptions.currentNetRevenueDescending],
  ["sku", "ascending", page.sortOptions.skuAscending],
] as const).map(([sort, direction, label]) => ({ value: `${sort}.${direction}`, sort, direction, label }));

/** F18 表格密度：個人偏好，記在 localStorage（try/catch 包住；私密模式或封鎖時只影響本頁），不寫進備份的 ui_prefs。 */
export type TableDensity = "standard" | "compact";
export const TABLE_DENSITY_KEY = "profitlens.table-density";
function readDensity(): TableDensity {
  try { return typeof window !== "undefined" && window.localStorage.getItem(TABLE_DENSITY_KEY) === "compact" ? "compact" : "standard"; } catch { return "standard"; }
}
function writeDensity(value: TableDensity) {
  try { window.localStorage.setItem(TABLE_DENSITY_KEY, value); } catch { /* 無法保存時只影響本頁 */ }
}

/** C3 手機清單（≤ 767px）：主行（商品＋本期商品毛利）、次行（差額、件數、毛利率）、其餘欄位以 data-label 標名。 */
type ListRole = "primary" | "secondary" | "labeled";

/** 頁首動作插槽（shell/page-chrome.tsx 的 #page-actions）。伺服器端與 hydration 當下回傳 null，選單先渲染在面板內；掛載後改用 portal 放進頁首，同一時間只有一份。 */
const subscribeNever = () => () => undefined;
function usePageActionsSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeNever, () => document.getElementById("page-actions"), () => null);
}

/** C14／M3：彈出層開著時，Esc 關閉（焦點在裡面時回到觸發器）、點外面關閉；在 modal dialog（抽屜、對話框）裡的操作不算外面（同 top-three.tsx）。 */
function useDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const inDialog = (target: EventTarget | null) => target instanceof Element && target.closest("dialog") !== null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || inDialog(event.target)) return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      close();
      if (inside) triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (inDialog(event.target)) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !rootRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [open, close, rootRef, triggerRef]);
}

/** 初始篩選與偏好（預設全部清空、標準列高；測試與日後的深連結用）。之後由工具列改變。 */
export interface ProductPanelInitial { category?: string; query?: string; negativeOnly?: boolean; moreColumns?: boolean; density?: TableDensity }

/** Product-only comparison. Filters remain local to this panel and never change channel contribution. */
export function ProductComparisonPanel({ dataset, snapshot, onEvidence, filenames, conversion = null, allChannels, initial }: {
  dataset: Dataset;
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  /** R3：含稅換算摘要，寫進商品明細 CSV 的口徑限制欄。 */
  conversion?: TaxConversion | null;
  /** V3-5：資料集的全部通路（判斷範圍副標寫「全部通路」）；沒傳時用 dataset.manifest.channels。 */
  allChannels?: readonly string[];
  initial?: ProductPanelInitial;
}) {
  const [category, setCategory] = useState(initial?.category ?? "");
  const [query, setQuery] = useState(initial?.query ?? "");
  const [negativeOnly, setNegativeOnly] = useState(initial?.negativeOnly ?? false);
  const [sort, setSort] = useState<ProductComparisonSort>("gross_profit_change");
  const [direction, setDirection] = useState<SortDirection>("ascending");
  const [moreColumns, setMoreColumns] = useState(initial?.moreColumns ?? false);
  // 商品頁只在資料載入後（client）掛上，不經過 hydration；伺服器端渲染時 window 不存在，讀到「標準」。
  const [density, setDensity] = useState<TableDensity>(() => initial?.density ?? readDensity());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDetailsElement>(null);
  const columnsSummaryRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeColumns = useCallback(() => { if (columnsRef.current) columnsRef.current.open = false; setColumnsOpen(false); }, []);
  useDismiss(columnsOpen, closeColumns, columnsRef, columnsSummaryRef);
  const slot = usePageActionsSlot();
  const idBase = useId();
  const ids = { comparisonHint: `${idBase}-comparison-hint`, productsHint: `${idBase}-products-hint`, moreHint: `${idBase}-more-hint`, density: `${idBase}-density` };

  const alias = demoAlias(dataset.manifest.dataset_id);
  const comparison = useMemo(() => compareProducts(dataset, snapshot.report.scope), [dataset, snapshot.report.scope]);
  /** 兩張小表看整個分析範圍（期間＋通路），不跟著下方品類／搜尋篩選變動。 */
  const { worstCurrent, bestChange } = useMemo(() => productHighlights(comparison.rows), [comparison.rows]);
  const categories = [...new Set(comparison.rows.map(row => row.category).filter(value => value.trim()))].sort();
  const activeCategory = categories.includes(category) ? category : "";
  const selection = { category: activeCategory, query, negativeOnly, sort, direction };
  const rows = selectProductComparisonRows(comparison.rows, selection);
  const unavailable = comparison.rows.filter(row => row.changes.gross_profit.value === null).length;
  const filtered = activeCategory !== "" || query.trim() !== "" || negativeOnly;
  const { previous_period: previous, current_period: current, channels } = comparison.scope;
  const categoryText = (value: string) => value ? categoryLabel(value, alias) : copy.blankCategoryShort;
  /** 範圍副標：目前範圍涵蓋資料集全部通路時寫「全部通路」（同 overview/weekly-snapshot.tsx 的 snapshotMeta）。 */
  const everyChannel = (allChannels ?? dataset.manifest.channels).length > 0 && (allChannels ?? dataset.manifest.channels).every(channel => channels.includes(channel));
  const scopeText = fill(page.scope, {
    current: formatPeriodL1(current.start, current.end, { days: false, anchor: snapshot.data_as_of }),
    previous: formatPeriodL1(previous.start, previous.end, { days: false, anchor: snapshot.data_as_of }),
    channels: everyChannel ? labels.shell.periodBar.filter.allChannels : channelsLabel(channels, alias),
  });
  const converted = conversionSentence(conversion);
  const sortValue = PRODUCT_SORT_OPTIONS.some(option => option.sort === sort && option.direction === direction) ? `${sort}.${direction}` : PRODUCT_SORT_OPTIONS[0].value;

  const chooseSort = (value: string) => {
    const option = PRODUCT_SORT_OPTIONS.find(item => item.value === value);
    if (!option) return;
    setSort(option.sort); setDirection(option.direction);
  };
  const chooseDensity = (value: TableDensity) => { setDensity(value); writeDensity(value); };
  const clearFilters = () => { setCategory(""); setQuery(""); setNegativeOnly(false); searchRef.current?.focus(); };

  /** 金額／比率格的 number-link（抽屜 payload 與可及名稱同 v2）。 */
  const metricLink = (row: ProductComparisonRow, period: "previous" | "current", name: ProductMoneyMetric, label: string) => {
    const value = row[period];
    const metric = value.metrics[name];
    const periodLabel = labels.periods[period];
    return <><button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={fill(copy.evidenceAria, { channel: channelLabel(row.channel, alias), sku: row.sku, period: period === "previous" ? labels.periods.previous : "", label, value: display(name, metric) })}
      onClick={() => onEvidence({ sku: row.sku, title: fill(copy.evidenceTitle, { sku: row.sku, period: periodLabel, label }), name, metric, period: period === "previous" ? previous : current, channels: [row.channel], sources: value.sources, scopeLabel: fill(copy.scopeLabel, { sku: row.sku, category: categoryText(row.category), presence: presenceLabels[value.presence] }) })}>
      {display(name, metric)}</button>{metric.value === null && !notApplicable(name, metric) && <small className="note">{metric.reason_codes.includes("MISSING_COGS") ? copy.costMissing : copy.notComputable}</small>}</>;
  };
  /** 件數不是金額：抽屜以 unitOverride="count" 顯示「n 件」，版本標 assist-kpi-v1（同總覽輔助指標卡）。 */
  const unitsLink = (row: ProductComparisonRow, period: "previous" | "current") => {
    const value = row[period];
    const metric = value.metrics.units_sold;
    const label = labels.assist.items.units_sold.label;
    return <button type="button" className="number-link" title={metric.reason_codes.join("、") || undefined}
      aria-label={fill(copy.evidenceAria, { channel: channelLabel(row.channel, alias), sku: row.sku, period: period === "previous" ? labels.periods.previous : "", label, value: unitsText(metric) })}
      onClick={() => onEvidence({ sku: row.sku, title: fill(copy.evidenceTitle, { sku: row.sku, period: labels.periods[period], label }), name: "net_revenue", unitOverride: "count", metric, period: period === "previous" ? previous : current, channels: [row.channel], sources: value.sources, formula: labels.assist.items.units_sold.formula, formulaTechnical: labels.assist.items.units_sold.formulaTechnical, metricVersion: ASSIST_KPI_VERSION, scopeLabel: fill(copy.scopeLabel, { sku: row.sku, category: categoryText(row.category), presence: presenceLabels[value.presence] }) })}>
      {unitsText(metric)}</button>;
  };
  const deltaLink = (row: ProductComparisonRow, name: "net_revenue" | "gross_profit") => {
    const metric = row.changes[name];
    const label = changeLabel(name);
    const value = formatSignedDelta(metric.value, "L2");
    const tone = toneClass(deltaTone(name, metric.value, "L2"));
    return <><button type="button" className={tone === "neutral" ? "number-link" : `number-link ${tone}`} title={metric.reason_codes.join("、") || undefined}
      aria-label={fill(copy.deltaEvidenceAria, { channel: channelLabel(row.channel, alias), sku: row.sku, label, value })}
      onClick={() => onEvidence({ sku: row.sku, title: fill(copy.deltaEvidenceTitle, { sku: row.sku, label }), name, metric, period: { start: previous.start, end: current.end }, channels: [row.channel],
        sources: uniqueSources([...row.previous.sources, ...row.current.sources]),
        scopeLabel: fill(copy.deltaScopeLabel, { sku: row.sku, category: categoryText(row.category), previousStart: previous.start, previousEnd: previous.end, previousPresence: presenceLabels[row.previous.presence], currentStart: current.start, currentEnd: current.end, currentPresence: presenceLabels[row.current.presence] }),
        formula: fill(copy.deltaFormula, { label, metric: metricDefinitions[name].label, formula: metricDefinitions[name].formula }),
        components: [{ label: fill(copy.periodRange, { period: labels.periods.previous, start: previous.start, end: previous.end }), metric: row.previous.metrics[name] }, { label: fill(copy.periodRange, { period: labels.periods.current, start: current.start, end: current.end }), metric: row.current.metrics[name] }],
      })}>{value}</button>{metric.value === null && <small className="note">{copy.deltaMissing}</small>}</>;
  };

  /** C3 欄位：表頭文字同時是手機清單的 data-label；num 欄（金額、比率、件數）右對齊、tabular。 */
  type Column = { key: string; header: string; num: boolean; listRole: ListRole; className?: string; render: (row: ProductComparisonRow, index: number) => ReactNode };
  const cellClass = (column: Column) => [column.num ? "num" : "", column.className ?? ""].filter(Boolean).join(" ") || undefined;
  const headCell = (column: Column) => <th scope="col" role="columnheader" key={column.key} className={cellClass(column)}>{column.header}</th>;
  const bodyCell = (column: Column, row: ProductComparisonRow, index: number) => <td role="cell" key={column.key} className={cellClass(column)} data-label={column.header} data-list-role={column.listRole}>{column.render(row, index)}</td>;
  /** 列標頭（商品／SKU）：scope=row＋明確 role=rowheader，手機清單改 display 後語意不變。 */
  const rowHeaderCell = (column: Column, row: ProductComparisonRow, index: number) => <th scope="row" role="rowheader" key={column.key} data-label={column.header} data-list-role={column.listRole}>{column.render(row, index)}</th>;

  /** 前 10 名兩表（C3，列高跟著本頁密度）：排名｜商品（SKU · 通路，通路 12px 次要色）｜本期商品毛利（元）｜差額（元）。 */
  const rankColumns: Column[] = [
    { key: "rank", header: page.columns.rank, num: false, listRole: "secondary", className: "rank", render: (_row, index) => formatCount(index + 1, "L2") },
    { key: "product", header: page.columns.product, num: false, listRole: "primary", render: row => <>{row.sku}<span className="product-channel"><span aria-hidden="true"> · </span>{channelLabel(row.channel, alias)}</span></> },
    { key: "current-gross_profit", header: withUnit("gross_profit", periodMetric("current", metricDefinitions.gross_profit.shortLabel)), num: true, listRole: "primary", render: row => metricLink(row, "current", "gross_profit", metricDefinitions.gross_profit.shortLabel) },
    { key: "change-gross_profit", header: withUnit("gross_profit", page.columns.change), num: true, listRole: "secondary", render: row => deltaLink(row, "gross_profit") },
  ];
  const highlightTable = (kind: "worst" | "best", list: ProductComparisonRow[]) => {
    const worst = kind === "worst";
    return <section className="product-highlight" aria-labelledby={`product-${kind}-heading`} data-testid={`product-${kind}`}>
      <h4 id={`product-${kind}-heading`}>{fill(worst ? highlight.worstTitle : highlight.bestTitle, { n: PRODUCT_HIGHLIGHT_LIMIT })}</h4>
      <p className="note">{worst ? highlight.worstNote : highlight.bestNote}</p>
      {list.length === 0 ? <p className="note product-highlight-empty">{worst ? highlight.worstEmpty : highlight.bestEmpty}</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label={worst ? highlight.worstAria : highlight.bestAria}><table className="table ui-table product-list product-rank-table" role="table">
        <caption className="sr-only">{worst ? page.worstCaption : page.bestCaption}</caption>
        <thead role="rowgroup"><tr role="row">{rankColumns.map(headCell)}</tr></thead>
        <tbody role="rowgroup">{list.map((row, index) => <tr role="row" key={JSON.stringify([row.channel, row.sku])}>{rankColumns.map(column => column.key === "product" ? rowHeaderCell(column, row, index) : bodyCell(column, row, index))}</tr>)}</tbody>
      </table></div>}
    </section>;
  };

  /** 完整表：欄序同 v2（通路｜SKU｜品類｜本期件數｜本期淨營收｜本期商品毛利｜本期毛利率｜商品毛利差額｜淨營收差額｜上期淨營收｜上期商品毛利｜資料狀態），「更多欄位」接在後面。 */
  const fullColumns: Column[] = [
    { key: "channel", header: labels.csvColumns.channel, num: false, listRole: "primary", render: row => channelLabel(row.channel, alias) },
    { key: "sku", header: "SKU", num: false, listRole: "primary", render: row => row.sku },
    { key: "category", header: labels.csvColumns.category, num: false, listRole: "labeled", render: row => row.category.trim() ? categoryLabel(row.category, alias) : copy.blankCategory },
    { key: "current-units_sold", header: periodMetric("current", labels.assist.items.units_sold.label), num: true, listRole: "secondary", render: row => unitsLink(row, "current") },
    ...(["net_revenue", "gross_profit", "gross_margin"] as const).map((name): Column => ({ key: `current-${name}`, header: withUnit(name, periodMetric("current", metricDefinitions[name].shortLabel)), num: true, listRole: name === "gross_profit" ? "primary" : name === "gross_margin" ? "secondary" : "labeled", render: row => metricLink(row, "current", name, metricDefinitions[name].shortLabel) })),
    { key: "change-gross_profit", header: withUnit("gross_profit", changeLabel("gross_profit")), num: true, listRole: "secondary", className: "list-lead", render: row => deltaLink(row, "gross_profit") },
    { key: "change-net_revenue", header: withUnit("net_revenue", changeLabel("net_revenue")), num: true, listRole: "labeled", render: row => deltaLink(row, "net_revenue") },
    { key: "previous-net_revenue", header: withUnit("net_revenue", periodMetric("previous", metricDefinitions.net_revenue.label)), num: true, listRole: "labeled", render: row => metricLink(row, "previous", "net_revenue", metricDefinitions.net_revenue.label) },
    { key: "previous-gross_profit", header: withUnit("gross_profit", periodMetric("previous", metricDefinitions.gross_profit.label)), num: true, listRole: "labeled", render: row => metricLink(row, "previous", "gross_profit", metricDefinitions.gross_profit.label) },
    { key: "status", header: highlight.columns.dataStatus, num: false, listRole: "labeled", render: row => { const status = dataStatus(row); return <span className={`product-status ${status}`}>{highlight.status[status]}</span>; } },
    ...(moreColumns ? [
      ...moreCurrentColumns.map((name): Column => ({ key: `current-${name}`, header: withUnit(name, periodMetric("current", metricDefinitions[name].shortLabel)), num: true, listRole: "labeled", render: row => metricLink(row, "current", name, metricDefinitions[name].shortLabel) })),
      { key: "previous-units_sold", header: periodMetric("previous", labels.assist.items.units_sold.label), num: true, listRole: "labeled", render: (row: ProductComparisonRow) => unitsLink(row, "previous") } satisfies Column,
      ...morePreviousColumns.map((name): Column => ({ key: `previous-${name}`, header: withUnit(name, periodMetric("previous", metricDefinitions[name].shortLabel)), num: true, listRole: "labeled", render: row => metricLink(row, "previous", name, metricDefinitions[name].shortLabel) })),
    ] : []),
  ];

  /** 頁首「匯出本頁」頁內下拉（PRD §7.3 第 1 點、§6.3 #16）：handler、檔名與 CSV 內容同 v2；Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`。 */
  const exportMenu = <details className="topbar-menu auto-close export-page" data-testid="product-export-menu">
    <summary className="ui-btn ui-btn-secondary" data-testid="export-page-products">{page.exportPage}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
    <div className="menu-panel ui-menu">
      <div className="menu-item"><button type="button" className="ui-menu-item" data-testid="product-export-comparison" aria-describedby={ids.comparisonHint} onClick={() => downloadText(exportProductComparisonCsv(dataset, snapshot, rows, selection, filenames), "profitlens-product-comparison.csv")}>{copy.downloadComparisonCsv}</button><small id={ids.comparisonHint}>{page.exportComparisonHint}</small></div>
      <div className="menu-item"><button type="button" className="ui-menu-item" data-testid="product-export-products" aria-describedby={ids.productsHint} onClick={() => downloadText(exportProductsCsv(dataset, snapshot, rows.map(row => ({ channel: row.channel, sku: row.sku, category: row.category, metrics: row.current.metrics, sources: row.current.sources })), { category: activeCategory, query: query.trim().toLowerCase() }, filenames, conversion), "profitlens-products.csv")}>{copy.downloadProductsCsv}</button><small id={ids.productsHint}>{page.exportProductsHint}{converted && <> {fill(page.exportConverted, { summary: converted })}</>}</small></div>
    </div>
  </details>;

  return <section className="product-page" aria-labelledby="products-heading" data-density={density}>
    <h2 id="products-heading" className="sr-only">{labels.sections.productTable}</h2>
    <p className="product-scope" data-testid="product-scope">{scopeText}</p>
    {slot ? createPortal(exportMenu, slot) : <div className="product-export-inline">{exportMenu}</div>}
    <section className="product-highlights" aria-labelledby="product-highlights-heading"><h3 id="product-highlights-heading">{labels.sections.productTopBottom}</h3><div className="product-highlight-grid">{highlightTable("worst", worstCurrent)}{highlightTable("best", bestChange)}</div></section>
    <section className="product-full" aria-labelledby="product-full-heading">
      <h3 className="product-full-heading" id="product-full-heading">{highlight.fullTable}</h3>
      <div className="ui-toolbar product-toolbar" data-testid="product-toolbar">
        <select className="ui-field-control" aria-label={labels.csvColumns.category} id="product-category" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">{copy.allCategories}</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value, alias)}</option>)}</select>
        <input ref={searchRef} className="ui-field-control" aria-label={copy.searchSku} id="product-search" type="search" placeholder={copy.searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} />
        <select className="ui-field-control" aria-label={page.sortLabel} id="product-sort" value={sortValue} onChange={event => chooseSort(event.target.value)}>{PRODUCT_SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button type="button" className="ui-btn ui-btn-secondary product-toggle" aria-pressed={negativeOnly} onClick={() => setNegativeOnly(value => !value)}>{copy.negativeOnly}</button>
        <details ref={columnsRef} className="ui-popover-host product-columns" onToggle={event => setColumnsOpen(event.currentTarget.open)}>
          <summary ref={columnsSummaryRef} className="ui-btn ui-btn-secondary">{page.columnsMenu}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
          <div className="ui-popover product-columns-panel">
            <button type="button" className="ui-btn ui-btn-secondary product-toggle" aria-pressed={moreColumns} data-testid="product-more-columns" aria-describedby={ids.moreHint} onClick={() => setMoreColumns(value => !value)}>{highlight.moreColumns}</button>
            <p id={ids.moreHint} className="product-columns-hint">{highlight.moreColumnsHint}</p>
            <fieldset className="product-density" data-testid="product-density"><legend id={ids.density}>{page.densityLegend}</legend>
              {(["standard", "compact"] as const).map(value => <label key={value}><input type="radio" className="ui-check" name={ids.density} value={value} checked={density === value} onChange={() => chooseDensity(value)} />{value === "standard" ? page.densityStandard : page.densityCompact}</label>)}
            </fieldset>
          </div>
        </details>
        <p className="ui-toolbar-end product-count" aria-live="polite" data-testid="product-count">{fill(page.showing, { n: formatCount(rows.length, "L2"), total: formatCount(comparison.rows.length, "L2") })}</p>
      </div>
      {rows.length === 0 ? <div className="ui-empty-block product-empty" data-testid="product-empty"><p>{labels.products.panel.noProducts}</p>{filtered && <button type="button" className="ui-btn ui-btn-secondary" data-testid="product-clear-filters" onClick={clearFilters}>{page.clearFilters}</button>}</div> : <div className="table-scroll product-table-scroll" tabIndex={0} role="region" aria-label={copy.tableAria}><table className="table ui-table product-list" data-testid="product-table" role="table">
        <caption className="sr-only">{copy.tableCaption}</caption>
        <thead role="rowgroup"><tr role="row">{fullColumns.map(headCell)}</tr></thead>
        <tbody role="rowgroup">{rows.map(row => <tr role="row" key={JSON.stringify([row.channel, row.sku])}>{fullColumns.map(column => column.key === "sku" ? rowHeaderCell(column, row, 0) : bodyCell(column, row, 0))}</tr>)}</tbody>
      </table></div>}
      <details className="product-technical"><summary>{labels.sections.technicalDetails}</summary><p className="note">{copy.deltaFormulaNote}</p><p className="note">{fill(copy.negativeNote, { n: unavailable })}</p></details>
    </section>
  </section>;
}
