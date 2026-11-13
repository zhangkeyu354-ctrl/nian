// 第 2–5 关：灵魂女猎手、以太龙、石魔像、三头食人妖
// 能力名/说明为官方中文（boss_bible）；数值见 defs/balance.ts（实测或暂定）
import { AETHER_DRAGON as AD, OGRE, SOUL_HUNTRESS as SH, STONE_GOLEM as SG } from '../defs/balance.ts';
import {
  addStatus, atLeast, banner, curseHero, damageHero, distributeShields, healBoss, highestHealth, log, roundAbility,
  scaleAttack, scaleHp, scaleShield, trapHits,
} from '../engine/core.ts';
import { int, pick, weighted } from '../engine/rng.ts';
import type { AttackExtra, DamageType, GameState, Hero } from '../types.ts';
import { attack, type BossModule } from './module.ts';

const N = (s: GameState) => s.heroes.length;
type Atk = { key: string; name: string; value: number; extra: AttackExtra; weight: number };
const planFrom = (s: GameState, table: Atk[], bonus = 0) =>
  s.heroes.map((h) => {
    const a = weighted(s, table);
    return attack(s, h.seat, a.key, a.name, scaleAttack(s, a.value + bonus), { ...a.extra });
  });
const poisonResist = (s: GameState, name: string) => {
  if (s.boss.poison > 0) {
    s.boss.poison -= 1;
    log(s, `抗毒：${name}的中毒量减少 1。`, 'boss');
  }
};

// ———————————————————— 第 2 关：灵魂女猎手 ————————————————————
export const soulHuntress: BossModule = {
  id: 'soulHuntress', name: '灵魂女猎手', order: 2,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, SH.hpPerHero * N(s));
  },
  shields(s) {
    const sh = distributeShields(s, scaleShield(s, SH.shieldPerHero * N(s) + SH.shieldExtra + s.boss.shieldBonus));
    return sh;
  },
  plan: (s) => planFrom(s, SH.attacks, s.boss.attackBonus),
  onHeroHit(s, h, dmg) {
    // [trap] 吸收生命：她的攻击伤到你时，她回复生命
    if (!trapHits(s, h, '吸收生命')) return;
    const heal = Math.min(dmg, SH.drainCap);
    banner(s, 'trap', '吸收生命', `魔王的攻击吸收了你的生命。灵魂女猎手治疗自己 ${heal} 点。`);
    healBoss(s, heal, '吸收生命');
  },
  afterAttack(s) {
    if (s.round % SH.nightmareEvery === 0) {
      roundAbility(s, '噩梦', `每位英雄失去 ${SH.nightmareDamage} 点生命值，并把牌库顶 ${SH.nightmareMill} 张牌放进弃牌堆。`, () => {
        for (const h of s.heroes) {
          damageHero(s, h, scaleAttack(s, SH.nightmareDamage), '噩梦');
          for (let i = 0; i < SH.nightmareMill && h.deck.length; i++) h.discard.push(h.deck.pop()!);
        }
      });
    }
    if (s.round % SH.huntEvery === 0) {
      const h = highestHealth(s);
      roundAbility(s, '猎魂', `生命值最高的英雄（${h.name}）失去生命值并抽取 1 张诅咒。`, () => {
        damageHero(s, h, scaleAttack(s, SH.huntDamage), '猎魂');
        curseHero(s, h, 1, '猎魂');
      });
    }
  },
  onDefeated(s) {
    if (s.boss.flags.revived) return false;
    s.boss.flags.revived = true;
    s.boss.maxHp = s.boss.hp = scaleHp(s, SH.reviveHpPerHero * N(s));
    s.boss.shieldBonus += SH.reviveShieldBonus;
    banner(s, 'healthloss', '复活', `灵魂女猎手从地狱归来，狞笑着。每人抽取 ${SH.reviveCurses} 张诅咒牌并弃置 ${SH.reviveDiscard} 张手牌。`);
    banner(s, 'healthloss', '诅咒嘶叫', '每人抽取 1 张诅咒牌，正面朝下放在各自的英雄牌旁。');
    for (const h of s.heroes) {
      curseHero(s, h, SH.reviveCurses, '诅咒嘶叫');
      for (let i = 0; i < SH.reviveDiscard && h.hand.length; i++) h.discard.push(h.hand.splice(int(s, h.hand.length), 1)[0]);
    }
    return true;
  },
};

