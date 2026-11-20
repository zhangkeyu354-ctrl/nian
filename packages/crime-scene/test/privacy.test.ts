import { describe, expect, it } from "vitest";
import { viewFor, type SecretState } from "../src/privacy.ts";

const state: SecretState = {
  phase: "night_killer",
  forensicSeat: 0,
  roles: ["forensic", "killer", "accomplice", "witness", "investigator", "investigator"],
  answer: { owner: 1, clue: "手套", means: "钢管" },
  players: Array.from({ length: 6 }, (_, seat) => ({ seat, clues: ["手套"], means: ["钢管"] })),
};

describe("犯罪现场按座位过滤秘密", () => {
  it("调查员看不到身份、答案和夜晚操作进度", () => {
    const view = viewFor(state, 4);
    expect(view.myRole).toBe("investigator");
    expect(view.answer).toBeUndefined();
    expect(view.roles).toBeUndefined();
    expect(view.witnessCandidates).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("nightChoice");
  });

  it("目击者只知道两名嫌疑人，不知道对应身份或答案", () => {
    const view = viewFor(state, 3);
    expect(view.witnessCandidates).toEqual([1, 2]);
    expect(view.answer).toBeUndefined();
    expect(view.roles).toBeUndefined();
    expect(viewFor({ ...state, phase: "round2_search" }, 3).witnessCandidates).toEqual([1, 2]);
    expect(viewFor({ ...state, answer: undefined }, 3).witnessCandidates).toBeUndefined();
  });

  it("专家、凶手和帮凶看到答案，其他人不能", () => {
    for (const seat of [0, 1, 2]) expect(viewFor(state, seat).answer).toEqual(state.answer);
    for (const seat of [3, 4, 5]) expect(viewFor(state, seat).answer).toBeUndefined();
    expect(viewFor(state, 1).evilPartnerSeat).toBe(2);
    expect(viewFor(state, 2).evilPartnerSeat).toBe(1);
    expect(viewFor(state, 4).evilPartnerSeat).toBeUndefined();
  });

  it("结算后所有人看到完整身份和答案", () => {
    const view = viewFor({ ...state, phase: "result" }, 5);
    expect(view.roles).toEqual(state.roles);
    expect(view.answer).toEqual(state.answer);
  });
});
