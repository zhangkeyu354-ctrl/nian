import { describe, expect, it } from 'vitest';
import { newCampaign } from '../src/campaign.ts';

import { changeHero, ownActionCards } from '../src/campaign.ts';
describe('战斗之间换英雄（官方规则）', () => {
  it('能换职业和种族，战利品保留，移除的行动卡清空', () => {
    let c = newCampaign('t', [{ name: 'a', race: 'dwarf', cls: 'warrior' }, { name: 'b', race: 'elf', cls: 'mage' }]);
    c = { ...c, progress: 2, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, loot: ['loot_blade_wind'], removed: [ownActionCards(c, 0)[0]] } : h)) };
    const n = changeHero(c, 0, 'troll', 'druid');
    expect(n.heroes[0].race).toBe('troll');
    expect(n.heroes[0].cls).toBe('druid');
    expect(n.heroes[0].loot).toEqual(['loot_blade_wind']);
    expect(n.heroes[0].removed).toEqual([]);
    expect(() => changeHero(c, 0, 'elf', 'druid')).toThrow();
  });
});
