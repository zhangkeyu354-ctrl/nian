import { describe, expect, it } from "vitest";
import { testRace } from "../src/engine.ts";
import { answer, tok } from "./helpers.ts";
function race(pos: number[], roll: number) {
  const s = testRace({
    racers: ["twin", "banana", "lovable_loser"],
    pos,
    rolls: [roll],
    track: "twisty-twirl",
    skipSetup: true,
  });
  s.race!.twist!.remaining = [1];
  if (s.turn) {
    const q = JSON.parse(s.turn.snapshot);
    q.race.twist.remaining = [1];
    s.turn.snapshot = JSON.stringify(q);
  }
  return s;
}
describe("扭扭赛道首次跨界与烤鸡", () => {
  it("13→14抽一次；并列末位在名单固定后各移动7格", () => {
    let s = answer(race([13, 0, 0], 1), "roll");
    expect(s.race!.twist!.drawn).toEqual([1]);
    expect(s.log.filter((entry) => entry.fx?.kind === "twist_card").map((entry) => entry.fx))
      .toEqual([{ kind: "twist_card", racer: "twin", card: 1 }]);
    expect(tok(s, "banana").pos).toBe(7);
    expect(tok(s, "lovable_loser").pos).toBe(7);
    expect(tok(s, "twin").pos).toBe(14);
  });
  it("落在13不抽，越过多格也只抽一张", () => {
    const no = answer(race([12, 0, 0], 1), "roll");
    expect(no.race!.twist!.drawn).toEqual([]);
    const yes = answer(race([12, 0, 0], 3), "roll");
    expect(yes.race!.twist!.drawn).toEqual([1]);
  });
  it("烤鸡改变触发者位置后不再按旧目的地结算", () => {
    const s = answer(race([13, 20, 20], 1), "roll");
    expect(tok(s, "twin").pos).toBe(21);
    expect(s.race!.twist!.drawn).toEqual([1]);
  });
  it("牌堆对局独立并锁定首次跨界", () => {
    const a = race([13, 0, 0], 1),
      b = race([13, 0, 0], 1);
    expect(a.race!.twist!.remaining).toEqual([1]);
    expect(b.race!.twist!.remaining).toEqual([1]);
    const done = answer(a, "roll");
    expect(done.race!.twist!.triggered).toBe(true);
    expect(done.race!.twist!.remaining).toEqual([]);
    expect(b.race!.twist!.triggered).toBe(false);
  });
  it("已实现的镜像事件反转当前比赛方向", () => {
    const s = race([13, 0, 0], 1);
    s.race!.twist!.remaining = [2];
    if (s.turn) {
      const q = JSON.parse(s.turn.snapshot);
      q.race.twist.remaining = [2];
      s.turn.snapshot = JSON.stringify(q);
    }
    const done = answer(s, "roll");
    expect(done.race!.twist!.drawn).toEqual([2]);
    expect(done.race!.twist!.reversed).toBe(true);
  });
});
