import { chromium, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import { RKRoom } from "../apps/server/src/rk-rooms.ts";
import {
  createRK,
  createTiles,
  assertInvariants,
  reduceRK,
  validateMeld,
  type RKState,
} from "../packages/rummikub/src/index.ts";
import { findRackMelds } from "../packages/rummikub/src/simulation.ts";
import { assertUiShot } from "./screenshot-check.ts";
const root = mkdtempSync(join(tmpdir(), "rk-ui-"));
const data = join(root, "rk");
mkdirSync(data);
const out = "docs/rummikub/ui-v1";
mkdirSync(out, { recursive: true });
const port = 3487;
const base = `http://127.0.0.1:${port}`;
const names = ["一二三四五六七八九十", "小王"];
function make(
  code: string,
  hands: string[][],
  board: string[][] = [],
  opened = true,
  current = 0,
) {
  const r = RKRoom.create(code, data, { allowFixedSeed: true });
  const users = hands.map((_, i) => r.claim(names[i] ?? `朋友${i + 1}`));
  const s = createRK(names, {
    seed: 1,
    minutes: 0,
    now: Date.now(),
    assertions: true,
  });
  s.current = current;
  const used = new Set([...hands.flat(), ...board.flat()]);
  s.players.forEach((p, i) => {
    p.rack = hands[i];
    p.opened = opened;
  });
  s.pool = createTiles()
    .map((t) => t.id)
    .filter((id) => !used.has(id));
  s.board = board.map((tiles, i) => ({ id: `m${i}`, tiles }));
  s.nextMeld = board.length;
  s.startDraw = [
    { seat: 0, tile: "R13a", round: 0 },
    { seat: 1, tile: "B08a", round: 0 },
  ];
  s.turn = {
    rack: [...hands[current]],
    board: structuredClone(s.board),
    retrieved: [],
  };
  s.draft = structuredClone(s.turn);
  assertInvariants(s);
  r.file.state = s;
  r.file.minutes = 0;
  r.file.players.forEach((p) => (p.ready = true));
  r.save();
  return { r, users, code };
}
const basicBoard = [
  ["B03a", "B04a", "B05a"],
  ["K07a", "R07a", "O07a"],
  ["O10a", "O11a", "O12a"],
];
const basicHand = [
  "R05a",
  "R06a",
  "R08a",
  "B08a",
  "B09a",
  "B10a",
  "K11a",
  "O04a",
  "O05a",
  "O06a",
  "K01a",
  "K02a",
  "K03a",
  "J1",
];
const cases: Record<string, ReturnType<typeof make>> = {};
for (const [suffix, label] of [
  ["P", "portrait"],
  ["L", "landscape"],
]) {
  cases[label + "-empty"] = make(
    "EM" + suffix + "A",
    basicHand ? [basicHand, ["B01a"]] : [],
    [],
    false,
  );
  cases[label + "-progress"] = make(
    "PR" + suffix + "A",
    [["R05a", "R06a", "R07a", "K13a"], ["B01a"]],
    [],
    false,
  );
  cases[label + "-drag"] = make(
    "DR" + suffix + "A",
    [basicHand, ["B01a"]],
    basicBoard,
  );
  cases[label + "-invalid"] = make(
    "IN" + suffix + "A",
    [["R05a", "R06a", "R08a", "K13a"], ["B01a"]],
    basicBoard,
  );
  cases[label + "-split"] = make(
    "SP" + suffix + "A",
    [["R07a", "K13a"], ["B01a"]],
    [["R01a", "R02a", "R03a", "R04a", "R05a", "R06a"]],
  );
  cases[label + "-joker"] = make(
    "JK" + suffix + "A",
    [["K03a", "K08a", "K09a", "K13a"], ["B01a"]],
    [["R03a", "B03a", "J1"]],
  );
  cases[label + "-others"] = make(
    "OT" + suffix + "A",
    [basicHand, ["B01a"]],
    basicBoard,
    true,
    1,
  );
  cases[label + "-timeout"] = make(
    "TM" + suffix + "A",
    [basicHand, ["B01a"]],
    basicBoard,
  );
  const tf = cases[label + "-timeout"];
  tf.r.file.state!.minutes = 1;
  tf.r.file.state!.deadline = Date.now() - 1;
  tf.r.tick(Date.now());
  tf.r.save();
  cases[label + "-result"] = make(
    "RS" + suffix + "A",
    [
      ["R09a", "R10a", "R11a"],
      ["B01a", "J1"],
    ],
    [],
    false,
  );
  const rf = cases[label + "-result"];
  let state = rf.r.file.state!;
  state = reduceRK(state, {
    type: "MOVE",
    actor: 0,
    seq: 1,
    now: Date.now(),
    tiles: ["R09a", "R10a", "R11a"],
    to: { meld: null },
  });
  state = reduceRK(state, {
    type: "COMMIT",
    actor: 0,
    seq: 2,
    now: Date.now(),
  });
  rf.r.file.state = state;
  rf.r.save();
  cases[label + "-disconnect"] = make(
    "DC" + suffix + "A",
    [basicHand, ["B01a"]],
    basicBoard,
  );
  const lob = RKRoom.create("LB" + suffix + "A", data, {
    allowFixedSeed: true,
  });
  const users = [lob.claim(names[0]), lob.claim(names[1])];
  lob.action(
    users[0].token,
    lob.file.version,
    1,
    { type: "SET_SETTINGS", count: 4, games: 4 },
    Date.now(),
  );
  cases[label + "-lobby"] = { r: lob, users, code: lob.file.code };
}
const h18 = [
  ...Array.from(
    { length: 13 },
    (_, i) => "R" + String(i + 1).padStart(2, "0") + "a",
  ),
  ...Array.from(
    { length: 5 },
    (_, i) => "B" + String(i + 1).padStart(2, "0") + "a",
  ),
];
cases["hand18"] = make(
  "HAND",
  [h18, ["K01a"]],
  basicBoard.filter((m) => !m.some((id) => h18.includes(id))),
);
const groups: string[][] = [];
for (const c of ["R", "B", "O", "K"])
  for (const cp of ["a", "b"])
    for (const st of [1, 4, 7, 10])
      groups.push(
        [st, st + 1, st + 2].map((n) => c + String(n).padStart(2, "0") + cp),
      );
const many = groups.slice(0, 22);
const rest = createTiles()
  .map((t) => t.id)
  .filter((id) => !many.flat().includes(id));
cases["table22"] = make("MANY", [rest.slice(0, 14), rest.slice(14, 28)], many);
cases["desktop"] = make("DESK", [basicHand, ["B01a"]], basicBoard);
const full = RKRoom.create("FULL", data, { allowFixedSeed: true });
const fullUsers = [full.claim("小王"), full.claim("小李")];
full.file.minutes = 0;
full.file.state = createRK(["小王", "小李"], {
  seed: 2113,
  minutes: 0,
  now: Date.now(),
  assertions: true,
});
full.file.players.forEach((x) => (x.ready = true));
full.save();
cases["full"] = { r: full, users: fullUsers, code: "FULL" };
let child: ChildProcess | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let serverLogs = "";
const reports: any[] = [];
const journeys: any[] = [];
const errors: string[] = [];
const botSockets: Socket[] = [];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function start() {
  child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        RK_DATA_DIR: data,
        DBD_DATA_DIR: join(root, "dbd"),
        RK_ALLOW_FIXED_SEED: "1",
        WT_DISABLE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout!.on("data", (b) => (serverLogs += b));
  child.stderr!.on("data", (b) => (serverLogs += b));
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return;
    } catch {}
    await delay(50);
  }
  throw Error("UI server not started");
}
const snapshot = (p: Page) =>
  p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function open(p: Page, key: string, draw = false) {
  const f = cases[key];
  await p.goto(base + "/?game=rk&room=" + f.code);
  await p.waitForFunction(() => {
    try {
      return !!JSON.parse(window.render_game_to_text())?.mySeat;
    } catch {
      return false;
    }
  });
  await p.waitForTimeout(100);
  if (!draw) {
    const button = p.getByRole("button", { name: "开始这一局", exact: true });
    if (await button.count()) await button.click();
  }
}
async function clickTile(p: Page, id: string) {
  const b = p.getByTestId("rk-tile-" + id);
  await b.scrollIntoViewIfNeeded();
  await b.click();
}
async function place(p: Page, ids: string[]) {
  for (const id of ids) await clickTile(p, id);
  await p.getByTestId("rk-new-group").click();
  await p.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return !!s.view?.draft?.board.length;
  });
  await p.waitForTimeout(70);
}
async function shot(p: Page, name: string) {
  const audit = await p.evaluate(() => {
    const rects = [".rk-action-wrap", ".rk-hand", ".rk-secondary"].map(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
      },
    );
    return {
      width: innerWidth,
      height: innerHeight,
      pageScroll: document.documentElement.scrollWidth > innerWidth + 1,
      dock: rects[0],
      hand: rects[1],
      secondary: rects[2],
      smallTargets: [
        ...document.querySelectorAll<HTMLElement>(
          ".rk-world button,.rk-world input,.rk-world select,.rk-world a",
        ),
      ].flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return [];
        const pseudo = getComputedStyle(el, "::after");
        const expanded =
          pseudo.content !== "none" && pseudo.content !== "normal";
        const w =
          r.width +
          (expanded
            ? Math.max(0, -(parseFloat(pseudo.left) || 0)) +
              Math.max(0, -(parseFloat(pseudo.right) || 0))
            : 0);
        const h =
          r.height +
          (expanded
            ? Math.max(0, -(parseFloat(pseudo.top) || 0)) +
              Math.max(0, -(parseFloat(pseudo.bottom) || 0))
            : 0);
        return w < 43.5 || h < 43.5
          ? [{ label: el.getAttribute("aria-label") ?? el.textContent, w, h }]
          : [];
      }),
      images: [
        ...document.querySelectorAll<HTMLImageElement>(".rk-world img"),
      ].every((im) => im.complete && im.naturalWidth > 0),
    };
  });
  assert.equal(audit.pageScroll, false, name + " page horizontal overflow");
  assert(audit.images, name + " images loaded");
  assert.deepEqual(audit.smallTargets, [], name + " targets below 44px");
  if (audit.dock && audit.hand) {
    assert(audit.dock.bottom <= audit.height + 1, name + " dock clipped");
    assert(audit.hand.bottom <= audit.dock.y + 1, name + " dock overlaps rack");
  }
  const pixels = await assertUiShot(p, out + "/" + name + ".png", ".rk-world");
  reports.push({ name, audit, pixels });
  console.log("SHOT", name);
}
try {
  await start();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROME,
  });
  const auth = Object.values(cases).map((f) => ({
    code: f.code,
    token: f.users[0].token,
  }));
  for (const direction of ["portrait", "landscape"]) {
    const context = await browser.newContext({
      viewport:
        direction === "portrait"
          ? { width: 390, height: 844 }
          : { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript((records) => {
      for (const a of records) localStorage.setItem("rk:" + a.code, a.token);
      localStorage.setItem("dp-sound", "0");
    }, auth);
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await open(p, direction + "-lobby");
    await shot(p, direction + "-lobby");
    await open(p, direction + "-empty", true);
    await p.getByRole("dialog", { name: "抽牌定先手" }).waitFor();
    await shot(p, direction + "-draw");
    await p.getByRole("button", { name: "开始这一局", exact: true }).click();
    await shot(p, direction + "-empty");
    await open(p, direction + "-progress");
    await place(p, ["R05a", "R06a", "R07a"]);
    assert.equal((await snapshot(p)).view.validation.points, 18);
    await shot(p, direction + "-progress");
    await open(p, direction + "-drag");
    const b = await p.getByTestId("rk-tile-R05a").boundingBox();
    await p.dispatchEvent('[data-testid="rk-tile-R05a"]', "pointerdown", {
      pointerType: "touch",
      pointerId: 55,
      clientX: b!.x + 15,
      clientY: b!.y + 20,
      bubbles: true,
    });
    await p.waitForTimeout(180);
    await p.dispatchEvent("body", "pointermove", {
      pointerType: "touch",
      pointerId: 55,
      clientX: 190,
      clientY: 205,
      bubbles: true,
    });
    await p.locator(".rk-drag-ghost").waitFor();
    await shot(p, direction + "-drag");
    await p.dispatchEvent("body", "pointercancel", {
      pointerId: 55,
      pointerType: "touch",
      bubbles: true,
    });
    await open(p, direction + "-invalid");
    await place(p, ["R05a", "R06a", "R08a"]);
    await p.locator(".rk-meld.invalid").waitFor();
    assert(await p.getByTestId("rk-commit").isDisabled());
    await shot(p, direction + "-invalid");
    await open(p, direction + "-split");
    const cut = p.getByRole("button", {
      name: "拆分第 1 组第 3 张之后",
      exact: true,
    });
    await cut.click();
    await cut.click();
    await p.waitForFunction(
      () =>
        JSON.parse(window.render_game_to_text()).view.draft.board.length === 2,
    );
    await shot(p, direction + "-split");
    await p.getByRole("button", { name: "选组", exact: true }).click();
    await p.getByRole("button", { name: "选择第 1 组", exact: true }).click();
    await p.getByRole("button", { name: "选择第 2 组", exact: true }).click();
    await p.getByRole("button", { name: "合并 2 组", exact: true }).click();
    await p.waitForFunction(
      () =>
        JSON.parse(window.render_game_to_text()).view.draft.board.length === 1,
    );
    journeys.push({
      name: direction + " split and merge through UI",
      passed: true,
    });
    await open(p, direction + "-joker");
    await shot(p, direction + "-joker");
    await open(p, direction + "-others");
    assert(await p.getByTestId("rk-commit").isDisabled());
    await shot(p, direction + "-others");
    await open(p, direction + "-timeout");
    await p.getByText(/超时，桌面已还原/).waitFor();
    await shot(p, direction + "-timeout");
    await open(p, direction + "-result");
    await p.getByRole("dialog", { name: "单局结算" }).waitFor();
    await shot(p, direction + "-result");
    await open(p, direction + "-disconnect");
    await context.setOffline(true);
    await p.getByText("重连中…", { exact: true }).waitFor();
    await shot(p, direction + "-disconnect");
    await context.setOffline(false);
    await p.getByText("重连中…", { exact: true }).waitFor({ state: "hidden" });
    await context.close();
  }
  const extra = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await extra.addInitScript((records) => {
    for (const a of records) localStorage.setItem("rk:" + a.code, a.token);
    localStorage.setItem("dp-sound", "0");
  }, auth);
  const p = await extra.newPage();
  await open(p, "hand18");
  assert.equal((await snapshot(p)).view.players[0].count, 18);
  assert(
    await p.locator(".rk-rack .rk-hit").evaluateAll((buttons) =>
      buttons.every((b) => {
        const tile = b.getBoundingClientRect(),
          rack = b.closest(".rk-rack")!.getBoundingClientRect();
        return tile.left >= rack.left && tile.right <= rack.right;
      }),
    ),
    "18 tiles fit without rack clipping",
  );
  await shot(p, "portrait-hand18");
  await open(p, "table22");
  for (let i = 0; i < 3; i++)
    await p.getByRole("button", { name: "缩小桌面" }).click();
  assert.equal((await snapshot(p)).view.board.length, 22);
  await shot(p, "portrait-table22");
  await p
    .locator(".rk-table-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  assert(
    await p.getByTestId("rk-meld-m21").evaluate((el) => {
      const box = el.getBoundingClientRect(),
        viewport = el.closest(".rk-table-scroll")!.getBoundingClientRect();
      return box.top >= viewport.top && box.bottom <= viewport.bottom;
    }),
    "last of 22 melds reachable within viewport",
  );
  await p.setViewportSize({ width: 1280, height: 800 });
  await open(p, "desktop");
  await shot(p, "desktop-1280");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(base + "/");
  await p.getByTestId("game-rk").scrollIntoViewIfNeeded();
  await assertUiShot(p, out + "/homepage-box.png", '[data-testid="game-rk"]');
  reports.push({ name: "homepage-box" });
  // Native touch drag, forbidden rack return, two-finger zoom and keyboard control.
  await open(p, "portrait-drag");
  const cdp = await p.context().newCDPSession(p);
  const source = (await p.getByTestId("rk-tile-R05a").boundingBox())!;
  const destination = (await p.getByTestId("rk-new-group").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: source.x + 19, y: source.y + 24, id: 0 }],
  });
  await p.waitForTimeout(180);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: destination.x + 40, y: destination.y + 25, id: 0 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.waitForFunction(() =>
    JSON.parse(window.render_game_to_text()).view.draft.board.some(
      (m: any) => m.tiles.length === 1 && m.tiles[0] === "R05a",
    ),
  );
  await p.getByRole("button", { name: "撤销", exact: true }).click();
  await p.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).view.draft.board.length === 3,
  );
  await p.getByRole("button", { name: "重做", exact: true }).click();
  await p.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).view.draft.board.length === 4,
  );
  await p.getByRole("button", { name: "全部还原", exact: true }).click();
  await p.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).view.draft.board.length === 3,
  );
  journeys.push({ name: "undo redo reset through UI", passed: true });
  const tableTile = (await p.getByTestId("rk-tile-B03a").boundingBox())!,
    rackBox = (await p.locator(".rk-rack").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tableTile.x + 14, y: tableTile.y + 20, id: 0 }],
  });
  await p.waitForTimeout(180);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: rackBox.x + 20, y: rackBox.y + 20, id: 0 }],
  });
  await p.locator(".rk-drag-ghost.forbidden").waitFor();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.getByText("桌面上的牌不能拿回手牌", { exact: true }).waitFor();
  assert(!(await snapshot(p)).view.draft.rack.includes("B03a"));
  const vp = (await p.locator(".rk-table-scroll").boundingBox())!;
  const cy = vp.y + vp.height / 2,
    cx = vp.x + vp.width / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 40, y: cy, id: 0 },
      { x: cx + 40, y: cy, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: cx - 75, y: cy, id: 0 },
      { x: cx + 75, y: cy, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.getByText("160%", { exact: true }).waitFor();
  journeys.push({
    name: "native long-press drag, forbid table-to-rack, pinch zoom",
    passed: true,
  });
  await p.getByTestId("rk-tile-R06a").focus();
  await p.keyboard.press("Space");
  assert.equal(
    await p.getByTestId("rk-tile-R06a").getAttribute("aria-pressed"),
    "true",
  );
  journeys.push({ name: "keyboard tile selection", passed: true });
  await p.getByRole("button", { name: "打开房间菜单" }).click();
  await p.getByRole("button", { name: /震动/ }).click();
  assert.equal(await p.evaluate(() => localStorage.getItem("rk-vibrate")), "0");
  await p.getByRole("button", { name: "查看规则" }).click();
  await p.getByRole("dialog", { name: "拉密规则" }).waitFor();
  await p.getByRole("button", { name: "知道了，回到牌桌" }).click();
  journeys.push({ name: "menu preferences and rules", passed: true });
  // Create and join through the real entry forms, then ready/start as host.
  const joinContext = await browser!.newContext({
    viewport: { width: 390, height: 844 },
  });
  const joinPage = await joinContext.newPage();
  await p.goto(base + "/?game=rk");
  await p.getByLabel("你的昵称", { exact: true }).fill("建房验收");
  await p.getByTestId("rk-create").click();
  await p.waitForFunction(() => {
    try {
      return !!JSON.parse(window.render_game_to_text())?.mySeat;
    } catch {
      return false;
    }
  });
  const createdCode = (await snapshot(p)).code;
  await joinPage.goto(base + "/?game=rk&room=" + createdCode);
  await joinPage.getByLabel("你的昵称", { exact: true }).fill("加入验收");
  await joinPage.getByRole("button", { name: "加入房间", exact: true }).click();
  await p.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).players.length === 2,
  );
  await p.getByRole("button", { name: "我准备好了", exact: true }).click();
  await joinPage.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).players[0].ready,
  );
  await joinPage
    .getByRole("button", { name: "我准备好了", exact: true })
    .click();
  await p.getByTestId("rk-start").click();
  await p.getByRole("dialog", { name: "抽牌定先手" }).waitFor();
  journeys.push({
    name: "UI create, join, ready and host start",
    passed: true,
  });
  await joinContext.close();
  // Full UI game: every play is chosen using that seat's own projected rack and clicked.
  const gameContexts = await Promise.all(
    [0, 1].map(() =>
      browser!.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  const gamePages = await Promise.all(gameContexts.map((c) => c.newPage()));
  for (let i = 0; i < 2; i++) {
    await gameContexts[i].addInitScript((a) => {
      localStorage.setItem("rk:FULL", a);
      localStorage.setItem("dp-sound", "0");
    }, fullUsers[i].token);
    await gamePages[i].goto(base + "/?game=rk&room=FULL");
    await gamePages[i].waitForFunction(() => {
      try {
        return !!JSON.parse(window.render_game_to_text())?.view;
      } catch {
        return false;
      }
    });
    const begin = gamePages[i].getByRole("button", {
      name: "开始这一局",
      exact: true,
    });
    if (await begin.count()) await begin.click();
  }
  let turns = 0;
  while (
    (await snapshot(gamePages[0])).view.phase === "PLAYING" &&
    turns < 1000
  ) {
    const common = (await snapshot(gamePages[0])).view,
      seat = common.current,
      pg = gamePages[seat],
      view = (await snapshot(pg)).view;
    const plan = findRackMelds(view.draft.rack);
    const points = plan.reduce(
      (n: number, m: string[]) => n + validateMeld(m)[0].score,
      0,
    );
    let moved = false;
    if (view.players[seat].opened || points >= 30) {
      for (const ids of plan) {
        await place(pg, ids);
        moved = true;
      }
      if (view.players[seat].opened) {
        for (const id of [...(await snapshot(pg)).view.draft.rack]) {
          const target = (await snapshot(pg)).view.draft.board.find(
            (m: any) => validateMeld([...m.tiles, id]).length,
          );
          if (target) {
            await clickTile(pg, id);
            await pg
              .locator('[data-testid="rk-meld-' + target.id + '"] .rk-add')
              .click();
            await pg.waitForTimeout(60);
            moved = true;
          }
        }
      }
    }
    const version = (await snapshot(pg)).version;
    await pg
      .getByRole("button", {
        name: moved ? "确认出牌" : "摸牌并结束",
        exact: true,
      })
      .click();
    await Promise.all(
      gamePages.map((x) =>
        x.waitForFunction(
          (version) =>
            JSON.parse(window.render_game_to_text()).version > version,
          version,
        ),
      ),
    );
    turns++;
  }
  const final = (await snapshot(gamePages[0])).view;
  assert.equal(final.phase, "FINISHED");
  journeys.push({
    name: "two-browser full game via UI clicks",
    seed: 2113,
    turns,
    blocked: final.result.blocked,
    scores: final.result.scores,
    passed: true,
  });
  await assertUiShot(
    gamePages[0],
    out + "/ui-full-game-result.png",
    ".rk-world",
  );
  reports.push({ name: "ui-full-game-result" });
  await gamePages[0]
    .getByRole("button", { name: "下一局", exact: true })
    .click();
  await Promise.all(
    gamePages.map((pg) =>
      pg.waitForFunction(
        () => JSON.parse(window.render_game_to_text()).view.game === 2,
      ),
    ),
  );
  assert.deepEqual(
    (await snapshot(gamePages[0])).view.players.map((x: any) => x.score),
    [-17, 17],
  );
  journeys.push({
    name: "host next game keeps cumulative scores",
    passed: true,
  });
  await Promise.all(gameContexts.map((c) => c.close()));
  assert.deepEqual(errors, []);
  console.log(
    `RK UI: ${reports.length} screenshots passed layout/image assertions`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  botSockets.forEach((s) => s.disconnect());
  await browser?.close();
  if (child && child.exitCode === null) {
    const proc = child;
    const end = new Promise<void>((r) => proc.once("exit", () => r()));
    proc.kill();
    await end;
  }
  writeFileSync(
    join(out, "audit.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        screenshots: reports.length,
        reports,
        journeys,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  mkdirSync("output/playwright", { recursive: true });
  writeFileSync("output/playwright/rk-stage4-server.txt", serverLogs);
}
