import type { CurseDef } from '../types.ts';

// 27 张诅咒（JP_CARDS_ZH 第四节逐张核对）。duration: phase=行动阶段结束弃置；instant=立即结算后弃置；permanent=到战斗结束
let n = 0;
const C = (batch: 1 | 2 | 3, duration: CurseDef['duration'], text: string, rest: Partial<CurseDef>): CurseDef => ({
  id: `curse_${batch}_${++n}`, name: duration === 'instant' ? '即时诅咒' : duration === 'permanent' ? '持续诅咒' : '诅咒', batch, duration, text, ...rest,
});

export const CURSES: CurseDef[] = [
  // 铜箱 17 张（1★，中毒主题）
  C(1, 'phase', '从手牌打出卡牌时，必须另弃 1 张手牌。', { trigger: 'playAny', discardExtra: true }),
  C(1, 'phase', '每打出 1 张保护，获得 1 个中毒。', { trigger: 'playProtect', status: { kind: 'poison', n: 1 } }),
  C(1, 'phase', '每打出 1 张攻击，获得 1 个中毒。', { trigger: 'playAttack', status: { kind: 'poison', n: 1 } }),
  C(1, 'phase', '每打出 1 张助攻，获得 1 个中毒。', { trigger: 'playSupport', status: { kind: 'poison', n: 1 } }),
  C(1, 'phase', '每打出 1 张保护，失去 2 生命。', { trigger: 'playProtect', loseHp: 2 }),
  C(1, 'phase', '每打出 1 张保护，失去 2 生命。', { trigger: 'playProtect', loseHp: 2 }),
  C(1, 'phase', '每打出 1 张攻击，失去 2 生命。', { trigger: 'playAttack', loseHp: 2 }),
  C(1, 'phase', '每打出 1 张攻击，失去 2 生命。', { trigger: 'playAttack', loseHp: 2 }),
  C(1, 'phase', '每打出 1 张助攻，失去 2 生命。', { trigger: 'playSupport', loseHp: 2 }),
  C(1, 'phase', '每打出 1 张助攻，失去 2 生命。', { trigger: 'playSupport', loseHp: 2 }),
  C(1, 'phase', '从手牌出牌时，改为随机选 1 张。', { trigger: 'playAny', randomPlay: true }),
  C(1, 'phase', '每从手牌打出 1 张卡，失去 1 生命。', { trigger: 'playAny', loseHp: 1 }),
  C(1, 'phase', '每从手牌打出 1 张卡，失去 1 生命。', { trigger: 'playAny', loseHp: 1 }),
  C(1, 'instant', '获得 2 个中毒。', { status: { kind: 'poison', n: 2 } }),
  C(1, 'instant', '受到 3 点伤害。', { loseHp: 3 }),
  C(1, 'permanent', '直到战斗结束，手牌上限 -1。', { handMinus: 1 }),
  C(1, 'permanent', '直到战斗结束，每次受到魔王攻击伤害，获得 2 个中毒。', { trigger: 'bossHit', status: { kind: 'poison', n: 2 } }),
  // 银箱 2★（惊恐）
  C(2, 'phase', '每打出 1 张攻击，获得 1 个惊恐。', { trigger: 'playAttack', status: { kind: 'panic', n: 1 } }),
  C(2, 'phase', '每打出 1 张助攻，获得 1 个惊恐。', { trigger: 'playSupport', status: { kind: 'panic', n: 1 } }),
  C(2, 'phase', '每打出 1 张保护，获得 1 个惊恐。', { trigger: 'playProtect', status: { kind: 'panic', n: 1 } }),
  C(2, 'instant', '获得 2 个惊恐。', { status: { kind: 'panic', n: 2 } }),
  C(2, 'permanent', '直到战斗结束，每次受到魔王攻击伤害，获得 1 个惊恐。', { trigger: 'bossHit', status: { kind: 'panic', n: 1 } }),
  // 银箱 3★（麻痹）
  C(3, 'phase', '每打出 1 张攻击，获得 1 个麻痹。', { trigger: 'playAttack', status: { kind: 'paralysis', n: 1 } }),
  C(3, 'phase', '每打出 1 张助攻，获得 1 个麻痹。', { trigger: 'playSupport', status: { kind: 'paralysis', n: 1 } }),
  C(3, 'phase', '每打出 1 张保护，获得 1 个麻痹。', { trigger: 'playProtect', status: { kind: 'paralysis', n: 1 } }),
  C(3, 'instant', '获得 2 个麻痹。', { status: { kind: 'paralysis', n: 2 } }),
  C(3, 'permanent', '直到战斗结束，每次受到魔王攻击伤害，获得 1 个麻痹。', { trigger: 'bossHit', status: { kind: 'paralysis', n: 1 } }),
];

export const CURSE_BY_ID: Record<string, CurseDef> = Object.fromEntries(CURSES.map((c) => [c.id, c]));
