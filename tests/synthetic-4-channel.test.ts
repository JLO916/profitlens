import { describe, expect, it } from "vitest";
import { productHighlights } from "@/application/product-highlights";
import { createSnapshot, hashInput } from "@/application/workspace";
import { analyzeDataset } from "@/domain/analysis";
import { dayCount } from "@/domain/date";
import { parseCents } from "@/domain/money";
import { compareProducts } from "@/domain/product-comparison";
import { analyzeScenarioSensitivity } from "@/domain/scenario-sensitivity";
import { buildScenarioBaseline, calculateScenario, type ScenarioInputs } from "@/domain/scenarios";
import { AMOUNT_FIELDS, type Dataset, type Metric } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-0b（D-V4-31）4 通路合成資料的載入與手算核對。設計說明見 tests/fixtures/synthetic-4-channel/README.md。
// 期望值全部是手算常數（每個數字旁附算式），不由 domain 或 application 函式算出；實際值才呼叫既有函式。
// 金額字串與 domain Metric.value 同格式（不含千分位、兩位小數、ASCII 負號）。

const CHANNELS = ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] as const;
type Channel = typeof CHANNELS[number];
const LAYERS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const;
type Layers = Record<typeof LAYERS[number], string | null>;

// 每通路兩期四層（每期 17 天；每日固定值見 README 第 2 節）。
const EXPECTED: Record<Channel, { previous: Layers; current: Layers }> = {
  DTC: {
    // 上期每日：淨營收 7,200 − 450 − 100 = 6,650；商品毛利 6,650 − 2,880 = 3,770；通路費用 520；廣告 1,200
    previous: {
      net_revenue: "113050.00", // 17 天 × 6,650
      gross_profit: "64090.00", // 17 天 × 3,770
      contribution_before_marketing: "55250.00", // 17 天 × (3,770 − 520)
      contribution_after_marketing: "34850.00", // 17 天 × (3,250 − 1,200)
    },
    // 本期每日：淨營收 8,500 − 500 − 100 = 7,900；商品毛利 7,900 − 3,400 = 4,500；通路費用 600；廣告 1,500
    current: {
      net_revenue: "134300.00", // 17 天 × 7,900
      gross_profit: "76500.00", // 17 天 × 4,500
      contribution_before_marketing: "66300.00", // 17 天 × (4,500 − 600)
      contribution_after_marketing: "40800.00", // 17 天 × (3,900 − 1,500)
    },
  },
  LIVE: {
    // 上期每日：淨營收 3,100 − 310 = 2,790；商品毛利 2,790 − 1,240 = 1,550；通路費用 280（17 天齊全）；廣告缺 8/30–9/02 共 4 天
    previous: {
      net_revenue: "47430.00", // 17 天 × 2,790
      gross_profit: "26350.00", // 17 天 × 1,550
      contribution_before_marketing: "21590.00", // 26,350 − 17 天 × 280
      contribution_after_marketing: null, // 廣告缺列，整期扣廣告後貢獻未知
    },
    // 本期每日：淨營收 3,900 − 390 = 3,510；商品毛利 3,510 − 1,560 = 1,950；通路費用缺 9/14–9/19 共 6 天、廣告缺 9/22
    current: {
      net_revenue: "59670.00", // 17 天 × 3,510
      gross_profit: "33150.00", // 17 天 × 1,950
      contribution_before_marketing: null, // 通路費用缺列
      contribution_after_marketing: null, // 通路費用與廣告都缺列
    },
  },
  MARKETPLACE: {
    // 上期每日：淨營收 6,300 − 600 = 5,700；商品毛利 5,700 − 3,250 = 2,450；通路費用 1,140；廣告 700
    previous: {
      net_revenue: "96900.00", // 17 天 × 5,700
      gross_profit: "41650.00", // 17 天 × 2,450
      contribution_before_marketing: "22270.00", // 41,650 − 17 天 × 1,140（19,380）
      contribution_after_marketing: "10370.00", // 22,270 − 17 天 × 700（11,900）
    },
    // 本期：固定三個 SKU 每日淨營收 4,500 − 800 = 3,700、商品毛利 3,700 − 2,450 = 1,250；SKU-203 另有 3 天只退款 600
    current: {
      net_revenue: "61100.00", // 17 天 × 3,700 − 3 × 600
      gross_profit: "19450.00", // 17 天 × 1,250 − 3 × 600
      contribution_before_marketing: "5000.00", // 19,450 − 17 天 × 850（14,450）
      contribution_after_marketing: "-5200.00", // 5,000 − 6 個檔期日 × 1,700（10,200）
    },
  },
  SOCIAL: {
    // 上期每日：淨營收 2,400 − 210 = 2,190；商品毛利 2,190 − 1,350 = 840；通路費用 425；廣告 180
    previous: {
      net_revenue: "37230.00", // 17 天 × 2,190
      gross_profit: "14280.00", // 17 天 × 840
      contribution_before_marketing: "7055.00", // 14,280 − 17 天 × 425（7,225）
      contribution_after_marketing: "3995.00", // 7,055 − 17 天 × 180（3,060）
    },
    // 本期每日：淨營收 2,700 − 330 = 2,370；商品毛利 2,370 − 1,640 = 730；平台抽成 16 天 × 240 − 6,000（9/15 沖回）＝ −2,160
    current: {
      net_revenue: "40290.00", // 17 天 × 2,370
      gross_profit: "12410.00", // 17 天 × 730
      contribution_before_marketing: "10830.00", // 12,410 −（−2,160 + 17 × 50 + 17 × 150 + 17 × 20）＝ 12,410 − 1,580
      contribution_after_marketing: "7430.00", // 10,830 − 17 天 × 200（3,400）
    },
  },
};

