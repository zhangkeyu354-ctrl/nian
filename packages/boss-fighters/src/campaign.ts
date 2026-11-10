// 战役：冒险团存档、解锁、战利品、牌组整理、升级（05 J/O 节：官方内容清单 + 卡面星级）
import { BOSSES, BOSS_ORDER } from './bosses/index.ts';
import { ITEMS_BY_STAR, LOOT, CARDS } from './data/cards.ts';
import { IDENTITIES } from './data/heroes.ts';
import type { Difficulty, GameState, ItemId, SetupOptions } from './types.ts';

export interface CampaignHero {
  name: string;
  race: string;
  cls: string;
  loot: string[]; // 已拥有的战利品卡（每星级最多带 1 张进牌组）
  removed: string[]; // 从牌组移除的行动卡
}

export interface Campaign {
  name: string;
  heroes: CampaignHero[];
  progress: number; // 已通关的最高关卡序号（-1=还没打教学）
  results: Record<string, { best?: Difficulty; losses: number }>;
  lootStorage: string[]; // 没被选走的战利品（之后可替换）
  pendingLoot: { stars: number; offer: string[]; picked: Record<number, string> } | null;
  gone: string[]; // 永久移出游戏的卡（神灯）
}

export class CampaignError extends Error {}

const DIFF_ORDER: Difficulty[] = ['beginner', 'advanced', 'pro', 'insane'];

export function newCampaign(name: string, heroes: { name: string; race: string; cls: string }[]): Campaign {
  if (heroes.length < 2 || heroes.length > 4) throw new CampaignError('人数需为 2–4 人');
  return { name, heroes: heroes.map((h) => ({ ...h, loot: [], removed: [] })), progress: -1, results: {}, lootStorage: [], pendingLoot: null, gone: [] };
}

/** 打败第 k 关解锁的内容（官方内容清单） */
export function unlocks(progress: number) {
  return {
    advancedCards: progress >= 0, // 教学后：铜箱 32 张进阶卡
    curseBatches: ([1, 2, 3] as const).filter((b) => progress >= b), // 1★ 第 1 关后、2★ 第 2 关后、3★ 第 3 关后
    items: Object.entries(ITEMS_BY_STAR).filter(([st]) => progress >= Number(st)).flatMap(([, it]) => it) as ItemId[],
    raceLevel: progress >= 5 ? 3 : progress >= 3 ? 2 : 1, // 英雄 2 级卡 3★、3 级卡 5★
    clsLevel: progress >= 8 ? 3 : progress >= 6 ? 2 : 1, // 职业 2 级卡 6★、3 级卡 8★
  };
}

export function canFight(c: Campaign, bossId: string) {
  const b = BOSSES[bossId];
  return !!b && b.order <= c.progress + 1;
}

/** 生成某场战斗的开局参数 */
export function setupFor(c: Campaign, bossId: string, difficulty: Difficulty, seed: number): SetupOptions {
  if (!canFight(c, bossId)) throw new CampaignError('这一关还没解锁');
  const u = unlocks(c.progress);
  const order = BOSSES[bossId].order;
  return {
    bossId, difficulty, seed,
    items: u.items,
    curseBatches: u.curseBatches.filter((b) => b <= Math.max(1, order)),
    heroes: c.heroes.map((h) => {
      const id = IDENTITIES[h.race];
      const cl = IDENTITIES[h.cls];
      const adv = u.advancedCards && order >= 1 ? [...id.advanced, ...cl.advanced] : [];
      // 重打低关：只能带星级 ≤ 该关的战利品（项目参与者论坛说明）
      const loot = h.loot.filter((x) => (CARDS[x]?.stars ?? 99) <= Math.max(order, 0) && !c.gone.includes(x));
      return {
        name: h.name, race: h.race, cls: h.cls,
        raceLevel: u.raceLevel, clsLevel: u.clsLevel,
        extraCards: [...adv, ...loot].filter((x) => !c.gone.includes(x)),
        removed: h.removed,
      };
    }),
  };
}

