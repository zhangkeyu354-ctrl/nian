import { describe, expect, it } from 'vitest';
import { BOSS_ORDER } from '../../../packages/boss-fighters/src/index.ts';
import { abilityHelp, BOSS_GUIDE } from '../src/bf/boss-guide.ts';

describe('魔王能力说明（只在发动后的播报里出现）', () => {
  it('11 个魔王都有说明', () => {
    for (const id of BOSS_ORDER) expect(BOSS_GUIDE[id]?.abilities.length, id).toBeGreaterThan(0);
  });
  it('能按播报标题找到说明', () => {
    expect(abilityHelp('prince', '舌鞭')).toMatch(/中毒/);
    expect(abilityHelp('prince', '不存在的能力')).toBeNull();
  });
});
