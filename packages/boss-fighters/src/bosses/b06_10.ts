// 第 6–10 关：巨触手、熔岩王、炸弹克精、果冻怪、巫毒天后
// 能力名/说明为官方中文（boss_bible）；数值见 defs/balance.ts（多为暂定）
import { BOMBOSSA as BB, BOMBOSSA_ATTACKS, JELLY as JL, MAGMAROS as MG, TENTACOLOSSUS as TC, VOODOO as VD } from '../defs/balance.ts';
import { CARDS } from '../defs/cards.ts';
import {
  addStatus, atLeast, fx, isOver, banner, curseHero, damageHero, distributeShields, drawCards, giveSlime, handLimit, healBoss, highestHealth, hero, log,
  loseBossHp, loseCards, removeStatuses, roundAbility, scaleAttack, scaleHp, scaleShield, trapHits,
} from '../engine/core.ts';
import { int, pick, shuffle, weighted } from '../engine/rng.ts';
import type { AttackExtra, BossPart, DamageType, GameState, Hero } from '../types.ts';
import { attack, type BossModule } from './module.ts';

const N = (s: GameState) => s.heroes.length;
const TYPES: DamageType[] = ['melee', 'ranged', 'magic'];
const TN: Record<DamageType, string> = { melee: '近战', ranged: '远程', magic: '魔法' };
type Atk = { key: string; name: string; value: number; extra: AttackExtra; weight: number };
const planFrom = (s: GameState, table: Atk[], bonus = 0) =>
  s.heroes.map((h) => {
    const a = weighted(s, table);
    return attack(s, h.seat, a.key, a.name, scaleAttack(s, a.value + bonus), { ...a.extra });
  });
const part = (s: GameState, id: string) => s.boss.parts.find((p) => p.id === id);
const alive = (s: GameState) => s.boss.parts.filter((p) => p.alive);

// ———————————————————— 第 6 关：巨触手 ————————————————————
// 6 只触手对应"属性 × 攻击/助攻"；有对应触手存活时伤害打触手，本体只受极少伤害（官方）
const TENTACLES: { id: string; name: string; type: DamageType; kind: 'attack' | 'support'; ability: 'rot' | 'toxic' | 'doom' | 'curse' | 'drain' | 'regen' }[] = [
  { id: 'rot', name: '腐烂触手', type: 'melee', kind: 'attack', ability: 'rot' },
  { id: 'toxic', name: '剧毒触手', type: 'melee', kind: 'support', ability: 'toxic' },
  { id: 'doom', name: '厄运触手', type: 'ranged', kind: 'attack', ability: 'doom' },
  { id: 'curse', name: '诅咒触手', type: 'ranged', kind: 'support', ability: 'curse' },
  { id: 'drain', name: '吸星触手', type: 'magic', kind: 'attack', ability: 'drain' },
  { id: 'regen', name: '重生触手', type: 'magic', kind: 'support', ability: 'regen' },
];
const deadTentacles = (s: GameState) => s.boss.parts.filter((p) => !p.alive).length;

