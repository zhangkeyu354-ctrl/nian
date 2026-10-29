/** Compare actual old/new production UI; no rules or server are mocked. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import assert from "node:assert/strict";

const before = resolve("output/ma-motion-baseline");
const after = resolve(process.env.MA_MOTION_AFTER ?? "output/ma-motion-a4");
const out = resolve("output/ma-motion-a-verification");
mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname;
  const dir = req.headers["x-ma-build"] === "before" ? before : after;
  const file =
    path === "/fixtures.json"
      ? join(dir, "fixtures.json")
      : path.startsWith("/assets/")
        ? join(resolve("apps/web/public"), path)
        : join(
            dir,
            "prod-build",
            path.replace(/^\/prod\//, "") || "index.html",
          );
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    (
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".webp": "image/webp",
        ".woff2": "font/woff2",
      } as Record<string, string>
    )[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(5197, "127.0.0.1", r));
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const [width, height, layout] of [
    [390, 844, "grid"],
    [390, 664, "grid"],
    [390, 844, "art"],
    [1280, 800, "art"],
  ] as const) {
    const pairs: any[][] = [];
    for (const version of ["before", "after"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        extraHTTPHeaders: { "x-ma-build": version },
        reducedMotion: "reduce",
      });
      await context.addInitScript("globalThis.__name = (fn) => fn;");
      await context.addInitScript(
        (l) => localStorage.setItem("ma-board-layout", l),
        layout,
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:5197/prod/?scene=chain");
      await page.waitForFunction(() => (window as any).__maReady);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((img) => img.decode().catch(() => {})),
        );
      });
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important}",
      });
      await page.waitForTimeout(100);
      const boxes = await page.locator(".ma-pawn").evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect(),
            board = node.closest(".ma-grid,.ma-board-art")!.getBoundingClientRect(),
            style = getComputedStyle(node);
          return {
            title: node.getAttribute("title"),
            image: node.querySelector("img")?.getAttribute("src"),
            // B intentionally disables auto-follow under reduced motion;
            // compare anchors on the board, independent of camera scroll.
            x: r.x-board.x,
            y: r.y-board.y,
            w: r.width,
            h: r.height,
            left: style.left,
            top: style.top,
          };
        }),
      );
      assert.equal(boxes.length, 8);
      assert.deepEqual(errors, []);
      if (version === "after")
        for (const box of boxes) {
          assert.equal(box.left, "0px");
          assert.equal(box.top, "0px");
        }
      await page.screenshot({
        path: join(out, `${version}-${layout}-${width}x${height}.png`),
        fullPage: true,
      });
      pairs.push(boxes);
      // Reduced motion still consumes the exact engine-generated event burst.
      await page.evaluate(() => (window as any).__maPlay());
      await page.waitForFunction(
        () =>
          !(window as any).__maPlayback.busy &&
          !!document.querySelector('.ma-pawn[title*="第 13 格"]'),
      );
      await page.locator(".ma-pawn").first().click();
      assert.ok(await page.locator(".ma-lightbox").count());
      await context.close();
    }
    let maxDelta = 0;
    pairs[0].forEach((old, i) => {
      const next = pairs[1][i];
      assert.equal(next.title, old.title);
      assert.equal(next.image, old.image);
      for (const key of ["x", "y", "w", "h"]) {
        const delta = Math.abs(next[key] - old[key]);
        maxDelta = Math.max(maxDelta, delta);
        assert.ok(
          delta <= 1.1,
          `${layout} ${old.title}: ${key} delta ${delta}`,
        );
      }
    });
    results.push({
      viewport: [width, height],
      layout,
      maxDelta,
      geometry: pairs,
    });
  }
  // Capture queue wait requests, accelerating only those requests in this test.
  // The production budgets themselves remain unchanged and are compared exactly.
  for (const speed of ["slow", "normal", "fast"]) {
    const budgets: number[][] = [];
    for (const version of ["before", "after"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: { "x-ma-build": version },
      });
      await context.addInitScript("globalThis.__name=(fn)=>fn;");
      await context.addInitScript((s) => {
        localStorage.setItem("ma-speed", s);
        const g = window as any;
        let pb: any;
        g.__maTiming = { armed: false, done: false, waits: [] };
        Object.defineProperty(g, "__maPlayback", {
          get: () => pb,
          set: (v) => {
            if (g.__maTiming.armed && pb?.busy && !v.busy)
              g.__maTiming.done = true;
            pb = v;
          },
        });
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = ((fn: any, delay?: number, ...args: any[]) => {
          const code = String(fn),
            queueWait =
              code.includes("clearTimeout") && code.includes(".delete("),
            gap =
              code.includes("[native code]") &&
              [300, 600, 900].includes(delay ?? 0);
          if (g.__maTiming.armed && (queueWait || gap)) {
            g.__maTiming.waits.push(delay);
            return schedule(fn, 0, ...args);
          }
          return schedule(fn, delay, ...args);
        }) as typeof window.setTimeout;
      }, speed);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5197/prod/?scene=chain");
      await page.waitForFunction(() => (window as any).__maReady);
      await page.evaluate(() => {
        (window as any).__maTiming.armed = true;
        (window as any).__maPlay();
      });
      await page.waitForFunction(
        () => (window as any).__maTiming.done,
        {},
        { timeout: 15000 },
      );
      const waits = await page.evaluate(
        () => (window as any).__maTiming.waits as number[],
      );
      assert.ok(
        waits.length > 30,
        "Queue timer probe failed to identify waits",
      );
      budgets.push(waits);
      await context.close();
    }
    assert.deepEqual(budgets[1], budgets[0], `${speed}: queue budgets changed`);
    results.push({
      speed,
      waits: budgets[0],
      totalMs: budgets[0].reduce((a, b) => a + b, 0),
    });
  }
  writeFileSync(
    join(out, "verification.json"),
    JSON.stringify({ before: "b8a671c", after, results }, null, 2),
  );
  console.log(
    "PASS: 4 layout/viewport pairs, reduced-motion playback and card clicks; identical full-turn wait sequence at all 3 speeds",
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
