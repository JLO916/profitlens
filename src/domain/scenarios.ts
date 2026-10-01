import Decimal from "decimal.js";
import { calculateMetrics } from "./metrics";
import { formatCents, parseCents } from "./money";
import { AMOUNT_FIELDS } from "./types";
import type { AmountField, SourceRef, Summary } from "./types";

export const SCENARIO_VERSION = "scenario-v1" as const;
export const SCENARIO_ASSUMPTIONS: string[] = [
  "本功能是同一期間單一通路的條件試算，不是預測，也不代表已發生或保證可取得的改善收益。",
  "平均牌價與商品組合固定；售出量變化 v 必須由使用者明確輸入，零變化也不是系統預設。",
  "退款金額比固定於本期已入帳比率；入帳日退款比不等於同批訂單 cohort 的最終退貨機率。",
  "每售出量的銷貨淨成本及退回結構固定；商品成本按銷量變化，不由退款金額自行推算成本沖回。",
  "平台與金流費按原有效淨營收費率估算；不涵蓋最低費、階梯費率、折扣前 GMV 計費等其他機制。",
  "履約費隨銷量及單位履約成本變化；其他變動費用按銷量變化，不把固定成本當作可自動節省。",
  "總廣告支出只按使用者輸入變化，不由廣告調整推算銷量；減少廣告不代表營收必然不變。",
  "一次性投入在本方案扣除一次；每個方案各自從原 baseline 重算，不疊加或相加不同方案的改善金額。",
  "若實際費用計價或退款／商品結構不符合以上假設，此方案暫不適用，應先確認額外資料。",
];
export const SCENARIO_FORMULAS: Record<string, string> = {
  gross_sales: "G′ = G × (1 + v)",
  discounts: "D′ = G′ × (D/G + δ)；δ = 輸入百分點 / 100",
  refunds: "R′ = (G′ − D′) × R/(G − D)",
  net_revenue: "N′ = G′ − D′ − R′",
  cogs_net: "C′ = C × (1 + v)",
  platform_fees: "P′ = P × (N′ / N)",
  payment_fees: "Q′ = Q × (N′ / N)",
  fulfillment_costs: "F′ = F × (1 + v) × (1 + f)",
  other_variable_costs: "O′ = O × (1 + v)",
  ad_spend: "A′ = A × (1 + a)；不由廣告變動推算銷量",
  one_time_cost: "K = 使用者明確輸入的非負一次性投入",
  gross_profit: "GP′ = N′ − C′",
  contribution_before_marketing: "CM_before′ = N′ − C′ − P′ − Q′ − F′ − O′",
  contribution_after_marketing: "條件貢獻 = N′ − C′ − P′ − Q′ − F′ − O′ − A′ − K",
  contribution: "條件貢獻 = N′ − C′ − P′ − Q′ − F′ − O′ − A′ − K；全部中間值不先取分",
  delta: "條件差額 = 未取分條件貢獻 − baseline 行銷後貢獻；最後 ROUND_HALF_UP 取兩位小數",
  rounding_adjustment: "取分調整 = 已取分條件貢獻 −（畫面 G′ − D′ − R′ − C′ − P′ − Q′ − F′ − O′ − A′ − K）；不代表其他成本或收益",
};
export interface ScenarioInputs {
  volume_change_pct: string;
  discount_change_pp: string;
  fulfillment_change_pct: string;
  ad_change_pct: string;
  one_time_cost: string;
  assumptions_accepted: boolean;
}
export interface ScenarioReason { code: string; message: string; field?: string }
export type ScenarioAmountField = AmountField | "net_revenue" | "gross_profit" | "contribution_before_marketing" | "contribution_after_marketing";
export interface ScenarioRates {
  discount_rate: string | null;
  refund_ratio: string | null;
  platform_rate: string | null;
  payment_rate: string | null;
}
export interface ScenarioBaseline {
  version: typeof SCENARIO_VERSION;
  eligible: boolean;
  reasons: ScenarioReason[];
  coverage_confirmed: boolean;
  amounts: Record<ScenarioAmountField, string | null>;
  rates: ScenarioRates;
  sources: SourceRef[];
}
interface ResultCommon {
  version: typeof SCENARIO_VERSION;
  inputs: ScenarioInputs;
  assumptions: string[];
  formulas: Record<string, string>;
  reasons: ScenarioReason[];
}
export type ScenarioResult = ResultCommon & (
  { status: "valid"; amounts: Record<ScenarioAmountField | "one_time_cost", string>; contribution: string; delta: string; rounding_adjustment: string; rates: Record<keyof ScenarioRates, string> }
  | { status: "invalid" | "ineligible"; amounts: null; contribution: null; delta: null; rounding_adjustment: null; rates: null }
);
const costFields = ["cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"] as const;
const derivedFields = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const;
const numericInputs = ["volume_change_pct", "discount_change_pp", "fulfillment_change_pct", "ad_change_pct", "one_time_cost"] as const;

