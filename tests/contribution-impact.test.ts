import { describe, expect, it } from "vitest";
import { buildManagerSummary, contributionImpact } from "../src/application/manager-summary";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import type { Diagnostic } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";

async function goldenSnapshot() {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const find = (diagnostics: Diagnostic[], code: Diagnostic["code"], kind: Diagnostic["scope"]["kind"], channel?: string) =>
  diagnostics.find(row => row.code === code && row.scope.kind === kind && (!channel || row.scope.channels[0] === channel))!;

describe("R1 對貢獻影響 is a signed presentation of existing ranking amounts", () => {
  // Golden hand calculation (fixtures/golden/expected.json, all channels):
  // CM_after 570.00 → 255.00 (Δ −315.00); discounts 200→450 (+250), refunds 50→180 (+130),
  // fulfillment 160→225 (+65), ad_spend 300→450 (+150); MARKETPLACE current CM −15.00.
  it("keeps contribution deltas as-is and negates cost increases", async () => {
    const { report } = await goldenSnapshot();
    const d = report.diagnostics;
    expect(contributionImpact(find(d, "REV_UP_CM_DOWN", "all"))?.value).toBe("-315.00");
    expect(contributionImpact(find(d, "DISCOUNT_BURDEN_UP", "all"))?.value).toBe("-250.00");
    expect(contributionImpact(find(d, "REFUND_BURDEN_UP", "all"))?.value).toBe("-130.00");
    expect(contributionImpact(find(d, "FULFILLMENT_BURDEN_UP", "all"))?.value).toBe("-65.00");
    expect(contributionImpact(find(d, "MARKETING_BURDEN_UP", "all"))?.value).toBe("-150.00");
    expect(contributionImpact(find(d, "NEGATIVE_CHANNEL_CM", "channel", "MARKETPLACE"))?.value).toBe("-15.00");
  });

  it("does not alter the ranking amounts the summary still sorts by", async () => {
    const snapshot = await goldenSnapshot();
    const summary = buildManagerSummary(snapshot);
    const discount = summary.groups.find(row => row.code === "DISCOUNT_BURDEN_UP")!;
    expect(discount.ranking_amount.value).toBe("250.00");
    expect(contributionImpact(discount.primary)?.value).toBe("-250.00");
    expect(summary.groups.map(row => row.code)).toEqual(buildManagerSummary(snapshot).groups.map(row => row.code));
  });

  it("returns null for missing-data rules and preserves unknown reasons", () => {
    expect(contributionImpact({ code: "MISSING_CRITICAL_DATA", ranking_amount: null })).toBeNull();
    expect(contributionImpact({ code: "DISCOUNT_BURDEN_UP", ranking_amount: null })).toBeNull();
    expect(contributionImpact({ code: "MARKETING_BURDEN_UP", ranking_amount: { value: null, reason_codes: ["MISSING_AD_SPEND"] } })).toEqual({ value: null, reason_codes: ["MISSING_AD_SPEND"] });
    expect(contributionImpact({ code: "SKU_NEGATIVE_GP", ranking_amount: { value: "-42.50", reason_codes: [] } })?.value).toBe("-42.50");
    expect(contributionImpact({ code: "REFUND_BURDEN_UP", ranking_amount: { value: "0.00", reason_codes: [] } })?.value).toBe("0.00");
  });
});
