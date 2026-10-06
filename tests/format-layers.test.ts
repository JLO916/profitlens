import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { formatHeadlineAmount } from "@/application/copy";
import {
  MINUS, asciiMinus, deltaTone, deltaToneLabel, deltaWord, emptyKindOf, favorableDirectionOf, formatAmount, formatAmountL1, formatAmountL2, formatAmountL3, formatCount, formatDateL1, formatEmpty, formatGrowth,
  formatMetric, formatMetricDelta, formatMultiple, formatPerUnit, formatPeriodExport, formatPeriodL1, formatRateChange, formatRateL1, formatRateL2, formatRateL3, formatRateLayer, formatRatePoints, formatSignedDelta,
  formatSignedRate, metricDefinitions, periodDays, type DirectionalMetric, type FavorableDirection, type Layer,
} from "@/application/presentation";
import { fill, labels } from "@/i18n";
import type { MetricName } from "@/domain/types";
import summary from "../fixtures/demo/computed_summary.json";

// V3-2b 三層數字格式（PRD §8.5 表格與 9 條規則、§8.6 日期、§8.7 標點）。
// 數字取自 fixtures/demo/computed_summary.json（示範資料的手算參考值）；比率與 domain 的 ratioMetric 一樣先算成 12 位小數字串再交給格式化函式。

const cur = summary.current, prev = summary.previous;
/** 與 src/domain/money.ts ratioMetric 相同：分子 ÷ 分母，ROUND_HALF_UP 取 12 位小數。 */
const ratio = (numerator: string, denominator: string) => new Decimal(numerator).div(denominator).toFixed(12, Decimal.ROUND_HALF_UP);
const minus = (a: string, b: string) => new Decimal(a).minus(b).toFixed(2);

const ΔN = minus(cur.net_revenue, prev.net_revenue); // 1709082.18
const ΔCM = minus(cur.contribution_after_marketing, prev.contribution_after_marketing); // -598833.95
const cmMarginCur = ratio(cur.contribution_after_marketing, cur.net_revenue); // 0.161745…
const cmMarginPrev = ratio(prev.contribution_after_marketing, prev.net_revenue); // 0.304256…
const mer = ratio(cur.net_revenue, cur.ad_spend); // 11.3989…
const UNITS = "7420";
const perUnit = new Decimal(cur.net_revenue).div(UNITS).toFixed(2, Decimal.ROUND_HALF_UP); // 1058.04

