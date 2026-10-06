import Decimal from "decimal.js";
import { uniqueSources } from "../domain/aggregation";
import { formatCents, parseCents } from "../domain/money";
import { AMOUNT_FIELDS, COST_FIELDS, SALES_FIELDS, type AmountField, type Dataset, type MetricName, type SourceRef } from "../domain/types";
import { labels } from "../i18n";

export interface MetricDefinition {
  /** 主名稱（頁面、匯出）；來源 labels.metrics */
  label: string;
  /** 短名（卡片、表頭） */
  shortLabel: string;
  /** 白話一句（tooltip） */
  plain: string;
  /** 中文階梯公式 */
  formula: string;
  /** 技術公式（技術細節區） */
  formulaTechnical: string;
  unit: "money" | "percent" | "multiple";
  fields: AmountField[];
  /** V3-2b §8.5 規則 8：數值往哪個方向變動對扣廣告後貢獻有利（費用類為 down）。只在呈現層，不進 domain。 */
  favorableDirection: FavorableDirection;
}
export type FavorableDirection = "up" | "down";
const revenueFields: AmountField[] = ["gross_sales", "discounts", "refunds"];
const grossProfitFields: AmountField[] = [...revenueFields, "cogs_net"];
const beforeFields: AmountField[] = [...grossProfitFields, ...COST_FIELDS];
const metricShape: Record<MetricName, Pick<MetricDefinition, "unit" | "fields" | "favorableDirection">> = {
  gross_sales: { unit: "money", fields: ["gross_sales"], favorableDirection: "up" },
  discounts: { unit: "money", fields: ["discounts"], favorableDirection: "down" },
  refunds: { unit: "money", fields: ["refunds"], favorableDirection: "down" },
  cogs_net: { unit: "money", fields: ["cogs_net"], favorableDirection: "down" },
  platform_fees: { unit: "money", fields: ["platform_fees"], favorableDirection: "down" },
  payment_fees: { unit: "money", fields: ["payment_fees"], favorableDirection: "down" },
  fulfillment_costs: { unit: "money", fields: ["fulfillment_costs"], favorableDirection: "down" },
  other_variable_costs: { unit: "money", fields: ["other_variable_costs"], favorableDirection: "down" },
  ad_spend: { unit: "money", fields: ["ad_spend"], favorableDirection: "down" },
  net_revenue: { unit: "money", fields: [...revenueFields], favorableDirection: "up" },
  gross_profit: { unit: "money", fields: [...grossProfitFields], favorableDirection: "up" },
  contribution_before_marketing: { unit: "money", fields: [...beforeFields], favorableDirection: "up" },
  contribution_after_marketing: { unit: "money", fields: [...AMOUNT_FIELDS], favorableDirection: "up" },
  gross_margin: { unit: "percent", fields: [...grossProfitFields], favorableDirection: "up" },
  contribution_margin: { unit: "percent", fields: [...AMOUNT_FIELDS], favorableDirection: "up" },
  discount_rate: { unit: "percent", fields: ["discounts", "gross_sales"], favorableDirection: "down" },
  refund_ratio: { unit: "percent", fields: ["refunds", "gross_sales", "discounts"], favorableDirection: "down" },
  mer: { unit: "multiple", fields: [...revenueFields, "ad_spend"], favorableDirection: "up" },
  fulfillment_burden: { unit: "percent", fields: ["fulfillment_costs", ...revenueFields], favorableDirection: "down" },
  marketing_burden: { unit: "percent", fields: ["ad_spend", ...revenueFields], favorableDirection: "down" },
};

/** Formula and source dependencies for contribution-v1 evidence views. Names and formulas come from labels (R2). */
export const metricDefinitions: Record<MetricName, MetricDefinition> = Object.fromEntries((Object.keys(metricShape) as MetricName[]).map(name => {
  const copy = labels.metrics[name];
  return [name, { label: copy.label, shortLabel: copy.short, plain: copy.plain, formula: copy.formula, formulaTechnical: copy.formulaTechnical, ...metricShape[name] }];
})) as Record<MetricName, MetricDefinition>;

