"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { createSnapshot } from '@/application/workspace';
import { createDecisionSession, decisionSignature, type DecisionWorkspaceState } from '@/application/decision';
import { copyHistoricalScenario, ensureScenarioContext, scenarioContextDecision, scenarioContextId, scenarioSelectionRef, updateScenarioContext, type ScenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from '@/application/scenario-workspace';
import { formatMoney } from '@/application/presentation';
import { channelLabel, channelsLabel, demoAlias } from '@/application/copy';
import { fill, labels } from '@/i18n';
import { DecisionWorkbench } from './decision-workbench';
import type { EvidenceSelection } from './evidence-drawer';

const copy = labels.ui.multiScenarioWorkbench;
// 幾個模板值在字典裡帶著盤點筆記尾巴（「…（template）」「…（resultLabel = …）」），只取全形括號前的模板本體；字典清理後結果不變。
const template = (text: string) => text.split('（')[0];
const planResultLine = (plan: { name: string; result?: { contribution?: string | null } | null }, text: string) => fill(template(text), { plan: plan.name, resultLabel: labels.scenario.resultTitle, amount: formatMoney(plan.result?.contribution ?? null) });
const technicalPlanLine = (plans: readonly { id: string; name: string; revision: number }[]) => plans.map(plan => `${plan.name} · plan_id ${plan.id} · revision ${plan.revision}`).join('；');

export interface MultiScenarioWorkbenchProps {
  source: ScenarioSource; state: ScenarioWorkspace; setState: Dispatch<SetStateAction<ScenarioWorkspace>>;
  onEvidence: (selection: EvidenceSelection) => void;
  onSelectForReview?: (reference: ScenarioSelectionRef) => void;
  onExport?: (format: 'md' | 'csv' | 'json') => void;
  onChannelChange?: (channel: string) => void;
}
export function MultiScenarioWorkbench({ source, state, setState, onEvidence, onSelectForReview, onExport, onChannelChange }: MultiScenarioWorkbenchProps) {
  const [prepared, setPrepared] = useState<{ key: string; source: ScenarioSource; contextId: string } | null>(null);
  const [failure, setFailure] = useState('');
  const alias = demoAlias(source.dataset.manifest.dataset_id);
  const channel = source.snapshot.report.scope.channels.length === 1 ? source.snapshot.report.scope.channels[0] : null;
  const epoch = state.active_epoch;
  const key = decisionSignature({ epoch, hash: source.snapshot.dataset_hash, previous: source.snapshot.report.scope.previous_period, current: source.snapshot.report.scope.current_period, mode: source.snapshot.report.scope.comparison_mode, channel });
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    void createSnapshot(source.dataset, { ...source.snapshot.report.scope, channels: [channel] }, source.snapshot.dataset_hash).then(snapshot => {
      if (cancelled) return;
      const singleSource = { ...source, snapshot };
      const session = createDecisionSession(source.dataset, snapshot, source.revision, source.filenames);
      setPrepared({ key, source: singleSource, contextId: scenarioContextId(epoch, session) }); setFailure('');
    }).catch(() => { if (!cancelled) setFailure(copy.baselineFailed); });
    return () => { cancelled = true; };
  }, [source, channel, epoch, key]);
  const context = channel && prepared?.key === key ? state.contexts.find(row => row.id === prepared.contextId) : undefined;
  const start = () => {
    if (!prepared || prepared.key !== key) return;
    setState(previous => previous.active_epoch === epoch ? ensureScenarioContext(previous, prepared.source) : previous);
  };
  const update: Dispatch<SetStateAction<DecisionWorkspaceState>> = next => {
    if (!context) return;
    setState(previous => {
      const current = previous.contexts.find(row => row.id === context.id);
      if (!current) return previous;
      return updateScenarioContext(previous, current.id, typeof next === 'function' ? next(scenarioContextDecision(current)) : next);
    });
  };
  const currentPlansByChannel = (name: string) => state.contexts.filter(row => row.status === "current" && row.epoch === epoch && row.session.scope.channels[0] === name);
  return <section data-testid="multi-scenario-workbench">
    <section className="panel"><h2>{copy.heading}</h2><p>{copy.intro}</p>
      <p>{fill(template(copy.currentView), { channel: channel ? channelLabel(channel, alias) : labels.evidence.allChannels })}</p>{!channel && <ul>{source.dataset.manifest.channels.map(name => <li key={name}>{channelLabel(name, alias)} {onChannelChange && <button type="button" className="button quiet" onClick={() => onChannelChange(name)}>{fill(copy.editChannelPlans, { channel: channelLabel(name, alias) })}</button>}<ul>{currentPlansByChannel(name).flatMap(row => row.plans.map(plan => <li key={`${row.id}-${plan.id}`}>{planResultLine(plan, copy.planSummary)}{onSelectForReview && plan.result?.status === "valid" && <button className="text-button" onClick={() => onSelectForReview(scenarioSelectionRef(row, plan.id))}>{fill(template(copy.selectPlanForMeeting), { selectForMeeting: labels.buttons.selectForMeeting, channel: channelLabel(name, alias), plan: plan.name })}</button>}</li>))}</ul>{currentPlansByChannel(name).some(row => row.plans.length > 0) && <details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(currentPlansByChannel(name).flatMap(row => row.plans))}</p></details>}</li>)}</ul>}
      {channel && prepared?.key !== key && !failure && <p role="status">{copy.rebuildingBaseline}</p>}
      {failure && <p role="alert">{failure}</p>}
      {channel && prepared?.key === key && !context && <button type="button" className="button primary" onClick={start}>{fill(copy.startButton, { channel: channelLabel(channel, alias) })}</button>}
      {!channel && onExport && <div className="button-row"><button className="button quiet" onClick={() => onExport('md')}>{labels.downloads.decisionMd}</button><button className="button quiet" onClick={() => onExport('csv')}>{labels.downloads.decisionCsv}</button><button className="button quiet" onClick={() => onExport('json')}>{labels.downloads.decisionJson}</button></div>}
    </section>
    {context && prepared && <>
      <DecisionWorkbench key={context.id} dataset={prepared.source.dataset} snapshot={prepared.source.snapshot} revision={context.session.revision} filenames={context.session.filenames} input={context.source_input} mappings={context.source_mappings} state={scenarioContextDecision(context)} setState={update} onEvidence={onEvidence} onExport={onExport} />
      {onSelectForReview && context.plans.some(plan => plan.result?.status === 'valid') && <section className="panel"><h3>{labels.buttons.selectForMeeting}</h3><p>{copy.selectHint}</p>{context.plans.filter(plan => plan.result?.status === 'valid').map(plan => <button key={plan.id} className="button quiet" type="button" onClick={() => onSelectForReview(scenarioSelectionRef(context, plan.id))}>{fill(template(copy.selectPlanButton), { selectForMeeting: labels.buttons.selectForMeeting, plan: plan.name })}</button>)}<details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(context.plans.filter(plan => plan.result?.status === 'valid'))}</p></details></section>}
    </>}
    {state.contexts.some(row => row.status === 'historical') && <details className="panel"><summary>{copy.historyHeading}</summary><p>{copy.historyNote}</p>{state.contexts.filter(row => row.status === 'historical').map(row => <article key={row.id}><h3>{channelsLabel(row.session.scope.channels, alias)} · {row.session.period.start}～{row.session.period.end}</h3><p>{fill(copy.historyDatasetVersion, { hash: row.session.dataset_hash })}</p><ul>{row.plans.map(plan => <li key={plan.id}>{planResultLine(plan, copy.historyPlanSummary)}{channel === row.session.scope.channels[0] && prepared?.key === key && <button className="button quiet" type="button" disabled={(context?.plans.length ?? 0) >= 3} onClick={() => setState(previous => copyHistoricalScenario(previous, prepared.source, row.id, plan.id, crypto.randomUUID()))}>{copy.copyToCurrent}</button>}</li>)}</ul><details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(row.plans)}</p></details></article>)}</details>}
  </section>;
}
