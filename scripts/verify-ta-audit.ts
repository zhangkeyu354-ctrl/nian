import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { CHARACTERS, createGame, reduce, type Ability, type State } from "../packages/menace/src/index.ts";
import { ABILITIES } from "../apps/web/src/ta/text.ts";
import type { TARoomFile } from "../apps/server/src/ta-rooms.ts";

const directory = mkdtempSync(join(tmpdir(), "menace-browser-"));
const screens = "docs/menace/screens";
mkdirSync(screens, { recursive: true });
const port = "3192";
const base = `http://127.0.0.1:${port}/?game=ta`;
const names = ["甲号船员", "乙号船员", "丙号船员", "丁号船员"];
const players = names.map((name, i) => ({ name, playerId: `p${i}`, token: `audit-${i}` }));
const file = (code: string) => join(directory, code + ".json");
const read = (code: string): TARoomFile => JSON.parse(readFileSync(file(code), "utf8"));
function game(): State {
  let state = createGame(4, 11);
  while (state.phase === "setup") {
    const player = state.players.find(p => !p.character && p.choices.length)!;
    state = reduce(state, { t: "choose", seat: player.seat, name: player.choices[0] });
  }
  state.energy = 10;
  state.oxygen = 18;
  state.players.forEach((p, i) => { p.agenda = i === 3 ? "contagion" : "loyal"; });
  return state;
}
function save(code: string, state: State, bots = false) {
  const room: TARoomFile = { game: "menace", code, createdAt: new Date().toISOString(), stage: "game", hostId: "p0", players: players.map((p,i)=>({...p,bot:bots&&i>0})), mode: "basic", round: 1, seed: 11, lineup: players.map(p=>p.playerId), commands: [], snapshot: state };
  writeFileSync(file(code), JSON.stringify(room));
}
const abilities = [...new Set(Object.values(CHARACTERS).flatMap(c => c.ab))];
const cases = abilities.map((ab, i) => {
  const code = "A" + String(i).padStart(3, "0");
  const state = game();
  state.players[0].character = Object.keys(CHARACTERS).find(c => CHARACTERS[c].ab.includes(ab))!;
  if (ab === "regenerate") state.players[0].wounds = ["flesh"];
  if (ab === "first_aid") state.players[1].wounds = ["flesh", "severed"];
  if (ab === "mimic") state.abilityActors = [{seat:1,ab:"laser_pistol"}];
  if (ab === "surveillance") state.played = [{ seat: 1, card: { id: 900, type: "panic" } }, { seat: 1, card: { id: 901, type: "brawl" } }];
  if (ab === "salvage") state.discard = [{ id: 902, type: "panic" }];
  if (ab === "bloodwork") state.players[0].hand = state.players[0].hand.slice(0,2);
  if (ab === "commandeer" || ab === "formulate" || ab === "equip") state.players[0].hand = state.players[0].hand.slice(0,1);
  save(code,state);
  return {code,ab};
});
const phases = ["action","resolve","accuse","vote","question","over"] as const;
const sizes = [[390,640],[320,568],[360,780],[430,932]];
for (const [size] of sizes.entries()) for (const [i, phase] of phases.entries()) {
  const s = game();
  if (phase === "question") s.stack.push({k:"ask",q:"veto",seat:0,data:{type:"airlock",forced:true}});
  else s.phase = phase;
  if (phase === "resolve") s.queue = [{seat:-1,card:{id:900,type:"raise_morale"}}];
  if (phase === "over") { s.winner="crew"; s.winners=[0,1,2]; }
  save(`P${size}0${i}`,s);
}
const botGame = game();botGame.turn = 1;save("BOTS",botGame,true);
const child = () => spawn(process.execPath, ["--import","tsx","apps/server/src/main.ts"], {
  env: {...process.env, PORT:port, TA_DATA_DIR:directory}, stdio:"ignore"
});
let server = child();
async function ready() {
  for (let i=0;i<80;i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* 等待监听 */ }
    await wait(250);
  }
  throw new Error("测试服务器未启动");
}
const results: Record<string,unknown> = {};
const clicks: string[] = [];
async function click(page: Page, selector: string, index = 0) {
  await page.locator(selector).nth(index).click({timeout:2500});
  clicks.push(selector);
}
await ready();
const browser = await chromium.launch({executablePath:process.env.CH || undefined});
try {
  async function open(page:Page, code:string, seat=0) {
    await page.addInitScript(({code,token})=>localStorage.setItem("ta-seat-"+code,token),{code,token:players[seat].token});
    await page.goto(base+"&room="+code);
    await page.locator(".ta-game").waitFor({timeout:5000});
  }
  async function runAbility(page:Page, ab:Ability) {
    await click(page,`.ta-abs button:has-text("${ABILITIES[ab].name}")`);
    let chosenAbility = ab;
    let seat = 1;
    for(const step of ABILITIES[ab].steps){
      if(step.kind==="seat")await click(page,`.ta-panel:not(.ta-dock) button:text-is("${names[ab==="bloodwork"?0:seat++]}")`);
      if(step.kind==="card")await click(page,".ta-panel:not(.ta-dock) .ta-card");
      if(step.kind==="two"){await click(page,".ta-panel:not(.ta-dock) .ta-card");await click(page,".ta-panel:not(.ta-dock) .ta-card",1);await click(page,'button:text-is("确定 2 张")');}
      if(step.kind==="aside")await click(page,'button:text-is("保留盖放牌")');
      if(step.kind==="used"){chosenAbility="laser_pistol";await click(page,'button:text-is("雷射枪")');await click(page,`.ta-panel:not(.ta-dock) button:text-is("${names[1]}")`);}
    }
    if(ab==="rush")await click(page,'button:text-is("暗置打出")');
    if(ab==="formulate"||ab==="bloodwork")await click(page,".ta-panel.alert .ta-card");
    if(ab==="first_aid")await click(page,'button:text-is("皮肉伤")');
    if(ab==="surveillance")await click(page,'button:text-is("查看第 2 张")');
    if(ab==="salvage")await click(page,'button:text-is("取走 0 张")');
    if(ab==="delegate")await click(page,'button:has-text("已离线，代为操作")');
    for(let i=0;i<80;i++){
      const s=read(new URL(page.url()).searchParams.get("room")!).snapshot!;
      if(s.abilityActors?.some(x=>x.ab===chosenAbility&&x.seat===0)&&!s.stack.some(t=>t.k==="ask"&&t.seat===0))return;
      await wait(100);
    }
    throw new Error("存档未确认能力或本座仍有待回答问题：" + (await page.locator(".ta-err").allTextContents()).join("；"));
  }
  const mobile = await browser.newPage({viewport:{width:390,height:640},reducedMotion:"reduce"});
  for(const {code,ab} of cases){
    clicks.length=0;
    try {await open(mobile,code);await runAbility(mobile,ab);results[ab]={status:"发动与即时问答通过",clicks:[...clicks]};}
    catch(e){results[ab]={status:"失败",clicks:[...clicks],error:String(e).split("\n").slice(0,9).join("\n")};}
  }
  for(const [size,[width,height]] of sizes.entries()){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:"reduce"});
    for(const [i,phase] of phases.entries()){
      try{
        const code=`P${size}0${i}`;
        await open(page,code);
        const screenshot=async(label:string)=> {
          await page.locator(".ta-banner").waitFor({state:"hidden",timeout:3000});
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
          await page.screenshot({path:`${screens}/${width}x${height}-${label}.png`,timeout:5000});
          results[`${width}x${height}-${label}`]={overflow};
        };
        await screenshot(phase);
        if(phase==="action"){
          await click(page,'button:text-is("规则")');
          await click(page,".ta-tabs button",1);
          await screenshot("rules");
          await page.mouse.click(2,2);
          await click(page,".ta-seat",1);
          await screenshot("player");
          await page.mouse.click(2,2);
          await click(page,'button:text-is("身份")');
          await screenshot("identity");
          await page.mouse.click(2,2);
        }
        const command={action:'button:text-is("抽一张牌")',resolve:'button:has-text("揭示下一张")',accuse:'button:text-is("拿起手枪")',vote:'button:text-is("弃权")',question:'button:text-is("否决这张")',over:null}[phase];
        if(command){
          const before=read(code).version!;
          await click(page,command);
          for(let i=0;i<50&&read(code).version===before;i++)await wait(100);
          Object.assign(results[`${width}x${height}-${phase}`] as object,{commandAccepted:read(code).version!>before});
        }
      }catch(e){results[`${width}x${height}-${phase}-error`]=String(e).split("\n")[0];}
    }
    await page.close();
  }
  const network = await browser.newPage({viewport:{width:390,height:640}});
  await open(network,"BOTS");
  const previous=read("BOTS").version!;
  for(let i=0;i<50&&read("BOTS").version===previous;i++)await wait(100);
  results["人机推进"]=read("BOTS").version!>previous;
  await network.reload();await network.locator(".ta-game").waitFor();
  results["刷新重连"]=await network.locator(".ta-seat.me").innerText();
  await network.context().setOffline(true);
  await network.locator(".ta-top .off").waitFor({timeout:10000});
  await network.context().setOffline(false);
  await network.locator(".ta-top .off").waitFor({state:"hidden",timeout:10000});
  results["断线重连"]=true;
  await open(network,"P005");await click(network,'button:text-is("再来一局")');
  await network.locator(".ta-chars").waitFor({timeout:5000});
  results["再来一局"]=read("P005").round===2;
  const beforeRestart=read("BOTS");
  const exited=new Promise(resolve=>server.once("exit",resolve));
  server.kill();await exited;
  server=child();await ready();await open(network,"BOTS");
  results["重启恢复"]=read("BOTS").round===beforeRestart.round&&read("BOTS").version!>beforeRestart.version!;
} finally {
  writeFileSync(join(screens,"audit-results.json"),JSON.stringify(results,null,2));
  await browser.close();
  server.kill();
}
