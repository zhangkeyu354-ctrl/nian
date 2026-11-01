// 卡里巴湖 UI 审计：多尺寸截图 + 屏幕占比 + 小字检查 + 点击响应 + 动画掉帧
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { chromium, type Page } from "playwright";
const PORT=3343, base=`http://127.0.0.1:${PORT}`, data=mkdtempSync(join(tmpdir(),"kba-")), out="docs/kariba/ui-v2"; mkdirSync(out,{recursive:true});
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:String(PORT),DBD_DATA_DIR:join(data,"d"),KB_DATA_DIR:join(data,"k")},stdio:"ignore"});
for(let i=0;i<80;i++){try{if((await fetch(base+"/api/health")).ok)break}catch{};await new Promise(r=>setTimeout(r,250))}
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const sizes=[{width:360,height:740},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1280,height:800},{width:375,height:667}];
const names=["张三丰十个字的名字","小李","阿明","小红","大刘","七七"];
const pages:Page[]=[];
for(let i=0;i<sizes.length;i++){
  const p=await (await b.newContext({viewport:sizes[i],deviceScaleFactor:2,hasTouch:sizes[i].width<900,isMobile:sizes[i].width<900})).newPage();
  await p.addInitScript(()=>{(window as any).__lt=0;new PerformanceObserver(l=>{for(const e of l.getEntries())(window as any).__lt=Math.max((window as any).__lt,e.duration)}).observe({type:"longtask",buffered:true});});
  await p.goto(i? pages[0].url(): base+"/?game=kb"); if(!i) await p.waitForURL(/room=/);
  await p.getByTestId("kb-name").fill(names[i]); await p.getByTestId("kb-claim").click(); await p.waitForSelector("text=模式");
  pages.push(p);
}
await pages[0].getByTestId("kb-mode-team").click(); await pages[0].waitForTimeout(300);
for(const [i,p] of pages.entries()) await p.screenshot({path:`${out}/lobby-${sizes[i].width}x${sizes[i].height}.png`});
await pages[0].getByTestId("kb-start").click();
for(const p of pages) await p.waitForSelector('[data-testid="kb-pond"]');
const tapLat:number[]=[];
for(let t=0;t<14;t++){
  let p:Page|undefined; for(const q of pages) if(await q.locator(".kb-game.my-turn").count()) p=q;
  if(!p){await pages[0].waitForTimeout(150);t--;continue}
  const ids=await p.locator('[data-testid^="kb-card-"]').evaluateAll(es=>es.map(e=>e.getAttribute("data-testid")!.slice(8)));
  const g=new Map<string,string[]>(); for(const id of ids) g.set(id[1],[...(g.get(id[1])??[]),id]);
  const grp=[...g.values()].sort((a,c)=>c.length-a.length)[0];
  for(const id of grp){ const t0=Date.now(); await p.getByTestId("kb-card-"+id).click(); await p.waitForSelector(`[data-testid="kb-card-${id}"].sel`); tapLat.push(Date.now()-t0); }
  if(t===10) for(const [i,q] of pages.entries()) await q.screenshot({path:`${out}/game-${sizes[i].width}x${sizes[i].height}${q===p?"-myturn":""}.png`});
  await p.getByTestId("kb-play").click(); await p.waitForTimeout(700);
}
// 度量
for(const [i,p] of pages.entries()){
  const m=await p.evaluate(readFileSync("scripts/audit-kb-measure.js","utf8"));
  console.log(`${sizes[i].width}x${sizes[i].height}`,JSON.stringify(m));
}
console.log("选牌响应(ms) 平均",Math.round(tapLat.reduce((a,c)=>a+c,0)/tapLat.length),"最大",Math.max(...tapLat));
await b.close(); sv.kill();
