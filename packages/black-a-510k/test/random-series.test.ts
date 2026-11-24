import { describe,expect,it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { beats,createDeck } from '../src/rules.js';
import { applyAction,startRound } from '../src/round.js';
import { createExchangePlan,deterministicAutoReturn,drawForTransaction,returnCards,startExchange } from '../src/exchange.js';

const rng=(seed:number)=>()=>{seed=(seed+0x6D2B79F5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x^=x+Math.imul(x^(x>>>7),61|x);return ((x^(x>>>14))>>>0)/4294967296;};
const shuffle=(seed:number):string[][]=>{const r=rng(seed),d:string[]=createDeck().map(c=>c.id);for(let i=d.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return [d.slice(0,13),d.slice(13,26),d.slice(26,39),d.slice(39,52)];};
const choose=(hand:string[],target:readonly string[]|null,first:boolean,r:()=>number)=>{
  if(first)return ['3D'];
  for(let i=0;i<20;i++){const p=hand.filter(()=>r()<.25);if(p.length&&beats(p,target))return p;}
  const singles=hand.filter(id=>beats([id],target));return singles.length?[singles[Math.floor(r()*singles.length)]]:null;
};

describe('100 reproducible ten-round series',()=>{
  it('consumes each prior reward once and keeps 52 cards through exchanges',()=>{
    const counts={rounds:0,transactions:0,normal:0,shaved:0,team:0,soloWin:0,soloLoss:0};
    const combinations:Record<string,number>={};
    for(let group=0;group<100;group++){
      const firstLead=group%2?'CONTAINS_D3':'OWNER_ANY';
      const soloScoreBasis=group%4<2?'FINAL':'BASE';
      const key=`${firstLead}/${soloScoreBasis}`;combinations[key]=(combinations[key]??0)+1;
      const random=rng(group*719+11);
      let prior:ReturnType<typeof startRound>['result']=null;
      for(let round=0;round<10;round++){
        let hands=shuffle(group*10000+round+101);
        if(prior){
          const shaved=prior.winningTeam==='BLACK_A'?prior.shavedPenalty[1]:prior.shavedPenalty[0];
          const plan=createExchangePlan(prior.winnerIds,prior.loserIds,shaved);
          counts[prior.blackTeam.length===1?(prior.winningTeam==='BLACK_A'?'soloWin':'soloLoss'):'team']++;
          let e=startExchange(hands,plan);
          while(e.phase!=='COMPLETE'){
            const pair=e.plan[e.transactionIndex];
            const pool=[...e.hands[pair.loser]];
            for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
            e=drawForTransaction(e,pool.slice(0,pair.count));
            expect(e.hands[pair.winner].length).toBe(13+pair.count);
            expect(e.hands[pair.loser].length).toBe(13-pair.count);
            e=returnCards(e,deterministicAutoReturn(e));
            counts.transactions++;counts[shaved?'shaved':'normal']++;
          }
          hands=e.hands;
          expect(hands.every(h=>h.length===13)).toBe(true);
        }
        let s=startRound(hands,{firstLead,soloScoreBasis});
        expect(s.blackAOwners.length).toBeGreaterThanOrEqual(1);
        for(let step=0;s.phase==='PLAY';step++){
          if(step>400)throw new Error(`deadlock group ${group} round ${round}`);
          const actor=s.currentActor!;
          const p=choose(s.hands[actor],s.lastPlay?.cards??null,s.firstLeadPending&&firstLead==='CONTAINS_D3',random);
          s=applyAction(s,p?{kind:'PLAY',actor,cards:p}:{kind:'PASS',actor});
          const all=[...s.hands.flat(),...s.tableCards,...s.capturedPiles.flat()];
          expect(all.length).toBe(52);expect(new Set(all).size).toBe(52);
        }
        expect(s.result?.ledger.reduce((n,x)=>n+x.finalScore,0)).toBe(100);
        prior=s.result;counts.rounds++;
      }
    }
    writeFileSync('docs/black-a-510k/random-series.json',JSON.stringify({seeds:'group 0..99, round 0..9',groups:100,roundsPerGroup:10,failures:0,combinations,counts,scope:'pure engine and deterministic return; excludes network, timeouts, exits'},null,2)+'\n');
    expect(counts.rounds).toBe(1000);
  },120000);
});
