import { describe,expect,it } from 'vitest';
import { settleRound } from '../src/settlement.js';
import { createDeck } from '../src/rules.js';

const base = () => {
  const deck = createDeck().map(c=>c.id);
  return {
    hands: [[],[],[],['2D','5H','10C','KH']],
    capturedPiles: [[...deck.filter(id=>!['2D','5H','10C','KH','KS'].includes(id))],[],[],[]],
    tableCards: ['KS'], terminalPlay: ['KS'],
    finishedOrder: [0,1,2,3] as [number,number,number,number],
    blackAOwners: [0,1] as number[], soloScoreBasis: 'FINAL' as const,
  };
};
const scoreFixture=(blackScore:number,blackAOwners:number[],basis:'FINAL'|'BASE'='FINAL',first=0)=>{
  const deck=createDeck();
  const scoring=deck.filter(card=>card.points>0);
  const chosen:string[]=[];let remaining=blackScore;
  for(const card of [...scoring].sort((a,b)=>b.points-a.points))if(card.points<=remaining){chosen.push(card.id);remaining-=card.points;}
  if(remaining!==0)throw new Error('unrepresentable score');
  const tail='4D',terminal='3D';
  const rest=deck.map(card=>card.id).filter(id=>!chosen.includes(id)&&id!==tail&&id!==terminal);
  const capturedPiles=[[],[],[],[]] as string[][];
  capturedPiles[0]=chosen;
  capturedPiles[1]=rest;
  return {hands:[[],[],[],[tail]],capturedPiles,tableCards:[terminal],terminalPlay:[terminal],finishedOrder:[first,first===0?1:0,2,3] as [number,number,number,number],blackAOwners,soloScoreBasis:basis};
};
const specialRemainderFixture=(tail:string[],terminal:string[])=>{
  const deck=createDeck().map(card=>card.id);
  return {hands:[[],[],[],tail],capturedPiles:[deck.filter(id=>!tail.includes(id)&&!terminal.includes(id)),[],[],[]],tableCards:terminal,terminalPlay:terminal,finishedOrder:[0,1,2,3] as [number,number,number,number],blackAOwners:[0,1],soloScoreBasis:'FINAL' as const};
};
describe('V1.1 atomic final accounting',()=>{
  it('allocates final trick to third and beatable remainder to tail',()=>{
    const s=settleRound(base());
    expect(s.ledger[2].capturedScore).toBe(10);
    expect(s.ledger[3].remainderScore).toBe(25);
    expect(s.ledger[0].transferIn).toBe(30);
    expect(s.ledger[3].transferOut).toBe(30);
    expect(s.ledger.reduce((n,x)=>n+x.baseScore,0)).toBe(100);
    expect(s.ledger.reduce((n,x)=>n+x.finalScore,0)).toBe(100);
    expect(s.remainderRecipient).toBe(3);
  });
  it('gives remainder to third if terminal double black A is unbeatable',()=>{
    const x=base();
    const deck=createDeck().map(c=>c.id);
    x.tableCards=['AS','AC']; x.terminalPlay=['AS','AC'];
    x.capturedPiles=[[...deck.filter(id=>!['2D','5H','10C','KH','AS','AC'].includes(id))],[],[],[]];
    const s=settleRound(x);
    expect(s.remainderRecipient).toBe(2);
    expect(s.ledger[2].remainderScore).toBe(25);
    const zeroTail=settleRound(specialRemainderFixture(['3C','4C','6C','7C'],['AS','AC']));
    expect(zeroTail.remainderRecipient).toBe(2);
    expect(zeroTail.ledger.reduce((n,row)=>n+row.remainderScore,0)).toBe(0);
  });
  it('awards tail remainder when only a special group can beat the terminal play',()=>{
    const blackA=settleRound(specialRemainderFixture(['AS','5H','10C','KH'],['2S']));
    expect(blackA.remainderRecipient).toBe(3);
    expect(blackA.ledger[3].remainderScore).toBe(25);
    const mixed=settleRound(specialRemainderFixture(['5D','10H','KC','2C'],['2S']));
    expect(mixed.remainderRecipient).toBe(3);
    expect(mixed.ledger[3].remainderScore).toBe(25);
    const bomb=settleRound(specialRemainderFixture(['2D','2C','2H','2S'],['AS']));
    expect(bomb.remainderRecipient).toBe(3);
    expect(bomb.ledger[3].remainderScore).toBe(0);
    const pure=settleRound(specialRemainderFixture(['5H','10H','KH','3C'],['QD','QC']));
    expect(pure.remainderRecipient).toBe(3);
    expect(pure.ledger[3].remainderScore).toBe(25);
    const double=settleRound(specialRemainderFixture(['AS','AC','3H','4H'],['2D','2C','2H','2S']));
    expect(double.remainderRecipient).toBe(3);
  });
  it('awards the full final trick to third even when tail could beat it',()=>{
    const result=settleRound(specialRemainderFixture(['AS','5H','10C','4H'],['KH']));
    expect(result.ledger[2].capturedScore).toBe(10);
    expect(result.ledger[3].capturedScore).toBe(0);
    expect(result.ledger[3].remainderScore).toBe(15);
  });
  it('compares ordinary same-type remainder and rejects a nonbeating tail',()=>{
    const beaten=settleRound(specialRemainderFixture(['8D','8C','5H','10C'],['7D','7C']));
    expect(beaten.remainderRecipient).toBe(3);
    expect(beaten.ledger[3].remainderScore).toBe(15);
    const unbeat=settleRound(specialRemainderFixture(['3H','4H','5H','6H'],['KD','KC']));
    expect(unbeat.remainderRecipient).toBe(2);
    expect(unbeat.ledger[2].remainderScore).toBe(5);
  });
  it('rejects duplicate or missing physical cards',()=>{
    const x=base(); x.capturedPiles[0].push('KS');
    expect(()=>settleRound(x)).toThrow(/52 unique/);
  });
  it('uses the black A team final 65-point boundary, not 60',()=>{
    const at65=settleRound(scoreFixture(35,[0,2]));
    const at60=settleRound(scoreFixture(30,[0,2]));
    expect(at65.ledger[0].finalScore+at65.ledger[2].finalScore).toBe(65);
    expect(at65.winningTeam).toBe('BLACK_A');
    expect(at65.reason).toBe('BLACK_LEAD_30');
    expect(at60.ledger[0].finalScore+at60.ledger[2].finalScore).toBe(60);
    expect(at60.winningTeam).toBe('OTHER');
  });
  it('distinguishes solo FINAL and BASE when first finisher captured zero',()=>{
    const final=settleRound(scoreFixture(0,[0],'FINAL'));
    const base=settleRound(scoreFixture(0,[0],'BASE'));
    expect(final.ledger[0]).toMatchObject({capturedScore:0,baseScore:0,transferIn:30,finalScore:30});
    expect(final.winningTeam).toBe('BLACK_A');
    expect(final.teamZeroBase[0]).toBe(true);
    expect(final.shavedPenalty[0]).toBe(false);
    expect(base.winningTeam).toBe('OTHER');
  });
  it('uses the solo 30-point inclusive boundary and always rejects the tail solo',()=>{
    expect(settleRound(scoreFixture(30,[0],'BASE',1)).winningTeam).toBe('BLACK_A');
    expect(settleRound(scoreFixture(25,[0],'BASE',1)).winningTeam).toBe('OTHER');
    expect(settleRound(scoreFixture(100,[3],'FINAL')).winningTeam).toBe('OTHER');
  });
  it('shaves only a losing team with zero base points',()=>{
    const zeroBlack=settleRound(scoreFixture(0,[0,2]));
    expect(zeroBlack.teamZeroCaptured).toEqual([true,false]);
    expect(zeroBlack.teamZeroBase).toEqual([true,false]);
    expect(zeroBlack.shavedPenalty).toEqual([true,false]);
    const zeroOther=settleRound(scoreFixture(100,[0,2]));
    expect(zeroOther.shavedPenalty).toEqual([false,true]);
    expect(zeroOther.ledger[0].finalScore).toBe(130);
    expect(zeroOther.ledger[3].finalScore).toBe(-30);
  });
  it('keeps the 30-point transfer on individual ledgers when head and tail share a team',()=>{
    const sameTeam=settleRound(scoreFixture(0,[0,3]));
    expect(sameTeam.ledger[0]).toMatchObject({baseScore:0,transferIn:30,transferOut:0,finalScore:30});
    expect(sameTeam.ledger[3]).toMatchObject({baseScore:0,transferIn:0,transferOut:30,finalScore:-30});
    expect(sameTeam.ledger[0].finalScore+sameTeam.ledger[3].finalScore).toBe(0);
  });
  it('does not shave a zero-capture loser that receives remainder points',()=>{
    const x=base();
    x.blackAOwners=[1,3];
    const result=settleRound(x);
    expect(result.winningTeam).toBe('OTHER');
    expect(result.teamZeroCaptured[0]).toBe(true);
    expect(result.teamZeroBase[0]).toBe(false);
    expect(result.shavedPenalty[0]).toBe(false);
  });
});
