import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { chromium } from "playwright";
import { createWitchTown } from "../packages/witch-town/src/index.ts";
import { assertUiShot } from "./screenshot-check.ts";

// Saved authoritative test rooms use the actual application, DOM and styles.
// No live room, production fixture endpoint, or original private save is needed.
const root = mkdtempSync(join(tmpdir(), "wt-hand-layout-"));
const data = join(root, "wt");
mkdirSync(data);
const out = process.env.WT_HAND_OUT ?? "output/wt-hand-layout";
mkdirSync(out, { recursive: true });
const counts = [3, 9, 19, 30];
const rooms = counts.map((count) => {
  const code = (0xa0000000 + count).toString(16).toUpperCase();
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `布局测试${i + 1}`,
  }));
  const state = createWitchTown(
    { players, countsProfile: "candidate-59", allowCandidateCounts: true },
    () => 0.37,
  );
  state.phase = "day";
  state.pending = null;
  state.turnPlayerId = players[1].id;
  const cards = [...state.players.flatMap((p) => p.hand), ...state.deck];
  state.players.forEach((p) => {
    p.hand = [];
  });
  state.players[0].hand = cards.splice(0, count);
  for (const p of state.players.slice(1)) p.hand = cards.splice(0, 3);
  state.deck = cards;
  const token = `fixture-${code}`;
  writeFileSync(
    join(data, `${code}.json`),
    JSON.stringify({
      schemaVersion: 1,
      game: "witch-town",
      code,
      capacity: 4,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hostId: players[0].id,
      players: players.map((p) => ({
        ...p,
        ready: true,
        tokenHash: createHash("sha256")
          .update(token + p.id)
          .digest("hex"),
      })),
      state,
      receipts: {},
    }),
  );
  return { code, token: token + players[0].id, count };
});
const port = 3498;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(root, "dbd"),
      WT_DATA_DIR: data,
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
const browser = await chromium.launch();
const errors: string[] = [];
const results: unknown[] = [];
const violations: unknown[] = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    assert(i < 200, "test server failed to start");
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    for (const room of rooms) {
      const ctx = await browser.newContext({
        viewport,
        hasTouch: true,
        isMobile: true,
      });
      await ctx.addInitScript(({ code, token }) => {
        localStorage.setItem(
          `wt-seat-${code}`,
          JSON.stringify({
            name: "布局测试1",
            playerId: "p0",
            token,
            claimKey: "fixture",
          }),
        );
      }, room);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/?game=wt&room=${room.code}`);
      await page.locator(".wt-hand-slot").first().waitFor();
      assert.equal(await page.locator(".wt-hand-slot").count(), room.count);
      await page.waitForTimeout(1800);
      for (const time of [0, 100, 225, 2000]) {
        const audit = await page.evaluate((time) => {
          for (const el of document.querySelectorAll(".wt-hand-slot")) {
            for (const a of el.getAnimations())
              if ((a as CSSAnimation).animationName === "wt-deal") {
                a.pause();
                a.currentTime = time;
              }
          }
          return {
            horizontalScroll: document.documentElement.scrollWidth > innerWidth,
            cards: [
              ...document.querySelectorAll(".wt-hand-slot,.wt-hand .wt-card"),
            ].map((el) => {
              const r = el.getBoundingClientRect();
              const personal = document
                .querySelector(".wt-personal")!
                .getBoundingClientRect();
              return {
                className: el.className,
                x: r.x,
                right: r.right,
                bottom: r.bottom,
                outsideViewport:
                  r.left < -1 ||
                  r.right > innerWidth + 1 ||
                  r.bottom > innerHeight + 1,
                // The personal panel clips its contents, so clipping there also fails.
                clippedByPanel:
                  r.left < personal.left - 1 ||
                  r.right > personal.right + 1 ||
                  r.bottom > personal.bottom + 1,
              };
            }),
          };
        }, time);
        const row = { viewport, count: room.count, time, ...audit };
        results.push(row);
        // Entry animation intentionally emerges through the panel's clipping edge.
        // Require all cards inside that panel once settled; viewport bounds always apply.
        if (
          audit.horizontalScroll ||
          audit.cards.some(
            (c) => c.outsideViewport || (time === 2000 && c.clippedByPanel),
          )
        )
          violations.push(row);
      }
      await assertUiShot(
        page,
        `${out}/${viewport.width}x${viewport.height}-${room.count}.png`,
        "body",
        "allow",
      );
      // Every overlapping card must still have a real pointer-accessible area.
      for (let i = 0; i < room.count && !violations.length; i++) {
        const point = await page
          .locator(".wt-hand-slot button")
          .nth(i)
          .evaluate((button) => {
            const r = button.getBoundingClientRect();
            for (
              let y = Math.max(0, r.top) + 2;
              y < Math.min(innerHeight, r.bottom);
              y += 4
            )
              for (
                let x = Math.max(0, r.left) + 2;
                x < Math.min(innerWidth, r.right);
                x += 4
              )
                if (
                  document.elementFromPoint(x, y)?.closest("button") === button
                )
                  return { x, y };
            return null;
          });
        assert(point, `card ${i} must have an exposed hit area`);
        await page.mouse.click(point.x, point.y);
        const close = page.locator(".wt-close");
        await close.waitFor();
        await close.click();
      }
      await ctx.close();
    }
  }
  writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ results, violations, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.equal(
    violations.length,
    0,
    `${violations.length} layout frames overflow; see ${out}/report.json`,
  );
  console.log(
    `WT_HAND_LAYOUT_PASS ${results.length} frames, 12 screenshots; all cards pointer-accessible`,
  );
} finally {
  await browser.close();
  server.kill();
}
