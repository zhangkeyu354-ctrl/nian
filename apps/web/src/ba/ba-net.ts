import { useEffect,useRef,useState } from 'react';
import { io,type Socket } from 'socket.io-client';
import type { Settlement } from '../../../../packages/black-a-510k/src/settlement.js';

export interface BASnapshot {
  code:string;seriesId:string;roundId:number;version:number;phase:'LOBBY'|'PLAY'|'EXCHANGE'|'RESULT'|'ABORTED';
  self:number|null;hostId:string|null;players:{id:string;name:string;seat:number;ready:boolean;online:boolean}[];
  options:{firstLead:'CONTAINS_D3'|'OWNER_ANY';soloScoreBasis:'FINAL'|'BASE';advanceExchange:boolean;turnSeconds:0|15|30|45|60;returnSeconds:30|45|60};
  deadline:number|null;
  round:{phase:'PLAY'|'RESULT';version:number;turnId:number;trickId:number;currentActor:number|null;hand:string[]|null;handCounts:number[];capturedScores:number[];tableCards:string[];tableScore:number;lastPlay:{actor:number;cards:string[]}|null;finishedOrder:number[];result:Settlement|null}|null;
  exchange:{phase:'DRAW_PENDING'|'RETURN_PENDING'|'COMPLETE';transactionIndex:number;transactionCount:number;pair:{winner:number;loser:number;count:number}|null;completed:number;hand:string[]|null;handCounts:number[];returnCount:number|null}|null;
}
type Ack<T>={ok:true}&T|{ok:false;error:string};
const tokenKey=(code:string)=>'ba-seat-'+code;
const get=(key:string)=>{try{return localStorage.getItem(key)}catch{return null}};
const set=(key:string,value:string)=>{try{localStorage.setItem(key,value)}catch{}};
let shared:Socket|null=null;
const socket=()=>shared??=io({transports:['websocket','polling']});
const call=<T>(event:string,payload:unknown)=>new Promise<Ack<T>>(resolve=>socket().timeout(8000).emit(event,payload,(err:unknown,response:Ack<T>)=>resolve(err?{ok:false,error:'连接超时，请检查网络。'}:response)));
const callAction=async<T>(payload:unknown):Promise<Ack<T>>=>{
  const first=await call<T>('ba:action',payload);
  if(first.ok||first.error!=='连接超时，请检查网络。')return first;
  return call<T>('ba:action',payload);
};
export const createBARoom=()=>call<{code:string}>('ba:create',{});
export const savedBAName=()=>get('ba-name')??'';

export function useBARoom(code:string){
  const [snap,setSnap]=useState<BASnapshot|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false);
  const latest=useRef<BASnapshot|null>(null);
  const accept=(next:BASnapshot)=>{if(next.code!==code)return;if(latest.current&&latest.current.roundId===next.roundId&&latest.current.version>next.version)return;latest.current=next;setSnap(next)};
  const join=async()=>{const r=await call<{snapshot:BASnapshot}>('ba:join',{code,token:get(tokenKey(code))});if(r.ok){accept(r.snapshot);setError('')}else setError(r.error)};
  useEffect(()=>{const s=socket();const update=(v:BASnapshot)=>accept(v);const onConnect=()=>{setConnected(true);void join()};const onDisconnect=()=>setConnected(false);s.on('ba:update',update);s.on('connect',onConnect);s.on('disconnect',onDisconnect);if(s.connected)onConnect();return()=>{s.off('ba:update',update);s.off('connect',onConnect);s.off('disconnect',onDisconnect)}},[code]);
  const claim=async(name:string)=>{const r=await call<{token:string;snapshot:BASnapshot}>('ba:claim',{code,name});if(!r.ok)return r.error;set(tokenKey(code),r.token);set('ba-name',name);accept(r.snapshot);return null};
  const ready=async(value:boolean)=>{const r=await call<{snapshot:BASnapshot}>('ba:ready',{code,token:get(tokenKey(code)),ready:value,actionId:crypto.randomUUID()});if(r.ok)accept(r.snapshot);return r.ok?null:r.error};
  const configure=async(options:Partial<BASnapshot['options']>)=>{const r=await call<{snapshot:BASnapshot}>('ba:configure',{code,token:get(tokenKey(code)),options});if(r.ok)accept(r.snapshot);return r.ok?null:r.error};
  const leave=async()=>{const r=await call<{snapshot:BASnapshot}>('ba:leave',{code,token:get(tokenKey(code))});if(r.ok){try{localStorage.removeItem(tokenKey(code))}catch{};location.href='/'}return r.ok?null:r.error};
  const action=async(a:{kind:'PLAY';cards:string[]}|{kind:'PASS'}|{kind:'RETURN';cards:string[]})=>{
    if(!snap)return '尚未同步';
    const r=await callAction<{snapshot:BASnapshot}>({code,token:get(tokenKey(code)),roundId:snap.roundId,actionId:crypto.randomUUID(),expectedVersion:snap.version,turnId:snap.round?.turnId,transactionIndex:snap.exchange?.transactionIndex,action:a});
    if(r.ok)accept(r.snapshot);return r.ok?null:r.error;
  };
  return {snap,error,connected,claim,ready,configure,action,leave};
}
