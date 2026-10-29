import { expect, it } from "vitest";
import { diePose, skillFlightFrames } from "../src/ma/lite-motion.ts";

it("all six server values select a distinct cube orientation without random rerolls", () => {
  expect(new Set([1, 2, 3, 4, 5, 6].map(diePose)).size).toBe(6);
  expect(diePose(1)).toMatchObject({ x: 0, y: 0 });
  expect(diePose(3)).toMatchObject({ x: 0, y: -90 });
  expect(diePose(5)).toMatchObject({ x: -90, y: 0 });
});
it("skill flight starts and returns at the caster, preserving the existing whole window", () => {
  const frames = skillFlightFrames({ x: 20, y: 200 }, { x: 200, y: 400 });
  expect(frames[0].transform).toContain("-180px,-200px");
  expect(frames.at(-1)?.transform).toBe(frames[0].transform);
  expect(frames[1].offset).toBeCloseTo(240 / 2600);
  expect(frames.at(-2)?.offset).toBeCloseTo(1 - 180 / 2600);
  expect(frames.every((f) => !("top" in f) && !("left" in f))).toBe(true);
});
