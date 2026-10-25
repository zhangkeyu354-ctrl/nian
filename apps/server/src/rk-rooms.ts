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
  createRK,
  reduceRK,
  viewForRK,
  assertInvariants,
  type RKState,
  type Command,
  type RKVariant,
} from "../../../packages/rummikub/src/index.ts";
import {
  RK_EVENTS as E,
  type RKAction,
  type RKSnapshot,
} from "../../../packages/shared/src/rk-protocol.ts";
interface Seat {
  id: string;
  name: string;
  token: string;
  ready: boolean;
}
export interface RKFile {
  variant: RKVariant;
  schema: 1;
  game: "rummikub";
  code: string;
  version: number;
  count: number;
  minutes: 0 | 1 | 2;
  games: number;
  players: Seat[];
  state: RKState | null;
  seq: Record<string, number>;
  revisions: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}
interface Options {
  allowFixedSeed?: boolean;
}
export interface Change {
  scope: "private" | "public" | "none";
  error?: string;
}
const PRIVATE = new Set(["MOVE", "SPLIT", "MERGE", "UNDO", "REDO", "RESET"]);
const GAME = new Set([...PRIVATE, "DRAW", "COMMIT", "NEXT_GAME"]);
function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error(msg);
}
export class RKRoom {
  connections = new Map<string, number>();
  constructor(
    public file: RKFile,
    public directory: string,
    public options: Options = {},
  ) {}
  static create(code: string, directory: string, options: Options = {}) {
    ensure(/^[A-Z2-9]{4}$/.test(code), "房间号无效");
    return new RKRoom(
      {
        schema: 1,
        variant: "classic",
        game: "rummikub",
        code,
        version: 0,
        count: 2,
        minutes: 1,
        games: 2,
        players: [],
        state: null,
        seq: {},
        revisions: {},
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
    c: RKAction,
    now = Date.now(),
  ): Change {
    const me = this.me(token);
    ensure(me, "入座凭证无效");
    ensure(Number.isSafeInteger(seq) && seq > 0, "seq 必须为正整数");
    if (seq <= (this.file.seq[me.id] ?? 0)) return { scope: "none" };
    ensure(
      c && typeof c === "object" && typeof c.type === "string",
      "无效操作",
    );
    ensure(String(c.type) !== "TIMEOUT", "超时只能由服务器触发");
    ensure(!("actor" in c), "不能指定服务器身份");
    ensure(!("now" in c), "不能指定服务器时间");
    ensure(!("seq" in c), "序号必须放在请求外层");
    ensure(version === this.file.version, "状态已更新，请重新同步");
    const seat = this.file.players.findIndex((p) => p.id === me.id);
    const host = seat === 0;
    if (["SET_SETTINGS", "START", "NEXT_GAME"].includes(c.type))
      ensure(host, "只有房主可以操作");
    return this.transaction(() => {
      let scope: Change["scope"] = "public";
      let error: string | undefined;
      if (this.file.state) {
        ensure(GAME.has(c.type), "对局进行中不能修改大厅设置");
        const state = this.file.state;
        if (c.type === "NEXT_GAME") {
          ensure(state.phase === "FINISHED", "本局尚未结束");
          ensure(state.game < this.file.games, "约定局数已结束");
        } else ensure(seat === state.current, "尚未轮到你");
        const actor = c.type === "NEXT_GAME" ? state.current : seat;
        const cmd = {
          ...c,
          actor,
          seq: (state.seq[String(actor)] ?? 0) + 1,
          now,
        } as Command;
        const next = reduceRK(state, cmd);
        this.file.state = next;
        scope =
          PRIVATE.has(c.type) &&
          next.current === state.current &&
          next.phase === state.phase
            ? "private"
            : "public";
        if (
          next.lastAction?.type === "INVALID" ||
          next.lastAction?.type === "TIMEOUT"
        ) {
          if (next.current !== state.current || next.phase !== state.phase)
            error = next.lastAction.error;
        }
      } else {
        switch (c.type) {
          case "SET_SETTINGS": {
            const previousVariant = this.file.variant ?? "classic";
            const variant = c.variant ?? previousVariant;
            ensure(variant === "classic" || variant === "xp", "未知拉密玩法");
            const count =
                c.count ??
                (variant === previousVariant
                  ? this.file.count
                  : variant === "xp"
                    ? 5
                    : Math.max(2, this.file.players.length)),
              minutes = c.minutes ?? this.file.minutes,
              games =
                c.games ??
                (this.file.games === this.file.count ? count : this.file.games);
            ensure(
              Number.isInteger(count) &&
                count >= (variant === "xp" ? 5 : 2) &&
                count <= (variant === "xp" ? 6 : 4) &&
                count >= this.file.players.length,
              variant === "xp"
                ? "XP 人数须为 5–6 且不少于已入座人数"
                : "人数须为 2–4 且不少于已入座人数",
            );
            ensure(
              [0, 1, 2].includes(minutes),
              "计时只能为 1 分钟、2 分钟或不限",
            );
            ensure(
              Number.isInteger(games) && games >= 1 && games <= 100,
              "局数须为 1–100",
            );
            this.file.count = count;
            this.file.variant = variant;
            this.file.minutes = minutes;
            this.file.games = games;
            this.file.players.forEach((p) => (p.ready = false));
            break;
          }
          case "READY":
            this.file.players[seat].ready = !this.file.players[seat].ready;
            break;
          case "START": {
            ensure(
              this.file.players.length === this.file.count &&
                this.file.players.every((p) => p.ready),
              "人数未满或有人尚未准备",
            );
            ensure(
              c.seed === undefined || this.options.allowFixedSeed,
              "生产房间不能指定随机种子",
            );
            this.file.state = createRK(
              this.file.players.map((p) => p.name),
              {
                seed: c.seed ?? randomInt(0x100000000),
                minutes: this.file.minutes,
                now,
                assertions: true,
                variant: this.file.variant ?? "classic",
              },
            );
            break;
          }
          case "LEAVE":
            this.file.players.splice(seat, 1);
            delete this.file.revisions[me.id];
            break;
          default:
            throw Error("请先开始对局");
        }
      }
      this.file.seq[me.id] = seq;
      if (scope === "public") this.file.version++;
      else this.file.revisions[me.id] = (this.file.revisions[me.id] ?? 0) + 1;
      return { scope, ...(error ? { error } : {}) };
    });
  }
  tick(now = Date.now()) {
    const s = this.file.state;
    if (s?.phase !== "PLAYING" || s.deadline === null || now < s.deadline)
      return false;
    return this.transaction(() => {
      this.file.state = reduceRK(s, {
        type: "TIMEOUT",
        actor: "server",
        seq: (s.seq.server ?? 0) + 1,
        now,
      });
      this.file.version++;
      return true;
    });
  }
  snapshot(token?: string, now = Date.now()): RKSnapshot {
    const me = this.me(token);
    const seat = me ? this.file.players.findIndex((p) => p.id === me.id) : -1;
    return {
      code: this.file.code,
      version: this.file.version,
      mySeat: me?.id ?? null,
      hostId: this.file.players[0]?.id ?? null,
      count: this.file.count,
      variant: this.file.variant ?? "classic",
      minutes: this.file.minutes,
      games: this.file.games,
      players: this.file.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        seat: i,
        ready: p.ready,
        connected: (this.connections.get(p.id) ?? 0) > 0,
      })),
      view: me && this.file.state ? viewForRK(this.file.state, seat) : null,
      serverNow: now,
      ...(me
        ? {
            nextSeq: (this.file.seq[me.id] ?? 0) + 1,
            privateRevision: this.file.revisions[me.id] ?? 0,
          }
        : {}),
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
export function attachRummikub(
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
  const rooms = new Map<string, RKRoom>();
  const clock = opts.clock ?? Date.now;
  for (const name of readdirSync(directory)) {
    if (!/^[A-Z2-9]{4}\.json$/.test(name)) continue;
    try {
      const f = JSON.parse(
        readFileSync(join(directory, name), "utf8"),
      ) as RKFile;
      f.variant ??= "classic";
      ensure(
        f.schema === 1 &&
          f.game === "rummikub" &&
          f.code + ".json" === name &&
          Array.isArray(f.players) &&
          f.players.every(
            (p) => typeof p.token === "string" && typeof p.id === "string",
          ),
        "存档结构无效",
      );
      if (f.state) {
        f.state.variant ??= "classic";
        ensure(f.state.variant === f.variant, "存档玩法不匹配");
        ensure(f.state.players.length === f.players.length, "存档座位不匹配");
        assertInvariants(f.state);
      }
      ensure(
        (f.variant === "classic" && f.count >= 2 && f.count <= 4) ||
          (f.variant === "xp" && f.count >= 5 && f.count <= 6),
        "存档人数或玩法无效",
      );
      ensure(
        Number.isInteger(f.count) && f.players.length <= f.count,
        "存档座位数无效",
      );
      rooms.set(f.code, new RKRoom(f, directory, opts));
    } catch {
      console.warn("无法恢复拉密房间", name);
    }
  }
  const channel = (code: string) => "rk:" + code;
  const broadcast = (r: RKRoom, onlyToken?: string) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r.file.code)) ?? []) {
      const s = io.sockets.sockets.get(id);
      if (s && (!onlyToken || s.data.rkToken === onlyToken))
        s.emit(E.update, r.snapshot(s.data.rkToken, clock()));
    }
  };
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      try {
        if (r.tick(clock())) broadcast(r);
      } catch {
        console.warn("拉密房间计时保存失败", code);
      }
      if (
        Date.now() - r.file.updatedAt > opts.idleMs &&
        !io.sockets.adapter.rooms.get(channel(code))?.size
      ) {
        rooms.delete(code);
        rmSync(join(directory, code + ".json"), { force: true });
      }
    }
  }, opts.tickMs ?? 500);
  timer.unref();
  const close = () => clearInterval(timer);
  io.engine.on("close", close);
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const r = socket.data.rkRoom as RKRoom | undefined;
      if (r) {
        const p = r.me(socket.data.rkToken);
        if (p)
          r.connections.set(
            p.id,
            Math.max(0, (r.connections.get(p.id) ?? 1) - 1),
          );
        socket.leave(channel(r.file.code));
        broadcast(r);
      }
      socket.data.rkRoom = undefined;
      socket.data.rkToken = undefined;
    };
    const attach = (r: RKRoom, token?: string) => {
      leave();
      socket.data.rkRoom = r;
      socket.data.rkToken = token;
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
      const r = RKRoom.create(code, directory, opts);
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
      ensure(!r.me(socket.data.rkToken), "已经入座");
      const claimed = r.claim(req.name);
      attach(r, claimed.token);
      broadcast(r);
      return { ...claimed, snapshot: r.snapshot(claimed.token, clock()) };
    });
    handle(E.action, (req) => {
      const r = find(req.code);
      ensure(
        socket.data.rkRoom === r &&
          socket.data.rkToken === req.token &&
          r.me(req.token),
        "请重新连接房间",
      );
      if (r.tick(clock())) {
        broadcast(r);
        return {
          ok: false,
          error: "回合已到时，请同步后再操作",
          consumed: false,
          snapshot: r.snapshot(req.token, clock()),
        };
      }
      const changed = r.action(
        req.token,
        req.version,
        req.seq,
        req.action,
        clock(),
      );
      if (changed.scope === "public") broadcast(r);
      else if (changed.scope === "private") broadcast(r, req.token);
      return {
        ok: !changed.error,
        ...(changed.error ? { error: changed.error } : {}),
        consumed: changed.scope !== "none",
        snapshot: r.snapshot(req.token, clock()),
      };
    });
    socket.on("disconnect", leave);
  });
  return { rooms, close };
}
