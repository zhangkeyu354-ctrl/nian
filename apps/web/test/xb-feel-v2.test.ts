import { expect, it, vi, afterEach } from "vitest";
import {
  feedback,
  feedbackPattern,
  motionPolicy,
  revealTimeline,
} from "../src/xb/feel.ts";
it("触摸不普遍震动；长按例外10ms，命中只通知被扔者", () => {
  expect(feedbackPattern("tap")).toBeNull();
  expect(feedbackPattern("tick")).toBeNull();
  expect(feedbackPattern("confirm")).toBe(10);
  expect(feedbackPattern("hit")).toEqual([30, 40, 30]);
  expect(feedbackPattern("score")).not.toBeNull();
});
it("系统减少动态优先于手动省电关闭，揭晓1200ms预热且按人分段", () => {
  expect(motionPolicy(false, true).powerSave).toBe(true);
  expect(motionPolicy(true, false).particles).toBe(false);
  expect(revealTimeline(1199, 10).visible).toBe(0);
  expect(revealTimeline(1600, 10).visible).toBe(1);
  expect(revealTimeline(12000, 10).done).toBe(true);
});

afterEach(() => vi.unstubAllGlobals());
it("反馈偏好隔离且命中不会震动旁观者", () => {
  const vibrate = vi.fn();
  vi.stubGlobal("navigator", { vibrate });
  feedback("hit", { sound: false, vibration: true }, false);
  expect(vibrate).not.toHaveBeenCalled();
  feedback("hit", { sound: false, vibration: true }, true);
  expect(vibrate).toHaveBeenLastCalledWith([30, 40, 30]);
  feedback("tap", { sound: false, vibration: true });
  expect(vibrate).toHaveBeenCalledTimes(1);
});
