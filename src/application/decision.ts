import { SCENARIO_VERSION, buildScenarioBaseline, calculateScenario, type ScenarioBaseline, type ScenarioInputs, type ScenarioResult } from "../domain/scenarios";
import { isBusinessDate } from "../domain/date";
import type { Dataset, DatasetInput, Fact, Period, SourceRef } from "../domain/types";
import type { FilenameMap } from "./export";
import type { WorkspaceSnapshot } from "./workspace";
import { labels } from "../i18n";

export const MAX_SCENARIOS = 3;
export const MAX_ACTIONS = 3;
export interface DecisionSession {
  schema_version: "decision-v1";
  scenario_version: string;
  metric_version: WorkspaceSnapshot["metric_version"];
  dataset_id: string;
  dataset_hash: string;
  filter_hash: string;
  data_as_of: string;
  currency: Dataset["manifest"]["currency"];
  timezone: Dataset["manifest"]["timezone"];
  amount_basis: Dataset["manifest"]["amount_basis"];
  revision: number;
  snapshot_signature: string;
  period: Period;
  scope: WorkspaceSnapshot["report"]["scope"];
  comparison: WorkspaceSnapshot["report"]["comparison"];
  filenames: FilenameMap;
  baseline: ScenarioBaseline;
  facts: Fact[];
  sources: SourceRef[];
  stale: boolean;
  stale_reasons: string[];
}
/** R5-4：敏感度三組銷量假設（使用者原字串，不預填、不補零）；只是方案的附帶輸入，不改方案版本號。 */
export interface SensitivityInputs { volumes: [string, string, string] }
export const blankSensitivity = (): SensitivityInputs => ({ volumes: ["", "", ""] });
export const MAX_SENSITIVITY_INPUT_LENGTH = 100;
/** 形狀檢查：剛好一個 volumes 欄位、三個 ≤ 100 字的字串；不檢查數值（數值交給 analyzeScenarioSensitivity）。 */
export function validateSensitivityInputs(value: unknown): asserts value is SensitivityInputs {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "volumes")) throw new Error("INVALID_SENSITIVITY_INPUT");
  const volumes = (value as { volumes: unknown }).volumes;
  if (!Array.isArray(volumes) || volumes.length !== 3 || volumes.some(entry => typeof entry !== "string" || entry.length > MAX_SENSITIVITY_INPUT_LENGTH)) throw new Error("INVALID_SENSITIVITY_INPUT");
}
/** 至少一格有填（空白不算）才算「有敏感度」；匯出只輸出有填的方案。 */
export function hasSensitivityInputs(value: SensitivityInputs | undefined): value is SensitivityInputs {
  return value !== undefined && value.volumes.some(entry => entry.trim() !== "");
}
export interface ScenarioPlan { id: string; name: string; inputs: ScenarioInputs; result: ScenarioResult | null; sensitivity?: SensitivityInputs }
export interface ActionCardInput {
  id: string; problem: string; fact_ids: string[]; action: string; owner_role: string;
  validation_metric: string; deadline: string; stop_condition: string; required_data: string;
}
export interface ActionCard extends ActionCardInput { origin: "manual"; evidence_confirmed: boolean }
export interface DecisionDraft { session: DecisionSession; scenarios: ScenarioPlan[]; actions: ActionCard[] }
export type ColumnMappings = Partial<Record<SourceRef["file"], Record<string, string>>>;
/** Owned by the current page. No storage or cross-window sharing happens here. */
export interface DecisionWorkspaceState {
  captured: DecisionSession | null;
  scenarios: ScenarioPlan[];
  actions: ActionCard[];
  source_input: DatasetInput | null;
  source_mappings?: ColumnMappings;
}
export function emptyDecisionWorkspace(): DecisionWorkspaceState {
  return { captured: null, scenarios: [], actions: [], source_input: null };
}

