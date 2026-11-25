import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";

describe("炼金实验室泄露", () => {
  function withMonster(pos: number[], rolls: number[], start = 0) {
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos,
      rolls,
      track: "twisty-twirl",
      skipSetup: true,
    });
    const set = (q: typeof s) => {
      q.race!.twist!.triggered = true;
      q.race!.twist!.drawn = [9];
      q.race!.twist!.monster = { pos: start };
    };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    return s;
  }
  it("抽到事件时怪物从起点出发，并在该回合结束掷独立骰移动", () => {
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos: [13, 20, 25],
      rolls: [1, 4],
      track: "twisty-twirl",
      skipSetup: true,
    });
    s.race!.twist!.remaining = [9];
    const snapshot = JSON.parse(s.turn!.snapshot);
    snapshot.race.twist.remaining = [9];
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(after.race!.twist!.drawn).toEqual([9]);
    expect(after.race!.twist!.monster?.pos).toBe(4);
    expect(tok(after, "twin").pos).toBe(14);
  });

  it("怪物只淘汰严格超越的运动员，同格停下不淘汰", () => {
    const after = answer(withMonster([1, 3, 8], [1, 3]), "roll");
    expect(after.race!.twist!.monster?.pos).toBe(3);
    expect(tok(after, "twin").out).toBe(true);
    expect(tok(after, "banana").out).toBe(false);
    expect(tok(after, "lovable_loser").out).toBe(false);
  });

  it("怪物抵达虚拟终点后停止行动，不领取名次", () => {
    const after = answer(withMonster([2, 8, 18], [1, 4], 27), "roll");
    expect(after.race!.twist!.monster).toEqual({ pos: 30, finished: true });
    expect(after.race!.finishers).toEqual([]);
    expect(after.race!.tokens.every(t => !t.out)).toBe(true);
  });
});
