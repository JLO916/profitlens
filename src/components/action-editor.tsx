"use client";
import { useId } from 'react';
import type { Fact } from '@/domain/types';
import { ACTION_EXECUTION_STATUSES, AD_DECISIONS, actionDocuments, contextFor, editActionManagement, editBoundAction, evidenceAllowed, filterEvidenceChoices, moveActionUp, pinAction, removeBoundAction, setAdDecision, toggleEvidenceId, type ActionContext, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus, type AdDecision, type BoundAction } from '@/application/action-workspace';
import { formatMetric, metricDefinitions, type Layer } from '@/application/presentation';
import { channelsLabel, demoAlias, scopeLabel } from '@/application/copy';
import { fill, labels } from '@/i18n';
// V3-6（PRD §7.5 第 4–5 點、§6.3 #41）：待辦編輯器——看板的待辦編輯抽屜與清單檢視的內嵌編輯器共用同一個元件，同一頁捲動分三段（不用分頁）：
// 內容（7 欄、狀態、進度紀錄）／引用的數字（警示、搜尋與勾選、確認、看明細、用目前資料重新核對與預覽、限制）／歷史（引用歷史、技術細節）。
// 欄位編輯即時生效（change 每次就寫回工作區，沒有暫存再提交）；「確認」仍是確認引用的數字。props 名稱是與 actions-workbench.tsx 的介面契約。
const ui = labels.actions.workbench;
const board = labels.actions.board;
const copy = labels.actions.drawerV3;
const adCopy = labels.actions.adDecisionV3;
export type ActionDocument = ReturnType<typeof actionDocuments>[number];
const fields = [['problem', labels.actions.form.problem], ['action', labels.actions.form.step], ['owner_role', labels.actions.form.owner], ['validation_metric', labels.actions.form.metric], ['deadline', labels.actions.form.due], ['stop_condition', labels.actions.form.stop], ['required_data', labels.actions.form.extraData]] as const;
type FieldKey = typeof fields[number][0];
/** V3-2b：待辦卡片與引用清單的數字用 L1（萬）；重新綁定的比較表用 L2（整數元）。依指標單位分派，缺值依原因碼寫資料待補或不適用。 */
export function factValue(f: Fact, layer: Layer = 'L1') { return formatMetric(f.metric, f, layer); }
export const statusLabels: Record<ActionExecutionStatus, string> = { not_started: labels.actions.form.statuses.not_started, in_progress: labels.actions.form.statuses.in_progress, blocked: labels.actions.form.statuses.blocked, completed: labels.actions.form.statuses.done };
export const statuses = ACTION_EXECUTION_STATUSES.map(value => [value, statusLabels[value]] as const);
export function factLabel(f: Fact, alias: boolean) { const def = metricDefinitions[f.metric]; return fill(ui.factLabel, { start: f.period.start, end: f.period.end, metric: def.label, scope: `${channelsLabel(f.scope.channels, alias)}${f.scope.sku ? `／${f.scope.sku}` : ''}`, scopeKind: f.scope.kind === 'all' ? labels.overview.sections.total : f.scope.kind === 'sku' ? labels.exports.csv.columns.sku : labels.exports.csv.columns.channel, value: f.value === null ? labels.shell.status.missing : factValue(f) }); }
/** HTML ids cannot carry whitespace; every card shares the same owner list, so a sanitized collision is harmless. */
function ownersListId(id: string) { return `action-owners-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`; }
export function evidenceTag(document: ActionDocument, confirmed: boolean) { return document.evidence_review_required ? ui.tagReviewRequired : confirmed ? ui.tagConfirmed : ui.tagDraft; }
/** V3-9a（PRD §10.1 F13、§7.5 第 7 點）：C8 廣告決策徽章（看板卡與清單項的狀態標籤旁）；沒有標就不渲染。中性色：只是使用者自選的分類，不是好壞。 */
export function AdDecisionBadge({ value, testId }: { value: AdDecision | undefined; testId: string }) {
  return value === undefined ? null : <span className="ui-lozenge action-ad-decision-badge" data-testid={testId}>{fill(adCopy.badge, { decision: adCopy.options[value] })}</span>;
}

