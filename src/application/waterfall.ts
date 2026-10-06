import Decimal from "decimal.js";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, demoAlias, formatHeadlineAmount } from "@/application/copy";
import { deltaTone, deltaWord, formatAmountL1, formatAmountL3, formatEmpty, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { AMOUNT_FIELDS, type AmountField, type Metric, type MetricName, type Metrics } from "@/domain/types";
import { fill, labels } from "@/i18n";

// V3-4b 瀑布圖的資料組裝（C17 貢獻變化拆解、F2 本期利潤結構；PRD §7.1 第 5 點、§10.3）。
// 純呈現：金額只從既有 snapshot 取出（report.bridge、report.previous／current.metrics、report.current.channels），
// 這裡只做「組裝、排序、加總檢核、顯示用比例」，不重新計算任何指標；累計水位與檢核一律用 decimal.js 從精確字串算到分。
// 字串全部取自 labels（overview.bridgeV3、overview.profit），數字一律經 presentation／copy 的格式化函式。

/** 柱的顏色語意：total＝--chart-total（起訖與小計）、result＝--chart-current（本期的結果）、favorable／unfavorable＝有利／不利段、missing＝資料待補或無法定位。 */
export type WaterfallTone = "total" | "result" | "favorable" | "unfavorable" | "missing";
/** 柱的種類：total（起點）、subtotal（小計）、delta（增減段）、result（終點）。total／subtotal／result 從 0 畫到 value；delta 從 start 畫到 end。 */
export type WaterfallKind = "total" | "subtotal" | "delta" | "result";

export interface WaterfallBar {
  /** 穩定代號：拆解為 previous／九個 AmountField／current；利潤結構為指標名（testid profit-waterfall-bar-{id}）。 */
  id: string;
  /** 點柱子時開抽屜的指標（拆解的起訖柱是 contribution_after_marketing）。 */
  metric: MetricName;
  label: string;
  shortLabel: string;
  kind: WaterfallKind;
  /** 精確金額字串：total／subtotal／result 是水位本身；delta 是帶號差額或扣項（扣項為負）。缺值為 null。 */
  value: string | null;
  /** 柱前、柱後的累計水位（精確字串）；total／subtotal／result 兩者都等於 value。前面有缺值而無法定位時為 null。 */
  start: string | null;
  end: string | null;
  tone: WaterfallTone;
  /** 柱上標值（L1）：total／subtotal／result 用 formatAmountL1，delta 用 formatSignedDelta；value 缺值時為「資料待補」。 */
  display: string;
  reasonCodes: readonly string[];
}

/** 柱色（tone → chart-theme 的 var() 字串）；missing 用虛線框，色取 connector（--border-strong）。 */
export const waterfallToneColor: Record<WaterfallTone, string> = {
  total: chartColors.total,
  result: chartColors.current,
  favorable: chartColors.favorable,
  unfavorable: chartColors.unfavorable,
  missing: chartColors.connector,
};

export interface BridgeRow { id: string; label: string; metric: Metric; field?: AmountField; kind: "start" | "delta" | "end" | "total" }
export interface BridgeWaterfall {
  /** 11 根：上期 → 九項（AMOUNT_FIELDS 順序） → 本期。 */
  bars: WaterfallBar[];
  /** 九項加總（report.bridge.sum）。 */
  total: Metric;
  /** 扣廣告後貢獻兩期差額（report.bridge.contribution_change）。 */
  contributionChange: Metric;
  /** report.bridge.reconciled：九項加總是否等於差額；缺值為 null。 */
  balanced: boolean | null;
  /** 九項加總 − 差額（精確到分）；缺值為 null。 */
  difference: string | null;
  /** 結論句引用的最大一項：減少時取最負的一項，增加時取最大的正項。 */
  largest: { field: AmountField; value: string } | null;
  title: string;
  subtitle: string;
  note: string;
  balanceText: string;
  /** 橋接表 12 列（L3 由元件格式化）：上期 → 九項 → 本期 → 總差額。 */
  rows: BridgeRow[];
}

export interface ProfitRow { id: string; metric: MetricName; label: string; kind: WaterfallKind; value: Metric; /** 佔淨營收（比率小數字串，交給 formatRateL2）；淨營收 ≤ 0 或缺值為 null。 */ share: string | null }
export interface ProfitWaterfall {
  scope: "all" | string;
  scopeLabel: string;
  /** 10 根：淨營收 → 商品成本 → 商品毛利 → 四項費用 → 扣廣告前貢獻 → 廣告投放費 → 扣廣告後貢獻。 */
  bars: WaterfallBar[];
  /** 四層恆等式（到分）：淨營收 − 商品成本 = 商品毛利；商品毛利 − 四項費用 = 扣廣告前貢獻；扣廣告前貢獻 − 廣告投放費 = 扣廣告後貢獻。缺值為 null。 */
  identity: { grossProfit: boolean | null; beforeMarketing: boolean | null; afterMarketing: boolean | null };
  /** 每 100 元淨營收剩下的扣廣告後貢獻（一位小數，HALF_UP，例如 "16.2"、"-1.5"）；淨營收 ≤ 0 或缺值為 null。 */
  perHundred: string | null;
  title: string;
  subtitle: string;
  /** 任一柱缺值或無法定位（或通路不在本期資料中）。 */
  missing: boolean;
  /** 資料表 10 列：金額是指標原值（費用為正，不取負）。 */
  rows: ProfitRow[];
}

/** 本期利潤結構的柱序（§10.3）；kind 決定畫法，delta 的 value 是該費用取負。 */
export const PROFIT_WATERFALL_METRICS: readonly { metric: MetricName; kind: WaterfallKind }[] = [
  { metric: "net_revenue", kind: "total" },
  { metric: "cogs_net", kind: "delta" },
  { metric: "gross_profit", kind: "subtotal" },
  { metric: "platform_fees", kind: "delta" },
  { metric: "payment_fees", kind: "delta" },
  { metric: "fulfillment_costs", kind: "delta" },
  { metric: "other_variable_costs", kind: "delta" },
  { metric: "contribution_before_marketing", kind: "subtotal" },
  { metric: "ad_spend", kind: "delta" },
  { metric: "contribution_after_marketing", kind: "result" },
];

// ── 精確金額（decimal.js；從不經過浮點數） ──
const Exact = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
type ExactValue = InstanceType<typeof Exact>;
const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;
function exact(value: string | null | undefined): ExactValue | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  return NUMERIC.test(text) ? new Exact(text) : null;
}
/** 到分的字串；零一律寫 "0.00"（不出現 "-0.00"）。 */
const cents = (value: ExactValue) => value.isZero() ? "0.00" : value.toFixed(2);
/** 比率小數（與 domain 的 ratioMetric 同為 12 位）；分母 ≤ 0 或缺值為 null。 */
function ratio(numerator: ExactValue | null, denominator: ExactValue | null): string | null {
  if (numerator === null || denominator === null || denominator.lte(0)) return null;
  const result = numerator.div(denominator);
  return result.isZero() ? "0.000000000000" : result.toFixed(12);
}
const MISSING_METRIC: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
const CM: MetricName = "contribution_after_marketing";

