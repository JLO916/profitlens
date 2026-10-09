import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_PARETO_LIMIT, PRODUCT_PARETO_VERSION, productPareto, type ProductPareto } from "@/application/chart-pareto";
import { chartHeights, chartRowHeights } from "@/application/chart-theme";
import { channelsLabel, demoAlias, formatHeadlineAmount } from "@/application/copy";
import { channelAliasTerms, l1ClauseLengths, L1_MAX_CJK } from "../scripts/lib/copy-scan.mjs";
import { deltaTone, formatAmountL1, formatAmountL2, formatCount, formatPeriodL1, formatRateL1, formatRateL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { productHighlights } from "@/application/product-highlights";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { ChartDataTable, type ChartDataColumn, type ChartDataTableProps } from "@/components/charts/chart-data-table";
import type { RankedBarRow, RankedBarsProps } from "@/components/charts/ranked-bars";
import { EvidenceDrawer, type EvidenceSelection } from "@/components/evidence-drawer";
import type { ChartFrameProps } from "@/components/overview/charts/chart-frame";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { productEvidence, type ProductEvidenceContext } from "@/components/product-evidence";
import { PRODUCT_VARIANCE_BLOCK_ROWS, PRODUCTS_PARETO_BAR_PREFIX, PRODUCTS_PARETO_TABLE_TESTID, PRODUCTS_PARETO_TESTID, PRODUCTS_VARIANCE_TABLE_TESTID, PRODUCTS_VARIANCE_TESTID, ProductParetoSection, ProductVarianceSection, paretoSectionModel, productChartKey, productChartLabel, varianceSectionModel, type ProductChartScope } from "@/components/products/highlight-charts";
import { compareProducts, type ProductComparisonRow } from "@/domain/product-comparison";
import type { Dataset, DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-4 代理 C：商品頁 G13、G14 的 SSR 結構測試（06_BATCHES V4-4「驗收重點」；CHART_CATALOG §5 商品頁、G13、G14 的單元測試欄）。
 * - 沒有商品毛利為負（示範資料、golden）：沒有 chart-products-pareto，第一格照 v3 原樣是 product-worst；product-worst、product-best 的 markup 與 V4-3c
 *   （tests/fixtures/product-highlights-v43c.json，同法渲染 v3.0.0 逐字相同）逐字相同。
 * - 有商品毛利為負（refund_only、4 通路合成資料、記憶體 13 個負值）：第一格是 G14，product-worst 是它的 after；柱 ≤ 10，其餘一列「另 n 個」，沒有「其他」柱；
 *   資料表列出全部負值列，末筆累計＝負值合計、末筆累計佔比 100%；累計格抽屜大數字不帶「+」。
 * - G13：每段 ≤ 5 根、減少段在上、svg 高＝列數 × 16 ≤ 180；product-best 在 chart-products-variance 內；沒有可畫的差額時是空狀態。
 * 斷言只用 testid、labels 與格式化函式；柱與資料表格的 evidence 直接取元素樹（區塊元件沒有 hook，可直接呼叫），與 builder 的輸出 toEqual。
 */

const tracked = vi.hoisted(() => [] as string[]);
vi.mock("@/application/analytics", async importOriginal => ({ ...await importOriginal<typeof import("@/application/analytics")>(), track: (name: string) => { tracked.push(name); } }));
beforeEach(() => { tracked.length = 0; });

const copy = labels.products.chartsV4;
const METRIC = metricDefinitions.gross_profit.label;
const SHORT = metricDefinitions.gross_profit.shortLabel;
const V43C_FILE = JSON.parse(readFileSync(resolve("tests/fixtures/product-highlights-v43c.json"), "utf8")) as Record<string, Record<"product-worst" | "product-best", string>>;
/** V4-3c 的 product-worst、product-best markup（記憶體資料集 many 沒有快照，回傳 null）。 */
const v43c = (name: string): Record<"product-worst" | "product-best", string> | null => V43C_FILE[name === "synthetic" ? "synthetic-4-channel" : name] ?? null;

type Loaded = { name: string; dataset: Dataset; snapshot: WorkspaceSnapshot; rows: ProductComparisonRow[]; ctx: ProductEvidenceContext; scope: ProductChartScope; html: string };
async function load(name: string, input: DatasetInput): Promise<Loaded> {
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  const comparison = compareProducts(dataset, snapshot.report.scope);
  const alias = demoAlias(dataset.manifest.dataset_id);
  const { previous_period: previous, current_period: current, channels } = comparison.scope;
  const ctx = { previous, current, alias };
  const every = dataset.manifest.channels.every(channel => channels.includes(channel));
  const scope: ProductChartScope = {
    ctx, current: formatPeriodL1(current.start, current.end, { days: false, anchor: snapshot.data_as_of }), previous: formatPeriodL1(previous.start, previous.end, { days: false, anchor: snapshot.data_as_of }),
    channels: every ? labels.shell.periodBar.filter.allChannels : channelsLabel(channels, alias),
  };
  const html = renderToStaticMarkup(createElement(ProductComparisonPanel, { dataset, snapshot, onEvidence: () => undefined }));
  return { name, dataset, snapshot, rows: comparison.rows, ctx, scope, html };
}
const DAY = (offset: number) => new Date(Date.parse("2026-01-05T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10);
/** 記憶體合成資料（不寫檔）：1 通路 13 個 SKU，上期 7 天商品毛利為正、本期 7 天每個 SKU 商品毛利為負（−10、−20 … −130 元／天），測柱上限與「另 n 個」。 */
function manyNegativesInput(): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const skus = Array.from({ length: 13 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
  const dates = Array.from({ length: 14 }, (_, index) => DAY(index));
  const sales = dates.flatMap((date, offset) => skus.map((sku, index) => `${date},DTC,${sku},HOME,1,100.00,0.00,0.00,${offset < 7 ? "50.00" : (110 + index * 10).toFixed(2)},TWD`));
  return {
    manifest: { ...base, dataset_id: "synthetic-many-negatives-13", data_as_of: DAY(14), coverage_start: DAY(0), coverage_end: DAY(13), channels: ["DTC"], previous_period: { start: DAY(0), end: DAY(6) }, current_period: { start: DAY(7), end: DAY(13) } },
    files: {
      "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...sales].join("\n"),
      "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...dates.map(date => `${date},DTC,1.00,1.00,1.00,1.00,TWD`)].join("\n"),
      "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...dates.map(date => `${date},DTC,1.00,TWD`)].join("\n"),
    },
  };
}

let sets: Record<"demo" | "golden" | "refund_only" | "synthetic" | "many", Loaded>;
beforeAll(async () => {
  const [demo, golden, refundOnly, synthetic, many] = await Promise.all([load("demo", fixture("demo")), load("golden", fixture("golden")), load("refund_only", fixture("refund_only")), load("synthetic-4-channel", synthetic4ChannelInput()), load("many", manyNegativesInput())]);
  sets = { demo, golden, refund_only: refundOnly, synthetic, many };
});
const paretoOf = (set: Loaded) => productPareto(set.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
/** .product-highlight-grid 的直接子元素（依序）。 */
function gridChildren(html: string): string[] {
  const grid = element(html, 'class="product-highlight-grid"')!;
  let rest = grid.slice(grid.indexOf(">") + 1, grid.lastIndexOf("</div>"));
  const out: string[] = [];
  while (rest.length) { const child = element(rest, "<section")!; out.push(child); rest = rest.slice(rest.indexOf(child) + child.length); }
  return out;
}
const barIds = (html: string, prefix: string) => [...html.matchAll(new RegExp(`data-testid="(${prefix}[^"]+)"`, "g"))].map(match => match[1]);
const tableRows = (table: string) => [...element(table, "<tbody")!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(cell => textOf(cell[2])));
const drawer = (set: Loaded, evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset: set.dataset, snapshot: set.snapshot, evidence, onClose: () => undefined }));
const bigNumber = (html: string) => /<p class="number">([^<]*)<\/p>/.exec(html)![1];
/** 元素樹（沒有 hook 的元件直接展開）裡符合條件的元素。 */
function findElements(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, match));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === "function") return findElements((node.type as (props: unknown) => ReactNode)(node.props), match);
  return [...(match(node) ? [node] : []), ...findElements(node.props.children as ReactNode, match)];
}
/** 資料表每一列各格的 class（td、按鈕）：[td class, button class | null][]。 */
const cellClasses = (table: string) => [...element(table, "<tbody")!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<td(?: class="([^"]*)")?>([\s\S]*?)<\/td>/g)].map(cell => [cell[1] ?? "", /<button[^>]*class="([^"]*)"/.exec(cell[2])?.[1] ?? null] as const));

