import { PRINCE, PUPPET } from '../data/balance.ts';
import {
  addStatus, banner, damageHero, distributeShields, highestHealth, log, roundAbility, scaleAttack, scaleHp, scaleShield, trapHits,
} from '../engine/core.ts';
import { next, weighted } from '../engine/rng.ts';
import { attack, type BossModule } from './module.ts';

const N = (s: { heroes: unknown[] }) => s.heroes.length;

// ———————————————————— 教学：木偶先生 ————————————————————
export const puppet: BossModule = {
  id: 'puppet', name: '木偶先生', order: 0,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, PUPPET.hpPerHero * N(s));
  },
  shields(s) {
    if (s.round === 1) return null; // 官方：教学第 1 回合跳过护盾
    const total = Math.max(3, PUPPET.shieldBase * N(s) + 1 - N(s) * (s.round - 2));
    return distributeShields(s, scaleShield(s, total));
  },
  plan(s) {
    const tired = s.round >= PUPPET.tiredFrom ? s.round - PUPPET.tiredFrom + 1 : 0;
    return s.heroes.map((h) =>
      s.round === 1
        ? attack(s, h.seat, 'Attack_MrPuppet_Rundumschlag', '横扫', scaleAttack(s, PUPPET.sweep))
        : attack(s, h.seat, 'Attack_MrPuppet_GiftigerWirbel', '毒螺旋', Math.max(1, scaleAttack(s, PUPPET.spin) - tired), { poison: PUPPET.spinPoison }),
    );
  },
};

// ———————————————————— 第 1 关：青蛙王子 ————————————————————
export const prince: BossModule = {
  id: 'prince', name: '青蛙王子', order: 1,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, PRINCE.hpPerHero * N(s));
  },
  shields(s) {
    // 实测：第 1 回合就有护盾（3 人 3/2/2、4 人 2/3/5）
    const sh = distributeShields(s, scaleShield(s, PRINCE.shieldPerHero * N(s) + PRINCE.shieldExtra));
    for (const k of ['melee', 'ranged', 'magic'] as const) sh[k] += s.boss.shieldBonus;
    return sh;
  },
  plan(s) {
    if (s.round >= PRINCE.rageRound && !s.boss.flags.rage) {
      s.boss.flags.rage = true;
      s.boss.attackBonus += PRINCE.rageBonus;
      banner(s, 'healthloss', '青蛙王子发怒了', '从现在起他的攻击更强。');
    }
    const bonus = s.boss.attackBonus;
    if (s.round >= 2 && next(s) < PRINCE.croakChance) {
      return s.heroes.map((h) => attack(s, h.seat, 'Attack_Prince_Unkenruf', '末日呱叫', scaleAttack(s, PRINCE.croakDamage + bonus)));
    }
    let pool = PRINCE.attacks.slice();
    return s.heroes.map((h) => {
      const a = weighted(s, pool);
      if (a.single) pool = pool.filter((x) => x !== a);
      return attack(s, h.seat, a.key, a.name, scaleAttack(s, a.value + bonus), { poison: a.poison });
    });
  },
  afterAttack(s) {
    if (s.round % PRINCE.tongueEvery === 0) {
      const h = highestHealth(s);
      roundAbility(s, '舌鞭', `生命值最高的英雄（${h.name}）获得中毒标记并失去生命值。`, () => {
        addStatus(s, h, 'poison', PRINCE.tonguePoison, '舌鞭');
        damageHero(s, h, scaleAttack(s, PRINCE.tongueDamage + s.boss.attackBonus), '舌鞭');
      });
    }
    if (s.round % PRINCE.overrunEvery === 0) {
      roundAbility(s, '蹂躏', '每位英雄失去生命值。', () => {
        for (const h of s.heroes) damageHero(s, h, scaleAttack(s, PRINCE.overrunDamage), '蹂躏');
      });
    }
  },
  onCardResolved(s, h, info) {
    if ((info.attack || info.support) && info.maxValue >= PRINCE.poisonSpitThreshold && trapHits(s, h, '剧毒喷吐')) {
      banner(s, 'trap', '剧毒喷吐', `${h.name}，你获得 1 个中毒标记。`);
      addStatus(s, h, 'poison', 1, '剧毒喷吐');
    }
  },
  onBossDamaged(s) {
    if (!s.boss.flags.inflate && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp / 2) {
      s.boss.flags.inflate = true;
      s.boss.attackBonus += PRINCE.inflateAttack;
      s.boss.shieldBonus += PRINCE.inflateShield;
      banner(s, 'healthloss', '膨胀', '青蛙王子已失去其一半生命：他的攻击值和护盾值增加。');
    }
  },
  statusPhase(s) {
    if (s.boss.poison > 0) {
      s.boss.poison -= 1;
      log(s, '抗毒：青蛙王子的中毒量减少 1。', 'boss');
    }
  },
};
