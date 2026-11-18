export type StoryMoment = 'before' | 'victory' | 'defeat';
export interface StoryChapter { title: string; lines: string[]; image: string; imageAlt: string }

// 原创故事，仅用于战役试玩；不参与任何游戏规则结算。
// 主线：无署名的信 → 青蛙王子被偷走的印章 → 墓地里的兜帽人
const chapters: Record<string, Partial<Record<StoryMoment, StoryChapter>>> = {
  puppet: {
    before: { title: '序章 · 城堡来信', image: '/assets/bf/story/puppet.webp', imageAlt: '木偶骑士在城堡门前拿着一封信，冒险团站在对面', lines: [
      '一封没有署名的信，将冒险团带到一座古老的城堡。',
      '守门的木偶转过身：“想进去？先让我看看，你们会不会互相照顾。”',
    ] },
    victory: { title: '通往王座的信', image: '/assets/bf/story/puppet.webp', imageAlt: '木偶骑士手持信封与冒险团相遇', lines: [
      '木偶停了下来，一只信封从它怀里滑落。',
      '信里只有一句话：“去找青蛙王子。别忘了问他关于印章的事。”',
    ] },
  },
  prince: {
    before: { title: '第一章 · 被偷走的印章', image: '/assets/bf/story/prince.webp', imageAlt: '青蛙王子坐在王座上翻找空盒子', lines: [
      '王座上，青蛙王子正对着一只空盒子发脾气。',
      '“又是来打听印章的？昨晚它就不见了——小偷，就是你们吧！”',
    ] },
    victory: { title: '下一条线索', image: '/assets/bf/story/prince.webp', imageAlt: '青蛙王子在王座上查看盒子，冒险团在一旁', lines: [
      '王子喘着气，终于肯说实话：“昨晚……我看见一个戴兜帽的人抱着印章，往城外的墓地去了。”',
      '盒底只剩半块印章碎片，背面刻着和那封信一样的花纹。暮色降临，冒险团向墓地出发。',
    ] },
  },
  soulHuntress: {
    before: { title: '第二章 · 墓地里的兜帽人', image: '/assets/bf/bg/graveyard.webp', imageAlt: '月光下的墓地，墓碑之间飘着幽蓝鬼火', lines: [
      '墓地深处，一个兜帽身影正把另外半块印章举向月光。',
      '她回过头，声音冷得像墓碑：“写信叫你们来的人……可没告诉你们，这里是我的猎场。”',
    ] },
  },
};

export function getStory(mode: string, bossId: string, moment: StoryMoment): StoryChapter | null {
  return mode === 'campaign' ? chapters[bossId]?.[moment] ?? null : null;
}
