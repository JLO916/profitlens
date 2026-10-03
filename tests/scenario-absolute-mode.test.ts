import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "@/domain/scenarios";
import { validateDataset } from "@/domain/validation";
import { ABSOLUTE_FIELDS, SCENARIO_INPUT_BOUNDS, absoluteAvailability, absoluteContext, absoluteToRelative, rangeHint, relativeToAbsolute, type AbsoluteContext } from "@/application/scenario-presets";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

const copy = labels.scenarioPresets;
const ctx = (patch: Partial<AbsoluteContext> = {}): AbsoluteContext => ({ units_sold: 8n, discount_rate: "0.100000000000", ad_spend: "1000.00", ...patch });
const pct = (value: string) => fill(copy.absolute.equivalentPct, { value });
const points = (value: string) => fill(copy.absolute.equivalentPoints, { value });
const units = (value: string, approx = false) => fill(approx ? copy.absolute.equivalentUnitsApprox : copy.absolute.equivalentUnits, { value: fill(labels.assist.units.count, { value }) });
const pctHint = (min: string, max: string) => fill(copy.range.pct, { min, max });
function goldenSummary(channel: "DTC" | "MARKETPLACE") { return analyzeDataset(validateDataset(fixture()).dataset!).current.channels[channel]; }
const accepted = (patch: Partial<ScenarioInputs>): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });

