import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  BOSSES,
  BOSS_ORDER,
  CLASSES,
  RACES,
  botFor,
  canFight,
  createGame,
  newCampaign,
  pickLoot,
  recordResult,
  reduce,
  setRemoved,
  setupFor,
  swapLoot,
  viewFor,
  type Campaign,
  type Command,
  type Difficulty,
  type GameState,
  type SetupOptions,
} from "../../../packages/boss-fighters/src/index.ts";
import {
  BF_EVENTS,
  type BFClientCommand,
  type BFLobbyAction,
  type BFMode,
  type BFRoomSnapshot,
} from "../../../packages/shared/src/bf-protocol.ts";
import type { Ack } from "../../../packages/shared/src/protocol.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_SEATS = 4;
const MAX_PEOPLE = 8; // 含观战
const DIFFS: Difficulty[] = ["beginner", "advanced", "pro", "insane"];
const BOT_NAMES = ["机器人·阿铁", "机器人·小橡", "机器人·灰灰", "机器人·琥珀"];

interface BFPlayerFile { playerId: string; token: string; name: string }
interface BFSeatFile { id: string; name: string; race: string | null; cls: string | null; bot: boolean }

/** 存档：开局参数 + 命令列表，重启后确定性重放 */
export interface BFRoomFile {
  game: "boss-fighters";
  code: string;
  createdAt: string;
  stage: "lobby" | "game";
  hostId: string | null;
  players: BFPlayerFile[];
  seats: BFSeatFile[];
  mode: BFMode;
  bossId: string;
  difficulty: Difficulty;
  campaign: Campaign | null;
  round: number;
  setup: SetupOptions | null;
  recorded: boolean;
  commands: Command[];
}

const fail = (code: string): never => {
  throw new Error(code);
};

/** 自由对战：当作"刚好打到这一关"的冒险团（解锁到这一关为止，没有战利品） */
function freeSetup(f: BFRoomFile, seed: number): SetupOptions {
  const order = BOSSES[f.bossId].order;
  const c = newCampaign("自由对战", f.seats.map((s) => ({ name: s.name, race: s.race!, cls: s.cls! })));
  c.progress = order - 1;
  return setupFor(c, f.bossId, f.difficulty, seed);
}

