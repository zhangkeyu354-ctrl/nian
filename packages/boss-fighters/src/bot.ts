// 机器人：用于平衡模拟和以后的掉线托管（05 B1）
import { CARDS } from './data/cards.ts';
import { BOSSES } from './bosses/index.ts';
import { actor, reduce, scoreCard } from './engine/reduce.ts';
import { handLimit } from './engine/core.ts';
import type { Command, DamageType, GameState, Hero } from './types.ts';

export type Strategy = 'random' | 'coop';

const effs = (id: string) => CARDS[id]?.effects ?? [];
const isProt = (id: string) => effs(id).some((e) => e.kind === 'protect');
const atkOf = (id: string) => effs(id).find((e) => e.kind === 'attack') as { type: DamageType; value: unknown } | undefined;

export function botCommand(s: GameState, strategy: Strategy, rand: () => number): Command | null {
  if (s.pick) return botPick(s);
  if (s.phase === 'chooseStarter') return { type: 'CHOOSE_STARTER', seat: s.heroes[0].seat, by: 0 };
  if (s.phase === 'decision') {
    const d = s.decisions[0];
    const h = s.heroes.find((x) => x.seat === d.seat)!;
    return { type: 'DECIDE', seat: d.seat, choice: h.health > 10 && scoreCard(d.card!) >= 4 ? 'burn' : 'exile' };
  }
  if (s.phase === 'discard') {
    const h = s.heroes.find((x) => !x.discardDone)!;
    const nonSlime = h.hand.filter((c) => c !== 'slime');
    const over = Math.min(nonSlime.length, Math.max(0, h.hand.length - handLimit(h)));
    const sorted = nonSlime.slice().sort((a, b) => scoreCard(a) - scoreCard(b));
    return { type: 'DISCARD', seat: h.seat, cards: sorted.slice(0, over) };
  }
  if (s.phase !== 'action') return null;
  const seat = actor(s)!;
  const h = s.heroes.find((x) => x.seat === seat)!;
  if (strategy === 'random') {
    if (h.hand.length === 0 || rand() < 0.05) return { type: 'END_ACTIONS', seat };
    const card = h.hand[Math.floor(rand() * h.hand.length)];
    const t = s.heroes[Math.floor(rand() * s.heroes.length)].seat;
    return { type: 'PLAY_CARD', seat, card, target: t };
  }
  return coop(s, h);
}

