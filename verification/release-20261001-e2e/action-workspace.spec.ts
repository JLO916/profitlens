import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
async function load(page:Page){await page.goto('/');await page.getByRole('button',{name:'進階驗證',exact:true}).click();await page.getByLabel('資料集',{exact:true}).selectOption('golden');await page.getByRole('button',{name:'載入資料集',exact:true}).click();await expect(page.getByTestId('manager-summary')).toBeVisible();}
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
 await page.getByLabel('通路',{exact:true}).selectOption('MARKETPLACE');await expect(first).toContainText('已過期');
 await first.getByRole('button',{name:/^查看證據 ·.*2026-08-02.*行銷後貢獻/}).first().click();
 await expect(page.getByRole('dialog')).toContainText('歷史證據');await expect(page.getByRole('dialog').locator('p.number')).toHaveText('NT$ 255.00');await expect(page.getByRole('dialog')).toContainText('DTC、MARKETPLACE');await page.keyboard.press('Escape');
 for(let n=2;n<=5;n++)await page.getByRole('button',{name:'新增行動',exact:true}).click();
 for(let n=1;n<=3;n++)await page.getByTestId(`action-${n}`).getByRole('button',{name:'置頂行動',exact:true}).click();
 await page.getByTestId('action-4').getByRole('button',{name:'置頂行動',exact:true}).click();await expect(page.getByTestId('action-notice')).toContainText('最多置頂三項');
 doc=JSON.parse(await download(page,'下載決策 JSON'));expect(doc.actions).toHaveLength(5);expect(doc.actions.filter((a:{pinned:boolean})=>a.pinned)).toHaveLength(3);expect(doc.actions[0].status).toBe('stale');expect(doc.actions[4].binding.scope.channels).toEqual(['MARKETPLACE']);
 const storage=page.getByTestId('workspace-storage');await storage.locator(':scope > summary').click();
 const backup=await download(page,'下載完整工作區備份');await page.reload();await storage.locator(':scope > summary').click();
 await storage.getByLabel('選取工作區備份 JSON',{exact:true}).setInputFiles({name:'bound.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await expect(page.getByRole('region',{name:'工作區恢復預覽'})).toContainText('行動 5 項');await page.getByRole('button',{name:'套用備份並取代工作區',exact:true}).click();
 await page.getByRole('button',{name:'行動摘要',exact:true}).click();await expect(page.getByTestId('action-5')).toBeVisible();await expect(first).toContainText('歷史證據');
 expect((await first.getByLabel('本快照證據（可複選）',{exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).sort()).toEqual([...ids].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(`verification/release-20261001-regression-actions-${info.project.name}.png`),fullPage:true});
 await appendFile(resolve('verification/release-20261001-regression-actions-browser.jsonl'),JSON.stringify({project:info.project.name,errors,actions:5,pins:3,historical_fact:'255.00',raw_sources:'original golden',backup_restore:true})+'\n');expect(errors).toEqual([]);
});
test('PL09 主管摘要實際帶入選定方案、行動與停止條件，改範圍後不沿用',async({page})=>{
 await load(page);await page.getByLabel('通路',{exact:true}).selectOption('DTC');await page.getByRole('button',{name:'情境試算',exact:true}).click();await page.getByRole('button',{name:'新增方案',exact:true}).click();const plan=page.getByTestId('scenario-1');
 await plan.getByLabel('方案名稱',{exact:true}).fill('主管會議履約方案');await plan.getByRole('button',{name:'填入零變動假設',exact:true}).click();await plan.getByLabel('單位履約成本變化（相對 %）',{exact:true}).fill('-10');await plan.getByLabel('我接受此方案的全部固定假設',{exact:true}).check();await plan.getByRole('button',{name:'計算方案',exact:true}).click();
 await page.getByRole('button',{name:'通路診斷',exact:true}).click();await page.locator('.diagnostic-card').first().getByRole('button',{name:'建立行動草稿',exact:true}).click();const action=page.getByTestId('action-1');
 for(const [label,value]of Object.entries({負責角色:'營運主管',驗證指標:'履約費用',期限:'2026-10-15',停止條件:'服務品質下降就停止',所需額外資料:'物流報價'}))await action.getByLabel(label,{exact:true}).fill(value);
 await action.getByRole('button',{name:'確認行動與證據',exact:true}).click();await expect(action).toContainText('使用者已確認');
 await page.getByRole('button',{name:'經營總覽',exact:true}).click();const summary=page.getByTestId('manager-summary');await summary.getByLabel('本次摘要所選方案',{exact:true}).selectOption({label:'主管會議履約方案（DTC · 2026-08-02～2026-08-02）'});
 const markdown=await download(page,'下載主管摘要 Markdown');for(const value of ['284.00','14.00','營運主管','服務品質下降就停止','主管會議履約方案'])expect(markdown).toContain(value);
 await page.getByLabel('通路',{exact:true}).selectOption('MARKETPLACE');await expect(summary).toContainText('未選擇可沿用的方案');await expect(summary).toContainText('過期／歷史證據');
 const stale=await download(page,'下載主管摘要 Markdown');expect(stale.split('## 技術稽核附錄')[0]).not.toContain('條件貢獻 284.00');
});
