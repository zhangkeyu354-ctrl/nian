/** 2 人变体与 3 人双选手变体（规则书 p26，2025-09 版） */
import { describe, expect, it } from "vitest";
import { createMAGame, reduceMA } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { answer, tok } from "./helpers.ts";

const draftAll = (s: MAState) => {
  while (s.phase === "draft") {
    const d = s.draft!;
    s = reduceMA(s, { type: "DRAFT", player: d.order[d.step], racer: d.pool[0] });
  }
  return s;
};
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "p" + (i + 1), name: "P" + (i + 1) }));

describe("选秀", () => {
  it("2 人：翻 8 张 ABBAABBA，再翻 8 张反过来 BAABBAAB，每人 8 名", () => {
    let s = createMAGame({ players: players(2), seed: 3 });
    const a = s.draft!.order[0];
    const b = a === "p1" ? "p2" : "p1";
    expect(s.draft!.pool).toHaveLength(8);
    expect(s.draft!.order).toEqual([a, b, b, a, a, b, b, a]);
    for (let i = 0; i < 8; i++) s = reduceMA(s, { type: "DRAFT", player: s.draft!.order[s.draft!.step], racer: s.draft!.pool[0] });
    expect(s.draft!.order).toEqual([b, a, a, b, b, a, a, b]);
    s = draftAll(s);
    expect(s.players.map((p) => p.hand.length)).toEqual([8, 8]);
    expect(s.settings.variant).toBe("double");
  });
  it("3 人双选手：4 轮各翻 6 张，轮流先选，每人 8 名", () => {
    let s = createMAGame({ players: players(3), seed: 5, settings: { variant: "double" } });
    const firsts: string[] = [];
    while (s.phase === "draft") {
      if (s.draft!.step === 0) {
        firsts.push(s.draft!.order[0]);
        expect(s.draft!.pool).toHaveLength(6);
      }
      s = reduceMA(s, { type: "DRAFT", player: s.draft!.order[s.draft!.step], racer: s.draft!.pool[0] });
    }
    expect(firsts).toHaveLength(4);
    expect(new Set(firsts.slice(0, 3)).size).toBe(3);
    expect(s.players.map((p) => p.hand.length)).toEqual([8, 8, 8]);
  });
  it("3 人默认仍是标准规则（每人 4 名、每场 1 名）", () => {
    const s = draftAll(createMAGame({ players: players(3), seed: 5 }));
    expect(s.settings.variant).toBe("standard");
    expect(s.players.map((p) => p.hand.length)).toEqual([4, 4, 4]);
  });
});

/** 摆好一场 2 人比赛：p1 派 a1,a2；p2 派 b1,b2 */
function twoPlayerRace(a: [string, string], b: [string, string], rolls: number[] = []) {
  let s = draftAll(createMAGame({ players: players(2), seed: 9 }));
  s.players[0].hand = [...a, "x1", "x2", "x3", "x4", "x5", "x6"];
  s.players[1].hand = [...b, "y1", "y2", "y3", "y4", "y5", "y6"];
  s.nextFirst = "p1";
  if (rolls.length) s.forcedRolls = rolls;
  s = reduceMA(s, { type: "CHOOSE", player: "p1", racers: a });
  s = reduceMA(s, { type: "CHOOSE", player: "p2", racers: b });
  return s;
}

describe("2 人：比赛", () => {
  it("每场必须派 2 名不同的选手", () => {
    const s = draftAll(createMAGame({ players: players(2), seed: 9 }));
    const h = s.players[0].hand;
    expect(() => reduceMA(s, { type: "CHOOSE", player: "p1", racers: [h[0]] })).toThrow();
    expect(() => reduceMA(s, { type: "CHOOSE", player: "p1", racers: [h[0], h[0]] })).toThrow();
  });
  it("第一个回合只选一名选手行动；之后每回合两名都行动，顺序自选", () => {
    let s = twoPlayerRace(["legs", "alchemist"], ["twin", "lovable_loser"]);
    expect(s.race!.tokens).toHaveLength(4);
    expect(s.pending?.kind).toBe("order");
    expect(s.pending?.options).toHaveLength(2);
    s = answer(s, "legs");
    s = answer(s, "legs"); // 大长腿：直接走 5
    expect(tok(s, "legs").pos).toBe(5);
    expect(tok(s, "alchemist").pos).toBe(0);
    expect(s.race!.current).toBe("p2");
    // p2 第一回合也只用一名
    expect(s.pending?.kind).toBe("order");
    s = answer(s, "twin");
    s = answer(s, "roll");
    expect(s.race!.current).toBe("p1");
    // p1 第二回合：两名都要动，先问顺序
    expect(s.pending?.kind).toBe("order");
    expect(s.pending?.prompt).toContain("先动");
    s = answer(s, "alchemist");
    expect(s.pending?.racer).toBe("alchemist");
  });
  it("「其他选手」包括自己的另一名选手：自己的跟班在自己另一名掷 6 时也会跑", () => {
    let s = twoPlayerRace(["lackey", "twin"], ["legs", "lovable_loser"], [6]);
    s = answer(s, "twin");
    s = answer(s, "roll");
    expect(tok(s, "lackey").pos).toBe(2);
    expect(tok(s, "twin").pos).toBe(6);
  });
});

describe("3 人双选手：比赛", () => {
  it("每回合两名选手都行动，完整结束一名再动另一名", () => {
    let s = draftAll(createMAGame({ players: players(3), seed: 11, settings: { variant: "double" } }));
    const pick = (i: number) => s.players[i].hand.filter((r) => !["egg", "twin", "sisyphus", "mastermind"].includes(r)).slice(0, 2);
    s.nextFirst = "p1";
    const p1 = pick(0);
    s = reduceMA(s, { type: "CHOOSE", player: "p1", racers: p1 });
    s = reduceMA(s, { type: "CHOOSE", player: "p2", racers: pick(1) });
    s = reduceMA(s, { type: "CHOOSE", player: "p3", racers: pick(2) });
    expect(s.race!.tokens).toHaveLength(6);
    // 第一回合也要两名都动（与 2 人变体不同）
    expect(s.pending?.kind).toBe("order");
    expect(s.pending?.prompt).toContain("两名选手都要行动");
  });
});
