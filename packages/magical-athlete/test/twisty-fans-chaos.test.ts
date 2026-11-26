import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer } from "./helpers.ts";

describe("观众渴求混乱", () => {
  function chaos(cards: number[]) {
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos: [13, 20, 25],
      rolls: [1],
      track: "twisty-twirl",
      skipSetup: true,
    });
    const prepare = (q: typeof s) => {
      q.rng = 0;
      q.race!.twist!.remaining = [10, ...cards];
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    return answer(s, "roll");
  }

  it("依次抽出两张不同的剩余事件，并在同场只记录各一次", () => {
    const after = chaos([6, 7]);
    expect(after.race!.twist!.drawn).toHaveLength(3);
    expect(after.race!.twist!.drawn[0]).toBe(10);
    expect(new Set(after.race!.twist!.drawn)).toEqual(new Set([10, 6, 7]));
    expect(after.log.flatMap((entry) => entry.fx?.kind === "twist_card" ? [entry.fx.card] : []))
      .toEqual(after.race!.twist!.drawn);
    expect(after.race!.twist!.remaining).toEqual([]);
    expect(after.race!.twist!.fixedDice).toBeDefined();
    expect(after.race!.twist!.chips?.length).toBeGreaterThan(0);
  });

  it("先传送全员，再按传送后的占位放置筹码", () => {
    const after = chaos([3, 7]);
    expect(after.race!.twist!.drawn).toEqual([10, 3, 7]);
    expect(after.race!.tokens.map(t => t.pos)).toEqual([1, 1, 1]);
    expect(after.race!.twist!.chips).toContain(20);
    expect(after.race!.twist!.chips).toContain(25);
  });

  it("第一张淘汰触发者后，第二张仍可完成合法的全场效果", () => {
    const after = chaos([13, 7]);
    expect(after.race!.twist!.drawn).toEqual([10, 13, 7]);
    expect(after.race!.tokens[0].out).toBe(true);
    expect(after.race!.twist!.chips).toContain(13);
  });

  it("先镜像后放皮纳塔筹码，按反向第一弯道选择格子", () => {
    const after = chaos([2, 7]);
    expect(after.race!.twist!.drawn).toEqual([10, 2, 7]);
    expect(after.race!.twist!.reversed).toBe(true);
    expect(after.race!.twist!.chips).toContain(1);
    expect(after.race!.twist!.chips).not.toContain(25);
  });
});
