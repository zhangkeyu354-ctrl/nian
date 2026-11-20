import { describe, expect, it } from "vitest";
import { beginNight, chooseEvidence, advanceNight } from "../src/night.ts";

describe("案发夜晚", () => {
  const players = [
    { seat: 0, clues: [], means: [] },
    { seat: 1, clues: ["手套", "钥匙"], means: ["钢管", "斧头"] },
    { seat: 2, clues: [], means: [] },
  ];

  it("凶手提前选牌也统一等满 60 秒及随机延迟", () => {
    const start = beginNight(players, 1, 1000, () => 0);
    const chosen = chooseEvidence(start, 1, "手套", "钢管", 2000);
    expect(advanceNight(chosen, 60999).phase).toBe("night_killer");
    expect(advanceNight(chosen, 61000).phase).toBe("round1_search");
    expect(chosen.answer).toEqual({ owner: 1, clue: "手套", means: "钢管" });
  });

  it("超时由服务端随机选一对合法手牌", () => {
    const start = beginNight(players, 1, 1000, () => 0);
    const ended = advanceNight(start, 61000, () => 0);
    expect(ended.phase).toBe("round1_search");
    expect(ended.answer).toEqual({ owner: 1, clue: "手套", means: "钢管" });
  });

  it("拒绝其他座位代选、非法手牌和超时后的选牌", () => {
    const start = beginNight(players, 1, 1000, () => 0);
    expect(() => chooseEvidence(start, 2, "手套", "钢管", 2000)).toThrow();
    expect(() => chooseEvidence(start, 1, "图钉", "钢管", 2000)).toThrow();
    expect(() => chooseEvidence(start, 1, "手套", "钢管", 61000)).toThrow();
  });
});
