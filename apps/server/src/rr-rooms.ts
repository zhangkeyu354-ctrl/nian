import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createRRGame,
  DEFAULT_TARGET,
  DEFAULT_TIMING,
  MAX_PLAYERS,
  MAX_TARGET,
  MIN_PLAYERS,
  MIN_TARGET,
  reduceRR,
  RRRuleError,
  viewForRR,
  type RRCommand,
  type RRState,
  type RRTiming,
} from "../../../packages/reflex-race/src/index.ts";
import {
  RR_EVENTS,
  type RRClientCommand,
  type RRLobbyAction,
  type RRRoomSnapshot,
} from "../../../packages/shared/src/rr-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RRPlayerFile {
  playerId: string;
  token: string;
  name: string;
}
/** 存档：创建参数 + 命令列表（含时间戳），重启后确定性重放恢复 */
export interface RRRoomFile {
  game: "reflex-race";
  code: string;
  createdAt: string;
  stage: "lobby" | "game";
  hostId: string | null;
  players: RRPlayerFile[];
  target: number;
  round: number;
  seed: number;
  startedAt: number;
  lineup: { id: string; name: string }[];
  commands: RRCommand[];
}

/** 计时可用环境变量调整，仅供自动化测试：RR_TIMING=准备毫秒,作答毫秒,公布毫秒 */
export function timingFromEnv(v = process.env.RR_TIMING): RRTiming {
  const p = String(v ?? "")
    .split(",")
    .map(Number);
  if (p.length === 3 && p.every((n) => n > 0))
    return { readyMs: p[0], cardMs: p[1], revealMs: p[2] };
  return DEFAULT_TIMING;
}

