import {createGame,reduce,waitingFor,actor,CHARACTERS,type Command,type State} from "../packages/menace/src/index.ts";
function rng(i:number){let x=i*7+1;return (n:number)=>{x=(x*1664525+1013904223)>>>0;return Math.floor(x/4294967296*n)}}
function opts(s:State,seat:number,r:(n:number)=>number):Command[]{const p=s.players[seat];const t:any=s.stack[s.stack.length-1];const o=()=>s.players.filter(x=>!x.killed);const any=()=>o().length?o()[r(o().length)].seat:0;const out:Command[]=[];
 if(t?.k==="ask"){const q=t.q,h=p.hand[r(Math.max(1,p.hand.length))]?.id;const vals:any[]=q==="heal"?[0]:q==="discard_down"||q==="bloodwork"||q==="formulate"?[h]:q==="austere"?[h,null]:q==="severed"?[t.data.options[0]]:q==="veto"?[true,false]:q==="brawl"?[any()]:q==="restructure"?[null]:q==="salvage"?[[]]:q==="rewind"?[t.data.cards[0].id]:q==="deflect"?[null,any()]:["contagion","butcher","vengeant"].includes(q)?[any(),null]:[true,false];return vals.map(value=>({seat,t:"answer",value}))}
 if(s.phase==="setup")return[{seat,t:"choose",name:p.choices[0]}];
 if(s.phase==="action"){const bad=["airlock","explosion","panic","reactor","backstab","brawl"];const m=p.agenda==="contagion"||p.agenda==="butcher";const pick=p.hand.filter(c=>bad.includes(c.type)===m);if(pick.length&&process.env.SMART)out.push({seat,t:"play",card:pick[0].id});for(let i=0;i<3;i++)if(p.hand.length)out.push({seat,t:"play",card:p.hand[r(p.hand.length)].id});out.push({seat,t:"draw"});for(const ab of CHARACTERS[p.character!].ab)out.push({seat,t:"ability",ab,args:{target:any(),a:any(),b:any(),discard:p.hand[0]?.id,card:p.hand[0]?.id,cards:p.hand.slice(0,2).map(c=>c.id),index:0,ab:s.roundAbilities[0],aside:p.hand[0]?.id}});out.push({seat,t:"pass"});return out}
 if(s.phase==="resolve")return[{seat,t:"reveal"}];
 if(s.phase==="accuse")return r(5)===0?[{seat,t:"call_vote"},{seat,t:"end_accuse"}]:[{seat,t:"end_accuse"}];
 if(s.phase==="vote")return[{seat,t:"vote",target:any()},{seat,t:"vote",target:null}];
 return[]}
const seen:Record<string,number>={};const N=+(process.argv[2]??200);
for(const mode of ["basic","advanced"] as const)for(const n of [4,5,6,7,8]){const c:Record<string,number>={};let rounds=0;
 for(let g=0;g<N;g++){const r=rng(g*97+n);let s=createGame(n,g*31+n,mode);let k=0,res="";
  for(;k<20000;k++){if(s.phase==="over"){res=s.winner!;break}const w=waitingFor(s);if(!w.length){res="STUCK:"+s.phase+s.stage;break}const seat=w[r(w.length)];const os=opts(s,seat,r);let done=false;for(const i of process.env.SMART?os:os.sort(()=>r(2)-.5)){try{s=reduce(s,i);done=true;const k2=(i as any).t==="ability"?(i as any).ab:(i as any).t==="answer"?"q":"";if(k2)seen[k2]=(seen[k2]??0)+1;break}catch(e:any){if(e.message==="LOOP"||e instanceof TypeError){res="CRASH:"+e.message;break}}}if(res)break;if(!done){res="NOMOVE:"+s.phase+":"+(s.stack.at(-1) as any)?.q;break}}
  if(!res)res="LONG";c[res]=(c[res]??0)+1;rounds+=s.round}
 console.log(mode,n,JSON.stringify(c),"avgRounds",(rounds/N).toFixed(1))}

console.log(Object.keys(seen).length,JSON.stringify(seen));
