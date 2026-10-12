import { describe, expect, it } from "vitest";
import { COVERAGE_FILES, COVERAGE_RANGE_FIELD, COVERAGE_TIMELINE_VERSION, coverageTimeline, mergeDates, type CoverageTimeline } from "@/application/chart-coverage";
import type { EventSet } from "@/application/events";
import { createSnapshot, hashInput } from "@/application/workspace";
import type { Dataset, DatasetInput, ValidationIssue } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput, synthetic4ChannelOverlapInput } from "./helpers/synthetic-4-channel";
import { YOY_CURRENT, YOY_EXPECTED_PERIOD, YOY_PREVIOUS, yoyInput } from "./helpers/yoy-dataset";

// V4-7a 代理 A：G20 涵蓋時間軸的 B 級整理函式 coverageTimeline（coverage-timeline-v1；PRD §4.3 G20、§6.4；CHART_CATALOG G20、§9.2；D-V4-15、D-V4-40＝A）。
// 手算 golden（缺列區段＝validation.ts appendMissingDays 的逐日問題依檔 × 通路合併）：
// - fixtures/errors/missing_ad_day：涵蓋 8/01–8/02、2 通路；缺 2026-08-02 MARKETPLACE 的廣告列 → 廣告 × MARKETPLACE 一段 1 天（標題用單日模板）。
// - 4 通路合成資料（tests/fixtures/synthetic-4-channel/README.md §3）：通路費用 LIVE 9/14–9/19（6 天，最長）、廣告 LIVE 8/30–9/02（4 天，跨月）與 9/22（1 天）；
//   問題共 11 筆（通路費用 6、廣告 5）。上期 8/21–9/06、本期 9/07–9/23；軸＝8/21–9/23（D-V4-40＝A：上期起日到涵蓋訖日，最早的缺列 8/30 不比上期早，不延伸）。
//   涵蓋起日 8/20 銷售沒有任何列，但在軸外（兩期之外），所以軸上的銷售軌沒有無列（README §5 的「8/20 無列」寫在 D-V4-40 拍板前）。
// - golden、示範資料：三份檔案都完整，沒有缺列區段。
// - D-V4-53＝B（使用者 2026-10-12）：去年同期那一行出現時，落在去年同期期間內的缺列日子不延伸軸；期間外、比上期起日早的照 D-V4-40＝A 延伸。
//   yoyInput（tests/helpers/yoy-dataset.ts）：涵蓋 2025-07-01–2026-08-23、上期 2026-06-01–07-12、本期 2026-07-13–08-23、去年同期 2025-07-13–08-23。

