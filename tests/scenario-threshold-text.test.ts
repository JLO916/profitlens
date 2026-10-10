import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { calculateMetrics } from "@/domain/metrics";
import { buildScenarioBaseline, type ScenarioBaseline, type ScenarioInputs } from "@/domain/scenarios";
import { analyzeScenarioSensitivity, type ContributionThreshold } from "@/domain/scenario-sensitivity";
import { AMOUNT_FIELDS, type AmountField, type Summary, type Totals } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { formatAmountL1, metricDefinitions } from "@/application/presentation";
import { thresholdDescription, thresholdTargetLabel } from "@/application/scenario-threshold-text";
import { ScenarioSensitivity } from "@/components/scenario-sensitivity";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { element } from "./helpers/markup";

// V4-5 代理 A：thresholdDescription、targetLabel 由 src/components/scenario-sensitivity.tsx 搬到 src/application/scenario-threshold-text.ts（06_BATCHES V4-5「字不改」）。
// 1. 參考實作：搬移前的函式本體逐字複製到這裡（只把 copy 換成同一個 labels 物件），對每個 status × meets_target_when × range_outcome 組合比對輸出；
// 2. 每個 status 的句子另以 labels 直接組出（不經任何函式）比對；
// 3. ScenarioSensitivity 的 SSR：每個 threshold-{id} 區塊仍輸出同一句與同一個目標名，元件不再自己定義這兩個函式。

const copy = labels.scenarios.sensitivity;

/** 搬移前（db0f401 的 src/components/scenario-sensitivity.tsx:14-22、:27）的函式本體，逐字保留。 */
function legacyThresholdDescription(target: ContributionThreshold): string {
  if (target.status === "constant_equal") return copy.thresholdConstantEqual;
  if (target.status === "constant_above") return copy.thresholdConstantAbove;
  if (target.status === "constant_below") return copy.thresholdConstantBelow;
  const direction = target.meets_target_when === "at_or_above" ? copy.directionAtOrAbove : copy.directionAtOrBelow;
  if (target.status === "outside_range") return fill(copy.thresholdOutsideRange, { outcome: target.range_outcome === "all_at_or_above" ? copy.outcomeAllAtOrAbove : copy.outcomeAllBelow });
  return fill(copy.thresholdExact, { direction });
}
const legacyTargetLabel = (id: ContributionThreshold["id"]) => id === "zero_contribution" ? fill(copy.targetZero, { metric: metricDefinitions.contribution_after_marketing.label }) : copy.targetMaintain;

const STATUSES: ContributionThreshold["status"][] = ["within_range", "outside_range", "constant_equal", "constant_above", "constant_below"];
const MEETS: ContributionThreshold["meets_target_when"][] = ["at_or_above", "at_or_below", "all", "none"];
const OUTCOMES: ContributionThreshold["range_outcome"][] = ["crosses_target", "all_at_or_above", "all_below"];
const IDS: ContributionThreshold["id"][] = ["zero_contribution", "maintain_baseline"];
const target = (status: ContributionThreshold["status"], meets: ContributionThreshold["meets_target_when"], outcome: ContributionThreshold["range_outcome"], id: ContributionThreshold["id"] = "zero_contribution"): ContributionThreshold => ({
  id, target: "0.00", status, threshold_pct: null, threshold_fraction: null, meets_target_when: meets, range_outcome: outcome,
});