describe("§8.5 表格：每一列的 L1／L2／L3", () => {
  it("示範值的前提（不是格式化，只確認測試用的數字）", () => {
    expect(cur.net_revenue).toBe("7850657.90");
    expect(ΔN).toBe("1709082.18");
    expect(ΔCM).toBe("-598833.95");
    expect(perUnit).toBe("1058.04");
  });

  it("金額 ≥ 1 億：1.25 億／125,034,120／125,034,120.37", () => {
    expect(formatAmountL1("125034120.37")).toBe("1.25 億");
    expect(formatAmountL2("125034120.37")).toBe("125,034,120");
    expect(formatAmountL3("125034120.37")).toBe("125,034,120.37");
  });

  it("金額 ≥ 1 萬：785.1 萬／7,850,658／7,850,657.90", () => {
    expect(formatAmountL1(cur.net_revenue)).toBe("785.1 萬");
    expect(formatAmountL2(cur.net_revenue)).toBe("7,850,658");
    expect(formatAmountL3(cur.net_revenue)).toBe("7,850,657.90");
    expect((["L1", "L2", "L3"] as Layer[]).map(layer => formatAmount(cur.net_revenue, layer))).toEqual(["785.1 萬", "7,850,658", "7,850,657.90"]);
  });

  it("金額 < 1 萬：8,420 元／8,420／8,420.00", () => {
    expect(formatAmountL1("8420")).toBe("8,420 元");
    expect(formatAmountL2("8420")).toBe("8,420");
    expect(formatAmountL3("8420")).toBe("8,420.00");
  });

  it("差額：+170.9 萬／−59.9 萬、+1,709,082／−598,834、+1,709,082.18／−598,833.95", () => {
    expect(formatSignedDelta(ΔN, "L1")).toBe("+170.9 萬");
    expect(formatSignedDelta(ΔCM, "L1")).toBe(`${MINUS}59.9 萬`);
    expect(formatSignedDelta(ΔN, "L2")).toBe("+1,709,082");
    expect(formatSignedDelta(ΔCM, "L2")).toBe(`${MINUS}598,834`);
    expect(formatSignedDelta(ΔN, "L3")).toBe("+1,709,082.18");
    expect(formatSignedDelta(ΔCM, "L3")).toBe(`${MINUS}598,833.95`);
  });

  it("比率：16.2%／16.2%／16.17%", () => {
    expect(formatRateL1(cmMarginCur)).toBe("16.2%");
    expect(formatRateL2(cmMarginCur)).toBe("16.2%");
    expect(formatRateL3(cmMarginCur)).toBe("16.17%");
    expect(formatRateLayer(cmMarginCur, "L3")).toBe("16.17%");
    expect(formatRateL1(cmMarginPrev)).toBe("30.4%");
  });

  it("比率差：降 14.3 個百分點／−14.3 個百分點／−14.25 個百分點", () => {
    const diff = new Decimal(cmMarginCur).minus(cmMarginPrev).toFixed();
    expect(formatRatePoints(diff, "L1")).toBe(fill(labels.units.pointsDown, { value: "14.3" }));
    expect(formatRatePoints(diff, "L1")).toBe("降 14.3 個百分點");
    expect(formatRatePoints(diff, "L2")).toBe(`${MINUS}14.3 個百分點`);
    expect(formatRatePoints(diff, "L3")).toBe(`${MINUS}14.25 個百分點`);
    expect(formatRatePoints("0.021", "L1")).toBe("升 2.1 個百分點");
    expect(formatRatePoints("0.021", "L2")).toBe("+2.1 個百分點");
    expect(formatRateChange(cmMarginCur, cmMarginPrev, "L1")).toBe("降 14.3 個百分點");
  });

  it("成長率：+27.8%（L1／L2）、+27.83%（L3）；上期 ≤ 0 不顯示", () => {
    expect(formatGrowth(cur.net_revenue, prev.net_revenue, "L1")).toBe("+27.8%");
    expect(formatGrowth(cur.net_revenue, prev.net_revenue, "L2")).toBe("+27.8%");
    expect(formatGrowth(cur.net_revenue, prev.net_revenue, "L3")).toBe("+27.83%");
    expect(formatGrowth("100.00", "0.00", "L1")).toBeNull();
    expect(formatGrowth("100.00", "-50.00", "L1")).toBeNull();
    expect(formatGrowth(null, "50.00", "L1")).toBeNull();
    expect(formatGrowth("100.00", null, "L1")).toBeNull();
    expect(formatSignedRate("0.278280", "L1")).toBe("+27.8%");
    expect(formatSignedRate("-0.32047", "L3")).toBe(`${MINUS}32.05%`);
  });

  it("倍數：11.4 倍／11.4 倍／11.40 倍", () => {
    expect(formatMultiple(mer, "L1")).toBe("11.4 倍");
    expect(formatMultiple(mer, "L2")).toBe("11.4 倍");
    expect(formatMultiple(mer, "L3")).toBe("11.40 倍");
  });

  it("件數：7,420 件／7,420／7,420", () => {
    expect(formatCount(UNITS, "L1")).toBe("7,420 件");
    expect(formatCount(7420n, "L2")).toBe("7,420");
    expect(formatCount(7420, "L3")).toBe("7,420");
    expect(formatCount(7420.5, "L1")).toBe(labels.status.missing); // 不是整數就不當成件數
  });

  it("件均：1,058 元／件／1,058／1,058.04 元／件", () => {
    expect(formatPerUnit(perUnit, "L1")).toBe("1,058 元／件");
    expect(formatPerUnit(perUnit, "L2")).toBe("1,058");
    expect(formatPerUnit(perUnit, "L3")).toBe("1,058.04 元／件");
  });

  it("缺資料：資料待補（L3 附原因碼）", () => {
    for (const text of [formatAmountL1(null), formatAmountL2(null), formatAmountL3(null), formatSignedDelta(null, "L1"), formatRateL1(null), formatRateL3(null), formatRatePoints(null, "L1"), formatMultiple(null, "L1"), formatCount(null, "L1"), formatPerUnit(null, "L3")]) expect(text).toBe(labels.status.missing);
    expect(formatEmpty()).toBe("資料待補");
    expect(formatEmpty("missing", { layer: "L3", reasonCodes: ["MISSING_VALUE"] })).toBe("資料待補（MISSING_VALUE）");
    expect(formatEmpty("missing", { layer: "L1", reasonCodes: ["MISSING_VALUE"] })).toBe("資料待補");
    expect(formatMetric("net_revenue", { value: null, reason_codes: ["MISSING_VALUE"] }, "L3")).toBe("資料待補（MISSING_VALUE）");
    expect(formatMetric("net_revenue", null, "L1")).toBe("資料待補");
    // 非十進位字串一律視為缺值，不做 Number 轉換
    for (const bad of ["abc", "1e5", "NaN", "", "1,000"]) expect(formatAmountL3(bad), bad).toBe(labels.status.missing);
  });

  it("分母 ≤ 0：不適用（L3 附原因碼，例如 zeroAds）", () => {
    expect(formatEmpty("notApplicable")).toBe(labels.status.notApplicable);
    expect(formatEmpty("notApplicable", { layer: "L3", reasonCodes: "zeroAds" })).toBe("不適用（zeroAds）");
    expect(formatMultiple(null, "L1", "notApplicable")).toBe("不適用");
    expect(emptyKindOf(["NON_POSITIVE_DENOMINATOR"])).toBe("notApplicable");
    expect(emptyKindOf(["MISSING_VALUE", "NON_POSITIVE_DENOMINATOR"])).toBe("missing");
    expect(emptyKindOf(undefined)).toBe("missing");
    expect(formatMetric("mer", { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] }, "L1")).toBe("不適用");
    expect(formatMetric("mer", { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] }, "L3")).toBe("不適用（NON_POSITIVE_DENOMINATOR）");
  });

  it("零值：0 元／0／0.00，不帶正負號、不用「-」", () => {
    expect(formatAmountL1("0.00")).toBe("0 元");
    expect(formatAmountL2("0.00")).toBe("0");
    expect(formatAmountL3("0.00")).toBe("0.00");
    expect(formatAmountL3("-0.00")).toBe("0.00");
    expect(formatSignedDelta("0.00", "L1")).toBe("0 元");
    expect(formatSignedDelta("0.00", "L2")).toBe("0");
    expect(formatSignedDelta("0.00", "L3")).toBe("0.00");
    expect(formatSignedDelta("-0.40", "L1")).toBe("0 元"); // 取位後為零不帶符號
    expect(formatSignedDelta("-0.004", "L3")).toBe("0.00");
    expect(formatRateL1("0")).toBe("0.0%");
    expect(formatRateL1("-0.0000001")).toBe("0.0%");
    expect(formatRatePoints("0", "L1")).toBe("0.0 個百分點");
    expect(formatRatePoints("-0.0001", "L2")).toBe("0.0 個百分點");
    expect(formatCount("0", "L1")).toBe("0 件");
  });

  it("依指標單位分派（formatMetric／formatMetricDelta）", () => {
    expect(formatMetric("net_revenue", { value: cur.net_revenue }, "L1")).toBe("785.1 萬");
    expect(formatMetric("contribution_margin", { value: cmMarginCur }, "L3")).toBe("16.17%");
    expect(formatMetric("mer", { value: mer }, "L2")).toBe("11.4 倍");
    expect(formatMetricDelta("net_revenue", ΔN, "L2")).toBe("+1,709,082");
    expect(formatMetricDelta("contribution_margin", new Decimal(cmMarginCur).minus(cmMarginPrev).toFixed(), "L1")).toBe("降 14.3 個百分點");
    expect(formatMetricDelta("mer", "1.2", "L2")).toBe("+1.2 倍");
    expect(formatMetricDelta("mer", "-1.234", "L3")).toBe(`${MINUS}1.23 倍`);
  });
});

