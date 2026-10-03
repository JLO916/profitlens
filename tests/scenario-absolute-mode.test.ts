import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "@/domain/scenarios";
import { validateDataset } from "@/domain/validation";
import { ABSOLUTE_FIELDS, SCENARIO_INPUT_BOUNDS, absoluteAvailability, absoluteContext, absoluteToRelative, rangeHint, relativeEquivalent, relativeToAbsolute, relativeToAbsoluteValue, type AbsoluteContext } from "@/application/scenario-presets";
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
  it("keeps 12 decimals (HALF_UP, trailing zeros stripped) and takes the one-decimal equivalent from the exact value", () => {
    // 3 → 4：1/3 = 33.333333333333|33…；3 → 5：66.666666666666|66… → …667；3 → 2：−33.333333333333|33…
    expect(absoluteToRelative("volume_change_pct", "4", ctx({ units_sold: 3n }))).toEqual({ relative: "33.333333333333", equivalent: pct("+33.3") });
    expect(absoluteToRelative("volume_change_pct", "5", ctx({ units_sold: 3n }))).toEqual({ relative: "66.666666666667", equivalent: pct("+66.7") });
    expect(absoluteToRelative("volume_change_pct", "2", ctx({ units_sold: 3n })).relative).toBe("-33.333333333333");
    // 廣告 2,000,000：新預算 2,000,001 → +0.00005（不再被 4 位小數吃成 0.0001）；1,999,999 → −0.00005。
    expect(absoluteToRelative("ad_change_pct", "2000001", ctx({ ad_spend: "2000000.00" }))).toEqual({ relative: "0.00005", equivalent: pct("0.0") });
    expect(absoluteToRelative("ad_change_pct", "1999999", ctx({ ad_spend: "2000000.00" }))).toEqual({ relative: "-0.00005", equivalent: pct("0.0") });
    // 1000 → 1234.5：+23.45
    expect(absoluteToRelative("ad_change_pct", "1234.5", ctx()).relative).toBe("23.45");
    // 不做兩次捨入：3,001,499,999,999.99 ÷ 3,000,000,000,000 − 1 = 0.0499999999996666…%；
    // 12 位小數是 0.05，但畫面的一位小數直接取精確值 → 0.0（若從 0.05 再捨入會變成 +0.1）。
    expect(absoluteToRelative("ad_change_pct", "3001499999999.99", ctx({ ad_spend: "3000000000000.00" }))).toEqual({ relative: "0.05", equivalent: pct("0.0") });
    // 每個相對值都在備份 schema 的 100 字上限內；遠超界限的目標不寫進方案，直接提示界限。
    expect(absoluteToRelative("volume_change_pct", "9".repeat(120), ctx())).toEqual({ relative: null, equivalent: "", error: pctHint("−90", "+100") });
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
  it("round trips without 「約」 even when the relative value is a repeating decimal (3 units, budget ÷ 270, exact D/G)", () => {
    // 本期 3 件：目標 4 → 33.333333333333%；反推 3 × 1.33333333333333 = 3.99999999999999，仍認得是 4 件（不是「約 4 件」）。
    const three = ctx({ units_sold: 3n });
    for (const target of ["0", "1", "2", "4", "5", "7", "10"]) {
      const relative = absoluteToRelative("volume_change_pct", target, three).relative!;
      expect(relativeToAbsolute("volume_change_pct", relative, three), target).toBe(units(target));
      expect(relativeToAbsoluteValue("volume_change_pct", relative, three), target).toBe(target);
    }
    // 使用者手打的近似值仍標「約」：3 × 1.333333 = 3.999999 件。
    expect(relativeToAbsolute("volume_change_pct", "33.3333", three)).toBe(units("4", true));
    const golden = absoluteContext(buildScenarioBaseline(goldenSummary("DTC"), true), 4n);
    for (const budget of ["1500.00", "123.45", "0.00", "810.00", "269.99"]) {
      const relative = absoluteToRelative("ad_change_pct", budget, golden).relative!;
      expect(relativeToAbsoluteValue("ad_change_pct", relative, golden), budget).toBe(budget);
    }
    for (const rate of ["12", "0", "7.5", "99.99", "12.3456789"]) {
      const relative = absoluteToRelative("discount_change_pp", rate, golden).relative!;
      expect(relativeToAbsoluteValue("discount_change_pp", relative, golden), rate).toBe(rate);
    }
  });
  it("relativeToAbsoluteValue prefills the raw absolute number (unformatted) and keeps non-integer units exact", () => {
    expect(relativeToAbsoluteValue("volume_change_pct", "25", ctx())).toBe("10");
    expect(relativeToAbsoluteValue("volume_change_pct", "+25", ctx())).toBe("10");
    expect(relativeToAbsoluteValue("volume_change_pct", "10", ctx())).toBe("8.8");
    expect(relativeToAbsoluteValue("volume_change_pct", "0", ctx({ units_sold: 1234567n }))).toBe("1234567");
    expect(relativeToAbsoluteValue("discount_change_pp", "2", ctx())).toBe("12");
    expect(relativeToAbsoluteValue("discount_change_pp", "-2.25", ctx())).toBe("7.75");
    expect(relativeToAbsoluteValue("ad_change_pct", "-50", ctx())).toBe("500.00");
    expect(relativeToAbsoluteValue("ad_change_pct", "23.45", ctx({ ad_spend: "10000.00" }))).toBe("12345.00");
    // 精確 D/G：golden DTC 230/1800 = 12.777…%，取 10 位小數。
    const golden = absoluteContext(buildScenarioBaseline(goldenSummary("DTC"), true), 4n);
    expect(relativeToAbsoluteValue("volume_change_pct", "50", golden)).toBe("6");
    expect(relativeToAbsoluteValue("discount_change_pp", "0", golden)).toBe("12.7777777778");
    expect(relativeToAbsoluteValue("ad_change_pct", "0", golden)).toBe("270.00");
    // 空白、格式不合、本期值不可用、換算後為負或折扣率不在 [0, 100%) → null。
    for (const text of ["", "  ", "abc", "10%"]) expect(relativeToAbsoluteValue("volume_change_pct", text, ctx()), text).toBeNull();
    expect(relativeToAbsoluteValue("volume_change_pct", "10", ctx({ units_sold: null }))).toBeNull();
    expect(relativeToAbsoluteValue("volume_change_pct", "-150", ctx())).toBeNull();
    expect(relativeToAbsoluteValue("ad_change_pct", "-101", ctx())).toBeNull();
    expect(relativeToAbsoluteValue("discount_change_pp", "90", ctx())).toBeNull();
    expect(relativeToAbsoluteValue("discount_change_pp", "-10.5", ctx())).toBeNull();
  });
  it("relativeEquivalent shows the current relative value with one decimal (used while an absolute prefill is untouched)", () => {
    expect(relativeEquivalent("volume_change_pct", "50")).toBe(pct("+50.0"));
    expect(relativeEquivalent("ad_change_pct", "-33.333333333333")).toBe(pct("−33.3"));
    expect(relativeEquivalent("discount_change_pp", "2")).toBe(points("+2.0"));
    expect(relativeEquivalent("volume_change_pct", "0")).toBe(pct("0.0"));
    for (const text of ["", "abc", "10%"]) expect(relativeEquivalent("volume_change_pct", text), text).toBeNull();
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
    expect(absolute).toEqual({ units_sold: 4n, discount_rate: "0.127777777778", ad_spend: "270.00", gross_sales: "1800.00", discounts: "230.00" });
    const volume = absoluteToRelative("volume_change_pct", "4", absolute).relative!;
    const ad = absoluteToRelative("ad_change_pct", "270", absolute).relative!;
    expect([volume, ad]).toEqual(["0", "0"]);
    // 本期折扣率 230/1800 = 12.777…% 是循環小數：切到絕對值時預填 "12.7777777778"，沒改就不寫回（方案仍是 0）；
    // 若真的送出這個 10 位小數，δ = 0.000000000022 點，D′ 只差 4×10⁻¹⁰ 元，取分後與相對 0 完全相同。
    expect(relativeToAbsoluteValue("discount_change_pp", "0", absolute)).toBe("12.7777777778");
    const discount = absoluteToRelative("discount_change_pp", "12.7777777778", absolute).relative!;
    expect(discount).toBe("0.000000000022");
    const direct = calculateScenario(baseline, accepted({ fulfillment_change_pct: "-10" }));
    for (const value of ["0", discount]) {
      const viaAbsolute = calculateScenario(baseline, accepted({ volume_change_pct: volume, discount_change_pp: value, ad_change_pct: ad, fulfillment_change_pct: "-10" }));
      expect(viaAbsolute, value).toMatchObject({ status: "valid", contribution: "284.00" });
      expect(viaAbsolute.amounts, value).toEqual(direct.amounts);
      expect(calculateScenario(baseline, accepted({ volume_change_pct: volume, discount_change_pp: value, ad_change_pct: ad, fulfillment_change_pct: "-10", one_time_cost: "20" })).contribution, value).toBe("264.00");
    }
  });
  it("golden MARKETPLACE 19.70: +2 points prefills 18.9230769231% and new budget 144 (= −20%)", () => {
    // MARKETPLACE 本期：D/G = 220/1300 = 16.923076923076…%；廣告 180 → 144 = −20%。
    const summary = goldenSummary("MARKETPLACE");
    const baseline = buildScenarioBaseline(summary, true);
    const absolute = absoluteContext(baseline, summary.units_sold.value);
    expect(relativeToAbsoluteValue("discount_change_pp", "2", absolute)).toBe("18.9230769231");
    expect(relativeToAbsolute("discount_change_pp", "2", absolute)).toBe(fill(copy.absolute.equivalentDiscountRate, { value: "18.9" }));
    const ad = absoluteToRelative("ad_change_pct", "144", absolute).relative!;
    expect(ad).toBe("-20");
    // 送出預填的 10 位小數：δ = 2.000000000023 點（精確 D/G），結果仍是 19.70／+34.70。
    const discount = absoluteToRelative("discount_change_pp", "18.9230769231", absolute).relative!;
    expect(discount).toBe("2.000000000023");
    // 銷量 +20% 換成件數是 4 × 1.2 = 4.8 件，不是整數：反向等值顯示「約 5 件」，預填值保留精確小數 4.8，引擎仍收相對 20。
    expect(relativeToAbsolute("volume_change_pct", "20", absolute)).toBe(units("5", true));
    expect(relativeToAbsoluteValue("volume_change_pct", "20", absolute)).toBe("4.8");
    for (const value of ["2", discount]) {
      const result = calculateScenario(baseline, accepted({ volume_change_pct: "20", discount_change_pp: value, fulfillment_change_pct: "-10", ad_change_pct: ad, one_time_cost: "20" }));
      expect(result, value).toMatchObject({ status: "valid", contribution: "19.70", delta: "34.70" });
    }
  });
  it("new budget and target units reach the engine exactly (golden DTC; ad spend from baseline.amounts.ad_spend)", () => {
    const summary = goldenSummary("DTC");
    const baseline = buildScenarioBaseline(summary, true);
    const absolute = absoluteContext(baseline, summary.units_sold.value);
    expect(absolute.ad_spend).toBe(baseline.amounts.ad_spend);
    // 本期 270：新預算在 +200% 界限內時，引擎算出的 A′ 就是使用者填的預算。
    for (const budget of ["500.00", "123.45", "269.99", "810.00", "0.00"]) {
      const relative = absoluteToRelative("ad_change_pct", budget, absolute).relative!;
      expect(calculateScenario(baseline, accepted({ ad_change_pct: relative })).amounts?.ad_spend, budget).toBe(budget);
    }
    // 新預算 1500.00 ＝ +455.6%：超出引擎 +200% 界限，即時提示，引擎也拒收；換算回去仍是 1500.00。
    const over = absoluteToRelative("ad_change_pct", "1500.00", absolute);
    expect(over).toEqual({ relative: "455.555555555556", equivalent: pct("+455.6") });
    expect(rangeHint("ad_change_pct", over.relative!, absolute)).toBe(pctHint("−100", "+200"));
    expect(calculateScenario(baseline, accepted({ ad_change_pct: over.relative! })).reasons.map(reason => reason.code)).toContain("INPUT_OUT_OF_RANGE");
    expect(relativeToAbsoluteValue("ad_change_pct", over.relative!, absolute)).toBe("1500.00");
    // 同一換算放到百萬級廣告費（只改 A，其餘沿用 golden）：4 位小數會把 3,123,456.78 算成 3,123,457.20，12 位小數則一分不差。
    const large = { ...baseline, amounts: { ...baseline.amounts, ad_spend: "2700000.00" } };
    const largeRelative = absoluteToRelative("ad_change_pct", "3123456.78", { ...absolute, ad_spend: "2700000.00" }).relative!;
    expect(largeRelative).toBe("15.683584444444");
    expect(calculateScenario(large, accepted({ ad_change_pct: largeRelative })).amounts?.ad_spend).toBe("3123456.78");
    expect(calculateScenario(large, accepted({ ad_change_pct: "15.6836" })).amounts?.ad_spend).toBe("3123457.20");
    // 目標 6 件（本期 4 件）＝ +50%：G′、C′ 都是本期 × 1.5。
    const volume = absoluteToRelative("volume_change_pct", "6", absolute).relative!;
    expect(volume).toBe("50");
    const result = calculateScenario(baseline, accepted({ volume_change_pct: volume }));
    expect(result.amounts?.gross_sales).toBe(new Decimal(baseline.amounts.gross_sales!).times("1.5").toFixed(2));
    expect(result.amounts?.cogs_net).toBe(new Decimal(baseline.amounts.cogs_net!).times("1.5").toFixed(2));
    expect([result.amounts?.gross_sales, result.amounts?.cogs_net]).toEqual(["2700.00", "1110.00"]);
    // 本期 3 件 → 目標 4 件（循環小數 33.333333333333%）：G′ = 1800 × 4/3 = 2400.00、C′ = 740 × 4/3 = 986.67。
    const third = absoluteToRelative("volume_change_pct", "4", { ...absolute, units_sold: 3n }).relative!;
    expect(calculateScenario(baseline, accepted({ volume_change_pct: third })).amounts).toMatchObject({ gross_sales: "2400.00", cogs_net: "986.67" });
  });
});

