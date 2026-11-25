import {describe,expect,it} from "vitest";
import {testRace} from "../src/engine.ts";
import {answer,tok} from "./helpers.ts";
function withBelt(pos:number,roll:number){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[pos,20,25],rolls:[roll],track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[3];q.race.twist.remaining=q.race.twist.remaining.filter((n:number)=>n!==3)};set(s);if(s.turn){const q=JSON.parse(s.turn.snapshot);set(q);s.turn.snapshot=JSON.stringify(q)}return s;}
describe("传送带",()=>{
 it("持续主移动+3而不改骰值",()=>{const s=answer(withBelt(2,2),"roll");expect(tok(s,"twin").pos).toBe(7);expect(s.race!.lastRoll?.value).toBe(2)});
 it("实际抽到时把所有活跃选手传至起点后一格",()=>{const s=testRace({racers:["twin","banana","lovable_loser"],pos:[13,20,25],rolls:[1],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[3];const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[3];s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(after.race!.twist!.drawn).toEqual([3]);expect(after.race!.tokens.map(t=>t.pos)).toEqual([1,1,1]);expect(after.log.filter(l=>l.fx?.kind==="warp").map(l=>l.fx?.kind)).toHaveLength(3)});
 it("全员同时到达时不逐人触发同格停格能力",()=>{const s=testRace({racers:["twin","baba_yaga","banana"],pos:[13,20,25],rolls:[1],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[3];const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[3];s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(after.race!.tokens.map(t=>t.pos)).toEqual([1,1,1]);expect(after.race!.tokens.map(t=>t.tripped)).toEqual([false,false,false])});
 it("传送带与禁跑叠加：骰3变主移动6，先淘汰",()=>{const s=withBelt(2,3);s.race!.twist!.drawn.push(4);const q=JSON.parse(s.turn!.snapshot);q.race.twist.drawn.push(4);s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(tok(after,"twin").out).toBe(true);expect(tok(after,"twin").pos).toBe(2)});
 it("一代赛道同骰值不加3",()=>{const s=testRace({racers:["twin","banana","lovable_loser"],pos:[2,20,25],rolls:[2],track:"mild",skipSetup:true});expect(tok(answer(s,"roll"),"twin").pos).toBe(4)});
});