export class BFRoom {
  state: GameState | null = null;
  connections = new Map<string, number>();
  botTimer: NodeJS.Timeout | null = null;
  constructor(public file: BFRoomFile) {
    if (file.setup) {
      let s = createGame(file.setup);
      for (const c of file.commands) s = reduce(s, c);
      this.state = s;
    }
  }
  get code() {
    return this.file.code;
  }
  private me(token: string) {
    return (token ? this.file.players.find((x) => x.token === token) : undefined) ?? fail("NOT_SEATED");
  }
  idByToken(token: string | null | undefined) {
    return token ? (this.file.players.find((p) => p.token === token)?.playerId ?? null) : null;
  }
  seatOf(id: string | null) {
    return id ? this.file.seats.findIndex((s) => s.id === id) : -1;
  }
  get over() {
    return !!this.state && (this.state.phase === "won" || this.state.phase === "lost");
  }
  claim(name: string) {
    const clean = name.trim().slice(0, 12);
    if (!clean) fail("NAME_REQUIRED");
    if (this.file.players.length >= MAX_PEOPLE) fail("ROOM_FULL");
    const playerId = "p" + (this.file.players.length + 1) + randomBytes(2).toString("hex");
    const token = randomBytes(18).toString("base64url");
    this.file.players.push({ playerId, token, name: clean });
    this.file.hostId ??= playerId;
    // 大厅且没开战役时自动入座；否则顶替一个机器人座位；都没有就观战
    if (this.file.stage === "lobby" && !this.file.campaign && this.file.seats.length < MAX_SEATS) {
      this.file.seats.push({ id: playerId, name: clean, race: null, cls: null, bot: false });
    } else if (this.file.stage === "lobby") {
      const bot = this.file.seats.find((s) => s.bot);
      if (bot) Object.assign(bot, { id: playerId, name: clean, bot: false });
    }
    return token;
  }
  lobby(token: string, action: BFLobbyAction) {
    const me = this.me(token);
    const f = this.file;
    const t = action?.type;
    const mySeat = this.seatOf(me.playerId);
    const inLobby = f.stage === "lobby";
    if (t === "PICK") {
      if (!inLobby) fail("ALREADY_STARTED");
      if (mySeat < 0) fail("NOT_SEATED");
      if (f.campaign) fail("BF_CAMPAIGN_LOCKED");
      const { race, cls } = action;
      if (race !== null && !RACES.includes(race)) fail("BAD_ACTION");
      if (cls !== null && !CLASSES.includes(cls)) fail("BAD_ACTION");
      if (race && f.seats.some((s, i) => i !== mySeat && s.race === race)) fail("BF_RACE_TAKEN");
      f.seats[mySeat].race = race;
      f.seats[mySeat].cls = cls;
      return;
    }
    if (t === "PICK_LOOT" || t === "SWAP_LOOT" || t === "SET_REMOVED") {
      if (!f.campaign) fail("BAD_ACTION");
      if (mySeat < 0) fail("NOT_SEATED");
      const c = f.campaign as Campaign;
      if (t === "PICK_LOOT") f.campaign = pickLoot(c, mySeat, String(action.card));
      else if (t === "SWAP_LOOT") f.campaign = swapLoot(c, mySeat, String(action.card));
      else f.campaign = setRemoved(c, mySeat, (action.removed ?? []).map(String));
      this.botLoot();
      return;
    }
    if (me.playerId !== f.hostId) fail("HOST_ONLY");
    if (t === "BACK_TO_LOBBY") {
      if (!this.over) fail("BF_NOT_OVER");
      f.stage = "lobby";
      return;
    }
    if (!inLobby) fail("ALREADY_STARTED");
    if (t === "ADD_BOT") {
      if (f.campaign) fail("BF_CAMPAIGN_LOCKED");
      if (f.seats.length >= MAX_SEATS) fail("ROOM_FULL");
      const used = new Set(f.seats.map((s) => s.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? "机器人";
      const race = RACES.find((r) => !f.seats.some((s) => s.race === r)) ?? null;
      const cls = CLASSES.find((c) => !f.seats.some((s) => s.cls === c)) ?? CLASSES[0];
      f.seats.push({ id: "bot:" + randomBytes(3).toString("hex"), name, race, cls, bot: true });
    } else if (t === "REMOVE") {
      if (f.campaign) fail("BF_CAMPAIGN_LOCKED");
      if (action.id === me.playerId) fail("BAD_ACTION");
      f.seats = f.seats.filter((s) => s.id !== action.id);
      if (!action.id.startsWith("bot:")) f.players = f.players.filter((p) => p.playerId !== action.id);
    } else if (t === "SET_MODE") {
      if (action.mode !== "single" && action.mode !== "campaign") fail("BAD_ACTION");
      f.mode = action.mode;
      if (f.mode === "campaign" && f.campaign) f.bossId = this.nextBoss();
    } else if (t === "SET_BOSS") {
      if (!BOSSES[action.bossId]) fail("BAD_ACTION");
      if (f.mode === "campaign" && f.campaign && !canFight(f.campaign, action.bossId)) fail("BF_LOCKED_BOSS");
      f.bossId = action.bossId;
    } else if (t === "SET_DIFFICULTY") {
      if (!DIFFS.includes(action.difficulty)) fail("BAD_ACTION");
      f.difficulty = action.difficulty;
    } else if (t === "RESET_CAMPAIGN") {
      f.campaign = null;
      f.bossId = BOSS_ORDER[0];
    } else if (t === "START") {
      this.start();
    } else fail("BAD_ACTION");
  }
  private nextBoss() {
    const c = this.file.campaign;
    if (!c) return BOSS_ORDER[0];
    return BOSS_ORDER.find((id) => BOSSES[id].order === c.progress + 1) ?? BOSS_ORDER[BOSS_ORDER.length - 1];
  }
  private botLoot() {
    const c = this.file.campaign;
    if (!c?.pendingLoot) return;
    this.file.seats.forEach((s, i) => {
      const p = this.file.campaign?.pendingLoot;
      if (!s.bot || !p || p.picked[i]) return;
      const free = p.offer.find((x) => !Object.values(p.picked).includes(x));
      if (free) this.file.campaign = pickLoot(this.file.campaign!, i, free);
    });
  }
  private start() {
    const f = this.file;
    if (f.seats.length < 2) fail("BF_COUNT");
    if (f.seats.some((s) => !s.race || !s.cls)) fail("BF_NOT_PICKED");
    if (new Set(f.seats.map((s) => s.race)).size !== f.seats.length) fail("BF_RACE_TAKEN");
    const seed = randomInt(2 ** 31);
    let setup: SetupOptions;
    if (f.mode === "campaign") {
      f.campaign ??= newCampaign("冒险团", f.seats.map((s) => ({ name: s.name, race: s.race!, cls: s.cls! })));
      if (f.campaign.pendingLoot) fail("BF_LOOT_PENDING");
      if (!canFight(f.campaign, f.bossId)) f.bossId = this.nextBoss();
      setup = setupFor(f.campaign, f.bossId, f.difficulty, seed);
      setup.heroes.forEach((h, i) => (h.name = f.seats[i].name));
    } else setup = freeSetup(f, seed);
    f.setup = setup;
    f.commands = [];
    f.recorded = false;
    f.round += 1;
    f.stage = "game";
    this.state = createGame(setup);
  }
  apply(token: string, cmd: BFClientCommand) {
    const me = this.me(token).playerId;
    if (!this.state) fail("NOT_STARTED");
    if (cmd?.version !== this.file.commands.length) fail("BF_STALE");
    const seat = this.seatOf(me);
    if (seat < 0) fail("NOT_SEATED");
    let c: Command;
    switch (cmd.type) {
      case "CHOOSE_STARTER": c = { type: "CHOOSE_STARTER", seat: Number(cmd.starter), by: seat }; break;
      case "PLAY_CARD": c = { type: "PLAY_CARD", seat, card: String(cmd.card), target: cmd.target === undefined ? undefined : Number(cmd.target) }; break;
      case "USE_ITEM": c = { type: "USE_ITEM", seat, item: cmd.item, target: cmd.target === undefined ? undefined : Number(cmd.target) }; break;
      case "END_ACTIONS": c = { type: "END_ACTIONS", seat }; break;
      case "DISCARD": c = { type: "DISCARD", seat, cards: (cmd.cards ?? []).map(String) }; break;
      case "DECIDE": c = { type: "DECIDE", seat, choice: cmd.choice === "burn" ? "burn" : "exile" }; break;
      case "GIVE_UP": c = { type: "GIVE_UP", seat }; break;
      default: return fail("BAD_ACTION");
    }
    this.commit(c);
  }
  commit(c: Command) {
    this.state = reduce(this.state!, c);
    this.file.commands.push(c);
    if (this.over && this.file.mode === "campaign" && this.file.campaign && !this.file.recorded) {
      this.file.campaign = recordResult(this.file.campaign, this.state);
      this.file.recorded = true;
      this.botLoot();
      this.file.bossId = this.nextBoss();
    }
  }
  /** 轮到机器人座位时返回它要执行的命令 */
  botMove(): Command | null {
    const s = this.state;
    if (!s || this.over || this.file.stage !== "game") return null;
    for (let i = 0; i < this.file.seats.length; i++) {
      if (!this.file.seats[i].bot) continue;
      const c = botFor(s, i);
      if (c) return c;
    }
    return null;
  }
  snapshot(me: string | null): BFRoomSnapshot {
    const f = this.file;
    const seat = this.seatOf(me);
    return {
      code: this.code,
      stage: f.stage,
      seats: f.seats.map((s) => ({
        id: s.id,
        name: s.name,
        race: s.race,
        cls: s.cls,
        bot: s.bot,
        connected: s.bot || (this.connections.get(s.id) ?? 0) > 0,
        host: s.id === f.hostId,
      })),
      me,
      mySeat: this.state ? seat : -1,
      mode: f.mode,
      bossId: f.bossId,
      difficulty: f.difficulty,
      campaign: f.campaign,
      version: f.commands.length,
      round: f.round,
      view: this.state ? viewFor(this.state, seat >= 0 ? seat : null) : null,
    };
  }
}

export class BFRoomStore {
  rooms = new Map<string, BFRoom>();
  touched = new Map<string, number>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const room = new BFRoom(JSON.parse(readFileSync(join(dir, f), "utf8")));
        this.rooms.set(room.code, room);
        this.touched.set(room.code, statSync(join(dir, f)).mtimeMs);
      } catch (e) {
        console.warn("跳过无法恢复的魔王试炼房间", f, e instanceof Error ? e.message : e);
      }
    }
  }
  create(): BFRoom {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while (this.rooms.has(code));
    const room = new BFRoom({
      game: "boss-fighters", code, createdAt: new Date().toISOString(), stage: "lobby", hostId: null,
      players: [], seats: [], mode: "campaign", bossId: BOSS_ORDER[0], difficulty: "advanced",
      campaign: null, round: 0, setup: null, recorded: false, commands: [],
    });
    this.rooms.set(code, room);
    this.save(room);
    return room;
  }
  save(room: BFRoom) {
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
      if (room.botTimer) clearTimeout(room.botTimer);
      this.rooms.delete(code);
      this.touched.delete(code);
      rmSync(join(this.dir, code + ".json"), { force: true });
      n++;
    }
    return n;
  }
}

