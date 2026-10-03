import { z } from "zod";
import { validateDataset } from "@/domain/validation";
import { calculateScenario, SCENARIO_VERSION } from "@/domain/scenarios";
import type { AnalysisFilters, Dataset, DatasetInput, ValidationResult } from "@/domain/types";
import { createDecisionSession, decisionSignature, emptyDecisionWorkspace, refreshDecisionSession, validateActionContent, validateActionEvidence, validateScenarioName, type ColumnMappings, type DecisionWorkspaceState } from "./decision";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "./workspace";
import type { FilenameMap } from "./export";
import { actionContextId, actionDocuments, emptyActionWorkspace, normalizeActionWorkspace, type ActionWorkspace } from "./action-workspace";
import { emptyScenarioWorkspace, migrateLegacyDecisionWorkspace, validateScenarioWorkspace, type ScenarioWorkspace } from "./scenario-workspace";
import { validateReviewSession, type ReviewSession } from "./review-session";
import { freezeMeeting, MAX_MEETING_HISTORY, meetingSchema, validateMeeting, type Meeting } from "./meeting";
import { MAX_CSV_BYTES } from "@/lib/csv";
import { CONVERTIBLE_FIELDS, isValidTaxRate, type RawValuesByFile, type TaxConversion } from "./tax-basis";
import { MAX_TARGET_ROWS, targetRowIssues, type TargetRow, type TargetSet } from "./targets";
import { MAX_EVENT_ROWS, eventRowIssues, type EventSet } from "./events";
import { convertInclusiveAmount } from "./tax-basis";
import { formatCents } from "@/domain/money";

