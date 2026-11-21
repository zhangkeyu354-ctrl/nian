import type { Server, Socket } from "socket.io";
import { CS_EVENTS } from "../../../packages/shared/src/cs-protocol.ts";
import type { GameCommand } from "../../../packages/crime-scene/src/game.ts";
import { CrimeSceneRoom, CrimeSceneRoomStore } from "./cs-rooms.ts";

const channel = (code: string) => `cs:${code}`;

export function attachCrimeScene(io: Server, dataDir: string, options: { maxRooms: number; idleMs: number }) {
  const store = new CrimeSceneRoomStore(dataDir);
  const find = (code: unknown) => {
    const room = store.rooms.get(String(code ?? "").toUpperCase());
    if (!room) throw new Error("房间不存在");
    return room;
  };
  const busy = (code: string) => (io.sockets.adapter.rooms.get(channel(code))?.size ?? 0) > 0;
  setInterval(() => store.prune(options.idleMs, busy), 30 * 60_000).unref();
  const broadcast = (room: CrimeSceneRoom) => {
    store.save(room);
    for (const socketId of io.sockets.adapter.rooms.get(channel(room.file.code)) ?? []) {
      const socket = io.sockets.sockets.get(socketId);
      const token = socket?.data.csToken as string | undefined;
      if (socket && token) socket.emit(CS_EVENTS.update, room.snapshot(token));
    }
  };
  setInterval(() => {
    for (const room of store.rooms.values()) if (room.tick(Date.now())) broadcast(room);
  }, 500).unref();

  io.on("connection", (socket: Socket) => {
    const detach = () => {
      const room = socket.data.csRoom as CrimeSceneRoom | undefined;
      const token = socket.data.csToken as string | undefined;
      if (!room || !token) return;
      socket.leave(channel(room.file.code));
      room.setConnected(token, false, Date.now());
      socket.data.csRoom = undefined;
      socket.data.csToken = undefined;
      broadcast(room);
    };
    const attach = (room: CrimeSceneRoom, token: string) => {
      room.snapshot(token); // credential validation before changing the old connection
      if (socket.data.csRoom === room && socket.data.csToken === token) return;
      detach();
      socket.data.csRoom = room;
      socket.data.csToken = token;
      socket.join(channel(room.file.code));
      room.setConnected(token, true, Date.now());
      broadcast(room);
    };
    const guarded = <T>(fn: (request: T) => object) => (request: T, ack: (value: object) => void) => {
      if (typeof ack !== "function") return;
      try { ack({ ok: true, ...fn(request) }); }
      catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "操作失败" }); }
    };

    socket.on(CS_EVENTS.create, guarded(() => {
      if (store.rooms.size >= options.maxRooms) throw new Error("房间已满，请稍后再试");
      return { code: store.create().file.code };
    }));
    socket.on(CS_EVENTS.claim, guarded((request: { code: string; name: string }) => {
      const room = find(request?.code);
      const token = room.claim(String(request?.name ?? ""));
      attach(room, token);
      return { token, snapshot: room.snapshot(token) };
    }));
    socket.on(CS_EVENTS.join, guarded((request: { code: string; token: string }) => {
      const room = find(request?.code);
      attach(room, String(request?.token ?? ""));
      return { snapshot: room.snapshot(request.token) };
    }));
    socket.on(CS_EVENTS.lobby, guarded((request: { code: string; token: string; action: { type: "start" } | { type: "rematch" } | { type: "configure"; cardsPerKind?: 3 | 4 | 5; eventsEnabled?: boolean; forensicSeat?: number; mode?: "local" | "online" } }) => {
      const room = find(request?.code);
      if (request?.action?.type === "start") room.start(request.token, Date.now());
      else if (request?.action?.type === "configure") room.configure(request.token, request.action);
      else if (request?.action?.type === "rematch") room.rematch(request.token);
      else throw new Error("房间操作无效");
      broadcast(room);
      return { snapshot: room.snapshot(request.token) };
    }));
    socket.on(CS_EVENTS.command, guarded((request: { code: string; token: string; command: GameCommand }) => {
      const room = find(request?.code);
      const before = room.file.version;
      const result = room.command(request.token, request.command, Date.now());
      if (room.file.version !== before) broadcast(room);
      return { ...result, snapshot: room.snapshot(request.token) };
    }));
    socket.on(CS_EVENTS.chat, guarded((request: { code: string; token: string; text: string }) => {
      const room = find(request?.code);
      room.chat(request.token, request.text, Date.now());
      broadcast(room);
      return {};
    }));
    socket.on("disconnect", detach);
  });
  return store;
}
