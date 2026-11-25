import { describe, expect, it } from "vitest";
import { __testRunUnit, __testStateKey, testRace } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import { tok } from "./helpers.ts";

function replayRockDuel(die: number): MAState {
    let s = testRace({
      racers: ["sw_the_hose", "sw_diva", "banana"],
      pos: [5, 5, 0], tripped: [true, true, false],
      rolls: Array(30).fill(die), track: "wild", secondWindPreview: true, skipSetup: true,
    });
    // Third racer yields the initial pending stand-up. Remove it from the
    // actual replay before any action, leaving the exact two-racer case.
    s.race!.tokens[2].out = true;
    const initial = JSON.parse(s.turn!.snapshot) as MAState;
    initial.race!.tokens[2].out = true;
    s.turn!.snapshot = JSON.stringify(initial);
    for (let i = 0; i < 100 && s.phase === "race"; i++) {
      const pending = s.pending;
      const prior = s.turn;
      const snapshot = prior?.snapshot ?? JSON.stringify({ ...s, pending: null, turn: null });
      const answers = pending ? [...prior!.answers, pending.options[0].value] : [];
      const res = __testRunUnit(snapshot, answers);
      s = res.s;
      s.pending = res.need;
      s.turn = res.need ? { snapshot, answers } : null;
    }
    return s;
}

describe("石头格快捷判定与完整行动回放", () => {
  it.each([1, 2, 3, 4, 5, 6])("骰点 %i 下两位选手仍无法离开石头格", die => {
    const quick = testRace({ racers: ["sw_the_hose", "sw_diva"], pos: [5, 5], tripped: [true, true], rolls: Array(30).fill(die), track: "wild", secondWindPreview: true, skipSetup: true });
    const replayed = replayRockDuel(die);
    expect(quick.race!.over).toBe(true);
    expect(tok(replayed, "sw_the_hose").pos).toBe(5);
    expect(tok(replayed, "sw_diva").pos).toBe(5);
    expect(replayed.log.some(l => l.fx?.kind === "move" || l.fx?.kind === "finish")).toBe(false);
    expect(replayed.race!.finishers).toEqual([]);
  });
});

describe("同位置连锁的局面指纹", () => {
  it("分数或持续事件变化时不是同一局面", () => {
    const s = testRace({ racers: ["sw_streaker", "huge_baby", "banana"], pos: [9, 12, 0], track: "wild", secondWindPreview: true, skipSetup: true });
    const base = __testStateKey(s);
    const scored = structuredClone(s);
    scored.players[0].chips.push({ kind: "bronze", value: 1, race: 0 });
    expect(__testStateKey(scored)).not.toBe(base);
    const event = structuredClone(s);
    event.race!.twist = { triggered: true, remaining: [], drawn: [6], fixedDice: { p1: 2 } };
    expect(__testStateKey(event)).not.toBe(base);
  });
});
