import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openMeeting } from './replacement-helpers';
async function load(page:Page){await page.goto('/');await page.getByRole('button',{name:'進階驗證',exact:true}).click();await page.getByLabel('資料集',{exact:true}).selectOption('golden');await page.getByRole('button',{name:'載入資料集',exact:true}).click();await openMeeting(page);await expect(page.getByTestId('manager-summary')).toBeVisible();}
async function discardReplacement(page:Page){const dialog=page.getByRole('dialog',{name:'替換前先儲存工作區',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'不儲存並繼續',exact:true}).click();await expect(dialog).not.toBeVisible();}
async function download(page:Page,label:string){const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();return readFile((await(await event).path())!,'utf8');}
test('PL05 診斷帶入精確證據、跨通路草稿、歷史來源與五工作項目備份',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));page.on('dialog',d=>void d.accept());await load(page);
 await page.getByRole('button',{name:'通路診斷',exact:true}).click();
 const diagnostic=page.locator('.diagnostic-card').filter({has:page.getByRole('heading',{name:'淨營收增加，行銷後貢獻下降',exact:true})}).first();
 const ids=await diagnostic.locator('details li code').allTextContents();expect(ids.length).toBeGreaterThan(0);
 await diagnostic.getByRole('button',{name:'建立行動草稿',exact:true}).click();
 const first=page.getByTestId('action-1');await expect(first).toContainText('草稿／證據待確認');
 await expect(page.getByRole('heading',{name:'每個方案都必須接受的固定假設',exact:true})).not.toBeVisible();
 expect((await first.getByLabel('本快照證據（可複選）',{exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).sort()).toEqual([...ids].sort());
 expect(await first.getByLabel('本快照證據（可複選）',{exact:true}).locator('option').first().textContent()).not.toContain('fact:');
 let doc=JSON.parse(await download(page,'下載決策 JSON'));expect(doc.actions[0].fact_ids).toEqual(ids);expect(doc.actions[0].evidence_confirmed).toBe(false);expect(doc.actions[0].binding.scope.channels).toEqual(['DTC','MARKETPLACE']);
 await page.getByLabel('通路',{exact:true}).selectOption('MARKETPLACE');await expect(first.getByLabel('負責角色',{exact:true})).toBeEnabled();await expect(first).not.toContainText('已過期');
 await first.getByRole('button',{name:/^查看證據 ·.*2026-08-02.*行銷後貢獻/}).first().click();
 await expect(page.getByRole('dialog').locator('p.number')).toHaveText('NT$ 255.00');await expect(page.getByRole('dialog')).toContainText('DTC、MARKETPLACE');await page.keyboard.press('Escape');
 for(let n=2;n<=5;n++)await page.getByRole('button',{name:'新增行動',exact:true}).click();
 for(let n=1;n<=3;n++)await page.getByTestId(`action-${n}`).getByRole('button',{name:'置頂行動',exact:true}).click();
 await page.getByTestId('action-4').getByRole('button',{name:'置頂行動',exact:true}).click();await expect(page.getByTestId('action-notice')).toContainText('最多置頂三項');
 doc=JSON.parse(await download(page,'下載決策 JSON'));expect(doc.actions).toHaveLength(5);expect(doc.actions.filter((a:{pinned:boolean})=>a.pinned)).toHaveLength(3);expect(doc.actions[0].status).toBe('draft');expect(doc.actions[4].binding.scope.channels).toEqual(['MARKETPLACE']);
 const storage=page.getByTestId('workspace-storage');await storage.locator(':scope > summary').click();
 const backup=await download(page,'下載完整工作區備份');await page.reload();await storage.locator(':scope > summary').click();
 await storage.getByLabel('選取工作區備份 JSON',{exact:true}).setInputFiles({name:'bound.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await expect(page.getByRole('region',{name:'工作區恢復預覽'})).toContainText('行動 5 項');await page.getByRole('button',{name:'套用備份並取代工作區',exact:true}).click();
 await page.getByRole('button',{name:'行動摘要',exact:true}).click();await expect(page.getByTestId('action-5')).toBeVisible();await expect(first.getByLabel('負責角色',{exact:true})).toBeEnabled();
 expect((await first.getByLabel('本快照證據（可複選）',{exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).sort()).toEqual([...ids].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(`verification/review-v2-a-regression-actions-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-regression-actions-browser.jsonl'),JSON.stringify({project:info.project.name,errors,actions:5,pins:3,historical_fact:'255.00',raw_sources:'original golden',backup_restore:true})+'\n');expect(errors).toEqual([]);
});
test('A2 會議選定方案與交辦固定來源，切檢視保留且明確更新來源才重選',async({page})=>{
 await load(page);await page.getByLabel('通路',{exact:true}).selectOption('DTC');await page.getByRole('button',{name:'情境試算',exact:true}).click();await page.getByRole('button',{name:'建立 DTC 方案工作區',exact:true}).click();await page.getByRole('button',{name:'新增方案',exact:true}).click();const plan=page.getByTestId('scenario-1');
 await plan.getByLabel('方案名稱',{exact:true}).fill('主管會議履約方案');await plan.getByRole('button',{name:'填入零變動假設',exact:true}).click();await plan.getByLabel('單位履約成本變化（相對 %）',{exact:true}).fill('-10');await plan.getByLabel('我接受此方案的全部固定假設',{exact:true}).check();await plan.getByRole('button',{name:'計算方案',exact:true}).click();
 await page.getByRole('button',{name:'通路診斷',exact:true}).click();await page.locator('.diagnostic-card').first().getByRole('button',{name:'建立行動草稿',exact:true}).click();const action=page.getByTestId('action-1');
 for(const [label,value]of Object.entries({負責角色:'營運主管',驗證指標:'履約費用',期限:'2026-10-15',停止條件:'服務品質下降就停止',所需額外資料:'物流報價'}))await action.getByLabel(label,{exact:true}).fill(value);
 await action.getByRole('button',{name:'確認行動與證據',exact:true}).click();await expect(action).toContainText('使用者已確認');
 await page.getByRole('button',{name:'經營總覽',exact:true}).click();await openMeeting(page);const summary=page.getByTestId('manager-summary');const choice=page.getByLabel('DTC 本次摘要所選方案',{exact:true});const selected=await choice.locator('option').filter({hasText:/主管會議履約方案（版本/}).getAttribute('value');expect(selected).toBeTruthy();await choice.selectOption(selected!);
 const markdown=await download(page,'下載主管摘要 Markdown');for(const value of ['284.00','14.00','營運主管','服務品質下降就停止','主管會議履約方案'])expect(markdown).toContain(value);
 await page.getByLabel('通路',{exact:true}).selectOption('MARKETPLACE');await expect(summary).toContainText('主管會議履約方案');
 const retained=await download(page,'下載主管摘要 Markdown');expect(retained.split('## 技術稽核附錄')[0]).toContain('條件貢獻 284.00');
 await page.getByRole('button',{name:'以目前資料與範圍更新會議來源',exact:true}).click();await expect(summary).toContainText('未選擇可沿用的方案');
 const refreshed=await download(page,'下載主管摘要 Markdown');expect(refreshed.split('## 技術稽核附錄')[0]).not.toContain('條件貢獻 284.00');
});


async function confirmedDtcAction(page: Page) {
 await load(page);await page.getByLabel('通路',{exact:true}).selectOption('DTC');
 await page.getByRole('button',{name:'行動摘要',exact:true}).click();await page.getByRole('button',{name:'新增行動',exact:true}).click();
 const card=page.getByTestId('action-1');await card.getByLabel('問題',{exact:true}).fill('核對原始DTC貢獻');
 const select=card.getByLabel('本快照證據（可複選）',{exact:true});
 const id=await select.locator('option').filter({hasText:/2026-08-02–2026-08-02 · 行銷後貢獻 · DTC（通路） · 270\.00/}).getAttribute('value');expect(id).toBeTruthy();
 await select.selectOption(id!);await card.getByRole('button',{name:'確認行動與證據',exact:true}).click();await expect(card).toContainText('使用者已確認原始引用');
 return {card,id:id!};
}

test('A1 檢視切換後仍可管理執行狀態與進度，管理編輯不撤銷引用確認',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);
 await page.getByLabel('通路',{exact:true}).selectOption('MARKETPLACE');
 for(const [label,value] of Object.entries({負責角色:'營運主管',期限:'2026-10-20',具體動作:'請核對已入帳費用'}))await card.getByLabel(label,{exact:true}).fill(value);
 await card.getByLabel('執行狀態',{exact:true}).selectOption('in_progress');
 await card.getByLabel('進度紀錄',{exact:true}).fill('=SUM(1)');
 await expect(card).toContainText('使用者已確認原始引用');
 await page.getByLabel('通路',{exact:true}).selectOption('DTC');
 await expect(card.getByLabel('執行狀態',{exact:true})).toHaveValue('in_progress');
 await expect(card.getByLabel('進度紀錄',{exact:true})).toHaveValue('=SUM(1)');
 const doc=JSON.parse(await download(page,'下載決策 JSON'));
 expect(doc.actions[0]).toMatchObject({execution_status:'in_progress',progress_notes:'=SUM(1)',evidence_confirmed:true,status:'confirmed',fact_ids:[id],binding:{scope:{channels:['DTC']}}});
 expect(doc.actions[0].evidence[0].value).toBe('270.00');expect(doc.actions[0].binding_history).toHaveLength(1);expect(doc.actions[0].binding_history[0].fact_ids).toEqual([]);
 expect(await download(page,'下載決策 CSV')).toContain("'=SUM(1)");
 await page.screenshot({path:resolve(`verification/review-v2-a-action-management-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-management-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',fact_value:'270.00',evidence_confirmed:true,management:'in_progress',errors})+'\n');expect(errors).toEqual([]);
});

test('A1 真換CSV後重新綁定先預覽，取消保留270，再明確確認170與完整歷史',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.name));
 const {card,id}=await confirmedDtcAction(page);const before=JSON.parse(await download(page,'下載決策 JSON'));
 await page.getByRole('button',{name:'匯入標準 CSV',exact:true}).click();const form=page.getByTestId('import-panel');
 const roles={'sales_daily.csv':'商品銷售 CSV','channel_costs_daily.csv':'通路費用 CSV','ad_spend_daily.csv':'廣告支出 CSV'};
 for(const [file,label] of Object.entries(roles)) {
  const csv=await readFile(resolve('fixtures/golden',file),'utf8');
  const replacement=file==='ad_spend_daily.csv'?csv.replace('2026-08-02,DTC,270.00','2026-08-02,DTC,370.00'):csv;
  await form.getByLabel(label,{exact:true}).setInputFiles({name:file,mimeType:'text/csv',buffer:Buffer.from(replacement)});
 }
 await form.getByLabel('讀取 manifest JSON',{exact:true}).setInputFiles(resolve('fixtures/golden/manifest.json'));
 await expect(form.getByLabel('資料集名稱',{exact:true})).not.toHaveValue('');
 await form.getByLabel('我已確認未稅商品金額與費用口徑',{exact:true}).check();
 await form.getByRole('button',{name:'檢核匯入資料',exact:true}).click();await expect(form.getByTestId('import-status')).toHaveText('檢核通過，可套用資料');
 await form.getByRole('button',{name:'套用匯入資料',exact:true}).click();await discardReplacement(page);
 await expect(page.getByTestId('workspace-status')).toContainText('資料已就緒');await expect(form).toHaveCount(0);
 await page.getByRole('button',{name:'行動摘要',exact:true}).click();await expect(card).toContainText('引用舊資料版本');
 await card.getByLabel('執行狀態',{exact:true}).selectOption('blocked');await card.getByLabel('進度紀錄',{exact:true}).fill('等待新版本費用對帳');
 await card.getByRole('button',{name:'預覽重新綁定目前資料',exact:true}).click();const preview=card.getByRole('region',{name:'重新綁定證據預覽',exact:true});
 await expect(preview).toBeVisible();await expect(preview.locator('tbody tr')).toHaveCount(1);await expect(preview.locator('tbody')).toContainText('270.00');await expect(preview.locator('tbody')).toContainText('170.00');
 await preview.getByRole('button',{name:'取消重新綁定',exact:true}).click();await expect(preview).toHaveCount(0);
 const cancelled=JSON.parse(await download(page,'下載決策 JSON'));expect(cancelled.actions[0].binding).toEqual(before.actions[0].binding);expect(cancelled.actions[0].evidence[0].value).toBe('270.00');expect(cancelled.actions[0].binding_history).toEqual(before.actions[0].binding_history);
 await card.getByRole('button',{name:'預覽重新綁定目前資料',exact:true}).click();await expect(preview).toBeVisible();await preview.getByRole('button',{name:'確認改用此資料版本',exact:true}).click();await expect(preview).toHaveCount(0);
 const result=JSON.parse(await download(page,'下載決策 JSON'));const action=result.actions[0];
 expect(action).toMatchObject({execution_status:'blocked',progress_notes:'等待新版本費用對帳',evidence_confirmed:true,binding_revision:before.actions[0].binding_revision+1,fact_ids:[id]});
 expect(action.evidence[0].value).toBe('170.00');expect(action.binding.dataset_hash).not.toBe(before.actions[0].binding.dataset_hash);
 expect(action.binding_history.at(-1).fact_ids).toEqual([id]);expect(action.binding_history.at(-1).evidence[0].value).toBe('270.00');expect(action.binding_history.at(-1).dataset_hash).toBe(before.actions[0].binding.dataset_hash);
 await card.getByText('歷史引用（2 版）',{exact:true}).click();await card.getByRole('button',{name:/^查看歷史證據 ·/}).click();await expect(page.getByRole('dialog').locator('p.number')).toHaveText('NT$ 270.00');await page.keyboard.press('Escape');
 await page.screenshot({path:resolve(`verification/review-v2-a-action-rebind-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/review-v2-a-action-rebind-browser.jsonl'),JSON.stringify({project:info.project.name,status:'passed',cancel_kept_original:true,old_value:'270.00',new_value:'170.00',same_fact_id:true,history_verified:true,errors})+'\n');expect(errors).toEqual([]);
});
