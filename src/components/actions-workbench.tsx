"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Fact } from '@/domain/types';
import { actionDocuments, addActionDraft, confirmBoundAction, contextFor, editActionManagement, editBoundAction, evidenceAllowed, moveActionUp, pinAction, removeBoundAction, previewActionRebind, commitActionRebind, type ActionContext, type ActionSource, type ActionWorkspace, type ActionRebindPreview, type ActionExecutionStatus } from '@/application/action-workspace';
import { formatMoney, formatRate, metricDefinitions } from '@/application/presentation';
import type { EvidenceSelection } from './evidence-drawer';
const fields = [['problem', '問題'], ['action', '具體動作'], ['owner_role', '負責角色'], ['validation_metric', '驗證指標'], ['deadline', '期限'], ['stop_condition', '停止條件'], ['required_data', '所需額外資料']] as const;
function factValue(f: Fact) { const def = metricDefinitions[f.metric]; return f.value === null ? '未知' : def.unit === 'money' ? formatMoney(f.value) : def.unit === 'percent' ? formatRate(f.value) : f.value; }
const statuses = [['not_started', '未開始'], ['in_progress', '進行中'], ['blocked', '受阻'], ['completed', '已完成']] as const;
function factLabel(f: Fact) { const def = metricDefinitions[f.metric]; return `${f.period.start}–${f.period.end} · ${def.label} · ${f.scope.channels.join('、')}${f.scope.sku ? `／SKU ${f.scope.sku}` : ''}（${f.scope.kind === 'all' ? '範圍合計' : f.scope.kind === 'sku' ? '商品' : '通路'}） · ${def.unit === 'money' ? formatMoney(f.value) : def.unit === 'percent' ? formatRate(f.value) : f.value ?? '未知'}`; }
export function ActionsWorkbench({ workspace, onChange, source, onEvidence, onExport }: { workspace: ActionWorkspace; onChange: (next: ActionWorkspace) => void; source: ActionSource; onEvidence: (selection: EvidenceSelection, context: ActionContext) => void; onExport: (format: 'md' | 'csv' | 'json') => void }) {
  const [notice, setNotice] = useState(''); const [queries, setQueries] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ActionRebindPreview | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0); const latest = useRef({ workspace, source });
  useLayoutEffect(() => { latest.current = { workspace, source }; }, [workspace, source]);
  useEffect(() => () => { request.current++; }, []);
  const documents = actionDocuments(workspace);
  function change(work: () => ActionWorkspace) { try { onChange(work()); setNotice(''); } catch (e) { setNotice(e instanceof Error && e.message === 'MAX_PINNED_ACTIONS' ? '最多置頂三項，請先取消其他置頂；工作項目總數不受三項限制。' : '尚未完成：請核對有效期限、文字長度、證據與原始範圍。'); } }
  function evidence(fact: Fact, context: ActionContext) { onEvidence({ title: `行動證據 · ${metricDefinitions[fact.metric].label}`, name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: `${context.session.dataset_hash !== source.snapshot.dataset_hash || context.session.stale ? '歷史證據 · ' : ''}${fact.scope.sku ? `SKU ${fact.scope.sku} · 僅商品毛利` : fact.scope.channels.join('、')}` }, context); }
  async function prepareRebind(id: string) {
    const ticket = ++request.current; const captured = latest.current; setPreview(null); setBusy(id); setNotice('');
    try {
      const next = await previewActionRebind(captured.workspace, id, captured.source);
      if (ticket !== request.current) return;
      if (latest.current.workspace !== captured.workspace || latest.current.source !== captured.source) { setNotice('資料或行動已改變，請重新預覽；原始引用未變更。'); return; }
      setPreview(next);
    } catch { if (ticket === request.current) setNotice('無法重新綁定：目前資料須涵蓋原行動的通路、兩期與引用指標。原始引用保持不變。'); }
    finally { if (ticket === request.current) setBusy(null); }
  }
  async function commitRebind() {
    if (!preview) return;
    const ticket = ++request.current; const captured = latest.current; setBusy(preview.action_id);
    try {
      const next = await commitActionRebind(captured.workspace, preview.action_id, preview, captured.source, true);
      if (ticket !== request.current) return;
      if (latest.current.workspace !== captured.workspace || latest.current.source !== captured.source) { setNotice('確認期間資料或行動已改變，未提交新引用；請重新預覽。'); setPreview(null); return; }
      onChange(next); setPreview(null); setNotice('已明確改用預覽的資料版本；原始引用保留於歷史，執行狀態未變更。');
    } catch { if (ticket === request.current) { setNotice('預覽已失效或引用無法驗證，原始引用未變更；請重新預覽。'); setPreview(null); } }
    finally { if (ticket === request.current) setBusy(null); }
  }
  return <section data-testid="actions-workbench" aria-labelledby="actions-heading">
    <div className="section-heading"><div><h2 id="actions-heading">優先行動工作稿</h2><p className="note">行動獨立於檢視篩選與情境模型。最多置頂三項，工作項目總數不限；每項保留自己的期間、通路與引用。切換畫面不鎖定管理欄位，改用另一份資料須先預覽並明確確認。</p></div><button className="button primary" onClick={() => change(() => addActionDraft(workspace, source, crypto.randomUUID()))}>新增行動</button></div>
    <p className="note">目前 {workspace.items.length} 項／置頂 {workspace.items.filter(x => x.pinned).length} 項。執行狀態由使用者填寫；引用確認與「已完成」都不代表已達成商業成果。</p>
    {notice && <p role="status" className="alert" data-testid="action-notice">{notice}</p>}
    {!workspace.items.length && <p className="empty-note">尚無行動。可從通路診斷建立草稿，或自行新增。</p>}
    {workspace.items.map((item, index) => {
      const context = contextFor(workspace, item); const card = item.card; const document = documents[index];
      const choices = context.session.facts.filter(f => evidenceAllowed(item.scope, f));
      const query = queries[card.id] ?? ''; const filtered = choices.filter(f => card.fact_ids.includes(f.id) || factLabel(f).toLowerCase().includes(query.trim().toLowerCase()));
      return <article key={card.id} className="panel action-card" data-testid={`action-${index + 1}`}>
        <div className="section-heading"><h3>{item.pinned ? '置頂' : '工作項目'} {index + 1}</h3><span className={`tag ${document.evidence_review_required ? 'blocking' : ''}`}>{document.evidence_review_required ? '舊版歷史引用 · 待重新核對' : card.evidence_confirmed ? '使用者已確認原始引用' : '草稿／證據待確認'}</span></div>
        <p className="note">前期 {context.session.scope.previous_period.start} — {context.session.scope.previous_period.end} · 本期 {context.session.period.start} — {context.session.period.end} · {item.scope.channels.join('、')}{item.scope.sku ? ` · SKU ${item.scope.sku}` : ''} · 資料截至 {context.session.data_as_of}</p>
        {document.evidence_relation === 'historical' && <p className="alert">引用舊資料版本：保留原始數值與來源，不因目前資料變更而替換。管理欄位仍可編輯。</p>}
        {document.evidence_review_required && <p className="alert">舊版曾將這組引用標記過期。請開啟來源並明確確認沿用原始引用，或預覽改用目前資料；不會自動恢復確認。</p>}
        <fieldset><legend className="sr-only">編輯工作項目 {index + 1}</legend>
          <div className="action-inputs">{fields.map(([key, label]) => <label key={key}>{label}{key === 'deadline' ? <input aria-label={label} type="date" value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} /> : <textarea aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e => change(() => editBoundAction(workspace, card.id, { [key]: e.target.value }))} />}</label>)}</div>
          <label>執行狀態<select aria-label="執行狀態" value={item.execution_status ?? 'not_started'} onChange={e => change(() => editActionManagement(workspace, card.id, { execution_status: e.target.value as ActionExecutionStatus }))}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>進度紀錄<textarea aria-label="進度紀錄" rows={3} maxLength={2000} value={item.progress_notes ?? ''} onChange={e => change(() => editActionManagement(workspace, card.id, { progress_notes: e.target.value }))} /></label>
          <p className="note">管理文字與進度不改動引用確認。修改所選證據會撤銷確認；系統不驗證人工描述的成效。</p>
          <label>搜尋證據<input aria-label="搜尋證據" type="search" value={query} onChange={e => setQueries({ ...queries, [card.id]: e.target.value })} /></label>
          <label>本快照證據（可複選）<select aria-label="本快照證據（可複選）" multiple size={5} value={card.fact_ids} onChange={e => change(() => editBoundAction(workspace, card.id, { fact_ids: Array.from(e.target.selectedOptions, o => o.value) }))}>{filtered.map(f => <option key={f.id} value={f.id}>{factLabel(f)}</option>)}</select></label>
          <button className="button primary" onClick={() => { try { onChange(confirmBoundAction(workspace, card.id)); setNotice('原始引用已由使用者確認；執行狀態與管理欄位完整性分開，不代表已產生成果。'); } catch { setNotice('引用尚未確認：請選擇至少一項有效的原快照證據，並核對輸入格式。'); } }}>確認行動與證據</button>
        </fieldset>
        {document.data_limitations.length > 0 && <details><summary>原始資料限制</summary><ul>{document.data_limitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="note">資料限制保留供判讀；「所需額外資料」由使用者另外填寫。</p></details>}
        <div className="button-row"><button className="button quiet" aria-pressed={item.pinned} onClick={() => change(() => pinAction(workspace, card.id, !item.pinned))}>{item.pinned ? '取消置頂' : '置頂行動'}</button><button className="button quiet" disabled={index === 0 || workspace.items[index - 1].pinned !== item.pinned} onClick={() => change(() => moveActionUp(workspace, card.id))}>提高優先序</button><button className="text-button" onClick={() => change(() => removeBoundAction(workspace, card.id))}>移除行動</button><button className="button quiet" disabled={busy !== null || card.fact_ids.length === 0} onClick={() => void prepareRebind(card.id)}>預覽重新綁定目前資料</button></div>
        {busy === card.id && <p role="status">正在檢核相同期間與通路的引用…</p>}
        {preview?.action_id === card.id && <section role="region" aria-label="重新綁定證據預覽" className="panel"><h4>改用資料版本前核對</h4><p>保持前期 {context.session.scope.previous_period.start}～{context.session.scope.previous_period.end}、本期 {context.session.period.start}～{context.session.period.end} 與 {item.scope.channels.join('、')} 範圍。原始引用保留於歷史；未知值不補零。</p><p className="note">新資料截至 {preview.target_context.session.data_as_of}</p><div className="table-scroll" tabIndex={0}><table><caption>原引用與新資料重算值（金額 TWD，率顯示百分比）</caption><thead><tr><th>指標與期間</th><th>原始引用</th><th>新資料</th></tr></thead><tbody>{preview.facts.map((row, i) => <tr key={i}><th>{metricDefinitions[row.before.metric].label} · {row.before.period.start}～{row.before.period.end}</th><td>{factValue(row.before)}{row.before.reason_codes.length > 0 && `（${row.before.reason_codes.join('、')}）`}</td><td>{factValue(row.after)}{row.after.reason_codes.length > 0 && `（${row.after.reason_codes.join('、')}）`}</td></tr>)}</tbody></table></div><button className="button primary" disabled={busy !== null} onClick={() => void commitRebind()}>確認改用此資料版本</button><button className="button quiet" onClick={() => { request.current++; setPreview(null); setBusy(null); }}>取消重新綁定</button></section>}
        <div className="action-evidence">{card.fact_ids.map(id => choices.find(f => f.id === id)).filter((f): f is Fact => !!f).map(f => <button key={f.id} className="text-button" onClick={() => evidence(f, context)}>查看證據 · {factLabel(f)}</button>)}</div>
        <details><summary>稽核識別與原始版本</summary><p className="note">資料識別 {context.session.dataset_id}</p><p className="note">資料版本 {context.session.dataset_hash}；篩選版本 {context.session.filter_hash}；修訂 {context.session.revision}；引用版本 {item.binding_revision ?? 1}</p><p className="note">原始規則 {item.diagnostic_id ?? '手動建立'}</p><ul>{card.fact_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details>
        {document.binding_history.length > 0 && <details><summary>歷史引用（{document.binding_history.length} 版）</summary>{document.binding_history.map(binding => <section key={binding.revision}><h4>引用版本 {binding.revision}</h4><p className="note">資料截至 {binding.data_as_of} · {binding.scope.channels.join('、')} · 本期 {binding.period.start}～{binding.period.end} · {binding.evidence_confirmed ? '當時已確認' : '當時待確認'}</p>{binding.evidence.map(fact => <button key={fact.id} className="text-button" onClick={() => evidence(fact, contextFor(workspace, binding))}>查看歷史證據 · {factLabel(fact)}</button>)}</section>)}</details>}
      </article>;
    })}
    <section className="panel"><h2>下載決策工作稿</h2><p className="note">包含方案與全部行動；各行動保留自己的期間、通路、執行狀態、引用確認與歷史，稽核來源不混用。</p><div className="button-row">{(['md', 'csv', 'json'] as const).map(format => <button key={format} className="button quiet" onClick={() => { try { onExport(format); setNotice('已下載本機工作稿；各項保留自身範圍、管理狀態與歷史引用。'); } catch { setNotice('無法匯出：工作稿尚未通過檢核，請檢查內容與原始證據。'); } }}>下載決策 {format === 'md' ? 'Markdown' : format.toUpperCase()}</button>)}</div></section>
  </section>;
}
