import { describe, expect, it } from "vitest";
import { beginHunt, suggestTarget, submitHunt, expireHunt } from "../src/hunt.ts";

describe("目击者反杀协商", () => {
  const roles = ["forensic", "killer", "accomplice", "witness", "investigator", "investigator"] as const;

  it("双方可建议，只有凶手能提前提交", () => {
    let s = beginHunt([...roles], 1000);
    s = suggestTarget(s, 2, 3, 2000);
    expect(s.suggestions[2]).toBe(3);
    expect(() => submitHunt(s, 2, 2000)).toThrow();
    s = suggestTarget(s, 1, 4, 3000);
    expect(submitHunt(s, 1, 4000).winner).toBe("good");
  });

  it("超时优先凶手当前选择，再用帮凶建议，均未选则好人胜", () => {
    const s = beginHunt([...roles], 1000);
    expect(expireHunt(s, 61000).winner).toBe("good");
    const helper = suggestTarget(s, 2, 3, 2000);
    expect(expireHunt(helper, 61000).winner).toBe("evil");
    const killer = suggestTarget(helper, 1, 4, 3000);
    expect(expireHunt(killer, 61000).winner).toBe("good");
  });

  it("不能选公开专家、凶手或帮凶，也不能超时后改票", () => {
    const s = beginHunt([...roles], 1000);
    for (const target of [0, 1, 2]) expect(() => suggestTarget(s, 1, target, 2000)).toThrow();
    expect(() => suggestTarget(s, 1, 3, 61000)).toThrow();
  });
});
