import { PRODUCT_PARETO_VERSION, type ProductPareto, type ProductParetoEntry } from "@/application/chart-pareto";
import { categoryLabel } from "@/application/copy";
import type { NameResolver } from "@/application/channel-settings";
import type { EvidenceFilter } from "@/application/evidence-filter";
import { metricDefinitions } from "@/application/presentation";
import { uniqueSources } from "@/domain/aggregation";
import type { ProductComparisonRow } from "@/domain/product-comparison";
import type { Period, ProductMetrics } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";

// V4-4 代理 A（PRD §6.4「商品抽屜 builder」、§8.7；CHART_CATALOG §5 商品頁、G13、G14 抽屜）：商品頁「計算與來源」的 payload builder。
// productEvidence、productDeltaEvidence 由 src/components/product-comparison-panel.tsx 的 metricLink、deltaLink 閉包抽出，只搬移：
// 同一列、同一期、同一指標，抽出前後的 EvidenceSelection 逐欄相同（tests/product-evidence.test.tsx 以凍結的舊閉包邏輯與面板實際點擊結果比對）。
// 圖（G13 條、G14 條與商品毛利格）、前 10 名表（product-worst、product-best）、完整表都呼叫同一個 builder（PRD §2.2 C7）。
// 既有表格的 number-link 不帶 filter（payload 與 v3 相同）；圖上的點擊另以 options.drill 加 filter { channel, sku }（PRD §8.7 G13、G14：filter.sku（含通路）），
// 抽屜顯示「篩選：通路 · 商品 SKU」片語；商品層證據都帶 sku，所以 filter.sku 合法（src/application/evidence-filter.ts 的 evidenceFilterError）。
// G14 的累計格與累計佔比格另有兩個 builder（值取自 productPareto，product-pareto-v1）；所有使用者看得到的字由呼叫端以 labels 組好傳入，這裡不寫中文字串。

/** R4：ProductMetrics 多了件數（非金額）；金額／比率欄另列，件數欄單獨處理。 */
export type ProductMoneyMetric = Exclude<keyof ProductMetrics, "units_sold">;

const copy = labels.products.comparison;
/** 兩期各自的「有無資料」說明（抽屜範圍行用）。 */
export const productPresenceLabels: Record<ProductComparisonRow["previous"]["presence"], string> = {
  observed: copy.presence.observed, no_rows_confirmed: copy.presence.noRowsConfirmed, unknown_coverage: copy.presence.unknownCoverage,
};
/** 「淨營收差額」「商品毛利差額」：指標名＋差額後綴，與 CSV 標題同源。 */
export const productChangeLabel = (name: ProductMoneyMetric) => `${metricDefinitions[name].label}${labels.exports.csv.suffix.change}`;
/** 抽屜範圍行的品類：空品類寫「未填」，示範資料套品類別名。 */
export const productCategoryText = (value: string, resolver: NameResolver) => value ? categoryLabel(value, resolver) : copy.blankCategoryShort;

/** builder 需要的頁面範圍：商品比較的兩期（compareProducts(...).scope 的 previous_period、current_period）與通路名稱解析器（snapshotResolver(snapshot)）。 */
export interface ProductEvidenceContext {
  previous: Period;
  current: Period;
  resolver: NameResolver;
}
export interface ProductEvidenceOptions {
  /** 圖上的點擊（G13 條、G14 條與商品毛利格）：加 filter { channel, sku }。既有表格的 number-link 不傳。 */
  drill?: boolean;
}
/** 圖上點擊下鑽的篩選條件：該列的通路與商品代碼（只過濾原始明細，不重算）。 */
export const productEvidenceFilter = (row: Pick<ProductComparisonRow, "channel" | "sku">): EvidenceFilter => ({ channel: row.channel, sku: row.sku });
const drill = (row: ProductComparisonRow, options: ProductEvidenceOptions) => options.drill ? { filter: productEvidenceFilter(row) } : {};

/** 金額／比率格（某一期、某一指標）的「計算與來源」：原 metricLink 的 onEvidence payload。label 是表頭用的指標名（短名或全名，寫進抽屜標題）。 */
export function productEvidence(row: ProductComparisonRow, period: "previous" | "current", name: ProductMoneyMetric, label: string, ctx: ProductEvidenceContext, options: ProductEvidenceOptions = {}): EvidenceSelection {
  const value = row[period];
  const metric = value.metrics[name];
  const periodLabel = labels.shell.periods[period];
  return { sku: row.sku, title: fill(copy.evidenceTitle, { sku: row.sku, period: periodLabel, label }), name, metric, period: period === "previous" ? ctx.previous : ctx.current, channels: [row.channel], sources: value.sources, scopeLabel: fill(copy.scopeLabel, { sku: row.sku, category: productCategoryText(row.category, ctx.resolver), presence: productPresenceLabels[value.presence] }), ...drill(row, options) };
}

