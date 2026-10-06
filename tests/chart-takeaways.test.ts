import { beforeAll, describe, expect, it } from "vitest";
import { channelConclusion, trendTakeaways } from "../src/application/chart-takeaways";
import { channelLabel, demoAlias, formatHeadlineAmount } from "../src/application/copy";
import { formatAmountL1, formatEmpty, formatMetric, formatPeriodL1, periodDays } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import type { Metric } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// V3-4b 趨勢 takeaway 列與各通路結論標題（C16，PRD §7.1 第 7、8 點）。
// 期待值由 labels 模板＋格式化函式＋snapshot 的精確字串組出；其他情境用 structuredClone(snapshot) 只改呈現層輸入（weeks、通路 metrics）。

const trendCopy = labels.overview.trendV3;
const channelCopy = labels.overview.channelsV3;

async function snapshot(name = "golden"): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
let golden: WorkspaceSnapshot;
let demo: WorkspaceSnapshot;
beforeAll(async () => { golden = await snapshot("golden"); demo = await snapshot("demo"); });

const money = (value: string | null): Metric => value === null ? { value: null, reason_codes: ["MISSING_COGS"] } : { value, reason_codes: [] };
const span = (snap: WorkspaceSnapshot, period: { start: string; end: string }) => formatPeriodL1(period.start, period.end, { days: false, anchor: snap.data_as_of });
/** 改通路的扣廣告後貢獻（只改呈現層輸入）。 */
function withChannelCM(base: WorkspaceSnapshot, values: Partial<Record<string, { previous?: string | null; current?: string | null }>>): WorkspaceSnapshot {
  const snap = structuredClone(base);
  for (const [channel, value] of Object.entries(values)) {
    if (value?.previous !== undefined) snap.report.previous.channels[channel].metrics.contribution_after_marketing = money(value.previous);
    if (value?.current !== undefined) snap.report.current.channels[channel].metrics.contribution_after_marketing = money(value.current);
  }
  return snap;
}

describe("trendTakeaways：每週趨勢的 takeaway 列", () => {
  it("demo：淨營收期間合計（L1）與最近完整週（最後一個滿 7 天的本期週），最後一週滿 7 天不加註", () => {
    const result = trendTakeaways(demo);
    const currentWeeks = demo.weeks.filter(week => week.period === "current");
    const last = currentWeeks.at(-1)!;
    expect(periodDays(last.start, last.end)).toBe(7);
    expect(result.total).toEqual({ label: trendCopy.takeaways.total, metric: demo.report.current.metrics.net_revenue, display: formatAmountL1(demo.report.current.metrics.net_revenue.value) });
    expect(result.lastCompleteWeek).toEqual({ label: trendCopy.takeaways.lastCompleteWeek, week: last, display: formatAmountL1(last.metrics.net_revenue.value), range: span(demo, last) });
    expect(result.lastWeekIncomplete).toBe(false);
    expect(result.incompleteNote).toBeNull();
    expect(result.subtitle).toBe(labels.ui.overview.trendNote);
  });

  it("golden：本期只有 1 天，沒有完整週 → 不適用；最後一週未滿 7 天要加註", () => {
    const result = trendTakeaways(golden);
    expect(result.total.display).toBe(formatMetric("net_revenue", golden.report.current.metrics.net_revenue, "L1"));
    expect(result.lastCompleteWeek).toEqual({ label: trendCopy.takeaways.lastCompleteWeek, week: null, display: formatEmpty("notApplicable"), range: null });
    expect(result.lastWeekIncomplete).toBe(true);
    expect(result.incompleteNote).toBe(trendCopy.incompleteNote);
  });

  it("最後一週改成 4 天：判定未滿 7 天，最近完整週改取前一週", () => {
    const snap = structuredClone(demo);
    const current = snap.weeks.filter(week => week.period === "current");
    const last = current.at(-1)!;
    last.end = "2026-08-20";
    expect(periodDays(last.start, last.end)).toBe(4);
    const result = trendTakeaways(snap);
    const previousWeek = current.at(-2)!;
    expect(result.lastWeekIncomplete).toBe(true);
    expect(result.incompleteNote).toBe(trendCopy.incompleteNote);
    expect(result.lastCompleteWeek.week).toBe(previousWeek);
    expect(result.lastCompleteWeek.display).toBe(formatAmountL1(previousWeek.metrics.net_revenue.value));
    expect(result.lastCompleteWeek.range).toBe(span(snap, previousWeek));
  });

  it("上期的週不算進最近完整週；淨營收待補時 takeaway 顯示資料待補", () => {
    const snap = structuredClone(demo);
    snap.weeks = snap.weeks.filter(week => week.period === "previous");
    snap.report.current.metrics.net_revenue = money(null);
    const result = trendTakeaways(snap);
    expect(result.lastCompleteWeek.week).toBeNull();
    expect(result.lastWeekIncomplete).toBe(false);
    expect(result.total.display).toBe(formatEmpty("missing"));
  });
});

