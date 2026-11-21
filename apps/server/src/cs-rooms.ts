import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGame, gameView, reduceGame, type GameCommand, type GameState } from "../../../packages/crime-scene/src/game.ts";

interface CrimeScenePlayer { id: string; token: string; name: string }
export interface CrimeSceneRoomFile {
  code: string;
  hostId: string | null;
  players: CrimeScenePlayer[];
  stage: "lobby" | "game";
  cardsPerKind: 3 | 4 | 5;
  eventsEnabled: boolean;
  forensicSeat: number;
  state: GameState | null;
  pausedAt: number | null;
  version: number;
  mode?: "local" | "online";
  chatLog?: { seat: number; text: string; at: number }[];
}

function shiftDeadlines(state: GameState, delta: number): GameState {
  return {
    ...state,
    night: state.night ? { ...state.night, startedAt: state.night.startedAt + delta, choiceDeadline: state.night.choiceDeadline + delta, revealAt: state.night.revealAt + delta } : null,
    hunt: state.hunt ? { ...state.hunt, deadline: state.hunt.deadline + delta } : null,
    board: state.board ? { ...state.board, speechStartedAt: state.board.speechStartedAt === null ? null : state.board.speechStartedAt + delta } : null,
  };
}

export class CrimeSceneRoom {
  connections = new Map<string, number>();
  constructor(public file: CrimeSceneRoomFile) {}

  private player(token: string): CrimeScenePlayer {
    const player = token && this.file.players.find((p) => p.token === token);
    if (!player) throw new Error("座位凭证无效");
    return player;
  }

  claim(name: string): string {
    if (this.file.stage !== "lobby" || this.file.players.length >= 12) throw new Error("房间已满或对局已开始");
    const clean = name.trim().slice(0, 12);
    if (!clean) throw new Error("请填写昵称");
    const player = { id: randomBytes(8).toString("hex"), token: randomBytes(24).toString("base64url"), name: clean };
    this.file.players.push(player);
    this.file.hostId ??= player.id;
    this.file.version++;
    return player.token;
  }

  configure(token: string, options: { cardsPerKind?: 3 | 4 | 5; eventsEnabled?: boolean; forensicSeat?: number; mode?: "local" | "online" }) {
    if (this.player(token).id !== this.file.hostId || this.file.stage !== "lobby") throw new Error("只有房主可以设置房间");
    if (options.cardsPerKind !== undefined) {
      if (![3, 4, 5].includes(options.cardsPerKind)) throw new Error("发牌数量无效");
      this.file.cardsPerKind = options.cardsPerKind;
    }
    if (options.eventsEnabled !== undefined) {
      if (typeof options.eventsEnabled !== "boolean") throw new Error("特殊事件设置无效");
      this.file.eventsEnabled = options.eventsEnabled;
    }
    if (options.mode !== undefined) {
      if (options.mode !== "local" && options.mode !== "online") throw new Error("房间模式无效");
      this.file.mode = options.mode;
    }
    if (options.forensicSeat !== undefined) {
      if (!Number.isInteger(options.forensicSeat) || options.forensicSeat < 0 || options.forensicSeat >= this.file.players.length) throw new Error("鉴证专家座位无效");
      this.file.forensicSeat = options.forensicSeat;
    }
    this.file.version++;
  }

  start(token: string, now: number, random: () => number = Math.random) {
    if (this.player(token).id !== this.file.hostId || this.file.stage !== "lobby") throw new Error("只有房主可以开局");
    const count = this.file.players.length;
    if (count < 4 || count > 12) throw new Error("需要 4–12 名玩家");
    this.file.state = createGame(count, this.file.forensicSeat, this.file.cardsPerKind, this.file.eventsEnabled, now, random);
    this.file.stage = "game";
    this.file.version++;
  }

  /** 结案后房主可让全员回到房间，保留座位与设置，直接开下一局。 */
  rematch(token: string) {
    if (this.player(token).id !== this.file.hostId || this.file.stage !== "game" || this.file.state?.phase !== "result") throw new Error("只有房主能在结案后再来一局");
    this.file.stage = "lobby";
    this.file.state = null;
    this.file.pausedAt = null;
    this.file.chatLog = [];
    this.file.version++;
  }

  command(token: string, command: GameCommand, now: number, random: () => number = Math.random) {
    const player = this.player(token);
    const state = this.file.state;
    if (!state || this.file.pausedAt !== null) throw new Error("对局未开始或已暂停");
    if (command.type === "tick") throw new Error("客户端不能推进服务器计时");
    const seat = this.file.players.findIndex((p) => p.id === player.id);
    const next = reduceGame(state, { ...command, seat }, now, random);
    if (next === state) return command.type === "solve" ? { privateMessage: "不能指认真实证据，请重新选择" } : {};
    this.file.state = next;
    this.file.version++;
    return {};
  }

