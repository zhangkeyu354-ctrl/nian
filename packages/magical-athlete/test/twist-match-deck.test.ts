// Twist 事件整局（Match）不重复：用户 2026-11-26 要求
import { describe, expect, it } from "vitest";
import { createMAGame } from "../src/engine.ts";
import { playMatch } from "./twist-match-sim.ts";
import { viewForMA } from "../src/privacy.ts";
import type { TrackId } from "../src/track-registry.ts";

const dupes = (xs: number[]) => xs.length - new Set(xs).size;

describe("Twist 事件整局去重", { timeout: 300_000 }, () => {
  it("四场都是扭扭赛道：40 局里同一局抽到的事件 0 重复，且大多数局四场都翻了卡", () => {
    let total = 0, fourDistinct = 0, chaos = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { drawsByRace } = playMatch(seed, ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"]);
      const all = drawsByRace.flat();
      expect(dupes(all), `seed ${seed}: ${JSON.stringify(drawsByRace)}`).toBe(0);
      total += all.length;
      if (drawsByRace.every((d) => d.length)) fourDistinct++;
      if (drawsByRace.slice(0, 3).some((d) => d.includes(10)) ) chaos++;
    }
    expect(total).toBeGreaterThan(80);
    expect(fourDistinct).toBeGreaterThan(20);
    expect(chaos).toBeGreaterThan(0); // 「观众渴求混乱」在前三场出现过，额外两张也计入去重
  });

  it("扭扭、温和、扭扭、螺旋：两场扭扭事件不重复，中间的赛道不消耗事件", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { drawsByRace, s } = playMatch(seed, ["twisty-twirl", "mild", "twisty-twirl", "whirly-world"]);
      expect(drawsByRace[1]).toEqual([]);
      expect(drawsByRace[3]).toEqual([]);
      expect(dupes(drawsByRace.flat())).toBe(0);
      expect(s.twistPool!.length + drawsByRace.flat().length).toBe(13);
    }
  });

  it("「观众渴求混乱」额外抽的两张不会在后面的场次再出现", () => {
    let checked = 0;
    for (let seed = 1; seed <= 200 && checked < 2; seed++) {
      const { drawsByRace } = playMatch(seed, ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"]);
      const i = drawsByRace.findIndex((d, r) => r < 3 && d[0] === 10 && d.length === 3);
      if (i < 0) continue;
      const later = drawsByRace.slice(i + 1).flat();
      for (const extra of drawsByRace[i].slice(1)) expect(later).not.toContain(extra);
      expect(later).not.toContain(10);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("新的一局重新是完整 13 张，允许和上一局重复", () => {
    const sched: TrackId[] = ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"];
    const a = playMatch(11, sched), b = playMatch(12, sched);
    expect(createMAGame({ players: [{ id: "a", name: "A" }, { id: "b", name: "B" }], seed: 5, settings: { schedule: sched, twistMatchDeck: true } }).twistPool)
      .toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    // 两局各自不重复，但两局之间可以有相同事件
    expect(dupes(a.drawsByRace.flat())).toBe(0);
    expect(dupes(b.drawsByRace.flat())).toBe(0);
    let shared = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const x = playMatch(seed, sched).drawsByRace.flat(), y = playMatch(seed + 1000, sched).drawsByRace.flat();
      if (x.some((c) => y.includes(c))) shared++;
    }
    expect(shared).toBeGreaterThan(0);
  });

  it("每场开局：本场事件效果是干净的（不继承上一场的镜像、怪物、固定骰等），但整局抽卡记录保留", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { startTwist, drawsByRace, s, stalled } = playMatch(seed, ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"]);
      if (stalled) continue;
      for (const t of startTwist) expect(t).toEqual({ triggered: false, remaining: [], drawn: [] });
      expect(s.twistPool!.length).toBe(13 - drawsByRace.flat().length);
    }
  });

  it("客户端看不到还没抽的牌", () => {
    const { s } = playMatch(3, ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"]);
    const v = viewForMA(s, "p0") as Record<string, unknown>;
    expect(v.twistPool).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("twistPool");
  });

  it("旧房间（没有整局牌堆标记）保持原来的每场 13 张，重放结果不变", () => {
    const old = playMatch(7, ["twisty-twirl", "twisty-twirl", "twisty-twirl", "twisty-twirl"], 3, false);
    expect(old.s.twistPool).toBeUndefined();
    expect(old.s.settings.twistMatchDeck).toBeUndefined();
    for (const t of old.startTwist) expect((t as { remaining: number[] }).remaining).toHaveLength(13);
  });
});
