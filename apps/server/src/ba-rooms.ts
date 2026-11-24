import { randomBytes,randomInt,randomUUID } from 'node:crypto';
import { mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Server,Socket } from 'socket.io';
import { createDeck } from '../../../packages/black-a-510k/src/rules.js';
import { applyAction,startRound,type RoundOptions,type RoundState } from '../../../packages/black-a-510k/src/round.js';
import { createExchangePlan,deterministicAutoReturn,drawForTransaction,returnCards,startExchange,type ExchangePair,type ExchangeState } from '../../../packages/black-a-510k/src/exchange.js';
import { viewExchange,viewRound } from '../../../packages/black-a-510k/src/privacy.js';

interface Player {id:string;token:string;name:string;ready:boolean}
interface Options extends RoundOptions {advanceExchange:boolean;turnSeconds:0|15|30|45|60;returnSeconds:30|45|60}
interface Receipt {digest:string;version:number}
interface BAFile {
  schema:1;game:'black-a-510k';code:string;seriesId:string;roundId:number;version:number;
  phase:'LOBBY'|'PLAY'|'EXCHANGE'|'RESULT'|'ABORTED';hostId:string|null;
  players:Player[];options:Options;round:RoundState|null;exchange:ExchangeState|null;
  nextPlan:ExchangePair[]|null;receipts:Record<string,Receipt>;deadline:number|null;
  history:{roundId:number;options:Options;result:NonNullable<RoundState['result']>;finishedOrder:number[]}[];
  createdAt:number;updatedAt:number;
}
type GameRequest={roundId:number;actionId:string;expectedVersion:number;turnId?:number;transactionIndex?:number;action:{kind:'PLAY';cards:string[]}|{kind:'PASS'}|{kind:'RETURN';cards:string[]}};
const validCode=(code:string)=>/^[A-Z2-9]{4}$/.test(code);
function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error(msg)}
const defaultOptions:Options={firstLead:'CONTAINS_D3',soloScoreBasis:'FINAL',advanceExchange:true,turnSeconds:45,returnSeconds:45};
function shuffleDeal(){const d=createDeck().map(c=>c.id);for(let i=d.length-1;i>0;i--){const j=randomInt(i+1);[d[i],d[j]]=[d[j],d[i]]}return [d.slice(0,13),d.slice(13,26),d.slice(26,39),d.slice(39,52)];}
const canonical=(req:GameRequest)=>JSON.stringify({roundId:req.roundId,expectedVersion:req.expectedVersion,turnId:req.turnId??null,transactionIndex:req.transactionIndex??null,kind:req.action.kind,cards:'cards'in req.action?[...req.action.cards].sort():[]});

