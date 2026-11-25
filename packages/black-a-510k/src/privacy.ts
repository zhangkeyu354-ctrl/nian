import { createDeck } from './rules.js';
import type { RoundState } from './round.js';
import type { ExchangeLogEntry, ExchangeState } from './exchange.js';

const score=new Map<string,number>(createDeck().map(c=>[c.id,c.points]));
const visibleSeat=(seat:number|null)=>seat!==null&&Number.isInteger(seat)&&seat>=0&&seat<4;
export function viewExchangeLogs(logs:readonly ExchangeLogEntry[],seat:number|null){
  const own=visibleSeat(seat)?seat!:null;
  return logs.map(entry=>({
    winner:entry.winner,loser:entry.loser,count:entry.count,
    drawnCount:entry.drawn.length,returnedCount:entry.returned.length,
    drawn:own===entry.winner||own===entry.loser?[...entry.drawn]:null,
    returned:own===entry.winner||own===entry.loser?[...entry.returned]:null,
  }));
}
export function viewRound(state:RoundState,seat:number|null){
  const own=visibleSeat(seat)?seat!:null;
  return {
    phase:state.phase,version:state.version,turnId:state.turnId,trickId:state.trickId,
    currentActor:state.currentActor,hand:own===null?null:[...state.hands[own]],
    handCounts:state.hands.map(h=>h.length),
    capturedScores:state.capturedPiles.map(p=>p.reduce((n,id)=>n+(score.get(id)??0),0)),
    tableCards:[...state.tableCards],tableScore:state.tableCards.reduce((n,id)=>n+(score.get(id)??0),0),
    lastPlay:state.lastPlay?{actor:state.lastPlay.actor,cards:[...state.lastPlay.cards]}:null,
    recentPlays:(state.recentPlays??[null,null,null,null]).map(p=>p?(p.kind==='PLAY'?{kind:'PLAY' as const,cards:[...p.cards],trickId:p.trickId}:{kind:'PASS' as const,trickId:p.trickId}):null),
    finishedOrder:[...state.finishedOrder],
    options:{...state.options},ruleVersion:state.rules.ruleVersion,
    result:state.phase==='RESULT'?state.result:null,
  };
}
export function viewExchange(state:ExchangeState,seat:number|null){
  const own=visibleSeat(seat)?seat!:null;
  const pair=state.plan[state.transactionIndex]??null;
  const canSeeDrawn=own!==null&&pair!==null&&(own===pair.winner||own===pair.loser);
  const faceDownCount=pair&&state.phase==='DRAW_PENDING'?(state.faceDownPool?.length??state.hands[pair.loser].length):0;
  return {
    phase:state.phase,transactionIndex:state.transactionIndex,transactionCount:state.plan.length,
    pair:pair?{...pair}:null,completed:state.completed,
    hand:own===null?null:[...state.hands[own]],handCounts:state.hands.map(h=>h.length),
    returnCount:pair&&own===pair.winner&&state.phase==='RETURN_PENDING'?pair.count:null,
    drawCount:pair&&state.phase==='DRAW_PENDING'?pair.count:null,
    faceDownCount,
    drawnIds:state.phase==='RETURN_PENDING'&&canSeeDrawn?[...state.drawnIds]:null,
    logs:viewExchangeLogs(state.logs??[],own),
  };
}
