"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Fact } from '@/domain/types';
import { ACTION_EXECUTION_STATUSES, actionDocuments, addActionDraft, boardColumns, confirmBoundAction, editActionManagement, knownOwners, moveActionUp, pinAction, previewActionRebind, commitActionRebind, removeBoundAction, taipeiToday, type ActionContext, type ActionSource, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus, type BoundAction } from '@/application/action-workspace';
import { formatDateL1, metricDefinitions } from '@/application/presentation';
import { channelsLabel, demoAlias } from '@/application/copy';
import { fill, labels } from '@/i18n';
import type { EvidenceSelection } from './evidence-drawer';
import { ActionEditor, evidenceTag, statusLabels, statuses, type ActionDocument } from './action-editor';
import { ActionDrawer } from './action-drawer';
import { ShellIcon } from './shell/shell-icon';
import { usePageSlot } from './shell/page-slot';
const ui = labels.ui.actionsWorkbench;
const board = labels.actionBoard;
const page = labels.actions.pageV3;
export type ActionsView = 'board' | 'list';
/** C8 狀態標籤：進行中 accent、受阻 warning、未開始／已完成中性（已完成加 check icon）。 */
const statusTone: Partial<Record<ActionExecutionStatus, 'accent' | 'warning'>> = { in_progress: 'accent', blocked: 'warning' };
const HELP_ID = 'actions-help-panel';

/** C14／M3（同 product-comparison-panel.tsx 的 useDismiss）：? 說明開著時，Esc 關閉（焦點在裡面時回到觸發器）、點外面關閉；在 modal dialog（抽屜）裡的操作不算外面。 */
function useDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const inDialog = (target: EventTarget | null) => target instanceof Element && target.closest('dialog') !== null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || inDialog(event.target)) return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      close();
      if (inside) triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (inDialog(event.target)) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !rootRef.current?.contains(target)) close();
    };
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onPointer); };
  }, [open, close, rootRef, triggerRef]);
}
/**
 * V3-6（PRD §7.5、§6.3 #40／#42、C8／C10／C13／C15）：待辦頁。
 * 頁首：h1 旁的計數徽章與 ? 說明（#page-title-addon）、右側「新增待辦」（全頁唯一主要按鈕）與「匯出本頁」下拉（#page-actions）；
 * SSR／未掛載時兩組都 inline 渲染在 div.actions-page-head-inline，掛載後改用 portal，同一時間只有一份（M6）。
 * 工具列（看板｜清單）、看板四欄與 C13 卡片、「移到：」文字按鈕列；看板檢視的編輯改成右側待辦編輯抽屜（ActionDrawer），清單檢視維持 v2 的內嵌編輯器。
 * `initial.editing` 只給測試與日後的深連結用（SSR 直接渲染開著的抽屜）。
 */
