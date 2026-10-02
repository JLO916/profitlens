import { uniqueSources } from "../domain/aggregation";
import { compareMoney } from "../domain/metrics";
import { formatCents, parseCents } from "../domain/money";
import type { Diagnostic, Fact, Metric, MetricName, Period, RuleCode, Scope, SourceRef } from "../domain/types";
import { encodeCsv, type CsvCell } from "./export";
import { metricDefinitions } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

export interface SummaryEvidence {
  title: string; name: MetricName; metric: Metric; period: Period; channels: string[]; sources: SourceRef[];
  formula?: string; components?: { label: string; metric: Metric }[]; scopeLabel?: string;
}
export interface SummaryMetric {
  metric: "net_revenue" | "contribution_after_marketing";
  previous: Metric; current: Metric; change: Metric;
  transition: ReturnType<typeof compareMoney>["transition"];
  evidence: { previous: SummaryEvidence; current: SummaryEvidence; change: SummaryEvidence };
}
export interface SummaryPriority {
  code: RuleCode; title: string; recommendation: string; limitations: string[];
  members: Diagnostic[]; primary: Diagnostic; ranking_amount: Metric;
  importance_amount: string | null; fact_ids: string[]; evidence: SummaryEvidence;
}
export interface SummaryScenario {
  id: string; name: string; status: "draft" | "current" | "stale"; scopeLabel: string;
  contribution?: string | null; delta?: string | null; assumptions: string[];
  baseline?: string | null;
  binding?: { context_id: string; plan_revision: number; dataset_hash: string; filter_hash: string; metric_version: string; scenario_version: string; period: Period; channels: string[]; sources: SourceRef[] };
}
export interface SummaryAction {
  id: string; problem: string; action: string; owner: string; deadline: string; risk: string;
  status: "draft" | "current" | "stale"; scopeLabel: string;
  pinned?: boolean; executionStatus?: string; executionNotes?: string;
}
/** Callers derive statuses from their captured workspaces, never from a result's presence. */
export interface SummaryDecisionContext {
  dataset_hash: string; filter_hash: string; selectedScenarioId?: string;
  scenarios: SummaryScenario[]; actions: SummaryAction[];
  selectedScenarioIds?: string[]; pinnedOnly?: boolean; notes?: string; decisionState?: string; reviewName?: string;
}
/** null means use the supplied default; an empty string explicitly clears it. */
export function withSummaryScenarioSelection(context: SummaryDecisionContext | undefined, selection: string | null): SummaryDecisionContext | undefined {
  return context ? { ...context, selectedScenarioId: selection ?? context.selectedScenarioId } : undefined;
}
export interface ManagerSummary {
  dataset_id: string; dataset_hash: string; filter_hash: string; metric_version: string; data_as_of: string;
  scope: WorkspaceSnapshot["report"]["scope"];
  previous_days: number; current_days: number; importance_threshold: string;
  headlines: SummaryMetric[];
  channels: { channel: string; revenue: SummaryMetric; contribution: SummaryMetric }[];
  priorities: SummaryPriority[]; groups: SummaryPriority[]; omitted_group_count: number;
  facts: Fact[]; assumptions: string[];
}

