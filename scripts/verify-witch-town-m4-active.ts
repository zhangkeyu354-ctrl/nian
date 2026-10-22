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
import { join } from "node:path";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { attachWitchTown, WTRoomStore } from "../apps/server/src/wt-rooms.ts";
import { WT_EVENTS as E } from "../packages/shared/src/wt-protocol.ts";
import type { WTState } from "../packages/witch-town/src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "wt-m4-protocol-"));
const seedStore = new WTRoomStore(dir, { allowCandidateCounts: true });
const cases = [];
for (let n = 4; n <= 12; n++)
  for (const role of ["tituba", "samuel_parris"] as const) {
    const code = seedStore.create(n),
      seats = Array.from({ length: n }, (_, i) =>
        seedStore.claim(code, `P${i}`),
      );
    for (const [i, seat] of seats.entries())
      seedStore.action(code, seat.token, {
        requestId: `r${i}`,
        version: seedStore.snapshot(code, null).version,
        action: { type: "READY", ready: true },
      });
    seedStore.action(code, seats[0].token, {
      requestId: "start",
      version: seedStore.snapshot(code, null).version,
      action: { type: "START" },
    });
    const file = join(dir, `${code}.json`),
      saved = JSON.parse(readFileSync(file, "utf8")),
      s: WTState = saved.state;
    for (const p of s.players) p.character = "william_phips";
    s.players[0].character = role;
    s.phase = "day";
    s.pending = null;
    s.turnPlayerId = seats[0].playerId;
    s.players[0].table.push(s.dawnBlackCat!);
    s.dawnBlackCat = null;
    s.blackCatOwnerId = seats[0].playerId;
    s.deck.sort(
      (a, b) =>
        Number(["night", "conspiracy"].includes(a.kind)) -
        Number(["night", "conspiracy"].includes(b.kind)),
    );
    const discarded = s.deck.splice(2, 2);
    s.discard.push(...discarded);
    writeFileSync(file, JSON.stringify(saved));
    cases.push({
      n,
      role,
      code,
      seats,
      discardIds: discarded.map((c) => c.id),
    });
  }
const http = createServer(),
  server = new Server(http);
attachWitchTown(server, dir, { allowCandidateCounts: true });
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const address = http.address();
assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const clients: Socket[] = [],
  results: unknown[] = [];
const pause = () => new Promise((r) => setTimeout(r, 80));
async function call(s: Socket, event: string, payload: unknown) {
  const reply = await new Promise<any>((resolve, reject) =>
    s
      .timeout(5000)
      .emit(event, payload, (err: Error | null, a: any) =>
        err ? reject(err) : resolve(a),
      ),
  );
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply.data;
}
async function connect(code: string, token: string) {
  const s = io(base, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  const snapshot = await call(s, E.join, { code, token });
  return { s, snapshot };
}
try {
  for (const c of cases) {
    const peers = [];
    for (const seat of c.seats) peers.push(await connect(c.code, seat.token));
    let serial = 0;
    const action = (
      s: Socket,
      version: number,
      a: unknown,
      requestId = `op${serial++}`,
    ) =>
      call(s, E.action, {
        code: c.code,
        request: { requestId, version, action: a },
      });
    if (c.role === "tituba") {
      let own = await action(peers[0].s, peers[0].snapshot.version, {
        type: "TITUBA_START",
      });
      const reconnect = await connect(c.code, c.seats[0].token);
      assert.deepEqual(
        reconnect.snapshot.view.private.choice,
        own.view.private.choice,
      );
      await pause();
      const counts = peers.map(() => 0);
      let sameSeatUpdates = 0;
      peers.forEach((p, i) => p.s.on(E.update, () => counts[i]++));
      reconnect.s.on(E.update, () => sameSeatUpdates++);
      const order = own.view.private.choice.deck.map((card: any) => card.id);
      [order[0], order[1]] = [order[1], order[0]];
      const version = own.version;
      own = await action(peers[0].s, version, {
        type: "TITUBA_REORDER",
        cardIds: order,
      });
      await pause();
      assert.equal(own.version, version);
      assert.equal(counts[0], 1);
      assert.equal(sameSeatUpdates, 1);
      assert(counts.slice(1).every((v) => v === 0));
      const other = await call(peers[1].s, E.join, {
        code: c.code,
        token: c.seats[1].token,
      });
      for (const id of order)
        assert(!JSON.stringify(other).includes(JSON.stringify(id)));
      own = await action(
        reconnect.s,
        version,
        { type: "TITUBA_FINISH" },
        "finish",
      );
      assert.deepEqual(
        own.view.private.hand.slice(-2).map((card: any) => card.id),
        order.slice(0, 2),
      );
      const duplicate = await action(
        reconnect.s,
        version,
        { type: "TITUBA_FINISH" },
        "finish",
      );
      assert.deepEqual(duplicate.view, own.view);
      assert.equal(own.view.turnPlayerId, c.seats[1].playerId);
    } else {
      const version = peers[0].snapshot.version;
      const own = await action(
        peers[0].s,
        version,
        { type: "PARRIS_DRAW", cardIds: c.discardIds },
        "parris",
      );
      assert.deepEqual(
        own.view.private.hand.slice(-2).map((card: any) => card.id),
        c.discardIds,
      );
      assert.equal(own.view.private.abilityUses.samuel_parris, 1);
      const duplicate = await action(
        peers[0].s,
        version,
        { type: "PARRIS_DRAW", cardIds: c.discardIds },
        "parris",
      );
      assert.deepEqual(duplicate.view, own.view);
      const reconnect = await connect(c.code, c.seats[0].token);
      assert.deepEqual(reconnect.snapshot.view, own.view);
    }
    for (const s of clients.splice(0)) s.disconnect();
    results.push({ players: c.n, role: c.role, passed: true });
  }
  const report = {
    cases: results.length,
    passed: results.length,
    failed: 0,
    countsProfile: "candidate-59",
    results,
  };
  mkdirSync("docs/witch-town/validation", { recursive: true });
  writeFileSync(
    "docs/witch-town/validation/protocol-m4-active.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  for (const s of clients) s.disconnect();
  await new Promise<void>((r) => server.close(() => r()));
  // This directory was created by this script under the OS temp directory.
  rmSync(dir, { recursive: true, force: true });
}
