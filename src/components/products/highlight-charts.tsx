"use client";

import type { ReactNode } from "react";
import { track } from "@/application/analytics";
import { PRODUCT_PARETO_VERSION, productParetoLead, type ProductPareto, type ProductParetoEntry } from "@/application/chart-pareto";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, formatHeadlineAmount } from "@/application/copy";
import type { NameResolver } from "@/application/channel-settings";
import { deltaTone, formatAmountL1, formatCount, formatRateL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { ProductComparisonRow } from "@/domain/product-comparison";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { RankedBars, type RankedBarBlock, type RankedBarRow, type RankedBarTone } from "../charts/ranked-bars";
import type { EvidenceSelection } from "../evidence-drawer";
import { ChartFrame, type ChartLegendItem } from "../overview/charts/chart-frame";
import { productDeltaEvidence, productEvidence, productParetoCumulativeEvidence, productParetoShareEvidence, type ProductEvidenceContext } from "../product-evidence";

// V4-4 代理 C：商品頁 .product-highlight-grid 的兩張圖（PRD §4.1–§4.7 G13、G14、§5.3 第 2 列；CHART_CATALOG §5 商品頁、G13、G14；D-V4-32＝A、D-V4-38＝A、D-V4-39＝A；
// H5 設計稿 verification/revamp-v4/mockups/products.html、products-synthetic.html 建議版）。
// - G14「商品毛利為負的商品累計」：第一格，只在 productPareto(...).count > 0 時渲染（呼叫端判斷）；after＝既有 product-worst 表（DOM 與 testid 不變）。
//   C25 pareto：前 10 個柱（從 0 往左，不利色）＋右側「累計 {pct}」（≤ 767px 以 CSS 隱藏），其餘一列「另 {n} 個」，不畫「其他」柱（X38）。
//   資料表列出全部商品毛利為負的列（allRows）：商品毛利、累計、累計佔比三格都是 number-link（D-V4-32＝A）。
// - G13「商品毛利兩期差額」：第二格；after＝既有 product-best 表。C25 variance 兩段（減少在上、增加在下，各 ≤ 5 根，共用一把尺、各自從 0；段名用 legend）。
//   資料表列出全部差額 < 0（由小到大）再接全部差額 > 0（由大到小）的列：上期、本期、差額三格；差額 0 與待補不列（只挑列，不產生新數字）。
// 點柱與資料表同列的 number-link 呼叫同一個 builder（src/components/product-evidence.ts）；點柱另記 chart_clicked（D-V4-14），資料表展開由 ChartFrame 記 chart_table_opened。
// 審查修正：兩張資料表的 evidence 在點擊時才組（C33 hasEvidence；G14 的累計、累計佔比格整表預先組是 O(n²)，搜尋框每打一字都會重組）；
// 不利的金額格上不利色（C33 unfavorable，同 H5 設計稿）；G13 圖例只列有畫出來的段。
// ChartFrame 帶明確 testId（chart-products-pareto、chart-products-variance）與 id products-pareto、products-variance（標題 id 不和 V4-5 試算頁的圖撞名），標題層級 h4（在 h3#product-highlights-heading 之下）。
// 使用者看得到的字一律取 labels.products.chartsV4.*；指標名取 metricDefinitions。色只經 chartColors；圖高 sm（固定高由 ChartFrame 負責）。
// 兩個區塊元件沒有 hook（模型由呼叫端以 useMemo 保存），單元測試可以直接呼叫取得元素樹，比對柱與資料表格的 evidence。
// ready（呼叫端的 useDeferredMount，src/components/charts/deferred-mount.ts；390「切到商品毛利」的 TBT）：false 時圖區是同高的 loading 骨架、資料表 <details> 只留 summary，
// 下一個 animation frame 以 transition 補上柱與表格內容；after 的前 10 名表不延後（鍵盤里程碑 product-worst 的位置不變）。SSR 與單元測試沒有 window，一律是 true。

const copy = labels.products.chartsV4;
const comparison = labels.products.comparison;
const METRIC = metricDefinitions.gross_profit.label;
const SHORT = metricDefinitions.gross_profit.shortLabel;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });
const periodMetric = (period: "previous" | "current") => `${labels.shell.periods[period]}${SHORT}`;

