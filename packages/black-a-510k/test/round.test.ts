import { describe,expect,it } from 'vitest';
import { createDeck } from '../src/rules.js';
import { startRound, applyAction } from '../src/round.js';

function handsWith(fixed: string[][]) {
  const used=new Set(fixed.flat());
  const rest=createDeck().map(c=>c.id).filter(id=>!used.has(id));
  return fixed.map(cards=>[...cards,...rest.splice(0,13-cards.length)]);
}
describe('V1.1 turn state machine',()=>{
  it('freezes adjacent and opposite black A owners as two-player teams',()=>{
    const adjacent=startRound(handsWith([['3D','AS'],['AC'],[],[]]));
    const opposite=startRound(handsWith([['3D','AS'],[],['AC'],[]]));
    expect(adjacent.blackAOwners).toEqual([0,1]);
    expect(opposite.blackAOwners).toEqual([0,2]);
  });
  it('freezes a double-black-A solo team after its black A is played',()=>{
    let s=startRound(handsWith([['3D','AS','AC'],[],[],[]]));
    expect(s.blackAOwners).toEqual([0]);
    s=applyAction(s,{kind:'PLAY',actor:0,cards:['3D']});
    s=applyAction(s,{kind:'PASS',actor:1});
    s=applyAction(s,{kind:'PASS',actor:2});
    s=applyAction(s,{kind:'PASS',actor:3});
    s=applyAction(s,{kind:'PLAY',actor:0,cards:['AS']});
    expect(s.blackAOwners).toEqual([0]);
    expect(s.hands[0]).toContain('AC');
    expect(s.hands[0]).not.toContain('AS');
  });
  it('deals 13 each and forces the diamond 3 holder to lead',()=>{
    const s=startRound(handsWith([['3D'],[],[],[]]));
    expect(s.currentActor).toBe(0);
    expect(s.hands.every(h=>h.length===13)).toBe(true);
    expect(()=>applyAction(s,{kind:'PLAY',actor:0,cards:['4D']})).toThrow();
    expect(()=>applyAction(s,{kind:'PASS',actor:0})).toThrow();
  });
  it('accepts a diamond-3 combination under CONTAINS_D3 and another card under OWNER_ANY',()=>{
    const fixed=handsWith([['3D','4C','5H','6S','7D','9D'],[],[],[]]);
    const constrained=startRound(fixed,{firstLead:'CONTAINS_D3',soloScoreBasis:'FINAL'});
    expect(()=>applyAction(constrained,{kind:'PLAY',actor:0,cards:['4C']})).toThrow();
    const combined=applyAction(constrained,{kind:'PLAY',actor:0,cards:['3D','4C','5H','6S','7D']});
    expect(combined.lastPlay?.cards).toEqual(['3D','4C','5H','6S','7D']);
    const ownerAny=startRound(fixed,{firstLead:'OWNER_ANY',soloScoreBasis:'FINAL'});
    const single=applyAction(ownerAny,{kind:'PLAY',actor:0,cards:['9D']});
    expect(single.lastPlay?.cards).toEqual(['9D']);
    expect(single.hands[0]).toContain('3D');
  });
  it('lets a passer reenter only after someone raises',()=>{
    let s=startRound(handsWith([['3D'],['5D'],['4D'],['6D']]));
    s=applyAction(s,{kind:'PLAY',actor:0,cards:['3D']});
    s=applyAction(s,{kind:'PASS',actor:1});
    s=applyAction(s,{kind:'PLAY',actor:2,cards:['4D']});
    s=applyAction(s,{kind:'PASS',actor:3});
    s=applyAction(s,{kind:'PASS',actor:0});
    expect(s.currentActor).toBe(1);
    expect(s.pendingResponders).toContain(1);
    s=applyAction(s,{kind:'PLAY',actor:1,cards:['5D']});
    expect(s.lastPlay?.cards).toEqual(['5D']);
  });
  it('captures a trick exactly once after all responders pass',()=>{
    let s=startRound(handsWith([['3D'],[],[],[]]));
    s=applyAction(s,{kind:'PLAY',actor:0,cards:['3D']});
    s=applyAction(s,{kind:'PASS',actor:1});
    s=applyAction(s,{kind:'PASS',actor:2});
    s=applyAction(s,{kind:'PASS',actor:3});
    expect(s.capturedPiles[0]).toEqual(['3D']);
    expect(s.tableCards).toEqual([]);
    expect(s.currentActor).toBe(0);
    expect(()=>applyAction(s,{kind:'PASS',actor:0})).toThrow();
    expect(s.recentPlays).toEqual([
      {kind:'PLAY',cards:['3D'],trickId:1},
      {kind:'PASS',trickId:1},
      {kind:'PASS',trickId:1},
      {kind:'PASS',trickId:1},
    ]);
  });
  // House rule 2026-11-25: a two-player team that finishes both members ends the round at once.
  function endgame(hands:string[][],finished:number[],owners:number[],actor:number,lastPlay:{actor:number;cards:string[]}){
    const full=createDeck().map(c=>c.id);
    const s=startRound([full.slice(0,13),full.slice(13,26),full.slice(26,39),full.slice(39,52)]);
    const inPlay=new Set([...hands.flat(),...lastPlay.cards]);
    s.hands=hands;s.capturedPiles=[full.filter(id=>!inPlay.has(id)),[],[],[]];
    s.tableCards=[...lastPlay.cards];s.lastPlay=lastPlay;s.finishedOrder=finished;
    s.blackAOwners=owners;s.currentActor=actor;s.firstLeadPending=false;s.trickId=9;
    s.pendingResponders=[0,1,2,3].filter(id=>id!==lastPlay.actor&&hands[id].length>0);
    return s;
  }
  it('T22: ends immediately when both teammates finish; unbeatable leftovers go to the last finisher',()=>{
    // seat 0 (black) already out; seat 2 (black) plays its last card 2S, opponents hold 5D / KH 10C which cannot beat it.
    const s=endgame([[],['5D','4C'],['2S'],['KH','10C']],[0],[0,2],2,{actor:1,cards:['4D']});
    const settled=applyAction(s,{kind:'PLAY',actor:2,cards:['2S']});
    expect(settled.phase).toBe('RESULT');
    expect(settled.result?.earlyEnd).toBe(true);
    expect(settled.finishedOrder).toEqual([0,2,3,1]); // tie on cards left → turn order after seat 2
    expect(settled.result?.remainderRecipients).toEqual([{from:1,to:2},{from:3,to:2}]);
    expect(settled.result?.ledger[2].remainderScore).toBe(25);
    expect(settled.result?.ledger[1].transferOut).toBe(30);
  });
  it('feedback #29: the lone wolf finishing ends the round at once; the three others settle their leftovers',()=>{
    // seat 1 is the lone wolf and plays its last card 2S; seat 3 holds a bomb and can beat it, seats 0 and 2 cannot.
    const s=endgame([['5D','4C','6C'],['2S'],['KH','10C'],['9S','9H','9C','9D']],[],[1],1,{actor:0,cards:['3C']});
    const settled=applyAction(s,{kind:'PLAY',actor:1,cards:['2S']});
    expect(settled.phase).toBe('RESULT');
    expect(settled.result?.earlyEnd).toBe(true);
    expect(settled.finishedOrder[0]).toBe(1);
    expect(settled.finishedOrder[3]).toBe(3);
    expect([...settled.result!.remainderRecipients].sort((a,b)=>a.from-b.from)).toEqual([{from:0,to:1},{from:2,to:1},{from:3,to:3}]);
    expect(settled.result?.ledger[1].remainderScore).toBe(25);
    expect(settled.result?.ledger[1].transferIn).toBe(30);
  });
  it('T22: an unfinished player who can beat the terminal play keeps their own point cards',()=>{
    const s=endgame([[],['5D','4C'],['QS'],['KH','10C']],[0],[0,2],2,{actor:1,cards:['4D']});
    const settled=applyAction(s,{kind:'PLAY',actor:2,cards:['QS']});
    expect(settled.result?.remainderRecipients).toEqual([{from:1,to:2},{from:3,to:3}]);
    expect(settled.result?.ledger[3].remainderScore).toBe(20);
    expect(settled.result?.ledger.reduce((n,l)=>n+l.finalScore,0)).toBe(100);
  });
  it('T22: keeps playing when the first two finishers are on different teams',()=>{
    const s=endgame([[],['5D','4C'],['2S'],['KH','10C']],[1],[0,2],2,{actor:3,cards:['4D']});
    s.hands[0]=['3C'];s.capturedPiles[0]=s.capturedPiles[0].filter(id=>id!=='3C');s.finishedOrder=[1];s.hands[1]=[];
    s.capturedPiles[0].push('5D','4C');s.pendingResponders=[0,2];
    const next=applyAction(s,{kind:'PLAY',actor:2,cards:['2S']});
    expect(next.phase).toBe('PLAY');
  });
  it('T22 (changed 2026-11-27, feedback #29): a solo double-black-A player finishing first ends the round',()=>{
    const s=endgame([['2S'],['5D'],['4C'],['KH','10C']],[],[0],0,{actor:3,cards:['4D']});
    const next=applyAction(s,{kind:'PLAY',actor:0,cards:['2S']});
    expect(next.phase).toBe('RESULT');
  });
});
