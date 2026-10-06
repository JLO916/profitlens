import { WORKSPACE_VERSION } from '../../src/application/workspace-backup';
import { clearButton, closeStorage, dismissSavePrompt, navigateTo, openMeeting, openStorage, openValidation, selectScenarioChannel, switchActionsView } from './replacement-helpers';
import { chooseBasis, commitButton, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardStatus } from './import-wizard-helpers';
import { fill, labels } from '../../src/i18n';
import { formatAmountL1, formatAmountL3 } from '../../src/application/presentation';
import { readFileSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';

const test=base.extend<{audit:string[]}>({audit:[async({page},use,info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>{if(d.type()==='beforeunload')void d.accept();else void d.dismiss();});
 await use(errors);
 await appendFile(resolve('verification/review-v2-a-workflow-browser.jsonl'),JSON.stringify({test:info.title,project:info.project.name,status:info.status,pageerrors:errors})+'\n');
 expect(errors).toEqual([]);
},{auto:true}]});
// R2: every visible string comes from the label dictionary; this spec reads the same entries the components render.
const dlg=labels.ui.replacementDialog, store=labels.ui.workspaceStorage, review=labels.ui.reviewWorkbench, summaryCopy=labels.ui.managerSummary;
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** RegExp from a label template: placeholders in `values` are filled exactly, the rest match any text. */
const templateRe=(template:string,values:Record<string,string>={},flags='')=>new RegExp(`^${escapeRe(template).replace(/\\\{(\w+)\\\}/g,(_,key:string)=>key in values?escapeRe(values[key]):'.+?')}$`,flags);
/** V3-2a：狀態列「資料到 {date}」的日期取自該資料集 manifest 的 data_as_of。 */
const ready=(dataset:'golden')=>fill(labels.status.ready,{date:JSON.parse(readFileSync(resolve(`fixtures/${dataset}/manifest.json`),'utf8')).data_as_of});
const status=(p:Page)=>p.getByTestId('workspace-status');
/** V3-2b（§3.3、§8.5）：KPI 大數字與試算結果都是 L1（< 1 萬寫整數元「284 元」，HALF_UP：−6.50 →「−7 元」）；金額取自 golden 精確值。 */
const l1=(amount:string)=>formatAmountL1(amount);
const guard=(p:Page)=>p.getByRole('dialog',{name:dlg.heading});
async function golden(p:Page){await p.goto('/');await openValidation(p);await p.getByLabel(labels.ui.dashboard.validation.datasetLabel,{exact:true}).selectOption('golden');await p.getByRole('button',{name:labels.ui.dashboard.validation.loadButton,exact:true}).click();await expect(status(p)).toContainText(ready('golden'));await dismissSavePrompt(p);}
/** V3-3：儲存選單（workspace-storage）經 openStorage（手機先展開頂欄「更多」）。 */
const storage=(p:Page)=>openStorage(p);
async function backup(p:Page){const s=await storage(p);const event=p.waitForEvent('download');await s.getByRole('button',{name:labels.buttons.downloadBackup,exact:true}).click();return readFile((await(await event).path())!,'utf8');}
/** R3: the alternative fixture + its manifest go through the four-step wizard and stop after the check (not committed), so the guard tests can cancel and retry the commit. */
async function stageAlternative(p:Page){await openWizard(p);await setWizardFiles(p,resolve('tests/fixtures/alternative'));await setWizardManifest(p,resolve('tests/fixtures/alternative/manifest.json'));await nextFromFiles(p);await confirmMappingIfShown(p);await chooseBasis(p,'exclusive');await confirmAndCheck(p,'valid');await expect(wizardStatus(p)).toContainText(labels.importWizard.result.valid);}

