import { parseCents, ratioMetric, reasons } from "@/domain/money";
import type { Metric, SourceRef, Summary } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { formatAmountL3, formatMultiple, metricDefinitions, type Layer } from "./presentation";

// F12 損益兩平 MER（PRD §10.1 F12、D-V3-17＝C、RK10）：扣廣告後貢獻＝0 時的最低 MER＝淨營收 ÷ 扣廣告前貢獻。
// 實作在 application（不動 src/domain）；版本獨立為 breakeven-mer-v1，assist-kpi-v1（7 個輔助指標）與 contribution-v1 都不變。
// 只讀 domain 已算好的 Summary：淨營收、扣廣告前貢獻、既有 MER 原樣取用，不重算；比率用 domain 的 ratioMetric（12 位小數、ROUND_HALF_UP），與既有 MER 同一精度規則。

export const BREAKEVEN_MER_VERSION = "breakeven-mer-v1" as const;
/** 分析 CSV 的 row_type 與 metric 欄都用這個鍵。 */
export const BREAKEVEN_MER_ID = "breakeven_mer" as const;
/** F12 新原因碼（只在 application 產生）：淨營收為 0、扣廣告前貢獻 ≤ 0。淨營收為負沿用 domain 的 NON_POSITIVE_NET_REVENUE。 */
export const BREAKEVEN_MER_REASON_CODES = ["ZERO_NET_REVENUE", "NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING"] as const;
export type BreakevenReasonCode = typeof BREAKEVEN_MER_REASON_CODES[number];
/** 本期實際 MER 與損益兩平 MER 的比較；任一邊不適用或資料待補（例如廣告費 = 0）時是 not_applicable。 */
export type BreakevenComparison = "above" | "below" | "equal" | "not_applicable";

/** F12 一期的損益兩平 MER（欄位比照 AssistKpi，另附輸入、實際 MER 與比較結果）。 */
export interface BreakevenMer {
  id: typeof BREAKEVEN_MER_ID;
  label: string; shortLabel: string; plain: string; formula: string; formulaTechnical: string;
  unit: "multiple";
  /** 系統原值（12 位小數比率字串）；null 表示資料待補或不適用（不顯示 0 或無限大）。 */
  value: string | null;
  /** 畫面值（L1，formatMultiple）；null 時是「資料待補」或「不適用」。 */
  display: string;
  status: "ok" | "missing" | "not_applicable";
  reason_codes: string[];
  /** 淨營收與扣廣告前貢獻的來源列（銷售檔、通路費用檔、資料集設定），不含廣告檔。 */
  sources: SourceRef[];
  /** 兩個輸入（domain 原值）與比較用的廣告費，供抽屜公式行與一句結論使用。 */
  inputs: { net_revenue: Metric; contribution_before_marketing: Metric; ad_spend: Metric };
  /** 既有 MER（summary.metrics.mer），不重算。 */
  actual: Metric;
  comparison: BreakevenComparison;
}

const copy = labels.assist.breakevenV3;
const clone = (metric: Metric): Metric => ({ value: metric.value, reason_codes: [...metric.reason_codes] });
/** domain 金額字串 → 分；null 或不是金額字串時回傳 null。 */
function cents(metric: Metric): bigint | null {
  try { return parseCents(metric.value); } catch { return null; }
}

/** F12（PRD §10.1）：來源只留淨營收與扣廣告前貢獻用到的檔案；廣告檔不參與損益兩平 MER。 */
export function breakevenSources(sources: readonly SourceRef[]): SourceRef[] {
  return sources.filter(source => source.file !== "ad_spend_daily.csv").map(source => ({ ...source }));
}

/**
 * F12（PRD §10.1）：實際 MER 與損益兩平 MER 的比較用精確的分比較，不受 12 位取位影響。
 * 淨營收 N > 0、廣告費 A > 0、扣廣告前貢獻 C > 0 時，N ÷ A 與 N ÷ C 的大小關係等於 C 與 A 的大小關係（也就是扣廣告後貢獻的正負）。
 */
function compare(before: bigint, actual: Metric, adSpend: Metric): BreakevenComparison {
  const ad = cents(adSpend);
  if (actual.value === null || ad === null || ad <= 0n) return "not_applicable";
  return before > ad ? "above" : before < ad ? "below" : "equal";
}

