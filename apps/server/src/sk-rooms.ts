import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  DEFAULT_SETTINGS,
  SCHEDULES,
  type SKSettings,
  createSK,
  reduceSK,
  viewForSK,
  assertInvariants,
  type SKState,
  type Command,
} from "../../../packages/skull-king/src/index.ts";
import { botMove } from "../../../packages/skull-king/src/bot.ts";
import { SK_EVENTS as E, SK_EMOTES, type SKAction, type SKSnapshot } from "../../../packages/shared/src/sk-protocol.ts";

interface Seat { id: string; name: string; token: string; ready: boolean; bot?: boolean }
export interface SKFile {
  schema: 1;
  game: "skull-king";
  code: string;
  version: number;
  count: number;
  settings: SKSettings;
  players: Seat[];
  state: SKState | null;
  seq: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}
interface Options { allowFixedSeed?: boolean }
function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error(msg);
}
const GAME = new Set(["BID", "SHOT", "PLAY", "ROSIE", "BENDT", "RASCAL", "JUANITA", "HARRY", "NEXT_ROUND"]);

export class SKRoom {
  connections = new Map<string, number>();
  constructor(public file: SKFile, public directory: string, public options: Options = {}) {}
  static create(code: string, directory: string, options: Options = {}) {
    ensure(/^[A-Z2-9]{4}$/.test(code), "房间号无效");
    return new SKRoom(
      { schema: 1, game: "skull-king", code, version: 0, count: 4, settings: { ...DEFAULT_SETTINGS }, players: [], state: null, seq: {}, createdAt: Date.now(), updatedAt: Date.now() },
      directory,
      options,
    );
  }
  me(token: unknown) {
    return typeof token === "string" ? this.file.players.find((p) => p.token === token) : undefined;
  }
  private transaction<T>(fn: () => T): T {
    const previous = this.file;
    this.file = structuredClone(previous);
    try {
      const r = fn();
      this.save();
      return r;
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
      const p = { id: randomBytes(12).toString("hex"), token: randomBytes(32).toString("hex"), name: name.trim().slice(0, 12), ready: false };
      this.file.players.push(p);
      this.file.version++;
      return { token: p.token, playerId: p.id };
    });
  }
  action(token: string, version: number, seq: number, c: SKAction, now = Date.now()) {
    const me = this.me(token);
    ensure(me, "入座凭证无效");
    ensure(c && typeof c === "object" && typeof c.type === "string", "无效操作");
    ensure(!("actor" in c), "不能指定身份");
    ensure(Number.isSafeInteger(seq) && seq > 0, "seq必须为正整数");
    const previous = this.file.seq[me.id] ?? 0;
    if (seq <= previous) return { changed: false };
    ensure(seq === previous + 1, "操作序号不连续，请同步状态");
    ensure(version === this.file.version, "状态已更新，请重新同步");
    const seat = this.file.players.findIndex((p) => p.id === me.id);
    if (["SET_SETTINGS", "START", "REMATCH", "ADD_BOT", "REMOVE_BOT"].includes(c.type)) ensure(seat === 0, "只有房主可以操作");
    return this.transaction(() => {
      if (c.type === "REMATCH") {
        ensure(this.file.state?.phase === "FINISHED", "本局尚未结束");
        this.file.state = null;
        this.file.players.forEach((p) => (p.ready = !!p.bot));
      } else if (this.file.state) {
        ensure(GAME.has(c.type), "对局进行中不能修改大厅设置");
        this.file.state = reduceSK(this.file.state, { ...(c as object), actor: seat } as Command);
      } else
        switch (c.type) {
          case "SET_SETTINGS": {
            const count = c.count ?? this.file.count;
            ensure(Number.isInteger(count) && count >= 2 && count <= 8 && count >= this.file.players.length, "人数须为2至8且不少于已入座人数");
            const next: SKSettings = { ...this.file.settings };
            for (const k of ["kraken", "whale", "loot", "abilities", "cannon"] as const) if (typeof c[k] === "boolean") next[k] = c[k];
            if (c.scoring !== undefined) {
              ensure(c.scoring === "skull" || c.scoring === "rascal", "计分方式无效");
              next.scoring = c.scoring;
            }
            if (next.scoring !== "rascal") next.cannon = false;
            if (c.schedule !== undefined) {
              ensure(c.schedule in SCHEDULES, "轮数方案无效");
              next.schedule = c.schedule;
            }
            this.file.count = count;
            this.file.settings = next;
            this.file.players.forEach((p) => (p.ready = !!p.bot));
            break;
          }
          case "ADD_BOT": {
            ensure(this.file.players.length < this.file.count, "房间已满");
            const used = new Set(this.file.players.map((p) => p.name));
            const name = ["人机·独眼", "人机·木腿", "人机·铁钩", "人机·红胡子", "人机·鹦鹉", "人机·大副", "人机·水手"].find((n) => !used.has(n)) ?? "人机";
            this.file.players.push({ id: randomBytes(12).toString("hex"), token: "bot:" + randomBytes(16).toString("hex"), name, ready: true, bot: true });
            break;
          }
          case "REMOVE_BOT": {
            ensure(this.file.players[c.seat]?.bot, "这个座位不是人机");
            this.file.players.splice(c.seat, 1);
            break;
          }
          case "READY":
            this.file.players[seat].ready = !this.file.players[seat].ready;
            break;
          case "START":
            ensure(this.file.players.length === this.file.count && this.file.players.every((p) => p.ready), "人数未满或有人尚未准备");
            ensure(c.seed === undefined || this.options.allowFixedSeed, "生产房间不能指定随机种子");
            this.file.state = createSK(this.file.players.map((p) => p.name), { seed: c.seed ?? randomInt(0x100000000), settings: this.file.settings });
            break;
          case "LEAVE":
            this.file.players.splice(seat, 1);
            this.file.players.forEach((p) => (p.ready = !!p.bot));
            break;
          default:
            throw Error("请先开始对局");
        }
      this.file.seq[me.id] = seq;
      this.file.version++;
      return { changed: true };
    });
  }
  /** 轮到人机时自动行动；返回是否有变化 */
  botTick(now = Date.now()) {
    const st = this.file.state;
    if (!st || st.phase === "FINISHED") return false;
    let seat = -1;
    if (st.phase === "BID") seat = st.players.findIndex((p, i) => p.bid === null && this.file.players[i]?.bot);
    else if (st.phase === "SHOT") seat = st.players.findIndex((p, i) => p.shot === null && this.file.players[i]?.bot);
    else if (st.phase === "ABILITY") seat = st.ability && this.file.players[st.ability.seat]?.bot ? st.ability.seat : -1;
    else if (st.phase === "PLAY") seat = this.file.players[st.order[st.trick.length]]?.bot ? st.order[st.trick.length] : -1;
    else if (st.phase === "ROUND_END") seat = this.file.players[0]?.bot ? 0 : -1;
    if (seat < 0) return false;
    // 一墩刚结束时多等一会，让大家看清结果
    const wait = st.phase === "PLAY" && st.trick.length === 0 && st.tricks.length ? 3000 : st.phase === "BID" ? 1200 : 1700;
    if (now - this.file.updatedAt < wait) return false;
    return this.transaction(() => {
      this.file.state = reduceSK(st, st.phase === "ROUND_END" ? { type: "NEXT_ROUND", actor: 0 } : botMove(st, seat));
      this.file.version++;
      return true;
    });
  }
  snapshot(token?: string, now = Date.now()): SKSnapshot {
    const me = this.me(token);
    const seat = me ? this.file.players.findIndex((p) => p.id === me.id) : -1;
    return {
      code: this.file.code,
      version: this.file.version,
      mySeat: me?.id ?? null,
      hostId: this.file.players[0]?.id ?? null,
      count: this.file.count,
      settings: this.file.settings,
      players: this.file.players.map((p, seat) => ({ id: p.id, name: p.name, seat, ready: p.ready, bot: !!p.bot, connected: (this.connections.get(p.id) ?? 0) > 0 })),
      view: me && this.file.state ? viewForSK(this.file.state, seat) : null,
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

export function attachSkullKing(io: Server, directory: string, opts: { maxRooms: number; idleMs: number; allowFixedSeed?: boolean }) {
  mkdirSync(directory, { recursive: true });
  const rooms = new Map<string, SKRoom>();
  for (const name of readdirSync(directory)) {
    if (!/^[A-Z2-9]{4}\.json$/.test(name)) continue;
    try {
      const f = JSON.parse(readFileSync(join(directory, name), "utf8")) as SKFile;
      ensure(f.schema === 1 && f.game === "skull-king" && f.code + ".json" === name && f.count >= 2 && f.count <= 8 && Array.isArray(f.players), "存档结构无效");
      if (f.state) assertInvariants(f.state);
      rooms.set(f.code, new SKRoom(f, directory, opts));
    } catch {
      console.warn("无法恢复骷髅王房间", name);
    }
  }
  const channel = (code: string) => "sk:" + code;
  const broadcast = (r: SKRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r.file.code)) ?? []) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit(E.update, r.snapshot(s.data.skToken));
    }
  };
  const botTimer = setInterval(() => {
    for (const r of rooms.values())
      try {
        if (r.botTick()) broadcast(r);
      } catch (e) {
        console.warn("骷髅王人机出错", r.file.code, e);
      }
  }, 300);
  botTimer.unref();
  const timer = setInterval(() => {
    for (const [code, r] of rooms)
      if (Date.now() - r.file.updatedAt > opts.idleMs && !io.sockets.adapter.rooms.get(channel(code))?.size) {
        rooms.delete(code);
        rmSync(join(directory, code + ".json"), { force: true });
      }
  }, 60_000);
  timer.unref();
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const r = socket.data.skRoom as SKRoom | undefined;
      if (r) {
        const p = r.me(socket.data.skToken);
        if (p) r.connections.set(p.id, Math.max(0, (r.connections.get(p.id) ?? 1) - 1));
        socket.leave(channel(r.file.code));
        broadcast(r);
      }
      socket.data.skRoom = undefined;
      socket.data.skToken = undefined;
    };
    const attach = (r: SKRoom, token?: string) => {
      leave();
      socket.data.skRoom = r;
      socket.data.skToken = token;
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
          ack({ ok: false, error: e instanceof Error ? e.message : "操作失败" });
        }
      });
    const find = (code: unknown) => {
      const r = typeof code === "string" ? rooms.get(code.toUpperCase()) : undefined;
      ensure(r, "房间不存在");
      return r;
    };
    handle(E.create, () => {
      ensure(rooms.size < opts.maxRooms, "房间数量已满");
      let code: string;
      do code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");
      while (rooms.has(code));
      const r = SKRoom.create(code, directory, opts);
      r.save();
      rooms.set(code, r);
      return { code };
    });
    handle(E.join, (req) => {
      const r = find(req.code);
      if (req.token !== undefined) ensure(r.me(req.token), "入座凭证无效");
      attach(r, req.token);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    handle(E.claim, (req) => {
      const r = find(req.code);
      ensure(!r.me(socket.data.skToken), "已经入座");
      const claim = r.claim(req.name);
      attach(r, claim.token);
      broadcast(r);
      return { ...claim, snapshot: r.snapshot(claim.token) };
    });
    handle(E.action, (req) => {
      const r = find(req.code);
      ensure(socket.data.skRoom === r && socket.data.skToken === req.token && r.me(req.token), "请重新连接房间");
      try {
        const change = r.action(req.token, req.version, req.seq, req.action);
        if (change.changed) {
          if (!r.me(req.token)) attach(r);
          broadcast(r);
        }
        return { consumed: change.changed, snapshot: r.snapshot(socket.data.skToken) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "操作失败", consumed: false, snapshot: r.snapshot(req.token) };
      }
    });
    let lastEmote = 0;
    handle(E.emote, (req) => {
      const r = socket.data.skRoom as SKRoom | undefined;
      const me = r?.me(socket.data.skToken);
      ensure(r && me, "请先入座");
      ensure((SK_EMOTES as readonly string[]).includes(req.emoji), "表情无效");
      const now = Date.now();
      ensure(now - lastEmote > 1200, "发太快了");
      lastEmote = now;
      const seat = r.file.players.findIndex((p) => p.id === me.id);
      io.to(channel(r.file.code)).emit(E.emoted, { seat, emoji: req.emoji, at: now });
      return {};
    });
    socket.on("disconnect", leave);
  });
  return { rooms, close: () => (clearInterval(timer), clearInterval(botTimer)) };
}
