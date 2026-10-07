import { uniqueSources } from "../domain/aggregation";
import { compareMoney } from "../domain/metrics";
import { formatCents, parseCents } from "../domain/money";
import type { Diagnostic, Fact, Metric, MetricName, Period, RuleCode, Scope, SourceRef } from "../domain/types";
import { fill, labels } from "../i18n";
import { channelLabel, channelsLabel, conversionSentence, csvHeader, demoAlias, ruleCopy, scopeLabel } from "./copy";
import type { TaxConversion } from "./tax-basis";
import { assistKpis, ASSIST_KPI_VERSION, type AssistKpi } from "./assist-kpi";
import { BREAKEVEN_MER_VERSION, breakevenMer, type BreakevenMer } from "./breakeven-mer";
import { achievementText, matchTargets, mismatchText, TARGET_METRICS, type TargetMetric, type TargetSet } from "./targets";
import { encodeCsv, type CsvCell } from "./export";
import { buildExportHeader, markdownExportHeader } from "./export-header";
import { formatAmount, formatMetric, formatPeriodExport, formatSignedDelta, metricDefinitions, type Layer } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";
import { contributionImpact, diagnosisGroups, impactMagnitude, type DiagnosisGroup } from "./diagnosis-group";

// R5：「對貢獻影響」與分組排序的單一來源在 diagnosis-group.ts；這裡沿用同名 export，對外簽名不變。
export { contributionImpact };

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
  /** R5：|impact_cents|（primary 的對貢獻影響絕對值）；門檻與排序都用它。單一成員時與舊值相同。 */
  importance_amount: string | null; fact_ids: string[]; evidence: SummaryEvidence;
  /** R5 加法：primary 的「對貢獻影響」（與三件事、健檢清單同一個金額）；資料缺漏為 null。 */
  impact: Metric | null; impact_cents: string | null;
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
  /** R5：健檢清單用的 DiagnosisGroup（全部 group，順序與 groups 相同）。 */
  diagnosis: DiagnosisGroup[];
  facts: Fact[]; assumptions: string[];
  /** R3：含稅換算一句（沒有換算為 null），通路寬表 CSV 的口徑限制欄也帶上。 */
  conversion_note: string | null;
  /** R4：輔助指標（assist-kpi-v1），上期與本期各七格。 */
  assist: { version: typeof ASSIST_KPI_VERSION; previous: AssistKpi[]; current: AssistKpi[] };
  /** V3-9a F12：損益兩平 MER（breakeven-mer-v1，獨立於 assist-kpi-v1）；選填，舊的摘要物件沒有這個欄位。 */
  breakeven?: { version: typeof BREAKEVEN_MER_VERSION; previous: BreakevenMer; current: BreakevenMer };
  /** R4：目標達成（只列與本期完全相同的目標；期間不一致者列出提示）。 */
  targets: { metric: TargetMetric; text: string; status: "matched" | "mismatch" }[];
}

