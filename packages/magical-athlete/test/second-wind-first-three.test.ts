import { describe, expect, it } from "vitest";
import { createMAGame, testRace, reduceMA } from "../src/engine.ts";
import { DRAFTABLE, RACERS, racerName } from "../src/racers.ts";
import { answer, tok } from "./helpers.ts";
const make = (racers: string[], pos: number[], rolls: number[], extra: object = {}) => testRace({ racers, pos, rolls, skipSetup: true, secondWindPreview: true, ...extra });

describe("Second Wind首批：显式开发开关（不在正式房间开放）", () => {
  it("默认仍只招募基础36名，显式开发房间才扩为39名", () => {
    const opts = {players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:77};
    const normal=createMAGame(opts), preview=createMAGame({...opts,settings:{secondWindPreview:true}});
    const all=(s:typeof normal)=>[...s.deck,...(s.draft?.pool??[]),...s.players.flatMap(p=>p.hand)];
    expect(RACERS).toHaveLength(36); expect(DRAFTABLE).toHaveLength(36);
    expect(all(normal)).toHaveLength(36); expect(all(normal).some(id=>id.startsWith("sw_"))).toBe(false);
    expect(all(preview)).toHaveLength(39);
    expect(racerName("sw_icarus")).toBe("伊卡洛斯");
  });
  it("Icarus正常：主移动加3", () => {
    const s=answer(make(["sw_icarus","twin","banana"],[0,20,25],[2]),"roll");
    expect(tok(s,"sw_icarus").pos).toBe(5);
    expect(tok(s,"sw_icarus").out).toBe(false);
  });
  it("Icarus边界：最终6淘汰，不移动，不发冠军积分", () => {
    const s=answer(make(["sw_icarus","twin","banana"],[10,20,25],[6]),"roll");
    expect(tok(s,"sw_icarus").out).toBe(true);
    expect(tok(s,"sw_icarus").pos).toBe(10);
    expect(s.race!.finishers).not.toContain("sw_icarus");
    expect(s.players[0].chips).toEqual([]);
  });
  it("Icarus互动：6重掷成2则存活；旧6不触发跟班", () => {
    let s=answer(make(["sw_icarus","dicemonger","lackey"],[0,20,10],[6,2]),"roll");
    expect(s.pending?.kind).toBe("reroll");
    s=answer(s,"dicemonger");
    expect(tok(s,"sw_icarus").out).toBe(false);
    expect(tok(s,"sw_icarus").pos).toBe(5);
    expect(tok(s,"lackey").pos).toBe(10);
  });
  it("Icarus互动：最终6虽然淘汰本人，其他选手仍收到最终骰触发", () => {
    const s=answer(make(["sw_icarus","lackey","twin"],[0,10,20],[6]),"roll");
    expect(tok(s,"sw_icarus").out).toBe(true);
    expect(tok(s,"lackey").pos).toBe(12);
  });
  it("Overtaker正常：每名前方在场选手加1", () => {
    const s=answer(make(["sw_overtaker","twin","banana"],[0,10,20],[2]),"roll");
    expect(tok(s,"sw_overtaker").pos).toBe(4);
  });
  it("Overtaker边界：同格不算前方", () => {
    const s=answer(make(["sw_overtaker","twin","banana"],[5,5,3],[2]),"roll");
    expect(tok(s,"sw_overtaker").pos).toBe(7);
  });
  it("Overtaker互动：先完成跟班的移动，再计算当前前方人数", () => {
    const s=answer(make(["sw_overtaker","lackey","twin"],[3,2,20],[6]),"roll");
    expect(tok(s,"lackey").pos).toBe(4);
    expect(tok(s,"sw_overtaker").pos).toBe(11);
  });
  it("Overtaker互动：箭头额外移动不重复获得主移动加成", () => {
    const s=answer(make(["sw_overtaker","twin","banana"],[3,20,25],[2],{track:"wild"}),"roll");
    expect(tok(s,"sw_overtaker").pos).toBe(10);
  });
  it("Kingtripper正常：回合开始可选领先者绊倒，再进行主移动", () => {
    let s=make(["sw_kingtripper","twin","banana"],[0,10,5],[2]);
    expect(s.pending?.kind).toBe("kingtripper");
    s=answer(s,"twin");
    expect(tok(s,"twin").tripped).toBe(true);
    expect(s.pending?.kind).toBe("main");
  });
  it("Kingtripper边界：可放弃；并列领先只能选其中一人", () => {
    const s=make(["sw_kingtripper","twin","banana"],[0,10,10],[2]);
    expect(s.pending?.options.map(o=>o.value).sort()).toEqual(["banana","no","twin"]);
    const skipped=answer(s,"no"); expect(tok(skipped,"twin").tripped).toBe(false);
    const chosen=answer(s,"banana"); expect(tok(chosen,"banana").tripped).toBe(true); expect(tok(chosen,"twin").tripped).toBe(false);
  });
  it("Kingtripper互动：自己已摔倒，仍可发动回合开始能力，然后只起身", () => {
    let s=make(["sw_kingtripper","twin","banana"],[0,10,5],[2],{tripped:[true,false,false]});
    s=answer(s,"twin");
    expect(s.pending?.kind).toBe("standup");
    s=answer(s,"ok");
    expect(tok(s,"sw_kingtripper").pos).toBe(0);
    expect(tok(s,"twin").tripped).toBe(true);
  });
  it("Kingtripper暂停后的选择只接受控制者，非法目标被拒", () => {
    const s=make(["sw_kingtripper","twin","banana"],[0,10,5],[2]);
    expect(()=>reduceMA(s,{type:"ANSWER",player:"p2",value:"twin"})).toThrow();
    expect(()=>answer(s,"banana")).toThrow();
    expect(answer(JSON.parse(JSON.stringify(s)),"twin").pending?.kind).toBe("main");
  });
  it("开发开关关闭时拒绝强行注入新角色；未实现角色不会当作空能力运行", () => {
    expect(()=>testRace({racers:["sw_icarus","twin","banana"],skipSetup:true})).toThrow("开发预览未开启");
    expect(()=>make(["sw_kraken","twin","banana"],[0,5,10],[2])).toThrow("尚未实现");
  });
  it("Icarus摔倒回合不掷骰，不因预设6淘汰", () => {
    const s=answer(make(["sw_icarus","twin","banana"],[0,10,20],[6],{tripped:[true,false,false]}),"ok");
    expect(tok(s,"sw_icarus").out).toBe(false);
    expect(tok(s,"sw_icarus").pos).toBe(0);
  });
  it("Overtaker不把淘汰者和已冲线者计入前方人数", () => {
    const s=make(["sw_overtaker","twin","banana"],[0,10,20],[2]);
    const snapshot=JSON.parse(s.turn!.snapshot);
    snapshot.race.tokens.find((t:any)=>t.racer==="twin").out=true;
    snapshot.race.tokens.find((t:any)=>t.racer==="banana").place=1;
    snapshot.race.finishers=["banana"];
    s.turn!.snapshot=JSON.stringify(snapshot);
    expect(tok(answer(s,"roll"),"sw_overtaker").pos).toBe(2);
  });
  it("Kingtripper按卡文可选择自己，绊倒后只起身，不额外掷骰", () => {
    let s=make(["sw_kingtripper","twin","banana"],[10,0,5],[2]);
    expect(s.pending?.options.map(o=>o.value)).toEqual(["sw_kingtripper","no"]);
    s=answer(s,"sw_kingtripper");
    expect(s.pending?.kind).toBe("standup");
    expect(tok(s,"sw_kingtripper").tripped).toBe(true);
  });
  it("Kingtripper互动：触发后挪挪走1，暂停恢复不会重复触发", () => {
    const s=answer(make(["sw_kingtripper","scoocher","twin"],[0,3,10],[2]),"twin");
    expect(tok(s,"scoocher").pos).toBe(4);
    const next=answer(JSON.parse(JSON.stringify(s)),"roll");
    expect(tok(next,"scoocher").pos).toBe(4);
  });
  it("Copycat可以复制开发预览Icarus；淘汰fx仍指向实际技能", () => {
    const s=answer(make(["copycat","sw_icarus","twin"],[0,20,10],[6]),"roll");
    expect(tok(s,"copycat").out).toBe(true);
    expect(s.log.some(l=>l.fx?.kind==="power" && l.fx.racer==="copycat" && l.fx.power==="sw_icarus")).toBe(true);
  });
});
