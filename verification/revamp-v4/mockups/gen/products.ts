import Decimal from "decimal.js";
import { categoryLabel, channelLabel, channelsLabel } from "@/application/copy";
import { dataStatus, PRODUCT_HIGHLIGHT_LIMIT, productHighlights, rateAvailability } from "@/application/product-highlights";
import { deltaTone, formatAmountL1, formatAmountL2, formatCount, formatPeriodL1, formatRateL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { formatCents, parseCents, ratioMetric, subtractAmounts, sumAmounts } from "@/domain/money";
import { compareProducts, selectProductComparisonRows, type ProductComparisonRow } from "@/domain/product-comparison";
import type { Amount, Metric, ProductMetrics } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { BREAKPOINTS, responsive, type Breakpoint } from "./charts";
import { rankedBarsSvg, type RankedBar, type RankedColumn, type RankedGeometry } from "./charts-c2";
import { pageDocument } from "./chrome";
import { coordinate, esc } from "./format";
import { chartFrame, dataTable, numberLink, ProposalBook, trialNote, v4 } from "./html";
import type { PageOutput } from "./overview";
import type { MockupSource } from "./source";
import { colors } from "./theme";

// H5 設計稿：商品毛利（PRD §5.3、CHART_CATALOG G13、G14）。兩種狀態各一個檔：
//   products.html           示範資料：本期沒有商品毛利為負的商品，第一格照 v3 原樣放 product-worst；第二格 G13（after＝product-best）。
//   products-synthetic.html 4 通路合成資料：第一格 G14（after＝product-worst），第二格 G13（after＝product-best）。
// 由上到下：商品範圍一行、section.product-highlights（h3 保留）＋.product-highlight-grid 兩格、完整表（v3 不變，設計稿只畫主欄）。

export type ProductsVariant = "demo" | "synthetic";

/** .product-highlight-grid 每一格的 ChartFrame 內寬：> 900px 兩欄（1440、1280），≤ 900 單欄（768、390）；格寬扣 ChartFrame 的框線 1 與內距（≥ 768 為 24、≤ 767 為 16）。 */
export const CELL_INNER: Record<Breakpoint, number> = { xl: (1172 - 24) / 2 - 50, lg: (1012 - 24) / 2 - 50, md: 450, sm: 324 };
/** G13 每欄最多畫幾根（CHART_CATALOG G13：每欄 ≤ 5，10 × 16＝160 ≤ sm 180）。 */
const VARIANCE_BARS = 5;
/** G14 最多畫幾根（柱 ≤ 10，其餘寫「另 n 個」）。 */
const PARETO_BARS = 10;
/** 設計稿完整表最多畫幾列（示範資料 40 列；完整表 v3 不變，只畫前幾列當上下文）。 */
const FULL_TABLE_ROWS = 12;

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareCents = (a: bigint, b: bigint) => a < b ? -1 : a > b ? 1 : 0;
/** 與 product-highlights.ts 相同的固定 tie-break：通路、再 SKU。 */
const identityOrder = (a: ProductComparisonRow, b: ProductComparisonRow) => lexical(a.channel, b.channel) || lexical(a.sku, b.sku);
const amountOf = (metric: Metric): Amount => ({ cents: parseCents(metric.value), reason_codes: [...metric.reason_codes] });
const ZERO: Amount = { cents: 0n, reason_codes: [] };
const highlight = labels.products.highlights;
const page = labels.products.pageV3;
const copy = labels.products.comparison;
type MoneyName = Exclude<keyof ProductMetrics, "units_sold">;
const withUnit = (name: MoneyName, label: string) => metricDefinitions[name].unit === "money" ? fill(labels.format.units.yuanColumn, { label }) : label;
const periodMetric = (period: "previous" | "current", label: string) => `${labels.shell.periods[period]}${label}`;
const changeLabel = (name: MoneyName) => `${metricDefinitions[name].label}${labels.exports.csv.suffix.change}`;

/** 比率欄的 null 分「資料待補」與「不適用」（同 product-comparison-panel.tsx 的 display）。 */
function display(name: MoneyName, metric: Metric): string {
  const notApplicable = metricDefinitions[name].unit === "percent" && rateAvailability(metric) === "not_applicable";
  return notApplicable ? labels.shell.status.notApplicable : metric.value === null ? labels.shell.status.missing : metricDefinitions[name].unit === "percent" ? formatRateL2(metric.value) : formatAmountL2(metric.value);
}

/**
 * G13 減少欄的挑選（CHART_CATALOG G13：productHighlights 同檔新增對稱的 worstChange）：差額有值且 < 0，由小到大、同值依通路與 SKU；只挑列，不產生新數字（A 級）。
 * 正式版在 V4-4 的 src/application/product-highlights.ts；設計稿先照實作卡寫一份。
 */
export function worstChangeTrial(rows: readonly ProductComparisonRow[], limit = PRODUCT_HIGHLIGHT_LIMIT): ProductComparisonRow[] {
  return rows.flatMap(row => { const cents = parseCents(row.changes.gross_profit.value); return cents !== null && cents < 0n ? [{ row, cents }] : []; })
    .sort((a, b) => compareCents(a.cents, b.cents) || identityOrder(a.row, b.row)).slice(0, limit).map(entry => entry.row);
}

export interface ParetoTrialRow { row: ProductComparisonRow; value: string; cumulative: string; share: string | null }
/**
 * G14 設計稿試算（V4-4 的 productPareto／product-pareto-v1 到位前）：只取本期商品毛利 < 0 的列（不補非負的列），依 parseCents 由小到大、同值依通路與 SKU；
 * 累計用 sumAmounts；累計佔比＝取反後的累計 ÷ 取反後的負值合計（subtractAmounts(0, x) 再 ratioMetric，分母為負時 ratioMetric 一律回傳 null）。
 */
export function paretoTrial(rows: readonly ProductComparisonRow[]): { rows: ParetoTrialRow[]; total: string | null; count: number } {
  const negatives = rows.flatMap(row => { const cents = parseCents(row.current.metrics.gross_profit.value); return cents !== null && cents < 0n ? [{ row, cents }] : []; })
    .sort((a, b) => compareCents(a.cents, b.cents) || identityOrder(a.row, b.row));
  const total = sumAmounts(negatives.map(entry => amountOf(entry.row.current.metrics.gross_profit)));
  let cumulative = ZERO;
  const out = negatives.map(entry => {
    cumulative = sumAmounts([cumulative, amountOf(entry.row.current.metrics.gross_profit)]);
    const share = ratioMetric(subtractAmounts(ZERO, cumulative), subtractAmounts(ZERO, total));
    return { row: entry.row, value: entry.row.current.metrics.gross_profit.value!, cumulative: formatCents(cumulative.cents!), share: share.value };
  });
  return { rows: out, total: total.cents === null || negatives.length === 0 ? null : formatCents(total.cents), count: negatives.length };
}

export function buildProducts(source: MockupSource, variant: ProductsVariant): PageOutput {
  const { snapshot, dataset } = source;
  const { report } = snapshot;
  const alias = source.alias;
  const book = new ProposalBook();
  const data: Record<string, unknown> = { source: source.spec.id, variant };
  const comparison = compareProducts(dataset, report.scope);
  const { worstCurrent, bestChange } = productHighlights(comparison.rows);
  const worstChange = worstChangeTrial(comparison.rows);
  const pareto = paretoTrial(comparison.rows);
  const { previous_period: previous, current_period: current, channels } = comparison.scope;
  const everyChannel = dataset.manifest.channels.every(channel => channels.includes(channel));
  const channelsText = everyChannel ? labels.shell.periodBar.filter.allChannels : channelsLabel(channels, alias);
  const currentText = formatPeriodL1(current.start, current.end, { days: false, anchor: snapshot.data_as_of });
  const previousText = formatPeriodL1(previous.start, previous.end, { days: false, anchor: snapshot.data_as_of });
  const product = (row: ProductComparisonRow) => `${row.sku} · ${channelLabel(row.channel, alias)}`;
  const keyOf = (row: ProductComparisonRow) => `${row.channel}-${row.sku}`;

  // ── v3 前 10 名兩表（DOM 與 testid 照 v3：section.product-highlight[data-testid=product-worst|product-best]、h4、note、table.product-rank-table）
  const deltaCell = (row: ProductComparisonRow) => {
    const metric = row.changes.gross_profit;
    const tone = deltaTone("gross_profit", metric.value, "L2") === "unfavorable" ? "negative" : undefined;
    return `${numberLink(formatSignedDelta(metric.value, "L2"), tone)}${metric.value === null ? `<small class="note">${esc(copy.deltaMissing)}</small>` : ""}`;
  };
  const rankTable = (kind: "worst" | "best", list: readonly ProductComparisonRow[]) => {
    const worst = kind === "worst";
    const head = [[page.columns.rank, "rank", "secondary"], [page.columns.product, "", "primary"], [withUnit("gross_profit", periodMetric("current", metricDefinitions.gross_profit.shortLabel)), "num", "primary"], [withUnit("gross_profit", page.columns.change), "num", "secondary"]] as const;
    const rows = list.map((row, index) => `<tr><td class="rank" data-label="${esc(head[0][0])}" data-list-role="secondary">${esc(formatCount(index + 1, "L2"))}</td><th scope="row" data-label="${esc(head[1][0])}" data-list-role="primary">${esc(row.sku)}<span class="product-channel"><span aria-hidden="true"> · </span>${esc(channelLabel(row.channel, alias))}</span></th><td class="num" data-label="${esc(head[2][0])}" data-list-role="primary">${numberLink(display("gross_profit", row.current.metrics.gross_profit))}</td><td class="num" data-label="${esc(head[3][0])}" data-list-role="secondary">${deltaCell(row)}</td></tr>`).join("");
    const table = list.length === 0 ? `<p class="note product-highlight-empty">${esc(worst ? highlight.worstEmpty : highlight.bestEmpty)}</p>` : `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(worst ? highlight.worstAria : highlight.bestAria)}"><table class="ui-table product-list product-rank-table"><caption class="sr-only">${esc(worst ? page.worstCaption : page.bestCaption)}</caption><thead><tr>${head.map(([text, cls]) => `<th scope="col"${cls ? ` class="${cls}"` : ""}>${esc(text)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
    return `<section class="product-highlight" aria-labelledby="product-${kind}-heading" data-testid="product-${kind}"><h4 id="product-${kind}-heading">${esc(fill(worst ? highlight.worstTitle : highlight.bestTitle, { n: PRODUCT_HIGHLIGHT_LIMIT }))}</h4><p class="note">${esc(worst ? highlight.worstNote : highlight.bestNote)}</p>${table}</section>`;
  };

  // ── G13 商品毛利兩期差額（C25 variance 兩欄：減少最多、增加最多各 ≤ 5，共用尺度、各自從 0）
  const decreaseShown = worstChange.slice(0, VARIANCE_BARS);
  const increaseShown = bestChange.slice(0, VARIANCE_BARS);
  const varianceMax = Math.max(0, ...[...decreaseShown, ...increaseShown].map(row => Math.abs(coordinate(row.changes.gross_profit.value) ?? 0)));
  const varianceBar = (row: ProductComparisonRow): RankedBar => ({ key: keyOf(row), label: product(row), value: coordinate(row.changes.gross_profit.value) ?? 0, valueText: formatSignedDelta(row.changes.gross_profit.value, "L1"), unfavorable: deltaTone("gross_profit", row.changes.gross_profit.value, "L1") === "unfavorable" });
  const varianceColumns: RankedColumn[] = [
    { id: "decrease", rows: decreaseShown.map(varianceBar), direction: "left" },
    { id: "increase", rows: increaseShown.map(varianceBar), direction: "right" },
  ];
  const varianceGeometry: Record<string, Partial<Record<Breakpoint, RankedGeometry>>> = { prd: {}, stacked: {} };
  const varianceBody = (layout: "prd" | "stacked") => responsive(bp => {
    const result = rankedBarsSvg(varianceColumns, { width: CELL_INNER[bp], layout: layout === "prd" && bp !== "sm" ? "side" : "stack", max: varianceMax, testIdPrefix: "chart-products-variance-bar-" });
    varianceGeometry[layout][bp] = result.geometry;
    return result.svg;
  });
  const decreaseLegend = book.mark("products.chartsV4.variance.columns.decrease", "減少最多", "G13", "欄名不放在 svg 內，用 ChartFrame legend（line）");
  const increaseLegend = book.mark("products.chartsV4.variance.columns.increase", "增加最多", "G13");
  const amountAbs = (value: string) => formatAmountL1(new Exact(value).abs().toFixed(2));
  const varianceTitle = decreaseShown.length > 0
    ? book.mark("products.chartsV4.variance.title.decrease", fill("{product} 商品毛利少 {amount}，減少最多", { product: product(decreaseShown[0]), amount: amountAbs(decreaseShown[0].changes.gross_profit.value!) }), "G13", "取減少最多的一列；SKU 與通路不計入 14 字")
    : increaseShown.length > 0 ? book.mark("products.chartsV4.variance.title.increase", fill("{product} 商品毛利多 {amount}，增加最多", { product: product(increaseShown[0]), amount: amountAbs(increaseShown[0].changes.gross_profit.value!) }), "G13", "沒有減少時")
      : esc(labels.overview.chartFrame.noData);
  if (decreaseShown.length > 0) book.note("products.chartsV4.variance.title.increase", "{SKU} · {通路} 商品毛利多 {amount}，增加最多", "G13", "模板；沒有減少時才用（本資料未觸發）");
  const varianceSection = book.note("products.chartsV4.variance.section", "商品毛利兩期差額", "G13", "區塊標準名（v4 GLOSSARY §3），副標第一段、資料表 summary 與 caption 用");
  const varianceSubtitle = book.mark("products.chartsV4.variance.subtitle", fill("{section} · 本期 {current} 對比 上期 {previous} · {channels}", { section: varianceSection, current: currentText, previous: previousText, channels: channelsText }), "G13");
  const zeroRows = comparison.rows.filter(row => { const cents = parseCents(row.changes.gross_profit.value); return cents === 0n; }).length;
  const nullRows = comparison.rows.filter(row => row.changes.gross_profit.value === null).length;
  const decreaseAll = worstChangeTrial(comparison.rows, comparison.rows.length);
  const increaseAll = productHighlights(comparison.rows, comparison.rows.length).bestChange;
  const varianceTableRows = [...decreaseAll, ...increaseAll].map(row => [esc(product(row)), numberLink(display("gross_profit", row.previous.metrics.gross_profit)), numberLink(display("gross_profit", row.current.metrics.gross_profit)), deltaCell(row)]);
  const zeroNote = book.note("products.chartsV4.variance.table.zeroNote", fill("差額為 0 的 {n} 列、差額待補的 {m} 列不列入", { n: zeroRows, m: nullRows }), "G13", "資料表 tfoot（限制句只放在 <details> 內）");
  const varianceTable = dataTable({
    caption: esc(fill(labels.overview.page.captionWithUnit, { caption: varianceSection })),
    head: [esc(page.columns.product), esc(withUnit("gross_profit", periodMetric("previous", metricDefinitions.gross_profit.label))), esc(withUnit("gross_profit", periodMetric("current", metricDefinitions.gross_profit.label))), esc(withUnit("gross_profit", page.columns.change))],
    rows: varianceTableRows, testId: "chart-products-variance-table", foot: [esc(zeroNote)],
  });
  const switchVariance = `<div class="mockup-switch" role="group" aria-label="設計稿狀態切換"><span>設計稿狀態：</span><button type="button" data-switch="g13-layout" data-value="prd" aria-pressed="true">PRD 版（≥ 768 兩欄並排）</button><button type="button" data-switch="g13-layout" data-value="stacked" aria-pressed="false">建議版（各寬度都上下排列）</button></div>`;
  const g13 = chartFrame({
    id: "products-variance", testId: "chart-products-variance", headingLevel: 4, title: varianceTitle, subtitle: varianceSubtitle,
    legend: [{ label: decreaseLegend, color: colors.unfavorable }, { label: increaseLegend, color: colors.favorable }],
    v4Note: "G13：新增（C25 RankedBars variance；兩欄共用尺度、各自從 0；product-best 改為 after 常駐）",
    takeaways: switchVariance,
    after: `${trialNote("設計稿試算：減少欄的挑選（差額 < 0、由小到大、同值依通路與 SKU）由產生器照 CHART_CATALOG G13 寫；正式由 V4-4 在 product-highlights.ts 新增的 worstChange 產生（只挑列，不產生新數字）。增加欄直接用既有 productHighlights().bestChange。")}${rankTable("best", bestChange)}`,
    dataTable: { title: varianceSection, content: varianceTable },
    body: `<div data-switch-panel="g13-layout" data-value="prd">${varianceBody("prd")}</div><div data-switch-panel="g13-layout" data-value="stacked" hidden>${varianceBody("stacked")}</div>`,
  });
  data.g13 = {
    decrease: decreaseAll.map(row => ({ channel: row.channel, sku: row.sku, previous: row.previous.metrics.gross_profit.value, current: row.current.metrics.gross_profit.value, change: row.changes.gross_profit.value, shown: decreaseShown.includes(row) })),
    increase: increaseAll.map(row => ({ channel: row.channel, sku: row.sku, previous: row.previous.metrics.gross_profit.value, current: row.current.metrics.gross_profit.value, change: row.changes.gross_profit.value, shown: increaseShown.includes(row) })),
    zeroRows, nullRows, max: varianceMax, geometry: varianceGeometry,
  };

  // ── G14 商品毛利為負的商品累計（C25 pareto；只在有商品毛利為負時渲染，after＝product-worst）
  let firstCell: string;
  if (pareto.count === 0) {
    firstCell = rankTable("worst", worstCurrent);
    data.g14 = { count: 0, note: "本期沒有商品毛利為負的商品：不渲染 G14，第一格照 v3 原樣放 product-worst" };
  } else {
    const shown = pareto.rows.slice(0, PARETO_BARS);
    const moreCount = pareto.rows.length - shown.length;
    const cumulativeText = (share: string | null) => fill("累計 {pct}", { pct: share === null ? labels.shell.status.notApplicable : formatRateL2(share) });
    book.note("products.chartsV4.pareto.cumulative", cumulativeText(shown[0].share), "G14", "柱右側的累計佔比標值");
    const moreText = book.note("products.chartsV4.pareto.more", fill("另 {n} 個", { n: Math.max(moreCount, 0) }), "G14", moreCount > 0 ? "柱 ≤ 10，其餘寫文字，不畫「其他」柱（X38）" : "模板；柱 ≤ 10，其餘寫文字（本資料 5 個，未觸發）");
    const paretoColumn: RankedColumn = {
      id: "pareto", direction: "left", more: moreCount > 0 ? moreText : undefined,
      rows: shown.map(item => ({ key: keyOf(item.row), label: product(item.row), value: coordinate(item.value) ?? 0, valueText: formatAmountL1(item.value), unfavorable: true, extraText: cumulativeText(item.share) })),
    };
    const paretoMax = Math.max(0, ...shown.map(item => Math.abs(coordinate(item.value) ?? 0)));
    const paretoGeometry: Partial<Record<Breakpoint, RankedGeometry>> = {};
    const paretoBody = responsive(bp => { const result = rankedBarsSvg([paretoColumn], { width: CELL_INNER[bp], layout: "stack", max: paretoMax, testIdPrefix: "chart-products-pareto-bar-" }); paretoGeometry[bp] = result.geometry; return result.svg; });
    const k = Math.min(3, pareto.count);
    const paretoTitle = book.mark("products.chartsV4.pareto.title", fill("{n} 個商品毛利為負，前 {k} 個佔 {pct}", { n: pareto.count, k, pct: formatRateL2(pareto.rows[k - 1].share) }), "G14", "k＝min(3, n)；pct＝累計佔比（佔商品毛利為負合計）；不用 v4 GLOSSARY #13 的禁用同義詞");
    const paretoSection = book.note("products.chartsV4.pareto.section", "商品毛利為負的商品累計", "G14", "區塊標準名（v4 GLOSSARY §3）");
    const paretoSubtitle = book.mark("products.chartsV4.pareto.subtitle", fill("{section} · 本期 {current} · {channels}", { section: paretoSection, current: currentText, channels: channelsText }), "G14");
    const cumulativeColumn = book.note("products.chartsV4.pareto.columns.cumulative", "累計（元）", "G14", "水準值，抽屜大數字不帶正負號（valueKind: level）");
    const shareColumn = book.note("products.chartsV4.pareto.columns.share", "累計佔比", "G14", "佔商品毛利為負合計；D-V4-32＝A 生效前是純文字（需 D-V3-31＝B）");
    const paretoNote = book.note("products.chartsV4.pareto.table.note", "商品毛利只扣商品成本，不含通路費用與廣告；退款依入帳日扣除。累計佔比＝前幾個的商品毛利為負額合計 ÷ 全部商品毛利為負額合計。", "G14", "資料表 tfoot（限制句只放在 <details> 內）；copy-scan 對 products.chartsV4.* 擋 v4 GLOSSARY #13 的禁用同義詞");
    const paretoTable = dataTable({
      caption: esc(fill(labels.overview.page.captionWithUnit, { caption: paretoSection })),
      head: [esc(page.columns.product), esc(withUnit("gross_profit", periodMetric("current", metricDefinitions.gross_profit.label))), esc(cumulativeColumn), esc(shareColumn)],
      rows: pareto.rows.map(item => [esc(product(item.row)), numberLink(formatAmountL2(item.value), "negative"), numberLink(formatAmountL2(item.cumulative), "negative"), esc(item.share === null ? labels.shell.status.notApplicable : formatRateL2(item.share))]),
      testId: "chart-products-pareto-table", foot: [esc(paretoNote)],
    });
    firstCell = chartFrame({
      id: "products-pareto", testId: "chart-products-pareto", headingLevel: 4, title: paretoTitle, subtitle: paretoSubtitle,
      v4Note: "G14：新增（C25 RankedBars pareto；只在有商品毛利為負時渲染；product-worst 改為 after 常駐）",
      after: `${trialNote("設計稿試算：只取本期商品毛利 < 0 的列，依 parseCents 由小到大（同值依通路與 SKU），累計用 sumAmounts，累計佔比＝取反後的累計 ÷ 取反後的負值合計（subtractAmounts 再 ratioMetric）；正式由 V4-4 的 B 級函式 productPareto（product-pareto-v1）產生。")}${rankTable("worst", worstCurrent)}`,
      dataTable: { title: paretoSection, content: paretoTable },
      body: paretoBody,
    });
    data.g14 = { count: pareto.count, total: pareto.total, more: moreCount, max: paretoMax, rows: pareto.rows.map(item => ({ channel: item.row.channel, sku: item.row.sku, value: item.value, cumulative: item.cumulative, share: item.share })), title: { n: pareto.count, k, pct: pareto.rows[k - 1].share }, geometry: paretoGeometry };
  }

  const highlights = `<section class="product-highlights" aria-labelledby="product-highlights-heading"><h3 id="product-highlights-heading">${esc(labels.products.sections.productTopBottom)}</h3><div class="product-highlight-grid"${v4(pareto.count === 0 ? "第一格照 v3 原樣（沒有商品毛利為負）；第二格 G13" : "第一格 G14、第二格 G13；兩張前 10 名表改為 after 常駐，DOM 與 testid 不變")}>${firstCell}${g13}</div></section>`;

  // ── 完整表（v3 不變；設計稿只畫主欄與前幾列，當上下文）
  const sorted = selectProductComparisonRows(comparison.rows, { sort: "gross_profit_change", direction: "ascending" });
  const fullRows = sorted.slice(0, FULL_TABLE_ROWS);
  type Column = { header: string; num: boolean; role: "primary" | "secondary" | "labeled"; lead?: boolean; render: (row: ProductComparisonRow) => string; rowHeader?: boolean };
  const metricCell = (row: ProductComparisonRow, period: "previous" | "current", name: MoneyName) => numberLink(display(name, row[period].metrics[name]));
  const columns: Column[] = [
    { header: labels.exports.csv.columns.channel, num: false, role: "primary", render: row => esc(channelLabel(row.channel, alias)) },
    { header: "SKU", num: false, role: "primary", rowHeader: true, render: row => esc(row.sku) },
    { header: labels.exports.csv.columns.category, num: false, role: "labeled", render: row => esc(row.category.trim() ? categoryLabel(row.category, alias) : copy.blankCategory) },
    { header: periodMetric("current", labels.assist.items.units_sold.label), num: true, role: "secondary", render: row => numberLink(formatCount(row.current.metrics.units_sold.value, "L2")) },
    ...(["net_revenue", "gross_profit", "gross_margin"] as const).map((name): Column => ({ header: withUnit(name, periodMetric("current", metricDefinitions[name].shortLabel)), num: true, role: name === "gross_profit" ? "primary" : name === "gross_margin" ? "secondary" : "labeled", render: row => metricCell(row, "current", name) })),
    { header: withUnit("gross_profit", changeLabel("gross_profit")), num: true, role: "secondary", lead: true, render: deltaCell },
    { header: withUnit("net_revenue", changeLabel("net_revenue")), num: true, role: "labeled", render: row => numberLink(formatSignedDelta(row.changes.net_revenue.value, "L2"), deltaTone("net_revenue", row.changes.net_revenue.value, "L2") === "unfavorable" ? "negative" : undefined) },
    { header: withUnit("net_revenue", periodMetric("previous", metricDefinitions.net_revenue.label)), num: true, role: "labeled", render: row => metricCell(row, "previous", "net_revenue") },
    { header: withUnit("gross_profit", periodMetric("previous", metricDefinitions.gross_profit.label)), num: true, role: "labeled", render: row => metricCell(row, "previous", "gross_profit") },
    { header: highlight.columns.dataStatus, num: false, role: "labeled", render: row => { const status = dataStatus(row); return `<span class="product-status ${status}">${esc(highlight.status[status])}</span>`; } },
  ];
  const cell = (column: Column, row: ProductComparisonRow) => {
    const attrs = `data-label="${esc(column.header)}" data-list-role="${column.role}"`;
    const cls = [column.num ? "num" : "", column.lead ? "list-lead" : ""].filter(Boolean).join(" ");
    return column.rowHeader ? `<th scope="row" ${attrs}>${column.render(row)}</th>` : `<td${cls ? ` class="${cls}"` : ""} ${attrs}>${column.render(row)}</td>`;
  };
  const fullTable = `<div class="table-scroll product-table-scroll" tabindex="0" role="region" aria-label="${esc(copy.tableAria)}"><table class="ui-table product-list" data-testid="product-table"><caption class="sr-only">${esc(copy.tableCaption)}</caption><thead><tr>${columns.map(column => `<th scope="col"${column.num ? ` class="num"` : ""}>${esc(column.header)}</th>`).join("")}</tr></thead><tbody>${fullRows.map(row => `<tr>${columns.map(column => cell(column, row)).join("")}</tr>`).join("")}</tbody></table></div>`;
  const CHEVRON = `<svg class="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"/></svg>`;
  const toolbar = `<div class="ui-toolbar product-toolbar" data-testid="product-toolbar"><span class="select-like">${esc(copy.allCategories)}${CHEVRON}</span><span class="input-like">${esc(copy.searchPlaceholder)}</span><span class="select-like">${esc(page.sortOptions.grossProfitChangeAscending)}${CHEVRON}</span><span class="ui-btn ui-btn-secondary">${esc(copy.negativeOnly)}</span><span class="ui-btn ui-btn-secondary">${esc(page.columnsMenu)} ${CHEVRON}</span><p class="ui-toolbar-end product-count" data-testid="product-count">${esc(fill(page.showing, { n: formatCount(sorted.length, "L2"), total: formatCount(comparison.rows.length, "L2") }))}</p></div>`;
  const truncated = sorted.length > fullRows.length ? `<p class="mockup-trial" role="note">設計稿只畫前 ${fullRows.length} 列（共 ${sorted.length} 列）；完整表的欄位、排序與 DOM 與 v3 相同，v4 不改。</p>` : "";
  const full = `<section class="product-full" aria-labelledby="product-full-heading"><h3 class="product-full-heading" id="product-full-heading">${esc(highlight.fullTable)}</h3>${toolbar}${fullTable}${truncated}<details class="product-technical"><summary>${esc(labels.evidence.sections.technicalDetails)}</summary><p class="note">${esc(copy.deltaFormulaNote)}</p></details></section>`;

  const scope = `<p class="product-scope" data-testid="product-scope">${esc(fill(page.scope, { current: currentText, previous: previousText, channels: channelsText }))}</p>`;
  const content = `<section class="product-page" aria-labelledby="products-heading"><h2 id="products-heading" class="sr-only">${esc(labels.products.sections.productTable)}</h2>${scope}${highlights}${full}</section>`;
  const file = variant === "demo" ? "products.html" : "products-synthetic.html";
  const html = pageDocument({
    page: "products", description: page.description, docTitle: `商品毛利（${variant === "demo" ? "示範資料" : "4 通路合成資料"}）· H5 設計稿`, source, content, proposals: book,
    headerAction: `<span class="ui-btn ui-btn-secondary" data-testid="export-page-products">${esc(page.exportPage)} ${CHEVRON}</span>`,
    bannerNote: variant === "demo" ? "狀態 1／2：沒有商品毛利為負（另見 products-synthetic.html）" : "狀態 2／2：有商品毛利為負（另見 products.html）",
  });
  data.breakpoints = BREAKPOINTS;
  data.proposals = book.items;
  return { file, html, data, proposals: book };
}
