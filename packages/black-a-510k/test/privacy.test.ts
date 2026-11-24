import { describe,expect,it } from 'vitest';
import { createDeck } from '../src/rules.js';
import { startRound } from '../src/round.js';
import { viewRound,viewExchange } from '../src/privacy.js';
import { startExchange,drawForTransaction } from '../src/exchange.js';

const hands=()=>{const d=createDeck().map(c=>c.id);return [d.slice(0,13),d.slice(13,26),d.slice(26,39),d.slice(39,52)];};
describe('viewer-specific state',()=>{
  it('hides opponent hands and frozen team until result',()=>{
    const h=hands(),state=startRound(h);
    const own=viewRound(state,0),spectator=viewRound(state,null);
    expect(own.hand).toEqual(h[0]);
    expect(spectator.hand).toBeNull();
    expect(own.handCounts).toEqual([13,13,13,13]);
    expect(JSON.stringify(own)).not.toContain(h[1][0]);
    expect(JSON.stringify(own)).not.toContain('blackAOwners');
    expect(JSON.stringify(spectator)).not.toContain('blackAOwners');
  });
  it('shows drawn cards only to the winner through their own hand',()=>{
    const h=hands(),plan=[{winner:0,loser:1,count:2 as const}];
    const e=drawForTransaction(startExchange(h,plan),h[1].slice(0,2));
    expect(viewExchange(e,0).hand).toHaveLength(15);
    expect(viewExchange(e,1).hand).toHaveLength(11);
    expect(viewExchange(e,2).hand).toHaveLength(13);
    expect(viewExchange(e,null).hand).toBeNull();
    expect(JSON.stringify(viewExchange(e,2))).not.toContain(h[1][0]);
  });
});