describe("§8.5 規則 1：一律從精確值取位，HALF_UP", () => {
  it("扣廣告後貢獻成長率 −598,833.95 ÷ 1,868,626.68 =「−32.0%」，不是兩段取位的 −32.1%", () => {
    expect(formatGrowth(cur.contribution_after_marketing, prev.contribution_after_marketing, "L1")).toBe(`${MINUS}32.0%`);
    expect(formatGrowth(cur.contribution_after_marketing, prev.contribution_after_marketing, "L3")).toBe(`${MINUS}32.05%`);
    // 反例：先取兩位（−32.05）再取一位會得到 −32.1，formatter 不能這樣做
    const twoStep = new Decimal(ΔCM).div(prev.contribution_after_marketing).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1);
    expect(twoStep).toBe("-32.1");
  });

  it("貢獻率差從精確值取位是「降 14.3 個百分點」，兩個顯示值相減只有 14.2", () => {
    const shown = new Decimal(formatRateL1(cmMarginCur).replace("%", "")).minus(formatRateL1(cmMarginPrev).replace("%", "")).toFixed(1);
    expect(shown).toBe("-14.2");
    expect(formatRateChange(cmMarginCur, cmMarginPrev, "L1")).toBe("降 14.3 個百分點");
    expect(labels.format.roundingNote).toBe("差額由精確值取位，可能和兩個顯示值相減差 0.1。");
  });

  it("HALF_UP 邊界：9,999.995 元 → 1.0 萬；.5 一律遠離零進位；不經過浮點數", () => {
    expect(formatAmountL1("9999.995")).toBe("1.0 萬");
    expect(formatAmountL1("9999.5")).toBe("1.0 萬");
    expect(formatAmountL1("9999.49")).toBe("9,999 元");
    expect(formatAmountL1("-9999.5")).toBe(`${MINUS}1.0 萬`);
    expect(formatAmountL1("12500")).toBe("1.3 萬");
    expect(formatAmountL1("12499.99")).toBe("1.2 萬");
    expect(formatAmountL1("99994999.99")).toBe("9,999.5 萬");
    expect(formatAmountL1("99999999.99")).toBe("1.00 億"); // 9,999.99999… 萬進位成 10,000.0 萬 → 改用億
    expect(formatAmountL1("125500000")).toBe("1.26 億");
    expect(formatAmountL1("125499999.99")).toBe("1.25 億");
    expect(formatAmountL2("2.5")).toBe("3");
    expect(formatAmountL2("-2.5")).toBe(`${MINUS}3`);
    expect(formatAmountL2("0.49")).toBe("0");
    expect(formatAmountL3("1.005")).toBe("1.01"); // 浮點數 1.005 會變成 1.00
    expect(formatAmountL3("2.345")).toBe("2.35");
    expect(formatAmountL3("-0.005")).toBe(`${MINUS}0.01`);
    expect(formatAmountL3("9007199254740993.01")).toBe("9,007,199,254,740,993.01"); // 超過 2^53 仍精確
    expect(formatRateL1("0.00125")).toBe("0.1%");
    expect(formatRateL1("0.00149999")).toBe("0.1%");
    expect(formatRateL1("0.0015")).toBe("0.2%");
    expect(formatRateL3("0.00005")).toBe("0.01%"); // 0.005% → 0.01%
    expect(formatRateL3("0.0000499")).toBe("0.00%");
    expect(formatMultiple("11.45", "L1")).toBe("11.5 倍");
    expect(formatMultiple("11.445", "L3")).toBe("11.45 倍");
    expect(formatPerUnit("1058.5", "L1")).toBe("1,059 元／件");
  });

  it("標題金額（copy.ts formatHeadlineAmount）委派給 L1，支援億", () => {
    expect(formatHeadlineAmount("125034120.37")).toBe("1.25 億");
    expect(formatHeadlineAmount(ΔCM)).toBe("59.9 萬");
    expect(formatHeadlineAmount(ΔCM, true)).toBe(formatSignedDelta(ΔCM, "L1"));
    expect(formatHeadlineAmount("8420.00")).toBe("8,420 元");
  });
});