const LIMITATIONS = [
  "行銷後貢獻是商品範圍管理指標，不是公司淨利；未含未輸入固定費、所得稅、運費收入或平台補貼。",
  "金額為已觀察差異，非改善收益；各範圍不可相加。同一規則的合計與通路訊號分組呈現，不另加總。",
  "退款按入帳日；銷貨成本使用來源已入帳淨額；缺費用保持未知，不能視為零。",
  "期間合計完整保留；天數不同時可另看日均比較。情境是條件試算，不是營收預測；方案差額不可相加。",
];
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const abs = (value: bigint) => value < 0n ? -value : value;
export function summaryScopeLabel(scope: Scope): string {
  return scope.kind === "all" ? `合計（${scope.channels.join("、")}）` : `${scope.channels.join("、")}${scope.sku ? `／SKU ${scope.sku}` : ""}`;
}
function ranking(diagnostic: Diagnostic): bigint | null {
  return parseCents(diagnostic.ranking_amount?.value);
}
function rankOrder(a: Diagnostic, b: Diagnostic): number {
  const aa = abs(ranking(a) ?? 0n), bb = abs(ranking(b) ?? 0n);
  return aa > bb ? -1 : aa < bb ? 1 : compareText(a.id, b.id);
}
function metricComparison(snapshot: WorkspaceSnapshot, name: SummaryMetric["metric"], channel?: string): SummaryMetric {
  const { report } = snapshot;
  const previous = channel ? report.previous.channels[channel] : report.previous;
  const current = channel ? report.current.channels[channel] : report.current;
  const channels = channel ? [channel] : report.scope.channels;
  const scopeLabel = channel ?? `合計（${channels.join("、")}）`;
  const comparison = compareMoney(previous.metrics[name], current.metrics[name]);
  return {
    metric: name, previous: previous.metrics[name], current: current.metrics[name], change: comparison.absolute_change, transition: comparison.transition,
    evidence: {
      previous: { title: `主管摘要｜${scopeLabel} 前期${metricDefinitions[name].label}`, name, metric: previous.metrics[name], period: report.previous.period, channels, sources: previous.sources },
      current: { title: `主管摘要｜${scopeLabel} 本期${metricDefinitions[name].label}`, name, metric: current.metrics[name], period: report.current.period, channels, sources: current.sources },
      change: { title: `主管摘要｜${scopeLabel} ${metricDefinitions[name].label}差額`, name, metric: comparison.absolute_change,
        period: { start: report.previous.period.start, end: report.current.period.end }, channels, sources: uniqueSources([...previous.sources, ...current.sources]),
        formula: `本期${metricDefinitions[name].label} − 前期${metricDefinitions[name].label}；已觀察差額，非改善收益`, components: [{ label: "前期", metric: previous.metrics[name] }, { label: "本期", metric: current.metrics[name] }],
      },
    },
  };
}
const rankingMetric: Record<RuleCode, MetricName> = {
  REV_UP_CM_DOWN: "contribution_after_marketing", NEGATIVE_CHANNEL_CM: "contribution_after_marketing",
  DISCOUNT_BURDEN_UP: "discounts", REFUND_BURDEN_UP: "refunds", FULFILLMENT_BURDEN_UP: "fulfillment_costs",
  MARKETING_BURDEN_UP: "ad_spend", SKU_NEGATIVE_GP: "gross_profit", MISSING_CRITICAL_DATA: "cogs_net",
};
export function priorityEvidence(snapshot: Pick<WorkspaceSnapshot, "report">, diagnostic: Diagnostic): SummaryEvidence {
  const { report } = snapshot;
  const facts = report.facts.filter(fact => diagnostic.fact_ids.includes(fact.id));
  const scopeLabel = summaryScopeLabel(diagnostic.scope);
  if (diagnostic.code === "MISSING_CRITICAL_DATA") {
    const unknown = facts.find(fact => fact.value === null)!;
    return { title: `主管摘要｜${scopeLabel} 缺漏來源`, name: unknown.metric, metric: unknown, period: unknown.period, channels: diagnostic.scope.channels, scopeLabel, sources: unknown.sources };
  }
  const name = rankingMetric[diagnostic.code];
  const metricFacts = facts.filter(fact => fact.metric === name);
  const isCurrent = diagnostic.code === "NEGATIVE_CHANNEL_CM" || diagnostic.code === "SKU_NEGATIVE_GP";
  return {
    title: `主管摘要｜${scopeLabel} ${diagnostic.title}`, name, metric: diagnostic.ranking_amount!,
    period: isCurrent ? report.current.period : { start: report.previous.period.start, end: report.current.period.end },
    channels: diagnostic.scope.channels, scopeLabel, sources: uniqueSources(metricFacts.flatMap(fact => fact.sources)),
    ...(isCurrent ? {} : {
      formula: `本期${metricDefinitions[name].label} − 前期${metricDefinitions[name].label}；排序金額，不是可回收收益`,
      components: metricFacts.map(fact => ({ label: fact.period.start === report.previous.period.start ? "前期" : "本期", metric: fact })),
    }),
  };
}

