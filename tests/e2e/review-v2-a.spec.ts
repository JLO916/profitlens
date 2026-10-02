import { openMeeting } from './replacement-helpers';
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
const status=(p:Page)=>p.getByTestId('workspace-status');
const guard=(p:Page)=>p.getByRole('dialog',{name:'替換前先儲存工作區'});
async function golden(p:Page){await p.goto('/');await p.getByRole('button',{name:'進階驗證',exact:true}).click();await p.getByLabel('資料集',{exact:true}).selectOption('golden');await p.getByRole('button',{name:'載入資料集',exact:true}).click();await expect(status(p)).toContainText('資料已就緒');}
async function storage(p:Page){const s=p.getByTestId('workspace-storage');if(await s.getAttribute('open')===null)await s.locator('summary').click();return s;}
async function backup(p:Page){const s=await storage(p);const event=p.waitForEvent('download');await s.getByRole('button',{name:'下載完整工作區備份',exact:true}).click();return readFile((await(await event).path())!,'utf8');}
async function stageAlternative(p:Page){await p.getByRole('button',{name:'匯入標準 CSV',exact:true}).click();const form=p.getByTestId('import-panel');for(const[label,file]of Object.entries({'商品銷售 CSV':'sales_daily.csv','通路費用 CSV':'channel_costs_daily.csv','廣告支出 CSV':'ad_spend_daily.csv','讀取 manifest JSON':'manifest.json'}))await form.getByLabel(label,{exact:true}).setInputFiles(resolve('tests/fixtures/alternative',file));await form.getByLabel('我已確認未稅商品金額與費用口徑',{exact:true}).check();await form.getByRole('button',{name:'檢核匯入資料',exact:true}).click();await expect(p.getByTestId('import-status')).toContainText('檢核通過');}

test('A3 示範替換可取消，下載尚未確認不能替換，確認後才繼續',async({page},info)=>{
 await golden(page);await page.getByRole('button',{name:'資料工作區',exact:true}).click();await page.getByRole('button',{name:'載入示範資料',exact:true}).click();await expect(guard(page)).toBeVisible();
 await guard(page).getByRole('button',{name:'取消',exact:true}).click();await expect(status(page)).toContainText('Golden');
 await page.getByRole('button',{name:'載入示範資料',exact:true}).click();await guard(page).getByRole('button',{name:'先儲存',exact:true}).click();
 const event=page.waitForEvent('download');await guard(page).getByRole('button',{name:'下載備份',exact:true}).click();const text=await readFile((await(await event).path())!,'utf8');expect(JSON.parse(text).schema_version).toBe('profitlens-workspace-v3');
 await expect(status(page)).toContainText('Golden');await expect(guard(page)).toBeVisible();
 await guard(page).getByRole('button',{name:'已確認備份已保存並繼續',exact:true}).click();await expect(status(page)).toContainText('營運示範');
 await page.screenshot({path:resolve(`verification/review-v2-a-guard-${info.project.name}.png`),fullPage:false});
});
test('A3 新CSV套用取消保留預覽，明示繼續後才改金額；恢復取消不丟候選',async({page})=>{
 await golden(page);const original=await backup(page);await stageAlternative(page);
 await page.getByRole('button',{name:'套用匯入資料',exact:true}).click();await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByTestId('import-status')).toContainText('檢核通過');await expect(status(page)).toContainText('Golden');
 await page.getByRole('button',{name:'套用匯入資料',exact:true}).click();await guard(page).getByRole('button',{name:'不儲存並繼續',exact:true}).click();await expect(status(page)).toContainText('alternative-import');await expect(page.getByTestId('kpi-contribution_after_marketing').locator('.kpi-value')).toHaveText('10.00');
 const s=await storage(page);await s.getByLabel('選取工作區備份 JSON',{exact:true}).setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(original)});await expect(page.getByRole('region',{name:'工作區恢復預覽'})).toBeVisible();
 await s.getByRole('button',{name:'套用備份並取代工作區',exact:true}).click();await guard(page).getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('region',{name:'工作區恢復預覽'})).toBeVisible();await expect(status(page)).toContainText('alternative-import');
 await s.getByRole('button',{name:'套用備份並取代工作區',exact:true}).click();await guard(page).getByRole('button',{name:'不儲存並繼續',exact:true}).click();await expect(status(page)).toContainText('Golden');await expect(page.getByTestId('kpi-contribution_after_marketing').locator('.kpi-value')).toHaveText('255.00');
});
test('A3 本機保存失敗不清空；沒有保存同意不能儲存，Escape保留資料',async({page})=>{
 await page.addInitScript(()=>{const original=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args:Parameters<IDBFactory['open']>){if(args[0]==='profitlens-opt-in-workspace-v1')throw new DOMException('test denied','QuotaExceededError');return original.apply(this,args);};});
 await golden(page);await page.getByRole('button',{name:'清空工作區',exact:true}).click();await guard(page).getByRole('button',{name:'先儲存',exact:true}).click();await expect(guard(page).getByRole('button',{name:'儲存本機副本並繼續',exact:true})).toBeDisabled();
 await guard(page).getByLabel('我同意將本次工作區儲存在這個瀏覽器',{exact:true}).check();await guard(page).getByRole('button',{name:'儲存本機副本並繼續',exact:true}).click();await expect(guard(page).getByRole('alert')).toContainText('儲存未完成');await expect(status(page)).toContainText('Golden');
 await page.keyboard.press('Escape');await expect(guard(page)).toHaveCount(0);await expect(status(page)).toContainText('Golden');
});

