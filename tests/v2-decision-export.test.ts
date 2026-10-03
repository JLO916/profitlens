import { describe, it, expect } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { blankScenarioInputs, createDecisionSession, saveScenario, type DecisionSession, type ScenarioPlan } from '@/application/decision';
import { calculateScenario } from '@/domain/scenarios';
import { activateScenarioEpoch, emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext } from '@/application/scenario-workspace';
import { csvHeaderKey } from '@/application/copy';
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from '@/application/decision-export';
import { fill, labels } from '@/i18n';
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

// R5-4：敏感度三組輸入與結果進入決策匯出（JSON／CSV／Markdown）；沒填就不輸出。
function records(text: string): Record<string, string>[] {
 const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
 const value = text.replace(/^﻿/, '');
 for (let index = 0; index < value.length; index++) {
  const character = value[index];
  if (character === '"') { if (quoted && value[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
  else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
  else if (!quoted && (character === '\r' || character === '\n')) { if (character === '\r' && value[index + 1] === '\n') index++; row.push(cell); rows.push(row); row = []; cell = ''; }
  else cell += character;
 }
 if (cell || row.length) { row.push(cell); rows.push(row); }
 const headers = rows.shift()!.map(csvHeaderKey);
 return rows.map(values => Object.fromEntries(headers.map((key, index) => [key, values[index]])));
}
const golden = { volume_change_pct: '0', discount_change_pp: '0', fulfillment_change_pct: '-10', ad_change_pct: '0', one_time_cost: '0', assumptions_accepted: true };
async function dtc(): Promise<{ session: DecisionSession; plans: ScenarioPlan[] }> {
 const input = fixture(), dataset = validateDataset(input).dataset!;
 const session = createDecisionSession(dataset, await createSnapshot(dataset, { channels: ['DTC'] }, await hashInput(input)), 1);
 // p：已計算＋三組；q：草稿＋只填一格；r：已計算但三格空白（等同沒填）。
 let plans = saveScenario(session, [], { id: 'p', name: '履約', inputs: golden, sensitivity: { volumes: ['-10', '0', '10'] } });
 plans = [...plans, { id: 'q', name: '草稿', inputs: blankScenarioInputs(), result: null, sensitivity: { volumes: ['5', '', ''] } }];
 plans = saveScenario(session, plans, { id: 'r', name: '空白', inputs: golden, sensitivity: { volumes: ['', ' ', ''] } });
 return { session, plans };
}

describe('R5-4 sensitivity in decision exports', () => {
 it('JSON carries the inputs and an analysis recomputed from the captured baseline (hand-derived golden DTC)', async () => {
  const { session, plans } = await dtc();
  const json = JSON.parse(exportDecisionJson(session, plans, []));
  // Golden DTC f=−10%：L=1480−740−44−126−16=554、B=270；貢獻=554×(1+v)−270 → v=−10/0/+10：228.60／284.00／339.40；差額對 270。
  expect(json.scenarios[0].sensitivity).toEqual({
   volumes: ['-10', '0', '10'],
   analysis: {
    version: 'scenario-sensitivity-v1', status: 'valid', sensitivity_status: 'valid', reasons: [],
    targets: [
     { id: 'zero_contribution', target: '0.00', status: 'within_range', threshold_pct: '-51.263537906137', meets_target_when: 'at_or_above' },
     { id: 'maintain_baseline', target: '270.00', status: 'within_range', threshold_pct: '-2.527075812274', meets_target_when: 'at_or_above' },
    ],
    rows: [
     { volume_change_pct: '-10', contribution: '228.60', delta: '-41.40' },
     { volume_change_pct: '0', contribution: '284.00', delta: '14.00' },
     { volume_change_pct: '10', contribution: '339.40', delta: '69.40' },
    ],
   },
  });
  expect(json.scenarios[1].sensitivity).toEqual({ volumes: ['5', '', ''], analysis: null });
  expect(json.scenarios[2].sensitivity).toBeNull();
  // 方案本身的結果不受敏感度影響。
  expect(json.scenarios[0].result.contribution).toBe('284.00');
 });
 it('CSV adds input and result rows only for plans with sensitivity; reason_codes lead with the status', async () => {
  const { session, plans } = await dtc();
  const rows = records(exportDecisionCsv(session, plans, []));
  const inputsOf = (id: string) => rows.filter(row => row.row_type === 'scenario_sensitivity_input' && row.item_id === id).map(row => [row.field, row.value]);
  const resultsOf = (id: string) => rows.filter(row => row.row_type === 'scenario_sensitivity_result' && row.item_id === id).map(row => [row.field, row.value, JSON.parse(row.reason_codes)]);
  // 文字格以 ' 開頭防公式注入（-10 → '-10），與既有 scenario_input 一致。
  expect(inputsOf('p')).toEqual([['volume_a', "'-10"], ['volume_b', '0'], ['volume_c', '10']]);
  expect(resultsOf('p')).toEqual([['volume_a', '228.60', ['valid']], ['volume_b', '284.00', ['valid']], ['volume_c', '339.40', ['valid']]]);
  expect(inputsOf('q')).toEqual([['volume_a', '5'], ['volume_b', ''], ['volume_c', '']]);
  expect(resultsOf('q')).toEqual([['volume_a', '', ['draft']], ['volume_b', '', ['draft']], ['volume_c', '', ['draft']]]);
  expect(inputsOf('r')).toEqual([]); expect(resultsOf('r')).toEqual([]);
  expect(rows.find(row => row.row_type === 'scenario_sensitivity_input')!.item_name).toBe('履約');
 });
 it('Markdown adds a small table under each plan using the scenario labels', async () => {
  const { session, plans } = await dtc();
  const markdown = exportDecisionMarkdown(session, plans, []);
  const header = `| ${[labels.ui.scenarioSensitivity.colAssumption, `${labels.scenario.volume.label}（%）`, labels.scenario.resultTitle, labels.scenario.vsBaseline].join(' | ')} |`;
  const letter = (value: string) => fill(labels.ui.scenarioSensitivity.rowLabel, { letter: value });
  const empty = labels.ui.decisionExport.nullValue;
  expect(markdown.split(`#### ${labels.sections.scenarioBreakeven}`)).toHaveLength(3);
  expect(markdown).toContain(header);
  expect(markdown).toContain(`| ${letter('A')} | \\-10 | 228\\.60 | \\-41\\.40 |`);
  expect(markdown).toContain(`| ${letter('B')} | 0 | 284\\.00 | 14\\.00 |`);
  expect(markdown).toContain(`| ${letter('C')} | 10 | 339\\.40 | 69\\.40 |`);
  // 草稿方案：只列輸入，結果格寫「資料待補／不適用」，附草稿說明；三格空白的方案不輸出小表。
  const draftSection = markdown.slice(markdown.indexOf('### 草稿'), markdown.indexOf('### 空白'));
  expect(draftSection).toContain(`| ${letter('A')} | 5 | ${empty} | ${empty} |`);
  expect(draftSection).toContain(`| ${letter('B')} | ${empty} | ${empty} | ${empty} |`);
  expect(draftSection.split(labels.scenario.draft).length).toBeGreaterThan(2);
  expect(markdown.slice(markdown.indexOf('### 空白'))).not.toContain(labels.sections.scenarioBreakeven);
 });
 it('marks unfilled, out-of-range and stale analyses without inventing results', async () => {
  const { session, plans } = await dtc();
  const partial = saveScenario(session, [], { id: 'p', name: '履約', inputs: golden, sensitivity: { volumes: ['-10', '', '10'] } });
  const json = JSON.parse(exportDecisionJson(session, partial, []));
  expect(json.scenarios[0].sensitivity.analysis).toMatchObject({ status: 'valid', sensitivity_status: 'unfilled', rows: [], reasons: [{ code: 'SENSITIVITY_VOLUME_REQUIRED' }] });
  const unfilled = ['', ['unfilled', 'SENSITIVITY_VOLUME_REQUIRED']];
  expect(records(exportDecisionCsv(session, partial, [])).filter(row => row.row_type === 'scenario_sensitivity_result').map(row => [row.value, JSON.parse(row.reason_codes)])).toEqual([unfilled, unfilled, unfilled]);
  expect(exportDecisionMarkdown(session, partial, [])).toContain(labels.ui.scenarioSensitivity.reasons.SENSITIVITY_VOLUME_REQUIRED.replaceAll('.', '\\.'));
  const outside = saveScenario(session, [], { id: 'p', name: '履約', inputs: golden, sensitivity: { volumes: ['-10', '101', '10'] } });
  expect(JSON.parse(exportDecisionJson(session, outside, [])).scenarios[0].sensitivity.analysis).toMatchObject({ sensitivity_status: 'invalid', rows: [], reasons: [{ code: 'INPUT_OUT_OF_RANGE' }] });
  const stale = { ...session, stale: true };
  expect(JSON.parse(exportDecisionJson(stale, plans, [])).scenarios[0].sensitivity.analysis).toMatchObject({ status: 'stale', targets: [], rows: [], reasons: [{ code: 'STALE_SCENARIO' }] });
  expect(records(exportDecisionCsv(stale, plans, [])).find(row => row.row_type === 'scenario_sensitivity_result' && row.item_id === 'p')!.reason_codes).toBe(JSON.stringify(['stale', 'STALE_SCENARIO']));
  expect(exportDecisionMarkdown(stale, plans, [])).toContain(labels.ui.scenarioSensitivity.reasons.STALE_SCENARIO);
  expect(() => exportDecisionJson(session, [{ ...plans[0], sensitivity: { volumes: ['1', '2'] } as never }], [])).toThrow('INVALID_SENSITIVITY_INPUT');
 });
 it('workspace export carries each context plan sensitivity; historical contexts are stale', async () => {
  const input = fixture(), dataset = validateDataset(input).dataset!, hash = await hashInput(input);
  const snapshot = await createSnapshot(dataset, { channels: ['DTC'] }, hash);
  let workspace = ensureScenarioContext(emptyScenarioWorkspace('a'), { input, dataset, snapshot, revision: 1 });
  const context = workspace.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: 'p', name: '履約', inputs: golden, sensitivity: { volumes: ['-10', '0', '10'] } });
  workspace = updateScenarioContext(workspace, context.id, draft);
  const source = { input, dataset, snapshot, revision: 1 };
  const current = JSON.parse(exportWorkspaceDecision('json', source, workspace, emptyActionWorkspace(), null));
  expect(current.scenarios[0].sensitivity.analysis.rows.map((row: { contribution: string }) => row.contribution)).toEqual(['228.60', '284.00', '339.40']);
  expect(current.scenario_contexts[0].scenarios[0].sensitivity.volumes).toEqual(['-10', '0', '10']);
  expect(current.scenario_contexts[0].calculated_versions[0]).not.toHaveProperty('sensitivity');
  expect(exportWorkspaceDecision('csv', source, workspace, emptyActionWorkspace(), null)).toContain('scenario_sensitivity_result');
  expect(exportWorkspaceDecision('md', source, workspace, emptyActionWorkspace(), null)).toContain('339\\.40');
  const historical = JSON.parse(exportWorkspaceDecision('json', source, activateScenarioEpoch(workspace, 'b'), emptyActionWorkspace(), null));
  expect(historical.scenario_contexts[0].scenarios[0].sensitivity.analysis.status).toBe('stale');
 });
});
