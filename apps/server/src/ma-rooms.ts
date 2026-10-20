import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createMAGame,
  DEFAULT_POINTS,
  MARuleError,
  reduceMA,
  viewForMA,
} from "../../../packages/magical-athlete/src/index.ts";
import type { MACommand, MAState } from "../../../packages/magical-athlete/src/types.ts";
import {
  MA_EVENTS,
  type MAClientCommand,
  type MALobbyAction,
  type MAPointsSetting,
  type MARoomSnapshot,
} from "../../../packages/shared/src/ma-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const RACES = 4;

interface MAPlayerFile {
  playerId: string;
  token: string;
  name: string;
}
/** 存档：创建参数 + 命令列表，重启后确定性重放恢复 */
export interface MARoomFile {
  game: "magical-athlete";
  code: string;
  createdAt: string;
  stage: "lobby" | "game";
  hostId: string | null;
  players: MAPlayerFile[];
  points: MAPointsSetting[];
  seed: number;
  commands: MACommand[];
}

export class MARoom {
  state: MAState | null = null;
  connections = new Map<string, number>();
  constructor(public file: MARoomFile) {
    if (file.stage === "game") {
      let s = this.create();
      for (const c of file.commands) s = reduceMA(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private create() {
    return createMAGame({
      players: this.file.players.map((p) => ({ id: p.playerId, name: p.name })),
      seed: this.file.seed,
      settings: { races: RACES, points: this.file.points },
    });
  }
  idByToken(token: string | null | undefined) {
    return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null;
  }
  claim(name: string) {
    const clean = name.trim().slice(0, 12);
    if (!clean) throw new Error("NAME_REQUIRED");
    if (this.file.stage !== "lobby") throw new Error("ALREADY_STARTED");
    if (this.file.players.length >= MAX_PLAYERS) throw new Error("ROOM_FULL");
    const playerId = "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean });
    this.file.hostId ??= playerId;
    return token;
  }
  lobby(token: string, action: MALobbyAction) {
    const me = this.idByToken(token);
    if (!me) throw new Error("NOT_SEATED");
    if (this.file.stage !== "lobby") throw new Error("ALREADY_STARTED");
    if (me !== this.file.hostId) throw new Error("HOST_ONLY");
    if (action?.type === "SET_POINTS") {
      const pts = action.points;
      if (!Array.isArray(pts) || pts.length !== RACES) throw new Error("BAD_ACTION");
      this.file.points = pts.map((p) => ({
        gold: clampPoint(p?.gold),
        silver: clampPoint(p?.silver),
      }));
    } else if (action?.type === "START") {
      if (this.file.players.length < MIN_PLAYERS) throw new Error("MA_NEED_PLAYERS");
      this.file.seed = randomInt(2 ** 31);
      this.file.stage = "game";
      this.file.commands = [];
      this.state = this.create();
    } else throw new Error("BAD_ACTION");
  }
  apply(token: string, version: number, cmd: MAClientCommand) {
    const me = this.idByToken(token);
    if (!me) throw new Error("NOT_SEATED");
    if (!this.state) throw new Error("NOT_STARTED");
    if (version !== this.file.commands.length) throw new Error("STALE");
    let full: MACommand;
    if (cmd?.type === "DRAFT" || cmd?.type === "CHOOSE")
      full = { type: cmd.type, player: me, racer: String(cmd.racer) };
    else if (cmd?.type === "ANSWER") full = { type: "ANSWER", player: me, value: String(cmd.value) };
    else throw new Error("BAD_ACTION");
    this.state = reduceMA(this.state, full);
    this.file.commands.push(full);
  }
  snapshot(me: string | null): MARoomSnapshot {
    return {
      code: this.code,
      stage: this.file.stage,
      players: this.file.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        connected: (this.connections.get(p.playerId) ?? 0) > 0,
        host: p.playerId === this.file.hostId,
      })),
      mySeat: me,
      points: this.file.points,
      version: this.file.commands.length,
      view: this.state ? viewForMA(this.state, me) : null,
    };
  }
}
const clampPoint = (v: unknown) => Math.max(0, Math.min(20, Math.round(Number(v) || 0)));

