import { describe, expect, it } from 'vitest';
import { beats, classify, createDeck, DEFAULT_RULES, enumerateLegalPlays } from '../src/rules.js';

const c = (rank: string, suit: string) => `${rank}${suit}`;
const r = DEFAULT_RULES;

describe('V1.1 frozen card rules', () => {
  it('creates exactly 52 unique cards and 100 points', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(x => x.id)).size).toBe(52);
    expect(deck.reduce((n, x) => n + x.points, 0)).toBe(100);
    expect(deck.filter(x => x.id === '3D' || x.id === 'AS' || x.id === 'AC')).toHaveLength(3);
  });

  it('recognizes exact special groups without swallowing ordinary combinations', () => {
    expect(classify([c('A','S')], r)?.type).toBe('BLACK_A');
    expect(classify([c('A','S'),c('A','C')], r)?.type).toBe('DOUBLE_BLACK_A');
    expect(classify([c('A','S'),c('A','H')], r)?.type).toBe('PAIR');
    expect(classify([c('A','S'),c('A','H'),c('A','C'),c('A','D')], r)?.type).toBe('BOMB');
    expect(classify(['10S','JS','QS','KS','AS'], r)?.type).toBe('STRAIGHT');
    expect(classify(['5D','10H','KS'], r)?.type).toBe('MIXED_510K');
    expect(classify(['5S','10S','KS'], r)?.type).toBe('PURE_510K');
  });

  it('enforces sequences, attachments and tier order', () => {
    expect(classify(['4D','5C','6H','7S','8D'], r)?.type).toBe('STRAIGHT');
    expect(classify(['AD','2C','3H','4S','5D'], r)).toBeNull();
    expect(classify(['4D','4C','5D','5C','6D','6C'], r)?.type).toBe('PAIR_RUN');
    expect(classify(['7D','7C','7H'], r)).toBeNull();
    expect(classify(['7D','7C','7H','9D'], r)?.type).toBe('TRIPLE_SINGLE');
    expect(beats(['AC'], ['2S'], r)).toBe(true);
    expect(beats(['AS','AC'], ['2D','2C','2H','2S'], r)).toBe(true);
    expect(beats(['2D','2C','2H','2S'], ['AS','AC'], r)).toBe(false);
  });

  it('enumerates legal combinations and handles first lead constraint', () => {
    const hand = ['3D','4D','5D','6D','7D','AS'];
    const all = enumerateLegalPlays(hand, null, { mustContainD3: true }, r);
    expect(all.every(play => play.includes('3D'))).toBe(true);
    expect(all.some(play => play.length === 1 && play[0] === '3D')).toBe(true);
    expect(enumerateLegalPlays(hand, ['2S'], {}, r)).toEqual([['AS']]);
  });
  it('rejects broken runs, wraps and unsupported combinations',()=>{
    for(const ids of [
      ['AD','2C','3H','4S','5D'],['JD','QC','KH','AS','2D'],
      ['4D','4C','5D','5C'],['JD','JC','QD','QC','KD','2C'],
      ['7D','7C','7H'],['8D','8C','8H','8S','4D'],
      ['4D','4C','5D','5C','7D','7C'],['4D','4C','4H','5D','6C','7H','8S'],
    ])expect(classify(ids,r),ids.join(' ')).toBeNull();
    expect(classify(['8D','8C','8H','8S','4D','4C'],r)?.type).toBe('FOUR_TWO');
    expect(classify(['8D','8C','8H','8S','4D','JC'],r)?.type).toBe('FOUR_TWO');
  });
  it('uses core suits and ignores attachment suits',()=>{
    expect(beats(['4D','5D','6D','7D','8S'],['4C','5C','6C','7C','8H'],r)).toBe(true);
    expect(beats(['7D','7C','7S','9D'],['7D','7C','7H','2S'],r)).toBe(true);
    expect(beats(['7D','7C','7H','2S'],['7D','7C','7S','9D'],r)).toBe(false);
    expect(beats(['4D','4C','5D','5C','6D','6S'],['4H','4S','5H','5S','6D','6H'],r)).toBe(true);
  });
  it('honors exact special tier matrix and same-key nonbeating',()=>{
    const chain=[['3D'],['AC'],['5D','10H','KC'],['5H','10H','KH'],['7D','7C','7H','7S'],['AS','AC']];
    for(let i=1;i<chain.length;i++){
      expect(beats(chain[i],chain[i-1],r)).toBe(true);
      expect(beats(chain[i-1],chain[i],r)).toBe(false);
    }
    expect(beats(['5D','10H','KS'],['5C','10D','KS'],r)).toBe(false);
    expect(beats(['5S','10S','KS'],['5H','10H','KH'],r)).toBe(true);
  });
  it('is invariant under input permutation and rejects duplicate IDs',()=>{
    const cards=['5C','10H','KS'];
    expect(classify(cards,r)).toEqual(classify([...cards].reverse(),r));
    expect(classify(['AS','AS'],r)).toBeNull();
    expect(beats(cards,cards,r)).toBe(false);
  });
});
