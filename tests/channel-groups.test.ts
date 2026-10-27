import { describe, expect, it } from "vitest";
import { AnalysisChannelLimitError } from "@/application/limits";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { aggregatePeriod, sumCounts, sumTotals } from "@/domain/aggregation";
import { analyzeProducts } from "@/domain/analysis";
import { buildBridge } from "@/domain/bridge";
import { calculateMetrics } from "@/domain/metrics";
import { formatCents, parseCents } from "@/domain/money";
import { AMOUNT_FIELDS, MONEY_METRICS, type Dataset, type DatasetInput, type Metrics } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { SYNTHETIC_CHANNEL_SETTINGS } from "./helpers/page-states";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V42-2a 第 6 項（docs/revamp-v4.2/06_BATCHES.md V42-2a；PRD §1.2 第 6 點、§4.1；設計 §6）：群組層的精確性。
// 群組沒有 Scope.kind "group"（D-V42-12）：群組範圍＝createSnapshot 帶成員清單，四層金額全部由既有 domain 函式（aggregatePeriod 子集）算出（A 級，不加版本常數）。
// 這裡只拿既有 domain 函式對帳：群組＝成員逐通路 totals 的 bigint 和、分割成兩個群組的和＝全部通路、null 傳遞、橋接 reconciled、INVALID_CHANNEL_FILTER、
// daily_complete、filter_hash。金額一律 bigint／字串精確比對（parseCents／formatCents），不用 Number；手算常數旁附算式（tests/fixtures/synthetic-4-channel/README.md §4.1）。
// 通路設定（SYNTHETIC_CHANNEL_SETTINGS：g1 自有＝DTC＋SOCIAL、g2 平台＝MARKETPLACE＋LIVE）只讓快照多帶 channel_names／channel_groups，不影響任何金額。
// V42-2b 的群組合計列（src/application/channel-groups.ts）之後在同一檔加「群組列」部分；本批只有精確性。

type Loaded = { dataset: Dataset; hash: string };
const PERIODS = ["previous", "current"] as const;
type PeriodKey = typeof PERIODS[number];
const LAYERS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const;
type Layers = Record<typeof LAYERS[number], string | null>;
const COST_GAP_DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]; // LIVE 本期通路費用缺 6 天
const AD_GAP_PREVIOUS = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]; // LIVE 上期廣告缺 4 天（跨月）
const AD_GAP_CURRENT = ["2026-09-22"]; // LIVE 本期廣告缺 1 天

async function load(input: DatasetInput): Promise<Loaded> {
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  return { dataset: result.dataset!, hash: await hashInput(input) };
}
const layersOf = (metrics: Metrics): Layers => Object.fromEntries(LAYERS.map(layer => [layer, metrics[layer].value])) as Layers;
/** 成員逐通路金額的 bigint 和；任一成員未知 → null。測試自己加（不呼叫被測的 sumAmounts），不用 Number。 */
function sumCents(values: readonly (bigint | null)[]): bigint | null {
  return values.some(value => value === null) ? null : values.reduce<bigint>((total, value) => total + value!, 0n);
}
const memberTotals = (snapshot: WorkspaceSnapshot, period: PeriodKey, members: readonly string[]) => members.map(code => snapshot.report[period].channels[code].totals);
const dailyKey = (row: { date: string; channel: string }) => JSON.stringify([row.date, row.channel]);
const byDailyKey = (a: { date: string; channel: string }, b: { date: string; channel: string }) => (dailyKey(a) < dailyKey(b) ? -1 : dailyKey(a) > dailyKey(b) ? 1 : 0);

const CASES: { name: string; load: () => Promise<Loaded>; members: string[]; settings: typeof SYNTHETIC_CHANNEL_SETTINGS | null }[] = [
  { name: "golden 全部通路 DTC＋MARKETPLACE", load: () => load(fixture("golden")), members: ["DTC", "MARKETPLACE"], settings: null },
  { name: "demo 單一通路 [DTC]", load: () => load(fixture("demo")), members: ["DTC"], settings: null },
  { name: "synthetic-4-channel {DTC, MARKETPLACE}（成員倒序傳入）", load: () => load(synthetic4ChannelInput()), members: ["MARKETPLACE", "DTC"], settings: SYNTHETIC_CHANNEL_SETTINGS },
  { name: "synthetic-4-channel {LIVE, SOCIAL}（LIVE 有缺列）", load: () => load(synthetic4ChannelInput()), members: ["SOCIAL", "LIVE"], settings: SYNTHETIC_CHANNEL_SETTINGS },
];

