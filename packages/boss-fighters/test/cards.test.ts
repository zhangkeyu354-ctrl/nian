import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createGame, reduce, CARDS, ADVANCED, LOOT, INITIAL, CURSES, IDENTITIES } from '../src/index.ts';
import { newCampaign, setupFor, recordResult, pickLoot, setRemoved, unlocks } from '../src/campaign.ts';
import type { GameState } from '../src/types.ts';

const base = (opts: Partial<Parameters<typeof createGame>[0]> = {}) =>
  createGame({ bossId: 'puppet', difficulty: 'advanced', seed: 11, heroes: [{ name: '甲', race: 'troll', cls: 'warrior' }, { name: '乙', race: 'elf', cls: 'mage' }], ...opts });

/** 让座位 0 开始行动，并把手牌换成指定卡 */
function ready(s: GameState, hand: string[], seat = 0) {
  s.heroes[seat].hand = hand.slice();
  s.boss.shields = { melee: 0, ranged: 0, magic: 0 };
  return reduce(s, { type: 'CHOOSE_STARTER', seat, by: seat });
}

test('卡牌数据：48 初始 + 32 进阶 + 41 战利品 + 27 诅咒，每个种族/职业 6 初始 + 4 进阶', () => {
  assert.equal(INITIAL.length, 48);
  assert.equal(ADVANCED.length, 32);
  assert.equal(LOOT.length, 41);
  assert.equal(CURSES.length, 27);
  for (const id of Object.values(IDENTITIES)) {
    assert.equal(id.cards.length, 6);
    assert.equal(id.advanced.length, 4);
    for (const c of [...id.cards, ...id.advanced]) assert.ok(CARDS[c], `${id.id} 缺卡 ${c}`);
  }
});

test('当头猛敲！强度 = 当前回合数，并给额外行动', () => {
  let s = ready(base(), ['adv_whack', 'troll_axe']);
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_whack' });
  assert.equal(s.boss.hp, hp - 1);
  assert.equal(s.pendingLightning, 1);
});

test('骨杖：生命 ≥15 才抽 2', () => {
  let s = base();
  s.heroes[0].health = 14;
  s = ready(s, ['adv_bone_club']);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_bone_club' });
  assert.equal(s.heroes[0].hand.length, 0);
  let t = base();
  t = ready(t, ['adv_bone_club']);
  t = reduce(t, { type: 'PLAY_CARD', seat: 0, card: 'adv_bone_club' });
  assert.equal(t.heroes[0].hand.length, 2);
});

test('隐身之冕：下一张攻击 +3；星空镜：下一张魔法攻击重复', () => {
  let s = ready(base(), ['adv_diadem', 'troll_spear']);
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_diadem' });
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_spear' }); // 魔法 3 + 3
  assert.equal(s.boss.hp, hp - 6);
  let t = ready(base(), ['loot_astral_lens', 'troll_spear']);
  const hp2 = t.boss.hp;
  t = reduce(t, { type: 'PLAY_CARD', seat: 0, card: 'loot_astral_lens' });
  t = reduce(t, { type: 'PLAY_CARD', seat: 0, card: 'troll_spear' });
  assert.equal(t.boss.hp, hp2 - 6);
});

test('淬毒武器：护盾 -2，打破则魔王 2 中毒', () => {
  let s = base();
  s.heroes[0].hand = ['loot_poison_weapon'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s.boss.shields = { melee: 2, ranged: 0, magic: 0 };
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'loot_poison_weapon' });
  assert.equal(s.boss.shields.melee, 0);
  assert.equal(s.boss.poison, 2);
});

test('诅咒：抽到时背面朝上，行动阶段开始翻开；本阶段诅咒在行动阶段结束弃置', () => {
  let s = base({ curseBatches: [1] });
  s.curseDeck = ['curse_1_3']; // 每打攻击得 1 中毒
  s.heroes[0].curses.push({ id: s.curseDeck.pop()!, state: 'down' });
  s.heroes[0].hand = ['troll_axe'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  assert.equal(s.heroes[0].curses[0].state, 'active');
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  assert.equal(s.heroes[0].status.poison, 1);
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  assert.equal(s.heroes[0].curses.length, 0);
  assert.ok(s.curseDiscard.includes('curse_1_3'));
});

test('即时诅咒翻开就结算并弃掉；持续诅咒手牌上限 -1', () => {
  let s = base();
  s.heroes[0].curses.push({ id: 'curse_1_14', state: 'down' }, { id: 'curse_1_16', state: 'down' });
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  assert.equal(s.heroes[0].status.poison, 2);
  assert.equal(s.heroes[0].curses.length, 1);
});

test('惊恐：打手牌时改为随机，并弃掉 1 个惊恐', () => {
  let s = base();
  s.heroes[0].status.panic = 1;
  s = ready(s, ['troll_axe', 'troll_spear', 'troll_belt']);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  assert.equal(s.heroes[0].status.panic, 0);
  assert.equal(s.heroes[0].play.length, 1);
});

test('着火：状态阶段每个标记抽 1 张，选择移除或弃掉并失去 2 生命', () => {
  let s = base();
  s.heroes[0].status.fire = 1;
  s.planned = [];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  assert.equal(s.phase, 'decision');
  const hp = s.heroes[0].health;
  s = reduce(s, { type: 'DECIDE', seat: 0, choice: 'burn' });
  assert.equal(s.heroes[0].health, hp - 2);
  assert.equal(s.phase, 'discard');
});

test('黏液牌：弃牌阶段不能弃；打出后取回最多 2 张失物', () => {
  let s = base();
  s.heroes[0].lost = ['troll_axe', 'troll_belt', 'troll_spear'];
  s = ready(s, ['slime']);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'slime' });
  assert.equal(s.heroes[0].lost.length, 1);
  assert.equal(s.slimePile, 21);
  let t = base();
  t.heroes[0].hand.push('slime');
  t = reduce(t, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  t = reduce(t, { type: 'END_ACTIONS', seat: 0 });
  t = reduce(t, { type: 'END_ACTIONS', seat: 1 });
  assert.throws(() => reduce(t, { type: 'DISCARD', seat: 0, cards: ['slime'] }));
});

