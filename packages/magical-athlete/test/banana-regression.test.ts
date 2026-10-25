import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";

describe("香蕉：每段前进移动都检查经过", () => {
  it.each([
    [0, 3, 4, 4], // 普通主移动
    [3, 5, 4, 10], // 经过香蕉后停箭头，再前进
    [10, 14, 6, 13], // 经过香蕉后停后退箭头
    [3, 8, 4, 10], // 箭头移动本身经过香蕉
    [8, 10, 3, 12], // 经过香蕉后停另一处箭头
  ])("从 %i 出发，香蕉在 %i，掷 %i 后应摔倒", (from, banana, roll, end) => {
    const s = answer(testRace({racers: ["twin", "banana", "lovable_loser"], pos: [from, banana, 20], rolls: [roll], skipSetup: true, track: "wild"}), "roll");
    expect(tok(s, "twin").pos).toBe(end);
    expect(tok(s, "twin").tripped).toBe(true);
    expect(s.log.some(l => l.fx?.kind === "power" && l.fx.racer === "banana")).toBe(true);
  });

  it("啦啦队长的技能移动经过香蕉后落箭头，也摔倒", () => {
    let s = testRace({racers: ["cheerleader", "twin", "banana"], pos: [20, 5, 6], rolls: [], skipSetup: true, track: "wild"});
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "twin").tripped).toBe(true);
  });
});
