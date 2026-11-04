// @ts-nocheck
import { ROUTE, WORLD, validColors, createGame, reduceMY, plansOf, BASE, PLAYER_BONUS, oathDone, outcomeOf, need, State } from "../src/index.ts";
const C: any = (await import("../src/content.json")).default;
function bestMove(s){const lim=[];for(let i=Math.max(0,s.pos-2);i<=Math.min(11,s.pos+2);i++)lim.push(i);const R=WORLD.mysteries.find(m=>m.id===s.mysteries[s.solved])?.goal;const val=i=>{const l=ROUTE[i];if(R?.type==="visit")return -Math.abs(ROUTE.indexOf(R.loc)-i);if(R?.type==="close_rifts"&&s.rifts.includes(l))return 5;if(R?.type==="kill_monster"&&s.monsters[l])return 5;return s.rifts.includes(l)||s.monsters[l]?1:i};return lim.sort((a,b)=>val(b)-val(a))[0]}
const sabOath = ["O01","O02","O03","O04","O05","O06"];
function play(n:number,seed:number,mode:string){ let s:State=createGame(n,seed); let g=0;
 const sab=(p:number)=> mode==="one"?p===0: mode==="traitor"?(s.players[p].traitor||s.players[p].recruit):mode==="oath"?(sabOath.includes(s.players[p].oath)&&(seed+p)%2===0):false;
 while(!s.ending){ if(++g>500)throw 0; const a=s.actor;
  if(s.phase==="MAP"){s=reduceMY(s,{t:"MOVE",seat:a,pos:bestMove(s)});continue}
  if(s.phase==="PLAN"){ const P=plansOf(s).sort((x,y)=>{const at=(q:any)=>C.game.classes.find((c:any)=>c.id===s.players[a].cls).attributes[q.attribute]-BASE[q.difficulty];return at(y)-at(x)}); const final=s.sceneIdx===3;if(s.boss)P.sort((x:any,y:any)=>(y.id==="ATK"?1:0)-(x.id==="ATK"?1:0)); s=reduceMY(s,{t:"PLAN",seat:a,planId:P[0].id,acceptDeal:!!s.dealOffer&&final});continue}
  if(s.phase==="CONTRIBUTE"){ const q=s.players.find(p=>p.seat!==a&&p.seat!==s.jailed&&!s.played.some(x=>x.seat===p.seat))!; const pl={valid_colors:validColors(s)}; const sc=(c:any)=>pl.valid_colors.includes(c.color)?c.value:-c.value; const h=[...q.hand].sort((x,y)=>sc(y)-sc(x)); s=reduceMY(s,{t:"CONTRIBUTE",seat:q.seat,cardId:(sab(q.seat)?h[h.length-1]:h[0]).id});continue}
  if(s.phase==="COUNCIL"){ if(mode==="traitor"&&!s.inspected&&s.inspectLeft>0&&s.clues>0){const f=s.players.find(p=>!sab(p.seat));if(f&&!s.votesPlanned){const ts=Object.keys(s.lastPlays).map(Number).filter(x=>x!==f.seat);if(ts.length){s=reduceMY(s,{t:"INSPECT",seat:f.seat,target:ts[g%ts.length]});}}}
   const res:any=Object.values(s.inspectResults).at(-1);const q=s.players.find(p=>!(p.seat in s.votes))!;const t=mode==="traitor"&&res&&res.effective===false&&!sab(q.seat)?res.target:null;s=reduceMY(s,{t:"VOTE",seat:q.seat,target:t});continue}
  if(s.phase==="ROLL"){s=reduceMY(s,{t:"ROLL",seat:a,push:s.players[a].stress<=2&&s.sceneIdx>=2});continue}
  if(s.phase==="FLASHBACK"){ const N=need(s); const nowO=outcomeOf(s.total,N); const f=s.players.find(p=>p.flashback&&!sab(p.seat)&&p.seat!==s.jailed); const worth=nowO==="失败"&&s.total+3>=N&&(s.sceneIdx===3||s.doom>=5); if(f&&worth&&s.supplies>0){s=reduceMY(s,{t:"FLASHBACK",seat:f.seat,pay:"supplies"});continue}
   const q=s.players.find(p=>!s.passed.includes(p.seat))!; s=reduceMY(s,{t:"PASS",seat:q.seat});continue}
 } return s }
const oathC:Record<string,[number,number]>={};
for(const mode of ["coop","traitor"]){ console.log("\n"+mode+"  人数 胜率 圣物归还 惨胜 灾厄满格 平均灾厄 失控/局 预兆变局");
 for(let n=3;n<=8;n++){ let w=0,e1=0,dm=0,dSum=0,pan=0,om=0;const K=80; for(let i=0;i<K;i++){const s=play(n,i*7919+n,mode); if(s.ending!=="E02")w++; if(s.ending==="E01")e1++; if(s.doom>=8)dm++; dSum+=s.doom; pan+=s.log.filter(l=>l.type==="incident_triggered").length; om+=s.log.some(l=>l.type==="omen_trigger")?1:0;
  if(mode==="oath")for(const p of s.players){const r=oathC[p.oath]??=[0,0];r[1]++; if(oathDone(s,p.seat))r[0]++;}}
  console.log(n,(w/K*100).toFixed(1),(e1/K*100).toFixed(1),((w-e1)/K*100).toFixed(1),(dm/K*100).toFixed(1),(dSum/K).toFixed(1),(pan/K).toFixed(2),(0).toFixed(1));}}
console.log("\n誓约达成率(%)",Object.entries(oathC).sort().map(([k,v])=>k+":"+(v[0]/v[1]*100).toFixed(0)).join(" "));
