import { chromium } from "playwright";
import { createGame, act } from "../packages/xiabaiwang/src/engine.ts";
import { freshAids } from "../apps/server/src/xb-aids.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
const baseline = process.argv.includes("--baseline"),
  out = "docs/xiabaiwang/layout-fix";
const capture = join(out, baseline ? "before" : "after");
mkdirSync(capture, { recursive: true });
const data = mkdtempSync(join(tmpdir(), "xb-layout-"));
for (const n of [3, 6, 10]) {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `第${i + 1}位名字长达八字`,
  }));
  let s = createGame(players, 52 + n);
  const discussion = structuredClone(s);
  while (s.round < n) {
    s = act(s, s.guesser, {
      type: "GUESS",
      target:
        s.round % 2
          ? s.truth
          : s.players.find((p) => p.id !== s.guesser && p.id !== s.truth)!.id,
      round: s.round,
    });
    s = act(s, s.host, { type: "NEXT", round: s.round });
  }
  s = act(s, s.guesser, { type: "GUESS", target: s.truth, round: s.round });
  const reveal = structuredClone(s);
  const over = act(s, s.host, { type: "NEXT", round: s.round });
  for (const [phase, state] of [
    ["D", discussion],
    ["R", reveal],
    ["O", over],
  ] as const) {
    const code = `LY${String(n).padStart(2, "0")}${phase}X`,
      aids = freshAids();
    aids.speechSeconds = 30;
    aids.speakerAt = Date.now();
    writeFileSync(
      join(data, code + ".json"),
      JSON.stringify({
        code,
        players: players.map((p) => ({ ...p, token: "layout-" + p.id })),
        state,
        version: 1,
        aids,
      }),
    );
  }
}
const port = 3396,
  base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/main.ts"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DBD_DATA_DIR: join(data, "dbd"),
      XB_DATA_DIR: data,
    },
    stdio: "ignore",
  },
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROME,
});
const errors: string[] = [],
  results: any[] = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    assert(i < 150, "fixture server starts");
    await new Promise((r) => setTimeout(r, 100));
  }
  const c = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await c.addInitScript(() => {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("xb-draft:")) sessionStorage.removeItem(key);
    localStorage.setItem("xb-onboarding-v3", "1");
    for (const role of ["guesser", "truth", "bluffer"])
      localStorage.setItem("xb-role-hint-v3:" + role, "1");
    for (const n of [3, 6, 10])
      for (const phase of ["D", "R", "O"])
        localStorage.setItem(
          `xb-token:LY${String(n).padStart(2, "0")}${phase}X`,
          "layout-p0",
        );
  });
  const p = await c.newPage();
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => errors.push(e.message));
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await p.setViewportSize(size);
    for (const n of [3, 6, 10])
      for (const phase of ["discussion", "guess", "reveal", "over"]) {
        const code = `LY${String(n).padStart(2, "0")}${phase === "over" ? "O" : phase === "reveal" ? "R" : "D"}X`;
        await p.goto(base + "/?game=xb&room=" + code);
        await p
          .locator(
            '.xb-world[data-stage="' +
              (phase === "guess" ? "discussion" : phase) +
              '"]',
          )
          .waitFor();
        if (phase === "guess")
          await p.getByTestId("xb-primary").click({ force: true });
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(
          !baseline && size.width < 650 && n !== 3 ? 1700 : 100,
        );
        const metrics = await p.evaluate<any>(String.raw`(()=>{
    const rect=(s)=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,display:getComputedStyle(e).display};};
    return {screen:innerHeight,width:innerWidth,pageWidth:document.documentElement.scrollWidth,stage:rect(".xb-stage"),seats:rect(".xb-seats"),dock:rect(".xb-dock"),top:rect(".xb-topbar"),cards:[...document.querySelectorAll(".xb-podium-player")].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})};
   })()`);
        results.push({ n, phase, size, ...metrics });
        if (size.width < 650 && size.width < size.height) {
          if (!baseline) {
            assert(
              metrics.stage.height >= size.height * 0.6,
              `${n}/${phase}/${size.width}: stage ${metrics.stage.height} >= ${size.height * 0.6}`,
            );
            assert(metrics.seats.height <= 84, `${n}/${phase}: seats <=84`);
            if (phase === "over")
              assert.equal(metrics.seats.display, "none", "finale hides seats");
            assert(
              metrics.pageWidth <= size.width,
              "no horizontal page scroll",
            );
            if (phase === "over")
              for (const r of metrics.cards)
                assert(
                  r.top >= metrics.stage.y &&
                    r.bottom <= metrics.stage.y + metrics.stage.height,
                  "podium fits stage",
                );
          }
          if (n !== 3)
            await p.screenshot({
              path: join(
                capture,
                `${n}-${phase}-${size.width}x${size.height}.png`,
              ),
            });
        }
      }
  }
  if (!baseline) {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + "/?game=xb&room=LY10DX");
    await p.locator('.xb-world[data-stage="discussion"]').waitFor();
    const selfVisible = await p.getByTestId("xb-seat-0").evaluate((e) => {
      const s = e.closest(".xb-seats")!.getBoundingClientRect(),
        r = e.getBoundingClientRect();
      return r.left >= s.left && r.right <= s.right;
    });
    assert(selfVisible, "own seat initially visible");
    await p.locator(".xb-voice-aid summary").click();
    await p.getByTestId("xb-call-p9").click();
    await p.waitForFunction(() => {
      const e = document.getElementById("xb-avatar-p9")!,
        r = e.getBoundingClientRect(),
        s = e.closest(".xb-seats")!.getBoundingClientRect();
      return (
        e.classList.contains("is-speaking") &&
        r.left >= s.left &&
        r.right <= s.right
      );
    });
    for (const size of [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
    ]) {
      await p.setViewportSize(size);
      await p.addStyleTag({
        content: ".xb-world .xb-dock{padding-bottom:38px!important}",
      });
      const h = await p
        .locator(".xb-stage")
        .evaluate((e) => e.getBoundingClientRect().height);
      assert(h >= size.height * 0.6, "34px iPhone safe area keeps stage >=60%");
    }
    await p.getByTestId("xb-role").click();
    assert(
      !(await p.getByTestId("xb-seats").isVisible()),
      "full-screen role hides seats",
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, baseline ? "before.json" : "after.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  if (!baseline) {
    const old = JSON.parse(
      readFileSync(join(out, "before.json"), "utf8"),
    ).results;
    for (const row of results.filter((r) => r.size.width >= 650)) {
      const prev = old.find(
        (x: any) =>
          x.n === row.n &&
          x.phase === row.phase &&
          x.size.width === row.size.width,
      );
      for (const region of ["stage", "seats", "dock", "top"])
        assert.deepEqual(
          row[region],
          prev[region],
          `landscape/tablet ${region} unchanged`,
        );
    }
  }
  console.log(
    baseline ? "XB_LAYOUT_BASELINE_CAPTURED" : "XB_LAYOUT_PASS",
    results.length,
    "stage fixtures",
  );
} finally {
  await browser.close();
  server.kill();
}
