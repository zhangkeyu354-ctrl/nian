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
import {startRound} from '../../../packages/black-a-510k/src/round.js';

type Scenario={name:string;blackOwners:number[];blackCaptured:number;expectedWinner:'BLACK_A'|'OTHER';transactions:number;drawCount:number};
const scenarios:Scenario[]=[
  {name:'2v2 ordinary reward',blackOwners:[0,2],blackCaptured:35,expectedWinner:'BLACK_A',transactions:2,drawCount:2},
  {name:'solo win with transfer',blackOwners:[0],blackCaptured:0,expectedWinner:'BLACK_A',transactions:3,drawCount:2},
  {name:'2v2 shaved reward',blackOwners:[0,2],blackCaptured:0,expectedWinner:'OTHER',transactions:2,drawCount:4},
  {name:'solo shaved loss',blackOwners:[0],blackCaptured:0,expectedWinner:'OTHER',transactions:3,drawCount:4},
];

describe('four real socket clients in constructed decisive cases',()=>{
  for(const scenario of scenarios)it(scenario.name,async()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-constructed-'));
    const http=createServer(),io=new Server(http),store=attachBlackA510K(io,dir,{maxRooms:10,idleMs:60_000});
    const sockets:Socket[]=[];
    try{
      await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${(http.address() as AddressInfo).port}`;
      const connect=async()=>{const socket=clientIo(url,{transports:['websocket'],reconnection:false});sockets.push(socket);await new Promise<void>(resolve=>socket.once('connect',resolve));return socket};
      const send=<T>(socket:Socket,event:string,data:object)=>new Promise<T>(resolve=>socket.emit(event,data,resolve));
      const clients=await Promise.all([connect(),connect(),connect(),connect()]);
      const created=await send<{ok:boolean;code:string}>(clients[0],BA_EVENTS.create,{});
      expect(created.ok).toBe(true);const code=created.code;
      const tokens:string[]=[];
      for(let seat=0;seat<4;seat++){
        const claim=await send<{ok:boolean;token:string}>(clients[seat],BA_EVENTS.claim,{code,name:`玩家${seat}`});
        expect(claim.ok).toBe(true);tokens.push(claim.token);
      }
      const room=store.rooms.get(code)!;
      const deck=createDeck();
      const scoring=deck.filter(card=>card.points>0).sort((a,b)=>b.points-a.points);
      const chosen:string[]=[];let score=scenario.blackCaptured;
      for(const card of scoring)if(card.points<=score){chosen.push(card.id);score-=card.points;}
      expect(score).toBe(0);
      const terminal='3D',tail='4D';
      const rest=deck.map(card=>card.id).filter(id=>id!==terminal&&id!==tail&&!chosen.includes(id));
      const full=deck.map(card=>card.id);
      const round=startRound([full.slice(0,13),full.slice(13,26),full.slice(26,39),full.slice(39,52)]);
      round.hands=[[],[],[terminal],[tail]];
      round.capturedPiles=[chosen,rest,[],[]];
      round.finishedOrder=scenario.name==='solo shaved loss'?[1,0]:[0,1];round.currentActor=2;round.firstLeadPending=false;
      round.blackAOwners=[...scenario.blackOwners];
      room.file.roundId=1;room.file.phase='PLAY';room.file.round=round;room.file.version++;room.save();
      const played=await send<{ok:boolean;snapshot:any}>(clients[2],BA_EVENTS.action,{code,token:tokens[2],roundId:1,actionId:'terminal',expectedVersion:room.file.version,turnId:round.turnId,action:{kind:'PLAY',cards:[terminal]}});
      expect(played.ok).toBe(true);
      expect(played.snapshot.phase).toBe('RESULT');
      expect(played.snapshot.round.result.winningTeam).toBe(scenario.expectedWinner);
      expect(played.snapshot.round.result.ledger.reduce((n:number,row:any)=>n+row.finalScore,0)).toBe(100);
      const result=JSON.stringify(played.snapshot.round.result);
      for(let seat=0;seat<4;seat++){
        const ready=await send<{ok:boolean}>(clients[seat],BA_EVENTS.ready,{code,token:tokens[seat],ready:true,actionId:`next-${seat}`});
        expect(ready.ok).toBe(true);
      }
      expect(room.file.phase).toBe('EXCHANGE');
      expect(room.file.exchange!.plan).toHaveLength(scenario.transactions);
      expect(room.file.exchange!.plan.every(pair=>pair.count===scenario.drawCount)).toBe(true);
      let completed=0,draws=0;
      while(String(room.file.phase)==='EXCHANGE'){
        const exchange=room.file.exchange!,pair=exchange.plan[exchange.transactionIndex];
        const batch=exchange.plan.length>1&&exchange.plan.every(p=>p.winner===exchange.plan[0].winner);
        if(exchange.phase==='DRAW_PENDING'){
          const winnerDrawView=await send<{ok:boolean;snapshot:any}>(clients[pair.winner],BA_EVENTS.join,{code,token:tokens[pair.winner]});
          expect(winnerDrawView.snapshot.exchange.faceDownCount).toBe(13);
          expect(winnerDrawView.snapshot.exchange.drawCount).toBe(scenario.drawCount);
          const drawn=await send<{ok:boolean}>(clients[pair.winner],BA_EVENTS.action,{code,token:tokens[pair.winner],roundId:room.file.roundId,actionId:`draw-${draws}`,expectedVersion:room.file.version,transactionIndex:exchange.transactionIndex,action:{kind:'DRAW',indices:Array.from({length:scenario.drawCount},(_,i)=>i)}});
          expect(drawn.ok).toBe(true);draws++;
          if(batch&&draws<exchange.plan.length)expect(room.file.exchange!.phase).toBe('DRAW_PENDING');
          continue;
        }
        const winner=await send<{ok:boolean;snapshot:any}>(clients[pair.winner],BA_EVENTS.join,{code,token:tokens[pair.winner]});
        const loser=await send<{ok:boolean;snapshot:any}>(clients[pair.loser],BA_EVENTS.join,{code,token:tokens[pair.loser]});
        if(!batch){
          expect(winner.snapshot.exchange.hand).toHaveLength(13+scenario.drawCount);
          expect(winner.snapshot.exchange.drawnIds).toHaveLength(scenario.drawCount);
          expect(loser.snapshot.exchange.drawnIds).toEqual(winner.snapshot.exchange.drawnIds);
        }else{
          expect(winner.snapshot.exchange.hand).toHaveLength(13+scenario.drawCount*(exchange.plan.length-completed));
          expect(loser.snapshot.exchange.drawnIds).toHaveLength(scenario.drawCount);
          for(const id of loser.snapshot.exchange.drawnIds)expect(winner.snapshot.exchange.drawnIds).toContain(id);
        }
        expect(loser.snapshot.exchange.hand).toHaveLength(13-scenario.drawCount);
        const returned=await send<{ok:boolean}>(clients[pair.winner],BA_EVENTS.action,{code,token:tokens[pair.winner],roundId:room.file.roundId,actionId:`return-${completed}`,expectedVersion:room.file.version,transactionIndex:exchange.transactionIndex,action:{kind:'RETURN',cards:winner.snapshot.exchange.hand.slice(0,scenario.drawCount)}});
        expect(returned.ok).toBe(true);
        completed++;
      }
      expect(completed).toBe(scenario.transactions);
      expect(room.file.phase).toBe('PLAY');
      expect(room.file.roundId).toBe(2);
      expect(room.file.round!.hands.map(hand=>hand.length)).toEqual([13,13,13,13]);
      expect(room.file.round!.blackAOwners).toEqual(room.file.round!.hands.map((hand,i)=>hand.includes('AS')||hand.includes('AC')?i:-1).filter(i=>i>=0));
      expect(JSON.stringify(room.file.history[0].result)).toBe(result);
      expect(room.file.nextPlan).toBeNull();
    }finally{
      sockets.forEach(socket=>socket.disconnect());store.close();
      await new Promise<void>(resolve=>io.close(()=>resolve()));
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
