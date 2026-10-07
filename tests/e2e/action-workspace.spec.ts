import { readFileSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fill, labels } from '../../src/i18n';
import { channelsLabel } from '../../src/application/copy';
import { formatAmountL1, formatAmountL2, formatAmountL3, formatDateL1 } from '../../src/application/presentation';
import { closePeriodSheet, dismissSavePrompt, navigateTo, openMeeting, openPeriodSheet, openStorage, openValidation, ruleHeadline, startChannelContext, switchActionsView } from './replacement-helpers';
import { chooseBasis, commitButton, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardRoles, type FilePayload, type WizardRole } from './import-wizard-helpers';
import { acceptAssumptions, actionDrawer, closeActionDrawer, decisionExportButton, evidenceDrawer, openActionDrawer, type DecisionFormat } from './actions-helpers-v3';
import { downloadMeetingExport } from './review-helpers-v3';
import { expectMeetingNoScenario, goToScenariosFromMeeting } from './misc-helpers-v38';
// 每個案例都是長流程（載入 → 健檢／試算 → 行動 → 下載／備份／換檔重核）；比照 scenarios.spec 放寬單一案例的時間上限，斷言不變。
test.describe.configure({timeout:90_000});
const aw=labels.ui.actionsWorkbench, ws=labels.ui.workspaceStorage, ms=labels.ui.managerSummary, pv3=labels.actions.pageV3;
const cmAfter=labels.metrics.contribution_after_marketing.label;
/** 事實選項／看證據按鈕的文字由 actions-workbench factLabel() 組成；golden 不套示範通路 alias。 */
const factText=(start:string,end:string,metric:string,scope:string,value:string)=>fill(aw.factLabel,{start,end,metric,scope,scopeKind:labels.csvColumns.channel,value});
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** 「看證據 · {fact}」模板的前綴，接著比對事實文字的片段。 */
const evidenceButton=(template:string,...fragments:string[])=>new RegExp(`^${escapeRegExp(template.split('{fact}')[0])}${fragments.map(f=>`.*${escapeRegExp(f)}`).join('')}`);
/** 主管摘要 Markdown 的方案列：取「試算後的扣廣告後貢獻 {contribution}」這一段。 */
const mdScenarioContribution=(contribution:string)=>ms.mdSelectedScenario.split('；')[1].replace('{contribution}',contribution);
/** V3-2a：狀態列「資料到 {date}」的日期取自 golden manifest 的 data_as_of。 */
const goldenReady=fill(labels.status.ready,{date:JSON.parse(readFileSync(resolve('fixtures/golden/manifest.json'),'utf8')).data_as_of});
/**
 * V3-2b（§7.8）：抽屜標題下的大數字是 L1（「255 元」／「127.0 萬」），下一行 evidence-precise-value 永遠是到分的精確值「255.00 元」。
 * V3-6：在待辦編輯抽屜裡點「看明細」會在它之上再開「計算與來源」抽屜（兩個 dialog），所以指定 dialog.evidence-drawer。
 */