/** Presentation-only prioritization. Rules, totals, facts and financial formulas stay unchanged. */
export function buildManagerSummary(snapshot: WorkspaceSnapshot, options: { importanceThreshold?: string } = {}): ManagerSummary {
  let threshold: bigint | null;
  try { threshold = parseCents(options.importanceThreshold ?? "0.00"); } catch { throw new Error("INVALID_IMPORTANCE_THRESHOLD"); }
  if (threshold === null || threshold < 0n) throw new Error("INVALID_IMPORTANCE_THRESHOLD");
  const { report } = snapshot;
  const grouped = new Map<RuleCode, Diagnostic[]>();
  for (const diagnostic of report.diagnostics) {
    const members = grouped.get(diagnostic.code) ?? [];
    // A single-channel all-scope signal repeats the very same channel facts.
    const same = members.findIndex(row => row.scope.sku === diagnostic.scope.sku && JSON.stringify(row.scope.channels) === JSON.stringify(diagnostic.scope.channels));
    if (same < 0) members.push(diagnostic);
    else if (diagnostic.scope.kind === "all") members[same] = diagnostic;
    grouped.set(diagnostic.code, members);
  }
  const groups: SummaryPriority[] = [...grouped].map(([code, source]) => {
    const members = [...source].sort((a, b) => Number(b.scope.kind === "all") - Number(a.scope.kind === "all") || rankOrder(a, b));
    const primary = members[0];
    const knownAmounts = members.map(ranking).filter((value): value is bigint => value !== null).map(abs);
    const importance = knownAmounts.length ? knownAmounts.reduce((max, amount) => amount > max ? amount : max, 0n) : null;
    return {
      code, title: primary.title, recommendation: primary.recommendation, limitations: [...new Set(members.flatMap(row => row.limitations))], members, primary,
      ranking_amount: primary.ranking_amount ?? { value: null, reason_codes: ["MISSING_CRITICAL_DATA"] },
      importance_amount: importance === null ? null : formatCents(importance),
      fact_ids: [...new Set(members.flatMap(row => row.fact_ids))], evidence: priorityEvidence(snapshot, primary),
    };
  }).sort((a, b) => {
    const unknownFirst = Number(b.code === "MISSING_CRITICAL_DATA") - Number(a.code === "MISSING_CRITICAL_DATA");
    if (unknownFirst) return unknownFirst;
    const aa = parseCents(a.importance_amount) ?? 0n, bb = parseCents(b.importance_amount) ?? 0n;
    return aa > bb ? -1 : aa < bb ? 1 : compareText(a.code, b.code);
  });
  const eligible = groups.filter(group => group.code === "MISSING_CRITICAL_DATA" || (parseCents(group.importance_amount) ?? -1n) >= threshold);
  return structuredClone({
    dataset_id: report.dataset_id, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, metric_version: snapshot.metric_version, data_as_of: snapshot.data_as_of,
    scope: report.scope, previous_days: report.comparison.previous_days, current_days: report.comparison.current_days, importance_threshold: formatCents(threshold),
    headlines: [metricComparison(snapshot, "net_revenue"), metricComparison(snapshot, "contribution_after_marketing")],
    channels: report.scope.channels.map(channel => ({ channel, revenue: metricComparison(snapshot, "net_revenue", channel), contribution: metricComparison(snapshot, "contribution_after_marketing", channel) })),
    priorities: eligible.slice(0, 3), groups, omitted_group_count: groups.length - Math.min(eligible.length, 3), facts: report.facts, assumptions: LIMITATIONS,
  });
}

/** A context from another dataset/filter cannot be used as this meeting's current decision. */
export function summaryDecisionState(summary: ManagerSummary, context?: SummaryDecisionContext) {
  const matches = context?.dataset_hash === summary.dataset_hash && context.filter_hash === summary.filter_hash;
  const scenarios = (context?.scenarios ?? []).map(row => ({ ...row, status: matches ? row.status : "stale" as const }));
  const actions = (context?.actions ?? []).map(row => ({ ...row, status: matches ? row.status : "stale" as const }));
  const ids = context?.selectedScenarioIds ?? (context?.selectedScenarioId ? [context.selectedScenarioId] : []);
  const selectedScenarios = scenarios.filter(row => ids.includes(row.id) && row.status === "current" && parseCents(row.contribution) !== null && parseCents(row.delta) !== null);
  const mainActions = context?.pinnedOnly ? actions.filter(row => row.pinned).slice(0, 3) : actions;
  const appendixActions = context?.pinnedOnly ? actions.filter(row => !row.pinned) : [];
  return { scenarios, actions, selected: selectedScenarios[0] ?? null, selectedScenarios, mainActions, appendixActions };
}

export const UNPINNED_ACTIONS_NOTICE = "尚未置頂行動；主摘要不會自動挑選，其餘列附錄。";

