// 完整四场赛程模拟：二代两图与一代混排，开/关新角色，2–8 人，随机发牌，随机决定，直到比赛结束
import { createMAGame, reduceMA } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import type { MAState } from "../packages/magical-athlete/src/types.ts";
const maps = ["mild", "wild", "twisty-twirl", "whirly-world"] as const;
const games = Number(process.env.N ?? 100);
let done = 0, finales = 0, checkRequired = 0, races = 0;
const byTrack: Record<string, number> = {};
const failures: string[] = [];
for (const sw of (process.env.SW ? [process.env.SW === "1"] : [false, true])) for (const n of [2, 3, 4, 6, 8]) for (let g = 1; g <= games; g++) {
  let rng = (g * 7919 + n * 31 + (sw ? 1 : 0)) >>> 0;
  const rnd = (k: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return (rng >>> 8) % k; };
  const schedule = Array.from({ length: 4 }, () => maps[rnd(4)]);
  let s: MAState;
  try {
    s = createMAGame({ players: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i })), seed: rng,
      settings: { schedule: [...schedule], deal: g % 2 ? "random" : "draft", ...(sw ? { secondWindPreview: true } : {}) } });
    let step = 0, lastIdx = -1;
    while (s.phase !== "over") {
      if (++step > 30000) throw new Error("步数超限（疑似卡死）");
      if (s.phase === "draft") { const d = s.draft!; s = reduceMA(s, { type: "DRAFT", player: d.order[d.step], racer: d.pool[rnd(d.pool.length)] }); }
      else if (s.phase === "choose") { const p = s.players.find((x) => !x.choices.length)!; const free = p.hand.filter((r) => !p.used.includes(r)); s = reduceMA(s, { type: "CHOOSE", player: p.id, racer: free[rnd(free.length)] }); }
      else if (s.pending) { const o = s.pending.options; s = reduceMA(s, { type: "ANSWER", player: s.pending.player, value: o[rnd(o.length)].value }); }
      else throw new Error("比赛中没有待决定事项却未结束");
      if (s.race && s.race.index !== lastIdx) {
        lastIdx = s.race.index; races++;
        if (s.race.track !== schedule[lastIdx]) throw new Error(`第${lastIdx + 1}场地图不符`);
        byTrack[s.race.track] = (byTrack[s.race.track] ?? 0) + 1;
      }
      if (s.race?.finale && s.race.tokens.length === 2 && !s.race.over) finales += 0;
      viewForMA(s, "p0");
    }
    finales += s.log.filter((l) => /决赛/.test(l.text) && /开始/.test(l.text)).length ? 1 : 0;
    const medals = s.players.flatMap((p) => p.chips.filter((c) => c.kind === "gold"));
    if (new Set(medals.map((c) => c.race)).size !== medals.length) throw new Error("同场多枚金牌");
    done++;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/CHECK_REQUIRED|待裁定/.test(m)) checkRequired++;
    failures.push(`sw=${sw} n=${n} g=${g} [${schedule}] ${m}`);
  }
}
console.log(JSON.stringify({ done, total: games * 10, races, byTrack, gamesWithFinale: finales, checkRequired, failures: failures.slice(0, 30), failureCount: failures.length }, null, 1));
if (failures.length) process.exitCode = 1;