async function expectDrawerAmount(page:Page,amount:string){const dialog=evidenceDrawer(page);await expect(dialog.locator('p.number')).toHaveText(formatAmountL1(amount));await expect(dialog.getByTestId('evidence-precise-value')).toHaveText(fill(labels.units.yuan,{value:formatAmountL3(amount)}));}
/** V3-2b：待辦卡片與引用清單的事實值是 L1（actions-workbench factValue 預設層）；重新綁定比較表是 L2。 */
const factL1=(amount:string)=>formatAmountL1(amount);
const technicalAppendix=`## ${labels.sections.technicalDetails}`;
/** 備份預覽的「方案 n 個、行動 n 項」：方案數不在本測試的斷言範圍，允許任意數字。 */
const restoreCounts=(actions:number)=>new RegExp(escapeRegExp(fill(ws.restoreCounts,{plans:'\u0000',actions})).replace('\u0000','\\d+'));
/** R6：首次保存提示（role=dialog，非 modal）出現在載入／恢復之後；本檔不測自動保存，載入後先按「先不要」。 */
async function load(page:Page){await page.goto('/');await openValidation(page);await page.getByLabel(labels.ui.dashboard.validation.datasetLabel,{exact:true}).selectOption('golden');await page.getByRole('button',{name:labels.ui.dashboard.validation.loadButton,exact:true}).click();await expect(page.getByTestId('workspace-status')).toContainText(goldenReady);await dismissSavePrompt(page);await openMeeting(page);await expect(page.getByTestId('manager-summary')).toBeVisible();}
/** V3-3：全站通路下拉在期間列；手機期間列收成 period-toggle，先開底部面板再選，選完按「完成」收起。 */
async function selectChannel(page:Page,value:string){await openPeriodSheet(page);await page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true}).selectOption(value);await closePeriodSheet(page);}
async function discardReplacement(page:Page){const dialog=page.getByRole('dialog',{name:labels.ui.replacementDialog.heading,exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:labels.ui.replacementDialog.discardAndContinue,exact:true}).click();await expect(dialog).not.toBeVisible();}
async function download(page:Page,label:string){const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();return readFile((await(await event).path())!,'utf8');}
/** V3-7：會議頁的一頁摘要 Markdown（v2 輸出列的「匯出 Markdown」）在頁首「匯出會議」下拉（export-page-meeting → meeting-export-markdown）；按鈕名稱不變。 */
const meetingMarkdown=(page:Page)=>downloadMeetingExport(page,labels.buttons.exportMarkdown);
/** V3-6：決策下載（v2 頁面上的三顆按鈕）搬進待辦頁頁首「匯出本頁」（export-page-actions → actions-export-{md|csv|json}）；按鈕文字仍是 labels.downloads.decision*。 */
async function downloadDecision(page:Page,format:DecisionFormat){const button=await decisionExportButton(page,format);const event=page.waitForEvent('download');await button.click();return readFile((await(await event).path())!,'utf8');}
/** R5：證據改為可搜尋的 checkbox 清單（fieldset role=group，名稱＝evidencePicker）。 */
const evidenceList=(card:Locator)=>card.getByRole('group',{name:aw.evidencePicker,exact:true});
const checkedEvidence=(card:Locator)=>evidenceList(card).locator('input[type=checkbox]:checked').evaluateAll(inputs=>inputs.map(input=>(input as HTMLInputElement).value));
/** R5 健檢清單：一個規則一列（details.diagnosis-row），只有前三列預設展開；需要時點標題展開。 */
async function diagnosisRow(page:Page,code:keyof typeof labels.rules){const row=page.getByTestId(`diagnosis-row-${code}`);await expect(row.locator(':scope > summary').getByRole('heading',{name:ruleHeadline(code)})).toBeVisible();if(await row.getAttribute('open')===null)await row.locator(':scope > summary h3').click();await expect(row).toHaveAttribute('open','');return row;}
/** R5：試算沒有「全部填 0」，改用「維持現況」範本（05 §8：五格皆 0）。 */
async function applyKeepPreset(plan:Locator){await plan.getByTestId('scenario-preset').selectOption('keep');await plan.getByTestId('scenario-preset-apply').click();for(const label of [labels.scenario.volume.label,labels.scenario.discount.label,labels.scenario.fulfillmentUnit.label,labels.scenario.adSpend.label,labels.scenario.oneOff.label])await expect(plan.getByLabel(label,{exact:true})).toHaveValue('0');}
test('PL05 診斷帶入精確證據、跨通路草稿、歷史來源與五工作項目備份',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));page.on('dialog',d=>void d.accept());await load(page);
 await navigateTo(page,'diagnosis');
 const diagnostic=await diagnosisRow(page,'REV_UP_CM_DOWN');
 const ids=await diagnostic.locator('details.diagnosis-technical li code').allTextContents();expect(ids.length).toBeGreaterThan(0);
 await diagnostic.getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();
 // R5：行動頁預設看板，新草稿在「未開始」欄；清單檢視才有 action-<n> 的完整編輯表單。
 await expect(page.getByTestId('actions-view-board')).toHaveAttribute('aria-pressed','true');
 // V3-6（C13）：看板卡的引用標籤改成「引用 n 個數字 · 草稿／已確認」（.board-card-evidence）；清單檢視的標題列仍是 tagDraft／tagConfirmed。
 await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1').locator('.board-card-evidence')).toHaveText(fill(pv3.evidenceCount,{n:ids.length,state:pv3.evidenceDraft}));
 await switchActionsView(page,'list');
 const first=page.getByTestId('action-1');await expect(first).toContainText(aw.tagDraft);
 await expect(page.getByRole('heading',{name:labels.sections.scenarioAssumptions,exact:true})).not.toBeVisible();
 expect((await checkedEvidence(first)).sort()).toEqual([...ids].sort());
 expect(await evidenceList(first).locator('label.evidence-option').first().textContent()).not.toContain('fact:');
 let doc=JSON.parse(await downloadDecision(page,'json'));expect(doc.actions[0].fact_ids).toEqual(ids);expect(doc.actions[0].evidence_confirmed).toBe(false);expect(doc.actions[0].binding.scope.channels).toEqual(['DTC','MARKETPLACE']);
 await selectChannel(page,'MARKETPLACE');await expect(first.getByLabel(labels.actions.owner,{exact:true})).toBeEnabled();await expect(first).not.toContainText(labels.actions.staleBadge);
 await first.getByRole('button',{name:evidenceButton(aw.viewEvidenceItem,'2026-08-02',cmAfter)}).first().click();
 await expectDrawerAmount(page,'255.00');await expect(evidenceDrawer(page)).toContainText(channelsLabel(['DTC','MARKETPLACE'],false));await page.keyboard.press('Escape');
 for(let n=2;n<=5;n++)await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 for(let n=1;n<=3;n++)await page.getByTestId(`action-${n}`).getByRole('button',{name:labels.buttons.pin,exact:true}).click();
 await page.getByTestId('action-4').getByRole('button',{name:labels.buttons.pin,exact:true}).click();await expect(page.getByTestId('action-notice')).toContainText(aw.maxPinned);
 doc=JSON.parse(await downloadDecision(page,'json'));expect(doc.actions).toHaveLength(5);expect(doc.actions.filter((a:{pinned:boolean})=>a.pinned)).toHaveLength(3);expect(doc.actions[0].status).toBe('draft');expect(doc.actions[4].binding.scope.channels).toEqual(['MARKETPLACE']);
 // V3-3：儲存選單經 openStorage（手機先展開頂欄「更多」）。
 const storage=await openStorage(page);
 const backup=await download(page,labels.buttons.downloadBackup);await page.reload();await openStorage(page);
 await storage.getByLabel(ws.selectBackupFile,{exact:true}).setInputFiles({name:'bound.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await expect(page.getByRole('region',{name:ws.restorePreviewAria})).toContainText(restoreCounts(5));await page.getByRole('button',{name:ws.applyRestore,exact:true}).click();
 await expect(page.getByTestId('workspace-status')).toContainText(goldenReady);await dismissSavePrompt(page);
 // 備份 ui_prefs.view 記住了清單檢視，恢復後直接回到清單。
 await navigateTo(page,'actions');await expect(page.getByTestId('actions-view-list')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('action-5')).toBeVisible();await expect(first.getByLabel(labels.actions.owner,{exact:true})).toBeEnabled();
 expect((await checkedEvidence(first)).sort()).toEqual([...ids].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(`verification/review-v2-a-regression-actions-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-regression-actions-browser.jsonl'),JSON.stringify({project:info.project.name,errors,actions:5,pins:3,historical_fact:'255.00',raw_sources:'original golden',backup_restore:true})+'\n');expect(errors).toEqual([]);
});
test('A2 會議選定方案與交辦固定來源，切檢視保留且明確更新來源才重選',async({page})=>{
 await load(page);await selectChannel(page,'DTC');await navigateTo(page,'scenarios');await startChannelContext(page);await expect(page.getByTestId('scenario-channel')).toHaveValue('DTC');const plan=page.getByTestId('scenario-1');
 await plan.getByLabel(labels.ui.decisionWorkbench.planName,{exact:true}).fill('主管會議履約方案');await applyKeepPreset(plan);await plan.getByLabel(labels.scenario.fulfillmentUnit.label,{exact:true}).fill('-10');await acceptAssumptions(plan,'first');await plan.getByRole('button',{name:labels.buttons.calculate,exact:true}).click();await expect(plan.getByTestId('scenario-contribution')).toHaveText(formatAmountL1('284.00'));
 await navigateTo(page,'diagnosis');await page.getByTestId('diagnosis-list').locator('details.diagnosis-row').first().getByRole('button',{name:labels.buttons.addToActions,exact:true}).click();await switchActionsView(page,'list');const action=page.getByTestId('action-1');
 for(const [label,value]of Object.entries({[labels.actions.owner]:'營運主管',[labels.actions.metric]:'履約費用',[labels.actions.due]:'2026-10-15',[labels.actions.stop]:'服務品質下降就停止',[labels.actions.extraData]:'物流報價'}))await action.getByLabel(label,{exact:true}).fill(value);
 await action.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(action).toContainText(aw.tagConfirmed);
 await navigateTo(page,'overview');await openMeeting(page);const agenda5=page.getByTestId('meeting-agenda-5');const choice=page.getByLabel(fill(labels.ui.reviewWorkbench.scenarioSelect,{channel:'DTC'}),{exact:true});const selected=await choice.locator('option').filter({hasText:fill(labels.ui.reviewWorkbench.planOption,{name:'主管會議履約方案'})}).getAttribute('value');expect(selected).toBeTruthy();await choice.selectOption(selected!);
 const markdown=await meetingMarkdown(page);for(const value of ['284.00','14.00','營運主管','服務品質下降就停止','主管會議履約方案'])expect(markdown).toContain(value);
 // R6：選入方案的試算結果列在議程 ⑤（meeting-scenario-results）；切全站檢視後會議仍保留固定來源的方案。
 await expect(agenda5.getByTestId('meeting-scenario-result')).toHaveCount(1);await expect(agenda5.getByTestId('meeting-scenario-result')).toContainText('主管會議履約方案');await expect(agenda5.getByTestId('meeting-scenario-result')).toHaveAttribute('data-status','current');
 await selectChannel(page,'MARKETPLACE');await expect(agenda5.getByTestId('meeting-scenario-results')).toContainText('主管會議履約方案');
 const retained=await meetingMarkdown(page);expect(retained.split(technicalAppendix)[0]).toContain(mdScenarioContribution(formatAmountL2('284.00')));
 await page.getByRole('button',{name:labels.buttons.updateMeetingSource,exact:true}).click();
 // V3-8 C（§7.10 區段空狀態）：議程 ⑤ 的空狀態是兩句（標題＋說明）＋「前往假設試算」文字按鈕（取代 v2 一整句 noScenario）。
 await expectMeetingNoScenario(agenda5);await expect(agenda5.getByTestId('meeting-scenario-results')).toHaveCount(0);
 const refreshed=await meetingMarkdown(page);expect(refreshed.split(technicalAppendix)[0]).not.toContain(mdScenarioContribution(formatAmountL2('284.00')));
 // 「前往假設試算」切到假設試算頁。
 await goToScenariosFromMeeting(page,agenda5);
});


async function confirmedDtcAction(page: Page) {
 await load(page);await selectChannel(page,'DTC');
 await navigateTo(page,'actions');await switchActionsView(page,'list');await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const card=page.getByTestId('action-1');await card.getByLabel(labels.actions.problem,{exact:true}).fill('核對原始DTC貢獻');
 // R5：證據是可搜尋的 checkbox 清單；搜尋只過濾未勾選的項目。
 const evidence=evidenceList(card);const all=await evidence.getByRole('checkbox').count();
 await evidence.getByRole('searchbox',{name:labels.actions.searchEvidence,exact:true}).fill(factL1('270.00'));
 const options=evidence.locator('label.evidence-option');await expect.poll(()=>options.count()).toBeLessThan(all);
 for(const text of await options.allTextContents())expect(text).toContain(factL1('270.00'));
 const box=evidence.getByRole('checkbox',{name:factText('2026-08-02','2026-08-02',cmAfter,'DTC',factL1('270.00')),exact:true});
 const id=await box.getAttribute('value');expect(id).toBeTruthy();
 await box.check();await evidence.getByRole('searchbox',{name:labels.actions.searchEvidence,exact:true}).fill('');expect(await checkedEvidence(card)).toEqual([id!]);
 await card.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(card).toContainText(aw.tagConfirmed);
 return {card,id:id!};
}

test('A1 檢視切換後仍可管理執行狀態與進度，管理編輯不撤銷引用確認',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);
 await selectChannel(page,'MARKETPLACE');
 for(const [label,value] of Object.entries({[labels.actions.owner]:'營運主管',[labels.actions.due]:'2026-10-20',[labels.actions.step]:'請核對已入帳費用'}))await card.getByLabel(label,{exact:true}).fill(value);
 await card.getByLabel(labels.actions.status,{exact:true}).selectOption('in_progress');
 await card.getByLabel(labels.actions.progress,{exact:true}).fill('=SUM(1)');
 await expect(card).toContainText(aw.tagConfirmed);
 await selectChannel(page,'DTC');
 await expect(card.getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 await expect(card.getByLabel(labels.actions.progress,{exact:true})).toHaveValue('=SUM(1)');
 // R5：清單改的執行狀態同步到看板欄位；切回清單後內容不變。V3-6（C13）：看板卡的引用標籤是「引用 n 個數字 · 已確認」。
 await switchActionsView(page,'board');await expect(page.getByTestId('board-column-in_progress').getByTestId('board-card-1').locator('.board-card-evidence')).toHaveText(fill(pv3.evidenceCount,{n:1,state:pv3.evidenceConfirmed}));await expect(page.getByTestId('board-card-1')).toContainText('營運主管');
 await switchActionsView(page,'list');await expect(card.getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 const doc=JSON.parse(await downloadDecision(page,'json'));
 expect(doc.actions[0]).toMatchObject({execution_status:'in_progress',progress_notes:'=SUM(1)',evidence_confirmed:true,status:'confirmed',fact_ids:[id],binding:{scope:{channels:['DTC']}}});expect(doc.actions[0].status_updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect(doc.actions[0].evidence[0].value).toBe('270.00');expect(doc.actions[0].binding_history).toHaveLength(1);expect(doc.actions[0].binding_history[0].fact_ids).toEqual([]);
 expect(await downloadDecision(page,'csv')).toContain("'=SUM(1)");
 await page.screenshot({path:resolve(`verification/review-v2-a-action-management-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-management-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',fact_value:'270.00',evidence_confirmed:true,management:'in_progress',errors})+'\n');expect(errors).toEqual([]);
});

test('A1 真換CSV後重新綁定先預覽，取消保留270，再明確確認170與完整歷史',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);const before=JSON.parse(await downloadDecision(page,'json'));
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
 await expect(page.getByTestId('workspace-status')).toContainText(goldenReady);await expect(wizard(page)).toHaveCount(0);
 await navigateTo(page,'actions');await expect(card).toContainText(aw.historicalAlert);
 await card.getByLabel(labels.actions.status,{exact:true}).selectOption('blocked');await card.getByLabel(labels.actions.progress,{exact:true}).fill('等待新版本費用對帳');
 await card.getByRole('button',{name:labels.buttons.rebind,exact:true}).click();const preview=card.getByRole('region',{name:aw.rebindRegion,exact:true});
 await expect(preview).toBeVisible();await expect(preview.locator('tbody tr')).toHaveCount(1);await expect(preview.locator('tbody td')).toHaveText([formatAmountL2('270.00'),formatAmountL2('170.00')]);
 await preview.getByRole('button',{name:labels.buttons.cancel,exact:true}).click();await expect(preview).toHaveCount(0);
 const cancelled=JSON.parse(await downloadDecision(page,'json'));expect(cancelled.actions[0].binding).toEqual(before.actions[0].binding);expect(cancelled.actions[0].evidence[0].value).toBe('270.00');expect(cancelled.actions[0].binding_history).toEqual(before.actions[0].binding_history);
 await card.getByRole('button',{name:labels.buttons.rebind,exact:true}).click();await expect(preview).toBeVisible();await preview.getByRole('button',{name:aw.rebindCommit,exact:true}).click();await expect(preview).toHaveCount(0);
 const result=JSON.parse(await downloadDecision(page,'json'));const action=result.actions[0];
 expect(action).toMatchObject({execution_status:'blocked',progress_notes:'等待新版本費用對帳',evidence_confirmed:true,binding_revision:before.actions[0].binding_revision+1,fact_ids:[id]});
 expect(action.evidence[0].value).toBe('170.00');expect(action.binding.dataset_hash).not.toBe(before.actions[0].binding.dataset_hash);
 expect(action.binding_history.at(-1).fact_ids).toEqual([id]);expect(action.binding_history.at(-1).evidence[0].value).toBe('270.00');expect(action.binding_history.at(-1).dataset_hash).toBe(before.actions[0].binding.dataset_hash);
 await card.getByText(fill(aw.historySummary,{n:2}),{exact:true}).click();await card.getByRole('button',{name:evidenceButton(aw.viewHistoryEvidence)}).click();await expectDrawerAmount(page,'270.00');await page.keyboard.press('Escape');
 await page.screenshot({path:resolve(`verification/review-v2-a-action-rebind-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-rebind-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',cancel_kept_original:true,old_value:'270.00',new_value:'170.00',same_fact_id:true,history_verified:true,errors})+'\n');expect(errors).toEqual([]);
});

test('R5 看板用按鈕改狀態：卡片移到進行中欄、通知與焦點跟著卡片，匯出記錄狀態更新日期',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const inProgress=labels.actions.statuses.in_progress;
 await load(page);await selectChannel(page,'DTC');
 await navigateTo(page,'actions');
 // V3-6（§7.5 第 6 點）：v2 的 h2「待辦看板」移除；空工作區不渲染看板，改為頁面型空狀態（全頁唯一的「新增待辦」在這裡）。
 await expect(page.getByTestId('actions-view-board')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('actions-empty').getByRole('heading',{name:pv3.emptyTitle,exact:true})).toBeVisible();
 await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const card=page.getByTestId('board-card-1');await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toBeVisible();
 // V3-6：看板上新增的待辦直接開待辦編輯抽屜（v2 是卡片內展開編輯表單）；欄位在抽屜裡，Esc 關閉後焦點回到新卡片。
 const drawer=actionDrawer(page);await expect(drawer).toBeVisible();
 await drawer.getByLabel(labels.actions.problem,{exact:true}).fill('看板改狀態');await expect(card.getByRole('heading',{name:'看板改狀態',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(card).toBeFocused();
 let doc=JSON.parse(await downloadDecision(page,'json'));expect(doc.actions).toHaveLength(1);expect(doc.actions[0]).toMatchObject({execution_status:'not_started',status_updated_at:null});
 // V3-6（C13）：「移到：」列的按鈕可見文字只剩狀態名，可及名稱仍是「移到{status}」。
 const move=page.getByTestId('board-card-1-move-in_progress');await expect(move).toHaveAccessibleName(fill(labels.actionBoard.moveTo,{status:inProgress}));await expect(move).toHaveText(inProgress);
 await move.click();
 const moved=page.getByTestId('board-column-in_progress').getByTestId('board-card-1');await expect(moved).toBeVisible();
 await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toHaveCount(0);
 // V3-6：欄標題＝狀態名＋計數徽章（只有數字，aria-label「1 項」）。
 const columnHeading=page.getByTestId('board-column-in_progress').getByRole('heading',{level:3});await expect(columnHeading).toContainText(inProgress);
 await expect(columnHeading.locator('.ui-count-badge')).toHaveText('1');await expect(columnHeading.locator('.ui-count-badge')).toHaveAttribute('aria-label',fill(labels.actionBoard.columnCount,{n:1}));
 await expect(page.getByTestId('action-notice')).toHaveText(fill(labels.actionBoard.moved,{n:1,status:inProgress}));
 await expect(moved).toBeFocused();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()); // R5：狀態更新日以臺北日曆日計
 // V3-6（C13）：卡片寫「M/D 更新」（formatDateL1），匯出仍是 ISO 日期。
 await expect(moved.locator('.board-card-updated')).toHaveText(fill(pv3.updated,{date:formatDateL1(today,{today})}));
 doc=JSON.parse(await downloadDecision(page,'json'));expect(doc.actions[0]).toMatchObject({problem:'看板改狀態',execution_status:'in_progress',status_updated_at:today});
 // CSV 每格都加引號；row_type 與 field／value 之間隔著 item 欄位。
 expect(await downloadDecision(page,'csv')).toMatch(new RegExp(`^.*,"manual_action",.*,"status_updated_at","${today}",`,'m'));
 await switchActionsView(page,'list');await expect(page.getByTestId('action-1').getByLabel(labels.actions.status,{exact:true})).toHaveValue('in_progress');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});

/** V3-6：看板新增一項（新增後立刻開抽屜）→ 在抽屜填問題 → 關閉後焦點回到新卡片 board-card-n。 */
async function addBoardAction(page:Page,n:number,problem:string){
 await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();
 const drawer=actionDrawer(page);await expect(drawer).toBeVisible();await expect(drawer).toHaveAttribute('data-index',String(n));
 await drawer.getByLabel(labels.actions.problem,{exact:true}).fill(problem);await expect(page.getByRole('dialog',{name:problem,exact:true})).toBeVisible();
 await closeActionDrawer(page);await expect(page.getByTestId(`board-card-${n}`)).toBeFocused();await expect(page.getByTestId(`board-card-${n}`).getByRole('heading',{level:4})).toHaveText(problem);
}

test('V3-6 看板抽屜：抽屜裡改狀態卡片換欄、置頂／往上移／移除在底部列、看明細疊開計算與來源並回焦',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const blocked=labels.actions.statuses.blocked;
 await load(page);await selectChannel(page,'DTC');
 await navigateTo(page,'actions');await switchActionsView(page,'board');
 for(const [n,problem] of [[1,'抽屜甲'],[2,'抽屜乙'],[3,'抽屜丙']] as const)await addBoardAction(page,n,problem);
 // 狀態在抽屜的 select 改：卡片換到「受阻」欄（抽屜仍開著，副標跟著換），通知在抽屜內也有一份；關閉後焦點回到換欄後的卡片。
 let drawer=await openActionDrawer(page,1);
 await drawer.getByLabel(labels.actions.owner,{exact:true}).fill('營運主管');
 await drawer.getByLabel(labels.actions.status,{exact:true}).selectOption('blocked');
 await expect(page.getByTestId('board-column-blocked').getByTestId('board-card-1')).toHaveCount(1);await expect(page.getByTestId('board-column-not_started').getByTestId('board-card-1')).toHaveCount(0);
 await expect(drawer).toBeVisible();await expect(drawer.locator('.action-drawer-notice')).toHaveText(fill(labels.actionBoard.moved,{n:1,status:blocked}));
 await expect(drawer.locator('.action-drawer-sub')).toHaveText(fill(labels.actions.drawerV3.subtitle,{owner:'營運主管',due:labels.actionBoard.noDeadline,status:blocked}));
 await closeActionDrawer(page);
 const movedCard=page.getByTestId('board-column-blocked').getByTestId('board-card-1');await expect(movedCard).toBeFocused();await expect(movedCard).toContainText('營運主管');
 // 往上移：丙（第 3 項）→ 第 2 項，抽屜仍開著、編號跟著換；置頂後排到第 1 項，不能再往上移。
 drawer=await openActionDrawer(page,3);
 await expect(drawer.getByTestId('action-drawer-move-up')).toBeEnabled();await drawer.getByTestId('action-drawer-move-up').click();
 await expect(drawer).toHaveAttribute('data-index','2');await expect(page.getByTestId('board-card-2').getByRole('heading',{level:4})).toHaveText('抽屜丙');await expect(page.getByTestId('board-card-3').getByRole('heading',{level:4})).toHaveText('抽屜乙');
 const pin=drawer.getByTestId('action-drawer-pin');await expect(pin).toHaveAttribute('aria-pressed','false');await expect(pin).toHaveText(labels.buttons.pin);
 await pin.click();
 await expect(pin).toHaveAttribute('aria-pressed','true');await expect(pin).toHaveText(aw.unpin);await expect(drawer).toHaveAttribute('data-index','1');await expect(drawer.getByTestId('action-drawer-move-up')).toBeDisabled();
 await expect(page.getByTestId('board-card-1').getByRole('heading',{level:4})).toHaveText('抽屜丙');
 await expect(page.getByTestId('board-card-1').locator('.board-pin')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('board-card-1').locator('.board-pin')).toHaveAccessibleName(aw.unpin);
 await expect(page.getByTestId('actions-count')).toHaveAttribute('aria-label',fill(aw.countSummary,{total:3,pinned:1}));
 // 移除（危險文字按鈕，最右）：抽屜關閉、卡片消失，焦點回到頁首的「新增待辦」。
 await drawer.getByTestId('action-drawer-remove').click();await expect(actionDrawer(page)).toHaveCount(0);
 await expect(page.getByTestId('action-board').getByRole('heading',{name:'抽屜丙',exact:true})).toHaveCount(0);await expect(page.getByTestId('action-board').locator('article.board-card')).toHaveCount(2);
 await expect(page.getByTestId('actions-add')).toBeFocused();await expect(page.getByTestId('actions-count')).toHaveAttribute('aria-label',fill(aw.countSummary,{total:2,pinned:0}));
 // 看明細：抽屜內勾一筆引用 → 「看明細」在待辦抽屜之上再開「計算與來源」（兩個 dialog）；Esc 只關上層，焦點回到抽屜內的「看明細」。
 drawer=await openActionDrawer(page,1);await expect(drawer.getByRole('heading',{level:2})).toHaveText('抽屜甲');
 const evidence=evidenceList(drawer);const box=evidence.getByRole('checkbox',{name:factText('2026-08-02','2026-08-02',cmAfter,'DTC',factL1('270.00')),exact:true});
 await box.check();expect(await checkedEvidence(drawer)).toEqual([await box.getAttribute('value')]);
 await expect(page.getByTestId('board-card-1').locator('.board-card-evidence')).toHaveText(fill(pv3.evidenceCount,{n:1,state:pv3.evidenceDraft}));
 const view=drawer.getByRole('button',{name:evidenceButton(aw.viewEvidenceItem,'2026-08-02',cmAfter)});await expect(view).toHaveCount(1);await view.click();
 await expect(evidenceDrawer(page)).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(2);await expectDrawerAmount(page,'270.00');
 await page.keyboard.press('Escape');await expect(evidenceDrawer(page)).toHaveCount(0);await expect(drawer).toBeVisible();await expect(view).toBeFocused();
 // 確認引用後卡片標籤變「已確認」；Esc 關閉抽屜，焦點回到開啟它的「編輯」。
 await drawer.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();await expect(page.getByTestId('board-card-1').locator('.board-card-evidence')).toHaveText(fill(pv3.evidenceCount,{n:1,state:pv3.evidenceConfirmed}));
 await page.keyboard.press('Escape');await expect(actionDrawer(page)).toHaveCount(0);await expect(page.getByTestId('board-card-1-edit')).toBeFocused();
 const doc=JSON.parse(await downloadDecision(page,'json'));expect(doc.actions.map((a:{problem:string})=>a.problem)).toEqual(['抽屜甲','抽屜乙']);
 expect(doc.actions[0]).toMatchObject({execution_status:'blocked',owner_role:'營運主管',evidence_confirmed:true,pinned:false});expect(doc.actions[0].evidence[0].value).toBe('270.00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});

test('V3-6 待辦抽屜：開啟後焦點在關閉鈕、Esc 關閉並回焦、移除後回到看板、空工作區只有一顆新增待辦',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 await load(page);await navigateTo(page,'actions');await switchActionsView(page,'board');
 const addButtons=page.getByRole('button',{name:labels.buttons.addAction,exact:true});
 // 空工作區：工具列照常顯示、看板不渲染；「新增待辦」全頁只有一顆，是空狀態的主要按鈕（頁首此時沒有）。
 const empty=page.getByTestId('actions-empty');await expect(empty).toBeVisible();
 await expect(empty.getByRole('heading',{level:2})).toHaveText(pv3.emptyTitle);await expect(empty.locator('p')).toHaveText(pv3.emptyBody);
 await expect(page.getByTestId('actions-toolbar')).toBeVisible();await expect(page.getByTestId('action-board')).toHaveCount(0);
 await expect(addButtons).toHaveCount(1);await expect(addButtons).toHaveAttribute('data-testid','actions-empty-add');await expect(page.getByTestId('actions-add')).toHaveCount(0);
 await expect(page.getByTestId('actions-count')).toHaveAttribute('aria-label',fill(aw.countSummary,{total:0,pinned:0}));
 await addBoardAction(page,1,'焦點測試甲');
 // 有待辦後「新增待辦」改在頁首（仍只有一顆）。
 await expect(empty).toHaveCount(0);await expect(addButtons).toHaveCount(1);await expect(addButtons).toHaveAttribute('data-testid','actions-add');
 await addBoardAction(page,2,'焦點測試乙');
 // 開啟後焦點在標題列的關閉鈕（icon，名稱「關閉」；底部另有文字「關閉」action-drawer-dismiss）；h2 是可及名稱，副標是描述。
 const drawer=await openActionDrawer(page,2);
 await expect(page.getByRole('dialog',{name:'焦點測試乙',exact:true})).toBeVisible();await expect(drawer).toHaveAccessibleDescription(fill(labels.actions.drawerV3.subtitle,{owner:labels.actionBoard.unassigned,due:labels.actionBoard.noDeadline,status:labels.actions.statuses.not_started}));
 await expect(drawer.getByTestId('action-drawer-close')).toHaveAccessibleName(labels.buttons.close);await expect(drawer.getByTestId('action-drawer-dismiss')).toHaveText(labels.buttons.close);
 // Esc 關閉，焦點回到開啟它的「編輯」；從標題鈕開啟時回到標題鈕。
 await page.keyboard.press('Escape');await expect(actionDrawer(page)).toHaveCount(0);await expect(page.getByTestId('board-card-2-edit')).toBeFocused();
 await page.locator('#board-card-2-title').click();await expect(actionDrawer(page)).toBeVisible();await expect(actionDrawer(page).getByTestId('action-drawer-close')).toBeFocused();
 await page.keyboard.press('Escape');await expect(actionDrawer(page)).toHaveCount(0);await expect(page.locator('#board-card-2-title')).toBeFocused();
 // 底部「關閉」（action-drawer-dismiss）也回焦到開啟它的「編輯」。
 await openActionDrawer(page,1);await actionDrawer(page).getByTestId('action-drawer-dismiss').click();await expect(actionDrawer(page)).toHaveCount(0);await expect(page.getByTestId('board-card-1-edit')).toBeFocused();
 // 移除：抽屜關閉、回到看板，焦點回到頁首「新增待辦」。
 await openActionDrawer(page,2);await actionDrawer(page).getByTestId('action-drawer-remove').click();
 await expect(actionDrawer(page)).toHaveCount(0);await expect(page.getByTestId('action-board')).toBeVisible();await expect(page.getByTestId('board-card-2')).toHaveCount(0);await expect(page.getByTestId('board-card-1')).toBeVisible();
 await expect(page.getByTestId('actions-add')).toBeFocused();
 // 移除最後一項：回到空工作區，焦點在空狀態唯一的「新增待辦」。
 await openActionDrawer(page,1);await actionDrawer(page).getByTestId('action-drawer-remove').click();
 await expect(actionDrawer(page)).toHaveCount(0);await expect(empty).toBeVisible();await expect(page.getByTestId('action-board')).toHaveCount(0);
 await expect(addButtons).toHaveCount(1);await expect(page.getByTestId('actions-empty-add')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});

/** PRD §7.5 驗收、§9.4 C6：待辦編輯抽屜有 focus trap（APG modal dialog：在最後一個控制按 Tab 回到第一個，在第一個按 Shift+Tab 回到最後一個）。 */
test('V3-6 待辦抽屜 focus trap：Tab 一路走都留在抽屜裡，最後一個控制按 Tab 回到第一個、Shift+Tab 反向',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 await load(page);await navigateTo(page,'actions');await switchActionsView(page,'board');
 await addBoardAction(page,1,'焦點圈甲');await addBoardAction(page,2,'焦點圈乙');
 const drawer=await openActionDrawer(page,2);
 const first=drawer.getByTestId('action-drawer-close'), last=drawer.getByTestId('action-drawer-remove');
 const focusState=()=>page.evaluate(()=>{const active=document.activeElement;return {inside:!!active?.closest('dialog[data-testid=action-drawer]'),testid:active?.getAttribute('data-testid')??null,tag:active?.tagName??null};});
 // 從關閉鈕一路 Tab 到最後一個控制（移除）：每一步焦點都在抽屜裡的控制上。
 let reachedLast=false;
 for(let step=0;step<300&&!reachedLast;step++){await page.keyboard.press('Tab');const state=await focusState();expect(state.inside,`第 ${step+1} 次 Tab 後焦點仍在抽屜內（目前 ${state.tag}）`).toBe(true);reachedLast=state.testid==='action-drawer-remove';}
 expect(reachedLast).toBe(true);await expect(last).toBeFocused();
 // 最後一個控制按 Tab 回到第一個（不經過頁面 body 或抽屜外）；第一個按 Shift+Tab 回到最後一個。
 await page.keyboard.press('Tab');expect(await focusState(),'最後一個控制按 Tab 應回到第一個（關閉 icon 鈕）').toMatchObject({inside:true,testid:'action-drawer-close'});await expect(first).toBeFocused();
 await page.keyboard.press('Shift+Tab');expect(await focusState(),'第一個控制按 Shift+Tab 應回到最後一個（移除）').toMatchObject({inside:true,testid:'action-drawer-remove'});await expect(last).toBeFocused();
 await page.keyboard.press('Escape');await expect(actionDrawer(page)).toHaveCount(0);await expect(page.getByTestId('board-card-2-edit')).toBeFocused();
 expect(errors).toEqual([]);
});
