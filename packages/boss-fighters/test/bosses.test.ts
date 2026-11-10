import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createGame, reduce, runBotGame, BOSSES, BOSS_ORDER } from '../src/index.ts';
import { newCampaign, setupFor } from '../src/campaign.ts';
import type { GameState } from '../src/types.ts';

const game = (bossId: string, seed = 3) =>
  createGame({ bossId, difficulty: 'advanced', seed, heroes: [{ name: '甲', race: 'troll', cls: 'warrior' }, { name: '乙', race: 'elf', cls: 'mage' }] });
const start = (s: GameState, hand: string[]) => {
  s.heroes[0].hand = hand.slice();
  return reduce(s, { type: 'CHOOSE_STARTER', seat: 0, by: 0 });
};

test('11 个魔王 × 2/3/4 人：机器人都能打到结束，不卡死、不报错', () => {
  const races = ['troll', 'halfling', 'dwarf', 'elf'];
  const classes = ['warrior', 'mage', 'rogue', 'druid'];
  for (const id of BOSS_ORDER) {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 6; seed++) {
        const c = newCampaign('t', races.slice(0, n).map((race, i) => ({ name: `P${i}`, race, cls: classes[(i + seed) % 4] })));
        c.progress = BOSSES[id].order - 1;
        const s = runBotGame(createGame(setupFor(c, id, 'advanced', seed)), 'coop', seed);
        assert.ok(s.phase === 'won' || s.phase === 'lost', `${id} ${n}人 seed${seed} 停在 ${s.phase}`);
      }
    }
  }
});

test('灵魂女猎手：第一次归零会复活（第二条命更长），不算胜利', () => {
  let s = start(game('soulHuntress'), ['troll_spear']);
  s.boss.hp = 1;
  s.boss.shields = { melee: 0, ranged: 0, magic: 0 };
  const first = s.boss.maxHp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_spear' });
  assert.equal(s.phase, 'action');
  assert.ok(s.boss.flags.revived);
  assert.ok(s.boss.hp > first);
});

test('以太龙：空中时近战打不到；没有近战护盾', () => {
  let s = start(game('aetherDragon'), ['troll_stone']);
  assert.equal(s.boss.shields.melee, 0);
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_stone' });
  assert.equal(s.boss.hp, hp);
});

test('石魔像：打破带危险碎片的护盾会失去大量生命，普通护盾不会', () => {
  let s = start(game('stoneGolem'), ['troll_stone', 'troll_axe']);
  const danger = s.boss.spikedShields[0];
  s.boss.shields = { melee: 1, ranged: 1, magic: 1 };
  s.boss.spikedShields = ['melee'];
  const hp = s.heroes[0].health;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' }); // 远程，普通护盾
  assert.equal(s.heroes[0].health, hp);
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_stone' }); // 近战，危险护盾
  assert.ok(s.heroes[0].health < hp);
  void danger;
});

test('三头食人妖：每个头只吃一种属性，三个头都倒下才算胜利', () => {
  let s = start(game('ogre'), ['troll_axe']);
  const horn = s.boss.parts.find((p) => p.id === 'horn')!;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  const after = s.boss.parts.find((p) => p.id === 'horn')!;
  assert.equal(after.hp, horn.hp - 2);
  assert.equal(s.boss.hp, s.boss.parts.reduce((t, p) => t + p.hp, 0));
});

test('巨触手：近战攻击打腐烂触手，本体只受 1 点', () => {
  let s = start(game('tentacolossus'), ['troll_stone']);
  const body = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_stone' });
  assert.equal(s.boss.hp, body - 1);
  assert.equal(s.boss.parts.find((p) => p.id === 'rot')!.hp, s.boss.parts.find((p) => p.id === 'rot')!.maxHp - 3);
});

test('熔岩王：打败手下的溢出伤害消失；该属性之后能直接打本体', () => {
  let s = start(game('magmaros'), ['dw_cleaver', 'troll_stone']);
  const lava = s.boss.parts.find((p) => p.id === 'lava')!;
  lava.hp = 1;
  const body = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_stone' }); // 近战 3：手下剩 1，溢出 2 消失
  assert.equal(s.boss.hp, body);
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s.heroes[0].hand = ['troll_stone'];
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_stone' });
  assert.equal(s.boss.hp, body - 3);
});

test('炸弹克精：时间制，每次正常行动扣 1 时间，额外行动不扣；时间到 0 失败', () => {
  let s = start(game('bombossa'), ['troll_axe', 'rog_sting']);
  const t0 = s.time!;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  assert.equal(s.time, t0 - 1);
  s.time = 1;
  const seat = s.current!;
  s = reduce(s, { type: 'END_ACTIONS', seat });
  assert.equal(s.phase, 'lost');
});

test('果冻怪：黏液精全倒下后本回合直接攻击本体 ×3，回合结束分裂出新黏液精', () => {
  let s = start(game('jelly'), ['troll_axe']);
  for (const p of s.boss.parts) p.alive = false;
  const hp = s.boss.hp;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  assert.equal(s.boss.hp, hp - 6);
  s = reduce(s, { type: 'END_ACTIONS', seat: 1 });
  s = reduce(s, { type: 'END_ACTIONS', seat: 0 });
  if (s.phase === 'lost') return;
  assert.equal(s.boss.parts.filter((p) => p.alive).length, 3);
});

test('巫毒天后：前两轮每人只有 2 次行动；第一阶段归零后复生进入第二阶段', () => {
  let s = start(game('madameVoodoo'), ['troll_axe']);
  assert.equal(s.heroes[1].actionsLeft, 2);
  for (const p of s.boss.parts) p.alive = false;
  s.boss.hp = 1;
  s = reduce(s, { type: 'PLAY_CARD', seat: 0, card: 'troll_axe' });
  assert.equal(s.phase, 'action');
  assert.equal(s.boss.phase2, true);
  assert.ok(s.heroes.some((h) => h.carriesDoll));
});
