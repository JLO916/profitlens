import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { CUMULATIVE_DAILY_MAX_DAYS, CUMULATIVE_DAILY_VERSION, compareCumulative, cumulativeConclusion, cumulativeDaily, cumulativeSources, type CumulativeDaily, type CumulativePoint } from "@/application/chart-cumulative";
import { chartColors, chartHeights } from "@/application/chart-theme";
import { buildPnlTable, periodDailyMetrics, PNL_DAY_COLUMN_LIMIT, PNL_NO_DAILY_ROWS, PNL_ROWS } from "@/application/pnl-table";
import { formatAmountL1, formatAmountL3, formatEmpty, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { uniqueSources } from "@/domain/aggregation";
import { validateDataset } from "@/domain/validation";
import type { DatasetInput } from "@/domain/types";
import { CUMULATIVE_TABLE_TESTID, CUMULATIVE_TESTID, CumulativeSection, cumulativeDayEvidence, cumulativeEvidence, cumulativeRowLabel, cumulativeTableRows, type CumulativeTarget } from "@/components/overview/charts/cumulative-section";
import type { EvidenceSelection } from "@/components/evidence-drawer";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-10 代理 A：G8「兩期每日累計」的整理函式 cumulativeDaily（cumulative-daily-v1；PRD §4.2、§4.3、§6.4、§7.4；CHART_CATALOG G8；D-V4-22＝A）
 * 與由 pnl-table.ts 的 dayColumns 抽出的 periodDailyMetrics。期望值全部是手算常數（算式寫在旁邊），不由 domain 或 application 函式算出；實際值才呼叫被測函式。
 * - golden：兩期各 1 天，末日累計 570.00（上期）、255.00（本期）只是恆等式；
 * - 示範資料：兩期各 42 天，末日累計＝各期合計 1,868,626.68、1,269,792.73（verification/revamp-v3-V3-10-acceptance.md 備份還原矩陣列）；
 *   前 3 天以 Python Decimal 直接加總三份 CSV 手算（不經 domain）：本期 7/13 35,842.27、7/14 32,410.52、7/15 29,465.49；上期 6/01 50,882.01、6/02 47,286.06；
 * - 4 通路合成資料（tests/fixtures/synthetic-4-channel/README.md §2、§6）：逐日手算前 7 天與交叉日 d＝5，缺列日之後斷線。
 */

async function load(input: DatasetInput): Promise<WorkspaceSnapshot> {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  return createSnapshot(result.dataset!, {}, await hashInput(input));
}
let golden: WorkspaceSnapshot, demo: WorkspaceSnapshot, synthetic: WorkspaceSnapshot, refundOnly: WorkspaceSnapshot, zeroAd: WorkspaceSnapshot;
beforeAll(async () => {
  [golden, demo, synthetic, refundOnly, zeroAd] = await Promise.all([load(fixture("golden")), load(fixture("demo")), load(synthetic4ChannelInput()), load(fixture("refund_only")), load(fixture("zero_ad"))]);
});
const METRIC = "contribution_after_marketing" as const;
const values = (points: readonly CumulativePoint[], key: "daily" | "cumulative") => points.map(point => point[key].value);
/** 只改 report 的期間與日列（不改任何值）：兩期天數不同、超過 92 天、某天沒有日列等情境。 */
function withReport(snapshot: WorkspaceSnapshot, change: (report: WorkspaceSnapshot["report"]) => Partial<WorkspaceSnapshot["report"]>): WorkspaceSnapshot {
  return { ...snapshot, report: { ...snapshot.report, ...change(snapshot.report) } };
}

describe("V4-10 cumulativeDaily：版本與常數", () => {
  it("版本常數 cumulative-daily-v1；不畫的上限與管理損益表的日欄上限相同（92 天）", () => {
    expect(CUMULATIVE_DAILY_VERSION).toBe("cumulative-daily-v1");
    expect(CUMULATIVE_DAILY_MAX_DAYS).toBe(92);
    expect(CUMULATIVE_DAILY_MAX_DAYS).toBe(PNL_DAY_COLUMN_LIMIT);
    expect(cumulativeDaily(golden, METRIC).version).toBe("cumulative-daily-v1");
  });
});

describe("V4-10 periodDailyMetrics（由 dayColumns 抽出；buildPnlTable 輸出不變）", () => {
  it("periodDailyMetrics(report.current) 與 buildPnlTable(snapshot, \"day\") 的日欄逐格相同（golden、示範、合成、refund_only、zero_ad）", () => {
    for (const [name, snapshot] of [["golden", golden], ["demo", demo], ["synthetic", synthetic], ["refund_only", refundOnly], ["zero_ad", zeroAd]] as const) {
      const days = periodDailyMetrics(snapshot.report.current);
      const table = buildPnlTable(snapshot, "day");
      expect(days.map(day => day.date), name).toEqual(table.columns.map(column => column.id));
      expect(days.map(day => ({ id: day.date, granularity: "day", period: day.period, label: day.date, hasData: day.hasData })), name).toEqual(table.columns);
      for (const row of table.rows) {
        expect(row.cells, `${name} ${row.metric}`).toHaveLength(days.length);
        row.cells.forEach((cell, index) => {
          const day = days[index];
          expect(cell.metric, `${name} ${row.metric} ${day.date}`).toEqual(day.metrics ? day.metrics[row.metric] : { value: null, reason_codes: [PNL_NO_DAILY_ROWS] });
          expect(cell.period, `${name} ${row.metric} ${day.date}`).toEqual(day.period);
          expect(cell.sources, `${name} ${row.metric} ${day.date}`).toEqual(day.sources);
        });
      }
      expect(table.rows.map(row => row.metric), name).toEqual(PNL_ROWS.map(row => row.metric));
    }
  });

  it("也能用在上期（buildPnlTable 只有本期的日欄）：示範資料上期 42 天，6/01、6/02 的扣廣告後貢獻＝50,882.01、47,286.06（Python Decimal 直接加總 CSV）", () => {
    const days = periodDailyMetrics(demo.report.previous);
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-06-01");
    expect(days.at(-1)!.date).toBe("2026-07-12");
    expect(days.slice(0, 2).map(day => day.metrics?.contribution_after_marketing.value)).toEqual(["50882.01", "47286.06"]);
    expect(days.every(day => day.hasData)).toBe(true);
  });

  it("日列沒有那一天時 hasData＝false、metrics＝null、來源為空（不當成 0）", () => {
    const report = synthetic.report;
    const days = periodDailyMetrics({ period: report.current.period, daily: report.current.daily.filter(row => row.date !== "2026-09-09") });
    const missing = days.find(day => day.date === "2026-09-09")!;
    expect(missing).toEqual({ date: "2026-09-09", period: { start: "2026-09-09", end: "2026-09-09" }, hasData: false, metrics: null, sources: [] });
  });
});

describe("V4-10 cumulativeDaily：golden、refund_only、zero_ad（兩期各 1 天，末日累計只是恆等式）", () => {
  it("golden：上期 8/01 570.00、本期 8/02 255.00；當日＝累計；本期第 1 天起落後上期（d＝1）", () => {
    const result = cumulativeDaily(golden, METRIC);
    expect(result.drawable).toBe(true);
    expect([result.previous.days, result.current.days]).toEqual([1, 1]);
    expect(result.previous.points).toEqual([{ day: 1, date: "2026-08-01", daily: { value: "570.00", reason_codes: [] }, cumulative: { value: "570.00", reason_codes: [] }, sources: result.previous.points[0].sources }]);
    expect(result.current.points.map(point => [point.day, point.date, point.daily.value, point.cumulative.value])).toEqual([[1, "2026-08-02", "255.00", "255.00"]]);
    // 末日累計＝該期合計（golden 單日 255.00）。
    expect(result.current.end).toEqual({ value: "255.00", reason_codes: [] });
    expect(result.current.end!.value).toBe(golden.report.current.metrics.contribution_after_marketing.value);
    expect(result.previous.end!.value).toBe(golden.report.previous.metrics.contribution_after_marketing.value);
    expect([result.previous.breakDay, result.current.breakDay]).toEqual([null, null]);
    expect(result.comparison).toEqual({ standing: "behind", day: 1, comparableDays: 1 });
    const metric = metricDefinitions.contribution_after_marketing.label;
    expect(cumulativeConclusion(result, golden)).toEqual({ title: fill(labels.overview.chartsV4.cumulative.title.behind, { metric, amount: formatAmountL1("255.00"), d: 1 }), subtitle: fill(labels.overview.chartsV4.cumulative.subtitle, { metric }) });
  });

  it("refund_only：兩期都是 −60.00 → 與上期相同；zero_ad：870.00 → 705.00，第 1 天起落後", () => {
    const refund = cumulativeDaily(refundOnly, METRIC);
    expect([refund.previous.end!.value, refund.current.end!.value]).toEqual(["-60.00", "-60.00"]);
    expect(refund.comparison).toEqual({ standing: "even", day: null, comparableDays: 1 });
    expect(cumulativeConclusion(refund, refundOnly).title).toBe(fill(labels.overview.chartsV4.cumulative.title.even, { metric: metricDefinitions.contribution_after_marketing.label, amount: formatAmountL1("-60.00") }));
    const zero = cumulativeDaily(zeroAd, METRIC);
    expect([zero.previous.end!.value, zero.current.end!.value]).toEqual(["870.00", "705.00"]);
    expect(zero.comparison).toEqual({ standing: "behind", day: 1, comparableDays: 1 });
  });
});

describe("V4-10 cumulativeDaily：示範資料（兩期各 42 天）", () => {
  it("兩期末日累計各＝該期合計：本期 1,269,792.73、上期 1,868,626.68", () => {
    const result = cumulativeDaily(demo, METRIC);
    expect([result.previous.days, result.current.days]).toEqual([42, 42]);
    expect(result.current.end).toEqual({ value: "1269792.73", reason_codes: [] });
    expect(result.previous.end).toEqual({ value: "1868626.68", reason_codes: [] });
    expect(result.current.end!.value).toBe(demo.report.current.metrics.contribution_after_marketing.value);
    expect(result.previous.end!.value).toBe(demo.report.previous.metrics.contribution_after_marketing.value);
  });

  it("前 3 天手算：本期當日 35,842.27、32,410.52、29,465.49，累計 35,842.27、68,252.79、97,718.28；上期當日 50,882.01、47,286.06，累計 50,882.01、98,168.07", () => {
    const result = cumulativeDaily(demo, METRIC);
    expect(values(result.current.points.slice(0, 3), "daily")).toEqual(["35842.27", "32410.52", "29465.49"]);
    // 35,842.27 ＋ 32,410.52 ＝ 68,252.79；＋ 29,465.49 ＝ 97,718.28。
    expect(values(result.current.points.slice(0, 3), "cumulative")).toEqual(["35842.27", "68252.79", "97718.28"]);
    // 50,882.01 ＋ 47,286.06 ＝ 98,168.07。
    expect(values(result.previous.points.slice(0, 2), "cumulative")).toEqual(["50882.01", "98168.07"]);
    expect(result.current.points.map(point => point.day)).toEqual(Array.from({ length: 42 }, (_, index) => index + 1));
    expect(result.current.points[0].date).toBe("2026-07-13");
    expect(result.current.points.at(-1)!.date).toBe("2026-08-23");
  });

  it("交叉日：第 1 天本期 35,842.27 ＜ 上期 50,882.01 起一直落後，到第 42 天仍落後 → d＝1（標題「第 1 天起落後上期」，金額＝本期末日累計 L1）", () => {
    const result = cumulativeDaily(demo, METRIC);
    expect(result.comparison).toEqual({ standing: "behind", day: 1, comparableDays: 42 });
    const metric = metricDefinitions.contribution_after_marketing.label;
    expect(cumulativeConclusion(result, demo).title).toBe(fill(labels.overview.chartsV4.cumulative.title.behind, { metric, amount: formatAmountL1("1269792.73"), d: 1 }));
    expect(cumulativeConclusion(result, demo).title).toBe(`本期累計${metric} ${formatAmountL1("1269792.73")}，第 1 天起落後上期`);
  });
});

describe("V4-10 cumulativeDaily：4 通路合成資料（逐日手算、交叉日、缺列日之後斷線）", () => {
  /*
   * 全通路每日扣廣告後貢獻（README §2、§6）：
   *   本期 9/07–9/13：DTC 2,400＋LIVE 1,100＋MARKETPLACE 400＋SOCIAL 70＝3,970；9/08 MARKETPLACE 退款日 −200 → 3,370；
   *     9/11–9/13 MARKETPLACE 檔期 −1,300 → 2,270；9/14 LIVE 缺通路費用 → 資料待補（之後的累計都斷線）。
   *     累計：3,970、7,340、11,310、15,280、17,550、19,820、22,090（＝本期第 1 週 22,090）。
   *   上期 8/21–8/29：DTC 2,050＋LIVE 870（1,550 − 280 − 400）＋MARKETPLACE 610（2,450 − 1,140 − 700）＋SOCIAL 235（840 − 425 − 180）＝3,765；
   *     8/30 LIVE 缺廣告 → 資料待補。累計：3,765 × n（n ≤ 9）。
   *   比較（第 1 到 7 天）：3,970＞3,765 超過；7,340＜7,530 落後；11,310＞11,295、15,280＞15,060 超過；17,550＜18,825、19,820＜22,590、22,090＜26,355 落後
   *   → 最後一個可比的天（第 7 天）落後，最後一次由「不落後」轉為「落後」是第 5 天 → d＝5。
   */
  it("本期前 7 天與上期前 9 天逐日手算；第 8 天（9/14）與第 10 天（8/30）起累計為 null（斷線，不當 0），原因碼保留", () => {
    const result = cumulativeDaily(synthetic, METRIC);
    expect([result.previous.days, result.current.days]).toEqual([17, 17]);
    expect(values(result.current.points.slice(0, 7), "daily")).toEqual(["3970.00", "3370.00", "3970.00", "3970.00", "2270.00", "2270.00", "2270.00"]);
    expect(values(result.current.points.slice(0, 7), "cumulative")).toEqual(["3970.00", "7340.00", "11310.00", "15280.00", "17550.00", "19820.00", "22090.00"]);
    expect(values(result.previous.points.slice(0, 9), "cumulative")).toEqual(["3765.00", "7530.00", "11295.00", "15060.00", "18825.00", "22590.00", "26355.00", "30120.00", "33885.00"]);
    expect(result.current.breakDay).toBe(8);
    expect(result.current.points[7].date).toBe("2026-09-14");
    expect(result.previous.breakDay).toBe(10);
    expect(result.previous.points[9].date).toBe("2026-08-30");
    // 斷線之後每一天的累計都是 null（即使當日有值，例如本期 9/20 LIVE 已不缺）；當日值照 domain。
    expect(result.current.points.slice(7).every(point => point.cumulative.value === null)).toBe(true);
    expect(result.current.points[13].daily.value).not.toBeNull();
    expect(result.current.points[7].cumulative.reason_codes).toContain("MISSING_CHANNEL_COST_DAY");
    expect(result.previous.points[9].cumulative.reason_codes).toContain("MISSING_AD_DAY");
    // 末日累計＝該期合計：兩期合計都資料待補。
    expect(result.current.end!.value).toBeNull();
    expect(synthetic.report.current.metrics.contribution_after_marketing.value).toBeNull();
    expect(result.previous.end!.value).toBeNull();
  });

  it("交叉日 d＝5（只比兩期都有值的第 1 到 7 天）；標題金額寫資料待補", () => {
    const result = cumulativeDaily(synthetic, METRIC);
    expect(result.comparison).toEqual({ standing: "behind", day: 5, comparableDays: 7 });
    const metric = metricDefinitions.contribution_after_marketing.label;
    expect(cumulativeConclusion(result, synthetic).title).toBe(fill(labels.overview.chartsV4.cumulative.title.behind, { metric, amount: formatEmpty("missing"), d: 5 }));
  });

  it("兩期天數不同：只比共同的天（上期只留 8/21–8/24 四天 → 比第 1 到 4 天：第 3 天起超過，d＝3）；副標加「依第幾天對齊」", () => {
    const short = withReport(synthetic, report => ({ previous: { ...report.previous, period: { start: "2026-08-21", end: "2026-08-24" }, daily: report.previous.daily.filter(row => row.date <= "2026-08-24") } }));
    const result = cumulativeDaily(short, METRIC);
    expect([result.previous.days, result.current.days]).toEqual([4, 17]);
    expect(values(result.previous.points, "cumulative")).toEqual(["3765.00", "7530.00", "11295.00", "15060.00"]);
    // 第 1 天超過、第 2 天落後、第 3、4 天超過 → 最後一次由「不超過」轉為「超過」是第 3 天。
    expect(result.comparison).toEqual({ standing: "ahead", day: 3, comparableDays: 4 });
    const metric = metricDefinitions.contribution_after_marketing.label;
    const copy = labels.overview.chartsV4.cumulative;
    expect(cumulativeConclusion(result, short)).toEqual({
      title: fill(copy.title.ahead, { metric, amount: formatEmpty("missing"), d: 3 }),
      subtitle: fill(copy.alignNote, { subtitle: fill(copy.subtitle, { metric }), previous: 4, current: 17 }),
    });
  });

  it("某天沒有日列（PNL_NO_DAILY_ROWS）：那天起累計為 null；第 1 天就沒有值時沒有可比的天，標題用 single", () => {
    const gap = withReport(synthetic, report => ({ current: { ...report.current, daily: report.current.daily.filter(row => row.date !== "2026-09-09") } }));
    const result = cumulativeDaily(gap, METRIC);
    expect(result.current.points[2].daily).toEqual({ value: null, reason_codes: [PNL_NO_DAILY_ROWS] });
    expect(values(result.current.points.slice(0, 3), "cumulative")).toEqual(["3970.00", "7340.00", null]);
    expect(result.current.breakDay).toBe(3);
    // 第 1、2 天可比：超過、落後 → 落後，d＝2。
    expect(result.comparison).toEqual({ standing: "behind", day: 2, comparableDays: 2 });
    const first = withReport(synthetic, report => ({ current: { ...report.current, daily: report.current.daily.filter(row => row.date !== "2026-09-07") } }));
    const none = cumulativeDaily(first, METRIC);
    expect(none.comparison).toEqual({ standing: null, day: null, comparableDays: 0 });
    expect(cumulativeConclusion(none, first).title).toBe(fill(labels.overview.chartsV4.cumulative.title.single, { metric: metricDefinitions.contribution_after_marketing.label, amount: formatEmpty("missing") }));
  });
});

describe("V4-10 cumulativeDaily：任一期超過 92 天不畫", () => {
  it("本期 93 天（1/01–4/03）：drawable＝false、兩期都沒有點、沒有可比的天；92 天（1/01–4/02）照畫", () => {
    const long = withReport(golden, report => ({ current: { ...report.current, period: { start: "2026-01-01", end: "2026-04-03" } } }));
    const result = cumulativeDaily(long, METRIC);
    expect(result.drawable).toBe(false);
    expect([result.previous.days, result.current.days]).toEqual([1, 93]);
    expect([result.previous.points, result.current.points]).toEqual([[], []]);
    expect([result.previous.end, result.current.end]).toEqual([null, null]);
    expect(result.comparison).toEqual({ standing: null, day: null, comparableDays: 0 });
    // 標題金額改用本期合計（與末日累計恆等）。
    expect(cumulativeConclusion(result, long).title).toBe(fill(labels.overview.chartsV4.cumulative.title.single, { metric: metricDefinitions.contribution_after_marketing.label, amount: formatAmountL1("255.00") }));
    const previousLong = withReport(golden, report => ({ previous: { ...report.previous, period: { start: "2025-10-01", end: "2026-01-01" } } }));
    expect(cumulativeDaily(previousLong, METRIC).drawable).toBe(false);
    const edge = cumulativeDaily(withReport(golden, report => ({ current: { ...report.current, period: { start: "2026-01-01", end: "2026-04-02" } } })), METRIC);
    expect(edge.drawable).toBe(true);
    expect(edge.current.points).toHaveLength(92);
  });
});

describe("V4-10 compareCumulative 與 cumulativeSources", () => {
  const point = (day: number, cumulative: string | null): CumulativePoint => ({ day, date: `2026-01-${String(day).padStart(2, "0")}`, daily: { value: cumulative, reason_codes: [] }, cumulative: { value: cumulative, reason_codes: cumulative === null ? ["MISSING_VALUE"] : [] }, sources: [] });
  it("以最後一個可比的天判定；d＝最後一段連續落後（或超過）的起點；相同時 d＝null；比較用到分的整數，不經浮點", () => {
    const previous = ["100.00", "200.00", "300.00", "400.00"].map((value, index) => point(index + 1, value));
    expect(compareCumulative(previous, ["90.00", "210.00", "290.00", "390.00"].map((value, index) => point(index + 1, value)))).toEqual({ standing: "behind", day: 3, comparableDays: 4 });
    expect(compareCumulative(previous, ["110.00", "190.00", "300.00", "400.01"].map((value, index) => point(index + 1, value)))).toEqual({ standing: "ahead", day: 4, comparableDays: 4 });
    expect(compareCumulative(previous, ["110.00", "190.00", "300.00", "400.00"].map((value, index) => point(index + 1, value)))).toEqual({ standing: "even", day: null, comparableDays: 4 });
    // 0.1 ＋ 0.2 這類浮點誤差不影響：比較的是分。
    expect(compareCumulative([point(1, "0.30")], [point(1, "0.30")])).toEqual({ standing: "even", day: null, comparableDays: 1 });
    // 本期較長時只比上期的天數；遇到 null 就停。
    expect(compareCumulative(previous.slice(0, 2), ["90.00", "190.00", "999.00"].map((value, index) => point(index + 1, value)))).toEqual({ standing: "behind", day: 1, comparableDays: 2 });
    expect(compareCumulative(previous, [point(1, "150.00"), point(2, null), point(3, null)])).toEqual({ standing: "ahead", day: 1, comparableDays: 1 });
    expect(compareCumulative([], [point(1, "1.00")])).toEqual({ standing: null, day: null, comparableDays: 0 });
  });

  it("第 n 天的來源＝第 1 到 n 天來源列的聯集（uniqueSources）；末日＝本期全部日列的來源", () => {
    const result = cumulativeDaily(demo, METRIC);
    expect(cumulativeSources(result.current, 1)).toEqual(result.current.points[0].sources);
    expect(cumulativeSources(result.current, 3)).toEqual(uniqueSources(result.current.points.slice(0, 3).flatMap(item => item.sources)));
    expect(cumulativeSources(result.current, 42)).toEqual(uniqueSources(demo.report.current.daily.flatMap(row => row.sources)));
  });
});

// ── SSR：G8 區塊（Recharts 在伺服器端不輸出圖形，只驗區塊、資料表與 number-link 的 builder；CHART_CATALOG §1.2 共同規則）──
const render = (snapshot: WorkspaceSnapshot, target: CumulativeTarget | null = null) => renderToStaticMarkup(createElement(CumulativeSection, { snapshot, onEvidence: () => undefined, target }));
/** 資料表的列：列名與各格可見文字。 */
function tableRows(html: string): { header: string; cells: string[] }[] {
  const body = element(byTestId(html, CUMULATIVE_TABLE_TESTID), "<tbody")!;
  return [...body.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => ({ header: textOf(/<th scope="row">(.*?)<\/th>/.exec(match[1])![1]), cells: [...match[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(cell => textOf(cell[1])) }));
}

describe("V4-10 G8 區塊（SSR）", () => {
  it("示範資料：section#cumulative（chart-overview-cumulative）、標題＝結論句、副標是 aria 描述；固定高 sm、aria-hidden；圖例本期、上期（沒有目標）；資料表 84 列", () => {
    const html = render(demo);
    const section = byTestId(html, CUMULATIVE_TESTID);
    expect(openTag(section, "<section")).toBe(`<section class="panel chart-section" aria-labelledby="cumulative-title" aria-describedby="cumulative-sub" data-testid="${CUMULATIVE_TESTID}">`);
    const { title, subtitle } = cumulativeConclusion(cumulativeDaily(demo, METRIC), demo);
    expect(section).toContain(`<h2 id="cumulative-title">${title}</h2>`);
    expect(section).toContain(`<p class="sub" id="cumulative-sub">${subtitle}</p>`);
    expect(openTag(section, 'class="chart-frame sm"')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    expect(element(section, 'class="legend"')).toBe(`<div class="legend"><span><i aria-hidden="true" style="background:${chartColors.current}"></i>${labels.shell.periods.current}</span><span><i aria-hidden="true" style="background:${chartColors.previous}"></i>${labels.shell.periods.previous}</span></div>`);
    // 資料表收在沒有 open 的 <details class="data-alternative"> 內；summary「表格 · 兩期每日累計」。
    const details = element(section, '<details class="data-alternative"')!;
    expect(openTag(details, "<details")).toBe('<details class="data-alternative">');
    expect(details).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: labels.overview.chartsV4.cumulative.tableTitle })}</summary>`);
    expect(details).toContain(`data-testid="${CUMULATIVE_TABLE_TESTID}"`);
    const rows = tableRows(html);
    expect(rows).toHaveLength(84);
    expect(rows.map(row => row.header)).toEqual(cumulativeTableRows(cumulativeDaily(demo, METRIC)).map(cumulativeRowLabel));
    expect(rows[0].header).toBe(fill(labels.overview.chartsV4.cumulative.rowLabel, { period: labels.shell.periods.previous, n: 1 }));
    expect(rows[42].header).toBe(fill(labels.overview.chartsV4.cumulative.rowLabel, { period: labels.shell.periods.current, n: 1 }));
    // 上期最後一列、本期最後一列的累計＝各期合計（CHART_CATALOG G8 E2E 草案；L3）。
    expect(rows[41].cells).toEqual(["2026-07-12", formatAmountL3("45061.53"), formatAmountL3(demo.report.previous.metrics.contribution_after_marketing.value)]);
    expect(rows[83].cells).toEqual(["2026-08-23", formatAmountL3("42120.77"), formatAmountL3(demo.report.current.metrics.contribution_after_marketing.value)]);
    expect(rows[83].cells[2]).toBe(formatAmountL3("1269792.73"));
    expect(rows[42].cells).toEqual(["2026-07-13", formatAmountL3("35842.27"), formatAmountL3("35842.27")]);
    // 當日與累計格都是 number-link（每列 2 個），日期格是純文字；沒有目標欄。
    expect(byTestId(html, CUMULATIVE_TABLE_TESTID).match(/class="number-link"/g)).toHaveLength(84 * 2);
    expect(section).not.toContain(`<th scope="col" class="num">${fill(labels.format.units.yuanColumn, { label: labels.overview.chartsV4.cumulative.columns.target })}</th>`);
    expect(section).toContain(`<p class="note">${labels.overview.chartsV4.cumulative.missingNote}</p>`);
  });

  it("目標（matched）：圖例多一項目標刻度（tick、chartColors.target），資料表多一欄目標：本期每列＝目標值（number-link，開既有的目標抽屜）、上期每列寫不適用", () => {
    const evidence: EvidenceSelection = { title: "t", name: METRIC, metric: demo.report.current.metrics.contribution_after_marketing, period: demo.report.current.period, channels: demo.report.scope.channels, sources: demo.report.current.sources };
    const html = render(demo, { value: "100000.00", evidence });
    const section = byTestId(html, CUMULATIVE_TESTID);
    expect(section).toContain(`<span><svg class="legend-mark" data-shape="tick" width="2" height="12" viewBox="0 0 2 12" aria-hidden="true" focusable="false"><line x1="1" y1="0" x2="1" y2="12" stroke="${chartColors.target}" stroke-width="2"></line></svg>${labels.overview.chartsV4.cumulative.columns.target}</span>`);
    expect(section).toContain(`<th scope="col" class="num">${fill(labels.format.units.yuanColumn, { label: labels.overview.chartsV4.cumulative.columns.target })}</th>`);
    const rows = tableRows(html);
    expect(rows[0].cells[3]).toBe(formatEmpty("notApplicable"));
    expect(rows[42].cells[3]).toBe(formatAmountL3("100000.00"));
    expect(byTestId(html, CUMULATIVE_TABLE_TESTID).match(/class="number-link"/g)).toHaveLength(84 * 2 + 42);
  });

  it("任一期超過 92 天：同高的空狀態（chartFrame message），資料表 <details> 內只有同一句說明，沒有資料表 testid", () => {
    const long = withReport(golden, report => ({ current: { ...report.current, period: { start: "2026-01-01", end: "2026-04-03" } } }));
    const section = byTestId(render(long), CUMULATIVE_TESTID);
    const message = fill(labels.overview.chartsV4.cumulative.tooLong, { n: 92 });
    expect(openTag(section, 'class="chart-frame sm"')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" data-state="empty">`);
    expect(section).toContain(`<p class="chart-frame-message">${message}</p>`);
    expect(element(section, '<details class="data-alternative"')).toBe(`<details class="data-alternative"><summary>${fill(labels.overview.page.dataTable, { title: labels.overview.chartsV4.cumulative.tableTitle })}</summary><p class="note">${message}</p></details>`);
    expect(section).not.toContain(CUMULATIVE_TABLE_TESTID);
  });
});