export class MARoomStore {
  rooms = new Map<string, MARoom>();
  touched = new Map<string, number>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new MARoom(JSON.parse(readFileSync(join(dir, f), "utf8")));
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的魔法运动员房间", f, e instanceof Error ? e.message : e);
      }
    }
  }
  create(): MARoom {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new MARoom({
      game: "magical-athlete",
      code,
      createdAt: new Date().toISOString(),
      stage: "lobby",
      hostId: null,
      players: [],
      points: Array.from({ length: RACES }, () => ({ ...DEFAULT_POINTS })),
      seed: 0,
      commands: [],
    });
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }
  save(room: MARoom) {
    this.touched.set(room.code, Date.now());
    const target = join(this.dir, room.code + ".json");
    writeFileSync(target + ".tmp", JSON.stringify(room.file));
    renameSync(target + ".tmp", target);
  }
  prune(maxIdleMs: number, busy: (code: string) => boolean, now = Date.now()) {
    let n = 0;
    for (const code of [...this.rooms.keys()]) {
      if (busy(code) || now - (this.touched.get(code) ?? now) < maxIdleMs) continue;
      this.rooms.delete(code);
      this.touched.delete(code);
      rmSync(join(this.dir, code + ".json"), { force: true });
      n++;
    }
    return n;
  }
}

export function maErrorText(e: unknown): { error: string; code: string } {
  if (e instanceof MARuleError) return { code: e.code, error: e.message };
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NOT_SEATED: "请先加入房间。",
    STALE: "比赛已经更新，请看清最新状态后再操作。",
    ROOM_FULL: "房间已满（最多 6 人）。",
    ALREADY_STARTED: "游戏已经开始了。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "游戏还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    MA_NEED_PLAYERS: "至少需要 3 人才能开始（2 人变体尚未实现）。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    BAD_ACTION: "操作无效。",
  };
  return { code, error: map[code] ?? "当前操作不合法。" };
}

const sockRoom = (code: string) => "ma:" + code;

/** 在已有的 Socket.IO 服务器上挂上魔法运动员的房间事件 */
export function attachMagicalAthlete(
  io: Server,
  dataDir: string,
  opts: { maxRooms: number; idleMs: number },
) {
  const store = new MARoomStore(dataDir);
  const busy = (code: string) => (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置魔法运动员房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const broadcast = (room: MARoom) => {
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(MA_EVENTS.update, room.snapshot(sock.data.maSeat ?? null));
    }
  };
  const find = (code: unknown) => store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: MARoom | undefined = socket.data.maRoom;
      const seat: string | null = socket.data.maSeat ?? null;
      if (room && seat) {
        room.connections.set(seat, Math.max(0, (room.connections.get(seat) ?? 1) - 1));
        broadcast(room);
      }
    };
    const attach = (room: MARoom, seat: string | null) => {
      if (socket.data.maRoom && socket.data.maRoom !== room) {
        leave();
        socket.leave(sockRoom(socket.data.maRoom.code));
        socket.data.maSeat = null;
      }
      if (seat && socket.data.maSeat !== seat)
        room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.maRoom = room;
      socket.data.maSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...maErrorText(e) });
        }
      };

    socket.on(
      MA_EVENTS.create,
      guarded(() => {
        if (store.rooms.size >= opts.maxRooms) {
          store.prune(opts.idleMs, busy);
          if (store.rooms.size >= opts.maxRooms) throw new Error("TOO_MANY_ROOMS");
        }
        return { code: store.create().code };
      }),
    );
    socket.on(
      MA_EVENTS.join,
      guarded((req: { code: string; token?: string }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        const me = room.idByToken(req.token);
        attach(room, me);
        broadcast(room);
        return { snapshot: room.snapshot(me) };
      }),
    );
    socket.on(
      MA_EVENTS.claim,
      guarded((req: { code: string; name: string }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        const token = room.claim(String(req.name ?? ""));
        store.save(room);
        attach(room, room.idByToken(token));
        broadcast(room);
        return { token };
      }),
    );
    socket.on(
      MA_EVENTS.lobby,
      guarded((req: { code: string; token: string; action: MALobbyAction }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        room.lobby(req.token, req.action);
        store.save(room);
        broadcast(room);
        return {};
      }),
    );
    socket.on(
      MA_EVENTS.command,
      guarded((req: { code: string; token: string; version: number; command: MAClientCommand }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        room.apply(req.token, req.version, req.command);
        store.save(room);
        broadcast(room);
        return {};
      }),
    );
    socket.on("disconnect", leave);
  });
  return store;
}
const fail = (code: string): never => {
  throw new Error(code);
};
