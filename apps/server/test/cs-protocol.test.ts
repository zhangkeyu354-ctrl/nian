import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { attachCrimeScene } from "../src/cs-sockets.ts";
import { CS_EVENTS } from "../../../packages/shared/src/cs-protocol.ts";

describe("犯罪现场真实联机协议", () => {
  let cleanup: (() => Promise<void>) | null = null;
  afterEach(async () => { await cleanup?.(); cleanup = null; });

  it("建房、四人加入、开局和按身份过滤快照", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-socket-"));
    const http = createServer();
    const io = new Server(http, { cors: { origin: "*" } });
    attachCrimeScene(io, dir, { maxRooms: 10, idleMs: 60_000 });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const sockets: Socket[] = [];
    cleanup = async () => {
      sockets.forEach((socket) => socket.disconnect());
      await new Promise<void>((resolve) => io.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    };
    const connect = async () => {
      const socket = clientIo(url, { transports: ["websocket"], reconnection: false });
      sockets.push(socket);
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      return socket;
    };
    const send = <T>(socket: Socket, event: string, data: object) => new Promise<T>((resolve) => socket.emit(event, data, resolve));
    const host = await connect();
    const created = await send<{ ok: boolean; code: string }>(host, CS_EVENTS.create, {});
    expect(created.ok).toBe(true);
    const clients = [host, await connect(), await connect(), await connect()];
    const tokens: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await send<{ ok: boolean; token: string }>(clients[i], CS_EVENTS.claim, { code: created.code, name: `玩家${i}` });
      expect(result.ok).toBe(true);
      tokens.push(result.token);
    }
    const started = await send<{ ok: boolean }>(host, CS_EVENTS.lobby, { code: created.code, token: tokens[0], action: { type: "start" } });
    expect(started.ok).toBe(true);
    const snapshots = await Promise.all(clients.map((socket, i) => send<{ ok: boolean; snapshot: { view: { myRole: string; roles?: unknown; answer?: unknown } } }>(socket, CS_EVENTS.join, { code: created.code, token: tokens[i] })));
    expect(snapshots[0].snapshot.view.myRole).toBe("forensic");
    for (const snapshot of snapshots) {
      expect(snapshot.snapshot.view.roles).toBeUndefined();
      expect(snapshot.snapshot.view.answer).toBeUndefined();
    }
    expect(snapshots.filter((x) => x.snapshot.view.myRole === "killer")).toHaveLength(1);
    const night = await send<{ ok: boolean }>(host, CS_EVENTS.command, { code: created.code, token: tokens[0], command: { type: "start", seat: 99, location: "location-1" } });
    expect(night.ok).toBe(true);
    const nightViews = await Promise.all(clients.map((socket, i) => send<{ snapshot: { view: { myRole: string; players: { clues: string[]; means: string[] }[]; answer?: unknown; roles?: unknown } } }>(socket, CS_EVENTS.join, { code: created.code, token: tokens[i] })));
    const killerSeat = nightViews.findIndex((item) => item.snapshot.view.myRole === "killer");
    const killerCards = nightViews[killerSeat].snapshot.view.players[killerSeat];
    const chosen = await send<{ ok: boolean }>(clients[killerSeat], CS_EVENTS.command, { code: created.code, token: tokens[killerSeat], command: { type: "choose", seat: 0, clue: killerCards.clues[0], means: killerCards.means[0] } });
    expect(chosen.ok).toBe(true);
    const after = await Promise.all(clients.map((socket, i) => send<{ snapshot: { view: { myRole: string; answer?: unknown; roles?: unknown } } }>(socket, CS_EVENTS.join, { code: created.code, token: tokens[i] })));
    expect(after[0].snapshot.view.answer).toBeDefined();
    expect(after[killerSeat].snapshot.view.answer).toBeDefined();
    for (let i = 1; i < 4; i++) if (i !== killerSeat) {
      expect(after[i].snapshot.view.answer).toBeUndefined();
      expect(after[i].snapshot.view.roles).toBeUndefined();
    }
  });
});
