// Real Chromium/WebSocket protocol acceptance. Stage 4 owns UI click/visual acceptance.
import { chromium, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { RKRoom } from "../apps/server/src/rk-rooms.ts";
import {
  createRK,
  createTiles,
  assertInvariants,
  validateMeld,
} from "../packages/rummikub/src/index.ts";
import { findRackMelds } from "../packages/rummikub/src/simulation.ts";
import {
  RK_EVENTS as E,
  type RKSnapshot,
} from "../packages/shared/src/rk-protocol.ts";
const root = mkdtempSync(join(tmpdir(), "rk-browsers-"));
const data = join(root, "rk");
mkdirSync(data);
const out = "docs/rummikub/verification";
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const portFinder = createServer();
await new Promise<void>((r) => portFinder.listen(0, "127.0.0.1", r));
const port = (portFinder.address() as any).port;
await new Promise<void>((r) => portFinder.close(() => r()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let logs = "";
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
        RK_ALLOW_FIXED_SEED: "1",
        DBD_DATA_DIR: join(root, "dbd"),
        DM_DATA_DIR: join(root, "dm"),
        MA_DATA_DIR: join(root, "ma"),
        CN_DATA_DIR: join(root, "cn"),
        RR_DATA_DIR: join(root, "rr"),
        XB_DATA_DIR: join(root, "xb"),
        DP_DATA_DIR: join(root, "dp"),
        WT_DISABLE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout!.on("data", (b) => (logs += b));
  child.stderr!.on("data", (b) => (logs += b));
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw Error("Test server exited");
    try {
      const health = await fetch(base + "/api/health").then((r) => r.json());
      if (typeof health.rkRooms === "number") return;
    } catch {}
    await delay(50);
  }
  throw Error("Test server did not start");
}
async function stop() {
  if (child && child.exitCode === null) {
    const proc = child;
    const done = new Promise<void>((r) => proc.once("exit", () => r()));
    proc.kill();
    await done;
  }
}
function fixture(
  code: string,
  hands: string[][],
  board: string[][] = [],
  opened = true,
  timed = false,
) {
  const r = RKRoom.create(code, data, { allowFixedSeed: true });
  const claims = hands.map((_, i) => r.claim(`验收${i + 1}`));
  const s = createRK(
    hands.map((_, i) => `验收${i + 1}`),
    {
      seed: 1,
      minutes: timed ? 1 : 0,
      now: Date.now() - (timed ? 85000 : 0),
      assertions: true,
    },
  );
  s.current = 0;
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
  s.turn = {
    rack: [...hands[0]],
    board: structuredClone(s.board),
    retrieved: [],
  };
  s.draft = structuredClone(s.turn);
  assertInvariants(s);
  r.file.state = s;
  r.file.minutes = timed ? 1 : 0;
  r.file.players.forEach((p) => (p.ready = true));
  r.save();
  return { code, claims };
}
const low = fixture(
  "LOWA",
  [["R08a", "R09a", "R10a", "K13a"], ["B01a"]],
  [],
  false,
);
const bad = fixture("BADA", [["R05a", "R06a", "R08a", "K13a"], ["B01a"]]);
const joker = fixture(
  "JOKA",
  [["K03a", "K08a", "K09a"], ["B01a"]],
  [["R03a", "B03a", "J1"]],
);
const reconnect = fixture("RECO", [["R09a", "R10a", "R11a", "K13a"], ["B01a"]]);
const pool = fixture("POOL", [
  ["R09a", "R10a", "R11a"],
  createTiles()
    .map((t) => t.id)
    .filter((id) => !["R09a", "R10a", "R11a"].includes(id)),
]);
const timeout = fixture(
  "TIME",
  [["R09a", "R10a", "R11a", "K13a"], ["B01a"]],
  [],
  true,
  true,
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const failures: string[] = [];
const checks: { name: string; passed: boolean; details?: unknown }[] = [];
const errors: string[] = [];
const sent = new WeakMap<Page, number>();
async function ask(page: Page, event: string, request: object): Promise<any> {
  await delay(Math.max(0, 105 - (Date.now() - (sent.get(page) ?? 0))));
  sent.set(page, Date.now());
  return page.evaluate(
    ({ event, request }) => (window as any).__rkAsk(event, request),
    { event, request },
  );
}
const snapshot = (p: Page) =>
  p.evaluate(() => (window as any).__rkLatest) as Promise<RKSnapshot>;
async function boot(p: Page) {
  await p.goto(base + "/robots.txt");
  await p.addScriptTag({ url: base + "/socket.io/socket.io.js" });
  await p.evaluate(() => {
    const w = window as any;
    w.__rkPackets = [];
    w.__rkLatest = null;
    w.__rkSocket = w.io({ transports: ["websocket"], reconnectionDelay: 150 });
    w.__rkSocket.on("rk:update", (v: any) => {
      w.__rkLatest = v;
      w.__rkPackets.push(v);
    });
    w.__rkAsk = (event: string, request: object) =>
      new Promise((resolve, reject) =>
        w.__rkSocket
          .timeout(8000)
          .emit(event, request, (err: any, reply: any) => {
            if (err) return reject(err);
            if (reply.snapshot) w.__rkLatest = reply.snapshot;
            resolve(reply);
          }),
      );
  });
  await p.waitForFunction(() => (window as any).__rkSocket.connected);
}
async function connectFixture(pages: Page[], f: ReturnType<typeof fixture>) {
  for (let i = 0; i < 2; i++) {
    const a = await ask(pages[i], E.join, {
      code: f.code,
      token: f.claims[i].token,
    });
    assert(a.ok);
  }
}
async function act(p: Page, token: string, action: object) {
  const s = await snapshot(p);
  return ask(p, E.action, {
    code: s.code,
    token,
    version: s.version,
    seq: s.nextSeq,
    action,
  });
}
async function synced(pages: Page[], version: number) {
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        (v) => (window as any).__rkLatest?.version >= v,
        version,
      ),
    ),
  );
}
try {
  await start();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROME,
  });
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser!.newContext()),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  pages.forEach((p) => p.on("pageerror", (e) => errors.push(e.message)));
  await Promise.all(pages.map(boot));
  // The timeout fixture represents a turn started 85 seconds (100s timer) before the test server.
  await connectFixture(pages, timeout);
  const initial = await snapshot(pages[0]);
  assert.equal(initial.view!.current, 0);
  const before = initial.view!.players[0].count;
  await pages[0].waitForFunction(
    () => (window as any).__rkLatest?.view?.lastAction?.type === "TIMEOUT",
    null,
    { timeout: 20000 },
  );
  const expired = await snapshot(pages[0]);
  assert.equal(expired.view!.players[0].count, before + 3);
  assert.equal(expired.view!.current, 1);
  checks.push({ name: "server deadline rollback and penalty 3", passed: true });
  await connectFixture(pages, low);
  await act(pages[0], low.claims[0].token, {
    type: "MOVE",
    tiles: ["R08a", "R09a", "R10a"],
    to: { meld: null },
  });
  let reply = await act(pages[0], low.claims[0].token, { type: "COMMIT" });
  assert.equal(reply.ok, false);
  assert.equal(reply.consumed, true);
  assert.match(reply.error, /27.*3/);
  assert.equal(reply.snapshot.view.board.length, 0);
  checks.push({ name: "initial meld below 30 rejected", passed: true });
  await connectFixture(pages, bad);
  await pages[1].evaluate(() => ((window as any).__rkPackets = []));
  await act(pages[0], bad.claims[0].token, {
    type: "MOVE",
    tiles: ["R05a", "R06a", "R08a"],
    to: { meld: null },
  });
  await delay(150);
  assert.equal(
    await pages[1].evaluate(() => (window as any).__rkPackets.length),
    0,
  );
  reply = await act(pages[0], bad.claims[0].token, { type: "COMMIT" });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /不连续/);
  await synced(pages.slice(0, 2), reply.snapshot.version);
  assert.equal((await snapshot(pages[1])).view!.lastAction?.error, undefined);
  checks.push({
    name: "invalid meld rejected and no private draft packets leaked",
    passed: true,
  });
  await connectFixture(pages, joker);
  assert(
    (
      await act(pages[0], joker.claims[0].token, {
        type: "MOVE",
        tiles: ["K03a"],
        to: { meld: "m0" },
      })
    ).ok,
  );
  assert(
    (
      await act(pages[0], joker.claims[0].token, {
        type: "MOVE",
        tiles: ["J1", "K08a", "K09a"],
        to: { meld: null },
      })
    ).ok,
  );
  reply = await act(pages[0], joker.claims[0].token, { type: "COMMIT" });
  assert(reply.ok);
  assert.equal(reply.snapshot.view.board.length, 2);
  assert.equal(reply.snapshot.view.phase, "FINISHED");
  assert.equal(reply.snapshot.view.result.blocked, false);
  checks.push({
    name: "table joker released, reused, and normal empty-rack victory",
    passed: true,
  });
  await connectFixture(pages, reconnect);
  await act(pages[0], reconnect.claims[0].token, {
    type: "MOVE",
    tiles: ["R09a", "R10a", "R11a"],
    to: { meld: null },
  });
  const draft = (await snapshot(pages[0])).view!.draft;
  const savedSeq = (await snapshot(pages[0])).nextSeq;
  await pages[0].reload();
  await boot(pages[0]);
  reply = await ask(pages[0], E.join, {
    code: reconnect.code,
    token: reconnect.claims[0].token,
  });
  assert.deepEqual(reply.snapshot.view.draft, draft);
  assert.equal(reply.snapshot.nextSeq, savedSeq);
  checks.push({
    name: "browser refresh token reconnect keeps current private draft",
    passed: true,
  });
  await stop();
  await start();
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(() => (window as any).__rkSocket.connected),
    ),
  );
  reply = await ask(pages[0], E.join, {
    code: reconnect.code,
    token: reconnect.claims[0].token,
  });
  assert.deepEqual(reply.snapshot.view.draft, draft);
  assert.equal(reply.snapshot.nextSeq, savedSeq);
  checks.push({
    name: "actual server process restart restores private draft and seq",
    passed: true,
  });
  await connectFixture(pages, pool);
  for (const i of [0, 1])
    assert((await act(pages[i], pool.claims[i].token, { type: "DRAW" })).ok);
  reply = await snapshot(pages[1]);
  assert.equal(reply.view.phase, "FINISHED");
  assert.equal(reply.view.result.blocked, true);
  checks.push({
    name: "empty pool full round terminates with blocked scoring",
    passed: true,
  });
  for (const count of [2, 3, 4]) {
    const active = pages.slice(0, count);
    const seed = count * 1000 + 1;
    const { code } = await ask(active[0], E.create, {});
    const tokens: string[] = [];
    let claimed = await ask(active[0], E.claim, { code, name: "朋友1" });
    assert(claimed.ok);
    tokens.push(claimed.token);
    assert(
      (
        await act(active[0], tokens[0], {
          type: "SET_SETTINGS",
          count,
          minutes: 0,
          games: 1,
        })
      ).ok,
    );
    for (let i = 1; i < count; i++) {
      claimed = await ask(active[i], E.claim, { code, name: `朋友${i + 1}` });
      assert(claimed.ok);
      tokens.push(claimed.token);
    }
    await delay(150);
    for (let i = 0; i < count; i++)
      assert((await act(active[i], tokens[i], { type: "READY" })).ok);
    reply = await act(active[0], tokens[0], { type: "START", seed });
    assert(reply.ok);
    await synced(active, reply.snapshot.version);
    let turns = 0;
    while (
      (await snapshot(active[0])).view!.phase === "PLAYING" &&
      turns < 2000
    ) {
      const common = (await snapshot(active[0])).view!;
      const seat = common.current;
      const p = active[seat];
      const view = (await snapshot(p)).view!;
      const mine = view.players[seat];
      const rack = mine.rack!;
      const plan = findRackMelds(rack);
      let moved = false;
      const points = plan.reduce((n, m) => n + validateMeld(m)[0].score, 0);
      if (mine.opened || points >= 30) {
        for (const tiles of plan) {
          const a = await act(p, tokens[seat], {
            type: "MOVE",
            tiles,
            to: { meld: null },
          });
          assert(a.ok);
          moved = true;
        }
        if (mine.opened)
          for (const id of [...(await snapshot(p)).view!.draft!.rack]) {
            const target = (await snapshot(p)).view!.draft!.board.find(
              (m) => validateMeld([...m.tiles, id]).length,
            );
            if (target) {
              assert(
                (
                  await act(p, tokens[seat], {
                    type: "MOVE",
                    tiles: [id],
                    to: { meld: target.id },
                  })
                ).ok,
              );
              moved = true;
            }
          }
      }
      reply = await act(p, tokens[seat], { type: moved ? "COMMIT" : "DRAW" });
      assert(reply.ok, reply.error);
      await synced(active, reply.snapshot.version);
      turns++;
      for (let i = 0; i < count; i++) {
        const v = (await snapshot(active[i])).view!;
        if (v.phase === "PLAYING")
          assert.equal(v.players.filter((x) => x.rack !== undefined).length, 1);
      }
    }
    const result = (await snapshot(active[0])).view!;
    assert.equal(result.phase, "FINISHED");
    assert(Math.abs(result.result!.scores.reduce((a, b) => a + b, 0)) < 1e-9);
    checks.push({
      name: `${count} browser players complete game`,
      passed: true,
      details: {
        count,
        seed,
        turns,
        blocked: result.result!.blocked,
        scores: result.result!.scores,
      },
    });
  }
  assert.deepEqual(errors, []);
  checks.push({ name: "no Chromium page errors", passed: true });
  console.log(
    `RK browsers: ${checks.length}/${checks.length} passed (2/3/4-player full games plus edge cases)`,
  );
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
  console.error("RK browser acceptance failed:", failures[0]);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "real Chromium protocol clients over WebSocket; not stage4 UI acceptance",
    passed: checks.length,
    failed: failures.length,
    checks,
    failures,
    pageErrors: errors,
  };
  writeFileSync(
    join(out, "stage3-browsers.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  mkdirSync("output/playwright", { recursive: true });
  writeFileSync("output/playwright/rk-stage3-server.txt", logs);
}
