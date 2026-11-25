import {describe,expect,it} from "vitest";
import {testRace} from "../src/engine.ts";
import {answer} from "./helpers.ts";
function cursed(rolls:number[],positions=[0,0,0,0]){const s=testRace({racers:["twin","banana","lovable_loser","hare"],pos:positions,rolls,track:"twisty-twirl",skipSetup:true});const set=(q:any)=>{q.race.twist.triggered=true;q.race.twist.drawn=[8]};set(s);const q=JSON.parse(s.turn!.snapshot);set(q);s.turn!.snapshot=JSON.stringify(q);return s;}
function doubleCursed(rolls:number[]){
  const s=testRace({racers:["twin","banana"],rolls,track:"twisty-twirl",skipSetup:true});
  const prepare=(q:any)=>{
    q.settings.variant="double";
    q.race.firstTurnDone=["p1","p2"];
    q.race.twist.triggered=true;
    q.race.twist.drawn=[8];
    const a={...q.race.tokens[0],racer:"lovable_loser"};
    const b={...q.race.tokens[1],racer:"hare"};
    q.race.tokens=[q.race.tokens[0],a,q.race.tokens[1],b];
  };
  prepare(s);
  const snapshot=JSON.parse(s.turn!.snapshot);prepare(snapshot);s.turn!.snapshot=JSON.stringify(snapshot);
  return s;
}
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
 it("双棋子模式逐名跳过：跳过对手第一名后，只让第二名行动",()=>{
   const s=doubleCursed([1,1,1]);
   const afterFirst=answer(s,"roll");
   expect(afterFirst.pending?.racer).toBe("lovable_loser");
   const afterSecond=answer(afterFirst,"roll");
   expect(afterSecond.race!.current).toBe("p2");
   expect(afterSecond.pending?.racer).toBe("hare");
   expect(afterSecond.log.some(l=>l.text.includes("诅咒魔杖")&&l.text.includes("香蕉"))).toBe(true);
 });
 it("只动第二名后，下次跳过从该参赛顺位继续计数",()=>{
   let s=doubleCursed([1,1,1,1,1]);
   s=answer(s,"roll");
   s=answer(s,"roll");
   expect(s.pending?.racer).toBe("hare");
   s=answer(s,"roll");
   expect(s.race!.current).toBe("p1");
   expect(s.pending?.racer).toBe("lovable_loser");
 });
 it("淘汰的棋子仍占被跳过的参赛顺位",()=>{
   const s=doubleCursed([1,1,1]);
   s.race!.tokens.find(t=>t.racer==="banana")!.out=true;
   const q=JSON.parse(s.turn!.snapshot);q.race.tokens.find((t:any)=>t.racer==="banana").out=true;s.turn!.snapshot=JSON.stringify(q);
   const after=answer(answer(s,"roll"),"roll");
   expect(after.pending?.racer).toBe("hare");
 });
 it("诅咒指定的棋子优先于双人局首次行动的自由选人",()=>{
   const s=doubleCursed([1,1,1]);
   s.race!.firstTurnDone=["p1"];
   const q=JSON.parse(s.turn!.snapshot);q.race.firstTurnDone=["p1"];s.turn!.snapshot=JSON.stringify(q);
   const after=answer(answer(s,"roll"),"roll");
   expect(after.race!.current).toBe("p2");
   expect(after.pending?.kind).not.toBe("order");
   expect(after.pending?.racer).toBe("hare");
 });
});