test('A1–A3 多通路各三案、三置頂五附錄，會議離頁與v3恢复一致且實際匯出',async({page},info)=>{
 test.setTimeout(120_000);
 await golden(page);
 for(const channel of ['DTC','MARKETPLACE']) {
  await page.getByLabel('通路',{exact:true}).selectOption(channel);
  await page.getByRole('button',{name:'情境試算',exact:true}).click();
  await page.getByRole('button',{name:`建立 ${channel} 方案工作區`,exact:true}).click();
  for(let i=1;i<=3;i++) {
   await page.getByRole('button',{name:'新增方案',exact:true}).click();const card=page.getByTestId(`scenario-${i}`);
   await card.getByLabel('方案名稱',{exact:true}).fill(`${channel} 方案 ${i}`);
   for(const[label,value]of Object.entries({'售出量變化（相對 %）':'0','折扣率變化（百分點）':'0','單位履約成本變化（相對 %）':'-10','總廣告支出變化（相對 %）':'0','一次性投入（TWD）':i===1?'0':'20'}))await card.getByLabel(label,{exact:true}).fill(value);
   await card.getByLabel('我接受此方案的全部固定假設',{exact:true}).check();await card.getByRole('button',{name:'計算方案',exact:true}).click();
   await expect(card.getByTestId('scenario-contribution')).toHaveText(channel==='DTC'?(i===1?'284.00':'264.00'):(i===1?'-6.50':'-26.50'));
  }
  await expect(page.getByRole('button',{name:'新增方案',exact:true})).toBeDisabled();
 }
 await page.getByLabel('通路',{exact:true}).selectOption('DTC');
 await expect(page.getByTestId('scenario-1').getByLabel('方案名稱',{exact:true})).toHaveValue('DTC 方案 1');
 await page.getByLabel('通路',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'行動摘要',exact:true}).click();
 for(let i=1;i<=8;i++) {
  await page.getByRole('button',{name:'新增行動',exact:true}).click();const card=page.getByTestId(`action-${i}`);
  await card.getByLabel('問題',{exact:true}).fill(`合成行動第${i}項`);await card.getByLabel('具體動作',{exact:true}).fill('先核對來源與物流條件');
  await card.getByLabel('負責角色',{exact:true}).fill('營運主管');await card.getByLabel('期限',{exact:true}).fill('2026-10-08');
  const evidence=card.getByLabel('本快照證據（可複選）',{exact:true});const fact=await evidence.locator('option').first().getAttribute('value');await evidence.selectOption(fact!);await card.getByRole('button',{name:'確認行動與證據',exact:true}).click();
  if(i<=3)await card.getByRole('button',{name:'置頂行動',exact:true}).click();
 }
 await page.getByRole('button',{name:'經營總覽',exact:true}).click();
 await openMeeting(page);const summary=page.getByTestId('manager-summary');
 await page.getByLabel('會議名稱',{exact:true}).fill('合成資料月度營運會議');await page.getByLabel('會議備註',{exact:true}).fill('待補物流報價，僅為靜態條件比較。');
 await summary.getByLabel('金額重要性門檻（TWD）',{exact:true}).fill('1000');await summary.getByRole('button',{name:'套用摘要門檻',exact:true}).click();
 for(const channel of ['DTC','MARKETPLACE']) {
  const choices=page.getByLabel(`${channel} 本次摘要所選方案`,{exact:true});const option=await choices.locator('option').filter({hasText:`${channel} 方案 1（版本`}).getAttribute('value');await choices.selectOption(option!);
 }
 const updates=page.getByRole('button',{name:/^更新會議行動引用：/});
 while(await updates.count())await updates.first().click();
 await page.getByLabel('會議決策',{exact:true}).selectOption('needs_data');
 await expect(summary.locator('summary').filter({hasText:'其他行動附錄（5）'})).toBeVisible();
 await page.getByRole('button',{name:'商品毛利',exact:true}).click();await page.getByRole('button',{name:'經營總覽',exact:true}).click();
 await expect(summary.getByLabel('金額重要性門檻（TWD）',{exact:true})).toHaveValue('1000.00');await expect(page.getByLabel('會議決策',{exact:true})).toHaveValue('needs_data');
 const s=await storage(page), event=page.waitForEvent('download');await s.getByRole('button',{name:'下載完整工作區備份',exact:true}).click();const download=await event;
 await download.saveAs(resolve(`verification/review-v2-a-workspace-${info.project.name}.json`));const text=await readFile((await download.path())!,'utf8');const wire=JSON.parse(text);
 expect(wire.schema_version).toBe('profitlens-workspace-v3');expect(Object.keys(wire.payload.sources)).toHaveLength(1);expect(wire.payload.scenario_workspace.contexts.map((c:{plans:unknown[]})=>c.plans.length)).toEqual([3,3]);expect(wire.payload.review_session.pinned_action_ids).toHaveLength(3);expect(wire.payload.review_session.selected_scenarios).toHaveLength(2);
 await s.getByRole('button',{name:'已確認備份檔已保存',exact:true}).click();
 await page.getByRole('button',{name:'清空工作區',exact:true}).click();await expect(status(page)).toContainText('尚未載入資料');
 const fresh=await storage(page);await fresh.getByLabel('選取工作區備份 JSON',{exact:true}).setInputFiles({name:'meeting.json',mimeType:'application/json',buffer:Buffer.from(text)});await fresh.getByRole('button',{name:'套用備份並取代工作區',exact:true}).click();
 await expect(summary.getByLabel('金額重要性門檻（TWD）',{exact:true})).toHaveValue('1000.00');await expect(page.getByLabel('會議決策',{exact:true})).toHaveValue('needs_data');
 await expect(summary).toContainText('284.00');await expect(summary).toContainText('-6.50');
 const mdEvent=page.waitForEvent('download');await summary.getByRole('button',{name:'下載主管摘要 Markdown',exact:true}).click();const mdDownload=await mdEvent;await mdDownload.saveAs(resolve(`verification/review-v2-a-meeting-${info.project.name}.md`));const md=await readFile((await mdDownload.path())!,'utf8');const[main,appendix]=md.split('## 技術稽核附錄');
 expect((main.match(/合成行動第/g)||[])).toHaveLength(3);expect((appendix.match(/合成行動第/g)||[])).toHaveLength(5);expect(main).toContain('重要性門檻：1000.00 TWD');
 await page.screenshot({path:resolve(`verification/review-v2-a-meeting-${info.project.name}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'情境試算',exact:true}).click();await page.getByLabel('通路',{exact:true}).selectOption('DTC');
 const plan=page.getByTestId('scenario-1');await plan.getByLabel('一次性投入（TWD）',{exact:true}).fill('20');await expect(plan.getByTestId('scenario-contribution')).toHaveCount(0);
 await page.getByRole('button',{name:'經營總覽',exact:true}).click();await expect(page.getByLabel('會議決策',{exact:true})).toHaveValue('draft');await expect(page.getByTestId('review-workbench')).toContainText('保留的舊方案版本');
});