describe("R5-3 absolute ↔ relative conversion (form layer only)", () => {
  it("volume: v = (target ÷ current units − 1) × 100, hand-checked", () => {
    // 本期 8 件：目標 10 → 10/8−1 = 0.25 → 25；目標 8 → 0；目標 4 → −50；目標 0 → −100（交給界限提示）。
    expect(absoluteToRelative("volume_change_pct", "10", ctx())).toEqual({ relative: "25", equivalent: pct("+25.0") });
    expect(absoluteToRelative("volume_change_pct", "8", ctx())).toEqual({ relative: "0", equivalent: pct("0.0") });
    expect(absoluteToRelative("volume_change_pct", "4", ctx())).toEqual({ relative: "-50", equivalent: pct("−50.0") });
    expect(absoluteToRelative("volume_change_pct", "0", ctx())).toEqual({ relative: "-100", equivalent: pct("−100.0") });
    expect(absoluteToRelative("volume_change_pct", " 12 ", ctx())).toEqual({ relative: "50", equivalent: pct("+50.0") });
  });
  it("rounds the engine value HALF_UP to four decimals and strips trailing zeros", () => {
    // 3 → 4：1/3 = 33.3333…；3 → 5：66.6666… → 66.6667；3 → 2：−33.3333…
    expect(absoluteToRelative("volume_change_pct", "4", ctx({ units_sold: 3n }))).toEqual({ relative: "33.3333", equivalent: pct("+33.3") });
    expect(absoluteToRelative("volume_change_pct", "5", ctx({ units_sold: 3n }))).toEqual({ relative: "66.6667", equivalent: pct("+66.7") });
    expect(absoluteToRelative("volume_change_pct", "2", ctx({ units_sold: 3n })).relative).toBe("-33.3333");
    // 廣告 2,000,000：新預算 2,000,001 → +0.00005 → 0.0001；1,999,999 → −0.00005 → −0.0001（HALF_UP 遠離 0）。
    expect(absoluteToRelative("ad_change_pct", "2000001", ctx({ ad_spend: "2000000.00" }))).toEqual({ relative: "0.0001", equivalent: pct("0.0") });
    expect(absoluteToRelative("ad_change_pct", "1999999", ctx({ ad_spend: "2000000.00" }))).toEqual({ relative: "-0.0001", equivalent: pct("0.0") });
    // 1000 → 1234.5：+23.45
    expect(absoluteToRelative("ad_change_pct", "1234.5", ctx()).relative).toBe("23.45");
  });
  it("discount: δ = new rate(%) − current rate(%) in percentage points", () => {
    // 本期 0.1（10%）→ 新 12% → +2 點；新 10% → 0；新 7.5% → −2.5 點；新 0% → −10 點。
    expect(absoluteToRelative("discount_change_pp", "12", ctx())).toEqual({ relative: "2", equivalent: points("+2.0") });
    expect(absoluteToRelative("discount_change_pp", "10", ctx())).toEqual({ relative: "0", equivalent: points("0.0") });
    expect(absoluteToRelative("discount_change_pp", "7.5", ctx())).toEqual({ relative: "-2.5", equivalent: points("−2.5") });
    expect(absoluteToRelative("discount_change_pp", "0", ctx())).toEqual({ relative: "-10", equivalent: points("−10.0") });
  });
  it("ad budget: a = (new budget ÷ current ad spend − 1) × 100", () => {
    expect(absoluteToRelative("ad_change_pct", "500", ctx())).toEqual({ relative: "-50", equivalent: pct("−50.0") });
    expect(absoluteToRelative("ad_change_pct", "1500", ctx())).toEqual({ relative: "50", equivalent: pct("+50.0") });
    expect(absoluteToRelative("ad_change_pct", "1000.00", ctx())).toEqual({ relative: "0", equivalent: pct("0.0") });
    expect(absoluteToRelative("ad_change_pct", "0", ctx())).toEqual({ relative: "-100", equivalent: pct("−100.0") });
  });
  it("disables a field when its current value is missing or not positive", () => {
    for (const units_sold of [0n, -1n, null]) {
      expect(absoluteAvailability("volume_change_pct", ctx({ units_sold }))).toEqual({ available: false, reason: copy.absolute.unavailable.volume_change_pct });
      expect(absoluteToRelative("volume_change_pct", "10", ctx({ units_sold }))).toEqual({ relative: null, equivalent: "", error: copy.absolute.unavailable.volume_change_pct });
      expect(relativeToAbsolute("volume_change_pct", "10", ctx({ units_sold }))).toBeNull();
    }
    for (const ad_spend of ["0.00", "-5.00", null]) {
      expect(absoluteAvailability("ad_change_pct", ctx({ ad_spend }))).toEqual({ available: false, reason: copy.absolute.unavailable.ad_change_pct });
      expect(absoluteToRelative("ad_change_pct", "500", ctx({ ad_spend })).relative).toBeNull();
    }
    expect(absoluteAvailability("discount_change_pp", ctx({ discount_rate: null }))).toEqual({ available: false, reason: copy.absolute.unavailable.discount_change_pp });
    expect(absoluteToRelative("discount_change_pp", "12", ctx({ discount_rate: null })).error).toBe(copy.absolute.unavailable.discount_change_pp);
    for (const field of ABSOLUTE_FIELDS) expect(absoluteAvailability(field, ctx())).toEqual({ available: true });
  });
  it("rejects illegal absolute text with a labelled error and no relative value", () => {
    const invalid = (field: typeof ABSOLUTE_FIELDS[number]) => ({ relative: null, equivalent: "", error: copy.absolute.errors[field] });
    for (const text of ["-5", "8.5", "abc", "1,000", "1e3", "+10", "10%"]) expect(absoluteToRelative("volume_change_pct", text, ctx()), text).toEqual(invalid("volume_change_pct"));
    for (const text of ["-1", "100", "120", "abc", "12%", "1e1"]) expect(absoluteToRelative("discount_change_pp", text, ctx()), text).toEqual(invalid("discount_change_pp"));
    for (const text of ["-500", "500.123", "abc", "1,500", "1e3"]) expect(absoluteToRelative("ad_change_pct", text, ctx()), text).toEqual(invalid("ad_change_pct"));
    // 空白是「還沒填」：沒有相對值，也不顯示錯誤。
    expect(absoluteToRelative("volume_change_pct", "   ", ctx())).toEqual({ relative: null, equivalent: "" });
  });
  it("relativeToAbsolute shows the reverse equivalent with units, rate and money formatting", () => {
    expect(relativeToAbsolute("volume_change_pct", "25", ctx())).toBe(units("10"));
    expect(relativeToAbsolute("volume_change_pct", "-50", ctx())).toBe(units("4"));
    expect(relativeToAbsolute("volume_change_pct", "10", ctx())).toBe(units("9", true)); // 8 × 1.1 = 8.8 → 約 9 件
    expect(relativeToAbsolute("volume_change_pct", "23.4", ctx({ units_sold: 1000n }))).toBe(units("1,234"));
    expect(relativeToAbsolute("discount_change_pp", "2", ctx())).toBe(fill(copy.absolute.equivalentDiscountRate, { value: "12.0" }));
    expect(relativeToAbsolute("discount_change_pp", "-2.25", ctx())).toBe(fill(copy.absolute.equivalentDiscountRate, { value: "7.8" }));
    expect(relativeToAbsolute("ad_change_pct", "-50", ctx())).toBe(fill(copy.absolute.equivalentBudget, { value: "500.00" }));
    expect(relativeToAbsolute("ad_change_pct", "23.45", ctx({ ad_spend: "10000.00" }))).toBe(fill(copy.absolute.equivalentBudget, { value: "12,345.00" }));
    // 空白、格式不合、或換算後不可能的值（負件數、負預算、折扣率超出 0–100%）→ null
    for (const text of ["", "abc", "10%"]) expect(relativeToAbsolute("volume_change_pct", text, ctx())).toBeNull();
    expect(relativeToAbsolute("volume_change_pct", "-150", ctx())).toBeNull();
    expect(relativeToAbsolute("ad_change_pct", "-101", ctx())).toBeNull();
    expect(relativeToAbsolute("discount_change_pp", "90", ctx())).toBeNull();
    expect(relativeToAbsolute("discount_change_pp", "-10.5", ctx())).toBeNull();
  });
  it("absolute → relative → absolute round trips on exact values", () => {
    for (const [field, text, expected] of [["volume_change_pct", "10", units("10")], ["discount_change_pp", "12", fill(copy.absolute.equivalentDiscountRate, { value: "12.0" })], ["ad_change_pct", "1500", fill(copy.absolute.equivalentBudget, { value: "1,500.00" })]] as const) {
      expect(relativeToAbsolute(field, absoluteToRelative(field, text, ctx()).relative!, ctx())).toBe(expected);
    }
  });
});

