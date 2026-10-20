import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  createGame,
  reduce,
  RuleError,
  viewFor,
} from "../../../packages/game-engine/src/index.ts";
import { maps, chars } from "../../../packages/game-engine/src/data.ts";
import type {
  Command,
  CreateOptions,
  GameState,
} from "../../../packages/shared/src/types.ts";
import type {
  CreateRoomRequest,
  LobbyAction,
  LobbyInfo,
  RoomSnapshot,
  SeatInfo,
  Side,
} from "../../../packages/shared/src/protocol.ts";

/** 随机数来源：正式服务器用 crypto；测试可注入确定性的函数。返回 [0, n) 的整数。 */
export type Rand = (n: number) => number;
const cryptoRand: Rand = (n) => randomInt(n);

interface Player {
  playerId: string;
  token: string;
  name: string | null;
  side: Side | null;
  volunteer: boolean;
}
interface Slot {
  slotId: string;
  playerId: string;
  side: Side;
  options: string[];
  pick: string | null;
}
interface Seat {
  seatId: string;
  actors: string[];
  side: Side;
  token: string | null;
  name: string | null;
}

/**
 * 房间存档。lobby 模式：选阵营 → 选角色 → 对局；preset 模式（测试）：座位预先固定。
 * 对局只保存创建参数和命令列表，状态通过确定性重放恢复。
 */
interface RoomFile {
  code: string;
  createdAt: string;
  mode: "lobby" | "preset";
  stage: "lobby" | "draft" | "game";
  playerCount: 3 | 4 | 5;
  hostId: string | null;
  players: Player[];
  draft: { mapId: string; seed: number; killerPlayer: string; slots: Slot[] } | null;
  options: CreateOptions | null;
  seats: Seat[];
  commands: Command[];
}

const SURVIVORS = chars.characters.filter((c) => c.side === "survivor").map((c) => c.id);
const KILLERS = chars.characters.filter((c) => c.side === "killer").map((c) => c.id);
const MAPS = maps.maps.filter((m) => m.status === "CONFIRMED").map((m) => m.id);

function shuffle<T>(a: T[], rand: Rand) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const pickOne = <T>(a: T[], rand: Rand) => a[rand(a.length)];

export class Room {
  state: GameState | null = null;
  connections = new Map<string, number>(); // seatId/playerId -> 在线连接数
  constructor(
    public file: RoomFile,
    private rand: Rand = cryptoRand,
  ) {
    // 兼容旧存档（Phase 3 时只有 preset 式座位）
    file.mode ??= "preset";
    file.stage ??= "game";
    file.players ??= [];
    file.draft ??= null;
    file.hostId ??= null;
    if (file.options) {
      let s = createGame(file.options);
      for (const c of file.commands) s = reduce(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private player(token: string | undefined | null) {
    return token ? (this.file.players.find((p) => p.token === token) ?? null) : null;
  }
  seatByToken(token: string | undefined | null) {
    return token ? (this.file.seats.find((s) => s.token === token) ?? null) : null;
  }
  /** 这个凭证对应的身份：preset 房间是座位，lobby 房间是玩家（对局中座位 id = 玩家 id） */
  idByToken(token: string | undefined | null): string | null {
    return this.file.mode === "preset"
      ? (this.seatByToken(token)?.seatId ?? null)
      : (this.player(token)?.playerId ?? null);
  }
  seatInfo(): SeatInfo[] {
    return this.file.seats.map((s) => ({
      seatId: s.seatId,
      actors: s.actors,
      side: s.side,
      claimed: !!s.token,
      name: s.name,
      connected: (this.connections.get(s.seatId) ?? 0) > 0,
    }));
  }
  lobbyInfo(me: string | null): LobbyInfo {
    const f = this.file;
    return {
      stage: f.stage,
      mode: f.mode,
      playerCount: f.playerCount,
      players: f.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        side: p.side,
        volunteer: p.volunteer,
        connected: (this.connections.get(p.playerId) ?? 0) > 0,
        host: p.playerId === f.hostId,
      })),
      draft: f.draft && {
        mapId: f.draft.mapId,
        killerPlayer: f.draft.killerPlayer,
        slots: f.draft.slots.map((s) => ({
          slotId: s.slotId,
          playerId: s.playerId,
          side: s.side,
          // 选项只给名额的主人看；选定之后所有人都能看到选了谁
          options: s.playerId === me ? s.options : null,
          pick: s.pick,
        })),
      },
    };
  }
  snapshot(me: string | null): RoomSnapshot {
    return {
      code: this.code,
      lobby: this.lobbyInfo(me),
      seats: this.seatInfo(),
      mySeat: me,
      version: this.file.commands.length,
      view: this.state ? viewFor(this.state, me) : null,
    };
  }

