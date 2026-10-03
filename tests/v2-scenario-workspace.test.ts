import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { blankScenarioInputs, blankSensitivity, reconfirmDecision, saveScenario, type ScenarioPlan } from '@/application/decision';
import { emptyScenarioWorkspace, ensureScenarioContext, activateScenarioEpoch, scenarioContextDecision, updateScenarioContext, scenarioSelectionRef, resolveScenarioReference, migrateLegacyDecisionWorkspace, copyHistoricalScenario, validateScenarioWorkspace, type ScenarioWorkspace } from '@/application/scenario-workspace';

async function source(channel='DTC', revision=1) {
  const input=fixture(); const dataset=validateDataset(input).dataset!;
  return {input,dataset,snapshot:await createSnapshot(dataset,{channels:[channel]},await hashInput(input)),revision};
}
const inputs={volume_change_pct:'0',discount_change_pp:'0',fulfillment_change_pct:'-10',ad_change_pct:'0',one_time_cost:'0',assumptions_accepted:true};
describe('A2 multi-channel scenario workspace',()=>{
 it('keeps independent contexts and fixed golden results when switching channel views',async()=>{
  const dtc=await source();let w=ensureScenarioContext(emptyScenarioWorkspace('epoch-1'),dtc);
  const c=w.contexts[0];const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:'履約',inputs});
  w=updateScenarioContext(w,c.id,d);expect(w.contexts[0].plans[0].result?.contribution).toBe('284.00');
  w=ensureScenarioContext(w,await source('MARKETPLACE',2));w=ensureScenarioContext(w,await source('DTC',3));
  expect(w.contexts).toHaveLength(2);expect(w.contexts.every(c=>c.status==='current')).toBe(true);
  expect(w.contexts[0].plans[0].result?.contribution).toBe('284.00');
 });
 it('limits each context to three plans, permits six across two channels, and never adds results',async()=>{
  let w=emptyScenarioWorkspace('e');
  for(const channel of ['DTC','MARKETPLACE']){w=ensureScenarioContext(w,await source(channel));const c=w.contexts.at(-1)!;const d=scenarioContextDecision(c);d.scenarios=[1,2,3].map(i=>({id:`p${i}`,name:'方案',inputs:blankScenarioInputs(),result:null}));w=updateScenarioContext(w,c.id,d);expect(()=>updateScenarioContext(w,c.id,{...d,scenarios:[...d.scenarios,{id:'p4',name:'多一個',inputs,result:null}]})).toThrow('MAX_SCENARIOS');}
  expect(w.contexts.flatMap(c=>c.plans)).toHaveLength(6);expect(w).not.toHaveProperty('total_delta');
 });
 it('retains a selected calculated version after editing without silently selecting the new result',async()=>{
  let w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source());const c=w.contexts[0];const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,c.id,d);
  const ref=scenarioSelectionRef(w.contexts[0],'p');const edit=scenarioContextDecision(w.contexts[0]);edit.scenarios[0]={...edit.scenarios[0],inputs:{...inputs,one_time_cost:'20'},result:null};w=updateScenarioContext(w,c.id,edit);
  const old=resolveScenarioReference(w,ref);expect(old.version.result.contribution).toBe('284.00');expect(old.status).toBe('superseded');
  const next=scenarioContextDecision(w.contexts[0]);next.scenarios=saveScenario(c.session,next.scenarios,next.scenarios[0]);w=updateScenarioContext(w,c.id,next);expect(w.contexts[0].plans[0].result?.contribution).toBe('264.00');expect(resolveScenarioReference(w,ref).version.result.contribution).toBe('284.00');
 });
 it('data/period replacement latches history even if the original period returns',async()=>{
  const s=await source();let w=ensureScenarioContext(emptyScenarioWorkspace('a'),s);const id=w.contexts[0].id;w=activateScenarioEpoch(w,'b');w=ensureScenarioContext(w,s);expect(w.contexts[0].status).toBe('historical');expect(w.contexts[1].id).not.toBe(id);expect(()=>updateScenarioContext(w,id,scenarioContextDecision(w.contexts[0]))).toThrow('HISTORICAL_SCENARIO');
 });
 it('explicit history copy keeps only its name and clears every assumption and result',async()=>{const s=await source();let w=ensureScenarioContext(emptyScenarioWorkspace('a'),s);const c=w.contexts[0];const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,c.id,d);w=activateScenarioEpoch(w,'b');w=copyHistoricalScenario(w,s,c.id,'p','copy');const copy=w.contexts[1].plans[0];expect(copy.name).toBe('履約');expect(copy.inputs).toEqual(blankScenarioInputs());expect(copy.result).toBeNull();expect(w.contexts[0].status).toBe('historical');});
 it('legacy stale decision never becomes current through migration',async()=>{
  const s=await source();const w=ensureScenarioContext(emptyScenarioWorkspace('e'),s);const d=scenarioContextDecision(w.contexts[0]);d.captured={...d.captured!,stale:true,stale_reasons:['WORKSPACE_REVISION_CHANGED']};const migrated=migrateLegacyDecisionWorkspace(d,s.snapshot,1,'new');expect(migrated.contexts[0].status).toBe('historical');
 });
});

