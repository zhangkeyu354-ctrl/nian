import { describe, expect, it } from 'vitest';
import { getStory } from '../src/bf/story.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('魔王试炼故事试玩', () => {
  it('仅在战役展示木偶和王子的战前与胜利章节', () => {
    for (const id of ['puppet', 'prince']) {
      expect(getStory('campaign', id, 'before')?.lines.length).toBeGreaterThan(0);
      expect(getStory('campaign', id, 'victory')?.lines.length).toBeGreaterThan(0);
      const image = getStory('campaign', id, 'before')!.image;
      expect(existsSync(join(process.cwd(), 'apps/web/public', image))).toBe(true);
      expect(getStory('single', id, 'before')).toBeNull();
    }
  });
  it('失败和未编写的魔王不会展示胜利剧情', () => {
    expect(getStory('campaign', 'puppet', 'defeat')).toBeNull();
    expect(getStory('campaign', 'stoneGolem', 'before')).toBeNull();
    // 王子结尾指向墓地，下一关灵魂女猎手必须有战前剧情接上
    expect(getStory('campaign', 'soulHuntress', 'before')?.lines.join('')).toContain('印章');
  });
});
