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
  it("已变身咬痕回起点，作为唯一怪物追加移动", () => {
    const s = biteMarkEvent(true);
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    expect(tok(s, "sw_bite_mark").pos).toBe(3);
    expect(s.race!.twist!.monster).toBeUndefined();
  });
  it("未变身咬痕立即变身、回起点并追加移动", () => {
    const s = biteMarkEvent(false);
    expect(tok(s, "sw_bite_mark").secondWind?.wereMouth).toBe(true);
    expect(tok(s, "sw_bite_mark").pos).toBe(3);
    expect(s.race!.twist!.monster).toBeUndefined();
  });
  it("复制出的两名咬痕各自追加掷骰移动", () => {
    const s = biteMarkEvent(false, true);
    expect(s.race!.tokens.slice(0, 2).map(t => t.pos)).toEqual([2, 3]);
    expect(s.race!.twist!.monster).toBeUndefined();
    expect(s.log.flatMap(entry => entry.fx?.kind === "monster_roll" ? [entry.fx] : []))
      .toEqual([{ kind: "monster_roll", racer: "sw_bite_mark", value: 2 }, { kind: "monster_roll", racer: "twin", value: 3 }]);
  });
  it("咬痕的怪物追加移动冲线照常领取名次与金牌", () => {
    const s = testRace({ racers: ["twin", "sw_bite_mark", "banana"], pos: [0, 29, 29], rolls: [1, 1, 1], track: "twisty-twirl", skipSetup: true, secondWindPreview: true });
    const prepare = (q: typeof s) => {
      q.race!.twist!.triggered = true;
      q.race!.twist!.drawn = [9];
      q.race!.twist!.monsterRacers = ["sw_bite_mark"];
      q.race!.tokens[1].secondWind = { wereMouth: true };
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const afterFirst = answer(s, "roll");
    expect(tok(afterFirst, "sw_bite_mark").place).toBe(1);
    const afterSecond = answer(afterFirst, "roll");
    expect(afterSecond.players[1].chips.some(c => c.kind === "gold")).toBe(true);
  });
  it("咬痕追加移动只淘汰严格超越者，同格停下不淘汰", () => {
    const s = testRace({ racers: ["twin", "sw_bite_mark", "banana", "lovable_loser"], pos: [20, 0, 2, 3], rolls: [1, 3], track: "twisty-twirl", skipSetup: true, secondWindPreview: true });
    const prepare = (q: typeof s) => {
      q.race!.twist!.triggered = true;
      q.race!.twist!.drawn = [9];
      q.race!.twist!.monsterRacers = ["sw_bite_mark"];
      q.race!.tokens[1].secondWind = { wereMouth: true };
    };
    prepare(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    prepare(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(tok(after, "banana").out).toBe(true);
    expect(tok(after, "lovable_loser").out).toBe(false);
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
