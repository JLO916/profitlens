import Decimal from "decimal.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { calculateMetrics } from "@/domain/metrics";
import { buildScenarioBaseline, calculateScenario, type ScenarioBaseline, type ScenarioInputs } from "@/domain/scenarios";
import { analyzeScenarioSensitivity, SENSITIVITY_VERSION, type ScenarioSensitivityAnalysis } from "@/domain/scenario-sensitivity";
import { AMOUNT_FIELDS, type AmountField, type Summary, type Totals } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { chartColors } from "@/application/chart-theme";
import { SENSITIVITY_POINT_IDS, THRESHOLD_V_MAX, THRESHOLD_V_MIN, thresholdPoints, withinThresholdRange, type ThresholdPoint } from "@/application/chart-threshold";
import { blankSensitivity } from "@/application/decision";
import { ThresholdLine, thresholdGeometry } from "@/components/charts/threshold-line";
import { fixture } from "./helpers/fixtures";

// V4-5 代理 A：G16 thresholdPoints（CHART_CATALOG G16「單元測試」；PRD §4.3 G16、X29；D-V4-20＝A′）。
// A 級（只組既有點）：門檻點的 v、y 逐字取自 analyzeScenarioSensitivity 的 targets（threshold_pct、target），使用者點逐字取自 sensitivity.rows；
// x 一律在 [−90, +100]；outside_range 不畫；L＝0 只有使用者點；stale；三點未填不代填；A′ 不連線。golden 試算 284.00／264.00／19.70 不變。

const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
const goldenBaseline = (channel = "DTC") => buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels[channel], true);
/** 與 tests/scenario-sensitivity.test.ts 相同的合成 baseline：G 預設 100.00、其他 0.00；null 表示缺值。 */
function baseline(values: Partial<Record<AmountField, string | null>>): ScenarioBaseline {
  const totals = Object.fromEntries(AMOUNT_FIELDS.map(field => {
    const value = field in values ? values[field] : field === "gross_sales" ? "100.00" : "0.00";
    return [field, { cents: value == null ? null : BigInt(value.replace(".", "")), reason_codes: value == null ? ["MISSING_COST"] : [] }];
  })) as Totals;
  const summary: Summary = { totals, metrics: calculateMetrics(totals), sources: [], units_sold: { value: null, reason_codes: [] } };
  return buildScenarioBaseline(summary, true);
}
/** golden 的三個方案（docs/SCENARIOS.md Test anchors；tests/scenarios.test.ts）：DTC f−10%＝284.00、加 K20＝264.00、MARKETPLACE＝19.70。 */
const PLANS = {
  dtc284: { channel: "DTC", inputs: { ...zero, fulfillment_change_pct: "-10" }, contribution: "284.00" },
  dtc264: { channel: "DTC", inputs: { ...zero, fulfillment_change_pct: "-10", one_time_cost: "20" }, contribution: "264.00" },
  marketplace1970: { channel: "MARKETPLACE", inputs: { volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20", assumptions_accepted: true }, contribution: "19.70" },
} as const;
const inRange = (v: string) => new Decimal(v).gte(THRESHOLD_V_MIN) && new Decimal(v).lte(THRESHOLD_V_MAX);
const ids = (points: readonly ThresholdPoint[]) => points.map(point => point.id);

describe("golden 方案：門檻點與使用者點逐字取自 domain（A 級）", () => {
  it("golden 試算 284.00／264.00／19.70 不變（thresholdPoints 只讀 analyze 的結果，不改 domain）", () => {
    for (const plan of Object.values(PLANS)) expect(calculateScenario(goldenBaseline(plan.channel), plan.inputs)).toMatchObject({ status: "valid", contribution: plan.contribution });
  });

  it("DTC f−10%（284.00）：兩個門檻點 y＝目標值本身（0.00、270.00），使用者點 a／b／c 的 y＝敏感度表同列的 228.60、284.00、339.40", () => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["-10", "0", "10"]);
    const result = thresholdPoints(analysis);
    expect(result).toEqual({
      points: [
        { id: "zero_contribution", kind: "threshold", v: "-51.263537906137", y: "0.00" },
        { id: "maintain_baseline", kind: "threshold", v: "-2.527075812274", y: "270.00" },
        { id: "a", kind: "user", v: "-10", y: "228.60" },
        { id: "b", kind: "user", v: "0", y: "284.00" },
        { id: "c", kind: "user", v: "10", y: "339.40" },
      ],
      outOfRange: [], flat: false, stale: false,
    });
    // 每個點的 y 與敏感度表同列逐字相同（PRD §4.5 G16）。
    expect(result.points.filter(point => point.kind === "user").map(point => point.y)).toEqual(analysis.sensitivity.rows.map(row => row.result.contribution));
  });

  it("DTC f−10%、K20（264.00）：K 只算一次——門檻 −47.65…、+1.08…，使用者點 208.60、264.00、319.40", () => {
    const result = thresholdPoints(analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc264.inputs, ["-10", "0", "10"]));
    expect(result.points).toEqual([
      { id: "zero_contribution", kind: "threshold", v: "-47.653429602888", y: "0.00" },
      { id: "maintain_baseline", kind: "threshold", v: "1.083032490975", y: "270.00" },
      { id: "a", kind: "user", v: "-10", y: "208.60" },
      { id: "b", kind: "user", v: "0", y: "264.00" },
      { id: "c", kind: "user", v: "10", y: "319.40" },
    ]);
  });

  it("MARKETPLACE（19.70）：使用者點 v 保留原字串（含 +）、y＝該假設的試算結果；門檻點與 domain 的 within_range 目標一一對應", () => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline("MARKETPLACE"), PLANS.marketplace1970.inputs, ["+20", "20", "-10"]);
    expect(analysis.status).toBe("valid");
    const result = thresholdPoints(analysis);
    const users = result.points.filter(point => point.kind === "user");
    expect(users.slice(0, 2)).toEqual([{ id: "a", kind: "user", v: "+20", y: "19.70" }, { id: "b", kind: "user", v: "20", y: "19.70" }]);
    expect(users[2]).toEqual({ id: "c", kind: "user", v: "-10", y: analysis.sensitivity.rows[2].result.contribution });
    const within = analysis.targets.filter(target => target.status === "within_range");
    expect(result.points.filter(point => point.kind === "threshold")).toEqual(within.map(target => ({ id: target.id, kind: "threshold", v: target.threshold_pct, y: target.target })));
    expect(result.outOfRange).toEqual(analysis.targets.filter(target => target.status === "outside_range").map(target => target.id));
    expect(within.length + result.outOfRange.length).toBe(2);
  });

  it("門檻點在前（zero_contribution、maintain_baseline）、使用者點在後（a、b、c）；id 沒有陣列索引", () => {
    const result = thresholdPoints(analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["5", "-5", "0"]));
    expect(ids(result.points)).toEqual(["zero_contribution", "maintain_baseline", ...SENSITIVITY_POINT_IDS]);
    for (const id of ids(result.points)) expect(id).not.toMatch(/^\d+$/);
  });
});

