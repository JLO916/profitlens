import { SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, calculateScenario } from "../domain/scenarios";
import { MAX_ACTIONS, MAX_SCENARIOS, decisionSignature, validateActionContent, validateActionEvidence, validateScenarioName, type ActionCard, type DecisionSession, type ScenarioPlan } from "./decision";
import { encodeCsv, type CsvCell } from "./export";
import { actionDocuments, type ActionWorkspace } from "./action-workspace";

const LIMITATIONS = [
  "依使用者假設，重算同一期間單一通路；不是已發生的成果。",
  "不同方案的差額不可相加；本試算不是營收預測。",
  "廣告支出變動不推算銷量；銷量假設須另由使用者明確輸入。",
  "退款比為按入帳日觀察的金額比，不等於 cohort 退貨機率。",
  "行銷後貢獻不是公司淨利，不含未輸入固定費及所得稅。",
  "人工行動與問題陳述由使用者提供，所引用 facts 才是系統產生的資料事實。",
];
const ROUNDING = "所有模型中間值使用高精度 Decimal；最終金額 round(2, HALF_UP)。rounding_adjustment 補足逐項已取分金額與未取分總額最後取分的差異。";

function validateCollection(items: readonly { id: string }[], max: number, error: string): void {
  if (items.length > max) throw new Error(error);
  if (items.some(item => typeof item.id !== "string" || !item.id.trim()) || new Set(items.map(item => item.id)).size !== items.length) throw new Error("INVALID_ITEM_ID");
}

type BoundExportAction = ReturnType<typeof actionDocuments>[number];
type ExportAction = ActionCard & Pick<BoundExportAction, "priority" | "status" | "evidence"> & Partial<BoundExportAction>;

/** Build one audited document shared by every export, retaining captured historical scope. */
function decisionDocument(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace) {
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
    rounding: ROUNDING, limitations: LIMITATIONS, scenarios: plans, actions: cards,
  });
}

export function exportDecisionJson(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace): string {
  return `${JSON.stringify(decisionDocument(session, scenarios, actions, actionWorkspace), null, 2)}\n`;
}

/** Render all imported/manual strings as inert text; do not create user-controlled links. */
function md(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~:-]/g, character => `\\${character}`)
    .replace(/\r\n|\r|\n/g, "&#10;");
}
function mdFields(values: Record<string, unknown>): string[] {
  return Object.entries(values).map(([key, value]) => `- ${md(key)}：${md(value === null ? "N/A（未知或不適用）" : value)}`);
}
export function exportDecisionMarkdown(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace): string {
  const document = decisionDocument(session, scenarios, actions, actionWorkspace);
  const lines = ["# ProfitLens 決策紀錄", "", `狀態：${session.stale ? "過期（stale），不可沿用為目前方案；需重新確認基準與輸入。" : "目前快照（current）"}`, "", "## 快照與來源", "",
    ...mdFields({ schema_version: session.schema_version, scenario_version: session.scenario_version, metric_version: session.metric_version, dataset_id: session.dataset_id, dataset_hash: session.dataset_hash, filter_hash: session.filter_hash, data_as_of: session.data_as_of, currency: session.currency, timezone: session.timezone, amount_basis: session.amount_basis, revision: session.revision, snapshot_signature: session.snapshot_signature, period: session.period, scope: session.scope, comparison: session.comparison, filenames: session.filenames, sources: session.sources, stale_reasons: session.stale_reasons }),
    "", "## 固定基準", "", ...mdFields({ version: session.baseline.version, eligible: session.baseline.eligible, coverage_confirmed: session.baseline.coverage_confirmed, reasons: session.baseline.reasons }),
    "", ...mdFields(session.baseline.amounts), "", ...mdFields({ ...session.baseline.rates }),
    "", "## 固定假設", "", ...document.fixed_assumptions.map(assumption => `- ${md(assumption)}`),
    "", "## 完整公式與取分", "", ...mdFields(document.formulas), "", md(document.rounding),
    "", "## 情境方案", "",
  ];
  for (const plan of document.scenarios) {
    lines.push(`### ${md(plan.name)}`, "", ...mdFields({ id: plan.id, status: plan.status }), "", ...mdFields({ ...plan.inputs }));
    if (plan.result === null) lines.push("", "草稿：尚未計算，不提供條件貢獻或差額。", "");
    else {
      lines.push("", ...mdFields({ reasons: plan.result.reasons, contribution: plan.result.contribution, delta: plan.result.delta, rounding_adjustment: plan.result.rounding_adjustment }), "");
      if (plan.result.amounts) lines.push(...mdFields(plan.result.amounts), "", ...mdFields(plan.result.rates));
      lines.push("", ...plan.result.assumptions.map(assumption => `- ${md(assumption)}`), "", ...mdFields(plan.result.formulas), "");
    }
  }
  lines.push("## 人工行動（手動優先順序）", "");
  if (actionWorkspace !== undefined) lines.push("行動獨立保留各自建立時的期間、範圍、快照、來源與過期狀態；以下 binding 與 evidence 為每項行動的稽核依據，不沿用上方情境的目前範圍。只有 pinned=true 表示置頂優先事項，其餘仍是工作項目。", "");
  for (const action of document.actions) lines.push(`### 優先 ${action.priority}：${md(action.problem)}`, "", ...mdFields({ ...action }), "");
  lines.push("## 系統資料事實與來源", "");
  for (const fact of session.facts) lines.push(...mdFields({ fact_id: fact.id, metric: fact.metric, value: fact.value, reason_codes: fact.reason_codes, period: fact.period, scope: fact.scope, sources: fact.sources }), "");
  lines.push("## 使用限制", "", ...document.limitations.map(limitation => `- ${md(limitation)}`), "");
  return lines.join("\n");
}

const HEADERS = ["schema_version", "scenario_version", "metric_version", "dataset_id", "dataset_hash", "filter_hash", "as_of", "currency", "timezone", "amount_basis", "revision", "snapshot_status", "period", "scope", "comparison_mode", "previous_days", "current_days", "row_type", "item_id", "item_name", "status", "field", "value", "reason_codes", "fact_ids", "source_refs", "analysis_scope", "context_id", "plan_revision", "analysis_epoch"] as const;
const text = (value: unknown): CsvCell => ({ kind: "text", value: typeof value === "string" ? value : JSON.stringify(value) });
const numeric = (value: string): CsvCell => ({ kind: "number", value });
const empty: CsvCell = { kind: "null" };
type CsvRecord = Partial<Record<typeof HEADERS[number], CsvCell>>;

export function exportDecisionCsv(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, contextMetadata?: { context_id: string; epoch: string; plan_revisions: Record<string, number> }): string {
  const document = decisionDocument(session, scenarios, actions, actionWorkspace);
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
  return encodeCsv([HEADERS.map(text), ...records.map(record => HEADERS.map(header => record[header] ?? metadata[header] ?? empty))]);
}
