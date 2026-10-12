import { beforeAll, describe, expect, it } from "vitest";
import { meetingBreak, meetingSeries, MEETING_SERIES_VERSION } from "@/application/chart-meeting";
import { MAX_MEETING_HISTORY, type Meeting } from "@/application/meeting";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { DEMO_WEEKS, demoWeek, finalizedMeeting, g19History, meetingVariant } from "./helpers/meeting-history";

/*
 * V4-6 代理 A：meetingSeries（meeting-series-v1）的 golden（CHART_CATALOG G19「單元測試」欄、§9.2；PRD §4.4 G19、§6.4）。
 * - 斷段位置：資料集（dataset_hash）、通路集合、本期天數、比較方式各一例；原因分 dataset（資料集）、channels（只換通路，D-V4-49（b）＝C）與 period（天數或比較方式）；
 *   整月對比以月為單位，月份天數不同不斷開（D-V4-48（a）＝B）。
 * - 本期、資料集與通路集合都相同的重複會議只留結束時間最晚的一筆（D-V4-48（b）＝B），省略筆數另計；保留 < 2 筆回傳空；依會議日期、結束時間排序；最多 100 筆。
 * - 值逐字取自凍結的 agenda.kpis[].current（不重算、不轉 Number）。
 * 會議一律由 finalizeMeeting 結束（tests/helpers/meeting-history.ts）；finalize 做不出來的組合（另一份資料的雜湊、另一組通路）才以 meetingVariant 從真的會議複製後改範圍。
 */