describe("X29：所有點的 x 在 [−90%, +100%]，不外插", () => {
  const cases: { name: string; base: ScenarioBaseline; inputs: ScenarioInputs; volumes: string[] }[] = [
    { name: "golden DTC 284", base: goldenBaseline(), inputs: PLANS.dtc284.inputs, volumes: ["-90", "0", "100"] },
    { name: "golden DTC 264", base: goldenBaseline(), inputs: PLANS.dtc264.inputs, volumes: ["-89.999", "+99.999", "0.5"] },
    { name: "golden MARKETPLACE 19.70", base: goldenBaseline("MARKETPLACE"), inputs: PLANS.marketplace1970.inputs, volumes: ["-90", "20", "100"] },
    { name: "門檻剛好 −90（含邊界）", base: baseline({ ad_spend: "10.00" }), inputs: zero, volumes: ["-90", "0", "100"] },
    { name: "門檻剛好 +100（含邊界）", base: baseline({ ad_spend: "200.00" }), inputs: zero, volumes: ["-90", "0", "100"] },
    { name: "門檻 −100（超界）", base: baseline({}), inputs: zero, volumes: ["-90", "0", "100"] },
    { name: "門檻 +400（超界）", base: baseline({ ad_spend: "500.00" }), inputs: zero, volumes: ["-90", "0", "100"] },
    { name: "L 為負", base: baseline({ cogs_net: "150.00", ad_spend: "10.00" }), inputs: zero, volumes: ["-10", "0", "10"] },
  ];
  it.each(cases)("$name：每個點 v ∈ [−90, 100]（Decimal 判斷），超界的門檻不出現在 points", ({ base, inputs, volumes }) => {
    const analysis = analyzeScenarioSensitivity(base, inputs, volumes);
    const result = thresholdPoints(analysis);
    for (const point of result.points) expect(inRange(point.v), `${point.id} ${point.v}`).toBe(true);
    for (const id of result.outOfRange) expect(ids(result.points)).not.toContain(id);
  });

  it("門檻剛好在 −90、+100（含邊界）時是點；超界一點點（未取分判定）時不是點、列入 outOfRange", () => {
    expect(thresholdPoints(analyzeScenarioSensitivity(baseline({ ad_spend: "10.00" }), zero, ["0", "0", "0"])).points[0]).toEqual({ id: "zero_contribution", kind: "threshold", v: "-90.000000000000", y: "0.00" });
    expect(thresholdPoints(analyzeScenarioSensitivity(baseline({ ad_spend: "200.00" }), zero, ["0", "0", "0"])).points[0]).toEqual({ id: "zero_contribution", kind: "threshold", v: "100.000000000000", y: "0.00" });
    const above = thresholdPoints(analyzeScenarioSensitivity(baseline({ ad_spend: "100.00" }), { ...zero, ad_change_pct: "100.000000000000000000000000000001" }, ["0", "0", "0"]));
    expect(above.outOfRange).toContain("zero_contribution");
    expect(ids(above.points)).not.toContain("zero_contribution");
  });

  it("withinThresholdRange：只接受十進位字串且在 [−90, 100]（含邊界）", () => {
    for (const ok of ["-90", "-90.000000000000", "0", "+20", "100", "100.000000000000", "-2.527075812274"]) expect(withinThresholdRange(ok), ok).toBe(true);
    for (const bad of ["-90.000000000001", "100.0000000001", "-100.000000000000", "400.000000000000", "", " ", "1e1", "NaN", "10%", null, undefined]) expect(withinThresholdRange(bad), String(bad)).toBe(false);
  });
});

