import { describe,expect,it } from 'vitest';
import { createDeck } from '../src/rules.js';
import { createExchangePlan,drawForTransaction,returnCards,startExchange } from '../src/exchange.js';
import { viewExchange } from '../src/privacy.js';
const hands=()=>{const ids=createDeck().map(c=>c.id);return [0,1,2,3].map(i=>ids.slice(i*13,i*13+13))};
describe('独狼先抽完三人再依次归还（用户 2026-11-26 裁定）',()=>{
  it('draws from all three losers, then returns any cards (including ones drawn from someone else)',()=>{
    const h=hands(),plan=createExchangePlan([0],[1,2,3],false);
    let e=startExchange(h,plan);
    for(const loser of [1,2,3]){expect(e.phase).toBe('DRAW_PENDING');expect(e.plan[e.transactionIndex].loser).toBe(loser);e=drawForTransaction(e,e.hands[loser].slice(0,2))}
    expect(e.phase).toBe('RETURN_PENDING');expect(e.transactionIndex).toBe(0);
    expect(e.hands[0]).toHaveLength(19);expect(e.drawnIds).toHaveLength(6);
    const fromC=h[3].slice(0,2);
    expect(viewExchange(e,1).drawnIds).toEqual(h[1].slice(0,2));
    for(const id of h[2].slice(0,2))expect(JSON.stringify(viewExchange(e,1).drawnIds)).not.toContain(id);
    e=returnCards(e,fromC);
    expect(e.hands[1]).toEqual(expect.arrayContaining(fromC));expect(e.hands[1]).toHaveLength(13);
    expect(e.drawnIds).toHaveLength(4);
    e=returnCards(e,e.hands[0].filter(id=>!e.drawnIds.includes(id)).slice(0,2));
    e=returnCards(e,e.drawnIds.slice(0,2));
    expect(e.phase).toBe('COMPLETE');expect(e.hands.every(x=>x.length===13)).toBe(true);
    expect(e.logs!.map(l=>[l.loser,l.returned.length])).toEqual([[1,2],[2,2],[3,2]]);
  });
  it('3-on-1 and 2v2 still draw then return per pair',()=>{
    for(const plan of [createExchangePlan([0,1,2],[3],false),createExchangePlan([0,1],[2,3],true)]){
      let e=startExchange(hands(),plan);
      while(e.phase!=='COMPLETE'){const p=e.plan[e.transactionIndex];e=drawForTransaction(e,e.hands[p.loser].slice(0,p.count));expect(e.phase).toBe('RETURN_PENDING');e=returnCards(e,e.hands[p.winner].slice(0,p.count))}
    }
  });
});
