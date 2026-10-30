import { chromium, type BrowserContext } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { testRace, reduceMA } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
const out = resolve(
  process.env.MA_POLISH_CHECKS_OUT ?? "output/ma-polish-checks",
);
mkdirSync(out, { recursive: true });
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
  after = reduceMA(after, {
    type: "ANSWER",
    player: p.player,
    value: (
      p.options.find((o) => o.value !== "no" && o.value !== "keep") ??
      p.options[0]
    ).value,
  });
  if (after.turn?.snapshot !== before.turn!.snapshot) break;
}
const fixture = {
  before: viewForMA(before, "p1"),
  after: viewForMA(after, "p1"),
};
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname;
  if (path === "/fixture.json") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(fixture));
    return;
  }
  const label =
    req.headers["x-ma-build"] === "before"
      ? "before"
      : (process.env.MA_POLISH_CURRENT ?? "after");
  let file = join(
    resolve(`output/ma-polish-${label}/build`),
    path === "/" ? "index.html" : path,
  );
  if (!existsSync(file) && path.startsWith("/assets/"))
    file = join(resolve("apps/web/public"), path);
  if (!existsSync(file)) {
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
    )[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(5201, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chromium" });
const results: any[] = [];
const setup = async (ctx: BrowserContext) => {
  await ctx.addInitScript("globalThis.__name=(fn)=>fn;");
};
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 430 },
  });
  await setup(ctx);
  await ctx.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext,
      seen = new WeakSet();
    (window as any).__gl = { created: 0, released: 0, frames: 0 };
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: any[]
    ) {
      const gl = (original as any).apply(this, args);
      if (gl && String(args[0]).includes("webgl") && !seen.has(gl)) {
        seen.add(gl);
        (window as any).__gl.created++;
        const get = gl.getExtension.bind(gl);
        gl.getExtension = (name: string) => {
          const ext = get(name);
          if (name === "WEBGL_lose_context" && ext && !ext.__polish) {
            ext.__polish = true;
            const lose = ext.loseContext.bind(ext);
            ext.loseContext = () => {
              (window as any).__gl.released++;
              lose();
            };
          }
          return ext;
        };
      }
      return gl;
    } as any;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        (window as any).__gl.frames++;
        fn(t);
      });
  });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:5201/?gallery");
  await p.waitForFunction(
    () =>
      document.querySelectorAll('.ma-dice3d[data-renderer="webgl"]').length ===
      6,
    {},
    { timeout: 30000 },
  );
  for (let n = 0; n < 2; n++) {
    await p.evaluate(() => (window as any).__galleryCycle());
    await p.waitForFunction(
      () =>
        document.querySelectorAll('.ma-dice3d[data-renderer="webgl"]')
          .length === 6,
    );
  }
  const beforeSeat = await p.evaluate(() => (window as any).__gl.created);
  await p.evaluate(() => (window as any).__gallerySeat());
  await p.waitForFunction(
    () =>
      document.querySelectorAll('.ma-dice3d[data-renderer="webgl"]').length ===
      6,
  );
  const counts = await p.evaluate(() => (window as any).__gl);
  assert.equal(
    counts.created,
    beforeSeat,
    "changing dice colors recreated GPU contexts",
  );
  assert.equal(counts.created - counts.released, 6);
  assert.ok(counts.released >= 12);
  results.push({ resourceLifecycle: counts });
  for (const [speed, ms] of [
    ["slow", "1125ms"],
    ["normal", "750ms"],
    ["fast", "375ms"],
  ] as const) {
    await p.evaluate((s) => {
      localStorage.setItem("ma-speed", s);
      window.dispatchEvent(new Event("ma-motion-speed"));
    }, speed);
    await p.waitForTimeout(40);
    assert.equal(
      await p
        .locator(".ma-dice3d")
        .first()
        .evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue("--ma-dice-ms"),
        ),
      ms,
    );
  }
  await p.evaluate(() => (window as any).__galleryRoll(true));
  await p.waitForTimeout(120);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForTimeout(200);
  const frames = await p.evaluate(() => (window as any).__gl.frames);
  await p.waitForTimeout(180);
  assert.equal(await p.evaluate(() => (window as any).__gl.frames), frames);
  results.push({ reducedMotion: "RAF stopped", speeds: "all three passed" });
  assert.deepEqual(errors, []);
  await ctx.close();
  const css = await browser.newContext({
    viewport: { width: 1440, height: 430 },
  });
  await setup(css);
  await css.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: any[]
    ) {
      return String(args[0]).includes("webgl")
        ? null
        : (original as any).apply(this, args);
    } as any;
  });
  const c = await css.newPage();
  await c.goto("http://127.0.0.1:5201/?gallery");
  await c.waitForFunction(() => (window as any).__ready);
  await c.waitForTimeout(900);
  assert.equal(await c.locator('.ma-dice3d[data-renderer="css"]').count(), 6);
  const faces = await c.locator(".ma-cube").evaluateAll((nodes) =>
    nodes.map((node) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return [
        [0, 0, 1],
        [1, 0, 0],
        [0, -1, 0],
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, -1],
      ]
        .map((n, i) => ({
          face: i + 1,
          z: matrix.transformPoint(new DOMPoint(...n, 0)).z,
        }))
        .sort((a, b) => b.z - a.z)[0].face;
    }),
  );
  assert.deepEqual(faces, [1, 2, 3, 4, 5, 6]);
  await c.screenshot({ path: join(out, "css-fallback.png") });
  results.push({ webglUnavailableCssFaces: faces });
  await css.close();
  for (const height of [844, 664]) {
    const mobile = await browser.newContext({
      viewport: { width: 390, height },
      isMobile: true,
      hasTouch: true,
    });
    await setup(mobile);
    const m = await mobile.newPage();
    await m.goto("http://127.0.0.1:5201/?duel");
    await m.waitForFunction(
      () =>
        document.querySelectorAll('.ma-duel .ma-dice3d[data-renderer="webgl"]')
          .length === 2,
    );
    const boxes = await m.locator(".ma-duel .ma-dice3d").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    assert.equal(boxes[0].w, boxes[1].w);
    assert.ok(boxes[0].x + boxes[0].w <= boxes[1].x);
    assert.ok(boxes[0].x >= 0 && boxes[1].x + boxes[1].w <= 390);
    await m.screenshot({ path: join(out, `duel-390x${height}.png`) });
    await m.goto("http://127.0.0.1:5201/");
    await m.waitForFunction(() => (window as any).__ready);
    assert.ok(
      await m.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await m.evaluate(() => (window as any).__play());
    await m.waitForFunction(
      () => document.querySelectorAll(".ma-float-layer .ma-float").length >= 2,
      {},
      { timeout: 20000 },
    );
    await m.waitForTimeout(400);
    const labels = await m
      .locator(".ma-float-layer .ma-float")
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => +getComputedStyle(n).opacity > 0.2)
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }),
      );
    for (let i = 0; i < labels.length; i++)
      for (const b of labels.slice(i + 1)) {
        const a = labels[i];
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
          "visible labels overlap",
        );
      }
    await m.screenshot({
      path: join(out, `phone-390x${height}.png`),
      fullPage: true,
    });
    results.push({
      viewport: [390, height],
      duel: "same size, no overlap",
      labels: labels.length,
      horizontalOverflow: false,
    });
    await mobile.close();
  }
  // One lightweight sample per version, no video/CPU slowdown and no three-round loop.
  for (const label of process.env.MA_POLISH_NO_PERF === "1"
    ? []
    : ["before", "after"]) {
    const sample = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-ma-build": label },
    });
    await setup(sample);
    const s = await sample.newPage();
    await s.goto("http://127.0.0.1:5201/");
    await s.waitForFunction(() => (window as any).__ready);
    await s.waitForTimeout(2800);
    const fps = await s.evaluate(async () => {
      (window as any).__play();
      const start = performance.now();
      let frames = 0,
        last = start,
        maxGap = 0;
      return await new Promise<{ fps: number; maxGap: number }>((resolve) => {
        const tick = (now: number) => {
          frames++;
          maxGap = Math.max(maxGap, now - last);
          last = now;
          if (now - start >= 20000)
            resolve({ fps: (frames * 1000) / (now - start), maxGap });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
    results.push({ singleSample: label, ...fps });
    await sample.close();
  }
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log("POLISH_UI_PASS", JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