export interface EditorProps {
  /** V3-6：'list'＝清單檢視的內嵌編輯器（三段之後保留置頂、往上移、移除的按鈕列）；'drawer'＝待辦編輯抽屜（底部動作列由 ActionDrawer 提供，本元件不渲染按鈕列）。未傳入時同 'list'。 */
  variant?: 'list' | 'drawer';
  workspace: ActionWorkspace; item: BoundAction; index: number; document: ActionDocument; owners: readonly string[]; showPin: boolean;
  query: string; onQuery: (query: string) => void; change: (work: () => ActionWorkspace) => void; onConfirm: () => void; onStatus: (status: ActionExecutionStatus) => void;
  busy: string | null; preview: ActionRebindPreview | null; onPrepareRebind: () => void; onCommitRebind: () => void; onCancelRebind: () => void;
  onEvidence: (fact: Fact, context: ActionContext) => void;
}
/** One edit form shared by the drawer (board view) and the list article; both variants render the same three sections. */
export function ActionEditor({ variant = 'list', workspace, item, index, document, owners, showPin, query, onQuery, change, onConfirm, onStatus, busy, preview, onPrepareRebind, onCommitRebind, onCancelRebind, onEvidence }: EditorProps) {
  const uid = useId(); const controlId = (key: string) => `${uid}-${key}`;
  const context = contextFor(workspace, item); const card = item.card; const alias = demoAlias(context.session.dataset_id);
  const choices = context.session.facts.filter(f => evidenceAllowed(item.scope, f));
  const visible = filterEvidenceChoices(choices, card.fact_ids, query, f => factLabel(f, alias));
  const diagnostic = item.diagnostic_id ? context.diagnostics.find(entry => entry.id === item.diagnostic_id) : undefined;
  const listId = ownersListId(card.id);
  const edit = (key: FieldKey, value: string) => change(() => editBoundAction(workspace, card.id, { [key]: value }));
  const selected = card.fact_ids.map(id => choices.find(f => f.id === id)).filter((f): f is Fact => !!f);
  return <>
    {/* §7.5 第 4 點「內容」段：範圍一行（13px 次要色）→ 7 欄（C11：label 在上、輸入在下）→ 狀態與狀態更新日 → 進度紀錄。 */}
    <section className="action-editor-section action-editor-content" role="region" aria-label={copy.content}>
      <h3 className="action-editor-heading">{copy.content}</h3>
      <p className="action-editor-scope">{fill(ui.scopeLine, { previous: labels.shell.periods.previous, ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, current: labels.shell.periods.current, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias), dataAsOf: labels.shell.status.dataAsOf, asOf: context.session.data_as_of })}</p>
      <fieldset className="action-editor-fields"><legend className="sr-only">{fill(ui.editLegend, { n: index + 1 })}</legend>
        <div className="action-editor-grid">{fields.map(([key, label]) => <div key={key} className="ui-field" data-field={key}>
          <label className="ui-field-label" htmlFor={controlId(key)}>{label}</label>
          {key === 'deadline' ? <input id={controlId(key)} className="ui-field-control" aria-label={label} type="date" value={card[key]} onChange={e => edit(key, e.target.value)} />
            : key === 'owner_role' ? <><input id={controlId(key)} className="ui-field-control" aria-label={label} aria-describedby={`${listId}-hint`} list={listId} maxLength={2000} autoComplete="off" value={card[key]} onChange={e => edit(key, e.target.value)} /><datalist id={listId}>{owners.map(owner => <option key={owner} value={owner} />)}</datalist><small id={`${listId}-hint`} className="ui-field-hint">{board.ownerListHint}</small></>
            : <textarea id={controlId(key)} className="ui-field-control" aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e => edit(key, e.target.value)} />}
        </div>)}</div>
        <div className="action-editor-grid action-editor-status">
          <div className="ui-field"><label className="ui-field-label" htmlFor={controlId('status')}>{labels.actions.form.status}</label><select id={controlId('status')} className="ui-field-control action-status-select" aria-label={labels.actions.form.status} aria-describedby={item.status_updated_at ? controlId('status-updated') : undefined} value={item.execution_status ?? 'not_started'} onChange={e => onStatus(e.target.value as ActionExecutionStatus)}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{item.status_updated_at && <small id={controlId('status-updated')} className="ui-field-hint">{fill(board.statusUpdated, { date: item.status_updated_at })}</small>}</div>
          {/* V3-9a（PRD §10.1 F13）：狀態之後的「廣告決策」select（不標／暫停／調整／加碼），使用者自選、即時生效；「不標」＝清除。 */}
          <div className="ui-field action-editor-ad-decision"><label className="ui-field-label" htmlFor={controlId('ad-decision')}>{adCopy.field}</label><select id={controlId('ad-decision')} className="ui-field-control action-ad-decision-select" aria-label={adCopy.field} data-testid="action-ad-decision" value={item.ad_decision ?? ''} onChange={e => change(() => setAdDecision(workspace, card.id, e.target.value === '' ? undefined : e.target.value as AdDecision))}><option value="">{adCopy.none}</option>{AD_DECISIONS.map(value => <option key={value} value={value}>{adCopy.options[value]}</option>)}</select></div>
          <div className="ui-field action-editor-progress"><label className="ui-field-label" htmlFor={controlId('progress')}>{labels.actions.form.progress}</label><textarea id={controlId('progress')} className="ui-field-control" aria-label={labels.actions.form.progress} rows={3} maxLength={2000} value={item.progress_notes ?? ''} onChange={e => change(() => editActionManagement(workspace, card.id, { progress_notes: e.target.value }))} /></div>
        </div>
      </fieldset>
    </section>
    {/* §7.5 第 4 點「引用的數字」段：警示（C21 inline notice）→ 確認的意思（一行）→ 搜尋與勾選 → 確認（唯一主要按鈕）→ 看明細 → 用目前資料重新核對與預覽 → 限制。 */}
    <section className="action-editor-section action-editor-evidence" role="region" aria-label={copy.evidence}>
      <h3 className="action-editor-heading">{copy.evidence}</h3>
      {document.evidence_relation === 'historical' && <p className="ui-notice" data-tone="warning">{ui.historicalAlert}</p>}
      {document.evidence_review_required && <p className="ui-notice" data-tone="warning">{ui.reviewRequiredAlert}</p>}
      <p className="action-editor-note">{labels.actions.form.confirmedNote}{ui.evidenceChangeNote}</p>
      <fieldset className="evidence-checklist" aria-label={ui.evidencePicker} data-testid="evidence-checklist"><legend className="sr-only">{ui.evidencePicker}</legend>
        <div className="ui-field evidence-search"><label className="ui-field-label" htmlFor={controlId('search')}>{labels.actions.form.searchEvidence}</label><input id={controlId('search')} className="ui-field-control" aria-label={labels.actions.form.searchEvidence} aria-describedby={controlId('search-hint')} type="search" value={query} onChange={e => onQuery(e.target.value)} /></div>
        <p id={controlId('search-hint')} className="ui-field-hint evidence-search-hint">{board.evidenceSearchHint} <strong>{fill(board.evidenceSelected, { n: card.fact_ids.length })}</strong></p>
        <div className="evidence-options">
          {visible.map(f => <label key={f.id} className="evidence-option ui-check-label"><input type="checkbox" className="ui-check" value={f.id} checked={card.fact_ids.includes(f.id)} onChange={e => change(() => editBoundAction(workspace, card.id, { fact_ids: toggleEvidenceId(card.fact_ids, f.id, e.target.checked, choices.map(choice => choice.id)) }))} /><span>{factLabel(f, alias)}</span></label>)}
          {!choices.length ? <p className="ui-field-hint">{board.evidenceNone}</p> : !visible.length && <p className="ui-field-hint">{board.evidenceNoMatch}</p>}
        </div>
      </fieldset>
      <div className="button-row action-editor-confirm"><button type="button" className="ui-btn ui-btn-primary" onClick={onConfirm}>{labels.shell.buttons.confirm}</button></div>
      {selected.length > 0 && <div className="action-evidence">{selected.map(f => <button key={f.id} type="button" className="ui-btn ui-btn-text" onClick={() => onEvidence(f, context)}>{fill(ui.viewEvidenceItem, { fact: factLabel(f, alias) })}</button>)}</div>}
      <div className="action-rebind"><button type="button" className="ui-btn ui-btn-secondary" disabled={busy !== null || card.fact_ids.length === 0} onClick={onPrepareRebind}>{labels.actions.buttons.rebind}</button>{busy === card.id && <p role="status" className="action-editor-note">{ui.rebindChecking}</p>}</div>
      {preview?.action_id === card.id && <section role="region" aria-label={ui.rebindRegion} className="action-rebind-preview"><h4>{ui.rebindHeading}</h4><p className="action-editor-text">{fill(ui.rebindScope, { ps: context.session.scope.previous_period.start, pe: context.session.scope.previous_period.end, cs: context.session.period.start, ce: context.session.period.end, scope: scopeLabel(item.scope, alias) })}</p><p className="action-editor-note">{fill(ui.rebindAsOf, { asOf: preview.target_context.session.data_as_of })}</p><div className="table-scroll" tabIndex={0}><table className="ui-table"><caption>{ui.rebindCaption}</caption><thead><tr><th scope="col">{ui.colMetricPeriod}</th><th scope="col" className="num">{ui.colBefore}</th><th scope="col" className="num">{ui.colAfter}</th></tr></thead><tbody>{preview.facts.map((row, i) => <tr key={i}><th scope="row">{fill(ui.rebindRowHeading, { metric: metricDefinitions[row.before.metric].label, start: row.before.period.start, end: row.before.period.end })}</th><td className="num">{factValue(row.before, 'L2')}{row.before.reason_codes.length > 0 && `（${row.before.reason_codes.join('、')}）`}</td><td className="num">{factValue(row.after, 'L2')}{row.after.reason_codes.length > 0 && `（${row.after.reason_codes.join('、')}）`}</td></tr>)}</tbody></table></div><div className="button-row"><button type="button" className="ui-btn ui-btn-primary" disabled={busy !== null} onClick={onCommitRebind}>{ui.rebindCommit}</button><button type="button" className="ui-btn ui-btn-secondary" onClick={onCancelRebind}>{labels.shell.buttons.cancel}</button></div></section>}
      {document.data_limitations.length > 0 && <details className="action-editor-details"><summary>{ui.limitations}</summary>{diagnostic && <p className="action-editor-note">{labels.rules[diagnostic.code].caution}</p>}<ul>{document.data_limitations.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    </section>
    {/* §7.5 第 4 點「歷史」段：引用歷史（較早的引用與看較早的明細）→ 技術細節，兩者預設收合。 */}
    <section className="action-editor-section action-editor-history" role="region" aria-label={copy.history}>
      <h3 className="action-editor-heading">{copy.history}</h3>
      {document.binding_history.length > 0 && <details className="action-editor-details"><summary>{fill(ui.historySummary, { n: document.binding_history.length })}</summary>{document.binding_history.map(binding => { const historyAlias = demoAlias(binding.dataset_id); return <section key={binding.revision} className="action-history-entry"><h4>{ui.bindingVersion} {binding.revision}</h4><p className="action-editor-note">{fill(ui.historyLine, { dataAsOf: labels.shell.status.dataAsOf, asOf: binding.data_as_of, scope: scopeLabel(binding.scope, historyAlias), current: labels.shell.periods.current, start: binding.period.start, end: binding.period.end, confirmState: binding.evidence_confirmed ? ui.tagConfirmed : ui.tagDraft })}</p>{binding.evidence.map(fact => <button key={fact.id} type="button" className="ui-btn ui-btn-text" onClick={() => onEvidence(fact, contextFor(workspace, binding))}>{fill(ui.viewHistoryEvidence, { fact: factLabel(fact, historyAlias) })}</button>)}</section>; })}</details>}
      <details className="action-editor-details"><summary>{labels.evidence.sections.technicalDetails}</summary><p className="note">{labels.exports.csv.columns.dataset_id} {context.session.dataset_id}</p><p className="note">{labels.exports.csv.columns.dataset_hash} {context.session.dataset_hash}；{labels.exports.csv.columns.filter_hash} {context.session.filter_hash}；{labels.exports.csv.columns.revision} {context.session.revision}；{ui.bindingVersion} {item.binding_revision ?? 1}</p><p className="note">{ui.originalRule} {item.diagnostic_id ?? ui.manualOrigin}</p><ul>{card.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
    </section>
    {/* §7.5 第 5 點：清單檢視在三段之後保留置頂、往上移、移除（重新核對已在「引用的數字」段）；抽屜的這三個動作在 ActionDrawer 的底部動作列。 */}
    {variant === 'list' && <div className="button-row ui-actions action-editor-actions">{showPin && <button type="button" className="ui-btn ui-btn-secondary" aria-pressed={item.pinned} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}>{item.pinned ? ui.unpin : labels.actions.buttons.pin}</button>}<button type="button" className="ui-btn ui-btn-secondary" disabled={index === 0 || workspace.items[index - 1].pinned !== item.pinned} onClick={() => change(() => moveActionUp(workspace, card.id))}>{labels.actions.buttons.moveUp}</button><button type="button" className="ui-btn ui-btn-text" onClick={() => change(() => removeBoundAction(workspace, card.id))}>{labels.actions.buttons.remove}</button></div>}
  </>;
}
