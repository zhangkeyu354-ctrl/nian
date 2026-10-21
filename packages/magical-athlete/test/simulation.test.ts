import { describe, expect, it } from "vitest";
import { createMAGame, reduceMA, total } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
import { DRAFTABLE } from "../src/racers.ts";
import type { MAState } from "../src/types.ts";

/** 用固定种子的伪随机数替玩家做所有选择，完整打完一整局 */
function playGame(seed: number, n: number, variant: "standard" | "double" = "standard", deal: "draft" | "random" = "draft") {
  let rnd = seed * 7919 + 1;
  const rand = (k: number) => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd % k;
  };
  let s: MAState = createMAGame({
    players: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i })),
    seed,
    settings: { variant, deal },
  });
  let steps = 0;
  while (s.phase !== "over") {
    if (++steps > 5000) throw new Error("没打完：" + seed);
    if (s.phase === "draft") {
      const d = s.draft!;
      s = reduceMA(s, { type: "DRAFT", player: d.order[d.step], racer: d.pool[rand(d.pool.length)] });
    } else if (s.phase === "choose") {
      const p = s.players.find((p) => !p.choices.length)!;
      const left = p.hand.filter((r) => !p.used.includes(r));
      const a = left.splice(rand(left.length), 1)[0];
      const picks = s.settings.variant === "double" ? [a, left[rand(left.length)]] : [a];
      s = reduceMA(s, { type: "CHOOSE", player: p.id, racers: picks });
    } else {
      const p = s.pending!;
      expect(p, "比赛中必须有待决定事项").toBeTruthy();
      // 随机玩家：可选能力多数时候不用（全随机时 2 人局会出现催眠师来回拉人、几百回合打不完的局面）
      const no = p.options.find((o) => o.value === "no");
      const value = no && rand(10) < 7 ? no.value : p.options[rand(p.options.length)].value;
      s = reduceMA(s, { type: "ANSWER", player: p.player, value });
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
  for (const n of [2, 3, 4, 5, 6, 7, 8])
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

  for (const [n, label] of [[2, "2 人"], [3, "3 人双选手"]] as const)
    it(`${label}：25 局随机对局都能打完，每人 8 名选手、每场派 2 名`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const s = playGame(seed * 17 + n, n, "double");
        expect(s.phase).toBe("over");
        for (const p of s.players) {
          expect(p.hand).toHaveLength(8);
          expect(new Set(p.used).size).toBe(8);
        }
      }
    }, 120_000);

  for (const n of [2, 3, 4, 5, 6, 7, 8])
    it(`随机模式 ${n} 人：开局每人随机 4 名、全场不重复，25 局都能打完`, () => {
      const hands = new Set<string>();
      for (let seed = 1; seed <= 25; seed++) {
        const s0 = createMAGame({
          players: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i })),
          seed: seed * 31 + n,
          settings: { deal: "random" },
        });
        expect(s0.phase).toBe("choose");
        expect(s0.draft).toBeNull();
        const all = s0.players.flatMap((p) => p.hand);
        for (const p of s0.players) expect(p.hand).toHaveLength(4);
        expect(new Set(all).size).toBe(4 * n); // 没有任何两人拿到同一名选手
        for (const r of all) expect(DRAFTABLE).toContain(r);
        expect(s0.deck).toHaveLength(36 - 4 * n);
        hands.add(s0.players[0].hand.join());
        const s = playGame(seed * 31 + n, n, "standard", "random");
        expect(s.phase).toBe("over");
        for (const p of s.players) expect(new Set(p.used).size).toBe(4);
      }
      // 不同种子发到的牌不同（确实是随机）
      expect(hands.size).toBeGreaterThan(20);
    }, 120_000);

  it("每场结束有领奖台（1、2 名拿分，第 3 名不计分），最后一场后有总冠军", () => {
    for (const n of [2, 3, 4, 6])
      for (let seed = 1; seed <= 8; seed++) {
        const s = playGame(seed * 7 + n, n);
        const pods = s.log.flatMap((l) => (l.fx?.kind === "podium" ? [l.fx] : []));
        expect(pods).toHaveLength(4);
        pods.forEach((pd, i) => {
          expect(pd.race).toBe(i);
          const gold = pd.places.find((x) => x.place === 1)!;
          expect(gold.points).toBe(s.settings.points[i].gold);
          const silver = pd.places.find((x) => x.place === 2);
          if (silver) expect(silver.points).toBe(s.settings.points[i].silver);
          const third = pd.places.find((x) => x.place === 3);
          if (third) expect(third.points).toBe(0);
          // 同一名选手占两个名次，只可能是军师预测自己猜中（同时拿第 1、2 名，卡面规则）
          const [p1, p2] = [pd.places.find((x) => x.place === 1), pd.places.find((x) => x.place === 2)];
          if (p1 && p2 && p1.racer === p2.racer) expect(p1.racer).toBe("mastermind");
          else expect(new Set(pd.places.map((x) => x.racer)).size).toBe(pd.places.length);
          // 拿分的人确实拿到了这场的奖牌
          for (const x of pd.places.filter((x) => x.points > 0))
            expect(s.players.find((p) => p.id === x.owner)!.chips.some((c) => c.race === i && c.value === x.points)).toBe(true);
        });
        const champs = s.log.flatMap((l) => (l.fx?.kind === "champion" ? [l.fx] : []));
        expect(champs).toHaveLength(1);
        expect(s.log.at(-1)!.fx?.kind).toBe("champion");
        const max = Math.max(...s.players.map((p) => total(p.chips)));
        expect(champs[0].winners.sort()).toEqual(s.players.filter((p) => total(p.chips) === max).map((p) => p.id).sort());
      }
  }, 120_000);

  it("36 名选手全部进入选秀池", () => {
    expect(DRAFTABLE).toHaveLength(36);
  });

  it("相同种子与相同操作得到相同结果（可重放）", () => {
    expect(JSON.stringify(playGame(99, 4))).toBe(JSON.stringify(playGame(99, 4)));
  }, 60_000);
  it("场上只剩兔子时比赛能结束（种子 446，原先会无限打盹）", () => {
    expect(playGame(446, 4).phase).toBe("over");
  }, 60_000);
});