function coop(s: GameState, h: Hero): Command {
  const seat = h.seat;
  const incoming = (x: Hero) => s.planned.filter((a) => a.target === x.seat).reduce((t, a) => t + Math.max(0, a.value - a.reducedBy), 0);
  const danger = (x: Hero) => x.health - incoming(x) - x.status.poison;
  const lowest = s.heroes.reduce((a, b) => (danger(b) < danger(a) ? b : a));
  if ((h.items.potion ?? 0) > 0 && danger(lowest) <= 2) return { type: 'USE_ITEM', seat, item: 'potion', target: lowest.seat };
  if (h.items.medkit && h.status.poison + h.status.panic + h.status.fire >= 2) return { type: 'USE_ITEM', seat, item: 'medkit' };
  const slime = h.hand.includes('slime') && h.lost.length > 0;
  if (slime) return { type: 'PLAY_CARD', seat, card: 'slime' };
  const threatened = s.heroes.filter((x) => incoming(x) > 0).sort((a, b) => danger(a) - danger(b))[0];
  const prot = h.hand.filter(isProt).sort((a, b) => scoreCard(b) - scoreCard(a))[0];
  if (prot && threatened && (danger(threatened) <= 6 || incoming(threatened) >= 5)) {
    return { type: 'PLAY_CARD', seat, card: prot, target: threatened.seat };
  }
  // 已激活的助攻
  const sup = h.hand.find((c) => effs(c).some((e) => e.kind === 'support' && (s.attackedTypes[e.type] || (h.cls === 'rogue' && h.clsLevel >= 2))));
  if (sup) return { type: 'PLAY_CARD', seat, card: sup, target: lowest.seat };
  // 攻击：按魔王提示（避开危险护盾/优先打主导的头），再优先打护盾最薄、魔王不免疫的属性
  const hint = BOSSES[s.bossId].hint?.(s) ?? {};
  const rank = (t: DamageType) => (hint.prefer?.includes(t) ? -100 : 0) + (hint.avoid?.includes(t) ? 100 : 0) + s.boss.shields[t];
  const atks = h.hand
    .map((c) => ({ c, e: atkOf(c) }))
    .filter((o) => o.e && !s.boss.immune.includes(o.e.type) && !(hint.avoid?.includes(o.e.type) && rank(o.e.type) >= 100 && h.hand.length > 1 && false))
    .sort((a, b) => rank(a.e!.type) - rank(b.e!.type) || scoreCard(b.c) - scoreCard(a.c));
  if (atks.length && hint.avoid?.includes(atks[0].e!.type)) {
    // 手里只剩会碰到危险护盾的攻击：先打别的（保护/治疗/背包），实在没有再打
    const safe = h.hand.find((c) => c !== 'slime' && !atkOf(c) && !effs(c).some((e) => e.kind === 'support'));
    if (safe) return { type: 'PLAY_CARD', seat, card: safe, target: isProt(safe) && threatened ? threatened.seat : lowest.seat };
    return { type: 'END_ACTIONS', seat };
  }
  if (atks.length) return { type: 'PLAY_CARD', seat, card: atks[0].c, target: lowest.seat };
  const other = h.hand.find((c) => c !== 'slime' && !effs(c).some((e) => e.kind === 'support'));
  if (other) return { type: 'PLAY_CARD', seat, card: other, target: isProt(other) && threatened ? threatened.seat : lowest.seat };
  if (h.hand.length === 0 || h.hand.every((c) => c === 'slime')) return { type: 'USE_ITEM', seat, item: 'backpack' };
  return { type: 'END_ACTIONS', seat };
}

export function runBotGame(s0: GameState, strategy: Strategy, seed = 1, maxSteps = 8000) {
  let s = s0;
  let r = seed;
  const rand = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < maxSteps && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    const cmd = botCommand(s, strategy, rand);
    if (!cmd) break;
    try {
      s = reduce(s, cmd);
    } catch {
      const seat = actor(s);
      if (seat === null) break;
      s = reduce(s, { type: 'END_ACTIONS', seat });
    }
  }
  return s;
}

/** 联机托管：只替某个座位出手（机器人队友 / 掉线托管）。轮不到这个座位时返回 null。 */
export function botFor(s: GameState, seat: number): Command | null {
  if (s.pick) return s.pick.seat === seat ? botPick(s) : null;
  if (s.phase === 'discard') {
    const h = s.heroes.find((x) => x.seat === seat);
    if (!h || h.discardDone) return null;
    const nonSlime = h.hand.filter((c) => c !== 'slime');
    const over = Math.min(nonSlime.length, Math.max(0, h.hand.length - handLimit(h)));
    const sorted = nonSlime.slice().sort((a, b) => scoreCard(a) - scoreCard(b));
    return { type: 'DISCARD', seat, cards: sorted.slice(0, over) };
  }
  if (s.phase === 'decision') {
    if (s.decisions[0]?.seat !== seat) return null;
    return botCommand(s, 'coop', Math.random);
  }
  if (s.phase === 'action' && actor(s) === seat) return botCommand(s, 'coop', Math.random);
  return null;
}

/** 挑牌：选分数最高、还没挑过的牌 */
function botPick(s: GameState): Command {
  const p = s.pick!;
  const left = p.options.filter((c, i) => p.options.indexOf(c) === i && !p.picked.includes(c));
  const best = left.slice().sort((a, b) => scoreCard(b) - scoreCard(a))[0] ?? p.options[0];
  return { type: 'PICK', seat: p.seat, card: best };
}
