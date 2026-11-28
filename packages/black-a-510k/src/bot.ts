import { classify, createDeck, enumerateLegalPlays, RANKS, type Rules, DEFAULT_RULES } from './rules.js';
import type { RoundState } from './round.js';

const deck = new Map(createDeck().map(c => [c.id as string, c]));
const rank = (id: string) => RANKS.indexOf(deck.get(id)!.rank);
const points = (ids: readonly string[]) => ids.reduce((s, id) => s + (deck.get(id)?.points ?? 0), 0);
const SPECIAL = new Set(['BLACK_A', 'MIXED_510K', 'PURE_510K', 'BOMB']);

/** Lowest-rank card that is not a point card (5/10/K) when possible — used when a human's turn times out on a lead. */
export function timeoutLeadCard(hand: readonly string[], mustContainD3: boolean): string {
  if (mustContainD3) return '3D';
  const sorted = [...hand].sort((a, b) => rank(a) - rank(b));
  return sorted.find(id => !points([id]) && classify([id])?.type === 'SINGLE') ?? sorted[0];
}

/**
 * Simple bot (2026-11-28): keeps black A / 510K / bombs for when they matter, plays its weakest
 * cards first, and does not give away point cards on a lead. It only uses public table information.
 */
export function chooseBotAction(s: RoundState, actor: number, rules: Rules = DEFAULT_RULES): string[] | null {
  const hand = s.hands[actor];
  const mustContainD3 = s.firstLeadPending && s.options.firstLead === 'CONTAINS_D3';
  const choices = enumerateLegalPlays(hand, s.lastPlay?.cards ?? null, { mustContainD3 }, rules);
  if (!choices.length) return null;
  const scored = choices.map(cards => {
    const p = classify(cards, rules)!;
    return { cards, tier: p.tier, key: p.compareKey, special: SPECIAL.has(p.type), core: p.coreRank, pts: points(cards), len: cards.length, finishes: cards.length === hand.length };
  });
  const finishing = scored.find(c => c.finishes);
  if (finishing) return finishing.cards;
  const normal = scored.filter(c => !c.special);
  if (!s.lastPlay) {
    // Lead: lowest core rank, prefer shedding more cards, avoid leading point cards.
    const pool = normal.length ? normal : scored;
    pool.sort((a, b) => a.core - b.core || (a.pts > 0 ? 1 : 0) - (b.pts > 0 ? 1 : 0) || b.len - a.len);
    return pool[0].cards;
  }
  // Follow: cheapest normal play that beats; specials only when it is worth it.
  normal.sort((a, b) => a.core - b.core || a.pts - b.pts);
  const cheap = normal.find(c => c.core < RANKS.indexOf('A') || points(s.tableCards) >= 10);
  if (cheap) return cheap.cards;
  const threat = s.hands[s.lastPlay.actor].length <= 4;
  const worth = points(s.tableCards) + points(s.lastPlay.cards) >= 15;
  if (threat || worth || hand.length <= 4) {
    const specials = scored.filter(c => c.special).sort((a, b) => a.tier - b.tier || a.key[0] - b.key[0] || a.key[1] - b.key[1]);
    const all = [...normal, ...specials];
    return all[0]?.cards ?? null;
  }
  return null;
}
