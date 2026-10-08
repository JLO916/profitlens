import { describe, expect, it } from "vitest";
import { ASSIST_KPI_IDS, ASSIST_KPI_VERSION, netRevenuePerUnit } from "@/application/assist-kpi";
import { ASSIST_WEEKS_MAX, ASSIST_WEEKS_VERSION, assistWeekRows, assistWeeks } from "@/application/chart-assist-weeks";
import { isFullWeek } from "@/application/chart-takeaways";
import { formatMultiple, formatRateL1 } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import type { AnalysisFilters, DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { yoyInput } from "./helpers/yoy-dataset";

// V4-2 代理 A：G7a 的 B 級整理函式 assistWeeks（assist-weeks-v1；PRD §4.3 G7a、§6.4、§8.4；CHART_CATALOG G7、§9.2；D-V4-15）。
// 手算 golden：
// - 合成資料（tests/fixtures/synthetic-4-channel/README.md §1、§2.1、§4.4）：本期 9/07–9/23（17 天）切成 9/07–9/13、9/14–9/20、9/21–9/23（3 天，未滿 7 天）；
//   每天全通路 30 件（DTC 4＋2＋5、LIVE 1＋3、MARKETPLACE 3＋2＋1、SOCIAL 6＋2＋1；SKU-203 只退款的列是 0 件）→ 210、210、90，合計 510；
//   每週淨營收 121,760.00、121,760.00、51,840.00（每天 17,480，退款日 9/08、9/15、9/22 各 −600）→ 件均 579.81、579.81、576.00（HALF_UP）；
//   第 1 週廣告費 DTC 1,500 × 7＋LIVE 500 × 7＋MARKETPLACE 檔期 3 × 1,700＋SOCIAL 200 × 7＝20,500 → 廣告佔淨營收 16.8%、MER 5.9 倍；
//   第 3 週 LIVE 缺 9/22 廣告 → 廣告佔淨營收與 MER 資料待補（MISSING_AD_DAY）；第 2 週 LIVE 缺 9/14–9/19 通路費用 → 物流費佔比資料待補。
// - golden（本期 8/02 一天）：3＋1＋3＋1＝8 件；淨營收 1,120＋360＋640＋350＝2,470.00 → 件均 308.75；只有 1 週（1 天，未滿 7 天）。
// - 示範資料：本期 7/13–8/23 剛好 6 個完整週；每週件數由測試自己逐列加總 sales_daily.csv 的 units_sold（不經 domain），合計 7,420。

async function snapshotOf(input: DatasetInput, filters: AnalysisFilters = {}): Promise<WorkspaceSnapshot> {
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, filters, await hashInput(input));
}
const series = (data: ReturnType<typeof assistWeeks>, id: (typeof ASSIST_KPI_IDS)[number]) => data.series.find(item => item.id === id)!;
const values = (data: ReturnType<typeof assistWeeks>, id: (typeof ASSIST_KPI_IDS)[number]) => series(data, id).values.map(value => value.value);
/** 測試自己的件數加總（不經 domain）：sales_daily.csv 中日期落在 [start, end] 的列的 units_sold。 */
function unitsFromCsv(input: DatasetInput, start: string, end: string): bigint {
  const [head, ...lines] = String(input.files["sales_daily.csv"]).trim().split("\n");
  const columns = head.split(",");
  const date = columns.indexOf("date"), units = columns.indexOf("units_sold");
  return lines.map(line => line.split(",")).filter(cells => cells[date] >= start && cells[date] <= end).reduce((sum, cells) => sum + BigInt(cells[units]), 0n);
}

describe("assistWeeks：版本與形狀（assist-weeks-v1；assist-kpi-v1 不變）", () => {
  it("獨立版本常數 assist-weeks-v1；七個指標的順序同 ASSIST_KPI_IDS；assist-kpi-v1 的常數不動", async () => {
    const data = assistWeeks(await snapshotOf(fixture("demo")));
    expect(ASSIST_WEEKS_VERSION).toBe("assist-weeks-v1");
    expect(data.version).toBe(ASSIST_WEEKS_VERSION);
    expect(ASSIST_KPI_VERSION).toBe("assist-kpi-v1");
    expect(data.series.map(item => item.id)).toEqual([...ASSIST_KPI_IDS]);
    expect(data.series.map(item => [item.id, item.unit, item.level, item.metric ?? null])).toEqual([
      ["units_sold", "count", true, null],
      ["net_revenue_per_unit", "money_per_unit", false, null],
      ["marketing_burden", "percent", false, "marketing_burden"],
      ["mer", "multiple", false, "mer"],
      ["gross_margin", "percent", false, "gross_margin"],
      ["refund_ratio", "percent", false, "refund_ratio"],
      ["fulfillment_burden", "percent", false, "fulfillment_burden"],
    ]);
    for (const item of data.series) expect(item.values, item.id).toHaveLength(data.weeks.length);
  });

  it("可序列化：值一律是精確字串（沒有 bigint、沒有浮點），JSON 來回不變", async () => {
    const data = assistWeeks(await snapshotOf(synthetic4ChannelInput()));
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    for (const item of data.series) for (const value of item.values) expect(value.value === null || typeof value.value === "string", item.id).toBe(true);
  });
});