  /** preset 房间：认领预设座位。lobby 房间：以昵称加入成为玩家。返回凭证。 */
  claim(seatId: string | undefined, name: string): string {
    const clean = name.trim().slice(0, 16) || null;
    const token = randomBytes(18).toString("base64url");
    if (this.file.mode === "preset") {
      const seat = this.file.seats.find((s) => s.seatId === seatId);
      if (!seat) throw new Error("NO_SEAT");
      if (seat.token) throw new Error("SEAT_TAKEN");
      seat.token = token;
      seat.name = clean;
      return token;
    }
    if (this.file.stage !== "lobby") throw new Error("ALREADY_STARTED");
    if (this.file.players.length >= this.file.playerCount) throw new Error("ROOM_FULL");
    const used = new Set(this.file.players.map((p) => p.playerId));
    let n = 1;
    while (used.has("p" + n)) n++;
    const p: Player = { playerId: "p" + n, token, name: clean, side: null, volunteer: false };
    this.file.players.push(p);
    this.file.hostId ??= p.playerId;
    return token;
  }

  /** 房间内（对局开始前）的操作 */
  lobby(token: string, action: LobbyAction) {
    const f = this.file;
    if (f.mode !== "lobby") throw new Error("NOT_LOBBY_ROOM");
    const me = this.player(token);
    if (!me) throw new Error("NOT_SEATED");
    const host = me.playerId === f.hostId;
    switch (action.type) {
      case "SET_SIDE":
        if (f.stage !== "lobby") throw new Error("ALREADY_STARTED");
        if (action.side !== "survivor" && action.side !== "killer") throw new Error("BAD_ACTION");
        me.side = action.side;
        return;
      case "SET_VOLUNTEER":
        if (f.stage !== "lobby") throw new Error("ALREADY_STARTED");
        me.volunteer = !!action.volunteer;
        return;
      case "SET_PLAYER_COUNT": {
        if (!host) throw new Error("HOST_ONLY");
        if (f.stage !== "lobby") throw new Error("ALREADY_STARTED");
        const n = action.playerCount;
        if (![3, 4, 5].includes(n)) throw new Error("BAD_ACTION");
        if (n < f.players.length) throw new Error("COUNT_BELOW_PLAYERS");
        f.playerCount = n;
        return;
      }
      case "START":
        if (!host) throw new Error("HOST_ONLY");
        if (f.stage !== "lobby") throw new Error("ALREADY_STARTED");
        if (f.players.length !== f.playerCount) throw new Error("NOT_FULL");
        if (f.players.some((p) => !p.side)) throw new Error("SIDES_PENDING");
        this.startDraft();
        return;
      case "PICK":
        if (f.stage !== "draft" || !f.draft) throw new Error("NOT_DRAFTING");
        this.pick(me.playerId, action.slotId, action.characterId);
        return;
      default:
        throw new Error("BAD_ACTION");
    }
  }

