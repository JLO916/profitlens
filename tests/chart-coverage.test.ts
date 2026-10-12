import { describe, expect, it } from "vitest";
import { COVERAGE_FILES, COVERAGE_RANGE_FIELD, COVERAGE_TIMELINE_VERSION, coverageTimeline, mergeDates, type CoverageTimeline } from "@/application/chart-coverage";
import type { EventSet } from "@/application/events";
import { createSnapshot, hashInput } from "@/application/workspace";
import type { Dataset, DatasetInput, ValidationIssue } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { YOY_CURRENT, YOY_EXPECTED_PERIOD, YOY_PREVIOUS, yoyInput } from "./helpers/yoy-dataset";

// V4-7a 代理 A：G20 涵蓋時間軸的 B 級整理函式 coverageTimeline（coverage-timeline-v1；PRD §4.3 G20、§6.4；CHART_CATALOG G20、§9.2；D-V4-15、D-V4-40＝A）。
// 手算 golden（缺列區段＝validation.ts appendMissingDays 的逐日問題依檔 × 通路合併）：
// - fixtures/errors/missing_ad_day：涵蓋 8/01–8/02、2 通路；缺 2026-08-02 MARKETPLACE 的廣告列 → 廣告 × MARKETPLACE 一段 1 天（標題用單日模板）。
// - 4 通路合成資料（tests/fixtures/synthetic-4-channel/README.md §3）：通路費用 LIVE 9/14–9/19（6 天，最長）、廣告 LIVE 8/30–9/02（4 天，跨月）與 9/22（1 天）；
//   問題共 11 筆（通路費用 6、廣告 5）。上期 8/21–9/06、本期 9/07–9/23；軸＝8/21–9/23（D-V4-40＝A：上期起日到涵蓋訖日，最早的缺列 8/30 不比上期早，不延伸）。
//   涵蓋起日 8/20 銷售沒有任何列，但在軸外（兩期之外），所以軸上的銷售軌沒有無列（README §5 的「8/20 無列」寫在 D-V4-40 拍板前）。
// - golden、示範資料：三份檔案都完整，沒有缺列區段。

const datasetOf = (input: DatasetInput): Dataset => {
  const result = validateDataset(input);
  expect(result.dataset, JSON.stringify(result.issues.slice(0, 3))).not.toBeNull();
  return result.dataset!;
};
const missingIssues = (dataset: Dataset) => dataset.issues.filter(issue => (issue.reason_code === "MISSING_CHANNEL_COST_DAY" || issue.reason_code === "MISSING_AD_DAY") && issue.date !== undefined);
/** golden：每個檔 × 通路的缺列區段天數加總＝該檔 × 通路的缺列問題筆數。 */
function expectDaysEqualIssues(timeline: CoverageTimeline, dataset: Dataset) {
  const issues = missingIssues(dataset);
  const pairs = new Set(issues.map(issue => `${issue.file}|${issue.channel}`));
  for (const pair of pairs) {
    const [file, channel] = pair.split("|");
    const days = timeline.segments.filter(segment => segment.file === file && segment.channel === channel).reduce((sum, segment) => sum + segment.days, 0);
    expect(days, pair).toBe(issues.filter(issue => issue.file === file && issue.channel === channel).length);
  }
  expect(timeline.segments.every(segment => pairs.has(`${segment.file}|${segment.channel}`))).toBe(true);
  // 軌右端的天數＝該檔任一通路缺列的日期數（同一天多個通路只算 1 天；審查修正）。
  for (const track of timeline.tracks.filter(item => item.key !== "sales")) {
    expect(track.missingDays, track.key).toBe(new Set(issues.filter(issue => issue.file === track.file).map(issue => issue.date)).size);
  }
}
const simple = (timeline: CoverageTimeline) => timeline.segments.map(({ key, channel, start, end, days, reason }) => ({ key, channel, start, end, days, reason }));

