import { gzipSync } from "node:zlib";
import { assertUiShot } from "./screenshot-check.ts";
import { chromium } from "playwright";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3359",
  out = "docs/xiabaiwang/feel-v2";
mkdirSync(out, { recursive: true });
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: out, size: { width: 390, height: 844 } },
});
let delayCommand = 0;
await ctx.routeWebSocket("**/socket.io/**", (ws) => {
  const server = ws.connectToServer();
  ws.onMessage((m) => {
    if (delayCommand && typeof m === "string" && m.includes("xb:command"))
      setTimeout(() => server.send(m), delayCommand);
    else server.send(m);
  });
  server.onMessage((m) => ws.send(m));
});
let completed = false;
const page = await ctx.newPage(),
  errors: string[] = [],
  sockets: Socket[] = [],
  tokens: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
let latest: any;
const emit = (s: Socket, event: string, data: any) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(8000)
      .emit(event, data, (e: any, r: any) =>
        e ? reject(e) : r.ok ? resolve(r) : reject(Error(r.error)),
      ),
  );
const command = async (i: number, c: any) => {
  await sleep(60);
  return emit(sockets[i], "xb:command", { command: c });
};
const shot = async (name: string) => {
  await assertUiShot(page, `${out}/${name}.png`, "body", "allow");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
};
try {
  for (let i = 0; i < 10; i++) {
    const s = io(base, { transports: ["websocket"] });
    await new Promise<void>((r) => s.on("connect", () => r()));
    sockets.push(s);
  }
  const { code } = await emit(sockets[0], "xb:create", {});
  for (let i = 0; i < 10; i++) {
    const r = await emit(sockets[i], "xb:join", {
      code,
      name: `调频员${i + 1}`,
    });
    tokens.push(r.token);
  }
  sockets[0].on("xb:update", (s) => {
    latest = s;
  });
  await ctx.addInitScript({
    content: `localStorage.setItem(${JSON.stringify("xb-token:" + code)},${JSON.stringify(tokens[0])});window.__buzz=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:function(v){window.__buzz.push(v);return true;}});`,
  });
  await page.goto(base + "/?game=xb&room=" + code);
  await page.getByTestId("xb-start").waitFor();
  // Full10 theme selection: one8-question theme refuses; adding another works.
  await command(0, { type: "SET_TOPICS", themes: ["冷门汉字或词语"] });
  await assert.rejects(command(0, { type: "START" }), /题目不足/);
  await command(0, {
    type: "SET_TOPICS",
    themes: ["冷门汉字或词语", "奇怪的动植物"],
  });
  await page.getByTestId("xb-start").click();
  await page.getByTestId("xb-channel-banner").waitFor();
  await shot("01-opening");
  await page.locator('.xb-world[data-stage="discussion"]').waitFor();
  await sleep(500);
  delayCommand = 3700;
  await page.getByTestId("xb-speak").click();
  await page.getByText("网络有点慢…", { exact: true }).waitFor();
  await shot("00-network-slow");
  await page.getByTestId("xb-primary").waitFor({ state: "visible" });
  await sleep(800);
  delayCommand = 0;
  await page.getByTestId("xb-challenge").click();
  await page.getByTestId("xb-seat-1").click();
  const hold = page.getByTestId("xb-challenge-confirm"),
    box = await hold.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
  await sleep(150);
  assert(!latest.view.muted, "中途松手不应发送质疑");
  await hold.hover();
  await page.mouse.down();
  await sleep(180);
  await shot("02-hold-confirm");
  await sleep(550);
  await page.mouse.up();
  await page.getByTestId("xb-muted").waitFor();
  console.log("HOLD_BUZZ", await page.evaluate(() => (window as any).__buzz));
  assert(
    await page.evaluate(() =>
      (window as any).__buzz.some((v: any) => v === 10),
    ),
    "长按确认震动10ms",
  );
  const before = JSON.stringify(latest.view),
    target = latest.players[0].id;
  await emit(sockets[1], "xb:poop", { target });
  await page.locator(".xb-poop-flight").waitFor();
  await shot("03-poop");
  await sleep(2100);
  await emit(sockets[2], "xb:poop", { target });
  await page.locator(".xb-combo").first().waitFor();
  await shot("04-combo");
  await page.getByTestId("xb-shake-off").click();
  assert.equal(await page.getByTestId("xb-shake-off").count(), 0);
  assert.equal(JSON.stringify(latest.view), before, "娱乐不改规则状态");
  assert(
    await page.evaluate(() =>
      (window as any).__buzz.some(
        (v: any) => JSON.stringify(v) === "[30,40,30]",
      ),
    ),
    "命中只对被扔者请求指定震动",
  );
  await page.getByTestId("xb-poop").click();
  await page.getByTestId("xb-cancel").click();
  const sourceBox = await page.getByTestId("xb-poop").boundingBox(),
    dest = await page.getByTestId("xb-seat-2").boundingBox();
  assert(sourceBox && dest);
  await page.mouse.move(sourceBox.x + 20, sourceBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(dest.x + 20, dest.y + 20, { steps: 12 });
  assert.equal(await page.locator(".xb-drag-preview").count(), 1);
  await shot("05-drag-preview");
  await page.mouse.up();
  await sleep(200);
  assert.equal(JSON.stringify(latest.view), before, "拖拽也不能改规则");
  await page.getByTestId("xb-menu").click();
  await page.getByTestId("xb-power-save").check();
  await shot("06-power-save");
  await page.getByRole("button", { name: "关闭面板" }).click();
  await page.getByTestId("xb-menu").click();
  await page.getByTestId("xb-power-save").uncheck();
  await page.getByRole("button", { name: "关闭面板" }).click();
  if (await page.getByTestId("xb-cancel").count())
    await page.getByTestId("xb-cancel").click();
  const cdp = await ctx.newCDPSession(page);
  let traceStream = "";
  cdp.on("Tracing.tracingComplete", (e) => {
    traceStream = e.stream!;
  });
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,benchmark",
    transferMode: "ReturnAsStream",
  });
  await page.evaluate(
    "window.__frames=[];var start=0;function sample(t){if(!start)start=t;window.__frames.push(t);if(t-start<11500)requestAnimationFrame(sample);}requestAnimationFrame(sample);",
  );
  const g = latest.players.findIndex((p: any) => p.id === latest.view.guesser);
  const truthSnap = (
    await emit(sockets[1], "xb:join", { code, token: tokens[1] })
  ).snapshot;
  // Need a legitimate guess; correctness is not required for the reveal presentation.
  await command(g, { type: "GUESS", target: latest.players[1].id, round: 1 });
  await page.getByTestId("xb-reveal").waitFor();
  // 性能段不执行截图像素解码/排序，避免把验收器开销当作游戏掉帧。
  await page.locator('[data-testid="xb-reveal"][data-scores="true"]').waitFor();
  await page.locator('[data-testid="xb-reveal"][data-done="true"]').waitFor();
  await sleep(800);
  const frames: number[] = await page.evaluate(() => (window as any).__frames);
  await cdp.send("Tracing.end");
  for (let i = 0; !traceStream && i < 200; i++) await sleep(100);
  assert(traceStream,"Performance trace未在20秒内完成导出");
  let trace = "";
  for (;;) {
    const r = await cdp.send("IO.read", { handle: traceStream });
    trace += r.data;
    if (r.eof) break;
  }
  await cdp.send("IO.close", { handle: traceStream });
  writeFileSync(`${out}/reveal-performance.trace.json.gz`, gzipSync(trace));
  const intervals = frames.slice(1).map((t, i) => t - frames[i]);
  const windows = [];
  for (let t = frames[0]; t + 1000 <= frames.at(-1)!; t += 1000)
    windows.push(frames.filter((f) => f >= t && f < t + 1000).length);
  const performance = {
    viewport: "390×844",
    players: 10,
    frames: frames.length,
    averageFps: (1000 * (frames.length - 1)) / (frames.at(-1)! - frames[0]),
    minimumOneSecondFps: Math.min(...windows),
    oneSecondFps: windows,
    longFramesOver50ms: intervals.filter((n) => n > 50).length,
    maxFrameMs: Math.max(...intervals),
    method:
      "Chromium CDP Performance trace + requestAnimationFrame，录屏同时开启；截图像素检查另轮执行，桌面环境，不代表所有手机硬件。",
  };
  writeFileSync(
    `${out}/performance.json`,
    JSON.stringify(performance, null, 2),
  );
  console.log("XB_PERFORMANCE", JSON.stringify(performance));
  assert(performance.minimumOneSecondFps >= 50, "揭晓每秒帧率低于50，需要优化");
  await page.getByTestId("xb-next").click();
  for (let round = 2; round <= 10; round++) {
    await page.locator('.xb-world[data-stage="discussion"]').waitFor();
    const snap = latest,
      g = latest.players.findIndex((p: any) => p.id === snap.view.guesser),
      other = latest.players.find((p: any) => p.id !== snap.view.guesser).id;
    await command(g, { type: "GUESS", target: other, round });
    if(round===2){
      await page.getByTestId("xb-reveal").waitFor();await shot("07-reveal-warmup");await sleep(1900);await shot("08-reveal-first");await sleep(2400);await shot("09-reveal-middle");await page.locator('[data-testid="xb-reveal"][data-scores="true"]').waitFor();await shot("10-reveal-score");await page.locator('[data-testid="xb-reveal"][data-done="true"]').waitFor();
    } else await page.getByTestId("xb-skip").click();
    await page.getByTestId("xb-next").click();
  }
  await page.getByTestId("xb-finale").waitFor();
  await sleep(1800);
  await shot("11-finale");
  await page
    .locator(".xb-stage")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await shot("12-finale-titles");
  const titles = page.locator(".xb-titles");
  const beforeX = await titles.evaluate((el) => el.scrollLeft);
  await titles.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  assert(
    (await titles.evaluate((el) => el.scrollLeft)) > beforeX,
    "称号应可横滑",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".xb-power-save").waitFor();
  assert.equal(await page.locator(".xb-power-save").count(), 1);
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/feel-report.json`,
    JSON.stringify(
      {
        complete: true,
        errors,
        longPress: true,
        cancelHold: true,
        drag: true,
        combo: true,
        shakeOff: true,
        powerSave: true,
        themeCapacity: true,
        scoreUnaffected: true,
      },
      null,
      2,
    ),
  );
  completed = true;
} finally {
  const video = page.video();
  for (const s of sockets) s.disconnect();
  await ctx.close();
  if (completed && video)
    renameSync(await video.path(), `${out}/feel-v2-demo.webm`);
  await browser.close();
}
