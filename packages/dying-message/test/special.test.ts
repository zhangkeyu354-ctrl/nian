import { describe, it, expect } from "vitest";
import {
  createDM,
  reduceDM,
  viewDM,
  actorsDM,
  defaultPool,
  validatePool,
  type DMState,
} from "../src/index.ts";
const cards = Array.from({ length: 153 }, (_, i) => "DM" + i),
  players = Array.from({ length: 10 }, (_, i) => ({
    id: "p" + i,
    name: "朋友" + i,
  }));
function setup(names: string[]) {
  const s = createDM(players, cards, 50);
  names.forEach((r, i) => (s.players[i].roleId = r));
  s.phase =
    names.includes("soulmate") || names.includes("wonder-dog")
      ? "NIGHT_PREPARATION"
      : "KILLER_SELECTION";
  return s;
}
const act = (s: DMState, id: string, type: string, data: object = {}) =>
  reduceDM(s, id, { type, ...data }, 1000);
function kill(s: DMState, targets: string[]) {
  for (const id of actorsDM(s)) s = act(s, id, "KILL", { targets });
  return s;
}
// 房规：真遗言按死者分组依次选择；每组成员提交相同的牌
function truth(s: DMState) {
  while (s.phase === "VICTIM_EVIDENCE") {
    const group = actorsDM(s);
    const v = viewDM(s, group[0]);
    const ids = v.pool.slice(0, v.required);
    for (const id of group) s = act(s, id, "TRUE", { cards: ids });
  }
  return s;
}
describe("special roles and roundtable timing", () => {
  it.each([4, 5, 6, 7, 8, 9, 10])("validates %i player allocation", (n) => {
    const pool = defaultPool(n);
    expect(() => validatePool(pool, n)).not.toThrow();
    expect(pool.filter((p) => p === "killer")).toHaveLength(n >= 8 ? 2 : 1);
  });
  it("rejects a client assigning a non-standard killing ratio", () =>
    expect(() =>
      validatePool(["killer", "killer", "civilian", "civilian"], 4),
    ).toThrow());
  it("private detective and mastermind see true evidence sequentially, no one else does", () => {
    let s = setup(["killer", "private-detective", "mastermind"]);
    s = kill(s, ["p3"]);
    s = truth(s);
    expect(actorsDM(s)).toEqual(["p1"]);
    expect(viewDM(s, "p1").trueCards).toHaveLength(1);
    expect(viewDM(s, "p2").trueCards).toEqual([]);
    s = act(s, "p1", "INFO_ACK");
    expect(actorsDM(s)).toEqual(["p2"]);
    s = act(s, "p2", "INFO_ACK");
    expect(s.phase).toBe("KILLER_FAKE_EVIDENCE");
  });
  it("professional bonus is global and two nobles stack; serial killer expands victims", () => {
    let s = setup([
      "killer",
      "professional-killer",
      "serial-killer",
      "noble",
      "noble",
    ]);
    s = kill(s, ["p3", "p4"]);
    // 房规：两名贵族各自一组、各选 2 张，按被杀顺序
    expect(actorsDM(s)).toEqual(["p3"]);
    expect(viewDM(s, "p3").required).toBe(2);
    expect(viewDM(s, "p3").evidenceTurn).toMatchObject({ step: 1, total: 2 });
    s = truth(s);
    expect(s.truth).toHaveLength(4);
    expect(viewDM(s, "p0").required).toBe(3);
  });
  it("two celebrity deaths reduce fake evidence to zero without a deadlock", () => {
    let s = setup(["killer", "serial-killer", "celebrity", "celebrity"]);
    s = truth(kill(s, ["p2", "p3"]));
    expect(s.phase).toBe("INVESTIGATION");
    expect(s.history[0].cards).toHaveLength(2);
  });
  it("dog rejects self or other dog protection and prevents direct murder, not chained death", () => {
    let s = setup(["killer", "wonder-dog", "wonder-dog"]);
    expect(() => act(s, "p1", "PREPARE", { target: "p1" })).toThrow();
    expect(() => act(s, "p1", "PREPARE", { target: "p2" })).toThrow();
    s = act(s, "p1", "PREPARE", { target: "p3" });
    s = act(s, "p2", "PREPARE", { target: "p4" });
    expect(() => kill(s, ["p3"])).toThrow();
    expect(viewDM(s, "p0").legalTargets).not.toContain("p3");
  });
  it("soulmate notifies target without exposing selector and links deaths once", () => {
    let s = setup(["killer", "soulmate", "civilian"]);
    s = act(s, "p1", "PREPARE", { target: "p2" });
    expect(viewDM(s, "p2").me.fated).toBe(true);
    expect(viewDM(s, "p2").players[1].roleId).toBeUndefined();
    s = kill(s, ["p2"]);
    expect(s.nightVictims.sort()).toEqual(["p1", "p2"]);
    expect(s.deaths).toHaveLength(2);
    expect(s.players[1].alive).toBe(false);
    // 房规：灵魂伴侣连带死亡者不选遗言，也看不到杀手
    expect(actorsDM(s)).toEqual(["p2"]);
    expect(viewDM(s, "p1").killers).toEqual([]);
    expect(viewDM(s, "p2").killers.map((k) => k.id)).toEqual(["p0"]);
  });
  it("hostage kills nearest living neighbors and does not trigger directly-murdered noble effect", () => {
    let s = setup(["killer", "civilian", "noble", "hostage", "civilian"]);
    s.players[4].alive = false;
    s = kill(s, ["p3"]);
    expect(s.nightVictims.sort()).toEqual(["p2", "p3", "p5"]);
    expect(viewDM(s, "p3").required).toBe(1);
    expect(s.deaths).toHaveLength(3);
    // 人质与连带邻座同组一起选 1 张（原版）
    expect(actorsDM(s).sort()).toEqual(["p2", "p3", "p5"]);
  });
  it("janitor can use discard evidence; everyone must agree to joint evidence", () => {
    let s = setup(["killer", "serial-killer", "janitor"]);
    s.discard = ["old"];
    s = kill(s, ["p2", "p3"]);
    // 清扫员（第一位死者）可从弃牌堆选；第二位死者不能，也不能重复
    expect(actorsDM(s)).toEqual(["p2"]);
    expect(viewDM(s, "p2").pool).toContain("old");
    s = act(s, "p2", "TRUE", { cards: ["old"] });
    expect(s.phase).toBe("VICTIM_EVIDENCE");
    expect(actorsDM(s)).toEqual(["p3"]);
    expect(viewDM(s, "p3").pool).not.toContain("old");
    expect(() => act(s, "p3", "TRUE", { cards: ["old"] })).toThrow();
    s = act(s, "p3", "TRUE", { cards: [s.pool[0]] });
    expect(s.truth).toEqual(["old", s.history.at(-1)?.truth[1] ?? s.truth[1]]);
    expect(s.truth).toHaveLength(2);
  });
  it("forensic reveals exactly one card from previous round and pauses speech until resolved", () => {
    let s = setup(["killer", "forensic-scientist"]);
    s.round = 2;
    s.history = [
      {
        round: 1,
        victims: ["p9"],
        cards: ["a", "b"],
        truth: ["a"],
        revealed: {},
      },
    ];
    s.players[9].alive = false;
    s = kill(s, ["p1"]);
    s = truth(s);
    s = act(s, "p0", "FAKE", {
      cards: s.pool.filter((x) => !s.truth.includes(x)).slice(0, 2),
    });
    expect(s.deadline).toBeNull();
    expect(() => act(s, "p1", "FORENSIC", { card: s.truth[0] })).toThrow();
    s = act(s, "p1", "FORENSIC", { card: "a" });
    expect(s.history[0].revealed).toEqual({ a: true });
    expect(s.deadline).toBe(301000);
  });
  it("two muay thai stack two skipped nights, and unused pool goes to discard", () => {
    let s = setup(["killer", "serial-killer", "muay-thai", "muay-thai"]);
    s = kill(s, ["p2", "p3"]);
    expect(s.skipNights).toBe(2);
    s = truth(s);
    const fake = s.pool.filter((x) => !s.truth.includes(x)).slice(0, 2);
    for (const id of ["p0", "p1"]) s = act(s, id, "FAKE", { cards: fake });
    s.phase = "ROUND_END";
    const old = s.pool.slice();
    s = act(s, "p0", "NEXT");
    expect(s.phase).toBe("INVESTIGATION");
    expect(s.skipNights).toBe(1);
    expect(s.discard).toEqual(expect.arrayContaining(old));
    s.phase = "ROUND_END";
    s = act(s, "p0", "NEXT");
    expect(s.skipNights).toBe(0);
    expect(s.phase).toBe("INVESTIGATION");
  });
  it("only current living speaker can finish; 5min timeout advances and voting waits all speakers", () => {
    let s = setup(["killer"]);
    s = truth(kill(s, ["p1"]));
    s = act(s, "p0", "FAKE", { cards: s.pool.slice(1, 3) });
    expect(s.speaker).toBe("p0");
    expect(() => act(s, "p2", "SPEAK_END")).toThrow();
    expect(() => act(s, "p0", "VOTE_START")).toThrow();
    expect(() =>
      reduceDM(s, "p0", { type: "SPEAK_TIMEOUT" }, s.deadline! - 1),
    ).toThrow();
    s = reduceDM(s, "p0", { type: "SPEAK_TIMEOUT" }, s.deadline!);
    expect(s.speaker).toBe("p2");
    for (const p of s.players.filter((p) => p.alive && p.id !== "p0"))
      s = act(s, p.id, "SPEAK_END");
    expect(s.phase).toBe("FIRST_VOTE");
  });
  it("public snapshots never reveal murderer identities or true-card provenance during the night", () => {
    let s = setup(["killer"]);
    s = kill(s, ["p1"]);
    expect(viewDM(s, "p2").players[1].alive).toBe(true);
    expect(viewDM(s, "p2").killers).toEqual([]);
    expect(viewDM(s, "p1").killers[0].id).toBe("p0");
    s = truth(s);
    const plain = JSON.stringify(viewDM(s, "p2"));
    expect(plain).not.toContain('"truth"');
    expect(viewDM(s, "p2").players.filter((p) => p.roleId)).toHaveLength(1);
  });
  it("serial killer: each victim picks in kill order; killers and multi-victims can chat 2 lines", () => {
    let s = setup(["killer", "serial-killer", "civilian", "civilian", "hostage"]);
    // 杀手对话：每人每阶段 2 句，超出被拒；非杀手不能说
    s = act(s, "p0", "CHAT", { text: "  选三号吧  " });
    s = act(s, "p0", "CHAT", { text: "x".repeat(40) });
    expect(() => act(s, "p0", "CHAT", { text: "第三句" })).toThrow();
    expect(() => act(s, "p2", "CHAT", { text: "我不是杀手" })).toThrow();
    expect(viewDM(s, "p1").chat?.messages).toEqual([
      { from: "p0", text: "选三号吧" },
      { from: "p0", text: "x".repeat(20) },
    ]);
    expect(viewDM(s, "p0").chat?.left).toBe(0);
    expect(viewDM(s, "p2").chat).toBeNull();
    // 最后提交者的顺序：p3 先、p2 后
    s = act(s, "p0", "KILL", { targets: ["p2", "p3"] });
    s = act(s, "p1", "KILL", { targets: ["p3", "p2"] });
    expect(actorsDM(s)).toEqual(["p3"]);
    expect(viewDM(s, "p3").chat).toBeNull(); // 单人组没有对话框
    const first = s.pool[0];
    s = act(s, "p3", "TRUE", { cards: [first] });
    expect(actorsDM(s)).toEqual(["p2"]);
    expect(viewDM(s, "p2").pool).not.toContain(first);
    s = act(s, "p2", "TRUE", { cards: [s.pool[1]] });
    expect(s.truth).toHaveLength(2);
    expect(s.phase).toBe("KILLER_FAKE_EVIDENCE");
    // 新阶段对话额度重置
    expect(viewDM(s, "p0").chat?.left).toBe(2);
  });
  it("hostage group with two members can chat; killer chained by hostage joins hostage group", () => {
    let s = setup(["killer", "civilian", "hostage", "civilian"]);
    s.players.slice(4).forEach((p) => (p.alive = false));
    s = kill(s, ["p2"]);
    expect(actorsDM(s).sort()).toEqual(["p1", "p2", "p3"]);
    s = act(s, "p1", "CHAT", { text: "选有猫的" });
    expect(viewDM(s, "p3").chat?.messages).toHaveLength(1);
  });
});