export const PRODUCTS_PARETO_TESTID = "chart-products-pareto";
export const PRODUCTS_PARETO_BAR_PREFIX = "chart-products-pareto-bar-";
export const PRODUCTS_PARETO_TABLE_TESTID = "chart-products-pareto-table";
export const PRODUCTS_VARIANCE_TESTID = "chart-products-variance";
export const PRODUCTS_VARIANCE_BAR_PREFIX = "chart-products-variance-bar-";
export const PRODUCTS_VARIANCE_TABLE_TESTID = "chart-products-variance-table";
/** G13 每段（減少、增加）最多畫幾根（PRD §4.4：每欄 ≤ 5；上下兩段 10 × row16＝160 ≤ sm 180）。其餘列在 after 的 product-best 表、資料表與完整表。 */
export const PRODUCT_VARIANCE_BLOCK_ROWS = 5;

/** 柱與資料表的 testid 語意 key：{channel}-{sku}（不用陣列索引，CL-2）。 */
export const productChartKey = (row: Pick<ProductComparisonRow, "channel" | "sku">) => `${row.channel}-${row.sku}`;
/** 「SKU · 通路」（示範資料用通路 alias）。 */
export const productChartLabel = (row: Pick<ProductComparisonRow, "channel" | "sku">, resolver: NameResolver) => fill(copy.product, { sku: row.sku, channel: channelLabel(row.channel, resolver) });

/** 兩張圖共用的頁面範圍：抽屜 builder 的 ctx，以及副標用的兩期起訖（M/D–M/D）與通路範圍字（同 product-scope 那一行）。 */
export interface ProductChartScope {
  ctx: ProductEvidenceContext;
  current: string;
  previous: string;
  channels: string;
}

/** 延後渲染時的資料表：summary 照常（同 chartDataTable 的「表格 · {title}」），內容下一拍才補上。 */
const deferredTable = (title: string) => ({ summary: fill(labels.overview.page.dataTable, { title }), content: null });

// ── G14 商品毛利為負的商品累計 ──

export interface ParetoSectionModel {
  title: string;
  subtitle: string;
  section: string;
  /** 圖上的柱（前 limit 個）。 */
  bars: RankedBarRow<EvidenceSelection>[];
  /** 「另 {n} 個」；沒有其餘列時 undefined。 */
  more: string | undefined;
}

/**
 * G14 柱的抽屜：與資料表商品毛利格同一個 builder（本期商品毛利，加 filter { channel, sku }）。
 * 值直接取自 domain（metric_version 維持 contribution-v1），只經 productPareto 挑出（為負）與排序，所以另帶 arrangeVersion product-pareto-v1（PRD §8.7、C7；CHART_CATALOG §1.2）。
 */
export const paretoBarEvidence = (entry: ProductParetoEntry, ctx: ProductEvidenceContext): EvidenceSelection => ({ ...productEvidence(entry.row, "current", "gross_profit", SHORT, ctx, { drill: true }), arrangeVersion: PRODUCT_PARETO_VERSION });
/** G14 累計格的抽屜（product-pareto-v1，水準值）：index 是 allRows 的 0 起算位置。 */
export function paretoCumulativeEvidence(pareto: ProductPareto, index: number, ctx: ProductEvidenceContext): EvidenceSelection {
  const n = index + 1;
  return productParetoCumulativeEvidence(pareto, index, ctx, {
    title: fill(copy.pareto.drawer.cumulativeTitle, { n, metric: METRIC }),
    formula: fill(copy.pareto.drawer.cumulativeFormula, { n, metric: METRIC }),
    definition: fill(copy.pareto.drawer.cumulativeDefinition, { n, metric: METRIC }),
    formulaTechnical: copy.pareto.drawer.cumulativeFormulaTechnical,
    componentLabel: row => productChartLabel(row, ctx.resolver),
  });
}
/** G14 累計佔比格的抽屜（D-V4-32＝A：unitOverride percent；組成是分子、分母兩個為負額合計）。 */
export function paretoShareEvidence(pareto: ProductPareto, index: number, ctx: ProductEvidenceContext): EvidenceSelection {
  const n = index + 1;
  const numerator = fill(copy.pareto.drawer.numerator, { n, metric: METRIC });
  const denominator = fill(copy.pareto.drawer.denominator, { metric: METRIC });
  return productParetoShareEvidence(pareto, index, ctx, {
    title: fill(copy.pareto.drawer.shareTitle, { n, metric: METRIC }),
    formula: fill(copy.pareto.drawer.shareFormula, { numerator, denominator }),
    definition: fill(copy.pareto.drawer.shareDefinition, { n, metric: METRIC }),
    formulaTechnical: copy.pareto.drawer.shareFormulaTechnical,
    numeratorLabel: numerator,
    denominatorLabel: denominator,
  });
}

