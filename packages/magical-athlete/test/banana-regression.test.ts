import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";

describe("香蕉：每段前进移动都检查经过", () => {
  it("原版半人马技能击退后经过香蕉也摔倒", () => {
    const s = answer(
      testRace({
        racers: ["centaur", "twin", "banana"],
        pos: [3, 4, 3],
        rolls: [2],
        skipSetup: true,
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(2);
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("原版人字拖传送到后退箭头，箭头后退经过香蕉摔倒", () => {
    let s = testRace({
      racers: ["flip_flop", "twin", "banana"],
      pos: [0, 16, 14],
      skipSetup: true,
      track: "wild",
    });
    s = answer(s, "flip:twin");
    expect(tok(s, "flip_flop").pos).toBe(13);
    expect(tok(s, "flip_flop").tripped).toBe(true);
  });
  it("后退主移动经过香蕉，吸盘鱼同组也各自摔倒", () => {
    let s = testRace({
      racers: ["twin", "suckerfish", "banana", "sw_le_saboteur"],
      pos: [10, 10, 9, 0],
      rolls: [3],
      skipSetup: true,
      secondWindPreview: true,
    });
    s = answer(s, "roll");
    s = answer(s, "yes");
    expect(tok(s, "twin").tripped).toBe(true);
    expect(tok(s, "suckerfish").tripped).toBe(true);
  });
  it("倒霉狗反向主移动也触发；后退停在香蕉同格不算经过", () => {
    const s = answer(
      testRace({
        racers: ["sw_blunderdog", "banana", "twin"],
        pos: [10, 9, 20],
        rolls: [2],
        skipSetup: true,
        secondWindPreview: true,
      }),
      "roll",
    );
    expect(tok(s, "sw_blunderdog").tripped).toBe(true);
    const same = answer(
      testRace({
        racers: ["sw_blunderdog", "banana", "twin"],
        pos: [10, 8, 20],
        rolls: [2],
        skipSetup: true,
        secondWindPreview: true,
      }),
      "roll",
    );
    expect(tok(same, "sw_blunderdog").tripped).toBe(false);
  });
  it("后退经过复制香蕉的山寨猫同样摔倒", () => {
    const s = answer(
      testRace({
        racers: ["twin", "copycat", "banana", "sw_le_saboteur"],
        pos: [10, 9, 20, 0],
        rolls: [3],
        skipSetup: true,
        secondWindPreview: true,
      }),
      "roll",
    );
    expect(tok(s, "twin").tripped).toBe(true);
  });
  it("直接传送越过香蕉仍不算经过", () => {
    const s = answer(
      testRace({
        racers: ["flip_flop", "twin", "banana"],
        pos: [10, 0, 5],
        skipSetup: true,
      }),
      "flip:twin",
    );
    expect(tok(s, "flip_flop").tripped).toBe(false);
  });
  it.each([
    [0, 3, 4, 4], // 普通主移动
    [3, 5, 4, 10], // 经过香蕉后停箭头，再前进
    [10, 14, 6, 13], // 经过香蕉后停后退箭头
    [3, 8, 4, 10], // 箭头移动本身经过香蕉
    [8, 10, 3, 12], // 经过香蕉后停另一处箭头
  ])("从 %i 出发，香蕉在 %i，掷 %i 后应摔倒", (from, banana, roll, end) => {
    const s = answer(
      testRace({
        racers: ["twin", "banana", "lovable_loser"],
        pos: [from, banana, 20],
        rolls: [roll],
        skipSetup: true,
        track: "wild",
      }),
      "roll",
    );
    expect(tok(s, "twin").pos).toBe(end);
    expect(tok(s, "twin").tripped).toBe(true);
    expect(
      s.log.some((l) => l.fx?.kind === "power" && l.fx.racer === "banana"),
    ).toBe(true);
  });

  it("啦啦队长的技能移动经过香蕉后落箭头，也摔倒", () => {
    let s = testRace({
      racers: ["cheerleader", "twin", "banana"],
      pos: [20, 5, 6],
      rolls: [],
      skipSetup: true,
      track: "wild",
    });
    s = answer(s, "yes");
    expect(tok(s, "twin").pos).toBe(10);
    expect(tok(s, "twin").tripped).toBe(true);
  });
});