test('怜悯之泪：抵消一次生命损失', () => {
  let s = ready(base(), ['loot_tears']);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'loot_tears' });
  assert.equal(s.heroes[0].wards.length, 1);
  const hp = s.heroes[0].health;
  s.planned = [{ id: 'x', nameKey: 'k', name: '横扫', target: 0, value: 5, extra: {}, reducedBy: 0 }];
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  assert.equal(s.heroes[0].health, hp);
});

test('义气相挺：自己的攻击取消，替队友承受', () => {
  let s = base();
  s.planned = [
    { id: 'a', nameKey: 'k', name: 'A', target: 0, value: 3, extra: {}, reducedBy: 0 },
    { id: 'b', nameKey: 'k', name: 'B', target: 1, value: 4, extra: {}, reducedBy: 0 },
  ];
  s = ready(s, ['adv_chivalrous']);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_chivalrous', target: 1 });
  assert.equal(s.planned.length, 1);
  assert.equal(s.planned[0].target, 0);
  assert.equal(s.planned[0].value, 4);
});

test('复仇符文：强度 = 针对自己的攻击值', () => {
  let s = base();
  s.planned = [{ id: 'a', nameKey: 'k', name: 'A', target: 0, value: 6, extra: {}, reducedBy: 0 }];
  s = ready(s, ['adv_vengeance']);
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_vengeance' });
  assert.equal(s.boss.hp, hp - 6);
});

test('流星雨：三种属性各 1–3，自己失去 2 生命', () => {
  let s = ready(base(), ['adv_meteor']);
  const hp = s.boss.hp;
  const me = s.heroes[0].health;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_meteor' });
  const d = hp - s.boss.hp;
  assert.ok(d >= 3 && d <= 9);
  assert.equal(s.heroes[0].health, me - 2);
  assert.deepEqual(s.attackedTypes, { melee: true, ranged: true, magic: true });
});

test('英雄等级：巨魔 3 级 4/22，法师 3 级 2/11', () => {
  const s = createGame({ bossId: 'puppet', difficulty: 'advanced', seed: 1, heroes: [{ name: '甲', race: 'troll', cls: 'mage', raceLevel: 3, clsLevel: 3 }, { name: '乙', race: 'elf', cls: 'rogue' }] });
  assert.equal(s.heroes[0].maxHealth, 33);
  assert.equal(s.heroes[0].handLimit, 6);
});

test('半身人 2 级：破盾魔王立即失去 4；盗贼 2 级：没有攻击也能助攻', () => {
  let s = createGame({ bossId: 'puppet', difficulty: 'advanced', seed: 1, heroes: [{ name: '甲', race: 'halfling', cls: 'rogue', raceLevel: 2, clsLevel: 2 }, { name: '乙', race: 'elf', cls: 'mage' }] });
  s.heroes[0].hand = ['hal_dagger', 'rog_trap'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s.boss.shields = { melee: 2, ranged: 0, magic: 0 };
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'rog_trap' }); // 近战助攻 3，无攻击也生效：护盾 2 破 + 1 伤害 + 破盾 4
  assert.equal(s.boss.hp, hp - 5);
});

test('战役：解锁顺序、发战利品、选战利品、牌组至少 20 张', () => {
  let c = newCampaign('测试团', [{ name: '甲', race: 'troll', cls: 'warrior' }, { name: '乙', race: 'elf', cls: 'mage' }]);
  assert.throws(() => setupFor(c, 'prince', 'advanced', 1));
  const g = { ...base(), phase: 'won' } as GameState;
  c = recordResult(c, g);
  assert.equal(c.progress, 0);
  const setup = setupFor(c, 'prince', 'advanced', 1);
  assert.equal(setup.heroes[0].extraCards!.length, 8);
  const pg = { ...createGame(setup), phase: 'won' } as GameState;
  c = recordResult(c, pg);
  assert.equal(c.progress, 1);
  assert.equal(c.pendingLoot!.offer.length, 4);
  c = pickLoot(c, 0, c.pendingLoot!.offer[0]);
  assert.throws(() => pickLoot(c, 1, c.pendingLoot!.offer[0]));
  c = pickLoot(c, 1, c.pendingLoot!.offer[1]);
  assert.equal(c.pendingLoot, null);
  assert.equal(c.heroes[0].loot.length, 1);
  c = setRemoved(c, 0, ['troll_belt']);
  assert.throws(() => setRemoved(c, 0, ['troll_belt', 'troll_axe']));
  assert.deepEqual(unlocks(3).curseBatches, [1, 2, 3]);
  assert.equal(unlocks(3).raceLevel, 2);
});
