import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { chromium } from "playwright";
const PORT=3345, base=`http://127.0.0.1:${PORT}`, data=mkdtempSync(join(tmpdir(),"kbp-"));
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:String(PORT),DBD_DATA_DIR:join(data,"d"),KB_DATA_DIR:join(data,"k")},stdio:"ignore"});
for(let i=0;i<80;i++){try{if((await fetch(base+"/api/health")).ok)break}catch{};await new Promise(r=>setTimeout(r,250))}
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const mk=async()=> (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
const A=await mk(); await A.goto(base+"/?game=kb"); await A.waitForURL(/room=/);
await A.getByTestId("kb-name").fill("小王"); await A.getByTestId("kb-claim").click(); await A.waitForSelector("text=模式");
const B=await mk(); await B.goto(A.url()); await B.getByTestId("kb-name").fill("小李"); await B.getByTestId("kb-claim").click(); await B.waitForSelector("text=模式");
await A.getByTestId("kb-start").click(); for(const p of [A,B]) await p.waitForSelector('[data-testid="kb-pond"]');
const p=(await A.locator(".kb-game.my-turn").count())?A:B; await p.waitForTimeout(1500);
const variants:[string,string][]=[["当前",""],["关全部动画","*{animation:none!important;transition:none!important}"],["关背景模糊",".kb-game::before{display:none!important}"],["关颗粒",":root{--kb-grain:none!important}"],["关color-mix卡框",".kb-card{background:#c90!important}"],["关滤镜阴影",".kb-cimg,.kb-ico,.kb-fly{filter:none!important}"]];
for(const [name,css] of variants){
  await p.evaluate((c)=>{let s=document.getElementById("perfcss");if(!s){s=document.createElement("style");s.id="perfcss";document.head.appendChild(s)}s.textContent=c},css);
  await p.waitForTimeout(400);
  const r=await p.evaluate(`(async()=>{const cards=[...document.querySelectorAll('[data-testid^="kb-card-"]')];const out=[];for(let k=0;k<12;k++){const c=cards[k%cards.length];const t0=performance.now();c.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));out.push(performance.now()-t0);await new Promise(r=>setTimeout(r,120))}out.sort((a,b)=>a-b);return {med:Math.round(out[6]),max:Math.round(out[11])}})()`);
  console.log(name, JSON.stringify(r));
}
await b.close(); sv.kill();
