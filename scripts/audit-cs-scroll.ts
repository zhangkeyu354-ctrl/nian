import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Server } from "socket.io";
import { chromium } from "playwright";
import { attachCrimeScene } from "../apps/server/src/cs-sockets.ts";
import { reduceGame } from "../packages/crime-scene/src/game.ts";

const dir = mkdtempSync(join(tmpdir(), "cs-scroll-"));
const web = resolve("dist/web");
const http = createServer((req, res) => {
  const requested = resolve(web, `.${decodeURIComponent(req.url?.split("?")[0] ?? "/")}`);
  const safe = requested.startsWith(web) ? requested : join(web, "index.html");
  try {
    const path = safe === web ? join(web, "index.html") : safe;
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2" } as Record<string, string>)[extname(path)] ?? "text/html; charset=utf-8");
    res.end(readFileSync(path));
  } catch { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(readFileSync(join(web, "index.html"))); }
});
const io = new Server(http);
const store = attachCrimeScene(io, dir, { maxRooms: 2, idleMs: 60000 });
await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
const address = http.address();
if (!address || typeof address === "string") throw new Error("测试服务器未启动");
const browser = await chromium.launch({ headless: true });
try {
  const room = store.create();
  const tokens = Array.from({ length: 12 }, (_, seat) => room.claim(`玩家${seat + 1}`));
  room.start(tokens[0], 1000, () => .25);
  let state = reduceGame(room.file.state!, { type: "start", seat: 0, location: "location-1" }, 1000, () => 0);
  state = reduceGame(state, { type: "tick" }, 61000, () => 0);
  room.file.state = state;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(([code, token]) => localStorage.setItem(`crime-scene:${code}`, token), [room.file.code, tokens[1]]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`http://127.0.0.1:${address.port}/?game=crime-scene&room=${room.file.code}`);
  await page.getByRole("heading", { name: "案件板" }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".cs-evidence img")].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });
  const metrics = await page.evaluate(async () => {
    const frames: number[] = [];
    let last = performance.now();
    const end = last + 2500;
    while (performance.now() < end) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      const now = performance.now(); frames.push(now - last); last = now;
      scrollBy(0, 14);
    }
    frames.sort((a, b) => a - b);
    return { images: document.querySelectorAll(".cs-evidence img").length, frames: frames.length, medianMs: Math.round(frames[Math.floor(frames.length * .5)]), p95Ms: Math.round(frames[Math.floor(frames.length * .95)]), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  if (metrics.overflow) throw new Error("12 人手机页面横向溢出");
  console.log(JSON.stringify({ cpuThrottle: 4, ...metrics }));
  await context.close();
} finally {
  await browser.close();
  await new Promise<void>((done) => io.close(() => http.close(() => done())));
  rmSync(dir, { recursive: true, force: true });
}
