import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { chromium } from "playwright";
const PORT=3342, base=`http://127.0.0.1:${PORT}`, data=mkdtempSync(join(tmpdir(),"kbd-"));
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:String(PORT),DBD_DATA_DIR:join(data,"d"),KB_DATA_DIR:join(data,"k")},stdio:"ignore"});
for(let i=0;i<80;i++){try{if((await fetch(base+"/api/health")).ok)break}catch{};await new Promise(r=>setTimeout(r,250))}
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const mk=()=>b.newContext({viewport:{width:390,height:844},hasTouch:false});
const A=await (await mk()).newPage(); await A.goto(base+"/?game=kb"); await A.waitForURL(/room=/);
await A.getByTestId("kb-name").fill("小王"); await A.getByTestId("kb-claim").click(); await A.waitForSelector("text=模式");
const B=await (await mk()).newPage(); await B.goto(A.url()); await B.getByTestId("kb-name").fill("小李"); await B.getByTestId("kb-claim").click(); await B.waitForSelector("text=模式");
await A.getByTestId("kb-start").click(); await A.waitForSelector('[data-testid="kb-pond"]'); await B.waitForSelector('[data-testid="kb-pond"]');
let drags=0, ok=0, shot=0;
for(let t=0;t<60;t++){
  if(await A.getByTestId("kb-final").count()) break;
  const p=(await A.locator(".kb-game.my-turn").count())?A:(await B.locator(".kb-game.my-turn").count())?B:null;
  if(!p){await A.waitForTimeout(200);continue}
  const card=p.locator('[data-testid^="kb-card-"]').first();
  const id=(await card.getAttribute("data-testid"))!.slice(8); const v=id[1];
  const cb=(await card.boundingBox())!, sb=(await p.getByTestId("kb-slot-"+v).boundingBox())!;
  const before=await p.getByTestId("kb-deck").textContent(); const vb=await p.locator('[data-testid="kb-slot-'+v+'"] b').textContent();
  await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2); await p.mouse.down(); await p.waitForTimeout(220);
  await p.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2,{steps:8});
  if(drags===2) await p.screenshot({path:"docs/kariba/ui-v1/drag-hover.png"});
  await p.mouse.up(); drags++;
  await p.waitForTimeout(250);
  const chased = await p.locator(".kb-fly").count();
  if(chased && shot<2){ await p.waitForTimeout(500); await p.screenshot({path:`docs/kariba/ui-v1/fly-${shot++}.png`}); }
  await p.waitForTimeout(900);
  const vb2=await p.locator('[data-testid="kb-slot-'+v+'"] b').textContent();
  if(vb2!==vb || (await p.getByTestId("kb-deck").textContent())!==before) ok++;
}
console.log(`拖拽出牌 ${drags} 次，生效 ${ok} 次，飞行截图 ${shot} 张`);
await b.close(); sv.kill();
