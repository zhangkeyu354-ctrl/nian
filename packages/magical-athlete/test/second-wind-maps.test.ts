import { describe, expect, it } from "vitest";
import {
  SECOND_WIND_MAPS,
  physicalProgress,
  warpDestination,
} from "../src/second-wind-maps.ts";

describe("Second Wind 用户确认的地图结构", () => {
  for (const id of ["twisty-twirl", "whirly-world"] as const) {
    it(`${id}: 0起点、1–29可停留、30虚拟终点`, () => {
      const m = SECOND_WIND_MAPS[id];
      expect(m.spaces.map((s) => s.index)).toEqual(
        Array.from({ length: 30 }, (_, i) => i),
      );
      expect(
        m.spaces.filter((s) => s.edge === "top").map((s) => s.index),
      ).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      expect(
        m.spaces.filter((s) => s.edge === "right").map((s) => s.index),
      ).toEqual([13, 14]);
      expect(
        m.spaces.filter((s) => s.edge === "bottom").map((s) => s.index),
      ).toEqual(Array.from({ length: 15 }, (_, i) => i + 15));
      expect(m.finishBoundary).toBe(30);
      expect(m.corners).toEqual([12, 15]);
      expect(
        m.spaces.every(
          (s) =>
            s.x >= 0 &&
            s.y >= 0 &&
            s.x + s.width <= m.canvas[0] &&
            s.y + s.height <= m.canvas[1],
        ),
      ).toBe(true);
    });
  }
  it("六组通道、十二个端点，17只连接22", () => {
    expect(SECOND_WIND_MAPS["whirly-world"].warpPairs).toEqual([
      [4, 6],
      [8, 12],
      [11, 15],
      [17, 22],
      [20, 23],
      [24, 28],
    ]);
    expect(
      new Set(SECOND_WIND_MAPS["whirly-world"].warpPairs.flat()).size,
    ).toBe(12);
    expect(warpDestination("whirly-world", 17, [])).toEqual({
      to: 22,
      pair: "17:22",
    });
  });
  it("同一链只用一次，新链恢复；无端点/其他地图无传送", () => {
    expect(warpDestination("whirly-world", 22, ["17:22"])).toBeNull();
    expect(warpDestination("whirly-world", 22, [])).toEqual({
      to: 17,
      pair: "17:22",
    });
    expect(warpDestination("whirly-world", 20, [])).toEqual({
      to: 23,
      pair: "20:23",
    });
    expect(warpDestination("twisty-twirl", 17, [])).toBeNull();
    expect(warpDestination("whirly-world", 25, [])).toBeNull();
  });
  it("进度与物理编号分离，方向改变不改配对", () => {
    expect(physicalProgress(4, 1)).toBe(4);
    expect(physicalProgress(4, -1)).toBe(26);
    expect(physicalProgress(30, -1)).toBe(0);
    expect(physicalProgress(0, -1)).toBe(30);
  });
});
