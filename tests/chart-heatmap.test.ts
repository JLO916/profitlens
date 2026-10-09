import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_WEEKS_VERSION, channelWeeks } from "@/application/chart-channel-weeks";
import { DAILY_HEATMAP_MAX_CELLS, DAILY_HEATMAP_MAX_CHANNELS, DAILY_HEATMAP_MAX_DAYS, DAILY_HEATMAP_VERSION, DAILY_HEATMAP_WORST, dailyHeatmap, negativeAfterYuan, weekdayOf, type DailyHeatmap, type HeatChannel, type HeatValueCell } from "@/application/chart-heatmap";
import { isFullWeek } from "@/application/chart-takeaways";
import { deltaTone } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { parseCents } from "@/domain/money";
import type { AnalysisFilters, DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-3b 代理 A：G11 的 B 級整理函式 dailyHeatmap（daily-heatmap-v1；PRD §4.3 G11、§6.4、§8.2；CHART_CATALOG G11、§9.2；D-V4-15、D-V4-17＝A）。
// 格值直接取自 report.current.daily（contribution-v1），本函式只分階、排名與排列；本期超過 92 天改週 × 通路（channelWeeks 的值）。
// 為了斷言日粒度不呼叫 channelWeeks，本檔把模組換成同一個實作外面包一層 vi.fn（行為不變，只多記錄呼叫）。
vi.mock("@/application/chart-channel-weeks", async importOriginal => {
  const actual = await importOriginal<typeof import("@/application/chart-channel-weeks")>();
  return { ...actual, channelWeeks: vi.fn((snapshot: Parameters<typeof actual.channelWeeks>[0]) => actual.channelWeeks(snapshot)) };
});
const spy = vi.mocked(channelWeeks);
beforeEach(() => { spy.mockClear(); });

// 手算 golden（每格是扣廣告後貢獻，元，到分）：
// - 示範資料（本期 7/13–8/23，42 天＝6 個完整週，起日週一）：MARKETPLACE 取位到元後為負 32 天，最差 8/22 −4,510.74（格內「−0.45」），
//   階 2＝8/22、7/19、8/16（H5 設計稿 mockup-data.json 的 g11 同值）；DTC 0 天。標題所指＝MARKETPLACE 8/22，排第一張。
// - 合成資料（tests/fixtures/synthetic-4-channel/README.md §1、§2；本期 9/07–9/23，17 天，起日週一，第 3 週 9/21–9/23 未滿 7 天）：
//   DTC 每天 2,400；MARKETPLACE 每天 400，只退款日 9/08、9/15、9/22 各 −200（400 − 600），檔期日 9/11–9/13、9/18–9/20 各 −1,300（400 − 廣告 1,700）
//   共 9 天虧，階 2＝9/11、9/12、9/13（6 天同為 −1,300，依日期先後）；SOCIAL 每天 70，9/15 為 6,310（平台抽成 −6,000 沖回）；
//   LIVE 每天 1,100，9/14–9/19 缺通路費用、9/22 缺廣告，共 7 天資料待補（null，不排名）。標題所指＝MARKETPLACE 9/11 −1,300。
// - golden（本期 8/02 一天，週日）：DTC 270.00、MARKETPLACE −15.00，1 天虧；欄頭從週日開始，第 1 列只有 1 格、其餘 6 格是期間外。
// - refund_only（本期 8/02）：DTC −60.00。

async function snapshotOf(input: DatasetInput, filters: AnalysisFilters = {}): Promise<WorkspaceSnapshot> {
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, filters, await hashInput(input));
}
const ready = (snapshot: Pick<WorkspaceSnapshot, "report" | "weeks">): DailyHeatmap => {
  const result = dailyHeatmap(snapshot);
  expect(result.reason).toBeNull();
  return result.heatmap!;
};
const channelOf = (heatmap: DailyHeatmap, channel: string) => heatmap.channels.find(item => item.channel === channel)!;
const valueCells = (item: HeatChannel) => item.rows.flatMap(row => row.cells).filter((cell): cell is HeatValueCell => cell.kind === "value");
const tierOf = (item: HeatChannel, key: string) => valueCells(item).find(cell => cell.key === key)!.tier;
const keysWithTier = (item: HeatChannel, tiers: readonly HeatValueCell["tier"][]) => valueCells(item).filter(cell => tiers.includes(cell.tier)).map(cell => cell.key);

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/**
 * 在記憶體中組出 N 通路 × D 天的合成資料（不寫檔；與 tests/chart-channel-weeks.test.ts 的 helper 同一組數字：上期、本期各 D 天、相鄰；
 * 每天每通路一列銷售、一列通路費用、一列廣告；扣廣告後貢獻每天都是正的）。通路代碼 CH01、CH02…（不是示範資料，不套別名）。
 */
