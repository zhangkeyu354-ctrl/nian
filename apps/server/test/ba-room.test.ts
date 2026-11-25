import { describe,expect,it } from 'vitest';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BARoom } from '../src/ba-rooms.js';
import { createDeck,enumerateLegalPlays } from '../../../packages/black-a-510k/src/rules.js';
import { startExchange } from '../../../packages/black-a-510k/src/exchange.js';

describe('black A 510K authoritative room',()=>{
  it('lets only the host add bots and kick other seats before the first round',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const host=room.claim('房主').token,guest=room.claim('朋友').token;
      expect(()=>room.addBot(guest)).toThrow(/host/i);
      room.addBot(host);
      expect(room.snapshot(host).players.map(p=>p.bot)).toEqual([false,false,true]);
      expect(()=>room.kick(guest,room.file.players[0].id)).toThrow(/host/i);
      expect(()=>room.kick(host,room.file.players[0].id)).toThrow();
      room.kick(host,room.file.players[1].id);
      expect(room.snapshot(guest).self).toBeNull();
      expect(room.snapshot(host).players.map(p=>p.name)).toEqual(['房主','人机1']);
      room.addBot(host);room.addBot(host);
      expect(room.file.players).toHaveLength(4);
      expect(()=>room.addBot(host)).toThrow();
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('runs three server bots through play, result readiness and exchange without client tokens',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir),host=room.claim('真人').token;
      room.addBot(host);room.addBot(host);room.addBot(host);
      room.configure(host,{turnSeconds:0});
      expect(room.snapshot(null).players.every(p=>p.bot||p.seat===0)).toBe(true);
      expect(room.snapshot(null).round).toBeNull();
      room.ready(host,true,'begin');
      expect(room.file.phase).toBe('PLAY');
      let botActions=0,humanActions=0;
      for(let n=0;n<500&&room.file.phase==='PLAY';n++){
        const s=room.file.round!,actor=s.currentActor!;
        if(room.file.players[actor].bot){expect(room.tick()).toBe(true);botActions++;continue}
        const hand=s.hands[actor],target=s.lastPlay?.cards??null;
        const plays=enumerateLegalPlays(hand,target,{mustContainD3:s.firstLeadPending&&s.options.firstLead==='CONTAINS_D3'});
        const action=plays.length?{kind:'PLAY' as const,cards:plays[0]}:{kind:'PASS' as const};
        room.act(host,{roundId:room.file.roundId,actionId:'human-'+n,expectedVersion:room.file.version,turnId:s.turnId,action});humanActions++;
      }
      expect(botActions).toBeGreaterThan(0);expect(humanActions).toBeGreaterThan(0);
      expect(room.file.phase).toBe('RESULT');
      expect(room.file.players.slice(1).every(p=>p.ready)).toBe(true);
      room.ready(host,true,'next');
      for(let n=0;n<8&&room.file.phase==='EXCHANGE';n++){
        const e=room.file.exchange!,pair=e.plan[e.transactionIndex];
        if(room.file.players[pair.winner].bot)expect(room.tick()).toBe(true);
        else if(e.phase==='DRAW_PENDING')room.act(host,{roundId:room.file.roundId,actionId:'draw-'+n,expectedVersion:room.file.version,transactionIndex:e.transactionIndex,action:{kind:'DRAW',indices:Array.from({length:pair.count},(_,i)=>i)}});
        else room.act(host,{roundId:room.file.roundId,actionId:'return-'+n,expectedVersion:room.file.version,transactionIndex:e.transactionIndex,action:{kind:'RETURN',cards:e.hands[pair.winner].slice(0,pair.count)}});
      }
      expect(room.file.phase).toBe('PLAY');expect(room.file.roundId).toBe(2);
      expect(room.file.round!.hands.every(h=>h.length===13)).toBe(true);
      expect(room.snapshot(null).round?.hand).toBeNull();
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('transfers the host to a human and clears orphan bots when the last human leaves',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir),host=room.claim('房主').token;
      room.addBot(host);
      const guest=room.claim('朋友').token;
      room.leavePermanent(host);
      expect(room.file.hostId).toBe(room.file.players.find(p=>p.name==='朋友')?.id);
      room.addBot(guest);
      room.leavePermanent(guest);
      expect(room.file.players).toEqual([]);
      expect(room.file.hostId).toBeNull();
      const next=room.claim('新房主').token;
      room.addBot(next);
      expect(room.file.players).toHaveLength(2);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('seats four players, starts only when all ready, and hides hands',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      expect(()=>room.claim('第五人')).toThrow();
      tokens.slice(0,3).forEach((token,i)=>room.ready(token,true,`a${i}`));
      expect(room.file.phase).toBe('LOBBY');
      room.ready(tokens[3],true,'a3');
      expect(room.file.phase).toBe('PLAY');
      const a=room.snapshot(tokens[0]),b=room.snapshot(tokens[1]),spectator=room.snapshot(null);
      expect(a.round?.hand).toHaveLength(13);
      expect(b.round?.hand).toHaveLength(13);
      expect(spectator.round?.hand).toBeNull();
      expect(JSON.stringify(spectator)).not.toContain('blackAOwners');
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('rejects same action ID with changed payload and preserves state',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      tokens.forEach((token,i)=>room.ready(token,true,`r${i}`));
      const actor=room.file.round!.currentActor!;
      const token=tokens[actor]; const before=room.file.version;
      const action={kind:'PLAY' as const,cards:['3D']};
      const req={roundId:room.file.roundId,actionId:'same',expectedVersion:before,turnId:room.file.round!.turnId,action};
      const first=room.act(token,req);
      expect(room.act(token,req)).toEqual({...first,replayed:true});
      expect(room.file.version).toBe(before+1);
      expect(()=>room.act(token,{...req,action:{kind:'PASS' as const}})).toThrow(/conflict/i);
      expect(room.file.version).toBe(before+1);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('replays a ready request safely after the round has started',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      tokens.forEach((token,i)=>room.ready(token,true,`ready-${i}`));
      const roundId=room.file.roundId,version=room.file.version;
      room.ready(tokens[3],true,'ready-3');
      expect(room.file.roundId).toBe(roundId);
      expect(room.file.version).toBe(version);
      expect(()=>room.ready(tokens[3],false,'ready-3')).toThrow(/conflict/i);
      expect(room.file.version).toBe(version);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('restores committed state and receipts from the saved room',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      tokens.forEach((token,i)=>room.ready(token,true,`r${i}`));
      const actor=room.file.round!.currentActor!,token=tokens[actor];
      const req={roundId:room.file.roundId,actionId:'persisted',expectedVersion:room.file.version,turnId:room.file.round!.turnId,action:{kind:'PLAY' as const,cards:['3D']}};
      room.act(token,req);
      const restored=new BARoom(JSON.parse(readFileSync(join(dir,'ABCD.json'),'utf8')),dir);
      expect(restored.snapshot(token).round?.hand).toHaveLength(12);
      expect(restored.act(token,req).replayed).toBe(true);
      expect(restored.file.version).toBe(room.file.version);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('times out the first lead through the same play validator',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      tokens.forEach((token,i)=>room.ready(token,true,`r${i}`));
      expect(room.tick(room.file.deadline!+1)).toBe(true);
      expect(room.file.round?.lastPlay?.cards).toEqual(['3D']);
      expect(room.file.round?.currentActor).not.toBeNull();
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('keeps a separate 45-second trustee deadline when active timer is off',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      const host=tokens[0];room.configure(host,{turnSeconds:0});
      room.file.players.forEach(p=>room.connections.set(p.id,1));
      tokens.forEach((token,i)=>room.ready(token,true,`r${i}`));
      expect(room.file.deadline).toBeNull();
      const actor=room.file.round!.currentActor!,id=room.file.players[actor].id;
      room.connections.set(id,0);room.protectDisconnectedTurn(id);
      expect(room.file.deadline).not.toBeNull();
      expect(room.tick(room.file.deadline!+1)).toBe(true);
      expect(room.file.round?.lastPlay?.cards).toEqual(['3D']);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('cancels an unstarted exchange round when a participant permanently leaves',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      const cards=createDeck().map(c=>c.id);
      room.file.roundId=2;room.file.phase='EXCHANGE';room.file.exchange=startExchange([cards.slice(0,13),cards.slice(13,26),cards.slice(26,39),cards.slice(39,52)],[{winner:0,loser:1,count:4}]);
      const series=room.file.seriesId;
      expect(room.leavePermanent(tokens[1]).seatLocked).toBe(false);
      expect(room.file.phase).toBe('LOBBY');
      expect(room.file.exchange).toBeNull();
      expect(room.file.nextPlan).toBeNull();
      expect(room.file.roundId).toBe(0);
      expect(room.file.seriesId).not.toBe(series);
      expect(room.file.players).toHaveLength(3);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('commits terminal accounting and next-round reward only once under replay',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      tokens.forEach((token,i)=>room.ready(token,true,`r${i}`));
      let terminal:any=null;
      for(let step=0;step<300&&room.file.phase==='PLAY';step++){
        const round=room.file.round!,actor=round.currentActor!;
        const choices=enumerateLegalPlays(round.hands[actor],round.lastPlay?.cards??null,{mustContainD3:round.firstLeadPending&&room.file.options.firstLead==='CONTAINS_D3'});
        const action=choices.length?{kind:'PLAY' as const,cards:choices[0]}:{kind:'PASS' as const};
        const request={roundId:room.file.roundId,actionId:`step-${step}`,expectedVersion:room.file.version,turnId:round.turnId,action};
        room.act(tokens[actor],request);
        if(String(room.file.phase)==='RESULT')terminal={actor,request};
      }
      expect(room.file.phase).toBe('RESULT');
      expect(terminal).not.toBeNull();
      const version=room.file.version,result=structuredClone(room.file.round!.result),plan=structuredClone(room.file.nextPlan);
      expect(room.act(tokens[terminal.actor],terminal.request).replayed).toBe(true);
      expect(room.file.version).toBe(version);
      expect(room.file.round!.result).toEqual(result);
      expect(room.file.nextPlan).toEqual(plan);
      expect(room.tick(Date.now()+100_000)).toBe(false);
      expect(()=>room.act(tokens[terminal.actor],{...terminal.request,action:{kind:'PASS'}})).toThrow(/conflict/i);
      expect(room.file.round!.result).toEqual(result);
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
  it('auto-draws random cards after the 30s draw deadline',()=>{
    const dir=mkdtempSync(join(tmpdir(),'ba-room-'));
    try{
      const room=BARoom.create('ABCD',dir);
      const tokens=['甲','乙','丙','丁'].map(name=>room.claim(name).token);
      const cards=createDeck().map(c=>c.id);
      room.file.roundId=2;room.file.phase='EXCHANGE';
      room.file.exchange=startExchange([cards.slice(0,13),cards.slice(13,26),cards.slice(26,39),cards.slice(39,52)],[{winner:0,loser:1,count:2}]);
      room.file.deadline=Date.now()-1;
      expect(room.tick(Date.now())).toBe(true);
      expect(room.file.exchange?.phase).toBe('RETURN_PENDING');
      expect(room.file.exchange?.drawnIds).toHaveLength(2);
      expect(room.file.exchange?.hands[0]).toHaveLength(15);
      expect(room.file.exchange?.hands[1]).toHaveLength(11);
      expect(room.snapshot(tokens[0]).exchangeLogs?.[0]?.drawn).toHaveLength(2);
      expect(room.snapshot(tokens[2]).exchangeLogs?.[0]?.drawn).toBeNull();
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
});
