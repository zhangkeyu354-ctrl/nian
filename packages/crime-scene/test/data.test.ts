import { describe, expect, it } from "vitest";
import clues from "../../../data/crime-scene/clues.json" with { type: "json" };
import means from "../../../data/crime-scene/means.json" with { type: "json" };
import tiles from "../../../data/crime-scene/tiles.json" with { type: "json" };
import roles from "../../../data/crime-scene/roles.json" with { type: "json" };

describe("用户提供的犯罪现场数据", () => {
  it("牌数、唯一性和关键译名准确", () => {
    expect(clues).toHaveLength(200);
    expect(means).toHaveLength(90);
    expect(new Set(clues.map((card) => card.name)).size).toBe(200);
    expect(new Set(means.map((card) => card.name)).size).toBe(90);
    expect(clues.some((card) => card.name === "麻将")).toBe(true);
    expect(means.some((card) => card.name === "工作")).toBe(true);
    expect(means.some((card) => card.name === "过劳")).toBe(false);
    expect(means.some((card) => card.name === "烟雾")).toBe(true);
  });

  it("场景和事件完整，待核词条保留标记", () => {
    expect(tiles.filter((tile) => tile.kind === "death")).toHaveLength(1);
    expect(tiles.filter((tile) => tile.kind === "location")).toHaveLength(4);
    expect(tiles.filter((tile) => tile.kind === "scene")).toHaveLength(21);
    expect(tiles.filter((tile) => tile.kind === "event")).toHaveLength(6);
    expect(tiles.filter((tile) => "needsVerify" in tile)).toEqual([]);
    expect(roles).toHaveLength(5);
  });
});
