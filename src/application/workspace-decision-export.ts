import { actionDocuments, type ActionWorkspace } from './action-workspace';
import { createDecisionSession } from './decision';
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from './decision-export';
import { validateScenarioWorkspace, type ScenarioSource, type ScenarioWorkspace } from './scenario-workspace';
import type { ReviewSession } from './review-session';
import { labels } from '@/i18n';

/** Audit export is distinct from a portable backup: raw CSV never enters it. */
export function exportWorkspaceDecision(format: 'json' | 'md' | 'csv', source: ScenarioSource, scenarios: ScenarioWorkspace, actions: ActionWorkspace, review: ReviewSession | null): string {
  validateScenarioWorkspace(scenarios);
  const visibleChannels = source.snapshot.report.scope.channels;
  const selected = scenarios.contexts.find(context => context.status === 'current' && context.epoch === scenarios.active_epoch && visibleChannels.length === 1 && context.session.scope.channels[0] === visibleChannels[0]);
  const current = selected?.session ?? createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames);
  const currentPlans = selected?.plans ?? [];
  if (format === 'json') {
    const base = JSON.parse(exportDecisionJson(current, currentPlans, [], actions));
    return JSON.stringify({ ...base, export_version: 'workspace-decision-v2', analysis_epoch: scenarios.active_epoch,
      scenario_contexts: scenarios.contexts.map(context => ({ context_id: context.id, epoch: context.epoch, context_status: context.status, historical_reasons: context.historical_reasons,
        ...JSON.parse(exportDecisionJson({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, [])),
        plan_revisions: Object.fromEntries(context.plans.map(plan => [plan.id, plan.revision])), calculated_versions: context.versions,
      })),
      review: review ? { id: review.id, name: review.name, revision: review.revision, dataset_hash: review.dataset_hash, metric_version: review.metric_version, data_as_of: review.data_as_of, meeting_filters: review.meeting_filters, importance_threshold: review.importance_threshold, selected_scenarios: review.selected_scenarios, pinned_action_ids: review.pinned_action_ids, action_bindings: review.action_bindings, notes: review.notes, decision_state: review.decision_state, target_version: null, status: review.status } : null,
    }, null, 2)+'\n';
  }
  if (format === 'md') {
    const pieces = [exportDecisionMarkdown(current, currentPlans, [], actions), `\n${labels.ui.workspaceDecisionExport.appendixHeading}\n\n${labels.ui.workspaceDecisionExport.appendixNote}\n`];
    for (const context of scenarios.contexts) {
      pieces.push(exportDecisionMarkdown({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, []));
      // Context and plan ids are audit text; reuse the inert JSON formatter in a fenced block.
      pieces.push(`\n<details>\n<summary>${labels.sections.technicalDetails}</summary>\n\n`+'```json\n'+JSON.stringify({context_id:context.id,epoch:context.epoch,plan_revisions:Object.fromEntries(context.plans.map(plan=>[plan.id,plan.revision]))}).replaceAll('`','\\u0060').replaceAll('<','\\u003c')+'\n```\n\n</details>\n');
    }
    return pieces.join('\n');
  }
  actionDocuments(actions);
  const documents = [exportDecisionCsv(current, currentPlans, [], actions, selected ? { context_id: selected.id, epoch: selected.epoch, plan_revisions: Object.fromEntries(selected.plans.map(plan => [plan.id, plan.revision])) } : undefined)];
  for (const context of scenarios.contexts) {
    if (context.id === selected?.id) continue;
    const csv = exportDecisionCsv({ ...context.session, stale: context.status === 'historical' || context.session.stale }, context.plans, [], undefined, { context_id: context.id, epoch: context.epoch, plan_revisions: Object.fromEntries(context.plans.map(plan => [plan.id, plan.revision])) });
    documents.push(csv.slice(csv.indexOf('\n')+1));
  }
  return documents.join('');
}
