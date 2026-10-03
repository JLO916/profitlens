import { afterEach, describe, expect, it, vi } from "vitest";
import { buildManagerSummary, exportManagerSummaryMarkdown, priorityEvidence } from "../src/application/manager-summary";
import { formatSignedMoney } from "../src/application/presentation";
import { COST_INCREASE_RULES, describeMoneyChange, impactClass, impactTone, profitImpactAmount } from "../src/application/profit-impact";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";

async function snapshot(name = "demo", filters: AnalysisFilters = {}) {
  const input = fixture(name);
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  return createSnapshot(result.dataset!, filters, await hashInput(input));
}

describe("M0 HF-03 profit-impact sign is consistent across three-things, diagnosis and bridge", () => {
  it("anchor: demo three-things discount shows -1,188,365.10, the same sign as the bridge", async () => {
    const report = await snapshot();
    const summary = buildManagerSummary(report);
    const discount = summary.priorities.find(row => row.code === "DISCOUNT_BURDEN_UP");
    expect(discount).toBeDefined();
    expect(formatSignedMoney(discount!.impact_amount.value)).toBe("-1,188,365.10");
    expect(discount!.evidence.metric.value).toBe("-1188365.10");
    expect(discount!.evidence.formula).toContain("前期商品折扣 − 本期商品折扣");
    expect(discount!.evidence.formula).toContain("費用增加會減少獲利");
    // The bridge already expresses the same item as its effect on contribution.
    expect(report.report.bridge.components.discounts.value).toBe("-1188365.10");
    // Domain ranking (rules.ts) is untouched: it still ranks by the observed cost increase.
    expect(discount!.ranking_amount.value).toBe("1188365.10");
  });

  it("cost increases are never shown with a plus sign; a contribution drop stays negative", async () => {
    const report = await snapshot();
    for (const diagnostic of report.report.diagnostics) {
      if (!diagnostic.ranking_amount?.value) continue;
      const impact = profitImpactAmount(diagnostic.code, diagnostic.ranking_amount)!;
      if (COST_INCREASE_RULES.has(diagnostic.code)) expect(impactTone(impact.value)).not.toBe("gain");
      if (diagnostic.code === "REV_UP_CM_DOWN") expect(impactTone(impact.value)).toBe("loss");
      expect(priorityEvidence(report, diagnostic).metric.value).toBe(impact.value);
    }
  });

  it("keeps unknown amounts unknown and leaves non-cost rules unchanged", () => {
    expect(profitImpactAmount("DISCOUNT_BURDEN_UP", { value: null, reason_codes: ["MISSING_COST"] })).toEqual({ value: null, reason_codes: ["MISSING_COST"] });
    expect(profitImpactAmount("REV_UP_CM_DOWN", { value: "-12.30", reason_codes: [] })!.value).toBe("-12.30");
    expect(profitImpactAmount("REFUND_BURDEN_UP", { value: "0.00", reason_codes: [] })!.value).toBe("0.00");
    expect(profitImpactAmount("MARKETING_BURDEN_UP", null)).toBeNull();
    expect([impactClass("-1.00"), impactClass("1.00"), impactClass("0.00"), impactClass(null)]).toEqual(["impact-loss", "impact-gain", "impact-flat", "impact-unknown"]);
  });

  it("Markdown export labels the three-things amount as profit impact with the same sign", async () => {
    const markdown = exportManagerSummaryMarkdown(buildManagerSummary(await snapshot()));
    expect(markdown).toContain("對獲利影響 -1188365.10");
    expect(markdown).not.toContain("對獲利影響 +1188365.10");
    expect(markdown).toContain("減少獲利為負、增加獲利為正");
  });
});

describe("M0 HF-04 sign transitions replace meaningless percentages", () => {
  it("anchor: MARKETPLACE contribution reads 由賺 721,100.88 轉為虧 61,169.93", async () => {
    const report = await snapshot("demo", { channels: ["MARKETPLACE"] });
    const before = report.report.previous.metrics.contribution_after_marketing;
    const after = report.report.current.metrics.contribution_after_marketing;
    expect([before.value, after.value]).toEqual(["721100.88", "-61169.93"]);
    const described = describeMoneyChange(before, after);
    expect(described).toEqual({ kind: "transition", direction: "turned_negative", text: "由賺 721,100.88 轉為虧 61,169.93" });
    expect(described.kind === "transition" ? described.text : "").not.toMatch(/%/);
  });

  it("describes the opposite crossing and zero bases without a percentage", () => {
    expect(describeMoneyChange({ value: "-100.00", reason_codes: [] }, { value: "50.00", reason_codes: [] })).toMatchObject({ kind: "transition", text: "由虧 100.00 轉為賺 50.00" });
    expect(describeMoneyChange({ value: "0.00", reason_codes: [] }, { value: "-5.00", reason_codes: [] })).toMatchObject({ kind: "transition", text: "由 0.00 轉為虧 5.00" });
  });

  it("keeps the growth rate when the sign does not change and nothing when unknown", () => {
    expect(describeMoneyChange({ value: "100.00", reason_codes: [] }, { value: "150.00", reason_codes: [] })).toEqual({ kind: "rate", text: "50.00%" });
    expect(describeMoneyChange({ value: null, reason_codes: ["MISSING_COST"] }, { value: "150.00", reason_codes: [] })).toEqual({ kind: "none" });
  });
});

describe("M0 HF-05 autosave consent and storage boundary", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  function memoryStorage(fail = false) {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { if (fail) throw new Error("QuotaExceededError"); map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    };
  }

  it("consent is off by default, can be granted and revoked, and never claims success when storage refuses", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const consent = await import("../src/application/autosave");
    expect(consent.readAutosaveConsent()).toBe(false);
    expect(consent.grantAutosaveConsent()).toBe(true);
    expect(consent.readAutosaveConsent()).toBe(true);
    consent.revokeAutosaveConsent();
    expect(consent.readAutosaveConsent()).toBe(false);
    vi.stubGlobal("localStorage", memoryStorage(true));
    expect(consent.grantAutosaveConsent()).toBe(false);
    expect(consent.readAutosaveConsent()).toBe(false);
    vi.stubGlobal("localStorage", undefined);
    expect(consent.readAutosaveConsent()).toBe(false);
    expect(consent.grantAutosaveConsent()).toBe(false);
  });

  it("formats the saved time in Asia/Taipei", async () => {
    const { formatSavedClock } = await import("../src/application/autosave");
    expect(formatSavedClock("2026-10-03T00:02:00.000Z")).toBe("08:02");
    expect(formatSavedClock("not-a-date")).toBe("--:--");
  });

  it("autosave helpers do not touch IndexedDB at import time and report unavailable storage", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    await import("../src/application/local-store");
    expect(open).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const store = await import("../src/application/local-store");
    await expect(store.loadAutosaveWorkspace()).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
    await expect(store.clearAutosaveWorkspace()).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
    await expect(store.saveAutosaveWorkspace("{}")).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
  });
});