/** G14 的標題、副標與柱（純函式；沒有負值時呼叫端不渲染，這裡仍回傳空柱）。 */
export function paretoSectionModel(pareto: ProductPareto, scope: ProductChartScope): ParetoSectionModel {
  const section = fill(copy.pareto.section, { metric: METRIC });
  const lead = productParetoLead(pareto);
  const title = lead === null ? section : fill(copy.pareto.title, { n: formatCount(pareto.count, "L2"), metric: METRIC, k: formatCount(lead.k, "L2"), pct: formatRateL1(lead.entry.share.value) });
  const bars = pareto.rows.map((entry): RankedBarRow<EvidenceSelection> => ({
    key: productChartKey(entry.row), label: productChartLabel(entry.row, scope.ctx.resolver), value: entry.value.value, tone: "unfavorable",
    display: formatAmountL1(entry.value.value), evidence: paretoBarEvidence(entry, scope.ctx),
    extra: fill(copy.pareto.cumulative, { pct: formatRateL1(entry.share.value) }),
  }));
  return {
    title, section, bars,
    subtitle: fill(copy.pareto.subtitle, { section, period: scope.current, scope: scope.channels }),
    more: pareto.more > 0 ? fill(copy.pareto.more, { n: formatCount(pareto.more, "L2") }) : undefined,
  };
}

type ParetoRow = { entry: ProductParetoEntry; index: number };
type ParetoColumn = "gross_profit" | "cumulative" | "share";
/** G14 資料表欄（CHART_CATALOG G14）：本期商品毛利（元）、累計（元）、累計佔比。 */
export const PARETO_TABLE_COLUMNS: readonly ChartDataColumn<ParetoColumn>[] = [
  { key: "gross_profit", label: yuanColumn(periodMetric("current")), unit: "money", layer: "L2", data: "gross_profit" },
  { key: "cumulative", label: yuanColumn(copy.pareto.columns.cumulative), unit: "money", layer: "L2", data: "cumulative" },
  { key: "share", label: copy.pareto.columns.share, unit: "rate", layer: "L2", data: "share" },
];
const paretoMetric = (entry: ProductParetoEntry, column: ParetoColumn) => column === "gross_profit" ? entry.value : column === "cumulative" ? entry.cumulative : entry.share;
/** 不利色（H5 設計稿 products-synthetic.html：商品毛利與累計格為負時 number-link negative；累計佔比不上色）。 */
const unfavorableMoney = (value: string | null) => deltaTone("gross_profit", value, "L2") === "unfavorable";
/** 資料表每格都是 number-link；evidence 在點擊時才組（C33 hasEvidence：累計、累計佔比格各要彙整前 i 列或全部列的來源，整表預先組是 O(n²)）。 */
const everyCellLinked = () => true;

export interface ProductParetoSectionProps {
  pareto: ProductPareto;
  /** paretoSectionModel(pareto, scope)（呼叫端以 useMemo 保存，柱的陣列不會每次渲染都換新）。 */
  model: ParetoSectionModel;
  scope: ProductChartScope;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** 既有 product-worst 表（ChartFrame after 常駐）。 */
  after: ReactNode;
  /** false 時圖區先顯示同高的 loading 骨架、資料表內容延後（預設 true）。 */
  ready?: boolean;
}

/** 商品頁 G14：ChartFrame（id products-pareto、testid chart-products-pareto、h4）＋C25 pareto＋C33 資料表；after＝product-worst。 */
export function ProductParetoSection({ pareto, model, scope, onEvidence, after, ready = true }: ProductParetoSectionProps) {
  const rows = pareto.allRows.map((entry, index): ParetoRow => ({ entry, index }));
  const onBar = (evidence: EvidenceSelection) => { track("chart_clicked"); onEvidence(evidence); };
  const { ctx } = scope;
  const dataTable = !ready ? deferredTable(model.section) : chartDataTable<ParetoRow, ParetoColumn>({
    title: model.section,
    testId: PRODUCTS_PARETO_TABLE_TESTID,
    caption: yuanColumn(model.section),
    rowHeaderLabel: labels.products.pageV3.columns.product,
    rows,
    rowKey: row => productChartKey(row.entry.row),
    rowHeader: row => ({ label: productChartLabel(row.entry.row, ctx.resolver) }),
    columns: PARETO_TABLE_COLUMNS,
    valueOf: (row, column): ChartDataCell => { const metric = paretoMetric(row.entry, column.data); return { value: metric.value, reasonCodes: metric.reason_codes, unfavorable: column.data !== "share" && unfavorableMoney(metric.value) }; },
    evidenceOf: (row, column) => column.data === "gross_profit" ? paretoBarEvidence(row.entry, ctx) : column.data === "cumulative" ? paretoCumulativeEvidence(pareto, row.index, ctx) : paretoShareEvidence(pareto, row.index, ctx),
    hasEvidence: everyCellLinked,
    onEvidence,
    cellAria: (row, column, text) => column.data === "gross_profit"
      ? fill(comparison.evidenceAria, { channel: channelLabel(row.entry.row.channel, ctx.resolver), sku: row.entry.row.sku, period: "", label: SHORT, value: text })
      : fill(copy.pareto.cellAria[column.data], { n: formatCount(row.index + 1, "L2"), metric: METRIC, value: text }),
    notes: [fill(copy.pareto.tableNote, { metric: METRIC })],
    className: "products-pareto-table",
  });
  return <ChartFrame id="products-pareto" page="products" testId={PRODUCTS_PARETO_TESTID} headingLevel={4} className="products-pareto" title={model.title} subtitle={model.subtitle} height="sm" state={ready ? undefined : "loading"} after={after} dataTable={dataTable}>
    {ready ? <RankedBars mode="pareto" rows={model.bars} more={model.more} hideExtraOnNarrow testIdPrefix={PRODUCTS_PARETO_BAR_PREFIX} onBarClick={onBar} /> : null}
  </ChartFrame>;
}