interface BarSpec { id: string; metric: MetricName; label: string; shortLabel: string; kind: WaterfallKind; value: string | null; reasonCodes: readonly string[]; /** total／subtotal／result 的顏色（預設 total）。 */ levelTone?: "total" | "result" }

/**
 * 依序累計水位：total／subtotal／result 的水位就是自身的值；delta 從目前水位加上帶號值。
 * 任一柱缺值後，該柱與之後所有柱的 start／end 為 null、tone 為 missing（§10.3「後面的小計柱不畫」）；display 仍依各柱自身的值。
 */
function buildBars(specs: readonly BarSpec[]): WaterfallBar[] {
  let level: ExactValue | null = null;
  let broken = false;
  return specs.map(spec => {
    const value = exact(spec.value);
    const display = value === null ? formatEmpty("missing") : spec.kind === "delta" ? formatSignedDelta(spec.value, "L1") : formatAmountL1(spec.value);
    const base = { id: spec.id, metric: spec.metric, label: spec.label, shortLabel: spec.shortLabel, kind: spec.kind, value: value === null ? null : spec.value, display, reasonCodes: [...spec.reasonCodes] };
    if (value === null || (spec.kind === "delta" && level === null)) broken = true;
    if (broken) return { ...base, start: null, end: null, tone: "missing" as const };
    if (spec.kind === "delta") {
      const start = level!;
      level = start.plus(value!);
      const tone = deltaTone(CM, spec.value, "L1");
      return { ...base, start: cents(start), end: cents(level), tone: tone === "neutral" ? "total" as const : tone };
    }
    level = value!;
    return { ...base, start: cents(level), end: cents(level), tone: spec.levelTone ?? "total" };
  });
}

/** 期間（主層 M/D，不附天數；與資料最後一天不同年時寫年份）。 */
const periodText = (snapshot: WorkspaceSnapshot, period: { start: string; end: string }) => formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of });