/** 直接呼叫 G14 區塊元件（沒有 hook），取元素樹上的 RankedBars 與 C33 資料表 props。 */
function paretoTree(set: Loaded, onEvidence: (evidence: EvidenceSelection) => void) {
  const pareto = paretoOf(set);
  const frame = ProductParetoSection({ pareto, model: paretoSectionModel(pareto, set.scope), scope: set.scope, onEvidence, after: null }) as ReactElement<ChartFrameProps>;
  const bars = frame.props.children as ReactElement<RankedBarsProps<EvidenceSelection>>;
  const table = (frame.props.dataTable!.content as ReactElement<ChartDataTableProps<{ entry: ProductPareto["allRows"][number]; index: number }, string>>).props;
  return { pareto, frame, bars: bars.props, table };
}

describe("V4-4 商品頁：沒有商品毛利為負時（示範資料、golden）不渲染 G14，前 10 名兩表與 v3 相同", () => {
  it.each(["demo", "golden"] as const)("%s：沒有 chart-products-pareto；第一格是 product-worst（逐字等於 V4-3c），第二格是 G13，product-best 是它的 after（逐字等於 V4-3c）", name => {
    const { html } = sets[name];
    expect(paretoOf(sets[name]).count).toBe(0);
    expect(html).not.toContain(PRODUCTS_PARETO_TESTID);
    expect(html.split('id="product-highlights-heading"')).toHaveLength(2);
    const [first, second, ...rest] = gridChildren(html);
    expect(rest).toEqual([]);
    expect(first).toBe(v43c(name)!["product-worst"]);
    expect(byTestId(html, "product-worst")).toBe(v43c(name)!["product-worst"]);
    expect(openTag(second, "<section")).toBe(`<section class="panel chart-section products-variance" aria-labelledby="products-variance-title" aria-describedby="products-variance-sub" data-testid="${PRODUCTS_VARIANCE_TESTID}">`);
    expect(byTestId(second, "product-best")).toBe(v43c(name)!["product-best"]);
  });
});

