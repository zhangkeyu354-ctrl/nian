import { chromium } from "playwright";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { gameScope } from "../packages/drawing-party/src/index.ts";
import { assertUiShot } from "./screenshot-check.ts";
const url = process.env.DP_URL ?? "http://127.0.0.1:3017",
  out = process.env.DP_AUDIT_OUT ?? "work/canvas-clear",
  audit = process.env.DP_AUDIT_ONLY === "1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(),
  ss: Socket[] = [],
  metrics: any[] = [];
const req = (s: Socket, e: string, p: any) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(8000)
      .emit(e, p, (err: any, r: any) =>
        err || !r?.ok ? reject(err ?? Error(r?.error)) : resolve(r),
      ),
  );
try {
  for (const mode of ["tp", "fa"]) {
    const sockets: Socket[] = [],
      seats: any[] = [];
    let op = 0;
    for (let i = 0; i < 3; i++) {
      const s = io(url, { transports: ["websocket"], forceNew: true });
      sockets.push(s);
      ss.push(s);
      await new Promise<void>((r) => s.once("connect", r));
    }
    const { code } = await req(sockets[0], "dp:create", { mode, count: 3 });
    for (let i = 0; i < 3; i++) {
      await req(sockets[i], "dp:join", { code });
      seats.push(await req(sockets[i], "dp:claim", { code, name: "画家" + i }));
    }
    const action = async (i: number, a: any) => {
      await new Promise((r) => setTimeout(r, 100));
      const v = (
        await req(sockets[i], "dp:join", { code, token: seats[i].token })
      ).snapshot.view;
      return req(sockets[i], "dp:action", {
        code,
        token: seats[i].token,
        scope: v ? gameScope(v) : "lobby",
        op: String(++op),
        action: a,
      });
    };
    for (let i = 0; i < 3; i++) await action(i, { type: "READY" });
    await action(0, { type: "START" });
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript(
      ({ code, token }) => localStorage.setItem("dp-token-" + code, token),
      { code, token: seats[0].token },
    );
    const p = await ctx.newPage();
    await p.goto(url + "/?game=" + mode + "&room=" + code);
    await p.getByTestId("drawing-studio").waitFor();
    if (mode === "tp") {
      for (let i = 1; i < 3; i++)
        await action(i, { type: "THEME_VOTE", theme: 6 });
      await p.getByRole("button", { name: "自定义", exact: true }).click();
      await p.getByLabel("给朋友写个题目").waitFor();
      for (let i = 1; i < 3; i++)
        await action(i, { type: "TEXT", text: "小鸡" });
      await p.getByLabel("给朋友写个题目").fill("小鸡");
      await p.getByRole("button", { name: "写好了", exact: true }).click();
    } else {
      for (let i = 1; i < 3; i++)
        await action(i, { type: "CATEGORY_VOTE", category: 2 });
      await p.getByRole("button", { name: "家具 / 电器", exact: true }).click();
    }
    await p.getByLabel("绘画画布").waitFor();
    if (!audit && mode === "tp") {
      const b = (await p.getByLabel("绘画画布").boundingBox())!;
      const cd = await ctx.newCDPSession(p);
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b.x + b.width * 0.7, y: b.y + b.height * 0.5 }],
      });
      for (let j = 1; j <= 48; j++) {
        const angle = (j * Math.PI) / 24;
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: b.x + b.width * 0.5 + b.width * 0.2 * Math.cos(angle),
              y: b.y + b.height * 0.5 + b.width * 0.2 * Math.sin(angle),
            },
          ],
        });
        await p.waitForTimeout(18);
      }
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cd.detach();
      await p.waitForTimeout(700);
      await p.getByRole("button", { name: "画笔工具", exact: true }).click();
      await p.getByRole("button", { name: "颜色3", exact: true }).click();
    }

    async function capture(label: string, focusOnly = false) {
      for (const viewport of focusOnly
        ? [
            { width: 390, height: 844 },
            { width: 844, height: 390 },
          ]
        : [
            { width: 390, height: 844 },
            { width: 375, height: 667 },
            { width: 430, height: 932 },
            { width: 844, height: 390 },
            { width: 667, height: 375 },
          ]) {
        await p.setViewportSize(viewport);
        await p.waitForTimeout(600);
        const info = await p.evaluate(() => {
          const c = document.querySelector("canvas")!.getBoundingClientRect();
          let inkRatio: number | null = null;
          const cEl = document.querySelector("canvas")!;
          const pixels = cEl
            .getContext("2d")!
            .getImageData(0, 0, cEl.width, cEl.height).data;
          let x0 = cEl.width,
            y0 = cEl.height,
            x1 = -1,
            y1 = -1;
          for (let y = 0; y < cEl.height; y++)
            for (let x = 0; x < cEl.width; x++) {
              const k = (y * cEl.width + x) * 4;
              if (pixels[k] < 90 && pixels[k + 1] < 90 && pixels[k + 2] < 90) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
              }
            }
          if (x1 >= x0) inkRatio = (x1 - x0 + 1) / (y1 - y0 + 1);
          return {
            inkRatio,
            canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
            overlap: [...document.querySelectorAll(".st-world button")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.width > 0 &&
                  r.height > 0 &&
                  getComputedStyle(el).visibility !== "hidden" &&
                  Math.min(c.right, r.right) - Math.max(c.left, r.left) > 2 &&
                  Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top) > 2
                );
              })
              .map(
                (el) => el.getAttribute("aria-label") ?? el.textContent?.trim(),
              ),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        metrics.push({ mode, label, ...viewport, ...info });
        await assertUiShot(p, `${out}/${mode}-${label}-${viewport.width}.png`);
        if (!audit) {
          assert.deepEqual(
            info.overlap,
            [],
            "buttons cover artwork " + JSON.stringify(metrics.at(-1)),
          );
          assert(!info.overflow);
          assert(
            info.canvas.x >= -1 &&
              info.canvas.y >= -1 &&
              info.canvas.x + info.canvas.width <= viewport.width + 1 &&
              info.canvas.y + info.canvas.height <= viewport.height + 1,
            "canvas clipped after controls",
          );
          if (info.inkRatio !== null)
            assert(
              Math.abs(info.inkRatio - 1) < 0.08,
              "stroke changed shape after rotation",
            );
          if (viewport.width < viewport.height)
            assert(
              info.canvas.height >= viewport.width * 0.7,
              "portrait paper too short",
            );
        }
      }
    }
    await capture("draw");
    if (!audit) {
      await p.getByRole("button", { name: "放大画布", exact: true }).click();
      await capture("focus", true);
      await p.getByRole("button", { name: "返回画室 ↙", exact: true }).click();
    }
    if (mode === "tp") {
      for (let i = 1; i < 3; i++) {
        if (!audit) {
          const v = (
            await req(sockets[i], "dp:join", { code, token: seats[i].token })
          ).snapshot.view;
          await req(sockets[i], "dp:stroke", {
            code,
            token: seats[i].token,
            scope: gameScope(v),
            chunk: {
              id: "circle",
              seq: 0,
              color: 0,
              width: 8,
              end: true,
              points: Array.from({ length: 49 }, (_, j) => [
                512 + 200 * Math.cos((j * Math.PI) / 24),
                512 + 200 * (4 / 3) * Math.sin((j * Math.PI) / 24),
                j * 16,
              ]),
            },
          });
        }
        await action(i, { type: "SUBMIT" });
      }
      await p.getByRole("button", { name: "画好了" }).click();
      await p.getByLabel("写下你的猜测").waitFor();
      await capture("guess");
      if (!audit) {
        await p.setViewportSize({ width: 390, height: 844 });
        await p.getByRole("button", { name: "逐笔回放" }).click();
        await p.waitForTimeout(3200);
        const dl = p.waitForEvent("download");
        await p.getByRole("button", { name: "保存图", exact: true }).click();
        const download = await dl;
        await download.saveAs(out + "/drawing-export.png");
        const png = readFileSync(out + "/drawing-export.png");
        assert.equal(png.readUInt32BE(16), 2048);
        assert.equal(png.readUInt32BE(20), 1536);
      }
    }
    await ctx.close();
    sockets.forEach((s) => s.disconnect());
  }
  writeFileSync(out + "/metrics.json", JSON.stringify(metrics, null, 2));
  console.log(
    audit ? "AUDIT_RECORDED" : "CANVAS_CLEAR_PASS",
    JSON.stringify(metrics),
  );
} finally {
  ss.forEach((s) => s.disconnect());
  await browser.close();
}