export function deckSize(c: Campaign, seat: number) {
  const h = c.heroes[seat];
  const u = unlocks(c.progress);
  const base = 12 + (u.advancedCards ? 8 : 0);
  return base + h.loot.length - h.removed.length;
}

/** 战斗结束后记录结果；首次打赢新关卡 → 发战利品（每星级 5 张，全队每人选 1 张） */
export function recordResult(c: Campaign, g: GameState): Campaign {
  const n: Campaign = structuredClone(c);
  const b = BOSSES[g.bossId];
  const r = (n.results[g.bossId] ??= { losses: 0 });
  if (g.phase !== 'won') {
    r.losses += 1;
    return n;
  }
  if (!r.best || DIFF_ORDER.indexOf(g.difficulty) > DIFF_ORDER.indexOf(r.best)) r.best = g.difficulty;
  for (const e of g.events) if (e.kind === 'exileForever') n.gone.push(LOOT.find((x) => x.name === e.title)?.id ?? e.title);
  if (b.order > n.progress) {
    n.progress = b.order;
    const stars = b.order;
    const offer = LOOT.filter((x) => x.stars === stars).map((x) => x.id);
    if (offer.length) n.pendingLoot = { stars, offer, picked: {} };
  }
  return n;
}

/** 战利品选择：每人从这批里选 1 张（不能两人选同一张），没选走的进收纳盒 */
export function pickLoot(c: Campaign, seat: number, card: string): Campaign {
  const n: Campaign = structuredClone(c);
  const p = n.pendingLoot;
  if (!p) throw new CampaignError('现在没有可选的战利品');
  if (!p.offer.includes(card)) throw new CampaignError('这张卡不在这批战利品里');
  if (Object.entries(p.picked).some(([s, x]) => x === card && Number(s) !== seat)) throw new CampaignError('这张已经被队友选走了');
  p.picked[seat] = card;
  if (Object.keys(p.picked).length === Math.min(n.heroes.length, p.offer.length)) {
    for (const [s, x] of Object.entries(p.picked)) {
      const h = n.heroes[Number(s)];
      const stars = CARDS[x].stars;
      const old = h.loot.find((y) => CARDS[y].stars === stars);
      if (old) {
        h.loot = h.loot.filter((y) => y !== old);
        n.lootStorage.push(old);
      }
      h.loot.push(x);
    }
    n.lootStorage.push(...p.offer.filter((x) => !Object.values(p.picked).includes(x)));
    n.pendingLoot = null;
  }
  return n;
}

/** 从收纳盒换一张同星级战利品（战斗之间可以重新选择，官方） */
export function swapLoot(c: Campaign, seat: number, card: string): Campaign {
  const n: Campaign = structuredClone(c);
  if (!n.lootStorage.includes(card)) throw new CampaignError('收纳盒里没有这张卡');
  const h = n.heroes[seat];
  const stars = CARDS[card].stars;
  const old = h.loot.find((y) => CARDS[y].stars === stars);
  n.lootStorage = n.lootStorage.filter((x) => x !== card);
  if (old) {
    h.loot = h.loot.filter((y) => y !== old);
    n.lootStorage.push(old);
  }
  h.loot.push(card);
  return n;
}

/** 牌组整理：每拥有 1 张战利品可移除 1 张行动卡，牌组至少 20 张（官方） */
export function setRemoved(c: Campaign, seat: number, removed: string[]): Campaign {
  const n: Campaign = structuredClone(c);
  const h = n.heroes[seat];
  if (removed.length > h.loot.length) throw new CampaignError(`最多只能移除 ${h.loot.length} 张（每张战利品换 1 张）`);
  const own = [...IDENTITIES[h.race].cards, ...IDENTITIES[h.cls].cards, ...IDENTITIES[h.race].advanced, ...IDENTITIES[h.cls].advanced];
  for (const x of removed) if (!own.includes(x)) throw new CampaignError('只能移除你自己的行动卡');
  h.removed = removed;
  if (deckSize(n, seat) < 20 && unlocks(n.progress).advancedCards) throw new CampaignError('牌组至少要 20 张');
  return n;
}

export { BOSS_ORDER };