describe("§8.5 規則 2：負號與正號", () => {
  it("UI 用 U+2212，正的差額加「+」，符號和數字之間不空格", () => {
    expect(MINUS).toBe("−");
    const texts = [formatSignedDelta(ΔCM, "L1"), formatSignedDelta(ΔCM, "L2"), formatSignedDelta(ΔCM, "L3"), formatAmountL1("-5000"), formatAmountL2("-5000"), formatAmountL3("-5000"), formatRateL1("-0.05"), formatRatePoints("-0.1425", "L2"), formatGrowth("1", "2", "L1")!];
    for (const text of texts) {
      expect(text, text).toMatch(/^−\d/);
      expect(text, text).not.toContain("-");
    }
    expect(formatSignedDelta(ΔN, "L1")).toMatch(/^\+\d/);
    expect(formatAmountL1(cur.net_revenue)).not.toMatch(/^\+/); // 非差額的正值不加號
  });

  it("asciiMinus 把 UI 負號轉回 CSV／JSON 用的 ASCII「-」", () => {
    expect(asciiMinus(formatSignedDelta(ΔCM, "L3"))).toBe("-598,833.95");
    expect(asciiMinus(formatSignedDelta(ΔCM, "L1"))).toBe("-59.9 萬");
    expect(asciiMinus("+1,709,082")).toBe("+1,709,082");
    expect(asciiMinus(`${MINUS}1 ${MINUS}2`)).toBe("-1 -2");
  });

  it("§8.7 標點：數字和中文單位之間一個半形空格，% 不空格", () => {
    expect(formatAmountL1("1188365.10")).toBe("118.8 萬");
    expect(formatMultiple(mer, "L1")).toBe("11.4 倍");
    expect(formatCount(UNITS, "L1")).toBe("7,420 件");
    expect(formatRateL1(cmMarginCur)).not.toContain(" ");
  });
});

