import { describe,expect,it } from 'vitest';
import { createDeck } from '../src/rules.js';
import { startRound,applyAction } from '../src/round.js';
import { chooseBotAction,timeoutLeadCard } from '../src/bot.js';
describe('BA bot (2026-11-28)',()=>{
  it('timeout lead plays the lowest non-point single, never a 10 just because of string order',()=>{
    expect(timeoutLeadCard(['10C','2S','4H','5D','KS'],false)).toBe('4H');
    expect(timeoutLeadCard(['10C','5D'],false)).toBe('5D');
    expect(timeoutLeadCard(['3D','9C'],true)).toBe('3D');
  });
  it('bots always finish whole series of random rounds and never throw',()=>{
    for(let g=0;g<15;g++){
      const ids=createDeck().map(c=>c.id).sort(()=>Math.random()-.5);
      let s=startRound([0,1,2,3].map(i=>ids.slice(i*13,i*13+13)));
      for(let k=0;k<600&&s.phase==='PLAY';k++){const a=s.currentActor!;const p=chooseBotAction(s,a);s=applyAction(s,p?{kind:'PLAY',actor:a,cards:p}:{kind:'PASS',actor:a})}
      expect(s.phase).toBe('RESULT');
    }
  },30000);
  it('does not spend a bomb on an early small single',()=>{
    const all=createDeck().map(c=>c.id as string);
    const h1=['9S','9H','9C','9D','5H','6H','7H','8H','JH','QH','KH','4H','2H'];
    const rest=all.filter(id=>!h1.includes(id)&&id!=='3D');
    const h0=['3D',...rest.slice(0,12)],h2=rest.slice(12,25),h3=rest.slice(25,38);
    const s0=startRound([h0,h1,h2,h3]);
    const s=applyAction(s0,{kind:'PLAY',actor:0,cards:['3D']});
    const pick=chooseBotAction(s,1);
    expect(pick).not.toEqual(['9C','9D','9H','9S'].sort());
    expect(pick?.length).toBe(1);
  });
});
