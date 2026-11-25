import {describe,expect,it} from "vitest";
import {testRace} from "../src/engine.ts";
import {answer,tok} from "./helpers.ts";
function infestation(pos:number,roll:number){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[pos,2,4],rolls:[roll],track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[5];q.race.twist.remaining=q.race.twist.remaining.filter((n:number)=>n!==5)};set(s);const q=JSON.parse(s.turn!.snapshot);set(q);s.turn!.snapshot=JSON.stringify(q);return s;}
describe("终点虫潮",()=>{
 it("停在28退至23",()=>{const s=answer(infestation(27,1),"roll");expect(tok(s,"twin").pos).toBe(23)});
 it("停在29退至24",()=>{const s=answer(infestation(27,2),"roll");expect(tok(s,"twin").pos).toBe(24)});
 it("经过28并冲线不回退",()=>{const s=answer(infestation(27,3),"roll");expect(tok(s,"twin").place).toBe(1);expect(s.log.filter(l=>l.text.includes("终点虫潮")).length).toBe(0)});
 it("停在27不触发",()=>{const s=answer(infestation(26,1),"roll");expect(tok(s,"twin").pos).toBe(27)});
});