// ── G13 商品毛利兩期差額 ──

export interface VarianceSectionModel {
  title: string;
  titleKind: "decrease" | "increase" | "none";
  subtitle: string;
  section: string;
  /** 上下兩段（減少在上、增加在下）；沒有列的段不放。 */
  blocks: RankedBarBlock<EvidenceSelection>[];
  /** 資料表的列：全部減少（由小到大）接全部增加（由大到小）。 */
  tableRows: ProductComparisonRow[];
}

/** G13 柱與資料表差額格的抽屜：productDeltaEvidence（商品毛利差額，加 filter { channel, sku }）。 */
export const varianceBarEvidence = (row: ProductComparisonRow, ctx: ProductEvidenceContext) => productDeltaEvidence(row, "gross_profit", ctx, { drill: true });
const toneOf = (row: ProductComparisonRow): RankedBarTone => {
  const tone = deltaTone("gross_profit", row.changes.gross_profit.value);
  return tone === "neutral" ? "total" : tone;
};

/**
 * G13 的標題、副標、兩段柱與資料表列（純函式）。decrease／increase 是 productHighlights 的 worstChange／bestChange（只挑列）：
 * 柱只取各自前 PRODUCT_VARIANCE_BLOCK_ROWS 列；資料表要全部時，呼叫端傳 productHighlights(rows, rows.length) 的結果（allDecrease、allIncrease）。
 */
export function varianceSectionModel(lists: { decrease: readonly ProductComparisonRow[]; increase: readonly ProductComparisonRow[]; allDecrease: readonly ProductComparisonRow[]; allIncrease: readonly ProductComparisonRow[] }, scope: ProductChartScope): VarianceSectionModel {
  const section = fill(copy.variance.section, { metric: METRIC });
  const { ctx } = scope;
  const bar = (row: ProductComparisonRow): RankedBarRow<EvidenceSelection> => ({
    key: productChartKey(row), label: productChartLabel(row, ctx.resolver), value: row.changes.gross_profit.value, tone: toneOf(row),
    display: formatSignedDelta(row.changes.gross_profit.value, "L1"), evidence: varianceBarEvidence(row, ctx),
  });
  const blocks: RankedBarBlock<EvidenceSelection>[] = [
    { key: "decrease", rows: lists.decrease.slice(0, PRODUCT_VARIANCE_BLOCK_ROWS).map(bar) },
    { key: "increase", rows: lists.increase.slice(0, PRODUCT_VARIANCE_BLOCK_ROWS).map(bar) },
  ].filter(block => block.rows.length > 0);
  const lead = lists.decrease[0] ?? lists.increase[0] ?? null;
  const titleKind: VarianceSectionModel["titleKind"] = lists.decrease.length ? "decrease" : lists.increase.length ? "increase" : "none";
  const title = lead === null ? fill(copy.variance.title.none, { metric: METRIC })
    : fill(copy.variance.title[titleKind as "decrease" | "increase"], { product: productChartLabel(lead, ctx.resolver), metric: METRIC, amount: formatHeadlineAmount(lead.changes.gross_profit.value) });
  return {
    title, titleKind, section, blocks,
    subtitle: fill(copy.variance.subtitle, { section, current: scope.current, previous: scope.previous, scope: scope.channels }),
    tableRows: [...lists.allDecrease, ...lists.allIncrease],
  };
}