// 全部通路合計：LIVE 缺列讓上期扣廣告後貢獻、本期扣廣告前／後貢獻都是未知。
const EXPECTED_ALL: { previous: Layers; current: Layers } = {
  previous: {
    net_revenue: "294610.00", // 113,050 + 47,430 + 96,900 + 37,230
    gross_profit: "146370.00", // 64,090 + 26,350 + 41,650 + 14,280
    contribution_before_marketing: "106165.00", // 55,250 + 21,590 + 22,270 + 7,055
    contribution_after_marketing: null,
  },
  current: {
    net_revenue: "295360.00", // 134,300 + 59,670 + 61,100 + 40,290
    gross_profit: "141510.00", // 76,500 + 33,150 + 19,450 + 12,410
    contribution_before_marketing: null,
    contribution_after_marketing: null,
  },
};

const COST_GAP_DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]; // LIVE 通路費用缺 6 天
const AD_GAP_DATES = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-22"]; // LIVE 廣告缺 4 天（跨月）＋ 1 天

function load(): Dataset {
  const result = validateDataset(synthetic4ChannelInput());
  expect(result.classification).toBe("partial");
  return result.dataset!;
}
const layersOf = (metrics: Record<typeof LAYERS[number], Metric>): Layers => Object.fromEntries(LAYERS.map(layer => [layer, metrics[layer].value])) as Layers;

