import { channelsLabel, csvHeader, demoAlias, scopeLabel } from "./copy";
import { SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, calculateScenario } from "../domain/scenarios";
import type { MetricName, Period } from "../domain/types";
import { fill, labels } from "../i18n";
import { MAX_ACTIONS, MAX_SCENARIOS, decisionSignature, validateActionContent, validateActionEvidence, validateScenarioName, type ActionCard, type DecisionSession, type ScenarioPlan } from "./decision";
import { encodeCsv, type CsvCell } from "./export";
import { actionDocuments, type ActionWorkspace } from "./action-workspace";

const copy = labels.ui.decisionExport;
/** 主層只留一句「注意」；其餘限制併入技術細節（Markdown），JSON／CSV 仍完整輸出。 */
const CAUTION = labels.basis.items[6];
const TECHNICAL_LIMITATIONS = [copy.limitations.scenarioScope, copy.limitations.adSpendNoVolume, copy.limitations.manualActions, labels.basis.items[5], labels.basis.items[2]];
const LIMITATIONS = [CAUTION, ...TECHNICAL_LIMITATIONS];
const ROUNDING = copy.roundingNote;

function validateCollection(items: readonly { id: string }[], max: number, error: string): void {
  if (items.length > max) throw new Error(error);
  if (items.some(item => typeof item.id !== "string" || !item.id.trim()) || new Set(items.map(item => item.id)).size !== items.length) throw new Error("INVALID_ITEM_ID");
}

type BoundExportAction = ReturnType<typeof actionDocuments>[number];
type ExportAction = ActionCard & Pick<BoundExportAction, "priority" | "status" | "evidence"> & Partial<BoundExportAction>;

/** Build one audited document shared by every export, retaining captured historical scope. */
/** extraLimitations：R3 含稅換算一句等與這份資料有關的口徑限制，接在固定限制之後。 */
function decisionDocument(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, extraLimitations: readonly string[] = []) {
  validateCollection(scenarios, MAX_SCENARIOS, "MAX_SCENARIOS");
  if (actionWorkspace === undefined) validateCollection(actions, MAX_ACTIONS, "MAX_ACTIONS");
  const plans = scenarios.map(plan => {
    validateScenarioName(plan.name, plan.result !== null);
    if (plan.result !== null) {
      if (decisionSignature(plan.inputs) !== decisionSignature(plan.result.inputs) || decisionSignature(plan.result) !== decisionSignature(calculateScenario(session.baseline, plan.inputs))) throw new Error("INVALID_SCENARIO_RESULT");
    }
    return { id: plan.id, name: plan.name, status: plan.result?.status ?? "draft", inputs: plan.inputs, result: plan.result };
  });
  const cards: ExportAction[] = actionWorkspace === undefined ? actions.map((action, index) => {
    if (typeof action.evidence_confirmed !== "boolean") throw new Error("INVALID_ACTION_CONFIRMATION");
    validateActionContent(action, action.evidence_confirmed);
    validateActionEvidence(session, action, action.evidence_confirmed);
    return {
      id: action.id, priority: index + 1, origin: "manual" as const,
      status: action.evidence_confirmed ? "confirmed" : "draft",
      evidence_confirmed: action.evidence_confirmed,
      problem: action.problem, fact_ids: action.fact_ids, action: action.action, owner_role: action.owner_role,
      validation_metric: action.validation_metric, deadline: action.deadline, stop_condition: action.stop_condition,
      required_data: action.required_data,
      evidence: action.fact_ids.map(id => session.facts.find(fact => fact.id === id)!),
    };
  }) : actionDocuments(actionWorkspace);
  return structuredClone({
    status: session.stale ? "stale" : "current",
    session, fixed_assumptions: SCENARIO_ASSUMPTIONS, formulas: SCENARIO_FORMULAS,
    rounding: ROUNDING, limitations: [...LIMITATIONS, ...extraLimitations], scenarios: plans, actions: cards,
  });
}

export function exportDecisionJson(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, extraLimitations: readonly string[] = []): string {
  return `${JSON.stringify(decisionDocument(session, scenarios, actions, actionWorkspace, extraLimitations), null, 2)}\n`;
}