/** Neutralize user-controlled Markdown/HTML, including links and embedded line breaks. */
const md = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+!|~]/g, character => `\\${character}`).replace(/\r\n|\r|\n/g, "&#10;");
const amount = (metric: Metric, signed = false): string => metric.value === null ? `未知（${metric.reason_codes.join("、")}）` : `${signed && parseCents(metric.value)! > 0n ? "+" : ""}${metric.value}`;
export function exportManagerSummaryMarkdown(summary: ManagerSummary, context?: SummaryDecisionContext): string {
  const decisions = summaryDecisionState(summary, context);
  const lines = [`# ProfitLens 主管會議摘要（${md(context?.decisionState ?? "草稿")}）`, "", `資料截至：${summary.data_as_of}｜範圍：${md(summary.scope.channels.join("、"))}｜TWD`,
    `前期：${summary.scope.previous_period.start}～${summary.scope.previous_period.end}（${summary.previous_days} 天）`,
    `本期：${summary.scope.current_period.start}～${summary.scope.current_period.end}（${summary.current_days} 天）`,
    `比較：${summary.scope.comparison_mode === "calendar_months" ? "完整自然月" : "相同天數"}；以下為期間合計。重要性門檻：${summary.importance_threshold} TWD。`, "", "## 經營變化", ""];
  for (const row of summary.headlines) lines.push(`- ${metricDefinitions[row.metric].label}：${amount(row.previous)} → ${amount(row.current)}；差額 ${amount(row.change, true)}。`);
  lines.push("", "| 通路 | 前期貢獻 | 本期貢獻 | 差額 |", "| --- | ---: | ---: | ---: |");
  for (const row of summary.channels) lines.push(`| ${md(row.channel)} | ${amount(row.contribution.previous)} | ${amount(row.contribution.current)} | ${amount(row.contribution.change, true)} |`);
  lines.push("", "## 本期最值得先查的三件事", "");
  if (!summary.priorities.length) lines.push("目前沒有達到門檻的規則訊號；不代表沒有營運風險。完整規則仍見診斷明細。");
  for (const [index, item] of summary.priorities.entries()) {
    lines.push(`${index + 1}. ${md(item.title)}｜${md(summaryScopeLabel(item.primary.scope))}｜${amount(item.ranking_amount, true)}`, `   下一步：${md(item.recommendation)}`);
    if (item.members.length > 1) lines.push(`   相關子範圍：${item.members.slice(1, 4).map(member => md(summaryScopeLabel(member.scope))).join("、")}${item.members.length > 4 ? "等（詳附錄）" : ""}；各範圍不可相加。`);
  }
  lines.push("", "## 所選方案與交辦", "");
  if (decisions.selectedScenarios.length) {
    for (const plan of decisions.selectedScenarios) {
    lines.push(`所選方案：${md(plan.name)}｜${md(plan.scopeLabel)}｜${plan.baseline !== undefined ? `基準貢獻 ${plan.baseline ?? "未知"}；` : ""}條件貢獻 ${plan.contribution}；相對基準差額 ${plan.delta} TWD。`, ...plan.assumptions.map(item => `- 假設：${md(item)}`));
    }
    lines.push("各通路方案獨立列示，差額不相加；條件結果不是預測或已實現改善。");
  } else lines.push("未選擇可沿用的方案；草稿及過期方案不作為本期決策。未宣稱已發生改善。");
  if (!decisions.mainActions.length) lines.push(decisions.appendixActions.length ? UNPINNED_ACTIONS_NOTICE : "尚未置頂行動；待指定負責人、期限與風險／停止條件。");
  for (const action of decisions.mainActions) lines.push(`- ${md(action.problem)}（${action.status === "current" ? "已確認" : action.status === "stale" ? "過期／歷史證據" : "草稿待確認"}；${md(action.scopeLabel)}）：${md(action.action)}；負責人 ${md(action.owner || "待指定")}；期限 ${md(action.deadline || "待設定")}；風險／停止條件 ${md(action.risk || "待補")}。${action.executionStatus ? ` 執行：${md(action.executionStatus)}；${md(action.executionNotes ?? "")}` : ""}`);
  if (context?.reviewName) lines.push("", `會議：${md(context.reviewName)}；決策：${md(context.decisionState ?? "draft")}`, `備註：${md(context.notes ?? "")}`);
  lines.push("", "## 固定口徑與限制", "", ...summary.assumptions.map(item => `- ${md(item)}`), "", "---", "", "## 技術稽核附錄", "",
    `- dataset_id：${md(summary.dataset_id)}`, `- dataset_hash：${summary.dataset_hash}`, `- filter_hash：${summary.filter_hash}`, `- metric_version：${summary.metric_version}`,
    "- 摘要優先序：資料缺漏先列；同一規則分組；門檻取組內最大絕對排序金額，並非加總；最多列三組，不改底層規則。",
    "- 摘要與通路表差額＝本期金額 − 前期金額；下列 facts 保留兩期合計與各通路來源，即使沒有規則訊號仍可追溯。", "");
  if (decisions.appendixActions.length) lines.push("### 其他行動", ...decisions.appendixActions.map(action => `- ${md(action.problem)}（${action.status}；${md(action.scopeLabel)}）：${md(action.action)}；負責人 ${md(action.owner || "待指定")}；期限 ${md(action.deadline || "待設定")}；風險 ${md(action.risk || "待補")}；${md(action.executionStatus ?? "")} ${md(action.executionNotes ?? "")}`), "");
  for (const group of summary.groups) {
    lines.push(`### ${group.code}`, `- 門檻比較金額：${group.importance_amount ?? "未知"}`);
    for (const member of group.members) lines.push(`- ${md(summaryScopeLabel(member.scope))}：${member.ranking_amount ? amount(member.ranking_amount) : "資料待補"}；${md(JSON.stringify(member.fact_ids))}`);
  }
  const ids = new Set([
    ...summary.groups.flatMap(group => group.fact_ids),
    ...summary.facts.filter(fact => fact.scope.kind !== "sku" && (fact.metric === "net_revenue" || fact.metric === "contribution_after_marketing")).map(fact => fact.id),
  ]);
  for (const fact of summary.facts.filter(fact => ids.has(fact.id))) lines.push("", `- fact_id：${md(fact.id)}`, `- ${md(metricDefinitions[fact.metric].label)}：${fact.value ?? "未知"}；${md(JSON.stringify({ metric: fact.metric, reason_codes: fact.reason_codes, period: fact.period, scope: fact.scope, sources: fact.sources }))}`);
  if (decisions.scenarios.length) lines.push("", "### 方案狀態", ...decisions.scenarios.flatMap(plan => [`- ${md(plan.name)}：${plan.status}；${md(plan.scopeLabel)}；基準 ${plan.baseline ?? "未知"}；條件 ${plan.contribution ?? "未知"}；差額 ${plan.delta ?? "未知"}。`, ...plan.assumptions.map(value => `  - 假設：${md(value)}`), ...(plan.binding ? [`  - 原方案來源：${md(JSON.stringify(plan.binding))}`] : [])]));
  return `${lines.join("\n")}\n`;
}

