import { describe, expect, it } from "vitest";
import {
  CHINESE_WORDS,
  clueProblem,
  createCNGame,
  reduceCN,
  remaining,
  viewForCN,
  type CNCommand,
  type CNState,
  type Team,
} from "../src/index.ts";

const T0 = 1_000_000;
const players = [
  { id: "r1", name: "红队长", team: "red" as Team },
  { id: "r2", name: "红二", team: "red" as Team },
  { id: "r3", name: "红三", team: "red" as Team },
  { id: "b1", name: "蓝队长", team: "blue" as Team },
  { id: "b2", name: "蓝二", team: "blue" as Team },
];
const game = (seed = 7) =>
  createCNGame({ players, captains: { red: "r1", blue: "b1" }, words: CHINESE_WORDS, seed, now: T0 });
const cap = (s: CNState) => s.captains[s.turn];
const op = (s: CNState) => s.operators[s.turn];
/** 某队未翻开的某类牌的序号 */
const idx = (s: CNState, role: string) => s.cards.findIndex((c) => !c.revealed && c.role === role);
/** 一个合法线索（不在桌面上） */
const CLUE = "联想";
const clue = (s: CNState, n: number | "inf", at = T0 + 1000) =>
  reduceCN(s, { type: "GIVE_CLUE", player: cap(s), at, word: CLUE, number: n });
const reveal = (s: CNState, role: string, at = T0 + 2000) =>
  reduceCN(s, { type: "REVEAL", player: op(s), at, index: idx(s, role) });

describe("开局（R03–R05）", () => {
  it("25 张、9/8/7/1、先手拿 9 张", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = game(seed);
      expect(s.cards).toHaveLength(25);
      expect(new Set(s.cards.map((c) => c.word)).size).toBe(25);
      const count = (r: string) => s.cards.filter((c) => c.role === r).length;
      expect(count(s.first)).toBe(9);
      expect(count(s.first === "red" ? "blue" : "red")).toBe(8);
      expect(count("neutral")).toBe(7);
      expect(count("assassin")).toBe(1);
      expect(s.turn).toBe(s.first);
      expect(s.phase).toBe("clue");
      expect(s.deadline).toBe(T0 + 60_000);
      // 没有互相包含的词
      for (const a of s.cards) for (const b of s.cards) if (a !== b) expect(a.word.includes(b.word)).toBe(false);
    }
  });
  it("先手红蓝都会出现（随机）", () => {
    const firsts = new Set(Array.from({ length: 50 }, (_, i) => game(i + 1).first));
    expect(firsts.size).toBe(2);
  });
  it("同一种子可复现", () => {
    expect(game(42)).toEqual(game(42));
  });
  it("词库 ≥ 500 且不重复", () => {
    expect(CHINESE_WORDS.length).toBeGreaterThanOrEqual(500);
    expect(new Set(CHINESE_WORDS).size).toBe(CHINESE_WORDS.length);
  });
});

describe("队长分配（R02）", () => {
  it("自选队长：使用给定的人", () => {
    const s = game();
    expect(s.captains).toEqual({ red: "r1", blue: "b1" });
    expect(s.operators.red).not.toBe("r1");
    expect(s.operators.blue).toBe("b2");
  });
  it("随机队长：每队从本队成员中抽，且会抽到不同的人", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = createCNGame({ players, words: CHINESE_WORDS, seed, now: T0 });
      expect(players.find((p) => p.id === s.captains.red)!.team).toBe("red");
      expect(players.find((p) => p.id === s.captains.blue)!.team).toBe("blue");
      expect(s.operators.red).not.toBe(s.captains.red);
      seen.add(s.captains.red);
    }
    expect(seen.size).toBe(3);
  });
  it("每队少于 2 人不能开局", () => {
    expect(() =>
      createCNGame({ players: players.filter((p) => p.id !== "b2"), words: CHINESE_WORDS, seed: 1, now: T0 }),
    ).toThrow(/至少需要 2 人/);
  });
});

