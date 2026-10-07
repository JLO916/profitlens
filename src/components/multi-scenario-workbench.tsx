"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createSnapshot } from '@/application/workspace';
import { createDecisionSession, decisionSignature, type DecisionWorkspaceState } from '@/application/decision';
import { copyHistoricalScenario, ensureScenarioContext, scenarioContextDecision, scenarioContextId, scenarioSelectionRef, updateScenarioContext, type ScenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from '@/application/scenario-workspace';
import { formatAmountL1 } from '@/application/presentation';
import { channelLabel, channelsLabel, demoAlias } from '@/application/copy';
import { fill, labels } from '@/i18n';
import { DecisionWorkbench } from './decision-workbench';
import type { EvidenceSelection } from './evidence-drawer';

const copy = labels.ui.multiScenarioWorkbench;
// V3-2b：其他通路與歷史方案的一行結果用 L1（萬）。
const planResultLine = (plan: { name: string; result?: { contribution?: string | null } | null }, text: string) => fill(text, { plan: plan.name, resultLabel: labels.scenario.resultTitle, amount: formatAmountL1(plan.result?.contribution ?? null) });
const technicalPlanLine = (plans: readonly { id: string; name: string; revision: number }[]) => plans.map(plan => `${plan.name} · plan_id ${plan.id} · revision ${plan.revision}`).join('；');

const form = labels.scenarioForm;
interface PreparedChannel { key: string; source: ScenarioSource; contextId: string }

export interface MultiScenarioWorkbenchProps {
  source: ScenarioSource; state: ScenarioWorkspace; setState: Dispatch<SetStateAction<ScenarioWorkspace>>;
  onEvidence: (selection: EvidenceSelection) => void;
  onSelectForReview?: (reference: ScenarioSelectionRef) => void;
  onExport?: (format: 'md' | 'csv' | 'json') => void;
  /** 回報本頁正在編輯的 scenario context id（尚未寫入 state 時是預計的 id）；決策匯出的「目前」區段以它為準。 */
  onContextChange?: (contextId: string | null) => void;
  /** V3-6：本頁是否正顯示（Dashboard 把試算工作台一直掛著、用 hidden 切換）。只有 active 時才把「試算通路」與「匯出本頁」portal 進頁首 #page-actions。 */
  active?: boolean;
}
/**
 * R5-3 進頁即表單：本頁自己選一個通路（不改全站篩選），預設＝全站範圍只有一個通路時的那個通路，否則第一個通路。
 * 單通路快照：全站範圍剛好就是該通路時直接沿用，否則另建；scenario context 與「方案 1」在第一次編輯或計算時才寫入 state。
 */
export function MultiScenarioWorkbench({ source, state, setState, onEvidence, onSelectForReview, onExport, onContextChange }: MultiScenarioWorkbenchProps) {
  const [built, setBuilt] = useState<PreparedChannel | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ scope: string; channel: string } | null>(null);
  const alias = demoAlias(source.dataset.manifest.dataset_id);
  const channels = source.dataset.manifest.channels;
  const scope = source.snapshot.report.scope;
  // 全站通路範圍改變時，本頁回到新的預設通路：範圍一變就丟掉本頁的選擇（A→B→A 不會讓 A 時期的選擇復活）。
  const scopeKey = decisionSignature(scope.channels);
  const [choiceScope, setChoiceScope] = useState(scopeKey);
  if (choiceScope !== scopeKey) { setChoiceScope(scopeKey); setChoice(null); }
  const fallback = scope.channels.length === 1 && channels.includes(scope.channels[0]) ? scope.channels[0] : channels[0] ?? null;
  const channel = choice && choice.scope === scopeKey && channels.includes(choice.channel) ? choice.channel : fallback;
  const epoch = state.active_epoch;
  const key = decisionSignature({ epoch, hash: source.snapshot.dataset_hash, previous: scope.previous_period, current: scope.current_period, mode: scope.comparison_mode, channel });
  const direct = channel !== null && scope.channels.length === 1 && scope.channels[0] === channel;
  const directPrepared = useMemo<PreparedChannel | null>(() => direct ? { key, source, contextId: scenarioContextId(epoch, createDecisionSession(source.dataset, source.snapshot, source.revision, source.filenames)) } : null, [direct, key, source, epoch]);
  useEffect(() => {
    if (!channel || direct) return;
    let cancelled = false;
    void createSnapshot(source.dataset, { ...source.snapshot.report.scope, channels: [channel] }, source.snapshot.dataset_hash).then(snapshot => {
      if (cancelled) return;
      const singleSource = { ...source, snapshot };
      const session = createDecisionSession(source.dataset, snapshot, source.revision, source.filenames);
      setBuilt({ key, source: singleSource, contextId: scenarioContextId(epoch, session) }); setFailedKey(null);
    }).catch(() => { if (!cancelled) setFailedKey(key); });
    return () => { cancelled = true; };
  }, [source, channel, direct, epoch, key]);
  const prepared = directPrepared ?? (built?.key === key ? built : null);
  const preparedContextId = prepared?.contextId ?? null;
  useEffect(() => {
    onContextChange?.(preparedContextId);
    return () => onContextChange?.(null);
  }, [onContextChange, preparedContextId]);
  const failure = !prepared && failedKey === key;
  const context = prepared ? state.contexts.find(row => row.id === prepared.contextId) : undefined;
  const draftState: DecisionWorkspaceState | null = prepared && !context ? { captured: null, scenarios: [], actions: [], source_input: prepared.source.input, source_mappings: prepared.source.mappings } : null;
  /** 寫入時才建立 scenario context（ensureScenarioContext），之後與既有 context 相同：一律經 updateScenarioContext。 */
  const update: Dispatch<SetStateAction<DecisionWorkspaceState>> = next => {
    if (!prepared) return;
    setState(previous => {
      if (previous.active_epoch !== epoch) return previous;
      const workspace = previous.contexts.some(row => row.id === prepared.contextId) ? previous : ensureScenarioContext(previous, prepared.source);
      const current = workspace.contexts.find(row => row.id === prepared.contextId);
      if (!current || current.status !== 'current') return previous;
      const decision = typeof next === 'function' ? next(scenarioContextDecision(current)) : next;
      return updateScenarioContext(workspace, current.id, { ...decision, captured: decision.captured ?? current.session });
    });
  };
  const currentPlansByChannel = (name: string) => state.contexts.filter(row => row.status === "current" && row.epoch === epoch && row.session.scope.channels[0] === name);
  const others = channels.filter(name => name !== channel);
  return <section data-testid="multi-scenario-workbench">
    <section className="panel scenario-channel-panel"><h2>{copy.heading}</h2><p>{copy.intro}</p>
      <label className="scenario-channel">{form.channel}<select data-testid="scenario-channel" aria-label={form.channel} value={channel ?? ''} onChange={event => setChoice({ scope: scopeKey, channel: event.target.value })}>{channels.map(name => <option key={name} value={name}>{channelLabel(name, alias)}</option>)}</select></label>
      <p className="note">{form.channelHint}</p>
      {channel && !prepared && !failure && <p role="status">{copy.rebuildingBaseline}</p>}
      {failure && <p role="alert">{copy.baselineFailed}</p>}
    </section>
    {prepared && <DecisionWorkbench key={prepared.contextId} dataset={prepared.source.dataset} snapshot={prepared.source.snapshot} revision={context ? context.session.revision : prepared.source.revision} filenames={context ? context.session.filenames : prepared.source.filenames} input={context ? context.source_input : prepared.source.input} mappings={context ? context.source_mappings : prepared.source.mappings} state={context ? scenarioContextDecision(context) : draftState!} setState={update} onEvidence={onEvidence} onExport={onExport} />}
    {context && onSelectForReview && context.plans.some(plan => plan.result?.status === 'valid') && <section className="panel"><h3>{labels.buttons.selectForMeeting}</h3><p>{copy.selectHint}</p>{context.plans.filter(plan => plan.result?.status === 'valid').map(plan => <button key={plan.id} className="button quiet" type="button" onClick={() => onSelectForReview(scenarioSelectionRef(context, plan.id))}>{fill(copy.selectPlanButton, { selectForMeeting: labels.buttons.selectForMeeting, plan: plan.name })}</button>)}<details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(context.plans.filter(plan => plan.result?.status === 'valid'))}</p></details></section>}
    {others.length > 0 && <details className="panel scenario-other-channels" data-testid="scenario-other-channels"><summary>{form.otherChannels}</summary><ul>{others.map(name => { const rows = currentPlansByChannel(name); const plans = rows.flatMap(row => row.plans); return <li key={name}><strong>{channelLabel(name, alias)}</strong> <button type="button" className="text-button" onClick={() => setChoice({ scope: scopeKey, channel: name })}>{fill(copy.editChannelPlans, { channel: channelLabel(name, alias) })}</button>{plans.length ? <ul>{rows.flatMap(row => row.plans.map(plan => <li key={`${row.id}-${plan.id}`}>{planResultLine(plan, copy.planSummary)}{onSelectForReview && plan.result?.status === "valid" && <button className="text-button" onClick={() => onSelectForReview(scenarioSelectionRef(row, plan.id))}>{fill(copy.selectPlanForMeeting, { selectForMeeting: labels.buttons.selectForMeeting, channel: channelLabel(name, alias), plan: plan.name })}</button>}</li>))}</ul> : <p className="note">{form.otherChannelsEmpty}</p>}{plans.length > 0 && <details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(plans)}</p></details>}</li>; })}</ul></details>}
    {state.contexts.some(row => row.status === 'historical') && <details className="panel"><summary>{copy.historyHeading}</summary><p>{copy.historyNote}</p>{state.contexts.filter(row => row.status === 'historical').map(row => <article key={row.id}><h3>{channelsLabel(row.session.scope.channels, alias)} · {row.session.period.start}～{row.session.period.end}</h3><details><summary>{labels.sections.technicalDetails}</summary><p>{fill(copy.historyDatasetVersion, { hash: row.session.dataset_hash })}</p></details><ul>{row.plans.map(plan => <li key={plan.id}>{planResultLine(plan, copy.historyPlanSummary)}{channel === row.session.scope.channels[0] && prepared?.key === key && <button className="button quiet" type="button" disabled={(context?.plans.length ?? 0) >= 3} onClick={() => setState(previous => copyHistoricalScenario(previous, prepared.source, row.id, plan.id, crypto.randomUUID()))}>{copy.copyToCurrent}</button>}</li>)}</ul><details><summary>{labels.sections.technicalDetails}</summary><p>{technicalPlanLine(row.plans)}</p></details></article>)}</details>}
  </section>;
}
