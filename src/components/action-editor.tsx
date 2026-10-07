"use client";
import type { Fact } from '@/domain/types';
import { ACTION_EXECUTION_STATUSES, actionDocuments, contextFor, editActionManagement, editBoundAction, evidenceAllowed, filterEvidenceChoices, moveActionUp, pinAction, removeBoundAction, toggleEvidenceId, type ActionContext, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus, type BoundAction } from '@/application/action-workspace';
import { formatMetric, metricDefinitions, type Layer } from '@/application/presentation';
import { channelsLabel, demoAlias, scopeLabel } from '@/application/copy';
import { fill, labels } from '@/i18n';
// V3-6 開工錨點：ActionEditor 自 actions-workbench.tsx 原樣搬出（SSR markup 不變）。C 代理在此檔實作 §7.5 第 4 點的三段式編輯器（內容／引用的數字／歷史）；
// B 代理只改 actions-workbench.tsx（看板、清單、頁首、空狀態），不改本檔的 props 名稱。
const ui = labels.ui.actionsWorkbench;
const board = labels.actionBoard;
export type ActionDocument = ReturnType<typeof actionDocuments>[number];
const fields = [['problem', labels.actions.problem], ['action', labels.actions.step], ['owner_role', labels.actions.owner], ['validation_metric', labels.actions.metric], ['deadline', labels.actions.due], ['stop_condition', labels.actions.stop], ['required_data', labels.actions.extraData]] as const;
/** V3-2b：待辦卡片與引用清單的數字用 L1（萬）；重新綁定的比較表用 L2（整數元）。依指標單位分派，缺值依原因碼寫資料待補或不適用。 */
export function factValue(f: Fact, layer: Layer = 'L1') { return formatMetric(f.metric, f, layer); }
export const statusLabels: Record<ActionExecutionStatus, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
export const statuses = ACTION_EXECUTION_STATUSES.map(value => [value, statusLabels[value]] as const);
export function factLabel(f: Fact, alias: boolean) { const def = metricDefinitions[f.metric]; return fill(ui.factLabel, { start: f.period.start, end: f.period.end, metric: def.label, scope: `${channelsLabel(f.scope.channels, alias)}${f.scope.sku ? `／${f.scope.sku}` : ''}`, scopeKind: f.scope.kind === 'all' ? labels.sections.total : f.scope.kind === 'sku' ? labels.csvColumns.sku : labels.csvColumns.channel, value: f.value === null ? labels.status.missing : factValue(f) }); }
/** HTML ids cannot carry whitespace; every card shares the same owner list, so a sanitized collision is harmless. */
function ownersListId(id: string) { return `action-owners-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`; }
export function evidenceTag(document: ActionDocument, confirmed: boolean) { return document.evidence_review_required ? ui.tagReviewRequired : confirmed ? ui.tagConfirmed : ui.tagDraft; }

export interface EditorProps {
  /** V3-6：'list'＝清單檢視的內嵌編輯器（v2 行為）；'drawer'＝待辦編輯抽屜（C 代理實作三段式版面與底部動作列）。未傳入時同 'list'。 */
  variant?: 'list' | 'drawer';
  workspace: ActionWorkspace; item: BoundAction; index: number; document: ActionDocument; owners: readonly string[]; showPin: boolean;
  query: string; onQuery: (query: string) => void; change: (work: () => ActionWorkspace) => void; onConfirm: () => void; onStatus: (status: ActionExecutionStatus) => void;
  busy: string | null; preview: ActionRebindPreview | null; onPrepareRebind: () => void; onCommitRebind: () => void; onCancelRebind: () => void;
  onEvidence: (fact: Fact, context: ActionContext) => void;
}
/** One edit form shared by the board card (inside "expand edit") and the list article. */
export function ActionEditor({ workspace, item, index, document, owners, showPin, query, onQuery, change, onConfirm, onStatus, busy, preview, onPrepareRebind, onCommitRebind, onCancelRebind, onEvidence }: EditorProps) {
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
      <p className="note">{labels.sections.caution}：{labels.actions.confirmedNote}{ui.evidenceChangeNote}</p>
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
    {preview?.action_id === card.id && <section role="region" aria-label={ui.rebindRegion} className="panel"><h4>{ui.rebindHeading}</h4><p>{fill(ui.rebindScope, { ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias) })}</p><p className="note">{fill(ui.rebindAsOf, { asOf: preview.target_context.session.data_as_of })}</p><div className="table-scroll" tabIndex={0}><table><caption>{ui.rebindCaption}</caption><thead><tr><th>{ui.colMetricPeriod}</th><th>{ui.colBefore}</th><th>{ui.colAfter}</th></tr></thead><tbody>{preview.facts.map((row, i) => <tr key={i}><th>{fill(ui.rebindRowHeading, { metric: metricDefinitions[row.before.metric].label, start: row.before.period.start, end: row.before.period.end })}</th><td>{factValue(row.before, 'L2')}{row.before.reason_codes.length > 0 && `（${row.before.reason_codes.join('、')}）`}</td><td>{factValue(row.after, 'L2')}{row.after.reason_codes.length > 0 && `（${row.after.reason_codes.join('、')}）`}</td></tr>)}</tbody></table></div><button className="button primary" disabled={busy !== null} onClick={onCommitRebind}>{ui.rebindCommit}</button><button className="button quiet" onClick={onCancelRebind}>{labels.buttons.cancel}</button></section>}
    <div className="action-evidence">{card.fact_ids.map(id => choices.find(f => f.id === id)).filter((f): f is Fact => !!f).map(f => <button key={f.id} className="text-button" onClick={() => onEvidence(f, context)}>{fill(ui.viewEvidenceItem, { fact: factLabel(f, alias) })}</button>)}</div>
    <details><summary>{labels.sections.technicalDetails}</summary><p className="note">{labels.csvColumns.dataset_id} {context.session.dataset_id}</p><p className="note">{labels.csvColumns.dataset_hash} {context.session.dataset_hash}；{labels.csvColumns.filter_hash} {context.session.filter_hash}；{labels.csvColumns.revision} {context.session.revision}；{ui.bindingVersion} {item.binding_revision ?? 1}</p><p className="note">{ui.originalRule} {item.diagnostic_id ?? ui.manualOrigin}</p><ul>{card.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
    {document.binding_history.length > 0 && <details><summary>{fill(ui.historySummary, { n: document.binding_history.length })}</summary>{document.binding_history.map(binding => { const historyAlias = demoAlias(binding.dataset_id); return <section key={binding.revision}><h4>{ui.bindingVersion} {binding.revision}</h4><p className="note">{fill(ui.historyLine, { dataAsOf: labels.status.dataAsOf, asOf: binding.data_as_of, scope: scopeLabel(binding.scope, historyAlias), current: labels.periods.current, start: binding.period.start, end: binding.period.end, confirmState: binding.evidence_confirmed ? ui.tagConfirmed : ui.tagDraft })}</p>{binding.evidence.map(fact => <button key={fact.id} className="text-button" onClick={() => onEvidence(fact, contextFor(workspace, binding))}>{fill(ui.viewHistoryEvidence, { fact: factLabel(fact, historyAlias) })}</button>)}</section>; })}</details>}
  </>;
}

