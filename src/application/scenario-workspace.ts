import type { Dataset, DatasetInput } from '../domain/types';
import { calculateScenario, type ScenarioInputs, type ScenarioResult } from '../domain/scenarios';
import { blankScenarioInputs, createDecisionSession, decisionSignature, isDecisionStale, validateScenarioName, validateSensitivityInputs, type ColumnMappings, type DecisionSession, type DecisionWorkspaceState, type ScenarioPlan } from './decision';
import type { FilenameMap } from './export';
import type { WorkspaceSnapshot } from './workspace';

export interface ScenarioSource { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; revision: number; filenames?: FilenameMap; mappings?: ColumnMappings }
export interface VersionedScenarioPlan extends ScenarioPlan { revision: number }
export interface ScenarioPlanVersion { plan_id: string; revision: number; name: string; inputs: ScenarioInputs; result: ScenarioResult }
export interface ScenarioSelectionRef { context_id: string; plan_id: string; plan_revision: number; channel: string }
export interface ScenarioContext {
  id: string; epoch: string; status: 'current' | 'historical'; historical_reasons: string[];
  session: DecisionSession; source_input: DatasetInput; source_mappings?: ColumnMappings;
  plans: VersionedScenarioPlan[]; versions: ScenarioPlanVersion[];
}
export interface ScenarioWorkspace { schema_version: 'scenario-workspace-v1'; active_epoch: string; contexts: ScenarioContext[] }
export function emptyScenarioWorkspace(epoch = 'initial'): ScenarioWorkspace { return { schema_version: 'scenario-workspace-v1', active_epoch: epoch, contexts: [] }; }
export function scenarioContextId(epoch: string, session: DecisionSession): string { return `scenario-${epoch}-${session.dataset_hash}-${session.filter_hash}`; }
const equal = (a: unknown, b: unknown) => decisionSignature(a) === decisionSignature(b);
const validRevision = (n: number) => Number.isSafeInteger(n) && n > 0;
export function activateScenarioEpoch(workspace: ScenarioWorkspace, epoch: string): ScenarioWorkspace {
  if (!epoch.trim()) throw new Error('INVALID_SCENARIO_EPOCH');
  if (workspace.active_epoch === epoch) return workspace;
  // Epoch IDs are never reused: returning to a former period must not revive history.
  if (workspace.contexts.some(context => context.epoch === epoch)) throw new Error('SCENARIO_EPOCH_REUSED');
  return { ...workspace, active_epoch: epoch, contexts: workspace.contexts.map(context => ({ ...context, status: 'historical', historical_reasons: [...new Set([...context.historical_reasons, 'ANALYSIS_EPOCH_CHANGED'])] })) };
}
export function ensureScenarioContext(workspace: ScenarioWorkspace, source: ScenarioSource): ScenarioWorkspace {
  if (source.snapshot.report.scope.channels.length !== 1) throw new Error('SINGLE_CHANNEL_REQUIRED');
  const session = createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames);
  const id = scenarioContextId(workspace.active_epoch, session);
  const existing = workspace.contexts.find(context => context.id === id);
  if (existing) { if (existing.status !== 'current') throw new Error('HISTORICAL_SCENARIO'); return workspace; }
  return { ...workspace, contexts: [...workspace.contexts, { id, epoch: workspace.active_epoch, status: 'current', historical_reasons: [], session, source_input: structuredClone(source.input), source_mappings: structuredClone(source.mappings), plans: [], versions: [] }] };
}
export function scenarioContextDecision(context: ScenarioContext): DecisionWorkspaceState {
  return { captured: structuredClone(context.session), scenarios: structuredClone(context.plans), actions: [], source_input: structuredClone(context.source_input), source_mappings: structuredClone(context.source_mappings) };
}
/** Adapter for the existing single-channel editor. Incoming monetary results are always recomputed.
 * R5 版本號規則（02 §6、05 §8）：版本號只在「計算成功」時前進。新方案從下一個未用過的版本開始（一般是 1）；
 * 編輯（result 為 null）與未通過檢核的計算都不改版本號、不新增版本。計算成功時，若最新版本的假設與名稱都相同就沿用
 * 該版本；否則目前版本號已有紀錄 → 開新版本（最大版本 + 1），尚無紀錄 → 記在目前版本號。敏感度三組輸入只跟著方案保存，
 * 不影響版本號與 versions。
 */
