import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  CHINESE_WORDS,
  CNRuleError,
  createCNGame,
  DEFAULT_TIMING,
  reduceCN,
  viewForCN,
  type CNCommand,
  type CNState,
  type CNTiming,
  type Team,
} from "../../../packages/codenames/src/index.ts";
import {
  CN_EVENTS,
  type CaptainMode,
  type CNClientCommand,
  type CNLobbyAction,
  type CNRoomSnapshot,
} from "../../../packages/shared/src/cn-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 16;

interface CNPlayerFile {
  playerId: string;
  token: string;
  name: string;
  team: Team | null;
  /** 自选模式报名的队长 */
  captain: boolean;
}
/** 存档：创建参数 + 命令列表（含时间戳），重启后确定性重放恢复 */
export interface CNRoomFile {
  game: "codenames";
  code: string;
  createdAt: string;
  stage: "lobby" | "game";
  hostId: string | null;
  players: CNPlayerFile[];
  captainMode: CaptainMode;
  round: number;
  seed: number;
  startedAt: number;
  /** 开局时的队伍与队长（之后大厅改动不影响本局重放） */
  lineup: { id: string; name: string; team: Team }[];
  captains?: Partial<Record<Team, string>>;
  commands: CNCommand[];
}

/** 计时可用环境变量缩短，仅供自动化测试：CN_TIMING=提示秒,猜词秒,加时秒 */
export function timingFromEnv(v = process.env.CN_TIMING): CNTiming {
  const parts = String(v ?? "")
    .split(",")
    .map(Number);
  if (parts.length === 3 && parts.every((n) => n > 0))
    return { clueMs: parts[0] * 1000, guessMs: parts[1] * 1000, extraMs: parts[2] * 1000 };
  return DEFAULT_TIMING;
}

