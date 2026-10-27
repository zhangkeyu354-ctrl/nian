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
  createSS,
  reduceSS,
  viewForSS,
  assertInvariants,
  type SSState,
  type Command,
} from "../../../packages/soda-smugglers/src/index.ts";
import {
  SS_EVENTS as E,
  type SSAction,
  type SSSnapshot,
} from "../../../packages/shared/src/ss-protocol.ts";
interface Seat {
  id: string;
  name: string;
  token: string;
  ready: boolean;
}
export interface SSFile {
  schema: 1;
  game: "soda-smugglers";
  code: string;
  version: number;
  count: number;
  events: boolean;
  seconds: 0 | 60 | 120;
  firstGuard: number | "random";
  players: Seat[];
  state: SSState | null;
  seq: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}
interface Options {
  allowFixedSeed?: boolean;
}
function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error(msg);
}
const GAME = new Set([
  "SUBMIT",
  "ACCEPT",
  "INSPECT",
  "REVEAL_DOG",
  "ARREST",
  "GREEDY",
  "ADVANCE",
  "NEXT_ROUND",
]);
export class SSRoom {
  connections = new Map<string, number>();
  constructor(
    public file: SSFile,
    public directory: string,
    public options: Options = {},
  ) {}
  static create(code: string, directory: string, options: Options = {}) {
    ensure(/^[A-Z2-9]{4}$/.test(code), "房间号无效");
    return new SSRoom(
      {
        schema: 1,
        game: "soda-smugglers",
        code,
        version: 0,
        count: 3,
        events: false,
        seconds: 0,
        firstGuard: 0,
        players: [],
        state: null,
        seq: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      directory,
      options,
    );
  }
  me(token: unknown) {
    return typeof token === "string"
      ? this.file.players.find((p) => p.token === token)
      : undefined;
  }
  private transaction<T>(fn: () => T): T {
    const previous = this.file;
    this.file = structuredClone(previous);
    try {
      const result = fn();
      this.save();
      return result;
    } catch (e) {
      this.file = previous;
      throw e;
    }
  }
  claim(name: unknown) {
    ensure(!this.file.state, "对局已开始");
    ensure(typeof name === "string" && name.trim().length > 0, "请填写昵称");
    ensure(this.file.players.length < this.file.count, "房间已满");
    return this.transaction(() => {
      const p = {
        id: randomBytes(12).toString("hex"),
        token: randomBytes(32).toString("hex"),
        name: name.trim().slice(0, 12),
        ready: false,
      };
      this.file.players.push(p);
      this.file.version++;
      return { token: p.token, playerId: p.id };
    });
  }
  action(
    token: string,
    version: number,
    seq: number,
    c: SSAction,
    now = Date.now(),
    round?: number,
  ) {
    const me = this.me(token);
    ensure(me, "入座凭证无效");
    ensure(
      c && typeof c === "object" && typeof c.type === "string",
      "无效操作",
    );
    ensure(String(c.type) !== "TIMEOUT", "超时只能由服务器触发");
    ensure(
      !("actor" in c) && !("now" in c) && !("seq" in c),
      "不能指定服务器身份、时间或内部序号",
    );
    ensure(Number.isSafeInteger(seq) && seq > 0, "seq必须为正整数");
    const previous = this.file.seq[me.id] ?? 0;
    if (seq <= previous) return { changed: false };
    ensure(seq === previous + 1, "操作序号不连续，请同步状态");
    ensure(
      Number.isSafeInteger(version) &&
        version >= 0 &&
        version <= this.file.version,
      "状态版本无效",
    );
    const concurrentPack =
      c.type === "SUBMIT" &&
      this.file.state?.phase === "PACK" &&
      round === this.file.state.round;
    ensure(
      version === this.file.version || concurrentPack,
      "状态已更新，请重新同步",
    );
    const seat = this.file.players.findIndex((p) => p.id === me.id);
    if (["SET_SETTINGS", "RANDOM_GUARD", "START", "REMATCH"].includes(c.type))
      ensure(seat === 0, "只有房主可以操作");
    return this.transaction(() => {
      if (c.type === "REMATCH") {
        ensure(this.file.state?.phase === "FINISHED", "本局尚未结束");
        this.file.state = null;
        this.file.players.forEach((p) => (p.ready = false));
      } else if (this.file.state) {
        ensure(GAME.has(c.type), "对局进行中不能修改大厅设置");
        const s = this.file.state;
        ensure(round === s.round, "轮次已更新，请重新同步");
        this.file.state = reduceSS(s, {
          ...c,
          actor: seat,
          seq: (s.seq[String(seat)] ?? 0) + 1,
          now,
        } as Command);
      } else
        switch (c.type) {
          case "SET_SETTINGS": {
            const count = c.count ?? this.file.count,
              events = c.events ?? this.file.events,
              seconds = c.seconds ?? this.file.seconds,
              firstGuard = c.firstGuard ?? this.file.firstGuard;
            ensure(
              Number.isInteger(count) &&
                count >= 3 &&
                count <= 8 &&
                count >= this.file.players.length,
              "人数须为3至8且不少于已入座人数",
            );
            ensure(typeof events === "boolean", "随机事件开关无效");
            ensure(
              [0, 60, 120].includes(seconds),
              "计时只能不限时、60秒或120秒",
            );
            ensure(
              firstGuard === "random" ||
                (Number.isInteger(firstGuard) &&
                  firstGuard >= 0 &&
                  firstGuard < count),
              "首位缉私警长座位无效",
            );
            this.file.count = count;
            this.file.events = events;
            this.file.seconds = seconds;
            this.file.firstGuard = firstGuard;
            this.file.players.forEach((p) => (p.ready = false));
            break;
          }
          case "RANDOM_GUARD":
            this.file.firstGuard = "random";
            this.file.players.forEach((p) => (p.ready = false));
            break;
          case "READY":
            this.file.players[seat].ready = !this.file.players[seat].ready;
            break;
          case "START":
            ensure(
              this.file.players.length === this.file.count &&
                this.file.players.every((p) => p.ready),
              "人数未满或有人尚未准备",
            );
            ensure(
              c.seed === undefined || this.options.allowFixedSeed,
              "生产房间不能指定随机种子",
            );
            this.file.state = createSS(
              this.file.players.map((p) => p.name),
              {
                seed: c.seed ?? randomInt(0x100000000),
                events: this.file.events,
                seconds: this.file.seconds,
                firstGuard: this.file.firstGuard,
                now,
              },
            );
            break;
          case "LEAVE":
            this.file.players.splice(seat, 1);
            this.file.players.forEach((p) => (p.ready = false));
            if (typeof this.file.firstGuard === "number") {
              this.file.firstGuard =
                this.file.firstGuard > seat
                  ? this.file.firstGuard - 1
                  : this.file.firstGuard === seat
                    ? 0
                    : this.file.firstGuard;
            }
            break;
          default:
            throw Error("请先开始对局");
        }
      this.file.seq[me.id] = seq;
      this.file.version++;
      return { changed: true };
    });
  }
  tick(now = Date.now()) {
    const s = this.file.state;
    if (!s || s.deadline === null || now < s.deadline) return false;
    return this.transaction(() => {
      this.file.state = reduceSS(s, {
        type: "TIMEOUT",
        actor: "server",
        seq: (s.seq.server ?? 0) + 1,
        now,
      });
      this.file.version++;
      return true;
    });
  }
  snapshot(token?: string, now = Date.now()): SSSnapshot {
    const me = this.me(token);
    const seat = me ? this.file.players.findIndex((p) => p.id === me.id) : -1;
    return {
      code: this.file.code,
      version: this.file.version,
      mySeat: me?.id ?? null,
      hostId: this.file.players[0]?.id ?? null,
      count: this.file.count,
      events: this.file.events,
      seconds: this.file.seconds,
      firstGuard: this.file.firstGuard,
      players: this.file.players.map((p, seat) => ({
        id: p.id,
        name: p.name,
        seat,
        ready: p.ready,
        connected: (this.connections.get(p.id) ?? 0) > 0,
      })),
      view: me && this.file.state ? viewForSS(this.file.state, seat) : null,
      serverNow: now,
      ...(me ? { nextSeq: (this.file.seq[me.id] ?? 0) + 1 } : {}),
    };
  }
  save() {
    this.file.updatedAt = Date.now();
    mkdirSync(this.directory, { recursive: true });
    const path = join(this.directory, this.file.code + ".json");
    writeFileSync(path + ".tmp", JSON.stringify(this.file), { mode: 0o600 });
    renameSync(path + ".tmp", path);
  }
}
export function attachSodaSmugglers(
  io: Server,
  directory: string,
  opts: {
    maxRooms: number;
    idleMs: number;
    allowFixedSeed?: boolean;
    clock?: () => number;
    tickMs?: number;
  },
) {
  mkdirSync(directory, { recursive: true });
  const rooms = new Map<string, SSRoom>();
  const clock = opts.clock ?? Date.now;
  for (const name of readdirSync(directory)) {
    if (!/^[A-Z2-9]{4}\.json$/.test(name)) continue;
    try {
      const f = JSON.parse(
        readFileSync(join(directory, name), "utf8"),
      ) as SSFile;
      ensure(
        f.schema === 1 &&
          f.game === "soda-smugglers" &&
          f.code + ".json" === name &&
          Number.isInteger(f.count) &&
          f.count >= 3 &&
          f.count <= 8 &&
          Array.isArray(f.players) &&
          f.players.length <= f.count,
        "存档结构无效",
      );
      ensure(
        typeof f.events === "boolean" &&
          [0, 60, 120].includes(f.seconds) &&
          (f.firstGuard === "random" ||
            (Number.isInteger(f.firstGuard) &&
              f.firstGuard >= 0 &&
              f.firstGuard < f.count)),
        "存档设置无效",
      );
      ensure(
        f.players.every(
          (p) =>
            typeof p.id === "string" &&
            typeof p.token === "string" &&
            typeof p.name === "string",
        ) && new Set(f.players.map((p) => p.token)).size === f.players.length,
        "存档凭证无效",
      );
      if (f.state) {
        ensure(
          f.state.players.length === f.players.length &&
            f.state.options.events === f.events &&
            f.state.options.seconds === f.seconds,
          "存档对局设置不匹配",
        );
        assertInvariants(f.state);
      }
      rooms.set(f.code, new SSRoom(f, directory, opts));
    } catch {
      console.warn("无法恢复汽水走私犯房间", name);
    }
  }
  const channel = (code: string) => "ss:" + code;
  const broadcast = (r: SSRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r.file.code)) ?? []) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit(E.update, r.snapshot(s.data.ssToken, clock()));
    }
  };
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      try {
        if (r.tick(clock())) broadcast(r);
      } catch {
        console.warn("汽水走私犯房间计时保存失败", code);
      }
      if (
        Date.now() - r.file.updatedAt > opts.idleMs &&
        !io.sockets.adapter.rooms.get(channel(code))?.size
      ) {
        rooms.delete(code);
        rmSync(join(directory, code + ".json"), { force: true });
      }
    }
  }, opts.tickMs ?? 250);
  timer.unref();
  const close = () => clearInterval(timer);
  io.engine.on("close", close);
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const r = socket.data.ssRoom as SSRoom | undefined;
      if (r) {
        const p = r.me(socket.data.ssToken);
        if (p)
          r.connections.set(
            p.id,
            Math.max(0, (r.connections.get(p.id) ?? 1) - 1),
          );
        socket.leave(channel(r.file.code));
        broadcast(r);
      }
      socket.data.ssRoom = undefined;
      socket.data.ssToken = undefined;
    };
    const attach = (r: SSRoom, token?: string) => {
      leave();
      socket.data.ssRoom = r;
      socket.data.ssToken = token;
      const p = r.me(token);
      if (p) r.connections.set(p.id, (r.connections.get(p.id) ?? 0) + 1);
      socket.join(channel(r.file.code));
    };
    const handle = (event: string, fn: (req: any) => object) =>
      socket.on(event, (req: any, ack: any) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...fn(req ?? {}) });
        } catch (e) {
          ack({
            ok: false,
            error: e instanceof Error ? e.message : "操作失败",
          });
        }
      });
    const find = (code: unknown) => {
      const r =
        typeof code === "string" ? rooms.get(code.toUpperCase()) : undefined;
      ensure(r, "房间不存在");
      return r;
    };
    handle(E.create, () => {
      ensure(rooms.size < opts.maxRooms, "房间数量已满");
      let code: string;
      do {
        code = Array.from(
          { length: 4 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
        ).join("");
      } while (rooms.has(code));
      const r = SSRoom.create(code, directory, opts);
      r.save();
      rooms.set(code, r);
      return { code };
    });
    handle(E.join, (req) => {
      const r = find(req.code);
      if (req.token !== undefined) ensure(r.me(req.token), "入座凭证无效");
      if (r.tick(clock())) broadcast(r);
      attach(r, req.token);
      broadcast(r);
      return { snapshot: r.snapshot(req.token, clock()) };
    });
    handle(E.claim, (req) => {
      const r = find(req.code);
      ensure(!r.me(socket.data.ssToken), "已经入座");
      const claim = r.claim(req.name);
      attach(r, claim.token);
      broadcast(r);
      return { ...claim, snapshot: r.snapshot(claim.token, clock()) };
    });
    handle(E.action, (req) => {
      const r = find(req.code);
      ensure(
        socket.data.ssRoom === r &&
          socket.data.ssToken === req.token &&
          r.me(req.token),
        "请重新连接房间",
      );
      if (r.tick(clock())) {
        broadcast(r);
        return {
          ok: false,
          error: "本阶段已到时，请同步后再操作",
          consumed: false,
          snapshot: r.snapshot(req.token, clock()),
        };
      }
      try {
        const change = r.action(
          req.token,
          req.version,
          req.seq,
          req.action,
          clock(),
          req.round,
        );
        if (change.changed) {
          if (!r.me(req.token)) attach(r);
          broadcast(r);
        }
        return {
          consumed: change.changed,
          snapshot: r.snapshot(socket.data.ssToken, clock()),
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "操作失败",
          consumed: false,
          snapshot: r.snapshot(req.token, clock()),
        };
      }
    });
    socket.on("disconnect", leave);
  });
  return { rooms, close };
}
