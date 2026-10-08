import { describe, expect, it } from "vitest";
import { validatePeriods } from "@/domain/date";
import { comparePeriods } from "@/domain/comparison";
import { analyzeDataset } from "@/domain/analysis";
import { validateDataset } from "@/domain/validation";
import type { DatasetInput, Manifest } from "@/domain/types";
import { createSnapshot, hashInput } from "@/application/workspace";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { observationCatalog, validateInsightOutput } from "@/ai/grounding";
import { AiSnapshotSchema } from "@/ai/contracts";
import { exportSnapshotCsv } from "@/application/export";
import { createDecisionSession, isDecisionSessionStale } from "@/application/decision";
import { exportDecisionJson, exportDecisionMarkdown, exportDecisionCsv } from "@/application/decision-export";
import { csvHeader, csvHeaderKey } from "@/application/copy";
import { labels } from "@/i18n";
import { parseCsv } from "@/lib/csv";
import { fixture } from "./helpers/fixtures";

const monthSettings = {
  coverage_start: "2026-08-01", coverage_end: "2026-09-30", data_as_of: "2026-09-30",
  previous_period: { start: "2026-08-01", end: "2026-08-31" }, current_period: { start: "2026-09-01", end: "2026-09-30" },
  comparison_mode: "calendar_months" as const,
};
function monthlyInput(zero = false, missing = false): DatasetInput {
  const original = fixture();
  const days = [...Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`)];
  return {
    manifest: { ...(original.manifest as Manifest), ...monthSettings, channels: ["DTC"] },
    files: {
      "sales_daily.csv": "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + days.map(date => `${date},DTC,A,測試,1,${zero ? 0 : date.startsWith("2026-08") ? 100 : 200},0,0,${missing && date === "2026-09-01" ? "" : zero ? 0 : 40},TWD`).join("\n"),
      "channel_costs_daily.csv": "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency\n" + days.map(date => `${date},DTC,0,0,${zero ? 0 : 10},0,TWD`).join("\n"),
      "ad_spend_daily.csv": "date,channel,ad_spend,currency\n" + days.map(date => `${date},DTC,${zero ? 0 : 5},TWD`).join("\n"),
    },
  };
}
async function monthlySnapshot(zero = false, missing = false) {
  const input = monthlyInput(zero, missing);
  const validation = validateDataset(input);
  expect(validation.classification).toBe(missing ? "partial" : "valid");
  const dataset = validation.dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}

describe("PL-02 explicit period comparison contract", () => {
  it("accepts the review's full August 31 / September 30 case only as calendar months", () => {
    expect(validatePeriods(monthSettings)).toEqual([]);
    expect(validatePeriods({ ...monthSettings, comparison_mode: "same_days" })).toContain("UNEQUAL_PERIOD_LENGTH");
    const legacy = { ...monthSettings, comparison_mode: undefined };
    expect(validatePeriods(legacy)).toContain("UNEQUAL_PERIOD_LENGTH");
  });
  it("blocks the review's reversed chronology in both manifest and analysis", () => {
    const input = fixture();
    const manifest = input.manifest as Manifest;
    input.manifest = { ...manifest, previous_period: manifest.current_period, current_period: manifest.previous_period };
    expect(validateDataset(input).issues.some(issue => issue.reason_code === "PERIOD_ORDER_INVALID")).toBe(true);
    const dataset = validateDataset(fixture()).dataset!;
    expect(() => analyzeDataset(dataset, { previous_period: manifest.current_period, current_period: manifest.previous_period })).toThrow("PERIOD_ORDER_INVALID");
  });
  it.each([
    { previous_period: { start: "2026-08-02", end: "2026-08-31" } },
    { current_period: { start: "2026-09-01", end: "2026-09-29" } },
    { previous_period: { start: "2026-07-01", end: "2026-08-31" } },
  ])("rejects incomplete or multiple natural months: %j", patch => {
    expect(validatePeriods({ ...monthSettings, ...patch })).toContain("INCOMPLETE_CALENDAR_MONTH");
  });
  it("accepts leap-year complete February and rejects invalid modes, coverage and future endpoints", () => {
    expect(validatePeriods({ ...monthSettings, coverage_start: "2024-02-01", previous_period: { start: "2024-02-01", end: "2024-02-29" }, current_period: { start: "2024-03-01", end: "2024-03-31" } })).toEqual([]);
    expect(validatePeriods({ ...monthSettings, coverage_end: "2026-09-29" })).toContain("PERIOD_OUTSIDE_COVERAGE");
    expect(validatePeriods({ ...monthSettings, data_as_of: "2026-09-29" })).toContain("PERIOD_AFTER_DATA_AS_OF");
    expect(validatePeriods({ ...monthSettings, comparison_mode: "guess" as "same_days" })).toContain("INVALID_COMPARISON_MODE");
    expect(validatePeriods({ ...monthSettings, comparison_mode: null as unknown as "same_days" })).toContain("INVALID_COMPARISON_MODE");
  });
  it("normalizes old manifest to same_days and preserves golden totals and bridge", () => {
    const dataset = validateDataset(fixture()).dataset!;
    expect(dataset.manifest.comparison_mode).toBe("same_days");
    const report = analyzeDataset(dataset);
    expect(report.scope.comparison_mode).toBe("same_days");
    expect(report.comparison).toMatchObject({ mode: "same_days", previous_days: 1, current_days: 1 });
    expect(report.current.metrics.contribution_after_marketing.value).toBe("255.00");
    expect(report.bridge.sum.value).toBe("-315.00");
  });
  it("keeps untruncated monthly totals, separate Decimal daily averages, and partial weeks", async () => {
    const { snapshot } = await monthlySnapshot();
    const { report } = snapshot;
    expect(report.previous.metrics.net_revenue.value).toBe("3100.00");
    expect(report.current.metrics.net_revenue.value).toBe("6000.00");
    expect(report.bridge.contribution_change.value).toBe("2955.00");
    expect(report.comparison).toMatchObject({ mode: "calendar_months", previous_days: 31, current_days: 30,
      previous_daily_average: { net_revenue: { value: "100.00" }, contribution_after_marketing: { value: "45.00" } },
      current_daily_average: { net_revenue: { value: "200.00" }, contribution_after_marketing: { value: "145.00" } },
      daily_average_changes: { net_revenue: { value: "100.00" }, contribution_after_marketing: { value: "100.00" } },
    });
    expect(snapshot.weeks).toHaveLength(10);
    expect(snapshot.weeks.at(-1)?.end).toBe("2026-09-30");
    expect(report.comparison.current_daily_average).not.toHaveProperty("gross_margin");
  });
  it("zero is zero money; null remains null through daily average and change", async () => {
    const zero = (await monthlySnapshot(true)).snapshot.report;
    expect(zero.comparison.current_daily_average.net_revenue.value).toBe("0.00");
    expect(zero.current.metrics.gross_margin.value).toBeNull();
    const partial = (await monthlySnapshot(false, true)).snapshot.report;
    expect(partial.comparison.current_daily_average.net_revenue.value).toBe("200.00");
    expect(partial.comparison.current_daily_average.contribution_after_marketing.value).toBeNull();
    expect(partial.comparison.daily_average_changes.contribution_after_marketing.value).toBeNull();
    expect(partial.comparison.current_daily_average.contribution_after_marketing.reason_codes).toContain("MISSING_COGS");
  });
  it("computes daily change before display rounding and retains large Decimal precision", () => {
    const report = analyzeDataset(validateDataset(fixture()).dataset!);
    const previous = { ...report.previous, period: { start: "2026-08-01", end: "2026-08-03" }, metrics: { ...report.previous.metrics, net_revenue: { value: "0.01", reason_codes: [] } } };
    const current = { ...report.current, period: { start: "2026-08-04", end: "2026-08-06" }, metrics: { ...report.current.metrics, net_revenue: { value: "0.02", reason_codes: [] } } };
    const comparison = comparePeriods(previous, current, "same_days");
    expect(comparison.previous_daily_average.net_revenue.value).toBe("0.00");
    expect(comparison.current_daily_average.net_revenue.value).toBe("0.01");
    expect(comparison.daily_average_changes.net_revenue.value).toBe("0.00");
    previous.metrics.net_revenue.value = "999999999999999999999999999999.99";
    expect(comparePeriods(previous, current, "same_days").previous_daily_average.net_revenue.value).toBe("333333333333333333333333333333.33");
  });
  it("AI snapshot explicitly validates comparison mode, day counts, chronology and as-of", async () => {
    const { snapshot } = await monthlySnapshot();
    const payload = prepareAiSnapshot(snapshot, 1).payload;
    expect(payload.comparison).toEqual({ mode: "calendar_months", previous_days: 31, current_days: 30 });
    expect(AiSnapshotSchema.safeParse(payload).success).toBe(true);
    expect(AiSnapshotSchema.safeParse({ ...payload, comparison: { ...payload.comparison, current_days: 31 } }).success).toBe(false);
    expect(AiSnapshotSchema.safeParse({ ...payload, comparison: { ...payload.comparison, mode: "same_days" } }).success).toBe(false);
    expect(AiSnapshotSchema.safeParse({ ...payload, periods: { previous: payload.periods.current, current: payload.periods.previous } }).success).toBe(false);
    expect(AiSnapshotSchema.safeParse({ ...payload, data_as_of: "2026-09-29" }).success).toBe(false);
  });
  it("AI catalog labels full-month totals and rejects relabeling them as daily facts", async () => {
    const payload = prepareAiSnapshot((await monthlySnapshot()).snapshot, 1).payload;
    const item = observationCatalog(payload).find(entry => entry.kind === "value")!;
    // R2：整月合計提醒改由 labels.shell.ai.grounding.calendarMonthNote 供字，仍須出現在每則整月觀察裡。
    expect(labels.shell.ai.grounding.calendarMonthNote).not.toBe("");
    expect(item.observation).toContain(labels.shell.ai.grounding.calendarMonthNote);
    const output = {
      snapshot_id: payload.snapshot_id,
      insights: [{ fact_ids: item.fact_ids, observation: item.observation.replace("所選通路合計", "所選通路日均"), hypotheses: ["待驗證假說：來源時點可能不同。"], recommended_action: "核對來源帳務。", owner_role: "營運", verification_metric: "商品淨營收", stop_condition: "資料口徑不一致則停止。", additional_data_needed: [], limitations: ["不是因果分析。"] }],
      limitations: ["行銷後貢獻不是公司淨利。"],
    };
    expect(validateInsightOutput(output, payload)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_OBSERVATION" })]) });
    expect(AiSnapshotSchema.safeParse({ ...payload, schema_version: "ai-snapshot-v1" }).success).toBe(false);
  });
  it("CSV and all decision formats contain mode, days and distinct daily amounts", async () => {
    const { dataset, snapshot } = await monthlySnapshot();
    const csv = parseCsv(exportSnapshotCsv(dataset, snapshot));
    // R2：CSV 標題列為「中文名稱 (english_key)」，以 csvHeaderKey 取回英文 key 後再查欄位。
    const rows = csv.rows.map(row => Object.fromEntries(csv.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
    expect(rows.every(row => row.comparison_mode === "calendar_months" && row.previous_days === "31" && row.current_days === "30")).toBe(true);
    expect(rows.find(row => row.row_type === "daily_average" && row.period === "current" && row.metric === "net_revenue")).toMatchObject({ value: "200.00", unit: "TWD/day" });
    const session = createDecisionSession(dataset, snapshot, 1);
    const decision = JSON.parse(exportDecisionJson(session, [], []));
    expect(decision.session.comparison).toMatchObject({ mode: "calendar_months", previous_days: 31, current_days: 30 });
    expect(exportDecisionMarkdown(session, [], [])).toContain("calendar\\_months");
    expect(exportDecisionCsv(session, [], [])).toContain(`"${csvHeader("comparison_mode")}"`);
  });
  it("a changed comparison mode expires the captured decision scope", async () => {
    const input = fixture("demo");
    const dataset = validateDataset(input).dataset!;
    // Equal-length June and July subsets are intentionally same-days only; mode is bound to active scope.
    const original = await createSnapshot(dataset, {}, await hashInput(input));
    const changed = structuredClone(original);
    changed.report.scope.comparison_mode = "calendar_months";
    expect(isDecisionSessionStale(createDecisionSession(dataset, original, 1), changed, 1)).toBe(true);
  });
});
