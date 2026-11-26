import { describe,expect,it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer,tok } from "./helpers.ts";
function prepared(pos:number,roll:number,roles=["twin","banana","lovable_loser"]){
 const s=testRace({racers:roles,pos:[pos,20,25],rolls:[roll],track:"twisty-twirl",skipSetup:true});
 const activate=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[4];q.race.twist.remaining=q.race.twist.remaining.filter((n:number)=>n!==4)};
 activate(s);if(s.turn){const q=JSON.parse(s.turn.snapshot);activate(q);s.turn.snapshot=JSON.stringify(q)}
 return s;
}
describe("禁跑水潭只拦截最终主移动",()=>{
 it("5格合法",()=>{const s=answer(prepared(0,5),"roll");expect(tok(s,"twin").pos).toBe(5);expect(tok(s,"twin").out).toBe(false)});
 it("6格淘汰且不产生移动",()=>{const s=answer(prepared(0,6),"roll");expect(tok(s,"twin").out).toBe(true);expect(tok(s,"twin").pos).toBe(0);expect(s.log.some(l=>l.fx?.kind==="move"&&l.fx.racers.includes("twin"))).toBe(false)});
 it("主移动加成之后达到6也淘汰",()=>{const s=answer(prepared(0,5,["hare","banana","lovable_loser"]),"roll");expect(tok(s,"hare").out).toBe(true);expect(tok(s,"hare").pos).toBe(0)});
 it("实际跨界抽到禁跑后，本次5格不追溯淘汰",()=>{const s=testRace({racers:["twin","banana","lovable_loser"],pos:[13,20,25],rolls:[5],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[4];const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[4];s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(after.race!.twist!.drawn).toEqual([4]);expect(tok(after,"twin").pos).toBe(18);expect(tok(after,"twin").out).toBe(false)});
 it("未开启二代地图的一代赛道原本6格合法",()=>{const s=testRace({racers:["twin","banana","lovable_loser"],pos:[0,20,25],rolls:[6],track:"mild",skipSetup:true});const after=answer(s,"roll");expect(tok(after,"twin").pos).toBe(6);expect(tok(after,"twin").out).toBe(false)});
});
