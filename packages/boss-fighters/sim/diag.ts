import { createGame, runBotGame, LOOT, RACES, CLASSES, BOSSES } from '../src/index.ts';
import { newCampaign, setupFor } from '../src/campaign.ts';
const bossId = process.argv[2];
const order = BOSSES[bossId].order;
const why: Record<string, number> = {};
let bossHpLeft = 0, n = 200;
for (let g = 0; g < n; g++) {
  const c = newCampaign('d', [{ name: 'A', race: RACES[g % 4], cls: CLASSES[g % 4] }, { name: 'B', race: RACES[(g + 1) % 4], cls: CLASSES[(g + 2) % 4] }, { name: 'C', race: RACES[(g + 2) % 4], cls: CLASSES[(g + 1) % 4] }]);
  c.progress = order - 1;
  const s = runBotGame(createGame(setupFor(c, bossId, 'advanced', g + 1)), 'coop', g + 1);
  bossHpLeft += s.boss.hp / s.boss.maxHp;
  for (const l of s.log) {
    const m = l.text.match(/失去 (\d+) 点生命（([^）]+)）/);
    if (m && l.kind === 'boss') why[m[2]] = (why[m[2]] ?? 0) + Number(m[1]);
  }
}
console.log('魔王剩余生命比例', (bossHpLeft / n).toFixed(2));
console.log(Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${(v / n).toFixed(1)}`).join('  '));
