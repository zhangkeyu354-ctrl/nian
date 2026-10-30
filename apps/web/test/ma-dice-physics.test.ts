import { expect, it } from "vitest";
import { makeDiceThrow, sampleDiceThrow } from "../src/ma/dice-physics.ts";
import { Vector3 } from "three";

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
  expect(sampleDiceThrow(path, 0).position.x).toBeLessThan(-0.2);
});
it("varied throws all settle on the authoritative face", () => {
  for (let seed = 1; seed <= 120; seed++) {
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
  }
});
