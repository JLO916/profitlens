"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Fact } from '@/domain/types';
import { ACTION_EXECUTION_STATUSES, actionDocuments, addActionDraft, boardColumns, confirmBoundAction, contextFor, editActionManagement, editBoundAction, evidenceAllowed, filterEvidenceChoices, knownOwners, moveActionUp, pinAction, removeBoundAction, previewActionRebind, commitActionRebind, toggleEvidenceId, type ActionContext, type ActionSource, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus, type BoundAction } from '@/application/action-workspace';
import { formatMoney, formatRate, metricDefinitions } from '@/application/presentation';
import { channelsLabel, demoAlias, scopeLabel } from '@/application/copy';
import { fill, labels } from '@/i18n';
import type { EvidenceSelection } from './evidence-drawer';
const ui = labels.ui.actionsWorkbench;
const board = labels.actionBoard;
export type ActionsView = 'board' | 'list';
type ActionDocument = ReturnType<typeof actionDocuments>[number];
const fields = [['problem', labels.actions.problem], ['action', labels.actions.step], ['owner_role', labels.actions.owner], ['validation_metric', labels.actions.metric], ['deadline', labels.actions.due], ['stop_condition', labels.actions.stop], ['required_data', labels.actions.extraData]] as const;
function factValue(f: Fact) { const def = metricDefinitions[f.metric]; return f.value === null ? labels.status.missing : def.unit === 'money' ? formatMoney(f.value) : def.unit === 'percent' ? formatRate(f.value) : f.value; }
const statusLabels: Record<ActionExecutionStatus, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
const statuses = ACTION_EXECUTION_STATUSES.map(value => [value, statusLabels[value]] as const);
function factLabel(f: Fact, alias: boolean) { const def = metricDefinitions[f.metric]; return fill(ui.factLabel, { start: f.period.start, end: f.period.end, metric: def.label, scope: `${channelsLabel(f.scope.channels, alias)}${f.scope.sku ? `／${f.scope.sku}` : ''}`, scopeKind: f.scope.kind === 'all' ? labels.sections.total : f.scope.kind === 'sku' ? labels.csvColumns.sku : labels.csvColumns.channel, value: f.value === null ? labels.status.missing : factValue(f) }); }
/** HTML ids cannot carry whitespace; every card shares the same owner list, so a sanitized collision is harmless. */
function ownersListId(id: string) { return `action-owners-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`; }
function evidenceTag(document: ActionDocument, confirmed: boolean) { return document.evidence_review_required ? ui.tagReviewRequired : confirmed ? ui.tagConfirmed : ui.tagDraft; }

