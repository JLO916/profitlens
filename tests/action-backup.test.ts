import { it, expect } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { emptyDecisionWorkspace, createDecisionSession } from '@/application/decision';
import { emptyActionWorkspace, addActionDraft, pinAction, refreshActionWorkspace } from '@/application/action-workspace';
import { exportWorkspaceBackup, restoreWorkspaceBackup } from '@/application/workspace-backup';
it('keeps independent cross-scope actions and more than three work items through a v2 backup',async()=>{
 const input=fixture();const dataset=validateDataset(input).dataset!;const hash=await hashInput(input);
 const a=await createSnapshot(dataset,{channels:['DTC']},hash);const b=await createSnapshot(dataset,{channels:['MARKETPLACE']},hash);
 let w=emptyActionWorkspace();for(let n=1;n<=4;n++)w=addActionDraft(w,{input,dataset,snapshot:a,revision:1},String(n));
 w=pinAction(w,'1',true);w=refreshActionWorkspace(w,b,2);w=addActionDraft(w,{input,dataset,snapshot:b,revision:2},'5');
 const saved=await exportWorkspaceBackup({input,filters:b.report.scope,id:'golden',revision:2,decision:emptyDecisionWorkspace(),action_workspace:w});
 expect(JSON.parse(saved).schema_version).toBe('profitlens-workspace-v2');
 const result=await restoreWorkspaceBackup(saved);expect(result.action_workspace?.items).toHaveLength(5);
 expect(result.action_workspace?.contexts[0].session.stale).toBe(true);expect(result.action_workspace?.items[0].pinned).toBe(true);
 expect(result.action_workspace?.contexts[1].session.scope.channels).toEqual(['MARKETPLACE']);
});
it('migrates first-batch decision actions without losing their original scope or evidence',async()=>{
 const input=fixture();const dataset=validateDataset(input).dataset!;const snapshot=await createSnapshot(dataset,{},await hashInput(input));
 const decision=emptyDecisionWorkspace();decision.captured=createDecisionSession(dataset,snapshot,1);decision.source_input=input;
 decision.actions=[{id:'old',problem:'舊稿',action:'',owner_role:'',validation_metric:'',deadline:'',stop_condition:'',required_data:'',fact_ids:[],origin:'manual',evidence_confirmed:false}];
 const legacy=JSON.parse(await exportWorkspaceBackup({input,filters:snapshot.report.scope,id:'golden',revision:1,decision}));
 legacy.schema_version='profitlens-workspace-v1';
 const {checksum:oldChecksum,...body}=legacy;void oldChecksum;
 const {decisionSignature}=await import('@/application/decision');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(decisionSignature(body)));
 legacy.checksum=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const restored=await restoreWorkspaceBackup(JSON.stringify(legacy));
 expect(restored.action_workspace?.items[0].card.problem).toBe('舊稿');expect(restored.action_workspace?.contexts[0].session.scope.channels).toEqual(['DTC','MARKETPLACE']);
});

it.each(['fake-sku','fake-rule','blank-id','channel-count','unknown-sku'])('rejects re-signed semantic tampering: %s',async(kind)=>{
 const input=fixture();const dataset=validateDataset(input).dataset!;const snapshot=await createSnapshot(dataset,{},await hashInput(input));
 const w=addActionDraft(emptyActionWorkspace(),{input,dataset,snapshot,revision:1},'a',snapshot.report.diagnostics[0].id);
 const envelope=JSON.parse(await exportWorkspaceBackup({input,filters:snapshot.report.scope,id:'golden',revision:1,decision:emptyDecisionWorkspace(),action_workspace:w}));
 const item=envelope.payload.action_workspace.items[0];
 if(kind==='fake-sku')item.scope={kind:'all',channels:['DTC'],sku:'NOT-A-REAL-SKU'};
 if(kind==='fake-rule')item.diagnostic_id='INVENTED-RULE';
 if(kind==='blank-id')item.card.id=' ';
 if(kind==='channel-count')item.scope={kind:'channel',channels:['DTC','MARKETPLACE']};
 if(kind==='unknown-sku'){item.scope={kind:'sku',channels:['DTC'],sku:'NOT-A-REAL-SKU'};item.card.fact_ids=[];delete item.diagnostic_id;}
 const {checksum:ignored,...body}=envelope;void ignored;
 const {decisionSignature}=await import('@/application/decision');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(decisionSignature(body)));
 envelope.checksum=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 await expect(restoreWorkspaceBackup(JSON.stringify(envelope))).rejects.toThrow();
});
