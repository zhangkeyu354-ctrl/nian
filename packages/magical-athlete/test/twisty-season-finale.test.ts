import { describe, expect, it } from "vitest";
import { reduceMA, testRace } from "../src/engine.ts";
import { answer } from "./helpers.ts";

function finale() {
  const s = testRace({
    racers: ["twin", "banana", "lovable_loser"],
    pos: [13, 29, 29],
    rolls: [1, 1, 1],
    track: "twisty-twirl",
    skipSetup: true,
  });
  const prepare = (q: typeof s) => { q.race!.twist!.remaining = [12]; };
  prepare(s);
  const snapshot = JSON.parse(s.turn!.snapshot);
  prepare(snapshot);
  s.turn!.snapshot = JSON.stringify(snapshot);
  return s;
}

describe("季终决战", () => {
  it("抽牌后仍跑完正常比赛，再从第二弯道开启独立决赛且不预发奖牌", () => {
    let s = answer(finale(), "roll");
    expect(s.race!.twist!.drawn).toEqual([12]);
    expect(s.race!.tokens).toHaveLength(3);
    s = answer(s, "roll");
    expect(s.race!.finishers).toEqual(["banana"]);
    s = answer(s, "roll");
    expect(s.phase).toBe("race");
    expect(s.race!.index).toBe(0);
    expect(s.race!.instanceId).toBe("finale:0");
    expect(s.race!.finaleOrigin?.instanceId).toBe("normal:0");
    expect(s.race!.finale).toBe(true);
    expect(s.race!.tokens.map(t => t.racer)).toEqual(["banana", "lovable_loser"]);
    expect(s.race!.tokens.map(t => t.pos)).toEqual([15, 15]);
    expect(s.race!.current).toBe("p2");
    const start = s.log.findLast(e => e.fx?.kind === "start")?.fx;
    expect(start).toMatchObject({ kind: "start", finale: true, positions: { banana: 15, lovable_loser: 15 } });
    expect(s.players.every(p => p.chips.every(c => c.kind !== "gold" && c.kind !== "silver"))).toBe(true);
  });

  it("决赛胜者独得金银奖池，正常赛程场次不增加", () => {
    let s = answer(answer(answer(finale(), "roll"), "roll"), "roll");
    const points = s.settings.points[0];
    const prepare = (q: typeof s) => {
      q.race!.tokens[0].pos = 29;
      q.race!.tokens[1].pos = 29;
      q.forcedRolls = [1, 1];
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    s = answer(s, "roll");
    s = answer(s, "roll");
    expect(s.players[1].chips.filter(c => c.race === 0 && c.kind === "gold").map(c => c.value)).toEqual([points.gold + points.silver]);
    expect(s.players.flatMap(p => p.chips).filter(c => c.race === 0 && c.kind === "silver")).toEqual([]);
    expect(s.race!.index).toBe(0);
    expect(s.phase).toBe("choose");
    s.settings.schedule[1] = "mild";
    for (const [i, racer] of ["hare", "skipper", "legs"].entries()) {
      const owner = `p${i + 1}`;
      s.players[i].hand.push(racer);
      s = reduceMA(s, { type: "CHOOSE", player: owner, racer });
    }
    expect(s.race!.index).toBe(1);
    expect(s.race!.track).toBe("mild");
  });

  it("镜像后抽到决赛，从反向第二弯道第 12 格出发且不重抽 Twist", () => {
    const s = testRace({
      racers: ["twin", "banana", "lovable_loser"],
      pos: [13, 1, 1],
      rolls: [1, 1, 1],
      track: "twisty-twirl",
      skipSetup: true,
    });
    const prepare = (q: typeof s) => { q.race!.twist!.remaining = [10, 2, 12]; q.rng = 0; };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    let after = answer(s, "roll");
    expect(after.race!.twist!.drawn).toEqual([10, 2, 12]);
    after = answer(answer(after, "roll"), "roll");
    expect(after.race!.finale).toBe(true);
    expect(after.race!.twist?.reversed).toBe(true);
    expect(after.race!.tokens.map(t => t.pos)).toEqual([12, 12]);
    expect(after.race!.twist?.remaining).toEqual([]);
  });

  it("军师获第二名但未实际冲线时，不凭空凑成两名决赛选手", () => {
    const s = testRace({
      racers: ["twin", "banana", "mastermind"],
      pos: [13, 29, 10],
      rolls: [1, 1],
      track: "twisty-twirl",
      skipSetup: true,
    });
    const prepare = (q: typeof s) => {
      q.race!.twist!.remaining = [12];
      q.race!.mastermindPick = "banana";
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(answer(s, "roll"), "roll");
    expect(after.race!.finale).toBeUndefined();
    expect(after.phase).toBe("choose");
    expect(after.players[1].chips.some(c => c.kind === "gold")).toBe(true);
    expect(after.players[2].chips.some(c => c.kind === "silver")).toBe(true);
  });
});
