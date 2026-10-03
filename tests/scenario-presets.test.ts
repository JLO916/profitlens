import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "@/domain/scenarios";
import { validateDataset } from "@/domain/validation";
import { blankScenarioInputs } from "@/application/decision";
import { SCENARIO_PRESETS, SCENARIO_PRESET_IDS, applyPreset, rangeHint, type ScenarioPresetId } from "@/application/scenario-presets";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

function golden(channel: "DTC" | "MARKETPLACE" = "DTC") {
  return buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels[channel], true);
}
const fields = ["volume_change_pct", "discount_change_pp", "fulfillment_change_pct", "ad_change_pct", "one_time_cost"] as const;

// 05 §8 表，逐格抄寫（銷量 %／折扣率百分點／每件物流費 %／廣告預算 %／一次性元）；不從產品程式取值。
const TABLE: Record<ScenarioPresetId, [string, string, string, string, string]> = {
  keep: ["0", "0", "0", "0", "0"],
  double11: ["60", "5", "0", "100", "0"],
  cut_ads_half: ["-20", "0", "0", "-50", "0"],
  cancel_free_shipping: ["-10", "0", "-40", "0", "0"],
  price_up_5: ["-5", "-5", "0", "0", "0"],
  kol: ["15", "0", "0", "0", "50000"],
};
/*
 * Golden DTC 本期（2026-08-02）手算：G=1800、D=230、R=90、N=1480、C=740、P=0、Q=44、F=140、O=16、A=270；現況貢獻 270.00。
 * 閉合式：H=G−D=1570、H′=H−G×δ、L=[H′×(N−P−Q) − H×(C+F×(1+f)+O)]/H、貢獻=L×(1+v) − A×(1+a) − K。
 * - 維持現況：L=1436−896=540 → 540−270 = 270.00
 * - 雙 11：H′=1480，L=(1480×1436−1570×896)/1570=718560/1570=457.68152866… → ×1.6−540 = 192.29044586… → 192.29
 * - 砍廣告一半：540×0.8 − 135 = 297.00
 * - 取消免運：L=1436−(740+84+16)=596 → 596×0.9 − 270 = 266.40
 * - 漲價 5%：H′=1660，L=(1660×1436−1570×896)/1570=977040/1570=622.31847133… → ×0.95−270 = 321.20254777… → 321.20
 * - KOL：540×1.15 − 270 − 50000 = −49649.00
 */
const DTC_EXPECTED: Record<ScenarioPresetId, { contribution: string; delta: string }> = {
  keep: { contribution: "270.00", delta: "0.00" },
  double11: { contribution: "192.29", delta: "-77.71" },
  cut_ads_half: { contribution: "297.00", delta: "27.00" },
  cancel_free_shipping: { contribution: "266.40", delta: "-3.60" },
  price_up_5: { contribution: "321.20", delta: "51.20" },
  kol: { contribution: "-49649.00", delta: "-49919.00" },
};

describe("R5-3 scenario presets (05 §8)", () => {
  it("lists exactly the six presets in table order with the table's values", () => {
    expect(SCENARIO_PRESET_IDS).toEqual(["keep", "double11", "cut_ads_half", "cancel_free_shipping", "price_up_5", "kol"]);
    expect(SCENARIO_PRESETS.map(preset => preset.id)).toEqual(SCENARIO_PRESET_IDS);
    for (const preset of SCENARIO_PRESETS) {
      expect(fields.map(field => preset.inputs[field]), preset.id).toEqual(TABLE[preset.id]);
      expect(preset.inputs).not.toHaveProperty("assumptions_accepted");
      // 引擎接受的十進位字串：不帶「+」、千分位或 %。
      for (const field of fields) expect(preset.inputs[field]).toMatch(/^-?\d+$/);
    }
  });
  it("names and purposes come from labels.scenarioPresets and avoid disclaimer boilerplate", () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.name).toBe(labels.scenarioPresets.items[preset.id].name);
      expect(preset.purpose).toBe(labels.scenarioPresets.items[preset.id].purpose);
      expect(preset.name).toMatch(/\S/);
      expect(preset.purpose).toMatch(/\S/);
      expect(preset.purpose).not.toMatch(/不是|不代表|不等於|不可/);
    }
    expect(labels.scenario.templateNote).toMatch(/\S/);
  });
  it("is frozen so a caller cannot rewrite the shared table", () => {
    expect(Object.isFrozen(SCENARIO_PRESETS)).toBe(true);
    expect(Object.isFrozen(SCENARIO_PRESETS[1].inputs)).toBe(true);
  });
  it("applyPreset fills only the five fields and never ticks the assumptions box", () => {
    const blank = blankScenarioInputs();
    const applied = applyPreset(blank, "double11");
    expect(applied).toEqual({ volume_change_pct: "60", discount_change_pp: "5", fulfillment_change_pct: "0", ad_change_pct: "100", one_time_cost: "0", assumptions_accepted: false });
    expect(blank).toEqual(blankScenarioInputs());
    const accepted: ScenarioInputs = { ...blank, volume_change_pct: "7", assumptions_accepted: true };
    expect(applyPreset(accepted, "kol")).toEqual({ volume_change_pct: "15", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "50000", assumptions_accepted: true });
    expect(() => applyPreset(blank, "unknown" as ScenarioPresetId)).toThrow("UNKNOWN_SCENARIO_PRESET");
  });
  it("without accepting assumptions a preset is still not computable (user must tick and calculate)", () => {
    expect(calculateScenario(golden(), applyPreset(blankScenarioInputs(), "keep"))).toMatchObject({ status: "ineligible", reasons: [{ code: "ASSUMPTIONS_NOT_ACCEPTED" }] });
  });
  it.each(SCENARIO_PRESET_IDS)("%s is valid on golden DTC and matches the hand calculation", id => {
    const result = calculateScenario(golden(), applyPreset({ ...blankScenarioInputs(), assumptions_accepted: true }, id));
    expect(result.status).toBe("valid");
    expect({ contribution: result.contribution, delta: result.delta }).toEqual(DTC_EXPECTED[id]);
    for (const field of fields) expect(rangeHint(field, TABLE[id][fields.indexOf(field)], golden().rates)).toBeNull();
  });
  it("維持現況 equals the golden zero-change baseline 270.00 on DTC and -15.00 on MARKETPLACE", () => {
    const accepted = { ...blankScenarioInputs(), assumptions_accepted: true };
    expect(calculateScenario(golden(), applyPreset(accepted, "keep"))).toMatchObject({ status: "valid", contribution: "270.00", delta: "0.00" });
    expect(calculateScenario(golden("MARKETPLACE"), applyPreset(accepted, "keep"))).toMatchObject({ status: "valid", contribution: "-15.00", delta: "0.00" });
  });
  it.each(SCENARIO_PRESET_IDS)("%s is also within engine bounds on golden MARKETPLACE", id => {
    expect(calculateScenario(golden("MARKETPLACE"), applyPreset({ ...blankScenarioInputs(), assumptions_accepted: true }, id)).status).toBe("valid");
  });
  it("漲價 5% (−5 points) is out of range for a baseline whose discount rate is below 5%, and rangeHint says so first", () => {
    // 折扣率 3%：3% − 5 點 = −2% < 0 → 引擎 SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE；提示同步標出。
    expect(rangeHint("discount_change_pp", "-5", { discount_rate: "0.030000000000" })).toBe(fill(labels.scenarioPresets.range.discount, { rate: "−2.0" }));
  });
});
