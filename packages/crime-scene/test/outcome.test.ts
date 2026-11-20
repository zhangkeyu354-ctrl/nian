import { describe, expect, it } from "vitest";
import { accuse, finishHunt, type OutcomeState } from "../src/outcome.ts";

const base = (n = 6): OutcomeState => ({
  phase: "round1_search", roles: n === 6
    ? ["forensic", "killer", "accomplice", "witness", "investigator", "investigator"]
    : ["forensic", "killer", "investigator", "investigator"],
  badges: Array(n).fill(true), answer: { owner: 1, clue: "手套", means: "钢管" },
  players: Array.from({ length: n }, (_, seat) => ({ seat, clues: ["手套", "钥匙"], means: ["钢管", "斧头"], excludedClues: [] })),
  winner: null, hunt: null,
});

describe("破案、徽章和反杀", () => {
  it("好人正确破案进入反杀，4 人局直接好人胜", () => {
    expect(accuse(base(), 4, { owner: 1, clue: "手套", means: "钢管" }).phase).toBe("witness_hunt");
    expect(accuse(base(4), 2, { owner: 1, clue: "手套", means: "钢管" }).winner).toBe("good");
  });

  it("好人徽章全部耗尽即坏人胜，坏人徽章不参与计数", () => {
    const state = base(4);
    state.badges[3] = false;
    const next = accuse(state, 2, { owner: 1, clue: "钥匙", means: "钢管" });
    expect(next.winner).toBe("evil");
    expect(next.badges[1]).toBe(true);
  });

  it("拒绝指认自己、已排除牌和无徽章破案", () => {
    expect(() => accuse(base(), 4, { owner: 4, clue: "钥匙", means: "钢管" })).toThrow();
    const s = base(); s.players[1].excludedClues = ["钥匙"];
    expect(() => accuse(s, 4, { owner: 1, clue: "钥匙", means: "钢管" })).toThrow();
    s.badges[4] = false;
    expect(() => accuse(s, 4, { owner: 1, clue: "手套", means: "钢管" })).toThrow();
  });

  it("反杀只允许调查员或目击者；命中与未命中分别结算", () => {
    const s = accuse(base(), 4, { owner: 1, clue: "手套", means: "钢管" });
    expect(() => finishHunt(s, 0)).toThrow();
    expect(finishHunt(s, 3).winner).toBe("evil");
    expect(finishHunt(s, 5).winner).toBe("good");
    expect(finishHunt(s, null).winner).toBe("good");
  });

  it("扭转局势赠送的机会可在原徽章耗尽后使用，错误时只消耗赠送机会", () => {
    const s = base(4);
    s.badges[2] = false;
    s.badges[3] = false;
    s.bonusAttempts = [0, 0, 1, 0];
    const next = accuse(s, 2, { owner: 1, clue: "钥匙", means: "钢管" });
    expect(next.bonusAttempts?.[2]).toBe(0);
    expect(next.winner).toBe("evil");
  });
});
