import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { channelAliasTerms, l1ClauseLengths, L1_MAX_CJK } from "../scripts/lib/copy-scan.mjs";
import { chartColors, chartHeights, chartRowHeights } from "@/application/chart-theme";
import { formatHeadlineAmount } from "@/application/copy";
import { saveScenario, type ScenarioPlan } from "@/application/decision";
import { formatAmountL1, formatAmountL2, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import { RANKED_AXIS_TICK, RankedBars, hbarGeometry, hbarMaxRows, rankedTextWidth, type RankedBarRow } from "@/components/charts/ranked-bars";
import { DecisionWorkbench } from "@/components/decision-workbench";
import { MultiScenarioWorkbench } from "@/components/multi-scenario-workbench";
import { ChartFrame } from "@/components/overview/charts/chart-frame";
import { SCENARIOS_VARIANCE_BAR_PREFIX, SCENARIOS_VARIANCE_TABLE_TESTID, SCENARIOS_VARIANCE_TESTID, ScenarioVarianceSection, scenarioVarianceModel, type ScenarioVarianceInput } from "@/components/scenarios/variance-chart";
import type { ScenarioInputs, ScenarioResult } from "@/domain/scenarios";
import type { AnalysisFilters } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { element, openTag, textOf } from "./helpers/markup";
import { pageStates, type StateMarkup } from "./helpers/page-states";
import { RANKED_BARS_BASELINE_FILE, rankedBarsBaseline } from "./helpers/ranked-bars-baseline";

/*
 * V4-5 代理 B：試算頁 G15 方案差額（06_BATCHES V4-5「驗收重點」；CHART_CATALOG G15 的單元測試欄；PRD §4.1–§4.7 G15、§8.7）。
 * - 柱數＝有效結果數（plan 順序），還沒有結果或不能試算的方案沒有柱、資料表照列「尚未試算」（與方案比較表的 planCell 同規則）；沒有任何跨方案合計。
 * - chart-scenarios-variance 全頁 1 個（M6），在方案欄 scenario-columns 之後、方案比較表之前，不在任何 scenario-{n} 內；試算頁主層獨立圖區塊＝1。
 * - 標題 key 都含「試算後」、子句 ≤ 14 字；golden 試算 284.00／264.00／19.70 經格式化函式顯示，數字本身不變；過期時副標接既有的「（已過期）」。
 * - 柱不可點（PRD §8.7 例外）：沒有 onBarClick、沒有熱區、圖容器 aria-hidden 且內部 0 個可聚焦元素；資料表是 L2 純文字（沒有 number-link）。
 * - C25 RankedBars 的軸列（零線＝現況）只在 G15 出現：商品頁 G13、G14 與各模式的輸出和 V4-4 逐字相同（tests/fixtures/ranked-bars-v4-4.json）。
 * 斷言只用 testid、labels 與格式化函式。
 */

const copy = labels.scenarios.chartsV4.variance;
const dw = labels.scenarios.decision;
const METRIC = metricDefinitions.contribution_after_marketing.label;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });
const noop = () => undefined;
type TreeElement = ReactElement<Record<string, unknown>>;

