import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createKB,
  reduceKB,
  viewForKB,
  type Command,
  type KBState,
  type Mode,
} from "../../../packages/kariba/src/index.ts";
import {
  KB_EVENTS,
  type KBClientCommand,
  type KBLobbyAction,
  type KBRoomSnapshot,
} from "../../../packages/shared/src/kb-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 8;

interface KBPlayerFile { playerId: string; token: string; name: string }
/** 存档：创建参数 + 命令列表，重启后确定性重放恢复（不写日志） */
export interface KBRoomFile {
  game: "kariba";
  code: string;
  createdAt: string;
  stage: "lobby" | "game";
  hostId: string | null;
  players: KBPlayerFile[];
  mode: Mode;
  seconds: 0 | 30 | 60;
  round: number;
  seed: number;
  startedAt: number;
  /** 座位顺序（playerId），组队时已交叉排好 */
  lineup: string[];
  commands: Command[];
}

const fail = (code: string): never => {
  throw new Error(code);
};

/** 组队：随机分队后按 A1 B1 C1 … A2 B2 C2 … 交叉入座 */
function teamLineup(ids: string[]): string[] {
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled; // 引擎默认 teams = i % (n/2)，所以随机顺序即随机分队 + 交叉座位
}

export class KBRoom {
  state: KBState | null = null;
  connections = new Map<string, number>();
  timer: NodeJS.Timeout | null = null;
  constructor(public file: KBRoomFile) {
    if (file.stage === "game") {
      let s = this.create();
      for (const c of file.commands) s = reduceKB(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private create() {
    const names = this.file.lineup.map((id) => this.file.players.find((p) => p.playerId === id)?.name ?? "离开的玩家");
    return createKB(names, {
      seed: this.file.seed,
      mode: this.file.mode,
      seconds: this.file.seconds,
      now: this.file.startedAt,
    });
  }
  private me(token: string) {
    return (token ? this.file.players.find((x) => x.token === token) : undefined) ?? fail("NOT_SEATED");
  }
  idByToken(token: string | null | undefined) {
    return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null;
  }
  claim(name: string) {
    const clean = name.trim().slice(0, 12);
    if (!clean) fail("NAME_REQUIRED");
    if (this.file.stage === "game") fail("ALREADY_STARTED");
    if (this.file.players.length >= MAX_PLAYERS) fail("ROOM_FULL");
    const playerId = "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean });
    this.file.hostId ??= playerId;
    return token;
  }
  lobby(token: string, action: KBLobbyAction, at = Date.now()) {
    const me = this.me(token);
    if (me.playerId !== this.file.hostId) fail("HOST_ONLY");
    const over = this.state?.phase === "FINISHED";
    const t = action?.type;
    if (t !== "START" && this.file.stage === "game" && !over) fail("ALREADY_STARTED");
    if (t === "SET_MODE") {
      if (action.mode !== "solo" && action.mode !== "team") fail("BAD_ACTION");
      this.file.mode = action.mode;
    } else if (t === "SET_SECONDS") {
      if (![0, 30, 60].includes(action.seconds)) fail("BAD_ACTION");
      this.file.seconds = action.seconds;
    } else if (t === "KICK") {
      if (action.playerId === me.playerId) fail("BAD_ACTION");
      this.file.players = this.file.players.filter((p) => p.playerId !== action.playerId);
    } else if (t === "START") {
      if (this.file.stage === "game" && !over) fail("ALREADY_STARTED");
      const n = this.file.players.length;
      if (this.file.mode === "solo" && (n < 2 || n > 5)) fail("KB_SOLO_COUNT");
      if (this.file.mode === "team" && ![4, 6, 8].includes(n)) fail("KB_TEAM_COUNT");
      const ids = this.file.players.map((p) => p.playerId);
      this.file.lineup = this.file.mode === "team" ? teamLineup(ids) : ids;
      this.file.seed = randomInt(2 ** 31);
      this.file.startedAt = at;
      this.file.commands = [];
      this.file.round += 1;
      this.file.stage = "game";
      this.state = this.create();
    } else fail("BAD_ACTION");
  }
  private nextSeq(actor: number | "server") {
    return (this.state!.seq[String(actor)] ?? 0) + 1;
  }
  apply(token: string, cmd: KBClientCommand, at = Date.now()) {
    const me = this.me(token).playerId;
    const s = this.state ?? fail("NOT_STARTED");
    if (cmd?.type !== "PLAY" || !Array.isArray(cmd.cardIds)) fail("BAD_ACTION");
    if (cmd.version !== this.file.commands.length) fail("KB_STALE");
    const seat = this.file.lineup.indexOf(me);
    if (seat < 0) fail("NOT_SEATED");
    this.commit({ type: "PLAY", actor: seat, seq: this.nextSeq(seat), now: at, cardIds: cmd.cardIds.map(String) });
    void s;
  }
  tick(at = Date.now()) {
    const s = this.state;
    if (!s || s.phase === "FINISHED" || s.deadline === null || at < s.deadline) return false;
    this.commit({ type: "TIMEOUT", actor: "server", seq: this.nextSeq("server"), now: at });
    return true;
  }
  private commit(cmd: Command) {
    this.state = reduceKB(this.state!, cmd);
    this.file.commands.push(cmd);
  }
  snapshot(me: string | null, now = Date.now()): KBRoomSnapshot {
    const seat = me ? this.file.lineup.indexOf(me) : -1;
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
      seats: this.file.lineup,
      mode: this.file.mode,
      seconds: this.file.seconds,
      version: this.file.commands.length,
      serverNow: now,
      round: this.file.round,
      view: this.state ? viewForKB(this.state, this.file.stage === "game" ? seat : -1) : null,
    };
  }
}

export class KBRoomStore {
  rooms = new Map<string, KBRoom>();
  touched = new Map<string, number>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new KBRoom(JSON.parse(readFileSync(join(dir, f), "utf8")));
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的卡里巴湖房间", f, e instanceof Error ? e.message : e);
      }
    }
  }
  create(): KBRoom {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new KBRoom({
      game: "kariba", code, createdAt: new Date().toISOString(), stage: "lobby", hostId: null,
      players: [], mode: "solo", seconds: 30, round: 0, seed: 0, startedAt: 0, lineup: [], commands: [],
    });
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }
  save(room: KBRoom) {
    this.touched.set(room.code, Date.now());
    const target = join(this.dir, room.code + ".json");
    writeFileSync(target + ".tmp", JSON.stringify(room.file));
    renameSync(target + ".tmp", target);
  }
  prune(maxIdleMs: number, busy: (code: string) => boolean, now = Date.now()) {
    let n = 0;
    for (const code of [...this.rooms.keys()]) {
      if (busy(code) || now - (this.touched.get(code) ?? now) < maxIdleMs) continue;
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

export function kbErrorText(e: unknown): { error: string; code: string } {
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NOT_SEATED: "请先加入房间。",
    ROOM_FULL: `房间已满（最多 ${MAX_PLAYERS} 人）。`,
    ALREADY_STARTED: "游戏已经开始了。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "游戏还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    KB_SOLO_COUNT: "个人战需要 2–5 人。",
    KB_TEAM_COUNT: "组队需要 4、6 或 8 人（两人一队）。",
    KB_STALE: "画面已更新，请再选一次。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    BAD_ACTION: "操作无效。",
  };
  // 引擎的报错本身就是中文原因，直接给用户
  return { code, error: map[code] ?? code };
}

const sockRoom = (code: string) => "kb:" + code;

export function attachKariba(io: Server, dataDir: string, opts: { maxRooms: number; idleMs: number }) {
  const store = new KBRoomStore(dataDir);
  const busy = (code: string) => (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置卡里巴湖房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const broadcast = (room: KBRoom) => {
    const now = Date.now();
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(KB_EVENTS.update, room.snapshot(sock.data.kbSeat ?? null, now));
    }
  };
  const schedule = (room: KBRoom) => {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const s = room.state;
    if (!s || s.phase === "FINISHED" || s.deadline === null) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      try {
        if (room.tick()) {
          store.save(room);
          broadcast(room);
        }
      } catch (e) {
        console.warn("卡里巴湖计时出错", room.code, e instanceof Error ? e.message : e);
      }
      schedule(room);
    }, Math.max(0, s.deadline - Date.now()) + 50);
    room.timer.unref?.();
  };
  for (const room of store.rooms.values()) schedule(room);
  const find = (code: unknown) => store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: KBRoom | undefined = socket.data.kbRoom;
      const seat: string | null = socket.data.kbSeat ?? null;
      if (room && seat) {
        room.connections.set(seat, Math.max(0, (room.connections.get(seat) ?? 1) - 1));
        broadcast(room);
      }
    };
    const attach = (room: KBRoom, seat: string | null) => {
      if (socket.data.kbRoom && socket.data.kbRoom !== room) {
        leave();
        socket.leave(sockRoom(socket.data.kbRoom.code));
        socket.data.kbSeat = null;
      }
      if (seat && socket.data.kbSeat !== seat) room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.kbRoom = room;
      socket.data.kbSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...kbErrorText(e) });
        }
      };
    socket.on(KB_EVENTS.create, guarded(() => {
      if (store.rooms.size >= opts.maxRooms) {
        store.prune(opts.idleMs, busy);
        if (store.rooms.size >= opts.maxRooms) fail("TOO_MANY_ROOMS");
      }
      return { code: store.create().code };
    }));
    socket.on(KB_EVENTS.join, guarded((req: { code: string; token?: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const me = room.idByToken(req.token);
      attach(room, me);
      broadcast(room);
      return { snapshot: room.snapshot(me) };
    }));
    socket.on(KB_EVENTS.claim, guarded((req: { code: string; name: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const token = room.claim(String(req.name ?? ""));
      store.save(room);
      attach(room, room.idByToken(token));
      broadcast(room);
      return { token };
    }));
    socket.on(KB_EVENTS.lobby, guarded((req: { code: string; token: string; action: KBLobbyAction }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      room.lobby(req.token, req.action);
      store.save(room);
      schedule(room);
      broadcast(room);
      return {};
    }));
    socket.on(KB_EVENTS.command, guarded((req: { code: string; token: string; command: KBClientCommand }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const at = Date.now();
      if (room.tick(at)) {
        store.save(room);
        broadcast(room);
        fail("KB_STALE");
      }
      room.apply(req.token, req.command, at);
      store.save(room);
      schedule(room);
      broadcast(room);
      return {};
    }));
    socket.on("disconnect", leave);
  });
  return store;
}
