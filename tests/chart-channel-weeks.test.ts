import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_WEEKS_MAX_CHANNELS, CHANNEL_WEEKS_RECENT, CHANNEL_WEEKS_VERSION, channelWeeks, channelWeeksAvailable, recentChannelWeeks } from "@/application/chart-channel-weeks";
import { isFullWeek } from "@/application/chart-takeaways";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { CHANNEL_WEEKS_TABLE_TESTID, CHANNEL_WEEKS_TOO_MANY_TESTID } from "@/components/channel-table";
import { Diagnosis } from "@/components/workspace-panels";
import { aggregatePeriod } from "@/domain/aggregation";
import { parseCents } from "@/domain/money";
import type { AnalysisFilters, Dataset, DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-3a 代理 B：G7b 的 B 級整理函式 channelWeeks（channel-weeks-v1；PRD §4.3 G7b、§6.4、§8.2、§8.4；CHART_CATALOG G7（b）、§9.2；D-V4-15）。
// channelWeeks 不放進 createSnapshot，由健檢頁通路寬表（channel-table.tsx 的 diagnosis 變體）在 useMemo 內呼叫；通路 > 8 時不呼叫。
// 為了斷言「沒被呼叫」，本檔把模組換成同一個實作外面包一層 vi.fn（行為不變，只多記錄呼叫）。
vi.mock("@/application/chart-channel-weeks", async importOriginal => {
  const actual = await importOriginal<typeof import("@/application/chart-channel-weeks")>();
  return { ...actual, channelWeeks: vi.fn((snapshot: Parameters<typeof actual.channelWeeks>[0]) => actual.channelWeeks(snapshot)) };
});
const spy = vi.mocked(channelWeeks);
// beforeEach 回傳函式會被當成清理函式在測試後呼叫，所以用區塊、不回傳 mockClear 的結果。
beforeEach(() => { spy.mockClear(); });

// 手算 golden（每格是扣廣告後貢獻，元，到分）：
// - 合成資料（tests/fixtures/synthetic-4-channel/README.md §1、§2）：本期 9/07–9/13、9/14–9/20、9/21–9/23（3 天，未滿 7 天）。
//   DTC 每天 2,400（商品毛利 4,500 − 通路費用 600 − 廣告 1,500）→ 16,800、16,800、7,200（合計 40,800）。
//   MARKETPLACE 每天 400（商品毛利 1,250 − 850 − 0），只退款日 9/08、9/15、9/22 各 −600，檔期日 9/11–9/13、9/18–9/20 各廣告 1,700
//     → 2,800 − 600 − 5,100＝−2,900、同理 −2,900、1,200 − 600＝600（合計 −5,200）。
//   SOCIAL 每天 70（730 − 460 − 200），9/15 平台抽成 −6,000（當天通路費用 −5,780，比平常多 6,240）→ 490、6,730、210（合計 7,430）。
//   LIVE 第 1 週每天 1,100（1,950 − 350 − 500）→ 7,700；第 2 週缺 9/14–9/19 通路費用 → 資料待補；第 3 週缺 9/22 廣告 → 資料待補（本期合計也資料待補）。
// - golden（本期 8/02 一天，只有 1 週、未滿 7 天）：DTC 270.00、MARKETPLACE −15.00。
// - refund_only（本期 8/02 一天）：DTC 只退款 100、商品成本沖回 −40 → −60.00。
// - 示範資料：本期 7/13–8/23 剛好 6 個完整週；逐週加總＝各通路本期合計（由 domain 的期間值對帳，不另抄數字）。

async function snapshotOf(input: DatasetInput, filters: AnalysisFilters = {}): Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot }> {
  const dataset = validateDataset(input).dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)) };
}
const valuesOf = (data: NonNullable<ReturnType<typeof channelWeeks>>, channel: string) => data.channels.find(series => series.channel === channel)!.values.map(value => value.metric.value);
/** 逐週加總（測試自己用 bigint 加，不經 domain）；任一週資料待補時回傳 null。 */
const sumWeeks = (values: (string | null)[]) => values.some(value => value === null) ? null : values.reduce((sum, value) => sum + parseCents(value)!, 0n);

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * 在記憶體中組出 N 通路 × D 天的合成資料（不寫檔；PRD §6.4、§8.2：50 通路 × 92 天）。上期、本期各 D 天、相鄰；每天每通路一列銷售、一列通路費用、一列廣告。
 * 金額是日序與通路序的簡單整數（方便手算），通路代碼 CH01、CH02…（不是示範資料，不套別名）。
 */