async function source(name = "golden", filters: AnalysisFilters = { channels: ["DTC"] }): Promise<ScenarioSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, filters, await hashInput(input));
  return { input, dataset, snapshot, revision: 1 };
}
const accepted = (patch: Partial<ScenarioInputs> = {}): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });
/** 與頁面上「試算」相同的路徑（application API）：建一個單通路 context 並寫入方案。 */
function withPlans(src: ScenarioSource, plans: Omit<ScenarioPlan, "result">[]): ScenarioWorkspace {
  let ws = ensureScenarioContext(emptyScenarioWorkspace("e"), src);
  const context = ws.contexts[ws.contexts.length - 1];
  const decision = scenarioContextDecision(context);
  for (const plan of plans) decision.scenarios = saveScenario(context.session, decision.scenarios, plan);
  ws = updateScenarioContext(ws, context.id, decision);
  return ws;
}
const render = (src: ScenarioSource, state: ScenarioWorkspace = emptyScenarioWorkspace("e")) => renderToStaticMarkup(createElement(MultiScenarioWorkbench, { source: src, state, setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const matches = (html: string, re: RegExp) => [...html.matchAll(re)].map(match => match[1]);
/** golden DTC 三個方案：履約（物流費 −10 → 284.00）、一次性（物流費 −10、一次性 20 → 264.00）、超出範圍（銷量 +250%，不能試算）。 */
const PLANS: Omit<ScenarioPlan, "result">[] = [
  { id: "p", name: "履約", inputs: accepted({ fulfillment_change_pct: "-10" }) },
  { id: "q", name: "一次性", inputs: accepted({ fulfillment_change_pct: "-10", one_time_cost: "20" }) },
  { id: "r", name: "超出範圍", inputs: accepted({ volume_change_pct: "250" }) },
];
/** 模型單元測試用的有效結果（只填 G15 讀的欄位）。 */
const valid = (contribution: string, delta: string) => ({ status: "valid", contribution, delta } as unknown as ScenarioResult);
const plan = (id: string, name: string, result: ScenarioResult | null): Pick<ScenarioPlan, "id" | "name" | "result"> => ({ id, name, result });
const input = (plans: ScenarioVarianceInput["plans"], patch: Partial<ScenarioVarianceInput> = {}): ScenarioVarianceInput => ({ plans, baseline: "270.00", channels: "DTC", period: "8/2", staleSuffix: "", ...patch });
function findAll(node: ReactNode, match: (item: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (isValidElement(node)) {
    const item = node as TreeElement;
    if (match(item)) found.push(item);
    findAll(item.props.children as ReactNode, match, found);
  }
  return found;
}

describe("G15 方案差額：golden DTC 三個方案（兩個有效、一個不能試算）", () => {
  let src: ScenarioSource, ws: ScenarioWorkspace, html: string, section: string;
  beforeAll(async () => {
    src = await source();
    ws = withPlans(src, PLANS);
    html = render(src, ws);
    section = element(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!;
  });

  it("golden 試算值不變（284.00、264.00），超出範圍的方案沒有有效結果", () => {
    const results = ws.contexts[0].plans.map(item => [item.id, item.result?.status, item.result?.contribution ?? null, item.result?.delta ?? null]);
    expect(results).toEqual([["p", "valid", "284.00", "14.00"], ["q", "valid", "264.00", "-6.00"], ["r", "invalid", null, null]]);
    expect(ws.contexts[0].session.baseline.amounts.contribution_after_marketing).toBe("270.00");
  });

  it("全頁 1 個（M6），在 scenario-columns 之後、方案比較表之前，不在任何 scenario-{n} 內", () => {
    expect(count(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)).toBe(1);
    const columns = element(html, 'data-testid="scenario-columns"')!;
    const sectionAt = html.indexOf(section);
    expect(sectionAt).toBeGreaterThanOrEqual(html.indexOf(columns) + columns.length);
    expect(sectionAt + section.length).toBeLessThanOrEqual(html.indexOf('data-testid="scenario-comparison"'));
    for (const n of [1, 2, 3]) expect(element(html, `data-testid="scenario-${n}"`), `scenario-${n}`).not.toContain(SCENARIOS_VARIANCE_TESTID);
    // 區塊是 panel（section.panel.chart-section），標題 h2，固定高 sm。
    const open = openTag(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!;
    expect(open).toMatch(/^<section class="panel chart-section scenario-variance"/);
    for (const attr of ['aria-labelledby="scenarios-variance-title"', 'aria-describedby="scenarios-variance-sub"']) expect(open).toContain(attr);
    expect(section).toContain('<h2 id="scenarios-variance-title">');
    expect(openTag(section, 'class="chart-frame sm"')).toContain(`style="height:${chartHeights.sm}px"`);
  });

  it("柱數＝有效結果數（plan 順序）；不能試算的方案沒有柱；色依 deltaTone（多賺 favorable、少賺 unfavorable）；方案名在左、條端 L1 帶號", () => {
    expect(matches(section, /data-testid="(chart-scenarios-variance-bar-[^"]+)"/g)).toEqual([`${SCENARIOS_VARIANCE_BAR_PREFIX}p`, `${SCENARIOS_VARIANCE_BAR_PREFIX}q`]);
    expect(section).not.toContain(`${SCENARIOS_VARIANCE_BAR_PREFIX}r`);
    expect(openTag(section, `data-testid="${SCENARIOS_VARIANCE_BAR_PREFIX}p"`)).toContain(`data-tone="favorable" `);
    expect(openTag(section, `data-testid="${SCENARIOS_VARIANCE_BAR_PREFIX}p"`)).toContain(`fill="${chartColors.favorable}"`);
    expect(openTag(section, `data-testid="${SCENARIOS_VARIANCE_BAR_PREFIX}q"`)).toContain(`data-tone="unfavorable" `);
    expect(openTag(section, `data-testid="${SCENARIOS_VARIANCE_BAR_PREFIX}q"`)).toContain(`fill="${chartColors.unfavorable}"`);
    expect(matches(section, /<text class="ranked-label"[^>]*>([^<]*)<\/text>/g)).toEqual(["履約", "一次性"]);
    expect(matches(section, /<text class="chart-value ranked-value[^"]*"[^>]*>([^<]*)<\/text>/g)).toEqual([formatSignedDelta("14.00", "L1"), formatSignedDelta("-6.00", "L1")]);
    // 正負都有：零線在中間（雙向段）。
    expect(section).toContain('data-direction="both"');
  });

  it("標題取差額絕對值最大的方案（|+14| > |−6|）：「履約 試算後比現況多賺 14 元」；副標寫現況、通路與本期", () => {
    const title = textOf(element(section, 'id="scenarios-variance-title"')!);
    expect(title).toBe(fill(copy.title.more, { plan: "履約", amount: formatHeadlineAmount("14.00") }));
    expect(title).toContain("試算後");
    const session = ws.contexts[0].session;
    const period = formatPeriodL1(session.period.start, session.period.end, { days: false, anchor: session.data_as_of });
    expect(textOf(element(section, 'id="scenarios-variance-sub"')!)).toBe(fill(copy.subtitle, { section: copy.section, metric: METRIC, baseline: formatAmountL1("270.00"), channels: "DTC", period }));
  });

  it("軸列（零線＝現況）：柱列之後 1 列「現況 270 元」；svg 高＝（根數＋1）× row24 ≤ sm", () => {
    const svg = openTag(section, 'class="chart-ranked-bars"')!;
    expect(svg).toContain('data-rows="3"');
    expect(svg).toContain(`height="${3 * chartRowHeights.row24}"`);
    expect(3 * chartRowHeights.row24).toBeLessThanOrEqual(chartHeights.sm);
    expect(textOf(element(section, 'class="ranked-axis"')!)).toBe(fill(copy.axis, { amount: formatAmountL1("270.00") }));
    expect(openTag(section, 'class="ranked-axis-tick"')).toContain(`stroke="${chartColors.axis}"`);
  });

  it("柱不可點（PRD §8.7）：圖容器 aria-hidden，內部沒有熱區、tabindex、button、a、onclick", () => {
    const frame = element(section, 'class="chart-frame sm"')!;
    expect(openTag(section, 'class="chart-frame sm"')).toContain('aria-hidden="true"');
    expect(frame).not.toMatch(/ranked-hit|is-clickable|tabindex|<button|<a\s|onclick/i);
  });

  it("資料表（C33，L2 純文字）：方案名稱、試算後的扣廣告後貢獻（元）、與現況相比（元）；每個方案一列，不能試算的寫「尚未試算」；沒有任何合計", () => {
    const details = element(section, 'class="data-alternative"')!;
    expect(details).toMatch(/^<details class="data-alternative">/);
    expect(textOf(element(details, "<summary")!)).toBe(fill(labels.overview.page.dataTable, { title: copy.section }));
    const table = element(details, `data-testid="${SCENARIOS_VARIANCE_TABLE_TESTID}"`)!;
    expect(textOf(element(table, "<caption")!)).toBe(yuanColumn(copy.section));
    expect(matches(element(table, "<thead")!, /<th[^>]*>([^<]*)<\/th>/g)).toEqual([dw.planName, yuanColumn(labels.scenarios.inputs.resultTitle), yuanColumn(labels.scenarios.inputs.vsBaseline)]);
    const rows = [...element(table, "<tbody")!.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => [textOf(element(match[1], "<th")!), ...matches(match[1], /<td[^>]*>([^<]*)<\/td>/g)]);
    expect(rows).toEqual([
      ["履約", formatAmountL2("284.00"), formatSignedDelta("14.00", "L2")],
      ["一次性", formatAmountL2("264.00"), formatSignedDelta("-6.00", "L2")],
      ["超出範圍", dw.notCalculated, dw.notCalculated],
    ]);
    expect(table).not.toContain("number-link");
    expect(table).not.toContain("<tfoot");
    // 少賺的差額格上不利色（只有不利上色）。
    expect(table).toMatch(new RegExp(`<td class="num negative">${formatSignedDelta("-6.00", "L2")}</td>`));
    expect(table).toMatch(new RegExp(`<td class="num">\\${formatSignedDelta("14.00", "L2")}</td>`));
    // 不跨方案相加：兩個有效方案的試算後貢獻與差額的和都不出現在區塊內。
    for (const sum of [formatAmountL2("548.00"), formatAmountL1("548.00"), formatSignedDelta("8.00", "L1"), formatSignedDelta("8.00", "L2")]) expect(textOf(section), sum).not.toContain(sum);
    expect(textOf(details)).toContain(copy.tableNote);
  });

  it("chart-lint：區塊沒有 CL-1、CL-2、CL-11 違規；testid 依命名", () => {
    const result = checkChartMarkup(section, { page: "scenarios" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(result.violations[rule], rule).toEqual([]);
    expect(result.chartTestIds).toEqual([SCENARIOS_VARIANCE_TESTID, `${SCENARIOS_VARIANCE_BAR_PREFIX}p`, `${SCENARIOS_VARIANCE_BAR_PREFIX}q`, SCENARIOS_VARIANCE_TABLE_TESTID]);
  });
});

describe("G15：其他狀態", () => {
  it("首次進入（只有進頁草稿、沒有任何有效結果）：空狀態——標題是區塊名、說明句、沒有柱；資料表照列草稿「尚未試算」（CL-1 需要資料表）", async () => {
    const html = render(await source());
    expect(count(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)).toBe(1);
    const section = element(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!;
    expect(textOf(element(section, 'id="scenarios-variance-title"')!)).toBe(copy.section);
    expect(openTag(section, 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(openTag(section, 'class="chart-frame sm"')).not.toContain("aria-hidden");
    expect(textOf(element(section, 'class="chart-frame-message"')!)).toBe(copy.empty);
    expect(section).not.toContain("chart-ranked-bars");
    expect(section).not.toContain(SCENARIOS_VARIANCE_BAR_PREFIX);
    const table = element(section, `data-testid="${SCENARIOS_VARIANCE_TABLE_TESTID}"`)!;
    expect([...element(table, "<tbody")!.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => [textOf(element(match[1], "<th")!), ...matches(match[1], /<td[^>]*>([^<]*)<\/td>/g)])).toEqual([[fill(dw.defaultPlanName, { n: 1 }), dw.notCalculated, dw.notCalculated]]);
  });

  it("其他通路 MARKETPLACE：golden 19.70 經格式化函式顯示（條端 L1、資料表 L2）", async () => {
    const marketplace = await source("golden", { channels: ["MARKETPLACE"] });
    const ws = withPlans(marketplace, [{ id: "m", name: "M", inputs: accepted({ volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20" }) }]);
    const result = ws.contexts[0].plans[0].result!;
    expect(result.contribution).toBe("19.70");
    const section = element(render(marketplace, ws), `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!;
    expect(matches(section, /<text class="chart-value ranked-value[^"]*"[^>]*>([^<]*)<\/text>/g)).toEqual([formatSignedDelta(result.delta, "L1")]);
    const table = element(section, `data-testid="${SCENARIOS_VARIANCE_TABLE_TESTID}"`)!;
    expect(matches(table, /<td[^>]*>([^<]*)<\/td>/g)).toEqual([formatAmountL2("19.70"), formatSignedDelta(result.delta, "L2")]);
  });

  it("過期（資料換了）：副標後面接既有的「（已過期）」，舊結果仍畫（與方案比較表的標題同一個後綴）", async () => {
    const src = await source();
    const ws = withPlans(src, PLANS);
    const context = ws.contexts[0];
    const html = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset: src.dataset, snapshot: src.snapshot, revision: context.session.revision + 1, input: context.source_input, state: scenarioContextDecision(context), setState: noop, onEvidence: noop }));
    const section = element(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!;
    const period = formatPeriodL1(context.session.period.start, context.session.period.end, { days: false, anchor: context.session.data_as_of });
    expect(textOf(element(section, 'id="scenarios-variance-sub"')!)).toBe(`${fill(copy.subtitle, { section: copy.section, metric: METRIC, baseline: formatAmountL1("270.00"), channels: "DTC", period })}（${dw.baselineTagStale}）`);
    // 與方案比較表標題的過期後綴相同。
    expect(textOf(element(html, 'class="ui-section-title"')!)).toBe(fill(dw.compareTableHeading, { staleSuffix: `（${dw.baselineTagStale}）` }));
    expect(matches(section, /data-testid="(chart-scenarios-variance-bar-[^"]+)"/g)).toHaveLength(2);
    // 不過期時沒有後綴。
    expect(textOf(element(element(render(src, ws), `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!, 'id="scenarios-variance-sub"')!)).not.toContain(dw.baselineTagStale);
  });

  it("區塊元件沒有 hook、柱沒有 onBarClick：ChartFrame（scenarios-variance）＋RankedBars variance row24＋軸列；evidence 都是 null", () => {
    const model = scenarioVarianceModel(input([plan("a", "A", valid("284.00", "14.00")), plan("b", "B", valid("264.00", "-6.00"))]));
    const tree = ScenarioVarianceSection({ model }) as TreeElement;
    expect(tree.type).toBe(ChartFrame);
    expect(tree.props).toMatchObject({ id: "scenarios-variance", page: "scenarios", testId: SCENARIOS_VARIANCE_TESTID, height: "sm", title: model.title, subtitle: model.subtitle });
    const [bars] = findAll(tree.props.children as ReactNode, item => item.type === RankedBars);
    expect(bars.props).toMatchObject({ mode: "variance", rowHeight: "row24", axis: model.axis, testIdPrefix: SCENARIOS_VARIANCE_BAR_PREFIX });
    expect(bars.props.onBarClick).toBeUndefined();
    expect((bars.props.rows as RankedBarRow<null>[]).map(row => row.evidence)).toEqual([null, null]);
  });
});

describe("scenarioVarianceModel（純函式）", () => {
  it("柱＝有效結果（plan 順序），值與條端文字直接取 result.delta；沒有結果或不能試算的方案不列柱但列在資料表", () => {
    const model = scenarioVarianceModel(input([plan("a", "A", valid("284.00", "14.00")), plan("b", "B", null), plan("c", "C", { status: "invalid", contribution: null, delta: null } as unknown as ScenarioResult)]));
    expect(model.bars.map(row => [row.key, row.label, row.value, row.tone, row.display])).toEqual([["a", "A", "14.00", "favorable", formatSignedDelta("14.00", "L1")]]);
    expect(model.tableRows).toEqual([{ id: "a", name: "A", contribution: "284.00", delta: "14.00" }, { id: "b", name: "B", contribution: null, delta: null }, { id: "c", name: "C", contribution: null, delta: null }]);
    expect(model.titleKind).toBe("more");
  });

  it("標題取差額絕對值最大者（只挑選、不相加）；同值取排在前面的；全部為負用「少賺」", () => {
    const less = scenarioVarianceModel(input([plan("a", "A", valid("260.00", "-10.00")), plan("b", "B", valid("250.00", "-20.00")), plan("c", "C", valid("265.00", "-5.00"))]));
    expect([less.titleKind, less.leadId, less.title]).toEqual(["less", "b", fill(copy.title.less, { plan: "B", amount: formatHeadlineAmount("-20.00") })]);
    expect(less.bars.map(row => row.tone)).toEqual(["unfavorable", "unfavorable", "unfavorable"]);
    const tie = scenarioVarianceModel(input([plan("a", "A", valid("280.00", "10.00")), plan("b", "B", valid("260.00", "-10.00"))]));
    expect([tie.titleKind, tie.leadId]).toEqual(["more", "a"]);
    const tieReversed = scenarioVarianceModel(input([plan("b", "B", valid("260.00", "-10.00")), plan("a", "A", valid("280.00", "10.00"))]));
    expect([tieReversed.titleKind, tieReversed.leadId]).toEqual(["less", "b"]);
    // 模型沒有任何合計欄位。
    expect(Object.keys(less).sort()).toEqual(["axis", "bars", "leadId", "section", "subtitle", "tableRows", "title", "titleKind"]);
  });

  it("持平：差額取位到元後為 0（與方案欄 scenario-delta 同一個 L1 判斷）用 flat，柱用 total 色", () => {
    const flat = scenarioVarianceModel(input([plan("a", "A", valid("270.30", "0.30"))]));
    expect([flat.titleKind, flat.title]).toEqual(["flat", fill(copy.title.flat, { plan: "A" })]);
    expect(flat.bars.map(row => [row.tone, row.display])).toEqual([["total", formatSignedDelta("0.30", "L1")]]);
    const zero = scenarioVarianceModel(input([plan("a", "A", valid("270.00", "0.00"))]));
    expect(zero.titleKind).toBe("flat");
  });

  it("沒有有效結果：標題是區塊名、titleKind empty；最多取前 3 個方案；空白名稱改用「方案 {n}」；現況缺值寫「資料待補」", () => {
    const empty = scenarioVarianceModel(input([plan("a", "  ", null)], { baseline: null }));
    expect([empty.titleKind, empty.title, empty.leadId, empty.bars]).toEqual(["empty", copy.section, null, []]);
    expect(empty.tableRows[0].name).toBe(fill(dw.planLegend, { n: 1 }));
    expect(empty.axis).toBe(fill(copy.axis, { amount: formatAmountL1(null) }));
    const four = scenarioVarianceModel(input(["a", "b", "c", "d"].map(id => plan(id, id.toUpperCase(), valid("270.00", "1.00")))));
    expect(four.bars.map(row => row.key)).toEqual(["a", "b", "c"]);
    expect(four.tableRows.map(row => row.id)).toEqual(["a", "b", "c"]);
  });

  it("過期後綴只接在副標尾端", () => {
    const stale = scenarioVarianceModel(input([plan("a", "A", valid("284.00", "14.00"))], { staleSuffix: `（${dw.baselineTagStale}）` }));
    expect(stale.subtitle).toBe(`${fill(copy.subtitle, { section: copy.section, metric: METRIC, baseline: formatAmountL1("270.00"), channels: "DTC", period: "8/2" })}（${dw.baselineTagStale}）`);
    expect(stale.title).toBe(fill(copy.title.more, { plan: "A", amount: formatHeadlineAmount("14.00") }));
  });
});

describe("scenarios.chartsV4.variance 字串", () => {
  it("標題 key 都含「試算後」，每個子句 ≤ 14 字；主層字串（標題、副標、空狀態、軸列）沒有否定句", () => {
    const aliasTerms = channelAliasTerms(labels);
    const titles = Object.entries(copy.title);
    expect(titles.map(([key]) => key).sort()).toEqual(["flat", "less", "more"]);
    for (const [key, value] of titles) {
      expect(value, key).toContain("試算後");
      expect(l1ClauseLengths(value, aliasTerms).every(length => length <= L1_MAX_CJK), key).toBe(true);
    }
    for (const value of [...titles.map(([, value]) => value), copy.subtitle, copy.empty, copy.axis, copy.section]) expect(value).not.toMatch(/不是|不代表|不等於|不可/);
  });
});

describe("頁面狀態（tests/helpers/page-states.tsx）：M6 與主層圖區塊", () => {
  let states: StateMarkup[];
  beforeAll(async () => { states = (await pageStates()).filter(state => state.state); }, 60_000);

  it("每個有資料的狀態 chart-scenarios-variance 至多 1 個、不在 scenario-{n} 內；試算頁主層獨立圖區塊＝1；其他頁的 G15 在 hidden 的試算工作台內（不算主層）", () => {
    for (const { name, html, state } of states) {
      const total = count(html, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`);
      expect(total, name).toBeLessThanOrEqual(1);
      for (const container of matches(html, /data-testid="(scenario-\d+)"/g)) expect(element(html, `data-testid="${container}"`), `${name} ${container}`).not.toContain(SCENARIOS_VARIANCE_TESTID);
      const result = checkChartMarkup(html, { page: state!.panel });
      if (state!.panel === "scenarios") {
        expect(total, name).toBe(1);
        expect(result.mainSections.filter(id => id.startsWith("chart-scenarios-")), name).toEqual([SCENARIOS_VARIANCE_TESTID]);
      } else expect(result.mainSections, name).not.toContain(SCENARIOS_VARIANCE_TESTID);
    }
    // 試算頁狀態（履約 284.00 有效、超出範圍不能試算）：1 根柱。
    const scenarios = states.find(item => item.name === "scenarios")!.html;
    expect(matches(element(scenarios, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!, /data-testid="(chart-scenarios-variance-bar-[^"]+)"/g)).toEqual([`${SCENARIOS_VARIANCE_BAR_PREFIX}p`]);
  });
});

describe("C25 RankedBars 軸列（V4-5）與向下相容", () => {
  const rows = (values: string[]): RankedBarRow<null>[] => values.map((value, index) => ({ key: `k${index}`, label: `P${index}`, value, tone: "total", display: value, evidence: null }));
  const axisText = fill(copy.axis, { amount: formatAmountL1("270.00") });

  it("給 axis 時多 1 列：高＝（根數＋1）× 列高；刻度在零線、從柱列底往下 RANKED_AXIS_TICK；文字基線同列的文字基線、置中於零線並夾在左右邊界內", () => {
    for (const [values, direction] of [[["14.00", "-6.00"], "both"], [["14.00", "3.00"], "right"], [["-14.00", "-6.00"], "left"]] as const) {
      for (const width of [200, 560, 1000]) {
        const geometry = hbarGeometry(rows([...values]), width, "variance", { rowHeight: "row24", axis: axisText });
        const n = values.length;
        expect(geometry.blocks[0].direction).toBe(direction);
        expect(geometry.rowCount).toBe(n + 1);
        expect(geometry.height).toBe((n + 1) * chartRowHeights.row24);
        expect(geometry.axis!.zeroX).toBe(geometry.blocks[0].zeroX);
        expect(geometry.axis!.tick).toEqual({ y1: n * chartRowHeights.row24, y2: n * chartRowHeights.row24 + RANKED_AXIS_TICK });
        expect(geometry.axis!.label.y).toBe(n * chartRowHeights.row24 + geometry.blocks[0].bars[0].textY);
        const half = rankedTextWidth(axisText) / 2;
        expect(geometry.axis!.label.x).toBeGreaterThanOrEqual(half - 0.05);
        expect(geometry.axis!.label.x).toBeLessThanOrEqual(geometry.width - half + 0.05);
        if (direction === "both" && width >= 560) expect(geometry.axis!.label.x).toBe(geometry.axis!.zeroX);
      }
    }
  });

  it("沒給 axis、空字串或沒有柱時沒有 axis 鍵（高與列數同 V4-4）；G15 最多 3 根，（3＋1）× row24 ≤ sm", () => {
    const plain = hbarGeometry(rows(["14.00"]), 560, "variance", { rowHeight: "row24" });
    expect("axis" in plain).toBe(false);
    expect(plain.rowCount).toBe(1);
    expect("axis" in hbarGeometry(rows(["14.00"]), 560, "variance", { rowHeight: "row24", axis: "" })).toBe(false);
    const none = hbarGeometry([], 560, "variance", { rowHeight: "row24", axis: axisText });
    expect("axis" in none).toBe(false);
    expect([none.rowCount, none.height]).toEqual([0, 0]);
    expect(hbarMaxRows("sm", "row24", 1)).toBeGreaterThanOrEqual(3);
    expect((3 + 1) * chartRowHeights.row24).toBeLessThanOrEqual(chartHeights.sm);
  });

  it("商品頁 G13、G14 與各模式、各寬度的輸出和 V4-4（開工錨點 db0f401）逐字相同", async () => {
    const expected = JSON.parse(readFileSync(RANKED_BARS_BASELINE_FILE, "utf8")) as Record<string, string>;
    const actual = await rankedBarsBaseline();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
    // 基準確實涵蓋商品頁兩張圖（示範資料的 G13、合成資料的 G13 與 G14）。
    expect(Object.keys(expected)).toEqual(expect.arrayContaining(["demo chart-products-variance", "synthetic-4-channel chart-products-variance", "synthetic-4-channel chart-products-pareto", "refund_only chart-products-pareto"]));
    for (const html of Object.values(expected)) expect(html).not.toContain("ranked-axis");
  }, 60_000);
});