  /** 分配阵营、谁控两名逃生者、随机地图，并发角色选项（用户规则 2026-10-20） */
  private startDraft() {
    const f = this.file,
      rand = this.rand;
    // 杀手：多人选杀手 → 其中随机一个；没人选 → 所有人里随机一个
    const wantKiller = f.players.filter((p) => p.side === "killer");
    const killer = pickOne(wantKiller.length ? wantKiller : f.players, rand);
    const survivorsP = f.players.filter((p) => p !== killer);
    // 一人控两名逃生者：5 人无；4 人一位（报名者里随机，没人报名则所有逃生者玩家里随机）；3 人两位都控两名
    const doubles = new Set<string>();
    if (f.playerCount === 3) survivorsP.forEach((p) => doubles.add(p.playerId));
    if (f.playerCount === 4) {
      const vol = survivorsP.filter((p) => p.volunteer);
      doubles.add(pickOne(vol.length ? vol : survivorsP, rand).playerId);
    }
    // 名额：逃生者按玩家加入顺序，控两名的人连续两个名额；杀手一个名额
    const slots: Slot[] = [];
    for (const p of survivorsP)
      for (let i = 0; i < (doubles.has(p.playerId) ? 2 : 1); i++)
        slots.push({ slotId: `s${slots.length + 1}`, playerId: p.playerId, side: "survivor", options: [], pick: null });
    if (slots.length !== 4) throw new Error("BAD_ROOM");
    // 逃生者二选一：尽量不重复地发（7 名逃生者、8 个选项时只有一个重叠，选走后会被替换）
    let pool = shuffle(SURVIVORS, rand);
    for (const s of slots)
      while (s.options.length < 2) {
        if (!pool.length) pool = shuffle(SURVIVORS.filter((x) => !s.options.includes(x)), rand);
        const c = pool.shift()!;
        if (!s.options.includes(c)) s.options.push(c);
      }
    // 杀手三选一
    slots.push({
      slotId: "k",
      playerId: killer.playerId,
      side: "killer",
      options: shuffle(KILLERS, rand).slice(0, 3),
      pick: null,
    });
    for (const p of f.players) p.side = p === killer ? "killer" : "survivor";
    f.draft = {
      mapId: pickOne(MAPS, rand),
      seed: rand(2 ** 31 - 2) + 1,
      killerPlayer: killer.playerId,
      slots,
    };
    f.stage = "draft";
  }

  private pick(playerId: string, slotId: string, characterId: string) {
    const d = this.file.draft!;
    const slot = d.slots.find((s) => s.slotId === slotId);
    if (!slot || slot.playerId !== playerId) throw new Error("NOT_YOUR_SLOT");
    if (slot.pick) throw new Error("ALREADY_PICKED");
    if (!slot.options.includes(characterId)) throw new Error("NOT_AN_OPTION");
    slot.pick = characterId;
    // 被选走的逃生者从别人的选项里换掉，保证每个人始终有两个可选
    if (slot.side === "survivor") {
      const taken = new Set(d.slots.filter((s) => s.pick).map((s) => s.pick!));
      for (const o of d.slots)
        if (o.side === "survivor" && !o.pick && o.options.includes(characterId)) {
          const spare = SURVIVORS.filter((x) => !taken.has(x) && !o.options.includes(x));
          o.options = o.options.map((x) => (x === characterId ? pickOne(spare, this.rand) : x));
        }
    }
    if (d.slots.every((s) => s.pick)) this.startGame();
  }

  private startGame() {
    const f = this.file,
      d = f.draft!;
    const surv = d.slots.filter((s) => s.side === "survivor");
    const k = d.slots.find((s) => s.side === "killer")!;
    const owners: Record<string, string> = {};
    for (const s of d.slots) owners[s.pick!] = s.playerId;
    const options: CreateOptions = {
      seed: d.seed,
      mapId: d.mapId,
      survivors: surv.map((s) => s.pick!),
      killer: k.pick!,
      owners,
    };
    this.state = createGame(options); // 不合法的组合会在这里抛出 RuleError
    f.options = options;
    f.seats = f.players.map((p) => ({
      seatId: p.playerId,
      actors: d.slots.filter((s) => s.playerId === p.playerId).map((s) => s.pick!),
      side: p.side!,
      token: p.token,
      name: p.name,
    }));
    f.stage = "game";
  }