function manyChannelsInput(channelCount: number, days: number): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const start = "2026-01-01";
  const channels = Array.from({ length: channelCount }, (_, at) => `CH${String(at + 1).padStart(2, "0")}`);
  const dates = Array.from({ length: days * 2 }, (_, at) => shift(start, at));
  const sales = dates.flatMap((date, day) => channels.map((channel, at) => `${date},${channel},SKU-${at + 1},HOME,2,${(1000 + day + at).toFixed(2)},50.00,0.00,400.00,TWD`));
  const costs = dates.flatMap(date => channels.map(channel => `${date},${channel},30.00,10.00,20.00,5.00,TWD`));
  const ads = dates.flatMap(date => channels.map(channel => `${date},${channel},100.00,TWD`));
  return {
    manifest: {
      ...base, dataset_id: `synthetic-many-channels-${channelCount}x${days}`, data_as_of: shift(start, days * 2), coverage_start: start, coverage_end: shift(start, days * 2 - 1),
      channels, previous_period: { start, end: shift(start, days - 1) }, current_period: { start: shift(start, days), end: shift(start, days * 2 - 1) },
    },
    files: {
      "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...sales].join("\n"),
      "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...costs].join("\n"),
      "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...ads].join("\n"),
    },
  };
}

describe("dailyHeatmap：版本、上限與形狀（daily-heatmap-v1）", () => {
  it("獨立版本常數；上限：通路 8（與 G7b、G10 共用）、92 天、格數 8 × 92＝736、階 2 每通路 3 格", () => {
    expect(DAILY_HEATMAP_VERSION).toBe("daily-heatmap-v1");
    expect(DAILY_HEATMAP_MAX_CHANNELS).toBe(8);
    expect(DAILY_HEATMAP_MAX_DAYS).toBe(92);
    expect(DAILY_HEATMAP_MAX_CELLS).toBe(736);
    expect(DAILY_HEATMAP_WORST).toBe(3);
  });

  it("示範資料：日粒度；列＝snapshot 本期週（同一組起訖與週名）、每列 7 格；欄的星期從期間起日（週一）起算；格數＝通路數 × 天數；可序列化", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const heatmap = ready(snapshot);
    expect(heatmap.version).toBe(DAILY_HEATMAP_VERSION);
    expect(heatmap.metric).toBe("contribution_after_marketing");
    expect(heatmap.mode).toBe("daily");
    const current = snapshot.weeks.filter(week => week.period === "current");
    expect(heatmap.weeks).toEqual(current.map(week => ({ label: week.label, period: { start: week.start, end: week.end }, full: isFullWeek(week) })));
    expect(heatmap.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(heatmap.cellCount).toBe(2 * 42);
    for (const item of heatmap.channels) {
      expect(item.rows.map(row => row.period)).toEqual(heatmap.weeks.map(week => week.period));
      for (const row of item.rows) expect(row.cells).toHaveLength(7);
      expect(valueCells(item)).toHaveLength(42);
    }
    expect(JSON.parse(JSON.stringify(heatmap))).toEqual(heatmap);
    expect(spy).not.toHaveBeenCalled();
  });

  it("期間不從週一開始（golden 本期 8/02 是週日）：列仍是 snapshot 週、欄頭星期跟著起日；第 1 列只有 1 格有值，其餘 6 格是期間外", async () => {
    const heatmap = ready(await snapshotOf(fixture("golden")));
    expect(weekdayOf("2026-08-02")).toBe(0);
    expect(heatmap.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(heatmap.weeks).toEqual([{ label: expect.any(String), period: { start: "2026-08-02", end: "2026-08-02" }, full: false }]);
    for (const item of heatmap.channels) {
      expect(item.rows).toHaveLength(1);
      expect(item.rows[0].cells.map(cell => [cell.kind, cell.key])).toEqual([["value", "2026-08-02"], ...[3, 4, 5, 6, 7, 8].map(day => ["outside", `2026-08-0${day}`])]);
      expect(item.rows[0].cells.slice(1).every(cell => cell.tier === "outside")).toBe(true);
    }
    expect(heatmap.cellCount).toBe(2);
  });
});

describe("dailyHeatmap：格值逐字取自 domain、逐日加總＝通路期間合計", () => {
  it("每格＝report.current.daily 同日同通路的扣廣告後貢獻與來源列（逐字）；period 是單日", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden")]) {
      const snapshot = await snapshotOf(input);
      const heatmap = ready(snapshot);
      for (const row of snapshot.report.current.daily) {
        const cell = valueCells(channelOf(heatmap, row.channel)).find(item => item.key === row.date)!;
        expect(cell.metric, `${row.channel} ${row.date}`).toEqual(row.metrics.contribution_after_marketing);
        expect(cell.sources).toEqual(row.sources);
        expect(cell.period).toEqual({ start: row.date, end: row.date });
      }
    }
  }, 30_000);

  it("每通路逐日加總＝該通路本期合計（到分）：示範資料、合成資料、golden、zero_ad、refund_only；有資料待補的日子時本期合計也是資料待補", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden"), fixture("zero_ad"), fixture("refund_only")]) {
      const snapshot = await snapshotOf(input);
      const heatmap = ready(snapshot);
      for (const channel of snapshot.report.scope.channels) {
        const values = valueCells(channelOf(heatmap, channel)).map(cell => cell.metric.value);
        const daily = values.some(value => value === null) ? null : values.reduce((sum, value) => sum + parseCents(value)!, 0n);
        const total = snapshot.report.current.channels[channel].metrics.contribution_after_marketing.value;
        expect(daily, `${(input.manifest as Manifest).dataset_id} ${channel}`).toBe(total === null ? null : parseCents(total));
      }
    }
  }, 30_000);
});