// ———————————————————— 第 3 关：以太龙 ————————————————————
const flying = (s: GameState) => !s.boss.flags.ground;
export const aetherDragon: BossModule = {
  id: 'aetherDragon', name: '以太龙', order: 3,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, AD.hpPerHero * N(s));
    s.boss.counters.dmgThisRound = 0;
    s.boss.counters.groundActions = 0;
    s.boss.counters.lastHp = s.boss.hp;
  },
  shields(s) {
    s.boss.spikedShields = [];
    if (flying(s)) {
      // 空中：只有远程/魔法护盾，每种 1–4；其中一个带惊恐（实测）
      const sh = distributeShields(s, Math.min(8, scaleShield(s, N(s) + AD.airShieldExtra)), 1, ['ranged', 'magic']);
      sh.ranged = Math.min(4, sh.ranged);
      sh.magic = Math.min(4, sh.magic);
      s.boss.counters.panicShield = int(s, 2); // 0=远程 1=魔法
      return sh;
    }
    const sh = distributeShields(s, scaleShield(s, AD.groundShieldPerHero * N(s) + AD.groundShieldExtra));
    // 地面：护盾可能变成尖刺护盾（实测）
    const types: DamageType[] = ['melee', 'ranged', 'magic'];
    const k = s.boss.flags.rage ? 2 : 1;
    while (s.boss.spikedShields.length < k) {
      const t = pick(s, types);
      if (!s.boss.spikedShields.includes(t)) s.boss.spikedShields.push(t);
    }
    return sh;
  },
  plan(s) {
    s.boss.counters.dmgThisRound = 0;
    if (flying(s)) return planFrom(s, AD.air, s.boss.attackBonus);
    const p = planFrom(s, AD.ground, s.boss.attackBonus);
    if (s.boss.flags.rage) {
      const big = highestHealth(s);
      const i = p.findIndex((a) => a.target === big.seat);
      p[i] = attack(s, big.seat, 'Attack_EtherDragon_Höllenschrei', '地狱龙吟', scaleAttack(s, AD.rageBig + s.boss.attackBonus), { panic: 1 });
    }
    return p;
  },
  routeDamage(s, _h, type) {
    if (flying(s) && type === 'melee') return { blocked: '以太龙在空中，近战打不到他。' };
    return {};
  },
  onShieldHit(s, h, type) {
    if (flying(s)) {
      const panicType = s.boss.counters.panicShield === 0 ? 'ranged' : 'magic';
      if (type === panicType && trapHits(s, h, '惊恐护盾')) addStatus(s, h, 'panic', 1, '惊恐护盾');
    } else if (s.boss.spikedShields.includes(type) && trapHits(s, h, '尖刺护盾')) {
      banner(s, 'shield', '尖刺护盾', `${h.name}，你失去 ${AD.spikeDamage} 点生命值。`);
      damageHero(s, h, scaleAttack(s, AD.spikeDamage), '尖刺护盾');
    }
  },
  onBossDamaged(s) {
    const lost = s.boss.counters.lastHp === undefined ? 0 : s.boss.counters.lastHp - s.boss.hp;
    s.boss.counters.lastHp = s.boss.hp;
    if (lost > 0) s.boss.counters.dmgThisRound += lost;
    if (!s.boss.flags.rage && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp * AD.rageAt) {
      s.boss.flags.rage = true;
      s.boss.attackBonus += AD.rageBonus;
      banner(s, 'healthloss', '以太龙暴怒', '以太龙的攻击变得极其猛烈。');
    }
  },
  afterAnyAction() {},
  afterAttack(s) {
    if (flying(s) && s.round % AD.wingEvery === 0) {
      const per = atLeast(s, 'pro') ? 2 : 1;
      roundAbility(s, '拍翼攻击', `每位英雄每有 1 张手牌，便失去 ${per} 点生命值。`, () => {
        for (const h of s.heroes) damageHero(s, h, h.hand.length * per, '拍翼攻击');
      });
    }
    if (!flying(s) && s.round % AD.roarEvery === 0) {
      const h = highestHealth(s);
      roundAbility(s, '穿刺龙吟', `有最高生命值的英雄（${h.name}）失去生命值及获得 1 个惊恐标记。`, () => {
        damageHero(s, h, scaleAttack(s, AD.roarDamage + s.boss.attackBonus), '穿刺龙吟');
        addStatus(s, h, 'panic', 1, '穿刺龙吟');
      });
    }
    // 形态变化在回合结束时发生
    const landAt = scaleShield(s, AD.landDamageBase + AD.landDamagePerHero * N(s));
    if (flying(s) && (s.boss.counters.dmgThisRound >= landAt || s.round + 1 >= AD.forceLandRound)) {
      s.boss.flags.ground = true;
      s.boss.counters.groundActions = 0;
      banner(s, 'healthloss', '以太龙降落地面', '在地面，以太龙的护盾强，但攻击力弱。你可以用所有属性攻击他。');
    } else if (!flying(s) && s.round + 1 < AD.forceLandRound && s.boss.counters.groundActions >= AD.takeOffActions) {
      s.boss.flags.ground = false;
      banner(s, 'healthloss', '以太龙再次起飞', '你只能用远程及魔法攻击他。');
    }
  },
  onCardResolved(s) {
    if (!flying(s)) s.boss.counters.groundActions += 1;
  },
  statusPhase: (s) => poisonResist(s, '以太龙'),
  hint: (s) => (flying(s) ? { avoid: ['melee'] } : { avoid: s.boss.spikedShields.filter((t) => s.boss.shields[t] > 0) }),
};

