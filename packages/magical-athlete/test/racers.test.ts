import { describe, expect, it } from "vitest";
import { testRace, total } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { answer, logText, tok } from "./helpers.ts";

/** 没有相关能力的陪跑选手（双胞胎在没有前冠军时没有能力） */
const F = "twin";
const race = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({ racers, pos, rolls, skipSetup: true, ...extra });
const roll = (s: MAState) => {
  expect(s.pending?.kind).toBe("main");
  return answer(s, "roll");
};
const chips = (s: MAState, id: string) => total(s.players.find((p) => p.id === id)!.chips);

describe("魔法运动员 · 36 名选手能力", () => {
  it("炼金术士：掷 1 或 2 可改走 4 格", () => {
    let s = roll(race(["alchemist", F, F], [0, 10, 10], [2]));
    expect(s.pending?.kind).toBe("alchemist");
    s = answer(s, "yes");
    expect(tok(s, "alchemist").pos).toBe(4);
  });

  it("香蕉：经过它的选手摔倒；摔倒的回合只能爬起来", () => {
    let s = roll(race([F, "banana", "lackey"], [0, 2, 20], [3]));
    expect(tok(s, F).pos).toBe(3);
    expect(tok(s, F).tripped).toBe(true);
  });

  it("半人马：经过的选手后退 2 格，最多退到起点", () => {
    const s = roll(race(["centaur", F, "lackey"], [0, 1, 20], [3]));
    expect(tok(s, "centaur").pos).toBe(3);
    expect(tok(s, F).pos).toBe(0);
  });

  it("芭芭雅嘎：停到她格子的人摔倒", () => {
    const s = roll(race([F, "baba_yaga", "lackey"], [0, 3, 20], [3]));
    expect(tok(s, F).tripped).toBe(true);
  });

  it("教练：同格（含教练）主移动 +1", () => {
    let s = roll(race([F, "coach", "lackey"], [5, 5, 20], [3]));
    expect(tok(s, F).pos).toBe(9);
    s = roll(s); // 教练自己
    expect(s.race!.lastRoll?.racer).toBe("coach");
  });

  it("黏黏怪：别人主移动 −1；挪挪每次 −1 蹭 1 格", () => {
    const s = roll(race([F, "gunk", "scoocher"], [0, 20, 10], [3]));
    expect(tok(s, F).pos).toBe(2);
    expect(tok(s, "scoocher").pos).toBe(11);
  });

  it("兔子：+2；回合开始时独自领先则跳过主移动", () => {
    let s = roll(race(["hare", F, "lackey"], [0, 5, 5], [3]));
    expect(tok(s, "hare").pos).toBe(5);
    s = race(["hare", F, "lackey"], [10, 5, 5], []);
    expect(s.pending?.kind).toBe("hare");
    s = answer(s);
    expect(tok(s, "hare").pos).toBe(10);
  });

  it("巨婴：不能与它同格，改放到它身后", () => {
    const s = roll(race([F, "huge_baby", "lackey"], [0, 3, 20], [3]));
    expect(tok(s, F).pos).toBe(2);
  });

  it("尺蠖：别人掷 1 时跳过移动，尺蠖走 1", () => {
    const s = roll(race([F, "inchworm", "lackey"], [0, 5, 20], [1]));
    expect(tok(s, F).pos).toBe(0);
    expect(tok(s, "inchworm").pos).toBe(6);
  });

  it("跟班：别人掷 6 时先走 2 格", () => {
    const s = roll(race([F, "lackey", "inchworm"], [0, 5, 20], [6]));
    expect(tok(s, "lackey").pos).toBe(7);
    expect(tok(s, F).pos).toBe(6);
  });

  it("跳跳蟾：跳过有人的格子不计步", () => {
    const s = roll(race(["leaptoad", F, "lackey"], [0, 1, 2], [1]));
    expect(tok(s, "leaptoad").pos).toBe(3);
  });

  it("大长腿：可以不掷骰直接走 5（仍算主移动，被黏黏怪 −1）", () => {
    const s = answer(race(["legs", "gunk", F], [0, 20, 20], []), "legs");
    expect(tok(s, "legs").pos).toBe(4);
  });

  it("可爱废柴：独自垫底时主移动前得 1 分", () => {
    const s = race(["lovable_loser", F, "lackey"], [0, 5, 5], []);
    expect(chips(s, "p1")).toBe(1);
  });

  it("魔术师：最多重掷两次，用最后一次", () => {
    let s = roll(race(["magician", F, "lackey"], [0, 20, 20], [1, 2, 3]));
    expect(s.pending?.kind).toBe("reroll");
    s = answer(s, "magician");
    s = answer(s, "magician");
    expect(tok(s, "magician").pos).toBe(3);
  });

  it("军师：猜中冠军时比赛立刻结束，军师第 2", () => {
    let s = race(["mastermind", F, "lackey"], [0, 27, 0], [1, 6]);
    expect(s.pending?.kind).toBe("mastermind");
    s = answer(s, F);
    s = roll(s); // 军师掷 1
    s = roll(s); // 陪跑掷 6 冲线
    expect(s.race!.over).toBe(true);
    expect(s.race!.finishers).toEqual([F, "mastermind"]);
  });

  it("血盆大口：停到恰好一人的格子，吞掉对方", () => {
    const s = roll(race(["mouth", F, "lackey"], [0, 3, 20], [3]));
    expect(tok(s, F).out).toBe(true);
  });

  it("派对咖：所有人向它移动 1，同格每人 +1", () => {
    let s = race(["party_animal", F, "lackey"], [5, 4, 9], [2]);
    expect(tok(s, F).pos).toBe(5);
    expect(tok(s, "lackey").pos).toBe(8);
    s = roll(s);
    expect(tok(s, "party_animal").pos).toBe(8);
  });

  it("火箭科学家：两倍移动后摔倒", () => {
    let s = roll(race(["rocket_scientist", F, "lackey"], [0, 20, 20], [4]));
    s = answer(s, "yes");
    expect(tok(s, "rocket_scientist").pos).toBe(8);
    expect(tok(s, "rocket_scientist").tripped).toBe(true);
  });

  it("浪漫者：有人停进恰好两人的格子，浪漫者走 2", () => {
    const s = roll(race([F, "lackey", "romantic"], [0, 3, 10], [3]));
    expect(tok(s, "romantic").pos).toBe(12);
  });

  it("西西弗斯：赛前 4 分；掷 6 回起点并失 1 分", () => {
    let s = testRace({ racers: ["sisyphus", F, "lackey"], pos: [10, 20, 20], rolls: [6] });
    expect(chips(s, "p1")).toBe(4);
    s = roll(s);
    expect(tok(s, "sisyphus").pos).toBe(0);
    expect(chips(s, "p1")).toBe(3);
  });

  it("船长：有人掷 1 时船长下一个行动", () => {
    const s = roll(race([F, "lackey", "skipper"], [0, 20, 10], [1]));
    expect(s.race!.current).toBe("p3");
  });

  it("较真怪：别人只能恰好冲线，走过头就不动", () => {
    let s = roll(race([F, "stickler", "lackey"], [27, 0, 0], [5]));
    expect(tok(s, F).pos).toBe(27);
    s = race([F, "stickler", "lackey"], [27, 0, 0], [3]);
    s = roll(s);
    expect(tok(s, F).place).toBe(1);
  });

  it("吸盘鱼：同格的人移动后可以跟去", () => {
    let s = roll(race([F, "suckerfish", "lackey"], [4, 4, 20], [3]));
    expect(s.pending?.kind).toBe("suckerfish");
    s = answer(s, "yes");
    expect(tok(s, "suckerfish").pos).toBe(7);
  });

  it("电灯泡：主移动前可传送到恰好两人的格子", () => {
    let s = race(["third_wheel", F, "lackey"], [0, 9, 9], [1]);
    expect(s.pending?.kind).toBe("third_wheel");
    s = answer(s, "9");
    expect(tok(s, "third_wheel").pos).toBe(9);
  });

  it("双胞胎：赛前复刻之前的冠军（这里复刻大长腿）", () => {
    let s = testRace({ racers: ["twin", F, "lackey"], winners: ["legs"], rolls: [] });
    expect(s.pending?.kind).toBe("twin");
    s = answer(s, "legs");
    expect(s.pending?.options.some((o) => o.value === "legs")).toBe(true);
  });

  it("神秘蛋：赛前抽 3 选 1，获得它的能力；别人看不到抽到什么", () => {
    let s = testRace({ racers: ["egg", F, "lackey"], rolls: [] });
    expect(s.pending?.kind).toBe("egg");
    expect(s.pending?.options).toHaveLength(3);
    const pick = s.pending!.options[0].value;
    s = answer(s, pick);
    expect(tok(s, "egg").base).toBe(pick);
  });

  it("山寨猫：拥有领先者的能力", () => {
    const s = race(["copycat", "legs", "lackey"], [0, 10, 0], []);
    expect(s.pending?.options.map((o) => o.value)).toContain("legs");
  });

  it("骰贩子：任何人可重掷一次，别人重掷时骰贩子走 1", () => {
    let s = roll(race([F, "dicemonger", "lackey"], [0, 10, 20], [1, 5]));
    expect(s.pending?.kind).toBe("reroll");
    s = answer(s, "dicemonger");
    expect(tok(s, "dicemonger").pos).toBe(11);
    expect(tok(s, F).pos).toBe(5);
  });

  it("决斗者：同格时可以决斗，点数高者走 2，平局决斗者赢", () => {
    let s = roll(race([F, "duelist", "lackey"], [0, 3, 20], [3, 4, 4]));
    expect(s.pending?.kind).toBe("duel");
    s = answer(s, F);
    expect(tok(s, "duelist").pos).toBe(5);
  });

  it("人字拖：不掷骰，与另一名选手交换位置", () => {
    const s = answer(race(["flip_flop", F, "lackey"], [0, 12, 20], []), "flip:" + F);
    expect(tok(s, "flip_flop").pos).toBe(12);
    expect(tok(s, F).pos).toBe(0);
  });

  it("天才：猜中点数后再行动一回合", () => {
    let s = race(["genius", F, "lackey"], [0, 20, 20], [4, 1]);
    expect(s.pending?.kind).toBe("genius");
    s = answer(s, "4");
    s = roll(s);
    expect(s.race!.current).toBe("p1");
  });

  it("毒舌喷子：别人回合结束时离起点不超过 1 格，喷子走 2", () => {
    const s = roll(race([F, "heckler", "lackey"], [0, 10, 20], [1]));
    expect(tok(s, "heckler").pos).toBe(12);
  });

  it("催眠师：主移动前把一名选手传送到自己格子", () => {
    let s = race(["hypnotist", F, "lackey"], [5, 12, 20], []);
    s = answer(s, F);
    expect(tok(s, F).pos).toBe(5);
  });

  it("啦啦队长：最后一名走 2，自己走 1", () => {
    let s = race(["cheerleader", F, "lackey"], [5, 0, 20], []);
    s = answer(s, "yes");
    expect(tok(s, F).pos).toBe(2);
    expect(tok(s, "cheerleader").pos).toBe(6);
  });

  it("挪挪 + 巨婴：无限循环只结算一轮后停止", () => {
    const s = roll(race([F, "scoocher", "huge_baby", "gunk"], [0, 9, 10, 20], [3]));
    expect(logText(s)).toContain("循环");
    expect(tok(s, "scoocher").pos).toBe(9);
  });

  it("第二名冲线时比赛立刻结束并发奖牌", () => {
    let s = roll(race([F, "lackey", "inchworm"], [28, 28, 0], [2, 2]));
    s = roll(s);
    expect(s.race!.over).toBe(true);
    expect(s.phase).toBe("choose");
    expect(chips(s, "p1")).toBe(3);
    expect(chips(s, "p2")).toBe(1);
    // 下一场先手：最落后的选手
    expect(s.nextFirst).toBe("p3");
  });

  it("摔倒的回合跳过主移动", () => {
    const s = race([F, "lackey", "inchworm"], [3, 0, 0], [], { tripped: [true, false, false] });
    expect(s.pending?.kind).toBe("standup");
  });

  it("飞艇：回合开始时在第 15 格（第二弯道）之前 +3，之后 −1", () => {
    let s = roll(race(["blimp", F, "lackey"], [14, 0, 0], [2]));
    expect(tok(s, "blimp").pos).toBe(19);
    s = roll(race(["blimp", F, "lackey"], [15, 0, 0], [2]));
    expect(tok(s, "blimp").pos).toBe(16);
  });

  it("狂野赛道：箭头额外移动、石头摔倒、星星得 1 分", () => {
    const wild = (pos: number, r: number) =>
      roll(testRace({ racers: [F, "lackey", "inchworm"], pos: [pos, 0, 0], rolls: [r], skipSetup: true, track: "wild" }));
    expect(tok(wild(4, 3), F).pos).toBe(10); // 停在 7（+3）→ 10
    expect(tok(wild(14, 2), F).pos).toBe(13); // 停在 16（−3）→ 13，再得星星
    expect(chips(wild(14, 2), "p1")).toBe(1);
    expect(tok(wild(3, 2), F).tripped).toBe(true); // 石头 5
  });

  it("巨婴挡在箭头终点：循环结算一轮后停止（狂野 11 号 +1 → 12 号巨婴）", () => {
    const s = roll(testRace({ racers: [F, "huge_baby", "lackey"], pos: [9, 12, 0], rolls: [2], skipSetup: true, track: "wild" }));
    expect(tok(s, F).pos).toBe(11);
    expect(logText(s)).toContain("循环");
  });
});

describe("给界面播放的结构化事件", () => {
  it("一次主移动依次产生：掷骰 → 移动（起点、终点）；技能发动带选手与技能 id", () => {
    const s = roll(testRace({ racers: [F, "gunk", "lackey"], pos: [0, 20, 10], rolls: [6], skipSetup: true }));
    const fx = s.log.map((l) => l.fx).filter(Boolean);
    expect(fx).toContainEqual({ kind: "roll", player: "p1", racer: F, value: 6 });
    expect(fx).toContainEqual({ kind: "power", racer: "lackey", power: "lackey" });
    expect(fx).toContainEqual({ kind: "power", racer: "gunk", power: "gunk" });
    expect(fx).toContainEqual({ kind: "move", racers: [F], from: 0, to: 5 });
    expect(fx).toContainEqual({ kind: "move", racers: ["lackey"], from: 10, to: 12 });
    const i = fx.findIndex((f) => f!.kind === "roll");
    const j = fx.findIndex((f) => f!.kind === "move" && (f as { racers: string[] }).racers[0] === F);
    expect(i).toBeLessThan(j);
  });
});
