import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";

describe("炼金实验室泄露", () => {
  function biteMarkEvent(transformed: boolean, two = false) {
    const racers = two ? ["sw_bite_mark", "twin", "banana"] : ["sw_bite_mark", "banana", "twin"];
    const s = testRace({ racers, pos: [13, 8, 20], rolls: two ? [1, 2, 3] : [1, 3], track: "twisty-twirl", skipSetup: true, secondWindPreview: true });
    const prepare = (q: typeof s) => {
      q.race!.twist!.remaining = [9];
      if (transformed) q.race!.tokens[0].secondWind = { wereMouth: true };
      if (two) q.race!.tokens[1].base = "sw_bite_mark";
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    return answer(s, "roll");
  }
  it("已变身咬痕保持位置，独立怪物照常出现", () => {
    const s = biteMarkEvent(true);
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    expect(tok(s, "sw_bite_mark").pos).toBe(14);
    expect(s.race!.twist!.monster?.pos).toBe(3);
    expect(s.log.some(entry => entry.fx?.kind === "monster_spawn")).toBe(true);
  });
  it("咬痕只因自身掷出1变身，事件不让它回起点或额外移动", () => {
    const s = biteMarkEvent(false);
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    expect(tok(s, "sw_bite_mark").pos).toBe(14);
    expect(s.race!.twist!.monster?.pos).toBe(3);
  });
  it("复制出的两名咬痕也不会追加掷骰，怪物只掷一次", () => {
    const s = biteMarkEvent(false, true);
    expect(s.race!.tokens.slice(0, 2).map(t => t.pos)).toEqual([14, 8]);
    expect(s.race!.tokens[1].secondWind?.wereMouth).toBeFalsy();
    expect(s.race!.twist!.monster?.pos).toBe(2);
    expect(s.log.flatMap(entry => entry.fx?.kind === "monster_roll" ? [entry.fx] : []))
      .toEqual([{ kind: "monster_roll", value: 2 }]);
  });
  it("独立怪物可以淘汰已变身咬痕", () => {
    const s = testRace({ racers: ["twin", "sw_bite_mark", "banana"], pos: [20, 2, 15], rolls: [1, 4], track: "twisty-twirl", skipSetup: true, secondWindPreview: true });
    const prepare = (q: typeof s) => {
      q.race!.twist!.triggered = true;
      q.race!.twist!.drawn = [9];
      q.race!.twist!.monster = { pos: 0 };
      q.race!.tokens[1].secondWind = { wereMouth: true };
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(tok(after, "sw_bite_mark").out).toBe(true);
    expect(after.race!.twist!.monster?.pos).toBe(4);
  });
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
    expect(after.log.flatMap((entry) => entry.fx?.kind === "monster_spawn" || entry.fx?.kind === "monster_roll" || entry.fx?.kind === "monster_move" ? [entry.fx] : []))
      .toEqual([
        { kind: "monster_spawn", pos: 0 },
        { kind: "monster_roll", value: 4 },
        { kind: "monster_move", from: 0, to: 4, finished: false },
      ]);
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

  it("玩家固定骰值不会被错误套到怪物的独立骰", () => {
    const s = withMonster([1, 10, 20], [5], 0);
    const setFixed = (q: typeof s) => {
      q.race!.twist!.drawn.push(6);
      q.race!.twist!.fixedDice = { p1: 2, p2: 3, p3: 4 };
    };
    setFixed(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    setFixed(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(tok(after, "twin").pos).toBe(3);
    expect(after.race!.twist!.monster?.pos).toBe(5);
    expect(after.forcedRolls).toEqual([]);
  });

  it("镜像时怪物若在旧起点，立即到达新终点且不再移动", () => {
    const s = testRace({ racers: ["twin", "banana", "lovable_loser"], pos: [13, 20, 25], rolls: [1, 4], track: "twisty-twirl", skipSetup: true });
    const prepare = (q: typeof s) => {
      q.race!.twist!.remaining = [2];
      q.race!.twist!.monster = { pos: 0 };
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(after.race!.twist!.reversed).toBe(true);
    expect(after.race!.twist!.monster).toEqual({ pos: 0, finished: true });
    expect(after.forcedRolls).toEqual([4]);
  });

  it("镜像时尚未到终点的怪物按反向独立骰移动", () => {
    const s = withMonster([13, 18, 25], [1, 3], 20);
    const prepare = (q: typeof s) => {
      q.race!.twist!.triggered = false;
      q.race!.twist!.remaining = [2];
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(after.race!.twist!.reversed).toBe(true);
    expect(after.race!.twist!.monster).toEqual({ pos: 17 });
    expect(tok(after, "banana").out).toBe(true);
    expect(tok(after, "lovable_loser").out).toBe(false);
  });
});
