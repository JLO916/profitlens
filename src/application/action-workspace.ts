import type { Dataset, DatasetInput, Scope, Diagnostic } from '@/domain/types';
import { createDecisionSession, decisionSignature, refreshDecisionSession, validateActionContent, validateActionEvidence, type ActionCard, type ActionCardInput, type ColumnMappings, type DecisionSession } from './decision';
import type { FilenameMap } from './export';
import type { WorkspaceSnapshot } from './workspace';

export const MAX_PINNED_ACTIONS = 3;
export interface ActionContext { id:string; session:DecisionSession; diagnostics:Diagnostic[]; source_input:DatasetInput; source_mappings?:ColumnMappings }
export interface BoundAction { card:ActionCard; context_id:string; scope:Scope; pinned:boolean; diagnostic_id?:string }
export interface ActionWorkspace { contexts:ActionContext[]; items:BoundAction[] }
export interface ActionSource { dataset:Dataset; input:DatasetInput; snapshot:WorkspaceSnapshot; revision:number; filenames?:FilenameMap; mappings?:ColumnMappings }
export function emptyActionWorkspace():ActionWorkspace { return {contexts:[],items:[]}; }
export function actionContextId(session:DecisionSession):string { return `action-${session.revision}-${session.dataset_hash}-${session.filter_hash}`; }
export function refreshActionWorkspace(workspace:ActionWorkspace,snapshot:WorkspaceSnapshot,revision:number):ActionWorkspace {
  return {...workspace,contexts:workspace.contexts.map(context=>({...context,session:refreshDecisionSession(context.session,snapshot,revision)}))};
}
export function addActionDraft(workspace:ActionWorkspace,source:ActionSource,id:string,diagnosticId?:string):ActionWorkspace {
  if(!id.trim() || workspace.items.some(item=>item.card.id===id)) throw new Error('INVALID_ITEM_ID');
  const refreshed=refreshActionWorkspace(workspace,source.snapshot,source.revision);
  const diagnostic=diagnosticId===undefined?undefined:source.snapshot.report.diagnostics.find(item=>item.id===diagnosticId);
  if(diagnosticId!==undefined&&!diagnostic) throw new Error('UNKNOWN_DIAGNOSTIC');
  const session=createDecisionSession(source.dataset,source.snapshot,source.revision,source.filenames);
  const contextId=actionContextId(session);
  const existing=refreshed.contexts.find(context=>context.id===contextId);
  if(existing?.session.stale) throw new Error('STALE_ACTION');
  const context:ActionContext=existing??{id:contextId,session,diagnostics:source.snapshot.report.diagnostics,source_input:source.input,...(source.mappings?{source_mappings:source.mappings}:{})};
  const card:ActionCard={id,problem:diagnostic?.title??'',action:diagnostic?.recommendation??'',fact_ids:[...(diagnostic?.fact_ids??[])],owner_role:'',validation_metric:'',deadline:'',stop_condition:'',required_data:diagnostic?.limitations.join('\n')??'',origin:'manual',evidence_confirmed:false};
  validateActionEvidence(session,card,false);
  return {contexts:existing?refreshed.contexts:[...refreshed.contexts,context],items:[...refreshed.items,{card,context_id:contextId,scope:structuredClone(diagnostic?.scope??{kind:'all',channels:session.scope.channels}),pinned:false,...(diagnosticId?{diagnostic_id:diagnosticId}:{})}]};
}
export function contextFor(workspace:ActionWorkspace,item:BoundAction):ActionContext {
  const context=workspace.contexts.find(entry=>entry.id===item.context_id);
  if(!context) throw new Error('ACTION_CONTEXT_MISSING');
  return context;
}
export function evidenceAllowed(scope:Scope,fact:DecisionSession['facts'][number]):boolean {
  return fact.scope.channels.every(channel=>scope.channels.includes(channel)) && (scope.kind!=='sku'||fact.scope.kind==='sku'&&fact.scope.sku===scope.sku);
}
function validEvidence(context:ActionContext,item:BoundAction,required:boolean) {
  validateActionEvidence(context.session,item.card,required);
  if(item.card.fact_ids.some(id=>!evidenceAllowed(item.scope,context.session.facts.find(fact=>fact.id===id)!))) throw new Error('ACTION_FACT_SCOPE_MISMATCH');
}
function edit(workspace:ActionWorkspace,id:string,change:(item:BoundAction,context:ActionContext)=>BoundAction):ActionWorkspace {
  const item=workspace.items.find(entry=>entry.card.id===id);if(!item) throw new Error('UNKNOWN_ACTION');
  const context=contextFor(workspace,item);if(context.session.stale) throw new Error('STALE_ACTION');
  return {...workspace,items:workspace.items.map(entry=>entry===item?change(entry,context):entry)};
}
export function editBoundAction(workspace:ActionWorkspace,id:string,patch:Partial<Omit<ActionCardInput,'id'>>):ActionWorkspace {
  return edit(workspace,id,(item,context)=>{
    const allowed=['problem','fact_ids','action','owner_role','validation_metric','deadline','stop_condition','required_data'];
    if(Object.keys(patch).some(key=>!allowed.includes(key))) throw new Error('INVALID_ACTION_FIELD');
    const next={...item,card:{...item.card,...structuredClone(patch),evidence_confirmed:false}};
    validateActionContent(next.card,false);validEvidence(context,next,false);return next;
  });
}
export function confirmBoundAction(workspace:ActionWorkspace,id:string):ActionWorkspace {
  return edit(workspace,id,(item,context)=>{validateActionContent(item.card);validEvidence(context,item,true);return {...item,card:{...item.card,evidence_confirmed:true}};});
}
/** 置頂組永遠在前；兩組各自保留原順序。取消置頂後移回未置頂組，
 * 不變更行動文字、證據或歷史綁定，也不猜測原先的工作優先序。 */
