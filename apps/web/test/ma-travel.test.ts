import { expect, it } from "vitest";
import {
  travelFrames,
  classifyTravel,
  cameraTarget,
  ManualCameraPause,
} from "../src/ma/travel.ts";

it("each travel ends on the server destination using transform and opacity only", () => {
  for (const kind of ["forward", "backward", "drag", "warp"] as const) {
    const frames = travelFrames(
      { x: 10, y: 40 },
      { x: 90, y: 60 },
      kind,
      false,
    );
    expect(frames[0].transform).toBe("translate3d(10px,40px,0)");
    expect(frames.at(-1)).toMatchObject({
      transform: "translate3d(90px,60px,0)",
      opacity: 1,
    });
    expect(frames.every((f) => !("left" in f) && !("top" in f))).toBe(true);
  }
});
it("hops lift toward screen top on both board orientations; dragging remains straight", () => {
  const from = { x: 0, y: 0 },
    to = { x: 80, y: 0 };
  expect(travelFrames(from, to, "forward", false)[2].transform).toBe(
    "translate3d(40px,-10px,0)",
  );
  expect(travelFrames(from, to, "forward", true)[2].transform).toBe(
    "translate3d(30px,0px,0)",
  );
  expect(travelFrames(from, to, "drag", false)).toHaveLength(2);
  const warp = travelFrames(from, to, "warp", false);
  expect(
    warp.some(
      (f) => f.opacity === 0 && f.transform === "translate3d(0px,0px,0)",
    ),
  ).toBe(true);
  expect(
    warp.some(
      (f) => f.opacity === 0 && f.transform === "translate3d(80px,0px,0)",
    ),
  ).toBe(true);
});

it("landing squash shares the position animation and returns to the exact foot anchor", () => {
  for (const vertical of [false, true]) {
    const frames = travelFrames(
      { x: 0, y: 0 },
      { x: 80, y: 20 },
      "forward",
      vertical,
    );
    const landing = frames.find((f) => f.offset === 0.88);
    expect(landing?.transform).toContain(
      vertical ? "scale(0.9,1.07)" : "scale(1.07,0.9)",
    );
    expect(frames.at(-1)?.transform).toBe("translate3d(80px,20px,0)");
  }
});
it("visual movement classification never changes a destination or a rule", () => {
  expect(classifyTravel({ kind: "warp" })).toBe("warp");
  expect(classifyTravel({ kind: "warp" }, true)).toBe("drag");
  expect(classifyTravel({ kind: "move", from: 5, to: 2, why: "主移动" })).toBe(
    "backward",
  );
  expect(classifyTravel({ kind: "move", from: 5, to: 8, why: "被拉动" })).toBe(
    "drag",
  );
  expect(classifyTravel({ kind: "move", from: 5, to: 8, why: "箭头" })).toBe(
    "forward",
  );
});
it("camera stays inside its safe area and clamps to the scrollable range", () => {
  expect(cameraTarget(300, 844, 100, 1800)).toBeNull();
  expect(cameraTarget(700, 844, 100, 1800)).toBe(378);
  expect(cameraTarget(-100, 844, 100, 1800)).toBe(0);
  expect(cameraTarget(900, 844, 1200, 1800)).toBe(956);
});
it("manual dragging pauses automatic follow for 3 seconds after the latest gesture", () => {
  let now = 0;
  const pause = new ManualCameraPause(() => now);
  expect(pause.remaining()).toBe(0);
  pause.manual();
  now = 2999;
  expect(pause.remaining()).toBe(1);
  pause.manual();
  now = 3001;
  expect(pause.remaining()).toBe(2998);
  now = 5999;
  expect(pause.remaining()).toBe(0);
});
