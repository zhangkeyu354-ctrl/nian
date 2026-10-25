import { describe, it, expect } from "vitest";
import {
  createRK,
  reduceRK,
  assertInvariants,
  viewForRK,
  type Command,
} from "../src/index.ts";
import { simulateRK } from "../src/simulation.ts";
describe("RK deterministic transaction walks", () => {
  it("preserves 106 tiles through randomized move/undo/redo/reset/draw sequences", () => {
    for (const players of [2, 3, 4])
      for (let seed = 1; seed <= 8; seed++) {
        let s = createRK(
          Array.from({ length: players }, (_, i) => `p${i}`),
          { seed, minutes: 0, assertions: true },
        );
        let random = seed;
        const next = () => {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          return random;
        };
        for (let step = 0; step < 80 && s.phase === "PLAYING"; step++) {
          const rack = s.draft.rack;
          const choice = next() % 5;
          const body =
            choice === 0 && s.undo.length
              ? { type: "UNDO" }
              : choice === 1 && s.redo.length
                ? { type: "REDO" }
                : choice === 2
                  ? { type: "RESET" }
                  : choice === 3 || !rack.length
                    ? { type: "DRAW" }
                    : {
                        type: "MOVE",
                        tiles: [rack[next() % rack.length]],
                        to: { meld: null },
                      };
          const cmd = {
            ...body,
            actor: s.current,
            seq: (s.seq[String(s.current)] ?? 0) + 1,
            now: step,
          } as Command;
          const old = structuredClone(s);
          const actor = s.current;
          const other = (actor + 1) % players;
          const beforeOther = viewForRK(s, other);
          const t = reduceRK(s, cmd);
          expect(s).toEqual(old);
          assertInvariants(t);
          expect(reduceRK(t, cmd)).toBe(t);
          if (["MOVE", "UNDO", "REDO", "RESET"].includes(cmd.type))
            expect(viewForRK(t, other)).toEqual(beforeOther);
          s = t;
        }
      }
  });
  it("seeded AI reaches reproducible terminal scores for each player count", () => {
    for (const players of [2, 3, 4]) {
      const a = simulateRK(players, players * 1000 + 1);
      expect(simulateRK(players, players * 1000 + 1)).toEqual(a);
      expect(a.turns).toBeGreaterThan(0);
      expect(a.scores.reduce((x, y) => x + y, 0)).toBeCloseTo(0);
    }
  });
  it("starting draw tie is public and only highest tied players redraw", () => {
    let sample: ReturnType<typeof createRK> | undefined;
    for (let seed = 1; seed <= 100; seed++) {
      const s = createRK(["a", "b", "c", "d"], { seed });
      if (s.startDraw.some((d) => d.round > 0)) {
        sample = s;
        break;
      }
    }
    expect(sample).toBeDefined();
    const first = sample!.startDraw.filter((d) => d.round === 0);
    const value = (id: string) => Number(id.slice(1, 3));
    const max = Math.max(...first.map((d) => value(d.tile)));
    const tied = first
      .filter((d) => value(d.tile) === max)
      .map((d) => d.seat)
      .sort();
    expect(
      sample!.startDraw
        .filter((d) => d.round === 1)
        .map((d) => d.seat)
        .sort(),
    ).toEqual(tied);
    expect(new Set(first.map((d) => d.tile)).size).toBe(first.length);
  });
});