/** 結論句引用的最大一項：差額減少時取最負的一項，增加時取最大的正項；差額或任一項缺值、差額為 0、沒有同方向的項目時為 null。 */
function largestComponent(components: Record<AmountField, Metric>, change: ExactValue | null): BridgeWaterfall["largest"] {
  if (change === null || change.isZero()) return null;
  const values = AMOUNT_FIELDS.map(field => ({ field, value: components[field].value, exact: exact(components[field].value) }));
  if (values.some(item => item.exact === null)) return null;
  const decreasing = change.isNegative();
  let best: typeof values[number] | null = null;
  for (const item of values) {
    const amount = item.exact!;
    const sign = amount.comparedTo(0);
    if (decreasing ? sign >= 0 : sign <= 0) continue;
    // 同值時保留 AMOUNT_FIELDS 中較前面的一項。
    if (best === null || (decreasing ? amount.lt(best.exact!) : amount.gt(best.exact!))) best = item;
  }
  return best === null ? null : { field: best.field, value: best.value! };
}

/**
 * 貢獻變化拆解（C17）：上期扣廣告後貢獻 → 九項差額 → 本期扣廣告後貢獻，加上橋接表、平衡檢核與 L1 結論標題。
 * 九項直接用 report.bridge.components（正數＝讓扣廣告後貢獻增加），不重算。
 * options 只為與 profitWaterfall／channelConclusion 同一個呼叫介面；拆解不含通路名稱，alias 不影響結果。
 */
export function bridgeWaterfall(snapshot: WorkspaceSnapshot, options?: { alias?: boolean }): BridgeWaterfall;
export function bridgeWaterfall(snapshot: WorkspaceSnapshot): BridgeWaterfall {
  const { report } = snapshot;
  const { bridge } = report;
  const copy = labels.overview.bridgeV3;
  const previous = report.previous.metrics.contribution_after_marketing;
  const current = report.current.metrics.contribution_after_marketing;
  const bars = buildBars([
    { id: "previous", metric: CM, label: copy.barLabels.previous, shortLabel: copy.barLabels.previous, kind: "total", value: previous.value, reasonCodes: previous.reason_codes },
    ...AMOUNT_FIELDS.map((field): BarSpec => ({ id: field, metric: field, label: metricDefinitions[field].label, shortLabel: metricDefinitions[field].shortLabel, kind: "delta", value: bridge.components[field].value, reasonCodes: bridge.components[field].reason_codes })),
    // 拆解的終點柱與起點同為 --chart-total（PRD §7.1 第 5 點、C17「起訖柱與小計柱用 --chart-total」）。
    { id: "current", metric: CM, label: copy.barLabels.current, shortLabel: copy.barLabels.current, kind: "result", value: current.value, reasonCodes: current.reason_codes, levelTone: "total" },
  ]);

  const sum = exact(bridge.sum.value), change = exact(bridge.contribution_change.value);
  const difference = sum === null || change === null ? null : cents(sum.minus(change));
  const largest = largestComponent(bridge.components, change);

  let title: string;
  if (change === null || bars.some(bar => bar.tone === "missing")) title = copy.title.missing;
  else {
    const word = deltaWord(CM, bridge.contribution_change.value, { previous: previous.value, layer: "L1" });
    if (word === labels.format.turnedPositive || word === labels.format.turnedLoss) title = fill(copy.title.turned, { word, value: formatAmountL1(current.value) });
    else if (word === labels.format.flat) title = copy.title.flat;
    else {
      const decrease = deltaTone(CM, bridge.contribution_change.value, "L1") === "unfavorable";
      const amount = formatHeadlineAmount(bridge.contribution_change.value);
      title = largest === null
        ? fill(decrease ? copy.title.decreaseNoLargest : copy.title.increaseNoLargest, { amount })
        : fill(decrease ? copy.title.decrease : copy.title.increase, { amount, item: metricDefinitions[largest.field].label, delta: formatSignedDelta(largest.value, "L1") });
    }
  }

  const gap = exact(difference);
  const balanceText = bridge.reconciled === null || gap === null ? copy.balance.missing
    : bridge.reconciled ? fill(copy.balance.balanced, { difference: formatAmountL3(cents(gap.abs())) })
      : fill(copy.balance.unbalanced, { difference: formatAmountL3(cents(gap.abs())) });

  const rows: BridgeRow[] = [
    { id: "previous", label: copy.rows.previous, metric: previous, kind: "start" },
    ...AMOUNT_FIELDS.map((field): BridgeRow => ({ id: field, label: copy.rows[field], metric: bridge.components[field], field, kind: "delta" })),
    { id: "current", label: copy.rows.current, metric: current, kind: "end" },
    { id: "total", label: copy.rows.total, metric: bridge.sum, kind: "total" },
  ];

  return {
    bars, total: bridge.sum, contributionChange: bridge.contribution_change, balanced: bridge.reconciled, difference, largest, title,
    subtitle: fill(copy.subtitle, { section: labels.overview.sections.bridge, previous: periodText(snapshot, report.previous.period), current: periodText(snapshot, report.current.period) }),
    note: labels.ui.overview.bridgeNote,
    balanceText,
    rows,
  };
}

