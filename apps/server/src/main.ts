import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { attachDrawingParty } from "./drawing-rooms.ts";
import { RoomStore, errorText, type Room } from "./rooms.ts";
import { attachMagicalAthlete } from "./ma-rooms.ts";
import { attachRummikub } from "./rk-rooms.ts";
import { attachDyingMessage } from "./dm-rooms.ts";
import { attachCodenames } from "./cn-rooms.ts";
import { attachReflexRace } from "./rr-rooms.ts";
import { attachXiabaiwang } from "./xb-rooms.ts";
import { attachWitchTown } from "./wt-rooms.ts";
import {
  EVENTS,
  type Ack,
  type CommandRequest,
  type CreateRoomRequest,
  type LobbyRequest,
  type RoomSnapshot,
} from "../../../packages/shared/src/protocol.ts";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const WEB = resolve(process.env.DBD_WEB_DIR ?? join(root, "dist/web"));
const DATA = resolve(process.env.DBD_DATA_DIR ?? join(root, "data/rooms"));
const allowFixedSeed = process.env.DBD_ALLOW_FIXED_SEED === "1";
/** 外网链接（例如一键隧道生成的 https 地址）；设置后邀请二维码优先使用它 */
const PUBLIC_URL = (
  process.env.DBD_PUBLIC_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  ""
).replace(/\/+$/, "");
/** 长时间无人操作的房间自动清理（默认 24 小时）；同时存在的房间上限 */
const ROOM_IDLE_MS = Number(process.env.DBD_ROOM_IDLE_HOURS ?? 24) * 3600_000;
const MAX_ROOMS = Number(process.env.DBD_MAX_ROOMS ?? 200);
const VERSION = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || "local";

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (i): i is NonNullable<typeof i> =>
        !!i && i.family === "IPv4" && !i.internal,
    )
    .map((i) => i.address);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const store = new RoomStore(DATA);
const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  // 只私下分享给朋友：不让搜索引擎收录
  res.setHeader("x-robots-tag", "noindex, nofollow");
  if (url.pathname === "/api/health") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        version: VERSION,
        rooms: store.rooms.size,
        maRooms: maStore.rooms.size,
        cnRooms: cnStore.rooms.size,
        dmRooms: dmStore.rooms.size,
        rkRooms: rkStore.rooms.size,
        rrRooms: rrStore.rooms.size,
        xbRooms: xbStore.rooms.size,
        dpRooms: dpStore.rooms.size,
        ...(wtStore
          ? { witchTown: { milestone: "M5_PHONE_UI", rooms: wtStore.size, fullGame: true } }
          : {}),
      }),
    );
    return;
  }
  if (url.pathname === "/robots.txt") {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("User-agent: *\nDisallow: /\n");
    return;
  }
  if (url.pathname === "/api/info") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        port: PORT,
        lan: lanAddresses(),
        publicUrl: PUBLIC_URL || null,
      }),
    );
    return;
  }
  if (url.pathname === "/api/qr") {
    const text = url.searchParams.get("text") ?? "";
    QRCode.toString(text.slice(0, 300), { type: "svg", margin: 1 }).then(
      (svg) => {
        res.setHeader("content-type", "image/svg+xml");
        res.end(svg);
      },
      () => {
        res.statusCode = 400;
        res.end();
      },
    );
    return;
  }
  // 静态文件：只允许读取前端构建目录，原版资料目录不会被提供
  let file = normalize(join(WEB, decodeURIComponent(url.pathname)));
  if (
    !file.startsWith(WEB) ||
    !existsSync(file) ||
    statSync(file).isDirectory()
  )
    file = join(WEB, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.end("前端尚未构建，请先运行 npm run build");
    return;
  }
  res.setHeader(
    "content-type",
    MIME[extname(file)] ?? "application/octet-stream",
  );
  // 构建产物文件名带哈希，可长期缓存；美术等不带哈希的资源缓存 1 小时；页面本身每次都检查新版
  if (file.endsWith(".html")) res.setHeader("cache-control", "no-cache");
  else if (/-[A-Za-z0-9_-]{8}\.(js|css)$/.test(file))
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  else res.setHeader("cache-control", "public, max-age=3600");
  res.end(readFileSync(file));
});

