/** Single before/after visual sample. No repeated performance benchmark. */
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const { PNG } = createRequire(import.meta.url)("pngjs");
import { testRace, reduceMA } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
const label = process.env.MA_POLISH_LABEL ?? "after",
  out = resolve(`output/ma-polish-${label}`),
  work = resolve("work/ma-polish-preview");
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });
const before = testRace({
  racers: ["sw_magical_athlete", "scoocher", "party_animal", "suckerfish"],
  pos: [4, 8, 9, 8],
  rolls: [3, 4, 2, 1],
  skipSetup: true,
  secondWindPreview: true,
});
let after = structuredClone(before);
for (let i = 0; i < 100; i++) {
  const p = after.pending!;
  const option =
    p.options.find((o) => o.value !== "no" && o.value !== "keep") ??
    p.options[0];
  after = reduceMA(after, {
    type: "ANSWER",
    player: p.player,
    value: option.value,
  });
  if (after.turn?.snapshot !== before.turn!.snapshot) break;
}
const fixture = {
  before: viewForMA(before, "p1"),
  after: viewForMA(after, "p1"),
};
writeFileSync(
  join(work, "index.html"),
  '<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>',
);
writeFileSync(
  join(work, "entry.tsx"),
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{Game}from'../../apps/web/src/ma/MagicalAthlete.tsx';import{CubeDie}from'../../apps/web/src/ma/LiteMotion.tsx';import'../../apps/web/src/style.css';
const f=await(await fetch('/fixture.json')).json();function Harness(){const[v,setV]=useState(f.before);const[roll,setRoll]=useState(location.search.includes('cold'));const[cycle,setCycle]=useState(0);useEffect(()=>{window.__play=()=>setV(f.after);window.__galleryRoll=setRoll;window.__galleryCycle=()=>setCycle(n=>n+1);window.__ready=true;if(location.search.includes('cold'))setTimeout(()=>setRoll(false),750)},[]);if(location.search.includes('gallery'))return <main className="ma-app"><h1 style={{padding:16}}>六色骰子 · {roll?'翻滚中':'落定'}</h1><section id="gallery" style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,padding:16}}>{['红色','蓝色','黄色','紫色','绿色','橙色'].map((n,i)=><article key={cycle+'-'+i} style={{background:'#eee8dd',borderRadius:16,padding:12,textAlign:'center'}}><h2>{n} · {i+1} 点</h2><CubeDie seat={i+1} value={i+1} rolling={roll}/></article>)}</section></main>;const snap={code:'体验',stage:'game',version:v.version,mySeat:'p1',view:v,points:v.settings.points,variant:'standard',deal:'random',secondWind:true,players:v.players.map((p,i)=>({playerId:p.id,name:p.name,host:i===0,connected:true}))};return <div className="ma-app"><Game snap={snap} view={v} connected={true} send={async()=>null}/></div>}createRoot(document.getElementById('root')).render(<Harness/>);`,
);
const entryPath = join(work, "entry.tsx");
writeFileSync(
  entryPath,
  readFileSync(entryPath, "utf8")
    .replace(
      "import{CubeDie}from'../../apps/web/src/ma/LiteMotion.tsx';",
      "import{CubeDie}from'../../apps/web/src/ma/LiteMotion.tsx';import{DiceStage}from'../../apps/web/src/ma/DiceStage.tsx';",
    )
    .replace(
      "const[cycle,setCycle]=useState(0);",
      "const[cycle,setCycle]=useState(0);const[diceShow,setDiceShow]=useState(null);",
    )
    .replace(
      "window.__ready=true",
      "window.__setDiceShow=setDiceShow;window.__ready=true",
    )
    .replace(
      "if(location.search.includes('gallery'))",
      `if(location.search.includes('pool'))return <div className="ma-app"><DiceStage show={diceShow} view={f.before} name={id=>id} colorOf={()=>'#e8443a'} me="p1" onSkip={()=>{}}/></div>;if(location.search.includes('gallery'))`,
    ),
);
writeFileSync(
  entryPath,
  readFileSync(entryPath, "utf8")
    .replace("import{Game}", "import{Game,Overlay}")
    .replace(
      "const[cycle,setCycle]=useState(0);",
      "const[cycle,setCycle]=useState(0);const[offset,setOffset]=useState(0);",
    )
    .replace(
      "window.__galleryRoll=setRoll;",
      "window.__galleryRoll=setRoll;window.__gallerySeat=()=>setOffset(n=>n+1);",
    )
    .replace("<CubeDie seat={i+1}", "<CubeDie seat={(i+offset)%6+1}")
    .replace(
      "if(location.search.includes('gallery'))",
      `if(location.search.includes('duel'))return <div className="ma-app"><Overlay show={{kind:'duel',a:{racer:'sw_magical_athlete',value:2},b:{racer:'scoocher',value:6},rolling:roll}} view={f.before} name={id=>f.before.players.find(p=>p.id===id)?.name??'玩家'} colorOf={()=>'#e8443a'} me="p1" onSkip={()=>{}}/></div>;if(location.search.includes('gallery'))`,
    ),
);
writeFileSync(
  entryPath,
  readFileSync(entryPath, "utf8").replace(
    "if(location.search.includes('duel'))",
    `if(location.search.includes('single'))return <div className="ma-app"><Overlay show={{kind:'roll',player:'p1',racer:'sw_magical_athlete',value:cycle%6+1,rolling:roll}} view={f.before} name={id=>id==='p1'?'你':id} colorOf={()=>'#e8443a'} me="p1" onSkip={()=>{}}/></div>;if(location.search.includes('duel'))`,
  ),
);
if (process.env.MA_DICE_ONLY === "1")
  writeFileSync(
    entryPath,
    `
