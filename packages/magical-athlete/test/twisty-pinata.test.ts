import {describe,expect,it} from "vitest";
import {testRace,total} from "../src/engine.ts";
import {answer,tok} from "./helpers.ts";
function draw(){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[13,15,0],rolls:[1],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[7];const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[7];s.turn!.snapshot=JSON.stringify(q);return answer(s,"roll")}
function prepared(pos:number,roll:number){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[pos,0,2],rolls:[roll],track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[7];q.race.twist.chips=[16];q.race.twist.remaining=q.race.twist.remaining.filter((n:number)=>n!==7)};set(s);const q=JSON.parse(s.turn!.snapshot);set(q);s.turn!.snapshot=JSON.stringify(q);return s}
describe("皮纳塔筹码",()=>{
 it("抽卡后在第一弯道之后的空格放置，跳过占用格",()=>{const s=draw();expect(s.race!.twist!.drawn).toEqual([7]);expect(s.race!.twist!.chips).toEqual(Array.from({length:17},(_,i)=>i+13).filter(n=>n!==14&&n!==15))});
 it("停格领一次并从地图移除",()=>{const s=answer(prepared(13,3),"roll");expect(tok(s,"twin").pos).toBe(16);expect(s.race!.twist!.chips).toEqual([]);expect(total(s.players[0].chips)).toBe(1)});
 it("经过筹码但停在下一格不领取",()=>{const s=answer(prepared(13,4),"roll");expect(tok(s,"twin").pos).toBe(17);expect(s.race!.twist!.chips).toEqual([16]);expect(total(s.players[0].chips)).toBe(0)});
});
