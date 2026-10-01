"use client";
import { useState } from 'react';
import type { Fact } from '@/domain/types';
import { addActionDraft, confirmBoundAction, contextFor, editBoundAction, evidenceAllowed, moveActionUp, pinAction, removeBoundAction, type ActionContext, type ActionSource, type ActionWorkspace } from '@/application/action-workspace';
import { formatMoney, formatRate, metricDefinitions } from '@/application/presentation';
import type { EvidenceSelection } from './evidence-drawer';
const fields=[['problem','問題'],['action','具體動作'],['owner_role','負責角色'],['validation_metric','驗證指標'],['deadline','期限'],['stop_condition','停止條件'],['required_data','所需額外資料']] as const;
function factLabel(f:Fact) { const def=metricDefinitions[f.metric];return `${f.period.start}–${f.period.end} · ${def.label} · ${f.scope.channels.join('、')}${f.scope.sku?`／SKU ${f.scope.sku}`:''}（${f.scope.kind==='all'?'範圍合計':f.scope.kind==='sku'?'商品':'通路'}） · ${def.unit==='money'?formatMoney(f.value):def.unit==='percent'?formatRate(f.value):f.value??'未知'}`; }
export function ActionsWorkbench({workspace,onChange,source,onEvidence,onExport}:{workspace:ActionWorkspace;onChange:(next:ActionWorkspace)=>void;source:ActionSource;onEvidence:(selection:EvidenceSelection,context:ActionContext)=>void;onExport:(format:'md'|'csv'|'json')=>void}) {
 const [notice,setNotice]=useState('');const [queries,setQueries]=useState<Record<string,string>>({});
 function change(work:()=>ActionWorkspace) {try{onChange(work());setNotice('');}catch(e){setNotice(e instanceof Error&&e.message==='MAX_PINNED_ACTIONS'?'最多置頂三項，請先取消其他置頂；工作項目總數不受三項限制。':'尚未完成：請核對七個欄位、有效期限、證據與原始範圍。');}}
 function evidence(fact:Fact,context:ActionContext){onEvidence({title:`行動證據 · ${metricDefinitions[fact.metric].label}`,name:fact.metric,metric:fact,period:fact.period,channels:fact.scope.channels,sources:fact.sources,scopeLabel:`${context.session.stale?'歷史證據 · ':''}${fact.scope.sku?`SKU ${fact.scope.sku} · 僅商品毛利`:fact.scope.channels.join('、')}`},context);}
 return <section data-testid="actions-workbench" aria-labelledby="actions-heading">
  <div className="section-heading"><div><h2 id="actions-heading">優先行動工作稿</h2><p className="note">行動獨立於情境模型，可涵蓋多個通路。最多置頂三項，工作項目總數不限；每項保留建立時的期間、通路與證據。來源改變後仍可查閱歷史，須另外建立目前範圍草稿。</p></div><button className="button primary" onClick={()=>change(()=>addActionDraft(workspace,source,crypto.randomUUID()))}>新增行動</button></div>
  <p className="note">目前 {workspace.items.length} 項／置頂 {workspace.items.filter(x=>x.pinned).length} 項。人工作業尚未執行，確認不代表已達成效果。</p>
  {notice&&<p role="status" className="alert" data-testid="action-notice">{notice}</p>}
  {!workspace.items.length&&<p className="empty-note">尚無行動。可從通路診斷建立草稿，或自行新增。</p>}
  {workspace.items.map((item,index)=>{
   const context=contextFor(workspace,item);const stale=context.session.stale;const card=item.card;
   const choices=context.session.facts.filter(f=>evidenceAllowed(item.scope,f));
   const query=queries[card.id]??'';const filtered=choices.filter(f=>card.fact_ids.includes(f.id)||factLabel(f).toLowerCase().includes(query.trim().toLowerCase()));
   return <article key={card.id} className="panel action-card" data-testid={`action-${index+1}`}>
    <div className="section-heading"><h3>{item.pinned?'置頂':'工作項目'} {index+1}</h3><span className={`tag ${stale?'blocking':''}`}>{stale?'已過期 · 歷史證據':card.evidence_confirmed?'使用者已確認':'草稿／證據待確認'}</span></div>
    <p className="note">前期 {context.session.scope.previous_period.start} — {context.session.scope.previous_period.end} · 本期 {context.session.period.start} — {context.session.period.end} · {item.scope.channels.join('、')}{item.scope.sku?` · SKU ${item.scope.sku}`:''} · 資料截至 {context.session.data_as_of}</p>
    {stale&&<p className="alert">此項沿用歷史資料，停止編輯與確認；目前範圍的新行動不會改寫此項證據。<button className="text-button" onClick={()=>change(()=>{let next=addActionDraft(workspace,source,crypto.randomUUID());const id=next.items.at(-1)!.card.id;const {problem,action,owner_role,validation_metric,deadline,stop_condition,required_data}=card;next=editBoundAction(next,id,{problem,action,owner_role,validation_metric,deadline,stop_condition,required_data});return next;})}>複製文字至目前範圍</button></p>}
    <fieldset disabled={stale}><legend className="sr-only">編輯工作項目 {index+1}</legend>
      <div className="action-inputs">{fields.map(([key,label])=><label key={key}>{label}{key==='deadline'?<input aria-label={label} type="date" value={card[key]} onChange={e=>change(()=>editBoundAction(workspace,card.id,{[key]:e.target.value}))}/>:<textarea aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e=>change(()=>editBoundAction(workspace,card.id,{[key]:e.target.value}))}/>}</label>)}</div>
      <label>搜尋證據<input aria-label="搜尋證據" type="search" value={query} onChange={e=>setQueries({...queries,[card.id]:e.target.value})}/></label>
      <label>本快照證據（可複選）<select aria-label="本快照證據（可複選）" multiple size={5} value={card.fact_ids} onChange={e=>change(()=>editBoundAction(workspace,card.id,{fact_ids:Array.from(e.target.selectedOptions,o=>o.value)}))}>{filtered.map(f=><option key={f.id} value={f.id}>{factLabel(f)}</option>)}</select></label>
      <button className="button primary" onClick={()=>{try{onChange(confirmBoundAction(workspace,card.id));setNotice('行動與證據已由使用者確認；不是已執行或已達成成果。');}catch{setNotice('行動尚未確認：請填完七個欄位並選擇至少一項本快照證據；期限必須有效。');}}}>確認行動與證據</button>
    </fieldset>
    <div className="button-row"><button className="button quiet" aria-pressed={item.pinned} onClick={()=>change(()=>pinAction(workspace,card.id,!item.pinned))}>{item.pinned?'取消置頂':'置頂行動'}</button><button className="button quiet" disabled={index===0||workspace.items[index-1].pinned!==item.pinned} onClick={()=>change(()=>moveActionUp(workspace,card.id))}>提高優先序</button><button className="text-button" onClick={()=>change(()=>removeBoundAction(workspace,card.id))}>移除行動</button></div>
    <div className="action-evidence">{card.fact_ids.map(id=>choices.find(f=>f.id===id)).filter((f):f is Fact=>!!f).map(f=><button key={f.id} className="text-button" onClick={()=>evidence(f,context)}>查看證據 · {factLabel(f)}</button>)}</div>
    <details><summary>稽核識別與原始版本</summary><p className="note">資料識別 {context.session.dataset_id}</p><p className="note">資料版本 {context.session.dataset_hash}；篩選版本 {context.session.filter_hash}；修訂 {context.session.revision}</p><p className="note">原始規則 {item.diagnostic_id??'手動建立'}</p><ul>{card.fact_ids.map(id=><li key={id}><code>{id}</code></li>)}</ul></details>
   </article>;
  })}
  <section className="panel"><h2>下載決策工作稿</h2><p className="note">包含方案與全部行動；各行動保留自己的期間、通路、草稿／確認／過期狀態，稽核來源不混用。行動不受情境的單通路及固定費率假設限制。</p><div className="button-row">{(['md','csv','json'] as const).map(format=><button key={format} className="button quiet" onClick={()=>{try{onExport(format);setNotice("已下載本機工作稿；各項保留自身範圍、草稿與歷史證據。");}catch{setNotice("無法匯出：工作稿尚未通過檢核，請檢查內容與原始證據。");}}}>下載決策 {format==='md'?'Markdown':format.toUpperCase()}</button>)}</div></section>
 </section>;
}