/** Stable serialization for binding and integrity checks, independent of key insertion order. */
export function decisionSignature(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]));
    return item;
  }
  return JSON.stringify(canonical(value));
}
function snapshotSignature(snapshot: WorkspaceSnapshot): string {
  return decisionSignature({ dataset_id: snapshot.report.dataset_id, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, metric_version: snapshot.metric_version, data_as_of: snapshot.data_as_of, scope: snapshot.report.scope, period: snapshot.report.current.period });
}
function assertRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("INVALID_REVISION");
}
function freezeBaseline<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) freezeBaseline(entry);
    Object.freeze(value);
  }
  return value;
}

/** Capture only serializable facts and domain results, never raw rows or BigInt totals. */
export function createDecisionSession(dataset: Dataset, snapshot: WorkspaceSnapshot, revision: number, filenames: FilenameMap = {}): DecisionSession {
  assertRevision(revision);
  const channels = snapshot.report.scope.channels;
  const summary = channels.length === 1 ? snapshot.report.current.channels[channels[0]] : snapshot.report.current;
  const baseline = buildScenarioBaseline(summary, dataset.manifest.sales_coverage_confirmed);
  if (channels.length !== 1) {
    baseline.eligible = false;
    baseline.reasons.unshift({ code: "SINGLE_CHANNEL_REQUIRED", message: labels.ui.decision.singleChannelRequired });
  }
  const session: DecisionSession = structuredClone({
    schema_version: "decision-v1", scenario_version: SCENARIO_VERSION, metric_version: snapshot.metric_version,
    dataset_id: dataset.manifest.dataset_id, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash,
    data_as_of: snapshot.data_as_of, currency: dataset.manifest.currency, timezone: dataset.manifest.timezone, amount_basis: dataset.manifest.amount_basis,
    revision, snapshot_signature: snapshotSignature(snapshot),
    period: snapshot.report.current.period, scope: snapshot.report.scope, comparison: snapshot.report.comparison, filenames, baseline,
    facts: snapshot.report.facts, sources: summary.sources, stale: false, stale_reasons: [],
  });
  freezeBaseline(session.baseline);
  return session;
}

export function isDecisionSessionStale(session: DecisionSession, snapshot: WorkspaceSnapshot, revision: number): boolean {
  assertRevision(revision);
  return session.stale || session.revision !== revision || session.snapshot_signature !== snapshotSignature(snapshot);
}
export const isDecisionStale = isDecisionSessionStale;

/** A stale latch is monotone: only reconfirmDecision may create a fresh baseline. */
export function refreshDecisionSession(session: DecisionSession, snapshot: WorkspaceSnapshot, revision: number): DecisionSession {
  assertRevision(revision);
  const reasons = [...session.stale_reasons];
  if (session.revision !== revision) reasons.push("WORKSPACE_REVISION_CHANGED");
  if (session.snapshot_signature !== snapshotSignature(snapshot)) reasons.push("SNAPSHOT_CHANGED");
  return { ...session, stale: isDecisionSessionStale(session, snapshot, revision), stale_reasons: [...new Set(reasons)] };
}
export function blankScenarioInputs(): ScenarioInputs {
  return { volume_change_pct: "", discount_change_pp: "", fulfillment_change_pct: "", ad_change_pct: "", one_time_cost: "", assumptions_accepted: false };
}
function assertActive(session: DecisionSession): void {
  if (session.stale) throw new Error("STALE_DECISION");
}
function assertIds<T extends { id: string }>(items: readonly T[]): void {
  if (items.some(item => typeof item.id !== "string" || !item.id.trim()) || new Set(items.map(item => item.id)).size !== items.length) throw new Error("INVALID_ITEM_ID");
}
function upsert<T extends { id: string }>(items: readonly T[], item: T, limit: number, error: string): T[] {
  assertIds(items);
  assertIds([item]);
  const index = items.findIndex(existing => existing.id === item.id);
  if (items.length > limit || (index < 0 && items.length === limit)) throw new Error(error);
  return structuredClone(index < 0 ? [...items, item] : items.map((existing, position) => position === index ? item : existing));
}
export function saveScenario(session: DecisionSession, plans: readonly ScenarioPlan[], input: Omit<ScenarioPlan, "result">): ScenarioPlan[] {
  assertActive(session);
  validateScenarioName(input.name);
  const captured = structuredClone(input);
  return upsert(plans, { ...captured, result: calculateScenario(session.baseline, captured.inputs) }, MAX_SCENARIOS, "MAX_SCENARIOS");
}