export class BARoom {
  connections=new Map<string,number>();
  constructor(public file:BAFile,public directory:string){}
  static create(code:string,directory:string){
    assert(validCode(code),'invalid room code');
    const now=Date.now();
    return new BARoom({schema:1,game:'black-a-510k',code,seriesId:randomUUID(),roundId:0,version:0,phase:'LOBBY',hostId:null,players:[],options:{...defaultOptions},round:null,exchange:null,nextPlan:null,receipts:{},deadline:null,history:[],createdAt:now,updatedAt:now},directory);
  }
  private player(token:unknown){const p=typeof token==='string'?this.file.players.find(p=>p.token===token):undefined;assert(p,'invalid seat token');return p;}
  seat(token:unknown){return this.file.players.indexOf(this.player(token));}
  save(){this.file.updatedAt=Date.now();mkdirSync(this.directory,{recursive:true});const path=join(this.directory,this.file.code+'.json');writeFileSync(path+'.tmp',JSON.stringify(this.file),{mode:0o600});renameSync(path+'.tmp',path);}
  private mutate<T>(fn:()=>T):T{const old=structuredClone(this.file);try{const x=fn();this.save();return x}catch(error){this.file=old;throw error}}
  claim(name:string){return this.mutate(()=>{
    assert(this.file.phase==='LOBBY'&&this.file.roundId===0,'cannot claim seat during series');
    assert(this.file.players.length<4,'room full');const clean=String(name).trim().slice(0,16);assert(clean,'name required');
    const p:Player={id:randomUUID(),token:randomBytes(24).toString('base64url'),name:clean,ready:false};
    this.file.players.push(p);this.file.hostId??=p.id;this.file.version++;
    return {token:p.token,playerId:p.id,seat:this.file.players.length-1};
  })}
  configure(token:string,patch:Partial<Options>){return this.mutate(()=>{
    const p=this.player(token);assert(p.id===this.file.hostId,'host only');
    assert(this.file.phase==='LOBBY'&&this.file.roundId===0,'rules locked for series');
    const o={...this.file.options,...patch};
    assert(['CONTAINS_D3','OWNER_ANY'].includes(o.firstLead)&&['FINAL','BASE'].includes(o.soloScoreBasis)&&typeof o.advanceExchange==='boolean'&&[0,15,30,45,60].includes(o.turnSeconds)&&[30,45,60].includes(o.returnSeconds),'unsupported rules');
    this.file.options=o;this.file.players.forEach(p=>p.ready=false);this.file.version++;
  })}
  ready(token:string,ready:boolean,actionId:string){return this.mutate(()=>{
    const p=this.player(token);
    assert(typeof ready==='boolean'&&typeof actionId==='string'&&actionId.length>0,'bad ready action');
    const key=`${this.file.code}|${this.file.seriesId}|${p.id}|ready|${actionId}`;
    const digest=JSON.stringify({ready});
    const prior=this.file.receipts[key];
    if(prior){assert(prior.digest===digest,'action ID conflict');return}
    assert(this.file.phase==='LOBBY'||this.file.phase==='RESULT','not ready phase');
    p.ready=ready;this.file.version++;
    if(this.file.players.length===4&&this.file.players.every(p=>p.ready))this.startNext();
    this.file.receipts[key]={digest,version:this.file.version};
  })}
  leavePermanent(token:string){return this.mutate(()=>{
    const p=this.player(token);
    if(this.file.phase==='PLAY'){
      this.connections.set(p.id,0);this.protectDisconnectedTurn(p.id);
      return {seatLocked:true};
    }
    if(this.file.phase==='RESULT'&&this.file.round?.result)this.file.history.push({roundId:this.file.roundId,options:{...this.file.options},result:this.file.round.result,finishedOrder:[...this.file.round.finishedOrder]});
    this.file.players=this.file.players.filter(x=>x.id!==p.id);
    this.file.hostId=this.file.players[0]?.id??null;
    this.file.players.forEach(x=>x.ready=false);
    this.file.phase='LOBBY';this.file.round=null;this.file.exchange=null;this.file.nextPlan=null;
    this.file.deadline=null;this.file.roundId=0;this.file.seriesId=randomUUID();this.file.receipts={};
    this.file.version++;
    return {seatLocked:false};
  })}
  private startNext(){
    if(this.file.phase==='RESULT'&&this.file.round?.result)this.file.history.push({roundId:this.file.roundId,options:{...this.file.options},result:this.file.round.result,finishedOrder:[...this.file.round.finishedOrder]});
    this.file.roundId++;this.file.players.forEach(p=>p.ready=false);
    this.file.round=null;this.file.exchange=null;
    const dealt=shuffleDeal();
    if(this.file.nextPlan&&this.file.options.advanceExchange){
      this.file.exchange=startExchange(dealt,this.file.nextPlan);
      this.file.phase='EXCHANGE';this.drawNext();
    }else{this.file.round=startRound(dealt,this.file.options);this.file.phase='PLAY';this.setDeadline()}
    this.file.nextPlan=null;this.file.version++;
  }
  private drawNext(){
    const e=this.file.exchange!;const pair=e.plan[e.transactionIndex];const pool=[...e.hands[pair.loser]];
    for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]]}
    this.file.exchange=drawForTransaction(e,pool.slice(0,pair.count));
    this.file.deadline=Date.now()+this.file.options.returnSeconds*1000;
  }
  private setDeadline(){
    if(this.file.options.turnSeconds){this.file.deadline=Date.now()+this.file.options.turnSeconds*1000;return}
    const actor=this.file.round?.currentActor;
    const id=actor===null||actor===undefined?null:this.file.players[actor]?.id;
    this.file.deadline=id&&(this.connections.get(id)??0)===0?Date.now()+45000:null;
  }
  protectDisconnectedTurn(playerId:string){
    const actor=this.file.round?.currentActor;
    if(this.file.phase!=='PLAY'||actor===null||actor===undefined||this.file.players[actor]?.id!==playerId||(this.connections.get(playerId)??0)>0)return;
    const fallback=Date.now()+45000;
    if(this.file.deadline===null||fallback<this.file.deadline){this.file.deadline=fallback;this.save()}
  }
  act(token:string,req:GameRequest){return this.mutate(()=>{
    const seat=this.seat(token);const p=this.file.players[seat];
    assert(req&&Number.isInteger(req.roundId)&&req.roundId===this.file.roundId,'stale round');
    assert(typeof req.actionId==='string'&&req.actionId.length>=1&&req.actionId.length<=100,'invalid action ID');
    const key=`${this.file.code}|${this.file.seriesId}|${req.roundId}|${p.id}|${req.actionId}`;
    const digest=canonical(req),prior=this.file.receipts[key];
    if(prior){assert(prior.digest===digest,'action ID conflict');return {applied:true,version:prior.version,replayed:true};}
    assert(req.expectedVersion===this.file.version,'stale version');
    if(this.file.phase==='PLAY'){
      const state=this.file.round!;assert(req.turnId===state.turnId,'stale turn');
      assert(req.action.kind==='PLAY'||req.action.kind==='PASS','wrong action for phase');
      this.file.round=applyAction(state,req.action.kind==='PLAY'?{kind:'PLAY',actor:seat,cards:req.action.cards}:{kind:'PASS',actor:seat});
      if(this.file.round.phase==='RESULT'){
        this.file.phase='RESULT';this.file.deadline=null;
        const result=this.file.round.result!;
        const shaved=result.winningTeam==='BLACK_A'?result.shavedPenalty[1]:result.shavedPenalty[0];
        this.file.nextPlan=this.file.options.advanceExchange?createExchangePlan(result.winnerIds,result.loserIds,shaved):null;
      }else this.setDeadline();
    }else if(this.file.phase==='EXCHANGE'){
      const e=this.file.exchange!;const pair=e.plan[e.transactionIndex];
      assert(req.action.kind==='RETURN'&&seat===pair.winner&&req.transactionIndex===e.transactionIndex,'wrong exchange action');
      this.file.exchange=returnCards(e,req.action.cards);
      if(this.file.exchange.phase==='COMPLETE'){
        this.file.round=startRound(this.file.exchange.hands,this.file.options);
        this.file.exchange=null;this.file.phase='PLAY';this.setDeadline();
      }else this.drawNext();
    }else throw new Error('wrong phase');
    this.file.version++;
    const receipt={applied:true,version:this.file.version,replayed:false};
    this.file.receipts[key]={digest,version:this.file.version};
    return receipt;
  })}
  tick(now=Date.now()){if(this.file.deadline===null||now<this.file.deadline)return false;
    return this.mutate(()=>{
      if(this.file.phase==='PLAY'){
        const s=this.file.round!,actor=s.currentActor!;
        const action=s.lastPlay?{kind:'PASS' as const,actor}:{kind:'PLAY' as const,actor,cards:[s.firstLeadPending&&s.options.firstLead==='CONTAINS_D3'?'3D':s.hands[actor].slice().sort()[0]]};
        this.file.round=applyAction(s,action);
        if(this.file.round.phase==='RESULT'){
          this.file.phase='RESULT';const result=this.file.round.result!;
          const shaved=result.winningTeam==='BLACK_A'?result.shavedPenalty[1]:result.shavedPenalty[0];
          this.file.nextPlan=this.file.options.advanceExchange?createExchangePlan(result.winnerIds,result.loserIds,shaved):null;
          this.file.deadline=null;
        }else this.setDeadline();
      }else if(this.file.phase==='EXCHANGE'){
        const e=this.file.exchange!;this.file.exchange=returnCards(e,deterministicAutoReturn(e));
        if(this.file.exchange.phase==='COMPLETE'){
          this.file.round=startRound(this.file.exchange.hands,this.file.options);this.file.exchange=null;this.file.phase='PLAY';this.setDeadline();
        }else this.drawNext();
      }else{this.file.deadline=null;return false}
      this.file.version++;return true;
    });
  }
  snapshot(token:string|null){
    const p=token?this.file.players.find(x=>x.token===token):null;const seat=p?this.file.players.indexOf(p):null;
    return {code:this.file.code,seriesId:this.file.seriesId,roundId:this.file.roundId,version:this.file.version,phase:this.file.phase,
      self:seat,hostId:this.file.hostId,players:this.file.players.map((x,i)=>({id:x.id,name:x.name,seat:i,ready:x.ready,online:(this.connections.get(x.id)??0)>0})),
      options:{...this.file.options},deadline:this.file.deadline,
      round:this.file.round?viewRound(this.file.round,seat):null,exchange:this.file.exchange?viewExchange(this.file.exchange,seat):null,
      history:this.file.history??[]};
  }
}

