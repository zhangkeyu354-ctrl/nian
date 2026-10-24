import { describe, it, expect } from "vitest";
import { createGame, act, viewFor } from "../src/engine.ts";
import { TOPICS } from "../src/topics.ts";

const players = (n = 3) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` }));
const guess = (s: ReturnType<typeof createGame>, target: string) =>
  act(s, s.guesser, { type: "GUESS", target, round: s.round });
const challenge = (s: ReturnType<typeof createGame>, target: string) =>
  act(s, s.guesser, { type: "CHALLENGE", target, round: s.round });
const liar = (s: ReturnType<typeof createGame>) =>
  s.players.find((p) => p.id !== s.guesser && p.id !== s.truth)!.id;

describe("2026-10-24 用户裁定计分", () => {
  for (const d of [1, 2, 3]) {
    it(`难度${d}：初始3分，指中老实人双方+D`, () => {
      const s = createGame(
        players(),
        42,
        TOPICS.map((t) => ({ ...t, difficulty: d as 1 | 2 | 3 })),
      );
      expect(Object.values(s.scores)).toEqual([3, 3, 3]);
      const t = guess(s, s.truth);
      expect(t.scores[s.guesser]).toBe(3 + d);
      expect(t.scores[s.truth]).toBe(3 + d);
      expect(t.scores[liar(s)]).toBe(3);
      expect(t.history[0].scoring.map((x) => x.kind)).toEqual([
        "guess",
        "challenge",
      ]);
    });
    it(`难度${d}：指中瞎掰人，仅被选者+D`, () => {
      const s = createGame(
        players(),
        42,
        TOPICS.map((t) => ({ ...t, difficulty: d as 1 | 2 | 3 })),
      );
      const t = guess(s, liar(s));
      expect(t.scores[s.guesser]).toBe(3);
      expect(t.scores[s.truth]).toBe(3);
      expect(t.scores[liar(s)]).toBe(3 + d);
    });
  }
  it("质疑瞎掰人-1/+1，与同一被指认者的难度分叠加", () => {
    const s = createGame(players(), 9),
      l = liar(s);
    const t = guess(challenge(s, l), l);
    expect(t.scores[l]).toBe(3 + s.topic.difficulty - 1);
    expect(t.scores[s.guesser]).toBe(4);
    expect(t.history[0].scoring[0].delta[l]).toBe(s.topic.difficulty);
    expect(t.history[0].scoring[1].delta[l]).toBe(-1);
    expect(() => challenge(challenge(s, l), s.truth)).toThrow();
  });
  it("误质疑老实人-3，仍可指认他并叠加+D", () => {
    const s = createGame(players(), 8);
    const t = guess(challenge(s, s.truth), s.truth);
    expect(t.scores[s.guesser]).toBe(3 + s.topic.difficulty - 3);
    expect(t.scores[s.truth]).toBe(3 + s.topic.difficulty);
    expect(t.history[0].scoring[1].delta[s.guesser]).toBe(-3);
  });
  it("负分无下限；质疑分不能在讨论中提前泄露角色", () => {
    let s = createGame(players(), 8);
    s.scores[s.guesser] = -20;
    const t = challenge(s, s.truth);
    expect(t.scores[s.guesser]).toBe(-20);
    expect(viewFor(t, liar(s)).answer).toBeUndefined();
    expect(guess(t, liar(s)).scores[s.guesser]).toBe(-23);
  });
  it("10人两圈依次轮换20轮，刷新序列化保持轮数和分数，题目不重复", () => {
    let s = createGame(players(10), 42, TOPICS, 2);
    const seen = new Set<string>();
    for (let r = 0; r < 20; r++) {
      expect(s.guesser).toBe(`p${r % 10}`);
      expect(viewFor(s, null).totalRounds).toBe(20);
      seen.add(s.topic.id);
      s = guess(s, s.truth);
      s = JSON.parse(JSON.stringify(s));
      s = act(s, "p0", { type: "NEXT", round: s.round });
    }
    expect(s.phase).toBe("over");
    expect(seen.size).toBe(20);
  });
  it("终局同分共同获胜且同级；未终局不公布获胜者", () => {
    let s = createGame(players(), 2);
    expect(viewFor(s, null).winners).toEqual([]);
    s.phase = "over";
    s.scores = { p0: 8, p1: 8, p2: -2 };
    const v = viewFor(s, null);
    expect(v.winners).toEqual(["p0", "p1"]);
    expect(v.standings.map((p) => p.rank)).toEqual([1, 1, 2]);
  });
  it("拒绝非法圈数、按两圈检查题库容量；旧存档默认一圈且不重写已有分数", () => {
    expect(() => createGame(players(), 1, TOPICS, 3 as any)).toThrow();
    expect(() => createGame(players(), 1, TOPICS.slice(0, 4), 2)).toThrow();
    const s = createGame(players(), 1);
    delete (s as any).cycles;
    s.scores.p0 = -4;
    expect(viewFor(s, null).totalRounds).toBe(3);
    expect(viewFor(s, null).players[0].score).toBe(-4);
  });
});