function manyChannelsInput(channelCount: number, days: number): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const start = "2026-01-01";
  const channels = Array.from({ length: channelCount }, (_, index) => `CH${String(index + 1).padStart(2, "0")}`);
  const dates = Array.from({ length: days * 2 }, (_, index) => shift(start, index));
  const sales = dates.flatMap((date, day) => channels.map((channel, index) => `${date},${channel},SKU-${index + 1},HOME,2,${(1000 + day + index).toFixed(2)},50.00,0.00,400.00,TWD`));
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

describe("channelWeeks：版本與形狀（channel-weeks-v1）", () => {
  it("獨立版本常數 channel-weeks-v1；指標＝扣廣告後貢獻；通路順序同 report.scope.channels；週＝snapshot 本期週（同一組起訖與週名）", async () => {
    const { snapshot } = await snapshotOf(synthetic4ChannelInput());
    const data = channelWeeks(snapshot)!;
    expect(CHANNEL_WEEKS_VERSION).toBe("channel-weeks-v1");
    expect(data.version).toBe(CHANNEL_WEEKS_VERSION);
    expect(data.metric).toBe("contribution_after_marketing");
    expect(data.channels.map(series => series.channel)).toEqual(snapshot.report.scope.channels);
    const current = snapshot.weeks.filter(week => week.period === "current");
    expect(data.weeks).toEqual(current.map(week => ({ label: week.label, period: { start: week.start, end: week.end }, full: isFullWeek(week) })));
    // 每通路每週恰好一格（格數＝通路數 × 週數）。
    for (const series of data.channels) expect(series.values, series.channel).toHaveLength(data.weeks.length);
    expect(data.channels.flatMap(series => series.values)).toHaveLength(snapshot.report.scope.channels.length * current.length);
  });

  it("可序列化：值一律是 domain 的精確字串（沒有 bigint、沒有浮點），JSON 來回不變", async () => {
    const data = channelWeeks((await snapshotOf(fixture("demo"))).snapshot)!;
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    for (const series of data.channels) for (const value of series.values) expect(value.metric.value === null || /^-?\d+\.\d{2}$/.test(value.metric.value), series.channel).toBe(true);
  });
});

