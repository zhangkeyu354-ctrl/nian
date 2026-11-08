import {describe,expect,it} from "vitest";
import {createGame,reduce,viewFor,type State,type CardType,type Command} from "../src/index.ts";
function g(n=4):State{let s=createGame(n,11);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});return structuredClone(s)}
/** 让队列只含指定牌，任务领袖逐张揭示 */
function res(s:State,types:CardType[]){s.phase="resolve";s.resStart=s.energy;s.queue=types.map((type,i)=>({seat:-1,card:{id:9000+i,type}}));s.stage="reveal";return s}
const rv=(s:State)=>reduce(s,{seat:s.leader,t:"reveal"});
const ag=(s:State,seat:number,a:string)=>{s.players[seat].agenda=a};
function neutral(s:State){s.players.forEach((p,i)=>p.agenda=i===0?"contagion":"loyal");return s}
describe("行动牌",()=>{
 it("维修扣氧加能",()=>{let s=res(neutral(g()),["basic_repair","advanced_repair"]);const o=s.oxygen;s=rv(s);s=rv(s);expect(s.oxygen).toBe(o-2);expect(s.energy).toBe(3)});
 it("引擎上限五步，氧气照扣",()=>{let s=res(neutral(g()),Array(4).fill("advanced_repair"));const o=s.oxygen;for(let i=0;i<4;i++)s=rv(s);expect(s.energy).toBe(5);expect(s.oxygen).toBe(o-4)});
 it("士气加氧 气闸减氧 爆炸减能",()=>{let s=neutral(g());s.energy=5;s=res(s,["raise_morale","airlock","explosion"]);const o=s.oxygen;s=rv(s);s=rv(s);s=rv(s);expect(s.oxygen).toBe(o);expect(s.energy).toBe(3)});
 it("复制效果不重复付费",()=>{let s=res(neutral(g()),["replicate","basic_repair"]);const o=s.oxygen;s=rv(s);s=rv(s);expect(s.energy).toBe(2);expect(s.oxygen).toBe(o-1)});
 it("复制在最后时延续到下一回合",()=>{let s=res(neutral(g()),["replicate"]);s=rv(s);expect(s.armed).toBe(true)});
 it("背刺每回合首次伤领袖，第二张无效",()=>{let s=res(neutral(g()),["backstab","backstab"]);s=rv(s);s=rv(s);expect(s.players[s.leader].wounds.length).toBe(1)});
 it("复制不能复制背刺",()=>{let s=res(neutral(g()),["replicate","backstab"]);s=rv(s);s=rv(s);expect(s.players[s.leader].wounds.length).toBe(1)});
 it("斗殴由领袖选人",()=>{let s=res(neutral(g()),["brawl"]);s=rv(s);s=reduce(s,{seat:s.leader,t:"answer",value:2});expect(s.players[2].wounds.length).toBe(1)});
 it("反应堆只伤出过牌且未受伤者",()=>{let s=neutral(g());s.playedSeats=[1,2];s.players[2].wounds=["flesh"];s=res(s,["reactor"]);s=rv(s);expect(s.players[1].wounds.length).toBe(1);expect(s.players[2].wounds.length).toBe(1);expect(s.players[3].wounds.length).toBe(0)});
 it("被复制的反应堆不会连伤两次",()=>{let s=neutral(g());s.playedSeats=[1];s=res(s,["replicate","reactor"]);s=rv(s);s=rv(s);expect(s.players[1].wounds.length).toBe(1)});
 it("恐慌每人随机弃一张",()=>{let s=res(neutral(g()),["panic"]);const h=s.players.map(p=>p.hand.length);s=rv(s);s.players.forEach((p,i)=>expect(p.hand.length).toBe(h[i]-1))});
});
describe("胜负与身份",()=>{
 it("氧气归零内鬼胜",()=>{let s=neutral(g());s.oxygen=1;s=res(s,["airlock"]);s=rv(s);expect(s.winner).toBe("menace")});
 it("能量满要到回合末才胜",()=>{let s=neutral(g());s.energy=19;s=res(s,["basic_repair"]);s=rv(s);expect(s.phase).toBe("review");s=reduce(s,{seat:0,t:"force"});s=reduce(s,{seat:s.leader,t:"end_accuse"});expect(s.winner).toBe("crew")});
 it("内鬼全死且越过安全线立即胜",()=>{let s=neutral(g());s.energy=14;s.phase="accuse";s.players[0].wounds=["flesh","flesh"];s=reduce(s,{seat:s.leader,t:"end_accuse"});expect(s.players[0].killed).toBe(true);s=reduce(s,{seat:0,t:"answer",value:null});expect(s.winner).toBe("crew")});
 it("放逐好人-3 内鬼+2 懦夫-2",()=>{for(const [a,d] of [["loyal",-3],["contagion",2],["coward",-2]] as const){let s=neutral(g());ag(s,1,a);s.phase="vote";const o=s.oxygen;for(const q of [0,2,3,1])s=reduce(s,{seat:q,t:"vote",target:q===1?null:1});expect(s.players[1].exiled).toBe(true);expect(s.oxygen).toBe(o+d)}});
 it("平票和弃权多数不放逐",()=>{let s=neutral(g());s.phase="vote";for(const q of [0,1,2,3])s=reduce(s,{seat:q,t:"vote",target:null});expect(s.players.some(p=>p.exiled)).toBe(false)});
 it("被放逐者能出牌不能用技能",()=>{let s=neutral(g());s.players[s.leader].exiled=true;const c=s.players[s.leader];expect(()=>reduce(s,{seat:s.leader,t:"ability",ab:(c.character&&"mimic") as any})).toThrow();s=reduce(s,{seat:s.leader,t:"play",card:c.hand[0].id});expect(s.played.length).toBe(1)});
 it("坚毅者取消致命伤",()=>{let s=neutral(g());ag(s,1,"resolute");s.players[1].wounds=["flesh"];s.playedSeats=[];s.leader=1;s=res(s,["backstab"]);s=rv(s);s=reduce(s,{seat:1,t:"answer",value:true});expect(s.players[1].wounds.length).toBe(1);expect(s.players[1].revealed).toBe(true)});
 it("圣人受伤失2氧",()=>{let s=neutral(g());ag(s,s.leader,"saint");s=res(s,["backstab"]);const o=s.oxygen;s=rv(s);expect(s.oxygen).toBe(o-2)});
 it("进阶：个人目标未达成不算赢",()=>{let s=createGame(4,11,"advanced");s=structuredClone(s);for(let i=0;i<9&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});s.players.forEach((p,i)=>p.agenda=i===0?"contagion":i===1?"resolute":"loyal");s.energy=20;s.phase="accuse";s=reduce(s,{seat:s.leader,t:"end_accuse"});expect(s.winners).toEqual([2,3])});
});
describe("手牌上限",()=>{it("超过四张要弃",()=>{let s=neutral(g());const l=s.leader;const p=s.players[l];p.hand=p.deck.splice(0,4);s=reduce(s,{seat:l,t:"draw"});expect(s.stack.at(-1)).toMatchObject({q:"discard_down"});s=reduce(s,{seat:l,t:"answer",value:s.players[l].hand[0].id});expect(s.players[l].hand.length).toBe(4)})});
describe("回合末能力",()=>{it("胆气与损管",()=>{let s=neutral(g());s.oxygen=10;s.flags.moxie=1;s.flags.woundedRound=true;s.flags.damage=2;s.flags.bad=true;s.phase="accuse";s=reduce(s,{seat:s.leader,t:"end_accuse"});expect(s.oxygen).toBe(13);expect(s.energy).toBe(3)})});

