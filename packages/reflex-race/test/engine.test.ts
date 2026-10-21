import { describe, expect, it } from "vitest";
import {
  createRRGame,
  DEFAULT_TIMING,
  reduceRR,
  solve,
  viewForRR,
  type Obj,
  type RRState,
} from "../src/index.ts";

const T0 = 1_000_000;
const players = [
  { id: "a", name: "甲" },
  { id: "b", name: "乙" },
  { id: "c", name: "丙" },
];
const game = (seed = 1, target = 3) =>
  createRRGame({ players, target, seed, now: T0 });
const live = (s: RRState) => s.revealAt + 100;
const wrong = (s: RRState) => ((s.card.answer + 1) % 5) as Obj;
const tick = (s: RRState) => reduceRR(s, { type: "TICK", at: s.deadline });

describe("出题", () => {
  it("截图里的例子：绿猫 + 红书 → 雪人", () => {
    expect(
      solve([
        { obj: 3, color: 1 },
        { obj: 2, color: 0 },
      ]),
    ).toBe(4);
  });
  it("原色物品优先：红沙发 + 蓝瓶子 → 沙发", () => {
    expect(
      solve([
        { obj: 0, color: 0 },
        { obj: 1, color: 2 },
      ]),
    ).toBe(0);
  });
  it("连续 3000 张图都只有唯一答案，两种题型都会出现，五个答案都会出现", () => {
    let s = game(42, 50);
    const kinds = new Set<string>();
    const answers = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const c = s.card;
      expect(solve(c.items)).toBe(c.answer);
      expect(c.items[0].obj).not.toBe(c.items[1].obj);
      expect(c.items[0].color).not.toBe(c.items[1].color);
      if (c.kind === "missing")
        expect(c.items.every((x) => x.obj !== x.color)).toBe(true);
      kinds.add(c.kind);
      answers.add(c.answer);
      s = tick(tick(s));
    }
    expect([...kinds].sort()).toEqual(["match", "missing"]);
    expect(answers.size).toBe(5);
  });
  it("同一个种子出同样的题（服务器重启可以重放）", () => {
    expect(game(9).card).toEqual(game(9).card);
  });
});

describe("计分", () => {
  it("第一个点对 +1，公布答案后换下一张", () => {
    let s = game();
    s = reduceRR(s, {
      type: "TAP",
      player: "b",
      obj: s.card.answer,
      at: live(s),
    });
    expect(s.scores.b).toBe(1);
    expect(s.cardWinner).toBe("b");
    expect(s.phase).toBe("reveal");
    expect(() =>
      reduceRR(s, {
        type: "TAP",
        player: "a",
        obj: s.card.answer,
        at: live(s),
      }),
    ).toThrow(/结束/);
    s = tick(s);
    expect(s.phase).toBe("live");
    expect(s.cardNo).toBe(2);
    expect(s.revealAt).toBeGreaterThan(live({ ...s, revealAt: T0 }));
  });
  it("点错 −1 可以变负数，这张图不能再点，别人还能抢", () => {
    let s = game();
    s = reduceRR(s, { type: "TAP", player: "a", obj: wrong(s), at: live(s) });
    expect(s.scores.a).toBe(-1);
    expect(s.phase).toBe("live");
    expect(() =>
      reduceRR(s, {
        type: "TAP",
        player: "a",
        obj: s.card.answer,
        at: live(s),
      }),
    ).toThrow(/点错过/);
    s = reduceRR(s, {
      type: "TAP",
      player: "c",
      obj: s.card.answer,
      at: live(s) + 5,
    });
    expect(s.scores).toEqual({ a: -1, b: 0, c: 1 });
  });
  it("所有人都点错就直接公布答案", () => {
    let s = game();
    for (const p of players)
      s = reduceRR(s, {
        type: "TAP",
        player: p.id,
        obj: wrong(s),
        at: live(s),
      });
    expect(s.phase).toBe("reveal");
    expect(s.cardWinner).toBeNull();
    expect(s.scores).toEqual({ a: -1, b: -1, c: -1 });
  });
  it("图还没出来不能点；超时没人答对就公布答案", () => {
    let s = game();
    expect(() =>
      reduceRR(s, { type: "TAP", player: "a", obj: 0, at: s.revealAt - 1 }),
    ).toThrow(/还没出来/);
    expect(tick({ ...s, deadline: s.deadline })).toMatchObject({
      phase: "reveal",
      cardWinner: null,
    });
    expect(reduceRR(s, { type: "TICK", at: s.deadline - 1 })).toBe(s);
    expect(s.deadline - s.revealAt).toBe(DEFAULT_TIMING.cardMs);
  });
  it("先到目标分获胜，之后不能再操作", () => {
    let s = game(5, 2);
    for (let i = 0; i < 2; i++) {
      s = reduceRR(s, {
        type: "TAP",
        player: "c",
        obj: s.card.answer,
        at: live(s),
      });
      if (s.phase !== "over") s = tick(s);
    }
    expect(s.phase).toBe("over");
    expect(s.winner).toBe("c");
    expect(s.stats.c).toEqual({ right: 2, wrong: 0 });
    expect(() => tick(s)).toThrow(/结束/);
  });
  it("观战者不能作答；人数 2–6；目标分 1–50", () => {
    const s = game();
    expect(() =>
      reduceRR(s, { type: "TAP", player: "x", obj: 0, at: live(s) }),
    ).toThrow(/观战/);
    expect(() =>
      createRRGame({
        players: players.slice(0, 1),
        target: 5,
        seed: 1,
        now: 0,
      }),
    ).toThrow();
    const seven = Array.from({ length: 7 }, (_, i) => ({
      id: "p" + i,
      name: "p" + i,
    }));
    expect(() =>
      createRRGame({ players: seven, target: 5, seed: 1, now: 0 }),
    ).toThrow();
    expect(() =>
      createRRGame({ players, target: 0, seed: 1, now: 0 }),
    ).toThrow();
    expect(() =>
      createRRGame({ players, target: 51, seed: 1, now: 0 }),
    ).toThrow();
  });
  it("作答中不公开答案，公布时才给", () => {
    let s = game();
    expect(viewForRR(s).card.answer).toBeNull();
    expect("rand" in viewForRR(s)).toBe(false);
    s = tick(s);
    expect(viewForRR(s).card.answer).toBe(s.card.answer);
  });
});