export function ActionsWorkbench({ workspace, onChange, source, onEvidence, onExport, view, onViewChange, initial }: { workspace: ActionWorkspace; onChange: (next: ActionWorkspace) => void; source: ActionSource; onEvidence: (selection: EvidenceSelection, context: ActionContext) => void; onExport: (format: 'md' | 'csv' | 'json') => void; view?: ActionsView; onViewChange?: (view: ActionsView) => void; initial?: { editing?: string | null } }) {
  const [notice, setNotice] = useState(''); const [queries, setQueries] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ActionRebindPreview | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [ownView, setOwnView] = useState<ActionsView>('board');
  /** 看板檢視正在抽屜裡編輯的卡片 id（取代 v2 的「展開編輯」）。 */
  const [editing, setEditing] = useState<string | null>(initial?.editing ?? null);
  const [helpOpen, setHelpOpen] = useState(false);
  const request = useRef(0); const latest = useRef({ workspace, source });
  const cardRefs = useRef(new Map<string, HTMLElement>()); const pendingFocus = useRef<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null); const exportRef = useRef<HTMLDetailsElement>(null);
  const helpRef = useRef<HTMLDivElement>(null); const helpButtonRef = useRef<HTMLButtonElement>(null);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useDismiss(helpOpen, closeHelp, helpRef, helpButtonRef);
  const titleSlot = usePageSlot('page-title-addon'); const actionsSlot = usePageSlot('page-actions');
  useLayoutEffect(() => { latest.current = { workspace, source }; }, [workspace, source]);
  useEffect(() => () => { request.current++; }, []);
  // After a board move the card re-mounts in another column: move focus to it so keyboard users keep their place.
  // Layout effect: a new card is focused before the drawer (a passive effect) remembers its opener, so closing the drawer returns to the card.
  useLayoutEffect(() => { const id = pendingFocus.current; if (!id) return; pendingFocus.current = null; cardRefs.current.get(id)?.focus(); }, [workspace]);
  const current = view ?? ownView;
  const documents = actionDocuments(workspace); const owners = knownOwners(workspace);
  const positions = new Map(workspace.items.map((item, index) => [item.card.id, index]));
  const today = taipeiToday();
  function selectView(next: ActionsView) { setEditing(null); if (view === undefined) setOwnView(next); onViewChange?.(next); }
  function change(work: () => ActionWorkspace) { try { onChange(work()); setNotice(''); } catch (e) { setNotice(e instanceof Error && e.message === 'MAX_PINNED_ACTIONS' ? ui.maxPinned : ui.invalidInput); } }
  // A new draft opens the edit drawer on the board right away (the list view always shows the editor); focus lands on the new card first.
  function addDraft() {
    const id = crypto.randomUUID(); let added = false;
    change(() => { const next = addActionDraft(workspace, source, id); added = true; return next; });
    if (added) { pendingFocus.current = id; if (current === 'board') setEditing(id); }
  }
  function exportAs(format: 'md' | 'csv' | 'json') {
    try { onExport(format); setNotice(ui.exportDone); } catch { setNotice(ui.exportFailed); }
    const menu = exportRef.current; if (menu?.open) { menu.open = false; menu.querySelector<HTMLElement>(':scope > summary')?.focus(); }
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
  // 看板卡已有置頂 icon，抽屜底部也有置頂、往上移、移除；在抽屜裡改狀態會把卡片移到另一欄（moveTo 讓焦點跟著卡片）。
  function editor(item: BoundAction, index: number, place: ActionsView | 'drawer') {
    const id = item.card.id;
    return <ActionEditor variant={place === 'list' ? 'list' : 'drawer'} workspace={workspace} item={item} index={index} document={documents[index]} owners={owners} showPin={place === 'list'} query={queries[id] ?? ''} onQuery={value => setQueries({ ...queries, [id]: value })} change={change} onConfirm={() => { try { onChange(confirmBoundAction(workspace, id)); setNotice(ui.confirmDone); } catch { setNotice(ui.confirmFailed); } }} onStatus={status => place === 'list' ? change(() => editActionManagement(workspace, id, { execution_status: status })) : moveTo(id, status, index + 1)} busy={busy} preview={preview} onPrepareRebind={() => void prepareRebind(id)} onCommitRebind={() => void commitRebind()} onCancelRebind={() => { request.current++; setPreview(null); setBusy(null); }} onEvidence={evidence} />;
  }
  const columns = boardColumns(workspace);
  const total = workspace.items.length; const pinnedCount = workspace.items.filter(x => x.pinned).length;

  // §7.5 第 1 點：h1 旁的計數徽章（可見「12 · 置頂 3」，aria-label 寫完整意思）＋ ? 說明（C14：hidden 掛載、Esc／點外面關閉）。
  const titleAddon = <>
    <span className="ui-count-badge actions-count" role="img" data-testid="actions-count" aria-label={fill(ui.countSummary, { total, pinned: pinnedCount })}>{fill(page.countBadge, { total, pinned: pinnedCount })}</span>
    <div className="actions-help-host" ref={helpRef}>
      <button ref={helpButtonRef} type="button" className="ui-help-trigger" aria-label={page.helpAria} aria-expanded={helpOpen} aria-controls={HELP_ID} onClick={() => setHelpOpen(open => !open)}><ShellIcon name="help" size={16} /></button>
      <div id={HELP_ID} className="ui-popover ui-help-content actions-help" role="region" aria-label={page.helpAria} data-testid="actions-help" hidden={!helpOpen}>{page.help}</div>
    </div>
  </>;
  // §7.5 第 1 點、§6.3 #42：「新增待辦」＋「匯出本頁」頁內下拉（handler、通知同 v2；Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`）。
  const headActions = <>
    <button ref={addButtonRef} type="button" className="ui-btn ui-btn-primary" data-testid="actions-add" onClick={addDraft}>{labels.buttons.addAction}</button>
    <details ref={exportRef} className="topbar-menu auto-close export-page" data-testid="actions-export-menu">
      <summary className="ui-btn ui-btn-secondary" data-testid="export-page-actions">{labels.products.pageV3.exportPage}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
      <div className="menu-panel ui-menu">{(['md', 'csv', 'json'] as const).map(format => <div key={format} className="menu-item"><button type="button" className="ui-menu-item" data-testid={`actions-export-${format}`} onClick={() => exportAs(format)}>{format === 'md' ? labels.downloads.decisionMd : format === 'csv' ? labels.downloads.decisionCsv : labels.downloads.decisionJson}</button></div>)}</div>
    </details>
  </>;

  // C13 看板卡：置頂＋標題｜負責人 · 到期 · 更新｜狀態標籤＋引用數＋條件徽章｜移到：… 編輯。
  function boardCard(item: BoundAction, status: ActionExecutionStatus) {
    const index = positions.get(item.card.id)!; const n = index + 1; const card = item.card; const document: ActionDocument = documents[index];
    const titleId = `board-card-${n}-title`;
    const overdue = !!card.deadline && card.deadline < today && status !== 'completed';
    const badge = document.evidence_review_required ? page.reviewRequired : document.evidence_relation === 'historical' ? page.stale : null;
    const openEditor = () => setEditing(card.id);
    return <article key={card.id} className="board-card" data-testid={`board-card-${n}`} aria-labelledby={titleId} tabIndex={-1} ref={element => { if (element) cardRefs.current.set(card.id, element); else cardRefs.current.delete(card.id); }}>
      <div className="board-card-head">
        <button type="button" className="ui-btn ui-btn-icon board-pin" aria-pressed={item.pinned} aria-label={item.pinned ? ui.unpin : labels.buttons.pin} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}><ShellIcon name={item.pinned ? 'star-filled' : 'star'} size={16} className={item.pinned ? 'icon-filled' : undefined} /></button>
        <h4 className="board-card-heading"><button type="button" className="board-card-title" id={titleId} onClick={openEditor}><span className="board-card-title-text">{card.problem.trim() || board.untitled}</span></button></h4>
      </div>
      <p className="board-card-meta">
        <span>{card.owner_role.trim() || board.unassigned}</span><span aria-hidden="true"> · </span>
        <span className="board-card-due" data-overdue={overdue || undefined}>{card.deadline ? fill(page.due, { date: formatDateL1(card.deadline, { today }) }) : board.noDeadline}{overdue && <>{' '}<span className="board-card-overdue">{page.overdue}</span></>}</span>
        {item.status_updated_at && <><span aria-hidden="true"> · </span><span className="board-card-updated">{fill(page.updated, { date: formatDateL1(item.status_updated_at, { today }) })}</span></>}
      </p>
      <p className="board-card-tags">
        <span className="ui-lozenge" data-tone={statusTone[status]}>{status === 'completed' && <ShellIcon name="check" size={12} />}{statusLabels[status]}</span>
        <span className="board-card-evidence">{fill(page.evidenceCount, { n: card.fact_ids.length, state: card.evidence_confirmed ? page.evidenceConfirmed : page.evidenceDraft })}</span>
        {badge && <span className="ui-lozenge" data-tone="warning">{badge}</span>}
      </p>
      <div className="board-card-foot">
        <div className="board-move" role="group" aria-label={fill(board.moveGroup, { n })}>
          <span className="board-move-prefix" aria-hidden="true">{page.movePrefix}</span>
          {statuses.filter(([value]) => value !== status).map(([value, label], position) => <Fragment key={value}>{position > 0 && <span className="board-move-sep" aria-hidden="true">·</span>}<button type="button" className="ui-btn ui-btn-text" data-testid={`board-card-${n}-move-${value}`} aria-label={fill(board.moveTo, { status: label })} onClick={() => moveTo(card.id, value, n)}>{label}</button></Fragment>)}
        </div>
        <button type="button" className="ui-btn ui-btn-text board-card-edit" data-testid={`board-card-${n}-edit`} aria-describedby={titleId} onClick={openEditor}>{page.edit}</button>
      </div>
    </article>;
  }

  // 抽屜只在看板檢視、而且正在編輯的卡片還存在時渲染（同 v2 的條件渲染 dialog）；移除後關閉並回到看板（卡片已不在時回到「新增待辦」）。
  const editingIndex = current === 'board' && editing !== null ? positions.get(editing) : undefined;
  const editingItem = editingIndex === undefined ? undefined : workspace.items[editingIndex];
  function focusAfterDrawer(id: string) { (cardRefs.current.get(id) ?? addButtonRef.current)?.focus(); }

  return <section data-testid="actions-workbench" className="actions-page" aria-label={labels.nav.actions.label}>
    {titleSlot && createPortal(titleAddon, titleSlot)}
    {actionsSlot && createPortal(headActions, actionsSlot)}
    {(!titleSlot || !actionsSlot) && <div className="actions-page-head-inline">{!titleSlot && <div className="actions-head-title">{titleAddon}</div>}{!actionsSlot && <div className="actions-head-actions">{headActions}</div>}</div>}
    {notice && <p role="status" className="ui-notice actions-notice" data-testid="action-notice">{notice}</p>}
    {/* §7.5 第 6 點、C10 頁面型空狀態：沒有待辦時不渲染工具列與看板。 */}
    {total === 0 ? <div className="ui-empty-page actions-empty" data-testid="actions-empty">
      <h2>{page.emptyTitle}</h2>
      <p>{page.emptyBody}</p>
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="actions-empty-add" onClick={addDraft}>{labels.buttons.addAction}</button>
    </div> : <>
      {/* §7.5 第 2 點、C15：看板｜清單分段按鈕（偏好仍由 onViewChange 記進 ui_prefs.view）。 */}
      <div className="ui-toolbar actions-toolbar" data-testid="actions-toolbar">
        <div className="ui-segmented" role="group" aria-label={board.viewToggle}><button type="button" aria-pressed={current === 'board'} data-testid="actions-view-board" onClick={() => selectView('board')}>{board.viewBoard}</button><button type="button" aria-pressed={current === 'list'} data-testid="actions-view-list" onClick={() => selectView('list')}>{board.viewList}</button></div>
      </div>
      {/* §7.5 第 3 點：四欄，欄標題＝狀態名＋計數徽章；空欄是 C10 區段型空狀態。 */}
      {current === 'board' && <div className="action-board" data-testid="action-board">{ACTION_EXECUTION_STATUSES.map(status => {
        const headingId = `board-column-${status}-heading`; const items = columns[status];
        return <section key={status} className={`board-column board-column-${status}`} data-testid={`board-column-${status}`} aria-labelledby={headingId}>
          <h3 id={headingId}>{statusLabels[status]}{' '}<span className="ui-count-badge" role="img" aria-label={fill(board.columnCount, { n: items.length })}>{items.length}</span></h3>
          {!items.length && <div className="ui-empty-block board-empty">{page.columnEmpty}</div>}
          {items.map(item => boardCard(item, status))}
        </section>;
      })}</div>}
      {/* §7.5 第 5 點：清單檢視維持 v2 的每項 article＋常駐的內嵌編輯器（與抽屜共用 ActionEditor；兩種檢視不同時渲染，M6）。 */}
      {current === 'list' && workspace.items.map((item, index) => {
        const card = item.card; const document = documents[index];
        return <article key={card.id} className="panel action-card" data-testid={`action-${index + 1}`}>
          <div className="section-heading"><h3>{fill(ui.itemHeading, { kind: item.pinned ? labels.buttons.pin : ui.item, n: index + 1 })}</h3><span className="ui-lozenge" data-tone={document.evidence_review_required ? 'warning' : undefined}>{evidenceTag(document, card.evidence_confirmed)}</span></div>
          {editor(item, index, 'list')}
        </article>;
      })}
    </>}
    {editingItem && editingIndex !== undefined && <ActionDrawer item={editingItem} index={editingIndex} title={editingItem.card.problem.trim() || fill(ui.itemHeading, { kind: ui.item, n: editingIndex + 1 })} onClose={() => setEditing(null)}
      pinned={editingItem.pinned} onPin={() => change(() => pinAction(workspace, editingItem.card.id, !editingItem.pinned))}
      canMoveUp={editingIndex > 0 && workspace.items[editingIndex - 1].pinned === editingItem.pinned} onMoveUp={() => change(() => moveActionUp(workspace, editingItem.card.id))}
      onRemove={() => { setEditing(null); change(() => removeBoundAction(workspace, editingItem.card.id)); }}
      fallbackFocus={() => focusAfterDrawer(editingItem.card.id)} notice={notice}>{editor(editingItem, editingIndex, 'drawer')}</ActionDrawer>}
  </section>;
}
