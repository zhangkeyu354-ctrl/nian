import {describe,expect,it} from "vitest";
import {testRace,reduceMA} from "../src/engine.ts";
import {answer,tok} from "./helpers.ts";
function draw(final=false){const s=testRace({racers:["twin","banana","lovable_loser"],pos:[13,20,25],rolls:[1],track:"twisty-twirl",skipSetup:true});s.race!.twist!.remaining=[13];if(final){s.race!.index=3;s.settings.races=4};const q=JSON.parse(s.turn!.snapshot);q.race.twist.remaining=[13];if(final){q.race.index=3;q.settings.races=4};s.turn!.snapshot=JSON.stringify(q);return answer(s,"roll")}
describe("时之灵跨场资格",()=>{
 it("触发者立即淘汰，登记下一正常场一次且保留能力来源",()=>{const s=draw();expect(tok(s,"twin").out).toBe(true);expect(s.timeImpReturners).toEqual([{racer:"twin",owner:"p1",base:"twin"}]);expect(s.race!.finishers).not.toContain("twin")});
 it("只在下一场加入一次，并消费待参赛记录",()=>{let s=draw();s.phase="choose";s.settings.schedule[1]="mild";s.pending=null;s.turn=null;s.nextFirst="p1";const fresh=["hare","gunk","legs"];for(let i=0;i<3;i++){s.players[i].hand.push(fresh[i]);s.players[i].choices=[]}for(let i=0;i<3;i++)s=reduceMA(s,{type:"CHOOSE",player:`p${i+1}`,racer:fresh[i]});expect(s.race!.index).toBe(1);expect(s.race!.track).toBe("mild");expect(s.race!.tokens.filter(t=>t.racer==="twin")).toHaveLength(1);expect(s.timeImpReturners).toBeUndefined()});
 it("最后正常场只淘汰，不追加第五场",()=>{const s=draw(true);expect(tok(s,"twin").out).toBe(true);expect(s.timeImpReturners??[]).toEqual([]);expect(s.settings.races).toBe(4)});
});
