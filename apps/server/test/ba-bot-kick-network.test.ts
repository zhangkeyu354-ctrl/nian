import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {describe,expect,it} from 'vitest';
import {Server} from 'socket.io';
import {io as clientIo,type Socket} from 'socket.io-client';
import {attachBlackA510K,BA_EVENTS} from '../src/ba-rooms.js';

describe('black A host controls over Socket.IO',()=>{
  it('adds private server bots and invalidates a kicked seat before start',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-bot-kick-'));
    const http=createServer(),io=new Server(http),store=attachBlackA510K(io,dir,{maxRooms:10,idleMs:60_000});
    const sockets:Socket[]=[];
    try{
      await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${(http.address() as AddressInfo).port}`;
      const connect=async()=>{const socket=clientIo(url,{transports:['websocket'],reconnection:false});sockets.push(socket);await new Promise<void>(resolve=>socket.once('connect',resolve));return socket};
      const send=<T>(socket:Socket,event:string,data:object)=>new Promise<T>(resolve=>socket.emit(event,data,resolve));
      const hostSocket=await connect(),guestSocket=await connect();
      const created=await send<{ok:boolean;code:string}>(hostSocket,BA_EVENTS.create,{}),code=created.code;
      const host=await send<{ok:boolean;token:string}>(hostSocket,BA_EVENTS.claim,{code,name:'房主'});
      const guest=await send<{ok:boolean;token:string}>(guestSocket,BA_EVENTS.claim,{code,name:'朋友'});
      const room=store.rooms.get(code)!;
      expect((await send<{ok:boolean}>(guestSocket,BA_EVENTS.addBot,{code,token:guest.token})).ok).toBe(false);
      expect((await send<{ok:boolean}>(hostSocket,BA_EVENTS.addBot,{code,token:host.token})).ok).toBe(true);
      expect(room.snapshot(null).players.map(p=>p.bot)).toEqual([false,false,true]);
      expect(JSON.stringify(room.snapshot(null))).not.toContain(room.file.players[2].token);
      expect((await send<{ok:boolean}>(guestSocket,BA_EVENTS.kick,{code,token:guest.token,playerId:room.file.players[0].id})).ok).toBe(false);
      const kickedEvent=new Promise<{code:string}>(resolve=>guestSocket.once(BA_EVENTS.kicked,resolve));
      const kicked=await send<{ok:boolean}>(hostSocket,BA_EVENTS.kick,{code,token:host.token,playerId:room.file.players[1].id});
      expect(kicked.ok).toBe(true);expect(await kickedEvent).toEqual({code});
      const stale=await send<{ok:boolean;snapshot:any}>(guestSocket,BA_EVENTS.join,{code,token:guest.token});
      expect(stale.ok).toBe(true);expect(stale.snapshot.self).toBeNull();
      expect((await send<{ok:boolean}>(guestSocket,BA_EVENTS.ready,{code,token:guest.token,ready:true,actionId:'stale'})).ok).toBe(false);
      expect(room.file.players.map(p=>p.name)).toEqual(['房主','人机1']);
      expect(room.file.phase).toBe('LOBBY');
    }finally{
      sockets.forEach(socket=>socket.disconnect());store.close();
      await new Promise<void>(resolve=>io.close(()=>resolve()));
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
