// Current content review only; no engine, server or production changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const text=read('packages/naodong-scale/data/cards.zh.json');
const bank=JSON.parse(text),status=json('docs/naodong-scale/CONTENT_STATUS.json');
const archive='docs/naodong-scale/'+status.feedback_archive;
const feedback=json(archive+'/user-review.json'),before=json(archive+'/reviewed-bank.json'),oldStatus=json(archive+'/reviewed-status.json');
const changes=json(archive+'/APPLIED_CHANGES.json');
const kept=feedback.reviews.filter(r=>r.decision==='keep'),removed=feedback.reviews.filter(r=>r.decision==='remove');
const pending=feedback.reviews.filter(r=>r.decision==='revise');
const checks=[];
function check(name,run){run();checks.push(name);}
check('feedback version and complete unique IDs match the archived reviewed bank',()=>{
 assert.equal(feedback.bankVersion,oldStatus.review_bank_version);
 assert.equal(new Set(feedback.reviews.map(r=>r.id)).size,before.length);
 assert.deepEqual([...feedback.reviews.map(r=>r.id)].sort(),before.map(r=>r.id).sort());
});
check('only user keeps and revised candidates remain; no automatic backfill',()=>{
 assert.equal(bank.length,kept.length+pending.length);
 assert.equal(bank.length,status.total_questions);
 for(const r of removed)assert.ok(!bank.some(c=>c.id===r.id));
 for(const r of kept)assert.deepEqual(bank.find(c=>c.id===r.id),before.find(c=>c.id===r.id));
});
check('the revised question follows the note and preserves its scale',()=>{
 assert.equal(changes.length,pending.length);
 for(const c of changes){
  const r=bank.find(r=>r.id===c.id),old=before.find(r=>r.id===c.id);
  assert.equal(r.localized.text,c.after);assert.equal(c.user_note,pending.find(r=>r.id===c.id).note);
  assert.equal(r.localized.low,old.localized.low);assert.equal(r.localized.high,old.localized.high);
  assert.match(r.localized.text,/每天随机有五分钟/);
 }
});
check('current counts, origin and short endpoints remain valid',()=>{
 assert.equal(new Set(bank.map(c=>c.id)).size,bank.length);
 assert.equal(bank.filter(c=>c.spicy).length,status.spicy_drafts);
 for(const c of bank){assert.equal(c.status,'DRAFT');assert.ok(['ORIGINAL','USER_PROVIDED'].includes(c.source.kind));assert.ok(!('editing_note' in c));assert.ok(c.localized.low.length<=10&&c.localized.high.length<=10);}
 assert.equal(status.runtime_integrated,false);assert.equal(status.next_stage_authorized,false);
});
check('content hash version matches the actual bank',()=>assert.equal(status.review_bank_version,'nd-reviewed-v3-'+createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex').slice(0,16)));
const output=resolve(root,'docs/naodong-scale/review/evidence');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PW_CHROME||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[];
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const url=pathToFileURL(resolve(root,'docs/naodong-scale/review/index.html')).href;
 await page.goto(url);await page.locator('article').waitFor();
 assert.equal(await page.locator('article').count(),pending.length);
 assert.equal(await page.locator('article').first().getAttribute('data-id'),pending[0].id);
 checks.push('mobile page defaults to the one revised question needing confirmation');
 assert.deepEqual(await page.locator('#bank-data').evaluate(e=>JSON.parse(e.textContent)),bank);
 const seed=await page.locator('#review-seed').evaluate(e=>JSON.parse(e.textContent));
 assert.equal(Object.values(seed).filter(r=>r.decision==='keep').length,kept.length);
 checks.push('embedded bank and carried user decisions match the current files');
 await page.selectOption('#decision','keep');assert.equal(await page.locator('article').count(),kept.length);
 await page.selectOption('#decision','');assert.equal(await page.locator('article').count(),bank.length);
 checks.push('kept and all-question filters show correct counts');
 for(const type of Object.keys(status.type_counts)){
  await page.selectOption('#group',type);assert.equal(await page.locator('article').count(),status.type_counts[type]);
  await page.selectOption('#spicy','spicy');assert.equal(await page.locator('article').count(),status.type_spicy_counts[type]);
  await page.selectOption('#spicy','');
 }
 checks.push('type and spicy filters still combine correctly after deletions');
 await page.selectOption('#group','');await page.fill('#search','每天随机有五分钟');assert.equal(await page.locator('article').count(),1);
 await page.fill('#search','');assert.equal(await page.locator('article details').count(),0);
 checks.push('revised wording is searchable and authoring commentary is absent');
 await page.selectOption('#decision','pending');
 await page.locator('article').getByRole('button',{name:'保留',exact:true}).click();
 await page.reload();await page.selectOption('#decision','keep');assert.equal(await page.locator('article').count(),bank.length);
 checks.push('confirming the revision persists through reload');
 const waiting=page.waitForEvent('download');await page.click('#export');const download=await waiting;
 const exportedPath=resolve(output,'review-export.json');await download.saveAs(exportedPath);
 const exported=JSON.parse(readFileSync(exportedPath,'utf8'));assert.equal(exported.reviews.length,bank.length);assert.equal(exported.bankVersion,status.review_bank_version);
 checks.push('export has the new version and selected question IDs only');
 const upload=data=>({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.setInputFiles('#file',upload({...exported,bankVersion:feedback.bankVersion}));
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('不是当前题库版本'));
 assert.equal(await page.locator('article[data-decision=keep]').count(),bank.length);
 checks.push('stale full-bank imports cannot overwrite selected-bank decisions');
 await page.setInputFiles('#file',upload({...exported,reviews:[{id:removed[0].id,decision:'keep',note:''}]}));
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('未知编号'));
 assert.equal(await page.locator('article[data-decision=keep]').count(),bank.length);
 checks.push('deleted IDs are rejected on import without changing decisions');
 await page.setInputFiles('#file',upload({...exported,reviews:Object.entries(seed).map(([id,r])=>({id,...r}))}));
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已导入当前版本'));
 await page.selectOption('#decision','pending');assert.equal(await page.locator('article').count(),pending.length);
 checks.push('valid same-version import restores the review state');
 for(const [width,height] of [[390,844],[844,390],[1280,800]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,`review-${width}x${height}.png`),fullPage:false});
  checks.push(`no horizontal overflow at ${width}x${height}`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('article').first().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'review-card-390x844.png')});
 await ctx.close();
 const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));
 const p=await blocked.newPage();await p.goto(url);await p.locator('article').waitFor();await p.locator('article').getByRole('button',{name:'保留',exact:true}).click();
 assert.match(await p.locator('#message').textContent(),/请导出/);await blocked.close();checks.push('storage restrictions still allow review and warn to export');
 assert.deepEqual(errors,[]);checks.push('no page script errors');
 const report={date:new Date().toISOString(),passed:checks.length,failed:0,checks,totalQuestions:bank.length,userKept:kept.length,revisedPending:pending.length,removed:removed.length,spicy:status.spicy_drafts,nextStageAuthorized:false};
 writeFileSync(resolve(output,'VALIDATION.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