describe("出线索（R06–R07、R18、R19）", () => {
  it("只有当前队长能出线索；提交后进入猜词，120 秒", () => {
    const s = game();
    expect(() => reduceCN(s, { type: "GIVE_CLUE", player: op(s), at: T0 + 1, word: CLUE, number: 1 })).toThrow(
      /队长/,
    );
    const other = s.captains[s.turn === "red" ? "blue" : "red"];
    expect(() => reduceCN(s, { type: "GIVE_CLUE", player: other, at: T0 + 1, word: CLUE, number: 1 })).toThrow();
    const g = clue(s, 2, T0 + 5000);
    expect(g.phase).toBe("guess");
    expect(g.deadline).toBe(T0 + 5000 + 120_000);
    expect(g.limit).toBe(3);
    expect(g.log.at(-1)!.clue).toEqual({ word: CLUE, number: 2 });
  });
  it("提交后不能再改（第二次出线索被拒）", () => {
    const g = clue(game(), 1);
    expect(() => clue(g, 2)).toThrow(/不是出线索/);
  });
  it("拦截桌面上的词、包含桌面词的线索、空格、过长", () => {
    const s = game();
    const w = s.cards[0].word;
    expect(clueProblem(s, w)).toMatch(/桌面上的词/);
    expect(clueProblem(s, w + "子")).toMatch(/桌面上的词/);
    expect(clueProblem(s, " ")).toMatch(/请输入/);
    expect(clueProblem(s, "两个 词")).toMatch(/空格/);
    expect(clueProblem(s, "一二三四五六七八九十一二三")).toMatch(/最多/);
    expect(clueProblem(s, CLUE)).toBeNull();
    expect(() => reduceCN(s, { type: "GIVE_CLUE", player: cap(s), at: T0 + 1, word: w, number: 1 })).toThrow(
      /桌面上的词/,
    );
  });
  it("已揭晓的词可以当线索", () => {
    let s = clue(game(), 1);
    const i = idx(s, s.turn);
    const w = s.cards[i].word;
    s = reduceCN(s, { type: "REVEAL", player: op(s), at: T0 + 2000, index: i });
    expect(clueProblem(s, w)).toBeNull();
  });
  it("数字只能 0–9 或 ∞", () => {
    const s = game();
    for (const bad of [-1, 10, 1.5]) expect(() => clue(s, bad)).toThrow(/0–9/);
    expect(() => clue(s, 0)).not.toThrow();
    expect(() => clue(s, "inf")).not.toThrow();
  });
  it("队长 60 秒不出线索：超时自动换边（R19）", () => {
    const s = game();
    expect(() => reduceCN(s, { type: "TIMEOUT", at: T0 + 59_999 })).toThrow(/还没到/);
    expect(() => clue(s, 1, T0 + 60_000)).toThrow(/时间到/);
    const t = reduceCN(s, { type: "TIMEOUT", at: T0 + 60_000 });
    expect(t.turn).not.toBe(s.turn);
    expect(t.phase).toBe("clue");
    expect(t.deadline).toBe(T0 + 120_000);
    expect(t.log[0].end).toBe("clue-timeout");
  });
});