export function pinAction(workspace:ActionWorkspace,id:string,pinned:boolean):ActionWorkspace {
  if(!workspace.items.some(item=>item.card.id===id)) throw new Error('UNKNOWN_ACTION');
  if(pinned&&workspace.items.filter(item=>item.pinned&&item.card.id!==id).length>=MAX_PINNED_ACTIONS) throw new Error('MAX_PINNED_ACTIONS');
  const items=workspace.items.map(item=>item.card.id===id?{...item,pinned}:item);
  return {...workspace,items:[...items.filter(item=>item.pinned),...items.filter(item=>!item.pinned)]};
}
export function removeBoundAction(workspace:ActionWorkspace,id:string):ActionWorkspace {
  const items=workspace.items.filter(item=>item.card.id!==id);
  return {items,contexts:workspace.contexts.filter(context=>items.some(item=>item.context_id===context.id))};
}
export function moveActionUp(workspace:ActionWorkspace,id:string):ActionWorkspace {
  const index=workspace.items.findIndex(item=>item.card.id===id);if(index<=0)return workspace;
  // 提高優先序只在同組內移動；跨組必須由使用者明確置頂或取消置頂。
  if(workspace.items[index-1].pinned!==workspace.items[index].pinned)return workspace;
  const items=[...workspace.items];[items[index-1],items[index]]=[items[index],items[index-1]];return {...workspace,items};
}
/** Audit projection: no raw CSV, no causal interpretation of manual prose. */
export function actionDocuments(workspace:ActionWorkspace) {
  if(workspace.items.some(item=>!item.card.id.trim())||workspace.contexts.some(context=>!context.id.trim()))throw new Error('INVALID_ITEM_ID');
  if(new Set(workspace.items.map(item=>item.card.id)).size!==workspace.items.length||new Set(workspace.contexts.map(item=>item.id)).size!==workspace.contexts.length)throw new Error('INVALID_ITEM_ID');
  if(workspace.items.filter(item=>item.pinned).length>MAX_PINNED_ACTIONS)throw new Error('MAX_PINNED_ACTIONS');
  return workspace.items.map((item,index)=>{
    const context=contextFor(workspace,item);validateActionContent(item.card,item.card.evidence_confirmed);validEvidence(context,item,item.card.evidence_confirmed);
    const s=context.session;
    if(!item.scope.channels.length || new Set(item.scope.channels).size!==item.scope.channels.length || item.scope.channels.some(channel=>!s.scope.channels.includes(channel)) || (item.scope.kind==='sku'&&!item.scope.sku)) throw new Error('ACTION_SCOPE_MISMATCH');
    if(item.scope.kind!=='sku' && (item.scope.sku!==undefined || item.scope.category!==undefined) || item.scope.kind==='channel'&&item.scope.channels.length!==1) throw new Error('ACTION_SCOPE_MISMATCH');
    if(item.scope.kind==='sku' && !s.facts.some(fact=>fact.scope.kind==='sku'&&fact.scope.sku===item.scope.sku&&decisionSignature(fact.scope.channels)===decisionSignature(item.scope.channels)&&(item.scope.category===undefined||fact.scope.category===item.scope.category))) throw new Error('ACTION_SCOPE_MISMATCH');
    if(item.diagnostic_id) {
      const diagnostic=context.diagnostics.find(value=>value.id===item.diagnostic_id);
      if(!diagnostic || decisionSignature(diagnostic.scope)!==decisionSignature(item.scope))throw new Error('INVALID_ACTION_DIAGNOSTIC');
    }
    return {...structuredClone(item.card),priority:index+1,pinned:item.pinned,status:s.stale?'stale' as const:item.card.evidence_confirmed?'confirmed' as const:'draft' as const,diagnostic_id:item.diagnostic_id??null,evidence:item.card.fact_ids.map(id=>structuredClone(s.facts.find(fact=>fact.id===id)!)),binding:{context_id:context.id,status:s.stale?'stale' as const:'current' as const,dataset_id:s.dataset_id,dataset_hash:s.dataset_hash,filter_hash:s.filter_hash,metric_version:s.metric_version,data_as_of:s.data_as_of,revision:s.revision,period:s.period,scope:structuredClone(item.scope),analysis_scope:s.scope,comparison:s.comparison,filenames:s.filenames,stale_reasons:s.stale_reasons}};
  });
}
