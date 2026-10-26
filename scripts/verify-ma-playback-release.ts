/** Real playback hook + real overlay: skipping podium must not skip stats. */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { testRace } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import { assertUiShot } from "./screenshot-check.ts";
const work = resolve("work/ma-release-playback").replaceAll("\\", "/");
const out = "output/ma-release/playback";
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const view = viewForMA(testRace({ racers: ["banana", "twin"], pos: [20, 25], skipSetup: true }), "p1");
view.log.push(
  { race: 0, text: "移动", fx: { kind: "move", racers: ["twin"], from: 0, to: 25, why: "主移动" } },
  { race: 0, text: "香蕉技能", fx: { kind: "power", racer: "banana", power: "banana" } },
  { race: 0, text: "摔倒", fx: { kind: "trip", racer: "twin" } },
);
writeFileSync(`${work}/view.json`, JSON.stringify(view));
writeFileSync(`${work}/entry.tsx`, `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{usePlayback,setSpeed}from'/src/ma/playback.ts';
import{Overlay}from'/src/ma/MagicalAthlete.tsx';import'/src/ma/ma.css';
const initial=await(await fetch('/@fs/${work}/view.json')).json();
setSpeed('normal');
function App(){const[v,setV]=useState(initial);const p=usePlayback(v);
return <main className="ma-app"><button id="play" onClick={()=>setV({...v,log:[...v.log,{race:0,text:'领奖台',fx:{kind:'podium',race:0,places:[{racer:'banana',owner:'p1',place:1,points:3},{racer:'twin',owner:'p2',place:2,points:1}]}}]})}>播放</button><output data-kind={p.show?.kind??'idle'}>{p.show?.kind??'idle'}</output>{p.show&&<Overlay show={p.show} view={v} name={id=>id} colorOf={()=>'#ffcc55'} me="p1" onSkip={p.skip}/>}</main>}
createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile: resolve("apps/web/vite.config.ts"), server: { port: 5195, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/src/ma/MagicalAthlete.tsx*", async route => {
      const r = await route.fetch();
      await route.fulfill({ response: r, body: await r.text() + "\nexport {Overlay};\n" });
    });
    await page.route("**/__playback-review", route => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module" src="/@fs/${work}/entry.tsx"></script></body></html>` }));
    await page.goto("http://127.0.0.1:5195/__playback-review");
    await page.locator("#play").click();
    await page.locator('[data-kind="podium"]').waitFor();
    await page.locator(".ma-overlay").click();
    await page.locator('[data-kind="stats"]').waitFor({ timeout: 2000 });
    await page.waitForTimeout(350);
    assert(await page.locator(".ma-ov-stats").isVisible(), "领奖台点击不得连带跳过数据榜");
    for (const name of ["跑得最远", "技能王", "倒退王", "摔跤王"]) assert.match(await page.locator(".ma-ov-stats").innerText(), new RegExp(name));
    await assertUiShot(page, `${out}/${viewport.width}-stats-after-podium-tap.png`);
    await page.locator(".ma-overlay").click();
    await page.locator('[data-kind="idle"]').waitFor({ timeout: 2000 });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`MA_PLAYBACK_RELEASE_PASS ${viewport.width}x${viewport.height}`);
  }
} finally { await browser.close(); await server.close(); }