/** Render all imported/manual strings as inert text; do not create user-controlled links. */
function md(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~:-]/g, character => `\\${character}`)
    .replace(/\r\n|\r|\n/g, "&#10;");
}
/** Markdown 主層欄位名稱：指標 → CSV 欄位 → 試算欄位 → 待辦欄位 → 其他；都沒有就留英文 key（只會出現在技術細節）。 */
const SCENARIO_FIELD_LABELS: Record<string, string> = {
  volume_change_pct: labels.scenario.volume.label, discount_change_pp: labels.scenario.discount.label, fulfillment_change_pct: labels.scenario.fulfillmentUnit.label,
  ad_change_pct: labels.scenario.adSpend.label, one_time_cost: labels.scenario.oneOff.label, assumptions_accepted: labels.scenario.acceptAssumptions,
  contribution: labels.scenario.resultTitle, delta: labels.scenario.vsBaseline,
};
const ACTION_FIELD_LABELS: Record<string, string> = {
  problem: labels.actions.problem, action: labels.actions.step, owner_role: labels.actions.owner, validation_metric: labels.actions.metric,
  deadline: labels.actions.due, stop_condition: labels.actions.stop, required_data: labels.actions.extraData, status: labels.actions.status,
};
const OTHER_FIELD_LABELS: Record<string, string> = {
  id: labels.csvColumns.item_id, fact_id: labels.csvColumns.fact_ids, reasons: labels.csvColumns.reason_codes, sources: labels.csvColumns.source_refs,
  coverage_confirmed: labels.csvColumns.sales_coverage_confirmed, filenames: labels.csvColumns.file,
};
const metricLabel = (name: string): string | null => name in labels.metrics ? labels.metrics[name as MetricName].label : null;
function fieldLabel(key: string): string {
  return metricLabel(key) ?? labels.csvColumns[key] ?? SCENARIO_FIELD_LABELS[key] ?? ACTION_FIELD_LABELS[key] ?? OTHER_FIELD_LABELS[key] ?? key;
}
const ACTION_STATUS: Record<string, string> = { ...copy.actionStatus, ...copy.scenarioStatus };
function mdFields(values: Record<string, unknown>, labelled = true): string[] {
  return Object.entries(values).map(([key, value]) => fill(copy.fieldLine, { label: md(labelled ? fieldLabel(key) : key), value: md(value === null ? copy.nullValue : labelled && key === "status" && typeof value === "string" && ACTION_STATUS[value] ? ACTION_STATUS[value] : value) }));
}
/** 技術細節區塊：Markdown 內的 `<details>`，保留原始 key、代碼與公式。 */
function mdTechnical(lines: readonly string[], summary: string = labels.sections.technicalDetails): string[] {
  return ["<details>", `<summary>${summary}</summary>`, "", ...lines, "", "</details>"];
}
export function exportDecisionMarkdown(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, extraLimitations: readonly string[] = []): string {
  const document = decisionDocument(session, scenarios, actions, actionWorkspace, extraLimitations);
  const alias = demoAlias(session.dataset_id);
  const periodText = (period: Period) => `${period.start}～${period.end}`;
  const comparisonMode = session.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
  const lines = [`# ${copy.title}`, "", fill(copy.statusLine, { status: session.stale ? copy.statusStale : copy.statusCurrent }), "", `## ${copy.sectionSource}`, "",
    ...mdFields({ dataset_id: session.dataset_id, data_as_of: session.data_as_of, currency: session.currency, timezone: session.timezone, period: periodText(session.period), scope: channelsLabel(session.scope.channels, alias), comparison_mode: comparisonMode, previous_days: session.comparison.previous_days, current_days: session.comparison.current_days, filenames: session.filenames }),
    "", ...mdTechnical(mdFields({ schema_version: session.schema_version, scenario_version: session.scenario_version, metric_version: session.metric_version, dataset_hash: session.dataset_hash, filter_hash: session.filter_hash, amount_basis: session.amount_basis, revision: session.revision, snapshot_signature: session.snapshot_signature, comparison: session.comparison, sources: session.sources, stale_reasons: session.stale_reasons }, false)),
    "", `## ${labels.sections.scenarioBaseline}`, "", ...mdFields(session.baseline.amounts), "", ...mdFields({ ...session.baseline.rates }),
    "", ...mdTechnical(mdFields({ version: session.baseline.version, eligible: session.baseline.eligible, coverage_confirmed: session.baseline.coverage_confirmed, reasons: session.baseline.reasons }, false)),
    "", `## ${labels.sections.scenarioAssumptions}`, "", ...document.fixed_assumptions.map(assumption => `- ${md(assumption)}`),
    "", `## ${labels.nav.scenarios.label}`, "",
  ];
  for (const plan of document.scenarios) {
    lines.push(`### ${md(plan.name)}`, "", ...mdFields({ id: plan.id, status: plan.status }), "", ...mdFields({ ...plan.inputs }));
    if (plan.result === null) lines.push("", labels.scenario.draft, "");
    else {
      lines.push("", ...mdFields({ contribution: plan.result.contribution, delta: plan.result.delta }), "");
      if (plan.result.amounts) lines.push(...mdFields(plan.result.amounts), "", ...mdFields(plan.result.rates), "");
      lines.push(...mdTechnical([...mdFields({ reasons: plan.result.reasons, rounding_adjustment: plan.result.rounding_adjustment }, false), "", ...plan.result.assumptions.map(assumption => `- ${md(assumption)}`), "", ...mdFields(plan.result.formulas, false)]), "");
    }
  }
  lines.push(`## ${labels.sections.actionList}`, "");
  if (actionWorkspace !== undefined) lines.push(copy.actionsNote, "");
  for (const action of document.actions) {
    const main = Object.fromEntries(Object.entries(action).filter(([key]) => key in ACTION_FIELD_LABELS));
    const technical = Object.fromEntries(Object.entries(action).filter(([key]) => !(key in ACTION_FIELD_LABELS)));
    lines.push(`### ${fill(copy.actionHeading, { priority: action.priority, problem: md(action.problem) })}`, "", ...mdFields(main), "", ...mdTechnical(mdFields(technical, false)), "");
  }
  lines.push(`## ${copy.sectionFacts}`, "");
  for (const fact of session.facts) lines.push(...mdFields({ fact_id: fact.id, metric: metricLabel(fact.metric) ?? fact.metric, value: fact.value, reason_codes: fact.reason_codes, period: periodText(fact.period), scope: scopeLabel(fact.scope, alias), sources: fact.sources }), "");
  lines.push(`## ${labels.sections.caution}`, "", `${labels.sections.caution}：${md(CAUTION)}`, "");
  lines.push(...mdTechnical([...mdFields(document.formulas, false), "", md(document.rounding), "", ...document.limitations.slice(1).map(limitation => `- ${md(limitation)}`)], copy.sectionFormulas), "");
  return lines.join("\n");
}