import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';
import{CubeDie}from'../../apps/web/src/ma/LiteMotion.tsx';import'../../apps/web/src/style.css';import'../../apps/web/src/ma/ma.css';
function Demo(){const[value,setValue]=useState(1),[rolling,setRolling]=useState(false),[seat,setSeat]=useState(1);
useEffect(()=>{window.__ready=true;window.render_game_to_text=()=>JSON.stringify({value,rolling,seat,coordinates:'画面中央为桌面，竖直向上为高度'});},[value,rolling,seat]);
const go=()=>{setValue(n=>n%6+1);setSeat(n=>n%6+1);setRolling(true);setTimeout(()=>setRolling(false),750)};
return <main className="ma-app" style={{minHeight:'100vh',padding:24,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:32}}><h1>骰子翻滚小样</h1><div style={{transform:'scale(1.5)',margin:32}}><CubeDie value={value} rolling={rolling} seat={seat}/></div><p>{rolling?'抛出与碰撞':value+' 点'}</p><button id="throw" disabled={rolling} onClick={go}>再掷一次</button></main>};createRoot(document.getElementById('root')).render(<Demo/>);`,
  );
await build({
  configFile: false,
  root: work,
  base: "/",
  publicDir: false,
  plugins: [
    {
      name: "ma-private-preview",
      enforce: "pre",
      transform(code, id) {
        if (process.env.MA_DICE_AUDIT === "1" && id.endsWith("/ma/dice3d.ts")) {
          return code.replace(
            "if (!disposed) renderer.render(scene, camera);",
            "if (!disposed) { renderer.render(scene, camera); canvas.dataset.auditPose=JSON.stringify({q:die.quaternion.toArray(),p:die.position.toArray(),time:performance.now()}); }",
          );
        }
        if (id.endsWith("/ma/MagicalAthlete.tsx"))
          return code + "\nexport {Game};";
      },
    },
    tailwindcss(),
  ],
  build: { outDir: join(out, "build"), emptyOutDir: true },
});
writeFileSync(join(out, "build", "fixture.json"), JSON.stringify(fixture));
if (process.env.MA_POLISH_BUILD_ONLY === "1") process.exit(0);
const server = createServer((req, res) => {
  const p = new URL(req.url!, "http://localhost").pathname;
  if (p === "/fixture.json") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(fixture));
    return;
  }
  let f = join(out, "build", p === "/" ? "index.html" : p);
  if (!existsSync(f) && p.startsWith("/assets/"))
    f = join(resolve("apps/web/public"), p);
  if (!existsSync(f)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    (
      {
        ".js": "application/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
        ".woff2": "font/woff2",
      } as Record<string, string>
    )[extname(f)] ?? "application/octet-stream",
  );
  res.end(readFileSync(f));
});
await new Promise<void>((r) => server.listen(5200, "127.0.0.1", r));
if (process.env.MA_POLISH_SERVE_ONLY === "1") await new Promise(() => {});
const browser = await chromium.launch({ channel: "chromium" });
const errors: string[] = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: join(out, "video"), size: { width: 390, height: 844 } },
  });
  await ctx.addInitScript("globalThis.__name=(fn)=>fn;");
  await ctx.addInitScript(() => {
    localStorage.setItem("ma-muted", "1");
    localStorage.setItem("ma-speed", "normal");
  });
  if (process.env.MA_LAYOUT === "art")
    await ctx.addInitScript(() =>
      localStorage.setItem("ma-board-layout", "art"),
    );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:5200/" +
      (process.env.MA_OVERLAY_DEMO === "1"
        ? process.env.MA_COLD_START === "1"
          ? "?single&cold"
          : "?single"
        : ""),
  );
  await page.waitForFunction(() => (window as any).__ready);
  await page.evaluate(() => document.fonts.ready);
  if (process.env.MA_OVERLAY_DEMO === "1") {
    await page.waitForTimeout(1200);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        (window as any).__galleryCycle();
        (window as any).__galleryRoll(true);
      });
      await page.waitForTimeout(750);
      await page.evaluate(() => (window as any).__galleryRoll(false));
      await page.waitForTimeout(2050);
    }
  } else if (process.env.MA_DICE_ONLY === "1") {
    await page.waitForTimeout(1800);
    for (let i = 0; i < 6; i++) {
      await page.locator("#throw").click();
      await page.waitForTimeout(2800);
    }
  } else {
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.ma-dice-standby .ma-dice3d[data-renderer="webgl"]',
        ).length === 2,
    );
    await page.screenshot({
      path: join(out, "restored-button.png"),
      fullPage: true,
    });
    await page.evaluate(() => (window as any).__play());
    await page.waitForTimeout(20000);
  }
  await page.screenshot({ path: join(out, "phone.png"), fullPage: true });
  const video = page.video()!;
  await ctx.close();
  await video.saveAs(join(out, "phone.webm"));
  if (process.env.MA_DICE_ONLY === "1") {
    const ffmpeg = createRequire(import.meta.url)(
      resolve("work/ma-motion-tools/node_modules/ffmpeg-static"),
    );
    const result = spawnSync(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        join(out, "phone.webm"),
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-movflags",
        "+faststart",
        join(out, "phone.mp4"),
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw Error(result.stderr);
    if (errors.length) throw Error(errors.join(";"));
    console.log("DICE_CAPTURE_PASS", label);
  }
  if (process.env.MA_DICE_ONLY !== "1") {
    const gallery = await browser.newContext({
      viewport: { width: 1600, height: 460 },
      deviceScaleFactor: 1,
    });
    await gallery.addInitScript("globalThis.__name=(fn)=>fn;");
    const g = await gallery.newPage();
    g.on("pageerror", (e) => errors.push(e.message));
    await g.goto("http://127.0.0.1:5200/?gallery");
    await g.waitForFunction(() => (window as any).__ready);
    await g.waitForTimeout(2400);
    await g.screenshot({ path: join(out, "dice-landed.png") });
    await g.evaluate(() => (window as any).__galleryRoll(true));
    await g.waitForTimeout(340);
    await g.screenshot({ path: join(out, "dice-rolling.png") });
    await gallery.close();
    const top = PNG.sync.read(readFileSync(join(out, "dice-landed.png"))),
      bottom = PNG.sync.read(readFileSync(join(out, "dice-rolling.png"))),
      sheet = new PNG({ width: top.width, height: top.height + bottom.height });
    PNG.bitblt(top, sheet, 0, 0, top.width, top.height, 0, 0);
    PNG.bitblt(bottom, sheet, 0, 0, bottom.width, bottom.height, 0, top.height);
    writeFileSync(join(out, "dice-contact-sheet.png"), PNG.sync.write(sheet));
    const ffmpeg = createRequire(import.meta.url)(
      resolve("work/ma-motion-tools/node_modules/ffmpeg-static"),
    );
    const result = spawnSync(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        join(out, "phone.webm"),
        "-t",
        "20",
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        join(out, "phone.mp4"),
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw Error(result.stderr);
    writeFileSync(
      join(out, "results.json"),
      JSON.stringify({ label, errors, viewport: [390, 844] }, null, 2),
    );
    if (errors.length) throw Error(errors.join(";"));
    console.log("POLISH_CAPTURE_PASS", label);
  }
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