test('A3 示範替換可取消，下載尚未確認不能替換，確認後才繼續',async({page},info)=>{
 await golden(page);await navigateTo(page,'data');await page.getByRole('button',{name:labels.buttons.loadDemo,exact:true}).click();await expect(guard(page)).toBeVisible();
 await guard(page).getByRole('button',{name:labels.buttons.cancel,exact:true}).click();await expect(status(page)).toContainText('Golden');
 await page.getByRole('button',{name:labels.buttons.loadDemo,exact:true}).click();await guard(page).getByRole('button',{name:dlg.saveFirst,exact:true}).click();
 const event=page.waitForEvent('download');await guard(page).getByRole('button',{name:labels.buttons.downloadBackup,exact:true}).click();const text=await readFile((await(await event).path())!,'utf8');expect(JSON.parse(text).schema_version).toBe(WORKSPACE_VERSION);
 await expect(status(page)).toContainText('Golden');await expect(guard(page)).toBeVisible();
 await guard(page).getByRole('button',{name:dlg.confirmDownloadedAndContinue,exact:true}).click();await expect(status(page)).toContainText(labels.ui.dashboard.datasets.demo);
 await page.screenshot({path:resolve(`verification/review-v2-a-guard-${info.project.name}.png`),fullPage:false});
});
test('A3 新CSV套用取消保留預覽，明示繼續後才改金額；恢復取消不丟候選',async({page})=>{
 await golden(page);const original=await backup(page);await stageAlternative(page);
 await commitButton(page).click();await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:labels.buttons.cancel,exact:true}).click();await expect(wizardStatus(page)).toContainText(labels.importWizard.result.valid);await expect(commitButton(page)).toBeVisible();await expect(status(page)).toContainText('Golden');
 await commitButton(page).click();await guard(page).getByRole('button',{name:dlg.discardAndContinue,exact:true}).click();await expect(wizard(page)).toHaveCount(0);await expect(status(page)).toContainText('alternative-import');await expect(page.getByTestId('kpi-contribution_after_marketing').locator('.kpi-value')).toHaveText(l1('10.00'));
 const s=await storage(page);await s.getByLabel(store.selectBackupFile,{exact:true}).setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(original)});await expect(page.getByRole('region',{name:store.restorePreviewAria})).toBeVisible();
 await s.getByRole('button',{name:store.applyRestore,exact:true}).click();await guard(page).getByRole('button',{name:labels.buttons.cancel,exact:true}).click();await expect(page.getByRole('region',{name:store.restorePreviewAria})).toBeVisible();await expect(status(page)).toContainText('alternative-import');
 await s.getByRole('button',{name:store.applyRestore,exact:true}).click();await guard(page).getByRole('button',{name:dlg.discardAndContinue,exact:true}).click();await expect(status(page)).toContainText('Golden');await expect(page.getByTestId('kpi-contribution_after_marketing').locator('.kpi-value')).toHaveText(l1('255.00'));
});
test('A3 本機保存失敗不清空；沒有保存同意不能儲存，Escape保留資料',async({page})=>{
 await page.addInitScript(()=>{const original=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args:Parameters<IDBFactory['open']>){if(args[0]==='profitlens-opt-in-workspace-v1')throw new DOMException('test denied','QuotaExceededError');return original.apply(this,args);};});
 // V3-3：v2 頂欄的「清空」搬進儲存選單的「危險區」（clearButton 先開選單）。
 await golden(page);await (await clearButton(page)).click();await guard(page).getByRole('button',{name:dlg.saveFirst,exact:true}).click();await expect(guard(page).getByRole('button',{name:dlg.saveLocalAndContinue,exact:true})).toBeDisabled();
 await guard(page).getByLabel(dlg.localConsent,{exact:true}).check();await guard(page).getByRole('button',{name:dlg.saveLocalAndContinue,exact:true}).click();await expect(guard(page).getByRole('alert')).toContainText(dlg.errors.saveFailed);await expect(status(page)).toContainText('Golden');
 await page.keyboard.press('Escape');await expect(guard(page)).toHaveCount(0);await expect(status(page)).toContainText('Golden');
});

