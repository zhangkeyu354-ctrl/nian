import { beats, createDeck, DEFAULT_RULES, type Rules } from './rules.js';
import { settleRound, type Settlement } from './settlement.js';

export interface RoundOptions { firstLead: 'CONTAINS_D3'|'OWNER_ANY'; soloScoreBasis: 'FINAL'|'BASE' }
export const DEFAULT_ROUND_OPTIONS: RoundOptions = Object.freeze({firstLead:'CONTAINS_D3',soloScoreBasis:'FINAL'});
export type RecentPlay = { kind: 'PLAY'; cards: string[]; trickId: number } | { kind: 'PASS'; trickId: number } | null;
export interface RoundState {
  phase: 'PLAY'|'RESULT'; version: number; turnId: number;
  hands: string[][]; capturedPiles: string[][]; tableCards: string[];
  currentActor: number|null; lastPlay: {actor:number;cards:string[]}|null;
  recentPlays: RecentPlay[];
  pendingResponders: number[]; finishedOrder: number[];
  firstLeadPending: boolean; trickId: number; blackAOwners: number[];
  options: RoundOptions; rules: Rules; result: Settlement|null;
}
export type Action = {kind:'PLAY';actor:number;cards:string[]} | {kind:'PASS';actor:number};
const nextIn = (start:number,candidates:readonly number[]) => {
  for(let step=1;step<=4;step++){const seat=(start+step)%4;if(candidates.includes(seat))return seat;}
  throw new Error('no next actor');
};
const copyRecent=(recent:readonly RecentPlay[]|undefined):RecentPlay[]=>(recent??[null,null,null,null]).map(p=>p?(p.kind==='PLAY'?{kind:'PLAY' as const,cards:[...p.cards],trickId:p.trickId}:{kind:'PASS' as const,trickId:p.trickId}):null);
const copy = (s:RoundState):RoundState => ({...s,hands:s.hands.map(h=>[...h]),capturedPiles:s.capturedPiles.map(p=>[...p]),tableCards:[...s.tableCards],lastPlay:s.lastPlay?{actor:s.lastPlay.actor,cards:[...s.lastPlay.cards]}:null,recentPlays:copyRecent(s.recentPlays),pendingResponders:[...s.pendingResponders],finishedOrder:[...s.finishedOrder]});
export function startRound(hands:readonly (readonly string[])[], options:RoundOptions=DEFAULT_ROUND_OPTIONS, rules:Rules=DEFAULT_RULES):RoundState {
  if(hands.length!==4 || hands.some(h=>h.length!==13))throw new Error('four hands of 13 required');
  const all=hands.flat(); const deck=new Set(createDeck().map(c=>c.id));
  if(all.length!==52 || new Set(all).size!==52 || all.some(id=>!deck.has(id as never)))throw new Error('52 unique valid cards required');
  const first=hands.findIndex(h=>h.includes('3D'));
  return {phase:'PLAY',version:0,turnId:1,hands:hands.map(h=>[...h]),capturedPiles:[[],[],[],[]],tableCards:[],currentActor:first,lastPlay:null,recentPlays:[null,null,null,null],pendingResponders:[],finishedOrder:[],firstLeadPending:true,trickId:1,blackAOwners:hands.map((h,i)=>h.includes('AS')||h.includes('AC')?i:-1).filter(i=>i>=0),options:{...options},rules:{...rules},result:null};
}
export function applyAction(state:RoundState, action:Action):RoundState {
  if(state.phase!=='PLAY' || action.actor!==state.currentActor)throw new Error('wrong phase or actor');
  const s=copy(state); const actor=action.actor;
  if(action.kind==='PLAY'){
    if(!action.cards.length || new Set(action.cards).size!==action.cards.length || action.cards.some(id=>!s.hands[actor].includes(id)))throw new Error('invalid card ownership');
    if(s.firstLeadPending && s.options.firstLead==='CONTAINS_D3' && !action.cards.includes('3D'))throw new Error('first lead must contain diamond 3');
    if(!beats(action.cards,s.lastPlay?.cards??null,s.rules))throw new Error('illegal or nonbeating play');
    s.hands[actor]=s.hands[actor].filter(id=>!action.cards.includes(id));
    s.tableCards.push(...action.cards);
    s.lastPlay={actor,cards:[...action.cards]}; s.firstLeadPending=false;
    s.recentPlays[actor]={kind:'PLAY',cards:[...action.cards],trickId:s.trickId};
    if(s.hands[actor].length===0 && !s.finishedOrder.includes(actor))s.finishedOrder.push(actor);
    // House rule (2026-11-25): when both members of a two-player team have finished, the round ends at once.
    const teamDone=s.blackAOwners.length===2 && s.finishedOrder.length===2 &&
      s.blackAOwners.includes(s.finishedOrder[0])===s.blackAOwners.includes(s.finishedOrder[1]);
    if(s.finishedOrder.length===3 || teamDone){
      // Unfinished players are ranked by cards left (fewer = better); ties go in turn order after the last finisher.
      const rest=[1,2,3].map(k=>(actor+k)%4).filter(id=>!s.finishedOrder.includes(id))
        .sort((a,b)=>s.hands[a].length-s.hands[b].length);
      s.finishedOrder.push(...rest);
      s.result=settleRound({hands:s.hands,capturedPiles:s.capturedPiles,tableCards:s.tableCards,terminalPlay:action.cards,finishedOrder:s.finishedOrder as [number,number,number,number],blackAOwners:s.blackAOwners,soloScoreBasis:s.options.soloScoreBasis});
      s.phase='RESULT';s.currentActor=null;s.pendingResponders=[];
    }else{
      s.pendingResponders=[0,1,2,3].filter(id=>id!==actor && s.hands[id].length>0);
      s.currentActor=nextIn(actor,s.pendingResponders);
    }
  }else{
    if(!s.lastPlay || !s.pendingResponders.includes(actor))throw new Error('cannot pass on empty trick');
    s.recentPlays[actor]={kind:'PASS',trickId:s.trickId};
    s.pendingResponders=s.pendingResponders.filter(id=>id!==actor);
    if(s.pendingResponders.length){s.currentActor=nextIn(actor,s.pendingResponders);}
    else{
      const winner=s.lastPlay.actor;
      s.capturedPiles[winner].push(...s.tableCards);
      s.tableCards=[];s.lastPlay=null;s.trickId++;
      const active=[0,1,2,3].filter(id=>s.hands[id].length>0);
      s.currentActor=active.includes(winner)?winner:nextIn(winner,active);
    }
  }
  s.version++;s.turnId++;
  return s;
}
