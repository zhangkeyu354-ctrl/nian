import { createDeck, hasBeatingPlay, DEFAULT_RULES, type CardId } from './rules.js';

export interface SettlementInput {
  hands: readonly (readonly string[])[];
  capturedPiles: readonly (readonly string[])[];
  tableCards: readonly string[];
  terminalPlay: readonly string[];
  finishedOrder: readonly [number,number,number,number];
  blackAOwners: readonly number[];
  soloScoreBasis: 'FINAL'|'BASE';
}
export interface Ledger {
  capturedScore: number; remainderScore: number; baseScore: number;
  transferIn: number; transferOut: number; finalScore: number;
}
export interface Settlement {
  ledger: readonly Ledger[];
  remainderRecipient: number;
  /** Where each unfinished player's leftover point cards went (one entry normally, two on a team early end). */
  remainderRecipients: readonly {from:number;to:number}[];
  /** True when both members of a 2-player team finished first and the round ended immediately. */
  earlyEnd: boolean;
  blackTeam: readonly number[];
  otherTeam: readonly number[];
  winningTeam: 'BLACK_A'|'OTHER';
  winnerIds: readonly number[];
  loserIds: readonly number[];
  teamZeroCaptured: readonly [boolean,boolean];
  teamZeroBase: readonly [boolean,boolean];
  shavedPenalty: readonly [boolean,boolean];
  reason: 'BLACK_LEAD_30'|'OTHER_HOLDS'|'SOLO_30'|'SOLO_FAILED';
}
const points = new Map(createDeck().map(c=>[c.id,c.points] as const));
const sum = (ids: readonly string[]) => ids.reduce((n,id)=>n+(points.get(id as CardId) ?? 0),0);
const teamSum = (team: readonly number[],ledger: readonly Ledger[],field: keyof Ledger) => team.reduce((n,id)=>n+ledger[id][field],0);

export function settleRound(input: SettlementInput): Settlement {
  if (input.hands.length !== 4 || input.capturedPiles.length !== 4 || input.finishedOrder.length !== 4 ||
      new Set(input.finishedOrder).size !== 4 || input.finishedOrder.some(id=>id<0 || id>3) ||
      ![1,2].includes(input.blackAOwners.length) || new Set(input.blackAOwners).size !== input.blackAOwners.length ||
      input.blackAOwners.some(id=>id<0 || id>3)) throw new Error('invalid settlement seats');
  const all = [...input.hands.flat(),...input.capturedPiles.flat(),...input.tableCards];
  if (all.length !== 52 || new Set(all).size !== 52 || all.some(id=>!points.has(id as CardId))) throw new Error('expected 52 unique physical cards');
  const first = input.finishedOrder[0], tail = input.finishedOrder[3];
  const unfinished = [0,1,2,3].filter(id=>input.hands[id].length>0);
  const earlyEnd = unfinished.length>=2;
  if (!(unfinished.length>=1 && unfinished.length<=3) || (unfinished.length===3 && input.blackAOwners.length!==1) ||
      input.finishedOrder.slice(4-unfinished.length).some(id=>!unfinished.includes(id)) ||
      input.tableCards.length === 0 || input.terminalPlay.some(id=>!input.tableCards.includes(id))) throw new Error('invalid terminal state');
  // The player who made the terminal play (last finisher) takes the unresolved terminal trick.
  const lastFinisher = input.finishedOrder[3-unfinished.length];
  const captured = input.capturedPiles.map(pile=>[...pile]);
  captured[lastFinisher].push(...input.tableCards);
  // Each unfinished player keeps their leftover point cards only if they could beat the terminal play.
  const remainderRecipients = unfinished.map(from=>({from,to:hasBeatingPlay(input.hands[from],input.terminalPlay,{},DEFAULT_RULES) ? from : lastFinisher}));
  const remainderRecipient = remainderRecipients.find(r=>r.from===tail)!.to;
  const ledger: Ledger[] = captured.map((pile,id)=>{
    const capturedScore=sum(pile);
    const remainderScore=remainderRecipients.filter(r=>r.to===id).reduce((n,r)=>n+sum(input.hands[r.from]),0);
    const transferIn=id===first ? 30 : 0;
    const transferOut=id===tail ? 30 : 0;
    const baseScore=capturedScore+remainderScore;
    return {capturedScore,remainderScore,baseScore,transferIn,transferOut,finalScore:baseScore+transferIn-transferOut};
  });
  if (ledger.reduce((n,l)=>n+l.baseScore,0)!==100 || ledger.reduce((n,l)=>n+l.finalScore,0)!==100) throw new Error('score conservation failed');
  const blackTeam=[...input.blackAOwners].sort((a,b)=>a-b);
  const otherTeam=[0,1,2,3].filter(id=>!blackTeam.includes(id));
  const solo=blackTeam.length===1;
  const soloScore=ledger[blackTeam[0]][input.soloScoreBasis==='BASE'?'baseScore':'finalScore'];
  const blackWins=solo ? blackTeam[0]!==tail && soloScore>=30 : teamSum(blackTeam,ledger,'finalScore')-teamSum(otherTeam,ledger,'finalScore')>=30;
  const winningTeam=blackWins?'BLACK_A':'OTHER';
  const teamZeroCaptured=[teamSum(blackTeam,ledger,'capturedScore')===0,teamSum(otherTeam,ledger,'capturedScore')===0] as const;
  const teamZeroBase=[teamSum(blackTeam,ledger,'baseScore')===0,teamSum(otherTeam,ledger,'baseScore')===0] as const;
  return {
    ledger,remainderRecipient,remainderRecipients,earlyEnd,blackTeam,otherTeam,winningTeam,
    winnerIds:blackWins?blackTeam:otherTeam,loserIds:blackWins?otherTeam:blackTeam,
    teamZeroCaptured,teamZeroBase,shavedPenalty:[!blackWins && teamZeroBase[0],blackWins && teamZeroBase[1]],
    reason:solo ? blackWins?'SOLO_30':'SOLO_FAILED' : blackWins?'BLACK_LEAD_30':'OTHER_HOLDS',
  };
}