// R5 版本號規則（02 §6、05 §8）：只有「計算成功」會前進；編輯中是草稿，版本號不動。
describe('R5 scenario revision only advances on a successful calculation',()=>{
 async function start(){const w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source());return {w,id:w.contexts[0].id};}
 const edit=(w:ScenarioWorkspace,id:string,patch:Partial<ScenarioPlan>)=>{const d=scenarioContextDecision(w.contexts[0]);d.scenarios[0]={...d.scenarios[0],...patch,result:null};return updateScenarioContext(w,id,d);};
 const calc=(w:ScenarioWorkspace,id:string,patch:Partial<ScenarioPlan>={})=>{const d=scenarioContextDecision(w.contexts[0]);d.scenarios=saveScenario(w.contexts[0].session,d.scenarios,{...d.scenarios[0],...patch});return updateScenarioContext(w,id,d);};
 const state=(w:ScenarioWorkspace)=>({revision:w.contexts[0].plans[0].revision,versions:w.contexts[0].versions.map(v=>[v.revision,v.result.contribution]),result:w.contexts[0].plans[0].result?.contribution??null});
 it('a new plan is revision 1 and stays there while drafting; the first calculation records version 1',async()=>{
  const started=await start(),id=started.id;let w=started.w;const d=scenarioContextDecision(w.contexts[0]);d.scenarios=[{id:'p',name:'方案 1',inputs:blankScenarioInputs(),result:null}];w=updateScenarioContext(w,id,d);
  expect(state(w)).toEqual({revision:1,versions:[],result:null});
  w=edit(w,id,{inputs:{...inputs,one_time_cost:'5'}});w=edit(w,id,{name:'履約',inputs});expect(state(w)).toEqual({revision:1,versions:[],result:null});
  w=calc(w,id);expect(state(w)).toEqual({revision:1,versions:[[1,'284.00']],result:'284.00'});validateScenarioWorkspace(w);
 });
 it('editing keeps the number; recalculating identical inputs reuses it; changed inputs open the next one',async()=>{
  const started=await start(),id=started.id;let w=started.w;const d=scenarioContextDecision(w.contexts[0]);d.scenarios=saveScenario(w.contexts[0].session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,id,d);
  const ref=scenarioSelectionRef(w.contexts[0],'p');
  w=edit(w,id,{inputs:{...inputs,one_time_cost:'20'}});expect(state(w)).toEqual({revision:1,versions:[[1,'284.00']],result:null});expect(resolveScenarioReference(w,ref).status).toBe('superseded');
  // 改回原值再計算：與最新版本相同 → 沿用版本 1，不新增版本，選入會議的引用恢復為目前。
  w=edit(w,id,{inputs});w=calc(w,id);expect(state(w)).toEqual({revision:1,versions:[[1,'284.00']],result:'284.00'});expect(resolveScenarioReference(w,ref).status).toBe('current');
  w=calc(w,id,{inputs:{...inputs,one_time_cost:'20'}});expect(state(w)).toEqual({revision:2,versions:[[1,'284.00'],[2,'264.00']],result:'264.00'});
  // 只比最新版本：回到 K=0 會開版本 3，不回頭指向版本 1。
  w=calc(w,id,{inputs});expect(state(w)).toEqual({revision:3,versions:[[1,'284.00'],[2,'264.00'],[3,'284.00']],result:'284.00'});
  w=calc(w,id,{name:'改名'});expect(state(w).revision).toBe(4);expect(w.contexts[0].versions.at(-1)!.name).toBe('改名');
  expect(resolveScenarioReference(w,ref).version.result.contribution).toBe('284.00');validateScenarioWorkspace(w);
 });
 it('a calculation that fails validation keeps the revision and records no version',async()=>{
  const started=await start(),id=started.id;let w=started.w;const d=scenarioContextDecision(w.contexts[0]);d.scenarios=saveScenario(w.contexts[0].session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,id,d);
  w=calc(w,id,{inputs:{...inputs,volume_change_pct:'101'}});expect(w.contexts[0].plans[0].result?.status).toBe('invalid');expect(state(w)).toEqual({revision:1,versions:[[1,'284.00']],result:null});
  w=calc(w,id,{inputs:{...inputs,volume_change_pct:'100'}});expect(state(w).revision).toBe(2);validateScenarioWorkspace(w);
 });
 it('a removed and re-added plan id continues after its highest recorded version',async()=>{
  const started=await start(),id=started.id;let w=started.w;let d=scenarioContextDecision(w.contexts[0]);d.scenarios=saveScenario(w.contexts[0].session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,id,d);
  d=scenarioContextDecision(w.contexts[0]);d.scenarios=[];w=updateScenarioContext(w,id,d);expect(w.contexts[0].plans).toEqual([]);
  d=scenarioContextDecision(w.contexts[0]);d.scenarios=[{id:'p',name:'履約',inputs:{...inputs,one_time_cost:'20'},result:null}];w=updateScenarioContext(w,id,d);expect(state(w)).toEqual({revision:2,versions:[[1,'284.00']],result:null});
  w=calc(w,id);expect(state(w)).toEqual({revision:2,versions:[[1,'284.00'],[2,'264.00']],result:'264.00'});validateScenarioWorkspace(w);
 });
});