const datasetOf = (input: DatasetInput): Dataset => {
  const result = validateDataset(input);
  expect(result.dataset, JSON.stringify(result.issues.slice(0, 3))).not.toBeNull();
  return result.dataset!;
};
const missingIssues = (dataset: Dataset) => dataset.issues.filter(issue => (issue.reason_code === "MISSING_CHANNEL_COST_DAY" || issue.reason_code === "MISSING_AD_DAY") && issue.date !== undefined);
/** golden：每個檔 × 通路的缺列區段天數加總＝該檔 × 通路的缺列問題筆數；軌右端＝軸上的缺列日子數（D-V4-53＝B：軸起日之前的不算）。 */
function expectDaysEqualIssues(timeline: CoverageTimeline, dataset: Dataset) {
  const issues = missingIssues(dataset);
  const pairs = new Set(issues.map(issue => `${issue.file}|${issue.channel}`));
  for (const pair of pairs) {
    const [file, channel] = pair.split("|");
    const days = timeline.segments.filter(segment => segment.file === file && segment.channel === channel).reduce((sum, segment) => sum + segment.days, 0);
    expect(days, pair).toBe(issues.filter(issue => issue.file === file && issue.channel === channel).length);
  }
  expect(timeline.segments.every(segment => pairs.has(`${segment.file}|${segment.channel}`))).toBe(true);
  // 軌右端的天數＝該檔軸上任一通路缺列的日期數（同一天多個通路只算 1 天；審查修正）。
  for (const track of timeline.tracks.filter(item => item.key !== "sales")) {
    expect(track.missingDays, track.key).toBe(new Set(issues.filter(issue => issue.file === track.file && issue.date! >= timeline.axis.start).map(issue => issue.date)).size);
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
    // 審查 R1-F1：涵蓋起日 8/20 銷售沒有任何列（README §5），在軸外，另給 noRowsBeforeAxis（呼叫端寫在資料表後的說明）。
    expect(timeline.noRowsBeforeAxis).toEqual([{ start: "2026-08-20", end: "2026-08-20", days: 1 }]);
    expect(dataset.sales.some(row => row.date === "2026-08-20")).toBe(false);
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
      // 軸起日＝涵蓋起日：沒有軸外的日子。
      expect(timeline.noRowsBeforeAxis, name).toEqual([]);
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

  it("同一檔不同通路的缺列日期重疊（記憶體合成資料，D-V4-51（b））：區段照樣一個檔 × 通路一段（資料表的列），合成框是呈現層的事；標題仍取最長區段", () => {
    const dataset = datasetOf(synthetic4ChannelOverlapInput());
    const timeline = coverageTimeline(dataset);
    expect(simple(timeline).map(({ key, channel, start, end, days }) => [key, channel, start, end, days])).toEqual([
      ["costs", "DTC", "2026-09-16", "2026-09-17", 2], ["costs", "LIVE", "2026-09-14", "2026-09-19", 6],
      ["ads", "LIVE", "2026-08-30", "2026-09-02", 4], ["ads", "LIVE", "2026-09-22", "2026-09-22", 1], ["ads", "SOCIAL", "2026-09-01", "2026-09-04", 4], ["ads", "SOCIAL", "2026-09-23", "2026-09-23", 1],
    ]);
    expect(missingIssues(dataset)).toHaveLength(18);
    expectDaysEqualIssues(timeline, dataset);
    // 右端：通路費用 9/14–9/19 共 6 天（DTC 的 2 天在其中）；廣告 8/30–9/04、9/22、9/23 共 8 天。
    expect(timeline.tracks.map(track => track.missingDays)).toEqual([0, 6, 8]);
    expect(timeline.longest).toMatchObject({ key: "costs", channel: "LIVE", start: "2026-09-14", days: 6 });
    expect(timeline.axis).toEqual({ start: "2026-08-21", end: "2026-09-23", days: 34 });
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
    // 軸外的銷售無列（審查 R1-F1）：軸從 8/30 起時，8/20 無列（其餘 8/21–8/29 都有列）；軸退到涵蓋起日 8/20 時 8/20 在軸上（銷售軌的無列），軸外沒有日子。
    expect(later.noRowsBeforeAxis).toEqual([{ start: "2026-08-20", end: "2026-08-20", days: 1 }]);
    expect(earlier.noRowsBeforeAxis).toEqual([]);
    expect(earlier.tracks[0].noRows).toEqual([{ start: "2026-08-20", end: "2026-08-20", days: 1 }]);
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

  it("去年同期裡有缺列日（D-V4-53＝B）：缺列天數＝有任一檔任一通路缺列的日子；去年同期內的缺列不延伸軸（軸＝上期起日 6/01 到涵蓋訖日），這些區段另給 yoyBeforeAxis", async () => {
    const input = yoyInput({ missingCostDates: ["2025-07-20", "2025-07-21", "2026-07-01"] });
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(snapshot.yoy?.status).toBe("ready");
    const timeline = coverageTimeline(dataset, null, snapshot.yoy);
    expect(timeline.yoy).toEqual({ ...YOY_EXPECTED_PERIOD, days: 42, missingDays: 2, noRowDays: 0 });
    // 2025-07-20、07-21 在去年同期（2025-07-13–08-23）內：不延伸；2026-07-01 在上期（2026-06-01–07-12）內，本來就在軸上。
    expect(timeline.axis).toEqual({ start: YOY_PREVIOUS.start, end: YOY_CURRENT.end, days: 84 });
    expect(timeline.noRowsBeforeAxis).toEqual([]);
    // 兩份檔 × 兩個通路 × 3 天＝12 筆問題，每檔 × 通路兩段（7/20–7/21、7/01）；資料表照列全部 8 段（區段不因軸而變）。
    expect(missingIssues(dataset)).toHaveLength(12);
    expectDaysEqualIssues(timeline, dataset);
    expect(timeline.segments.map(segment => [segment.key, segment.channel, segment.start, segment.days])).toEqual([
      ["costs", "DTC", "2025-07-20", 2], ["costs", "DTC", "2026-07-01", 1], ["costs", "MARKETPLACE", "2025-07-20", 2], ["costs", "MARKETPLACE", "2026-07-01", 1],
      ["ads", "DTC", "2025-07-20", 2], ["ads", "DTC", "2026-07-01", 1], ["ads", "MARKETPLACE", "2025-07-20", 2], ["ads", "MARKETPLACE", "2026-07-01", 1],
    ]);
    // 軸起日之前的區段：去年同期內的 4 段（每檔 × 通路的 7/20–7/21），依 segments 的順序。
    expect(timeline.yoyBeforeAxis.map(segment => [segment.key, segment.channel, segment.start])).toEqual([
      ["costs", "DTC", "2025-07-20"], ["costs", "MARKETPLACE", "2025-07-20"], ["ads", "DTC", "2025-07-20"], ["ads", "MARKETPLACE", "2025-07-20"],
    ]);
    expect(timeline.yoyBeforeAxis.every(segment => segment.start >= YOY_EXPECTED_PERIOD.start && segment.end <= YOY_EXPECTED_PERIOD.end)).toBe(true);
    // 右端只算軸上的日子：每檔 1 天（2026-07-01；兩個通路同一天缺只算 1 天），去年同期的 2 天在圖上方那一行。
    expect(timeline.tracks.map(track => track.missingDays)).toEqual([0, 1, 1]);
    // 標題取軸上的最長區段（2026-07-01 的 1 天，同長依檔案、起日、通路順序取前者），不是軸外 2 天的那段。
    expect(timeline.longest).toMatchObject({ key: "costs", channel: "DTC", start: "2026-07-01", days: 1 });
    expect(timeline.version).toBe("coverage-timeline-v1");
  });

  it("D-V4-53＝B：沒有去年同期那一行（yoy 不給、不可用、與上期相同）時照 D-V4-40＝A，最早的缺列在上期之前就延伸到它；yoyBeforeAxis 為空", async () => {
    const input = yoyInput({ missingCostDates: ["2025-07-20", "2025-07-21", "2026-07-01"] });
    const dataset = datasetOf(input);
    for (const timeline of [coverageTimeline(dataset), coverageTimeline(dataset, null, { status: "unavailable", reason: "x" })]) {
      expect(timeline.yoy).toBeNull();
      expect(timeline.axis.start).toBe("2025-07-20");
      expect(timeline.yoyBeforeAxis).toEqual([]);
      expectDaysEqualIssues(timeline, dataset);
      // 每檔右端：3 個日期（兩個通路同一天缺各只算 1 天），不是 6 筆問題。
      expect(timeline.tracks.map(track => track.missingDays)).toEqual([0, 3, 3]);
      expect(timeline.longest).toMatchObject({ key: "costs", channel: "DTC", start: "2025-07-20", days: 2 });
    }
    // 套用了去年同期快捷（上期＝去年同期）：沒有那一行，軸從上期（＝去年同期）起日開始，7/20–7/21 在軸上。
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const same = coverageTimeline(dataset, null, snapshot.yoy, { previous: { ...YOY_EXPECTED_PERIOD }, current: { ...YOY_CURRENT } });
    expect(same.yoy).toBeNull();
    expect(same.axis.start).toBe(YOY_EXPECTED_PERIOD.start);
    expect(same.yoyBeforeAxis).toEqual([]);
  });

  it("D-V4-53＝B：去年同期期間外、比上期起日早的缺列照 D-V4-40＝A 延伸（在去年同期之前：整個去年同期都在軸上，其中的缺列照畫；在去年同期之後：去年同期內的不延伸）", async () => {
    const before = yoyInput({ missingCostDates: ["2025-07-05", "2025-07-20"] });
    const beforeSet = datasetOf(before);
    const early = coverageTimeline(beforeSet, null, (await createSnapshot(beforeSet, {}, await hashInput(before))).yoy);
    expect(early.yoy).toMatchObject({ missingDays: 1 });
    expect(early.axis.start).toBe("2025-07-05");
    expect(early.yoyBeforeAxis).toEqual([]);
    expect(early.tracks.map(track => track.missingDays)).toEqual([0, 2, 2]);
    expectDaysEqualIssues(early, beforeSet);

    const after = yoyInput({ missingCostDates: ["2025-07-20", "2025-09-10"] });
    const afterSet = datasetOf(after);
    const late = coverageTimeline(afterSet, null, (await createSnapshot(afterSet, {}, await hashInput(after))).yoy);
    expect(late.axis.start).toBe("2025-09-10");
    expect(late.yoyBeforeAxis.map(segment => [segment.key, segment.channel, segment.start])).toEqual([
      ["costs", "DTC", "2025-07-20"], ["costs", "MARKETPLACE", "2025-07-20"], ["ads", "DTC", "2025-07-20"], ["ads", "MARKETPLACE", "2025-07-20"],
    ]);
    expect(late.tracks.map(track => track.missingDays)).toEqual([0, 1, 1]);
    expect(late.longest).toMatchObject({ start: "2025-09-10" });
    expectDaysEqualIssues(late, afterSet);
  });

  it("D-V4-53＝B：一段缺列只有部分在去年同期內時只看期間外的日子——起日在去年同期之前的照起日延伸；起日在期間內、訖日在期間後的延伸到去年同期訖日的下一天（區段列入 yoyBeforeAxis，圖上從軸起日畫起）", async () => {
    const tail = yoyInput({ missingCostDates: ["2025-08-22", "2025-08-23", "2025-08-24", "2025-08-25"] });
    const tailSet = datasetOf(tail);
    const crossing = coverageTimeline(tailSet, null, (await createSnapshot(tailSet, {}, await hashInput(tail))).yoy);
    expect(crossing.yoy).toMatchObject({ end: "2025-08-23", missingDays: 2 });
    expect(crossing.axis.start).toBe("2025-08-24");
    expect(crossing.segments.map(segment => [segment.start, segment.end])).toEqual(Array(4).fill(["2025-08-22", "2025-08-25"]));
    expect(crossing.yoyBeforeAxis).toEqual(crossing.segments);
    // 右端只算軸上的 8/24、8/25；標題仍取這段（部分在軸上），天數照實 4 天。
    expect(crossing.tracks.map(track => track.missingDays)).toEqual([0, 2, 2]);
    expect(crossing.longest).toMatchObject({ key: "costs", channel: "DTC", start: "2025-08-22", days: 4 });
    expectDaysEqualIssues(crossing, tailSet);

    const head = yoyInput({ missingCostDates: ["2025-07-11", "2025-07-12", "2025-07-13", "2025-07-14"] });
    const headSet = datasetOf(head);
    const leading = coverageTimeline(headSet, null, (await createSnapshot(headSet, {}, await hashInput(head))).yoy);
    expect(leading.yoy).toMatchObject({ start: "2025-07-13", missingDays: 2 });
    expect(leading.axis.start).toBe("2025-07-11");
    expect(leading.yoyBeforeAxis).toEqual([]);
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
