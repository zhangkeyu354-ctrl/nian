// 平衡模拟：按战役进度配置（进阶卡、等级、道具、诅咒、每星级随机 1 张战利品），每个魔王 × 2/3/4 人
import { createGame, runBotGame, RACES, CLASSES, BOSSES, BOSS_ORDER, LOOT } from '../src/index.ts';
import { newCampaign, setupFor } from '../src/campaign.ts';
import type { Difficulty } from '../src/types.ts';

const N = Number(process.env.SIM_N ?? 500);
const diff = (process.env.SIM_DIFF ?? 'advanced') as Difficulty;
const only = process.env.SIM_BOSS?.split(',');

for (const bossId of BOSS_ORDER.filter((b) => !only || only.includes(b))) {
  const order = BOSSES[bossId].order;
  const row: string[] = [];
  for (const players of [2, 3, 4]) {
    let wins = 0, rounds = 0;
    for (let g = 0; g < N; g++) {
      const seed = 7919 * (order + 1) + 1000 * players + g;
      const races = shuffle(RACES, seed).slice(0, players);
      const c = newCampaign('sim', races.map((race, i) => ({ name: `P${i + 1}`, race, cls: CLASSES[(seed + i) % 4] })));
      c.progress = order - 1;
      const taken = new Set<string>();
      for (const [i, h] of c.heroes.entries()) {
        for (let st = 1; st < order; st++) {
          const opts = LOOT.filter((x) => x.stars === st && !taken.has(x.id));
          if (!opts.length) continue;
          const pick = opts[(seed + i * 7 + st) % opts.length].id;
          taken.add(pick);
          h.loot.push(pick);
        }
      }
      const s = runBotGame(createGame(setupFor(c, bossId, diff, seed)), 'coop', seed);
      if (s.phase === 'won') wins++;
      rounds += s.round;
    }
    row.push(`${players}人 ${((wins / N) * 100).toFixed(0).padStart(3)}% · ${(rounds / N).toFixed(1)}回合`);
  }
  console.log(`${String(order).padStart(2)} ${BOSSES[bossId].name.padEnd(6, '　')} ${row.join('   ')}`);
}

function shuffle<T>(a: T[], seed: number) {
  const x = a.slice();
  let r = seed;
  for (let i = x.length - 1; i > 0; i--) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    const j = r % (i + 1);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
