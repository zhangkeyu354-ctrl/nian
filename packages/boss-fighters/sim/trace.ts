import { createGame, runBotGame, BOSSES } from '../src/index.ts';
import { newCampaign, setupFor } from '../src/campaign.ts';
const b = process.argv[2];
const c = newCampaign('t', [{ name: 'A', race: 'troll', cls: 'warrior' }, { name: 'B', race: 'elf', cls: 'mage' }, { name: 'C', race: 'dwarf', cls: 'druid' }]);
c.progress = BOSSES[b].order - 1;
const s = runBotGame(createGame(setupFor(c, b, 'advanced', 5)), 'coop', 5);
console.log(s.log.filter((l) => l.round <= 9).map((l) => `${l.round} ${l.text}`).slice(0, 400).join('\n'));