export const tentacolossus: BossModule = {
  id: 'tentacolossus', name: '巨触手', order: 6,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, TC.bodyHpBase + TC.bodyHpPerHero * N(s));
    const hp = scaleHp(s, TC.tentacleHpBase + TC.tentacleHpPerHero * N(s));
    s.boss.parts = TENTACLES.map((t) => ({ id: t.id, name: t.name, hp, maxHp: hp, alive: true, slot: t.type, tag: t.kind }));
  },
  shields: () => null,
  plan(s) {
    s.boss.counters.attackedMask = 0;
    s.boss.flags.firstHit_rot = s.boss.flags.firstHit_toxic = s.boss.flags.firstHit_doom = false;
    s.boss.flags.firstHit_curse = s.boss.flags.firstHit_drain = s.boss.flags.firstHit_regen = false;
    const minus = deadTentacles(s) >= 1 ? 1 : 0; // 打残 1 只：攻击力永久减少
    // 官方攻击就是各条触手（腐烂/剧毒/厄运/诅咒/吸星/重生触手），由存活的触手出手；附加效果【暂定】
    const KEY: Record<string, string> = { rot: 'Tentakelgift', toxic: 'Tentakelstachel', doom: 'Verdammnistentakel', curse: 'Fluchtentakel', drain: 'Erholungstentakel', regen: 'Regenerationstentakel' };
    const EXTRA: Record<string, AttackExtra> = { rot: { lost: 1 }, toxic: { poison: 1 }, curse: { curse: 1 } };
    const liveT = TENTACLES.filter((t) => s.boss.parts.some((x) => x.id === t.id && x.alive));
    const p = s.heroes.map((h) => {
      const t = liveT.length ? pick(s, liveT) : TENTACLES[int(s, TENTACLES.length)];
      const v = Math.max(1, scaleAttack(s, TC.attack) - minus + (t.id === 'doom' ? 1 : 0));
      return attack(s, h.seat, `Attack_Tentacolossus_${KEY[t.id]}`, t.name, v, EXTRA[t.id] ?? {});
    });
    if (deadTentacles(s) >= 2 && !s.boss.flags.inked) {
      // 打残 2 只：本回合攻击值被墨汁遮盖
      s.boss.flags.inked = true;
      p.forEach((a) => (a.hidden = true));
      banner(s, 'healthloss', '墨汁', '魔王在这轮的攻击值被墨汁遮盖。');
    }
    return p;
  },
  routeDamage(s, _h, type, kind) {
    const all = s.boss.parts;
    const bonus = deadTentacles(s) >= 4 ? 1 : 0; // 打残 4 只：弱点，伤害更大（暂定 +1）
    if (all.some((p) => p.alive) && !s.boss.flags.tentacleDefense) {
      s.boss.flags.tentacleDefense = true;
      banner(s, 'attack', '触手防御', '巨触手使用其触手防御。你的攻击伤害不了它。它的触手完全承受了伤害！');
    }
    const own = all.find((p) => p.slot === type && p.tag === kind && p.alive);
    if (own) return { part: own, bodyShare: TC.bodyShare + bonus };
    const others = all.filter((p) => p.alive);
    if (others.length) return { part: pick(s, others), partMult: TC.replacementMult, bodyShare: TC.bodyShare + bonus };
    return { mult: bonus ? 1.25 : 1 };
  },
  onPartHit(s, h, p) {
    const t = TENTACLES.find((x) => x.id === p.id)!;
    s.boss.counters.attackedMask |= 1 << h.seat;
    if (s.boss.flags[`firstHit_${t.id}`]) return;
    s.boss.flags[`firstHit_${t.id}`] = true; // 每只触手的能力影响每回合先攻击它的英雄（官方）
    if (!trapHits(s, h, t.name)) return;
    switch (t.ability) {
      case 'rot': banner(s, 'trap', t.name, `${h.name}，你获得 ${TC.rotPoison} 个中毒标记。`); addStatus(s, h, 'poison', TC.rotPoison, t.name); break;
      case 'toxic': banner(s, 'trap', t.name, `${h.name}，你获得 1 个中毒标记。`); addStatus(s, h, 'poison', TC.toxicPoison, t.name); break;
      case 'doom': case 'curse': banner(s, 'trap', t.name, `${h.name}，抽取 1 张诅咒牌。`); curseHero(s, h, 1, t.name); break;
      case 'drain': case 'regen':
        banner(s, 'trap', t.name, `巨触手吸取你的生命力。魔王获得 ${TC.drain} 点生命值，${h.name} 失去 ${TC.drain} 点生命值。`);
        damageHero(s, h, TC.drain, t.name);
        healBoss(s, TC.drain, t.name);
        break;
    }
  },
  onPartDefeated(s, _h, p) {
    const d = deadTentacles(s);
    banner(s, 'healthloss', `打残${p.name}`, d === 1 ? '魔王在余下战斗的攻击力会减少。' : d === 4 ? '弱点：你对巨触手造成的伤害会更大。' : d === 6 ? '恼人墨汁：全部触手都被打残了，直接攻击本体！' : `已打残 ${d} 只触手。`);
  },
  onBossDamaged(s, h) {
    if (h) s.boss.counters.attackedMask |= 1 << h.seat;
  },
  onItemUsed(s) {
    if (deadTentacles(s) === 6) {
      banner(s, 'trap', '重生时间', `巨触手趁机治疗自己。它获得 ${TC.regenHeal} 点生命值。`);
      healBoss(s, TC.regenHeal, '重生时间');
    }
  },
  actionPhaseEnd(s) {
    // [attack] 只有攻击过它（或触手）的英雄才会受到魔王攻击（官方）
    const mask = s.boss.counters.attackedMask ?? 0;
    const before = s.planned.length;
    s.planned = s.planned.filter((a) => mask & (1 << a.target));
    if (s.planned.length < before) log(s, '没有攻击巨触手的英雄这回合不会受到魔王攻击。', 'boss');
    if (s.planned.some((a) => a.hidden)) banner(s, 'healthloss', '视野清晰', '你再一次可以看清魔王的攻击了。');
    for (const a of s.planned) a.hidden = false;
    if (atLeast(s, 'pro')) {
      for (const a of s.planned) {
        if (a.reducedBy === 0) {
          const h = hero(s, a.target);
          const n = h.status.poison + h.status.panic + h.status.paralysis + h.status.fire;
          if (n) {
            banner(s, 'trap', '无敌攻击', `${h.name}，你每有 1 个状态标记：失去 1 点生命值及弃掉 1 张随机手牌。`);
            damageHero(s, h, n, '无敌攻击');
            for (let i = 0; i < n && h.hand.length; i++) h.discard.push(h.hand.splice(int(s, h.hand.length), 1)[0]);
          }
        }
      }
    }
  },
  afterAttack(s) {
    if (s.round % 2) return;
    const live = alive(s).length;
    const which = (s.round / 2 - 1) % 4;
    if (which === 0 && live) {
      roundAbility(s, '触手乱舞', `每有 1 条未被打残的触手（${live}），每位英雄必须选择：弃掉 1 张手牌或失去 ${TC.whirlLoss} 点生命值。`, () => {
        for (const h of s.heroes) for (let i = 0; i < live; i++) {
          if (h.hand.length > 2) h.discard.push(h.hand.splice(int(s, h.hand.length), 1)[0]);
          else damageHero(s, h, TC.whirlLoss, '触手乱舞');
        }
      });
    } else if (which === 1) roundAbility(s, '停滞时间', '每位英雄获得 1 个麻痹标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'paralysis', 1, '停滞时间')));
    else if (which === 2) roundAbility(s, '腐烂时间', '每位英雄获得 1 个中毒标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '腐烂时间')));
    else roundAbility(s, '黑暗时间', '每位英雄获得 1 个惊恐标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'panic', 1, '黑暗时间')));
  },
  poisonMult: () => 0.5, // 巨触手对中毒更有抵抗力
  hint(s) {
    // 优先打还活着的触手对应的属性
    const live = alive(s);
    return live.length ? { prefer: [...new Set(live.map((p) => p.slot!))] } : {};
  },
};

// ———————————————————— 第 7 关：熔岩王 ————————————————————
const MINIONS = [
  { id: 'lava', name: '岩浆手下', slot: 'melee' as DamageType },
  { id: 'ash', name: '灰烬手下', slot: 'ranged' as DamageType },
  { id: 'flame', name: '火焰手下', slot: 'magic' as DamageType },
];
export const magmaros: BossModule = {
  id: 'magmaros', name: '熔岩王', order: 7,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, MG.bodyHpPerHero * N(s));
    const hp = scaleHp(s, MG.minionHpPerHero * N(s));
    s.boss.parts = MINIONS.map((m) => ({ id: m.id, name: m.name, hp, maxHp: hp, alive: true, slot: m.slot }));
  },
  shields(s) {
    if (!s.boss.flags.lava) return null; // 熔岩王没有护盾，由 3 个手下保护
    s.boss.spikedShields = ['melee', 'ranged', 'magic'];
    return distributeShields(s, scaleShield(s, MG.lavaShieldPerHero * N(s) + MG.lavaShieldExtra));
  },
  plan(s) {
    // 被打败的手下在下一轮满血回来；没被打败的保留剩余生命（官方）
    if (!s.boss.flags.lava) for (const p of s.boss.parts) if (!p.alive) { p.alive = true; p.hp = p.maxHp; }
    for (const h of s.heroes) s.boss.counters[`cards_${h.seat}`] = 0;
    return planFrom(s, MG.attacks, s.boss.attackBonus);
  },
  modifyValue(s, h, _t, _k, v) {
    const n = s.boss.counters[`cards_${h.seat}`] ?? 0;
    return n >= MG.heatAt - 1 ? Math.max(0, v - 1) : v;
  },
  onCardResolved(s, h, info) {
    if (!info.attack && !info.support) return;
    const k = `cards_${h.seat}`;
    s.boss.counters[k] = (s.boss.counters[k] ?? 0) + 1;
    const n = s.boss.counters[k];
    if (n === MG.heatAt && trapHits(s, h, '热力')) banner(s, 'trap', '热力', `${h.name}，你在本轮攻击太多次了。在本轮余下时间，你的攻击和助攻值都会减 1。`);
    if (n >= MG.blazeAt && trapHits(s, h, '燃烧吧！')) {
      banner(s, 'trap', '燃烧吧！', `${h.name}，拿取 1 个着火标记。`);
      addStatus(s, h, 'fire', 1, '炽热');
    }
  },
  routeDamage(s, _h, type) {
    if (s.boss.flags.lava) return {};
    const m = s.boss.parts.find((p) => p.slot === type && p.alive);
    return m ? { part: m } : {};
  },
  onPartHit(s, h, p) {
    if (!trapHits(s, h, p.name)) return;
    if (p.id === 'lava') {
      const i = h.hand.findIndex((c) => c !== 'slime' && /prot|shield|mail|chest|belt|bracers|robe|wall|cloak|helmet|brooch|spell/.test(c));
      banner(s, 'shield', '岩浆手下吐熔岩', `${h.name}，弃置有保护效果的 1 张手牌（如可能）。`);
      if (i >= 0) h.discard.push(h.hand.splice(i, 1)[0]);
    } else if (p.id === 'ash') {
      banner(s, 'shield', '愤怒熔岩王', `魔王对 ${h.name} 的攻击更猛烈。`);
      for (const a of s.planned) if (a.target === h.seat) {
        a.value += MG.rangedRage;
        // 官方有 4 个"愤怒"版攻击（*2），对应关系为推断
        const RAGE: Record<string, [string, string]> = {
          Attack_Magmaros_Glutfaust: ['Attack_Magmaros_Flammengriff2', '毁灭烈火爪'],
          Attack_Magmaros_Funkenregen: ['Attack_Magmaros_Feuersäule2', '怒火风暴'],
          Attack_Magmaros_Magmaschauer: ['Attack_Magmaros_Lavastrahl2', '恐怖炎浪'],
          Attack_Magmaros_Flammenfluch: ['Attack_Magmaros_Höllenfeuer2', '致盲火柱'],
        };
        const r = RAGE[a.nameKey];
        if (r) [a.nameKey, a.name] = r;
      }
    } else {
      banner(s, 'shield', '火焰手下掷火球', `${h.name}，拿取 1 个着火标记。`);
      addStatus(s, h, 'fire', 1, '火焰手下');
    }
  },
  onPartDefeated(s, h, p) {
    if (!atLeast(s, 'pro')) return;
    if (p.id === 'lava') banner(s, 'trap', '岩浆手下尖叫', '每人弃置手上带有攻击的 1 张牌（如可以）。');
    if (p.id === 'ash') {
      banner(s, 'trap', '灰烬手下爆炸', '每位英雄失去 2 点生命值。');
      s.heroes.forEach((x) => damageHero(s, x, 2, '灰烬手下爆炸'));
    }
    if (p.id === 'flame') {
      banner(s, 'trap', '火焰手下过热', `${h.name}，你每持有 1 个着火标记，便失去 1 点生命值。`);
      damageHero(s, h, h.status.fire, '火焰手下过热');
    }
  },
  onShieldHit(s, h) {
    if (s.boss.flags.lava && trapHits(s, h, '火护盾')) {
      banner(s, 'shield', '火护盾', `${h.name}，你获得 1 个着火标记。`);
      addStatus(s, h, 'fire', 1, '火护盾');
    }
  },
  actionPhaseEnd(s) {
    if (s.boss.flags.lava) return;
    for (const p of alive(s)) {
      if (p.id === 'lava') {
        const h = highestHealth(s);
        roundAbility(s, '岩浆手下攻击', `最高生命值的英雄（${h.name}）失去生命值。`, () => damageHero(s, h, scaleAttack(s, MG.meleeMinionDamage), '岩浆手下'));
      } else if (p.id === 'ash') roundAbility(s, '灰烬手下治疗', `灰烬手下为魔王治疗 ${p.hp} 点。`, () => healBoss(s, p.hp, '灰烬手下'));
      else roundAbility(s, '火焰手下爆发', '每位英雄获得 1 个着火标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'fire', 1, '火焰手下')));
    }
  },
  afterAttack(s) {
    if (s.round % MG.fireWaveEvery === 0) roundAbility(s, '火浪', '每位英雄获得 1 个着火标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'fire', 1, '火浪')));
    if (s.round % MG.burnEvery === 0) roundAbility(s, '焚烧', '所有英雄每持有 1 个着火标记，便失去 1 点生命值。', () => s.heroes.forEach((h) => damageHero(s, h, h.status.fire, '焚烧')));
    if (s.round % MG.ashRainEvery === 0) roundAbility(s, '灰烬雨', '每位英雄立刻各自将所有出牌区的卡牌放到弃牌堆。', () => s.heroes.forEach((h) => { h.discard.push(...h.play); h.play = []; }));
  },
  onBossDamaged(s) {
    if (!s.boss.flags.smolder && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp / 2) {
      s.boss.flags.smolder = true;
      s.boss.attackBonus += MG.smolderBonus;
      banner(s, 'healthloss', '闷烧', '熔岩王充满力量。他变得更强，每位英雄获得 1 个着火标记。');
      s.heroes.forEach((h) => addStatus(s, h, 'fire', 1, '闷烧'));
    }
    if (!s.boss.flags.lava && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp / 3) {
      s.boss.flags.lava = true;
      for (const p of s.boss.parts) p.alive = false;
      banner(s, 'healthloss', '熔岩王喝岩浆', '围着他的会是岩浆护盾而非手下。');
    }
  },
  poisonMult: () => 0.5,
  hint: (s: GameState) => {
  // 集中火力：先打已经受伤最重的手下；手下倒下的属性可以直接打本体
  const live = alive(s).sort((a, b) => a.hp - b.hp);
  const dead = TYPES.filter((t) => !s.boss.parts.some((p) => p.alive && p.slot === t));
  return { prefer: dead.length ? dead : live.slice(0, 1).map((p) => p.slot!) };
},
};

// ———————————————————— 第 8 关：炸弹克精（时间制） ————————————————————
const BOMBS = [
  { id: 'poison', name: '毒炸弹', text: '每位英雄获得 2 个中毒标记。' },
  { id: 'panic', name: '惊恐炸弹', text: '每位英雄获得 1 个惊恐标记。' },
  { id: 'spike', name: '尖刺炸弹', text: '每位英雄失去 3 点生命值。' },
  { id: 'fire', name: '燃烧弹', text: '每位英雄获得 1 个着火标记。' },
  { id: 'card', name: '卡牌炸弹', text: '每人弃置 1 张手牌。' },
  { id: 'time', name: '时间炸弹', text: '剩余时间减 2。' },
];
function bombExplode(s: GameState, id: string) {
  const b = BOMBS.find((x) => x.id === id)!;
  banner(s, 'trap', `${b.name}爆炸`, b.text);
  for (const h of s.heroes) {
    if (id === 'poison') addStatus(s, h, 'poison', 2, b.name);
    if (id === 'panic') addStatus(s, h, 'panic', 1, b.name);
    if (id === 'spike') damageHero(s, h, 3, b.name);
    if (id === 'fire') addStatus(s, h, 'fire', 1, b.name);
    if (id === 'card' && h.hand.length) h.discard.push(h.hand.splice(int(s, h.hand.length), 1)[0]);
  }
  if (id === 'time' && s.time !== null) s.time = Math.max(0, s.time - 2);
}

/** 时间段结束：状态、弃抽、护盾、炸弹倒数（05 C5：致死先于时间耗尽判定） */
function segmentEnd(s: GameState) {
  s.round += 1;
  log(s, `—— 第 ${s.round} 时间段 ——`);
  if (s.heroes.some((h) => h.status.poison)) banner(s, 'round', '毒素发作', '每位英雄每有1个中毒标记便失去1点生命值。');
  for (const h of s.heroes) {
    if (h.status.poison) damageHero(s, h, h.status.poison, '中毒');
    // 着火：每个标记抽 1 张，由玩家选择本战移除或弃掉并失去 2 生命（官方；时间段结束后回到行动）
    for (let i = 0; i < h.status.fire; i++) {
      const c = h.deck.pop();
      if (!c) continue;
      s.decisions.push({ seat: h.seat, kind: 'fire', card: c, prompt: `着火：【${CARDS[c]?.name ?? c}】本战移除，或弃掉并失去 2 生命？` });
    }
    h.discard.push(...h.play);
    h.play = [];
    while (h.hand.length > handLimit(h)) h.discard.push(h.hand.shift()!);
    drawCards(s, h, Math.max(0, handLimit(h) - h.hand.length));
  }
  if (s.boss.poison) loseBossHp(s, Math.floor(s.boss.poison * 0.5), '中毒');
  s.attackedTypes = { melee: false, ranged: false, magic: false };
  s.boss.shields = distributeShields(s, scaleShield(s, BB.shieldPerHero * N(s) + BB.shieldExtra));
  // 炸弹倒数
  for (const p of s.boss.parts.filter((x) => x.alive)) {
    p.tag = String(Number(p.tag) - 1);
    if (Number(p.tag) <= 0) { p.alive = false; bombExplode(s, p.id.split('_')[0]); }
  }
  // 新炸弹（放在随机属性位置，攻击它可以拆除）
  const free = TYPES.filter((t) => !s.boss.parts.some((p) => p.alive && p.slot === t));
  if (free.length) {
    const b = pick(s, BOMBS);
    const hp = scaleHp(s, BB.bombHpPerHero * N(s));
    s.boss.parts.push({ id: `${b.id}_${s.round}`, name: b.name, hp, maxHp: hp, alive: true, slot: pick(s, free), tag: String(BB.bombFuse) });
    log(s, `炸弹克精放下了${b.name}（${BB.bombFuse} 个时间段后爆炸）`, 'boss');
  }
  // 计时炸弹
  if (s.boss.counters.ticking > 0) {
    s.boss.counters.ticking -= 1;
    if (s.boss.counters.ticking === 0) {
      const h = s.heroes.find((x) => x.carriesBomb);
      if (h) {
        const n = Math.min(BB.tickingDiscard, h.hand.length);
        banner(s, 'round', '计时炸弹爆炸', `${h.name} 弃置 ${n} 张手牌，每弃置 1 张失去 1 点生命值。`);
        h.discard.push(...h.hand.splice(0, n));
        damageHero(s, h, n, '计时炸弹');
        h.carriesBomb = false;
      }
    }
  }
  if (s.decisions.length && s.phase === 'action') {
    s.resumeAction = true;
    s.phase = 'decision';
  }
}

export const bombossa: BossModule = {
  id: 'bombossa', name: '炸弹克精', order: 8, timeMode: true,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, BB.hpPerHero * N(s));
    s.time = BB.timeBase + BB.timePerHero * N(s);
    s.boss.counters.timeStart = s.time;
    s.boss.counters.nextAttackAt = s.boss.maxHp * (1 - BB.attackEvery);
    s.boss.counters.segLeft = BB.segment;
    s.boss.counters.ticking = 0;
  },
  shields: (s) => distributeShields(s, scaleShield(s, BB.shieldPerHero * N(s) + BB.shieldExtra)),
  plan: () => [], // 炸弹克精只会在承受一定伤害后才会攻击你（官方）
  routeDamage(s, _h, type) {
    const bomb = s.boss.parts.find((p) => p.alive && p.slot === type);
    return bomb ? { part: bomb } : {};
  },
  onPartDefeated(s, _h, p) {
    banner(s, 'trap', '拆除炸弹', `${p.name}被拆除了。每人抽取 1 张卡牌。`);
    s.heroes.forEach((h) => drawCards(s, h, 1));
  },
  onCardResolved(s, h, info) {
    // 打出带闪电的牌时，计时炸弹顺时针跳到下一位（官方）
    if (!info.lightning || !h.carriesBomb) return;
    h.carriesBomb = false;
    const next = s.heroes[(s.heroes.indexOf(h) + 1) % N(s)];
    next.carriesBomb = true;
    log(s, `计时炸弹跳到 ${next.name} 手上`, 'boss');
  },
  onBossDamaged(s) {
    while (s.boss.hp > 0 && s.boss.hp <= s.boss.counters.nextAttackAt) {
      s.boss.counters.nextAttackAt -= s.boss.maxHp * BB.attackEvery;
      s.boss.counters.attacks = (s.boss.counters.attacks ?? 0) + 1;
      if (s.boss.counters.attacks % 2 === 0) {
        banner(s, 'healthloss', '引线轰击', `炸弹克精用引线攻击你。每位英雄失去 ${BB.fuseDamage} 点生命值及获得 1 个着火标记。`);
        for (const h of s.heroes) { damageHero(s, h, scaleAttack(s, BB.fuseDamage), '引线轰击'); addStatus(s, h, 'fire', 1, '引线轰击'); }
      } else {
        const a = BOMBOSSA_ATTACKS[Math.floor(s.boss.counters.attacks / 2) % BOMBOSSA_ATTACKS.length];
        const targets = a.all ? s.heroes : [highestHealth(s)];
        banner(s, 'healthloss', a.name, a.all ? `炸弹克精攻击所有英雄。` : `炸弹克精攻击 ${targets[0].name}。`);
        for (const h of targets) {
          fx(s, { kind: 'bossAttack', seat: h.seat, value: a.value });
          damageHero(s, h, scaleAttack(s, a.value), a.name);
          if (a.extra.fire && !isOver(s)) addStatus(s, h, 'fire', a.extra.fire, a.name);
        }
      }
    }
  },
  afterAnyAction(s, _h, consumed) {
    if (consumed !== 'normal' || s.time === null) return; // 额外行动不扣时间（官方）
    s.time -= 1;
    s.boss.counters.segLeft -= 1;
    const t0 = s.boss.counters.timeStart;
    for (const frac of [2 / 3, 1 / 3]) {
      const key = `tick_${frac.toFixed(2)}`;
      if (!s.boss.flags[key] && s.time <= t0 * frac) {
        s.boss.flags[key] = true;
        const h = s.heroes.slice().sort((a, b) => a.hand.length - b.hand.length)[0];
        s.heroes.forEach((x) => (x.carriesBomb = false));
        h.carriesBomb = true;
        s.boss.counters.ticking = 2;
        banner(s, 'trap', '计时炸弹', `炸弹克精把计时炸弹抛给 ${h.name}。`);
      }
    }
    if (s.boss.counters.segLeft <= 0) {
      s.boss.counters.segLeft = BB.segment;
      segmentEnd(s);
    }
    if (s.phase === 'action' && s.time <= 0) {
      s.phase = 'lost';
      s.current = null;
      banner(s, 'trap', '易爆', '时间到 0，炸弹克精爆炸了。');
    }
  },
  poisonMult: () => 0.5,
  hint: (s) => ({ prefer: s.boss.parts.filter((p) => p.alive).map((p) => p.slot!) }),
};

