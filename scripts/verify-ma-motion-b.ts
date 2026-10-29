/** B mobile videos and behavior checks, against the real production Game. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import assert from "node:assert/strict";
import { testRace, reduceMA } from "../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../packages/magical-athlete/src/privacy.ts";
import { racerName } from "../packages/magical-athlete/src/racers.ts";
import type { MAState } from "../packages/magical-athlete/src/types.ts";

const build = resolve(
  process.env.MA_MOTION_AFTER ?? "output/ma-motion-b-paired",
);
const out = resolve("output/ma-motion-b-verification");
mkdirSync(out, { recursive: true });
const fixtures = JSON.parse(readFileSync(join(build, "fixtures.json"), "utf8"));
function turn(before: MAState) {
  let after = structuredClone(before);
  const snapshot = after.turn!.snapshot;
  for (let n = 0; n < 100; n++) {
    const p = after.pending!;
    assert.ok(p, "fixture lost pending choice");
    const option =
      p.options.find((o) => o.value !== "no" && o.value !== "keep") ??
      p.options[0];
    after = reduceMA(after, {
      type: "ANSWER",
      player: p.player,
      value: option.value,
    });
    if (after.turn?.snapshot !== snapshot) break;
  }
  assert.notEqual(
    after.turn?.snapshot,
    snapshot,
    "fixture must finish its turn",
  );
  return {
    before: viewForMA(before, "p1"),
    after: viewForMA(after, "p1"),
    effects: after.log.slice(before.log.length).filter((e) => e.fx),
  };
}
const roles = [
  "banana",
  "legs",
  "alchemist",
  "coach",
  "centaur",
  "blimp",
  "twin",
  "third_wheel",
];
fixtures.back = turn(
  testRace({
    racers: roles,
    pos: [14, 2, 3, 4, 8, 9, 20, 27],
    rolls: [2],
    track: "wild",
    skipSetup: true,
    secondWindPreview: true,
  }),
);
fixtures.warp = turn(
  testRace({
    racers: [
      "third_wheel",
      "legs",
      "alchemist",
      "banana",
      "coach",
      "centaur",
      "blimp",
      "twin",
    ],
    pos: [2, 10, 10, 25, 18, 19, 22, 27],
    rolls: [1],
    skipSetup: true,
    secondWindPreview: true,
  }),
);
fixtures.drag = turn(
  testRace({
    racers: [
      "hypnotist",
      "legs",
      "alchemist",
      "banana",
      "coach",
      "centaur",
      "blimp",
      "twin",
    ],
    pos: [14, 20, 3, 25, 18, 19, 22, 27],
    rolls: [2],
    skipSetup: true,
    secondWindPreview: true,
  }),
);
fixtures.swap = turn(
  testRace({
    racers: [
      "sw_switcharoo",
      "legs",
      "alchemist",
      "banana",
      "coach",
      "centaur",
      "blimp",
      "twin",
    ],
    pos: [2, 10, 3, 25, 18, 19, 22, 27],
    rolls: [1],
    skipSetup: true,
    secondWindPreview: true,
  }),
);
assert.ok(
  fixtures.swap.effects.some((e: any) => e.fx?.kind === "control"),
  "swap fixture must actually transfer control",
);
writeFileSync(join(out, "fixtures.json"), JSON.stringify(fixtures, null, 2));
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname;
  if (path === "/fixtures.json") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(fixtures));
    return;
  }
  const file = path.startsWith("/assets/")
    ? join(resolve("apps/web/public"), path)
    : join(build, "prod-build", path.replace(/^\/prod\//, "") || "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    (
      {
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".woff2": "font/woff2",
      } as Record<string, string>
    )[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(5198, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chromium" });
const results: any[] = [];
try {
  for (const layout of ["grid", "art"] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: layout === "grid" ? 844 : 664 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: {
        dir: join(out, "videos"),
        size: { width: 390, height: layout === "grid" ? 844 : 664 },
      },
    });
    await context.addInitScript("globalThis.__name=(fn)=>fn;");
    await context.addInitScript((l) => {
      localStorage.setItem("ma-board-layout", l);
      localStorage.setItem("ma-speed", "normal");
      localStorage.setItem("ma-muted", "1");
    }, layout);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const kinds = new Set<string>();
    for (const scene of ["start", "back", "warp", "drag", "swap"]) {
      await page.goto(`http://127.0.0.1:5198/prod/?scene=${scene}`);
      await page.waitForFunction(() => (window as any).__maReady);
      if (scene !== "start")
        await page.waitForFunction(
          () => document.querySelectorAll(".ma-pawn").length === 8,
        );
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        await Promise.all(
          [...document.querySelectorAll<HTMLImageElement>(".ma-pawn img")].map(
            (i) => i.decode().catch(() => {}),
          ),
        );
      });
      await page.evaluate(() => {
        (window as any).__observedKinds = new Set();
        (window as any).__poseOnly = true;
        const sample = () => {
          for (const el of document.querySelectorAll<HTMLElement>(
            ".ma-travel[data-motion]",
          )) {
            (window as any).__observedKinds.add(el.dataset.motion);
            for (const a of el.getAnimations())
              for (const f of (a.effect as KeyframeEffect).getKeyframes())
                if ("top" in f || "left" in f)
                  (window as any).__poseOnly = false;
          }
          (window as any).__sampleId = requestAnimationFrame(sample);
        };
        sample();
        (window as any).__maPlay();
      });
      await page.waitForFunction(() => (window as any).__maPlayback?.busy);
      await page.waitForFunction(
        () => !(window as any).__maPlayback?.busy,
        {},
        { timeout: 120000 },
      );
      if (scene === "start")
        await page.screenshot({
          path: join(out, `${layout}-8-start.png`),
          fullPage: true,
        });
      const observed = await page.evaluate(() => {
        cancelAnimationFrame((window as any).__sampleId);
        return {
          kinds: [...(window as any).__observedKinds],
          poseOnly: (window as any).__poseOnly,
        };
      });
      assert.equal(observed.poseOnly, true);
      observed.kinds.forEach((k) => kinds.add(String(k)));
      for (const t of fixtures[scene].after.race.tokens) {
        if (t.out) continue;
        const pawn = page
          .locator(".ma-pawn")
          .filter({ has: page.locator(`img[alt="${racerName(t.racer)}"]`) })
          .first();
        const title = await pawn.getAttribute("title");
        assert.ok(
          title?.includes(t.place ? `第 ${t.place} 名` : `第 ${t.pos} 格`),
          `${layout}/${scene}/${t.racer}: ${title}`,
        );
        const colors = [
          "#e8443a",
          "#2f7fd8",
          "#f2b705",
          "#8a4fd6",
          "#1fa37a",
          "#f07c1e",
          "#e05aa8",
          "#20b2c8",
        ];
        const color = await pawn.evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue("--pc"),
        );
        assert.equal(
          color,
          colors[fixtures[scene].after.seats.indexOf(t.owner)],
          `${scene}: owner color mismatch`,
        );
      }
      await page.screenshot({
        path: join(out, `${layout}-${scene}-after.png`),
        fullPage: true,
      });
      results.push({
        layout,
        scene,
        kinds: observed.kinds,
        positions: "all authoritative destinations matched",
      });
    }
    for (const k of ["forward", "backward", "warp", "drag"])
      assert.ok(kinds.has(k), `${layout} missing ${k}`);
    assert.deepEqual(errors, []);
    const video = page.video()!;
    await context.close();
    await video.saveAs(join(out, `${layout}-mobile.webm`));
  }
  // Manual drag must suppress follow while held, then for 3 seconds after release.
  const context = await browser.newContext({
    viewport: { width: 390, height: 664 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript("globalThis.__name=(fn)=>fn;");
  await context.addInitScript(() =>
    localStorage.setItem("ma-board-layout", "art"),
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5198/prod/?scene=drag");
  await page.waitForFunction(() => (window as any).__maReady);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const original = window.scrollTo.bind(window);
    (window as any).__cameraCalls = [];
    window.scrollTo = ((options: any) => {
      if (options?.behavior === "smooth")
        (window as any).__cameraCalls.push(performance.now());
      original(options);
    }) as typeof window.scrollTo;
    const board = document.querySelector(".ma-board-scroll")!;
    board.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 150,
        clientY: 200,
        bubbles: true,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 150,
        clientY: 250,
        buttons: 1,
      }),
    );
    original({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(3150);
  assert.equal(
    await page.evaluate(() => (window as any).__cameraCalls.length),
    0,
    "followed during held drag",
  );
  await page.evaluate(() => {
    (window as any).__released = performance.now();
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
  });
  await page.waitForTimeout(2800);
  assert.equal(
    await page.evaluate(() => (window as any).__cameraCalls.length),
    0,
    "followed before 3 seconds",
  );
  await page.waitForFunction(
    () => (window as any).__cameraCalls.length > 0,
    {},
    { timeout: 2000 },
  );
  const delay = await page.evaluate(
    () => (window as any).__cameraCalls[0] - (window as any).__released,
  );
  assert.ok(delay >= 2990, `resumed early: ${delay}`);
  results.push({ manualPauseMs: delay, heldDrag: "no follow" });
  await context.close();
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(
      { recordingCpuThrottle: 1, physicalWeChat: false, results },
      null,
      2,
    ),
  );
  console.log(
    "PASS: both mobile layouts, 4 movement types, engine destinations, transform/opacity, held drag and 3-second pause",
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