describe("§8.6 日期與期間", () => {
  it("主層同一年 M/D，不同年 YYYY/M/D", () => {
    expect(formatDateL1("2026-08-24", { today: "2026-10-06" })).toBe("8/24");
    expect(formatDateL1("2025-12-29", { today: "2026-10-06" })).toBe("2025/12/29");
    expect(formatDateL1("2026-01-05", { anchor: "2026-08-23" })).toBe("1/5");
    expect(formatDateL1(null)).toBe(labels.status.missing);
    expect(formatDateL1("not-a-date")).toBe("not-a-date");
  });

  it("期間範圍用 en dash 不空格，天數一律寫出來；跨年兩端都寫年份", () => {
    expect(formatPeriodL1("2026-07-13", "2026-08-23")).toBe("7/13–8/23（42 天）");
    expect(formatPeriodL1("2026-07-13", "2026-08-23")).toContain("–");
    expect(formatPeriodL1("2026-06-01", "2026-07-12", { days: false })).toBe("6/1–7/12");
    expect(formatPeriodL1("2025-12-29", "2026-01-25")).toBe("2025/12/29–2026/1/25（28 天）");
    expect(formatPeriodL1("2025-07-13", "2025-08-23", { anchor: "2026-08-23" })).toBe("2025/7/13–2025/8/23（42 天）");
  });

  it("天數含頭尾，跨閏日也正確", () => {
    expect(periodDays("2026-07-13", "2026-08-23")).toBe(42);
    expect(periodDays("2026-08-24", "2026-08-24")).toBe(1);
    expect(periodDays("2024-02-01", "2024-03-01")).toBe(30);
    expect(periodDays("2025-12-29", "2026-01-25")).toBe(28);
    expect(periodDays("bad", "2026-01-25")).toBeNull();
  });

  it("匯出版頭：YYYY-MM-DD 至 YYYY-MM-DD（天數）", () => {
    expect(formatPeriodExport("2026-07-13", "2026-08-23")).toBe("2026-07-13 至 2026-08-23（42 天）");
    expect(formatPeriodExport("2026-07-13", "2026-08-23")).toBe(fill(labels.units.exportRange, { start: "2026-07-13", end: "2026-08-23", days: 42 }));
  });
});

