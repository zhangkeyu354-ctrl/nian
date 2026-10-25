import { it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { attachRummikub } from "../src/rk-rooms.ts";
import { RK_EVENTS as E } from "../../../packages/shared/src/rk-protocol.ts";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ask = (s: Socket, event: string, req: object) =>
  s.timeout(3000).emitWithAck(event, req) as Promise<any>;
it("RK real sockets isolate draft packets, reject stolen tokens and reconnect both private peers", async () => {
  const http = createServer();
  const server = new Server(http);
  let now = 1000;
  const store = attachRummikub(
    server,
    mkdtempSync(join(tmpdir(), "rk-network-")),
    { maxRooms: 3, idleMs: 60000, allowFixedSeed: true, clock: () => now },
  );
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + (http.address() as any).port;
  const sockets: Socket[] = [];
  const connect = async () => {
    const s = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    await new Promise<void>((r) => s.once("connect", r));
    return s;
  };
  try {
    const a = await connect(),
      b = await connect(),
      spy = await connect();
    const { code } = await ask(a, E.create, {});
    const ua = await ask(a, E.claim, { code, name: "甲" }),
      ub = await ask(b, E.claim, { code, name: "乙" });
    const users = [ua, ub];
    const clients = [a, b];
    const r = store.rooms.get(code)!;
    const act = (i: number, action: object, seq?: number) =>
      ask(clients[i], E.action, {
        code,
        token: users[i].token,
        version: r.file.version,
        seq: seq ?? r.snapshot(users[i].token, now).nextSeq,
        action,
      });
    expect((await act(0, { type: "READY" })).ok).toBe(true);
    await act(1, { type: "READY" });
    await act(0, { type: "START", seed: 1 });
    const seat = r.file.state!.current;
    const other = 1 - seat;
    const received: any[] = [];
    clients[other].on(E.update, (s) => received.push(s));
    const mirror = await connect();
    await ask(mirror, E.join, { code, token: users[seat].token });
    const own: any[] = [];
    mirror.on(E.update, (s) => own.push(s));
    await wait(20);
    received.length = 0;
    const tile = r.file.state!.players[seat].rack[0];
    const moved = await act(seat, {
      type: "MOVE",
      tiles: [tile],
      to: { meld: null },
    });
    expect(moved.ok).toBe(true);
    await wait(30);
    expect(received).toHaveLength(0);
    expect(own.at(-1).view.draft.board[0].tiles).toEqual([tile]);
    expect(
      (
        await ask(spy, E.action, {
          code,
          token: users[seat].token,
          version: r.file.version,
          seq: 999,
          action: { type: "DRAW" },
        })
      ).ok,
    ).toBe(false);
    expect((await ask(spy, E.join, { code, token: "invalid" })).ok).toBe(false);
    const anon = await ask(spy, E.join, { code });
    expect(anon.snapshot.view).toBeNull();
    expect(JSON.stringify(anon)).not.toContain(users[seat].token);
    clients[seat].disconnect();
    const replacement = await connect();
    const restored = await ask(replacement, E.join, {
      code,
      token: users[seat].token,
    });
    expect(restored.snapshot.view.draft.board[0].tiles).toEqual([tile]);
    clients[seat] = replacement;
    const before = r.file.state!.players[seat].rack.length;
    const bad = await act(seat, { type: "COMMIT" });
    expect(bad.ok).toBe(false);
    expect(bad.consumed).toBe(true);
    expect(r.file.state!.players[seat].rack).toHaveLength(before + 3);
    await wait(30);
    expect(received.length).toBeGreaterThan(0);
    expect(received.at(-1).view.lastAction.error).toBeUndefined();
    const seq = bad.snapshot.nextSeq - 1;
    const duplicate = await ask(replacement, E.action, {
      code,
      token: users[seat].token,
      version: 0,
      seq,
      action: { type: "COMMIT" },
    });
    expect(duplicate.ok).toBe(true);
    expect(duplicate.consumed).toBe(false);
    now = 61000;
    const snap = await ask(clients[r.file.state!.current], E.action, {
      code,
      token: users[r.file.state!.current].token,
      version: r.file.version,
      seq: 999,
      action: { type: "DRAW" },
    });
    expect(snap.ok).toBe(false);
    expect(snap.consumed).toBe(false);
    expect(r.file.state!.lastAction?.type).toBe("TIMEOUT");
  } finally {
    sockets.forEach((s) => s.disconnect());
    store.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("RK store reloads persisted private transaction", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rk-reload-"));
  const http = createServer();
  const server = new Server(http);
  const options = { maxRooms: 2, idleMs: 60000, allowFixedSeed: true };
  const first = attachRummikub(server, dir, options);
  // A second store uses the same JSON on disk, as after a process restart.
  const { RKRoom } = await import("../src/rk-rooms.ts");
  const r = RKRoom.create("SAVE", dir, options);
  const a = r.claim("甲"),
    b = r.claim("乙");
  r.action(a.token, r.file.version, 1, { type: "READY" }, 0);
  r.action(b.token, r.file.version, 1, { type: "READY" }, 0);
  r.action(a.token, r.file.version, 2, { type: "START", seed: 1 }, 0);
  const seat = r.file.state!.current;
  const token = [a, b][seat].token;
  r.action(
    token,
    r.file.version,
    3,
    {
      type: "MOVE",
      tiles: [r.file.state!.players[seat].rack[0]],
      to: { meld: null },
    },
    0,
  );
  const otherServer = new Server(createServer());
  const second = attachRummikub(otherServer, dir, options);
  try {
    expect(second.rooms.get("SAVE")!.snapshot(token, 0)).toEqual(
      r.snapshot(token, 0),
    );
  } finally {
    first.close();
    second.close();
    server.close();
    otherServer.close();
  }
});