test('A1–A3 多通路各三案、三置頂五附錄，會議離頁與v3恢复一致且實際匯出',async({page},info)=>{
 test.setTimeout(120_000);
 await golden(page);
 // R5：試算頁進頁即表單，通路只在本頁切換（scenario-channel），不改全站篩選；方案 1 是進頁即有的草稿，第 2、3 案才按「新增方案」。
 await navigateTo(page,'scenarios');
 for(const channel of ['DTC','MARKETPLACE']) {
  await selectScenarioChannel(page,channel);
  for(let i=1;i<=3;i++) {
   if(i>1)await page.getByRole('button',{name:labels.buttons.addScenario,exact:true}).click();const card=page.getByTestId(`scenario-${i}`);
   await card.getByLabel(labels.ui.decisionWorkbench.planName,{exact:true}).fill(`${channel} 方案 ${i}`);
   for(const[label,value]of Object.entries({[labels.scenario.volume.label]:'0',[labels.scenario.discount.label]:'0',[labels.scenario.fulfillmentUnit.label]:'-10',[labels.scenario.adSpend.label]:'0',[labels.scenario.oneOff.label]:i===1?'0':'20'}))await card.getByLabel(label,{exact:true}).fill(value);
   await card.getByLabel(labels.scenario.acceptAssumptions,{exact:true}).check();await card.getByRole('button',{name:labels.buttons.calculate,exact:true}).click();
   await expect(card.getByTestId('scenario-contribution')).toHaveText(l1(channel==='DTC'?(i===1?'284.00':'264.00'):(i===1?'-6.50':'-26.50')));
  }
  await expect(page.getByRole('button',{name:labels.buttons.addScenario,exact:true})).toBeDisabled();
 }
 await selectScenarioChannel(page,'DTC');
 await expect(page.getByTestId('scenario-1').getByLabel(labels.ui.decisionWorkbench.planName,{exact:true})).toHaveValue('DTC 方案 1');
 // 試算頁切通路不動全站篩選：全站仍是全部通路。
 await expect(page.getByLabel(labels.ui.dashboard.filter.channel,{exact:true})).toHaveValue('');
 await navigateTo(page,'actions');
 // R5：行動頁預設看板；逐張填寫用清單檢視，證據改為 checkbox 清單（evidence-checklist）。
 await switchActionsView(page,'list');
 for(let i=1;i<=8;i++) {
  await page.getByRole('button',{name:labels.buttons.addAction,exact:true}).click();const card=page.getByTestId(`action-${i}`);
  await card.getByLabel(labels.actions.problem,{exact:true}).fill(`合成行動第${i}項`);await card.getByLabel(labels.actions.step,{exact:true}).fill('先核對來源與物流條件');
  await card.getByLabel(labels.actions.owner,{exact:true}).fill('營運主管');await card.getByLabel(labels.actions.due,{exact:true}).fill('2026-10-08');
  const evidence=card.getByTestId('evidence-checklist').locator('input[type=checkbox]').first();expect(await evidence.getAttribute('value')).toBeTruthy();await evidence.check();await expect(card.getByTestId('evidence-checklist').locator('input[type=checkbox]:checked')).toHaveCount(1);await card.getByRole('button',{name:labels.buttons.confirm,exact:true}).click();
  if(i<=3)await card.getByRole('button',{name:labels.buttons.pin,exact:true}).click();
 }
 // R6：會議稿在獨立分頁「會議紀錄」（openMeeting 切到該分頁）。
 await openMeeting(page);const summary=page.getByTestId('manager-summary');
 await page.getByLabel(labels.meeting.name,{exact:true}).fill('合成資料月度營運會議');await page.getByLabel(labels.meeting.notes,{exact:true}).fill('待補物流報價，僅為靜態條件比較。');
 await summary.getByLabel(labels.meeting.threshold,{exact:true}).fill('1000');await summary.getByRole('button',{name:labels.buttons.apply,exact:true}).click();
 for(const channel of ['DTC','MARKETPLACE']) {
  const choices=page.getByLabel(fill(review.scenarioSelect,{channel}),{exact:true});const option=await choices.locator('option').filter({hasText:templateRe(review.planOption,{name:`${channel} 方案 1`})}).getAttribute('value');await choices.selectOption(option!);
 }
 const updates=page.getByRole('button',{name:templateRe(review.refreshActionRef)});
 while(await updates.count())await updates.first().click();
 await page.getByLabel(labels.meeting.decision,{exact:true}).selectOption('needs_data');
 // R6：未置頂的五項收在議程 ⑥ 的「其他待辦（5）」（details.meeting-other-actions）；主管摘要不再有方案與待辦區塊。
 await expect(page.getByTestId('meeting-agenda-6').locator('details.meeting-other-actions > summary')).toHaveText(fill(summaryCopy.appendixActions,{n:5}));
 await expect(summary.locator('summary').filter({hasText:fill(summaryCopy.appendixActions,{n:5})})).toHaveCount(0);
 // 離開會議分頁再回來：總覽只剩一行入口（本期會議狀態＋「前往會議紀錄」），由入口回到會議紀錄。
 await navigateTo(page,'products');await navigateTo(page,'overview');
 const entry=page.getByTestId('overview-meeting-entry');await expect(entry).toContainText(fill(labels.meetingPage.entry,{state:labels.meeting.decisions.need_data}));await entry.getByRole('button',{name:labels.meetingPage.goToMeeting,exact:true}).click();await expect(page.getByTestId('meeting-page')).toBeVisible();
 await expect(summary.getByLabel(labels.meeting.threshold,{exact:true})).toHaveValue('1000.00');await expect(page.getByLabel(labels.meeting.decision,{exact:true})).toHaveValue('needs_data');
 const s=await storage(page), event=page.waitForEvent('download');await s.getByRole('button',{name:labels.buttons.downloadBackup,exact:true}).click();const download=await event;
 await download.saveAs(resolve(`verification/review-v2-a-workspace-${info.project.name}.json`));const text=await readFile((await download.path())!,'utf8');const wire=JSON.parse(text);
 expect(wire.schema_version).toBe(WORKSPACE_VERSION);expect(Object.keys(wire.payload.sources)).toHaveLength(1);expect(wire.payload.scenario_workspace.contexts.map((c:{plans:unknown[]})=>c.plans.length)).toEqual([3,3]);expect(wire.payload.review_session.pinned_action_ids).toHaveLength(3);expect(wire.payload.review_session.selected_scenarios).toHaveLength(2);
 await s.getByRole('button',{name:store.confirmDownloaded,exact:true}).click();
 await (await clearButton(page)).click();await expect(status(page)).toContainText(labels.status.empty);
 const fresh=await storage(page);await fresh.getByLabel(store.selectBackupFile,{exact:true}).setInputFiles({name:'meeting.json',mimeType:'application/json',buffer:Buffer.from(text)});await fresh.getByRole('button',{name:store.applyRestore,exact:true}).click();
 await expect(status(page)).toContainText(ready('golden'));
 // R6：恢復後保存提示再出現（portal 到 body、z-index 低於頂欄選單）；390 寬時仍開著的儲存選單面板會蓋住底部提示，先收起選單再回答。
 // V3-3 手機：儲存選單的開關（summary）在頂欄「更多」的底部列；提示仍應低於頂欄選單、不擋住它（非 modal）。目前手機上提示蓋住該列（產品缺陷，已回報），本步驟在手機會失敗。
 await closeStorage(page);await expect(page.getByTestId('local-save-prompt')).toBeVisible();await dismissSavePrompt(page);await expect(page.getByTestId('local-save-prompt')).toHaveCount(0);await openMeeting(page);
 await expect(summary.getByLabel(labels.meeting.threshold,{exact:true})).toHaveValue('1000.00');await expect(page.getByLabel(labels.meeting.decision,{exact:true})).toHaveValue('needs_data');
 // R6：選入方案的試算結果列在議程 ⑤（meeting-agenda-5）。
 const scenarioResults=page.getByTestId('meeting-agenda-5').getByTestId('meeting-scenario-results');await expect(scenarioResults.getByTestId('meeting-scenario-result')).toHaveCount(2);await expect(scenarioResults.getByTestId('meeting-scenario-result').filter({hasText:'DTC 方案 1'})).toContainText(l1('284.00'));await expect(scenarioResults.getByTestId('meeting-scenario-result').filter({hasText:'MARKETPLACE 方案 1'})).toContainText(l1('-6.50'));
 const mdEvent=page.waitForEvent('download');await page.getByTestId('meeting-outputs').getByRole('button',{name:labels.buttons.exportMarkdown,exact:true}).click();const mdDownload=await mdEvent;await mdDownload.saveAs(resolve(`verification/review-v2-a-meeting-${info.project.name}.md`));const md=await readFile((await mdDownload.path())!,'utf8');const[main,appendix]=md.split(`## ${labels.sections.technicalDetails}`);
 expect((main.match(/合成行動第/g)||[])).toHaveLength(3);expect((appendix.match(/合成行動第/g)||[])).toHaveLength(5);expect(main).toMatch(templateRe(summaryCopy.mdComparison,{threshold:formatAmountL3('1000.00')},'m')); // V3-2b：門檻在 Markdown 取到分（L3，千分位）
 await page.screenshot({path:resolve(`verification/review-v2-a-meeting-${info.project.name}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await navigateTo(page,'scenarios');await selectScenarioChannel(page,'DTC');
 const plan=page.getByTestId('scenario-1');await plan.getByLabel(labels.scenario.oneOff.label,{exact:true}).fill('20');await expect(plan.getByTestId('scenario-contribution')).toHaveCount(0);
 // R6：過期方案清單在議程 ⑤（meeting-agenda-5），不在會議基本（review-workbench）。
 await openMeeting(page);await expect(page.getByLabel(labels.meeting.decision,{exact:true})).toHaveValue('draft');await expect(page.getByTestId('meeting-agenda-5')).toContainText(review.staleScenarios);
});
