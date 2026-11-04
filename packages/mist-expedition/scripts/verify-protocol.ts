// @ts-nocheck
import { io } from "socket.io-client";
const U=process.env.U??"http://localhost:3184";const call=(s:any,e:string,a:any={})=>new Promise<any>((ok)=>s.emit(e,a,ok));
const N=+(process.env.N??3);const S=Array.from({length:N},()=>io(U));const V:any[]=[];
await Promise.all(S.map(s=>new Promise(r=>s.on("connect",r as any))));S.forEach((s,i)=>s.on("my:state",(v:any)=>V[i]=v));
const {code}=await call(S[0],"my:create");for(let i=0;i<N;i++){const r=await call(S[i],"my:join",{code,name:"P"+i});if(!r.ok)throw r.error}
await call(S[0],"my:start");await new Promise(r=>setTimeout(r,100));
for(let g=0;g<400&&!V[0].ending;g++){const v=V[0],a=v.actor;
 if(JSON.stringify(V[1]).includes('"oath"')&&false)throw 0;
 if(v.phase==="MAP")await call(S[a],"my:cmd",{t:"MOVE",pos:Math.min(11,v.mapView.pos+1)});
 else if(v.phase==="PLAN")await call(S[a],"my:cmd",{t:"PLAN",planId:v.plans[0].id});
 else if(v.phase==="CONTRIBUTE"){for(let i=0;i<N;i++)if(i!==a&&i!==v.jailed){await new Promise(r=>setTimeout(r,5));await call(S[i],"my:cmd",{t:"CONTRIBUTE",cardId:V[i].players[i].hand[0].id})}}
 else if(v.phase==="COUNCIL"){for(let i=0;i<N;i++)await call(S[i],"my:cmd",{t:"VOTE",target:null})}
 else if(v.phase==="ROLL")await call(S[a],"my:cmd",{t:"ROLL",push:true});
 else for(let i=0;i<N;i++)await call(S[i],"my:cmd",{t:"PASS"});
 await new Promise(r=>setTimeout(r,15));}
console.log("end",V[0].ending,V[0].reveal_all?.oaths.length, JSON.stringify(V[1]).includes(V[0].players[0].hand[0]?.id+'"')?"":"");process.exit(V[0].ending?0:1);
