import {describe,expect,it} from "vitest";
import {testRace} from "../src/engine.ts";
import {answer} from "./helpers.ts";
function cursed(rolls:number[],positions=[0,0,0,0]){const s=testRace({racers:["twin","banana","lovable_loser","hare"],pos:positions,rolls,track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[8]};set(s);const q=JSON.parse(s.turn!.snapshot);set(q);s.turn!.snapshot=JSON.stringify(q);return s;}
describe("人人诅咒魔杖",()=>{
 it("回合末骰2，跳过两个原顺位，轮到第四座",()=>{const s=answer(cursed([1,2]),"roll");expect(s.race!.current).toBe("p4");expect(s.log.some(l=>l.text.includes("诅咒魔杖"))).toBe(true)});
 it("已淘汰座位仍计入跳过格数",()=>{const s=cursed([1,1]);s.race!.tokens[1].out=true;const q=JSON.parse(s.turn!.snapshot);q.race.tokens[1].out=true;s.turn!.snapshot=JSON.stringify(q);const after=answer(s,"roll");expect(after.race!.current).toBe("p3")});
 it("循环越过末座仍找到活跃玩家",()=>{const s=answer(cursed([1,4]),"roll");expect(s.race!.current).toBe("p2")});
 it("日志列出被跳过的原座位，包含已淘汰者",()=>{
   const s=cursed([1,2]);
   s.race!.tokens[1].out=true;
   const q=JSON.parse(s.turn!.snapshot);q.race.tokens[1].out=true;s.turn!.snapshot=JSON.stringify(q);
   const after=answer(s,"roll");
   const entry=after.log.find(l=>l.text.includes("人人诅咒魔杖")&&l.text.includes("跳过后面"));
   expect(entry?.text).toContain("玩家2");
   expect(entry?.text).toContain("玩家3");
 });
});