export const WORKSPACE_VERSION = "profitlens-workspace-v4";
const WORKSPACE_V3 = "profitlens-workspace-v3";
/** R4 前處理（含稅換算）：換算摘要＋被換算格子的含稅原值（檔案 → 原始行號 → 標準欄位 → 原值）。 */
export interface WorkspacePreprocessing { conversion: TaxConversion; raw_values: RawValuesByFile }
/** R4 介面偏好：上次使用的期間快捷、行動頁的看板／清單檢視。 */
export interface WorkspaceUiPrefs { last_preset?: string; view?: "board" | "list" }
/** Upper bound for raw-value lines kept per source file (matches MAX_CSV_ROWS). */
export const MAX_RAW_VALUE_LINES = 50_000;
export { MAX_TARGET_ROWS, MAX_EVENT_ROWS };
// Structural node cap: raw_values may legitimately hold up to 3 × 50,000 lines × their converted cells,
// so the v4 cap sits above that worst case; the 64 MiB byte cap below is unchanged.
const MAX_STRUCTURE_NODES = 1_000_000;
/** Total portable size cap includes active data, retained historical contexts, and JSON escaping. */
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
export interface WorkspaceBackupSource {
  input: DatasetInput; filters: AnalysisFilters; id: string; revision: number;
  filenames?: FilenameMap; mappings?: ColumnMappings; decision: DecisionWorkspaceState; action_workspace?: ActionWorkspace;
  scenario_workspace?: ScenarioWorkspace; review_session?: ReviewSession | null;
  preprocessing?: WorkspacePreprocessing | null; targets?: TargetSet | null; events?: EventSet | null; ui_prefs?: WorkspaceUiPrefs;
  /** R6 會議紀錄（已結束、只讀）；沒有就寫入 []。 */
  meeting_history?: readonly Meeting[];
}
export interface RestoredWorkspace extends Omit<WorkspaceBackupSource, "filters"> {
  action_workspace: ActionWorkspace;
  scenario_workspace: ScenarioWorkspace; review_session: ReviewSession | null;
  /** v1–v3 備份沒有這些欄位：一律還原為 null／{}。 */
  preprocessing: WorkspacePreprocessing | null; targets: TargetSet | null; events: EventSet | null; ui_prefs: WorkspaceUiPrefs;
  /** R6：v1–v3 與沒有欄位時為 []；每筆都重新 validateMeeting 並深層凍結。 */
  meeting_history: Meeting[];
  dataset: Dataset; snapshot: WorkspaceSnapshot; filenames: FilenameMap; mappings: ColumnMappings;
  issues: ValidationResult["issues"]; classification: "valid" | "partial";
}
const name = z.string().min(1).max(500);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const period = z.strictObject({ start: z.string().max(10), end: z.string().max(10) });
const filters = z.strictObject({ channels: z.array(name).min(1).max(1000).optional(), previous_period: period.optional(), current_period: period.optional(), comparison_mode: z.enum(["same_days", "calendar_months"]).optional() });
const csvFiles = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
const sourceFiles = [...csvFiles, "manifest.json"] as const;
const filenames = z.partialRecord(z.enum(sourceFiles), name);
function fieldMapping<const T extends readonly [string, ...string[]]>(fields: T) {
  return z.partialRecord(z.enum(fields), name).refine(value => new Set(Object.values(value)).size === Object.keys(value).length);
}
const mappings = z.strictObject({
  "sales_daily.csv": fieldMapping(["date", "channel", "sku", "category", "units_sold", "gross_sales", "discounts", "refunds", "cogs_net", "currency"]).optional(),
  "channel_costs_daily.csv": fieldMapping(["date", "channel", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "currency"]).optional(),
  "ad_spend_daily.csv": fieldMapping(["date", "channel", "ad_spend", "currency"]).optional(),
});
const input = z.strictObject({
  manifest: z.record(z.string(), z.unknown()),
  files: z.strictObject({ "sales_daily.csv": z.string().max(MAX_CSV_BYTES), "channel_costs_daily.csv": z.string().max(MAX_CSV_BYTES), "ad_spend_daily.csv": z.string().max(MAX_CSV_BYTES) }),
  confirmedUnknownColumns: z.partialRecord(z.enum(csvFiles), z.array(name).max(1000)).optional(),
});
const scenarioInputs = z.strictObject({ volume_change_pct: z.string().max(100), discount_change_pp: z.string().max(100), fulfillment_change_pct: z.string().max(100), ad_change_pct: z.string().max(100), one_time_cost: z.string().max(100), assumptions_accepted: z.boolean() });
const scenario = z.strictObject({ id: name, name: z.string().max(100), inputs: scenarioInputs, calculated: z.boolean() });
const action = z.strictObject({ id: name, problem: z.string().max(2000), fact_ids: z.array(z.string().max(3000)).max(5000), action: z.string().max(2000), owner_role: z.string().max(2000), validation_metric: z.string().max(2000), deadline: z.string().max(2000), stop_condition: z.string().max(2000), required_data: z.string().max(2000), origin: z.literal("manual"), evidence_confirmed: z.boolean() });
const savedDecision = z.strictObject({
  source_input: input, source_mappings: mappings.optional(), filters,
  filenames, dataset_hash: hash, filter_hash: hash, revision,
  stale: z.boolean(), stale_reasons: z.array(z.enum(["WORKSPACE_REVISION_CHANGED", "SNAPSHOT_CHANGED"])).max(2),
  scenarios: z.array(scenario).max(3), actions: z.array(action).max(3),
});
const savedActionWorkspace = z.strictObject({
  contexts: z.array(savedDecision.extend({ id: name })),
  items: z.array(z.strictObject({ card: action, context_id: name, pinned: z.boolean(), diagnostic_id: name.optional(), scope: z.strictObject({ kind: z.enum(["all","channel","sku"]), channels: z.array(name).min(1), sku: name.optional(), category: z.string().max(500).optional() }) })),
});
// These schemas intentionally retain the original v1/v2 contract. Validate and
// checksum the old wire representation before adding any migration defaults.
const legacyEnvelopeSchema = z.strictObject({
  schema_version: z.enum(["profitlens-workspace-v1", "profitlens-workspace-v2"]), metric_version: z.literal("contribution-v1"), scenario_version: z.literal(SCENARIO_VERSION),
  saved_at: z.iso.datetime(), checksum: hash,
  payload: z.strictObject({ active: z.strictObject({ input, filters, id: name, revision, filenames, mappings }), decision: savedDecision.nullable(), action_workspace: savedActionWorkspace.optional() }),
});
const scope = z.strictObject({ kind: z.enum(["all", "channel", "sku"]), channels: z.array(name).min(1).max(1000), sku: name.optional(), category: z.string().max(500).optional() });
const binding = z.strictObject({ revision: revision.min(1), context_id: name, scope, fact_ids: z.array(z.string().max(3000)).max(5000), evidence_confirmed: z.boolean(), legacy_review_required: z.boolean(), diagnostic_id: name.optional() });
const savedAction = z.strictObject({
  card: action, context_id: name, pinned: z.boolean(), diagnostic_id: name.optional(), scope,
  execution_status: z.enum(["not_started", "in_progress", "blocked", "completed"]), progress_notes: z.string().max(2000),
  binding_revision: revision.min(1), binding_history: z.array(binding), legacy_review_required: z.boolean(),
});
const referencedDecision = savedDecision.omit({ source_input: true }).extend({ source_hash: hash });
const referencedActionWorkspace = z.strictObject({ active_dataset_hash: hash.optional(), contexts: z.array(referencedDecision.extend({ id: name })), items: z.array(savedAction) });
const scenarioContext = referencedDecision.omit({ scenarios: true, actions: true }).extend({
  id: name, epoch: name, status: z.enum(["current", "historical"]), historical_reasons: z.array(z.string().max(100)).max(20),
  plans: z.array(scenario.extend({ revision: revision.min(1) })).max(3),
  versions: z.array(z.strictObject({ plan_id: name, revision: revision.min(1), name: z.string().max(100), inputs: scenarioInputs, calculated: z.literal(true) })),
});
const referencedScenarioWorkspace = z.strictObject({ schema_version: z.literal("scenario-workspace-v1"), active_epoch: name, contexts: z.array(scenarioContext) });
const selection = z.strictObject({ context_id: name, plan_id: name, plan_revision: revision.min(1), channel: name });
const referencedReview = z.strictObject({
  schema_version: z.literal("review-session-v1"), id: name, name: z.string().min(1).max(200), revision: revision.min(1), epoch: name,
  dataset_hash: hash, filter_hash: hash, metric_version: z.literal("contribution-v1"), data_as_of: z.string().max(10),
  meeting_filters: filters.required(), importance_threshold: z.string().max(30), selected_scenarios: z.array(selection), pinned_action_ids: z.array(name).max(3),
  action_bindings: z.array(z.strictObject({ action_id: name, context_id: name, binding_revision: revision.min(1) })),
  notes: z.string().max(8000), decision_state: z.enum(["draft", "adopted", "needs_data", "not_adopted"]), confirmed_revision: revision.nullable(), target_version: z.null(), status: z.enum(["current", "historical"]),
  source_hash: hash, filenames, source_mappings: mappings.optional(),
});
const v3PayloadShape = { sources: z.record(hash, input), active: z.strictObject({ source_hash: hash, filters, id: name, revision, filenames, mappings }), decision: referencedDecision.nullable(), action_workspace: referencedActionWorkspace, scenario_workspace: referencedScenarioWorkspace, review_session: referencedReview.nullable() };
const v3Payload = z.strictObject(v3PayloadShape);
const v3EnvelopeSchema = z.strictObject({
  schema_version: z.literal(WORKSPACE_V3), metric_version: z.literal("contribution-v1"), scenario_version: z.literal(SCENARIO_VERSION), saved_at: z.iso.datetime(), checksum: hash,
  payload: v3Payload,
});
// v4 additions. Amounts stay decimal strings (≤ 2 decimals), never floats.
const amount = z.string().max(200).regex(/^-?\d+(?:\.\d{1,2})?$/);
const isoDate = z.string().max(10).regex(/^\d{4}-\d{2}-\d{2}$/);
const convertibleFields = [...new Set(Object.values(CONVERTIBLE_FIELDS).flat())] as [string, ...string[]];
const lineKey = z.string().regex(/^[1-9]\d{0,7}$/);
function rawFile(fields: readonly string[]) {
  return z.record(lineKey, z.partialRecord(z.enum(fields as [string, ...string[]]), amount).refine(cells => Object.keys(cells).length > 0))
    .refine(lines => Object.keys(lines).length <= MAX_RAW_VALUE_LINES);
}
const conversion = z.strictObject({
  basis: z.literal("inclusive"), rate: z.string().max(10).refine(isValidTaxRate),
  fields: z.array(z.enum(convertibleFields)).max(convertibleFields.length).refine(fields => new Set(fields).size === fields.length),
  rows_converted: z.number().int().nonnegative().max(csvFiles.length * MAX_RAW_VALUE_LINES),
  totals: z.partialRecord(z.enum(convertibleFields), z.strictObject({ raw: amount, converted: amount })).optional(),
});
const preprocessing = z.strictObject({
  conversion,
  raw_values: z.strictObject({ "sales_daily.csv": rawFile(CONVERTIBLE_FIELDS["sales_daily.csv"]).optional(), "channel_costs_daily.csv": rawFile(CONVERTIBLE_FIELDS["channel_costs_daily.csv"]).optional(), "ad_spend_daily.csv": rawFile(CONVERTIBLE_FIELDS["ad_spend_daily.csv"]).optional() }),
}).refine(value => Object.values(value.raw_values).every(lines => Object.values(lines ?? {}).every(cells => Object.keys(cells).every(field => value.conversion.fields.includes(field)))));
const targetMetrics = ["net_revenue", "gross_profit", "contribution_after_marketing", "ad_spend"] as const satisfies readonly TargetRow["metric"][];
const sourceLine = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const targets = z.strictObject({
  filename: name.nullable(),
  rows: z.array(z.strictObject({ period_start: isoDate, period_end: isoDate, channel: name, metric: z.enum(targetMetrics), target: amount, line: sourceLine })).max(MAX_TARGET_ROWS),
});
const events = z.strictObject({
  filename: name.nullable(),
  rows: z.array(z.strictObject({ start: isoDate, end: isoDate, label: z.string().max(60), line: sourceLine })).max(MAX_EVENT_ROWS),
});
const uiPrefs = z.strictObject({ last_preset: z.string().min(1).max(64).optional(), view: z.enum(["board", "list"]).optional() });
// R5 加法（只在 v4 信封）：方案的敏感度三組原字串、待辦的狀態更新日；選填，舊 v4 沒有 → 讀回 undefined。
// v1–v3 的 schema 維持原形狀：舊信封帶這兩個欄位一律 INVALID_WORKSPACE_FORMAT。versions 不存敏感度。
const sensitivity = z.strictObject({ volumes: z.tuple([z.string().max(100), z.string().max(100), z.string().max(100)]) });
const scenarioV4 = scenario.extend({ sensitivity: sensitivity.optional() });
const savedActionV4 = savedAction.extend({ status_updated_at: isoDate.optional() });
const savedDecisionV4 = savedDecision.extend({ scenarios: z.array(scenarioV4).max(3) });
const referencedDecisionV4 = savedDecisionV4.omit({ source_input: true }).extend({ source_hash: hash });
const referencedActionWorkspaceV4 = referencedActionWorkspace.extend({ contexts: z.array(referencedDecisionV4.extend({ id: name })), items: z.array(savedActionV4) });
const scenarioContextV4 = scenarioContext.extend({ plans: z.array(scenarioV4.extend({ revision: revision.min(1) })).max(3) });
const referencedScenarioWorkspaceV4 = referencedScenarioWorkspace.extend({ contexts: z.array(scenarioContextV4) });
const v4CorePayload = z.strictObject({ ...v3PayloadShape, decision: referencedDecisionV4.nullable(), action_workspace: referencedActionWorkspaceV4, scenario_workspace: referencedScenarioWorkspaceV4 });
/** restoreV3 讀的 payload：v4 核心（v3 是它的子集，只是沒有 R5 的選填欄位）。 */
type CorePayload = z.infer<typeof v4CorePayload>;
/** restoreDecision 讀的方案：v1–v3 沒有 sensitivity（型別上是選填，讀取時仍以 "sensitivity" in plan 守衛）。 */
type SavedDecision = z.infer<typeof savedDecisionV4>;
const envelopeSchema = z.strictObject({
  schema_version: z.literal(WORKSPACE_VERSION), metric_version: z.literal("contribution-v1"), scenario_version: z.literal(SCENARIO_VERSION), saved_at: z.iso.datetime(), checksum: hash,
  // .extend keeps the strict (no unknown keys) object config.
  payload: v4CorePayload.extend({
    preprocessing: preprocessing.nullable(), targets: targets.nullable(), events: events.nullable(),
    // R6 會議紀錄：每筆是完整的 meeting-v1（strict），最多 MAX_MEETING_HISTORY 筆；語意檢查在 restoreV4。
    meeting_history: z.array(meetingSchema).max(MAX_MEETING_HISTORY),
    ui_prefs: uiPrefs,
  }),
});

