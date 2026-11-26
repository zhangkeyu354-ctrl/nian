import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";

function mirror(pos: number[], rolls = [1, 2], cards = [2]) {
  const s = testRace({ racers: ["twin", "banana", "lovable_loser"], pos, rolls, track: "twisty-twirl", skipSetup: true });
  const set = (q: typeof s) => { q.race!.twist!.remaining = [...cards]; q.rng = 0; };
  set(s);
  const snapshot = JSON.parse(s.turn!.snapshot);
  set(snapshot);
  s.turn!.snapshot = JSON.stringify(snapshot);
  return s;
}

describe("镜像世界", () => {
  it("原地反转方向，下一名选手按反向移动", () => {
    let s = answer(mirror([13, 20, 25]), "roll");
    expect(s.race!.twist!.drawn).toEqual([2]);
    expect(s.race!.twist!.reversed).toBe(true);
    expect(s.race!.tokens.map(x => x.pos)).toEqual([14, 20, 25]);
    s = answer(s, "roll");
    expect(tok(s, "banana").pos).toBe(18);
  });

  it("旧起点上的运动员按行动顺序立即冲过新的终点", () => {
    const s = answer(mirror([13, 0, 0]), "roll");
    expect(s.race!.finishers).toEqual(["banana", "lovable_loser"]);
    expect(tok(s, "banana").place).toBe(1);
    expect(tok(s, "lovable_loser").place).toBe(2);
    expect(tok(s, "twin").place).toBeNull();
  });

  it("反向前进从第1格冲到物理0终点", () => {
    const s = mirror([1, 10, 20], [2]);
    const set = (q: typeof s) => { q.race!.twist!.triggered = true; q.race!.twist!.drawn = [2]; q.race!.twist!.reversed = true; };
    set(s);
    const snapshot = JSON.parse(s.turn!.snapshot);
    set(snapshot);
    s.turn!.snapshot = JSON.stringify(snapshot);
    const after = answer(s, "roll");
    expect(after.race!.finishers[0]).toBe("twin");
    expect(tok(after, "twin").pos).toBe(0);
  });

  it("观众渴求混乱先反向，再把全员传送到新起点后一格", () => {
    const s = answer(mirror([13, 20, 25], [1], [10, 2, 3]), "roll");
    expect(s.race!.twist!.drawn).toEqual([10, 2, 3]);
    expect(s.race!.tokens.map(x => x.pos)).toEqual([29, 29, 29]);
  });

  it("同一步跨界并触及旧终点时明确拒绝未裁定的镜像落点", () => {
    expect(() => answer(mirror([13, 20, 25], [17]), "roll")).toThrow(/镜像后的落点尚待裁定/);
  });
});
