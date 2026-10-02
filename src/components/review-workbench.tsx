"use client";

import { useEffect, useState } from 'react';
import type { Diagnostic } from '@/domain/types';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput, type WorkspaceSnapshot } from '@/application/workspace';
import { decisionSignature } from '@/application/decision';
import { actionDocuments, type ActionWorkspace } from '@/application/action-workspace';
import { formatMoney } from '@/application/presentation';
import { scenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from '@/application/scenario-workspace';
import { buildReviewDecisionContext, createReviewSession, refreshReviewActionReferences, REVIEW_DECISION_LABELS, reviewScenarioId, selectReviewScenario, syncReviewPins, updateReviewSession, validateReviewSession, type ReviewDecisionState, type ReviewSession } from '@/application/review-session';
import { ManagerSummary } from './manager-summary';
import type { EvidenceSelection } from './evidence-drawer';

export interface ReviewWorkbenchProps {
  source: ScenarioSource; scenarioWorkspace: ScenarioWorkspace; review: ReviewSession | null;
  onChange: (review: ReviewSession) => void; actionWorkspace: ActionWorkspace;
  onEvidence: (selection: EvidenceSelection, review: ReviewSession) => void;
  onCreateAction?: (diagnostic: Diagnostic, review: ReviewSession) => void;
  onRefreshSource?: () => void;
}
export function ReviewWorkbench({ source, scenarioWorkspace, review, onChange, actionWorkspace, onEvidence, onCreateAction, onRefreshSource }: ReviewWorkbenchProps) {
  const [error, setError] = useState('');
  function apply(patch: Parameters<typeof updateReviewSession>[1]) {
    if (!review) return;
    try { const next = updateReviewSession(review, patch); validateReviewSession(next, scenarioWorkspace); onChange(next); setError(''); } catch { setError('會議內容未套用，請檢查名稱、金額門檻或文字長度；採用前須重新選用目前有效方案。'); }
  }
  if (!review) return <section className="panel" data-testid="review-workbench"><h2>主管會議工作稿</h2><p>建立一份綁定目前資料與期間的會議稿；之後切換檢視不會改動會議來源。</p><button type="button" className="button primary" onClick={() => onChange(syncReviewPins(createReviewSession(source, scenarioWorkspace.active_epoch), actionWorkspace))}>建立本次會議稿</button></section>;
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
    <section className="panel"><h2>會議設定與決策</h2><p>單份可恢復會議稿 · {review.status === 'historical' ? '歷史來源，需明確更新' : '來源已固定'} · {review.meeting_filters.channels.join('、')} · 目標版本：未設定</p>
      {viewDiffers && <p className="alert partial" data-testid="review-view-difference">會議稿與目前檢視不同：會議採用 {review.meeting_filters.channels.join('、')}，本期 {review.meeting_filters.current_period.start}～{review.meeting_filters.current_period.end}；目前檢視 {source.snapshot.report.scope.channels.join('、')}，本期 {source.snapshot.report.current.period.start}～{source.snapshot.report.current.period.end}。{source.snapshot.dataset_hash !== review.dataset_hash ? '資料版本亦不同，會議仍保留原始資料。' : '會議仍使用固定範圍。'}</p>}
      <p className="note">切換一般檢視不改會議範圍。更新來源會清空所選方案與決策，保留會議名稱、備註及門檻；舊情境仍在歷史工作稿。</p>
      <button type="button" className="button quiet" onClick={refresh}>以目前資料與範圍更新會議來源</button>
      <label>會議名稱<input maxLength={200} value={review.name} onChange={event => apply({ name: event.target.value })} /></label>
      <label>會議備註<textarea maxLength={8000} value={review.notes} onChange={event => apply({ notes: event.target.value })} /></label>
      <label>會議決策<select aria-label="會議決策" value={review.decision_state} onChange={event => apply({ decision_state: event.target.value as ReviewDecisionState })}>{Object.entries(REVIEW_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <p className="note">這是人工決策紀錄；採用或行動完成均不表示已產生商業成效。方案、門檻或備註更動後需重新指定決策。</p>
      {review.meeting_filters.channels.map(channel => {
        const reference = review.selected_scenarios.find(row => row.channel === channel);
        const rows = options.filter(row => row.session.scope.channels[0] === channel).flatMap(row => row.plans.filter(plan => plan.result?.status === 'valid').map(plan => ({ label: `${plan.name}（版本 ${plan.revision}）`, reference: scenarioSelectionRef(row, plan.id) })));
        const retained = reference && !rows.some(row => reviewScenarioId(row.reference) === reviewScenarioId(reference));
        return <label key={channel}>{channel} 本次摘要所選方案<select aria-label={`${channel} 本次摘要所選方案`} disabled={review.status === 'historical'} value={reference ? reviewScenarioId(reference) : ''} onChange={event => { try { const selected = rows.find(row => reviewScenarioId(row.reference) === event.target.value); onChange(selectReviewScenario(review, scenarioWorkspace, selected?.reference ?? null, channel)); setError(''); } catch { setError('此方案版本或來源已變更，請重新計算後選用。'); } }}><option value="">尚未選擇</option>{retained && <option value={reviewScenarioId(reference)} disabled>已保留舊版引用，待重新選用</option>}{rows.map(row => <option key={reviewScenarioId(row.reference)} value={reviewScenarioId(row.reference)}>{row.label}</option>)}</select></label>;
      })}
      {error && <p role="alert">{error}</p>}
      {review.action_bindings.map(binding => {
        const action = actions.find(row => row.id === binding.action_id);
        if (!action || action.binding.context_id === binding.context_id && action.binding_revision === binding.binding_revision) return null;
        return <div className="alert partial" key={binding.action_id}><p>{action.problem || '行動'}：會議引用證據版本 {binding.binding_revision}；行動目前版本 {action.binding_revision}。下方摘要保持原引用，未自動沿用新證據。</p><button className="button quiet" disabled={review.status !== 'current' || action.binding.dataset_hash !== review.dataset_hash} onClick={() => { try { onChange(refreshReviewActionReferences(review, actionWorkspace, [binding.action_id])); setError(''); } catch { setError('行動與會議資料不同，請先更新會議來源並核對證據。'); } }}>更新會議行動引用：{action.problem || action.id}</button></div>;
      })}
      {context.scenarios.some(plan => plan.status === 'stale') && <details><summary>保留的舊方案版本（不作本期決策）</summary><ul>{context.scenarios.filter(plan => plan.status === 'stale').map(plan => <li key={plan.id}>{plan.name} · {plan.scopeLabel} · 原條件貢獻 {formatMoney(plan.contribution ?? null)}<ul>{plan.assumptions.map(text => <li key={text}>{text}</li>)}</ul></li>)}</ul></details>}
    </section>
    <FixedReviewSummary review={review} context={context} onEvidence={onEvidence} onCreateAction={onCreateAction} onThresholdChange={value => apply({ importance_threshold: value })} />
  </section>;
}

function FixedReviewSummary({ review, context, onEvidence, onCreateAction, onThresholdChange }: {
  review: ReviewSession; context: ReturnType<typeof buildReviewDecisionContext>;
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
    })().catch(() => { if (!cancelled) setError('會議原始資料無法重新驗證，暫不顯示數字；目前分析仍可使用。'); });
    return () => { cancelled = true; };
  }, [source_input, meeting_filters, dataset_hash, filter_hash, data_as_of, metric_version, key]);
  if (error) return <p role="alert">{error}</p>;
  if (!loaded || loaded.hash !== key) return <p role="status">正在重建會議固定來源…</p>;
  return <ManagerSummary key={`${review.id}-${key}`} snapshot={loaded.snapshot} decisionContext={context} selectionManaged reviewControls={{ importanceThreshold: review.importance_threshold, onThresholdChange }} onEvidence={selection => onEvidence(selection, review)} onCreateAction={onCreateAction ? diagnostic => onCreateAction(diagnostic, review) : undefined} />;
}
