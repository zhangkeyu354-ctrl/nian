import {describe,expect,it} from "vitest";
import {createGame,reduce,viewFor,type State,type WoundType} from "../src/index.ts";
function g(a:string[]=["contagion","loyal","loyal","loyal"]):State{let s=createGame(4,11);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});s=structuredClone(s);s.players.forEach((p,i)=>p.agenda=a[i]);s.oxygen=15;return s}
const ans=(s:State,seat:number,value:any)=>reduce(s,{seat,t:"answer",value});
const res=(s:State,t:any[])=>{s.phase="resolve";s.resStart=s.energy;s.stage="reveal";s.queue=t.map((type,i)=>({seat:-1,card:{id:9000+i,type}}));return s};
const rv=(s:State)=>reduce(s,{seat:s.leader,t:"reveal"});
const end=(s:State)=>{s.phase="accuse";return reduce(s,{seat:s.leader,t:"end_accuse"})};
function hit(s:State,seat:number,w:WoundType){s.woundDeck=[w,...s.woundDeck];s.leader=seat;s=res(s,["backstab"]);return rv(s)}
describe("Agenda",()=>{
 it("典范代受致命伤",()=>{let s=g(["contagion","paragon","loyal","loyal"]);s.players[2].wounds=["flesh"];s.leader=2;s=res(s,["backstab"]);s=rv(s);s=ans(s,1,true);expect(s.players[1].wounds.length).toBe(1);expect(s.players[2].wounds.length).toBe(1);expect(s.players[1].revealed).toBe(true)});
 it("苦行者救氧",()=>{let s=g(["contagion","austere","loyal","loyal"]);s.oxygen=1;s=res(s,["airlock"]);s=rv(s);expect(s.winner).toBe(null);s=ans(s,1,s.players[1].hand[0].id);expect(s.oxygen).toBe(1);expect(s.energy).toBe(1);expect(s.players[1].revealed).toBe(true)});
 it("克难者救氧前身份保密，接受后公开播报且只能触发一次",()=>{
   let s=g(["contagion","austere","loyal","loyal"]);s.oxygen=1;s=res(s,["airlock"]);s=rv(s);
   expect(viewFor(s,0).players[1].agenda).toBeNull();
   expect(viewFor(s,1).question?.q).toBe("austere");
   expect(viewFor(s,0).log.join(" ")).not.toContain("克难者");
   s=ans(s,1,s.players[1].hand[0].id);
   expect(viewFor(s,0).players[1].agenda).toBe("austere");
   expect(viewFor(s,0).log.join(" ")).toContain("克难者弃牌救氧");
   s=res(s,["airlock"]);s=rv(s);
   expect(s.winner).toBe("menace");
 });
 it("圣人每次受伤都公开播报，氧气实际减少",()=>{
   let s=g(["contagion","saint","loyal","loyal"]);s=hit(s,1,"flesh");
   expect(s.oxygen).toBe(13);
   expect(viewFor(s,0).log.join(" ")).toContain("圣人受伤");
   s.flags.backstab=false;s=hit(s,1,"flesh");
   expect(s.oxygen).toBe(11);
   expect(s.log.filter(x=>x.includes("圣人受伤"))).toHaveLength(2);
 });
 it("克难者无手牌或已放逐时不会出现救氧选择",()=>{
   for(const reason of ["hand","exile"]){
     let s=g(["contagion","austere","loyal","loyal"]);s.oxygen=1;
     if(reason==="hand")s.players[1].hand=[];else s.players[1].exiled=true;
     s=rv(res(s,["airlock"]));expect(s.winner,reason).toBe("menace");
   }
 });
 it("苦行者放弃则内鬼胜",()=>{let s=g(["contagion","austere","loyal","loyal"]);s.oxygen=1;s=res(s,["airlock"]);s=rv(s);s=ans(s,1,null);expect(s.winner).toBe("menace")});
 it("传染者死前弃光一人手牌",()=>{let s=g();s.players[0].wounds=["flesh","flesh"];s=end(s);s=ans(s,0,1);expect(s.players[1].hand.length).toBe(0)});
 it("被放逐的传染者死亡不触发",()=>{let s=g();s.players[0].exiled=true;s.players[0].wounds=["flesh","flesh"];s=end(s);expect(s.stack.length).toBe(0)});
 it("屠夫死前伤人",()=>{let s=g(["butcher","loyal","loyal","loyal"]);s.players[0].wounds=["flesh","flesh"];s=end(s);s=ans(s,0,2);expect(s.players[2].wounds.length).toBe(1)});
 it("复仇者死前伤人并扣2氧",()=>{let s=g(["contagion","vengeant","loyal","loyal"]);s.players[1].wounds=["flesh","flesh"];s=end(s);expect(s.oxygen).toBe(13);s=ans(s,1,2);expect(s.players[2].wounds.length).toBe(1)});
 it("鲁莽者死亡加2能",()=>{let s=g(["contagion","reckless","loyal","loyal"]);s.players[1].wounds=["flesh","flesh"];s=end(s);expect(s.energy).toBe(2)});
 it("胆小鬼：内鬼未公开时跟船员，公开后跟内鬼",()=>{let s=createGame(7,3);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});const c=s.players.find(p=>p.agenda==="coward")!.seat;s=structuredClone(s);s.oxygen=1;const t=structuredClone(s);s=res(s,["airlock"]);s=rv(s);while(s.phase!=="over")s=ans(s,(s.stack.at(-1) as any).seat,null);expect(s.winners).not.toContain(c);let u=t;u.players.find(p=>p.agenda==="contagion"||p.agenda==="butcher")!.revealed=true;u=res(u,["airlock"]);u=rv(u);while(u.phase!=="over")u=ans(u,(u.stack.at(-1) as any).seat,null);expect(u.winners).toContain(c)});
});
describe("伤害牌",()=>{
 it("皮肉伤无效果",()=>{const s=hit(g(),1,"flesh");expect(s.players[1].wounds).toEqual(["flesh"])});
 it("脑损伤必须重复",()=>{let s=g();s.players[1].wounds=["brain_damage"];s=reduce(s,{seat:s.leader,t:"draw"});expect(()=>reduce(s,{seat:1,t:"play",card:s.players[1].hand[0].id})).toThrow();s=reduce(s,{seat:1,t:"draw"});expect(s.turn).toBe(2)});
 it("骨折要等别人先出",()=>{let s=g();s.players[0].wounds=["broken_limbs"];expect(()=>reduce(s,{seat:0,t:"play",card:s.players[0].hand[0].id})).toThrow()});
 it("脑震荡取得时随机弃牌，之后超限自行选择",()=>{
   let s=hit(g(),1,"concussion");expect(s.players[1].hand).toHaveLength(2);expect(s.stack).toHaveLength(0);
   s.phase="action";s.leader=1;s.turn=0;
   s=reduce(s,{seat:1,t:"draw"});const id=s.players[1].hand[1].id;
   expect(s.stack.at(-1)).toMatchObject({q:"discard_down",seat:1});
   s=ans(s,1,id);expect(s.players[1].hand).toHaveLength(2);expect(s.discard.some(c=>c.id===id)).toBe(true);
 });
 it("轮末从任务领袖开始处理死亡技能",()=>{
   let s=g(["butcher","loyal","vengeant","loyal"]);s.leader=2;
   s.players[0].wounds=["flesh","flesh"];s.players[2].wounds=["flesh","flesh"];
   s=end(s);expect(s.stack.at(-1)).toMatchObject({q:"vengeant",seat:2});
   s=ans(s,2,null);expect(s.stack.at(-1)).toMatchObject({q:"butcher",seat:0});
 });
 it("第三处伤不再次询问坚定者，死亡仍到轮末",()=>{
   let s=g(["contagion","resolute","loyal","loyal"]);s.players[1].wounds=["flesh","flesh"];
   s=hit(s,1,"flesh");expect(s.players[1].killed).toBe(false);expect(s.stack).toHaveLength(0);
   expect(end(s).players[1].killed).toBe(true);
 });
 it("满能量仍让氧气归零优先，且归零打断死亡技能",()=>{
   let s=g(["contagion","vengeant","loyal","loyal"]);s.energy=20;s.oxygen=2;
   s.players[1].wounds=["flesh","flesh"];s=end(s);
   expect(s.winner).toBe("menace");expect(s.stack).toHaveLength(0);
 });
 it("克难者没有其他存活邻座时达成个人目标",()=>{
   let s=g(["contagion","austere","loyal","loyal"]);s.mode="advanced";s.energy=14;
   for(const seat of [0,2,3])s.players[seat].killed=true;
   s=end(s);expect(s.winner).toBe("crew");expect(s.winners).toContain(1);
 });
 it("非领袖的两张辐射各弃一张，再由艾玛补足",()=>{
   let s=g();s.players[1].wounds=["radiation_burns"];s.players[2].wounds=["radiation_burns","radiation_burns"];
   for(const seat of [0,1,2,3])s=reduce(s,{seat,t:"play",card:s.players[seat].hand[0].id});
   expect(s.discard).toHaveLength(3);expect(s.queue).toHaveLength(2);expect(s.queue.filter(c=>c.seat===-1)).toHaveLength(1);
 });
 it("丧心病狂强制暗置，只有本人能查看牌种",()=>{let s=hit(g(),1,"frenzied");expect(s.players[1].hand).toHaveLength(0);expect(s.players[1].deck).toHaveLength(20);s.phase="action";s.queue=[];s.turn=0;s.leader=1;const top=s.players[1].deck[0];s=reduce(s,{seat:1,t:"draw"});expect(s.played[0].card).toEqual(top);expect(viewFor(s,1).notes.at(-1)).toContain(top.type);expect(viewFor(s,2).notes).toEqual([]);expect(viewFor(s,2).log.join()).not.toContain(top.type)});
 it("肺穿孔",()=>{let s=g();s.players[0].wounds=["punctured_lung"];const d=s.players[0].deck.length;s=reduce(s,{seat:0,t:"play",card:s.players[0].hand[0].id});expect(s.players[0].deck.length).toBe(d-2)});
 it("粉碎伤弃五张",()=>{const s=hit(g(),1,"pulverized");expect(s.players[1].deck.length).toBe(12)});
 it("辐射灼伤减一张已出牌",()=>{let s=g();s.players[0].wounds=["radiation_burns"];for(const i of [0,1,2,3])s=reduce(s,{seat:i,t:"play",card:s.players[i].hand[0].id});expect(s.queue.length).toBe(3)});
 it("断肢",()=>{let s=hit(g(),1,"severed");const q:any=s.stack.at(-1);s=ans(s,1,q.data.options[0]);expect(s.players[1].severed).toBe(q.data.options[0])});
 it("精神崩溃",()=>{const s=hit(g(),1,"mental_breakdown");expect(s.players[1].deck.length).toBe(20);expect(s.players[2].deck.length).toBe(16)});
 it("两伤回合末死亡，且牌尽死亡",()=>{let s=g();s.players[1].hand=[];s.players[1].deck=[];s=reduce(s,{seat:0,t:"draw"});expect(s.players[1].killed).toBe(true);expect(s.oxygen).toBe(13)});
 it("离场牌不能再行动",()=>{let s=g();s.players[1].killed=true;s=reduce(s,{seat:0,t:"draw"});expect(s.turn).toBe(2)});
});
