import type { Dataset, DatasetInput, Scope, Diagnostic, Fact } from '@/domain/types';
import { isBusinessDate } from '@/domain/date';
import { validateDataset } from '@/domain/validation';
import { createDecisionSession, decisionSignature, validateActionContent, validateActionEvidence, type ActionCard, type ActionCardInput, type ColumnMappings, type DecisionSession } from './decision';
import type { FilenameMap } from './export';
import { createSnapshot, hashInput, type WorkspaceSnapshot } from './workspace';

export const MAX_PINNED_ACTIONS = 3;
export const ACTION_EXECUTION_STATUSES = ['not_started', 'in_progress', 'blocked', 'completed'] as const;
export type ActionExecutionStatus = typeof ACTION_EXECUTION_STATUSES[number];
export interface ActionContext { id: string; session: DecisionSession; diagnostics: Diagnostic[]; source_input: DatasetInput; source_mappings?: ColumnMappings }
export interface ActionBindingRecord { revision: number; context_id: string; scope: Scope; fact_ids: string[]; evidence_confirmed: boolean; legacy_review_required: boolean; diagnostic_id?: string }
export interface BoundAction {
  card: ActionCard; context_id: string; scope: Scope; pinned: boolean; diagnostic_id?: string;
  execution_status?: ActionExecutionStatus; progress_notes?: string; binding_revision?: number;
  binding_history?: ActionBindingRecord[]; legacy_review_required?: boolean;
  /** R5：執行狀態最後一次改變的日期（YYYY-MM-DD）；舊資料沒有就是 undefined，不補值。 */
  status_updated_at?: string;
}
export interface ActionWorkspace { contexts: ActionContext[]; items: BoundAction[]; active_dataset_hash?: string }
export interface ActionSource { dataset: Dataset; input: DatasetInput; snapshot: WorkspaceSnapshot; revision: number; filenames?: FilenameMap; mappings?: ColumnMappings }
export interface ActionRebindPreview {
  action_id: string; original_binding: string; target_dataset_hash: string; target_revision: number;
  target_context: ActionContext; fact_ids: string[]; facts: { before: Fact; after: Fact }[];
}
export function emptyActionWorkspace(): ActionWorkspace { return { contexts: [], items: [] }; }
export function actionContextId(session: DecisionSession): string { return `action-${session.revision}-${session.dataset_hash}-${session.filter_hash}`; }
export function contextFor(workspace: ActionWorkspace, item: Pick<BoundAction, 'context_id'>): ActionContext {
  const context = workspace.contexts.find(entry => entry.id === item.context_id);
  if (!context) throw new Error('ACTION_CONTEXT_MISSING');
  return context;
}
function needsLegacyReview(workspace: ActionWorkspace, item: BoundAction): boolean {
  return item.legacy_review_required ?? contextFor(workspace, item).session.stale;
}
/** Legacy stale is a review requirement, never silently upgraded by a view change. */
export function normalizeActionWorkspace(workspace: ActionWorkspace): ActionWorkspace {
  return { ...workspace, items: workspace.items.map(item => ({ ...item,
    execution_status: item.execution_status ?? 'not_started', progress_notes: item.progress_notes ?? '',
    binding_revision: item.binding_revision ?? 1, binding_history: item.binding_history ?? [],
    legacy_review_required: needsLegacyReview(workspace, item),
  })) };
}
/** View filters and their UI revision do not change captured evidence. */
export function refreshActionWorkspace(workspace: ActionWorkspace, snapshot: WorkspaceSnapshot, _revision: number): ActionWorkspace {
  void _revision;
  return { ...normalizeActionWorkspace(workspace), active_dataset_hash: snapshot.dataset_hash };
}
function captureContext(source: ActionSource): ActionContext {
  const session = createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames);
  return { id: actionContextId(session), session, diagnostics: structuredClone(source.snapshot.report.diagnostics), source_input: structuredClone(source.input), ...(source.mappings ? { source_mappings: structuredClone(source.mappings) } : {}) };
}
export function addActionDraft(workspace: ActionWorkspace, source: ActionSource, id: string, diagnosticId?: string): ActionWorkspace {
  if (!id.trim() || workspace.items.some(item => item.card.id === id)) throw new Error('INVALID_ITEM_ID');
  const refreshed = refreshActionWorkspace(workspace, source.snapshot, source.revision);
  const diagnostic = diagnosticId === undefined ? undefined : source.snapshot.report.diagnostics.find(item => item.id === diagnosticId);
  if (diagnosticId !== undefined && !diagnostic) throw new Error('UNKNOWN_DIAGNOSTIC');
  const captured = captureContext(source);
  const existing = refreshed.contexts.find(context => context.id === captured.id);
  const context = existing ?? captured;
  const card: ActionCard = { id, problem: diagnostic?.title ?? '', action: diagnostic?.recommendation ?? '', fact_ids: [...(diagnostic?.fact_ids ?? [])], owner_role: '', validation_metric: '', deadline: '', stop_condition: '', required_data: '', origin: 'manual', evidence_confirmed: false };
  validateActionEvidence(context.session, card, false);
  return { ...refreshed, contexts: existing ? refreshed.contexts : [...refreshed.contexts, context], items: [...refreshed.items, {
    card, context_id: context.id, scope: structuredClone(diagnostic?.scope ?? { kind: 'all', channels: context.session.scope.channels }), pinned: false,
    execution_status: 'not_started', progress_notes: '', binding_revision: 1, binding_history: [], legacy_review_required: context.session.stale,
    ...(diagnosticId ? { diagnostic_id: diagnosticId } : {}),
  }] };
}
export function evidenceAllowed(scope: Scope, fact: DecisionSession['facts'][number]): boolean {
  return fact.scope.channels.every(channel => scope.channels.includes(channel)) && (scope.kind !== 'sku' || fact.scope.kind === 'sku' && fact.scope.sku === scope.sku);
}
function validEvidence(context: ActionContext, item: Pick<BoundAction, 'card' | 'scope'>, required: boolean) {
  validateActionEvidence(context.session, item.card, required);
  if (item.card.fact_ids.some(id => !evidenceAllowed(item.scope, context.session.facts.find(fact => fact.id === id)!))) throw new Error('ACTION_FACT_SCOPE_MISMATCH');
}
function validateManagement(item: BoundAction) {
  validateActionContent(item.card, false);
  if (item.card.deadline && !isBusinessDate(item.card.deadline)) throw new Error('INVALID_ACTION_DEADLINE');
  if (item.execution_status !== undefined && !ACTION_EXECUTION_STATUSES.includes(item.execution_status) || item.progress_notes !== undefined && (typeof item.progress_notes !== 'string' || item.progress_notes.length > 2000)) throw new Error('INVALID_ACTION_FIELD');
  if (item.status_updated_at !== undefined && !isBusinessDate(item.status_updated_at)) throw new Error('INVALID_ACTION_FIELD');
  if (typeof item.card.evidence_confirmed !== 'boolean' || item.legacy_review_required !== undefined && typeof item.legacy_review_required !== 'boolean') throw new Error('INVALID_ACTION_CONFIRMATION');
}
function edit(workspace: ActionWorkspace, id: string, change: (item: BoundAction, context: ActionContext) => BoundAction): ActionWorkspace {
  const normalized = normalizeActionWorkspace(workspace);
  const item = normalized.items.find(entry => entry.card.id === id); if (!item) throw new Error('UNKNOWN_ACTION');
  return { ...normalized, items: normalized.items.map(entry => entry === item ? change(entry, contextFor(normalized, item)) : entry) };
}
function bindingRecord(workspace: ActionWorkspace, item: BoundAction): ActionBindingRecord {
  return structuredClone({ revision: item.binding_revision ?? 1, context_id: item.context_id, scope: item.scope, fact_ids: item.card.fact_ids,
    evidence_confirmed: item.card.evidence_confirmed, legacy_review_required: needsLegacyReview(workspace, item), ...(item.diagnostic_id ? { diagnostic_id: item.diagnostic_id } : {}) });
}
function retainBinding(workspace: ActionWorkspace, item: BoundAction): BoundAction {
  return { ...item, binding_revision: (item.binding_revision ?? 1) + 1, binding_history: [...(item.binding_history ?? []), bindingRecord(workspace, item)] };
}
export function editBoundAction(workspace: ActionWorkspace, id: string, patch: Partial<Omit<ActionCardInput, 'id'>>): ActionWorkspace {
  return edit(workspace, id, (item, context) => {
    const allowed = ['problem', 'fact_ids', 'action', 'owner_role', 'validation_metric', 'deadline', 'stop_condition', 'required_data'];
    if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('INVALID_ACTION_FIELD');
    const factsChanged = patch.fact_ids !== undefined && decisionSignature(patch.fact_ids) !== decisionSignature(item.card.fact_ids);
    const retained = factsChanged ? retainBinding(workspace, item) : item;
    const next = { ...retained, card: { ...item.card, ...structuredClone(patch), evidence_confirmed: factsChanged ? false : item.card.evidence_confirmed } };
    validateManagement(next); validEvidence(context, next, false); return next;
  });
}
/** today：狀態真的改變時寫入 status_updated_at（YYYY-MM-DD）；同狀態或只改進度紀錄不寫。 */
export function editActionManagement(workspace: ActionWorkspace, id: string, patch: Partial<Pick<BoundAction, 'execution_status' | 'progress_notes'>>, today: string = new Date().toISOString().slice(0, 10)): ActionWorkspace {
  return edit(workspace, id, item => {
    if (Object.keys(patch).some(key => !['execution_status', 'progress_notes'].includes(key))) throw new Error('INVALID_ACTION_FIELD');
    const statusChanged = patch.execution_status !== undefined && patch.execution_status !== item.execution_status;
    const next = { ...item, ...structuredClone(patch), ...(statusChanged ? { status_updated_at: today } : {}) }; validateManagement(next); return next;
  });
}
export function confirmBoundAction(workspace: ActionWorkspace, id: string): ActionWorkspace {
  return edit(workspace, id, (item, context) => { validateManagement(item); validEvidence(context, item, true); return { ...item, legacy_review_required: false, card: { ...item.card, evidence_confirmed: true } }; });
}
function semanticFactKey(fact: Fact): string { return decisionSignature({ metric: fact.metric, period: fact.period, scope: fact.scope }); }
/** Preview is local and inert. Rebuild the original periods/scope on the target source, never infer a new scope. */
export async function previewActionRebind(workspace: ActionWorkspace, id: string, source: ActionSource): Promise<ActionRebindPreview> {
  const item = workspace.items.find(entry => entry.card.id === id); if (!item) throw new Error('UNKNOWN_ACTION');
  const original = contextFor(workspace, item); validEvidence(original, item, true);
  const datasetHash = await hashInput(source.input);
  if (datasetHash !== source.snapshot.dataset_hash) throw new Error('ACTION_REBIND_PREVIEW_STALE');
  const validation = validateDataset(source.input); if (!validation.dataset || validation.classification === 'blocking') throw new Error('ACTION_REBIND_DATA_INVALID');
  const snapshot = await createSnapshot(validation.dataset, original.session.scope, datasetHash);
  let target = captureContext({ ...source, dataset: validation.dataset, snapshot });
  const existing = workspace.contexts.find(context => context.id === target.id);
  if (existing) {
    const withoutLegacyFreshness = (context: ActionContext) => ({ ...context, session: { ...context.session, stale: false, stale_reasons: [] } });
    if (decisionSignature(withoutLegacyFreshness(existing)) !== decisionSignature(withoutLegacyFreshness(target))) throw new Error('ACTION_CONTEXT_CONFLICT');
    target = structuredClone(existing);
  }
  const facts = item.card.fact_ids.map(id => {
    const before = original.session.facts.find(fact => fact.id === id)!;
    const candidates = target.session.facts.filter(fact => semanticFactKey(fact) === semanticFactKey(before));
    if (candidates.length !== 1 || !evidenceAllowed(item.scope, candidates[0])) throw new Error('ACTION_REBIND_FACT_UNAVAILABLE');
    return { before: structuredClone(before), after: structuredClone(candidates[0]) };
  });
  return { action_id: id, original_binding: decisionSignature(bindingRecord(workspace, item)), target_dataset_hash: datasetHash, target_revision: source.revision,
    target_context: target, fact_ids: facts.map(row => row.after.id), facts };
}
export async function commitActionRebind(workspace: ActionWorkspace, id: string, preview: ActionRebindPreview, source: ActionSource, accepted: boolean): Promise<ActionWorkspace> {
  if (accepted !== true) throw new Error('ACTION_REBIND_CONSENT_REQUIRED');
  let fresh: ActionRebindPreview;
  try { fresh = await previewActionRebind(workspace, id, source); } catch { throw new Error('ACTION_REBIND_PREVIEW_STALE'); }
  if (decisionSignature(fresh) !== decisionSignature(preview)) throw new Error('ACTION_REBIND_PREVIEW_STALE');
  const normalized = normalizeActionWorkspace(workspace); const item = normalized.items.find(entry => entry.card.id === id)!;
  const target = fresh.target_context; const existing = normalized.contexts.find(context => context.id === target.id);
  if (existing && decisionSignature(existing) !== decisionSignature(target)) throw new Error('ACTION_CONTEXT_CONFLICT');
  const diagnostic = item.diagnostic_id && target.diagnostics.some(entry => entry.id === item.diagnostic_id) ? item.diagnostic_id : undefined;
  const next: BoundAction = { ...retainBinding(normalized, item), context_id: target.id, legacy_review_required: false,
    diagnostic_id: diagnostic, card: { ...item.card, fact_ids: [...fresh.fact_ids], evidence_confirmed: true } };
  const result = { ...normalized, active_dataset_hash: source.snapshot.dataset_hash, contexts: existing ? normalized.contexts : [...normalized.contexts, target], items: normalized.items.map(entry => entry === item ? next : entry) };
  actionDocuments(result); return result;
}
/** Pin/order do not change evidence or manual execution status. */
export function pinAction(workspace: ActionWorkspace, id: string, pinned: boolean): ActionWorkspace {
  if (!workspace.items.some(item => item.card.id === id)) throw new Error('UNKNOWN_ACTION');
  if (pinned && workspace.items.filter(item => item.pinned && item.card.id !== id).length >= MAX_PINNED_ACTIONS) throw new Error('MAX_PINNED_ACTIONS');
  const items = workspace.items.map(item => item.card.id === id ? { ...item, pinned } : item);
  return { ...workspace, items: [...items.filter(item => item.pinned), ...items.filter(item => !item.pinned)] };
}
export function removeBoundAction(workspace: ActionWorkspace, id: string): ActionWorkspace {
  const items = workspace.items.filter(item => item.card.id !== id);
  const retained = new Set(items.flatMap(item => [item.context_id, ...(item.binding_history ?? []).map(binding => binding.context_id)]));
  return { ...workspace, items, contexts: workspace.contexts.filter(context => retained.has(context.id)) };
}
export function moveActionUp(workspace: ActionWorkspace, id: string): ActionWorkspace {
  const index = workspace.items.findIndex(item => item.card.id === id); if (index <= 0) return workspace;
  if (workspace.items[index - 1].pinned !== workspace.items[index].pinned) return workspace;
  const items = [...workspace.items]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; return { ...workspace, items };
}
function assertBinding(workspace: ActionWorkspace, binding: ActionBindingRecord) {
  const context = contextFor(workspace, binding); const s = context.session; const scope = binding.scope;
  if (!Number.isSafeInteger(binding.revision) || binding.revision < 1) throw new Error('INVALID_ACTION_BINDING_HISTORY');
  if (typeof binding.evidence_confirmed !== 'boolean' || typeof binding.legacy_review_required !== 'boolean') throw new Error('INVALID_ACTION_CONFIRMATION');
  validateActionEvidence(s, binding, binding.evidence_confirmed);
  if (!['all', 'channel', 'sku'].includes(scope.kind)) throw new Error('ACTION_SCOPE_MISMATCH');
  if (!scope.channels.length || new Set(scope.channels).size !== scope.channels.length || scope.channels.some(channel => !s.scope.channels.includes(channel)) || (scope.kind === 'sku' && !scope.sku)) throw new Error('ACTION_SCOPE_MISMATCH');
  if (scope.kind !== 'sku' && (scope.sku !== undefined || scope.category !== undefined) || scope.kind === 'channel' && scope.channels.length !== 1) throw new Error('ACTION_SCOPE_MISMATCH');
  if (scope.kind === 'sku' && !s.facts.some(fact => fact.scope.kind === 'sku' && fact.scope.sku === scope.sku && decisionSignature(fact.scope.channels) === decisionSignature(scope.channels) && (scope.category === undefined || fact.scope.category === scope.category))) throw new Error('ACTION_SCOPE_MISMATCH');
  if (binding.fact_ids.some(id => !evidenceAllowed(scope, s.facts.find(fact => fact.id === id)!))) throw new Error('ACTION_FACT_SCOPE_MISMATCH');
  if (binding.diagnostic_id) {
    const diagnostic = context.diagnostics.find(value => value.id === binding.diagnostic_id);
    if (!diagnostic || decisionSignature(diagnostic.scope) !== decisionSignature(scope)) throw new Error('INVALID_ACTION_DIAGNOSTIC');
  }
  return context;
}
function bindingDocument(workspace: ActionWorkspace, binding: ActionBindingRecord) {
  const context = assertBinding(workspace, binding); const s = context.session;
  return { ...structuredClone(binding), evidence: binding.fact_ids.map(id => structuredClone(s.facts.find(fact => fact.id === id)!)),
    dataset_id: s.dataset_id, dataset_hash: s.dataset_hash, filter_hash: s.filter_hash, metric_version: s.metric_version, data_as_of: s.data_as_of,
    period: structuredClone(s.period), analysis_scope: structuredClone(s.scope), filenames: structuredClone(s.filenames) };
}
/** Every historical reference is context + fact ID; same fact ID across datasets cannot overwrite a value. */
export function actionDocuments(workspace: ActionWorkspace) {
  if (workspace.items.some(item => !item.card.id.trim()) || workspace.contexts.some(context => !context.id.trim())) throw new Error('INVALID_ITEM_ID');
  if (new Set(workspace.items.map(item => item.card.id)).size !== workspace.items.length || new Set(workspace.contexts.map(item => item.id)).size !== workspace.contexts.length) throw new Error('INVALID_ITEM_ID');
  if (workspace.items.filter(item => item.pinned).length > MAX_PINNED_ACTIONS) throw new Error('MAX_PINNED_ACTIONS');
  return workspace.items.map((item, index) => {
    validateManagement(item);
    const binding = bindingRecord(workspace, item); const context = assertBinding(workspace, binding); const s = context.session;
    const history = item.binding_history ?? [];
    if (history.length !== binding.revision - 1 || history.some((entry, position) => entry.revision !== position + 1)) throw new Error('INVALID_ACTION_BINDING_HISTORY');
    const legacy = needsLegacyReview(workspace, item);
    return { ...structuredClone(item.card), priority: index + 1, pinned: item.pinned, status: legacy ? 'stale' as const : item.card.evidence_confirmed ? 'confirmed' as const : 'draft' as const,
      execution_status: item.execution_status ?? 'not_started', progress_notes: item.progress_notes ?? '', status_updated_at: item.status_updated_at ?? null, evidence_review_required: legacy,
      evidence_relation: workspace.active_dataset_hash && workspace.active_dataset_hash !== s.dataset_hash ? 'historical' as const : 'current' as const,
      data_limitations: structuredClone(context.diagnostics.find(diagnostic => diagnostic.id === item.diagnostic_id)?.limitations ?? []),
      diagnostic_id: item.diagnostic_id ?? null, evidence: item.card.fact_ids.map(id => structuredClone(s.facts.find(fact => fact.id === id)!)),
      binding_revision: binding.revision, binding_history: history.map(entry => bindingDocument(workspace, entry)),
      binding: { context_id: context.id, status: legacy ? 'stale' as const : 'current' as const, dataset_id: s.dataset_id, dataset_hash: s.dataset_hash, filter_hash: s.filter_hash, metric_version: s.metric_version,
        data_as_of: s.data_as_of, revision: s.revision, period: s.period, scope: structuredClone(item.scope), analysis_scope: s.scope, comparison: s.comparison, filenames: s.filenames, stale_reasons: legacy ? s.stale_reasons : [] } };
  });
}
/** R5 看板：所有待辦用過的負責人（trim 後非空、去重）；越後面的待辦越前面，當作「最近用過」。 */
export function knownOwners(workspace: ActionWorkspace): string[] {
  const owners: string[] = [];
  for (const item of [...workspace.items].reverse()) {
    const owner = item.card.owner_role.trim();
    if (owner && !owners.includes(owner)) owners.push(owner);
  }
  return owners;
}
/** R5 看板：依執行狀態分四欄，欄內保持 items 的順序（置頂在前）；沒有狀態（或無法辨識）的舊資料視為未開始。 */
export function boardColumns(workspace: ActionWorkspace): Record<ActionExecutionStatus, BoundAction[]> {
  const columns = Object.fromEntries(ACTION_EXECUTION_STATUSES.map(status => [status, [] as BoundAction[]])) as Record<ActionExecutionStatus, BoundAction[]>;
  for (const item of workspace.items) (ACTION_EXECUTION_STATUSES.includes(item.execution_status as ActionExecutionStatus) ? columns[item.execution_status!] : columns.not_started).push(item);
  return columns;
}
/** R5 證據清單：勾選／取消一筆引用，結果依可選數據的順序排列；不在可選清單內的既有引用保留在後（交給驗證決定）。 */
export function toggleEvidenceId(selected: readonly string[], id: string, checked: boolean, order: readonly string[]): string[] {
  const wanted = new Set(selected.filter(value => value !== id));
  if (checked) wanted.add(id);
  const ordered = order.filter(value => wanted.has(value));
  return [...ordered, ...[...wanted].filter(value => !order.includes(value))];
}
/** R5 證據清單：已勾的永遠顯示；未勾的依文字搜尋（不分大小寫、前後空白不計）過濾，保持原順序。 */
export function filterEvidenceChoices<T extends { id: string }>(choices: readonly T[], selected: readonly string[], query: string, text: (choice: T) => string): T[] {
  const needle = query.trim().toLowerCase();
  return choices.filter(choice => selected.includes(choice.id) || !needle || text(choice).toLowerCase().includes(needle));
}