type VarianceColumn = "previous" | "current" | "change";
/** G13 資料表欄（CHART_CATALOG G13）：上期商品毛利（元）、本期商品毛利（元）、差額（元）。 */
export const VARIANCE_TABLE_COLUMNS: readonly ChartDataColumn<VarianceColumn>[] = [
  { key: "previous", label: yuanColumn(periodMetric("previous")), unit: "money", layer: "L2", data: "previous" },
  { key: "current", label: yuanColumn(periodMetric("current")), unit: "money", layer: "L2", data: "current" },
  { key: "change", label: yuanColumn(labels.products.pageV3.columns.change), unit: "signed", layer: "L2", data: "change" },
];
/** 格的值（domain 的精確字串）：差額格帶正負號（C33 unit signed，L2，與前 10 名表的差額格相同），上期、本期格不帶號；差額不利時上不利色（H5 設計稿：只有差額格上色）。 */
function varianceCell(row: ProductComparisonRow, column: VarianceColumn): ChartDataCell {
  const metric = column === "change" ? row.changes.gross_profit : row[column].metrics.gross_profit;
  return { value: metric.value, reasonCodes: metric.reason_codes, unfavorable: column === "change" && unfavorableMoney(metric.value) };
}

export interface ProductVarianceSectionProps {
  /** varianceSectionModel(...)（呼叫端以 useMemo 保存）。 */
  model: VarianceSectionModel;
  scope: ProductChartScope;
  onEvidence: (evidence: EvidenceSelection) => void;
  /** 既有 product-best 表（ChartFrame after 常駐）。 */
  after: ReactNode;
  /** false 時圖區先顯示同高的 loading 骨架、資料表內容延後（預設 true）。 */
  ready?: boolean;
}

/** 商品頁 G13：ChartFrame（id products-variance、testid chart-products-variance、h4、legend 兩項）＋C25 variance（減少在上）＋C33 資料表；after＝product-best。 */
export function ProductVarianceSection({ model, scope, onEvidence, after, ready = true }: ProductVarianceSectionProps) {
  const onBar = (evidence: EvidenceSelection) => { track("chart_clicked"); onEvidence(evidence); };
  const { ctx } = scope;
  /** 圖例只列有畫出來的段（例如全部商品的差額都 < 0 時沒有「增加最多」段，圖例也不列）。 */
  const items: ChartLegendItem[] = [
    { key: "decrease", label: copy.variance.columns.decrease, color: chartColors.unfavorable, shape: "line" },
    { key: "increase", label: copy.variance.columns.increase, color: chartColors.favorable, shape: "line" },
  ];
  const legend = items.filter(item => model.blocks.some(block => block.key === item.key));
  const dataTable = !ready ? deferredTable(model.section) : chartDataTable<ProductComparisonRow, VarianceColumn>({
    title: model.section,
    testId: PRODUCTS_VARIANCE_TABLE_TESTID,
    caption: yuanColumn(model.section),
    rowHeaderLabel: labels.products.pageV3.columns.product,
    rows: model.tableRows,
    rowKey: productChartKey,
    rowHeader: row => ({ label: productChartLabel(row, ctx.resolver) }),
    columns: VARIANCE_TABLE_COLUMNS,
    valueOf: (row, column) => varianceCell(row, column.data),
    evidenceOf: (row, column) => column.data === "change" ? varianceBarEvidence(row, ctx) : productEvidence(row, column.data, "gross_profit", SHORT, ctx),
    hasEvidence: everyCellLinked,
    onEvidence,
    cellAria: (row, column, text) => column.data === "change"
      ? fill(comparison.deltaEvidenceAria, { channel: channelLabel(row.channel, ctx.resolver), sku: row.sku, label: `${METRIC}${labels.exports.csv.suffix.change}`, value: text })
      : fill(comparison.evidenceAria, { channel: channelLabel(row.channel, ctx.resolver), sku: row.sku, period: column.data === "previous" ? labels.shell.periods.previous : "", label: SHORT, value: text }),
    notes: [copy.variance.tableNote],
    className: "products-variance-table",
  });
  const empty = model.blocks.length === 0;
  return <ChartFrame id="products-variance" page="products" testId={PRODUCTS_VARIANCE_TESTID} headingLevel={4} className="products-variance" title={model.title} subtitle={model.subtitle}
    legend={empty ? undefined : legend} height="sm" state={empty ? "empty" : ready ? undefined : "loading"} message={empty ? fill(copy.variance.empty, { metric: METRIC }) : undefined} after={after} dataTable={dataTable}>
    {empty || !ready ? null : <RankedBars mode="variance" blocks={model.blocks} testIdPrefix={PRODUCTS_VARIANCE_BAR_PREFIX} onBarClick={onBar} />}
  </ChartFrame>;
}
