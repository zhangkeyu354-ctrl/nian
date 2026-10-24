import { describe, it, expect } from "vitest";
import { studioPolicy } from "../src/xb/art-policy.ts";
import { readFileSync, statSync } from "node:fs";
const dir = "apps/web/public/assets/xiabaiwang-v4/";
describe("录音室素材与降级", () => {
  it("省电、减少动态、节流或低配置设备使用预模糊图，无实时滤镜", () => {
    for (const caps of [
      { powerSave: true },
      { reduced: true },
      { saveData: true },
      { memory: 2 },
      { cores: 2 },
    ]) {
      const p = studioPolicy({ ...caps, width: 390 });
      expect(p.preblurred).toBe(true);
      expect(p.src).toContain("blur.webp");
      expect(p.liveBlur).toBe(false);
    }
  });
  it("普通设备按画幅选两档素材，未知硬件不误判为0核", () => {
    expect(studioPolicy({ width: 390 }).src).toContain("low.webp");
    expect(studioPolicy({ width: 1440, memory: 8, cores: 8 }).src).toContain(
      "high.webp",
    );
    expect(studioPolicy({ width: 390 }).liveBlur).toBe(true);
  });
  it("场景、十头像、字体的全部运行素材小于1.5MB，字体小于300KB", () => {
    const names = [
      "studio-low.webp",
      "studio-high.webp",
      "studio-low-blur.webp",
      "studio-high-blur.webp",
      "studio-portrait-low.webp",
      "studio-portrait-high.webp",
      "studio-portrait-low-blur.webp",
      "studio-portrait-high-blur.webp",
      ...Array.from({ length: 10 }, (_, i) => `host-${i + 1}.webp`),
      "radio-display.woff2",
    ];
    expect(
      names.reduce((n, f) => n + statSync(dir + f).size, 0),
    ).toBeLessThanOrEqual(1500000);
    expect(statSync(dir + "radio-display.woff2").size).toBeLessThan(300000);
    for (const name of names.filter((n) => n.endsWith("webp")))
      expect(
        readFileSync(dir + name)
          .subarray(8, 12)
          .toString(),
      ).toBe("WEBP");
  });
});
