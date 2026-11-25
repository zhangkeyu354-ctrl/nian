import {describe,expect,it} from "vitest";
import {testRace} from "../src/engine.ts";
import {answer,tok} from "./helpers.ts";
function fixed(){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[0,5,10],rolls:[6,2,4],track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[6];q.race.twist.fixedDice={p1:2,p2:4,p3:5};q.race.twist.remaining=q.race.twist.remaining.filter((n:number)=>n!==6)};set(s);const q=JSON.parse(s.turn!.snapshot);set(q);s.turn!.snapshot=JSON.stringify(q);return s}
describe("随机性消失：每名玩家自己的固定骰",()=>{
 it("主移动使用本人固定值，不消耗随机骰",()=>{const s=answer(fixed(),"roll");expect(tok(s,"twin").pos).toBe(2);expect(s.race!.lastRoll?.value).toBe(2);expect(s.forcedRolls).toEqual([6,2,4])});
 it("实际抽卡给各玩家分别定骰",()=>{const s=testRace({racers:["twin","banana","lovable_loser"],pos:[13,20,25],rolls:[1,2,3,4],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[6];const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[6];s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(after.race!.twist!.fixedDice).toEqual({p1:2,p2:3,p3:4});expect(after.race!.twist!.drawn).toEqual([6]);});
 it("下一位玩家使用另一固定值",()=>{let s=answer(fixed(),"roll");if(s.pending?.kind!=="main")throw new Error("next main absent");s=answer(s,"roll");expect(tok(s,"banana").pos).toBe(9)});
});
