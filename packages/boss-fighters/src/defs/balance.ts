import type { Difficulty } from '../types.ts';

// 所有【暂定】数值集中在这里。拿到官方数据后只改这个文件。
export const DIFFICULTY: Record<Difficulty, { name: string; hp: number; attack: number; shield: number }> = {
  beginner: { name: '新手', hp: 0.75, attack: 0.75, shield: 0.75 },
  advanced: { name: '进阶', hp: 1, attack: 1, shield: 1 },
  pro: { name: '专业', hp: 1.25, attack: 1.2, shield: 1.2 },
  insane: { name: '疯狂', hp: 1.5, attack: 1.4, shield: 1.4 },
};

export const ITEMS = {
  backpackDraw: 3, // 官方
  potionHeal: 8, // 官方
  potionsPerHero: 1, // 官方：每场每名英雄 1 瓶
};

export const PUPPET = {
  hpPerHero: 24, // 【证据锁定】实测 2 人 48
  shieldBase: 7, // 第 2 回合总量 = 7N+1，之后每回合 -N（实测 2 人第 2 回合 3/5/7）
  sweep: 3,
  spin: 2,
  spinPoison: 1,
  tiredFrom: 4,
};

export const PRINCE = {
  hpPerHero: 28, // 【证据锁定】实测 2 人 54/56、3 人 86
  shieldPerHero: 2, // 总量 2N+1（实测 3 人 3/2/2 = 7）
  shieldExtra: 1,
  rageRound: 5, // 官方提示：第 5 回合发怒
  rageBonus: 1,
  inflateAttack: 1,
  inflateShield: 1,
  poisonSpitThreshold: 4, // 实测 + 巫毒青蛙僵尸官方文本
  tongueEvery: 2,
  tongueDamage: 4, // 实测 4 / 6
  tonguePoison: 1,
  overrunEvery: 3,
  overrunDamage: 2,
  croakChance: 0.2,
  croakDamage: 2,
  attacks: [
    { key: 'Attack_Prince_Anspringen', name: '跳跃', value: 3, poison: 0, weight: 3, single: false },
    { key: 'Attack_Prince_ZahnloserBiss', name: '无牙一咬', value: 2, poison: 0, weight: 3, single: false },
    { key: 'Attack_Prince_GiftigerBiss', name: '毒噬', value: 2, poison: 1, weight: 2, single: false },
    { key: 'Attack_Prince_Zerstampfen', name: '重踏', value: 4, poison: 0, weight: 1, single: true },
  ],
};

// ———— 第 2–5 关（05 H/P/Q 节实测校准；其余【暂定】）————
export const SOUL_HUNTRESS = {
  hpPerHero: 12, // 【证据锁定】实测 2 人第一条命 23
  reviveHpPerHero: 16, // 【证据锁定】实测 2 人复活后 32
  shieldPerHero: 2, shieldExtra: 2,
  drainCap: 3, // [trap] 吸收生命：每次攻击造成伤害时回复（最多）
  nightmareEvery: 2, nightmareDamage: 4, nightmareMill: 2, // 实测某局每人 -6（难度未知）
  huntEvery: 3, huntDamage: 3,
  reviveCurses: 1, reviveDiscard: 1, reviveShieldBonus: 2,
  attacks: [
    { key: 'Attack_SoulHuntress_Kettenschwung', name: '锁链飞荡', value: 4, extra: {}, weight: 3 },
    { key: 'Attack_SoulHuntress_Klauenhieb', name: '挥爪', value: 3, extra: {}, weight: 3 },
    { key: 'Attack_SoulHuntress_Klauenwirbel', name: '利爪旋风', value: 2, extra: {}, weight: 2 },
    { key: 'Attack_SoulHuntress_Verdammen', name: '毒咒', value: 2, extra: { poison: 1 }, weight: 2 },
    { key: 'Attack_SoulHuntress_Verfluchen', name: '诅咒', value: 2, extra: { curse: 1 }, weight: 1 },
    { key: 'Attack_SoulHuntress_Verteufeln', name: '枯竭', value: 2, extra: { discard: 1 }, weight: 1 },
  ],
};