describe('R5-4 sensitivity inputs live on the plan without touching revisions',()=>{
 const volumes:[string,string,string]=['-10','0','10'];
 it('keeps a cloned copy through updates and never changes revision or versions',async()=>{
  let w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source());const id=w.contexts[0].id;const d=scenarioContextDecision(w.contexts[0]);d.scenarios=saveScenario(w.contexts[0].session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,id,d);
  const next=scenarioContextDecision(w.contexts[0]);const sensitivity={volumes:[...volumes] as [string,string,string]};next.scenarios[0]={...next.scenarios[0],sensitivity};w=updateScenarioContext(w,id,next);
  sensitivity.volumes[0]='99';
  expect(w.contexts[0].plans[0]).toMatchObject({revision:1,sensitivity:{volumes}});expect(w.contexts[0].versions).toHaveLength(1);expect(w.contexts[0].versions[0]).not.toHaveProperty('sensitivity');
  // 草稿編輯也保留敏感度；重新計算仍保留。
  const drafting=scenarioContextDecision(w.contexts[0]);drafting.scenarios[0]={...drafting.scenarios[0],inputs:{...inputs,one_time_cost:'20'},result:null};w=updateScenarioContext(w,id,drafting);expect(w.contexts[0].plans[0].sensitivity).toEqual({volumes});
  const again=scenarioContextDecision(w.contexts[0]);again.scenarios=saveScenario(w.contexts[0].session,again.scenarios,again.scenarios[0]);w=updateScenarioContext(w,id,again);expect(w.contexts[0].plans[0]).toMatchObject({revision:2,sensitivity:{volumes}});
  expect(w.contexts[0].versions.every(v=>!('sensitivity' in v))).toBe(true);validateScenarioWorkspace(w);
  expect(blankSensitivity()).toEqual({volumes:['','','']});expect(blankSensitivity()).not.toBe(blankSensitivity());
 });
 it('rejects malformed sensitivity on update and in workspace validation',async()=>{
  const w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source());const id=w.contexts[0].id;
  for(const bad of [{volumes:['1','2']},{volumes:[1,2,3]},{volumes:['1'.repeat(101),'','']},{volumes:['1','2','3'],extra:true},null,['1','2','3']]){
   const d=scenarioContextDecision(w.contexts[0]);d.scenarios=[{id:'p',name:'方案',inputs:blankScenarioInputs(),result:null,sensitivity:bad as never}];
   expect(()=>updateScenarioContext(w,id,d)).toThrow('INVALID_SENSITIVITY_INPUT');
   const forged=structuredClone(w);forged.contexts[0].plans=[{id:'p',name:'方案',revision:1,inputs:blankScenarioInputs(),result:null,sensitivity:bad as never}];
   expect(()=>validateScenarioWorkspace(forged)).toThrow('INVALID_SENSITIVITY_INPUT');
  }
 });
 it('history copy and reconfirmation clear the sensitivity inputs with every other assumption',async()=>{
  const s=await source();let w=ensureScenarioContext(emptyScenarioWorkspace('a'),s);const c=w.contexts[0];const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:'履約',inputs,sensitivity:{volumes}});w=updateScenarioContext(w,c.id,d);
  expect(w.contexts[0].plans[0].sensitivity).toEqual({volumes});
  w=activateScenarioEpoch(w,'b');w=copyHistoricalScenario(w,s,c.id,'p','copy');const copy=w.contexts[1].plans[0];expect(copy.name).toBe('履約');expect(copy.sensitivity).toBeUndefined();expect(w.contexts[0].plans[0].sensitivity).toEqual({volumes});
  const fresh=reconfirmDecision(c.session,scenarioContextDecision(w.contexts[0]).scenarios,[],s.dataset,s.snapshot,2);
  expect(fresh.scenarios[0]).toEqual({id:'p',name:'履約',inputs:blankScenarioInputs(),result:null});expect(fresh.scenarios[0].sensitivity).toBeUndefined();
 });
});