describe("邊界：outside_range、L＝0、stale、三點未填", () => {
  it("outside_range 不出現在 points，id 列在 outOfRange（門檻 −100、範圍內都達標）", () => {
    const analysis = analyzeScenarioSensitivity(baseline({}), zero, ["-90", "0", "100"]);
    expect(analysis.targets[0]).toMatchObject({ status: "outside_range", range_outcome: "all_at_or_above" });
    const result = thresholdPoints(analysis);
    expect(result.outOfRange).toEqual(["zero_contribution"]);
    expect(ids(result.points)).toEqual(["maintain_baseline", "a", "b", "c"]);
  });

  it("L＝0（constant_*）：flat＝true，points 只含使用者點（沒有門檻點、也不列 outOfRange）", () => {
    const base = baseline({ cogs_net: "100.00", ad_spend: "10.00" });
    for (const inputs of [zero, { ...zero, ad_change_pct: "-100" }]) {
      const analysis = analyzeScenarioSensitivity(base, inputs, ["-90", "0", "100"]);
      expect(analysis.coefficients?.slope).toBe("zero");
      expect(analysis.targets.every(target => target.status.startsWith("constant_"))).toBe(true);
      const result = thresholdPoints(analysis);
      expect(result.flat).toBe(true);
      expect(result.outOfRange).toEqual([]);
      expect(result.points.every(point => point.kind === "user")).toBe(true);
      expect(ids(result.points)).toEqual(["a", "b", "c"]);
    }
    const unfilled = thresholdPoints(analyzeScenarioSensitivity(base, zero, ["", "", ""]));
    expect(unfilled).toEqual({ points: [], outOfRange: [], flat: true, stale: false });
  });

  it("L＝0 用未取分的 slope 判斷：|L| < 0.005 時 volume_coefficient 顯示 \"0.00\"，但 domain 仍有門檻、照畫門檻點", () => {
    // G 100.00、C 99.99、δ 0.00999 個百分點：H＝100，L＝[(100 − 100 × 0.0000999) × 100 − 100 × 99.99] ÷ 100＝0.00001（取到分是 "0.00"，但不是 0）。
    const analysis = analyzeScenarioSensitivity(baseline({ cogs_net: "99.99" }), { ...zero, discount_change_pp: "0.00999" }, ["0", "0", "0"]);
    expect(analysis.coefficients).toMatchObject({ volume_coefficient: "0.00", slope: "positive" });
    const result = thresholdPoints(analysis);
    expect(result.flat).toBe(false);
    expect(result.points.filter(point => point.kind === "threshold").length + result.outOfRange.length).toBe(2);
  });

  it("stale：stale＝true，points、outOfRange 都空（domain 不回傳門檻與敏感度）", () => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["-10", "0", "10"], { stale: true });
    expect(analysis.status).toBe("stale");
    expect(thresholdPoints(analysis)).toEqual({ points: [], outOfRange: [], flat: false, stale: true });
  });

  it("母方案無效（invalid、ineligible）：沒有點，stale＝false", () => {
    for (const analysis of [analyzeScenarioSensitivity(goldenBaseline(), { ...zero, volume_change_pct: "" }, ["0", "0", "0"]), analyzeScenarioSensitivity(baseline({ cogs_net: null }), zero, ["0", "0", "0"])]) {
      expect(["invalid", "ineligible"]).toContain(analysis.status);
      expect(thresholdPoints(analysis)).toEqual({ points: [], outOfRange: [], flat: false, stale: false });
    }
  });

  it.each([["", "", ""], ["0", "", "10"], ["0", "10"], ["0", "10", "20", "30"], ["0", "-90.1", "10"]].map(volumes => ({ volumes })))("三點未填、不完整或無效 $volumes：沒有使用者點（不代填），門檻點照畫", ({ volumes }) => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, volumes);
    expect(analysis.sensitivity.status).not.toBe("valid");
    const result = thresholdPoints(analysis);
    expect(result.points.some(point => point.kind === "user")).toBe(false);
    expect(ids(result.points)).toEqual(["zero_contribution", "maintain_baseline"]);
  });

  it("敏感度輸入預設空白不變（blankSensitivity）：預設輸入下沒有使用者點", () => {
    expect(blankSensitivity()).toEqual({ volumes: ["", "", ""] });
    const result = thresholdPoints(analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, blankSensitivity().volumes));
    expect(result.points.filter(point => point.kind === "user")).toEqual([]);
  });

  it("第二個參數（敏感度段）預設是 analysis.sensitivity；傳入非 valid 的段時不畫使用者點", () => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["-10", "0", "10"]);
    expect(thresholdPoints(analysis, analysis.sensitivity)).toEqual(thresholdPoints(analysis));
    const invalid: ScenarioSensitivityAnalysis["sensitivity"] = { ...analysis.sensitivity, status: "invalid" };
    expect(ids(thresholdPoints(analysis, invalid).points)).toEqual(["zero_contribution", "maintain_baseline"]);
  });

  it("輸入不被修改；輸出可序列化（金額與百分數都是字串）", () => {
    const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["-10", "0", "10"]);
    const before = structuredClone(analysis);
    const result = thresholdPoints(analysis);
    expect(analysis).toEqual(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const point of result.points) expect([typeof point.v, typeof point.y]).toEqual(["string", "string"]);
    expect(analysis.version).toBe(SENSITIVITY_VERSION);
  });
});