async function checksum(value: unknown): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(value)));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}
function portableInput(value: DatasetInput): DatasetInput {
  return {
    manifest: structuredClone(value.manifest),
    files: Object.fromEntries(csvFiles.map(file => {
      const raw = value.files[file];
      if (raw === undefined) throw new Error("WORKSPACE_DATA_INVALID");
      return [file, typeof raw === "string" ? raw : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw)];
    })),
    ...(value.confirmedUnknownColumns ? { confirmedUnknownColumns: structuredClone(value.confirmedUnknownColumns) } : {}),
  };
}
/** Wire form of optional side data: drops undefined members exactly as JSON would, so checksum and file agree. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function uniqueIds(items: readonly { id: string }[]): void {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("INVALID_ITEM_ID");
}
function assertSafeStructure(value: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > MAX_STRUCTURE_NODES || item.depth > 32) throw new Error("INVALID_WORKSPACE_FORMAT");
    if (!item.value || typeof item.value !== "object") continue;
    for (const [key, entry] of Object.entries(item.value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("INVALID_WORKSPACE_FORMAT");
      pending.push({ value: entry, depth: item.depth + 1 });
    }
  }
}
async function rebuild(input: DatasetInput, filters: AnalysisFilters) {
  const validation = validateDataset(input);
  if (!validation.dataset || validation.classification === "blocking") throw new Error("WORKSPACE_DATA_INVALID");
  const snapshot = await createSnapshot(validation.dataset, filters, await hashInput(input));
  return { validation, dataset: validation.dataset, snapshot };
}
async function restoreDecision(saved: SavedDecision | null, activeSnapshot: WorkspaceSnapshot, activeRevision: number, rebuilt?: Awaited<ReturnType<typeof rebuild>>): Promise<DecisionWorkspaceState> {
  if (!saved) return emptyDecisionWorkspace();
  const { dataset, snapshot } = rebuilt ?? await rebuild(saved.source_input, saved.filters);
  if (snapshot.dataset_hash !== saved.dataset_hash || snapshot.filter_hash !== saved.filter_hash) throw new Error("WORKSPACE_BINDING_MISMATCH");
  const session = createDecisionSession(dataset, snapshot, saved.revision, saved.filenames);
  uniqueIds(saved.scenarios); uniqueIds(saved.actions);
  const scenarios = saved.scenarios.map(plan => {
    validateScenarioName(plan.name, plan.calculated);
    return { id: plan.id, name: plan.name, inputs: structuredClone(plan.inputs), result: plan.calculated ? calculateScenario(session.baseline, plan.inputs) : null, ...("sensitivity" in plan && plan.sensitivity ? { sensitivity: structuredClone(plan.sensitivity) } : {}) };
  });
  for (const card of saved.actions) {
    validateActionContent(card, card.evidence_confirmed);
    validateActionEvidence(session, card, card.evidence_confirmed);
  }
  return {
    captured: refreshDecisionSession({ ...session, stale: saved.stale, stale_reasons: saved.stale_reasons }, activeSnapshot, activeRevision),
    scenarios, actions: structuredClone(saved.actions), source_input: structuredClone(saved.source_input),
    ...(saved.source_mappings ? { source_mappings: structuredClone(saved.source_mappings) } : {}),
  };
}

/** Builds an inert portable backup; no financial result or AI state is serialized. */
export async function exportWorkspaceBackup(source: WorkspaceBackupSource): Promise<string> {
  const activeInput = portableInput(source.input);
  const { snapshot } = await rebuild(activeInput, source.filters);
  const sources: Record<string, DatasetInput> = {};
  async function register(value: DatasetInput): Promise<string> {
    const portable = portableInput(value), key = await hashInput(portable);
    if (sources[key] && decisionSignature(sources[key]) !== decisionSignature(portable)) throw new Error("WORKSPACE_BINDING_MISMATCH");
    sources[key] = portable;
    return key;
  }
  const activeHash = await register(activeInput);
  const reference = (session: NonNullable<DecisionWorkspaceState["captured"]>, sourceHash: string, sourceMappings?: ColumnMappings) => ({
    source_hash: sourceHash, ...(sourceMappings ? { source_mappings: sourceMappings } : {}),
    filters: session.scope, filenames: session.filenames, dataset_hash: session.dataset_hash, filter_hash: session.filter_hash,
    revision: session.revision, stale: session.stale, stale_reasons: session.stale_reasons,
  });
  const current = source.decision.captured;
  let decision: unknown = null;
  if (current) {
    if (!source.decision.source_input) throw new Error("WORKSPACE_DECISION_SOURCE_MISSING");
    const captured = refreshDecisionSession(current, snapshot, source.revision);
    decision = {
      ...reference(captured, await register(source.decision.source_input), source.decision.source_mappings),
      scenarios: source.decision.scenarios.map(plan => ({ id: plan.id, name: plan.name, inputs: plan.inputs, calculated: plan.result !== null, ...(plan.sensitivity ? { sensitivity: plan.sensitivity } : {}) })),
      actions: source.decision.actions,
    };
  } else if (source.decision.scenarios.length || source.decision.actions.length) throw new Error("WORKSPACE_DECISION_SOURCE_MISSING");
  let actionState = normalizeActionWorkspace(source.action_workspace ?? emptyActionWorkspace());
  // Legacy callers may still provide action cards on DecisionWorkspaceState.
  if (!source.action_workspace && current && source.decision.source_input && source.decision.actions.length) {
    const historical = await rebuild(source.decision.source_input, current.scope);
    const captured = refreshDecisionSession(current, snapshot, source.revision), id = actionContextId(captured);
    actionState = normalizeActionWorkspace({ contexts: [{ id, session: captured, diagnostics: historical.snapshot.report.diagnostics, source_input: source.decision.source_input, source_mappings: source.decision.source_mappings }], items: source.decision.actions.map((card, index) => ({ card, context_id: id, scope: { kind: "all", channels: captured.scope.channels }, pinned: index < 3 })) });
  }
  actionDocuments(actionState);
  const actionWorkspace = {
    active_dataset_hash: snapshot.dataset_hash,
    items: actionState.items,
    contexts: await Promise.all(actionState.contexts.map(async context => ({ id: context.id, ...reference(context.session, await register(context.source_input), context.source_mappings), scenarios: [], actions: [] }))),
  };
  const scenarioState = source.scenario_workspace ?? migrateLegacyDecisionWorkspace(source.decision, snapshot, source.revision, source.review_session?.epoch ?? `legacy-${source.revision}-${snapshot.dataset_hash}`);
  validateScenarioWorkspace(scenarioState);
  const scenarioWorkspace = {
    schema_version: scenarioState.schema_version, active_epoch: scenarioState.active_epoch,
    contexts: await Promise.all(scenarioState.contexts.map(async context => ({
      id: context.id, epoch: context.epoch, status: context.status, historical_reasons: context.historical_reasons,
      ...reference(context.session, await register(context.source_input), context.source_mappings),
      plans: context.plans.map(plan => ({ id: plan.id, revision: plan.revision, name: plan.name, inputs: plan.inputs, calculated: plan.result !== null, ...(plan.sensitivity ? { sensitivity: plan.sensitivity } : {}) })),
      versions: context.versions.map(plan => ({ plan_id: plan.plan_id, revision: plan.revision, name: plan.name, inputs: plan.inputs, calculated: true })),
    }))),
  };
  let reviewSession: unknown = null;
  if (source.review_session) {
    validateReviewSession(source.review_session, scenarioState);
    const { source_input: reviewInput, ...review } = source.review_session;
    reviewSession = { ...review, source_hash: await register(reviewInput) };
  }
  const uiPrefs: WorkspaceUiPrefs = {
    ...(source.ui_prefs?.last_preset !== undefined ? { last_preset: source.ui_prefs.last_preset } : {}),
    ...(source.ui_prefs?.view !== undefined ? { view: source.ui_prefs.view } : {}),
  };
  const body = {
    schema_version: WORKSPACE_VERSION, metric_version: "contribution-v1", scenario_version: SCENARIO_VERSION, saved_at: new Date().toISOString(),
    payload: {
      sources, active: { source_hash: activeHash, filters: snapshot.report.scope, id: source.id, revision: source.revision, filenames: source.filenames ?? {}, mappings: source.mappings ?? {} }, decision, action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: reviewSession,
      preprocessing: source.preprocessing ? { conversion: plain(source.preprocessing.conversion), raw_values: plain(source.preprocessing.raw_values) } : null,
      targets: source.targets ? plain(source.targets) : null, events: source.events ? plain(source.events) : null,
      meeting_history: plain(source.meeting_history ?? []), ui_prefs: uiPrefs,
    },
  };
  const text = JSON.stringify({ ...body, checksum: await checksum(body) });
  // Check our own serialization through the same untrusted boundary used by restore.
  await restoreWorkspaceBackup(text);
  return text;
}

