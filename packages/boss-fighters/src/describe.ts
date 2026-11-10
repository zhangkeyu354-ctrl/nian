// 卡面文字：由效果原语生成，界面显示与引擎结算同源
import { CARDS } from './data/cards.ts';
import type { DamageType, Effect, ItemId, StatusKind } from './types.ts';

export const TYPE_ZH: Record<DamageType, string> = { melee: '近战', ranged: '远程', magic: '魔法' };
export const STATUS_ZH: Record<StatusKind, string> = { poison: '中毒', panic: '惊恐', paralysis: '麻痹', fire: '着火' };
export const ITEM_ZH: Record<ItemId, { name: string; text: string; target?: boolean }> = {
  backpack: { name: '背包', text: '抽 3 张牌（每场 1 次）。' },
  potion: { name: '治疗药水', text: '一名英雄回复 8 生命（每场 1 瓶）。', target: true },
  medkit: { name: '医药袋', text: '移除你身上 2 个状态标记。' },
  waterskin: { name: '皮水袋', text: '你回复 3 生命。' },
  glassEye: { name: '祖传玻璃眼', text: '查看牌库顶 3 张并重新排序。' },
  luckyCharm: { name: '幸运护符', text: '打出你的牌库顶牌。' },
};

const v = (x: number | string) => (x === 'round' ? '回合数' : x === 'vengeance' ? '复仇值' : String(x));
const who = (t: string) => (t === 'self' ? '你' : t === 'all' ? '所有英雄' : t === 'two' ? '两名英雄' : '一名英雄');

export function effectText(e: Effect): string {
  switch (e.kind) {
    case 'attack': return `${TYPE_ZH[e.type]}攻击 ${v(e.value)}`;
    case 'support': return `${TYPE_ZH[e.type]}助攻 ${e.value}（本回合已有${TYPE_ZH[e.type]}攻击才生效）`;
    case 'protect': return `保护 ${v(e.value)}${e.cancelEffects ? '，并取消附加效果' : ''}`;
    case 'heal': return `${who(e.target)}回复 ${e.value} 生命`;
    case 'draw': return `${e.target === 'self' ? '你' : e.target === 'all' ? '所有英雄' : '一名英雄'}抽 ${e.n} 张`;
    case 'lightning': return `⚡ 额外行动${e.n && e.n > 1 ? ` ×${e.n}` : ''}`;
    case 'immediateAction': return '一名英雄立即行动 1 次';
    case 'bossPoison': return `魔王获得 ${e.n} 中毒`;
    case 'selfDamage': return `你失去 ${e.value} 生命`;
    case 'removeStatus': return `${who(e.target)}移除 ${e.n} 个状态标记`;
    case 'takeStatus': return `你获得 ${e.n} 中毒`;
    case 'ifHealthAtLeast': return `若你生命 ≥ ${e.n}：${e.then.map(effectText).join('，')}`;
    case 'nextBuff': {
      const m = { attack: '攻击', magic: '魔法攻击', ranged: '远程攻击', protect: '保护' }[e.match];
      const how = { plus: `+${e.n}`, repeat: '再结算一次', lightning: '获得额外行动', healEqual: '同时回复等量生命' }[e.mode];
      return `你下一张${m}${how}`;
    }
    case 'shieldReduce': return `所有护盾 -${e.n}${e.poisonIfBroken ? `；打破则魔王中毒 ${e.poisonIfBroken}` : ''}`;
    case 'bossLoseHp': return `魔王失去 ${e.n} 生命（无视护盾）`;
    case 'bossLosePerPoison': return `魔王每有 1 中毒失去 ${e.per} 生命${e.clear ? '，然后清除中毒' : ''}`;
    case 'exileSelf': return '用后本场移除';
    case 'exileForever': return '用后永久移出游戏';
    case 'playTop': return `打出牌库顶 ${e.n} 张`;
    case 'replayDiscard': return '从弃牌堆打出一张牌';
    case 'peekTop3': return '查看牌库顶 3 张，留下最好的';
    case 'redirect': return '把攻击一名英雄的魔王攻击引到你身上';
    case 'preventNextRound': return '阻止魔王下一个回合能力';
    case 'ward': return e.against === 'trap' ? '留在面前：挡下一次魔王陷阱' : '留在面前：抵消一次生命损失';
    case 'repeatLastAttack': return '重复上一张攻击';
    case 'bossAttackMinusNext': return `魔王下次攻击 -${e.n}`;
    case 'allDrawThenTop': return `所有英雄抽 ${e.n} 张，再各放 1 张回牌库顶`;
    case 'discardCurse': return '弃掉一张诅咒';
    case 'meteor': return '三种属性各随机攻击 1–3';
    case 'putHandOnTop': return '把一张手牌放回牌库顶';
    case 'slime': return '打出：取回一张失物';
  }
}

export function cardText(id: string): string[] {
  return (CARDS[id]?.effects ?? []).map(effectText);
}

/** 卡牌主属性（决定卡框颜色） */
export function cardKind(id: string): DamageType | 'protect' | 'support' | 'heal' | 'slime' | 'other' {
  const c = CARDS[id];
  if (!c) return 'other';
  if (c.category === 'slime') return 'slime';
  const a = c.effects.find((e) => e.kind === 'attack' || e.kind === 'support') as { type: DamageType } | undefined;
  if (a) return a.type;
  if (c.effects.some((e) => e.kind === 'protect')) return 'protect';
  if (c.effects.some((e) => e.kind === 'heal')) return 'heal';
  return 'other';
}

/** 这张牌需要选一名英雄做目标吗 */
export function cardNeedsTarget(id: string): boolean {
  const need = (e: Effect): boolean =>
    e.kind === 'protect' || e.kind === 'redirect' || e.kind === 'immediateAction' ||
    ((e.kind === 'heal' || e.kind === 'removeStatus') && e.target === 'choose') ||
    (e.kind === 'draw' && (e.target === 'choose' || e.target === 'chosen')) ||
    (e.kind === 'ifHealthAtLeast' && e.then.some(need));
  return (CARDS[id]?.effects ?? []).some(need);
}
