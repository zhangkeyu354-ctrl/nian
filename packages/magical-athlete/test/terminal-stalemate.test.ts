import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer } from "./helpers.ts";

describe("无法结束的比赛房规", () => {
  it("固定骰下仍持续前进时一直走到终点，不提前结束", () => {
    let s = testRace({ racers: ["banana", "third_wheel"], pos: [0, 30], track: "twisty-twirl", skipSetup: true });
    const prepare = (q: typeof s) => {
      q.race!.tokens[1].place = 1;
      q.race!.finishers = ["third_wheel"];
      q.race!.twist = { triggered: true, remaining: [], drawn: [6], fixedDice: { p1: 2, p2: 2 } };
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    for (let i = 0; i < 20 && s.phase === "race"; i++) s = answer(s);
    expect(s.race!.tokens[0].place).toBe(2);
    expect(s.race!.finishers).toEqual(["third_wheel", "banana"]);
  });
  it("固定骰与终点虫潮形成完全重复的局面时保留已有金牌和得分", () => {
    let s = testRace({ racers: ["banana", "third_wheel"], pos: [23, 30], track: "twisty-twirl", skipSetup: true });
    const prepare = (q: typeof s) => {
      q.race!.tokens[1].place = 1;
      q.race!.finishers = ["third_wheel"];
      q.race!.twist = { triggered: true, remaining: [], drawn: [5, 6], fixedDice: { p1: 2, p2: 2 } };
      q.players[0].chips.push({ kind: "bronze", value: 2, race: 0 });
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    for (let i = 0; i < 20 && s.phase === "race"; i++) {
      expect(s.pending?.options).toHaveLength(1);
      s = answer(s);
    }
    expect(s.phase).not.toBe("race");
    expect(s.players[0].chips.some(c => c.kind === "silver")).toBe(false);
    expect(s.players[0].chips.some(c => c.kind === "bronze" && c.value === 2)).toBe(true);
    expect(s.players[1].chips.some(c => c.kind === "gold")).toBe(true);
    expect(s.race?.tokens[0].place).toBeNull();
  });
});