let golden: Meeting;
const kpi = (meeting: Meeting, metric: "net_revenue" | "contribution_after_marketing") => meeting.agenda.kpis.find(row => row.metric === metric)!.current;
const OTHER_HASH = "f".repeat(64);
beforeAll(async () => {
  golden = await finalizedMeeting({ id: "rev-g", name: "十月例會", date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" });
});
/** golden 的本期是 8/2（1 天）；換本期時上期一併往前（validateMeeting 的上期迄日早於本期起日，這裡只測整理規則，不經 validate）。 */
const day = (date: string) => ({ start: date, end: date });

describe("meetingSeries 的版本、值與排序", () => {
  it("版本常數 meeting-series-v1；每點的兩個值逐字取自 agenda.kpis[].current（golden 本期淨營收 2470.00、扣廣告後貢獻 255.00），帶會議日期、名稱、資料本期與比較方式", () => {
    expect(MEETING_SERIES_VERSION).toBe("meeting-series-v1");
    const second = meetingVariant(golden, { id: "m2", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: day("2026-08-03"), net_revenue: "1999.99", contribution: "-12.34" });
    const series = meetingSeries([golden, second]);
    expect(series.version).toBe("meeting-series-v1");
    expect(kpi(golden, "net_revenue")).toBe("2470.00");
    expect(kpi(golden, "contribution_after_marketing")).toBe("255.00");
    expect(series.points).toEqual([
      { id: golden.id, date: "2026-10-03", name: "十月例會", net_revenue: "2470.00", contribution_after_marketing: "255.00", segment: 0, break: null, period: { start: "2026-08-02", end: "2026-08-02" }, comparison_mode: "same_days" },
      { id: "m2", date: "2026-10-10", name: "十月例會", net_revenue: "1999.99", contribution_after_marketing: "-12.34", segment: 0, break: null, period: { start: "2026-08-03", end: "2026-08-03" }, comparison_mode: "same_days" },
    ]);
    expect(series.omitted).toBe(0);
  });

  it("依會議日期、再依結束時間排序（輸入順序不影響）；日期與結束時間都相同時保留輸入順序；值為 null 時照樣是 null", () => {
    const a = meetingVariant(golden, { id: "a", date: "2026-10-01", finalized_at: "2026-10-05T06:00:00.000Z", current: day("2026-07-01") });
    const b = meetingVariant(golden, { id: "b", date: "2026-10-01", finalized_at: "2026-10-01T06:00:00.000Z", current: day("2026-07-02") });
    const c = meetingVariant(golden, { id: "c", date: "2026-09-30", finalized_at: "2026-10-09T06:00:00.000Z", current: day("2026-07-03"), contribution: null });
    const d = meetingVariant(golden, { id: "d", date: "2026-10-02", finalized_at: "2026-10-02T06:00:00.000Z", current: day("2026-07-04") });
    const e = meetingVariant(golden, { id: "e", date: "2026-10-02", finalized_at: "2026-10-02T06:00:00.000Z", current: day("2026-07-05") });
    expect(meetingSeries([a, e, b, d, c]).points.map(point => point.id)).toEqual(["c", "b", "a", "e", "d"]);
    expect(meetingSeries([d, e, a, b, c]).points.map(point => point.id)).toEqual(["c", "b", "a", "d", "e"]);
    expect(meetingSeries([a, c]).points[0].contribution_after_marketing).toBeNull();
  });
});

describe("meetingSeries 的斷段（資料集、通路集合、本期天數、比較方式各一例）", () => {
  it("資料集不同（dataset_hash）：第二點起新的一段，原因 dataset", () => {
    const other = meetingVariant(golden, { id: "x", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", dataset_hash: OTHER_HASH, current: day("2026-08-03") });
    const series = meetingSeries([golden, other]);
    expect(series.points.map(point => [point.segment, point.break])).toEqual([[0, null], [1, "dataset"]]);
    expect(meetingBreak(golden, other)).toBe("dataset");
  });

  it("通路集合不同（同一份資料）：原因 channels（D-V4-49（b）＝C）；只是順序不同不算", () => {
    const dtc = meetingVariant(golden, { id: "dtc", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", channels: ["DTC"], current: day("2026-08-03") });
    const reordered = meetingVariant(golden, { id: "re", date: "2026-10-17", finalized_at: "2026-10-17T06:00:00.000Z", channels: ["MARKETPLACE", "DTC"], current: day("2026-08-04") });
    expect(golden.source_fixed.channels).toEqual(["DTC", "MARKETPLACE"]);
    expect(meetingSeries([golden, dtc]).points.map(point => [point.segment, point.break])).toEqual([[0, null], [1, "channels"]]);
    expect(meetingBreak(golden, dtc)).toBe("channels");
    expect(meetingSeries([golden, reordered]).points.map(point => [point.segment, point.break])).toEqual([[0, null], [0, null]]);
    // 資料集與通路都不同時記 dataset（先比資料集）。
    const otherDtc = meetingVariant(golden, { id: "od", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", dataset_hash: OTHER_HASH, channels: ["DTC"], current: day("2026-08-03") });
    expect(meetingBreak(golden, otherDtc)).toBe("dataset");
  });

  it("整月對比（calendar_months）以月為單位：7 月 → 8 月 → 9 月 → 10 月（31、31、30、31 天）全部相連（D-V4-48（a）＝B）；非整月對比時天數不同仍斷開", () => {
    const month = (id: string, date: string, start: string, end: string) => meetingVariant(golden, { id, date, finalized_at: `${date}T06:00:00.000Z`, current: { start, end }, comparison_mode: "calendar_months" });
    const jul = month("jul", "2026-08-05", "2026-07-01", "2026-07-31"), aug = month("aug", "2026-09-05", "2026-08-01", "2026-08-31");
    const sep = month("sep", "2026-10-05", "2026-09-01", "2026-09-30"), oct = month("oct", "2026-11-05", "2026-10-01", "2026-10-31");
    expect(meetingSeries([jul, aug, sep, oct]).points.map(point => [point.id, point.segment, point.break])).toEqual([["jul", 0, null], ["aug", 0, null], ["sep", 0, null], ["oct", 0, null]]);
    expect(meetingBreak(aug, sep)).toBeNull();
    // 同樣 30 → 31 天，但比較方式是同天數：照樣斷開（原因 period）。
    const sameDays = (id: string, date: string, start: string, end: string) => meetingVariant(golden, { id, date, finalized_at: `${date}T06:00:00.000Z`, current: { start, end }, comparison_mode: "same_days" });
    expect(meetingBreak(sameDays("s9", "2026-10-05", "2026-09-01", "2026-09-30"), sameDays("s10", "2026-11-05", "2026-10-01", "2026-10-31"))).toBe("period");
  });

  it("本期天數不同（1 天 → 7 天）：原因 period；天數相同、日期不同的本期照樣相連", () => {
    const week = meetingVariant(golden, { id: "w", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: { start: "2026-08-03", end: "2026-08-09" } });
    const nextDay = meetingVariant(golden, { id: "n", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: day("2026-08-03") });
    expect(meetingSeries([golden, week]).points.map(point => [point.segment, point.break])).toEqual([[0, null], [1, "period"]]);
    expect(meetingSeries([golden, nextDay]).points.map(point => [point.segment, point.break])).toEqual([[0, null], [0, null]]);
  });

  it("比較方式不同（本期天數相同，同天數 → 完整月份）：原因 period", () => {
    const july = meetingVariant(golden, { id: "jul", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: { start: "2026-07-01", end: "2026-07-31" }, comparison_mode: "same_days" });
    const august = meetingVariant(golden, { id: "aug", date: "2026-10-17", finalized_at: "2026-10-17T06:00:00.000Z", current: { start: "2026-08-01", end: "2026-08-31" }, comparison_mode: "calendar_months" });
    expect(meetingSeries([july, august]).points.map(point => [point.segment, point.break])).toEqual([[0, null], [1, "period"]]);
  });

  it("資料集與期間都不同時記 dataset（先比資料集）；斷段後再回到同一範圍也是新的一段（段號只增不減）", () => {
    const other = meetingVariant(golden, { id: "x", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", dataset_hash: OTHER_HASH, current: { start: "2026-08-03", end: "2026-08-09" } });
    const back = meetingVariant(golden, { id: "back", date: "2026-10-17", finalized_at: "2026-10-17T06:00:00.000Z", current: day("2026-08-04") });
    expect(meetingSeries([golden, other, back]).points.map(point => [point.id, point.segment, point.break])).toEqual([[golden.id, 0, null], ["x", 1, "dataset"], ["back", 2, "dataset"]]);
  });

  it("真的會議（finalizeMeeting）：golden → 示範 42 天 → 示範三個連續週（7 天）→ 第三週重開一次：5 點 3 段，原因 dataset、period，重複的第三週只留較晚結束的一次", async () => {
    const history = await g19History();
    const series = meetingSeries(history);
    const [goldenMeeting, demo42, week1, week2, week3, week3Again] = history;
    expect(series.points.map(point => point.id)).toEqual([goldenMeeting.id, demo42.id, week1.id, week2.id, week3Again.id]);
    expect(series.points.map(point => [point.segment, point.break])).toEqual([[0, null], [1, "dataset"], [2, "period"], [2, null], [2, null]]);
    expect(series.omitted).toBe(1);
    expect(series.points.find(point => point.id === week3.id)).toBeUndefined();
    expect(series.points.map(point => point.period)).toEqual([{ start: "2026-08-02", end: "2026-08-02" }, { start: "2026-07-13", end: "2026-08-23" }, ...DEMO_WEEKS.map(week => week.current)]);
    // 值就是各次凍結的本期合計，也等於以同一份資料與範圍重算的快照本期值（手算對照：同一個 domain 計算）。
    for (const [point, meeting] of [[series.points[2], week1], [series.points[3], week2], [series.points[4], week3Again]] as const) {
      expect(point.net_revenue).toBe(kpi(meeting, "net_revenue"));
      expect(point.contribution_after_marketing).toBe(kpi(meeting, "contribution_after_marketing"));
    }
    const input = fixture("demo"), dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, demoWeek(DEMO_WEEKS[0].previous, DEMO_WEEKS[0].current), await hashInput(input));
    expect(series.points[2].net_revenue).toBe(snapshot.report.current.metrics.net_revenue.value);
    expect(series.points[2].contribution_after_marketing).toBe(snapshot.report.current.metrics.contribution_after_marketing.value);
  });
});

describe("meetingSeries 的去重、空結果與上限", () => {
  it("本期、資料集與通路都相同的重複會議只畫結束時間最晚的一筆（不看會議日期先後），省略筆數另計；結束時間也相同時取排序在後者", () => {
    const early = meetingVariant(golden, { id: "early", date: "2026-10-20", finalized_at: "2026-10-01T06:00:00.000Z" });
    const later = meetingVariant(golden, { id: "later", date: "2026-10-04", finalized_at: "2026-10-04T06:00:00.000Z" });
    const other = meetingVariant(golden, { id: "other", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: day("2026-08-03") });
    const series = meetingSeries([golden, early, later, other]);
    expect(series.points.map(point => point.id)).toEqual(["later", "other"]);
    expect(series.omitted).toBe(2);
    const tieA = meetingVariant(golden, { id: "tie-a", date: "2026-10-03", finalized_at: golden.finalized_at });
    expect(meetingSeries([tieA, golden, other]).points.map(point => point.id)).toEqual([golden.id, "other"]);
    expect(meetingSeries([golden, tieA, other]).points.map(point => point.id)).toEqual(["tie-a", "other"]);
  });

  it("範圍不同的同本期會議不是重複（D-V4-48（b）＝B）：同一週先開全通路、再開只看 DTC、再開另一份資料，三筆都保留、省略 0；通路只是順序不同仍是重複", () => {
    const dtcOnly = meetingVariant(golden, { id: "dtc-only", date: "2026-10-04", finalized_at: "2026-10-04T06:00:00.000Z", channels: ["DTC"] });
    const otherData = meetingVariant(golden, { id: "other-data", date: "2026-10-05", finalized_at: "2026-10-05T06:00:00.000Z", dataset_hash: OTHER_HASH });
    const series = meetingSeries([golden, dtcOnly, otherData]);
    expect(series.points.map(point => [point.id, point.segment, point.break])).toEqual([[golden.id, 0, null], ["dtc-only", 1, "channels"], ["other-data", 2, "dataset"]]);
    expect(series.omitted).toBe(0);
    const reordered = meetingVariant(golden, { id: "re", date: "2026-10-06", finalized_at: "2026-10-06T06:00:00.000Z", channels: ["MARKETPLACE", "DTC"] });
    const next = meetingVariant(golden, { id: "next", date: "2026-10-10", finalized_at: "2026-10-10T06:00:00.000Z", current: day("2026-08-03") });
    expect(meetingSeries([golden, reordered, next])).toMatchObject({ points: [{ id: "re" }, { id: "next" }], omitted: 1 });
  });

  it("保留的點 < 2 時回傳空的 points：沒有歷史、只有 1 次、2 次但本期相同（省略 1 次）", () => {
    expect(meetingSeries([])).toEqual({ version: "meeting-series-v1", points: [], omitted: 0 });
    expect(meetingSeries([golden])).toEqual({ version: "meeting-series-v1", points: [], omitted: 0 });
    const again = meetingVariant(golden, { id: "again", date: "2026-10-04", finalized_at: "2026-10-04T06:00:00.000Z" });
    expect(meetingSeries([golden, again])).toEqual({ version: "meeting-series-v1", points: [], omitted: 1 });
  });

  it(`最多 ${MAX_MEETING_HISTORY} 筆：超過時只留排序後最後 100 筆（最早的會議不畫）；不改輸入陣列與會議`, () => {
    const history = Array.from({ length: MAX_MEETING_HISTORY + 1 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
      return meetingVariant(golden, { id: `m${index}`, date, finalized_at: `${date}T06:00:00.000Z`, current: day(date) });
    });
    const before = JSON.stringify(history);
    const series = meetingSeries([...history].reverse());
    expect(series.points).toHaveLength(MAX_MEETING_HISTORY);
    expect(series.points[0].id).toBe("m1");
    expect(series.points.at(-1)!.id).toBe(`m${MAX_MEETING_HISTORY}`);
    expect(series.points.every(point => point.segment === 0)).toBe(true);
    expect(JSON.stringify(history)).toBe(before);
    expect(Object.isFrozen(golden)).toBe(true);
    expect(() => meetingSeries([golden, meetingVariant(golden, { id: "z", date: "2026-10-04", current: day("2026-08-03") })])).not.toThrow();
  });
});
