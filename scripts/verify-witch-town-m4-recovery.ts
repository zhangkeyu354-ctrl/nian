import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { WTRoomStore, attachWitchTown } from "../apps/server/src/wt-rooms.ts";
import {
  createWitchTown,
  reduceWitchTown,
  seededRandom,
  type WTState,
  type CardKind,
} from "../packages/witch-town/src/index.ts";
import {
  eliminate,
  drain,
  type WTCommand,
} from "../packages/witch-town/src/day.ts";
import { WT_EVENTS as E } from "../packages/shared/src/wt-protocol.ts";
const dir = mkdtempSync(join(tmpdir(), "wt-m4-recovery-protocol-")),
  seedStore = new WTRoomStore(dir);
const now = Date.now() + 300000; // Virtual-clock fixtures; real 30-second timers have dedicated tests.
function pull(s: WTState, kind: CardKind) {
  for (const z of [
    s.deck,
    s.discard,
    ...s.players.flatMap((p) => [p.hand, p.table]),
  ]) {
    const i = z.findIndex((c) => c.kind === kind);
    if (i >= 0) return z.splice(i, 1)[0];
  }
  throw Error(kind);
}
const stages = [
  "dawn",
  "day",
  "trial",
  "ability",
  "cat",
  "picking",
  "witches",
  "constable",
  "confession",
  "confession-loot",
  "tituba",
  "loot",
] as const;
const cases = [];
for (let n = 4; n <= 12; n++)
  for (const stage of stages) {
    const code = seedStore.create(n),
      seats = Array.from({ length: n }, (_, i) =>
        seedStore.claim(code, `P${i}`),
      );
    const id = (i: number) => seats[i].playerId;
    let s = createWitchTown(
      {
        players: seats.map((p, i) => ({ id: p.playerId, name: `P${i}` })),
        countsProfile: "candidate-59",
        allowCandidateCounts: true,
      },
      seededRandom(n),
    );
    for (const p of s.players) {
      p.character = "william_phips";
      p.everWitch = false;
      for (const t of p.tryals) t.kind = "not_witch";
    }
    s.players[0].tryals[0].kind = "witch";
    s.players[0].everWitch = true;
    if (n >= 6) {
      s.players[1].tryals[0].kind = "witch";
      s.players[1].everWitch = true;
    }
    s.players[2].tryals[0].kind = "constable";
    const apply = (i: number, c: WTCommand) => {
      s = reduceWitchTown(s, id(i), c, { now, random: seededRandom(1) });
    };
    let actor = 0,
      action: WTCommand = { type: "DAWN_TARGET", targetId: id(3) };
    if (stage !== "dawn") {
      for (let i = 0; i < n; i++)
        if (s.players[i].everWitch)
          apply(i, { type: "DAWN_TARGET", targetId: id(3) });
      actor = 3;
      action = { type: "DRAW" };
      if (stage === "day")
        s.deck.sort(
          (a, b) =>
            Number(["night", "conspiracy"].includes(a.kind)) -
            Number(["night", "conspiracy"].includes(b.kind)),
        );
      else if (stage === "trial" || stage === "ability") {
        if (stage === "ability") s.players[3].character = "ann_putnam";
        for (let j = 0; j < 6; j++)
          s.players[2].table.push(pull(s, "accusation"));
        const c = pull(s, "accusation");
        s.players[3].hand.push(c);
        apply(3, { type: "PLAY", cardId: c.id, targetId: id(2) });
        action =
          stage === "ability"
            ? { type: "ABILITY_DECISION", use: false }
            : { type: "REVEAL_TRYAL", index: 0 };
      } else if (stage === "tituba") {
        s.players[3].character = "tituba";
        apply(3, { type: "TITUBA_START" });
        action = {
          type: "TITUBA_REORDER",
          cardIds: s.deck.map((c) => c.id).reverse(),
        };
      } else if (stage === "loot") {
        s.players[0].character = "john_proctor";
        s.players[1].character = "martha_corey";
        eliminate(s, s.players[3]);
        drain(s, now);
        if (s.pending?.kind !== "loot") throw Error("missing loot");
        actor = 0;
        action = { type: "LOOT_PICK", cardId: s.pending.pool[0].id };
      } else {
        const conspiracy = stage === "cat" || stage === "picking";
        s.deck.unshift(pull(s, conspiracy ? "conspiracy" : "night"));
        apply(3, { type: "DRAW" });
        if (conspiracy) {
          action = { type: "CONSPIRACY_REVEAL", index: 0 };
          if (stage === "picking") {
            apply(3, action);
            actor = 0;
            action = { type: "CONSPIRACY_PICK", index: 0 };
          }
        } else {
          actor = 0;
          action = { type: "NIGHT_TARGET", targetId: id(3) };
          if (stage !== "witches") {
            for (let i = 0; i < n; i++)
              if (s.players[i].everWitch) apply(i, action);
            actor = 2;
            action = { type: "NIGHT_PROTECT", targetId: id(3) };
            if (stage === "confession" || stage === "confession-loot") {
              apply(2, action);
              actor = 3;
              action = { type: "CONFESS", index: 0 };
              if (stage === "confession-loot") {
                s.players[0].character = "john_proctor";
                s.players[1].character = "martha_corey";
                s.players[3].tryals
                  .slice(1)
                  .forEach((t) => (t.revealed = true));
                apply(3, action);
                const loot = s.tasks.find((t) => t.kind === "loot");
                if (loot?.kind !== "loot")
                  throw Error("missing concurrent loot");
                actor = 0;
                action = { type: "LOOT_PICK", cardId: loot.pool[0].id };
              }
            }
          }
        }
      }
    }
    const file = join(dir, `${code}.json`),
      r = JSON.parse(readFileSync(file, "utf8"));
    r.state = s;
    writeFileSync(file, JSON.stringify(r));
    cases.push({ n, stage, code, seats, actor, action });
  }
