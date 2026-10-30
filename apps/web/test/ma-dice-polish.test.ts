import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeDiceScene, diceTargetQuaternion } from "../src/ma/dice3d.ts";
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
