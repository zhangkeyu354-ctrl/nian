// @ts-nocheck
import { io } from "socket.io-client"; import { spawn, execSync } from "node:child_process"; import { mkdtempSync } from "node:fs";
const dir=mkdtempSync("/tmp/my-");const boot=async()=>{const p=spawn("npm",["run","server"],{env:{...process.env,PORT:"3184",MY_DATA_DIR:dir},detached:true,stdio:"ignore"});await new Promise(r=>setTimeout(r,7000));return p};
const call=(s,e,a={})=>new Promise(ok=>s.emit(e,a,ok));const conn=async()=>{const s=io("http://localhost:3184");await new Promise(r=>s.on("connect",r));return s};
let p=await boot();const S=[await conn(),await conn(),await conn()],T=[];const {code}=await call(S[0],"my:create");for(let i=0;i<3;i++)T[i]=(await call(S[i],"my:join",{code,name:"P"+i})).token;await call(S[0],"my:start");
const a0=(await call(S[1],"my:join",{code,token:T[1]})).snapshot;console.log("重连保持座位",a0.me===1);
const planId=a0.plans[0].id;await call(S[a0.actor],"my:cmd",{t:"PLAN",planId});const b=(await call(S[1],"my:join",{code,token:T[1]})).snapshot;
S.forEach(s=>s.close());process.kill(-p.pid);try{execSync("pkill -f apps/server")}catch{};await new Promise(r=>setTimeout(r,1500));p=await boot();
const s2=await conn();const c=(await call(s2,"my:join",{code,token:T[1]})).snapshot;console.log("重启恢复",c.phase===b.phase&&c.planId===b.planId&&JSON.stringify(c.players[1].hand)===JSON.stringify(b.players[1].hand));process.kill(-p.pid);process.exit(0);
