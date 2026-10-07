"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Fact } from '@/domain/types';
import { ACTION_EXECUTION_STATUSES, actionDocuments, addActionDraft, boardColumns, confirmBoundAction, editActionManagement, knownOwners, pinAction, previewActionRebind, commitActionRebind, type ActionContext, type ActionSource, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus, type BoundAction } from '@/application/action-workspace';
import { metricDefinitions } from '@/application/presentation';
import { channelsLabel, demoAlias } from '@/application/copy';
import { fill, labels } from '@/i18n';
import type { EvidenceSelection } from './evidence-drawer';
import { ActionEditor, evidenceTag, statusLabels, statuses } from './action-editor';
const ui = labels.ui.actionsWorkbench;
const board = labels.actionBoard;
export type ActionsView = 'board' | 'list';
// V3-6 開工錨點：B 代理在本檔實作 §7.5 的頁首徽章與 ? 說明、工具列、看板欄、C13 卡片、「移到」文字按鈕列、待辦編輯抽屜的開關（ActionDrawer）、空狀態、匯出本頁選單。
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
