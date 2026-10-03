import Decimal from "decimal.js";
import type { ScenarioBaseline, ScenarioInputs } from "../domain/scenarios";
import { fill, labels } from "../i18n";
import { formatMoney } from "./presentation";

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
  id, name: labels.scenarioPresets.items[id].name, purpose: labels.scenarioPresets.items[id].purpose, inputs: Object.freeze({ ...PRESET_INPUTS[id] }),
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
  /** baseline.rates.discount_rate：12 位小數比率（0.1 = 10%）；null＝基準不適用。 */
  discount_rate: string | null;
  /** baseline.amounts.ad_spend：金額字串；null＝缺漏。 */
  ad_spend: string | null;
}
export interface AbsoluteConversion { relative: string | null; equivalent: string; error?: string }

/** 由試算基準與本期件數組出換算用的本期值（UI 接線用）。 */
export function absoluteContext(baseline: Pick<ScenarioBaseline, "rates" | "amounts">, unitsSold: bigint | null): AbsoluteContext {
  return { units_sold: unitsSold, discount_rate: baseline.rates.discount_rate, ad_spend: baseline.amounts.ad_spend };
}

function exact(...values: (string | null | undefined)[]) {
  // 精度至少 60 位，且隨輸入長度放大；每次呼叫各自設定，不改全域 Decimal。
  const digits = values.reduce<number>((total, value) => total + (value?.length ?? 0), 0);
  return Decimal.clone({ precision: Math.max(60, digits + 40), rounding: Decimal.ROUND_HALF_UP });
}
function decimalOrNull(Exact: typeof Decimal, value: string | null): Decimal | null {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  return new Exact(value);
}
/** 送進引擎的相對值：ROUND_HALF_UP 到 4 位小數、去尾零；−0 寫成 "0"。 */
function relativeText(value: Decimal): string {
  const rounded = value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? "0" : rounded.toFixed();
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

/** 這一格能不能用絕對值輸入：件數缺或 ≤ 0、本期廣告費缺或 ≤ 0、本期折扣率缺時停用，reason 是給畫面的一句話。 */
export function absoluteAvailability(field: AbsoluteField, ctx: AbsoluteContext): { available: boolean; reason?: string } {
  const reason = labels.scenarioPresets.absolute.unavailable[field];
  if (field === "volume_change_pct") return ctx.units_sold !== null && ctx.units_sold > 0n ? { available: true } : { available: false, reason };
  if (field === "discount_change_pp") {
    const rate = decimalOrNull(exact(ctx.discount_rate), ctx.discount_rate);
    return rate !== null && rate.gte(0) && rate.lt(1) ? { available: true } : { available: false, reason };
  }
  const ad = decimalOrNull(exact(ctx.ad_spend), ctx.ad_spend);
  return ad !== null && ad.gt(0) ? { available: true } : { available: false, reason };
}

/**
 * 絕對值 → 相對值（表單層）：
 * - 銷量：v = (目標件數 ÷ 本期件數 − 1) × 100；目標件數為非負整數。
 * - 折扣率：δ = 新折扣率(%) − 本期折扣率(%)（百分點）；0 ≤ 新折扣率 < 100。
 * - 廣告預算：a = (新預算 ÷ 本期廣告費 − 1) × 100；新預算為非負金額（最多兩位小數）。
 * 空白輸入回傳 relative null 且沒有 error（尚未填）；不可用或格式不合 → relative null ＋ error。
 */
export function absoluteToRelative(field: AbsoluteField, absoluteText: string, ctx: AbsoluteContext): AbsoluteConversion {
  const availability = absoluteAvailability(field, ctx);
  if (!availability.available) return { relative: null, equivalent: "", error: availability.reason };
  const text = typeof absoluteText === "string" ? absoluteText.trim() : "";
  if (text === "") return { relative: null, equivalent: "" };
  const copy = labels.scenarioPresets.absolute;
  const invalid = (): AbsoluteConversion => ({ relative: null, equivalent: "", error: copy.errors[field] });
  const Exact = exact(text, ctx.discount_rate, ctx.ad_spend, ctx.units_sold?.toString());
  let relative: Decimal;
  if (field === "volume_change_pct") {
    if (!/^\d+$/.test(text)) return invalid();
    relative = new Exact(text).div(ctx.units_sold!.toString()).minus(1).times(100);
  } else if (field === "discount_change_pp") {
    if (!/^\d+(?:\.\d+)?$/.test(text)) return invalid();
    const next = new Exact(text);
    if (next.gte(100)) return invalid();
    relative = next.minus(new Exact(ctx.discount_rate!).times(100));
  } else {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return invalid();
    relative = new Exact(text).div(ctx.ad_spend!).minus(1).times(100);
  }
  const value = relativeText(relative);
  const template = field === "discount_change_pp" ? copy.equivalentPoints : copy.equivalentPct;
  return { relative: value, equivalent: fill(template, { value: signedOneDecimal(new Exact(value)) }) };
}

/**
 * 相對值 → 絕對值的等值文字（反向顯示用）：「＝ 目標 1,234 件」「＝ 新折扣率 12.0%」「＝ 新預算 12,345.00」。
 * 本期值不可用、輸入空白或格式不合、換算後為負（或折扣率不在 0–100%）時回傳 null。
 */
export function relativeToAbsolute(field: AbsoluteField, relativeTextValue: string, ctx: AbsoluteContext): string | null {
  if (!absoluteAvailability(field, ctx).available) return null;
  const text = typeof relativeTextValue === "string" ? relativeTextValue.trim() : "";
  if (!RELATIVE_PATTERN.test(text)) return null;
  const copy = labels.scenarioPresets.absolute;
  const Exact = exact(text, ctx.discount_rate, ctx.ad_spend, ctx.units_sold?.toString());
  const change = new Exact(text);
  if (field === "volume_change_pct") {
    const target = new Exact(ctx.units_sold!.toString()).times(change.div(100).plus(1));
    if (target.lt(0)) return null;
    const rounded = target.toFixed(0, Decimal.ROUND_HALF_UP);
    const units = fill(labels.assist.units.count, { value: groupDigits(rounded) });
    return fill(target.isInteger() ? copy.equivalentUnits : copy.equivalentUnitsApprox, { value: units });
  }
  if (field === "discount_change_pp") {
    const rate = new Exact(ctx.discount_rate!).times(100).plus(change);
    if (rate.lt(0) || rate.gte(100)) return null;
    return fill(copy.equivalentDiscountRate, { value: plainOneDecimal(rate) });
  }
  const budget = new Exact(ctx.ad_spend!).times(change.div(100).plus(1));
  if (budget.lt(0)) return null;
  return fill(copy.equivalentBudget, { value: formatMoney(budget.toFixed(2, Decimal.ROUND_HALF_UP)) });
}

/**
 * 即時界限提示（引擎輸入是相對值）：格式不合、v／f／a 超出含邊界範圍、換算後折扣率不在 [0%, 100%)（需 ctx.discount_rate）、
 * 一次性為負或超過兩位小數。空白或在範圍內回傳 null。
 */
export function rangeHint(field: ScenarioNumericField, relativeTextValue: string, ctx?: Pick<AbsoluteContext, "discount_rate">): string | null {
  const copy = labels.scenarioPresets.range;
  const text = typeof relativeTextValue === "string" ? relativeTextValue.trim() : "";
  if (text === "") return null;
  if (field === "one_time_cost") {
    // 與引擎相同：格式先過 /^-?\d+(?:\.\d{1,2})?$/，再擋 < 0（"-0" 視為 0）。
    return !ONE_TIME_PATTERN.test(text) || new (exact(text))(text).lt(0) ? copy.oneOff : null;
  }
  if (!RELATIVE_PATTERN.test(text)) return copy.invalidNumber;
  const Exact = exact(text, ctx?.discount_rate);
  const value = new Exact(text);
  if (field === "discount_change_pp") {
    const rate = decimalOrNull(Exact, ctx?.discount_rate ?? null);
    if (rate === null) return null;
    const next = rate.plus(value.div(100));
    return next.lt(0) || next.gte(1) ? fill(copy.discount, { rate: plainOneDecimal(next.times(100)) }) : null;
  }
  const bounds = SCENARIO_INPUT_BOUNDS[field];
  return value.lt(bounds.min) || value.gt(bounds.max) ? fill(copy.pct, { min: boundText(bounds.min), max: boundText(bounds.max) }) : null;
}
