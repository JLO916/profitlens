import { channelsLabel, csvHeader, demoAlias, scopeLabel } from "./copy";
import { SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, calculateScenario, type ScenarioReason } from "../domain/scenarios";
import { analyzeScenarioSensitivity, type ScenarioSensitivityAnalysis } from "../domain/scenario-sensitivity";
import type { MetricName, Period } from "../domain/types";
import { fill, labels } from "../i18n";
import { MAX_ACTIONS, MAX_SCENARIOS, decisionSignature, hasSensitivityInputs, validateActionContent, validateActionEvidence, validateScenarioName, validateSensitivityInputs, type ActionCard, type DecisionSession, type ScenarioPlan, type SensitivityInputs } from "./decision";
import { encodeCsv, type CsvCell } from "./export";
import { actionDocuments, type ActionWorkspace } from "./action-workspace";
import { buildExportHeader, markdownExportHeader } from "./export-header";
import { formatAmount, formatMetric, formatPeriodExport, formatRateL2, formatSignedDelta, type Layer } from "./presentation";

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

/** R5-4 敏感度匯出：三組原字串＋以本方案與原基準重算的門檻與三列結果；草稿方案（result 為 null）不分析。 */
export interface SensitivityExport {
  volumes: SensitivityInputs["volumes"];
  analysis: null | {
    version: ScenarioSensitivityAnalysis["version"];
    status: ScenarioSensitivityAnalysis["status"];
    sensitivity_status: ScenarioSensitivityAnalysis["sensitivity"]["status"];
    reasons: ScenarioReason[];
    targets: { id: string; target: string; status: string; threshold_pct: string | null; meets_target_when: string }[];
    rows: { volume_change_pct: string; contribution: string; delta: string }[];
  };
}
/** 沒填（undefined 或三格皆空白）→ null；stale 快照交給 domain 標示 stale，不產生新門檻。 */
function sensitivityDocument(session: DecisionSession, plan: ScenarioPlan): SensitivityExport | null {
  if (plan.sensitivity !== undefined) validateSensitivityInputs(plan.sensitivity);
  if (!hasSensitivityInputs(plan.sensitivity)) return null;
  const volumes: SensitivityInputs["volumes"] = [...plan.sensitivity.volumes];
  if (plan.result === null) return { volumes, analysis: null };
  const analysis = analyzeScenarioSensitivity(session.baseline, plan.inputs, volumes, { stale: session.stale });
  return {
    volumes,
    analysis: {
      version: analysis.version, status: analysis.status, sensitivity_status: analysis.sensitivity.status,
      reasons: [...analysis.reasons, ...analysis.sensitivity.reasons],
      targets: analysis.targets.map(target => ({ id: target.id, target: target.target, status: target.status, threshold_pct: target.threshold_pct, meets_target_when: target.meets_target_when })),
      rows: analysis.sensitivity.rows.map(row => ({ volume_change_pct: row.volume_change_pct, contribution: row.result.contribution, delta: row.result.delta })),
    },
  };
}
/** 單一狀態字：draft（方案未計算）→ 方案層狀態（stale／ineligible／invalid）→ 三組輸入狀態（valid／invalid／unfilled）。 */
function sensitivityStatus(sensitivity: SensitivityExport): string {
  if (sensitivity.analysis === null) return "draft";
  return sensitivity.analysis.status !== "valid" ? sensitivity.analysis.status : sensitivity.analysis.sensitivity_status;
}
const SENSITIVITY_FIELDS = ["volume_a", "volume_b", "volume_c"] as const;

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
    return { id: plan.id, name: plan.name, status: plan.result?.status ?? "draft", inputs: plan.inputs, result: plan.result, sensitivity: sensitivityDocument(session, plan) };
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
const sensitivityCopy = labels.ui.scenarioSensitivity;
/**
 * V3-2b §3.3：Markdown 主文用 L2（整數元、比率一位小數），技術細節用 L3（到分）；負號 U+2212、正的差額加「+」。
 * JSON／CSV 不經過這裡，維持 domain 的精確字串（ASCII 負號、到分）。
 */