function preciseContext(values: readonly (string | null)[]) {
  // Scale precision with all input digits rather than relying on Decimal's 20
  // significant-digit default. Every invocation has private arithmetic settings.
  const precision = Math.max(80, values.reduce<number>((total, value) => total + (value?.length ?? 0), 0) + 80);
  return Decimal.clone({ precision, rounding: Decimal.ROUND_HALF_UP });
}
function eligibility(amounts: ScenarioBaseline["amounts"], coverage: boolean): ScenarioReason[] {
  const reasons: ScenarioReason[] = [];
  if (!coverage) reasons.push({ code: "BASELINE_COVERAGE_UNCONFIRMED", message: "資料涵蓋範圍尚未完整確認，暫不可試算。" });
  const cents: Partial<Record<ScenarioAmountField, bigint>> = {};
  for (const field of [...AMOUNT_FIELDS, "net_revenue", "contribution_after_marketing"] as const) {
    let value: bigint | null;
    try { value = parseCents(amounts[field]); } catch { value = null; }
    if (value === null) reasons.push({ code: "BASELINE_MISSING_AMOUNT", field, message: `基準 ${field} 缺漏或格式不合法；保留未知，不補零試算。` });
    else cents[field] = value;
  }
  for (const field of costFields) {
    if (cents[field] !== undefined && cents[field]! < 0n) reasons.push({ code: "BASELINE_NEGATIVE_COST", field, message: `基準 ${field} 為負的已入帳沖回，本模型暫不適用；實際金額診斷仍保留。` });
  }
  const G = cents.gross_sales, D = cents.discounts, R = cents.refunds, N = cents.net_revenue;
  if (G !== undefined && G <= 0n) reasons.push({ code: "BASELINE_NON_POSITIVE_GROSS", field: "gross_sales", message: "基準折扣前收入須大於零。" });
  if (N !== undefined && N <= 0n) reasons.push({ code: "BASELINE_NON_POSITIVE_NET", field: "net_revenue", message: "基準商品淨營收須大於零；純退款與非正淨營收期間不適用此模型。" });
  if (G !== undefined && D !== undefined && (D < 0n || D >= G)) reasons.push({ code: "BASELINE_DISCOUNT_RATE_OUT_OF_RANGE", field: "discounts", message: "基準折扣率須介於 0（含）與 100%（不含）。" });
  if (G !== undefined && D !== undefined && R !== undefined && (R < 0n || R >= G - D)) reasons.push({ code: "BASELINE_REFUND_RATIO_OUT_OF_RANGE", field: "refunds", message: "基準入帳退款金額比須介於 0（含）與 100%（不含）。" });
  return reasons;
}

