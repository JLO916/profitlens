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
import { SCENARIOS_THRESHOLD_POINT_PREFIX, SCENARIOS_THRESHOLD_TABLE_TESTID, SCENARIOS_THRESHOLD_TESTID, ScenarioThresholdSection, scenarioThresholdChartId, scenarioThresholdModel } from "@/components/scenarios/threshold-chart";
import { ThresholdLine, thresholdGeometry } from "@/components/charts/threshold-line";
import { analyzeScenarioSensitivity } from "@/domain/scenario-sensitivity";
import { emptyDecisionWorkspace } from "@/application/decision";
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

  it("資料表（C33，L2 純文字）：方案名稱、試算後的扣廣告後貢獻（元）、與現況相比（元）；每個方案一列，試算後沒有結果的寫「不適用」（審查 B-R1，PRD §4.3）；沒有任何合計", () => {
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
      ["超出範圍", labels.shell.status.notApplicable, labels.shell.status.notApplicable],
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
    // V4-5 代理 C（審查 B-R1）：還沒試算（result null）是 pending（「尚未試算」）、試算後 invalid／ineligible 是 notApplicable（「不適用」）。
    expect(model.tableRows).toEqual([{ id: "a", name: "A", status: "valid", contribution: "284.00", delta: "14.00" }, { id: "b", name: "B", status: "pending", contribution: null, delta: null }, { id: "c", name: "C", status: "notApplicable", contribution: null, delta: null }]);
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

/*
 * V4-5 代理 C：G16 要賣到多少才划算（06_BATCHES V4-5「驗收重點」；CHART_CATALOG G16「單元測試」；PRD §4.3 G16、§8.7、X29；D-V4-20＝A′）。
 * - chart-scenarios-threshold 在每個有效方案的 scenario-{n} 內各一份（區塊代號 scenarios-threshold-{planId} 各自唯一）；不能試算的方案欄沒有。
 * - A′：圖內沒有 path、polyline（不連線）；所有點的 x 在 [−90%, +100%] 的繪圖區內（端點剛好落在繪圖區左右緣）。
 * - 色：門檻點空心 chartColors.target、使用者點實心 chartColors.total；不用強調色 chartColors.current。點不可點（沒有 onClick、資料表沒有 number-link）。
 * 另含審查 B-R2（C25 軸列遇「另 n 個」列）、B-R3（G15 不能試算或過期時的空狀態說明）的回歸測試。
 */
describe("G16 要賣到多少才划算：每個 scenario-{n} 一份", () => {
  let html: string;
  beforeAll(async () => {
    const src = await source();
    html = render(src, withPlans(src, [{ ...PLANS[0], sensitivity: { volumes: ["-3", "-2.5", "0"] } }, PLANS[1], PLANS[2]]));
  });
  const cardOf = (n: number) => element(html, `data-testid="scenario-${n}"`)!;
  const g16Of = (n: number) => element(cardOf(n), `data-testid="${SCENARIOS_THRESHOLD_TESTID}"`);

  it("有效方案（履約、一次性）各一份、在自己的 scenario-sensitivity 內；不能試算的方案欄（超出範圍）沒有；區塊代號依方案 id 各自唯一", () => {
    for (const [n, id] of [[1, "p"], [2, "q"]] as const) {
      expect(count(cardOf(n), `data-testid="${SCENARIOS_THRESHOLD_TESTID}"`), `scenario-${n}`).toBe(1);
      expect(element(cardOf(n), 'data-testid="scenario-sensitivity"'), `scenario-${n}`).toContain(`data-testid="${SCENARIOS_THRESHOLD_TESTID}"`);
      expect(g16Of(n)).toContain(`<h4 id="${scenarioThresholdChartId(id)}-title">`);
    }
    expect(g16Of(3)).toBeNull();
    expect(count(html, `data-testid="${SCENARIOS_THRESHOLD_TESTID}"`)).toBe(2);
    // G16 不在主層：試算頁主層的圖區塊仍只有 G15。
    expect(checkChartMarkup(html, { page: "scenarios" }).mainSections).toEqual([SCENARIOS_VARIANCE_TESTID]);
  });

  it("A′：G16 的 svg 內沒有 path、polyline、polygon（不連線）；點的 cx 都在繪圖區（零線的 x1–x2）內", () => {
    for (const n of [1, 2]) {
      const svg = element(g16Of(n)!, 'class="chart-threshold"')!;
      expect(svg).not.toMatch(/<path|<polyline|<polygon/);
      const zero = openTag(svg, 'class="threshold-zero"')!;
      const [x1, x2] = [/x1="([\d.]+)"/.exec(zero)![1], /x2="([\d.]+)"/.exec(zero)![1]].map(Number);
      const xs = [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"/g)].map(match => Number(match[1]));
      expect(xs.length, `scenario-${n}`).toBeGreaterThan(0);
      for (const x of xs) { expect(x).toBeGreaterThanOrEqual(x1); expect(x).toBeLessThanOrEqual(x2); }
    }
  });

  it("色：門檻點空心（fill none、stroke chartColors.target）、使用者點實心 chartColors.total；圖內沒有 chartColors.current", () => {
    const section = g16Of(1)!;
    for (const id of ["zero_contribution", "maintain_baseline"]) {
      const open = openTag(section, `data-testid="${SCENARIOS_THRESHOLD_POINT_PREFIX}${id}"`)!;
      expect(open).toContain('fill="none"');
      expect(open).toContain(`stroke="${chartColors.target}"`);
    }
    for (const id of ["a", "b", "c"]) expect(openTag(section, `data-testid="${SCENARIOS_THRESHOLD_POINT_PREFIX}${id}"`)).toContain(`fill="${chartColors.total}"`);
    expect(element(section, 'class="chart-frame sm"')).not.toContain(chartColors.current);
    // 方案 2 沒有填三個假設：只有兩個門檻點（不代填）。
    expect(matches(g16Of(2)!, /data-testid="chart-scenarios-threshold-point-([^"]+)"/g).sort()).toEqual(["maintain_baseline", "zero_contribution"]);
  });

  it("chart-lint：G16 區塊沒有 CL-1、CL-2、CL-11 違規；testid 依命名", () => {
    const result = checkChartMarkup(g16Of(1)!, { page: "scenarios" });
    for (const rule of ["CL-1", "CL-2", "CL-11"] as const) expect(result.violations[rule], rule).toEqual([]);
    expect(result.chartTestIds).toEqual([SCENARIOS_THRESHOLD_TESTID, ...["a", "b", "c", "zero_contribution", "maintain_baseline"].map(id => `${SCENARIOS_THRESHOLD_POINT_PREFIX}${id}`), SCENARIOS_THRESHOLD_TABLE_TESTID]);
  });

  it("點不可點（PRD §8.7）：區塊元件沒有 hook，ThresholdLine 沒有 onClick；資料表的格都不是 number-link", async () => {
    const src = await source();
    const ws = withPlans(src, [{ ...PLANS[0], sensitivity: { volumes: ["-3", "-2.5", "0"] } }]);
    const plan = ws.contexts[0].plans[0];
    const analysis = analyzeScenarioSensitivity(ws.contexts[0].session.baseline, plan.inputs, plan.sensitivity!.volumes);
    const model = scenarioThresholdModel(analysis);
    const tree = ScenarioThresholdSection({ model, chartId: scenarioThresholdChartId(plan.id) }) as TreeElement;
    expect(tree.type).toBe(ChartFrame);
    expect(tree.props).toMatchObject({ id: "scenarios-threshold-p", page: "scenarios", testId: SCENARIOS_THRESHOLD_TESTID, variant: "inline", headingLevel: 4, height: "sm", title: model.title });
    const [line] = findAll(tree.props.children as ReactNode, item => item.type === ThresholdLine);
    expect(line.props).toMatchObject({ testIdPrefix: SCENARIOS_THRESHOLD_POINT_PREFIX });
    expect(Object.keys(line.props).filter(key => /^on[A-Z]/.test(key))).toEqual([]);
    expect(renderToStaticMarkup(tree)).not.toContain("number-link");
    // y 與敏感度表同列逐字相同（A 級：只組既有點）。
    expect(model.points.filter(point => point.kind === "user").map(point => point.y)).toEqual(analysis.sensitivity.rows.map(row => row.result.contribution));
    expect(model.points.filter(point => point.kind === "threshold").map(point => point.y)).toEqual(analysis.targets.map(target => target.target));
  });

  it("thresholdGeometry：v＝−90、+100 的點剛好落在繪圖區左右緣；超出一點點的不畫（不夾到邊界、不外插）", () => {
    for (const width of [324, 560, 1000]) {
      const geometry = thresholdGeometry([{ id: "a", kind: "user", v: "-90", y: "10.00" }, { id: "b", kind: "user", v: "100", y: "20.00" }, { id: "c", kind: "user", v: "100.01", y: "30.00" }, { id: "zero_contribution", kind: "threshold", v: "-90.000000000001", y: "0.00" }], width);
      expect(geometry.points.map(shape => [shape.point.id, shape.cx]).sort()).toEqual([["a", geometry.plot.left], ["b", geometry.plot.right]]);
      expect(geometry.dropped.sort()).toEqual(["c", "zero_contribution"]);
      expect(geometry.connected).toBe(false);
    }
  });
});

describe("審查 B-R2、B-R3 回歸", () => {
  it("B-R2：C25 軸列遇「另 n 個」列時，刻度從柱列底（零線下端）接到軸列頂＋RANKED_AXIS_TICK；沒有「另 n 個」時不變", () => {
    const rows: RankedBarRow<null>[] = ["14.00", "-6.00"].map((value, index) => ({ key: `k${index}`, label: `P${index}`, value, tone: "total", display: value, evidence: null }));
    const axisText = fill(copy.axis, { amount: formatAmountL1("270.00") });
    const withMore = hbarGeometry(rows, 560, "variance", { rowHeight: "row24", axis: axisText, more: "另 2 個" });
    const row = chartRowHeights.row24;
    expect(withMore.rowCount).toBe(4);
    expect(withMore.blocks[0].zeroLine).toEqual({ y1: 0, y2: 2 * row });
    expect(withMore.axis!.tick).toEqual({ y1: 2 * row, y2: 3 * row + RANKED_AXIS_TICK });
    expect(withMore.axis!.label.y).toBe(3 * row + withMore.blocks[0].bars[0].textY);
    const plain = hbarGeometry(rows, 560, "variance", { rowHeight: "row24", axis: axisText });
    expect(plain.axis!.tick).toEqual({ y1: 2 * row, y2: 2 * row + RANKED_AXIS_TICK });
  });

  it("B-R3：基準不能試算時 G15 空狀態寫既有的「這個範圍不能試算」；過期且沒有任何有效結果時寫既有的「試算已過期」；可以試算時照舊", async () => {
    const message = (markup: string) => textOf(element(element(markup, `data-testid="${SCENARIOS_VARIANCE_TESTID}"`)!, 'class="chart-frame-message"')!);
    const all = await source("golden", {});
    const ineligible = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset: all.dataset, snapshot: all.snapshot, revision: 1, input: all.input, state: { ...emptyDecisionWorkspace(), source_input: all.input }, setState: noop, onEvidence: noop }));
    expect(ineligible).toContain('data-testid="scenario-unavailable"');
    expect(message(ineligible)).toBe(dw.unavailableTitle);
    const src = await source();
    const ws = withPlans(src, [PLANS[2]]);
    const context = ws.contexts[0];
    const stale = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset: src.dataset, snapshot: src.snapshot, revision: context.session.revision + 1, input: context.source_input, state: scenarioContextDecision(context), setState: noop, onEvidence: noop }));
    expect(message(stale)).toBe(dw.staleTitle);
    expect(message(render(src, ws))).toBe(copy.empty);
    // 區塊元件：不給 emptyMessage 時用 copy.empty。
    const model = scenarioVarianceModel(input([plan("a", "A", null)]));
    expect((ScenarioVarianceSection({ model }) as TreeElement).props.message).toBe(copy.empty);
    expect((ScenarioVarianceSection({ model, emptyMessage: dw.staleTitle }) as TreeElement).props.message).toBe(dw.staleTitle);
  });
});
