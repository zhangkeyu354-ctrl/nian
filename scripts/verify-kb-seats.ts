// 选座验证：8 人组队，部分人选座、房主随机、换座、被占拒绝；开局后座位顺序与队伍与选座一致
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium, type Page } from "playwright";
const PORT=3346, base=`http://127.0.0.1:${PORT}`, data=mkdtempSync(join(tmpdir(),"kbs-")), out="docs/kariba/seats"; mkdirSync(out,{recursive:true});
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:String(PORT),DBD_DATA_DIR:join(data,"d"),KB_DATA_DIR:join(data,"k")},stdio:"ignore"});
for(let i=0;i<80;i++){try{if((await fetch(base+"/api/health")).ok)break}catch{};await new Promise(r=>setTimeout(r,250))}
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const names=["房主","小李","阿明","小红","大刘","七七","老八","小九"];
const pages:Page[]=[];
try{
for(let i=0;i<8;i++){
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  await p.goto(i?pages[0].url():base+"/?game=kb"); if(!i) await p.waitForURL(/room=/);
  await p.getByTestId("kb-name").fill(names[i]); await p.getByTestId("kb-claim").click(); await p.waitForSelector('[data-testid="kb-table"]');
  pages.push(p);
}
await pages[0].getByTestId("kb-mode-team").click();
await pages[7].waitForSelector('[data-testid="kb-seat-7"]');
// 6 人选座（倒序坐），2 人不选
const want=[7,6,5,4,3,2];
for(let i=0;i<6;i++){ await pages[i].getByTestId("kb-seat-"+want[i]).click(); await pages[i].waitForSelector(`[data-testid="kb-seat-${want[i]}"].me`); }
// 被占的座位按钮不可点
assert(await pages[6].getByTestId("kb-seat-7").isDisabled(),"已被占的座位应不可点");
// 换座：小李从 6 换到 0，再站起来再坐回 6
await pages[1].getByTestId("kb-seat-0").click(); await pages[1].waitForSelector('[data-testid="kb-seat-0"].me');
assert(!(await pages[1].getByTestId("kb-seat-6").isDisabled()),"换座后旧座位应空出");
await pages[1].getByTestId("kb-seat-0").click(); await pages[1].waitForSelector('[data-testid="kb-seat-0"].free');
await pages[1].getByTestId("kb-seat-6").click(); await pages[1].waitForSelector('[data-testid="kb-seat-6"].me');
await pages[0].waitForTimeout(300);
await pages[0].screenshot({path:`${out}/lobby-team8-390.png`});
await pages[0].getByTestId("kb-start").click();
for(const p of pages) await p.waitForSelector('[data-testid="kb-pond"]');
const order=await pages[0].locator('[data-testid="kb-seats"] li').evaluateAll(es=>es.map(e=>({name:e.querySelector(".kb-name")!.textContent,team:e.querySelector(".kb-team")?.textContent})));
for(let i=0;i<6;i++) assert.equal(order[want[i]].name,names[i],`${names[i]} 应在 ${want[i]+1} 号座`);
assert.deepEqual(new Set([order[0].name,order[1].name]),new Set([names[6],names[7]]),"没选座的人应补到空位 1、2 号");
for(let i=0;i<8;i++) assert.equal(order[i].team,"ABCD"[i%4],`${i+1} 号座应是 ${"ABCD"[i%4]} 队`);
console.log("开局座位：",order.map((o,i)=>`${i+1}${o.team}${o.name}`).join(" "));
// 再来一局前，房主随机
console.log("verify-kb-seats：全部通过");
}catch(e){console.error("失败：",e);process.exitCode=1}
finally{await b.close(); sv.kill();}
