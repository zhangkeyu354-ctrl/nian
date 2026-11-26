import { expect, it } from "vitest";
import { createMAGame, reduceMA } from "../src/engine.ts";

it("旅馆、挪挪和巨婴的强制连锁不会耗尽调用栈", () => {
  const n = 8, g = 21;
  const maps = ["mild", "wild", "twisty-twirl", "whirly-world"] as const;
  let rng = (g * 7919 + n * 31 + 1) >>> 0;
  const rnd = (k: number) => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return (rng >>> 8) % k;
  };
  const schedule = Array.from({ length: 4 }, () => maps[rnd(4)]);
  let s = createMAGame({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    seed: rng,
    settings: { schedule, deal: "random", secondWindPreview: true },
  });
  for (let steps = 0; steps < 2000 && s.phase !== "over"; steps++) {
    if (s.phase === "draft") {
      const d = s.draft!;
      s = reduceMA(s, { type: "DRAFT", player: d.order[d.step], racer: d.pool[rnd(d.pool.length)] });
    } else if (s.phase === "choose") {
      const p = s.players.find(x => !x.choices.length)!;
      const free = p.hand.filter(r => !p.used.includes(r));
      s = reduceMA(s, { type: "CHOOSE", player: p.id, racer: free[rnd(free.length)] });
    } else {
      const pending = s.pending!;
      s = reduceMA(s, { type: "ANSWER", player: pending.player, value: pending.options[rnd(pending.options.length)].value });
    }
  }
  expect(s.phase).toBe("over");
});
