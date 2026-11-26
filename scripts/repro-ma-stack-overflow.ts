
import { createMAGame, reduceMA } from "../packages/magical-athlete/src/engine.ts";
const n=8,g=21,sw=true; const maps=["mild","wild","twisty-twirl","whirly-world"] as const;
let rng=(g*7919+n*31+(sw?1:0))>>>0; const rnd=(k:number)=>{rng=(rng*1664525+1013904223)>>>0;return (rng>>>8)%k;};
const schedule=Array.from({length:4},()=>maps[rnd(4)]);
let s=createMAGame({players:Array.from({length:n},(_,i)=>({id:"p"+i,name:"P"+i})),seed:rng,settings:{schedule:[...schedule],deal:g%2?"random":"draft",...(sw?{secondWindPreview:true}:{})}});
let prev=s; const kinds:string[]=[];
try{ while(s.phase!=="over"){ prev=s;
 if(s.phase==="draft"){const d=s.draft!;s=reduceMA(s,{type:"DRAFT",player:d.order[d.step],racer:d.pool[rnd(d.pool.length)]});}
 else if(s.phase==="choose"){const p=s.players.find(x=>!x.choices.length)!;const f=p.hand.filter(r=>!p.used.includes(r));s=reduceMA(s,{type:"CHOOSE",player:p.id,racer:f[rnd(f.length)]});}
 else {kinds.push(s.pending!.kind+":"+s.pending!.options.length);const o=s.pending!.options;s=reduceMA(s,{type:"ANSWER",player:s.pending!.player,value:o[rnd(o.length)].value});}}
}catch(e){ const r=prev.race!; console.log("lastKinds",kinds.slice(-12).join(" "),"total",kinds.length);console.log((e as Error).message, "race",r.index,r.track,"twist",JSON.stringify(r.twist), r.tokens.map(t=>`${t.racer}@${t.pos}${t.out?"x":""}`).join(" "), "pending",prev.pending?.kind); console.log(prev.log.slice(-12).map(l=>l.text).join("\n")); console.log((e as Error).stack?.split("\n").slice(1,14).join("\n"));}