describe("公开记录",()=>{
 it("匿名揭牌记录生效的资源变化，不记录出牌座位或私密内容",()=>{
  let s=neutral(g()); s.notes[1].push("仅本人可见的秘密");
  s=res(s,["basic_repair"]); s.queue[0].seat=1; s=rv(s);
  const log=viewFor(s,0).roundLog;
  expect(log).toContain("揭示：basic_repair");
  expect(log).toContain("氧气 -1");
  expect(log).toContain("能量 +1");
  expect(log.join(" ")).not.toContain("仅本人可见的秘密");
  expect(log.join(" ")).not.toMatch(/座位2.*basic_repair/);
 });
 it("所有玩家投完以前不公开投票统计",()=>{
  let s=neutral(g()); s.phase="vote";
  s=reduce(s,{seat:0,t:"vote",target:1});
  expect(viewFor(s,2).roundLog.join(" ")).not.toContain("投票结果");
  for(const seat of [1,2,3])s=reduce(s,{seat,t:"vote",target:null});
  expect(viewFor(s,2).roundLog.join(" ")).toContain("投票结果");
 });
});

import {waitingFor} from "../src/index.ts";
describe("结算回顾与发言",()=>{
 it("全员确认后才进入讨论",()=>{let s=neutral(g());s=res(s,["raise_morale"]);s=rv(s);expect(s.phase).toBe("review");const w=waitingFor(s);expect(w.length).toBe(4);for(const x of w.slice(0,3))s=reduce(s,{seat:x,t:"confirm"});expect(s.phase).toBe("review");s=reduce(s,{seat:w[3],t:"confirm"});expect(s.phase).toBe("accuse")});
 it("阵亡者不需确认",()=>{let s=neutral(g());s.players[2].killed=true;s=res(s,["raise_morale"]);s=rv(s);expect(waitingFor(s)).not.toContain(2)});
 it("领袖选发言方向并推进",()=>{let s=neutral(g());s.phase="accuse";s.leader=1;s=reduce(s,{seat:1,t:"speak",dir:-1});expect(viewFor(s,0).speakOrder).toEqual([1,0,3,2]);s=reduce(s,{seat:1,t:"next_speaker"});expect(viewFor(s,0).speakIdx).toBe(1);expect(()=>reduce(s,{seat:0,t:"speak",dir:1})).toThrow()});
});