// ———————————————————— 第 4 关：石魔像 ————————————————————
export const stoneGolem: BossModule = {
  id: 'stoneGolem', name: '石魔像', order: 4,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, SG.hpPerHero * N(s));
    s.boss.counters.charge = 0;
    s.boss.counters.level = 0;
  },
  shields(s) {
    // 每回合一个护盾带"危险护盾碎片"标记（实拍：只有一个护盾带标记）
    s.boss.spikedShields = [pick(s, ['melee', 'ranged', 'magic'] as DamageType[])];
    return distributeShields(s, scaleShield(s, SG.shieldPerHero * N(s) + SG.shieldExtra));
  },
  hint: (s) => ({ avoid: s.boss.spikedShields.filter((t) => s.boss.shields[t] > 0) }),
  plan(s) {
    const lv = s.boss.counters.level;
    if (lv >= 1 && s.round > 1) {
      roundAbility(s, '石精泥石流', `每位英雄失去 ${lv} 点生命值。`, () => {
        for (const h of s.heroes) damageHero(s, h, lv, '石精泥石流');
      });
    }
    return planFrom(s, SG.attacks, s.boss.attackBonus);
  },
  onShieldBroken(s, h, type) {
    if (!s.boss.spikedShields.includes(type) || !trapHits(s, h, '危险护盾碎片')) return;
    const d = scaleAttack(s, SG.shardDamage);
    banner(s, 'shield', '危险护盾碎片', `${h.name}，你失去 ${d} 点生命值。`);
    damageHero(s, h, d, '危险护盾碎片');
  },
  onCardResolved(s, h, info) {
    if (!info.lightning) return;
    const b = s.boss.counters;
    if (b.level >= 1) {
      const d = b.level + 1; // 实测：充能等级 2 时提示每次 3 伤害
      if (trapHits(s, h, '石精攻击')) {
        banner(s, 'trap', '石精攻击', `${h.name}，你失去 ${d} 点生命值。`);
        damageHero(s, h, d, '石精攻击');
      }
    }
    b.charge += 1;
    if (b.charge >= SG.chargeBase + SG.chargePerHero * N(s)) {
      b.charge = 0;
      b.level += 1;
      banner(s, 'trap', '充能', `石魔像完全充能（等级 ${b.level}）。之后每打出 1 张有闪电的卡，石精便会对你造成伤害。`);
    }
  },
  afterAttack(s) {
    if (s.round % SG.essenceEvery === 0) {
      const left = s.boss.shields.melee + s.boss.shields.ranged + s.boss.shields.magic;
      roundAbility(s, '岩石精华', `石魔像用余下的护盾自我治疗，获得 ${left} 点生命值。`, () => healBoss(s, left, '岩石精华'));
    }
    if (s.round % SG.freezeEvery === 0) {
      roundAbility(s, '冻结', '每位英雄获得麻痹标记。每有 1 个麻痹标记，便失去 1 点生命值。', () => {
        for (const h of s.heroes) {
          addStatus(s, h, 'paralysis', 1, '冻结');
          damageHero(s, h, h.status.paralysis, '冻结');
        }
      });
    }
  },
  onBossDamaged(s) {
    if (!s.boss.flags.petrify && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp / 2) {
      s.boss.flags.petrify = true;
      banner(s, 'healthloss', '石化', '每位英雄获得 1 个麻痹标记。');
      for (const h of s.heroes) addStatus(s, h, 'paralysis', 1, '石化');
    }
  },
  statusPhase: (s) => poisonResist(s, '石魔像'),
};

