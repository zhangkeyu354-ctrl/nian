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
import type { Server, Socket } from "socket.io";
import {
  createGame,
  act,
  viewFor,
  type State,
} from "../../../packages/xiabaiwang/src/engine.ts";
import {
  XB_EVENTS as E,
  type XBCommand,
  type XBSnapshot,
  type XBEffect,
} from "../../../packages/shared/src/xb-protocol.ts";
interface File {
  code: string;
  players: { id: string; name: string; token: string }[];
  state: State | null;
  version: number;
  discussionAt?: number;
}
export class XBRoom {
  funHits: Record<string, number> = {};
  file: File;
  connections = new Map<string, number>();
  cooldown = new Map<string, number>();
  pending = new Map<string, XBEffect>();
  constructor(code: string, file?: File) {
    this.file = file ?? { code, players: [], state: null, version: 0 };
  }
  player(token: string) {
    return this.file.players.find((p) => token && p.token === token);
  }
  join(name: string, token?: string) {
    if (token) {
      if (!this.player(token)) throw Error("身份凭证失效，请检查原设备");
      return token;
    }
    if (this.file.state) throw Error("游戏已开始，只能使用原设备身份重连");
    if (this.file.players.length >= 10) throw Error("房间已满");
    name = String(name ?? "")
      .trim()
      .slice(0, 16);
    if (!name) throw Error("请填写昵称");
    token = randomBytes(24).toString("base64url");
    this.file.players.push({ id: randomBytes(8).toString("hex"), name, token });
    this.file.version++;
    return token;
  }
  command(token: string, c: XBCommand) {
    const p = this.player(token);
    if (!p) throw Error("请先加入房间");
    if (c?.type === "REMATCH") {
      if (p.id !== this.file.players[0].id || this.file.state?.phase !== "over")
        throw Error("只有房主可在本局结束后再来一局");
      this.file.state = null;
      this.file.discussionAt = 0;
    } else if (c?.type === "START") {
      if (p.id !== this.file.players[0].id) throw Error("仅房主可以开局");
      if (this.file.state) throw Error("已开局");
      this.file.state = createGame(
        this.file.players.map(({ id, name }) => ({ id, name })),
        randomInt(2 ** 31),
      );
      this.funHits = {};
      this.file.discussionAt = Date.now();
    } else {
      if (!this.file.state) throw Error("尚未开始");
      this.file.state = act(this.file.state, p.id, c);
      if (c.type === "NEXT" && this.file.state.phase === "discussion")
        this.file.discussionAt = Date.now();
    }
    this.file.version++;
  }
  poop(token: string, target: string, now = Date.now()) {
    const p = this.player(token);
    if (!p) throw Error("请先加入房间");
    if (target === p.id) throw Error("不能扔自己，留点面子给自己吧");
    if (!this.file.players.some((x) => x.id === target))
      throw Error("目标无效");
    if (now - (this.cooldown.get(p.id) ?? -Infinity) < 2000)
      throw Error("歇两秒再扔");
    this.cooldown.set(p.id, now);
    this.funHits[target] = (this.funHits[target] ?? 0) + 1;
    const key = p.id + ":" + target;
    const event = this.pending.get(key);
    this.pending.set(key, {
      from: p.id,
      target,
      count: (event?.count ?? 0) + 1,
    });
  }
  snapshot(token?: string): XBSnapshot {
    const me = token ? (this.player(token)?.id ?? null) : null;
    return {
      code: this.file.code,
      me,
      host: this.file.players[0]?.id ?? null,
      version: this.file.version,
      players: this.file.players.map(({ id, name }) => ({
        id,
        name,
        connected: (this.connections.get(id) ?? 0) > 0,
      })),
      view: this.file.state ? viewFor(this.file.state, me) : null,
      discussionAt: this.file.discussionAt ?? 0,
      funHits: { ...this.funHits },
    };
  }
}
/** 同一HTTP/Socket.IO服务；遵循现有游戏的独立前缀、token及原子JSON存档模式。 */
export function attachXiabaiwang(
  io: Server,
  dir: string,
  opts: { maxRooms: number; idleMs: number },
) {
  mkdirSync(dir, { recursive: true });
  const rooms = new Map<string, XBRoom>();
  const touched = new Map<string, number>();
  for (const f of readdirSync(dir).filter((f) =>
    /^[A-Z0-9]{6}\.json$/.test(f),
  )) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as File;
      if (data.code + ".json" !== f || !Array.isArray(data.players))
        throw Error("无效存档");
      rooms.set(data.code, new XBRoom(data.code, data));
      try {
        rooms.get(data.code)!.funHits = JSON.parse(
          readFileSync(join(dir, data.code + ".fun.json"), "utf8"),
        );
      } catch {}
      touched.set(data.code, statSync(join(dir, f)).mtimeMs);
    } catch (e) {
      console.warn("瞎掰王存档无法恢复", f, e);
    }
  }
  const channel = (r: XBRoom) => "xb:" + r.file.code;
  const save = (r: XBRoom) => {
    const path = join(dir, r.file.code + ".json");
    writeFileSync(path + ".tmp", JSON.stringify(r.file));
    renameSync(path + ".tmp", path);
    touched.set(r.file.code, Date.now());
  };
  const broadcast = (r: XBRoom) => {
    for (const id of io.sockets.adapter.rooms.get(channel(r)) ?? []) {
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit(E.update, r.snapshot(sock.data.xbToken));
    }
  };
  const saveFun = (r: XBRoom) => {
    const path = join(dir, r.file.code + ".fun.json");
    writeFileSync(path + ".tmp", JSON.stringify(r.funHits));
    renameSync(path + ".tmp", path);
  };
  const sweep = setInterval(() => {
    for (const [code, r] of rooms) {
      if (
        !io.sockets.adapter.rooms.get(channel(r))?.size &&
        Date.now() - (touched.get(code) ?? 0) > opts.idleMs
      ) {
        rooms.delete(code);
        touched.delete(code);
        rmSync(join(dir, code + ".json"), { force: true });
        rmSync(join(dir, code + ".fun.json"), { force: true });
      }
    }
  }, 60_000);
  sweep.unref();
  // 一批最多10名玩家的事件，客户端按目标聚合并限制同时动画数。
  const effects = setInterval(() => {
    for (const r of rooms.values()) {
      if (r.pending.size) {
        io.to(channel(r)).emit(E.effects, [...r.pending.values()]);
        io.to(channel(r)).emit(E.fun, r.funHits);
        try {
          saveFun(r);
        } catch (e) {
          console.warn("娱乐统计保存失败", e);
        }
        r.pending.clear();
      }
    }
  }, 120);
  effects.unref();
  io.on("connection", (socket: Socket) => {
    let joined: XBRoom | undefined;
    let lastCreate = 0;
    const leave = () => {
      if (joined) {
        const p = joined.player(socket.data.xbToken);
        if (p)
          joined.connections.set(
            p.id,
            Math.max(0, (joined.connections.get(p.id) ?? 1) - 1),
          );
        socket.leave(channel(joined));
        broadcast(joined);
        joined = undefined;
      }
      socket.data.xbToken = undefined;
    };
    const guard = (fn: (req: any) => object) => {
      // 每类事件独立限流：娱乐事件不能阻挡紧接着的猜测或质疑。
      let lastRequest = 0;
      return (req: any, ack: any) => {
        if (typeof ack !== "function") return;
        try {
          if (Date.now() - lastRequest < 40) throw Error("操作太快，请稍候");
          lastRequest = Date.now();
          if (!req || typeof req !== "object") throw Error("请求无效");
          ack({ ok: true, ...fn(req) });
        } catch (e) {
          ack({
            ok: false,
            error: e instanceof Error ? e.message : "请求失败",
          });
        }
      };
    };
    socket.on(
      E.create,
      guard(() => {
        if (Date.now() - lastCreate < 2000) throw Error("请稍后再建房");
        if (rooms.size >= opts.maxRooms) throw Error("房间数已达上限");
        let code: string;
        do {
          code = Array.from(
            { length: 6 },
            () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
          ).join("");
        } while (rooms.has(code));
        const r = new XBRoom(code);
        rooms.set(code, r);
        save(r);
        lastCreate = Date.now();
        return { code };
      }),
    );
    socket.on(
      E.join,
      guard((req) => {
        const r = rooms.get(String(req.code ?? "").toUpperCase());
        if (!r) throw Error("房间不存在");
        // 同一连接重复加入只恢复原身份，不能借此占满座位。
        const supplied =
          req.token ?? (joined === r ? socket.data.xbToken : undefined);
        const token = r.join(req.name, supplied);
        leave();
        joined = r;
        socket.data.xbToken = token;
        const p = r.player(token)!;
        r.connections.set(p.id, (r.connections.get(p.id) ?? 0) + 1);
        socket.join(channel(r));
        save(r);
        broadcast(r);
        return { token, snapshot: r.snapshot(token) };
      }),
    );
    socket.on(
      E.command,
      guard((req) => {
        if (!joined) throw Error("请先加入房间");
        joined.command(socket.data.xbToken, req.command);
        save(joined);
        if (req.command?.type === "START" || req.command?.type === "REMATCH")
          saveFun(joined);
        broadcast(joined);
        return { snapshot: joined.snapshot(socket.data.xbToken) };
      }),
    );
    socket.on(
      E.poop,
      guard((req) => {
        if (!joined) throw Error("请先加入房间");
        joined.poop(socket.data.xbToken, String(req.target ?? ""));
        return {};
      }),
    );
    socket.on("disconnect", leave);
  });
  return {
    rooms,
    close: () => {
      clearInterval(sweep);
      clearInterval(effects);
    },
  };
}
