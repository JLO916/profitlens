import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import { chartColors } from "../src/application/chart-theme";
import { channelLabel, demoAlias, formatHeadlineAmount } from "../src/application/copy";
import { asciiMinus, formatAmountL1, formatAmountL3, formatEmpty, formatPeriodL1, formatRateL1, formatRateL2, formatSignedDelta, metricDefinitions } from "../src/application/presentation";
import { bridgeWaterfall, PROFIT_WATERFALL_METRICS, profitWaterfall, profitWaterfallScopes, waterfallToneColor, type WaterfallBar } from "../src/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { AMOUNT_FIELDS, type AmountField, type Metric, type MetricName } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// V3-4b 瀑布的資料組裝（C17 貢獻變化拆解、F2 本期利潤結構；PRD §7.1 第 5 點、§10.3）。
// 期待值一律由 labels 模板＋格式化函式＋snapshot 的精確字串組出；加總與恆等式用 decimal.js 檢查到分。
// golden 數字不改：上期扣廣告後貢獻 570.00、本期 255.00、差額 −315.00。其餘情境用 structuredClone(snapshot) 只改呈現層輸入。

const bridgeCopy = labels.overview.bridgeV3;
const profitCopy = labels.overview.profit;
const CM: MetricName = "contribution_after_marketing";

async function snapshot(name = "golden"): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
let golden: WorkspaceSnapshot;
let demo: WorkspaceSnapshot;
beforeAll(async () => { golden = await snapshot("golden"); demo = await snapshot("demo"); });

const dec = (value: string | null) => new Decimal(value!);
const missing = (code = "MISSING_COGS"): Metric => ({ value: null, reason_codes: [code] });
const money = (value: string): Metric => ({ value, reason_codes: [] });
const period = (snap: WorkspaceSnapshot, which: "previous" | "current") => formatPeriodL1(snap.report[which].period.start, snap.report[which].period.end, { days: false, anchor: snap.data_as_of });
/** 每根的 end 等於下一根的 start（水位首尾相接，到分）。 */
function expectChained(bars: readonly WaterfallBar[]) {
  for (let index = 0; index < bars.length - 1; index++) expect(dec(bars[index].end).eq(dec(bars[index + 1].start)), `${bars[index].id} → ${bars[index + 1].id}`).toBe(true);
}
/** 改拆解的輸入（只改呈現層）：兩期扣廣告後貢獻、九項、加總與差額。 */
function bridgeVariant(base: WorkspaceSnapshot, values: { previous: string; current: string; components: Partial<Record<AmountField, string>>; sum: string; change: string; reconciled: boolean }): WorkspaceSnapshot {
  const snap = structuredClone(base);
  snap.report.previous.metrics.contribution_after_marketing = money(values.previous);
  snap.report.current.metrics.contribution_after_marketing = money(values.current);
  for (const field of AMOUNT_FIELDS) snap.report.bridge.components[field] = money(values.components[field] ?? "0.00");
  snap.report.bridge.sum = money(values.sum);
  snap.report.bridge.contribution_change = money(values.change);
  snap.report.bridge.reconciled = values.reconciled;
  return snap;
}
const goldenComponents = () => Object.fromEntries(AMOUNT_FIELDS.map(field => [field, golden.report.bridge.components[field].value!])) as Record<AmountField, string>;

