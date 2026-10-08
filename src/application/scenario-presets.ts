import Decimal from "decimal.js";
import type { ScenarioBaseline, ScenarioInputs } from "../domain/scenarios";
import { fill, labels } from "../i18n";
import { formatAmountL3 } from "./presentation";

/**
 * R5-3 試算範本與絕對值輸入（05 §8、02 §6）。全部在表單層：
 * - 範本只填五個輸入欄位，不勾「我接受假設」、不計算，也不寫入 domain。
 * - 絕對值模式把「目標件數／新折扣率／新預算」換算成引擎要的相對值；送進 calculateScenario 的仍是相對值字串。
 */
export type ScenarioNumericField = keyof Omit<ScenarioInputs, "assumptions_accepted">;
export type ScenarioPresetInputs = Omit<ScenarioInputs, "assumptions_accepted">;
export type ScenarioPresetId = "keep" | "double11" | "cut_ads_half" | "cancel_free_shipping" | "price_up_5" | "kol";
export interface ScenarioPreset { id: ScenarioPresetId; name: string; purpose: string; inputs: ScenarioPresetInputs }

/** 05 §8 表：銷量 %／折扣率百分點／每件物流費 %／廣告預算 %／一次性（元）。字串是引擎接受的十進位，不加「+」。 */
const PRESET_INPUTS: Record<ScenarioPresetId, ScenarioPresetInputs> = {
  keep: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0" },
  double11: { volume_change_pct: "60", discount_change_pp: "5", fulfillment_change_pct: "0", ad_change_pct: "100", one_time_cost: "0" },
  cut_ads_half: { volume_change_pct: "-20", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "-50", one_time_cost: "0" },
  cancel_free_shipping: { volume_change_pct: "-10", discount_change_pp: "0", fulfillment_change_pct: "-40", ad_change_pct: "0", one_time_cost: "0" },
  price_up_5: { volume_change_pct: "-5", discount_change_pp: "-5", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0" },
  kol: { volume_change_pct: "15", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "50000" },
};
export const SCENARIO_PRESET_IDS: readonly ScenarioPresetId[] = Object.freeze(["keep", "double11", "cut_ads_half", "cancel_free_shipping", "price_up_5", "kol"]);
export const SCENARIO_PRESETS: readonly ScenarioPreset[] = Object.freeze(SCENARIO_PRESET_IDS.map(id => Object.freeze({
  id, name: labels.scenarios.presets.items[id].name, purpose: labels.scenarios.presets.items[id].purpose, inputs: Object.freeze({ ...PRESET_INPUTS[id] }),
})));

/** 只覆寫五個輸入欄位；assumptions_accepted 保持原值（範本不代替使用者勾選假設）。 */
export function applyPreset(inputs: ScenarioInputs, id: ScenarioPresetId): ScenarioInputs {
  if (!Object.hasOwn(PRESET_INPUTS, id)) throw new Error("UNKNOWN_SCENARIO_PRESET");
  return { ...inputs, ...PRESET_INPUTS[id], assumptions_accepted: inputs.assumptions_accepted };
}

/**
 * 引擎的含邊界防呆範圍，抄自 src/domain/scenarios.ts 的 INPUT_OUT_OF_RANGE 檢查與 docs/SCENARIOS.md（v、f、a）。
 * 這裡只拿來即時提示；真正的檢核仍由 calculateScenario 做。折扣與一次性另有規則（見 rangeHint）。
 */
export const SCENARIO_INPUT_BOUNDS = Object.freeze({
  volume_change_pct: Object.freeze({ min: -90, max: 100 }),
  fulfillment_change_pct: Object.freeze({ min: -100, max: 100 }),
  ad_change_pct: Object.freeze({ min: -100, max: 200 }),
});
/** 與 calculateScenario 相同的格式規則。 */
const RELATIVE_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
const ONE_TIME_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export type AbsoluteField = "volume_change_pct" | "discount_change_pp" | "ad_change_pct";
export const ABSOLUTE_FIELDS: readonly AbsoluteField[] = Object.freeze(["volume_change_pct", "discount_change_pp", "ad_change_pct"]);
export interface AbsoluteContext {
  /** 本期售出件數（R4 Summary.units_sold.value）；null＝缺漏。 */
  units_sold: bigint | null;
  /** baseline.rates.discount_rate：12 位小數比率（0.1 = 10%）；null＝基準不適用。只在沒有 gross_sales／discounts 時拿來換算折扣。 */
  discount_rate: string | null;
  /** baseline.amounts.ad_spend：金額字串；null＝缺漏。 */
  ad_spend: string | null;
  /** baseline.amounts.gross_sales／discounts：折扣換算用精確的 D、G（與引擎 D + G·δ/100 同口徑）；沒有時退回 discount_rate。 */
  gross_sales?: string | null;
  discounts?: string | null;
}
export interface AbsoluteConversion { relative: string | null; equivalent: string; error?: string }

/** 由試算基準與本期件數組出換算用的本期值（UI 接線用）。 */
export function absoluteContext(baseline: Pick<ScenarioBaseline, "rates" | "amounts">, unitsSold: bigint | null): AbsoluteContext {
  return { units_sold: unitsSold, discount_rate: baseline.rates.discount_rate, ad_spend: baseline.amounts.ad_spend, gross_sales: baseline.amounts.gross_sales, discounts: baseline.amounts.discounts };
}

function exact(...values: (string | null | undefined)[]) {
  // 精度至少 60 位，且隨輸入長度放大；每次呼叫各自設定，不改全域 Decimal。
  const digits = values.reduce<number>((total, value) => total + (value?.length ?? 0), 0);
  return Decimal.clone({ precision: Math.max(60, digits + 40), rounding: Decimal.ROUND_HALF_UP });
}
function decimalOrNull(Exact: typeof Decimal, value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  return new Exact(value);
}
/**
 * 送進引擎的相對值位數：12 位小數足以讓換算回去的件數（本期件數 < 10^14）與預算（本期廣告費 < 10^12 元）落回使用者輸入；
 * 引擎界限內的值最多 17 字，遠低於備份 schema 每格 100 字的上限。
 */
const RELATIVE_DECIMALS = 12;
const MAX_RELATIVE_LENGTH = 100;
/** 反推折扣率（%）時保留的位數：吸收 12 位小數相對值的捨入誤差，讓「12」換算回去仍是「12」。 */
const RATE_DECIMALS = 10;
/** 送進引擎的相對值：ROUND_HALF_UP 到 12 位小數、去尾零；−0 寫成 "0"。 */
function relativeText(value: Decimal): string {
  return textOf(value.toDecimalPlaces(RELATIVE_DECIMALS, Decimal.ROUND_HALF_UP));
}
function textOf(value: Decimal): string {
  return value.isZero() ? "0" : value.toFixed();
}
type DiscountBase = { G: Decimal; D: Decimal };
/** 本期折扣的 D、G：有 gross_sales／discounts 用精確金額，否則以 discount_rate 當 D、G = 1；本期折扣率不在 [0, 100%) 時 null。 */
function discountBase(Exact: typeof Decimal, ctx: Pick<AbsoluteContext, "discount_rate" | "gross_sales" | "discounts">): DiscountBase | null {
  const G = decimalOrNull(Exact, ctx.gross_sales), D = decimalOrNull(Exact, ctx.discounts);
  if (G !== null && D !== null) return G.gt(0) && D.gte(0) && D.lt(G) ? { G, D } : null;
  const rate = decimalOrNull(Exact, ctx.discount_rate);
  return rate !== null && rate.gte(0) && rate.lt(1) ? { G: new Exact(1), D: rate } : null;
}
/** 與引擎 SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE 相同：調整後折扣金額 D + G·δ/100 須在 [0, G)。 */
function discountAt(base: DiscountBase, change: Decimal): Decimal {
  return base.D.plus(base.G.times(change.div(100)));
}
function discountFeasible(base: DiscountBase, change: Decimal): boolean {
  const next = discountAt(base, change);
  return next.gte(0) && next.lt(base.G);
}
/**
 * 折扣的相對值：取 12 位小數後，若 D + G·δ/100 掉出 [0, G)（例如新折扣率 0% 時 −D/G 的捨入多扣了一點），往可行側移一個最小單位。
 * 使用者輸入的新折扣率在 [0, 100) 時，捨入誤差不到半個單位，移一格必定回到可行範圍。
 */
function feasibleDiscountText(Exact: typeof Decimal, base: DiscountBase, change: Decimal): string {
  const unit = new Exact(10).pow(-RELATIVE_DECIMALS);
  let rounded = change.toDecimalPlaces(RELATIVE_DECIMALS, Decimal.ROUND_HALF_UP);
  const next = discountAt(base, rounded);
  if (next.lt(0)) rounded = rounded.plus(unit);
  else if (next.gte(base.G)) rounded = rounded.minus(unit);
  return textOf(rounded);
}
/** 畫面用：一位小數、帶正負號（負號用 −）；四捨五入後為 0 不帶符號。 */
function signedOneDecimal(value: Decimal): string {
  const text = value.toFixed(1, Decimal.ROUND_HALF_UP);
  if (/^-?0\.0$/.test(text)) return "0.0";
  return text.startsWith("-") ? `−${text.slice(1)}` : `+${text}`;
}
function plainOneDecimal(value: Decimal): string {
  const text = value.toFixed(1, Decimal.ROUND_HALF_UP);
  if (/^-?0\.0$/.test(text)) return "0.0";
  return text.startsWith("-") ? `−${text.slice(1)}` : text;
}
function groupDigits(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function boundText(value: number): string {
  return value < 0 ? `−${-value}` : value > 0 ? `+${value}` : "0";
}

/** 這一格能不能用絕對值輸入：件數缺或 ≤ 0、本期廣告費缺或 ≤ 0、本期折扣率缺或不在 [0, 100%) 時停用，reason 是給畫面的一句話。 */
export function absoluteAvailability(field: AbsoluteField, ctx: AbsoluteContext): { available: boolean; reason?: string } {
  const reason = labels.scenarios.presets.absolute.unavailable[field];
  if (field === "volume_change_pct") return ctx.units_sold !== null && ctx.units_sold > 0n ? { available: true } : { available: false, reason };
  if (field === "discount_change_pp") return discountBase(exact(ctx.discount_rate, ctx.gross_sales, ctx.discounts), ctx) !== null ? { available: true } : { available: false, reason };
  const ad = decimalOrNull(exact(ctx.ad_spend), ctx.ad_spend);
  return ad !== null && ad.gt(0) ? { available: true } : { available: false, reason };
}
function contextExact(ctx: AbsoluteContext, ...texts: string[]) {
  return exact(...texts, ctx.discount_rate, ctx.ad_spend, ctx.gross_sales, ctx.discounts, ctx.units_sold?.toString());
}

/**
 * 絕對值 → 相對值（表單層）：
 * - 銷量：v = (目標件數 ÷ 本期件數 − 1) × 100；目標件數為非負整數。
 * - 折扣率：δ = 新折扣率(%) − 100·D/G（百分點，D、G 為本期精確金額）；0 ≤ 新折扣率 < 100，取位後保證 D + G·δ/100 ∈ [0, G)。
 * - 廣告預算：a = (新預算 ÷ 本期廣告費 − 1) × 100；新預算為非負金額（最多兩位小數）。
 * 相對值取 12 位小數（見 RELATIVE_DECIMALS）；「＝ 相對 +x.x%」由未取位的精確值取一位小數，不做兩次捨入。
 * 空白輸入回傳 relative null 且沒有 error（尚未填）；不可用或格式不合 → relative null ＋ error。
 */
export function absoluteToRelative(field: AbsoluteField, absoluteText: string, ctx: AbsoluteContext): AbsoluteConversion {
  const availability = absoluteAvailability(field, ctx);
  if (!availability.available) return { relative: null, equivalent: "", error: availability.reason };
  const text = typeof absoluteText === "string" ? absoluteText.trim() : "";
  if (text === "") return { relative: null, equivalent: "" };
  const copy = labels.scenarios.presets.absolute;
  const invalid = (): AbsoluteConversion => ({ relative: null, equivalent: "", error: copy.errors[field] });
  const Exact = contextExact(ctx, text);
  let relative: Decimal;
  let value: string;
  if (field === "volume_change_pct") {
    if (!/^\d+$/.test(text)) return invalid();
    relative = new Exact(text).div(ctx.units_sold!.toString()).minus(1).times(100);
    value = relativeText(relative);
  } else if (field === "discount_change_pp") {
    if (!/^\d+(?:\.\d+)?$/.test(text)) return invalid();
    const next = new Exact(text);
    if (next.gte(100)) return invalid();
    const base = discountBase(Exact, ctx)!;
    relative = next.minus(base.D.div(base.G).times(100));
    value = feasibleDiscountText(Exact, base, relative);
  } else {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return invalid();
    relative = new Exact(text).div(ctx.ad_spend!).minus(1).times(100);
    value = relativeText(relative);
  }
  // 只有遠超引擎界限的目標（例如幾十位數的件數）才會超過 100 字；不寫進方案，直接提示界限。
  if (value.length > MAX_RELATIVE_LENGTH) {
    const bounds = field === "discount_change_pp" ? null : SCENARIO_INPUT_BOUNDS[field];
    return { relative: null, equivalent: "", error: bounds ? fill(labels.scenarios.presets.range.pct, { min: boundText(bounds.min), max: boundText(bounds.max) }) : copy.errors[field] };
  }
  const template = field === "discount_change_pp" ? copy.equivalentPoints : copy.equivalentPct;
  return { relative: value, equivalent: fill(template, { value: signedOneDecimal(relative) }) };
}

type Reverse = { field: "volume_change_pct"; target: Decimal; integer: Decimal | null } | { field: "discount_change_pp"; rate: Decimal } | { field: "ad_change_pct"; budget: Decimal };
/**
 * 相對值 → 本期值換算後的絕對值（未格式化）。件數：若相對值正是某個整數件數經 absoluteToRelative 取位後的結果，視為該整數
 * （12 位小數的 33.333333333333% 對 3 件就是 4 件，不顯示「約」）。本期值不可用、格式不合、換算後為負或折扣率不在 [0, 100%) → null。
 */
function reverse(field: AbsoluteField, relativeTextValue: string, ctx: AbsoluteContext): Reverse | null {
  if (!absoluteAvailability(field, ctx).available) return null;
  const text = typeof relativeTextValue === "string" ? relativeTextValue.trim() : "";
  if (!RELATIVE_PATTERN.test(text)) return null;
  const Exact = contextExact(ctx, text);
  const change = new Exact(text);
  if (field === "volume_change_pct") {
    const units = new Exact(ctx.units_sold!.toString());
    const target = units.times(change.div(100).plus(1));
    if (target.lt(0)) return null;
    if (target.isInteger()) return { field, target, integer: target };
    const nearest = target.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const snapped = new Exact(relativeText(nearest.div(units).minus(1).times(100))).eq(change);
    return { field, target, integer: snapped ? nearest : null };
  }
  if (field === "discount_change_pp") {
    const base = discountBase(Exact, ctx)!;
    if (!discountFeasible(base, change)) return null;
    return { field, rate: discountAt(base, change).div(base.G).times(100) };
  }
  const budget = new Exact(ctx.ad_spend!).times(change.div(100).plus(1));
  return budget.lt(0) ? null : { field, budget };
}

/**
 * 相對值 → 絕對值的等值文字（反向顯示用）：「＝ 目標 1,234 件」「＝ 新折扣率 12.0%」「＝ 新預算 12,345.00」。
 * 本期值不可用、輸入空白或格式不合、換算後為負（或折扣率不在 0–100%）時回傳 null。
 */
export function relativeToAbsolute(field: AbsoluteField, relativeTextValue: string, ctx: AbsoluteContext): string | null {
  const result = reverse(field, relativeTextValue, ctx);
  if (result === null) return null;
  const copy = labels.scenarios.presets.absolute;
  if (result.field === "volume_change_pct") {
    const rounded = (result.integer ?? result.target).toFixed(0, Decimal.ROUND_HALF_UP);
    const units = fill(labels.assist.units.count, { value: groupDigits(rounded) });
    return fill(result.integer ? copy.equivalentUnits : copy.equivalentUnitsApprox, { value: units });
  }
  if (result.field === "discount_change_pp") return fill(copy.equivalentDiscountRate, { value: plainOneDecimal(result.rate) });
  // 預算輸入到分，等值提示用 L3（千分位、兩位小數；換算後為負已在 reverse 擋掉）。
  return fill(copy.equivalentBudget, { value: formatAmountL3(result.budget.toFixed(2, Decimal.ROUND_HALF_UP)) });
}

/**
 * 相對值 → 絕對值輸入框的預填文字（未格式化）：件數 "6"、折扣率 "12"、預算 "1500.00"。切換到「絕對值」時用，不改方案的相對值。
 * 件數不是整數時回傳精確小數（例如 "8.8"），由畫面提示改成整數；折扣率取 10 位小數去尾零；預算取兩位小數。
 */
export function relativeToAbsoluteValue(field: AbsoluteField, relativeTextValue: string, ctx: AbsoluteContext): string | null {
  const result = reverse(field, relativeTextValue, ctx);
  if (result === null) return null;
  if (result.field === "volume_change_pct") return textOf(result.integer ?? result.target);
  if (result.field === "discount_change_pp") return textOf(result.rate.toDecimalPlaces(RATE_DECIMALS, Decimal.ROUND_HALF_UP));
  return result.budget.toFixed(2, Decimal.ROUND_HALF_UP);
}

/** 絕對值模式下、尚未改動預填值時的等值文字：直接由方案目前的相對值取一位小數（「＝ 相對 +50.0%」「＝ 相對 +2.0 點」）。 */
export function relativeEquivalent(field: AbsoluteField, relativeTextValue: string): string | null {
  const text = typeof relativeTextValue === "string" ? relativeTextValue.trim() : "";
  if (!RELATIVE_PATTERN.test(text)) return null;
  const copy = labels.scenarios.presets.absolute;
  return fill(field === "discount_change_pp" ? copy.equivalentPoints : copy.equivalentPct, { value: signedOneDecimal(new (exact(text))(text)) });
}

/**
 * 即時界限提示（引擎輸入是相對值）：格式不合、v／f／a 超出含邊界範圍、調整後折扣金額 D + G·δ/100 不在 [0, G)
 * （與引擎相同；需 ctx 的 gross_sales／discounts，沒有時退回 discount_rate）、一次性為負或超過兩位小數。空白或在範圍內回傳 null。
 */
export function rangeHint(field: ScenarioNumericField, relativeTextValue: string, ctx?: Pick<AbsoluteContext, "discount_rate" | "gross_sales" | "discounts">): string | null {
  const copy = labels.scenarios.presets.range;
  const text = typeof relativeTextValue === "string" ? relativeTextValue.trim() : "";
  if (text === "") return null;
  if (field === "one_time_cost") {
    // 與引擎相同：格式先過 /^-?\d+(?:\.\d{1,2})?$/，再擋 < 0（"-0" 視為 0）。
    return !ONE_TIME_PATTERN.test(text) || new (exact(text))(text).lt(0) ? copy.oneOff : null;
  }
  if (!RELATIVE_PATTERN.test(text)) return copy.invalidNumber;
  const Exact = exact(text, ctx?.discount_rate, ctx?.gross_sales, ctx?.discounts);
  const value = new Exact(text);
  if (field === "discount_change_pp") {
    const base = ctx ? discountBase(Exact, ctx) : null;
    if (base === null || discountFeasible(base, value)) return null;
    const rate = discountAt(base, value).div(base.G).times(100);
    const shown = plainOneDecimal(rate);
    // 只差一點點就低於 0% 時，一位小數會是 0.0；標成 −0.0 讓人看得出是負的。
    return fill(copy.discount, { rate: rate.lt(0) && shown === "0.0" ? "−0.0" : shown });
  }
  const bounds = SCENARIO_INPUT_BOUNDS[field];
  return value.lt(bounds.min) || value.gt(bounds.max) ? fill(copy.pct, { min: boundText(bounds.min), max: boundText(bounds.max) }) : null;
}
