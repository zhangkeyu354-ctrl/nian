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
  it('T22: keeps playing when two teammates finish first and settles immediately when third finishes',()=>{
    const full=createDeck().map(c=>c.id);
    const s=startRound([full.slice(0,13),full.slice(13,26),full.slice(26,39),full.slice(39,52)]);
    s.hands=[[],['5D'],[],['KH','2S']];
    s.capturedPiles=[full.filter(id=>!['5D','KH','2S','4S'].includes(id)),[],[],[]];
    s.tableCards=['4S'];s.lastPlay={actor:2,cards:['4S']};s.finishedOrder=[0,2];
    s.blackAOwners=[0,2];s.currentActor=1;s.firstLeadPending=false;s.trickId=9;
    expect(s.phase).toBe('PLAY');
    const settled=applyAction(s,{kind:'PLAY',actor:1,cards:['5D']});
    expect(settled.phase).toBe('RESULT');
    expect(settled.finishedOrder).toEqual([0,2,1,3]);
    expect(settled.result?.ledger[1].capturedScore).toBe(5);
    expect(settled.result?.remainderRecipient).toBe(3);
  });
});
