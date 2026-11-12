// 引擎内部共用结算函数。所有魔王插件都通过这些函数改血量/状态，不直接改字段。
import { DIFFICULTY } from '../data/balance.ts';
import { CURSE_BY_ID } from '../data/curses.ts';
import type { BossPart, DamageType, GameState, Hero, StatusKind } from '../types.ts';
import { int, shuffle } from './rng.ts';

export const TYPE_NAME: Record<DamageType, string> = { melee: '近战', ranged: '远程', magic: '魔法' };
export const STATUS_NAME: Record<StatusKind, string> = { poison: '中毒', panic: '惊恐', paralysis: '麻痹', fire: '着火' };

export function log(s: GameState, text: string, kind: GameState['log'][number]['kind'] = 'system') {
  s.log.push({ round: s.round, text, kind });
}

/** 视觉事件（只给界面播特效用），保留最近 30 条 */
export function fx(s: GameState, e: Omit<GameState['fx'][number], 'n'>) {
  s.fxSeq = (s.fxSeq ?? 0) + 1;
  (s.fx ??= []).push({ n: s.fxSeq, ...e });
  if (s.fx.length > 30) s.fx.splice(0, s.fx.length - 30);
}

export function banner(s: GameState, kind: string, title: string, text: string) {
  s.events.push({ round: s.round, kind, title, text });
  log(s, `【${title}】${text}`, 'ability');
}

export function hero(s: GameState, seat: number): Hero {
  const h = s.heroes.find((x) => x.seat === seat);
  if (!h) throw new Error(`没有座位 ${seat}`);
  return h;
}

export const isOver = (s: GameState) => s.phase === 'won' || s.phase === 'lost';
/** 魔王攻击：难度倍率 × 人数修正（人多时每多 1 人 +10%，平衡模拟得出；血量按实测不动） */
export const scaleAttack = (s: GameState, v: number) =>
  Math.max(1, Math.round(v * DIFFICULTY[s.difficulty].attack * (1 + 0.1 * Math.max(0, s.heroes.length - 2))));
export const scaleShield = (s: GameState, v: number) => Math.max(0, Math.round(v * DIFFICULTY[s.difficulty].shield));
export const scaleHp = (s: GameState, v: number) => Math.max(1, Math.round(v * DIFFICULTY[s.difficulty].hp));
export const atLeast = (s: GameState, d: 'advanced' | 'pro' | 'insane') =>
  ['beginner', 'advanced', 'pro', 'insane'].indexOf(s.difficulty) >= ['beginner', 'advanced', 'pro', 'insane'].indexOf(d);

/** 抽牌：牌库不够时先抽完，再洗弃牌堆，再抽差额（官方）。出牌区的牌不洗入。 */
export function drawOne(s: GameState, h: Hero): string | null {
  if (h.deck.length === 0) {
    if (h.discard.length === 0) return null;
    h.deck = shuffle(s, h.discard);
    h.discard = [];
  }
  return h.deck.pop()!;
}

export function drawCards(s: GameState, h: Hero, n: number) {
  for (let i = 0; i < n; i++) {
    const c = drawOne(s, h);
    if (!c) return;
    h.hand.push(c);
  }
}

export function handLimit(h: Hero) {
  let minus = h.status.paralysis;
  for (const c of h.curses) if (c.state === 'active') minus += CURSE_BY_ID[c.id]?.handMinus ?? 0;
  return Math.max(0, h.handLimit - minus);
}

/** 英雄失去生命。怜悯之泪可抵消一次；生命归零立即判负（官方）。法师 2 级：失去生命可抽 1。 */
export function damageHero(s: GameState, h: Hero, n: number, why: string) {
  if (n <= 0 || isOver(s)) return 0;
  const w = h.wards.findIndex((x) => x.against === 'hpLoss');
  if (w >= 0) {
    const [ward] = h.wards.splice(w, 1);
    h.discard.push(ward.card);
    log(s, `${h.name} 弃掉怜悯之泪，抵消了 ${n} 点生命损失（${why}）`, 'hero');
    return 0;
  }
  h.health = Math.max(0, h.health - n);
  log(s, `${h.name} 失去 ${n} 点生命（${why}），剩余 ${h.health}`, 'boss');
  if (h.health <= 0) {
    s.phase = 'lost';
    s.current = null;
    s.decisions = [];
    log(s, `${h.name} 倒下了，讨伐失败。`, 'system');
    return n;
  }
  if (h.cls === 'mage' && h.clsLevel >= 2) {
    drawCards(s, h, 1);
    log(s, `${h.name}（法师能力）失去生命后抽 1 张`, 'hero');
  }
  return n;
}

export function healHero(s: GameState, h: Hero, n: number) {
  const before = h.health;
  h.health = Math.min(h.maxHealth, h.health + n);
  if (h.health > before) {
    log(s, `${h.name} 回复 ${h.health - before} 点生命，现为 ${h.health}`, 'hero');
    fx(s, { kind: 'heal', seat: h.seat, value: h.health - before });
  }
}

export function addStatus(s: GameState, h: Hero, kind: StatusKind, n: number, why: string) {
  if (n <= 0 || isOver(s)) return;
  h.status[kind] = Math.min(10, h.status[kind] + n);
  fx(s, { kind: 'status', seat: h.seat });
  log(s, `${h.name} 获得 ${n} 个${STATUS_NAME[kind]}标记（${why}）`, 'boss');
}

