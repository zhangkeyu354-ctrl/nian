import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BOSS_ORDER } from '../../../packages/boss-fighters/src/index.ts';
import { getStory, storyImages } from '../src/bf/story.ts';

const pub = (p: string) => existsSync(join(process.cwd(), 'apps/web/public', p));

describe('魔王试炼战役剧情', () => {
  it('只在战役模式出现', () => {
    for (const id of BOSS_ORDER) expect(getStory('single', id, 'before')).toBeNull();
  });

  it('失败不显示胜利剧情', () => {
    expect(getStory('campaign', 'puppet', 'defeat')).toBeNull();
  });

  it('十一关战前与胜利剧情齐全，每张插画要么已存在、要么有可用的场景背景', () => {
    for (const id of BOSS_ORDER) {
      for (const m of ['before', 'victory'] as const) {
        const c = getStory('campaign', id, m);
        expect(c, `${id} ${m}`).not.toBeNull();
        expect(c!.lines.length, `${id} ${m} 文本`).toBeGreaterThan(0);
        expect(pub(c!.image) || (!!c!.fallback && pub(c!.fallback)), `${id} ${m} 图`).toBe(true);
      }
    }
    expect(storyImages().length).toBeGreaterThan(10);
  });

  it('每关胜利剧情都把玩家引向下一关', () => {
    // 结尾里点到下一关的关键词，防止改剧情时把线索弄断
    const next: Record<string, RegExp> = {
      puppet: /青蛙王子/, prince: /墓地/, soulHuntress: /水晶/, aetherDragon: /石魔像|熔炉/, stoneGolem: /食人妖/,
      ogre: /海边洞窟|深海/, tentacolossus: /火山/, magmaros: /滴答/, bombossa: /果冻/, jelly: /木偶|巫毒/,
    };
    for (const [id, re] of Object.entries(next)) expect(getStory('campaign', id, 'victory')!.lines.join(''), id).toMatch(re);
  });
});