  tick(now: number): boolean {
    if (this.file.pausedAt !== null || !this.file.state) return false;
    const next = reduceGame(this.file.state, { type: "tick" }, now);
    if (next === this.file.state) return false;
    this.file.state = next;
    this.file.version++;
    return true;
  }

  chat(token: string, message: string, now: number) {
    const player = this.player(token);
    if (this.file.mode !== "online" || !/^round[123]_(search|brief)$/.test(this.file.state?.phase ?? "") || this.file.pausedAt !== null) throw new Error("只有线上调查阶段可以发言");
    if (this.file.players.findIndex((p) => p.id === player.id) === this.file.forensicSeat) throw new Error("鉴证专家不能发言，只能用标记提示");
    const text = String(message ?? "").trim().slice(0, 280);
    if (!text) throw new Error("不能发送空消息");
    const seat = this.file.players.findIndex((p) => p.id === player.id);
    this.file.chatLog = [...(this.file.chatLog ?? []), { seat, text, at: now }].slice(-100);
    this.file.version++;
  }

  setConnected(token: string, connected: boolean, now: number) {
    const player = this.player(token);
    const old = this.connections.get(player.id) ?? 0;
    this.connections.set(player.id, Math.max(0, old + (connected ? 1 : -1)));
    const seat = this.file.players.findIndex((p) => p.id === player.id);
    if (seat !== this.file.forensicSeat || this.file.stage !== "game" || this.file.state?.phase === "result") return;
    if (!connected && this.connections.get(player.id) === 0 && this.file.pausedAt === null) this.file.pausedAt = now;
    if (connected && this.file.pausedAt !== null) {
      this.file.state = shiftDeadlines(this.file.state!, now - this.file.pausedAt);
      this.file.pausedAt = null;
    }
    this.file.version++;
  }

  snapshot(token: string) {
    const player = this.player(token);
    const seat = this.file.players.findIndex((p) => p.id === player.id);
    return {
      code: this.file.code, stage: this.file.stage, mySeat: seat, hostSeat: this.file.players.findIndex((p) => p.id === this.file.hostId),
      players: this.file.players.map((p, i) => ({ seat: i, name: p.name, connected: (this.connections.get(p.id) ?? 0) > 0 })),
      cardsPerKind: this.file.cardsPerKind, eventsEnabled: this.file.eventsEnabled, mode: this.file.mode ?? "local", chat: [...(this.file.chatLog ?? [])], paused: this.file.pausedAt !== null, version: this.file.version,
      view: this.file.state ? gameView(this.file.state, seat) : null,
    };
  }
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class CrimeSceneRoomStore {
  rooms = new Map<string, CrimeSceneRoom>();
  touched = new Map<string, number>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir).filter((item) => /^C[A-Z2-9]{4}\.json$/.test(item))) {
      try {
        const room = new CrimeSceneRoom(JSON.parse(readFileSync(join(dir, name), "utf8")) as CrimeSceneRoomFile);
        if (room.file.stage === "game" && room.file.state?.phase !== "result" && room.file.pausedAt === null) {
          room.file.pausedAt = Date.now();
        }
        this.rooms.set(room.file.code, room);
        this.touched.set(room.file.code, statSync(join(dir, name)).mtimeMs);
      } catch (error) {
        console.warn("跳过无法恢复的犯罪现场房间", name, error instanceof Error ? error.message : error);
      }
    }
  }

  create(): CrimeSceneRoom {
    let code: string;
    do code = "C" + Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new CrimeSceneRoom({ code, hostId: null, players: [], stage: "lobby", cardsPerKind: 4, eventsEnabled: false, forensicSeat: 0, state: null, pausedAt: null, version: 0, mode: "local", chatLog: [] });
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }

  save(room: CrimeSceneRoom) {
    const path = join(this.dir, room.file.code + ".json");
    writeFileSync(path + ".tmp", JSON.stringify(room.file));
    renameSync(path + ".tmp", path);
    this.touched.set(room.file.code, Date.now());
  }

  prune(maxIdleMs: number, busy: (code: string) => boolean, now = Date.now()) {
    for (const [code, touched] of this.touched) {
      if (busy(code) || now - touched < maxIdleMs) continue;
      this.rooms.delete(code);
      this.touched.delete(code);
      rmSync(join(this.dir, code + ".json"), { force: true });
    }
  }
}