const amountText = (value: string | null | undefined, layer: Layer = "L2", signed = false): string => value === null || value === undefined ? copy.nullValue : signed ? formatSignedDelta(value, layer) : formatAmount(value, layer);
const amountFields = (values: Readonly<Record<string, string | null>>, layer: Layer = "L2"): Record<string, string> => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, amountText(value, layer)]));
const rateFields = (values: Readonly<Record<string, string | null>>): Record<string, string> => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? copy.nullValue : formatRateL2(value)]));
const moneyColumn = (label: string): string => fill(labels.ui.export.moneyColumn, { label });
/**
 * V3-2a §7.7.3：domain 的試算原因碼（src/domain/scenarios.ts 的 eligibility／calculateScenario，與 scenario-sensitivity.ts）。
 * 每一個都要在 labels.ui.scenarioSensitivity.reasons 有白話文案（別名見 SCENARIO_REASON_ALIASES）；tests/reason-code-labels.test.ts 檢查。
 */
export const SCENARIO_REASON_CODES = [
  "BASELINE_COVERAGE_UNCONFIRMED", "BASELINE_MISSING_AMOUNT", "BASELINE_NEGATIVE_COST", "BASELINE_NON_POSITIVE_GROSS", "BASELINE_NON_POSITIVE_NET", "BASELINE_DISCOUNT_RATE_OUT_OF_RANGE", "BASELINE_REFUND_RATIO_OUT_OF_RANGE",
  "ASSUMPTIONS_NOT_ACCEPTED", "INPUT_REQUIRED", "INVALID_NUMBER", "INPUT_OUT_OF_RANGE", "SCENARIO_DISCOUNT_RATE_OUT_OF_RANGE",
  "STALE_SCENARIO", "THREE_VOLUME_VALUES_REQUIRED", "SENSITIVITY_VOLUME_REQUIRED",
] as const;
/** 共用同一句文案的原因碼。 */
export const SCENARIO_REASON_ALIASES: Readonly<Record<string, string>> = { THREE_VOLUME_VALUES_REQUIRED: "SENSITIVITY_VOLUME_REQUIRED" };
/** 原因碼的白話文案；labels 沒有時回傳 null。 */
export function scenarioReasonLabel(code: string): string | null {
  const reasons = sensitivityCopy.reasons as Readonly<Record<string, string | undefined>>;
  const key = SCENARIO_REASON_ALIASES[code] ?? code;
  return Object.hasOwn(reasons, key) ? reasons[key] ?? null : null;
}
/** scenario-sensitivity.ts 逐列原因的前綴（「假設 n：」）；只取 n，改用畫面上的 A／B／C 編號。 */
const SENSITIVITY_ROW_PREFIX = /^\S+ (\d+)：/u;
/**
 * 試算頁與匯出共用的白話原因；不退回 domain 的中文 message。labels 沒有對應時顯示帶標籤的原因碼（「問題代碼 XXX」），
 * reason-code-labels 測試保證每個原因碼都有文案。
 */