/** 利潤結構的範圍選項（profit-waterfall-scope 分段按鈕）：合計＋目前範圍內的各通路（report.scope.channels 順序）。 */
export function profitWaterfallScopes(snapshot: WorkspaceSnapshot, options: { alias?: boolean } = {}): { id: "all" | string; label: string }[] {
  const alias = options.alias ?? demoAlias(snapshot.report.dataset_id);
  return [{ id: "all", label: labels.overview.profit.scope.all }, ...snapshot.report.scope.channels.map(channel => ({ id: channel, label: channelLabel(channel, alias) }))];
}

/**
 * 本期利潤結構（F2，§10.3）：合計用 report.current.metrics，通路用 report.current.channels[通路].metrics；只讀既有指標，不重算。
 * allChannels：資料集的全部通路；給了且目前範圍涵蓋全部時，合計的副標寫「全部通路」（與本期一句話的範圍行相同），否則寫「合計」。
 */
export function profitWaterfall(snapshot: WorkspaceSnapshot, scope: "all" | string, options: { alias?: boolean; allChannels?: readonly string[] } = {}): ProfitWaterfall {
  const { report } = snapshot;
  const copy = labels.overview.profit;
  const alias = options.alias ?? demoAlias(report.dataset_id);
  const channels = report.current.channels;
  const source: Metrics | null = scope === "all" ? report.current.metrics : Object.hasOwn(channels, scope) ? channels[scope].metrics : null;
  const metricOf = (name: MetricName): Metric => source?.[name] ?? MISSING_METRIC;

  const bars = buildBars(PROFIT_WATERFALL_METRICS.map(({ metric, kind }): BarSpec => {
    const item = metricOf(metric);
    const amount = exact(item.value);
    const value = kind === "delta" ? (amount === null ? null : cents(amount.neg())) : item.value;
    return { id: metric, metric, label: metricDefinitions[metric].label, shortLabel: metricDefinitions[metric].shortLabel, kind, value, reasonCodes: item.reason_codes, levelTone: kind === "result" ? "result" : "total" };
  }));

  const v = (name: MetricName) => exact(metricOf(name).value);
  const netRevenue = v("net_revenue"), cogs = v("cogs_net"), grossProfit = v("gross_profit"), beforeMarketing = v("contribution_before_marketing"), adSpend = v("ad_spend"), afterMarketing = v("contribution_after_marketing");
  const costs = (["platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs"] as const).map(v);
  /** a − Σ b == expected（到分）；任一缺值為 null。 */
  const holds = (a: ExactValue | null, minus: readonly (ExactValue | null)[], expected: ExactValue | null): boolean | null => {
    if (a === null || expected === null || minus.some(item => item === null)) return null;
    return minus.reduce<ExactValue>((total, item) => total.minus(item!), a).eq(expected);
  };
  const identity = { grossProfit: holds(netRevenue, [cogs], grossProfit), beforeMarketing: holds(grossProfit, costs, beforeMarketing), afterMarketing: holds(beforeMarketing, [adSpend], afterMarketing) };

  // 每 100 元淨營收：從精確值一次取位（HALF_UP 一位小數），不經過 12 位的比率字串。
  const perHundredValue = afterMarketing === null || netRevenue === null || netRevenue.lte(0) ? null : afterMarketing.div(netRevenue).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  const perHundred = perHundredValue === null ? null : perHundredValue.isZero() ? "0.0" : perHundredValue.toFixed(1);
  const title = perHundredValue === null ? copy.section
    : fill(perHundredValue.isNegative() && !perHundredValue.isZero() ? copy.title.negative : copy.title.positive, { n: perHundredValue.abs().toFixed(1) });

  const everyChannel = !!options.allChannels && options.allChannels.length > 0 && options.allChannels.every(channel => report.scope.channels.includes(channel));
  const scopeLabel = scope === "all" ? (everyChannel ? labels.shell.periodBar.filter.allChannels : labels.sections.total) : channelLabel(scope, alias);
  const rows: ProfitRow[] = PROFIT_WATERFALL_METRICS.map(({ metric, kind }) => {
    const value = metricOf(metric);
    return { id: metric, metric, label: metricDefinitions[metric].label, kind, value, share: ratio(exact(value.value), netRevenue) };
  });

  return {
    scope, scopeLabel, bars, identity, perHundred, title,
    subtitle: fill(copy.subtitle, { section: copy.section, period: periodText(snapshot, report.current.period), scope: scopeLabel }),
    missing: source === null || bars.some(bar => bar.tone === "missing"),
    rows,
  };
}
