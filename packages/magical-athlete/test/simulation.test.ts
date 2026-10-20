import { describe, expect, it } from "vitest";
import { createMAGame, reduceMA, total } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { DRAFTABLE } from "../src/racers.ts";
import type { MAState } from "../src/types.ts";

/** 用固定种子的伪随机数替玩家做所有选择，完整打完一整局 */
function playGame(seed: number, n: number) {
  let rnd = seed * 7919 + 1;
  const rand = (k: number) => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd % k;
  };
  let s: MAState = createMAGame({
    players: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i })),
    seed,
  });
  let steps = 0;
  while (s.phase !== "over") {
    if (++steps > 5000) throw new Error("没打完：" + seed);
    if (s.phase === "draft") {
      const d = s.draft!;
      s = reduceMA(s, { type: "DRAFT", player: d.order[d.step], racer: d.pool[rand(d.pool.length)] });
    } else if (s.phase === "choose") {
      const p = s.players.find((p) => !p.choice)!;
      const left = p.hand.filter((r) => !p.used.includes(r));
      s = reduceMA(s, { type: "CHOOSE", player: p.id, racer: left[rand(left.length)] });
    } else {
      const p = s.pending!;
      expect(p, "比赛中必须有待决定事项").toBeTruthy();
      s = reduceMA(s, { type: "ANSWER", player: p.player, value: p.options[rand(p.options.length)].value });
      // 隐私：别人看不到待决定选项、牌堆与重放快照
      const other = s.players.find((x) => x.id !== s.pending?.player)!;
      const v = viewForMA(s, other.id) as Record<string, unknown>;
      expect(v.deck).toBeUndefined();
      expect(v.turn).toBeUndefined();
      if (s.pending) expect((v.pending as { options: unknown[] }).options).toEqual([]);
    }
    for (const t of s.race?.tokens ?? []) {
      expect(t.pos).toBeGreaterThanOrEqual(0);
      expect(t.pos).toBeLessThanOrEqual(30);
    }
  }
  return s;
}

describe("魔法运动员 · 整局模拟", () => {
  for (const n of [3, 4, 5, 6])
    it(`${n} 人：25 局随机对局都能打完，每人用完 4 名不同选手`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const s = playGame(seed * 13 + n, n);
        expect(s.phase).toBe("over");
        for (const p of s.players) {
          expect(p.hand).toHaveLength(4);
          expect(new Set(p.used).size).toBe(4);
        }
        // 每场最多发出一金一银
        const gold = s.players.flatMap((p) => p.chips).filter((c) => c.kind === "gold");
        expect(gold.length).toBeLessThanOrEqual(4);
        expect(s.players.every((p) => total(p.chips) >= 0)).toBe(true);
      }
    }, 120_000);

  it("选秀池只包含已确认的 35 名选手（飞艇待确认）", () => {
    expect(DRAFTABLE).toHaveLength(35);
    expect(DRAFTABLE).not.toContain("blimp");
  });

  it("相同种子与相同操作得到相同结果（可重放）", () => {
    expect(JSON.stringify(playGame(99, 4))).toBe(JSON.stringify(playGame(99, 4)));
  }, 60_000);
  it("场上只剩兔子时比赛能结束（种子 446，原先会无限打盹）", () => {
    expect(playGame(446, 4).phase).toBe("over");
  }, 60_000);
});
