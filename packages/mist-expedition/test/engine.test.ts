import { describe, it, expect } from "vitest";
import { createGame, reduceMY, viewForMY, plansOf, outcomeOf, validColors, State } from "../src/index.ts";
function auto(n:number,seed:number){let s:State=createGame(n,seed);let g=0;while(!s.ending&&g++<500){const a=s.actor;
 if(s.phase==="FORK")s=reduceMY(s,{t:"FORK",seat:a,optionId:s.fork.options[1].id});
 else if(s.phase==="PLAN")s=reduceMY(s,{t:"PLAN",seat:a,planId:plansOf(s)[0].id});
 else if(s.phase==="CONTRIBUTE"){const q=s.players.find(p=>p.seat!==a&&p.seat!==s.jailed&&!s.played.some(x=>x.seat===p.seat))!;s=reduceMY(s,{t:"CONTRIBUTE",seat:q.seat,cardId:q.hand[0].id});}
 else if(s.phase==="COUNCIL"){const q=s.players.find(p=>!(p.seat in s.votes))!;s=reduceMY(s,{t:"VOTE",seat:q.seat,target:null});}
 else if(s.phase==="ROLL")s=reduceMY(s,{t:"ROLL",seat:a,push:true});
 else{const q=s.players.find(p=>!s.passed.includes(p.seat))!;s=reduceMY(s,{t:"PASS",seat:q.seat});}
 expect(s.doom).toBeLessThanOrEqual(8);expect(s.players.every(p=>p.stress<=6&&p.hp>=0)).toBe(true);
 const ids=[...s.deck,...s.discard,...s.players.flatMap(p=>p.hand),...s.played.map(x=>x.card),...s.reveal].map(c=>c.id);expect(new Set(ids).size).toBeLessThanOrEqual(48);}
 return s}
describe("迷雾远征",()=>{
 it("3–8 人都能打到结局",()=>{for(let n=3;n<=8;n++)for(let i=0;i<100;i++)expect(auto(n,i+1).ending).toBeTruthy()},120000);
 it("同种子结果相同",()=>{expect(auto(5,42)).toEqual(auto(5,42))});
 it("判定三档边界",()=>{expect(outcomeOf(14,11)).toBe("完全成功");expect(outcomeOf(13,11)).toBe("代价成功");expect(outcomeOf(11,11)).toBe("代价成功");expect(outcomeOf(10,11)).toBe("失败")});
 it("视图不泄露他人秘密",()=>{const s=createGame(4,9);const v=JSON.stringify(viewForMY(s,0));for(const p of s.players.slice(1)){expect(v).not.toContain(`"oath":"${p.oath}"`);for(const c of p.hand)expect(v).not.toContain(`"${c.id}"`)}});
 it("职业能力",()=>{let s=createGame(4,5,["warrior","ranger","mage","bard"]);while(s.phase!=="PLAN")s=reduceMY(s,{t:"FORK",seat:s.actor,optionId:s.fork.options[0].id});s=reduceMY(s,{t:"PLAN",seat:s.actor,planId:plansOf(s)[0].id});
  const r=reduceMY(s,{t:"ABILITY",seat:1});expect(r.players[1].peek).toEqual(s.deck[s.deck.length-1]);expect(r.players[1].uses).toBe(1);
  const m=validColors(s);const to=["刚","影","智","言"].find(c=>!m.includes(c))!;const g=reduceMY(s,{t:"ABILITY",seat:2,to});expect(validColors(g)).toContain(to);
  expect(()=>reduceMY(s,{t:"ABILITY",seat:0})).toThrow();});
 it("内奸、搜身、关禁闭、投诚、密信",()=>{let s=createGame(4,11);s={...s,phase:"COUNCIL",clues:2,lastPlays:{1:false},doom:2};s.players=s.players.map((p,i)=>({...p,traitor:i===0}));
  let g=reduceMY(s,{t:"INSPECT",seat:2,target:1});expect(g.inspectResults[2]).toEqual({target:1,effective:false});expect(JSON.stringify(viewForMY(g,3))).not.toContain('"effective":false');expect(()=>reduceMY(g,{t:"INSPECT",seat:3,target:1})).toThrow();
  g=reduceMY(g,{t:"LETTER",seat:0,target:1});g=reduceMY(g,{t:"ANSWER",seat:1,accept:true});expect(g.players[1].recruit).toBe(true);expect(()=>reduceMY(g,{t:"LETTER",seat:0,target:2})).toThrow();
  g=reduceMY(g,{t:"DEFECT",seat:0});expect(g.doom).toBe(1);expect(g.players[0].traitor).toBe(false);
  const d=g.doom;for(let i=0;i<4;i++)g=reduceMY(g,{t:"VOTE",seat:i,target:1});expect(g.jailed).toBe(1);expect(g.doom).toBe(d+1);expect(g.actor).not.toBe(1);
  while(g.phase==="FORK")g=reduceMY(g,{t:"FORK",seat:g.actor,optionId:g.fork.options[0].id});g=reduceMY(g,{t:"PLAN",seat:g.actor,planId:plansOf(g)[0].id});expect(()=>reduceMY(g,{t:"CONTRIBUTE",seat:1,cardId:g.players[1].hand[0].id})).toThrow();});
 it("非主行动者不能选方案",()=>{const s=createGame(4,3);const o=(s.actor+1)%4;expect(()=>reduceMY(s,{t:"PLAN",seat:o,planId:"x"})).toThrow()});
});