export function updateScenarioContext(workspace: ScenarioWorkspace, id: string, decision: DecisionWorkspaceState): ScenarioWorkspace {
  const context = workspace.contexts.find(row => row.id === id);
  if (!context) throw new Error('UNKNOWN_SCENARIO_CONTEXT');
  if (context.status !== 'current' || context.epoch !== workspace.active_epoch) throw new Error('HISTORICAL_SCENARIO');
  if (!decision.captured || !equal(decision.captured, context.session)) throw new Error('SCENARIO_CONTEXT_MISMATCH');
  if (decision.scenarios.length > 3) throw new Error('MAX_SCENARIOS');
  if (new Set(decision.scenarios.map(plan => plan.id)).size !== decision.scenarios.length) throw new Error('INVALID_ITEM_ID');
  const versions = structuredClone(context.versions);
  const plans = decision.scenarios.map(plan => {
    if (!plan.id.trim()) throw new Error('INVALID_ITEM_ID');
    validateScenarioName(plan.name, plan.result !== null);
    if (plan.sensitivity !== undefined) validateSensitivityInputs(plan.sensitivity);
    const old = context.plans.find(row => row.id === plan.id);
    const own = versions.filter(v => v.plan_id === plan.id);
    const latest = own.reduce<ScenarioPlanVersion | undefined>((best, v) => !best || v.revision > best.revision ? v : best, undefined);
    const maxRevision = latest?.revision ?? 0;
    let revision = old ? old.revision : maxRevision + 1;
    const result = plan.result === null ? null : calculateScenario(context.session.baseline, plan.inputs);
    if (result?.status === 'valid') {
      if (latest && equal(latest.inputs, plan.inputs) && latest.name === plan.name) revision = latest.revision;
      else {
        if (own.some(v => v.revision === revision)) revision = maxRevision + 1;
        versions.push({ plan_id: plan.id, revision, name: plan.name, inputs: structuredClone(plan.inputs), result: structuredClone(result) });
      }
    }
    return { id: plan.id, name: plan.name, revision, inputs: structuredClone(plan.inputs), result, ...(plan.sensitivity !== undefined ? { sensitivity: structuredClone(plan.sensitivity) } : {}) };
  });
  return { ...workspace, contexts: workspace.contexts.map(row => row.id === id ? { ...row, plans, versions } : row) };
}
export function scenarioSelectionRef(context: ScenarioContext, planId: string): ScenarioSelectionRef {
  const plan = context.plans.find(row => row.id === planId);
  if (context.status !== 'current' || !plan || plan.result?.status !== 'valid') throw new Error('SCENARIO_NOT_SELECTABLE');
  return { context_id: context.id, plan_id: plan.id, plan_revision: plan.revision, channel: context.session.scope.channels[0] };
}
export function copyHistoricalScenario(workspace: ScenarioWorkspace, source: ScenarioSource, contextId: string, planId: string, newId: string): ScenarioWorkspace {
  const historical = workspace.contexts.find(context => context.id === contextId && context.status === 'historical');
  const original = historical?.plans.find(plan => plan.id === planId);
  if (!historical || !original || source.snapshot.report.scope.channels.length !== 1 || source.snapshot.report.scope.channels[0] !== historical.session.scope.channels[0]) throw new Error('HISTORICAL_SCENARIO_SCOPE_MISMATCH');
  const next = ensureScenarioContext(workspace, source);
  const id = scenarioContextId(next.active_epoch, createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames));
  const target = next.contexts.find(context => context.id === id)!;
  const decision = scenarioContextDecision(target);
  // 只沿用名稱：假設、結果與敏感度三組輸入都清空（不帶 sensitivity）。
  decision.scenarios.push({ id: newId, name: original.name, inputs: blankScenarioInputs(), result: null });
  return updateScenarioContext(next, id, decision);
}
export function resolveScenarioReference(workspace: ScenarioWorkspace, reference: ScenarioSelectionRef) {
  const context = workspace.contexts.find(row => row.id === reference.context_id);
  if (!context || context.session.scope.channels.length !== 1 || context.session.scope.channels[0] !== reference.channel) throw new Error('SCENARIO_REFERENCE_SCOPE_MISMATCH');
  const version = context.versions.find(row => row.plan_id === reference.plan_id && row.revision === reference.plan_revision);
  if (!version || version.result.status !== 'valid') throw new Error('SCENARIO_VERSION_MISSING');
  const plan = context.plans.find(row => row.id === reference.plan_id);
  const status = context.status !== 'current' || context.epoch !== workspace.active_epoch ? 'historical' as const : plan?.revision !== reference.plan_revision || plan.result?.status !== 'valid' ? 'superseded' as const : 'current' as const;
  return { context, version, status };
}
export function validateScenarioWorkspace(workspace: ScenarioWorkspace): void {
  if (workspace.schema_version !== 'scenario-workspace-v1' || !workspace.active_epoch.trim() || new Set(workspace.contexts.map(c => c.id)).size !== workspace.contexts.length) throw new Error('INVALID_SCENARIO_WORKSPACE');
  for (const context of workspace.contexts) {
    if (context.id !== scenarioContextId(context.epoch, context.session) || context.session.scope.channels.length !== 1 || (context.status === 'current' && (context.epoch !== workspace.active_epoch || context.session.stale))) throw new Error('SCENARIO_CONTEXT_MISMATCH');
    if (context.plans.length > 3 || new Set(context.plans.map(p => p.id)).size !== context.plans.length) throw new Error('MAX_SCENARIOS');
    const keys = context.versions.map(v => `${v.plan_id}:${v.revision}`);
    if (new Set(keys).size !== keys.length) throw new Error('DUPLICATE_SCENARIO_VERSION');
    for (const plan of context.plans) {
      if (!validRevision(plan.revision) || !plan.id.trim()) throw new Error('INVALID_SCENARIO_REVISION');
      validateScenarioName(plan.name, plan.result !== null);
      if (plan.sensitivity !== undefined) validateSensitivityInputs(plan.sensitivity);
      if (plan.result && !equal(plan.result, calculateScenario(context.session.baseline, plan.inputs))) throw new Error('SCENARIO_RESULT_MISMATCH');
      if (plan.result?.status === 'valid' && !context.versions.some(v => v.plan_id === plan.id && v.revision === plan.revision && equal(v.inputs, plan.inputs) && v.name === plan.name)) throw new Error('SCENARIO_VERSION_MISSING');
    }
    for (const version of context.versions) {
      if (!version.plan_id.trim() || !validRevision(version.revision) || version.result.status !== 'valid' || !equal(version.result, calculateScenario(context.session.baseline, version.inputs))) throw new Error('SCENARIO_RESULT_MISMATCH');
      validateScenarioName(version.name);
    }
  }
}
/** Old stale markers are authoritative history, including old channel-navigation staleness. */
export function migrateLegacyDecisionWorkspace(decision: DecisionWorkspaceState, active: WorkspaceSnapshot, revision: number, epoch: string): ScenarioWorkspace {
  const workspace = emptyScenarioWorkspace(epoch);
  if (!decision.captured || !decision.source_input || decision.captured.scope.channels.length !== 1) return workspace;
  const session = structuredClone(decision.captured);
  const historical = isDecisionStale(session, active, revision);
  const capturedEpoch = historical ? `legacy-${epoch}` : epoch;
  const plans = decision.scenarios.map(plan => ({ ...structuredClone(plan), revision: 1 }));
  const versions = plans.filter(plan => plan.result?.status === 'valid').map(plan => ({ plan_id: plan.id, revision: 1, name: plan.name, inputs: structuredClone(plan.inputs), result: structuredClone(plan.result!) }));
  workspace.contexts.push({ id: scenarioContextId(capturedEpoch, session), epoch: capturedEpoch, status: historical ? 'historical' : 'current', historical_reasons: historical ? ['LEGACY_STALE', ...session.stale_reasons] : [], session, source_input: structuredClone(decision.source_input), source_mappings: structuredClone(decision.source_mappings), plans, versions });
  return workspace;
}
