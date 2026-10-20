import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PRODUCT_PARETO_LIMIT, PRODUCT_PARETO_VERSION, productPareto } from "@/application/chart-pareto";
import { categoryLabel, channelLabel, snapshotResolver } from "@/application/copy";
import { makeResolver, type NameResolver } from "@/application/channel-settings";
import { evidenceFilterError, scopedEvidenceFilter } from "@/application/evidence-filter";
import { formatAmountL1, formatAmountL3, formatRateL1, formatRateL3, metricDefinitions } from "@/application/presentation";
import { productHighlights } from "@/application/product-highlights";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { EvidenceDrawer, type EvidenceSelection } from "@/components/evidence-drawer";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import { productChangeLabel, productDeltaEvidence, productEvidence, productEvidenceFilter, productParetoCumulativeEvidence, productParetoShareEvidence, type ProductEvidenceContext, type ProductMoneyMetric, type ProductParetoCumulativeText, type ProductParetoShareText } from "@/components/product-evidence";
import { uniqueSources } from "@/domain/aggregation";
import { compareProducts, selectProductComparisonRows, type ProductComparisonRow } from "@/domain/product-comparison";
import { PRODUCT_METRICS, type Dataset, type DatasetInput, type Period } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-4 代理 A（PRD §6.4「商品抽屜 builder」；CHART_CATALOG §5 商品頁、G13、G14 抽屜）：
 * product-comparison-panel.tsx 的 metricLink、deltaLink 閉包抽成 src/components/product-evidence.ts 的 productEvidence、productDeltaEvidence，只搬移。
 * 證明「抽出前後 EvidenceSelection 相同」用兩種方式：
 *   1. 凍結的舊閉包邏輯（下方 legacy*，逐字照抄 4320290 版 product-comparison-panel.tsx 第 163–195 行的 onEvidence payload，只把閉包捕捉的變數改成參數）
 *      對每個資料集、每列、兩期、每個金額／比率指標、兩種表頭名，與 builder 的輸出 toStrictEqual；
 *   2. 面板實際點擊：沿用 tests/pnl-table-ui.test.tsx 的 hooks harness（沒有 DOM 套件；直接呼叫元件函式取得元素樹，再呼叫 number-link 的 onClick），
 *      前 10 名兩表與完整表（開「更多欄位」）每個金額／比率／差額格的 payload 依 DOM 順序與凍結邏輯 toStrictEqual（件數格 unitOverride=count 不在搬移範圍，略過）。
 * 另驗 G14 累計格、累計佔比格的 builder（product-pareto-v1）與抽屜 SSR：累計的大數字不帶「+」、佔比用 unitOverride percent。
 * 圖表字串（products.chartsV4.pareto.*）由代理 C 新增；這裡的 builder 只收呼叫端組好的字，測試用 ASCII 佔位字。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = hooks.states[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { hooks.states[index] = value; hooks.dirty = true; }
      };
      return [hooks.states[index], set];
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.refCursor++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useCallback: (callback: unknown, deps: readonly unknown[]) => hooks.active ? callback : actual.useCallback(callback as () => void, deps),
    useId: () => hooks.active ? ":test:" : actual.useId(),
    useEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useEffect(effect, deps),
    useLayoutEffect: (effect: () => void, deps?: readonly unknown[]) => hooks.active ? undefined : actual.useLayoutEffect(effect, deps),
    // 頁首插槽：沒有 DOM，取伺服器端的值（null），匯出選單渲染在面板內（與 SSR 相同）。
    useSyncExternalStore: (subscribe: () => () => void, getSnapshot: () => unknown, getServerSnapshot?: () => unknown) => hooks.active ? (getServerSnapshot ?? getSnapshot)() : actual.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  };
});
afterEach(() => { hooks.active = false; hooks.states = []; hooks.refs = []; });

