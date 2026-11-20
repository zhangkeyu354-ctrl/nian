import { describe, expect, it } from "vitest";
import {
  secretTestimony, traceable, reversal, misinformation, evidenceExclusion,
  countdown, finishEventBrief, type EventState,
} from "../src/events.ts";

const base = (): EventState => ({
  phase: "round2_search", round: 2, forensicSeat: 0,
  roles: ["forensic", "killer", "accomplice", "witness", "investigator", "investigator"],
  tiles: ["death", "location-1", "scene-01", "scene-02", "scene-03", "scene-04"],
  orangeDeck: ["scene-05", "scene-06", "scene-07", "scene-08", "scene-09", "scene-10"],
  markers: { death: 0, "location-1": 1, "scene-01": 2, "scene-02": 3, "scene-03": 4, "scene-04": 5 },
  badges: [false, true, true, true, false, true],
  bonusAttempts: Array(6).fill(0), lastFailed: 4,
  players: Array.from({ length: 6 }, (_, seat) => ({ seat, clues: ["手套", "钥匙"], excludedClues: [] as string[] })),
  answer: { owner: 1, clue: "手套", means: "钢管" },
  countdownActive: false, winner: null,
});

describe("六个特殊事件", () => {
  it("秘密证供仅由目击者指定橙板，专家从橙堆补牌；无目击者跳过", () => {
    const s = secretTestimony(base(), 3, "scene-02", "scene-05");
    expect(s.tiles).toContain("scene-05");
    expect(s.tiles).not.toContain("scene-02");
    expect(s.markers["scene-05"]).toBeUndefined();
    expect(() => secretTestimony(base(), 3, "death", "scene-05")).toThrow();
    const noWitness = base(); noWitness.roles[3] = "investigator";
    expect(secretTestimony(noWitness, null, null, null)).toEqual(noWitness);
  });

  it("有据可寻抽五块只可用其中一块替换橙板", () => {
    const s = traceable(base(), 0, ["scene-05", "scene-06", "scene-07", "scene-08", "scene-09"], "scene-07", "scene-03");
    expect(s.tiles).toContain("scene-07");
    expect(s.orangeDeck).toContain("scene-05");
    expect(s.orangeDeck).not.toContain("scene-07");
    expect(() => traceable(base(), 0, ["scene-05", "scene-06", "scene-07", "scene-08", "scene-09"], "scene-07", "death")).toThrow();
  });

  it("扭转局势给上一位失败者一次额外机会；无人适用则补抽橙板", () => {
    expect(reversal(base(), "scene-05").bonusAttempts[4]).toBe(1);
    const s = base(); s.lastFailed = null;
    expect(reversal(s, "scene-05").orangeDeck).not.toContain("scene-05");
  });

  it("错误信息可移动紫、绿或橙板标记，但必须换到另一选项", () => {
    expect(misinformation(base(), 0, "death", 3).markers.death).toBe(3);
    expect(misinformation(base(), 0, "location-1", 2).markers["location-1"]).toBe(2);
    expect(() => misinformation(base(), 0, "death", 0)).toThrow();
  });

  it("证据排除逆时针跳过专家，凶手不能翻关键证物，翻面牌不能指认", () => {
    const s = evidenceExclusion(base(), 5, "钥匙");
    expect(s.players[5].excludedClues).toEqual(["钥匙"]);
    expect(s.exclusionNext).toBe(4);
    expect(() => evidenceExclusion(base(), 1, "手套")).toThrow();
  });

  it("倒数计时替换两块橙板，简报仍可破案，简报结束无人破案则坏人胜", () => {
    const s = countdown(base(), 0, ["scene-01", "scene-02"], ["scene-05", "scene-06"]);
    expect(s.tiles).toContain("scene-05");
    expect(s.tiles).toContain("scene-06");
    expect(s.countdownActive).toBe(true);
    expect(finishEventBrief({ ...s, phase: "round2_brief" }).winner).toBe("evil");
    expect(finishEventBrief({ ...s, phase: "round2_brief", winner: "good" }).winner).toBe("good");
  });
});