describe("thresholdDescription：搬移後逐字相同", () => {
  it("每個 status × meets_target_when × range_outcome（5 × 4 × 3＝60 種）都與搬移前的函式逐字相同", () => {
    let checked = 0;
    for (const status of STATUSES) for (const meets of MEETS) for (const outcome of OUTCOMES) for (const id of IDS) {
      const input = target(status, meets, outcome, id);
      expect(thresholdDescription(input), `${status}/${meets}/${outcome}/${id}`).toBe(legacyThresholdDescription(input));
      checked++;
    }
    expect(checked).toBe(STATUSES.length * MEETS.length * OUTCOMES.length * IDS.length);
  });

  it("每個 status 的句子（以 labels 直接組出）", () => {
    expect(thresholdDescription(target("constant_equal", "all", "all_at_or_above"))).toBe(copy.thresholdConstantEqual);
    expect(thresholdDescription(target("constant_above", "all", "all_at_or_above"))).toBe(copy.thresholdConstantAbove);
    expect(thresholdDescription(target("constant_below", "none", "all_below"))).toBe(copy.thresholdConstantBelow);
    expect(thresholdDescription(target("outside_range", "at_or_above", "all_at_or_above"))).toBe(copy.thresholdOutsideRange.replace("{outcome}", copy.outcomeAllAtOrAbove));
    expect(thresholdDescription(target("outside_range", "at_or_below", "all_below"))).toBe(copy.thresholdOutsideRange.replace("{outcome}", copy.outcomeAllBelow));
    expect(thresholdDescription(target("within_range", "at_or_above", "crosses_target"))).toBe(copy.thresholdExact.replace("{direction}", copy.directionAtOrAbove));
    expect(thresholdDescription(target("within_range", "at_or_below", "crosses_target"))).toBe(copy.thresholdExact.replace("{direction}", copy.directionAtOrBelow));
  });

  it("thresholdTargetLabel 與搬移前的 targetLabel 逐字相同（指標名取 metricDefinitions）", () => {
    for (const id of IDS) expect(thresholdTargetLabel(id)).toBe(legacyTargetLabel(id));
    expect(thresholdTargetLabel("zero_contribution")).toBe(copy.targetZero.replace("{metric}", metricDefinitions.contribution_after_marketing.label));
    expect(thresholdTargetLabel("maintain_baseline")).toBe(copy.targetMaintain);
  });
});

describe("ScenarioSensitivity：threshold-{id} 仍輸出同一句與同一個目標名", () => {
  const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  const golden = () => buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels.DTC, true);
  function baseline(values: Partial<Record<AmountField, string | null>>): ScenarioBaseline {
    const totals = Object.fromEntries(AMOUNT_FIELDS.map(field => {
      const value = field in values ? values[field] : field === "gross_sales" ? "100.00" : "0.00";
      return [field, { cents: value == null ? null : BigInt(value.replace(".", "")), reason_codes: value == null ? ["MISSING_COST"] : [] }];
    })) as Totals;
    const summary: Summary = { totals, metrics: calculateMetrics(totals), sources: [], units_sold: { value: null, reason_codes: [] } };
    return buildScenarioBaseline(summary, true);
  }
  const cases: { name: string; base: ScenarioBaseline; inputs: ScenarioInputs }[] = [
    { name: "golden DTC f−10%（範圍內、at_or_above）", base: golden(), inputs: { ...zero, fulfillment_change_pct: "-10" } },
    { name: "超界（all_at_or_above）", base: baseline({}), inputs: zero },
    { name: "超界（all_below）", base: baseline({ ad_spend: "500.00" }), inputs: zero },
    { name: "L 為負（at_or_below）", base: baseline({ cogs_net: "150.00", ad_spend: "10.00" }), inputs: zero },
    { name: "L＝0（constant_below、constant_equal）", base: baseline({ cogs_net: "100.00", ad_spend: "10.00" }), inputs: zero },
    { name: "L＝0（constant_equal、constant_above）", base: baseline({ cogs_net: "100.00", ad_spend: "10.00" }), inputs: { ...zero, ad_change_pct: "-100" } },
  ];

  it.each(cases)("$name", ({ base, inputs }) => {
    const html = renderToStaticMarkup(createElement(ScenarioSensitivity, { planId: "p", planName: "P", baseline: base, inputs, onChange: () => undefined }));
    const analysis = analyzeScenarioSensitivity(base, inputs, ["", "", ""]);
    expect(analysis.targets).toHaveLength(2);
    for (const item of analysis.targets) {
      const section = element(html, `data-testid="threshold-${item.id}"`)!;
      expect(section).toContain(`<p>${legacyThresholdDescription(item)}</p>`);
      expect(section).toContain(`<h5>${fill(copy.targetHeading, { target: legacyTargetLabel(item.id), amount: formatAmountL1(item.target) })}</h5>`);
    }
  });

  it("元件不再自己定義 thresholdDescription、targetLabel，改由 src/application/scenario-threshold-text.ts 匯入", () => {
    const source = readFileSync(resolve("src/components/scenario-sensitivity.tsx"), "utf8");
    expect(source).not.toMatch(/function thresholdDescription\b/);
    expect(source).not.toMatch(/const targetLabel\s*=/);
    expect(source).toContain('from "@/application/scenario-threshold-text";');
  });
});
