import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Scene, Group } from "three";
let scene: Scene,
  now = 0,
  counter = 0;
const frames = new Map<number, FrameRequestCallback>();
let renderedRotation: import("three").Quaternion | undefined;
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      shadowMap = {};
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      forceContextLoss() {}
      render(s: Scene) {
        scene = s;
        renderedRotation = s.children
          .find((o) => o.type === "Group")
          ?.quaternion.clone();
      }
    },
    PMREMGenerator: class {
      fromScene() {
        return { texture: new actual.Texture(), dispose() {} };
      }
      dispose() {}
    },
  };
});
it("the first physical frame is drawn before the canvas is made visible", () => {
  const h = create();
  h.setState(5, true, 620, false, 750);
  expect(renderedRotation!.angleTo(die().quaternion)).toBeLessThan(1e-7);
  h.dispose();
});
import { createDice } from "../src/ma/dice3d.ts";
import { Vector3 } from "three";
const normals = [
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];
function tick(time: number) {
  now = time;
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(now);
}
function die() {
  return scene.children.find((o) => o.type === "Group") as Group;
}
function create() {
  return createDice(
    { clientWidth: 190, clientHeight: 190 } as HTMLCanvasElement,
    "#f2b705",
  );
}
beforeEach(() => {
  now = 0;
  frames.clear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(Math, "random").mockReturnValue(0.42);
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++counter, cb);
    return counter;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("changing player color reuses the renderer without changing the physical pose", () => {
  const h = create();
  h.setState(3, true, 620, false, 750);
  tick(250);
  const group = die(),
    q = group.quaternion.clone(),
    p = group.position.clone(),
    pending = frames.size;
  h.setColor("#2f7fd8");
  const body = group.children.find(
    (o) => (o as any).material?.type === "MeshPhysicalMaterial",
  ) as any;
  expect(body.material.color.getHexString()).toBe("2f7fd8");
  expect(group.quaternion.angleTo(q)).toBeLessThan(1e-7);
  expect(group.position.distanceTo(p)).toBe(0);
  expect(frames.size).toBe(pending);
  h.dispose();
});

it("all six rendered results match server values without restarting at reveal", () => {
  for (let value = 1; value <= 6; value++) {
    now = 0;
    const h = create();
    h.setState(value, true, 620, false, 750);
    tick(740);
    const p = die().position.clone(),
      q = die().quaternion.clone();
    h.setState(value, false, 620, false, 750);
    expect(die().position.distanceTo(p)).toBe(0);
    expect(die().quaternion.angleTo(q)).toBeLessThan(1e-7);
    tick(6000);
    expect(
      new Vector3(...normals[value - 1]).applyQuaternion(die().quaternion).y,
    ).toBeGreaterThan(0.9999);
    expect(frames.size).toBe(0);
    h.dispose();
  }
});
it("changing speed preserves pose and repeating the same value starts a fresh throw", () => {
  const h = create();
  h.setState(6, true, 620, false, 750);
  tick(300);
  const p = die().position.clone(),
    q = die().quaternion.clone();
  h.setState(6, true, 310, false, 375);
  expect(die().position.distanceTo(p)).toBe(0);
  expect(die().quaternion.angleTo(q)).toBeLessThan(1e-7);
  tick(850);
  h.setState(6, false, 310, false, 375);
  const settled = die().quaternion.clone();
  h.setState(6, false, 930, false, 1125);
  expect(die().quaternion.angleTo(settled)).toBeLessThan(1e-7);
  h.setState(6, true, 930, false, 1125);
  expect(Math.abs(die().position.x)).toBeGreaterThan(1.5);
  expect(frames.size).toBe(1);
  h.dispose();
  expect(frames.size).toBe(0);
});
it("reduced motion and unmount stop animation and keep the exact result", () => {
  const h = create();
  h.setState(4, true, 620, false, 750);
  tick(150);
  h.setState(4, true, 0, true, 0);
  expect(
    new Vector3(...normals[3]).applyQuaternion(die().quaternion).y,
  ).toBeCloseTo(1, 7);
  expect(frames.size).toBe(0);
  h.dispose();
  h.dispose();
  expect(scene.children.length).toBe(0);
});
it("two duel dice retain independent server results and animation lifecycles", () => {
  const a = create(),
    first = die(),
    b = create(),
    second = die();
  a.setState(2, true, 620, false, 750);
  b.setState(6, true, 620, false, 750);
  tick(750);
  a.setState(2, false, 620, false, 750);
  b.setState(6, false, 620, false, 750);
  tick(6000);
  expect(
    new Vector3(...normals[1]).applyQuaternion(first.quaternion).y,
  ).toBeGreaterThan(0.9999);
  expect(
    new Vector3(...normals[5]).applyQuaternion(second.quaternion).y,
  ).toBeGreaterThan(0.9999);
  a.dispose();
  expect(second.parent).not.toBeNull();
  b.dispose();
  expect(frames.size).toBe(0);
});