export function bfErrorText(e: unknown): { error: string; code: string } {
  const code = e instanceof Error ? e.message : "ERROR";
  const map: Record<string, string> = {
    NO_ROOM: "房间不存在，请检查房间号。",
    NOT_SEATED: "你在观战，不能操作。",
    ROOM_FULL: "房间已满。",
    ALREADY_STARTED: "战斗已经开始了。",
    HOST_ONLY: "只有房主可以这样做。",
    NOT_STARTED: "战斗还没开始。",
    NAME_REQUIRED: "请填写昵称。",
    BF_STALE: "画面已更新，请再点一次。",
    BF_COUNT: "需要 2–4 名英雄（可以加机器人队友）。",
    BF_NOT_PICKED: "还有人没选好种族和职业。",
    BF_RACE_TAKEN: "这个种族已经有人选了。",
    BF_CAMPAIGN_LOCKED: "冒险团已经组建，英雄不能再换（可以让房主重开冒险团）。",
    BF_LOCKED_BOSS: "这一关还没解锁。",
    BF_LOOT_PENDING: "还有人没选战利品。",
    BF_NOT_OVER: "战斗还没结束。",
    TOO_MANY_ROOMS: "服务器上的房间太多了，请稍后再试。",
    BAD_ACTION: "操作无效。",
  };
  // 引擎的报错本身就是中文原因，直接给用户
  return { code, error: map[code] ?? code };
}

