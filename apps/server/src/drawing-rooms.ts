import { randomBytes, randomInt } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  act,
  tick,
  viewFor,
  startGame,
  gameScope,
  taskFor,
  emptyDrawing,
  appendChunk,
  type Game,
  type Mode,
  type Chunk,
  type Action,
} from "../../../packages/drawing-party/src/index.ts";
interface Seat {
  id: string;
  name: string;
  token: string;
  ready: boolean;
}
interface Saved {
  code: string;
  mode: Mode;
  count: number;
  host: string;
  players: Seat[];
  game: Game | null;
  updated: number;
  receipts: string[];
}
export class DrawingRoom {
  file: Saved;
  writers = new Map<string, string>();
  connections = new Map<string, Set<string>>();
  constructor(
    public directory: string,
    file: Saved,
  ) {
    this.file = file;
  }
  static create(directory: string, mode: Mode, count: number, code: string) {
    return new DrawingRoom(directory, {
      code,
      mode,
      count,
      host: "",
      players: [],
      game: null,
      updated: Date.now(),
      receipts: [],
    });
  }
  player(token: unknown) {
    return typeof token === "string"
      ? this.file.players.find((p) => p.token === token)
      : undefined;
  }
  save() {
    mkdirSync(this.directory, { recursive: true });
    const path = join(this.directory, this.file.code + ".json");
    this.file.updated = Date.now();
    writeFileSync(path + ".tmp", JSON.stringify(this.file));
    renameSync(path + ".tmp", path);
    writeFileSync(path + ".ink", ""); // snapshot atomically precedes log truncation; ink revisions deduplicate replay
  }
  static load(directory: string, code: string) {
    const path = join(directory, code + ".json");
    const f = JSON.parse(readFileSync(path, "utf8")) as Saved;
    const r = new DrawingRoom(directory, f),
      log = path + ".ink";
    if (existsSync(log) && f.game) {
      for (const line of readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)) {
        let e: any;
        try {
          e = JSON.parse(line);
        } catch {
          break;
        } // incomplete final write has never been acknowledged
        if (e.game !== f.game.id) continue;
        const d = (f.game.drawings[e.doc] ??= emptyDrawing(f.game.paperAspect));
        if (d.revision >= e.revision) continue;
        if (d.revision !== e.revision - 1) throw Error("画作日志缺口");
        appendChunk(d, e.chunk);
      }
    }
    return r;
  }
  claim(name: unknown) {
    if (this.file.game) throw Error("对局已开始");
    if (this.file.players.length >= this.file.count) throw Error("房间已满");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 12)
      throw Error("昵称需要1–12字");
    const p = {
      id: randomBytes(12).toString("hex"),
      token: randomBytes(32).toString("hex"),
      name: name.trim(),
      ready: false,
    };
    this.file.players.push(p);
    this.file.host ||= p.id;
    this.save();
    return p;
  }
  snapshot(token?: unknown) {
    const p = this.player(token),
      f = this.file;
    return {
      code: f.code,
      mode: f.mode,
      count: f.count,
      host: f.host,
      me: p?.id ?? null,
      players: f.players.map(({ token, ...p }) => ({
        ...p,
        connected: !!this.connections.get(p.id)?.size,
      })),
      view: f.game ? viewFor(f.game, p?.id ?? "") : null,
      serverNow: Date.now(),
      ephemeral: !!process.env.RENDER_EXTERNAL_URL,
    };
  }
  scope() {
    const g = this.file.game;
    return g ? gameScope(g) : "lobby";
  }
  apply(p: Seat, req: any, now = Date.now()) {
    if (typeof req.op !== "string" || req.op.length > 100)
      throw Error("操作标识无效");
    const key = p.id + ":" + req.op;
    if (this.file.receipts.includes(key)) return;
    if (req.scope !== this.scope()) throw Error("阶段已变化，请重试");
    const a = req.action;
    if (!a || typeof a.type !== "string") throw Error("无效操作");
    const host = p.id === this.file.host;
    if (
      [
        "COUNT",
        "START",
        "RESTART",
        "NEXT",
        "FINISH_DISCUSSION",
        "ABORT",
      ].includes(a.type) &&
      !host
    )
      throw Error("仅房主操作");
    if (a.type === "ABORT") {
      if (!this.file.game) throw Error("尚未开局");
      this.file.game = null;
      this.file.players.forEach((p) => (p.ready = false));
    } else if (a.type === "RESTART") {
      if (this.file.game?.phase !== "RESULT") throw Error("请先结束本局");
      this.file.game = null;
      this.file.players.forEach((p) => (p.ready = false));
    } else if (a.type === "TAKE_HOST") {
      if (this.connections.get(this.file.host)?.size) throw Error("房主仍在线");
      this.file.host = p.id;
    } else if (this.file.game) {
      this.file.game = act(
        this.file.game,
        ["NEXT", "FINISH_DISCUSSION"].includes(a.type)
          ? this.file.game.players[0].id
          : p.id,
        a as Action,
        now,
      );
    } else if (a.type === "COUNT") {
      if (
        !Number.isInteger(a.count) ||
        a.count < 3 ||
        a.count > 10 ||
        a.count < this.file.players.length
      )
        throw Error("人数需为3–10且不少于已入座人数");
      this.file.count = a.count;
      this.file.players.forEach((p) => (p.ready = false));
    } else if (a.type === "READY") p.ready = !p.ready;
    else if (a.type === "LEAVE") {
      this.file.players = this.file.players.filter((x) => x.id !== p.id);
      if (this.file.host === p.id)
        this.file.host = this.file.players[0]?.id ?? "";
      this.file.players.forEach((p) => (p.ready = false));
    } else if (a.type === "START") {
      if (
        this.file.players.length !== this.file.count ||
        this.file.players.some((p) => !p.ready)
      )
        throw Error("请等到人齐且全部准备");
      this.file.game = startGame(
        this.file.mode,
        this.file.players.map(({ id, name }) => ({ id, name })),
        now,
        {
          fakeIndex: randomInt(this.file.count),
          wordIndex: randomInt(90),
          optionOffset: randomInt(18),
          categoryVote: true,
          categoryTieSeed: randomInt(60),
          ...(this.file.mode === "tp"
            ? { themeTieSeed: randomInt(420), themeRandomIndex: randomInt(5) }
            : {}),
        },
      );
      this.file.game.id = randomBytes(16).toString("hex");
    } else throw Error("请先开始游戏");
    this.file.receipts.push(key);
    this.file.receipts = this.file.receipts.slice(-1000);
    this.save();
  }
  expire(now = Date.now()) {
    if (!this.file.game) return false;
    const next = tick(this.file.game, now);
    if (next === this.file.game) return false;
    this.file.game = next;
    this.save();
    return true;
  }
  ink(p: Seat, req: any) {
    const g = this.file.game;
    if (!g || req.scope !== this.scope()) throw Error("任务已过期");
    let doc: string;
    if (g.mode === "tp") {
      const t = taskFor(g, p.id);
      if (!t || t.kind !== "drawing" || g.done.includes(p.id))
        throw Error("当前不能绘画");
      doc = t.id;
    } else {
      if (
        g.phase !== "DRAW" ||
        g.players[g.turn % g.players.length].id !== p.id
      )
        throw Error("不是你的绘画回合");
      doc = "shared";
    }
    const c = structuredClone(req.chunk) as Chunk;
    if (g.mode === "fa") {
      c.id = g.id + "-turn-" + g.turn;
      c.color = g.players.findIndex((x) => x.id === p.id);
      c.width = 8;
      if (c.points?.length > 128) throw Error("分片过大");
    }
    const old = g.drawings[doc] ?? emptyDrawing(g.paperAspect),
      d = structuredClone(old);
    appendChunk(d, c);
    if (d.revision === old.revision)
      return { doc, chunk: c, revision: d.revision, changed: false };
    if (g.mode === "fa" && d.strokes.at(-1)!.points.length > 1800)
      throw Error("本回合点数过多");
    const e = { game: g.id, doc, chunk: c, revision: d.revision };
    appendFileSync(
      join(this.directory, this.file.code + ".json.ink"),
      JSON.stringify(e) + "\n",
    );
    g.drawings[doc] = d;
    this.file.updated = Date.now();
    return { ...e, changed: true };
  }
  edit(p: Seat, req: any) {
    const g = this.file.game,
      t = g && taskFor(g, p.id);
    if (
      !g ||
      g.mode !== "tp" ||
      !t ||
      t.kind !== "drawing" ||
      g.done.includes(p.id) ||
      req.scope !== this.scope()
    )
      throw Error("不能修改当前画作");
    const d = (g.drawings[t.id] ??= emptyDrawing(g.paperAspect));
    if (req.revision !== d.revision) throw Error("画作正在保存，请稍后重试");
    if (req.kind === "undo") d.strokes.pop();
    else if (req.kind === "clear") d.strokes = [];
    else throw Error("无效修改");
    d.revision++;
    this.save();
  }
}
export function attachDrawingParty(io: Server, directory: string) {
  mkdirSync(directory, { recursive: true });
  const rooms = new Map<string, DrawingRoom>();
  for (const name of readdirSync(directory)) {
    if (!/^[A-Z2-9]{6}\.json$/.test(name)) continue;
    try {
      const r = DrawingRoom.load(directory, name.slice(0, -5));
      rooms.set(r.file.code, r);
    } catch {
      console.warn("绘画房间恢复失败", name);
    }
  }
  const channel = (r: DrawingRoom) => "dp:" + r.file.code;
  const broadcast = (r: DrawingRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r)) ?? []) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit("dp:update", r.snapshot(s.data.dpToken));
    }
  };
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      if (r.expire()) broadcast(r);
      if (
        Date.now() - r.file.updated > 86400000 &&
        !io.sockets.adapter.rooms.get(channel(r))?.size
      ) {
        rooms.delete(code);
        for (const suffix of [".json", ".json.ink"])
          try {
            rmSync(join(directory, code + suffix));
          } catch {}
      }
    }
  }, 1000);
  timer.unref();
  io.engine.on("close", () => clearInterval(timer));
  io.on("connection", (socket: Socket) => {
    const leave = () => {
      const r = socket.data.dpRoom as DrawingRoom | undefined,
        p = r?.player(socket.data.dpToken);
      if (r && p) {
        r.connections.get(p.id)?.delete(socket.id);
        if (r.writers.get(p.id) === socket.id) r.writers.delete(p.id);
        socket.leave(channel(r));
        broadcast(r);
      }
      socket.data.dpRoom = undefined;
      socket.data.dpToken = undefined;
    };
    const find = (code: unknown) => {
      const r = rooms.get(String(code ?? "").toUpperCase());
      if (!r) throw Error("房间不存在或已过期");
      return r;
    };
    const attach = (r: DrawingRoom, token?: string) => {
      leave();
      socket.data.dpRoom = r;
      socket.data.dpToken = r.player(token) ? token : undefined;
      const p = r.player(token);
      if (p) {
        const set = r.connections.get(p.id) ?? new Set<string>();
        set.add(socket.id);
        r.connections.set(p.id, set);
        r.writers.set(p.id, socket.id);
      }
      socket.join(channel(r));
    };
    let budgetAt = 0,
      budget = 0,
      bytes = 0;
    const handle = (event: string, fn: (req: any) => unknown) =>
      socket.on(event, (req: any, ack: any) => {
        if (typeof ack !== "function") return;
        try {
          const now = Date.now();
          if (now - budgetAt >= 1000) {
            budgetAt = now;
            budget = 0;
            bytes = 0;
          }
          const size = Buffer.byteLength(JSON.stringify(req ?? {}));
          bytes += size;
          if (++budget > 25 || size > 16384 || bytes > 50000)
            throw Error("绘画消息过快或过大");
          ack({ ok: true, ...(fn(req ?? {}) as object) });
        } catch (e) {
          ack({
            ok: false,
            error: e instanceof Error ? e.message : "操作失败",
          });
        }
      });
    const authorized = (req: any) => {
      const r = find(req.code);
      if (socket.data.dpRoom !== r || socket.data.dpToken !== req.token)
        throw Error("请重新连接");
      const p = r.player(req.token);
      if (!p || r.writers.get(p.id) !== socket.id)
        throw Error("此座位已在另一页面接管");
      if (r.expire()) broadcast(r);
      return { r, p };
    };
    handle("dp:create", (req) => {
      if (
        !["tp", "fa"].includes(req.mode) ||
        !Number.isInteger(req.count) ||
        req.count < 3 ||
        req.count > 10
      )
        throw Error("无效游戏或人数");
      if (rooms.size >= 20) throw Error("绘画房间已满");
      const code = randomBytes(4)
        .toString("hex")
        .slice(0, 6)
        .toUpperCase()
        .replaceAll("0", "Z")
        .replaceAll("1", "Y");
      if (rooms.has(code)) throw Error("请重试建房");
      const r = DrawingRoom.create(directory, req.mode, req.count, code);
      r.save();
      rooms.set(code, r);
      return { code };
    });
    handle("dp:join", (req) => {
      const r = find(req.code);
      r.expire();
      attach(r, req.token);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    handle("dp:claim", (req) => {
      const r = find(req.code);
      if (socket.data.dpRoom !== r) throw Error("先进入房间");
      if (r.player(socket.data.dpToken)) throw Error("已经入座");
      const p = r.claim(req.name);
      attach(r, p.token);
      broadcast(r);
      return { token: p.token, snapshot: r.snapshot(p.token) };
    });
    handle("dp:action", (req) => {
      const { r, p } = authorized(req);
      r.apply(p, req);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    handle("dp:edit", (req) => {
      const { r, p } = authorized(req);
      r.edit(p, req);
      broadcast(r);
      return { snapshot: r.snapshot(req.token) };
    });
    handle("dp:stroke", (req) => {
      const { r, p } = authorized(req);
      const e = r.ink(p, req);
      if (e.changed) {
        for (const id of io.sockets.adapter.rooms.get(channel(r)) ?? []) {
          const s = io.sockets.sockets.get(id);
          if (s && (r.file.mode === "fa" || s.data.dpToken === p.token))
            s.emit("dp:ink", e);
        }
        if (r.file.mode === "fa" && e.chunk.end) {
          r.file.game = act(r.file.game!, p.id, { type: "SUBMIT" }, Date.now());
          r.save();
          broadcast(r);
        }
      }
      return { revision: e.revision, scope: r.scope() };
    });
    socket.on("disconnect", leave);
  });
  return { rooms };
}
