import { describe, expect, it } from "vitest";
import { reduceMA, testRace } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { answer, tok } from "./helpers.ts";
import type { MAState } from "../src/types.ts";

const make = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({ racers, pos, rolls, skipSetup: true, secondWindPreview: true, ...extra });
const fx = (s: MAState, kind: string) => s.log.filter((l) => l.fx?.kind === kind);
const powers = (s: MAState, id: string) => fx(s, "power").filter((l) => l.fx?.kind === "power" && l.fx.power === id);
const modifySnapshot = (s: MAState, edit: (s: MAState) => void) => {
  const snap = JSON.parse(s.turn!.snapshot);
  edit(snap);
  s.turn!.snapshot = JSON.stringify(snap);
  return s;
};
const declineCritic = (s: MAState) => (s.pending?.kind === "critic" ? answer(s, "no") : s);

describe("Second Wind第三批5名", () => {
  it("大牌与香蕉在两个石头格永久换位起身：按规则书p23结束且不发剩余奖牌", () => {
    const s = make(["sw_diva", "banana"], [18, 26], [2], { track: "wild" });
    expect(s.phase).toBe("choose");
    expect(s.race!.over).toBe(true);
    expect(s.players.every((p) => p.chips.length === 0)).toBe(true);
    expect(s.log.some((l) => l.text.includes("强制起身循环"))).toBe(true);
  });
  it("只是当前都摔倒但下一轮能够掷骰，不判成循环", () => {
    const s = make(["sw_diva", "banana"], [17, 26], [2], { track: "wild", tripped: [true, true] });
    expect(s.phase).toBe("race");
    expect(s.race!.over).toBe(false);
    expect(s.pending?.kind).toBe("standup");
  });
  it("其他角色有自由掷骰机会时不以两名角色的石头循环结束全场", () => {
    const s = make(["sw_diva", "banana", "twin"], [18, 26, 10], [2], { track: "wild" });
    expect(s.phase).toBe("race");
    expect(s.race!.over).toBe(false);
  });
  it("大牌选中的挪挪在fire连锁中先冲线，不能再把已冲线者换回赛道", () => {
    const s = make(["sw_diva", "scoocher", "twin"], [0, 29, 10], [2]);
    expect(tok(s, "scoocher").place).toBe(1);
    expect(tok(s, "scoocher").pos).toBe(30);
    expect(tok(s, "sw_diva").pos).toBe(0);
  });
  it("倒霉狗正常：垫底主骰乘3", () => {
    const s = answer(make(["sw_blunderdog", "twin", "banana"], [0, 15, 25], [2]), "roll");
    expect(tok(s, "sw_blunderdog").pos).toBe(6);
  });
  it("倒霉狗并列垫底也乘3，非垫底则后退", () => {
    expect(tok(answer(make(["sw_blunderdog", "twin", "banana"], [5, 5, 20], [2]), "roll"), "sw_blunderdog").pos).toBe(11);
    expect(tok(answer(make(["sw_blunderdog", "twin", "banana"], [10, 5, 20], [2]), "roll"), "sw_blunderdog").pos).toBe(8);
  });
  it("倒霉狗三倍先于教练加1、黏黏怪减1", () => {
    const s = answer(make(["sw_blunderdog", "coach", "gunk", "twin"], [0, 0, 10, 20], [2]), "roll");
    expect(tok(s, "sw_blunderdog").pos).toBe(6);
  });
  it("倒霉狗和破坏者都要求后退时不抵消，三倍后退仍不越起点", () => {
    const s = answer(make(["sw_blunderdog", "sw_le_saboteur", "twin"], [10, 0, 20], [3]), "roll");
    expect(tok(s, "sw_blunderdog").pos).toBe(7);
    const last = answer(make(["sw_blunderdog", "sw_le_saboteur", "twin"], [1, 10, 20], [3]), "roll");
    expect(tok(last, "sw_blunderdog").pos).toBe(0);
  });
  it("倒霉狗最终骰才乘3，重掷旧6不触发跟班", () => {
    let s = answer(make(["sw_blunderdog", "dicemonger", "lackey"], [0, 15, 20], [6, 2]), "roll");
    s = answer(s, "dicemonger");
    expect(tok(s, "sw_blunderdog").pos).toBe(6);
    expect(tok(s, "lackey").pos).toBe(20);
  });
  it("倒霉狗摔倒回合不发动主移动能力", () => {
    const s = answer(make(["sw_blunderdog", "twin", "banana"], [0, 15, 25], [6], { tripped: [true, false, false] }), "ok");
    expect(tok(s, "sw_blunderdog").pos).toBe(0);
    expect(powers(s, "sw_blunderdog")).toHaveLength(0);
  });
  it("评论家正常：前方角色主骰由评论家玩家决定强制重掷，最多一次", () => {
    let s = answer(make(["twin", "sw_critic", "banana"], [10, 0, 25], [2, 4]), "roll");
    expect(s.pending?.kind).toBe("critic");
    expect(s.pending?.player).toBe("p2");
    expect(viewForMA(s, "p1").pending?.options).toEqual([]);
    expect(() => reduceMA(s, { type: "ANSWER", player: "p1", value: "yes" })).toThrow();
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(14);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it.each([0, 1])("评论家不管同格和自己前方之外的选手：偏移%s", (delta) => {
    const s = answer(make(["twin", "sw_critic", "banana"], [10, 10 + delta, 25], [2]), "roll");
    expect(s.pending?.kind).not.toBe("critic");
    expect(tok(s, "twin").pos).toBe(12);
  });
  it("评论家可放弃；自主重掷后仍可要求新骰重掷，但用过就不再询问", () => {
    let s = answer(make(["twin", "sw_critic", "dicemonger"], [10, 0, 25], [2, 3, 4]), "roll");
    s = answer(s, "no");
    expect(s.pending?.kind).toBe("reroll");
    s = answer(s, "dicemonger");
    expect(s.pending?.kind).toBe("critic");
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(14);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it("评论家重掷成3才触发破坏者，旧3被重掷掉则不触发", () => {
    let s = answer(make(["twin", "sw_critic", "sw_le_saboteur"], [10, 0, 25], [2, 3]), "roll");
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(7);
    let other = answer(make(["twin", "sw_critic", "sw_le_saboteur"], [10, 0, 25], [3, 2]), "roll");
    other = answer(other, "yes");
    expect(tok(other, "twin").pos).toBe(12);
  });
  it("评论家暂停恢复不重复发动，不把山寨猫误当成另一个评论家", () => {
    let s = answer(make(["twin", "sw_critic", "copycat", "banana"], [20, 10, 0, 15], [2, 3, 4]), "roll");
    // 本场领先者是当前行动的双胞胎，山寨猫没有复制评论家。
    s = answer(JSON.parse(JSON.stringify(s)), "yes");
    expect(tok(s, "twin").pos).toBe(23);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it("双胞胎复制评论家后，两名能力持有者可各要求一次重掷", () => {
    let s = testRace({
      racers: ["banana", "sw_critic", "twin"],
      pos: [20, 0, 10],
      rolls: [2, 3, 4],
      winners: ["sw_critic"],
      secondWindPreview: true,
    });
    expect(s.pending?.kind).toBe("twin");
    s = answer(s, "sw_critic");
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(s.pending?.kind).toBe("critic");
    s = answer(s, "yes");
    expect(tok(s, "banana").pos).toBe(24);
    expect(powers(s, "sw_critic")).toHaveLength(2);
  });
  it("评论家每回合一次覆盖同一玩家的两名行动者，Need重放仍去重", () => {
    let s = make(["twin", "banana", "sw_critic"], [10, 15, 0], [2, 4, 2]);
    modifySnapshot(s, (ss) => {
      ss.settings.variant = "double";
      ss.race!.tokens[1].owner = "p1";
      ss.race!.firstTurnDone = ["p1"];
    });
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(s.pending?.racer).toBe("banana");
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(tok(s, "banana").pos).toBe(17);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it("评论家不干预鼹鼠免骰主移动和水管辅助骰", () => {
    const mole = answer(make(["sw_mole", "sw_critic", "twin"], [10, 0, 25], [2]), "mole");
    expect(tok(mole, "sw_mole").pos).toBe(16);
    let hose = answer(make(["sw_the_hose", "sw_critic", "twin"], [10, 0, 25], [2, 6]), "roll");
    hose = declineCritic(hose);
    expect(hose.pending?.kind).toBe("hose");
    hose = answer(hose, "roll");
    expect(powers(hose, "sw_critic")).toHaveLength(0);
  });
  it("大牌垫底时与领先者换位，自己的摔倒状态跟着自己", () => {
    const s = make(["sw_diva", "twin", "banana"], [0, 10, 5], [2], { tripped: [true, false, false] });
    expect(tok(s, "sw_diva").pos).toBe(10);
    expect(tok(s, "twin").pos).toBe(0);
    expect(tok(s, "sw_diva").tripped).toBe(true);
    expect(tok(s, "twin").tripped).toBe(false);
    expect(s.pending?.kind).toBe("standup");
  });
  it("大牌非垫底时与垫底者换，多个并列目标由本人选id", () => {
    const s = make(["sw_diva", "twin", "banana"], [10, 0, 0], [2]);
    expect(s.pending?.kind).toBe("diva");
    expect(s.pending!.options.map((o) => o.value)).toEqual(["twin", "banana"]);
    const next = answer(s, "banana");
    expect(tok(next, "sw_diva").pos).toBe(0);
    expect(tok(next, "banana").pos).toBe(10);
    expect(next.pending?.kind).toBe("main");
  });
  it("大牌同步换位：双方先到新位置，再结算巨婴与地形，香蕉不算被经过", () => {
    const s = make(["sw_diva", "twin", "huge_baby", "banana"], [5, 20, 10, 8], [2], { track: "wild" });
    expect(tok(s, "sw_diva").pos).toBe(20);
    expect(tok(s, "twin").pos).toBe(5);
    expect(tok(s, "twin").tripped).toBe(true);
    expect(tok(s, "sw_diva").tripped).toBe(false);
  });
  it("大牌全在起点仍只交换一次，先技能卡再两条warp事件", () => {
    let s = make(["sw_diva", "twin", "banana"], [0, 0, 0], [2]);
    s = answer(s, "twin");
    expect(s.pending?.kind).toBe("main");
    expect(powers(s, "sw_diva")).toHaveLength(1);
    const p = s.log.findIndex((l) => l.fx?.kind === "power");
    expect(s.log.findIndex((l) => l.fx?.kind === "warp")).toBeGreaterThan(p);
  });
  it("速度恶魔按所属玩家全部积分加主移动，不改其他人的积分", () => {
    let s = make(["sw_speed_demon", "twin", "banana"], [0, 20, 25], [2]);
    modifySnapshot(
      s,
      (ss) =>
        (ss.players[0].chips = [
          { kind: "gold", value: 3, race: -1 },
          { kind: "bronze", value: 1, race: -1 },
        ]),
    );
    s = answer(s, "roll");
    expect(tok(s, "sw_speed_demon").pos).toBe(6);
    expect(s.players[0].chips).toHaveLength(2);
    expect(s.players[1].chips).toHaveLength(0);
  });
  it("速度恶魔领先恰好4格淘汰，3格不淘汰；已摔倒也先淘汰", () => {
    const out = make(["sw_speed_demon", "twin", "banana"], [14, 10, 5], [2], { tripped: [true, false, false] });
    expect(tok(out, "sw_speed_demon").out).toBe(true);
    const live = make(["sw_speed_demon", "twin", "banana"], [13, 10, 5], [2]);
    expect(tok(live, "sw_speed_demon").out).toBe(false);
    expect(live.pending?.kind).toBe("main");
  });
  it("速度恶魔先fire再淘汰，没有发冠军积分", () => {
    const s = make(["sw_speed_demon", "twin", "banana"], [14, 10, 5], [2]);
    const p = s.log.findIndex((l) => l.fx?.kind === "power" && l.fx.power === "sw_speed_demon");
    const o = s.log.findIndex((l) => l.fx?.kind === "out");
    expect(o).toBeGreaterThan(p);
    expect(s.players[0].chips).toEqual([]);
  });
  it("裸奔者一次经过多人共得1分，脚步事件和得分事件齐全", () => {
    const s = answer(make(["sw_streaker", "twin", "banana", "alchemist"], [0, 1, 2, 20], [4]), "roll");
    expect(s.players[0].chips).toEqual([{ kind: "bronze", value: 1, race: 0 }]);
    expect(tok(s, "sw_streaker").tripped).toBe(true);
    expect(powers(s, "sw_streaker")).toHaveLength(1);
  });
  it("裸奔者停在别人同格不算经过，后退经过暂按原行为不计分", () => {
    const tie = answer(make(["sw_streaker", "twin", "banana"], [0, 2, 20], [2]), "roll");
    expect(tie.players[0].chips).toEqual([]);
    const back = answer(make(["sw_streaker", "sw_le_saboteur", "twin"], [10, 20, 8], [3]), "roll");
    expect(tok(back, "sw_streaker").pos).toBe(7);
    expect(back.players[0].chips).toEqual([]);
  });
  it("裸奔者冲线经过也得1分，比赛结束再照旧给金牌", () => {
    let s = answer(make(["sw_streaker", "twin", "banana"], [28, 29, 10], [2, 2]), "roll");
    expect(tok(s, "sw_streaker").place).toBe(1);
    expect(s.players[0].chips.some((c) => c.kind === "bronze" && c.value === 1)).toBe(true);
    s = answer(s, "roll");
    expect(s.players[0].chips.some((c) => c.kind === "gold" && c.value === 3)).toBe(true);
    expect(s.players[0].chips.reduce((a, c) => a + c.value, 0)).toBe(4);
  });
  it("裸奔者主移动和箭头分段各经过不同角色可各得1，较真怪阻止移动则不给分", () => {
    const arrow = answer(make(["sw_streaker", "twin", "banana"], [5, 6, 8], [2], { track: "wild" }), "roll");
    expect(tok(arrow, "sw_streaker").pos).toBe(10);
    expect(arrow.players[0].chips.filter((c) => c.kind === "bronze")).toHaveLength(2);
    const blocked = answer(make(["sw_streaker", "stickler", "twin"], [28, 10, 29], [6]), "roll");
    expect(tok(blocked, "sw_streaker").pos).toBe(28);
    expect(blocked.players[0].chips).toHaveLength(0);
  });
  it.each(["sw_blunderdog", "sw_diva", "sw_speed_demon", "sw_streaker"])("山寨猫复制%s时使用同一能力实现", (id) => {
    let s = make(["copycat", id, "twin"], [0, 20, 1], [2]);
    if (id === "sw_diva") {
      expect(tok(s, "copycat").pos).toBe(20);
      expect(tok(s, id).pos).toBe(0);
      return;
    }
    if (id === "sw_speed_demon") modifySnapshot(s, (ss) => (ss.players[0].chips = [{ kind: "bronze", value: 2, race: 0 }]));
    s = answer(s, "roll");
    if (id === "sw_blunderdog") expect(tok(s, "copycat").pos).toBe(6);
    if (id === "sw_speed_demon") expect(tok(s, "copycat").pos).toBe(4);
    if (id === "sw_streaker") expect(s.players[0].chips.some((c) => c.kind === "bronze")).toBe(true);
  });
  it("山寨猫复制裸奔者后经过领先者，仍结算这段移动触发的分数", () => {
    const s = answer(make(["copycat", "sw_streaker", "twin"], [18, 20, 10], [4]), "roll");
    expect(tok(s, "copycat").pos).toBe(22);
    expect(s.players[0].chips).toEqual([{ kind: "bronze", value: 1, race: 0 }]);
    expect(powers(s, "sw_streaker")).toHaveLength(1);
  });
  it("山寨猫复制评论家时由山寨猫控制者要求重掷", () => {
    let s = answer(make(["twin", "copycat", "sw_critic"], [10, 0, 20], [2, 4]), "roll");
    expect(s.pending?.kind).toBe("critic");
    expect(s.pending?.player).toBe("p2");
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(14);
    expect(powers(s, "sw_critic")).toHaveLength(1);
  });
  it("倒霉狗仍触发香蕉、巨婴与狂野地形，三倍不重复用于箭头", () => {
    const banana = answer(make(["sw_blunderdog", "banana", "twin"], [0, 3, 20], [2]), "roll");
    expect(tok(banana, "sw_blunderdog").tripped).toBe(true);
    const baby = answer(make(["sw_blunderdog", "huge_baby", "twin"], [0, 6, 20], [2]), "roll");
    expect(tok(baby, "sw_blunderdog").pos).toBe(5);
    const arrow = answer(make(["sw_blunderdog", "twin", "banana"], [1, 20, 25], [2], { track: "wild" }), "roll");
    expect(tok(arrow, "sw_blunderdog").pos).toBe(10);
    const stone = answer(make(["sw_blunderdog", "twin", "banana"], [2, 20, 25], [1], { track: "wild" }), "roll");
    expect(tok(stone, "sw_blunderdog").pos).toBe(5);
    expect(tok(stone, "sw_blunderdog").tripped).toBe(true);
  });
  it("倒霉狗反向也能由吸盘鱼同时跟随，不触发浪漫者", () => {
    let s = answer(make(["sw_blunderdog", "suckerfish", "twin", "romantic"], [10, 10, 0, 25], [2]), "roll");
    expect(s.pending?.kind).toBe("suckerfish");
    s = answer(s, "yes");
    expect(tok(s, "sw_blunderdog").pos).toBe(8);
    expect(tok(s, "suckerfish").pos).toBe(8);
    expect(tok(s, "romantic").pos).toBe(25);
  });
  it("倒霉狗三倍走过头仍被较真怪阻止，发动技能可让挪挪走一步", () => {
    const s = answer(make(["sw_blunderdog", "stickler", "twin", "scoocher"], [26, 28, 29, 27], [2]), "roll");
    expect(tok(s, "sw_blunderdog").pos).toBe(26);
    expect(tok(s, "scoocher").pos).toBeGreaterThan(27);
  });
  it("评论家发动让挪挪移动，只有重掷后的最终6才让跟班移动", () => {
    let s = answer(make(["twin", "sw_critic", "scoocher", "lackey"], [10, 0, 5, 20], [6, 2]), "roll");
    s = answer(s, "yes");
    expect(tok(s, "scoocher").pos).toBe(6);
    expect(tok(s, "lackey").pos).toBe(20);
  });
  it("评论家允许伊卡洛斯把6重掷成2免于淘汰", () => {
    let s = answer(make(["sw_icarus", "sw_critic", "twin"], [10, 0, 25], [6, 2]), "roll");
    s = answer(s, "yes");
    expect(tok(s, "sw_icarus").out).toBe(false);
    expect(tok(s, "sw_icarus").pos).toBe(15);
  });
  it("大牌换位不搭载吸盘鱼，同时到达不触发浪漫者", () => {
    const s = make(["sw_diva", "twin", "suckerfish", "romantic"], [0, 10, 0, 0], [2]);
    expect(tok(s, "sw_diva").pos).toBe(10);
    expect(tok(s, "suckerfish").pos).toBe(0);
    expect(tok(s, "romantic").pos).toBe(0);
    expect(s.pending?.kind).toBe("main");
  });
  it("大牌先fire让挪挪移动，再交换当时位置；巨婴仍按落地结果调整", () => {
    const scooch = make(["sw_diva", "scoocher", "twin"], [0, 10, 5], [2]);
    expect(tok(scooch, "sw_diva").pos).toBe(11);
    expect(tok(scooch, "scoocher").pos).toBe(0);
    let baby = make(["sw_diva", "twin", "huge_baby"], [5, 20, 20], [2]);
    baby = answer(baby, "twin");
    expect(tok(baby, "sw_diva").pos).toBe(19);
    expect(tok(baby, "twin").pos).toBe(5);
  });
  it("速度恶魔检查起始领先距离，不被随后挪挪的蹭步取消淘汰", () => {
    const s = make(["sw_speed_demon", "scoocher", "twin"], [14, 10, 5], [2]);
    expect(tok(s, "sw_speed_demon").out).toBe(true);
    expect(tok(s, "scoocher").pos).toBe(11);
  });
  it("速度恶魔积分加成只用于主移动；较真怪阻止超出终点", () => {
    let arrow = make(["sw_speed_demon", "twin", "banana"], [0, 20, 25], [4], { track: "wild" });
    modifySnapshot(arrow, (ss) => (ss.players[0].chips = [{ kind: "bronze", value: 3, race: 0 }]));
    arrow = answer(arrow, "roll");
    expect(tok(arrow, "sw_speed_demon").pos).toBe(10);
    let blocked = make(["sw_speed_demon", "stickler", "twin"], [26, 28, 29], [2]);
    modifySnapshot(blocked, (ss) => (ss.players[0].chips = [{ kind: "bronze", value: 4, race: 0 }]));
    blocked = answer(blocked, "roll");
    expect(tok(blocked, "sw_speed_demon").pos).toBe(26);
  });
  it("速度恶魔不把已经淘汰的角色当作落后对象，独自在场不因空集合淘汰", () => {
    let s = make(["sw_speed_demon", "twin", "banana"], [0, 20, 25], [2]);
    modifySnapshot(s, (ss) => {
      ss.race!.tokens[1].out = true;
      ss.race!.tokens[2].out = true;
    });
    s = answer(s, "roll");
    expect(tok(s, "sw_speed_demon").out).toBe(false);
    expect(tok(s, "sw_speed_demon").pos).toBe(2);
  });
  it("裸奔者与吸盘鱼同时经过，得分与挪挪蹭步在暂停恢复后不重复", () => {
    let s = answer(make(["sw_streaker", "suckerfish", "twin", "scoocher"], [0, 0, 1, 20], [2, 2]), "roll");
    expect(s.pending?.kind).toBe("suckerfish");
    s = answer(s, "yes");
    expect(s.players[0].chips).toHaveLength(1);
    expect(tok(s, "scoocher").pos).toBe(22);
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(s.players[0].chips).toHaveLength(1);
  });
  it("裸奔者被巨婴放回后没有实际经过则不得分，同格派对咖不改通过判定", () => {
    const s = answer(make(["sw_streaker", "huge_baby", "party_animal"], [0, 2, 1], [2]), "roll");
    expect(tok(s, "sw_streaker").pos).toBe(1);
    expect(s.players[0].chips).toEqual([]);
  });
});
