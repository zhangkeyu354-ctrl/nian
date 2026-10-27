import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as client, type Socket } from "socket.io-client";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { attachSodaSmugglers, SSRoom } from "../apps/server/src/ss-rooms.ts";
import {
  SS_EVENTS as E,
  type SSAck,
  type SSSnapshot,
  type SSAction,
} from "../packages/shared/src/ss-protocol.ts";
import { nextSSAction } from "./ss-test-driver.ts";
const dir = mkdtempSync(join(tmpdir(), "ss-protocol-"));
let now = 1000;
let http!: ReturnType<typeof createServer>;
let io!: Server;
let store!: ReturnType<typeof attachSodaSmugglers>;
let base = "";
const sockets: Socket[] = [];
let packetChecks = 0;
const checks: string[] = [];
const games: {
  players: number;
  events: boolean;
  commands: number;
  rounds: number;
}[] = [];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function boot() {
  http = createServer();
  io = new Server(http);
  store = attachSodaSmugglers(io, dir, {
    maxRooms: 100,
    idleMs: 86400000,
    allowFixedSeed: true,
    clock: () => now,
    tickMs: 10,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as any).port}`;
}
async function stop() {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => io.close(() => r()));
}
async function connect() {
  const s = client(base, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  await new Promise<void>((r, j) => {
    s.once("connect", r);
    s.once("connect_error", j);
  });
  return s;
}
function ask(s: Socket, event: string, payload: object): Promise<SSAck> {
  return new Promise((r, j) =>
    s
      .timeout(8000)
      .emit(event, payload, (e: Error | null, a: SSAck) => (e ? j(e) : r(a))),
  );
}
const normal = (x: unknown) => JSON.parse(JSON.stringify(x));
let claims: { token: string; playerId: string }[] = [];
let snaps: SSSnapshot[] = [];
let peers: Socket[] = [];
let code = "";
async function sync() {
  const room = store.rooms.get(code)!;
  for (let i = 0; i < claims.length; i++) {
    const a = await ask(peers[i], E.join, { code, token: claims[i].token });
    assert(a.ok);
    snaps[i] = a.snapshot!;
    assert.deepEqual(
      normal(a.snapshot),
      normal(room.snapshot(claims[i].token, now)),
    );
    packetChecks++;
  }
}
async function act(seat: number, action: SSAction) {
  await sync();
  const s = snaps[seat];
  const a = await ask(peers[seat], E.action, {
    code,
    token: claims[seat].token,
    version: s.version,
    seq: s.nextSeq,
    round: s.view?.round,
    action,
  });
  assert(a.ok, a.error ?? "操作失败");
  return a;
}
async function make(n: number, events: boolean) {
  peers = [];
  claims = [];
  snaps = [];
  for (let i = 0; i < n; i++) peers.push(await connect());
  const a = await ask(peers[0], E.create, {});
  assert(a.ok);
  code = a.code!;
  for (let i = 0; i < n; i++) {
    if (i === 1) {
      /* room must have capacity before others claim */
    }
    const c = await ask(peers[i], E.claim, { code, name: `协议${i}` });
    assert(c.ok, c.error ?? "入座失败");
    claims.push({ token: c.token!, playerId: c.playerId! });
    snaps.push(c.snapshot!);
    if (i === 0) {
      await act(0, { type: "SET_SETTINGS", count: n, events });
    }
  }
  await sync();
}
async function reject(seat: number, request: object, label: string) {
  const before: import("../apps/server/src/ss-rooms.ts").SSFile =
    structuredClone(store.rooms.get(code)!.file);
  const a = await ask(peers[seat], E.action, request);
  assert.equal(a.ok, false, label);
  assert.deepEqual(store.rooms.get(code)!.file, before, label);
  checks.push(label);
}
try {
  await boot();
  for (const n of [3, 5, 8])
    for (const events of [false, true]) {
      await make(n, events);
      await act(0, { type: "RANDOM_GUARD" });
      assert.equal(store.rooms.get(code)!.file.firstGuard, "random");
      await act(0, { type: "SET_SETTINGS", firstGuard: 1, seconds: 0 });
      const s = snaps[1];
      await reject(
        1,
        {
          code,
          token: claims[1].token,
          version: s.version,
          seq: s.nextSeq,
          action: { type: "SET_SETTINGS", seconds: 60 },
        },
        "non-host settings rejected",
      );
      for (let i = 0; i < n; i++) await act(i, { type: "READY" });
      await act(0, { type: "START", seed: 100 + n });
      await sync();
      const seedState: import("../packages/soda-smugglers/src/index.ts").SSState =
        store.rooms.get(code)!.file.state!;
      assert.equal(seedState.guard, 1);
      const stale = snaps[0];
      const h = seedState.players[0].hand;
      const bagCount = seedState.event === "holiday" ? 3 : 2;
      for (const action of [
        { type: "TIMEOUT" },
        { type: "ADVANCE", actor: "server" },
        { type: "ADVANCE", now: 1e15 },
        { type: "ADVANCE" },
        { type: "SUBMIT", luggage: [h[0], h[0]], bribe: h[2] },
      ])
        await reject(
          0,
          {
            code,
            token: claims[0].token,
            version: stale.version,
            seq: stale.nextSeq,
            round: 1,
            action,
          },
          "illegal command rejected",
        );
      await reject(
        0,
        {
          code,
          token: claims[1].token,
          version: stale.version,
          seq: snaps[1].nextSeq,
          round: 1,
          action: { type: "ADVANCE" },
        },
        "foreign token rejected",
      );
      const submits = snaps
        .map((s, i) =>
          i === 1
            ? null
            : ask(peers[i], E.action, {
                code,
                token: claims[i].token,
                version: stale.version,
                seq: s.nextSeq,
                round: 1,
                action: {
                  type: "SUBMIT",
                  luggage: s
                    .view!.players[i].hand!.slice(0, bagCount)
                    .map((c) => c.id),
                  bribe: s.view!.players[i].hand![bagCount].id,
                },
              }),
        )
        .filter(Boolean);
      assert((await Promise.all(submits)).every((a) => a!.ok));
      checks.push("same-round concurrent pack accepted");
      await sync();
      const duplicateRequest = {
        code,
        token: claims[0].token,
        version: stale.version,
        seq: stale.nextSeq,
        round: 1,
        action: {
          type: "SUBMIT",
          luggage: h.slice(0, bagCount),
          bribe: h[bagCount],
        },
      };
      const before: import("../apps/server/src/ss-rooms.ts").SSFile =
        structuredClone(store.rooms.get(code)!.file);
      assert((await ask(peers[0], E.action, duplicateRequest)).ok);
      assert.deepEqual(store.rooms.get(code)!.file, before);
      checks.push("duplicate seq idempotent");
      let commands = 0;
      while (snaps[0].view!.phase !== "FINISHED") {
        const cmd = nextSSAction(snaps)!;
        await act(cmd.seat, cmd.action);
        await sync();
        assert(++commands < 500);
      }
      games.push({
        players: n,
        events,
        commands,
        rounds: snaps[0].view!.round,
      });
      console.log("SS_PROTOCOL_GAME_PASS", n, events, commands);
      peers.forEach((s) => s.disconnect());
    }
  // Persist a partially submitted choice across both socket disconnect and a real server restart.
  await make(3, true);
  await act(0, { type: "SET_SETTINGS", seconds: 60, firstGuard: 0 });
  for (let i = 0; i < 3; i++) await act(i, { type: "READY" });
  await act(0, { type: "START", seed: 17 });
  await sync();
  const n = snaps[1].view!.event === "holiday" ? 3 : 2;
  const hand = snaps[1].view!.players[1].hand!;
  await act(1, {
    type: "SUBMIT",
    luggage: hand.slice(0, n).map((c) => c.id),
    bribe: hand[n].id,
  });
  await sync();
  const locked = normal(snaps[1].view!.players[1].luggage);
  const savedCode = code;
  const savedClaims = claims;
  const savedNextSeq = snaps[1].nextSeq;
  peers[1].disconnect();
  peers[1] = await connect();
  assert((await ask(peers[1], E.join, { code, token: claims[1].token })).ok);
  await sync();
  assert.deepEqual(normal(snaps[1].view!.players[1].luggage), locked);
  checks.push("disconnect preserves locked choice");
  await stop();
  await boot();
  code = savedCode;
  claims = savedClaims;
  peers = [];
  for (let i = 0; i < 3; i++) peers.push(await connect());
  await sync();
  assert.deepEqual(normal(snaps[1].view!.players[1].luggage), locked);
  assert.equal(snaps[1].nextSeq, savedNextSeq);
  checks.push("JSON restart restores token seq and secret");
  now = 61001;
  await delay(50);
  await sync();
  assert.equal(snaps[0].view!.phase, "BRIBE");
  assert.deepEqual(normal(snaps[1].view!.players[1].luggage), locked);
  checks.push("server deadline fills only missing travelers");
  for (const expected of ["INSPECT", "ARREST", "ROUND_END"]) {
    now += 60001;
    await delay(50);
    await sync();
    assert.equal(snaps[0].view!.phase, expected);
  }
  checks.push("server guard timeouts release remaining travelers");
  const room = store.rooms.get(code)!;
  const outsider = await connect();
  assert.equal(
    (await ask(outsider, E.join, { code, token: "invalid" })).ok,
    false,
  );
  const anon = await ask(outsider, E.join, { code });
  assert.equal(anon.snapshot?.view, null);
  checks.push("invalid token and unauthenticated view protected");
  const prod = SSRoom.create("PROD", dir);
  const p = Array.from({ length: 3 }, (_, i) => prod.claim(`p${i}`));
  for (const c of p)
    prod.action(c.token, prod.file.version, 1, { type: "READY" }, 1000);
  assert.throws(
    () =>
      prod.action(
        p[0].token,
        prod.file.version,
        2,
        { type: "START", seed: 1 },
        1000,
      ),
    /不能指定随机种子/,
  );
  checks.push("production fixed seed rejected");
  const json = JSON.stringify(room.snapshot(claims[0].token, now));
  assert(!/"token"|"seed"|"random"|"eventDeck"|"discard"/.test(json));
  checks.push("snapshot secret fields absent");
  mkdirSync("docs/soda-smugglers/verification", { recursive: true });
  writeFileSync(
    "docs/soda-smugglers/verification/stage3-protocol.json",
    JSON.stringify(
      {
        games,
        gameCount: games.length,
        checks,
        passed: checks.length,
        failed: 0,
        packetChecks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "SS_PROTOCOL_PASS",
    JSON.stringify({
      games: games.length,
      checks: checks.length,
      packetChecks,
    }),
  );
} finally {
  await stop();
}
