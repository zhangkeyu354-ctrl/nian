import {AGENDAS,CHARACTERS,COST,EMMA,ENERGY_GOAL,ENERGY_SAFE,OXYGEN_MAX,SETUP,WOUNDS,type Ability,type CardType,type WoundType} from "./data.ts";
export * from "./data.ts";
export interface Card{id:number;type:CardType}
interface Played{seat:number;card:Card} // seat=-1 表示 EmMA
export interface Player{seat:number;agenda:string;character:string|null;choices:string[];hand:Card[];deck:Card[];aside:Card[];wounds:WoundType[];exiled:boolean;killed:boolean;revealed:boolean;used:Ability[];severed:Ability|null;resoluteUsed:boolean;austereUsed:boolean;}
type Task={k:"ask";seat:number;q:string;data?:any}|{k:"wound";seat:number;st:number}|{k:"ability";seat:number;ab:Ability;args:any;free:boolean;copy?:boolean}|{k:"effect";type:CardType}|{k:"death";seat:number}|{k:"reveal"}|{k:"finish"};
export interface State{n:number;mode:"basic"|"advanced";rng:number;nextId:number;phase:"setup"|"action"|"resolve"|"accuse"|"vote"|"over";round:number;leader:number;oxygen:number;energy:number;resStart:number;players:Player[];emma:Card[];emmaUsed:Card[];woundDeck:WoundType[];discard:Card[];played:Played[];queue:Played[];revealed:Played[];stack:Task[];turn:number;sub:number[];lastType:string|null;playedSeats:number[];armed:boolean;
 flags:{veto?:number;deflect?:number;helping?:number;moxie?:number;damage?:number;rewind?:number;restructure?:number;guard?:number;lockdown?:boolean;brawl?:boolean;backstab?:boolean;bad?:boolean;woundedRound?:boolean;};
 roundAbilities:Ability[];stage:string;votes:Record<number,number|null>;log:string[];notes:string[][];winner:"crew"|"menace"|null;winners:number[];}