describe("channelConclusion：各通路扣廣告後貢獻的結論標題", () => {
  it("demo：平台通路扣完廣告虧（轉負），標題寫虧最多的通路與絕對值；列依 report.scope.channels 順序", () => {
    const result = channelConclusion(demo);
    const alias = demoAlias(demo.report.dataset_id);
    const { current, previous } = demo.report;
    expect(result.rows.map(row => row.channel)).toEqual(demo.report.scope.channels);
    expect(result.rows.map(row => row.label)).toEqual(demo.report.scope.channels.map(channel => channelLabel(channel, alias)));
    for (const row of result.rows) {
      expect(row.current).toBe(current.channels[row.channel].metrics.contribution_after_marketing);
      expect(row.previous).toBe(previous.channels[row.channel].metrics.contribution_after_marketing);
      expect(row.margin).toBe(current.channels[row.channel].metrics.contribution_margin);
    }
    expect(result.rows.map(row => row.turned)).toEqual([null, "negative"]);
    expect(result.worst).toBe("MARKETPLACE");
    expect(result.best).toBe("DTC");
    expect(result.title).toBe(fill(channelCopy.title.negative, { channel: channelLabel("MARKETPLACE", alias), amount: formatHeadlineAmount(current.channels.MARKETPLACE.metrics.contribution_after_marketing.value) }));
    expect(result.subtitle).toBe(fill(channelCopy.subtitle, { section: labels.overview.sections.channelMix, period: span(demo, demo.report.current.period) }));
    expect(channelConclusion(demo, { alias: false }).rows.map(row => row.label)).toEqual(demo.report.scope.channels);
  });

  it("golden：不套 alias，MARKETPLACE 由 170.00 轉為 −15.00", () => {
    const result = channelConclusion(golden);
    expect(golden.report.current.channels.MARKETPLACE.metrics.contribution_after_marketing.value).toBe("-15.00");
    expect(result.rows.find(row => row.channel === "MARKETPLACE")!.turned).toBe("negative");
    expect(result.title).toBe(fill(channelCopy.title.negative, { channel: "MARKETPLACE", amount: formatHeadlineAmount("-15.00") }));
  });

  it("沒有虧損的通路：寫扣廣告後貢獻最高的通路與 L1 金額；上期 ≤ 0 本期 > 0 標轉正", () => {
    const snap = withChannelCM(golden, { MARKETPLACE: { previous: "-20.00", current: "300.00" } });
    const result = channelConclusion(snap);
    expect(result.worst).toBeNull();
    expect(result.best).toBe("MARKETPLACE");
    expect(result.title).toBe(fill(channelCopy.title.best, { channel: "MARKETPLACE", amount: formatAmountL1("300.00") }));
    expect(result.rows.map(row => row.turned)).toEqual([null, "positive"]);

    const steady = channelConclusion(withChannelCM(golden, { MARKETPLACE: { current: "100.00" } }));
    expect(steady.title).toBe(fill(channelCopy.title.best, { channel: "DTC", amount: formatAmountL1(golden.report.current.channels.DTC.metrics.contribution_after_marketing.value) }));
    expect(steady.rows.map(row => row.turned)).toEqual([null, null]);
  });

  it("L1 取位後為 0 的負值不算虧（不寫「虧 0 元」）；全部缺值時標題退回區塊名", () => {
    const tiny = channelConclusion(withChannelCM(golden, { MARKETPLACE: { current: "-0.30" } }));
    expect(tiny.worst).toBeNull();
    expect(tiny.best).toBe("DTC");
    expect(tiny.rows.find(row => row.channel === "MARKETPLACE")!.turned).toBe("negative");

    const none = channelConclusion(withChannelCM(golden, { DTC: { current: null }, MARKETPLACE: { current: null } }));
    expect(none).toMatchObject({ worst: null, best: null, title: labels.overview.sections.channelMix });
    expect(none.rows.map(row => row.turned)).toEqual([null, null]);
  });

  it("單一通路也用同一套規則", () => {
    const snap = structuredClone(golden);
    snap.report.scope.channels = ["MARKETPLACE"];
    expect(channelConclusion(snap).title).toBe(fill(channelCopy.title.negative, { channel: "MARKETPLACE", amount: formatHeadlineAmount("-15.00") }));
    snap.report.scope.channels = ["DTC"];
    expect(channelConclusion(snap).title).toBe(fill(channelCopy.title.best, { channel: "DTC", amount: formatAmountL1(golden.report.current.channels.DTC.metrics.contribution_after_marketing.value) }));
  });
});