  /** 校验身份、版本号和规则后执行命令；任何一步失败都不改变状态 */
  apply(token: string, version: number, command: Command) {
    if (!this.state) throw new Error("NOT_STARTED");
    const seat = this.seatByToken(token);
    if (!seat) throw new Error("NOT_SEATED");
    if (version !== this.file.commands.length) throw new Error("STALE");
    const actorId = command.actorId;
    if (typeof actorId !== "string" || this.state.actors[actorId]?.ownerId !== seat.seatId)
      throw new Error("NOT_YOUR_ACTOR");
    const next = reduce(this.state, command);
    this.state = next;
    this.file.commands.push(command);
  }
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomStore {
  rooms = new Map<string, Room>();
  /** 每个房间最后一次有改动的时间（毫秒） */
  touched = new Map<string, number>();
  constructor(
    private dir: string,
    private rand: Rand = cryptoRand,
  ) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new Room(JSON.parse(readFileSync(join(dir, f), "utf8")), rand);
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的房间存档", f, e instanceof Error ? e.message : e);
      }
    }
  }
  newCode() {
    for (;;) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
      if (!this.rooms.has(code)) return code;
    }
  }
  create(req: CreateRoomRequest, allowFixedSeed: boolean): Room {
    const playerCount = ([3, 4, 5] as const).includes(req?.playerCount) ? req.playerCount : 5;
    const base = {
      code: this.newCode(),
      createdAt: new Date().toISOString(),
      playerCount,
      hostId: null,
      players: [],
      draft: null,
      commands: [],
    };
    let file: RoomFile;
    if (req?.preset) {
      if (!allowFixedSeed) throw new Error("PRESET_TEST_ONLY");
      file = { ...base, mode: "preset", stage: "game", ...this.presetSeats(req.preset, playerCount) };
    } else file = { ...base, mode: "lobby", stage: "lobby", options: null, seats: [] };
    const room = new Room(file, this.rand);
    this.rooms.set(room.code, room);
    this.save(room);
    return room;
  }
  /** 测试房间：与 Phase 3 相同的固定座位（用于按回放逐步对照） */
  private presetSeats(p: NonNullable<CreateRoomRequest["preset"]>, playerCount: 3 | 4 | 5) {
    const owners: Record<string, string> = {};
    if (playerCount !== 5) {
      const n = playerCount - 1;
      p.survivors.forEach((id, i) => (owners[id] = "survivor_player_" + (i % n)));
      owners[p.killer] = "killer_player";
    }
    const options: CreateOptions = {
      seed: p.seed,
      mapId: p.mapId,
      survivors: p.survivors,
      killer: p.killer,
      ...(playerCount !== 5 ? { owners } : {}),
    };
    const probe = createGame(options);
    const seats = new Map<string, Seat>();
    for (const a of Object.values(probe.actors)) {
      const seat = seats.get(a.ownerId) ?? { seatId: a.ownerId, actors: [], side: a.side, token: null, name: null };
      seat.actors.push(a.id);
      seats.set(a.ownerId, seat);
    }
    return {
      options,
      seats: [...seats.values()].sort((a, b) => (a.side === b.side ? 0 : a.side === "killer" ? 1 : -1)),
    };
  }
  /** 删除超过 maxIdleMs 没有改动、且没人在线的房间；返回删除数量 */
  prune(maxIdleMs: number, busy: (code: string) => boolean = () => false, now = Date.now()) {
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
  save(room: Room) {
    this.touched.set(room.code, Date.now());
    const target = join(this.dir, room.code + ".json");
    writeFileSync(target + ".tmp", JSON.stringify(room.file));
    renameSync(target + ".tmp", target);
  }
}

export function errorText(e: unknown): { error: string; code: string } {
  const code = e instanceof RuleError ? e.code : e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NO_SEAT: "座位不存在。",
    SEAT_TAKEN: "这个座位已经有人了。",
    NOT_SEATED: "请先加入房间。",
    STALE: "棋盘已经更新，请看清最新状态后再操作。",
    NOT_YOUR_ACTOR: "现在不是你的角色在行动。",
    CHECK_REQUIRED: "该功能尚未实现。",
    ROOM_FULL: "房间人数已满。房主可以调大人数。",
    ALREADY_STARTED: "游戏已经开始了。",
    HOST_ONLY: "只有房主可以这样做。",
    COUNT_BELOW_PLAYERS: "人数不能少于已经在房间里的人数。",
    NOT_FULL: "人还没到齐。",
    SIDES_PENDING: "还有人没选阵营。",
    NOT_DRAFTING: "现在不是选角色的时候。",
    NOT_YOUR_SLOT: "这不是你的角色名额。",
    ALREADY_PICKED: "这个名额已经选好了。",
    NOT_AN_OPTION: "只能从发给你的角色里选。",
    NOT_STARTED: "游戏还没开始。",
    PRESET_TEST_ONLY: "测试房间只能在测试服务器上创建。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    NOT_LOBBY_ROOM: "这个房间没有选阵营环节。",
    BAD_ACTION: "操作无效。",
  };
  return { code, error: map[code] ?? "当前操作不合法，请检查目标、费用或时机。" };
}