export const AETHER_DRAGON = {
  hpPerHero: 40, // 【证据锁定】实测 2 人 81/82，平衡时不要改
  airShieldExtra: 3, // 空中只有远程/魔法护盾，每种 1–4（实测）
  groundShieldPerHero: 2, groundShieldExtra: 5,
  landDamagePerHero: 2, landDamageBase: 4, // 一回合内受到这么多伤害后落地
  forceLandRound: 5, // 实测：约第 5 回合失去飞行能力
  takeOffActions: 12,
  spikeDamage: 4, // 实测约 5（难度未知）：攻击尖刺护盾每次约 5 反伤
  wingEvery: 2, roarEvery: 2, roarDamage: 2, // 吼叫伤害无证据，平衡模拟 3→2
  rageAt: 1 / 3, rageBonus: 1, rageBig: 8, // 实测后期单人可受 12–14
  // 攻击值无证据（平衡模拟：血量锁定后各 -1）
  air: [
    { key: 'Attack_EtherDragon_Odem', name: '龙息', value: 4, extra: {}, weight: 2 },
    { key: 'Attack_EtherDragon_Flügelhieb', name: '双翼削击', value: 3, extra: {}, weight: 3 },
    { key: 'Attack_EtherDragon_Ätherblitz', name: '以太闪电', value: 2, extra: { panic: 1 }, weight: 2 },
    { key: 'Attack_EtherDragon_Klauengriff', name: '龙爪', value: 2, extra: {}, weight: 2 },
  ],
  ground: [
    { key: 'Attack_EtherDragon_Zertrampeln', name: '践踏', value: 3, extra: {}, weight: 3 },
    { key: 'Attack_EtherDragon_Schwanzhieb', name: '扫尾鞭', value: 3, extra: {}, weight: 3 },
    { key: 'Attack_EtherDragon_Biss', name: '龙噬', value: 4, extra: {}, weight: 2 },
  ],
};

export const STONE_GOLEM = {
  hpPerHero: 28, // 【证据锁定】实测 2 人 56、4 人 120
  shieldPerHero: 1, shieldExtra: 7, // 实测 2 人 2/4/3、4/2/3
  shardDamage: 10, // [shield] 危险护盾碎片（实测 7、11，难度不同）
  chargeBase: 2, chargePerHero: 2, // [trap] 充能：需要 3+2N 张闪电牌充满
  essenceEvery: 3, freezeEvery: 4,
  attacks: [
    { key: 'Attack_StoneGolem_Steinfaust', name: '岩石拳', value: 4, extra: {}, weight: 3 },
    { key: 'Attack_StoneGolem_FelsSchleudern', name: '掷石压顶', value: 3, extra: {}, weight: 3 },
    { key: 'Attack_StoneGolem_Zerstampfen', name: '重踏', value: 3, extra: { paralysis: 1 }, weight: 2 },
    { key: 'Attack_StoneGolem_ErdeSpalten', name: '地震', value: 2, extra: {}, weight: 2 },
    { key: 'Attack_StoneGolem_Gravitatus', name: '重力作用', value: 2, extra: { paralysis: 1 }, weight: 1 },
  ],
};

