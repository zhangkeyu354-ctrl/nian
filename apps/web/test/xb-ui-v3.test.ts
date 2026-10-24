import { expect, it, vi, afterEach } from "vitest";
import { safeGet, safeSet, claimOnce, revealAge } from "../src/xb/storage.ts";
afterEach(() => vi.unstubAllGlobals());
it("引导/身份提示与动画标记只认领一次，存储被拒绝时内存回退不崩溃", () => {
  const getItem = vi.fn(() => {
      throw Error("denied");
    }),
    setItem = vi.fn(() => {
      throw Error("denied");
    });
  vi.stubGlobal("localStorage", { getItem, setItem });
  vi.stubGlobal("sessionStorage", { getItem, setItem });
  expect(claimOnce("onboarding-test", "local")).toBe(true);
  expect(claimOnce("onboarding-test", "local")).toBe(false);
  for (const role of ["guesser", "truth", "bluffer"]) {
    expect(claimOnce("hint-test:" + role, "local")).toBe(true);
    expect(claimOnce("hint-test:" + role, "local")).toBe(false);
  }
  safeSet("session", "draft-test", "保留");
  expect(safeGet("session", "draft-test")).toBe("保留");
});
it("加载与后台返回按服务器揭晓时刻恢复，不从0重复播放；旧局无锚点直接完成", () => {
  expect(revealAge(1000, 1500)).toBe(500);
  expect(revealAge(1000, 20000)).toBe(12000);
  expect(revealAge(0, 20000)).toBe(12000);
});
