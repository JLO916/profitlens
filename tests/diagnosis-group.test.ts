import { describe, expect, it } from "vitest";
import { contributionImpact, diagnosisGroups, diagnosisScopeLabel, impactMagnitude, parseImportanceThreshold, summaryScopes, SUMMARY_SCOPE_LIMIT, TOP_PRIORITY_COUNT, type DiagnosisGroup } from "../src/application/diagnosis-group";
import { buildManagerSummary, contributionImpact as summaryContributionImpact, exportManagerSummaryMarkdown } from "../src/application/manager-summary";
import { ruleCopy } from "../src/application/copy";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters, Diagnostic, RuleCode, Scope } from "../src/domain/types";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// R5-1／R5-2（05_FEATURES.md §7）：同一規則的合計與各通路合併成一列，資料缺漏置頂，其餘依 |對貢獻影響| 排序。
//
// 獨立手算（fixtures/golden 的三份 CSV；上期 2026-08-01、本期 2026-08-02）：
//   折扣      DTC 100 → 230（+130）、MARKETPLACE 100 → 220（+120），合計 200 → 450（+250）→ 影響 −250.00
//   退款      DTC  50 →  90（+40）、 MARKETPLACE   0 →  90（+90）， 合計  50 → 180（+130）→ 影響 −130.00
//   物流費    DTC 100 → 140（+40）、 MARKETPLACE  60 →  85（+25）， 合計 160 → 225（+65） → 影響  −65.00
//   廣告費    DTC 200 → 270（+70）、 MARKETPLACE 100 → 180（+80）， 合計 300 → 450（+150）→ 影響 −150.00
//   扣廣告後貢獻 DTC 400 → 270（−130）、MARKETPLACE 170 → −15（−185），合計 570 → 255（−315）→ 影響 −315.00
//   MARKETPLACE 本期扣廣告後貢獻 −15.00（通路轉負，沒有合計成員）→ 影響 −15.00
// 排序（|影響| 由大到小）：REV_UP_CM_DOWN 315 > DISCOUNT 250 > MARKETING 150 > REFUND 130 > FULFILLMENT 65 > NEGATIVE_CHANNEL_CM 15。
const GOLDEN_ORDER: RuleCode[] = ["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "NEGATIVE_CHANNEL_CM"];
const GOLDEN_IMPACT: Record<string, string> = { REV_UP_CM_DOWN: "-315.00", DISCOUNT_BURDEN_UP: "-250.00", MARKETING_BURDEN_UP: "-150.00", REFUND_BURDEN_UP: "-130.00", FULFILLMENT_BURDEN_UP: "-65.00", NEGATIVE_CHANNEL_CM: "-15.00" };

async function snapshot(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name);
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  return createSnapshot(result.dataset!, filters, await hashInput(input));
}
const find = (groups: DiagnosisGroup[], rule: RuleCode) => groups.find(group => group.rule === rule)!;
const scopeSummary = (group: DiagnosisGroup) => group.scopes.map(row => [row.scope.kind, row.scope.channels.join("+"), row.impact?.value ?? null]);
/** 合成診斷：只換 report.diagnostics，事實與期間沿用 golden。 */
function diagnostic(code: RuleCode, scope: Scope, ranking: string | null): Diagnostic {
  return { id: JSON.stringify(["rule", "synthetic", scope.kind, scope.channels, scope.sku ?? null, code]), code, scope, title: code, fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: ranking === null ? null : { value: ranking, reason_codes: [] } };
}
const withDiagnostics = (base: WorkspaceSnapshot, diagnostics: Diagnostic[]): WorkspaceSnapshot => ({ ...base, report: { ...base.report, diagnostics } });

