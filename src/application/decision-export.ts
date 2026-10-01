import { SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, calculateScenario } from "../domain/scenarios";
import { MAX_ACTIONS, MAX_SCENARIOS, decisionSignature, validateActionContent, validateActionEvidence, validateScenarioName, type ActionCard, type DecisionSession, type ScenarioPlan } from "./decision";
import { encodeCsv, type CsvCell } from "./export";

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

/** Build one audited document shared by every export, retaining captured historical scope. */
function decisionDocument(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[]) {
  validateCollection(scenarios, MAX_SCENARIOS, "MAX_SCENARIOS");
  validateCollection(actions, MAX_ACTIONS, "MAX_ACTIONS");
  const plans = scenarios.map(plan => {
    validateScenarioName(plan.name, plan.result !== null);
    if (plan.result !== null) {
      if (decisionSignature(plan.inputs) !== decisionSignature(plan.result.inputs) || decisionSignature(plan.result) !== decisionSignature(calculateScenario(session.baseline, plan.inputs))) throw new Error("INVALID_SCENARIO_RESULT");
    }
    return { id: plan.id, name: plan.name, status: plan.result?.status ?? "draft", inputs: plan.inputs, result: plan.result };
  });
  const cards = actions.map((action, index) => {
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
  });
  return structuredClone({
    status: session.stale ? "stale" : "current",
    session, fixed_assumptions: SCENARIO_ASSUMPTIONS, formulas: SCENARIO_FORMULAS,
    rounding: ROUNDING, limitations: LIMITATIONS, scenarios: plans, actions: cards,
  });
}

export function exportDecisionJson(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[]): string {
  return `${JSON.stringify(decisionDocument(session, scenarios, actions), null, 2)}\n`;
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
export function exportDecisionMarkdown(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[]): string {
  const document = decisionDocument(session, scenarios, actions);
  const lines = ["# ProfitLens 決策紀錄", "", `狀態：${session.stale ? "過期（stale），不可沿用為目前方案；需重新確認基準與輸入。" : "目前快照（current）"}`, "", "## 快照與來源", "",
    ...mdFields({ schema_version: session.schema_version, scenario_version: session.scenario_version, metric_version: session.metric_version, dataset_id: session.dataset_id, dataset_hash: session.dataset_hash, filter_hash: session.filter_hash, data_as_of: session.data_as_of, currency: session.currency, timezone: session.timezone, amount_basis: session.amount_basis, revision: session.revision, snapshot_signature: session.snapshot_signature, period: session.period, scope: session.scope, filenames: session.filenames, sources: session.sources, stale_reasons: session.stale_reasons }),
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
  for (const action of document.actions) lines.push(`### 優先 ${action.priority}：${md(action.problem)}`, "", ...mdFields(action), "");
  lines.push("## 系統資料事實與來源", "");
  for (const fact of session.facts) lines.push(...mdFields({ fact_id: fact.id, metric: fact.metric, value: fact.value, reason_codes: fact.reason_codes, period: fact.period, scope: fact.scope, sources: fact.sources }), "");
  lines.push("## 使用限制", "", ...document.limitations.map(limitation => `- ${md(limitation)}`), "");
  return lines.join("\n");
}

const HEADERS = ["schema_version", "scenario_version", "metric_version", "dataset_id", "dataset_hash", "filter_hash", "as_of", "currency", "timezone", "amount_basis", "revision", "snapshot_status", "period", "scope", "row_type", "item_id", "item_name", "status", "field", "value", "reason_codes", "fact_ids", "source_refs"] as const;
const text = (value: unknown): CsvCell => ({ kind: "text", value: typeof value === "string" ? value : JSON.stringify(value) });
const numeric = (value: string): CsvCell => ({ kind: "number", value });
const empty: CsvCell = { kind: "null" };
type CsvRecord = Partial<Record<typeof HEADERS[number], CsvCell>>;

export function exportDecisionCsv(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[]): string {
  const document = decisionDocument(session, scenarios, actions);
  const sourceRefs = (sources: DecisionSession["sources"]) => text(sources.map(source => ({ ...source, actual_filename: session.filenames[source.file] ?? source.file })));
  const metadata: CsvRecord = {
    schema_version: text(session.schema_version), scenario_version: text(session.scenario_version), metric_version: text(session.metric_version),
    dataset_id: text(session.dataset_id), dataset_hash: text(session.dataset_hash), filter_hash: text(session.filter_hash), as_of: text(session.data_as_of),
    currency: text(session.currency), timezone: text(session.timezone), amount_basis: text(session.amount_basis),
    revision: numeric(String(session.revision)), snapshot_status: text(document.status), period: text(session.period), scope: text(session.scope), source_refs: sourceRefs(session.sources),
  };
  const records: CsvRecord[] = [];
  const push = (rowType: string, field: string, value: CsvCell, extra: CsvRecord = {}) => records.push({ row_type: text(rowType), field: text(field), value, ...extra });
  for (const [key, value] of Object.entries({ snapshot_signature: session.snapshot_signature, filenames: session.filenames, sources: session.sources, stale: session.stale, stale_reasons: session.stale_reasons })) push("snapshot", key, text(value));
  for (const [key, value] of Object.entries({ eligible: session.baseline.eligible, coverage_confirmed: session.baseline.coverage_confirmed, reasons: session.baseline.reasons })) push("baseline", key, text(value));
  const baselineReasons = session.baseline.reasons.map(reason => reason.code);
  for (const [key, value] of Object.entries(session.baseline.amounts)) push("baseline_amount", key, value === null ? empty : numeric(value), { reason_codes: text(value === null ? baselineReasons.length ? baselineReasons : ["MISSING_VALUE"] : []) });
  for (const [key, value] of Object.entries(session.baseline.rates)) push("baseline_rate", key, value === null ? empty : numeric(value), { reason_codes: text(value === null ? baselineReasons.length ? baselineReasons : ["UNDEFINED_RATE"] : []) });
  document.fixed_assumptions.forEach((value, index) => push("fixed_assumption", String(index + 1), text(value)));
  for (const [key, value] of Object.entries(document.formulas)) push("formula", key, text(value));
  push("rounding", "rounding_policy", text(document.rounding));
  document.limitations.forEach((value, index) => push("limitation", String(index + 1), text(value)));
  for (const plan of document.scenarios) {
    const planMeta: CsvRecord = { item_id: text(plan.id), item_name: text(plan.name), status: text(plan.status) };
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
    const actionMeta: CsvRecord = { item_id: text(action.id), item_name: text(action.problem), status: text(action.status), fact_ids: text(action.fact_ids), source_refs: sourceRefs(action.evidence.flatMap(fact => fact.sources)) };
    for (const [key, value] of Object.entries(action)) {
      if (key === "evidence") continue;
      push("manual_action", key, key === "priority" ? numeric(String(value)) : text(value), actionMeta);
    }
  }
  for (const fact of session.facts) push("fact", fact.metric, fact.value === null ? empty : numeric(fact.value), {
    item_id: text(fact.id), fact_ids: text([fact.id]), period: text(fact.period), scope: text(fact.scope), reason_codes: text(fact.value === null && !fact.reason_codes.length ? ["MISSING_VALUE"] : fact.reason_codes), source_refs: sourceRefs(fact.sources),
  });
  return encodeCsv([HEADERS.map(text), ...records.map(record => HEADERS.map(header => record[header] ?? metadata[header] ?? empty))]);
}