interface EditorProps {
  workspace: ActionWorkspace; item: BoundAction; index: number; document: ActionDocument; owners: readonly string[]; showPin: boolean;
  query: string; onQuery: (query: string) => void; change: (work: () => ActionWorkspace) => void; onConfirm: () => void; onStatus: (status: ActionExecutionStatus) => void;
  busy: string | null; preview: ActionRebindPreview | null; onPrepareRebind: () => void; onCommitRebind: () => void; onCancelRebind: () => void;
  onEvidence: (fact: Fact, context: ActionContext) => void;
}
/** One edit form shared by the board card (inside "expand edit") and the list article. */
function ActionEditor({ workspace, item, index, document, owners, showPin, query, onQuery, change, onConfirm, onStatus, busy, preview, onPrepareRebind, onCommitRebind, onCancelRebind, onEvidence }: EditorProps) {
  const context = contextFor(workspace, item); const card = item.card; const alias = demoAlias(context.session.dataset_id);
  const choices = context.session.facts.filter(f => evidenceAllowed(item.scope, f));
  const visible = filterEvidenceChoices(choices, card.fact_ids, query, f => factLabel(f, alias));
  const diagnostic = item.diagnostic_id ? context.diagnostics.find(entry => entry.id === item.diagnostic_id) : undefined;
  const listId = ownersListId(card.id);
  return <>
    <p className="note">{fill(ui.scopeLine, { previous: labels.periods.previous, ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, current: labels.periods.current, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias), dataAsOf: labels.status.dataAsOf, asOf: context.session.data_as_of })}</p>
    {document.evidence_relation === 'historical' && <p className="alert">{ui.historicalAlert}</p>}
    {document.evidence_review_required && <p className="alert">{ui.reviewRequiredAlert}</p>}
    <fieldset><legend className="sr-only">{fill(ui.editLegend, { n: index + 1 })}</legend>
      <div className="action-inputs">{fields.map(([key, label]) => <label key={key}>{label}{key === 'deadline' ? <input aria-label={label} type="date" value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} /> : key === 'owner_role' ? <><input aria-label={label} aria-describedby={`${listId}-hint`} list={listId} maxLength={2000} autoComplete="off" value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} /><datalist id={listId}>{owners.map(owner => <option key={owner} value={owner} />)}</datalist><small id={`${listId}-hint`}>{board.ownerListHint}</small></> : <textarea aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} />}</label>)}</div>
      <div className="action-inputs action-status-row">
        <label>{labels.actions.status}<select className="action-status-select" aria-label={labels.actions.status} value={item.execution_status ?? 'not_started'} onChange={e => onStatus(e.target.value as ActionExecutionStatus)}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{item.status_updated_at && <small>{fill(board.statusUpdated, { date: item.status_updated_at })}</small>}</label>
        <label>{labels.actions.progress}<textarea aria-label={labels.actions.progress} rows={3} maxLength={2000} value={item.progress_notes ?? ''} onChange={e => change(() => editActionManagement(workspace, card.id, { progress_notes: e.target.value }))} /></label>
      </div>
      <p className="note">{labels.sections.caution}：{labels.actions.confirmedNote}。{ui.evidenceChangeNote}</p>
      <fieldset className="evidence-checklist" aria-label={ui.evidencePicker} data-testid="evidence-checklist"><legend>{ui.evidencePicker}</legend>
        <label className="evidence-search">{labels.actions.searchEvidence}<input aria-label={labels.actions.searchEvidence} type="search" value={query} onChange={e => onQuery(e.target.value)} /></label>
        <p className="note">{board.evidenceSearchHint} <strong>{fill(board.evidenceSelected, { n: card.fact_ids.length })}</strong></p>
        <div className="evidence-options">
          {visible.map(f => <label key={f.id} className="evidence-option"><input type="checkbox" value={f.id} checked={card.fact_ids.includes(f.id)} onChange={e => change(() => editBoundAction(workspace, card.id, { fact_ids: toggleEvidenceId(card.fact_ids, f.id, e.target.checked, choices.map(choice => choice.id)) }))} /><span>{factLabel(f, alias)}</span></label>)}
          {!choices.length ? <p className="note">{board.evidenceNone}</p> : !visible.length && <p className="note">{board.evidenceNoMatch}</p>}
        </div>
      </fieldset>
      <button className="button primary" onClick={onConfirm}>{labels.buttons.confirm}</button>
    </fieldset>
    {document.data_limitations.length > 0 && <details><summary>{ui.limitations}</summary>{diagnostic && <p className="note">{labels.rules[diagnostic.code].caution}</p>}<ul>{document.data_limitations.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    <div className="button-row">{showPin && <button className="button quiet" aria-pressed={item.pinned} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}>{item.pinned ? ui.unpin : labels.buttons.pin}</button>}<button className="button quiet" disabled={index === 0 || workspace.items[index - 1].pinned !== item.pinned} onClick={() => change(() => moveActionUp(workspace, card.id))}>{labels.buttons.moveUp}</button><button className="text-button" onClick={() => change(() => removeBoundAction(workspace, card.id))}>{labels.buttons.remove}</button><button className="button quiet" disabled={busy !== null || card.fact_ids.length === 0} onClick={onPrepareRebind}>{labels.buttons.rebind}</button></div>
    {busy === card.id && <p role="status">{ui.rebindChecking}</p>}
    {preview?.action_id === card.id && <section role="region" aria-label={ui.rebindRegion} className="panel"><h4>{ui.rebindHeading}</h4><p>{fill(ui.rebindScope, { ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias) })}</p><p className="note">{fill(ui.rebindAsOf, { asOf: preview.target_context.session.data_as_of })}</p><div className="table-scroll" tabIndex={0}><table><caption>{ui.rebindCaption}</caption><thead><tr><th>{ui.colMetricPeriod}</th><th>{ui.colBefore}</th><th>{ui.colAfter}</th></tr></thead><tbody>{preview.facts.map((row, i) => <tr key={i}><th>{fill(ui.rebindRowHeading, { metric: metricDefinitions[row.before.metric].label, start: row.before.period.start, end: row.before.period.end })}</th><td>{factValue(row.before)}{row.before.reason_codes.length > 0 && `（${row.before.reason_codes.join('、')}）`}</td><td>{factValue(row.after)}{row.after.reason_codes.length > 0 && `（${row.after.reason_codes.join('、')}）`}</td></tr>)}</tbody></table></div><button className="button primary" disabled={busy !== null} onClick={onCommitRebind}>{ui.rebindCommit}</button><button className="button quiet" onClick={onCancelRebind}>{labels.buttons.cancel}</button></section>}
    <div className="action-evidence">{card.fact_ids.map(id => choices.find(f => f.id === id)).filter((f): f is Fact => !!f).map(f => <button key={f.id} className="text-button" onClick={() => onEvidence(f, context)}>{fill(ui.viewEvidenceItem, { fact: factLabel(f, alias) })}</button>)}</div>
    <details><summary>{labels.sections.technicalDetails}</summary><p className="note">{labels.csvColumns.dataset_id} {context.session.dataset_id}</p><p className="note">{labels.csvColumns.dataset_hash} {context.session.dataset_hash}；{labels.csvColumns.filter_hash} {context.session.filter_hash}；{labels.csvColumns.revision} {context.session.revision}；{ui.bindingVersion} {item.binding_revision ?? 1}</p><p className="note">{ui.originalRule} {item.diagnostic_id ?? ui.manualOrigin}</p><ul>{card.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
    {document.binding_history.length > 0 && <details><summary>{fill(ui.historySummary, { n: document.binding_history.length })}</summary>{document.binding_history.map(binding => { const historyAlias = demoAlias(binding.dataset_id); return <section key={binding.revision}><h4>{ui.bindingVersion} {binding.revision}</h4><p className="note">{fill(ui.historyLine, { dataAsOf: labels.status.dataAsOf, asOf: binding.data_as_of, scope: scopeLabel(binding.scope, historyAlias), current: labels.periods.current, start: binding.period.start, end: binding.period.end, confirmState: binding.evidence_confirmed ? ui.tagConfirmed : ui.tagDraft })}</p>{binding.evidence.map(fact => <button key={fact.id} className="text-button" onClick={() => onEvidence(fact, contextFor(workspace, binding))}>{fill(ui.viewHistoryEvidence, { fact: factLabel(fact, historyAlias) })}</button>)}</section>; })}</details>}
  </>;
}