export function exportChannelComparisonCsv(summary: ManagerSummary): string {
  const text = (value: string): CsvCell => ({ kind: "text", value });
  const number = (value: string | null): CsvCell => value === null ? { kind: "null" } : { kind: "number", value };
  const headers = ["通路", "前期商品淨營收", "本期商品淨營收", "商品淨營收差額", "前期行銷後貢獻", "本期行銷後貢獻", "行銷後貢獻差額", "資料截至日", "前期起日", "前期迄日", "本期起日", "本期迄日", "前期天數", "本期天數", "比較方式", "資料狀態", "缺漏原因", "口徑限制", "metric_version", "dataset_hash", "filter_hash"];
  return encodeCsv([headers.map(text), ...summary.channels.map(row => {
    const metrics = [row.revenue.previous, row.revenue.current, row.revenue.change, row.contribution.previous, row.contribution.current, row.contribution.change];
    const missing = metrics.filter(metric => metric.value === null);
    return [text(row.channel), ...metrics.map(metric => number(metric.value)), text(summary.data_as_of), text(summary.scope.previous_period.start), text(summary.scope.previous_period.end), text(summary.scope.current_period.start), text(summary.scope.current_period.end), number(String(summary.previous_days)), number(String(summary.current_days)), text(summary.scope.comparison_mode), text(missing.length ? "部分資料待補" : "已知"), text([...new Set(missing.flatMap(metric => metric.reason_codes))].join("；")), text("TWD 未稅商品範圍；行銷後貢獻非公司淨利；各層範圍不可相加；差額非改善收益。"), text(summary.metric_version), text(summary.dataset_hash), text(summary.filter_hash)];
  })]);
}
