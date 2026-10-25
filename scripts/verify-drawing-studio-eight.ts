import { gameScope } from "../packages/drawing-party/src/index.ts";
import { chromium } from "playwright";
import { io, type Socket } from "socket.io-client";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
const url = process.env.DP_URL ?? "http://127.0.0.1:3013",
  out = "work/drawing-studio-eight";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const sockets: Socket[] = [];
const metrics: any[] = [];
const req = (s: Socket, e: string, p: object) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(8000)
      .emit(e, p, (err: any, r: any) =>
        err || !r?.ok ? reject(err ?? Error(r?.error)) : resolve(r),
      ),
  );
try {
  for (const mode of ["fa", "tp"]) {
    const ss: Socket[] = [],
      seats: any[] = [];
    let counter = 0;
    for (let i = 0; i < 8; i++) {
      const s = io(url, { transports: ["websocket"], forceNew: true });
      ss.push(s);
      sockets.push(s);
      await new Promise<void>((r) => s.once("connect", () => r()));
    }
    const { code } = await req(ss[0], "dp:create", { mode, count: 8 });
    for (let i = 0; i < 8; i++) {
      await req(ss[i], "dp:join", { code });
      seats.push(
        await req(ss[i], "dp:claim", { code, name: "画家" + (i + 1) }),
      );
    }
    const action = async (i: number, a: any) => {
      const sn = (await req(ss[i], "dp:join", { code, token: seats[i].token }))
          .snapshot,
        v = sn.view;
      return req(ss[i], "dp:action", {
        code,
        token: seats[i].token,
        scope: v ? gameScope(v) : "lobby",
        op: String(++counter),
        action: a,
      });
    };
    for (let i = 0; i < 8; i++) await action(i, { type: "READY" });
    await action(0, { type: "START" });
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(
      ({ code, token }) => localStorage.setItem("dp-token-" + code, token),
      { code, token: seats[0].token },
    );
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url + "/?game=" + mode + "&room=" + code);
    await page.getByTestId("drawing-studio").waitFor();
    if (mode === "fa") {
      await page.waitForTimeout(450);
      await page.screenshot({ path: out + "/fa-8-category.png" });
      for (let i = 1; i < 8; i++)
        await action(i, { type: "CATEGORY_VOTE", category: 1 });
      await page
        .getByRole("button", { name: "文具 / 工具", exact: true })
        .click();
    } else {
      for (let i = 1; i < 8; i++)
        await action(i, { type: "THEME_VOTE", theme: 6 });
      await page.getByRole("button", { name: "自定义", exact: true }).click();
      await page.getByLabel("给朋友写个题目").waitFor();
      for (let i = 1; i < 8; i++)
        await action(i, { type: "TEXT", text: "画一只戴帽子的猫" });
      await page.getByLabel("给朋友写个题目").fill("戴着帽子的猫");
      await page.getByRole("button", { name: "写好了" }).click();
    }
    await page.getByLabel("绘画画布").waitFor();
    await page.waitForTimeout(500);
    const b = (await page.getByLabel("绘画画布").boundingBox())!;
    metrics.push({
      mode,
      width: b.width,
      height: b.height,
      screen: [844, 390],
      widthShare: b.width / 844,
      heightShare: b.height / 390,
    });
    assert(b.width > 570 && b.height > 260 && b.y + b.height <= 390);
    // A real single-pointer cat silhouette; keep pointer down to inspect physical brush feedback.
    const points = [
      [0.29, 0.75],
      [0.29, 0.4],
      [0.27, 0.16],
      [0.4, 0.33],
      [0.6, 0.33],
      [0.73, 0.16],
      [0.7, 0.43],
      [0.71, 0.7],
      [0.62, 0.82],
      [0.42, 0.84],
      [0.29, 0.75],
    ];
    await page.mouse.move(
      b.x + b.width * points[0][0],
      b.y + b.height * points[0][1],
    );
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      await page.mouse.move(b.x + b.width * x, b.y + b.height * y, {
        steps: 8,
      });
      await page.waitForTimeout(30);
    }
    assert(
      await page
        .locator(".st-brush-cursor")
        .evaluate((e) => Number(getComputedStyle(e).opacity) > 0),
    );
    await page.screenshot({ path: out + "/" + mode + "-8-painting.png" });
    await page.mouse.up();
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".st-player").count(), 8);
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: out + "/" + mode + "-8-small-landscape.png",
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "打开游戏菜单" }).click();
    await page.getByRole("button", { name: "怎么玩", exact: true }).click();
    await page.screenshot({ path: out + "/" + mode + "-menu.png" });
    await page.getByRole("button", { name: "返回画室" }).click();
    if (mode === "tp") {
      await page.getByRole("button", { name: "画笔工具" }).click();
      await page.getByRole("button", { name: "撤销", exact: true }).click();
      await page.waitForTimeout(350);
      assert.equal(
        (
          await page.evaluate(() =>
            JSON.parse((window as any).render_game_to_text()),
          )
        ).view.drawing.strokes.length,
        0,
      );
      await page.getByRole("button", { name: "画笔工具" }).click();
    }
    assert.deepEqual(errors, []);
    await ctx.close();
    ss.forEach((s) => s.disconnect());
    console.log("EIGHT_UI_PASS", mode);
  }
  writeFileSync(out + "/metrics.json", JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  sockets.forEach((s) => s.disconnect());
  await browser.close();
}
