import { z } from "zod";
import { validateDataset } from "@/domain/validation";
import { calculateScenario, SCENARIO_VERSION } from "@/domain/scenarios";
import type { AnalysisFilters, Dataset, DatasetInput, ValidationResult } from "@/domain/types";
import { createDecisionSession, decisionSignature, emptyDecisionWorkspace, refreshDecisionSession, validateActionContent, validateActionEvidence, validateScenarioName, type ColumnMappings, type DecisionWorkspaceState } from "./decision";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "./workspace";
import type { FilenameMap } from "./export";
import { actionContextId, actionDocuments, emptyActionWorkspace, type ActionWorkspace } from "./action-workspace";
import { MAX_CSV_BYTES } from "@/lib/csv";

export const WORKSPACE_VERSION = "profitlens-workspace-v2";
/** Total portable size cap includes active data, retained historical contexts, and JSON escaping. */
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
export interface WorkspaceBackupSource {
  input: DatasetInput; filters: AnalysisFilters; id: string; revision: number;
  filenames?: FilenameMap; mappings?: ColumnMappings; decision: DecisionWorkspaceState; action_workspace?: ActionWorkspace;
}
export interface RestoredWorkspace extends Omit<WorkspaceBackupSource, "filters"> {
  action_workspace: ActionWorkspace;
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
const envelopeSchema = z.strictObject({
  schema_version: z.enum(["profitlens-workspace-v1", WORKSPACE_VERSION]), metric_version: z.literal("contribution-v1"), scenario_version: z.literal(SCENARIO_VERSION),
  saved_at: z.iso.datetime(), checksum: hash,
  payload: z.strictObject({ active: z.strictObject({ input, filters, id: name, revision, filenames, mappings }), decision: savedDecision.nullable(), action_workspace: savedActionWorkspace.optional() }),
});
type SavedDecision = z.infer<typeof savedDecision>;

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
function uniqueIds(items: readonly { id: string }[]): void {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("INVALID_ITEM_ID");
}
function assertSafeStructure(value: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > 250_000 || item.depth > 32) throw new Error("INVALID_WORKSPACE_FORMAT");
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
    return { id: plan.id, name: plan.name, inputs: structuredClone(plan.inputs), result: plan.calculated ? calculateScenario(session.baseline, plan.inputs) : null };
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
  const current = source.decision.captured;
  let decision: unknown = null;
  if (current) {
    if (!source.decision.source_input) throw new Error("WORKSPACE_DECISION_SOURCE_MISSING");
    const captured = refreshDecisionSession(current, snapshot, source.revision);
    decision = {
      source_input: portableInput(source.decision.source_input), ...(source.decision.source_mappings ? { source_mappings: source.decision.source_mappings } : {}),
      filters: captured.scope, filenames: captured.filenames, dataset_hash: captured.dataset_hash, filter_hash: captured.filter_hash,
      revision: captured.revision, stale: captured.stale, stale_reasons: captured.stale_reasons,
      scenarios: source.decision.scenarios.map(plan => ({ id: plan.id, name: plan.name, inputs: plan.inputs, calculated: plan.result !== null })),
      actions: source.decision.actions,
    };
  } else if (source.decision.scenarios.length || source.decision.actions.length) throw new Error("WORKSPACE_DECISION_SOURCE_MISSING");
  let actionWorkspace: unknown = undefined;
  if (source.action_workspace) {
    actionDocuments(source.action_workspace);
    actionWorkspace = { items: source.action_workspace.items, contexts: source.action_workspace.contexts.map(context => {
      const session = refreshDecisionSession(context.session, snapshot, source.revision);
      return { id: context.id, source_input: portableInput(context.source_input), ...(context.source_mappings ? {source_mappings:context.source_mappings}:{}), filters:session.scope, filenames:session.filenames, dataset_hash:session.dataset_hash, filter_hash:session.filter_hash, revision:session.revision, stale:session.stale, stale_reasons:session.stale_reasons, scenarios:[], actions:[] };
    }) };
  }
  const body = {
    schema_version: WORKSPACE_VERSION, metric_version: "contribution-v1", scenario_version: SCENARIO_VERSION, saved_at: new Date().toISOString(),
    payload: { active: { input: activeInput, filters: snapshot.report.scope, id: source.id, revision: source.revision, filenames: source.filenames ?? {}, mappings: source.mappings ?? {} }, decision, ...(actionWorkspace ? {action_workspace:actionWorkspace}:{}) },
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
    if (![WORKSPACE_VERSION,"profitlens-workspace-v1"].includes(String(versions.schema_version)) || versions.metric_version !== "contribution-v1" || versions.scenario_version !== SCENARIO_VERSION) throw new Error("WORKSPACE_VERSION_UNSUPPORTED");
  }
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) throw new Error("INVALID_WORKSPACE_FORMAT");
  const { checksum: expected, ...body } = result.data;
  let actual: string;
  try { actual = await checksum(body); } catch { throw new Error("INVALID_WORKSPACE_FORMAT"); }
  if (actual !== expected) throw new Error("WORKSPACE_CHECKSUM_MISMATCH");
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
      const restored=await restoreDecision(context,snapshot,active.revision,rebuilt);
      if(!restored.captured || actionContextId(restored.captured)!==context.id)throw new Error("WORKSPACE_BINDING_MISMATCH");
      actionWorkspace.contexts.push({id:context.id,session:restored.captured,diagnostics:rebuilt.snapshot.report.diagnostics,source_input:context.source_input,...(context.source_mappings?{source_mappings:context.source_mappings}:{})});
    }
    actionWorkspace.items=structuredClone(saved.items);
    actionDocuments(actionWorkspace);
  } else if(decision.captured && decision.source_input && decision.actions.length) {
    const id=actionContextId(decision.captured);
    const rebuilt=await rebuild(decision.source_input,decision.captured.scope);
    actionWorkspace={contexts:[{id,session:decision.captured,diagnostics:rebuilt.snapshot.report.diagnostics,source_input:decision.source_input,source_mappings:decision.source_mappings}],items:decision.actions.map((card,index)=>({card,context_id:id,scope:{kind:"all",channels:decision.captured!.scope.channels},pinned:index<3}))};
  }
  return { action_workspace:actionWorkspace, input: active.input, dataset, snapshot, id: active.id, revision: active.revision, filenames: active.filenames, mappings: active.mappings, decision, issues: validation.issues, classification: validation.classification as "valid" | "partial" };
}