export function removeStatuses(h: Hero, n: number) {
  for (const k of ['poison', 'fire', 'panic', 'paralysis'] as const) {
    const r = Math.min(n, h.status[k]);
    h.status[k] -= r;
    n -= r;
  }
}

/** 抽诅咒：背面朝上放在英雄旁，下个行动阶段开始翻开（官方，勘误为 Phase 3） */
export function curseHero(s: GameState, h: Hero, n: number, why: string, immediate = false) {
  for (let i = 0; i < n; i++) {
    if (s.curseDeck.length === 0) {
      if (s.curseDiscard.length === 0) return;
      s.curseDeck = shuffle(s, s.curseDiscard);
      s.curseDiscard = [];
    }
    // immediate：魔王能力写明"立即执行"的官方例外（三头食人妖·咒骂等）——直接翻开
    h.curses.push({ id: s.curseDeck.pop()!, state: immediate ? 'active' : 'down' });
    fx(s, { kind: 'curse', seat: h.seat });
    log(s, `${h.name} 抽到 1 张诅咒（${why}）${immediate ? '，立即生效' : '，背面朝上放在英雄旁'}`, 'boss');
  }
}

/** 黏液牌：从黏液牌堆抽到手里（官方） */
export function giveSlime(s: GameState, h: Hero, n: number) {
  for (let i = 0; i < n && s.slimePile > 0; i++) {
    s.slimePile -= 1;
    h.hand.push('slime');
  }
  log(s, `${h.name} 抽到 ${n} 张黏液牌`, 'boss');
}

/** 把牌库顶的牌放进失物堆 */
export function loseCards(s: GameState, h: Hero, n: number, why: string) {
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const c = drawOne(s, h);
    if (!c) break;
    h.lost.push(c);
    moved++;
  }
  if (moved) log(s, `${h.name} 的 ${moved} 张牌进入失物堆（${why}）`, 'boss');
}

/** 魔王 [trap] 能力作用到某英雄前调用：黑鸦诅咒可抵消一次（官方） */
export function trapHits(s: GameState, h: Hero, title: string): boolean {
  const w = h.wards.findIndex((x) => x.against === 'trap');
  if (w >= 0) {
    const [ward] = h.wards.splice(w, 1);
    h.discard.push(ward.card);
    log(s, `${h.name} 弃掉黑鸦诅咒，挡下了【${title}】`, 'hero');
    return false;
  }
  return true;
}

/** [round] 周期能力：要你命3000 可阻止下一个（官方） */
export function roundAbility(s: GameState, title: string, text: string, fn: () => void) {
  if (s.preventNextRound) {
    s.preventNextRound = false;
    banner(s, 'round', `${title}（被阻止）`, '要你命3000 阻止了这个能力。');
    return;
  }
  banner(s, 'round', title, text);
  fn();
}

/** 无视护盾直接扣魔王生命 */
export function loseBossHp(s: GameState, n: number, why: string) {
  if (n <= 0 || isOver(s)) return;
  s.boss.hp = Math.max(0, s.boss.hp - n);
  log(s, `魔王失去 ${n} 点生命（${why}），剩余 ${s.boss.hp}`, 'hero');
}

export function healBoss(s: GameState, n: number, why: string) {
  if (n <= 0 || isOver(s)) return;
  const before = s.boss.hp;
  s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + n);
  if (s.boss.hp > before) log(s, `魔王回复 ${s.boss.hp - before} 点生命（${why}），现为 ${s.boss.hp}`, 'boss');
}

export function damagePart(s: GameState, p: BossPart, n: number, by: string): number {
  if (!p.alive || n <= 0) return 0;
  const dealt = Math.min(p.hp, n); // 打败手下时溢出伤害消失（官方·熔岩王/果冻怪/巫毒）
  p.hp -= dealt;
  log(s, `${by} 对【${p.name}】造成 ${dealt} 点伤害，剩余 ${p.hp}`, 'hero');
  if (p.hp <= 0) {
    p.alive = false;
    log(s, `【${p.name}】被打败了`, 'hero');
  }
  return dealt;
}

/** 保底 + 逐点随机分配护盾（05 B4） */
export function distributeShields(s: GameState, total: number, min = 1, types: DamageType[] = ['melee', 'ranged', 'magic']) {
  const sh = { melee: 0, ranged: 0, magic: 0 };
  let left = total;
  for (const k of types) {
    const m = Math.min(min, left);
    sh[k] += m;
    left -= m;
  }
  while (left > 0) {
    sh[types[int(s, types.length)]] += 1;
    left--;
  }
  return sh;
}

/** 目标"生命最高/最低"并列时官方由玩家自选；第一阶段按座位顺序取第一位 */
export function highestHealth(s: GameState): Hero {
  return noteTie(s, s.heroes.reduce((a, b) => (b.health > a.health ? b : a)));
}
export function lowestHealth(s: GameState): Hero {
  return noteTie(s, s.heroes.reduce((a, b) => (b.health < a.health ? b : a)));
}
/** 记下并列：计划阶段结束后，指向这名英雄的攻击可由玩家改给并列的其他人（官方） */
function noteTie(s: GameState, h: Hero): Hero {
  const seats = s.heroes.filter((x) => x.health === h.health).map((x) => x.seat);
  if (seats.length > 1 && s.ties) s.ties.push({ seats, chosen: h.seat });
  return h;
}