describe("猜词（R09–R18、R20–R22）", () => {
  it("N+1：提示 2 最多翻 3 张，第 3 张对后自动换边", () => {
    let s = clue(game(), 2);
    const me = s.turn;
    s = reveal(s, me);
    s = reveal(s, me);
    expect(s.turn).toBe(me);
    s = reveal(s, me);
    expect(s.turn).not.toBe(me);
    expect(s.log.at(-2)!.end).toBe("limit");
    expect(s.log.at(-2)!.reveals).toHaveLength(3);
  });
  for (const n of [1, 3, 4]) {
    it(`N+1：提示 ${n} 最多 ${n + 1} 张`, () => {
      let s = clue(game(n + 10), n);
      const me = s.turn;
      for (let k = 0; k < n; k++) s = reveal(s, me);
      expect(s.turn).toBe(me);
      s = reveal(s, me);
      expect(s.turn).not.toBe(me);
    });
  }
  it("0 和 ∞：不限次数（翻 6 张仍是本队）", () => {
    for (const n of [0, "inf"] as const) {
      let s = clue(game(3), n);
      const me = s.turn;
      expect(s.limit).toBeNull();
      for (let k = 0; k < 6; k++) s = reveal(s, me);
      expect(s.turn).toBe(me);
      expect(s.phase).toBe("guess");
    }
  });
  it("0 和 ∞ 也受 120 秒限制", () => {
    const s = clue(game(), "inf", T0 + 1000);
    const t = reduceCN(s, { type: "TIMEOUT", at: T0 + 1000 + 120_000 });
    expect(t.turn).not.toBe(s.turn);
    expect(t.log[0].end).toBe("guess-timeout");
  });
  it("猜中中立：回合结束", () => {
    const s = reveal(clue(game(), 3), "neutral");
    expect(s.turn).not.toBe(s.first);
    expect(s.log[0].end).toBe("wrong");
  });
  it("猜中对方：回合结束，对方剩余减 1", () => {
    let s = clue(game(), 3);
    const opp = s.turn === "red" ? "blue" : "red";
    const before = remaining(s, opp);
    s = reveal(s, opp);
    expect(s.turn).toBe(opp);
    expect(remaining(s, opp)).toBe(before - 1);
  });
  it("猜中刺客：本队立即失败", () => {
    let s = clue(game(), 3);
    const me = s.turn;
    s = reveal(s, "assassin");
    expect(s.phase).toBe("over");
    expect(s.winner).not.toBe(me);
    expect(s.endReason).toBe("assassin");
    expect(() => clue(s, 1)).toThrow(/结束/);
  });
  it("翻完本队全部牌：获胜", () => {
    let s = clue(game(), "inf");
    const me = s.turn;
    for (let k = 0; k < 9; k++) s = reveal(s, me);
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(me);
    expect(s.endReason).toBe("all");
  });
  it("在自己回合翻出对方最后一张：对方获胜（R17）", () => {
    let s = game();
    const a = s.turn;
    const b = a === "red" ? "blue" : "red";
    // b 队自己先翻到只剩 1 张：轮流 ∞ 线索
    s = clue(s, 1);
    s = reveal(s, "neutral"); // a 回合结束
    s = clue(s, "inf");
    for (let k = 0; k < 7; k++) s = reveal(s, b);
    expect(remaining(s, b)).toBe(1);
    s = reduceCN(s, { type: "END_GUESSING", player: op(s), at: T0 + 3000 });
    expect(s.turn).toBe(a);
    s = clue(s, 1);
    s = reveal(s, b);
    expect(s.winner).toBe(b);
    expect(s.endReason).toBe("all");
  });
  it("至少翻一张才能主动结束（R09）", () => {
    let s = clue(game(), 2);
    expect(() => reduceCN(s, { type: "END_GUESSING", player: op(s), at: T0 + 2000 })).toThrow(/至少/);
    const me = s.turn;
    s = reveal(s, me);
    s = reduceCN(s, { type: "END_GUESSING", player: op(s), at: T0 + 3000 });
    expect(s.turn).not.toBe(me);
    expect(s.log[0].end).toBe("stop");
  });
  it("猜词超时：即使一张没翻也自动换边", () => {
    const s = clue(game(), 2, T0 + 1000);
    expect(() => reveal(s, s.turn, T0 + 121_000)).toThrow(/时间到/);
    const t = reduceCN(s, { type: "TIMEOUT", at: T0 + 121_000 });
    expect(t.turn).not.toBe(s.turn);
    expect(t.phase).toBe("clue");
  });
  it("队长、对方、观众不能标记或翻牌", () => {
    const s = clue(game(), 2);
    const i = idx(s, s.turn);
    const enemyOp = s.operators[s.turn === "red" ? "blue" : "red"];
    for (const who of [cap(s), enemyOp, "nobody"])
      for (const type of ["MARK", "REVEAL"] as const)
        expect(() => reduceCN(s, { type, player: who, at: T0 + 2000, index: i } as CNCommand)).toThrow();
  });
  it("标记：多人可标、再点取消；标记不计入猜测次数", () => {
    let s = game();
    while (s.turn !== "red") s = reduceCN(s, { type: "TIMEOUT", at: s.deadline });
    s = clue(s, 1, s.deadline - 50_000);
    const at = s.deadline - 1000;
    s = reduceCN(s, { type: "MARK", player: "r2", at, index: 3 });
    s = reduceCN(s, { type: "MARK", player: "r3", at, index: 3 });
    expect(s.marks[3]).toEqual(["r2", "r3"]);
    s = reduceCN(s, { type: "MARK", player: "r2", at, index: 3 });
    expect(s.marks[3]).toEqual(["r3"]);
    expect(s.guessesMade).toBe(0);
  });
  it("只有操作员能确认翻牌；其他队员可接任操作员", () => {
    let s = game();
    while (s.turn !== "red") s = reduceCN(s, { type: "TIMEOUT", at: s.deadline });
    s = clue(s, 1, s.deadline - 50_000);
    const at = s.deadline - 1000;
    const notOp = s.operators.red === "r2" ? "r3" : "r2";
    const i = idx(s, "red");
    expect(() => reduceCN(s, { type: "REVEAL", player: notOp, at, index: i })).toThrow(/操作员/);
    s = reduceCN(s, { type: "TAKE_OPERATOR", player: notOp, at });
    expect(s.operators.red).toBe(notOp);
    expect(() => reduceCN(s, { type: "TAKE_OPERATOR", player: "r1", at })).toThrow(/队长/);
    s = reduceCN(s, { type: "REVEAL", player: notOp, at, index: i });
    expect(s.cards[i].revealed).toBe(true);
  });
  it("同一张牌不能翻两次（多人同时点击）", () => {
    let s = clue(game(), 3);
    const i = idx(s, s.turn);
    s = reduceCN(s, { type: "REVEAL", player: op(s), at: T0 + 2000, index: i });
    expect(() => reduceCN(s, { type: "REVEAL", player: op(s), at: T0 + 2001, index: i })).toThrow(/已经翻开/);
  });
});

