import Decimal from "decimal.js";
import { moneyMetric, parseCents, ratioMetric, sumAmounts } from "../domain/money";
import type { Amount, AmountField, Metric, Metrics, Period, SourceRef, Summary } from "../domain/types";
import type { WorkspaceSnapshot } from "./workspace";

/*
 * V4-3a 代理 A：G10「每 100 元淨營收去向」的 B 級整理函式（PRD §4.3 G10、§6.4；CHART_CATALOG G10、§9.2；D-V4-15）。
 * 版本 channel-structure-v1 只涵蓋兩件新算出的東西：
 *   1. 四項通路費用合計（平台抽成＋金流手續費＋物流與包材費＋其他變動費用，domain 的 sumAmounts 相加，到分），
 *      佔淨營收比（domain 的 ratioMetric，12 位小數；淨營收 ≤ 0 回傳 null＋NON_POSITIVE_DENOMINATOR）與每 100 元（比照 waterfall.ts 的 perHundred：Decimal、HALF_UP 一位）；
 *   2. 超過 100 的幾何：扣項合計（商品成本＋四項費用合計＋廣告投放費）佔淨營收比、超過 100 的部分（扣項合計 ÷ 淨營收 − 1，大於 0 時）與 x 軸上限 max(1, 最大扣項合計比)。
 * 各通路的「剩」與商品成本、廣告費、扣廣告後貢獻三段的比率不在這裡算：G10 直接呼叫 profitWaterfall(snapshot, channel)（A 級，contribution-v1），
 * 和 G2 切到該通路時同一個實作（tests/chart-structure.test.ts 斷言逐字相同）。
 * 只讀 report 的既有指標（report[period].channels[c].metrics 與 report[period].metrics），不重算 domain 的任何指標；金額只經 bigint 分與 decimal 字串。
 * 每列的「不適用」條件（PRD §4.3、§7.4）：任一扣項（商品成本、四項費用、廣告投放費）為負，或淨營收 ≤ 0；缺值優先寫「資料待補」。
 * 不做「其他」合併，不加總不同通路以外的任何東西（X38）：合計列直接用 report[period].metrics，不是把各通路列相加。
 */

export const CHANNEL_STRUCTURE_VERSION = "channel-structure-v1";
/** 四項通路費用（G10 合成一段「通路費用合計」，v4 GLOSSARY #16）。 */
export const CHANNEL_FEE_FIELDS = ["platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs"] as const satisfies readonly AmountField[];
export type ChannelFeeField = typeof CHANNEL_FEE_FIELDS[number];
/** 每 100 元去向的扣項（任一為負時該列改成「不適用」）：商品成本、四項通路費用、廣告投放費。 */
export const CHANNEL_STRUCTURE_DEDUCTIONS = ["cogs_net", ...CHANNEL_FEE_FIELDS, "ad_spend"] as const satisfies readonly AmountField[];
/** 合計列的鍵（testid chart-diagnosis-share-seg-total-{segment}，H5 設計稿）。 */
export const CHANNEL_STRUCTURE_TOTAL_KEY = "total";
/** 通路數上限（PRD §4.4 G10）：≤ 5 用 chartHeights.sm、6 到 8 用 lg、超過 8 只留資料表（與 G7b、G11 同一上限）。 */
export const CHANNEL_STRUCTURE_SM_MAX = 5;
export const CHANNEL_STRUCTURE_MAX = 8;

export type ChannelStructureStatus = "ready" | "notApplicable" | "missing";
/** 不適用的原因：扣項有負數（成本沖回、費用抵扣）／淨營收 ≤ 0。 */
export type ChannelStructureReason = "negativeDeduction" | "nonPositiveRevenue";

export interface ChannelStructureRow {
  /** 通路代碼；合計列為 CHANNEL_STRUCTURE_TOTAL_KEY。 */
  key: string;
  /** 通路代碼；合計列為 null。 */
  channel: string | null;
  period: Period;
  /** 這一列涵蓋的通路（單一通路，或合計的 report.scope.channels）。 */
  channels: string[];
  /** 四項費用合計的來源列：只有通路費用檔（channel_costs_daily.csv）與 manifest。 */
  sources: SourceRef[];
  netRevenue: Metric;
  /** 四項通路費用合計（到分）；任一項缺值為 null。 */
  fees: Metric;
  /** 四項費用各自的值（抽屜的組成項目，順序同 CHANNEL_FEE_FIELDS）。 */
  feeItems: { field: ChannelFeeField; metric: Metric }[];
  /** 四項費用合計 ÷ 淨營收（12 位小數）。 */
  feesShare: Metric;
  /** 每 100 元淨營收的四項費用合計（一位小數，HALF_UP；零寫 "0.0"）；淨營收 ≤ 0 或缺值為 null。 */
  feesPerHundred: string | null;
  /** 扣項合計（商品成本＋四項費用合計＋廣告投放費）÷ 淨營收（12 位小數）。 */
  deductionsShare: Metric;
  /** 超過 100 的部分（扣項合計 ÷ 淨營收 − 1，12 位小數；沒有超過時 "0.000000000000"）；status 不是 ready 時為 null。 */
  overShare: string | null;
  /** 七段恆等式（到分）：商品成本＋四項費用＋廣告投放費＋扣廣告後貢獻＝淨營收；任一缺值為 null。 */
  identity: boolean | null;
  status: ChannelStructureStatus;
  reasons: ChannelStructureReason[];
}

