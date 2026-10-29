/** Planning-only benchmark. Builds disposable copies; never edits game sources. */
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { cpus, platform, totalmem } from "node:os";
import {
  createMAGame,
  testRace,
  reduceMA,
} from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import type {
  MAState,
  MACommand,
} from "../packages/magical-athlete/src/types.ts";

// TypeScript 7 no longer exposes the compiler AST API. Isolated tool dependency only.
const ts = createRequire(import.meta.url)(
  resolve("work/ma-motion-tools/node_modules/typescript/lib/typescript.js"),
);
const root = resolve(".");
const work = resolve("work/ma-motion-benchmark");
const out = resolve(process.env.MA_MOTION_OUT ?? "output/ma-motion-baseline");
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const clone = <T>(x: T): T => structuredClone(x);
const roles = [
  "alchemist",
  "scoocher",
  "huge_baby",
  "suckerfish",
  "party_animal",
  "banana",
  "centaur",
  "coach",
];
let start = createMAGame({
  players: roles.map((_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` })),
  seed: 2601029,
  settings: { deal: "random", secondWindPreview: true },
});
const pool = [...start.players.flatMap((p) => p.hand), ...start.deck].filter(
  (id) => !roles.includes(id),
);
start.players.forEach((p, i) => {
  p.hand = [roles[i], ...pool.splice(0, 3)];
});
start.deck = pool;
for (let i = 0; i < 7; i++)
  start = reduceMA(start, {
    type: "CHOOSE",
    player: start.players[i].id,
    racer: roles[i],
  });
const startBefore = clone(start);
start = reduceMA(start, {
  type: "CHOOSE",
  player: start.players[7].id,
  racer: roles[7],
});

function changed(s: MAState, change: (s: MAState) => void) {
  change(s);
  const snap = JSON.parse(s.turn!.snapshot);
  change(snap);
  s.turn!.snapshot = JSON.stringify(snap);
  return s;
}
let chain = testRace({
  racers: roles,
  pos: [8, 9, 11, 9, 9, 14, 5, 8],
  rolls: [1, 3, 4, 2],
  secondWindPreview: true,
  skipSetup: true,
});
const chainBefore = clone(chain),
  firstSnapshot = chain.turn!.snapshot;
const commands: MACommand[] = [];
for (let i = 0; i < 100; i++) {
  const p = chain.pending!;
  const value =
    p.options.find((o) => o.value !== "no" && o.value !== "keep")?.value ??
    p.options[0].value;
  const cmd: MACommand = { type: "ANSWER", player: p.player, value };
  commands.push(cmd);
  chain = reduceMA(chain, cmd);
  if (chain.turn?.snapshot !== firstSnapshot) break;
}
if (chain.turn?.snapshot === firstSnapshot)
  throw Error("Chain fixture did not complete its authoritative turn");
let podium = testRace({
  racers: [
    "twin",
    "banana",
    "legs",
    "coach",
    "centaur",
    "alchemist",
    "blimp",
    "sw_penguin",
  ],
  pos: [29, 30, 12, 14, 17, 11, 13, 18],
  rolls: [1],
  secondWindPreview: true,
  skipSetup: true,
});
podium = changed(podium, (s) => {
  s.race!.tokens[1].place = 1;
  s.race!.finishers = ["banana"];
});
const podiumBefore = clone(podium);
podium = reduceMA(podium, {
  type: "ANSWER",
  player: podium.pending!.player,
  value: "roll",
});
const moveBefore = testRace({racers:["banana","scoocher","huge_baby","suckerfish","party_animal","alchemist","centaur","coach"],pos:[20,2,3,4,5,6,7,8],rolls:[3],secondWindPreview:true,skipSetup:true});
const moveAfter = reduceMA(moveBefore,{type:"ANSWER",player:moveBefore.pending!.player,value:"roll"});
const pairs = {
  start: [startBefore, start],
  chain: [chainBefore, chain],
  podium: [podiumBefore, podium],
  move: [moveBefore,moveAfter],
} as const;
const fixtures = Object.fromEntries(
  Object.entries(pairs).map(([name, [before, after]]) => [
    name,
    {
      before: viewForMA(before, "p1"),
      after: viewForMA(after, "p1"),
      effects: after.log.slice(before.log.length).filter((l) => l.fx),
      commands: name === "chain" ? commands : undefined,
    },
  ]),
);
writeFileSync(join(out, "fixtures.json"), JSON.stringify(fixtures, null, 2));
console.log(
  "FIXTURES",
  Object.fromEntries(
    Object.entries(fixtures).map(([k, v]) => [
      k,
      v.effects.map((e) => e.fx!.kind),
    ]),
  ),
);
writeFileSync(
  join(work, "index.html"),
  '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>魔法运动员性能基线</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
);
writeFileSync(
  join(work, "entry.tsx"),
  `
import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';
import{Game}from'../../apps/web/src/ma/MagicalAthlete.tsx';import'../../apps/web/src/style.css';
const name=new URLSearchParams(location.search).get('scene')??'chain';const data=await(await fetch('/fixtures.json')).json();const f=data[name];
function Harness(){const[v,setV]=useState(f.before);useEffect(()=>{window.__maPlay=()=>{performance.mark('ma-motion:start');setV(f.after)};window.__maReady=true},[]);
const snap={code:'PERF',stage:'game',version:v.version,mySeat:'p1',view:v,points:v.settings.points,variant:'standard',deal:'random',secondWind:true,players:v.players.map((p,i)=>({playerId:p.id,name:p.name,host:i===0,connected:true}))};
return <div className="ma-app"><Game snap={snap} view={v} connected={true} send={async()=>null}/></div>}
createRoot(document.getElementById('root')).render(<Harness/>);`,
);

function measurementPlugin(probe: boolean) {
  return {
    name: "ma-measurement-only",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (
        !/\/ma\/(MagicalAthlete|Track)\.tsx$|\/ma\/playback\.ts$/.test(
          id.replaceAll("\\", "/"),
        )
      )
        return null;
      const file = ts.createSourceFile(
        id,
        code,
        ts.ScriptTarget.Latest,
        true,
        id.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const edits: Array<{ at: number; text: string }> = [];
      const counter = (name: string) =>
        `;(globalThis.__maRenderCounts??={})[${JSON.stringify(name)}]=((globalThis.__maRenderCounts??={})[${JSON.stringify(name)}]??0)+1;`;
      function visit(n: any) {
        if (
          (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) &&
          n.body &&
          n.name
        ) {
          const name = n.name.text;
          if (probe && (/^[A-Z]/.test(name) || name === "usePlayback"))
            edits.push({ at: n.body.getStart(file) + 1, text: counter(name) });
          if (name === "usePlayback") {
            const last = n.body.statements.findLast(ts.isReturnStatement)!;
            edits.push({
              at: last.getStart(file),
              text: code.includes("createPlaybackVisuals")
                ? `globalThis.__maPlayback={busy:busy||unplayed,show:show?.kind??null,get moving(){return visuals.getSnapshot().moving},queue:queue.current.length};`
                : `globalThis.__maPlayback={busy:busy||unplayed,show:show?.kind??null,moving:moving,queue:queue.current.length};`,
            });
          }
        }
        if (
          probe &&
          id.endsWith("Track.tsx") &&
          ts.isArrowFunction(n) &&
          ts.isBlock(n.body) &&
          n.parameters[0]?.name.getText(file) === "rid"
        )
          edits.push({
            at: n.body.getStart(file) + 1,
            text: counter("Track.PawnJSX"),
          });
        ts.forEachChild(n, visit);
      }
      visit(file);
      for (const e of edits.sort((a, b) => b.at - a.at))
        code = code.slice(0, e.at) + e.text + code.slice(e.at);
      if (id.endsWith("MagicalAthlete.tsx")) code += "\nexport {Game};\n";
      return { code, map: null };
    },
  };
}
if (process.env.MA_MOTION_SKIP_BUILD !== "1")
  for (const variant of ["prod", "probe"]) {
    await build({
      configFile: false,
      root: work,
      base: `/${variant}/`,
      publicDir: false,
      plugins: [measurementPlugin(variant === "probe"), tailwindcss()],
      build: { outDir: join(out, `${variant}-build`), emptyOutDir: true },
    });
  }
if (process.env.MA_MOTION_BUILD_ONLY === "1") process.exit(0);
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const url = new URL(req.url!, "http://localhost");
  let path: string;
  if (url.pathname === "/fixtures.json") path = join(out, "fixtures.json");
  else if (url.pathname.startsWith("/assets/"))
    path = join(root, "apps/web/public", decodeURIComponent(url.pathname));
  else {
    const [, variant, ...rest] = url.pathname.split("/");
    path = variant === "control" && process.env.MA_MOTION_CONTROL
      ? join(resolve(process.env.MA_MOTION_CONTROL), "prod-build", rest.join("/") || "index.html")
      : join(out, `${variant}-build`, rest.join("/") || "index.html");
    // Saved control HTML has an absolute /prod/assets base. Hash names keep
    // those immutable files distinct from the candidate's generated assets.
    if (!existsSync(path) && variant === "prod" && process.env.MA_MOTION_CONTROL)
      path = join(resolve(process.env.MA_MOTION_CONTROL), "prod-build", rest.join("/") || "index.html");
  }
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[extname(path)] ?? "application/octet-stream",
  );
  res.end(readFileSync(path));
});
await new Promise<void>((r) => server.listen(5196, "127.0.0.1", r));
const channel = process.env.MA_MOTION_CHANNEL ?? "chromium";
const browser = await chromium.launch({
  channel: channel === "headless-shell" ? undefined : channel,
});
const browserCDP = await browser.newBrowserCDPSession();
const version = await browserCDP.send("Browser.getVersion");
const gpu = (await browserCDP.send("SystemInfo.getInfo")).gpu;
const results: any[] =
  process.env.MA_MOTION_RESUME === "1" && existsSync(join(out, "results.json"))
    ? JSON.parse(readFileSync(join(out, "results.json"), "utf8")).results
    : [];
const percentile = (a: number[], p: number) =>
  a.length
    ? [...a].sort((x, y) => x - y)[
        Math.min(a.length - 1, Math.floor(a.length * p))
      ]
    : null;
function frameStats(a: any[]) {
  const ds = a.map((f) => f.dt).filter((d) => d > 0);
  return {
    samples: ds.length,
    rafFps: ds.length
      ? (1000 * ds.length) / ds.reduce((n, d) => n + d, 0)
      : null,
    p95FrameMs: percentile(ds, 0.95),
    p99FrameMs: percentile(ds, 0.99),
    over25ms: ds.filter((d) => d > 25).length,
    estimatedMissed60HzFrames: ds.reduce(
      (n, d) => n + Math.max(0, Math.round(d / (1000 / 60)) - 1),
      0,
    ),
  };
}
try {
  const repeats = Number(process.env.MA_MOTION_REPEATS ?? 3);
  const modes = process.env.MA_MOTION_MODES?.split(",") ?? [
    "prod",
    "probe",
    "video",
  ];
  const scenes = process.env.MA_MOTION_SCENES?.split(",") ?? [
    "start",
    "chain",
    "podium",
  ];
  for (const mode of modes)
    for (const scene of scenes)
      for (let trial = 0; trial < (mode === "prod" ? repeats : 1); trial++)
      for (const variant of mode === "prod" && process.env.MA_MOTION_CONTROL ? (trial%2?["prod","control"]:["control", "prod"]) : [mode === "probe" ? "probe" : "prod"]) {
        const trialNumber =
          mode === "prod"
            ? 1 +
              results.filter((r) => r.mode === mode && r.scene === scene && (r.variant ?? "prod") === variant).length
            : 1;
        const label = `${mode}-${scene}-${trialNumber}${variant === "control" ? "-control" : ""}`;
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          reducedMotion: "no-preference",
          ...(mode === "video"
            ? {
                recordVideo: {
                  dir: join(out, "videos"),
                  size: { width: 390, height: 844 },
                },
              }
            : {}),
        });
        await context.addInitScript("globalThis.__name = (fn) => fn;");
        await context.addInitScript(() => {
          localStorage.setItem("ma-speed", "normal");
          localStorage.setItem("ma-board-layout", "grid");
          localStorage.setItem("ma-muted", "1");
          const g = globalThis as any;
          g.__maCommits = 0;
          g.__maRenderCounts = {};
          g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
            supportsFiber: true,
            renderers: new Map(),
            inject(r: any) {
              this.renderers.set(1, r);
              return 1;
            },
            onCommitFiberRoot() {
              g.__maCommits++;
            },
            onCommitFiberUnmount() {},
          };
          g.__maMeasure = {
            active: false,
            frames: [],
            longTasks: [],
            timeline: [],
            start: 0,
            end: 0,
          };
          new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              g.__maMeasure.longTasks.push({
                start: e.startTime,
                duration: e.duration,
                name: e.name,
              });
          }).observe({ type: "longtask", buffered: true });
          let prev = 0,
            lastStage = "";
          const tick = (t: number) => {
            const m = g.__maMeasure,
              p = g.__maPlayback;
            if (m.active) {
              if (prev)
                m.frames.push({
                  t,
                  dt: t - prev,
                  stage: p?.show ?? "board",
                  moving: !!p?.moving?.length,
                });
              const stage =
                (p?.busy ? "busy:" : "idle:") + (p?.show ?? "board");
              if (stage !== lastStage) {
                m.timeline.push({ t, stage });
                lastStage = stage;
              }
            }
            prev = m.active ? t : 0;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const cdp = await context.newCDPSession(page);
        let layers: any[] = [];
        if (mode === "layers") {
          cdp.on(
            "LayerTree.layerTreeDidChange",
            (e) => (layers = e.layers ?? []),
          );
          await cdp.send("DOM.enable");
          await cdp.send("LayerTree.enable");
        }
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Performance.enable");
        await page.goto(`http://127.0.0.1:5196/${variant}/?scene=${scene}`);
        await page.waitForFunction(() => !!(window as any).__maReady);
        if (mode === "layers") {
          await page.evaluate(() => (window as any).__maPlay());
          await page.waitForTimeout(6500);
          const details = [];
          for (const layer of layers.filter((l) => l.backendNodeId)) {
            try {
              const n = await cdp.send("DOM.describeNode", {
                backendNodeId: layer.backendNodeId,
              });
              const reasons = await cdp.send("LayerTree.compositingReasons", {
                layerId: layer.layerId,
              });
              details.push({
                node: n.node.nodeName,
                attrs: n.node.attributes,
                width: layer.width,
                height: layer.height,
                ...reasons,
              });
            } catch {}
          }
          const animations = await page.evaluate(() =>
            document
              .getAnimations()
              .map((a) => ({
                name: (a as CSSAnimation).animationName,
                target: (a.effect as KeyframeEffect)?.target?.nodeName,
                frames: (a.effect as KeyframeEffect)?.getKeyframes(),
              })),
          );
          writeFileSync(
            join(out, "layers.json"),
            JSON.stringify({ layers, details, animations }, null, 2),
          );
          await context.close();
          continue;
        }
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          (window as any).__maRenderCounts = {};
          (window as any).__maCommits = 0;
        });
        const before = (await cdp.send("Performance.getMetrics")).metrics;
        if (mode === "prod")
          await cdp.send("Tracing.start", {
            categories:
              "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame" + (process.env.MA_MOTION_TRACE_EXTRA ? "," + process.env.MA_MOTION_TRACE_EXTRA : ""),
            transferMode: "ReturnAsStream",
          });
        await page.evaluate(() => {
          const g = window as any;
          g.__maMeasure.start = performance.now();
          g.__maMeasure.active = true;
          g.__maPlay();
        });
        await page.waitForFunction(
          () => !!(window as any).__maPlayback?.busy,
          {},
          { timeout: 5000 },
        );
        if (mode === "video") {
          await page.waitForFunction(
            (kind) => (window as any).__maPlayback?.show === kind,
            scene === "podium"
              ? "podium"
              : scene === "start"
                ? "start"
                : "power",
            { timeout: 30000 },
          );
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(out, `${scene}-active.png`) });
        }
        await page.waitForFunction(
          () => !(window as any).__maPlayback?.busy,
          {},
          { timeout: 180000, polling: 100 },
        );
        await page.evaluate(() => {
          const m = (window as any).__maMeasure;
          m.end = performance.now();
          m.active = false;
          performance.mark("ma-motion:end");
        });
        const after = (await cdp.send("Performance.getMetrics")).metrics;
        let traceSummary: any = null;
        if (mode === "prod") {
          const done = new Promise<any>((r) =>
            cdp.once("Tracing.tracingComplete", r),
          );
          await cdp.send("Tracing.end");
          const finished = await done;
          let raw = "";
          for (;;) {
            const chunk = await cdp.send("IO.read", {
              handle: finished.stream,
            });
            raw += chunk.data;
            if (chunk.eof) break;
          }
          await cdp.send("IO.close", { handle: finished.stream });
          writeFileSync(join(out, `${label}.trace.json.gz`), gzipSync(raw));
          const events = JSON.parse(raw).traceEvents as any[];
          const mark = events.find((e) => e.name === "ma-motion:start");
          const end = events.find((e) => e.name === "ma-motion:end");
          const inWindow = events.filter(
            (e) =>
              e.ph === "X" &&
              e.pid === mark?.pid &&
              e.tid === mark?.tid &&
              e.ts >= mark.ts &&
              (!end || e.ts < end.ts),
          );
          const sums = Object.fromEntries(
            [
              "Layout",
              "UpdateLayoutTree",
              "Paint",
              "PrePaint",
              "FunctionCall",
            ].map((name) => {
              const a = inWindow.filter((e) => e.name === name);
              return [
                name,
                {
                  count: a.length,
                  ms: a.reduce((n, e) => n + (e.dur ?? 0) / 1000, 0),
                },
              ];
            }),
          );
          const decode = events.filter(
            (e) => /decode/i.test(e.name) && e.ph === "X",
          );
          traceSummary = {
            main: sums,
            decode: {
              count: decode.length,
              ms: decode.reduce((n, e) => n + (e.dur ?? 0) / 1000, 0),
              names: [...new Set(decode.map((e) => e.name))],
            },
            drawFrameEvents: events.filter((e) => e.name === "DrawFrame")
              .length,
            rendererMain: mark ? { pid: mark.pid, tid: mark.tid } : null,
          };
        }
        if (errors.length) throw new Error(`${label}: ${errors.join("; ")}`);
        const measured = await page.evaluate(() => {
          const g = window as any;
          return {
            measure: g.__maMeasure,
            counts: g.__maRenderCounts,
            commits: g.__maCommits,
            resources: performance
              .getEntriesByType("resource")
              .map((e: any) => ({
                name: e.name,
                bytes: e.transferSize,
                duration: e.duration,
              })),
            userAgent: navigator.userAgent,
          };
        });
        const m = measured.measure;
        const mainMetric = (items: any[], name: string) =>
          items.find((i) => i.name === name)?.value ?? 0;
        const metrics = Object.fromEntries(
          [
            "LayoutCount",
            "RecalcStyleCount",
            "LayoutDuration",
            "RecalcStyleDuration",
            "ScriptDuration",
            "TaskDuration",
            "JSHeapUsedSize",
          ].map((k) => [
            k,
            k === "JSHeapUsedSize"
              ? mainMetric(after, k)
              : mainMetric(after, k) - mainMetric(before, k),
          ]),
        );
        const result = {
          label,
          variant,
          mode,
          scene,
          trial: trialNumber,
          durationMs: m.end - m.start,
          frame: frameStats(m.frames),
          movementLongTasks: m.longTasks.filter(
            (t: any) =>
              t.duration > 50 &&
              m.frames.some(
                (f: any) =>
                  f.moving &&
                  f.t >= t.start &&
                  f.t - f.dt <= t.start + t.duration,
              ),
          ),
          movement: frameStats(m.frames.filter((f: any) => f.moving)),
          podium: frameStats(m.frames.filter((f: any) => f.stage === "podium")),
          longTasks: m.longTasks.filter(
            (t: any) => t.start < m.end && t.start + t.duration > m.start,
          ),
          commits: measured.commits,
          renderCounts: measured.counts,
          metrics,
          trace: traceSummary,
          timeline: m.timeline,
          errors,
        };
        writeFileSync(
          join(out, `${label}.samples.json`),
          JSON.stringify(measured),
        );
        results.push(result);
        writeFileSync(
          join(out, "results.json"),
          JSON.stringify(
            {
              environment: {
                version,
                channel,
                gpu,
                cpu: cpus()[0].model,
                logicalCpus: cpus().length,
                memoryBytes: totalmem(),
                platform: platform(),
                viewport: [390, 844],
                dpr: 2,
                cpuThrottle: 4,
                headless: true,
              },
              results,
            },
            null,
            2,
          ),
        );
        await page.screenshot({ path: join(out, `${label}.png`) });
        if (mode === "video") {
          const video = page.video()!;
          await context.close();
          await video.saveAs(join(out, `${scene}.webm`));
        } else await context.close();
        console.log(
          "MOTION_MEASURED",
          JSON.stringify({
            label,
            durationMs: result.durationMs,
            rafFps: result.frame.rafFps,
            movementFps: result.movement.rafFps,
            longTasks: result.longTasks.length,
            renders: result.renderCounts,
            errors,
          }),
        );
      }
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