export const OGRE = {
  headHpPerHero: 19, // 【证据锁定】实测 2 人三头合计 115（视频为骷髅难度，对应哪档待确认）
  stunBase: 3, // 击晕门槛 3 + N（无证据，平衡模拟）
  meleeAnyFrom: 6, // 官方 1.1.833：第 6 回合起可用近战攻击任意头
  hairyBuff: 2,
  heads: {
    spit: { name: '口水怪', slot: 'magic' as const, attacks: [{ key: 'Attack_ThreeHeadedOgre_Rotzspucker', name: '飞溅鼻涕', value: 2, extra: { poison: 1 }, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Stinkhauch', name: '口气', value: 1, extra: { poison: 1 }, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Anrülpsen', name: '打嗝', value: 2, extra: {}, weight: 1 }, { key: 'Attack_ThreeHeadedOgre_Todesruf', name: '死亡呼唤', value: 3, extra: {}, weight: 1 }] },
    horn: { name: '尖突怪', slot: 'ranged' as const, attacks: [{ key: 'Attack_ThreeHeadedOgre_Hornstups', name: '尖角刺戳', value: 3, extra: {}, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Popelwurf', name: '弹鼻屎', value: 2, extra: {}, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Rumnörgeln', name: '牢骚', value: 1, extra: { curse: 1 }, weight: 1 }, { key: 'Attack_ThreeHeadedOgre_Verfluchen', name: '咒骂', value: 2, extra: { curse: 1 }, weight: 1 }] },
    hairy: { name: '长毛怪', slot: 'melee' as const, attacks: [{ key: 'Attack_ThreeHeadedOgre_Keulenrumms', name: '棍击', value: 4, extra: {}, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Plattwalzen', name: '压扁', value: 3, extra: {}, weight: 2 }, { key: 'Attack_ThreeHeadedOgre_Mampfen', name: '嚼咬', value: 2, extra: {}, weight: 1 }, { key: 'Attack_ThreeHeadedOgre_Anbrüllen', name: '怒吼', value: 2, extra: { panic: 1 }, weight: 1 }] },
  },
};

// ———— 第 6–10 关（实测极少，主要按官方能力文字设计的【暂定】数值）————
export const TENTACOLOSSUS = {
  bodyHpBase: -14, bodyHpPerHero: 20, tentacleHpBase: -3, tentacleHpPerHero: 7, // 平衡模拟：原 18N 时 4 人过易、2 人过难
  bodyShare: 1, // 有触手存活时本体受到的"极少伤害"
  replacementMult: 0.5,
  attack: 5,
  whirlLoss: 1, rotPoison: 2, toxicPoison: 1, drain: 3, regenHeal: 2,
};

export const MAGMAROS = {
  bodyHpPerHero: 12, minionHpPerHero: 3,
  heatAt: 3, blazeAt: 4, // 每位英雄本回合第 3 张攻击/助攻起 -1、第 4 张起每张 1 着火
  meleeMinionDamage: 3, rangedRage: 1,
  fireWaveEvery: 3, burnEvery: 3, ashRainEvery: 4,
  smolderBonus: 2, lavaShieldPerHero: 2, lavaShieldExtra: 6,
  attacks: [
    { key: 'Attack_Magmaros_Glutfaust', name: '炽火之拳', value: 4, extra: {}, weight: 3 },
    { key: 'Attack_Magmaros_Funkenregen', name: '火花四溅', value: 3, extra: { fire: 1 }, weight: 2 },
    { key: 'Attack_Magmaros_Magmaschauer', name: '熔岩雨', value: 3, extra: {}, weight: 2 },
    { key: 'Attack_Magmaros_Flammenfluch', name: '烈焰诅咒', value: 2, extra: { curse: 1 }, weight: 1 },
  ],
};

// 炸弹克精的 4 种官方攻击（名称官方；数值与附加效果【暂定】）
export const BOMBOSSA_ATTACKS = [
  { key: 'Attack_Bombossa_Flammenstrahl', name: '火焰轰击', value: 7, extra: {}, all: false },
  { key: 'Attack_Bombossa_InneresFeuer', name: '内燃之火', value: 5, extra: { fire: 1 }, all: false },
  { key: 'Attack_Bombossa_Zerbeißen', name: '嚼咬', value: 6, extra: {}, all: false },
  { key: 'Attack_Bombossa_Glutregen', name: '灰烬雨', value: 2, extra: {}, all: true },
];

export const BOMBOSSA = {
  hpPerHero: 20, shieldPerHero: 1, shieldExtra: 3,
  timeBase: -5, timePerHero: 12, segment: 6, // 每人约 11–12 次行动的时间
  attackEvery: 0.2, attackValue: 7, fuseDamage: 3,
  bombHpPerHero: 2, bombFuse: 2,
  tickingDiscard: 3,
};

export const JELLY = {
  bodyHpPerHero: 42, minionHpPerHero: 6,
  weakMult: 3, splitLossPerHero: 5, enragePer: 25,
  lostEvery: 2, corrodeEvery: 3, causticEvery: 4, causticDamage: 2,
  bubbleAt: 0.4, bubbleBonus: 2,
  attacks: [
    { key: 'Attack_Jelly_Klebfäden', name: '黏液线', value: 3, extra: { slime: 1 }, weight: 2 },
    { key: 'Attack_Jelly_Schlabberglieder', name: '湿软肢体', value: 4, extra: {}, weight: 3 },
    { key: 'Attack_Jelly_Schleimbombe', name: '黏液炸弹', value: 3, extra: { lost: 1 }, weight: 2 },
    { key: 'Attack_Jelly_Umschleimen', name: '鬼口水', value: 2, extra: { poison: 1 }, weight: 2 },
  ],
};

export const VOODOO = {
  hpPerHero: 9, phase2HpPerHero: 10, minionHpPerHero: 2,
  soulCutRounds: 2, boringAt: 3,
  phase2ShieldPerHero: 1, phase2ShieldExtra: 3, guitarEvery: 2, guitarBonus: 3,
  bombRounds: [2, 5, 8], bombFuse: 2, bombDiscard: 3, dollEvery: 2,
  deathSongAt: 0.25,
  attacks1: [
    { key: 'Attack_Voodoo_Knochenknacker', name: '裂骨一击', value: 4, extra: {}, weight: 3 },
    { key: 'Attack_Voodoo_Schädelschnapper', name: '折颅一击', value: 4, extra: {}, weight: 2 },
    { key: 'Attack_Voodoo_EiskalterGriff', name: '寒冰爪', value: 3, extra: { paralysis: 1 }, weight: 2 },
    { key: 'Attack_Voodoo_SchwarzeMagie', name: '黑魔法', value: 3, extra: {}, weight: 1 },
  ],
  attacks2: [
    { key: 'Attack_Voodoo_Totentanz', name: '死亡之舞', value: 5, extra: {}, weight: 3 },
    { key: 'Attack_Voodoo_Höllenschmerz', name: '地狱苦痛', value: 4, extra: {}, weight: 2 },
    { key: 'Attack_Voodoo_RufDesJenseits', name: '彼岸召唤', value: 3, extra: { drain: true }, weight: 2 },
    { key: 'Attack_Voodoo_Albtraum', name: '噩梦', value: 3, extra: { panic: 1 }, weight: 2 },
  ],
};
