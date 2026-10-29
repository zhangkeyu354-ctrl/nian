import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFileSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve,extname} from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {testRace,reduceMA} from "../packages/magical-athlete/src/engine.ts";
import {viewForMA} from "../packages/magical-athlete/src/privacy.ts";
import type {MAState} from "../packages/magical-athlete/src/types.ts";
const out=resolve("output/ma-motion-lite"),build=join(out,"prod-build");mkdirSync(out,{recursive:true});
const fixtures=JSON.parse(readFileSync(join(out,"fixtures.json"),"utf8"));
function complete(before:MAState){let after=structuredClone(before);const snapshot=before.turn!.snapshot;for(let i=0;i<100;i++){const p=after.pending!;const option=p.options.find(o=>o.value!=="no"&&o.value!=="keep")??p.options[0];after=reduceMA(after,{type:"ANSWER",player:p.player,value:option.value});if(after.turn?.snapshot!==snapshot)break;}assert.notEqual(after.turn?.snapshot,snapshot);return{before:viewForMA(before,"p1"),after:viewForMA(after,"p1")};}
for(let value=1;value<=6;value++)fixtures[`die${value}`]=complete(testRace({racers:["banana","legs"],pos:[0,15],rolls:[value],skipSetup:true,secondWindPreview:true}));
fixtures.demo=complete(testRace({racers:["sw_magical_athlete","scoocher","party_animal","suckerfish"],pos:[4,8,9,8],rolls:[3,4,2,1],skipSetup:true,secondWindPreview:true}));
const server=createServer((req,res)=>{const p=new URL(req.url!,"http://localhost").pathname;if(p==="/fixtures.json"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(fixtures));return;}const f=p.startsWith("/assets/")?join(resolve("apps/web/public"),p):join(build,p.replace(/^\/prod\//,"")||"index.html");if(!existsSync(f)){res.writeHead(404).end();return;}res.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json"} as Record<string,string>)[extname(f)]??"application/octet-stream");res.end(readFileSync(f));});
await new Promise<void>(r=>server.listen(5199,"127.0.0.1",r));const browser=await chromium.launch({channel:"chromium"});
const errors:string[]=[],faces:number[]=[];
try{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript("globalThis.__name=(fn)=>fn;");
  const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  for(let value=1;value<=6;value++){
    await page.goto(`http://127.0.0.1:5199/prod/?scene=die${value}`);await page.waitForFunction(()=>(window as any).__maReady);await page.evaluate(()=>(window as any).__maPlay());
    await page.locator(`.ma-cube-scene[data-value="${value}"]`).waitFor();await page.waitForTimeout(260);
    const front=await page.locator(".ma-cube").evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);const normals=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,-1,0],[0,1,0]];return normals.map((n,i)=>({face:i+1,z:m.transformPoint(new DOMPoint(...n,0)).z})).sort((a,b)=>b.z-a.z)[0].face;});
    assert.equal(front,value,`server ${value} shows ${front}`);faces.push(front);
    if(value===6)await page.screenshot({path:join(out,"dice-6.png")});
  }await ctx.close();
  const videoCtx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,recordVideo:{dir:join(out,"video"),size:{width:390,height:844}}});
  await videoCtx.addInitScript("globalThis.__name=(fn)=>fn;");await videoCtx.addInitScript(()=>{localStorage.setItem("ma-speed","normal");localStorage.setItem("ma-muted","1");});
  const clip=await videoCtx.newPage();clip.on("pageerror",e=>errors.push(e.message));await clip.goto("http://127.0.0.1:5199/prod/?scene=demo");await clip.waitForFunction(()=>(window as any).__maReady);
  await clip.evaluate(()=>document.fonts.ready);await clip.evaluate(()=>(window as any).__maPlay());
  await clip.locator(".ma-skill-flight").waitFor({timeout:20000});
  const flight=await clip.locator(".ma-skill-flight").evaluate(el=>(el.getAnimations()[0].effect as KeyframeEffect).getKeyframes());
  assert.equal(flight[0].transform,flight.at(-1)?.transform);assert.ok(String(flight[0].transform).includes("scale(0.12)")||String(flight[0].transform).includes("scale(.12)"));
  await clip.waitForTimeout(16000);await clip.screenshot({path:join(out,"phone-chain.png")});const video=clip.video()!;await videoCtx.close();await video.saveAs(join(out,"phone-chain.webm"));
  assert.deepEqual(errors,[]);
  const ffmpeg=createRequire(import.meta.url)(resolve("work/ma-motion-tools/node_modules/ffmpeg-static"));
  const encoded=spawnSync(ffmpeg,["-y","-loglevel","error","-i",join(out,"phone-chain.webm"),"-t","20","-vf","fps=30,format=yuv420p","-c:v","libx264","-preset","veryfast","-crf","23","-movflags","+faststart",join(out,"phone-chain.mp4")],{encoding:"utf8"});assert.equal(encoded.status,0,encoded.stderr);
  writeFileSync(join(out,"ui-results.json"),JSON.stringify({faces,skillReturnMatchesOrigin:true,errors,video:"phone-chain.mp4",viewport:[390,844]},null,2));console.log("MA_LITE_PASS",JSON.stringify({faces,errors,video:"phone-chain.mp4"}));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