export function validateScenarioName(name: string, required = true): void {
  if (typeof name !== "string" || name.length > 100 || (required && !name.trim())) throw new Error("INVALID_SCENARIO_NAME");
}
export function validateActionContent(input: ActionCardInput, required = true): void {
  for (const field of ["problem", "action", "owner_role", "validation_metric", "deadline", "stop_condition", "required_data"] as const) {
    const value = input[field];
    if (typeof value !== "string" || value.length > 2000 || (required && !value.trim())) throw new Error("INVALID_ACTION_FIELD");
  }
  if (required && !isBusinessDate(input.deadline)) throw new Error("INVALID_ACTION_DEADLINE");
}

export function validateActionEvidence(session: DecisionSession, input: Pick<ActionCardInput, "fact_ids">, requireEvidence = true): void {
  const ids = new Set(session.facts.map(fact => fact.id));
  if (!Array.isArray(input.fact_ids) || input.fact_ids.some(id => typeof id !== "string" || !ids.has(id))) throw new Error("UNKNOWN_FACT_ID");
  if (new Set(input.fact_ids).size !== input.fact_ids.length) throw new Error("DUPLICATE_FACT_ID");
  if (requireEvidence && input.fact_ids.length === 0) throw new Error("FACT_REQUIRED");
}
export function saveAction(session: DecisionSession, actions: readonly ActionCard[], input: ActionCardInput): ActionCard[] {
  assertActive(session);
  validateActionContent(input);
  validateActionEvidence(session, input);
  const item: ActionCard = { id: input.id, problem: input.problem, fact_ids: [...input.fact_ids], action: input.action, owner_role: input.owner_role, validation_metric: input.validation_metric, deadline: input.deadline, stop_condition: input.stop_condition, required_data: input.required_data, origin: "manual", evidence_confirmed: true };
  return upsert(actions, item, MAX_ACTIONS, "MAX_ACTIONS");
}
export function removeScenario(plans: readonly ScenarioPlan[], id: string): ScenarioPlan[] { return structuredClone(plans.filter(plan => plan.id !== id)); }
export function removeAction(actions: readonly ActionCard[], id: string): ActionCard[] { return structuredClone(actions.filter(action => action.id !== id)); }
function reorder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  assertIds(items);
  if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(id => !items.some(item => item.id === id))) throw new Error("INVALID_ORDER");
  return structuredClone(ids.map(id => items.find(item => item.id === id)!));
}
export function reorderScenarios(plans: readonly ScenarioPlan[], ids: readonly string[]): ScenarioPlan[] { return reorder(plans, ids); }
export function reorderActions(actions: readonly ActionCard[], ids: readonly string[]): ActionCard[] { return reorder(actions, ids); }
export function reconfirmDecision(_oldSession: DecisionSession, plans: readonly ScenarioPlan[], actions: readonly ActionCard[], dataset: Dataset, snapshot: WorkspaceSnapshot, revision: number, filenames: FilenameMap = {}): DecisionDraft {
  void _oldSession; // Reconfirmation deliberately binds the new snapshot, never reuses old financial data.
  // R5-4：方案只留 id 與名稱；假設、結果與敏感度三組輸入一律清空（sensitivity 不帶入 → undefined）。
  return {
    session: createDecisionSession(dataset, snapshot, revision, filenames),
    scenarios: plans.map(plan => ({ id: plan.id, name: plan.name, inputs: blankScenarioInputs(), result: null })),
    actions: structuredClone(actions.map(action => ({ ...action, fact_ids: [], origin: "manual" as const, evidence_confirmed: false }))),
  };
}
