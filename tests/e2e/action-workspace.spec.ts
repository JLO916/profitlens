import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fill, labels } from '../../src/i18n';
import { channelsLabel } from '../../src/application/copy';
import { openMeeting, ruleHeadline } from './replacement-helpers';
import { chooseBasis, commitButton, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardRoles, type FilePayload, type WizardRole } from './import-wizard-helpers';
const aw=labels.ui.actionsWorkbench, ws=labels.ui.workspaceStorage, ms=labels.ui.managerSummary;
const cmAfter=labels.metrics.contribution_after_marketing.label;
/** 事實選項／看證據按鈕的文字由 actions-workbench factLabel() 組成；golden 不套示範通路 alias。 */
const factText=(start:string,end:string,metric:string,scope:string,value:string)=>fill(aw.factLabel,{start,end,metric,scope,scopeKind:labels.csvColumns.channel,value});
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** 「看證據 · {fact}」模板的前綴，接著比對事實文字的片段。 */
const evidenceButton=(template:string,...fragments:string[])=>new RegExp(`^${escapeRegExp(template.split('{fact}')[0])}${fragments.map(f=>`.*${escapeRegExp(f)}`).join('')}`);
/** 主管摘要 Markdown 的方案列：取「試算後的扣廣告後貢獻 {contribution}」這一段。 */
const mdScenarioContribution=(contribution:string)=>ms.mdSelectedScenario.split('；')[1].replace('{contribution}',contribution);
const technicalAppendix=`## ${labels.sections.technicalDetails}`;
/** 備份預覽的「方案 n 個、行動 n 項」：方案數不在本測試的斷言範圍，允許任意數字。 */
const restoreCounts=(actions:number)=>new RegExp(escapeRegExp(fill(ws.restoreCounts,{plans:'\u0000',actions})).replace('\u0000','\\d+'));
async function load(page:Page){await page.goto('/');await page.getByRole('button',{name:labels.nav.validation.label,exact:true}).click();await page.getByLabel(labels.ui.dashboard.validation.datasetLabel,{exact:true}).selectOption('golden');await page.getByRole('button',{name:labels.ui.dashboard.validation.loadButton,exact:true}).click();await openMeeting(page);await expect(page.getByTestId('manager-summary')).toBeVisible();}
async function discardReplacement(page:Page){const dialog=page.getByRole('dialog',{name:labels.ui.replacementDialog.heading,exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:labels.ui.replacementDialog.discardAndContinue,exact:true}).click();await expect(dialog).not.toBeVisible();}
async function download(page:Page,label:string){const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();return readFile((await(await event).path())!,'utf8');}
test('PL05 診斷帶入精確證據、跨通路草稿、歷史來源與五工作項目備份',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));page.on('dialog',d=>void d.accept());await load(page);
 await page.getByRole('button',{name:labels.nav.diagnosis.label,exact:true}).click();
 const diagnostic=page.locator('.diagnostic-card').filter({has:page.getByRole('heading',{name:ruleHeadline('REV_UP_CM_DOWN')})}).first();
 const ids=await diagnostic.locator('details li code').allTextContents();expect(ids.length).toBeGreaterThan(0);
 await diagnostic.getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();
 const first=page.getByTestId('action-1');await expect(first).toContainText(aw.tagDraft);
 await expect(page.getByRole('heading',{name:labels.sections.scenarioAssumptions,exact:true})).not.toBeVisible();
 expect((await first.getByLabel(aw.evidencePicker,{exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).sort()).toEqual([...ids].sort());
 expect(await first.getByLabel(aw.evidencePicker,{exact:true}).locator('option').first().textContent()).not.toContain('fact:');
 let doc=JSON.parse(await download(page,labels.downloads.decisionJson));expect(doc.actions[0].fact_ids).toEqual(ids);expect(doc.actions[0].evidence_confirmed).toBe(false);expect(doc.actions[0].binding.scope.channels).toEqual(['DTC','MARKETPLACE']);
 await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('MARKETPLACE');await expect(first.getByLabel(labels.actions.owner,{exact:true})).toBeEnabled();await expect(first).not.toContainText(labels.actions.staleBadge);
 await first.getByRole('button',{name:evidenceButton(aw.viewEvidenceItem,'2026-08-02',cmAfter)}).first().click();
 await expect(page.getByRole('dialog').locator('p.number')).toHaveText('NT$ 255.00');await expect(page.getByRole('dialog')).toContainText(channelsLabel(['DTC','MARKETPLACE'],false));await page.keyboard.press('Escape');
 for(let n=2;n<=5;n++)await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 for(let n=1;n<=3;n++)await page.getByTestId(`action-${n}`).getByRole('button',{name:labels.buttons.pin,exact:true}).click();
 await page.getByTestId('action-4').getByRole('button',{name:labels.buttons.pin,exact:true}).click();await expect(page.getByTestId('action-notice')).toContainText(aw.maxPinned);
 doc=JSON.parse(await download(page,labels.downloads.decisionJson));expect(doc.actions).toHaveLength(5);expect(doc.actions.filter((a:{pinned:boolean})=>a.pinned)).toHaveLength(3);expect(doc.actions[0].status).toBe('draft');expect(doc.actions[4].binding.scope.channels).toEqual(['MARKETPLACE']);
 const storage=page.getByTestId('workspace-storage');await storage.locator(':scope > summary').click();
 const backup=await download(page,labels.buttons.downloadBackup);await page.reload();await storage.locator(':scope > summary').click();
 await storage.getByLabel(ws.selectBackupFile,{exact:true}).setInputFiles({name:'bound.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await expect(page.getByRole('region',{name:ws.restorePreviewAria})).toContainText(restoreCounts(5));await page.getByRole('button',{name:ws.applyRestore,exact:true}).click();
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();await expect(page.getByTestId('action-5')).toBeVisible();await expect(first.getByLabel(labels.actions.owner,{exact:true})).toBeEnabled();
 expect((await first.getByLabel(aw.evidencePicker,{exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).sort()).toEqual([...ids].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(`verification/review-v2-a-regression-actions-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-regression-actions-browser.jsonl'),JSON.stringify({project:info.project.name,errors,actions:5,pins:3,historical_fact:'255.00',raw_sources:'original golden',backup_restore:true})+'\n');expect(errors).toEqual([]);
});
test('A2 會議選定方案與交辦固定來源，切檢視保留且明確更新來源才重選',async({page})=>{
 await load(page);await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('DTC');await page.getByRole('button',{name:labels.nav.scenarios.label,exact:true}).click();await page.getByRole('button',{name:fill(labels.ui.multiScenarioWorkbench.startButton,{channel:'DTC'}),exact:true}).click();await page.getByRole('button',{name:labels.buttons.addScenario,exact:true}).click();const plan=page.getByTestId('scenario-1');
 await plan.getByLabel(labels.ui.decisionWorkbench.planName,{exact:true}).fill('主管會議履約方案');await plan.getByRole('button',{name:labels.buttons.fillZero,exact:true}).click();await plan.getByLabel(labels.scenario.fulfillmentUnit.label,{exact:true}).fill('-10');await plan.getByLabel(labels.scenario.acceptAssumptions,{exact:true}).check();await plan.getByRole('button',{name:labels.buttons.calculate,exact:true}).click();
 await page.getByRole('button',{name:labels.nav.diagnosis.label,exact:true}).click();await page.locator('.diagnostic-card').first().getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();const action=page.getByTestId('action-1');
 for(const [label,value]of Object.entries({[labels.actions.owner]:'營運主管',[labels.actions.metric]:'履約費用',[labels.actions.due]:'2026-10-15',[labels.actions.stop]:'服務品質下降就停止',[labels.actions.extraData]:'物流報價'}))await action.getByLabel(label,{exact:true}).fill(value);
 await action.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(action).toContainText(aw.tagConfirmed);
 await page.getByRole('button',{name:labels.nav.overview.label,exact:true}).click();await openMeeting(page);const summary=page.getByTestId('manager-summary');const choice=page.getByLabel(fill(labels.ui.reviewWorkbench.scenarioSelect,{channel:'DTC'}),{exact:true});const selected=await choice.locator('option').filter({hasText:fill(labels.ui.reviewWorkbench.planOption,{name:'主管會議履約方案'})}).getAttribute('value');expect(selected).toBeTruthy();await choice.selectOption(selected!);
 const markdown=await download(page,labels.buttons.exportMarkdown);for(const value of ['284.00','14.00','營運主管','服務品質下降就停止','主管會議履約方案'])expect(markdown).toContain(value);
 await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('MARKETPLACE');await expect(summary).toContainText('主管會議履約方案');
 const retained=await download(page,labels.buttons.exportMarkdown);expect(retained.split(technicalAppendix)[0]).toContain(mdScenarioContribution('284.00'));
 await page.getByRole('button',{name:labels.buttons.updateMeetingSource,exact:true}).click();await expect(summary).toContainText(ms.noScenario);
 const refreshed=await download(page,labels.buttons.exportMarkdown);expect(refreshed.split(technicalAppendix)[0]).not.toContain(mdScenarioContribution('284.00'));
});


async function confirmedDtcAction(page: Page) {
 await load(page);await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('DTC');
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const card=page.getByTestId('action-1');await card.getByLabel(labels.actions.problem,{exact:true}).fill('核對原始DTC貢獻');
 const select=card.getByLabel(aw.evidencePicker,{exact:true});
 const id=await select.locator('option').filter({hasText:factText('2026-08-02','2026-08-02',cmAfter,'DTC','270.00')}).getAttribute('value');expect(id).toBeTruthy();
 await select.selectOption(id!);await card.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(card).toContainText(aw.tagConfirmed);
 return {card,id:id!};
}

test('A1 檢視切換後仍可管理執行狀態與進度，管理編輯不撤銷引用確認',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);
 await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('MARKETPLACE');
 for(const [label,value] of Object.entries({[labels.actions.owner]:'營運主管',[labels.actions.due]:'2026-10-20',[labels.actions.step]:'請核對已入帳費用'}))await card.getByLabel(label,{exact:true}).fill(value);
 await card.getByLabel(labels.actions.status,{exact:true}).selectOption('in_progress');
 await card.getByLabel(labels.actions.progress,{exact:true}).fill('=SUM(1)');
 await expect(card).toContainText(aw.tagConfirmed);
 await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('DTC');
 await expect(card.getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 await expect(card.getByLabel(labels.actions.progress,{exact:true})).toHaveValue('=SUM(1)');
 const doc=JSON.parse(await download(page,labels.downloads.decisionJson));
 expect(doc.actions[0]).toMatchObject({execution_status:'in_progress',progress_notes:'=SUM(1)',evidence_confirmed:true,status:'confirmed',fact_ids:[id],binding:{scope:{channels:['DTC']}}});
 expect(doc.actions[0].evidence[0].value).toBe('270.00');expect(doc.actions[0].binding_history).toHaveLength(1);expect(doc.actions[0].binding_history[0].fact_ids).toEqual([]);
 expect(await download(page,labels.downloads.decisionCsv)).toContain("'=SUM(1)");
 await page.screenshot({path:resolve(`verification/review-v2-a-action-management-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-management-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',fact_value:'270.00',evidence_confirmed:true,management:'in_progress',errors})+'\n');expect(errors).toEqual([]);
});

test('A1 真換CSV後重新綁定先預覽，取消保留270，再明確確認170與完整歷史',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);const before=JSON.parse(await download(page,labels.downloads.decisionJson));
 // R3：單頁匯入表單改為四步匯入精靈；替換廣告檔後仍以 golden manifest 帶入設定，確認口徑後檢核、套用並明確捨棄未保存工作。
 await openWizard(page);
 const overrides:Partial<Record<WizardRole,FilePayload>>={};
 for(const role of wizardRoles) {
  const csv=await readFile(resolve('fixtures/golden',role),'utf8');
  const replacement=role==='ad_spend_daily.csv'?csv.replace('2026-08-02,DTC,270.00','2026-08-02,DTC,370.00'):csv;
  overrides[role]={name:role,mimeType:'text/csv',buffer:Buffer.from(replacement)};
 }
 await setWizardFiles(page,'fixtures/golden',overrides);
 await setWizardManifest(page,resolve('fixtures/golden/manifest.json'));
 await nextFromFiles(page);await confirmMappingIfShown(page);
 await expect(wizard(page).getByLabel(labels.importWizard.datasetName,{exact:true})).not.toHaveValue('');
 await chooseBasis(page,'exclusive');
 await confirmAndCheck(page,'valid');
 await commitButton(page).click();await discardReplacement(page);
 await expect(page.getByTestId('workspace-status')).toContainText(labels.status.ready);await expect(wizard(page)).toHaveCount(0);
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();await expect(card).toContainText(aw.historicalAlert);
 await card.getByLabel(labels.actions.status,{exact:true}).selectOption('blocked');await card.getByLabel(labels.actions.progress,{exact:true}).fill('等待新版本費用對帳');
 await card.getByRole('button',{name:labels.buttons.rebind,exact:true}).click();const preview=card.getByRole('region',{name:aw.rebindRegion,exact:true});
 await expect(preview).toBeVisible();await expect(preview.locator('tbody tr')).toHaveCount(1);await expect(preview.locator('tbody')).toContainText('270.00');await expect(preview.locator('tbody')).toContainText('170.00');
 await preview.getByRole('button',{name:labels.buttons.cancel,exact:true}).click();await expect(preview).toHaveCount(0);
 const cancelled=JSON.parse(await download(page,labels.downloads.decisionJson));expect(cancelled.actions[0].binding).toEqual(before.actions[0].binding);expect(cancelled.actions[0].evidence[0].value).toBe('270.00');expect(cancelled.actions[0].binding_history).toEqual(before.actions[0].binding_history);
 await card.getByRole('button',{name:labels.buttons.rebind,exact:true}).click();await expect(preview).toBeVisible();await preview.getByRole('button',{name:aw.rebindCommit,exact:true}).click();await expect(preview).toHaveCount(0);
 const result=JSON.parse(await download(page,labels.downloads.decisionJson));const action=result.actions[0];
 expect(action).toMatchObject({execution_status:'blocked',progress_notes:'等待新版本費用對帳',evidence_confirmed:true,binding_revision:before.actions[0].binding_revision+1,fact_ids:[id]});
 expect(action.evidence[0].value).toBe('170.00');expect(action.binding.dataset_hash).not.toBe(before.actions[0].binding.dataset_hash);
 expect(action.binding_history.at(-1).fact_ids).toEqual([id]);expect(action.binding_history.at(-1).evidence[0].value).toBe('270.00');expect(action.binding_history.at(-1).dataset_hash).toBe(before.actions[0].binding.dataset_hash);
 await card.getByText(fill(aw.historySummary,{n:2}),{exact:true}).click();await card.getByRole('button',{name:evidenceButton(aw.viewHistoryEvidence)}).click();await expect(page.getByRole('dialog').locator('p.number')).toHaveText('NT$ 270.00');await page.keyboard.press('Escape');
 await page.screenshot({path:resolve(`verification/review-v2-a-action-rebind-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-rebind-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',cancel_kept_original:true,old_value:'270.00',new_value:'170.00',same_fact_id:true,history_verified:true,errors})+'\n');expect(errors).toEqual([]);
});
