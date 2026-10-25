import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExperimentalQueueStore } from "../experimental/queue-store.ts";
import type { QueueHandler } from "../experimental/event-queue.ts";
type Model = { points: number; owner: string };
const handlers: Record<string, QueueHandler<Model>> = {
  choice: (m,e,a) => a ? {model:{...m,points:m.points+Number(a)}} : {model:m,decision:{id:"pick",eventId:e.id,racerId:"r1",options:["1","2"]}},
  transfer: m => ({model:{...m,owner:"p2"}}),
};
const controller = (m: Model) => m.owner;
const dir = () => mkdtempSync(join(tmpdir(), "ma-research-queue-"));
const choice = {id:"e",kind:"choice",payload:{},causeId:null};
const answer = {type:"ANSWER" as const,id:"a",expectedVersion:1,decisionId:"pick",value:"2"};
const store = (path: string) => new ExperimentalQueueStore<Model>(path,handlers,controller);

describe("隔离队列持久化适配（不接正式房间）", () => {
  it("暂停状态在新store实例中恢复；处理成功后重试不会重复加分", () => {
    const path=dir(), first=store(path);
    first.create("room",{points:0,owner:"p1"},[choice]);
    first.pump("room",{id:"pump",expectedVersion:0});
    const second=store(path);
    expect(second.view("room","p1").pending?.options).toEqual(["1","2"]);
    second.answer("room","p1",answer);
    const third=store(path);
    expect(third.answer("room","p1",answer).version).toBe(2);
    expect(third.readPrivate("room").model.points).toBe(2);
  });
  it("只接受认证身份与选择，拒绝客户端自报玩家、积分、骰值或PUMP", () => {
    const path=dir(), s=store(path);
    s.create("room",{points:0,owner:"p1"},[choice]);
    s.pump("room",{id:"pump",expectedVersion:0});
    for(const extra of [{player:"p1"},{points:100},{roll:6},{type:"PUMP"}]) expect(()=>s.answer("room","p1",{...answer,...extra})).toThrow("BAD_REQUEST");
    expect(()=>s.answer("room",null,answer)).toThrow("NOT_SEATED");
    expect(()=>s.answer("room","p2",answer)).toThrow("NOT_CONTROLLER");
    expect(s.readPrivate("room").version).toBe(1);
  });
  it("保存失败时不返回成功，不改变已持久化模型；之后可恢复同一请求", () => {
    const path=dir(), s=store(path);
    s.create("room",{points:0,owner:"p1"},[choice]);
    s.pump("room",{id:"pump",expectedVersion:0});
    s.create("bad",{points:0,owner:"p1"},[choice]);
    s.pump("bad",{id:"pump",expectedVersion:0});
    mkdirSync(join(path,"bad.json.tmp"));
    expect(()=>s.answer("bad","p1",answer)).toThrow();
    expect(store(path).readPrivate("bad").model.points).toBe(0);
    expect(store(path).readPrivate("bad").version).toBe(1);
    rmdirSync(join(path,"bad.json.tmp"));
    expect(store(path).answer("bad","p1",answer).version).toBe(2);
    expect(store(path).readPrivate("bad").model.points).toBe(2);
  });
  it("控制权变化后重新加载，只有新控制者能回答，视图隐藏其他人的选项", () => {
    const path=dir(), s=store(path);
    s.create("room",{points:0,owner:"p1"},[{id:"swap",kind:"transfer",payload:{},causeId:null},choice]);
    s.pump("room",{id:"pump",expectedVersion:0});
    const restored=store(path);
    expect(restored.view("room","p1").pending?.options).toEqual([]);
    expect(()=>restored.answer("room","p1",answer)).toThrow("NOT_CONTROLLER");
    expect(restored.answer("room","p2",answer).status).toBe("idle");
    expect(restored.readPrivate("room").model).toEqual({points:2,owner:"p2"});
  });
  it("禁止路径逃逸和覆盖已存在房间", () => {
    const s=store(dir());
    expect(()=>s.create("../outside",{points:0,owner:"p1"},[])).toThrow("BAD_ROOM_ID");
    s.create("room",{points:0,owner:"p1"},[]);
    expect(()=>s.create("room",{points:100,owner:"p1"},[])).toThrow("ALREADY_EXISTS");
  });
  it("保存并恢复600个有限事件的进度，分批让出CPU不会丢失游标", () => {
    const path=dir();
    const h: Record<string,QueueHandler<Model>>={ point: m=>({model:{...m,points:m.points+1}}) };
    const open=()=>new ExperimentalQueueStore<Model>(path,h,controller);
    open().create("room",{points:0,owner:"p1"},Array.from({length:600},(_,i)=>({id:`e${i}`,kind:"point",payload:{},causeId:null})));
    for(let i=0;i<3;i++) open().pump("room",{id:`p${i}`,expectedVersion:i});
    expect(open().readPrivate("room").model.points).toBe(600);
    expect(open().readPrivate("room").completed).toHaveLength(600);
  });
});
