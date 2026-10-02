import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { blankScenarioInputs, saveScenario } from '@/application/decision';
import { emptyScenarioWorkspace, ensureScenarioContext, activateScenarioEpoch, scenarioContextDecision, updateScenarioContext, scenarioSelectionRef, resolveScenarioReference, migrateLegacyDecisionWorkspace, copyHistoricalScenario } from '@/application/scenario-workspace';

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