describe("§8.5 規則 8：favorableDirection 與方向詞（呈現層）", () => {
  const EXPECTED: Record<MetricName, FavorableDirection> = {
    gross_sales: "up", discounts: "down", refunds: "down", cogs_net: "down", platform_fees: "down", payment_fees: "down", fulfillment_costs: "down", other_variable_costs: "down", ad_spend: "down",
    net_revenue: "up", gross_profit: "up", contribution_before_marketing: "up", contribution_after_marketing: "up",
    gross_margin: "up", contribution_margin: "up", discount_rate: "down", refund_ratio: "down", mer: "up", fulfillment_burden: "down", marketing_burden: "down",
  };

  it("metricDefinitions 每個指標都有 favorableDirection，費用類為 down", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(metricDefinitions).sort());
    for (const [name, direction] of Object.entries(EXPECTED) as [MetricName, FavorableDirection][]) {
      expect(metricDefinitions[name].favorableDirection, name).toBe(direction);
      expect(favorableDirectionOf(name), name).toBe(direction);
    }
    expect(favorableDirectionOf("units_sold")).toBe("up");
    expect(favorableDirectionOf("net_revenue_per_unit")).toBe("up");
  });

  it("deltaTone 依 favorableDirection 判斷，不依數學正負號；零或缺值為 neutral", () => {
    const all: DirectionalMetric[] = [...(Object.keys(EXPECTED) as MetricName[]), "units_sold", "net_revenue_per_unit"];
    for (const metric of all) {
      const up = favorableDirectionOf(metric) === "up";
      expect(deltaTone(metric, "1"), metric).toBe(up ? "favorable" : "unfavorable");
      expect(deltaTone(metric, "-1"), metric).toBe(up ? "unfavorable" : "favorable");
      expect(deltaTone(metric, "0"), metric).toBe("neutral");
      expect(deltaTone(metric, null), metric).toBe("neutral");
    }
    expect(deltaTone("contribution_after_marketing", ΔCM)).toBe("unfavorable");
    expect(deltaTone("discounts", "1188365.10")).toBe("unfavorable");
    expect(deltaTone("ad_spend", "-100.00")).toBe("favorable");
  });

  it("給 layer 時，顯示為零的差額不上色", () => {
    expect(deltaTone("net_revenue", "0.40", "L1")).toBe("neutral");
    expect(deltaTone("net_revenue", "0.40", "L3")).toBe("favorable");
    expect(deltaTone("contribution_margin", "0.0004", "L1")).toBe("neutral"); // 0.04 個百分點 → 顯示 0.0
    expect(deltaTone("contribution_margin", "0.0004", "L3")).toBe("favorable");
    expect(deltaTone("mer", "-0.04", "L2")).toBe("neutral");
    expect(deltaTone("units_sold", "1", "L1")).toBe("favorable");
  });

  it("deltaToneLabel：有利／不利／空字串", () => {
    expect(deltaToneLabel("favorable")).toBe(labels.format.favorable);
    expect(deltaToneLabel("unfavorable")).toBe(labels.format.unfavorable);
    expect(deltaToneLabel("neutral")).toBe("");
  });

  it("deltaWord：多／少、多花／少花、多賺／少賺、升／降、持平、由負轉正、轉為虧損", () => {
    const f = labels.format;
    expect(deltaWord("net_revenue", ΔN)).toBe(f.more);
    expect(deltaWord("gross_profit", "-1")).toBe(f.less);
    expect(deltaWord("gross_sales", "1")).toBe(f.more);
    expect(deltaWord("refunds", "1")).toBe(f.more);
    expect(deltaWord("units_sold", "-3")).toBe(f.less);
    expect(deltaWord("discounts", "1188365.10")).toBe(f.spendMore);
    for (const cost of ["cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"] as const) {
      expect(deltaWord(cost, "1"), cost).toBe(f.spendMore);
      expect(deltaWord(cost, "-1"), cost).toBe(f.spendLess);
    }
    expect(deltaWord("contribution_after_marketing", ΔCM)).toBe(f.earnLess);
    expect(deltaWord("contribution_before_marketing", "1")).toBe(f.earnMore);
    for (const rate of ["gross_margin", "contribution_margin", "discount_rate", "refund_ratio", "fulfillment_burden", "marketing_burden", "mer"] as const) {
      expect(deltaWord(rate, "0.01"), rate).toBe(f.rise);
      expect(deltaWord(rate, "-0.01"), rate).toBe(f.fall);
    }
    expect(deltaWord("net_revenue", "0.00")).toBe(f.flat);
    expect(deltaWord("net_revenue", "0.40", { layer: "L1" })).toBe(f.flat);
    expect(deltaWord("net_revenue", null)).toBeNull();
    expect(deltaWord("contribution_after_marketing", "300.00", { previous: "-100.00" })).toBe(f.turnedPositive);
    expect(deltaWord("contribution_after_marketing", "-300.00", { previous: "100.00" })).toBe(f.turnedLoss);
    expect(deltaWord("contribution_after_marketing", "-50.00", { previous: "100.00" })).toBe(f.earnLess);
    // PRD §8.3：「折扣多花 118.8 萬」「比上期少賺 59.9 萬（−32.0%）」
    expect(`${metricDefinitions.discounts.shortLabel}${deltaWord("discounts", "1188365.10")} ${formatHeadlineAmount("1188365.10")}`).toBe("折扣多花 118.8 萬");
    expect(`${deltaWord("contribution_after_marketing", ΔCM)} ${formatHeadlineAmount(ΔCM)}（${formatGrowth(cur.contribution_after_marketing, prev.contribution_after_marketing, "L1")}）`).toBe(`少賺 59.9 萬（${MINUS}32.0%）`);
  });
});