describe("coverageTimeline：缺列區段（缺列天數＝缺列問題筆數）", () => {
  it("missing_ad_day：廣告 × MARKETPLACE 一段 1 天（8/02）；最長區段就是它；軸 8/01–8/02（上期起日到涵蓋訖日）", () => {
    const dataset = datasetOf(fixture("errors/missing_ad_day"));
    const timeline = coverageTimeline(dataset);
    expect(timeline.version).toBe(COVERAGE_TIMELINE_VERSION);
    expect(COVERAGE_TIMELINE_VERSION).toBe("coverage-timeline-v1");
    expect(simple(timeline)).toEqual([{ key: "ads", channel: "MARKETPLACE", start: "2026-08-02", end: "2026-08-02", days: 1, reason: "MISSING_AD_DAY" }]);
    expect(timeline.segments[0].file).toBe("ad_spend_daily.csv");
    expect(timeline.longest).toEqual(timeline.segments[0]);
    expect(timeline.fallback).toBe(false);
    expect(timeline.rangeIssues).toEqual([]);
    expect(timeline.axis).toEqual({ start: "2026-08-01", end: "2026-08-02", days: 2 });
    expect(timeline.coverage).toEqual({ start: "2026-08-01", end: "2026-08-02", days: 2 });
    expect(timeline.dataAsOf).toBe("2026-08-03");
    expect(timeline.channels).toEqual(["DTC", "MARKETPLACE"]);
    expectDaysEqualIssues(timeline, dataset);
    const [sales, costs, ads] = timeline.tracks;
    expect(timeline.tracks.map(track => track.key)).toEqual(["sales", "costs", "ads"]);
    expect(sales.rows).toEqual([{ start: "2026-08-01", end: "2026-08-02", days: 2 }]);
    expect(sales.noRows).toEqual([]);
    expect(costs.rows).toEqual([{ start: "2026-08-01", end: "2026-08-02", days: 2 }]);
    expect(costs.missingDays).toBe(0);
    // 廣告軌的有列＝那天沒有任何通路缺列：8/02 MARKETPLACE 缺，所以只有 8/01。
    expect(ads.rows).toEqual([{ start: "2026-08-01", end: "2026-08-01", days: 1 }]);
    expect(ads.missingDays).toBe(1);
  });

  it("4 通路合成資料：通路費用 LIVE 9/14–9/19（6 天）、廣告 LIVE 8/30–9/02（4 天，跨月合併）與 9/22（1 天）；最長＝通路費用那段", async () => {
    const input = synthetic4ChannelInput();
    const dataset = datasetOf(input);
    const timeline = coverageTimeline(dataset);
    expect(simple(timeline)).toEqual([
      { key: "costs", channel: "LIVE", start: "2026-09-14", end: "2026-09-19", days: 6, reason: "MISSING_CHANNEL_COST_DAY" },
      { key: "ads", channel: "LIVE", start: "2026-08-30", end: "2026-09-02", days: 4, reason: "MISSING_AD_DAY" },
      { key: "ads", channel: "LIVE", start: "2026-09-22", end: "2026-09-22", days: 1, reason: "MISSING_AD_DAY" },
    ]);
    expect(missingIssues(dataset)).toHaveLength(11);
    expectDaysEqualIssues(timeline, dataset);
    expect(timeline.longest).toMatchObject({ key: "costs", channel: "LIVE", start: "2026-09-14", days: 6 });
    expect(timeline.tracks.map(track => [track.key, track.missingDays])).toEqual([["sales", 0], ["costs", 6], ["ads", 5]]);
    // D-V4-40＝A：軸＝上期起日 8/21 到涵蓋訖日 9/23（34 天）；涵蓋起日 8/20 在軸外。
    expect(timeline.axis).toEqual({ start: "2026-08-21", end: "2026-09-23", days: 34 });
    expect(timeline.previous).toEqual({ start: "2026-08-21", end: "2026-09-06" });
    expect(timeline.current).toEqual({ start: "2026-09-07", end: "2026-09-23" });
    const [sales, costs, ads] = timeline.tracks;
    expect(sales.rows).toEqual([{ start: "2026-08-21", end: "2026-09-23", days: 34 }]);
    expect(sales.noRows).toEqual([]);
    expect(costs.rows).toEqual([{ start: "2026-08-21", end: "2026-09-13", days: 24 }, { start: "2026-09-20", end: "2026-09-23", days: 4 }]);
    expect(ads.rows).toEqual([{ start: "2026-08-21", end: "2026-08-29", days: 9 }, { start: "2026-09-03", end: "2026-09-21", days: 19 }, { start: "2026-09-23", end: "2026-09-23", days: 1 }]);
    // 合成資料沒有 events.csv、沒有去年同期。
    expect(timeline.events).toEqual([]);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(snapshot.yoy?.status).toBe("unavailable");
    expect(coverageTimeline(dataset, null, snapshot.yoy).yoy).toBeNull();
  });

  it("golden 與示範資料沒有缺列區段；軸＝上期起日到涵蓋訖日；銷售每天都有列", () => {
    for (const [name, axis] of [["golden", { start: "2026-08-01", end: "2026-08-02", days: 2 }], ["demo", { start: "2026-06-01", end: "2026-08-23", days: 84 }]] as const) {
      const dataset = datasetOf(fixture(name));
      const timeline = coverageTimeline(dataset);
      expect(timeline.segments, name).toEqual([]);
      expect(timeline.longest, name).toBeNull();
      expect(timeline.fallback, name).toBe(false);
      expect(timeline.axis, name).toEqual(axis);
      for (const track of timeline.tracks) {
        expect(track.rows, `${name} ${track.key}`).toEqual([axis]);
        expect(track.noRows).toEqual([]);
        expect(track.missingDays + track.noRowDays).toBe(0);
      }
    }
  });

  it("refund_only、zero_ad：沒有缺列（明填 0 的廣告列不是缺列）", () => {
    for (const name of ["refund_only", "zero_ad"]) {
      const timeline = coverageTimeline(datasetOf(fixture(name)));
      expect(timeline.segments, name).toEqual([]);
      expect(timeline.tracks.find(track => track.key === "ads")!.rows, name).toHaveLength(1);
    }
  });
});