describe("assistWeeks：手算 golden（合成資料 4 通路，本期最後一週未滿 7 天）", () => {
  it("週＝本期 3 週（9/07–9/13、9/14–9/20、9/21–9/23），只有最後一週未滿 7 天；上期的週不列入", async () => {
    const snapshot = await snapshotOf(synthetic4ChannelInput());
    const data = assistWeeks(snapshot);
    expect(data.weeks.map(week => [week.period.start, week.period.end, week.full])).toEqual([["2026-09-07", "2026-09-13", true], ["2026-09-14", "2026-09-20", true], ["2026-09-21", "2026-09-23", false]]);
    expect(data.weeks.map(week => week.label)).toEqual(snapshot.weeks.filter(week => week.period === "current").map(week => week.label));
    expect(data.weeks.map(week => week.sources)).toEqual(snapshot.weeks.filter(week => week.period === "current").map(week => week.sources));
    expect(data.weeks.map(week => week.full)).toEqual(snapshot.weeks.filter(week => week.period === "current").map(isFullWeek));
  });

  it("售出件數 210、210、90；逐週加總＝本期件數 510（上期 196、196、84＝476 也對得起來）", async () => {
    const snapshot = await snapshotOf(synthetic4ChannelInput());
    const data = assistWeeks(snapshot);
    expect(values(data, "units_sold")).toEqual(["210", "210", "90"]);
    expect(values(data, "units_sold").reduce((sum, value) => sum + BigInt(value!), 0n)).toBe(510n);
    expect(snapshot.report.current.units_sold.value).toBe(510n);
    const previous = snapshot.weeks.filter(week => week.period === "previous");
    expect(previous.map(week => week.units_sold?.value)).toEqual([196n, 196n, 84n]);
    expect(previous.reduce((sum, week) => sum + week.units_sold!.value!, 0n)).toBe(snapshot.report.previous.units_sold.value);
  });

  it("件均淨營收 579.81、579.81、576.00；每週都等於 netRevenuePerUnit(該週淨營收, 該週件數)", async () => {
    const snapshot = await snapshotOf(synthetic4ChannelInput());
    const data = assistWeeks(snapshot);
    expect(values(data, "net_revenue_per_unit")).toEqual(["579.81", "579.81", "576.00"]);
    const rows = assistWeekRows(snapshot);
    expect(rows.map(row => row.metrics.net_revenue.value)).toEqual(["121760.00", "121760.00", "51840.00"]);
    rows.forEach((row, index) => expect(series(data, "net_revenue_per_unit").values[index]).toEqual(netRevenuePerUnit(row.metrics.net_revenue, row.units_sold!)));
  });

  it("五個比率與倍數直接取週列 metrics（逐字相同）；第 1 週廣告佔淨營收 16.8%、MER 5.9 倍；缺列的週維持資料待補，不當 0", async () => {
    const snapshot = await snapshotOf(synthetic4ChannelInput());
    const data = assistWeeks(snapshot);
    const rows = assistWeekRows(snapshot);
    for (const id of ["marketing_burden", "mer", "gross_margin", "refund_ratio", "fulfillment_burden"] as const) {
      expect(series(data, id).values, id).toEqual(rows.map(row => ({ value: row.metrics[id].value, reason_codes: row.metrics[id].reason_codes })));
    }
    expect(formatRateL1(series(data, "marketing_burden").values[0].value)).toBe(formatRateL1("0.168364"));
    expect(formatMultiple(series(data, "mer").values[0].value, "L1")).toBe(formatMultiple("5.94", "L1"));
    expect(series(data, "marketing_burden").values[2]).toMatchObject({ value: null, reason_codes: expect.arrayContaining(["MISSING_AD_DAY"]) });
    expect(series(data, "mer").values[2]).toMatchObject({ value: null, reason_codes: expect.arrayContaining(["MISSING_AD_DAY"]) });
    expect(series(data, "fulfillment_burden").values[1]).toMatchObject({ value: null, reason_codes: expect.arrayContaining(["MISSING_CHANNEL_COST_DAY"]) });
    // 商品毛利率三週都可算（不受費用缺列影響）。
    expect(values(data, "gross_margin").every(value => value !== null)).toBe(true);
  });
});

