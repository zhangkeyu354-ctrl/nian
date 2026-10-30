import { expect, it } from "vitest";
import {
  testRace,
  reduceMA,
} from "../../../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";
import { makeDiceThrow } from "../src/ma/dice-physics.ts";
import { Vector3 } from "three";
it("the six server log values drive both movement and the rendered result", () => {
  const normals = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  for (let value = 1; value <= 6; value++) {
    let s = testRace({
      racers: ["banana", "alchemist", "duelist"],
      pos: [0, 10, 20],
      rolls: [value],
      skipSetup: true,
    });
    s = reduceMA(s, {
      type: "ANSWER",
      player: s.pending!.player,
      value: "roll",
    });
    const v = viewForMA(s, "p1"),
      fx = v.log.flatMap((e) => (e.fx?.kind === "roll" ? [e.fx] : [])).at(-1)!;
    expect(fx.value).toBe(value);
    expect(v.race!.tokens.find((t) => t.racer === "banana")!.pos).toBe(value);
    const before = JSON.stringify(s),
      path = makeDiceThrow(fx.value, 7919);
    expect(
      new Vector3(...normals[value - 1]).applyQuaternion(
        path.frames.at(-1)!.rotation,
      ).y,
    ).toBeGreaterThan(0.9999);
    expect(JSON.stringify(s)).toBe(before);
  }
});
