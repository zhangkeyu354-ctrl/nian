// Loopback-only protocol fixture. Never imported by the production server.
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Server } from "socket.io";
import assert from "node:assert/strict";
import { attachNaodongScale } from "../apps/server/src/nd-rooms.ts";
import {
  viewForND,
  type NDState,
} from "../packages/naodong-scale/src/index.ts";
import type { NDSnapshot } from "../packages/shared/src/nd-protocol.ts";

export async function ndSandbox(
  directory = mkdtempSync(join(tmpdir(), "nd-network-")),
  initialClock = 100000,
) {
  let now = initialClock;
  const versions = new Map<string, NDState | null>();
  const http = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.setHeader("Content-Type", "text/html;charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(resolve("scripts/fixtures/nd-client.html"), "utf8"));
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  const io = new Server(http, { serveClient: true });
  const store = attachNaodongScale(io, directory, {
    maxRooms: 100,
    idleMs: 86400000,
    allowFixedSeed: true,
    clock: () => now,
    tickMs: 10,
  });
  io.on("connection", (socket) =>
    socket.onAnyOutgoing((event, snapshot: NDSnapshot) => {
      if (event === "nd:update") {
        const room = store.rooms.get(snapshot.code);
        if (room)
          versions.set(
            `${snapshot.code}:${snapshot.version}`,
            structuredClone(room.file.state),
          );
      }
    }),
  );
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  function checkSnapshot(snapshot: NDSnapshot, seat: number | null) {
    const allowed = [
      "code",
      "version",
      "mySeat",
      "hostId",
      "settings",
      "players",
      "view",
      "nextSeq",
      "serverNow",
      "deadline",
      "expired",
      "timeoutCount",
    ];
    assert.ok(Object.keys(snapshot).every((k) => allowed.includes(k)));
    assert.ok(snapshot.players.every((p) => !("token" in p)));
    for (const key of [
      "state",
      "file",
      "numbers",
      "unusedNumbers",
      "seed",
      "random",
      "receipts",
      "topicCards",
    ])
      assert.ok(!(key in snapshot));
    if (snapshot.mySeat === null) {
      assert.equal(snapshot.view, null);
      return;
    }
    assert.equal(snapshot.mySeat, seat);
    const key = `${snapshot.code}:${snapshot.version}`;
    assert.ok(
      versions.has(key),
      "every packet version must have server-only reference",
    );
    const state = versions.get(key)!;
    const expected = state ? viewForND(state, seat) : null;
    assert.ok(
      JSON.stringify(snapshot.view) === JSON.stringify(expected),
      "packet must equal this seat projection at this version",
    );
  }
  async function close() {
    store.close();
    await new Promise<void>((r) => io.close(() => r()));
    if (http.listening) await new Promise<void>((r) => http.close(() => r()));
  }
  return {
    io,
    http,
    store,
    base,
    directory,
    versions,
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    checkSnapshot,
    close,
  };
}
export const until = async (
  check: () => boolean,
  label = "condition",
  timeout = 8000,
) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw Error("Timeout waiting for " + label);
    await new Promise((r) => setTimeout(r, 10));
  }
};