describe("R5-3 range hints mirror the engine's INPUT_OUT_OF_RANGE bounds", () => {
  it("volume −90…100, fulfillment −100…100, ad −100…200 (inclusive)", () => {
    expect(rangeHint("volume_change_pct", "101")).toBe(pctHint("−90", "+100"));
    expect(rangeHint("volume_change_pct", "100")).toBeNull();
    expect(rangeHint("volume_change_pct", "-90")).toBeNull();
    expect(rangeHint("volume_change_pct", "-91")).toBe(pctHint("−90", "+100"));
    expect(rangeHint("ad_change_pct", "201")).toBe(pctHint("−100", "+200"));
    expect(rangeHint("ad_change_pct", "200")).toBeNull();
    expect(rangeHint("ad_change_pct", "-100")).toBeNull();
    expect(rangeHint("ad_change_pct", "-100.0001")).toBe(pctHint("−100", "+200"));
    expect(rangeHint("fulfillment_change_pct", "100.5")).toBe(pctHint("−100", "+100"));
    expect(rangeHint("fulfillment_change_pct", "-100")).toBeNull();
  });
  it("discount checks the converted rate 0 ≤ rate < 100% and needs the current rate", () => {
    // 本期 10%：+90 點 → 100% 超界；+89.9 → 99.9% 可；−10 → 0% 可；−10.1 → −0.1% 超界。
    expect(rangeHint("discount_change_pp", "90", ctx())).toBe(fill(copy.range.discount, { rate: "100.0" }));
    expect(rangeHint("discount_change_pp", "89.9", ctx())).toBeNull();
    expect(rangeHint("discount_change_pp", "-10", ctx())).toBeNull();
    expect(rangeHint("discount_change_pp", "-10.1", ctx())).toBe(fill(copy.range.discount, { rate: "−0.1" }));
    expect(rangeHint("discount_change_pp", "90")).toBeNull();
    expect(rangeHint("discount_change_pp", "90", { discount_rate: null })).toBeNull();
  });
  it("one-time cost must be ≥ 0 with at most two decimals; blanks are not hinted", () => {
    expect(rangeHint("one_time_cost", "50000")).toBeNull();
    expect(rangeHint("one_time_cost", "0.05")).toBeNull();
    expect(rangeHint("one_time_cost", "-0")).toBeNull();
    for (const text of ["-1", "1.234", "1,000", "abc"]) expect(rangeHint("one_time_cost", text), text).toBe(copy.range.oneOff);
    for (const field of ["volume_change_pct", "discount_change_pp", "fulfillment_change_pct", "ad_change_pct", "one_time_cost"] as const) expect(rangeHint(field, "  ")).toBeNull();
  });
  it("flags non-decimal relative text the engine would reject", () => {
    for (const text of ["10%", "1,000", "1e2", "abc", "+"]) expect(rangeHint("volume_change_pct", text), text).toBe(copy.range.invalidNumber);
    expect(rangeHint("volume_change_pct", "+10")).toBeNull();
  });
  it("agrees with calculateScenario at and just beyond every bound", () => {
    const baseline = buildScenarioBaseline(goldenSummary("DTC"), true);
    for (const [field, { min, max }] of Object.entries(SCENARIO_INPUT_BOUNDS) as [keyof typeof SCENARIO_INPUT_BOUNDS, { min: number; max: number }][]) {
      for (const [value, ok] of [[String(min), true], [String(max), true], [`${min}.0001`, false], [`${max}.0001`, false]] as const) {
        const result = calculateScenario(baseline, accepted({ [field]: value }));
        expect(result.status === "valid", `${field}=${value}`).toBe(ok);
        if (!ok) expect(result.reasons.map(reason => reason.code)).toContain("INPUT_OUT_OF_RANGE");
        expect(rangeHint(field, value) === null, `${field}=${value}`).toBe(ok);
      }
    }
    // 折扣：本期 230/1800；−12.7777777778 點 → 0%（可）；再少一點 → 超界。
    const rates = { discount_rate: baseline.rates.discount_rate };
    for (const [value, ok] of [["-12.7777777777", true], ["-12.78", false], ["87.2", true], ["87.23", false]] as const) {
      expect(calculateScenario(baseline, accepted({ discount_change_pp: value })).status === "valid", value).toBe(ok);
      expect(rangeHint("discount_change_pp", value, rates) === null, value).toBe(ok);
    }
    expect(calculateScenario(baseline, accepted({ one_time_cost: "-1" })).status).toBe("invalid");
  });
});

