import {chromium} from "playwright";import {spawn} from "node:child_process";
const sv=spawn("npx",["tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:"3191",TA_DATA_DIR:"/tmp/ta-v"},stdio:"ignore"});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));await wait(6000);
const b=await chromium.launch({executablePath:process.env.CH||undefined});const url="http://localhost:3191/?game=ta";const ps=[];const errs:string[]=[];
for(let i=0;i<4;i++){const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();p.on("pageerror",e=>errs.push(e.message));ps.push(p)}
await ps[0].goto(url);await ps[0].click("text=创建房间");await ps[0].waitForURL(/room=/);const u=ps[0].url();
for(let i=0;i<4;i++){const p=ps[i];if(i)await p.goto(u);await p.fill("input","玩家"+i);await p.click("text=登舰");await p.waitForSelector("text=需要 4–8 人")}
await ps[0].click("text=开始（4 人）");for(const p of ps){await p.click(".ta-chars .ta-primary")}
await ps[0].waitForSelector(".ta-hand");await wait(500);await ps[0].screenshot({path:"/tmp/ta1.png"});
let rounds=0;for(let k=0;k<400&&rounds<3;k++){for(const p of ps){
 if(await p.locator(".ta-zoom").count()){await p.locator(".ta-zoom img").click({force:true}).catch(()=>{})}
 if(await p.locator("text=选择一项行动").count()){await p.locator("nav.ta-hand .ta-card").first().click();await p.locator(".ta-zoom .ta-primary").click();await wait(120);continue}
 const a=p.locator(".ta-panel.alert button");if(await a.count()){await a.first().click();await wait(120);continue}
 const e=p.locator("text=结束本回合");if(await e.count()){await p.screenshot({path:"/tmp/ta2.png"});await e.click();rounds++;await wait(150)}
 const resolve=p;void resolve;}}
await ps[1].reload();await wait(1500);console.log("reload",(await ps[1].locator(".ta-top b").textContent()));console.log("rounds",rounds,"errs",errs);await ps[0].screenshot({path:"/tmp/ta3.png"});await b.close();sv.kill();process.exit(0)