describe("dailyHeatmap：分階（階 1＝取位到元後仍為負；階 2＝該通路最差 3 天）與標題所指的一格", () => {
  it("示範資料：MARKETPLACE 32 天虧、最差 8/22 −4,510.74、階 2＝8/22、7/19、8/16；DTC 0 天；標題所指的通路排第一張", async () => {
    const heatmap = ready(await snapshotOf(fixture("demo")));
    const marketplace = channelOf(heatmap, "MARKETPLACE");
    expect(marketplace.losing).toBe(32);
    expect(marketplace.worst).toEqual(["2026-08-22", "2026-07-19", "2026-08-16"]);
    expect(keysWithTier(marketplace, [2])).toEqual(["2026-07-19", "2026-08-16", "2026-08-22"]);
    expect(keysWithTier(marketplace, [1, 2])).toHaveLength(32);
    expect(valueCells(marketplace).find(cell => cell.key === "2026-08-22")!.metric.value).toBe("-4510.74");
    const dtc = channelOf(heatmap, "DTC");
    expect([dtc.losing, dtc.worst, keysWithTier(dtc, [1, 2])]).toEqual([0, [], []]);
    expect(heatmap.headline).toEqual({ kind: "loss", channel: "MARKETPLACE", key: "2026-08-22", period: { start: "2026-08-22", end: "2026-08-22" }, value: "-4510.74", losing: 32 });
    expect(heatmap.channels.map(item => item.channel)).toEqual(["MARKETPLACE", "DTC"]);
  });

  it("合成資料：MARKETPLACE 9 天虧，階 2 依值再依日期（6 天同為 −1,300，取 9/11、9/12、9/13）；LIVE 缺列日是 missing、不排名；SOCIAL 的 6,310 不分階；順序 MARKETPLACE 第一、其餘依範圍", async () => {
    const heatmap = ready(await snapshotOf(synthetic4ChannelInput()));
    const marketplace = channelOf(heatmap, "MARKETPLACE");
    expect(keysWithTier(marketplace, [1, 2])).toEqual(["2026-09-08", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-15", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-22"]);
    expect(marketplace.worst).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(tierOf(marketplace, "2026-09-18")).toBe(1);
    expect(tierOf(marketplace, "2026-09-08")).toBe(1);
    const live = channelOf(heatmap, "LIVE");
    expect(keysWithTier(live, ["missing"])).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-22"]);
    for (const cell of valueCells(live).filter(item => item.tier === "missing")) expect(cell.metric.value).toBeNull();
    expect([live.losing, live.worst]).toEqual([0, []]);
    expect(tierOf(channelOf(heatmap, "SOCIAL"), "2026-09-15")).toBe(0);
    expect(heatmap.headline).toMatchObject({ kind: "loss", channel: "MARKETPLACE", key: "2026-09-11", value: "-1300.00", losing: 9 });
    expect(heatmap.channels.map(item => item.channel)).toEqual(["MARKETPLACE", "DTC", "LIVE", "SOCIAL"]);
    // 第 3 週 9/21–9/23（週一到週三）：週四到週日 4 格是期間外。
    for (const item of heatmap.channels) expect(item.rows[2].cells.map(cell => cell.tier === "outside")).toEqual([false, false, false, true, true, true, true]);
  });

  it("階 2 每通路恰好 min(3, 階 1 天數) 格；正值與取位到元後為 0 的格都是 0；階 1 的判斷與 v3 通路結論句的「虧」（deltaTone L1）一致", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden"), fixture("zero_ad"), fixture("refund_only")]) {
      const heatmap = ready(await snapshotOf(input));
      for (const item of heatmap.channels) {
        expect(keysWithTier(item, [2]), item.channel).toHaveLength(Math.min(DAILY_HEATMAP_WORST, item.losing));
        for (const cell of valueCells(item)) {
          const loss = deltaTone("contribution_after_marketing", cell.metric.value, "L1") === "unfavorable";
          expect(negativeAfterYuan(cell.metric.value), `${item.channel} ${cell.key}`).toBe(loss);
          expect(cell.tier === 1 || cell.tier === 2, `${item.channel} ${cell.key}`).toBe(loss);
        }
      }
    }
  }, 30_000);

  it("取位到元：−0.49 元是 0（不算虧）、−0.50 元是 1；null 不參與排名（即使把最差的一天改成資料待補）", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const edit = (date: string, channel: string, value: string | null) => {
      const row = snapshot.report.current.daily.find(item => item.date === date && item.channel === channel)!;
      row.metrics = { ...row.metrics, contribution_after_marketing: { value, reason_codes: value === null ? ["MISSING_AD_DAY"] : [] } };
    };
    edit("2026-07-13", "DTC", "-0.49");
    edit("2026-07-14", "DTC", "-0.50");
    edit("2026-08-22", "MARKETPLACE", null);
    const heatmap = ready(snapshot);
    const dtc = channelOf(heatmap, "DTC");
    expect([tierOf(dtc, "2026-07-13"), tierOf(dtc, "2026-07-14"), dtc.losing]).toEqual([0, 2, 1]);
    const marketplace = channelOf(heatmap, "MARKETPLACE");
    expect(tierOf(marketplace, "2026-08-22")).toBe("missing");
    expect(marketplace.losing).toBe(31);
    expect(marketplace.worst).toEqual(["2026-07-19", "2026-08-16", expect.any(String)]);
    expect(marketplace.worst).not.toContain("2026-08-22");
    expect(heatmap.headline).toMatchObject({ channel: "MARKETPLACE", key: "2026-07-19" });
  });

  it("沒有虧損日時，標題所指的是全部有值格中最低的一格（同值依日期先後）：合成資料只選 DTC、SOCIAL 時是 SOCIAL 9/07 的 70.00，SOCIAL 排第一", async () => {
    const heatmap = ready(await snapshotOf(synthetic4ChannelInput(), { channels: ["DTC", "SOCIAL"] }));
    expect(heatmap.channels.every(item => item.losing === 0 && item.worst.length === 0)).toBe(true);
    expect(heatmap.headline).toEqual({ kind: "none", channel: "SOCIAL", key: "2026-09-07", period: { start: "2026-09-07", end: "2026-09-07" }, value: "70.00", losing: 0 });
    expect(heatmap.channels.map(item => item.channel)).toEqual(["SOCIAL", "DTC"]);
  });

  it("golden、refund_only：golden MARKETPLACE 8/02 −15.00 是唯一一天虧（階 2）；refund_only DTC −60.00", async () => {
    const golden = ready(await snapshotOf(fixture("golden")));
    expect(golden.headline).toMatchObject({ kind: "loss", channel: "MARKETPLACE", key: "2026-08-02", value: "-15.00", losing: 1 });
    expect(channelOf(golden, "MARKETPLACE").worst).toEqual(["2026-08-02"]);
    expect(tierOf(channelOf(golden, "DTC"), "2026-08-02")).toBe(0);
    const refundOnly = ready(await snapshotOf(fixture("refund_only")));
    expect(refundOnly.headline).toMatchObject({ kind: "loss", channel: "DTC", value: "-60.00", losing: 1 });
  });
});