describe("V4-10 G8 抽屜 builder（點與累計格同一個 builder）", () => {
  let result: CumulativeDaily;
  beforeAll(() => { result = cumulativeDaily(demo, METRIC); });
  it("累計：水準值（valueKind level）、metricVersion cumulative-daily-v1、期間＝期間起日到該日、組成是累加的每一天、來源是那些天的聯集、篩到該日", () => {
    const evidence = cumulativeEvidence(demo, result, result.current, 3);
    const copy = labels.overview.chartsV4.cumulative.evidence;
    const metric = metricDefinitions.contribution_after_marketing.label, period = labels.shell.periods.current;
    expect(evidence).toEqual({
      title: fill(copy.title, { period, metric, n: 3, date: "7/15" }),
      name: METRIC, metric: { value: "97718.28", reason_codes: [] }, period: { start: "2026-07-13", end: "2026-07-15" }, channels: demo.report.scope.channels,
      sources: cumulativeSources(result.current, 3),
      formula: fill(copy.formula, { period, n: 3, metric }),
      components: [
        { label: fill(copy.component, { n: 1, date: "7/13" }), metric: { value: "35842.27", reason_codes: [] } },
        { label: fill(copy.component, { n: 2, date: "7/14" }), metric: { value: "32410.52", reason_codes: [] } },
        { label: fill(copy.component, { n: 3, date: "7/15" }), metric: { value: "29465.49", reason_codes: [] } },
      ],
      valueKind: "level", metricVersion: "cumulative-daily-v1",
      definition: fill(copy.definition, { period, n: 3, metric }), formulaTechnical: copy.formulaTechnical,
      filter: { date: "2026-07-15" },
    });
    // 上期末日：值＝上期合計、組成 42 天。
    const last = cumulativeEvidence(demo, result, result.previous, 42);
    expect(last.metric.value).toBe("1868626.68");
    expect(last.components).toHaveLength(42);
    expect(last.period).toEqual({ start: "2026-06-01", end: "2026-07-12" });
  });

  it("當日：值直接取自 domain（不給 metricVersion，抽屜顯示 contribution-v1），arrangeVersion cumulative-daily-v1；標題沿用管理損益表「{指標} · {日期}」；篩到該日", () => {
    const evidence = cumulativeDayEvidence(demo, result, result.current, 1);
    expect(evidence).toEqual({
      title: fill(labels.overview.pnlV3.evidenceTitle, { metric: metricDefinitions.contribution_after_marketing.label, date: "7/13" }),
      name: METRIC, metric: { value: "35842.27", reason_codes: [] }, period: { start: "2026-07-13", end: "2026-07-13" }, channels: demo.report.scope.channels,
      sources: result.current.points[0].sources, arrangeVersion: "cumulative-daily-v1", filter: { date: "2026-07-13" },
    });
    expect(evidence.metricVersion).toBeUndefined();
  });
});
