import { chromium, type Page, type BrowserContext } from "playwright";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createGame,
  act,
  type State,
} from "../packages/xiabaiwang/src/engine.ts";
import { TOPICS } from "../packages/xiabaiwang/src/topics.ts";
import { freshAids } from "../apps/server/src/xb-aids.ts";
import type { XBSnapshot } from "../packages/shared/src/xb-protocol.ts";
import { assertUiShot } from "./screenshot-check.ts";
const base = process.env.XB_TEST_URL ?? "http://127.0.0.1:3359",
  out = "docs/xiabaiwang/art-v4";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME,
  headless: true,
  args: ["--mute-audio"],
});
const states = new Map<Page, XBSnapshot>(),
  errors: string[] = [],
  shots: string[] = [],
  contexts: BrowserContext[] = [];
const sizes = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const name = (i: number) => "一二三四五六七八九十"[i] + "号今晚胡扯大王";
async function phone() {
  const ctx = await browser.newContext({
    viewport: sizes[0],
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(ctx);
  await ctx.addInitScript({
    content: `window.__xbBuzz=[];window.__xbToneStarts=0;Object.defineProperty(navigator,'vibrate',{configurable:true,value:function(v){window.__xbBuzz.push(v);return true;}});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__xbVisibility??'visible'});const A=window.AudioContext;if(A)window.AudioContext=class extends A{createOscillator(){const n=super.createOscillator(),s=n.start.bind(n);n.start=(...args)=>{window.__xbToneStarts++;return s(...args)};return n;}createBufferSource(){const n=super.createBufferSource(),s=n.start.bind(n);n.start=(...args)=>{window.__xbToneStarts++;return s(...args)};return n;}};`,
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      const raw = String(f.payload);
      if (raw.startsWith("42[")) {
        const [event, value] = JSON.parse(raw.slice(2));
        if (event === "xb:update") states.set(p, value);
      }
    }),
  );
  return p;
}
async function tap(p: Page, id: string) {
  await p.waitForFunction((id) => {
    const button = document.querySelector(
      `[data-testid="${id}"]`,
    ) as HTMLButtonElement | null;
    return !!button && !button.disabled;
  }, id);
  await p
    .getByTestId(id)
    .click({ force: id === "xb-start" || id === "xb-primary" });
  await delay(70);
}
async function stage(p: Page, s: string) {
  await p.locator(`.xb-world[data-stage="${s}"]`).waitFor();
}
async function stable(p: Page) {
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no horizontal overflow",
  );
}
async function shot(p: Page, label: string, selector?: string) {
  console.log("SHOT", label);
  for (const size of sizes) {
    await p.setViewportSize(size);
    if (selector) await p.locator(selector).scrollIntoViewIfNeeded();
    await stable(p);
    await p.evaluate(() => document.fonts.ready);
    await p
      .locator(".xb-studio-scene img")
      .evaluate((e: HTMLImageElement) => e.decode());
    await delay(100);
    const path = join(out, `${label}-${size.width}x${size.height}.png`);
    await assertUiShot(p, path, "body", "allow");
    shots.push(path);
  }
  await p.setViewportSize(sizes[0]);
}
async function swipe(p: Page, selector: string, direction: "left" | "right") {
  const box = (await p.locator(selector).boundingBox())!,
    cdp = await p.context().newCDPSession(p);
  const x = box.x + box.width * (direction === "left" ? 0.8 : 0.2),
    y = box.y + Math.min(box.height / 2, 100),
    dx = direction === "left" ? -170 : 170;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 4; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 4, y }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  await delay(300);
}
async function dismissHint(p: Page) {
  if (await p.getByTestId("xb-hint-dismiss").count())
    await tap(p, "xb-hint-dismiss");
}
async function guess(p: Page, index: number) {
  await tap(p, "xb-primary");
  await tap(p, "xb-seat-" + index);
  await tap(p, "xb-guess-confirm");
  await tap(p, "xb-guess-confirm");
}
let fixtureServer: ReturnType<typeof spawn> | undefined;
try {
  const pages = await Promise.all([phone(), phone(), phone()]),
    host = pages[0];
  await host.goto(base + "/?game=xb");
  await tap(host, "xb-create");
  await host.getByLabel("你的昵称").fill(name(0));
  await tap(host, "xb-join");
  await host.getByTestId("xb-tutorial").waitFor();
  const url = host.url();
  await host.getByTestId("xb-tutorial-skip").focus();
  await host.keyboard.press("Shift+Tab");
  assert(
    await host
      .getByTestId("xb-tutorial-next")
      .evaluate((e) => e === document.activeElement),
  );
  await host.keyboard.press("Tab");
  assert(
    await host
      .getByTestId("xb-tutorial-skip")
      .evaluate((e) => e === document.activeElement),
  );
  await shot(host, "01-tutorial-identity");
  await swipe(host, ".xb-tutorial h1", "left");
  assert((await host.locator(".xb-tutorial h1").innerText()).includes("开麦"));
  await shot(host, "02-tutorial-bluff");
  await tap(host, "xb-tutorial-next");
  await shot(host, "03-tutorial-score");
  await tap(host, "xb-tutorial-next");
  assert.equal(
    await host.evaluate(() => localStorage.getItem("xb-onboarding-v3")),
    "1",
  );
  await host.reload();
  await stage(host, "lobby");
  assert.equal(await host.getByTestId("xb-tutorial").count(), 0);
  for (let i = 1; i < 3; i++) {
    await pages[i].goto(url);
    await pages[i].getByLabel("你的昵称").fill(name(i));
    await tap(pages[i], "xb-join");
    await tap(pages[i], "xb-tutorial-skip");
  }
  await tap(host, "xb-menu");
  await host.getByTestId("xb-volume").fill("0.4");
  assert.equal(
    await host.evaluate(() => localStorage.getItem("xb-volume")),
    "0.4",
  );
  await host.getByRole("button", { name: "关闭面板" }).click();
  await host.reload();
  await stage(host, "lobby");
  await tap(host, "xb-menu");
  assert.equal(await host.getByTestId("xb-volume").inputValue(), "0.4");
  await host.getByRole("button", { name: "关闭面板" }).click();
  assert.equal(
    await host.getByTestId("xb-on-air").getAttribute("data-state"),
    "off",
  );
  await shot(host, "00-lobby");
  await host.getByTestId("xb-speech-setting").selectOption("30");
  await delay(80);
  assert(await pages[1].getByTestId("xb-speech-setting").isDisabled());
  await tap(host, "xb-start");
  await Promise.all(pages.map((p) => p.getByTestId("xb-eyes").waitFor()));
  assert.equal(new Set(pages.map((p) => states.get(p)!.readUntil)).size, 1);
  await shot(host, "07-eyes");
  const truth = pages.find(
      (p) =>
        states.get(p)!.view!.players.find((v) => v.id === states.get(p)!.me)
          ?.role === "truth",
    )!,
    liar = pages.find((p) => p !== host && p !== truth)!;
  const answer = states.get(truth)!.view!.answer!;
  for (const p of pages) await tap(p, "xb-eyes-open");
  assert(
    (await truth.getByTestId("xb-private-reading").innerText()).includes(
      answer,
    ),
  );
  for (const p of pages.filter((p) => p !== truth))
    assert(!(await p.content()).includes(answer));
  await shot(truth, "08-private-answer");
  await Promise.all(
    pages.map((p) => p.getByTestId("xb-eyes").waitFor({ state: "hidden" })),
  );
  for (const [p, role] of [
    [host, "guesser"],
    [truth, "truth"],
    [liar, "bluffer"],
  ] as const) {
    await p.getByTestId("xb-first-hint-" + role).waitFor();
    await shot(p, "04-first-" + role);
    await dismissHint(p);
  }
  assert.equal(
    await host.getByTestId("xb-on-air").getAttribute("data-state"),
    "live",
  );
  assert.equal(await host.locator(".xb-wave").count(), 0);
  await shot(host, "05-discussion", ".xb-paper");
  await truth.reload();
  await stage(truth, "discussion");
  assert.equal(await truth.getByTestId("xb-tutorial").count(), 0);
  assert.equal(await truth.getByTestId("xb-hint-dismiss").count(), 0);
  assert.equal(await truth.getByTestId("xb-eyes").count(), 0);
  await Promise.all(pages.map((p) => p.evaluate("window.__xbBuzz=[]")));
  const truthId = states.get(truth)!.me!,
    truthIndex = states.get(host)!.players.findIndex((p) => p.id === truthId),
    liarId = states.get(liar)!.me!;
  await tap(host, "xb-seat-" + truthIndex);
  await truth.getByTestId("xb-callout").waitFor();
  await shot(truth, "09-callout");
  for (const p of pages.filter((p) => p !== truth)) {
    assert.equal(await p.getByTestId("xb-callout").count(), 0);
    assert.equal(states.get(p)!.callout, undefined);
    assert.equal(await p.evaluate("window.__xbBuzz.length"), 0);
  }
  assert.equal(await truth.evaluate("window.__xbBuzz.length"), 1);
  const liarIndex = states.get(host)!.players.findIndex((p) => p.id === liarId);
  await tap(host, "xb-seat-" + liarIndex);
  await liar.getByTestId("xb-callout").waitFor();
  await truth.getByTestId("xb-callout").waitFor({ state: "hidden" });
  assert.equal(states.get(truth)!.callout, undefined);
  await tap(host, "xb-seat-" + truthIndex);
  await truth.getByTestId("xb-callout").waitFor();
  await liar.getByTestId("xb-callout").waitFor({ state: "hidden" });
  assert.equal(await host.getByTestId("xb-cheatsheet").count(), 0);
  for (const p of pages) assert(!("privateNotes" in states.get(p)!));
  await shot(host, "10-voice-aid", ".xb-voice-aid");
  await guess(host, truthIndex);
  await host.getByTestId("xb-reveal").waitFor();
  const revealed = JSON.stringify(states.get(host)!.view);
  await host.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="xb-reveal"]')
          ?.getAttribute("data-visible"),
      ) >= 1,
  );
  assert.equal(
    await host.getByTestId("xb-on-air").getAttribute("data-state"),
    "reveal",
  );
  await shot(host, "06-reveal-flip", ".xb-reveal-grid");
  await host.evaluate(
    "window.__xbVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(200);
  const starts = await host.evaluate("window.__xbToneStarts");
  await host.evaluate(
    "window.__xbVisibility='visible';document.dispatchEvent(new Event('visibilitychange'))",
  );
  await delay(400);
  assert.equal(
    await host.evaluate("window.__xbToneStarts"),
    starts,
    "returning must not replay audio",
  );
  assert.equal(await host.locator(".xb-point-flight").count(), 0);
  assert.equal(
    await host.getByTestId("xb-reveal").getAttribute("data-done"),
    "true",
  );
  assert.equal(JSON.stringify(states.get(host)!.view), revealed);
  for (const p of pages) {
    if (await p.getByTestId("xb-skip").count()) await tap(p, "xb-skip");
  }
  for (const p of pages) assert(!("revealedNotes" in states.get(p)!));
  await shot(host, "12-truth-card", ".xb-truth-carousel");
  const replayState = JSON.stringify(states.get(host)!.view);
  await tap(host, "xb-replay-flip-1");
  await delay(650);
  assert.equal(
    await host.getByTestId("xb-replay-flip-1").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    JSON.stringify(states.get(host)!.view),
    replayState,
    "flipping a cassette cannot change the game",
  );
  await shot(host, "12-replay-answer", ".xb-truth-carousel");
  await shot(host, "13-crown-vote", ".xb-crown-vote");
  const before = JSON.stringify(states.get(host)!.view);
  for (const p of pages) await tap(p, "xb-crown-" + liarId);
  assert.equal(JSON.stringify(states.get(host)!.view), before);
  for (let retry = 0; states.get(host)!.crownTotals?.[liarId] !== 3; retry++) {
    assert(retry < 200, "三名玩家的皇冠应同步");
    await delay(30);
  }
  assert.equal(states.get(host)!.crownTotals![liarId], 3);
  await host.reload();
  await stage(host, "reveal");
  assert.equal(
    await host.getByTestId("xb-reveal").getAttribute("data-done"),
    "true",
  );
  assert.equal(states.get(host)!.myCrownVote, liarId);
  for (let round = 2; round <= 3; round++) {
    await tap(host, "xb-next");
    await Promise.all(pages.map((p) => stage(p, "discussion")));
    await Promise.all(pages.map(dismissHint));
    const g = pages.find(
        (p) => states.get(p)!.me === states.get(host)!.view!.guesser,
      )!,
      t = pages.find((p) => !!states.get(p)!.view!.answer)!;
    await guess(
      g,
      states.get(host)!.players.findIndex((p) => p.id === states.get(t)!.me),
    );
    for (const p of pages) {
      await p.getByTestId("xb-reveal").waitFor();
      if (await p.getByTestId("xb-skip").count()) await tap(p, "xb-skip");
    }
    if (round === 2) {
      await host.getByTestId("xb-truth-carousel").scrollIntoViewIfNeeded();
      await delay(200);
      const beforeX = await host
        .getByTestId("xb-truth-carousel")
        .evaluate((e) => e.scrollLeft);
      await swipe(host, '[data-testid="xb-truth-carousel"]', "right");
      const afterX = await host
        .getByTestId("xb-truth-carousel")
        .evaluate((e) => e.scrollLeft);
      assert(afterX < beforeX, "history cards swipe");
    }
  }
  await tap(host, "xb-next");
  await stage(host, "over");
  assert((await host.locator(".xb-titles").innerText()).includes("最离谱瞎掰"));
  assert(
    (await host.locator(".xb-titles").innerText()).includes(
      states.get(host)!.players.find((p) => p.id === liarId)!.name,
    ),
  );
  await delay(2400);
  await shot(host, "17-podium", ".xb-podium");
  await host.emulateMedia({ reducedMotion: "reduce" });
  await host.locator('.xb-studio-scene[data-preblurred="true"]').waitFor();
  assert.equal(
    await host
      .locator(".xb-studio-scene img")
      .evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  await shot(host, "18-power-save", ".xb-podium");
  await Promise.all(contexts.map((c) => c.close()));
  contexts.length = 0;
  // Extreme fixtures use the real bank and seeded engine, never manually edited scores.
  const ten = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      name: name(i),
    })),
    data = mkdtempSync(join(tmpdir(), "xb-v3-extreme-"));
  const extremes = [
    [
      "EXTRE1",
      TOPICS.reduce((a, b) => (a.question.length > b.question.length ? a : b)),
    ],
    [
      "EXTRE2",
      TOPICS.reduce((a, b) => (a.answer.length > b.answer.length ? a : b)),
    ],
  ] as const;
  const fixtures: { code: string; state: State }[] = [];
  for (const [code, topic] of extremes) {
    let state: State | undefined;
    for (let seed = 1; seed <= 2000; seed++) {
      const s = createGame(ten, seed);
      if (s.topic.id === topic.id) {
        state = s;
        break;
      }
    }
    assert(state);
    const aids = freshAids();
    aids.speechSeconds = 30;
    writeFileSync(
      join(data, code + ".json"),
      JSON.stringify({
        code,
        players: ten.map((p) => ({ ...p, token: "fixture-" + p.id })),
        state,
        version: 1,
        aids,
      }),
    );
    fixtures.push({ code, state });
  }
  fixtureServer = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        PORT: "3361",
        HOST: "127.0.0.1",
        DBD_DATA_DIR: join(data, "dbd"),
        XB_DATA_DIR: data,
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3361/api/info")).ok) break;
    } catch {}
    assert(i < 200);
    await delay(50);
  }
  const p = await phone();
  await p
    .context()
    .addInitScript(
      "localStorage.setItem('xb-onboarding-v3','1');for(const r of ['guesser','truth','bluffer'])localStorage.setItem('xb-role-hint-v3:'+r,'1');",
    );
  for (const [i, fixture] of fixtures.entries()) {
    await p
      .context()
      .addInitScript(
        ({ code, me }) =>
          localStorage.setItem("xb-token:" + code, "fixture-" + me),
        {
          code: fixture.code,
          me: i === 0 ? fixture.state.guesser : fixture.state.truth,
        },
      );
    await p.goto("http://127.0.0.1:3361/?game=xb&room=" + fixture.code);
    await stage(p, "discussion");
    assert.equal(await p.locator(".xb-seat").count(), 10);
    await delay(1700); // Let the phase banner finish before capturing the question.
    if (i === 1) await p.locator(".xb-private summary").click();
    await shot(
      p,
      i === 0 ? "14-extreme-question" : "15-extreme-answer",
      i === 0 ? ".xb-paper" : ".xb-private",
    );
    await p.setViewportSize({ width: 360, height: 800 });
    await p
      .locator(i === 0 ? ".xb-paper" : ".xb-private")
      .scrollIntoViewIfNeeded();
    await stable(p);
    const metersFit = await p.locator(".xb-speech-ring").evaluateAll(
      (els) =>
        els.length === 10 &&
        els.every((e) => {
          const r = e.getBoundingClientRect();
          return (
            parseFloat(getComputedStyle(e).width) === 42 &&
            parseFloat(getComputedStyle(e).height) === 42 &&
            r.width >= 40 && r.width <= 48 && r.height >= 40 && r.height <= 48 &&
            !!e.getAttribute("aria-label") &&
            e.querySelectorAll("circle").length === 2
          );
        }),
    );
    assert(
      metersFit,
      "ten speech timers stay on avatar rings without extra rows",
    );
    const seatsFit = await p.locator(".xb-seat").evaluateAll((els) => {
      const first = els[0].getBoundingClientRect(),
        next = els[5].getBoundingClientRect();
      return Math.abs(first.top - next.top) < 1 && first.height <= 84;
    });
    assert(seatsFit, "ten-player phone seats form one compact horizontal row");
    await assertUiShot(
      p,
      join(out, `16-extreme-${i}-360.png`),
      "body",
      "allow",
    );
    shots.push(join(out, `16-extreme-${i}-360.png`));
    const fonts = await p.locator(".xb-world *").evaluateAll((els) => [
      ...new Set(
        els
          .filter(
            (e) =>
              e.textContent?.trim() && getComputedStyle(e).display !== "none",
          )
          .map((e) => {
            const size = getComputedStyle(e).fontSize;
            return (size === "10px" || size === "12px") &&
              e.closest(".xb-seats,.xb-dock,.xb-podium")
              ? "14px"
              : size;
          }),
      ),
    ]);
    assert(
      fonts.every((f) => ["14px", "17px", "22px", "28px"].includes(f)),
      JSON.stringify(fonts),
    );
  }
  for (const path of [
    "packages/xiabaiwang/src/rules.ts",
    "packages/xiabaiwang/src/topics.ts",
    "packages/xiabaiwang/src/topic-themes.ts",
  ])
    assert.deepEqual(
      readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
      execFileSync("git", ["show", "6ed7f74:" + path], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
      "topic bank and scoring rules frozen",
    );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, "art-report.json"),
    JSON.stringify(
      {
        complete: true,
        shots,
        errors,
        tutorialOnce: true,
        tutorialFocusTrap: true,
        volumePersisted: true,
        roleHintsOnce: true,
        readWindowCommon: true,
        calloutPrivate: true,
        notesRemoved: true,
        crownsNoScore: true,
        backgroundNoReplay:
          "visibilitychange simulation, production listener, oscillator start counter",
        refreshNoReplay: true,
        truthHistorySwipe: true,
        extremes: fixtures.map((f) => ({
          code: f.code,
          questionLength: f.state.topic.question.length,
          answerLength: f.state.topic.answer.length,
        })),
        scoringSHA: createHash("sha256")
          .update(readFileSync("packages/xiabaiwang/src/engine.ts"))
          .digest("hex"),
      },
      null,
      2,
    ),
  );
  console.log("XB_ART_V4_PASS " + shots.length + " screenshots");
} catch (e) {
  writeFileSync(
    join(out, "failure.json"),
    JSON.stringify({ error: String(e), errors }, null, 2),
  );
  for (const [i, c] of contexts.entries())
    for (const p of c.pages())
      await p
        .screenshot({ path: join("output/xb-ui-v3", `failure-${i}.png`) })
        .catch(() => {});
  throw e;
} finally {
  await browser.close();
  fixtureServer?.kill();
}