export type Command={seat:number}&({t:"choose";name:string}|{t:"draw"}|{t:"play";card:number}|{t:"ability";ab:Ability;args?:any}|{t:"pass"}|{t:"answer";value:any}|{t:"call_vote"}|{t:"end_accuse"}|{t:"vote";target:number|null});
const fail=(c:string):never=>{throw new Error(c)};
const rnd=(s:State)=>{s.rng=(s.rng+0x6D2B79F5)|0;let t=Math.imul(s.rng^(s.rng>>>15),1|s.rng);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
function shuffle<T>(s:State,a:T[]){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd(s)*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const build=(s:State,d:Partial<Record<CardType,number>>)=>Object.entries(d).flatMap(([t,c])=>Array.from({length:c as number},()=>({id:s.nextId++,type:t as CardType})));
const alive=(s:State)=>s.players.filter(p=>!p.killed);
const has=(p:Player,w:WoundType)=>p.wounds.includes(w);
const side=(p:Player)=>AGENDAS[p.agenda].side;
const hasAgenda=(s:State,a:string)=>s.players.find(p=>p.agenda===a&&!p.killed);
const limit=(p:Player)=>has(p,"concussion")?2:4;
const say=(s:State,m:string)=>{s.log.push(m)};
const ask=(s:State,seat:number,q:string,data?:any)=>{s.stack.push({k:"ask",seat,q,data})};
export function createGame(n:number,seed:number,mode:"basic"|"advanced"="basic"):State{
 const c=SETUP[n]??fail("BAD_PLAYERS");
 const s:State={n,mode,rng:seed|0,nextId:1,phase:"setup",round:0,leader:0,oxygen:c.oxygen,energy:0,resStart:0,players:[],emma:[],emmaUsed:[],woundDeck:[],discard:[],played:[],queue:[],revealed:[],stack:[],turn:0,sub:[],lastType:null,playedSeats:[],armed:false,flags:{},roundAbilities:[],stage:"",votes:{},log:[],notes:Array.from({length:n},()=>[]),winner:null,winners:[]};
 s.emma=shuffle(s,build(s,EMMA));s.woundDeck=shuffle(s,[...WOUNDS]);
 const crew=["austere","loyal","paragon","reckless","resolute","vengeant"];
 const ag=[...shuffle(s,["contagion","butcher"]).slice(0,c.menace),...shuffle(s,crew).slice(0,c.crew),...(c.saint?["saint"]:[]),...(c.coward?["coward"]:[])];
 shuffle(s,ag);
 const chars=shuffle(s,Object.keys(CHARACTERS));
 s.players=ag.map((agenda,seat)=>({seat,agenda,character:null,choices:seat<Math.min(5,n)?chars.splice(0,3):[],hand:[],deck:[],aside:[],wounds:[],exiled:false,killed:false,revealed:false,used:[],severed:null,resoluteUsed:false,austereUsed:false}));
 (s as any).pool=chars;
 return s;
}
function afterChoice(s:State){
 const ps=s.players;
 if(ps.every(p=>p.character)){for(const p of ps){p.deck=shuffle(s,build(s,{...merge(AGENDAS[p.agenda].deck,CHARACTERS[p.character!].deck)}));p.hand=p.deck.splice(0,3)}beginRound(s);return}
 if(ps.length>5&&ps.slice(0,5).every(p=>p.character)&&ps.slice(5).every(p=>!p.choices.length&&!p.character)){const pool:string[]=(s as any).pool;shuffle(s,pool);const rest=ps.slice(5);let i=0;while(pool.length){rest[i%rest.length].choices.push(pool.shift()!);i++}}
}
const merge=(a:any,b:any)=>{const o={...a};for(const k in b)o[k]=(o[k]||0)+b[k];return o};
function beginRound(s:State){s.phase="action";s.round++;s.turn=0;s.sub=[];s.lastType=null;s.playedSeats=[];s.flags={};s.roundAbilities=[];s.played=[];for(const p of s.players)p.used=[];say(s,`第 ${s.round} 回合开始`)}
function addO(s:State,n:number){s.oxygen=Math.max(0,Math.min(OXYGEN_MAX,s.oxygen+n));if(s.oxygen===0)zeroO(s)}
function zeroO(s:State){const a=hasAgenda(s,"austere");if(a&&!a.austereUsed&&a.hand.length&&!a.exiled){a.austereUsed=true;ask(s,a.seat,"austere")}}
function addE(s:State,n:number,free=false){if(n>0&&!free&&s.phase==="resolve")s.energy=Math.max(s.energy,Math.min(s.energy+n,s.resStart+5));else s.energy+=n;s.energy=Math.max(0,Math.min(ENERGY_GOAL,s.energy))}
function draw(s:State,seat:number,n:number){const p=s.players[seat];for(let i=0;i<n;i++){const c=p.deck.shift();if(!c)break;if(has(p,"frenzied")){s.played.push({seat,card:c});mark(s,seat);s.notes[seat].push("狂乱：抽到的牌被直接打出 "+c.type)}else p.hand.push(c)}if(p.hand.length>limit(p))ask(s,seat,"discard_down")}
const mark=(s:State,seat:number)=>{if(!s.playedSeats.includes(seat))s.playedSeats.push(seat)};
function discardRandom(s:State,p:Player){if(p.hand.length)s.discard.push(p.hand.splice(Math.floor(rnd(s)*p.hand.length),1)[0])}
function takeCard(p:Player,id:number){const i=p.hand.findIndex(c=>c.id===id);if(i<0)fail("NOT_IN_HAND");return p.hand.splice(i,1)[0]}
function playCard(s:State,p:Player,c:Card){s.played.push({seat:p.seat,card:c});mark(s,p.seat);if(has(p,"punctured_lung"))s.discard.push(...p.deck.splice(0,2))}
const canPlay=(s:State,p:Player)=>!(has(p,"broken_limbs")&&!s.playedSeats.some(x=>x!==p.seat))&&!(s.flags.lockdown&&p.wounds.length>0);
function abilityList(p:Player){return p.character?CHARACTERS[p.character].ab:[]}
function canAbility(s:State,p:Player,ab:Ability,args:any){if(p.exiled)return false;const cost=COST[ab];if(p.severed===ab)return false;if(p.used.includes(ab))return false;if((cost.e??0)>s.energy)return false;if((cost.d??0)>p.hand.length)return false;return true}
export function actor(s:State){if(s.phase!=="action"||s.stack.length)return null;if(s.sub.length)return s.sub[s.sub.length-1];const seat=(s.leader+s.turn)%s.n;return seat}
function legalKinds(s:State,p:Player){const k:string[]=[];if(p.deck.length)k.push("draw");if(p.hand.length&&canPlay(s,p))k.push("play");if(!p.exiled&&abilityList(p).some(a=>canAbility(s,p,a,{})))k.push("ability");return k}
function endAction(s:State,type:string){s.lastType=type;if(s.sub.length)s.sub.pop();else s.turn++}
function wound(s:State,seat:number){s.stack.push({k:"wound",seat,st:0})}
function doWound(s:State,t:Extract<Task,{k:"wound"}>){const p=s.players[t.seat];if(p.killed)return;
 if(t.st===0){if(s.flags.lockdown&&p.wounds.length)return;t.st=1;s.stack.push(t);if(s.flags.deflect!==undefined){const h=s.flags.deflect;delete s.flags.deflect;ask(s,h,"deflect",{victim:t.seat})}return}
 if(t.st===1){t.st=2;s.stack.push(t);if(p.wounds.length>=1){const pg=hasAgenda(s,"paragon");if(pg&&!pg.revealed&&pg.seat!==p.seat&&!pg.exiled)ask(s,pg.seat,"paragon",{victim:p.seat});}return}
 if(t.st===2){t.st=3;s.stack.push(t);if(p.wounds.length>=1&&p.agenda==="resolute"&&!p.resoluteUsed)ask(s,p.seat,"resolute");return}
 const w=s.woundDeck.shift()??"flesh";p.wounds.push(w);s.flags.woundedRound=true;say(s,`座位${p.seat+1} 受伤：${w}`);
 if(p.agenda==="saint"){p.revealed=true;say(s,`座位${p.seat+1} 是圣人，氧气 -2`);addO(s,-2)}
 if(w==="concussion"){while(p.hand.length>limit(p))discardRandom(s,p)}
 if(w==="frenzied"){p.deck=[...shuffle(s,p.hand.splice(0)),...p.deck]}
 if(w==="pulverized")s.discard.push(...p.deck.splice(0,5));
 if(w==="severed"){const l=abilityList(p);ask(s,p.seat,"severed",{options:l})}
 if(w==="mental_breakdown"){for(const o of s.players)if(o!==p&&o.deck.length)p.deck.push(o.deck.shift()!);shuffle(s,p.deck)}
}
function effect(s:State,type:CardType,copy:boolean){
 if(type==="raise_morale")addO(s,1);if(type==="basic_repair")addE(s,1);if(type==="advanced_repair")addE(s,2);
 if(type==="command")for(const p of alive(s).reverse())draw(s,p.seat,1);
 if(type==="panic")for(const p of alive(s))discardRandom(s,p);
 if(type==="airlock")addO(s,-1);if(type==="explosion")addE(s,-2);
 if(type==="reactor")for(const seat of [...s.playedSeats].reverse()){const p=s.players[seat];if(!p.killed&&!p.wounds.length)wound(s,seat)}
 if(!copy&&type==="backstab"&&!s.flags.backstab){s.flags.backstab=true;if(s.flags.guard!==undefined){delete s.flags.guard;say(s,"守卫取消了背刺")}else wound(s,s.leader)}
 if(!copy&&type==="brawl"&&!s.flags.brawl){s.flags.brawl=true;ask(s,s.leader,"brawl")}
}
const COSTO:Partial<Record<CardType,number>>={basic_repair:1,advanced_repair:1,command:1,panic:1};
function reveal(s:State){const it=s.queue.shift()!;s.revealed.push(it);const type=it.card.type;say(s,`揭示：${type}`);if(["airlock","explosion","panic"].includes(type))s.flags.bad=true;
 s.stack.push({k:"effect",type});
 if(s.flags.veto!==undefined)ask(s,s.flags.veto,"veto",{type,forced:s.queue.length===0})}
function resolveCard(s:State,type:CardType,vetoed:boolean){if(vetoed){say(s,"否决：取消费用和效果");return}
 const c=COSTO[type];if(c)addO(s,-c);
 const copy=s.armed&&type!=="replicate";if(type==="replicate"){s.armed=true;return}
 if(copy){s.armed=false;if(type!=="brawl"&&type!=="backstab"){effect(s,type,true)}}
 effect(s,type,false)}
function ability(s:State,t:Extract<Task,{k:"ability"}>){const p=s.players[t.seat],a=t.args??{},c=COST[t.ab];
 if(!t.free){if(c.e)addE(s,-c.e);if(c.o)addO(s,-c.o)}
 if(c.d&&!t.copy){const id=a.discard;s.discard.push(takeCard(p,id))}else if(c.d)s.discard.push(takeCard(p,a.discard));
 s.roundAbilities.push(t.ab);say(s,`座位${p.seat+1} 使用 ${t.ab}`);
 const tgt=(x:any)=>{const o=s.players[x];if(!o||o.killed)fail("BAD_TARGET");return o};
 switch(t.ab){
 case "bloodwork":{const o=tgt(a.target);if(o.hand.length)ask(s,o.seat,"bloodwork");break}
 case "first_aid":{const o=tgt(a.target);o.wounds.splice(Math.max(0,a.wound??o.wounds.length-1),1);break}
 case "regenerate":p.wounds.splice(Math.max(0,a.wound??p.wounds.length-1),1);break;
 case "veto":s.flags.veto=p.seat;break;
 case "laser_pistol":{const o=tgt(a.target);if(o===p)fail("BAD_TARGET");wound(s,o.seat);break}
 case "delegate":{const o=tgt(a.target);if(o===p)fail("BAD_TARGET");s.sub.push(o.seat);(s as any).delegated=true;break}
 case "commandeer":{const o=tgt(a.target);const x=o.deck.shift();if(x){p.hand.push(x);if(p.hand.length>limit(p))ask(s,p.seat,"discard_down")}break}
 case "salvage":if(s.discard.length)ask(s,p.seat,"salvage",{cards:s.discard});break;
 case "crunch":{const o=tgt(a.target);if(o.wounds.length)fail("BAD_TARGET");wound(s,o.seat);draw(s,o.seat,3);break}
 case "strategize":{if(a.aside!==undefined)p.aside.push(takeCard(p,a.aside));const ids:number[]=a.play??[];for(const id of ids){const i=p.aside.findIndex(x=>x.id===id);if(i<0)fail("NOT_ASIDE");playCard(s,p,p.aside.splice(i,1)[0])}if(ids.length>=4)addO(s,2);break}
 case "moxie":s.flags.moxie=p.seat;break;
 case "todays_special":{const o=tgt(a.target);if(o===p)fail("BAD_TARGET");o.hand.push(takeCard(p,a.card));if(o.hand.length>limit(o))ask(s,o.seat,"discard_down");draw(s,p.seat,2);break}
 case "helping_hand":s.flags.helping=p.seat;break;
 case "mimic":{const ab=a.ab as Ability;if(!s.roundAbilities.slice(0,-1).includes(ab)||ab==="mimic"||!canAfford(s,p,ab))fail("BAD_MIMIC");s.stack.push({k:"ability",seat:p.seat,ab,args:a,free:false,copy:true});break}
 case "deflect":s.flags.deflect=p.seat;break;
 case "rewind":s.flags.rewind=p.seat;break;
 case "efficiency":{const ids:number[]=(a.cards??[]).slice(0,2);if(!ids.length)break;for(const id of ids)playCard(s,p,takeCard(p,id));break}
 case "formulate":ask(s,p.seat,"formulate");{const n=p.deck.splice(0,3);p.hand.push(...n)}break;
 case "system_refresh":{const o=tgt(a.target);const n=o.hand.length;o.deck.push(...o.hand.splice(0));shuffle(s,o.deck);draw(s,o.seat,n+1);break}
 case "synchronize":{const x=tgt(a.a),y=tgt(a.b);if(x===y)fail("BAD_TARGET");draw(s,x.seat,1);draw(s,y.seat,1);break}
 case "surveillance":{const it=s.played[a.index]??s.queue[a.index];if(it)s.notes[p.seat].push(`监控：座位${it.seat+1} 的牌是 ${it.card.type}`);break}
 case "equip":draw(s,p.seat,2);break;
 case "resupply":{const o=tgt(a.target);if(o===p)fail("BAD_TARGET");draw(s,o.seat,2);break}
 case "rush":{const x=p.deck.shift();if(x)playCard(s,p,x);break}
 case "restructure":s.flags.restructure=p.seat;break;
 case "damage_control":s.flags.damage=p.seat;break;
 case "guard":s.flags.guard=p.seat;break;
 case "lockdown":s.flags.lockdown=true;break;
 }
}
function canAfford(s:State,p:Player,ab:Ability){const c=COST[ab];return (c.e??0)<=s.energy&&(c.d??0)<=p.hand.length}
function startResolve(s:State){s.phase="resolve";s.resStart=s.energy;
 const l=s.players[s.leader];if(has(l,"radiation_burns")&&s.played.length){const i=Math.floor(rnd(s)*s.played.length);s.discard.push(s.played.splice(i,1)[0].card)}
 const need=Math.ceil(s.n/2);while(s.played.length<need){if(!s.emma.length){s.emma=shuffle(s,s.emmaUsed);s.emmaUsed=[]}const c=s.emma.shift();if(!c)break;s.played.push({seat:-1,card:c})}
 s.queue=shuffle(s,s.played);s.played=[];s.revealed=[];s.stage="reveal";
 if(s.flags.restructure!==undefined)ask(s,s.flags.restructure,"restructure",{cards:s.queue.map(q=>q.card)})}
function finishResolve(s:State){if(s.flags.rewind!==undefined&&s.revealed.length){ask(s,s.flags.rewind,"rewind",{cards:s.revealed.map(r=>r.card)});delete s.flags.rewind;return}
 for(const r of s.revealed)(r.seat<0?s.emmaUsed:s.discard).push(r.card);s.revealed=[];s.phase="accuse";s.stage=""}
function death(s:State,seat:number){const p=s.players[seat];if(p.killed)return;p.killed=true;p.revealed=true;say(s,`座位${seat+1} 死亡，身份 ${p.agenda}`);
 const sd=side(p);if(sd==="crew")addO(s,-2);if(sd==="neutral")addO(s,-1);
 s.discard.push(...p.hand.splice(0));
 if(!p.exiled&&(p.agenda==="contagion"||p.agenda==="butcher"))ask(s,seat,p.agenda);
 if(p.agenda==="vengeant")ask(s,seat,"vengeant");
 if(p.agenda==="reckless"&&!p.exiled)addE(s,2,true);}
function endRound(s:State){if(s.stage!=="end"){s.stage="end";if(s.flags.moxie!==undefined&&s.flags.woundedRound)addO(s,3);if(s.flags.damage!==undefined&&s.flags.bad)addE(s,3,true);}
 const d=s.players.find(p=>!p.killed&&p.wounds.length>=2);if(d){s.stack.push({k:"death",seat:d.seat});return}
 if(check(s))return;if(s.energy>=ENERGY_GOAL&&s.oxygen>0){over(s,"crew");return}
 do{s.leader=(s.leader+1)%s.n}while(s.players[s.leader].killed);s.stage="";beginRound(s)}
function check(s:State){if(s.phase==="over")return true;if(s.oxygen===0)return over(s,"menace"),true;
 const c=s.players.filter(p=>side(p)==="crew");if(c.every(p=>p.killed))return over(s,"menace"),true;
 if(s.players.filter(p=>side(p)==="menace").every(p=>p.killed)&&s.energy>=ENERGY_SAFE)return over(s,"crew"),true;return false}
function individual(s:State,p:Player){const a=p.agenda;if(a==="austere"){const l=alive(s).map(x=>x.seat);const i=l.indexOf(p.seat);if(i<0)return p.hand.length>0;const L=s.players[l[(i-1+l.length)%l.length]],R=s.players[l[(i+1)%l.length]];return p.hand.length>L.hand.length&&p.hand.length>R.hand.length}
 if(a==="paragon")return !s.players.some(x=>x!==p&&x.killed&&side(x)==="crew");if(a==="reckless")return p.deck.length<=11;if(a==="resolute")return p.revealed;if(a==="saint")return s.oxygen>=4;if(a==="vengeant")return s.players.some(x=>x!==p&&x.killed);if(a==="coward")return !p.exiled;return true}
function over(s:State,w:"crew"|"menace"){s.phase="over";s.winner=w;s.stack=[];s.winners=s.players.filter(p=>{if(side(p)==="neutral")return !p.killed&&(s.mode==="basic"||individual(s,p));return side(p)===w&&(s.mode==="basic"||individual(s,p))}).map(p=>p.seat);say(s,w==="crew"?"船员胜利":"内鬼胜利")}
function run(s:State){for(let g=0;g<5000;g++){
 if(s.phase==="over")return;
 const top=s.stack[s.stack.length-1];
 if(top){if(top.k==="ask")return;s.stack.pop();
  if(top.k==="wound")doWound(s,top);else if(top.k==="ability")ability(s,top);else if(top.k==="effect")resolveCard(s,top.type,!!(s as any).vetoNow),(s as any).vetoNow=false;else if(top.k==="death")death(s,top.seat);continue}
 if(s.oxygen===0||check(s)){check(s);continue}
 if(s.phase==="action"){if(s.sub.length){const p=s.players[s.sub[s.sub.length-1]];if(p.killed){s.sub.pop();continue}return}
  if(s.turn>=s.n){startResolve(s);continue}
  const p=s.players[(s.leader+s.turn)%s.n];if(p.killed){s.turn++;continue}
  if(!p.hand.length&&!p.deck.length){p.wounds.length;s.stack.push({k:"death",seat:p.seat});s.turn++;continue}
  return}
 if(s.phase==="resolve"){if(s.queue.length){reveal(s);continue}finishResolve(s);continue}
 if(s.phase==="accuse"&&s.stage==="end"){endRound(s);continue}
 if(s.stage==="end"){endRound(s);continue}
 return}
 fail("LOOP")}
function answer(s:State,seat:number,v:any){const t=s.stack[s.stack.length-1];if(!t||t.k!=="ask"||t.seat!==seat)fail("NO_QUESTION");const a=t as Extract<Task,{k:"ask"}>,p=s.players[seat];
 const pick=(x:any)=>{const o=s.players[x];if(!o||o.killed)fail("BAD_TARGET");return o};
 switch(a.q){
 case "discard_down":{s.discard.push(takeCard(p,v));if(p.hand.length<=limit(p))s.stack.pop();break}
 case "deflect":s.stack.pop();if(v!==null){const o=pick(v);if(o.seat===a.data.victim)fail("BAD_TARGET");const w=s.stack[s.stack.length-1] as any;w.seat=o.seat}break;
 case "paragon":s.stack.pop();if(v){p.revealed=true;const w=s.stack[s.stack.length-1] as any;w.seat=seat}break;
 case "resolute":s.stack.pop();if(v){p.revealed=true;p.resoluteUsed=true;s.stack.pop()}break;
 case "austere":s.stack.pop();if(v!==null){s.discard.push(takeCard(p,v));p.revealed=true;addO(s,1);addE(s,1,true)}break;
 case "severed":{if(!a.data.options.includes(v))fail("BAD");p.severed=v;s.stack.pop();break}
 case "bloodwork":{const c=takeCard(p,v);p.hand.push(c);say(s,`座位${seat+1} 公开手牌：${c.type}`);s.stack.pop();break}
 case "veto":{if(v===false&&a.data.forced)fail("VETO_FORCED");s.stack.pop();if(v){delete s.flags.veto;(s as any).vetoNow=true}break}
 case "brawl":{s.stack.pop();wound(s,pick(v).seat);break}
 case "restructure":{s.stack.pop();if(v){const i=s.queue.findIndex(q=>q.card.id===v.out);if(i<0)fail("BAD");const c=takeCard(p,v.in);p.hand.push(s.queue[i].card);s.queue[i].card=c}break}
 case "salvage":{const ids:number[]=v??[];if(ids.length>2)fail("BAD");s.stack.pop();for(const id of ids){const i=s.discard.findIndex(c=>c.id===id);if(i<0)fail("BAD");p.hand.push(s.discard.splice(i,1)[0])}if(p.hand.length>limit(p))ask(s,seat,"discard_down");break}
 case "formulate":{p.deck.push(takeCard(p,v));s.stack.pop();if(p.hand.length>limit(p))ask(s,seat,"discard_down");break}
 case "assist":{s.stack.pop();if(v){delete s.flags.helping;(s.stack[s.stack.length-1] as any).free=true}break}
 case "rewind":{const i=s.revealed.findIndex(r=>r.card.id===v);if(i<0)fail("BAD");s.stack.pop();p.hand.push(s.revealed.splice(i,1)[0].card);if(p.hand.length>limit(p))ask(s,seat,"discard_down");break}
 case "contagion":{s.stack.pop();if(v!==null){const o=pick(v);s.discard.push(...o.hand.splice(0))}break}
 case "butcher":case "vengeant":{s.stack.pop();if(v!==null)wound(s,pick(v).seat);break}
 default:fail("BAD_QUESTION")}}
export function reduce(prev:State,c:Command):State{const s=structuredClone(prev);const p=s.players[c.seat]??fail("BAD_SEAT");if(s.phase==="over")fail("OVER");
 if(c.t==="answer"){answer(s,c.seat,c.value);run(s);return s}
 if(s.stack.length)fail("WAITING");
 if(c.t==="choose"){if(s.phase!=="setup"||!p.choices.includes(c.name))fail("BAD_CHOICE");p.character=c.name;const rest=p.choices.filter(x=>x!==c.name);p.choices=[];(s as any).pool.push(...rest);afterChoice(s);run(s);return s}
 if(c.t==="draw"||c.t==="play"||c.t==="ability"||c.t==="pass"){if(actor(s)!==c.seat)fail("NOT_YOUR_TURN");const sub=s.sub.length>0;
  const kinds=legalKinds(s,p);const bd=has(p,"brain_damage")&&!sub&&s.lastType&&s.lastType!=="pass"?s.lastType:null;
  if(bd&&kinds.includes(bd)&&c.t!==bd&&c.t!=="pass")fail("BRAIN_DAMAGE");
  if(c.t==="pass"){const need=bd&&kinds.includes(bd)?[bd]:kinds;if(need.some(k=>k==="play"||(k==="draw"&&!sub)))fail("MUST_ACT");endAction(s,"pass")}
  if(c.t==="draw"){if(sub)fail("NOT_ALLOWED");if(!p.deck.length)fail("EMPTY");draw(s,c.seat,1);endAction(s,"draw")}
  if(c.t==="play"){if(!canPlay(s,p))fail("CANNOT_PLAY");playCard(s,p,takeCard(p,c.card));endAction(s,"play")}
  if(c.t==="ability"){if(!abilityList(p).includes(c.ab)||!canAbility(s,p,c.ab,c.args))fail("BAD_ABILITY");p.used.push(c.ab);const a=c.args??{};
   if(COST[c.ab].d&&!p.hand.some(x=>x.id===a.discard))fail("NEED_DISCARD");
   ability(structuredClone(s),{k:"ability",seat:c.seat,ab:c.ab,args:a,free:false}); // 先试算，非法目标在这里拒绝
   endAction(s,"ability");s.stack.push({k:"ability",seat:c.seat,ab:c.ab,args:a,free:false});
   const h=s.flags.helping;const cost=COST[c.ab];if(h!==undefined&&h!==c.seat&&(cost.o||cost.e))ask(s,h,"assist",{ab:c.ab})}
  run(s);return s}
 if(c.t==="call_vote"){if(s.phase!=="accuse"||p.killed||p.exiled)fail("BAD");s.phase="vote";s.votes={};return s}
 if(c.t==="end_accuse"){if(s.phase!=="accuse"||c.seat!==s.leader)fail("BAD");s.stage="end";run(s);return s}
 if(c.t==="vote"){if(s.phase!=="vote"||p.killed||p.exiled||s.votes[c.seat]!==undefined)fail("BAD");if(c.target!==null){const o=s.players[c.target];if(!o||o.killed||o.exiled||o===p)fail("BAD_TARGET")}s.votes[c.seat]=c.target;
  const voters=s.players.filter(x=>!x.killed&&!x.exiled);if(voters.every(x=>s.votes[x.seat]!==undefined)){const t=new Map<number|null,number>();for(const v of Object.values(s.votes))t.set(v,(t.get(v)??0)+1);const m=Math.max(...t.values()),l=[...t].filter(([,k])=>k===m);
   if(l.length===1&&l[0][0]!==null){const o=s.players[l[0][0] as number];o.exiled=true;o.revealed=true;say(s,`座位${o.seat+1} 被放逐，身份 ${o.agenda}`);const d=side(o);addO(s,d==="menace"?2:d==="neutral"?-2:-3)}else say(s,"无人被放逐");s.phase="accuse";s.stage="end"}
  run(s);return s}
 return fail("BAD_COMMAND")}
/** 当前必须操作的座位（用于界面提示与模拟） */
export function waitingFor(s:State):number[]{if(s.phase==="over")return[];const t=s.stack[s.stack.length-1];if(t&&t.k==="ask")return[t.seat];if(s.phase==="setup")return s.players.filter(p=>p.choices.length&&!p.character).map(p=>p.seat);const a=actor(s);if(a!==null)return[a];if(s.phase==="accuse")return s.players.filter(p=>p.seat===s.leader).map(p=>p.seat);if(s.phase==="vote")return s.players.filter(p=>!p.killed&&!p.exiled&&s.votes[p.seat]===undefined).map(p=>p.seat);return[]}
export function viewFor(s:State,seat:number){const over=s.phase==="over";const t=s.stack[s.stack.length-1];
 return{phase:s.phase,mode:s.mode,round:s.round,leader:s.leader,oxygen:s.oxygen,energy:s.energy,armed:undefined,you:seat,hand:s.players[seat]?.hand,aside:s.players[seat]?.aside,choices:s.players[seat]?.choices,agenda:s.players[seat]?.agenda,notes:s.notes[seat],deckCount:s.players[seat]?.deck.length,
 players:s.players.map(p=>({seat:p.seat,character:p.character,wounds:p.wounds,exiled:p.exiled,killed:p.killed,hand:p.hand.length,deck:p.deck.length,used:p.used,played:s.played.filter(x=>x.seat===p.seat).length,agenda:over||p.revealed||p.seat===seat?p.agenda:null})),
 revealed:s.revealed.map(r=>r.card.type),remaining:s.queue.length,waiting:waitingFor(s),question:t&&t.k==="ask"&&t.seat===seat?{q:t.q,data:t.data}:null,log:s.log.slice(-30),winner:s.winner,winners:s.winners,voted:Object.keys(s.votes).length}}
