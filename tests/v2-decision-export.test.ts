import { it, expect } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { blankScenarioInputs } from '@/application/decision';
import { calculateScenario } from '@/domain/scenarios';
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext } from '@/application/scenario-workspace';
import { emptyActionWorkspace } from '@/application/action-workspace';
import { exportWorkspaceDecision } from '@/application/workspace-decision-export';

it('exports both channel baselines and revisions without raw CSV or summed gains', async () => {
 const input=fixture(), dataset=validateDataset(input).dataset!, hash=await hashInput(input);
 let workspace=emptyScenarioWorkspace('test');
 for(const channel of ['DTC','MARKETPLACE']) {
  const snapshot=await createSnapshot(dataset,{channels:[channel]},hash);
  workspace=ensureScenarioContext(workspace,{input,dataset,snapshot,revision:1});
  const context=workspace.contexts.at(-1)!, draft=scenarioContextDecision(context);
  const inputs={...blankScenarioInputs(),volume_change_pct:'0',discount_change_pp:'0',fulfillment_change_pct:'-10',ad_change_pct:'0',one_time_cost:'0',assumptions_accepted:true};
  draft.scenarios=[{id:channel,name:channel+' test',inputs,result:calculateScenario(context.session.baseline,inputs)}];
  workspace=updateScenarioContext(workspace,context.id,draft);
 }
 const source={input,dataset,snapshot:await createSnapshot(dataset,{},hash),revision:3};
 const json=JSON.parse(exportWorkspaceDecision('json',source,workspace,emptyActionWorkspace(),null));
 expect(json.scenario_contexts).toHaveLength(2);
 expect(json.scenario_contexts[0].scenarios[0].result.contribution).toBe('284.00');
 expect(json.scenario_contexts[1].scenarios[0].result.contribution).toBe('-6.50');
 expect(json.scenario_contexts[0].plan_revisions).toEqual({DTC:1});
 expect(JSON.stringify(json)).not.toContain(input.files['sales_daily.csv']);
 expect(json).not.toHaveProperty('total_improvement');
 for(const format of ['md','csv'] as const) {
  const output=exportWorkspaceDecision(format,source,workspace,emptyActionWorkspace(),null);
  expect(output).toContain('DTC'); expect(output).toContain('MARKETPLACE'); expect(output).toContain('284');
 }
});
