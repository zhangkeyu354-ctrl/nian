import { describe, expect, it } from "vitest";
import { beginRoundOne, placeMarker, beginBrief, nextSpeaker, replaceScene } from "../src/rounds.ts";

describe("搜证与简报", () => {
  const base = () => beginRoundOne(6, 2, "location-1", ["scene-01", "scene-02", "scene-03", "scene-04"]);

  it("第一轮六块板各放一次标记，放下不能移动", () => {
    let s = base();
    expect(s.tiles).toHaveLength(6);
    s = placeMarker(s, 2, "death", 0);
    expect(s.markers.death).toBe(0);
    expect(() => placeMarker(s, 2, "death", 1)).toThrow();
    expect(() => placeMarker(s, 3, "location-1", 0)).toThrow();
  });

  it("简报从专家左边开始顺时针，专家不发言", () => {
    let s = base();
    for (const tile of s.tiles) s = placeMarker(s, 2, tile, 0);
    s = beginBrief(s, 1000);
    expect(s.speaker).toBe(3);
    const spoken = [s.speaker];
    while (s.phase === "round1_brief") { s = nextSpeaker(s, 1000); if (s.phase === "round1_brief") spoken.push(s.speaker); }
    expect(spoken).toEqual([3, 4, 5, 0, 1]);
    expect(s.phase).toBe("round2_search");
  });

  it("第二轮只可替换一块橙色板，原标记收回", () => {
    let s = base();
    for (const tile of s.tiles) s = placeMarker(s, 2, tile, 0);
    s = beginBrief(s, 1000);
    for (let i = 0; i < 5; i++) s = nextSpeaker(s, 1000);
    s = replaceScene(s, 2, "scene-01", "scene-05");
    expect(s.tiles).not.toContain("scene-01");
    expect(s.tiles).toContain("scene-05");
    expect(s.markers["scene-05"]).toBeUndefined();
    expect(() => replaceScene(s, 2, "scene-02", "scene-06")).toThrow();
  });
});

import { beginRoundOne as _b1, placeMarker as _pm, beginBrief as _bb, extendSpeaker as _ex, nextSpeaker as _ns } from "../src/rounds.ts";
describe("发言延长（用户裁定：每人每轮一次）", () => {
  it("同一位发言人第二次延长被拒绝，换下一位后可以再延长", () => {
    let s = _b1(5, 0, "location-1", ["scene-01", "scene-02", "scene-03", "scene-04"]);
    for (const tile of s.tiles) s = _pm(s, 0, tile, 0);
    s = _bb(s, 1000);
    s = _ex(s);
    expect(s.speechDurationMs).toBe(150000);
    expect(() => _ex(s)).toThrow();
    s = _ns(s, 2000);
    expect(_ex(s).speechDurationMs).toBe(150000);
  });
});
