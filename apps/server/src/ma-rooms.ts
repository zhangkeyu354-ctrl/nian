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
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const RACES = 4;

interface MAPlayerFile {
  playerId: string;
  token: string;
  name: string;
  /** 人机（测试用）：服务器替它随机做决定 */
  bot?: boolean;
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
  /** 只在 3 人时有意义（2 人固定双选手） */
  variant?: "standard" | "double";
  /** 随机模式：每人随机发 4 名（旧存档没有这个字段 = 选秀） */
  deal?: "draft" | "random";
  secondWind?: boolean;
  /** Absent on old saves: replay with the old forward-only Banana rule. */
  bananaBackwardPass?: boolean;
  independentMasterminds?: boolean;
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
      // 用户房规 HR-MA-01：每人每场只出 1 名选手（不开放双选手变体）
      settings: {
        races: RACES,
        points: this.file.points,
        variant: "standard",
        deal: this.file.deal ?? "draft",
        bananaBackwardPass: this.file.bananaBackwardPass === true,
        independentMasterminds: this.file.independentMasterminds === true,
        ...(this.file.secondWind === true ? { secondWindPreview: true } : {}),
      },
    });
  }
  idByToken(token: string | null | undefined) {
    return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null;
  }
  /**
   * 加入房间。同名玩家已在房间里（换了浏览器、微信退出后再进、浮窗……本机记录丢了）时，
   * 直接接回原来的位置，不新增一个同名玩家；游戏开始后也只能这样接回。
   */
  claim(name: string, takeover = false) {
    const clean = name.trim().slice(0, 12);
    if (!clean) throw new Error("NAME_REQUIRED");
    const same = this.file.players.find((p) => p.name === clean);
    if (same?.bot) throw new Error("NAME_TAKEN");
    if (same) {
      // 原来那个还连着（比如旧浮窗没关）：要本人确认「我就是 TA」才接回，免得两个人撞名
      if ((this.connections.get(same.playerId) ?? 0) > 0 && !takeover) throw new Error("NAME_TAKEN");
      return same.token;
    }
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
    } else if (action?.type === "KICK") {
      // 房主在开局前移除多出来的玩家（比如重进时多出的同名玩家）
      const id = String(action.playerId);
      if (id === me) throw new Error("BAD_ACTION");
      const before = this.file.players.length;
      this.file.players = this.file.players.filter((p) => p.playerId !== id);
      if (this.file.players.length === before) throw new Error("BAD_ACTION");
    } else if (action?.type === "ADD_BOT") {
      if (this.file.players.length >= MAX_PLAYERS) throw new Error("ROOM_FULL");
      let n = 1;
      while (this.file.players.some((p) => p.name === "人机" + n)) n++;
      this.file.players.push({
        playerId: "bot" + randomBytes(3).toString("hex"),
        token: randomBytes(18).toString("base64url"),
        name: "人机" + n,
        bot: true,
      });
    } else if (action?.type === "SET_SECOND_WIND") {
      if (typeof action.enabled !== "boolean") throw new Error("BAD_ACTION");
      this.file.secondWind = action.enabled;
    } else if (action?.type === "SET_DEAL") {
      if (action.deal !== "draft" && action.deal !== "random") throw new Error("BAD_ACTION");
      this.file.deal = action.deal;
    } else if (action?.type === "START") {
      if (this.file.players.length < MIN_PLAYERS) throw new Error("MA_NEED_PLAYERS");
      this.file.seed = randomInt(2 ** 31);
      this.file.stage = "game";
      this.file.commands = [];
      this.file.bananaBackwardPass = true;
      this.file.independentMasterminds = true;
      this.state = this.create();
    } else throw new Error("BAD_ACTION");
  }
  apply(token: string, version: number, cmd: MAClientCommand) {
    const me = this.idByToken(token);
    if (!me) throw new Error("NOT_SEATED");
    if (!this.state) throw new Error("NOT_STARTED");
    if (version !== this.file.commands.length) throw new Error("STALE");
    let full: MACommand;
    if (cmd?.type === "DRAFT") full = { type: "DRAFT", player: me, racer: String(cmd.racer) };
    else if (cmd?.type === "CHOOSE")
      full = Array.isArray(cmd.racers)
        ? { type: "CHOOSE", player: me, racers: cmd.racers.slice(0, 2).map(String) }
        : { type: "CHOOSE", player: me, racer: String(cmd.racer) };
    else if (cmd?.type === "ANSWER") full = { type: "ANSWER", player: me, value: String(cmd.value) };
    else throw new Error("BAD_ACTION");
    this.state = reduceMA(this.state, full);
    this.file.commands.push(full);
  }
  private isBot(id: string | null | undefined) {
    return !!id && this.file.players.some((p) => p.playerId === id && p.bot);
  }
  /** 人机走一步：轮到任何一个人机做决定时，随机选一个合法选项。没有可做的返回 false */
  botStep(): boolean {
    const s = this.state;
    if (!s || s.phase === "over") return false;
    const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    let cmd: MACommand | null = null;
    if (s.phase === "draft" && s.draft) {
      const who = s.draft.order[s.draft.step];
      if (this.isBot(who) && s.draft.pool.length) cmd = { type: "DRAFT", player: who, racer: pick(s.draft.pool) };
    } else if (s.phase === "choose") {
      const bot = s.players.find((p) => this.isBot(p.id) && p.choices.length === 0);
      const free = bot?.hand.filter((r) => !bot.used.includes(r)) ?? [];
      if (bot && free.length) cmd = { type: "CHOOSE", player: bot.id, racer: pick(free) };
    } else if (s.pending && this.isBot(s.pending.player) && s.pending.options.length) {
      cmd = { type: "ANSWER", player: s.pending.player, value: pick(s.pending.options).value };
    }
    if (!cmd) return false;
    this.state = reduceMA(s, cmd);
    this.file.commands.push(cmd);
    return true;
  }
  snapshot(me: string | null): MARoomSnapshot {
    return {
      code: this.code,
      stage: this.file.stage,
      players: this.file.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        connected: !!p.bot || (this.connections.get(p.playerId) ?? 0) > 0,
        ...(p.bot ? { bot: true } : {}),
        host: p.playerId === this.file.hostId,
      })),
      mySeat: me,
      points: this.file.points,
      variant: "standard",
      deal: this.file.deal ?? "draft",
      secondWind: this.file.secondWind === true,
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
    ROOM_FULL: "房间已满（最多 8 人）。",
    ALREADY_STARTED: "游戏已经开始了。如果你本来就在这局里，请点上面自己的名字接回位置。",
    NAME_TAKEN: "这个名字已经在房间里了。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "游戏还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    MA_NEED_PLAYERS: "至少需要 2 人才能开始。",
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
    kickBots(room);
  };
  // 人机：每次局面变化后，隔一小会儿替人机做下一个决定（要快，主要用来测试）
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const kickBots = (room: MARoom) => {
    if (botTimers.has(room.code) || !room.file.players.some((p) => p.bot)) return;
    botTimers.set(
      room.code,
      setTimeout(() => {
        botTimers.delete(room.code);
        try {
          if (room.botStep()) {
            store.save(room);
            broadcast(room);
          }
        } catch (e) {
          console.warn("魔法运动员人机出错", room.code, e instanceof Error ? e.message : e);
        }
      }, 250),
    );
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
      guarded((req: { code: string; name: string; takeover?: boolean }) => {
        const room = find(req?.code) ?? fail("NO_ROOM");
        const token = room.claim(String(req.name ?? ""), req.takeover === true);
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
