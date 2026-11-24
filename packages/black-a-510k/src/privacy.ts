import { createDeck } from './rules.js';
import type { RoundState } from './round.js';
import type { ExchangeState } from './exchange.js';

const score=new Map<string,number>(createDeck().map(c=>[c.id,c.points]));
const visibleSeat=(seat:number|null)=>seat!==null&&Number.isInteger(seat)&&seat>=0&&seat<4;
export function viewRound(state:RoundState,seat:number|null){
  const own=visibleSeat(seat)?seat!:null;
  return {
    phase:state.phase,version:state.version,turnId:state.turnId,trickId:state.trickId,
    currentActor:state.currentActor,hand:own===null?null:[...state.hands[own]],
    handCounts:state.hands.map(h=>h.length),
    capturedScores:state.capturedPiles.map(p=>p.reduce((n,id)=>n+(score.get(id)??0),0)),
    tableCards:[...state.tableCards],tableScore:state.tableCards.reduce((n,id)=>n+(score.get(id)??0),0),
    lastPlay:state.lastPlay?{actor:state.lastPlay.actor,cards:[...state.lastPlay.cards]}:null,
    finishedOrder:[...state.finishedOrder],
    options:{...state.options},ruleVersion:state.rules.ruleVersion,
    result:state.phase==='RESULT'?state.result:null,
  };
}
export function viewExchange(state:ExchangeState,seat:number|null){
  const own=visibleSeat(seat)?seat!:null;
  const pair=state.plan[state.transactionIndex]??null;
  return {
    phase:state.phase,transactionIndex:state.transactionIndex,transactionCount:state.plan.length,
    pair:pair?{...pair}:null,completed:state.completed,
    hand:own===null?null:[...state.hands[own]],handCounts:state.hands.map(h=>h.length),
    returnCount:pair&&own===pair.winner&&state.phase==='RETURN_PENDING'?pair.count:null,
  };
}