type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.refs = [];
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; hooks.refCursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    return tree;
  };
}
const isElement = (node: unknown): node is TreeElement => node !== null && typeof node === "object" && "props" in node && "type" in node;
/** 走訪元素樹：children 之外也走每個是元素的 prop（例如 ChartFrame 的 after、aside），所以表格搬進圖框的 after 後仍找得到。 */
function findAll(node: unknown, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (isElement(node)) {
    if (match(node)) found.push(node);
    for (const value of Object.values(node.props)) if (Array.isArray(value) || isElement(value)) findAll(value, match, found);
  }
  return found;
}
const byTestId = (node: ReactNode, testid: string) => { const [item] = findAll(node, element => element.props["data-testid"] === testid); expect(item, testid).toBeDefined(); return item; };
const isNumberLink = (element: TreeElement) => element.type === "button" && String(element.props.className ?? "").split(" ").includes("number-link");
/** 容器內每個 number-link 依 DOM 順序點一次，收集 onEvidence 的 payload（件數格 unitOverride=count 不在本批搬移範圍，略過）。 */
function clickAll(container: TreeElement, onEvidence: ReturnType<typeof vi.fn<(evidence: EvidenceSelection) => void>>): EvidenceSelection[] {
  const captured: EvidenceSelection[] = [];
  for (const button of findAll(container, isNumberLink)) {
    onEvidence.mockClear();
    (button.props.onClick as () => void)();
    expect(onEvidence).toHaveBeenCalledTimes(1);
    captured.push(onEvidence.mock.lastCall![0]);
  }
  return captured.filter(evidence => evidence.unitOverride !== "count");
}

// ── 凍結的舊閉包邏輯（4320290 版 product-comparison-panel.tsx；不可改成呼叫 builder）。
const copy = labels.products.comparison;
const legacyPresence: Record<ProductComparisonRow["previous"]["presence"], string> = { observed: copy.presence.observed, no_rows_confirmed: copy.presence.noRowsConfirmed, unknown_coverage: copy.presence.unknownCoverage };
const legacyChangeLabel = (name: ProductMoneyMetric) => `${metricDefinitions[name].label}${labels.exports.csv.suffix.change}`;
type LegacyScope = { previous: Period; current: Period; resolver: NameResolver };
function legacyMetric(row: ProductComparisonRow, period: "previous" | "current", name: ProductMoneyMetric, label: string, { previous, current, resolver }: LegacyScope): EvidenceSelection {
  const categoryText = (value: string) => value ? categoryLabel(value, resolver) : copy.blankCategoryShort;
  const value = row[period];
  const metric = value.metrics[name];
  const periodLabel = labels.shell.periods[period];
  return { sku: row.sku, title: fill(copy.evidenceTitle, { sku: row.sku, period: periodLabel, label }), name, metric, period: period === "previous" ? previous : current, channels: [row.channel], sources: value.sources, scopeLabel: fill(copy.scopeLabel, { sku: row.sku, category: categoryText(row.category), presence: legacyPresence[value.presence] }) };
}
function legacyDelta(row: ProductComparisonRow, name: "net_revenue" | "gross_profit", { previous, current, resolver }: LegacyScope): EvidenceSelection {
  const categoryText = (value: string) => value ? categoryLabel(value, resolver) : copy.blankCategoryShort;
  const metric = row.changes[name];
  const label = legacyChangeLabel(name);
  return { sku: row.sku, title: fill(copy.deltaEvidenceTitle, { sku: row.sku, label }), name, metric, period: { start: previous.start, end: current.end }, channels: [row.channel],
    sources: uniqueSources([...row.previous.sources, ...row.current.sources]),
    scopeLabel: fill(copy.deltaScopeLabel, { sku: row.sku, category: categoryText(row.category), previousStart: previous.start, previousEnd: previous.end, previousPresence: legacyPresence[row.previous.presence], currentStart: current.start, currentEnd: current.end, currentPresence: legacyPresence[row.current.presence] }),
    formula: fill(copy.deltaFormula, { label, metric: metricDefinitions[name].label, formula: metricDefinitions[name].formula }),
    components: [{ label: fill(copy.periodRange, { period: labels.shell.periods.previous, start: previous.start, end: previous.end }), metric: row.previous.metrics[name] }, { label: fill(copy.periodRange, { period: labels.shell.periods.current, start: current.start, end: current.end }), metric: row.current.metrics[name] }],
  };
}

type Loaded = { name: string; dataset: Dataset; snapshot: WorkspaceSnapshot; rows: ProductComparisonRow[]; ctx: ProductEvidenceContext };
async function load(name: string, input: DatasetInput): Promise<Loaded> {
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  const comparison = compareProducts(dataset, snapshot.report.scope);
  return { name, dataset, snapshot, rows: comparison.rows, ctx: { previous: comparison.scope.previous_period, current: comparison.scope.current_period, resolver: snapshotResolver(snapshot) } };
}
/**
 * 兩期有無資料不同、空品類（上面 5 個資料集每列兩期的 presence 都相同、都有品類，測不到範圍行的 previousPresence／currentPresence 與「未填」品類）：
 * golden 改銷售檔：DTC/A 兩期都有；DTC/GONE 只在上期；MARKETPLACE/NEW 只在本期且品類空白。confirmed＝false 時沒有列的那一期是「範圍未確認」。
 */