const io = new Server(http, { cors: { origin: true } });
/** 女巫镇：M5 手机界面完成，默认开启（WT_DISABLE=1 可关闭）。张数为候选59，房间内已提示待核实。 */
const wtStore = process.env.WT_DISABLE !== "1"
  ? attachWitchTown(
      io,
      resolve(process.env.WT_DATA_DIR ?? join(DATA, "../wt-rooms")),
      { maxRooms: MAX_ROOMS, allowCandidateCounts: process.env.WT_ALLOW_CANDIDATE_COUNTS !== "0" },
    )
  : null;
const dpStore = attachDrawingParty(io, resolve(process.env.DP_DATA_DIR ?? join(DATA, "../dp-rooms")));
/** 第二款游戏：魔法运动员（独立房间与存档，事件名带 ma: 前缀） */
const dmStore = attachDyingMessage(
  io,
  resolve(process.env.DM_DATA_DIR ?? join(DATA, "../dm-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);
const rkStore = attachRummikub(
  io,
  resolve(process.env.RK_DATA_DIR ?? join(DATA, '../rk-rooms')),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS, allowFixedSeed: process.env.RK_ALLOW_FIXED_SEED === '1' },
);
const maStore = attachMagicalAthlete(
  io,
  resolve(process.env.MA_DATA_DIR ?? join(DATA, "../ma-rooms")),
  {
    maxRooms: MAX_ROOMS,
    idleMs: ROOM_IDLE_MS,
  },
);

/** 第三款游戏：行动代号（独立房间与存档，事件名带 cn: 前缀） */
const cnStore = attachCodenames(
  io,
  resolve(process.env.CN_DATA_DIR ?? join(DATA, "../cn-rooms")),
  {
    maxRooms: MAX_ROOMS,
    idleMs: ROOM_IDLE_MS,
  },
);

/** 第五款游戏：眼疾手快（独立房间与存档，事件名带 rr: 前缀） */
const rrStore = attachReflexRace(
  io,
  resolve(process.env.RR_DATA_DIR ?? join(DATA, "../rr-rooms")),
  { maxRooms: MAX_ROOMS, idleMs: ROOM_IDLE_MS },
);

const xbStore = attachXiabaiwang(io, resolve(process.env.XB_DATA_DIR ?? join(DATA, '../xb-rooms')), {maxRooms:MAX_ROOMS,idleMs:ROOM_IDLE_MS});

function broadcast(room: Room) {
  for (const s of io.sockets.adapter.rooms.get(room.code) ?? []) {
    const sock = io.sockets.sockets.get(s);
    if (sock) sock.emit(EVENTS.update, room.snapshot(sock.data.seatId ?? null));
  }
}

/** 房间里还有人连着就不清理 */
const busy = (code: string) =>
  (io.sockets.adapter.rooms.get(code)?.size ?? 0) > 0;
setInterval(() => {
  const removed = store.prune(ROOM_IDLE_MS, busy);
  if (removed) console.log(`清理闲置房间 ${removed} 个`);
}, 30 * 60_000).unref();

io.on("connection", (socket) => {
  socket.data.seatId = null as string | null;
  // 简单限流：每个连接 10 秒内最多 120 次请求，超出的直接忽略
  let windowStart = Date.now(),
    count = 0;
  socket.use((_packet, next) => {
    if (_packet[0] === "dp:stroke") return next(); // Drawing endpoint has independent limits
    const now = Date.now();
    if (now - windowStart > 10_000) ((windowStart = now), (count = 0));
    if (++count > 120) return next(new Error("RATE_LIMIT"));
    next();
  });
  const leaveSeat = () => {
    const room: Room | undefined = socket.data.room;
    if (room && socket.data.seatId) {
      room.connections.set(
        socket.data.seatId,
        Math.max(0, (room.connections.get(socket.data.seatId) ?? 1) - 1),
      );
      broadcast(room);
    }
  };
  const attach = (room: Room, seatId: string | null) => {
    if (socket.data.room && socket.data.room !== room) {
      leaveSeat();
      socket.leave(socket.data.room.code);
    }
    if (seatId && socket.data.seatId !== seatId)
      room.connections.set(seatId, (room.connections.get(seatId) ?? 0) + 1);
    socket.data.room = room;
    socket.data.seatId = seatId;
    socket.join(room.code);
  };

  socket.on(
    EVENTS.create,
    (req: CreateRoomRequest, ack: (a: Ack<{ code: string }>) => void) => {
      try {
        if (store.rooms.size >= MAX_ROOMS) {
          store.prune(ROOM_IDLE_MS, (code) => busy(code));
          if (store.rooms.size >= MAX_ROOMS) throw new Error("TOO_MANY_ROOMS");
        }
        const room = store.create(req, allowFixedSeed);
        ack({ ok: true, code: room.code });
      } catch (e) {
        ack({ ok: false, ...errorText(e) });
      }
    },
  );

  // 加入房间；带上之前保存的 token 即可断线重连回原座位
  socket.on(
    EVENTS.join,
    (
      req: { code: string; token?: string },
      ack: (a: Ack<{ snapshot: RoomSnapshot }>) => void,
    ) => {
      const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
      if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
      const me = room.idByToken(req.token);
      attach(room, me);
      ack({ ok: true, snapshot: room.snapshot(me) });
      broadcast(room);
    },
  );

  socket.on(
    EVENTS.claim,
    (
      req: { code: string; seatId?: string; name: string },
      ack: (a: Ack<{ token: string }>) => void,
    ) => {
      const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
      if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
      try {
        const token = room.claim(req.seatId, String(req.name ?? ""));
        store.save(room);
        attach(room, room.idByToken(token));
        ack({ ok: true, token });
        broadcast(room);
      } catch (e) {
        ack({ ok: false, ...errorText(e) });
      }
    },
  );

  // 房间内（对局开始前）的操作：选阵营、报名控两名、改人数、开始、选角色
  socket.on(EVENTS.lobby, (req: LobbyRequest, ack: (a: Ack) => void) => {
    const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
    try {
      room.lobby(req.token, req.action);
      store.save(room);
      ack({ ok: true });
      broadcast(room);
    } catch (e) {
      ack({ ok: false, ...errorText(e) });
    }
  });
  socket.on(EVENTS.command, (req: CommandRequest, ack: (a: Ack) => void) => {
    const room = store.rooms.get(String(req?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, ...errorText(new Error("NO_ROOM")) });
    try {
      room.apply(req.token, req.version, req.command);
      store.save(room);
      ack({ ok: true });
      broadcast(room);
    } catch (e) {
      ack({ ok: false, ...errorText(e) });
    }
  });

  socket.on("disconnect", leaveSeat);
});

http.listen(PORT, HOST, async () => {
  const urls = lanAddresses().map((ip) => `http://${ip}:${PORT}/`);
  console.log(
    "\n  桌游合集（黎明杀机 · 魔法运动员 · 行动代号 · 请留遗言 · 眼疾手快）· 联机服务器已启动（版本 " +
      VERSION +
      "）",
  );
  console.log(`  本机打开：http://localhost:${PORT}/`);
  if (PUBLIC_URL) {
    console.log(`\n  ★ 外网链接（手机流量、外地朋友都能打开）：${PUBLIC_URL}/`);
    console.log(
      "\n" +
        (await QRCode.toString(PUBLIC_URL + "/", {
          type: "terminal",
          small: true,
        })),
    );
  } else {
    for (const u of urls) console.log(`  同一 Wi-Fi 的手机打开：${u}`);
    if (urls[0])
      console.log(
        "\n" +
          (await QRCode.toString(urls[0], { type: "terminal", small: true })),
      );
  }
  if (allowFixedSeed) console.log("  [测试模式] 允许固定种子");
  console.log("  关闭此窗口即停止服务器。\n");
});