/** 兩期差額格（淨營收差額、商品毛利差額）的「計算與來源」：原 deltaLink 的 onEvidence payload（組成項目是上期、本期兩項）。 */
export function productDeltaEvidence(row: ProductComparisonRow, name: "net_revenue" | "gross_profit", ctx: ProductEvidenceContext, options: ProductEvidenceOptions = {}): EvidenceSelection {
  const metric = row.changes[name];
  const label = productChangeLabel(name);
  const { previous, current } = ctx;
  return { sku: row.sku, title: fill(copy.deltaEvidenceTitle, { sku: row.sku, label }), name, metric, period: { start: previous.start, end: current.end }, channels: [row.channel],
    sources: uniqueSources([...row.previous.sources, ...row.current.sources]),
    scopeLabel: fill(copy.deltaScopeLabel, { sku: row.sku, category: productCategoryText(row.category, ctx.resolver), previousStart: previous.start, previousEnd: previous.end, previousPresence: productPresenceLabels[row.previous.presence], currentStart: current.start, currentEnd: current.end, currentPresence: productPresenceLabels[row.current.presence] }),
    formula: fill(copy.deltaFormula, { label, metric: metricDefinitions[name].label, formula: metricDefinitions[name].formula }),
    components: [{ label: fill(copy.periodRange, { period: labels.shell.periods.previous, start: previous.start, end: previous.end }), metric: row.previous.metrics[name] }, { label: fill(copy.periodRange, { period: labels.shell.periods.current, start: current.start, end: current.end }), metric: row.current.metrics[name] }],
    ...drill(row, options),
  };
}

/** G14 累計格的抽屜文字（呼叫端以 products.chartsV4.pareto.* 組好）。definition、formulaTechnical 沒給時沿用商品毛利的定義與技術公式（累計仍是商品毛利）。 */
export interface ProductParetoCumulativeText {
  /** 抽屜標題（例如第 i 列的「前 i 個商品毛利為負的累計」）。 */
  title: string;
  /** 計算方式（逐項相加）。 */
  formula: string;
  /** 組成項目每列的名稱（例如「SKU · 通路」）。 */
  componentLabel: (row: ProductComparisonRow) => string;
  scopeLabel?: string;
  definition?: string;
  formulaTechnical?: string;
}
/** G14 累計佔比格的抽屜文字（D-V4-32＝A：unitOverride percent）。name 只借商品毛利的單位與來源檔，所以定義與技術算式一定由證據自帶。 */
export interface ProductParetoShareText {
  title: string;
  formula: string;
  definition: string;
  formulaTechnical: string;
  /** 組成項目：分子（取反後的累計）與分母（取反後的負值合計）的名稱。 */
  numeratorLabel: string;
  denominatorLabel: string;
  scopeLabel?: string;
}

function paretoEntry(pareto: Pick<ProductPareto, "allRows">, index: number): ProductParetoEntry {
  if (!Number.isSafeInteger(index) || index < 0 || index >= pareto.allRows.length) throw new RangeError("INVALID_PRODUCT_PARETO_INDEX");
  return pareto.allRows[index];
}
/** 涉及的通路（代碼字典序，去重）與各列本期來源的聯集（uniqueSources）。 */
function involved(entries: readonly ProductParetoEntry[]) {
  return {
    channels: [...new Set(entries.map(entry => entry.row.channel))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
    sources: uniqueSources(entries.flatMap(entry => entry.row.current.sources)),
  };
}

/**
 * G14 資料表「累計」格（allRows 第 index 筆，0 起算）的「計算與來源」（CHART_CATALOG G14 抽屜；PRD §8.7 第 3、4 點）：
 * 值是 productPareto 的累計（product-pareto-v1），水準值（valueKind level，抽屜大數字不帶「+」）；組成是前 index＋1 個商品的本期商品毛利；
 * 期間本期、通路是涉及的通路、來源是那些列的本期來源聯集。不帶 sku（跨多個商品）；有 components，所以抽屜不畫四層階梯。
 */
export function productParetoCumulativeEvidence(pareto: Pick<ProductPareto, "allRows">, index: number, ctx: ProductEvidenceContext, text: ProductParetoCumulativeText): EvidenceSelection {
  const entry = paretoEntry(pareto, index);
  const entries = pareto.allRows.slice(0, index + 1);
  return {
    title: text.title, name: "gross_profit", metric: entry.cumulative, period: ctx.current, ...involved(entries),
    formula: text.formula, components: entries.map(item => ({ label: text.componentLabel(item.row), metric: item.value })),
    valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION,
    ...(text.scopeLabel === undefined ? {} : { scopeLabel: text.scopeLabel }),
    ...(text.definition === undefined ? {} : { definition: text.definition }),
    ...(text.formulaTechnical === undefined ? {} : { formulaTechnical: text.formulaTechnical }),
  };
}

/**
 * G14 資料表「累計佔比」格的「計算與來源」（D-V4-32＝A；同 G10 每 100 元、管理損益表佔淨營收 % 的 unitOverride percent）：
 * 值是 productPareto 的累計佔比（取反後的累計 ÷ 取反後的負值合計，ratioMetric 12 位小數）；組成是分子與分母兩個金額（到分，正的負值額）；
 * 水準值不帶正負號；版本 product-pareto-v1。分母涵蓋全部負值列，所以通路與來源取全部負值列。
 */
export function productParetoShareEvidence(pareto: Pick<ProductPareto, "allRows" | "totalMagnitude">, index: number, ctx: ProductEvidenceContext, text: ProductParetoShareText): EvidenceSelection {
  const entry = paretoEntry(pareto, index);
  return {
    title: text.title, name: "gross_profit", metric: entry.share, period: ctx.current, ...involved(pareto.allRows),
    unitOverride: "percent", valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION,
    formula: text.formula, definition: text.definition, formulaTechnical: text.formulaTechnical,
    components: [{ label: text.numeratorLabel, metric: entry.magnitude }, { label: text.denominatorLabel, metric: pareto.totalMagnitude }],
    ...(text.scopeLabel === undefined ? {} : { scopeLabel: text.scopeLabel }),
  };
}
