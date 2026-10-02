"use client";

import { useEffect, useState } from 'react';
import type { Diagnostic } from '@/domain/types';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput, type WorkspaceSnapshot } from '@/application/workspace';
import type { TaxConversion } from '@/application/tax-basis';
import { decisionSignature } from '@/application/decision';
import { actionDocuments, type ActionWorkspace } from '@/application/action-workspace';
import { formatMoney } from '@/application/presentation';
import { channelLabel, channelsLabel, demoAlias } from '@/application/copy';
import { fill, labels } from '@/i18n';
import { scenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from '@/application/scenario-workspace';
import { buildReviewDecisionContext, createReviewSession, refreshReviewActionReferences, REVIEW_DECISION_LABELS, reviewScenarioId, selectReviewScenario, syncReviewPins, updateReviewSession, validateReviewSession, type ReviewDecisionState, type ReviewSession } from '@/application/review-session';
import { ManagerSummary } from './manager-summary';
import type { EvidenceSelection } from './evidence-drawer';

const copy = labels.ui.reviewWorkbench;
// 決議選項文字由 labels.meeting.decisions 提供；ReviewDecisionState 的鍵名（needs_data／not_adopted）與字典鍵（need_data／rejected）不同，此處只做顯示對照，不改機器值。
const decisionLabels: Record<ReviewDecisionState, string> = { draft: labels.meeting.decisions.draft, adopted: labels.meeting.decisions.adopted, needs_data: labels.meeting.decisions.need_data, not_adopted: labels.meeting.decisions.rejected };

export interface ReviewWorkbenchProps {
  source: ScenarioSource; scenarioWorkspace: ScenarioWorkspace; review: ReviewSession | null;
  onChange: (review: ReviewSession) => void; actionWorkspace: ActionWorkspace;
  onEvidence: (selection: EvidenceSelection, review: ReviewSession) => void;
  onCreateAction?: (diagnostic: Diagnostic, review: ReviewSession) => void;
  onRefreshSource?: () => void;
  /** R3：目前資料的含稅換算摘要；只在會議鎖定的資料與目前資料相同時帶進主管摘要 Markdown。 */
  conversion?: TaxConversion | null;
}
export function ReviewWorkbench({ source, scenarioWorkspace, review, onChange, actionWorkspace, onEvidence, onCreateAction, onRefreshSource, conversion }: ReviewWorkbenchProps) {
  const [error, setError] = useState('');
  const alias = demoAlias(source.snapshot.report.dataset_id);
  function apply(patch: Parameters<typeof updateReviewSession>[1]) {
    if (!review) return;
    try { const next = updateReviewSession(review, patch); validateReviewSession(next, scenarioWorkspace); onChange(next); setError(''); } catch { setError(copy.applyError); }
  }
  if (!review) return <section className="panel" data-testid="review-workbench"><h2>{labels.nav.meeting.label}</h2><p>{copy.createIntro}</p><button type="button" className="button primary" onClick={() => onChange(syncReviewPins(createReviewSession(source, scenarioWorkspace.active_epoch), actionWorkspace))}>{copy.createButton}</button></section>;
  const context = buildReviewDecisionContext(review, scenarioWorkspace, actionWorkspace);
  const actions = actionDocuments(actionWorkspace);
  const viewDiffers = source.snapshot.dataset_hash !== review.dataset_hash || source.snapshot.filter_hash !== review.filter_hash;
  const options = scenarioWorkspace.contexts.filter(row => row.status === 'current' && row.epoch === review.epoch && row.session.dataset_hash === review.dataset_hash && decisionSignature({ previous: row.session.scope.previous_period, current: row.session.scope.current_period, mode: row.session.scope.comparison_mode }) === decisionSignature({ previous: review.meeting_filters.previous_period, current: review.meeting_filters.current_period, mode: review.meeting_filters.comparison_mode }));
  const refresh = () => {
    if (onRefreshSource) { onRefreshSource(); return; }
    const next = createReviewSession(source, scenarioWorkspace.active_epoch, review.id);
    onChange(syncReviewPins({ ...next, name: review.name, notes: review.notes, importance_threshold: review.importance_threshold, revision: review.revision + 1 }, actionWorkspace));
  };
  return <section data-testid="review-workbench">
    <section className="panel"><h2>{labels.nav.meeting.label}</h2><p>{fill(copy.sourceLine, { sourceStatus: review.status === 'historical' ? copy.sourceHistorical : copy.sourceFixed, channels: channelsLabel(review.meeting_filters.channels, alias) })}</p>
      {viewDiffers && <p className="alert partial" data-testid="review-view-difference">{fill(copy.viewDifference, { meetingChannels: channelsLabel(review.meeting_filters.channels, alias), meetingStart: review.meeting_filters.current_period.start, meetingEnd: review.meeting_filters.current_period.end, viewChannels: channelsLabel(source.snapshot.report.scope.channels, alias), viewStart: source.snapshot.report.current.period.start, viewEnd: source.snapshot.report.current.period.end, datasetNote: source.snapshot.dataset_hash !== review.dataset_hash ? copy.viewDifferenceDataset : copy.viewDifferenceScope })}</p>}
      <button type="button" className="button quiet" onClick={refresh}>{labels.buttons.updateMeetingSource}</button>
      <details className="note"><summary>{labels.sections.technicalDetails}</summary><p>{copy.refreshHint}</p></details>
      <label>{labels.meeting.name}<input maxLength={200} value={review.name} onChange={event => apply({ name: event.target.value })} /></label>
      <label>{labels.meeting.notes}<textarea maxLength={8000} value={review.notes} onChange={event => apply({ notes: event.target.value })} /></label>
      <label>{labels.meeting.decision}<select aria-label={labels.meeting.decision} value={review.decision_state} onChange={event => apply({ decision_state: event.target.value as ReviewDecisionState })}>{Object.entries(REVIEW_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{decisionLabels[value as ReviewDecisionState] ?? label}</option>)}</select></label>
      <p className="note">{labels.sections.caution}：{labels.meeting.decisionNote}</p>
      {review.meeting_filters.channels.map(channel => {
        const reference = review.selected_scenarios.find(row => row.channel === channel);
        const rows = options.filter(row => row.session.scope.channels[0] === channel).flatMap(row => row.plans.filter(plan => plan.result?.status === 'valid').map(plan => ({ label: fill(copy.planOption, { name: plan.name }), reference: scenarioSelectionRef(row, plan.id) })));
        const retained = reference && !rows.some(row => reviewScenarioId(row.reference) === reviewScenarioId(reference));
        const selectLabel = fill(copy.scenarioSelect, { channel: channelLabel(channel, alias) });
        return <label key={channel}>{selectLabel}<select aria-label={selectLabel} disabled={review.status === 'historical'} value={reference ? reviewScenarioId(reference) : ''} onChange={event => { try { const selected = rows.find(row => reviewScenarioId(row.reference) === event.target.value); onChange(selectReviewScenario(review, scenarioWorkspace, selected?.reference ?? null, channel)); setError(''); } catch { setError(copy.scenarioChangedError); } }}><option value="">{copy.notSelected}</option>{retained && <option value={reviewScenarioId(reference)} disabled>{copy.retainedOption}</option>}{rows.map(row => <option key={reviewScenarioId(row.reference)} value={reviewScenarioId(row.reference)}>{row.label}</option>)}</select></label>;
      })}
      {error && <p role="alert">{error}</p>}
      {review.action_bindings.map(binding => {
        const action = actions.find(row => row.id === binding.action_id);
        if (!action || action.binding.context_id === binding.context_id && action.binding_revision === binding.binding_revision) return null;
        const name = action.problem || copy.actionFallback;
        return <div className="alert partial" key={binding.action_id}><p>{fill(copy.actionDrift, { problem: name })}</p><button className="button quiet" disabled={review.status !== 'current' || action.binding.dataset_hash !== review.dataset_hash} onClick={() => { try { onChange(refreshReviewActionReferences(review, actionWorkspace, [binding.action_id])); setError(''); } catch { setError(copy.actionDataMismatchError); } }}>{fill(copy.refreshActionRef, { name })}</button><details><summary>{labels.sections.technicalDetails}</summary><p>action_id: {action.id} · binding_revision: {binding.binding_revision} → {action.binding_revision}</p></details></div>;
      })}
      {context.scenarios.some(plan => plan.status === 'stale') && <details><summary>{copy.staleScenarios}</summary><ul>{context.scenarios.filter(plan => plan.status === 'stale').map(plan => <li key={plan.id}>{fill(copy.staleScenarioRow, { name: plan.name, scope: plan.scopeLabel, resultLabel: labels.scenario.resultTitle, amount: formatMoney(plan.contribution ?? null) })}<ul>{plan.assumptions.map(text => <li key={text}>{text}</li>)}</ul></li>)}</ul></details>}
    </section>
    <FixedReviewSummary review={review} context={context} conversion={source.snapshot.dataset_hash === review.dataset_hash ? conversion ?? null : null} onEvidence={onEvidence} onCreateAction={onCreateAction} onThresholdChange={value => apply({ importance_threshold: value })} />
  </section>;
}

function FixedReviewSummary({ review, context, conversion, onEvidence, onCreateAction, onThresholdChange }: {
  review: ReviewSession; context: ReturnType<typeof buildReviewDecisionContext>; conversion: TaxConversion | null;
  onEvidence: ReviewWorkbenchProps['onEvidence']; onCreateAction?: ReviewWorkbenchProps['onCreateAction']; onThresholdChange: (value: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ hash: string; snapshot: WorkspaceSnapshot } | null>(null);
  const [error, setError] = useState('');
  const { source_input, meeting_filters, dataset_hash, filter_hash, data_as_of, metric_version } = review;
  const key = `${dataset_hash}-${filter_hash}`;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = validateDataset(source_input);
      if (!result.dataset || result.classification === 'blocking' || await hashInput(source_input) !== dataset_hash) throw new Error('REVIEW_SOURCE_MISMATCH');
      const snapshot = await createSnapshot(result.dataset, meeting_filters, dataset_hash);
      if (snapshot.filter_hash !== filter_hash || snapshot.data_as_of !== data_as_of || snapshot.metric_version !== metric_version) throw new Error('REVIEW_SOURCE_MISMATCH');
      if (!cancelled) { setLoaded({ hash: key, snapshot }); setError(''); }
    })().catch(() => { if (!cancelled) setError(copy.sourceRebuildError); });
    return () => { cancelled = true; };
  }, [source_input, meeting_filters, dataset_hash, filter_hash, data_as_of, metric_version, key]);
  if (error) return <p role="alert">{error}</p>;
  if (!loaded || loaded.hash !== key) return <p role="status">{copy.rebuilding}</p>;
  return <ManagerSummary key={`${review.id}-${key}`} snapshot={loaded.snapshot} conversion={conversion} decisionContext={context} selectionManaged reviewControls={{ importanceThreshold: review.importance_threshold, onThresholdChange }} onEvidence={selection => onEvidence(selection, review)} onCreateAction={onCreateAction ? diagnostic => onCreateAction(diagnostic, review) : undefined} />;
}
