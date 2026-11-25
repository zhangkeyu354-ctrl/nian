import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {describe,expect,it} from 'vitest';
import {Server} from 'socket.io';
import {io as clientIo,type Socket} from 'socket.io-client';
import {attachBlackA510K,BA_EVENTS} from '../src/ba-rooms.js';
import {createDeck} from '../../../packages/black-a-510k/src/rules.js';
import {startExchange,prepareFaceDownPool,drawForTransaction} from '../../../packages/black-a-510k/src/exchange.js';

describe('black A 510K private data over the actual socket protocol',()=>{
  it('filters broadcasts, spectator, reconnect and error responses before reveal',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-privacy-'));
    const http=createServer(),io=new Server(http);
    const store=attachBlackA510K(io,dir,{maxRooms:10,idleMs:60_000});
    const sockets:Socket[]=[];
    try{
      await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${(http.address() as AddressInfo).port}`;
      const connect=async()=>{const socket=clientIo(url,{transports:['websocket'],reconnection:false});sockets.push(socket);await new Promise<void>(resolve=>socket.once('connect',resolve));return socket};
      const send=<T>(socket:Socket,event:string,data:object)=>new Promise<T>(resolve=>socket.emit(event,data,resolve));
      const clients=await Promise.all([connect(),connect(),connect(),connect()]);
      const created=await send<{ok:boolean;code:string}>(clients[0],BA_EVENTS.create,{});
      expect(created.ok).toBe(true);
      const code=created.code,token:string[]=[];
      const broadcasts:unknown[][]=[[],[],[],[]];
      clients.forEach((socket,i)=>socket.on(BA_EVENTS.update,snapshot=>broadcasts[i].push(snapshot)));
      for(let i=0;i<4;i++){
        const claim=await send<{ok:boolean;token:string}>(clients[i],BA_EVENTS.claim,{code,name:`玩家${i}`});
        expect(claim.ok).toBe(true);token.push(claim.token);
      }
      for(let i=0;i<4;i++){
        const ready=await send<{ok:boolean}>(clients[i],BA_EVENTS.ready,{code,token:token[i],ready:true,actionId:`ready-${i}`});
        expect(ready.ok).toBe(true);
      }
      const room=store.rooms.get(code)!;
      expect(room.file.phase).toBe('PLAY');
      const hands=room.file.round!.hands;
      const assertPrivate=(snapshot:any,seat:number|null)=>{
        const currentHands=room.file.round!.hands;
        expect(snapshot.phase).toBe('PLAY');
        expect(snapshot.round.hand).toEqual(seat===null?null:currentHands[seat]);
        expect(snapshot.round.result).toBeNull();
        expect(snapshot.round).not.toHaveProperty('blackAOwners');
        expect(snapshot.round).not.toHaveProperty('hands');
        expect(snapshot.round).not.toHaveProperty('capturedPiles');
        const wire=JSON.stringify(snapshot);
        for(let other=0;other<4;other++)if(other!==seat)for(const card of currentHands[other])expect(wire).not.toContain(`"${card}"`);
      };
      for(let i=0;i<4;i++){
        const response=await send<{ok:boolean;snapshot:unknown}>(clients[i],BA_EVENTS.join,{code,token:token[i]});
        expect(response.ok).toBe(true);assertPrivate(response.snapshot,i);
        expect(broadcasts[i].some((item:any)=>item.phase==='PLAY')).toBe(true);
        for(const item of broadcasts[i].filter((item:any)=>item.phase==='PLAY'))assertPrivate(item,i);
      }
      const spectator=await connect();
      const watched=await send<{ok:boolean;snapshot:unknown}>(spectator,BA_EVENTS.join,{code});
      expect(watched.ok).toBe(true);assertPrivate(watched.snapshot,null);
      const actor=room.file.round!.currentActor!,foreign=hands[(actor+1)%4][0];
      const failed=await send<{ok:boolean;error:string}>(clients[actor],BA_EVENTS.action,{code,token:token[actor],roundId:room.file.roundId,actionId:'bad-card',expectedVersion:room.file.version,turnId:room.file.round!.turnId,action:{kind:'PLAY',cards:[foreign]}});
      expect(failed.ok).toBe(false);
      expect(JSON.stringify(failed)).not.toContain(`"${foreign}"`);
      expect(room.file.round!.hands).toEqual(hands);
      const played=await send<{ok:boolean}>(clients[actor],BA_EVENTS.action,{code,token:token[actor],roundId:room.file.roundId,actionId:'first-public-play',expectedVersion:room.file.version,turnId:room.file.round!.turnId,action:{kind:'PLAY',cards:['3D']}});
      expect(played.ok).toBe(true);
      expect(room.file.round!.tableCards).toEqual(['3D']);
      for(let i=0;i<4;i++){
        const current=await send<{ok:boolean;snapshot:unknown}>(clients[i],BA_EVENTS.join,{code,token:token[i]});
        expect(current.ok).toBe(true);assertPrivate(current.snapshot,i);
        assertPrivate(broadcasts[i].at(-1),i);
      }
      const watchedAfter=await send<{ok:boolean;snapshot:unknown}>(spectator,BA_EVENTS.join,{code});
      expect(watchedAfter.ok).toBe(true);assertPrivate(watchedAfter.snapshot,null);
      clients[0].disconnect();
      const reconnected=await connect();
      const restored=await send<{ok:boolean;snapshot:unknown}>(reconnected,BA_EVENTS.join,{code,token:token[0]});
      expect(restored.ok).toBe(true);assertPrivate(restored.snapshot,0);
      const deck=createDeck().map(card=>card.id);
      const nextHands=[deck.slice(0,13),deck.slice(13,26),deck.slice(26,39),deck.slice(39,52)];
      const drawn=nextHands[1].slice(0,4);
      room.file.round=null;room.file.phase='EXCHANGE';room.file.roundId++;
      room.file.exchange=prepareFaceDownPool(startExchange(nextHands,[{winner:0,loser:1,count:4}]),[...nextHands[1]].reverse());
      for(let i=0;i<4;i++){
        const active=i===0?reconnected:clients[i];
        const drawView=await send<{ok:boolean;snapshot:any}>(active,BA_EVENTS.join,{code,token:token[i]});
        expect(drawView.ok).toBe(true);
        expect(drawView.snapshot.exchange.faceDownCount).toBe(13);
        expect(drawView.snapshot.exchange).not.toHaveProperty('faceDownPool');
        if(i!==1)for(const card of nextHands[1])expect(JSON.stringify(drawView.snapshot)).not.toContain(`"${card}"`);
      }
      room.file.exchange=drawForTransaction(room.file.exchange,drawn);
      room.file.exchangeLogs=[...(room.file.exchange.logs??[])];
      for(let i=0;i<4;i++){
        const active=i===0?reconnected:clients[i];
        const response=await send<{ok:boolean;snapshot:any}>(active,BA_EVENTS.join,{code,token:token[i]});
        expect(response.ok).toBe(true);
        expect(response.snapshot.exchange.hand).toEqual(room.file.exchange.hands[i]);
        expect(response.snapshot.exchange).not.toHaveProperty('hands');
        expect(response.snapshot.exchange).not.toHaveProperty('drawn');
        if(i>=2)for(const card of drawn)expect(JSON.stringify(response.snapshot)).not.toContain(`"${card}"`);
      }
      const exchangeSpectator=await send<{ok:boolean;snapshot:any}>(spectator,BA_EVENTS.join,{code});
      expect(exchangeSpectator.ok).toBe(true);
      expect(exchangeSpectator.snapshot.exchange.hand).toBeNull();
      for(const card of drawn)expect(JSON.stringify(exchangeSpectator.snapshot)).not.toContain(`"${card}"`);
    }finally{
      sockets.forEach(socket=>socket.disconnect());store.close();
      await new Promise<void>(resolve=>io.close(()=>resolve()));
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
