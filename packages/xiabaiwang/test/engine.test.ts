import { describe, it, expect } from "vitest";
import { createGame, act, viewFor } from "../src/engine.ts";
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` }));
describe("瞎掰王", () => {
  for (let n = 3; n <= 10; n++)
    it(`${n}人完整轮换、秘密投影及结算`, () => {
      let s = createGame(players(n), 123);
      for (let r = 0; r < n; r++) {
        expect(s.guesser).toBe(`p${r}`);
        for (const p of s.players) {
          const v = viewFor(s, p.id);
          expect(v.answer !== undefined).toBe(p.id === s.truth);
          expect(v).not.toHaveProperty("truth");
          expect(v).not.toHaveProperty("deck");
          if (p.id !== s.truth)
            expect(JSON.stringify({ ...v, history: [] })).not.toContain(
              s.topic.answer,
            );
          expect(v.players.filter((x) => x.role === "truth")).toHaveLength(
            p.id === s.truth ? 1 : 0,
          );
        }
        expect(viewFor(s, null).answer).toBeUndefined();
        const liar = s.players.find(
          (p) => p.id !== s.guesser && p.id !== s.truth,
        )!.id;
        expect(() =>
          act(s, liar, { type: "CHALLENGE", target: s.truth, round: s.round }),
        ).toThrow();
        s = act(s, s.guesser, {
          type: "CHALLENGE",
          target: liar,
          round: s.round,
        });
        expect(viewFor(s, liar).muted).toBe(liar);
        expect(() =>
          act(s, s.guesser, {
            type: "CHALLENGE",
            target: s.truth,
            round: s.round,
          }),
        ).toThrow();
        const before = { ...s.scores };
        s = act(s, s.guesser, {
          type: "GUESS",
          target: s.truth,
          round: s.round,
        });
        expect(s.scores[s.guesser] - before[s.guesser]).toBe(
          s.topic.difficulty + 1,
        );
        expect(s.scores[liar] - before[liar]).toBe(-1);
        expect(viewFor(s, null).players.every((p) => p.role)).toBe(true);
        expect(() =>
          act(s, s.guesser, { type: "GUESS", target: s.truth, round: s.round }),
        ).toThrow();
        s = act(s, "p0", { type: "NEXT", round: s.round });
      }
      expect(s.phase).toBe("over");
      expect(s.history).toHaveLength(n);
    });
  it("误质疑老实人扣3分，仍可指认；猜错被选者得难度分", () => {
    let s = createGame(players(4), 7);
    s = act(s, s.guesser, { type: "CHALLENGE", target: s.truth, round: 1 });
    expect(s.scores[s.guesser]).toBe(0);
    const liar = s.players.find(
      (p) => p.id !== s.guesser && p.id !== s.truth,
    )!.id;
    s = act(s, s.guesser, { type: "GUESS", target: liar, round: 1 });
    expect(s.scores[s.guesser]).toBe(-3);
    expect(s.scores[liar]).toBe(s.topic.difficulty);
    let t = createGame(players(3), 8);
    t = act(t, t.guesser, { type: "CHALLENGE", target: t.truth, round: 1 });
    t = act(t, t.guesser, { type: "GUESS", target: t.truth, round: 1 });
    expect(t.scores[t.guesser]).toBe(t.topic.difficulty - 3);
  });
  it("拒绝人数越界、过期回合、非法目标及未知行动", () => {
    expect(() => createGame(players(2), 1)).toThrow();
    expect(() => createGame(players(11), 1)).toThrow();
    const s = createGame(players(3), 1);
    for (const target of [s.guesser, "bad"])
      expect(() =>
        act(s, s.guesser, { type: "GUESS", target, round: 1 }),
      ).toThrow();
    expect(() =>
      act(s, s.guesser, { type: "GUESS", target: s.truth, round: 0 }),
    ).toThrow();
    expect(() =>
      act(s, s.guesser, { type: "POOP", round: 1 } as any),
    ).toThrow();
  });
});
