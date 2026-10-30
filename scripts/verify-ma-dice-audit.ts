/** Inspect actual rendered WebGL poses in a PRIVATE instrumented build only. */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { chromium, type Page } from "playwright";
import { Quaternion, Vector3 } from "three";
import assert from "node:assert/strict";
const root = resolve("output/ma-polish-doodle/build"),
  out = resolve("output/ma-dice-audit");
mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname;
  const file = join(root, path === "/" ? "index.html" : path);
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
      } as Record<string, string>
    )[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(5202, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chromium" }),
  errors: string[] = [],
  results: any[] = [];
const normals = [
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];
async function poses(page: Page) {
  return page
    .locator("canvas[data-audit-pose]")
    .evaluateAll((nodes) =>
      nodes.map((n) => JSON.parse((n as HTMLElement).dataset.auditPose!)),
    );
}
function check(data: any[], values: number[]) {
  assert.equal(data.length, values.length);
  data.forEach((p, i) => {
    const top = new Vector3(...normals[values[i] - 1]).applyQuaternion(
      new Quaternion(...p.q),
    ).y;
    assert.ok(top > 0.9999, `wrong result ${values[i]}: ${top}`);
    assert.ok(Math.abs(p.p[1] - 0.5) < 0.006);
  });
}
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 430 },
  });
  await ctx.addInitScript("globalThis.__name=fn=>fn;");
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:5202/?gallery");
  await p.waitForFunction(
    () => document.querySelectorAll("canvas[data-audit-pose]").length === 6,
  );
  for (const [speed, factor] of [
    ["slow", 1.5],
    ["normal", 1],
    ["fast", 0.5],
  ] as const) {
    await p.evaluate((s) => {
      localStorage.setItem("ma-speed", s);
      window.dispatchEvent(new Event("ma-motion-speed"));
    }, speed);
    for (let repeat = 0; repeat < 2; repeat++) {
      await p.evaluate(() => (window as any).__galleryRoll(true));
      await p.waitForTimeout(750 * factor);
      await p.evaluate(() => (window as any).__galleryRoll(false));
      await p.waitForTimeout(620 * factor + 120);
      check(await poses(p), [1, 2, 3, 4, 5, 6]);
    }
    results.push({ speed, repeatedThrows: 2, facesCorrect: 12 });
  }
  await p.evaluate(() => {
    (window as any).__galleryRoll(true);
  });
  await p.waitForTimeout(100);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForTimeout(150);
  check(await poses(p), [1, 2, 3, 4, 5, 6]);
  results.push({ reducedMotion: "six exact faces" });
  await ctx.close();
  const phone = await browser.newContext({
    viewport: { width: 390, height: 664 },
  });
  await phone.addInitScript("globalThis.__name=fn=>fn;");
  const d = await phone.newPage();
  d.on("pageerror", (e) => errors.push(e.message));
  await d.goto("http://127.0.0.1:5202/?duel");
  await d.waitForFunction(
    () => document.querySelectorAll("canvas[data-audit-pose]").length === 2,
  );
  await d.evaluate(() => (window as any).__galleryRoll(true));
  await d.waitForTimeout(750);
  await d.evaluate(() => (window as any).__galleryRoll(false));
  await d.waitForTimeout(50);
  assert.ok(
    (await d
      .locator(".ma-ov-big")
      .evaluate((el) => +getComputedStyle(el).opacity)) < 0.1,
    "result caption appeared before the physical settle",
  );
  await d.waitForTimeout(750);
  assert.ok(
    (await d
      .locator(".ma-ov-big")
      .evaluate((el) => +getComputedStyle(el).opacity)) > 0.99,
    "settled result caption is hidden",
  );
  check(await poses(d), [2, 6]);
  await d.screenshot({ path: join(out, "duel-390x664.png") });
  results.push({ duel: "2 and 6 independently correct" });
  for (const [width, height] of [
    [390, 844],
    [390, 664],
    [1366, 768],
  ]) {
    await d.setViewportSize({ width, height });
    const boxes = await d.locator(".ma-duel .ma-dice3d").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    assert.equal(boxes.length, 2);
    assert.ok(Math.abs(boxes[0].w - boxes[1].w) < 1);
    assert.ok(boxes[0].x + boxes[0].w <= boxes[1].x);
    assert.ok(
      boxes.every(
        (b) =>
          b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height,
      ),
    );
    await d.screenshot({ path: join(out, `duel-${width}x${height}.png`) });
    const single = await phone.newPage();
    await single.setViewportSize({ width, height });
    await single.goto("http://127.0.0.1:5202/?single");
    await single.waitForFunction(
      () => document.querySelectorAll("canvas[data-audit-pose]").length === 1,
    );
    await single.waitForFunction(() =>
      document.querySelector(".ma-dice3d")?.classList.contains("is-ready"),
    );
    const handoff = await single.locator(".ma-dice3d").evaluate((el) => ({
      canvas: +getComputedStyle(el.querySelector("canvas")!).opacity,
      fallback: +getComputedStyle(el.querySelector(".ma-dice3d-wait")!).opacity,
      hidden: getComputedStyle(el.querySelector(".ma-dice3d-wait")!).visibility,
    }));
    assert.equal(handoff.canvas, 1);
    assert.equal(handoff.fallback, 0);
    assert.equal(handoff.hidden, "hidden");
    const box = await single.locator(".ma-dice3d").boundingBox();
    assert.ok(box);
    assert.ok(box.width >= Math.min(width * 0.55, 223));
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height,
    );
    await single.waitForTimeout(800);
    await single.screenshot({
      path: join(out, `single-${width}x${height}.png`),
    });
    await single.close();
    results.push({
      viewport: [width, height],
      duelWidth: boxes[0].w,
      singleWidth: box.width,
      overlap: false,
    });
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log("DICE_RENDER_AUDIT_PASS", JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
