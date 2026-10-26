import {it,expect} from "vitest";
import {createMAGame,reduceMA} from "../src/engine.ts";
import {viewForMA} from "../src/privacy.ts";
import type {MACommand} from "../src/types.ts";

for(const n of [2,3,4,5,6]) it(`新角色混合旧角色：${n}人选秀/随机各3局完整四场`,()=>{
 const seen=new Set<string>();
 for(const deal of ["draft","random"] as const) for(let seed=1;seed<=3;seed++){
  let s=createMAGame({players:Array.from({length:n},(_,i)=>({id:`p${i}`,name:`P${i}`})),seed:seed*713+n,settings:{secondWindPreview:true,deal}});
  let steps=0;
  while(s.phase!=="over"){
   if(++steps>6000)throw new Error(`未结束 ${n}/${deal}/${seed}`);
   let cmd:MACommand;
   if(s.phase==="draft"){const d=s.draft!;cmd={type:"DRAFT",player:d.order[d.step],racer:d.pool.find(id=>id.startsWith("sw_"))??d.pool[0]};}
   else if(s.phase==="choose"){const p=s.players.find(p=>!p.choices.length)!;const left=p.hand.filter(id=>!p.used.includes(id));cmd={type:"CHOOSE",player:p.id,racer:left.find(id=>id.startsWith("sw_"))??left[0]};}
   else {const p=s.pending!;cmd={type:"ANSWER",player:p.player,value:p.options.find(o=>o.value==="no")?.value??p.options.find(o=>o.value==="keep")?.value??p.options[0].value};}
   s=reduceMA(s,cmd);
   for(const t of s.race?.tokens??[]){seen.add(t.racer);expect(s.players.some(p=>p.id===t.owner)).toBe(true);}
   if(s.pending){const other=s.players.find(p=>p.id!==s.pending!.player)!;const v=viewForMA(s,other.id);expect(v.pending?.options).toEqual([]);expect((v as any).rng).toBeUndefined();expect((v as any).turn).toBeUndefined();}
  }
  expect(s.log.filter(l=>l.fx?.kind==="podium")).toHaveLength(4);
  for(const p of s.players)expect(new Set(p.used).size).toBe(4);
 }
 console.log(`SW_SIM_PASS players=${n} games=6 newRolesSeen=${[...seen].filter(id=>id.startsWith("sw_")).join(",")}`);
},60_000);
