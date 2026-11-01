import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createND,
  reduceND,
  viewForND,
  assertInvariantsND,
  type NDState,
  type NDCommand,
} from "../../../packages/naodong-scale/src/index.ts";
import {
  ND_EVENTS,
  type NDAction,
  type NDSettings,
  type NDSnapshot,
  type NDAck,
  type NDActionRequest,
} from "../../../packages/shared/src/nd-protocol.ts";

interface NDSeat {
  id: string;
  token: string;
  name: string;
  ready: boolean;
}
export interface NDFile {
  schema: 1;
  game: "naodong-scale";
  code: string;
  version: number;
  settings: NDSettings;
  players: NDSeat[];
  state: NDState | null;
  seq: Record<string, number>;
  receipts: Record<string, Record<string, string>>;
  deadline: number | null;
  deadlineKey: string;
  expired: boolean;
  timeoutCount: number;
  createdAt: number;
  updatedAt: number;
}
export interface NDRoomOptions {
  allowFixedSeed?: boolean;
  clock?: () => number;
}
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
const codePattern = /^[A-HJ-NP-Z2-9]{4}$/;
const gameFields: Record<string, string[]> = {
  CHOOSE_TOPIC: ["topicId"],
  READY: [],
  LOCK_ORDER: ["order"],
  REVEAL_NEXT: [],
  GUESS_EXACT: ["target", "guess"],
  GUESS_CAPTAIN: ["guess"],
  NEXT_ROUND: [],
};
const fields: Record<string, string[]> = {
  ...gameFields,
  SET_SETTINGS: ["count", "seconds", "scale", "expert", "firstCaptain"],
  START: ["seed"],
  LEAVE: [],
  REMATCH: [],
};
function objectKeys(value: unknown, allowed: string[]) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "请求格式不正确",
  );
  ensure(
    Object.keys(value).every((k) => allowed.includes(k)),
    "请求含不允许的字段",
  );
}
function settingsValid(s: NDSettings, claimed: number) {
  ensure(
    Number.isInteger(s.count) &&
      s.count >= 4 &&
      s.count <= 9 &&
      s.count >= claimed,
    "人数必须为 4–9 且不少于已入座人数",
  );
  ensure([0, 60, 120].includes(s.seconds), "计时只能不限时、60 秒或 120 秒");
  ensure(s.scale === "open" || s.scale === "normal", "尺度只能是放开或普通");
  ensure(
    typeof s.expert === "boolean" && !(s.expert && s.count === 9),
    "9 人暂不支持专家模式",
  );
  ensure(
    Number.isInteger(s.firstCaptain) &&
      s.firstCaptain >= 0 &&
      s.firstCaptain < s.count,
    "首位队长座位不正确",
  );
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            stable((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "undefined";
}
function deadlineKey(s: NDState | null) {
  return s
    ? `${s.round}:${s.phase}:${s.phase === "EXPERT" ? s.revealed.length : 0}`
    : "";
}
const timed = new Set([
  "CHOOSE_TOPIC",
  "ANSWER",
  "ORDER",
  "EXPERT",
  "CAPTAIN_GUESS",
]);

export class NDRoom {
  connections = new Map<string, number>();
  constructor(
    public file: NDFile,
    public directory: string,
    public options: NDRoomOptions = {},
  ) {
    this.validate();
  }
  static create(code: string, directory: string, options: NDRoomOptions = {}) {
    const now = options.clock?.() ?? Date.now();
    return new NDRoom(
      {
        schema: 1,
        game: "naodong-scale",
        code,
        version: 0,
        settings: {
          count: 4,
          seconds: 0,
          scale: "open",
          expert: false,
          firstCaptain: 0,
        },
        players: [],
        state: null,
        seq: {},
        receipts: {},
        deadline: null,
        deadlineKey: "",
        expired: false,
        timeoutCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      directory,
      options,
    );
  }
  validate() {
    const f = this.file;
    ensure(
      f.schema === 1 && f.game === "naodong-scale" && codePattern.test(f.code),
      "房间存档格式无效",
    );
    ensure(
      Number.isSafeInteger(f.version) &&
        f.version >= 0 &&
        Array.isArray(f.players),
      "房间版本无效",
    );
    settingsValid(f.settings, f.players.length);
    ensure(
      f.players.every(
        (p) =>
          /^[a-f0-9]{24}$/.test(p.id) &&
          /^[a-f0-9]{64}$/.test(p.token) &&
          typeof p.name === "string" &&
          p.name.trim().length > 0 &&
          typeof p.ready === "boolean",
      ),
      "存档座位无效",
    );
    ensure(
      new Set(f.players.map((p) => p.id)).size === f.players.length &&
        new Set(f.players.map((p) => p.token)).size === f.players.length,
      "存档凭证重复",
    );
    ensure(
      f.seq &&
        f.receipts &&
        Object.keys(f.seq).length === f.players.length &&
        Object.keys(f.receipts).length === f.players.length &&
        f.players.every(
          (p) =>
            Number.isSafeInteger(f.seq[p.id]) &&
            f.seq[p.id] >= 0 &&
            f.receipts[p.id] &&
            Object.keys(f.receipts[p.id]).length === f.seq[p.id] &&
            Object.values(f.receipts[p.id]).every((v) => typeof v === "string"),
        ),
      "存档命令记录无效",
    );
    ensure(
      typeof f.expired === "boolean" &&
        Number.isSafeInteger(f.timeoutCount) &&
        f.timeoutCount >= 0 &&
        (f.deadline === null ||
          (Number.isSafeInteger(f.deadline) && f.deadline >= 0)),
      "存档计时无效",
    );
    ensure(
      Number.isFinite(f.createdAt) &&
        Number.isFinite(f.updatedAt) &&
        f.deadlineKey === deadlineKey(f.state),
      "存档阶段计时不匹配",
    );
    if (f.state) {
      assertInvariantsND(f.state);
      ensure(
        f.players.length === f.settings.count &&
          f.state.players.length === f.players.length &&
          f.state.options.expert === f.settings.expert &&
          f.state.options.scale === f.settings.scale &&
          f.state.players.every((p, i) => p.name === f.players[i].name),
        "存档对局与座位不匹配",
      );
    } else ensure(f.deadline === null && !f.expired, "大厅不应有计时");
    if (f.settings.seconds === 0)
      ensure(f.deadline === null && !f.expired, "不限时设置无效");
  }
  me(token: unknown) {
    return typeof token === "string"
      ? this.file.players.find((p) => p.token === token)
      : undefined;
  }
  private transaction<T>(now: number, fn: () => T): T {
    const previous = structuredClone(this.file);
    try {
      const result = fn();
      this.validate();
      this.save(now);
      return result;
    } catch (e) {
      this.file = previous;
      throw e;
    }
  }
  save(now = this.options.clock?.() ?? Date.now()) {
    this.file.updatedAt = now;
    const path = join(this.directory, this.file.code + ".json");
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(path + ".tmp", JSON.stringify(this.file), { mode: 0o600 });
      renameSync(path + ".tmp", path);
    } catch {
      try {
        rmSync(path + ".tmp", { force: true });
      } catch {}
      throw Error("房间保存失败，请重试");
    }
  }
  claim(name: unknown) {
    ensure(!this.file.state, "对局已开始，不能新入座");
    ensure(typeof name === "string" && name.trim().length > 0, "请填写昵称");
    ensure(this.file.players.length < this.file.settings.count, "房间已满");
    return this.transaction(this.options.clock?.() ?? Date.now(), () => {
      const p = {
        id: randomBytes(12).toString("hex"),
        token: randomBytes(32).toString("hex"),
        name: name.trim().slice(0, 12),
        ready: false,
      };
      this.file.players.push(p);
      this.file.seq[p.id] = 0;
      this.file.receipts[p.id] = {};
      this.file.version++;
      return { token: p.token, playerId: p.id };
    });
  }
  private resetDeadline(now: number) {
    const key = deadlineKey(this.file.state);
    if (key === this.file.deadlineKey) return;
    this.file.deadlineKey = key;
    this.file.expired = false;
    this.file.deadline =
      this.file.settings.seconds &&
      this.file.state &&
      timed.has(this.file.state.phase)
        ? now + this.file.settings.seconds * 1000
        : null;
  }
  action(
    token: string,
    version: number,
    seq: number,
    c: NDAction,
    now = this.options.clock?.() ?? Date.now(),
    round?: number,
  ) {
    const me = this.me(token);
    ensure(me, "入座凭证无效");
    ensure(
      c &&
        typeof c === "object" &&
        typeof c.type === "string" &&
        Object.hasOwn(fields, c.type),
      "无法识别的游戏操作",
    );
    objectKeys(c, ["type", ...fields[c.type]]);
    ensure(Number.isSafeInteger(seq) && seq > 0, "命令序号必须为正整数");
    ensure(
      Number.isSafeInteger(version) &&
        version >= 0 &&
        version <= this.file.version,
      "状态版本无效",
    );
    ensure(
      round === undefined || (Number.isSafeInteger(round) && round >= 1),
      "轮次无效",
    );
    const fingerprint = stable({ round: round ?? null, action: c }),
      previous = this.file.receipts[me.id][String(seq)];
    if (previous !== undefined) {
      ensure(previous === fingerprint, "这个序号已用于另一操作");
      return { changed: false };
    }
    ensure(seq === this.file.seq[me.id] + 1, "命令序号不连续，请同步状态");
    const concurrent =
      c.type === "READY" &&
      this.file.state?.phase === "ANSWER" &&
      round === this.file.state.round;
    ensure(
      version === this.file.version || concurrent,
      "状态已更新，请重新同步",
    );
    const seat = this.file.players.findIndex((p) => p.id === me.id);
    if (["SET_SETTINGS", "START", "REMATCH"].includes(c.type))
      ensure(seat === 0, "只有房主可以操作");
    return this.transaction(now, () => {
      if (c.type === "REMATCH") {
        ensure(this.file.state?.phase === "FINISHED", "本局尚未结束");
        this.file.state = null;
        this.file.players.forEach((p) => (p.ready = false));
        this.file.timeoutCount = 0;
      } else if (this.file.state) {
        ensure(
          Object.hasOwn(gameFields, c.type),
          "对局中不能修改大厅设置或退出座位",
        );
        ensure(round === this.file.state.round, "轮次已更新，请重新同步");
        this.file.state = reduceND(this.file.state, {
          ...c,
          seat,
          seq: this.file.state.seq[seat] + 1,
        } as NDCommand);
      } else
        switch (c.type) {
          case "SET_SETTINGS": {
            const candidate = { ...this.file.settings };
            for (const key of [
              "count",
              "seconds",
              "scale",
              "expert",
              "firstCaptain",
            ] as const)
              if (c[key] !== undefined)
                (candidate as unknown as Record<string, unknown>)[key] = c[key];
            settingsValid(candidate, this.file.players.length);
            this.file.settings = candidate;
            this.file.players.forEach((p) => (p.ready = false));
            break;
          }
          case "READY":
            me.ready = !me.ready;
            break;
          case "START": {
            ensure(
              this.file.players.length === this.file.settings.count &&
                this.file.players.every((p) => p.ready),
              "人数未满或有人尚未准备",
            );
            ensure(
              c.seed === undefined || this.options.allowFixedSeed,
              "生产房间不能指定种子",
            );
            if (c.seed !== undefined)
              ensure(
                Number.isInteger(c.seed) && c.seed >= 0 && c.seed <= 0xffffffff,
                "测试种子无效",
              );
            this.file.state = createND(
              this.file.players.map((p) => p.name),
              {
                seed: c.seed ?? randomInt(0x100000000),
                expert: this.file.settings.expert,
                scale: this.file.settings.scale,
                firstCaptain: this.file.settings.firstCaptain,
              },
            );
            break;
          }
          case "LEAVE": {
            this.file.players.splice(seat, 1);
            delete this.file.seq[me.id];
            delete this.file.receipts[me.id];
            this.file.players.forEach((p) => (p.ready = false));
            if (this.file.settings.firstCaptain > seat)
              this.file.settings.firstCaptain--;
            else if (this.file.settings.firstCaptain === seat)
              this.file.settings.firstCaptain = 0;
            break;
          }
          default:
            throw Error("请先开始对局");
        }
      if (c.type !== "LEAVE") {
        this.file.seq[me.id] = seq;
        this.file.receipts[me.id][String(seq)] = fingerprint;
      }
      this.resetDeadline(now);
      this.file.version++;
      return { changed: true };
    });
  }
  tick(now = this.options.clock?.() ?? Date.now()) {
    if (
      this.file.deadline === null ||
      this.file.expired ||
      now < this.file.deadline
    )
      return false;
    return this.transaction(now, () => {
      this.file.expired = true;
      this.file.timeoutCount++;
      this.file.version++;
      return true;
    });
  }
  snapshot(
    token?: string,
    now = this.options.clock?.() ?? Date.now(),
  ): NDSnapshot {
    const me = this.me(token),
      seat = me ? this.file.players.findIndex((p) => p.id === me.id) : null;
    return structuredClone({
      code: this.file.code,
      version: this.file.version,
      mySeat: seat,
      hostId: this.file.players[0]?.id ?? null,
      settings: this.file.settings,
      players: this.file.players.map((p, seat) => ({
        id: p.id,
        name: p.name,
        seat,
        ready: p.ready,
        connected: (this.connections.get(p.id) ?? 0) > 0,
      })),
      view:
        seat !== null && this.file.state
          ? viewForND(this.file.state, seat)
          : null,
      ...(me ? { nextSeq: this.file.seq[me.id] + 1 } : {}),
      serverNow: now,
      deadline: this.file.deadline,
      expired: this.file.expired,
      timeoutCount: this.file.timeoutCount,
    });
  }
}

export function attachNaodongScale(
  io: Server,
  directory: string,
  opts: NDRoomOptions & { maxRooms: number; idleMs: number; tickMs?: number },
) {
  mkdirSync(directory, { recursive: true });
  const rooms = new Map<string, NDRoom>();
  const clock = opts.clock ?? Date.now;
  for (const name of readdirSync(directory)) {
    if (!/^[A-HJ-NP-Z2-9]{4}\.json$/.test(name)) continue;
    try {
      const file = JSON.parse(
        readFileSync(join(directory, name), "utf8"),
      ) as NDFile;
      ensure(file.code + ".json" === name, "文件名不匹配");
      rooms.set(file.code, new NDRoom(file, directory, opts));
    } catch {
      console.warn("无法恢复脑洞量表房间", name);
    }
  }
  const channel = (code: string) => "nd:" + code;
  const broadcast = (r: NDRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r.file.code)) ?? []) {
      const socket = io.sockets.sockets.get(id);
      if (socket)
        socket.emit(ND_EVENTS.update, r.snapshot(socket.data.ndToken, clock()));
    }
  };
  const tick = () => {
    const now = clock();
    for (const [code, r] of rooms) {
      try {
        if (r.tick(now)) broadcast(r);
        if (
          now - r.file.updatedAt > opts.idleMs &&
          !io.sockets.adapter.rooms.get(channel(code))?.size
        ) {
          rmSync(join(directory, code + ".json"), { force: true });
          rooms.delete(code);
        }
      } catch {
        console.warn("脑洞量表房间计时或清理失败", code);
      }
    }
  };
  const timer = setInterval(tick, opts.tickMs ?? 250);
  timer.unref();
  const close = () => clearInterval(timer);
  io.engine.on("close", close);
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const old = socket.data.ndRoom as NDRoom | undefined,
        id = socket.data.ndPlayerId as string | undefined;
      socket.data.ndRoom = undefined;
      socket.data.ndToken = undefined;
      socket.data.ndPlayerId = undefined;
      if (old) {
        socket.leave(channel(old.file.code));
        if (id) {
          const count = Math.max(0, (old.connections.get(id) ?? 1) - 1);
          if (count) old.connections.set(id, count);
          else old.connections.delete(id);
        }
        broadcast(old);
      }
    };
    const attach = (r: NDRoom, token?: string) => {
      leave();
      const me = r.me(token);
      socket.data.ndRoom = r;
      socket.data.ndToken = me ? token : undefined;
      socket.data.ndPlayerId = me?.id;
      if (me) r.connections.set(me.id, (r.connections.get(me.id) ?? 0) + 1);
      socket.join(channel(r.file.code));
    };
    const find = (code: unknown) => {
      ensure(
        typeof code === "string" && codePattern.test(code.toUpperCase()),
        "房间号不正确",
      );
      const r = rooms.get(code.toUpperCase());
      ensure(r, "房间不存在");
      return r;
    };
    const handle = (
      event: string,
      allowed: string[],
      fn: (req: any) => object,
    ) =>
      socket.on(event, (req: unknown, ack: unknown) => {
        if (typeof ack !== "function") return;
        try {
          objectKeys(req, allowed);
          (ack as (r: NDAck) => void)({ ok: true, ...fn(req) });
        } catch (e) {
          const r = socket.data.ndRoom as NDRoom | undefined;
          (ack as (r: NDAck) => void)({
            ok: false,
            error: e instanceof Error ? e.message : "操作失败",
            ...(r?.me(socket.data.ndToken)
              ? { snapshot: r.snapshot(socket.data.ndToken, clock()) }
              : {}),
          });
        }
      });
    handle(ND_EVENTS.create, [], () => {
      ensure(rooms.size < opts.maxRooms, "房间数量已满");
      let code: string;
      do {
        code = Array.from(
          { length: 4 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
        ).join("");
      } while (rooms.has(code));
      const r = NDRoom.create(code, directory, opts);
      r.save(clock());
      rooms.set(code, r);
      return { code };
    });
    handle(ND_EVENTS.join, ["code", "token"], (req) => {
      const r = find(req.code);
      ensure(req.token === undefined || r.me(req.token), "入座凭证无效");
      r.tick(clock());
      attach(r, req.token);
      broadcast(r);
      return { snapshot: r.snapshot(req.token, clock()) };
    });
    handle(ND_EVENTS.claim, ["code", "name"], (req) => {
      const r = find(req.code);
      ensure(!r.me(socket.data.ndToken), "已经入座");
      const claim = r.claim(req.name);
      attach(r, claim.token);
      broadcast(r);
      return { ...claim, snapshot: r.snapshot(claim.token, clock()) };
    });
    handle(
      ND_EVENTS.action,
      ["code", "token", "version", "seq", "round", "action"],
      (req: NDActionRequest) => {
        const r = find(req.code);
        ensure(
          socket.data.ndRoom === r &&
            socket.data.ndToken === req.token &&
            r.me(req.token),
          "请用原座位凭证重新连接房间",
        );
        if (r.tick(clock())) broadcast(r);
        const result = r.action(
          req.token,
          req.version,
          req.seq,
          req.action,
          clock(),
          req.round,
        );
        if (!r.me(req.token)) leave();
        if (result.changed) broadcast(r);
        return { ...result, snapshot: r.snapshot(req.token, clock()) };
      },
    );
    socket.on("disconnect", leave);
  });
  return { rooms, tick, close };
}