describe("R5 fix: discount conversion uses the engine's exact D + G·δ/100 ∈ [0, G)", () => {
  it.each(["DTC", "MARKETPLACE"] as const)("golden %s: new discount rate 0% is accepted by the engine and gives discounts 0.00", channel => {
    const summary = goldenSummary(channel);
    const baseline = buildScenarioBaseline(summary, true);
    const absolute = absoluteContext(baseline, summary.units_sold.value);
    const conversion = absoluteToRelative("discount_change_pp", "0", absolute);
    // 取位往可行側：DTC −12.777777777777（不是 …778）、MARKETPLACE −16.923076923076（不是 …077）。
    expect(conversion.relative).toBe(channel === "DTC" ? "-12.777777777777" : "-16.923076923076");
    const result = calculateScenario(baseline, accepted({ discount_change_pp: conversion.relative! }));
    expect(result.status).toBe("valid");
    expect(result.amounts?.discounts).toBe("0.00");
    expect(rangeHint("discount_change_pp", conversion.relative!, absolute)).toBeNull();
    expect(relativeToAbsolute("discount_change_pp", conversion.relative!, absolute)).toBe(fill(copy.absolute.equivalentDiscountRate, { value: "0.0" }));
  });
  it("new rate 99.99% is feasible; 100% is rejected with the absolute error", () => {
    for (const channel of ["DTC", "MARKETPLACE"] as const) {
      const summary = goldenSummary(channel);
      const baseline = buildScenarioBaseline(summary, true);
      const absolute = absoluteContext(baseline, summary.units_sold.value);
      const feasible = absoluteToRelative("discount_change_pp", "99.99", absolute);
      expect(calculateScenario(baseline, accepted({ discount_change_pp: feasible.relative! })).status, channel).toBe("valid");
      expect(rangeHint("discount_change_pp", feasible.relative!, absolute), channel).toBeNull();
      expect(absoluteToRelative("discount_change_pp", "100", absolute), channel).toEqual({ relative: null, equivalent: "", error: copy.absolute.errors.discount_change_pp });
    }
  });
  it("rangeHint agrees with the engine on the exact boundary that the 12-decimal discount_rate cannot see", () => {
    const baseline = buildScenarioBaseline(goldenSummary("DTC"), true);
    const absolute = absoluteContext(baseline, 4n);
    // −12.777777777778 點：230 − 1800 × 0.12777777777778 = −0.000000000004 < 0 → 引擎拒收，提示也要出現。
    for (const [value, ok] of [["-12.777777777777", true], ["-12.777777777778", false], ["87.222222222222", true], ["87.222222222223", false]] as const) {
      const result = calculateScenario(baseline, accepted({ discount_change_pp: value }));
      expect(result.status === "valid", value).toBe(ok);
      if (!ok) expect(result.reasons.map(reason => reason.code)).toContain("SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE");
      expect(rangeHint("discount_change_pp", value, absolute) === null, value).toBe(ok);
    }
    expect(rangeHint("discount_change_pp", "-12.777777777778", absolute)).toBe(fill(copy.range.discount, { rate: "−0.0" }));
    expect(rangeHint("discount_change_pp", "87.222222222223", absolute)).toBe(fill(copy.range.discount, { rate: "100.0" }));
    // 只有 12 位小數的 discount_rate（0.127777777778）時看不出這一點差距；有 G、D 時以精確金額為準。
    expect(rangeHint("discount_change_pp", "-12.777777777778", { discount_rate: baseline.rates.discount_rate })).toBeNull();
  });
});