describe("channelWeeks：手算 golden", () => {
  it("合成資料 4 通路：本期 3 週（最後一週 3 天、未滿 7 天），每格逐字等於手算值；LIVE 缺列的週是資料待補並帶原因碼", async () => {
    const data = channelWeeks((await snapshotOf(synthetic4ChannelInput())).snapshot)!;
    expect(data.weeks.map(week => [week.period.start, week.period.end, week.full])).toEqual([["2026-09-07", "2026-09-13", true], ["2026-09-14", "2026-09-20", true], ["2026-09-21", "2026-09-23", false]]);
    expect(valuesOf(data, "DTC")).toEqual(["16800.00", "16800.00", "7200.00"]);
    expect(valuesOf(data, "MARKETPLACE")).toEqual(["-2900.00", "-2900.00", "600.00"]);
    expect(valuesOf(data, "SOCIAL")).toEqual(["490.00", "6730.00", "210.00"]);
    expect(valuesOf(data, "LIVE")).toEqual(["7700.00", null, null]);
    const live = data.channels.find(series => series.channel === "LIVE")!.values;
    expect(live[1].metric.reason_codes).toContain("MISSING_CHANNEL_COST_DAY");
    expect(live[2].metric.reason_codes).toContain("MISSING_AD_DAY");
    expect(live[0].metric.reason_codes).toEqual([]);
  });

  it("golden 與 refund_only：本期 1 天＝1 週（未滿 7 天）；DTC 270.00、MARKETPLACE −15.00；refund_only DTC −60.00", async () => {
    const golden = channelWeeks((await snapshotOf(fixture("golden"))).snapshot)!;
    expect(golden.weeks).toEqual([{ label: expect.any(String), period: { start: "2026-08-02", end: "2026-08-02" }, full: false }]);
    expect(valuesOf(golden, "DTC")).toEqual(["270.00"]);
    expect(valuesOf(golden, "MARKETPLACE")).toEqual(["-15.00"]);
    const refundOnly = channelWeeks((await snapshotOf(fixture("refund_only"))).snapshot)!;
    expect(valuesOf(refundOnly, "DTC")).toEqual(["-60.00"]);
  });

  it("每通路逐週加總＝該通路本期合計（到分）：示範資料 6 週、合成資料、golden、zero_ad、refund_only；本期合計資料待補的通路，逐週也有資料待補", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden"), fixture("zero_ad"), fixture("refund_only")]) {
      const { snapshot } = await snapshotOf(input);
      const data = channelWeeks(snapshot)!;
      for (const channel of snapshot.report.scope.channels) {
        const total = snapshot.report.current.channels[channel].metrics.contribution_after_marketing.value;
        const weekly = sumWeeks(valuesOf(data, channel));
        expect(weekly, `${(input.manifest as Manifest).dataset_id} ${channel}`).toBe(total === null ? null : parseCents(total));
      }
    }
    const demo = channelWeeks((await snapshotOf(fixture("demo"))).snapshot)!;
    expect(demo.weeks).toHaveLength(6);
    expect(demo.weeks.every(week => week.full)).toBe(true);
  }, 30_000);

  it("每格逐字等於 domain：aggregatePeriod(dataset, 該週, [該通路]) 的扣廣告後貢獻與來源列（示範資料、合成資料、golden）", async () => {
    for (const input of [fixture("demo"), synthetic4ChannelInput(), fixture("golden")]) {
      const { dataset, snapshot } = await snapshotOf(input);
      const data = channelWeeks(snapshot)!;
      for (const series of data.channels) data.weeks.forEach((week, index) => {
        const domain = aggregatePeriod(dataset, week.period, [series.channel]).channels[series.channel];
        expect(series.values[index].metric, `${(input.manifest as Manifest).dataset_id} ${series.channel} ${week.period.start}`).toEqual(domain.metrics.contribution_after_marketing);
        expect(series.values[index].sources, `${(input.manifest as Manifest).dataset_id} ${series.channel} ${week.period.start}`).toEqual(domain.sources);
      });
    }
  }, 30_000);

  it("只選部分通路時，只算範圍內的通路（合成資料只選 DTC、SOCIAL）", async () => {
    const data = channelWeeks((await snapshotOf(synthetic4ChannelInput(), { channels: ["DTC", "SOCIAL"] })).snapshot)!;
    expect(data.channels.map(series => series.channel)).toEqual(["DTC", "SOCIAL"]);
    expect(valuesOf(data, "SOCIAL")).toEqual(["490.00", "6730.00", "210.00"]);
  });
});