export function ActionsWorkbench({ workspace, onChange, source, onEvidence, onExport, view, onViewChange }: { workspace: ActionWorkspace; onChange: (next: ActionWorkspace) => void; source: ActionSource; onEvidence: (selection: EvidenceSelection, context: ActionContext) => void; onExport: (format: 'md' | 'csv' | 'json') => void; view?: ActionsView; onViewChange?: (view: ActionsView) => void }) {
  const [notice, setNotice] = useState(''); const [queries, setQueries] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ActionRebindPreview | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [ownView, setOwnView] = useState<ActionsView>('board'); const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const request = useRef(0); const latest = useRef({ workspace, source });
  const cardRefs = useRef(new Map<string, HTMLElement>()); const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => { latest.current = { workspace, source }; }, [workspace, source]);
  useEffect(() => () => { request.current++; }, []);
  // After a board move the card re-mounts in another column: move focus to it so keyboard users keep their place.
  useEffect(() => { const id = pendingFocus.current; if (!id) return; pendingFocus.current = null; cardRefs.current.get(id)?.focus(); }, [workspace]);
  const current = view ?? ownView;
  const documents = actionDocuments(workspace); const owners = knownOwners(workspace);
  const positions = new Map(workspace.items.map((item, index) => [item.card.id, index]));
  function selectView(next: ActionsView) { if (view === undefined) setOwnView(next); onViewChange?.(next); }
  function change(work: () => ActionWorkspace) { try { onChange(work()); setNotice(''); } catch (e) { setNotice(e instanceof Error && e.message === 'MAX_PINNED_ACTIONS' ? ui.maxPinned : ui.invalidInput); } }
  // A new draft opens its editor on the board right away (the list view always shows the editor).
  function addDraft() {
    const id = crypto.randomUUID(); let added = false;
    change(() => { const next = addActionDraft(workspace, source, id); added = true; return next; });
    if (added) { setExpanded(prev => ({ ...prev, [id]: true })); pendingFocus.current = id; }
  }
  function moveTo(id: string, status: ActionExecutionStatus, n: number) {
    try { onChange(editActionManagement(workspace, id, { execution_status: status })); pendingFocus.current = id; setNotice(fill(board.moved, { n, status: statusLabels[status] })); } catch { setNotice(ui.invalidInput); }
  }
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
  // The board card already shows a pin star, and a status change there re-mounts the card in another column (moveTo keeps focus).
  function editor(item: BoundAction, index: number, place: ActionsView) {
    const id = item.card.id;
    return <ActionEditor workspace={workspace} item={item} index={index} document={documents[index]} owners={owners} showPin={place === 'list'} query={queries[id] ?? ''} onQuery={value => setQueries({ ...queries, [id]: value })} change={change} onConfirm={() => { try { onChange(confirmBoundAction(workspace, id)); setNotice(ui.confirmDone); } catch { setNotice(ui.confirmFailed); } }} onStatus={status => place === 'board' ? moveTo(id, status, index + 1) : change(() => editActionManagement(workspace, id, { execution_status: status }))} busy={busy} preview={preview} onPrepareRebind={() => void prepareRebind(id)} onCommitRebind={() => void commitRebind()} onCancelRebind={() => { request.current++; setPreview(null); setBusy(null); }} onEvidence={evidence} />;
  }
  const columns = boardColumns(workspace);
  return <section data-testid="actions-workbench" aria-labelledby="actions-heading">
    <div className="section-heading"><div><h2 id="actions-heading">{current === 'board' ? labels.sections.actionBoard : labels.sections.actionList}</h2><p className="note">{ui.intro}</p></div><div className="actions-toolbar"><div className="actions-view-toggle" role="group" aria-label={board.viewToggle}><button type="button" className="button quiet" aria-pressed={current === 'board'} data-testid="actions-view-board" onClick={() => selectView('board')}>{board.viewBoard}</button><button type="button" className="button quiet" aria-pressed={current === 'list'} data-testid="actions-view-list" onClick={() => selectView('list')}>{board.viewList}</button></div><button className="button primary" onClick={addDraft}>{labels.buttons.addAction}</button></div></div>
    <p className="note">{fill(ui.countSummary, { total: workspace.items.length, pinned: workspace.items.filter(x => x.pinned).length })}</p>
    {notice && <p role="status" className="alert" data-testid="action-notice">{notice}</p>}
    {!workspace.items.length && <p className="empty-note">{ui.empty}</p>}
    {current === 'board' && workspace.items.length > 0 && <><p className="note">{board.boardIntro}</p><div className="action-board" data-testid="action-board">{ACTION_EXECUTION_STATUSES.map(status => {
      const headingId = `board-column-${status}-heading`; const items = columns[status];
      return <section key={status} className={`board-column board-column-${status}`} data-testid={`board-column-${status}`} aria-labelledby={headingId}>
        <h3 id={headingId}>{statusLabels[status]} <span className="board-count">{fill(board.columnCount, { n: items.length })}</span></h3>
        {!items.length && <p className="note board-empty">{board.columnEmpty}</p>}
        {items.map(item => {
          const index = positions.get(item.card.id)!; const n = index + 1; const card = item.card; const document = documents[index];
          const titleId = `board-card-${n}-title`; const open = expanded[card.id] ?? false;
          const badge = document.evidence_review_required ? ui.tagReviewRequired : document.evidence_relation === 'historical' ? labels.actions.staleBadge : null;
          return <article key={card.id} className="board-card action-card" data-testid={`board-card-${n}`} aria-labelledby={titleId} tabIndex={-1} ref={element => { if (element) cardRefs.current.set(card.id, element); else cardRefs.current.delete(card.id); }}>
            <div className="board-card-head"><button type="button" className="pin-star" aria-pressed={item.pinned} aria-label={item.pinned ? ui.unpin : labels.buttons.pin} title={item.pinned ? ui.unpin : labels.buttons.pin} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}><span aria-hidden="true">{item.pinned ? '★' : '☆'}</span></button><h4 id={titleId}>{card.problem.trim() || board.untitled}</h4></div>
            <dl className="board-card-meta"><div><dt>{labels.actions.owner}</dt><dd>{card.owner_role.trim() || board.unassigned}</dd></div><div><dt>{labels.actions.due}</dt><dd>{card.deadline || board.noDeadline}</dd></div><div><dt>{labels.actions.status}</dt><dd>{statusLabels[status]}</dd></div></dl>
            <p className="board-card-tags">{badge && <span className="tag blocking">{badge}</span>}{!document.evidence_review_required && <span className="tag">{evidenceTag(document, card.evidence_confirmed)}</span>}{item.status_updated_at && <small>{fill(board.statusUpdated, { date: item.status_updated_at })}</small>}</p>
            <div className="board-move" role="group" aria-label={fill(board.moveGroup, { n })}>{statuses.filter(([value]) => value !== status).map(([value, label]) => <button key={value} type="button" className="button quiet" data-testid={`board-card-${n}-move-${value}`} onClick={() => moveTo(card.id, value, n)}>{fill(board.moveTo, { status: label })}</button>)}</div>
            <details className="board-edit" open={open} onToggle={event => { const next = event.currentTarget.open; setExpanded(prev => (prev[card.id] ?? false) === next ? prev : { ...prev, [card.id]: next }); }}><summary>{board.expandEdit}</summary>{open && editor(item, index, 'board')}</details>
          </article>;
        })}
      </section>;
    })}</div></>}
    {current === 'list' && workspace.items.map((item, index) => {
      const card = item.card; const document = documents[index];
      return <article key={card.id} className="panel action-card" data-testid={`action-${index + 1}`}>
        <div className="section-heading"><h3>{fill(ui.itemHeading, { kind: item.pinned ? labels.buttons.pin : ui.item, n: index + 1 })}</h3><span className={`tag ${document.evidence_review_required ? 'blocking' : ''}`}>{evidenceTag(document, card.evidence_confirmed)}</span></div>
        {editor(item, index, 'list')}
      </article>;
    })}
    <section className="panel"><h2>{ui.exportHeading}</h2><p className="note">{ui.exportNote}</p><div className="button-row">{(['md', 'csv', 'json'] as const).map(format => <button key={format} className="button quiet" data-testid={`actions-export-${format}`} onClick={() => { try { onExport(format); setNotice(ui.exportDone); } catch { setNotice(ui.exportFailed); } }}>{format === 'md' ? labels.downloads.decisionMd : format === 'csv' ? labels.downloads.decisionCsv : labels.downloads.decisionJson}</button>)}</div></section>
  </section>;
}
