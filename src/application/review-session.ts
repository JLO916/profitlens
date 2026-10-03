import { isBusinessDate } from '../domain/date';
import type { DatasetInput } from '../domain/types';
import { validateDataset } from '../domain/validation';
import { actionDocuments, type ActionWorkspace } from './action-workspace';
import { decisionSignature, type ColumnMappings } from './decision';
import type { FilenameMap } from './export';
import { buildManagerSummary, type SummaryDecisionContext } from './manager-summary';
import { resolveScenarioReference, type ScenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from './scenario-workspace';
import { createSnapshot, hashInput, type WorkspaceSnapshot } from './workspace';
import { fill, labels } from '../i18n';
import { channelLabel, channelsLabel, demoAlias } from './copy';

export type ReviewDecisionState = 'draft' | 'adopted' | 'needs_data' | 'not_adopted';
export interface ReviewActionBinding { action_id: string; context_id: string; binding_revision: number }
export interface ReviewSession {
  schema_version: 'review-session-v1'; id: string; name: string; revision: number; epoch: string;
  dataset_hash: string; filter_hash: string; metric_version: WorkspaceSnapshot['metric_version']; data_as_of: string;
  meeting_filters: WorkspaceSnapshot['report']['scope']; importance_threshold: string;
  selected_scenarios: ScenarioSelectionRef[]; pinned_action_ids: string[]; action_bindings: ReviewActionBinding[];
  notes: string; decision_state: ReviewDecisionState; confirmed_revision: number | null; target_version: null;
  status: 'current' | 'historical'; source_input: DatasetInput; filenames: FilenameMap; source_mappings?: ColumnMappings;
  /** R6-2 會議日期（YYYY-MM-DD，臺北日曆日）；沒有時畫面與結束會議預設臺北今天。 */
  meeting_date?: string;
}
export const REVIEW_DECISION_LABELS: Record<ReviewDecisionState, string> = { draft: labels.meeting.decisions.draft, adopted: labels.meeting.decisions.adopted, needs_data: labels.meeting.decisions.need_data, not_adopted: labels.meeting.decisions.rejected };
const EXECUTION_STATUS_LABELS = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done } as const;
const ui = labels.ui.reviewSession;
export function createReviewSession(source: ScenarioSource, epoch: string, id = crypto.randomUUID()): ReviewSession {
  return { schema_version: 'review-session-v1', id, name: ui.defaultName, revision: 1, epoch, dataset_hash: source.snapshot.dataset_hash, filter_hash: source.snapshot.filter_hash, metric_version: source.snapshot.metric_version, data_as_of: source.snapshot.data_as_of, meeting_filters: structuredClone(source.snapshot.report.scope), importance_threshold: '0.00', selected_scenarios: [], pinned_action_ids: [], action_bindings: [], notes: '', decision_state: 'draft', confirmed_revision: null, target_version: null, status: 'current', source_input: structuredClone(source.input), filenames: structuredClone(source.filenames ?? {}), source_mappings: structuredClone(source.mappings) };
}
type ReviewPatch = Partial<Pick<ReviewSession, 'name' | 'importance_threshold' | 'notes' | 'decision_state' | 'meeting_date'>>;
function changed(review: ReviewSession, patch: Partial<ReviewSession>): ReviewSession {
  return { ...review, ...patch, revision: review.revision + 1, decision_state: 'draft', confirmed_revision: null };
}
export function updateReviewSession(review: ReviewSession, patch: ReviewPatch): ReviewSession {
  if (Object.keys(patch).some(key => !['name', 'importance_threshold', 'notes', 'decision_state', 'meeting_date'].includes(key))) throw new Error('INVALID_REVIEW_FIELD');
  if (Object.hasOwn(patch, 'meeting_date') && !isBusinessDate(patch.meeting_date)) throw new Error('INVALID_MEETING_DATE');
  const next = changed(review, patch);
  if (patch.importance_threshold !== undefined) {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(patch.importance_threshold)) throw new Error('INVALID_IMPORTANCE_THRESHOLD');
    const [whole, part = ''] = patch.importance_threshold.split('.'); next.importance_threshold = `${whole}.${part.padEnd(2, '0')}`;
  }
  if (patch.decision_state !== undefined) { next.decision_state = patch.decision_state; next.confirmed_revision = patch.decision_state === 'draft' ? null : next.revision; }
  validateReviewSession(next); return next;
}
export function refreshReviewSession(review: ReviewSession, epoch: string): ReviewSession {
  return review.status === 'historical' || review.epoch === epoch ? review : { ...review, status: 'historical', decision_state: 'draft', confirmed_revision: null };
}
export function refreshReviewScenarioReferences(review: ReviewSession, workspace: ScenarioWorkspace): ReviewSession {
  if (review.decision_state === 'draft') return review;
  const outdated = review.selected_scenarios.some(ref => resolveScenarioReference(workspace, ref).status !== 'current');
  return outdated ? changed(review, {}) : review;
}
export function reviewScenarioId(reference: ScenarioSelectionRef): string { return `${reference.context_id}::${reference.plan_id}::${reference.plan_revision}`; }
function referenceMatchesReview(review: ReviewSession, workspace: ScenarioWorkspace, ref: ScenarioSelectionRef): boolean {
  const { context } = resolveScenarioReference(workspace, ref);
  const scope = context.session.scope;
  return context.epoch === review.epoch && context.session.dataset_hash === review.dataset_hash && context.session.metric_version === review.metric_version && review.meeting_filters.channels.includes(ref.channel) && decisionSignature({ previous: scope.previous_period, current: scope.current_period, mode: scope.comparison_mode }) === decisionSignature({ previous: review.meeting_filters.previous_period, current: review.meeting_filters.current_period, mode: review.meeting_filters.comparison_mode });
}
export function selectReviewScenario(review: ReviewSession, workspace: ScenarioWorkspace, reference: ScenarioSelectionRef | null, channel?: string): ReviewSession {
  if (review.status !== 'current') throw new Error('HISTORICAL_REVIEW');
  const target = reference?.channel ?? channel;
  if (!target || !review.meeting_filters.channels.includes(target)) throw new Error('REVIEW_SCENARIO_SCOPE_MISMATCH');
  if (reference && (!referenceMatchesReview(review, workspace, reference) || resolveScenarioReference(workspace, reference).status !== 'current')) throw new Error('REVIEW_SCENARIO_NOT_CURRENT');
  const selected_scenarios = review.selected_scenarios.filter(row => row.channel !== target);
  if (reference) selected_scenarios.push(structuredClone(reference));
  return changed(review, { selected_scenarios });
}
/** Pins share the action workspace's order; existing IDs retain their original evidence binding. */
export function syncReviewPins(review: ReviewSession, workspace: ActionWorkspace): ReviewSession {
  const documents = actionDocuments(workspace);
  const pinned_action_ids = documents.filter(action => action.pinned).map(action => action.id);
  const action_bindings = review.action_bindings.filter(binding => documents.some(action => action.id === binding.action_id));
  for (const action of documents) if (!action_bindings.some(binding => binding.action_id === action.id)) action_bindings.push({ action_id: action.id, context_id: action.binding.context_id, binding_revision: action.binding_revision });
  const bindingChanged = action_bindings.some(binding => { const action = documents.find(row => row.id === binding.action_id); return action && (action.binding.context_id !== binding.context_id || action.binding_revision !== binding.binding_revision); });
  if (decisionSignature({ pinned_action_ids, action_bindings }) === decisionSignature({ pinned_action_ids: review.pinned_action_ids, action_bindings: review.action_bindings })) return bindingChanged && review.decision_state !== 'draft' ? changed(review, {}) : review;
  const next = changed(review, { pinned_action_ids, action_bindings }); validateReviewSession(next); return next;
}
export function refreshReviewActionReferences(review: ReviewSession, workspace: ActionWorkspace, ids: string[]): ReviewSession {
  if (review.status !== 'current') throw new Error('HISTORICAL_REVIEW');
  const documents = actionDocuments(workspace);
  const next = [...review.action_bindings];
  for (const id of ids) {
    const action = documents.find(row => row.id === id);
    const index = next.findIndex(row => row.action_id === id);
    if (!action || index < 0 || action.binding.dataset_hash !== review.dataset_hash) throw new Error('REVIEW_ACTION_SOURCE_MISMATCH');
    next[index] = { action_id: id, context_id: action.binding.context_id, binding_revision: action.binding_revision };
  }
  return changed(review, { action_bindings: next });
}
export function validateReviewSession(review: ReviewSession, workspace?: ScenarioWorkspace): void {
  if (review.schema_version !== 'review-session-v1' || !review.id.trim() || !review.epoch.trim() || !Number.isSafeInteger(review.revision) || review.revision < 1 || !review.name.trim() || review.name.length > 200 || review.notes.length > 8000 || review.target_version !== null || !Object.hasOwn(REVIEW_DECISION_LABELS, review.decision_state) || !['current', 'historical'].includes(review.status)) throw new Error('INVALID_REVIEW_SESSION');
  if (!/^(?:0|[1-9]\d*)\.\d{2}$/.test(review.importance_threshold) || review.importance_threshold.length > 30) throw new Error('INVALID_IMPORTANCE_THRESHOLD');
  if (review.meeting_date !== undefined && !isBusinessDate(review.meeting_date)) throw new Error('INVALID_REVIEW_SESSION');
  if (review.decision_state === 'draft' ? review.confirmed_revision !== null : review.confirmed_revision !== review.revision) throw new Error('REVIEW_CONFIRMATION_VERSION_MISMATCH');
  if (review.pinned_action_ids.length > 3 || new Set(review.pinned_action_ids).size !== review.pinned_action_ids.length || new Set(review.action_bindings.map(row => row.action_id)).size !== review.action_bindings.length || review.pinned_action_ids.some(id => !review.action_bindings.some(row => row.action_id === id))) throw new Error('INVALID_REVIEW_ACTION_BINDING');
  if (review.action_bindings.some(binding => !binding.action_id.trim() || !binding.context_id.trim() || !Number.isSafeInteger(binding.binding_revision) || binding.binding_revision < 1)) throw new Error('INVALID_REVIEW_ACTION_BINDING');
  if (new Set(review.selected_scenarios.map(row => row.channel)).size !== review.selected_scenarios.length || review.selected_scenarios.some(row => !review.meeting_filters.channels.includes(row.channel) || !Number.isSafeInteger(row.plan_revision) || row.plan_revision < 1)) throw new Error('INVALID_REVIEW_SCENARIO_REFERENCE');
  if (workspace && review.selected_scenarios.some(ref => !referenceMatchesReview(review, workspace, ref))) throw new Error('REVIEW_SCENARIO_SCOPE_MISMATCH');
  if (workspace && review.decision_state === 'adopted' && review.selected_scenarios.some(ref => resolveScenarioReference(workspace, ref).status !== 'current')) throw new Error('REVIEW_ADOPTED_STALE_SCENARIO');
}
export async function rebuildReviewSnapshot(review: ReviewSession): Promise<WorkspaceSnapshot> {
  validateReviewSession(review);
  const validation = validateDataset(review.source_input);
  if (!validation.dataset || validation.classification === 'blocking' || await hashInput(review.source_input) !== review.dataset_hash) throw new Error('REVIEW_SOURCE_MISMATCH');
  const snapshot = await createSnapshot(validation.dataset, review.meeting_filters, review.dataset_hash);
  if (snapshot.filter_hash !== review.filter_hash || snapshot.metric_version !== review.metric_version || snapshot.data_as_of !== review.data_as_of || decisionSignature(snapshot.report.scope) !== decisionSignature(review.meeting_filters)) throw new Error('REVIEW_SOURCE_MISMATCH');
  buildManagerSummary(snapshot, { importanceThreshold: review.importance_threshold });
  return snapshot;
}
export function buildReviewDecisionContext(review: ReviewSession, scenarios: ScenarioWorkspace, actions: ActionWorkspace): SummaryDecisionContext {
  validateReviewSession(review, scenarios);
  const documents = actionDocuments(actions);
  return {
    dataset_hash: review.dataset_hash, filter_hash: review.filter_hash, pinnedOnly: true,
    selectedScenarioIds: review.selected_scenarios.map(reviewScenarioId), reviewName: review.name, notes: review.notes, decisionState: REVIEW_DECISION_LABELS[review.decision_state],
    scenarios: review.selected_scenarios.map(ref => {
      const { context, version, status } = resolveScenarioReference(scenarios, ref);
      return { id: reviewScenarioId(ref), name: fill(ui.scenarioNameWithRevision, { name: version.name, revision: version.revision }), status: status === 'current' && review.status === 'current' ? 'current' : 'stale', scopeLabel: `${fill(ui.scenarioScope, { channel: channelLabel(ref.channel, demoAlias(context.session.dataset_id)), start: context.session.period.start, end: context.session.period.end })}${status === 'superseded' ? ` · ${ui.scenarioSuperseded}` : status === 'historical' ? ` · ${ui.scenarioHistorical}` : ''}`, baseline: context.session.baseline.amounts.contribution_after_marketing, contribution: version.result.contribution, delta: version.result.delta, binding: { context_id: context.id, plan_revision: version.revision, dataset_hash: context.session.dataset_hash, filter_hash: context.session.filter_hash, metric_version: context.session.metric_version, scenario_version: context.session.scenario_version, period: context.session.period, channels: context.session.scope.channels, sources: context.session.sources }, assumptions: [fill(ui.assumptionVolume, { value: version.inputs.volume_change_pct }), fill(ui.assumptionDiscount, { value: version.inputs.discount_change_pp }), fill(ui.assumptionFulfillment, { value: version.inputs.fulfillment_change_pct }), fill(ui.assumptionAdSpend, { value: version.inputs.ad_change_pct }), fill(ui.assumptionOneOff, { value: version.inputs.one_time_cost }), ...version.result.assumptions] };
    }),
    actions: review.action_bindings.map(binding => {
      const action = documents.find(row => row.id === binding.action_id);
      const bound = action && action.binding.context_id === binding.context_id && action.binding_revision === binding.binding_revision && action.binding.dataset_hash === review.dataset_hash;
      const historical = action?.binding_history.find(row => row.context_id === binding.context_id && row.revision === binding.binding_revision);
      const original = bound ? action.binding : historical;
      return { id: binding.action_id, problem: action?.problem || ui.actionProblemMissing, action: bound ? action.action : ui.actionUnbound, owner: bound ? action.owner_role : '', deadline: bound ? action.deadline : '', risk: bound ? action.stop_condition : '', pinned: review.pinned_action_ids.includes(binding.action_id), executionStatus: bound ? EXECUTION_STATUS_LABELS[action.execution_status] : undefined, executionNotes: bound ? action.progress_notes : undefined, status: !bound || review.status === 'historical' || action.status === 'stale' ? 'stale' : action.status === 'confirmed' ? 'current' : 'draft', scopeLabel: original ? fill(ui.actionScope, { channels: channelsLabel(original.scope.channels, demoAlias(action?.binding.dataset_id ?? '')), start: original.period.start, end: original.period.end }) : ui.actionScopeUnavailable };
    }),
  };
}
