import { describe,expect,it } from 'vitest';
import { createDeck } from '../src/rules.js';
import { createExchangePlan, startExchange, prepareFaceDownPool, drawByIndices, drawForTransaction, returnCards } from '../src/exchange.js';

const hands=()=>{const d=createDeck().map(c=>c.id);return [d.slice(0,13),d.slice(13,26),d.slice(26,39),d.slice(39,52)];};
describe('next-round exchange transactions',()=>{
  it('pairs 2v2 winners and losers by seat order',()=>{
    const plan=createExchangePlan([0,2],[1,3],false);
    expect(plan).toEqual([{winner:0,loser:1,count:2},{winner:2,loser:3,count:2}]);
    expect(createExchangePlan([0,2],[1,3],true).every(x=>x.count===4)).toBe(true);
  });
  it('serializes solo win and loss against all three seats',()=>{
    expect(createExchangePlan([2],[0,1,3],false).map(x=>[x.winner,x.loser])).toEqual([[2,0],[2,1],[2,3]]);
    expect(createExchangePlan([0,1,3],[2],false).map(x=>[x.winner,x.loser])).toEqual([[0,2],[1,2],[3,2]]);
  });
  it('draws without replacement then permits returning the same cards',()=>{
    let s=startExchange(hands(),[{winner:0,loser:1,count:2}]);
    const drawn=s.hands[1].slice(0,2);
    s=drawForTransaction(s,drawn);
    expect(s.hands[0]).toHaveLength(15);
    expect(s.hands[1]).toHaveLength(11);
    s=returnCards(s,drawn);
    expect(s.hands.every(h=>h.length===13)).toBe(true);
    expect(s.phase).toBe('COMPLETE');
    expect(()=>returnCards(s,drawn)).toThrow();
  });
  it('holds 17 and 9 cards only during a shaved four-card transaction',()=>{
    let state=startExchange(hands(),[{winner:0,loser:1,count:4}]);
    const drawn=state.hands[1].slice(0,4);
    state=drawForTransaction(state,drawn);
    expect(state.hands.map(hand=>hand.length)).toEqual([17,9,13,13]);
    expect(()=>returnCards(state,drawn.slice(0,3))).toThrow();
    state=returnCards(state,drawn);
    expect(state.hands.map(hand=>hand.length)).toEqual([13,13,13,13]);
  });
  it('supports manual face-down draw by shuffled indices and records logs',()=>{
    const h=hands();
    const shuffled=[...h[1]].reverse();
    let s=prepareFaceDownPool(startExchange(h,[{winner:0,loser:1,count:2}]),shuffled);
    expect(()=>drawByIndices(s,[0,0])).toThrow(/invalid draw indices/);
    expect(()=>drawByIndices(s,[0,13])).toThrow(/invalid draw indices/);
    s=drawByIndices(s,[0,2]);
    expect(s.phase).toBe('RETURN_PENDING');
    expect(s.drawnIds).toEqual([shuffled[0],shuffled[2]]);
    expect(s.faceDownPool).toBeUndefined();
    const ret=s.hands[0].slice(0,2);
    s=returnCards(s,ret);
    expect(s.phase).toBe('COMPLETE');
    expect(s.logs).toEqual([{winner:0,loser:1,count:2,drawn:[shuffled[0],shuffled[2]],returned:ret}]);
  });
});