describe("assistWeeks：示範資料、golden、上限 8 週", () => {
  it("示範資料：本期剛好 6 個完整週；每週件數＝測試自己加總 CSV 的件數；逐週加總＝本期件數 7,420", async () => {
    const input = fixture("demo");
    const snapshot = await snapshotOf(input);
    const data = assistWeeks(snapshot);
    expect(data.weeks).toHaveLength(6);
    expect(data.weeks.every(week => week.full)).toBe(true);
    expect(data.weeks[0].period).toEqual({ start: "2026-07-13", end: "2026-07-19" });
    expect(data.weeks[5].period).toEqual({ start: "2026-08-17", end: "2026-08-23" });
    expect(values(data, "units_sold")).toEqual(data.weeks.map(week => unitsFromCsv(input, week.period.start, week.period.end).toString()));
    expect(values(data, "units_sold").reduce((sum, value) => sum + BigInt(value!), 0n)).toBe(7420n);
    expect(snapshot.report.current.units_sold.value).toBe(7420n);
    // 上期也逐週對得起來（weeklyRows 對兩期都帶 units_sold）。
    const previous = snapshot.weeks.filter(week => week.period === "previous");
    expect(previous.map(week => week.units_sold?.value)).toEqual(previous.map(week => unitsFromCsv(input, week.start, week.end)));
    expect(previous.reduce((sum, week) => sum + week.units_sold!.value!, 0n)).toBe(snapshot.report.previous.units_sold.value);
  });

  it("golden：本期 1 天（8/02）＝1 週、未滿 7 天；8 件、件均 308.75", async () => {
    const data = assistWeeks(await snapshotOf(fixture("golden")));
    expect(data.weeks.map(week => [week.period.start, week.period.end, week.full])).toEqual([["2026-08-02", "2026-08-02", false]]);
    expect(values(data, "units_sold")).toEqual(["8"]);
    expect(values(data, "net_revenue_per_unit")).toEqual(["308.75"]);
  });

  it(`本期超過 ${ASSIST_WEEKS_MAX} 週時只取最後 ${ASSIST_WEEKS_MAX} 週（兩年合成資料，本期 5/01–8/23＝17 週，最後一週 3 天）`, async () => {
    const snapshot = await snapshotOf(yoyInput(), { previous_period: { start: "2026-01-06", end: "2026-04-30" }, current_period: { start: "2026-05-01", end: "2026-08-23" } });
    const current = snapshot.weeks.filter(week => week.period === "current");
    expect(current).toHaveLength(17);
    const data = assistWeeks(snapshot);
    expect(data.weeks).toHaveLength(ASSIST_WEEKS_MAX);
    expect(data.weeks.map(week => week.period)).toEqual(current.slice(-8).map(week => ({ start: week.start, end: week.end })));
    expect(data.weeks.map(week => week.full)).toEqual([true, true, true, true, true, true, true, false]);
    // 兩個通路每天各 1 件：完整週 14 件、最後 3 天 6 件。
    expect(values(data, "units_sold")).toEqual(["14", "14", "14", "14", "14", "14", "14", "6"]);
  });

  it("refund_only：件數 0 → 件均不適用（ZERO_UNITS）；zero_ad：廣告費 0 → MER 每週都不適用", async () => {
    const refund = assistWeeks(await snapshotOf(fixture("refund_only")));
    expect(series(refund, "net_revenue_per_unit").values.every(value => value.value === null)).toBe(true);
    expect(series(refund, "net_revenue_per_unit").values.flatMap(value => value.reason_codes)).toContain("ZERO_UNITS");
    const zeroAd = assistWeeks(await snapshotOf(fixture("zero_ad")));
    expect(values(zeroAd, "mer").every(value => value === null)).toBe(true);
  });

  it("舊程式組出的週列沒有 units_sold（選填）：件數與件均當缺值，不當 0", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const weeks = snapshot.weeks.map(({ units_sold: _units, ...week }) => { void _units; return week; });
    const data = assistWeeks({ weeks });
    expect(series(data, "units_sold").values.every(value => value.value === null && value.reason_codes.includes("MISSING_VALUE"))).toBe(true);
    expect(series(data, "net_revenue_per_unit").values.every(value => value.value === null)).toBe(true);
    expect(values(data, "gross_margin").every(value => value !== null)).toBe(true);
  });
});
