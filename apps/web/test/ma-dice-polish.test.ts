import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { rollSample, settleSample } from "../src/ma/dice-motion.ts";
import { disposeDiceScene, diceTargetQuaternion } from "../src/ma/dice3d.ts";
it("throw has a hand launch and decelerating rotation, ending on the ground", () => {
  expect(rollSample(0).x).toBeLessThan(0);
  expect(rollSample(0.25).height).toBeGreaterThan(rollSample(0).height);
  expect(rollSample(0.4).angle - rollSample(0.2).angle).toBeGreaterThan(
    rollSample(0.8).angle - rollSample(0.6).angle,
  );
  expect(rollSample(1)).toMatchObject({ x: 0, height: 0 });
  expect(settleSample(1, 0.3)).toMatchObject({
    height: 0,
    squash: 1,
    orientation: 1,
  });
  expect(settleSample(0.5, 0.3).height).toBeGreaterThan(
    settleSample(0.75, 0.3).height,
  );
});
it("all six authoritative results orient their correct face upwards", () => {
  const normals = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  normals.forEach((n, i) =>
    expect(
      new THREE.Vector3(...n).applyQuaternion(diceTargetQuaternion(i + 1, 0.4))
        .y,
    ).toBeCloseTo(1, 7),
  );
});
it("shared geometries, materials and shadow maps are released once", () => {
  const scene = new THREE.Scene(),
    g = new THREE.CircleGeometry(1),
    m = new THREE.MeshStandardMaterial();
  const gd = vi.spyOn(g, "dispose"),
    md = vi.spyOn(m, "dispose");
  scene.add(new THREE.Mesh(g, m), new THREE.Mesh(g, m));
  const light = new THREE.DirectionalLight();
  const shadow = vi.spyOn(light.shadow, "dispose");
  scene.add(light);
  disposeDiceScene(scene);
  expect(gd).toHaveBeenCalledTimes(1);
  expect(md).toHaveBeenCalledTimes(1);
  expect(shadow).toHaveBeenCalledTimes(1);
});