describe("dailyHeatmap：超過 92 天改週 × 通路、通路與格數上限、逐日列不完整", () => {
  it("本期 92 天仍是日粒度（14 週、最後一週 1 天），不呼叫 channelWeeks", async () => {
    const heatmap = ready(await snapshotOf(manyChannelsInput(2, 92)));
    expect(heatmap.mode).toBe("daily");
    expect(heatmap.weeks).toHaveLength(14);
    expect(heatmap.cellCount).toBe(2 * 92);
    expect(spy).not.toHaveBeenCalled();
  }, 30_000);

  it("本期 93 天改週 × 通路：每格＝channelWeeks 的該週該通路值（同一組週、逐字），key＝週起日；分階規則相同（全為正時沒有階 1，標題取最低的一週）", async () => {
    const snapshot = await snapshotOf(manyChannelsInput(2, 93));
    spy.mockClear();
    const heatmap = ready(snapshot);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(heatmap.mode).toBe("weekly");
    expect(heatmap.weekdays).toEqual([]);
    const weeks = channelWeeks(snapshot)!;
    expect(weeks.version).toBe(CHANNEL_WEEKS_VERSION);
    expect(heatmap.weeks).toEqual(weeks.weeks);
    expect(heatmap.weeks).toHaveLength(14);
    expect(heatmap.cellCount).toBe(2 * 14);
    for (const series of weeks.channels) {
      const item = channelOf(heatmap, series.channel);
      expect(item.rows.map(row => row.cells)).toEqual(weeks.weeks.map((week, at) => [{ kind: "value", key: week.period.start, period: week.period, tier: 0, metric: series.values[at].metric, sources: series.values[at].sources }]));
    }
    // 最後一週只有 2 天（93＝13 × 7＋2），合計最小，所以標題所指的是它。
    expect(heatmap.headline).toMatchObject({ kind: "none", key: heatmap.weeks.at(-1)!.period.start, losing: 0 });
    expect(heatmap.weeks.at(-1)!.full).toBe(false);
  }, 30_000);

  it("通路 > 8 不計算：50 通路 × 92 天回傳 heatmap null 與原因 tooManyChannels，不呼叫 channelWeeks；8 通路照常計算", async () => {
    const many = await snapshotOf(manyChannelsInput(50, 92));
    expect(dailyHeatmap(many)).toEqual({ heatmap: null, reason: "tooManyChannels" });
    expect(dailyHeatmap(await snapshotOf(manyChannelsInput(9, 14)))).toEqual({ heatmap: null, reason: "tooManyChannels" });
    expect(dailyHeatmap(await snapshotOf(manyChannelsInput(8, 14))).heatmap?.cellCount).toBe(8 * 14);
    expect(spy).not.toHaveBeenCalled();
  }, 60_000);

  it("週 × 通路的格數超過 736 時不計算（tooManyCells），也不呼叫 channelWeeks；逐日列不完整時回傳 incompleteDaily", async () => {
    const snapshot = await snapshotOf(fixture("demo"));
    const channels = Array.from({ length: 8 }, (_, at) => `CH${at}`);
    const weeks = Array.from({ length: 93 }, (_, at) => ({ ...snapshot.weeks[0], period: "current" as const, start: `w${at}`, end: `w${at}` }));
    const long = { report: { ...snapshot.report, scope: { ...snapshot.report.scope, channels }, current: { ...snapshot.report.current, period: { start: "2026-01-01", end: "2027-10-10" } } }, weeks };
    expect(dailyHeatmap(long)).toEqual({ heatmap: null, reason: "tooManyCells" });
    expect(spy).not.toHaveBeenCalled();
    const sparse = { ...snapshot, report: { ...snapshot.report, current: { ...snapshot.report.current, daily_complete: false } } };
    expect(dailyHeatmap(sparse)).toEqual({ heatmap: null, reason: "incompleteDaily" });
  });
});