export const BA_EVENTS={create:'ba:create',join:'ba:join',claim:'ba:claim',ready:'ba:ready',configure:'ba:configure',action:'ba:action',leave:'ba:leave',update:'ba:update'} as const;
export function attachBlackA510K(io:Server,directory:string,opts:{maxRooms:number;idleMs:number}){
  mkdirSync(directory,{recursive:true});const rooms=new Map<string,BARoom>();
  for(const name of readdirSync(directory)){
    if(!/^[A-Z2-9]{4}\.json$/.test(name))continue;
    try{const file=JSON.parse(readFileSync(join(directory,name),'utf8')) as BAFile;
      assert(file.schema===1&&file.game==='black-a-510k'&&file.code+'.json'===name&&file.players.length<=4,'bad save');
      file.history??=[];
      rooms.set(file.code,new BARoom(file,directory));
    }catch{console.warn('black A room recovery failed',name)}
  }
  const channel=(code:string)=>'ba:'+code;
  const broadcast=(r:BARoom)=>{for(const id of io.sockets.adapter.rooms.get(channel(r.file.code))??[]){const s=io.sockets.sockets.get(id);if(s)s.emit(BA_EVENTS.update,r.snapshot(s.data.baToken??null));}};
  const timer=setInterval(()=>{for(const r of rooms.values()){try{if(r.tick())broadcast(r)}catch(e){console.warn('black A room timer failed',r.file.code,e instanceof Error?e.message:'error')}}},250);timer.unref();
  io.engine.on('close',()=>clearInterval(timer));
  io.on('connection',(socket:Socket)=>{
    const leave=()=>{const r=socket.data.baRoom as BARoom|undefined;if(r){const token=socket.data.baToken as string|undefined;const p=r.file.players.find(p=>p.token===token);if(p){r.connections.set(p.id,Math.max(0,(r.connections.get(p.id)??1)-1));r.protectDisconnectedTurn(p.id)}socket.leave(channel(r.file.code));broadcast(r)}socket.data.baRoom=undefined;socket.data.baToken=undefined};
    const attach=(r:BARoom,token?:string)=>{leave();socket.data.baRoom=r;socket.data.baToken=token;const p=r.file.players.find(p=>p.token===token);if(p)r.connections.set(p.id,(r.connections.get(p.id)??0)+1);socket.join(channel(r.file.code))};
    const handle=(event:string,fn:(req:any)=>object)=>socket.on(event,(req:any,ack:any)=>{if(typeof ack!=='function')return;try{ack({ok:true,...fn(req??{})})}catch(e){ack({ok:false,error:e instanceof Error?e.message:'action failed'})}});
    const find=(code:unknown)=>{const r=typeof code==='string'?rooms.get(code.toUpperCase()):undefined;assert(r,'room not found');return r};
    handle(BA_EVENTS.create,()=>{assert(rooms.size<opts.maxRooms,'room limit');let code='';do{code=Array.from({length:4},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('')}while(rooms.has(code));const r=BARoom.create(code,directory);r.save();rooms.set(code,r);return {code}});
    handle(BA_EVENTS.join,req=>{const r=find(req.code);const token=typeof req.token==='string'&&r.file.players.some(p=>p.token===req.token)?req.token:undefined;attach(r,token);broadcast(r);return {snapshot:r.snapshot(token??null)}});
    handle(BA_EVENTS.claim,req=>{const r=find(req.code);const claim=r.claim(req.name);attach(r,claim.token);broadcast(r);return {...claim,snapshot:r.snapshot(claim.token)}});
    const authenticated=(req:any)=>{const r=find(req.code);assert(socket.data.baRoom===r&&socket.data.baToken===req.token&&r.file.players.some(p=>p.token===req.token),'reconnect required');return r};
    handle(BA_EVENTS.ready,req=>{const r=authenticated(req);r.ready(req.token,req.ready,req.actionId);broadcast(r);return {snapshot:r.snapshot(req.token)}});
    handle(BA_EVENTS.configure,req=>{const r=authenticated(req);r.configure(req.token,req.options);broadcast(r);return {snapshot:r.snapshot(req.token)}});
    handle(BA_EVENTS.leave,req=>{const r=authenticated(req);const result=r.leavePermanent(req.token);attach(r);broadcast(r);return {result,snapshot:r.snapshot(null)}});
    handle(BA_EVENTS.action,req=>{const r=authenticated(req);const result=r.act(req.token,req);broadcast(r);return {...result,snapshot:r.snapshot(req.token)}});
    socket.on('disconnect',leave);
  });
  return {rooms,close:()=>clearInterval(timer)};
}
