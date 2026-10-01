import { compareMoney } from "./metrics";
import { parseCents, subtractAmounts } from "./money";
import { AMOUNT_FIELDS, PRODUCT_METRICS, type Amount, type AmountField, type Dataset, type Diagnostic, type Fact, type Metric, type MetricName, type Period, type PeriodAnalysis, type ProductRow, type RuleCode, type Scope, type Summary, type Totals } from "./types";

interface RuleCopy {
  title: string;
  hypothesis: string;
  recommendation: string;
  limitations: string[];
}

// Static wording only. Data and per-call state always stay inside diagnose.
const COPY: Record<RuleCode, RuleCopy> = {
  REV_UP_CM_DOWN: {
    title: "淨營收增加，行銷後貢獻下降",
    hypothesis: "待驗證假說：商品組合、折扣、退款或費用結構的改變可能與差異有關。",
    recommendation: "核對九項金額拆解及通路明細，確認變動的入帳來源與可驗證原因。",
    limitations: ["金額差異不代表獨立因果效果，也不是改善後可取得的收益。"],
  },
  NEGATIVE_CHANNEL_CM: {
    title: "本期通路行銷後貢獻為負",
    hypothesis: "待驗證假說：通路當期收入可能不足以覆蓋已入帳商品成本及費用。",
    recommendation: "核對該通路收入、退款與費用完整性，再檢查商品毛利及費用明細。",
    limitations: ["行銷後貢獻不是公司淨利，不含未輸入的固定費與所得稅。"],
  },
  DISCOUNT_BURDEN_UP: {
    title: "折扣率上升",
    hypothesis: "待驗證假說：促銷條件或商品組合變化可能與折扣負擔上升有關。",
    recommendation: "比對兩期折扣金額與折扣前收入，核對促銷及商品組合。",
    limitations: ["降低折扣是否改善貢獻仍須驗證銷量反應，不能視為保證收益。"],
  },
  REFUND_BURDEN_UP: {
    title: "退款金額比上升",
    hypothesis: "待驗證假說：入帳時點或前期訂單退款可能與本期退款金額比上升有關。",
    recommendation: "核對退款入帳日期及其來源期間，補充可追溯的退款原因。",
    limitations: ["退款按入帳日扣除，可能來自前期；此值不是訂單 cohort 的最終退款率或件數退貨率。"],
  },
  FULFILLMENT_BURDEN_UP: {
    title: "履約費用占淨營收比上升",
    hypothesis: "待驗證假說：物流條件、商品組合或收入變化可能與履約負擔有關。",
    recommendation: "核對履約費用入帳明細及兩期收入，確認是否存在服務或組合差異。",
    limitations: ["只在兩期淨營收均為正時比較；比率變化不能直接轉成可節省金額。"],
  },
  MARKETING_BURDEN_UP: {
    title: "廣告費占淨營收比上升",
    hypothesis: "待驗證假說：投放規模、收入或入帳時間差可能與行銷負擔上升有關。",
    recommendation: "核對通路廣告歸屬與入帳期間，設計可驗證的銷量及投放調整假設。",
    limitations: ["此比率不提供媒體歸因或因果效果；廣告費增加不等於可直接節省的金額。"],
  },
  SKU_NEGATIVE_GP: {
    title: "商品毛利為負",
    hypothesis: "待驗證假說：折扣、已入帳退款或商品成本可能與本期負毛利有關。",
    recommendation: "核對商品淨營收及已入帳銷貨成本，確認退款與成本回沖來源。",
    limitations: ["商品只判斷毛利；未分攤通路費用或廣告費，不提供 SKU 行銷後貢獻。"],
  },
  MISSING_CRITICAL_DATA: {
    title: "關鍵資料缺漏，先補資料",
    hypothesis: "待驗證假說：來源尚未提供完整資料，缺漏不能視為零。",
    recommendation: "依引用事實的缺漏原因與來源範圍補齊資料，再重新計算受影響指標。",
    limitations: ["資料缺漏區段不產生依賴未知金額的異常或改善收益排名。"],
  },
};

function net(totals: Totals): Amount {
  return subtractAmounts(totals.gross_sales, totals.discounts, totals.refunds);
}

/** Compare ratios by integer cross multiplication, before any display rounding. */
function ratioIncreased(beforeNumerator: Amount, beforeDenominator: Amount, afterNumerator: Amount, afterDenominator: Amount): boolean {
  const bn = beforeNumerator.cents;
  const bd = beforeDenominator.cents;
  const an = afterNumerator.cents;
  const ad = afterDenominator.cents;
  return bn !== null && bd !== null && an !== null && ad !== null && bd > 0n && ad > 0n && an * bd > bn * ad;
}

