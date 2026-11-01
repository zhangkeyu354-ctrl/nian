// 录制出牌动画逐帧胶片：docs/kariba/motion/
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { chromium, type Page } from "playwright";
const PORT=3344, base=`http://127.0.0.1:${PORT}`, data=mkdtempSync(join(tmpdir(),"kbm-")), out="docs/kariba/motion"; mkdirSync(out,{recursive:true});
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:String(PORT),DBD_DATA_DIR:join(data,"d"),KB_DATA_DIR:join(data,"k")},stdio:"ignore"});
for(let i=0;i<80;i++){try{if((await fetch(base+"/api/health")).ok)break}catch{};await new Promise(r=>setTimeout(r,250))}
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const mk=async()=> (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1})).newPage();
const A=await mk(); await A.goto(base+"/?game=kb"); await A.waitForURL(/room=/);
await A.getByTestId("kb-name").fill("小王"); await A.getByTestId("kb-claim").click(); await A.waitForSelector("text=模式");
const B=await mk(); await B.goto(A.url()); await B.getByTestId("kb-name").fill("小李"); await B.getByTestId("kb-claim").click(); await B.waitForSelector("text=模式");
await A.getByTestId("kb-start").click(); for(const p of [A,B]) await p.waitForSelector('[data-testid="kb-pond"]');
let gotPlay=false, gotChase=false;
for(let t=0;t<40 && !(gotPlay&&gotChase);t++){
  const p=(await A.locator(".kb-game.my-turn").count())?A:(await B.locator(".kb-game.my-turn").count())?B:null;
  if(!p){await A.waitForTimeout(150);t--;continue}
  const ids=await p.locator('[data-testid^="kb-card-"]').evaluateAll(es=>es.map(e=>e.getAttribute("data-testid")!.slice(8)));
  const g=new Map<string,string[]>(); for(const id of ids) g.set(id[1],[...(g.get(id[1])??[]),id]);
  const grp=[...g.values()].sort((a,c)=>c.length-a.length)[0];
  for(const id of grp) await p.getByTestId("kb-card-"+id).click();
  const gain=await p.locator(".kb-chip.gain").count();
  const tag= gain&&!gotChase ? "chase" : !gotPlay ? "play" : "";
  await p.getByTestId("kb-play").click();
  if(tag){
    for(let f=0;f<16;f++){ await p.screenshot({path:`${out}/${tag}-${String(f).padStart(2,"0")}.png`}); await p.waitForTimeout(tag==="chase"?110:70); }
    if(tag==="chase") gotChase=true; else gotPlay=true;
  } else await p.waitForTimeout(1500);
}
console.log("play",gotPlay,"chase",gotChase);
await b.close(); sv.kill();