function amount(value: string | null): bigint | null {
  try { return parseCents(value); } catch { return null; }
}
export function formatMoney(value: string | null): string {
  const cents = amount(value);
  if (cents === null) return "—";
  const [integer, fractional] = formatCents(cents).split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fractional}`;
}
export function formatSignedMoney(value: string | null): string {
  const cents = amount(value);
  return `${cents !== null && cents > 0n ? "+" : ""}${formatMoney(value)}`;
}
export function formatRate(value: string | null): string {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "N/A";
  const ExactDecimal = Decimal.clone({ precision: value.length + 20, rounding: Decimal.ROUND_HALF_UP });
  const formatted = new ExactDecimal(value).times(100).toFixed(2);
  return `${formatted === "-0.00" ? "0.00" : formatted}%`;
}

// ───────────────────────── V3-2b 三層數字格式（PRD §8.5–§8.7） ─────────────────────────
// 一律從精確字串（domain 的到分金額、12 位小數比率）以 decimal.js ROUND_HALF_UP 取位，從不經過浮點數。
// L1＝萬／億（KPI、標題、一句話）；L2＝整數元（一般表格）；L3＝到分（抽屜、橋接、對帳、匯出）。
// UI 負號用 U+2212，正的差額加「+」，取位後為零不帶符號；CSV／JSON 用 asciiMinus 轉回 ASCII「-」。
// 上面的 formatMoney／formatSignedMoney／formatRate 維持 v2 行為（ASCII 負號；AI grounding、PPT、目標與試算範本仍在用），
// 呼叫端改接下面的函式後於 V3-2c 移除。

/** 三層閱讀模式（§3.2）。 */
export type Layer = "L1" | "L2" | "L3";
/** 空值種類：缺資料＝資料待補；分母 ≤ 0＝不適用。 */
export type EmptyKind = "missing" | "notApplicable";
/** UI 用的負號（U+2212）。 */
export const MINUS = "−";
/** 把 UI 負號換回 ASCII「-」（CSV、JSON 等機器可讀輸出用）。 */
export function asciiMinus(text: string): string {
  return text.replaceAll(MINUS, "-");
}

const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
type ExactValue = InstanceType<typeof Exact>;
const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;
/** 只接受十進位字串（或整數 bigint）；其他一律視為空值，不做 Number 轉換。 */
function exact(value: string | bigint | null | undefined): ExactValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return new Exact(value.toString());
  const text = value.trim();
  return NUMERIC.test(text) ? new Exact(text) : null;
}
/** 千分位：整數部分 4 位數以上加半形逗號（§8.5 規則 7）。 */
function grouped(absFixed: string): string {
  const [integer, fraction] = absFixed.split(".");
  const withCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? withCommas : `${withCommas}.${fraction}`;
}
interface Rounded { sign: -1 | 0 | 1; text: string }
/** HALF_UP 取到 dp 位（.5 遠離零），回傳取位後的正負號與不帶符號、含千分位的字串。 */
function rounded(value: ExactValue, dp: number): Rounded {
  const result = value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
  return { sign: result.isZero() ? 0 : result.isNegative() ? -1 : 1, text: grouped(result.abs().toFixed(dp)) };
}
function signPrefix(sign: -1 | 0 | 1, plus: boolean): string {
  return sign < 0 ? MINUS : sign > 0 && plus ? "+" : "";
}
const withUnit = (template: string, value: string) => template.replace("{value}", value);
const TEN_THOUSAND = new Exact(10_000);

/** L1 金額尺度：先取整元決定是否 ≥ 1 萬，再取一位小數的萬決定是否 ≥ 1 億（9,999.995 元 → 1.0 萬；99,999,999.99 元 → 1.00 億）。 */
function amountL1(value: ExactValue): Rounded {
  const abs = value.abs();
  const yuan = rounded(abs, 0);
  const sign: Rounded["sign"] = yuan.sign === 0 ? 0 : value.isNegative() ? -1 : 1;
  if (abs.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).lt(TEN_THOUSAND)) return { sign, text: withUnit(labels.units.yuan, yuan.text) };
  const wan = abs.div(TEN_THOUSAND).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  if (wan.lt(TEN_THOUSAND)) return { sign, text: withUnit(labels.units.wan, grouped(wan.toFixed(1))) };
  return { sign, text: withUnit(labels.units.yi, grouped(abs.div(TEN_THOUSAND).div(TEN_THOUSAND).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2))) };
}

/**
 * 空值文字：資料待補／不適用。L3 且有原因碼時附上原因碼，例如「不適用（NON_POSITIVE_DENOMINATOR）」。
 * 零值不用「-」：真正的 0 由各格式化函式顯示為 0（§8.5 規則 3）。
 */
export function formatEmpty(kind: EmptyKind = "missing", options: { layer?: Layer; reasonCodes?: string | readonly string[] } = {}): string {
  const state = kind === "notApplicable" ? labels.status.notApplicable : labels.status.missing;
  const codes = options.reasonCodes === undefined ? [] : typeof options.reasonCodes === "string" ? [options.reasonCodes] : [...options.reasonCodes];
  if (options.layer !== "L3" || codes.length === 0) return state;
  return labels.format.emptyWithReason.replace("{state}", state).replace("{code}", codes.join("、"));
}
/** 由 domain 的 reason_codes 判斷空值種類：只有分母 ≤ 0 → 不適用；其餘（含任何缺值）→ 資料待補。 */
export function emptyKindOf(reasonCodes: readonly string[] | null | undefined): EmptyKind {
  const codes = reasonCodes ?? [];
  return codes.includes("NON_POSITIVE_DENOMINATOR") && !codes.some(code => code.startsWith("MISSING")) ? "notApplicable" : "missing";
}

/** L1 金額：≥ 1 億「1.25 億」、≥ 1 萬「785.1 萬」、< 1 萬「8,420 元」、零「0 元」；負值帶 U+2212，正值不加號。 */
export function formatAmountL1(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = amountL1(v);
  return `${signPrefix(result.sign, false)}${result.text}`;
}
/** L2 金額：整數元、千分位、不帶單位（單位寫在表頭）。「7,850,658」「0」。 */
export function formatAmountL2(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, 0);
  return `${signPrefix(result.sign, false)}${result.text}`;
}
/** L3 金額：到分、千分位、不帶單位。「7,850,657.90」「0.00」。 */
export function formatAmountL3(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, 2);
  return `${signPrefix(result.sign, false)}${result.text}`;
}
/** 依層選擇金額格式（不帶正負號）。 */
export function formatAmount(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  return layer === "L1" ? formatAmountL1(value, empty) : layer === "L2" ? formatAmountL2(value, empty) : formatAmountL3(value, empty);
}
/** 帶正負號的金額差額：L1「+170.9 萬」「−59.9 萬」、L2「+1,709,082」、L3「+1,709,082.18」；取位後為零不帶符號。 */
export function formatSignedDelta(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = layer === "L1" ? amountL1(v) : rounded(v, layer === "L2" ? 0 : 2);
  return `${signPrefix(result.sign, true)}${result.text}`;
}

/** 比率（domain 的小數，例如 0.161745…）轉百分比；plus 時正值加「+」。 */
function percent(value: ExactValue, dp: number, plus: boolean): string {
  const result = rounded(value.times(100), dp);
  return withUnit(labels.units.percent, `${signPrefix(result.sign, plus)}${result.text}`);
}
/** L1 比率：一位小數「16.2%」。 */
export function formatRateL1(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  return v === null ? formatEmpty(empty) : percent(v, 1, false);
}
/** L2 比率：一位小數「16.2%」（與 L1 相同）。 */
export function formatRateL2(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  return formatRateL1(value, empty);
}
/** L3 比率：兩位小數「16.17%」。 */
export function formatRateL3(value: string | null | undefined, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  return v === null ? formatEmpty(empty) : percent(v, 2, false);
}
/** 依層選擇比率格式。 */
export function formatRateLayer(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  return layer === "L3" ? formatRateL3(value, empty) : formatRateL1(value, empty);
}
/** 帶正負號的百分比（已算好的成長率等）：L1／L2「+27.8%」、L3「+27.83%」。 */
export function formatSignedRate(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  return v === null ? formatEmpty(empty) : percent(v, layer === "L3" ? 2 : 1, true);
}
/**
 * 已經是百分數的值（不是比率小數）：試算的銷量增減「10」、銷量門檻 threshold_pct「12.345678901234」。
 * L1／L2 一位小數「+10.0%」、L3 兩位「+10.00%」；signed 時正值加「+」，負值一律 U+2212，取位後為零不帶符號。
 */
export function formatPercentNumber(value: string | null | undefined, layer: Layer, options: { signed?: boolean; empty?: EmptyKind } = {}): string {
  const v = exact(value);
  if (v === null) return formatEmpty(options.empty ?? "missing");
  const result = rounded(v, layer === "L3" ? 2 : 1);
  return withUnit(labels.units.percent, `${signPrefix(result.sign, options.signed ?? false)}${result.text}`);
}
/**
 * 比率差（兩個比率小數的差，例如 −0.14251）：L1「降 14.3 個百分點」／「升 2.1 個百分點」、L2「−14.3 個百分點」、L3「−14.25 個百分點」；零「0.0 個百分點」。
 * 要從精確值相減後再取位（§8.5 規則 1），不要用兩個顯示值相減；手上是兩期比率時用 formatRateChange。
 */
export function formatRatePoints(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v.times(100), layer === "L3" ? 2 : 1);
  if (layer === "L1") return withUnit(result.sign < 0 ? labels.units.pointsDown : result.sign > 0 ? labels.units.pointsUp : labels.units.points, result.text);
  return withUnit(labels.units.points, `${signPrefix(result.sign, true)}${result.text}`);
}
/** 已經以「百分點」為單位的差（例如總覽貢獻率的 percentagePointChange「−14.251…」）：先精確除以 100 再交給 formatRatePoints。 */
export function formatPointsValue(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  return v === null ? formatEmpty(empty) : formatRatePoints(v.div(100).toFixed(), layer, empty);
}
/** 兩期比率的差（本期 − 上期，精確相減後取位）。任一期缺值回傳空值文字。 */
export function formatRateChange(current: string | null | undefined, previous: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const c = exact(current), p = exact(previous);
  return c === null || p === null ? formatEmpty(empty) : formatRatePoints(c.minus(p).toFixed(), layer, empty);
}
/**
 * 成長率 (本期 − 上期) ÷ 上期：L1／L2「+27.8%」、L3「+27.83%」。上期 ≤ 0 或任一期缺值回傳 null（呼叫端不顯示）。
 * 從精確值一次取位：−598,833.95 ÷ 1,868,626.68 →「−32.0%」，不是先取兩位 −32.05% 再取一位的 −32.1%。比率類指標不要呼叫。
 */
export function formatGrowth(current: string | null | undefined, previous: string | null | undefined, layer: Layer): string | null {
  const c = exact(current), p = exact(previous);
  if (c === null || p === null || p.lte(0)) return null;
  return percent(c.minus(p).div(p), layer === "L3" ? 2 : 1, true);
}
/** 倍數（MER 等）：L1／L2「11.4 倍」、L3「11.40 倍」。 */
export function formatMultiple(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, layer === "L3" ? 2 : 1);
  return withUnit(labels.units.multiple, `${signPrefix(result.sign, false)}${result.text}`);
}
/** 件數：L1「7,420 件」、L2／L3「7,420」。接受整數字串、bigint 或安全整數。 */
export function formatCount(value: string | bigint | number | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = typeof value === "number" ? Number.isSafeInteger(value) ? new Exact(value) : null : exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, 0);
  const text = `${signPrefix(result.sign, false)}${result.text}`;
  return layer === "L1" ? withUnit(labels.units.count, text) : text;
}
/** 件均：L1「1,058 元／件」、L2「1,058」、L3「1,058.04 元／件」。 */
export function formatPerUnit(value: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const v = exact(value);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, layer === "L3" ? 2 : 0);
  const text = `${signPrefix(result.sign, false)}${result.text}`;
  return layer === "L2" ? text : withUnit(labels.units.perUnit, text);
}

/** 依指標單位格式化 domain Metric（值＋原因碼）；空值依原因碼判斷資料待補或不適用，L3 附原因碼。 */
export function formatMetric(metric: MetricName, value: { value: string | null; reason_codes?: readonly string[] } | null | undefined, layer: Layer): string {
  if (!value || value.value === null) return formatEmpty(emptyKindOf(value?.reason_codes), { layer, reasonCodes: value?.reason_codes ?? [] });
  const kind = metricShape[metric].unit;
  if (kind === "percent") return formatRateLayer(value.value, layer);
  if (kind === "multiple") return formatMultiple(value.value, layer);
  return formatAmount(value.value, layer);
}
/** 依指標單位格式化兩期差：金額 → formatSignedDelta；比率 → formatRatePoints；倍數 → 帶號倍數「+1.2 倍」。 */
export function formatMetricDelta(metric: MetricName, delta: string | null | undefined, layer: Layer, empty: EmptyKind = "missing"): string {
  const kind = metricShape[metric].unit;
  if (kind === "percent") return formatRatePoints(delta, layer, empty);
  if (kind === "money") return formatSignedDelta(delta, layer, empty);
  const v = exact(delta);
  if (v === null) return formatEmpty(empty);
  const result = rounded(v, layer === "L3" ? 2 : 1);
  return withUnit(labels.units.multiple, `${signPrefix(result.sign, true)}${result.text}`);
}

// ── 日期與期間（§8.6）：主層 M/D，跨年 YYYY/M/D，L3 與匯出 ISO ──
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
type DateParts = [number, number, number];
function isoParts(iso: string): DateParts | null {
  const match = ISO_DATE.exec(iso.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function anchorYear(anchor: string | undefined): number {
  const parts = anchor ? isoParts(anchor) : null;
  return parts ? parts[0] : new Date().getFullYear();
}
/** 兩個 ISO 日期之間的天數（含頭尾）；格式不對回傳 null。 */
export function periodDays(start: string, end: string): number | null {
  const a = isoParts(start), b = isoParts(end);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000) + 1;
}
/** 主層日期：與比較基準（anchor 或 today；都沒給時用今天）同一年寫「8/24」，不同年寫「2025/12/29」。格式不對原樣回傳；缺值寫資料待補。 */
export function formatDateL1(iso: string | null | undefined, options: { today?: string; anchor?: string } = {}): string {
  if (!iso) return labels.status.missing;
  const parts = isoParts(iso);
  if (!parts) return iso;
  const [year, month, day] = parts;
  return year === anchorYear(options.anchor ?? options.today) ? `${month}/${day}` : `${year}/${month}/${day}`;
}
/**
 * 主層期間：「7/13–8/23（42 天）」；跨年（或給了 anchor 而起日與 anchor 不同年）兩端都寫年份「2025/12/29–2026/1/25（28 天）」。
 * days: false 時不附天數（例如副標「上期 6/1–7/12」）。
 */
export function formatPeriodL1(start: string, end: string, options: { anchor?: string; days?: boolean } = {}): string {
  const a = isoParts(start), b = isoParts(end);
  if (!a || !b) return `${start}–${end}`;
  const full = a[0] !== b[0] || (options.anchor !== undefined && a[0] !== anchorYear(options.anchor));
  const date = (parts: DateParts) => full ? `${parts[0]}/${parts[1]}/${parts[2]}` : `${parts[1]}/${parts[2]}`;
  const days = options.days === false ? "" : labels.units.periodDays.replace("{days}", String(periodDays(start, end)));
  return `${date(a)}–${date(b)}${days}`;
}
/** 匯出版頭期間：「2026-07-13 至 2026-08-23（42 天）」。 */
export function formatPeriodExport(start: string, end: string): string {
  return labels.units.exportRange.replace("{start}", start).replace("{end}", end).replace("{days}", String(periodDays(start, end) ?? labels.status.missing));
}

// ── 有利／不利與方向詞（§8.5 規則 8、GLOSSARY 方向詞的固定用法） ──
/** 會顯示差額的指標：domain 的 MetricName ＋ assist-kpi-v1 的件數、件均。 */
export type DirectionalMetric = MetricName | "units_sold" | "net_revenue_per_unit";
export type DeltaTone = "favorable" | "unfavorable" | "neutral";
const assistShape: Record<"units_sold" | "net_revenue_per_unit", { unit: "count" | "perUnit"; favorableDirection: FavorableDirection }> = {
  units_sold: { unit: "count", favorableDirection: "up" },
  net_revenue_per_unit: { unit: "perUnit", favorableDirection: "up" },
};
const isAssist = (metric: DirectionalMetric): metric is "units_sold" | "net_revenue_per_unit" => metric === "units_sold" || metric === "net_revenue_per_unit";
/** 指標的有利方向：收入、毛利、貢獻、毛利率、貢獻率、MER、件數、件均為 up；費用與費用佔比（折扣率、退款金額比、物流費佔比、廣告費佔比）為 down。 */
export function favorableDirectionOf(metric: DirectionalMetric): FavorableDirection {
  return isAssist(metric) ? assistShape[metric].favorableDirection : metricShape[metric].favorableDirection;
}
/** 給 layer 時用與畫面相同的取位判斷正負（顯示為 0 的差額不上色）；不給時用精確值。 */
function deltaSign(metric: DirectionalMetric, delta: string | null | undefined, layer?: Layer): -1 | 0 | 1 | null {
  const v = exact(delta);
  if (v === null) return null;
  if (!layer) return v.isZero() ? 0 : v.isNegative() ? -1 : 1;
  const kind = isAssist(metric) ? assistShape[metric].unit : metricShape[metric].unit;
  if (kind === "percent") return rounded(v.times(100), layer === "L3" ? 2 : 1).sign;
  if (kind === "multiple") return rounded(v, layer === "L3" ? 2 : 1).sign;
  if (kind === "count") return rounded(v, 0).sign;
  return rounded(v, layer === "L3" ? 2 : 0).sign;
}
/** 差額對扣廣告後貢獻有利或不利：依 favorableDirection 判斷，不依數學正負號；零或缺值為 neutral。 */
export function deltaTone(metric: DirectionalMetric, delta: string | null | undefined, layer?: Layer): DeltaTone {
  const sign = deltaSign(metric, delta, layer);
  if (!sign) return "neutral";
  return (sign > 0) === (favorableDirectionOf(metric) === "up") ? "favorable" : "unfavorable";
}
/** 「有利」／「不利」；neutral 回傳空字串。 */
export function deltaToneLabel(tone: DeltaTone): string {
  return tone === "favorable" ? labels.format.favorable : tone === "unfavorable" ? labels.format.unfavorable : "";
}
type WordKind = "amount" | "cost" | "contribution" | "rate";
const COST_METRICS: ReadonlySet<DirectionalMetric> = new Set<DirectionalMetric>(["discounts", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
function wordKind(metric: DirectionalMetric): WordKind {
  if (metric === "contribution_before_marketing" || metric === "contribution_after_marketing") return "contribution";
  if (COST_METRICS.has(metric)) return "cost";
  if (!isAssist(metric) && metricShape[metric].unit !== "money") return "rate";
  return "amount";
}
/**
 * 方向詞：原價收入、淨營收、商品毛利、退款、件數、件均用多／少；費用（含折扣）用多花／少花；扣廣告前／後貢獻用多賺／少賺；比率與倍數用升／降。
 * 差額為零回傳「持平」，缺值回傳 null。貢獻類若給 previous：上期 ≤ 0 且本期 > 0 回傳「由負轉正」；上期 > 0 且本期 < 0 回傳「轉為虧損」。
 * 方向詞後面接的金額用絕對值（例如 formatAmountL1 傳入去掉負號的字串，或 copy.ts 的 formatHeadlineAmount）。
 */
export function deltaWord(metric: DirectionalMetric, delta: string | null | undefined, options: { previous?: string | null; layer?: Layer } = {}): string | null {
  const sign = deltaSign(metric, delta, options.layer);
  if (sign === null) return null;
  const kind = wordKind(metric);
  const previous = exact(options.previous);
  const change = exact(delta);
  if (kind === "contribution" && previous !== null && change !== null) {
    const current = previous.plus(change);
    if (previous.lte(0) && current.gt(0)) return labels.format.turnedPositive;
    if (previous.gt(0) && current.lt(0)) return labels.format.turnedLoss;
  }
  if (sign === 0) return labels.format.flat;
  const words: Record<WordKind, readonly [string, string]> = {
    amount: [labels.format.more, labels.format.less],
    cost: [labels.format.spendMore, labels.format.spendLess],
    contribution: [labels.format.earnMore, labels.format.earnLess],
    rate: [labels.format.rise, labels.format.fall],
  };
  return sign > 0 ? words[kind][0] : words[kind][1];
}

export interface EvidenceRow extends SourceRef {
  values: Record<string, string | null>;
  missing: boolean;
}
/** Serialize source booked values only; missing rows/fields stay visibly null. */
export function evidenceRows(dataset: Dataset, sources: readonly SourceRef[]): EvidenceRow[] {
  const known = new Map<string, Dataset["sales"][number] | Dataset["costs"][number] | Dataset["ads"][number]>();
  for (const row of [...dataset.sales, ...dataset.costs, ...dataset.ads]) known.set(JSON.stringify([row.source.file, row.source.line]), row);
  return uniqueSources(sources).map(source => {
    if (source.file === "manifest.json") {
      return { ...source, missing: false, values: Object.fromEntries(Object.entries(dataset.manifest).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) };
    }
    const row = source.line === null ? undefined : known.get(JSON.stringify([source.file, source.line]));
    if (row) {
      const values = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "source").map(([key, value]) => [key,
        value === null ? null : typeof value === "bigint" ? key === "units_sold" ? value.toString() : formatCents(value) : String(value),
      ]));
      return { ...source, date: row.date, channel: row.channel, ...("sku" in row ? { sku: row.sku } : {}), missing: false, values };
    }
    const fields = source.file === "sales_daily.csv" ? ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"] : source.file === "channel_costs_daily.csv" ? ["date", "channel", ...COST_FIELDS, "currency"] : ["date", "channel", "ad_spend", "currency"];
    const values: Record<string, string | null> = Object.fromEntries(fields.map(field => [field, null]));
    if (source.date) values.date = source.date;
    if (source.channel) values.channel = source.channel;
    if (source.sku) values.sku = source.sku;
    return { ...source, missing: true, values };
  });
}