export class CNRoom {
  state: CNState | null = null;
  connections = new Map<string, number>();
  timer: NodeJS.Timeout | null = null;
  constructor(
    public file: CNRoomFile,
    public timing: CNTiming = DEFAULT_TIMING,
  ) {
    if (file.stage === "game") {
      let s = this.create();
      for (const c of file.commands) s = reduceCN(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private create() {
    return createCNGame({
      players: this.file.lineup,
      captains: this.file.captains,
      words: CHINESE_WORDS,
      seed: this.file.seed,
      now: this.file.startedAt,
      timing: this.timing,
    });
  }
  private me(token: string) {
    const p = token ? this.file.players.find((x) => x.token === token) : undefined;
    return p ?? fail("NOT_SEATED");
  }
  idByToken(token: string | null | undefined) {
    return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null;
  }
  claim(name: string) {
    const clean = name.trim().slice(0, 12);
    if (!clean) fail("NAME_REQUIRED");
    if (this.file.players.length >= MAX_PLAYERS) fail("ROOM_FULL");
    const playerId = "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean, team: null, captain: false });
    this.file.hostId ??= playerId;
    return token;
  }
  lobby(token: string, action: CNLobbyAction) {
    const me = this.me(token);
    const host = me.playerId === this.file.hostId;
    const t = action?.type;
    if (t === "NEXT") {
      if (!host) fail("HOST_ONLY");
      if (this.state?.phase !== "over") fail("CN_NOT_OVER");
      this.file.stage = "lobby";
      this.file.commands = [];
      for (const p of this.file.players) p.captain = false; // 下一局重新选队长（R24）
      this.state = null;
      return;
    }
    if (this.file.stage !== "lobby") fail("ALREADY_STARTED");
    if (t === "JOIN_TEAM") {
      if (action.team !== null && action.team !== "red" && action.team !== "blue") fail("BAD_ACTION");
      if (me.team !== action.team) me.captain = false;
      me.team = action.team;
    } else if (t === "CLAIM_CAPTAIN") {
      if (this.file.captainMode !== "pick") fail("CN_RANDOM_MODE");
      if (!me.team) fail("CN_PICK_TEAM_FIRST");
      if (this.file.players.some((p) => p !== me && p.team === me.team && p.captain)) fail("CN_CAPTAIN_TAKEN");
      me.captain = true;
    } else if (t === "RELEASE_CAPTAIN") {
      me.captain = false;
    } else if (t === "SET_MODE") {
      if (!host) fail("HOST_ONLY");
      if (action.mode !== "random" && action.mode !== "pick") fail("BAD_ACTION");
      this.file.captainMode = action.mode;
      if (action.mode === "random") for (const p of this.file.players) p.captain = false;
    } else if (t === "SHUFFLE") {
      if (!host) fail("HOST_ONLY");
      const seated = this.file.players.filter((p) => p.team);
      const pool = seated.length >= 4 ? seated : this.file.players;
      const order = pool.map((p) => ({ p, k: randomInt(1 << 30) })).sort((a, b) => a.k - b.k);
      const firstRed = randomInt(2) === 0;
      order.forEach(({ p }, i) => {
        p.team = (i % 2 === 0) === firstRed ? "red" : "blue";
        p.captain = false;
      });
    } else if (t === "MOVE") {
      if (!host) fail("HOST_ONLY");
      const target = this.file.players.find((p) => p.playerId === action.playerId) ?? fail("BAD_ACTION");
      if (action.team !== null && action.team !== "red" && action.team !== "blue") fail("BAD_ACTION");
      if (target.team !== action.team) target.captain = false;
      target.team = action.team;
    } else if (t === "START") {
      if (!host) fail("HOST_ONLY");
      const members = (team: Team) => this.file.players.filter((p) => p.team === team);
      if (members("red").length < 2 || members("blue").length < 2) fail("CN_NEED_PLAYERS");
      const captains: Partial<Record<Team, string>> = {};
      if (this.file.captainMode === "pick") {
        for (const team of ["red", "blue"] as Team[]) {
          const c = members(team).find((p) => p.captain) ?? fail("CN_NEED_CAPTAINS");
          captains[team] = c.playerId;
        }
      }
      this.file.seed = randomInt(2 ** 31);
      this.file.startedAt = Date.now();
      this.file.lineup = this.file.players
        .filter((p) => p.team)
        .map((p) => ({ id: p.playerId, name: p.name, team: p.team! }));
      this.file.captains = this.file.captainMode === "pick" ? captains : undefined;
      this.file.commands = [];
      this.file.round += 1;
      this.file.stage = "game";
      this.state = this.create();
      // 随机模式：把抽中的队长写回名单，方便房间页显示
      for (const p of this.file.players)
        p.captain = p.playerId === this.state.captains.red || p.playerId === this.state.captains.blue;
    } else fail("BAD_ACTION");
  }
  apply(token: string, version: number, cmd: CNClientCommand, at = Date.now()) {
    const me = this.me(token).playerId;
    if (!this.state) fail("NOT_STARTED");
    if (version !== this.file.commands.length) fail("STALE");
    const base = { player: me, at };
    let full: CNCommand;
    switch (cmd?.type) {
      case "GIVE_CLUE": {
        const n = cmd.number === "inf" ? "inf" : Number(cmd.number);
        full = { type: "GIVE_CLUE", ...base, word: String(cmd.word ?? "").slice(0, 40), number: n };
        break;
      }
      case "MARK":
      case "REVEAL":
        full = { type: cmd.type, ...base, index: Math.trunc(Number(cmd.index)) };
        break;
      case "END_GUESSING":
      case "EXTRA_TIME":
      case "TAKE_OPERATOR":
      case "REPORT":
      case "CONFIRM_REPORT":
      case "REJECT_REPORT":
        full = { type: cmd.type, ...base };
        break;
      default:
        return fail("BAD_ACTION");
    }
    this.commit(full);
  }
  /** 到时自动换边；返回是否发生了变化 */
  tick(at = Date.now()) {
    if (!this.state || this.state.phase === "over" || at < this.state.deadline) return false;
    this.commit({ type: "TIMEOUT", at });
    return true;
  }
  private commit(cmd: CNCommand) {
    this.state = reduceCN(this.state!, cmd);
    this.file.commands.push(cmd);
  }
  snapshot(me: string | null, now = Date.now()): CNRoomSnapshot {
    return {
      code: this.code,
      stage: this.file.stage,
      players: this.file.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        captain: p.captain,
        connected: (this.connections.get(p.playerId) ?? 0) > 0,
        host: p.playerId === this.file.hostId,
      })),
      mySeat: me,
      captainMode: this.file.captainMode,
      version: this.file.commands.length,
      serverNow: now,
      round: this.file.round,
      view: this.state ? viewForCN(this.state, me) : null,
    };
  }
}

