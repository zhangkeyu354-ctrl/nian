import { expect, it } from "vitest";
import {
  makeDiceThrow,
  sampleDiceThrow,
} from "../src/ma/dice-physics.ts";
import { Vector3 } from "three";

it("the die is tossed in from beside the view and comes to rest at the center", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const path = makeDiceThrow(6, seed * 7919),
      first = path.frames[0].position,
      last = path.frames.at(-1)!.position;
    expect(Math.abs(first.x), `seed ${seed}`).toBeGreaterThan(1.5);
    expect(first.y, `seed ${seed}`).toBeGreaterThan(0.5);
    expect(Math.hypot(last.x, last.z)).toBeLessThan(1e-6);
    const seconds = path.frames.length / 240;
    expect(seconds, `seed ${seed}`).toBeLessThan(2.25);
  }
});

it("all six server results settle without a final orientation snap or floor penetration", () => {
  const normals = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  for (let value = 1; value <= 6; value++) {
    const path = makeDiceThrow(value, 42);
    const end = sampleDiceThrow(path, 1),
      near = sampleDiceThrow(path, 0.999);
    expect(
      new Vector3(...normals[value - 1]).applyQuaternion(end.rotation).y,
    ).toBeGreaterThan(0.9999);
    expect(near.rotation.angleTo(end.rotation)).toBeLessThan(0.01);
    for (const pose of path.frames)
      expect(pose.clearance).toBeGreaterThan(-0.012);
    expect(path.impacts).toBeGreaterThan(1);
    expect(end.position.y).toBeCloseTo(0.5, 2);
  }
});
it("a throw is continuous through the former roll/result boundary and sleeps at rest", () => {
  const path = makeDiceThrow(6, 123);
  const a = sampleDiceThrow(path, 0.6499),
    b = sampleDiceThrow(path, 0.6501);
  expect(a.position.distanceTo(b.position)).toBeLessThan(0.01);
  expect(a.rotation.angleTo(b.rotation)).toBeLessThan(0.02);
  expect(path.frames.at(-1)!.speed).toBeLessThan(0.02);
});
it("varied throws all settle on the authoritative face", () => {
  for (let seed = 1; seed <= 1200; seed++) {
    const value = (seed % 6) + 1,
      path = makeDiceThrow(value, seed * 7919),
      end = path.frames.at(-1)!;
    const normals = [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [-1, 0, 0],
      [0, 0, -1],
    ];
    expect(
      new Vector3(...normals[value - 1]).applyQuaternion(end.rotation).y,
      `seed ${seed}`,
    ).toBeGreaterThan(0.9999);
    expect(end.speed).toBeLessThan(0.05);
    // Recompute clearance from rendered cube corners, including interpolated
    // frames, rather than trusting the simulator's own clearance metadata.
    for (let step = 0; step <= 12; step++) {
      const pose = sampleDiceThrow(path, step / 12);
      for (const x of [-0.37, 0.37])
        for (const y of [-0.37, 0.37])
          for (const z of [-0.37, 0.37]) {
            const low =
              new Vector3(x, y, z).applyQuaternion(pose.rotation).y +
              pose.position.y -
              0.13;
            expect(low, `floor seed ${seed}`).toBeGreaterThan(-0.006);
          }
    }
  }
}, 60000);