export function scenarioReasonText(reason: { code: string; message: string }): string {
  const text = scenarioReasonLabel(reason.code) ?? `${labels.ui.issueList.reasonCodeSummary} ${reason.code}`;
  const row = SENSITIVITY_ROW_PREFIX.exec(reason.message);
  return row ? `${fill(sensitivityCopy.rowLabel, { letter: String.fromCharCode(64 + Number(row[1])) })}：${text}` : text;
}
/** 每個方案下的小表：假設／銷量變化 %／試算後貢獻／與現況相比；未算出的格子寫「資料待補／不適用」並附原因一句。 */
function mdSensitivity(sensitivity: SensitivityExport): string[] {
  const row = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  const lines = [`#### ${md(labels.sections.scenarioBreakeven)}`, "",
    row([sensitivityCopy.colAssumption, `${labels.scenario.volume.label}（%）`, moneyColumn(labels.scenario.resultTitle), moneyColumn(labels.scenario.vsBaseline)].map(md)), row(["---", "---:", "---:", "---:"])];
  sensitivity.volumes.forEach((volume, index) => {
    const result = sensitivity.analysis?.rows[index];
    lines.push(row([md(fill(sensitivityCopy.rowLabel, { letter: String.fromCharCode(65 + index) })), md(volume.trim() === "" ? copy.nullValue : volume), md(amountText(result?.contribution)), md(amountText(result?.delta, "L2", true))]));
  });
  if (sensitivity.analysis === null) lines.push("", md(labels.scenario.draft));
  else if (sensitivityStatus(sensitivity) !== "valid") lines.push("", md([...new Set(sensitivity.analysis.reasons.map(scenarioReasonText))].join(" ")));
  return lines;
}
/**
 * V3-7 options：generatedAt 是版頭的產出時間（預設現在）；datasetName 預設 dataset_id；amountBasis 沒給時，
 * 有 extraLimitations（目前只會是含稅換算一句，見 workspace-decision-export.ts 的 extraFor）就當作「已換算為未稅」。
 */
