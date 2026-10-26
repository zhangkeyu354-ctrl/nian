import { describe, expect, it } from "vitest";
import { reduceMA, testRace, total } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import type { MAState } from "../src/types.ts";
const make = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({ racers, pos, rolls, skipSetup: true, secondWindPreview: true, ...extra });
const points = (s: MAState, id: string) => total(s.players.find((p) => p.id === id)!.chips);
const powers = (s: MAState, id: string) => s.log.filter((l) => l.fx?.kind === "power" && l.fx.power === id);
const snapshot = (s: MAState, edit: (s: MAState) => void) => {
  const snap = JSON.parse(s.turn!.snapshot);
  edit(snap);
  s.turn!.snapshot = JSON.stringify(snap);
  return s;
};
const credit = (s: MAState, id: string, value: number) =>
  snapshot(s, (snap) => {
    snap.players.find((p) => p.id === id)!.chips.push({ kind: "gold", value, race: 0 });
  });

describe("Second Wind第五批5名", () => {
  it("旅馆先结算嵌套停格支付，再扣外层费用，不能把旧余额扣成负数", () => {
    let s = credit(make(["scoocher", "sw_hotel", "twin"], [0, 3, 4], [3]), "p1", 1);
    s = snapshot(s, (x) => {
      tok(x, "twin").base = "sw_hotel";
    });
    s = answer(s, "roll");
    expect(points(s, "p1")).toBe(0);
    expect(points(s, "p2") + points(s, "p3")).toBe(1);
    expect(tok(s, "scoocher").tripped).toBe(true);
  });
  it("继父的技能连锁让挪挪第二个冲线，仍保留已触发的3分奖励", () => {
    const s = answer(make(["twin", "scoocher", "sw_stepdad"], [28, 28, 10], [1]), "roll");
    expect(s.race!.finishers).toEqual(["twin", "scoocher"]);
    expect(points(s, "p3")).toBe(3);
  });
  it("山寨猫复制继父：自己的左邻居获得加速，不沿用原继父的邻居", () => {
    const s = answer(make(["twin", "copycat", "sw_stepdad"], [0, 10, 20], [1]), "roll");
    expect(tok(s, "twin").pos).toBe(3);
    expect(powers(s, "sw_stepdad")).toHaveLength(1);
  });
  it("惊艳者的决斗骰也固定为1，不改变决斗同点主动方胜", () => {
    let s = make(["duelist", "sw_stunner", "twin"], [0, 2, 3], [3, 6, 6]);
    s = answer(s, "roll");
    s = answer(s, "twin");
    const duel = s.log.find((l) => l.fx?.kind === "duel")!.fx;
    expect(duel).toEqual({ kind: "duel", a: { racer: "duelist", value: 1 }, b: { racer: "twin", value: 1 } });
    expect(tok(s, "duelist").pos).toBe(5);
  });
  it("惊艳者把炫耀者追加骰固定成1后爆骰，不会把累计结果拿来移动", () => {
    let s = answer(make(["sw_show_off", "sw_stunner", "twin"], [0, 1, 20], [3, 6]), "roll");
    s = answer(s, "roll");
    expect(tok(s, "sw_show_off").pos).toBe(0);
  });
  it("惊艳者不改变免骰稳定输出、辅助技能移动与地形距离", () => {
    const s = answer(make(["legs", "sw_stunner", "twin"], [2, 3, 20], [6], { track: "wild" }), "legs");
    expect(tok(s, "legs").pos).toBe(10);
  });
  it("旅馆支付旧场积分留下当前场开销记录，给后续双人变体结算用", () => {
    let s = make(["twin", "sw_hotel", "banana"], [0, 3, 20], [3]);
    s = snapshot(s, (x) => {
      x.players[0].chips = [{ kind: "gold", value: 3, race: -1 }];
    });
    s = answer(s, "roll");
    expect(points(s, "p1")).toBe(2);
    expect(s.race!.priorRaceSpending).toEqual({ p1: 1 });
  });
  it("旅馆付款优先用普通分数筹码，不产生负数筹码或删掉整枚3分奖牌", () => {
    let s = make(["twin", "sw_hotel", "banana"], [0, 3, 20], [3]);
    s = snapshot(s, (x) => {
      x.players[0].chips = [
        { kind: "gold", value: 3, race: 0 },
        { kind: "bronze", value: 1, race: 0 },
      ];
    });
    s = answer(s, "roll");
    expect(s.players[0].chips).toEqual([{ kind: "gold", value: 3, race: 0 }]);
  });
  it("Gloth在1点被惊艳者固定后不产生负移动", () => {
    let s = answer(make(["sw_gloth", "sw_stunner", "twin"], [0, 1, 29], [6, 1, 1]), "roll");
    expect(tok(s, "sw_gloth").pos).toBe(0);
    expect(tok(s, "sw_gloth").tripped).toBe(false);
  });
  it("两个关系户宝宝包含赛前复制者同步从弯道出发，不产生中间收费", () => {
    let s = testRace({
      racers: ["sw_nepo_baby", "twin", "sw_hotel"],
      pos: [0, 0, 12],
      winners: ["sw_nepo_baby"],
      secondWindPreview: true,
    });
    s = answer(s, "sw_nepo_baby");
    expect(tok(s, "sw_nepo_baby").pos).toBe(12);
    expect(tok(s, "twin").pos).toBe(12);
    expect(powers(s, "sw_hotel")).toHaveLength(0);
  });
  it("山寨猫赛后复制Gloth时奖励归山寨猫自己的玩家，两份奖金分别结算", () => {
    let s = make(["twin", "banana", "sw_gloth", "copycat"], [29, 29, 15, 0], [1, 1]);
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(points(s, "p3")).toBe(3);
    expect(points(s, "p4")).toBe(3);
  });
  it("Gloth主移动经香蕉和箭头，修正不再次加到额外移动", () => {
    const s = answer(make(["sw_gloth", "banana", "twin"], [3, 5, 20], [5], { track: "wild" }), "roll");
    expect(tok(s, "sw_gloth").pos).toBe(10);
    expect(tok(s, "sw_gloth").tripped).toBe(true);
  });
  it("惊艳者不会对已经冲线或淘汰者继续产生范围效果", () => {
    let s = make(["twin", "sw_stunner", "banana"], [10, 11, 20], [6]);
    s = snapshot(s, (x) => {
      tok(x, "sw_stunner").out = true;
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").pos).toBe(16);
  });
  it("旅馆的两名付费角色按各自玩家积分付款，同玩家自己支付不改筹码", () => {
    let s = credit(make(["twin", "sw_hotel", "banana"], [0, 3, 20], [3]), "p1", 1);
    s = snapshot(s, (x) => {
      tok(x, "sw_hotel").owner = "p1";
    });
    s = answer(s, "roll");
    expect(points(s, "p1")).toBe(1);
    expect(s.players[0].chips).toEqual([{ kind: "gold", value: 1, race: 0 }]);
    expect(tok(s, "twin").tripped).toBe(false);
  });
  it("继父左侧角色夺冠也受军师终止比赛影响，仍得到3分", () => {
    let s = make(["twin", "mastermind", "sw_stepdad"], [28, 10, 20], [1]);
    s = snapshot(s, (x) => {
      x.race!.mastermindPick = "twin";
    });
    s = answer(s, "roll");
    expect(s.race!.over).toBe(true);
    expect(points(s, "p3")).toBe(3);
  });
  it("Gloth主移动减1，与教练和黏黏怪叠加且不倒退", () => {
    const s = answer(make(["sw_gloth", "coach", "gunk"], [0, 0, 20], [3]), "roll");
    expect(tok(s, "sw_gloth").pos).toBe(2);
    expect(tok(answer(make(["sw_gloth", "twin", "banana"], [0, 10, 20], [1]), "roll"), "sw_gloth").pos).toBe(0);
  });
  it.each([14, 15, 16])("Gloth赛后奖励含第二弯道边界%s，仅发一次", (pos) => {
    let s = make(["twin", "banana", "sw_gloth"], [29, 29, pos], [1, 1]);
    s = answer(s, "roll");
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(s.race!.over).toBe(true);
    expect(points(s, "p3")).toBe(pos <= 15 ? 3 : 0);
    expect(powers(s, "sw_gloth")).toHaveLength(pos <= 15 ? 1 : 0);
  });
  it("已淘汰Gloth不领取赛后奖励", () => {
    let s = make(["twin", "banana", "sw_gloth"], [29, 29, 0], [1, 1]);
    s = snapshot(s, (x) => {
      tok(x, "sw_gloth").out = true;
    });
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(points(s, "p3")).toBe(0);
  });
  it("Gloth赛后不再让挪挪移动并产生第三个冲线者", () => {
    let s = make(["twin", "banana", "sw_gloth", "scoocher"], [29, 29, 0, 29], [1, 1]);
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["twin", "banana"]);
    expect(tok(s, "scoocher").pos).toBe(29);
    expect(points(s, "p3")).toBe(3);
  });
  it("旅馆正常：从一枚3分金牌付1分，旅馆加1，双方总分守恒", () => {
    let s = credit(make(["twin", "sw_hotel", "banana"], [0, 3, 20], [3]), "p1", 3);
    s = answer(s, "roll");
    expect(points(s, "p1")).toBe(2);
    expect(points(s, "p2")).toBe(1);
    expect(tok(s, "twin").tripped).toBe(false);
    const power = s.log.findIndex((l) => l.fx?.kind === "power" && l.fx.power === "sw_hotel");
    expect(s.log.findIndex((l) => l.fx?.kind === "chip")).toBeGreaterThan(power);
  });
  it("旅馆付不起则摔倒，不凭空给旅馆积分", () => {
    const s = answer(make(["twin", "sw_hotel", "banana"], [0, 3, 20], [3]), "roll");
    expect(tok(s, "twin").tripped).toBe(true);
    expect(points(s, "p2")).toBe(0);
  });
  it("旅馆自己移动到别人格不收费、起点原地0移动不收费", () => {
    const s = answer(make(["sw_hotel", "twin", "banana"], [0, 3, 20], [3]), "roll");
    expect(tok(s, "twin").tripped).toBe(false);
    expect(powers(s, "sw_hotel")).toHaveLength(0);
    const zero = answer(make(["sw_gloth", "sw_hotel", "twin"], [0, 0, 20], [1]), "roll");
    expect(powers(zero, "sw_hotel")).toHaveLength(0);
  });
  it("旅馆同时到达不收费：吸盘鱼跟随者和行动者均不触发", () => {
    let s = make(["twin", "suckerfish", "sw_hotel"], [0, 0, 3], [3]);
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(tok(s, "twin").tripped).toBe(false);
    expect(tok(s, "suckerfish").tripped).toBe(false);
    expect(powers(s, "sw_hotel")).toHaveLength(0);
  });
  it("灵魂伴侣传送停到旅馆格会收费；巨婴先挤走则不收费", () => {
    let s = testRace({ racers: ["sw_soulmate", "sw_hotel", "twin"], pos: [0, 4, 20], secondWindPreview: true });
    s = answer(s, "sw_hotel");
    expect(tok(s, "sw_soulmate").tripped).toBe(true);
    let baby = testRace({
      racers: ["sw_soulmate", "sw_hotel", "huge_baby", "twin"],
      pos: [0, 4, 4, 20],
      secondWindPreview: true,
    });
    baby = answer(baby, "sw_hotel");
    expect(tok(baby, "sw_soulmate").pos).toBe(3);
    expect(powers(baby, "sw_hotel")).toHaveLength(0);
  });
  it("旅馆在主骰重掷后合法到访收费，暂停恢复不重复扣款", () => {
    let s = credit(make(["twin", "sw_hotel", "sw_critic"], [1, 4, 0], [2, 3]), "p1", 2);
    s = answer(s, "roll");
    s = answer(JSON.parse(JSON.stringify(s)), "yes");
    expect(points(s, "p1")).toBe(1);
    expect(points(s, "p2")).toBe(1);
  });
  it("关系户宝宝赛前直接在第一弯道12格，使用warp而不经过香蕉", () => {
    const s = testRace({
      racers: ["sw_nepo_baby", "banana", "twin"],
      pos: [0, 5, 20],
      rolls: [2],
      secondWindPreview: true,
    });
    expect(tok(s, "sw_nepo_baby").pos).toBe(12);
    expect(tok(s, "sw_nepo_baby").tripped).toBe(false);
    expect(s.log.some((l) => l.fx?.kind === "warp" && l.fx.racer === "sw_nepo_baby" && l.fx.to === 12)).toBe(true);
  });
  it("双胞胎赛前复制关系户宝宝后也在12格，只有赛前一次", () => {
    let s = testRace({
      racers: ["twin", "banana", "alchemist"],
      winners: ["sw_nepo_baby"],
      secondWindPreview: true,
      rolls: [2],
    });
    s = answer(s, "sw_nepo_baby");
    expect(tok(s, "twin").pos).toBe(12);
    s = answer(s, "roll");
    expect(tok(s, "twin").pos).toBe(14);
  });
  it("关系户宝宝在狂野第一弯道也只出发一次，巨婴把它放到11再走箭头", () => {
    const s = testRace({
      racers: ["sw_nepo_baby", "huge_baby", "twin"],
      pos: [0, 12, 20],
      track: "wild",
      secondWindPreview: true,
    });
    expect(tok(s, "sw_nepo_baby").pos).toBe(11);
    expect(powers(s, "sw_nepo_baby")).toHaveLength(1);
  });
  it("继父左侧邻居主移动加2，不给自己或右侧选手加速", () => {
    let s = make(["twin", "sw_stepdad", "banana"], [0, 10, 20], [2, 2, 2]);
    s = answer(s, "roll");
    expect(tok(s, "twin").pos).toBe(2);
    s = answer(s, "roll");
    expect(tok(s, "sw_stepdad").pos).toBe(12);
    s = answer(s, "roll");
    expect(tok(s, "banana").pos).toBe(24);
  });
  it("继父主移动加2也用于鼹鼠免骰；额外箭头不再加2", () => {
    let s = make(["sw_mole", "twin", "sw_stepdad"], [0, 20, 25], [2]);
    s = answer(s, "mole");
    expect(tok(s, "sw_mole").pos).toBe(8);
    const arrow = answer(make(["twin", "banana", "sw_stepdad"], [3, 20, 25], [2], { track: "wild" }), "roll");
    expect(tok(arrow, "twin").pos).toBe(10);
  });
  it("继父左侧选手夺冠立刻加3分，不修改冠军3分规则", () => {
    let s = make(["twin", "banana", "sw_stepdad"], [28, 20, 10], [1]);
    s = answer(s, "roll");
    expect(tok(s, "twin").place).toBe(1);
    expect(points(s, "p3")).toBe(3);
    expect(s.race!.finishers).toEqual(["twin"]);
  });
  it("继父左侧选手只是亚军则不奖励；离场继父不发动", () => {
    let s = make(["twin", "banana", "sw_stepdad"], [27, 20, 10], [1]);
    s = snapshot(s, (x) => {
      tok(x, "banana").place = 1;
      tok(x, "banana").pos = 30;
      x.race!.finishers = ["banana"];
    });
    s = answer(s, "roll");
    expect(tok(s, "twin").place).toBe(2);
    expect(points(s, "p3")).toBe(0);
    let gone = make(["twin", "banana", "sw_stepdad"], [27, 20, 10], [1]);
    gone = snapshot(gone, (x) => {
      tok(x, "sw_stepdad").out = true;
    });
    gone = answer(gone, "roll");
    expect(tok(gone, "twin").pos).toBe(28);
    expect(powers(gone, "sw_stepdad")).toHaveLength(0);
  });
  it("惊艳者恰好一格以内主骰视为1，距离2不影响，自己不影响自己", () => {
    const near = answer(make(["twin", "sw_stunner", "banana"], [10, 11, 25], [6]), "roll");
    expect(tok(near, "twin").pos).toBe(11);
    const far = answer(make(["twin", "sw_stunner", "banana"], [10, 12, 25], [6]), "roll");
    expect(tok(far, "twin").pos).toBe(16);
    const own = answer(make(["sw_stunner", "twin", "banana"], [0, 0, 25], [6]), "roll");
    expect(tok(own, "sw_stunner").pos).toBe(6);
  });
  it("惊艳者主骰1触发毛毛虫、阻止伊卡洛斯6淘汰", () => {
    const s = answer(make(["sw_icarus", "sw_stunner", "inchworm"], [0, 1, 20], [6]), "roll");
    expect(tok(s, "sw_icarus").out).toBe(false);
    expect(tok(s, "sw_icarus").pos).toBe(0);
    expect(tok(s, "inchworm").pos).toBe(21);
  });
  it("惊艳者影响宿敌跟掷辅助骰，不把辅助1再当主骰", () => {
    let s = answer(make(["twin", "sw_nemesis", "sw_stunner"], [10, 0, 1], [1, 6]), "roll");
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(1);
  });
  it("惊艳者影响水管辅助骰，距离超过1的目标不摔倒", () => {
    let s = make(["sw_the_hose", "sw_stunner", "twin"], [0, 1, 3], [1, 6], { tripped: [true, false, false] });
    s = answer(s, "ok");
    s = answer(s, "roll");
    expect(tok(s, "sw_stunner").tripped).toBe(true);
    expect(tok(s, "twin").tripped).toBe(false);
  });
  it("惊艳者不会泄露rng或允许别人回答当前骰子", () => {
    const s = make(["twin", "sw_stunner", "banana"], [0, 1, 20], [6]);
    expect((viewForMA(s, "p2") as any).rng).toBeUndefined();
    expect(viewForMA(s, "p2").pending?.options).toEqual([]);
    expect(() => reduceMA(s, { type: "ANSWER", player: "p2", value: "roll" })).toThrow();
  });
});
