import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { Server } from "socket.io";
import { chromium, type Page, type BrowserContext } from "playwright";
import { attachNaodongScale } from "../apps/server/src/nd-rooms.ts";
import {
  viewForND,
  type NDState,
} from "../packages/naodong-scale/src/index.ts";
import type { NDSnapshot } from "../packages/shared/src/nd-protocol.ts";
import { assertUiShot } from "./screenshot-check.ts";
const out = process.env.ND_UI_OUT ?? "docs/naodong-scale/ui-v2/after";
mkdirSync(out, { recursive: true });
let clock = Date.now();
const http = createServer((req, res) => {
  const path = resolve(
    "dist/web",
    (req.url ?? "/").split("?")[0].replace(/^\//, ""),
  );
  const file =
    existsSync(path) && extname(path) ? path : resolve("dist/web/index.html");
  if (!file.startsWith(resolve("dist/web"))) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
  };
  res.setHeader(
    "Content-Type",
    mime[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
const io = new Server(http);
const store = attachNaodongScale(io, mkdtempSync(join(tmpdir(), "nd-ui-")), {
  maxRooms: 100,
  idleMs: 86400000,
  allowFixedSeed: false,
  clock: () => clock,
  tickMs: 10,
});
const versions = new Map<string, NDState | null>();
io.on("connection", (socket) =>
  socket.onAnyOutgoing((event, s: NDSnapshot) => {
    if (event === "nd:update")
      versions.set(
        `${s.code}:${s.version}`,
        structuredClone(store.rooms.get(s.code)!.file.state),
      );
  }),
);
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PW_CHROME ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors: string[] = [],
  checks: string[] = [],
  screens: object[] = [],
  games: object[] = [];
let packetChecks = 0,
  layoutChecks = 0,
  domPrivacyChecks = 0;
let contexts: BrowserContext[] = [],
  pages: Page[] = [],
  snaps: (NDSnapshot | undefined)[] = [];
async function until(fn: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI state wait timed out");
}
async function open(i: number) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(c);
  const p = await c.newPage();
  pages.push(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      try {
        const raw = String(f.payload);
        if (!raw.startsWith("42")) return;
        const a = JSON.parse(raw.slice(2));
        if (a[0] !== "nd:update") return;
        const s = a[1] as NDSnapshot;
        snaps[i] = s;
        if (s.view) {
          const authoritative = versions.get(`${s.code}:${s.version}`);
          assert.ok(authoritative);
          assert.ok(
            JSON.stringify(s.view) ===
              JSON.stringify(viewForND(authoritative, s.mySeat)),
            "private projection mismatch",
          );
          packetChecks++;
        }
      } catch (e) {
        errors.push(String(e));
      }
    }),
  );
  await p.goto(url + "/?game=nd");
  return p;
}
async function synced() {
  await until(() => snaps.every((s) => s && s.version === snaps[0]?.version));
}
async function primary(i: number) {
  const before = snaps[i]!.version;
  await pages[i].locator(".nd-primary").click();
  await until(() => snaps[i]!.version > before);
  await synced();
}
async function capture(p: Page, key: string) {
  await p.waitForTimeout(120);
  const layout = await p.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    scroll: document.documentElement.scrollWidth,
    primary: document.querySelectorAll(".nd-action .nd-primary").length,
    missing: [...document.images].filter(
      (im) => !im.complete || im.naturalWidth === 0,
    ).length,
  }));
  assert.ok(layout.scroll <= layout.w + 1, `horizontal overflow ${key}`);
  assert.ok(layout.primary <= 1);
  assert.equal(layout.missing, 0);
  if (key.includes("order-") || key.includes("round-end-")) {
    const bounds = await p.evaluate(() => {
      const stage = document
        .querySelector(".nd-stage")!
        .getBoundingClientRect();
      return [...document.querySelectorAll(".nd-order>button,.nd-flip")].every(
        (e) => {
          const b = e.getBoundingClientRect();
          return b.top >= stage.top - 1 && b.bottom <= stage.bottom + 1;
        },
      );
    });
    assert.ok(bounds, `primary order/reveal content clipped ${key}`);
  }
  let seatRailHeight: number | null = null,
    stageEndGap: number | null = null,
    topicLines: number | null = null;
  if (await p.locator(".nd-layout").count()) {
    const compact = await p
      .locator(".nd-seats")
      .evaluate((e) => e.getBoundingClientRect().height);
    seatRailHeight = compact;
    assert.ok(compact <= 72, `seat rail too tall ${key}: ${compact}`);
    if (layout.w === 390) {
      const bottom = await p.evaluate(() => {
        const stage = document
            .querySelector(".nd-stage")!
            .getBoundingClientRect(),
          end = document
            .querySelector("[data-nd-stage-end]")!
            .getBoundingClientRect();
        return { last: end.bottom, limit: stage.bottom };
      });
      stageEndGap = bottom.limit - bottom.last;
      assert.ok(
        bottom.last <= bottom.limit + 1,
        `last stage line clipped ${key}: ${JSON.stringify(bottom)}`,
      );
    }
    if (
      key.includes("order-") ||
      key.includes("reveal-") ||
      key.includes("round-end-")
    ) {
      assert.equal(
        await p.locator(".nd-topic-summary").count(),
        1,
        `topic must remain visible ${key}`,
      );
      const rows = await p.locator(".nd-topic-summary").evaluate((e) => {
        const c = getComputedStyle(e);
        return (
          (e.getBoundingClientRect().height -
            parseFloat(c.paddingTop) -
            parseFloat(c.paddingBottom) -
            parseFloat(c.borderTopWidth) -
            parseFloat(c.borderBottomWidth)) /
          parseFloat(c.lineHeight)
        );
      });
      topicLines = rows;
      assert.ok(rows <= 3.1, `topic longer than 3 lines ${key}`);
    }
  }
  layoutChecks++;
  const evidence = await assertUiShot(p, join(out, key + ".png"), "body");
  screens.push({
    key,
    ...layout,
    seatRailHeight,
    stageEndGap,
    topicLines,
    evidence,
  });
}
async function screenPhase(n: number, key: string, i = 0) {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await pages[i].setViewportSize(vp);
    await capture(pages[i], `${n}-${key}-${vp.width}x${vp.height}`);
  }
  await pages[i].setViewportSize({ width: 390, height: 844 });
}
async function menu(p: Page, label: string) {
  await p.getByRole("button", { name: "菜单", exact: true }).click();
  await p.getByRole("button", { name: label, exact: true }).click();
}
async function closeMenu(p: Page) {
  await p.getByRole("button", { name: "关闭菜单" }).click();
}
async function answer(n: number, shot: boolean) {
  await until(() => snaps[0]?.view?.phase === "ANSWER");
  const cap = snaps[0]!.view!.captain;
  if (shot) {
    for (let seat = 0; seat < n; seat++) {
      const digits = await pages[seat]
        .locator(".nd-secret-card>b")
        .allTextContents();
      assert.ok(digits.every((d) => Number(d) === snaps[seat]!.view!.myNumber));
      assert.equal(await pages[seat].locator(".nd-flip").count(), 0);
      domPrivacyChecks++;
    }
    const i = n === 9 ? 1 : cap;
    await screenPhase(n, "secret", i);
    await pages[i].waitForTimeout(3100);
    await screenPhase(n, "answer", i);
    if (n === 9) {
      await pages[i].emulateMedia({ reducedMotion: "reduce" });
      await pages[i].locator(".nd-secret-tag").click();
      assert.equal(
        await pages[i]
          .locator(".nd-secret-card")
          .evaluate((e) => getComputedStyle(e).animationName),
        "none",
      );
      await pages[i].locator(".nd-secret-overlay").click();
      await pages[i].emulateMedia({ reducedMotion: "no-preference" });
      checks.push("9: reduced motion disables secret flip animation");
      clock += 60001;
      await until(() => !!snaps[0]?.expired);
      await capture(pages[i], "9-server-deadline-reminder");
      checks.push("9: real server reminder preserves answer stage");
    }
    assert.equal(
      await pages[i].locator(".nd-stage input,.nd-stage textarea").count(),
      0,
    );
    checks.push(`${n}: voice-only answer`);
  }
  for (const i of [
    cap,
    ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== cap),
  ]) {
    if (snaps[i]!.view!.myNumber === null) continue;
    if (await pages[i].locator(".nd-secret-overlay").isVisible())
      await pages[i].locator(".nd-secret-overlay").click();
    await primary(i);
  }
  await until(() => ["ORDER", "EXPERT"].includes(snaps[0]!.view!.phase));
}
async function sort(n: number, shot: boolean, descending = false) {
  const cap = snaps[0]!.view!.captain,
    p = pages[cap];
  const desired = snaps
    .map((s, i) => ({ i, n: s!.view!.myNumber }))
    .filter((s) => s.n !== null)
    .sort((a, b) => (descending ? b.n! - a.n! : a.n! - b.n!))
    .map((s) => s.i);
  if (shot) {
    await screenPhase(n, "order", cap);
    const buttons = p.locator("[data-order-seat]");
    const a = Number(await buttons.nth(0).getAttribute("data-order-seat")),
      b = Number(await buttons.nth(1).getAttribute("data-order-seat"));
    await buttons.nth(0).click();
    await buttons.nth(1).click();
    assert.equal(
      Number(await buttons.nth(0).getAttribute("data-order-seat")),
      b,
    );
    assert.equal(
      Number(await buttons.nth(1).getAttribute("data-order-seat")),
      a,
    );
    checks.push(`${n}: tap swaps order`);
    // Touch-compatible pointer drag uses actual coordinates and capture.
    const from = await buttons.nth(0).boundingBox(),
      to = await buttons.nth(1).boundingBox();
    assert.ok(from && to);
    const touch = await p.context().newCDPSession(p);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      ],
    });
    for (let k = 1; k <= 8; k++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x:
              from.x +
              from.width / 2 +
              ((to.x + to.width / 2 - from.x - from.width / 2) * k) / 8,
            y:
              from.y +
              from.height / 2 +
              ((to.y + to.height / 2 - from.y - from.height / 2) * k) / 8,
          },
        ],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    assert.equal(
      Number(await buttons.nth(0).getAttribute("data-order-seat")),
      a,
    );
    checks.push(`${n}: mobile touch drag moves order`);
  }
  let current = await p
    .locator("[data-order-seat]")
    .evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).dataset.orderSeat)),
    );
  for (let k = 0; k < desired.length; k++) {
    if (current[k] === desired[k]) continue;
    await p.locator(`[data-order-seat="${current[k]}"]`).click();
    await p.locator(`[data-order-seat="${desired[k]}"]`).click();
    const j = current.indexOf(desired[k]);
    [current[k], current[j]] = [current[j], current[k]];
  }
  await primary(cap);
  assert.deepEqual(snaps[cap]!.view!.order, desired);
  await until(() => snaps[0]!.view!.phase === "REVEAL");
}
try {
  for (const n of [4, 6, 9]) {
    contexts = [];
    pages = [];
    snaps = [];
    for (let i = 0; i < n; i++) await open(i);
    await pages[0].getByLabel("你的昵称").fill("十字长名测试甲乙丙丁");
    await pages[0]
      .getByRole("button", { name: "创建房间", exact: true })
      .click();
    await until(() => !!snaps[0]?.code);
    const code = snaps[0]!.code;
    await pages[0].getByLabel("人数", { exact: true }).selectOption(String(n));
    await until(() => snaps[0]!.settings.count === n);
    await pages[0].getByLabel("计时", { exact: true }).selectOption("60");
    await until(() => snaps[0]!.settings.seconds === 60);
    for (let i = 1; i < n; i++) {
      await pages[i].getByLabel("你的昵称").fill(`十字长名字测试${i}甲乙丙`);
      await pages[i].getByLabel("房间号（加入朋友时填写）").fill(code);
      await pages[i]
        .getByRole("button", { name: "加入房间", exact: true })
        .click();
      await until(() => snaps[i]?.mySeat === i);
    }
    await synced();
    await pages[0].getByText("人齐了，等房主开始", { exact: true }).waitFor();
    await screenPhase(n, "lobby");
    assert.equal(await pages[0].locator(".nd-seats .nd-me").count(), 1);
    assert.equal(await pages[0].locator(".nd-seats .nd-crown").count(), 1);
    if (n === 9) {
      const overflow = await pages[0]
        .locator(".nd-seats")
        .evaluate((e) => e.scrollWidth > e.clientWidth);
      assert.ok(overflow, "9p seat rail must scroll horizontally");
    }
    await pages[0].locator(".nd-seats button").first().click();
    assert.equal(await pages[0].locator(".nd-full-players li").count(), n);
    const names = await pages[0]
      .locator(".nd-full-players strong")
      .allTextContents();
    assert.deepEqual(
      names,
      snaps[0]!.players.map((p) => p.name),
    );
    await screenPhase(n, "full-players");
    await closeMenu(pages[0]);
    checks.push(
      `${n}: compact rail, crown, self mark and complete roster dialog`,
    );
    for (let i = 0; i < n; i++) await primary(i);
    await primary(0);
    await screenPhase(n, "choose-topic");
    await pages[0].locator(".nd-choices>button").first().click();
    await primary(0);
    await answer(n, true);
    // Reconnect by a real page reload, preserving the same credential and own number.
    const mine = snaps[1]!.view!.myNumber;
    const oldVersion = snaps[1]!.version;
    snaps[1] = undefined;
    await pages[1].reload();
    await until(
      () => snaps[1]?.mySeat === 1 && (snaps[1]?.version ?? -1) >= oldVersion,
    );
    await pages[1].locator(".nd-sort,.nd-answer").waitFor();
    assert.equal(snaps[1]!.view!.myNumber, mine);
    checks.push(`${n}: reload reconnect preserves seat and number`);
    await sort(n, true);
    await screenPhase(n, "reveal-before");
    await primary(snaps[0]!.view!.captain);
    await until(() => snaps[0]!.view!.revealed.length >= 1);
    await screenPhase(n, "reveal-first");
    await capture(pages[0], `${n}-reveal-middle-390x844`);
    await until(() => snaps[0]!.view!.phase === "ROUND_END");
    await screenPhase(n, "round-end");
    await menu(pages[0], "规则速览");
    await screenPhase(n, "rules");
    await closeMenu(pages[0]);
    await menu(pages[0], "本局回顾");
    await screenPhase(n, "review");
    await closeMenu(pages[0]);
    for (let round = 2; round <= 5; round++) {
      await primary(snaps[0]!.view!.captain);
      const cap = snaps[0]!.view!.captain;
      await until(() => snaps[cap]!.view!.choices.length === 2);
      await pages[cap].locator(".nd-choices>button").first().click();
      await primary(cap);
      await answer(n, false);
      await sort(n, false);
      await pages[cap]
        .getByRole("button", { name: "跳过", exact: true })
        .click();
      await until(() =>
        ["ROUND_END", "FINISHED"].includes(snaps[0]!.view!.phase),
      );
      await synced();
    }
    assert.equal(snaps[0]!.view!.result?.success, true);
    assert.equal(await pages[0].locator(".nd-result-gauge.success").count(), 1);
    await screenPhase(n, "finished");
    games.push({ players: n, rounds: snaps[0]!.view!.round, success: true });
    if (n === 9) {
      await pages[0].setViewportSize({ width: 1280, height: 800 });
      await capture(pages[0], "9-desktop-1280x800");
      await pages[0].setViewportSize({ width: 390, height: 844 });
      await contexts[0].setOffline(true);
      await pages[0].locator(".nd-disconnected").waitFor();
      await capture(pages[0], "9-disconnected-390x844");
      await contexts[0].setOffline(false);
      await pages[0].locator(".nd-disconnected").waitFor({ state: "hidden" });
      await primary(0);
      for (let i = 0; i < n; i++) await primary(i);
      await primary(0);
      for (let round = 1; round <= 2; round++) {
        const cap = snaps[0]!.view!.captain;
        await until(() => snaps[cap]!.view!.choices.length === 2);
        await pages[cap].locator(".nd-choices>button").first().click();
        await primary(cap);
        await answer(n, false);
        await sort(n, false, true);
        await pages[cap]
          .getByRole("button", { name: "跳过", exact: true })
          .click();
        await until(() =>
          ["ROUND_END", "FINISHED"].includes(snaps[0]!.view!.phase),
        );
        if (round === 1) {
          await screenPhase(n, "wrong-reveal");
          await primary(cap);
        }
      }
      assert.equal(snaps[0]!.view!.result?.success, false);
      assert.equal(await pages[0].locator(".nd-result-gauge.empty").count(), 1);
      await screenPhase(n, "team-failed");
      games.push({ players: 9, rounds: snaps[0]!.view!.round, success: false });
      checks.push("9: red cross and immediate cooperative defeat");
    }
    if (n === 4) {
      await primary(0);
      await pages[0].getByLabel("玩法", { exact: true }).selectOption("true");
      await until(() => snaps[0]!.settings.expert);
      for (let i = 0; i < n; i++) await primary(i);
      await primary(0);
      for (let round = 1; round <= 5; round++) {
        const cap = snaps[0]!.view!.captain;
        await until(() => snaps[cap]!.view!.choices.length === 2);
        await pages[cap].locator(".nd-choices>button").first().click();
        await primary(cap);
        await answer(n, false);
        if (round === 1) await screenPhase(n, "expert-guess", cap);
        for (const target of Array.from({ length: n }, (_, i) => i).filter(
          (i) => i !== cap,
        )) {
          await pages[cap]
            .locator(".nd-targets button")
            .filter({ hasText: `${target + 1}号 ` })
            .click();
          await pages[cap]
            .locator(".nd-number-grid button")
            .filter({
              hasText: new RegExp(`^${snaps[target]!.view!.myNumber}$`),
            })
            .click();
          await primary(cap);
        }
        assert.equal(snaps[0]!.view!.phase, "CAPTAIN_GUESS");
        const submitter = (cap + 1) % n;
        if (round === 1)
          await screenPhase(n, "expert-captain-guess", submitter);
        await pages[submitter]
          .locator(".nd-number-grid button")
          .filter({ hasText: new RegExp(`^${snaps[cap]!.view!.myNumber}$`) })
          .click();
        await primary(submitter);
        if (round < 5) await primary(cap);
      }
      assert.equal(snaps[0]!.view!.result?.success, true);
      await screenPhase(n, "expert-finished");
      games.push({ players: 4, expert: true, rounds: 5, success: true });
      checks.push(
        "4: expert targets and common captain guess complete five rounds",
      );
    }
    for (const c of contexts) await c.close();
  }
  const errorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const errorPage = await errorContext.newPage();
  await errorPage.goto(url + "/?game=nd");
  await errorPage.getByLabel("你的昵称").fill("连接测试");
  await errorPage.getByLabel("房间号（加入朋友时填写）").fill("ZZZZ");
  await errorPage
    .getByRole("button", { name: "加入房间", exact: true })
    .click();
  await errorPage.locator(".nd-error").waitFor();
  await capture(errorPage, "rejection-chinese-feedback");
  await errorContext.close();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url);
  await p.locator(".box-nd").scrollIntoViewIfNeeded();
  await capture(p, "homepage-box-390x844");
  await p.close();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(
    join(out, "REPORT.json"),
    JSON.stringify(
      {
        games,
        checks,
        packetChecks,
        layoutChecks,
        domPrivacyChecks,
        screens,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      games,
      checks,
      packetChecks,
      layoutChecks,
      domPrivacyChecks,
      screens: screens.length,
      errors,
    }),
  );
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
  store.close();
  await new Promise<void>((r) => io.close(() => r()));
}