export interface DecisionMarkdownOptions { generatedAt?: Date; datasetName?: string; amountBasis?: "exclusive" | "inclusive" }
export function exportDecisionMarkdown(session: DecisionSession, scenarios: readonly ScenarioPlan[], actions: readonly ActionCard[], actionWorkspace?: ActionWorkspace, extraLimitations: readonly string[] = [], options: DecisionMarkdownOptions = {}): string {
  const document = decisionDocument(session, scenarios, actions, actionWorkspace, extraLimitations);
  const alias = demoAlias(session.dataset_id);
  const periodText = (period: Period) => `${period.start}～${period.end}`;
  const comparisonMode = session.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
  // V3-7 §7.9：「# 標題」之後緊接版頭四行（兩期取這份試算建立時的範圍），其後各段順序與數值不變。
  const header = buildExportHeader({
    datasetName: options.datasetName ?? session.dataset_id, metricVersion: session.metric_version, generatedAt: options.generatedAt ?? new Date(),
    amountBasis: options.amountBasis ?? (extraLimitations.length ? "inclusive" : "exclusive"),
    scope: { previous: session.scope.previous_period, current: session.scope.current_period, previousDays: session.comparison.previous_days, currentDays: session.comparison.current_days },
  });
  const lines = [`# ${copy.title}`, "", ...markdownExportHeader(header), "", fill(copy.statusLine, { status: session.stale ? copy.statusStale : copy.statusCurrent }), "", `## ${copy.sectionSource}`, "",
    ...mdFields({ dataset_id: session.dataset_id, data_as_of: session.data_as_of, currency: session.currency, timezone: session.timezone, period: formatPeriodExport(session.period.start, session.period.end), scope: channelsLabel(session.scope.channels, alias), comparison_mode: comparisonMode, previous_days: session.comparison.previous_days, current_days: session.comparison.current_days, filenames: session.filenames }),
    "", ...mdTechnical(mdFields({ schema_version: session.schema_version, scenario_version: session.scenario_version, metric_version: session.metric_version, dataset_hash: session.dataset_hash, filter_hash: session.filter_hash, amount_basis: session.amount_basis, revision: session.revision, snapshot_signature: session.snapshot_signature, comparison: session.comparison, sources: session.sources, stale_reasons: session.stale_reasons }, false)),
    "", `## ${labels.sections.scenarioBaseline}`, "", labels.ui.export.amountUnitNote, "", ...mdFields(amountFields(session.baseline.amounts)), "", ...mdFields(rateFields({ ...session.baseline.rates })),
    "", ...mdTechnical([...mdFields({ version: session.baseline.version, eligible: session.baseline.eligible, coverage_confirmed: session.baseline.coverage_confirmed, reasons: session.baseline.reasons }, false), "", ...mdFields(amountFields(session.baseline.amounts, "L3"), false)]),
    "", `## ${labels.sections.scenarioAssumptions}`, "", ...document.fixed_assumptions.map(assumption => `- ${md(assumption)}`),
    "", `## ${labels.nav.scenarios.label}`, "",
  ];
  for (const plan of document.scenarios) {
    lines.push(`### ${md(plan.name)}`, "", ...mdFields({ id: plan.id, status: plan.status }), "", ...mdFields({ ...plan.inputs }));
    if (plan.result === null) lines.push("", labels.scenario.draft, "");
    else {
      lines.push("", ...mdFields({ contribution: amountText(plan.result.contribution), delta: amountText(plan.result.delta, "L2", true) }), "");
      if (plan.result.amounts) lines.push(...mdFields(amountFields(plan.result.amounts)), "", ...mdFields(rateFields(plan.result.rates)), "");
      // 技術細節：到分的試算結果（L3），和 JSON／CSV 的值相同，只是加千分位與 U+2212。
      lines.push(...mdTechnical([...mdFields({ contribution: amountText(plan.result.contribution, "L3"), delta: amountText(plan.result.delta, "L3", true), reasons: plan.result.reasons, rounding_adjustment: amountText(plan.result.rounding_adjustment, "L3", true) }, false), "", ...plan.result.assumptions.map(assumption => `- ${md(assumption)}`), "", ...mdFields(plan.result.formulas, false)]), "");
    }
    if (plan.sensitivity) lines.push(...mdSensitivity(plan.sensitivity), "");
  }
  lines.push(`## ${labels.sections.actionList}`, "");
  if (actionWorkspace !== undefined) lines.push(copy.actionsNote, "");
  for (const action of document.actions) {
    const main = Object.fromEntries(Object.entries(action).filter(([key]) => key in ACTION_FIELD_LABELS));
    const technical = Object.fromEntries(Object.entries(action).filter(([key]) => !(key in ACTION_FIELD_LABELS)));
    lines.push(`### ${fill(copy.actionHeading, { priority: action.priority, problem: md(action.problem) })}`, "", ...mdFields(main), "", ...mdTechnical(mdFields(technical, false)), "");
  }
  lines.push(`## ${copy.sectionFacts}`, "");
  // 引用的數字是依據（L3）：到分、比率兩位小數。
  for (const fact of session.facts) lines.push(...mdFields({ fact_id: fact.id, metric: metricLabel(fact.metric) ?? fact.metric, value: fact.value === null ? null : formatMetric(fact.metric, fact, "L3"), reason_codes: fact.reason_codes, period: periodText(fact.period), scope: scopeLabel(fact.scope, alias), sources: fact.sources }), "");
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
    // 草稿（result 為 null）沒有自己的版本號，plan_revision 留空；不沿用上一個已計算版本。
    const revision = plan.result !== null ? contextMetadata?.plan_revisions[plan.id] : undefined;
    const planMeta: CsvRecord = { item_id: text(plan.id), item_name: text(plan.name), status: text(plan.status), ...(revision !== undefined ? { plan_revision: numeric(String(revision)) } : {}) };
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
    // R5-4：只在有填敏感度時輸出；輸入是使用者原字串，結果是該組銷量下的試算後貢獻。
    // 結果列的 status 欄放敏感度狀態（draft／stale／unfilled／valid…），reason_codes 只放大寫原因碼。
    if (plan.sensitivity) {
      const sensitivity = plan.sensitivity;
      const status = sensitivityStatus(sensitivity);
      const codes = text(status === "valid" ? [] : sensitivity.analysis === null ? ["UNCOMPUTED_DRAFT"] : [...new Set(sensitivity.analysis.reasons.map(reason => reason.code))]);
      SENSITIVITY_FIELDS.forEach((field, index) => push("scenario_sensitivity_input", field, text(sensitivity.volumes[index]), planMeta));
      SENSITIVITY_FIELDS.forEach((field, index) => {
        const row = sensitivity.analysis?.rows[index];
        push("scenario_sensitivity_result", field, row ? numeric(row.contribution) : empty, { ...planMeta, status: text(status), reason_codes: codes });
      });
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
