"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { createSnapshot } from '@/application/workspace';
import { createDecisionSession, decisionSignature, type DecisionWorkspaceState } from '@/application/decision';
import { copyHistoricalScenario, ensureScenarioContext, scenarioContextDecision, scenarioContextId, scenarioSelectionRef, updateScenarioContext, type ScenarioSelectionRef, type ScenarioSource, type ScenarioWorkspace } from '@/application/scenario-workspace';
import { formatMoney } from '@/application/presentation';
import { DecisionWorkbench } from './decision-workbench';
import type { EvidenceSelection } from './evidence-drawer';

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
    }).catch(() => { if (!cancelled) setFailure('此通路基準無法建立；原有方案仍保留，請檢查資料範圍。'); });
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
  return <section data-testid="multi-scenario-workbench">
    <section className="panel"><h2>各通路方案工作區</h2><p>每個資料版本、前後期與通路最多三方案。切換通路保留原稿；更換資料、期間或比較方式後，舊版本保留為歷史。不同通路與方案差額不相加。</p>
      <p>目前檢視：{channel ?? "全部通路（僅列各通路方案，不建立混合基準）"}</p>{!channel && <ul>{source.dataset.manifest.channels.map(name => <li key={name}>{name} {onChannelChange && <button type="button" className="button quiet" onClick={() => onChannelChange(name)}>編輯 {name} 方案</button>}<ul>{state.contexts.filter(row => row.status === "current" && row.epoch === epoch && row.session.scope.channels[0] === name).flatMap(row => row.plans.map(plan => <li key={`${row.id}-${plan.id}`}>{plan.name} · 版本 {plan.revision} · 條件貢獻 {formatMoney(plan.result?.contribution ?? null)}{onSelectForReview && plan.result?.status === "valid" && <button className="text-button" onClick={() => onSelectForReview(scenarioSelectionRef(row, plan.id))}>選用 {name} {plan.name}</button>}</li>))}</ul></li>)}</ul>}
      {channel && prepared?.key !== key && !failure && <p role="status">正在重建此通路的精確基準…</p>}
      {failure && <p role="alert">{failure}</p>}
      {channel && prepared?.key === key && !context && <button type="button" className="button primary" onClick={start}>建立 {channel} 方案工作區</button>}
      {!channel && onExport && <div className="button-row"><button className="button quiet" onClick={() => onExport('md')}>下載決策 Markdown</button><button className="button quiet" onClick={() => onExport('csv')}>下載決策 CSV</button><button className="button quiet" onClick={() => onExport('json')}>下載決策 JSON</button></div>}
    </section>
    {context && prepared && <>
      <DecisionWorkbench key={context.id} dataset={prepared.source.dataset} snapshot={prepared.source.snapshot} revision={context.session.revision} filenames={context.session.filenames} input={context.source_input} mappings={context.source_mappings} state={scenarioContextDecision(context)} setState={update} onEvidence={onEvidence} onExport={onExport} />
      {onSelectForReview && context.plans.some(plan => plan.result?.status === 'valid') && <section className="panel"><h3>選入主管會議</h3><p>同一通路選一個已計算版本；之後編輯會保留舊引用並提示重新選用。</p>{context.plans.filter(plan => plan.result?.status === 'valid').map(plan => <button key={plan.id} className="button quiet" type="button" onClick={() => onSelectForReview(scenarioSelectionRef(context, plan.id))}>選用 {plan.name} · 版本 {plan.revision}</button>)}</section>}
    </>}
    {state.contexts.some(row => row.status === 'historical') && <details className="panel"><summary>歷史通路工作稿</summary><p>歷史方案不自動回復成當前方案，亦不會併入會議的本期條件結果。</p>{state.contexts.filter(row => row.status === 'historical').map(row => <article key={row.id}><h3>{row.session.scope.channels.join('、')} · {row.session.period.start}～{row.session.period.end}</h3><p>歷史資料版本 {row.session.dataset_hash}</p><ul>{row.plans.map(plan => <li key={plan.id}>{plan.name} · 版本 {plan.revision} · 歷史條件貢獻 {formatMoney(plan.result?.contribution ?? null)}{channel === row.session.scope.channels[0] && prepared?.key === key && <button className="button quiet" type="button" disabled={(context?.plans.length ?? 0) >= 3} onClick={() => setState(previous => copyHistoricalScenario(previous, prepared.source, row.id, plan.id, crypto.randomUUID()))}>複製名稱到目前基準（清空假設）</button>}</li>)}</ul></article>)}</details>}
  </section>;
}