export class RRRoom {
  state: RRState | null = null;
  connections = new Map<string, number>();
  timer: NodeJS.Timeout | null = null;
  constructor(
    public file: RRRoomFile,
    public timing: RRTiming = DEFAULT_TIMING,
  ) {
    if (file.stage === "game") {
      let s = this.create();
      for (const c of file.commands) s = reduceRR(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private create() {
    return createRRGame({
      players: this.file.lineup,
      target: this.file.target,
      seed: this.file.seed,
      now: this.file.startedAt,
      timing: this.timing,
    });
  }
  private me(token: string) {
    return (
      (token ? this.file.players.find((x) => x.token === token) : undefined) ??
      fail("NOT_SEATED")
    );
  }
  idByToken(token: string | null | undefined) {
    return token
      ? (this.file.players.find((p) => p.token === token)?.playerId ?? null)
      : null;
  }
  claim(name: string) {
    const clean = name.trim().slice(0, 12);
    if (!clean) fail("NAME_REQUIRED");
    if (this.file.players.length >= MAX_PLAYERS) fail("ROOM_FULL");
    const playerId =
      "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean });
    this.file.hostId ??= playerId;
    return token;
  }
  lobby(token: string, action: RRLobbyAction, at = Date.now()) {
    const me = this.me(token);
    if (me.playerId !== this.file.hostId) fail("HOST_ONLY");
    const t = action?.type;
    if (t === "NEXT") {
      if (this.state?.phase !== "over") fail("RR_NOT_OVER");
      this.file.stage = "lobby";
      this.file.commands = [];
      this.state = null;
    } else if (t === "SET_TARGET") {
      if (this.file.stage !== "lobby") fail("ALREADY_STARTED");
      const n = Math.trunc(Number(action.target));
      if (!(n >= MIN_TARGET && n <= MAX_TARGET)) fail("RR_BAD_TARGET");
      this.file.target = n;
    } else if (t === "KICK") {
      if (this.file.stage !== "lobby") fail("ALREADY_STARTED");
      if (action.playerId === me.playerId) fail("BAD_ACTION");
      this.file.players = this.file.players.filter(
        (p) => p.playerId !== action.playerId,
      );
    } else if (t === "START") {
      // 开局；上一局结束后也可以直接再来一局
      if (this.file.stage === "game" && this.state?.phase !== "over")
        fail("ALREADY_STARTED");
      if (this.file.players.length < MIN_PLAYERS) fail("RR_NEED_PLAYERS");
      this.file.seed = randomInt(2 ** 31);
      this.file.startedAt = at;
      this.file.lineup = this.file.players.map((p) => ({
        id: p.playerId,
        name: p.name,
      }));
      this.file.commands = [];
      this.file.round += 1;
      this.file.stage = "game";
      this.state = this.create();
    } else fail("BAD_ACTION");
  }
  apply(
    token: string,
    cmd: RRClientCommand & { cardNo?: number },
    at = Date.now(),
  ) {
    const me = this.me(token).playerId;
    const state = this.state ?? fail("NOT_STARTED");
    if (cmd?.type !== "TAP") fail("BAD_ACTION");
    // 点的是哪张图：防止上一张的点击落到下一张上
    if (cmd.cardNo !== undefined && cmd.cardNo !== state.cardNo)
      fail("RR_TOO_LATE");
    this.commit({
      type: "TAP",
      player: me,
      obj: Math.trunc(Number(cmd.obj)),
      at,
    });
  }
  /** 到时推进（公布答案 / 下一张图）；返回是否发生了变化 */
  tick(at = Date.now()) {
    if (!this.state || this.state.phase === "over" || at < this.state.deadline)
      return false;
    this.commit({ type: "TICK", at });
    return true;
  }
  private commit(cmd: RRCommand) {
    this.state = reduceRR(this.state!, cmd);
    this.file.commands.push(cmd);
  }
  snapshot(me: string | null, now = Date.now()): RRRoomSnapshot {
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
      target: this.file.target,
      version: this.file.commands.length,
      serverNow: now,
      round: this.file.round,
      view: this.state ? viewForRR(this.state) : null,
    };
  }
}

export class RRRoomStore {
  rooms = new Map<string, RRRoom>();
  touched = new Map<string, number>();
  constructor(
    private dir: string,
    private timing: RRTiming = DEFAULT_TIMING,
  ) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new RRRoom(
          JSON.parse(readFileSync(join(dir, f), "utf8")),
          timing,
        );
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn(
          "跳过无法恢复的眼疾手快房间",
          f,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  create(): RRRoom {
    let code: string;
    do
      code = Array.from(
        { length: 4 },
        () => CODE_CHARS[randomInt(CODE_CHARS.length)],
      ).join("");
    while (this.rooms.has(code));
    const room = new RRRoom(
      {
        game: "reflex-race",
        code,
        createdAt: new Date().toISOString(),
        stage: "lobby",
        hostId: null,
        players: [],
        target: DEFAULT_TARGET,
        round: 0,
        seed: 0,
        startedAt: 0,
        lineup: [],
        commands: [],
      },
      this.timing,
    );
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }
  save(room: RRRoom) {
    this.touched.set(room.code, Date.now());
    const target = join(this.dir, room.code + ".json");
    writeFileSync(target + ".tmp", JSON.stringify(room.file));
    renameSync(target + ".tmp", target);
  }
  prune(maxIdleMs: number, busy: (code: string) => boolean, now = Date.now()) {
    let n = 0;
    for (const code of [...this.rooms.keys()]) {
      if (busy(code) || now - (this.touched.get(code) ?? now) < maxIdleMs)
        continue;
      const room = this.rooms.get(code)!;
      if (room.timer) clearTimeout(room.timer);
      this.rooms.delete(code);
      this.touched.delete(code);
      rmSync(join(this.dir, code + ".json"), { force: true });
      n++;
    }
    return n;
  }
}

export function rrErrorText(e: unknown): { error: string; code: string } {
  if (e instanceof RRRuleError) return { code: e.code, error: e.message };
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NOT_SEATED: "请先加入房间。",
    ROOM_FULL: `房间已满（最多 ${MAX_PLAYERS} 人）。`,
    ALREADY_STARTED: "游戏已经开始了。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "游戏还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    RR_NEED_PLAYERS: "至少 2 人才能开始。",
    RR_BAD_TARGET: `目标分需在 ${MIN_TARGET}–${MAX_TARGET} 之间。`,
    RR_NOT_OVER: "这一局还没结束。",
    RR_TOO_LATE: "这张图已经结束了。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    BAD_ACTION: "操作无效。",
  };
  return { code, error: map[code] ?? "当前操作不合法。" };
}

const sockRoom = (code: string) => "rr:" + code;

/** 在已有的 Socket.IO 服务器上挂上眼疾手快的房间事件 */
export function attachReflexRace(
  io: Server,
  dataDir: string,
  opts: { maxRooms: number; idleMs: number; timing?: RRTiming },
) {
  const store = new RRRoomStore(dataDir, opts.timing ?? timingFromEnv());
  const busy = (code: string) =>
    (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置眼疾手快房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const broadcast = (room: RRRoom) => {
    const now = Date.now();
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock)
        sock.emit(
          RR_EVENTS.update,
          room.snapshot(sock.data.rrSeat ?? null, now),
        );
    }
  };
  /** 服务器权威计时：到点公布答案、换下一张图 */
  const schedule = (room: RRRoom) => {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const s = room.state;
    if (!s || s.phase === "over") return;
    room.timer = setTimeout(
      () => {
        room.timer = null;
        try {
          if (room.tick()) {
            store.save(room);
            broadcast(room);
          }
        } catch (e) {
          console.warn("眼疾手快计时出错", room.code, e);
        }
        schedule(room);
      },
      Math.max(0, s.deadline - Date.now()) + 10,
    );
    room.timer.unref?.();
  };
  for (const room of store.rooms.values()) schedule(room);
  const find = (code: unknown) =>
    store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: RRRoom | undefined = socket.data.rrRoom;
      const seat: string | null = socket.data.rrSeat ?? null;
      if (room && seat) {
        room.connections.set(
          seat,
          Math.max(0, (room.connections.get(seat) ?? 1) - 1),
        );
        broadcast(room);
      }
    };
    const attach = (room: RRRoom, seat: string | null) => {
      if (socket.data.rrRoom && socket.data.rrRoom !== room) {
        leave();
        socket.leave(sockRoom(socket.data.rrRoom.code));
        socket.data.rrSeat = null;
      }
      if (seat && socket.data.rrSeat !== seat)
        room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.rrRoom = room;
      socket.data.rrSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...rrErrorText(e) });
        }
      };

    socket.on(
      RR_EVENTS.create,
      guarded(() => {
        if (store.rooms.size >= opts.maxRooms) {
          store.prune(opts.idleMs, busy);
          if (store.rooms.size >= opts.maxRooms) fail("TOO_MANY_ROOMS");
        }
        return { code: store.create().code };
      }),
    );
    socket.on(
      RR_EVENTS.join,
      guarded((req: { code: string; token?: string }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        const me = room.idByToken(req.token);
        attach(room, me);
        broadcast(room);
        return { snapshot: room.snapshot(me) };
      }),
    );
    socket.on(
      RR_EVENTS.claim,
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
      RR_EVENTS.lobby,
      guarded((req: { code: string; token: string; action: RRLobbyAction }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        room.lobby(req.token, req.action);
        store.save(room);
        schedule(room);
        broadcast(room);
        return {};
      }),
    );
    socket.on(
      RR_EVENTS.command,
      guarded(
        (req: {
          code: string;
          token: string;
          command: RRClientCommand & { cardNo?: number };
        }) => {
          const room = find(req?.code) ?? fail("NO_ROOM");
          const at = Date.now();
          // 先结算已经过期的计时，再处理这次点击
          if (room.tick(at)) {
            store.save(room);
            schedule(room);
            broadcast(room);
          }
          room.apply(req.token, req.command, at);
          store.save(room);
          schedule(room);
          broadcast(room);
          return { tap: room.state?.taps.at(-1) ?? null };
        },
      ),
    );
    socket.on(
      RR_EVENTS.ping,
      (_req: unknown, ack: (a: { ok: true; now: number }) => void) => {
        if (typeof ack === "function") ack({ ok: true, now: Date.now() });
      },
    );
    socket.on("disconnect", leave);
  });
  return store;
}
const fail = (code: string): never => {
  throw new Error(code);
};