function moneyValue(metric: Metric): bigint | null {
  try { return parseCents(metric.value); } catch { return null; }
}

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function diagnose({ dataset, previous, current, currentProducts, channels }: { dataset: Dataset; previous: PeriodAnalysis; current: PeriodAnalysis; currentProducts: ProductRow[]; channels: string[] }): { facts: Fact[]; diagnostics: Diagnostic[] } {
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const selectedChannels = [...new Set(channels)].sort(compareText);
  const scopeParts = (scope: Scope) => [scope.kind, scope.channels, scope.sku ?? null];
  const factId = (scope: Scope, period: Period, metric: MetricName) => JSON.stringify(["fact", dataset.manifest.dataset_id, period.start, period.end, ...scopeParts(scope), metric]);
  const addFacts = (scope: Scope, period: Period, summary: Pick<Summary, "sources"> & { metrics: Partial<Summary["metrics"]> }, fields: readonly MetricName[]) => {
    for (const field of fields) {
      const value = summary.metrics[field];
      if (!value) continue;
      facts.push({
        id: factId(scope, period, field), metric: field, value: value.value,
        reason_codes: [...value.reason_codes], scope: { ...scope, channels: [...scope.channels] },
        period: { ...period }, sources: summary.sources.map(source => ({ ...source })),
      });
    }
  };
  const addRule = (scope: Scope, code: RuleCode, references: { period: Period; metric: MetricName }[], ranking_amount: Metric | null) => {
    const copy = COPY[code];
    diagnostics.push({
      id: JSON.stringify(["rule", dataset.manifest.dataset_id, previous.period.start, previous.period.end, current.period.start, current.period.end, ...scopeParts(scope), code]),
      code, scope: { ...scope, channels: [...scope.channels] }, ...copy,
      limitations: [...copy.limitations],
      fact_ids: [...new Set(references.map(reference => factId(scope, reference.period, reference.metric)))],
      ranking_amount: ranking_amount ? { ...ranking_amount, reason_codes: [...ranking_amount.reason_codes] } : null,
    });
  };
  const pairReferences = (fields: MetricName[]) => fields.flatMap(metric => [
    { period: previous.period, metric }, { period: current.period, metric },
  ]);
  const diagnoseScope = (scope: Scope, before: Summary, after: Summary) => {
    const fields = Object.keys(before.metrics) as MetricName[];
    addFacts(scope, previous.period, before, fields);
    addFacts(scope, current.period, after, fields);
    const unknown = [
      ...AMOUNT_FIELDS.filter(field => before.totals[field].cents === null).map(metric => ({ period: previous.period, metric })),
      ...AMOUNT_FIELDS.filter(field => after.totals[field].cents === null).map(metric => ({ period: current.period, metric })),
    ];
    if (unknown.length) addRule(scope, "MISSING_CRITICAL_DATA", unknown, null);

    const revenueChange = compareMoney(before.metrics.net_revenue, after.metrics.net_revenue).absolute_change;
    const contributionChange = compareMoney(before.metrics.contribution_after_marketing, after.metrics.contribution_after_marketing).absolute_change;
    const revenueDelta = moneyValue(revenueChange);
    const contributionDelta = moneyValue(contributionChange);
    if (revenueDelta !== null && contributionDelta !== null && revenueDelta > 0n && contributionDelta < 0n) {
      addRule(scope, "REV_UP_CM_DOWN", pairReferences(["net_revenue", "contribution_after_marketing"]), contributionChange);
    }
    const contribution = moneyValue(after.metrics.contribution_after_marketing);
    if (scope.kind === "channel" && contribution !== null && contribution < 0n) {
      addRule(scope, "NEGATIVE_CHANNEL_CM", [{ period: current.period, metric: "contribution_after_marketing" }], after.metrics.contribution_after_marketing);
    }
    const burdens: { code: RuleCode; amount: AmountField; rate: MetricName; denominator: (totals: Totals) => Amount; evidence: MetricName[] }[] = [
      { code: "DISCOUNT_BURDEN_UP", amount: "discounts", rate: "discount_rate", denominator: totals => totals.gross_sales, evidence: ["gross_sales"] },
      { code: "REFUND_BURDEN_UP", amount: "refunds", rate: "refund_ratio", denominator: totals => subtractAmounts(totals.gross_sales, totals.discounts), evidence: ["gross_sales", "discounts"] },
      { code: "FULFILLMENT_BURDEN_UP", amount: "fulfillment_costs", rate: "fulfillment_burden", denominator: net, evidence: ["net_revenue"] },
      { code: "MARKETING_BURDEN_UP", amount: "ad_spend", rate: "marketing_burden", denominator: net, evidence: ["net_revenue"] },
    ];
    for (const burden of burdens) {
      if (ratioIncreased(before.totals[burden.amount], burden.denominator(before.totals), after.totals[burden.amount], burden.denominator(after.totals))) {
        addRule(scope, burden.code, pairReferences([burden.rate, burden.amount, ...burden.evidence]), compareMoney(before.metrics[burden.amount], after.metrics[burden.amount]).absolute_change);
      }
    }
  };

  diagnoseScope({ kind: "all", channels: selectedChannels }, previous, current);
  for (const channel of selectedChannels) {
    if (previous.channels[channel] && current.channels[channel]) {
      diagnoseScope({ kind: "channel", channels: [channel] }, previous.channels[channel], current.channels[channel]);
    }
  }
  const products = [...currentProducts].sort((a, b) => compareText(JSON.stringify([a.channel, a.sku]), JSON.stringify([b.channel, b.sku])));
  for (const product of products) {
    if (!selectedChannels.includes(product.channel)) continue;
    const scope: Scope = { kind: "sku", channels: [product.channel], sku: product.sku, category: product.category };
    addFacts(scope, current.period, product, PRODUCT_METRICS);
    const grossProfit = moneyValue(product.metrics.gross_profit);
    if (grossProfit !== null && grossProfit < 0n) {
      addRule(scope, "SKU_NEGATIVE_GP", ["net_revenue", "cogs_net", "gross_profit"].map(metric => ({ period: current.period, metric: metric as MetricName })), product.metrics.gross_profit);
    }
  }
  const rankAmount = (diagnostic: Diagnostic) => {
    const value = diagnostic.ranking_amount ? moneyValue(diagnostic.ranking_amount) : null;
    return value === null ? 0n : value < 0n ? -value : value;
  };
  diagnostics.sort((a, b) => {
    const missingOrder = Number(b.code === "MISSING_CRITICAL_DATA") - Number(a.code === "MISSING_CRITICAL_DATA");
    if (missingOrder) return missingOrder;
    const aa = rankAmount(a);
    const bb = rankAmount(b);
    return aa > bb ? -1 : aa < bb ? 1 : compareText(a.id, b.id);
  });
  return { facts, diagnostics };
}
