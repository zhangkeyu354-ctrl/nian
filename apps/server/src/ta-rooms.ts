import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import { autoMove, botMove, waitingFor, createGame, reduce, viewFor, type Command, type State } from "../../../packages/menace/src/index.ts";
import { TA_EVENTS, type TAClientCommand, type TALobbyAction, type TARoomSnapshot } from "../../../packages/shared/src/ta-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 8;
const fail = (c: string): never => { throw new Error(c); };
const TEXT: Record<string, string> = {
  NO_ROOM: "房间不存在，请检查房间号。", NOT_SEATED: "请先加入房间。", ROOM_FULL: "房间已满（最多 8 人）。", ALREADY_STARTED: "游戏已经开始了。", HOST_ONLY: "只有房主可以这样做。", NOT_STARTED: "游戏还没开始。", NAME_REQUIRED: "请填写昵称。", TA_COUNT: "需要 4–8 人。", TOO_MANY_ROOMS: "服务器房间太多，请稍后再试。",
  NOT_YOUR_TURN: "还没轮到你。", MUST_ACT: "你还有可执行的行动，不能跳过。", BRAIN_DAMAGE: "脑损伤：你必须重复上一名船员的行动类型。", CANNOT_PLAY: "你现在不能打出行动牌。", BAD_TARGET: "这个目标不合法。", BAD_ABILITY: "现在不能使用这个能力。", NEED_DISCARD: "需要先选一张要弃的牌。", VETO_FORCED: "这是最后一张牌，否决必须在此使用。", WAITING: "请等待其他玩家完成选择。", BAD: "操作无效。",
};
interface PlayerFile { playerId: string; token: string; name: string; bot?: boolean }
export interface TARoomFile { game: "menace"; code: string; createdAt: string; stage: "lobby" | "game"; hostId: string | null; players: PlayerFile[]; mode: "basic" | "advanced"; round: number; seed: number; lineup: string[]; commands: Command[]; snapshot?: State; version?: number }