const HEADERS = ["schema_version", "scenario_version", "metric_version", "dataset_id", "dataset_hash", "filter_hash", "as_of", "currency", "timezone", "amount_basis", "revision", "snapshot_status", "period", "scope", "comparison_mode", "previous_days", "current_days", "row_type", "item_id", "item_name", "status", "field", "value", "reason_codes", "fact_ids", "source_refs", "analysis_scope", "context_id", "plan_revision", "analysis_epoch"] as const;
const text = (value: unknown): CsvCell => ({ kind: "text", value: typeof value === "string" ? value : JSON.stringify(value) });
const numeric = (value: string): CsvCell => ({ kind: "number", value });
const empty: CsvCell = { kind: "null" };
type CsvRecord = Partial<Record<typeof HEADERS[number], CsvCell>>;

export function exportDecisionCsv(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, contextMetadata?: { context_id: string; epoch: string; plan_revisions: Record<string, number> }, extraLimitations: readonly string[] = []): string {
  const document = decisionDocument(session, scenarios, actions, actionWorkspace, extraLimitations);
  const sourceRefs = (sources: DecisionSession["sources"], filenames = session.filenames) => text(sources.map(source => ({ ...source, actual_filename: filenames[source.file] ?? source.file })));
  const sessionMetadata = (captured: DecisionSession): CsvRecord => ({
    schema_version: text(captured.schema_version), scenario_version: text(captured.scenario_version), metric_version: text(captured.metric_version),
    dataset_id: text(captured.dataset_id), dataset_hash: text(captured.dataset_hash), filter_hash: text(captured.filter_hash), as_of: text(captured.data_as_of),
    currency: text(captured.currency), timezone: text(captured.timezone), amount_basis: text(captured.amount_basis),
    comparison_mode: text(captured.comparison.mode), previous_days: numeric(String(captured.comparison.previous_days)), current_days: numeric(String(captured.comparison.current_days)),
    revision: numeric(String(captured.revision)), snapshot_status: text(captured.stale ? "stale" : "current"), period: text(captured.period), scope: text(captured.scope), source_refs: sourceRefs(captured.sources, captured.filenames),
  });
  const metadata: CsvRecord = { ...sessionMetadata(session), ...(contextMetadata ? { context_id: text(contextMetadata.context_id), analysis_epoch: text(contextMetadata.epoch) } : {}) };
  const records: CsvRecord[] = [];
  const push = (rowType: string, field: string, value: CsvCell, extra: CsvRecord = {}) => records.push({ row_type: text(rowType), field: text(field), value, ...extra });
  for (const [key, value] of Object.entries({ snapshot_signature: session.snapshot_signature, comparison: session.comparison, filenames: session.filenames, sources: session.sources, stale: session.stale, stale_reasons: session.stale_reasons })) push("snapshot", key, text(value));
  for (const [key, value] of Object.entries({ eligible: session.baseline.eligible, coverage_confirmed: session.baseline.coverage_confirmed, reasons: session.baseline.reasons })) push("baseline", key, text(value));
  const baselineReasons = session.baseline.reasons.map(reason => reason.code);
  for (const [key, value] of Object.entries(session.baseline.amounts)) push("baseline_amount", key, value === null ? empty : numeric(value), { reason_codes: text(value === null ? baselineReasons.length ? baselineReasons : ["MISSING_VALUE"] : []) });
  for (const [key, value] of Object.entries(session.baseline.rates)) push("baseline_rate", key, value === null ? empty : numeric(value), { reason_codes: text(value === null ? baselineReasons.length ? baselineReasons : ["UNDEFINED_RATE"] : []) });
  document.fixed_assumptions.forEach((value, index) => push("fixed_assumption", String(index + 1), text(value)));
  for (const [key, value] of Object.entries(document.formulas)) push("formula", key, text(value));
  push("rounding", "rounding_policy", text(document.rounding));
  document.limitations.forEach((value, index) => push("limitation", String(index + 1), text(value)));
  for (const plan of document.scenarios) {
    const planMeta: CsvRecord = { item_id: text(plan.id), item_name: text(plan.name), status: text(plan.status), ...(contextMetadata ? { plan_revision: numeric(String(contextMetadata.plan_revisions[plan.id])) } : {}) };
    // Inputs are user text, even when they happen to look numeric.
    for (const [key, value] of Object.entries(plan.inputs)) push("scenario_input", key, text(String(value)), planMeta);
    const result = plan.result;
    const reasons = result === null ? ["UNCOMPUTED_DRAFT"] : result.reasons.map(reason => reason.code);
    for (const key of ["contribution", "delta", "rounding_adjustment"] as const) push("scenario_result", key, result?.[key] == null ? empty : numeric(result[key]), { ...planMeta, reason_codes: text(reasons) });
    if (result) {
      push("scenario_result", "reasons", text(result.reasons), planMeta);
      if (result.amounts) for (const [key, value] of Object.entries(result.amounts)) push("scenario_amount", key, numeric(value), planMeta);
      if (result.rates) for (const [key, value] of Object.entries(result.rates)) push("scenario_rate", key, numeric(value), planMeta);
      result.assumptions.forEach((value, index) => push("scenario_assumption", String(index + 1), text(value), planMeta));
      for (const [key, value] of Object.entries(result.formulas)) push("scenario_formula", key, text(value), planMeta);
    }
  }
  for (const action of document.actions) {
    const binding = action.binding;
    // Financial and lineage fields come from this action's captured context,
    // never from the scenario session that happens to be open at export time.
    const captured = binding ? actionWorkspace!.contexts.find(context => context.id === binding.context_id)!.session : session;
    const filenames = binding?.filenames ?? session.filenames;
    const actionMeta: CsvRecord = {
      ...sessionMetadata(captured), item_id: text(action.id), item_name: text(action.problem), status: text(action.status), fact_ids: text(action.fact_ids),
      ...(binding ? { scope: text(binding.scope), analysis_scope: text(binding.analysis_scope), context_id: text(binding.context_id) } : {}),
      source_refs: sourceRefs(action.evidence.flatMap(fact => fact.sources), filenames),
    };
    for (const [key, value] of Object.entries(action)) {
      if (key === "evidence") continue;
      push("manual_action", key, key === "priority" ? numeric(String(value)) : text(value), actionMeta);
    }
    if (binding) for (const fact of action.evidence) push("action_fact", fact.metric, fact.value === null ? empty : numeric(fact.value), {
      ...actionMeta, fact_ids: text([fact.id]), period: text(fact.period), scope: text(fact.scope),
      reason_codes: text(fact.value === null && !fact.reason_codes.length ? ["MISSING_VALUE"] : fact.reason_codes), source_refs: sourceRefs(fact.sources, filenames),
    });
  }
  for (const fact of session.facts) push("fact", fact.metric, fact.value === null ? empty : numeric(fact.value), {
    item_id: text(fact.id), fact_ids: text([fact.id]), period: text(fact.period), scope: text(fact.scope), reason_codes: text(fact.value === null && !fact.reason_codes.length ? ["MISSING_VALUE"] : fact.reason_codes), source_refs: sourceRefs(fact.sources),
  });
  return encodeCsv([HEADERS.map(header => text(csvHeader(header))), ...records.map(record => HEADERS.map(header => record[header] ?? metadata[header] ?? empty))]);
}
