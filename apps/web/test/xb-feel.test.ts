import { it, expect, vi, afterEach } from "vitest";
import { feel } from "../src/drawing/feel.ts";
afterEach(() => vi.unstubAllGlobals());
it("旧调用保留震动，XB可以单独关闭而不改绘画派对设置", () => {
  const vibrate = vi.fn();
  vi.stubGlobal("navigator", { vibrate });
  vi.stubGlobal("localStorage", { getItem: () => "0" });
  feel("tap");
  expect(vibrate).toHaveBeenCalledOnce();
  feel("tap", { sound: false, vibration: false });
  expect(vibrate).toHaveBeenCalledOnce();
  feel("stamp", { sound: false, vibration: true });
  expect(vibrate).toHaveBeenCalledTimes(2);
});
