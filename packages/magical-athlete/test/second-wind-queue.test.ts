import { describe, expect, it } from "vitest";
import { advanceQueue, createQueue, queuePublicView, type QueueEvent, type QueueHandler } from "../experimental/event-queue.ts";

const event = (id: string, kind: string): QueueEvent => ({ id, kind, payload: {}, causeId: null });
const model = () => ({ points: 0, owner: "p1" });
type Model = ReturnType<typeof model>;
const controller = (m: Model, _racer: string) => m.owner;
const handlers: Record<string, QueueHandler<Model>> = {
  choose: (m, e, answer) => answer
    ? { model: { ...m, points: m.points + Number(answer) } }
    : { model: { ...m, points: 999 }, decision: { id: `${e.id}:choice`, eventId: e.id, racerId: "r1", options: ["1", "2"] } },
  point: m => ({ model: { ...m, points: m.points + 1 } }),
};
const pump = (id = "pump", expectedVersion = 0) => ({ id, expectedVersion, type: "PUMP" as const });
const reply = (id = "answer", player = "p1", decisionId = "a:choice", expectedVersion = 1) => ({ id, expectedVersion, type: "ANSWER" as const, player, decisionId, value: "2" });

describe("Second Wind 独立事件队列原型（未接正式游戏）", () => {
  it("遇到决定暂停，不提交临时效果；序列化恢复后继续，后续事件恰好执行一次", () => {
    const original = createQueue(model(), [event("a", "choose"), event("b", "point")]);
    const paused = advanceQueue(original, pump(), handlers, controller);
    expect(original.version).toBe(0);
    expect(paused.model.points).toBe(0);
    expect(paused.pending?.id).toBe("a:choice");
    const resumed = advanceQueue(JSON.parse(JSON.stringify(paused)), reply(), handlers, controller);
    expect(resumed.model.points).toBe(3);
    expect(resumed.completed).toEqual(["a", "b"]);
    expect(resumed.queue).toEqual([]);
  });
  it("同一请求重试不重做，复用请求ID发送不同内容被拒", () => {
    const s = advanceQueue(createQueue(model(), [event("a", "choose")]), pump(), handlers, controller);
    const done = advanceQueue(s, reply(), handlers, controller);
    expect(advanceQueue(done, reply(), handlers, controller)).toEqual(done);
    expect(() => advanceQueue(done, { ...reply(), value: "1" }, handlers, controller)).toThrow("REQUEST_ID_CONFLICT");
  });
  it("凭旧版本、错误决定ID、错误玩家或非法选项无法回答", () => {
    const s = advanceQueue(createQueue(model(), [event("a", "choose")]), pump(), handlers, controller);
    expect(() => advanceQueue(s, reply("x", "p1", "a:choice", 0), handlers, controller)).toThrow("STALE");
    expect(() => advanceQueue(s, reply("x", "p1", "old"), handlers, controller)).toThrow("WRONG_DECISION");
    expect(() => advanceQueue(s, reply("x", "p2"), handlers, controller)).toThrow("NOT_CONTROLLER");
    expect(() => advanceQueue(s, { ...reply(), value: "100" }, handlers, controller)).toThrow("BAD_OPTION");
  });
  it("决定所属玩家按角色当前控制权检查，不信任旧玩家绑定", () => {
    const s = advanceQueue(createQueue({ points: 0, owner: "p2" }, [event("a", "choose")]), pump(), handlers, controller);
    expect(() => advanceQueue(s, reply(), handlers, controller)).toThrow("NOT_CONTROLLER");
    expect(advanceQueue(s, reply("x", "p2"), handlers, controller).model.points).toBe(2);
  });
  it("只向当前控制者投影选项，旁观者收不到模型、队列、答案或收据", () => {
    const s = advanceQueue(createQueue(model(), [event("a", "choose")]), pump(), handlers, controller);
    expect(queuePublicView(s, "p2", controller)).toEqual({ version: 1, status: "waiting", pending: { id: "a:choice", racerId: "r1", options: [] } });
    expect(queuePublicView(s, "p1", controller).pending?.options).toEqual(["1", "2"]);
    expect(queuePublicView(s, null, controller).pending?.options).toEqual([]);
  });
  it("错误处理回滚整次请求，不留下半次积分或收据", () => {
    const s = createQueue(model(), [event("a", "point"), event("b", "missing")]);
    expect(() => advanceQueue(s, pump(), handlers, controller)).toThrow("UNKNOWN_EVENT");
    expect(s.model.points).toBe(0);
    expect(s.completed).toEqual([]);
    expect(s.receipts).toEqual({});
  });
  it("有限长连锁分批恢复，不因执行预算误判成无限循环", () => {
    let s = createQueue(model(), Array.from({ length: 600 }, (_, i) => event(`e${i}`, "point")));
    for (let i = 0; i < 3; i++) s = advanceQueue(s, pump(`pump${i}`, i), handlers, controller);
    expect(s.model.points).toBe(600);
    expect(s.completed).toHaveLength(600);
  });
  it("保留因果ID，重复事件ID被拒绝，新增事件在兄弟事件前完成", () => {
    const h: Record<string, QueueHandler<Model>> = { ...handlers, root: m => ({ model: m, followUps: [{ ...event("child", "point"), causeId: "root" }] }) };
    const s = advanceQueue(createQueue(model(), [event("root", "root"), event("next", "point")]), pump(), h, controller);
    expect(s.completed).toEqual(["root", "child", "next"]);
    expect(() => createQueue(model(), [event("a", "point"), event("a", "point")])).toThrow("DUPLICATE_EVENT");
    const bad = { root: (m: Model) => ({ model: m, followUps: [event("root", "point")] }) };
    expect(() => advanceQueue(createQueue(model(), [event("root", "root")]), pump(), bad, controller)).toThrow("DUPLICATE_EVENT");
  });
  it("控制权变更事件完成后，下一项选择暂停并在重启后只接受新控制者", () => {
    const h: Record<string, QueueHandler<Model>> = { ...handlers, transfer: m => ({ model: { ...m, owner: "p2" }, followUps: [event("a", "choose")] }) };
    const s = advanceQueue(createQueue(model(), [event("transfer", "transfer")]), pump(), h, controller);
    expect(s.completed).toEqual(["transfer"]);
    expect(() => advanceQueue(s, reply(), h, controller)).toThrow("NOT_CONTROLLER");
    const done = advanceQueue(JSON.parse(JSON.stringify(s)), reply("new", "p2"), h, controller);
    expect(done.model).toEqual({ owner: "p2", points: 2 });
  });
  it("稳定决定ID无需采用固定命名；多阶段选择必须拆分事件", () => {
    const h: Record<string, QueueHandler<Model>> = { custom: (m, e, a) => a ? { model: {...m, points: Number(a)} } : {model:m,decision:{id:"arbitrary-id",eventId:e.id,racerId:"r1",options:["2"]}} };
    const s = advanceQueue(createQueue(model(), [event("custom", "custom")]), pump(), h, controller);
    expect(advanceQueue(s, reply("x", "p1", "arbitrary-id"), h, controller).model.points).toBe(2);
    const bad: Record<string, QueueHandler<Model>> = { choose: (m, e) => ({model:m,decision:{id:`${e.id}:choice`,eventId:e.id,racerId:"r1",options:["2"]}}) };
    const waiting = advanceQueue(createQueue(model(), [event("a", "choose")]), pump(), bad, controller);
    expect(() => advanceQueue(waiting, reply(), bad, controller)).toThrow("SPLIT_MULTI_DECISION_EVENT");
  });
  it("不同事件不能复用已经回答过的决定ID，避免旧回答命中新决定", () => {
    const h: Record<string, QueueHandler<Model>> = { shared: (m,e,a) => a ? {model:m} : {model:m,decision:{id:"shared-id",eventId:e.id,racerId:"r1",options:["2"]}} };
    const waiting = advanceQueue(createQueue(model(),[event("first","shared"),event("second","shared")]),pump(),h,controller);
    expect(()=>advanceQueue(waiting,reply("a","p1","shared-id"),h,controller)).toThrow("DUPLICATE_DECISION");
  });
});
