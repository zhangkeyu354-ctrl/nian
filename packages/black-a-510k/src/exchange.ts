import { createDeck } from './rules.js';

export interface ExchangePair { winner:number; loser:number; count:2|4 }
export interface ExchangeState {
  phase:'DRAW_PENDING'|'RETURN_PENDING'|'COMPLETE';
  hands:string[][]; plan:ExchangePair[]; transactionIndex:number;
  drawnIds:string[]; completed:number;
}
const seats=(ids:readonly number[])=>ids.length>0 && new Set(ids).size===ids.length && ids.every(id=>Number.isInteger(id)&&id>=0&&id<4);
export function createExchangePlan(winners:readonly number[],losers:readonly number[],shavedPenalty:boolean):ExchangePair[]{
  if(!seats(winners)||!seats(losers)||winners.length+losers.length!==4||new Set([...winners,...losers]).size!==4||
    !((winners.length===2&&losers.length===2)||(winners.length===1&&losers.length===3)||(winners.length===3&&losers.length===1)))throw new Error('invalid teams');
  const w=[...winners].sort((a,b)=>a-b),l=[...losers].sort((a,b)=>a-b),count=shavedPenalty?4:2;
  if(w.length===2)return w.map((winner,i)=>({winner,loser:l[i],count}));
  if(w.length===1)return l.map(loser=>({winner:w[0],loser,count}));
  return w.map(winner=>({winner,loser:l[0],count}));
}
const verifyCards=(hands:readonly (readonly string[])[])=>{
  const all=hands.flat(),deck=new Set<string>(createDeck().map(c=>c.id));
  if(hands.length!==4||all.length!==52||new Set(all).size!==52||all.some(id=>!deck.has(id)))throw new Error('expected 52 unique physical cards');
};
export function startExchange(hands:readonly (readonly string[])[],plan:readonly ExchangePair[]):ExchangeState{
  verifyCards(hands);
  if(hands.some(h=>h.length!==13)||plan.length<1||plan.length>3||plan.some(p=>p.winner===p.loser||![2,4].includes(p.count)||!seats([p.winner,p.loser])))throw new Error('invalid exchange plan');
  return {phase:'DRAW_PENDING',hands:hands.map(h=>[...h]),plan:plan.map(p=>({...p})),transactionIndex:0,drawnIds:[],completed:0};
}
export function drawForTransaction(state:ExchangeState,drawn:readonly string[]):ExchangeState{
  if(state.phase!=='DRAW_PENDING')throw new Error('not waiting for draw');
  const pair=state.plan[state.transactionIndex];
  if(drawn.length!==pair.count||new Set(drawn).size!==drawn.length||drawn.some(id=>!state.hands[pair.loser].includes(id)))throw new Error('invalid draw');
  const hands=state.hands.map(h=>[...h]);
  hands[pair.loser]=hands[pair.loser].filter(id=>!drawn.includes(id));
  hands[pair.winner].push(...drawn);
  verifyCards(hands);
  return {...state,phase:'RETURN_PENDING',hands,drawnIds:[...drawn]};
}
export function returnCards(state:ExchangeState,returned:readonly string[]):ExchangeState{
  if(state.phase!=='RETURN_PENDING')throw new Error('not waiting for return');
  const pair=state.plan[state.transactionIndex];
  if(returned.length!==pair.count||new Set(returned).size!==returned.length||returned.some(id=>!state.hands[pair.winner].includes(id)))throw new Error('invalid return');
  const hands=state.hands.map(h=>[...h]);
  hands[pair.winner]=hands[pair.winner].filter(id=>!returned.includes(id));
  hands[pair.loser].push(...returned);
  verifyCards(hands);
  if(hands.some(h=>h.length!==13))throw new Error('exchange did not restore 13 cards');
  const transactionIndex=state.transactionIndex+1;
  return {...state,hands,phase:transactionIndex===state.plan.length?'COMPLETE':'DRAW_PENDING',transactionIndex,drawnIds:[],completed:state.completed+1};
}
export function deterministicAutoReturn(state:ExchangeState):string[]{
  if(state.phase!=='RETURN_PENDING')throw new Error('not waiting for return');
  const pair=state.plan[state.transactionIndex],points=new Map(createDeck().map(c=>[c.id,c.points]));
  const ranks=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const suits=['D','C','H','S'];
  const sortKey=(id:string)=>{const suit=id.slice(-1),rank=id.slice(0,-1);return [points.get(id as never)?1:0,ranks.indexOf(rank),suits.indexOf(suit),id] as const;};
  return [...state.hands[pair.winner]].sort((a,b)=>{
    const x=sortKey(a),y=sortKey(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]||String(x[3]).localeCompare(String(y[3]));
  }).slice(0,pair.count);
}
