import { describe, expect, it } from "vitest";
import { reduceMA, testRace } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import type { MAState } from "../src/types.ts";

const make = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({
    racers,
    pos,
    rolls,
    skipSetup: true,
    secondWindPreview: true,
    ...extra,
  });
const powers = (s: MAState, id: string) =>
  s.log.filter((l) => l.fx?.kind === "power" && l.fx.power === id);
const resume = (s: MAState) => JSON.parse(JSON.stringify(s)) as MAState;
const until = (s: MAState, kind: string) => {
  for (let i = 0; i < 40 && s.pending && s.pending.kind !== kind; i++)
    s = answer(
      s,
      s.pending.options.find((o) => o.value === "no")?.value ??
        s.pending.options.find((o) => o.value === "keep")?.value ??
        s.pending.options[0].value,
    );
  expect(s.pending?.kind).toBe(kind);
  return s;
};

describe("Second Wind第四批5名", () => {
  it("山寨猫复制企鹅：被经过后失去领先复制目标仍结算此次摔倒", () => {
    const s = answer(
      make(["twin", "copycat", "sw_penguin"], [0, 2, 3], [5]),
      "roll",
    );
    expect(tok(s, "copycat").tripped).toBe(true);
  });
  it("山寨猫复制海怪仍按本体分别记录本场次数", () => {
    let s = make(["copycat", "sw_kraken", "banana"], [0, 10, 5], [2]);
    s = answer(s, "yes");
    expect(tok(s, "copycat").secondWind?.krakenUsed).toBe(true);
    expect(tok(s, "sw_kraken").secondWind?.krakenUsed).toBeUndefined();
  });
  it("山寨猫在自己回合复制领先宿敌不会跟掷自己的骰", () => {
    const s = answer(
      make(["copycat", "sw_nemesis", "twin"], [0, 10, 5], [2]),
      "roll",
    );
    expect(s.pending?.kind).toBe("nemesis");
    expect(s.pending?.racer).toBe("sw_nemesis");
    expect(
      answer(s, "no").log.filter((l) => l.fx?.kind === "roll"),
    ).toHaveLength(1);
  });
  it("宿敌发动让挪挪先蹭步，移动走统一事件", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "scoocher"], [20, 0, 5], [3, 3]),
      "roll",
    );
    s = answer(s, "yes");
    expect(tok(s, "scoocher").pos).toBe(6);
    expect(
      s.log.some((l) => l.fx?.kind === "move" && l.fx.why === "宿命对决"),
    ).toBe(true);
  });
  it("宿敌可带吸盘鱼同步到达；浪漫者不因这次停格移动", () => {
    let s = answer(
      make(
        ["twin", "sw_nemesis", "suckerfish", "romantic"],
        [20, 0, 0, 10],
        [3, 3],
      ),
      "roll",
    );
    s = answer(s, "yes");
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(3);
    expect(tok(s, "suckerfish").pos).toBe(3);
    expect(tok(s, "romantic").pos).toBe(10);
  });
  it("宿敌跟掷会受较真怪约束，不会越界冲线", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "stickler"], [5, 28, 10], [4, 4]),
      "roll",
    );
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(28);
    expect(tok(s, "sw_nemesis").place).toBeNull();
  });
  it("海怪只传送仍在场目标，已冲线角色不被拖回", () => {
    let s = make(["sw_kraken", "twin", "banana"], [10, 2, 20], [2]);
    const snap = JSON.parse(s.turn!.snapshot);
    const target = tok(snap, "twin");
    target.place = 1;
    target.pos = 30;
    snap.race.finishers = ["twin"];
    s.turn!.snapshot = JSON.stringify(snap);
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(30);
    expect(tok(s, "twin").tripped).toBe(false);
  });
  it("海怪拉到箭头时每名目标先到达，再各自结算地形，不触发经过技能", () => {
    const s = answer(
      make(["sw_kraken", "twin", "banana"], [7, 2, 20], [2], { track: "wild" }),
      "yes",
    );
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "banana").pos).toBe(10);
    expect(tok(s, "sw_kraken").pos).toBe(7);
    expect(powers(s, "banana")).toHaveLength(0);
  });
  it("企鹅被箭头这一段经过也摔倒，已有摔倒不被清除", () => {
    const s = answer(
      make(["twin", "sw_penguin", "banana"], [3, 8, 25], [4], {
        track: "wild",
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "sw_penguin").tripped).toBe(true);
  });
  it("企鹅被传送到另一边不算被经过", () => {
    let s = make(["sw_tail", "sw_penguin", "twin"], [0, 5, 10], [2]);
    s = answer(s, "sw_penguin");
    expect(tok(s, "sw_penguin").tripped).toBe(false);
  });
  it("企鹅滑行被较真怪阻挡时不发移动，不把摔倒当起身", () => {
    const s = answer(
      make(["sw_penguin", "stickler", "twin"], [28, 10, 20], [2], {
        tripped: [true, false, false],
      }),
      "roll",
    );
    expect(tok(s, "sw_penguin").pos).toBe(28);
    expect(tok(s, "sw_penguin").tripped).toBe(true);
  });
  it("炫耀者有主骰3时受破坏者影响，累计总移动后退", () => {
    let s = answer(
      make(["sw_show_off", "sw_le_saboteur", "twin"], [10, 0, 25], [2, 3]),
      "roll",
    );
    s = answer(s, "roll");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(5);
  });
  it("炫耀者额外6触发跟班一次，原来的低骰不触发6", () => {
    let s = answer(
      make(["sw_show_off", "lackey", "twin"], [0, 10, 25], [2, 6]),
      "roll",
    );
    s = answer(s, "roll");
    s = answer(s, "stop");
    expect(tok(s, "lackey").pos).toBe(12);
    expect(tok(s, "sw_show_off").pos).toBe(8);
  });
  it("炫耀者额外骰仍允许评论家本回合唯一重掷，不重复授权", () => {
    let s = answer(
      make(["sw_show_off", "sw_critic", "twin"], [10, 0, 25], [2, 1, 4]),
      "roll",
    );
    s = answer(s, "no");
    s = answer(s, "roll");
    s = answer(s, "yes");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(16);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it("灵魂伴侣已离场的目标不传送，角色记忆随JSON恢复", () => {
    let s = make(["sw_soulmate", "twin", "banana"], [0, 5, 20], [2]);
    const snap = JSON.parse(s.turn!.snapshot);
    tok(snap, "sw_soulmate").secondWind = { soulmate: "twin" };
    tok(snap, "twin").out = true;
    s.turn!.snapshot = JSON.stringify(snap);
    s = answer(resume(s), "roll");
    expect(tok(s, "sw_soulmate").pos).toBe(2);
  });
  it("灵魂伴侣目标同格仍发动；传送不牵引吸盘鱼", () => {
    let s = testRace({
      racers: ["sw_soulmate", "twin", "suckerfish"],
      pos: [0, 5, 0],
      rolls: [2],
      secondWindPreview: true,
    });
    s = answer(s, "twin");
    expect(tok(s, "suckerfish").pos).toBe(0);
    expect(s.pending?.kind).toBe("main");
  });
  it("海怪正常：先技能后全员传送及摔倒，不移动自己", () => {
    let s = make(["sw_kraken", "twin", "banana"], [10, 2, 20], [2]);
    expect(s.pending?.kind).toBe("kraken");
    s = answer(s, "yes");
    expect(s.race!.tokens.map((t) => t.pos)).toEqual([10, 10, 10]);
    expect(s.race!.tokens.map((t) => t.tripped)).toEqual([false, true, true]);
    const power = s.log.findIndex(
      (l) => l.fx?.kind === "power" && l.fx.power === "sw_kraken",
    );
    expect(s.log.findIndex((l) => l.fx?.kind === "warp")).toBeGreaterThan(
      power,
    );
    expect(s.log.findIndex((l) => l.fx?.kind === "trip")).toBeGreaterThan(
      power,
    );
  });
  it("海怪可放弃，下一回合仍可用；用过后JSON恢复不会重复询问", () => {
    let s = answer(
      make(["sw_kraken", "twin", "banana"], [10, 2, 20], [2, 2, 2, 2]),
      "no",
    );
    s = answer(s, "roll");
    s = until(s, "kraken");
    s = answer(resume(s), "yes");
    s = answer(s, "roll");
    for (let i = 0; i < 10 && s.pending?.player !== "p1"; i++) s = answer(s);
    expect(s.pending?.kind).toBe("main");
    expect(powers(s, "sw_kraken")).toHaveLength(1);
  });
  it("海怪同格目标也摔倒；摔倒时仍能先发动技能", () => {
    const s = answer(
      make(["sw_kraken", "twin", "banana"], [10, 10, 20], [2], {
        tripped: [true, false, false],
      }),
      "yes",
    );
    expect(s.pending?.kind).toBe("standup");
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("海怪多人同时到达不触发血盆大口或浪漫者的停格能力", () => {
    const s = answer(
      make(["sw_kraken", "mouth", "romantic", "twin"], [10, 2, 20, 25], [2]),
      "yes",
    );
    expect(s.race!.tokens.every((t) => !t.out && t.pos === 10)).toBe(true);
    expect(powers(s, "romantic")).toHaveLength(0);
  });
  it("海怪传送到巨婴后方，脚下石头仍结算", () => {
    const s = answer(
      make(["sw_kraken", "huge_baby", "twin"], [18, 2, 25], [2], {
        track: "wild",
      }),
      "yes",
    );
    expect(tok(s, "huge_baby").pos).toBe(18);
    expect(tok(s, "twin").pos).toBe(17);
    expect(tok(s, "sw_kraken").pos).toBe(17);
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("海怪决定只交给本人，不公开其他人的选项", () => {
    const s = make(["sw_kraken", "twin", "banana"], [10, 2, 20], [2]);
    expect(viewForMA(s, "p2").pending?.options).toEqual([]);
    expect(() =>
      reduceMA(s, { type: "ANSWER", player: "p2", value: "yes" }),
    ).toThrow();
    expect((viewForMA(s, "p2") as any).turn).toBeUndefined();
  });
  it("宿敌正常：跟掷相同点先移动，再由原选手主移动", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "banana"], [10, 0, 25], [3, 3]),
      "roll",
    );
    expect(s.pending?.kind).toBe("nemesis");
    expect(s.pending?.player).toBe("p2");
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(3);
    expect(tok(s, "twin").pos).toBe(13);
  });
  it("宿敌不同点或放弃不移动，不能跟掷自己的骰", () => {
    expect(
      tok(
        answer(
          answer(
            make(["twin", "sw_nemesis", "banana"], [10, 0, 25], [3, 2]),
            "roll",
          ),
          "yes",
        ),
        "sw_nemesis",
      ).pos,
    ).toBe(0);
    expect(
      tok(
        answer(
          answer(
            make(["twin", "sw_nemesis", "banana"], [10, 0, 25], [3]),
            "roll",
          ),
          "no",
        ),
        "sw_nemesis",
      ).pos,
    ).toBe(0);
    const own = answer(
      make(["sw_nemesis", "twin", "banana"], [0, 10, 25], [3]),
      "roll",
    );
    expect(tok(own, "sw_nemesis").pos).toBe(3);
  });
  it("宿敌只跟最终主骰，不跟辅助冲洗骰或免骰", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "dicemonger"], [10, 0, 25], [2, 3, 3]),
      "roll",
    );
    expect(s.pending?.kind).toBe("reroll");
    s = answer(s, "dicemonger");
    s = answer(s, "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(3);
    expect(powers(s, "sw_nemesis")).toHaveLength(1);
    const fixed = answer(
      make(["legs", "sw_nemesis", "banana"], [0, 10, 25], [3]),
      "legs",
    );
    expect(powers(fixed, "sw_nemesis")).toHaveLength(0);
  });
  it("宿敌跟掷不触发跟班，JSON恢复不额外消费随机数", () => {
    let s = answer(
      make(["twin", "sw_nemesis", "lackey"], [10, 0, 20], [6, 6]),
      "roll",
    );
    s = answer(resume(s), "yes");
    expect(tok(s, "sw_nemesis").pos).toBe(6);
    expect(tok(s, "lackey").pos).toBe(22);
    expect(s.forcedRolls).toHaveLength(0);
  });
  it("宿敌通过香蕉会摔倒，箭头会继续移动", () => {
    const s = answer(
      answer(
        make(["twin", "sw_nemesis", "banana"], [20, 3, 5], [4, 4], {
          track: "wild",
        }),
        "roll",
      ),
      "yes",
    );
    expect(tok(s, "sw_nemesis").tripped).toBe(true);
    expect(tok(s, "sw_nemesis").pos).toBe(10);
  });
  it("企鹅被经过先发动再自己摔倒，移动者不摔倒", () => {
    const s = answer(
      make(["twin", "sw_penguin", "banana"], [0, 2, 25], [4]),
      "roll",
    );
    expect(tok(s, "sw_penguin").tripped).toBe(true);
    expect(tok(s, "twin").tripped).toBe(false);
    const p = s.log.findIndex(
      (l) => l.fx?.kind === "power" && l.fx.power === "sw_penguin",
    );
    expect(s.log.findIndex((l) => l.fx?.kind === "trip")).toBeGreaterThan(p);
  });
  it("企鹅摔倒主骰翻倍、保持滑行状态；教练只加1，不把全部修正翻倍", () => {
    const s = answer(
      make(["sw_penguin", "coach", "twin"], [0, 0, 25], [3], {
        tripped: [true, false, false],
      }),
      "roll",
    );
    expect(tok(s, "sw_penguin").pos).toBe(7);
    expect(tok(s, "sw_penguin").tripped).toBe(true);
  });
  it("站着的企鹅正常主移动，不自动翻倍；后退经过暂随现有规则", () => {
    const s = answer(
      make(["sw_penguin", "twin", "banana"], [0, 10, 25], [3]),
      "roll",
    );
    expect(tok(s, "sw_penguin").pos).toBe(3);
    expect(tok(s, "sw_penguin").tripped).toBe(false);
  });
  it("冲线经过企鹅也会使企鹅摔倒；停在同格不算经过", () => {
    const s = answer(
      make(["twin", "sw_penguin", "banana"], [28, 29, 20], [3]),
      "roll",
    );
    expect(tok(s, "sw_penguin").tripped).toBe(true);
    const same = answer(
      make(["twin", "sw_penguin", "banana"], [0, 3, 20], [3]),
      "roll",
    );
    expect(tok(same, "sw_penguin").tripped).toBe(false);
  });
  it("企鹅摔倒骰被评论家重掷后只翻最终值", () => {
    let s = answer(
      make(["sw_penguin", "sw_critic", "twin"], [10, 0, 25], [5, 2], {
        tripped: [true, false, false],
      }),
      "roll",
    );
    s = answer(s, "yes");
    expect(tok(s, "sw_penguin").pos).toBe(14);
  });
  it("炫耀者可立即收手，以最初骰点移动", () => {
    let s = answer(
      make(["sw_show_off", "twin", "banana"], [0, 10, 25], [2]),
      "roll",
    );
    expect(s.pending?.kind).toBe("showoff");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(2);
  });
  it("炫耀者连续递增累加，每一轮可暂停恢复", () => {
    let s = answer(
      make(["sw_show_off", "twin", "banana"], [0, 20, 25], [1, 3, 6]),
      "roll",
    );
    s = answer(resume(s), "roll");
    s = answer(resume(s), "roll");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(10);
    expect(s.forcedRolls).toHaveLength(0);
  });
  it.each([1, 3])("炫耀者新骰%s不大于前骰3则本次完全不移动", (v) => {
    let s = answer(
      make(["sw_show_off", "coach", "twin"], [0, 0, 25], [3, v]),
      "roll",
    );
    s = answer(s, "roll");
    expect(tok(s, "sw_show_off").pos).toBe(0);
  });
  it("炫耀者累计后只加一次教练修正", () => {
    let s = answer(
      make(["sw_show_off", "coach", "twin"], [0, 0, 25], [2, 4]),
      "roll",
    );
    s = answer(s, "roll");
    s = answer(s, "stop");
    expect(tok(s, "sw_show_off").pos).toBe(7);
  });
  it("炫耀者每颗额外主骰都允许宿敌跟掷，辅助骰不递归", () => {
    let s = answer(
      make(["sw_show_off", "sw_nemesis", "twin"], [0, 10, 25], [2, 2, 4, 4]),
      "roll",
    );
    s = answer(s, "yes");
    s = answer(s, "roll");
    s = answer(s, "yes");
    s = answer(s, "stop");
    expect(tok(s, "sw_nemesis").pos).toBe(16);
    expect(tok(s, "sw_show_off").pos).toBe(6);
  });
  it("炫耀者摔倒回合不会获得风险掷骰选择", () => {
    const s = make(["sw_show_off", "twin", "banana"], [0, 10, 25], [6], {
      tripped: [true, false, false],
    });
    expect(s.pending?.kind).toBe("standup");
  });
  it("灵魂伴侣赛前目标用角色id；五格以内必定传送，超过五格不传送", () => {
    let s = testRace({
      racers: ["sw_soulmate", "twin", "banana"],
      pos: [0, 5, 20],
      rolls: [2],
      secondWindPreview: true,
    });
    expect(s.pending?.kind).toBe("soulmate");
    expect(s.pending?.options.map((o) => o.value)).toEqual(["twin", "banana"]);
    s = answer(s, "twin");
    expect(tok(s, "sw_soulmate").pos).toBe(5);
    let far = testRace({
      racers: ["sw_soulmate", "twin", "banana"],
      pos: [0, 6, 20],
      rolls: [2],
      secondWindPreview: true,
    });
    far = answer(far, "twin");
    expect(tok(far, "sw_soulmate").pos).toBe(0);
  });
  it("灵魂伴侣可以跟后方目标传送，不把传送当经过香蕉", () => {
    let s = testRace({
      racers: ["sw_soulmate", "twin", "banana"],
      pos: [5, 0, 3],
      rolls: [2],
      secondWindPreview: true,
    });
    s = answer(s, "twin");
    expect(tok(s, "sw_soulmate").pos).toBe(0);
    expect(tok(s, "sw_soulmate").tripped).toBe(false);
  });
  it("灵魂伴侣目标为巨婴时落到其身后一格", () => {
    let s = testRace({
      racers: ["sw_soulmate", "huge_baby", "twin"],
      pos: [0, 5, 20],
      rolls: [2],
      secondWindPreview: true,
    });
    s = answer(s, "huge_baby");
    expect(tok(s, "sw_soulmate").pos).toBe(4);
  });
  it("灵魂伴侣传送石头会摔倒并失去该主移动；开场选择只交本人", () => {
    let s = testRace({
      racers: ["sw_soulmate", "twin", "banana"],
      pos: [14, 18, 25],
      track: "wild",
      rolls: [2],
      secondWindPreview: true,
    });
    expect(viewForMA(s, "p2").pending?.options).toEqual([]);
    s = answer(resume(s), "twin");
    expect(s.pending?.kind).toBe("standup");
    expect(tok(s, "sw_soulmate").pos).toBe(18);
  });
  it("双胞胎在赛前复制灵魂伴侣后也选对方目标", () => {
    let s = testRace({
      racers: ["twin", "banana", "alchemist"],
      pos: [0, 5, 20],
      winners: ["sw_soulmate"],
      secondWindPreview: true,
    });
    s = answer(s, "sw_soulmate");
    expect(s.pending?.kind).toBe("soulmate");
    s = answer(s, "banana");
    expect(tok(s, "twin").pos).toBe(5);
  });
});
