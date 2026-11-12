import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createGame, reduce, viewFor, actor, runBotGame } from '../src/index.ts';
import type { GameState } from '../src/types.ts';

const two = (bossId = 'prince', seed = 7) =>
  createGame({ bossId, difficulty: 'advanced', seed, heroes: [{ name: '甲', race: 'dwarf', cls: 'warrior' }, { name: '乙', race: 'elf', cls: 'mage' }] });

/** 把指定卡放进某人手牌（测试用） */
function give(s: GameState, seat: number, card: string) {
  s.heroes[seat].hand.push(card);
}

test('英雄数值：矮人 14 + 战士 10 = 24 生命，手牌 6（规则书示例）', () => {
  const s = two();
  assert.equal(s.heroes[0].maxHealth, 24);
  assert.equal(s.heroes[0].handLimit, 6);
  assert.equal(s.heroes[0].hand.length, 6);
  assert.equal(s.heroes[0].deck.length + s.heroes[0].hand.length, 12);
});

test('教学关第 1 回合没有护盾；青蛙王子第 1 回合就有护盾、2 人 56 生命', () => {
  const p = two('puppet');
  assert.deepEqual(p.boss.shields, { melee: 0, ranged: 0, magic: 0 });
  const s = two();
  assert.equal(s.boss.hp, 56);
  assert.equal(s.boss.shields.melee + s.boss.shields.ranged + s.boss.shields.magic, 5);
  assert.equal(s.phase, 'chooseStarter');
});

test('助攻：本回合没人打过同属性攻击时无效，打过后生效', () => {
  let s = two();
  s.heroes[1].hand = ['elf_flurry', 'elf_sunfire', 'elf_volley'];
  s.boss.shields = { melee: 0, ranged: 0, magic: 0 };
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 1, by: 1 });
  const hp0 = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 1, card: 'elf_flurry' }); // 魔法助攻 3，未激活
  assert.equal(s.boss.hp, hp0);
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 1, card: 'elf_sunfire' }); // 魔法攻击 4
  assert.equal(s.boss.hp, hp0 - 4);
});

test('保护把攻击减到 0：伤害和附加中毒都取消（官方）', () => {
  let s = two('puppet');
  s.planned = [{ id: 'x', nameKey: 'k', name: '毒噬', target: 0, value: 3, extra: { poison: 1 }, reducedBy: 0 }];
  s.heroes[0].hand = ['dw_chest'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'dw_chest', target: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  assert.equal(s.heroes[0].health, 24);
  assert.equal(s.heroes[0].status.poison, 0);
});

test('青蛙王子·剧毒喷吐：单张数值 ≥4 的攻击让出牌者中毒', () => {
  let s = two();
  s.heroes[1].hand = ['elf_sunfire', 'elf_starblade'];
  s.boss.shields = { melee: 0, ranged: 0, magic: 0 };
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 1, by: 1 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 1, card: 'elf_sunfire' }); // 4
  assert.equal(s.heroes[1].status.poison, 1);
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 1, card: 'elf_starblade' }); // 3
  assert.equal(s.heroes[1].status.poison, 1);
});

test('闪电：出牌者立即再行动，不消耗正常行动', () => {
  let s = createGame({ bossId: 'prince', difficulty: 'advanced', seed: 3, heroes: [{ name: '甲', race: 'troll', cls: 'rogue' }, { name: '乙', race: 'elf', cls: 'mage' }] });
  s.heroes[0].hand = ['rog_sting', 'rog_shadowblade'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'rog_sting' });
  assert.equal(actor(s), 0);
  assert.equal(s.heroes[0].actionsLeft, 2);
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'rog_shadowblade' });
  assert.equal(actor(s), 1);
  assert.equal(s.heroes[0].actionsLeft, 2);
});

test('酋长号角：被选中的队友立即插队行动 1 次，然后轮转继续', () => {
  let s = createGame({ bossId: 'prince', difficulty: 'advanced', seed: 3, heroes: [{ name: '甲', race: 'troll', cls: 'rogue' }, { name: '乙', race: 'elf', cls: 'mage' }, { name: '丙', race: 'dwarf', cls: 'druid' }] });
  s.heroes[0].hand = ['troll_horn'];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_horn', target: 2 });
  assert.equal(actor(s), 2);
  const left = s.heroes[2].actionsLeft;
  s = reduce(s, { type: 'END_ACTIONS', seat: 2 });
  assert.equal(s.heroes[2].actionsLeft, left);
  assert.equal(actor(s), 1);
});

test('不能替别人出牌、不能出不在手里的牌', () => {
  let s = two();
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  assert.throws(() => reduce(s, { type: 'PLAY_CARD', seat: 1, card: s.heroes[1].hand[0] }));
  assert.throws(() => reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'elf_sunfire' }));
});

test('魔王剩 1 血带 4 中毒，攻击阶段先打死英雄 → 判负，不结算毒伤（05 P 节测试用例）', () => {
  let s = two();
  s.boss.hp = 1;
  s.boss.poison = 4;
  s.boss.shields = { melee: 0, ranged: 0, magic: 0 };
  s.heroes[0].health = 2;
  s.planned = [{ id: 'x', nameKey: 'k', name: '重踏', target: 0, value: 5, extra: {}, reducedBy: 0 }];
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  assert.equal(s.phase, 'lost');
  assert.equal(s.boss.hp, 1);
});

