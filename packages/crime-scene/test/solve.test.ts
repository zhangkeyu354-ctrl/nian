import { describe, expect, it } from "vitest";
import { judgeSolve } from "../src/solve.ts";

const answer = { owner: 2, clue: "手套", means: "钢管" };

describe("破案判定", () => {
  it("原版：任何非专家（含帮凶）正确指认都算破案", () => {
    expect(judgeSolve("accomplice", answer, answer).kind).toBe("correct");
    expect(judgeSolve("investigator", answer, answer).kind).toBe("correct");
  });

  it("坏人选错才公开错误并消耗徽章", () => {
    expect(judgeSolve("killer", { ...answer, clue: "钥匙" }, answer)).toEqual({ kind: "wrong", consumeBadge: true, broadcast: "错！" });
  });

  it("好人选中真证据才进入成功流程", () => {
    expect(judgeSolve("investigator", answer, answer)).toEqual({ kind: "correct" });
    expect(judgeSolve("witness", { ...answer, means: "斧头" }, answer).kind).toBe("wrong");
  });

  it("鉴证专家不能破案", () => {
    expect(() => judgeSolve("forensic", answer, answer)).toThrow();
  });
});
