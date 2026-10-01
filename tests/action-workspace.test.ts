import { describe, it, expect } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { emptyActionWorkspace, addActionDraft, editBoundAction, confirmBoundAction, pinAction, moveActionUp, refreshActionWorkspace, actionDocuments } from '@/application/action-workspace';
async function setup(channels?:string[], revision=1) {
  const input=fixture(); const dataset=validateDataset(input).dataset!;
  const snapshot=await createSnapshot(dataset,{channels},await hashInput(input));
  return {input,dataset,snapshot,revision};
}
const fields={problem:'核查',action:'核對來源',owner_role:'營運',validation_metric:'商品淨營收',deadline:'2026-10-08',stop_condition:'口徑不同停止',required_data:'帳單'};
describe('PL05 independent action workspace',()=>{
 it('creates a cross-channel diagnostic draft with exactly its facts, no automatic confirmation',async()=>{
  const s=await setup();const diagnostic=s.snapshot.report.diagnostics.find(x=>x.code==='REV_UP_CM_DOWN'&&x.scope.kind==='all')!;
  const w=addActionDraft(emptyActionWorkspace(),s,'A',diagnostic.id);
  expect(w.items[0].card.fact_ids).toEqual(diagnostic.fact_ids);
  expect(w.items[0].card.evidence_confirmed).toBe(false);
  expect(w.contexts[0].session.scope.channels).toEqual(['DTC','MARKETPLACE']);
  expect(w.items[0].card.problem).toBe(diagnostic.title);
  expect(()=>addActionDraft(w,s,'B','invented')).toThrow('UNKNOWN_DIAGNOSTIC');
 });
 it('allows more than three total actions, but only three pinned',async()=>{
  const s=await setup();let w=emptyActionWorkspace();
  for(let n=1;n<=5;n++) w=addActionDraft(w,s,String(n));
  expect(w.items).toHaveLength(5); expect(w.contexts).toHaveLength(1);
  for(const id of ['1','2','3']) w=pinAction(w,id,true);
  expect(()=>pinAction(w,'4',true)).toThrow('MAX_PINNED_ACTIONS');
  w=pinAction(w,'2',false); w=pinAction(w,'4',true);
  expect(w.items.filter(x=>x.pinned).map(x=>x.card.id)).toEqual(['1','3','4']);
 });
 it('pinning the fifth action moves it to the front and preserves each group order without changing facts',async()=>{
  const s=await setup();let original=emptyActionWorkspace();
  for(let n=1;n<=5;n++) original=addActionDraft(original,s,String(n));
  const before=structuredClone(original);
  let w=pinAction(original,'5',true);
  expect(w.items.map(x=>x.card.id)).toEqual(['5','1','2','3','4']);
  w=pinAction(w,'3',true);
  expect(w.items.map(x=>x.card.id)).toEqual(['5','3','1','2','4']);
  expect(w.items.map(x=>x.pinned)).toEqual([true,true,false,false,false]);
  expect(w.contexts).toEqual(original.contexts);
  for(const item of w.items)expect(item.card).toEqual(original.items.find(x=>x.card.id===item.card.id)!.card);
  expect(original).toEqual(before);
  expect(actionDocuments(w).map(x=>[x.id,x.priority])).toEqual([['5',1],['3',2],['1',3],['2',4],['4',5]]);
 });
 it('unpinning returns the item to the unpinned group and keeps all remaining relative positions',async()=>{
  const s=await setup();let w=emptyActionWorkspace();
  for(let n=1;n<=5;n++) w=addActionDraft(w,s,String(n));
  w=pinAction(pinAction(w,'5',true),'3',true);
  w=pinAction(w,'5',false);
  expect(w.items.map(x=>x.card.id)).toEqual(['3','5','1','2','4']);
  expect(w.items.map(x=>x.pinned)).toEqual([true,false,false,false,false]);
  expect(pinAction(w,'3',true).items).toEqual(w.items);
 });
 it('move up can reorder inside either group but cannot cross the pinned boundary',async()=>{
  const s=await setup();let w=emptyActionWorkspace();
  for(let n=1;n<=5;n++) w=addActionDraft(w,s,String(n));
  w=pinAction(pinAction(w,'5',true),'3',true);
  expect(moveActionUp(w,'1')).toBe(w);
  w=moveActionUp(w,'3');
  expect(w.items.map(x=>x.card.id)).toEqual(['3','5','1','2','4']);
  w=moveActionUp(w,'2');
  expect(w.items.map(x=>x.card.id)).toEqual(['3','5','2','1','4']);
  expect(moveActionUp(w,'2')).toBe(w);
  expect(moveActionUp(w,'3')).toBe(w);
  expect(w.items.map(x=>x.pinned)).toEqual([true,true,false,false,false]);
 });
 it('human confirms only valid original facts, edits revoke confirmation',async()=>{
  const s=await setup();const d=s.snapshot.report.diagnostics[0];let w=addActionDraft(emptyActionWorkspace(),s,'A',d.id);
  expect(()=>confirmBoundAction(w,'A')).toThrow();
  w=editBoundAction(w,'A',fields);w=confirmBoundAction(w,'A');expect(w.items[0].card.evidence_confirmed).toBe(true);
  w=editBoundAction(w,'A',{problem:'修改'});expect(w.items[0].card.evidence_confirmed).toBe(false);
  expect(()=>editBoundAction(w,'A',{fact_ids:['invented']})).toThrow('UNKNOWN_FACT_ID');
  expect(()=>editBoundAction(w,'A',{fact_ids:[d.fact_ids[0],d.fact_ids[0]]})).toThrow('DUPLICATE_FACT_ID');
 });
 it('scope changes latch history, current new work coexists and never rewrites original bindings',async()=>{
  const a=await setup(['DTC']);const b=await setup(['MARKETPLACE'],2);
  let w=addActionDraft(emptyActionWorkspace(),a,'A',a.snapshot.report.diagnostics[0].id);
  const original=structuredClone(w.contexts[0]);w=refreshActionWorkspace(w,b.snapshot,2);
  expect(()=>confirmBoundAction(w,'A')).toThrow('STALE_ACTION');
  w=addActionDraft(w,b,'B'); expect(w.items).toHaveLength(2);
  w=refreshActionWorkspace(w,a.snapshot,3);expect(w.contexts.every(x=>x.session.stale)).toBe(true);
  expect(w.contexts[0].session.scope).toEqual(original.session.scope);
  expect(w.contexts[0].session.facts).toEqual(original.session.facts);
  expect(actionDocuments(w)[0].binding.status).toBe('stale');
 });
 it('does not replace scope with facts from another context, serializes explicit evidence and status',async()=>{
  const s=await setup();const d=s.snapshot.report.diagnostics.find(x=>x.code==='NEGATIVE_CHANNEL_CM')!;
  let w=addActionDraft(emptyActionWorkspace(),s,'A',d.id);w=editBoundAction(w,'A',fields);w=confirmBoundAction(w,'A');
  const doc=actionDocuments(w)[0];expect(doc.evidence.map(x=>x.id)).toEqual(d.fact_ids);
  expect(doc.binding.period).toEqual(s.snapshot.report.current.period);expect(doc.status).toBe('confirmed');
  expect(doc.evidence.find(x=>x.metric==='contribution_after_marketing')?.value).toBe('-15.00');
 });
});
