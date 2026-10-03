import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fill, labels } from '../../src/i18n';
import { channelsLabel } from '../../src/application/copy';
import { openMeeting, ruleHeadline, startChannelContext, switchActionsView } from './replacement-helpers';
import { chooseBasis, commitButton, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardRoles, type FilePayload, type WizardRole } from './import-wizard-helpers';
// 每個案例都是長流程（載入 → 健檢／試算 → 行動 → 下載／備份／換檔重核）；比照 scenarios.spec 放寬單一案例的時間上限，斷言不變。
test.describe.configure({timeout:90_000});
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
/** R5：證據改為可搜尋的 checkbox 清單（fieldset role=group，名稱＝evidencePicker）。 */
const evidenceList=(card:Locator)=>card.getByRole('group',{name:aw.evidencePicker,exact:true});
const checkedEvidence=(card:Locator)=>evidenceList(card).locator('input[type=checkbox]:checked').evaluateAll(inputs=>inputs.map(input=>(input as HTMLInputElement).value));
/** R5 健檢清單：一個規則一列（details.diagnosis-row），只有前三列預設展開；需要時點標題展開。 */
async function diagnosisRow(page:Page,code:keyof typeof labels.rules){const row=page.getByTestId(`diagnosis-row-${code}`);await expect(row.locator(':scope > summary').getByRole('heading',{name:ruleHeadline(code)})).toBeVisible();if(await row.getAttribute('open')===null)await row.locator(':scope > summary h3').click();await expect(row).toHaveAttribute('open','');return row;}
/** R5：試算沒有「全部填 0」，改用「維持現況」範本（05 §8：五格皆 0）。 */
async function applyKeepPreset(plan:Locator){await plan.getByTestId('scenario-preset').selectOption('keep');await plan.getByTestId('scenario-preset-apply').click();for(const label of [labels.scenario.volume.label,labels.scenario.discount.label,labels.scenario.fulfillmentUnit.label,labels.scenario.adSpend.label,labels.scenario.oneOff.label])await expect(plan.getByLabel(label,{exact:true})).toHaveValue('0');}
test('PL05 診斷帶入精確證據、跨通路草稿、歷史來源與五工作項目備份',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));page.on('dialog',d=>void d.accept());await load(page);
 await page.getByRole('button',{name:labels.nav.diagnosis.label,exact:true}).click();
 const diagnostic=await diagnosisRow(page,'REV_UP_CM_DOWN');
 const ids=await diagnostic.locator('details.diagnosis-technical li code').allTextContents();expect(ids.length).toBeGreaterThan(0);
 await diagnostic.getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();
 // R5：行動頁預設看板，新草稿在「未開始」欄；清單檢視才有 action-<n> 的完整編輯表單。
 await expect(page.getByTestId('actions-view-board')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toContainText(aw.tagDraft);
 await switchActionsView(page,'list');
 const first=page.getByTestId('action-1');await expect(first).toContainText(aw.tagDraft);
 await expect(page.getByRole('heading',{name:labels.sections.scenarioAssumptions,exact:true})).not.toBeVisible();
 expect((await checkedEvidence(first)).sort()).toEqual([...ids].sort());
 expect(await evidenceList(first).locator('label.evidence-option').first().textContent()).not.toContain('fact:');
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
 // 備份 ui_prefs.view 記住了清單檢視，恢復後直接回到清單。
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();await expect(page.getByTestId('actions-view-list')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('action-5')).toBeVisible();await expect(first.getByLabel(labels.actions.owner,{exact:true})).toBeEnabled();
 expect((await checkedEvidence(first)).sort()).toEqual([...ids].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(`verification/review-v2-a-regression-actions-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-regression-actions-browser.jsonl'),JSON.stringify({project:info.project.name,errors,actions:5,pins:3,historical_fact:'255.00',raw_sources:'original golden',backup_restore:true})+'\n');expect(errors).toEqual([]);
});
test('A2 會議選定方案與交辦固定來源，切檢視保留且明確更新來源才重選',async({page})=>{
 await load(page);await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('DTC');await page.getByRole('button',{name:labels.nav.scenarios.label,exact:true}).click();await startChannelContext(page);await expect(page.getByTestId('scenario-channel')).toHaveValue('DTC');const plan=page.getByTestId('scenario-1');
 await plan.getByLabel(labels.ui.decisionWorkbench.planName,{exact:true}).fill('主管會議履約方案');await applyKeepPreset(plan);await plan.getByLabel(labels.scenario.fulfillmentUnit.label,{exact:true}).fill('-10');await plan.getByLabel(labels.scenario.acceptAssumptions,{exact:true}).check();await plan.getByRole('button',{name:labels.buttons.calculate,exact:true}).click();await expect(plan.getByTestId('scenario-contribution')).toHaveText('284.00');
 await page.getByRole('button',{name:labels.nav.diagnosis.label,exact:true}).click();await page.getByTestId('diagnosis-list').locator('details.diagnosis-row').first().getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();await switchActionsView(page,'list');const action=page.getByTestId('action-1');
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
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();await switchActionsView(page,'list');await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const card=page.getByTestId('action-1');await card.getByLabel(labels.actions.problem,{exact:true}).fill('核對原始DTC貢獻');
 // R5：證據是可搜尋的 checkbox 清單；搜尋只過濾未勾選的項目。
 const evidence=evidenceList(card);const all=await evidence.getByRole('checkbox').count();
 await evidence.getByRole('searchbox',{name:labels.actions.searchEvidence,exact:true}).fill('270.00');
 const options=evidence.locator('label.evidence-option');await expect.poll(()=>options.count()).toBeLessThan(all);
 for(const text of await options.allTextContents())expect(text).toContain('270.00');
 const box=evidence.getByRole('checkbox',{name:factText('2026-08-02','2026-08-02',cmAfter,'DTC','270.00'),exact:true});
 const id=await box.getAttribute('value');expect(id).toBeTruthy();
 await box.check();await evidence.getByRole('searchbox',{name:labels.actions.searchEvidence,exact:true}).fill('');expect(await checkedEvidence(card)).toEqual([id!]);
 await card.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(card).toContainText(aw.tagConfirmed);
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
 // R5：清單改的執行狀態同步到看板欄位；切回清單後內容不變。
 await switchActionsView(page,'board');await expect(page.getByTestId('board-column-in_progress').getByTestId('board-card-1')).toContainText(aw.tagConfirmed);await expect(page.getByTestId('board-card-1')).toContainText('營運主管');
 await switchActionsView(page,'list');await expect(card.getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 const doc=JSON.parse(await download(page,labels.downloads.decisionJson));
 expect(doc.actions[0]).toMatchObject({execution_status:'in_progress',progress_notes:'=SUM(1)',evidence_confirmed:true,status:'confirmed',fact_ids:[id],binding:{scope:{channels:['DTC']}}});expect(doc.actions[0].status_updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

test('R5 看板用按鈕改狀態：卡片移到進行中欄、通知與焦點跟著卡片，匯出記錄狀態更新日期',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const inProgress=labels.actions.statuses.in_progress;
 await load(page);await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption('DTC');
 await page.getByRole('button',{name:labels.nav.actions.label,exact:true}).click();
 await expect(page.getByTestId('actions-view-board')).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('heading',{name:labels.sections.actionBoard,exact:true})).toBeVisible();
 await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const card=page.getByTestId('board-card-1');await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toBeVisible();
 // 看板上新增的待辦直接展開編輯表單。
 await card.getByLabel(labels.actions.problem,{exact:true}).fill('看板改狀態');await expect(card.getByRole('heading',{name:'看板改狀態',exact:true})).toBeVisible();
 let doc=JSON.parse(await download(page,labels.downloads.decisionJson));expect(doc.actions).toHaveLength(1);expect(doc.actions[0]).toMatchObject({execution_status:'not_started',status_updated_at:null});
 const move=page.getByTestId('board-card-1-move-in_progress');await expect(move).toHaveText(fill(labels.actionBoard.moveTo,{status:inProgress}));
 await move.click();
 const moved=page.getByTestId('board-column-in_progress').getByTestId('board-card-1');await expect(moved).toBeVisible();
 await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toHaveCount(0);
 await expect(page.getByTestId('board-column-in_progress').getByRole('heading',{level:3})).toContainText(fill(labels.actionBoard.columnCount,{n:1}));
 await expect(page.getByTestId('action-notice')).toHaveText(fill(labels.actionBoard.moved,{n:1,status:inProgress}));
 await expect(moved).toBeFocused();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()); // R5：狀態更新日以臺北日曆日計
 await expect(moved).toContainText(fill(labels.actionBoard.statusUpdated,{date:today}));
 doc=JSON.parse(await download(page,labels.downloads.decisionJson));expect(doc.actions[0]).toMatchObject({problem:'看板改狀態',execution_status:'in_progress',status_updated_at:today});
 // CSV 每格都加引號；row_type 與 field／value 之間隔著 item 欄位。
 expect(await download(page,labels.downloads.decisionCsv)).toMatch(new RegExp(`^.*,"manual_action",.*,"status_updated_at","${today}",`,'m'));
 await switchActionsView(page,'list');await expect(page.getByTestId('action-1').getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});