/** Caller supplies the current single-channel Summary; no actual source values are modified. */
export function buildScenarioBaseline(summary: Summary, coverageConfirmed: boolean): ScenarioBaseline {
  const metrics = calculateMetrics(summary.totals);
  const amounts = Object.fromEntries([...AMOUNT_FIELDS, ...derivedFields].map(field => [field, metrics[field].value])) as ScenarioBaseline["amounts"];
  const reasons = eligibility(amounts, coverageConfirmed === true);
  const rates: ScenarioRates = { discount_rate: null, refund_ratio: null, platform_rate: null, payment_rate: null };
  if (reasons.length === 0) {
    const Exact = preciseContext(Object.values(amounts));
    const G = new Exact(amounts.gross_sales!), D = new Exact(amounts.discounts!), N = new Exact(amounts.net_revenue!);
    rates.discount_rate = D.div(G).toFixed(12);
    rates.refund_ratio = new Exact(amounts.refunds!).div(G.minus(D)).toFixed(12);
    rates.platform_rate = new Exact(amounts.platform_fees!).div(N).toFixed(12);
    rates.payment_rate = new Exact(amounts.payment_fees!).div(N).toFixed(12);
  }
  return { version: SCENARIO_VERSION, eligible: reasons.length === 0, reasons, coverage_confirmed: coverageConfirmed === true, amounts, rates, sources: summary.sources.map(source => ({ ...source })) };
}

