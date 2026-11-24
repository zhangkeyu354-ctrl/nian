export const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'] as const;
export const SUITS = ['D','C','H','S'] as const;
export type CardId = `${typeof RANKS[number]}${typeof SUITS[number]}`;
export type PlayType = 'SINGLE'|'PAIR'|'STRAIGHT'|'PAIR_RUN'|'TRIPLE_SINGLE'|'TRIPLE_PAIR'|'FOUR_TWO'|'BLACK_A'|'MIXED_510K'|'PURE_510K'|'BOMB'|'DOUBLE_BLACK_A';
export interface Rules { readonly ruleVersion: '1.1'; readonly specialBlackA: 'ALL_NORMAL' }
export const DEFAULT_RULES: Rules = Object.freeze({ ruleVersion: '1.1', specialBlackA: 'ALL_NORMAL' });
export interface Card { id: CardId; rank: typeof RANKS[number]; suit: typeof SUITS[number]; points: number }
export interface Play { type: PlayType; tier: number; count: number; coreRank: number; coreSuit: number; compareKey: readonly [number,number] }
export interface Constraints { mustContainD3?: boolean }

const byId = new Map<CardId, Card>(RANKS.flatMap(rank => SUITS.map(suit => {
  const id = `${rank}${suit}` as CardId;
  return [id, { id, rank, suit, points: rank === '5' ? 5 : rank === '10' || rank === 'K' ? 10 : 0 }] as const;
})));
export function createDeck(): Card[] { return [...byId.values()].map(card => ({...card})); }
const rankIndex = (rank: Card['rank']) => RANKS.indexOf(rank);
const suitIndex = (suit: Card['suit']) => SUITS.indexOf(suit);
const result = (type: PlayType, tier: number, cards: Card[], coreRank: number, coreSuit: number): Play =>
  ({ type, tier, count: cards.length, coreRank, coreSuit, compareKey: [coreRank, coreSuit] });

export function classify(ids: readonly string[], rules: Rules = DEFAULT_RULES): Play | null {
  if (rules.ruleVersion !== '1.1' || rules.specialBlackA !== 'ALL_NORMAL' || !ids.length || ids.length > 13 || new Set(ids).size !== ids.length) return null;
  const cards = ids.map(id => byId.get(id as CardId));
  if (cards.some(card => !card)) return null;
  const cs = cards as Card[];
  const groups = new Map<string, Card[]>();
  for (const card of cs) groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);
  const core = (group: Card[]) => [rankIndex(group[0].rank), Math.max(...group.map(c => suitIndex(c.suit)))] as const;
  const allSameRank = groups.size === 1;
  const blackA = (id: string) => id === 'AS' || id === 'AC';
  if (cs.length === 2 && cs.every(c => blackA(c.id))) return result('DOUBLE_BLACK_A',5,cs,0,0);
  if (cs.length === 4 && allSameRank) { const [rank,suit] = core(cs); return result('BOMB',4,cs,rank,suit); }
  if (cs.length === 3 && ['5','10','K'].every(rank => groups.has(rank))) {
    const pure = new Set(cs.map(c => c.suit)).size === 1;
    return result(pure ? 'PURE_510K' : 'MIXED_510K',pure ? 3 : 2,cs,0,suitIndex(groups.get('K')![0].suit));
  }
  if (cs.length === 1 && blackA(cs[0].id)) return result('BLACK_A',1,cs,rankIndex('A'),suitIndex(cs[0].suit));
  if (cs.length === 1) { const [rank,suit] = core(cs); return result('SINGLE',0,cs,rank,suit); }
  if (cs.length === 2 && allSameRank) { const [rank,suit] = core(cs); return result('PAIR',0,cs,rank,suit); }
  const consecutive = (ranks: number[]) => ranks.every((rank,i) => rank < 12 && (i === 0 || rank === ranks[i-1]+1));
  const sortedRanks = [...groups.keys()].map(rank => rankIndex(rank as Card['rank'])).sort((a,b) => a-b);
  if (cs.length >= 5 && groups.size === cs.length && consecutive(sortedRanks)) {
    const highest = groups.get(RANKS[sortedRanks.at(-1)!])!;
    const [rank,suit] = core(highest); return result('STRAIGHT',0,cs,rank,suit);
  }
  if (cs.length >= 6 && cs.length % 2 === 0 && groups.size === cs.length / 2 && [...groups.values()].every(g => g.length === 2) && consecutive(sortedRanks)) {
    const highest = groups.get(RANKS[sortedRanks.at(-1)!])!;
    const [rank,suit] = core(highest); return result('PAIR_RUN',0,cs,rank,suit);
  }
  if (cs.length === 4 || cs.length === 5) {
    const triple = [...groups.values()].find(g => g.length === 3);
    if (triple && groups.size === 2 && [...groups.values()].some(g => g.length === cs.length-3)) {
      const [rank,suit] = core(triple); return result(cs.length === 4 ? 'TRIPLE_SINGLE' : 'TRIPLE_PAIR',0,cs,rank,suit);
    }
  }
  if (cs.length === 6) {
    const four = [...groups.values()].find(g => g.length === 4);
    if (four && groups.size >= 2 && [...groups.values()].filter(g => g !== four).reduce((n,g) => n+g.length,0) === 2) {
      const [rank,suit] = core(four); return result('FOUR_TWO',0,cs,rank,suit);
    }
  }
  return null;
}

export function beats(candidate: readonly string[], target: readonly string[] | null, rules: Rules = DEFAULT_RULES): boolean {
  const a = classify(candidate,rules); if (!a) return false;
  if (!target?.length) return true;
  const b = classify(target,rules); if (!b) return false;
  if (a.tier !== b.tier) return a.tier > b.tier;
  if (a.tier === 0 && (a.type !== b.type || a.count !== b.count)) return false;
  return a.coreRank > b.coreRank || (a.coreRank === b.coreRank && a.coreSuit > b.coreSuit);
}

export function enumerateLegalPlays(hand: readonly string[], target: readonly string[] | null, constraints: Constraints = {}, rules: Rules = DEFAULT_RULES): string[][] {
  if (hand.length > 13 || new Set(hand).size !== hand.length || hand.some(id => !byId.has(id as CardId))) return [];
  const sorted = [...hand].sort((a,b) => rankIndex(byId.get(a as CardId)!.rank)-rankIndex(byId.get(b as CardId)!.rank) || suitIndex(byId.get(a as CardId)!.suit)-suitIndex(byId.get(b as CardId)!.suit));
  const plays: string[][] = [];
  for (let mask=1; mask < (1 << sorted.length); mask++) {
    const play = sorted.filter((_,i) => mask & (1 << i));
    if (constraints.mustContainD3 && !play.includes('3D')) continue;
    if (beats(play,target,rules)) plays.push(play);
  }
  return plays.sort((a,b) => a.length-b.length || a.join(',').localeCompare(b.join(',')));
}
export function hasBeatingPlay(hand: readonly string[], target: readonly string[] | null, constraints: Constraints = {}, rules: Rules = DEFAULT_RULES): boolean {
  return enumerateLegalPlays(hand,target,constraints,rules).length > 0;
}
