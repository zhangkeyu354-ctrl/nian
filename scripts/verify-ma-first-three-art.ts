/** Local visual fixtures render the real Track/Card/Overlay components.
 * Only the intercepted dev module exports private components for this review;
 * no review route, fixture state or extra exports enter the production app.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
import { chromium } from "playwright";
import { createServer } from "vite";
import { testRace } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import { assertUiShot } from "./screenshot-check.ts";
import { SECOND_WIND_PREVIEW_IDS } from "../packages/magical-athlete/src/second-wind-preview.ts";

const batchTwo = process.env.MA_REVIEW_BATCH === "2";
const out = `docs/magical-athlete/second-wind/${batchTwo ? "batch-two-screens" : "first-three-fix-screens"}`;
const work = resolve("work/ma-first-three-review");
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });
const reviewIds = batchTwo ? SECOND_WIND_PREVIEW_IDS.slice(3) : SECOND_WIND_PREVIEW_IDS.slice(0, 3);
const ids = [...reviewIds, "banana", "alchemist", "twin"];
const state = testRace({
  racers: ids,
  pos: ids.map((_, i) => (i < 3 ? 6 : 4 + i)),
  tripped: ids.map((_, i) => i === 2),
  track: "wild",
  skipSetup: true,
  secondWindPreview: true,
});
writeFileSync(`${work}/view.json`, JSON.stringify(viewForMA(state, "p1")));
writeFileSync(
  `${work}/entry.tsx`,
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Track,PLAYER_COLORS} from '/src/ma/Track.tsx';
import {RacerCard,Overlay} from '/src/ma/MagicalAthlete.tsx';
import '/src/ma/ma.css';
const view=await (await fetch('/@fs/${work.replaceAll("\\", "/")}/view.json')).json();
const ids=${JSON.stringify(ids)};
const reviewIds=${JSON.stringify(reviewIds)};
const firstThree=${JSON.stringify(SECOND_WIND_PREVIEW_IDS.slice(0, 3))};
const colorOf=id=>PLAYER_COLORS[view.seats.indexOf(id)];
const name=id=>view.players.find(p=>p.id===id)?.name??id;
const root=createRoot(document.getElementById('root'));
window.review=(mode)=>{
 const powerId=mode.startsWith('power:')?mode.slice(6):reviewIds[0];
 let show=mode.startsWith('power')?{kind:'power',racer:powerId,power:powerId,text:'接入标准技能卡显示检查'}:mode==='stats'?{kind:'stats',race:0,rows:reviewIds.map((racer,i)=>({racer,owner:'p'+(i+1),forward:i===2?20:20-i,back:i,powers:i===3?4:1,trips:i===1?3:0}))}:null;
 root.render(<div className="ma-app"><h2 style={{padding:12}}>角色接入 · 组件截图夹具</h2>{mode==='cards'?<div style={{display:'flex',gap:12,flexWrap:'wrap',padding:12}}>{['alchemist',...reviewIds].map(id=><div style={{width:220}} key={id}><RacerCard id={id}/></div>)}</div>:mode==='tokens'||mode==='borders'?<div style={{display:'flex',gap:24,padding:20,alignItems:'end',background:'#eee'}}>{['alchemist',...(mode==='borders'?firstThree:reviewIds)].map(id=><figure key={id} style={{margin:0,color:'#111',textAlign:'center'}}><img src={'/assets/magical-athlete/tokens/'+id+'.png'} style={{height:238,width:'auto',display:'block'}}/><figcaption>{id}</figcaption><img src={'/assets/magical-athlete/portraits/'+id+'.webp'} width="234" height="172" style={{objectFit:'cover'}}/></figure>)}</div>:<Track race={view.race} colorOf={colorOf} me="p1" layout={mode==='grid'?'grid':'art'} fit={true} onPawn={()=>{}}/>}{show&&<Overlay show={show} view={view} name={name} colorOf={colorOf} me="p1" onSkip={()=>{}}/>}</div>);
};
window.review('grid');
`,
);
const server = await createServer({ configFile: resolve("apps/web/vite.config.ts"), server: { port: 5194, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  // tsx keeps names in nested functions serialized by page.evaluate.
  await page.addInitScript("globalThis.__name = (fn) => fn;");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/ma/MagicalAthlete.tsx*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + "\nexport {RacerCard,Overlay};\n" });
  });
  await page.route("**/__ma-review", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module" src="/@fs/${work.replaceAll("\\", "/")}/entry.tsx"></script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5194/__ma-review");
  await page.locator(".ma-grid").waitFor();
  const metrics = await page.evaluate(async (ids) => {
    const results = [];
    for (const id of ids) {
      const load = async (path: string) => {
        const image = new Image();
        image.src = "/assets/magical-athlete/" + path;
        await image.decode();
        return image;
      };
      const token = await load("tokens/" + id + ".png");
      const portrait = await load("portraits/" + id + ".webp");
      const card = await load("cards/zh/" + id + ".webp");
      const canvas = document.createElement("canvas");
      canvas.width = token.width;
      canvas.height = token.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(token, 0, 0);
      const data = ctx.getImageData(0, 0, token.width, token.height).data;
      let minX = token.width,
        minY = token.height,
        maxX = -1,
        maxY = -1,
        transparent = 0,
        coloredBoundaryPixels = 0;
      for (let y = 0; y < token.height; y++)
        for (let x = 0; x < token.width; x++) {
          const alpha = data[(y * token.width + x) * 4 + 3];
          const offset = (y * token.width + x) * 4;
          const rgb = [data[offset], data[offset + 1], data[offset + 2]];
          const edge = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ].some(([dx, dy]) => {
            const nx = x + dx,
              ny = y + dy;
            return nx < 0 || nx >= token.width || ny < 0 || ny >= token.height || data[(ny * token.width + nx) * 4 + 3] < 32;
          });
          if (alpha > 128 && edge && Math.max(...rgb) > 150 && Math.max(...rgb) - Math.min(...rgb) > 70) coloredBoundaryPixels++;
          if (alpha === 0) transparent++;
          if (alpha > 8) {
            minX = Math.min(x, minX);
            minY = Math.min(y, minY);
            maxX = Math.max(x, maxX);
            maxY = Math.max(y, maxY);
          }
        }
      results.push({
        id,
        token: [token.width, token.height],
        portrait: [portrait.width, portrait.height],
        card: [card.width, card.height],
        alphaBounds: [minX, minY, maxX, maxY],
        transparent,
        coloredBoundaryPixels,
      });
    }
    return results;
  }, SECOND_WIND_PREVIEW_IDS);
  for (const m of metrics) {
    assert.equal(m.token[1], 238);
    assert(m.token[0] / m.token[1] >= 0.39 && m.token[0] / m.token[1] <= 0.6, `${m.id}: token ratio`);
    assert.deepEqual(m.portrait, [234, 172]);
    assert.deepEqual(m.card, [512, 734]);
    assert(m.transparent > 0);
    assert(m.coloredBoundaryPixels > 10, `${m.id}: colored standee contour`);
    assert(m.alphaBounds[1] <= 2 && m.alphaBounds[3] >= 236, `${m.id}: trim/feet alignment`);
  }
  const shots: Array<readonly [string, number, number, string]> = [
    ["grid", 390, 844, "01-clear-phone.png"],
    ["art", 390, 844, "02-original-vertical.png"],
    ["art", 1366, 768, "03-original-desktop.png"],
    ["tokens", batchTwo ? 1620 : 1100, 560, "04-token-portrait-comparison.png"],
    ["cards", batchTwo ? 1440 : 1000, 700, "05-card-comparison.png"],
    ["power", 390, 844, "06-skill-phone.png"],
    ["stats", 390, 844, "07-stats-phone.png"],
    ["power", 1366, 768, "08-skill-desktop.png"],
    ["stats", 1366, 768, "09-stats-desktop.png"],
  ];
  if (batchTwo) {
    shots.push(["borders", 1100, 560, "10-first-three-colored-borders.png"]);
    for (const id of reviewIds.slice(1)) shots.push([`power:${id}`, 390, 844, `skill-${id}-phone.png`]);
  }
  for (const [mode, width, height, filename] of shots) {
    await page.setViewportSize({ width, height });
    await page.evaluate((mode) => (window as any).review(mode), mode);
    await page.waitForTimeout(200);
    if (mode === "grid" || mode === "art") {
      assert.equal(await page.locator(".ma-pawn.tripped").count(), 1);
      assert.equal(await page.locator(".ma-pawn").count(), ids.length);
    }
    await assertUiShot(page, `${out}/${filename}`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/metrics.json`,
    JSON.stringify({ metrics, screenshots: shots.length, componentFixtures: true, pageErrors: errors }, null, 2) + "\n",
  );
  console.log("SW_FIRST_THREE_ART_PASS", JSON.stringify(metrics));
} finally {
  await browser.close();
  await server.close();
}