function presenceInput(confirmed: boolean): DatasetInput {
  const input = fixture();
  input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: confirmed };
  input.files["sales_daily.csv"] = [
    "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency",
    "2026-08-01,DTC,A,HOME,2,1000.00,100.00,0.00,400.00,TWD", "2026-08-02,DTC,A,HOME,3,1400.00,210.00,70.00,580.00,TWD",
    "2026-08-01,DTC,GONE,CARE,1,500.00,0.00,50.00,200.00,TWD", "2026-08-02,MARKETPLACE,NEW,,1,500.00,100.00,50.00,225.00,TWD",
  ].join("\n") + "\n";
  return input;
}
let sets: Loaded[];
let synthetic: Loaded;
let refundOnly: Loaded;
beforeAll(async () => {
  sets = await Promise.all([
    load("demo", fixture("demo")), load("golden", fixture("golden")), load("refund_only", fixture("refund_only")), load("missing_cogs", fixture("errors/missing_cogs")), load("synthetic-4-channel", synthetic4ChannelInput()),
    load("presence-confirmed", presenceInput(true)), load("presence-unconfirmed", presenceInput(false)),
  ]);
  synthetic = sets.find(set => set.name === "synthetic-4-channel")!;
  refundOnly = sets.find(set => set.name === "refund_only")!;
});