export class TARoom {
  state: State | null = null;
  connections = new Map<string, number>();
  constructor(public file: TARoomFile) {
    if (file.stage === "game") { let s = file.snapshot ?? createGame(file.lineup.length, file.seed, file.mode); if (!file.snapshot) for (const c of file.commands) s = reduce(s, c); this.state = s; }
  }
  get code() { return this.file.code; }
  private me(token: string) { return (token ? this.file.players.find((x) => x.token === token) : undefined) ?? fail("NOT_SEATED"); }
  idByToken(token: string | null | undefined) { return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null; }
  claim(name: string) {
    const clean = name.trim().slice(0, 12); if (!clean) fail("NAME_REQUIRED");
    if (this.file.stage === "game") fail("ALREADY_STARTED");
    if (this.file.players.length >= MAX_PLAYERS) fail("ROOM_FULL");
    const playerId = "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean }); this.file.hostId ??= playerId; return token;
  }
  lobby(token: string, a: TALobbyAction) {
    const me = this.me(token); if (me.playerId !== this.file.hostId) fail("HOST_ONLY");
    const over = this.state?.phase === "over"; if (this.file.stage === "game" && !over) fail("ALREADY_STARTED");
    if (a?.type === "SET_MODE") { if (a.mode !== "basic" && a.mode !== "advanced") fail("BAD"); this.file.mode = a.mode; }
    else if (a?.type === "ADD_BOT") { if (this.file.players.length >= MAX_PLAYERS) fail("ROOM_FULL"); const n = this.file.players.filter((p) => p.bot).length + 1; this.file.players.push({ playerId: "bot" + randomBytes(3).toString("hex"), token: randomBytes(18).toString("base64url"), name: "人机" + n, bot: true }); }
    else if (a?.type === "KICK") { if (a.playerId === me.playerId) fail("BAD"); this.file.players = this.file.players.filter((p) => p.playerId !== a.playerId); }
    else if (a?.type === "START") {
      const n = this.file.players.length; if (n < 4 || n > 8) fail("TA_COUNT");
      const ids = this.file.players.map((p) => p.playerId);
      for (let i = n - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      this.file.lineup = ids; this.file.seed = randomInt(2 ** 31); this.file.commands = []; delete this.file.snapshot; this.file.round += 1; this.file.stage = "game";
      this.state = createGame(n, this.file.seed, this.file.mode);
    } else fail("BAD");
  }
  apply(token: string, cmd: TAClientCommand) {
    const me = this.me(token).playerId; const s = this.state ?? fail("NOT_STARTED");
    const seat = this.file.lineup.indexOf(me); if (seat < 0) fail("NOT_SEATED");
    if (cmd?.t === "force" && me !== this.file.hostId) fail("HOST_ONLY");
    if (cmd?.t === "auto") { if (me !== this.file.hostId) fail("HOST_ONLY"); const target = this.file.lineup.indexOf(String(cmd.player)); const st = s as State; if (target < 0 || (this.connections.get(String(cmd.player)) ?? 0) > 0 || !waitingFor(st).includes(target)) fail("BAD"); const before = st; const next = autoMove(before, target); this.state = next; this.file.commands = this.file.commands; this.autos(before, next); return; }
    const c = { ...cmd, seat } as Command; this.state = reduce(s as State, c); if (this.file.snapshot) this.file.snapshot = this.state; else this.file.commands.push(c);
  }
  private discussionTried: State | undefined;
  botStep() {
    const state = this.state;
    if (!state || state.phase === "over") return false;
    const isBot = (seat: number) => this.file.players.find(p => p.playerId === this.file.lineup[seat])?.bot;
    let seat = waitingFor(state).find(isBot);
    if (seat === undefined && state.phase === "accuse" && !state.stack.length && this.discussionTried !== state) {
      this.discussionTried = state;
      seat = state.players.find(player => !player.killed && !player.exiled && isBot(player.seat))?.seat;
    }
    if (seat === undefined) return false;
    const next = botMove(state, seat);
    if (next === state) return false;
    this.state = next;
    this.autos(state, next);
    return true;
  }
  botDelay() { return this.state?.phase === "review" ? 2000 : this.state?.phase === "accuse" ? 5000 : this.state?.phase === "resolve" ? 150 : 600; }
  /** 代操作不进命令重放：存档改存整局快照 */
  private autos(_a: State, b: State) { this.file.snapshot = b; }
  snapshot(me: string | null): TARoomSnapshot {
    const seat = me ? this.file.lineup.indexOf(me) : -1;
    return { code: this.code, stage: this.file.stage, hostId: this.file.hostId, mySeat: me, mode: this.file.mode, round: this.file.round, version: this.file.version ?? 0,
      players: this.file.players.map((p) => ({ playerId: p.playerId, name: p.name, connected: !!p.bot || (this.connections.get(p.playerId) ?? 0) > 0, host: p.playerId === this.file.hostId })),
      seats: this.file.lineup, view: this.state && seat >= 0 ? viewFor(this.state, seat) : null };
  }
}

export class TARoomStore {
  rooms = new Map<string, TARoom>();
  touched = new Map<string, number>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new TARoom(JSON.parse(readFileSync(join(dir, f), "utf8")));
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的威胁房间", f, e instanceof Error ? e.message : e);
      }
    }
  }
  create(): TARoom {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new TARoom({
      game: "menace", code, createdAt: new Date().toISOString(), stage: "lobby", hostId: null,
      players: [], mode: "basic", round: 0, seed: 0, lineup: [], commands: [],
    });
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }
  save(room: TARoom) {
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

export function taErrorText(e: unknown): { error: string; code: string } {
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = TEXT;
  // 引擎的报错本身就是中文原因，直接给用户
  return { code, error: map[code] ?? code };
}

const sockRoom = (code: string) => "ta:" + code;

export function attachMenace(io: Server, dataDir: string, opts: { maxRooms: number; idleMs: number }) {
  const store = new TARoomStore(dataDir);
  const busy = (code: string) => (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置威胁房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const pending = new Set<string>();
  const sceneVersions = new Map<string, number>();
  const gates = new WeakMap<TARoom, number>();
  const viewers = (room: TARoom) => [...(io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? [])]
    .filter(id => {
      const seat = io.sockets.sockets.get(id)?.data.taSeat;
      return room.file.lineup.includes(seat) && room.file.players.some(player => player.playerId === seat && !player.bot);
    });
  const gateTransition = (room: TARoom, previous: State | null) => {
    const next = room.state;
    if (previous && next &&
        (previous.phase !== next.phase || previous.round !== next.round)) {
      gates.set(room, (room.file.version ?? 0) + 1);
    }
  };
  const snapshot = (room: TARoom, seat: string | null): TARoomSnapshot => {
    const version = gates.get(room);
    if (version === undefined) return room.snapshot(seat);
    const clients = viewers(room);
    const ready = clients.filter(id => (sceneVersions.get(id) ?? -1) >= version).length;
    return { ...room.snapshot(seat), sceneGate: { version, ready, total: clients.length } };
  };
  const drive = (room: TARoom) => {
    if (gates.has(room) || pending.has(room.code)) return;
    pending.add(room.code);
    const delay = room.botDelay();
    const deadline = Date.now() + 6000;
    const advance = () => {
      if (gates.has(room)) {
        pending.delete(room.code);
        return;
      }
      if (room.botDelay() !== delay) {
        pending.delete(room.code);
        drive(room);
        return;
      }
      const version = room.file.version ?? 0;
      const waiting = [...(io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? [])].some(id => {
        const client = io.sockets.sockets.get(id);
        return client?.data.taSeat && (sceneVersions.get(id) ?? -1) < version;
      });
      if (waiting && Date.now() < deadline) {
        setTimeout(advance, 100);
        return;
      }
      pending.delete(room.code);
      try {
        const previous = room.state;
        if (room.botStep()) {
          gateTransition(room, previous);
          broadcast(room);
          drive(room);
        }
      } catch (e) {
        console.warn("人机出错", room.code, e instanceof Error ? e.message : e);
      }
    };
    setTimeout(advance, delay);
  };
  const broadcast = (room: TARoom) => {
    room.file.version = (room.file.version ?? 0) + 1;
    store.save(room);
    const gate = snapshot(room, null).sceneGate;
    if (gate && gate.ready === gate.total) {
      gates.delete(room);
      drive(room);
    }
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(TA_EVENTS.update, snapshot(room, sock.data.taSeat ?? null));
    }
  };
  const find = (code: unknown) => store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: TARoom | undefined = socket.data.taRoom;
      const seat: string | null = socket.data.taSeat ?? null;
      if (room && seat) {
        socket.leave(sockRoom(room.code));
        room.connections.set(seat, Math.max(0, (room.connections.get(seat) ?? 1) - 1));
        broadcast(room);
      }
    };
    const attach = (room: TARoom, seat: string | null) => {
      if (socket.data.taRoom && socket.data.taRoom !== room) {
        leave();
        sceneVersions.delete(socket.id);
        socket.leave(sockRoom(socket.data.taRoom.code));
        socket.data.taSeat = null;
      }
      if (seat && socket.data.taSeat !== seat) room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.taRoom = room;
      socket.data.taSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...taErrorText(e) });
        }
      };
    socket.on(TA_EVENTS.create, guarded(() => {
      if (store.rooms.size >= opts.maxRooms) {
        store.prune(opts.idleMs, busy);
        if (store.rooms.size >= opts.maxRooms) fail("TOO_MANY_ROOMS");
      }
      return { code: store.create().code };
    }));
    socket.on(TA_EVENTS.join, guarded((req: { code: string; token?: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const me = room.idByToken(req.token);
      attach(room, me);
      broadcast(room);
      drive(room);
      return { snapshot: snapshot(room, me) };
    }));
    socket.on(TA_EVENTS.claim, guarded((req: { code: string; name: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const token = room.claim(String(req.name ?? ""));
      attach(room, room.idByToken(token));
      broadcast(room);
      return { token };
    }));
    socket.on(TA_EVENTS.lobby, guarded((req: { code: string; token: string; action: TALobbyAction }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      if (gates.has(room)) fail("WAITING");
      room.lobby(req.token, req.action);
      drive(room);
      broadcast(room);
      return {};
    }));
    socket.on(TA_EVENTS.command, guarded((req: { code: string; token: string; command: TAClientCommand }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      if (gates.has(room)) fail("WAITING");
      const previous = room.state;
      room.apply(req.token, req.command);
      gateTransition(room, previous);
      drive(room);
      broadcast(room);
      return {};
    }));
    socket.on(TA_EVENTS.sceneDone, (req: { code?: string; version?: number }) => {
      const room: TARoom | undefined = socket.data.taRoom;
      if (!room || !room.file.lineup.includes(socket.data.taSeat) || req?.code !== room.code) return;
      const version = req.version;
      const gate = gates.get(room);
      if (version === undefined || (version !== room.file.version && version !== gate) ||
          (sceneVersions.get(socket.id) ?? -1) >= version) return;
      sceneVersions.set(socket.id, version);
      if (gate !== undefined && version >= gate) broadcast(room);
    });
    socket.on("disconnect", () => {
      sceneVersions.delete(socket.id);
      leave();
    });
  });
  return store;
}
