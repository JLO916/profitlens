import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { saveScenario } from '@/application/decision';
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, scenarioSelectionRef } from '@/application/scenario-workspace';
import { createReviewSession, updateReviewSession, selectReviewScenario, refreshReviewSession, validateReviewSession, buildReviewDecisionContext, syncReviewPins, refreshReviewActionReferences, refreshReviewScenarioReferences, rebuildReviewSnapshot } from '@/application/review-session';
import { emptyActionWorkspace, addActionDraft, pinAction, editBoundAction, confirmBoundAction, refreshActionWorkspace, actionDocuments } from '@/application/action-workspace';
import { buildManagerSummary, exportManagerSummaryMarkdown } from '@/application/manager-summary';
import { labels } from '@/i18n';
import { synthetic4ChannelInput } from './helpers/synthetic-4-channel';
import { SYNTHETIC_CHANNEL_SETTINGS } from './helpers/page-states';
async function source(channel?:string){const input=fixture();const dataset=validateDataset(input).dataset!;return{input,dataset,snapshot:await createSnapshot(dataset,channel?{channels:[channel]}:{},await hashInput(input)),revision:1};}
const inputs={volume_change_pct:'0',discount_change_pp:'0',fulfillment_change_pct:'-10',ad_change_pct:'0',one_time_cost:'0',assumptions_accepted:true};
describe('A2 restorable fixed-source review session',()=>{
 it('persists review choices independently from view filters and keeps the target explicitly null',async()=>{
  const s=await source();let r=createReviewSession(s,'e','meeting');r=updateReviewSession(r,{name:'週會',importance_threshold:'10',notes:'待查物流',decision_state:'needs_data'});expect(r.importance_threshold).toBe('10.00');expect(r.target_version).toBeNull();expect(r.meeting_filters.channels).toEqual(['DTC','MARKETPLACE']);expect(refreshReviewSession(r,'e').status).toBe('current');expect(refreshReviewSession(r,'new').status).toBe('historical');expect(refreshReviewSession(refreshReviewSession(r,'new'),'e').status).toBe('historical');
 });
 it('selects one version per channel and exposes separate scope results without any total',async()=>{
  let w=emptyScenarioWorkspace('e');let r=createReviewSession(await source(),'e','meeting');
  for(const channel of ['DTC','MARKETPLACE']){w=ensureScenarioContext(w,await source(channel));const c=w.contexts.at(-1)!;const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:channel,inputs});w=updateScenarioContext(w,c.id,d);r=selectReviewScenario(r,w,scenarioSelectionRef(w.contexts.at(-1)!,'p'));}
  expect(r.selected_scenarios).toHaveLength(2);validateReviewSession(r,w);const context=buildReviewDecisionContext(r,w,emptyActionWorkspace());expect(context.selectedScenarioIds).toHaveLength(2);expect(context).not.toHaveProperty('total_delta');
 });
 it('rejects wrong channel/version references and does not mutate the meeting',async()=>{
  const r=createReviewSession(await source(),'e','meeting');const w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source('DTC'));expect(()=>selectReviewScenario(r,w,{context_id:w.contexts[0].id,plan_id:'missing',plan_revision:1,channel:'MARKETPLACE'})).toThrow();expect(r.selected_scenarios).toEqual([]);
 });
 it('main summary includes only pinned actions, with the rest safely escaped in appendix',async()=>{
  const s=await source();let a=emptyActionWorkspace();for(let i=0;i<5;i++)a=addActionDraft(a,s,`a${i}`);for(let i=0;i<3;i++)a=pinAction(a,`a${i}`,true);
  const r=syncReviewPins(createReviewSession(s,'e','m'),a);expect(r.pinned_action_ids).toEqual(['a0','a1','a2']);const context=buildReviewDecisionContext(r,emptyScenarioWorkspace('e'),a);expect(context.actions.filter(a=>a.pinned)).toHaveLength(3);
  const md=exportManagerSummaryMarkdown(buildManagerSummary(s.snapshot),context);const mainLayer=md.split(`## ${labels.evidence.sections.technicalDetails}`)[0];expect(mainLayer.match(new RegExp(labels.actions.form.owner,'g'))).toHaveLength(3);expect(md).toContain(labels.meeting.managerSummary.otherActions);expect(md.split(labels.meeting.managerSummary.otherActions)[1].match(new RegExp(labels.actions.form.owner,'g'))).toHaveLength(2);
 });
 it('rebuild rejects a forged fixed-source filter hash',async()=>{const r=createReviewSession(await source(),'e','m');await expect(rebuildReviewSnapshot({...r,filter_hash:'0'.repeat(64)})).rejects.toThrow('REVIEW_SOURCE_MISMATCH');});
 it('editing a selected plan invalidates the decision but preserves the exact selected version',async()=>{let w=ensureScenarioContext(emptyScenarioWorkspace('e'),await source('DTC'));const c=w.contexts[0];const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:'履約',inputs});w=updateScenarioContext(w,c.id,d);let r=selectReviewScenario(createReviewSession(await source(),'e','m'),w,scenarioSelectionRef(w.contexts[0],'p'));r=updateReviewSession(r,{decision_state:'adopted'});const edit=scenarioContextDecision(w.contexts[0]);edit.scenarios[0]={...edit.scenarios[0],name:'新方案',result:null};w=updateScenarioContext(w,c.id,edit);expect(()=>validateReviewSession(r,w)).toThrow('REVIEW_ADOPTED_STALE_SCENARIO');const changed=refreshReviewScenarioReferences(r,w);expect(changed.decision_state).toBe('draft');expect(changed.selected_scenarios).toEqual(r.selected_scenarios);expect(buildReviewDecisionContext(changed,w,emptyActionWorkspace()).scenarios[0].contribution).toBe('284.00');});
 it('a historical meeting action remains historical relative to the active replacement dataset',async()=>{const old=await source();const replacement=fixture('demo');const dataset=validateDataset(replacement).dataset!;const current=await createSnapshot(dataset,{},await hashInput(replacement));let actions=refreshActionWorkspace(emptyActionWorkspace(),current,2);actions=addActionDraft(actions,old,'historical',old.snapshot.report.diagnostics[0].id);actions=refreshActionWorkspace(actions,current,2);const doc=actionDocuments(actions)[0];expect(actions.active_dataset_hash).toBe(current.dataset_hash);expect(doc.evidence_relation).toBe('historical');expect(doc.binding.dataset_hash).toBe(old.snapshot.dataset_hash);expect(doc.evidence.every(fact=>old.snapshot.report.facts.some(original=>original.id===fact.id && original.value===fact.value))).toBe(true);});
 it('creating a meeting after a legacy restore can preserve existing pins and their bindings',async()=>{const s=await source();let actions=addActionDraft(emptyActionWorkspace(),s,'legacy');actions=pinAction(actions,'legacy',true);const legacy={contexts:actions.contexts,items:actions.items.map(({card,context_id,scope,pinned,diagnostic_id})=>({card,context_id,scope,pinned,diagnostic_id}))};const restored=syncReviewPins(createReviewSession(s,'restored','legacy-review'),legacy);expect(restored.pinned_action_ids).toEqual(['legacy']);expect(restored.action_bindings).toEqual([{action_id:'legacy',context_id:legacy.items[0].context_id,binding_revision:1}]);expect(buildReviewDecisionContext(restored,emptyScenarioWorkspace('restored'),legacy).actions[0].pinned).toBe(true);});
 it('binding mismatch cannot silently replace a same-ID action reference',async()=>{
  const s=await source();let a=addActionDraft(emptyActionWorkspace(),s,'a');a=editBoundAction(a,'a',{fact_ids:[a.contexts[0].session.facts[0].id]});a=confirmBoundAction(a,'a');a=pinAction(a,'a',true);const r=syncReviewPins(createReviewSession(s,'e','m'),a);const changed=editBoundAction(a,'a',{fact_ids:[a.contexts[0].session.facts[1].id]});const ctx=buildReviewDecisionContext(r,emptyScenarioWorkspace('e'),changed);expect(ctx.actions[0].status).toBe('stale');const decided=updateReviewSession(r,{decision_state:'adopted'});expect(syncReviewPins(decided,changed).decision_state).toBe('draft');const refreshed=refreshReviewActionReferences(r,changed,['a']);expect(refreshed.action_bindings[0].binding_revision).toBe(r.action_bindings[0].binding_revision+1);expect(buildReviewDecisionContext(refreshed,emptyScenarioWorkspace('e'),changed).actions[0].status).toBe('draft');
 });
});