describe("bridgeWaterfall：貢獻變化拆解（C17）", () => {
  it("golden 的數字不變：上期 570.00、本期 255.00、差額 −315.00，九項加總相符", () => {
    const { report } = golden;
    expect(report.previous.metrics.contribution_after_marketing.value).toBe("570.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBe("255.00");
    expect(report.bridge.contribution_change.value).toBe("-315.00");
    expect(report.bridge.sum.value).toBe("-315.00");
    expect(report.bridge.reconciled).toBe(true);
  });

  it("golden／demo：11 根（上期 → 九項 → 本期），九項 Decimal 加總 == 差額 == 總差額（到分），水位首尾相接", () => {
    for (const snap of [golden, demo]) {
      const result = bridgeWaterfall(snap);
      const { report } = snap;
      expect(result.bars).toHaveLength(11);
      expect(result.bars.map(bar => bar.id)).toEqual(["previous", ...AMOUNT_FIELDS, "current"]);
      expect(result.bars.map(bar => bar.kind)).toEqual(["total", ...AMOUNT_FIELDS.map(() => "delta"), "result"]);
      const deltas = result.bars.filter(bar => bar.kind === "delta");
      const sum = deltas.reduce((total, bar) => total.plus(dec(bar.value)), new Decimal(0));
      expect(sum.toFixed(2)).toBe(dec(result.contributionChange.value).toFixed(2));
      expect(sum.toFixed(2)).toBe(dec(result.total.value).toFixed(2));
      expect(result.contributionChange).toBe(report.bridge.contribution_change);
      expect(result.total).toBe(report.bridge.sum);
      // 九項直接取 report.bridge.components（不重算）。
      for (const field of AMOUNT_FIELDS) expect(deltas.find(bar => bar.id === field)!.value).toBe(report.bridge.components[field].value);
      expect(dec(result.bars[0].start).eq(dec(report.previous.metrics.contribution_after_marketing.value))).toBe(true);
      expect(dec(result.bars[10].end).eq(dec(report.current.metrics.contribution_after_marketing.value))).toBe(true);
      expectChained(result.bars);
      expect(result.balanced).toBe(true);
      expect(result.difference).toBe("0.00");
      expect(result.balanceText).toBe(fill(bridgeCopy.balance.balanced, { difference: formatAmountL3("0.00") }));
      expect(result.note).toBe(labels.ui.overview.bridgeNote);
      expect(result.subtitle).toBe(fill(bridgeCopy.subtitle, { section: labels.overview.sections.bridge, previous: period(snap, "previous"), current: period(snap, "current") }));
    }
  });

  it("柱名、標值與顏色：起訖柱 total、增加 favorable、減少 unfavorable；標值用 L1 格式化函式", () => {
    const result = bridgeWaterfall(golden);
    const [first, ...rest] = result.bars;
    const last = rest.pop()!;
    expect(first).toMatchObject({ label: bridgeCopy.barLabels.previous, metric: CM, tone: "total", value: "570.00", start: "570.00", end: "570.00", display: formatAmountL1("570.00") });
    expect(last).toMatchObject({ label: bridgeCopy.barLabels.current, metric: CM, tone: "total", value: "255.00", start: "255.00", end: "255.00", display: formatAmountL1("255.00") });
    for (const bar of rest) {
      const field = bar.id as AmountField;
      expect(bar).toMatchObject({ metric: field, label: metricDefinitions[field].label, shortLabel: metricDefinitions[field].shortLabel, display: formatSignedDelta(bar.value, "L1") });
      expect(bar.tone).toBe(dec(bar.value).isPositive() ? "favorable" : "unfavorable");
    }
    // golden：原價收入 +600.00 是唯一的增加項。
    expect(rest.filter(bar => bar.tone === "favorable").map(bar => bar.id)).toEqual(["gross_sales"]);
    expect(waterfallToneColor).toEqual({ total: chartColors.total, result: chartColors.current, favorable: chartColors.favorable, unfavorable: chartColors.unfavorable, missing: chartColors.connector });
  });

  it("golden 的結論標題：少賺 315 元，扣最多的一項是商品成本（−275.00 的 L1）", () => {
    const result = bridgeWaterfall(golden);
    // 手算：九項中最負的是商品成本 −275.00（折扣 −250.00、廣告投放費 −150.00 次之）。
    expect(result.largest).toEqual({ field: "cogs_net", value: "-275.00" });
    expect(result.title).toBe(fill(bridgeCopy.title.decrease, { amount: formatHeadlineAmount("-315.00"), item: metricDefinitions.cogs_net.label, delta: formatSignedDelta("-275.00", "L1") }));
  });

  it("demo 的結論標題：少賺（差額絕對值 L1），扣最多的一項是商品成本", () => {
    const result = bridgeWaterfall(demo);
    const { bridge } = demo.report;
    const mostNegative = AMOUNT_FIELDS.reduce((low, field) => dec(bridge.components[field].value).lt(dec(bridge.components[low].value)) ? field : low);
    expect(result.largest).toEqual({ field: mostNegative, value: bridge.components[mostNegative].value });
    expect(result.largest!.field).toBe("cogs_net");
    expect(result.title).toBe(fill(bridgeCopy.title.decrease, { amount: formatHeadlineAmount(bridge.contribution_change.value), item: metricDefinitions.cogs_net.label, delta: formatSignedDelta(bridge.components.cogs_net.value, "L1") }));
  });

  it("橋接表 12 列：上期 → 九項（原價收入、減：…） → 本期 → 總差額；label 依 labels，metric 是原 Metric", () => {
    const result = bridgeWaterfall(demo);
    const { report } = demo;
    expect(result.rows).toHaveLength(12);
    expect(result.rows.map(row => row.label)).toEqual([bridgeCopy.rows.previous, ...AMOUNT_FIELDS.map(field => bridgeCopy.rows[field]), bridgeCopy.rows.current, bridgeCopy.rows.total]);
    expect(result.rows.map(row => row.kind)).toEqual(["start", ...AMOUNT_FIELDS.map(() => "delta"), "end", "total"]);
    expect(result.rows[0].metric).toBe(report.previous.metrics.contribution_after_marketing);
    AMOUNT_FIELDS.forEach((field, index) => { expect(result.rows[index + 1]).toMatchObject({ id: field, field, metric: report.bridge.components[field] }); });
    expect(result.rows[10].metric).toBe(report.current.metrics.contribution_after_marketing);
    expect(result.rows[11].metric).toBe(report.bridge.sum);
    // 列名與名詞表一致：原價收入用短名，扣項寫「減：{指標名}」。
    expect(bridgeCopy.rows.gross_sales).toBe(metricDefinitions.gross_sales.shortLabel);
    for (const field of AMOUNT_FIELDS.filter(field => field !== "gross_sales")) expect(bridgeCopy.rows[field].endsWith(metricDefinitions[field].label), field).toBe(true);
    expect(bridgeCopy.rows.previous.endsWith(metricDefinitions.contribution_after_marketing.label)).toBe(true);
    expect(bridgeCopy.rows.current.endsWith(metricDefinitions.contribution_after_marketing.label)).toBe(true);
  });

  it("缺值：商品成本差額待補 → 該根起 start／end 為 null、tone missing；標題與平衡檢核用缺值句", () => {
    const snap = structuredClone(golden);
    snap.report.bridge.components.cogs_net = missing();
    snap.report.bridge.sum = missing();
    snap.report.bridge.contribution_change = missing();
    snap.report.bridge.reconciled = null;
    const result = bridgeWaterfall(snap);
    const index = result.bars.findIndex(bar => bar.id === "cogs_net");
    expect(index).toBe(4);
    for (const bar of result.bars.slice(0, index)) { expect(bar.tone).not.toBe("missing"); expect(bar.start).not.toBeNull(); expect(bar.end).not.toBeNull(); }
    expectChained(result.bars.slice(0, index));
    expect(result.bars[index]).toMatchObject({ value: null, start: null, end: null, tone: "missing", display: formatEmpty("missing"), reasonCodes: ["MISSING_COGS"] });
    for (const bar of result.bars.slice(index + 1)) {
      expect(bar).toMatchObject({ start: null, end: null, tone: "missing" });
      // 本身有值的柱仍標自己的金額（無法定位，由元件決定不畫）。
      expect(bar.display).toBe(bar.kind === "delta" ? formatSignedDelta(bar.value, "L1") : formatAmountL1(bar.value));
    }
    expect(result.title).toBe(bridgeCopy.title.missing);
    expect(result.balanceText).toBe(bridgeCopy.balance.missing);
    expect(result).toMatchObject({ balanced: null, difference: null, largest: null });
    expect(result.rows[4].metric).toEqual(missing());
  });

  it("增加：多賺，加最多的一項（最大的正項）；水位從上期加到本期", () => {
    const components = Object.fromEntries(Object.entries(goldenComponents()).map(([field, value]) => [field, dec(value).neg().toFixed(2)])) as Record<AmountField, string>;
    const snap = bridgeVariant(golden, { previous: "255.00", current: "570.00", components, sum: "315.00", change: "315.00", reconciled: true });
    const result = bridgeWaterfall(snap);
    expect(result.largest).toEqual({ field: "cogs_net", value: "275.00" });
    expect(result.title).toBe(fill(bridgeCopy.title.increase, { amount: formatHeadlineAmount("315.00"), item: metricDefinitions.cogs_net.label, delta: formatSignedDelta("275.00", "L1") }));
    expectChained(result.bars);
    expect(result.bars.find(bar => bar.id === "gross_sales")!.tone).toBe("unfavorable");
    expect(result.bars.find(bar => bar.id === "ad_spend")!.tone).toBe("favorable");
  });

  it("沒有同方向的項目時用 NoLargest 版；不平衡時平衡檢核寫「差 {L3 絕對值} 元」", () => {
    const snap = bridgeVariant(golden, { previous: "570.00", current: "255.00", components: { gross_sales: "100.00", discounts: "20.50" }, sum: "120.50", change: "-315.00", reconciled: false });
    const result = bridgeWaterfall(snap);
    expect(result.largest).toBeNull();
    expect(result.title).toBe(fill(bridgeCopy.title.decreaseNoLargest, { amount: formatHeadlineAmount("-315.00") }));
    expect(result.balanced).toBe(false);
    expect(result.difference).toBe(dec("120.50").minus("-315.00").toFixed(2));
    expect(result.balanceText).toBe(fill(bridgeCopy.balance.unbalanced, { difference: formatAmountL3("435.50") }));

    const up = bridgeWaterfall(bridgeVariant(golden, { previous: "255.00", current: "570.00", components: { discounts: "-10.00" }, sum: "-10.00", change: "315.00", reconciled: false }));
    expect(up.title).toBe(fill(bridgeCopy.title.increaseNoLargest, { amount: formatHeadlineAmount("315.00") }));
  });

  it("L1 取位後持平：寫「扣廣告後貢獻與上期持平」", () => {
    const snap = bridgeVariant(golden, { previous: "570.00", current: "570.30", components: { gross_sales: "0.30" }, sum: "0.30", change: "0.30", reconciled: true });
    const result = bridgeWaterfall(snap);
    expect(result.title).toBe(bridgeCopy.title.flat);
    expect(result.bars.find(bar => bar.id === "gross_sales")!.tone).toBe("total");
    expect(result.bars.find(bar => bar.id === "discounts")!.tone).toBe("total");
  });

  it("上期 ≤ 0 轉正、上期 > 0 轉為虧損：寫「扣廣告後貢獻{由負轉正／轉為虧損}，本期 {L1}」", () => {
    const negated = Object.fromEntries(Object.entries(goldenComponents()).map(([field, value]) => [field, dec(value).neg().toFixed(2)])) as Record<AmountField, string>;
    const positive = bridgeWaterfall(bridgeVariant(golden, { previous: "-100.00", current: "215.00", components: negated, sum: "315.00", change: "315.00", reconciled: true }));
    expect(positive.title).toBe(fill(bridgeCopy.title.turned, { word: labels.format.turnedPositive, value: formatAmountL1("215.00") }));
    const loss = bridgeWaterfall(bridgeVariant(golden, { previous: "255.00", current: "-60.00", components: goldenComponents(), sum: "-315.00", change: "-315.00", reconciled: true }));
    expect(loss.title).toBe(fill(bridgeCopy.title.turned, { word: labels.format.turnedLoss, value: formatAmountL1("-60.00") }));
    expectChained(loss.bars);
    expect(loss.bars[10]).toMatchObject({ value: "-60.00", end: "-60.00", tone: "total" });
  });
});

describe("profitWaterfall：本期利潤結構（F2）", () => {
  const scopesOf = (snap: WorkspaceSnapshot) => ["all", ...snap.report.scope.channels];
  const metricsOf = (snap: WorkspaceSnapshot, scope: string) => scope === "all" ? snap.report.current.metrics : snap.report.current.channels[scope].metrics;

  it("合計與每個通路：10 根依 §10.3 柱序，三個恆等式成立，淨營收減全部扣項 == 扣廣告後貢獻（到分）", () => {
    for (const snap of [golden, demo]) for (const scope of scopesOf(snap)) {
      const result = profitWaterfall(snap, scope);
      const metrics = metricsOf(snap, scope);
      expect(result.bars.map(bar => bar.id)).toEqual(PROFIT_WATERFALL_METRICS.map(item => item.metric));
      expect(result.bars.map(bar => bar.kind)).toEqual(["total", "delta", "subtotal", "delta", "delta", "delta", "delta", "subtotal", "delta", "result"]);
      expect(result.identity, `${snap.report.dataset_id} ${scope}`).toEqual({ grossProfit: true, beforeMarketing: true, afterMarketing: true });
      expect(result.missing).toBe(false);
      const deltas = result.bars.filter(bar => bar.kind === "delta");
      const remaining = deltas.reduce((total, bar) => total.plus(dec(bar.value)), dec(metrics.net_revenue.value));
      expect(remaining.toFixed(2)).toBe(dec(metrics.contribution_after_marketing.value).toFixed(2));
      expectChained(result.bars);
      // 小計與結果柱直接用指標值（不重算）；扣項是費用取負。
      for (const bar of result.bars) {
        const metric = metrics[bar.metric];
        if (bar.kind === "delta") expect(dec(bar.value).eq(dec(metric.value).neg()), bar.id).toBe(true);
        else expect(bar.value, bar.id).toBe(metric.value);
        expect(bar.label).toBe(metricDefinitions[bar.metric].label);
        expect(bar.display).toBe(bar.kind === "delta" ? formatSignedDelta(bar.value, "L1") : formatAmountL1(bar.value));
      }
      expect(result.bars.map(bar => bar.tone).filter(tone => tone === "result")).toHaveLength(1);
      expect(result.bars[9].tone).toBe("result");
      expect([result.bars[0].tone, result.bars[2].tone, result.bars[7].tone]).toEqual(["total", "total", "total"]);
    }
  });

  it("每 100 元淨營收：demo 合計 16.2（與 KPI 帶的扣廣告後貢獻率同一個取位），標題逐字由 labels 組出", () => {
    const result = profitWaterfall(demo, "all");
    expect(result.perHundred).toBe("16.2");
    expect(result.title).toBe(fill(profitCopy.title.positive, { n: "16.2" }));
    for (const snap of [golden, demo]) for (const scope of scopesOf(snap)) {
      const item = profitWaterfall(snap, scope);
      const margin = metricsOf(snap, scope).contribution_margin.value;
      expect(fill(labels.units.percent, { value: item.perHundred }), `${snap.report.dataset_id} ${scope}`).toBe(asciiMinus(formatRateL1(margin)));
      const negative = dec(item.perHundred).isNegative();
      expect(item.title).toBe(fill(negative ? profitCopy.title.negative : profitCopy.title.positive, { n: dec(item.perHundred).abs().toFixed(1) }));
    }
    // demo 的平台通路扣完廣告是負的：寫「虧」與絕對值。
    const marketplace = profitWaterfall(demo, "MARKETPLACE");
    expect(dec(marketplace.perHundred).isNegative()).toBe(true);
    expect(marketplace.title).toBe(fill(profitCopy.title.negative, { n: dec(marketplace.perHundred).abs().toFixed(1) }));
  });

  it("副標：本期利潤結構 · 期間 · 範圍（合計／全部通路／通路名稱）；範圍選項是合計＋各通路", () => {
    const anchor = demo.data_as_of;
    const span = formatPeriodL1(demo.report.current.period.start, demo.report.current.period.end, { days: false, anchor });
    const alias = demoAlias(demo.report.dataset_id);
    expect(profitWaterfall(demo, "all").subtitle).toBe(fill(profitCopy.subtitle, { section: profitCopy.section, period: span, scope: labels.sections.total }));
    expect(profitWaterfall(demo, "all", { allChannels: ["DTC", "MARKETPLACE"] }).subtitle).toBe(fill(profitCopy.subtitle, { section: profitCopy.section, period: span, scope: labels.shell.periodBar.filter.allChannels }));
    expect(profitWaterfall(demo, "all", { allChannels: ["DTC", "MARKETPLACE", "LINE"] }).scopeLabel).toBe(labels.sections.total);
    const channel = profitWaterfall(demo, "MARKETPLACE");
    expect(channel.scopeLabel).toBe(channelLabel("MARKETPLACE", alias));
    expect(channel.subtitle).toBe(fill(profitCopy.subtitle, { section: profitCopy.section, period: span, scope: channelLabel("MARKETPLACE", alias) }));
    expect(profitWaterfall(demo, "MARKETPLACE", { alias: false }).scopeLabel).toBe("MARKETPLACE");
    expect(profitWaterfallScopes(demo)).toEqual([{ id: "all", label: profitCopy.scope.all }, ...demo.report.scope.channels.map(id => ({ id, label: channelLabel(id, alias) }))]);
  });

  it("資料表 10 列：金額是指標原值（費用為正），佔淨營收交給 formatRateL2；扣廣告後貢獻列與貢獻率一致", () => {
    for (const scope of scopesOf(demo)) {
      const result = profitWaterfall(demo, scope);
      const metrics = metricsOf(demo, scope);
      const netRevenue = dec(metrics.net_revenue.value);
      expect(result.rows).toHaveLength(10);
      result.rows.forEach((row, index) => {
        expect(row.label).toBe(result.bars[index].label);
        expect(row.value).toBe(metrics[row.metric]);
        expect(formatRateL2(row.share)).toBe(formatRateL2(dec(row.value.value).div(netRevenue).toFixed(12)));
      });
      expect(formatRateL2(result.rows[0].share)).toBe(formatRateL2("1"));
      expect(formatRateL2(result.rows[9].share)).toBe(formatRateL2(metrics.contribution_margin.value));
    }
  });

  it("費用為 0 的柱是中性（total 色），不標成有利或不利", () => {
    const dtc = profitWaterfall(golden, "DTC");
    expect(golden.report.current.channels.DTC.metrics.platform_fees.value).toBe("0.00");
    expect(dtc.bars.find(bar => bar.id === "platform_fees")).toMatchObject({ value: "0.00", tone: "total", display: formatSignedDelta("0.00", "L1") });
  });

  it("缺商品成本：商品成本與之後的小計／結果柱 missing、之後的柱無法定位、恆等式 null、標題退回區塊名", () => {
    const snap = structuredClone(golden);
    const metrics = snap.report.current.metrics;
    for (const name of ["cogs_net", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "gross_margin", "contribution_margin"] as const) metrics[name] = missing();
    const result = profitWaterfall(snap, "all");
    expect(result.bars[0]).toMatchObject({ id: "net_revenue", tone: "total", value: metrics.net_revenue.value });
    expect(result.bars[1]).toMatchObject({ id: "cogs_net", value: null, start: null, end: null, tone: "missing", display: formatEmpty("missing"), reasonCodes: ["MISSING_COGS"] });
    for (const bar of result.bars.slice(1)) expect(bar, bar.id).toMatchObject({ start: null, end: null, tone: "missing" });
    for (const id of ["gross_profit", "contribution_before_marketing", "contribution_after_marketing"]) expect(result.bars.find(bar => bar.id === id)!.display).toBe(formatEmpty("missing"));
    expect(result.identity).toEqual({ grossProfit: null, beforeMarketing: null, afterMarketing: null });
    expect(result.perHundred).toBeNull();
    expect(result.title).toBe(profitCopy.section);
    expect(result.missing).toBe(true);
    expect(result.rows[1]).toMatchObject({ metric: "cogs_net", value: missing(), share: null });
    expect(formatRateL2(result.rows[1].share)).toBe(formatEmpty("missing"));
    // 其他費用仍有值：資料表照列，佔比照算。
    expect(result.rows[3].value).toBe(metrics.platform_fees);
    expect(formatRateL2(result.rows[3].share)).toBe(formatRateL2(dec(metrics.platform_fees.value).div(dec(metrics.net_revenue.value)).toFixed(12)));
  });

  it("只讀既有指標、不重算：把通路的商品毛利改掉，柱值跟著指標走，恆等式檢核顯示不成立", () => {
    const snap = structuredClone(golden);
    snap.report.current.channels.DTC.metrics.gross_profit = money("1.00");
    const result = profitWaterfall(snap, "DTC");
    expect(result.bars[2].value).toBe("1.00");
    expect(result.identity.grossProfit).toBe(false);
    expect(result.identity.afterMarketing).toBe(true);
  });

  it("範圍不在本期資料中：全部柱 missing，標題退回區塊名", () => {
    const result = profitWaterfall(golden, "UNKNOWN");
    expect(result.missing).toBe(true);
    expect(result.bars.every(bar => bar.tone === "missing" && bar.value === null)).toBe(true);
    expect(result.title).toBe(profitCopy.section);
    expect(result.scopeLabel).toBe(channelLabel("UNKNOWN", demoAlias(golden.report.dataset_id)));
    expect(profitWaterfall(golden, "constructor").missing).toBe(true);
  });
});