// ———————————————————— 第 5 关：三头食人妖 ————————————————————
const HEADS = ['spit', 'horn', 'hairy'] as const;
type HeadId = (typeof HEADS)[number];
const headOf = (s: GameState, id: HeadId) => s.boss.parts.find((p) => p.id === id)!;
const dominant = (s: GameState) => HEADS[s.boss.counters.dominant] as HeadId;

export const ogre: BossModule = {
  id: 'ogre', name: '三头食人妖', order: 5,
  setup(s) {
    const hp = scaleHp(s, OGRE.headHpPerHero * N(s));
    s.boss.parts = HEADS.map((id) => ({ id, name: OGRE.heads[id].name, hp, maxHp: hp, alive: true, slot: OGRE.heads[id].slot }));
    s.boss.maxHp = s.boss.hp = hp * 3;
    s.boss.counters.dominant = -1;
    s.boss.counters.stunExtra = 0;
  },
  shields: () => null, // 每个头只能受某一种属性攻击，没有护盾
  plan(s) {
    const alive = HEADS.filter((id) => headOf(s, id).alive);
    const options = alive.length > 1 ? alive.filter((id) => HEADS.indexOf(id) !== s.boss.counters.dominant) : alive;
    const d = pick(s, options);
    s.boss.counters.dominant = HEADS.indexOf(d);
    s.boss.counters.dmgToDominant = 0;
    s.boss.flags.stunned = false;
    const head = OGRE.heads[d];
    banner(s, 'round', `${head.name}正在主导`, `${head.name}只能被${{ magic: '魔法', ranged: '远程', melee: '近战' }[head.slot]}攻击击晕。`);
    const bonus = s.boss.attackBonus + (d === 'hairy' ? OGRE.hairyBuff : 0);
    if (d === 'hairy') banner(s, 'round', '激励', '魔王在本轮的攻击更强。');
    const planned = planFrom(s, head.attacks, bonus);
    // 攻击被增强时 App 显示"强化"版名称（官方 Attack_ThreeHeadedOgre_Buffed_*）
    if (bonus > 0) for (const a of planned) if (!a.nameKey.includes('Buffed_')) {
      a.nameKey = a.nameKey.replace('Attack_ThreeHeadedOgre_', 'Attack_ThreeHeadedOgre_Buffed_');
      a.name = '强化' + a.name;
    }
    return planned;
  },
  actionPhaseStart(s) {
    const d = dominant(s);
    if (d === 'spit') roundAbility(s, '化骨口水', '口水怪向你吐口水。每位英雄获得 1 个中毒标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '化骨口水')));
    if (d === 'horn') {
      roundAbility(s, '咒骂', '尖突怪咒骂你。每人抽取 1 张诅咒牌并立刻执行。', () => {
        for (const h of s.heroes) curseHero(s, h, 1, '咒骂', true); // 官方例外：立即生效
      });
    }
  },
  routeDamage(s, _h, type) {
    const target = HEADS.map((id) => headOf(s, id)).find((p) => p.slot === type && p.alive);
    if (target) return { part: target };
    if (type === 'melee' && s.round >= OGRE.meleeAnyFrom) {
      const any = HEADS.map((id) => headOf(s, id)).filter((p) => p.alive).sort((a, b) => a.hp - b.hp)[0];
      if (any) return { part: any };
    }
    return { blocked: `能被${type === 'melee' ? '近战' : type === 'ranged' ? '远程' : '魔法'}攻击的头已经倒下。` };
  },
  onPartHit(s, _h, part, dealt) {
    if (part.id === dominant(s)) {
      s.boss.counters.dmgToDominant += dealt;
      const need = OGRE.stunBase + N(s) + s.boss.counters.stunExtra;
      if (!s.boss.flags.stunned && s.boss.counters.dmgToDominant >= need) {
        s.boss.flags.stunned = true;
        banner(s, 'trap', `${part.name}被击晕`, '它的强化能力会大幅弱化。');
      }
    }
    s.boss.hp = s.boss.parts.reduce((t, p) => t + Math.max(0, p.hp), 0);
  },
  onBossDamaged(s) {
    // 直接扣魔王生命的效果（中毒、扑翼机等）打在主导的头上
    const sum = s.boss.parts.reduce((t, p) => t + Math.max(0, p.hp), 0);
    let diff = sum - s.boss.hp;
    if (diff <= 0) return;
    const order = [headOf(s, dominant(s)), ...s.boss.parts].filter((p) => p.alive);
    for (const p of order) {
      const d = Math.min(p.hp, diff);
      p.hp -= d;
      diff -= d;
      if (p.hp <= 0 && p.alive) {
        p.alive = false;
        log(s, `【${p.name}】被打败了`, 'hero');
      }
      if (diff <= 0) break;
    }
    s.boss.hp = s.boss.parts.reduce((t, p) => t + Math.max(0, p.hp), 0);
  },
  hint(s) {
    const d = headOf(s, dominant(s));
    return d?.alive && !s.boss.flags.stunned ? { prefer: [d.slot!] } : {};
  },
  actionPhaseEnd(s) {
    const d = dominant(s);
    const weak = s.boss.flags.stunned || !headOf(s, d).alive;
    if (d === 'spit') {
      if (weak) roundAbility(s, '弱化剧毒喷发', '每位英雄获得 1 个中毒标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '弱化剧毒喷发')));
      else roundAbility(s, '强化剧毒喷发', '每位英雄获得 1 个中毒标记。本场战斗的余下时间，每个中毒标记造成额外 1 点伤害。', () => {
        s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '强化剧毒喷发'));
        s.boss.counters.poisonPlus = 1;
      });
    } else if (d === 'horn') {
      const strong = !weak;
      roundAbility(s, strong ? '强化咒骂' : '弱化咒骂', strong ? '每位英雄从其牌库移除 2 张卡牌，然后抽取 2 张诅咒牌。' : '将每人牌库的顶牌移除出游戏，然后每人抽取 1 张诅咒牌。', () => {
        for (const h of s.heroes) {
          for (let i = 0; i < (strong ? 2 : 1) && h.deck.length; i++) h.exiled.push(h.deck.pop()!);
          curseHero(s, h, strong ? 2 : 1, '咒骂');
        }
      });
    } else if (weak) {
      roundAbility(s, '焦头烂额', '在余下的战斗中，你必须造成更大伤害，才能击晕他们。', () => (s.boss.counters.stunExtra += 2));
    } else roundAbility(s, '释放力量', '魔王在余下的战斗中攻击更强。', () => (s.boss.attackBonus += 1));
  },
};

export type { Hero };