describe("V4-4 G14 商品毛利為負的商品累計（有負值時渲染）", () => {
  it.each(["refund_only", "synthetic", "many"] as const)("%s：第一格是 G14（h4、固定高 sm、aria-hidden），product-worst 是 after（逐字等於 V4-3c）、排在圖框之後與資料表之前", name => {
    const set = sets[name];
    const { html } = set;
    const pareto = paretoOf(set);
    const [first, second] = gridChildren(html);
    expect(openTag(first, "<section")).toBe(`<section class="panel chart-section products-pareto" aria-labelledby="products-pareto-title" aria-describedby="products-pareto-sub" data-testid="${PRODUCTS_PARETO_TESTID}">`);
    expect(openTag(second, "<section")).toContain(`data-testid="${PRODUCTS_VARIANCE_TESTID}"`);
    const before = v43c(name);
    if (name !== "many") expect(before, name).not.toBeNull();
    if (before) {
      expect(byTestId(first, "product-worst")).toBe(before["product-worst"]);
      expect(byTestId(second, "product-best")).toBe(before["product-best"]);
    }
    const order = ['class="chart-frame sm"', 'data-testid="product-worst"', '<details class="data-alternative"'].map(attr => first.indexOf(attr));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(openTag(first, 'class="chart-frame sm"')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    const lead = Math.min(3, pareto.count);
    const title = fill(copy.pareto.title, { n: formatCount(pareto.count, "L2"), metric: METRIC, k: formatCount(lead, "L2"), pct: formatRateL1(pareto.allRows[lead - 1].share.value) });
    expect(first).toContain(`<h4 id="products-pareto-title">${escapeAttr(title)}</h4>`);
    const section = fill(copy.pareto.section, { metric: METRIC });
    expect(first).toContain(`<p class="sub" id="products-pareto-sub">${escapeAttr(fill(copy.pareto.subtitle, { section, period: set.scope.current, scope: set.scope.channels }))}</p>`);
    for (const word of ["賠錢", "虧損"]) expect(textOf(first.replace(byTestId(first, "product-worst"), "")), word).not.toContain(word);
  });

  it("refund_only 的句子：1 個商品毛利為負，前 1 個佔 100.0%；合成資料：5 個，前 3 個佔 81.0%（0.809843400447）", () => {
    expect(byTestId(sets.refund_only.html, PRODUCTS_PARETO_TESTID)).toContain(escapeAttr(fill(copy.pareto.title, { n: "1", metric: METRIC, k: "1", pct: formatRateL1("1.000000000000") })));
    expect(byTestId(sets.synthetic.html, PRODUCTS_PARETO_TESTID)).toContain(escapeAttr(fill(copy.pareto.title, { n: "5", metric: METRIC, k: "3", pct: formatRateL1("0.809843400447") })));
  });

  it("柱 ≤ 10（依 allRows 順序、testid chart-products-pareto-bar-{channel}-{sku}），其餘只寫一列「另 n 個」，沒有「其他」柱；svg 高＝列數 × 16 ≤ 180；右側累計欄帶 is-narrow-hidden", () => {
    for (const name of ["refund_only", "synthetic", "many"] as const) {
      const set = sets[name];
      const pareto = paretoOf(set);
      const section = byTestId(set.html, PRODUCTS_PARETO_TESTID);
      const ids = barIds(section, PRODUCTS_PARETO_BAR_PREFIX);
      expect(ids, name).toEqual(pareto.rows.map(entry => `${PRODUCTS_PARETO_BAR_PREFIX}${productChartKey(entry.row)}`));
      expect(ids.length, name).toBe(Math.min(PRODUCT_PARETO_LIMIT, pareto.count));
      const rows = ids.length + (pareto.more > 0 ? 1 : 0);
      expect(openTag(section, 'class="chart-ranked-bars"'), name).toContain(`data-rows="${rows}"`);
      expect(openTag(section, 'class="chart-ranked-bars"'), name).toContain(`height="${rows * chartRowHeights.row16}"`);
      expect(rows * chartRowHeights.row16, name).toBeLessThanOrEqual(chartHeights.sm);
      const more = [...section.matchAll(/<text class="ranked-more"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
      expect(more, name).toEqual(pareto.more > 0 ? [fill(copy.pareto.more, { n: formatCount(pareto.more, "L2") })] : []);
      const extra = element(section, 'class="chart-ranked-extra is-narrow-hidden"')!;
      expect([...extra.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]), name).toEqual(pareto.rows.map(entry => fill(copy.pareto.cumulative, { pct: formatRateL1(entry.share.value) })));
      expect(element(section, 'class="chart-frame sm"'), name).not.toMatch(/tabindex|<button|<a\s/);
    }
    // 13 個負值：10 根柱＋「另 3 個」＝11 列 × 16＝176。
    expect(paretoOf(sets.many)).toMatchObject({ count: 13, more: 3 });
    expect(byTestId(sets.many.html, PRODUCTS_PARETO_TESTID)).toContain(`>${fill(copy.pareto.more, { n: "3" })}</text>`);
    expect(byTestId(sets.many.html, PRODUCTS_PARETO_TESTID)).not.toMatch(/chart-products-pareto-bar-(other|rest|more)/);
  });

  it("資料表列出全部負值列（收合但掛載）：SKU · 通路｜本期商品毛利（元）｜累計（元）｜累計佔比；末筆累計＝負值合計、末筆累計佔比 100%；三格都是 number-link", () => {
    for (const name of ["refund_only", "synthetic", "many"] as const) {
      const set = sets[name];
      const pareto = paretoOf(set);
      const section = byTestId(set.html, PRODUCTS_PARETO_TESTID);
      const details = element(section, '<details class="data-alternative"')!;
      expect(openTag(details, "<details"), name).not.toMatch(/\sopen=""/);
      expect(details, name).toContain(`<summary>${escapeAttr(fill(labels.overview.page.dataTable, { title: fill(copy.pareto.section, { metric: METRIC }) }))}</summary>`);
      const table = byTestId(details, PRODUCTS_PARETO_TABLE_TESTID);
      expect([...table.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1]), name).toEqual([labels.products.pageV3.columns.product, fill(labels.format.units.yuanColumn, { label: `${labels.shell.periods.current}${SHORT}` }), fill(labels.format.units.yuanColumn, { label: copy.pareto.columns.cumulative }), copy.pareto.columns.share]);
      const rows = tableRows(table);
      expect(rows, name).toEqual(pareto.allRows.map(entry => [productChartLabel(entry.row, set.ctx.alias), formatAmountL2(entry.value.value), formatAmountL2(entry.cumulative.value), formatRateL2(entry.share.value)]));
      expect(rows.at(-1)!.slice(2), name).toEqual([formatAmountL2(pareto.total.value), formatRateL2("1.000000000000")]);
      expect(table.match(/class="number-link(?: negative)?"/g), name).toHaveLength(pareto.count * 3);
      expect(details, name).toContain(escapeAttr(fill(copy.pareto.tableNote, { metric: METRIC })));
    }
  });

  it("柱與資料表同列的商品毛利格是同一個 builder（productEvidence 本期商品毛利＋filter { channel, sku }＋arrangeVersion product-pareto-v1）；累計、累計佔比格各自的 builder（product-pareto-v1、水準值）；點柱記 chart_clicked", () => {
    for (const name of ["synthetic", "many"] as const) {
      const set = sets[name];
      const onEvidence = vi.fn<(evidence: EvidenceSelection) => void>();
      const { pareto, bars, table } = paretoTree(set, onEvidence);
      const column = (key: string) => table.columns.find(item => item.key === key)! as ChartDataColumn<string>;
      expect(table.rows.map(row => row.entry)).toEqual(pareto.allRows);
      bars.rows!.forEach((bar, index) => {
        const row = pareto.rows[index].row;
        const expected = { ...productEvidence(row, "current", "gross_profit", SHORT, set.ctx, { drill: true }), arrangeVersion: PRODUCT_PARETO_VERSION };
        expect(bar.evidence, `${name} ${bar.key}`).toEqual(expected);
        expect(bar.evidence.metricVersion, `${name} ${bar.key}：值取自 domain，維持 contribution-v1`).toBeUndefined();
        expect(bar.evidence.filter).toEqual({ channel: row.channel, sku: row.sku });
        expect(table.evidenceOf(table.rows[index], column("gross_profit"))).toEqual(expected);
      });
      table.rows.forEach((row, index) => {
        const n = index + 1;
        const cumulative = table.evidenceOf(row, column("cumulative"))!;
        expect(cumulative).toMatchObject({ title: fill(copy.pareto.drawer.cumulativeTitle, { n, metric: METRIC }), formula: fill(copy.pareto.drawer.cumulativeFormula, { n, metric: METRIC }), metric: row.entry.cumulative, valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION, definition: fill(copy.pareto.drawer.cumulativeDefinition, { n, metric: METRIC }), formulaTechnical: copy.pareto.drawer.cumulativeFormulaTechnical });
        expect(cumulative.components!.map(item => item.label)).toEqual(pareto.allRows.slice(0, n).map(entry => productChartLabel(entry.row, set.ctx.alias)));
        const share = table.evidenceOf(row, column("share"))!;
        const numerator = fill(copy.pareto.drawer.numerator, { n, metric: METRIC }), denominator = fill(copy.pareto.drawer.denominator, { metric: METRIC });
        expect(share).toMatchObject({ title: fill(copy.pareto.drawer.shareTitle, { n, metric: METRIC }), metric: row.entry.share, unitOverride: "percent", valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION, formula: fill(copy.pareto.drawer.shareFormula, { numerator, denominator }), definition: fill(copy.pareto.drawer.shareDefinition, { n, metric: METRIC }) });
        expect(share.components).toEqual([{ label: numerator, metric: row.entry.magnitude }, { label: denominator, metric: pareto.totalMagnitude }]);
      });
      const first = bars.rows![0] as RankedBarRow<EvidenceSelection>;
      bars.onBarClick!(first.evidence, first);
      expect(onEvidence).toHaveBeenCalledWith(first.evidence);
      expect(tracked).toEqual(["chart_clicked"]);
      tracked.length = 0;
    }
  });

  it("累計格抽屜：大數字不帶「+」（水準值），末筆＝負值合計；累計佔比格：百分比，末筆 100%", () => {
    for (const name of ["refund_only", "synthetic"] as const) {
      const set = sets[name];
      const { pareto, table } = paretoTree(set, () => undefined);
      const column = (key: string) => table.columns.find(item => item.key === key)! as ChartDataColumn<string>;
      const last = table.rows.at(-1)!;
      const cumulative = drawer(set, table.evidenceOf(last, column("cumulative"))!);
      expect(bigNumber(cumulative), name).toBe(formatAmountL1(pareto.total.value));
      expect(bigNumber(cumulative), name).not.toContain("+");
      expect(cumulative, name).toContain(escapeAttr(fill(copy.pareto.drawer.cumulativeDefinition, { n: pareto.count, metric: METRIC })));
      const share = drawer(set, table.evidenceOf(last, column("share"))!);
      expect(bigNumber(share), name).toBe(formatRateL1("1.000000000000"));
      expect(bigNumber(share), name).not.toContain("+");
    }
  });

  it("審查修正：柱（與商品毛利格）的抽屜 metric_version 仍是 contribution-v1，下一行「圖表整理版本 product-pareto-v1」（值取自 domain，只經 productPareto 挑出與排序）", () => {
    const set = sets.synthetic;
    const { bars, table } = paretoTree(set, () => undefined);
    const column = table.columns.find(item => item.key === "gross_profit")! as ChartDataColumn<string>;
    for (const evidence of [bars.rows![0].evidence, table.evidenceOf(table.rows[0], column)!]) {
      const technical = element(drawer(set, evidence), 'class="evidence-technical"')!;
      expect(technical).toContain("<div><dt>metric_version</dt><dd><code>contribution-v1</code></dd></div>");
      expect(technical).toContain(`<div data-testid="evidence-arrange-version"><dt>${labels.evidence.chartsV4.arrangeVersion}</dt><dd><code>${PRODUCT_PARETO_VERSION}</code></dd></div>`);
      expect(technical.indexOf("metric_version")).toBeLessThan(technical.indexOf("evidence-arrange-version"));
    }
  });

  it("審查修正：資料表 evidence 在點擊時才組（C33 hasEvidence；面板重繪不再整表組累計與累計佔比的來源，O(n²)）；商品毛利與累計格為負時 number-link negative（H5 設計稿），累計佔比不上色", () => {
    for (const name of ["refund_only", "synthetic", "many"] as const) {
      const set = sets[name];
      const { pareto, table } = paretoTree(set, () => undefined);
      expect(table.hasEvidence, name).toBeTypeOf("function");
      for (const row of table.rows) for (const column of table.columns) expect(table.hasEvidence!(row, column), `${name} ${column.key}`).toBe(true);
      const classes = cellClasses(byTestId(byTestId(set.html, PRODUCTS_PARETO_TESTID), PRODUCTS_PARETO_TABLE_TESTID));
      expect(classes, name).toEqual(pareto.allRows.map(entry => [
        ["num", deltaTone("gross_profit", entry.value.value, "L2") === "unfavorable" ? "number-link negative" : "number-link"],
        ["num", deltaTone("gross_profit", entry.cumulative.value, "L2") === "unfavorable" ? "number-link negative" : "number-link"],
        ["num", "number-link"],
      ]));
      // 商品毛利為負的列：前兩欄全部上不利色。
      expect(classes.every(row => row[0][1] === "number-link negative" && row[1][1] === "number-link negative"), name).toBe(true);
    }
  });
});

describe("V4-4 G13 商品毛利兩期差額", () => {
  it("每段 ≤ 5 根、減少段在上（DOM 與 y 座標）、svg 高＝列數 × 16 ≤ 180；柱 testid chart-products-variance-bar-{channel}-{sku}；圖例兩項 line", () => {
    for (const name of ["demo", "golden", "synthetic"] as const) {
      const set = sets[name];
      const { worstChange, bestChange } = productHighlights(set.rows);
      const section = byTestId(set.html, PRODUCTS_VARIANCE_TESTID);
      const decrease = element(section, 'data-block="decrease"')!, increase = element(section, 'data-block="increase"')!;
      expect(barIds(decrease, "chart-products-variance-bar-"), name).toEqual(worstChange.slice(0, PRODUCT_VARIANCE_BLOCK_ROWS).map(row => `chart-products-variance-bar-${productChartKey(row)}`));
      expect(barIds(increase, "chart-products-variance-bar-"), name).toEqual(bestChange.slice(0, PRODUCT_VARIANCE_BLOCK_ROWS).map(row => `chart-products-variance-bar-${productChartKey(row)}`));
      expect(section.indexOf('data-block="decrease"'), name).toBeLessThan(section.indexOf('data-block="increase"'));
      const ys = (block: string) => [...block.matchAll(/<rect class="ranked-bar[^"]*"[^>]*\sy="([\d.]+)"/g)].map(match => Number(match[1]));
      expect(Math.max(...ys(decrease)), name).toBeLessThan(Math.min(...ys(increase)));
      const rows = Math.min(PRODUCT_VARIANCE_BLOCK_ROWS, worstChange.length) + Math.min(PRODUCT_VARIANCE_BLOCK_ROWS, bestChange.length);
      expect(openTag(section, 'class="chart-ranked-bars"'), name).toContain(`height="${rows * chartRowHeights.row16}"`);
      expect(rows * chartRowHeights.row16, name).toBeLessThanOrEqual(chartHeights.sm);
      expect(section, name).toContain(`<h4 id="products-variance-title">`);
      expect(element(section, 'class="legend"'), name).toBe(`<div class="legend"><span><i aria-hidden="true" style="background:var(--chart-unfavorable)"></i>${copy.variance.columns.decrease}</span><span><i aria-hidden="true" style="background:var(--chart-favorable)"></i>${copy.variance.columns.increase}</span></div>`);
      expect(element(section, 'class="chart-frame sm"'), name).not.toMatch(/tabindex|<button|<a\s/);
    }
    // 示範資料兩段都取滿：5＋5＝10 列 × 16＝160。
    expect(openTag(byTestId(sets.demo.html, PRODUCTS_VARIANCE_TESTID), 'class="chart-ranked-bars"')).toContain('data-rows="10"');
  });

  it("標題：有減少時「{SKU · 通路} 商品毛利少 {amount}，減少最多」（示範資料 SKU-020 · 平台 · MARKETPLACE，−30,198.96）；副標寫兩期與通路範圍", () => {
    const set = sets.demo;
    const lead = productHighlights(set.rows).worstChange[0];
    expect(lead.changes.gross_profit.value).toBe("-30198.96");
    const section = byTestId(set.html, PRODUCTS_VARIANCE_TESTID);
    expect(section).toContain(`<h4 id="products-variance-title">${escapeAttr(fill(copy.variance.title.decrease, { product: productChartLabel(lead, true), metric: METRIC, amount: formatHeadlineAmount("-30198.96") }))}</h4>`);
    expect(productChartLabel(lead, true)).toBe(fill(copy.product, { sku: "SKU-020", channel: labels.data.demoChannelAlias.MARKETPLACE }));
    expect(section).toContain(`<p class="sub" id="products-variance-sub">${escapeAttr(fill(copy.variance.subtitle, { section: fill(copy.variance.section, { metric: METRIC }), current: set.scope.current, previous: set.scope.previous, scope: set.scope.channels }))}</p>`);
  });

  it("資料表列出全部差額 < 0（由小到大）接全部差額 > 0（由大到小）：SKU · 通路｜上期｜本期｜差額（帶號）；差額 0 與待補不列", () => {
    for (const name of ["demo", "synthetic", "golden"] as const) {
      const set = sets[name];
      const all = productHighlights(set.rows, set.rows.length);
      const table = byTestId(byTestId(set.html, PRODUCTS_VARIANCE_TESTID), PRODUCTS_VARIANCE_TABLE_TESTID);
      const expected = [...all.worstChange, ...all.bestChange];
      expect(tableRows(table), name).toEqual(expected.map(row => [productChartLabel(row, set.ctx.alias), formatAmountL2(row.previous.metrics.gross_profit.value), formatAmountL2(row.current.metrics.gross_profit.value), formatSignedDelta(row.changes.gross_profit.value, "L2")]));
      expect(expected.length, name).toBe(set.rows.filter(row => row.changes.gross_profit.value !== null && Number(row.changes.gross_profit.value) !== 0).length);
    }
    // 示範資料 15 列減少、25 列增加；合成資料 6＋4（差額 0 的 2 列不列）。
    expect(tableRows(byTestId(sets.demo.html, PRODUCTS_VARIANCE_TABLE_TESTID))).toHaveLength(40);
    expect(tableRows(byTestId(sets.synthetic.html, PRODUCTS_VARIANCE_TABLE_TESTID))).toHaveLength(10);
  });

  it("沒有可畫的差額（refund_only：唯一一列差額為 0）：標題 none、圖區空狀態（不 aria-hidden）、沒有圖例與柱；product-best 照樣是 after；資料表 0 列但掛載（CL-1）", () => {
    const set = sets.refund_only;
    const section = byTestId(set.html, PRODUCTS_VARIANCE_TESTID);
    expect(section).toContain(`<h4 id="products-variance-title">${escapeAttr(fill(copy.variance.title.none, { metric: METRIC }))}</h4>`);
    expect(openTag(section, 'class="chart-frame sm"')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" data-state="empty">`);
    expect(section).toContain(`<p class="chart-frame-message">${escapeAttr(fill(copy.variance.empty, { metric: METRIC }))}</p>`);
    expect(section).not.toContain('class="legend"');
    expect(section).not.toContain("chart-products-variance-bar-");
    expect(byTestId(section, "product-best")).toBe(v43c("refund_only")!["product-best"]);
    expect(tableRows(byTestId(section, PRODUCTS_VARIANCE_TABLE_TESTID))).toEqual([]);
  });

  it("審查修正：只有一段時圖例只列那一段（記憶體 13 個 SKU 的差額全部 < 0：只有「減少最多」，沒有增加段與「增加最多」圖例）", () => {
    const section = byTestId(sets.many.html, PRODUCTS_VARIANCE_TESTID);
    expect(productHighlights(sets.many.rows).bestChange).toEqual([]);
    expect(section).toContain('data-block="decrease"');
    expect(section).not.toContain('data-block="increase"');
    expect(element(section, 'class="legend"')).toBe(`<div class="legend"><span><i aria-hidden="true" style="background:var(--chart-unfavorable)"></i>${copy.variance.columns.decrease}</span></div>`);
    expect(element(section, 'class="sec-head"')).not.toContain(copy.variance.columns.increase);
  });

  it("審查修正：資料表 evidence 在點擊時才組（hasEvidence）；只有差額格不利時 number-link negative（上期、本期格即使為負也不上色，同 H5 設計稿）", () => {
    for (const name of ["demo", "synthetic", "golden"] as const) {
      const set = sets[name];
      const all = productHighlights(set.rows, set.rows.length);
      const classes = cellClasses(byTestId(byTestId(set.html, PRODUCTS_VARIANCE_TESTID), PRODUCTS_VARIANCE_TABLE_TESTID));
      expect(classes, name).toEqual([...all.worstChange, ...all.bestChange].map(row => [["num", "number-link"], ["num", "number-link"], ["num", deltaTone("gross_profit", row.changes.gross_profit.value, "L2") === "unfavorable" ? "number-link negative" : "number-link"]]));
      expect(classes.slice(0, all.worstChange.length).every(row => row[2][1] === "number-link negative"), name).toBe(true);
      expect(classes.slice(all.worstChange.length).every(row => row[2][1] === "number-link"), name).toBe(true);
    }
    // 合成資料有本期商品毛利為負的列（SKU-203 · MARKETPLACE −1,800），本期格照樣不上色。
    expect(sets.synthetic.rows.some(row => Number(row.current.metrics.gross_profit.value) < 0)).toBe(true);
  });
});

describe("V4-4 延後渲染（useDeferredMount；390 切到商品毛利的 TBT）", () => {
  it("ready=false：兩張圖的框是同高的 loading 骨架（aria-busy、role=status）、沒有柱；資料表 <details> 只留 summary；after 的前 10 名表照常渲染（DOM 與 V4-3c 相同）", () => {
    const set = sets.synthetic;
    const pareto = paretoOf(set);
    const lists = productHighlights(set.rows), all = productHighlights(set.rows, set.rows.length);
    const worst = createElement("div", { "data-testid": "after-probe" });
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(ProductParetoSection, { pareto, model: paretoSectionModel(pareto, set.scope), scope: set.scope, onEvidence: () => undefined, after: worst, ready: false }),
      createElement(ProductVarianceSection, { model: varianceSectionModel({ decrease: lists.worstChange, increase: lists.bestChange, allDecrease: all.worstChange, allIncrease: all.bestChange }, set.scope), scope: set.scope, onEvidence: () => undefined, after: null, ready: false })));
    for (const [testId, table, prefix] of [[PRODUCTS_PARETO_TESTID, PRODUCTS_PARETO_TABLE_TESTID, PRODUCTS_PARETO_BAR_PREFIX], [PRODUCTS_VARIANCE_TESTID, PRODUCTS_VARIANCE_TABLE_TESTID, "chart-products-variance-bar-"]]) {
      const section = byTestId(html, testId);
      expect(openTag(section, "<section"), testId).toContain('aria-busy="true"');
      expect(openTag(section, 'class="chart-frame sm"'), testId).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="loading">`);
      expect(section, testId).toContain(`<p class="sr-only" role="status">${labels.overview.chartFrame.loading}</p>`);
      expect(section, testId).not.toContain(prefix);
      expect(section, testId).not.toContain(table);
      expect(element(section, '<details class="data-alternative"'), testId).toMatch(/^<details class="data-alternative"><summary>[^<]+<\/summary><\/details>$/);
    }
    expect(byTestId(html, PRODUCTS_PARETO_TESTID)).toContain('data-testid="after-probe"');
    // 面板本身在伺服器端（沒有 window）不延後：sets 的 markup 都有柱與表（上面各組測試）。
    expect(byTestId(set.html, PRODUCTS_PARETO_TESTID)).toContain(PRODUCTS_PARETO_TABLE_TESTID);
  });
});

describe("審查修正：G13、G14 標題字數與 C33 延後組 evidence", () => {
  it("標題每個子句 ≤ 14 字（{metric} 以 metricDefinitions 的商品毛利填入後計字；SKU、通路名、數字不計）：五組資料的實際標題與 none 樣板", () => {
    const aliasTerms = channelAliasTerms(labels);
    const titles = Object.values(sets).flatMap(set => [...set.html.matchAll(/<h4 id="products-(?:variance|pareto)-title">([^<]*)<\/h4>/g)].map(match => textOf(match[1])));
    expect(titles.length).toBeGreaterThanOrEqual(8);
    titles.push(fill(copy.variance.title.none, { metric: METRIC }));
    for (const title of titles) expect(l1ClauseLengths(title, aliasTerms).every(length => length <= L1_MAX_CJK), `${title}：${l1ClauseLengths(title, aliasTerms).join(",")}`).toBe(true);
    expect(byTestId(sets.refund_only.html, PRODUCTS_VARIANCE_TESTID)).toContain(`<h4 id="products-variance-title">${escapeAttr(fill(copy.variance.title.none, { metric: METRIC }))}</h4>`);
  });

  it("C33 hasEvidence：渲染時不呼叫 evidenceOf，點擊時才呼叫並交給 onEvidence；沒給 hasEvidence 時照舊在渲染時逐格呼叫；不利格的 .negative 在按鈕上（number-link）或格上（純文字）", () => {
    type Row = { id: string; value: string };
    const rows: Row[] = [{ id: "a", value: "-12.00" }, { id: "b", value: "30.00" }];
    const columns: ChartDataColumn<"v">[] = [{ key: "v", label: "v", unit: "money", layer: "L2", data: "v" }];
    const evidence = { title: "t", name: "gross_profit", metric: { value: "-12.00", reason_codes: [] }, period: sets.golden.ctx.current, channels: [], sources: [] } as EvidenceSelection;
    const evidenceOf = vi.fn<(row: Row) => EvidenceSelection>(() => evidence);
    const onEvidence = vi.fn<(selected: EvidenceSelection) => void>();
    const props: ChartDataTableProps<Row, "v"> = { testId: "t", caption: "c", rowHeaderLabel: "r", rows, rowKey: row => row.id, rowHeader: row => ({ label: row.id }), columns, valueOf: row => ({ value: row.value, unfavorable: Number(row.value) < 0 }), evidenceOf, onEvidence };
    const lazy = renderToStaticMarkup(createElement(ChartDataTable<Row, "v">, { ...props, hasEvidence: row => row.id === "a" }));
    expect(evidenceOf).not.toHaveBeenCalled();
    expect(cellClasses(lazy)).toEqual([[["num", "number-link negative"]], [["num", null]]]);
    const buttons = findElements(ChartDataTable({ ...props, hasEvidence: row => row.id === "a" }), item => item.type === "button");
    expect(buttons).toHaveLength(1);
    (buttons[0].props.onClick as () => void)();
    expect(evidenceOf).toHaveBeenCalledTimes(1);
    expect(evidenceOf.mock.calls[0][0]).toBe(rows[0]);
    expect(onEvidence).toHaveBeenCalledWith(evidence);
    evidenceOf.mockClear();
    const eager = renderToStaticMarkup(createElement(ChartDataTable<Row, "v">, { ...props, evidenceOf: row => { evidenceOf(row); return row.id === "a" ? null : evidence; } }));
    expect(evidenceOf).toHaveBeenCalledTimes(2);
    expect(cellClasses(eager)).toEqual([[["num negative", null]], [["num", "number-link"]]]);
  });
});
