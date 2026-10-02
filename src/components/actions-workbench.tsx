"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Fact } from '@/domain/types';
import { actionDocuments, addActionDraft, confirmBoundAction, contextFor, editActionManagement, editBoundAction, evidenceAllowed, moveActionUp, pinAction, removeBoundAction, previewActionRebind, commitActionRebind, type ActionContext, type ActionSource, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus } from '@/application/action-workspace';
import { formatMoney, formatRate, metricDefinitions } from '@/application/presentation';
import { channelsLabel, demoAlias, scopeLabel } from '@/application/copy';
import { fill, labels } from '@/i18n';
import type { EvidenceSelection } from './evidence-drawer';
const ui = labels.ui.actionsWorkbench;
const fields = [['problem', labels.actions.problem], ['action', labels.actions.step], ['owner_role', labels.actions.owner], ['validation_metric', labels.actions.metric], ['deadline', labels.actions.due], ['stop_condition', labels.actions.stop], ['required_data', labels.actions.extraData]] as const;
function factValue(f: Fact) { const def = metricDefinitions[f.metric]; return f.value === null ? labels.status.missing : def.unit === 'money' ? formatMoney(f.value) : def.unit === 'percent' ? formatRate(f.value) : f.value; }
const statuses = [['not_started', labels.actions.statuses.not_started], ['in_progress', labels.actions.statuses.in_progress], ['blocked', labels.actions.statuses.blocked], ['completed', labels.actions.statuses.done]] as const;
function factLabel(f: Fact, alias: boolean) { const def = metricDefinitions[f.metric]; return fill(ui.factLabel, { start: f.period.start, end: f.period.end, metric: def.label, scope: `${channelsLabel(f.scope.channels, alias)}${f.scope.sku ? `／${f.scope.sku}` : ''}`, scopeKind: f.scope.kind === 'all' ? labels.sections.total : f.scope.kind === 'sku' ? labels.csvColumns.sku : labels.csvColumns.channel, value: f.value === null ? labels.status.missing : factValue(f) }); }
export function ActionsWorkbench({ workspace, onChange, source, onEvidence, onExport }: { workspace: ActionWorkspace; onChange: (next: ActionWorkspace) => void; source: ActionSource; onEvidence: (selection: EvidenceSelection, context: ActionContext) => void; onExport: (format: 'md' | 'csv' | 'json') => void }) {
  const [notice, setNotice] = useState(''); const [queries, setQueries] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ActionRebindPreview | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0); const latest = useRef({ workspace, source });
  useLayoutEffect(() => { latest.current = { workspace, source }; }, [workspace, source]);
  useEffect(() => () => { request.current++; }, []);
  const documents = actionDocuments(workspace);
  function change(work: () => ActionWorkspace) { try { onChange(work()); setNotice(''); } catch (e) { setNotice(e instanceof Error && e.message === 'MAX_PINNED_ACTIONS' ? ui.maxPinned : ui.invalidInput); } }
  function evidence(fact: Fact, context: ActionContext) { const alias = demoAlias(context.session.dataset_id); onEvidence({ sku: fact.scope.sku, title: fill(ui.evidenceTitle, { metric: metricDefinitions[fact.metric].label }), name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: `${context.session.dataset_hash !== source.snapshot.dataset_hash || context.session.stale ? ui.historicalPrefix : ''}${fact.scope.sku ? fill(ui.skuScope, { sku: fact.scope.sku }) : channelsLabel(fact.scope.channels, alias)}` }, context); }
  async function prepareRebind(id: string) {
    const ticket = ++request.current; const captured = latest.current; setPreview(null); setBusy(id); setNotice('');
    try {
      const next = await previewActionRebind(captured.workspace, id, captured.source);
      if (ticket !== request.current) return;
      if (latest.current.workspace !== captured.workspace || latest.current.source !== captured.source) { setNotice(ui.changedDuringPreview); return; }
      setPreview(next);
    } catch { if (ticket === request.current) setNotice(ui.rebindUnavailable); }
    finally { if (ticket === request.current) setBusy(null); }
  }
  async function commitRebind() {
    if (!preview) return;
    const ticket = ++request.current; const captured = latest.current; setBusy(preview.action_id);
    try {
      const next = await commitActionRebind(captured.workspace, preview.action_id, preview, captured.source, true);
      if (ticket !== request.current) return;
      if (latest.current.workspace !== captured.workspace || latest.current.source !== captured.source) { setNotice(ui.changedDuringCommit); setPreview(null); return; }
      onChange(next); setPreview(null); setNotice(ui.rebindDone);
    } catch { if (ticket === request.current) { setNotice(ui.rebindExpired); setPreview(null); } }
    finally { if (ticket === request.current) setBusy(null); }
  }
  return <section data-testid="actions-workbench" aria-labelledby="actions-heading">
    <div className="section-heading"><div><h2 id="actions-heading">{labels.sections.actionList}</h2><p className="note">{ui.intro}</p></div><button className="button primary" onClick={() => change(() => addActionDraft(workspace, source, crypto.randomUUID()))}>{labels.buttons.addAction}</button></div>
    <p className="note">{fill(ui.countSummary, { total: workspace.items.length, pinned: workspace.items.filter(x => x.pinned).length })}</p>
    {notice && <p role="status" className="alert" data-testid="action-notice">{notice}</p>}
    {!workspace.items.length && <p className="empty-note">{ui.empty}</p>}
    {workspace.items.map((item, index) => {
      const context = contextFor(workspace, item); const card = item.card; const document = documents[index]; const alias = demoAlias(context.session.dataset_id);
      const choices = context.session.facts.filter(f => evidenceAllowed(item.scope, f));
      const query = queries[card.id] ?? ''; const filtered = choices.filter(f => card.fact_ids.includes(f.id) || factLabel(f, alias).toLowerCase().includes(query.trim().toLowerCase()));
      const diagnostic = item.diagnostic_id ? context.diagnostics.find(entry => entry.id === item.diagnostic_id) : undefined;
      return <article key={card.id} className="panel action-card" data-testid={`action-${index + 1}`}>
        <div className="section-heading"><h3>{fill(ui.itemHeading, { kind: item.pinned ? labels.buttons.pin : ui.item, n: index + 1 })}</h3><span className={`tag ${document.evidence_review_required ? 'blocking' : ''}`}>{document.evidence_review_required ? ui.tagReviewRequired : card.evidence_confirmed ? ui.tagConfirmed : ui.tagDraft}</span></div>
        <p className="note">{fill(ui.scopeLine, { previous: labels.periods.previous, ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, current: labels.periods.current, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias), dataAsOf: labels.status.dataAsOf, asOf: context.session.data_as_of })}</p>
        {document.evidence_relation === 'historical' && <p className="alert">{ui.historicalAlert}</p>}
        {document.evidence_review_required && <p className="alert">{ui.reviewRequiredAlert}</p>}
        <fieldset><legend className="sr-only">{fill(ui.editLegend, { n: index + 1 })}</legend>
          <div className="action-inputs">{fields.map(([key, label]) => <label key={key}>{label}{key === 'deadline' ? <input aria-label={label} type="date" value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} /> : <textarea aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} />}</label>)}</div>
          <label>{labels.actions.status}<select aria-label={labels.actions.status} value={item.execution_status ?? 'not_started'} onChange={e => change(() => editActionManagement(workspace, card.id, { execution_status: e.target.value as ActionExecutionStatus }))}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>{labels.actions.progress}<textarea aria-label={labels.actions.progress} rows={3} maxLength={2000} value={item.progress_notes ?? ''} onChange={e => change(() => editActionManagement(workspace, card.id, { progress_notes: e.target.value }))} /></label>
          <p className="note">{labels.sections.caution}：{labels.actions.confirmedNote}。{ui.evidenceChangeNote}</p>
          <label>{labels.actions.searchEvidence}<input aria-label={labels.actions.searchEvidence} type="search" value={query} onChange={e => setQueries({ ...queries, [card.id]: e.target.value })} /></label>
          <label>{ui.evidencePicker}<select aria-label={ui.evidencePicker} multiple size={5} value={card.fact_ids} onChange={e => change(() => editBoundAction(workspace, card.id, { fact_ids: Array.from(e.target.selectedOptions, o => o.value) }))}>{filtered.map(f => <option key={f.id} value={f.id}>{factLabel(f, alias)}</option>)}</select></label>
          <button className="button primary" onClick={() => { try { onChange(confirmBoundAction(workspace, card.id)); setNotice(ui.confirmDone); } catch { setNotice(ui.confirmFailed); } }}>{labels.buttons.confirm}</button>
        </fieldset>
        {document.data_limitations.length > 0 && <details><summary>{ui.limitations}</summary>{diagnostic && <p className="note">{labels.rules[diagnostic.code].caution}</p>}<ul>{document.data_limitations.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        <div className="button-row"><button className="button quiet" aria-pressed={item.pinned} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}>{item.pinned ? ui.unpin : labels.buttons.pin}</button><button className="button quiet" disabled={index === 0 || workspace.items[index - 1].pinned !== item.pinned} onClick={() => change(() => moveActionUp(workspace, card.id))}>{labels.buttons.moveUp}</button><button className="text-button" onClick={() => change(() => removeBoundAction(workspace, card.id))}>{labels.buttons.remove}</button><button className="button quiet" disabled={busy !== null || card.fact_ids.length === 0} onClick={() => void prepareRebind(card.id)}>{labels.buttons.rebind}</button></div>
        {busy === card.id && <p role="status">{ui.rebindChecking}</p>}
        {preview?.action_id === card.id && <section role="region" aria-label={ui.rebindRegion} className="panel"><h4>{ui.rebindHeading}</h4><p>{fill(ui.rebindScope, { ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias) })}</p><p className="note">{fill(ui.rebindAsOf, { asOf: preview.target_context.session.data_as_of })}</p><div className="table-scroll" tabIndex={0}><table><caption>{ui.rebindCaption}</caption><thead><tr><th>{ui.colMetricPeriod}</th><th>{ui.colBefore}</th><th>{ui.colAfter}</th></tr></thead><tbody>{preview.facts.map((row, i) => <tr key={i}><th>{fill(ui.rebindRowHeading, { metric: metricDefinitions[row.before.metric].label, start: row.before.period.start, end: row.before.period.end })}</th><td>{factValue(row.before)}{row.before.reason_codes.length > 0 && `（${row.before.reason_codes.join('、')}）`}</td><td>{factValue(row.after)}{row.after.reason_codes.length > 0 && `（${row.after.reason_codes.join('、')}）`}</td></tr>)}</tbody></table></div><button className="button primary" disabled={busy !== null} onClick={() => void commitRebind()}>{ui.rebindCommit}</button><button className="button quiet" onClick={() => { request.current++; setPreview(null); setBusy(null); }}>{labels.buttons.cancel}</button></section>}
        <div className="action-evidence">{card.fact_ids.map(id => choices.find(f => f.id === id)).filter((f): f is Fact => !!f).map(f => <button key={f.id} className="text-button" onClick={() => evidence(f, context)}>{fill(ui.viewEvidenceItem, { fact: factLabel(f, alias) })}</button>)}</div>
        <details><summary>{labels.sections.technicalDetails}</summary><p className="note">{labels.csvColumns.dataset_id} {context.session.dataset_id}</p><p className="note">{labels.csvColumns.dataset_hash} {context.session.dataset_hash}；{labels.csvColumns.filter_hash} {context.session.filter_hash}；{labels.csvColumns.revision} {context.session.revision}；{ui.bindingVersion} {item.binding_revision ?? 1}</p><p className="note">{ui.originalRule} {item.diagnostic_id ?? ui.manualOrigin}</p><ul>{card.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
        {document.binding_history.length > 0 && <details><summary>{fill(ui.historySummary, { n: document.binding_history.length })}</summary>{document.binding_history.map(binding => { const historyAlias = demoAlias(binding.dataset_id); return <section key={binding.revision}><h4>{ui.bindingVersion} {binding.revision}</h4><p className="note">{fill(ui.historyLine, { dataAsOf: labels.status.dataAsOf, asOf: binding.data_as_of, scope: scopeLabel(binding.scope, historyAlias), current: labels.periods.current, start: binding.period.start, end: binding.period.end, confirmState: binding.evidence_confirmed ? ui.tagConfirmed : ui.tagDraft })}</p>{binding.evidence.map(fact => <button key={fact.id} className="text-button" onClick={() => evidence(fact, contextFor(workspace, binding))}>{fill(ui.viewHistoryEvidence, { fact: factLabel(fact, historyAlias) })}</button>)}</section>; })}</details>}
      </article>;
    })}
    <section className="panel"><h2>{ui.exportHeading}</h2><p className="note">{ui.exportNote}</p><div className="button-row">{(['md', 'csv', 'json'] as const).map(format => <button key={format} className="button quiet" onClick={() => { try { onExport(format); setNotice(ui.exportDone); } catch { setNotice(ui.exportFailed); } }}>{format === 'md' ? labels.downloads.decisionMd : format === 'csv' ? labels.downloads.decisionCsv : labels.downloads.decisionJson}</button>)}</div></section>
  </section>;
}
