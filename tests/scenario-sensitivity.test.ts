import Decimal from "decimal.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { calculateMetrics } from "@/domain/metrics";
import { buildScenarioBaseline, type ScenarioInputs } from "@/domain/scenarios";
import { analyzeScenarioSensitivity } from "@/domain/scenario-sensitivity";
import { AMOUNT_FIELDS, type AmountField, type Summary, type Totals } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { element, openTag, textOf } from "./helpers/markup";
import { chartColors } from "@/application/chart-theme";
import { blankSensitivity, type SensitivityInputs } from "@/application/decision";
import { formatAmountL2, formatPercentNumber, metricDefinitions } from "@/application/presentation";
import { thresholdDescription, thresholdTargetLabel } from "@/application/scenario-threshold-text";
import { ScenarioSensitivity } from "@/components/scenario-sensitivity";
import { SCENARIOS_THRESHOLD_POINT_PREFIX, SCENARIOS_THRESHOLD_TABLE_TESTID, SCENARIOS_THRESHOLD_TESTID } from "@/components/scenarios/threshold-chart";
import { fill, labels } from "@/i18n";

const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
function golden() { return buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels.DTC, true); }
function baseline(values: Partial<Record<AmountField, string | null>>) {
  const totals = Object.fromEntries(AMOUNT_FIELDS.map(field => {
    const value = field in values ? values[field] : field === "gross_sales" ? "100.00" : "0.00";
    return [field, { cents: value == null ? null : BigInt(value.replace(".", "")), reason_codes: value == null ? ["MISSING_COST"] : [] }];
  })) as Totals;
  const summary: Summary = { totals, metrics: calculateMetrics(totals), sources: [], units_sold: { value: null, reason_codes: [] } };
  return buildScenarioBaseline(summary, true);
}
const analyze = (inputs: Partial<ScenarioInputs> = {}, values: string[] = ["-10", "0", "10"]) => analyzeScenarioSensitivity(golden(), { ...zero, ...inputs }, values);

