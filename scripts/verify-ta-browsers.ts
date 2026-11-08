import {chromium} from "playwright";import {spawn} from "node:child_process";
const sv=spawn(process.execPath,["--import","tsx","apps/server/src/main.ts"],{env:{...process.env,PORT:"3191",TA_DATA_DIR:"/tmp/ta-v"},stdio:"ignore"});
process.on("exit",()=>sv.kill());
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));await wait(14000);
const b=await chromium.launch({executablePath:process.env.CH||undefined});const url="http://localhost:3191/?game=ta";const ps=[];const errs:string[]=[];
const N=8;for(let i=0;i<N;i++){const c=await b.newContext({viewport:{width:+(process.env.VW??390),height:+(process.env.VH??844)}});const p=await c.newPage();p.setDefaultTimeout(9000);p.on("pageerror",e=>errs.push(e.message));ps.push(p)}
console.log("start");{const L:any=Object.getPrototypeOf(ps[0].locator("body"));const o=L.click;L.click=function(this:any,opt:any){return o.call(this,{...(opt??{}),timeout:2000}).catch(()=>{})}}
await ps[0].goto(url);console.log("loaded");await ps[0].click("text=创建房间");await ps[0].waitForURL(/room=/);const u=ps[0].url();
for(let i=0;i<N;i++){const p=ps[i];if(i)await p.goto(u);await p.fill("input","玩家"+i);await p.click("text=登舰");await p.waitForSelector("text=需要 4–8 人")}
await ps[0].click("text=开始（8 人）");for(let w=0;w<12;w++){for(const p of ps){
 const sk=p.locator(".ta-sequence-skip");if(await sk.count()){await sk.first().click({timeout:1500}).catch(()=>{});continue}const c=p.locator(".ta-chars .ta-primary");if(await c.count())await c.first().click().catch(()=>{})}await wait(250)}
await ps[0].waitForSelector(".ta-hand");await wait(500);await ps[0].screenshot({path:"/tmp/ta1.png"});
setTimeout(async()=>{for(let i=0;i<ps.length;i++){await ps[i].screenshot({path:`/tmp/dbg${i}.png`}).catch(()=>{});console.log(i,(await ps[i].locator(".ta-main").innerText().catch(()=>"")).slice(0,120).replace(/\n/g," | "))}},150000);
let rounds=0;for(let k=0;k<400&&rounds<6&&!(await ps[0].locator("text=再来一局").count());k++){for(const p of ps){
 if(await p.locator(".ta-zoom").count()){await p.locator(".ta-zoom img").click({force:true}).catch(()=>{})}
 const cf=p.locator("text=确认，进入圆桌讨论");if(await cf.count()){await cf.click().catch(()=>{});await wait(100);continue}
 const rv=p.locator("text=揭示下一张");if(await rv.count()){await rv.click();await wait(1000);await p.screenshot({path:"/tmp/ta_s.png"});await p.screenshot({path:"/tmp/ta_r.png"});continue}
 const vt=p.locator(".ta-panel.alert .ta-grid button").first();if(await p.locator("text=放逐投票").count()&&await vt.count()){await vt.click();await wait(80);continue}
 const ab=p.locator(".ta-abs button:not([disabled])");if(await p.locator("text=选择一项行动").count()&&await ab.count()&&k%3===0){await ab.first().click();await wait(120);for(let g=0;g<4;g++){const x=p.locator(".ta-panel:not(.alert) .ta-grid button, .ta-panel .ta-hand.inline .ta-card").first();const pr=p.locator(".ta-panel .ta-primary").first();if(await pr.count()){await pr.click().catch(()=>{});break}if(await x.count())await x.click().catch(()=>{});await wait(80)}const can=p.locator("text=取消");if(await can.count())await can.click().catch(()=>{});continue}
 if(await p.locator("text=选择一项行动").count()){if(await p.locator("nav.ta-hand .ta-card").count()&&k%2){await p.locator("nav.ta-hand .ta-card").first().click({force:true});const z=p.locator(".ta-zoom .ta-primary");if(await z.count())await z.click();await wait(120);continue}await p.locator("text=抽一张牌").click({timeout:1500}).catch(()=>{});await wait(120);if(await p.locator(".ta-err").count())await p.locator("text=无可行动时跳过").click().catch(()=>{});await wait(80);continue}
 const okb=p.locator(".ta-panel button.ta-danger:not([disabled]), .ta-panel button.ta-primary:not([disabled])").filter({hasText:"确认"});if(await okb.count()){await okb.first().click();await wait(120);continue}
 const pk=p.locator(".ta-panel .ta-pick-hint");if(await pk.count()){await p.locator(".ta-panel .ta-hand.inline .ta-card").first().click();await wait(80);continue}
 const a=p.locator(".ta-panel.alert button");if(await a.count()){await a.first().click();await wait(120);continue}
 const gun=p.locator("text=拿起手枪");if(rounds===1&&await gun.count()){await gun.click();await wait(250);await p.screenshot({path:"/tmp/ta_v.png"});continue}
 const e=p.locator("text=结束本回合");if(await e.count()){await p.screenshot({path:"/tmp/ta2.png"});await e.click();rounds++;await wait(150)}
 const resolve=p;void resolve;}}
if(await ps[0].locator(".ta-end").count()){await wait(8000);await ps[0].screenshot({path:"/tmp/ta_e.png"})}await ps[0].locator(".ta-end").count();await ps[1].reload();await wait(1500);console.log("reload",(await ps[1].locator(".ta-top b").textContent()));console.log("overflow",await ps[0].evaluate(()=>[document.documentElement.scrollWidth,innerWidth,...[...document.querySelectorAll("button")].filter(b=>!b.closest(".ta-card")&&b.getBoundingClientRect().height<44).map(b=>b.textContent)]));console.log("over",await ps[0].locator("text=再来一局").count());console.log("rounds",rounds,"errs",errs);await ps[0].screenshot({path:"/tmp/ta3.png"});await b.close();process.exit(0)
