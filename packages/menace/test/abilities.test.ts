import {describe,expect,it} from "vitest";
import {createGame,reduce,type State,type Ability} from "../src/index.ts";
import {ABILITIES,RULES} from "../../../apps/web/src/ta/text.ts";
function g(ch:string):State{let s=createGame(4,11);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});s=structuredClone(s);s.players.forEach((p,i)=>p.agenda=i===3?"contagion":"loyal");s.players[0].character=ch;s.energy=5;s.oxygen=15;return s}
const use=(s:State,ab:Ability,args:any={})=>reduce(s,{seat:0,t:"ability",ab,args});
const ans=(s:State,seat:number,value:any)=>reduce(s,{seat,t:"answer",value});
const toResolve=(s:State,seat=-1)=>{s.phase="resolve";s.resStart=s.energy;s.stage="reveal";return s};
const q=(s:State,t:any[])=>{s.queue=t.map((type,i)=>({seat:-1,card:{id:9000+i,type}}));return toResolve(s)};
const rv=(s:State)=>reduce(s,{seat:s.leader,t:"reveal"});
describe("角色能力",()=>{
 it("规则页和能力说明使用裁定后的用词",()=>{
   expect(ABILITIES.equip.name).toBe("整装备战");
   expect(ABILITIES.rewind.text).toContain("结算结束时");
   expect(JSON.stringify(RULES)).toContain("胜利条件以身份卡面为准");
 });
 it("耗尽氧气的维修不再提高能量",()=>{
   const s=q(g("rotti"),["basic_repair"]);s.oxygen=1;s.energy=19;
   const out=rv(s);expect(out.winner).toBe("menace");expect(out.energy).toBe(19);
 });
 it("打捞作业允许不取牌，也允许取两张",()=>{
   const s=g("shnn");s.discard=s.players[0].deck.splice(0,2);
   const pending=use(s,"salvage",{discard:s.players[0].hand[0].id});
   expect(ans(pending,0,[]).discard).toHaveLength(3);
   expect(ans(pending,0,s.discard.map(c=>c.id)).players[0].hand).toHaveLength(4);
 });
 it("血检",()=>{let s=use(g("rotti"),"bloodwork",{target:1});expect(s.oxygen).toBe(14);s=ans(s,1,s.players[1].hand[0].id);expect(s.log.at(-1)).toMatch(/公开手牌/)});
 it("急救",()=>{let s=g("rotti");s.players[1].wounds=["flesh"];s=use(s,"first_aid",{target:1});expect(s.oxygen).toBe(13);expect(s.players[1].wounds).toEqual([])});
 it("移除骨折后恢复被封锁的能力",()=>{
   const s=g("rotti");s.players[1].wounds=["severed"];s.players[1].severed="veto";
   expect(use(s,"first_aid",{target:1}).players[1].severed).toBeNull();
 });
 it("反应炉外泄触发损害控管",()=>{
   let s=use(g("ruggine"),"damage_control");s=rv(q(s,["reactor"]));
   s=reduce(s,{seat:s.leader,t:"end_accuse"});
   expect(s.energy).toBe(7);
 });
 it("否决取消费用效果",()=>{let s=g("malumil");s=use(s,"veto",{discard:s.players[0].hand[0].id});s=q(s,["airlock","basic_repair"]);const o=s.oxygen;s=rv(s);s=ans(s,0,true);expect(s.oxygen).toBe(o);s=rv(s);expect(s.oxygen).toBe(o-1)});
 it("否决最后一张必须用",()=>{let s=g("malumil");s=use(s,"veto",{discard:s.players[0].hand[0].id});s=q(s,["airlock"]);s=rv(s);expect(()=>ans(s,0,false)).toThrow()});
 it("伪造否决回答不能绕过最后一张的强制取消",()=>{
   let s=g("malumil");s=use(s,"veto",{discard:s.players[0].hand[0].id});s=rv(q(s,["airlock"]));
   for(const value of [null,0,"false",[]]) expect(()=>ans(s,0,value)).toThrow("BAD");
   expect(ans(s,0,true).oxygen).toBe(s.oxygen);
 });
 it("激光手枪",()=>{let s=use(g("gurg"),"laser_pistol",{target:1});expect(s.energy).toBe(3);expect(s.players[1].wounds.length).toBe(1)});
 it("激光手枪不能打自己",()=>{expect(()=>use(g("gurg"),"laser_pistol",{target:0})).toThrow()});
 it("委派",()=>{let s=use(g("andrew"),"delegate",{target:2});expect(s.sub).toEqual([2]);s=reduce(s,{seat:2,t:"play",card:s.players[2].hand[0].id});expect(s.sub).toEqual([]);expect(s.turn).toBe(1)});
 it("委派目标不能抽牌",()=>{let s=use(g("andrew"),"delegate",{target:2});expect(()=>reduce(s,{seat:2,t:"draw"})).toThrow()});
 it("征用",()=>{let s=use(g("andrew"),"commandeer",{target:1});expect(s.players[0].hand.length).toBe(4);expect(s.players[1].deck.length).toBe(16)});
 it("回收",()=>{let s=g("shnn");s.discard=[{id:1,type:"brawl"},{id:2,type:"panic"}];s=use(s,"salvage",{discard:s.players[0].hand[0].id});s=ans(s,0,[1,2]);expect(s.players[0].hand.map(c=>c.id)).toContain(2)});
 it("压榨",()=>{let s=use(g("dekka"),"crunch",{target:1});while(s.stack.length)s=ans(s,1,s.players[1].hand[0].id);expect(s.players[1].wounds.length).toBe(1);expect(s.players[1].hand.length).toBe(4)});
 it("压榨不能选受伤者",()=>{let s=g("dekka");s.players[1].wounds=["flesh"];expect(()=>use(s,"crunch",{target:1})).toThrow()});
 it("谋划打出四张得2氧",()=>{let s=g("dekka");s.players[0].aside=s.players[0].deck.splice(0,3);const ids=s.players[0].aside.map(c=>c.id);const a=s.players[0].hand[0].id;s=use(s,"strategize",{aside:a,play:[...ids,a]});expect(s.oxygen).toBe(17);expect(s.played.length).toBe(4)});
 it("运筹帷幄必须先盖一张，并只能全部打出或全部保留",()=>{
   const s=g("dekka");s.players[0].aside=s.players[0].deck.splice(0,1);
   const aside=s.players[0].hand[0].id;
   expect(()=>use(s,"strategize",{})).toThrow();
   expect(()=>use(s,"strategize",{aside,play:[aside]})).toThrow("NOT_ASIDE");
   expect(use(s,"strategize",{aside,play:[]}).players[0].aside).toHaveLength(2);
 });
 it("今日特餐",()=>{let s=g("tove");const c=s.players[0].hand[0].id;s=use(s,"todays_special",{target:1,card:c});expect(s.players[1].hand.some(x=>x.id===c)).toBe(true);expect(s.players[0].hand.length).toBe(4)});
 it("援手免费用",()=>{let s=g("aerril");s=use(s,"helping_hand");s.players[1].character="gurg";s=reduce(s,{seat:1,t:"ability",ab:"laser_pistol",args:{target:2}});s=ans(s,0,true);expect(s.energy).toBe(5);expect(s.players[2].wounds.length).toBe(1)});
 it("模仿只接受其他座位的来源，并支付费用",()=>{let s=g("beepo");s.abilityActors=[{ab:"laser_pistol",seat:0}];expect(()=>use(s,"mimic",{ab:"laser_pistol",target:1})).toThrow();s.abilityActors.push({ab:"laser_pistol",seat:3});s=use(s,"mimic",{ab:"laser_pistol",target:1});expect(s.energy).toBe(3);expect(s.players[1].wounds.length).toBe(1)});
 it("模仿不能复制未发生的能力",()=>{expect(()=>use(g("beepo"),"mimic",{ab:"laser_pistol",target:1})).toThrow()});
 it("偏转",()=>{let s=g("moe");s=use(s,"deflect");s=q(s,["backstab"]);s=rv(s);s=ans(s,0,2);expect(s.players[2].wounds.length).toBe(1);expect(s.players[s.leader].wounds.length).toBe(0)});
 it("再生",()=>{let s=g("moe");s.players[0].wounds=["flesh"];s=use(s,"regenerate");expect(s.players[0].wounds).toEqual([])});
 it("回放",()=>{let s=g("beepo");s=use(s,"rewind");s=q(s,["basic_repair"]);s=rv(s);const n=s.players[0].hand.length;s=ans(s,0,9000);expect(s.players[0].hand.length).toBe(n+1)});
 it("高效",()=>{let s=g("sigmund");s=use(s,"efficiency",{cards:s.players[0].hand.slice(0,2).map(c=>c.id)});expect(s.played.length).toBe(2)});
 it("请求效率拒绝零张、一张和重复牌号",()=>{
   const s=g("sigmund"), id=s.players[0].hand[0].id;
   for(const cards of [[],[id],[id,id]])expect(()=>use(s,"efficiency",{cards})).toThrow();
 });
 it("推演",()=>{let s=g("sigmund");s=use(s,"formulate");const c=s.players[0].hand[0];s=ans(s,0,c.id);expect(s.players[0].deck.at(-1)!.id).toBe(c.id)});
 it("系统刷新",()=>{let s=use(g("rhea"),"system_refresh",{target:1});expect(s.players[1].hand.length).toBe(4)});
 it("同步",()=>{let s=use(g("cecilia"),"synchronize",{a:1,b:2});expect(s.players[1].hand.length).toBe(4);expect(s.players[2].hand.length).toBe(4)});
 it("监控只进私密记录",()=>{let s=g("cecilia");s.played=[{seat:1,card:{id:5,type:"panic"}}];s=use(s,"surveillance",{target:1});expect(s.notes[0].at(-1)).toMatch(/panic/);expect(s.notes[1]).toEqual([])});
 it("封锁",()=>{let s=g("prillig");s=use(s,"lockdown");s.players[1].wounds=["flesh"];s=q(s,[]);s.leader=1;s=q(s,["backstab"]);s=rv(s);expect(s.players[1].wounds.length).toBe(1)});
 it("封锁时受伤者不能出牌",()=>{let s=g("prillig");s=use(s,"lockdown");s.leader=0;s.turn=1;s.players[1].wounds=["flesh"];expect(()=>reduce(s,{seat:1,t:"play",card:s.players[1].hand[0].id})).toThrow()});
 it("装备",()=>{let s=g("azi");s=use(s,"equip",{discard:s.players[0].hand[0].id});expect(s.players[0].hand.length).toBe(4)});
 it("补给",()=>{let s=use(g("azi"),"resupply",{target:1});expect(s.stack.at(-1)).toMatchObject({q:"discard_down"});s=ans(s,1,s.players[1].hand[0].id);expect(s.players[1].hand.length).toBe(4)});
 it("矫健身手先私下检视，再打出",()=>{const before=g("iza");let s=use(before,"rush");expect(s.played).toHaveLength(0);expect(s.stack.at(-1)).toMatchObject({q:"rush",seat:0,data:{type:before.players[0].deck[0].type}});s=ans(s,0,true);expect(s.played).toHaveLength(1)});
 it("治疗拒绝无伤目标并由发动者选伤",()=>{
   const s=g("rotti");expect(()=>use(s,"first_aid",{target:1})).toThrow();
   expect(()=>use(g("moe"),"regenerate")).toThrow();
   s.players[1].wounds=["flesh","severed"];
   const pending=use(s,"first_aid",{target:1});
   expect(()=>ans(pending,1,0)).toThrow("NO_QUESTION");
   expect(ans(pending,0,0).players[1].wounds).toEqual(["severed"]);
 });
 it("请求效率不足两张时不可发动，且锁定阻止能力出牌",()=>{
   const s=g("sigmund");s.players[0].hand=s.players[0].hand.slice(0,1);
   expect(()=>use(s,"efficiency",{cards:[]})).toThrow("BAD_ABILITY");
   const t=g("sigmund");t.flags.lockdown=true;t.players[0].wounds=["flesh"];
   expect(()=>use(t,"efficiency",{cards:t.players[0].hand.slice(0,2).map(c=>c.id)})).toThrow("BAD_ABILITY");
 });
 it("安全检查的多张选择不公开未选择的牌",()=>{
   const s=g("cecilia");s.played=[{seat:1,card:{id:900,type:"panic"}},{seat:1,card:{id:901,type:"brawl"}}];
   const pending=use(s,"surveillance",{target:1});
   expect(pending.stack.at(-1)).toMatchObject({seat:0,data:{target:1,count:2}});
   const out=ans(pending,0,1);
   expect(out.notes[0].at(-1)).toContain("brawl");expect(out.notes[1]).toEqual([]);
 });
 it("强制征收拒绝空牌库并走狂乱及肺部穿刺",()=>{
   const s=g("andrew");s.players[1].deck=[];expect(()=>use(s,"commandeer",{target:1})).toThrow("EMPTY");
   const t=g("andrew");t.players[0].wounds=["frenzied","punctured_lung"];
   const top=t.players[1].deck[0];const count=t.players[0].deck.length;
   const out=use(t,"commandeer",{target:1});
   expect(out.played[0].card).toEqual(top);expect(out.players[0].deck).toHaveLength(count-2);
 });
 it("无合法行动的被委任者直接跳过",()=>{
   const s=g("andrew");s.players[1].exiled=true;s.players[1].hand=[];
   const out=use(s,"delegate",{target:1});expect(out.sub).toEqual([]);expect(out.turn).toBe(1);
 });
 it("热情帮手也询问仅弃牌的能力且不免弃牌",()=>{
   let s=use(g("aerril"),"helping_hand");s.players[1].character="azi";
   const id=s.players[1].hand[0].id;
   s=reduce(s,{seat:1,t:"ability",ab:"equip",args:{discard:id}});
   expect(s.stack.at(-1)).toMatchObject({q:"assist",seat:0});
   s=ans(s,0,true);expect(s.discard.some(c=>c.id===id)).toBe(true);
 });
 it("否决优先守卫且保留首次及复制",()=>{
   let s=use(g("malumil"),"veto",{discard:g("malumil").players[0].hand[0].id});
   s.flags.guard=2;s.armed=true;s=q(s,["backstab","backstab"]);
   s=rv(s);expect(s.stack.at(-1)).toMatchObject({q:"veto"});s=ans(s,0,true);
   expect(s.flags.guard).toBe(2);expect(s.flags.backstab).toBeUndefined();expect(s.armed).toBe(true);
   s=rv(s);expect(s.flags.guard).toBeUndefined();expect(s.players[s.leader].wounds).toEqual([]);
 });
 it("重组",()=>{let s=g("iza");s=use(s,"restructure");for(let i=1;i<4;i++)s=reduce(s,{seat:i,t:"draw"});expect(s.stack.at(-1)).toMatchObject({q:"restructure"});const id=s.queue[0].card.id,h=s.players[0].hand[0];s=ans(s,0,{out:id,in:h.id});expect(s.queue[0].card.id).toBe(h.id)});
 it("损管无视上限",()=>{let s=use(g("ruggine"),"damage_control");s.flags.bad=true;s.phase="accuse";s=reduce(s,{seat:s.leader,t:"end_accuse"});expect(s.energy).toBe(7)});
 it("护卫",()=>{let s=g("gurg");s=use(s,"guard");s=q(s,["backstab"]);s=rv(s);expect(s.players[s.leader].wounds.length).toBe(0)});
 it("每回合一次",()=>{let s=g("gurg");s=use(s,"guard");s.turn=0;s.sub=[];expect(()=>use(s,"guard")).toThrow()});
});
import {autoMove,waitingFor} from "../src/index.ts";
it("离线代操作能打完整局",()=>{let s=createGame(8,7);for(let i=0;i<5000&&s.phase!=="over";i++)s=autoMove(s,waitingFor(s)[0]);expect(s.phase).toBe("over")});