let http = createServer(),
  server = new Server(http),
  store = attachWitchTown(server, dir);
let port = 0;
const clients: Socket[] = [];
async function start() {
  await new Promise<void>((r) => http.listen(port, "127.0.0.1", r));
  const a = http.address();
  assert(a && typeof a !== "string");
  port = a.port;
}
async function stop() {
  for (const s of clients.splice(0)) s.disconnect();
  store.dispose();
  await new Promise<void>((r) => server.close(() => r()));
}
async function restart() {
  await stop();
  http = createServer();
  server = new Server(http);
  store = attachWitchTown(server, dir);
  await start();
}
async function call(s: Socket, event: string, payload: unknown) {
  const a = await new Promise<any>((resolve, reject) =>
    s
      .timeout(5000)
      .emit(event, payload, (e: Error | null, a: any) =>
        e ? reject(e) : resolve(a),
      ),
  );
  assert.equal(a.ok, true, JSON.stringify(a));
  return a.data;
}
async function connect(code: string, token: string | null) {
  const s = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((r, j) => {
    s.once("connect", r);
    s.once("connect_error", j);
  });
  return { s, snapshot: await call(s, E.join, { code, token }) };
}
const results = [];
await start();
try {
  for (const c of cases) {
    const token = c.seats[c.actor].token;
    const first = await connect(c.code, token),
      checkpoint = first.snapshot.view;
    first.s.disconnect(); // Browser refresh / lost connection.
    const rejoined = await connect(c.code, token);
    assert.deepEqual(rejoined.snapshot.view, checkpoint);
    await restart(); // Every case, not merely one sample, reloads disk into a new service instance.
    const afterRestart = await connect(c.code, token);
    assert.deepEqual(afterRestart.snapshot.view, checkpoint);
    const spectator = await connect(c.code, null);
    assert.equal(spectator.snapshot.view.private, null);
    const publicText = JSON.stringify(spectator.snapshot.view);
    assert(!publicText.includes('"pool":'));
    assert(!publicText.includes('"tryals":'));
    const request = {
      requestId: "resume",
      version: afterRestart.snapshot.version,
      action: c.action,
    };
    const next = await call(afterRestart.s, E.action, {
      code: c.code,
      request,
    });
    await restart();
    const resumed = await connect(c.code, token),
      retry = await call(resumed.s, E.action, { code: c.code, request });
    assert.deepEqual(retry.view, next.view);
    for (const s of clients.splice(0)) s.disconnect();
    results.push({
      players: c.n,
      stage: c.stage,
      refresh: true,
      serverInstanceRestart: true,
      durableRetry: true,
      passed: true,
    });
  }
  // A lost initial claim ACK is recoverable from the previously saved client secret.
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  clients.push(socket);
  await new Promise<void>((r) => socket.once("connect", r));
  const { code } = await call(socket, E.create, { capacity: 4 }),
    claimKey = "ab19".repeat(16);
  const original = await call(socket, E.claim, {
    code,
    name: "恢复占座",
    claimKey,
  });
  await restart();
  const recovered = await connect(code, null);
  const claim = await call(recovered.s, E.claim, {
    code,
    name: "恢复占座",
    claimKey,
  });
  assert.equal(claim.playerId, original.playerId);
  assert.equal(claim.token, original.token);
  assert.equal(claim.snapshot.players.length, 1);
  const report = {
    cases: results.length,
    passed: results.length,
    failed: 0,
    serverInstanceRestarts: results.length * 2 + 1,
    lostClaimAckRecovery: true,
    virtualClockFixtures: true,
    results,
  };
  mkdirSync("docs/witch-town/validation", { recursive: true });
  writeFileSync(
    "docs/witch-town/validation/recovery-m4.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      cases: report.cases,
      passed: report.passed,
      restarts: report.serverInstanceRestarts,
      lostClaimAckRecovery: true,
    }),
  );
} finally {
  await stop();
  assert(
    resolve(dir).startsWith(resolve(tmpdir()) + "\\") ||
      resolve(dir).startsWith(resolve(tmpdir()) + "/"),
  );
  rmSync(dir, { recursive: true, force: true });
}