describe("PL-08 exact conditional thresholds and explicit sensitivity", () => {
  it("has separate zero-contribution and original-baseline goals with independent literal anchors", () => {
    // Golden DTC after f=-10%: L=1480-740-44-126-16=554; B=270.
    // Solve 554*(1+v)-270=T. These constants are hand-derived, not computed by production.
    const result = analyze({ fulfillment_change_pct: "-10" });
    expect(result.status).toBe("valid");
    expect(result.coefficients).toMatchObject({ volume_coefficient: "554.00", fixed_outflow: "270.00", slope: "positive" });
    expect(result.targets).toMatchObject([
      { id: "zero_contribution", target: "0.00", threshold_pct: "-51.263537906137", status: "within_range", meets_target_when: "at_or_above" },
      { id: "maintain_baseline", target: "270.00", threshold_pct: "-2.527075812274", status: "within_range", meets_target_when: "at_or_above" },
    ]);
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["228.60", "284.00", "339.40"]);
  });
  it("includes K=20 once in both thresholds and each independent sensitivity result", () => {
    const result = analyze({ fulfillment_change_pct: "-10", one_time_cost: "20" });
    expect(result.targets).toMatchObject([
      { target: "0.00", threshold_pct: "-47.653429602888" },
      { target: "270.00", threshold_pct: "1.083032490975" },
    ]);
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["208.60", "264.00", "319.40"]);
    expect(result.sensitivity.rows.map(row => row.result.delta)).toEqual(["-61.40", "-6.00", "49.40"]);
  });
  it.each([
    { k: "0", target: "maintain_baseline", volumes: ["-3", "-2.5", "0"], amounts: ["267.38", "270.15", "284.00"] },
    { k: "20", target: "maintain_baseline", volumes: ["1", "1.1", "0"], amounts: ["269.54", "270.09", "264.00"] },
    { k: "0", target: "zero_contribution", volumes: ["-51.3", "-51.2", "0"], amounts: ["-0.20", "0.35", "284.00"] },
    { k: "20", target: "zero_contribution", volumes: ["-47.7", "-47.6", "0"], amounts: ["-0.26", "0.30", "264.00"] },
  ])("brackets $target with independently checked amounts and K=$k", ({ k, volumes, amounts }) => {
    expect(analyze({ fulfillment_change_pct: "-10", one_time_cost: k }, volumes).sensitivity.rows.map(row => row.result.contribution)).toEqual(amounts);
  });
  it("zero-change maintain-baseline threshold is exactly 0 and returns baseline at explicit zero", () => {
    const result = analyze();
    expect(result.targets[1]).toMatchObject({ threshold_pct: "0.000000000000", status: "within_range" });
    expect(result.sensitivity.rows[1].result).toMatchObject({ contribution: "270.00", delta: "0.00" });
  });
  it("retains discount percentage points and preserves original assumptions without mutation", () => {
    // Base G100,D10,N90,C30. delta +5pp => N85, L55; 0-volume CM=55.
    const base = baseline({ discounts: "10.00", cogs_net: "30.00" });
    const input = { ...zero, discount_change_pp: "5" };
    const original = structuredClone({ base, input });
    const result = analyzeScenarioSensitivity(base, input, ["0", "10", "-10"]);
    expect(result.coefficients?.volume_coefficient).toBe("55.00");
    expect(result.targets[1].threshold_pct).toBe("9.090909090909");
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["55.00", "60.50", "49.50"]);
    expect(result.sensitivity.rows[0].result.inputs.discount_change_pp).toBe("5");
    expect({ base, input }).toEqual(original);
  });
  it("negative slope reverses the threshold direction and does not claim more volume improves contribution", () => {
    const result = analyzeScenarioSensitivity(baseline({ cogs_net: "150.00", ad_spend: "10.00" }), zero, ["-10", "0", "10"]);
    expect(result.coefficients?.slope).toBe("negative");
    expect(result.targets[1]).toMatchObject({ target: "-60.00", threshold_pct: "0.000000000000", meets_target_when: "at_or_below" });
    expect(result.targets[0]).toMatchObject({ status: "outside_range", range_outcome: "all_below" });
    expect(result.sensitivity.rows.map(row => row.result.contribution)).toEqual(["-55.00", "-60.00", "-65.00"]);
  });
  it("zero slope distinguishes equality, always below and always above without division by zero", () => {
    const base = baseline({ cogs_net: "100.00", ad_spend: "10.00" });
    const equal = analyzeScenarioSensitivity(base, zero, ["-90", "0", "100"]);
    expect(equal.targets).toMatchObject([{ status: "constant_below", threshold_pct: null }, { status: "constant_equal", threshold_pct: null }]);
    const above = analyzeScenarioSensitivity(base, { ...zero, ad_change_pct: "-100" }, ["-90", "0", "100"]);
    expect(above.targets).toMatchObject([{ status: "constant_equal" }, { status: "constant_above" }]);
    expect(JSON.stringify(equal)).not.toMatch(/NaN|Infinity/);
  });
  it("labels a root below -90 as outside the supported range even when every permitted volume beats the goal", () => {
    const result = analyzeScenarioSensitivity(baseline({}), zero, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "-100.000000000000", status: "outside_range", range_outcome: "all_at_or_above" });
  });
  it("labels an unreachable root above +100 without extrapolating sensitivity beyond the input limit", () => {
    const result = analyzeScenarioSensitivity(baseline({ ad_spend: "500.00" }), zero, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "400.000000000000", status: "outside_range", range_outcome: "all_below" });
  });
  it.each([{ ad: "10.00", threshold: "-90.000000000000" }, { ad: "200.00", threshold: "100.000000000000" }])("accepts threshold exactly at inclusive range boundary $threshold", ({ ad, threshold }) => {
    expect(analyzeScenarioSensitivity(baseline({ ad_spend: ad }), zero, ["-90", "0", "100"]).targets[0]).toMatchObject({ threshold_pct: threshold, status: "within_range" });
  });
  it("uses unrounded exact algebra to classify a threshold infinitesimally above +100", () => {
    const result = analyzeScenarioSensitivity(baseline({ ad_spend: "100.00" }), { ...zero, ad_change_pct: "100.000000000000000000000000000001" }, ["-90", "0", "100"]);
    expect(result.targets[0]).toMatchObject({ threshold_pct: "100.000000000000", status: "outside_range", range_outcome: "all_below" });
  });
  it("retains huge precise amounts and a rational threshold without changing global Decimal precision", () => {
    const originalPrecision = Decimal.precision;
    const result = analyzeScenarioSensitivity(baseline({ gross_sales: "123456789012345678901234567890.12", ad_spend: "0.01" }), zero, ["0", "0", "0"]);
    expect(result.coefficients?.volume_coefficient).toBe("123456789012345678901234567890.12");
    expect(result.targets[1].threshold_fraction?.numerator).toBe("0");
    expect(result.sensitivity.rows[0].result.contribution).toBe("123456789012345678901234567890.11");
    expect(Decimal.precision).toBe(originalPrecision);
  });
  it.each([
    { volume_change_pct: "" }, { volume_change_pct: "-90.1" }, { assumptions_accepted: false }, { ad_change_pct: "-50", volume_change_pct: "" }, { discount_change_pp: "100" },
  ])("rejects an unvalidated parent scenario %j without thresholds", input => {
    const result = analyze(input);
    expect(result.status).not.toBe("valid");
    expect(result.targets).toEqual([]);
    expect(result.coefficients).toBeNull();
    expect(result.sensitivity.rows).toEqual([]);
  });
  it("missing baseline costs remain unavailable", () => {
    const result = analyzeScenarioSensitivity(baseline({ cogs_net: null }), zero, ["-10", "0", "10"]);
    expect(result.status).toBe("ineligible");
    expect(result.targets).toEqual([]);
  });
  it("stale context does not return usable new thresholds or sensitivity results", () => {
    const result = analyzeScenarioSensitivity(golden(), zero, ["-10", "0", "10"], { stale: true });
    expect(result).toMatchObject({ status: "stale", coefficients: null, targets: [], sensitivity: { status: "unavailable", rows: [] } });
  });
  it.each([["", "", ""], ["0", "", "10"], ["0", "10"], ["0", "10", "20", "30"]].map(values => ({ values })))("never fills missing sensitivity volume or silently drops extra cases $values", ({ values }) => {
    const result = analyze({}, values);
    expect(result.status).toBe("valid");
    expect(result.sensitivity.status).not.toBe("valid");
    expect(result.sensitivity.rows).toEqual([]);
  });
  it.each(["-90.00001", "100.00001", "1e1", "NaN", "10%", "<script>"])("invalid user sensitivity %s blocks the entire comparison", value => {
    expect(analyze({}, ["0", value, "10"]).sensitivity).toMatchObject({ status: "invalid", rows: [] });
  });
});

