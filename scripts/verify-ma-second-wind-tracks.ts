import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { testRace, reduceMA } from "../packages/magical-athlete/src/engine.ts";
const work = resolve("work/ma-track-preview"),
  out = resolve("output/ma-tracks");
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const samples = Object.fromEntries(
  ["twisty-twirl", "whirly-world"].map((track) => {
    const before = testRace({
      racers: ["twin", "banana", "baba_yaga", "sw_kingtripper"],
      pos: [16, 20, 22, 5],
      rolls: [1],
      track: track as any,
      skipSetup: true,
      secondWindPreview: true,
    });
    if (track === "twisty-twirl") before.race!.twist!.monster = { pos: 15 };
    // Only the verified whirly movement fixture is executable. Twisty remains structural.
    const after =
      track === "whirly-world"
        ? reduceMA(before, {
            type: "ANSWER",
            player: before.pending!.player,
            value: "roll",
          })
        : before;
    const mirrored = structuredClone(before.race!);
    if (mirrored.twist) mirrored.twist.reversed = true;
    return [track, { before: before.race, after: after.race, mirrored }];
  }),
);
writeFileSync(
  join(work, "index.html"),
  '<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>',
);
writeFileSync(
  join(work, "entry.tsx"),
  `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{Track,PLAYER_COLORS}from'../../apps/web/src/ma/Track.tsx';import'../../apps/web/src/style.css';import'../../apps/web/src/ma/ma.css';const samples=${JSON.stringify(samples)};function App(){const[id,setId]=useState('whirly-world');const[after,setAfter]=useState(false);const[mirror,setMirror]=useState(false);const[layout,setLayout]=useState('art');const r=samples[id][mirror?'mirrored':after?'after':'before'];window.render_game_to_text=()=>JSON.stringify({track:id,layout,stage:mirror?'mirror':after?'after':'before',tokens:r.tokens.map(t=>({id:t.racer,pos:t.pos,tripped:t.tripped})),experimental:true});return <div className="ma-app"><header style={{padding:12}}><h1 style={{fontSize:20}}>二代赛道 · 开发预览</h1><p>地图结构、螺旋通道与怪物棋子预览；扭扭事件尚未完整启用。</p><button id="whirly" onClick={()=>{setId('whirly-world');setAfter(false);setMirror(false)}}>螺旋世界</button><button id="twisty" onClick={()=>{setId('twisty-twirl');setAfter(false);setMirror(false)}}>扭扭赛道</button><button id="move" disabled={id!=='whirly-world'} onClick={()=>setAfter(x=>!x)}>演示17→22</button><button id="mirror" disabled={id!=='twisty-twirl'} onClick={()=>setMirror(x=>!x)}>镜像方向</button><button id="layout" onClick={()=>setLayout(x=>x==='art'?'grid':'art')}>切换棋盘布局</button></header><Track race={r} me="p1" colorOf={id=>PLAYER_COLORS[Number(id.slice(1))-1]} layout={layout} fit={true}/></div>}createRoot(document.getElementById('root')).render(<App/>);`,
);
await build({
  configFile: false,
  root: work,
  plugins: [tailwindcss()],
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify("track-preview") },
  build: { outDir: join(work, "dist"), emptyOutDir: true },
});
const server = createServer((req, res) => {
  const url = new URL(req.url!, "http://localhost");
  let file = join(work, "dist", decodeURIComponent(url.pathname));
  if (url.pathname.startsWith("/assets/magical-athlete/"))
    file = resolve("apps/web/public", url.pathname.slice(1));
  if (url.pathname.startsWith("/debug/"))
    file = join(out, url.pathname.slice(7));
  if (url.pathname === "/") file = join(work, "dist/index.html");
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    (
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
      } as Record<string, string>
    )[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const address = server.address();
if (!address || typeof address === "string") throw new Error("预览服务端口不可用");
const previewUrl = `http://127.0.0.1:${address.port}`;
if (process.env.MA_PREVIEW_SERVE) {
  console.log("PREVIEW " + previewUrl);
  await new Promise(() => {});
}
const browser = await chromium.launch();
const errors: string[] = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
for (const width of [320, 360, 390, 414, 1280]) {
  await page.setViewportSize({ width, height: width === 390 ? 664 : 844 });
  await page.goto(previewUrl);
  await page.waitForSelector(".ma-board-img");
  for (const map of ["whirly", "twisty"]) {
    await page.click("#" + map);
    await page
      .locator(".ma-board-img")
      .evaluateAll((imgs: any[]) => Promise.all(imgs.map((i) => i.decode())));
    await page.screenshot({
      path: join(out, `${map}-${width}.png`),
      fullPage: true,
    });
    if (map === "twisty" && width === 390) {
      if (await page.locator(".ma-twist-monster").count() !== 1)
        throw new Error("扭扭赛道怪物棋子未显示");
      await page.click("#layout");
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(out, "twisty-monster-grid-390.png"), fullPage: true });
      if (await page.locator(".ma-twist-monster").count() !== 1)
        throw new Error("清晰棋盘怪物棋子未显示");
      const monsterInsideGrid = await page.evaluate(() => {
        const grid = document.querySelector(".ma-grid")!.getBoundingClientRect();
        const marker = document.querySelector(".ma-twist-monster")!.getBoundingClientRect();
        return marker.left >= grid.left && marker.right <= grid.right && marker.top >= grid.top && marker.bottom <= grid.bottom;
      });
      if (!monsterInsideGrid) {
        const geometry = await page.evaluate(() => ({
          grid: document.querySelector(".ma-grid")!.getBoundingClientRect().toJSON(),
          marker: document.querySelector(".ma-twist-monster")!.getBoundingClientRect().toJSON(),
          style: (document.querySelector(".ma-twist-monster") as HTMLElement).style.cssText,
        }));
        throw new Error("清晰棋盘怪物棋子超出棋盘 " + JSON.stringify(geometry));
      }
      await page.click("#layout");
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error(`横向溢出 ${map}/${width}`);
    results.push({ map, width, overflow });
  }
}
for (const height of [844, 664]) {
  await page.setViewportSize({ width: 390, height });
  await page.goto(previewUrl);
  await page.click("#twisty");
  await page.click("#mirror");
  await page.click("#layout");
  if (!(await page.locator(".ma-cell-art.reverse-finish").innerText()).includes("镜像终点"))
    throw new Error("镜像终点标签未显示");
  if (!(await page.locator(".ma-cell-tag.reverse-start").innerText()).includes("镜像起点"))
    throw new Error("镜像起点标签未显示");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error(`镜像清晰棋盘横向溢出 390×${height}`);
  await page.screenshot({ path: join(out, `twisty-mirror-grid-390x${height}.png`), fullPage: true });
  await page.click("#layout");
  await page.screenshot({ path: join(out, `twisty-mirror-art-390x${height}.png`), fullPage: true });
}
await page.setViewportSize({ width: 1280, height: 600 });
for (const id of ["twisty-twirl", "whirly-world"]) {
  await page.goto(previewUrl + "/debug/" + id + "-debug.svg");
  await page.screenshot({ path: join(out, id + "-debug.png") });
}
await page.goto(previewUrl);
await page.click("#move");
const state = await page.evaluate(() =>
  JSON.parse((window as any).render_game_to_text()),
);
if (state.tokens.find((t: any) => t.id === "twin").pos !== 22)
  throw new Error("通道终点错误");
await page.screenshot({ path: join(out, "warp-arrival.png") });
if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(
  join(out, "browser-results.json"),
  JSON.stringify({ checks: results, errors, warp: state }, null, 2),
);
await browser.close();
server.close();
console.log(
  "MAP_BROWSER_PASS screens=10 widths=320,360,390,414,1280 warp=17:22",
);