const sockRoom = (code: string) => "bf:" + code;
const BOT_DELAY = 900;

export function attachBossFighters(io: Server, dataDir: string, opts: { maxRooms: number; idleMs: number }) {
  const store = new BFRoomStore(dataDir);
  const busy = (code: string) => (io.sockets.adapter.rooms.get(sockRoom(code))?.size ?? 0) > 0;
  setInterval(() => {
    const n = store.prune(opts.idleMs, busy);
    if (n) console.log(`清理闲置魔王试炼房间 ${n} 个`);
  }, 30 * 60_000).unref();

  const broadcast = (room: BFRoom) => {
    for (const id of io.sockets.adapter.rooms.get(sockRoom(room.code)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(BF_EVENTS.update, room.snapshot(sock.data.bfSeat ?? null));
    }
  };
  /** 机器人一步一步出手，留出时间给画面播放 */
  const runBots = (room: BFRoom) => {
    if (room.botTimer) return;
    if (!room.botMove()) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      try {
        const c = room.botMove();
        if (c) {
          room.commit(c);
          store.save(room);
          broadcast(room);
        }
      } catch (e) {
        console.warn("魔王试炼机器人出错", room.code, e instanceof Error ? e.message : e);
        return;
      }
      runBots(room);
    }, BOT_DELAY);
    room.botTimer.unref?.();
  };
  for (const room of store.rooms.values()) runBots(room);
  const find = (code: unknown) => store.rooms.get(String(code ?? "").toUpperCase());

  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const room: BFRoom | undefined = socket.data.bfRoom;
      const seat: string | null = socket.data.bfSeat ?? null;
      if (room && seat) {
        room.connections.set(seat, Math.max(0, (room.connections.get(seat) ?? 1) - 1));
        broadcast(room);
      }
    };
    const attach = (room: BFRoom, seat: string | null) => {
      if (socket.data.bfRoom && socket.data.bfRoom !== room) {
        leave();
        socket.leave(sockRoom(socket.data.bfRoom.code));
        socket.data.bfSeat = null;
      }
      if (seat && socket.data.bfSeat !== seat) room.connections.set(seat, (room.connections.get(seat) ?? 0) + 1);
      socket.data.bfRoom = room;
      socket.data.bfSeat = seat;
      socket.join(sockRoom(room.code));
    };
    const guarded =
      <T>(fn: (req: any) => T) =>
      (req: unknown, ack: (a: Ack<any>) => void) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req) as object) });
        } catch (e) {
          ack({ ok: false, ...bfErrorText(e) });
        }
      };
    socket.on(BF_EVENTS.create, guarded(() => {
      if (store.rooms.size >= opts.maxRooms) {
        store.prune(opts.idleMs, busy);
        if (store.rooms.size >= opts.maxRooms) fail("TOO_MANY_ROOMS");
      }
      return { code: store.create().code };
    }));
    socket.on(BF_EVENTS.join, guarded((req: { code: string; token?: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const me = room.idByToken(req.token);
      attach(room, me);
      broadcast(room);
      return { snapshot: room.snapshot(me) };
    }));
    socket.on(BF_EVENTS.claim, guarded((req: { code: string; name: string }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      const token = room.claim(String(req.name ?? ""));
      store.save(room);
      attach(room, room.idByToken(token));
      broadcast(room);
      return { token };
    }));
    socket.on(BF_EVENTS.lobby, guarded((req: { code: string; token: string; action: BFLobbyAction }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      room.lobby(req.token, req.action);
      store.save(room);
      broadcast(room);
      runBots(room);
      return {};
    }));
    socket.on(BF_EVENTS.command, guarded((req: { code: string; token: string; command: BFClientCommand }) => {
      const room = find(req?.code) ?? fail("NO_ROOM");
      room.apply(req.token, req.command);
      store.save(room);
      broadcast(room);
      runBots(room);
      return {};
    }));
    socket.on("disconnect", leave);
  });
  return store;
}
