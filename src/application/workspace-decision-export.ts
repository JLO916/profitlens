import { actionDocuments, type ActionWorkspace } from './action-workspace';
import { createDecisionSession } from './decision';
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from './decision-export';
import { validateScenarioWorkspace, type ScenarioSource, type ScenarioWorkspace, type VersionedScenarioPlan } from './scenario-workspace';
import type { ReviewSession } from './review-session';
import { labels } from '@/i18n';
import { conversionSentence } from './copy';
import type { TaxConversion } from './tax-basis';

/** 版本號只屬於已計算（result 非 null）的方案；草稿的 revision 指向上一個已計算版本，不列入，另列在 draft_plan_ids。 */
const planRevisions = (plans: readonly VersionedScenarioPlan[]) => Object.fromEntries(plans.filter(plan => plan.result !== null).map(plan => [plan.id, plan.revision]));
const draftPlanIds = (plans: readonly VersionedScenarioPlan[]) => plans.filter(plan => plan.result === null).map(plan => plan.id);

/**
 * Audit export is distinct from a portable backup: raw CSV never enters it.
 * selectedContextId：試算頁正在編輯的 context（R5 試算頁通路獨立於全站篩選）；是目前分析期的 current context 時，「目前」區段用它，否則退回依全站範圍挑選。
 */
export function exportWorkspaceDecision(format: 'json' | 'md' | 'csv', source: ScenarioSource, scenarios: ScenarioWorkspace, actions: ActionWorkspace, review: ReviewSession | null, conversion: TaxConversion | null = null, selectedContextId?: string | null, datasetName?: string): string {
  validateScenarioWorkspace(scenarios);
  // R3：含稅換算一句只掛在與目前資料同一版本的區段（歷史情境可能來自另一批資料）。
  const converted = conversionSentence(conversion);
  const extraFor = (session: { dataset_hash: string }): string[] => converted && session.dataset_hash === source.snapshot.dataset_hash ? [converted] : [];
  // V3-7 §7.9：版頭的資料集名稱只套在與目前資料同一版本的區段（歷史 context 可能來自另一批資料，維持 dataset_id）。
  const nameFor = (session: { dataset_hash: string }) => datasetName && session.dataset_hash === source.snapshot.dataset_hash ? { datasetName } : {};
  const visibleChannels = source.snapshot.report.scope.channels;
  const focused = selectedContextId ? scenarios.contexts.find(context => context.id === selectedContextId && context.status === 'current' && context.epoch === scenarios.active_epoch) : undefined;
  const selected = focused ?? scenarios.contexts.find(context => context.status === 'current' && context.epoch === scenarios.active_epoch && visibleChannels.length === 1 && context.session.scope.channels[0] === visibleChannels[0]);
  const current = selected?.session ?? createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames);
  const currentPlans = selected?.plans ?? [];
  if (format === 'json') {
    const base = JSON.parse(exportDecisionJson(current, currentPlans, [], actions, extraFor(current)));
    return JSON.stringify({ ...base, export_version: 'workspace-decision-v2', analysis_epoch: scenarios.active_epoch,
      scenario_contexts: scenarios.contexts.map(context => ({ context_id: context.id, epoch: context.epoch, context_status: context.status, historical_reasons: context.historical_reasons,
        ...JSON.parse(exportDecisionJson({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, [], undefined, extraFor(context.session))),
        plan_revisions: planRevisions(context.plans), draft_plan_ids: draftPlanIds(context.plans), calculated_versions: context.versions,
      })),
      review: review ? { id: review.id, name: review.name, revision: review.revision, dataset_hash: review.dataset_hash, metric_version: review.metric_version, data_as_of: review.data_as_of, meeting_filters: review.meeting_filters, importance_threshold: review.importance_threshold, selected_scenarios: review.selected_scenarios, pinned_action_ids: review.pinned_action_ids, action_bindings: review.action_bindings, notes: review.notes, decision_state: review.decision_state, target_version: null, status: review.status } : null,
    }, null, 2)+'\n';
  }
  if (format === 'md') {
    const pieces = [exportDecisionMarkdown(current, currentPlans, [], actions, extraFor(current), nameFor(current)), `\n${labels.exports.workspaceDecision.appendixHeading}\n\n${labels.exports.workspaceDecision.appendixNote}\n`];
    for (const context of scenarios.contexts) {
      pieces.push(exportDecisionMarkdown({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, [], undefined, extraFor(context.session), nameFor(context.session)));
      // Context and plan ids are audit text; reuse the inert JSON formatter in a fenced block.
      pieces.push(`\n<details>\n<summary>${labels.evidence.sections.technicalDetails}</summary>\n\n`+'```json\n'+JSON.stringify({context_id:context.id,epoch:context.epoch,plan_revisions:planRevisions(context.plans),draft_plan_ids:draftPlanIds(context.plans)}).replaceAll('`','\\u0060').replaceAll('<','\\u003c')+'\n```\n\n</details>\n');
    }
    return pieces.join('\n');
  }
  actionDocuments(actions);
  const documents = [exportDecisionCsv(current, currentPlans, [], actions, selected ? { context_id: selected.id, epoch: selected.epoch, plan_revisions: planRevisions(selected.plans) } : undefined, extraFor(current))];
  for (const context of scenarios.contexts) {
    if (context.id === selected?.id) continue;
    const csv = exportDecisionCsv({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, [], undefined, { context_id: context.id, epoch: context.epoch, plan_revisions: planRevisions(context.plans) }, extraFor(context.session));
    documents.push(csv.slice(csv.indexOf('\n')+1));
  }
  return documents.join('');
}