describe("V4-0b 4 通路合成資料（D-V4-31）", () => {
  it("經 validateDataset 載入為 partial，問題只有 LIVE 的費用與廣告缺列日", () => {
    const result = validateDataset(synthetic4ChannelInput());
    expect(result.classification).toBe("partial");
    expect(result.dataset).not.toBeNull();
    expect(result.unknownColumns).toEqual({});
    // 列數：銷售 上期 17 天 × 12 列 + 本期 17 天 × 11 列 + 3 列只退款 = 204 + 187 + 3；8/20 沒有銷售列
    expect(result.dataset!.sales).toHaveLength(394);
    // 通路費用 35 天 × 4 通路 − 6 天缺列；廣告 35 天 × 4 通路 − 5 天缺列
    expect(result.dataset!.costs).toHaveLength(134);
    expect(result.dataset!.ads).toHaveLength(135);
    expect(result.issues).toHaveLength(11);
    expect(result.issues.every(issue => issue.severity === "partial")).toBe(true);
    expect(result.issues.map(({ file, line, date, channel, field, severity, reason_code }) => ({ file, line, date, channel, field, severity, reason_code }))).toEqual([
      ...COST_GAP_DATES.map(date => ({ file: "channel_costs_daily.csv", line: null, date, channel: "LIVE", field: "$row", severity: "partial", reason_code: "MISSING_CHANNEL_COST_DAY" })),
      ...AD_GAP_DATES.map(date => ({ file: "ad_spend_daily.csv", line: null, date, channel: "LIVE", field: "$row", severity: "partial", reason_code: "MISSING_AD_DAY" })),
    ]);
    // 8/20 在涵蓋範圍內、在兩期之外：三份檔只有費用與廣告有列（全部 0.00），銷售無列
    expect(result.dataset!.sales.some(row => row.date === "2026-08-20")).toBe(false);
    expect(result.dataset!.costs.filter(row => row.date === "2026-08-20")).toHaveLength(4);
    expect(result.dataset!.ads.filter(row => row.date === "2026-08-20").map(row => row.ad_spend)).toEqual([0n, 0n, 0n, 0n]);
  });

  it("兩期各 17 天，本期結束在週三，最後一週只有 3 天（週從期間起日每 7 天一段）", async () => {
    const input = synthetic4ChannelInput();
    const dataset = load();
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    expect(dayCount(snapshot.report.scope.previous_period)).toBe(17);
    expect(dayCount(snapshot.report.scope.current_period)).toBe(17);
    expect(new Date(`${snapshot.report.scope.current_period.start}T00:00:00Z`).getUTCDay()).toBe(1); // 2026-09-07 週一
    expect(new Date(`${snapshot.report.scope.current_period.end}T00:00:00Z`).getUTCDay()).toBe(3); // 2026-09-23 週三
    expect(snapshot.weeks.map(({ period, start, end }) => ({ period, start, end }))).toEqual([
      { period: "previous", start: "2026-08-21", end: "2026-08-27" },
      { period: "previous", start: "2026-08-28", end: "2026-09-03" },
      { period: "previous", start: "2026-09-04", end: "2026-09-06" },
      { period: "current", start: "2026-09-07", end: "2026-09-13" },
      { period: "current", start: "2026-09-14", end: "2026-09-20" },
      { period: "current", start: "2026-09-21", end: "2026-09-23" },
    ]);
    const last = snapshot.weeks.filter(week => week.period === "current").at(-1)!;
    expect(dayCount(last)).toBe(3);
    // 本期每週淨營收（四通路每日 7,900 + 3,510 + 3,700 + 2,370 = 17,480，每週含一個 SKU-203 退款日 −600）
    expect(snapshot.weeks.filter(week => week.period === "current").map(week => week.metrics.net_revenue.value)).toEqual([
      "121760.00", // 7 天 × 17,480 − 600
      "121760.00", // 7 天 × 17,480 − 600
      "51840.00", // 3 天 × 17,480 − 600
    ]);
    // 本期每週扣廣告後貢獻：第 1 週四通路齊全；第 2 週 LIVE 缺費用、第 3 週 LIVE 缺 9/22 廣告
    expect(snapshot.weeks.filter(week => week.period === "current").map(week => week.metrics.contribution_after_marketing.value)).toEqual([
      "22090.00", // DTC 7 × 2,400 + LIVE 7 × 1,100 + MARKETPLACE（3 × 400 − 200 − 3 × 1,300）+ SOCIAL 7 × 70
      null,
      null,
    ]);
    // 上期每週扣廣告後貢獻：每日 DTC 2,050 + LIVE 870 + MARKETPLACE 610 + SOCIAL 235 = 3,765；第 2 週 LIVE 缺廣告
    expect(snapshot.weeks.filter(week => week.period === "previous").map(week => week.metrics.contribution_after_marketing.value)).toEqual([
      "26355.00", // 7 天 × 3,765
      null,
      "11295.00", // 3 天 × 3,765
    ]);
    // 涵蓋範圍沒有一年前的資料，去年同期不可用
    expect(snapshot.yoy?.status).toBe("unavailable");
  });

  it("每通路兩期四層與手算相符；缺列讓 LIVE 與全通路合計的相關層為 null", () => {
    const report = analyzeDataset(load());
    expect(report.scope.channels).toEqual([...CHANNELS]);
    for (const channel of CHANNELS) {
      expect({ channel, previous: layersOf(report.previous.channels[channel].metrics), current: layersOf(report.current.channels[channel].metrics) })
        .toEqual({ channel, ...EXPECTED[channel] });
    }
    expect({ previous: layersOf(report.previous.metrics), current: layersOf(report.current.metrics) }).toEqual(EXPECTED_ALL);
    // 缺值不是零：null 都帶缺列原因碼
    expect(report.previous.channels.LIVE.metrics.ad_spend).toEqual({ value: null, reason_codes: ["MISSING_AD_DAY"] });
    expect(report.previous.channels.LIVE.metrics.contribution_after_marketing.reason_codes).toEqual(["MISSING_AD_DAY"]);
    expect(report.current.channels.LIVE.metrics.contribution_before_marketing.reason_codes).toEqual(["MISSING_CHANNEL_COST_DAY"]);
    expect(report.current.channels.LIVE.metrics.contribution_after_marketing.reason_codes).toEqual(["MISSING_AD_DAY", "MISSING_CHANNEL_COST_DAY"]);
    expect(report.current.metrics.contribution_after_marketing.reason_codes).toEqual(["MISSING_AD_DAY", "MISSING_CHANNEL_COST_DAY"]);
    // 件數（兩期）：DTC 9／11、LIVE 3／4、MARKETPLACE 8／6、SOCIAL 8／9 件每日
    expect(report.previous.units_sold.value).toBe(476n); // 17 × (9 + 3 + 8 + 8)
    expect(report.current.units_sold.value).toBe(510n); // 17 × (11 + 4 + 6 + 9)，SKU-203 退款列件數 0
    expect(report.diagnostics.filter(item => item.code === "MISSING_CRITICAL_DATA").map(item => item.scope.channels)).toEqual([["DTC", "LIVE", "MARKETPLACE", "SOCIAL"], ["LIVE"]]);
  });

  it("MARKETPLACE 是唯一扣廣告後虧損的通路（兩期可算）", () => {
    const report = analyzeDataset(load());
    const negative = report.diagnostics.filter(item => item.code === "NEGATIVE_CHANNEL_CM");
    expect(negative.map(item => ({ channels: item.scope.channels, amount: item.ranking_amount?.value }))).toEqual([{ channels: ["MARKETPLACE"], amount: "-5200.00" }]);
    // 上期是正的 10,370，本期 −5,200（轉負）
    expect(report.previous.channels.MARKETPLACE.metrics.contribution_after_marketing.value).toBe("10370.00");
  });

  it("SOCIAL 是唯一扣項為負（平台抽成沖回）且淨營收為正的通路", () => {
    const dataset = load();
    const report = analyzeDataset(dataset);
    const negatives: string[] = [];
    for (const period of ["previous", "current"] as const) for (const channel of CHANNELS) {
      for (const field of AMOUNT_FIELDS.filter(name => name !== "gross_sales" && name !== "discounts" && name !== "refunds")) {
        const cents = parseCents(report[period].channels[channel].metrics[field].value);
        if (cents !== null && cents < 0n) negatives.push(`${period}:${channel}:${field}:${report[period].channels[channel].metrics[field].value}`);
      }
    }
    expect(negatives).toEqual(["current:SOCIAL:platform_fees:-2160.00"]); // 16 天 × 240 − 6,000
    expect(report.current.channels.SOCIAL.metrics.net_revenue.value).toBe("40290.00");
    // 沖回那一列可追溯到原始行號：channel_costs_daily.csv 第 107 行（表頭 1 行 + 8/20–9/14 共 26 天 × 4 − 1 列缺列 = 103 列）
    const reversal = dataset.costs.find(row => row.channel === "SOCIAL" && row.platform_fees !== null && row.platform_fees < 0n)!;
    expect(reversal).toMatchObject({ date: "2026-09-15", platform_fees: -600000n, source: { file: "channel_costs_daily.csv", line: 107 } });
    expect(report.current.channels.SOCIAL.sources).toContainEqual({ file: "channel_costs_daily.csv", line: 107, date: "2026-09-15", channel: "SOCIAL" });
    // 假設試算不接受負的已入帳沖回：SOCIAL 的 baseline 不適用
    const baseline = buildScenarioBaseline(report.current.channels.SOCIAL, true);
    expect(baseline.eligible).toBe(false);
    expect(baseline.reasons.map(reason => [reason.code, reason.field])).toEqual([["BASELINE_NEGATIVE_COST", "platform_fees"]]);
  });

  it("本期有 5 個商品毛利為負的 SKU，跨 MARKETPLACE 與 SOCIAL 兩個通路", () => {
    const dataset = load();
    const rows = compareProducts(dataset).rows;
    // 依本期商品毛利由小到大（同值依通路、SKU）；第 6 個起是非負
    const worst = productHighlights(rows).worstCurrent;
    expect(worst.slice(0, 5).map(row => [row.channel, row.sku, row.current.metrics.gross_profit.value])).toEqual([
      ["MARKETPLACE", "SKU-201", "-3400.00"], // 17 天 ×（1,000 − 400 − 800）
      ["SOCIAL", "SKU-301", "-2040.00"], // 17 天 ×（600 − 120 − 600）
      ["MARKETPLACE", "SKU-203", "-1800.00"], // 3 天只退款 × 600（無銷售、無成本）
      ["MARKETPLACE", "SKU-202", "-850.00"], // 17 天 ×（500 − 100 − 450）
      ["SOCIAL", "SKU-302", "-850.00"], // 17 天 ×（300 − 30 − 320）；與 MARKETPLACE SKU-202 同值，依通路排在後
    ]);
    expect(parseCents(worst[5].current.metrics.gross_profit.value)! >= 0n).toBe(true);
    // 累計（Pareto 用，V4-4 的 productPareto 以此為手算 golden）：逐筆相加實際值
    const running: string[] = [];
    let total = 0n;
    for (const row of worst.slice(0, 5)) { total += parseCents(row.current.metrics.gross_profit.value)!; running.push(total.toString()); }
    expect(running).toEqual(["-340000", "-544000", "-724000", "-809000", "-894000"]); // −3,400；−5,440；−7,240；−8,090；−8,940（分）
    // SKU-203 本期淨營收為負（只退款），商品毛利率不適用
    const refundOnly = rows.find(row => row.channel === "MARKETPLACE" && row.sku === "SKU-203")!;
    expect(refundOnly.current.metrics.net_revenue.value).toBe("-1800.00");
    expect(refundOnly.current.metrics.gross_margin.value).toBeNull();
    // 健檢規則：每個商品毛利為負的 SKU 各一條
    const report = analyzeDataset(dataset);
    expect(report.diagnostics.filter(item => item.code === "SKU_NEGATIVE_GP").map(item => `${item.scope.channels[0]}:${item.scope.sku}`).sort())
      .toEqual(["MARKETPLACE:SKU-201", "MARKETPLACE:SKU-202", "MARKETPLACE:SKU-203", "SOCIAL:SKU-301", "SOCIAL:SKU-302"]);
  });

  it("商品毛利兩期差額（通路 × SKU）與手算相符", () => {
    const rows = compareProducts(load()).rows;
    expect(rows.map(row => [row.channel, row.sku, row.previous.metrics.gross_profit.value, row.current.metrics.gross_profit.value, row.changes.gross_profit.value])).toEqual([
      ["DTC", "SKU-101", "28050.00", "37400.00", "9350.00"], // 17 ×（3,000 − 150 − 1,200）；17 ×（4,000 − 200 − 1,600）
      ["DTC", "SKU-102", "23800.00", "23800.00", "0.00"], // 兩期每日都是 3,000 − 300 − 100 − 1,200 = 1,400
      ["DTC", "SKU-103", "12240.00", "15300.00", "3060.00"], // 17 × 720；17 × 900
      ["LIVE", "SKU-102", "12750.00", "12750.00", "0.00"], // 兩期每日都是 1,500 − 150 − 600 = 750
      ["LIVE", "SKU-401", "13600.00", "20400.00", "6800.00"], // 17 × 800；17 × 1,200
      ["MARKETPLACE", "SKU-101", "34000.00", "25500.00", "-8500.00"], // 17 × 2,000；17 × 1,500
      ["MARKETPLACE", "SKU-201", "0.00", "-3400.00", "-3400.00"], // 上期每日 1,000 − 200 − 800 = 0
      ["MARKETPLACE", "SKU-202", "850.00", "-850.00", "-1700.00"], // 17 × 50；17 × −50
      ["MARKETPLACE", "SKU-203", "6800.00", "-1800.00", "-8600.00"], // 17 × 400；3 × −600
      ["SOCIAL", "SKU-103", "12750.00", "15300.00", "2550.00"], // 17 × 750；17 × 900
      ["SOCIAL", "SKU-301", "1020.00", "-2040.00", "-3060.00"], // 17 × 60；17 × −120
      ["SOCIAL", "SKU-302", "510.00", "-850.00", "-1360.00"], // 17 × 30；17 × −50
    ]);
  });

  it("本期每日扣廣告後貢獻（日 × 通路熱表的基礎）：MARKETPLACE 9 天虧、LIVE 7 天資料待補", () => {
    const report = analyzeDataset(load());
    expect(report.current.daily_complete).toBe(true);
    expect(report.current.daily).toHaveLength(68); // 17 天 × 4 通路
    const dates = Array.from({ length: 17 }, (_, index) => `2026-09-${String(7 + index).padStart(2, "0")}`);
    const refundDays = ["2026-09-08", "2026-09-15", "2026-09-22"]; // SKU-203 退款 600
    const campaignDays = ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-18", "2026-09-19", "2026-09-20"]; // 廣告 1,700
    const expected: Record<Channel, (string | null)[]> = {
      DTC: dates.map(() => "2400.00"), // 4,500 − 600 − 1,500
      LIVE: dates.map(date => COST_GAP_DATES.includes(date) || AD_GAP_DATES.includes(date) ? null : "1100.00"), // 1,950 − 350 − 500
      // 平日 1,250 − 850 − 0 = 400；退款日 400 − 600 = −200；檔期日 400 − 1,700 = −1,300
      MARKETPLACE: dates.map(date => refundDays.includes(date) ? "-200.00" : campaignDays.includes(date) ? "-1300.00" : "400.00"),
      // 平日 730 − 460 − 200 = 70；9/15 平台抽成 −6,000：730 −（−6,000 + 220）− 200 = 6,310
      SOCIAL: dates.map(date => date === "2026-09-15" ? "6310.00" : "70.00"),
    };
    for (const channel of CHANNELS) {
      const daily = report.current.daily.filter(row => row.channel === channel);
      expect({ channel, dates: daily.map(row => row.date), values: daily.map(row => row.metrics.contribution_after_marketing.value) }).toEqual({ channel, dates, values: expected[channel] });
    }
    const liveGap = report.current.daily.find(row => row.channel === "LIVE" && row.date === "2026-09-14")!;
    expect(liveGap.metrics.contribution_after_marketing.reason_codes).toEqual(["MISSING_CHANNEL_COST_DAY"]);
    expect(liveGap.sources).toContainEqual({ file: "channel_costs_daily.csv", line: null, date: "2026-09-14", channel: "LIVE" });
    const liveAdGap = report.current.daily.find(row => row.channel === "LIVE" && row.date === "2026-09-22")!;
    expect(liveAdGap.metrics.contribution_before_marketing.value).toBe("1600.00"); // 1,950 − 350：費用有列，只缺廣告
    expect(liveAdGap.metrics.contribution_after_marketing.reason_codes).toEqual(["MISSING_AD_DAY"]);
  });

  it("零貢獻門檻在 [−90%, +100%] 以外：MARKETPLACE 的方案（試算輸入只定義在測試內）", () => {
    const report = analyzeDataset(load());
    const baseline = buildScenarioBaseline(report.current.channels.MARKETPLACE, true);
    expect(baseline.eligible).toBe(true);
    // baseline：G 76,500、D 13,600、R 1,800、N 61,100、C 41,650、P 8,500、Q 1,360、F 4,250、O 340、A 10,200
    expect(baseline.amounts).toMatchObject({ gross_sales: "76500.00", discounts: "13600.00", refunds: "1800.00", net_revenue: "61100.00", cogs_net: "41650.00", platform_fees: "8500.00", payment_fees: "1360.00", fulfillment_costs: "4250.00", other_variable_costs: "340.00", ad_spend: "10200.00", contribution_after_marketing: "-5200.00" });
    // δ = f = 0 時 L ＝ N − P − Q − C − F − O ＝ 扣廣告前貢獻 5,000；B ＝ A ×（1 + a）+ K

    // 零變動（v、δ、f、a、K 都明填 0）：B = 10,200，零貢獻門檻 =（10,200 ÷ 5,000 − 1）× 100 = 104%
    const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
    const still = analyzeScenarioSensitivity(baseline, zero, ["", "", ""]);
    expect(still.status).toBe("valid");
    expect(still.coefficients).toMatchObject({ volume_coefficient: "5000.00", fixed_outflow: "10200.00", slope: "positive" });
    expect(still.targets).toMatchObject([
      { id: "zero_contribution", target: "0.00", status: "outside_range", threshold_pct: "104.000000000000", meets_target_when: "at_or_above", range_outcome: "all_below" },
      { id: "maintain_baseline", target: "-5200.00", status: "within_range", threshold_pct: "0.000000000000" },
    ]);

    // 測試內定義的方案「廣告加碼 20%、銷量 +10%」：B = 10,200 × 1.2 = 12,240
    const plan: ScenarioInputs = { ...zero, volume_change_pct: "10", ad_change_pct: "20" };
    const result = calculateScenario(baseline, plan);
    expect(result.status).toBe("valid");
    expect(result.contribution).toBe("-6740.00"); // 5,000 × 1.1 − 12,240
    expect(result.delta).toBe("-1540.00"); // −6,740 −（−5,200）
    const analysis = analyzeScenarioSensitivity(baseline, plan, ["0", "50", "100"]);
    expect(analysis.coefficients).toMatchObject({ volume_coefficient: "5000.00", fixed_outflow: "12240.00", slope: "positive" });
    expect(analysis.targets).toMatchObject([
      // 零貢獻門檻 =（12,240 ÷ 5,000 − 1）× 100 = 144.8%，超出 +100%；範圍內全部低於零
      { id: "zero_contribution", status: "outside_range", threshold_pct: "144.800000000000", range_outcome: "all_below" },
      // 維持原貢獻門檻 =（（−5,200 + 12,240）÷ 5,000 − 1）× 100 = 40.8%，在範圍內
      { id: "maintain_baseline", status: "within_range", threshold_pct: "40.800000000000", range_outcome: "crosses_target" },
    ]);
    // 三個明填銷量假設：5,000 ×（1 + v）− 12,240
    expect(analysis.sensitivity.rows.map(row => row.result.contribution)).toEqual(["-7240.00", "-4740.00", "-2240.00"]);
  });

  it("排除 LIVE 時三通路兩期四層都可算，九項橋接對齊", () => {
    const report = analyzeDataset(load(), { channels: ["DTC", "MARKETPLACE", "SOCIAL"] });
    expect({ previous: layersOf(report.previous.metrics), current: layersOf(report.current.metrics) }).toEqual({
      previous: { net_revenue: "247180.00", gross_profit: "120020.00", contribution_before_marketing: "84575.00", contribution_after_marketing: "49215.00" }, // 三通路上期相加
      current: { net_revenue: "235690.00", gross_profit: "108360.00", contribution_before_marketing: "82130.00", contribution_after_marketing: "43030.00" }, // 三通路本期相加
    });
    // 橋接（收入差取正、扣項差取負），三通路上期／本期：G 270,300／266,900；D 21,420／27,710；R 1,700／3,500；C 127,160／127,330；
    // P 15,300／6,340；Q 5,083／4,930；F 13,600／13,600；O 1,462／1,360；A 35,360／39,100
    expect(Object.fromEntries(AMOUNT_FIELDS.map(field => [field, report.bridge.components[field].value]))).toEqual({
      gross_sales: "-3400.00", discounts: "-6290.00", refunds: "-1800.00", cogs_net: "-170.00",
      platform_fees: "8960.00", payment_fees: "153.00", fulfillment_costs: "0.00", other_variable_costs: "102.00", ad_spend: "-3740.00",
    });
    expect(report.bridge.sum.value).toBe("-6185.00"); // 43,030 − 49,215
    expect(report.bridge.reconciled).toBe(true);
    // 全通路（含 LIVE）時橋接合計未知，不補零
    expect(analyzeDataset(load()).bridge.sum.value).toBeNull();
  });
});