// ———————————————————— 第 9 关：果冻怪 ————————————————————
const SLIMES = [
  { id: 'slippery', name: '滑溜黏液精' },
  { id: 'cursed', name: '诅咒黏液精' },
  { id: 'para', name: '麻痹黏液精' },
];
function spawnSlimes(s: GameState) {
  const hp = scaleHp(s, JL.minionHpPerHero * N(s));
  const slots = shuffle(s, TYPES);
  s.boss.parts = SLIMES.map((m, i) => ({ id: m.id, name: m.name, hp, maxHp: hp, alive: true, slot: slots[i] }));
}
export const jelly: BossModule = {
  id: 'jelly', name: '果冻怪', order: 9,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, JL.bodyHpPerHero * N(s));
    s.boss.counters.rageBase = s.boss.hp;
    spawnSlimes(s);
  },
  shields: () => null,
  plan(s) {
    if (s.boss.flags.bubble && s.boss.poison > 0) {
      banner(s, 'round', '果涷怪爱剧毒', `果涷怪每有 1 中毒便加 1 生命值。它的中毒值会减少。`);
      healBoss(s, s.boss.poison, '爱剧毒');
      s.boss.poison = Math.floor(s.boss.poison / 2);
    }
    return planFrom(s, JL.attacks, s.boss.attackBonus);
  },
  routeDamage(s, _h, type) {
    const m = s.boss.parts.find((p) => p.alive && p.slot === type);
    if (m) return { part: m };
    if (!alive(s).length) return { mult: JL.weakMult }; // 软弱：直接伤害本体 ×3
    return {};
  },
  onPartHit(s, h, p) {
    if (!trapHits(s, h, p.name)) return;
    if (p.id === 'slippery') { banner(s, 'shield', p.name, `${h.name}，抽取 1 张黏液牌并放入手牌中。`); giveSlime(s, h, 1); }
    if (p.id === 'cursed') { banner(s, 'shield', p.name, `${h.name}，抽取 1 张诅咒牌。`); curseHero(s, h, 1, p.name); }
    if (p.id === 'para') { banner(s, 'shield', p.name, `${h.name}，你获得 2 个麻痹标记。`); addStatus(s, h, 'paralysis', 2, p.name); }
  },
  onPartDefeated(s, _h, p) {
    if (p.id === 'slippery') { banner(s, 'trap', '滑溜黏液精爆裂', '每人从各自失物堆将 1 张牌放在弃牌堆。'); s.heroes.forEach((h) => h.lost.length && h.discard.push(h.lost.shift()!)); }
    if (p.id === 'cursed') {
      banner(s, 'trap', '诅咒黏液精爆裂', '每人将正生效的 1 张诅咒牌放在诅咒弃牌堆。');
      for (const h of s.heroes) { const i = h.curses.findIndex((c) => c.state === 'active'); if (i >= 0) s.curseDiscard.push(h.curses.splice(i, 1)[0].id); }
    }
    if (p.id === 'para') { banner(s, 'trap', '麻痹黏液精爆裂', '每位英雄移除 1 个麻痹标记。'); s.heroes.forEach((h) => (h.status.paralysis = Math.max(0, h.status.paralysis - 1))); }
    if (!alive(s).length) banner(s, 'trap', '软弱', '所有黏液精都倒下了！本回合直接攻击果冻怪，伤害乘三。');
  },
  onProtect(s, h) {
    if (!s.boss.flags.bubble) return;
    // 滑倒：变泡泡后打出的保护牌放进失物堆
    const c = h.play.pop();
    if (c) { h.lost.push(c); log(s, `滑倒：${h.name} 的保护牌进入失物堆`, 'boss'); }
  },
  onBossDamaged(s) {
    while (s.boss.hp > 0 && s.boss.counters.rageBase - s.boss.hp >= JL.enragePer) {
      s.boss.counters.rageBase -= JL.enragePer;
      s.boss.attackBonus += 1;
      banner(s, 'healthloss', '果涷怪暴怒', '果涷怪更愤怒了，攻击增强。');
    }
    if (!s.boss.flags.bubble && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp * JL.bubbleAt) {
      s.boss.flags.bubble = true;
      s.boss.attackBonus += JL.bubbleBonus;
      banner(s, 'healthloss', '果涷泡泡', '它的攻击增强，并得到新能力：滑倒、果涷怪爱剧毒。');
    }
  },
  afterAttack(s) {
    // 分裂：回合结束时才分裂，保证清完黏液精当回合有直击窗口（05 B6）
    if (!alive(s).length) {
      const loss = Math.min(s.boss.hp - 1, scaleHp(s, JL.splitLossPerHero * N(s)));
      banner(s, 'round', '分裂', `果冻怪分裂出 3 只新的黏液精，失去 ${loss} 点生命值，并且息怒。`);
      loseBossHp(s, loss, '分裂');
      s.boss.attackBonus = s.boss.flags.bubble ? JL.bubbleBonus : 0;
      s.boss.counters.rageBase = s.boss.hp;
      spawnSlimes(s);
    }
    if (s.round % JL.lostEvery === 0) roundAbility(s, '迷失黏液中', '每人将 2 张牌库的顶牌放在你的失物堆。', () => s.heroes.forEach((h) => loseCards(s, h, 2, '迷失黏液中')));
    if (s.round % JL.corrodeEvery === 0) roundAbility(s, '腐蚀', '每人从各自失物堆随机选择 1 张牌，在这场讨伐战的余下时间移除到场外。', () => {
      for (const h of s.heroes) if (h.lost.length) h.exiled.push(h.lost.splice(int(s, h.lost.length), 1)[0]);
    });
    if (s.round % JL.causticEvery === 0) roundAbility(s, '腐蚀黏液精', `每位英雄手上每有 1 张黏液牌，便会失去 ${JL.causticDamage} 点生命值，然后将一半黏液牌（向上取整）放回黏液牌堆。`, () => {
      for (const h of s.heroes) {
        const n = h.hand.filter((c) => c === 'slime').length;
        if (!n) continue;
        damageHero(s, h, n * JL.causticDamage, '腐蚀黏液精');
        for (let i = 0; i < Math.ceil(n / 2); i++) { h.hand.splice(h.hand.indexOf('slime'), 1); s.slimePile += 1; }
      }
    });
  },
  hint: (s) => ({ prefer: alive(s).map((p) => p.slot!) }),
};