describe("加时（R21）", () => {
  it("+30 秒、每队一局一次、只能在本队猜词阶段", () => {
    let s = game();
    expect(() => reduceCN(s, { type: "EXTRA_TIME", player: op(s), at: T0 + 1000 })).toThrow(/猜词阶段/);
    s = clue(s, 1, T0 + 1000);
    const before = s.deadline;
    // 剩 15 秒时加时 → 45 秒
    const at = before - 15_000;
    s = reduceCN(s, { type: "EXTRA_TIME", player: op(s), at });
    expect(s.deadline - at).toBe(45_000);
    expect(s.extraUsed[s.turn]).toBe(true);
    expect(s.limit).toBe(2); // 不增加猜词次数
    expect(() => reduceCN(s, { type: "EXTRA_TIME", player: op(s), at: at + 1 })).toThrow(/用过/);
    expect(() => reduceCN(s, { type: "EXTRA_TIME", player: cap(s), at: at + 1 })).toThrow(/队长/);
  });
  it("计时归零后不能补用", () => {
    const s = clue(game(), 1, T0 + 1000);
    expect(() => reduceCN(s, { type: "EXTRA_TIME", player: op(s), at: s.deadline })).toThrow(/时间到/);
  });
  it("对方不能替你加时；用过的队下回合仍是已用；另一队仍可用", () => {
    let s = clue(game(), 1, T0 + 1000);
    const a = s.turn;
    const enemyOp = s.operators[a === "red" ? "blue" : "red"];
    expect(() => reduceCN(s, { type: "EXTRA_TIME", player: enemyOp, at: T0 + 2000 })).toThrow(/对方/);
    s = reduceCN(s, { type: "EXTRA_TIME", player: op(s), at: T0 + 2000 });
    s = reveal(s, "neutral", T0 + 3000);
    s = clue(s, 1, T0 + 4000);
    s = reduceCN(s, { type: "EXTRA_TIME", player: op(s), at: T0 + 5000 });
    expect(s.extraUsed).toEqual({ red: true, blue: true });
  });
});

describe("隐私（R25、指令 2.1）", () => {
  it("队员和观众拿不到未揭晓牌的身份；队长能；结束后全公开", () => {
    let s = clue(game(), 3);
    s = reveal(s, s.turn);
    for (const who of ["r2", "b2", null, "stranger"]) {
      const v = viewForCN(s, who);
      for (const c of v.cards) expect("role" in c).toBe(c.revealed);
      expect(JSON.stringify(v)).not.toContain("assassin");
    }
    for (const who of ["r1", "b1"]) {
      const v = viewForCN(s, who);
      expect(v.cards.every((c) => c.role)).toBe(true);
    }
    s = reveal(s, "assassin");
    expect(viewForCN(s, "r2").cards.every((c) => c.role)).toBe(true);
  });
});