test('弃牌：超过手牌上限必须弃到上限；全员确认后抽牌并进入下一回合', () => {
  let s = two();
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s.heroes[0].hand.push('elf_shield', 'elf_shield');
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  if (s.phase === 'lost') return; // 极端随机情况
  assert.equal(s.phase, 'discard');
  assert.throws(() => reduce(s, { type: 'DISCARD', seat: 0, cards: [] }));
  s = reduce(s, { type: 'DISCARD', seat: 0, cards: s.heroes[0].hand.slice(0, 2) });
  s = reduce(s, { type: 'DISCARD', seat: 1, cards: [] });
  assert.equal(s.round, 2);
  assert.equal(s.heroes[0].hand.length, 6);
});

test('隐私：别人只看得到我的手牌张数', () => {
  const v = viewFor(two(), 1);
  assert.equal(v.heroes[0].hand.length, 0);
  assert.equal(v.heroes[0].handCount, 6);
  assert.equal(v.heroes[1].hand.length, 7);
  assert.equal(v.heroes[1].deck.length, 0);
});

test('同一种子结果完全相同（可回放）', () => {
  const a = runBotGame(two('prince', 42), 'coop', 42);
  const b = runBotGame(two('prince', 42), 'coop', 42);
  assert.deepEqual(a.log, b.log);
});

test('机器人能把两个魔王都打完（不会卡住）', () => {
  for (const boss of ['puppet', 'prince']) {
    for (let seed = 1; seed <= 30; seed++) {
      const s = runBotGame(two(boss, seed), 'coop', seed);
      assert.ok(s.phase === 'won' || s.phase === 'lost', `${boss} seed ${seed} 停在 ${s.phase}`);
    }
  }
});

test('随机乱打的机器人也不会让引擎报错或卡死', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = runBotGame(two('prince', seed), 'random', seed);
    assert.ok(s.phase === 'won' || s.phase === 'lost');
  }
});

test('既视感：弃牌堆有多张时由玩家挑，挑完才轮到下一位', () => {
  let s = two('puppet');
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s.heroes[0].hand.push('adv_dejavu');
  s.heroes[0].discard = ['elf_sunfire', 'elf_flurry'];
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_dejavu' });
  assert.equal(s.pick?.kind, 'replay');
  assert.deepEqual([...s.pick!.options].sort(), ['elf_flurry', 'elf_sunfire']);
  assert.equal(actor(s), 0);
  assert.throws(() => reduce(s, { type: 'END_ACTIONS', seat: 0 }));
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PICK', seat: 0, card: 'elf_sunfire' });
  assert.equal(s.pick, null);
  assert.ok(s.boss.hp < hp);
  assert.ok(s.heroes[0].exiled.includes('elf_sunfire'));
});

test('透视面具：三选一打出，其余放牌库底；玻璃眼：依次排好牌库顶', () => {
  let s = two('puppet');
  s = reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  s.heroes[0].hand.push('adv_mask');
  s.heroes[0].deck.push('elf_flurry', 'elf_volley', 'elf_sunfire');
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'adv_mask' });
  assert.equal(s.pick?.kind, 'mask');
  s = reduce(s, { type: 'PICK', seat: 0, card: 'elf_volley' });
  assert.ok(s.heroes[0].play.includes('elf_volley'));
  assert.deepEqual(s.heroes[0].deck.slice(0, 2).sort(), ['elf_flurry', 'elf_sunfire']);

  let e = two('puppet');
  e = reduce(e, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
  e.heroes[0].items.glassEye = 1;
  e.heroes[0].deck.push('a1', 'a2', 'a3');
  e = reduce(e, { type: 'USE_ITEM', seat: 0, item: 'glassEye' });
  assert.equal(e.pick?.kind, 'eye');
  e = reduce(e, { type: 'PICK', seat: 0, card: 'a1' });
  assert.equal(e.pick?.kind, 'eye');
  e = reduce(e, { type: 'PICK', seat: 0, card: 'a3' });
  assert.equal(e.pick, null);
  assert.deepEqual(e.heroes[0].deck.slice(-3), ['a2', 'a3', 'a1']); // 末尾 = 最上面
});

test('并列目标：回合开始前可以把攻击改给并列的另一名英雄', () => {
  const s = two('prince');
  const tied = s.planned.find((a) => a.tieOptions);
  if (!tied) return; // 这个种子没有并列目标
  const other = tied.tieOptions!.find((x) => x !== tied.target)!;
  const n = reduce(s, { type: 'RETARGET', seat: 0, attack: tied.id, target: other });
  assert.equal(n.planned.find((a) => a.id === tied.id)!.target, other);
  assert.throws(() => reduce(n, { type: 'RETARGET', seat: 0, attack: tied.id, target: 9 }));
});

test('机器人能打完需要挑牌和着火决定的整局（炸弹克精、带进阶牌）', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = runBotGame(two('bombossa', seed), 'coop', seed);
    assert.ok(g.phase === 'won' || g.phase === 'lost');
  }
});