describe("mergeDates：連續日期合併", () => {
  it("亂序、重複的日期合併成含頭含尾的區段；中間斷一天就分段", () => {
    expect(mergeDates(["2026-08-03", "2026-08-01", "2026-08-02", "2026-08-05", "2026-08-02"])).toEqual([
      { start: "2026-08-01", end: "2026-08-03", days: 3 },
      { start: "2026-08-05", end: "2026-08-05", days: 1 },
    ]);
    expect(mergeDates([])).toEqual([]);
  });

  it("跨月、跨年、閏年 2/29 照樣相連", () => {
    expect(mergeDates(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"])).toEqual([{ start: "2026-08-30", end: "2026-09-02", days: 4 }]);
    expect(mergeDates(["2025-12-31", "2026-01-01"])).toEqual([{ start: "2025-12-31", end: "2026-01-01", days: 2 }]);
    expect(mergeDates(["2028-02-28", "2028-02-29", "2028-03-01"])).toEqual([{ start: "2028-02-28", end: "2028-03-01", days: 3 }]);
    expect(mergeDates(["2026-02-28", "2026-03-01"])).toEqual([{ start: "2026-02-28", end: "2026-03-01", days: 2 }]);
  });

  it("同一檔兩個通路同一天都缺：各自一段（通路依 manifest.channels 的順序）", () => {
    const dataset = datasetOf(fixture("golden"));
    const day = (channel: string, date: string): ValidationIssue => ({ file: "channel_costs_daily.csv", line: null, date, channel, field: "$row", severity: "partial", reason_code: "MISSING_CHANNEL_COST_DAY", message: "" });
    const timeline = coverageTimeline({ ...dataset, issues: [day("MARKETPLACE", "2026-08-02"), day("DTC", "2026-08-02"), day("DTC", "2026-08-01")] });
    expect(simple(timeline).map(({ channel, start, days }) => [channel, start, days])).toEqual([["DTC", "2026-08-01", 2], ["MARKETPLACE", "2026-08-02", 1]]);
    expect(timeline.longest).toMatchObject({ channel: "DTC", days: 2 });
    expect(timeline.tracks.find(track => track.key === "costs")!.rows).toEqual([]);
    // 右端天數是缺列的日子（8/01、8/02），不是問題筆數 3：8/02 兩個通路都缺只算 1 天（審查修正）。
    expect(timeline.tracks.find(track => track.key === "costs")!.missingDays).toBe(2);
    expect(timeline.segments.reduce((sum, segment) => sum + segment.days, 0)).toBe(3);
  });

  it("最長區段同長時依檔案順序（銷售、通路費用、廣告）、再依起日取前者", () => {
    const dataset = datasetOf(fixture("golden"));
    const issue = (file: "channel_costs_daily.csv" | "ad_spend_daily.csv", channel: string, date: string): ValidationIssue => ({ file, line: null, date, channel, field: "$row", severity: "partial", reason_code: file === "ad_spend_daily.csv" ? "MISSING_AD_DAY" : "MISSING_CHANNEL_COST_DAY", message: "" });
    const sameLength = coverageTimeline({ ...dataset, issues: [issue("ad_spend_daily.csv", "DTC", "2026-08-01"), issue("channel_costs_daily.csv", "MARKETPLACE", "2026-08-02")] });
    expect(sameLength.longest).toMatchObject({ key: "costs", channel: "MARKETPLACE" });
    const sameFile = coverageTimeline({ ...dataset, issues: [issue("ad_spend_daily.csv", "MARKETPLACE", "2026-08-01"), issue("ad_spend_daily.csv", "DTC", "2026-08-02")] });
    expect(sameFile.longest).toMatchObject({ key: "ads", channel: "MARKETPLACE", start: "2026-08-01" });
    expect(COVERAGE_FILES.map(spec => spec.key)).toEqual(["sales", "costs", "ads"]);
  });
});

describe("coverageTimeline：範圍級缺列退回文字、無列、軸的延伸", () => {
  it("範圍級問題（field $coverage、沒有日期）：fallback，不產生區段，通路費用與廣告不畫有列；去年同期不給", () => {
    const dataset = datasetOf(fixture("golden"));
    const range = (file: "channel_costs_daily.csv" | "ad_spend_daily.csv", reason_code: string): ValidationIssue => ({ file, line: null, field: COVERAGE_RANGE_FIELD, severity: "partial", reason_code, message: "" });
    const timeline = coverageTimeline({ ...dataset, issues: [range("channel_costs_daily.csv", "MISSING_CHANNEL_COST_DAY"), range("ad_spend_daily.csv", "MISSING_AD_DAY")] });
    expect(COVERAGE_RANGE_FIELD).toBe("$coverage");
    expect(timeline.fallback).toBe(true);
    expect(timeline.rangeIssues).toEqual([{ key: "costs", file: "channel_costs_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" }, { key: "ads", file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" }]);
    expect(timeline.segments).toEqual([]);
    expect(timeline.longest).toBeNull();
    expect(timeline.tracks.filter(track => track.key !== "sales").map(track => [track.rows, track.missing, track.missingDays])).toEqual([[[], [], 0], [[], [], 0]]);
    // 銷售列本身仍是已知的事實。
    expect(timeline.tracks[0].rows).toHaveLength(1);
    expect(timeline.yoy).toBeNull();
  });

  it("逐日問題與範圍級問題同時存在時（不會由 validation 產生）仍以範圍級退回：不畫任何區段", () => {
    const dataset = datasetOf(fixture("errors/missing_ad_day"));
    const timeline = coverageTimeline({ ...dataset, issues: [...dataset.issues, { file: "ad_spend_daily.csv", line: null, field: COVERAGE_RANGE_FIELD, severity: "partial", reason_code: "MISSING_AD_DAY", message: "" }] });
    expect(timeline.fallback).toBe(true);
    expect(timeline.segments).toEqual([]);
  });

  it("銷售在軸上沒有任何列的日子是「無列」（另成區段，不算缺列、不當作零銷售）；兩期內的無列會在軸上", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const sales = dataset.sales.filter(row => row.date !== "2026-09-10" && row.date !== "2026-09-11" && row.date !== "2026-08-25");
    const timeline = coverageTimeline({ ...dataset, sales });
    const track = timeline.tracks[0];
    expect(track.noRows).toEqual([{ start: "2026-08-25", end: "2026-08-25", days: 1 }, { start: "2026-09-10", end: "2026-09-11", days: 2 }]);
    expect(track.noRowDays).toBe(3);
    expect(track.rows).toEqual([{ start: "2026-08-21", end: "2026-08-24", days: 4 }, { start: "2026-08-26", end: "2026-09-09", days: 15 }, { start: "2026-09-12", end: "2026-09-23", days: 12 }]);
    expect(track.missing).toEqual([]);
    expect(track.missingDays).toBe(0);
    // 銷售無列不是缺列：缺列區段與天數不變。
    expect(timeline.segments).toHaveLength(3);
    expect(timeline.tracks.map(item => item.missingDays)).toEqual([0, 6, 5]);
  });

  it("D-V4-40＝A：最早的缺列區段比上期起日早時，軸往前延伸到它（不早於涵蓋起日）；目前套用的兩期由 periods 給", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const later = coverageTimeline(dataset, null, null, { previous: { start: "2026-09-01", end: "2026-09-12" }, current: { start: "2026-09-13", end: "2026-09-23" } });
    expect(later.axis).toEqual({ start: "2026-08-30", end: "2026-09-23", days: 25 });
    expect(later.previous).toEqual({ start: "2026-09-01", end: "2026-09-12" });
    const earlier = coverageTimeline(dataset, null, null, { previous: { start: "2026-08-10", end: "2026-08-20" }, current: { start: "2026-09-13", end: "2026-09-23" } });
    expect(earlier.axis.start).toBe("2026-08-20");
    // 軸外的日子不進有列區段：通路費用軌從軸起日開始。
    expect(later.tracks[1].rows[0].start).toBe("2026-08-30");
  });

  it("檔期：只留與軸重疊的列，依起日、行號排序（原樣保留起訖、名稱、行號）", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const events: EventSet = { filename: "events.csv", rows: [
      { start: "2026-09-18", end: "2026-09-20", label: "秋季檔期二", line: 3 },
      { start: "2026-08-01", end: "2026-08-10", label: "軸外", line: 4 },
      { start: "2026-08-15", end: "2026-08-22", label: "跨軸起日", line: 5 },
      { start: "2026-09-11", end: "2026-09-13", label: "秋季檔期一", line: 2 },
    ] };
    const timeline = coverageTimeline(dataset, events);
    expect(timeline.events.map(event => [event.start, event.end, event.line])).toEqual([["2026-08-15", "2026-08-22", 5], ["2026-09-11", "2026-09-13", 2], ["2026-09-18", "2026-09-20", 3]]);
    expect(coverageTimeline(dataset, { filename: null, rows: [] }).events).toEqual([]);
  });
});

describe("coverageTimeline：去年同期（D-V4-40＝A：不畫在軸上，只給期間與天數）", () => {
  it("去年同期可用而且三份檔案都有列：期間 2025-07-13–2025-08-23（42 天）、缺列 0 天、無列 0 天；軸不受影響", async () => {
    const input = yoyInput();
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(snapshot.yoy?.status).toBe("ready");
    const timeline = coverageTimeline(dataset, null, snapshot.yoy, { previous: snapshot.report.scope.previous_period, current: snapshot.report.scope.current_period });
    expect(timeline.yoy).toEqual({ ...YOY_EXPECTED_PERIOD, days: 42, missingDays: 0, noRowDays: 0 });
    expect(timeline.axis).toEqual({ start: YOY_PREVIOUS.start, end: YOY_CURRENT.end, days: 84 });
  });

  it("去年同期裡有缺列日：缺列天數＝有任一檔任一通路缺列的日子；最早的缺列在上期之前，軸照 D-V4-40＝A 延伸到它", async () => {
    const input = yoyInput({ missingCostDates: ["2025-07-20", "2025-07-21", "2026-07-01"] });
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const timeline = coverageTimeline(dataset, null, snapshot.yoy);
    expect(timeline.yoy).toEqual({ ...YOY_EXPECTED_PERIOD, days: 42, missingDays: 2, noRowDays: 0 });
    expect(timeline.axis.start).toBe("2025-07-20");
    // 兩份檔 × 兩個通路 × 3 天＝12 筆問題，每檔 × 通路兩段（7/20–7/21、7/01）。
    expect(missingIssues(dataset)).toHaveLength(12);
    expectDaysEqualIssues(timeline, dataset);
    // 每檔右端：3 個日期（兩個通路同一天缺各只算 1 天），不是 6 筆問題。
    expect(timeline.tracks.map(track => track.missingDays)).toEqual([0, 3, 3]);
    expect(timeline.segments.map(segment => [segment.key, segment.channel, segment.start, segment.days])).toEqual([
      ["costs", "DTC", "2025-07-20", 2], ["costs", "DTC", "2026-07-01", 1], ["costs", "MARKETPLACE", "2025-07-20", 2], ["costs", "MARKETPLACE", "2026-07-01", 1],
      ["ads", "DTC", "2025-07-20", 2], ["ads", "DTC", "2026-07-01", 1], ["ads", "MARKETPLACE", "2025-07-20", 2], ["ads", "MARKETPLACE", "2026-07-01", 1],
    ]);
  });

  it("去年同期與上期相同（使用者套用了去年同期快捷）時不另寫一行；去年同期不可用時為 null", async () => {
    const input = yoyInput();
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(coverageTimeline(dataset, null, snapshot.yoy, { previous: { ...YOY_EXPECTED_PERIOD }, current: { ...YOY_CURRENT } }).yoy).toBeNull();
    expect(coverageTimeline(dataset, null, { status: "unavailable", reason: "x" }).yoy).toBeNull();
    expect(coverageTimeline(dataset).yoy).toBeNull();
  });
});
