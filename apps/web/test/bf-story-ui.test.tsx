import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Story } from '../src/bf/BossFighters.tsx';

describe('剧情显示', () => {
  it('战役开场显示可折叠剧情与插画', () => {
    const html = renderToStaticMarkup(<Story mode="campaign" bossId="puppet" moment="before" />);
    expect(html).toContain('<details');
    expect(html).toContain('序章 · 城堡来信');
    expect(html).toContain('/assets/bf/story/puppet.webp');
  });
  it('自由模式和失败不显示剧情', () => {
    expect(renderToStaticMarkup(<Story mode="single" bossId="puppet" moment="before" />)).toBe('');
    expect(renderToStaticMarkup(<Story mode="campaign" bossId="puppet" moment="defeat" />)).toBe('');
  });
});
