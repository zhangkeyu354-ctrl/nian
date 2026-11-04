import { describe, it, expect } from "vitest";
import { createGame, reduceMY, viewForMY, plansOf, outcomeOf, State } from "../src/index";
function auto(n:number,seed:number){let s:State=createGame(n,seed);let g=0;while(!s.ending&&g++<500){const a=s.actor;
 if(s.phase==="FORK")s=reduceMY(s,{t:"FORK",seat:a,optionId:s.fork.options[1].id});
 else if(s.phase==="PLAN")s=reduceMY(s,{t:"PLAN",seat:a,planId:plansOf(s)[0].id});
 else if(s.phase==="CONTRIBUTE"){const q=s.players.find(p=>p.seat!==a&&!s.played.some(x=>x.seat===p.seat))!;s=reduceMY(s,{t:"CONTRIBUTE",seat:q.seat,cardId:q.hand[0].id});}
 else if(s.phase==="ROLL")s=reduceMY(s,{t:"ROLL",seat:a,push:true});
 else{const q=s.players.find(p=>!s.passed.includes(p.seat))!;s=reduceMY(s,{t:"PASS",seat:q.seat});}
 expect(s.doom).toBeLessThanOrEqual(8);expect(s.players.every(p=>p.stress<=6&&p.hp>=0)).toBe(true);
 const ids=[...s.deck,...s.discard,...s.players.flatMap(p=>p.hand),...s.played.map(x=>x.card),...s.reveal].map(c=>c.id);expect(new Set(ids).size).toBeLessThanOrEqual(48);}
 return s}
describe("迷雾远征",()=>{
 it("3–8 人都能打到结局",()=>{for(let n=3;n<=8;n++)for(let i=0;i<100;i++)expect(auto(n,i+1).ending).toBeTruthy()});
 it("同种子结果相同",()=>{expect(auto(5,42)).toEqual(auto(5,42))});
 it("判定三档边界",()=>{expect(outcomeOf(14,11)).toBe("完全成功");expect(outcomeOf(13,11)).toBe("代价成功");expect(outcomeOf(11,11)).toBe("代价成功");expect(outcomeOf(10,11)).toBe("失败")});
 it("视图不泄露他人秘密",()=>{const s=createGame(4,9);const v=JSON.stringify(viewForMY(s,0));for(const p of s.players.slice(1)){expect(v).not.toContain(`"oath":"${p.oath}"`);for(const c of p.hand)expect(v).not.toContain(`"${c.id}"`)}});
 it("非主行动者不能选方案",()=>{const s=createGame(4,3);const o=(s.actor+1)%4;expect(()=>reduceMY(s,{t:"PLAN",seat:o,planId:"x"})).toThrow()});
});
