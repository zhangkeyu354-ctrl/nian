import {describe,expect,it} from "vitest";
import {createGame,reduce,type State,type WoundType} from "../src/index.ts";
function g(a:string[]=["contagion","loyal","loyal","loyal"]):State{let s=createGame(4,11);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});s=structuredClone(s);s.players.forEach((p,i)=>p.agenda=a[i]);s.oxygen=15;return s}
const ans=(s:State,seat:number,value:any)=>reduce(s,{seat,t:"answer",value});
const res=(s:State,t:any[])=>{s.phase="resolve";s.resStart=s.energy;s.stage="reveal";s.queue=t.map((type,i)=>({seat:-1,card:{id:9000+i,type}}));return s};
const rv=(s:State)=>reduce(s,{seat:s.leader,t:"reveal"});
const end=(s:State)=>{s.phase="accuse";return reduce(s,{seat:s.leader,t:"end_accuse"})};
function hit(s:State,seat:number,w:WoundType){s.woundDeck=[w,...s.woundDeck];s.leader=seat;s=res(s,["backstab"]);return rv(s)}
describe("Agenda",()=>{
 it("典范代受致命伤",()=>{let s=g(["contagion","paragon","loyal","loyal"]);s.players[2].wounds=["flesh"];s.leader=2;s=res(s,["backstab"]);s=rv(s);s=ans(s,1,true);expect(s.players[1].wounds.length).toBe(1);expect(s.players[2].wounds.length).toBe(1);expect(s.players[1].revealed).toBe(true)});
 it("苦行者救氧",()=>{let s=g(["contagion","austere","loyal","loyal"]);s.oxygen=1;s=res(s,["airlock"]);s=rv(s);expect(s.winner).toBe(null);s=ans(s,1,s.players[1].hand[0].id);expect(s.oxygen).toBe(1);expect(s.energy).toBe(1);expect(s.players[1].revealed).toBe(true)});
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
 it("脑震荡手牌上限2",()=>{const s=hit(g(),1,"concussion");expect(s.players[1].hand.length).toBe(2)});
 it("狂乱直接打出牌，持有者也不能查看牌种",()=>{let s=hit(g(),1,"frenzied");expect(s.players[1].hand.length).toBe(0);expect(s.players[1].deck.length).toBe(20);s=structuredClone(s);s.phase="action";s.queue=[];s.turn=0;s.leader=1;const notes=[...s.notes[1]];s=reduce(s,{seat:1,t:"draw"});expect(s.played.length).toBe(1);expect(s.notes[1]).toEqual(notes)});
 it("肺穿孔",()=>{let s=g();s.players[0].wounds=["punctured_lung"];const d=s.players[0].deck.length;s=reduce(s,{seat:0,t:"play",card:s.players[0].hand[0].id});expect(s.players[0].deck.length).toBe(d-2)});
 it("粉碎伤弃五张",()=>{const s=hit(g(),1,"pulverized");expect(s.players[1].deck.length).toBe(12)});
 it("辐射灼伤减一张已出牌",()=>{let s=g();s.players[0].wounds=["radiation_burns"];for(const i of [0,1,2,3])s=reduce(s,{seat:i,t:"play",card:s.players[i].hand[0].id});expect(s.queue.length).toBe(3)});
 it("断肢",()=>{let s=hit(g(),1,"severed");const q:any=s.stack.at(-1);s=ans(s,1,q.data.options[0]);expect(s.players[1].severed).toBe(q.data.options[0])});
 it("精神崩溃",()=>{const s=hit(g(),1,"mental_breakdown");expect(s.players[1].deck.length).toBe(20);expect(s.players[2].deck.length).toBe(16)});
 it("两伤回合末死亡，且牌尽死亡",()=>{let s=g();s.players[1].hand=[];s.players[1].deck=[];s=reduce(s,{seat:0,t:"draw"});expect(s.players[1].killed).toBe(true);expect(s.oxygen).toBe(13)});
 it("离场牌不能再行动",()=>{let s=g();s.players[1].killed=true;s=reduce(s,{seat:0,t:"draw"});expect(s.turn).toBe(2)});
});