// ── V42-2a 子集稽核第 12b 條（verification/revamp-v42/V42-0-subset-audit.md；設計 §5 最後一列）：review-session.ts 的 meeting_filters 與 .includes(ref.channel) 以成員資格判斷，不受影響，補測試。群組範圍與單一通路範圍都跑。
describe('V42-2a 子集稽核第 12b 條（不受影響，補測試）：群組範圍與單一通路範圍的會議快照只接受成員',()=>{
 async function synthetic(channels:string[]){const input=synthetic4ChannelInput();const dataset=validateDataset(input).dataset!;return{input,dataset,snapshot:await createSnapshot(dataset,{channels},await hashInput(input),SYNTHETIC_CHANNEL_SETTINGS),revision:1,channel_settings:SYNTHETIC_CHANNEL_SETTINGS};}
 async function plan(w:ReturnType<typeof emptyScenarioWorkspace>,channel:string){const next=ensureScenarioContext(w,await synthetic([channel]));const c=next.contexts.at(-1)!;const d=scenarioContextDecision(c);d.scenarios=saveScenario(c.session,[],{id:'p',name:channel,inputs});return updateScenarioContext(next,c.id,d);}
 it('群組範圍（g1＝DTC＋SOCIAL，成員任意順序）：meeting_filters.channels＝排序後的成員代碼；成員 DTC 的方案可選入，非成員 MARKETPLACE 被拒絕（REVIEW_SCENARIO_SCOPE_MISMATCH），寫進引用也被驗證擋下',async()=>{
  const grouped=await synthetic(['SOCIAL','DTC']);let r=createReviewSession(grouped,'e','meeting');
  expect(r.meeting_filters.channels).toEqual(['DTC','SOCIAL']);expect(r.filter_hash).toBe(grouped.snapshot.filter_hash);
  let w=await plan(emptyScenarioWorkspace('e'),'DTC');const dtc=w.contexts[0];
  r=selectReviewScenario(r,w,scenarioSelectionRef(dtc,'p'));
  expect(r.selected_scenarios).toEqual([{context_id:dtc.id,plan_id:'p',plan_revision:1,channel:'DTC'}]);
  validateReviewSession(r,w);
  expect(buildReviewDecisionContext(r,w,emptyActionWorkspace()).scenarios.map(row=>row.binding?.channels)).toEqual([['DTC']]);
  w=await plan(w,'MARKETPLACE');const market=w.contexts[1];
  expect(()=>selectReviewScenario(r,w,scenarioSelectionRef(market,'p'))).toThrow('REVIEW_SCENARIO_SCOPE_MISMATCH');
  expect(()=>selectReviewScenario(r,w,null,'MARKETPLACE')).toThrow('REVIEW_SCENARIO_SCOPE_MISMATCH');
  expect(()=>selectReviewScenario(r,w,null,'LIVE')).toThrow('REVIEW_SCENARIO_SCOPE_MISMATCH');
  expect(()=>validateReviewSession({...r,selected_scenarios:[...r.selected_scenarios,scenarioSelectionRef(market,'p')]},w)).toThrow('INVALID_REVIEW_SCENARIO_REFERENCE');
  expect(r.selected_scenarios).toHaveLength(1);
 });
 it('單一通路範圍（群組成員 DTC）：meeting_filters.channels＝[DTC]；DTC 的方案可選入，同群組的另一個成員 SOCIAL 也被拒絕',async()=>{
  const single=await synthetic(['DTC']);let r=createReviewSession(single,'e','meeting');
  expect(r.meeting_filters.channels).toEqual(['DTC']);
  const w=await plan(emptyScenarioWorkspace('e'),'DTC');
  r=selectReviewScenario(r,w,scenarioSelectionRef(w.contexts[0],'p'));
  expect(r.selected_scenarios.map(row=>row.channel)).toEqual(['DTC']);
  expect(()=>selectReviewScenario(r,w,null,'SOCIAL')).toThrow('REVIEW_SCENARIO_SCOPE_MISMATCH');
  validateReviewSession(r,w);
 });
});