export class CNRoomStore {
  rooms = new Map<string, CNRoom>();
  touched = new Map<string, number>();
  constructor(
    private dir: string,
    private timing: CNTiming = DEFAULT_TIMING,
  ) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new CNRoom(JSON.parse(readFileSync(join(dir, f), "utf8")), timing);
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的行动代号房间", f, e instanceof Error ? e.message : e);
      }
    }
  }
  create(): CNRoom {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new CNRoom(
      {
        game: "codenames",
        code,
        createdAt: new Date().toISOString(),
        stage: "lobby",
        hostId: null,
        players: [],
        captainMode: "random",
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
  save(room: CNRoom) {
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

export function cnErrorText(e: unknown): { error: string; code: string } {
  if (e instanceof CNRuleError) return { code: e.code, error: e.message };
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NOT_SEATED: "请先加入房间。",
    STALE: "局面刚刚更新了，请看清后再操作。",
    ROOM_FULL: `房间已满（最多 ${MAX_PLAYERS} 人）。`,
    ALREADY_STARTED: "游戏已经开始了，等这局结束再换队。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "游戏还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    CN_NEED_PLAYERS: "每队至少 2 人（1 名队长 + 至少 1 名猜词队员）才能开始。",
    CN_NEED_CAPTAINS: "自选队长模式：红蓝两队都要有人当队长才能开始。",
    CN_CAPTAIN_TAKEN: "本队已经有队长了。",
    CN_PICK_TEAM_FIRST: "请先选择加入红队或蓝队。",
    CN_RANDOM_MODE: "现在是随机队长模式，开局时自动抽选。",
    CN_NOT_OVER: "这一局还没结束。",
    CN_TIME_UP_SWITCHED: "时间到了，已经换到对方回合。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    BAD_ACTION: "操作无效。",
  };
  return { code, error: map[code] ?? "当前操作不合法。" };
}

const sockRoom = (code: string) => "cn:" + code;

/** 在已有的 Socket.IO 服务器上挂上行动代号的房间事件 */
export function attachCodenames(
  io: Server,
  dataDir: string,
  opts: { maxRooms: number; idleMs: number; timing?: CNTiming },
) {
  const store = new CNRoomStore(dataDir, opts.timing ?? timingFromEnv());
  const busy = (code: string) => (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置行动代号房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const broadcast = (room: CNRoom) => {
    const now = Date.now();
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(CN_EVENTS.update, room.snapshot(sock.data.cnSeat ?? null, now));
    }
  };
  /** 服务器权威计时：每次状态变化后重新排定下一次超时 */
  const schedule = (room: CNRoom) => {
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
          console.warn("行动代号计时出错", room.code, e);
        }
        schedule(room);
      },
      Math.max(0, s.deadline - Date.now()) + 20,
    );
    room.timer.unref?.();
  };
  for (const room of store.rooms.values()) schedule(room);
  const find = (code: unknown) => store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: CNRoom | undefined = socket.data.cnRoom;
      const seat: string | null = socket.data.cnSeat ?? null;
      if (room && seat) {
        room.connections.set(seat, Math.max(0, (room.connections.get(seat) ?? 1) - 1));
        broadcast(room);
      }
    };
    const attach = (room: CNRoom, seat: string | null) => {
      if (socket.data.cnRoom && socket.data.cnRoom !== room) {
        leave();
        socket.leave(sockRoom(socket.data.cnRoom.code));
        socket.data.cnSeat = null;
      }
      if (seat && socket.data.cnSeat !== seat) room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.cnRoom = room;
      socket.data.cnSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...cnErrorText(e) });
        }
      };

    socket.on(
      CN_EVENTS.create,
      guarded(() => {
        if (store.rooms.size >= opts.maxRooms) {
          store.prune(opts.idleMs, busy);
          if (store.rooms.size >= opts.maxRooms) fail("TOO_MANY_ROOMS");
        }
        return { code: store.create().code };
      }),
    );
    socket.on(
      CN_EVENTS.join,
      guarded((req: { code: string; token?: string }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        const me = room.idByToken(req.token);
        attach(room, me);
        broadcast(room);
        return { snapshot: room.snapshot(me) };
      }),
    );
    socket.on(
      CN_EVENTS.claim,
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
      CN_EVENTS.lobby,
      guarded((req: { code: string; token: string; action: CNLobbyAction }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        room.lobby(req.token, req.action);
        store.save(room);
        schedule(room);
        broadcast(room);
        return {};
      }),
    );
    socket.on(
      CN_EVENTS.command,
      guarded((req: { code: string; token: string; version: number; command: CNClientCommand }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        // 先结算已经过期的超时，再处理这条命令（过期操作会被引擎以「时间到」拒绝）
        if (room.tick()) {
          store.save(room);
          schedule(room);
          broadcast(room);
          fail("CN_TIME_UP_SWITCHED");
        }
        room.apply(req.token, req.version, req.command);
        store.save(room);
        schedule(room);
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