describe("diagnosisGroups merges all/channel signals into one row per rule", () => {
  it("golden: one row per rule, 合計 is primary and other scopes follow by |impact|", async () => {
    const result = diagnosisGroups(await snapshot());
    expect(result.groups.map(group => group.rule)).toEqual(GOLDEN_ORDER);
    expect(Object.fromEntries(result.groups.map(group => [group.rule, group.impact_cents]))).toEqual(GOLDEN_IMPACT);
    const discount = find(result.groups, "DISCOUNT_BURDEN_UP");
    expect(discount.primary.scope.kind).toBe("all");
    expect(scopeSummary(discount)).toEqual([["all", "DTC+MARKETPLACE", "-250.00"], ["channel", "DTC", "-130.00"], ["channel", "MARKETPLACE", "-120.00"]]);
    expect(scopeSummary(find(result.groups, "REFUND_BURDEN_UP"))).toEqual([["all", "DTC+MARKETPLACE", "-130.00"], ["channel", "MARKETPLACE", "-90.00"], ["channel", "DTC", "-40.00"]]);
    expect(scopeSummary(find(result.groups, "MARKETING_BURDEN_UP"))).toEqual([["all", "DTC+MARKETPLACE", "-150.00"], ["channel", "MARKETPLACE", "-80.00"], ["channel", "DTC", "-70.00"]]);
    expect(scopeSummary(find(result.groups, "FULFILLMENT_BURDEN_UP"))).toEqual([["all", "DTC+MARKETPLACE", "-65.00"], ["channel", "DTC", "-40.00"], ["channel", "MARKETPLACE", "-25.00"]]);
    expect(scopeSummary(find(result.groups, "REV_UP_CM_DOWN"))).toEqual([["all", "DTC+MARKETPLACE", "-315.00"], ["channel", "MARKETPLACE", "-185.00"], ["channel", "DTC", "-130.00"]]);
    // 通路轉負只有通路成員：primary 取 |impact| 最大者。
    const negative = find(result.groups, "NEGATIVE_CHANNEL_CM");
    expect(scopeSummary(negative)).toEqual([["channel", "MARKETPLACE", "-15.00"]]);
    expect(negative.primary.scope.channels).toEqual(["MARKETPLACE"]);
    // 每個原始診斷只出現在一列；規則代號不重複。
    expect(new Set(result.groups.map(group => group.rule)).size).toBe(result.groups.length);
    expect(result.groups.flatMap(group => group.scopes.map(row => row.diagnostic.id)).sort()).toEqual(snapshotIds(await snapshot()));
  });

  it("keeps the presentation fields from ruleCopy and the technical ranking amount of the primary", async () => {
    const base = await snapshot();
    const group = find(diagnosisGroups(base).groups, "DISCOUNT_BURDEN_UP");
    const copy = ruleCopy(base, group.primary, false);
    expect([group.headline, group.cause, group.next_step, group.caution]).toEqual([copy.headline, copy.cause, copy.nextStep, copy.caution]);
    expect(group.cause).toBe(labels.rules.DISCOUNT_BURDEN_UP.cause);
    // 排序用已觀察金額差（技術細節）仍是 +250.00；對貢獻影響是它的負值。
    expect(group.ranking_amount.value).toBe("250.00");
    expect(group.impact).toEqual({ value: "-250.00", reason_codes: [] });
    expect(group.missing).toBe(false);
    expect(group.fact_ids).toEqual([...new Set(group.scopes.flatMap(row => row.diagnostic.fact_ids))]);
    for (const row of group.scopes) expect(row.facts.map(fact => fact.id)).toEqual(row.diagnostic.fact_ids);
    expect(group.scopes.map(row => row.label)).toEqual([labels.sections.total, "DTC", "MARKETPLACE"]);
  });

  it("a single selected channel collapses 合計 and the channel into one 合計 scope", async () => {
    const result = diagnosisGroups(await snapshot("golden", { channels: ["DTC"] }));
    // DTC 單通路：折扣 +130 → −130、扣廣告後貢獻 −130、廣告 +70 → −70、物流 +40 → −40、退款 +40 → −40；同值依規則代號。
    expect(result.groups.map(group => [group.rule, group.impact_cents, group.scopes.length, group.primary.scope.kind])).toEqual([
      ["DISCOUNT_BURDEN_UP", "-130.00", 1, "all"], ["REV_UP_CM_DOWN", "-130.00", 1, "all"], ["MARKETING_BURDEN_UP", "-70.00", 1, "all"],
      ["FULFILLMENT_BURDEN_UP", "-40.00", 1, "all"], ["REFUND_BURDEN_UP", "-40.00", 1, "all"],
    ]);
  });

  it("missing data is pinned first with no amount and survives any threshold", async () => {
    // missing_cogs：本期 DTC/A 商品成本空白 → 合計與 DTC 的扣廣告後貢獻未知；MARKETPLACE 仍是 −185.00（170 → −15）。
    const result = diagnosisGroups(await snapshot("errors/missing_cogs"), { importanceThreshold: "999999999999999999.99" });
    const [first] = result.groups;
    expect(first.rule).toBe("MISSING_CRITICAL_DATA");
    expect(first.missing).toBe(true);
    expect(first.impact_cents).toBeNull();
    expect(first.impact).toBeNull();
    expect(impactMagnitude(first)).toBeNull();
    expect(first.ranking_amount).toEqual({ value: null, reason_codes: ["MISSING_CRITICAL_DATA"] });
    expect(scopeSummary(first)).toEqual([["all", "DTC+MARKETPLACE", null], ["channel", "DTC", null]]);
    expect(result.priorities.map(group => group.rule)).toEqual(["MISSING_CRITICAL_DATA"]);
    expect(result.eligible.map(group => group.rule)).toEqual(["MISSING_CRITICAL_DATA"]);
    expect(result.omitted_group_count).toBe(result.groups.length - 1);
    // 合計的扣廣告後貢獻未知 → 營收增貢獻減只剩 MARKETPLACE，primary 取它。
    const revenue = find(result.groups, "REV_UP_CM_DOWN");
    expect(scopeSummary(revenue)).toEqual([["channel", "MARKETPLACE", "-185.00"]]);
    expect(diagnosisGroups(await snapshot("errors/missing_cogs")).groups.map(group => group.rule)).toEqual(["MISSING_CRITICAL_DATA", "DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "NEGATIVE_CHANNEL_CM"]);
  });

  it("impact sign: cost increases are negative; contribution deltas and current values keep their sign", async () => {
    const groups = diagnosisGroups(await snapshot()).groups;
    for (const rule of ["DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"] as const) {
      const group = find(groups, rule);
      expect(group.impact_cents).toBe(`-${group.ranking_amount.value}`);
    }
    expect(find(groups, "REV_UP_CM_DOWN").impact_cents).toBe(find(groups, "REV_UP_CM_DOWN").ranking_amount.value);
    // refund_only：本期淨營收 0 − 0 − 100 = −100、商品成本 −40 → 商品毛利 −60.00（不是費用，不取負）。
    const refund = diagnosisGroups(await snapshot("refund_only")).groups;
    expect(find(refund, "SKU_NEGATIVE_GP").impact_cents).toBe("-60.00");
    // 已知的費用「減少」是有利（正）；缺漏規則沒有金額；0 不帶負號。
    expect(contributionImpact({ code: "MARKETING_BURDEN_UP", ranking_amount: { value: "-12.30", reason_codes: [] } })?.value).toBe("12.30");
    expect(contributionImpact({ code: "FULFILLMENT_BURDEN_UP", ranking_amount: { value: "0.00", reason_codes: [] } })?.value).toBe("0.00");
    expect(contributionImpact({ code: "MISSING_CRITICAL_DATA", ranking_amount: { value: "10.00", reason_codes: [] } })).toBeNull();
    expect(summaryContributionImpact).toBe(contributionImpact);
  });

  it("SKU group: one row, scopes labelled 通路／SKU, no 合計 so primary is the largest |impact|", async () => {
    const refund = diagnosisGroups(await snapshot("refund_only"));
    const sku = find(refund.groups, "SKU_NEGATIVE_GP");
    expect(sku.scopes.map(row => row.label)).toEqual([fill(labels.ui.managerSummary.skuScope, { channels: "DTC", sku: "A" })]);
    // NEGATIVE_CHANNEL_CM −60.00 與 SKU_NEGATIVE_GP −60.00 同值 → 依規則代號。
    expect(refund.groups.map(group => [group.rule, group.impact_cents])).toEqual([["NEGATIVE_CHANNEL_CM", "-60.00"], ["SKU_NEGATIVE_GP", "-60.00"]]);
    const base = await snapshot();
    const skus = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"];
    const synthetic = withDiagnostics(base, skus.map((sku, index) => diagnostic("SKU_NEGATIVE_GP", { kind: "sku", channels: [index % 2 ? "MARKETPLACE" : "DTC"], sku }, `-${index + 1}.00`)));
    const group = find(diagnosisGroups(synthetic).groups, "SKU_NEGATIVE_GP");
    expect(group.scopes).toHaveLength(10);
    expect(group.primary.scope.sku).toBe("S10");
    expect(group.impact_cents).toBe("-10.00");
    expect(group.scopes[0].label).toBe(fill(labels.ui.managerSummary.skuScope, { channels: "MARKETPLACE", sku: "S10" }));
    expect(group.scopes.map(row => row.scope.sku)).toEqual([...skus].reverse());
    const { shown, more } = summaryScopes(group);
    expect(shown.map(row => row.scope.sku)).toEqual(["S10", "S09", "S08", "S07", "S06", "S05", "S04", "S03"]);
    expect(more).toBe(2);
  });

  it("primary is 合計 even when a channel member is larger (05 §7: importance follows the 合計 row)", async () => {
    const base = await snapshot();
    const all: Scope = { kind: "all", channels: ["DTC", "MARKETPLACE"] };
    const synthetic = withDiagnostics(base, [
      diagnostic("REV_UP_CM_DOWN", { kind: "channel", channels: ["MARKETPLACE"] }, "-300.00"),
      diagnostic("REV_UP_CM_DOWN", all, "-100.00"),
      diagnostic("REV_UP_CM_DOWN", { kind: "channel", channels: ["DTC"] }, "200.00"),
      diagnostic("DISCOUNT_BURDEN_UP", all, "150.00"),
    ]);
    const result = diagnosisGroups(synthetic);
    const revenue = find(result.groups, "REV_UP_CM_DOWN");
    expect(scopeSummary(revenue)).toEqual([["all", "DTC+MARKETPLACE", "-100.00"], ["channel", "MARKETPLACE", "-300.00"], ["channel", "DTC", "200.00"]]);
    expect(revenue.impact_cents).toBe("-100.00");
    // |−150.00| > |−100.00|：折扣排前面（舊規則取最大成員 300 會排在前面）。
    expect(result.groups.map(group => group.rule)).toEqual(["DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN"]);
    expect(diagnosisGroups(synthetic, { importanceThreshold: "100.00" }).priorities.map(group => group.rule)).toEqual(["DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN"]);
    expect(diagnosisGroups(synthetic, { importanceThreshold: "100.01" }).priorities.map(group => group.rule)).toEqual(["DISCOUNT_BURDEN_UP"]);
    const summary = buildManagerSummary(synthetic);
    expect(summary.groups.find(group => group.code === "REV_UP_CM_DOWN")!.importance_amount).toBe("100.00");
    expect(summary.groups.find(group => group.code === "REV_UP_CM_DOWN")!.members.map(row => row.scope.kind)).toEqual(["all", "channel", "channel"]);
  });

  it("unknown amounts sort as zero, are excluded by any threshold, and ties fall back to rule code", async () => {
    const base = await snapshot();
    const all: Scope = { kind: "all", channels: ["DTC", "MARKETPLACE"] };
    const synthetic = withDiagnostics(base, [
      { ...diagnostic("REFUND_BURDEN_UP", all, null), ranking_amount: { value: null, reason_codes: ["MISSING_VALUE"] } },
      diagnostic("MARKETING_BURDEN_UP", all, "0.00"),
      diagnostic("FULFILLMENT_BURDEN_UP", all, "-5.00"),
    ]);
    const result = diagnosisGroups(synthetic);
    // 物流費下降 5 → 影響 +5.00；0 與未知都視為 0，同值依規則代號（MARKETING < REFUND）。
    expect(result.groups.map(group => [group.rule, group.impact_cents])).toEqual([["FULFILLMENT_BURDEN_UP", "5.00"], ["MARKETING_BURDEN_UP", "0.00"], ["REFUND_BURDEN_UP", null]]);
    expect(result.eligible.map(group => group.rule)).toEqual(["FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"]);
    expect(result.omitted_group_count).toBe(1);
    expect(diagnosisGroups(withDiagnostics(base, [])).groups).toEqual([]);
    expect(diagnosisGroups(withDiagnostics(base, [])).omitted_group_count).toBe(0);
  });
});

describe("threshold, priorities and omitted count", () => {
  it("threshold is exact and inclusive on |impact_cents|; priorities ≤ 3; omitted counts the rest", async () => {
    const base = await snapshot();
    const at = (value: string) => diagnosisGroups(base, { importanceThreshold: value });
    expect(at("0.00").priorities.map(group => group.rule)).toEqual(GOLDEN_ORDER.slice(0, 3));
    expect(at("0.00").omitted_group_count).toBe(3);
    expect(at("150.00").eligible.map(group => group.rule)).toEqual(GOLDEN_ORDER.slice(0, 3));
    expect(at("150.01").priorities.map(group => group.rule)).toEqual(GOLDEN_ORDER.slice(0, 2));
    expect(at("150.01").omitted_group_count).toBe(4);
    expect(at("315.00").priorities.map(group => group.rule)).toEqual(["REV_UP_CM_DOWN"]);
    expect(at("315.01").priorities).toEqual([]);
    expect(at("315.01").omitted_group_count).toBe(6);
    expect(at("15").eligible).toHaveLength(6);
    expect(at("15").importance_threshold).toBe("15.00");
    expect(at("0.1").importance_threshold).toBe("0.10");
    // 門檻只影響三件事，不影響健檢頁的全部 group。
    expect(at("315.01").groups.map(group => group.rule)).toEqual(GOLDEN_ORDER);
    for (const value of ["0.00", "65.00", "999.00"]) expect(at(value).priorities.length).toBeLessThanOrEqual(TOP_PRIORITY_COUNT);
  });

  it.each(["", "-0.01", "1e3", "NaN", "1.001", "+10", " 10", "10 ", "1,000"])("rejects invalid threshold %j", async value => {
    const base = await snapshot();
    expect(() => diagnosisGroups(base, { importanceThreshold: value })).toThrow("INVALID_IMPORTANCE_THRESHOLD");
    expect(() => parseImportanceThreshold(value)).toThrow("INVALID_IMPORTANCE_THRESHOLD");
  });

  it("parseImportanceThreshold returns exact cents with a 0.00 default", () => {
    expect(parseImportanceThreshold()).toBe(0n);
    expect(parseImportanceThreshold("0")).toBe(0n);
    expect(parseImportanceThreshold("1000.5")).toBe(100050n);
    expect(parseImportanceThreshold("999999999999999999.99")).toBe(99999999999999999999n);
  });

  it("summaryScopes limits labels and reports the remainder; bad limits clamp to zero", async () => {
    const group = find(diagnosisGroups(await snapshot()).groups, "DISCOUNT_BURDEN_UP");
    expect(SUMMARY_SCOPE_LIMIT).toBe(8);
    expect(summaryScopes(group)).toEqual({ shown: group.scopes, more: 0 });
    expect(summaryScopes(group, 2).shown).toHaveLength(2);
    expect(summaryScopes(group, 2).more).toBe(1);
    expect(summaryScopes(group, 0)).toEqual({ shown: [], more: 3 });
    expect(summaryScopes(group, -4)).toEqual({ shown: [], more: 3 });
    expect(summaryScopes(group, 1.9)).toEqual({ shown: group.scopes.slice(0, 1), more: 2 });
    expect(summaryScopes({ scopes: [] })).toEqual({ shown: [], more: 0 });
  });

  it("diagnosisScopeLabel: 合計 / channel / 通路／SKU, with the demo alias only on the demo dataset", () => {
    expect(diagnosisScopeLabel({ kind: "all", channels: ["DTC"] }, false)).toBe(labels.sections.total);
    expect(diagnosisScopeLabel({ kind: "channel", channels: ["DTC"] }, false)).toBe("DTC");
    expect(diagnosisScopeLabel({ kind: "channel", channels: ["DTC"] }, true)).toBe(labels.demoChannelAlias.DTC);
    expect(diagnosisScopeLabel({ kind: "sku", channels: ["MARKETPLACE"], sku: "B" }, false)).toBe(fill(labels.ui.managerSummary.skuScope, { channels: "MARKETPLACE", sku: "B" }));
  });
});

describe("single source with buildManagerSummary (三件事 and Markdown follow the same groups)", () => {
  it.each(["golden", "demo", "zero_ad", "refund_only", "errors/missing_cogs", "errors/missing_ad_day"])("%s: same group order, priorities, omitted count and impact", async name => {
    const base = await snapshot(name);
    for (const threshold of ["0.00", "100.00", "999999999999999999.99"]) {
      const groups = diagnosisGroups(base, { importanceThreshold: threshold });
      const summary = buildManagerSummary(base, { importanceThreshold: threshold });
      expect(summary.groups.map(group => group.code)).toEqual(groups.groups.map(group => group.rule));
      expect(summary.priorities.map(group => group.code)).toEqual(groups.priorities.map(group => group.rule));
      expect(summary.omitted_group_count).toBe(groups.omitted_group_count);
      expect(summary.importance_threshold).toBe(groups.importance_threshold);
      expect(summary.diagnosis.map(group => group.rule)).toEqual(groups.groups.map(group => group.rule));
      for (const [index, group] of groups.groups.entries()) {
        const priority = summary.groups[index];
        expect(priority.impact_cents).toBe(group.impact_cents);
        expect(priority.importance_amount).toBe(group.impact_cents === null ? null : group.impact_cents.replace(/^-/, ""));
        expect(priority.title).toBe(group.headline);
        expect(priority.members.map(row => row.id)).toEqual(group.scopes.map(row => row.diagnostic.id));
      }
    }
  }, 30_000);

  it("Markdown 三件事 lists the same headlines, scopes and 對貢獻影響 amounts in TopThree order", async () => {
    const base = await snapshot();
    const summary = buildManagerSummary(base);
    const body = exportManagerSummaryMarkdown(summary).split(`## ${labels.sections.technicalDetails}`)[0];
    const section = body.split(`## ${labels.sections.topThree}`)[1];
    const expected = diagnosisGroups(base).priorities.map((group, index) => fill(labels.ui.managerSummary.mdPriorityRow, { n: index + 1, headline: group.headline, scope: `${labels.sections.total}（DTC、MARKETPLACE）`, amount: group.impact_cents! }));
    const rows = section.split("\n").filter(line => /^\d+\. /.test(line));
    expect(rows).toEqual(expected);
    expect(rows.join("\n")).toContain("-250.00");
    expect(rows.join("\n")).not.toContain("+250.00");
    expect(exportManagerSummaryMarkdown(summary)).toContain(labels.diagnosisList.techPriorityNote);
  });
});

function snapshotIds(base: WorkspaceSnapshot): string[] {
  // 合併只移除「單一通路時與合計完全重複」的成員；golden 兩通路時每個診斷都保留。
  return base.report.diagnostics.map(row => row.id).sort();
}