/** Pure transactional preparation: the caller explicitly applies only the complete returned value.
 * SHA-256 detects accidental changes, not authorship. A forged valid dataset still requires source review.
 */
export async function restoreWorkspaceBackup(text: string): Promise<RestoredWorkspace> {
  if (typeof text !== "string") throw new Error("INVALID_WORKSPACE_JSON");
  if (text.length > MAX_WORKSPACE_BYTES || new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BYTES) throw new Error("WORKSPACE_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("INVALID_WORKSPACE_JSON"); }
  assertSafeStructure(parsed);
  if (parsed && typeof parsed === "object") {
    const versions = parsed as Record<string, unknown>;
    if (![WORKSPACE_VERSION, WORKSPACE_V3, "profitlens-workspace-v2", "profitlens-workspace-v1"].includes(String(versions.schema_version)) || versions.metric_version !== "contribution-v1" || versions.scenario_version !== SCENARIO_VERSION) throw new Error("WORKSPACE_VERSION_UNSUPPORTED");
  }
  const version = (parsed as { schema_version?: string } | null)?.schema_version;
  const schema = version === WORKSPACE_VERSION ? envelopeSchema : version === WORKSPACE_V3 ? v3EnvelopeSchema : legacyEnvelopeSchema;
  const result = schema.safeParse(parsed);
  if (!result.success) throw new Error("INVALID_WORKSPACE_FORMAT");
  // Checksum the wire representation of whichever version was read, before any migration defaults.
  const { checksum: expected, ...body } = result.data;
  let actual: string;
  try { actual = await checksum(body); } catch { throw new Error("INVALID_WORKSPACE_FORMAT"); }
  if (actual !== expected) throw new Error("WORKSPACE_CHECKSUM_MISMATCH");
  if (body.schema_version === WORKSPACE_VERSION) return restoreV4(body as Omit<z.infer<typeof envelopeSchema>, "checksum">);
  if (body.schema_version === WORKSPACE_V3) return { ...await restoreV3((body as Omit<z.infer<typeof v3EnvelopeSchema>, "checksum">).payload), ...EMPTY_V4_FIELDS() };
  return { ...await restoreLegacy(body as Omit<z.infer<typeof legacyEnvelopeSchema>, "checksum">), ...EMPTY_V4_FIELDS() };
}

type V4Fields = Pick<RestoredWorkspace, "preprocessing" | "targets" | "events" | "ui_prefs" | "meeting_history">;
const EMPTY_V4_FIELDS = (): V4Fields => ({ preprocessing: null, targets: null, events: null, ui_prefs: {}, meeting_history: [] });

async function restoreV4(body: Omit<z.infer<typeof envelopeSchema>, "checksum">): Promise<RestoredWorkspace> {
  const { preprocessing: savedPreprocessing, targets: savedTargets, events: savedEvents, ui_prefs: savedPrefs, meeting_history: savedMeetings, ...payload } = body.payload;
  // 會議紀錄是自足的只讀紀錄（可能來自較早的資料），不和目前資料集比對；逐筆語意檢查、id 不可重複。
  const meetingHistory = savedMeetings.map(saved => {
    try { validateMeeting(saved); } catch { throw new Error("INVALID_WORKSPACE_FORMAT"); }
    return freezeMeeting(saved);
  });
  if (new Set(meetingHistory.map(meeting => meeting.id)).size !== meetingHistory.length) throw new Error("INVALID_WORKSPACE_FORMAT");
  const restored = await restoreV3(payload);
  // 還原不信任序列化結果：目標／檔期依 CSV 規則重驗（通路要在資料集裡），含稅原值要能換算回資料集裡的同一格。
  if (savedTargets && targetRowIssues(savedTargets.rows, restored.dataset.manifest.channels).length) throw new Error("INVALID_WORKSPACE_FORMAT");
  if (savedEvents && eventRowIssues(savedEvents.rows).length) throw new Error("INVALID_WORKSPACE_FORMAT");
  if (savedPreprocessing) {
    const rowsOf = { "sales_daily.csv": restored.dataset.sales, "channel_costs_daily.csv": restored.dataset.costs, "ad_spend_daily.csv": restored.dataset.ads } as const;
    for (const [file, lines] of Object.entries(savedPreprocessing.raw_values) as [keyof typeof rowsOf, Record<string, Record<string, string>>][]) {
      const rows = (rowsOf[file] ?? []) as unknown as readonly Record<string, unknown>[];
      for (const [line, cells] of Object.entries(lines)) {
        const row = rows.find(candidate => (candidate.source as { line: number | null }).line === Number(line));
        if (!row) throw new Error("INVALID_WORKSPACE_FORMAT");
        for (const [field, raw] of Object.entries(cells)) {
          const stored = row[field];
          if (typeof stored !== "bigint" || convertInclusiveAmount(raw, savedPreprocessing.conversion.rate) !== formatCents(stored)) throw new Error("INVALID_WORKSPACE_FORMAT");
        }
      }
    }
  }
  const v4: V4Fields = {
    preprocessing: savedPreprocessing ? { conversion: structuredClone(savedPreprocessing.conversion) as TaxConversion, raw_values: structuredClone(savedPreprocessing.raw_values) as RawValuesByFile } : null,
    targets: savedTargets ? structuredClone(savedTargets) : null,
    events: savedEvents ? structuredClone(savedEvents) : null,
    ui_prefs: structuredClone(savedPrefs),
    meeting_history: meetingHistory,
  };
  return { ...restored, ...v4 };
}

async function restoreLegacy(body: Omit<z.infer<typeof legacyEnvelopeSchema>, "checksum">): Promise<Omit<RestoredWorkspace, keyof V4Fields>> {
  if (body.schema_version === "profitlens-workspace-v1" && body.payload.action_workspace) throw new Error("INVALID_WORKSPACE_FORMAT");
  const active = body.payload.active;
  const { dataset, snapshot, validation } = await rebuild(active.input, active.filters);
  const decision = await restoreDecision(body.payload.decision, snapshot, active.revision);
  let actionWorkspace=emptyActionWorkspace();
  if(body.payload.action_workspace) {
    const saved=body.payload.action_workspace;
    for(const context of saved.contexts) {
      if(context.scenarios.length || context.actions.length) throw new Error("INVALID_ACTION_CONTEXT");
      const rebuilt=await rebuild(context.source_input,context.filters);
      if(rebuilt.snapshot.dataset_hash!==context.dataset_hash || rebuilt.snapshot.filter_hash!==context.filter_hash)throw new Error("WORKSPACE_BINDING_MISMATCH");
      const session={...createDecisionSession(rebuilt.dataset,rebuilt.snapshot,context.revision,context.filenames),stale:context.stale,stale_reasons:context.stale_reasons};
      if(actionContextId(session)!==context.id)throw new Error("WORKSPACE_BINDING_MISMATCH");
      actionWorkspace.contexts.push({id:context.id,session,diagnostics:rebuilt.snapshot.report.diagnostics,source_input:context.source_input,...(context.source_mappings?{source_mappings:context.source_mappings}:{})});
    }
    actionWorkspace.items=structuredClone(saved.items);
    actionDocuments(actionWorkspace);
  } else if(decision.captured && decision.source_input && decision.actions.length) {
    const id=actionContextId(decision.captured);
    const rebuilt=await rebuild(decision.source_input,decision.captured.scope);
    actionWorkspace={contexts:[{id,session:decision.captured,diagnostics:rebuilt.snapshot.report.diagnostics,source_input:decision.source_input,source_mappings:decision.source_mappings}],items:decision.actions.map((card,index)=>({card,context_id:id,scope:{kind:"all",channels:decision.captured!.scope.channels},pinned:index<3}))};
  }
  actionWorkspace = normalizeActionWorkspace({ ...actionWorkspace, active_dataset_hash: snapshot.dataset_hash });
  const scenarioWorkspace = migrateLegacyDecisionWorkspace(decision, snapshot, active.revision, `legacy-${active.revision}-${snapshot.dataset_hash}`);
  return { action_workspace: actionWorkspace, scenario_workspace: scenarioWorkspace, review_session: null, input: active.input, dataset, snapshot, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, decision, issues: validation.issues, classification: validation.classification as "valid" | "partial" };
}

async function restoreV3(payload: CorePayload): Promise<Omit<RestoredWorkspace, keyof V4Fields>> {
  // Every saved source, including retained history, passes the same CSV boundary.
  // Cache validated datasets once; each context still rebuilds its own scope.
  const validated = new Map<string, { input: z.infer<typeof input>; validation: ValidationResult; dataset: Dataset }>();
  for (const [key, value] of Object.entries(payload.sources)) {
    if (await hashInput(value) !== key) throw new Error("WORKSPACE_BINDING_MISMATCH");
    const validation = validateDataset(value);
    if (!validation.dataset || validation.classification === "blocking") throw new Error("WORKSPACE_DATA_INVALID");
    validated.set(key, { input: value, validation, dataset: validation.dataset });
  }
  const resolve = (key: string) => {
    const value = validated.get(key);
    if (!value) throw new Error("WORKSPACE_SOURCE_MISSING");
    return value;
  };
  const contexts = new Map<string, Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot; validation: ValidationResult }>>();
  const scoped = (key: string, requested: AnalysisFilters) => {
    const cacheKey = decisionSignature({ key, requested });
    let result = contexts.get(cacheKey);
    if (!result) {
      const source = resolve(key);
      result = createSnapshot(source.dataset, requested, key).then(snapshot => ({ dataset: source.dataset, snapshot, validation: source.validation }));
      contexts.set(cacheKey, result);
    }
    return result;
  };
  const active = payload.active, activeSource = resolve(active.source_hash);
  const { dataset, snapshot, validation } = await scoped(active.source_hash, active.filters);
  const samePeriods = (scope: WorkspaceSnapshot["report"]["scope"]) => decisionSignature({ previous: scope.previous_period, current: scope.current_period, mode: scope.comparison_mode }) === decisionSignature({ previous: snapshot.report.scope.previous_period, current: snapshot.report.scope.current_period, mode: snapshot.report.scope.comparison_mode });
  const decision = payload.decision ? await restoreDecision({ ...payload.decision, source_input: resolve(payload.decision.source_hash).input }, snapshot, active.revision, await scoped(payload.decision.source_hash, payload.decision.filters)) : emptyDecisionWorkspace();
  const actionWorkspace: ActionWorkspace = { contexts: [], items: structuredClone(payload.action_workspace.items), active_dataset_hash: snapshot.dataset_hash };
  if (payload.action_workspace.active_dataset_hash && payload.action_workspace.active_dataset_hash !== snapshot.dataset_hash) throw new Error("WORKSPACE_BINDING_MISMATCH");
  for (const saved of payload.action_workspace.contexts) {
    if (saved.scenarios.length || saved.actions.length) throw new Error("INVALID_ACTION_CONTEXT");
    const own = await scoped(saved.source_hash, saved.filters);
    if (own.snapshot.dataset_hash !== saved.dataset_hash || own.snapshot.filter_hash !== saved.filter_hash) throw new Error("WORKSPACE_BINDING_MISMATCH");
    const session = { ...createDecisionSession(own.dataset, own.snapshot, saved.revision, saved.filenames), stale: saved.stale, stale_reasons: saved.stale_reasons };
    if (actionContextId(session) !== saved.id) throw new Error("WORKSPACE_BINDING_MISMATCH");
    actionWorkspace.contexts.push({ id: saved.id, session, diagnostics: own.snapshot.report.diagnostics, source_input: structuredClone(resolve(saved.source_hash).input), source_mappings: saved.source_mappings });
  }
  const normalizedActions = normalizeActionWorkspace(actionWorkspace);
  actionDocuments(normalizedActions);
  const scenarioWorkspace = emptyScenarioWorkspace(payload.scenario_workspace.active_epoch);
  for (const saved of payload.scenario_workspace.contexts) {
    const own = await scoped(saved.source_hash, saved.filters);
    if (own.snapshot.dataset_hash !== saved.dataset_hash || own.snapshot.filter_hash !== saved.filter_hash) throw new Error("WORKSPACE_BINDING_MISMATCH");
    if (saved.status === "current" && (saved.dataset_hash !== snapshot.dataset_hash || !samePeriods(own.snapshot.report.scope))) throw new Error("SCENARIO_CONTEXT_MISMATCH");
    const session = { ...createDecisionSession(own.dataset, own.snapshot, saved.revision, saved.filenames), stale: saved.stale, stale_reasons: saved.stale_reasons };
    const plans = saved.plans.map(plan => {
      validateScenarioName(plan.name, plan.calculated);
      return { id: plan.id, revision: plan.revision, name: plan.name, inputs: plan.inputs, result: plan.calculated ? calculateScenario(session.baseline, plan.inputs) : null, ...("sensitivity" in plan && plan.sensitivity ? { sensitivity: structuredClone(plan.sensitivity) } : {}) };
    });
    const versions = saved.versions.map(plan => {
      validateScenarioName(plan.name);
      const result = calculateScenario(session.baseline, plan.inputs);
      if (result.status !== "valid") throw new Error("INVALID_SCENARIO_VERSION");
      return { plan_id: plan.plan_id, revision: plan.revision, name: plan.name, inputs: plan.inputs, result };
    });
    scenarioWorkspace.contexts.push({ id: saved.id, epoch: saved.epoch, status: saved.status, historical_reasons: saved.historical_reasons, session, source_input: structuredClone(resolve(saved.source_hash).input), source_mappings: saved.source_mappings, plans, versions });
  }
  validateScenarioWorkspace(scenarioWorkspace);
  let reviewSession: ReviewSession | null = null;
  if (payload.review_session) {
    const { source_hash: sourceHash, ...saved } = payload.review_session;
    const own = await scoped(sourceHash, saved.meeting_filters);
    if (sourceHash !== saved.dataset_hash || own.snapshot.data_as_of !== saved.data_as_of || own.snapshot.filter_hash !== saved.filter_hash) throw new Error("WORKSPACE_BINDING_MISMATCH");
    reviewSession = { ...saved, meeting_filters: own.snapshot.report.scope, source_input: structuredClone(resolve(sourceHash).input) };
    if (reviewSession.status === "current" && (reviewSession.epoch !== scenarioWorkspace.active_epoch || sourceHash !== snapshot.dataset_hash || !samePeriods(reviewSession.meeting_filters))) throw new Error("REVIEW_ACTIVE_CONTEXT_MISMATCH");
    validateReviewSession(reviewSession, scenarioWorkspace);
  }
  return { action_workspace: normalizedActions, scenario_workspace: scenarioWorkspace, review_session: reviewSession, input: structuredClone(activeSource.input), dataset, snapshot, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, decision, issues: validation.issues, classification: validation.classification as "valid" | "partial" };
}