export interface ChannelStructure {
  version: typeof CHANNEL_STRUCTURE_VERSION;
  period: "current" | "previous";
  /** report.scope.channels 的順序。 */
  rows: ChannelStructureRow[];
  total: ChannelStructureRow;
  /** x 軸上限（比率小數，12 位）：max(1, 每個 ready 列（含合計）的扣項合計比)。 */
  axisMax: string;
}

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const ZERO_RATIO = "0.000000000000";
const MISSING: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
const COST_FILES: readonly SourceRef["file"][] = ["channel_costs_daily.csv", "manifest.json"];

/** Metric → domain 的 Amount（到分 bigint）；值不是到分字串時視為缺值，保留原因碼（與 pnl-table.ts 的 amountOf 相同）。 */
function amountOf(metric: Metric): Amount {
  let cents: bigint | null = null;
  try { cents = parseCents(metric.value); } catch { cents = null; }
  return { cents, reason_codes: [...metric.reason_codes] };
}
const metricOf = (metrics: Metrics | null, name: AmountField | "net_revenue" | "contribution_after_marketing"): Metric => {
  const metric = metrics?.[name];
  return metric ? { value: metric.value, reason_codes: [...metric.reason_codes] } : { ...MISSING, reason_codes: [...MISSING.reason_codes] };
};
/** 每 100 元（比照 waterfall.ts 的 perHundred：精確值一次取位，HALF_UP 一位小數；零寫 "0.0"）。 */
function perHundredOf(numerator: Amount, denominator: Amount): string | null {
  if (numerator.cents === null || denominator.cents === null || denominator.cents <= 0n) return null;
  const value = new Exact(numerator.cents.toString()).div(denominator.cents.toString()).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  return value.isZero() ? "0.0" : value.toFixed(1);
}

function structureRow(key: string, channel: string | null, period: Period, channels: string[], summary: Summary | null): ChannelStructureRow {
  const metrics = summary?.metrics ?? null;
  const netRevenue = metricOf(metrics, "net_revenue");
  const feeItems = CHANNEL_FEE_FIELDS.map(field => ({ field, metric: metricOf(metrics, field) }));
  const net = amountOf(netRevenue);
  const cogs = amountOf(metricOf(metrics, "cogs_net"));
  const ad = amountOf(metricOf(metrics, "ad_spend"));
  const contribution = amountOf(metricOf(metrics, "contribution_after_marketing"));
  const feeAmounts = feeItems.map(item => amountOf(item.metric));
  const feesAmount = sumAmounts(feeAmounts);
  const deductions = sumAmounts([cogs, feesAmount, ad]);
  const seven = sumAmounts([cogs, ...feeAmounts, ad, contribution]);

  const missing = [net, cogs, ad, contribution, ...feeAmounts].some(amount => amount.cents === null);
  const reasons: ChannelStructureReason[] = [];
  if (!missing) {
    if ([cogs, ...feeAmounts, ad].some(amount => amount.cents! < 0n)) reasons.push("negativeDeduction");
    if (net.cents! <= 0n) reasons.push("nonPositiveRevenue");
  }
  const status: ChannelStructureStatus = missing ? "missing" : reasons.length ? "notApplicable" : "ready";
  let overShare: string | null = null;
  if (status === "ready") {
    const over = new Exact(deductions.cents!.toString()).minus(net.cents!.toString()).div(net.cents!.toString());
    overShare = over.gt(0) ? over.toFixed(12) : ZERO_RATIO;
  }
  return {
    key, channel, period: { ...period }, channels: [...channels],
    sources: (summary?.sources ?? []).filter(source => COST_FILES.includes(source.file)),
    netRevenue,
    fees: moneyMetric(feesAmount),
    feeItems,
    feesShare: ratioMetric(feesAmount, net),
    feesPerHundred: perHundredOf(feesAmount, net),
    deductionsShare: ratioMetric(deductions, net),
    overShare,
    identity: seven.cents === null || net.cents === null ? null : seven.cents === net.cents,
    status,
    reasons,
  };
}

/**
 * G10 的 B 級整理（channel-structure-v1）：每個範圍內的通路一列（report.scope.channels 的順序）＋合計一列。
 * 通路不在該期的 report 時（domain 對範圍內每個通路都會輸出，只是防呆）整列資料待補。
 */
export function channelStructure(snapshot: Pick<WorkspaceSnapshot, "report">, period: "current" | "previous" = "current"): ChannelStructure {
  const { report } = snapshot;
  const summary = report[period];
  const rows = report.scope.channels.map(channel => structureRow(channel, channel, summary.period, [channel], Object.hasOwn(summary.channels, channel) ? summary.channels[channel] : null));
  const total = structureRow(CHANNEL_STRUCTURE_TOTAL_KEY, null, summary.period, [...report.scope.channels], summary);
  let axisMax = new Exact(1);
  for (const row of [...rows, total]) {
    if (row.status !== "ready" || row.deductionsShare.value === null) continue;
    const share = new Exact(row.deductionsShare.value);
    if (share.gt(axisMax)) axisMax = share;
  }
  return { version: CHANNEL_STRUCTURE_VERSION, period, rows, total, axisMax: axisMax.toFixed(12) };
}