/*
 * V4-5 代理 C：G16 在 scenario-sensitivity 內（06_BATCHES V4-5「驗收重點」X29、邊界規則；CHART_CATALOG G16「單元測試」「邊界」；PRD §4.3 G16、§8.7）。
 * SSR（renderToStaticMarkup）：預設空白的三個假設不變、G16 在門檻說明之後與技術細節之前、stale 空狀態沿用既有過期說明（alert 不變）、
 * L＝0 不畫門檻點且副標用既有恆等／恆高／恆低句、超出範圍不畫點並在圖下寫「超出範圍」與範圍內是否達標、三點未填時不畫使用者點（不代填）。
 * 斷言只用 testid、labels 與格式化函式。
 */
describe("V4-5 G16 在 scenario-sensitivity 內（SSR）", () => {
  const g16 = labels.scenarios.chartsV4.threshold;
  const copy = labels.scenarios.sensitivity;
  const METRIC = metricDefinitions.contribution_after_marketing.label;
  const render = (base: ReturnType<typeof golden>, inputs: ScenarioInputs, options: { stale?: boolean; value?: SensitivityInputs } = {}) => renderToStaticMarkup(createElement(ScenarioSensitivity, { planId: "p", planName: "P", baseline: base, inputs, stale: options.stale, value: options.value, onChange: () => undefined }));
  const chart = (html: string) => element(html, `data-testid="${SCENARIOS_THRESHOLD_TESTID}"`)!;
  const pointIds = (html: string) => [...chart(html).matchAll(new RegExp(`data-testid="${SCENARIOS_THRESHOLD_POINT_PREFIX}([^"]+)"`, "g"))].map(match => match[1]);
  const tableRows = (html: string) => [...element(element(chart(html), `data-testid="${SCENARIOS_THRESHOLD_TABLE_TESTID}"`)!, "<tbody")!.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => [textOf(element(match[1], "<th")!), ...[...match[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(cell => cell[1])]);
  const subtitle = (html: string) => textOf(element(chart(html), 'id="scenarios-threshold-p-sub"')!);
  const title = (html: string) => textOf(element(chart(html), 'id="scenarios-threshold-p-title"')!);
  const f10 = { ...zero, fulfillment_change_pct: "-10" };

  it("X29：三個銷量假設預設空白（blankSensitivity），輸入框 value 都是空字串；沒有明填時 G16 沒有使用者點（不代填）", () => {
    expect(blankSensitivity().volumes).toEqual(["", "", ""]);
    const html = render(golden(), f10);
    const inputs = [...html.matchAll(/<input type="text" inputMode="decimal"[^>]*>/gi)].map(match => match[0]);
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input).toContain('value=""');
    expect(pointIds(html)).toEqual(["zero_contribution", "maintain_baseline"]);
    expect(html).not.toContain(copy.tableCaption);
  });

  it("G16 在 details.scenario-sensitivity 內恰好一份：門檻說明（threshold-{id}）之後、技術細節之前；inline、h4、sm；標題＝零貢獻目標的既有說明句", () => {
    const html = render(golden(), f10, { value: { volumes: ["-3", "-2.5", "0"] } });
    const details = element(html, 'data-testid="scenario-sensitivity"')!;
    expect(details.split(`data-testid="${SCENARIOS_THRESHOLD_TESTID}"`)).toHaveLength(2);
    const at = details.indexOf(`data-testid="${SCENARIOS_THRESHOLD_TESTID}"`);
    expect(at).toBeGreaterThan(details.indexOf('data-testid="threshold-maintain_baseline"'));
    expect(at).toBeLessThan(details.indexOf('class="sensitivity-formula"'));
    expect(at).toBeLessThan(details.indexOf(`<h4>${copy.inputsHeading}</h4>`));
    const open = openTag(details, `data-testid="${SCENARIOS_THRESHOLD_TESTID}"`)!;
    expect(open).toMatch(/^<section class="chart-section is-inline scenario-threshold"/);
    expect(open).not.toContain("panel");
    for (const attr of ['aria-labelledby="scenarios-threshold-p-title"', 'aria-describedby="scenarios-threshold-p-sub"']) expect(open).toContain(attr);
    const analysis = analyzeScenarioSensitivity(golden(), f10, ["-3", "-2.5", "0"]);
    // D-V4-46＝B：標題＝零貢獻門檻的既有目標名＋既有說明句。
    expect(chart(html)).toContain(`<h4 id="scenarios-threshold-p-title">${fill(g16.title, { target: thresholdTargetLabel("zero_contribution"), description: thresholdDescription(analysis.targets[0]) })}</h4>`);
    expect(subtitle(html)).toBe(fill(g16.subtitle, { section: g16.section, axis: fill(g16.axis, { metric: METRIC }) }));
    expect(openTag(chart(html), 'class="chart-frame sm"')).toContain('aria-hidden="true"');
    expect(openTag(chart(html), 'class="chart-frame sm"')).toContain('data-state="ready"');
    // 五個點：門檻點（空心 target）、使用者點（實心 total）；沒有連線、沒有可聚焦元素。
    expect(pointIds(html).sort()).toEqual(["a", "b", "c", "maintain_baseline", "zero_contribution"]);
    for (const id of ["zero_contribution", "maintain_baseline"]) expect(openTag(chart(html), `data-testid="${SCENARIOS_THRESHOLD_POINT_PREFIX}${id}"`)).toMatch(new RegExp(`fill="none" stroke="${chartColors.target.replace(/[()]/g, "\\$&")}"`));
    for (const id of ["a", "b", "c"]) expect(openTag(chart(html), `data-testid="${SCENARIOS_THRESHOLD_POINT_PREFIX}${id}"`)).toContain(`fill="${chartColors.total}"`);
    const frame = element(chart(html), 'class="chart-frame sm"')!;
    expect(frame).not.toMatch(/<path|<polyline|<polygon|tabindex|<button|<a\s|onclick/i);
    // 資料表（純文字）：門檻兩列在前、假設 A／B／C 在後；y 與敏感度表同列逐字相同（經格式化函式）。
    expect(tableRows(html)).toEqual([
      [thresholdTargetLabel("zero_contribution"), formatPercentNumber("-51.263537906137", "L2", { signed: true }), formatAmountL2("0.00"), g16.pointKinds.threshold],
      [thresholdTargetLabel("maintain_baseline"), formatPercentNumber("-2.527075812274", "L2", { signed: true }), formatAmountL2("270.00"), g16.pointKinds.threshold],
      [fill(copy.rowLabel, { letter: "A" }), formatPercentNumber("-3", "L2", { signed: true }), formatAmountL2("267.38"), g16.pointKinds.user],
      [fill(copy.rowLabel, { letter: "B" }), formatPercentNumber("-2.5", "L2", { signed: true }), formatAmountL2("270.15"), g16.pointKinds.user],
      [fill(copy.rowLabel, { letter: "C" }), formatPercentNumber("0", "L2", { signed: true }), formatAmountL2("284.00"), g16.pointKinds.user],
    ]);
    expect(element(chart(html), `data-testid="${SCENARIOS_THRESHOLD_TABLE_TESTID}"`)).not.toContain("number-link");
  });

  it("stale：既有 alert 輸出不變；G16 整張空狀態（state empty），說明沿用既有過期說明句；沒有點", () => {
    const html = render(golden(), f10, { stale: true, value: { volumes: ["-3", "-2.5", "0"] } });
    const stale = labels.scenarios.sensitivity.reasons.STALE_SCENARIO;
    expect(html).toContain(`<div class="alert" role="status"><p>${stale}</p></div><section class="chart-section is-inline scenario-threshold"`);
    expect(openTag(chart(html), 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(openTag(chart(html), 'class="chart-frame sm"')).not.toContain("aria-hidden");
    expect(textOf(element(chart(html), 'class="chart-frame-message"')!)).toBe(stale);
    expect(title(html)).toBe(g16.section);
    expect(pointIds(html)).toEqual([]);
    expect(chart(html)).not.toContain("chart-threshold\"");
    expect(tableRows(html)).toEqual([]);
    // 審查 R2-A11Y-1：過期分支的 <details> 內 G16 是唯一的標題（前一個標題是基準列 h2），用 h3，不新增 h2→h4 跳級；這個分支沒有任何 h4。
    expect(chart(html)).toContain(`<h3 id="scenarios-threshold-p-title">${g16.section}</h3>`);
    expect(element(html, 'data-testid="scenario-sensitivity"')).not.toMatch(/<h4\b/);
    // 審查 R1-V45-W1：空狀態的副標只寫區塊名與軸，不寫圖上沒有的空心圈與實心點。
    expect(subtitle(html)).toBe(fill(g16.subtitleEmpty, { section: g16.section, axis: fill(g16.axis, { metric: METRIC }) }));
    expect(subtitle(html)).not.toBe(fill(g16.subtitle, { section: g16.section, axis: fill(g16.axis, { metric: METRIC }) }));
  });

  it("L＝0（constant_below、constant_equal）：不畫門檻點、不列超出範圍；標題是零貢獻的恆低句、副標是維持現況的恆等句；三點明填時只有使用者點", () => {
    const base = baseline({ cogs_net: "100.00", ad_spend: "10.00" });
    const html = render(base, zero, { value: { volumes: ["-90", "0", "100"] } });
    // D-V4-46＝B：L＝0 時標題仍是零貢獻的恆低句，前面加既有目標名。
    expect(title(html)).toBe(fill(g16.title, { target: thresholdTargetLabel("zero_contribution"), description: copy.thresholdConstantBelow }));
    expect(subtitle(html)).toBe(fill(g16.subtitleFlat, { section: g16.section, target: thresholdTargetLabel("maintain_baseline"), description: copy.thresholdConstantEqual }));
    expect(pointIds(html)).toEqual(["a", "b", "c"]);
    expect(chart(html)).not.toContain("threshold-out-of-range");
    expect(tableRows(html).map(row => row[3])).toEqual([g16.pointKinds.user, g16.pointKinds.user, g16.pointKinds.user]);
    // 三點沒填：一個點都沒有 → 空狀態（說明句 g16.empty），軸不畫；副標仍是維持現況的恆等句（L＝0 的副標本來就沒有圖例句）。
    const blank = render(base, zero);
    expect(pointIds(blank)).toEqual([]);
    expect(openTag(chart(blank), 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(textOf(element(chart(blank), 'class="chart-frame-message"')!)).toBe(g16.empty);
    expect(subtitle(blank)).toBe(subtitle(html));
  });

  it("outside_range（零貢獻門檻 −100%、範圍內都達標）：不畫該點、不外插；圖下寫「超出範圍」與範圍內是否達標；資料表該列寫「超出範圍」", () => {
    const html = render(baseline({}), zero);
    expect(pointIds(html)).toEqual(["maintain_baseline"]);
    const after = element(chart(html), 'class="threshold-out-of-range"')!;
    expect(textOf(after)).toBe(fill(g16.outOfRange, { target: thresholdTargetLabel("zero_contribution"), outcome: copy.outcomeAllAtOrAbove }));
    expect(textOf(after)).toContain(g16.outOfRangeCell);
    // 圖下一行在 aria-hidden 的圖框之外（讀得到）。
    expect(element(chart(html), 'class="chart-frame sm"')).not.toContain("threshold-out-of-range");
    expect(tableRows(html)[0]).toEqual([thresholdTargetLabel("zero_contribution"), g16.outOfRangeCell, formatAmountL2("0.00"), g16.pointKinds.threshold]);
    // 超出 +100%（all_below）：outcome 用「都低於目標」。
    const above = render(baseline({ ad_spend: "500.00" }), zero);
    expect(pointIds(above)).not.toContain("zero_contribution");
    expect(textOf(element(chart(above), 'class="threshold-out-of-range"')!)).toBe(fill(g16.outOfRange, { target: thresholdTargetLabel("zero_contribution"), outcome: copy.outcomeAllBelow }));
  });

  it("審查 R1-V45-W1：L≠0、兩個門檻都超出範圍且三個假設沒填時是空狀態——副標不寫空心圈與實心點；圖下兩行「超出範圍」照寫", () => {
    // 毛銷售 100、其餘 0：L＝100、現況 100；一次性投入 300 時零貢獻門檻 +200%、維持現況門檻 +300%，都超出 +100%（範圍內都低於目標）。
    const html = render(baseline({}), { ...zero, one_time_cost: "300" });
    expect(pointIds(html)).toEqual([]);
    expect(openTag(chart(html), 'class="chart-frame sm"')).toContain('data-state="empty"');
    expect(textOf(element(chart(html), 'class="chart-frame-message"')!)).toBe(g16.empty);
    expect(subtitle(html)).toBe(fill(g16.subtitleEmpty, { section: g16.section, axis: fill(g16.axis, { metric: METRIC }) }));
    expect([...chart(html).matchAll(/<p class="note" data-target="([^"]+)">/g)].map(match => match[1])).toEqual(["zero_contribution", "maintain_baseline"]);
    // valid 分支：標題 h4（與「兩個目標」「自己填三個銷量假設」同層）。
    expect(chart(html)).toMatch(/<h4 id="scenarios-threshold-p-title">/);
  });

  it("審查 R1-V45-W2：零貢獻門檻點的標籤帶「扣廣告後貢獻 = 0」（不單寫「打平」，T＝0 不是公司淨利損益兩平）；名稱與百分比用「：」隔開", () => {
    const html = render(golden(), f10);
    const labelsOf = [...element(chart(html), 'class="threshold-labels"')!.matchAll(/<text class="chart-value threshold-label is-threshold"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
    const zeroName = fill(g16.pointNames.zero_contribution, { metric: METRIC });
    expect(zeroName).toContain(METRIC);
    expect(labelsOf).toEqual([
      fill(g16.pointLabel, { name: zeroName, pct: formatPercentNumber("-51.263537906137", "L1", { signed: true }) }),
      fill(g16.pointLabel, { name: g16.pointNames.maintain_baseline, pct: formatPercentNumber("-2.527075812274", "L1", { signed: true }) }),
    ]);
    // 與既有目標名「打平（扣廣告後貢獻 = 0）」括號內的字相同。
    expect(thresholdTargetLabel("zero_contribution")).toContain(zeroName);
  });

  it("審查 R2-A11Y-2：資料表 caption（捲動區 region 的名稱）帶方案名稱", () => {
    const html = render(golden(), f10);
    const caption = fill(g16.caption, { plan: "P", section: g16.section });
    const table = element(chart(html), 'class="table-scroll chart-data-scroll"')!;
    expect(openTag(table, 'class="table-scroll chart-data-scroll"')).toContain(`aria-label="${caption}"`);
    expect(textOf(element(table, "<caption")!)).toBe(caption);
  });

  it.each([["0", "", "10"], ["", "", ""], ["abc", "0", "10"]])("三個假設沒有都明填且有效（%s、%s、%s）：沒有使用者點、不代填", (...volumes) => {
    const html = render(golden(), f10, { value: { volumes: volumes as SensitivityInputs["volumes"] } });
    expect(pointIds(html).filter(id => ["a", "b", "c"].includes(id))).toEqual([]);
    expect(tableRows(html).map(row => row[3])).toEqual([g16.pointKinds.threshold, g16.pointKinds.threshold]);
  });

  it("所有點的 x 都在 [−90%, +100%]（X29）：門檻剛好在 −90、+100 時照畫；超界一點點時不畫", () => {
    for (const ad of ["10.00", "200.00"]) expect(pointIds(render(baseline({ ad_spend: ad }), zero))).toContain("zero_contribution");
    expect(pointIds(render(baseline({ ad_spend: "100.00" }), { ...zero, ad_change_pct: "100.000000000000000000000000000001" }))).not.toContain("zero_contribution");
  });
});