describe("V42-2a 精確性：群組＝成員的 domain 合計（PRD §1.2 第 6 點；A 級，只呼叫既有 domain 函式）", () => {
  it.each(CASES)("V42-2a 精確性：群組＝成員 bigint 和（$name）", async ({ load: loadCase, members, settings }) => {
    const { dataset, hash } = await loadCase();
    const all = await createSnapshot(dataset, {}, hash, settings);
    const group = await createSnapshot(dataset, { channels: [...members] }, hash, settings);
    const sorted = [...members].sort();
    expect(group.report.scope.channels).toEqual(sorted);
    expect(group.metric_version).toBe("contribution-v1");
    for (const period of PERIODS) {
      const totals = memberTotals(all, period, sorted);
      // 每個金額欄位：群組 cents＝成員逐通路 cents 的 bigint 和；任一成員未知 → null（不是 0）
      for (const field of AMOUNT_FIELDS) expect(group.report[period].totals[field].cents, `${period}.${field}`).toBe(sumCents(totals.map(total => total[field].cents)));
      // 連原因碼：群組 totals＝domain 的 sumTotals(成員 totals)；比率＝calculateMetrics(同一份和)
      expect(group.report[period].totals).toEqual(sumTotals(totals));
      expect(group.report[period].metrics).toEqual(calculateMetrics(sumTotals(totals)));
      // 金額指標的字串：成員值 parseCents 相加再 formatCents，逐字相同
      for (const metric of MONEY_METRICS) {
        const cents = sumCents(sorted.map(code => parseCents(all.report[period].channels[code].metrics[metric].value)));
        expect(group.report[period].metrics[metric].value, `${period}.${metric}`).toBe(cents === null ? null : formatCents(cents));
      }
      // 群組快照裡每個成員的逐通路摘要＝全部通路快照的同一通路（通路彙總不受其他通路影響）；沒有多出來的通路
      for (const code of sorted) expect(group.report[period].channels[code], `${period}.${code}`).toEqual(all.report[period].channels[code]);
      expect(Object.keys(group.report[period].channels)).toEqual(sorted);
      // 件數也是成員的和（domain 的 sumCounts）
      expect(group.report[period].units_sold).toEqual(sumCounts(sorted.map(code => all.report[period].channels[code].units_sold)));
      // 整期＝domain 的 aggregatePeriod 子集（不是跨列相加）；daily 是全部通路 daily 裡屬於成員的列
      expect(group.report[period]).toEqual(aggregatePeriod(dataset, group.report[period].period, sorted));
      expect(group.report[period].daily).toEqual(all.report[period].daily.filter(row => sorted.includes(row.channel)));
    }
    // 商品毛利頁的資料同樣只含成員（analyzeProducts 子集）
    expect(group.products).toEqual(analyzeProducts(dataset, { period: group.report.scope.current_period, channels: sorted }));
    expect(group.products.rows.every(row => sorted.includes(row.channel))).toBe(true);
  });

  it("V42-2a 精確性：synthetic {DTC, MARKETPLACE} 兩期四層＝手算（README §4.1 兩通路相加）", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const group = await createSnapshot(dataset, { channels: ["DTC", "MARKETPLACE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    expect(layersOf(group.report.previous.metrics)).toEqual({
      net_revenue: "209950.00", // DTC 113,050 + MARKETPLACE 96,900
      gross_profit: "105740.00", // 64,090 + 41,650
      contribution_before_marketing: "77520.00", // 55,250 + 22,270
      contribution_after_marketing: "45220.00", // 34,850 + 10,370
    });
    expect(layersOf(group.report.current.metrics)).toEqual({
      net_revenue: "195400.00", // 134,300 + 61,100
      gross_profit: "95950.00", // 76,500 + 19,450
      contribution_before_marketing: "71300.00", // 66,300 + 5,000
      contribution_after_marketing: "35600.00", // 40,800 + (−5,200)
    });
    expect(group.report.previous.units_sold.value).toBe(289n); // 17 × (9 + 8)
    expect(group.report.current.units_sold.value).toBe(289n); // 17 × (11 + 6)
  });

  it("V42-2a 精確性：分割＝全部——{DTC, SOCIAL}（g1）＋{LIVE, MARKETPLACE}（g2）兩個群組的 totals 和＝全部通路的 totals（兩期）", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const all = await createSnapshot(dataset, {}, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const g1 = await createSnapshot(dataset, { channels: ["DTC", "SOCIAL"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const g2 = await createSnapshot(dataset, { channels: ["MARKETPLACE", "LIVE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    // 兩份快照的範圍就是設定裡兩個群組的成員集合（排序後）
    expect(all.channel_groups?.map(group => [group.id, group.members])).toEqual([["g1", g1.report.scope.channels], ["g2", g2.report.scope.channels]]);
    expect([...g1.report.scope.channels, ...g2.report.scope.channels].sort()).toEqual(all.report.scope.channels);
    for (const period of PERIODS) {
      const parts = [g1.report[period].totals, g2.report[period].totals];
      for (const field of AMOUNT_FIELDS) expect(sumCents(parts.map(total => total[field].cents)), `${period}.${field}`).toBe(all.report[period].totals[field].cents);
      expect(sumTotals(parts)).toEqual(all.report[period].totals);
      expect(calculateMetrics(sumTotals(parts))).toEqual(all.report[period].metrics);
      expect(sumCounts([g1.report[period].units_sold, g2.report[period].units_sold])).toEqual(all.report[period].units_sold);
      // 日 × 通路列不重疊、不遺漏
      expect([...g1.report[period].daily, ...g2.report[period].daily].sort(byDailyKey)).toEqual(all.report[period].daily);
    }
    // 手算（README §4.1）：g1 兩期四層可算；g2 含 LIVE，扣廣告後貢獻兩期都未知、本期扣廣告前貢獻也未知
    expect(layersOf(g1.report.previous.metrics)).toEqual({ net_revenue: "150280.00" /* 113,050 + 37,230 */, gross_profit: "78370.00" /* 64,090 + 14,280 */, contribution_before_marketing: "62305.00" /* 55,250 + 7,055 */, contribution_after_marketing: "38845.00" /* 34,850 + 3,995 */ });
    expect(layersOf(g1.report.current.metrics)).toEqual({ net_revenue: "174590.00" /* 134,300 + 40,290 */, gross_profit: "88910.00" /* 76,500 + 12,410 */, contribution_before_marketing: "77130.00" /* 66,300 + 10,830 */, contribution_after_marketing: "48230.00" /* 40,800 + 7,430 */ });
    expect(layersOf(g2.report.previous.metrics)).toEqual({ net_revenue: "144330.00" /* 47,430 + 96,900 */, gross_profit: "68000.00" /* 26,350 + 41,650 */, contribution_before_marketing: "43860.00" /* 21,590 + 22,270 */, contribution_after_marketing: null });
    expect(layersOf(g2.report.current.metrics)).toEqual({ net_revenue: "120770.00" /* 59,670 + 61,100 */, gross_profit: "52600.00" /* 33,150 + 19,450 */, contribution_before_marketing: null, contribution_after_marketing: null });
    // g1 ＋ g2 ＝ README 的全通路：上期 294,610.00／146,370.00／106,165.00、本期 295,360.00／141,510.00
    expect(layersOf(all.report.previous.metrics)).toEqual({ net_revenue: "294610.00", gross_profit: "146370.00", contribution_before_marketing: "106165.00", contribution_after_marketing: null });
    expect(layersOf(all.report.current.metrics)).toEqual({ net_revenue: "295360.00", gross_profit: "141510.00", contribution_before_marketing: null, contribution_after_marketing: null });
  });

  it("V42-2a 精確性：null 傳遞——{LIVE, SOCIAL} 的本期扣廣告後貢獻是 null 並帶 LIVE 的缺列原因碼；可算的層仍是精確和，SOCIAL 自己的值不變", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const group = await createSnapshot(dataset, { channels: ["LIVE", "SOCIAL"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    expect(group.report.current.metrics.contribution_after_marketing).toEqual({ value: null, reason_codes: ["MISSING_AD_DAY", "MISSING_CHANNEL_COST_DAY"] });
    expect(group.report.current.metrics.contribution_before_marketing).toEqual({ value: null, reason_codes: ["MISSING_CHANNEL_COST_DAY"] });
    expect(group.report.previous.metrics.contribution_after_marketing).toEqual({ value: null, reason_codes: ["MISSING_AD_DAY"] });
    expect(group.report.previous.metrics.contribution_before_marketing.reason_codes).toEqual([]);
    expect(layersOf(group.report.previous.metrics)).toEqual({ net_revenue: "84660.00" /* 47,430 + 37,230 */, gross_profit: "40630.00" /* 26,350 + 14,280 */, contribution_before_marketing: "28645.00" /* 21,590 + 7,055 */, contribution_after_marketing: null });
    expect(layersOf(group.report.current.metrics)).toEqual({ net_revenue: "99960.00" /* 59,670 + 40,290 */, gross_profit: "45560.00" /* 33,150 + 12,410 */, contribution_before_marketing: null, contribution_after_marketing: null });
    // 未知的欄位：SOCIAL 已知 + LIVE null → null（不是把 LIVE 當 0 只加 SOCIAL）
    expect(group.report.current.totals.ad_spend).toEqual({ cents: null, reason_codes: ["MISSING_AD_DAY"] });
    expect(group.report.current.channels.SOCIAL.totals.ad_spend).toEqual({ cents: 340000n, reason_codes: [] }); // 17 天 × 200
    expect(group.report.current.channels.LIVE.totals.ad_spend).toEqual({ cents: null, reason_codes: ["MISSING_AD_DAY"] });
    expect(group.report.current.channels.SOCIAL.metrics.contribution_after_marketing.value).toBe("7430.00");
    expect(group.report.current.channels.LIVE.metrics.contribution_after_marketing.value).toBeNull();
    // 關鍵資料缺漏的健檢：群組範圍（kind "all" 帶成員）與 LIVE 各一條；群組範圍沒有 NEGATIVE_CHANNEL_CM（D-V42-12，只對 kind "channel"）
    expect(group.report.diagnostics.filter(item => item.code === "MISSING_CRITICAL_DATA").map(item => item.scope)).toEqual([{ kind: "all", channels: ["LIVE", "SOCIAL"] }, { kind: "channel", channels: ["LIVE"] }]);
    expect(group.report.diagnostics.filter(item => item.code === "NEGATIVE_CHANNEL_CM" && item.scope.kind === "all")).toEqual([]);
  });

  it("V42-2a 精確性：橋接——群組快照的 report.bridge＝buildBridge(成員 totals 和)；可算的群組 reconciled === true，含缺列成員的群組是 null（不是 false）", async () => {
    const golden = await load(fixture("golden"));
    const demo = await load(fixture("demo"));
    const synthetic = await load(synthetic4ChannelInput());
    const bridges: { name: string; loaded: Loaded; members: string[]; settings: typeof SYNTHETIC_CHANNEL_SETTINGS | null; reconciled: boolean | null; sum: string | null }[] = [
      { name: "golden 全部通路", loaded: golden, members: ["DTC", "MARKETPLACE"], settings: null, reconciled: true, sum: "-315.00" }, // 本期 255.00 − 上期 570.00（fixtures/golden/expected.json 的 bridge.sum）
      { name: "demo [DTC]", loaded: demo, members: ["DTC"], settings: null, reconciled: true, sum: null },
      { name: "synthetic {DTC, MARKETPLACE}", loaded: synthetic, members: ["DTC", "MARKETPLACE"], settings: SYNTHETIC_CHANNEL_SETTINGS, reconciled: true, sum: "-9620.00" }, // 35,600 − 45,220
      { name: "synthetic g1 {DTC, SOCIAL}", loaded: synthetic, members: ["DTC", "SOCIAL"], settings: SYNTHETIC_CHANNEL_SETTINGS, reconciled: true, sum: "9385.00" }, // 48,230 − 38,845
      { name: "synthetic g2 {LIVE, MARKETPLACE}", loaded: synthetic, members: ["LIVE", "MARKETPLACE"], settings: SYNTHETIC_CHANNEL_SETTINGS, reconciled: null, sum: null },
      { name: "synthetic {LIVE, SOCIAL}", loaded: synthetic, members: ["LIVE", "SOCIAL"], settings: SYNTHETIC_CHANNEL_SETTINGS, reconciled: null, sum: null },
    ];
    for (const { name, loaded, members, settings, reconciled, sum } of bridges) {
      const all = await createSnapshot(loaded.dataset, {}, loaded.hash, settings);
      const group = await createSnapshot(loaded.dataset, { channels: members }, loaded.hash, settings);
      const bridge = group.report.bridge;
      expect(bridge.reconciled, name).toBe(reconciled);
      expect(bridge.interpretation, name).toBe("observed_amount_changes_not_causality");
      // 同一份成員 totals 和丟進 buildBridge 得到同一個橋接；群組快照自己的兩期 totals 也一樣
      expect(bridge, name).toEqual(buildBridge(sumTotals(memberTotals(all, "previous", members)), sumTotals(memberTotals(all, "current", members))));
      expect(bridge, name).toEqual(buildBridge(group.report.previous.totals, group.report.current.totals));
      // 恆等式：九項和＝扣廣告後貢獻差額（成員兩期扣廣告後貢獻 parseCents 相減）；任一期未知 → 兩者都 null
      const before = sumCents(members.map(code => parseCents(all.report.previous.channels[code].metrics.contribution_after_marketing.value)));
      const after = sumCents(members.map(code => parseCents(all.report.current.channels[code].metrics.contribution_after_marketing.value)));
      const change = before === null || after === null ? null : formatCents(after - before);
      expect(bridge.contribution_change.value, name).toBe(change);
      expect(bridge.sum.value, name).toBe(reconciled === true ? change : null);
      if (sum !== null) expect(bridge.sum.value, name).toBe(sum);
      // 九項每一項＝成員逐通路差額的和（收入差取正、扣項差取負）
      for (const field of AMOUNT_FIELDS) {
        const sign = field === "gross_sales" ? 1n : -1n;
        const cents = sumCents(members.map(code => {
          const prev = all.report.previous.channels[code].totals[field].cents, cur = all.report.current.channels[code].totals[field].cents;
          return prev === null || cur === null ? null : sign * (cur - prev);
        }));
        expect(bridge.components[field].value, `${name}.${field}`).toBe(cents === null ? null : formatCents(cents));
      }
    }
  });

  it("V42-2a 精確性：createSnapshot 帶未知代碼、空陣列、重複成員、群組 id 或群組名 → RangeError(\"INVALID_CHANNEL_FILTER\")（src/domain/analysis.ts 的 selectChannels，不是 limits.ts 的通路數上限）", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const g1 = SYNTHETIC_CHANNEL_SETTINGS.groups[0];
    const invalid: string[][] = [["NOPE"], [], ["DTC", "DTC"], ["DTC", "NOPE"], ["dtc"], [g1.id], [g1.label], ["DTC", g1.id]];
    for (const channels of invalid) {
      const error = await createSnapshot(dataset, { channels }, hash, SYNTHETIC_CHANNEL_SETTINGS).catch((reason: unknown) => reason);
      expect(error, JSON.stringify(channels)).toBeInstanceOf(RangeError);
      expect((error as Error).message, JSON.stringify(channels)).toBe("INVALID_CHANNEL_FILTER");
      expect(error, JSON.stringify(channels)).not.toBeInstanceOf(AnalysisChannelLimitError);
      // 同一條驗證也在 aggregatePeriod（群組合計列之後會直接呼叫它）
      expect(() => aggregatePeriod(dataset, dataset.manifest.current_period, channels), JSON.stringify(channels)).toThrow(new RangeError("INVALID_CHANNEL_FILTER"));
    }
    // 成員全部合法時不會丟（含單一成員）
    await expect(createSnapshot(dataset, { channels: ["DTC", "SOCIAL"] }, hash, SYNTHETIC_CHANNEL_SETTINGS)).resolves.toBeDefined();
    await expect(createSnapshot(dataset, { channels: ["LIVE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS)).resolves.toBeDefined();
  });

  it("V42-2a 精確性：daily_complete——LIVE 有缺列、SOCIAL 齊全，{LIVE, SOCIAL} 的 daily 仍是完整的日 × 通路格（17 × 2），缺列格是 null 帶原因碼，合計仍＝逐通路和", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const all = await createSnapshot(dataset, {}, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const group = await createSnapshot(dataset, { channels: ["SOCIAL", "LIVE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    for (const period of PERIODS) {
      expect(group.report[period].daily_complete, period).toBe(true);
      expect(all.report[period].daily_complete, period).toBe(true);
      expect(group.report[period].daily, period).toHaveLength(34); // 17 天 × 2 通路，缺列日也有格
      expect(group.report[period].daily.filter(row => row.channel === "SOCIAL").every(row => AMOUNT_FIELDS.every(field => row.totals[field].cents !== null)), period).toBe(true);
      // 群組的 daily＝全部通路快照 daily 中屬於成員的列（含缺列格的原因碼與來源）
      expect(group.report[period].daily, period).toEqual(all.report[period].daily.filter(row => row.channel === "LIVE" || row.channel === "SOCIAL"));
      // 合計＝逐通路和：SOCIAL 的已知值 + LIVE 的 null → null；兩者都已知的欄位是 bigint 和
      for (const field of AMOUNT_FIELDS) expect(group.report[period].totals[field].cents, `${period}.${field}`).toBe(sumCents([group.report[period].channels.LIVE.totals[field].cents, group.report[period].channels.SOCIAL.totals[field].cents]));
    }
    const missing = (period: PeriodKey, field: "platform_fees" | "ad_spend") => group.report[period].daily.filter(row => row.channel === "LIVE" && row.totals[field].cents === null).map(row => row.date);
    expect(missing("current", "platform_fees")).toEqual(COST_GAP_DATES);
    expect(missing("previous", "platform_fees")).toEqual([]);
    expect(missing("previous", "ad_spend")).toEqual(AD_GAP_PREVIOUS);
    expect(missing("current", "ad_spend")).toEqual(AD_GAP_CURRENT);
    const gap = group.report.current.daily.find(row => row.channel === "LIVE" && row.date === COST_GAP_DATES[0])!;
    expect(gap.totals.platform_fees).toEqual({ cents: null, reason_codes: ["MISSING_CHANNEL_COST_DAY"] });
    expect(gap.sources).toContainEqual({ file: "channel_costs_daily.csv", line: null, date: COST_GAP_DATES[0], channel: "LIVE" });
    // 逐通路：LIVE 本期四項費用與廣告未知、SOCIAL 全部已知；群組的費用欄位因此未知
    expect(group.report.current.channels.LIVE.totals.platform_fees).toEqual({ cents: null, reason_codes: ["MISSING_CHANNEL_COST_DAY"] });
    expect(group.report.current.channels.SOCIAL.totals.platform_fees).toEqual({ cents: -216000n, reason_codes: [] }); // 16 天 × 240 − 6,000（9/15 沖回）
    expect(group.report.current.totals.platform_fees).toEqual({ cents: null, reason_codes: ["MISSING_CHANNEL_COST_DAY"] });
    expect(group.report.current.totals.gross_sales).toEqual({ cents: 11220000n, reason_codes: [] }); // LIVE 66,300 + SOCIAL 45,900
  });

  it("V42-2a 精確性：filter_hash——成員任意順序 → 相同（scope.channels 排序後相同）；成員不同 → 不同；通路設定與群組不進 hash、不改任何金額", async () => {
    const { dataset, hash } = await load(synthetic4ChannelInput());
    const g1 = await createSnapshot(dataset, { channels: ["DTC", "SOCIAL"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const reversed = await createSnapshot(dataset, { channels: ["SOCIAL", "DTC"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const plain = await createSnapshot(dataset, { channels: ["SOCIAL", "DTC"] }, hash);
    const g2 = await createSnapshot(dataset, { channels: ["MARKETPLACE", "LIVE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const other = await createSnapshot(dataset, { channels: ["DTC", "MARKETPLACE"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const single = await createSnapshot(dataset, { channels: ["DTC"] }, hash, SYNTHETIC_CHANNEL_SETTINGS);
    const all = await createSnapshot(dataset, {}, hash, SYNTHETIC_CHANNEL_SETTINGS);
    expect(g1.report.scope.channels).toEqual(["DTC", "SOCIAL"]);
    expect(reversed.report.scope).toEqual(g1.report.scope);
    expect(g1.filter_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(reversed.filter_hash).toBe(g1.filter_hash);
    expect(plain.filter_hash).toBe(g1.filter_hash);
    expect(new Set([g1.filter_hash, g2.filter_hash, other.filter_hash, single.filter_hash, all.filter_hash]).size).toBe(5);
    expect([g1, reversed, plain, g2, other, single, all].every(snapshot => snapshot.dataset_hash === hash)).toBe(true);
    // 設定只多出 channel_names／channel_groups 兩個鍵；report、products、weeks 逐字相同
    expect(plain.channel_groups).toBeUndefined();
    expect(plain.channel_names).toBeUndefined();
    expect(g1.channel_groups?.map(group => [group.id, group.members])).toEqual([["g1", ["DTC", "SOCIAL"]], ["g2", ["LIVE", "MARKETPLACE"]]]);
    expect(reversed.report).toEqual(plain.report);
    expect(reversed.products).toEqual(plain.products);
    expect(reversed.weeks).toEqual(plain.weeks);
    expect(Object.keys(g1).sort()).toEqual(["channel_groups", "channel_names", "data_as_of", "dataset_hash", "filter_hash", "metric_version", "products", "report", "weeks", "yoy"]);
  });
});