describe("channelWeeks：上限與近 n 週", () => {
  it("通路 ≤ 8 才計算：8 通路照算（逐週加總＝本期合計），9 通路回傳 null（不計算）；逐日列不完整（daily_complete=false）也回傳 null", async () => {
    expect(CHANNEL_WEEKS_MAX_CHANNELS).toBe(8);
    const eight = (await snapshotOf(manyChannelsInput(8, 14))).snapshot;
    expect(channelWeeksAvailable(eight)).toBe(true);
    const data = channelWeeks(eight)!;
    expect(data.channels).toHaveLength(8);
    for (const channel of eight.report.scope.channels) expect(sumWeeks(valuesOf(data, channel)), channel).toBe(parseCents(eight.report.current.channels[channel].metrics.contribution_after_marketing.value));
    const nine = (await snapshotOf(manyChannelsInput(9, 14))).snapshot;
    expect(channelWeeksAvailable(nine)).toBe(false);
    expect(channelWeeks(nine)).toBeNull();
    const sparse = { ...eight, report: { ...eight.report, current: { ...eight.report.current, daily_complete: false } } };
    expect(channelWeeks(sparse)).toBeNull();
  }, 30_000);

  it("本期超過 8 週（92 天＝14 週，最後一週 1 天）：channelWeeks 回傳全部 14 週（逐週加總＝本期合計），recentChannelWeeks 只取最後 8 週、值逐格相同", async () => {
    const { snapshot } = await snapshotOf(manyChannelsInput(2, 92));
    const data = channelWeeks(snapshot)!;
    expect(data.weeks).toHaveLength(14);
    expect(data.weeks.at(-1)!.full).toBe(false);
    for (const channel of snapshot.report.scope.channels) expect(sumWeeks(valuesOf(data, channel)), channel).toBe(parseCents(snapshot.report.current.channels[channel].metrics.contribution_after_marketing.value));
    const recent = recentChannelWeeks(data);
    expect(CHANNEL_WEEKS_RECENT).toBe(8);
    expect(recent.weeks).toEqual(data.weeks.slice(-8));
    for (const series of recent.channels) expect(series.values).toEqual(data.channels.find(item => item.channel === series.channel)!.values.slice(-8));
    // 不滿 8 週時原樣。
    const demo = channelWeeks((await snapshotOf(fixture("demo"))).snapshot)!;
    expect(recentChannelWeeks(demo)).toEqual(demo);
  }, 30_000);
});

describe("50 通路 × 92 天（記憶體合成資料）：不進快照、健檢頁不計算也不渲染 G7b", () => {
  it("createSnapshot 不呼叫 channelWeeks、輸出沒有 channelWeeks；健檢頁 SSR 不呼叫 channelWeeks，沒有 sparkline 與「各通路每週」表，改為一句說明", async () => {
    const input = manyChannelsInput(50, 92);
    const { snapshot } = await snapshotOf(input);
    expect(snapshot.report.scope.channels).toHaveLength(50);
    expect(snapshot.weeks.filter(week => week.period === "current")).toHaveLength(14);
    expect(spy).not.toHaveBeenCalled();
    expect(Object.keys(snapshot)).not.toContain("channelWeeks");
    expect(JSON.stringify(snapshot, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)).not.toContain(CHANNEL_WEEKS_VERSION);
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined }));
    expect(spy).not.toHaveBeenCalled();
    expect(html).not.toContain("chart-diagnosis-channels-spark-");
    expect(html).not.toContain('data-chart-kind="spark"');
    expect(html).not.toContain(`data-testid="${CHANNEL_WEEKS_TABLE_TESTID}"`);
    expect(html).not.toContain('class="spark-head"');
    expect(html).toContain(`<p class="note channel-weeks-note" data-testid="${CHANNEL_WEEKS_TOO_MANY_TESTID}">${fill(labels.diagnosis.chartsV4.channelsSpark.tooMany, { max: CHANNEL_WEEKS_MAX_CHANNELS })}</p>`);
    // 通路寬表本身照常列出 50 個通路。
    expect(html.match(/<th role="rowheader" scope="row" class="channel-cell"/g)).toHaveLength(50);
  }, 60_000);

  it("對照：示範資料（2 通路）的健檢頁 SSR 恰好呼叫 channelWeeks 一次，畫出每通路一條 sparkline", async () => {
    const { snapshot } = await snapshotOf(fixture("demo"));
    expect(spy).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined }));
    expect(spy).toHaveBeenCalledTimes(1);
    for (const channel of snapshot.report.scope.channels) expect(html).toContain(`data-testid="chart-diagnosis-channels-spark-${channel}"`);
    expect(html).toContain(`data-testid="${CHANNEL_WEEKS_TABLE_TESTID}"`);
    expect(html).not.toContain(CHANNEL_WEEKS_TOO_MANY_TESTID);
  }, 30_000);
});
