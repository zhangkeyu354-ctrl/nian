import { describe,expect,it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { beats,classify,createDeck } from '../src/rules.js';
import { applyAction,startRound } from '../src/round.js';

const rng=(seed:number)=>()=>{seed=(seed+0x6D2B79F5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x^=x+Math.imul(x^(x>>>7),61|x);return ((x^(x>>>14))>>>0)/4294967296;};
function shuffled(seed:number){const r=rng(seed),d=createDeck().map(c=>c.id);for(let i=d.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return [d.slice(0,13),d.slice(13,26),d.slice(26,39),d.slice(39,52)];}
function choice(hand:string[],target:readonly string[]|null,first:boolean,r:()=>number){
  if(first)return ['3D'];
  for(let n=0;n<32;n++){
    const selected=hand.filter(()=>r()<0.28);
    if(selected.length && beats(selected,target))return selected;
  }
  const singles=hand.filter(id=>beats([id],target));
  return singles.length?[singles[Math.floor(r()*singles.length)]]:null;
}
describe('reproducible complete games',()=>{
  it('completes 1000 legal four-player rounds with card and score conservation',()=>{
    let solo=0,team=0,actions=0;
    const combinations:Record<string,{rounds:number;solo:number;team:number}>={};
    const playTypes:Record<string,number>={};
    for(let seed=1;seed<=1000;seed++){
      const firstLead=seed%2?'CONTAINS_D3':'OWNER_ANY';
      const soloScoreBasis=seed%4<2?'FINAL':'BASE';
      let s=startRound(shuffled(seed),{firstLead,soloScoreBasis});
      const r=rng(seed^0x12345678);
      const key=`${firstLead}/${soloScoreBasis}`;
      combinations[key]??={rounds:0,solo:0,team:0}; combinations[key].rounds++;
      if(s.blackAOwners.length===1)solo++;else team++;
      combinations[key][s.blackAOwners.length===1?'solo':'team']++;
      for(let step=0;s.phase==='PLAY';step++){
        if(step>400)throw new Error(`deadlock seed ${seed}`);
        const actor=s.currentActor!;
        expect(s.hands[actor].length).toBeGreaterThan(0);
        expect(s.pendingResponders.every(id=>s.hands[id].length>0)).toBe(true);
        const play=choice(s.hands[actor],s.lastPlay?.cards??null,s.firstLeadPending&&firstLead==='CONTAINS_D3',r);
        if(play){const type=classify(play)?.type??'INVALID';playTypes[type]=(playTypes[type]??0)+1;}
        s=applyAction(s,play?{kind:'PLAY',actor,cards:play}:{kind:'PASS',actor});
        const cards=[...s.hands.flat(),...s.tableCards,...s.capturedPiles.flat()];
        expect(cards.length).toBe(52);
        expect(new Set(cards).size).toBe(52);
        actions++;
      }
      expect(s.result?.ledger.reduce((n,x)=>n+x.baseScore,0)).toBe(100);
      expect(s.result?.ledger.reduce((n,x)=>n+x.finalScore,0)).toBe(100);
    }
    writeFileSync('docs/black-a-510k/random-rounds.json',JSON.stringify({seeds:'1..1000',rounds:1000,team,solo,actions,failures:0,combinations,playTypes,scope:'single round pure engine; excludes exchanges, network, timeouts'},null,2)+'\n');
  },120000);
});