describe("V4-4 商品抽屜 builder：只搬移（與凍結的舊閉包逐欄相同）", () => {
  it("示範資料套別名；合成資料不套（ctx.resolver 取自 snapshotResolver）", () => {
    expect(sets.find(set => set.name === "demo")!.ctx.resolver.channel("DTC")).toBe(labels.data.demoChannelAlias.DTC);
    expect(synthetic.ctx.resolver.channel(synthetic.dataset.manifest.channels[0])).toBe(synthetic.dataset.manifest.channels[0]);
  });

  it("比對的資料集涵蓋兩期 presence 不同（已確認沒有列、範圍未確認）與空品類，範圍行的上期、本期說明與「未填」品類都被比到", () => {
    const presence = (name: string) => sets.find(set => set.name === name)!.rows.map(row => `${row.channel}/${row.sku}:${row.previous.presence}>${row.current.presence}:${row.category}`);
    expect(presence("presence-confirmed")).toEqual(["DTC/A:observed>observed:HOME", "DTC/GONE:observed>no_rows_confirmed:CARE", "MARKETPLACE/NEW:no_rows_confirmed>observed:"]);
    expect(presence("presence-unconfirmed")).toEqual(["DTC/A:observed>observed:HOME", "DTC/GONE:observed>unknown_coverage:CARE", "MARKETPLACE/NEW:unknown_coverage>observed:"]);
  });

  it("productEvidence：每個資料集 × 每列 × 兩期 × 每個金額／比率指標 × 短名與全名，toStrictEqual 舊 metricLink 的 payload", () => {
    let checked = 0;
    for (const set of sets) {
      for (const row of set.rows) for (const period of ["previous", "current"] as const) for (const name of PRODUCT_METRICS) for (const label of [metricDefinitions[name].shortLabel, metricDefinitions[name].label]) {
        expect(productEvidence(row, period, name, label, set.ctx), `${set.name} ${row.channel}/${row.sku} ${period} ${name}`).toStrictEqual(legacyMetric(row, period, name, label, set.ctx));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("productDeltaEvidence：每個資料集 × 每列 × 淨營收差額與商品毛利差額，toStrictEqual 舊 deltaLink 的 payload（含上期、本期兩項組成）", () => {
    for (const set of sets) for (const row of set.rows) for (const name of ["net_revenue", "gross_profit"] as const) {
      const evidence = productDeltaEvidence(row, name, set.ctx);
      expect(evidence, `${set.name} ${row.channel}/${row.sku} ${name}`).toStrictEqual(legacyDelta(row, name, set.ctx));
      expect(evidence.filter).toBeUndefined();
    }
    expect(productChangeLabel("gross_profit")).toBe(legacyChangeLabel("gross_profit"));
  });

  it("面板實際點擊（前 10 名兩表、完整表開「更多欄位」）：每個金額／比率／差額格的 payload 依 DOM 順序與凍結邏輯相同，都不帶 filter", () => {
    const short = (name: ProductMoneyMetric) => metricDefinitions[name].shortLabel;
    for (const set of sets) {
      const onEvidence = vi.fn<(evidence: EvidenceSelection) => void>();
      const render = mount(ProductComparisonPanel);
      const tree = render({ dataset: set.dataset, snapshot: set.snapshot, onEvidence, initial: { moreColumns: true } });
      const { worstCurrent, bestChange } = productHighlights(set.rows);
      const rank = (list: ProductComparisonRow[]) => list.flatMap(row => [legacyMetric(row, "current", "gross_profit", short("gross_profit"), set.ctx), legacyDelta(row, "gross_profit", set.ctx)]);
      expect(clickAll(byTestId(tree, "product-worst"), onEvidence), `${set.name} worst`).toStrictEqual(rank(worstCurrent));
      expect(clickAll(byTestId(tree, "product-best"), onEvidence), `${set.name} best`).toStrictEqual(rank(bestChange));
      const tableRows = selectProductComparisonRows(set.rows, { category: "", query: "", negativeOnly: false, sort: "gross_profit_change", direction: "ascending" });
      const full = tableRows.flatMap(row => [
        legacyMetric(row, "current", "net_revenue", short("net_revenue"), set.ctx), legacyMetric(row, "current", "gross_profit", short("gross_profit"), set.ctx), legacyMetric(row, "current", "gross_margin", short("gross_margin"), set.ctx),
        legacyDelta(row, "gross_profit", set.ctx), legacyDelta(row, "net_revenue", set.ctx),
        legacyMetric(row, "previous", "net_revenue", metricDefinitions.net_revenue.label, set.ctx), legacyMetric(row, "previous", "gross_profit", metricDefinitions.gross_profit.label, set.ctx),
        ...(["cogs_net", "discounts", "refunds"] as const).map(name => legacyMetric(row, "current", name, short(name), set.ctx)),
        ...(["cogs_net", "gross_margin", "discounts", "refunds"] as const).map(name => legacyMetric(row, "previous", name, short(name), set.ctx)),
      ]);
      const captured = clickAll(byTestId(tree, "product-table"), onEvidence);
      expect(captured.length, set.name).toBe(tableRows.length * 14);
      expect(captured, `${set.name} full table`).toStrictEqual(full);
    }
  });

  it("圖上的點擊（options.drill）：只多 filter { channel, sku }，其餘欄位與表格相同；filter.sku 與商品層證據合法（抽屜不拿掉 sku 條件）", () => {
    const row = synthetic.rows.find(item => item.channel === "MARKETPLACE" && item.sku === "SKU-201")!;
    const bar = productEvidence(row, "current", "gross_profit", metricDefinitions.gross_profit.shortLabel, synthetic.ctx, { drill: true });
    expect(bar).toStrictEqual({ ...legacyMetric(row, "current", "gross_profit", metricDefinitions.gross_profit.shortLabel, synthetic.ctx), filter: { channel: "MARKETPLACE", sku: "SKU-201" } });
    const delta = productDeltaEvidence(row, "gross_profit", synthetic.ctx, { drill: true });
    expect(delta).toStrictEqual({ ...legacyDelta(row, "gross_profit", synthetic.ctx), filter: { channel: "MARKETPLACE", sku: "SKU-201" } });
    for (const evidence of [bar, delta]) {
      expect(evidenceFilterError(evidence)).toBeNull();
      expect(scopedEvidenceFilter(evidence)).toEqual({ channel: "MARKETPLACE", sku: "SKU-201" });
    }
    expect(productEvidenceFilter(row)).toEqual({ channel: "MARKETPLACE", sku: "SKU-201" });
    expect(productEvidence(row, "current", "gross_profit", metricDefinitions.gross_profit.shortLabel, synthetic.ctx, { drill: false })).toStrictEqual(legacyMetric(row, "current", "gross_profit", metricDefinitions.gross_profit.shortLabel, synthetic.ctx));
  });
});

// ── G14 累計格、累計佔比格（product-pareto-v1）。
const cumulativeText = (index: number): ProductParetoCumulativeText => ({ title: `CUMULATIVE-${index + 1}`, formula: "CUMULATIVE-FORMULA", componentLabel: row => `${row.sku} / ${channelLabel(row.channel, makeResolver({}, ""))}` });
const shareText = (index: number): ProductParetoShareText => ({ title: `SHARE-${index + 1}`, formula: "SHARE-FORMULA", definition: "SHARE-DEFINITION", formulaTechnical: "SHARE-TECHNICAL", numeratorLabel: "SHARE-NUMERATOR", denominatorLabel: "SHARE-DENOMINATOR" });
const drawer = (set: Loaded, evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset: set.dataset, snapshot: set.snapshot, evidence, onClose: () => undefined }));
const between = (html: string, from: string, to: string) => { const start = html.indexOf(from); return html.slice(start, html.indexOf(to, start)); };
const bigNumber = (html: string) => /<p class="number">([^<]*)<\/p>/.exec(html)![1];
const preciseOf = (html: string) => /data-testid="evidence-precise-value">([^<]*)<\/p>/.exec(html)![1];
const componentRows = (html: string) => [...between(html, 'class="evidence-section evidence-components"', "</section>").matchAll(/<th scope="row">([^<]*)<\/th><td class="num">([^<]*)<\/td>/g)].map(match => [match[1], match[2]]);
const technicalOf = (html: string) => between(html, '<details class="evidence-technical">', "</details>");

describe("V4-4 G14 累計格的抽屜（productParetoCumulativeEvidence）", () => {
  it("合成資料第 3 筆：累計 −7,240.00（−3,400 − 2,040 − 1,800）、組成前 3 個商品、本期、涉及通路 MARKETPLACE 與 SOCIAL、來源是 3 列本期來源的聯集；水準值、product-pareto-v1", () => {
    const pareto = productPareto(synthetic.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    const evidence = productParetoCumulativeEvidence(pareto, 2, synthetic.ctx, cumulativeText(2));
    const first3 = pareto.allRows.slice(0, 3);
    expect(evidence).toStrictEqual({
      title: "CUMULATIVE-3", name: "gross_profit", metric: { value: "-7240.00", reason_codes: [] }, period: synthetic.snapshot.report.current.period,
      channels: ["MARKETPLACE", "SOCIAL"], sources: uniqueSources(first3.flatMap(entry => entry.row.current.sources)),
      formula: "CUMULATIVE-FORMULA",
      components: [
        { label: "SKU-201 / MARKETPLACE", metric: { value: "-3400.00", reason_codes: [] } },
        { label: "SKU-301 / SOCIAL", metric: { value: "-2040.00", reason_codes: [] } },
        { label: "SKU-203 / MARKETPLACE", metric: { value: "-1800.00", reason_codes: [] } },
      ],
      valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION,
    });
    expect(evidence.sku).toBeUndefined();
    expect(evidence.filter).toBeUndefined();
    // 末筆累計＝負值合計 −8,940.00，組成 5 個商品。
    const last = productParetoCumulativeEvidence(pareto, 4, synthetic.ctx, cumulativeText(4));
    expect(last.metric).toEqual(pareto.total);
    expect(last.components).toHaveLength(5);
    // 選填的範圍行、定義與技術算式有給才帶。
    expect(productParetoCumulativeEvidence(pareto, 0, synthetic.ctx, { ...cumulativeText(0), scopeLabel: "SCOPE", definition: "DEFINITION", formulaTechnical: "TECHNICAL" })).toMatchObject({ scopeLabel: "SCOPE", definition: "DEFINITION", formulaTechnical: "TECHNICAL" });
    for (const index of [-1, 5, 1.5]) expect(() => productParetoCumulativeEvidence(pareto, index, synthetic.ctx, cumulativeText(0))).toThrow(RangeError);
  });

  it("抽屜 SSR：大數字與精確值不帶「+」、沒有取位說明、不畫四層階梯；組成三列到分；metric_version product-pareto-v1；原始明細 17＋17＋3＝37 列銷售列", () => {
    const pareto = productPareto(synthetic.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    const html = drawer(synthetic, productParetoCumulativeEvidence(pareto, 2, synthetic.ctx, cumulativeText(2)));
    expect(bigNumber(html)).toBe(formatAmountL1("-7240.00"));
    expect(bigNumber(html)).not.toContain("+");
    expect(preciseOf(html)).toBe(fill(labels.format.units.yuan, { value: formatAmountL3("-7240.00") }));
    expect(preciseOf(html)).not.toContain("+");
    expect(html).not.toContain("evidence-rounding-note");
    expect(html).not.toContain("ladder-table");
    expect(html).toContain('<p class="evidence-formula">CUMULATIVE-FORMULA</p>');
    expect(componentRows(html)).toEqual([["SKU-201 / MARKETPLACE", formatAmountL3("-3400.00")], ["SKU-301 / SOCIAL", formatAmountL3("-2040.00")], ["SKU-203 / MARKETPLACE", formatAmountL3("-1800.00")]]);
    expect(technicalOf(html)).toContain(`<div><dt>metric_version</dt><dd><code>${PRODUCT_PARETO_VERSION}</code></dd></div>`);
    expect(html.match(/class="evidence-fileline">sales_daily\.csv:\d+<\/span>/g)).toHaveLength(37);
    expect(html).not.toMatch(/class="evidence-fileline">(channel_costs_daily|ad_spend_daily)\.csv:/);
    expect(html).not.toContain('data-testid="evidence-filter"');
  });

  it("refund_only：唯一一筆的累計 −60.00＝負值合計，抽屜大數字不帶「+」", () => {
    const pareto = productPareto(refundOnly.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    const evidence = productParetoCumulativeEvidence(pareto, 0, refundOnly.ctx, cumulativeText(0));
    expect(evidence.metric).toEqual({ value: "-60.00", reason_codes: [] });
    expect(evidence.channels).toEqual(["DTC"]);
    const html = drawer(refundOnly, evidence);
    expect(bigNumber(html)).toBe(formatAmountL1("-60.00"));
    expect(bigNumber(html)).not.toContain("+");
  });
});

describe("V4-4 G14 累計佔比格的抽屜（productParetoShareEvidence；D-V4-32＝A）", () => {
  it("合成資料第 3 筆：佔比 0.809843400447（7,240 ÷ 8,940）、unitOverride percent、水準值、product-pareto-v1；組成是取反後的累計與負值合計；通路與來源取全部負值列", () => {
    const pareto = productPareto(synthetic.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    const evidence = productParetoShareEvidence(pareto, 2, synthetic.ctx, shareText(2));
    expect(evidence).toStrictEqual({
      title: "SHARE-3", name: "gross_profit", metric: { value: "0.809843400447", reason_codes: [] }, period: synthetic.snapshot.report.current.period,
      channels: ["MARKETPLACE", "SOCIAL"], sources: uniqueSources(pareto.allRows.flatMap(entry => entry.row.current.sources)),
      unitOverride: "percent", valueKind: "level", metricVersion: PRODUCT_PARETO_VERSION,
      formula: "SHARE-FORMULA", definition: "SHARE-DEFINITION", formulaTechnical: "SHARE-TECHNICAL",
      components: [{ label: "SHARE-NUMERATOR", metric: { value: "7240.00", reason_codes: [] } }, { label: "SHARE-DENOMINATOR", metric: { value: "8940.00", reason_codes: [] } }],
    });
    expect(productParetoShareEvidence(pareto, 4, synthetic.ctx, shareText(4)).metric).toEqual({ value: "1.000000000000", reason_codes: [] });
    expect(() => productParetoShareEvidence(pareto, 5, synthetic.ctx, shareText(5))).toThrow(RangeError);
  });

  it("抽屜 SSR：大數字 L1、精確值 L3 百分比，不帶「+」；組成是兩個正的金額（到分）；定義與技術算式由證據自帶，不出現商品毛利的定義；末筆 100%", () => {
    const pareto = productPareto(synthetic.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    const html = drawer(synthetic, productParetoShareEvidence(pareto, 2, synthetic.ctx, shareText(2)));
    expect(bigNumber(html)).toBe(formatRateL1("0.809843400447"));
    expect(preciseOf(html)).toBe(formatRateL3("0.809843400447"));
    expect(bigNumber(html)).not.toContain("+");
    expect(html).not.toContain("evidence-rounding-note");
    expect(html).not.toContain("ladder-table");
    expect(componentRows(html)).toEqual([["SHARE-NUMERATOR", formatAmountL3("7240.00")], ["SHARE-DENOMINATOR", formatAmountL3("8940.00")]]);
    expect(html).toContain("SHARE-DEFINITION");
    expect(html).not.toContain(metricDefinitions.gross_profit.plain);
    expect(technicalOf(html)).toContain("<code>SHARE-TECHNICAL</code>");
    expect(technicalOf(html)).toContain(`<div><dt>metric_version</dt><dd><code>${PRODUCT_PARETO_VERSION}</code></dd></div>`);
    const last = drawer(synthetic, productParetoShareEvidence(pareto, 4, synthetic.ctx, shareText(4)));
    expect(bigNumber(last)).toBe(formatRateL1("1.000000000000"));
    const single = productPareto(refundOnly.rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    expect(bigNumber(drawer(refundOnly, productParetoShareEvidence(single, 0, refundOnly.ctx, shareText(0))))).toBe(formatRateL1("1.000000000000"));
  });
});