/** All inputs are explicit. Each call starts from baseline, never from another result. */
export function calculateScenario(baseline: ScenarioBaseline, inputs: ScenarioInputs): ScenarioResult {
  const common = { version: SCENARIO_VERSION, inputs: { ...inputs }, assumptions: [...SCENARIO_ASSUMPTIONS], formulas: { ...SCENARIO_FORMULAS } };
  const unavailable = (status: "invalid" | "ineligible", reasons: ScenarioReason[]): ScenarioResult => ({ ...common, status, reasons, amounts: null, contribution: null, delta: null, rounding_adjustment: null, rates: null });
  const baselineReasons = eligibility(baseline.amounts, baseline.coverage_confirmed);
  if (!baseline.eligible || baselineReasons.length) return unavailable("ineligible", baselineReasons.length ? baselineReasons : baseline.reasons.map(reason => ({ ...reason })));
  if (inputs.assumptions_accepted !== true) return unavailable("ineligible", [{ code: "ASSUMPTIONS_NOT_ACCEPTED", field: "assumptions_accepted", message: "尚未接受全部固定模型假設，此方案暫不適用。" }]);
  const reasons: ScenarioReason[] = [];
  for (const field of numericInputs) {
    const value = inputs[field];
    if (typeof value !== "string" || value.trim() === "") reasons.push({ code: "INPUT_REQUIRED", field, message: "請明確填寫此假設；未輸入不等於零。" });
    else if (!(field === "one_time_cost" ? /^-?\d+(?:\.\d{1,2})?$/ : /^[+-]?\d+(?:\.\d+)?$/).test(value)) reasons.push({ code: "INVALID_NUMBER", field, message: field === "one_time_cost" ? "一次性投入須為最多兩位小數的非負金額。" : "請輸入十進位數字，不含 %、千分位或科學記號。" });
  }
  if (reasons.length) return unavailable("invalid", reasons);
  const Exact = preciseContext([...Object.values(baseline.amounts), ...numericInputs.map(field => inputs[field])]);
  const changes = Object.fromEntries(numericInputs.map(field => [field, new Exact(inputs[field])])) as Record<typeof numericInputs[number], Decimal>;
  for (const [field, min, max] of [["volume_change_pct", -90, 100], ["fulfillment_change_pct", -100, 100], ["ad_change_pct", -100, 200]] as const) {
    if (changes[field].lt(min) || changes[field].gt(max)) reasons.push({ code: "INPUT_OUT_OF_RANGE", field, message: `此變化假設須介於 ${min}% 與 ${max}%（含邊界）；這是產品防呆範圍，不是預測。` });
  }
  if (changes.one_time_cost.lt(0)) reasons.push({ code: "INPUT_OUT_OF_RANGE", field: "one_time_cost", message: "一次性投入不可為負。" });
  const base = Object.fromEntries(AMOUNT_FIELDS.map(field => [field, new Exact(baseline.amounts[field]!)])) as Record<AmountField, Decimal>;
  const N = new Exact(baseline.amounts.net_revenue!);
  const discountAmountAtBaseVolume = base.discounts.plus(base.gross_sales.times(changes.discount_change_pp.div(100)));
  if (discountAmountAtBaseVolume.lt(0) || discountAmountAtBaseVolume.gte(base.gross_sales)) reasons.push({ code: "SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE", field: "discount_change_pp", message: "調整後折扣率須介於 0（含）與 100%（不含）；此欄是百分點變化。" });
  if (reasons.length) return unavailable("invalid", reasons);

  const scale = changes.volume_change_pct.div(100).plus(1);
  const G = base.gross_sales.times(scale);
  // Algebraically D′=G′×(D/G+δ), with multiplication before division to keep
  // zero-change and exact half-cent cases stable even for repeating base ratios.
  const D = discountAmountAtBaseVolume.times(scale);
  const afterDiscount = G.minus(D);
  const baseAfterDiscount = base.gross_sales.minus(base.discounts);
  const R = afterDiscount.times(base.refunds).div(baseAfterDiscount);
  const net = afterDiscount.times(N).div(baseAfterDiscount);
  const C = base.cogs_net.times(scale);
  // N′/N = (G′−D′)/(G−D) in this closed model; the original N is positive.
  const P = afterDiscount.times(base.platform_fees).div(baseAfterDiscount);
  const Q = afterDiscount.times(base.payment_fees).div(baseAfterDiscount);
  const F = base.fulfillment_costs.times(scale).times(changes.fulfillment_change_pct.div(100).plus(1));
  const O = base.other_variable_costs.times(scale);
  const A = base.ad_spend.times(changes.ad_change_pct.div(100).plus(1));
  const K = changes.one_time_cost;
  const grossProfit = net.minus(C);
  // Combine the common exact ratio before division. This is the same unrounded
  // N′−P′−Q′ formula and avoids cancellation between separately repeating ratios.
  const before = afterDiscount.times(N.minus(base.platform_fees).minus(base.payment_fees)).div(baseAfterDiscount).minus(C).minus(F).minus(O);
  const contribution = before.minus(A).minus(K);
  const delta = contribution.minus(baseline.amounts.contribution_after_marketing!);
  const rounded = (value: Decimal): string => { const result = value.toFixed(2, Decimal.ROUND_HALF_UP); return result === "-0.00" ? "0.00" : result; };
  const amounts: Record<ScenarioAmountField | "one_time_cost", string> = {
    gross_sales: rounded(G), discounts: rounded(D), refunds: rounded(R), cogs_net: rounded(C),
    platform_fees: rounded(P), payment_fees: rounded(Q), fulfillment_costs: rounded(F), other_variable_costs: rounded(O), ad_spend: rounded(A),
    net_revenue: rounded(net), gross_profit: rounded(grossProfit), contribution_before_marketing: rounded(before),
    contribution_after_marketing: rounded(contribution), one_time_cost: rounded(K),
  };
  let displayedCents = parseCents(amounts.gross_sales)!;
  for (const field of AMOUNT_FIELDS) if (field !== "gross_sales") displayedCents -= parseCents(amounts[field])!;
  displayedCents -= parseCents(amounts.one_time_cost)!;
  const adjustment = parseCents(amounts.contribution_after_marketing)! - displayedCents;
  return {
    ...common, status: "valid", reasons: [], amounts,
    contribution: rounded(contribution), delta: rounded(delta), rounding_adjustment: formatCents(adjustment),
    rates: { discount_rate: discountAmountAtBaseVolume.div(base.gross_sales).toFixed(12), refund_ratio: base.refunds.div(baseAfterDiscount).toFixed(12), platform_rate: base.platform_fees.div(N).toFixed(12), payment_rate: base.payment_fees.div(N).toFixed(12) },
  };
}
