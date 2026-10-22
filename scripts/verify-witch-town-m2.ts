// Real transport acceptance, nine player counts, restart of existing main server.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import {
  WT_EVENTS as E,
  type WTRoomSnapshot,
} from "../packages/shared/src/wt-protocol.ts";
const port = Number(process.env.WT_VERIFY_PORT ?? 3399),
  base = `http://127.0.0.1:${port}`;
const data = mkdtempSync(join(tmpdir(), "salem-m2-protocol-"));
let server: ChildProcess | undefined;
const sockets: Socket[] = [];
async function stop() {
  if (server && !server.killed) {
    const closed = new Promise<void>((r) => server!.once("exit", () => r()));
    server.kill();
    await closed;
  }
  server = undefined;
}
async function start() {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        DBD_DATA_DIR: join(data, "dbd"),
        WT_DATA_DIR: join(data, "wt"),
        WT_ENABLE_M1: "1",
        WT_ALLOW_CANDIDATE_COUNTS: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr?.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("SERVER_NOT_READY");
}
async function connect() {
  const s = io(base, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(s);
  await new Promise<void>((r, j) => {
    s.once("connect", () => r());
    s.once("connect_error", j);
  });
  return s;
}
async function emit(s: Socket, event: string, req: unknown) {
  return new Promise<any>((r, j) => {
    s.timeout(4000).emit(event, req, (err: Error | null, a: any) =>
      err ? j(err) : r(a),
    );
  });
}
async function ok(s: Socket, event: string, req: unknown) {
  const a = await emit(s, event, req);
  assert.equal(a.ok, true, JSON.stringify(a));
  return a.data;
}
const results: any[] = [],
  saved: { code: string; token: string; view: WTRoomSnapshot }[] = [];
try {
  // Do not mistake an existing listener for this child process.
  try {
    await fetch(base + "/api/health");
    throw Error("PORT_IN_USE");
  } catch (e) {
    if ((e as Error).message === "PORT_IN_USE") throw e;
  }
  await start();
  for (let n = 4; n <= 12; n++) {
    const host = await connect(),
      watcher = await connect();
    const { code } = await ok(host, E.create, { capacity: 12 });
    await ok(watcher, E.join, { code });
    const players: Socket[] = [host];
    const seats: any[] = [];
    for (let i = 0; i < n; i++) {
      if (i) players.push(await connect());
      seats.push(await ok(players[i], E.claim, { code, name: `M1-${n}-${i}` }));
    }
    let version = n;
    const ready = (i: number, v: number, id: string) =>
      emit(players[i], E.action, {
        code,
        request: {
          requestId: id,
          version: v,
          action: { type: "READY", ready: true },
        },
      });
    const race = await Promise.all([
      ready(0, version, "race0"),
      ready(1, version, "race1"),
    ]);
    assert.equal(race.filter((x) => x.ok).length, 1);
    assert.equal(race.find((x) => !x.ok).error, "STALE_VERSION");
    version++;
    const loser = race[0].ok ? 1 : 0;
    assert.equal((await ready(loser, version++, "retry")).ok, true);
    for (let i = 2; i < n; i++)
      assert.equal((await ready(i, version++, `ready${i}`)).ok, true);
    const startRequest = {
      requestId: "start",
      version,
      action: { type: "START" },
    };
    const started: WTRoomSnapshot = await ok(host, E.action, {
      code,
      request: startRequest,
    });
    assert.equal(started.view?.phase, "dawn");
    assert.equal(started.view.players.length, n);
    const repeated = await ok(host, E.action, { code, request: startRequest });
    assert.deepEqual(repeated, started);
    assert.equal(
      (await emit(watcher, E.action, { code, request: startRequest })).error,
      "BAD_CREDENTIAL",
    );
    const spectator: WTRoomSnapshot = await ok(watcher, E.join, { code });
    assert.equal(spectator.view?.private, null);
    const privateViews: WTRoomSnapshot[] = [];
    for (let i = 0; i < n; i++) {
      const v: WTRoomSnapshot = await ok(players[i], E.join, {
        code,
        token: seats[i].token,
      });
      privateViews.push(v);
      assert.equal(v.mySeat, seats[i].playerId);
      assert.equal(v.view?.private?.tryals.length, n <= 7 ? 5 : n <= 9 ? 4 : 3);
      assert.equal(v.view?.private?.hand.length, 3);
      const json = JSON.stringify(v);
      for (let j = 0; j < n; j++)
        if (j !== i) {
          assert(!json.includes(seats[j].token));
        }
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j) {
          const wire = JSON.stringify(privateViews[i]);
          for (const c of [
            ...privateViews[j].view!.private!.tryals,
            ...privateViews[j].view!.private!.hand,
          ])
            assert(!wire.includes(`"${c.id}"`));
        }
    // Dawn is real, unanimous and private. No test-only phase jump.
    const startIndex = privateViews.findIndex((v) => {
      const c = v.view!.players.find((p) => p.id === v.mySeat)!.character;
      return c !== "mary_warren" && c !== "martha_corey";
    });
    const targetId = seats[startIndex].playerId;
    let current = privateViews[0];
    const witches = privateViews
      .map((v, i) => (v.view!.private!.everWitch ? i : -1))
      .filter((i) => i >= 0);
    await new Promise((r) => setTimeout(r, 30));
    let observed = 0;
    const listener = () => observed++;
    watcher.on(E.update, listener);
    for (const [j, i] of witches.entries()) {
      const oldPublic = await ok(watcher, E.join, { code });
      await new Promise((r) => setTimeout(r, 30));
      observed = 0;
      current = await ok(players[i], E.action, {
        code,
        request: {
          requestId: `dawn${i}`,
          version: oldPublic.version,
          action: { type: "DAWN_TARGET", targetId },
        },
      });
      if (j < witches.length - 1) {
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(observed, 0, "secret vote emitted public update");
        const unchanged = await ok(watcher, E.join, { code });
        assert.equal(unchanged.version, oldPublic.version);
        assert.equal(unchanged.view.phase, "dawn");
      }
    }
    watcher.off(E.update, listener);
    assert.equal(current.view!.phase, "day");
    const actor = startIndex;
    current = await ok(players[actor], E.join, {
      code,
      token: seats[actor].token,
    });
    const others = current.view!.players.filter(
      (p) => p.id !== seats[actor].playerId,
    );
    const target =
      others.find(
        (p) => p.character !== "mary_warren" && p.character !== "martha_corey",
      ) ?? others[0];
    const hand = current.view!.private!.hand;
    const card = hand.find((c) => c.kind !== "witness")!;
    const action: any = { type: "PLAY", cardId: card.id, targetId: target.id };
    if (card.kind === "robbery" || card.kind === "scapegoat")
      action.recipientId = others.find((p) => p.id !== target.id)!.id;
    if (card.kind === "curse") {
      // Only the active player has the dawn Cat. A Curse has no legal blue target;
      // choose another hand card, which always exists in a three-card initial hand.
      const alternative = hand.find(
        (c) => !["witness", "curse"].includes(c.kind),
      )!;
      action.cardId = alternative.id;
      if (alternative.kind === "robbery" || alternative.kind === "scapegoat")
        action.recipientId = others.find((p) => p.id !== target.id)!.id;
    }
    const playReq = { requestId: "dayplay", version: current.version, action };
    const played = await ok(players[actor], E.action, {
      code,
      request: playReq,
    });
    assert.equal(played.view.day.played, 1);
    assert.equal(played.view.phase, "day");
    assert.deepEqual(
      await ok(players[actor], E.action, { code, request: playReq }),
      played,
    );
    const invalid = await emit(players[actor], E.action, {
      code,
      request: {
        requestId: "badDraw",
        version: played.version,
        action: { type: "DRAW" },
      },
    });
    assert.equal(invalid.error, "DRAW_AFTER_PLAY");
    const ended = await ok(players[actor], E.action, {
      code,
      request: {
        requestId: "end",
        version: played.version,
        action: { type: "END_TURN" },
      },
    });
    const next = seats.findIndex((s) => s.playerId === ended.view.turnPlayerId);
    let drawn = await ok(players[next], E.action, {
      code,
      request: {
        requestId: "draw",
        version: ended.version,
        action: { type: "DRAW" },
      },
    });
    if (drawn.view.pending?.kind === "ability")
      drawn = await ok(players[next], E.action, {
        code,
        request: {
          requestId: "decline",
          version: drawn.version,
          action: { type: "ABILITY_DECISION", use: false },
        },
      });
    assert(["day", "black-event"].includes(drawn.view.phase));
    const publicView = await ok(watcher, E.join, { code });
    assert.equal(publicView.view.private, null);
    // Capture the current private state, not the earlier dawn snapshot.
    const checkpoint = await ok(host, E.join, { code, token: seats[0].token });
    const id = seats[0].playerId,
      prior = checkpoint.view?.private;
    host.disconnect();
    const reconnect = await connect();
    const restored: WTRoomSnapshot = await ok(reconnect, E.join, {
      code,
      token: seats[0].token,
    });
    assert.equal(restored.mySeat, id);
    assert.deepEqual(restored.view?.private, prior);
    assert.equal(
      (await emit(reconnect, E.join, { code, token: "forged" })).error,
      "BAD_CREDENTIAL",
    );
    saved.push({ code, token: seats[0].token, view: restored });
    results.push({
      players: n,
      connections: n + 1,
      setup: true,
      privacy: true,
      concurrentStaleRejected: true,
      idempotentStart: true,
      reconnect: true,
      dayPlay: true,
      drawAction: true,
      secretBallotsHidden: true,
      fullGame: false,
    });
    for (const s of sockets.splice(0)) s.disconnect();
  }
  await stop();
  await start();
  for (const row of saved) {
    const s = await connect();
    const v: WTRoomSnapshot = await ok(s, E.join, {
      code: row.code,
      token: row.token,
    });
    assert.equal(v.version, row.view.version);
    assert.deepEqual(v.view, row.view.view);
    s.disconnect();
  }
  const report = {
    milestone: "M2_DAY_ENGINE",
    actualRandomFullGames: 0,
    results,
    restartRecoveredRooms: saved.length,
    passed: true,
  };
  mkdirSync("docs/witch-town/validation", { recursive: true });
  writeFileSync(
    "docs/witch-town/validation/protocol-m2.json",
    JSON.stringify(report, null, 2),
  );
  console.log("WT_M2_PROTOCOL_PASS", JSON.stringify(report));
} finally {
  for (const s of sockets) s.disconnect();
  await stop();
}