describe("D-V4-20＝A′：只畫點、不連線", () => {
  const analysis = analyzeScenarioSensitivity(goldenBaseline(), PLANS.dtc284.inputs, ["-10", "0", "10"]);
  const points = thresholdPoints(analysis).points;

  it("thresholdGeometry 不輸出線段：connected 恆為 false，幾何沒有任何連接兩點的欄位", () => {
    for (const width of [300, 560, 900]) {
      const geometry = thresholdGeometry(points, width);
      expect(geometry.connected).toBe(false);
      expect(Object.keys(geometry).sort()).toEqual(["connected", "domain", "dropped", "height", "narrow", "plot", "points", "width", "xTicks", "yTicks", "zeroY"]);
      expect(geometry.points).toHaveLength(points.length);
    }
  });

  it("SSR：圖內沒有 path、polyline、polygon；每條 line 不是水平格線／零線（橫跨整個繪圖區）就是繪圖區下緣 4px 的 x 刻度", () => {
    const html = renderToStaticMarkup(createElement(ThresholdLine, { points, testIdPrefix: "chart-scenarios-threshold-point-" }));
    expect(html).not.toMatch(/<(path|polyline|polygon)\b/);
    const { plot } = thresholdGeometry(points, 560);
    const lines = [...html.matchAll(/<line(?: class="[^"]*")? x1="([\d.]+)" x2="([\d.]+)" y1="([\d.]+)" y2="([\d.]+)"/g)].map(match => match.slice(1).map(Number));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBe((html.match(/<line\b/g) ?? []).length);
    for (const [x1, x2, y1, y2] of lines) {
      const horizontal = y1 === y2 && x1 === plot.left && x2 === plot.right;
      const tick = x1 === x2 && y1 === plot.bottom && y2 - y1 === 4;
      expect(horizontal || tick, `${x1},${x2},${y1},${y2}`).toBe(true);
    }
  });

  it("門檻點空心（fill none、stroke chartColors.target）、使用者點實心 chartColors.total；不用強調色 chartColors.current", () => {
    const html = renderToStaticMarkup(createElement(ThresholdLine, { points, testIdPrefix: "chart-scenarios-threshold-point-" }));
    for (const id of ["zero_contribution", "maintain_baseline"]) {
      const circle = new RegExp(`<circle[^>]*data-testid="chart-scenarios-threshold-point-${id}"[^>]*>`).exec(html)![0];
      expect(circle).toContain('fill="none"');
      expect(circle).toContain(`stroke="${chartColors.target}"`);
    }
    for (const id of SENSITIVITY_POINT_IDS) {
      const circle = new RegExp(`<circle[^>]*data-testid="chart-scenarios-threshold-point-${id}"[^>]*>`).exec(html)![0];
      expect(circle).toContain(`fill="${chartColors.total}"`);
      expect(circle).not.toContain("stroke=");
    }
    expect(html).not.toContain(chartColors.current);
  });
});