/**
 * F12（PRD §10.1、D-V3-17＝C）：一期的損益兩平 MER。邊界：
 * - 淨營收或扣廣告前貢獻缺漏 → status missing、沿用缺漏原因碼；
 * - 淨營收 = 0 → ZERO_NET_REVENUE（排第一）；淨營收 < 0 → NON_POSITIVE_NET_REVENUE；扣廣告前貢獻 ≤ 0 → NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING；以上都是 value null、status not_applicable；
 * - 廣告費 = 0 → 損益兩平 MER 照算，實際 MER 不適用，comparison not_applicable。
 */
export function breakevenMer(summary: Summary): BreakevenMer {
  const net = summary.metrics.net_revenue, before = summary.metrics.contribution_before_marketing;
  const base = {
    id: BREAKEVEN_MER_ID, label: copy.label, shortLabel: copy.short, plain: copy.plain, formula: copy.formula, formulaTechnical: copy.formulaTechnical, unit: "multiple" as const,
    sources: breakevenSources(summary.sources),
    inputs: { net_revenue: clone(net), contribution_before_marketing: clone(before), ad_spend: clone(summary.metrics.ad_spend) },
    actual: clone(summary.metrics.mer),
  };
  const n = cents(net), c = cents(before);
  if (n === null || c === null) {
    const missing = reasons(n === null ? net.reason_codes : [], c === null ? before.reason_codes : []);
    return { ...base, value: null, display: labels.shell.status.missing, status: "missing", reason_codes: missing.length ? missing : ["MISSING_VALUE"], comparison: "not_applicable" };
  }
  const notApplicable: string[] = [];
  if (n === 0n) notApplicable.push("ZERO_NET_REVENUE");
  else if (n < 0n) notApplicable.push("NON_POSITIVE_NET_REVENUE");
  if (c <= 0n) notApplicable.push("NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING");
  if (notApplicable.length) return { ...base, value: null, display: labels.assist.notApplicable, status: "not_applicable", reason_codes: notApplicable, comparison: "not_applicable" };
  const ratio = ratioMetric({ cents: n, reason_codes: net.reason_codes }, { cents: c, reason_codes: before.reason_codes });
  return { ...base, value: ratio.value, display: formatMultiple(ratio.value, "L1"), status: "ok", reason_codes: ratio.reason_codes, comparison: compare(c, summary.metrics.mer, summary.metrics.ad_spend) };
}

/**
 * F12 總覽區塊 9 的一句 L1 結論（不上色，D-V3-7）：倍數用 formatMultiple L1；兩個 L1 相同但精確值有高低時改用 L3，避免「3.5 倍高於 3.5 倍」。
 * 指標名用 metricDefinitions.mer.label。
 */
export function breakevenNote(item: BreakevenMer): string {
  const note = copy.note;
  const mer = metricDefinitions.mer.label;
  if (item.status === "missing") return note.missing;
  if (item.status === "not_applicable") return item.reason_codes.some(code => code === "ZERO_NET_REVENUE" || code === "NON_POSITIVE_NET_REVENUE") ? note.nonPositiveRevenue : note.nonPositiveContribution;
  if (item.comparison === "not_applicable") {
    const ad = cents(item.inputs.ad_spend);
    return ad === 0n ? note.zeroAds : ad === null ? note.actualMissing : fill(note.actualNotApplicable, { mer });
  }
  const layer: Layer = item.comparison !== "equal" && formatMultiple(item.actual.value, "L1") === formatMultiple(item.value, "L1") ? "L3" : "L1";
  return fill(note[item.comparison], { mer, actual: formatMultiple(item.actual.value, layer), breakeven: formatMultiple(item.value, layer) });
}

/** F12「計算與來源」抽屜的公式行：兩個輸入帶 L3 金額（到分、U+2212、含單位）；缺值寫「資料待補」。 */
export function breakevenEvidenceFormula(item: BreakevenMer): string {
  const amount = (metric: Metric) => metric.value === null ? labels.shell.status.missing : fill(labels.format.units.yuan, { value: formatAmountL3(metric.value) });
  return fill(copy.evidenceFormula, { revenue: amount(item.inputs.net_revenue), contribution: amount(item.inputs.contribution_before_marketing) });
}

/** F12 原因碼的白話文案（labels.assist.breakevenV3.reasons）；不是 F12 原因碼時回傳 null。 */
export function breakevenReasonLabel(code: string): string | null {
  return Object.hasOwn(copy.reasons, code) ? copy.reasons[code as BreakevenReasonCode] : null;
}
