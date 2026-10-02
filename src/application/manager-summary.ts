import { uniqueSources } from "../domain/aggregation";
import { compareMoney } from "../domain/metrics";
import { formatCents, parseCents } from "../domain/money";
import type { Diagnostic, Fact, Metric, MetricName, Period, RuleCode, Scope, SourceRef } from "../domain/types";
import { fill, labels } from "../i18n";
import { channelLabel, channelsLabel, conversionSentence, csvHeader, demoAlias, ruleCopy, scopeLabel } from "./copy";
import type { TaxConversion } from "./tax-basis";
import { encodeCsv, type CsvCell } from "./export";
import { metricDefinitions } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

export interface SummaryEvidence {
  title: string; name: MetricName; metric: Metric; period: Period; channels: string[]; sources: SourceRef[];
  formula?: string; components?: { label: string; metric: Metric }[]; scopeLabel?: string; sku?: string;
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
  /** R3：含稅換算一句（沒有換算為 null），通路寬表 CSV 的口徑限制欄也帶上。 */
  conversion_note: string | null;
}

/** 口徑說明（R2）：摘要的固定口徑直接沿用 labels.basis.items，與口徑說明對話框同一來源。 */
const LIMITATIONS: string[] = [...labels.basis.items];
const copy = labels.ui.managerSummary;
/** 會議決議狀態的顯示文字；未知的原始值原樣顯示。 */
const decisionLabel = (state: string | undefined): string => (labels.meeting.decisions as Record<string, string>)[state ?? "draft"] ?? state ?? labels.meeting.decisions.draft;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const abs = (value: bigint) => value < 0n ? -value : value;
export function summaryScopeLabel(scope: Scope, alias = false): string {
  return scopeLabel(scope, alias);
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
  const alias = demoAlias(report.dataset_id);
  const previous = channel ? report.previous.channels[channel] : report.previous;
  const current = channel ? report.current.channels[channel] : report.current;
  const channels = channel ? [channel] : report.scope.channels;
  const scope = channel ? channelLabel(channel, alias) : `${labels.sections.total}（${channelsLabel(channels, alias)}）`;
  const metric = metricDefinitions[name].label;
  const comparison = compareMoney(previous.metrics[name], current.metrics[name]);
  return {
    metric: name, previous: previous.metrics[name], current: current.metrics[name], change: comparison.absolute_change, transition: comparison.transition,
    evidence: {
      previous: { title: fill(copy.evidencePrevious, { scope, metric }), name, metric: previous.metrics[name], period: report.previous.period, channels, sources: previous.sources },
      current: { title: fill(copy.evidenceCurrent, { scope, metric }), name, metric: current.metrics[name], period: report.current.period, channels, sources: current.sources },
      change: { title: fill(copy.evidenceChange, { scope, metric }), name, metric: comparison.absolute_change,
        period: { start: report.previous.period.start, end: report.current.period.end }, channels, sources: uniqueSources([...previous.sources, ...current.sources]),
        formula: fill(copy.changeFormula, { metric }), components: [{ label: labels.periods.previous, metric: previous.metrics[name] }, { label: labels.periods.current, metric: current.metrics[name] }],
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
  const alias = demoAlias(report.dataset_id);
  const facts = report.facts.filter(fact => diagnostic.fact_ids.includes(fact.id));
  const scopeLabel = summaryScopeLabel(diagnostic.scope, alias);
  if (diagnostic.code === "MISSING_CRITICAL_DATA") {
    const unknown = facts.find(fact => fact.value === null)!;
    return { title: fill(copy.evidenceMissing, { scope: scopeLabel }), name: unknown.metric, metric: unknown, period: unknown.period, channels: diagnostic.scope.channels, scopeLabel, sources: unknown.sources };
  }
  const name = rankingMetric[diagnostic.code];
  const metricFacts = facts.filter(fact => fact.metric === name);
  const isCurrent = diagnostic.code === "NEGATIVE_CHANNEL_CM" || diagnostic.code === "SKU_NEGATIVE_GP";
  return {
    title: fill(copy.evidencePriority, { scope: scopeLabel, title: ruleCopy(snapshot, diagnostic, alias).headline }), name, metric: diagnostic.ranking_amount!, sku: diagnostic.scope.sku,
    period: isCurrent ? report.current.period : { start: report.previous.period.start, end: report.current.period.end },
    channels: diagnostic.scope.channels, scopeLabel, sources: uniqueSources(metricFacts.flatMap(fact => fact.sources)),
    ...(isCurrent ? {} : {
      formula: fill(copy.changeFormula, { metric: metricDefinitions[name].label }),
      components: metricFacts.map(fact => ({ label: fact.period.start === report.previous.period.start ? labels.periods.previous : labels.periods.current, metric: fact })),
    }),
  };
}

/**
 * R1 呈現用「對貢獻影響」：負＝不利、正＝有利；不是新財務指標，定義見 docs/DECISIONS.md（Revamp v2 R1）。
 * 費用類規則的排序金額是「本期費用 − 前期費用」，費用增加對貢獻的影響為其負值；缺漏規則沒有金額。
 */
export function contributionImpact(diagnostic: Pick<Diagnostic, "code" | "ranking_amount">): Metric | null {
  if (!diagnostic.ranking_amount || diagnostic.code === "MISSING_CRITICAL_DATA") return null;
  const cents = parseCents(diagnostic.ranking_amount.value);
  if (cents === null) return { value: null, reason_codes: [...diagnostic.ranking_amount.reason_codes] };
  const burden = diagnostic.code === "DISCOUNT_BURDEN_UP" || diagnostic.code === "REFUND_BURDEN_UP" || diagnostic.code === "FULFILLMENT_BURDEN_UP" || diagnostic.code === "MARKETING_BURDEN_UP";
  return { value: formatCents(burden ? -cents : cents), reason_codes: [...diagnostic.ranking_amount.reason_codes] };
}

/** Presentation-only prioritization. Rules, totals, facts and financial formulas stay unchanged. */
export function buildManagerSummary(snapshot: WorkspaceSnapshot, options: { importanceThreshold?: string; conversion?: TaxConversion | null } = {}): ManagerSummary {
  // R3：含稅換算一句併入口徑說明，Markdown 的「資料範圍與口徑」與畫面同源。
  const converted = conversionSentence(options.conversion);
  let threshold: bigint | null;
  try { threshold = parseCents(options.importanceThreshold ?? "0.00"); } catch { throw new Error("INVALID_IMPORTANCE_THRESHOLD"); }
  if (threshold === null || threshold < 0n) throw new Error("INVALID_IMPORTANCE_THRESHOLD");
  const { report } = snapshot;
  const alias = demoAlias(report.dataset_id);
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
    const rule = ruleCopy(snapshot, primary, alias);
    return {
      code, title: rule.headline, recommendation: rule.nextStep, limitations: [rule.caution], members, primary,
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
    priorities: eligible.slice(0, 3), groups, omitted_group_count: groups.length - Math.min(eligible.length, 3), facts: report.facts, assumptions: converted ? [...LIMITATIONS, converted] : LIMITATIONS, conversion_note: converted,
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

const scenarioStatusLabel = (status: string) => (labels.ui.decisionExport.scenarioStatus as Record<string, string>)[status] ?? status;
export const UNPINNED_ACTIONS_NOTICE: string = copy.unpinnedNotice;

/** Neutralize user-controlled Markdown/HTML, including links and embedded line breaks. */
const md = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+!|~]/g, character => `\\${character}`).replace(/\r\n|\r|\n/g, "&#10;");
const amount = (metric: Metric, signed = false): string => metric.value === null ? fill(copy.missingWithReasons, { reasons: metric.reason_codes.join("、") }) : `${signed && parseCents(metric.value)! > 0n ? "+" : ""}${metric.value}`;
const actionStatusLabel = (status: SummaryAction["status"]): string => status === "current" ? copy.actionStatus.current : status === "stale" ? labels.actions.staleBadge : copy.actionStatus.draft;
/** 待辦列：沒有進度時省略模板尾段（「{stop}」之後的進度欄）。 */
const actionRow = (action: SummaryAction, status: string): string => {
  const template = action.executionStatus ? copy.mdActionRow : `${copy.mdActionRow.split("{stop}")[0]}{stop}。`;
  return fill(template, {
    problem: md(action.problem), status, scope: md(action.scopeLabel), step: md(action.action), owner: md(action.owner || copy.ownerUnset), due: md(action.deadline || copy.dueUnset), stop: md(action.risk || copy.riskUnset),
    executionStatus: md(action.executionStatus ?? ""), executionNotes: md(action.executionNotes ?? ""),
  });
};
export function exportManagerSummaryMarkdown(summary: ManagerSummary, context?: SummaryDecisionContext): string {
  const decisions = summaryDecisionState(summary, context);
  const alias = demoAlias(summary.dataset_id);
  const contributionShort = metricDefinitions.contribution_after_marketing.shortLabel;
  const lines = [fill(copy.mdTitle, { brand: labels.brand.name, decision: md(decisionLabel(context?.decisionState)) }), "", fill(copy.mdMeta, { asOf: summary.data_as_of, channels: md(channelsLabel(summary.scope.channels, alias)) }),
    fill(copy.mdPeriod, { period: labels.periods.previous, start: summary.scope.previous_period.start, end: summary.scope.previous_period.end, days: summary.previous_days }),
    fill(copy.mdPeriod, { period: labels.periods.current, start: summary.scope.current_period.start, end: summary.scope.current_period.end, days: summary.current_days }),
    fill(copy.mdComparison, { mode: summary.scope.comparison_mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays, threshold: summary.importance_threshold }), "", copy.mdHeadlines, ""];
  for (const row of summary.headlines) lines.push(fill(copy.mdHeadlineRow, { metric: metricDefinitions[row.metric].label, previous: amount(row.previous), current: amount(row.current), change: amount(row.change, true) }));
  lines.push("", `| ${labels.csvColumns.channel} | ${labels.periods.previous}${contributionShort} | ${labels.periods.current}${contributionShort} | ${labels.csvSuffix.change} |`, "| --- | ---: | ---: | ---: |");
  for (const row of summary.channels) lines.push(`| ${md(channelLabel(row.channel, alias))} | ${amount(row.contribution.previous)} | ${amount(row.contribution.current)} | ${amount(row.contribution.change, true)} |`);
  lines.push("", `## ${labels.sections.topThree}`, "");
  if (!summary.priorities.length) lines.push(labels.notes.noPriorities);
  for (const [index, item] of summary.priorities.entries()) {
    lines.push(fill(copy.mdPriorityRow, { n: index + 1, headline: md(item.title), scope: md(summaryScopeLabel(item.primary.scope, alias)), amount: amount(item.ranking_amount, true) }), `   ${labels.sections.nextStep}：${md(item.recommendation)}`);
    if (item.members.length > 1) lines.push(fill(copy.mdRelatedScopes, { scopes: item.members.slice(1, 4).map(member => md(summaryScopeLabel(member.scope, alias))).join("、"), more: item.members.length > 4 ? `等（${labels.sections.technicalDetails}）` : "" }));
  }
  lines.push("", copy.mdDecisions, "");
  if (decisions.selectedScenarios.length) {
    for (const plan of decisions.selectedScenarios) {
    lines.push(fill(copy.mdSelectedScenario, { name: md(plan.name), scope: md(plan.scopeLabel), baseline: plan.baseline !== undefined ? plan.baseline ?? labels.status.missing : labels.status.notApplicable, contribution: plan.contribution, delta: plan.delta }), ...plan.assumptions.map(item => fill(copy.assumptionPrefix, { text: md(item) })));
    }
    lines.push(copy.scenarioCaution);
  } else lines.push(copy.noSelectedScenario);
  if (!decisions.mainActions.length) lines.push(decisions.appendixActions.length ? UNPINNED_ACTIONS_NOTICE : copy.noActions);
  for (const action of decisions.mainActions) lines.push(actionRow(action, actionStatusLabel(action.status)));
  if (context?.reviewName) lines.push("", fill(copy.mdMeeting, { name: md(context.reviewName), decision: md(decisionLabel(context.decisionState)) }), `${labels.meeting.notes}：${md(context.notes ?? "")}`);
  lines.push("", `## ${labels.basis.title}`, "", ...summary.assumptions.map(item => `- ${md(item)}`), "", "---", "", `## ${labels.sections.technicalDetails}`, "",
    `- dataset_id：${md(summary.dataset_id)}`, `- dataset_hash：${summary.dataset_hash}`, `- filter_hash：${summary.filter_hash}`, `- metric_version：${summary.metric_version}`,
    copy.techPriorityNote, copy.techFactsNote, "");
  if (decisions.appendixActions.length) lines.push(copy.otherActions, ...decisions.appendixActions.map(action => actionRow(action, actionStatusLabel(action.status))), "");
  for (const group of summary.groups) {
    lines.push(`### ${group.code}`, fill(copy.techThresholdAmount, { amount: group.importance_amount ?? labels.status.missing }));
    for (const member of group.members) lines.push(`- ${md(summaryScopeLabel(member.scope, alias))}：${member.ranking_amount ? amount(member.ranking_amount) : labels.status.missing}；${md(JSON.stringify(member.fact_ids))}`);
  }
  const ids = new Set([
    ...summary.groups.flatMap(group => group.fact_ids),
    ...summary.facts.filter(fact => fact.scope.kind !== "sku" && (fact.metric === "net_revenue" || fact.metric === "contribution_after_marketing")).map(fact => fact.id),
  ]);
  for (const fact of summary.facts.filter(fact => ids.has(fact.id))) lines.push("", `- fact_id：${md(fact.id)}`, `- ${md(metricDefinitions[fact.metric].label)}：${fact.value ?? labels.status.missing}；${md(JSON.stringify({ metric: fact.metric, reason_codes: fact.reason_codes, period: fact.period, scope: fact.scope, sources: fact.sources }))}`);
  if (decisions.scenarios.length) lines.push("", copy.techScenarioStatus, ...decisions.scenarios.flatMap(plan => [`- ${md(plan.name)}：${scenarioStatusLabel(plan.status)}；${md(plan.scopeLabel)}；${labels.sections.scenarioBaseline} ${plan.baseline ?? labels.status.missing}；${labels.scenario.resultTitle} ${plan.contribution ?? labels.status.missing}；${labels.csvSuffix.change} ${plan.delta ?? labels.status.missing}。`, ...plan.assumptions.map(value => `  ${fill(copy.assumptionPrefix, { text: md(value) })}`), ...(plan.binding ? [`  - 原方案來源：${md(JSON.stringify(plan.binding))}`] : [])]));
  return `${lines.join("\n")}\n`;
}

export function exportChannelComparisonCsv(summary: ManagerSummary): string {
  const text = (value: string): CsvCell => ({ kind: "text", value });
  const number = (value: string | null): CsvCell => value === null ? { kind: "null" } : { kind: "number", value };
  const headers = ["channel", "previous_net_revenue", "current_net_revenue", "net_revenue_change", "previous_contribution_after_marketing", "current_contribution_after_marketing", "contribution_after_marketing_change", "data_as_of", "previous_start", "previous_end", "current_start", "current_end", "previous_days", "current_days", "comparison_mode", "data_status", "missing_reasons", "basis_note", "metric_version", "dataset_hash", "filter_hash"];
  return encodeCsv([headers.map(header => text(csvHeader(header))), ...summary.channels.map(row => {
    const metrics = [row.revenue.previous, row.revenue.current, row.revenue.change, row.contribution.previous, row.contribution.current, row.contribution.change];
    const missing = metrics.filter(metric => metric.value === null);
    return [text(row.channel), ...metrics.map(metric => number(metric.value)), text(summary.data_as_of), text(summary.scope.previous_period.start), text(summary.scope.previous_period.end), text(summary.scope.current_period.start), text(summary.scope.current_period.end), number(String(summary.previous_days)), number(String(summary.current_days)), text(summary.scope.comparison_mode), text(missing.length ? labels.status.partial : labels.status.ready), text([...new Set(missing.flatMap(metric => metric.reason_codes))].join("；")), text(summary.conversion_note ? `${labels.basis.footer} ${summary.conversion_note}` : labels.basis.footer), text(summary.metric_version), text(summary.dataset_hash), text(summary.filter_hash)];
  })]);
}
