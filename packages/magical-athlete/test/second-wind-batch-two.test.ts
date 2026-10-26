import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";
import type { MAState } from "../src/types.ts";

const make = (racers: string[], pos: number[], rolls: number[], extra = {}) =>
  testRace({ racers, pos, rolls, skipSetup: true, secondWindPreview: true, ...extra });
const power = (s: MAState, id: string) => s.log.filter((l) => l.fx?.kind === "power" && l.fx.power === id);
const until = (s: MAState, kind: string, choice = "no") => {
  for (let i = 0; i < 40 && s.pending?.kind !== kind; i++)
    s = answer(s, s.pending?.options.some((o) => o.value === choice) ? choice : s.pending?.options[0].value);
  expect(s.pending?.kind).toBe(kind);
  return s;
};

describe("Second Wind第二批：5名走现有引擎", () => {
  it("鼹鼠正常：远离其他人可免骰主移动6，不触发跟班的6点反应", () => {
    const s = answer(make(["sw_mole", "lackey", "twin"], [0, 10, 20], [6]), "mole");
    expect(tok(s, "sw_mole").pos).toBe(6);
    expect(tok(s, "lackey").pos).toBe(10);
    expect(s.log.some((l) => l.fx?.kind === "roll")).toBe(false);
    expect(s.log.some((l) => l.fx?.kind === "move" && l.fx.why === "挖地直行")).toBe(true);
  });
  it.each([0, 1, -1])("鼹鼠边界：距离%s格有选手时不能免骰", (delta) => {
    const s = make(["sw_mole", "twin", "banana"], [10, 10 + delta, 25], [2]);
    expect(s.pending!.options.map((o) => o.value)).not.toContain("mole");
    expect(tok(answer(s, "roll"), "sw_mole").pos).toBe(12);
  });
  it("鼹鼠摔倒时不能用免骰绕过起身", () => {
    const s = make(["sw_mole", "twin", "banana"], [0, 10, 20], [6], { tripped: [true, false, false] });
    expect(s.pending?.kind).toBe("standup");
    expect(tok(answer(s, "ok"), "sw_mole").pos).toBe(0);
  });
  it("鼹鼠互动：仍受黏黏怪修正", () => {
    const s = answer(make(["sw_mole", "gunk", "twin"], [0, 10, 20], [2]), "mole");
    expect(tok(s, "sw_mole").pos).toBe(5);
  });
  it("尾巴正常：选择前方最近选手，传送到其身后一格", () => {
    const s = make(["sw_tail", "twin", "banana"], [0, 10, 20], [2]);
    expect(s.pending?.kind).toBe("tail");
    expect(s.pending!.options.map((o) => o.value)).toEqual(["twin", "no"]);
    const next = answer(s, "twin");
    expect(tok(next, "sw_tail").pos).toBe(9);
    expect(next.pending?.kind).toBe("main");
  });
  it("尾巴边界：无前方对象不询问，同格不算前方", () => {
    const s = make(["sw_tail", "twin", "banana"], [10, 10, 5], [2]);
    expect(s.pending?.kind).toBe("main");
  });
  it("尾巴并列对象用角色id，允许放弃", () => {
    const s = make(["sw_tail", "twin", "banana"], [0, 10, 10], [2]);
    expect(s.pending!.options.map((o) => o.value)).toEqual(["twin", "banana", "no"]);
    expect(tok(answer(s, "no"), "sw_tail").pos).toBe(0);
  });
  it("尾巴互动：瞬移经过香蕉不摔倒，落地石头仍摔倒", () => {
    const s = answer(make(["sw_tail", "banana", "twin"], [0, 3, 6], [2], { track: "wild" }), "banana");
    expect(tok(s, "sw_tail").pos).toBe(2);
    expect(tok(s, "sw_tail").tripped).toBe(false);
    const stone = answer(make(["sw_tail", "twin", "banana"], [0, 6, 20], [2], { track: "wild" }), "twin");
    expect(tok(stone, "sw_tail").pos).toBe(5);
    expect(tok(stone, "sw_tail").tripped).toBe(true);
    expect(stone.pending?.kind).toBe("standup");
  });
  it("跳蛙正常：主移动后身前一格有选手，则额外回合", () => {
    const s = answer(make(["sw_hopfrog", "twin", "banana"], [0, 3, 20], [2]), "roll");
    expect(s.race!.current).toBe("p1");
    expect(s.pending?.racer).toBe("sw_hopfrog");
    expect(power(s, "sw_hopfrog")).toHaveLength(1);
  });
  it("跳蛙边界：多人在前一格只给一次，距离2不触发", () => {
    const s = answer(make(["sw_hopfrog", "twin", "banana"], [0, 3, 3], [2]), "roll");
    expect(power(s, "sw_hopfrog")).toHaveLength(1);
    const far = answer(make(["sw_hopfrog", "twin", "banana"], [0, 4, 20], [2]), "roll");
    expect(power(far, "sw_hopfrog")).toHaveLength(0);
  });
  it("跳蛙互动：摔倒回合起身后仍可获得额外回合", () => {
    const s = answer(make(["sw_hopfrog", "twin", "banana"], [2, 3, 20], [2], { tripped: [true, false, false] }), "ok");
    expect(s.race!.current).toBe("p1");
    expect(s.pending?.kind).toBe("main");
  });
  it("水管正常：末尾辅助骰只绊倒前方范围内，先技能卡再骰子再摔倒", () => {
    let s = answer(make(["sw_the_hose", "twin", "banana", "alchemist"], [0, 3, 5, 0], [2, 2]), "roll");
    expect(s.pending?.kind).toBe("hose");
    s = answer(s, "roll");
    expect(tok(s, "twin").tripped).toBe(true);
    expect(tok(s, "banana").tripped).toBe(false);
    expect(tok(s, "alchemist").tripped).toBe(false);
    const p = s.log.findIndex((l) => l.fx?.kind === "power" && l.fx.power === "sw_the_hose");
    const r = s.log.findIndex((l, i) => i > p && l.fx?.kind === "roll");
    const t = s.log.findIndex((l) => l.fx?.kind === "trip");
    expect(r).toBeGreaterThan(p);
    expect(t).toBeGreaterThan(r);
  });
  it("水管边界：前方恰好点数格包括，自己同格和身后不包括", () => {
    let s = answer(make(["sw_the_hose", "twin", "banana", "alchemist"], [5, 10, 8, 7], [2, 3]), "roll");
    s = answer(s, "roll");
    expect(tok(s, "twin").tripped).toBe(true);
    expect(tok(s, "banana").tripped).toBe(true);
    expect(tok(s, "alchemist").tripped).toBe(false);
  });
  it("水管辅助6不触发跟班主移动6的反应，摔倒也有回合末技能", () => {
    let s = answer(make(["sw_the_hose", "lackey", "twin"], [0, 8, 20], [6], { tripped: [true, false, false] }), "ok");
    expect(s.pending?.kind).toBe("hose");
    s = answer(s, "roll");
    expect(tok(s, "lackey").pos).toBe(8);
  });
  it("破坏者正常：其他选手最终骰3主移动反向，自己的3正常", () => {
    const s = answer(make(["twin", "sw_le_saboteur", "banana"], [10, 20, 25], [3]), "roll");
    expect(tok(s, "twin").pos).toBe(7);
    const self = answer(make(["sw_le_saboteur", "twin", "banana"], [10, 20, 25], [3]), "roll");
    expect(tok(self, "sw_le_saboteur").pos).toBe(13);
  });
  it("破坏者边界：后退不越过起点；重掷3成2不会倒退", () => {
    expect(tok(answer(make(["twin", "sw_le_saboteur", "banana"], [1, 20, 25], [3]), "roll"), "twin").pos).toBe(0);
    let s = answer(make(["twin", "sw_le_saboteur", "dicemonger"], [10, 20, 25], [3, 2]), "roll");
    s = answer(s, "dicemonger");
    expect(tok(s, "twin").pos).toBe(12);
    expect(power(s, "sw_le_saboteur")).toHaveLength(0);
  });
  it("破坏者只反向修正后的主移动，箭头额外移动仍按地形方向", () => {
    const s = answer(make(["sw_overtaker", "sw_le_saboteur", "banana"], [10, 20, 25], [3], { track: "wild" }), "roll");
    expect(tok(s, "sw_overtaker").pos).toBe(5);
    expect(tok(s, "sw_overtaker").tripped).toBe(true);
    const arrow = answer(make(["twin", "sw_le_saboteur", "banana"], [10, 20, 25], [3], { track: "wild" }), "roll");
    expect(tok(arrow, "twin").pos).toBe(10);
    expect(arrow.log.some((l) => l.fx?.kind === "move" && l.fx.from === 7 && l.fx.to === 10 && l.fx.why === "箭头")).toBe(true);
  });
  it("鼹鼠免骰6不被破坏者当成主骰反向", () => {
    const s = answer(make(["sw_mole", "sw_le_saboteur", "twin"], [10, 20, 25], [3]), "mole");
    expect(tok(s, "sw_mole").pos).toBe(16);
  });
  it.each(["sw_mole", "sw_tail", "sw_hopfrog", "sw_the_hose", "sw_le_saboteur"])(
    "%s 可被山寨猫复制，且不会增加额外玩家或修改控制权",
    (id) => {
      let s = make(["copycat", id, "twin"], [0, 20, 10], [2, 2]);
      if (id === "sw_tail") s = answer(s, "twin");
      s = answer(s, id === "sw_mole" ? "mole" : "roll");
      if (id === "sw_the_hose") s = answer(s, "roll");
      expect(s.players).toHaveLength(3);
      expect(tok(s, "copycat").owner).toBe("p1");
      if (id === "sw_mole") expect(tok(s, "copycat").pos).toBe(6);
      if (id === "sw_tail") expect(tok(s, "copycat").pos).toBe(11);
    },
  );
  it("鼹鼠经过香蕉照常摔倒；石头/箭头仍使用既有地形", () => {
    const banana = answer(make(["sw_mole", "banana", "twin"], [0, 3, 20], [2]), "mole");
    expect(tok(banana, "sw_mole").tripped).toBe(true);
    const arrow = answer(make(["sw_mole", "twin", "banana"], [1, 20, 25], [2], { track: "wild" }), "mole");
    expect(tok(arrow, "sw_mole").pos).toBe(10);
    const rock = answer(make(["sw_mole", "twin", "banana"], [12, 25, 28], [2], { track: "wild" }), "mole");
    expect(tok(rock, "sw_mole").pos).toBe(18);
    expect(tok(rock, "sw_mole").tripped).toBe(true);
  });
  it("鼹鼠的免骰主移动仍被较真怪阻止超出终点", () => {
    const s = answer(make(["sw_mole", "stickler", "twin"], [26, 10, 15], [2]), "mole");
    expect(tok(s, "sw_mole").pos).toBe(26);
    expect(tok(s, "sw_mole").place).toBeNull();
  });
  it("鼹鼠落到巨婴格时由原有放置结算退一格", () => {
    const s = answer(make(["sw_mole", "huge_baby", "twin"], [0, 6, 20], [2]), "mole");
    expect(tok(s, "sw_mole").pos).toBe(5);
  });
  it("鼹鼠与吸盘鱼同格时不能免骰；普通主移动可一起到达", () => {
    let s = make(["sw_mole", "suckerfish", "romantic"], [0, 0, 20], [2]);
    expect(s.pending!.options.map((o) => o.value)).not.toContain("mole");
    s = answer(s, "roll");
    expect(s.pending?.kind).toBe("suckerfish");
    s = answer(s, "yes");
    expect(tok(s, "sw_mole").pos).toBe(2);
    expect(tok(s, "suckerfish").pos).toBe(2);
    expect(tok(s, "romantic").pos).toBe(20);
  });
  it("尾巴的技能先让挪挪走一步，然后按其现位置落在身后一格；重放不重复", () => {
    let s = answer(make(["sw_tail", "scoocher", "twin"], [0, 10, 20], [2]), "scoocher");
    expect(tok(s, "scoocher").pos).toBe(11);
    expect(tok(s, "sw_tail").pos).toBe(10);
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(tok(s, "scoocher").pos).toBe(11);
  });
  it("尾巴落点已有巨婴时照常后移，瞬移不搭载同格吸盘鱼", () => {
    const s = answer(make(["sw_tail", "huge_baby", "twin", "suckerfish"], [0, 9, 10, 0], [2]), "huge_baby");
    expect(tok(s, "sw_tail").pos).toBe(8);
    expect(tok(s, "suckerfish").pos).toBe(0);
  });
  it("跳蛙的额外回合只在地形与巨婴放置完成后判断", () => {
    const s = answer(make(["sw_hopfrog", "huge_baby", "twin"], [0, 2, 20], [2]), "roll");
    expect(tok(s, "sw_hopfrog").pos).toBe(1);
    expect(power(s, "sw_hopfrog")).toHaveLength(1);
    const arrow = answer(make(["sw_hopfrog", "twin", "banana"], [5, 11, 25], [2], { track: "wild" }), "roll");
    expect(tok(arrow, "sw_hopfrog").pos).toBe(10);
    expect(power(arrow, "sw_hopfrog")).toHaveLength(1);
  });
  it("跳蛙触发后挪挪移动，下一回合不会重复旧事件", () => {
    let s = answer(make(["sw_hopfrog", "twin", "scoocher"], [0, 3, 20], [2, 2]), "roll");
    expect(tok(s, "scoocher").pos).toBe(21);
    s = answer(JSON.parse(JSON.stringify(s)), "roll");
    expect(tok(s, "scoocher").pos).toBe(21);
  });
  it("水管和挪挪：先结算技能蹭步，再按当时距离判断冲洗；没有重复绊倒", () => {
    let s = answer(make(["sw_the_hose", "scoocher", "twin"], [0, 4, 20], [2, 2]), "roll");
    s = answer(s, "roll");
    expect(tok(s, "scoocher").pos).toBe(5);
    expect(tok(s, "scoocher").tripped).toBe(false);
    expect(power(s, "sw_the_hose")).toHaveLength(1);
  });
  it("水管同时绊倒多人不移动他们，也不触发吸盘鱼跟随", () => {
    let s = answer(make(["sw_the_hose", "suckerfish", "party_animal", "huge_baby"], [0, 4, 5, 6], [2, 6]), "roll");
    s = answer(s, "roll");
    for (const id of ["suckerfish", "party_animal", "huge_baby"]) expect(tok(s, id).tripped).toBe(true);
    expect(tok(s, "suckerfish").pos).toBe(4);
    expect(tok(s, "party_animal").pos).toBe(5);
    expect(s.pending?.kind).not.toBe("suckerfish");
  });
  it("破坏者被山寨猫复制时，两名能力持有者都能对别人的3触发，但不会反向两次", () => {
    const s = answer(make(["twin", "copycat", "sw_le_saboteur"], [10, 15, 20], [3]), "roll");
    expect(tok(s, "twin").pos).toBe(7);
    expect(power(s, "sw_le_saboteur")).toHaveLength(2);
  });
  it("破坏者反向后仍能由吸盘鱼一起移动，按旧版同时到达规则结算", () => {
    let s = answer(make(["twin", "suckerfish", "sw_le_saboteur", "romantic"], [10, 10, 20, 25], [3]), "roll");
    expect(s.pending?.kind).toBe("suckerfish");
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(7);
    expect(tok(s, "suckerfish").pos).toBe(7);
    expect(tok(s, "romantic").pos).toBe(25);
  });
  it("破坏者触发挪挪蹭步；后退仍遵循现有香蕉经过定义，不改基础规则", () => {
    const s = answer(make(["twin", "sw_le_saboteur", "scoocher", "banana"], [10, 20, 25, 8], [3]), "roll");
    expect(tok(s, "scoocher").pos).toBe(26);
    expect(tok(s, "twin").pos).toBe(7);
    expect(tok(s, "twin").tripped).toBe(false);
  });
});
