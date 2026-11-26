// 整局模拟：给 Twist 整局去重的测试与 1000 局验收脚本共用
import { createMAGame, reduceMA } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";
import type { TrackId } from "../src/track-registry.ts";

/** 跑完一整局，记录每场抽到的事件、每场开局时的事件状态 */
export function playMatch(seed: number, schedule: TrackId[], players = 3, matchDeck = true) {
  let rng = (seed * 2654435761) >>> 0;
  const rnd = (k: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return (rng >>> 8) % k; };
  let s: MAState = createMAGame({
    players: Array.from({ length: players }, (_, i) => ({ id: "p" + i, name: "P" + i })),
    seed: (seed * 2246822519 + 374761393) >>> 0,
    settings: { schedule: [...schedule], deal: "random", secondWindPreview: true, ...(matchDeck ? { twistMatchDeck: true } : {}) },
  });
  const drawsByRace: number[][] = schedule.map(() => []);
  const startTwist: unknown[] = [];
  let seenLog = 0, lastRace = -1, stalled = false;
  for (let step = 0; s.phase !== "over"; step++) {
    // 已知的僵局（例如「随机性消失」把骰子固定成 1 + 黏黏怪减速，所有人主移动为 0）：比赛永远结束不了。
    // 这是现有规则组合的问题，不属于本次修改范围；这里单独记为 stalled，只统计僵局前抽到的事件。
    if (step > 1000) { stalled = true; break; }
    if (s.phase === "choose") {
      const p = s.players.find((x) => !x.choices.length)!;
      const free = p.hand.filter((r) => !p.used.includes(r));
      s = reduceMA(s, { type: "CHOOSE", player: p.id, racer: free[rnd(free.length)] });
    } else if (s.pending) {
      const o = s.pending.options;
      s = reduceMA(s, { type: "ANSWER", player: s.pending.player, value: o[rnd(o.length)].value });
    } else throw new Error("没有待决定事项");
    if (s.race && s.race.index !== lastRace && !s.race.finale) {
      lastRace = s.race.index;
      startTwist[lastRace] = structuredClone(s.race.twist ?? null);
    }
    for (; seenLog < s.log.length; seenLog++) {
      const m = /抽到 Twist 事件 (\d+)/.exec(s.log[seenLog].text);
      if (m) drawsByRace[s.race!.index].push(Number(m[1]));
    }
  }
  return { s, drawsByRace, startTwist, stalled };
}