/** 口徑說明（R2）：摘要的固定口徑直接沿用 labels.basis.items，與口徑說明對話框同一來源。 */
const LIMITATIONS: string[] = [...labels.basis.items];
const copy = labels.ui.managerSummary;
/** 會議決議狀態的顯示文字；未知的原始值原樣顯示。 */
const decisionLabel = (state: string | undefined): string => (labels.meeting.decisions as Record<string, string>)[state ?? "draft"] ?? state ?? labels.meeting.decisions.draft;
export function summaryScopeLabel(scope: Scope, alias = false): string {
  return scopeLabel(scope, alias);
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

/** Presentation-only prioritization. Rules, totals, facts and financial formulas stay unchanged. */
export function buildManagerSummary(snapshot: WorkspaceSnapshot, options: { importanceThreshold?: string; conversion?: TaxConversion | null; targets?: { set: TargetSet | null; allChannels: readonly string[] } } = {}): ManagerSummary {
  const targetLines: ManagerSummary["targets"] = [];
  if (options.targets?.set) {
    const matches = matchTargets(options.targets.set, { current_period: snapshot.report.current.period, channels: snapshot.report.scope.channels, allChannels: options.targets.allChannels });
    for (const metric of TARGET_METRICS) {
      const match = matches[metric];
      if (match.status === "matched") targetLines.push({ metric, status: "matched", text: achievementText(match.row, snapshot.report.current.metrics[metric]) });
      else if (match.status === "mismatch") targetLines.push({ metric, status: "mismatch", text: mismatchText(match.nearest) });
    }
  }
  // R3：含稅換算一句併入口徑說明，Markdown 的「資料範圍與口徑」與畫面同源。
  const converted = conversionSentence(options.conversion);
  const { report } = snapshot;
  // R5：分組、排序、門檻與三件事都由 diagnosisGroups 決定（與 TopThree、健檢清單同一套規則）。
  const diagnosis = diagnosisGroups(snapshot, { importanceThreshold: options.importanceThreshold });
  const groups: SummaryPriority[] = diagnosis.groups.map(group => {
    const importance = impactMagnitude(group);
    return {
      code: group.rule, title: group.headline, recommendation: group.next_step, limitations: [group.caution], members: group.scopes.map(scope => scope.diagnostic), primary: group.primary,
      ranking_amount: group.ranking_amount, importance_amount: importance === null ? null : formatCents(importance),
      fact_ids: group.fact_ids, evidence: priorityEvidence(snapshot, group.primary), impact: group.impact, impact_cents: group.impact_cents,
    };
  });
  const byRule = new Map(groups.map(group => [group.code, group]));
  return structuredClone({
    dataset_id: report.dataset_id, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, metric_version: snapshot.metric_version, data_as_of: snapshot.data_as_of,
    scope: report.scope, previous_days: report.comparison.previous_days, current_days: report.comparison.current_days, importance_threshold: diagnosis.importance_threshold,
    headlines: [metricComparison(snapshot, "net_revenue"), metricComparison(snapshot, "contribution_after_marketing")],
    assist: { version: ASSIST_KPI_VERSION, previous: assistKpis(report.previous), current: assistKpis(report.current) }, targets: targetLines,
    breakeven: { version: BREAKEVEN_MER_VERSION, previous: breakevenMer(report.previous), current: breakevenMer(report.current) },
    channels: report.scope.channels.map(channel => ({ channel, revenue: metricComparison(snapshot, "net_revenue", channel), contribution: metricComparison(snapshot, "contribution_after_marketing", channel) })),
    priorities: diagnosis.priorities.map(group => byRule.get(group.rule)!), groups, omitted_group_count: diagnosis.omitted_group_count, diagnosis: diagnosis.groups, facts: report.facts, assumptions: converted ? [...LIMITATIONS, converted] : LIMITATIONS, conversion_note: converted,
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
/**
 * V3-2b §3.3：Markdown 主文（含表格）用 L2 整數元、技術細節用 L3 到分；負號 U+2212、正的差額加「+」。
 * 單位只標一次（「金額單位：元」或表頭「（元）」），儲存格內不重複。
 */
const amount = (metric: Metric, signed = false, layer: Layer = "L2"): string => metric.value === null ? fill(copy.missingWithReasons, { reasons: metric.reason_codes.join("、") }) : signed ? formatSignedDelta(metric.value, layer) : formatAmount(metric.value, layer);
const plainAmount = (value: string | null | undefined, signed = false, layer: Layer = "L2"): string => signed ? formatSignedDelta(value, layer) : formatAmount(value, layer);
const moneyColumn = (label: string): string => fill(labels.ui.export.moneyColumn, { label });
const actionStatusLabel = (status: SummaryAction["status"]): string => status === "current" ? copy.actionStatus.current : status === "stale" ? labels.actions.staleBadge : copy.actionStatus.draft;
/** 待辦列：沒有進度時省略模板尾段（「{stop}」之後的進度欄）。 */
const actionRow = (action: SummaryAction, status: string): string => {
  const template = action.executionStatus ? copy.mdActionRow : copy.mdActionRowNoProgress;
  return fill(template, {
    problem: md(action.problem), status, scope: md(action.scopeLabel), step: md(action.action), owner: md(action.owner || copy.ownerUnset), due: md(action.deadline || copy.dueUnset), stop: md(action.risk || copy.riskUnset),
    executionStatus: md(action.executionStatus ?? ""), executionNotes: md(action.executionNotes ?? ""),
  });
};
/** V3-7：Markdown 匯出的選項。generatedAt 是版頭的產出時間（預設現在；測試注入固定時間）；datasetName 預設 dataset_id。 */
export interface MarkdownExportOptions { generatedAt?: Date; datasetName?: string }
/** V3-7 §7.9：一頁摘要的版頭四行（資料集、報表名、兩期與單位、版本與產出時間）；含稅換算過時單位寫「已換算為未稅」。 */
export function summaryExportHeader(summary: ManagerSummary, options: MarkdownExportOptions = {}) {
  return buildExportHeader({
    datasetName: options.datasetName ?? summary.dataset_id, metricVersion: summary.metric_version, generatedAt: options.generatedAt ?? new Date(), amountBasis: summary.conversion_note ? "inclusive" : "exclusive",
    scope: { previous: summary.scope.previous_period, current: summary.scope.current_period, previousDays: summary.previous_days, currentDays: summary.current_days },
  });
}
export function exportManagerSummaryMarkdown(summary: ManagerSummary, context?: SummaryDecisionContext, options: MarkdownExportOptions = {}): string {
  const decisions = summaryDecisionState(summary, context);
  const alias = demoAlias(summary.dataset_id);
  const contributionShort = metricDefinitions.contribution_after_marketing.shortLabel;
  // V3-7 §7.9：「# 標題」之後緊接版頭四行，其後的資料範圍、期間、門檻與各段順序、數值都不變。
  const lines = [fill(copy.mdTitle, { brand: labels.brand.name, decision: md(decisionLabel(context?.decisionState)) }), "", ...markdownExportHeader(summaryExportHeader(summary, options)), "", fill(copy.mdMeta, { asOf: summary.data_as_of, channels: md(channelsLabel(summary.scope.channels, alias)) }),
    fill(copy.mdPeriod, { period: labels.periods.previous, range: formatPeriodExport(summary.scope.previous_period.start, summary.scope.previous_period.end) }),
    fill(copy.mdPeriod, { period: labels.periods.current, range: formatPeriodExport(summary.scope.current_period.start, summary.scope.current_period.end) }),
    // 門檻是使用者設定的精確值，取到分（L3）。
    fill(copy.mdComparison, { mode: summary.scope.comparison_mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays, threshold: formatAmount(summary.importance_threshold, "L3") }), "", copy.mdHeadlines, "", labels.ui.export.amountUnitNote, ""];
  for (const row of summary.headlines) lines.push(fill(copy.mdHeadlineRow, { metric: metricDefinitions[row.metric].label, previous: amount(row.previous), current: amount(row.current), change: amount(row.change, true) }));
  lines.push("", `| ${labels.csvColumns.channel} | ${moneyColumn(`${labels.periods.previous}${contributionShort}`)} | ${moneyColumn(`${labels.periods.current}${contributionShort}`)} | ${moneyColumn(labels.csvSuffix.change)} |`, "| --- | ---: | ---: | ---: |");
  for (const row of summary.channels) lines.push(`| ${md(channelLabel(row.channel, alias))} | ${amount(row.contribution.previous)} | ${amount(row.contribution.current)} | ${amount(row.contribution.change, true)} |`);
  lines.push("", `## ${labels.sections.assistKpis}`, "", labels.assist.intro, "", `| ${labels.csvColumns.metric} | ${labels.periods.previous} | ${labels.periods.current} |`, "| --- | ---: | ---: |");
  for (const [index, kpi] of summary.assist.current.entries()) lines.push(`| ${md(kpi.label)} | ${md(summary.assist.previous[index].display)} | ${md(kpi.display)} |`);
  // V3-9a F12：損益兩平 MER 接在其他常用指標表的最後一列（版本 breakeven-mer-v1 寫在技術細節）；既有各列不變。
  if (summary.breakeven) lines.push(`| ${md(summary.breakeven.current.label)} | ${md(summary.breakeven.previous.display)} | ${md(summary.breakeven.current.display)} |`);
  if (summary.targets.length) {
    lines.push("", `## ${labels.targets.section}`, "");
    for (const row of summary.targets) lines.push(`- ${metricDefinitions[row.metric].label}：${md(row.text)}`);
  }
  lines.push("", `## ${labels.sections.topThree}`, "");
  if (!summary.priorities.length) lines.push(labels.notes.noPriorities);
  for (const [index, item] of summary.priorities.entries()) {
    lines.push(fill(copy.mdPriorityRow, { n: index + 1, headline: md(item.title), scope: md(summaryScopeLabel(item.primary.scope, alias)), amount: amount(item.impact ?? item.ranking_amount, true) }), `   ${labels.sections.nextStep}：${md(item.recommendation)}`);
    if (item.members.length > 1) lines.push(fill(copy.mdRelatedScopes, { scopes: item.members.slice(1, 4).map(member => md(summaryScopeLabel(member.scope, alias))).join("、"), more: item.members.length > 4 ? `等（${labels.sections.technicalDetails}）` : "" }));
  }
  lines.push("", copy.mdDecisions, "");
  if (decisions.selectedScenarios.length) {
    for (const plan of decisions.selectedScenarios) {
    lines.push(fill(copy.mdSelectedScenario, { name: md(plan.name), scope: md(plan.scopeLabel), baseline: plan.baseline !== undefined ? plan.baseline === null ? labels.status.missing : plainAmount(plan.baseline) : labels.status.notApplicable, contribution: plainAmount(plan.contribution), delta: plainAmount(plan.delta, true) }), ...plan.assumptions.map(item => fill(copy.assumptionPrefix, { text: md(item) })));
    }
    lines.push(copy.scenarioCaution);
  } else lines.push(copy.noSelectedScenario);
  if (!decisions.mainActions.length) lines.push(decisions.appendixActions.length ? UNPINNED_ACTIONS_NOTICE : copy.noActions);
  for (const action of decisions.mainActions) lines.push(actionRow(action, actionStatusLabel(action.status)));
  if (context?.reviewName) lines.push("", fill(copy.mdMeeting, { name: md(context.reviewName), decision: md(decisionLabel(context.decisionState)) }), `${labels.meeting.notes}：${md(context.notes ?? "")}`);
  lines.push("", `## ${labels.basis.title}`, "", ...summary.assumptions.map(item => `- ${md(item)}`), "", "---", "", `## ${labels.sections.technicalDetails}`, "",
    `- dataset_id：${md(summary.dataset_id)}`, `- dataset_hash：${summary.dataset_hash}`, `- filter_hash：${summary.filter_hash}`, `- metric_version：${summary.metric_version}`, `- ${labels.assist.technicalVersion}：${summary.assist.version}`,
    ...(summary.breakeven ? [`- ${labels.assist.breakevenV3.technicalVersion}：${summary.breakeven.version}`] : []),
    labels.diagnosisList.techPriorityNote, copy.techFactsNote, "");
  if (decisions.appendixActions.length) lines.push(copy.otherActions, ...decisions.appendixActions.map(action => actionRow(action, actionStatusLabel(action.status))), "");
  for (const group of summary.groups) {
    lines.push(`### ${group.code}`, fill(copy.techThresholdAmount, { amount: group.importance_amount === null ? labels.status.missing : plainAmount(group.importance_amount, false, "L3") }));
    for (const member of group.members) lines.push(`- ${md(summaryScopeLabel(member.scope, alias))}：${member.ranking_amount ? amount(member.ranking_amount, false, "L3") : labels.status.missing}；${md(JSON.stringify(member.fact_ids))}`);
  }
  const ids = new Set([
    ...summary.groups.flatMap(group => group.fact_ids),
    ...summary.facts.filter(fact => fact.scope.kind !== "sku" && (fact.metric === "net_revenue" || fact.metric === "contribution_after_marketing")).map(fact => fact.id),
  ]);
  for (const fact of summary.facts.filter(fact => ids.has(fact.id))) lines.push("", `- fact_id：${md(fact.id)}`, `- ${md(metricDefinitions[fact.metric].label)}：${fact.value === null ? labels.status.missing : formatMetric(fact.metric, fact, "L3")}；${md(JSON.stringify({ metric: fact.metric, reason_codes: fact.reason_codes, period: fact.period, scope: fact.scope, sources: fact.sources }))}`);
  if (decisions.scenarios.length) lines.push("", copy.techScenarioStatus, ...decisions.scenarios.flatMap(plan => [`- ${md(plan.name)}：${scenarioStatusLabel(plan.status)}；${md(plan.scopeLabel)}；${labels.sections.scenarioBaseline} ${plainAmount(plan.baseline, false, "L3")}；${labels.scenario.resultTitle} ${plainAmount(plan.contribution, false, "L3")}；${labels.csvSuffix.change} ${plainAmount(plan.delta, true, "L3")}。`, ...plan.assumptions.map(value => `  ${fill(copy.assumptionPrefix, { text: md(value) })}`), ...(plan.binding ? [`  - 原方案來源：${md(JSON.stringify(plan.binding))}`] : [])]));
  return `${lines.join("\n")}\n`;
}

export function exportChannelComparisonCsv(summary: ManagerSummary): string {
  const text = (value: string): CsvCell => ({ kind: "text", value });
  const number = (value: string | null): CsvCell => value === null ? { kind: "null" } : { kind: "number", value };
  const headers = ["channel", "previous_net_revenue", "current_net_revenue", "net_revenue_change", "previous_contribution_after_marketing", "current_contribution_after_marketing", "contribution_after_marketing_change", "data_as_of", "previous_start", "previous_end", "current_start", "current_end", "previous_days", "current_days", "comparison_mode", "data_status", "missing_reasons", "basis_note", "metric_version", "dataset_hash", "filter_hash"];
  return encodeCsv([headers.map(header => text(csvHeader(header))), ...summary.channels.map(row => {
    const metrics = [row.revenue.previous, row.revenue.current, row.revenue.change, row.contribution.previous, row.contribution.current, row.contribution.change];
    const missing = metrics.filter(metric => metric.value === null);
    return [text(row.channel), ...metrics.map(metric => number(metric.value)), text(summary.data_as_of), text(summary.scope.previous_period.start), text(summary.scope.previous_period.end), text(summary.scope.current_period.start), text(summary.scope.current_period.end), number(String(summary.previous_days)), number(String(summary.current_days)), text(summary.scope.comparison_mode), text(missing.length ? labels.status.partial : fill(labels.status.ready, { date: summary.data_as_of })), text([...new Set(missing.flatMap(metric => metric.reason_codes))].join("；")), text(summary.conversion_note ? `${labels.basis.footer} ${summary.conversion_note}` : labels.basis.footer), text(summary.metric_version), text(summary.dataset_hash), text(summary.filter_hash)];
  })]);
}