describe("R5-3 converted values feed the unchanged engine and reproduce golden answers", () => {
  it("golden DTC 284.00: target 4 units, same discount rate, same 270 budget, logistics −10%", () => {
    const summary = goldenSummary("DTC");
    expect(summary.units_sold.value).toBe(4n);
    const baseline = buildScenarioBaseline(summary, true);
    const absolute = absoluteContext(baseline, summary.units_sold.value);
    expect(absolute).toEqual({ units_sold: 4n, discount_rate: "0.127777777778", ad_spend: "270.00" });
    const volume = absoluteToRelative("volume_change_pct", "4", absolute).relative!;
    const discount = absoluteToRelative("discount_change_pp", "12.7777777778", absolute).relative!;
    const ad = absoluteToRelative("ad_change_pct", "270", absolute).relative!;
    expect([volume, discount, ad]).toEqual(["0", "0", "0"]);
    const viaAbsolute = calculateScenario(baseline, accepted({ volume_change_pct: volume, discount_change_pp: discount, ad_change_pct: ad, fulfillment_change_pct: "-10" }));
    const direct = calculateScenario(baseline, accepted({ fulfillment_change_pct: "-10" }));
    expect(viaAbsolute).toMatchObject({ status: "valid", contribution: "284.00" });
    expect(viaAbsolute.amounts).toEqual(direct.amounts);
    expect(calculateScenario(baseline, accepted({ volume_change_pct: volume, discount_change_pp: discount, ad_change_pct: ad, fulfillment_change_pct: "-10", one_time_cost: "20" })).contribution).toBe("264.00");
  });
  it("golden MARKETPLACE 19.70: new rate 18.9230769231% (= +2 points) and new budget 144 (= −20%)", () => {
    // MARKETPLACE 本期：D/G = 220/1300 = 16.9230769231%；廣告 180 → 144 = −20%。
    const summary = goldenSummary("MARKETPLACE");
    const baseline = buildScenarioBaseline(summary, true);
    const absolute = absoluteContext(baseline, summary.units_sold.value);
    const discount = absoluteToRelative("discount_change_pp", "18.9230769231", absolute).relative!;
    const ad = absoluteToRelative("ad_change_pct", "144", absolute).relative!;
    expect([discount, ad]).toEqual(["2", "-20"]);
    // 銷量 +20% 換成件數是 4 × 1.2 = 4.8 件，不是整數：反向等值顯示「約 5 件」，引擎仍收相對 20。
    expect(relativeToAbsolute("volume_change_pct", "20", absolute)).toBe(units("5", true));
    const result = calculateScenario(baseline, accepted({ volume_change_pct: "20", discount_change_pp: discount, fulfillment_change_pct: "-10", ad_change_pct: ad, one_time_cost: "20" }));
    expect(result).toMatchObject({ status: "valid", contribution: "19.70", delta: "34.70" });
  });
});
