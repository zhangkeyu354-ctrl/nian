import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  createDM,
  defaultPool,
  randomRoles,
  reduceDM,
  validatePool,
  viewDM,
  actorsDM,
  type DMState,
} from "../../../packages/dying-message/src/index.ts";
import evidence from "../../../packages/dying-message/src/evidence.json" with { type: "json" };
import {
  DM_EVENTS,
  type DMAction,
  type DMSnapshot,
} from "../../../packages/shared/src/dm-protocol.ts";
interface Seat {
  id: string;
  name: string;
  token: string;
  ready: boolean;
}
interface File {
  game: "dying-message";
  code: string;
  version: number;
  count: number;
  pool: string[];
  players: Seat[];
  state: DMState | null;
  createdAt: number;
  updatedAt: number;
}
export class DMRoom {
  connections = new Map<string, number>();
  constructor(
    public file: File,
    public directory: string,
  ) {}
  static create(code: string, directory: string) {
    return new DMRoom(
      {
        game: "dying-message",
        code,
        version: 0,
        count: 4,
        pool: defaultPool(4),
        players: [],
        state: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      directory,
    );
  }
  me(token: string | undefined) {
    return token ? this.file.players.find((p) => p.token === token) : undefined;
  }
  claim(name: string) {
    if (this.file.state) throw Error("对局已开始");
    const clean = String(name ?? "")
      .trim()
      .slice(0, 12);
    if (!clean) throw Error("请填写昵称");
    if (this.file.players.length >= this.file.count) throw Error("房间已满");
    const p = {
      id: randomBytes(12).toString("hex"),
      name: clean,
      token: randomBytes(32).toString("hex"),
      ready: false,
    };
    this.file.players.push(p);
    this.file.version++;
    this.save();
    return { token: p.token, playerId: p.id };
  }
  action(token: string, version: number, c: DMAction, now = Date.now()) {
    if (!c || typeof c !== "object" || typeof c.type !== "string")
      throw Error("无效操作");
    const p = this.me(token);
    if (!p) throw Error("入座凭证无效");
    if (version !== this.file.version) throw Error("状态已更新，请重试");
    const host = this.file.players[0]?.id === p.id;
    if (["SET_COUNT", "SET_POOL", "START", "RESTART"].includes(c.type) && !host)
      throw Error("只有房主可以操作");
    if (c.type === "RESTART") {
      if (this.file.state?.phase !== "GAME_OVER") throw Error("对局尚未结束");
      this.file.state = null;
      this.file.players.forEach((p) => (p.ready = false));
    } else if (this.file.state) {
      if (c.type === "SPEAK_TIMEOUT") throw Error("仅服务器处理到时");
      this.file.state = reduceDM(this.file.state, p.id, c, now);
    } else
      switch (c.type) {
        case "SET_COUNT": {
          const n = (c as { count: number }).count;
          if (this.file.players.length > n) throw Error("人数少于已入座玩家");
          this.file.count = defaultPool(n).length;
          this.file.pool = defaultPool(n);
          this.file.players.forEach((p) => (p.ready = false));
          break;
        }
        case "SET_POOL": {
          const pool = (c as { pool: string[] }).pool;
          validatePool(pool, this.file.count);
          this.file.pool = [...pool];
          this.file.players.forEach((p) => (p.ready = false));
          break;
        }
        case "READY":
          p.ready = !p.ready;
          break;
        case "START": {
          if (
            this.file.players.length !== this.file.count ||
            !this.file.players.every((p) => p.ready)
          )
            throw Error("人数未满或有人尚未准备");
          const seed = randomInt(0x100000000);
          this.file.state = createDM(
            this.file.players,
            evidence.filter((a) => a.enabled).map((a) => a.id),
            seed,
            randomRoles(this.file.pool, seed ^ 0x7e3a29),
          );
          if (this.file.state.phase === "INVESTIGATION")
            this.file.state.deadline = now + 300000;
          break;
        }
        case "LEAVE":
          this.file.players = this.file.players.filter((x) => x.id !== p.id);
          break;
        default:
          throw Error("请先开始对局");
      }
    this.file.version++;
    this.save();
  }
  tick(now = Date.now()) {
    const s = this.file.state;
    if (
      s?.phase === "SPECIAL_INFORMATION" &&
      s.deadline !== null &&
      now >= s.deadline
    ) {
      this.file.state = reduceDM(s, actorsDM(s)[0], { type: "INFO_ACK" }, now);
      this.file.version++;
      this.save();
      return true;
    }
    if (
      s?.phase !== "INVESTIGATION" ||
      !s.speaker ||
      s.deadline === null ||
      now < s.deadline
    )
      return false;
    this.file.state = reduceDM(s, s.speaker, { type: "SPEAK_TIMEOUT" }, now);
    this.file.version++;
    this.save();
    return true;
  }
  snapshot(token?: string): DMSnapshot {
    const me = this.me(token);
    return {
      code: this.file.code,
      version: this.file.version,
      mySeat: me?.id ?? null,
      hostId: this.file.players[0]?.id ?? null,
      count: this.file.count,
      pool: this.file.pool,
      players: this.file.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        seat: i + 1,
        ready: p.ready,
        connected: (this.connections.get(p.id) ?? 0) > 0,
      })),
      view: me && this.file.state ? viewDM(this.file.state, me.id) : null,
      serverNow: Date.now(),
    };
  }
  save() {
    this.file.updatedAt = Date.now();
    mkdirSync(this.directory, { recursive: true });
    const file = join(this.directory, this.file.code + ".json");
    writeFileSync(file + ".tmp", JSON.stringify(this.file));
    renameSync(file + ".tmp", file);
  }
}
export function attachDyingMessage(
  io: Server,
  directory: string,
  opts: { maxRooms: number; idleMs: number },
) {
  mkdirSync(directory, { recursive: true });
  const rooms = new Map<string, DMRoom>();
  for (const name of readdirSync(directory)) {
    if (!/^[A-Z2-9]{4}\.json$/.test(name)) continue;
    try {
      const file = JSON.parse(
        readFileSync(join(directory, name), "utf8"),
      ) as File;
      if (file.game === "dying-message")
        rooms.set(file.code, new DMRoom(file, directory));
    } catch {
      console.warn("无法恢复遗言房间", name);
    }
  }
  const channel = (code: string) => "dm:" + code;
  const broadcast = (r: DMRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r.file.code)) ?? []) {
      const socket = io.sockets.sockets.get(id);
      if (socket)
        socket.emit(DM_EVENTS.update, r.snapshot(socket.data.dmToken));
    }
  };
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      if (r.tick()) broadcast(r);
      if (
        Date.now() - r.file.updatedAt > opts.idleMs &&
        !io.sockets.adapter.rooms.get(channel(code))?.size
      ) {
        rooms.delete(code);
        rmSync(join(directory, code + ".json"), { force: true });
      }
    }
  }, 1000);
  timer.unref();
  io.engine.on("close", () => clearInterval(timer));
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const r = socket.data.dmRoom as DMRoom | undefined;
      if (r) {
        const me = r.me(socket.data.dmToken);
        if (me)
          r.connections.set(
            me.id,
            Math.max(0, (r.connections.get(me.id) ?? 1) - 1),
          );
        socket.leave(channel(r.file.code));
        broadcast(r);
      }
      socket.data.dmRoom = null;
      socket.data.dmToken = undefined;
    };
    const attach = (r: DMRoom, token?: string) => {
      leave();
      socket.data.dmRoom = r;
      socket.data.dmToken = r.me(token) ? token : undefined;
      const me = r.me(token);
      if (me) r.connections.set(me.id, (r.connections.get(me.id) ?? 0) + 1);
      socket.join(channel(r.file.code));
    };
    const handle = (event: string, fn: (req: any) => unknown) =>
      socket.on(event, (req: any, ack: any) => {
        if (typeof ack !== "function") return;
        try {
          ack({ ok: true, ...(fn(req ?? {}) as object) });
        } catch (e) {
          ack({
            ok: false,
            error: e instanceof Error ? e.message : "操作失败",
          });
        }
      });
    const find = (code: unknown) => {
      const r = rooms.get(String(code ?? "").toUpperCase());
      if (!r) throw Error("房间不存在");
      return r;
    };
    handle(DM_EVENTS.create, () => {
      if (rooms.size >= opts.maxRooms) throw Error("房间数量已满");
      let code: string;
      do {
        code = Array.from(
          { length: 4 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
        ).join("");
      } while (rooms.has(code));
      const r = DMRoom.create(code, directory);
      r.save();
      rooms.set(code, r);
      return { code };
    });
    handle(DM_EVENTS.join, (req) => {
      const r = find(req.code);
      r.tick();
      attach(r, req.token);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    handle(DM_EVENTS.claim, (req) => {
      const r = find(req.code);
      if (r.me(socket.data.dmToken)) throw Error("已经入座");
      const claim = r.claim(req.name);
      attach(r, claim.token);
      broadcast(r);
      return claim;
    });
    handle(DM_EVENTS.action, (req) => {
      const r = find(req.code);
      if (socket.data.dmRoom !== r || socket.data.dmToken !== req.token)
        throw Error("请重新连接房间");
      if (r.tick()) {
        broadcast(r);
        throw Error("发言已到时，状态已更新");
      }
      r.action(req.token, req.version, req.action);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    socket.on("disconnect", leave);
  });
  return { rooms };
}
