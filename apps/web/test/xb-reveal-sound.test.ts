import { it, expect, vi, afterEach } from "vitest";
vi.mock("../src/drawing/feel.ts", () => ({
  feel: vi.fn(),
  setNormalizedVolume: vi.fn(),
}));
import { feel } from "../src/drawing/feel.ts";
import { reveal } from "../src/xb/feel.ts";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("翻到90度才唰声并按身份盖章/滑稽声，跳过可以取消待播音效", () => {
  vi.useFakeTimers();
  const p = { sound: true, vibration: true };
  const cancel = reveal(p, "bluffer");
  expect(feel).not.toHaveBeenCalled();
  vi.advanceTimersByTime(400);
  expect(feel).toHaveBeenCalledWith(
    "page",
    expect.objectContaining({
      sound: true,
      vibration: false,
      mix: "normalized",
    }),
  );
  expect(feel).toHaveBeenCalledWith(
    "lose",
    expect.objectContaining({
      sound: true,
      vibration: false,
      mix: "normalized",
    }),
  );
  vi.clearAllMocks();
  reveal(p, "truth");
  vi.advanceTimersByTime(400);
  expect(feel).toHaveBeenCalledWith(
    "stamp",
    expect.objectContaining({
      sound: true,
      vibration: false,
      mix: "normalized",
    }),
  );
  vi.clearAllMocks();
  const stop = reveal(p, "truth");
  stop();
  vi.advanceTimersByTime(500);
  expect(feel).not.toHaveBeenCalled();
  cancel();
});
