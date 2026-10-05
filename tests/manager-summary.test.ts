import { describe, expect, it } from "vitest";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, summaryDecisionState, withSummaryScenarioSelection, type SummaryDecisionContext } from "../src/application/manager-summary";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters } from "../src/domain/types";
import { fixture } from "./helpers/fixtures";
import { labels } from "../src/i18n";
import { csvHeader } from "../src/application/copy";

// R2：Markdown 標題與附錄分隔都走 labels，避免硬編碼中文。
const copy = labels.ui.managerSummary;
const TECH_APPENDIX = `## ${labels.sections.technicalDetails}`;
const DRAFT_TITLE = `${labels.brand.name} ${copy.title}（${labels.meeting.decisions.draft}）`;
const basisItem = (fragment: string): string => {
  const item = labels.basis.items.find(row => row.includes(fragment));
  if (!item) throw new Error(`labels.basis.items 缺少含「${fragment}」的口徑說明`);
  return item;
};

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
    const header = ["channel", "previous_net_revenue", "current_net_revenue", "net_revenue_change"].map(key => `"${csvHeader(key)}"`).join(",");
    expect(csv).toContain(header);
    expect(csvHeader("previous_net_revenue")).toBe(`${labels.periods.previous}${labels.metrics.net_revenue.label} (previous_net_revenue)`);
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
    const body = result.split(TECH_APPENDIX)[0];
    expect(body).toContain(DRAFT_TITLE);
    expect(body).toContain("+220.00");
    expect(body).toContain("-315.00");
    expect(body).toContain("&lt;img");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("[click](javascript:");
    expect(body).not.toContain("dataset_hash");
    expect(body).not.toContain('["fact"');
    expect(result).toContain(summary.dataset_hash);
    // R2 §8：免責集中到「口徑說明」清單（labels.basis.items），舊句「各範圍不可相加」「非改善收益」改為以下兩條。
    expect(result).toContain(`## ${labels.basis.title}`);
    expect(result).toContain(basisItem("各通路的差額不能再相加"));
    expect(result).toContain(basisItem("不是可以省下的錢"));
  });

  it("leaves unpinned actions in the appendix and distinguishes them from an empty workspace", async () => {
    const summary = buildManagerSummary(await snapshot());
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, pinnedOnly: true,
      scenarios: [], actions: [{ id: "unpinned", problem: "核對物流帳單", action: "向物流商取得明細", owner: "營運主管", deadline: "2026-10-20", risk: "先核對入帳", status: "draft", scopeLabel: "DTC", pinned: false }],
    };
    const decisions = summaryDecisionState(summary, context);
    expect(decisions.mainActions).toEqual([]);
    expect(decisions.appendixActions.map(action => action.id)).toEqual(["unpinned"]);
    const [body, appendix] = exportManagerSummaryMarkdown(summary, context).split(TECH_APPENDIX);
    expect(body).toContain(copy.unpinnedNotice);
    expect(body).not.toContain(copy.noActions);
    expect(body).not.toContain("核對物流帳單");
    expect(appendix).toContain("核對物流帳單");
    expect(appendix).toContain("營運主管");
    const empty = exportManagerSummaryMarkdown(summary, { ...context, actions: [] }).split(TECH_APPENDIX)[0];
    expect(empty).toContain(copy.noActions);
    expect(empty).not.toContain(copy.unpinnedNotice);
  });

  it("stale and mismatched decision snapshots never appear as a current selected plan", async () => {
    const summary = buildManagerSummary(await snapshot());
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioId: "p1",
      scenarios: [{ id: "p1", name: "歷史方案", status: "stale", scopeLabel: "DTC", contribution: "284.00", delta: "14.00", assumptions: ["假設銷量不變"] }], actions: [],
    };
    const stale = exportManagerSummaryMarkdown(summary, context).split(TECH_APPENDIX)[0];
    expect(stale).toContain(copy.noSelectedScenario);
    expect(stale).not.toContain("284.00");
    const mismatch = { ...context, dataset_hash: "other", scenarios: context.scenarios.map(row => ({ ...row, status: "current" as const })) };
    expect(exportManagerSummaryMarkdown(summary, mismatch).split(TECH_APPENDIX)[0]).not.toContain("284.00");
  });

  it("headline and channel facts remain traceable in the appendix when no diagnostic fires", async () => {
    const report = await snapshot();
    const summary = buildManagerSummary({ ...report, report: { ...report.report, diagnostics: [] } });
    expect(summary.priorities).toEqual([]);
    const [body, appendix] = exportManagerSummaryMarkdown(summary).split(TECH_APPENDIX);
    expect(body).not.toContain("fact_id");
    expect(appendix).toContain(`${labels.metrics.net_revenue.label}：2250.00`);
    expect(appendix).toContain(`${labels.metrics.net_revenue.label}：2470.00`);
    expect(appendix).toContain(`${labels.metrics.contribution_after_marketing.label}：570.00`);
    expect(appendix).toContain(`${labels.metrics.contribution_after_marketing.label}：255.00`);
    expect(appendix).toContain(`${labels.metrics.contribution_after_marketing.label}：170.00`);
    expect(appendix).toContain(`${labels.metrics.contribution_after_marketing.label}：-15.00`);
    expect(appendix).toContain("sales\\_daily.csv");
    expect(appendix).toContain("channel\\_costs\\_daily.csv");
    expect(appendix).toContain("ad\\_spend\\_daily.csv");
    // R2：前期→上期；差額公式句改由 labels 的技術細節備註提供。
    expect(copy.techFactsNote).toContain(`差額＝${labels.periods.current} − ${labels.periods.previous}`);
    expect(appendix).toContain(copy.techFactsNote);
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