// ———————————————————— 第 10 关：巫毒天后 ————————————————————
const UNDEAD = [
  { id: 'frog', name: '青蛙僵尸' }, { id: 'soul', name: '骇人灵魂' }, { id: 'dragon', name: '龙骷髅' },
  { id: 'tomb', name: '石坟魔像' }, { id: 'mummy', name: '食人妖木乃伊' }, { id: 'squid', name: '地狱鱿鱼' },
  { id: 'ash', name: '灰烬霸主' }, { id: 'rot', name: '腐臭黏液精' },
];
const undead = (s: GameState, id: string) => s.boss.parts.find((p) => p.id === id && p.alive);

export const madameVoodoo: BossModule = {
  id: 'madameVoodoo', name: '巫毒天后', order: 10,
  setup(s) {
    s.boss.maxHp = s.boss.hp = scaleHp(s, VD.hpPerHero * N(s));
  },
  actionsFor: (s) => (s.round <= VD.soulCutRounds ? 2 : 3), // 割魂：前几轮每人少 1 次行动
  shields(s) {
    if (!s.boss.phase2) return null;
    const sh = distributeShields(s, scaleShield(s, VD.phase2ShieldPerHero * N(s) + VD.phase2ShieldExtra));
    const types = shuffle(s, TYPES);
    s.boss.counters.boneShield = TYPES.indexOf(types[0]);
    s.boss.counters.voodooShield = TYPES.indexOf(types[1]);
    if (s.round % VD.guitarEvery === 0) {
      banner(s, 'round', '吉他独奏保护', '巫毒天后强化自己的护盾。');
      for (const t of TYPES) sh[t] += VD.guitarBonus;
    }
    return sh;
  },
  plan(s) {
    s.boss.counters.typeHits_melee = s.boss.counters.typeHits_ranged = s.boss.counters.typeHits_magic = 0;
    s.boss.immune = s.boss.phase2 ? s.boss.immune : [];
    s.boss.flags.decayed = false;
    if (!s.boss.phase2) {
      // 每轮 3 个不同的亡灵手下满血回来，位置随机（官方）
      const hp = scaleHp(s, VD.minionHpPerHero * N(s));
      const pickd = shuffle(s, UNDEAD).slice(0, 3);
      const slots = shuffle(s, TYPES);
      s.boss.parts = pickd.map((u, i) => ({ id: u.id, name: u.name, hp, maxHp: hp, alive: true, slot: slots[i], tag: s.boss.flags[`soulRevived`] ? 'r' : '' }));
      log(s, `亡灵手下：${s.boss.parts.map((p) => `${p.name}（${TN[p.slot!]}）`).join('、')}`, 'boss');
    } else {
      // 巫毒人偶每 2 轮传给下一位
      if (s.round % VD.dollEvery === 0) {
        const i = s.heroes.findIndex((h) => h.carriesDoll);
        s.heroes.forEach((h) => (h.carriesDoll = false));
        s.heroes[(i + 1) % N(s)].carriesDoll = true;
      }
    }
    if (VD.bombRounds.includes(s.round)) {
      const h = pick(s, s.heroes);
      s.heroes.forEach((x) => (x.carriesBomb = false));
      h.carriesBomb = true;
      s.boss.counters.bombIn = VD.bombFuse;
      banner(s, 'round', '看我找到什么！', `${h.name} 收到亡灵计时炸弹。`);
    }
    const p = planFrom(s, s.boss.phase2 ? VD.attacks2 : VD.attacks1, s.boss.attackBonus);
    return p;
  },
  actionPhaseStart(s) {
    if (s.boss.phase2) return;
    if (undead(s, 'tomb')) roundAbility(s, '石坟魔像麻痹你', '每位英雄获得 1 个麻痹标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'paralysis', 1, '石坟魔像')));
    if (undead(s, 'squid')) { banner(s, 'trap', '地狱鱿鱼喷墨', '地狱鱿鱼遮盖魔王的攻击值。'); s.planned.forEach((a) => (a.hidden = true)); }
    if (undead(s, 'rot')) roundAbility(s, '迷失腐臭黏液中', '每位英雄将其牌库顶 1 张牌放在失物堆中。', () => s.heroes.forEach((h) => loseCards(s, h, 1, '腐臭黏液')));
    const m = undead(s, 'mummy');
    if (m?.slot === 'magic') roundAbility(s, '口水怪木乃伊放毒', '每位英雄获得 1 个中毒标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '木乃伊')));
    if (m?.slot === 'ranged') roundAbility(s, '食人妖木乃伊诅咒', '每位英雄必须抽取 1 张诅咒牌并立即结算。', () => s.heroes.forEach((h) => curseHero(s, h, 1, '木乃伊', true)));
    if (m?.slot === 'melee') { banner(s, 'round', '食人妖木乃伊激励魔王', '魔王在此轮的攻击会增强。'); s.planned.forEach((a) => (a.value += 2)); }
  },
  routeDamage(s, _h, type, kind) {
    if (!s.boss.phase2) {
      const p = s.boss.parts.find((x) => x.alive && x.slot === type);
      if (p) return { part: p };
    }
    const k = `typeHits_${type}`;
    s.boss.counters[k] = (s.boss.counters[k] ?? 0) + 1;
    if (!s.boss.phase2 && s.boss.counters[k] > VD.boringAt) return { blocked: `太闷蛋了！巫毒天后让${TN[type]}攻击在本轮余下时间失效。` };
    s.boss.counters.lastType = TYPES.indexOf(type);
    void kind;
    return {};
  },
  onCardResolved(s, h, info) {
    if (!s.boss.phase2) {
      if (undead(s, 'frog') && (info.attack || info.support) && info.maxValue >= 4 && trapHits(s, h, '青蛙僵尸吐毒口水')) {
        banner(s, 'trap', '青蛙僵尸吐毒口水', `${h.name}，拿取 1 个中毒标记。`);
        addStatus(s, h, 'poison', 1, '青蛙僵尸');
      }
      if (undead(s, 'tomb') && info.lightning && trapHits(s, h, '石坟魔像攻击')) damageHero(s, h, 2, '石坟魔像攻击');
      if (undead(s, 'ash') && (info.attack || info.support)) {
        const k = `ash_${h.seat}_${s.round}`;
        s.boss.counters[k] = (s.boss.counters[k] ?? 0) + 1;
        if (s.boss.counters[k] >= 4 && trapHits(s, h, '太热！')) addStatus(s, h, 'fire', 1, '太热！');
      }
    }
    // [trap] 不和谐衰变：每轮第一张直接伤到她的牌，结算后移出场外
    if (info.damagedBoss && !s.boss.flags.decayed) {
      s.boss.flags.decayed = true;
      const i = h.play.lastIndexOf(info.card.id);
      if (i >= 0) {
        h.play.splice(i, 1);
        h.exiled.push(info.card.id);
        banner(s, 'trap', '不和谐衰变', `${h.name}，在今场讨伐战的余下时间，移除【${info.card.name}】到场外！`);
      }
    }
  },
  onPartHit(s, h, p) {
    if (p.id === 'soul' && trapHits(s, h, '骇人灵魂诅咒嘶叫')) { banner(s, 'shield', '骇人灵魂诅咒嘶叫', `${h.name}，抽取 1 张诅咒牌。`); curseHero(s, h, 1, '骇人灵魂'); }
    if (p.id === 'dragon' && trapHits(s, h, '龙骷髅反击')) { banner(s, 'shield', '龙骷髅反击', `${h.name}，拿取 1 个惊恐标记。`); addStatus(s, h, 'panic', 1, '龙骷髅'); }
    if (p.id === 'rot' && trapHits(s, h, '腐烂黏液精反击')) { banner(s, 'shield', '腐烂黏液精反击', `${h.name}，拿取 1 张黏液牌到你的手牌。`); giveSlime(s, h, 1); }
  },
  onPartDefeated(s, h, p) {
    if (p.id === 'soul' && !s.boss.flags.soulRevived) {
      s.boss.flags.soulRevived = true;
      p.alive = true;
      p.hp = p.maxHp;
      banner(s, 'trap', '骇人灵魂回魂', '骇人灵魂首次被打败时，满血回归。');
    }
    if (p.id === 'tomb') { banner(s, 'shield', '石坟魔像破碎', `${h.name}，你失去 3 点生命值。`); damageHero(s, h, 3, '石坟魔像破碎'); }
    if (p.id === 'squid') { s.planned.forEach((a) => (a.hidden = false)); log(s, '地狱鱿鱼被打败，你又能看清魔王的攻击值了。', 'hero'); }
  },
  onShieldHit(s, h, type) {
    if (!s.boss.phase2) return;
    if (TYPES.indexOf(type) === s.boss.counters.boneShield) { banner(s, 'shield', '骸骨护盾', '巫毒天后治疗自己。'); healBoss(s, 2, '骸骨护盾'); }
    if (TYPES.indexOf(type) === s.boss.counters.voodooShield) {
      const d = s.heroes.find((x) => x.carriesDoll) ?? h;
      banner(s, 'shield', '巫毒护盾', `持有巫毒人偶的 ${d.name} 失去 2 点生命值。`);
      damageHero(s, d, 2, '巫毒护盾');
    }
  },
  onHeroHit(s, _h, dmg, a) {
    if (a.extra.drain || s.boss.flags.soulDrainRound) healBoss(s, dmg, '吸取生命');
  },
  actionPhaseEnd(s) {
    s.boss.flags.soulDrainRound = false;
    if (s.boss.phase2) return;
    for (const p of alive(s)) {
      switch (p.id) {
        case 'frog': roundAbility(s, '青蛙僵尸蹂躏你', '每位英雄失去 2 点生命值以及获得 2 个中毒标记。', () => s.heroes.forEach((h) => { damageHero(s, h, 2, '青蛙僵尸'); addStatus(s, h, 'poison', 2, '青蛙僵尸'); })); break;
        case 'soul': banner(s, 'trap', '骇人灵魂吸取你的生命', '本轮魔王攻击会吸取你的生命值来治疗魔王。'); s.boss.flags.soulDrainRound = true; break;
        case 'dragon': roundAbility(s, '龙骷髅拍翼攻击', '每位英雄每有 1 张手牌，便失去 1 点生命值。', () => s.heroes.forEach((h) => damageHero(s, h, h.hand.length, '龙骷髅'))); break;
        case 'mummy':
          if (p.slot === 'magic') roundAbility(s, '食人妖木乃伊强化剧毒喷发', '每位英雄获得中毒标记，而且中毒标记在余下的战斗中会造成更大伤害。', () => { s.heroes.forEach((h) => addStatus(s, h, 'poison', 1, '木乃伊')); s.boss.counters.poisonPlus = 1; });
          if (p.slot === 'ranged') roundAbility(s, '食人妖木乃伊强化咒骂', '每位英雄必须抽取诅咒牌。', () => s.heroes.forEach((h) => curseHero(s, h, 1, '木乃伊')));
          if (p.slot === 'melee') roundAbility(s, '食人妖木乃伊激情演讲', '魔王在余下战斗中的攻击增强。', () => (s.boss.attackBonus += 1));
          break;
        case 'squid': roundAbility(s, '地狱鱿鱼的黑暗时间', '每位英雄获得 1 个惊恐标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'panic', 1, '地狱鱿鱼'))); break;
        case 'ash': roundAbility(s, '灰烬霸主陷你于火海', '每位英雄获得 1 个着火标记。', () => s.heroes.forEach((h) => addStatus(s, h, 'fire', 1, '灰烬霸主'))); break;
      }
    }
    s.planned.forEach((a) => (a.hidden = false));
  },
  afterAttack(s) {
    if (s.boss.counters.bombIn > 0) {
      s.boss.counters.bombIn -= 1;
      if (s.boss.counters.bombIn === 0) {
        const h = s.heroes.find((x) => x.carriesBomb);
        if (h) {
          const n = Math.min(VD.bombDiscard, h.hand.length);
          roundAbility(s, '亡灵计时炸弹爆炸', `${h.name} 必须弃置 ${n} 张手牌，以及每弃置 1 张手牌便失去 1 点生命值。`, () => {
            h.discard.push(...h.hand.splice(0, n));
            damageHero(s, h, n, '亡灵计时炸弹');
          });
          h.carriesBomb = false;
        }
      }
    }
  },
  onBossDamaged(s) {
    if (s.boss.phase2 && s.boss.counters.lastType !== undefined && s.boss.counters.lastType >= 0) {
      // 天下无敌：受到某属性伤害后对该属性免疫，直到受到另一属性伤害
      const t = TYPES[s.boss.counters.lastType];
      if (s.boss.immune[0] !== t) {
        s.boss.immune = [t];
        banner(s, 'trap', '天下无敌！', `巫毒天后让${TN[t]}攻击失效，直到你令她承受另一个属性的伤害。`);
      }
      s.boss.counters.lastType = -1;
    }
    if (s.boss.phase2 && !s.boss.flags.deathSong && s.boss.hp > 0 && s.boss.hp <= s.boss.maxHp * VD.deathSongAt) {
      s.boss.flags.deathSong = true;
      banner(s, 'healthloss', '死亡之歌', '每位英雄立刻失去一半生命值。');
      s.heroes.forEach((h) => damageHero(s, h, Math.floor(h.health / 2), '死亡之歌'));
    }
  },
  onDefeated(s) {
    if (s.boss.phase2) return false;
    s.boss.phase2 = true;
    s.boss.parts = [];
    s.boss.maxHp = s.boss.hp = scaleHp(s, VD.phase2HpPerHero * N(s));
    s.heroes.forEach((h) => (h.carriesDoll = false));
    pick(s, s.heroes).carriesDoll = true;
    banner(s, 'healthloss', '复生', '巫毒天后复生了，并且受骸骨与巫毒护盾保护。一位英雄必须将巫毒人偶放在自己面前。');
    return true;
  },
  poisonMult: (s) => (undead(s, 'rot') ? 0 : 1),
  hint(s) {
    if (s.boss.phase2) return { avoid: s.boss.immune };
    // 优先打最危险的手下（设计者 Sebastian Hein 的 BGG 建议：按威胁挑，不必全杀）
    const order = ['frog', 'soul', 'mummy', 'ash', 'dragon', 'squid', 'tomb', 'rot'];
    const live = alive(s).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const dead = TYPES.filter((t) => !s.boss.parts.some((p) => p.alive && p.slot === t));
    return { prefer: [...live.slice(0, 1).map((p) => p.slot!), ...dead] };
  },
};

export type { BossPart, Hero };
void removeStatuses;
