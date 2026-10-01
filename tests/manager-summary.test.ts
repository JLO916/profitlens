import { describe, expect, it } from "vitest";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, summaryDecisionState, withSummaryScenarioSelection, type SummaryDecisionContext } from "../src/application/manager-summary";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";

async function snapshot(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name);
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  return createSnapshot(result.dataset!, filters, await hashInput(input));
}

describe("PL-06/09 manager summary: fixed references and independent display policy", () => {
  it("uses golden amounts and channel transitions without inventing recovery estimates", async () => {
    const report = await snapshot();
    const summary = buildManagerSummary(report);
    expect(summary.headlines.map(row => [row.metric, row.previous.value, row.current.value, row.change.value])).toEqual([
      ["net_revenue", "2250.00", "2470.00", "220.00"],
      ["contribution_after_marketing", "570.00", "255.00", "-315.00"],
    ]);
    expect(summary.channels.map(row => [row.channel, row.contribution.previous.value, row.contribution.current.value, row.contribution.change.value, row.contribution.transition])).toEqual([
      ["DTC", "400.00", "270.00", "-130.00", "no_sign_change"],
      ["MARKETPLACE", "170.00", "-15.00", "-185.00", "turned_negative"],
    ]);
    expect(summary).not.toHaveProperty("recoverable_profit");
    expect(summary.priorities).toHaveLength(3);
    for (const item of summary.priorities) expect(item.fact_ids.every(id => report.report.facts.some(fact => fact.id === id))).toBe(true);
  });

  it("groups all/channel signals by rule and does not add nested ranking amounts", async () => {
    const original = await snapshot();
    const before = original.report.diagnostics.map(row => row.id);
    const summary = buildManagerSummary(original);
    const item = summary.groups.find(row => row.code === "REV_UP_CM_DOWN")!;
    expect(item.members.map(row => row.scope.kind)).toEqual(["all", "channel", "channel"]);
    expect(item.ranking_amount.value).toBe("-315.00");
    expect(item.importance_amount).toBe("315.00");
    expect(item.members).toHaveLength(3);
    expect(original.report.diagnostics.map(row => row.id)).toEqual(before);
    expect(new Set(summary.groups.map(row => row.code)).size).toBe(summary.groups.length);
  });

  it("collapses all/channel duplicate signals when only one channel is selected", async () => {
    const summary = buildManagerSummary(await snapshot("golden", { channels: ["DTC"] }));
    expect(summary.groups.find(row => row.code === "REV_UP_CM_DOWN")!.members).toHaveLength(1);
    expect(summary.channels).toHaveLength(1);
    expect(summary.headlines[1].change.value).toBe("-130.00");
  });

  it("threshold is exact, inclusive, and affects summary selection only", async () => {
    const original = await snapshot();
    expect(buildManagerSummary(original, { importanceThreshold: "315.00" }).priorities.map(row => row.code)).toEqual(["REV_UP_CM_DOWN"]);
    expect(buildManagerSummary(original, { importanceThreshold: "315.01" }).priorities).toEqual([]);
    expect(original.report.diagnostics.length).toBeGreaterThan(3);
    expect(buildManagerSummary(original, { importanceThreshold: "0.10" }).importance_threshold).toBe("0.10");
  });

  it.each(["", "-0.01", "1e3", "NaN", "1.001", "+10", " 10"])("rejects invalid threshold %s", async value => {
    const report = await snapshot();
    expect(() => buildManagerSummary(report, { importanceThreshold: value })).toThrow("INVALID_IMPORTANCE_THRESHOLD");
  });

  it.each(["errors/missing_cogs", "errors/missing_ad_day"])("unknown remains unknown and is first regardless of threshold: %s", async name => {
    const summary = buildManagerSummary(await snapshot(name), { importanceThreshold: "999999999999999999.99" });
    expect(summary.headlines[0].current.value).toBe("2470.00");
    expect(summary.headlines[1].current.value).toBeNull();
    expect(summary.headlines[1].change.value).toBeNull();
    expect(summary.headlines[1].change.reason_codes.length).toBeGreaterThan(0);
    expect(summary.priorities.map(row => row.code)).toEqual(["MISSING_CRITICAL_DATA"]);
    expect(summary.priorities[0].importance_amount).toBeNull();
  });

  it("wide CSV preserves exact numeric negatives and protects formula-like channels", async () => {
    const report = await snapshot();
    const original = buildManagerSummary(report);
    const summary = { ...original, channels: original.channels.map(row => ({ ...row, channel: '=HYPERLINK("https://evil.test")' })) };
    const csv = exportChannelComparisonCsv(summary);
    expect(csv).toContain('"通路","前期商品淨營收","本期商品淨營收","商品淨營收差額"');
    expect(csv).toContain('"170.00","-15.00","-185.00"');
    expect(csv).toContain('"\'=HYPERLINK(');
    expect(csv).not.toContain('"\'-15.00"');
    expect(csv).toContain('"2026-08-01","2026-08-01","2026-08-02","2026-08-02"');
  });

  it("Markdown is a readable draft, escapes hostile manual text, and moves fact IDs into appendix", async () => {
    const summary = buildManagerSummary(await snapshot());
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash,
      scenarios: [], actions: [{ id: "a", problem: "<img src=x onerror=alert(1)>", action: "[click](javascript:alert(1))", owner: "經理", deadline: "2026-10-20", risk: "先核對入帳", status: "draft", scopeLabel: "全部通路" }],
    };
    const result = exportManagerSummaryMarkdown(summary, context);
    const body = result.split("## 技術稽核附錄")[0];
    expect(body).toContain("主管會議摘要（草稿）");
    expect(body).toContain("+220.00");
    expect(body).toContain("-315.00");
    expect(body).toContain("&lt;img");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("[click](javascript:");
    expect(body).not.toContain("dataset_hash");
    expect(body).not.toContain('["fact"');
    expect(result).toContain(summary.dataset_hash);
    expect(result).toContain("各範圍不可相加");
    expect(result).toContain("非改善收益");
  });

  it("stale and mismatched decision snapshots never appear as a current selected plan", async () => {
    const summary = buildManagerSummary(await snapshot());
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioId: "p1",
      scenarios: [{ id: "p1", name: "歷史方案", status: "stale", scopeLabel: "DTC", contribution: "284.00", delta: "14.00", assumptions: ["假設銷量不變"] }], actions: [],
    };
    const stale = exportManagerSummaryMarkdown(summary, context).split("## 技術稽核附錄")[0];
    expect(stale).toContain("未選擇可沿用的方案");
    expect(stale).not.toContain("284.00");
    const mismatch = { ...context, dataset_hash: "other", scenarios: context.scenarios.map(row => ({ ...row, status: "current" as const })) };
    expect(exportManagerSummaryMarkdown(summary, mismatch).split("## 技術稽核附錄")[0]).not.toContain("284.00");
  });

  it("headline and channel facts remain traceable in the appendix when no diagnostic fires", async () => {
    const report = await snapshot();
    const summary = buildManagerSummary({ ...report, report: { ...report.report, diagnostics: [] } });
    expect(summary.priorities).toEqual([]);
    const [body, appendix] = exportManagerSummaryMarkdown(summary).split("## 技術稽核附錄");
    expect(body).not.toContain("fact_id");
    expect(appendix).toContain("商品淨營收：2250.00");
    expect(appendix).toContain("商品淨營收：2470.00");
    expect(appendix).toContain("行銷後貢獻：570.00");
    expect(appendix).toContain("行銷後貢獻：255.00");
    expect(appendix).toContain("行銷後貢獻：170.00");
    expect(appendix).toContain("行銷後貢獻：-15.00");
    expect(appendix).toContain("sales\\_daily.csv");
    expect(appendix).toContain("channel\\_costs\\_daily.csv");
    expect(appendix).toContain("ad\\_spend\\_daily.csv");
    expect(appendix).toContain("差額＝本期金額 − 前期金額");
  });

  it("explicitly clearing the page selection overrides a supplied default plan", async () => {
    const summary = buildManagerSummary(await snapshot());
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioId: "plan",
      scenarios: [{ id: "plan", name: "假設方案", status: "current", scopeLabel: "DTC", contribution: "284.00", delta: "14.00", assumptions: ["銷量相對變化 0%"] }], actions: [],
    };
    expect(summaryDecisionState(summary, withSummaryScenarioSelection(context, null)).selected?.id).toBe("plan");
    expect(summaryDecisionState(summary, withSummaryScenarioSelection(context, "")).selected).toBeNull();
    expect(summaryDecisionState(summary, withSummaryScenarioSelection(context, "plan")).selected?.id).toBe("plan");
    expect(context.selectedScenarioId).toBe("plan");
  });
});
